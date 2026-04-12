## 2026-04-12

- Ran a coordinated 20-agent mixed audit across gameplay, friendlies, enemies, movement, mechanics, rendering, effects, audio, editor parity, node-graph parity, map fidelity, and general integration risk, then applied only the smallest cross-cutting fixes that showed up consistently across the audit.
  - `scripts/play_bot.mjs` now hardens follower snapshot collection against stale or partially cleaned-up follower references so the automation path does not fall into repeated eval-failure cascades under follower cleanup churn.
  - `src/systems/SquadSystem.js` now exports the canonical `ROLE_SCAN_SECTOR`, and `src/systems/FollowerCombatSystem.js` now reuses that role-sector map for idle sweep anchors instead of a contradictory local tech/medic/heavy map.
  - `src/scenes/GameScene.js` no longer emits the extra direct per-shot `enemyManager.notifyGunfire(...)` call; gunfire pressure and reaction continue through the remaining shared runtime paths.
  - `src/systems/MissionFlow.js` now replaces the remaining player-facing `wave` phase strings with hostile-contact wording.
  - `src/ui/MotionTracker.js` now collects cone contacts in one pass instead of chained `filter()` allocations.
- Validation:
  - `node --check src/systems/SquadSystem.js`
  - `node --check src/systems/FollowerCombatSystem.js`
  - `node --check src/scenes/GameScene.js`
  - `node --check src/systems/MissionFlow.js`
  - `node --check src/ui/MotionTracker.js`
  - `node --check scripts/play_bot.mjs`
  - `node scripts/test_motion_tracker_classification.mjs`
  - `node scripts/test_authored_spawn_runtime.mjs`
  - `node scripts/play_bot.mjs m1`
- Notable outcome:
  - the fresh M1 bot run now reports a clean victory with zero issues, but the run is currently zero-contact because stock built-in `m1` still resolves fail-closed with zero authored alien spawn points in the current repo contract.
  - `node scripts/test-follower-ai.mjs` currently fails to start in plain Node because `src/entities/MarineFollower.js` imports Phaser-dependent runtime code at module load.

## 2026-04-11

- Continued the post-research gameplay refinement with a pre-contact intel pass instead of widening the command UI.
  - `src/ui/MotionTracker.js` now classifies cone contacts as confirmed, tracked, vent, or uncertain and drives the existing count/tint readout from that state rather than treating all contacts as identical
  - `src/scenes/GameScene.js` now includes tracker classification in `renderGameToText()` and `getTrackerSignalProfile()` so bot/debug consumers can distinguish reliable contacts from phantom-style noise
  - added `scripts/test_motion_tracker_classification.mjs` as a focused headless regression for tracker state classification, and revalidated telemetry compatibility with `scripts/test-play-bot-telemetry.mjs`
- Validation:
  - `node scripts/test_motion_tracker_classification.mjs`
  - `node scripts/test-play-bot-telemetry.mjs`

- Applied the first gameplay bundle from the supervised 21-agent strategy-shooter research pass rather than another broad refactor.
  - `src/systems/CommanderSystem.js` now exposes `getDirectiveTacticalProfile(...)`, turning live commander directives into reusable tactical tuning instead of just text parsing
  - `src/scenes/GameScene.js` `updateCommandFormationDirective()` now reacts to directive mode while active, so hold/anchor tighten the squad more than split-fire and fallback pulls the squad together fastest
  - `src/systems/FollowerCombatSystem.js` now uses the live `marines.supportSuppressWindowMs` setting instead of a hardcoded 500ms support-suppress window, and assigned-lane followers react/fire slightly better on-lane than off-lane under active commander directives
  - added `scripts/test_commander_directive_tactics.mjs` and extended `scripts/test-follower-ai.mjs` to cover directive tactical profiles, runtime suppression window use, and lane-compliance reaction timing
- Validation:
  - `node scripts/test-follower-ai.mjs`
  - `node scripts/test_commander_directive_tactics.mjs`

- Fixed the live node-graph audio contract and the largest remaining Node SVG Actions backend gap.
  - `src/scenes/GameScene.js` no longer passes raw string keys into `SfxEngine.playSample`; graph-authored `play_sound` actions now route through `src/audio/SfxEngine.js` key lookup so runtime-preloaded sample keys actually play
  - `server.js` now exposes `/api/svg-actions` list/get/post/delete CRUD to match the live SVG Actions editor tab and the Python backend
  - `server.js` `/api/tiled-build` now runs `npm run build:tiled` instead of the narrower maps-only command so the Node backend matches Python build parity
  - added focused runtime/api regression `scripts/test_action_graph_runtime_execution.mjs`, which starts a temporary Node server, verifies `/api/svg-actions` CRUD, injects a package-local node graph, and proves event -> graph -> `play_sound` dispatch works in a live game page
- Validation:
  - `node --check src/audio/SfxEngine.js`
  - `node --check src/scenes/GameScene.js`
  - `node --check server.js`
  - `node --check scripts/test_action_graph_runtime_execution.mjs`
  - `node scripts/test_action_graph_runtime_execution.mjs`
  - `node scripts/test_actions_visibility_and_sound_picker.mjs`

- Closed the most concrete story-point/runtime and backend parity gaps surfaced by the current-state audit.
  - `src/scenes/GameScene.js` story-point triggers now emit `storyPointTriggered` and `missionStoryPointTriggered` through the live `EventBus`, so package-authored node graphs can react to map story beats instead of story points stopping at floating text/history only
  - `editors/tabs/story.js` now exposes both story-point trigger events in the node-graph editor event picker
  - `server.js` now serves `GET/POST /api/editor-test-map` for the live BootScene/editor round-trip and adds `/api/svg-assets/list` as a compatibility alias for the SVG Actions tab
  - `dev_server.py` now matches those routes and also restores the legacy `/api/save-hud-config`, `/api/save-sound`, and `/api/audio-upload` endpoints still used by the old HUD/sound surfaces when running the Python dev server
  - updated `README.md` and `docs/gameplay-reference.md` to remove stale wave-first descriptions and document story-point runtime behavior more accurately

- Repo-wide current-state audit and markdown cleanup completed from code, not older plans.
  - ran a supervised 20-agent parallel read-only audit across gameplay, editor, map, enemies, friendlies, movement, mechanics, audio, lighting, effects, node-graph logic, asset pipeline, orchestration, settings, backend, tests, docs, prompts, and backlog reality
  - created `plan/current-state.md` as the new code-grounded planning snapshot under `/plan`
  - removed clearly stale or historical markdown that was no longer part of the canonical doc surface: `resume.md`, `md/resume-vscode-dev-2026-04-07.md`, `prompts/tasks.md`, and `editors/backend/README.md`
  - updated `CLAUDE.md` so the summary and backlog stop advertising already-shipped items such as queen mega-death FX and node-graph package publishing parity as still missing
- Key conclusions from the audit:
  - mission runtime is now authored-spawn-first rather than fallback-wave-first
  - the modular editor and node-graph runtime are both live end to end
  - queen mega-death FX, baseline breach FX, zone-lighting runtime, and story-point runtime triggering already exist
  - remaining high-value gaps are story-point expansion, node-graph action/event parity, backend API parity, stale settings surface cleanup, and mission-flow/UI wording alignment with the current hostile-contact model

## 2026-04-09

- Missions now use authored alien spawn points as the only runtime enemy source.
  - `src/map/missionLayout.js` now projects only immediate authored spawn points into the opening combat state instead of synthesizing multi-wave fallback enemy packs from mission budget/open tiles
  - `src/scenes/GameScene.js` now suppresses ambient/director backfill globally for mission play, so reinforcements, dynamic spawns, vent swarms, mission-director enemy actions, and phantom tracker pressure do not add extra hostiles beyond authored spawn points
  - zero-spawn missions now fail closed consistently across stock and package runtime paths
  - `src/ui/ObjectivesPanel.js` and `src/ui/ControlsOverlay.js` now use hostile-contact wording instead of wave wording when presenting default objective guidance
- Validation:
  - `node --check src/ui/ObjectivesPanel.js`
  - `node --check src/ui/ControlsOverlay.js`
  - `node scripts/test-mission-layout.mjs`
  - `node scripts/test_authored_spawn_runtime.mjs`
  - `node scripts/test_noaliens_spawn_suppression.mjs`
  - `node scripts/test_leader_damage_and_close_fire.mjs`
  - `node scripts/verify_combat.mjs`
  - `bash ./scripts/verify.sh`

- Leader damage feedback/state, muzzle-origin leader fire, and stock `m1` zero-spawn fail-closed fix:
  - `src/data/missionData.js` now marks `m1` with `requireAuthoredAlienSpawns: true`, and `src/map/missionLayout.js` + `src/scenes/GameScene.js` now use that mission-level rule to keep stock/package `m1` fully empty when it has zero authored alien spawn points instead of backfilling fallback waves or ambient/direct spawns
  - `src/scenes/GameScene.js` now fires leader shots from `resolveMuzzleWorldPos(...)` instead of the leader center, fixing the close-range shot-origin mismatch
  - `src/systems/EnemyTargeting.js` now routes melee/contact damage through `GameScene.onMarineDamaged()` so alien hits trigger the shared blood/morale/reload-interrupt feedback path
  - `src/entities/TeamLeader.js` now handles lethal damage coherently by flipping `alive` false, disabling the body, and emitting `leaderDied`
  - added/updated focused regressions in `scripts/test_leader_damage_and_close_fire.mjs`, `scripts/test_noaliens_spawn_suppression.mjs`, `scripts/test-mission-layout.mjs`, and `scripts/verify_combat.mjs`
- Validation:
  - `node --check src/entities/TeamLeader.js`
  - `node --check src/systems/EnemyTargeting.js`
  - `node --check src/data/missionData.js`
  - `node --check src/map/missionLayout.js`
  - `node --check src/scenes/GameScene.js`
  - `node --check scripts/test-mission-layout.mjs`
  - `node --check scripts/test_noaliens_spawn_suppression.mjs`
  - `node --check scripts/test_leader_damage_and_close_fire.mjs`
  - `node --check scripts/verify_combat.mjs`
  - `node scripts/test-mission-layout.mjs`
  - `node scripts/test_leader_damage_and_close_fire.mjs`
  - `node scripts/test_noaliens_spawn_suppression.mjs`
  - `node scripts/verify_combat.mjs`
  - `bash ./scripts/verify.sh`

- Added a root-level recreation prompt doc at `prompty.md`.
  - the file is a large reusable build prompt aimed at recreating the project's gameplay engine, AI, lighting, mission/runtime systems, HUD, editors, persistence, and verification flow
  - it explicitly excludes production art and sound generation, instead instructing use of placeholders, procedural textures, and stubbed audio hooks
  - it preserves project-specific constraints such as Phaser 3, vanilla ES modules, 64px tiles, door/pathfinding rules, combat-director pacing, runtime package overrides, and editor-backed content authoring
- Validation:
  - confirmed `prompty.md` was created and reviewed for content sanity

- Editor local-package game route fix:
  - root cause for the “aliens from the beginning” editor complaint was routing, not authored spawn markers
  - the editor shell `Game` nav was opening plain `/game`, which loads stock built-in `m1`; that mission still has `enemyBudget: 24` and built-in fallback opening waves
  - updated `editors/index.html` so the editor shell opens `Game` as `/game?package=local`, which keeps the authoring workflow on the published package runtime instead of the stock campaign path
  - extended `scripts/test_editor_publish.mjs` so it now checks the editor `Game` nav href and clicks through to verify the runtime scene reports `tilemapSourceLabel === 'PACKAGE'`
- Validation:
  - `node --check scripts/test_editor_publish.mjs`
  - `node scripts/test_editor_publish.mjs`

## 2026-04-06

- Markdown/prompt alignment pass completed:
  - updated `README.md` and `CLAUDE.md` to match the live modular editor layout, current URLs, prompt locations, and current backlog priorities
  - refreshed `prompts/map-editor.md`, `prompts/story-mission-editor.md`, `prompts/sound-editor.md`, and `prompts/image-editor.md` so they describe the current editor surfaces more accurately
  - added new `prompts/hud-editor.md` for the live HUD authoring tab
  - labeled old HUD research/checklist docs as historical background instead of active implementation guidance
  - removed stale prompt backup `prompts/mapeditor.md.save`
- Verification:
  - confirmed the live editor shell still exposes `Image`, `Tile Maps`, `Missions`, `Sound`, `HUD`, `Texture`, `Actions`, and `SVG Actions` in `editors/index.html`
  - confirmed the updated docs now point at `/gameplan` plus `/plan` legacy alias, `prompts/hud-editor.md`, and the current `23`-tile tracker range
  - moved the superseded HUD research, completed plans, and legacy root docs into `md/archive/2026-04-doc-cleanup/`, leaving only the active operational docs plus `plan-node-editor.md` in `md/`

## 2026-04-04

- Tilemap color-only testing cleanup:
  - updated `src/scenes/BootScene.js` so the active `tileset` path now comes from flat procedural colors rather than imported floor/wall textures
  - updated `src/map/MapBuilder.js` to stop drawing runtime terrain texture overlays and `floor_attachment`, while preserving authored map metadata for future restoration
  - missing authored props and large textures in runtime now render as square placeholders instead of disappearing
  - updated both editor surfaces for consistency:
    - `editors/tabs/tilemaps.js` now renders terrain in flat colors only and drops the inactive texture preview sidebar path
    - `editors/app.js` no longer eagerly preloads floor/wall art and now shows square placeholders for missing prop art and texture override markers
  - validation:
    - VS Code Problems check passed for `src/scenes/BootScene.js`
    - VS Code Problems check passed for `src/map/MapBuilder.js`
    - VS Code Problems check passed for `editors/tabs/tilemaps.js`
    - VS Code Problems check passed for `editors/app.js`

- Implemented the new SVG editor as a sub-editor of the live modular Image tab rather than as a standalone top-level tool.
  - `editors/index.html` now labels the host tab as `Image`.
  - `editors/tabs/sprites.js` now switches among `Sprites`, `Characters`, and `SVG` modes.
  - `editors/tabs/shared/svgEditor.js` provides the SVG authoring UI and editing logic.
- SVG editor capabilities added from the prompt specs:
  - category browser for `corpse`, `acid`, `debris`, and `particles`
  - SVG import using native browser parsing
  - polygon creation and direct anchor dragging
  - bezier-handle editing for curve nodes
  - layer ordering and per-shape fill/stroke/opacity controls
  - marine reference overlay and configurable grid
  - raster preview adjustments for brightness, contrast, and color overlay
  - save to source SVG plus PNG raster export pipeline
- Backend/pipeline work:
  - added `assets/svg/corpse`, `assets/svg/acid`, `assets/svg/debris`, and `assets/svg/particles`
  - added `svgAssets` metadata support to `data/sprite_registry.json`
  - updated `server.js` with registry-preserving read/write helpers
  - added `/api/svg-assets`, `/api/svg-assets/content`, `/api/svg-assets/save`, and delete support
  - updated `/api/sprites/marine-reference` to use registry-backed scaled sprite data
  - updated `/api/sprites` to include recursive scaled/reference sprite pipeline assets
- Low-risk cleanup:
  - added shared image/color/file helpers in `editors/tabs/shared/assetUtils.js`
  - replaced duplicate image-loading and file-reading code in `editors/tabs/texture.js` and `editors/tabs/sprites.js`
- Validation:
  - `node --check server.js`
  - `node --check editors/tabs/sprites.js`
  - `node --check editors/tabs/texture.js`
  - `node --check editors/tabs/shared/svgEditor.js`
  - `node --check editors/tabs/shared/assetUtils.js`
  - temporary-port server smoke tests on `8193` for registry, marine-reference, SVG list, and SVG save/read/delete round-trip
- SVG asset profiling follow-up:
  - extended `editors/tabs/shared/svgEditor.js` so each SVG document can carry a persisted usage profile for runtime intent, target, and notes instead of treating all assets in a category as interchangeable
  - added built-in presets for alien/debris use cases such as `Alien Warrior Death`, `Alien Warrior Damage`, `Facehugger Damage`, `Egg Death`, plus environmental acid uses like `Acid Damage To Floor` and `Acid Splashes`
  - updated both `server.js` and `dev_server.py` to persist `usage`, `target`, and `notes` in `data/sprite_registry.json` and return them from SVG list/content APIs
  - validated in-browser on a fresh Node server at `8195` and a fresh Python dev server at `8196`; both passed save/reload/delete with no console or page errors
- Not validated in this pass:
  - gameplay consumption of authored SVG assets in debris/acid runtime systems

## 2026-04-03 (Afternoon)

- Spawn system redesign Phase 1 + 2 completed via parallel 3-agent work:
  - EDITOR agent: Added spawn count UI to `editors/app.js` (2/4/6/8 selector, Tiled roundtrip)
  - MAP agent: Wired spawn points through data pipeline (`missionLayout.js`, `tilemapTemplates.js`, `missionPackageRuntime.js`)
  - MECHANIC agent: Implemented `spawnFromAuthoredPoints()` in `EnemySpawner.js`, integrated into `GameScene.js`, dynamic spawns via `CombatDirector.js`
  - Result: Authored spawns read editor counts; dynamic spawns trigger after firefight idle periods
  - Validation:
    - `node --check` passes on all 5 modified files
    - `bash ./scripts/verify.sh` passes all 4 regression specs (missionLayout, followerAI, enemyAI, botTelemetry)
    - Backward compatible: existing wave-based spawning still works
  - Files modified: `editors/app.js`, `src/map/missionLayout.js`, `src/data/tilemapTemplates.js`, `src/settings/missionPackageRuntime.js`, `src/systems/EnemySpawner.js`, `src/scenes/GameScene.js`

## 2026-04-03 (Morning)

- HUD editor modular-shell restoration and panel coverage pass:
  - Added the missing modular HUD tab implementation at `editors/tabs/hud.js`, so `/editors?tab=hud` now has a real server-backed HUD editor module instead of a dead import target.
  - The modular HUD editor now exposes the non-marine runtime HUD panels the user was missing: `objectivesPanel`, `mapPanel`, and `missionLog` alongside the four marine cards.
  - Marine cards, MAP, objectives, and subtitles now open a popup element editor that lets authors drag and fine-tune inner HUD elements, then save those `_subs` back through `/api/hud-config` into `src/data/hudConfig.js`.
  - The MAP runtime/editor contract is aligned again: `src/ui/Minimap.js` now reads the live `mapPanel` HUD config key instead of a mismatched panel name.
- Validation:
  - `node --check editors/tabs/hud.js`
  - `node --check src/ui/Minimap.js`

## 2026-03-30

- Completed a cross-domain runtime audit/fix pass spanning gameplay flow, AI visibility, lighting state, and audio startup.
- Mission-flow fixes:
  - `src/systems/MissionFlow.js` no longer sets `isComplete` before extraction is reached.
  - `src/scenes/GameScene.js` now keeps objective markers live for unreached cards/terminals before extraction and points them at the elevator once extraction is ready.
- Lighting/runtime fixes:
  - `src/scenes/GameScene.js` now preserves map atmosphere overrides and director `set_lighting` overrides across `refreshRuntimeSettings()` by recomputing effective lighting instead of overwriting it from storage.
- AI/detection fixes:
  - `src/systems/EnemyDetection.js` now requires observer LOS for proximity reveal and excludes fully hidden/undetected hostiles from on-screen hostile counts used by pacing systems.
- Audio fixes:
  - `src/scenes/BootScene.js` now preloads `bg_colony` from `src/music/Colony.mp3`.
  - `src/scenes/GameScene.js` now initializes background music and reapplies volume from runtime settings.
  - `src/settings/runtimeSettings.js` now includes validated `other.audioMusicVolume`.
- Validation:
  - `node --check src/scenes/GameScene.js`
  - `node --check src/systems/EnemyDetection.js`
  - `node --check src/systems/MissionFlow.js`
  - `node --check src/scenes/BootScene.js`
  - `node --check src/settings/runtimeSettings.js`
  - `bash ./scripts/verify.sh` still fails at the separately active pulse-rifle timing spec (`scripts/test-pulse-rifle-timing.mjs`, expected `60`, got `82`).

# Progress Log

Chronological implementation and validation history. This file is historical, not instructional.

## 2026-04-09

- Closed the runtime alien-spawn leaks for clean-map and package-authored zero-spawn runs.
  - `src/systems/EnemySpawner.js` now fail-closes all enemy creation when `?noaliens` is active, so any direct `spawnEnemyAtWorld()` caller returns `null`.
  - `src/scenes/GameScene.js` now tracks ambient spawn suppression separately from full `?noaliens` suppression.
  - package-authored maps with zero authored spawn points now suppress ambient/non-authored alien entry paths without breaking explicit authored spawn points.
  - `src/systems/ReinforcementSystem.js` now respects that ambient suppression for gunfire, idle-pressure, and inactivity ambush spawns.
- Added focused runtime regression coverage in `scripts/test_noaliens_spawn_suppression.mjs`.
  - verifies `?noaliens` blocks direct enemy creation and keeps vent/gunfire/director probes at zero alive enemies
  - verifies package-local maps with zero spawn points keep zero opening waves and suppress ambient vent/gunfire/director backfill spawns
- Validation:
  - `node --check src/scenes/GameScene.js src/systems/EnemySpawner.js src/systems/ReinforcementSystem.js scripts/test_noaliens_spawn_suppression.mjs`
  - `node scripts/test_noaliens_spawn_suppression.mjs`
  - `node scripts/test_authored_spawn_runtime.mjs`

- Hardened follower combat acquisition around close local threats.
  - `src/systems/FollowerCombatSystem.js` now enters the reactive all-enemy scan path when an alive hostile is already inside the follower's local danger radius, even if the squad has not yet taken recent damage.
  - this specifically targets the opening-wave idle-follower failure mode surfaced by broader automation.
- Added follower coverage:
  - `scripts/test-follower-ai.mjs` now asserts close undetected threats can still be acquired and fired on
  - added `scripts/test_follower_engagement_runtime.mjs`, a focused Playwright runtime bot that freezes follow-on spawning in stock `m1` and verifies followers stay engaged under multiple local threats
- Hardened broad playtest telemetry:
  - `scripts/play_bot.mjs` now counts only reachable nearby threats for idle-follower findings and treats tracker/heal/door-busy followers as engaged
- Validation:
  - `node --check src/systems/FollowerCombatSystem.js scripts/test-follower-ai.mjs scripts/test_follower_engagement_runtime.mjs scripts/play_bot.mjs`
  - `node scripts/test-follower-ai.mjs`
  - `node scripts/test_follower_engagement_runtime.mjs`

- Expanded modular editor regression coverage around the live Actions path.
  - `editors/tabs/missions.js` now routes authors directly into the modular Actions tab instead of pointing them at the legacy workspace as the primary graph-editing path.
  - `editors/tabs/story.js` now renders `play_sound` params as a runtime-sound picker derived from `/api/sounds` entries under `/src/audio`, while preserving any custom pre-existing value.
  - `src/events/actionDefs.js` now marks `play_sound.key` for the sound-picker editor treatment.
- Added a focused editor bot: `scripts/test_actions_visibility_and_sound_picker.mjs`.
  - Verifies the Missions tab exposes the live Actions route.
  - Verifies the Actions tab `play_sound` node exposes runtime-loaded sound keys and that selection updates the node value.
- Validation:
  - `node --check editors/tabs/missions.js editors/tabs/story.js src/events/actionDefs.js scripts/test_actions_visibility_and_sound_picker.mjs`
  - `node scripts/test_actions_visibility_and_sound_picker.mjs`
  - `node scripts/test_editors_hidden_panels.mjs`
  - `node scripts/test_actions_tab_phase6.mjs`
  - `node scripts/test_node_graph_package.mjs`

- Fixed modular tilemap collision preview fidelity and aligned zone-prop blocking with runtime intent.
  - Added `shared/tilemapCollision.js` as the shared source for editor collision classification and authored prop blocking rules.
  - `editors/tabs/tilemaps.js` now previews collision from runtime-faithful terrain, door, and physical-prop blocker data instead of the previous ad hoc terrain/door overlay.
  - `src/map/MapBuilder.js` now treats `zone_colony`, `zone_damaged`, and `zone_hive` as non-blocking/non-light-blocking authored props while keeping physical props blocking.
  - `src/scenes/GameScene.js`, `src/systems/EnemyMovement.js`, `src/systems/EnemyManager.js`, `src/systems/EnemySpawner.js`, and `src/systems/SquadSystem.js` now respect `roomProps.blocksPath` so enemy movement, spawning, and squad walkability stay aligned with the authored prop rule.
- Regression coverage added:
  - `scripts/test_tilemap_collision_preview.mjs` covers shared editor collision classification and prop blocking rules.
  - `scripts/test_zone_prop_walkability.mjs` verifies package-backed runtime behavior for non-blocking zone props vs blocking physical props.
- Validation:
  - `node --check shared/tilemapCollision.js editors/tabs/tilemaps.js src/map/MapBuilder.js src/scenes/GameScene.js src/systems/EnemyMovement.js src/systems/EnemyManager.js src/systems/EnemySpawner.js src/systems/SquadSystem.js scripts/test_tilemap_collision_preview.mjs scripts/test_zone_prop_walkability.mjs`
  - `node scripts/test_tilemap_collision_preview.mjs`
  - `node scripts/test_zone_prop_walkability.mjs`
  - `node scripts/test_tilemaps_inspector_panel.mjs`

## 2026-04-08

- Restored global lighting control parity for torch core alpha.
  - Added `lighting.coreAlpha` back to the `/settings` Game -> Lighting & Visibility section in `settings/index.html` so the global settings page matches the runtime/editor lighting model.
  - Extended `scripts/test_editors_hidden_panels.mjs` so the settings smoke verifies the core-alpha controls render and that the number/range pair stays synchronized.
- Validation:
  - `node scripts/test-runtime-settings.mjs`
  - `node scripts/test_editors_hidden_panels.mjs`

- Hardened the M1 play bot and fallback objective validation.
  - `scripts/play_bot.mjs` now derives wander targets from live walkability, follows runtime mission targets, opens closed doors along blocked routes, filters spawn-inside suspicion by enemy spawn travel, and suppresses false close-combat pathfinding findings without disabling stuck recovery.
  - `src/systems/MissionFlow.js` now keeps fallback card/terminal/extraction placement inside the spawn-connected reachable region when possible.
  - `scripts/test-mission-layout.mjs` now asserts that default M1 fallback objective targets stay reachable from spawn when doors are allowed.
- Validation:
  - `node --check scripts/play_bot.mjs`
  - `node --check src/systems/MissionFlow.js`
  - `node --check scripts/test-mission-layout.mjs`
  - `node scripts/test-mission-layout.mjs`
  - repeated `node scripts/play_bot.mjs m1`
- Latest M1 automation result after hardening:
  - removed the earlier wall-target, spawn-inside, suspicious-death, and stuck/pathfinding false positives
  - latest pass still times out in extended combat with follower idle/not-firing findings, so the remaining failure mode is gameplay pressure / bot progression rather than a clear runtime environment regression

- Fixed the leader pulse-rifle overheat visual regression in `src/scenes/GameScene.js`.
  - `emitContinuousLeaderPulseFlash()` now stops emitting while the pulse rifle is overheated or empty.
  - the leader lighting/muzzle-flash hold pulse now also checks overheat state and pulse ammo before sustaining the glow.
- Fixed the close-range alien melee regression and improved point-blank readability.
  - `src/systems/EnemyManager.js` no longer blocks melee hits when aliens collapse inside the old minimum contact radius.
  - `src/systems/EnemyMovement.js` now bounces/lunges from a slightly larger stand-off distance.
  - `src/systems/EnemyManager.js` hard-push spacing increased so melee enemies are less likely to sit inside the leader’s center mass.
- Expanded authored spawn points to support `count`, `enemyType`, and `spawnTimeSec` end-to-end.
  - `editors/tabs/tilemaps.js` now exposes spawn count, alien type, and spawn-time fields for `alien_spawn` markers.
  - `editors/backend/js/buildPackageFromEditorState.js`, `editors/backend/js/normalizeMissionPackage.js`, and `src/settings/missionPackageRuntime.js` now preserve canonical spawn-point metadata through package build/normalize/runtime projection.
  - `src/map/missionLayout.js` now preserves explicit spawn type/timer data, schedules delayed authored spawns separately from the opening wave, and only disables fallback alien waves for `PACKAGE` tilemap overrides with zero authored spawns.
  - `src/systems/EnemySpawner.js` now honors explicit authored `enemyType` when spawning from canonical spawn points.
- Tiled round-trip and generated data updates:
  - `scripts/tiledImport.mjs` and `scripts/tiledExport.mjs` now preserve `enemyType` and `spawnTimeSec` on alien spawn markers.
  - regenerated `src/data/tiledMaps.generated.js` with `npm run build:tiled-maps` so the generated module matches the updated Tiled source pipeline.
- Regression coverage added/updated:
  - `scripts/test_node_graph_package.mjs` now checks Tiled-style marker-layer spawn properties become canonical `spawnPoints`
  - `scripts/test-mission-layout.mjs` now covers zero-authored-spawn package maps and timed/typed authored spawn-point projection
- Validation:
  - `node --check` on all modified runtime/editor/tooling files
  - `node scripts/test_node_graph_package.mjs`
  - `node scripts/test-mission-layout.mjs`
  - `node scripts/test-pulse-rifle-timing.mjs`
  - `bash ./scripts/verify.sh`

## 2026-03-20

- HUD-local interference pass:
  - Updated `src/ui/Minimap.js` so the monitor/map card now uses a local `interrupt_video` overlay with randomized fade bursts instead of a constant additive interference layer.
  - Updated `src/ui/ObjectivesPanel.js` so its interference effect only runs while the objectives panel is visible.
  - Kept marine-card and motion-tracker interference scoped to their own HUD containers; no scene-wide interference overlay was added.
- Validation:
  - VS Code Problems check passed for `src/ui/Minimap.js`, `src/ui/ObjectivesPanel.js`, `src/ui/HUD.js`, and `src/ui/MotionTracker.js`
  - `node --check src/ui/Minimap.js` passed
  - `node --check src/ui/ObjectivesPanel.js` passed
  - `node --check src/ui/HUD.js` passed
  - `node --check src/ui/MotionTracker.js` passed

- HUD editor/runtime fidelity pass:
  - Updated `src/ui/HUD.js` so marine-card sub-elements now consume editor-authored HUD package overrides for video feed placement/tint, title/ammo/mag/hp text placement and styling, EKG placement/color, action-bar geometry, HEAL button styling, and leader weapon/overheat elements.
  - Updated `editors/app.js` so the HUD editor exposes the missing magazine sub-element, previews it on-canvas, uses runtime-closer card video/button defaults, and allows 1px move/resize adjustments instead of forcing 10px snapping.
- Validation:
  - VS Code Problems check passed for `src/ui/HUD.js`
  - VS Code Problems check passed for `editors/app.js`
  - `node scripts/test_editor_runtime_fidelity.mjs` passed

- Render readability micro-pass:
  - Reduced marine torch brightness across the full torch stack in `src/scenes/GameScene.js` and `src/lighting/LightingOverlay.js` by lowering base source intensity plus torch-only cone, halo, and endpoint multipliers.
  - Increased the HUD ammo counter glow during active firing in `src/ui/HUD.js` by boosting the glow alpha and warming the readout color while preserving the existing low-ammo warning flash behavior.
- Post-FX consistency pass:
  - Updated `src/scenes/GameScene.js` so AlienTone, TiltShift, and Scanline init/update logic use `DEFAULT_RUNTIME_SETTINGS.graphics` as the fallback source instead of stronger ad hoc numbers.
  - Updated `src/graphics/AlienTonePipeline.js`, `src/graphics/TiltShiftPipeline.js`, and `src/graphics/ScanlinePipeline.js` to use `highp` fragment precision when available, falling back to `mediump` for compatibility.
  - Aligned `src/graphics/ScanlinePipeline.js` class defaults with runtime graphics defaults.
- Validation:
  - `node --check src/scenes/GameScene.js` passed
  - `node --check src/lighting/LightingOverlay.js` passed
  - `node --check src/ui/HUD.js` passed
  - `node --check src/graphics/AlienTonePipeline.js` passed
  - `node --check src/graphics/TiltShiftPipeline.js` passed
  - `node --check src/graphics/ScanlinePipeline.js` passed

## 2026-03-15

- Map tile editor audit + QoL + regression expansion:
  - Added new tilemap authoring shortcuts and utilities in `editors/app.js`:
    - `Ctrl/Cmd+D` duplicate selected authored object
    - `R` rotate selected prop or active prop brush
    - `Shift+Arrow` 5-tile nudge
    - numeric layer hotkeys `1-8`
    - `Mirror Y` action
    - inline shortcut hint text in the tilemap workspace
  - Added `scripts/test_map_tile_editor_bot.mjs`, a Playwright feature-sweep bot that exercises map management, terrain/door/marker painting, prop manipulation, light placement, texture overrides, story points, package save metadata, and game-runtime consistency.
  - Updated `package.json` with `test:map-editor-bot`.
  - Hardened `scripts/test_editor_object_roundtrip.mjs` so it works with the current collapsible tilemap UI and keyboard-first tilemap workflow instead of assuming always-visible toolbar controls.
- Validation:
  - `node scripts/test_map_tile_editor_bot.mjs` passed
  - `node scripts/test_editor_publish.mjs` passed
  - `node scripts/test_editor_object_roundtrip.mjs` passed
  - `node scripts/test_editor_runtime_fidelity.mjs` passed

- Runtime audit remediation pass:
  - Fixed the combat occlusion regression in `src/scenes/GameScene.js` and `src/systems/EnemyDetection.js` by adding tile/path-grid fallback checks and a direct shooter-to-target blocker validation in bullet overlap handlers. The official combat harness now passes again.
  - Fixed mission package/runtime data loss in `src/settings/missionPackageRuntime.js`:
    - package markers `7` and `8` now survive normalization
    - unresolved mission map references no longer fall back to the first package map
    - runtime director-event projection now preserves `enabled`, `chance`, `cooldownMs`, `repeatMs`, and `maxFires`
    - malformed story points without numeric coordinates are filtered out
  - Fixed authored spawn-count handling in `src/map/missionLayout.js` by expanding count-bearing spawn markers into unique spawn slots during wave generation.
  - Fixed leader door-sync crash risk by adding `moveTowardRigid` to `src/entities/TeamLeader.js`.
  - Fixed locked-door weld bypass and queen breach rules in `src/entities/DoorManager.js` and `src/systems/EnemyManager.js`:
    - welded locked doors restore to `locked` on unweld
    - `canBreachAnyDoor` enemies can damage locked and welded doors
  - Fixed tracker audio leakage and extract-phase spawn leakage in `src/scenes/GameScene.js`, `src/systems/ReinforcementSystem.js`, and `src/systems/SetpieceSystem.js`.
  - Removed redundant HUD button dispatch from `src/systems/InputHandler.js`; HUD buttons now rely on their direct Phaser interaction path only.
  - Expanded `scripts/test-mission-layout.mjs` with regressions covering package markers `7/8`, authored spawn-count expansion, package map selection, and director-event field projection.
- Validation:
  - `node scripts/test-mission-layout.mjs` passed
  - `node scripts/verify_combat.mjs` passed
  - `bash ./scripts/verify.sh` passed

## Research Findings (2026-03-12)

- **Infrastructure / Map Sync**:
    - `src/map/missionLayout.js` forces `TEMPLATE` source for `m1`, ignoring editor changes (`TILED`). This prevents editor-authored maps from loading in-game for Mission 1.
    - `src/data/tiledMaps.generated.js` is 2.9MB (uncompressed 2D arrays). Needs optimization to reduce bundle size.
    - `editors/app.js` and `src/data/` have duplicated mission logic, leading to potential desync.

- **Hardcoded Logic**:
    - `src/systems/EnemyManager.js` has hardcoded overrides for `m1` (stuck/unstuck timers).
    - `src/scenes/GameScene.js` contains magic value adjustments for `m1`, `m4`, `m5` in `getDynamicAliveSoftCap`.
    - `src/map/missionLayout.js` hardcodes enemy composition per mission ID.
    - *Recommendation*: Centralize these into a `MissionParameters` or `DirectorConfig` object to remove scattered `if (id === 'm1')` checks.

## 2026-03-12

- Editor save/publish audit follow-up:
  - `editors/app.js`: fixed the misleading save/publish path so normal editor saves continue live-syncing the game package, while `Save All` now also refreshes publish metadata/history as an explicit checkpoint.
  - Added publish-source labeling in the editor summary (`SAVE` / `PUBLISH` / `AUTOSAVE`) so the UI no longer looks unpublished after a successful save.
  - Added `Ctrl/Cmd+S` shortcut in the editor to trigger the same save checkpoint as `Save All`.
  - `src/settings/missionPackageRuntime.js`: fixed package tilemap normalization to preserve marker value `6` (`warning_strobe`) so editor-authored alarm markers survive editor → package → game.
  - Regression coverage:
    - `scripts/test_editor_publish.mjs` now asserts that `Save All` refreshes mission package metadata with source `save`.
    - `scripts/test-mission-layout.mjs` now asserts package-backed maps preserve marker `6`.
  - Validation: `node scripts/test_editor_publish.mjs`, `node scripts/test-mission-layout.mjs`, and `bash ./scripts/verify.sh` all passed. One existing browser-side 404 remains visible during the publish test and is unrelated to the save/publish path.

- User playtesting feedback captured:
  - Full historical backlog in `md/archive/2026-04-doc-cleanup/plan-v2-feedback.md` (13 items across infrastructure, map editor, spawns, audio, AI, video).
  - Key issues: editor maps not reflected in game, aliens pop-in, tracker too loud, need shared nav menu.
  - Memories saved for alien behavior, spawn system design, and infrastructure preferences.

- Alien behavior overhaul (items 9-12 from v2.0 feedback):
  - **Rush-and-swipe melee** (`src/systems/EnemyMovement.js`): Replaced static melee bounce with a 3-state oscillation cycle (lunge→retreat→circle→lunge). Aliens now rush in, swipe, retreat ~2 tiles, strafe, then lunge again. Gives marines a chance to shoot between attacks.
  - **Gradual fade-in** (`src/systems/EnemyDetection.js`): Added spawn ramp-up — newly spawned aliens cannot instantly appear at full proximity alpha. They ramp from 0→1 over ~1.5s when entering any reveal zone, preventing the "pop out of nowhere" effect. Hit-revealed aliens bypass the ramp.
  - **Chaotic facehuggers** (`src/systems/EnemyMovement.js`): Leap range reduced to ~2 tiles (was 3.4). Flee speed increased to 2.4× (was 1.7×) with erratic angle jitter. Kite movement made faster (1.5× speed) with sinusoidal direction changes and random side-swaps. Off-screen re-flank chance raised to 55% (was 40%). Cooldowns shortened for more frequent leaps.
  - **Better follower detection** (`src/systems/FollowerCombatSystem.js`): Think interval reduced to 70ms (was 120ms). Acquisition cone widened to ~70° half-angle (was ~45°). Added reactive 360° scanning when any marine is under attack. Facehuggers now get a -120 score bonus for priority targeting.
  - Validation: `node --check` passed for all modified files. `bash ./scripts/verify.sh` passed including combat regression.

- Infrastructure & Polish (Gemini):
  - **Auto-redirect**: `dev_server.py` now redirects root `/` to `/game`.
  - **Shared Navigation**: Added `<nav class="dev-nav">` to `game/index.html` for quick access to editors, settings, and specific missions.
  - **Map Sync Fix**: Removed hardcoded `preferTemplateForMission` in `src/map/missionLayout.js` so `m1` can load from Tiled/Editor sources.
  - **Clean M1 Mode**: Added `?noaliens` support to `GameScene.js` and a direct link in the nav bar.
  - **Audio Balance**: Reduced motion tracker volume by 50% in `src/audio/SfxEngine.js`.
  - **Asset Optimization**: Reduced `src/data/tiledMaps.generated.js` size by ~57% (1.2MB) and optimized portrait videos.

- Dynamic spawn system (item 6 from v2.0 feedback):
  - **CombatDirector** (`src/systems/CombatDirector.js`): Added firefight tracking (`noteFirefight(time)`, `lastFirefightAt`), dynamic spawn budget/interval system, and `getDynamicSpawnCount(time)` that returns aliens to spawn when idle too long during `build` state. Configurable via tuning: `dynamicSpawnMinIntervalMs` (20s), `dynamicSpawnIdleThresholdMs` (15s), `dynamicSpawnMaxPerEvent` (3), `dynamicSpawnBudget` (12).
  - **EnemySpawner** (`src/systems/EnemySpawner.js`): Added `spawnDynamic(count, marines, difficulty)` that picks random walkable positions at least 10 tiles from all marines. 75% warriors / 25% drones.
  - **GameScene** (`src/scenes/GameScene.js`): Hooked dynamic spawn check into main update loop after CombatDirector update. `noteGunfireEvent` and `markCombatAction` now also notify CombatDirector to reset idle timer.
  - Validation: `node --check` and `bash ./scripts/verify.sh` passed.

- Door and Audio overhaul:
  - Tripled door integrity required for breach (increased `integrityHits` to 30).
  - Implemented `DoorRipplePipeline` WebGL shader for a "rippling, crumpling" effect on damaged doors.
  - Enabled pulse rifle and motion tracker audio loading and playback in `BootScene.js` and `SfxEngine.js`.
  - Added initial firing position tracking to `Bullet.js` for robust projectile occlusion.
  - Refined `getProjectileOcclusionHit` in `GameScene.js` to detect wall-skipping and internal-tile hits.
  - Fixed `walkableSpawns` regression in Mission 1 by expanding marker value support (5 and 6) and ensuring props reserve space around markers.
  - Removed redundant `src/systems/PickupSystem.js`.
  - Updated `scripts/verify_combat.mjs` to account for higher door integrity and improved error reporting.
  - Fixed lightBlockerGrid to correctly account for blocking props (desks, containers, barrels).
  - Adjusted game dimensions to 16:9 aspect ratio (1280x720) in `src/config.js`.
  - Reduced ambient light by 20% (increased `ambientDarkness` to 0.82) in `src/settings/runtimeSettings.js`.
  - Integrated `SevenSegment` font from `/images/SevenSegment.ttf` for all numbers in marine HUD cards.
  - Hardened font activation by waiting for `document.fonts.load` in `BootScene.js` and adding delayed `refreshNow` calls in `HUD.js`.
  - Added multiple font-family aliases ('Seven Segment', 'SevenSegmentRegular', 'Alarm') in `game/index.html` for maximum compatibility.
  - Implemented three motion tracker audio modes:
  - Leveled motion tracker volume to match pulse rifle fire baseline.
  - Fixed SevenSegment font loading by removing spaces from filename and updating `game/index.html` references.
  - Aligned HP numeric text with the marine name label horizontally in `src/ui/HUD.js`.
  - Implemented three motion tracker audio modes:
    - Mode 1 (Nothing): Procedural "tap" every 2 seconds.
    - Mode 2 (Far): Low-frequency procedural beep every 2 seconds (threshold >= 460px).
    - Mode 3 (Close): High-frequency procedural beep every 1 second (threshold < 460px).
  - Reduced overall motion tracker volume by an additional 50% for better mix balance.
  - Narrowed torch beam cone to 0.28 (from 0.45) in `src/settings/runtimeSettings.js` for an even more focused look.
  - Processed and optimized all portrait videos using `ffmpeg`:
    - Resized to 300px wide.
    - Converted to grayscale (`format=yuv420p,hue=s=0`).
    - Reduced footprint using high CRF (32) and veryslow preset.
    - Removed audio streams from all portrait loops.
    - Added new portrait video for L. Sheen (`portrait_sheen_300.mp4`) and assigned it to the medic role.
  - Shifted follower HEAL and TRACK buttons 15px to the right in `src/ui/HUD.js` to prevent overlapping card text.
  - Relocated `SevenSegment.ttf` to `assets/fonts/` and updated `game/index.html` for more reliable loading.
  - Synchronized Tiled maps with `npm run build:tiled-maps`.
  - Validation:
  - `bash ./scripts/verify.sh` passed all assertions, including combat regression.
  - Brightened the portrait videos (~10% alpha bump + lighter tint/shade) so the feeds read more clearly on top of the vignette, and pinned the ammo/health digits to the Alarm-style 7-segment font by adding `assets/fonts/DSEG7Classic-Regular.ttf` and an `@font-face` in `game/index.html`.
  - Widened each follower card (extra width only applies to followers), moved their HEAL/TRACK buttons to the right of their video feeds, and gave those buttons bigger dimensions without changing the leader layout.
  - Validation: `node --check src/ui/HUD.js`; Playwright capture in `output/skill-visibility-pass/shot-0.png` shows the new layout without runtime errors.

## 2026-03-11

- HUD interaction dispatch verification pass:
  - Updated `src/ui/HUD.js` so button rectangles own their `pointerdown` callbacks directly instead of depending entirely on a separate scene-level HUD geometry pass.
  - Hardened `src/ui/HUD.js` fallback hit testing to use the transformed button bounds from the actual Phaser objects rather than reconstructing scaled card math by hand.
  - Kept `src/systems/InputHandler.js` world-click rejection centered on `uiBlockWorldInput` hits so HUD actions do not leak movement commands into the playfield.
- Validation:
  - `node --check src/ui/HUD.js` passed.
  - `node --check src/systems/InputHandler.js` passed.
  - Playwright TRACK verification against `http://127.0.0.1:8192/game?renderer=canvas&mission=m1` produced `output/skill-track-long/shot-0.png`; the on-screen result resolves to `Still quiet.` after the tracker channel window.
  - Playwright HEAL verification against the same URL produced `output/skill-heal-pass/shot-0.png` and `output/skill-heal-pass/state-0.json`; the click path completed without falling through into a world-move command.
  - Follow-up note: the heal validation exposed a screenshot/state timing mismatch between the HUD card readout and `render_game_to_text`, so that parity should be audited in a later pass before using long captures as strict automation truth.

- HUD layout / balance / M1 continuation pass:
  - Reworked `src/ui/HUD.js` repeatedly around live Playwright screenshots to stabilize the left-rail squad cards:
    - widened the cards and enforced fixed vertical spacing
    - removed per-card bob so the stack stays aligned
    - reduced portrait/background opacity so text reads above the feed
    - moved portraits to top-left anchored video placement
    - moved the action buttons into a dedicated strip below each card
    - reflowed card content toward the current working layout: HP top-left, ammo/mag top-right, EKG across the portrait mid-band, and marine name on the lower-left strip
  - Updated `src/ui/MissionLog.js` so subtitle-style messages are larger, slower, and bottom-weighted instead of sitting too high on screen.
  - Updated `src/ui/ContextMenu.js` so the non-ammo green UI accents now use the Aliens-style blue palette while keeping ammo readouts red and the EKG green.
  - Updated `src/systems/InputHandler.js` so primary-click handling accepts browser pointer events more reliably while still giving HUD hit-tests priority over world movement.
  - Updated `src/lighting/LightingOverlay.js` so the pulse-rifle beam is narrower and has a rounder end cap that aligns better with the projected ellipse.
  - Rebuilt `m1` test geometry in `src/data/tilemapTemplates.js` as `Cargo Concourse`, replacing the old serpentine lane with a clearer three-lane route better suited to feature validation and combat pacing checks.
  - Rebalanced aliens in `src/data/enemyData.js`, `src/entities/AlienEnemy.js`, and `src/systems/EnemySpawner.js`:
    - lower per-type health
    - higher per-type speed
    - animation time scale now tracks actual runtime velocity more closely
- Validation:
  - `node --check src/ui/HUD.js` passed after the layout iterations.
  - `node --check src/ui/MissionLog.js` passed.
  - `node --check src/ui/ContextMenu.js` passed.
  - `node --check src/systems/InputHandler.js` passed.
  - `node --check src/lighting/LightingOverlay.js` passed.
  - `node --check src/data/enemyData.js` passed.
  - `node --check src/entities/AlienEnemy.js` passed.
  - `node --check src/systems/EnemySpawner.js` passed.
  - Playwright verification artifacts from this continuation pass include:
    - `output/web-game-balance-pass/shot-1.png`
    - `output/web-game-balance-pass/state-1.json`
    - `output/web-hud-layout-pass-5/shot-1.png`
    - `output/web-hud-layout-pass-4/shot-1.png`
    - `output/web-hud-layout-pass-3/shot-1.png`
  - Focused HUD click probes (`output/web-hud-monitor-test*`, `output/web-hud-heal-test`) showed the hit area is being reached, but `TRACKER: READY` did not yet flip into an active tracker state in the short automated pass, so Monitor/Heal still need a deliberate runtime/manual verification pass.
  - Latest stable HUD screenshot for handoff is `output/web-hud-layout-pass-5/shot-1.png`; it resolves the worst portrait/button overlap from `images/current.png`, but typography density still needs one more cleanup pass.

- Runtime cleanup + verification pass:
  - Disabled the nonessential startup initialization overlay by default in `src/scenes/GameScene.js` after repeated Playwright captures showed the panel could remain visible long after gameplay state had advanced.
  - Hardened the overlay lifecycle in `src/scenes/GameScene.js` with explicit cleanup so old overlay artifacts are purged when the scene recreates.
  - Restored authored mission wave sequencing in `src/scenes/GameScene.js` instead of flattening every wave into one oversized opening spawn.
  - Relaxed `src/systems/MissionFlow.js` phase gating so card and terminal objectives can progress during combat instead of only after full wave clear.
  - Fixed remaining runtime authority issues across `src/lighting/LightingOverlay.js`, `src/systems/FollowerCombatSystem.js`, `src/systems/DoorActionSystem.js`, and `src/systems/SquadSystem.js`:
    - torch cone and muzzle bloom now use the correct shoulder / muzzle anchors
    - follower reloads and last-mag firing now respect the real reserve model
    - door actions no longer cancel a valid in-flight action before reassignment succeeds
    - heal actions now reject marines already occupied by door work
    - `isRoleTaskActive()` no longer mutates task ownership as a side effect
- Validation:
  - `node --check src/scenes/GameScene.js` passed.
  - `node --check src/systems/MissionFlow.js` passed.
  - `node --check src/systems/FollowerCombatSystem.js` passed.
  - `node --check src/systems/DoorActionSystem.js` passed.
  - `node --check src/systems/SquadSystem.js` passed.
  - Approved Playwright verification completed against `http://127.0.0.1:8192/game?renderer=canvas`; current artifacts are `output/web-game-canvas/shot-0.png`, `output/web-game-canvas/shot-1.png`, `output/web-game-canvas/state-0.json`, and `output/web-game-canvas/state-1.json`.
  - Latest screenshot no longer shows the stuck `INITIALISING / MAP: ...` overlay, so gameplay/HUD/torch visuals are visible again for review.

- Baseline recovery pass from uploaded `/home/drevilbob/Aliens/Aliens.zip`:
  - Unpacked the uploaded archive to `/tmp/aliens_restore_compare_1773210601/Aliens` and used it as the source of truth for a restore pass.
  - Restored the core visual/runtime files from that baseline: `src/scenes/BootScene.js`, `src/scenes/GameScene.js`, `src/lighting/LightingOverlay.js`, `src/graphics/AlienTonePipeline.js`, `src/settings/runtimeSettings.js`, `src/entities/TeamLeader.js`, `src/ui/HUD.js`, and `src/systems/ReinforcementSystem.js`.
  - Syntax validation passed for all restored core files with `node --check`.
  - Restarted the dev server and verified the game is rendering again via direct Playwright screenshots instead of relying on the black canvas capture path.
  - Fresh verification artifacts:
    - `output/recovery-direct-page.png`
    - `output/recovery-direct-canvas.png`
  - Current status:
    - The scene is visible again.
    - Lighting/shader stack is back to the uploaded baseline behavior.
    - The earlier `reinforcementSystem.getDoorGroupCenter` mismatch cleared after restoring the paired baseline system and restarting the server.
  - Next recommended pass:
    - Keep changes narrow: shader/light tuning, sprite scale/proportion fixes, then a fresh visual review loop.

- Editor model / prompt refinement:
  - Strengthened `.claude/agents/editor.md` so future sessions treat the browser editor as a product surface with author-confidence, round-trip safety, and structured authoring as primary goals.
  - Added editor-focused prompt stubs to `agent_prompts.md`.
  - Added an editor-quality guardrail to `CLAUDE.md`.
  - Recorded the current editor audit in `md/collab.md`, including the main gap: mission/director/audio authoring is still too JSON-heavy compared with the tilemap side.

## 2026-03-10

- Graphics HUD composition pass:
  - Refactored `src/ui/HUD.js` away from bottom-docked squad cards into a left-edge stacked monitor treatment aligned to `images/mockup.png`.
  - Reframed each marine card as an integrated diegetic slab with portrait feed, vitals block, red ammo digits, waveform strip, and bottom command bays.
  - Parameterized HUD element coordinates per card so future visual tuning can happen without reworking the state-update logic again.
  - Restyled `src/ui/MotionTracker.js` into the same diegetic monitor family with blue frame rails, integrated footer labels, tighter radar bounds, and retained tracker logic.
  - Restyled `src/ui/ObjectivesPanel.js` to match the monitor treatment using a framed CRT-like panel instead of a plain rectangle.
  - Live Playwright/Chromium capture is now working in this environment; validated the HUD against a real screenshot instead of black headless frames.
  - Moved the commander overlay off the left rail into the center-top gap (`src/systems/CommanderSystem.js`) and nudged HUD stack spacing so the top nav no longer collides with the first card header.
  - Reworked the HUD approach again after visual review: the primary panel now uses `images/mockup.png` as the composition template and redraws live values over that slab, instead of inventing a custom card layout, and the roster below is thinned to serve strictly as a tracker strip.
- Validation:
  - `node --check src/ui/HUD.js` passed.
  - `node --check src/ui/MotionTracker.js` passed.
  - `node --check src/ui/ObjectivesPanel.js` passed.
  - `node --check src/systems/CommanderSystem.js` passed.
  - Playwright screenshot review succeeded with `output/live-hud-review.png`, `output/live-hud-review-2.png`, and `output/live-hud-review-3.png`.
  - Additional screenshot reviews for the mockup-driven HUD pass: `output/live-hud-review-5.png` and `output/live-hud-review-6.png`.
  - `bash ./scripts/verify.sh` passed after the HUD/tracker pass.

- Documentation workflow cleanup:
  - Audited repo markdown files and separated canonical workflow docs from reference/research docs.
  - Rewrote `md/WORKFLOW.md`, `md/handoff.md`, and `md/collab.md` to remove stale operational history and conflicting instructions.
  - Shortened `README.md` and aligned it with the canonical `md/` docs.
  - Updated `CLAUDE.md` and `agent_prompts.md` to defer to canonical workflow docs instead of duplicating them.
  - Removed obsolete `CODEBASE_REPORT.md` after verifying it was unreferenced.
  - Removed obsolete `docs/skills/*.md` after confirming the repo now uses `.claude/agents/` instead.
  - Added explicit HUD visual-direction guidance using `images/mockup.png` in `.claude/agents/gameplay.md`, `.claude/agents/graphics.md`, `agent_prompts.md`, and `docs/aliens-aesthetic-research.md`.
  - Switched coordination docs to role-first naming and recorded the two parallel Codex sessions as `Graphics AI` and `Coding AI`.
  - Validation:
  - Searched the repo for references before deleting obsolete markdown.
  - Verified canonical file names and documentation entry points remained consistent.

## 2026-03-13

- Editor runtime fidelity + UI pass:
  - Root cause of the remaining "editor map does not truly match game map" report was narrowed to runtime fidelity, not package persistence alone.
  - `src/scenes/GameScene.js` now passes authored `floorTextureKey`, `wallTextureKey`, `terrainTextures`, `props`, and `largeTextures` into `MapBuilder`, registers authored props into `roomProps`/path blocking, and skips procedural room-prop generation when a map already has authored props.
  - `src/map/MapBuilder.js` now instantiates authored large textures and annotates authored prop sprites with tile/type metadata so the scene can treat them as real map props.
  - `src/settings/missionPackageRuntime.js` now preserves `atmosphere` and `largeTextures` for package-backed maps, fixing package→runtime drift for authored lighting/atmosphere/layout dressing.
  - Added `scripts/test_editor_runtime_fidelity.mjs` to verify that a published mission package renders authored terrain texture overrides, authored props, large textures, and atmosphere overrides in-game.
  - Refreshed the editor shell presentation in `editors/index.html` and `editors/styles.css`:
    - clearer authoring-console header
    - styled fixed nav without inline CSS
    - stronger separation between left control rail and workspace
    - improved tab/pill/button treatment for the tilemap workflow
  - Validation:
    - `node --check src/scenes/GameScene.js`
    - `node --check src/map/MapBuilder.js`
    - `node --check src/settings/missionPackageRuntime.js`
    - `node scripts/test_editor_runtime_fidelity.mjs`
    - `node scripts/test_editor_publish.mjs`
    - Visual inspection of `output/editor-tilemap-tab.png`

- Editor interaction expansion:
  - `editors/app.js` now supports Select-mode drag for authored props, authored lights, and marker-based points, instead of only paint/erase.
  - Added a left-rail layer preset strip for `Floor`, `Walls`, `Doors`, `Spawn Points`, `Props`, `Lights`, `Story`, and `Textures` to reduce mode hunting.
  - Added a proper left-side layer manager with per-layer activate / visibility / lock controls, closer to Tiled/LDtk authoring ergonomics.
  - Added keyboard nudging with arrow keys for the currently selected object/marker in the tilemap editor.
  - Added editor-saved `storyPoints` annotations on maps with title, note, kind, and mission scope fields plus an on-canvas overlay marker.
  - Fixed a runtime ordering bug in `src/scenes/GameScene.js` so authored lights are applied after `lightingOverlay` exists; previously published lights were present in package data but never made it into the scene.
  - Added `scripts/test_editor_object_roundtrip.mjs` to cover the full Playwright loop:
    - place prop in editor
    - drag prop to a new tile
    - place authored light
    - place story point
    - save/publish
    - open `/game`
    - assert `PACKAGE` source plus prop/light runtime presence
  - Validation:
    - `node --check editors/app.js`
    - `node --check src/scenes/GameScene.js`
    - `node scripts/test_editor_object_roundtrip.mjs`

- Mission authoring GUI pass:
  - `editors/app.js` missions tab now exposes structured event-node cards and audio-cue cards instead of relying on raw JSON textareas as the primary editing path.
  - Added per-card add/clone/delete/reorder controls plus drag-reorder support for event nodes and cues.
  - Added a `Story Point References` board in the missions workspace so map-authored story annotations are visible from the campaign authoring surface.
  - `editors/backend/js/buildPackageFromEditorState.js`, `editors/backend/js/normalizeMissionPackage.js`, and `src/settings/missionPackageRuntime.js` now preserve `storyPoints` through package build/normalize/runtime fallback, so editor-authored story references are no longer dropped during package generation.
  - Advanced JSON remains available as a readonly snapshot/debug surface instead of a second editable source of truth.
  - Validation:
    - `node --check editors/app.js`
    - `node --check editors/backend/js/buildPackageFromEditorState.js`
    - `node --check editors/backend/js/normalizeMissionPackage.js`
    - `node --check src/settings/missionPackageRuntime.js`
    - Playwright visual inspection of `output/editor-missions-gui.png`

- Code stability pass:
  - Repaired broken extraction boundaries after interrupted refactors by restoring `GameScene` wrappers for extracted setpiece/reinforcement helpers.
  - Fixed parse corruption in `WeaponManager.js` and `EnemyMovement.js`.
  - Removed stale debug logs from `BootScene.js` and `GameScene.js`.
  - Synced leader ammo/reload flow so `WeaponManager` is the live gameplay authority and leader HUD ammo is a mirrored view.
  - Fixed `render_game_to_text()` objective totals so automated probes report real mission progress even on first frame.
  - Added `"type": "module"` to `package.json` to remove repeated Node ESM warning noise in the verification scripts.
- Gameplay pacing pass:
  - Stopped `GameScene` from flattening all mission waves into one oversized opening wave.
  - Biased first-wave spawn selection toward a nearer ring around the squad spawn for better opening contact.
- HUD performance pass:
  - Throttled EKG waveform redraws in `src/ui/HUD.js` so it no longer clears and redraws continuously when the display state is unchanged.
- Alien hit acid FX pass:
  - Increased non-lethal alien-hit acid visibility in `src/scenes/GameScene.js` by boosting directional acid spurts, blood splatter counts, landing decals, and small visual-only acid hazards.
  - Added weapon-aware scaling so shotgun hits throw the heaviest acid spray, pulse rifle hits are stronger than before, and pistol hits still remain lighter.
  - Increased follow-up non-lethal acid splash frequency in `src/systems/EnemyManager.js` and added splash intensity scaling without turning routine hits into full death bursts.
- Tiled pipeline hardening:
  - `scripts/tiledExport.mjs` now preserves `floorTextureKey`, `wallTextureKey`, per-tile `terrainTextures`, and authored `props`.
  - `scripts/tiledImport.mjs` now restores those fields and resolves duplicate Tiled properties using the last override.
  - `scripts/generateTileset.mjs` now generates a Tiled tileset with zero-install fallback and uses real texture sources when `sharp` is available.
  - Added `scripts/generateTiledMapsModule.mjs` to convert `maps/*.json` Tiled files into `src/data/tiledMaps.generated.js`.
  - `missionLayout.js` now prefers generated Tiled maps over legacy hardcoded templates when no package override exists.
  - `editors/app.js` now seeds editor defaults from generated Tiled maps when available.
  - Fixed editor/package builders so `floorTextureKey`, `wallTextureKey`, `terrainTextures`, and `props` are no longer lost when publishing from editor state.
  - Added package scripts:
    - `npm run build:tiled-tileset`
    - `npm run build:tiled-maps`
    - `npm run build:tiled`
    - `npm run verify`
  - Added `scripts/test-tiled-sync.mjs` and wired it into `scripts/verify.sh` so verification now fails if `src/data/tiledMaps.generated.js` is stale relative to `maps/*.json` or if the Tiled tileset is missing.
  - Browser editor integration:
    - `editors/app.js` now supports Tiled round-trip from the tilemap tab:
      - Export selected map as Tiled JSON
      - Import a Tiled JSON file into the selected map slot
      - Reset the selected map from canonical generated Tiled data
    - Fixed editor marker palette drift by adding marker value `6` (`warning_strobe`) to the browser editor.
    - Tilemap tab now shows canonical Tiled source status and Tiled workflow controls.
    - Tiled import is now guarded:
      - rejects malformed Tiled payloads with missing core layers/data
      - rejects imported maps that fail project topology rules (for example missing extraction)
      - allows warnings but blocks hard map errors before state is mutated
    - Added live canonical-drift status in the tilemap tab:
      - shows whether the current editor map is still in sync with canonical Tiled data
      - surfaces changed areas (`terrain`, `doors`, `markers`, `terrainTextures`, `props`, map texture keys)
      - updates immediately after map edits rather than only after full tab rerenders
    - Marker authoring ergonomics:
      - corrected stale editor marker labels to current runtime semantics (`terminal`, `security_card`, `warning_strobe`)
      - spawn/extract markers are now singleton in the browser editor
      - marker layer no longer exposes fill mode, reducing accidental bad marker floods
    - Canonical Tiled naming normalized:
      - Tiled marker naming now uses `terminal` / `security_card`
      - import path remains backward-compatible with legacy `objective` / `queen_marker`
      - existing `maps/*.json` were normalized and the generated Tiled runtime module rebuilt
    - Layer-safe recovery:
      - tilemap tab now supports resetting only the current layer from canonical Tiled data
    - Door presets and layer control:
      - added door-preset buttons to the tilemap tool panel that paint standard/electronic/locked/welded doors
      - door painting now respects the active preset and supports fill vs pen without manual values
      - layer reset preserves non-door layers while allowing targeted door repairs
      - added “Lockdown”/“Release” directives that auto-apply preset values around spawn/extraction markers
    - Prop presets added for quick placement:
      - desktop/lamp props can be selected via buttons that automatically set the brush asset and radius
      - the Prop Brush section now highlights the active asset and explains the presets
    - Map summary panel:
      - surfaces floor/wall coverage, door counts, marker counts, props, and texture overrides
      - now compares the current map against mission requirements for linked missions
    - Mission requirement continuity:
      - editor mission records now preserve and expose `requiredCards` / `requiredTerminals`
      - mission planner UI now lets authors edit those fields directly
      - package normalization/build/runtime fallback now preserve those fields end-to-end
      - default browser-editor mission metadata was aligned with runtime mission IDs and current map IDs
- Validation:
  - `bash ./scripts/verify.sh` passed after the runtime/gameplay/Tiled changes.
  - `node --check` passed for updated runtime and Tiled scripts.
  - `node --check src/scenes/GameScene.js` passed.
  - `node --check src/systems/EnemyManager.js` passed.
  - Playwright smoke run completed against `http://127.0.0.1:8000/game?renderer=canvas`; screenshot capture worked, but this quick pass did not stage a visible alien hit moment.
  - `node scripts/verify_combat.mjs output/verify-combat-acid http://127.0.0.1:8000/game/?renderer=canvas&mission=m1` completed successfully.
  - Tiled export/import smoke tests passed.
  - Synthetic Tiled metadata test confirmed round-trip for map texture keys, per-tile texture overrides, and props.
  - Browser runtime probe confirmed `tilemapSource: "TILED"` for live mission loading.
  - `npm run build:tiled` passed.
  - Browser editor probe confirmed Tiled controls render on `/editors`.
  - Browser import test confirmed `maps/lv1_colony_hub.json` imports cleanly into the editor.
  - Browser export test confirmed Tiled download filename `lv1_colony_hub.json`.
  - Browser negative import test confirmed malformed/broken Tiled maps are rejected with a clear status message.
  - Browser drift-status probe confirmed the tilemap tab starts `in sync` and flips to `drifted` immediately after an edit.
  - Browser marker probe confirmed the corrected marker labels render and repeated spawn placement leaves exactly one active spawn marker in editor state.
  - Browser probe confirmed layer-only reset returns the tilemap tab from `drifted` back to `in sync`.
  - Browser mission-planner probe confirmed `Cards` / `Terms` columns render and the tilemap summary reflects requirement status.

## 2026-03-11

- Documentation / prompt refinement pass:
  - Rewrote `docs/art_direction_master_prompt.md` into a stronger AV + technical-art direction brief grounded in the current Phaser 3 runtime, custom shader stack, and audio systems.
  - Expanded `docs/fx-research.md` with a 2026 update covering current Phaser package status (`3.90.0` stable, `4.0.0-rc.6` beta) plus selective use guidance for built-in FX, Light2D, normal maps, and positional audio.
  - Strengthened `docs/aliens-aesthetic-research.md` with Academy-backed Aliens (1986) context and more concrete SFX / atmosphere / door-pressure recommendations.
  - Refreshed `docs/av-sources.md` with current official Phaser and Academy source links to keep future prompt work grounded in current references instead of stale examples.

- HUD/runtime repair pass:
  - Fixed the `HUD.updateSquad()` startup crash by making `src/ui/HUD.js` tolerate missing ammo state during `GameScene.create()` and read leader/follower ammo from safe sources.
  - Restored follower pulse-rifle ammo state in `src/scenes/GameScene.js` with a live `marineAmmo` map, reload timers, per-shot depletion, and magazine consumption on reload completion.
  - Fixed pulse-rifle magazine pickups in `src/scenes/GameScene.js` so they replenish follower magazine reserves instead of being ignored by the active scene overlap path.
  - Tightened the left-rail HUD card proportions toward `images/mockup2.png` with shorter cards, a green vitals bar, repositioned digits, and a lower stack start to reduce overlap with the top wave strip.
  - Hardened `dev_server.py` by forcing no-store/no-cache headers for all dev responses so HUD/media changes are not hidden by stale browser assets.
  - Added an explicit workflow rule in `md/WORKFLOW.md` requiring every session to update the relevant `md/` files before stopping.

- Regression rollback pass:
  - Fixed `src/systems/SquadSystem.js` so follower separation no longer calls the missing `resolveWalkablePosition()` sprite helper and instead snaps through `findNearestWalkableWorld()`.
  - Removed the extra leader rescale in `src/scenes/GameScene.js` and reduced the normalization scale in `src/entities/TeamLeader.js`, fixing the oversized team-leader sprite.
  - Rolled `src/graphics/AlienTonePipeline.js` back to a restrained grade to stop the scene from going unnaturally bright.
  - Adjusted `src/ui/HUD.js` portrait video sizing toward crop/cover behavior to stop the visible Y-axis squash.

- Visibility triage pass:
  - Ran repeated Playwright screenshot loops against `http://127.0.0.1:8192/game?renderer=canvas` while probing `src/settings/runtimeSettings.js`, `src/lighting/LightingOverlay.js`, and `src/scenes/GameScene.js`.
  - Lowered runtime lighting defaults, capped imported ambient darkness, reduced lighting-overlay fill, reduced overlay alpha, flattened the atmosphere vignette, and disabled the always-on `AlienTone` camera pass.
  - Result: the crash is still fixed and the game loads, but the playfield remains visually hard to read in captured frames, so the remaining issue is likely in the base scene/render presentation rather than one darkness slider.

- Lighting revert + leader scale correction:
  - Reverted the lighting/render-path changes from the visibility triage pass in `src/lighting/LightingOverlay.js`, `src/settings/runtimeSettings.js`, and `src/scenes/GameScene.js`, restoring the branch's prior overlay fill, atmosphere vignette, and `AlienTone` camera pass.
  - Increased the normalization scale in `src/entities/TeamLeader.js` so the team leader no longer reads as undersized after the earlier giant-leader rollback.
  - Playwright check at `output/revert-lighting-check/shot-0.png` shows the revert landed cleanly, though the scene still appears visually dark in capture.

- Base tileset readability fix:
  - Identified `src/scenes/BootScene.js` tileset generation as the main readability problem after lighting reverts did not materially change the frame.
  - Removed the imported/custom floor preference from `generateTileset()` and replaced the dense low-contrast generated floor art with a simpler 20-tile readable set while preserving the existing wall autotile layout.
  - Kept the leader scale bump from the previous pass so the team leader no longer trends tiny after the earlier rollback.
  - Playwright validation at `output/readable-tileset-check/shot-0.png` shows the scene structure is visible again.

- HUD Overhaul & Refinement:
  - Transitioned from "Portrait + Roster" to a "Video-First" quad-card stack on the left rail (`src/ui/HUD.js`).
  - Iteratively reduced HUD footprint from 500px -> 350px -> 250px -> 166px -> **200px** for optimal tactical/screen balance.
  - Implemented **GeometryMask** per card to perfectly clip video feeds and scanlines to the internal frames.
  - Developed **"Cover" scaling logic** to zoom/fit video feeds into frames, eliminating all letterboxing/black bars.
  - Increased video visibility to **88% opacity** and applied a diegetic blue tint (`0x00ccff`) for better UI integration.
  - Repositioned elements based on `images/mockup2.png`: Ammo/Mag shifted down into frame, Name/HP/EKG "tucked" up into the video feed.
  - Removed legacy `createRoster` and `hud_mockup` preloads from `src/scenes/BootScene.js`.
- Door Delegation + TL Movement Lock:
  - Refactored `src/systems/DoorActionSystem.js` to prioritize followers (tech, medic, heavy) for door actions.
  - Implemented TL movement lock in `src/systems/InputHandler.js` and `src/systems/DoorActionSystem.js` during door repositioning/locking.
  - Increased door action durations (hack: 7s, lock: 5s, weld: 8s, unweld: 6s) in `src/config.js`.
  - Ensured followers stay committed to door actions even if attacked in `src/entities/MarineFollower.js` and `src/systems/FollowerCombatSystem.js`.
  - Added health checks to cancel actions if the assigned marine dies.
- Alien Spacing Audit + Hardening:
  - Increased melee bounce radius from 58px to 64px in `src/systems/EnemyMovement.js`.
  - Increased hard push threshold from 32px to 48px in `src/systems/EnemyManager.js`.
  - Scaled per-type `separationRadius` in `src/data/enemyData.js` to prevent visual stacking (Warrior: 54px, Drone: 60px, Queen: 84px).
  - Ensured facehuggers respect spacing rules when not actively leaping.
- Code Cleanup Pass:
  - Removed redundant logic and stale debug logs across `src/` directory.
  - Fixed a `TypeError` in `EnemyManager.js` where `this.manager` was used instead of `this`.
- Validation:
  - `node --check src/ui/HUD.js` passed after the repair/layout pass.
  - `node --check src/scenes/GameScene.js` passed after restoring follower ammo state.
  - `python3 -m py_compile dev_server.py` passed.
  - Playwright screenshot validation completed against `http://127.0.0.1:8192/game?renderer=canvas` with captures in `output/hud-fix-check/shot-0.png`, `output/hud-fix-check-2/shot-0.png`, and `output/hud-fix-check-3/shot-0.png`.
  - `curl http://127.0.0.1:8192/api/error-notes` returned only an older February 13, 2026 entry; this repair pass did not generate a new server-side error note.
  - `node --check src/systems/SquadSystem.js` passed after the regression rollback.
  - `node --check src/entities/TeamLeader.js` passed after removing the overscale path.
  - `node --check src/graphics/AlienTonePipeline.js` passed after the tone rollback.
  - Playwright screenshot validation completed against `http://127.0.0.1:8192/game?renderer=canvas` with `output/regression-fix-check/shot-0.png`; runtime loaded without the reported `SquadSystem.js:658` crash.
  - `node --check src/settings/runtimeSettings.js` passed after the visibility-default reset.
  - `node --check src/lighting/LightingOverlay.js` passed after the overlay-darkness/alpha changes.
  - Additional Playwright captures for visibility triage: `output/visibility-pass/shot-0.png`, `output/visibility-pass/shot-1.png`, `output/visibility-pass-2/shot-0.png`, `output/visibility-pass-2/shot-1.png`, `output/visibility-pass-3/shot-0.png`, `output/visibility-pass-4/shot-0.png`, `output/visibility-pass-5/shot-0.png`, and `output/visibility-pass-6/shot-0.png`.
  - Persistent dev server running on port **8192** with `nohup` for stability.
  - Captured multiple visual verification screenshots (`output/visible-confirmed.png`, `output/final-tuck-check.png`).
  - `bash ./scripts/verify.sh` passed successfully after all changes and fixes.
  - Combat regression harness PASSED all assertions.


## 2026-03-13

- **Audio Engine Stability & Optimization** (`src/audio/SfxEngine.js`):
  - Reduced master gain by 50% (0.26 → 0.13) to address user feedback on excessive volume.
  - Halved `noiseBuffer` size (1.2s → 0.6s) to reduce memory footprint and processing overhead.
  - Removed resource-intensive Tweens from the pulse rifle firing loop; implemented a simplified start/stop mechanism with a short `delayedCall` to prevent "tween buildup" and audio cutouts during intense combat.
  - Increased minimum gap between impact sounds to 60ms to prevent the audio system from being overwhelmed by simultaneous procedural effects.
  - Fixed a bug where the `Tracker Beep Volume` UI setting was ignored by the procedural audio engine.

- **Movie-Accurate Sound Integration** (Aliens 1986):
  - Downloaded and verified high-quality MP3 assets for Xenomorphs and industrial environment.
  - Registered new assets in `src/scenes/BootScene.js`: `alien_hiss`, `alien_screech`, `door_open_close`, `door_weld`, `facehugger_crawl`, `steam_hiss`.
  - Integrated vocalizations into `src/systems/EnemyManager.js`: hisses on bullet hits, screeches on spotting targets, and screech-samples for death vocalizations.
  - Added wet "skittering" leg-taps for facehugger crawling movement.
  - Added heavy hydraulic "thud-slide" sounds for door opening/closing and a looping electrical arc sound for welding actions in `src/systems/DoorActionSystem.js`.

- **Motion Tracker Logic Overhaul** (`src/scenes/GameScene.js`):
  - Implemented a **6-stage frequency system**: beep cadence now scales from 4 seconds (far/quiet) down to 1 second (very close/swarming).
  - Added **Urgency Bonus**: cadence is now driven by both proximity AND the total number of detected contacts.
  - **Room-Aware Proximity**: implemented a 400px "distance penalty" for aliens behind closed doors, ensuring they trigger slower beeps than those in the same room.
  - Unified audio keys to ensure clean transitions between urgency stages without sound overlapping.

- **Door Task & UI Fixes**:
  - Added `unweld` to `TIMED_ACTIONS` in `src/systems/DoorActionSystem.js`, fixing the bug where marines would stand at a door with no progress bar.
  - Added missing `DOOR_LOCK_DURATION` to `src/config.js`, ensuring the "Lock" action now correctly displays a progress bar and takes the intended 3 seconds.
  - Expanded the volume clamping range in the "Hadley's Hope" style profile to allow more user control over beep volume.

- **Validation**:
  - `node --check` passed for all modified files.
  - Verified presence and integrity of new audio assets in `src/audio/`.
  - Confirmed `DOOR_UNWELD_DURATION` and `DOOR_LOCK_DURATION` are correctly consumed by the timed action system.

## Earlier History

Earlier implementation history was previously stored here in detail. That material was mostly code-change history rather than active workflow guidance and had become hard to use as a chronological log. Use git history for full file-level reconstruction when older detail is needed.
