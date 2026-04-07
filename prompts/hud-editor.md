# HUD Editor Specification

---

## Purpose
Author the live HUD layout and presentation for the game’s screen-space UI.

The modular **HUD** tab in `/editors` is the current authoring surface for:
- marine status cards
- objectives panel
- map panel / minimap card
- mission log / subtitle surfaces

---

## Current State

- Drag-and-drop layout editing is live in `editors/tabs/hud.js`
- Sub-elements can be repositioned and styled through the modal/property editor
- HUD changes save through `/api/hud-config` and feed `src/data/hudConfig.js`
- Runtime consumers include `src/ui/HUD.js`, `src/ui/ObjectivesPanel.js`, `src/ui/Minimap.js`, and `src/ui/MissionLog.js`

---

## Core Responsibilities

### Layout
- move and resize top-level HUD panels
- place marine-card internals (portrait, ammo, HP, labels, EKG, action strip)
- align objectives, map, and mission-log surfaces

### Styling
- panel opacity/background/border tuning
- text color and readability tuning
- preserve the CRT / Aliens monitor feel without bottom-docking the cards

### Runtime Fidelity
- keep editor-authored values aligned with the live in-game HUD
- prefer saved config over hard-coded one-off offsets
- maintain the current top-row HUD card layout and vignette guardrails

---

## Integration

| Surface | Integration |
|---------|-------------|
| `src/ui/HUD.js` | Marine-card layout, overheat/ammo/health presentation |
| `src/ui/Minimap.js` | Reads the `mapPanel` key from HUD config |
| `src/ui/ObjectivesPanel.js` | Objective card layout and text styling |
| `src/ui/MissionLog.js` | Subtitle/mission-log positioning |
| `prompts/image-editor.md` | Visual assets only; no sprite scaling in runtime HUD code |

---

## Key Rules

1. Keep the HUD cards as a **top-row / left-rail style monitor surface**, not a bottom dock.
2. Do not use game-sprite `setScale()` as a HUD workaround.
3. Preserve readability first: ammo, HP, objective, and map surfaces must stay clear under pressure.
4. Changes should round-trip cleanly between `/editors` and `/game`.

---

## Validation

After HUD changes:
- load `/editors?tab=hud`
- save through the HUD tab
- open `/game`
- verify the marine cards, `mapPanel`, objectives, and mission log reflect the authored changes

---