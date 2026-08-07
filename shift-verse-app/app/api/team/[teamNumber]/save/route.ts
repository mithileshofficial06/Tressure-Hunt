import { NextRequest, NextResponse } from 'next/server';
import { findTeam, updateTeam } from '@/lib/db';
import { isValidTeamNumber, MAX_TEAM, MIN_TEAM } from '@/lib/teamRange';

/**
 * POST /api/team/[teamNumber]/save
 * 
 * Persists per-letter guess values so progress survives a refresh.
 * Each team's state is fully isolated.
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
    const { perLetterGuesses } = body;

    if (!Array.isArray(perLetterGuesses)) {
      return NextResponse.json(
        { error: 'perLetterGuesses must be an array of numbers.' },
        { status: 400 }
      );
    }

    // Validate each guess is a number between 1 and 100
    const validGuesses = perLetterGuesses.every(
      (g: unknown) => typeof g === 'number' && g >= 1 && g <= 100
    );

    if (!validGuesses) {
      return NextResponse.json(
        { error: 'Each guess must be a number between 1 and 100.' },
        { status: 400 }
      );
    }

    const result = await updateTeam(teamNumber, { perLetterGuesses });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Team not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Error saving progress:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
