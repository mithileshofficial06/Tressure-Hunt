# Octavius Circuit — round 1

Voltage-routing round for the XPLORE'26 treasure hunt. Extracted from the
`xplore26-events` platform in `Downloads/octoviuscircuit/` and re-pointed at the
hunt's MongoDB Atlas cluster.

Runs as its **own app on port 3003** (3002 is taken by SympoApp locally). The
dashboard links out to it.

```
dashboard :3000                        octavius-circuit :3003
  /dashboard ──"Enter round"────────►  /game?team=7
                                            │
  ◄──"back to the hunt board"───────────────┘

  Atlas xplore26 ── teams, hunt_progress   (dashboard owns; this app stamps
                 │                          circuit-1 on full completion)
                 └─ octavius_progress       (this app owns)
```

## Run it

```bash
npm install
cp .env.example .env.local     # MONGODB_URI — the same cluster as the dashboard
npm run dev                    # http://localhost:3003
npm test                       # solver + client/server parity
```

There is **no seed step**. The five levels are code (`src/lib/octovius/levels.ts`),
not data, so there is nothing to load and nothing to reset between rehearsals.

| Variable | Required | What |
|---|---|---|
| `MONGODB_URI` | yes | Same cluster as the dashboard |
| `MONGODB_DB` | no | Default `xplore26` |
| `NEXT_PUBLIC_DASHBOARD_URL` | no | Where "back to the hunt board" goes. Default `http://localhost:3000/dashboard`. Inlined at build time |

## How a round is credited

The dashboard shows **one** tile worth 100 points; the game has **five** levels.

1. Team opens `/game?team=N` from the dashboard tile.
2. The page looks up which levels they have cleared and resumes on the first
   unsolved one — closing the tab on level 4 does not send them back to level 1.
3. Each win posts the board to `/api/circuit/submit`. The server re-solves it
   and records the level in `octavius_progress` if it genuinely passes.
4. When all five are done, the app stamps `circuit-1` in the dashboard's
   `hunt_progress` and recomputes the team's consolidated finish time.

The team never has to tick this round by hand. If they already had — the stamp
is `$setOnInsert`, so their original time stands and this is a no-op.

## The exploit that was fixed

The extracted `game_src/main.js` posted this:

```js
payload: JSON.stringify({ voltage: result.voltage, targetVoltage: level.targetVoltage })
```

Both numbers came from the same browser, and the old grader compared them
against each other — the browser marking its own homework. A hand-written
request carrying `{"voltage":0,"targetVoltage":0}` scored the level without the
game ever being opened. **Verified rejected** in this app:

```
POST {"teamNumber":58,"levelId":1,"voltage":0,"targetVoltage":0}  →  400 Invalid board.
```

The client now posts only where the player put their own tiles. The level —
grid, source voltage, fixed modifiers, x-blocks, end nodes, target — lives on
the server, and each tile's connections and modifier value are derived from its
type rather than read off the submission. Inventory limits are enforced too, so
a submission cannot conjure fifty of whichever tile makes the arithmetic work.

Note the platform's own `src/lib/graders/circuit.ts` had **already** been
hardened this way — but `game_src/main.js` was never updated to match, so the
game as shipped would have been rejected by its own grader on every win
(wrong payload shape *and* wrong slug: `level-N` vs `circuit-N`). That mismatch
is fixed here.

## What was extracted, and what was left behind

The source folder is a whole events platform — quiz, CTF, canon, blueprint,
leaderboard, JWT auth, an unrelated Python `ai-image-eval-platform`. Only the
circuit is here.

| Taken | From |
|---|---|
| `game_src/*` (10 files) | the vanilla JS engine — canvas, board, inventory, solver, UI |
| `src/lib/octovius/{levels,pieces,solve}.ts` | the server-side level table and solver |
| `src/lib/octovius/solve.test.ts` | 16 tests, all passing |
| the DOM scaffold | from `src/app/hunt/puzzles/OctaviusCircuit.tsx`, as `src/app/game/CircuitGame.tsx` |

Left behind: the platform's auth (`teamId` ObjectIds and JWTs — incompatible
with the dashboard's team numbers), the submission pipeline, the Host-header
event routing, the four other rounds, and `game_src/{landing,counter}.js`
(a standalone entry page and a Vite demo, imported by nothing).

## The parity test matters

`pieces.ts` is a hand-kept copy of the connection table in `game_src/pieces.js`,
and `levels.ts` is a copy of `game_src/levels.js`. Both files warn that the two
sides must stay in step.

`src/lib/octovius/parity.test.ts` is what notices when they don't: it runs the
browser solver and the server solver over 300 random boards per level (1,500
total) and asserts identical voltage, connectivity and end-node results, plus
that the two level tables agree on size, target and inventory.

This is not academic. The browser decides when to show "CIRCUIT COMPLETE!"; the
server decides whether it counts. If they diverge, a team sees a win, the
submission is rejected, and it looks like the team's fault.

**Run `npm test` after touching either solver or either level table.**

## Security notes

`/api/circuit/submit` verifies the board server-side and checks the team exists
on the roster. But like the other rounds, **there is no authentication** — the
team number comes from a query string, so anyone can POST a solved board for
any registered team. Fine for a supervised room; not fine on the open internet.

Levels, targets and solutions are never sent to the client beyond what the game
needs to render the board it is already showing.
