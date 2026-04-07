# Aliens CMS Backend Workstream (Decoupled)

This folder is a separate backend/editor contract track.

Goals:
- Keep gameplay runtime untouched while editor/backend evolves.
- Define stable data contracts for missions, maps, events, and audio cues.
- Allow later integration via adapters instead of direct scene-level edits.

Current status:
- `schemas/mission-package-v1.schema.json` defines the first payload contract.
- `js/normalizeMissionPackage.js` validates and normalizes editor payloads.
- `js/missionPackageQuality.js` analyzes pacing/atmosphere coverage and can auto-tune packages with baseline cues/events.
- `js/checkMissionPackage.mjs` runs contract + quality checks on exported package JSON.

Quick check:

```bash
node editors/backend/js/checkMissionPackage.mjs path/to/aliens-mission-package-v1.json
```

Integration policy:
- No direct imports from `src/scenes/*` in this workstream.
- Gameplay only consumes normalized payloads through future bridge modules.
