import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSession } from "@/lib/session";
import { isConfigured } from "@/lib/db";
import { LEVELS } from "@/lib/octovius/levels";
import { solveCircuit, type PlacedPiece } from "@/lib/octovius/solve";
import {
  allLevelsDone,
  isRegistered,
  recordLevelSolved,
  solvedLevels,
  stampHuntRound,
} from "@/lib/octovius/progress";

/**
 * POST /api/circuit/submit — the server rebuilds the circuit and decides.
 *
 * The version this replaces did:
 *
 *     data = JSON.parse(payload);
 *     if (data.voltage !== data.targetVoltage) return wrong;
 *
 * Both numbers came out of the same client payload, so the grader was asking
 * the browser whether the browser had won. A hand-written request carrying
 * `{"voltage":0,"targetVoltage":0}` scored full points without the game ever
 * being loaded.
 *
 * Now the payload carries only the tiles a player placed. The level — grid
 * size, source voltage, fixed modifiers, x-blocks, end nodes and the target —
 * comes from LEVELS on the server, and each tile's connections and modifier
 * value are derived from its type rather than read off the submission. The
 * strongest thing a forged request can claim is an arrangement of real tiles,
 * which either completes the circuit or does not.
 */

const MAX_PIECES = 200;

/** Accept only what the solver needs, and only in the shape it expects. */
function parsePieces(raw: unknown): PlacedPiece[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PIECES) return null;

  const out: PlacedPiece[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) return null;
    const { row, col, type, rotation } = p as Record<string, unknown>;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (typeof type !== "string" || type.length > 32) return null;
    if (!Number.isInteger(rotation)) return null;
    out.push({ row: row as number, col: col as number, type, rotation: rotation as number });
  }
  return out;
}

/**
 * Did the player use only tiles they were actually given?
 *
 * The inventory is part of the puzzle — several levels hand out decoy modifiers
 * precisely so the wrong ones are tempting. Without this a submission could
 * place fifty of whichever tile makes the arithmetic work, which is a different
 * and much easier game than the one on screen.
 */
function withinInventory(
  pieces: PlacedPiece[],
  inventory: Array<{ type: string; count: number }>
): boolean {
  const allowed = new Map(inventory.map((i) => [i.type, i.count]));
  const used = new Map<string, number>();
  for (const p of pieces) used.set(p.type, (used.get(p.type) ?? 0) + 1);
  for (const [type, n] of used) {
    if (n > (allowed.get(type) ?? 0)) return false;
  }
  return true;
}

export async function POST(req: Request) {
  /**
   * THE TEAM NUMBER COMES FROM THE COOKIE, NEVER THE BODY.
   *
   * The standalone app had no choice: it was a separate origin with no session,
   * so it read `teamNumber` out of the posted JSON and could only check that the
   * number was on the roster. Anyone could therefore clear levels for any team
   * by changing a field — the comment on `isRegistered` in that version said as
   * much ("a cookie-less app can be POSTed to by anyone").
   *
   * Folding the round into this app removes the reason for that compromise. The
   * signed session cookie says which team is playing, so the round is now as
   * strongly authenticated as the grid and the room, and the `team=N` query
   * string is gone from the URL entirely.
   */
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { levelId, pieces } = (body ?? {}) as {
    levelId?: unknown;
    pieces?: unknown;
  };

  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) {
    return NextResponse.json({ error: "No such level." }, { status: 400 });
  }

  const placed = parsePieces(pieces);
  if (!placed) {
    return NextResponse.json({ error: "Invalid board." }, { status: 400 });
  }
  if (!withinInventory(placed, level.inventory)) {
    return NextResponse.json(
      { solved: false, reason: "inventory-exceeded" },
      { status: 200 }
    );
  }

  try {
    // A cookie can outlive the row it refers to, if the roster was reset while
    // a browser held a session.
    if (!(await isRegistered(teamNumber))) {
      return NextResponse.json({ error: "That team is no longer registered." }, { status: 404 });
    }

    const result = solveCircuit(placed, level);
    const won =
      result.connected && result.endNodeReached && result.voltage === level.targetVoltage;

    if (!won) {
      return NextResponse.json({ solved: false, voltage: result.voltage }, { status: 200 });
    }

    await recordLevelSolved(teamNumber, level.id);

    const solved = await solvedLevels(teamNumber);
    const allDone = allLevelsDone(solved);

    // Only the full set credits the dashboard round: the tile is one round
    // worth 100 points, and the five levels are what it takes to clear it.
    if (allDone) await stampHuntRound(teamNumber);

    return NextResponse.json({
      solved: true,
      voltage: result.voltage,
      levelId: level.id,
      solvedLevels: solved,
      totalLevels: LEVELS.length,
      roundComplete: allDone,
    });
  } catch (err) {
    console.error("[circuit/submit] failed", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 502 });
  }
}
