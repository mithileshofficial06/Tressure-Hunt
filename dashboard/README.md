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

### "Couldn't reach the database" on a laptop that worked last week

Almost always the NETWORK, not the app. Many campus and home ISP networks block
outbound **port 27017**, which is the only port Atlas listens on. The tell is
that it fails the same way a firewall does — a silent TCP timeout, not a refusal
and not an auth error:

```bash
# Does DNS work but the port not open? Then it is the network.
node -e 'require("dns").promises.resolveSrv("_mongodb._tcp.<cluster>.mongodb.net").then(console.log)'
node -e 'const s=require("net").createConnection({host:"portquiz.net",port:27017,timeout:9000});
         s.on("connect",()=>{console.log("27017 allowed");s.destroy()});
         s.on("timeout",()=>{console.log("27017 BLOCKED by this network");s.destroy()})'
```

`portquiz.net` accepts TCP on every port, so a timeout there is proof the
network is filtering the port rather than anything being wrong with Atlas or the
connection string. Fixes, in order of speed: switch to a phone hotspot, or point
`MONGODB_URI` at a local `mongod`. **This does not affect a Vercel deployment** —
the block is on the office/campus link, not on the datacenter that runs the app.

## Deploying (Vercel)

Four things, and two of them are easy to miss until sixty teams are waiting.

1. **Atlas Network Access → `0.0.0.0/0`.** Serverless functions do not have
   fixed egress IPs, so an allowlist of specific addresses will fail in
   production no matter how right the URI is. The credentials remain the gate.
2. **Set `SESSION_SECRET`** to 32+ random bytes. Unlike the other variables this
   one is a hard failure in production — `session.ts` throws rather than falling
   back to the dev key, deliberately, because a per-process random key would
   sign every team out on each new instance.
3. **Nothing else to deploy.** All five rounds are routes in THIS app, so there
   are no `SHIFTVERSE_URL` / `OCTAVIUS_URL` variables and no second and third
   deployment to keep in sync. Those variables were removed — if you find them
   in an older `.env`, they are dead.
4. **Seed Shift Verse's puzzles** into the same database (`shiftverse_teams`),
   and keep `MAX_TEAMS` at 60 to match the seeded range. Without a seeded row a
   team's board returns 404 with a message naming the seed.

Pool sizing already adapts: on Vercel (`process.env.VERCEL`) each instance takes
a small pool with **no idle floor**, because instances scale out and idle sockets
multiply against an Atlas M0's 500-connection ceiling. On a long-lived
`next start` it takes a generous pool with a few warm sockets instead. See
`clientPromise()` in `src/lib/db.ts`.

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
| `src/app/rounds/room/` | The Mystery Room — page + `RoomRound` wrapper + 13 **upstream** scene files |
| `src/lib/hunt/roomTasks.ts` | The five sections, their clues and codes. **Client-safe by design** |
| `src/lib/hunt/manifest.ts`, `morse.ts` | The four loose case items; morse used by one section |
| `src/lib/hunt/codes.ts` | `ROOM_CODE`. In the bundle on purpose — read the file |
| `src/lib/hunt/roomPuzzle.server.ts` | **Server only.** The room's answer gate — authority, not secrecy |
| `src/app/api/team/room/route.ts` | The only place the room's solve is stamped |
| `src/lib/db.ts` | Mongo singleton, both unique indexes, `registerTeam`, `recomputeCompletion` |
| `src/lib/session.ts` | HMAC-signed team and admin cookies — no DB read to verify |
| `src/lib/admin.ts` | **Server-only.** The gate code and its constant-time compare |
| `src/lib/members.ts` | The 3-required/4th-optional roster rule, applied on both sides |
| `src/lib/events.ts` | The five rounds. **Edit `href` here to wire a tile to its puzzle** |
| `src/lib/teamNumber.ts` | The range rule, applied on both sides |
| `src/lib/format.ts` | Duration/clock rendering — in the browser, so times are local |
| `scripts/reset-teams.mjs` | `npm run reset:teams` — wipes roster **and** progress, types-DELETE-to-confirm |

## Wiring the tiles to the real puzzles

**Everything runs on one port.** Four rounds are ordinary routes in this app:

```
circuit-1       → /rounds/circuit
hunt-room       → /rounds/room
hunt-grid       → /rounds/grid
hunt-shiftverse → /rounds/shiftverse
hunt-blueprint  → null            (physical round — tile is inert by design)
```

### Why there is no longer a second port

Octavius Circuit and Shift Verse used to be **separate Next apps** on ports 3003
and 3001, and the tile linked out with `?team=N` in the query string. Folding
them in removed, in order of how much they mattered:

1. **Team identity was a number in a URL.** Any team could play as any other by
   editing it. The rounds' own APIs could not defend against it — `/api/circuit/submit`
   took `teamNumber` from the POST body and could only check the number existed
   on the roster; a comment there said as much. Every round now reads the signed
   session cookie, so there is nothing to edit.
2. **Three MongoClients against one Atlas cluster** — this app, plus one in
   `shift-verse-app/lib/db.ts` and *another* in its `lib/hunt.ts`. One pool now.
3. **Three copies of the round list, `POINTS_PER_ROUND` and `deriveTimings`**,
   each with a comment begging the reader to keep them in step. A stale copy
   meant a team finished the hunt and a round's finish card disagreed.
4. **Two duplicate `summary` endpoints**, which existed only because the
   dashboard's is unreachable cross-origin (the session cookie is SameSite=Lax).
5. **Two env vars and two servers to keep alive at deploy time.**

**Weight was never the reason to split.** The Mystery Room is ~7,400 lines and
pulls in three.js; Shift Verse brings a 1.2k-line stylesheet, a WebGL portal and
~23 MB of media. Both are chunking and `public/` problems, not deployment
problems. Heavy scenes load through `next/dynamic` with `ssr: false`, so their
JS sits in a chunk only that route fetches — verified against a production
build: the room's 1.1 MB chunk is in no page's initial payload.

`resolveEventHrefs()` in `src/lib/events.ts` now has one shape and reads no env.

### What the round routes must respect

The circuit and Shift Verse each ship a stylesheet that sets `:root`, `*` and
`html, body`. Two consequences, both already handled — don't undo them:

- **No dashboard chrome on those two routes.** They are full-bleed and keep
  their own look. The grid and the room, which use this design system, do get
  the usual header.
- **Both hide `.grid-bg`.** The root layout paints a fixed light paper backdrop
  at `z-index: -1` on every page; on a dark round it sits *between* the body and
  a transparent WebGL canvas, and the portal ends up floating on a beige grid.
- **Leaving a round is a full page load** (`<a href>`, never `<Link>`), so a
  round's stylesheet does not follow the team back to the board.

**The wired rounds credit themselves differently, on purpose:**

- **64 Grid** checks the answer server-side (`/api/team/grid`) and stamps
  `hunt-grid` on a correct one.
- **Mystery Room** posts its reveal code to `/api/team/room` when the fifth
  section opens, and the server stamps `hunt-room`. The code is on screen by
  then — see `roomPuzzle.server.ts` for why the endpoint is still the authority.
- **Octavius Circuit** verifies the board server-side, so when a team clears all
  five levels the app stamps `circuit-1` in `hunt_progress` itself and
  recomputes the consolidated finish. Nothing to tick by hand.
- **Shift Verse** has no server-authoritative completion hook wired, so the team
  marks it complete on their own board as usual.

## The Mystery Room

Copied from [chrsnikhil/SympoApp](https://github.com/chrsnikhil/SympoApp)
(`src/app/hunt/puzzles/MysteryRoom*.tsx`). **The thirteen scene files are
upstream, essentially unmodified**, so a future pull is a copy rather than a
merge. Exactly two things were changed in them:

- `MysteryRoom.tsx` declares its own `MysteryRoomProps` instead of importing
  `PuzzleProps` from SympoApp's `hunt/registry` — this app has no registry, and
  importing one would drag in four other puzzles.
- `roomTasks.ts` imports `ROOM_CODE` from a room-only `codes.ts` rather than
  SympoApp's four-code file, which keeps three other answers out of the bundle.

Everything this app needs and upstream does not — the session-backed submit, the
solved banner, the round footer — lives in `RoomRound.tsx` rather than being
threaded through the scene code.

**No 3D assets are needed.** Every prop in `manifest.ts` has `model: null`; the
room is built entirely from procedural geometry, so there are no `.glb` files to
copy and nothing to serve from `public/`.

The room is a first-person scene: click to look, WASD to walk. Five sections,
each opened by a word **drawn somewhere in the scene** — developed on paper, on
an upside-down book, in a web, in a beam of light, stamped on four loose items.
Sections open **by code, not in order**. All five open, and the room assembles
`ARCHIVES88` from one fragment per section.

## The 64 Grid

Three steps, and each one gates the next:

1. **Identify** — every team belongs to a universe: `index = teamNumber mod 8`.
   They type it; the server checks it. Only a correct index returns the card.
2. **Decode** — that universe's RGB cipher is revealed
   (`R = (148 + 17(n + 3)) mod 256`, and so on). They substitute **n** and enter
   all three channels. Only an exact match opens step 3.
3. **Unscramble** — find that colour's eight scattered cells in the 8x8 grid and
   read the word. **The grid is never highlighted or dimmed** — every cell renders
   identically, and spotting which eight carry the team's colour is the work.
   The eight letters are not listed for them either.

The eight answers are **technical words**, all exactly eight letters, all real
words (if only the target group spelled something, a team could skip the cipher
and scan for the group that reads). No two may be anagrams of each other, and
none should have a common non-technical anagram — TERMINAL was dropped for
exactly that, since it anagrams to TRAMLINE. `grid.test.ts` enforces both rules.

**Neither answer is printed on screen.** Step 1 states the rule in words but
never the substituted formula — rendering `index = 17 mod 8` would be rendering
the answer. Step 2 names `n` but never its value, and the resulting colour is
never sent to the browser, so there is nothing on the page to compare against
and the arithmetic has to actually happen. `n` is the universe index the team
just proved it knows at step 1.

**The eight grid colours are computed, not chosen.** Each is the output of its
own universe's cipher, so a team's arithmetic lands exactly on the swatch they
need. `grid.test.ts` asserts all eight, which is the invariant that keeps the
round solvable — get one wrong and the board still renders perfectly with
nothing to find.

| # | Codename | Designation | Colour |
|---|---|---|---|
| 0 | RIOT | Earth-616 | `#c1121f` |
| 1 | PUNK | Earth-138 | `#e85d04` |
| 2 | SLAM | Earth-8311 | `#e9c46a` |
| 3 | VENOM | Earth-1000 | `#2a9d8f` |
| 4 | ELECTRIC | Earth-928 | `#3a56d4` |
| 5 | ANARCHY | Earth-65 | `#7b2fbe` |
| 6 | SMASH | Earth-1610 | `#d90066` |
| 7 | GHOST | Earth-90214 | `#b0b0b0` |

**Every universe has its own answer.** Teams 9 and 17 are both universe 1 and
share a word; team 10 is universe 2 and does not. `isCorrectAnswer` takes the
team number for exactly this reason.

**The step-3 swatches carry no index, and their order is shuffled per team.**
That is what makes step 2 load-bearing: a team that skipped the arithmetic knows
its index but cannot tell which swatch that is, because neither position nor
label gives it away. Only the decoded hex identifies it. Shuffling is
deterministic per team, so a coordinator can still talk someone through their
screen, but "mine is the third one" never travels across the room.

**Nothing secret reaches the browser.** `gridPuzzle.server.ts` holds the words,
the seed and the whole cipher table; the client is sent the shuffled
`{letter, colour}` pairs and — only after a correct index — its own universe's
three equations. Never the resulting colour, never the word. Verified after
every build by grepping `.next/static`.

That split is the whole point. Upstream, `SixtyFourGrid.tsx` did
`import { CODES } from "@/lib/hunt/codes"` and compared in the browser — and
because bundlers do not tree-shake individual properties off an object read by
member expression, importing CODES for one field shipped **all four reveal codes
in the hunt** into that route's client chunk.

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
