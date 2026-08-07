"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HuntEvent } from "@/lib/events";
import type { TeamView } from "@/lib/db";
import { formatClock, formatDuration, formatStamp } from "@/lib/format";

const POLL_MS = 8000;

type SortKey = "number" | "progress" | "fastest";

/**
 * What each round cell shows.
 *
 *   clock  Cumulative from registration — the number that "continues from 20".
 *   split  Time spent on that round alone.
 *   time   Wall-clock time of day the stamp landed.
 *
 * Three views rather than three columns per round: at five rounds that would be
 * fifteen columns, and a coordinator scanning for "who is stuck" needs one
 * number per cell, not three.
 */
type CellView = "clock" | "split" | "time";

const CELL_VIEW_LABEL: Record<CellView, string> = {
  clock: "Cumulative clock",
  split: "Time on round",
  time: "Time of day",
};

/**
 * Everything, for the person running the event.
 *
 * One screen, no drill-downs: during a hunt the coordinator is being asked
 * "did team 23 finish round 4?" while walking between rooms, and a table they
 * can scan beats a UI they have to navigate. Every round cell is also the
 * override — click to stamp, click again to un-stamp — because a separate edit
 * mode is one more thing to find when someone is standing in front of you.
 *
 * Polls rather than streams. Sixty teams is a small payload, the data changes a
 * few times a minute at most, and a poll survives the venue wifi dropping for
 * ten seconds in a way a socket does not.
 */
export default function AdminDashboard({
  initialTeams,
  events,
  configured,
  degraded: initialDegraded,
}: {
  initialTeams: TeamView[];
  events: HuntEvent[];
  configured: boolean;
  degraded: boolean;
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [degraded, setDegraded] = useState(initialDegraded);
  const [sort, setSort] = useState<SortKey>("number");
  const [cellView, setCellView] = useState<CellView>("clock");
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  /* Held in a ref as well as state: the poll must not fire while an override
     is in flight, or a response rendered from before the write lands after it
     and the cell visibly flips back. */
  const writing = useRef(false);

  const refresh = useCallback(async () => {
    if (writing.current) return;
    try {
      const res = await fetch("/api/admin/teams", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!res.ok) {
        setDegraded(true);
        return;
      }
      const body = await res.json();
      setTeams(body.teams ?? []);
      setDegraded(false);
    } catch {
      setDegraded(true);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [configured, refresh]);

  async function toggle(teamNumber: number, slug: string, currentlySolved: boolean) {
    const cell = `${teamNumber}:${slug}`;
    if (busyCell) return;

    // Only un-marking asks. Stamping a round is routine and gets confirmed by
    // the cell filling in; taking one away can move a team off the
    // leaderboard, so it should cost a deliberate second click.
    if (currentlySolved) {
      const round = events.find((e) => e.slug === slug)?.title ?? slug;
      if (!window.confirm(`Un-mark "${round}" for team ${teamNumber}?`)) return;
    }

    setBusyCell(cell);
    setError(null);
    writing.current = true;

    try {
      const res = await fetch("/api/admin/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamNumber, slug, solved: !currentlySolved }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Couldn't apply that change.");
        return;
      }
      // The override endpoint returns the whole refreshed board, so the table
      // is correct immediately instead of after the next poll.
      setTeams(body.teams ?? []);
      setDegraded(false);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      writing.current = false;
      setBusyCell(null);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/";
  }

  /* ── Derived ─────────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const finished = teams.filter((t) => t.completedAt !== null);
    const durations = finished
      .map((t) => t.durationMs)
      .filter((d): d is number => typeof d === "number");
    return {
      registered: teams.length,
      finished: finished.length,
      stamps: teams.reduce((sum, t) => sum + t.solvedCount, 0),
      possible: teams.length * events.length,
      fastest: durations.length ? Math.min(...durations) : null,
    };
  }, [teams, events.length]);

  const leaderboard = useMemo(
    () =>
      teams
        .filter((t) => t.completedAt !== null && typeof t.durationMs === "number")
        .sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0)),
    [teams]
  );

  const sorted = useMemo(() => {
    const copy = [...teams];
    if (sort === "number") return copy.sort((a, b) => a.teamNumber - b.teamNumber);
    if (sort === "progress") {
      return copy.sort((a, b) => b.solvedCount - a.solvedCount || a.teamNumber - b.teamNumber);
    }
    // "fastest": finished teams first by duration, everyone else after by
    // progress — so the podium is at the top without hiding the rest.
    return copy.sort((a, b) => {
      const aDone = typeof a.durationMs === "number";
      const bDone = typeof b.durationMs === "number";
      if (aDone && bDone) return (a.durationMs ?? 0) - (b.durationMs ?? 0);
      if (aDone !== bDone) return aDone ? -1 : 1;
      return b.solvedCount - a.solvedCount || a.teamNumber - b.teamNumber;
    });
  }, [teams, sort]);

  /**
   * CSV of the full board, built and downloaded in the browser.
   *
   * No server round-trip and no library: the table is already here, and an
   * event that ends at 6pm should not need anything running to produce its
   * results file.
   */
  function exportCsv() {
    // Every round contributes five columns: when it was stamped, who by, the
    // order it was done in, the time spent on it, and the cumulative clock at
    // that point. Raw ms goes alongside the formatted value so the file is
    // usable in a spreadsheet without re-parsing "1h 23m 45s".
    const header = [
      "Team",
      "Members",
      "Registered",
      ...events.flatMap((e) => [
        `${e.title} — solved`,
        `${e.title} — by`,
        `${e.title} — order`,
        `${e.title} — on round`,
        `${e.title} — clock`,
      ]),
      "Finished",
      "Total time",
      "Total ms",
    ];

    const rows = [...teams]
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((t) => [
        String(t.teamNumber),
        t.members.join("; "),
        formatStamp(t.registeredAt),
        ...events.flatMap((e) => {
          const r = t.rounds.find((x) => x.slug === e.slug);
          return [
            formatStamp(r?.solvedAt ?? null),
            r?.markedBy ?? "",
            r?.order === null || r?.order === undefined ? "" : String(r.order),
            r?.splitMs === null || r?.splitMs === undefined ? "" : formatDuration(r.splitMs),
            r?.elapsedMs === null || r?.elapsedMs === undefined ? "" : formatDuration(r.elapsedMs),
          ];
        }),
        formatStamp(t.completedAt),
        t.durationMs === null ? "" : formatDuration(t.durationMs),
        t.durationMs === null ? "" : String(t.durationMs),
      ]);

    // Quote everything and double any embedded quote — a member name with a
    // comma in it would otherwise silently shift every later column.
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasure-hunt-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <main className="min-h-dvh px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[84rem]">
        {/* ── Masthead ────────────────────────────────────────────────── */}
        <header className="anim-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="tag tag-accent">XPLORE&apos;26</span>
              <span className="label">Control</span>
            </div>
            <h1 className="display mt-4 text-4xl text-ink sm:text-5xl">Admin Board</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Blueprint Recovery is the one round a coordinator has to WORK
                during: a team walks to a physical sector, presses "notify", and
                sits at `awaiting_reveal` until someone here releases their
                location. Its board had no link from anywhere when the round was
                folded in — it lives at a URL you would have had to know — so
                this is the door. Same admin cookie, so it opens straight in. */}
            <a href="/rounds/blueprint/coordinator" className="btn">
              Blueprint reveals →
            </a>
            <button onClick={() => void refresh()} className="btn">
              Refresh
            </button>
            <button onClick={exportCsv} className="btn btn-accent">
              Export CSV
            </button>
            <button onClick={() => void signOut()} className="btn btn-solid">
              Exit admin
            </button>
          </div>
        </header>

        <hr className="rule-line mt-4" />

        {!configured && (
          <div className="slab slab-warn anim-rise mt-6 p-4">
            <p className="display text-sm text-warn">Database not configured</p>
          </div>
        )}
        {degraded && (
          <p className="anim-rise mt-4 font-mono text-xs text-warn">
            Lost contact with the database — showing the last good read. Retrying…
          </p>
        )}
        {error && <p className="anim-rise mt-4 font-mono text-xs text-bad">{error}</p>}

        {/* ── Stats ───────────────────────────────────────────────────── */}
        <section className="anim-rise mt-6 grid gap-px border-2 border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Teams registered" value={String(stats.registered)} />
          <Stat label="Teams finished" value={String(stats.finished)} sub={`of ${stats.registered}`} />
          <Stat label="Rounds stamped" value={String(stats.stamps)} sub={`of ${stats.possible}`} />
          <Stat
            label="Fastest finish"
            value={stats.fastest === null ? "—" : formatDuration(stats.fastest)}
            accent
          />
        </section>

        {/* ── Leaderboard ─────────────────────────────────────────────── */}
        {leaderboard.length > 0 && (
          <section className="anim-rise mt-10">
            <h2 className="label">Finished — fastest first</h2>
            <hr className="rule-line mt-2" />
            <ol className="mt-4 grid gap-2">
              {leaderboard.map((t, i) => (
                <li key={t.teamNumber} className="slab-flat flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    className={`display flex h-8 w-8 shrink-0 items-center justify-center border-2 border-rule text-sm tabular ${
                      i === 0 ? "bg-accent text-ink" : "bg-paper-2 text-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="display text-lg text-ink">
                    Team {String(t.teamNumber).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-3">
                    {t.members.join(" · ")}
                  </span>
                  <span className="font-mono text-sm font-bold tabular text-good">
                    {formatDuration(t.durationMs)}
                  </span>
                  <span className="font-mono text-[0.7rem] text-ink-3">
                    @ {formatClock(t.completedAt)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── The table ───────────────────────────────────────────────── */}
        <section className="anim-rise mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="label">All teams</h2>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="label mr-1">Cells</span>
                {(["clock", "split", "time"] as CellView[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setCellView(key)}
                    title={CELL_VIEW_LABEL[key]}
                    className={`border-2 border-rule px-2 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider ${
                      cellView === key
                        ? "bg-accent text-ink"
                        : "bg-card text-ink-2 hover:bg-accent-wash"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="label mr-1">Sort</span>
                {(["number", "progress", "fastest"] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSort(key)}
                    className={`border-2 border-rule px-2 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider ${
                      sort === key ? "bg-accent text-ink" : "bg-card text-ink-2 hover:bg-accent-wash"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr className="rule-line mt-2" />

          <p className="mt-2 font-mono text-[0.7rem] text-ink-3">
            Cells show <strong className="text-ink-2">{CELL_VIEW_LABEL[cellView].toLowerCase()}</strong>.
            Click one to stamp or un-stamp it. Click a row for the roster and full splits.
          </p>

          {teams.length === 0 ? (
            <div className="slab mt-4 p-10 text-center">
              <p className="display text-ink-2">No teams registered yet</p>
              <p className="mt-2 font-mono text-xs text-ink-3">
                Rows appear here the moment a team claims a number.
              </p>
            </div>
          ) : (
            /* Horizontal scroll is confined to this wrapper so the page body
               never scrolls sideways on a phone. */
            <div className="slab mt-4 overflow-x-auto">
              <table className="data-table min-w-[60rem]">
                <thead>
                  <tr>
                    <th className="w-16">Team</th>
                    <th className="w-24">Reg.</th>
                    {events.map((e, i) => (
                      <th key={e.slug} className="w-28">
                        <span className="text-ink-3">{String(i + 1).padStart(2, "0")}</span>{" "}
                        {e.title}
                      </th>
                    ))}
                    <th className="w-24">Finished</th>
                    <th className="w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => {
                    const isOpen = expanded === t.teamNumber;
                    const done = t.completedAt !== null;

                    return (
                      <Fragment key={t.teamNumber}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : t.teamNumber)}
                          className="cursor-pointer"
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`display text-lg tabular ${
                                done ? "text-good" : "text-ink"
                              }`}
                            >
                              {String(t.teamNumber).padStart(2, "0")}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[0.7rem] tabular text-ink-3">
                            {formatClock(t.registeredAt)}
                          </td>

                          {events.map((e) => {
                            const round = t.rounds.find((r) => r.slug === e.slug);
                            const solved = round?.solvedAt != null;
                            const cell = `${t.teamNumber}:${e.slug}`;

                            return (
                              <td key={e.slug} className="px-1.5 py-1.5">
                                <button
                                  onClick={(ev) => {
                                    // The row toggles the roster; the cell
                                    // toggles the round. Without this the
                                    // click does both.
                                    ev.stopPropagation();
                                    void toggle(t.teamNumber, e.slug, solved);
                                  }}
                                  disabled={busyCell !== null}
                                  title={
                                    solved
                                      ? [
                                          `Solved ${formatStamp(round?.solvedAt ?? null)} (${round?.markedBy})`,
                                          `Clock: ${formatDuration(round?.elapsedMs ?? null)}`,
                                          `On this round: ${formatDuration(round?.splitMs ?? null)}`,
                                          round?.order ? `Order: #${round.order}` : "",
                                          "Click to un-mark",
                                        ]
                                          .filter(Boolean)
                                          .join("\n")
                                      : "Not solved — click to stamp"
                                  }
                                  className={`w-full border-2 px-1 py-1.5 font-mono text-[0.7rem] tabular disabled:opacity-40 ${
                                    solved
                                      ? "border-rule bg-good font-bold text-white"
                                      : "border-rule-soft bg-paper-2 text-ink-3 hover:border-rule hover:bg-accent-wash"
                                  }`}
                                >
                                  {busyCell === cell
                                    ? "…"
                                    : !solved
                                      ? "—"
                                      : cellView === "time"
                                        ? formatClock(round!.solvedAt)
                                        : cellView === "split"
                                          ? formatDuration(round!.splitMs)
                                          : formatDuration(round!.elapsedMs)}
                                  {solved && round?.markedBy === "admin" && (
                                    <span className="ml-1 opacity-80">*</span>
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          <td className="px-3 py-2 font-mono text-[0.7rem] tabular text-ink-2">
                            {formatClock(t.completedAt)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`font-mono text-sm font-bold tabular ${
                                done ? "text-good" : "text-ink-3"
                              }`}
                            >
                              {done
                                ? formatDuration(t.durationMs)
                                : `${t.solvedCount}/${events.length}`}
                            </span>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={3 + events.length} className="bg-paper-2 px-3 py-4">
                              <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
                                <div>
                                  <p className="label">Members ({t.members.length})</p>
                                  <ol className="mt-2 grid gap-1">
                                    {t.members.map((m, i) => (
                                      <li key={i} className="text-sm text-ink">
                                        <span className="mr-2 font-mono text-[0.7rem] text-ink-3">
                                          {i + 1}
                                        </span>
                                        {m}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                                <div>
                                  <p className="label">Registered — clock start</p>
                                  <p className="mt-2 font-mono text-xs text-ink-2">
                                    {formatStamp(t.registeredAt)}
                                  </p>
                                  {t.latestElapsedMs !== null && !done && (
                                    <p className="mt-1 font-mono text-xs text-accent-ink">
                                      Clock at last solve: {formatDuration(t.latestElapsedMs)}
                                    </p>
                                  )}
                                </div>
                                {done && (
                                  <div>
                                    <p className="label">Consolidated finish</p>
                                    <p className="mt-2 font-mono text-xs text-good">
                                      {formatStamp(t.completedAt)} · {formatDuration(t.durationMs)}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* The full run, in the order they actually did it —
                                  which is where the cumulative clock becomes
                                  readable as a story rather than five numbers. */}
                              {t.solvedCount > 0 && (
                                <div className="mt-4">
                                  <p className="label">Run order</p>
                                  <table className="mt-2 w-full max-w-2xl border-2 border-rule bg-card">
                                    <thead>
                                      <tr className="border-b-2 border-rule">
                                        <Th>#</Th>
                                        <Th>Round</Th>
                                        <Th>Stamped</Th>
                                        <Th>On round</Th>
                                        <Th>Clock</Th>
                                        <Th>By</Th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[...t.rounds]
                                        .filter((r) => r.order !== null)
                                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                        .map((r) => (
                                          <tr key={r.slug} className="border-b border-rule-soft">
                                            <Td>{r.order}</Td>
                                            <Td>
                                              {events.find((e) => e.slug === r.slug)?.title ?? r.slug}
                                            </Td>
                                            <Td>{formatClock(r.solvedAt)}</Td>
                                            <Td>{formatDuration(r.splitMs)}</Td>
                                            <Td strong>{formatDuration(r.elapsedMs)}</Td>
                                            <Td>{r.markedBy ?? ""}</Td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
            * = stamped by a coordinator, not the team. Auto-refreshes every{" "}
            {POLL_MS / 1000}s.
          </p>
        </section>
      </div>
    </main>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

/** Header + cell for the per-team run-order breakdown. */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-1.5 text-left font-mono text-[0.6rem] font-bold uppercase tracking-widest text-ink-3">
      {children}
    </th>
  );
}

function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 font-mono text-xs tabular ${
        strong ? "font-bold text-ink" : "text-ink-2"
      }`}
    >
      {children}
    </td>
  );
}

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
