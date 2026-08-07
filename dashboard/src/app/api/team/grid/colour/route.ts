import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { colourFor, isCorrectColour } from "@/lib/hunt/gridPuzzle.server";
import { universeFor } from "@/lib/hunt/grid";

/**
 * POST /api/team/grid/colour — step 2 of the round.
 *
 * A team submits the R, G and B they got from running their universe's cipher.
 * Only a match opens step 3. This endpoint exists so the decode is real work
 * rather than a button: the resulting colour is never sent to the browser, so
 * there is nothing on the page to compare against and the arithmetic has to be
 * done.
 *
 * THE TEAM COMES FROM THE COOKIE, NEVER THE BODY — otherwise a team could
 * check a guess against somebody else's universe.
 *
 * A wrong answer says only "wrong". Reporting which channel missed would turn
 * three numbers into three independent one-at-a-time searches.
 */
export async function POST(req: Request) {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { r, g, b } = (body ?? {}) as { r?: unknown; g?: unknown; b?: unknown };

  if (!isCorrectColour(teamNumber, r, g, b)) {
    return NextResponse.json({ correct: false });
  }

  // Only NOW is the colour handed over. The team has just derived it, so this
  // gives away nothing they do not already hold — and it lets the grid isolate
  // their eight letters instead of asking them to re-find a colour they have
  // already proved. The universe index rides along for the same reason: it was
  // established at step 1.
  const index = universeFor(teamNumber);
  return NextResponse.json({ correct: true, index, colour: colourFor(index) });
}
