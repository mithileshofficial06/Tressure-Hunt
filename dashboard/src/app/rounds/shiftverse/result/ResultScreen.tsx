'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Logo from '../Logo';
import RoundFooter from '../RoundFooter';


const PortalBackground = dynamic(() => import('../PortalBackground'), {
  ssr: false,
});

/**
 * Results screen content — reads search params for team number and success/failure
 */
function ResultContent({ teamNumber }: { teamNumber: number }) {
  const searchParams = useSearchParams();
  const router = useRouter();


  const success = searchParams.get('success') === 'true';
  const decryptedWord = searchParams.get('word') || '';

  // A team that solved this round needs to go back to the hunt board to mark it
  // complete, so "return to nexus" means the dashboard — not this app's landing
  // page, which would strand them one round deep with no way back.
  const goHome = () =>
    window.location.assign('/dashboard');

  return (
    <>
      {/* Animated background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      {/*
        ONE CENTRED COLUMN, IN ORDER, INSIDE A SCROLLER.

        Everything below used to be a direct child of the fixed, full-height
        `.result-screen`, with the logo taken out of flow on top of it. Nothing
        could scroll, so on a laptop the RETURN TO NEXUS button and the
        Back/Finish row fell off the bottom of the screen, and on a short window
        the logo landed on the title. `__inner` is the column; the layer around
        it scrolls. See the note in shiftverse.css.
      */}
      <div
        className={`result-screen ${success ? 'result-screen--success' : 'result-screen--failure'}`}
      >
        <div className="result-screen__inner">
          <div className="result-screen__logo">
            <Logo />
          </div>

          {/* Main result message */}
          {success ? (
            <>
              <div className="result-screen__head">
                <h1 className="result-screen__title">
                  DIMENSIONAL LOCK<br />ACQUIRED
                </h1>
                <p className="result-screen__subtitle">
                  Signal decoded // Your dimension is stable
                </p>
              </div>

              {/* Decrypted word reveal */}
              {decryptedWord && (
                <div className="result-screen__reveal">
                  <p className="result-screen__reveal-label">◈ DECRYPTED SIGNAL ◈</p>
                  <p className="result-screen__reveal-word">{decryptedWord}</p>
                </div>
              )}
            </>
          ) : (
            <div className="result-screen__head">
              <h1 className="result-screen__title">
                SIGNAL LOST //<br />RECALIBRATE
              </h1>
              <p className="result-screen__subtitle">
                Dimensional frequency mismatch detected
              </p>
            </div>
          )}

          <p className="result-screen__team">DIMENSION #{teamNumber}</p>

          {/* Action buttons */}
          <div className="result-screen__actions">
            {success ? (
              <button
                id="result-home-btn"
                className="btn-comic btn-comic--cyan"
                onClick={goHome}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <img
                  src="/return-to-nexus.png"
                  alt="Return to Nexus"
                  style={{
                    maxWidth: 'min(300px, 70vw)',
                    height: 'auto',
                    display: 'block',
                    filter: 'drop-shadow(0 4px 12px rgba(255, 225, 77, 0.3))',
                  }}
                />
              </button>
            ) : (
              <button
                id="result-retry-btn"
                className="btn-comic"
                onClick={() => router.push('/rounds/shiftverse')}
              >
                RECALIBRATE SIGNAL
              </button>
            )}
          </div>

          {/* Last, because it is the secondary route out — the big button above
              is the one a team is looking for. The round was already stamped
              server-side by the guess route, so the dialogue behind Finish reads
              real data regardless of what the query string claims: a forged
              ?success=true just shows the team their actual, unchanged score. */}
          {success && <RoundFooter solved />}
        </div>
      </div>
    </>
  );
}

/**
 * Result page — full-screen success/failure state
 * Wraps ResultContent in Suspense for useSearchParams
 */
export default function ResultScreen({ teamNumber }: { teamNumber: number }) {
  return (
    <Suspense
      fallback={
        <div className="result-screen result-screen--failure">
          <div className="result-screen__inner">
            <p className="dimensional-rift">STABILIZING DIMENSION...</p>
          </div>
        </div>
      }
    >
      <ResultContent teamNumber={teamNumber} />
    </Suspense>
  );
}
