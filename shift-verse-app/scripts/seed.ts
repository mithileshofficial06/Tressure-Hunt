import { caesarEncrypt } from '../lib/cipher';
import { insertManyTeams, deleteAllTeams, closeConnection, type TeamRecord } from '../lib/db';
import { MAX_TEAM, shiftKeyFor } from '../lib/teamRange';

/**
 * Seed script for SHIFT://VERSE
 *
 * Run with: npm run seed
 *
 * Writes to the `shiftverse_teams` collection in the shared Atlas database —
 * NOT `teams`, which belongs to the registration dashboard. See lib/db.ts.
 *
 * The shift key is the team number, except for multiples of 26 (teams 26 and
 * 52), where a shift of 26 is congruent to 0 and would leave the "encrypted"
 * word identical to the answer. See `shiftKeyFor`.
 *
 * perLetterGuesses starts empty — random values are generated on first client load.
 */

const TEAMS: { teamNumber: number; word: string }[] = [
  { teamNumber: 1, word: 'MILESMORALES' },
  { teamNumber: 2, word: 'GWENSTACY' },
  { teamNumber: 3, word: 'MIGUELOHARA' },
  { teamNumber: 4, word: 'HOBIEBROWN' },
  { teamNumber: 5, word: 'BENREILLY' },
  { teamNumber: 6, word: 'PETERBPARKER' },
  { teamNumber: 7, word: 'SCARLETSPIDER' },
  { teamNumber: 8, word: 'SPIDERBYTE' },
  { teamNumber: 9, word: 'SPIDERPUNK' },
  { teamNumber: 10, word: 'SPIDERNOIR' },
  { teamNumber: 11, word: 'SPIDERHAM' },
  { teamNumber: 12, word: 'MAYDAYPARKER' },
  { teamNumber: 13, word: 'MUMBATTAN' },
  { teamNumber: 14, word: 'SPOTDIMENSION' },
  { teamNumber: 15, word: 'OLIVIAOCTAVIUS' },
  { teamNumber: 16, word: 'JEFFERSONDAVIS' },
  { teamNumber: 17, word: 'LEAPOFFAITH' },
  { teamNumber: 18, word: 'SPIDERSOCIETY' },
  { teamNumber: 19, word: 'CANONEVENT' },
  { teamNumber: 20, word: 'DIMENSIONALGLITCH' },
  { teamNumber: 21, word: 'MULTIVERSE' },
  { teamNumber: 22, word: 'COLLIDER' },
  { teamNumber: 23, word: 'DIMENSION' },
  { teamNumber: 24, word: 'MULTIVERSALPORTAL' },
  { teamNumber: 25, word: 'ALCHEMAXLABS' },
  { teamNumber: 26, word: 'GLITCHING' },
  { teamNumber: 27, word: 'WEBOFSECRETS' },
  { teamNumber: 28, word: 'SPIDEYSENSE' },
  { teamNumber: 29, word: 'WALLCRAWLER' },
  { teamNumber: 30, word: 'WEBSHOOTERS' },
  { teamNumber: 31, word: 'WEBWARRIOR' },
  { teamNumber: 32, word: 'BEYONDVERSE' },
  { teamNumber: 33, word: 'ACROSSVERSE' },
  { teamNumber: 34, word: 'INTOTHEVERSE' },
  { teamNumber: 35, word: 'WATCHTHEMORAL' },
  { teamNumber: 36, word: 'CAPTAINSACRIFICE' },
  { teamNumber: 37, word: 'SPIDERSOCIETY' },
  { teamNumber: 38, word: 'REDEMPTION' },
  { teamNumber: 39, word: 'SPOTANOMALY' },
  { teamNumber: 40, word: 'EVERYONECANBEAHERO' },
  // ── Added for teams 41–60, to match the dashboard's 60-team roster ──────
  { teamNumber: 41, word: 'KINGPIN' },
  { teamNumber: 42, word: 'DOCTOROCTOPUS' },
  { teamNumber: 43, word: 'GREENGOBLIN' },
  { teamNumber: 44, word: 'THEPROWLER' },
  { teamNumber: 45, word: 'VENOMSYMBIOTE' },
  { teamNumber: 46, word: 'MYSTERIO' },
  { teamNumber: 47, word: 'SANDMAN' },
  { teamNumber: 48, word: 'ELECTRO' },
  { teamNumber: 49, word: 'CURTCONNORS' },
  { teamNumber: 50, word: 'RHINOSTAMPEDE' },
  { teamNumber: 51, word: 'SILKSPIDER' },
  { teamNumber: 52, word: 'ANYACORAZON' },
  { teamNumber: 53, word: 'JESSICADREW' },
  { teamNumber: 54, word: 'CINDYMOON' },
  { teamNumber: 55, word: 'NUEVAYORK' },
  { teamNumber: 56, word: 'SPIDERVERSE' },
  { teamNumber: 57, word: 'WEBSLINGER' },
  { teamNumber: 58, word: 'ARACHNIDPOWER' },
  { teamNumber: 59, word: 'GREATRESPONSIBILITY' },
  { teamNumber: 60, word: 'THEWEBOFLIFE' },
];

async function seed() {
  // Fail loudly rather than seeding a roster with holes in it — a missing word
  // is a team that gets "not found" mid-event with no way to play.
  const missing: number[] = [];
  for (let n = 1; n <= MAX_TEAM; n++) {
    if (!TEAMS.some((t) => t.teamNumber === n)) missing.push(n);
  }
  if (missing.length > 0) {
    throw new Error(`No word defined for team(s): ${missing.join(', ')}`);
  }

  await deleteAllTeams();
  console.log('Cleared existing shiftverse_teams.');

  const teamDocs: TeamRecord[] = TEAMS.map(({ teamNumber, word }) => {
    const shiftKey = shiftKeyFor(teamNumber);
    const encryptedWord = caesarEncrypt(word, shiftKey);

    // A shift congruent to 0 would print the answer on screen. shiftKeyFor
    // prevents it; this asserts the invariant rather than trusting it.
    if (encryptedWord === word) {
      throw new Error(`Team ${teamNumber}: shift ${shiftKey} leaves "${word}" unencrypted.`);
    }

    console.log(
      `Team ${String(teamNumber).padStart(2, '0')}: "${word}" → shift ${shiftKey} → "${encryptedWord}"`
    );

    return {
      teamNumber,
      plaintextWord: word,
      encryptedWord,
      shiftKey,
      perLetterGuesses: [],
      startTime: 0,
    };
  });

  await insertManyTeams(teamDocs);
  console.log(`\nSeeded ${teamDocs.length} teams into shiftverse_teams.`);
}

seed()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => closeConnection());
