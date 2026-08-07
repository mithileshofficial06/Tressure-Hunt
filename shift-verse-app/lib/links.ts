/**
 * Where the hunt dashboard lives.
 *
 * NEXT_PUBLIC_ on purpose, unlike almost everything else: this is read in
 * client components to render a link back to the hub, and it is not a secret —
 * it is a URL participants are already looking at. Inlined at build time, so
 * changing it needs a rebuild, not just a restart.
 */
export function dashboardUrl(): string {
  return process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000/dashboard';
}
