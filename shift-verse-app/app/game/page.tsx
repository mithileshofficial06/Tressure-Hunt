import ShiftVerse from '../components/ShiftVerse';
import { isValidTeamNumber } from '@/lib/teamRange';
import { hasSolvedRound } from '@/lib/hunt';

/** Progress is per-team and changes mid-event — never serve this from a cache. */
export const dynamic = 'force-dynamic';

/**
 * /game — optionally pre-loaded with a team.
 *
 * `?team=7` skips the "identify your dimension" screen and drops straight into
 * that team's puzzle. That is how the registration dashboard hands a team over:
 * they already typed their number once to register, and asking again is both
 * friction and a chance to fat-finger a different team's board.
 *
 * Read here in the server component rather than with `useSearchParams` in the
 * client so the puzzle is chosen before the first paint — no entry screen
 * flashing up and being replaced a moment later.
 *
 * A missing or malformed value simply falls through to the entry screen, so
 * opening /game by hand still works.
 */
export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  const parsed = team ? parseInt(team, 10) : NaN;
  const initialTeam = isValidTeamNumber(parsed) ? parsed : null;

  // Gates the Finish button. Read from the server, not inferred in the browser:
  // a team returning to a round they already cleared should still be able to
  // collect it, and nothing the page decides on its own may enable that button.
  let alreadySolved = false;
  if (initialTeam !== null) {
    try {
      alreadySolved = await hasSolvedRound(initialTeam);
    } catch (err) {
      // Let them play. Worst case the button stays disabled until they solve.
      console.error('[game] progress read failed', err);
    }
  }

  return <ShiftVerse initialTeam={initialTeam} alreadySolved={alreadySolved} />;
}
