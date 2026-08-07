import { describe, it, expect } from "vitest";
import {
  GRID_COLOURS,
  UNIVERSE_COUNT,
  buildGrid,
  isAnagram,
  lettersFor,
  normaliseAnswer,
  universeFor,
} from "./grid";
import {
  colourFor,
  gridCells,
  isCorrectAnswer,
  isCorrectColour,
  isCorrectUniverse,
  universeCard,
  __test,
} from "./gridPuzzle.server";

const { UNIVERSES, SEED } = __test;

/**
 * The 64 Grid's invariants.
 *
 * Most of these guard failures that would look completely fine on screen and
 * only surface as "this round is impossible" with sixty teams in the room.
 */

describe("the ciphers are the palette", () => {
  it("every universe's RGB cipher resolves to its own swatch", () => {
    // THE central invariant of the round. A team substitutes n into three
    // equations, gets a colour, and looks for that swatch. If a cipher resolves
    // to something that is not in the grid, the board still renders perfectly
    // and there is nothing to find.
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      expect(colourFor(i), `universe ${i} (${UNIVERSES[i].codename})`).toBe(GRID_COLOURS[i]);
    }
  });

  it("resolves n as the universe index, not the team number", () => {
    // Documents the reading the whole round rests on. Universe 2 (SLAM) with
    // n = 2 gives #e9c46a; with n = 10 (a team number in that universe) it
    // gives a colour that is in no grid at all.
    expect(colourFor(2)).toBe("#e9c46a");

    const u = UNIVERSES[2];
    const ch = ([base, step]: readonly [number, number], n: number) => (base + step * (n + 3)) % 256;
    const withTeamNumber = `#${[ch(u.r, 10), ch(u.g, 10), ch(u.b, 10)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
    expect(GRID_COLOURS as readonly string[]).not.toContain(withTeamNumber);
  });

  it("gives all eight universes distinct colours", () => {
    expect(new Set(GRID_COLOURS).size).toBe(UNIVERSE_COUNT);
  });
});

describe("universe assignment", () => {
  it("is the team number modulo eight", () => {
    expect(universeFor(8)).toBe(0);
    expect(universeFor(1)).toBe(1);
    expect(universeFor(10)).toBe(2);
    expect(universeFor(60)).toBe(4);
  });

  it("covers every universe across the 60-team roster, and only valid ones", () => {
    const seen = new Set<number>();
    for (let team = 1; team <= 60; team++) {
      const u = universeFor(team);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(UNIVERSE_COUNT);
      seen.add(u);
    }
    // Every universe must be reachable, or some team has a word nobody can win.
    expect(seen.size).toBe(UNIVERSE_COUNT);
  });

  it("accepts only the team's own index at step 1", () => {
    for (const team of [1, 10, 33, 60]) {
      const correct = universeFor(team);
      expect(isCorrectUniverse(team, correct)).toBe(true);
      expect(isCorrectUniverse(team, String(correct))).toBe(true);
      for (let i = 0; i < UNIVERSE_COUNT; i++) {
        if (i !== correct) expect(isCorrectUniverse(team, i), `team ${team} vs ${i}`).toBe(false);
      }
      expect(isCorrectUniverse(team, "")).toBe(false);
      expect(isCorrectUniverse(team, "abc")).toBe(false);
    }
  });
});

describe("the equation card", () => {
  it("matches the reference for SLAM / Earth-8311", () => {
    const card = universeCard(2)!;
    expect(card.codename).toBe("SLAM");
    expect(card.designation).toBe("Earth-8311");
    expect(card.equations.map((e) => `${e.channel} = ${e.text}`)).toEqual([
      "R = (148 + 17(n + 3)) mod 256",
      "G = (181 + 3(n + 3)) mod 256",
      "B = (1 + 21(n + 3)) mod 256",
    ]);
  });

  it("never carries the answer colour or the word", () => {
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      const json = JSON.stringify(universeCard(i)).toLowerCase();
      expect(json).not.toContain(GRID_COLOURS[i].toLowerCase());
      expect(json).not.toContain(UNIVERSES[i].word.toLowerCase());
    }
  });

  it("never carries the value of n", () => {
    // Substituting n is the step. Shipping it leaves three additions the page
    // has already set out.
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      expect(universeCard(i)).not.toHaveProperty("index");
    }
  });

  it("keeps n unsubstituted in the equation text", () => {
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      for (const eq of universeCard(i)!.equations) {
        expect(eq.text).toContain("(n + 3)");
      }
    }
  });
});

describe("the decode gate (step 2)", () => {
  it("accepts only the exact RGB the team's own cipher produces", () => {
    for (const team of [1, 10, 33, 60]) {
      const hex = GRID_COLOURS[universeFor(team)].replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

      expect(isCorrectColour(team, r, g, b), `team ${team}`).toBe(true);
      expect(isCorrectColour(team, String(r), String(g), String(b))).toBe(true);

      // One channel off by one is still wrong — no partial credit.
      expect(isCorrectColour(team, r + 1, g, b)).toBe(false);
      expect(isCorrectColour(team, r, g + 1, b)).toBe(false);
      expect(isCorrectColour(team, r, g, b - 1)).toBe(false);
    }
  });

  it("rejects another universe's colour", () => {
    const team = 10; // universe 2
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      const hex = GRID_COLOURS[i].replace("#", "");
      const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
      expect(isCorrectColour(team, r, g, b), `colour ${i}`).toBe(i === universeFor(team));
    }
  });

  it("rejects out-of-range and non-numeric channels", () => {
    expect(isCorrectColour(10, -1, 0, 0)).toBe(false);
    expect(isCorrectColour(10, 256, 0, 0)).toBe(false);
    expect(isCorrectColour(10, "", "", "")).toBe(false);
    expect(isCorrectColour(10, "ff", "c4", "6a")).toBe(false); // hex digits, not decimal
    expect(isCorrectColour(10, null, undefined, {})).toBe(false);
  });

  it("is what a team gets by substituting n = their universe index", () => {
    // The full step-2 journey, for team 17 (universe 1, PUNK).
    const team = 17;
    const n = universeFor(team);
    const u = UNIVERSES[n];
    const ch = ([base, step]: readonly [number, number]) => (base + step * (n + 3)) % 256;
    expect(isCorrectColour(team, ch(u.r), ch(u.g), ch(u.b))).toBe(true);
  });
});

describe("the eight answers", () => {
  it("are all exactly eight letters", () => {
    for (const u of UNIVERSES) {
      expect(u.word, u.codename).toHaveLength(8);
      expect(u.word).toMatch(/^[a-z]{8}$/);
    }
  });

  it("contains no two words that are anagrams of each other", () => {
    // Two universes sharing a letter multiset would make one team's board
    // accept the other's answer, and the wrong team would be credited.
    const signature = (w: string) => [...w].sort().join("");
    const seen = new Map<string, string>();
    for (const u of UNIVERSES) {
      const sig = signature(u.word);
      expect(seen.get(sig), `${u.word} clashes with ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, u.word);
    }
  });

  it("are all distinct", () => {
    expect(new Set(UNIVERSES.map((u) => u.word)).size).toBe(UNIVERSE_COUNT);
  });
});

describe("the grid gives nothing away", () => {
  it("every colour group spells a real word, so none stands out", () => {
    const cells = gridCells();
    for (let colour = 0; colour < UNIVERSE_COUNT; colour++) {
      expect(isAnagram(lettersFor(cells, colour).join(""), UNIVERSES[colour].word)).toBe(true);
    }
  });

  it("is 64 cells, 8 per colour", () => {
    const cells = gridCells();
    expect(cells).toHaveLength(64);
    for (let colour = 0; colour < UNIVERSE_COUNT; colour++) {
      expect(lettersFor(cells, colour)).toHaveLength(8);
    }
  });

  it("is actually shuffled — colours are not in eight solid runs", () => {
    const cells = gridCells();
    const runs = cells.filter((c, i) => i === 0 || c.colour !== cells[i - 1].colour).length;
    expect(runs).toBeGreaterThan(UNIVERSE_COUNT);
  });

  it("is deterministic — every team sees the same board", () => {
    const words = UNIVERSES.map((u) => u.word);
    expect(buildGrid(words, SEED)).toEqual(buildGrid(words, SEED));
  });
});

describe("answer checking is per universe", () => {
  it("accepts each universe's own word for a team in it", () => {
    for (let team = 1; team <= 16; team++) {
      const word = __test.wordFor(universeFor(team));
      expect(isCorrectAnswer(team, word), `team ${team}`).toBe(true);
      expect(isCorrectAnswer(team, word.toLowerCase())).toBe(true);
      expect(isCorrectAnswer(team, ` ${word.toLowerCase()} `)).toBe(true);
    }
  });

  it("rejects another universe's word", () => {
    // Team 10 is universe 2; team 9 is universe 1. Their answers must not swap.
    const team = 10;
    for (let i = 0; i < UNIVERSE_COUNT; i++) {
      const expected = i === universeFor(team);
      expect(isCorrectAnswer(team, __test.wordFor(i)), `word ${i}`).toBe(expected);
    }
  });

  it("rejects an anagram of the right word — ordering is the puzzle", () => {
    const team = 10;
    const word = __test.wordFor(universeFor(team));
    const scrambled = [...word].reverse().join("");
    expect(scrambled).not.toBe(word);
    expect(isCorrectAnswer(team, scrambled)).toBe(false);
  });

  it("rejects empty input and junk", () => {
    expect(isCorrectAnswer(10, "")).toBe(false);
    expect(isCorrectAnswer(10, "!!!")).toBe(false);
  });

  it("normalises the same way the form does", () => {
    expect(normaliseAnswer(" fire-wall ")).toBe("FIREWALL");
  });
});

describe("buildGrid rejects malformed input", () => {
  it("needs exactly eight words", () => {
    expect(() => buildGrid(["abcdefgh"], SEED)).toThrow(/exactly 8/);
  });

  it("needs every word to be eight letters", () => {
    const bad = [...UNIVERSES.slice(0, 7).map((u) => u.word), "short"];
    expect(() => buildGrid(bad, SEED)).toThrow(/8 letters/);
  });
});
