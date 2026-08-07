"use client";

import { useEffect, useState } from "react";

/**
 * Back-to-hunt for Blueprint Recovery.
 *
 * DELIBERATELY SMALLER THAN THE OTHER ROUNDS' FOOTERS, and there is no "Finish
 * round" button. The other four rounds end when a team submits the right
 * answer, so a Finish button gives them somewhere to bank it. This one ends the
 * same way — `/api/blueprint/checkpoint` stamps `hunt-blueprint` the moment the
 * access code verifies — but the round then shows its own SECTOR SEALED screen,
 * which IS the ending. A second "finish" control next to it would be a button
 * that does nothing except imply the round was not already over.
 *
 * So this is one link out, pinned where it cannot be covered by the round's
 * full-screen scanline overlays, plus a quiet confirmation once the round is
 * stamped so a team can see the hunt board agrees with the screen.
 *
 * It is an `<a>`, not a `<Link>` — a full page load, so this round's stylesheet
 * does not follow the team back to the board.
 */
export default function BlueprintFooter({ solved }: { solved: boolean }) {
  // Rendered only after mount so the fixed bar cannot end up in the server HTML
  // ahead of the round's own `initializing` screen and flash over it.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

  return (
    <div className="bp-exit">
      <a href="/dashboard" className="bp-exit__link">
        ← BACK TO HUNT
      </a>
      {solved && <span className="bp-exit__done">SECTOR SEALED · RECORDED ON YOUR BOARD</span>}
    </div>
  );
}
