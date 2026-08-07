import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, readAdminSession } from "./session";

/**
 * The admin gate.
 *
 * SERVER ONLY. This file is never imported by a client component, and the code
 * itself must never be handed to the browser — if it were inlined into the
 * bundle (say, to let the form check it before submitting) then "view source"
 * would be the whole attack. The form instead posts whatever was typed to
 * `/api/admin/login` and lets this file decide, so a wrong guess and a valid
 * team number are indistinguishable from the client's side.
 *
 * Be honest about what this is: a shared four-digit code typed into a public
 * input on the registration screen. It keeps a curious participant out of the
 * coordinator's table. It is not a password, it does not identify WHICH
 * coordinator acted, and anyone who watches you type it has it. That is an
 * acceptable trade for a one-day event; it would not be for anything that
 * outlives one.
 */

const DEFAULT_CODE = "0904";

export function adminCode(): string {
  const fromEnv = process.env.ADMIN_CODE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_CODE;
}

/** Constant-time compare, so the response time can't be used to guess digits. */
export function isAdminCode(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;

  const provided = Buffer.from(candidate.trim());
  const expected = Buffer.from(adminCode());

  // Length check first: timingSafeEqual throws on mismatched sizes. Length is
  // already public (the input has a visible maxLength), so leaking it costs
  // nothing here.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** True when the current request carries a valid admin cookie. */
export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  return readAdminSession(jar.get(ADMIN_COOKIE_NAME)?.value);
}
