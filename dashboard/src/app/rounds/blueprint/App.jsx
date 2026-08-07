'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTeamState, startRound } from './teamService';
import GlitchTransition from './GlitchTransition';

import InitializingScreen from './pages/InitializingScreen';
import HeroPage from './pages/HeroPage';
import MissionBriefing from './pages/MissionBriefing';
import EvidenceSecured from './pages/EvidenceSecured';
import VenueReveal from './pages/VenueReveal';
import FinalAccessCode from './pages/FinalAccessCode';
import SectorSealed from './pages/SectorSealed';

/**
 * Blueprint Recovery — the round's state machine.
 *
 * ── TWO THINGS CHANGED IN THE PORT, AND BOTH ARE THE POINT ────────────────
 *
 * 1. NO TEAM IDENTIFICATION SCREEN, AND NO localStorage.
 *    The original asked the team to type its number, then remembered it in
 *    `localStorage.blueprint_team_number` — so identity was a string in the
 *    browser that any team could set to any value, and clearing site data
 *    stranded a team mid-round. Identity is the signed session cookie now.
 *    `TeamIdentification.jsx` was deleted rather than left as a second way in.
 *
 * 2. POLLING INSTEAD OF REALTIME.
 *    Supabase pushed status changes down a `postgres_changes` channel, which is
 *    how a coordinator's reveal reached a waiting team's screen. Mongo has no
 *    equivalent here, so the round polls `/api/blueprint/state`. It only polls
 *    while it is WAITING ON A HUMAN (`awaiting_reveal`) or parked on the
 *    briefing — the states where someone else can move you — and stops
 *    otherwise, so sixty idle tabs are not hammering the database all afternoon.
 *
 * THE SERVER'S STATUS DECIDES THE SCREEN. `sessionStorage` still remembers the
 * screen across a refresh, but it can never contradict the server: a team reset
 * by a coordinator lands back at the start on the next poll whatever the tab
 * had stored.
 */

const POLL_MS = 4000;

function statusToScreen(status) {
  switch (status) {
    case 'in_progress':
      return 'mission_briefing';
    case 'awaiting_reveal':
      return 'evidence_secured';
    case 'checkpoint_a_done':
      return 'venue_reveal';
    case 'complete':
      return 'sector_sealed';
    default:
      return null; // not_started — the team has not begun
  }
}

export default function App() {
  const [screen, setScreenState] = useState('initializing');
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const changeScreen = useCallback((next) => {
    setScreenState(next);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('blueprint_current_screen', next);
    }
  }, []);

  /** Pull the server's view and move the screen if it disagrees with ours. */
  const sync = useCallback(
    async ({ initial = false } = {}) => {
      const { data, error: err } = await getTeamState();
      if (err) {
        if (initial) setError(err);
        return null;
      }
      setError(null);
      setTeamData(data);

      const target = statusToScreen(data.status);

      if (initial) {
        if (target === null) {
          // Never started. Show the intro, unless it has already been seen this
          // session — nobody wants the boot sequence five times.
          const seen = sessionStorage.getItem('blueprint_init_shown');
          changeScreen(seen ? 'hero' : 'initializing');
        } else {
          const saved = sessionStorage.getItem('blueprint_current_screen');
          // A stored screen is honoured only if it belongs to the state the
          // server reports. Otherwise the server wins.
          const savedIsValid =
            saved === target ||
            (data.status === 'checkpoint_a_done' &&
              (saved === 'venue_reveal' || saved === 'final_access_code'));
          changeScreen(savedIsValid ? saved : target);
        }
        setLoading(false);
        return data;
      }

      // A later poll. Only move the screen when the SERVER has moved past where
      // the tab is — a coordinator revealing, resetting or overriding.
      if (target === null && screenRef.current !== 'hero') {
        sessionStorage.removeItem('blueprint_current_screen');
        changeScreen('hero'); // they were reset
      } else if (data.status === 'complete' && screenRef.current !== 'sector_sealed') {
        changeScreen('sector_sealed');
      } else if (
        data.status === 'checkpoint_a_done' &&
        screenRef.current === 'evidence_secured'
      ) {
        changeScreen('venue_reveal'); // the reveal landed
      }
      return data;
    },
    [changeScreen]
  );

  useEffect(() => {
    void sync({ initial: true });
  }, [sync]);

  // Poll only while someone else can move us.
  useEffect(() => {
    const waiting = screen === 'evidence_secured' || screen === 'mission_briefing';
    if (!waiting) return;
    const id = setInterval(() => void sync(), POLL_MS);
    return () => clearInterval(id);
  }, [screen, sync]);

  async function handleBegin() {
    const { data, error: err } = await startRound();
    if (err) {
      setError(err);
      return;
    }
    setTeamData(data);
    changeScreen('mission_briefing');
  }

  function handleInitComplete() {
    sessionStorage.setItem('blueprint_init_shown', 'true');
    changeScreen('hero');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e5e2e1] flex items-center justify-center font-['Courier_Prime']">
        <p className="animate-pulse text-[#00fbfb] text-lg font-bold">
          &gt; ESTABLISHING SECURE CONNECTION...
        </p>
      </div>
    );
  }

  if (error && !teamData) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e5e2e1] flex flex-col items-center justify-center gap-4 p-6 text-center font-['Courier_Prime']">
        <p className="text-[#ff3b3b] text-lg font-bold">&gt; CONNECTION FAILED</p>
        <p className="text-sm opacity-70">{error}</p>
        <a href="/dashboard" className="underline text-[#00fbfb]">
          ← Back to hunt
        </a>
      </div>
    );
  }

  function renderCurrentScreen() {
    switch (screen) {
      case 'initializing':
        return <InitializingScreen onComplete={handleInitComplete} />;

      case 'hero':
        return <HeroPage onBeginRecovery={handleBegin} />;

      case 'mission_briefing':
        return (
          <MissionBriefing teamData={teamData} onContinue={() => changeScreen('evidence_secured')} />
        );

      case 'evidence_secured':
        return (
          <EvidenceSecured
            teamData={teamData}
            onRevealUnlocked={(updated) => {
              if (updated) setTeamData(updated);
              changeScreen('venue_reveal');
            }}
          />
        );

      case 'venue_reveal':
        return (
          <VenueReveal teamData={teamData} onProceed={() => changeScreen('final_access_code')} />
        );

      case 'final_access_code':
        return (
          <FinalAccessCode
            teamData={teamData}
            onSuccess={(updated) => {
              if (updated) setTeamData(updated);
              changeScreen('sector_sealed');
            }}
          />
        );

      case 'sector_sealed':
        return <SectorSealed teamData={teamData} />;

      default:
        return <HeroPage onBeginRecovery={handleBegin} />;
    }
  }

  return <GlitchTransition activeKey={screen}>{renderCurrentScreen()}</GlitchTransition>;
}
