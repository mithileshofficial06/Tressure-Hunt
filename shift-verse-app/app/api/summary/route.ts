import { NextResponse } from 'next/server';
import { teamSummary } from '@/lib/hunt';
import { isValidTeamNumber } from '@/lib/teamRange';

/**
 * GET /api/summary?team=N — points and timings for the finish dialogue.
 *
 * Read-only, and it returns nothing a team could not already see on their own
 * hunt board: how many rounds they have cleared and when. No puzzle content,
 * no answers.
 *
 * Takes the team from the query string because this app has no session of its
 * own — the same weakness the rest of this app's endpoints have, and the reason
 * the round is only safe in a supervised room. See the README.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const team = Number(new URL(req.url).searchParams.get('team'));
  if (!isValidTeamNumber(team)) {
    return NextResponse.json({ error: 'Invalid team number.' }, { status: 400 });
  }

  try {
    const summary = await teamSummary(team);
    if (!summary) {
      return NextResponse.json({ error: 'That team is not registered.' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[summary] failed', err);
    return NextResponse.json({ error: "Couldn't read progress." }, { status: 502 });
  }
}
