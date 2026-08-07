import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isCorrectAnswer } from "@/lib/hunt/gridPuzzle.server";
import { findTeam, isConfigured, markRoundSolved, recomputeCompletion } from "@/lib/db";

/**
 * POST /api/team/grid — check the 64 Grid answer.
 *
 * THE ONLY PLACE A RIGHT ANSWER IS EVER RECOGNISED. The component reports what
 * the player typed and knows nothing else; the comparison happens here against
 * a server-only module, so there is no answer in the client bundle to read.
 *
 * THE TEAM NUMBER COMES FROM THE COOKIE, NEVER THE BODY — the same rule every
 * scoring route follows. Taking it from the request would let one team clear
 * the round for another by changing a field.
 *
 * A correct answer stamps `hunt-grid` directly rather than asking the team to
 * tick it: the server just verified it, so making them confirm would be asking
 * a question we already know the answer to.
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

  const answer = (body as { answer?: unknown })?.answer;
  if (typeof answer !== "string" || answer.length > 64) {
    return NextResponse.json({ error: "Expected an answer." }, { status: 400 });
  }

  // Per-universe: the expected word depends on this team's universe
  // (teamNumber mod 8), so team 9 and team 10 are answering different puzzles.
  if (!isCorrectAnswer(teamNumber, answer)) {
    // Deliberately no detail — "wrong letter 3" would turn eight cells into a
    // guessing game against the server rather than an anagram.
    return NextResponse.json({ correct: false });
  }

  try {
    // A cookie can outlive the row it refers to, if the roster was reset while
    // a browser held a session.
    if (!(await findTeam(teamNumber))) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }

    // First stamp wins, so re-solving cannot move the original time.
    await markRoundSolved(teamNumber, "hunt-grid", "team");
    await recomputeCompletion(teamNumber);

    return NextResponse.json({ correct: true });
  } catch (err) {
    console.error("[team/grid] failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 502 });
  }
}
