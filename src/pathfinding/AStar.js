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

export class AStar {
    findPath(startX, startY, endX, endY, grid) {
        if (!grid.isWalkable(startX, startY) || !grid.isWalkable(endX, endY)) {
            return null;
        }
        if (startX === endX && startY === endY) {
            return [];
        }

        const openList = [];
        const closedSet = new Set();
        const gScores = new Map();

        const startNode = {
            x: startX, y: startY,
            g: 0,
            h: this.heuristic(startX, startY, endX, endY),
            f: 0,
            parent: null
        };
        startNode.f = startNode.g + startNode.h;
        openList.push(startNode);
        gScores.set(`${startX},${startY}`, 0);

        while (openList.length > 0) {
            // Find node with lowest f
            let lowestIdx = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < openList[lowestIdx].f) {
                    lowestIdx = i;
                }
            }
            const current = openList.splice(lowestIdx, 1)[0];
            const currentKey = `${current.x},${current.y}`;

            if (current.x === endX && current.y === endY) {
                return this.buildPath(current);
            }

            closedSet.add(currentKey);

            const neighbors = this.getNeighbors(current, grid);
            for (const neighbor of neighbors) {
                const nKey = `${neighbor.x},${neighbor.y}`;
                if (closedSet.has(nKey)) continue;

                const tentativeG = current.g + neighbor.cost;
                const existingG = gScores.get(nKey);

                if (existingG !== undefined && tentativeG >= existingG) continue;

                gScores.set(nKey, tentativeG);
                const h = this.heuristic(neighbor.x, neighbor.y, endX, endY);

                const node = {
                    x: neighbor.x, y: neighbor.y,
                    g: tentativeG,
                    h: h,
                    f: tentativeG + h,
                    parent: current
                };

                // Remove old entry from open list if present
                const existingIdx = openList.findIndex(n => n.x === neighbor.x && n.y === neighbor.y);
                if (existingIdx !== -1) {
                    openList.splice(existingIdx, 1);
                }
                openList.push(node);
            }
        }

        return null; // No path found
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
            neighbors.push({ x: nx, y: ny, cost });
        }
        return neighbors;
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
}
