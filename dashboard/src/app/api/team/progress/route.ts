import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured, markRoundSolved, recomputeCompletion, teamProgress, findTeam } from "@/lib/db";
import { EVENT_SLUGS } from "@/lib/events";

/**
 * POST /api/team/progress — a team stamps one of its own rounds.
 *
 * THE TEAM NUMBER COMES FROM THE COOKIE, NEVER FROM THE BODY. Accepting it from
 * the request would let any team mark any other team's rounds by changing one
 * field, and the signed cookie is precisely the thing that already proves which
 * team this browser is. The body carries only which round.
 *
 * There is no "un-mark" here by design — see `/api/admin/progress`. A team can
 * only ever move forward, so a mis-tap is a coordinator's job to undo, not
 * something a team can quietly fix by rewinding its own clock.
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

  const slug = (body as { slug?: unknown })?.slug;
  if (typeof slug !== "string" || !EVENT_SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Unknown round." }, { status: 400 });
  }

  try {
    // A cookie can outlive the row it refers to — the roster gets reset between
    // rehearsals while a browser is still holding yesterday's cookie. Writing
    // progress for a team that no longer exists would create orphan rows that
    // appear in no table.
    if (!(await findTeam(teamNumber))) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }

    await markRoundSolved(teamNumber, slug, "team");
    await recomputeCompletion(teamNumber);

    const rows = await teamProgress(teamNumber);
    const team = await findTeam(teamNumber);

    return NextResponse.json({
      ok: true,
      solved: rows
        .filter((r) => r.solvedAt)
        .map((r) => ({
          slug: r.challengeSlug,
          solvedAt: r.solvedAt!.toISOString(),
          markedBy: r.markedBy,
        })),
      completedAt: team?.completedAt ? team.completedAt.toISOString() : null,
      durationMs: team?.durationMs ?? null,
    });
  } catch (err) {
    console.error("[team/progress] failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 502 });
  }
}
