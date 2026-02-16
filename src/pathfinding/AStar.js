import { CONFIG } from '../config.js';

const DIRECTIONS = [
    { dx: 0, dy: -1 },   // N
    { dx: 1, dy: 0 },    // E
    { dx: 0, dy: 1 },    // S
    { dx: -1, dy: 0 },   // W
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 1 },    // SE
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: -1 },  // NW
];

class MinHeap {
    constructor(compareFn) {
        this.items = [];
        this.compare = compareFn;
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) return null;
        const top = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            this.bubbleDown(0);
        }
        return top;
    }

    bubbleUp(index) {
        let i = index;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (this.compare(this.items[i], this.items[parent]) >= 0) break;
            [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
            i = parent;
        }
    }

    bubbleDown(index) {
        let i = index;
        const len = this.items.length;
        while (true) {
            const left = i * 2 + 1;
            const right = left + 1;
            let best = i;

            if (left < len && this.compare(this.items[left], this.items[best]) < 0) best = left;
            if (right < len && this.compare(this.items[right], this.items[best]) < 0) best = right;
            if (best === i) break;

            [this.items[i], this.items[best]] = [this.items[best], this.items[i]];
            i = best;
        }
    }
}

export class AStar {
    constructor() {
        this.lastRunStats = {
            durationMs: 0,
            expanded: 0,
            generated: 0,
            status: 'idle',
            pathLength: 0,
        };
    }

    findPath(startX, startY, endX, endY, grid) {
        const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let expanded = 0;
        let generated = 1; // Start node

        const finish = (status, path) => {
            const endTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
            this.lastRunStats = {
                durationMs: Math.max(0, endTs - startTs),
                expanded,
                generated,
                status,
                pathLength: path ? path.length : 0,
            };
            return path;
        };

        if (!grid.isWalkable(startX, startY) || !grid.isWalkable(endX, endY)) {
            return finish('blocked', null);
        }
        if (startX === endX && startY === endY) {
            return finish('same-tile', []);
        }

        const closedSet = new Set();
        const bestG = new Map();
        const cmp = (a, b) => {
            if (a.f !== b.f) return a.f - b.f;
            // Tie-break toward lower h (closer to goal) for more direct routes.
            if (a.h !== b.h) return a.h - b.h;
            return a.g - b.g;
        };
        const openHeap = new MinHeap(cmp);

        const startNode = {
            x: startX, y: startY,
            g: 0,
            h: this.heuristic(startX, startY, endX, endY),
            f: 0,
            parent: null
        };
        startNode.f = startNode.g + startNode.h;
        openHeap.push(startNode);
        bestG.set(`${startX},${startY}`, 0);

        while (openHeap.size > 0) {
            const current = openHeap.pop();
            if (!current) break;
            const currentKey = `${current.x},${current.y}`;
            if (closedSet.has(currentKey)) continue;
            const recordedG = bestG.get(currentKey);
            if (recordedG === undefined || current.g > recordedG) continue;
            expanded++;

            if (current.x === endX && current.y === endY) {
                const rawPath = this.buildPath(current);
                if (!CONFIG.PATHFINDING_SMOOTHING_ENABLED || rawPath.length <= 1) {
                    return finish('found', rawPath);
                }
                const smoothed = this.smoothPath(startX, startY, rawPath, grid);
                return finish('found', smoothed);
            }

            closedSet.add(currentKey);

            const neighbors = this.getNeighbors(current, grid);
            for (const neighbor of neighbors) {
                const nKey = `${neighbor.x},${neighbor.y}`;
                if (closedSet.has(nKey)) continue;

                const turnPenalty = this.computeTurnPenalty(current, neighbor);
                const tentativeG = current.g + neighbor.cost + turnPenalty;
                const existingG = bestG.get(nKey);

                if (existingG !== undefined && tentativeG >= existingG) continue;

                bestG.set(nKey, tentativeG);
                const h = this.heuristic(neighbor.x, neighbor.y, endX, endY);

                const node = {
                    x: neighbor.x, y: neighbor.y,
                    g: tentativeG,
                    h: h,
                    f: tentativeG + h,
                    parent: current,
                    dirX: neighbor.dx,
                    dirY: neighbor.dy
                };
                generated++;
                openHeap.push(node);
            }
        }

        return finish('no-path', null);
    }

    getNeighbors(node, grid) {
        const neighbors = [];
        for (const dir of DIRECTIONS) {
            const nx = node.x + dir.dx;
            const ny = node.y + dir.dy;
            if (!grid.isWalkable(nx, ny)) continue;

            const isDiagonal = (dir.dx !== 0 && dir.dy !== 0);
            if (isDiagonal) {
                // Corner-cutting prevention
                if (!grid.isWalkable(node.x + dir.dx, node.y)) continue;
                if (!grid.isWalkable(node.x, node.y + dir.dy)) continue;
            }

            const cost = isDiagonal ? CONFIG.DIAGONAL_COST : CONFIG.CARDINAL_COST;
            neighbors.push({ x: nx, y: ny, cost, dx: dir.dx, dy: dir.dy });
        }
        return neighbors;
    }

    computeTurnPenalty(current, neighbor) {
        if (!current || current.dirX === undefined || current.dirY === undefined) return 0;
        if (current.dirX === neighbor.dx && current.dirY === neighbor.dy) return 0;
        return CONFIG.PATH_TURN_PENALTY;
    }

    heuristic(ax, ay, bx, by) {
        // Octile distance
        const dx = Math.abs(ax - bx);
        const dy = Math.abs(ay - by);
        return CONFIG.CARDINAL_COST * (dx + dy) +
               (CONFIG.DIAGONAL_COST - 2 * CONFIG.CARDINAL_COST) * Math.min(dx, dy);
    }

    buildPath(endNode) {
        const path = [];
        let node = endNode;
        while (node) {
            path.push({ x: node.x, y: node.y });
            node = node.parent;
        }
        path.reverse();
        // Skip first node (current position)
        return path.slice(1);
    }

    smoothPath(startX, startY, rawPath, grid) {
        const full = [{ x: startX, y: startY }, ...rawPath];
        const out = [full[0]];

        let anchor = 0;
        while (anchor < full.length - 1) {
            let furthest = anchor + 1;
            while (
                furthest + 1 < full.length &&
                this.hasLineOfSight(full[anchor], full[furthest + 1], grid)
            ) {
                furthest++;
            }
            out.push(full[furthest]);
            anchor = furthest;
        }

        // Keep existing contract: return path excluding the start tile.
        return out.slice(1);
    }

    hasLineOfSight(a, b, grid) {
        let x = a.x;
        let y = a.y;
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const sx = a.x < b.x ? 1 : -1;
        const sy = a.y < b.y ? 1 : -1;
        let err = dx - dy;

        while (x !== b.x || y !== b.y) {
            const prevX = x;
            const prevY = y;
            const e2 = err * 2;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }

            if (!grid.isWalkable(x, y)) return false;

            const movedDiag = x !== prevX && y !== prevY;
            if (movedDiag) {
                if (!grid.isWalkable(prevX, y) || !grid.isWalkable(x, prevY)) return false;
            }
        }

        return true;
    }

    getLastRunStats() {
        return { ...this.lastRunStats };
    }
}
