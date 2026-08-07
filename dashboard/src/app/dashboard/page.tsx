import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Dashboard, { type SolvedRound } from "./Dashboard";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { resolveEventHrefs } from "@/lib/events";
import { findTeam, huntProgress, isConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The board, for one team.
 *
 * Progress is read from `hunt_progress` — the same collection and the same
 * document shape SympoApp's graders write — so pointing this at the real
 * database lights the tiles up with real solves and no code change here. When
 * that collection is empty (or absent, which Mongo treats the same way) every
 * round simply reads as unsolved, which is the correct state before an event
 * starts.
 */
export default async function DashboardPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  let solved: SolvedRound[] = [];
  let members: string[] = [];
  let registeredAt: string | null = null;
  let completedAt: string | null = null;
  let durationMs: number | null = null;
  let degraded = false;
  let missing = false;

  if (isConfigured()) {
    try {
      const team = await findTeam(teamNumber);

      // The cookie outlived its row — the roster was reset while this browser
      // held a session. Flag it and redirect BELOW, outside the try: Next's
      // redirect() signals by throwing, so calling it here would be swallowed
      // by our own catch and reported as "couldn't read progress".
      if (!team) {
        missing = true;
      } else {
        members = team.members ?? [];
        registeredAt = team.registeredAt.toISOString();
        completedAt = team.completedAt ? team.completedAt.toISOString() : null;
        durationMs = team.durationMs ?? null;

        const progress = await huntProgress();
        const rows = await progress
          .find({ teamNumber, solvedAt: { $ne: null } }, { projection: { _id: 0 } })
          .toArray();

        solved = rows.map((r) => ({
          slug: r.challengeSlug,
          solvedAt: r.solvedAt!.toISOString(),
          markedBy: r.markedBy,
        }));
      }
    } catch (err) {
      // A team that has registered should still see their board if the
      // progress read fails — showing nothing solved is a better failure than
      // an error page they can't get past.
      console.error("[dashboard] read failed", err);
      degraded = true;
    }
  }

  if (missing) redirect("/");

  return (
    <Dashboard
      teamNumber={teamNumber}
      members={members}
      events={resolveEventHrefs(teamNumber)}
      solved={solved}
      registeredAt={registeredAt}
      completedAt={completedAt}
      durationMs={durationMs}
      degraded={degraded}
    />
  );
}
