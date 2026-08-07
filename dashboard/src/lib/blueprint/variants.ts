/**
 * The PUBLIC half of a Blueprint Recovery sector.
 *
 * A team has to be told which sector it is assigned to — that is the whole
 * briefing screen, and it is what sends them walking to the right physical
 * checkpoint. Colour and sector name are therefore client-safe by necessity.
 *
 * WHAT IS NOT HERE, AND MUST NEVER BE: `correctLocation` and `correctCode`.
 * Those live in `variants.server.ts` and are compared only on the server. This
 * split is the entire security model of the round — see that file.
 */

export const TOTAL_VARIANTS = 10;

export interface PublicVariant {
  variantNumber: number;
  color: string;
  sectorName: string;
}

/**
 * Sector assignment. Sixty teams cycle across ten sectors.
 *
 * `((teamNumber - 1) % 10) + 1`, carried over unchanged from the Supabase
 * version's `getVariantNumber` and from the `coordinator_action` RPC, which
 * computed the same thing in SQL. Changing it re-points every team at a
 * different physical checkpoint, so it must match the printed cards.
 */
export function variantNumberFor(teamNumber: number): number {
  const n = Number(teamNumber);
  if (!Number.isInteger(n) || n <= 0) return 1;
  return ((n - 1) % TOTAL_VARIANTS) + 1;
}

/** Colour + sector name only. Named after each Spider-Man's home dimension. */
export const PUBLIC_VARIANTS: readonly PublicVariant[] = [
  { variantNumber: 1, color: "Red", sectorName: "Earth-616" },
  { variantNumber: 2, color: "Blue", sectorName: "Earth-928" },
  { variantNumber: 3, color: "Green", sectorName: "Earth-138" },
  { variantNumber: 4, color: "Yellow", sectorName: "Earth-1610" },
  { variantNumber: 5, color: "Orange", sectorName: "Earth-50101" },
  { variantNumber: 6, color: "Purple", sectorName: "Earth-22191" },
  { variantNumber: 7, color: "Black", sectorName: "Earth-90214" },
  { variantNumber: 8, color: "White", sectorName: "Earth-65" },
  { variantNumber: 9, color: "Pink", sectorName: "Earth-14512" },
  { variantNumber: 10, color: "Brown", sectorName: "Earth-8311" },
];

export function publicVariantFor(teamNumber: number): PublicVariant {
  return PUBLIC_VARIANTS[variantNumberFor(teamNumber) - 1];
}

/** The five states a team moves through. Carried over from the SQL constraint. */
export type BlueprintStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_reveal"
  | "checkpoint_a_done"
  | "complete";

export const BLUEPRINT_STATUSES: readonly BlueprintStatus[] = [
  "not_started",
  "in_progress",
  "awaiting_reveal",
  "checkpoint_a_done",
  "complete",
];
