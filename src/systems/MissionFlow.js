import { CONFIG } from '../config.js';

function tileToWorld(tileX, tileY) {
    return {
        x: tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
        y: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    };
}

function collectMarkerTiles(markers, value) {
    if (!Array.isArray(markers)) return [];
    const out = [];
    for (let y = 0; y < markers.length; y++) {
        const row = markers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) {
            if (row[x] === value) out.push({ x, y });
        }
    }
    return out;
}

export class MissionFlow {
    constructor(mission, tilemap, options = {}) {
        this.mission = mission;
        this.tilemap = tilemap;
        this.warriorOnly = options.warriorOnly === true;
        this.terminalReached = false;
        this.terminalHoldUntil = 0;
        this.valvesActivated = 0;
        this.valveTargets = collectMarkerTiles(tilemap?.markers, 3).slice(0, 2);
        this.queenSpawnTile = collectMarkerTiles(tilemap?.markers, 4)[0] || null;
        this.queenPhaseSpawned = false;
        this.injectFallbackTargets();
        this.activatedValveSet = new Set();
        this.objectiveRadius = 52;
    }

    injectFallbackTargets() {
        const w = Math.max(1, this.tilemap?.width || 40);
        const h = Math.max(1, this.tilemap?.height || 26);
        if (this.mission.id === 'm2' && this.valveTargets.length < 1) {
            this.valveTargets.push({ x: Math.floor(w * 0.52), y: Math.floor(h * 0.5) });
        }
        if (this.mission.id === 'm3' && this.valveTargets.length < 2) {
            if (this.valveTargets.length < 1) {
                this.valveTargets.push({ x: Math.floor(w * 0.25), y: Math.floor(h * 0.35) });
            }
            if (this.valveTargets.length < 2) {
                this.valveTargets.push({ x: Math.floor(w * 0.75), y: Math.floor(h * 0.65) });
            }
        }
    }

    update(time, leader, enemyManager, stageState) {
        const summary = {
            readyForExtraction: false,
            phaseLabel: 'Clear hostiles',
            objectiveLines: [],
            targetWorld: null,
            requestQueenSpawn: false,
            queenSpawnWorld: null,
        };

        const wavesDone = stageState === 'extract' || stageState === 'victory';
        if (!wavesDone) {
            summary.phaseLabel = 'Clear all waves';
            summary.objectiveLines = ['[ ] Phase 1: Clear all waves'];
            return summary;
        }

        if (this.mission.id === 'm1') {
            summary.readyForExtraction = true;
            summary.phaseLabel = 'Reach extraction';
            summary.objectiveLines = ['[x] Phase 1: Clear all waves', '[ ] Phase 2: Reach extraction'];
            return summary;
        }

        if (this.mission.id === 'm2') {
            const terminal = this.valveTargets[0];
            if (!this.terminalReached && terminal) {
                const world = tileToWorld(terminal.x, terminal.y);
                summary.targetWorld = world;
                if (Phaser.Math.Distance.Between(leader.x, leader.y, world.x, world.y) <= this.objectiveRadius) {
                    this.terminalReached = true;
                    this.terminalHoldUntil = time + 9000;
                }
            }
            if (!this.terminalReached) {
                summary.phaseLabel = 'Reach terminal';
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    '[ ] Phase 2: Reach terminal room',
                    '[ ] Phase 3: Hold terminal',
                    '[ ] Phase 4: Reach extraction',
                ];
                return summary;
            }
            const remainMs = Math.max(0, this.terminalHoldUntil - time);
            if (remainMs > 0) {
                summary.phaseLabel = `Hold terminal (${Math.ceil(remainMs / 1000)}s)`;
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    '[x] Phase 2: Reach terminal room',
                    `[ ] Phase 3: Hold terminal ${Math.ceil(remainMs / 1000)}s`,
                    '[ ] Phase 4: Reach extraction',
                ];
                return summary;
            }
            summary.readyForExtraction = true;
            summary.phaseLabel = 'Reach extraction';
            summary.objectiveLines = [
                '[x] Phase 1: Clear all waves',
                '[x] Phase 2: Reach terminal room',
                '[x] Phase 3: Hold terminal',
                '[ ] Phase 4: Reach extraction',
            ];
            return summary;
        }

        if (this.mission.id === 'm3') {
            for (let i = 0; i < this.valveTargets.length; i++) {
                const t = this.valveTargets[i];
                const key = `${t.x},${t.y}`;
                if (this.activatedValveSet.has(key)) continue;
                const world = tileToWorld(t.x, t.y);
                if (Phaser.Math.Distance.Between(leader.x, leader.y, world.x, world.y) <= this.objectiveRadius) {
                    this.activatedValveSet.add(key);
                }
            }
            this.valvesActivated = this.activatedValveSet.size;
            if (this.valvesActivated < Math.max(1, this.valveTargets.length)) {
                const next = this.valveTargets.find((t) => !this.activatedValveSet.has(`${t.x},${t.y}`));
                summary.targetWorld = next ? tileToWorld(next.x, next.y) : null;
                summary.phaseLabel = `Activate valves (${this.valvesActivated}/${Math.max(1, this.valveTargets.length)})`;
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    `[ ] Phase 2: Activate valves ${this.valvesActivated}/${Math.max(1, this.valveTargets.length)}`,
                    '[ ] Phase 3: Reach extraction',
                ];
                return summary;
            }
            summary.readyForExtraction = true;
            summary.phaseLabel = 'Reach extraction';
            summary.objectiveLines = [
                '[x] Phase 1: Clear all waves',
                `[x] Phase 2: Activate valves ${this.valvesActivated}/${Math.max(1, this.valveTargets.length)}`,
                '[ ] Phase 3: Reach extraction',
            ];
            return summary;
        }

        if (this.mission.id === 'm4') {
            const eggsLeft = enemyManager.getEggAliveCount ? enemyManager.getEggAliveCount() : 0;
            if (eggsLeft > 0) {
                summary.phaseLabel = `Purge eggs (${eggsLeft} left)`;
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    `[ ] Phase 2: Destroy egg clusters (${eggsLeft} left)`,
                    '[ ] Phase 3: Reach extraction',
                ];
                return summary;
            }
            summary.readyForExtraction = true;
            summary.phaseLabel = 'Reach extraction';
            summary.objectiveLines = [
                '[x] Phase 1: Clear all waves',
                '[x] Phase 2: Destroy egg clusters',
                '[ ] Phase 3: Reach extraction',
            ];
            return summary;
        }

        if (this.mission.id === 'm5') {
            if (this.warriorOnly) {
                summary.readyForExtraction = true;
                summary.phaseLabel = 'Reach extraction';
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    '[x] Phase 2: Queen phase deferred (warrior-only test)',
                    '[ ] Phase 3: Reach extraction',
                ];
                return summary;
            }
            if (!this.queenPhaseSpawned) {
                this.queenPhaseSpawned = true;
                summary.requestQueenSpawn = true;
                if (this.queenSpawnTile) {
                    summary.queenSpawnWorld = tileToWorld(this.queenSpawnTile.x, this.queenSpawnTile.y);
                }
            }
            const queensLeft = enemyManager.getAliveCountByType
                ? enemyManager.getAliveCountByType('queen')
                : 0;
            if (queensLeft > 0) {
                if (this.queenSpawnTile) summary.targetWorld = tileToWorld(this.queenSpawnTile.x, this.queenSpawnTile.y);
                summary.phaseLabel = `Kill queen (${queensLeft} left)`;
                summary.objectiveLines = [
                    '[x] Phase 1: Clear all waves',
                    `[ ] Phase 2: Eliminate queen (${queensLeft} left)`,
                    '[ ] Phase 3: Reach extraction',
                ];
                return summary;
            }
            summary.readyForExtraction = true;
            summary.phaseLabel = 'Reach extraction';
            summary.objectiveLines = [
                '[x] Phase 1: Clear all waves',
                '[x] Phase 2: Eliminate queen',
                '[ ] Phase 3: Reach extraction',
            ];
            return summary;
        }

        summary.readyForExtraction = true;
        summary.phaseLabel = 'Reach extraction';
        summary.objectiveLines = ['[x] Clear all waves', '[ ] Reach extraction'];
        return summary;
    }
}
