/**
 * Timestamp rendering, shared by both boards.
 *
 * Everything crossing the server → client boundary is an ISO string and gets
 * formatted here, in the browser, so times show in the coordinator's own
 * timezone rather than the server's. On Vercel that difference is UTC vs. IST —
 * five and a half hours of "why does it say the team finished at 4am".
 */

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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Date + time, for the CSV export and anything that outlives the event day. */
export function formatStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

/** Elapsed since a start time — drives the live "running" clock on the board. */
export function elapsedSince(iso: string, now: number): number {
  const start = new Date(iso).getTime();
  return Number.isNaN(start) ? 0 : Math.max(0, now - start);
}
