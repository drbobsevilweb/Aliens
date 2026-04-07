export class StageFlow {
    constructor(totalWaves = 1) {
        this.totalWaves = Math.max(1, totalWaves);
        this.currentWave = 1;
        this.state = 'combat';
        this.result = null;
        this.transitionAt = 0;
        this.pendingWaveAdvance = false;
        this._combatEnteredAt = 0;
        this.eventBus = null; // set externally by GameScene
    }

    update(time, playerHealth, aliveEnemies) {
        if (this.state === 'victory' || this.state === 'defeat') return this.state;

        const prev = this.state;

        if (playerHealth <= 0) {
            this.state = 'defeat';
            this.result = 'defeat';
            this._emitTransition(prev, 'defeat');
            return this.state;
        }

        if (this.state === 'combat' && aliveEnemies <= 0) {
            // Grace period: don't end combat within 2s of entering it (spawning may be async)
            if (this._combatEnteredAt && (time - this._combatEnteredAt) < 2000) {
                return this.state;
            }
            if (this.currentWave >= this.totalWaves) {
                this.state = 'extract';
                this._emitTransition(prev, 'extract');
                this.eventBus?.emit('extractionStarted', { wave: this.currentWave });
                return this.state;
            }
            this.state = 'intermission';
            this.transitionAt = time + 1500;
            this._emitTransition(prev, 'intermission');
            this.eventBus?.emit('waveCleared', { wave: this.currentWave });
            return this.state;
        }

        if (this.state === 'intermission' && time >= this.transitionAt) {
            this.currentWave++;
            this.state = 'combat';
            this._combatEnteredAt = time;
            this.pendingWaveAdvance = true;
            this._emitTransition('intermission', 'combat');
            this.eventBus?.emit('waveStarted', { wave: this.currentWave, totalWaves: this.totalWaves });
        }

        return this.state;
    }

    _emitTransition(from, to) {
        this.eventBus?.emit('stageChanged', { from, to, wave: this.currentWave });
    }

    consumeWaveAdvance() {
        if (!this.pendingWaveAdvance) return false;
        this.pendingWaveAdvance = false;
        return true;
    }

    getWaveLabel() {
        return `${this.currentWave}/${this.totalWaves}`;
    }

    completeExtraction() {
        if (this.state !== 'extract') return false;
        const prev = this.state;
        this.state = 'victory';
        this.result = 'victory';
        this._emitTransition(prev, 'victory');
        return true;
    }

    isEnded() {
        return this.state === 'victory' || this.state === 'defeat';
    }
}
