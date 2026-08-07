"use client";

import { useEffect, useState } from "react";
import type { HuntEvent } from "@/lib/events";
import { elapsedSince, formatClock, formatDuration } from "@/lib/format";

export interface SolvedRound {
  slug: string;
  solvedAt: string;
  markedBy: "team" | "admin";
}

/**
 * The five rounds, for one registered team.
 *
 * Each tile can be stamped done, and the stamp is one-way from here: there is
 * no "undo" button because a team that can rewind its own clock can rewrite its
 * own finish time. Corrections are a coordinator's job on the admin board.
 *
 * The running clock ticks client-side from `registeredAt` rather than being
 * pushed from the server, so it stays smooth without a request per second. Once
 * the team finishes it freezes at the stored duration — the server's number,
 * not the browser's, so every screen agrees on the result.
 */
export default function Dashboard({
  teamNumber,
  members,
  events,
  solved: initialSolved,
  registeredAt,
  completedAt: initialCompletedAt,
  durationMs: initialDurationMs,
  degraded,
}: {
  teamNumber: number;
  members: string[];
  events: HuntEvent[];
  solved: SolvedRound[];
  registeredAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  degraded: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [solved, setSolved] = useState<SolvedRound[]>(initialSolved);
  const [completedAt, setCompletedAt] = useState(initialCompletedAt);
  const [durationMs, setDurationMs] = useState(initialDurationMs);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const byslug = new Map(solved.map((s) => [s.slug, s]));
  const finished = completedAt !== null;

  /* The clock. Starts as null and is only set in an effect so the server-
     rendered HTML and the first client render agree — reading Date.now()
     during render is a hydration mismatch waiting to happen. */
  useEffect(() => {
    if (finished) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [finished]);

  const earned = events.reduce((sum, e) => sum + (byslug.has(e.slug) ? e.points : 0), 0);
  const total = events.reduce((sum, e) => sum + e.points, 0);

  const runningMs =
    finished || !registeredAt || now === null ? durationMs : elapsedSince(registeredAt, now);

  async function markDone(slug: string) {
    if (pending || byslug.has(slug)) return;
    setPending(slug);
    setError(null);

    try {
      const res = await fetch("/api/team/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Couldn't save that. Try again.");
        return;
      }

      // Trust the server's list wholesale rather than patching local state:
      // it also carries any admin override that landed since this page loaded.
      setSolved(body.solved ?? []);
      setCompletedAt(body.completedAt ?? null);
      setDurationMs(body.durationMs ?? null);
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setPending(null);
    }
  }

  async function signOut() {
    await fetch("/api/team/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <main className="min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-3xl">
        {/* ── Masthead ──────────────────────────────────────────────────── */}
        <header className="anim-rise flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="tag tag-accent">XPLORE&apos;26</span>
              <span className="label">Team board</span>
            </div>
            <h1 className="display mt-4 text-4xl text-ink sm:text-5xl">Treasure Hunt</h1>
          </div>

          <div className="slab-flat shrink-0 px-5 py-3 text-center">
            <span className="label block">Team</span>
            <span className="display mt-1 block text-4xl tabular text-accent-ink">
              {String(teamNumber).padStart(2, "0")}
            </span>
          </div>
        </header>

        <hr className="rule-line mt-4" />

        {members.length > 0 && (
          <p className="anim-rise mt-3 font-mono text-xs text-ink-2">{members.join("  ·  ")}</p>
        )}

        {/* ── Score strip ───────────────────────────────────────────────── */}
        <section className="anim-rise mt-6 grid gap-px border-2 border-rule bg-rule sm:grid-cols-3">
          <Stat label="Points" value={String(earned)} sub={`of ${total}`} />
          <Stat label="Rounds cleared" value={String(byslug.size)} sub={`of ${events.length}`} />
          <Stat
            label={finished ? "Final time" : "Elapsed"}
            value={runningMs === null ? "—" : formatDuration(runningMs)}
            accent={finished}
          />
        </section>

        <div className="anim-rise mt-4 flex justify-end">
          <button onClick={() => void signOut()} className="btn">
            Sign out
          </button>
        </div>

        {/* ── The consolidated finish ───────────────────────────────────── */}
        {finished && (
          <section className="slab slab-good anim-pop mt-6 p-5">
            <p className="display text-lg text-good">All five rounds cleared</p>
            <p className="mt-1 font-mono text-xs text-ink-2">
              Finished {formatClock(completedAt)} · total {formatDuration(durationMs)}
            </p>
          </section>
        )}

        {degraded && (
          <p className="anim-rise mt-4 font-mono text-xs text-warn">
            Couldn&apos;t read progress — rounds may show as unsolved.
          </p>
        )}
        {error && <p className="anim-rise mt-4 font-mono text-xs text-bad">{error}</p>}

        {/* ── Round list ────────────────────────────────────────────────── */}
        <h2 className="label mt-10">Rounds</h2>
        <hr className="rule-line mt-2" />

        <ul className="mt-4 grid gap-3">
          {events.map((e, i) => {
            const row = byslug.get(e.slug);
            const isSolved = row !== undefined;
            const isOpen = open === e.slug;

            return (
              <li key={e.slug} className="anim-rise">
                <div className={`slab ${isSolved ? "slab-good" : ""}`}>
                  <button
                    onClick={() => setOpen(isOpen ? null : e.slug)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 p-4 text-left hover:bg-accent-wash"
                  >
                    {/* Rounds are told apart by number, not by colour. */}
                    <span
                      className={`display flex h-11 w-11 shrink-0 items-center justify-center border-2 border-rule text-lg tabular ${
                        isSolved ? "bg-good text-white" : "bg-paper-2 text-ink"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <span className="display block truncate text-lg text-ink">{e.title}</span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">
                        {isSolved ? `Cleared ${formatClock(row.solvedAt)}` : e.tagline}
                      </span>
                    </div>

                    <span className={`tag shrink-0 ${isSolved ? "tag-good" : "tag-muted"}`}>
                      {isSolved ? "Solved" : `${e.points} pts`}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="anim-pop border-t-2 border-rule px-4 pb-4 pt-4">
                      <p className="text-sm leading-relaxed text-ink-2">{e.blurb}</p>

                      {isSolved && (
                        <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
                          Stamped {formatClock(row.solvedAt)}
                          {row.markedBy === "admin" && " by a coordinator"}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {e.href && (
                          <a href={e.href} className="btn btn-accent">
                            {isSolved ? "Revisit round" : "Enter round"}
                          </a>
                        )}

                        {isSolved ? (
                          <span className="tag tag-good">Complete</span>
                        ) : (
                          <button
                            onClick={() => void markDone(e.slug)}
                            disabled={pending !== null}
                            className="btn"
                          >
                            {pending === e.slug ? "Saving…" : "Mark complete"}
                          </button>
                        )}

                        <span className="ml-auto font-mono text-[0.7rem] text-ink-3">
                          {e.slug}
                        </span>
                      </div>

                      {!isSolved && (
                        <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
                          Marking is final — ask a coordinator to undo a mistake.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <hr className="rule-line-soft mt-10" />
        <p className="mt-3 text-center font-mono text-[0.7rem] text-ink-3">
          Your number is yours for the day. Signing out does not release it.
        </p>
      </div>
    </main>
  );
}

/** One cell of the score strip. The 1px gaps come from the parent's bg-rule. */
function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card p-4">
      <span className="label block">{label}</span>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={`stat-value ${accent ? "text-accent-ink" : "text-ink"}`}>{value}</span>
        {sub && <span className="font-mono text-xs text-ink-3">{sub}</span>}
      </p>
    </div>
  );
}
