import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TeamEntry from "./TeamEntry";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { maxTeam } from "@/lib/teamNumber";

/**
 * The gate. A browser that already holds a valid team cookie never sees it.
 *
 * The redirect happens on the server, before any HTML is sent, so a returning
 * team doesn't get a flash of the registration form on every page load.
 */
export default async function Page() {
  const team = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (team !== null) redirect("/dashboard");

  return <TeamEntry max={maxTeam()} configured={isConfigured()} />;
}
