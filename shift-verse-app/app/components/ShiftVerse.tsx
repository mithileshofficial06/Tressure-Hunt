'use client';

import React, { useState, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Logo from './Logo';
import TeamEntry from './TeamEntry';
import PuzzleBoard from './PuzzleBoard';
import { dashboardUrl } from '@/lib/links';

// Dynamically import PortalBackground with no SSR (Three.js requires browser)
const PortalBackground = dynamic(() => import('./PortalBackground'), {
  ssr: false,
});

type AppState = 'ENTRY' | 'PUZZLE';

/**
 * Main orchestrator component for SHIFT://VERSE
 * State machine: ENTRY → PUZZLE (→ navigates to /result on submit)
 *
 * `initialTeam` comes from ?team=N on /game — a team handed over by the
 * registration dashboard starts in PUZZLE, having already identified itself.
 * Opening /game with no team still starts at ENTRY as before.
 */
export default function ShiftVerse({ initialTeam = null }: { initialTeam?: number | null }) {
  const [appState, setAppState] = useState<AppState>(initialTeam !== null ? 'PUZZLE' : 'ENTRY');
  const [teamNumber, setTeamNumber] = useState<number | null>(initialTeam);

  const handleTeamSelect = useCallback((num: number) => {
    setTeamNumber(num);
    setAppState('PUZZLE');
  }, []);

  const handleBack = useCallback(() => {
    // A team that arrived from the dashboard goes back to the dashboard. Only
    // someone who typed a number here gets to type a different one — otherwise
    // "change dimension" is a one-tap route into another team's puzzle.
    if (initialTeam !== null) {
      window.location.href = dashboardUrl();
      return;
    }
    setTeamNumber(null);
    setAppState('ENTRY');
  }, [initialTeam]);

  return (
    <>
      {/* Animated 3D background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      {/* Content layer above background + overlays */}
      <div className="content-layer">
        {/* Logo — always visible */}
        <div style={{ marginBottom: appState === 'ENTRY' ? '2rem' : '1rem', marginTop: '2rem' }}>
          <Logo />
        </div>

        {/* State-dependent content */}
        {appState === 'ENTRY' && (
          <TeamEntry onTeamSelect={handleTeamSelect} />
        )}

        {appState === 'PUZZLE' && teamNumber !== null && (
          <PuzzleBoard teamNumber={teamNumber} onBack={handleBack} />
        )}
      </div>
    </>
  );
}
