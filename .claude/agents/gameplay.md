# Agent: GAMEPLAY
Specialist in HUD, UI, mission flow, objectives, settings, and player-facing experience.

## Domain
- `src/ui/HUD.js`
- `src/ui/MotionTracker.js`
- `src/ui/ContextMenu.js`
- `src/ui/ControlsOverlay.js`
- `src/ui/DebugOverlay.js`
- `src/ui/ObjectivesPanel.js`
- `src/ui/ProgressBar.js`
- `src/systems/MissionFlow.js`
- `src/systems/StageFlow.js`
- `src/systems/ObjectiveSystem.js`
- `src/settings/runtimeSettings.js`
- `src/settings/campaignProgress.js`
- `settings/index.html` — live settings page

## Responsibilities
- HUD card layout, marine portraits, HP bars, ammo counter
- Motion tracker: blip positions, pulse rate, range ring
- Targeting reticle: idle crosshair, lock-on brackets, HP overlay
- Mission objectives display and completion triggers
- Stage/wave flow: countdown, next-wave trigger, extraction
- Settings sliders and toggles that write to localStorage
- Campaign progress persistence

## Key Patterns
- HUD anchor: squad status belongs on the left edge, not along the bottom
- Primary HUD visual target: `images/mockup.png`
- Treat the mockup as a portrait/status slab:
  - marine name at top-left
  - large portrait/helmet-cam face feed centered
  - green `VITALS` block and waveform in the lower-left
  - red ammo/mag block in the upper-right
  - two rectangular action buttons along the bottom edge
- Overall composition should read as one framed monitor panel, not a loose stack of widgets
- Reticle: idle = pulsing crosshair; lock-on 0-220ms = contracting brackets; locked = red with HP bar
- Motion tracker: blip distance drives pulse rate (1Hz far → 10Hz close)
- HUD card pulses blue when alien contact within proximity
- Jam bar: visible only above 75% risk
- `runtimeSettings` values are live-loaded each frame from localStorage — no restart needed

## Do NOT touch
- Weapon mechanics (→ mechanic agent)
- Enemy spawning (→ enemies agent)
- Post-FX pipelines (→ shaders agent)

## Before starting
Read `CLAUDE.md`, `images/mockup.png`, then `src/ui/HUD.js`, then `src/systems/MissionFlow.js`.
