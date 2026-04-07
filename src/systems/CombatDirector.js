export class CombatDirector {
    constructor(tuning = null) {
        this.tuning = tuning || {};
        this.scene = null;
        this.state = 'build';
        this.stateSince = -1;
        this.stateHoldUntil = -1;
        this.pressure = 0.12;
        this.targetPressure = 0.12;
        this.damageShockUntil = -1;
        // Pre-computed reciprocals for hot-path pressure normalization.
        this._hostilesInv = 1 / 15;
        this._dmgInv = 1 / 55;
        this._doorInv = 1 / 5;
        this._panicInv = 1 / 75;
        this.modifiers = { state: 'build', pressure: 0, enemyAggressionMul: 1, enemyFlankMul: 1, enemyDoorDamageMul: 1, marineAccuracyMul: 1, marineJamMul: 1, marineReactionMul: 1 };

        // Dynamic spawn tracking
        this.lastFirefightAt = -1;
        this.lastDynamicSpawnAt = -1;
        this.dynamicSpawnCount = 0;
        this.dynamicSpawnMinIntervalMs = Number(this.tuning.dynamicSpawnMinIntervalMs) || 20000;
        this.dynamicSpawnIdleThresholdMs = Number(this.tuning.dynamicSpawnIdleThresholdMs) || 8000;
        this.dynamicSpawnMaxPerEvent = Number(this.tuning.dynamicSpawnMaxPerEvent) || 3;
        this.dynamicSpawnBudget = Number(this.tuning.dynamicSpawnBudget) || 12;
    }

    update(time, delta, telemetry = {}) {
        if (this.stateSince < 0) this.stateSince = time;
        const hostilesOnScreen = Math.max(0, Number(telemetry.hostilesOnScreen) || 0);
        const teamDamageRecent = Math.max(0, Number(telemetry.teamDamageRecent) || 0);
        const doorPressure = Math.max(0, Number(telemetry.doorPressure) || 0);
        const firing = telemetry.firing === true;
        const teamHealthPct = Number.isFinite(telemetry.teamHealthPct) ? telemetry.teamHealthPct : 1;
        const engaged = telemetry.engaged === true || firing || hostilesOnScreen > 0 || teamDamageRecent > 0;
        const avgMorale = Number.isFinite(telemetry.avgMorale) ? telemetry.avgMorale : 0;

        const hostilesNorm = Math.min(1, hostilesOnScreen * this._hostilesInv);
        const dmgNorm = Math.min(1, teamDamageRecent * this._dmgInv);
        const doorNorm = Math.min(1, doorPressure * this._doorInv);
        const panicNorm = Math.min(1, Math.max(0, -avgMorale) * this._panicInv);

        let target = Math.max(0.05, Math.min(1,
            hostilesNorm * 0.36 +
            dmgNorm * 0.24 +
            doorNorm * 0.2 +
            (firing ? 0.08 : 0) +
            panicNorm * 0.12
        ));

        // Comfort policy: when the team is close to collapse, gently bias toward relief.
        const comfortHealthThreshold = Number(this.tuning.comfortHealthThreshold) || 0.5;
        const comfortPressureGate = Number(this.tuning.comfortPressureGate) || 0.58;
        const comfortReliefMul = Number(this.tuning.comfortReliefMul) || 0.82;
        if (teamHealthPct < comfortHealthThreshold && this.pressure > comfortPressureGate) {
            target *= comfortReliefMul;
        }

        const shockThreshold = Number(this.tuning.damageShockThreshold) || 14;
        const shockReliefMs = Number(this.tuning.damageShockReliefMs) || 2400;
        const shockReliefMul = Number(this.tuning.damageShockReliefMul) || 0.68;
        if (teamDamageRecent >= shockThreshold) {
            this.damageShockUntil = Math.max(this.damageShockUntil || -1, time + shockReliefMs);
        }
        const shockActive = time < (this.damageShockUntil || -1);
        if (shockActive) {
            target *= shockReliefMul;
        }

        // Keep pressure from dropping while an engagement is active (except during release).
        const noDecayWhileEngaged = (Number(this.tuning.noDecayWhileEngaged) || 0) > 0;
        if (noDecayWhileEngaged && engaged && this.state !== 'release' && !shockActive && target < this.pressure) {
            target = this.pressure;
        }

        const dt = Math.max(0.001, delta / 1000);
        const rise = Number(this.tuning.pressureRiseRate) || 0.82;
        const fall = Number(this.tuning.pressureFallRate) || 0.55;
        const targetRise = Number(this.tuning.targetPressureRiseRate) || 1.4;
        const targetFall = Number(this.tuning.targetPressureFallRate) || 1.2;
        const targetLerp = target > this.targetPressure ? targetRise : targetFall;
        this.targetPressure += (target - this.targetPressure) * Math.min(1, targetLerp * dt);
        const easedTarget = this.targetPressure;
        const lerpRate = target > this.pressure ? rise : fall;
        this.pressure += (easedTarget - this.pressure) * Math.min(1, lerpRate * dt);

        this.updateState(time, engaged);
        this.modifiers = this.buildModifiers();
        return this.modifiers;
    }

    updateState(time, engaged = false) {
        const elapsed = time - this.stateSince;
        const peakEnter = Number(this.tuning.peakEnterPressure) || 0.74;
        const releaseEnter = Number(this.tuning.releaseEnterPressure) || 0.46;
        const buildEnter = Number(this.tuning.buildEnterPressure) || 0.26;
        const buildExitHyst = Number(this.tuning.buildExitHysteresis) || 0.04;
        const peakExitHyst = Number(this.tuning.peakExitHysteresis) || 0.05;
        const peakMaxMs = Number(this.tuning.peakMaxMs) || 9500;
        const peakMinMs = Number(this.tuning.peakMinMs) || 3000;
        const peakHoldMinMs = Number(this.tuning.peakHoldMinMs) || 3000;
        const peakHoldMaxMs = Number(this.tuning.peakHoldMaxMs) || 5000;
        const buildMinMs = Number(this.tuning.buildMinMs) || 2600;
        const releaseMinMs = Number(this.tuning.releaseMinMs) || 2200;
        const releaseMaxMs = Number(this.tuning.releaseMaxMs) || 10500;
        if (this.state === 'build') {
            if (this.pressure >= (peakEnter + buildExitHyst) && elapsed > buildMinMs) {
                this.state = 'peak';
                this.scene?.eventBus?.emit('directorStateChanged', { from: 'build', to: 'peak', pressure: this.pressure });
                this.stateSince = time;
                this.stateHoldUntil = time + randomRangeInt(peakHoldMinMs, peakHoldMaxMs);
            }
            return;
        }
        if (this.state === 'peak') {
            const holdDone = time >= this.stateHoldUntil;
            const canRelease = elapsed > peakMinMs
                && holdDone
                && (this.pressure <= (releaseEnter - peakExitHyst) || elapsed > peakMaxMs);
            if (canRelease) {
                this.state = 'release';
                this.scene?.eventBus?.emit('directorStateChanged', { from: 'peak', to: 'release', pressure: this.pressure });
                this.stateSince = time;
                this.stateHoldUntil = -1;
            }
            return;
        }
        if (this.state === 'release') {
            const buildFloor = engaged ? Math.min(buildEnter + 0.05, 0.5) : buildEnter;
            if ((this.pressure <= buildFloor && elapsed > releaseMinMs) || elapsed > releaseMaxMs) {
                this.state = 'build';
                this.scene?.eventBus?.emit('directorStateChanged', { from: 'release', to: 'build', pressure: this.pressure });
                this.stateSince = time;
                this.stateHoldUntil = -1;
                this.dynamicSpawnCount = 0; // reset budget each new tension cycle
            }
        }
    }

    buildModifiers() {
        const p = this.pressure;
        const peakBoost = this.state === 'peak' ? 1 : 0;
        const releaseRelief = this.state === 'release' ? 1 : 0;

        const m = this.modifiers;
        m.state = this.state;
        m.pressure = p;
        m.enemyAggressionMul = 1.0 + p * 0.72 + peakBoost * 0.24;
        m.enemyFlankMul = 0.84 + p * 0.98 + peakBoost * 0.1;
        m.enemyDoorDamageMul = 0.82 + p * 0.94 + peakBoost * 0.18;
        m.marineAccuracyMul = Math.max(0.72, 1.06 - p * 0.3 + releaseRelief * 0.1);
        m.marineJamMul = Math.max(0.74, 0.96 + p * 0.42 + peakBoost * 0.2 - releaseRelief * 0.08);
        m.marineReactionMul = Math.max(0.86, 0.98 + p * 0.16 - releaseRelief * 0.06);
        return m;
    }

    getModifiers() {
        return this.modifiers;
    }

    /** Call this whenever gunfire or melee combat occurs to reset the idle timer. */
    noteFirefight(time) {
        this.lastFirefightAt = time;
    }

    /**
     * Returns how many aliens should be dynamically spawned right now (0 if none).
     * Call this each frame from the main update loop.
     */
    getDynamicSpawnCount(time) {
        // No dynamic spawns during peak or release — only during build (tension ramp)
        if (this.state !== 'build') return 0;
        // Budget exhausted
        if (this.dynamicSpawnCount >= this.dynamicSpawnBudget) return 0;
        // Respect minimum interval
        if (this.lastDynamicSpawnAt > 0 && (time - this.lastDynamicSpawnAt) < this.dynamicSpawnMinIntervalMs) return 0;
        // Need enough idle time since last firefight
        const idleTime = this.lastFirefightAt > 0 ? (time - this.lastFirefightAt) : time;
        if (idleTime < this.dynamicSpawnIdleThresholdMs) return 0;

        // Scale count by how long we've been idle — longer idle = more aliens
        const idleRatio = Math.min(1, (idleTime - this.dynamicSpawnIdleThresholdMs) / 30000);
        const count = Math.max(1, Math.round(1 + idleRatio * (this.dynamicSpawnMaxPerEvent - 1)));
        return Math.min(count, this.dynamicSpawnBudget - this.dynamicSpawnCount);
    }

    /** Call after successfully spawning dynamic aliens. */
    recordDynamicSpawn(time, count) {
        this.lastDynamicSpawnAt = time;
        this.dynamicSpawnCount += count;
    }
}

function randomRangeInt(minValue, maxValue) {
    const min = Math.floor(Math.min(minValue, maxValue));
    const max = Math.floor(Math.max(minValue, maxValue));
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}
