import { describe, it, expect } from "vitest";
// Vanilla JS game modules — untyped, but `allowJs` lets TS infer enough that no
// suppression is needed. The casts below carry the shape instead.
import { LEVELS as CLIENT_LEVELS } from "../../../game_src/levels.js";
import { solveCircuit as clientSolve } from "../../../game_src/voltage.js";
import { LEVELS as SERVER_LEVELS } from "./levels";
import { solveCircuit as serverSolve, type PlacedPiece } from "./solve";

/**
 * The two solvers must agree, always.
 *
 * The browser decides when to show the win overlay; the server decides whether
 * the level counts. If they ever disagree, a team sees "CIRCUIT COMPLETE!",
 * the submission is rejected, and nobody can explain why — the worst possible
 * failure at a live event, because it looks like the team's fault.
 *
 * `pieces.ts` warns that its table is a hand-kept copy of `game_src/pieces.js`
 * and that the two must stay in step. This is the test that notices when they
 * don't. It also checks the two LEVEL tables, which are likewise duplicated.
 */

interface ClientLevel {
  id: number;
  rows: number;
  cols: number;
  targetVoltage: number;
  fixedTiles: Array<Record<string, unknown>>;
  inventory: Array<{ type: string; count: number }>;
}

const clientLevels = CLIENT_LEVELS as ClientLevel[];

/** Deterministic PRNG — a failure has to be reproducible to be fixable. */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Scatter inventory tiles onto free cells, the way a flailing player would. */
function randomBoard(level: ClientLevel, rand: () => number): PlacedPiece[] {
  const fixed = new Set(
    level.fixedTiles.map((t) => `${t.row as number},${t.col as number}`)
  );

  const free: Array<[number, number]> = [];
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      if (!fixed.has(`${r},${c}`)) free.push([r, c]);
    }
  }

  // Fisher-Yates over the free cells, so no cell is chosen twice.
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }

  const pool: string[] = [];
  for (const item of level.inventory) {
    for (let i = 0; i < item.count; i++) pool.push(item.type);
  }

  const n = Math.min(pool.length, free.length, 1 + Math.floor(rand() * pool.length));
  return Array.from({ length: n }, (_, i) => ({
    row: free[i][0],
    col: free[i][1],
    type: pool[i],
    rotation: Math.floor(rand() * 4),
  }));
}

/** The server takes a flat list; the browser takes a 2D grid. Same board. */
function toGrid(pieces: PlacedPiece[], level: ClientLevel) {
  const grid: Array<Array<{ type: string; rotation: number } | null>> = Array.from(
    { length: level.rows },
    () => Array<{ type: string; rotation: number } | null>(level.cols).fill(null)
  );
  for (const p of pieces) grid[p.row][p.col] = { type: p.type, rotation: p.rotation };
  return grid;
}

describe("level tables agree", () => {
  it("has the same levels on both sides", () => {
    expect(SERVER_LEVELS.map((l) => l.id)).toEqual(clientLevels.map((l) => l.id));
  });

  for (const server of SERVER_LEVELS) {
    it(`level ${server.id} matches the client's copy`, () => {
      const client = clientLevels.find((l) => l.id === server.id);
      expect(client, `client is missing level ${server.id}`).toBeDefined();

      expect(client!.rows).toBe(server.rows);
      expect(client!.cols).toBe(server.cols);
      // The target is the whole win condition. A mismatch here means the game
      // and the grader are playing different puzzles.
      expect(client!.targetVoltage).toBe(server.targetVoltage);
      expect(client!.fixedTiles.length).toBe(server.fixedTiles.length);

      const norm = (inv: Array<{ type: string; count: number }>) =>
        [...inv].map((i) => `${i.type}:${i.count}`).sort();
      expect(norm(client!.inventory)).toEqual(norm(server.inventory));
    });
  }
});

describe("solvers agree on the same board", () => {
  for (const server of SERVER_LEVELS) {
    it(`level ${server.id}: 300 random boards score identically`, () => {
      const client = clientLevels.find((l) => l.id === server.id)!;
      const rand = makeRandom(server.id * 7919);

      for (let i = 0; i < 300; i++) {
        const pieces = randomBoard(client, rand);

        const mine = serverSolve(pieces, server);
        const theirs = clientSolve(toGrid(pieces, client), client) as {
          voltage: number;
          connected: boolean;
          endNodeReached: boolean;
        };

        const where = `level ${server.id}, board ${i}`;
        expect(theirs.voltage, `voltage — ${where}`).toBe(mine.voltage);
        expect(theirs.connected, `connected — ${where}`).toBe(mine.connected);
        expect(theirs.endNodeReached, `endNodeReached — ${where}`).toBe(mine.endNodeReached);
      }
    });
  }
});
