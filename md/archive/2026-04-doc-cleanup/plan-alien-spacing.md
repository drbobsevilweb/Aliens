# Plan: Alien Spacing Audit + Hardening

## Goal

Ensure aliens NEVER visually overlap marines during combat. They should attack from adjacent positions only.

## Current State (from code audit)

The system already has 3-layer separation — this is mostly working:

| Layer | Location | Distance | Force |
|-------|----------|----------|-------|
| Swarm separation | EnemyMovement.js:13-30 | ≤ 48px between aliens | 16.5 × overlap |
| Melee bounce | EnemyMovement.js:32-49 | < 58px from target | 18.0 × overlap |
| Hard push | EnemyManager.js:1144-1194 | < 32px from marine | 320 px/s eject |

- Attack range: 45-74px (0.7-1.15 tiles) — aliens oscillate at this distance
- Phaser colliders prevent physics overlap (GameScene.js:645-666)
- Facehuggers exempt from melee bounce during leap (intentional mechanic)
- Knockback: 240 px/s for 200ms pushes marine away after hit

### Known Edge Cases to Verify

1. **Multiple aliens attacking one marine** — swarm separation is 48px between aliens, but 3+ aliens converging could still visually stack near the target
2. **Facehugger post-leap** — after leap window closes, does the facehugger properly separate?
3. **Follower marines** — are they covered by the same hard push system?
4. **Corner cases** — marine backed against a wall with alien approaching from the open side, could alien clip through?
5. **Queen/Lesser Queen** — larger sprites may need wider separation distances

## Required Changes (if any issues found)

### Audit first, fix second
- Visually test with 4+ aliens attacking a single marine in a corridor
- Test queen attacks in tight spaces
- Test facehugger post-leap separation
- Check follower marines have the same collider setup as TL

### Potential fixes if overlap is observed
1. Increase melee bounce radius from 58px → 64px (one full tile)
2. Increase hard push threshold from 32px → 48px
3. Add queen-specific separation radius (larger sprite = wider buffer)
4. Ensure facehugger melee bounce re-engages after leap window expires

### Code cleanup
- Check for redundant overlap handling between the 3 layers
- The empty collision callback `() => {}` on the collider (GameScene.js:645) — verify this is intentional and not hiding a missing damage callback
- Confirm the follower-alien collider uses the same pattern

## Files to Inspect/Edit

- `src/systems/EnemyMovement.js` — melee bounce, swarm separation
- `src/systems/EnemyManager.js` — hard push, attack distance checks
- `src/scenes/GameScene.js` — physics collider setup
- `src/data/enemyData.js` — per-type stats that might need spacing overrides

## Acceptance Criteria

- No visual overlap between any alien type and any marine during combat
- Aliens attack from clearly adjacent positions (visible gap between sprites)
- Facehugger leap is the only exception (intentional mechanic)
- Works in tight corridors with multiple aliens
