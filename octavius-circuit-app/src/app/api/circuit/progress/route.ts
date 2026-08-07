import { NextResponse } from "next/server";
import { LEVELS } from "@/lib/octovius/levels";
import { solvedLevels } from "@/lib/db";
import { isValidTeamNumber } from "@/lib/teamRange";

/**
 * GET /api/circuit/progress?team=N — which levels this team has cleared.
 *
 * Read-only and deliberately dull: it returns level ids, never a board, a
 * target or a solution. The page uses it to decide where to resume.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const team = Number(new URL(req.url).searchParams.get("team"));
  if (!isValidTeamNumber(team)) {
    return NextResponse.json({ error: "Invalid team number." }, { status: 400 });
  }

  try {
    const solved = await solvedLevels(team);
    return NextResponse.json({
      teamNumber: team,
      solvedLevels: solved,
      totalLevels: LEVELS.length,
      roundComplete: LEVELS.every((l) => solved.includes(l.id)),
    });
  } catch (err) {
    console.error("[circuit/progress] failed", err);
    return NextResponse.json({ error: "Couldn't read progress." }, { status: 502 });
  }
}
