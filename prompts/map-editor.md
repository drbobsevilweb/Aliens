# Map Editor Specification

---

## Purpose

Primary world-building tool. Defines:
- Tile layout (floor, walls)
- Markers (mission hooks)
- Doors, objects, lights, story points

Acts as the **anchor system** for all other editors.

---

## Tile Rendering

### Current State: Plain Colors
Tiles render as solid colors by default:
- **Floor**: `#2f3f4c`
- **Wall**: `#8093a3`
- **Empty**: `#000000`

No texture PNGs required. This is the baseline — clean and functional.

### Optional: Texture Override
When texture PNGs exist in `/assets/floor/`, `/assets/wall/`, `/assets/door/`, or authored map metadata, the editor preserves those references. The current live path is intentionally **color-first / placeholder-first** for clarity, with texture metadata kept for later art restoration.

---

## Current Layout

- **Top toolbar**: Paint, Erase, Select, Fill, Pan, save/publish actions
- **Left rail**: Maps panel, Layers panel, paint palette, and map summary
- **Center canvas**: Direct paint/place/drag surface
- **Right rail**: Auto-opening **Tool / Selection** inspector for paint presets, thumbnail asset picking, existing object edits, type swapping, and numeric repositioning
- **Active layer strip**: Floor, Walls, Doors, Spawn Points, Props, Lights, Story, Textures

This reflects the modular `/editors` shell with the newer inspector-driven object editing flow.

---

## Layers

| Layer | Type | Content |
|-------|------|---------|
| terrain | tilelayer | Floor (1), Wall (2), Empty (0) |
| doors | objectgroup | Standard, Electronic, Locked, Welded |
| markers / spawn | objectgroup | Spawn, Extract, Terminal, Security Card, Alien Spawn (including authored 2/4/6/8 counts), Warning Strobe, Vent Point, Egg Cluster |
| props | objectgroup | Sprite/prop placement |
| lights | objectgroup | Light sources |
| story | objectgroup | Story Trigger, Objective, Action Zone, Condition |
| textures | metadata / object support | Terrain overrides and large-texture references preserved for package/runtime fidelity |

---

## External Dependencies

### Image Editor
- Provides:
  - Tile textures (PNG) for floor, wall, door — optional
  - Sprite/prop images for the props layer
- All images sized by the Image Editor (no code-driven scaling)

### Sound Editor
- Not directly used in map editor
- Sounds triggered via Story / Mission Editor

### Story / Mission Editor
- Integrates via **Markers**

---

## Marker System (Critical Integration Point)

Markers act as the **bridge between map and story system**.

### Example

```json
{
  "x": 5,
  "y": 10,
  "layer": "markers",
  "marker_type": "mission_intro"
}
```

### Rules

- Marker types must match:
  - Story Start Node IDs
  - Objective targets
  - Action targets

---

## Tools

| Tool | Key | Description |
|------|-----|-------------|
| Paint | P | Paint tiles/place objects |
| Erase | E | Remove tiles/objects |
| Select | S | Rectangle selection plus existing-object inspect/drag/edit |
| Fill | F | Flood fill region |
| Pan | Space+drag | Navigate the canvas |

### Brush Size
Configurable: 1x1, 2x2, 3x3, 5x5.

---

## Responsibilities

- Placement of: Tiles, Doors, Objects, Lights, Markers, Story Points
- Does NOT handle: Mission logic, Audio playback logic, Sprite sizing

---

## Integration Summary

| System | Interaction |
|--------|-------------|
| Image Editor | Uses exported PNGs for tile textures and props (optional) |
| Sound Editor | None |
| Missions / Actions tabs | Use markers and story points as triggers/references |
| Game Engine | Resolves maps through `PACKAGE → TILED → TEMPLATE` via `resolveMissionLayout()`, then renders color-first terrain with preserved authored metadata |

---
