import { timingSafeEqual } from "node:crypto";
import { normaliseCode } from "./roomTasks";

/**
 * THE MYSTERY ROOM'S ANSWER. SERVER ONLY — never import this from a client
 * component.
 *
 * The `.server.ts` suffix is a signpost, not a mechanism, exactly as in
 * `gridPuzzle.server.ts`: what keeps it out of a client chunk is that only
 * route handlers and server components import it.
 *
 * ── WHY THIS DUPLICATES `codes.ts`, WHICH IS THE ONE HONEST EXCEPTION ─────
 * The grid's server module exists because its answers had no business being in
 * the browser at all. The room is different, and the difference is worth
 * stating plainly rather than pretending this file hides something.
 *
 * The room CANNOT hide its code. All five section words are drawn into the 3D
 * scene as geometry and text — that is the entire puzzle — and the reveal code
 * is assembled on the section faces from fragments of itself. A player who
 * finishes the room has, by definition, read every character of ARCHIVES88 off
 * the screen. Moving the constant server-side would hide it from nobody and
 * would break the room.
 *
 * So this is not secrecy. It is AUTHORITY. Without it the only thing standing
 * between a team and a stamped round is a `fetch` they can type into a console
 * themselves. With it the server decides what a solve is, the team number comes
 * from the signed cookie rather than the body, and the round is stamped in one
 * place that a client cannot talk its way past — the same shape as
 * `/api/team/grid`, so there is one story about how a round gets marked rather
 * than two.
 *
 * The check is deliberately cheap because the work was the walking, not the
 * typing. It is a gate on the endpoint, not a second puzzle.
 */
const ROOM_ANSWER = "ARCHIVES88";

/**
 * Does this reported code clear the room?
 *
 * Normalised through the room's own `normaliseCode` so the endpoint accepts
 * exactly what the console accepts — case, spacing and the stray characters a
 * fast typist leaves behind are noise here too, and a rule that differs between
 * the two would show up as a room that says "solved" while the server says no.
 *
 * `timingSafeEqual` needs equal-length buffers, so length is compared first.
 * That leaks the length of a 10-character constant which is printed on screen
 * anyway; the constant-time compare is here for consistency with the grid's
 * checker rather than because a timing oracle would tell an attacker anything
 * the room has not already shown them.
 */
export function isCorrectRoomCode(reported: string): boolean {
  const got = Buffer.from(normaliseCode(reported));
  const want = Buffer.from(ROOM_ANSWER);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
