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
 * Fixed formatting locale. NOT the reader's timezone — that still comes from
 * the runtime. Do not replace this with `[]` or `undefined`; see above.
 */
const LOCALE = "en-GB";

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
  return d.toLocaleString(LOCALE, { hour12: false });
}

/** Elapsed since a start time — drives the live "running" clock on the board. */
export function elapsedSince(iso: string, now: number): number {
  const start = new Date(iso).getTime();
  return Number.isNaN(start) ? 0 : Math.max(0, now - start);
}
