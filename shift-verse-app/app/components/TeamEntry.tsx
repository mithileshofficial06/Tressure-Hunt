'use client';

import React, { useState, useCallback } from 'react';
import { MAX_TEAM, MIN_TEAM, isValidTeamNumber } from '@/lib/teamRange';

interface TeamEntryProps {
  onTeamSelect: (teamNumber: number) => void;
}

/**
 * Team number entry screen — styled as a comic panel
 * Validates input against the shared team range before proceeding.
 *
 * Only reached when a team opens this app directly. Teams arriving from the
 * registration dashboard carry ?team=N and skip straight to the puzzle.
 */
export default function TeamEntry({ onTeamSelect }: TeamEntryProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(() => {
    const num = parseInt(value, 10);
    if (!isValidTeamNumber(num)) {
      setError(`INVALID FREQUENCY — ENTER ${MIN_TEAM} THROUGH ${MAX_TEAM}`);
      return;
    }
    setError('');
    onTeamSelect(num);
  }, [value, onTeamSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="team-entry fade-in">
      <div style={{ width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src="/identify-dimension.png"
          alt="Identify Your Dimension"
          style={{
            maxWidth: 'min(380px, 80vw)',
            height: 'auto',
            display: 'block',
            margin: '0 auto 0.5rem',
          }}
        />

        <div className="torn-divider" style={{ maxWidth: '380px', margin: '0.5rem auto' }} />

        <div className="team-entry__input-wrap" style={{ justifyContent: 'center', margin: '1.5rem 0' }}>
          <span className="team-entry__hash" style={{ color: 'var(--glitch-yellow)' }}>#</span>
          <input
            id="team-number-input"
            type="number"
            className="team-entry__input"
            placeholder="??"
            min={MIN_TEAM}
            max={MAX_TEAM}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && <p className="team-entry__error">{error}</p>}

        <button
          id="lock-in-btn"
          className="btn-portal"
          onClick={handleSubmit}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginTop: '1.5rem',
            transition: 'transform 0.15s',
          }}
        >
          <img
            src="/lock-in-button.png"
            alt="Lock In"
            style={{
              maxWidth: 'min(280px, 60vw)',
              height: 'auto',
              display: 'block',
              margin: '0 auto',
              filter: 'drop-shadow(0 4px 12px rgba(255, 225, 77, 0.3))',
            }}
          />
        </button>
      </div>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        letterSpacing: '0.2em',
        color: 'var(--glitch-yellow)',
        opacity: 0.5,
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        {MAX_TEAM} dimensions detected // select yours to begin decryption
      </p>
    </div>
  );
}
