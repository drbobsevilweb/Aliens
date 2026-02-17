# Phaser FX Research Notes (v2.x)

Primary references consulted:
- Phaser particles concepts: https://docs.phaser.io/phaser/concepts/gameobjects/particles
- ParticleEmitter API: https://docs.phaser.io/api-documentation/class/gameobjects-particles-particleemitter
- Explosion emitter example: https://phaser.io/examples/v3.85.0/game-objects/particle-emitter/view/explode-emitter
- Lights concepts: https://docs.phaser.io/phaser/concepts/gameobjects/light
- Dynamic lights examples: https://phaser.io/examples/v3.85.0/game-objects/lights/view/simple-lights

Applied direction in current game:
- Layered impact FX: core flash + sparks + smoke + dynamic light pulse.
- Higher-energy kill bursts with camera shake and acid color palette.
- Added FX load guardrail (dynamic active-particle soft cap).

Next implementation candidates:
- Hybrid system using ParticleEmitter `explode` bursts for impact core events.
- Per-material impact profiles (metal, concrete, organic) with palette + velocity presets.
- Screen-space shockwave sprite for elite/queen hits only.
