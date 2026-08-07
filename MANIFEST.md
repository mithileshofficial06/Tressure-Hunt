# Path map — extracted → original

Source repo: `chrsnikhil/SympoApp` (default branch, shallow clone).
Files are byte-identical copies; only their location changed.

## 01-octavius-circuit
| Extracted | Original |
|---|---|
| `components/OctaviusCircuit.tsx` | `src/app/hunt/puzzles/OctaviusCircuit.tsx` |
| `components/SpiderLoadingScreen.tsx` | `src/app/hunt/puzzles/SpiderLoadingScreen.tsx` |
| `game_src/*` | `game_src/*` (repo root) |
| `lib/levels.ts` | `src/lib/octovius/levels.ts` |
| `lib/pieces.ts` | `src/lib/octovius/pieces.ts` |
| `lib/solve.ts` | `src/lib/octovius/solve.ts` |
| `lib/solve.test.ts` | `src/lib/octovius/solve.test.ts` |
| `grader/circuit.ts` | `src/lib/graders/circuit.ts` |

## 02-blueprint-recovery
| Extracted | Original |
|---|---|
| `app/page.tsx` | `src/app/blueprint/page.tsx` |
| `app/BlueprintFlow.tsx` | `src/app/blueprint/BlueprintFlow.tsx` |
| `api/sector/route.ts` | `src/app/api/blueprint/sector/route.ts` |
| `lib/sectors.ts` | `src/lib/blueprint/sectors.ts` |
| `lib/variants.ts` | `src/lib/blueprint/variants.ts` |
| `lib/variants.test.ts` | `src/lib/blueprint/variants.test.ts` |
| `grader/blueprint.ts` | `src/lib/graders/blueprint.ts` |

## 03-mystery-room
| Extracted | Original |
|---|---|
| `components/MysteryRoom*.tsx` (12 files) | `src/app/hunt/puzzles/MysteryRoom*.tsx` |
| `lib/manifest.ts` | `src/lib/hunt/manifest.ts` |
| `lib/roomTasks.ts` | `src/lib/hunt/roomTasks.ts` |
| `lib/roomTasks.test.ts` | `src/lib/hunt/roomTasks.test.ts` |
| `lib/morse.ts` | `src/lib/hunt/morse.ts` |
| `lib/morse.test.ts` | `src/lib/hunt/morse.test.ts` |

## 04-sixty-four-grid
| Extracted | Original |
|---|---|
| `components/SixtyFourGrid.tsx` | `src/app/hunt/puzzles/SixtyFourGrid.tsx` |
| `lib/grid.ts` | `src/lib/hunt/grid.ts` |

## 05-shift-verse
| Extracted | Original |
|---|---|
| `app/*` | `src/app/shiftverse/*` |
| `components/*.tsx` | `src/components/shiftverse/*.tsx` |
| `api/*` | `src/app/api/shiftverse/*` |
| `lib/board.ts` | `src/lib/shiftverse/board.ts` |
| `lib/slot.ts`, `lib/slot.test.ts` | `src/lib/shiftverse/slot.ts`, `slot.test.ts` |
| `lib/cipher.ts`, `lib/cipher.test.ts` | `src/lib/cipher.ts`, `src/lib/cipher.test.ts` |
| `lib/words.example.json` | `private/shiftverse/words.example.json` |
| `grader/shiftverse.ts`, `grader/shiftverse.test.ts` | `src/lib/graders/shiftverse.ts`, `shiftverse.test.ts` |

## _shared
| Extracted | Original |
|---|---|
| `hunt-shell/page.tsx` | `src/app/hunt/page.tsx` |
| `hunt-shell/HuntShell.tsx` | `src/app/hunt/HuntShell.tsx` |
| `hunt-shell/registry.tsx` | `src/app/hunt/registry.tsx` |
| `hunt-shell/puzzles/PlaceholderPuzzle.tsx` | `src/app/hunt/puzzles/PlaceholderPuzzle.tsx` |
| `hunt-shell/leaderboard/*` | `src/app/hunt/leaderboard/*` |
| `hunt-lib/codes.ts` | `src/lib/hunt/codes.ts` |
| `hunt-lib/content.ts` | `src/lib/hunt/content.ts` |
| `hunt-lib/unlock.ts` | `src/lib/hunt/unlock.ts` |
| `graders/index.ts`, `types.ts`, `hunt.ts` | `src/lib/graders/{index,types,hunt}.ts` |
| `api/hunt/hint/route.ts` | `src/app/api/hunt/hint/route.ts` |
| `api/hunt/progress/route.ts` | `src/app/api/hunt/progress/route.ts` |
| `api/submit/route.ts` | `src/app/api/submit/route.ts` |
| `api/leaderboard/route.ts` | `src/app/api/leaderboard/route.ts` |
| `api/enter/route.ts` | `src/app/api/enter/route.ts` |
| `api/admin/hunt/overview/route.ts` | `src/app/api/admin/hunt/overview/route.ts` |
| `platform/config.ts` | `src/lib/config.ts` |
| `platform/cache.ts` | `src/lib/cache.ts` |
| `platform/rateLimit.ts` | `src/lib/rateLimit.ts` |
| `platform/auth/{guard,session}.ts` | `src/lib/auth/{guard,session}.ts` |
| `platform/db/{client,types,retry}.ts` | `src/lib/db/{client,types,retry}.ts` |
| `platform/submission/pipeline.ts` | `src/lib/submission/pipeline.ts` |
| `platform/score/ledger.ts` | `src/lib/score/ledger.ts` |
| `platform/leaderboard/materialize.ts` | `src/lib/leaderboard/materialize.ts` |
| `platform/event/participation.ts` | `src/lib/event/participation.ts` |
| `platform/universe/{words,teamNumber}.ts` | `src/lib/universe/{words,teamNumber}.ts` |
| `admin/hunt/page.tsx` | `src/app/spider-hq-admin-9981/hunt/page.tsx` |
| `dev/hunt-test/*` | `src/app/hunt-test/*` |
| `../scripts/seed-hunt.ts` | `scripts/seed-hunt.ts` |
| `../scripts/seed-shiftverse.ts` | `scripts/seed-shiftverse.ts` |

## Deliberately not copied
- `hunt-cipher` / `hunt-universe` rounds (`src/app/universe/**`) — not among the five events.
- CTF, Quiz, Code events; `spider-verse-quiz-site/`; `ai-image-eval-platform/`.
- Shared UI primitives (`src/components/ui/Comic*.tsx`) — none of the five event
  files import them.
- `public/` assets, `next.config.ts`, `package.json`, Tailwind/global CSS.
