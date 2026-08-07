import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * The team cookie: which number this browser claimed.
 *
 * Signed, not encrypted. The team number is not a secret — it is printed on
 * their table card — so there is nothing to hide. What the signature buys is
 * that a team cannot open devtools, change `14` to `9`, and land on another
 * team's dashboard. Verification is an HMAC check with no database read, which
 * is the same trade SympoApp makes with its JWTs.
 */

export const COOKIE_NAME = "th_team";
export const ADMIN_COOKIE_NAME = "th_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // One event day.

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in .env.local (32+ random bytes) before deploying."
    );
  }

  // Dev convenience only: a per-process random key so `npm run dev` works
  // before .env.local exists. Restarting the server invalidates every cookie,
  // which is exactly why this is not allowed in production.
  const globalForSecret = globalThis as unknown as { _thDevSecret?: string };
  globalForSecret._thDevSecret ??= randomBytes(32).toString("hex");
  return globalForSecret._thDevSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(teamNumber: number): string {
  const payload = Buffer.from(
    JSON.stringify({ n: teamNumber, iat: Date.now() })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The team number this cookie proves, or null if it proves nothing. */
export function readSession(token: string | undefined): number | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));

  // Length check first: timingSafeEqual throws rather than returning false when
  // the buffers differ in size.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const { n, iat } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof n !== "number" || typeof iat !== "number") return null;
    if (Date.now() - iat > MAX_AGE_SECONDS * 1000) return null;
    return n;
  } catch {
    return null;
  }
}

/**
 * The admin cookie: this browser typed the gate code.
 *
 * A separate cookie from the team one, not a flag inside it, so the two can
 * never be confused: no amount of tampering with a team cookie produces admin,
 * and an admin browsing the site does not accidentally hold a team identity.
 * Same HMAC, same secret — rotating SESSION_SECRET signs everyone out of both.
 */
export function createAdminSession(): string {
  const payload = Buffer.from(JSON.stringify({ a: 1, iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readAdminSession(token: string | undefined): boolean {
  if (!token) return false;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));

  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  try {
    const { a, iat } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (a !== 1 || typeof iat !== "number") return false;
    return Date.now() - iat <= MAX_AGE_SECONDS * 1000;
  } catch {
    return false;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
