# Image Editor Specification

---

## Purpose

Single tool for all visual asset management: sprites, tiles, textures. The Image Editor is the **sole authority on sprite sizing** in the game. No game code may resize sprites — all sizing is done here.

---

## Core Concepts

### Reference / Scaled Pipeline

All images follow a two-copy pipeline:

```
/assets/sprites/reference/<character>/<filename>.png   <- original, NEVER modified
/assets/sprites/scaled/<character>/<filename>.png      <- editor output, game reads this
```

- **Reference**: Untouched originals. Source for reset operations.
- **Scaled**: Working copies at the user-chosen size. The game engine loads exclusively from `scaled/`.
- **Reset**: Re-copies from `reference/` at original dimensions.

### Sprite Registry (`data/sprite_registry.json`)

Single source of truth for sprite metadata:

```json
{
  "version": 1,
  "referenceSprite": {
    "character": "marine",
    "path": "/assets/sprites/scaled/marine/marine_topdown.png",
    "width": 122,
    "height": 118
  },
  "characters": {
    "marine": {
      "idle": { "ref": "marine_topdown.png", "width": 122, "height": 118 }
    },
    "alien_warrior": {
      "idle": { "ref": "alien_warrior_idle.png", "width": 120, "height": 174 }
    }
  },
  "assignments": {}
}
```

- `referenceSprite` — the player marine. All other sprites are visually compared against this.
- `characters` — per-character animation entries with current dimensions.
- Game reads this on boot. Editor writes on save.

---

## Marine as Reference Sprite

The marine (Team Leader) is the **baseline reference** for all other sprites:

- When the marine is scaled and saved, its new dimensions are written to the registry as `referenceSprite`.
- All other sprites in the editor are displayed alongside the marine for visual comparison.
- The marine is NOT automatically resized when other sprites change.
- Other sprites are NOT automatically resized when the marine changes — the user decides.

---

## Character Animation Propagation

Characters have multiple animations (idle, walk, attack, hurt, die). When the user scales one animation of a character:

1. The scale ratio is calculated from the original reference dimensions.
2. All sibling animations for that character are scaled by the same ratio.
3. All scaled versions are saved to `/assets/sprites/scaled/<character>/`.
4. The originals in `/assets/sprites/reference/` are never touched.
5. Individual animations can be manually overridden afterward.

---

## Grid Overlay

- Configurable reference grid drawn over all sprite previews.
- Default: 32px intervals.
- Adjustable range: 8px to 1024px.
- Helps judge sprite proportions against tile sizes and other sprites.
- Grid is visual only — does not snap or constrain scaling.

---

## Scaling Behavior

- Free slider for continuous scaling.
- 32px gridlines on the preview canvas for visual reference.
- Save writes the scaled PNG to `/assets/sprites/scaled/`.
- Save updates the sprite registry with new dimensions.
- Physics/collision body in-game is derived from the saved sprite pixel dimensions.

---

## Brightness / Contrast / Color Overlay

Per-sprite image adjustments, applied non-destructively in the editor and baked into the saved PNG:

- **Brightness** slider (-100 to +100)
- **Contrast** slider (-100 to +100)
- **Color overlay** — pick a color + blend opacity (0–100%)
- Preview updates live on the canvas
- "Apply" bakes adjustments into the sprite before saving to `scaled/`
- Use case: darken a corpse variant, warm-tint an egg state, adjust contrast for visibility
- No runtime tints — all visual adjustments are done here and saved as pixels

---

## SVG Sub-Editor

A sub-menu within the Image Editor for creating/editing vector shapes used by the game (corpse debris, acid splatters, particle shapes, etc.).

### Features

- **Node editor**: Drag control points to create/edit SVG paths. Simple polygon/bezier creation.
- **Upload SVG**: Import your own SVG files for use in-game.
- **Marine reference overlay**: Marine sprite shown at saved size as a scale reference behind the SVG canvas.
- **Resize**: Scale SVGs relative to the marine reference, same grid overlay system.
- **Export**: Saves as SVG to `/assets/svg/` and optionally rasterizes to PNG at the target size.

### Use Cases

| Shape Type | Example |
|-----------|---------|
| Corpse parts | Tail segments, limb chunks, crest shards |
| Acid shapes | Splatter patterns, pool outlines, blood splats |
| Debris | Shrapnel fragments, door breach pieces |
| Particle shapes | Custom particle sprites for effects |

### Directory Structure

```
/assets/svg/
  /corpse/          <- body part shapes
  /acid/            <- acid/blood splatter shapes
  /debris/          <- environmental debris
  /particles/       <- particle effect shapes
```

### Integration with Game

- Game can load SVGs directly for authored rendering, or use pre-rasterized PNGs.
- Shapes saved here feed the corpse-debris / acid / particle authoring pipeline and can progressively replace older procedural generation as those assets are wired in.
- Same reference/scaled pipeline applies — originals preserved, edited copies saved separately.

---

## Output

- PNG files for sprites/textures.
- SVG files for vector shapes.
- No metadata embedded in images.
- All sizing info stored in `data/sprite_registry.json`.

### Directory Structure

```
/assets/sprites/
  /reference/          <- untouched originals
    /marine/
      marine_topdown.png
    /alien_warrior/
      alien_warrior_idle.png
  /scaled/             <- editor output, game reads this
    /marine/
      marine_topdown.png
    /alien_warrior/
      alien_warrior_idle.png
```

### Tile Textures (future)

```
/assets/
  /floor/              <- floor tile textures
  /wall/               <- wall tile textures
  /door/               <- door textures
  /objects/            <- object/prop textures
```

Currently empty — tilemap uses plain colors. Textures can be added via this editor when needed.

---

## Integration

### Game Engine
- Loads sprites exclusively from `/assets/sprites/scaled/`.
- Reads `data/sprite_registry.json` for dimensions.
- Renders sprites at 1:1 pixel size (no code-driven scaling).
- Physics body derived from sprite dimensions.
- **No `setScale()`, no `LEADER_SIZE` scaling, no `marineSpriteScale`.**

### Map Editor
- Uses tile textures from `/assets/floor/`, `/assets/wall/`, `/assets/door/` when available.
- Falls back to plain colors when no textures assigned.
- Right sidebar texture picker appears when brush tool is active on terrain layer.

### Story / Mission Editor
- Indirect only. Story interacts via markers, objects, doors.

### Sound Editor
- No interaction.

---

## Key Rules

1. **Editor is sole authority on sprite size.** No game code resizes sprites.
2. **Editor is sole authority on sprite appearance.** No runtime tints, color overlays, or brightness adjustments in game code. All visual adjustments baked into PNGs via this editor.
3. **Reference originals are never modified.** Always scale from reference, save to scaled.
4. **Marine is the visual baseline.** All sprites compared against the saved marine size.
5. **Character animations scale together.** Resize one, all siblings follow. Manual override possible.
6. **Registry is the contract.** Game reads dimensions from `sprite_registry.json`, not from code constants.
7. **Pixel-perfect scaling.** Use nearest-neighbor for upscaling, smooth for downscaling.
8. **Reset is always available.** Re-copy from reference to start over.
9. **SVG shapes are the preferred authored path.** Corpse debris, acid splatters, and particle shapes should come from `/assets/svg/` as the runtime wiring is expanded.

---

## Responsibility Boundary

| Tool | Responsibility |
|------|----------------|
| Image Editor | Asset creation, scaling, sizing — single source of truth |
| Map Editor | Tile placement, texture assignment |
| Game Engine | Renders at 1:1 from scaled/, reads registry for metadata |

---

## Current Active Sprites

| Character | Animation | Reference File | Notes |
|-----------|-----------|----------------|-------|
| Marine (Team Leader) | idle | marine_topdown.png (122x118) | Faces north, rotates in-game |
| Alien Warrior | idle | alien_warrior_idle.png (120x174) | Single frame extracted from strip |

All other sprites are future additions. The system supports any number of characters and animations.

---
