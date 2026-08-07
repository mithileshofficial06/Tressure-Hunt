import { MongoClient, type Collection, type Db } from "mongodb";
import { EVENT_SLUGS, POINTS_PER_ROUND } from "./events";
import { deriveTimings, type RoundTiming } from "./timings";

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
 * One row per (team, circuit level).
 *
 * Octavius Circuit is the only round with progress BELOW the round: it is five
 * levels, and the tile is credited when all five are cleared. `hunt_progress`
 * has no room for that (one row per round, by design), so the per-level detail
 * lives here and `circuit-1` is stamped in `hunt_progress` like any other round
 * once the set is complete.
 */
export interface LevelProgressDoc {
  teamNumber: number;
  levelId: number;
  solvedAt: Date;
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
    //
    // This is also what decides how a DOWN database FEELS to sixty teams. Every
    // request that touches Mongo blocks for this long before it gives up, and a
    // browser only opens ~6 connections per origin — so with the database
    // unreachable, a few slow tabs are enough to queue everything behind them
    // and the site stops opening at all. Shorter means a team gets "can't reach
    // the database" quickly instead of a page that hangs.
    serverSelectionTimeoutMS: 5000,

    /**
     * POOL SIZING, AND WHY IT DEPENDS ON WHERE THIS IS RUNNING.
     *
     * These two deployments want opposite things, and getting it backwards is
     * how a working app falls over at 60 teams.
     *
     * ONE LONG-LIVED SERVER (`next start`, a laptop on the venue LAN): there is
     * exactly one pool for the whole event, so it should be generous, and
     * keeping a few sockets warm means the first team to register after a quiet
     * spell doesn't pay for a TLS handshake.
     *
     * SERVERLESS (Vercel): every function instance gets its OWN pool, and sixty
     * teams will spread across many instances. A large floor multiplies — 20
     * instances holding 5 idle sockets each is 100 connections doing nothing,
     * against an Atlas M0's 500-connection ceiling, and those idle sockets are
     * what run a free tier out of connections mid-event. So: no floor at all,
     * and a modest cap per instance. Instances scale out; pools should not.
     */
    ...(process.env.VERCEL
      ? { maxPoolSize: 10, minPoolSize: 0 }
      : { maxPoolSize: 100, minPoolSize: 5 }),

    // Don't queue forever behind an exhausted pool; surface it as an error the
    // route can turn into a retry message.
    waitQueueTimeoutMS: 8000,
  })
    .connect()
    /**
     * DO NOT CACHE A FAILED CONNECT.
     *
     * `??=` stores the promise, not the client — so a single rejection used to
     * be remembered for the life of the process. One network blip at startup
     * (or an Atlas IP allowlist that had not been updated yet) and EVERY later
     * request awaited that same rejected promise and failed instantly, forever,
     * with no way back except restarting the server. During an event that is
     * the difference between "the database came back and so did the site" and
     * "the site is down until someone notices and restarts it".
     *
     * Clearing the slot on failure means the next request builds a fresh client
     * and tries again. Same reasoning as `ensureIndexes` below, which already
     * did this — the connection was the one that got missed.
     */
    .catch((err) => {
      globalForMongo._thClient = undefined;
      throw err;
    });

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
    // Octavius Circuit's per-level rows. Same reasoning as the two above: two
    // wins posted in the same instant — a double-tap, or a team on two phones —
    // both pass any "have they solved this yet?" read before either writes. The
    // index makes the second insert a no-op rather than a second row carrying a
    // later timestamp.
    await database
      .collection<LevelProgressDoc>("octavius_progress")
      .createIndex({ teamNumber: 1, levelId: 1 }, { unique: true, name: "team_level_unique" });
    // SHIFT://VERSE's seeded puzzles. Unique on teamNumber so a re-run of the
    // seed can never leave a team with two different words.
    await database
      .collection("shiftverse_teams")
      .createIndex({ teamNumber: 1 }, { unique: true, name: "teamNumber_unique" });
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

/** Octavius Circuit's per-level rows. See `lib/octovius/progress.ts`. */
export async function octaviusProgress(): Promise<Collection<LevelProgressDoc>> {
  await ensureIndexes();
  return (await db()).collection<LevelProgressDoc>("octavius_progress");
}

/**
 * SHIFT://VERSE's per-team puzzle rows. See `lib/shiftverse/teams.ts`.
 *
 * Typed loosely here on purpose — the shape lives next to the code that uses
 * it, and importing it back into this file would make the round's data model a
 * dependency of the roster's.
 */
export async function shiftverseTeams(): Promise<
  Collection<{
    teamNumber: number;
    plaintextWord: string;
    encryptedWord: string;
    shiftKey: number;
    perLetterGuesses: number[];
    startTime: number;
  }>
> {
  await ensureIndexes();
  return (await db()).collection("shiftverse_teams");
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

/* ── Read model ────────────────────────────────────────────────────────── */

export type TeamRoundView = RoundTiming;

export interface TeamView {
  teamNumber: number;
  members: string[];
  registeredAt: string;
  completedAt: string | null;
  durationMs: number | null;
  solvedCount: number;
  /** Cumulative clock at the most recent solve, even mid-hunt. */
  latestElapsedMs: number | null;
  rounds: RoundTiming[];
}

/**
 * One team's standing, for the finish dialogue a round shows on its way out.
 *
 * Points are counted from the ROUND LIST, not from the progress rows, so a
 * stale row for a retired slug cannot inflate a score.
 */
export interface TeamSummary {
  teamNumber: number;
  registeredAt: string;
  rounds: RoundTiming[];
  solvedCount: number;
  totalRounds: number;
  points: number;
  totalPoints: number;
  latestElapsedMs: number | null;
  totalMs: number | null;
  completedAt: string | null;
}

export async function teamSummary(teamNumber: number): Promise<TeamSummary | null> {
  const [team, rows] = await Promise.all([findTeam(teamNumber), teamProgress(teamNumber)]);
  if (!team) return null;

  const registeredAt = team.registeredAt?.getTime() ?? null;
  const t = deriveTimings(
    registeredAt,
    rows
      .filter((r) => r.solvedAt instanceof Date)
      .map((r) => ({
        slug: r.challengeSlug,
        solvedAt: r.solvedAt!.getTime(),
        markedBy: r.markedBy,
      })),
    EVENT_SLUGS
  );

  return {
    teamNumber,
    registeredAt: team.registeredAt.toISOString(),
    rounds: t.rounds,
    solvedCount: t.solvedCount,
    totalRounds: EVENT_SLUGS.length,
    points: t.solvedCount * POINTS_PER_ROUND,
    totalPoints: EVENT_SLUGS.length * POINTS_PER_ROUND,
    latestElapsedMs: t.latestElapsedMs,
    totalMs: t.totalMs,
    completedAt: t.completedAt,
  };
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

    // Cumulative elapsed and per-round splits are DERIVED here, not stored.
    // They are a pure function of registeredAt and the solve stamps, so an
    // admin override recomputes every downstream number for free — a stored
    // copy would need its own invalidation and would eventually disagree with
    // the timestamps sitting next to it.
    const t = deriveTimings(
      team.registeredAt?.getTime() ?? null,
      rows
        .filter((r) => r.solvedAt instanceof Date)
        .map((r) => ({
          slug: r.challengeSlug,
          solvedAt: r.solvedAt!.getTime(),
          markedBy: r.markedBy,
        })),
      EVENT_SLUGS
    );

    return {
      teamNumber: team.teamNumber,
      members: team.members ?? [],
      registeredAt: team.registeredAt.toISOString(),
      completedAt: team.completedAt ? team.completedAt.toISOString() : null,
      durationMs: team.durationMs ?? null,
      solvedCount: t.solvedCount,
      latestElapsedMs: t.latestElapsedMs,
      rounds: t.rounds,
    };
  });
}
