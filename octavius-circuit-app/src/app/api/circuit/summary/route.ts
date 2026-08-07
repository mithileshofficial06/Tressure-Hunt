import { NextResponse } from "next/server";
import { teamSummary } from "@/lib/db";
import { isValidTeamNumber } from "@/lib/teamRange";

/**
 * GET /api/circuit/summary?team=N — points and timings for the finish dialogue.
 *
 * Read-only, and returns nothing a team could not already see on their own hunt
 * board: how many rounds they have cleared and when. No levels, no solutions.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const team = Number(new URL(req.url).searchParams.get("team"));
  if (!isValidTeamNumber(team)) {
    return NextResponse.json({ error: "Invalid team number." }, { status: 400 });
  }

  try {
    const summary = await teamSummary(team);
    if (!summary) {
      return NextResponse.json({ error: "That team is not registered." }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[circuit/summary] failed", err);
    return NextResponse.json({ error: "Couldn't read progress." }, { status: 502 });
  }
}
