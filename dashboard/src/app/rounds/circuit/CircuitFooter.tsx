"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDuration } from "@/lib/format";

/**
 * Back-to-hunt and Finish-round, for the circuit round.
 *
 * A SKIN, not a second implementation. It is `rounds/RoundFooter.tsx` wearing
 * the game's dark chrome instead of the Concrete palette, and it exists for one
 * reason: this route is full-bleed game, and `game_src/style.css` sets `:root`,
 * `*` and `html, body` for the whole document while it is mounted. The shared
 * footer's `.slab` / `.btn` styling is drawn for a paper background and would
 * be fighting those rules on a black page. Behaviour is identical on purpose:
 * same gating, same endpoint, same numbers, same wording.
 *
 * It now reads the DASHBOARD's `/api/team/summary` off the session cookie —
 * upstream this hit `/api/circuit/summary?team=N`, a duplicate endpoint that
 * existed only because the game was on another origin. That endpoint is gone.
 *
 * FINISH IS DISABLED UNTIL ALL FIVE LEVELS ARE CLEARED. `solved` is whether the
 * server has stamped the `circuit-1` round — five verified boards — not
 * anything the browser worked out for itself. A team on level 4 cannot use this
 * to bank a round they have not finished.
 *
 * `autoOpen` opens the same dialogue by itself the moment that stamp arrives, so
 * finishing the fifth circuit ends in the points rather than in a button the
 * player has to go looking for in a 46px bar.
 *
 * THE DIALOGUE IS PORTALLED TO `document.body`, and it has to be. This component
 * renders inside `.oc-bar`, which sets `backdrop-filter` — that makes the bar
 * the containing block for `position: fixed` descendants, so `.oc-overlay`'s
 * `inset: 0` resolved against a 46px-tall strip and the bar's `overflow-x: auto`
 * scrolled what was left. The summary was rendering, squeezed into the bar.
 */

interface Summary {
  rounds: Array<{ slug: string; elapsedMs: number | null; splitMs: number | null }>;
  solvedCount: number;
  totalRounds: number;
  points: number;
  totalPoints: number;
  latestElapsedMs: number | null;
  totalMs: number | null;
}

/* `formatDuration` was a local copy of the dashboard's, character for character,
   because this used to be a different app. It now imports the real one — one
   definition means the circuit's finish card and the hunt board can never
   disagree about how long a team has been playing. */

export default function CircuitFooter({
  solved,
  autoOpen = false,
}: {
  solved: boolean;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const finish = useCallback(async () => {
    if (!solved) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/summary", { cache: "no-store", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't read your progress.");
        return;
      }
      setSummary(body);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [solved]);

  // Once, on the transition into a finished round. Not on every render where
  // `autoOpen` happens to still be true, or dismissing it would be impossible.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpen || !solved || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    void finish();
  }, [autoOpen, solved, finish]);

  const mine = summary?.rounds.find((r) => r.slug === "circuit-1") ?? null;
  const finishedHunt = summary?.totalMs != null;

  return (
    <>
      <div className="oc-footer">
        <a href={"/dashboard"} className="oc-btn">
          ← Back to hunt
        </a>
        <button
          onClick={() => void finish()}
          disabled={!solved}
          className="oc-btn oc-btn--primary"
          title={solved ? "Record this round and return" : "Clear all five levels first"}
        >
          Finish round
        </button>
        {!solved && (
          <span className="oc-footer__hint">Clear all five levels to enable this.</span>
        )}
      </div>

      {open &&
        createPortal(
          <div
            className="oc-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="oc-finish-title"
              className="oc-dialog"
            >
            {loading ? (
              <p className="oc-dialog__muted">Reading your progress…</p>
            ) : error ? (
              <>
                <h2 id="oc-finish-title" className="oc-dialog__title">
                  Couldn&apos;t load your score
                </h2>
                <p className="oc-dialog__muted">{error}</p>
                <a href={"/dashboard"} className="oc-btn oc-btn--primary oc-btn--full">
                  Go to hunt
                </a>
              </>
            ) : summary ? (
              <>
                <span className="oc-dialog__badge">
                  {finishedHunt ? "Hunt complete" : "Round cleared"}
                </span>
                <h2 id="oc-finish-title" className="oc-dialog__title">
                  Octavius Circuit
                </h2>
                <p className="oc-dialog__lead">All five circuits complete.</p>

                <div className="oc-dialog__points">
                  <span>Points this round</span>
                  <strong>+{summary.totalPoints / summary.totalRounds}</strong>
                </div>

                <dl className="oc-dialog__rows">
                  <Row label="Total points" value={`${summary.points} / ${summary.totalPoints}`} />
                  <Row
                    label="Rounds cleared"
                    value={`${summary.solvedCount} / ${summary.totalRounds}`}
                  />
                  <Row label="Time on this round" value={formatDuration(mine?.splitMs ?? null)} />
                  <Row
                    label={finishedHunt ? "Total time" : "Clock now reads"}
                    value={formatDuration(
                      finishedHunt ? summary.totalMs : (mine?.elapsedMs ?? summary.latestElapsedMs)
                    )}
                    strong
                  />
                </dl>

                <p className="oc-dialog__muted">
                  {finishedHunt
                    ? `All ${summary.totalRounds} rounds done — your final time is locked in.`
                    : `The clock keeps running. Your next round starts from ${formatDuration(
                        mine?.elapsedMs ?? summary.latestElapsedMs
                      )}.`}
                </p>

                <a href={"/dashboard"} className="oc-btn oc-btn--primary oc-btn--full">
                  Go to hunt
                </a>
                <button onClick={close} className="oc-btn oc-btn--full">
                  Stay here
                </button>
              </>
            ) : null}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="oc-dialog__row">
      <dt>{label}</dt>
      <dd className={strong ? "is-strong" : undefined}>{value}</dd>
    </div>
  );
}
