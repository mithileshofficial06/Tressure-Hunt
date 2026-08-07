import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ShiftVerse from "./ShiftVerse";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { huntProgress, isConfigured } from "@/lib/db";
import { SHIFTVERSE_SLUG } from "@/lib/events";
// The round's own theme — 1.2k lines, and it owns `:root`, `*` and `html, body`
// while this route is mounted. Loaded here so the board and the result screen
// both get it, and only on these two routes.
import "./shiftverse.css";

/** Progress is per-team and changes mid-event — never serve this from a cache. */
export const dynamic = "force-dynamic";

/**
 * /rounds/shiftverse — the Shift Verse round, inside the dashboard.
 *
 * WAS: a separate Next app on port 3001, entered as `/game?team=N`, with an
 * "identify your dimension" screen for anyone arriving without the query
 * string. Both are gone: the signed session cookie says which team this is, so
 * the board cannot be opened as another team by editing a URL and there is no
 * number to type twice.
 *
 * NO DASHBOARD CHROME — same reasoning as the circuit round. `shiftverse.css`
 * restyles the document root, so a Concrete-palette header rendered beside it
 * would be caught in the crossfire. The round is full-bleed and keeps the look
 * it was drawn with; the footer is the way back, and it is a full page load.
 */
export default async function ShiftVerseRoundPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  // Gates the Finish button. Read from the server, not inferred in the browser:
  // a team returning to a round they already cleared should still be able to
  // collect it, and nothing the page decides on its own may enable that button.
  let alreadySolved = false;

  if (isConfigured()) {
    try {
      const progress = await huntProgress();
      const row = await progress.findOne({ teamNumber, challengeSlug: SHIFTVERSE_SLUG });
      alreadySolved = Boolean(row?.solvedAt);
    } catch (err) {
      // Let them play. Worst case the button stays disabled until they solve.
      console.error("[shiftverse] progress read failed", err);
    }
  }

  return <ShiftVerse teamNumber={teamNumber} alreadySolved={alreadySolved} />;
}
