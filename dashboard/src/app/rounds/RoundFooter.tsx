"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";

interface RoundTiming {
  slug: string;
  solvedAt: string | null;
  elapsedMs: number | null;
  splitMs: number | null;
  order: number | null;
}

interface Summary {
  rounds: RoundTiming[];
  solvedCount: number;
  totalRounds: number;
  points: number;
  totalPoints: number;
  latestElapsedMs: number | null;
  totalMs: number | null;
  error?: string;
}

/**
 * The two buttons every round carries, and the dialogue behind one of them.
 *
 * BACK TO HUNT always works — a team must be able to leave a round they cannot
 * finish. FINISH ROUND is disabled until the round is genuinely solved, which
 * is the whole point: it cannot be used to bail out early or to claim a round
 * nobody completed. `solved` comes from the server in every case (a verified
 * answer, a verified board), never from anything the page decided on its own.
 *
 * The dialogue reads the summary FRESH on open rather than from whatever the
 * solve response happened to say. A team can solve, wander off, and click
 * Finish ten minutes later — and the numbers still have to be right. Waiting
 * costs them nothing, because a round's time is measured to its solve stamp,
 * not to the click.
 */
export default function RoundFooter({
  slug,
  title,
  solved,
  dashboardUrl = "/dashboard",
  summaryUrl = "/api/team/summary",
}: {
  slug: string;
  title: string;
  solved: boolean;
  dashboardUrl?: string;
  summaryUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLAnchorElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, and focus moves into the dialogue when it opens — without
  // this a keyboard user is left tabbing around the page behind the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function finish() {
    if (!solved) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(summaryUrl, { cache: "no-store", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't read your progress.");
        return;
      }
      setSummary(body);
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const thisRound = summary?.rounds.find((r) => r.slug === slug) ?? null;
  const finishedHunt = summary?.totalMs != null;

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a href={dashboardUrl} className="btn">
          ← Back to hunt
        </a>

        <button
          onClick={() => void finish()}
          disabled={!solved}
          className="btn btn-accent"
          title={solved ? "Record this round and return" : "Finish the round first"}
        >
          Finish round
        </button>

        {!solved && (
          <span className="font-mono text-xs text-ink-3">
            Solve the round to enable this.
          </span>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-5"
          onClick={(e) => {
            // Backdrop click closes; clicks inside must not bubble out to it.
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            className="slab anim-pop w-full max-w-md p-6"
          >
            {loading ? (
              <p className="font-mono text-sm text-ink-2">Reading your progress…</p>
            ) : error ? (
              <>
                <p className="display text-lg text-bad">Couldn&apos;t load your score</p>
                <p className="mt-2 font-mono text-xs text-ink-2">{error}</p>
                <a href={dashboardUrl} className="btn btn-accent mt-6 w-full">
                  Go to hunt
                </a>
              </>
            ) : summary ? (
              <>
                <span className="tag tag-accent">
                  {finishedHunt ? "Hunt complete" : "Round cleared"}
                </span>

                <h2 id="finish-title" className="display mt-4 text-2xl text-ink">
                  {title}
                </h2>

                <hr className="rule-line mt-4" />

                {/* Points for this round, then the running total. */}
                <div className="mt-4 flex items-end justify-between">
                  <span className="label">Points this round</span>
                  <span className="display text-3xl tabular text-accent-ink">
                    +{summary.totalPoints / summary.totalRounds}
                  </span>
                </div>

                <div className="mt-4 grid gap-px border-2 border-rule bg-rule">
                  <Row
                    label="Total points"
                    value={`${summary.points} / ${summary.totalPoints}`}
                  />
                  <Row
                    label="Rounds cleared"
                    value={`${summary.solvedCount} / ${summary.totalRounds}`}
                  />
                  <Row label="Time on this round" value={formatDuration(thisRound?.splitMs ?? null)} />
                  {/* The number that continues: the clock does not reset between
                      rounds, so this is where the next one starts from. */}
                  <Row
                    label={finishedHunt ? "Total time" : "Clock now reads"}
                    value={formatDuration(
                      finishedHunt ? summary.totalMs : (thisRound?.elapsedMs ?? summary.latestElapsedMs)
                    )}
                    strong
                  />
                </div>

                {finishedHunt ? (
                  <p className="mt-4 font-mono text-xs text-good">
                    All {summary.totalRounds} rounds done — your final time is locked in.
                  </p>
                ) : (
                  <p className="mt-4 font-mono text-xs text-ink-3">
                    The clock keeps running. Your next round starts from{" "}
                    {formatDuration(thisRound?.elapsedMs ?? summary.latestElapsedMs)}.
                  </p>
                )}

                <a ref={closeRef} href={dashboardUrl} className="btn btn-accent mt-6 w-full">
                  Go to hunt
                </a>
                <button onClick={close} className="btn mt-2 w-full">
                  Stay here
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between bg-card px-4 py-2.5">
      <span className="label">{label}</span>
      <span
        className={`font-mono tabular ${
          strong ? "text-base font-bold text-ink" : "text-sm text-ink-2"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
