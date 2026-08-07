import { NextRequest, NextResponse } from 'next/server';
import { findTeam } from '@/lib/db';
import { isValidTeamNumber, MAX_TEAM, MIN_TEAM } from '@/lib/teamRange';

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
