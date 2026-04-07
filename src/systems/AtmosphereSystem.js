import { CONFIG } from '../config.js';

/**
 * Handles ambient effects, radio chatter, and atmosphere incidents.
 * Extracted from GameScene to improve modularity.
 */
export class AtmosphereSystem {
    constructor(scene) {
        this.scene = scene;

        // --- Ambient soundscape state ---
        this.ventHumStarted = false;
        this.ventHumOsc1 = null;
        this.ventHumOsc2 = null;
        this.ventHumGain = null;

        this.nextPipeGroanAt = 0;
        this.nextDistantThumpAt = 0;
        this.nextAlienChitterAt = 0;
        this._nextAlienScuttleAt = 0;
        this._nextDoorCreakAt = 0;

        // Filtered noise node for vent airflow texture
        this.ventNoiseSource = null;
        this.ventNoiseGain = null;

        // Per-map atmosphere config (set from mission layout)
        this.atmosphereConfig = null;
    }

    // ---------------------------------------------------------------
    //  Ambient Soundscape
    // ---------------------------------------------------------------

    /**
     * Start the continuous ventilation hum (60 Hz sine + 120 Hz harmonic).
     * Called once after SfxEngine's AudioContext is running.
     */
    startVentilationHum() {
        if (this.ventHumStarted) return;
        const sfx = this.scene.sfx;
        if (!sfx || !sfx.enabled) return;
        const ctx = sfx.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;

        this.ventHumStarted = true;

        this.ventHumGain = ctx.createGain();
        this.ventHumGain.gain.setValueAtTime(0.04, ctx.currentTime);
        this.ventHumGain.connect(sfx.master);

        // 60 Hz fundamental
        this.ventHumOsc1 = ctx.createOscillator();
        this.ventHumOsc1.type = 'sine';
        this.ventHumOsc1.frequency.setValueAtTime(60, ctx.currentTime);
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(0.7, ctx.currentTime);
        this.ventHumOsc1.connect(g1);
        g1.connect(this.ventHumGain);
        this.ventHumOsc1.start();

        // 120 Hz harmonic
        this.ventHumOsc2 = ctx.createOscillator();
        this.ventHumOsc2.type = 'sine';
        this.ventHumOsc2.frequency.setValueAtTime(120, ctx.currentTime);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.3, ctx.currentTime);
        this.ventHumOsc2.connect(g2);
        g2.connect(this.ventHumGain);
        this.ventHumOsc2.start();

        // Filtered noise layer — gives the hum an airy, duct-flow texture
        if (sfx.noiseBuffer) {
            this.ventNoiseSource = ctx.createBufferSource();
            this.ventNoiseSource.buffer = sfx.noiseBuffer;
            this.ventNoiseSource.loop = true;
            const noiseLp = ctx.createBiquadFilter();
            noiseLp.type = 'lowpass';
            noiseLp.frequency.setValueAtTime(280, ctx.currentTime);
            noiseLp.Q.setValueAtTime(0.7, ctx.currentTime);
            this.ventNoiseGain = ctx.createGain();
            this.ventNoiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
            this.ventNoiseSource.connect(noiseLp);
            noiseLp.connect(this.ventNoiseGain);
            this.ventNoiseGain.connect(this.ventHumGain);
            this.ventNoiseSource.start();
        }
    }

    /**
     * Pipe stress groan — 140 Hz sawtooth + noise burst, 0.4-0.8 s.
     * Gain scales with combat pressure.
     */
    playPipeGroan() {
        const sfx = this.scene.sfx;
        if (!sfx || !sfx.enabled) return;
        const ctx = sfx.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;

        const pressure = this.scene.getCombatPressure();
        const gain = 0.02 + pressure * 0.04; // 0.02 – 0.06
        const dur = 0.4 + Math.random() * 0.4; // 0.4 – 0.8 s
        const t = ctx.currentTime;

        sfx.createTone(140, 'sawtooth', t, dur, Math.min(gain, 0.06), Phaser.Math.Between(-30, 30));
        sfx.createNoise(t + 0.02, dur * 0.6, Math.min(gain * 0.7, 0.04), 100, 800);
    }

    /**
     * Distant thump — 40 Hz sine kick, 0.3 s, hard sub-bass impact.
     */
    playDistantThump() {
        const sfx = this.scene.sfx;
        if (!sfx || !sfx.enabled) return;
        const ctx = sfx.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;

        const t = ctx.currentTime;
        sfx.createTone(40, 'sine', t, 0.3, 0.06);
        sfx.createTone(28, 'sine', t + 0.01, 0.25, 0.04);
        sfx.createTone(82, 'sine', t, 0.8, 0.06);
    }

    /**
     * Alien chittering — rapid high-frequency clicking, "they're in the walls".
     * Only triggered during CombatDirector 'build' state for tension.
     * Uses rapid filtered noise bursts to simulate insectoid mandible clicks.
     */
    playAlienChitter() {
        const sfx = this.scene.sfx;
        if (!sfx || !sfx.enabled) return;
        const ctx = sfx.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;

        const t = ctx.currentTime;
        const clickCount = 3 + Math.floor(Math.random() * 5); // 3-7 rapid clicks
        for (let i = 0; i < clickCount; i++) {
            const offset = i * (0.04 + Math.random() * 0.03); // 40-70ms spacing
            const freq = 2800 + Math.random() * 1400; // 2.8-4.2 kHz
            const clickGain = 0.02 + Math.random() * 0.02; // 0.02-0.04
            sfx.createNoise(t + offset, 0.02 + Math.random() * 0.015, clickGain, freq - 400, freq + 600);
        }
        // Optional trailing hiss/sibilance
        if (Math.random() < 0.4) {
            const hissOffset = clickCount * 0.06;
            sfx.createNoise(t + hissOffset, 0.12 + Math.random() * 0.08, 0.015, 1800, 6000);
        }
    }

    /**
     * Vent hiss sound — short noise burst for vent_hiss atmosphere event.
     */
    playVentHiss() {
        const sfx = this.scene.sfx;
        if (!sfx || !sfx.enabled) return;
        const ctx = sfx.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;

        const t = ctx.currentTime;
        sfx.createNoise(t, 0.5, 0.05, 300, 3000);
        sfx.createNoise(t + 0.08, 0.35, 0.03, 600, 4500);
    }

    /**
     * Update ambient soundscape layers each frame.
     * Must be called from the main update loop.
     */
    updateAmbientSoundscape(time) {
        // Try to start vent hum once audio context is running
        const cfg = this.atmosphereConfig || {};
        if (!this.ventHumStarted && cfg.ventHum !== false) {
            this.startVentilationHum();
        }

        const combatState = this.scene.combatMods?.state || 'build';

        // Pipe stress groans — 8-20 s interval; slightly faster during build
        if (cfg.pipeGroans !== false && time >= this.nextPipeGroanAt) {
            this.playPipeGroan();
            const baseInterval = combatState === 'build' ? 8000 : 12000;
            const variance = combatState === 'build' ? 6000 : 8000;
            this.nextPipeGroanAt = time + baseInterval + Math.random() * variance;
        }

        // Distant thumps — 10-25 s in build (shorter = more tension), 15-40 s in peak
        if (cfg.distantThumps !== false && (combatState === 'build' || combatState === 'peak')) {
            if (time >= this.nextDistantThumpAt) {
                this.playDistantThump();
                const baseInterval = combatState === 'build' ? 10000 : 15000;
                const variance = combatState === 'build' ? 15000 : 25000;
                this.nextDistantThumpAt = time + baseInterval + Math.random() * variance;
            }
        } else {
            // Reset timer so thumps start promptly when state returns
            if (this.nextDistantThumpAt < time) {
                this.nextDistantThumpAt = time + 15000 + Math.random() * 10000;
            }
        }

        // Alien chittering — 5-15 s interval, only during build state
        if (cfg.alienChittering !== false && combatState === 'build') {
            if (time >= this.nextAlienChitterAt) {
                this.playAlienChitter();
                this.nextAlienChitterAt = time + 5000 + Math.random() * 10000;
            }
        } else {
            // Reset so chittering starts promptly on next build phase
            if (this.nextAlienChitterAt < time) {
                this.nextAlienChitterAt = time + 5000 + Math.random() * 5000;
            }
        }

        // Alien scuttling — when any alien is within ~300px of leader
        this.updateAlienScuttle(time);

        // Door creak — when aliens are pressuring doors
        this.updateDoorCreak(time);
    }

    /**
     * Play alien scuttling footstep sounds when nearby.
     */
    updateAlienScuttle(time) {
        if (time < (this._nextAlienScuttleAt || 0)) return;
        const sfx = this.scene.sfx;
        if (!sfx) return;
        const leader = this.scene.leader;
        if (!leader || !leader.active) return;
        const enemies = this.scene.enemyManager?.enemies;
        if (!enemies) return;
        let closestDist = Infinity;
        for (const e of enemies) {
            if (!e.active || e.isDying) continue;
            const dist = Phaser.Math.Distance.Between(leader.x, leader.y, e.x, e.y);
            if (dist < closestDist) closestDist = dist;
        }
        if (closestDist < 300) {
            sfx.playAlienScuttle(closestDist);
            this._nextAlienScuttleAt = time + 2000 + Math.random() * 3000;
        } else {
            this._nextAlienScuttleAt = time + 3000;
        }
    }

    /**
     * Stressed metal creaking when aliens are pressuring doors.
     */
    updateDoorCreak(time) {
        if (time < (this._nextDoorCreakAt || 0)) return;
        const sfx = this.scene.sfx;
        if (!sfx) return;
        const doorPressure = this.scene.enemyManager?.sampleDoorPressure
            ? this.scene.enemyManager.sampleDoorPressure(time) : 0;
        if (doorPressure > 0.2) {
            sfx.playDoorCreak();
            this._nextDoorCreakAt = time + 3000 + Math.random() * 4000;
        } else {
            this._nextDoorCreakAt = time + 2000;
        }
    }

    // ---------------------------------------------------------------
    //  Existing visual ambient systems
    // ---------------------------------------------------------------

    updateAmbientEffects(time, delta) {
        this.updateAmbientDust(time);
        this.updateAmbientSoundscape(time);
    }

    updateAmbientDust(time = this.scene.time.now) {
        const lighting = this.scene.runtimeSettings?.lighting || {};
        const enabled = (Number(lighting.ambientDustDensity) || 0) > 0;
        if (!enabled) return;

        if (time >= this.scene.nextAmbientDustAt) {
            const density = Phaser.Math.Clamp(Number(lighting.ambientDustDensity) || 0.12, 0, 1);
            const count = Math.ceil(Phaser.Math.Linear(1, 4, density));
            for (let i = 0; i < count; i++) {
                this.scene.spawnAmbientDust(time);
            }
            const cadence = Phaser.Math.Linear(800, 180, density);
            this.scene.nextAmbientDustAt = time + cadence;
        }

        if (time >= this.scene.nextAmbientTorchDustAt) {
            const density = Phaser.Math.Clamp(Number(lighting.ambientDustDensity) || 0.12, 0, 1);
            const team = this.scene.squadSystem ? this.scene.squadSystem.getAllMarines() : [this.scene.leader];
            for (const m of team) {
                if (!m || m.active === false || m.alive === false) continue;
                // Only spawn dust in torch beam if moving or high density
                const moving = (m.body?.speed || 0) > 10;
                const chance = moving ? 0.82 : density * 0.5;
                if (Math.random() < chance) {
                    this.scene.spawnAmbientTorchDust(m, time);
                }
            }
            const cadence = Phaser.Math.Linear(400, 120, density);
            this.scene.nextAmbientTorchDustAt = time + cadence;
        }

        if (time >= this.scene.nextAmbientBokehAt) {
            if (Math.random() < 0.18) {
                this.scene.spawnAmbientBokeh(time);
            }
            this.scene.nextAmbientBokehAt = time + Phaser.Math.Between(340, 620);
        }

        if (time >= this.scene.nextAmbientSteamAt) {
            if (Math.random() < 0.24) {
                this.scene.spawnAmbientSteam(time);
            }
            this.scene.nextAmbientSteamAt = time + Phaser.Math.Between(600, 1100);
        }
    }

    updateMarineRadioChatter(time, marines) {
        if (time < (this.scene.nextMarineAmbientRadioAt || 0)) return;
        if (this.scene.getCombatPressure() > 0.15) return; // No idle chatter in combat

        const roll = Math.random();
        if (roll > 0.08) {
            this.scene.nextMarineAmbientRadioAt = time + Phaser.Math.Between(4000, 8000);
            return;
        }

        const eligible = marines.filter(m => m.alive && m.active && m.roleKey !== 'leader');
        if (eligible.length === 0) return;

        const speaker = eligible[Math.floor(Math.random() * eligible.length)];
        const pool = [
            'Clear so far.',
            'Check those corners.',
            'Keep it tight.',
            'Nothing on tracker.',
            'Eyes up.',
            'Watch the secondary lanes.',
            'Still quiet.'
        ];
        const line = pool[Math.floor(Math.random() * pool.length)];

        this.scene.showFloatingText(speaker.x, speaker.y - 32, line, '#9fc7ff');
        this.scene.nextMarineAmbientRadioAt = time + Phaser.Math.Between(12000, 25000);
    }

    updateAtmosphereIncidents(time, marines) {
        if (time < (this.scene.nextAtmosphereIncidentAt || 0)) return;

        const pressure = this.scene.getCombatPressure();
        if (pressure > 0.1) {
            this.scene.nextAtmosphereIncidentAt = time + 5000;
            return;
        }

        // Random creepy atmosphere events when quiet
        if (Math.random() < 0.05) {
            const events = ['vent_hiss', 'distant_thump', 'light_flicker', 'shadow_dart'];
            const evt = events[Math.floor(Math.random() * events.length)];

            switch(evt) {
                case 'vent_hiss':
                    this.scene.emitAmbientVentSteam(time);
                    this.playVentHiss();
                    break;
                case 'distant_thump': {
                    const dir = ['N', 'E', 'S', 'W'][Math.floor(Math.random() * 4)];
                    const cue = this.scene.buildMissionCueWorldFromDir(dir);
                    this.scene.showEdgeWordCue('THUMP', cue.x, cue.y, '#8fcfff');
                    this.playDistantThump();
                    break;
                }
                case 'light_flicker':
                    this.scene.triggerRandomLightFlicker(time);
                    break;
            }
            this.scene?.eventBus?.emit('atmosphereIncident', { type: evt, time });
        }

        this.scene.nextAtmosphereIncidentAt = time + Phaser.Math.Between(8000, 15000);
    }

    /**
     * Pause the ventilation hum (during game pause).
     */
    pauseVentHum() {
        if (this.ventHumGain) {
            const sfx = this.scene.sfx;
            if (sfx?.ctx) this.ventHumGain.gain.setValueAtTime(0, sfx.ctx.currentTime);
        }
    }

    /**
     * Resume the ventilation hum (on unpause).
     */
    resumeVentHum() {
        if (this.ventHumGain) {
            const sfx = this.scene.sfx;
            if (sfx?.ctx) this.ventHumGain.gain.setValueAtTime(0.04, sfx.ctx.currentTime);
        }
    }

    /**
     * Clean up audio nodes on destroy.
     */
    destroy() {
        try { if (this.ventHumOsc1) this.ventHumOsc1.stop(); } catch {}
        try { if (this.ventHumOsc2) this.ventHumOsc2.stop(); } catch {}
        try { if (this.ventNoiseSource) this.ventNoiseSource.stop(); } catch {}
        try { if (this.ventNoiseGain) this.ventNoiseGain.disconnect(); } catch {}
        try { if (this.ventHumGain) this.ventHumGain.disconnect(); } catch {}
        this.ventHumOsc1 = null;
        this.ventHumOsc2 = null;
        this.ventNoiseSource = null;
        this.ventNoiseGain = null;
        this.ventHumGain = null;
        this.ventHumStarted = false;
    }
}
