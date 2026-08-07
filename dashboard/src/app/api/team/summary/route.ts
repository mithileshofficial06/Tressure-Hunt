import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured, teamSummary } from "@/lib/db";

/**
 * GET /api/team/summary — this team's points and timings.
 *
 * Feeds the finish dialogue a round shows on its way out. Fetched fresh when
 * the button is pressed rather than captured at solve time: a team can solve,
 * leave the tab open, and press Finish ten minutes later, and the dialogue must
 * still show the numbers as they actually stand.
 *
 * Note that "as they actually stand" does NOT mean the round's time creeps up
 * while they sit there — a round's elapsed is measured to its SOLVE stamp, not
 * to the moment someone got round to clicking. Waiting costs nothing.
 *
 * Team comes from the cookie, never a query string.
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
    const summary = await teamSummary(teamNumber);
    if (!summary) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[team/summary] failed", err);
    return NextResponse.json({ error: "Couldn't read your progress." }, { status: 502 });
  }
}
