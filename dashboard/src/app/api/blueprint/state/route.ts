import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { getOrCreate, start, markAwaitingReveal } from "@/lib/blueprint/progress";
import { publicVariantFor } from "@/lib/blueprint/variants";
import { locationFor } from "@/lib/blueprint/variants.server";

/**
 * GET  /api/blueprint/state — where this team is in the round.
 * POST /api/blueprint/state — `{ action: "start" | "notify" }`.
 *
 * ONE ENDPOINT FOR THE WHOLE TEAM-SIDE STATE, because the client polls it. The
 * Supabase version pushed status changes over a realtime channel
 * (`postgres_changes` on `team-session-${n}`); Mongo has no equivalent this app
 * can use, so the round polls this route while it waits on a coordinator. See
 * the note in `BlueprintFlow.tsx` about the interval.
 *
 * THE LOCATION IS THE INTERESTING PART. It is included ONLY once the team's
 * status is `checkpoint_a_done` or `complete` — exactly the condition the
 * `get_revealed_location` RPC enforced. Before that the field is null, so the
 * response a waiting team polls does not contain the answer they are waiting
 * for. Sending it early and hiding it in the UI would put it in devtools.
 */
export const dynamic = "force-dynamic";

function view(
  row: Awaited<ReturnType<typeof getOrCreate>>,
  teamNumber: number
): Record<string, unknown> {
  const revealed = row.status === "checkpoint_a_done" || row.status === "complete";
  const pub = publicVariantFor(teamNumber);
  const place = revealed ? locationFor(teamNumber) : null;
  return {
    teamNumber,
    status: row.status,
    variantNumber: pub.variantNumber,
    color: pub.color,
    sectorName: pub.sectorName,
    startTime: row.startTime,
    checkpointATime: row.checkpointATime,
    completeTime: row.completeTime,
    wrongAttemptsB: row.wrongAttemptsB,
    // Gated. All three are null until a coordinator has released the sector.
    location: place?.text ?? null,
    locationTrace: place?.trace ?? null,
    locationClue: place?.clue ?? null,
  };
}

async function teamOr401() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) return null;
  return teamNumber;
}

export async function GET() {
  const teamNumber = await teamOr401();
  if (teamNumber === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    return NextResponse.json(view(await getOrCreate(teamNumber), teamNumber));
  } catch (err) {
    console.error("[blueprint/state] read failed", err);
    return NextResponse.json({ error: "Couldn't read your progress." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const teamNumber = await teamOr401();
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

  const action = (body as { action?: unknown })?.action;
  if (action !== "start" && action !== "notify") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    // Both are no-ops from the wrong state — `progress.ts` holds the transition
    // rules, so there is nothing a team can post that skips the coordinator.
    const row = action === "start" ? await start(teamNumber) : await markAwaitingReveal(teamNumber);
    return NextResponse.json(view(row, teamNumber));
  } catch (err) {
    console.error("[blueprint/state] write failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 502 });
  }
}
