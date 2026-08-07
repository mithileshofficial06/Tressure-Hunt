import { redirect } from "next/navigation";
import CoordinatorDashboard from "../pages/CoordinatorDashboard";
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
 * A non-coordinator is REDIRECTED TO THE HUNT BOARD rather than shown a login.
 * A password box on a public URL invites guessing; teams reach coordinator mode
 * the one way this app has always allowed, by typing `ADMIN_CODE` into the
 * team-number box on the entry screen.
 */
export default async function BlueprintCoordinatorPage() {
  if (!(await isAdminRequest())) redirect("/dashboard");

  return (
    <>
      <BlueprintFonts />
      <CoordinatorDashboard />
    </>
  );
}
