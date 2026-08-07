import { NextResponse } from "next/server";
import { registerTeam, isConfigured, NotConfiguredError } from "@/lib/db";
import { createSession, cookieOptions, COOKIE_NAME } from "@/lib/session";
import { parseTeamNumber } from "@/lib/teamNumber";
import { parseMembers } from "@/lib/members";

/**
 * POST /api/team/claim — register a team, or be told the number's gone.
 *
 * The only way into the dashboard. Validation runs here and not just in the
 * form, because a request that skipped the form is the one worth worrying
 * about. Both halves are checked before either is written: a team that gets
 * "number taken" should not have had its roster stored, and a team with a bad
 * roster should not have burned a number.
 */
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Database not configured. Add MONGODB_URI to .env.local and restart." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const payload = body as { teamNumber?: unknown; members?: unknown };

  const parsed = parseTeamNumber(payload?.teamNumber);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const roster = parseMembers(payload?.members);
  if (!roster.ok) {
    return NextResponse.json({ error: roster.error }, { status: 400 });
  }

  try {
    const result = await registerTeam(parsed.value, roster.value);

    if (!result.ok) {
      // 409 Conflict, not 400: the request was well-formed, the world just
      // changed under it. The form uses the status to decide whether to blame
      // the input or the timing.
      return NextResponse.json(
        { error: `Team ${parsed.value} is already in play. Pick another number.`, reason: "taken" },
        { status: 409 }
      );
    }

    const res = NextResponse.json({ ok: true, teamNumber: parsed.value });
    res.cookies.set(COOKIE_NAME, createSession(parsed.value), cookieOptions);
    return res;
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[claim] failed", err);
    return NextResponse.json(
      { error: "Couldn't reach the database. Try again in a moment." },
      { status: 502 }
    );
  }
}
