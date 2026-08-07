# SHIFT://VERSE — round 5

Caesar-cipher round for the XPLORE'26 treasure hunt. Vendored from
[Janshafin/web-of-secrets-](https://github.com/Janshafin/web-of-secrets-) and
re-pointed at the hunt's MongoDB Atlas cluster.

Runs as its **own app on port 3001**, not as part of the dashboard — it carries
three.js, ~24MB of media and its own 26KB `globals.css` that defines its own
theme tokens. The dashboard links out to it.

```
dashboard :3000                          shift-verse :3001
  /dashboard ──"Enter round"──────────►  /game?team=7
                                             │
  ◄──"return to nexus" / "change dim."───────┘

  Atlas xplore26 ── teams, hunt_progress  (dashboard owns)
                 └─ shiftverse_teams      (this app owns)
```

## Run it

```bash
npm install
cp .env.example .env.local     # MONGODB_URI — the same cluster as the dashboard
npm run seed                   # writes 60 puzzles to shiftverse_teams
npm run dev                    # http://localhost:3001
```

`npm run seed` is **destructive** — it clears `shiftverse_teams` and rewrites
all 60 rows. Re-running mid-event resets every team's saved stepper positions.

| Variable | Required | What |
|---|---|---|
| `MONGODB_URI` | yes | Same cluster as the dashboard |
| `MONGODB_DB` | no | Default `xplore26` |
| `NEXT_PUBLIC_DASHBOARD_URL` | no | Where "return to nexus" goes. Default `http://localhost:3000/dashboard`. `NEXT_PUBLIC_` → inlined at build time, so changing it needs a rebuild |

## What changed from the upstream repo

**The upstream repo did not use MongoDB.** It shipped `lib/mongodb.ts` and
`models/Team.ts` (Mongoose), but nothing imported them — all three API routes
read `lib/db.ts`, a **JSON file** at `data/teams.json` (gitignored). So this was
a port, not a connection string swap.

| Change | Why |
|---|---|
| `lib/db.ts` rewritten on the `mongodb` driver | The file store cannot survive a serverless deploy: every instance gets its own container filesystem, so two teams on two instances see two different worlds and a redeploy wipes every guess. Same function names, now `async` |
| Collection is `shiftverse_teams`, **not** `teams` | The dashboard owns `teams` in this same database with a different shape. Sharing the name would mean this app's seed wiping the roster. The deleted `models/Team.ts` would have done exactly that — Mongoose pluralises `Team` → `teams` |
| `lib/mongodb.ts` and `models/` deleted | Dead code, and actively dangerous for the reason above |
| Range 1–40 → 1–60, via `lib/teamRange.ts` | The dashboard hands out 60 numbers. The bound was repeated in three routes, the entry form and the model; one place now |
| 20 puzzle words added for teams 41–60 | A team with no seeded word gets "team not found" mid-event |
| `shiftKeyFor()` for multiples of 26 | **Upstream bug.** The shift was the team number, so teams 26 and 52 got a shift ≡ 0 — `caesarEncrypt` returned the plaintext unchanged and the "encrypted" word on screen *was* the answer. They get 13 instead. Safe to change: the shift is never told to players, so "shift = team number" was seeding convenience, not a rule. The seed now asserts no ciphertext equals its answer |
| `/game?team=N` skips the entry screen | Teams already typed their number to register. Read server-side so the puzzle is chosen before first paint — no entry screen flashing up and being replaced |
| "Change dimension" returns to the dashboard when `?team=` was used | Otherwise it is a one-tap route into another team's puzzle |
| `turbopack.root` pinned in `next.config.ts` | Next was walking up and selecting a lockfile two directories above the hunt as the workspace root |

## What was NOT changed

- The cipher (`lib/cipher.ts`), the stepper UI, the 3D portal background, and
  all styling are untouched.
- `perLetterGuesses` is still re-randomised on every `GET /api/team/[n]` — that
  is upstream behaviour, so a refresh scrambles the steppers. The `save` route
  persists them between saves, but the next page load re-randomises anyway.
  Left alone because changing it changes how the round plays; say the word if
  you want positions to survive a refresh.
- Teams 18 and 37 still share the word `SPIDERSOCIETY` (upstream). Harmless —
  different shift keys, different ciphertext.

## Security notes

`GET /api/team/[n]` returns only `encryptedWord`, `perLetterGuesses` and
`startTime` — never `shiftKey` or `plaintextWord`. Guesses are compared
server-side and the answer is returned only on a correct guess. Verified: the
answer does not appear in the served HTML.

**There is no authentication.** Anyone can open `/game?team=23` and play team
23's puzzle, or POST a guess for any team. That is upstream's design and it is
unchanged. Fine for a supervised room; not fine if the round is ever reachable
from the open internet.
