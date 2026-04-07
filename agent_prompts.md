# Agent Prompts

External agent prompt entry points live here. Operational workflow is canonical in [`md/WORKFLOW.md`](./md/WORKFLOW.md) and current ownership is canonical in [`md/handoff.md`](./md/handoff.md). For the latest modular editor planning/specs, use [`prompts/`](./prompts).

## Specialist Agents

Specialist prompt files live in `.claude/agents/`.

| Agent | File | Focus |
| --- | --- | --- |
| GRAPHICS | `.claude/agents/graphics.md` | Sprites, textures, animation frames |
| SHADERS | `.claude/agents/shaders.md` | Post-FX, lighting, raycasting |
| EFFECTS | `.claude/agents/effects.md` | Particles, decals, atmosphere FX |
| ENEMIES | `.claude/agents/enemies.md` | Alien AI, spawning, combat pressure |
| FRIENDLIES | `.claude/agents/friendlies.md` | Marine AI, squad behavior |
| MOVEMENT | `.claude/agents/movement.md` | Physics, pathfinding, collision |
| MECHANIC | `.claude/agents/mechanic.md` | Weapons, doors, damage rules |
| GAMEPLAY | `.claude/agents/gameplay.md` | HUD, mission flow, settings UX |
| EDITOR | `.claude/agents/editor.md` | Editors and tooling |
| MAP | `.claude/agents/map.md` | Templates, layout, map data |
| SOUND | `.claude/agents/sound.md` | Audio cues and mixing |
| LOGIC | `.claude/agents/logic.md` | Validation, integrity, verify scripts |
| CODING | `.claude/agents/coding.md` | Architecture, refactors, tooling |

## Coordination Rules

1. Read `README.md`, `md/WORKFLOW.md`, and `md/handoff.md` first.
2. Do not touch paths currently claimed in `md/handoff.md`.
3. Record shared findings in `md/collab.md`.
4. Use `md/progress.md` only for dated historical notes.
5. In ownership notes, use role-first names such as `Coding AI` or `Graphics AI`; add model and session only as secondary metadata.

## Current Visual Reference

- HUD target reference: `images/mockup.png`
- The intended squad HUD is a left-edge monitor panel per marine, not a bottom-docked strip.

## Legacy Prompt Stubs

If you need a paste-in prompt for an external session, keep it short and defer to the canonical docs above rather than duplicating repo rules here.

### Editor-Focused Prompt Stub

```md
Use the EDITOR agent mindset first.

Read `README.md`, `md/WORKFLOW.md`, `md/handoff.md`, `md/collab.md`, and `.claude/agents/editor.md`.

Treat the browser editor as a primary product surface, not a debug panel.
Prioritize:
- author confidence
- round-trip safety
- visibility of map/mission/package state
- replacing fragile JSON-only workflows with structured controls where practical

Audit the current editor before changing it:
- tilemap authoring flow
- mission planner flow
- director events / audio cue authoring flow
- validation / publish / diff / recovery flow

If you stop or need a follow-up prompt, update:
- `md/handoff.md`
- `md/collab.md`
- `md/progress.md`

Leave the next session with exact paths touched, current editor gaps, and validation run.
```

### Short Editor Add-On

```md
The editor is the most important long-term surface in this repo. Bias toward structured authoring, validation clarity, and recoverable workflows over raw JSON power-user ergonomics.
```
