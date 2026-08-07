import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isCorrectRoomCode } from "@/lib/hunt/roomPuzzle.server";
import { findTeam, isConfigured, markRoundSolved, recomputeCompletion } from "@/lib/db";

/**
 * POST /api/team/room — clear the Mystery Room.
 *
 * The room posts here once, when its fifth section opens and it has the reveal
 * code. See `roomPuzzle.server.ts` for why the check is a gate rather than a
 * secret: the code is on screen by the time a team can send it, so what this
 * route is for is making the SERVER the thing that stamps the round.
 *
 * THE TEAM NUMBER COMES FROM THE COOKIE, NEVER THE BODY — the same rule as
 * `/api/team/grid` and every other scoring route. Taking it from the request
 * would let one team clear the round for another by changing a field.
 *
 * A correct code stamps `hunt-room` directly rather than asking the team to
 * tick it, for the same reason the grid does: the server just verified it, so
 * making them confirm would be asking a question we already know the answer to.
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

  const code = (body as { code?: unknown })?.code;
  if (typeof code !== "string" || code.length > 64) {
    return NextResponse.json({ error: "Expected a code." }, { status: 400 });
  }

  if (!isCorrectRoomCode(code)) {
    return NextResponse.json({ correct: false });
  }

  try {
    // A cookie can outlive the row it refers to, if the roster was reset while
    // a browser held a session.
    if (!(await findTeam(teamNumber))) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }

    // First stamp wins, so re-solving cannot move the original time.
    await markRoundSolved(teamNumber, "hunt-room", "team");
    await recomputeCompletion(teamNumber);

    return NextResponse.json({ correct: true });
  } catch (err) {
    console.error("[team/room] failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 502 });
  }
}
