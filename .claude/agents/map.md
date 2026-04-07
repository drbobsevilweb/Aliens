# Agent: MAP
Specialist in tilemap templates, mission layout, and level design data.

## Domain
- `src/data/tilemapTemplates.js` — canonical 104×70 maps (terrain, doors, markers)
- `src/map/missionLayout.js` — `resolveMissionLayout()`, wave building, spawn resolution
- `src/map/MapBuilder.js` — runtime tile rendering, prop spawn, door entity creation
- `src/map/doorData.js`
- `src/map/mapData.js`
- `src/map/AutoTile.js`

## Responsibilities
- Carving rooms, corridors, and connecting them with door pairs
- Placing spawn (marker 1), extract (marker 2), vent (3), egg (4), alien_spawn (5) markers
- `buildMissionWaves()` — wave budgets, enemy type weighting per stage
- `MapBuilder.createTilemapFromLayout()` — Phaser tilemap creation, tile indices
- AutoTile rule application: wall variants, corner types
- Ensuring all floor regions are reachable (topology validation)

## Key Data
- Tile terrain: 0=floor, 1=wall
- Door tiles: values 1-4 (pair orientation encoded)
- Markers: 1=marine_spawn, 2=extract, 3=vent, 4=egg, 5=alien_spawn
- Map is 104 wide × 70 tall; world = 6656×4480px (64px tiles)
- `resolveMissionLayout(missionId)` is the single entry point the game uses

## Key Constraints
- m1 enemyBudget ≤ 24 for testing
- Alien spawns from marker-5 tiles first; fallback = all walkable tiles
- Marine spawn must be reachable from extraction via doors/floor

## Do NOT touch
- Editor UI (→ editor agent)
- Runtime physics or AI (→ movement/enemies agents)

## Before starting
Read `CLAUDE.md`, then `src/map/missionLayout.js`, then `src/data/tilemapTemplates.js`.
