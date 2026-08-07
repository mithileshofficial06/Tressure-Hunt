/**
 * Round timings — one clock, never reset.
 *
 * The rule the event runs on: the clock starts when a team registers and runs
 * continuously until the last round is stamped. If round one takes 20 minutes,
 * round two does not start from zero — it starts from 20, and its own stamp
 * lands at 20 + however long it took.
 *
 * So every round carries two numbers, and they answer different questions:
 *
 *   elapsedMs  Cumulative from registration. "The clock read 32:11 when they
 *              cleared this." This is the number that continues.
 *   splitMs    Just this round. "They spent 12:04 on it." Derived as the gap
 *              from the PREVIOUS solve, not from registration.
 *
 * ORDERED BY WHEN THEY WERE SOLVED, NOT BY THE ROUND LIST. Teams tackle the
 * five in whatever order the floor allows, so splits computed against the
 * fixed round order would charge a team for time spent on a round they had not
 * started yet — and would go negative the moment anyone worked out of order.
 *
 * Pure and dependency-free so it can be unit-tested and reused by the admin
 * board, the team board and each round's finish dialogue without any of them
 * disagreeing about what a split is.
 */

export interface SolvedRow {
  slug: string;
  /** Epoch ms. */
  solvedAt: number;
  markedBy?: "team" | "admin" | null;
}

export interface RoundTiming {
  slug: string;
  solvedAt: string | null;
  markedBy: "team" | "admin" | null;
  /** Cumulative ms from registration to this solve. */
  elapsedMs: number | null;
  /** Ms spent on this round alone (gap from the previous solve). */
  splitMs: number | null;
  /** 1-based position in the order this team actually solved things. */
  order: number | null;
}

export interface Timings {
  rounds: RoundTiming[];
  solvedCount: number;
  /** Cumulative ms at the latest solve, whether or not the hunt is finished. */
  latestElapsedMs: number | null;
  /** Set only when every round in `allSlugs` is solved. */
  totalMs: number | null;
  completedAt: string | null;
}

/**
 * @param registeredAt epoch ms the clock started
 * @param solved       every solved row for one team, any order
 * @param allSlugs     the full round list, in display order
 */
export function deriveTimings(
  registeredAt: number | null,
  solved: SolvedRow[],
  allSlugs: readonly string[]
): Timings {
  // Chronological, because that is the only order in which "the previous
  // round" means anything.
  const chrono = [...solved]
    .filter((r) => Number.isFinite(r.solvedAt))
    .sort((a, b) => a.solvedAt - b.solvedAt);

  const derived = new Map<string, { elapsedMs: number | null; splitMs: number | null; order: number }>();

  let previous = registeredAt;
  chrono.forEach((row, i) => {
    const elapsedMs = registeredAt === null ? null : row.solvedAt - registeredAt;
    // A negative split would mean a stamp landed before the one it follows —
    // only reachable via an admin backdating a correction. Clamp rather than
    // show a minus sign nobody can act on.
    const splitMs = previous === null ? null : Math.max(0, row.solvedAt - previous);
    derived.set(row.slug, { elapsedMs, splitMs, order: i + 1 });
    previous = row.solvedAt;
  });

  const rounds: RoundTiming[] = allSlugs.map((slug) => {
    const row = chrono.find((r) => r.slug === slug);
    const d = row ? derived.get(slug) : undefined;
    return {
      slug,
      solvedAt: row ? new Date(row.solvedAt).toISOString() : null,
      markedBy: row?.markedBy ?? null,
      elapsedMs: d?.elapsedMs ?? null,
      splitMs: d?.splitMs ?? null,
      order: d?.order ?? null,
    };
  });

  // Count only rounds that are on the official list — a stray row for a slug
  // that no longer exists must not make a team look finished.
  const solvedCount = rounds.filter((r) => r.solvedAt !== null).length;
  const last = chrono.length > 0 ? chrono[chrono.length - 1] : null;
  const finished = solvedCount === allSlugs.length && allSlugs.length > 0;

  return {
    rounds,
    solvedCount,
    latestElapsedMs:
      last && registeredAt !== null ? last.solvedAt - registeredAt : null,
    totalMs: finished && last && registeredAt !== null ? last.solvedAt - registeredAt : null,
    completedAt: finished && last ? new Date(last.solvedAt).toISOString() : null,
  };
}
