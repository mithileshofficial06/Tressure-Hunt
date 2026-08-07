import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import App from "./App";
import BlueprintFonts from "./BlueprintFonts";
import BlueprintFooter from "./BlueprintFooter";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { huntProgress, isConfigured } from "@/lib/db";
import { BLUEPRINT_SLUG } from "@/lib/events";
// The round's own noir theme. Sets `:root`, `*` and `html, body` for these two
// routes only — same arrangement as the circuit and Shift Verse.
import "./blueprint.css";

export const dynamic = "force-dynamic";

/**
 * /rounds/blueprint — Blueprint Recovery, inside the dashboard.
 *
 * WAS: a standalone Next app backed by Supabase, with its own team-number entry
 * screen and `localStorage.blueprint_team_number` for identity. It is now an
 * ordinary route on this app, on MongoDB, and the team comes from the signed
 * session cookie.
 *
 * THE ROUND HAS A HUMAN IN THE MIDDLE, which is what makes it different from
 * the other four: a team walks to a physical sector, presses "notify", and a
 * COORDINATOR releases the location before the access code can be entered.
 * That gate is enforced in `lib/blueprint/progress.ts`, not in the UI — no
 * amount of clicking advances a team past `awaiting_reveal`.
 *
 * NO DASHBOARD CHROME, for the same reason as the circuit and Shift Verse:
 * `blueprint.css` restyles the document root. The footer is the way back.
 */
export default async function BlueprintRoundPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  let alreadySolved = false;

  if (isConfigured()) {
    try {
      const progress = await huntProgress();
      const row = await progress.findOne({ teamNumber, challengeSlug: BLUEPRINT_SLUG });
      alreadySolved = Boolean(row?.solvedAt);
    } catch (err) {
      // Let them play. The checkpoint route re-checks everything.
      console.error("[blueprint] progress read failed", err);
    }
  }

  return (
    <>
      <BlueprintFonts />
      <App />
      <BlueprintFooter solved={alreadySolved} />
    </>
  );
}
