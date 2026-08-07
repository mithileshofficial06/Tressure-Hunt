import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { updatePuzzle } from "@/lib/shiftverse/teams";

/**
 * POST /api/shiftverse/save — persist the stepper positions.
 *
 * So a refresh, a dropped connection or a phone locking itself does not throw
 * away a board a team has been turning for ten minutes.
 *
 * Team from the cookie, never the path — see the note in `state/route.ts`. As
 * `/api/team/[teamNumber]/save` this endpoint would let any team overwrite any
 * other team's board with a one-character change to the URL.
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

  const { perLetterGuesses } = (body ?? {}) as { perLetterGuesses?: unknown };

  if (!Array.isArray(perLetterGuesses) || perLetterGuesses.length > 64) {
    return NextResponse.json(
      { error: "perLetterGuesses must be an array of numbers." },
      { status: 400 }
    );
  }

  const valid = perLetterGuesses.every(
    (g: unknown) => typeof g === "number" && Number.isFinite(g) && g >= 1 && g <= 100
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Each guess must be a number between 1 and 100." },
      { status: 400 }
    );
  }

  try {
    const result = await updatePuzzle(teamNumber, {
      perLetterGuesses: perLetterGuesses as number[],
    });
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "No puzzle for this team." }, { status: 404 });
    }
    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error("[shiftverse/save] failed", err);
    return NextResponse.json({ error: "Couldn't save that." }, { status: 502 });
  }
}
