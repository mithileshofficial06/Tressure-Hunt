import { describe, it, expect } from "vitest";
import { GRID_COLOURS, buildGrid, lettersFor, isAnagram, normaliseAnswer } from "./grid";
import { EQUATIONS, gridCells, isCorrectAnswer, __test } from "./gridPuzzle.server";

const { WORDS, SEED, EQUATION_ANSWERS, TARGET_COLOUR } = __test;

/**
 * The 64 Grid's invariants.
 *
 * Most of these guard failures that would look completely fine on screen and
 * only surface as "this puzzle is impossible" with sixty teams in the room.
 */

describe("the puzzle is solvable at all", () => {
  it("the equations select the colour whose letters spell the answer", () => {
    // THE central invariant. If the equations sum to a different colour, the
    // grid still renders, the anagram hint still fires for the wrong group, and
    // nobody can solve it — the failure is completely invisible until it isn't.
    const sum = EQUATION_ANSWERS.reduce((a, b) => a + b, 0);
    expect(sum % GRID_COLOURS.length).toBe(TARGET_COLOUR);
  });

  it("has one equation answer per equation", () => {
    expect(EQUATION_ANSWERS.length).toBe(EQUATIONS.length);
  });

  it("the target colour's letters anagram to the answer", () => {
    const letters = lettersFor(gridCells(), TARGET_COLOUR).join("");
    expect(isAnagram(letters, __test.answer())).toBe(true);
  });
});

describe("the grid gives nothing away", () => {
  it("every colour group spells a real word, so none stands out", () => {
    // If only the target group anagrammed to a word, a team could skip the
    // equations entirely by looking for the group that reads.
    const cells = gridCells();
    for (let colour = 0; colour < GRID_COLOURS.length; colour++) {
      const letters = lettersFor(cells, colour).join("");
      expect(isAnagram(letters, WORDS[colour]), `colour ${colour}`).toBe(true);
    }
  });

  it("is 64 cells, 8 per colour", () => {
    const cells = gridCells();
    expect(cells).toHaveLength(64);
    for (let colour = 0; colour < GRID_COLOURS.length; colour++) {
      expect(lettersFor(cells, colour)).toHaveLength(8);
    }
  });

  it("is actually shuffled — colours are not in eight solid runs", () => {
    // An unshuffled grid would show each word's letters contiguously and in
    // order, which is the whole puzzle given away.
    const cells = gridCells();
    const runs = cells.filter((c, i) => i === 0 || c.colour !== cells[i - 1].colour).length;
    expect(runs).toBeGreaterThan(GRID_COLOURS.length);
  });

  it("is deterministic — the same seed rebuilds the same grid", () => {
    // Every team must see the same board, and a coordinator pointing at a
    // projector has to be talking about the same cells as the team's screen.
    expect(buildGrid(WORDS, SEED)).toEqual(buildGrid(WORDS, SEED));
  });
});

describe("answer checking", () => {
  it("accepts the answer, in any case or spacing", () => {
    const answer = __test.answer();
    expect(isCorrectAnswer(answer)).toBe(true);
    expect(isCorrectAnswer(answer.toLowerCase())).toBe(true);
    expect(isCorrectAnswer(` ${answer.toLowerCase()} `)).toBe(true);
  });

  it("rejects an anagram of the answer — ordering is the puzzle", () => {
    const scrambled = [...__test.answer()].reverse().join("");
    expect(scrambled).not.toBe(__test.answer());
    expect(isCorrectAnswer(scrambled)).toBe(false);
  });

  it("rejects the other seven words, empty input and junk", () => {
    for (let i = 0; i < WORDS.length; i++) {
      if (i === TARGET_COLOUR) continue;
      expect(isCorrectAnswer(WORDS[i]), WORDS[i]).toBe(false);
    }
    expect(isCorrectAnswer("")).toBe(false);
    expect(isCorrectAnswer("!!!")).toBe(false);
  });

  it("normalises the same way the form does", () => {
    expect(normaliseAnswer(" day-bugle ")).toBe("DAYBUGLE");
  });
});

describe("buildGrid rejects malformed input", () => {
  it("needs exactly eight words", () => {
    expect(() => buildGrid(["abcdefgh"], SEED)).toThrow(/exactly 8/);
  });

  it("needs every word to be eight letters", () => {
    const bad = [...WORDS.slice(0, 7), "short"];
    expect(() => buildGrid(bad, SEED)).toThrow(/8 letters/);
  });
});
