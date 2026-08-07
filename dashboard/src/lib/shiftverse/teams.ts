import { shiftverseTeams } from "../db";

/**
 * SHIFT://VERSE's per-team puzzle store.
 *
 * THE COLLECTION IS `shiftverse_teams`, NOT `teams`. The dashboard owns `teams`
 * in this same database with a completely different shape (teamNumber +
 * members + registeredAt). Sharing the name would mean this round's seed wiping
 * the roster, and the admin table trying to render puzzle words as team
 * members. That was true when this was a separate app and it is *more*
 * important now that both live in one codebase, where the two names sit a few
 * lines apart.
 *
 * WHAT WENT AWAY WHEN THE APP WAS FOLDED IN. The standalone version carried its
 * own MongoClient here and a SECOND one in `lib/hunt.ts` — three pools against
 * one Atlas cluster once you count the dashboard. It also carried a copy of the
 * round list, `POINTS_PER_ROUND` and `deriveTimings`, with a comment explaining
 * that the copy was forced: the dashboard's summary endpoint was unreachable
 * across origins because the session cookie is SameSite=Lax. Same origin now,
 * so the copies are gone and the finish dialogue reads the real thing.
 */

export interface TeamRecord {
  teamNumber: number;
  plaintextWord: string;
  encryptedWord: string;
  shiftKey: number;
  perLetterGuesses: number[];
  /** epoch ms — 0 means not started yet */
  startTime: number;
}

/** Find a single team's puzzle by team number. */
export async function findPuzzle(teamNumber: number): Promise<TeamRecord | null> {
  const col = await shiftverseTeams();
  return col.findOne({ teamNumber }, { projection: { _id: 0 } });
}

/**
 * Update a team's puzzle fields.
 * Returns { matchedCount } — the same shape the route handlers branch on.
 */
export async function updatePuzzle(
  teamNumber: number,
  update: Partial<TeamRecord>
): Promise<{ matchedCount: number }> {
  const col = await shiftverseTeams();
  const res = await col.updateOne({ teamNumber }, { $set: update });
  return { matchedCount: res.matchedCount };
}
