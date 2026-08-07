"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_TEAM, parseTeamNumber } from "@/lib/teamNumber";
import { MAX_MEMBERS, MIN_MEMBERS, parseMembers } from "@/lib/members";

/**
 * Team registration — number, roster, and the door to the admin board.
 *
 * Two things are shown that the server alone decides: which numbers are taken,
 * and whether this claim succeeded. The grid below the field is a courtesy —
 * it can be a second out of date, and a number that looks free can still come
 * back "already in play" because another team claimed it while this page was
 * open. That is handled as a normal outcome, not an error state: the grid
 * refreshes, the field clears, and the team picks again.
 *
 * THE ADMIN CODE IS NOT IN THIS FILE, and must never be. When the typed value
 * isn't a valid team number, the form posts it to `/api/admin/login` and lets
 * the server judge. That keeps the code out of the JS bundle — a check like
 * `if (value === "0904")` here would put it one "view source" away from every
 * participant — and it means a wrong guess and a fat-fingered team number
 * produce the same sentence on screen.
 */
export default function TeamEntry({ max, configured }: { max: number; configured: boolean }) {
  const [value, setValue] = useState("");
  const [members, setMembers] = useState<string[]>(Array(MAX_MEMBERS).fill(""));
  const [taken, setTaken] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshTaken = useRef(async () => {
    try {
      const res = await fetch("/api/team/taken", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setTaken(new Set<number>(body.taken ?? []));
    } catch {
      // Offline or the DB is unreachable. The grid just shows everything as
      // free; the claim itself is still authoritative.
    }
  });

  useEffect(() => {
    void refreshTaken.current();
    inputRef.current?.focus();
  }, []);

  const parsed = parseTeamNumber(value, max);
  const numeric = parsed.ok ? parsed.value : null;
  const looksTaken = numeric !== null && taken.has(numeric);
  const roster = parseMembers(members);

  // A value that can't be a team number but is long enough to be the gate code
  // gets one attempt at the admin door instead of a dead-end error.
  const maybeAdmin = !parsed.ok && value.length >= 3;

  const canSubmit =
    !busy && configured && (maybeAdmin || (parsed.ok && !looksTaken && roster.ok));

  function setMember(index: number, name: string) {
    setMembers((prev) => prev.map((m, i) => (i === index ? name : m)));
    setError(null);
  }

  function fail(message: string) {
    setError(message);
    setShake((s) => s + 1);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      if (maybeAdmin) {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: value }),
        });
        if (res.ok) {
          window.location.href = "/admin";
          return;
        }
        const body = await res.json().catch(() => ({}));
        fail(body.error ?? `Team number must be between ${MIN_TEAM} and ${max}.`);
        inputRef.current?.focus();
        return;
      }

      const res = await fetch("/api/team/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamNumber: numeric, members: roster.ok ? roster.value : [] }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        // Full navigation rather than router.push: the dashboard is a server
        // component that reads the cookie this response just set, and a
        // client-side transition can reuse a cached RSC payload rendered
        // before it existed.
        window.location.href = "/dashboard";
        return;
      }

      fail(body.error ?? "Couldn't register that team.");
      if (res.status === 409) {
        setValue("");
        void refreshTaken.current();
      }
      inputRef.current?.focus();
    } catch {
      fail("Couldn't reach the server — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        {/* ── Masthead ──────────────────────────────────────────────────── */}
        <header className="anim-rise">
          <div className="flex items-center gap-3">
            <span className="tag tag-accent">XPLORE&apos;26</span>
            <span className="label">Registration</span>
          </div>
          <h1 className="display mt-4 text-5xl text-ink sm:text-7xl">Treasure Hunt</h1>
          <hr className="rule-line mt-4" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-2">
            Five rounds, one team number. Claim yours to open the board — every number
            belongs to exactly one team.
          </p>
        </header>

        {/* ── Setup warning ─────────────────────────────────────────────── */}
        {!configured && (
          <div className="slab slab-warn anim-rise mt-8 p-4">
            <p className="display text-sm text-warn">Database not configured</p>
            <p className="mt-2 text-sm text-ink-2">
              Copy <code className="font-mono text-accent-ink">.env.example</code> to{" "}
              <code className="font-mono text-accent-ink">.env.local</code>, set{" "}
              <code className="font-mono text-accent-ink">MONGODB_URI</code>, and restart.
              Until then registration is disabled — the styling below is live, the button
              is not.
            </p>
          </div>
        )}

        {/* ── The claim slab ────────────────────────────────────────────── */}
        <section
          key={shake}
          className={`slab slab-accent anim-rise mt-8 p-6 sm:p-8 ${error ? "anim-shake" : ""}`}
        >
          <label htmlFor="team-number" className="label block">
            01 — Team number
          </label>

          <input
            ref={inputRef}
            id="team-number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="00"
            /* Wide enough for the gate code as well as a team number. Sizing it
               to `max` alone would make the admin code physically untypeable. */
            maxLength={Math.max(String(max).length, 4)}
            value={value}
            onChange={(e) => {
              // Digits only. Rejecting the keystroke beats accepting "1e3"
              // and explaining later why it isn't a number.
              setValue(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className="field display mt-3 py-5 text-center text-6xl tabular"
          />

          {/* ── Roster ──────────────────────────────────────────────────
              Hidden until the number is valid, so the admin path never asks
              for member names and a team sees one question at a time. */}
          {parsed.ok && !looksTaken && (
            <div className="anim-pop mt-8">
              <label className="label block">
                02 — Team members
                <span className="ml-2 normal-case tracking-normal text-ink-3">
                  ({MIN_MEMBERS} required, {MAX_MEMBERS}th optional)
                </span>
              </label>

              <div className="mt-3 grid gap-2">
                {members.map((name, i) => {
                  const optional = i >= MIN_MEMBERS;
                  return (
                    <div key={i} className="flex items-stretch">
                      <span className="flex w-10 shrink-0 items-center justify-center border-2 border-r-0 border-rule bg-paper-2 font-mono text-xs text-ink-3">
                        {i + 1}
                      </span>
                      <input
                        type="text"
                        autoComplete="off"
                        maxLength={60}
                        value={name}
                        placeholder={optional ? "Optional" : `Member ${i + 1}`}
                        onChange={(e) => setMember(i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submit();
                        }}
                        className="field text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="btn btn-accent mt-8 w-full py-3.5"
          >
            {busy ? "Registering…" : "Register team"}
          </button>

          {/* One line of feedback, in priority order: server error, the
              optimistic "taken" read, the range rule, then the roster rule. */}
          <p className="mt-3 min-h-[1.25rem] font-mono text-xs">
            {error ? (
              <span className="text-bad">{error}</span>
            ) : looksTaken ? (
              <span className="text-bad">Team {numeric} is already in play — pick another.</span>
            ) : value && !parsed.ok ? (
              <span className="text-warn">{parsed.error}</span>
            ) : parsed.ok && !roster.ok ? (
              <span className="text-warn">{roster.error}</span>
            ) : parsed.ok ? (
              <span className="text-good">
                Team {numeric} · {roster.ok ? roster.value.length : 0} members — ready.
              </span>
            ) : (
              <span className="text-ink-3">
                Numbers {MIN_TEAM}–{max}.
              </span>
            )}
          </p>
        </section>

        {/* ── Availability grid ─────────────────────────────────────────── */}
        <section className="anim-rise mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Roster</h2>
            <span className="font-mono text-xs tabular text-ink-2">
              {taken.size} / {max} claimed
            </span>
          </div>

          <hr className="rule-line mt-2" />

          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
              const isTaken = taken.has(n);
              const isSelected = n === numeric;
              return (
                <li key={n}>
                  <button
                    type="button"
                    disabled={isTaken}
                    onClick={() => {
                      setValue(String(n));
                      setError(null);
                      inputRef.current?.focus();
                    }}
                    aria-label={`Team ${n}${isTaken ? " (taken)" : ""}`}
                    className={`w-full border-2 py-2 font-mono text-sm tabular transition-colors duration-100 ${
                      isTaken
                        ? "cursor-not-allowed border-rule-soft bg-paper-2 text-ink-3 line-through"
                        : isSelected
                          ? "border-rule bg-accent font-bold text-ink"
                          : "border-rule bg-card text-ink hover:bg-accent-wash"
                    }`}
                  >
                    {n}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
            {/* Say out loud that the grid is advisory, so a coordinator reading
                a "but it showed as free!" complaint knows the answer. */}
            Live-ish. The claim itself is settled by the server.
          </p>
        </section>
      </div>
    </main>
  );
}
