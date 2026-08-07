'use client';
import React, { useState, useEffect } from 'react';
import {
  fetchDashboardTeams,
  revealLocation,
  resetTeam,
  overrideTeamComplete,
} from '../teamService';
import { VARIANT_COLORS } from '../constants';

/**
 * Screen 09: Coordinator Dashboard (09-coordinator-dashboard)
 * GATED BY THE ROUTE, NOT BY THIS COMPONENT. The page that renders it checks
 * the dashboard's admin cookie server-side and 404s otherwise, so there is no
 * password form here and no token in sessionStorage.
 *
 * What this replaces: a client-side gate that called a `validate-coordinator`
 * Edge Function and, if that was unreachable, compared the typed password
 * against `process.env.NEXT_PUBLIC_COORDINATOR_PASSWORD || 'kenrich@202'` — a
 * literal in the client bundle. Anyone who opened the page could read the
 * fallback and let themselves in.
 *
 * Live table, by polling:
 *   - "Reveal" action when status = 'awaiting_reveal'
 *   - Amber NEEDS_REVEAL / Red STUCK tags for teams > 8 min
 *   - Reset action (resets status to 'not_started' & clears all counters)
 *   - Override to complete fallback
 */
export default function CoordinatorDashboard() {
  /* No auth state: the route already proved this is a coordinator. */

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  /* The `sessionStorage.coord_token` restore effect and `handleAuthSubmit` were
     both here. Authorisation is the admin cookie now — HttpOnly, so there is
     nothing for this component to read or remember. */

  // Fetch teams and poll
  useEffect(() => {
    async function loadData() {
      const { data } = await fetchDashboardTeams();
      setTeams(data || []);
      setLoading(false);
    }

    loadData();
    const interval = setInterval(loadData, 3000);

    /* Upstream this also opened a Supabase realtime channel on `teams`. There
       is no realtime here, so the 3s poll above is the whole mechanism — which
       is fine for a board a coordinator watches: sixty rows, one reader. */
    return () => clearInterval(interval);
  }, []);

  // Handler for Reveal button click
  async function handleReveal(teamNumber) {
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'reveal' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.teamNumber === teamNumber
          ? { ...t, status: 'checkpoint_a_done', checkpointATime: new Date().toISOString() }
          : t
      )
    );

    await revealLocation(teamNumber);
    const { data } = await fetchDashboardTeams();
    if (data) setTeams(data);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  const [confirmResetTeam, setConfirmResetTeam] = useState(null);
  const [confirmOverrideTeam, setConfirmOverrideTeam] = useState(null);

  // Handler for Reset button click
  async function handleReset(teamNumber) {
    if (confirmResetTeam !== teamNumber) {
      setConfirmResetTeam(teamNumber);
      setTimeout(() => {
        setConfirmResetTeam((curr) => (curr === teamNumber ? null : curr));
      }, 4000);
      return;
    }

    setConfirmResetTeam(null);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'reset' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.teamNumber === teamNumber
          ? { ...t, status: 'not_started', startTime: null, checkpointATime: null, completeTime: null, wrongAttemptsB: 0 }
          : t
      )
    );

    const { data: resData } = await resetTeam(teamNumber);
    const { data } = await fetchDashboardTeams();
    if (data && data.length > 0) {
      setTeams(data);
    } else if (resData) {
      setTeams((prev) => prev.map((t) => (t.teamNumber === teamNumber ? { ...t, ...resData } : t)));
    }
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  // Handler for Override to complete
  async function handleOverride(teamNumber) {
    if (confirmOverrideTeam !== teamNumber) {
      setConfirmOverrideTeam(teamNumber);
      setTimeout(() => {
        setConfirmOverrideTeam((curr) => (curr === teamNumber ? null : curr));
      }, 4000);
      return;
    }

    setConfirmOverrideTeam(null);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'override' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.teamNumber === teamNumber
          ? { ...t, status: 'complete', completeTime: new Date().toISOString() }
          : t
      )
    );

    const { data: resData } = await overrideTeamComplete(teamNumber);
    const { data } = await fetchDashboardTeams();
    if (data && data.length > 0) {
      setTeams(data);
    } else if (resData) {
      setTeams((prev) => prev.map((t) => (t.teamNumber === teamNumber ? { ...t, ...resData } : t)));
    }
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  // Helper to format timestamps
  function formatTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Helper to calculate duration
  function formatDuration(startTime, completeTime) {
    if (!startTime || !completeTime) return '—';
    const start = new Date(startTime).getTime();
    const end = new Date(completeTime).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }

  // Check if team is stuck or needs reveal past 8 minutes
  function getVisualFlag(team) {
    if (!team.startTime) return null;
    const now = Date.now();
    const startTime = new Date(team.startTime).getTime();
    const elapsedMins = (now - startTime) / (1000 * 60);

    if (team.status === 'awaiting_reveal' && elapsedMins >= 8) {
      return <span className="px-2 py-1 bg-[#ffb300]/20 text-[#ffb300] border border-[#ffb300] font-['Space_Mono'] text-xs font-bold uppercase animate-pulse">NEEDS_REVEAL</span>;
    }
    if (team.status === 'in_progress' && elapsedMins >= 8) {
      return <span className="px-2 py-1 bg-[#93000a]/30 text-[#ffb4ab] border border-[#ffb4ab] font-['Space_Mono'] text-xs font-bold uppercase animate-pulse">STUCK</span>;
    }
    return null;
  }

  /* THE PASSWORD GATE SCREEN WAS HERE (~55 lines).

     It asked for a "COORDINATOR AUTHORIZATION KEY" and validated it in the
     browser: an Edge Function call first, then — if that was unreachable for
     any of six string-matched reasons — a comparison against
     `process.env.NEXT_PUBLIC_COORDINATOR_PASSWORD || 'kenrich@202'`, a literal
     compiled into the client bundle. The accepted password was then stored in
     `sessionStorage.coord_token` and posted back as the authorisation for
     every reveal/reset/override.

     All of it is replaced by the route checking the dashboard's admin cookie
     server-side. See `rounds/blueprint/coordinator/page.tsx`. */

  // Dashboard Main Screen
  return (
    <div className="min-h-screen bg-[#141313] text-[#e5e2e1] font-['Courier_Prime'] flex flex-col justify-between relative">
      <div className="fixed inset-0 scanlines pointer-events-none opacity-60 z-50"></div>
      <div className="fixed inset-0 noise pointer-events-none opacity-10 z-40"></div>

      {/* Header */}
      <header className="fixed top-0 w-full z-40 flex justify-between items-center px-6 py-4 bg-[#141313]/90 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="font-['Anton'] text-2xl text-[#ffffff] uppercase tracking-tighter italic">
            BLUEPRINT RECOVERY
          </span>
          <span className="font-['Space_Mono'] text-xs text-[#00fbfb] bg-[#00fbfb]/10 border border-[#00fbfb] px-2 py-0.5 uppercase">
            COORDINATOR DASHBOARD
          </span>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem('coord_token');
            setAuthToken('');
          }}
          className="font-['Space_Mono'] text-xs text-[#ffb4ab] hover:underline"
        >
          [ LOGOUT ]
        </button>
      </header>

      {/* Main Table */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-24 pb-16 relative z-10">
        <div className="mb-6 flex justify-between items-end border-b-2 border-[#444748] pb-4">
          <div>
            <h1 className="font-['Anton'] text-4xl text-[#ffffff] uppercase tracking-widest">
              MISSION CONTROL // LIVE FEED
            </h1>
            <p className="font-['Space_Mono'] text-xs text-[#8e9192] mt-1">
              MONITORING TEAMS: {teams.length} | POLLED EVERY 3s
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0e0e0e] border-2 border-[#444748] overflow-x-auto shadow-2xl">
          <table className="w-full text-left border-collapse font-['Space_Mono'] text-xs">
            <thead>
              <tr className="border-b-2 border-[#444748] bg-[#201f1f] text-[#ffffff] uppercase">
                <th className="p-3">TEAM #</th>
                <th className="p-3">SECTOR / COLOR</th>
                <th className="p-3">STATUS</th>
                <th className="p-3">START</th>
                <th className="p-3">CHECKPOINT A</th>
                <th className="p-3">COMPLETE</th>
                <th className="p-3">DURATION</th>
                <th className="p-3">WRONG B</th>
                <th className="p-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-[#8e9192]">
                    LOADING LIVE TEAM DATA...
                  </td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-[#8e9192]">
                    NO ACTIVE TEAMS REGISTERED YET.
                  </td>
                </tr>
              ) : (
                teams.map((team) => {
                  /* `team.variantNumber` was the Supabase column name; the API
                     returns `variantNumber`. Missed in the first pass, which
                     showed every sector as "— (—)". */
                  const variantInfo = VARIANT_COLORS[team.variantNumber] || {};
                  const flag = getVisualFlag(team);
                  const isBusy = actionLoading[team.teamNumber];

                  return (
                    <tr key={team.teamNumber} className="border-b border-[#353434] hover:bg-[#201f1f] transition-colors">
                      <td className="p-3 font-bold text-[#ffffff] text-sm">#{team.teamNumber}</td>
                      <td className="p-3 font-bold" style={{ color: variantInfo.color?.toLowerCase() === 'grey' ? '#a0a0a0' : variantInfo.color?.toLowerCase() }}>
                        {variantInfo.sectorName || '—'} ({variantInfo.color || '—'})
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 uppercase text-[10px] font-bold border ${
                          team.status === 'complete'
                            ? 'bg-[#00fbfb]/10 text-[#00fbfb] border-[#00fbfb]'
                            : team.status === 'checkpoint_a_done'
                            ? 'bg-[#00dddd]/10 text-[#00dddd] border-[#00dddd]'
                            : team.status === 'awaiting_reveal'
                            ? 'bg-[#ffb300]/20 text-[#ffb300] border-[#ffb300]'
                            : 'bg-[#2a2a2a] text-[#8e9192] border-[#444748]'
                        }`}>
                          {team.status}
                        </span>
                        {flag && <span className="ml-2">{flag}</span>}
                      </td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.startTime)}</td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.checkpointATime)}</td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.completeTime)}</td>
                      <td className="p-3 text-[#00fbfb] font-bold">{formatDuration(team.startTime, team.completeTime)}</td>
                      <td className="p-3 text-[#ffb4ab] font-bold">{team.wrongAttemptsB || 0}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {team.status === 'awaiting_reveal' && (
                            <button
                              type="button"
                              onClick={() => handleReveal(team.teamNumber)}
                              disabled={isBusy}
                              className="px-3 py-1 bg-[#00fbfb] text-[#141313] font-['Anton'] text-sm uppercase hover:bg-[#ffffff] transition-colors"
                            >
                              {isBusy === 'reveal' ? 'REVEALING...' : 'REVEAL'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleReset(team.teamNumber)}
                            disabled={isBusy}
                            className={`px-2 py-1 border transition-colors uppercase text-[10px] ${
                              confirmResetTeam === team.teamNumber
                                ? 'bg-[#93000a] text-[#ffffff] border-[#ffb4ab] font-bold animate-pulse'
                                : 'border-[#8e9192] text-[#8e9192] hover:border-[#ffb4ab] hover:text-[#ffb4ab]'
                            }`}
                          >
                            {isBusy === 'reset'
                              ? 'RESETTING...'
                              : confirmResetTeam === team.teamNumber
                              ? 'SURE RESET?'
                              : 'RESET'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOverride(team.teamNumber)}
                            disabled={isBusy}
                            className={`px-2 py-1 border transition-colors uppercase text-[10px] ${
                              confirmOverrideTeam === team.teamNumber
                                ? 'bg-[#00fbfb]/20 text-[#00fbfb] border-[#00fbfb] font-bold animate-pulse'
                                : 'border-[#444748] text-[#8e9192] hover:border-[#00fbfb] hover:text-[#00fbfb]'
                            }`}
                          >
                            {isBusy === 'override'
                              ? 'OVERRIDING...'
                              : confirmOverrideTeam === team.teamNumber
                              ? 'SURE OVERRIDE?'
                              : 'OVERRIDE'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-40 px-6 py-2 flex justify-between items-center bg-[#141313] border-t-2 border-[#ffffff]/30 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // COORDINATOR SYSTEM</div>
        <div className="text-[#00fbfb]">AUTHENTICATED SESSION</div>
      </footer>
    </div>
  );
}
