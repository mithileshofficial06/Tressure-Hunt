/**
 * What counts as a team number.
 *
 * Shared by the client (to grey out the button) and the route handler (to
 * decide). The client copy is a convenience; the server copy is the rule —
 * a request that never touched the form still has to pass it.
 */

export const MIN_TEAM = 1;

/**
 * Server-side only, and deliberately NOT named NEXT_PUBLIC_*.
 *
 * A NEXT_PUBLIC_ variable is inlined into the client bundle at BUILD time, so
 * changing it in .env.local and restarting would appear to do nothing on the
 * form while working fine in the route handler — the two halves would disagree
 * about the upper bound with no error anywhere. Read here at runtime and passed
 * to the form as a prop instead, so both halves read the same number from the
 * same place.
 */
export function maxTeam(): number {
  const raw = Number(process.env.MAX_TEAMS);
  return Number.isInteger(raw) && raw > 0 ? raw : 60;
}

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export function parseTeamNumber(input: unknown, max = maxTeam()): ParseResult {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;

  if (!Number.isInteger(value)) return { ok: false, error: "Team number must be a whole number." };
  if (value < MIN_TEAM || value > max) {
    return { ok: false, error: `Team number must be between ${MIN_TEAM} and ${max}.` };
  }
  return { ok: true, value };
}
