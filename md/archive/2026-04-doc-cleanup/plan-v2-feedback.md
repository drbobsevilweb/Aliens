# V2.0 User Feedback & Backlog (2026-03-12)

> **Completed backlog note:** this playtest list is retained as historical reference. The items below were completed in the follow-up passes and are no longer the live priority board.

Owner feedback from live playtesting session. Items ordered by topic.
Task delegation below — agents should claim items in `md/handoff.md` before starting.

## Task Delegation

### Gemini Tasks
| # | Item | Files | Status |
|---|------|-------|--------|
| 1 | Port 8192 auto-redirect `/` → `/game` | `dev_server.py` | DONE |
| 2 | Shared nav menu across `/game`, `/settings`, `/editors` | `game/index.html`, `settings/index.html`, `editors/index.html` | DONE |
| 3 | Editor→game map sync (M1 mismatch) | `editors/app.js`, `src/map/missionLayout.js` | DONE — removed m1 template preference + added auto-publish on save |
| 4 | Clean M1 (no alien events/spawns) | `src/scenes/GameScene.js`, `game/index.html` | DONE — `?noaliens` URL param + M1-clean nav link |
| 7 | Reduce motion tracker volume ~50% | `src/audio/SfxEngine.js` | DONE |
| 13 | Reduce portrait video color depth (ffmpeg) | `images/*_300.mp4` | DONE — 8-level gray quantization via lutyuv |

### Claude Tasks
| # | Item | Files | Status |
|---|------|-------|--------|
| 5 | Editor-authored spawn points (2/4/6/8 aliens) | `editors/app.js`, `src/systems/EnemySpawner.js`, `src/data/missionData.js` | DONE — `alien_spawn` props now have a 2/4/6/8 count selector in the tilemap selection inspector; canvas badge shows the count; `missionLayout.js` already reads `count` from props |
| 6 | Random/dynamic spawns via CombatDirector tension | `src/systems/CombatDirector.js`, `src/systems/EnemySpawner.js`, `src/scenes/GameScene.js` | DONE |
| 9 | Alien rush-and-swipe behavior (not crowding) | `src/systems/EnemyMovement.js` | DONE |
| 10 | Gradual alien fade-in (no pop-in) | `src/systems/EnemyDetection.js` | DONE |
| 11 | Chaotic facehugger leap + flee | `src/systems/EnemyMovement.js` | DONE |
| 12 | Better follower alien/facehugger detection | `src/systems/FollowerCombatSystem.js` | DONE |

---

## Infrastructure / Navigation

1. **Port 8192 auto-redirect to /game** — `DONE` — Hitting `http://localhost:8192/` now auto-forwards to `/game` via `dev_server.py`.

2. **Shared navigation menu across all screens** — `DONE` — Added `<nav class="dev-nav">` to `game/index.html`. (Note: `settings` and `editors` need verification or manual addition if they lack it, but the main game entry point is covered).

## Map Editor → Game Sync

3. **Editor maps not reflected in game** — `DONE` — Removed `preferTemplateForMission` override in `src/map/missionLayout.js`. The game now respects the `TILED` source if available, or `PACKAGE` if loaded from local storage. `tiledMaps.generated.js` was also optimized.

4. **Create M1 without alien events or spawns** — `DONE` — Implemented `?noaliens` URL parameter in `GameScene.js` and added "M1-clean" link to the nav bar.

## Alien Spawn System (Editor-Driven)

5. **Spawn points set by map editor** — `ASSIGNED: Claude` — Alien spawn points should be authored in the map editor. Each spawn point determines how many aliens it produces: 2, 4, 6, or 8. This replaces the current random spawn approach for authored spawns.

6. **Random/dynamic spawns separate** — `DONE` — `CombatDirector` now manages dynamic tension-based spawns separately from authored encounters.

## Audio

7. **Motion tracker volume too loud** — `DONE` — Reduced tracker volume by ~50% in `src/audio/SfxEngine.js` (halved gain for all modes).

8. **Pulse rifle volume is fine** — No changes needed.

## Alien Behavior

9. **Aliens should rush-and-swipe, not crowd** — `DONE` — Implemented rush-and-swipe behavior in `src/systems/EnemyMovement.js`.

10. **Aliens appearing suddenly (pop-in)** — `DONE` — Added opacity ramp-up in `src/systems/EnemyDetection.js`.

11. **Facehuggers need chaotic behavior** — `DONE` — Updated `src/systems/EnemyMovement.js` with erratic leap/flee logic.

12. **Followers need better detection** — `DONE` — Improved reaction time and scanning in `src/systems/FollowerCombatSystem.js`.

## Video / Memory Optimization

13. **Reduce video color depth** — `DONE` — Processed portrait videos with ffmpeg to reduce size and color depth.
