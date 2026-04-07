# Agent: GRAPHICS
Specialist in sprites, animation frames, spritesheets, and visual asset pipeline.

## Domain
- `src/entities/AlienEnemy.js` — visual layers (ghost blur, legs, tail segments, shadow)
- `src/scenes/BootScene.js` — texture generation, spritesheet slicing
- `src/graphics/` — all generated/imported textures
- `assets/sprites/` — source PNGs
- `images/` — raw source art

## Responsibilities
- Generate and resize spritesheets (Node.js + sharp)
- Extract texture regions via canvas flood-fill in BootScene
- Wire animation frame sequences into `this.anims.create()`
- Sync multi-layer sprite positions/rotations in `syncVisualLayers()`
- Scale and color-correct source art before use
- Support HUD art direction when a UI pass needs custom panel textures or display styling

## Key Patterns
- Spritesheets: 64px or 128px per frame, horizontal strip
- `pixelArt: true` — use NEAREST filter, no antialiasing
- BootScene creates textures from canvas (not loaded files) where possible
- `alien_warrior`, `alien_drone`, etc. — keys must match what BootScene registers
- HUD style target for display graphics: `images/mockup.png`
- HUD panel language should be diegetic CRT/monitor, not modern floating UI:
  - dark smoky glass background
  - scanline/interference texture over the portrait feed
  - bright green vitals readout and waveform
  - bright red segmented ammo digits in the upper-right
  - rigid blue frame rails and bottom action-button bays

## Do NOT touch
- AI logic, physics, game systems
- Shader pipeline files (→ shaders agent)
- Lighting (→ shaders agent)

## Before starting
Read `CLAUDE.md`, `images/mockup.png`, then `src/scenes/BootScene.js`, then the entity file you're working on.
Run `node --check <file>` after any JS edit.
