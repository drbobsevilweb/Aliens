# Aliens CMS Backend Workstream (Decoupled)

This folder is a separate backend/editor contract track.

Goals:
- Keep gameplay runtime untouched while editor/backend evolves.
- Define stable data contracts for missions, maps, events, and audio cues.
- Allow later integration via adapters instead of direct scene-level edits.

Current status:
- `schemas/mission-package-v1.schema.json` defines the first payload contract.
- `js/normalizeMissionPackage.js` validates and normalizes editor payloads.

Integration policy:
- No direct imports from `src/scenes/*` in this workstream.
- Gameplay only consumes normalized payloads through future bridge modules.
