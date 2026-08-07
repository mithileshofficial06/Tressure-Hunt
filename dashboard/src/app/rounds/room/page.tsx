import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import RoomRound from "./RoomRound";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { huntProgress, isConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The Mystery Room round, inside the dashboard.
 *
 * WHY THIS ONE IS IN-APP. Same test as the 64 Grid: it is React, and it needs
 * no engine of its own. It does carry weight — three.js, drei and ~7,000 lines
 * of scene — but that is a CHUNK problem, not a deployment problem, and
 * `RoomRound` solves it by loading the room dynamically so nothing else in the
 * app pays for it. Shift Verse and Octavius Circuit stay separate because they
 * bring their own stylesheets and media, not because they are large.
 *
 * Being in-app buys the same thing it buys the grid: THE TEAM IS AUTHENTICATED.
 * The signed session cookie says which team this is, so nobody clears the round
 * on another team's behalf by editing a query string.
 *
 * Unlike the grid there is nothing to withhold from the client — every section
 * word is drawn into the 3D scene, which is the puzzle. So this page fetches no
 * puzzle data at all; it checks who is asking, asks whether they are already
 * done, and hands over. See `roomPuzzle.server.ts`.
 */
export default async function RoomRoundPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  let alreadySolved = false;

  if (isConfigured()) {
    try {
      const progress = await huntProgress();
      const row = await progress.findOne({ teamNumber, challengeSlug: "hunt-room" });
      alreadySolved = Boolean(row?.solvedAt);
    } catch (err) {
      // Show the room anyway. The submit route re-checks, and the worst case is
      // a solved team being told they can solve it again.
      console.error("[room] progress read failed", err);
    }
  }

  return (
    <main className="min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="anim-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="tag tag-accent">Round 03</span>
              <span className="label">Mystery Room</span>
            </div>
            <h1 className="display mt-4 text-4xl text-ink sm:text-5xl">Mystery Room</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-2">
              An antique room with five locked sections. Each hides a word
              written somewhere in the scene — on paper, in a web, in a beam of
              light. Find it, type it, open the section.
            </p>
          </div>

          {/* Navigation lives in the footer, where the Back/Finish pair sits
              together — matching the grid round. */}
          <span className="tag tag-muted">Team {String(teamNumber).padStart(2, "0")}</span>
        </header>

        <hr className="rule-line mt-4" />

        <div className="anim-rise mt-6">
          <RoomRound alreadySolved={alreadySolved} />
        </div>
      </div>
    </main>
  );
}
