// Aliased: `dynamic` is also the name of Next's route-segment config export
// below, and the two would collide.
import nextDynamic from "next/dynamic";
import { LEVELS } from "@/lib/octovius/levels";
import { isRegistered, solvedLevels } from "@/lib/db";
import { isValidTeamNumber, MAX_TEAM, MIN_TEAM } from "@/lib/teamRange";
import { dashboardUrl } from "@/lib/links";

/** Progress is per-team and changes mid-event — never serve this from a cache. */
export const dynamic = "force-dynamic";

// The circuit game is a canvas app that reaches for the DOM on init, so it must
// not be server-rendered.
const CircuitGame = nextDynamic(() => import("./CircuitGame"), {
  loading: () => <p className="oc-loading">Powering up the board…</p>,
});

/**
 * /game?team=N — the round, for one registered team.
 *
 * The team number comes from the dashboard's link. It is validated and checked
 * against the roster here rather than trusted: an unregistered number would
 * otherwise accumulate progress rows nobody can see.
 *
 * Which level the game opens on is decided here too, from what the team has
 * already cleared, so closing the tab on level 4 does not send them back to
 * level 1.
 */
export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  const teamNumber = team ? Number.parseInt(team, 10) : NaN;

  if (!isValidTeamNumber(teamNumber)) {
    return (
      <Gate
        title="Which team are you?"
        body={`Open this round from your hunt board so it knows your team number (${MIN_TEAM}–${MAX_TEAM}).`}
      />
    );
  }

  let solved: number[] = [];
  let registered = false;
  let degraded = false;

  try {
    registered = await isRegistered(teamNumber);
    if (registered) solved = await solvedLevels(teamNumber);
  } catch (err) {
    // Let them play rather than blocking on a database blip — the submit route
    // re-checks everything anyway, so the worst case is a level they clear
    // twice.
    console.error("[game] progress read failed", err);
    degraded = true;
  }

  if (!registered && !degraded) {
    return (
      <Gate
        title={`Team ${teamNumber} isn't registered`}
        body="Claim your team number on the hunt board first, then come back through the round tile."
      />
    );
  }

  // Resume on the first level they have NOT cleared; if they have cleared them
  // all, drop them on the last one so revisiting still shows a board.
  const firstUnsolved = LEVELS.findIndex((l) => !solved.includes(l.id));
  const startIndex = firstUnsolved === -1 ? LEVELS.length - 1 : firstUnsolved;

  return (
    <CircuitGame
      teamNumber={teamNumber}
      startIndex={startIndex}
      initialSolved={solved}
      totalLevels={LEVELS.length}
    />
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="oc-gate">
      <h1>{title}</h1>
      <p>{body}</p>
      <a href={dashboardUrl()}>Go to the hunt board →</a>
    </div>
  );
}
