"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import RoundFooter from "../RoundFooter";

/**
 * The Mystery Room, wired into this dashboard.
 *
 * WHY THERE IS A WRAPPER AT ALL. `MysteryRoom.tsx` and its eleven siblings are
 * upstream files, copied in essentially unmodified so that a future pull from
 * SympoApp is a copy rather than a merge. Everything this app needs and that
 * app does not — the session-backed submit, the solved banner, the footer —
 * lives here instead of being threaded through 7,000 lines of scene code.
 *
 * SSR IS OFF, AND NOT NEGOTIABLE. react-three-fiber's `Canvas` builds a WebGL
 * context on mount and the scene reaches for `window` on the way up, so
 * rendering it on the server throws. It also has no business in the server
 * bundle: three.js and drei are the heaviest thing in this app by a wide
 * margin, and this keeps them in a chunk that only this route loads.
 */
const MysteryRoom = dynamic(() => import("./MysteryRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[78vh] min-h-[460px] w-full items-center justify-center border-2 border-rule bg-[#06040d]">
      <p className="font-mono text-sm tracking-widest text-paper-white/70">
        ENTERING THE ROOM…
      </p>
    </div>
  ),
});

type Status = "playing" | "saving" | "solved" | "error";

export default function RoomRound({ alreadySolved }: { alreadySolved: boolean }) {
  const [status, setStatus] = useState<Status>(alreadySolved ? "solved" : "playing");
  const [error, setError] = useState<string | null>(null);

  /**
   * The room's completion effect fires on every render once all five sections
   * are open, and React's strict mode double-invokes effects in development.
   * Without this latch a finished room posts its code repeatedly — harmless,
   * because `markRoundSolved` keeps the first stamp, but it is a request per
   * render and it would bury a real failure in noise.
   */
  const sent = useRef(false);

  const handleSolve = useCallback(async (code: string) => {
    if (sent.current) return;
    sent.current = true;

    setStatus("saving");
    setError(null);

    try {
      const res = await fetch("/api/team/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Couldn't save that. Try again.");
        setStatus("error");
        sent.current = false; // let the retry button through
        return;
      }

      if (body.correct) {
        setStatus("solved");
      } else {
        // The room only calls back with its own reveal code, so this means the
        // client and server disagree about what the answer is — a deployment
        // problem, not a player one. Say so rather than blaming the team.
        setError("The server did not accept that code. Fetch a coordinator.");
        setStatus("error");
      }
    } catch {
      setError("Couldn't reach the server — check your connection.");
      setStatus("error");
      sent.current = false;
    }
  }, []);

  return (
    <>
      {status === "solved" && (
        <div className="slab slab-good anim-pop mb-6 p-4">
          <p className="display text-sm text-good">Round complete — stamped on your hunt board</p>
          <p className="mt-1 font-mono text-xs text-ink-2">
            The room stays open behind this. Walking it again changes nothing.
          </p>
        </div>
      )}

      {status === "saving" && (
        <p className="anim-pop mb-6 font-mono text-xs text-ink-2">Saving your solve…</p>
      )}

      {status === "error" && (
        <div className="slab anim-pop mb-6 border-bad p-4">
          <p className="display text-sm text-bad">Couldn&apos;t record the solve</p>
          <p className="mt-1 font-mono text-xs text-ink-2">{error}</p>
          <button
            onClick={() => {
              setStatus("playing");
              setError(null);
            }}
            className="btn mt-3"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="border-2 border-rule">
        {/* `onAnswer` is left off: upstream fires both callbacks with the same
            value, and one POST is enough. */}
        <MysteryRoom onSolve={(code) => void handleSolve(code)} />
      </div>

      <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
        Click the room to look around · WASD to walk · click a section word into the console
      </p>

      {/* Gated on `solved`, which only the server can set. */}
      <RoundFooter slug="hunt-room" title="Mystery Room" solved={status === "solved"} />
    </>
  );
}
