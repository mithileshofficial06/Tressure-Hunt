import { timingSafeEqual } from "node:crypto";
import { variantNumberFor } from "./variants";

/**
 * BLUEPRINT RECOVERY'S ANSWERS. SERVER ONLY — never import this from a client
 * component.
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS NOT A LIKE-FOR-LIKE PORT ─────────────
 *
 * In the Supabase version these two columns lived in the `variants` table with
 * NO public select policy, and migration 001 spelled out why:
 *
 *     -- IMPORTANT: variants table has NO public select policy.
 *     -- Only the Edge Function (using the service_role key) can read
 *     -- correct_location and correct_code. This is the enforcement mechanism
 *     -- that prevents teams from reading answers via dev tools.
 *
 * That was the right idea, and three things in the client defeated it. They are
 * fixed here rather than reproduced, because porting a leak faithfully is still
 * shipping a leak:
 *
 *   1. `lib/constants.js` carried `defaultAccessCode` for ALL TEN sectors, and
 *      `teamService.validateCheckpoint` fell back to comparing against it in
 *      the browser when the RPC was unavailable. Every access code was one
 *      devtools search away, for a round whose entire point is that the code is
 *      printed on a card at a physical checkpoint. Nothing in this app now
 *      knows a code except this file.
 *   2. `getRevealedLocation` fell back to computing `Inspection Point <n><X>`
 *      client-side, so the location could be derived without a coordinator ever
 *      revealing it — skipping the walk the round is made of.
 *   3. `performCoordinatorAction` shipped the coordinator password as literals
 *      (`'kenrich@202'`, `'RECOVERY_2026'`, …) and tried each in turn from the
 *      browser, with a direct table-update fallback if the RPC refused. Any
 *      team could mark itself complete. Coordinator actions now go through the
 *      dashboard's existing admin cookie — see `api/blueprint/coordinator`.
 *
 * The `.server.ts` suffix is a signpost, not a mechanism; what keeps this out
 * of a client chunk is that only route handlers import it. The build is grepped
 * for these strings afterwards.
 */

interface SecretVariant {
  variantNumber: number;
  /**
   * Checkpoint A: the SECTOR TRACE, released by a coordinator.
   *
   * A riddle naming a real place in the venue, not a coordinate. `trace` is the
   * zone — enough to start walking; `clue` is what to look for once there.
   */
  trace: string;
  clue: string;
  /** Checkpoint B: the code printed on the card at that place. */
  correctCode: string;
}

/**
 * THE TEN SECTORS.
 *
 * Codes are the SHORT set. They were the long forms
 * (`PETER-PARKER-616`, `SPIDER-MAN-2099`, …) carried over from migration 007;
 * these match the printed cards. Note `SPDR-14512` — four letters, no slashes,
 * unlike the old `SP//DR-14512`.
 *
 * MATCHING IS NORMALISED, so the punctuation here is presentation only: a team
 * typing `parker 616`, `Parker-616` or `PARKER616` is accepted either way. What
 * matters is the LETTERS AND DIGITS — change those and the printed cards stop
 * working.
 */
const SECRETS: readonly SecretVariant[] = [
  {
    variantNumber: 1,
    trace: "PERIMETER ZONE — SPIDEY SENSE ACTIVE",
    clue: "Where faces are put on display for all to see",
    correctCode: "PARKER-616",
  },
  {
    variantNumber: 2,
    trace: "CLASS I22",
    clue: "Where the outside world peeks in — that's your target.",
    correctCode: "SPIDER-2099",
  },
  {
    variantNumber: 3,
    trace: "CLASS I21",
    clue: "It swings, it seals, it stands between two worlds",
    correctCode: "PUNK-138",
  },
  {
    variantNumber: 4,
    trace: "CLASS I22",
    clue: "Still and quiet, it holds the switch that wakes the screen — that's your target.",
    correctCode: "MILES-1610",
  },
  {
    variantNumber: 5,
    trace: "CLASS I23",
    clue: "Small and silent, it holds the power that others can't see",
    correctCode: "INDIA-50101",
  },
  {
    variantNumber: 6,
    trace: "STAFF ROOM PERIMETER",
    clue: "Small, blocky, built from pieces, yet still swings and sticks and wears a mask",
    correctCode: "BYTE-22191",
  },
  {
    variantNumber: 7,
    trace: "CLASS I23",
    clue: "Tangled lines and a tool that never touches the screen but controls it all",
    correctCode: "NOIR-90214",
  },
  {
    variantNumber: 8,
    trace: "ZONE UNKNOWN",
    clue: "Where the room is controlled from, and the seat rarely empties",
    correctCode: "GWEN-65",
  },
  {
    variantNumber: 9,
    trace: "STAFF ROOM, EAST CORRIDOR",
    clue: "Some faces have titles but no identity",
    correctCode: "SPDR-14512",
  },
  {
    variantNumber: 10,
    trace: "RESTROOM ZONE",
    clue: "A paper counts the days",
    correctCode: "HAM-8311",
  },
];

/**
 * Where this team's checkpoint is. Only ever returned by a gated route.
 *
 * Returns the trace and the clue separately so the reveal screen can typeset
 * them differently — the zone reads as a heading, the riddle as the thing to
 * puzzle over. `text` is the two joined, for anything that wants one string.
 */
export function locationFor(teamNumber: number): {
  trace: string;
  clue: string;
  text: string;
} {
  const v = SECRETS[variantNumberFor(teamNumber) - 1];
  return { trace: v.trace, clue: v.clue, text: `${v.trace} — ${v.clue}` };
}

/**
 * Strip a typed code down to comparable characters.
 *
 * Matches the Supabase version's "ignores hyphens, spaces, and casing" rule
 * (migration 007). Teams read these off a printed card in a noisy hall and type
 * them on a phone; rejecting `spider man 2099` for the hyphen would be a bug
 * wearing a puzzle's clothes. `SP//DR-14512` is why slashes go too.
 */
function normalise(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Is this the right access code for this team's sector?
 *
 * Per-team by construction: team 3 and team 13 share a sector and a code, team
 * 3 and team 4 do not. A code overheard from the next table is worth nothing
 * unless that team drew the same sector.
 *
 * Length is compared before `timingSafeEqual`, which throws on unequal buffers.
 * That leaks the length of a code printed on a card in a public corridor.
 */
export function isCorrectCode(teamNumber: number, submitted: string): boolean {
  const want = Buffer.from(normalise(SECRETS[variantNumberFor(teamNumber) - 1].correctCode));
  const got = Buffer.from(normalise(submitted));
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}
