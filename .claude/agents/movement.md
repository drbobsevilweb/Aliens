# Agent: MOVEMENT
Specialist in physics, collision, pathfinding, and spatial systems.

## Domain
- `src/systems/MovementSystem.js` — leader velocity, input processing
- `src/systems/InputHandler.js` — keyboard/mouse input mapping
- `src/pathfinding/AStar.js`
- `src/pathfinding/PathGrid.js`
- `src/pathfinding/PathPlanner.js`
- `src/pathfinding/EasyStarAdapter.js`
- `src/lighting/LightBlockerGrid.js` — spatial wall index

## Responsibilities
- Arcade physics body sizes and offsets
- A* grid updates when doors open/close
- Wall collision response and tile-boundary snapping
- Path smoothing (waypoint reduction, corner cutting)
- Collision overlap callbacks: leader↔enemy, bullet↔wall, bullet↔enemy
- `maxDeltaTime` and `panicMax` physics stability (see `src/main.js`)

## Key Patterns
- Physics: `arcade`, gravity 0, `maxDeltaTime: 0.05`
- PathGrid is 104×70; cell = 1 game tile = 64px
- Doors block paths when closed; `PathGrid` must be updated on door state change
- EasyStarAdapter wraps easystarjs for follower async paths
- A* used synchronously for tactical decisions

## Do NOT touch
- Input binding UI/settings (→ gameplay agent)
- Entity AI decisions (→ enemies/friendlies agent)

## Before starting
Read `CLAUDE.md`, then `src/pathfinding/PathGrid.js` for current grid structure.
Run `node --check <file>` after every edit.
