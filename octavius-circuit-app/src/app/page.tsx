import { dashboardUrl } from "@/lib/links";

/**
 * The root, for anyone who reached this app without a team number.
 *
 * There is no team-entry form on purpose. The dashboard is the only way in, so
 * a second place to type a number would be a second place to type the wrong
 * one — and unlike the dashboard, this app has no way to check that the number
 * belongs to whoever typed it.
 */
export default function Home() {
  return (
    <div className="oc-gate">
      <h1>Octavius Circuit</h1>
      <p>
        Route the current from the source to the end node so it arrives at exactly
        the target voltage. Five levels. The inventory contains decoys.
      </p>
      <p>Open this round from your hunt board — it carries your team number.</p>
      <a href={dashboardUrl()}>Go to the hunt board →</a>
    </div>
  );
}
