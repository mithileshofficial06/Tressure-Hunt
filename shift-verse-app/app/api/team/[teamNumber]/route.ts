import { NextRequest, NextResponse } from 'next/server';
import { findTeam, updateTeam } from '@/lib/db';
import { isValidTeamNumber, MAX_TEAM, MIN_TEAM } from '@/lib/teamRange';

/**
 * GET /api/team/[teamNumber]
 * 
 * Returns ONLY the encrypted word and per-letter guesses for a team.
 * NEVER returns shiftKey or plaintextWord — those stay server-side only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamNumber: string }> }
) {
  try {
    const { teamNumber: teamNumStr } = await params;
    const teamNumber = parseInt(teamNumStr, 10);

    // Validate team number
    if (!isValidTeamNumber(teamNumber)) {
      return NextResponse.json(
        { error: `Invalid team number. Must be between ${MIN_TEAM} and ${MAX_TEAM}.` },
        { status: 400 }
      );
    }

    const team = await findTeam(teamNumber);

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found. Please run the seed script first (npm run seed).' },
        { status: 404 }
      );
    }

    // Stamp startTime on first access — never overwrite once set
    const startTime = (team.startTime && team.startTime > 0)
      ? team.startTime
      : Date.now();

    // Always generate fresh random starting values on each visit
    const perLetterGuesses = Array.from(
      { length: team.encryptedWord.length },
      () => Math.floor(Math.random() * 26) + 1
    );

    // Save fresh guesses and (possibly first) startTime
    await updateTeam(teamNumber, { perLetterGuesses, startTime });

    // SECURITY: Only return encrypted word, guesses, and startTime — never shiftKey or plaintextWord
    return NextResponse.json({
      teamNumber: team.teamNumber,
      encryptedWord: team.encryptedWord,
      perLetterGuesses,
      startTime,
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
