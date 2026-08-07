import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/session";

/**
 * POST /api/team/logout — drop the cookie and go back to the entry screen.
 *
 * It does NOT release the number. The team row stays, so a browser that signs
 * out cannot hand its number to someone else, and a team that clears its
 * cookies by accident has not lost its identity — a coordinator can put them
 * back. Releasing a number is a deliberate admin act (`npm run reset:teams`),
 * not something a stray tap can do mid-event.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
