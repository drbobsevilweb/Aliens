# Aliens Tactical Shooter Recreation Prompt

Use the following prompt in a fresh model session when you want the best possible shot at recreating this project's gameplay engine, lighting stack, runtime architecture, UI behavior, authoring tools, and tuning surfaces without recreating the original art or audio assets.

## Build Prompt

You are a senior game engine and tools developer. Recreate, as fully as practical, a complete browser-playable top-down squad tactical shooter inspired by Aliens (1986). The project must focus on gameplay engine, AI, lighting, runtime systems, UI, mission logic, persistence, and browser-based authoring tools. Do not spend effort generating production art, hand-authored animations, or polished sound design. Use simple placeholders, procedural textures, vector shapes, generated decals, and silent or stubbed audio hooks where needed.

### Product Goal

Build a playable Phaser 3 game in vanilla JavaScript ES modules with no bundler. The experience is a tense top-down Colonial Marines tactical shooter with:

- one player-controlled team leader
- multiple marine followers with autonomous tactical combat behavior
- xenomorph enemies with different movement and attack archetypes
- raycasted lighting and torch visibility
- door interaction, welding, locking, destruction, and breach behavior
- wave-based combat paced by a Combat Director using build -> peak -> release tension
- objective-driven missions with extraction flow
- a motion tracker, HUD, minimap, mission log, and tactical overlays
- a browser-based content editor for maps, missions, HUD layout, actions, and settings

The result should feel like a game production prototype rather than a toy demo.

### Hard Constraints

- Use Phaser 3.
- Use plain ES modules in the browser. No TypeScript, no React, no bundler unless absolutely unavoidable.
- Tile size is 64 pixels.
- Game camera and runtime should work on desktop browsers first.
- Use placeholder visuals only: flat-color tiles, generated textures, simple shapes, temporary sprites, or neutral stand-ins.
- Do not invest in custom graphics pipelines for authored art.
- Do not invest in final sound content. It is acceptable to use silent hooks, minimal procedural beeps, or no-op audio adapters as long as audio integration points exist.
- Preserve a clear separation between runtime systems, data definitions, map generation/loading, lighting, UI, and editors.

### Core Experience Pillars

1. Squad command under pressure.
2. Claustrophobic lighting and limited visibility.
3. Fast lethal close-range alien threats.
4. Door control as a tactical system, not decoration.
5. Escalating combat pressure with short relief windows.
6. Rich runtime tuning and editor-driven content authoring.

### Required Runtime Architecture

Organize the code into modules roughly matching this structure:

- `src/scenes/`
  - `BootScene`: preload, procedural textures, startup assets, config bootstrap.
  - `GameScene`: main runtime scene, system orchestration, mission startup, input routing, update loop.
- `src/entities/`
  - team leader
  - marine follower
  - alien enemy
  - alien egg
  - door and door manager
  - bullet and bullet pool
  - acid pool and acid projectile
- `src/systems/`
  - CombatDirector
  - EnemyManager
  - EnemyMovement
  - EnemySpawner
  - EnemyDetection
  - EnemyTargeting
  - MovementSystem
  - InputHandler
  - WeaponManager
  - SquadSystem
  - MissionFlow
  - DoorActionSystem
  - AtmosphereSystem
  - ReinforcementSystem
  - FollowerCombatSystem
  - CommanderSystem
  - ObjectiveSystem
  - SetpieceSystem
  - TargetingSystem
  - SectorMapper
  - StageFlow
- `src/lighting/`
  - LightingOverlay
  - Raycaster
  - LightBlockerGrid
- `src/ui/`
  - HUD
  - MotionTracker
  - ContextMenu
  - ControlsOverlay
  - DebugOverlay
  - ObjectivesPanel
  - MissionLog
  - ProgressBar
- `src/data/`
  - weapon data
  - enemy data
  - mission data
  - pickup data
  - tilemap templates or generated tiled data
- `src/map/`
  - MapBuilder
  - missionLayout
  - AutoTile
  - doorData
  - mapData
- `src/pathfinding/`
  - AStar
  - PathPlanner
  - PathGrid
  - EasyStarAdapter or equivalent
- `src/settings/`
  - runtime settings with live localStorage-backed tuning
  - mission package runtime overrides
  - campaign progress persistence
- `editors/`
  - modular browser-based editors for image metadata, tile maps, missions, sound stubs, HUD, texture browser, actions graph, and SVG-actions concepts
- `scripts/`
  - verification and browser-based regression scripts

### Gameplay Systems To Implement

#### Player and Squad

- The player directly controls a single team leader.
- Followers operate in a squad formation around the leader.
- Followers automatically acquire, track, and fire at relevant threats.
- Followers should not feel static; include idle micro-movement, spacing maintenance, and stuck recovery.
- Include a hard failsafe warp if a follower remains stuck too long and is far from the leader.
- Followers must understand local threat urgency, close-range danger, and line-of-sight gating.
- Followers need tactical state gates such as reloading, overheat, healing busy state, tracker busy state, or door interaction busy state.

#### Weapons

- Implement at least three weapons:
  - pulse rifle with unlimited ammo but overheat behavior
  - shotgun with limited ammo and pellet spread
  - pistol with limited ammo
- Weapons need cadence, muzzle flashes, hit detection, impact handling, reload or recharge logic, and AI usage rules.
- Projectiles can be hitscan or hybrid, but the result must support impact effects, acid interactions, and combat feedback.

#### Enemies

Implement at least these enemy roles:

- warrior
  - baseline melee alien
  - uses multiple intents such as assault, flank, probe, retreat
- drone
  - fast unit
  - can use vents or alternate ambush routes
  - can interact with doors more aggressively
- facehugger
  - leap and latch behavior
  - erratic movement and disengage behavior
- lesser queen
  - higher threat miniboss
- queen
  - boss-grade unit
  - can breach any door

Enemies must support:

- line-of-sight awareness
- pathfinding around blockers
- melee or leap attacks
- reaction delays and fade-in reveal behavior
- death flow with delayed corpse cleanup
- exclusion from targeting after death begins

#### Combat Director and Pressure

- Build a CombatDirector that regulates encounter rhythm using build -> peak -> release phases.
- Support mission enemy budget, wave pacing, ambient pressure, escalation, and relief windows.
- Allow pressure-driven events such as phantom motion tracker contacts, vent ambushes, or reinforcements.
- Support authored spawns plus fallback runtime wave generation where appropriate.
- Respect clean-map or authored-zero-spawn modes that intentionally suppress enemy creation.

#### Mission Flow

- Support multiple missions, at minimum five.
- Each mission needs:
  - map id
  - objective text
  - enemy budget
  - director tuning
  - required pickups or interactions if used
  - extraction phase
  - optional setpiece events
- Include mission start, progression gates, objective completion, extraction, defeat, and restart flow.

#### Doors and Interaction

- Doors are a major mechanic.
- Implement door states:
  - closed
  - open
  - locked
  - welded
  - destroyed
- Doors must influence movement, occlusion, combat, and pathfinding.
- Doors should be walkability blockers when closed or otherwise impassable.
- Include context-sensitive interactions for opening, welding, unwelding, locking, or breaching.
- Followers should be able to help with door actions when appropriate.
- Ensure the door action update runs after movement resolution so movement and obstruction state remain coherent.

#### Lighting and Visibility

- Recreate a strong gameplay lighting stack, even with placeholder art.
- Use a dark ambient scene with torch-based visibility.
- Implement a multiply-blended lighting overlay.
- Support raycasted torch cones and occlusion from walls and blockers.
- Default ambient darkness should be around 0.72.
- Include room for localized lighting overrides and atmosphere presets.
- Include emergency lighting or pressure-driven lighting shifts.
- Preserve a dark vignette or similar visibility shaping layer.

#### Pathfinding and Collision

- Build a binary walkable grid derived from terrain and blockers.
- Static blockers: walls and impassable door states.
- Dynamic blockers: relevant props or temporary hazards where needed.
- Doors should default to being explicitly marked non-walkable on creation if closed.
- Implement recovery behavior for enemies and followers when pathing fails.
- Include direct local steering for short tactical moves and longer strategic path solves for distant moves.

#### Acid, Corpses, and Environmental Feedback

- Support alien acid blood and acid pools as gameplay hazards.
- Support acid projectiles for ranged alien variants if used.
- Corpses should persist briefly, fade out over time, and stop participating in targeting.
- Add simple procedural gibs or debris fragments even if purely geometric.
- Include wound steam, splash, or hazard residue using lightweight particles.

### UI Requirements

Build a functional HUD that emphasizes tactical readability over visual polish.

Include:

- left-side marine cards or equivalent squad status display
- leader and follower health or vitals
- ammo and overheat state
- current weapon readout
- motion tracker with urgency behavior based on threat distance and count
- minimap panel
- objectives panel
- mission log
- context menu for interactions
- control hint overlay
- debug overlay toggle

The motion tracker should:

- accelerate warning cadence as threats get closer
- account for occlusion penalties so enemies behind doors feel less immediately precise
- support phantom contacts when pressure is building

### Data and Content Model

Define data-first runtime content rather than hardcoding everything into scenes.

At minimum provide:

- weapon definitions
- enemy definitions
- mission definitions
- tilemap template or imported tiled map support
- authored spawn points with enemy type, count, and optional spawn time
- story points and mission events
- runtime settings categories

Provide these approximate gameplay values so the feel stays aligned:

- warrior: speed about 98, hp about 34
- drone: speed about 120, hp about 44
- facehugger: speed about 100, hp about 24
- lesser queen: speed about 120, hp about 82
- queen: speed about 125, hp about 132
- mission 1 budget should not exceed 24

### Browser-Based Authoring Tools

Recreate the editor/tooling side as part of the full project scope. It does not need to be beautiful, but it must be functional and integrated.

Include modular browser surfaces for:

- Image
  - sprite metadata and sizing authority
  - placeholder sprite registry editing
- Tile Maps
  - terrain painting
  - door placement
  - authored spawn placement
  - prop placement
  - light placement
  - story point placement
  - collision preview
- Missions
  - mission records
  - director parameters
  - objective text
  - notes and tuning
- Sound
  - minimal placeholder page is acceptable, but keep the authoring surface and data contract alive
- HUD
  - layout adjustments for panels and sub-elements
- Texture
  - shared placeholder asset browser or metadata surface
- Actions
  - node/action graph authoring for story or mission scripting
- SVG Actions
  - placeholder vector workflow surface for gameplay effect authoring hooks

Editor output should publish package data to local storage or an equivalent local persistence layer, and the game runtime must be able to opt into using that package instead of stock mission data.

### Settings and Live Tuning

Provide a runtime settings surface that updates live without requiring a restart.

Suggested settings categories:

- marines
- enemies
- objects
- walls
- other
- game
- map tile
- scripting
- sprite and animate

These settings should flow through a runtime settings module read during gameplay, not just a one-time boot config.

### Rendering and Placeholder Visual Rules

- Use procedural floor and wall visuals.
- Use simple placeholder sprites or colored silhouettes for marines, aliens, doors, props, bullets, acid, and UI thumbnails.
- Use y-sort depth ordering for entities.
- Keep gameplay readability strong even with no authored art.
- Do not hide missing art by removing gameplay objects; instead show visible placeholders.

### Persistence and Runtime Overrides

- Use localStorage or a minimal local API layer for editor state, mission packages, HUD config, runtime settings, and campaign progress.
- The runtime should support stock built-in missions and locally-authored package overrides.
- The authored package path should be explicit, for example a route flag or query parameter.

### Verification and Test Expectations

Create targeted verification scripts for core systems. Include checks for:

- authored spawn pipeline
- no-aliens suppression mode
- editor publish to runtime fidelity
- follower combat behavior
- tilemap collision preview fidelity
- mission package contract validation
- mission layout generation
- basic browser smoke coverage for editor tabs and runtime boot

Even if the tests are lightweight, the recreated project must show engineering discipline rather than being a one-file prototype.

### Important Behavioral Rules

- Do not increase mission 1 enemy budget above 24.
- Preserve the dark vignette and oppressive lighting.
- Do not rely on sprite scaling for gameplay objects.
- Build the marine leader as a single rotatable top-down actor rather than a sheet-driven directional sprite requirement.
- Treat the image editor or registry as the authority on sprite sizing metadata.
- Ensure the lighting, AI, doors, pathfinding, HUD, and authored runtime override systems all work together coherently.

### Implementation Order

Build in phases:

1. Boot and scene architecture.
2. Map builder, path grid, and collision.
3. Leader movement, input, and camera.
4. Followers, squad formation, and stuck recovery.
5. Weapons, projectiles, and damage.
6. Door states and interaction system.
7. Enemy archetypes and enemy manager.
8. Combat director, waves, and mission flow.
9. Lighting overlay, raycasting, and atmosphere.
10. HUD, tracker, minimap, and objectives.
11. Acid, corpse persistence, and hazard systems.
12. Data definitions and mission content.
13. Editor surfaces and local package runtime integration.
14. Verification scripts and regression coverage.

### Definition of Done

The recreation is successful only if:

- the game is playable from start to extraction or defeat
- squad command and follower combat feel intentional
- enemy pressure ramps over time
- doors materially affect tactics and pathing
- lighting is gameplay-critical, not cosmetic only
- missions, settings, and map data are data-driven
- editor-authored content can reach the runtime
- clean-map or zero-spawn scenarios can be intentionally run without alien leakage
- placeholder-only visuals still produce a readable and tense game

Output the project as a maintainable codebase, not as a speculative design document.

## Usage Notes

- If you use this prompt with another model, tell it whether you want a full codebase, a staged implementation plan, or a repo audit against an existing codebase.
- If you want a shorter version, trim the editor/tooling section and keep only the runtime architecture, gameplay systems, lighting, UI, and validation requirements.