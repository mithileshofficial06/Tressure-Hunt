# Treasure Hunt

Two things live here:

- **[dashboard/](dashboard/)** — a runnable Spider-Verse themed Next.js app:
  teams enter a number (enforced unique via a Mongo unique index), then land on
  the board of five rounds. `cd dashboard && npm run dev`. See
  [dashboard/README.md](dashboard/README.md).
- **Everything else** — reference copies of the hunt source, described below.

---

# Extracted source

All Treasure Hunt code pulled out of [chrsnikhil/SympoApp](https://github.com/chrsnikhil/SympoApp)
(XPLORE'26 event platform), grouped by event.

The hunt is one Next.js route group (`/hunt`) that renders a shell of puzzle
tiles. Each tile is a "challenge" row in Mongo; every answer goes through the
same `/api/submit` pipeline (auth → rate limit → server timestamp → grader →
append-only score ledger → leaderboard). The five events below are the graded
rounds; everything they share lives in `_shared/`.

## The five events

| # | Event | Hunt slug(s) | How it is graded |
|---|---|---|---|
| 1 | **Octavius Circuit** | `circuit-1` … `circuit-5` | Server rebuilds the player's board and re-runs the voltage solver — no client verdict |
| 2 | **Blueprint Recovery** | `hunt-blueprint` | Physical checkpoint; access code checked against the sector the team's number maps to |
| 3 | **Mystery Room** | `hunt-room` | 3D room, 5 sections unlocked by words found in-scene; the 5 sections yield the reveal code |
| 4 | **64 Grid** | `hunt-grid` | 8×8 colour grid; 3 equations pick a colour index, that colour's letters anagram to the word |
| 5 | **Shift Verse** | `hunt-shiftverse` | Caesar-shift board; guess graded against the team's own puzzle slot, with a board deadline |

(Two more hunt rounds exist in the repo — `hunt-cipher` and `hunt-universe` —
but they are not in the five you asked for, so only the slugs/hints that the
shared files already carry came along.)

---

### 1. `01-octavius-circuit/`
Place circuit pieces so current flows from source to end node and arrives at
exactly the target voltage. Five levels, each its own challenge so a team is
paid per level and `hunt_progress` gates them in order.

- `game_src/` — the game itself: **vanilla JS**, canvas + DOM, not React
  (`main.js` entry, `board.js`, `pieces.js`, `voltage.js` BFS solver,
  `inventory.js`, `ui.js`, `background.js`, `levels.js`, two stylesheets).
- `components/OctaviusCircuit.tsx` — the React wrapper. It renders the ~20
  load-bearing element ids the vanilla game looks up at init, then calls
  `initMain()`. **The ids are load-bearing — renaming one breaks the game silently.**
- `lib/levels.ts`, `lib/pieces.ts`, `lib/solve.ts` — the *server's* copy of the
  level data and solver, so a submitted board can be re-simulated.
- `grader/circuit.ts` — dispatched on `config.levelId` being a number.

### 2. `02-blueprint-recovery/`
Team is assigned one of 10 colour/dimension sectors, walks to that physical
checkpoint, and types the access code printed on the card there.

- `lib/sectors.ts` — **public** half: colour, dimension name, accent hex.
- `lib/variants.ts` — `import "server-only"`. Holds the 10 access codes and the
  team-number → sector mapping. The split is the whole point: the reveal page
  needs the colour, and must not be able to reach the code.
- `app/BlueprintFlow.tsx` — briefing → sector reveal → code entry.
- `api/sector/route.ts`, `grader/blueprint.ts`.

### 3. `03-mystery-room/`
A first-person 3D antique room (react-three-fiber). Five sections, each solved
by finding a word drawn somewhere in the scene and typing it into the console.

> **This folder is the reference copy and is NOT what runs.** The room is now
> live in the dashboard at `/rounds/room` — the files that actually execute are
> `dashboard/src/app/rounds/room/` and `dashboard/src/lib/hunt/{roomTasks,manifest,morse,codes}.ts`.
> Editing anything below changes nothing. See
> [dashboard/README.md](dashboard/README.md#the-mystery-room) for what was
> altered on the way in (two imports) and why.

- `components/` — 12 files. `MysteryRoom.tsx` is the shell; `MysteryRoomScene.tsx`
  is the room (1.9k lines); the rest are individual props/puzzles: board,
  books, deer, drawers, tools, web bench, player controller, boundary, GLB loader.
- `lib/roomTasks.ts` — the five sections, their two-part clues and unlock words.
  Sections open **by code, not in order**.
- `lib/manifest.ts` — the four loose pickup items and their world coordinates.
  **Array order is letter order** — reordering it changes the code.
- `lib/morse.ts` — morse decoding used by one of the sections.

### 4. `04-sixty-four-grid/`
8×8 grid of coloured letters. Three general-knowledge equations sum, mod 8, to
a colour index; that colour's 8 letters anagram to the answer.

- `lib/grid.ts` — deterministic (mulberry32, seeded) grid builder. All eight
  colour groups spell real words so the target group doesn't stand out.
- `components/SixtyFourGrid.tsx`.
- Content (words, seed, equations, `targetColour`) lives in
  `_shared/hunt-lib/content.ts` under `GRID`.

### 5. `05-shift-verse/`
Three-page flow (landing → board → result) with its own layout. Every letter on
the board is Caesar-shifted by the same amount; the answer is a Spider-Verse name.

- `app/` — the routes plus `shiftverse.css` (1.2k lines).
- `components/` — `ShiftVerse.tsx`, `PuzzleBoard.tsx`, `LetterStepper.tsx`,
  `LandingPage.tsx`, `PortalBackground.tsx`, `Logo.tsx`.
- `api/` — `state`, `save`, `guess` (with their tests).
- `lib/` — `board.ts`, `slot.ts`, `cipher.ts`, and `words.example.json`
  (the real word list is gitignored under `private/shiftverse/`).
- `grader/shiftverse.ts` — reached via `gradeHunt` on `config.flow === "shiftverse"`.
  Deliberately **not** registered in the grader registry: two routes into scoring
  would mean one of them skips the board deadline.

---

## `_shared/`

| Folder | What |
|---|---|
| `hunt-shell/` | `/hunt` page, `HuntShell.tsx` (tiles, answer box, hints), `registry.tsx` (slug → component), leaderboard |
| `hunt-lib/` | `content.ts` (slugs, playable list, hints, per-puzzle content), `codes.ts` (reveal codes), `unlock.ts` |
| `graders/` | `hunt.ts` — the entry grader that dispatches to circuit/shiftverse/blueprint, claims the solve atomically, applies hint costs, unlocks `nextSlug`. Plus `index.ts`, `types.ts` |
| `api/` | `submit`, `hunt/hint`, `hunt/progress`, `leaderboard`, `enter` (session mint), `admin/hunt/overview` |
| `platform/` | Everything the hunt sits on: JWT session + guard, Mongo client/types/retry, `submission/pipeline.ts`, `score/ledger.ts`, `leaderboard/materialize.ts`, `config.ts`, rate limit, cache, participation |
| `admin/hunt/` | Coordinator dashboard at `/spider-hq-admin-9981/hunt` |
| `dev/hunt-test/` | Local harness for playing puzzles without a session |

`scripts/` holds `seed-hunt.ts` and `seed-shiftverse.ts` — these write the
challenge documents (points, `answerHash`, `hintCosts`, `nextSlug`, `flow`)
that the graders read.

## Reading it back into the repo

Files are **unmodified copies**. Their `@/…` imports and relative imports still
point at the original layout, so this tree does not compile standalone — it is
a reading/reference copy. `MANIFEST.md` maps every file back to its original
path if you want to move any of it.

Key cross-folder edges the split hides:
- `03-mystery-room/lib/roomTasks.ts` imports `./codes` → `_shared/hunt-lib/codes.ts`
- `04-sixty-four-grid` content constants → `_shared/hunt-lib/content.ts`
- every `grader/*.ts` is imported by `_shared/graders/hunt.ts`
- `01-octavius-circuit/components/OctaviusCircuit.tsx` imports `game_src/` by
  relative path (`../../../../game_src/main.js`)
