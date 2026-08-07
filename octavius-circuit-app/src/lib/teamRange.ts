/**
 * The valid team-number range.
 *
 * MUST STAY IN SYNC WITH THE DASHBOARD'S `MAX_TEAMS` and with
 * `shift-verse-app/lib/teamRange.ts`. The dashboard hands out the numbers; a
 * round that rejects one it handed out is a team that cannot play.
 */
export const MIN_TEAM = 1;
export const MAX_TEAM = 60;

export function isValidTeamNumber(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_TEAM && n <= MAX_TEAM;
}
