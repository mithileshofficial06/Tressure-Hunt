import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";
import { isAdminRequest } from "@/lib/admin";
import { allTeamsWithProgress, isConfigured, type TeamView } from "@/lib/db";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * The coordinator's board.
 *
 * Gated on the admin cookie, and the redirect is a bare "/" rather than an
 * error page: someone without the cookie should not learn that this route
 * exists, they should just land on registration like anyone else.
 */
export default async function AdminPage() {
  if (!(await isAdminRequest())) redirect("/");

  let teams: TeamView[] = [];
  let degraded = false;

  if (isConfigured()) {
    try {
      teams = await allTeamsWithProgress();
    } catch (err) {
      // Render the shell with an explicit warning rather than an error page.
      // The client polls every few seconds, so a blip recovers on its own and
      // the coordinator never has to reload anything mid-event.
      console.error("[admin] read failed", err);
      degraded = true;
    }
  }

  return (
    <AdminDashboard
      initialTeams={teams}
      events={[...EVENTS]}
      configured={isConfigured()}
      degraded={degraded}
    />
  );
}
