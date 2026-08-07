import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isCorrectUniverse, universeCard } from "@/lib/hunt/gridPuzzle.server";
import { universeFor } from "@/lib/hunt/grid";

/**
 * POST /api/team/grid/universe — step 1 of the round.
 *
 * A team submits which universe they think they belong to (their team number
 * mod 8). Only a correct answer gets the equation card back, so the card cannot
 * be fished out by guessing an index and reading the response.
 *
 * THE TEAM COMES FROM THE COOKIE, NEVER THE BODY. Otherwise a team could ask
 * for another universe's equations by changing a field — and while the
 * equations are not the answer, handing out all eight would map every index to
 * a colour and skip the only step that makes the grid readable.
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

  const guess = (body as { universe?: unknown })?.universe;

  if (!isCorrectUniverse(teamNumber, guess)) {
    // No hint about which way they were wrong — "too high" would halve the
    // search space of an eight-option question.
    return NextResponse.json({ correct: false });
  }

  return NextResponse.json({
    correct: true,
    card: universeCard(universeFor(teamNumber)),
  });
}
