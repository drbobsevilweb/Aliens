# Spawn Redesign Audit — 2026-04-06

## Scope

10 subagents audited the current spawn system across editor, map/runtime data flow, spawner mechanics, pacing, movement safety, gameplay contracts, schema fidelity, squad fairness, architecture, and hidden legacy paths.

This document is the consolidated redesign brief.

## Current State

The spawn system is split across multiple authorities:

- authored opener spawns from `missionLayout.spawnPoints`
- later combat still advances through generated `missionWaves`
- CombatDirector dynamic spawns run separately
- ReinforcementSystem and SetpieceSystem both inject packs
- egg hatches, vent ambushes, and the queen request flag bypass the authored encounter contract

The net result is that authored spawn data is not yet the canonical source of truth for encounter pacing.

## Key Findings

### 1. No Single Spawn Authority

- `resolveMissionLayout()` still generates `missionWaves` even when authored spawn points exist.
- `GameScene.create()` uses authored spawns only for the opening contact.
- Later progression still consumes generated waves plus reactive and scripted pack spawns.

Primary references:

- `src/map/missionLayout.js`
- `src/scenes/GameScene.js`
- `src/systems/EnemySpawner.js`
- `src/systems/ReinforcementSystem.js`
- `src/systems/SetpieceSystem.js`

### 2. Canonical Spawn Data Is Drifting

- `map.spawnPoints` is normalized in package runtime but ignored by `resolveMissionLayout()`.
- package build/normalize paths do not serialize `spawnPoints` cleanly.
- marker `6` is still treated as a spawn source in legacy code paths even though it is the warning strobe marker.
- the modular tilemap editor cannot author counted alien spawns yet.

Primary references:

- `src/settings/missionPackageRuntime.js`
- `editors/backend/js/buildPackageFromEditorState.js`
- `editors/backend/js/normalizeMissionPackage.js`
- `src/map/missionLayout.js`
- `editors/tabs/tilemaps.js`
- `scripts/tiledImport.mjs`
- `scripts/tiledExport.mjs`

### 3. Spawn Fairness Rules Are Too Soft

- spawn validation can still fall back to the original blocked coordinate if no walkable tile is found
- spawn legality uses straight-line distance and LOS, not path distance
- multi-count authored spawns do not reserve tiles within a batch
- there is no meaningful activation grace after spawn
- tracker and marine squad reaction are not aligned for close ambush channels

Primary references:

- `src/systems/EnemySpawner.js`
- `src/systems/EnemyManager.js`
- `src/pathfinding/PathGrid.js`
- `src/systems/FollowerCombatSystem.js`
- `src/systems/EnemyDetection.js`

### 4. Composition And Pacing Are Split

- authored opener composition, legacy wave composition, dynamic spawn composition, and reinforcement composition all use different rules
- authored spawn counts front-load the opening of some missions instead of shaping a build
- universal health/speed multipliers make authored counts read hotter than the base data implies

Primary references:

- `src/systems/EnemySpawner.js`
- `src/map/missionLayout.js`
- `src/systems/CombatDirector.js`
- `src/systems/ReinforcementSystem.js`
- `src/data/enemyData.js`

### 5. Hidden Duplicate Paths Remain

- node-graph spawn actions are wired but effectively dormant
- ReinforcementSystem and SetpieceSystem both create director packs without one canonical coordination layer
- queen spawning still depends on a hidden runtime flag instead of authored spawn data

Primary references:

- `src/scenes/GameScene.js`
- `src/systems/SetpieceSystem.js`
- `src/systems/ReinforcementSystem.js`
- `src/systems/StageFlow.js`

## Recommended Canonical Design

### Canonical Authored Data

Use one authoritative map field for alien spawn data.

Recommended shape:

```js
spawnPoints: [
  {
    id: 'spawn_a1',
    tileX: 18,
    tileY: 9,
    count: 4,
    profile: 'stalk',
    allowedTypes: ['warrior', 'drone'],
    phaseTags: ['opening', 'build'],
    cooldownMs: 0,
  }
]
```

Legacy marker and prop spawn data should be migration inputs only, not the long-term runtime contract.

### Canonical Runtime Contract

Split spawning into three classes:

- `encounter`: authored phase-owned packs that determine encounter completion
- `reactive`: CombatDirector or reinforcement pressure spawns that add tension but do not define the phase
- `scripted`: guaranteed setpiece or node-driven beats that reserve priority

All three should converge through one coordinator layer before calling the low-level spawn worker.

Recommended rule:

- keep `spawnEnemyAtWorld()` as the low-level entity constructor
- route authored, reactive, scripted, egg, vent, and queen spawns through one coordinator entry
- make only `encounter` spawns drive `StageFlow` and `MissionFlow` completion

### Canonical Editor Contract

The modular tilemap editor should become the only live authored spawn surface.

Recommended editor features:

- marker `5` inspector with count selector and optional spawn profile fields
- on-canvas badge for spawn count
- migration of legacy `alien_spawn` props into canonical spawn markers on load
- Tiled import/export support for the canonical spawn metadata

### Fairness Contract

All spawn sources should share one validator:

- in-bounds tile required
- current PathGrid walkable required
- no door-threshold occupancy
- no blocked room-prop occupancy
- path-distance fairness check, not only Euclidean distance
- batch tile reservation for multi-count authored spawns
- activation grace before movement, sensing, leap, or melee

## Recommended Implementation Order

1. Make `spawnPoints` canonical in the data contract.
2. Thread `spawnPoints` through package build, normalize, schema, and runtime projection.
3. Teach `resolveMissionLayout()` to prefer canonical authored spawn data and treat markers or props as migration-only fallback.
4. Replace the split opener-plus-wave orchestration with one encounter plan.
5. Unify reactive and scripted pack requests behind one spawn coordinator.
6. Add the shared fairness validator and activation grace.
7. Remove legacy marker `6` spawn compatibility once migration is complete.

## Verification Plan

Add or extend tests for:

- package round-trip preservation of `spawnPoints`
- Tiled round-trip preservation of spawn count and metadata
- `resolveMissionLayout()` canonical authored spawn preference
- warning strobe marker never becoming an alien spawn source
- encounter progression using authored spawn plans instead of legacy wave totals
- dynamic or reinforcement spawn parity with the shared coordinator
- multi-count authored spawn tile reservation and path-distance fairness

Existing commands to keep in the verification loop:

- `node scripts/test-mission-layout.mjs`
- `node scripts/test_tilemaps_inspector_panel.mjs`
- `bash ./scripts/verify.sh`