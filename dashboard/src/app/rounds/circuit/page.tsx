// Aliased: `dynamic` is also the name of Next's route-segment config export
// below, and the two would collide.
import nextDynamic from "next/dynamic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { LEVELS } from "@/lib/octovius/levels";
import { isRegistered, solvedLevels } from "@/lib/octovius/progress";
// Imported here as well as in CircuitGame: the gate and the dynamic-import
// fallback below both render `oc-` classes WITHOUT the game ever mounting, and
// would otherwise appear unstyled on the two paths that matter least but look
// worst — "not registered", and a slow chunk.
import "./circuit.css";

/** Progress is per-team and changes mid-event — never serve this from a cache. */
export const dynamic = "force-dynamic";

// The circuit game is a canvas app that reaches for the DOM on init, so it must
// not be server-rendered.
const CircuitGame = nextDynamic(() => import("./CircuitGame"), {
  loading: () => <p className="oc-loading">Powering up the board…</p>,
});

/**
 * /rounds/circuit — the Octavius Circuit round, inside the dashboard.
 *
 * WAS: a separate Next app on port 3003, entered as `/game?team=N`.
 *
 * The team number now comes from the SIGNED SESSION COOKIE rather than a query
 * string, which is the real win of folding it in. The old URL could be edited
 * to play as any team, and the submit endpoint could only defend itself by
 * checking the number was on the roster — it had no way to know who was asking.
 * There is nothing to edit now, and no second port to keep alive.
 *
 * Which level the game opens on is still decided here, from what the team has
 * already cleared, so closing the tab on level 4 does not send them back to
 * level 1.
 *
 * NO DASHBOARD CHROME AROUND IT — deliberately, and unlike the grid and the
 * room. The game ships `game_src/style.css`, which carries `:root`, `*` and
 * `html, body` rules of its own; a dashboard header rendered next to it would
 * be restyled by them. It is full-bleed instead and keeps the look it was drawn
 * with. The footer is the way back, and it is a plain `<a>`, so leaving is a
 * full page load and the game's CSS does not follow the team to the board.
 */
export default async function CircuitRoundPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  let solved: number[] = [];
  let registered = true;

  if (isConfigured()) {
    try {
      registered = await isRegistered(teamNumber);
      if (registered) solved = await solvedLevels(teamNumber);
    } catch (err) {
      // Let them play rather than blocking on a database blip — the submit
      // route re-checks everything anyway, so the worst case is a level they
      // clear twice. `registered` stays true so a blip does not read as "your
      // team does not exist".
      console.error("[circuit] progress read failed", err);
      registered = true;
    }
  }

  if (!registered) {
    return (
      <div className="oc-gate">
        <h1>Team {teamNumber} isn&apos;t registered</h1>
        <p>
          Claim your team number on the hunt board first, then come back through
          the round tile.
        </p>
        <a href="/dashboard">Go to the hunt board →</a>
      </div>
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
