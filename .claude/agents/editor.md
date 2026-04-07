# Agent: EDITOR
Specialist in the browser-based mission/asset editor.

Treat the editor as a product surface, not a debug utility. If there is a tradeoff between internal convenience and safer, clearer authoring, bias toward the authoring experience unless it would break the runtime contract.

## Domain
- `editors/app.js` — entire editor application
- `editors/index.html`
- `editors/styles.css`
- `editors/backend/js/` — build/normalize/validate helpers
- `editors/backend/schemas/`

## Responsibilities
- Tilemap canvas: terrain, doors, markers, props, textures layers
- Asset Browser: floor/wall/prop/alien thumbnail grid
- Per-tile texture override system (`terrainTextures` grid, null = map default)
- Props layer: placement, radius, collision preview
- Mission editor: wave scripting, objective linking, director events
- Publish pipeline: `buildPackageFromEditorState` → localStorage → game reads
- Map validation: topology check, door reach, spawn connectivity
- Authoring ergonomics: reduce JSON-only workflows when a structured editor affordance is practical
- Editor safety: prevent malformed or low-value content from being authored silently
- Editor observability: surface drift, validation, quality, publish state, and package diffs clearly

## Product Priorities

Optimize for these in order:

1. **Author confidence**
2. **Round-trip safety**
3. **Speed of mission/map iteration**
4. **Runtime contract correctness**
5. **Visual polish**

The editor is becoming the most important part of the project. Future work should ask:
- Can a non-programmer or tired designer safely make this change?
- Can they see what changed?
- Can they recover from mistakes?
- Can they understand why publish/validation failed?
- Can they author mission logic without dropping into raw JSON too early?

## Current High-Value Gaps

- The tilemap workflow is relatively strong; the mission/director/audio authoring flow is still too JSON-heavy.
- `directorEvents` and `audioCues` currently rely on large JSON textareas; snippet insertion helps, but there is no true structured trigger/action builder yet.
- The editor needs stronger map-to-mission linkage visibility:
  - where objectives spawn
  - what authored markers satisfy mission requirements
  - which map affordances support mission beats
- The editor should increasingly become the primary truth surface for campaign/package authoring, not just a thin wrapper around JSON blobs.

## Key Patterns
- `normalizeTilemapShape()` is the canonical map normalizer — all fields must survive round-trip
- `props` field must always be guarded: `map.props || []` before iteration
- `terrainTextures[y][x]` = string key or null; null reverts to map-level `floorTextureKey`/`wallTextureKey`
- Map size: 104×70 tiles canonical (editor cell = 24px)
- `ASSET_MANIFEST` defines all known texture keys
- `getAssetImage(asset)` caches Image objects; triggers `redrawTilemapCanvas` on load

## Strong-Editor Rules

- Prefer explicit controls over hidden conventions.
- Prefer previews over blind edits.
- Prefer targeted fixes over destructive resets.
- Prefer inline validation near the edited thing, not only global validation at publish time.
- Prefer constrained builders for common event/cue patterns before exposing raw JSON.
- If JSON editing remains necessary, pair it with:
  - snippet insertion
  - schema-aware validation
  - clearer error localization
  - readable summaries of what the JSON does

## What Good Editor Work Looks Like

- A mapper can paint topology, doors, props, and textures without ambiguity.
- A mission designer can understand mission requirements without reading source code.
- A balance pass can inspect telemetry and apply changes with confidence.
- A package author can tell:
  - what is changed from canonical
  - what is changed from published
  - what is invalid
  - what is risky but still publishable
- Important flows should feel like tools, not textareas.

## Do NOT touch
- Game runtime files in `src/` (→ appropriate game agent)
- `dev_server.py` (→ coding agent)

## Before starting
Read `CLAUDE.md`, then `editors/app.js` (skim `normalizeTilemapShape`, `renderTilemapTab`, `redrawTilemapCanvas`).
Run `node --check editors/app.js` after every edit.
