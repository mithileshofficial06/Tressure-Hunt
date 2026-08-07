/**
 * The valid team-number range, in one place.
 *
 * The original code repeated `< 1 || > 40` in three route handlers, the team
 * entry form and the Mongoose model. Raising the roster to 60 meant finding all
 * five; missing one would have produced a round that accepted a team number the
 * seed had no word for, and reported it as "team not found" mid-event.
 *
 * MUST STAY IN SYNC WITH THE DASHBOARD'S `MAX_TEAMS`. The dashboard hands out
 * numbers; this app has to have a puzzle for every number it hands out.
 */
export const MIN_TEAM = 1;
export const MAX_TEAM = 60;

export function isValidTeamNumber(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_TEAM && n <= MAX_TEAM;
}

/**
 * The Caesar shift for a team.
 *
 * Normally just the team number — the seed's original rule. The exception is
 * multiples of 26: a shift of 26 is congruent to 0, so `caesarEncrypt` returns
 * the plaintext unchanged and the "encrypted" word on screen IS the answer.
 * Teams 26 and 52 hit that. They get 13 instead.
 *
 * Safe to change because the shift is never told to the players — the whole
 * puzzle is discovering it with the steppers — so "shift = team number" was an
 * implementation convenience, not a rule anyone plays by.
 */
export function shiftKeyFor(teamNumber: number): number {
  return teamNumber % 26 === 0 ? 13 : teamNumber;
}
