'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatDuration } from '@/lib/format';

/**
 * Back-to-hunt and Finish-round, for the Shift Verse round.
 *
 * A SKIN of `rounds/RoundFooter.tsx`, styled against this round's dark theme
 * rather than the dashboard's Concrete palette — a paper-white panel dropped on
 * top of the portal background would look like a rendering bug. Behaviour is
 * the same on purpose: same gating, same endpoint, same numbers, same wording.
 *
 * It reads the DASHBOARD's `/api/team/summary` off the session cookie. As a
 * separate app it could not: the cookie is SameSite=Lax, so a cross-site
 * request from :3001 would not have carried it even with CORS opened up, which
 * is why a duplicate `/api/summary` and a second copy of `deriveTimings` had to
 * exist. Same origin now, so both are gone.
 *
 * FINISH IS DISABLED UNTIL THE ROUND IS SOLVED, and `solved` only ever comes
 * from the server confirming a correct answer.
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

/* `formatDuration` was a local copy of the dashboard's, character for
   character. It imports the real one now — one definition means this finish
   card and the hunt board can never disagree about a team's elapsed time. */

export default function RoundFooter({ solved }: { solved: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function finish() {
    if (!solved) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/summary", { cache: 'no-store' });
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

  const mine = summary?.rounds.find((r) => r.slug === 'hunt-shiftverse') ?? null;
  const finishedHunt = summary?.totalMs != null;

  return (
    <>
      <div className="sv-footer">
        <a href={'/dashboard'} className="sv-btn">
          ← Back to hunt
        </a>
        <button
          onClick={() => void finish()}
          disabled={!solved}
          className="sv-btn sv-btn--primary"
          title={solved ? 'Record this round and return' : 'Finish the round first'}
        >
          Finish round
        </button>
        {!solved && <span className="sv-footer__hint">Decode the signal to enable this.</span>}
      </div>

      {open && (
        <div
          className="sv-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="sv-finish-title" className="sv-dialog">
            {loading ? (
              <p className="sv-dialog__muted">Reading your progress…</p>
            ) : error ? (
              <>
                <h2 id="sv-finish-title" className="sv-dialog__title">
                  Couldn&apos;t load your score
                </h2>
                <p className="sv-dialog__muted">{error}</p>
                <a href={'/dashboard'} className="sv-btn sv-btn--primary sv-btn--full">
                  Go to hunt
                </a>
              </>
            ) : summary ? (
              <>
                <span className="sv-dialog__badge">
                  {finishedHunt ? 'Hunt complete' : 'Round cleared'}
                </span>
                <h2 id="sv-finish-title" className="sv-dialog__title">
                  Shift Verse
                </h2>

                <div className="sv-dialog__points">
                  <span>Points this round</span>
                  <strong>+{summary.totalPoints / summary.totalRounds}</strong>
                </div>

                <dl className="sv-dialog__rows">
                  <Row label="Total points" value={`${summary.points} / ${summary.totalPoints}`} />
                  <Row
                    label="Rounds cleared"
                    value={`${summary.solvedCount} / ${summary.totalRounds}`}
                  />
                  <Row label="Time on this round" value={formatDuration(mine?.splitMs ?? null)} />
                  <Row
                    label={finishedHunt ? 'Total time' : 'Clock now reads'}
                    value={formatDuration(
                      finishedHunt ? summary.totalMs : (mine?.elapsedMs ?? summary.latestElapsedMs)
                    )}
                    strong
                  />
                </dl>

                <p className="sv-dialog__muted">
                  {finishedHunt
                    ? `All ${summary.totalRounds} rounds done — your final time is locked in.`
                    : `The clock keeps running. Your next round starts from ${formatDuration(
                        mine?.elapsedMs ?? summary.latestElapsedMs
                      )}.`}
                </p>

                <a href={'/dashboard'} className="sv-btn sv-btn--primary sv-btn--full">
                  Go to hunt
                </a>
                <button onClick={close} className="sv-btn sv-btn--full">
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
    <div className="sv-dialog__row">
      <dt>{label}</dt>
      <dd className={strong ? 'is-strong' : undefined}>{value}</dd>
    </div>
  );
}
