# Agent: EFFECTS
Specialist in particles, impact FX, acid, blood, decals, and environmental atmosphere.

## Domain
- `src/entities/AcidPool.js`
- `src/entities/AcidProjectile.js`
- `src/systems/AtmosphereSystem.js`
- Impact/spark/blood sections of `src/scenes/GameScene.js`
  - `showImpactEffect()`, `spawnAcidBloodEffect()`, `emitAlienSteamPlume()`
  - `spawnFloorDecal()`, `spawnAcidSpurt()`, acid hazard pool
- Torch dust, steam, bokeh in `AtmosphereSystem`

## Responsibilities
- Phaser particle emitter config (speed, lifespan, scale, quantity, tint)
- Per-hit effect triggers: bullet impact sparks, alien acid blood, door breach spark
- Floor decal persistence (acid stains, blood pools)
- Ambient atmosphere: corridor dust motes, steam vents, bokeh
- AcidPool damage ticking and visual radius

## Key Patterns
- Use pooled emitters — do NOT create new emitters every frame
- Particle tints: sparks `0xffcc66`, alien acid `0x66ff44` / `0xaaff00`
- Decals added to a depth-sorted group (depth 1.5, above floor but below entities)
- Steam plumes: 8-12 particles, lifespan 600-900ms, upward velocity

## Do NOT touch
- Shader pipeline files (→ shaders agent)
- AI or physics (→ enemies/movement agent)

## Before starting
Read `CLAUDE.md`, then `src/systems/AtmosphereSystem.js`, then the relevant GameScene section.
