import { CIRCUIT_SLUG } from "../events";
import {
  findTeam,
  markRoundSolved,
  octaviusProgress,
  recomputeCompletion,
} from "../db";
import { LEVELS } from "./levels";

/**
 * Octavius Circuit's per-level progress.
 *
 * WHY THIS IS THIN. The standalone app carried its own `src/lib/db.ts` — a
 * second MongoClient, a second index-bootstrap, a second copy of the round list
 * and of `deriveTimings`, and its own `stampHuntRound` that hand-wrote the same
 * `hunt_progress` document shape the dashboard writes. All of that existed
 * because it was a different process talking to the same cluster.
 *
 * In one app it is not just redundant, it is a hazard: two clients means two
 * connection pools against the same Atlas limit, and a duplicated round list
 * means the day someone adds a sixth round, teams finish the hunt and the
 * circuit's copy never notices. So the only thing left here is the one
 * collection nothing else owns — `octavius_progress` — and everything shared
 * routes through `lib/db.ts`.
 */

/** Level ids this team has already solved, ascending. */
export async function solvedLevels(teamNumber: number): Promise<number[]> {
  const col = await octaviusProgress();
  const rows = await col
    .find({ teamNumber }, { projection: { levelId: 1, _id: 0 }, sort: { levelId: 1 } })
    .toArray();
  return rows.map((r) => r.levelId);
}

/**
 * Record a solved level. Idempotent — the first solve's timestamp stands.
 *
 * `$setOnInsert` rather than `$set` so replaying a win (a retry, a refresh, a
 * team going back to an already-cleared level) cannot move the time it was
 * first cleared.
 */
export async function recordLevelSolved(teamNumber: number, levelId: number): Promise<void> {
  const col = await octaviusProgress();
  await col.updateOne(
    { teamNumber, levelId },
    { $setOnInsert: { teamNumber, levelId, solvedAt: new Date() } },
    { upsert: true }
  );
}

/** True when this team number exists on the dashboard's roster. */
export async function isRegistered(teamNumber: number): Promise<boolean> {
  return (await findTeam(teamNumber)) !== null;
}

/**
 * Credit the dashboard round, once all five levels are cleared.
 *
 * Goes through the SAME `markRoundSolved` / `recomputeCompletion` pair the grid
 * and the room use, rather than writing the progress document itself. That is
 * the whole benefit of being one app: there is one definition of what a solved
 * round is and one place that recomputes a team's finish, so the five rounds
 * cannot drift apart in how they credit themselves.
 */
export async function stampHuntRound(teamNumber: number): Promise<void> {
  await markRoundSolved(teamNumber, CIRCUIT_SLUG, "team");
  await recomputeCompletion(teamNumber);
}

/** Has this team cleared every level? */
export function allLevelsDone(solved: number[]): boolean {
  return LEVELS.every((l) => solved.includes(l.id));
}
