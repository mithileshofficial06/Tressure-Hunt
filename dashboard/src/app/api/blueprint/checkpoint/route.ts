import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { findTeam, isConfigured } from "@/lib/db";
import { submitCode } from "@/lib/blueprint/progress";

/**
 * POST /api/blueprint/checkpoint — the access code from the physical card.
 *
 * THE ONLY PLACE A BLUEPRINT CODE IS EVER RECOGNISED. The component reports
 * what the team typed and knows nothing else; the comparison happens in
 * `variants.server.ts`, so there is no code in the client bundle to read.
 *
 * That is the substantive difference from the Supabase original, which fell
 * back to comparing against `defaultAccessCode` in the browser when the RPC was
 * unavailable — putting all ten codes into the bundle for a round whose codes
 * are printed on cards at physical checkpoints.
 *
 * THE TEAM NUMBER COMES FROM THE COOKIE, NEVER THE BODY — the same rule as
 * every other round here.
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
  if (typeof code !== "string" || code.trim().length === 0 || code.length > 64) {
    return NextResponse.json({ error: "Enter an access code before submitting." }, { status: 400 });
  }

  try {
    // A cookie can outlive the row it refers to, if the roster was reset while
    // a browser held a session.
    if (!(await findTeam(teamNumber))) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }

    const result = await submitCode(teamNumber, code);

    if (result.correct) {
      return NextResponse.json({ correct: true, status: result.row.status });
    }

    return NextResponse.json({
      correct: false,
      status: result.row.status,
      // `error` is set for a state problem ("get a coordinator first"), absent
      // for a plain wrong code — the UI shows its own ACCESS DENIED for that,
      // and naming which character was wrong would turn a printed card into a
      // guessing game against the server.
      error: result.error ?? null,
      wrongAttempts: result.row.wrongAttemptsB,
    });
  } catch (err) {
    console.error("[blueprint/checkpoint] failed", err);
    return NextResponse.json({ error: "Couldn't check that. Try again." }, { status: 502 });
  }
}
