import { NextResponse } from "next/server";
import { isAdminCode } from "@/lib/admin";
import { ADMIN_COOKIE_NAME, cookieOptions, createAdminSession } from "@/lib/session";

/**
 * POST /api/admin/login — trade the gate code for an admin cookie.
 *
 * The registration form calls this with whatever was typed whenever it isn't a
 * valid team number. That flow is what lets one input box serve both purposes,
 * and it is why the response for a wrong code is deliberately shaped like an
 * ordinary validation failure: a participant typing 999 and a participant
 * guessing at the admin code get the same 401 and the same sentence.
 */

/**
 * Crude per-process attempt limiter.
 *
 * A four-digit code is ten thousand guesses, which a script finishes in
 * seconds. This makes it hours instead. In-memory and per-process, so it is
 * defeated by a restart or a second instance — it is a speed bump matched to
 * the threat (a bored participant with the network tab open), not a security
 * control. Anything stronger belongs in front of the app, not here.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  // Best-effort client identity. Behind a proxy this is the forwarded header;
  // locally it is nothing at all, and everyone shares one bucket. Acceptable:
  // the failure mode is that the limiter is stricter than intended, never
  // looser.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!isAdminCode((body as { code?: unknown })?.code)) {
    return NextResponse.json({ error: "Not a valid team number." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, createAdminSession(), cookieOptions);
  return res;
}
