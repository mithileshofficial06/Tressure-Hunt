import { MongoClient, type Db } from 'mongodb';

/**
 * This app's half of the shared hunt bookkeeping.
 *
 * PORTED FROM `dashboard/src/lib/timings.ts` AND `dashboard/src/lib/db.ts`, and
 * it has to be a copy: these are separate deployments with separate
 * package.json files and no workspace between them, and the dashboard's summary
 * endpoint is unreachable from here — its session cookie is SameSite=Lax, so a
 * cross-site request from :3001 would not carry it even with CORS opened up.
 *
 * KEEP `HUNT_SLUGS`, `POINTS_PER_ROUND` AND `deriveTimings` IN STEP WITH THE
 * DASHBOARD. A stale round list here means a team finishes the hunt and the
 * finish dialogue disagrees with the board they came from.
 */

const DEFAULT_DB = 'xplore26';

/** This app's round, as the dashboard names it. */
export const SHIFTVERSE_SLUG = 'hunt-shiftverse';

export const HUNT_SLUGS = [
  'circuit-1',
  'hunt-blueprint',
  'hunt-room',
  'hunt-grid',
  'hunt-shiftverse',
] as const;

export const POINTS_PER_ROUND = 100;

/* ── Connection ─────────────────────────────────────────────────────────── */

const globalForMongo = globalThis as unknown as { _svHuntClient?: Promise<MongoClient> };

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  globalForMongo._svHuntClient ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  }).connect();
  return globalForMongo._svHuntClient;
}

async function database(): Promise<Db> {
  return (await clientPromise()).db(process.env.MONGODB_DB || DEFAULT_DB);
}

/* ── Timings ────────────────────────────────────────────────────────────── */

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
 * teams take them in whatever order the floor allows.
 */
export function deriveTimings(
  registeredAt: number | null,
  solved: Array<{ slug: string; solvedAt: number }>,
  allSlugs: readonly string[]
) {
  const chrono = [...solved]
    .filter((r) => Number.isFinite(r.solvedAt))
    .sort((a, b) => a.solvedAt - b.solvedAt);

  const derived = new Map<string, { elapsedMs: number | null; splitMs: number | null; order: number }>();
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

/* ── Writing progress ───────────────────────────────────────────────────── */

/**
 * Stamp this round solved for a team, then rebuild their finish time.
 *
 * `$setOnInsert`, so the FIRST solve's timestamp stands. A team replaying a
 * puzzle they already beat cannot move their own clock, and a team that had
 * already ticked the round by hand on the dashboard keeps their original time.
 */
export async function stampRoundSolved(teamNumber: number): Promise<void> {
  const db = await database();
  const now = new Date();

  await db.collection('hunt_progress').updateOne(
    { teamNumber, challengeSlug: SHIFTVERSE_SLUG },
    {
      $setOnInsert: {
        teamNumber,
        challengeSlug: SHIFTVERSE_SLUG,
        unlockedAt: now,
        solvedAt: now,
        markedBy: 'team',
        points: POINTS_PER_ROUND,
      },
    },
    { upsert: true }
  );

  await recomputeCompletion(teamNumber);
}

/**
 * Rebuild the team's consolidated finish, derived rather than incremented —
 * the same rule the dashboard uses, so the two can never disagree.
 */
async function recomputeCompletion(teamNumber: number): Promise<void> {
  const db = await database();
  const rows = await db
    .collection('hunt_progress')
    .find({ teamNumber }, { projection: { challengeSlug: 1, solvedAt: 1, _id: 0 } })
    .toArray();

  const times = HUNT_SLUGS.map(
    (slug) => rows.find((r) => r.challengeSlug === slug)?.solvedAt
  ).filter((t): t is Date => t instanceof Date);

  const teams = db.collection('teams');

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

/* ── Reading ────────────────────────────────────────────────────────────── */

export async function isRegistered(teamNumber: number): Promise<boolean> {
  const db = await database();
  return (await db.collection('teams').countDocuments({ teamNumber }, { limit: 1 })) > 0;
}

/** Has this team already cleared this round? Gates the Finish button. */
export async function hasSolvedRound(teamNumber: number): Promise<boolean> {
  const db = await database();
  const row = await db
    .collection('hunt_progress')
    .findOne({ teamNumber, challengeSlug: SHIFTVERSE_SLUG });
  return Boolean(row?.solvedAt);
}

/** Points and timings, for the finish dialogue. */
export async function teamSummary(teamNumber: number) {
  const db = await database();
  const team = await db.collection('teams').findOne({ teamNumber });
  if (!team) return null;

  const rows = await db
    .collection('hunt_progress')
    .find({ teamNumber }, { projection: { challengeSlug: 1, solvedAt: 1, _id: 0 } })
    .toArray();

  const registeredAt =
    team.registeredAt instanceof Date ? team.registeredAt.getTime() : null;

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
