# CLAUDE.md

Project entry point for Claude and external coding agents working on the Aliens tactical shooter.

## Project Summary

Top-down squad tactical shooter built with **Phaser 3**, vanilla ES modules, no bundler. Colonial Marines aesthetic — CRT HUD panels, procedural audio, raycasted lighting, wave-based alien combat with a CombatDirector tension curve (build → peak → release). Includes a full browser-based mission/map editor for codeless game creation.

## Quick Start

```bash
# Shared workspace service commonly runs on port 8192
# Manual dev start:
python3 dev_server.py --port 8000

# Verify project health (syntax, specs, combat regression, Tiled sync):
bash ./scripts/verify.sh

# Tiled map pipeline:
npm run build:tiled
```

**URLs:** `/game`, `/game?mission=m1`..`m5`, `/game?mission=m1&noaliens` (clean map test), `/editors`, `/settings`, `/sound`, `/gameplan`, `/plan` (legacy alias)

## Read Before Working

1. `md/handoff.md` — active ownership, do-not-touch areas (CHECK FIRST)
2. `md/WORKFLOW.md` — coordination rules, role-first naming, doc hygiene
3. `md/collab.md` — shared findings, cross-agent coordination risks
4. `md/progress.md` — historical log (read only when you need context)

## Architecture Overview

```
src/scenes/     BootScene (procedural textures, preload) → GameScene (main loop, live runtime systems)
src/entities/   TeamLeader, MarineFollower, AlienEnemy, AlienEgg,
                Door, DoorManager, Bullet, BulletPool,
                AcidPool, AcidProjectile
src/systems/    CombatDirector, EnemyManager, EnemyMovement, EnemySpawner, EnemyDetection,
                EnemyTargeting, MovementSystem, InputHandler, WeaponManager, SquadSystem,
                MissionFlow, DoorActionSystem, AtmosphereSystem, ReinforcementSystem,
                FollowerCombatSystem, CommanderSystem, ObjectiveSystem, SetpieceSystem,
                TargetingSystem, SectorMapper, StageFlow
src/lighting/   LightingOverlay (RenderTexture multiply), Raycaster, LightBlockerGrid
src/graphics/   AlienCorpseDebris (body part gibs + abstract fragments), TailComponent
src/ui/         HUD, MotionTracker, ContextMenu, ControlsOverlay, DebugOverlay,
                ObjectivesPanel, MissionLog, ProgressBar
src/audio/      SfxEngine (Web Audio API — procedural tones, noise, filters, samples)
src/data/       weaponData (3), enemyData (5 types), missionData (5 missions),
                pickupData, tilemapTemplates, tiledMaps.generated
src/map/        MapBuilder, missionLayout, AutoTile, doorData, mapData
src/pathfinding/ AStar, PathPlanner, PathGrid, EasyStarAdapter
src/settings/   runtimeSettings, missionPackageRuntime, campaignProgress
editors/        Browser editor (8 tabs) + backend validators
scripts/        verify.sh, Tiled export/import/generate, Playwright test suites
```

### Game Data

- **Weapons (3)**: `pulseRifle` (unlimited ammo, overheat system), `shotgun` (limited, 5 pellets), `pistol` (limited)
- **Enemy types (5)**: `warrior` (98 speed, 34 HP, melee), `drone` (120 speed, 44 HP, vents, opens doors), `facehugger` (100 speed, 24 HP, leap+latch), `queenLesser` (120 speed, 82 HP), `queen` (125 speed, 132 HP, breaches any door)
- **Missions (5)**: m1 Cargo Concourse (24 budget) → m5 Docking Ring (56 budget), each with setpiece events, pressure gates, directives

### Editor (8 tabs)

| Tab | Purpose |
|-----|---------|
| Image | Sole authority on sprite/texture sizing plus the embedded SVG authoring mode. See `prompts/image-editor.md` and `prompts/svg-editor.md` |
| Tile Maps | Full map editor — terrain, doors, authored spawns, props, lights, story points, and texture metadata. See `prompts/map-editor.md` |
| Missions | Mission package authoring — structured event cards, audio cues, and mission system toggles. See `prompts/story-mission-editor.md` |
| Sound | Audio asset prep, preview, trimming, FX, and save/export flows. See `prompts/sound-editor.md` |
| HUD | Drag-and-drop HUD layout and sub-element styling for cards, objectives, map panel, and mission log. See `prompts/hud-editor.md` |
| Texture | Shared texture/asset browsing and preparation utilities for the editor shell |
| Actions | Node/action graph authoring surface for story/event wiring and the node-editor migration |
| SVG Actions | SVG-driven action and asset workflows for effect authoring |

The editor publishes mission packages to localStorage; the game reads them via `missionPackageRuntime.js`. The newest editor planning/docs live under `prompts/`. 

### Sprite Pipeline

```
/assets/sprites/reference/<character>/   <- untouched originals, never modified
/assets/sprites/scaled/<character>/      <- editor output, game reads exclusively from here
data/sprite_registry.json               <- dimensions + reference sprite metadata
```

- **Image Editor is the sole authority on sprite sizing.** No game code may call `setScale()` on sprites (except HUD).
- Game renders sprites at 1:1 pixel size from `/assets/sprites/scaled/`.
- Physics body derived from sprite registry dimensions.
- Marine (Team Leader) is the baseline reference — all sprites compared against it.
- Scaling one character animation propagates to all sibling animations.
- Reset re-copies from `reference/` to start over.

### Settings Page (9 tabs)

Marines, Enemies, Objects, Walls, Other, Game, Map Tile, Scripting, Sprite & Animate. All changes apply via `runtimeSettings` (localStorage) — no game restart needed.

## Key Technical Facts

- **Textures**: Procedurally generated in BootScene via canvas. Sprites loaded from `/assets/sprites/scaled/` at 1:1 pixel size (no code-driven scaling). `marine_sheet.png` is OBSOLETE — marine uses single `marine_topdown.png` image that rotates
- **Depth**: Floor decals 2-3, corpse debris 4.5, followers 9+y-sort, leader 9.5+y-sort, aliens 10+y-sort, HUD 200+
- **Lighting**: RenderTexture with MULTIPLY blend, ambient darkness default 0.72, raycasted torch cones, LightBlockerGrid for wall occlusion
- **Physics**: Static bodies for doors/walls, dynamic for player/bullets/aliens
- **Controls**: LMB = move/target/menus, RMB (hold) = fire, mouse wheel = cycle weapon
- **Settings**: `runtimeSettings` reads from localStorage each frame — no restart needed
- **Doors**: DoorGroup state machine (closed/open/locked/welded/destroyed), hover/click context menu flow, door crumple FX, follower door delegation with TL lock
- **Pathfinding**: Binary walkable grid from wall layer; doors default walkable, must `setWalkable(false)` on creation
- **Alien AI**: 4 warrior intents (assault/flank/probe/retreat), rush-and-swipe melee oscillation, facehugger leap/flee/teleport-flank, drone vent ambush, gradual fade-in ramp, 8-second corpse fade-out with body part debris
- **Follower AI**: Diamond formation, stuck detection with 3s hard-warp failsafe, micro-patrol idle movement, door bypass at 8 angles × 2 radii, coverage rotation sweep
- **Acid system**: Hit blood, SVG splatters, kill splash, hazard pools, acid damage, spitter projectiles, wound steam/trails, 7+ runtime settings
- **Death effects**: Corpse fade-out (8s quadratic ease), body part gibs (tail/limb/crest/shard) + abstract fragments, acid splash burst, multi-pool particle system (8 pools, 1500+ sprites)
- **Audio**: SfxEngine enabled with procedural weapon/tracker sounds, 6-stage motion tracker urgency, ventilation/pipe/thump ambience, door weld loop, movie-accurate Aliens (1986) SFX

## Specialist Agent Prompts

13 agents defined in `.claude/agents/` — use the matching agent when work falls in its domain:

| Agent | File | Scope |
|-------|------|-------|
| GAMEPLAY | `.claude/agents/gameplay.md` | HUD, mission flow, settings, objectives |
| GRAPHICS | `.claude/agents/graphics.md` | Sprites, textures, spritesheets, BootScene |
| SHADERS | `.claude/agents/shaders.md` | PostFX pipelines, lighting, raycasting |
| EFFECTS | `.claude/agents/effects.md` | Particles, decals, acid/blood, atmosphere FX |
| ENEMIES | `.claude/agents/enemies.md` | Alien AI, spawning, CombatDirector |
| FRIENDLIES | `.claude/agents/friendlies.md` | Marine AI, squad behavior |
| MOVEMENT | `.claude/agents/movement.md` | Physics, pathfinding, collision |
| MECHANIC | `.claude/agents/mechanic.md` | Weapons, doors, damage rules |
| SOUND | `.claude/agents/sound.md` | Audio cues, mixing, SfxEngine |
| EDITOR | `.claude/agents/editor.md` | Browser mission editor, validation |
| MAP | `.claude/agents/map.md` | Templates, layout, Tiled pipeline |
| LOGIC | `.claude/agents/logic.md` | Schema validation, data integrity |
| CODING | `.claude/agents/coding.md` | Architecture, refactoring, tooling |

## Current Priority Backlog

Ranked by impact. Last audited 2026-04-06.

### Tier 1 — High Impact

1. **Environmental zone tiles** — Tag map areas as colony/damaged/hive with varying darkness and torch range. Editor needs zone painting support.
2. **Queen signature FX** — Queen death needs a mega-burst (acid geyser + screen shake + particle storm) instead of the standard warrior-style death pass.
3. **Door breach FX** — Queen/explosion door breach still needs debris shower + shockwave payoff.
4. **Node-graph package publishing parity** — the `Actions` tab foundation exists, but package/schema/runtime flow still needs to fully carry authored node graphs end-to-end.

### Tier 2 — Medium Impact

5. **Material impact matrix** — Bullets hitting metal/organic/acid surfaces should emit distinct sparks/splashes.
6. **Radio processing filter** — Bandpass + distortion chain for squad callout audio.
7. **Settings consolidation** — `/editors` tuning surfaces and `/settings` should cross-reference or converge more clearly.
8. **storyPoints runtime consumption** — authored story points now exist in the toolchain, but broader gameplay/system consumption still needs expansion.

### Tier 3 — Polish

9. **Corpse gibs improvement** — body parts are still mostly procedural 24×24 shapes and could benefit from richer authored variation.
10. **Texture/art restoration pass** — the color-first tilemap path is intentional for clarity, but a later art pass should restore richer authored texture previewing where useful.
11. **Prompt/doc consolidation** — keep `prompts/` as the editor-spec surface and continue trimming superseded planning notes.

### Recently Completed (removed from backlog)

- ~~Editor-authored spawn points~~ — implemented across `missionLayout.js`, the map/editor flow, and `EnemySpawner`
- ~~Phantom tracker blips~~ — CombatDirector build pressure now drives brief phantom contacts
- ~~HUD portrait video feed~~ — implemented with video-first refined layout
- ~~Enable audio system~~ — SfxEngine active, procedural + sample audio working
- ~~Ambient soundscape~~ — ventilation hum, pipe groans, distant thumps via `AtmosphereSystem`
- ~~Emergency lighting mode~~ — ambient tint driven by `CombatDirector`
- ~~Warrior flank steering~~ — `applyWarriorIntent()` fully dispatches 4 intents (assault/flank/probe/retreat)
- ~~Alien probe-and-retreat~~ — `computeProbeVelocity()` and `computeRetreatVelocity()` implemented and wired to intent system
- ~~Weld spark VFX~~ — orange-white particle burst + spark light at door position
- ~~Compass-sector wave spawning~~ — `SectorMapper` class exists and is wired into the runtime flow
- ~~Alien stuck in walls~~ — navRecover now checks walkability and tries perpendicular directions
- ~~Follower stuck forever~~ — hard warp failsafe after 3s stuck + 5 tiles from leader
- ~~Follower static turret~~ — micro-patrol idle movement every 2.5–4.5s
- ~~Alien corpse persistence~~ — 8s fade-out with body part debris (tail/limb/crest/shard)

## Visual Reference

- **HUD target**: `images/mockup.png` — left-edge CRT monitor slab per marine
- **Aesthetic bible**: `docs/aliens-aesthetic-research.md` — comprehensive palette, lighting zones, behavior patterns
- **FX research**: `docs/fx-research.md` — particle types, pipeline details, performance notes

## Guardrails

- **Ownership**: Check `md/handoff.md` before editing shared files. Claim work with role-first names (`Coding AI`, `Graphics AI`).
- **Editor bar**: Treat `editors/` as a first-class product surface. Prefer stronger authoring UX, validation clarity, and recoverability over leaving important workflows buried in JSON.
- **Verify after edits**: `node --check <file>` for syntax; `bash ./scripts/verify.sh` for full suite.
- **Do not**: Increase m1 enemyBudget above 24. Change `Phaser.Scale.FIT` in main.js. Revert Gemini's HUD/FollowerCombatSystem work. Bottom-dock the HUD cards. Remove the dark vignette.
- **Door gotcha**: Door tiles default walkable in PathGrid; must `setWalkable(false)` on creation.
- **Audio system**: Prefers samples (`SfxEngine.playSample`) but falls back to procedural tones/noise. Use `canPlay(key, minGap)` to prevent buffer saturation.
- **Motion Tracker**: 6-stage urgency (4s to 1s cadence) based on distance and contact count. 400px penalty for occluded (door-blocked) enemies.
- **Weld Sound**: `SfxEngine.playDoorWeld(true/false)` manages a looping audio state for welding/unwelding progress bars.
- **Movement gotcha**: `DoorActionSystem.update()` must run AFTER `movementSystem.update()`.
- **Sprite sizing**: Image Editor is the sole authority. Do NOT add `setScale()`, `LEADER_SIZE` scaling, or `marineSpriteScale` to sprite rendering code. Game renders from `/assets/sprites/scaled/` at 1:1. Physics body from registry.
- **Marine sprite**: Single image (`marine_topdown.png`), rotates in-game. `marine_sheet.png` is obsolete. Use `leader.facingAngle` for bullet direction.
- **Alien death flow**: `AlienEnemy.die()` → sets `isDying=true`, disables body, starts corpse fade → `EnemyManager._dyingEnemies` array handles `updateCorpse(delta)` each frame → sprite auto-cleans after 8s. `setActive(false)` is called in `die()` so all targeting checks exclude dying enemies.
- **Follower stuck recovery**: `SquadSystem` tracks `nav.warpAccumMs` — if > 3000ms stuck and > 5 tiles from leader, warps to nearest walkable tile near leader. Regular detour attempts continue in parallel for shorter stalls.
