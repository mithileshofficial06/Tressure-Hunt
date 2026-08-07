import { timingSafeEqual } from "node:crypto";
import { buildGrid, normaliseAnswer, type GridCell } from "./grid";

/**
 * THE 64 GRID'S SECRETS. SERVER ONLY — never import this from a client component.
 *
 * The `.server.ts` suffix is a signpost, not a mechanism: Next will happily
 * bundle this file into a client chunk if something with "use client" imports
 * it. What actually keeps it out is that only `page.tsx` (a server component)
 * and the route handler import it, and the build is checked for the answer
 * string afterwards.
 *
 * WHY THIS FILE EXISTS AT ALL. Upstream, `SixtyFourGrid.tsx` used to do
 * `import { CODES } from "@/lib/hunt/codes"` and compare the player's typing
 * against `CODES.grid` in the browser. Bundlers do not tree-shake individual
 * properties off an object read by member expression, so importing CODES for
 * one of its four fields shipped ALL FOUR reveal codes — every answer in the
 * hunt — into that route's client chunk, readable in devtools without solving
 * anything. The finalised upstream component fixed that by reporting what the
 * player typed and letting the server decide. This is the server side of that
 * split.
 *
 * The client is sent `gridCells` (letter + colour pairs, already shuffled) and
 * the equations. It is never sent the word list, the seed, or the target
 * colour, so there is nothing in the bundle to read the answer off.
 */

/** Eight real words so no group visibly stands out as "the answer group". */
const WORDS = [
  "spiderly", "webbings", "villains", "symbiote",
  "multiver", "gwenpool", "octopusx", "daybugle",
] as const;

const SEED = 20260728;

/**
 * All three are one-step arithmetic on universally-known facts — answerable
 * from general knowledge alone, with no lookup.
 */
export const EQUATIONS = [
  "Legs on a spider, minus 2",
  "Wheels on a bicycle, plus 3",
  "Eyes on a typical spider, divided by 2",
] as const;

/** (6 + 5 + 4) = 15, and 15 mod 8 = 7 -> colour index 7 -> "daybugle". */
const EQUATION_ANSWERS = [6, 5, 4] as const;
const TARGET_COLOUR = 7;

/**
 * The grid, built once per process.
 *
 * Deterministic from the seed, so every team sees the identical board and a
 * coordinator can point at a projector and be talking about the same cells.
 */
let cached: GridCell[] | null = null;

export function gridCells(): GridCell[] {
  cached ??= buildGrid(WORDS, SEED);
  return cached;
}

/**
 * Is this the word?
 *
 * Constant-time so response timing can't be used to feel out the answer one
 * letter at a time. Length is compared first because timingSafeEqual throws on
 * mismatched buffers — and length is not a secret, the grid shows eight cells.
 */
export function isCorrectAnswer(raw: string): boolean {
  const provided = Buffer.from(normaliseAnswer(raw));
  const expected = Buffer.from(WORDS[TARGET_COLOUR].toUpperCase());
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Internals, for tests only.
 *
 * Exported so `grid.test.ts` can assert the equations actually select the
 * colour whose letters spell the answer — the one property that, if it broke,
 * would make the puzzle unsolvable while still looking completely fine.
 */
export const __test = {
  WORDS,
  SEED,
  EQUATION_ANSWERS,
  TARGET_COLOUR,
  answer: () => WORDS[TARGET_COLOUR].toUpperCase(),
};
