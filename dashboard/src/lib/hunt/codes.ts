/**
 * The Mystery Room's reveal code.
 *
 * Client-safe by design, not by oversight. Every one of the room's five section
 * words is *drawn somewhere in the 3D scene* — developed on paper, printed on a
 * page, spun into a web, thrown on the floor in light — so they are in the
 * bundle whatever this file does. The reveal code is assembled on the section
 * faces from these same fragments (see `sectionFragments` in roomTasks.ts), so
 * it has to be here too. The anti-cheat model is a team typing an answer while a
 * coordinator watches, not hiding strings from a browser that has to render
 * them. What makes the room worth playing is the work of finding the words.
 *
 * The server still gets the last word: `/api/team/room` re-checks what the
 * client reports against `roomPuzzle.server.ts` before it stamps the round. See
 * that file for why the duplicate constant is deliberate.
 *
 * ONE CODE PER PUZZLE, NOT THE OBJECT — carried over from the upstream file.
 * SympoApp exports each of its four codes as its own `const` binding because a
 * bundler cannot drop unused properties of an object read by member expression:
 * `import { CODES }` for `CODES.room` dragged three other puzzles' answers into
 * the same chunk. This dashboard only ships the room, so this file holds one
 * code — but keep it a bare binding if the others ever land here.
 */
export const ROOM_CODE = "ARCHIVES88";
