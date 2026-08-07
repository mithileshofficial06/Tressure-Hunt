# Treasure Hunt — Team Dashboard

Registration gate and round board for the XPLORE'26 treasure
hunt. A team claims a number exclusively, registers its roster, and lands on the
board of five rounds — each of which records a timestamp when cleared.

```
/                    Number + 3–4 member names  ──register──►  /dashboard
                     (live roster grid)                         (5 round tiles,
                                                                 mark complete,
                                                                 running clock)

                     ADMIN_CODE in the same box ──────────────►  /admin
                                                                 (every team,
                                                                  every stamp,
                                                                  overrides, CSV)
```

## Run it

```bash
npm install
cp .env.example .env.local     # fill in MONGODB_URI + SESSION_SECRET
npm run dev                    # http://localhost:3000
```

The app **boots without `.env.local`**. The entry screen renders fully styled
and shows a yellow "Database not configured" panel with the Claim button
disabled, so you can work on the look before credentials exist. Nothing is read
at build time.

| Variable | Required | What |
|---|---|---|
| `MONGODB_URI` | yes | Atlas or local connection string |
| `MONGODB_DB` | no | Database name, default `xplore26` |
| `SESSION_SECRET` | yes in prod | Signs the team cookie. In dev a random per-process key is used if absent (restarting logs everyone out) |
| `ADMIN_CODE` | no | Typed into the team-number box to open `/admin`. Default `0904`. **Never** rename to `NEXT_PUBLIC_*` |
| `MAX_TEAMS` | no | Highest claimable number, default 60 |

## How "no two teams share a number" is enforced

**A unique index, not a lookup.** `teams.teamNumber` carries
`{ unique: true }`, created on first connect. `registerTeam()` just inserts
and catches Mongo error **11000**:

- Two phones tapping CLAIM on 14 in the same instant → Mongo orders the two
  inserts, the second fails, exactly one team gets the number.
- The "check first, then insert" version passes both, because both reads happen
  before either write. With sixty teams registering in the same two minutes,
  that race is the expected case, not a rare one.

Verified end-to-end: 12 simultaneous POSTs for the same number returned **one
200 and eleven 409s**, with **one** document in the collection afterwards.

The roster grid on the entry screen is **advisory** — it can be a second stale,
and a number that displays as free may still come back "already in play". The
form treats that as a normal outcome: it clears the field, refreshes the grid,
and asks again.

## Timestamps and the consolidated finish

Every solve writes one row to `hunt_progress` — `{ teamNumber, challengeSlug,
solvedAt, markedBy }`, unique on `(teamNumber, challengeSlug)`. Two rules make
the times trustworthy:

- **The first stamp wins.** Re-marking a solved round is a no-op (`$setOnInsert`
  on `solvedAt`), so a team tapping the button again at 6pm cannot rewrite its
  own finish time and silently reorder the leaderboard.
- **Completion is derived, never incremented.** After every mark *and* every
  un-mark, `recomputeCompletion()` rebuilds `teams.completedAt` from the rows:
  five solves → `completedAt` = the **latest** `solvedAt`, `durationMs` =
  `completedAt − registeredAt`. Fewer than five → both back to `null`. That is
  what lets an admin un-mark round 3 and see the team correctly drop off the
  finished list, which a counter-based version would never do.

Teams can only move forward. **Un-marking is admin-only** (`/api/admin/progress`)
— a participant who can rewind their own clock is a participant who can rewrite
their own result.

## The admin board

Typing `ADMIN_CODE` into the team-number box opens `/admin`. The code is checked
**server-side only** (`/api/admin/login`); it is never inlined into the client
bundle, so a wrong guess and a fat-fingered team number return the identical
sentence. Wrong guesses are rate-limited to 10/minute per IP.

The board shows every team, its roster, per-round stamps, the consolidated
finish, a fastest-first leaderboard, and a CSV export. Any round cell is
clickable to stamp or un-stamp it; un-marking asks for confirmation first.

Be clear-eyed about the gate: a shared four-digit code typed into a public input
keeps a curious participant out of the coordinator's table. It is not a
password, and it does not record *which* coordinator made a change.

## What the pieces are

| Path | What |
|---|---|
| `src/app/page.tsx` | Gate. Valid cookie → server-side redirect to `/dashboard`, no form flash |
| `src/app/TeamEntry.tsx` | Number + roster form, live grid, and the admin door |
| `src/app/dashboard/page.tsx` | Reads the cookie, loads the team and its stamped rounds |
| `src/app/dashboard/Dashboard.tsx` | Five round tiles, mark-complete, running clock, finish panel |
| `src/app/admin/page.tsx` | Cookie-gated; bare redirect to `/` when absent |
| `src/app/admin/AdminDashboard.tsx` | Stats, leaderboard, full table, overrides, CSV export |
| `src/app/rounds/grid/` | The 64 Grid round — page (server) + component (client) |
| `src/lib/hunt/grid.ts` | Grid building and anagram checks. **Client-safe** |
| `src/lib/hunt/gridPuzzle.server.ts` | **Server only.** Words, seed, target colour, answer check |
| `src/app/api/team/grid/route.ts` | The only place a right grid answer is recognised |
| `src/lib/db.ts` | Mongo singleton, both unique indexes, `registerTeam`, `recomputeCompletion` |
| `src/lib/session.ts` | HMAC-signed team and admin cookies — no DB read to verify |
| `src/lib/admin.ts` | **Server-only.** The gate code and its constant-time compare |
| `src/lib/members.ts` | The 3-required/4th-optional roster rule, applied on both sides |
| `src/lib/events.ts` | The five rounds. **Edit `href` here to wire a tile to its puzzle** |
| `src/lib/teamNumber.ts` | The range rule, applied on both sides |
| `src/lib/format.ts` | Duration/clock rendering — in the browser, so times are local |
| `scripts/reset-teams.mjs` | `npm run reset:teams` — wipes roster **and** progress, types-DELETE-to-confirm |

## Wiring the tiles to the real puzzles

Three rounds are wired, in **two shapes**, decided by what the round carries:

```
hunt-grid       → /rounds/grid                     (in-app, this repo)
circuit-1       → ${OCTAVIUS_URL}/game?team=N      (../octavius-circuit-app, port 3003)
hunt-shiftverse → ${SHIFTVERSE_URL}/game?team=N    (../shift-verse-app,      port 3001)
```

- **In-app** (`INTERNAL_ROUNDS`) for rounds that are just React on this design
  system. The 64 Grid is one component and some CSS — a fourth server for it
  would mean duplicating Tailwind, the tokens and the theme to gain nothing.
  It also gets **real authentication**: the signed session cookie says which
  team it is, so no query string to edit.
- **Separate app** (`EXTERNAL_ROUNDS`) for rounds carrying their own engine,
  stylesheet and megabytes of media. Those take the team number in the query
  string, which is weaker — anyone can play as any registered team.

Both are resolved by `resolveEventHrefs()` in `src/lib/events.ts`, called from
the dashboard page — server-side, so the base URLs are read at request time and
never baked into the client bundle. The remaining two `href`s are `null`, so
those tiles render as "Not open yet" rather than 404-ing mid-event.

**The wired rounds credit themselves differently, on purpose:**

- **64 Grid** checks the answer server-side (`/api/team/grid`) and stamps
  `hunt-grid` on a correct one.
- **Octavius Circuit** verifies the board server-side, so when a team clears all
  five levels the app stamps `circuit-1` in `hunt_progress` itself and
  recomputes the consolidated finish. Nothing to tick by hand.
- **Shift Verse** has no server-authoritative completion hook wired, so the team
  marks it complete on their own board as usual.

## The 64 Grid

Three equations give a number; that number mod 8 picks one of eight colours;
that colour's eight scattered cells anagram to the answer. Extracted from
SympoApp (`C:\Users\santh\SympoApp\SympoApp\SympoApp` — the copy up to date with
`origin/branch`, not the outer checkout which is 7 commits behind and stuck
mid-merge).

**The answer never reaches the browser.** `src/lib/hunt/gridPuzzle.server.ts`
holds the word list, the seed and the target colour; the client is sent only the
shuffled `{letter, colour}` pairs and the equation text. `/api/team/grid` is the
only place a right answer is recognised, and it takes the team from the session
cookie, never the body.

That split is the whole point. Upstream, `SixtyFourGrid.tsx` used to
`import { CODES } from "@/lib/hunt/codes"` and compare in the browser — and
because bundlers do not tree-shake individual properties off an object read by
member expression, importing CODES for one field shipped **all four reveal codes
in the hunt** into that route's client chunk. The finalised upstream component
fixed it; this port keeps that shape and verifies it (`.next/static` is grepped
for the answer, the word list and the seed after every build).

`src/lib/hunt/grid.test.ts` guards the invariants — chiefly that the equations
actually sum to the colour whose letters spell the answer. If that ever breaks,
the grid still renders perfectly and the puzzle is simply impossible.

Both paths use the same `$setOnInsert` first-stamp-wins rule, so a team that
ticks a round the game also stamps keeps their original time.

To wire another round: add a base-URL env var, add an entry to `EXTERNAL_ROUNDS`
in `src/lib/events.ts`, and have that app accept `?team=N`. Nothing in the
components changes.

> If you change the round list, update `HUNT_SLUGS` in
> `octavius-circuit-app/src/lib/db.ts` too — it holds a copy in order to
> recompute finish times, and a stale copy means a team finishes and the
> dashboard never notices.

`slug` values match SympoApp's challenge slugs (`circuit-1`, `hunt-blueprint`,
`hunt-room`, `hunt-grid`, `hunt-shiftverse`), and progress is read from a
`hunt_progress` collection with the same shape the real graders write — so
pointing `MONGODB_URI` at the live database lights the tiles up with real
solves and no code change here.

## Notes

- Sign out drops the cookie but **does not release the number**. A team that
  clears cookies by accident hasn't lost its identity, and a stray tap can't
  hand its number to someone else. Releasing is a deliberate admin act.
- `npm run reset:teams` clears **both** collections together. Wiping teams while
  leaving `hunt_progress` would strand solve rows on numbers nobody holds, and
  the next team to claim 14 would inherit the last one's cleared rounds.
## The theme — "Concrete"

Brutalist and deliberately plain: paper, ink, one accent, hard 2px rules. No
gradients, glows, rounded corners or tilts; depth is a flat offset shadow,
because that is the one shadow a printer and a projector both reproduce
honestly. It replaced a Spider-Verse comic theme (chromatic aberration,
halftone dots, rotated stickers, noise overlay), all of which is gone.

The whole system is `src/app/globals.css`: `.slab`, `.tag`, `.btn`, `.field`,
`.display`, `.label`, `.data-table`. Type is Archivo Black (headings and
figures), Inter (body), JetBrains Mono (anything that is a readout rather than
a sentence).

**The two oranges are not decorative.** `--accent` (#FF4A00) measures 3.0:1 on
paper — fine for fills, rules and large figures, and a WCAG failure for body
text. `--accent-ink` (#C63A00) measures 4.7:1 and is the only orange allowed on
small text. Accent fills carry *ink* labels (5.6:1), never white (which would
be the same failing 3.0:1).

Every foreground/background pair in the palette clears WCAG AA 4.5:1, including
the tightest one, `--ink-3` on `--paper-2` at 4.55:1 — `--ink-3` was darkened
from #6E6A63 to #6B6760 specifically to clear it. The eight 64-Grid swatches are
puzzle data and unchanged; the component picks ink or white per swatch, worst
case 4.53:1.

Rounds are told apart by **number**, not colour — the per-round accent colours
the old theme used were removed from `HuntEvent`.
