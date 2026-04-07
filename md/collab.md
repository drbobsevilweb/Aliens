# Collaboration Notes

Shared findings and cross-model coordination notes. Keep this focused on actionable coordination, not full history.

## Current Notes

### 2026-04-06 — Markdown/prompt alignment cleanup

- Canonical doc split was tightened again:
  - `README.md` stays the public quick-start surface
  - `md/WORKFLOW.md`, `md/handoff.md`, `md/collab.md`, and `md/progress.md` remain the operational truth
  - `prompts/` is now explicitly referenced as the active editor-spec surface
- Updated high-drift docs to match the live modular editor and runtime state:
  - `CLAUDE.md` now reflects the 8-tab editor shell, current URLs, current enemy speed data, and the current backlog
  - `docs/gameplay-reference.md` now matches the current door/menu wording, tracker range, enemy stat table, and wave/spawn summary more closely
  - added `prompts/hud-editor.md` so the live HUD tab finally has a dedicated prompt/spec companion
- Historical-but-useful HUD research docs were kept, but clearly labeled as background rather than live implementation truth
- Prompt cleanup note:
  - removed stale backup `prompts/mapeditor.md.save`
- Historical doc cleanup note:
  - moved superseded root/docs planning files into `md/archive/2026-04-doc-cleanup/`
  - the active `md/` surface is now intentionally small: `WORKFLOW.md`, `handoff.md`, `collab.md`, `progress.md`, and the still-active `plan-node-editor.md`

### 2026-04-04 — Tilemap color-only testing pass

- Active map rendering is now intentionally flatter for testing and layout readability.
  - `src/scenes/BootScene.js` now builds the live `tileset` from flat procedural colors instead of re-entering imported floor/wall artwork.
  - `src/map/MapBuilder.js` no longer draws the runtime floor tileSprite background, terrain texture override images, or the old `floor_attachment` texture pass in the active path.
- Missing authored map art no longer disappears silently.
  - `src/map/MapBuilder.js` now creates square runtime placeholders for missing authored props and large textures.
  - `editors/app.js` now draws square placeholders for missing prop art and for terrain texture override markers instead of dropping them.
- Editor-side cleanup split by surface:
  - modular `/editors` tilemaps tab in `editors/tabs/tilemaps.js` now renders terrain as flat colors only and no longer exposes the old texture preview sidebar path
  - legacy `editors/app.js` tilemap canvas no longer eagerly preloads imported floor/wall art; it renders flat terrain colors and keeps texture data only as metadata/selection state
- Important scope note:
  - this pass preserves saved texture-related map metadata (`floorTextureKey`, `wallTextureKey`, `terrainTextures`, `largeTextures`) for future art restoration; only the active render path was simplified

### 2026-04-04 — Image editor SVG integration + low-risk asset cleanup

- The live modular `/editors` shell now exposes the prompt-defined Image Editor host more explicitly: the former `Sprites` tab is now labeled `Image`, and `editors/tabs/sprites.js` gained a third in-tab mode for `SVG` alongside the existing sprite browser and character assignment surfaces.
- New SVG authoring surface lives in `editors/tabs/shared/svgEditor.js` and is mounted by `editors/tabs/sprites.js` rather than added as a separate top-level product surface.
  - Native browser SVG editing only: no external library added.
  - Supports category browsing (`corpse`, `acid`, `debris`, `particles`), SVG import, polygon drawing, direct node dragging, bezier handle editing, layer ordering, marine reference overlay, configurable grid, raster preview adjustments, SVG save, and PNG export/download.
- New source-of-truth SVG asset path is now active in the Node server:
  - source SVGs save under `assets/svg/<category>/`
  - rasterized PNGs save under `assets/sprites/scaled/svg/<category>/`
  - asset CRUD flows through new `/api/svg-assets`, `/api/svg-assets/content`, `/api/svg-assets/save`, and `DELETE /api/svg-assets/:category/:filename`
- Important backend fix: `server.js` no longer truncates `data/sprite_registry.json` down to only `assignments` on POST.
  - `referenceSprite`, `characters`, and new `svgAssets` metadata now survive registry saves.
  - `/api/sprites/marine-reference` now reads the marine dimensions/path from the registry-backed scaled pipeline instead of the old hard-coded generated sprite payload.
- Low-risk duplication cleanup shipped in this same pass:
  - added shared `editors/tabs/shared/assetUtils.js`
  - `editors/tabs/texture.js` and `editors/tabs/sprites.js` now reuse shared image-loading / file-reading helpers instead of duplicating those patterns
- Validation completed in this pass:
  - `node --check server.js`
  - `node --check editors/tabs/sprites.js`
  - `node --check editors/tabs/texture.js`
  - `node --check editors/tabs/shared/svgEditor.js`
  - `node --check editors/tabs/shared/assetUtils.js`
  - temporary server on port `8193` responded correctly for:
    - `/api/svg-assets`
    - `/api/sprites/marine-reference`
    - `/api/sprites/registry`
    - save → content-read → delete round-trip on `/api/svg-assets`
- Follow-up extension in the same SVG surface now supports persisted asset-profile metadata for authored runtime uses:
  - document-level `Usage Preset` select in `editors/tabs/shared/svgEditor.js`
  - current built-in presets cover generic gibs plus `Alien Warrior Death`, `Alien Warrior Damage`, `Facehugger Death`, `Facehugger Damage`, `Egg Death`, `Egg Damage`, `Drone Death`, `Drone Damage`, `Queen Death`, `Queen Damage`, `Acid Damage To Floor`, and `Acid Splashes`
  - persisted fields are `usage`, `target`, and `notes` under `svgAssets` entries in `data/sprite_registry.json`
  - both `server.js` and `dev_server.py` now return that metadata from SVG list/content endpoints and preserve it on save
- Browser validation is now complete rather than syntax/API-only:
  - fresh Node server on `8195` passed save → reload → delete for `Acid Damage To Floor`, including browser-list label rendering and metadata persistence
  - fresh Python dev server on `8196` passed save → reload → delete for `Facehugger Damage`, confirming parity with the legacy editor backend
- Remaining caution for a future pass:
  - no gameplay runtime conversion from procedural debris/acid to authored SVG assets was attempted here; this pass establishes the authoring and persistence pipeline only

### 2026-04-03 — Spawn system redesign Phase 1 + 2 (parallel 3-agent)

- Completed via coordinated editor/map/mechanic agents in parallel; all work completed simultaneously.
- **Data structure**: Spawn points now flow as `[{ tileX, tileY, count: 2|4|6|8 }]` from editor markers through missionLayout to runtime.
- **Editor side**: Marker value 5 (alien_spawn) now has count selector UI and Tiled roundtrip support. No UI badges needed — agents left that as editor-only for Phase 1.
- **Map side**: `collectSpawnPoints()` in missionLayout.js extracts markers and reads props; spawnPoints exported from both `resolveMissionLayout()` and `buildEditorTestLayout()`. All 5 missions pre-populated with spawn points (M1 empty for Phase 2 dynamic testing).
- **Runtime side**: `spawnFromAuthoredPoints()` reads editor counts and spawns that many per point. Dynamic spawns trigger after firefight idle via CombatDirector timestamping. Both methods handle type selection and difficulty scaling.
- **Backward compat**: Existing `spawnWave()` untouched. Authored spawns only activate if spawnPoints array exists and is non-empty. Dynamic spawns work with both authored and wave-based setups.
- **Validation**: All syntax checks pass. All 4 regression specs pass (missionLayout, followerAI, enemyAI, botTelemetry). No new test failures.
- **Next steps**: Phase 3 (M1 clean setup) should create M1 with zero waves/setpieces but 3-4 authored spawn points to validate the editor→game pipeline. This can be done by a single agent or user.

### 2026-04-03 — HUD modular editor restoration

- The modular `/editors` shell was already wired to `./tabs/hud.js`, but that file was missing in the working tree. The active fix was to create the module rather than keep layering HUD work into the legacy monolith only.
- `editors/tabs/hud.js` is now the current modular HUD surface:
  - loads and saves only through `/api/hud-config`
  - exposes marine cards plus `objectivesPanel`, `mapPanel`, and `missionLog`
  - includes a popup element editor for `_subs` so inner HUD elements can be moved visually and saved back to `src/data/hudConfig.js`
- `src/ui/Minimap.js` had a panel-key mismatch (`minimapPanel` vs `mapPanel`); the runtime now reads `mapPanel`, which matches the modular HUD editor and avoids another editor/runtime split.
- Validation in this pass:
  - `node --check editors/tabs/hud.js`
  - `node --check src/ui/Minimap.js`

### 2026-03-30 — Cross-domain runtime audit follow-up

- Objective guidance is now consistent through the whole mission flow:
  - `src/systems/MissionFlow.js` no longer marks a mission complete before extraction is actually reached.
  - `src/scenes/GameScene.js` now keeps the objective marker active for cards/terminals during combat and switches it to the elevator only once extraction is ready.
- Mission-local lighting no longer gets wiped by periodic settings refresh:
  - `src/scenes/GameScene.js` now recomputes effective lighting from base runtime settings + map atmosphere + active director lighting overrides.
  - Director `set_lighting` events now write into persistent active overrides rather than mutating a transient settings snapshot.
- Hidden enemies no longer leak gameplay state as aggressively:
  - `src/systems/EnemyDetection.js` now requires observer line-of-sight before proximity reveal ramps up.
  - `getOnScreenHostileCount()` now ignores fully hidden/undetected hostiles so director/reinforcement pacing tracks what the player can actually perceive.
- Ambient music wiring is now live:
  - `src/scenes/BootScene.js` preloads `bg_colony` from `src/music/Colony.mp3`.
  - `src/scenes/GameScene.js` now initializes background music, reapplies its volume on runtime refresh, and `src/settings/runtimeSettings.js` adds `other.audioMusicVolume` to the validated settings schema.
- Validation:
  - `node --check src/scenes/GameScene.js`
  - `node --check src/systems/EnemyDetection.js`
  - `node --check src/systems/MissionFlow.js`
  - `node --check src/scenes/BootScene.js`
  - `node --check src/settings/runtimeSettings.js`
  - `bash ./scripts/verify.sh` currently fails only at `scripts/test-pulse-rifle-timing.mjs` (`82 !== 60`), which matches the separately active pulse-rifle tuning work already claimed in `md/handoff.md`.

### 2026-03-28 — Pulse rifle trigger-held recharge gating

- `src/systems/WeaponManager.js` pulse-rifle recharge is being tightened so `pulseAmmo` only regenerates while the trigger is released.
- Intended behavior after this change:
  - sustained fire drains from 99 toward 0 with no simultaneous refill while held
  - hitting 0 still starts the existing 2000ms overheat lockout
  - continuing to hold the trigger after overheat no longer refills ammo; the player must release before recovery begins
- `src/ui/HUD.js` is also being tuned to communicate that state better:
  - pulse-rifle digits flare brighter red/orange while actively firing
  - low-ammo pulsing now targets `15` rounds instead of the older broader warning band
  - leader overheat state shows `REL` while the trigger is still held so the cooldown requirement is explicit
- Validation target:
  - `node --check src/systems/WeaponManager.js`
  - `node --check src/ui/HUD.js`

### 2026-03-20 — HUD-local interference overlays

- Marine-card interference in `src/ui/HUD.js` remains card-local; the interrupt video is still attached to each HUD card container rather than the main game scene.
- `src/ui/Minimap.js` no longer runs a constant additive `interference_video` layer over the map card. It now uses `interrupt_video` as a local minimap-only overlay with randomized fade-in/fade-out bursts.
- `src/ui/ObjectivesPanel.js` still uses a localized interference overlay, but it now suppresses that glitch pass while the objectives panel is hidden so the effect only appears on the visible objectives surface.
- Validation:
  - VS Code Problems check on `src/ui/Minimap.js`
  - VS Code Problems check on `src/ui/ObjectivesPanel.js`
  - `node --check src/ui/Minimap.js`
  - `node --check src/ui/ObjectivesPanel.js`
  - `node --check src/ui/HUD.js`
  - `node --check src/ui/MotionTracker.js`

### 2026-03-20 — HUD editor/runtime fidelity pass

- `src/ui/HUD.js` now reads editor-authored card sub-element overrides from mission-package `hudConfig._subs` for the marine-card video feed, name/ammo/hp readouts, magazine count, EKG graph, action bar, HEAL button, weapon label, and overheat bar.
- Runtime card updates now preserve configurable video tint, readout alpha/color baselines, action-bar geometry, and overheat geometry instead of falling back to hard-coded card internals for most states.
- `editors/app.js` now exposes the missing `mag` sub-element, previews it on the HUD canvas, aligns the default video/button preview values more closely with runtime, and removes the forced 10px snap so parent HUD elements can be nudged and resized at 1px precision.
- Validation:
  - VS Code Problems check on `src/ui/HUD.js`
  - VS Code Problems check on `editors/app.js`
  - `node scripts/test_editor_runtime_fidelity.mjs`

### 2026-03-20 — Shader precision and post-FX fallback alignment

- The washed-out/blurred render path was partly caused by fallback drift inside `src/scenes/GameScene.js`: several post-FX init/update paths were using stronger hard-coded values than `DEFAULT_RUNTIME_SETTINGS.graphics`.
- `src/scenes/GameScene.js` now uses `DEFAULT_RUNTIME_SETTINGS.graphics` as the single fallback source for AlienTone, TiltShift, and Scanline init/update code, including adaptive post-FX.
- `src/graphics/AlienTonePipeline.js`, `src/graphics/TiltShiftPipeline.js`, and `src/graphics/ScanlinePipeline.js` now request `highp` fragment precision when the device supports it and fall back to `mediump` otherwise.
- `src/graphics/ScanlinePipeline.js` class defaults were also aligned with runtime defaults so the pipeline no longer comes up softer/lighter than the saved graphics profile before settings application.
- Validation:
  - `node --check src/scenes/GameScene.js`
  - `node --check src/graphics/AlienTonePipeline.js`
  - `node --check src/graphics/TiltShiftPipeline.js`
  - `node --check src/graphics/ScanlinePipeline.js`

### 2026-03-20 — Torch brightness and HUD firing readout tweak

- Marine torch output was reduced at the light-source and overlay stages, not just by lowering one halo alpha. This keeps the beam, soft glow, and endpoint hotspot in balance instead of leaving one piece visually over-bright.
- `src/scenes/GameScene.js` now emits slightly lower base torch intensity for marine light sources.
- `src/lighting/LightingOverlay.js` now tones down torch-specific cone, halo, and endpoint multipliers so the net result is about a 20% perceived brightness reduction without flattening weapon muzzle flashes or alarm lights.
- `src/ui/HUD.js` now gives the ammo counter a warmer, brighter glow while a marine is actively firing, without changing the separate low-ammo warning flash logic.
- Validation:
  - `node --check src/scenes/GameScene.js`
  - `node --check src/lighting/LightingOverlay.js`
  - `node --check src/ui/HUD.js`

### 2026-03-15 — Map tile editor QoL + feature-sweep bot

- The tilemap editor now has a broader automation safety net and a few missing authoring shortcuts in `editors/app.js`.
- QoL additions shipped in the tilemap surface:
  - `Ctrl/Cmd+D` duplicates the selected authored object and keeps the duplicate selected
  - `R` rotates the selected prop or active prop brush by 90°
  - `Shift+Arrow` performs 5-tile nudges for faster layout work
  - numeric layer hotkeys `1-8` switch directly between the preset layer strip entries
  - `Mirror Y` complements the existing horizontal mirror action
  - shortcut hints are now visible in the tilemap workspace
- Added `scripts/test_map_tile_editor_bot.mjs` as a Playwright feature sweep covering:
  - clone / expand / mirror / delete map management on a throwaway copy
  - terrain paint/erase, door paint, marker coverage, prop move/duplicate/rotate/nudge, light placement, texture overrides, story placement
  - package save verification and in-game runtime consistency against `window.__ALIENS_DEBUG_SCENE__`
- Important testing note:
  - the duplicated-prop assertion initially failed because the new fast-nudge behavior moves by 5 tiles with `Shift+Arrow`; the bot expectation was corrected to match the intended editor behavior rather than weakening the shortcut feature.
- Legacy regression hardening:
  - `scripts/test_editor_object_roundtrip.mjs` now uses the current tilemap keyboard workflow and reopens collapsible tilemap sections before interacting with layer-specific controls.
- Validation:
  - `node scripts/test_map_tile_editor_bot.mjs`
  - `node scripts/test_editor_publish.mjs`
  - `node scripts/test_editor_object_roundtrip.mjs`
  - `node scripts/test_editor_runtime_fidelity.mjs`

### 2026-03-15 — Runtime audit remediation pass

- Combat occlusion regression is fixed and the official combat harness passes again.
  - Root cause was not just projectile-state occlusion; damage still leaked through because the enemy overlap path could resolve after projectile movement without a definitive shooter-to-target blocker check.
  - Current fix layers three protections:
    - stronger tile/path-grid fallback in the local projectile blocker probe in `src/scenes/GameScene.js`
    - stronger fallback in shared LOS checks via `src/systems/EnemyDetection.js`
    - direct shooter-to-target blocker validation in the bullet/enemy and bullet/egg overlap handlers in `src/scenes/GameScene.js`
- Mission package/runtime mismatches fixed in `src/settings/missionPackageRuntime.js`:
  - marker normalization now preserves values `7` and `8` so package-authored vent and egg markers survive into gameplay
  - unresolved mission map IDs no longer silently hijack a mission by falling back to `maps[0]`
  - runtime director-event projection now preserves `enabled`, `chance`, `cooldownMs`, `repeatMs`, and `maxFires`
  - malformed story points without numeric coordinates are filtered instead of collapsing to tile `(0,0)`
- Mission wave generation now preserves authored spawn counts by expanding count-bearing spawn markers into slot keys in `src/map/missionLayout.js`; this keeps designer-authored 2/4/6/8-count spawn points meaningful in wave generation.
- Door/mechanics fixes:
  - `TeamLeader` now implements `moveTowardRigid`, removing the door-sync crash path during leader lock actions
  - welded locked doors now restore to `locked` on unweld instead of silently downgrading to `closed`
  - queen-style `canBreachAnyDoor` enemies can now actually damage locked and welded doors
- Gameplay/input fixes:
  - tracker audio is now gated to active tracker scan time only; no passive proximity intel leak
  - redundant HUD button dispatch path was removed from `InputHandler`, leaving the Phaser-owned interactive buttons as the single source of click handling
  - dynamic, vent, gunfire, and director-pack hostile spawns are now gated during extract so extraction behaves as a terminal safe phase
- Regression coverage added to `scripts/test-mission-layout.mjs` for:
  - package markers `7` and `8`
  - authored spawn-count expansion
  - package map-selection fallback behavior
  - director-event control-field projection
- Validation:
  - `node scripts/test-mission-layout.mjs`
  - `node scripts/verify_combat.mjs`
  - `bash ./scripts/verify.sh`

### 2026-03-13 — Editor runtime fidelity + surface refresh

- The previous "save/publish is broken" symptom was partly a rendering-authority problem, not a persistence problem.
- `scripts/test_editor_publish.mjs` already proved `Save All` writes a package and the game loads `PACKAGE`, but the runtime still dropped or overrode authored map details:
  - `src/scenes/GameScene.js` passed only terrain/doors/size into `MapBuilder`, so editor-authored texture overrides and props were not part of the built scene.
  - `src/scenes/GameScene.js` also always injected procedural room props, so authored layouts were not a true reflection of the editor even when the package loaded.
  - `src/settings/missionPackageRuntime.js` was stripping `atmosphere` and `largeTextures` from package-backed maps.
- Current fix:
  - authored `props`, `terrainTextures`, and `largeTextures` now flow into the runtime build path
  - authored props register into `roomProps` and path blocking
  - procedural room props are skipped when a map already has authored props
  - package-backed maps now preserve `atmosphere` and `largeTextures`
- Regression coverage now includes `scripts/test_editor_runtime_fidelity.mjs`, which asserts package-backed runtime rendering for:
  - authored prop presence
  - terrain texture override presence
  - large texture presence
  - atmosphere override preservation
- Editor surface refresh:
  - `editors/index.html` and `editors/styles.css` were restyled into a clearer authoring console with stronger nav/header hierarchy, better pill/tab affordances, and higher separation between control rail and workspace.
  - Latest visual checkpoint: `output/editor-tilemap-tab.png`.
- Editor interaction pass on top of that:
  - `editors/app.js` now supports drag-moving authored props, lights, and marker-based spawn/extract points in Select mode.
  - Added a left-rail layer preset strip for `Floor`, `Walls`, `Doors`, `Spawn Points`, `Props`, `Lights`, `Story`, and `Textures`.
  - Added a proper layer manager with per-layer show/hide and lock/edit toggles.
  - Added keyboard nudging for selected authored objects/markers.
  - Added `storyPoints` as editor-saved map annotations with title/kind/mission/note fields and visible map overlay markers.
  - Important scope note: `storyPoints` are currently editor-only metadata. They save in editor state, but are not yet published into the runtime mission package/story system.
- Playwright verification:
  - `scripts/test_editor_object_roundtrip.mjs` now places a prop, drags it, places a light, places a story point, saves, opens the game, and verifies the prop + light render from `PACKAGE`.

### 2026-03-13 — Mission GUI authoring pass

- The missions surface no longer needs raw JSON as the primary editor for event/cue authoring.
- `editors/app.js` now renders:
  - structured event-node cards
  - structured audio-cue cards
  - card add/clone/delete/reorder controls
  - drag-reorder for nodes/cues
  - a story-point reference board that links mission planning back to map-authored story annotations
- `storyPoints` now survive package build/normalize/runtime fallback, but they are still not consumed by gameplay systems yet.
- Current gap after this pass:
  - The editor now behaves more like a proper mission GUI, but it is still card/list based, not a full graph-canvas node editor with connectors.
  - If someone continues this area, the next major step is a real trigger/action graph view rather than more form expansion.

### 2026-03-11 — HUD action-button verification

- The left-rail HUD buttons were relying on a separate scene-level geometry pass even though the underlying Phaser button objects were already interactive.
- `src/ui/HUD.js` now binds button actions directly on the button rectangles and keeps `uiBlockWorldInput` on those objects; `src/systems/InputHandler.js` continues to reject world clicks when those HUD objects are hit.
- Live Playwright verification on `http://127.0.0.1:8192/game?renderer=canvas&mission=m1`:
  - `output/skill-track-long/shot-0.png` shows the TRACK action resolving to the on-screen `Still quiet.` result after the full channel window.
  - `output/skill-heal-pass/state-0.json` confirms the HEAL button path completes without leaking movement input into the world click path.
- Remaining follow-up if someone continues this area: tighten `render_game_to_text` vs HUD parity during long combat captures, because the heal pass showed a screenshot/state timing mismatch that should be reviewed before relying on either surface for deeper automation.

### 2026-03-12 — HUD font/visibility updates

- Added the SIL/OFL DSEG7 Classic font under `assets/fonts/DSEG7Classic-Regular.ttf` and declared it as the `Alarm` font in `game/index.html` so the new HUD digits keep their familiar seven-segment look.
- Brightened the video feeds by increasing their alpha and reducing the tint shade, then widened the follower cards so their HEAL/TRACK buttons sit to the right of the footage with larger hit areas.
- Validation: `output/skill-visibility-pass/shot-0.png` confirms the new visibility/interaction layout renders with no runtime errors.

### 2026-03-11 — Baseline restore checkpoint

- Recovery was split in parallel across three tracks:
  - uploaded baseline diff against current workspace
  - runtime/browser error validation
  - render, lighting, and sprite stack comparison
- The uploaded `/home/drevilbob/Aliens/Aliens.zip` is now the clean restore source for visual/runtime recovery work.
- Restoring the core visual/runtime files from that zip brought the game back to a visible state.
- Fresh direct browser screenshots after the restore are:
  - `output/recovery-direct-page.png`
  - `output/recovery-direct-canvas.png`
- These should be treated as the current checkpoint before any new shader or lighting experiments.

### 2026-03-10 — Documentation audit

- Canonical operational docs are now `README.md` plus the files under `md/`.
- `md/handoff.md` and `md/collab.md` had accumulated stale completed-session history and were no longer usable as live coordination surfaces.
- Root-level `CLAUDE.md` and `agent_prompts.md` still matter for external agent entry points, but they must defer to `md/WORKFLOW.md` and `md/handoff.md`.
- `CODEBASE_REPORT.md` was unreferenced and stale as an operational document. It was removed after checking repo references.
- `docs/skills/*.md` was an older duplicate prompt set superseded by `.claude/agents/`. It was removed after checking repo references.

### 2026-03-10 — HUD visual clarification

- `images/mockup.png` is now the explicit HUD composition reference for marine cards.
- The intended HUD layout is left-edge and portrait-dominant. Bottom-docked squad cards are the wrong model.
- Gameplay and graphics prompt docs were updated to describe the panel as a single diegetic monitor slab with portrait, vitals, ammo, and bottom command buttons integrated into one frame.

### 2026-03-10 — HUD graphics pass follow-up

- `src/ui/HUD.js` was pushed toward the intended left-edge diegetic slab layout; the old bottom-row card composition should no longer be treated as the target.
- `src/ui/MotionTracker.js` and `src/ui/ObjectivesPanel.js` were also pulled into the same monitor/slab family so HUD-adjacent UI now shares a more coherent visual language.
- Playwright-managed Chromium capture works in this environment and should be preferred for visual validation over the earlier black-frame path.
- `src/systems/CommanderSystem.js` overlay was moved out of the left HUD rail so it no longer sits on top of the first marine slab.
- The latest mockup-based HUD rebuild is the current visual reference; avoid returning to earlier multi-card layouts and keep future additions inside that single-slab composition.
- After live review, the better HUD direction was to reconstruct from `images/mockup.png` as a composition template rather than keep inventing new panel geometry. The primary slab now follows that route more closely.

### 2026-03-10 — Role-based session naming

- Coordination docs now use role-first names such as `Coding AI`, `Graphics AI`, and `Shaders AI`.
- Model identity is secondary metadata, and session labels distinguish parallel runs of the same model.
- Current example: two concurrent Codex sessions are tracked separately as `Coding AI` and `Graphics AI`.

### 2026-03-11 — Near-limit session handoff

- Current Codex session is close to limit and should hand off cleanly rather than accumulate more mixed-scope notes.
- Best next owner task is still the HUD visual pass in `src/ui/HUD.js`, using `images/mockup.png` and live screenshots as the reference loop.
- Acid hit splatter was increased recently and is stable by syntax/runtime checks, but it has not yet had a dedicated staged visual tuning pass with guaranteed on-screen alien-hit captures.

### 2026-03-11 — HUD and Mechanics pass

- HUD was rebuilt with a 500px wide layout and video-background marine cards at 60% opacity.
- Door delegation now prioritizes followers; TL movement is locked during lock actions.
- Action durations were increased significantly (5-10s) to increase tension.
- Alien spacing was hardened (64px melee bounce, 48px hard push) to prevent visual overlaps.
- **Bug Fix**: A `TypeError` was resolved in `EnemyManager.js` where `this.manager.getActiveEnemies()` was incorrectly used in `applyAlienMarineHardPush` (should have been `this.getActiveEnemies()`). This had broken the combat regression harness.

### 2026-03-11 — HUD/runtime repair follow-up

- `src/ui/HUD.js` was crashing on scene startup because it read `scene.marineAmmo.get(...)` before any ammo map existed.
- `src/scenes/GameScene.js` now owns follower pulse-rifle ammo state again (`marineAmmo` map, reload timers, magazine depletion), which fixes the missing reload path and prevents followers from firing forever.
- Pulse-rifle magazine pickups are live again in the scene overlap path and now replenish follower magazine reserves instead of being silently routed into the leader's unlimited weapon state.
- HUD cards were compressed toward the proportions in `images/mockup2.png` and now include a green vitals bar, tighter spacing, and a lower stack start to avoid the top-left wave strip.
- `dev_server.py` now sends unconditional no-cache headers so HUD/media/layout changes stop getting masked by stale browser assets during iteration.
- Workflow rule added: every session that stops must update the relevant `md/` files before handing off.

### 2026-03-11 — Regression rollback after live breakage report

- `SquadSystem.applyFollowerSeparation()` was calling a non-existent sprite method (`resolveWalkablePosition`); it now uses `SquadSystem.findNearestWalkableWorld(...)`, which removes the runtime crash reported from `SquadSystem.js:658`.
- The oversized team leader came from double-scaling: `TeamLeader` normalized the sprite footprint, then `GameScene.create()` scaled it again. The extra scale override was removed, and `TeamLeader`'s normalization was reduced to the original gameplay footprint.
- The scene-wide brightness spike tracked to the expanded `AlienTonePipeline`; that pass was rolled back to the earlier restrained grade so the frame stops bleaching out.
- HUD portrait video was being forced into a short rectangle and visibly squashed in Y. `src/ui/HUD.js` now uses a crop-first approach instead of simple full-rect scaling.
- Live screenshot after the rollback is `output/regression-fix-check/shot-0.png`; runtime is stable, but HUD polish and any remaining door-behavior tuning still need a dedicated pass.

### 2026-03-11 — Visibility triage result

- Multiple Playwright captures (`output/visibility-pass*`) showed that the game is still visually hard to read even after reducing runtime lighting defaults, capping overlay darkness, lowering overlay alpha, flattening the atmosphere vignette, and disabling the camera AlienTone pass.
- That points to a deeper render/look issue than a single darkness value: likely the base scene/map presentation or some other camera/render layer, not just `LightingOverlay`.
- Current state: the reported crash is fixed and the game loads, but scene readability is still poor. Next pass should audit the base map/floor/wall render path with screenshots instead of continuing to tweak darkness constants.

### 2026-03-11 — Lighting revert request

- Reverted the lighting/render changes from the visibility-triage pass so the branch is back on its prior lighting stack (`LightingOverlay`, runtime lighting defaults, `AlienTone`, atmosphere vignette).
- The team leader scale was also bumped back up from the undersized rollback state.
- Fresh screenshot after the revert is `output/revert-lighting-check/shot-0.png`; if this is still wrong, the problem predates the triage edits and sits deeper in the current branch state.

### 2026-03-11 — Base-art readability finding

- The dark unreadable scene was not primarily fixed by lighting/shader reverts. The meaningful improvement came from `BootScene.generateTileset()`.
- The imported/custom floor path and dense generated floor art were making the world read like a dark scanline slab. Forcing a simpler generated tileset restored visible scene structure while leaving the lighting stack intact.
- Current proof screenshot is `output/readable-tileset-check/shot-0.png`.

### 2026-03-11 — Editor audit

- The editor is strongest in the tilemap/Tiled round-trip area:
  - canonical Tiled sync
  - drift status
  - topology validation
  - layer reset
  - props / texture override support
  - package publish / validation / diff history
- The biggest product gap is now mission logic authoring ergonomics:
  - `directorEvents` and `audioCues` still depend on raw JSON textareas
  - snippet insertion exists, but there is no real structured trigger/action builder yet
  - this is likely the next highest-value editor improvement if the editor becomes the main content surface
- Future editor work should treat `editors/` as first-class and bias toward structured authoring, validation visibility, and recovery workflows.

### 2026-03-12 — User playtesting feedback (v2.0 branch)

- Historical backlog captured in `md/archive/2026-04-doc-cleanup/plan-v2-feedback.md` (13 items).
- **Critical finding**: Maps edited in the browser editor are NOT reflected in the game. M1 in editor ≠ M1 in-game. Root cause unclear — may be cache, pipeline, or tiledMaps.generated.js staleness.
- **Infrastructure asks**: Port 8192 should auto-redirect `/` → `/game`; shared nav menu across all screens (game, editors, settings).
- **Spawn system redesign**: Editor-authored spawn points should define alien counts (2/4/6/8 per point). Random spawns remain separate, driven by CombatDirector tension (time since last firefight).
- **M1 setup**: Create M1 as a clean map first — no alien events or spawns — to validate editor→game pipeline before layering combat.
- **Audio**: Motion tracker volume still ~50% too loud. Pulse rifle is fine.
- **Alien behavior**: Aliens should rush-and-retreat (swiping), not crowd marines. Need gradual fade-in (no pop-in within 1-3 tiles). Facehuggers need chaotic leap-from-2-tiles + flee behavior.
- **Marine AI**: Followers too slow to detect and respond to aliens/facehuggers.
- **Video optimization**: Reduce portrait video color depth via ffmpeg for memory savings + CRT authenticity.

## Open Coordination Risks

- Runtime/source ownership is currently unknown because prior handoff entries were historical rather than active.
- Some historical notes in `md/progress.md` still mention older doc locations or prior workflows. They are retained as history, not instructions.
- The remaining docs under `docs/` appear to be reference material, not canonical workflow docs.

## Usage Rule

Add only:

- shared findings another session needs
- risks that affect coordination
- concise recommendations for the next owner
