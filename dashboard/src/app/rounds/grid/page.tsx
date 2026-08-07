import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SixtyFourGrid from "./SixtyFourGrid";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { EQUATIONS, gridCells } from "@/lib/hunt/gridPuzzle.server";
import { huntProgress, isConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The 64 Grid round, inside the dashboard.
 *
 * WHY THIS ONE IS NOT A SEPARATE APP. Shift Verse and Octavius Circuit each
 * carry an engine, their own stylesheet and megabytes of media, so they run as
 * their own deployments and the tile links out. This round is a React component
 * using the design system this app already defines — spinning up a fourth
 * server for it would mean duplicating Tailwind, the tokens and the theme to
 * gain nothing.
 *
 * Being in-app buys something the other two rounds don't have: THE TEAM IS
 * AUTHENTICATED. The signed session cookie says which team this is, so nobody
 * can solve the round on another team's behalf by editing a query string.
 *
 * The client is handed the shuffled letter/colour pairs and the equations, and
 * nothing else — no word list, no seed, no target colour. See
 * `gridPuzzle.server.ts`.
 */
export default async function GridRoundPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  let alreadySolved = false;

  if (isConfigured()) {
    try {
      const progress = await huntProgress();
      const row = await progress.findOne({ teamNumber, challengeSlug: "hunt-grid" });
      alreadySolved = Boolean(row?.solvedAt);
    } catch (err) {
      // Show the puzzle anyway. The submit route re-checks, and the worst case
      // is a solved team being told they can solve it again.
      console.error("[grid] progress read failed", err);
    }
  }

  return (
    <main className="min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="anim-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="tag tag-accent">Round 04</span>
              <span className="label">64 Grid</span>
            </div>
            <h1 className="display mt-4 text-4xl text-ink sm:text-5xl">64 Grid</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-2">
              Sixty-four coloured letters. Three equations pick a colour; that
              colour&apos;s eight letters anagram to the answer.
            </p>
          </div>

          {/* Navigation lives in the footer, where the Back/Finish pair sits
              together — a second "back" up here would just be a second place
              to look for the same thing. */}
          <span className="tag tag-muted">Team {String(teamNumber).padStart(2, "0")}</span>
        </header>

        <hr className="rule-line mt-4" />

        {alreadySolved && (
          <div className="slab slab-good anim-rise mt-6 p-4">
            <p className="display text-sm text-good">
              Your team has already cleared this round
            </p>
            <p className="mt-1 font-mono text-xs text-ink-2">
              The board is left here to look at — solving it again changes nothing.
            </p>
          </div>
        )}

        <div className="anim-rise mt-6">
          <SixtyFourGrid
            cells={gridCells()}
            equations={[...EQUATIONS]}
            alreadySolved={alreadySolved}
          />
        </div>
      </div>
    </main>
  );
}
