export class CombatDirector {
    constructor(tuning = null) {
        this.tuning = tuning || {};
        this.state = 'build';
        this.stateSince = -1;
        this.pressure = 0.28;
        this.modifiers = this.buildModifiers();
    }

    update(time, delta, telemetry = {}) {
        if (this.stateSince < 0) this.stateSince = time;
        const hostilesOnScreen = Math.max(0, Number(telemetry.hostilesOnScreen) || 0);
        const teamDamageRecent = Math.max(0, Number(telemetry.teamDamageRecent) || 0);
        const doorPressure = Math.max(0, Number(telemetry.doorPressure) || 0);
        const firing = telemetry.firing === true;
        const avgMorale = Number.isFinite(telemetry.avgMorale) ? telemetry.avgMorale : 0;

        const hostilesNorm = Math.min(1, hostilesOnScreen / 9);
        const dmgNorm = Math.min(1, teamDamageRecent / 55);
        const doorNorm = Math.min(1, doorPressure / 5);
        const panicNorm = Math.min(1, Math.max(0, -avgMorale) / 75);

        const target = Math.max(0.05, Math.min(1,
            hostilesNorm * 0.36 +
            dmgNorm * 0.24 +
            doorNorm * 0.2 +
            (firing ? 0.08 : 0) +
            panicNorm * 0.12
        ));

        const dt = Math.max(0.001, delta / 1000);
        const rise = Number(this.tuning.pressureRiseRate) || 1.25;
        const fall = Number(this.tuning.pressureFallRate) || 0.55;
        const lerpRate = target > this.pressure ? rise : fall;
        this.pressure += (target - this.pressure) * Math.min(1, lerpRate * dt);

        this.updateState(time);
        this.modifiers = this.buildModifiers();
        return this.modifiers;
    }

    updateState(time) {
        const elapsed = time - this.stateSince;
        const peakEnter = Number(this.tuning.peakEnterPressure) || 0.74;
        const releaseEnter = Number(this.tuning.releaseEnterPressure) || 0.46;
        const peakMaxMs = Number(this.tuning.peakMaxMs) || 9500;
        const buildMinMs = Number(this.tuning.buildMinMs) || 2600;
        const releaseMinMs = Number(this.tuning.releaseMinMs) || 2200;
        if (this.state === 'build') {
            if (this.pressure >= peakEnter && elapsed > buildMinMs) {
                this.state = 'peak';
                this.stateSince = time;
            }
            return;
        }
        if (this.state === 'peak') {
            if (this.pressure <= releaseEnter || elapsed > peakMaxMs) {
                this.state = 'release';
                this.stateSince = time;
            }
            return;
        }
        if (this.state === 'release') {
            if (this.pressure <= 0.26 && elapsed > releaseMinMs) {
                this.state = 'build';
                this.stateSince = time;
            }
        }
    }

    buildModifiers() {
        const p = this.pressure;
        const peakBoost = this.state === 'peak' ? 1 : 0;
        const releaseRelief = this.state === 'release' ? 1 : 0;

        return {
            state: this.state,
            pressure: p,
            enemyAggressionMul: 0.92 + p * 0.72 + peakBoost * 0.2,
            enemyFlankMul: 0.85 + p * 0.95,
            enemyDoorDamageMul: 0.85 + p * 0.9 + peakBoost * 0.15,
            marineAccuracyMul: Math.max(0.7, 1.04 - p * 0.32 + releaseRelief * 0.08),
            marineJamMul: 1 + p * 0.45 + peakBoost * 0.25,
            marineReactionMul: 1 + p * 0.18,
        };
    }

    getModifiers() {
        return this.modifiers;
    }
}
