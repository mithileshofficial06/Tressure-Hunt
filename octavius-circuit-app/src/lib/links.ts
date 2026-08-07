/**
 * Where the hunt dashboard lives.
 *
 * NEXT_PUBLIC_ because it is read in a client component to render the link back
 * to the hub. It is a URL participants already see, not a secret. Inlined at
 * build time, so changing it needs a rebuild rather than a restart.
 */
export function dashboardUrl(): string {
  return process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000/dashboard";
}
