import { CONFIG } from '../config.js';
import { ProgressBar } from '../ui/ProgressBar.js';

const TIMED_ACTIONS = {
    hack:   { duration: CONFIG.DOOR_HACK_DURATION,   color: 0x44cccc },
    weld:   { duration: CONFIG.DOOR_WELD_DURATION,   color: 0x44cc44 },
    unweld: { duration: CONFIG.DOOR_UNWELD_DURATION,  color: 0x44cc44 },
};

export class DoorActionSystem {
    constructor(scene, pathGrid, astar, movementSystem) {
        this.scene = scene;
        this.pathGrid = pathGrid;
        this.astar = astar;
        this.movementSystem = movementSystem;
        this.pendingAction = null;
        this.activeTimer = null;
    }

    queueAction(entity, doorGroup, action) {
        this.cancelPending();

        const adjacentTile = this.findBestAdjacentTile(entity, doorGroup);
        if (!adjacentTile) return false;

        // Check if entity is already at the adjacent tile
        const entityTile = this.pathGrid.worldToTile(entity.x, entity.y);
        if (entityTile.x === adjacentTile.x && entityTile.y === adjacentTile.y) {
            this.startOrExecute(doorGroup, action);
            return true;
        }

        // Pathfind to the adjacent tile
        const path = this.astar.findPath(
            entityTile.x, entityTile.y,
            adjacentTile.x, adjacentTile.y,
            this.pathGrid
        );
        if (!path) return false;

        const worldPath = path.map(p => this.pathGrid.tileToWorld(p.x, p.y));
        this.movementSystem.assignPath(entity, worldPath);

        this.pendingAction = { doorGroup, action, targetTile: adjacentTile };
        return true;
    }

    update(entity, delta) {
        // Tick active timed action
        if (this.activeTimer) {
            this.activeTimer.elapsed += delta;
            const progress = this.activeTimer.elapsed / this.activeTimer.duration;
            this.activeTimer.progressBar.update(progress);

            if (this.activeTimer.elapsed >= this.activeTimer.duration) {
                this.completeTimedAction();
            }
            return;
        }

        // Check for arrival at door
        if (!this.pendingAction) return;

        if (!entity.currentPath) {
            const entityTile = this.pathGrid.worldToTile(entity.x, entity.y);
            const target = this.pendingAction.targetTile;
            if (entityTile.x === target.x && entityTile.y === target.y) {
                const { doorGroup, action } = this.pendingAction;
                this.pendingAction = null;
                this.startOrExecute(doorGroup, action);
            } else {
                this.pendingAction = null;
            }
        }
    }

    startOrExecute(doorGroup, action) {
        const timedConfig = TIMED_ACTIONS[action];
        if (timedConfig) {
            this.startTimedAction(doorGroup, action, timedConfig);
        } else {
            this.executeAction(doorGroup, action);
        }
    }

    startTimedAction(doorGroup, action, timedConfig) {
        // Calculate bar position: center above the door group
        let sumX = 0, sumY = 0;
        for (const door of doorGroup.doors) {
            sumX += door.x;
            sumY += door.y;
        }
        const centerX = sumX / doorGroup.doors.length;
        const centerY = sumY / doorGroup.doors.length - 40;

        const progressBar = new ProgressBar(this.scene);
        progressBar.show(centerX, centerY, timedConfig.color);

        this.activeTimer = {
            doorGroup,
            action,
            duration: timedConfig.duration,
            elapsed: 0,
            progressBar,
        };
    }

    completeTimedAction() {
        const { doorGroup, action } = this.activeTimer;
        this.activeTimer.progressBar.hide();
        this.activeTimer = null;
        this.executeAction(doorGroup, action);
    }

    cancelPending() {
        this.pendingAction = null;
        if (this.activeTimer) {
            this.activeTimer.progressBar.hide();
            this.activeTimer = null;
        }
    }

    executeAction(doorGroup, action) {
        const pathGrid = this.pathGrid;
        const physicsGroup = this.scene.doorManager.physicsGroup;

        switch (action) {
            case 'open':
                doorGroup.open(pathGrid, physicsGroup);
                break;
            case 'close':
                doorGroup.close(pathGrid, physicsGroup);
                break;
            case 'hack':
                doorGroup.hack();
                break;
            case 'lock':
                doorGroup.lock(pathGrid, physicsGroup);
                break;
            case 'weld':
                doorGroup.weld(pathGrid, physicsGroup);
                break;
            case 'unweld':
                doorGroup.unweld();
                break;
        }
    }

    findBestAdjacentTile(entity, doorGroup) {
        const doorTileKeys = new Set();
        for (const door of doorGroup.doors) {
            doorTileKeys.add(`${door.tileX},${door.tileY}`);
        }

        const cardinalDirs = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
        ];

        const candidates = [];
        for (const door of doorGroup.doors) {
            for (const dir of cardinalDirs) {
                const nx = door.tileX + dir.dx;
                const ny = door.tileY + dir.dy;
                const key = `${nx},${ny}`;
                if (this.pathGrid.isWalkable(nx, ny) && !doorTileKeys.has(key)) {
                    candidates.push({ x: nx, y: ny, key });
                }
            }
        }

        if (candidates.length === 0) return null;

        const entityTile = this.pathGrid.worldToTile(entity.x, entity.y);
        let bestTile = null;
        let bestDist = Infinity;

        const seen = new Set();
        for (const c of candidates) {
            if (seen.has(c.key)) continue;
            seen.add(c.key);
            const dist = Math.abs(c.x - entityTile.x) + Math.abs(c.y - entityTile.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestTile = { x: c.x, y: c.y };
            }
        }

        return bestTile;
    }
}
