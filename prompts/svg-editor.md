# SVG Editor Specification

Sub-editor within the Image Editor for creating/editing vector shapes used by the game.

---

## Purpose

Replace procedural shape generation in game code (corpse debris, acid splatters, particle shapes) with artist-authored SVG assets. All shapes sized against the marine sprite reference.

---

## Features

### Node Editor
- Drag control points to create/edit SVG paths
- Simple polygon creation (click to place points, close to finish)
- Bezier curve support (drag handles on control points)
- Fill color + stroke color/width controls
- Opacity per shape
- Multiple shapes per SVG file
- Layers panel for shape ordering

### Upload SVG
- Import external SVG files
- Parse and display with editable nodes
- Strip metadata, normalize viewBox

### Marine Reference Overlay
- Marine sprite shown at saved registry size behind the SVG canvas
- Same configurable grid overlay (8px–1024px) from the Image Editor
- Toggle reference on/off
- Helps judge shape proportions relative to in-game entities

### Resize
- Scale SVG shapes relative to marine reference
- Free slider + grid reference lines (same as Image Editor)
- Maintains vector quality at any size

### Export
- Save as SVG to `/assets/svg/<category>/`
- Optional: rasterize to PNG at target size for direct game use
- Both formats saved — SVG as source, PNG as game asset

---

## Directory Structure

```
/assets/svg/
  /corpse/          <- body part shapes (tail, limb, crest, shard, fragment)
  /acid/            <- acid/blood splatter patterns, pool outlines
  /debris/          <- shrapnel, door breach pieces, environmental debris
  /particles/       <- custom particle effect shapes
```

---

## Shape Categories

| Category | Current Source | Examples |
|----------|--------------|----------|
| Corpse parts | `AlienCorpseDebris.js` procedural generation | Tail segments, limb chunks, crest shards, abstract fragments |
| Acid shapes | `GameScene` procedural splatters | Blood splatters, acid pools, kill splash patterns |
| Debris | Procedural particles | Door breach shrapnel, wall fragments |
| Particles | Procedural circles/rects | Spark shapes, smoke wisps, muzzle flash shapes |

---

## Integration

### Image Editor
- SVG editor is a sub-menu/tab within the Image Editor
- Shares the same marine reference and grid overlay system
- Shares the same toolbar style and UX patterns

### Game Engine
- Loads SVGs from `/assets/svg/` or pre-rasterized PNGs
- Replaces procedural shape generation in `AlienCorpseDebris.js`
- Replaces procedural acid splatter shapes
- Each shape has a registry entry with dimensions for physics/collision

### Brightness/Contrast (from Image Editor)
- SVG shapes can also have brightness/contrast/color overlay applied
- Baked into the rasterized PNG export

---

## Key Rules

1. **SVGs replace procedural generation.** No shape creation in game code — all shapes authored here.
2. **Marine is the size reference.** All shapes judged against the saved marine sprite.
3. **Source SVGs preserved.** Originals in `/assets/svg/`, rasterized copies in `/assets/sprites/scaled/` or alongside.
4. **Simple first.** Start with polygon/bezier node editing. Advanced features (boolean ops, gradients) later.
5. **No runtime transforms.** Shapes rendered at authored size — no code-driven scaling or tinting.

---

## UI Layout

```
+------------------+----------------------------+------------------+
| Shape List       | SVG Canvas                 | Properties       |
| (per category)   | - grid overlay             | - fill/stroke    |
|                  | - marine reference bg      | - opacity        |
| [Corpse]         | - draggable nodes          | - dimensions     |
| [Acid]           |                            | - export options |
| [Debris]         |                            |                  |
| [Particles]      |                            | Marine Ref:      |
|                  |                            | [122×118px]      |
| [+ New Shape]    |                            |                  |
| [Upload SVG]     |                            | [Save SVG]       |
|                  |                            | [Export PNG]      |
+------------------+----------------------------+------------------+
```

---

## Implementation Notes

- Use native browser SVG DOM for rendering/editing (no external lib needed)
- `<svg>` element with `contenteditable`-style node dragging via mouse events
- Path data stored as standard SVG `<path d="...">` elements
- Export: `XMLSerializer` for SVG, canvas rasterization for PNG
- Reference marine loaded from sprite registry (same as Image Editor)

---
