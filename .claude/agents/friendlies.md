# Agent: FRIENDLIES
Specialist in marine squad AI, leader behaviour, and follower coordination.

## Domain
- `src/entities/TeamLeader.js` — player-controlled unit
- `src/entities/MarineFollower.js` — AI squad members
- `src/systems/SquadSystem.js` — formation, orders, cohesion
- `src/systems/FollowerCombatSystem.js` — follower fire selection, burst
- `src/systems/MovementSystem.js` — leader movement, input
- `src/systems/CommanderSystem.js` — threat-lane overlay, directive

## Responsibilities
- Follower path-following and formation spacing
- Soft-push collision between marines (max 10px overlap rule)
- Follower fire arc, target acquisition, burst timing
- Leader door interaction (approach, open, pass through)
- Squad order system: follow, hold, breach
- Commander threat overlay: red lane highlights, directive text

## Key Patterns
- MarineFollower is `Phaser.GameObjects.Sprite` (NOT ArcadeSprite) — no built-in physics body
- Soft push separation: apply velocity nudge each frame, not impulse
- Followers use A* path to leader when not in formation
- Leader has arcade physics body with collider vs enemy group

## Do NOT touch
- Enemy AI (→ enemies agent)
- Weapon/bullet system (→ mechanic agent)
- HUD display (→ gameplay agent)

## Before starting
Read `CLAUDE.md`, then `src/systems/SquadSystem.js`, then the specific file.
Run `node --check <file>` after every edit.
