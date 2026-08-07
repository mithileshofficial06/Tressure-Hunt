import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { isConfigured } from "@/lib/db";
import {
  allBlueprintTeams,
  coordinatorAction,
  type CoordinatorAction,
} from "@/lib/blueprint/progress";
import { publicVariantFor } from "@/lib/blueprint/variants";
import { parseTeamNumber } from "@/lib/teamNumber";

/**
 * GET  /api/blueprint/coordinator — every team's state, for the coordinator board.
 * POST /api/blueprint/coordinator — `{ teamNumber, action }`, the reveal/reset/override.
 *
 * ── GATED BY THE DASHBOARD'S ADMIN COOKIE, NOT BY A PASSWORD IN THE BUNDLE ──
 *
 * The Supabase version authenticated coordinators in the browser, three ways at
 * once, and all three were reachable by any participant:
 *
 *   - `NEXT_PUBLIC_COORDINATOR_PASSWORD` — NEXT_PUBLIC_, so inlined into the
 *     client bundle at build time.
 *   - `performCoordinatorAction` looped over hardcoded literals
 *     (`'kenrich@202'`, `'CHANGE_ME_BEFORE_EVENT'`, `'RECOVERY_2026'`) calling
 *     the `coordinator_action` RPC with each until one was accepted.
 *   - If the RPC still refused, it fell through to a DIRECT table update, and
 *     then to an "optimistic" object so the UI showed success regardless.
 *
 * The net effect was that any team could mark itself complete from the console.
 * Reproducing that faithfully would have been the single worst thing in this
 * port, so coordinators use the gate this app already has: `ADMIN_CODE`, typed
 * into the team-number box, checked server-side, rate-limited, never inlined.
 * One coordinator login for the whole event instead of a second secret to leak.
 *
 * There is also no separate `validate-coordinator` token step. The admin cookie
 * IS the token, and it is HttpOnly.
 */
export const dynamic = "force-dynamic";

const ACTIONS: CoordinatorAction[] = ["reveal", "reset", "override"];

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    const rows = await allBlueprintTeams();
    return NextResponse.json({
      teams: rows.map((r) => ({
        ...r,
        // Colour and sector name only — the coordinator board never needs the
        // access code, and a screen on a projector is the last place for it.
        color: publicVariantFor(r.teamNumber).color,
        sectorName: publicVariantFor(r.teamNumber).sectorName,
      })),
    });
  } catch (err) {
    console.error("[blueprint/coordinator] read failed", err);
    return NextResponse.json({ error: "Couldn't read the board." }, { status: 502 });
  }
}

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

  const { teamNumber, action } = (body ?? {}) as { teamNumber?: unknown; action?: unknown };

  const parsed = parseTeamNumber(teamNumber);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (typeof action !== "string" || !ACTIONS.includes(action as CoordinatorAction)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const row = await coordinatorAction(parsed.value, action as CoordinatorAction);
    return NextResponse.json({ ok: true, team: row });
  } catch (err) {
    console.error("[blueprint/coordinator] action failed", err);
    return NextResponse.json({ error: "Couldn't apply that. Try again." }, { status: 502 });
  }
}
