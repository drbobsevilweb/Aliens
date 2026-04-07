# Phaser FX Research Notes (v3.x)

Primary references consulted:
- Phaser particles concepts: https://docs.phaser.io/phaser/concepts/gameobjects/particles
- ParticleEmitter API: https://docs.phaser.io/api-documentation/class/gameobjects-particles-particleemitter
- Explosion emitter example: https://phaser.io/examples/v3.85.0/game-objects/particle-emitter/view/explode-emitter
- Lights concepts: https://docs.phaser.io/phaser/concepts/gameobjects/light
- Dynamic lights examples: https://phaser.io/examples/v3.85.0/game-objects/lights/view/simple-lights
- FX concepts: https://docs.phaser.io/phaser/concepts/fx
- Bloom pipeline API: https://docs.phaser.io/api-documentation/class/renderer-webgl-pipelines-fx-bloomfxpipeline
- Normal-map + light example: https://phaser.io/examples/v3.85.0/loader/image/view/load-normal-map-with-light

Applied direction in current game:
- Layered impact FX: core flash + sparks + smoke + dynamic light pulse.
- Higher-energy kill bursts with camera shake and acid color palette.
- Added FX load guardrails:
  - dynamic active-FX cap
  - per-frame burst window cap
- Added smoke drag damping for more realistic steam/plume behavior.
- Added pressure-reactive atmosphere vignette overlay for combat tension.
- Added runtime controls for FX burst limits, vignette base, vignette pressure gain.
- Added runtime control for alien visibility contrast boosting.

## v2.0 Visual Overhaul (Colonial Marines Aesthetic)

### Current Post-FX Direction
- Standalone post-processing pipeline class files in `src/graphics` were removed during cleanup.
- Scanline, tilt-shift, grain, bloom, halation, warp, and related cinematic tuning still exist as
  runtime-configurable post-FX controls driven from `GameScene` and `/settings`.
- Keep future FX notes focused on behavior, tuning targets, and rendering constraints rather than on
  deleted implementation files.

### New Particle Types
- **fx_debris** (12×8): angular metal shard with 3 layered fills at varying alpha; cold steel palette.
  Spawned as impact ricochets alongside existing spark dots — heavier, tumble with more gravity.
- **fx_ember** (16×16): warm glowing particle, 4-level concentric orange→yellow gradient.
  Spawned in alien death bursts — slow upward drift, long life (500–1100ms), simulates residual heat.

### Overhauled Procedural Textures
- **fx_dot**: 4-level concentric gradient (was plain filled circle).
- **fx_smoke**: 5 irregular overlapping blobs (was 2 circles); feathered edges.
- **fx_ring**: thin shockwave with `lineStyle` + inner feather ring + soft center glow.
- **fx_flare**: 4 brightness zones + circle hotspot at origin.
- **Bullet textures**: all 4 types replaced with multi-layer glow (3 concentric fills + core).
- **Door textures**: `door_closed` converted from warm red-brown to cold gunmetal steel palette.
- **Alien textures**: all near-black base with acid-green glow; unique anatomy per type
  (warrior/drone/facehugger/egg/queen_lesser/queen/runner/spitter).

### Tile Palette
- Floor tiles: deep slate `0x1c2830` base (was warm `0x2d3943`); colder grate and slat colors.
- Wall tiles: cold gunmetal `0x3a3e48` (was warm brown `0x7e664d`); subtle hive-green accent panel detail.

### Performance Optimisations
- `EnemyManager`: pre-allocated `targetPressure` Map, cleared each frame (was `new Map()` per frame).
- `EnemyManager`: `pruneLightStimuli` replaced `.filter()` with reverse-splice in-place loop.
- `SquadSystem`: cached `Math.cos/sin(leader.rotation)` once per update frame.
- `SquadSystem`: `applyFollowerSeparation` replaced `.map().filter()` with plain for-loop.
- `CombatDirector`: division in pressure normalization replaced with pre-computed reciprocals.
- `GameScene` FX pool/cap selection: nested ternary chains replaced with keyed object lookup (O(1)).

Implementation principles (kept for performance stability):
- Use additive blend for sparks/core flashes; screen/multiply for smoke/atmosphere layers.
- Keep pooled sprites for deterministic caps and low allocation churn.
- Tie atmospheric intensity to pressure/state, not pure randomness.
- Expose major tuning knobs in `/settings` to avoid code-level balancing passes.

Next implementation candidates:
- Material-tagged impact profiles (metal/hive/organic) selected by collision surface.
- Queen-class signature FX package (screen pulse + directional text + light burst stack).
- Acid puddle glow pulse animation (currently static circle).

## 2026 Update: Phaser 3.90 / Current Engine Guidance

Current package reality as of **March 11, 2026**:
- `npm view phaser version` returns **3.90.0**
- `npm view phaser dist-tags --json` reports:
  - `latest`: `3.90.0`
  - `beta`: `4.0.0-rc.6`
  - `alpha`: `4.0.0-alpha.4`

Implication:
- Do **not** plan a Phaser 4 migration as part of ordinary art / FX iteration.
- Treat Phaser **3.90.0** as the stable target for this project unless there is a dedicated migration task.

### Official Phaser capabilities worth exploiting now

From current official docs / release notes:
- Phaser 3.60+ includes built-in FX pipelines for **Bloom, Blur, Bokeh, Glow, Barrel, Vignette, Pixelate, Shadow, Shine, Gradient, Displacement, Circle, Wipe, and ColorMatrix**.
- FX can be applied to **Game Objects** and **Cameras**, making them useful for selective bursts and overlays rather than always-on full-screen grading.
- Phaser `LightsManager` supports **2D lights + normal maps** on Light2D-enabled objects.
- Phaser 3.90 specifically mentions **enhanced audio support**, including **Firefox fallback support for positional audio**.

### Recommended strategy for this repo

Use the current `GameScene`-driven post-FX controls as the backbone, then selectively add Phaser-native
support where it solves a narrow problem better:

#### 1. Normal-mapped materials for tactical lighting
- Candidate targets:
  - floor grates
  - wall ribs
  - door surfaces
  - resin growth patches
- Benefit:
  - flashlight cones and warning strobes can feel more physical without globally brightening the scene.
- Constraint:
  - keep this focused on high-value tiles / props, not every asset.

#### 2. Object-level glow/bloom for micro-events
- Good use cases:
  - muzzle flash cores
  - welding arcs
  - warning strobes
  - tracker UI peaks
  - acid spit impacts
- Avoid:
  - persistent full-scene bloom that lifts the black level and weakens the film tone.

#### 3. Camera FX for state transitions only
- Good use cases:
  - brief peak-pressure pulse
  - marine near-death stress moment
  - queen encounter onset
- Avoid:
  - always-on camera distortion that makes pathing and target reading worse.

#### 4. Positional audio expansion
- Phaser 3.90 removes one of the practical reasons to avoid spatial audio on Firefox.
- Candidate upgrades:
  - off-screen hiss / scrape cues
  - door breach pounding
  - distant alien movement
  - localized steam and sparks

### Concrete next-pass FX ideas for this project

#### Material response matrix
Create three impact packages keyed by material:
- `metal`: hot spark fan, blue-white ricochet, short ring light
- `resin`: wet dark spray, green mist, sticky decal
- `organic`: acid blood burst, longer drip decay, corpse steam

#### Alert-state lighting package
- Rotate amber door / corridor beacons during `peak`
- Increase shadow contrast in the same moment
- Add short specular hits on floor grates when the sweep crosses them

#### Tracker event package
- Brief additive phosphor bloom on fresh contacts
- Small line-jitter / CRT instability spike when contact density rises
- Stronger echo persistence during build-state uncertainty

#### Door-pressure package
- Muffled impact lights on door edges
- frame dust and spark leakage
- red-hot stress tint only at severe breach stages

### Hard constraints

- Never add an effect that hides enemies in motion.
- Never add full-screen blur during active aiming/fire.
- Keep all major effect intensities runtime-tunable.
- If a new effect cannot survive `scripts/verify.sh` and visual checks, it is not production-ready.

## Source Links

- Phaser 3.90 release: https://phaser.io/news/2025/05/phaser-v390-released
- Phaser releases: https://github.com/phaserjs/phaser/releases
- Phaser FX docs: https://docs.phaser.io/phaser/concepts/fx
- Phaser lights docs: https://docs.phaser.io/phaser/concepts/gameobjects/light
- Phaser LightPipeline API: https://docs.phaser.io/api-documentation/class/renderer-webgl-pipelines-lightpipeline
