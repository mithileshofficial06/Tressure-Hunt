import { MongoClient, type Collection, type Db } from "mongodb";

/**
 * Mongo for the Octavius Circuit round.
 *
 * TWO COLLECTIONS, TWO OWNERS.
 *
 *   octavius_progress  — this app's own. One row per (team, level), so a team
 *                        that closes the tab on level 4 comes back to level 4.
 *   hunt_progress      — the DASHBOARD's. Written here only when all five
 *                        levels are done, to stamp the `circuit-1` round.
 *
 * Writing into another app's collection is a real coupling and is done with
 * eyes open: the alternative is a team finishing a server-verified circuit and
 * then having to tell the dashboard they finished it, which is both friction
 * and an invitation to claim the round without playing. The shapes below MUST
 * match `dashboard/src/lib/db.ts` — see HUNT_SLUGS.
 */

const DEFAULT_DB = "xplore26";

/** The round this game credits on the dashboard — matches dashboard events.ts. */
export const CIRCUIT_SLUG = "circuit-1";

/**
 * Every round the dashboard knows about, in its order.
 *
 * DUPLICATED FROM `dashboard/src/lib/events.ts`. It is needed here because
 * stamping the fifth round has to recompute the team's consolidated finish
 * time, and that calculation needs to know how many rounds there are. If the
 * dashboard's round list changes, change it here too — a stale copy means a
 * team finishes the hunt and the dashboard never notices.
 */
const HUNT_SLUGS = [
  "circuit-1",
  "hunt-blueprint",
  "hunt-room",
  "hunt-grid",
  "hunt-shiftverse",
] as const;

export interface LevelProgressDoc {
  teamNumber: number;
  levelId: number;
  solvedAt: Date;
}

const globalForMongo = globalThis as unknown as {
  _ocClient?: Promise<MongoClient>;
  _ocIndexed?: Promise<void>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set — copy .env.example to .env.local.");

  // Cached across hot reloads: without it every edit opens a fresh pool and the
  // old one is never closed, which walks an Atlas free tier into its cap.
  globalForMongo._ocClient ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  }).connect();

  return globalForMongo._ocClient;
}

async function database(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || DEFAULT_DB);
}

/**
 * Unique on (teamNumber, levelId).
 *
 * The uniqueness is the guard, not a lookup: two wins posted in the same
 * instant — a double-tap, or a team on two phones — both pass any "have they
 * solved this yet?" read before either writes. The index makes the second
 * insert a no-op instead of a second row with a later timestamp.
 */
async function ensureIndexes(): Promise<void> {
  globalForMongo._ocIndexed ??= (async () => {
    const db = await database();
    await db
      .collection<LevelProgressDoc>("octavius_progress")
      .createIndex({ teamNumber: 1, levelId: 1 }, { unique: true, name: "team_level_unique" });
  })();

  try {
    await globalForMongo._ocIndexed;
  } catch (err) {
    globalForMongo._ocIndexed = undefined;
    throw err;
  }
}

async function levelProgress(): Promise<Collection<LevelProgressDoc>> {
  await ensureIndexes();
  return (await database()).collection<LevelProgressDoc>("octavius_progress");
}

/** True when this team number exists on the dashboard's roster. */
export async function isRegistered(teamNumber: number): Promise<boolean> {
  const db = await database();
  return (await db.collection("teams").countDocuments({ teamNumber }, { limit: 1 })) > 0;
}

/** Level ids this team has already solved, ascending. */
export async function solvedLevels(teamNumber: number): Promise<number[]> {
  const col = await levelProgress();
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
  const col = await levelProgress();
  await col.updateOne(
    { teamNumber, levelId },
    { $setOnInsert: { teamNumber, levelId, solvedAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Stamp the dashboard's `circuit-1` round as solved for this team.
 *
 * Same document shape and the same first-stamp-wins rule the dashboard uses, so
 * a team that had already ticked the round by hand keeps their original time
 * and this is a no-op. Returns true if the round now reads as solved.
 */
export async function stampHuntRound(teamNumber: number): Promise<void> {
  const db = await database();
  const now = new Date();

  await db.collection("hunt_progress").updateOne(
    { teamNumber, challengeSlug: CIRCUIT_SLUG },
    {
      $setOnInsert: {
        teamNumber,
        challengeSlug: CIRCUIT_SLUG,
        unlockedAt: now,
        solvedAt: now,
        markedBy: "team",
        points: 100,
      },
    },
    { upsert: true }
  );

  await recomputeCompletion(teamNumber);
}

/**
 * Rebuild the team's consolidated finish time.
 *
 * PORTED FROM THE DASHBOARD, and it has to be: if the circuit is a team's fifth
 * round, stamping it here is the moment they finish the hunt. Without this the
 * dashboard would show 5/5 rounds and no finish time until they happened to
 * tap something else.
 *
 * Derives rather than increments, exactly as the dashboard does — fewer than
 * five solves puts the team back to unfinished, so an admin un-marking a round
 * still behaves.
 */
async function recomputeCompletion(teamNumber: number): Promise<void> {
  const db = await database();

  const rows = await db
    .collection("hunt_progress")
    .find({ teamNumber }, { projection: { challengeSlug: 1, solvedAt: 1, _id: 0 } })
    .toArray();

  const times = HUNT_SLUGS.map(
    (slug) => rows.find((r) => r.challengeSlug === slug)?.solvedAt
  ).filter((t): t is Date => t instanceof Date);

  const teams = db.collection("teams");

  if (times.length < HUNT_SLUGS.length) {
    await teams.updateOne({ teamNumber }, { $set: { completedAt: null, durationMs: null } });
    return;
  }

  const completedAt = new Date(Math.max(...times.map((t) => t.getTime())));
  const team = await teams.findOne({ teamNumber }, { projection: { registeredAt: 1 } });
  const registeredAt = team?.registeredAt;
  const durationMs =
    registeredAt instanceof Date ? completedAt.getTime() - registeredAt.getTime() : null;

  await teams.updateOne({ teamNumber }, { $set: { completedAt, durationMs } });
}

/* ── Timings and summary ────────────────────────────────────────────────────
   PORTED FROM `dashboard/src/lib/timings.ts`, and it has to be a copy: separate
   deployments, no workspace between them, and the dashboard's summary endpoint
   is unreachable from here because its session cookie is SameSite=Lax.
   KEEP IN STEP WITH THE DASHBOARD. */

export const POINTS_PER_ROUND = 100;

export interface RoundTiming {
  slug: string;
  solvedAt: string | null;
  elapsedMs: number | null;
  splitMs: number | null;
  order: number | null;
}

/**
 * One clock, never reset. If round one takes 20 minutes, round two does not
 * start from zero — it starts from 20.
 *
 * Ordered by when rounds were actually solved, not by the round list, because
 * teams take them in whatever order the floor allows; splits computed against
 * a fixed order would go negative the moment anyone worked out of sequence.
 */
export function deriveTimings(
  registeredAt: number | null,
  solved: Array<{ slug: string; solvedAt: number }>,
  allSlugs: readonly string[]
) {
  const chrono = [...solved]
    .filter((r) => Number.isFinite(r.solvedAt))
    .sort((a, b) => a.solvedAt - b.solvedAt);

  const derived = new Map<
    string,
    { elapsedMs: number | null; splitMs: number | null; order: number }
  >();
  let previous = registeredAt;
  chrono.forEach((row, i) => {
    derived.set(row.slug, {
      elapsedMs: registeredAt === null ? null : row.solvedAt - registeredAt,
      splitMs: previous === null ? null : Math.max(0, row.solvedAt - previous),
      order: i + 1,
    });
    previous = row.solvedAt;
  });

  const rounds: RoundTiming[] = allSlugs.map((slug) => {
    const row = chrono.find((r) => r.slug === slug);
    const d = row ? derived.get(slug) : undefined;
    return {
      slug,
      solvedAt: row ? new Date(row.solvedAt).toISOString() : null,
      elapsedMs: d?.elapsedMs ?? null,
      splitMs: d?.splitMs ?? null,
      order: d?.order ?? null,
    };
  });

  const solvedCount = rounds.filter((r) => r.solvedAt !== null).length;
  const last = chrono.length > 0 ? chrono[chrono.length - 1] : null;
  const finished = solvedCount === allSlugs.length;

  return {
    rounds,
    solvedCount,
    latestElapsedMs: last && registeredAt !== null ? last.solvedAt - registeredAt : null,
    totalMs: finished && last && registeredAt !== null ? last.solvedAt - registeredAt : null,
    completedAt: finished && last ? new Date(last.solvedAt).toISOString() : null,
  };
}

/** Points and timings for the finish dialogue. */
export async function teamSummary(teamNumber: number) {
  const db = await database();
  const team = await db.collection("teams").findOne({ teamNumber });
  if (!team) return null;

  const rows = await db
    .collection("hunt_progress")
    .find({ teamNumber }, { projection: { challengeSlug: 1, solvedAt: 1, _id: 0 } })
    .toArray();

  const registeredAt = team.registeredAt instanceof Date ? team.registeredAt.getTime() : null;

  const t = deriveTimings(
    registeredAt,
    rows
      .filter((r) => r.solvedAt instanceof Date)
      .map((r) => ({ slug: r.challengeSlug as string, solvedAt: (r.solvedAt as Date).getTime() })),
    HUNT_SLUGS
  );

  return {
    teamNumber,
    rounds: t.rounds,
    solvedCount: t.solvedCount,
    totalRounds: HUNT_SLUGS.length,
    points: t.solvedCount * POINTS_PER_ROUND,
    totalPoints: HUNT_SLUGS.length * POINTS_PER_ROUND,
    latestElapsedMs: t.latestElapsedMs,
    totalMs: t.totalMs,
    completedAt: t.completedAt,
  };
}

/** Close the pool — for scripts, which otherwise hang on an open socket. */
export async function closeConnection(): Promise<void> {
  if (globalForMongo._ocClient) {
    await (await globalForMongo._ocClient).close();
    globalForMongo._ocClient = undefined;
    globalForMongo._ocIndexed = undefined;
  }
}
