'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Logo from './Logo';
import PuzzleBoard from './PuzzleBoard';
import RoundFooter from './RoundFooter';

// Dynamically imported with no SSR — the portal is a three.js canvas and builds
// a WebGL context on mount, which cannot happen on the server.
const PortalBackground = dynamic(() => import('./PortalBackground'), {
  ssr: false,
});

/**
 * SHIFT://VERSE, inside the dashboard.
 *
 * THE ENTRY SCREEN IS GONE, AND THAT IS THE POINT. This used to be a state
 * machine — ENTRY → PUZZLE — because the app ran on its own origin with no
 * session: a team either arrived with `?team=N` in the URL or typed their
 * number into an "identify your dimension" screen. Both were ways of ASKING the
 * browser who it was, and both could be answered with somebody else's number.
 *
 * The round runs on the dashboard's origin now, so the signed session cookie
 * already knows. `teamNumber` is resolved on the server in page.tsx and handed
 * down; there is no screen to type a number into and no query string to edit,
 * so `TeamEntry.tsx` and the "change dimension" path were deleted rather than
 * left lying around as a second way in.
 */
export default function ShiftVerse({
  teamNumber,
  alreadySolved = false,
}: {
  teamNumber: number;
  alreadySolved?: boolean;
}) {
  return (
    <>
      {/* Animated 3D background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      {/* Content layer above background + overlays */}
      <div className="content-layer">
        <div style={{ marginBottom: '1rem', marginTop: '2rem' }}>
          <Logo />
        </div>

        {/* Back goes to the hunt board — a full page load, so this round's
            stylesheet does not follow the team onto the board. */}
        <PuzzleBoard
          teamNumber={teamNumber}
          onBack={() => {
            window.location.href = '/dashboard';
          }}
        />

        {/* Enabled only for a team that has already cleared this round —
            solving it navigates to the result screen, which carries its own. */}
        <RoundFooter solved={alreadySolved} />
      </div>
    </>
  );
}
