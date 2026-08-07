import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/session";

/** POST /api/admin/logout — drop the admin cookie. Touches no team data. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
