import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import {
  allTeamsWithProgress,
  findTeam,
  isConfigured,
  markRoundSolved,
  recomputeCompletion,
  unmarkRound,
} from "@/lib/db";
import { EVENT_SLUGS } from "@/lib/events";
import { parseTeamNumber } from "@/lib/teamNumber";

/**
 * POST /api/admin/progress — the override.
 *
 * `{ teamNumber, slug, solved: boolean }`. This is the only endpoint that can
 * un-solve a round: teams can stamp their own progress but never take it back,
 * because "undo" in a participant's hands is how a finish time quietly moves.
 *
 * Returns the full refreshed board rather than an ack, so the coordinator's
 * table reflects the override immediately instead of waiting out the poll
 * interval and appearing not to have worked.
 */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
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

  const { teamNumber, slug, solved } = (body ?? {}) as {
    teamNumber?: unknown;
    slug?: unknown;
    solved?: unknown;
  };

  const parsed = parseTeamNumber(teamNumber);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Whitelist, not free text: an override that invents a slug would write a row
  // no round ever reads, and the team would look stuck for reasons nobody could
  // see in the UI.
  if (typeof slug !== "string" || !EVENT_SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Unknown round." }, { status: 400 });
  }
  if (typeof solved !== "boolean") {
    return NextResponse.json({ error: "`solved` must be true or false." }, { status: 400 });
  }

  try {
    if (!(await findTeam(parsed.value))) {
      return NextResponse.json({ error: `Team ${parsed.value} is not registered.` }, { status: 404 });
    }

    if (solved) await markRoundSolved(parsed.value, slug, "admin");
    else await unmarkRound(parsed.value, slug);

    // Always after the write, both directions: un-marking a round has to be
    // able to un-finish a team, not just marking one able to finish it.
    await recomputeCompletion(parsed.value);

    return NextResponse.json({ ok: true, teams: await allTeamsWithProgress() });
  } catch (err) {
    console.error("[admin/progress] failed", err);
    return NextResponse.json({ error: "Couldn't write to the database." }, { status: 502 });
  }
}
