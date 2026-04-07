# Missions + Actions Editor Specification

---

## Purpose
Defines mission logic, pacing, audio cues, and story/event wiring.

Live authoring is currently split across two modular editor surfaces:
- **Missions** tab — structured event cards, mission-system toggles, audio cues, and story-point references
- **Actions** tab — node/action graph authoring for the ongoing graph-editor migration

---

## Current State

- **Missions** is the stable, package-backed authoring surface today.
- **Actions** is the graph-oriented surface for more advanced authored flows.
- Map markers and `storyPoints` remain the bridge between authored maps and mission logic.

---

## Map Editor Integration

Markers and story points act as:
- mission triggers
- objective targets
- action/graph references
- authored spawn and extraction anchors

### Example

Map:
```json
{
  "marker_type": "mission_intro"
}
```

Mission/event data:
```json
{
  "id": "mission_intro",
  "type": "dialogue",
  "enabled": true
}
```

---

## Sound Editor Integration

Used by mission cards and action graphs for dialogue, cues, warnings, and setpiece beats.

```json
{
  "type": "play_sound",
  "sound": "warning_stinger.ogg"
}
```

---

## Image / HUD Integration

Indirect only.

- **Image** provides sprites, textures, and SVG-authored assets
- **HUD** controls the screen-space presentation of mission log/objective surfaces
- Mission logic references markers, objects, doors, and authored IDs rather than raw image state

---

## Runtime Flow

```plaintext
Map markers / story points
-> mission package data (`missionPackageRuntime.js`)
-> `GameScene` / `MissionFlow` / `CombatDirector`
-> card-driven events today, graph-driven expansion through the Actions tab
```

---

## Data Contracts

- Marker/story-point IDs must stay stable across map and mission data
- Audio filenames must match saved assets under `/assets/audio/`
- Sprite paths must match Image Editor output in `/assets/sprites/scaled/`
- Node-graph authoring should remain backward compatible with existing mission cards until the package path is fully unified

---

## Responsibilities

| System | Responsibility |
|--------|----------------|
| Map Editor | World, markers, story points, authored spawn/extract anchors |
| Image Editor | Visual assets + sizing (sole authority) |
| Sound Editor | Audio prep and cue assets |
| Missions tab | Stable mission/package authoring |
| Actions tab | Graph-oriented story/event wiring |
| Game Engine | Runtime execution and UI feedback |

---

## Example Flow

```plaintext
Player reaches story point / marker
-> mission card or action graph fires
-> dialogue / objective update / audio cue
-> optional spawn, lighting, tracker, or door event
-> objective advances
```

---
