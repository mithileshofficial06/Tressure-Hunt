/**
 * What counts as a team roster.
 *
 * Three names required, a fourth allowed. Shared by the form (to grey out the
 * button) and the route handler (to decide) for the same reason `teamNumber.ts`
 * is shared: the client copy is a convenience, the server copy is the rule.
 *
 * Blank rows are dropped BEFORE counting rather than validated in place. A team
 * that fills boxes 1, 2 and 4 and leaves 3 empty has still given three names,
 * and telling them "row 3 is required" when they have a complete roster is the
 * kind of thing that produces a queue at the registration desk.
 */

export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 4;
const MAX_NAME_LENGTH = 60;

export type MembersResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

/** Collapse runs of whitespace so " Ravi   Kumar " and "Ravi Kumar" are one name. */
function normalise(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

export function parseMembers(input: unknown): MembersResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Member names are required." };
  }

  const names = input.map(normalise).filter((n) => n.length > 0);

  if (names.length < MIN_MEMBERS) {
    return {
      ok: false,
      error: `Enter at least ${MIN_MEMBERS} member names (the ${MAX_MEMBERS}th is optional).`,
    };
  }
  if (names.length > MAX_MEMBERS) {
    return { ok: false, error: `A team can have at most ${MAX_MEMBERS} members.` };
  }
  if (names.some((n) => n.length > MAX_NAME_LENGTH)) {
    return { ok: false, error: `Keep each name under ${MAX_NAME_LENGTH} characters.` };
  }

  // Case-insensitive duplicate check. Two identical names in one team is almost
  // always a copy-paste slip, and it makes the admin roster unreadable later.
  const seen = new Set(names.map((n) => n.toLowerCase()));
  if (seen.size !== names.length) {
    return { ok: false, error: "Two members have the same name." };
  }

  return { ok: true, value: names };
}
