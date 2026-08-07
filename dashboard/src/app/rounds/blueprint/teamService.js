/**
 * Blueprint Recovery — client service layer.
 *
 * A REWRITE OF `services/teamService.js`, keeping the exported function names
 * and return shapes so the nine page components did not have to be rewritten
 * with them. Everything underneath changed: Supabase queries, RPCs and Edge
 * Function invocations became `fetch` calls to `/api/blueprint/*`, which talk
 * to Mongo.
 *
 * ── WHAT DELIBERATELY DID NOT SURVIVE THE PORT ─────────────────────────────
 *
 * The original leaned on a chain of client-side fallbacks whenever Supabase was
 * unreachable or refused a write, and each one handed the browser a decision
 * the server should have been making:
 *
 *   - `validateCheckpoint` compared the typed code against `defaultAccessCode`
 *     from `lib/constants.js`. All ten codes shipped in the bundle.
 *   - `getRevealedLocation` computed `Inspection Point <n><X>` locally, so the
 *     location existed client-side before any coordinator revealed it.
 *   - `performCoordinatorAction` tried hardcoded coordinator passwords, then a
 *     direct table update, then returned an "optimistic" success object so the
 *     UI showed the action as done even when nothing was written.
 *
 * There are no fallbacks here. If the server cannot be reached, these return an
 * error and the UI says so. A round that quietly tells a team they finished
 * when nothing was recorded is worse than one that says "try again".
 */

async function call(url, options) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      ...options,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: body.error || "Something went wrong. Try again." };
    }
    return { data: body, error: null };
  } catch {
    return { data: null, error: "Couldn't reach the server — check your connection." };
  }
}

/** This team's current state. The team number comes from the session cookie. */
export async function getTeamState() {
  return call("/api/blueprint/state");
}

/** Begin the round (not_started → in_progress). Idempotent. */
export async function startRound() {
  return call("/api/blueprint/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start" }),
  });
}

/**
 * "We have reached our sector" (in_progress → awaiting_reveal).
 *
 * This is as far as a team can move itself. The next step needs a coordinator,
 * which is what makes the round physical.
 */
export async function markReadyForReveal() {
  return call("/api/blueprint/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "notify" }),
  });
}

/**
 * Submit the access code from the card at the checkpoint.
 *
 * Returns `{ correct, error }`. The server decides; there is no local compare.
 */
export async function validateCheckpoint(code) {
  const clean = String(code || "").trim();
  if (!clean) {
    return { correct: false, error: "Please enter an access code before submitting." };
  }

  const { data, error } = await call("/api/blueprint/checkpoint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: clean }),
  });

  if (error) return { correct: false, error };
  if (data.correct) return { correct: true, status: data.status, error: null };

  return {
    correct: false,
    status: data.status,
    error: data.error || "ACCESS DENIED — ENCRYPTION KEY MISMATCH",
  };
}

/* ── Coordinator ──────────────────────────────────────────────────────────
   Gated by the dashboard's admin cookie, set by typing ADMIN_CODE into the
   team-number box on the entry screen. There is no password to pass here and
   none in this bundle. */

export async function fetchDashboardTeams() {
  const { data, error } = await call("/api/blueprint/coordinator");
  return { data: data?.teams ?? [], error };
}

async function coordinatorAction(action, teamNumber) {
  return call("/api/blueprint/coordinator", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamNumber, action }),
  });
}

export const revealLocation = (teamNumber) => coordinatorAction("reveal", teamNumber);
export const resetTeam = (teamNumber) => coordinatorAction("reset", teamNumber);
export const overrideTeamComplete = (teamNumber) => coordinatorAction("override", teamNumber);
