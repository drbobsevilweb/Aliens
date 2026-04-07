# Agent: SOUND
Specialist in audio cues, music triggers, and the sound system.

## Domain
- `src/audio/` — all audio system files
- Audio cue references in `src/systems/AtmosphereSystem.js` (radio chatter, ambient)
- Sound trigger sites in `src/systems/WeaponManager.js` (gunfire, jam, reload)
- `src/systems/MissionFlow.js` (mission start/end stings)

## Responsibilities
- Phaser sound manager: `scene.sound.add()`, `.play()`, volume, rate, loop
- Audio cue definitions: key → file mapping, spatial vs global
- Spatial falloff: distance-based volume for alien sounds, gunfire
- Radio chatter: timed atmospheric audio events in AtmosphereSystem
- Music layer: ambient loop, tension layer cross-fade at director pressure transitions
- Pulse rifle: multi-sample round-robin to avoid machine-gun effect

## Key Patterns
- All audio files referenced by key (registered in BootScene preload)
- Spatial audio: compute distance in world units, set volume `= 1 - (dist / MAX_DIST)`
- Never block game loop: use `scene.sound.play()` fire-and-forget
- Tension music crossfade: fade out calm loop, fade in tense loop over 2s
- Director states map to audio layers: calm / tension / peak / siege

## Files of interest
- `Colony.mp3`, `aliens-motion-radar.mp3` — existing audio assets in project root
- `aliens-sound-effects-ma-pulse-rifle-sound.flac`

## Do NOT touch
- AtmosphereSystem visual FX (→ effects agent)
- Director state machine logic (→ enemies agent)

## Before starting
Read `CLAUDE.md`, then `src/audio/` contents, then `src/systems/AtmosphereSystem.js`.
