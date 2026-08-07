import CoordinatorDashboard from "../pages/CoordinatorDashboard";
import CoordinatorGate from "./CoordinatorGate";
import BlueprintFonts from "../BlueprintFonts";
import { isAdminRequest } from "@/lib/admin";
import "../blueprint.css";

export const dynamic = "force-dynamic";

/**
 * /rounds/blueprint/coordinator — mission control for Blueprint Recovery.
 *
 * ── THE ROUTE COLLISION THIS AVOIDS ────────────────────────────────────────
 * In the standalone app this board lived at `/dashboard`. That is the hunt's
 * team board in this app — the single most-visited page of the event — so
 * dropping the folder in unchanged would have replaced it with a coordinator
 * screen. It is nested under the round instead, where it cannot collide with
 * anything.
 *
 * ── THE GATE IS HERE, ON THE SERVER ────────────────────────────────────────
 * The component used to gate itself in the browser against a password inlined
 * into the bundle. Now the page checks the dashboard's admin cookie before it
 * renders anything, and `/api/blueprint/coordinator` checks it again on every
 * request — so this being visible and the actions being permitted are two
 * separate checks, and neither is done by the client.
 *
 * ── WITHOUT THE COOKIE YOU GET A SIGN-IN, NOT A REDIRECT ──────────────────
 * This used to `redirect("/dashboard")`, which was correct security and awful
 * behaviour: a coordinator opening the URL landed on the TEAM board with no
 * message, no mention of coordinator access, and no way to get in. It read as
 * the page being broken.
 *
 * The board is still never rendered without the cookie — that check is the two
 * lines below, on the server, and `/api/blueprint/coordinator` repeats it on
 * every request. What changed is that the refusal now explains itself and
 * offers the way through. `CoordinatorGate` posts to the hunt's existing
 * `/api/admin/login`, so the code is checked server-side and rate-limited, and
 * there is no second secret anywhere.
 */
export default async function BlueprintCoordinatorPage() {
  if (!(await isAdminRequest())) {
    return (
      <>
        <BlueprintFonts />
        <CoordinatorGate />
      </>
    );
  }

  return (
    <>
      <BlueprintFonts />
      <CoordinatorDashboard />
    </>
  );
}
