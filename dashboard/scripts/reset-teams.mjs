/**
 * Wipe the roster AND all progress. Run between rehearsals, never during an event.
 *
 *   npm run reset:teams
 *
 * Both collections go together on purpose. Clearing teams but leaving
 * `hunt_progress` would strand solve rows pointing at numbers nobody holds, and
 * the next team to claim 14 would inherit the last one's stamped rounds — the
 * kind of bug that only shows up in front of an audience.
 *
 * Deliberately a script and not a button: releasing a claimed number is the one
 * action that can hand a team's identity to someone else, so it should take a
 * terminal and a deliberate keystroke.
 */
import { MongoClient } from "mongodb";
import { createInterface } from "node:readline/promises";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: npm run reset:teams");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "xplore26");

const teamCount = await db.collection("teams").countDocuments();
const progressCount = await db.collection("hunt_progress").countDocuments();

if (teamCount === 0 && progressCount === 0) {
  console.log("Nothing registered and no progress recorded — nothing to do.");
  await client.close();
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  `Delete ${teamCount} team(s) and ${progressCount} progress row(s) from "${db.databaseName}"? Type DELETE to confirm: `
);
rl.close();

if (answer.trim() !== "DELETE") {
  console.log("Cancelled. Nothing was deleted.");
  await client.close();
  process.exit(0);
}

const teams = await db.collection("teams").deleteMany({});
const progress = await db.collection("hunt_progress").deleteMany({});
console.log(`Deleted ${teams.deletedCount} team(s) and ${progress.deletedCount} progress row(s).`);

await client.close();
