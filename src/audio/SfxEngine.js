export class SfxEngine {
    constructor(scene) {
        this.scene = scene;
        this.ctx = null;
        this.master = null;
        this.compressor = null;
        this.noiseBuffer = null;
        this.enabled = !(scene?.sound?.noAudio === true);
        this.unlocked = false;
        this.lastByKey = new Map();
        this.pulseShortSfx = null;
        this.pulseLongSfx = null;
        this.pulseLoopFadeTween = null;
        this.pulseLoopStopEvent = null;
        this.pulseLoopTargetVolume = 0.272;
        this.pulseRifleAudioEnabled = true;
        this.lastJamPulseAt = 0;
        this.unlockHandler = null;
        this.keyUnlockHandler = null;

        // --- Resource management ---
        this._activeNodes = 0;       // currently playing source nodes
        this._maxActiveNodes = 48;   // hard cap — drop new sounds above this
        this._totalCreated = 0;      // lifetime counter for diagnostics

        if (this.enabled) this.bindUnlock();
    }

    // ---------------------------------------------------------------
    //  Audio Context lifecycle
    // ---------------------------------------------------------------

    bindUnlock() {
        this.unlockHandler = () => {
            const ctx = this.ensureContext(true, true);
            if (!ctx) return;
            if (ctx.state === 'running') {
                this.unlocked = true;
                this.unbindUnlock();
            }
        };
        this.keyUnlockHandler = () => {
            const ctx = this.ensureContext(true, true);
            if (!ctx) return;
            if (ctx.state === 'running') {
                this.unlocked = true;
                this.unbindUnlock();
            }
        };
        this.scene.input?.on?.('pointerdown', this.unlockHandler);
        this.scene.input?.keyboard?.on?.('keydown', this.keyUnlockHandler);
    }

    unbindUnlock() {
        if (this.unlockHandler) {
            this.scene.input?.off?.('pointerdown', this.unlockHandler);
            this.unlockHandler = null;
        }
        if (this.keyUnlockHandler) {
            this.scene.input?.keyboard?.off?.('keydown', this.keyUnlockHandler);
            this.keyUnlockHandler = null;
        }
    }

    ensureContext(resume = false, allowCreate = false) {
        if (!this.enabled) return null;
        if (!this.ctx && !(allowCreate || this.unlocked)) return null;
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try {
                this.ctx = new AC();
            } catch {
                this.enabled = false;
                return null;
            }

            // DynamicsCompressor prevents clipping when many sounds overlap
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);
            this.compressor.connect(this.ctx.destination);

            this.master = this.ctx.createGain();
            this.master.gain.setValueAtTime(0.13, this.ctx.currentTime);
            this.master.connect(this.compressor);

            this.noiseBuffer = this._createNoiseBuffer(1.0);
        }
        if (resume && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                if (this.ctx && this.ctx.state === 'running') this.unlocked = true;
            }).catch(() => {});
        }
        if (this.ctx.state === 'running') this.unlocked = true;
        return this.ctx;
    }

    /** Check if the context is alive and accepting new nodes. */
    _isContextLive() {
        return this.ctx && this.ctx.state === 'running' && this.master;
    }

    /** Gate: returns false if we're over the active-node budget. */
    _canAllocNode() {
        return this._activeNodes < this._maxActiveNodes;
    }

    /**
     * Track a source node (OscillatorNode or AudioBufferSourceNode).
     * Registers an onended handler that disconnects the node chain and
     * decrements the active count.
     */
    _trackNode(sourceNode, ...chain) {
        this._activeNodes++;
        this._totalCreated++;
        sourceNode.onended = () => {
            this._activeNodes = Math.max(0, this._activeNodes - 1);
            for (const node of chain) {
                try { node.disconnect(); } catch { /* already disconnected */ }
            }
        };
    }

    // ---------------------------------------------------------------
    //  Noise buffer
    // ---------------------------------------------------------------

    _createNoiseBuffer(seconds = 1.0) {
        const ctx = this.ctx;
        const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let v = 0;
        for (let i = 0; i < len; i++) {
            v = (v * 0.94) + (Math.random() * 2 - 1) * 0.2;
            data[i] = v;
        }
        return buf;
    }

    // ---------------------------------------------------------------
    //  Throttle
    // ---------------------------------------------------------------

    canPlay(key, minGapMs) {
        const now = performance.now();
        const last = this.lastByKey.get(key) || 0;
        if ((now - last) < minGapMs) return false;
        this.lastByKey.set(key, now);
        return true;
    }

    // ---------------------------------------------------------------
    //  Primitive sound builders (tone + noise)
    // ---------------------------------------------------------------

    createTone(freq, type, at, duration, gain = 0.1, detune = 0) {
        if (!this._canAllocNode()) return null;
        try {
            const ctx = this.ctx;
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(Math.max(20, freq), at);
            if (detune) osc.detune.setValueAtTime(detune, at);
            const safeDur = Math.max(0.04, duration);
            amp.gain.setValueAtTime(0.0001, at);
            amp.gain.linearRampToValueAtTime(gain, at + 0.01);
            amp.gain.exponentialRampToValueAtTime(0.0001, at + safeDur);
            osc.connect(amp);
            amp.connect(this.master);
            osc.start(at);
            osc.stop(at + safeDur + 0.04);
            this._trackNode(osc, osc, amp);
            return amp;
        } catch {
            return null;
        }
    }

    createNoise(at, duration, gain = 0.12, highpass = 480, lowpass = 5000) {
        if (!this._canAllocNode()) return;
        try {
            const ctx = this.ctx;
            const src = ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(highpass, at);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(lowpass, at);
            const amp = ctx.createGain();
            const safeDur = Math.max(0.03, duration);
            amp.gain.setValueAtTime(0.0001, at);
            amp.gain.linearRampToValueAtTime(gain, at + 0.004);
            amp.gain.exponentialRampToValueAtTime(0.0001, at + safeDur);
            src.connect(hp);
            hp.connect(lp);
            lp.connect(amp);
            amp.connect(this.master);
            src.start(at);
            src.stop(at + safeDur + 0.02);
            this._trackNode(src, src, hp, lp, amp);
        } catch {
            // Swallow — context may have been closed between check and use
        }
    }

    // ---------------------------------------------------------------
    //  Sample playback
    // ---------------------------------------------------------------

    playSample(buffer, gain = 0.1) {
        if (!buffer) return;
        if (!this._isContextLive()) return;
        if (!this._canAllocNode()) return;
        try {
            const ctx = this.ctx;
            const src = ctx.createBufferSource();
            const amp = ctx.createGain();
            src.buffer = buffer;
            amp.gain.setValueAtTime(gain, ctx.currentTime);
            src.connect(amp);
            amp.connect(this.master);
            src.start(ctx.currentTime);
            this._trackNode(src, src, amp);
        } catch {
            // Buffer decode error or context closed
        }
    }

    // ---------------------------------------------------------------
    //  Motion tracker
    // ---------------------------------------------------------------

    playTrackerPing({ strong = false, proximity = 0 } = {}) {
        if (!this.enabled) return;

        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;

        const s = this.scene?.runtimeSettings?.other || {};
        const volumeMul = Math.max(0, Number(s.audioBeepVolume) || 1.0);

        if (proximity <= 0.001) {
            // Silent tap every 3s when nothing detected
            if (!this.canPlay('trk_mode1', 180)) return;
            const baseVol = this.pulseLoopTargetVolume * 0.12 * volumeMul;
            this.createTone(120, 'sine', t, 0.02, baseVol * 0.15);
            return;
        }

        // Original motion tracker beep sample
        if (!this.canPlay('trk_beep', 180)) return;
        const buffer = this.scene?.cache?.audio?.get('motion_tracker_beep');
        const vol = strong ? 0.14 * volumeMul : 0.07 * volumeMul;
        if (buffer) {
            this.playSample(buffer, vol);
        } else {
            // Fallback synthesized ping if sample not loaded
            if (!this._canAllocNode()) return;
            const dur = 0.10;
            try {
                const osc = ctx.createOscillator();
                const amp = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(1100, t);
                osc.frequency.linearRampToValueAtTime(750, t + dur);
                amp.gain.setValueAtTime(0.0001, t);
                amp.gain.linearRampToValueAtTime(vol, t + 0.012);
                amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                osc.connect(amp); amp.connect(this.master);
                osc.start(t); osc.stop(t + dur + 0.02);
                this._trackNode(osc, osc, amp);
            } catch { /* ignore */ }
        }
    }

    // ---------------------------------------------------------------
    //  Weapons
    // ---------------------------------------------------------------

    playWeapon(weaponKey = 'pulseRifle') {
        if (!this.enabled) return;
        if (weaponKey === 'pulseRifle') {
            if (!this.pulseRifleAudioEnabled) return;
            this.startPulseRifleLoop();
            return;
        }
        if (!this.canPlay(`wpn_${weaponKey}`, weaponKey === 'pistol' ? 80 : 56)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        if (weaponKey === 'shotgun') {
            const f1 = 92 + (Math.random() - 0.5) * 8;
            const f2 = 140 + (Math.random() - 0.5) * 12;
            const toff = (Math.random() - 0.5) * 0.01;
            this.createNoise(t + toff, 0.2, 0.24, 220, 2600);
            this.createTone(f1, 'sawtooth', t + toff, 0.2, 0.18);
            this.createTone(f2, 'triangle', t + toff + 0.01, 0.16, 0.1, -7);
            return;
        }
        if (weaponKey === 'pistol') {
            const f1 = 220 + (Math.random() - 0.5) * 15;
            const f2 = 320 + (Math.random() - 0.5) * 20;
            const toff = (Math.random() - 0.5) * 0.01;
            this.createNoise(t + toff, 0.08, 0.1, 520, 4200);
            this.createTone(f1, 'square', t + toff, 0.07, 0.1);
            this.createTone(f2, 'triangle', t + toff + 0.006, 0.06, 0.06);
            return;
        }
        this.createNoise(t, 0.11, 0.15, 420, 3600);
        this.createTone(168, 'square', t, 0.1, 0.11);
        this.createTone(245, 'triangle', t + 0.008, 0.09, 0.06, -5);
    }

    initWeaponSamples() {
        if (!this.enabled) return false;
        if (!this.scene?.sound) return false;
        try {
            if (!this.pulseLongSfx && this.scene.cache?.audio?.exists('pulse_rifle_long')) {
                this.pulseLongSfx = this.scene.sound.add('pulse_rifle_long', { volume: 0.001, loop: true });
            }
            if (!this.pulseShortSfx && this.scene.cache?.audio?.exists('pulse_rifle_short')) {
                this.pulseShortSfx = this.scene.sound.add('pulse_rifle_short', { volume: 0.18 });
            }
        } catch {
            return false;
        }
        return !!(this.pulseShortSfx || this.pulseLongSfx);
    }

    startPulseRifleLoop() {
        if (!this.enabled) return false;
        if (!this.initWeaponSamples()) return false;
        if (!this.scene?.sound || this.scene.sound.locked) return false;
        if (!this.pulseLongSfx) return false;
        if (this.pulseLoopStopEvent) {
            this.pulseLoopStopEvent.remove(false);
            this.pulseLoopStopEvent = null;
        }
        if (!this.pulseLongSfx.isPlaying) {
            try {
                this.pulseLongSfx.play({
                    volume: this.pulseLoopTargetVolume,
                    loop: true,
                });
            } catch {
                return false;
            }
        }
        return true;
    }

    forceStopPulseRifleLoop() {
        if (!this.enabled) return;
        if (this.pulseLoopStopEvent) {
            this.pulseLoopStopEvent.remove(false);
            this.pulseLoopStopEvent = null;
        }
        if (this.pulseLongSfx) {
            try { this.pulseLongSfx.stop(); } catch {}
        }
    }

    stopPulseRifleLoop(fadeMs = 85) {
        if (!this.enabled) return;
        if (!this.pulseLongSfx || !this.pulseLongSfx.isPlaying) return;
        if (this.pulseLoopStopEvent) {
            this.pulseLoopStopEvent.remove(false);
            this.pulseLoopStopEvent = null;
        }
        this.scene.tweens.killTweensOf(this.pulseLongSfx);
        const fade = Math.max(20, Number(fadeMs) || 85);
        this.scene.tweens.add({
            targets: this.pulseLongSfx,
            volume: 0.001,
            duration: fade,
            ease: 'Quad.in',
            onComplete: () => {
                if (this.pulseLongSfx?.isPlaying) {
                    try { this.pulseLongSfx.stop(); } catch {}
                }
            },
        });
        this.pulseLoopStopEvent = this.scene.time.delayedCall(fade + 20, () => {
            if (this.pulseLongSfx?.isPlaying) {
                try { this.pulseLongSfx.stop(); } catch {}
            }
            this.pulseLoopStopEvent = null;
        });
    }

    playJamPulse() {
        if (!this.enabled) return;
        if (!this.pulseRifleAudioEnabled) return;
        if (!this.canPlay('wpn_pulse_jam', 140)) return;
        const now = performance.now();
        if ((now - (this.lastJamPulseAt || 0)) < 120) return;
        this.lastJamPulseAt = now;
        if (this.pulseShortSfx && this.scene?.sound && !this.scene.sound.locked) {
            try {
                this.pulseShortSfx.play({ volume: 0.16, rate: 0.72, detune: -360 });
            } catch {}
            return;
        }
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        this.createNoise(t, 0.05, 0.07, 900, 2600);
        this.createTone(170, 'square', t, 0.06, 0.06, -120);
    }

    setPulseFireState({ active = false, jammed = false } = {}) {
        if (!this.enabled) return;
        if (!this.pulseRifleAudioEnabled) {
            this.forceStopPulseRifleLoop();
            return;
        }
        if (active && !jammed) {
            this.startPulseRifleLoop();
            return;
        }
        if (jammed) this.stopPulseRifleLoop(55);
        else this.forceStopPulseRifleLoop();
        if (active && jammed) {
            this.playJamPulse();
        }
    }

    playPulseRifleSamples() {
        return this.startPulseRifleLoop();
    }

    // ---------------------------------------------------------------
    //  Impact sounds
    // ---------------------------------------------------------------

    playImpact(profile = 'wall') {
        if (!this.enabled) return;
        if (!this.canPlay(`imp_${profile}`, 36)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        if (profile === 'flesh' || profile === 'egg') {
            this.createNoise(t, 0.06, 0.08, 120, 900);
            this.createTone(88, 'triangle', t, 0.09, 0.07);
            return;
        }
        if (profile === 'door') {
            this.createNoise(t, 0.08, 0.1, 800, 6200);
            this.createTone(420, 'triangle', t, 0.08, 0.05);
            this.createTone(260, 'sine', t + 0.016, 0.14, 0.04);
            return;
        }
        this.createNoise(t, 0.06, 0.09, 1000, 7000);
        this.createTone(520, 'triangle', t, 0.06, 0.04);
    }

    // ---------------------------------------------------------------
    //  Alien vocalizations
    // ---------------------------------------------------------------

    playAlienDeath(dist = 0) {
        if (!this.enabled) return;
        if (!this.canPlay('alien_death', 80)) return;

        const volume = Math.max(0.05, 1 - (dist / 800));

        // Try to use the screech sample for death
        const buffer = this.scene.cache?.audio?.get('alien_screech');
        if (buffer) {
            this.playSample(buffer, 0.12 * volume);
            return;
        }

        // Procedural death screech
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        try {
            // Primary screech: high sawtooth with rapid pitch drop
            const osc1 = ctx.createOscillator();
            const amp1 = ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(1800, t);
            osc1.frequency.exponentialRampToValueAtTime(400, t + 0.25);
            amp1.gain.setValueAtTime(0.0001, t);
            amp1.gain.linearRampToValueAtTime(0.12, t + 0.008);
            amp1.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            osc1.connect(amp1); amp1.connect(this.master);
            osc1.start(t); osc1.stop(t + 0.35);
            this._trackNode(osc1, osc1, amp1);
            // Harmonic screech layer
            const osc2 = ctx.createOscillator();
            const amp2 = ctx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(2400, t);
            osc2.frequency.exponentialRampToValueAtTime(600, t + 0.2);
            amp2.gain.setValueAtTime(0.0001, t);
            amp2.gain.linearRampToValueAtTime(0.06, t + 0.006);
            amp2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
            osc2.connect(amp2); amp2.connect(this.master);
            osc2.start(t); osc2.stop(t + 0.3);
            this._trackNode(osc2, osc2, amp2);
            // Noise burst — hiss component
            this.createNoise(t, 0.18, 0.08, 800, 6000);
        } catch {
            // Context closed mid-build
        }
    }

    playAlienHiss() {
        if (!this.enabled) return;
        if (!this.canPlay('alien_hiss', 400)) return;
        const buffer = this.scene.cache?.audio?.get('alien_hiss');
        if (buffer) {
            this.playSample(buffer, 0.08);
            return;
        }
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        this.createNoise(ctx.currentTime, 0.3, 0.05, 1200, 6000);
    }

    playAlienScreech(dist = 0) {
        if (!this.enabled) return;
        if (!this.canPlay('alien_screech', 600)) return;
        
        const volume = Math.max(0.05, 1 - (dist / 800));

        const buffer = this.scene.cache?.audio?.get('alien_screech');
        if (buffer) {
            this.playSample(buffer, 0.14 * volume);
            return;
        }
        // Procedural fallback
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        try {
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(2200, t);
            osc.frequency.linearRampToValueAtTime(1400, t + 0.15);
            osc.frequency.exponentialRampToValueAtTime(500, t + 0.4);
            amp.gain.setValueAtTime(0.0001, t);
            amp.gain.linearRampToValueAtTime(0.1, t + 0.01);
            amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
            osc.connect(amp); amp.connect(this.master);
            osc.start(t); osc.stop(t + 0.5);
            this._trackNode(osc, osc, amp);
            this.createNoise(t, 0.25, 0.05, 1000, 5000);
        } catch {}
    }

    playFacehuggerCrawl() {
        if (!this.enabled) return;
        // Light intermittent scuttle — not constant; ~30% chance per eligible call
        if (!this.canPlay('fh_crawl', 800)) return;
        if (Math.random() > 0.70) return;
        const buffer = this.scene.cache?.audio?.get('facehugger_crawl');
        if (buffer) {
            this.playSample(buffer, 0.035);
            return;
        }
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const taps = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < taps; i++) {
            const offset = i * (0.025 + Math.random() * 0.02);
            this.createNoise(t + offset, 0.008, 0.018, 3000 + Math.random() * 2000, 8000);
        }
    }

    // ---------------------------------------------------------------
    //  Door sounds
    // ---------------------------------------------------------------

    playDoorWeld(active = true) {
        if (!this.enabled) return;
        if (!active) {
            if (this.weldSfx?.isPlaying) {
                try { this.weldSfx.stop(); } catch {}
            }
            return;
        }
        if (this.weldSfx?.isPlaying) return;

        try {
            if (!this.weldSfx && this.scene.cache?.audio?.exists('door_weld')) {
                this.weldSfx = this.scene.sound.add('door_weld', { volume: 0.12, loop: true });
            }
            if (this.weldSfx) this.weldSfx.play();
        } catch {}
    }

    playDoorOpenClose() {
        if (!this.enabled) return;
        if (!this.canPlay('doorOpenClose', 150)) return;
        const buffer = this.scene.cache?.audio?.get('door_open_close');
        if (buffer) {
            this.playSample(buffer, 0.15);
        }
    }

    /** Low-frequency door thump — aliens battering the other side. */
    reportDoorThump() {
        if (!this.enabled) return;
        if (!this.canPlay('door_thump', 350)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(this.master);
            osc.frequency.setValueAtTime(80, t);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc.start(t);
            osc.stop(t + 0.35);
            this._trackNode(osc, osc, gain);
        } catch {}
        this.createNoise(t, 0.1, 0.06, 60, 400);
    }

    // ---------------------------------------------------------------
    //  Ambient / environmental
    // ---------------------------------------------------------------

    playSteamHiss() {
        if (!this.enabled) return;
        if (!this.canPlay('steam_hiss', 1000)) return;
        const buffer = this.scene.cache?.audio?.get('steam_hiss');
        if (buffer) {
            this.playSample(buffer, 0.1);
        }
    }

    playAcidImpact() {
        if (!this.enabled) return;
        if (!this.canPlay('acid_impact', 80)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        this.createNoise(t, 0.14, 0.07, 500, 3500);
        this.createTone(140, 'sine', t, 0.1, 0.05);
        this.createNoise(t + 0.03, 0.2, 0.04, 1500, 7000);
    }

    playUiClick(strong = false) {
        if (!this.enabled) return;
        if (!this.canPlay(strong ? 'ui_strong' : 'ui', 28)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        this.createTone(strong ? 720 : 640, 'square', t, strong ? 0.06 : 0.05, strong ? 0.06 : 0.05);
        this.createTone(strong ? 980 : 860, 'triangle', t + 0.012, 0.05, 0.04);
    }

    playHeartbeat(bpm = 70) {
        if (!this.enabled) return;
        const gap = (60 / Math.max(40, bpm)) * 1000;
        if (!this.canPlay('heartbeat', gap * 0.8)) return;

        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;

        // "Lub"
        this.createTone(60, 'sine', t, 0.12, 0.15);
        this.createTone(40, 'sine', t + 0.01, 0.15, 0.1);

        // "Dub"
        const dubT = t + 0.18;
        this.createTone(55, 'sine', dubT, 0.14, 0.12);
        this.createTone(35, 'sine', dubT + 0.01, 0.18, 0.08);
    }

    playJamAlert() {
        if (!this.enabled) return;
        if (!this.canPlay('jam_alert', 250)) return;

        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;

        this.createTone(1800, 'square', t, 0.08, 0.06);
        this.createTone(1950, 'square', t + 0.04, 0.08, 0.06);
        this.createTone(1650, 'square', t + 0.08, 0.12, 0.05);
    }

    /** Alien scuttling footsteps — rapid high-freq clicks for nearby aliens. */
    playAlienScuttle(distance = 200) {
        if (!this.enabled) return;
        if (!this.canPlay('alien_scuttle', 200)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const vol = Math.max(0.005, 0.04 * (1 - Math.min(distance, 400) / 400));
        const clicks = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < clicks; i++) {
            const offset = i * (0.03 + Math.random() * 0.025);
            const freq = 3600 + Math.random() * 1800;
            this.createNoise(t + offset, 0.008, vol, freq - 500, freq + 800);
        }
    }

    /** Marine pain grunt — short noise burst with low-mid tone. */
    playMarineDamageGrunt() {
        if (!this.enabled) return;
        if (!this.canPlay('marine_grunt', 300)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const detuneVal = Math.floor(Math.random() * 81) - 40; // -40 to +40
        this.createTone(180, 'square', t, 0.08, 0.06);
        this.createTone(120, 'sawtooth', t + 0.01, 0.1, 0.04, detuneVal);
        this.createNoise(t, 0.1, 0.05, 200, 1200);
    }

    /** Dry fire click — mechanical snap when weapon is empty. */
    playEmptyClick() {
        if (!this.enabled) return;
        if (!this.canPlay('empty_click', 180)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        this.createTone(1200, 'triangle', t, 0.02, 0.07);
        this.createTone(800, 'square', t + 0.005, 0.015, 0.04);
        this.createNoise(t, 0.015, 0.05, 2000, 8000);
    }

    /** Shell casing tinkle — metallic plink of brass hitting deck. */
    playShellCasing() {
        if (!this.enabled) return;
        if (!this.canPlay('shell_casing', 100)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const bounces = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < bounces; i++) {
            const offset = i * (0.06 + Math.random() * 0.05);
            const freq = 4200 + Math.random() * 2400 - i * 300;
            const bVol = (0.025 - i * 0.006) * (0.7 + Math.random() * 0.3);
            if (bVol > 0.003) {
                this.createTone(freq, 'triangle', t + offset, 0.02 + Math.random() * 0.01, bVol);
            }
        }
    }

    /** Door creak under alien pressure — stressed metal groaning. */
    playDoorCreak() {
        if (!this.enabled) return;
        if (!this.canPlay('door_creak', 1500)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        try {
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, t);
            osc.frequency.linearRampToValueAtTime(95, t + 0.3);
            osc.frequency.linearRampToValueAtTime(70, t + 0.6);
            osc.frequency.linearRampToValueAtTime(85, t + 0.9);
            amp.gain.setValueAtTime(0.0001, t);
            amp.gain.linearRampToValueAtTime(0.05, t + 0.1);
            amp.gain.setValueAtTime(0.05, t + 0.5);
            amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
            osc.connect(amp); amp.connect(this.master);
            osc.start(t); osc.stop(t + 1.05);
            this._trackNode(osc, osc, amp);
            // Metallic resonance
            const detuneVal = Math.floor(Math.random() * 41) - 20;
            this.createTone(220, 'triangle', t + 0.05, 0.6, 0.02, detuneVal);
            this.createNoise(t + 0.1, 0.4, 0.02, 60, 400);
        } catch {}
    }

    /** Tracker carrier hiss — faint static between pings. */
    playTrackerCarrierHiss() {
        if (!this.enabled) return;
        if (!this.canPlay('trk_carrier', 800)) return;
        const ctx = this.ensureContext(false, false);
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const s = this.scene?.runtimeSettings?.other || {};
        const volumeMul = Math.max(0, Number(s.audioBeepVolume) || 1.0);
        this.createNoise(t, 0.06, 0.012 * volumeMul, 800, 3000);
    }

    // ---------------------------------------------------------------
    //  Pause / Resume / Destroy
    // ---------------------------------------------------------------

    /** Pause all audio — mute master gain. Call on game pause. */
    pauseAudio() {
        if (!this.ctx || !this.master) return;
        try {
            this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        } catch {}
        if (this.pulseLongSfx?.isPlaying) {
            try { this.pulseLongSfx.pause(); } catch {}
        }
        if (this.weldSfx?.isPlaying) {
            try { this.weldSfx.pause(); } catch {}
        }
    }

    /** Resume all audio — restore master gain. Call on game unpause. */
    resumeAudio() {
        if (!this.ctx || !this.master) return;
        try {
            this.master.gain.setValueAtTime(0.13, this.ctx.currentTime);
        } catch {}
        if (this.pulseLongSfx?.isPaused) {
            try { this.pulseLongSfx.resume(); } catch {}
        }
        if (this.weldSfx?.isPaused) {
            try { this.weldSfx.resume(); } catch {}
        }
    }

    /** Diagnostics: returns current active node count and lifetime total. */
    getStats() {
        return {
            activeNodes: this._activeNodes,
            maxNodes: this._maxActiveNodes,
            totalCreated: this._totalCreated,
            contextState: this.ctx?.state || 'none',
        };
    }

    destroy() {
        this.lastByKey.clear();
        this.unbindUnlock();
        if (this.pulseShortSfx) {
            try { this.pulseShortSfx.stop(); } catch {}
            try { this.pulseShortSfx.destroy(); } catch {}
            this.pulseShortSfx = null;
        }
        if (this.pulseLongSfx) {
            try { this.pulseLongSfx.stop(); } catch {}
            try { this.pulseLongSfx.destroy(); } catch {}
            this.pulseLongSfx = null;
        }
        if (this.weldSfx) {
            try { this.weldSfx.stop(); } catch {}
            try { this.weldSfx.destroy(); } catch {}
            this.weldSfx = null;
        }
        if (this.master) {
            try { this.master.disconnect(); } catch {}
        }
        if (this.compressor) {
            try { this.compressor.disconnect(); } catch {}
        }
        if (this.ctx && this.ctx.state !== 'closed') {
            try { this.ctx.close(); } catch {}
        }
        this.ctx = null;
        this.master = null;
        this.compressor = null;
        this.noiseBuffer = null;
        this._activeNodes = 0;
    }
}
