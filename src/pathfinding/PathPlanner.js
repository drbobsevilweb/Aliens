export class PathPlanner {
    constructor(astar, pathGrid) {
        this.astar = astar;
        this.pathGrid = pathGrid;

        this.lastFullPath = null; // Includes start tile.
        this.lastGoal = null;
        this.lastRevision = -1;
        this.exactCache = new Map();
        this.maxExactEntries = 200;
        this.stats = {
            requests: 0,
            exactHits: 0,
            reuseHits: 0,
            astarRuns: 0,
            astarFound: 0,
            astarNoPath: 0,
            totalAstarMs: 0,
            lastSource: 'none',
            lastMs: 0,
            lastExpanded: 0,
            lastGenerated: 0,
        };
    }

    findPath(startX, startY, endX, endY, grid) {
        if (!(this.exactCache instanceof Map)) this.exactCache = new Map();
        this.stats.requests++;
        const revision = this.pathGrid.getRevision ? this.pathGrid.getRevision() : 0;
        const exactKey = `${revision}|${startX},${startY}->${endX},${endY}`;
        const cached = this.exactCache.get(exactKey);
        if (cached) {
            // LRU: move to end of Map iteration order so eviction removes least-recently-used
            this.exactCache.delete(exactKey);
            this.exactCache.set(exactKey, cached);
            this.stats.exactHits++;
            this.stats.lastSource = 'exact-cache';
            this.stats.lastMs = 0;
            this.stats.lastExpanded = 0;
            this.stats.lastGenerated = 0;
            return cached.map((p) => ({ x: p.x, y: p.y }));
        }

        const reused = this.tryReusePath(startX, startY, endX, endY, grid, revision);
        if (reused) {
            this.stats.reuseHits++;
            this.stats.lastSource = 'suffix-reuse';
            this.stats.lastMs = 0;
            this.stats.lastExpanded = 0;
            this.stats.lastGenerated = 0;
            this.storeExact(exactKey, reused);
            return reused.map((p) => ({ x: p.x, y: p.y }));
        }

        this.stats.astarRuns++;
        const path = this.astar.findPath(startX, startY, endX, endY, grid);
        const run = this.astar.getLastRunStats ? this.astar.getLastRunStats() : null;
        if (run) {
            this.stats.lastMs = run.durationMs || 0;
            this.stats.lastExpanded = run.expanded || 0;
            this.stats.lastGenerated = run.generated || 0;
            this.stats.totalAstarMs += this.stats.lastMs;
            if (run.status === 'found') this.stats.astarFound++;
            if (run.status === 'no-path' || run.status === 'blocked') this.stats.astarNoPath++;
        }
        this.stats.lastSource = 'astar';
        if (!path) return null;

        this.lastFullPath = [{ x: startX, y: startY }, ...path];
        this.lastGoal = { x: endX, y: endY };
        this.lastRevision = revision;
        this.storeExact(exactKey, path);
        return path.map((p) => ({ x: p.x, y: p.y }));
    }

    tryReusePath(startX, startY, endX, endY, grid, revision) {
        if (!this.lastFullPath || !this.lastGoal) return null;
        if (this.lastRevision !== revision) return null;
        if (this.lastGoal.x !== endX || this.lastGoal.y !== endY) return null;

        for (let i = 0; i < this.lastFullPath.length; i++) {
            const node = this.lastFullPath[i];
            if (node.x === startX && node.y === startY) {
                const suffix = this.lastFullPath.slice(i + 1);
                if (this.pathStillWalkable(suffix, grid)) return suffix;
                break;
            }
        }

        if (!this.astar.hasLineOfSight) return null;
        let bestIndex = -1;
        for (let i = this.lastFullPath.length - 1; i >= 1; i--) {
            const node = this.lastFullPath[i];
            if (!grid.isWalkable(node.x, node.y)) continue;
            if (this.astar.hasLineOfSight({ x: startX, y: startY }, node, grid)) {
                bestIndex = i;
                break;
            }
        }
        if (bestIndex <= 0) return null;

        const jumpSuffix = this.lastFullPath.slice(bestIndex);
        if (!this.pathStillWalkable(jumpSuffix, grid)) return null;
        return jumpSuffix;
    }

    pathStillWalkable(path, grid) {
        for (let i = 0; i < path.length; i++) {
            if (!grid.isWalkable(path[i].x, path[i].y)) return false;
        }
        return true;
    }

    storeExact(key, path) {
        if (!(this.exactCache instanceof Map)) this.exactCache = new Map();
        this.exactCache.set(key, path.map((p) => ({ x: p.x, y: p.y })));
        if (Number(this.exactCache.size) <= this.maxExactEntries) return;
        const firstKey = this.exactCache.keys().next().value;
        if (firstKey !== undefined) this.exactCache.delete(firstKey);
    }

    getStats() {
        if (!(this.exactCache instanceof Map)) this.exactCache = new Map();
        const hits = this.stats.exactHits + this.stats.reuseHits;
        const hitRate = this.stats.requests > 0 ? hits / this.stats.requests : 0;
        const avgAstarMs = this.stats.astarRuns > 0 ? this.stats.totalAstarMs / this.stats.astarRuns : 0;
        return {
            ...this.stats,
            cacheEntries: Number(this.exactCache.size) || 0,
            hitRate,
            avgAstarMs,
        };
    }
}
