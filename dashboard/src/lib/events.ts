/**
 * The five rounds, as the dashboard shows them.
 *
 * `slug` matches the challenge slugs in SympoApp so the progress rows this
 * dashboard reads are the same rows the real graders write. `href` is where the
 * tile sends a team; null means the round is not wired up in this app yet and
 * the tile stays inert rather than 404-ing mid-event.
 */
export interface HuntEvent {
  slug: string;
  title: string;
  tagline: string;
  blurb: string;
  points: number;
  href: string | null;
}

export const EVENTS: readonly HuntEvent[] = [
  {
    slug: "circuit-1",
    title: "Octavius Circuit",
    tagline: "Five levels · voltage routing",
    blurb:
      "Lay the circuit from source to end node so the current arrives at exactly the target voltage. The inventory contains decoys.",
    points: 100,
    href: null,
  },
  {
    slug: "hunt-blueprint",
    title: "Blueprint Recovery",
    tagline: "Physical sector · access code",
    blurb:
      "Your team is assigned one of ten dimensional sectors. Walk to it, find the card, bring back the access code. The code is not on any screen.",
    points: 100,
    href: null,
  },
  {
    slug: "hunt-room",
    title: "Mystery Room",
    tagline: "3D room · five sections",
    blurb:
      "An antique room with five locked sections. Each hides a word written somewhere in the scene — on paper, in a web, in a beam of light.",
    points: 100,
    href: null,
  },
  {
    slug: "hunt-grid",
    title: "64 Grid",
    tagline: "8×8 colours · one anagram",
    blurb:
      "Sixty-four coloured letters. Three equations pick a colour; that colour's eight letters anagram to the answer.",
    points: 100,
    href: null,
  },
  {
    slug: "hunt-shiftverse",
    title: "Shift Verse",
    tagline: "Caesar board · timed",
    blurb:
      "Every letter on the board moved the same distance down the alphabet. Find the shift, read the name, beat the clock.",
    points: 100,
    href: null,
  },
];

export const EVENT_SLUGS = EVENTS.map((e) => e.slug);

/**
 * Every round is worth the same.
 *
 * Named here so the separate round apps can report "+100" in their finish
 * dialogue without importing this package — they hold their own copy, and this
 * is the one to change if scoring ever stops being flat.
 */
export const POINTS_PER_ROUND = 100;

export const SHIFTVERSE_SLUG = "hunt-shiftverse";
export const CIRCUIT_SLUG = "circuit-1";
export const GRID_SLUG = "hunt-grid";

/**
 * Rounds that live inside THIS app, as ordinary routes.
 *
 * No team number in the URL: an in-app route reads the signed session cookie,
 * which is strictly better than a query string — it cannot be edited to play as
 * another team. Rounds only end up here when they are plain React on this
 * design system; anything carrying its own engine or assets goes below.
 */
const INTERNAL_ROUNDS: Record<string, string> = {
  [GRID_SLUG]: "/rounds/grid",
};

/**
 * Base URL for each round that runs as its own app.
 *
 * SERVER-SIDE ONLY — deliberately not NEXT_PUBLIC_, so these are read at
 * request time and changing one needs a restart rather than a rebuild.
 */
const EXTERNAL_ROUNDS: Record<string, { env: string; fallback: string; path: string }> = {
  [SHIFTVERSE_SLUG]: {
    env: "SHIFTVERSE_URL",
    fallback: "http://localhost:3001",
    path: "/game",
  },
  [CIRCUIT_SLUG]: {
    env: "OCTAVIUS_URL",
    fallback: "http://localhost:3003",
    path: "/game",
  },
};

/**
 * Fill in the hrefs that depend on who is asking.
 *
 * Two shapes, for two good reasons. Rounds that carry their own engine, assets
 * and stylesheet run as separate apps, and the tile links out with the team
 * number in the query string — the team already typed it to register, and
 * making them type it again on a game's own entry screen is both friction and a
 * chance to land on another team's board. Rounds that are just React on this
 * design system live here, and get the session cookie instead.
 *
 * Call this in the page and pass the result down; it reads env, so it must not
 * run in a client component.
 */
export function resolveEventHrefs(teamNumber: number): HuntEvent[] {
  return EVENTS.map((e) => {
    const internal = INTERNAL_ROUNDS[e.slug];
    if (internal) return { ...e, href: internal };

    const target = EXTERNAL_ROUNDS[e.slug];
    if (!target) return { ...e };

    const base = (process.env[target.env] || target.fallback).replace(/\/$/, "");
    return { ...e, href: `${base}${target.path}?team=${teamNumber}` };
  });
}
