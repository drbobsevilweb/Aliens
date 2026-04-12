import { CONFIG } from '../config.js';
import { tileToWorld } from '../data/enemyData.js';

const MARKER_SPAWN = 1;
const MARKER_EXTRACTION = 2;

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
        this.requiredCards = Math.max(0, Math.floor(Number(mission?.requiredCards) || 0));
        this.requiredTerminals = Math.max(0, Math.floor(Number(mission?.requiredTerminals) || 0));
        this.spawnTargets = collectMarkerTiles(tilemap?.markers, MARKER_SPAWN);
        this.cardTargets = collectMarkerTiles(tilemap?.markers, 4);
        this.terminalTargets = collectMarkerTiles(tilemap?.markers, 3);
        this.extractionTargets = collectMarkerTiles(tilemap?.markers, MARKER_EXTRACTION);
        this.injectFallbackTargets();
        this.collectedCardSet = new Set();
        this.activatedTerminalSet = new Set();
        this.objectiveRadius = 52;
        this._lastSummary = null;
    }

    injectFallbackTargets() {
        const w = Math.max(1, this.tilemap?.width || 40);
        const h = Math.max(1, this.tilemap?.height || 26);
        const reachableTiles = this.buildReachableTileSet(true);
        while (this.cardTargets.length < this.requiredCards) {
            const i = this.cardTargets.length;
            const candidate = {
                x: Math.floor(w * (0.22 + (i % 3) * 0.28)),
                y: Math.floor(h * (0.24 + (i % 2) * 0.38)),
            };
            this.cardTargets.push(this.findNearestWalkableTile(candidate, reachableTiles));
        }
        while (this.terminalTargets.length < this.requiredTerminals) {
            const i = this.terminalTargets.length;
            const candidate = {
                x: Math.floor(w * (0.2 + (i % 4) * 0.18)),
                y: Math.floor(h * (0.2 + ((i + 1) % 3) * 0.24)),
            };
            this.terminalTargets.push(this.findNearestWalkableTile(candidate, reachableTiles));
        }
        if (this.extractionTargets.length === 0) {
            this.extractionTargets.push(this.findNearestWalkableTile({
                x: Math.floor(w * 0.5),
                y: Math.floor(h * 0.5)
            }, reachableTiles));
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
        const cardsCollected = this.updateProximityObjectiveSet(
            leader,
            this.cardTargets,
            this.collectedCardSet
        );
        const terminalsActivated = this.updateProximityObjectiveSet(
            leader,
            this.terminalTargets,
            this.activatedTerminalSet
        );
        const cardsNeed = Math.max(0, this.requiredCards);
        const terminalsNeed = Math.max(0, this.requiredTerminals);
        const cardsDone = cardsCollected >= cardsNeed;
        const terminalsDone = terminalsActivated >= terminalsNeed;

        const leaderTile = leader ? {
            x: Math.round(leader.x / (CONFIG?.TILE_SIZE || 64)),
            y: Math.round(leader.y / (CONFIG?.TILE_SIZE || 64))
        } : null;
        const nextCard = !cardsDone
            ? this.findNextUnreachedTarget(this.cardTargets, this.collectedCardSet, leaderTile)
            : null;
        const nextTerminal = !terminalsDone
            ? this.findNextUnreachedTarget(this.terminalTargets, this.activatedTerminalSet, leaderTile)
            : null;
        const nextTarget = nextCard || nextTerminal;
        summary.targetWorld = nextTarget ? tileToWorld(nextTarget.x, nextTarget.y) : null;

        if (!cardsDone || !terminalsDone || !wavesDone) {
            if (!wavesDone && (!cardsDone || !terminalsDone)) {
                summary.phaseLabel = `Hold out / work objectives (${cardsCollected}/${cardsNeed} | ${terminalsActivated}/${terminalsNeed})`;
            } else if (!wavesDone) {
                summary.phaseLabel = 'Clear remaining hostiles';
            } else if (!cardsDone && !terminalsDone) {
                summary.phaseLabel = `Collect cards / terminals (${cardsCollected}/${cardsNeed} | ${terminalsActivated}/${terminalsNeed})`;
            } else if (!cardsDone) {
                summary.phaseLabel = `Collect security cards (${cardsCollected}/${cardsNeed})`;
            } else {
                summary.phaseLabel = `Activate terminals (${terminalsActivated}/${terminalsNeed})`;
            }
            summary.objectiveLines = [
                `${wavesDone ? '[x]' : '[ ]'} Phase 1: Clear all hostile contacts`,
                `${cardsDone ? '[x]' : '[ ]'} Phase 2A: Security cards ${cardsCollected}/${cardsNeed}`,
                `${terminalsDone ? '[x]' : '[ ]'} Phase 2B: Terminal uplinks ${terminalsActivated}/${terminalsNeed}`,
                `[ ] Phase 3: Reach extraction elevator`,
            ];
            summary.objectives = [
                { id: 'waves',     status: wavesDone ? 'complete' : 'pending' },
                { id: 'cards',     status: cardsDone ? 'complete' : 'pending' },
                { id: 'terminals', status: terminalsDone ? 'complete' : 'pending' },
            ];
            this._lastSummary = summary;
            return summary;
        }

        const nextExtract = this.findNextUnreachedTarget(this.extractionTargets, new Set(), leaderTile);
        if (nextExtract) {
            const extractWorld = tileToWorld(nextExtract.x, nextExtract.y);
            summary.targetWorld = extractWorld;
            const dist = leader ? Phaser.Math.Distance.Between(leader.x, leader.y, extractWorld.x, extractWorld.y) : Infinity;
            if (dist <= this.objectiveRadius) {
                summary.isComplete = true;
            }
        } else {
            summary.isComplete = true;   
        }

        summary.readyForExtraction = true;
        summary.phaseLabel = 'Reach extraction elevator';
        summary.objectiveLines = [
            '[x] Phase 1: Clear all hostile contacts',
            `[x] Phase 2A: Security cards ${cardsCollected}/${cardsNeed}`,
            `[x] Phase 2B: Terminal uplinks ${terminalsActivated}/${terminalsNeed}`,
            '[ ] Phase 3: Reach extraction elevator',
        ];
        summary.objectives = [
            { id: 'waves',     status: 'complete' },
            { id: 'cards',     status: 'complete' },
            { id: 'terminals', status: 'complete' },
        ];
        this._lastSummary = summary;
        return summary;
    }

    getState() {
        return this._lastSummary || null;
    }

    updateProximityObjectiveSet(leader, targets, set) {
        if (!leader || !Array.isArray(targets) || !(set instanceof Set)) return 0;
        for (const t of targets) {
            const key = `${t.x},${t.y}`;
            if (set.has(key)) continue;
            const world = tileToWorld(t.x, t.y);
            if (Phaser.Math.Distance.Between(leader.x, leader.y, world.x, world.y) <= this.objectiveRadius) {
                set.add(key);
            }
        }
        return Number(set.size) || 0;
    }

    findNextUnreachedTarget(targets, set, leaderTile = null) {
        if (!Array.isArray(targets) || !set) return null;
        const unreached = targets.filter(t => !set.has(`${t.x},${t.y}`));
        if (!unreached.length) return null;
        if (!leaderTile) return unreached[0];
        return unreached.reduce((best, t) => {
            const d = Math.abs(t.x - leaderTile.x) + Math.abs(t.y - leaderTile.y);
            return d < best.d ? { t, d } : best;
        }, { t: unreached[0], d: Infinity }).t;
    }

    buildReachableTileSet(allowDoors = true) {
        const terrain = this.tilemap?.terrain;
        const doors = this.tilemap?.doors;
        const w = Math.max(1, this.tilemap?.width || 1);
        const h = Math.max(1, this.tilemap?.height || 1);
        if (!Array.isArray(terrain)) return null;

        const originSeed = this.spawnTargets[0]
            || this.extractionTargets[0]
            || {
                x: Math.floor(w * 0.5),
                y: Math.floor(h * 0.5),
            };
        const origin = this.findNearestWalkableTile(originSeed, null, allowDoors);
        if (!origin) return null;

        const key = (x, y) => `${x},${y}`;
        const visited = new Set([key(origin.x, origin.y)]);
        const queue = [{ x: origin.x, y: origin.y }];
        let head = 0;

        while (head < queue.length) {
            const current = queue[head++];
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const tx = current.x + dx;
                const ty = current.y + dy;
                if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
                if (terrain[ty]?.[tx] !== 0) continue;
                if (!allowDoors && (doors?.[ty]?.[tx] || 0) > 0) continue;
                const tileKey = key(tx, ty);
                if (visited.has(tileKey)) continue;
                visited.add(tileKey);
                queue.push({ x: tx, y: ty });
            }
        }

        return visited;
    }

    findNearestWalkableTile(tile, reachableTiles = null, allowDoors = false) {
        const terrain = this.tilemap?.terrain;
        const doors = this.tilemap?.doors;
        const w = Math.max(1, this.tilemap?.width || 1);
        const h = Math.max(1, this.tilemap?.height || 1);
        if (!Array.isArray(terrain)) return tile;
        const sx = Math.max(0, Math.min(w - 1, Math.floor(tile?.x || 0)));
        const sy = Math.max(0, Math.min(h - 1, Math.floor(tile?.y || 0)));
        const isCandidate = (tx, ty) => {
            if (terrain[ty]?.[tx] !== 0) return false;
            if (!allowDoors && (doors?.[ty]?.[tx] || 0) > 0) return false;
            if (reachableTiles && !reachableTiles.has(`${tx},${ty}`)) return false;
            return true;
        };
        if (isCandidate(sx, sy)) return { x: sx, y: sy };
        const maxR = Math.max(w, h);
        for (let r = 1; r <= maxR; r++) {
            for (let oy = -r; oy <= r; oy++) {
                for (let ox = -r; ox <= r; ox++) {
                    if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                    const tx = sx + ox;
                    const ty = sy + oy;
                    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
                    if (isCandidate(tx, ty)) return { x: tx, y: ty };
                }
            }
        }
        return { x: sx, y: sy };
    }
}
