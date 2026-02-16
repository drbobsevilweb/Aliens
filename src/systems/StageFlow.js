export class StageFlow {
    constructor(totalWaves = 1) {
        this.totalWaves = Math.max(1, totalWaves);
        this.currentWave = 1;
        this.state = 'combat';
        this.result = null;
        this.transitionAt = 0;
        this.pendingWaveAdvance = false;
    }

    update(time, playerHealth, aliveEnemies) {
        if (this.state === 'victory' || this.state === 'defeat') return this.state;

        if (playerHealth <= 0) {
            this.state = 'defeat';
            this.result = 'defeat';
            return this.state;
        }

        if (this.state === 'combat' && aliveEnemies <= 0) {
            if (this.currentWave >= this.totalWaves) {
                this.state = 'extract';
                return this.state;
            }
            this.state = 'intermission';
            this.transitionAt = time + 1500;
            return this.state;
        }

        if (this.state === 'intermission' && time >= this.transitionAt) {
            this.currentWave++;
            this.state = 'combat';
            this.pendingWaveAdvance = true;
        }

        return this.state;
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
        this.state = 'victory';
        this.result = 'victory';
        return true;
    }

    isEnded() {
        return this.state === 'victory' || this.state === 'defeat';
    }
}
