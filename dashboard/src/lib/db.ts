import { MongoClient, type Collection, type Db } from "mongodb";
import { EVENT_SLUGS } from "./events";

/**
 * Mongo, and the two indexes that keep the event honest.
 *
 * THE UNIQUENESS RULE IS THE INDEX, NOT A CHECK. The obvious implementation is
 * "findOne({ teamNumber }), and if nothing comes back, insert" — and it is
 * wrong. Two people on two phones tapping CLAIM on 14 at the same moment both
 * run the find before either runs the insert, both see nothing, and both
 * insert. You now have two team 14s and no error anywhere. At a live event with
 * sixty teams registering in the same two minutes that is not a rare race, it
 * is the expected one.
 *
 * A unique index moves the decision into the write itself: Mongo applies the
 * two inserts in some order and the second one fails with error 11000. Exactly
 * one team gets the number, and the loser gets a clean "already taken" instead
 * of silent corruption. `registerTeam` below is built around catching that
 * error rather than around avoiding it.
 *
 * The same reasoning covers `hunt_progress`: one row per (team, round), so a
 * double-tap on "Mark complete" cannot produce two solve rows with two
 * different timestamps and leave nobody able to say which one counted.
 */

const DEFAULT_DB = "xplore26";

export interface TeamDoc {
  teamNumber: number;
  /** 3 or 4 names, in the order the team typed them. */
  members: string[];
  registeredAt: Date;
  /**
   * The consolidated finish: when the team's FIFTH round was stamped.
   *
   * Derived, not authoritative — `recomputeCompletion` rebuilds it from the
   * progress rows after every change. Stored anyway so the admin table can sort
   * and the leaderboard can render without recomputing sixty teams on each
   * poll, and so an admin un-marking a round correctly un-finishes the team.
   */
  completedAt: Date | null;
  /** completedAt − registeredAt, in ms. Null until the team finishes. */
  durationMs: number | null;
}

/** One row per (team, round). Shaped to match SympoApp's `hunt_progress`. */
export interface HuntProgressDoc {
  teamNumber: number;
  challengeSlug: string;
  unlockedAt?: Date | null;
  solvedAt: Date | null;
  /** Who stamped it — teams mark their own, admins can override. */
  markedBy: "team" | "admin";
  points?: number;
}

/**
 * Thrown when MONGODB_URI is absent.
 *
 * A distinct type so routes and pages can tell "you haven't added .env.local
 * yet" apart from "the database is down", and show the setup panel for the
 * first without swallowing the second.
 */
export class NotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not set — copy .env.example to .env.local and fill it in.");
    this.name = "NotConfiguredError";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * One client for the whole process, cached across hot reloads.
 *
 * Next's dev server re-evaluates modules on every edit; without the global
 * stash each reload opens a fresh pool and the old one is never closed, which
 * walks an Atlas free tier into its connection cap in about a dozen saves.
 */
const globalForMongo = globalThis as unknown as {
  _thClient?: Promise<MongoClient>;
  _thIndexed?: Promise<void>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new NotConfiguredError();

  globalForMongo._thClient ??= new MongoClient(uri, {
    // Fail fast rather than hanging the page for 30s on a bad URI — the
    // registration screen would rather say "can't reach the database".
    serverSelectionTimeoutMS: 8000,
  }).connect();

  return globalForMongo._thClient;
}

async function db(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || DEFAULT_DB);
}

/**
 * Create the indexes once per process.
 *
 * Idempotent — createIndex on an index that already exists is a no-op, so this
 * is safe to call on every request. Awaited before the first insert rather than
 * left to a migration step, because an app that silently runs without its
 * uniqueness constraints is the exact failure this file exists to prevent.
 */
async function ensureIndexes(): Promise<void> {
  globalForMongo._thIndexed ??= (async () => {
    const database = await db();
    await database
      .collection<TeamDoc>("teams")
      .createIndex({ teamNumber: 1 }, { unique: true, name: "teamNumber_unique" });
    await database
      .collection<HuntProgressDoc>("hunt_progress")
      .createIndex(
        { teamNumber: 1, challengeSlug: 1 },
        { unique: true, name: "team_challenge_unique" }
      );
  })();

  try {
    await globalForMongo._thIndexed;
  } catch (err) {
    // Don't cache a failed attempt — a transient network blip at startup would
    // otherwise leave every later request believing the index exists.
    globalForMongo._thIndexed = undefined;
    throw err;
  }
}

export async function teams(): Promise<Collection<TeamDoc>> {
  await ensureIndexes();
  return (await db()).collection<TeamDoc>("teams");
}

export async function huntProgress(): Promise<Collection<HuntProgressDoc>> {
  await ensureIndexes();
  return (await db()).collection<HuntProgressDoc>("hunt_progress");
}

/* ── Registration ──────────────────────────────────────────────────────── */

export type ClaimResult =
  | { ok: true; teamNumber: number }
  | { ok: false; reason: "taken" };

/**
 * Register a team, or fail because someone else already has the number.
 *
 * The insert IS the check. 11000 is Mongo's duplicate-key code, and catching it
 * here is what makes two simultaneous claims resolve to one winner. Any other
 * error is rethrown — a connection failure must not be reported to a team as
 * "that number is taken".
 */
export async function registerTeam(
  teamNumber: number,
  members: string[]
): Promise<ClaimResult> {
  const collection = await teams();
  try {
    await collection.insertOne({
      teamNumber,
      members,
      registeredAt: new Date(),
      completedAt: null,
      durationMs: null,
    });
    return { ok: true, teamNumber };
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
}

/** Every number already spoken for, ascending. Drives the grid on the entry screen. */
export async function takenNumbers(): Promise<number[]> {
  const collection = await teams();
  const docs = await collection
    .find({}, { projection: { teamNumber: 1, _id: 0 }, sort: { teamNumber: 1 } })
    .toArray();
  return docs.map((d) => d.teamNumber);
}

export async function findTeam(teamNumber: number): Promise<TeamDoc | null> {
  const collection = await teams();
  return collection.findOne({ teamNumber }, { projection: { _id: 0 } });
}

/* ── Progress ──────────────────────────────────────────────────────────── */

/**
 * Stamp a round as solved. Returns the timestamp that actually counts.
 *
 * `$setOnInsert` on solvedAt is the important bit: re-marking a round that is
 * already done must NOT move its timestamp. Otherwise a team that taps the
 * button again at the end of the day rewrites its own finish time, and the
 * leaderboard silently reorders. The first stamp wins; later taps are no-ops
 * that return the original time.
 */
export async function markRoundSolved(
  teamNumber: number,
  challengeSlug: string,
  markedBy: "team" | "admin",
  points = 100
): Promise<Date> {
  const collection = await huntProgress();
  const now = new Date();

  const doc = await collection.findOneAndUpdate(
    { teamNumber, challengeSlug },
    {
      $setOnInsert: {
        teamNumber,
        challengeSlug,
        unlockedAt: now,
        solvedAt: now,
        markedBy,
        points,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return doc?.solvedAt ?? now;
}

/**
 * Un-stamp a round. Admin-only upstream — this is the override.
 *
 * Deletes the row rather than nulling solvedAt so the collection never
 * accumulates half-rows that read as "unlocked but not solved" and confuse the
 * count in `recomputeCompletion`.
 */
export async function unmarkRound(teamNumber: number, challengeSlug: string): Promise<void> {
  const collection = await huntProgress();
  await collection.deleteOne({ teamNumber, challengeSlug });
}

export async function teamProgress(teamNumber: number): Promise<HuntProgressDoc[]> {
  const collection = await huntProgress();
  return collection.find({ teamNumber }, { projection: { _id: 0 } }).toArray();
}

/**
 * Rebuild a team's consolidated finish time from its progress rows.
 *
 * Called after every mark and every un-mark, and deliberately derives rather
 * than increments: an admin who un-marks round 3 on a "finished" team must see
 * that team drop off the leaderboard, which a "set completedAt when the counter
 * hits five" implementation would never do.
 *
 * The finish time is the LATEST solve, not the moment the fifth tap happened —
 * so an admin correcting a missed stamp hours later doesn't invent a finish
 * time the team never earned.
 */
export async function recomputeCompletion(teamNumber: number): Promise<void> {
  const rows = await teamProgress(teamNumber);

  const solvedTimes = EVENT_SLUGS.map(
    (slug) => rows.find((r) => r.challengeSlug === slug)?.solvedAt
  ).filter((t): t is Date => t instanceof Date);

  const collection = await teams();

  if (solvedTimes.length < EVENT_SLUGS.length) {
    await collection.updateOne(
      { teamNumber },
      { $set: { completedAt: null, durationMs: null } }
    );
    return;
  }

  const completedAt = new Date(Math.max(...solvedTimes.map((t) => t.getTime())));
  const team = await collection.findOne({ teamNumber }, { projection: { registeredAt: 1 } });
  const durationMs = team?.registeredAt
    ? completedAt.getTime() - team.registeredAt.getTime()
    : null;

  await collection.updateOne({ teamNumber }, { $set: { completedAt, durationMs } });
}

/* ── Admin read model ──────────────────────────────────────────────────── */

export interface TeamRoundView {
  slug: string;
  solvedAt: string | null;
  markedBy: "team" | "admin" | null;
}

export interface TeamView {
  teamNumber: number;
  members: string[];
  registeredAt: string;
  completedAt: string | null;
  durationMs: number | null;
  solvedCount: number;
  rounds: TeamRoundView[];
}

/**
 * Every team, every round, every timestamp — the admin table in one payload.
 *
 * Two queries and a join in JS rather than an aggregation pipeline: at sixty
 * teams and five rounds this is three hundred rows, the join is trivial, and
 * the version you can read at 2am during an event is worth more than the
 * version that pushes the work to the server.
 *
 * Dates are serialised to ISO strings here because this crosses the server →
 * client boundary, and formatting is left to the browser so timestamps render
 * in the coordinator's own timezone.
 */
export async function allTeamsWithProgress(): Promise<TeamView[]> {
  const [teamDocs, progressDocs] = await Promise.all([
    (await teams())
      .find({}, { projection: { _id: 0 }, sort: { teamNumber: 1 } })
      .toArray(),
    (await huntProgress()).find({}, { projection: { _id: 0 } }).toArray(),
  ]);

  const byTeam = new Map<number, HuntProgressDoc[]>();
  for (const row of progressDocs) {
    const list = byTeam.get(row.teamNumber);
    if (list) list.push(row);
    else byTeam.set(row.teamNumber, [row]);
  }

  return teamDocs.map((team) => {
    const rows = byTeam.get(team.teamNumber) ?? [];
    const rounds: TeamRoundView[] = EVENT_SLUGS.map((slug) => {
      const row = rows.find((r) => r.challengeSlug === slug);
      return {
        slug,
        solvedAt: row?.solvedAt ? row.solvedAt.toISOString() : null,
        markedBy: row?.solvedAt ? row.markedBy : null,
      };
    });

    return {
      teamNumber: team.teamNumber,
      members: team.members ?? [],
      registeredAt: team.registeredAt.toISOString(),
      completedAt: team.completedAt ? team.completedAt.toISOString() : null,
      durationMs: team.durationMs ?? null,
      solvedCount: rounds.filter((r) => r.solvedAt !== null).length,
      rounds,
    };
  });
}
