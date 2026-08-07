/**
 * The 8x8 colour grid.
 *
 * Eight colours, eight cells each, each colour's letters anagramming to one
 * word. All eight groups spell real words so the grid gives no clue which one
 * the equations will select — if only the target group were a word, a team
 * could skip the equations entirely by looking for the group that reads.
 *
 * CLIENT-SAFE. Everything here operates on data the player is already looking
 * at. The word list, the seed and the target colour live in
 * `gridPuzzle.server.ts` and must never be imported from a client component.
 */

/**
 * The eight universe colours.
 *
 * NOT CHOSEN — COMPUTED. Each one is the output of its universe's RGB cipher
 * with n = that universe's index, so the arithmetic a team does on the equation
 * card lands exactly on the swatch they need. `gridPuzzle.server.ts` holds the
 * equations and `grid.test.ts` asserts these eight values are what they
 * produce, so the two can never drift apart.
 *
 * Index 7 (GHOST) coming out a perfect neutral grey is the giveaway that the
 * ciphers were designed backwards from a palette rather than the other way
 * round.
 */
export const GRID_COLOURS = [
  "#c1121f", // 0 RIOT      Earth-616
  "#e85d04", // 1 PUNK      Earth-138
  "#e9c46a", // 2 SLAM      Earth-8311
  "#2a9d8f", // 3 VENOM     Earth-1000
  "#3a56d4", // 4 ELECTRIC  Earth-928
  "#7b2fbe", // 5 ANARCHY   Earth-65
  "#d90066", // 6 SMASH     Earth-1610
  "#b0b0b0", // 7 GHOST     Earth-90214
] as const;

/** Universes, colours and grid words are all the same eight. */
export const UNIVERSE_COUNT = 8;

/** Which universe a team belongs to. The first thing they have to work out. */
export function universeFor(teamNumber: number): number {
  return ((teamNumber % UNIVERSE_COUNT) + UNIVERSE_COUNT) % UNIVERSE_COUNT;
}

export interface GridCell {
  letter: string;
  colour: number;
}

/** Mulberry32 — small deterministic PRNG so a seed always rebuilds the same grid. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGrid(words: readonly string[], seed: number): GridCell[] {
  if (words.length !== GRID_COLOURS.length) {
    throw new Error(`buildGrid needs exactly ${GRID_COLOURS.length} words, got ${words.length}`);
  }
  for (const w of words) {
    if (w.length !== 8) throw new Error(`Every grid word must be 8 letters: "${w}" is ${w.length}`);
  }

  const cells: GridCell[] = [];
  words.forEach((word, colour) => {
    for (const letter of word) cells.push({ letter: letter.toUpperCase(), colour });
  });

  // Fisher-Yates against the seeded PRNG.
  const next = rng(seed);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

export function lettersFor(grid: GridCell[], colour: number): string[] {
  return grid.filter((c) => c.colour === colour).map((c) => c.letter);
}

export function isAnagram(a: string, b: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join("");
  return norm(a) === norm(b);
}

/** The one normalisation both the form and the grader use. */
export function normaliseAnswer(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}
