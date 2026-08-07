import { PUBLIC_VARIANTS, publicVariantFor, variantNumberFor } from '@/lib/blueprint/variants';

/**
 * The shape the page components expect, backed by the CLIENT-SAFE variant data.
 *
 * This replaces `lib/constants.js`, which exported the same colours and sector
 * names PLUS a `defaultAccessCode` for every one of the ten sectors. Those were
 * the answers to the round — printed on cards at physical checkpoints — and
 * they were in the client bundle because `teamService.validateCheckpoint` fell
 * back to comparing against them in the browser.
 *
 * Nothing here knows a code. `getVariantForTeam(...).defaultAccessCode` is gone
 * rather than nulled, so a component that still reaches for it fails loudly at
 * build time instead of quietly comparing against `undefined` and accepting an
 * empty box. The comparison lives in `lib/blueprint/variants.server.ts`.
 */

export const TOTAL_TEAMS = 60;
export const TOTAL_VARIANTS = PUBLIC_VARIANTS.length;

/** `{ 1: { color, sectorName }, … }` — the shape CoordinatorDashboard reads. */
export const VARIANT_COLORS = Object.fromEntries(
  PUBLIC_VARIANTS.map((v) => [v.variantNumber, { color: v.color, sectorName: v.sectorName }])
);

export function getVariantNumber(teamNumber) {
  return variantNumberFor(teamNumber);
}

export function getVariantForTeam(teamNumber) {
  const v = publicVariantFor(teamNumber);
  return { variantNumber: v.variantNumber, color: v.color, sectorName: v.sectorName };
}
