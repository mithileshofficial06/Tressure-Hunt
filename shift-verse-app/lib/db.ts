import { MongoClient, type Collection, type Db } from 'mongodb';

/**
 * MongoDB-backed team store for SHIFT://VERSE.
 *
 * This replaces the original file-based store (data/teams.json). That version
 * could not survive a serverless deploy — every instance got its own container
 * filesystem, so two teams hitting two instances saw two different worlds and a
 * redeploy wiped every guess. The public API is deliberately unchanged apart
 * from being async, so the route handlers read almost exactly as they did.
 *
 * THE COLLECTION IS `shiftverse_teams`, NOT `teams`. The registration dashboard
 * owns `teams` in this same database with a completely different shape
 * (teamNumber + members + registeredAt). Sharing the name would mean this app's
 * seed wiping the roster and the dashboard's admin table trying to render
 * puzzle words as team members. The repo's unused models/Team.ts would have
 * done exactly that — Mongoose pluralises `Team` to `teams` — which is why it
 * was deleted rather than wired up.
 */

const DEFAULT_DB = 'xplore26';
const COLLECTION = 'shiftverse_teams';

export interface TeamRecord {
  teamNumber: number;
  plaintextWord: string;
  encryptedWord: string;
  shiftKey: number;
  perLetterGuesses: number[];
  startTime: number; // epoch ms — 0 means not started yet
}

/**
 * One client for the whole process, cached across hot reloads.
 *
 * Next's dev server re-evaluates modules on every edit; without the global
 * stash each reload opens a fresh pool and the old one is never closed, which
 * walks an Atlas free tier into its connection cap in about a dozen saves.
 */
const globalForMongo = globalThis as unknown as {
  _svClient?: Promise<MongoClient>;
  _svIndexed?: Promise<void>;
};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set — copy .env.example to .env.local and fill it in.');
  }

  globalForMongo._svClient ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  }).connect();

  return globalForMongo._svClient;
}

async function database(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || DEFAULT_DB);
}

/** Unique on teamNumber so a re-run of the seed can never double a team. */
async function collection(): Promise<Collection<TeamRecord>> {
  const db = await database();
  const col = db.collection<TeamRecord>(COLLECTION);

  globalForMongo._svIndexed ??= col
    .createIndex({ teamNumber: 1 }, { unique: true, name: 'teamNumber_unique' })
    .then(() => undefined);

  try {
    await globalForMongo._svIndexed;
  } catch (err) {
    // Don't cache a failed attempt — a transient blip at startup would
    // otherwise leave every later request believing the index exists.
    globalForMongo._svIndexed = undefined;
    throw err;
  }

  return col;
}

/** Find a single team by team number. */
export async function findTeam(teamNumber: number): Promise<TeamRecord | null> {
  const col = await collection();
  return col.findOne({ teamNumber }, { projection: { _id: 0 } });
}

/**
 * Update a team's fields by team number.
 * Returns { matchedCount } — same shape the callers already branch on.
 */
export async function updateTeam(
  teamNumber: number,
  update: Partial<TeamRecord>
): Promise<{ matchedCount: number }> {
  const col = await collection();
  const res = await col.updateOne({ teamNumber }, { $set: update });
  return { matchedCount: res.matchedCount };
}

/**
 * Replace the whole roster (used by the seed script).
 *
 * Ordered inserts are turned off so one bad document reports itself instead of
 * silently truncating the run at that point.
 */
export async function insertManyTeams(records: TeamRecord[]): Promise<void> {
  const col = await collection();
  await col.insertMany(records, { ordered: false });
}

/** Delete all team records (used by the seed script). */
export async function deleteAllTeams(): Promise<void> {
  const col = await collection();
  await col.deleteMany({});
}

/** Close the pool — for scripts, which otherwise hang on an open socket. */
export async function closeConnection(): Promise<void> {
  if (globalForMongo._svClient) {
    await (await globalForMongo._svClient).close();
    globalForMongo._svClient = undefined;
    globalForMongo._svIndexed = undefined;
  }
}
