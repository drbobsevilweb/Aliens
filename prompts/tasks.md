# Editor Overhaul Tasks

> **Historical snapshot:** most items below are already complete. Use `prompts/*.md` for current editor specs and `md/handoff.md` for live status.

## Documentation Updates
- [x] Rename `texture-editor.md` to `image-editor.md` — full rewrite with reference/scaled pipeline, registry, grid overlay, character animation propagation
- [x] Update `map-editor.md` — color-only tiles, right sidebar texture picker, Image Editor references
- [x] Update `story-mission-editor.md` — cross-references from Texture Editor to Image Editor
- [x] Update `sound-editor.md` — cross-references updated
- [x] Update `CLAUDE.md` — architecture, editor tabs, sprite pipeline, removed scaling code
- [x] Update memory files — new pipeline decisions, sprite_pipeline.md created

## Sprite Pipeline Setup
- [x] Create `/assets/sprites/reference/marine/marine_topdown.png` (copy original)
- [x] Create `/assets/sprites/reference/alien_warrior/alien_warrior_idle.png` (extract from strip)
- [x] Create `/assets/sprites/scaled/` copies (initially identical to reference)
- [x] Create initial `data/sprite_registry.json`
- [x] Delete unused textures from `src/graphics/generated/` (only marine_topdown_256 remains)
- [x] Delete unused textures from `src/graphics/imported/` (empty)
- [x] Delete tile textures from `assets/corridor_tiles/`
- [x] Delete obsolete `tl_dirs_udlr_64_sheet.png` spritesheet

## Game Engine — Remove Code-Driven Scaling
- [x] Remove `LEADER_SIZE` sprite scaling from `TeamLeader.js` — physics body now ~80% of sprite
- [x] Remove `marineSpriteScale` from `runtimeSettings.js`
- [x] Remove scale logic from `MarineFollower.js`
- [x] Remove scale logic from `GameScene.js`
- [x] Remove spritesheet loading from `BootScene.js` (marine_leader, marine_team_leader, walk sheets)
- [x] Update sprite loading to read from `/assets/sprites/scaled/`
- [x] Physics body derived from sprite pixel dimensions
- [x] Remove `alienSpriteScale` from `EnemySpawner.js`

## Sprite/Image Editor Updates
- [x] Add configurable grid overlay (Off, 8px–1024px) to sprite preview
- [x] Save updates sprite registry with new dimensions
- [x] Marine reference reloaded from registry after save
- [ ] Character animation propagation on resize (scale siblings proportionally) — future
- [ ] Reset button (re-copy from reference/) — future
- [ ] Sprite editor category dropdown updated for new pipeline

## Tilemap Editor Updates
- [x] Fix `categorize_sprite()` — split `tile` into `floor`/`wall` categories
- [x] Move texture picker to right sidebar (visible when paint/fill on terrain)
- [x] Color-only fallback works (no texture PNGs, plain colors render)
- [x] Sprite editor category dropdown updated (floor/wall instead of tile)

## Tint Removal
- [x] Remove follower role tints (`tech`, `medic`, `heavy` color overlays)
- [x] Remove follower damage flash tint
- [x] Remove alien `baseTint` / `getBaseTint()` per-type coloring
- [x] Remove alien hit flash (`setTintFill(0xffffff)`)
- [x] Remove alien corpse tint (`0x304028`)
- [x] Remove egg tints (open/spent/damage states)

## API / Backend Updates
- [x] Update `/api/sprites/marine-reference` to read from registry
- [x] Add `/assets/sprites/scaled/` directory serving via ASSETS_DIRS
- [x] Update `dev_server.py` scan paths for new asset structure

## Future — Image Editor Enhancements
- [ ] Brightness/Contrast/Color overlay panel (per-sprite, baked into PNG on save)
- [ ] SVG sub-editor — see `prompts/svg-editor.md` for full spec
- [ ] `/assets/svg/` directory structure (corpse, acid, debris, particles)
- [ ] Character animation propagation on resize (scale siblings proportionally)
- [ ] Reset button (re-copy from reference/)
