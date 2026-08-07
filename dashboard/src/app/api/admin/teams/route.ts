import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { allTeamsWithProgress, isConfigured } from "@/lib/db";

/**
 * GET /api/admin/teams — the whole board, for the admin table's poll.
 *
 * The page server-renders this same payload on first load; this endpoint exists
 * so the table can refresh itself every few seconds without a navigation. One
 * request returns every team, every round and every timestamp, because sixty
 * teams is small and a partial/incremental protocol would be more code and more
 * ways to show a coordinator a stale cell.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  try {
    return NextResponse.json({ teams: await allTeamsWithProgress() });
  } catch (err) {
    console.error("[admin/teams] failed", err);
    return NextResponse.json({ error: "Couldn't read the database." }, { status: 502 });
  }
}
