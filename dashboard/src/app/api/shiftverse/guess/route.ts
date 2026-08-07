import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured, markRoundSolved, recomputeCompletion } from "@/lib/db";
import { SHIFTVERSE_SLUG } from "@/lib/events";
import { findPuzzle } from "@/lib/shiftverse/teams";

/**
 * POST /api/shiftverse/guess — check the word.
 *
 * The plaintext is compared HERE and returned only on a correct guess. No
 * partial feedback, no hints, no shift key: the board is the puzzle, and
 * "you got three letters right" would turn it into a search against the server.
 *
 * EVERY TEAM IS ANSWERING A DIFFERENT PUZZLE — the word comes from this team's
 * own seeded row — so the answer to one board is worth nothing on another.
 *
 * Stamping goes through the dashboard's own `markRoundSolved` /
 * `recomputeCompletion`, the same pair the grid, the room and the circuit use.
 * The standalone app had to reimplement both in `lib/hunt.ts`, along with a
 * duplicate round list, because it could not reach this code from another
 * origin. One app, one definition of a solved round.
 */
export async function POST(req: Request) {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { guessedWord } = (body ?? {}) as { guessedWord?: unknown };
  if (typeof guessedWord !== "string" || guessedWord.length === 0 || guessedWord.length > 64) {
    return NextResponse.json({ error: "guessedWord is required." }, { status: 400 });
  }

  try {
    const team = await findPuzzle(teamNumber);
    if (!team) {
      return NextResponse.json({ error: "No puzzle for this team." }, { status: 404 });
    }

    const correct = guessedWord.toUpperCase() === team.plaintextWord.toUpperCase();
    if (!correct) return NextResponse.json({ correct: false });

    try {
      await markRoundSolved(teamNumber, SHIFTVERSE_SLUG, "team");
      await recomputeCompletion(teamNumber);
    } catch (err) {
      // A correct answer stays correct even if the write fails. Log it and let
      // the team see their win rather than showing a false negative; a
      // coordinator can stamp it from the admin board.
      console.error("[shiftverse/guess] failed to stamp hunt progress", err);
    }

    return NextResponse.json({ correct: true, decryptedWord: team.plaintextWord });
  } catch (err) {
    console.error("[shiftverse/guess] failed", err);
    return NextResponse.json({ error: "Couldn't check that." }, { status: 502 });
  }
}
