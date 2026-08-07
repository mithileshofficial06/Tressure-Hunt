import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { findPuzzle, updatePuzzle } from "@/lib/shiftverse/teams";

/**
 * GET /api/shiftverse/state — this team's board.
 *
 * Returns ONLY the encrypted word, the per-letter guesses and the clock start.
 * NEVER `shiftKey` or `plaintextWord` — those are the answer, and they stay on
 * the server.
 *
 * TWO THINGS CHANGED WHEN THIS CAME IN-APP.
 *
 * The team number comes from the SIGNED SESSION COOKIE, not from the URL. This
 * was `GET /api/team/[teamNumber]`, which meant any team could read — and, via
 * the sibling save route, overwrite — any other team's board by editing a path
 * segment. There is nothing to edit now.
 *
 * The path is `/api/shiftverse/*` rather than `/api/team/*`. The dashboard
 * already owns `/api/team/claim`, `/api/team/progress`, `/api/team/summary` and
 * more; adding a `[teamNumber]` dynamic segment beside them would have left the
 * routing to a precedence rule (static beats dynamic) that is easy to break by
 * accident and hard to notice when it breaks.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    const team = await findPuzzle(teamNumber);
    if (!team) {
      return NextResponse.json(
        { error: "No puzzle for this team yet. A coordinator needs to run the Shift Verse seed." },
        { status: 404 }
      );
    }

    // Stamp startTime on first access — never overwrite once set, or a team
    // could reset its own board deadline by reloading.
    const startTime = team.startTime && team.startTime > 0 ? team.startTime : Date.now();

    // Fresh random starting positions on each visit, so the board never opens
    // pre-solved from a previous session.
    const perLetterGuesses = Array.from(
      { length: team.encryptedWord.length },
      () => Math.floor(Math.random() * 26) + 1
    );

    await updatePuzzle(teamNumber, { perLetterGuesses, startTime });

    return NextResponse.json({
      teamNumber: team.teamNumber,
      encryptedWord: team.encryptedWord,
      perLetterGuesses,
      startTime,
    });
  } catch (err) {
    console.error("[shiftverse/state] failed", err);
    return NextResponse.json({ error: "Couldn't read your board." }, { status: 502 });
  }
}
