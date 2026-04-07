const RADAR_FONT = 'SevenSegment, "Share Tech Mono", "Courier New", monospace';

export class RadarTrackerScene extends Phaser.Scene {
    constructor() {
        super('RadarTrackerScene');

        this.maxRangeMeters = 50;
        this.radarRadius = 280;
        this.sweepRotationSeconds = 1.35;
        this.sweepTrailDegrees = 58;
        this.spawnIntervalMs = 900;
        this.maxTargets = 10;

        this.targets = [];
        this.nextTargetId = 1;
        this.lastSpawnAt = 0;
        this.lastBeepAt = 0;
        this.lastFlickerAt = 0;
        this.audioUnlocked = false;
        this.flickerAlpha = 0.08;
    }

    create() {
        const width = this.scale.width;
        const height = this.scale.height;

        this.centerX = width * 0.5;
        this.centerY = height * 0.52;

        this.cameras.main.setBackgroundColor('#000000');

        this.createBackdrop(width, height);
        this.createRadarLayers();
        this.createHud();
        this.createAudio();

        this.input.once('pointerdown', () => this.unlockAudio());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownScene());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdownScene());

        for (let i = 0; i < 4; i++) {
            this.spawnTarget(this.time.now - i * 220);
        }
    }

    createBackdrop(width, height) {
        this.backgroundGlow = this.add.graphics();
        this.backgroundGlow.fillGradientStyle(0x001106, 0x001a09, 0x000804, 0x000000, 0.95, 0.95, 1, 1);
        this.backgroundGlow.fillRect(0, 0, width, height);

        this.vignette = this.add.graphics();
        this.vignette.fillStyle(0x000000, 0.42);
        this.vignette.fillRect(0, 0, width, height);

        this.crtGrid = this.add.graphics();
        this.crtGrid.lineStyle(1, 0x00ff66, 0.035);
        for (let y = 0; y < height; y += 4) {
            this.crtGrid.lineBetween(0, y, width, y);
        }

        this.flickerOverlay = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x66ff99, this.flickerAlpha);
        this.flickerOverlay.setBlendMode(Phaser.BlendModes.ADD);
    }

    createRadarLayers() {
        this.frameGraphics = this.add.graphics();
        this.gridGraphics = this.add.graphics();
        this.sweepGraphics = this.add.graphics();
        this.targetGraphics = this.add.graphics();
        this.glowGraphics = this.add.graphics();

        this.drawRadarFrame();
    }

    createHud() {
        const hudStyle = {
            fontFamily: RADAR_FONT,
            fontSize: '22px',
            color: '#61ff8b',
            shadow: { offsetX: 0, offsetY: 0, color: '#00ff66', blur: 10, stroke: true, fill: true },
        };
        const subStyle = {
            fontFamily: RADAR_FONT,
            fontSize: '18px',
            color: '#61ff8b',
            shadow: { offsetX: 0, offsetY: 0, color: '#00ff66', blur: 8, stroke: true, fill: true },
        };

        this.titleText = this.add.text(64, 52, 'M314 MOTION RADAR', hudStyle);
        this.rangeText = this.add.text(64, 96, 'RANGE: 050M', subStyle);
        this.signalText = this.add.text(64, 126, 'SIGNAL: ACTIVE', subStyle);
        this.targetText = this.add.text(64, 156, 'TARGETS: 00', subStyle);

        this.closestText = this.add.text(this.scale.width - 300, 96, 'CLOSEST: ---M', subStyle).setOrigin(0, 0);
        this.sweepText = this.add.text(this.scale.width - 300, 126, 'SWEEP: 267 DEG/S', subStyle).setOrigin(0, 0);
        this.statusText = this.add.text(this.scale.width - 300, 156, 'LINK: STANDBY', subStyle).setOrigin(0, 0);

        this.footerText = this.add.text(
            this.scale.width * 0.5,
            this.scale.height - 42,
            'SCAN FEED LIVE  //  CONTACTS INBOUND  //  CLICK TO ARM AUDIO',
            {
                fontFamily: RADAR_FONT,
                fontSize: '16px',
                color: '#4fff7a',
                shadow: { offsetX: 0, offsetY: 0, color: '#00ff66', blur: 8, stroke: true, fill: true },
            }
        ).setOrigin(0.5, 0.5);
    }

    createAudio() {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.audioContext = AC ? new AC() : null;
        this.masterGain = null;

        if (!this.audioContext) return;

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.06;
        this.masterGain.connect(this.audioContext.destination);
    }

    unlockAudio() {
        if (!this.audioContext) return;
        if (this.audioUnlocked) return;
        this.audioContext.resume().catch(() => {});
        this.audioUnlocked = true;
        this.statusText.setText('LINK: AUDIO ARMED');
    }

    update(time, delta) {
        this.updateTargets(time, delta);
        this.updateSweep(time);
        this.updateHud();
        this.updateAudio(time);
        this.updateFlicker(time);
        this.renderRadar(time);
    }

    updateTargets(time, delta) {
        if (time - this.lastSpawnAt >= this.spawnIntervalMs && this.targets.length < this.maxTargets) {
            this.spawnTarget(time);
            this.lastSpawnAt = time;
        }

        const stepSeconds = delta / 1000;

        for (let i = this.targets.length - 1; i >= 0; i--) {
            const target = this.targets[i];
            target.distanceMeters -= target.speedMetersPerSecond * stepSeconds;
            target.pulse += delta * 0.006 * target.pulseRate;
            target.highlight = Math.max(0, target.highlight - stepSeconds * 1.6);
            target.driftAngle += stepSeconds * target.spin;
            target.angle += Math.sin(target.driftAngle) * 0.0025;

            if (target.distanceMeters <= 1 || time >= target.expiresAt) {
                this.targets.splice(i, 1);
            }
        }
    }

    updateSweep(time) {
        const rotationMs = this.sweepRotationSeconds * 1000;
        const progress = (time % rotationMs) / rotationMs;
        this.sweepAngle = progress * Math.PI * 2;

        const sweepWindow = Phaser.Math.DegToRad(7);
        for (const target of this.targets) {
            const delta = Math.abs(Phaser.Math.Angle.Wrap(this.sweepAngle - target.angle));
            if (delta <= sweepWindow) {
                const proximityBoost = 1 - Phaser.Math.Clamp(target.distanceMeters / this.maxRangeMeters, 0, 1);
                target.highlight = Math.max(target.highlight, 0.5 + proximityBoost * 0.5);
            }
        }
    }

    updateHud() {
        const closest = this.getClosestTarget();
        const closestMeters = closest ? Math.max(1, Math.round(closest.distanceMeters)) : null;

        this.targetText.setText(`TARGETS: ${String(this.targets.length).padStart(2, '0')}`);
        this.closestText.setText(`CLOSEST: ${closestMeters == null ? '---' : String(closestMeters).padStart(3, '0')}M`);
        this.signalText.setText(this.targets.length > 0 ? 'SIGNAL: ACTIVE' : 'SIGNAL: SEARCH');
        this.statusText.setText(this.audioUnlocked ? 'LINK: AUDIO ARMED' : 'LINK: STANDBY');
    }

    updateAudio(time) {
        if (!this.audioContext || !this.masterGain || !this.audioUnlocked) return;

        const closest = this.getClosestTarget();
        if (!closest) return;

        const normalized = Phaser.Math.Clamp(closest.distanceMeters / this.maxRangeMeters, 0, 1);
        const intervalMs = Phaser.Math.Linear(140, 1150, normalized);
        if (time - this.lastBeepAt < intervalMs) return;

        this.playBeep(closest);
        this.lastBeepAt = time;
    }

    updateFlicker(time) {
        if (time - this.lastFlickerAt < 60) return;
        this.lastFlickerAt = time;

        const jitter = Phaser.Math.FloatBetween(-0.018, 0.018);
        const pulse = Math.sin(time * 0.0031) * 0.01;
        this.flickerOverlay.setAlpha(Phaser.Math.Clamp(this.flickerAlpha + jitter + pulse, 0.03, 0.12));
    }

    renderRadar(time) {
        this.gridGraphics.clear();
        this.sweepGraphics.clear();
        this.targetGraphics.clear();
        this.glowGraphics.clear();

        this.drawRadarGrid();
        this.drawSweep(time);
        this.drawTargets(time);
        this.drawOriginGlow(time);
    }

    drawRadarFrame() {
        const g = this.frameGraphics;
        const radius = this.radarRadius;
        const width = this.scale.width;
        const height = this.scale.height;

        g.clear();
        g.fillStyle(0x001008, 0.84);
        g.fillCircle(this.centerX, this.centerY, radius + 36);

        g.lineStyle(3, 0x30ff75, 0.9);
        g.strokeCircle(this.centerX, this.centerY, radius + 12);
        g.lineStyle(1, 0x30ff75, 0.24);
        g.strokeCircle(this.centerX, this.centerY, radius + 20);

        g.lineStyle(1, 0x30ff75, 0.12);
        g.strokeRect(28, 28, width - 56, height - 56);
        g.strokeRect(40, 40, width - 80, height - 80);
    }

    drawRadarGrid() {
        const g = this.gridGraphics;
        const ringCount = 5;

        for (let i = 1; i <= ringCount; i++) {
            const radius = (this.radarRadius / ringCount) * i;
            const alpha = i === ringCount ? 0.48 : 0.22;
            g.lineStyle(1, 0x30ff75, alpha);
            g.strokeCircle(this.centerX, this.centerY, radius);
        }

        const axisAlpha = 0.22;
        g.lineStyle(1, 0x30ff75, axisAlpha);
        g.lineBetween(this.centerX - this.radarRadius, this.centerY, this.centerX + this.radarRadius, this.centerY);
        g.lineBetween(this.centerX, this.centerY - this.radarRadius, this.centerX, this.centerY + this.radarRadius);

        const diagonal = this.radarRadius / Math.sqrt(2);
        g.lineBetween(this.centerX - diagonal, this.centerY - diagonal, this.centerX + diagonal, this.centerY + diagonal);
        g.lineBetween(this.centerX - diagonal, this.centerY + diagonal, this.centerX + diagonal, this.centerY - diagonal);

        g.fillStyle(0x66ff99, 0.9);
        g.fillCircle(this.centerX, this.centerY, 4);

        for (let i = 1; i <= ringCount; i++) {
            const meters = Math.round((this.maxRangeMeters / ringCount) * i);
            const radius = (this.radarRadius / ringCount) * i;
            this.drawRangeLabel(radius, meters);
        }
    }

    drawRangeLabel(radius, meters) {
        if (!this.rangeLabels) this.rangeLabels = [];

        const index = Math.round((meters / this.maxRangeMeters) * 5) - 1;
        if (!this.rangeLabels[index]) {
            this.rangeLabels[index] = this.add.text(0, 0, '', {
                fontFamily: RADAR_FONT,
                fontSize: '13px',
                color: '#47ff76',
                shadow: { offsetX: 0, offsetY: 0, color: '#00ff66', blur: 6, stroke: true, fill: true },
            }).setOrigin(0.5, 0.5);
        }

        this.rangeLabels[index].setText(`${meters}M`);
        this.rangeLabels[index].setPosition(this.centerX + 18, this.centerY - radius + 14);
    }

    drawSweep(time) {
        const g = this.sweepGraphics;
        const trailSteps = 20;
        const trailSpan = Phaser.Math.DegToRad(this.sweepTrailDegrees);

        for (let i = trailSteps; i >= 0; i--) {
            const t = i / trailSteps;
            const angle = this.sweepAngle - trailSpan * t;
            const alpha = (1 - t) * 0.26;
            g.fillStyle(0x38ff7b, alpha);
            g.slice(this.centerX, this.centerY, this.radarRadius, angle - 0.018, angle + 0.018, false);
            g.fillPath();
        }

        const tipX = this.centerX + Math.cos(this.sweepAngle) * this.radarRadius;
        const tipY = this.centerY + Math.sin(this.sweepAngle) * this.radarRadius;

        g.lineStyle(2, 0x86ffad, 0.95);
        g.lineBetween(this.centerX, this.centerY, tipX, tipY);
        g.fillStyle(0xbaffcb, 0.95);
        g.fillCircle(tipX, tipY, 4);

        const halo = 0.08 + 0.03 * Math.sin(time * 0.01);
        g.fillStyle(0x5bff90, halo);
        g.fillCircle(this.centerX, this.centerY, this.radarRadius + 6);
    }

    drawTargets(time) {
        const g = this.targetGraphics;
        const glow = this.glowGraphics;

        for (const target of this.targets) {
            const position = this.getTargetPosition(target);
            const pulse = 0.75 + Math.sin(target.pulse) * 0.25;
            const size = 2.5 + pulse * 2.3 + target.highlight * 2.2;
            const glowSize = size * (2.4 + target.highlight * 0.8);
            const alpha = 0.45 + pulse * 0.25 + target.highlight * 0.3;

            glow.fillStyle(0x31ff72, alpha * 0.18);
            glow.fillCircle(position.x, position.y, glowSize);

            g.fillStyle(0x88ffab, alpha);
            g.fillCircle(position.x, position.y, size);

            g.lineStyle(1, 0xb7ffca, 0.5 + target.highlight * 0.35);
            g.strokeCircle(position.x, position.y, size + 1.5);
        }
    }

    drawOriginGlow(time) {
        const glow = this.glowGraphics;
        glow.fillStyle(0x56ff88, 0.16 + Math.sin(time * 0.006) * 0.03);
        glow.fillCircle(this.centerX, this.centerY, 18);
    }

    getTargetPosition(target) {
        const radius = (target.distanceMeters / this.maxRangeMeters) * this.radarRadius;
        return {
            x: this.centerX + Math.cos(target.angle) * radius,
            y: this.centerY + Math.sin(target.angle) * radius,
        };
    }

    spawnTarget(time) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distanceMeters = Phaser.Math.FloatBetween(this.maxRangeMeters * 0.45, this.maxRangeMeters * 0.92);
        const speedMetersPerSecond = Phaser.Math.FloatBetween(2.6, 7.2);

        this.targets.push({
            id: this.nextTargetId++,
            angle,
            distanceMeters,
            speedMetersPerSecond,
            pulse: Phaser.Math.FloatBetween(0, Math.PI * 2),
            pulseRate: Phaser.Math.FloatBetween(0.75, 1.6),
            highlight: 0,
            driftAngle: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.4, 1.4),
            expiresAt: time + Phaser.Math.Between(8000, 18000),
        });
    }

    getClosestTarget() {
        let closest = null;
        for (const target of this.targets) {
            if (!closest || target.distanceMeters < closest.distanceMeters) closest = target;
        }
        return closest;
    }

    playBeep(target) {
        const ctx = this.audioContext;
        if (!ctx || !this.masterGain) return;

        const now = ctx.currentTime;
        const distanceNorm = Phaser.Math.Clamp(target.distanceMeters / this.maxRangeMeters, 0, 1);
        const pitch = Phaser.Math.Linear(1180, 620, distanceNorm);
        const chirpLength = Phaser.Math.Linear(0.045, 0.12, distanceNorm);

        const osc = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const modGain = ctx.createGain();

        osc.type = 'square';
        mod.type = 'sine';
        filter.type = 'bandpass';

        filter.frequency.value = pitch * 1.25;
        filter.Q.value = 10;
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(pitch * 1.08, now + chirpLength);

        mod.frequency.value = 18;
        modGain.gain.value = 16;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.17, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + chirpLength);

        mod.connect(modGain);
        modGain.connect(osc.frequency);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        mod.start(now);
        osc.stop(now + chirpLength + 0.03);
        mod.stop(now + chirpLength + 0.03);
    }

    shutdownScene() {
        if (this.rangeLabels) {
            for (const label of this.rangeLabels) label?.destroy();
            this.rangeLabels = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
        }

        this.audioContext = null;
        this.masterGain = null;
    }
}