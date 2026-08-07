import type { BlueprintTeamDoc } from "../db";
import { blueprintTeams, markRoundSolved, recomputeCompletion } from "../db";
import { BLUEPRINT_SLUG } from "../events";
import { variantNumberFor, type BlueprintStatus } from "./variants";
import { isCorrectCode } from "./variants.server";

/**
 * Blueprint Recovery's state machine, in Mongo.
 *
 * PORTED FROM three Postgres functions — `validate_checkpoint`,
 * `coordinator_action` and `get_revealed_location` — plus the RLS policies that
 * constrained which status transitions the anon role could make. Postgres
 * enforced those rules in the database; here they are enforced in this module,
 * and the route handlers are the only callers.
 *
 * THE STATE MACHINE, and why a coordinator sits in the middle of it:
 *
 *   not_started        nothing yet, or a coordinator reset them
 *        │  start()
 *   in_progress        briefed; walking to their sector
 *        │  markAwaitingReveal()   ← the team says "we are here"
 *   awaiting_reveal    waiting on a human
 *        │  coordinatorAction('reveal')   ← A COORDINATOR, not the team
 *   checkpoint_a_done  location released; they can enter the code
 *        │  submitCode()  ← server compares against variants.server.ts
 *   complete           stamped in hunt_progress
 *
 * The reveal step is what makes this a physical round rather than a form: the
 * team cannot advance past `awaiting_reveal` themselves, no matter what they
 * post. That was an RLS policy (`anon_update_allowed_transitions`, migration
 * 004) and it is `assertTeamTransition` below.
 */

/** The transitions a TEAM may make. Everything else needs a coordinator. */
const TEAM_ALLOWED: Record<string, BlueprintStatus[]> = {
  // Re-entry after a coordinator reset, and first entry.
  not_started: ["in_progress"],
  in_progress: ["awaiting_reveal"],
};

function blank(teamNumber: number): BlueprintTeamDoc {
  return {
    teamNumber,
    variantNumber: variantNumberFor(teamNumber),
    status: "not_started",
    startTime: null,
    checkpointATime: null,
    completeTime: null,
    wrongAttemptsA: 0,
    wrongAttemptsB: 0,
  };
}

/**
 * This team's row, creating a blank one if it has never played.
 *
 * `$setOnInsert` + upsert rather than find-then-insert: two tabs opening the
 * round at once both miss on the read and both insert otherwise, and the unique
 * index would turn the loser into an error rather than a no-op.
 */
export async function getOrCreate(teamNumber: number): Promise<BlueprintTeamDoc> {
  const col = await blueprintTeams();
  const doc = await col.findOneAndUpdate(
    { teamNumber },
    { $setOnInsert: blank(teamNumber) },
    { upsert: true, returnDocument: "after", projection: { _id: 0 } }
  );
  return doc ?? blank(teamNumber);
}

export async function findRow(teamNumber: number): Promise<BlueprintTeamDoc | null> {
  const col = await blueprintTeams();
  return col.findOne({ teamNumber }, { projection: { _id: 0 } });
}

/** Begin the round. Idempotent — the first start time stands. */
export async function start(teamNumber: number): Promise<BlueprintTeamDoc> {
  const row = await getOrCreate(teamNumber);

  // Already past the beginning: resuming, not restarting. Never rewind, and
  // never move `startTime`, which is what their duration is measured from.
  if (row.status !== "not_started") return row;

  const col = await blueprintTeams();
  const updated = await col.findOneAndUpdate(
    // Filtered on the status we read, so two tabs starting at once produce one
    // write and one no-op rather than two clocks.
    { teamNumber, status: "not_started" },
    { $set: { status: "in_progress", startTime: row.startTime ?? new Date() } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
  return updated ?? (await findRow(teamNumber)) ?? row;
}

/**
 * The team reports they have reached their sector.
 *
 * Guarded by `TEAM_ALLOWED`: this is the furthest a team can move itself. A
 * team sitting in `awaiting_reveal` that posts again gets a no-op, and a team
 * in `checkpoint_a_done` cannot bounce back to ask for a second reveal.
 */
export async function markAwaitingReveal(teamNumber: number): Promise<BlueprintTeamDoc> {
  const row = await getOrCreate(teamNumber);
  if (!TEAM_ALLOWED[row.status]?.includes("awaiting_reveal")) return row;

  const col = await blueprintTeams();
  const updated = await col.findOneAndUpdate(
    { teamNumber, status: "in_progress" },
    { $set: { status: "awaiting_reveal" } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
  return updated ?? row;
}

export type CoordinatorAction = "reveal" | "reset" | "override";

/**
 * A coordinator moves a team. ONLY reachable behind the admin cookie.
 *
 * Deliberately unguarded on the current status, matching migration 010's
 * "unrestricted state transitions for coordinator override/reset actions". A
 * coordinator is fixing something that has already gone wrong — a team that
 * walked off without pressing the button, a reveal given to the wrong number —
 * and a state machine that argues with them is a state machine that gets worked
 * around with a database client at 4pm.
 */
export async function coordinatorAction(
  teamNumber: number,
  action: CoordinatorAction
): Promise<BlueprintTeamDoc> {
  await getOrCreate(teamNumber);
  const col = await blueprintTeams();
  const now = new Date();

  if (action === "reset") {
    await col.updateOne(
      { teamNumber },
      {
        $set: {
          status: "not_started",
          startTime: null,
          checkpointATime: null,
          completeTime: null,
          wrongAttemptsA: 0,
          wrongAttemptsB: 0,
        },
      }
    );
  } else if (action === "reveal") {
    const row = await findRow(teamNumber);
    await col.updateOne(
      { teamNumber },
      {
        $set: {
          status: "checkpoint_a_done",
          checkpointATime: row?.checkpointATime ?? now,
          // A reveal on a team that never pressed "we are here" still needs a
          // clock to measure from.
          startTime: row?.startTime ?? now,
        },
      }
    );
  } else {
    const row = await findRow(teamNumber);
    await col.updateOne(
      { teamNumber },
      {
        $set: {
          status: "complete",
          startTime: row?.startTime ?? now,
          checkpointATime: row?.checkpointATime ?? now,
          completeTime: now,
        },
      }
    );
  }

  // An override is a solve, and the hunt board has to agree. `markRoundSolved`
  // is first-write-wins, so overriding a team that already finished leaves
  // their original time alone.
  if (action === "override") {
    await markRoundSolved(teamNumber, BLUEPRINT_SLUG, "admin");
    await recomputeCompletion(teamNumber);
  }

  return (await findRow(teamNumber)) ?? blank(teamNumber);
}

export type CodeResult =
  | { correct: true; row: BlueprintTeamDoc }
  | { correct: false; error?: string; row: BlueprintTeamDoc };

/**
 * Checkpoint B — the access code from the physical card.
 *
 * THE ORDER OF THESE CHECKS IS THE SECURITY. Status is verified BEFORE the code
 * is compared, so a team that has not been given a location cannot brute-force
 * the code from the briefing screen and skip the walk entirely. That was
 * `IF v_team.status <> 'checkpoint_a_done'` in the RPC, and it is the one rule
 * that makes this a physical round.
 */
export async function submitCode(teamNumber: number, submitted: string): Promise<CodeResult> {
  const row = await getOrCreate(teamNumber);

  if (row.status === "complete") {
    return { correct: false, error: "Your team has already completed this round.", row };
  }
  if (row.status !== "checkpoint_a_done") {
    return {
      correct: false,
      error: "A coordinator has to release your location before the code will be accepted.",
      row,
    };
  }

  const col = await blueprintTeams();

  if (!isCorrectCode(teamNumber, submitted)) {
    await col.updateOne({ teamNumber }, { $inc: { wrongAttemptsB: 1 } });
    return { correct: false, row: (await findRow(teamNumber)) ?? row };
  }

  await col.updateOne(
    { teamNumber, status: { $ne: "complete" } },
    { $set: { status: "complete", completeTime: new Date() } }
  );

  // The hunt board is the source of truth for scoring and timings, so the round
  // credits itself the same way the grid, room, circuit and shiftverse do.
  await markRoundSolved(teamNumber, BLUEPRINT_SLUG, "team");
  await recomputeCompletion(teamNumber);

  return { correct: true, row: (await findRow(teamNumber)) ?? row };
}

/** Every team's row, for the coordinator board. Admin-gated at the route. */
export async function allBlueprintTeams(): Promise<BlueprintTeamDoc[]> {
  const col = await blueprintTeams();
  return col.find({}, { projection: { _id: 0 }, sort: { teamNumber: 1 } }).toArray();
}
