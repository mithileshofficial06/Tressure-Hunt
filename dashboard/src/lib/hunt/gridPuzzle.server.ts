import { timingSafeEqual } from "node:crypto";
import {
  buildGrid,
  normaliseAnswer,
  universeFor,
  UNIVERSE_COUNT,
  type GridCell,
} from "./grid";

/**
 * THE 64 GRID'S SECRETS. SERVER ONLY — never import this from a client component.
 *
 * The `.server.ts` suffix is a signpost, not a mechanism: Next will happily
 * bundle this file into a client chunk if something with "use client" imports
 * it. What actually keeps it out is that only server components and route
 * handlers import it, and the build is grepped for the words afterwards.
 *
 * WHY THIS FILE EXISTS. Upstream, `SixtyFourGrid.tsx` did
 * `import { CODES } from "@/lib/hunt/codes"` and compared the player's typing
 * in the browser. Bundlers do not tree-shake individual properties off an
 * object read by member expression, so that shipped every reveal code in the
 * hunt into the client chunk. Answers live here and are compared here.
 *
 * ── THE ROUND, IN THREE STEPS ─────────────────────────────────────────────
 *   1. A team works out its universe:  index = teamNumber mod 8.
 *   2. That universe's RGB cipher is revealed. Substituting n = the index
 *      gives an exact colour.
 *   3. They find that colour's eight scattered cells and unscramble them.
 *
 * EVERY UNIVERSE HAS ITS OWN ANSWER. This is not one puzzle with one word any
 * more — team 9 and team 17 are both universe 1 and share a word, while team 10
 * is universe 2 and does not. `isCorrectAnswer` therefore takes the team.
 */

interface Universe {
  index: number;
  codename: string;
  designation: string;
  /** (base + step × (n + 3)) mod 256, per channel. */
  r: readonly [base: number, step: number];
  g: readonly [base: number, step: number];
  b: readonly [base: number, step: number];
  /** Eight letters. The answer for every team in this universe. */
  word: string;
}

/**
 * THE EIGHT ANSWERS.
 *
 * All technical, all exactly eight letters, and every one a real word — if only
 * the target group spelled something, a team could skip the cipher entirely by
 * scanning for the group that reads.
 *
 * NO TWO MAY BE ANAGRAMS OF EACH OTHER, and none should have a common
 * non-technical anagram. TERMINAL was dropped for exactly that: it anagrams to
 * TRAMLINE, which a team could reasonably submit and be told is wrong.
 * `grid.test.ts` enforces the length and the no-clash rule.
 */
const UNIVERSES: readonly Universe[] = [
  { index: 0, codename: "RIOT",     designation: "Earth-616",   r: [154, 13], g: [253, 7],  b: [230, 19], word: "compiler" },
  { index: 1, codename: "PUNK",     designation: "Earth-138",   r: [196, 9],  g: [49, 11],  b: [200, 15], word: "database" },
  { index: 2, codename: "SLAM",     designation: "Earth-8311",  r: [148, 17], g: [181, 3],  b: [1, 21],   word: "firewall" },
  { index: 3, codename: "VENOM",    designation: "Earth-1000",  r: [184, 19], g: [127, 5],  b: [89, 9],   word: "keyboard" },
  { index: 4, codename: "ELECTRIC", designation: "Earth-928",   r: [153, 23], g: [223, 17], b: [163, 7],  word: "protocol" },
  { index: 5, codename: "ANARCHY",  designation: "Earth-65",    r: [83, 5],   g: [199, 13], b: [102, 11], word: "software" },
  { index: 6, codename: "SMASH",    designation: "Earth-1610",  r: [154, 7],  g: [85, 19],  b: [151, 23], word: "variable" },
  { index: 7, codename: "GHOST",    designation: "Earth-90214", r: [66, 11],  g: [26, 15],  b: [6, 17],   word: "function" },
];

const SEED = 20260728;

/** One channel of the cipher. `n` is the universe's own index. */
function channel([base, step]: readonly [number, number], n: number): number {
  return (base + step * (n + 3)) % 256;
}

/** The colour a universe's cipher resolves to. Must equal GRID_COLOURS[index]. */
export function colourFor(index: number): string {
  const u = UNIVERSES[index];
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(channel(u.r, index))}${hex(channel(u.g, index))}${hex(channel(u.b, index))}`;
}

/**
 * The grid, built once per process.
 *
 * Deterministic from the seed, so every team sees the identical board and a
 * coordinator pointing at a projector is talking about the same cells.
 */
let cached: GridCell[] | null = null;

export function gridCells(): GridCell[] {
  cached ??= buildGrid(
    UNIVERSES.map((u) => u.word),
    SEED
  );
  return cached;
}

/* ── What the client is allowed to see ──────────────────────────────────── */

export interface UniverseCard {
  codename: string;
  designation: string;
  equations: Array<{ channel: "R" | "G" | "B"; text: string }>;
}

/**
 * The equation card for one universe.
 *
 * CARRIES NEITHER THE ANSWER COLOUR NOR THE VALUE OF n. Decoding is the step:
 * shipping the colour would make it pointless, and shipping `n` would leave
 * nothing but three additions the page has already set out. A team reaching
 * this card has just proved it knows its index at step 1, so withholding n
 * costs them nothing they have not already worked out — it only stops the
 * substitution being done for them.
 *
 * It also only ever describes the universe asked for, so a team cannot read the
 * whole table out of one response.
 */
export function universeCard(index: number): UniverseCard | null {
  const u = UNIVERSES[index];
  if (!u) return null;

  const line = (c: readonly [number, number]) => `(${c[0]} + ${c[1]}(n + 3)) mod 256`;
  return {
    codename: u.codename,
    designation: u.designation,
    equations: [
      { channel: "R", text: line(u.r) },
      { channel: "G", text: line(u.g) },
      { channel: "B", text: line(u.b) },
    ],
  };
}

/* ── Checking ───────────────────────────────────────────────────────────── */

/** Step 1: is this the universe this team belongs to? */
export function isCorrectUniverse(teamNumber: number, guess: unknown): boolean {
  const n = typeof guess === "number" ? guess : Number.parseInt(String(guess ?? "").trim(), 10);
  return Number.isInteger(n) && n === universeFor(teamNumber);
}

/**
 * Step 2: did they actually run the cipher?
 *
 * All three channels must match, and the check happens HERE because the client
 * is never told the resulting colour — that is the entire point of the step. It
 * takes the substituted value of n on trust from nobody: the expected colour is
 * recomputed from this team's own universe.
 *
 * Be honest about the ceiling: the eight swatches have to reach the browser to
 * render the grid at all, so a team willing to type eight colours in can brute
 * this. It is a work-check, not a secret — the same standing as the eight
 * anagram groups at step 3, and the reason the round is supervised.
 */
export function isCorrectColour(teamNumber: number, r: unknown, g: unknown, b: unknown): boolean {
  const channels = [r, g, b].map((v) =>
    typeof v === "number" ? v : Number.parseInt(String(v ?? "").trim(), 10)
  );
  if (channels.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return false;

  const expected = colourFor(universeFor(teamNumber)).replace("#", "");
  const got = channels.map((v) => v.toString(16).padStart(2, "0")).join("");
  return got === expected;
}

/**
 * Step 3: is this the word for this team's universe?
 *
 * Constant-time so response timing can't be used to feel out the answer one
 * letter at a time. Length is compared first because timingSafeEqual throws on
 * mismatched buffers — and length is not a secret, the grid shows eight cells.
 */
export function isCorrectAnswer(teamNumber: number, raw: string): boolean {
  const expectedWord = UNIVERSES[universeFor(teamNumber)]?.word;
  if (!expectedWord) return false;

  const provided = Buffer.from(normaliseAnswer(raw));
  const expected = Buffer.from(expectedWord.toUpperCase());
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Internals, for tests only.
 *
 * Exported so `grid.test.ts` can assert the ciphers actually resolve to the
 * eight grid colours — the one property that, if it broke, would leave the
 * board rendering perfectly and the round unsolvable.
 */
export const __test = {
  UNIVERSES,
  SEED,
  UNIVERSE_COUNT,
  wordFor: (index: number) => UNIVERSES[index].word.toUpperCase(),
};
