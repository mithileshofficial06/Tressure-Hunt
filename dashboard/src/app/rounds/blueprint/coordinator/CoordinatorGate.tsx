"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Coordinator sign-in, on the coordinator route.
 *
 * ── WHY THIS EXISTS AT ALL, HAVING ARGUED AGAINST IT ──────────────────────
 *
 * This route used to `redirect("/dashboard")` for anyone without the admin
 * cookie. The gate was right; the behaviour was not. A coordinator opening the
 * URL was bounced to the team board with NO explanation — nothing said
 * "coordinator access required", nothing said how to get it. It read as the
 * page being broken or gone.
 *
 * So the gate stays and the silence goes. The page still refuses to render the
 * board without the cookie — `page.tsx` checks on the server, and
 * `/api/blueprint/coordinator` checks again on every request — but now it says
 * so and offers the way through.
 *
 * ── HOW THIS DIFFERS FROM THE PASSWORD BOX I DELETED ──────────────────────
 *
 * The original compared the typed password against
 * `NEXT_PUBLIC_COORDINATOR_PASSWORD || 'kenrich@202'`, a literal compiled into
 * the client bundle, and on a match wrote a token to sessionStorage that was
 * then trusted as authorisation for every reveal.
 *
 * This posts to `/api/admin/login`, the endpoint the hunt already uses. The
 * code is compared SERVER-SIDE against `ADMIN_CODE`, which is never sent to the
 * browser, and wrong guesses are rate-limited to 10/min per IP. Nothing here
 * knows the code, and nothing here decides the answer.
 *
 * No new secret either: it is the same code a coordinator already types into
 * the team-number box to reach `/admin`.
 */
export default function CoordinatorGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim() === "") return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "ACCESS DENIED — INVALID AUTHORIZATION KEY.");
        setBusy(false);
        return;
      }

      // The cookie is set. `refresh()` re-runs the server component, which now
      // passes its own check and renders the board — no full reload, and no
      // second place that decides whether we are allowed in.
      router.refresh();
    } catch {
      setError("COULDN'T REACH THE SERVER — CHECK YOUR CONNECTION.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#141313] text-[#e5e2e1] flex items-center justify-center p-6 font-['Courier_Prime'] relative">
      <div className="fixed inset-0 scanlines pointer-events-none opacity-60" />

      <div className="w-full max-w-md bg-[#0e0e0e] border-4 border-[#3a3939] p-8 shadow-2xl relative z-10">
        <div className="flex items-center gap-2 mb-4 text-[#00fbfb]">
          <span className="material-symbols-outlined">shield_lock</span>
          <span className="font-['Space_Mono'] text-xs font-bold tracking-widest uppercase">
            COORDINATOR ACCESS
          </span>
        </div>

        <h1 className="font-['Anton'] text-4xl text-white uppercase tracking-wider mb-2">
          AUTHENTICATE
        </h1>
        <p className="font-['Courier_Prime'] text-sm text-[#8e9192] mb-6">
          MISSION CONTROL IS COORDINATOR-ONLY. ENTER THE EVENT ADMIN CODE — the
          same one that opens the hunt&apos;s admin board.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="ENTER KEY CODE"
            autoFocus
            autoComplete="off"
            className="w-full bg-[#141313] border-2 border-[#8e9192] focus:border-[#00fbfb] text-white font-['Space_Mono'] p-3 outline-none uppercase font-bold text-lg"
          />

          {error && (
            <div className="p-3 border border-[#ffb4ab] bg-[#93000a]/20 text-[#ffb4ab] font-['Space_Mono'] text-xs uppercase">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || code.trim() === ""}
            className="w-full py-3 border-2 border-white bg-transparent text-white font-['Anton'] text-xl uppercase tracking-wider hover:bg-white hover:text-[#141313] transition-all disabled:opacity-50"
          >
            {busy ? "VERIFYING..." : "ACCESS DASHBOARD"}
          </button>
        </form>

        <a
          href="/dashboard"
          className="mt-6 block text-center font-['Space_Mono'] text-xs text-[#8e9192] hover:text-[#00fbfb] hover:underline"
        >
          [ ← BACK TO HUNT BOARD ]
        </a>
      </div>
    </div>
  );
}
