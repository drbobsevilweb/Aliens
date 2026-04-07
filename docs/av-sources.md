# AV Overhaul References (Gameplay, SFX, HUD)

This project now uses a procedural WebAudio SFX engine (`src/audio/SfxEngine.js`) for zero-cost, no-key-required sounds.
The references below are candidate external sources/repos for optional next-stage asset upgrades.

## Code / Logic References

- Phaser 3.90 release notes (official):
  - https://phaser.io/news/2025/05/phaser-v390-released
  - Fit: current stable Phaser 3 target; includes enhanced audio support and confirms v3.90 as the active line for this project.

- Phaser releases page (official):
  - https://github.com/phaserjs/phaser/releases
  - Fit: verify current v3/v4 status before proposing engine-specific work.

- EasyStar.js pathfinding (MIT):
  - https://github.com/prettymuchbryce/easystarjs
  - Fit: grid pathing fallback/improvement for corridor traffic.

- Phaser FX concepts (official):
  - https://docs.phaser.io/phaser/concepts/fx
  - Fit: built-in FX stack options for selective glow, bloom, vignette, displacement, and object-level treatment.

- Phaser lights concepts (official):
  - https://docs.phaser.io/phaser/concepts/gameobjects/light
  - Fit: normal-map-aware lighting for floor grates, doors, and resin surfaces.

- Phaser LightPipeline API (official):
  - https://docs.phaser.io/api-documentation/class/renderer-webgl-pipelines-lightpipeline
  - Fit: constraints and capabilities for Light2D + normal map integration.

- Phaser explosion emitter example (official):
  - https://phaser.io/examples/v3.85.0/game-objects/particle-emitter/view/explode-emitter
  - Fit: burst structure reference for acid hits, welding sparks, and breach flashes.

- Phaser 3 Audio API (official docs):
  - https://docs.phaser.io/phaser/concepts/audio
  - Fit: staged migration from procedural SFX to layered sampled / positional sound.

- ZzFX ultra-small synth (MIT):
  - https://github.com/KilledByAPixel/ZzFX
  - Fit: compact, deterministic retro-futuristic SFX generation.

- jsfxr procedural retro SFX (MIT):
  - https://github.com/mneubrand/jsfxr
  - Fit: generate one-shot weapon/interface sounds with tiny footprint.

## SFX Asset Sources

- Kenney Audio packs (CC0):
  - https://kenney.nl/assets?q=audio
  - Fit: import candidate gunfire UI/click/alert layers with permissive license.

- OpenGameArt sci-fi sounds (mixed licenses; filter before import):
  - https://opengameart.org/content/95-sci-fi-sounds
  - Fit: metallic impacts, terminals, ambient industrial accents.

- OpenGameArt free ambient loops (CC-BY 3.0):
  - https://opengameart.org/content/space-ambient-loop
  - Fit: low-level corridor hum and APC command ambience.

- Freesound CC0 sci-fi search endpoint:
  - https://freesound.org/search/?q=sci-fi+beep&f=license:%22Creative+Commons+0%22
  - Fit: tracker pings and machine tones with no attribution requirement.

## Aliens Research References

- Academy 59th Oscars highlights:
  - https://www.oscars.org/videos-photos/59th-oscar-highlights
  - Fit: confirms *Aliens* awards relevance in **Sound Effects Editing** and **Visual Effects**.

- Academy Awards database:
  - https://awardsdatabase.oscars.org/Search/GetResults?query=%7B%22AwardCategory%22%3A%5B%2224%22%5D%2C%22Sort%22%3A%223-Award+Category-Chron%22%2C%22Search%22%3A%22Basic%22%7D
  - Fit: canonical awards lookup for the film's visual-effects context.

- Academy tech-history article / PDF:
  - https://digitalcollections.oscars.org/digital/api/collection/p15759coll4/id/3819/download
  - Fit: reinforces the film's practical / optical, pre-CGI effects identity.

## Art Direction Notes (Aliens-like command UI)

- Keep interface palette in cold blue/cyan range.
- Prefer terminal rails, bracket glyphs, thin borders, sparse text.
- Distinguish gameplay-critical alerts with brighter cyan/amber accents only.
- Keep high-contrast combat readability over pure style.

## Current Direction Call

- Stay on Phaser **3.90.0** for now.
- Prefer selective shader / FX enhancement over engine migration.
- Push SFX toward:
  - tracker identity
  - pulse-rifle layering
  - door-pressure feedback
  - industrial ambient beds
  - unseen-xeno proximity cues
