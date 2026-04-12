# Current State Plan

Last audited: 2026-04-11

This file is the current code-grounded planning snapshot for the repo. Use it with `CLAUDE.md`, `md/WORKFLOW.md`, and `md/handoff.md`.

## What Is Live Now

### Runtime

- `BootScene` and `GameScene` are the live orchestration path.
- Mission runs are now authored-spawn-first rather than fallback-wave-first.
- `?package=local` is the package-runtime gate for editor-authored maps and mission content.
- `?noaliens` fully suppresses enemy creation at both scene and spawn-sink levels.
- The node-graph runtime is live through `EventBus`, `ActionDispatcher`, and `GraphRunner`.

### Gameplay Systems

- Squad movement, follower combat, door delegation, authored spawn scheduling, objective flow, minimap, motion tracker, atmosphere, lighting, acid hazards, corpse fade, breach FX, and queen mega-death FX are all implemented.
- Commander lane directives now affect both command-formation spacing and follower combat compliance, so hold/split/fallback calls materially change squad posture and lane response instead of only reading as text.
- Missions currently behave as authored hostile-contact clears, even though some older docs still use wave wording.
- Story points are loaded and triggered at runtime as proximity-driven text/history beats.

### Editor Surface

- The modular editor shell is live with 8 tabs: Image, Tile Maps, Missions, Sound, HUD, Texture, Actions, SVG Actions.
- The Actions tab writes `nodeGraphs` into editor state and those graphs are preserved through package build and loaded by the runtime.
- The Tile Maps tab authors doors, props, lights, story objects, atmosphere, and authored spawn metadata.
- The Game link in the editor intentionally opens `/game?package=local`.

## Current Architecture Reality

### Enemy Flow

- Opening combat comes from immediate authored spawn points.
- Timed authored spawn points dispatch later from the live schedule in `GameScene`.
- Ambient/director backfill is broadly suppressed for authored mission play.
- `CombatDirector` still exists for pressure math and tuning, but many legacy enemy-injection paths are gated off during normal mission runs.

### Lighting And FX

- The live lighting path is overlay-based: `LightingOverlay`, `Raycaster`, and `LightBlockerGrid`.
- The old scene-wide post-FX pipeline stack is no longer the active render path.
- Zone lighting exists now through zone props and localized runtime overrides.
- Queen death FX and baseline breach FX are already implemented.

### Audio

- `SfxEngine` is live with a mixed sample plus procedural path.
- Atmosphere audio is live.
- Tracker audio is live, and the tracker now classifies cone contacts into confirmed, tracked, vent, or uncertain states through the existing count/color readout instead of showing only an undifferentiated count.
- `play_sound` authoring exists in the Actions editor and now resolves against runtime-preloaded sample keys.

### Assets

- Gameplay sprites use the scaled sprite pipeline.
- Marine runtime uses the single `marine_topdown.png` path.
- SVG authoring and persistence are implemented, but runtime SVG consumption is still not wired.

## What Is Partial Or Still Missing

### Highest Value Remaining Work

1. Expand story-point runtime consumption beyond proximity text into mission flow, setpieces, or graph events.
2. Align `MissionFlow` and remaining UI wording with the authored-spawn-only model so the runtime stops talking about waves where it no longer behaves that way.
3. Tighten node-graph action/event parity with runtime catalogs and add stronger end-to-end graph execution coverage.
4. Fix backend/API parity gaps between `server.js` and `dev_server.py`, especially around SVG Actions and legacy sound/editor routes.
4. Continue tightening backend/API parity gaps between `server.js` and `dev_server.py`; SVG asset/list, legacy sound/editor routes, and Node SVG Actions CRUD are now aligned, but other parity drift can still exist.
5. Consolidate or remove stale settings controls that no longer affect runtime.

### Confirmed Partial Areas

- Zone support is real, but the backlog version of painted region tiles is not fully implemented; current runtime uses zone props with area/radius behavior.
- Door breach FX exist, but queen/explosive-specific escalation is still narrower than the original design ambition.
- Material impact response is implemented at a coarse profile level, not a full material matrix.
- Story points exist at runtime, but only shallowly.
- SVG asset authoring exists, but runtime consumption does not.

## Known Drift To Ignore

- Older wave-based mission language in docs does not match the current authored-spawn-first runtime.
- Some older HUD/commander docs still describe buttons and overlays that are no longer exposed in the live HUD.
- Some lighting docs still describe removed post-FX pipeline files as if they are active.
- Some sprite docs still describe registry-driven runtime sizing and sibling animation propagation more strongly than the current code supports.

## Canonical Docs To Use

- `CLAUDE.md` for project context and backlog.
- `md/WORKFLOW.md` for workflow and deletion rules.
- `md/handoff.md` for ownership and recent changes.
- `md/collab.md` for cross-session findings.
- `md/progress.md` for historical change logs.
- `prompts/*.md` for active editor-surface specs.

## Removed In This Cleanup

- `resume.md`
- `md/resume-vscode-dev-2026-04-07.md`
- `prompts/tasks.md`
- `editors/backend/README.md`

These were removed because they were historical or stale enough to mislead new coding sessions, and they were not part of the current canonical doc surface.