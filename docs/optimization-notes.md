# Optimization Notes

## System health check
- `npm run verify` (JS syntax, asset sync, regression specs, runtime settings, mission layout, combat harness). Output remains green, so the pipeline is still a reliable health indicator.

## Graphics & shaders
- Phaser’s rendering notes remind us that batching objects with shared textures/pipelines keeps WebGL draw calls from flushing, so keeping light passes grouped dramatically reduces GPU work on scenes heavy with overlays. citeturn0search3
- The new `lightViewRadius`/`lightShaderDistance` knobs gate lens flares, dust, and contact shading to the most relevant sources once the quality tier begins to drop, which echoes the Issue 040 advice to batch textures on one draw call and the Issue 093 warning that light layers quickly consume budgets when allowed to spawn unbounded passes. citeturn0search27turn0search24
- Adaptive alpha scaling now blends contact shadows, hotspots, and lens flares toward `CONFIG.LIGHTING_ADAPTIVE_SHADOW_MIN_ALPHA` when FPS dips, following the same “drop the heavy shader pass” persuasion that Issue 093 promotes for WebGL-lighted scenes. citeturn0search24

## AI & squad behavior
- Flow-field pathfinding tutorials point out that a shared vector field lets every follower read the same direction information instead of recomputing entire paths, so increasing observability (e.g., via the diagnostics panel) makes it easier to confirm whether a shared plan is being reused. citeturn1search0turn1search5
- Multi-agent pathfinding discussions also highlight that occupancy-aware penalties keep large squads from overcrowding choke points without adding expensive per-agent recalculations, which matches the density metrics now exposed in the editor. citeturn1search3turn1search4
- Flow field pathfinding literature (Red Blob Games) reinforces that sharing a flow field per destination keeps per-agent calculation linear rather than exponential, so the squad navigation system should continue reusing shared heuristics instead of triggering fresh searches per follower. citeturn0search2

## Tests
- Added `scripts/test_mission_events.mjs` to exercise `normalizeMissionPackage` payloads, which ensures director events/audio cues keep their sanitized fields, mission scopes, and clamped chance/priority values before the data ever ships. 

## Editors & quality of life
- Tooling best practices for level designers call for lightweight telemetry summaries and clear refresh affordances so iteration doesn’t stall when designers want to check counts or zoom. citeturn2search1turn2search6
- The new diagnostics card bundles map metadata, mission totals, light usage, and zoom status into one glanceable surface with a “Refresh” tap, mirroring those best practices and reducing friction when balancing the map layout.
