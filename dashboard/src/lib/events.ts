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
export const ROOM_SLUG = "hunt-room";

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
  // The room is heavy (three.js + a 7k-line scene) but it is still just React
  // on this design system, so it belongs here. Its weight is handled by loading
  // the scene dynamically — see rounds/room/RoomRound.tsx — not by giving it a
  // deployment of its own.
  [ROOM_SLUG]: "/rounds/room",
  // The circuit brings a vanilla-JS canvas game and two stylesheets of its own,
  // which is exactly the profile that used to justify a separate deployment. It
  // does not: a stylesheet is a bundling problem, and running it here is what
  // lets the round read the session cookie instead of `?team=N`.
  [CIRCUIT_SLUG]: "/rounds/circuit",
  // Shift Verse brings a 1.2k-line stylesheet, a three.js portal and ~23MB of
  // media, which was the strongest case of the three for staying separate. It
  // still is not one: media goes in `public/`, and being here is what lets the
  // board read the session cookie instead of asking a team to type its number
  // into an entry screen that any other team could also type into.
  [SHIFTVERSE_SLUG]: "/rounds/shiftverse",
};

/**
 * Fill in the hrefs.
 *
 * ONE SHAPE NOW, AND THAT IS THE WHOLE POINT. There used to be two: rounds that
 * were plain React lived here and got the session cookie, while rounds carrying
 * an engine or a stylesheet ran as their OWN Next apps on ports 3001 and 3003,
 * and the tile linked out with `?team=N` in the query string.
 *
 * That second shape is gone. It cost three servers to keep alive, three Mongo
 * connection pools against one Atlas cluster, three copies of `deriveTimings`
 * and the round list that had to be edited in lockstep, two duplicate `summary`
 * endpoints, and — the part that actually mattered — a team identity that was
 * a NUMBER IN A URL. Anyone could play as any team by editing it, and the
 * round's own API could only check that the number existed on the roster,
 * because it had no way to know who was asking.
 *
 * Every round is an ordinary route in this app, so every round reads the signed
 * cookie. There is no port to get wrong, no env var to forget at deploy time,
 * and nothing to edit in a URL.
 *
 * `teamNumber` is no longer needed to build a link. It is kept in the signature
 * because the dashboard page passes it and a round may want it again.
 */
export function resolveEventHrefs(_teamNumber: number): HuntEvent[] {
  return EVENTS.map((e) => {
    const internal = INTERNAL_ROUNDS[e.slug];
    return internal ? { ...e, href: internal } : { ...e };
  });
}
