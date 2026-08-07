"use client";

import { useCallback, useEffect, useState } from "react";
import { dashboardUrl } from "@/lib/links";

/**
 * Back-to-hunt and Finish-round, for this app.
 *
 * A PORT of `dashboard/src/app/rounds/RoundFooter.tsx`, skinned for this app's
 * dark chrome rather than the dashboard's Concrete palette. Behaviour is
 * identical on purpose: same gating, same numbers, same wording.
 *
 * FINISH IS DISABLED UNTIL ALL FIVE LEVELS ARE CLEARED. `solved` is whether the
 * server has stamped the `circuit-1` round — five verified boards — not
 * anything the browser worked out for itself. A team on level 4 cannot use this
 * to bank a round they have not finished.
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

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export default function RoundFooter({
  teamNumber,
  solved,
}: {
  teamNumber: number;
  solved: boolean;
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

  async function finish() {
    if (!solved) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/summary?team=${teamNumber}`, { cache: "no-store" });
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
  }

  const mine = summary?.rounds.find((r) => r.slug === "circuit-1") ?? null;
  const finishedHunt = summary?.totalMs != null;

  return (
    <>
      <div className="oc-footer">
        <a href={dashboardUrl()} className="oc-btn">
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

      {open && (
        <div
          className="oc-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="oc-finish-title" className="oc-dialog">
            {loading ? (
              <p className="oc-dialog__muted">Reading your progress…</p>
            ) : error ? (
              <>
                <h2 id="oc-finish-title" className="oc-dialog__title">
                  Couldn&apos;t load your score
                </h2>
                <p className="oc-dialog__muted">{error}</p>
                <a href={dashboardUrl()} className="oc-btn oc-btn--primary oc-btn--full">
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

                <a href={dashboardUrl()} className="oc-btn oc-btn--primary oc-btn--full">
                  Go to hunt
                </a>
                <button onClick={close} className="oc-btn oc-btn--full">
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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="oc-dialog__row">
      <dt>{label}</dt>
      <dd className={strong ? "is-strong" : undefined}>{value}</dd>
    </div>
  );
}
