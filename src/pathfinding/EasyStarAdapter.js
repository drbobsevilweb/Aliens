import { AStar } from './AStar.js';

export class EasyStarAdapter {
    constructor(fallbackAStar = null) {
        this.fallback = fallbackAStar || new AStar();
        this.easyStar = null;
        this.lastRunStats = {
            durationMs: 0,
            expanded: 0,
            generated: 0,
            status: 'idle',
            pathLength: 0,
            source: 'fallback',
        };
        this.cachedRevision = -1;
        this.cachedGrid = null;
        this.initEasyStar();
    }

    initEasyStar() {
        const EasyStarGlobal = globalThis?.EasyStar;
        const EasyStarCtor = EasyStarGlobal && (EasyStarGlobal.js || EasyStarGlobal);
        if (!EasyStarCtor) return;
        this.easyStar = new EasyStarCtor();
        this.easyStar.enableDiagonals();
        this.easyStar.disableCornerCutting();
        this.easyStar.setIterationsPerCalculation(100000);
    }

    getLastRunStats() {
        return { ...this.lastRunStats };
    }

    hasLineOfSight(a, b, grid) {
        return this.fallback?.hasLineOfSight ? this.fallback.hasLineOfSight(a, b, grid) : false;
    }

    findPath(startX, startY, endX, endY, grid) {
        if (!this.easyStar || !grid) {
            const path = this.fallback.findPath(startX, startY, endX, endY, grid);
            const run = this.fallback.getLastRunStats ? this.fallback.getLastRunStats() : {};
            this.lastRunStats = { ...run, source: 'fallback' };
            return path;
        }

        const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.syncGrid(grid);
        let result = null;
        let completed = false;

        this.easyStar.findPath(startX, startY, endX, endY, (path) => {
            completed = true;
            if (!Array.isArray(path) || path.length === 0) {
                result = null;
                return;
            }
            // Keep same contract as AStar: exclude starting tile.
            result = path.slice(1).map((p) => ({ x: p.x, y: p.y }));
        });

        // Force synchronous completion within the same frame with a guard.
        for (let i = 0; i < 12 && !completed; i++) {
            this.easyStar.calculate();
        }

        const endTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const status = completed ? (result ? 'found' : 'no-path') : 'timeout';
        this.lastRunStats = {
            durationMs: Math.max(0, endTs - startTs),
            expanded: 0,
            generated: 0,
            status,
            pathLength: result ? result.length : 0,
            source: 'easystar',
        };

        // Rare fallback if plugin stalls.
        if (!completed) {
            const path = this.fallback.findPath(startX, startY, endX, endY, grid);
            const run = this.fallback.getLastRunStats ? this.fallback.getLastRunStats() : {};
            this.lastRunStats = { ...run, source: 'fallback-timeout' };
            return path;
        }
        return result;
    }

    syncGrid(pathGrid) {
        const revision = pathGrid.getRevision ? pathGrid.getRevision() : 0;
        if (this.cachedGrid && revision === this.cachedRevision) return;
        const raw = pathGrid.grid || [];
        // Reuse existing grid arrays to avoid GC pressure on door changes
        if (!this.cachedGrid || this.cachedGrid.length !== raw.length) {
            this.cachedGrid = new Array(raw.length);
            for (let y = 0; y < raw.length; y++) {
                this.cachedGrid[y] = new Array((raw[y] || []).length);
            }
        }
        for (let y = 0; y < raw.length; y++) {
            const row = raw[y] || [];
            const out = this.cachedGrid[y];
            // Resize row if needed (rare — only on map change)
            if (!out || out.length !== row.length) {
                this.cachedGrid[y] = new Array(row.length);
            }
            const dst = this.cachedGrid[y];
            for (let x = 0; x < row.length; x++) {
                dst[x] = row[x] ? 0 : 1;
            }
        }
        this.cachedRevision = revision;
        this.easyStar.setGrid(this.cachedGrid);
        this.easyStar.setAcceptableTiles([0]);
    }
}
