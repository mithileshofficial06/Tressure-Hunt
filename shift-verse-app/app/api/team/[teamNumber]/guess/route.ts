import { NextRequest, NextResponse } from 'next/server';
import { findTeam } from '@/lib/db';
import { isValidTeamNumber, MAX_TEAM, MIN_TEAM } from '@/lib/teamRange';
import { stampRoundSolved } from '@/lib/hunt';

/**
 * POST /api/team/[teamNumber]/guess
 * 
 * Receives a guessed word, checks it against the real plaintext
 * server-side. Returns ONLY { correct: boolean }.
 * No partial feedback, no hints, no shift key exposure.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamNumber: string }> }
) {
  try {
    const { teamNumber: teamNumStr } = await params;
    const teamNumber = parseInt(teamNumStr, 10);

    if (!isValidTeamNumber(teamNumber)) {
      return NextResponse.json(
        { error: `Invalid team number. Must be between ${MIN_TEAM} and ${MAX_TEAM}.` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { guessedWord } = body;

    if (!guessedWord || typeof guessedWord !== 'string') {
      return NextResponse.json(
        { error: 'guessedWord is required and must be a string.' },
        { status: 400 }
      );
    }

    const team = await findTeam(teamNumber);

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found.' },
        { status: 404 }
      );
    }

    // Server-side comparison — the plaintext never leaves this function unless correct
    const correct = guessedWord.toUpperCase() === team.plaintextWord.toUpperCase();

    if (correct) {
      // Credit the round on the hunt board. Previously this route verified the
      // answer and then told nobody, so a team had to go back and tick the
      // round by hand — and the Finish button below has no way to know the
      // round is done unless the solve is recorded.
      //
      // Stamping is idempotent and first-write-wins, so replaying a solved
      // puzzle cannot move the team's clock.
      try {
        await stampRoundSolved(teamNumber);
      } catch (err) {
        // A correct answer stays correct even if the write fails. Log it and
        // let the team see their win rather than showing a false negative;
        // a coordinator can stamp it from the admin board.
        console.error('[guess] failed to stamp hunt progress', err);
      }

      return NextResponse.json({ correct, decryptedWord: team.plaintextWord });
    }

    return NextResponse.json({ correct });
  } catch (error) {
    console.error('Error checking guess:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
