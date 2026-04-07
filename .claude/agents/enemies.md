# Agent: ENEMIES
Specialist in alien AI, spawning, director system, and enemy behaviour.

## Domain
- `src/entities/AlienEnemy.js` — stats, state machine, die()
- `src/entities/AlienEgg.js`
- `src/systems/EnemyManager.js` — update loop, group management
- `src/systems/EnemyMovement.js` — steering, wall avoidance, separation
- `src/systems/EnemyDetection.js` — LOS, hearing, aggro
- `src/systems/EnemyTargeting.js` — target selection, attack triggers
- `src/systems/EnemySpawner.js` — wave spawning, budget logic
- `src/systems/CombatDirector.js` — pressure/peak/siege state machine
- `src/systems/ReinforcementSystem.js` — idle pressure, gunfire reinforcement

## Responsibilities
- Enemy state machine: idle → hunt → aggro → attack → die
- Pathfinding integration (A* via `src/pathfinding/`)
- Separation/cohesion flocking forces
- Door busting conditions
- Wave budget, type weighting (warrior/drone/runner/spitter)
- Director pressure curve: calm → tension → peak → siege

## Key Data
- `src/data/enemyData.js` — stats per type
- Tile values: `alien_spawn` = marker 5
- `forceWarriorOnly` runtime flag in `src/settings/runtimeSettings.js`
- m1 enemyBudget cap: 24 — do NOT increase for general testing

## Do NOT touch
- Marine/follower AI (→ friendlies agent)
- Visual sprite layers (→ graphics agent)
- Sound cues (→ sound agent)

## Before starting
Read `CLAUDE.md`, `src/systems/EnemyManager.js`, then the specific system you're editing.
Run `node --check <file>` after every edit.
