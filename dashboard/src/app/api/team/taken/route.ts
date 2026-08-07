import { NextResponse } from "next/server";
import { isConfigured, takenNumbers } from "@/lib/db";

/**
 * GET /api/team/taken — the numbers already claimed.
 *
 * Feeds the grid on the entry screen so a team can see 14 is gone before they
 * type it. Advisory only: the grid can be stale by a second and the claim is
 * still decided by the unique index, not by this list.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ taken: [], configured: false });
  }

  try {
    return NextResponse.json({ taken: await takenNumbers(), configured: true });
  } catch (err) {
    console.error("[taken] failed", err);
    // The entry screen still works without this — every number just renders as
    // available and the server settles it on submit.
    return NextResponse.json({ taken: [], configured: true, degraded: true });
  }
}
