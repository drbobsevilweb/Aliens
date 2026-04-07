# Agent: SHADERS
Specialist in WebGL post-FX pipelines, lighting, and visual atmosphere.

## Domain
- `src/lighting/LightingOverlay.js`
- `src/lighting/Raycaster.js`
- `src/lighting/LightBlockerGrid.js`
- `src/scenes/GameScene.js` post-FX control paths (`initScanline`, `initTiltShift`, adaptive post-FX updates)

## Responsibilities
- Post-FX control logic and graceful fallback behavior in GameScene
- Torch/light cone rendering in LightingOverlay
- Raycaster shadow polygon generation
- Cinematic parameters: halation, exposure, bleach bypass, scanline intensity
- Vignette, bloom, lens flare effects

## Key Patterns
- Some post-FX hooks remain in GameScene even though standalone shader pipeline files were removed
- Keep fallback overlays and runtime-driven visual tuning working when shader instances are absent
- LightBlockerGrid is a spatial index — keep updates O(changed tiles) not O(all tiles)
- Dark vignette is kept even when other shaders are disabled — do NOT remove it
- Cinematic values read from `runtimeSettings` live each frame

## Do NOT touch
- Sprite art, animation (→ graphics agent)
- Game logic, physics (→ movement/enemies agent)
- `Phaser.Scale.FIT` in `src/main.js` — intentional letterbox, never change

## Before starting
Read `CLAUDE.md`, then the scene/lighting file you're editing.
Check `src/settings/runtimeSettings.js` for live-tunable uniforms.
Run `node --check <file>` after any JS edit.
