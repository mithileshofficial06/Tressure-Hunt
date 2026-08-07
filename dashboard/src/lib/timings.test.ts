import { describe, it, expect } from "vitest";
import { deriveTimings } from "./timings";

const SLUGS = ["a", "b", "c"] as const;
const T0 = Date.parse("2026-08-07T10:00:00.000Z");
const MIN = 60_000;

describe("the clock never resets", () => {
  it("round two continues from where round one finished", () => {
    // The rule as stated: first round in 20 minutes, so the next round's stamp
    // lands at 20 + its own time — not back at zero.
    const t = deriveTimings(
      T0,
      [
        { slug: "a", solvedAt: T0 + 20 * MIN },
        { slug: "b", solvedAt: T0 + 35 * MIN },
      ],
      SLUGS
    );

    const a = t.rounds.find((r) => r.slug === "a")!;
    const b = t.rounds.find((r) => r.slug === "b")!;

    expect(a.elapsedMs).toBe(20 * MIN);
    expect(a.splitMs).toBe(20 * MIN); // first round: split == elapsed

    expect(b.elapsedMs).toBe(35 * MIN); // continued from 20
    expect(b.splitMs).toBe(15 * MIN); // only its own 15
  });

  it("splits sum to the cumulative elapsed", () => {
    const t = deriveTimings(
      T0,
      [
        { slug: "a", solvedAt: T0 + 20 * MIN },
        { slug: "b", solvedAt: T0 + 35 * MIN },
        { slug: "c", solvedAt: T0 + 50 * MIN },
      ],
      SLUGS
    );
    const splits = t.rounds.reduce((sum, r) => sum + (r.splitMs ?? 0), 0);
    expect(splits).toBe(50 * MIN);
    expect(t.totalMs).toBe(50 * MIN);
  });
});

describe("out-of-order play", () => {
  it("orders by when rounds were solved, not by the round list", () => {
    // Team does c, then a, then b. Splits must follow that reality.
    const t = deriveTimings(
      T0,
      [
        { slug: "c", solvedAt: T0 + 10 * MIN },
        { slug: "a", solvedAt: T0 + 25 * MIN },
        { slug: "b", solvedAt: T0 + 30 * MIN },
      ],
      SLUGS
    );

    const by = (s: string) => t.rounds.find((r) => r.slug === s)!;
    expect(by("c").order).toBe(1);
    expect(by("a").order).toBe(2);
    expect(by("b").order).toBe(3);

    expect(by("c").splitMs).toBe(10 * MIN);
    expect(by("a").splitMs).toBe(15 * MIN); // 25 − 10, not 25 − 0
    expect(by("b").splitMs).toBe(5 * MIN);
  });

  it("never reports a negative split when a stamp is backdated", () => {
    // Only reachable via an admin correction, but a minus sign in the table is
    // something nobody can act on.
    const t = deriveTimings(
      T0,
      [
        { slug: "a", solvedAt: T0 + 30 * MIN },
        { slug: "b", solvedAt: T0 + 30 * MIN },
      ],
      SLUGS
    );
    for (const r of t.rounds) {
      if (r.splitMs !== null) expect(r.splitMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("partial and empty states", () => {
  it("reports no total until every round is solved", () => {
    const t = deriveTimings(T0, [{ slug: "a", solvedAt: T0 + 20 * MIN }], SLUGS);
    expect(t.solvedCount).toBe(1);
    expect(t.totalMs).toBeNull();
    expect(t.completedAt).toBeNull();
    // ...but the running clock is still readable mid-hunt.
    expect(t.latestElapsedMs).toBe(20 * MIN);
  });

  it("sets the total on the last solve", () => {
    const t = deriveTimings(
      T0,
      SLUGS.map((slug, i) => ({ slug, solvedAt: T0 + (i + 1) * 10 * MIN })),
      SLUGS
    );
    expect(t.solvedCount).toBe(3);
    expect(t.totalMs).toBe(30 * MIN);
    expect(t.completedAt).toBe(new Date(T0 + 30 * MIN).toISOString());
  });

  it("handles a team that has solved nothing", () => {
    const t = deriveTimings(T0, [], SLUGS);
    expect(t.solvedCount).toBe(0);
    expect(t.latestElapsedMs).toBeNull();
    expect(t.totalMs).toBeNull();
    expect(t.rounds.every((r) => r.solvedAt === null)).toBe(true);
  });

  it("ignores rows for slugs that are not on the round list", () => {
    // A stray row must not make a team look finished.
    const t = deriveTimings(
      T0,
      [
        { slug: "a", solvedAt: T0 + 1 * MIN },
        { slug: "b", solvedAt: T0 + 2 * MIN },
        { slug: "c", solvedAt: T0 + 3 * MIN },
        { slug: "ghost", solvedAt: T0 + 4 * MIN },
      ],
      SLUGS
    );
    expect(t.solvedCount).toBe(3);
    expect(t.rounds).toHaveLength(3);
  });

  it("survives a missing registration time", () => {
    const t = deriveTimings(null, [{ slug: "a", solvedAt: T0 }], SLUGS);
    expect(t.rounds.find((r) => r.slug === "a")!.elapsedMs).toBeNull();
    expect(t.totalMs).toBeNull();
  });
});
