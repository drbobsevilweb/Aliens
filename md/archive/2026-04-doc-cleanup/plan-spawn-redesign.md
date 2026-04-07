# Spawn System Redesign Plan

> **Completed foundation / historical plan:** the authored spawn-count flow and dynamic CombatDirector spawning have already landed. Keep this file as background context only; current status lives in `md/handoff.md`, `md/collab.md`, and `md/progress.md`.

## Goal

Split alien spawning into two systems:
1. **Authored spawns** — Set in the map editor, each spawn point defines how many aliens (2, 4, 6, or 8)
2. **Dynamic spawns** — Triggered by CombatDirector based on time since last firefight

## Current State

- Spawn points in tilemapTemplates use marker value `5` (alien_spawn) but only as grid positions
- EnemySpawner.spawnWave() takes an array of `{ type, tileX, tileY }` from mission waves
- Mission waves are defined in missionData.js per mission
- CombatDirector tracks pressure but doesn't trigger spawns directly
- EnemyManager.update() doesn't have a dynamic spawn path

## Implementation Plan

### Phase 1: Editor-Authored Spawn Points

**Map data format change:**
- Marker value `5` (alien_spawn) gets an associated `alienCount` property: 2, 4, 6, or 8
- Store in tilemapTemplates as `spawnPoints: [{ tileX, tileY, count: 4 }]`
- Editor UI: clicking an alien_spawn marker shows a count selector (2/4/6/8)

**Files to modify:**
- `editors/app.js` — Add spawn count selector UI when placing/editing alien_spawn markers
- `src/data/tilemapTemplates.js` — Add `spawnPoints` array to layout data
- `src/map/missionLayout.js` — Read spawn points from layout
- `src/systems/EnemySpawner.js` — New method `spawnFromAuthoredPoints(spawnPoints, waveNumber)` that reads the authored count per point and spawns that many aliens (mix of types based on mission difficulty)
- `src/scenes/GameScene.js` — Use authored spawn points instead of wave arrays when available

**Editor changes:**
- Marker layer: alien_spawn markers get a small badge showing their count
- New panel section: "Spawn Points" with count dropdown per spawn marker
- Export/import: spawn point counts preserved in Tiled round-trip

### Phase 2: Dynamic CombatDirector Spawns

**Tension-based spawning:**
- Track `timeSinceLastFirefight` in CombatDirector or GameScene
- When in `build` state and `timeSinceLastFirefight > threshold`, spawn 1-3 aliens at random walkable positions far from marines
- Threshold scales with mission progress (shorter later in mission)
- During `release` state, no dynamic spawns (let tension drop)

**Files to modify:**
- `src/systems/CombatDirector.js` — Add `lastFirefightAt` tracking, expose `shouldTriggerDynamicSpawn(time)` method
- `src/systems/EnemySpawner.js` — New method `spawnDynamic(time, marines, difficulty)` that picks random far-from-marine walkable positions
- `src/scenes/GameScene.js` — Call `spawnDynamic()` from main update loop when CombatDirector says to
- `src/data/missionData.js` — Add per-mission tuning for dynamic spawn rate

**Tuning knobs:**
- `dynamicSpawnMinIntervalMs` — minimum time between dynamic spawns (default: 20000)
- `dynamicSpawnIdleThresholdMs` — how long without combat before first dynamic spawn (default: 15000)
- `dynamicSpawnMaxPerEvent` — max aliens per dynamic spawn (default: 3)
- `dynamicSpawnBudget` — total dynamic spawns allowed per mission (default: 12)

### Phase 3: M1 Clean Setup

- Zero out M1 wave arrays and setpieces
- Place authored spawn points in M1 map with specific counts
- Test editor→game pipeline with clean M1

## Dependencies

- Item 3 (editor→game sync) should be fixed first — currently assigned to Gemini
- M1 clean setup (item 4) should happen after spawn points are editor-authored

## Estimated Scope

- Phase 1: ~200 lines across 5 files
- Phase 2: ~150 lines across 4 files
- Phase 3: ~30 lines, mostly data changes
