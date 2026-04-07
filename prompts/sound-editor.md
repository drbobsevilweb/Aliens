# Sound Editor Specification

---

## Purpose
Prepare, preview, trim, and organize audio assets for missions and gameplay.

The live project supports both the modular **Sound** tab inside `/editors` and the standalone `/sound` page.

---

## Output

Preferred shipped output lives under:

```
/assets/audio/
  /sfx/
  /ui/
  /ambient/
  /music/
```

`.ogg` remains the preferred mission/runtime format, but the editor can browse and work with common source files such as `.mp3`, `.ogg`, `.wav`, `.flac`, and `.m4a`.

---

## Integration

### Missions / Actions tabs
- use saved sounds for:
  - dialogue cues
  - warnings and stingers
  - ambience
  - scripted action-node playback

### Map Editor
- no direct authoring dependency

### Image / HUD Editors
- no direct dependency, but shared UX should stay consistent across the editor shell

---

## Key Features

- waveform editing and preview
- trim (visual + precise)
- multi-segment export
- gain / normalization support
- fade in/out
- reverb / echo / EQ shaping
- loudness + spectrum preview
- loop preview and asset save/delete flows

---

## Responsibility Boundary

| Tool | Responsibility |
|------|----------------|
| Sound Editor | Audio prep, preview, and asset management |
| Missions / Actions tabs | Decide when and how sounds play |

---
