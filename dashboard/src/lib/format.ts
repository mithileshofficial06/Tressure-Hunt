/**
 * Timestamp rendering, shared by both boards.
 *
 * Everything crossing the server → client boundary is an ISO string and gets
 * formatted here, so times show in the reader's own TIMEZONE rather than the
 * server's. On Vercel that difference is UTC vs. IST — five and a half hours of
 * "why does it say the team finished at 4am".
 *
 * ── THE LOCALE IS PINNED, AND THAT IS DELIBERATE ──────────────────────────
 *
 * These functions run in BOTH places. The boards are client components, but
 * Next server-renders them first, so every one of these calls happens twice:
 * once in Node, once in the browser. `toLocaleTimeString([])` asks each runtime
 * for its own default locale, and they do not agree — Node's ICU renders the
 * day marker lowercase (`07:07:13 pm`), Chrome renders it uppercase
 * (`07:07:13 PM`). React compares the two, finds different text, and throws a
 * hydration error on the admin board.
 *
 * Pinning the locale removes the disagreement without giving up the thing that
 * actually mattered: `toLocaleTimeString` still converts into the READER's
 * timezone, which is the whole point. Only the formatting is fixed.
 *
 * 24-hour is the right choice for a hunt anyway — no am/pm to misread on a
 * projector at 7pm, and it sorts the way it reads.
 */

/**
 * Fixed formatting locale. Do not replace this with `[]` or `undefined`.
 */
const LOCALE = "en-GB";

/**
 * THE EVENT'S TIMEZONE. Pinned, and it has to be.
 *
 * Pinning the locale alone was not enough, and the reason only showed up in
 * production. `toLocaleTimeString` formats in the RUNTIME's timezone, and these
 * functions run twice — once during SSR, once on hydration:
 *
 *   Vercel (server) runs in UTC   → 13:37:13
 *   A phone at the venue (client) → 19:07:13   (IST, +5:30)
 *
 * Not a formatting difference — a five-and-a-half-hour one. React saw different
 * text and threw a hydration error on the admin board (React #418). Locally it
 * never appeared, because there the server and the browser are both IST and
 * only the am/pm casing disagreed.
 *
 * So the timezone is stated rather than inherited. Both renders now agree, and
 * every screen shows VENUE time regardless of where it was rendered or who is
 * reading — which is what a coordinator comparing a wall clock to a finish time
 * actually needs. A team abroad watching a livestream would see venue time too;
 * that is correct for a hunt, not a bug.
 *
 * Override with `NEXT_PUBLIC_EVENT_TZ` if the event ever moves. It must be
 * NEXT_PUBLIC_ so the browser reads the SAME value the server did — a
 * server-only variable here would reintroduce exactly this bug.
 */
const TZ = process.env.NEXT_PUBLIC_EVENT_TZ || "Asia/Kolkata";

/** "1h 23m 45s" — always at least a seconds part, so 0 renders as "0s". */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";

  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Wall-clock time to the second — what a coordinator reads off the table. */
export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

/**
 * Date + time, for the CSV export and anything that outlives the event day.
 *
 * Same pinned locale as `formatClock`, for the same reason plus one more: a CSV
 * whose date format depends on whoever happened to export it is a CSV that
 * cannot be compared with last year's.
 */
export function formatStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(LOCALE, { hour12: false, timeZone: TZ });
}

/** Elapsed since a start time — drives the live "running" clock on the board. */
export function elapsedSince(iso: string, now: number): number {
  const start = new Date(iso).getTime();
  return Number.isNaN(start) ? 0 : Math.max(0, now - start);
}
