import { CONFIG } from '../config.js';
import { Door } from './Door.js';
import { DOOR_DEFINITIONS } from '../map/doorData.js';

const DOOR_MIN_SIDE_REACH = 10;

class DoorGroup {
    constructor(id, type, doorSprites, integrityHits = 5, orientation = 'vertical', scene = null) {
        this.id = id;
        this.type = type;
        this.doors = doorSprites;
        this.orientation = orientation;
        this.state = 'closed';
        this.stateBeforeWeld = null;
        this.maxIntegrity = integrityHits;
        this.integrity = integrityHits;
        this.scene = scene;
    }

    get isPassable() {
        return this.state === 'open' || this.state === 'destroyed';
    }

    getCenter() {
        if (this.doors.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0;
        for (const door of this.doors) { sx += door.x; sy += door.y; }
        return { x: sx / this.doors.length, y: sy / this.doors.length };
    }

    get supportsHackLock() {
        return this.type === 'electronic';
    }

    getAvailableActions() {
        if (this.state === 'destroyed') return [];
        const actions = [];
        switch (this.state) {
            case 'closed':
                actions.push({ label: 'Open', action: 'open' });
                if (this.supportsHackLock) actions.push({ label: 'Lock', action: 'lock' });
                actions.push({ label: 'Weld', action: 'weld' });
                break;
            case 'open':
                actions.push({ label: 'Close', action: 'close' });
                // Only option for open doors should be to close them
                break;
            case 'locked':
                if (this.supportsHackLock) {
                    actions.push({ label: 'Hack', action: 'hack' });
                }
                actions.push({ label: 'Weld', action: 'weld' });
                break;
            case 'welded':
                actions.push({ label: 'Unweld', action: 'unweld' });
                break;
        }
        return actions;
    }

    setWallCollision(wallLayer, enabled) {
        if (!wallLayer) return;
        for (const door of this.doors) {
            const tile = wallLayer.getTileAt(door.tileX, door.tileY);
            if (!tile) continue;
            tile.setCollision(enabled, enabled, enabled, enabled);
        }
    }

    resetIntegrity() {
        this.integrity = this.maxIntegrity;
        this.updateDamageVisuals();
    }

    updateDamageVisuals() {
        const ratio = this.maxIntegrity > 0 ? (this.integrity / this.maxIntegrity) : 1;
        let stage = 0;
        if (!this.isPassable && this.state !== 'welded') {
            if (ratio <= 0.66) stage = 1;
            if (ratio <= 0.4) stage = 2;
            if (ratio <= 0.2) stage = 3;
        }
        for (const door of this.doors) {
            if (door && typeof door.setDamageStage === 'function') {
                door.setDamageStage(stage);
            }
        }
    }

    open(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (this.state !== 'closed') return;
        this.stateBeforeWeld = null;
        this.state = 'open';
        for (const door of this.doors) {
            door.open();
            pathGrid.setWalkable(door.tileX, door.tileY, true);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
        }
        this.setWallCollision(wallLayer, false);
        physicsGroup.refresh();
        this.updateDamageVisuals();
        this.scene?.eventBus?.emit('doorOpened', { door: this, doorId: this.id });
    }

    close(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (this.state !== 'open') return;
        this.resetIntegrity();
        this.stateBeforeWeld = null;
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
            pathGrid.setWalkable(door.tileX, door.tileY, false);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
        this.updateDamageVisuals();
        this.scene?.eventBus?.emit('doorClosed', { door: this, doorId: this.id });
    }

    lock(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (!this.supportsHackLock) return;
        if (this.state !== 'closed') return;
        this.stateBeforeWeld = null;
        this.state = 'locked';
        this.resetIntegrity();
        for (const door of this.doors) {
            door.showLocked();
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
        this.updateDamageVisuals();
    }

    hack(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (!this.supportsHackLock) return;
        if (this.state !== 'locked') return;
        this.resetIntegrity();
        this.stateBeforeWeld = null;
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
        this.updateDamageVisuals();
    }

    weld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (this.state === 'welded') return;
        this.resetIntegrity();
        this.stateBeforeWeld = this.state;
        if (this.state === 'open') {
            for (const door of this.doors) {
                pathGrid.setWalkable(door.tileX, door.tileY, false);
                if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
            }
        }
        this.state = 'welded';
        for (const door of this.doors) {
            door.showWelded();
        }
        this.scene?.spawnWeldSparkEffect?.(this);
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
        this.updateDamageVisuals();
        this.scene?.eventBus?.emit('doorWelded', { door: this, doorId: this.id });
    }

    unweld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (this.state !== 'welded') return;
        this.resetIntegrity();
        const restoreState = this.stateBeforeWeld || 'closed';
        this.state = restoreState;
        if (restoreState === 'open') {
            for (const door of this.doors) {
                door.open();
                pathGrid.setWalkable(door.tileX, door.tileY, true);
                if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
            }
            this.setWallCollision(wallLayer, false);
        } else {
            for (const door of this.doors) {
                if (restoreState === 'locked' && typeof door.showLocked === 'function') door.showLocked();
                else door.close();
            }
            this.setWallCollision(wallLayer, true);
        }
        this.stateBeforeWeld = null;
        physicsGroup.refresh();
        this.updateDamageVisuals();
    }

    forceOpen(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'destroyed') return;
        if (this.state === 'open') return;
        this.stateBeforeWeld = null;
        this.state = 'open';
        for (const door of this.doors) {
            door.open();
            pathGrid.setWalkable(door.tileX, door.tileY, true);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
        }
        this.setWallCollision(wallLayer, false);
        physicsGroup.refresh();
        this.updateDamageVisuals();
    }

    applyEnemyDamage(amount, pathGrid, physicsGroup, lightBlockerGrid, wallLayer, options = null) {
        if (this.isPassable) return false;
        const force = options?.force === true;
        if (!force && (this.state === 'locked' || this.state === 'welded')) return false;
        this.integrity = Math.max(0, this.integrity - amount);
        this.updateDamageVisuals();
        if (this.integrity > 0) return false;
        return this.destroy(pathGrid, physicsGroup, lightBlockerGrid, wallLayer, 'enemy');
    }

    applyBulletDamage(amount, pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state !== 'closed' && this.state !== 'locked') return false;
        this.integrity = Math.max(0, this.integrity - amount);
        this.updateDamageVisuals();
        if (this.integrity > 0) return false;
        return this.destroy(pathGrid, physicsGroup, lightBlockerGrid, wallLayer, 'bullet');
    }

    destroy(pathGrid, physicsGroup, lightBlockerGrid, wallLayer, cause = 'generic') {
        if (this.state === 'destroyed') return false;
        this.stateBeforeWeld = null;
        this.state = 'destroyed';
        this.integrity = 0;
        for (const door of this.doors) {
            if (door && typeof door.showDestroyed === 'function') {
                door.showDestroyed(cause);
            } else {
                door.open();
            }
            pathGrid.setWalkable(door.tileX, door.tileY, true);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
        }
        this.setWallCollision(wallLayer, false);
        physicsGroup.refresh();
        this.updateDamageVisuals();
        this.scene?.eventBus?.emit('doorBreached', { door: this, doorId: this.id, cause });
        return true;
    }
}

export class DoorManager {
    constructor(scene, pathGrid, doorDefinitions = DOOR_DEFINITIONS, wallLayer = null, options = null) {
        this.scene = scene;
        this.pathGrid = pathGrid;
        this.wallLayer = wallLayer || scene.wallLayer || null;
        this.doorDefinitions = doorDefinitions;
        this.options = options || {};
        this.doorGroups = [];
        this.physicsGroup = scene.physics.add.staticGroup();

        this.createDoors();
    }

    getDoorOrientationFromTiles(tiles) {
        if (!Array.isArray(tiles) || tiles.length !== 2) return null;
        const [a, b] = tiles;
        if (a.x === b.x && Math.abs(a.y - b.y) === 1) return 'vertical';
        if (a.y === b.y && Math.abs(a.x - b.x) === 1) return 'horizontal';
        return null;
    }

    floodReachableWalkable(starts, blocked = null, limit = 128) {
        const grid = this.pathGrid;
        const width = Number(grid?.width) || 0;
        const height = Number(grid?.height) || 0;
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
        const walkable = (x, y) => inBounds(x, y) && grid.isWalkable(x, y);
        const q = [];
        const seen = new Set();
        for (const s of starts || []) {
            const x = Number(s?.x);
            const y = Number(s?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !walkable(x, y)) continue;
            const key = `${x},${y}`;
            if (blocked?.has(key) || seen.has(key)) continue;
            seen.add(key);
            q.push({ x, y });
        }
        for (let i = 0; i < q.length && seen.size < limit; i++) {
            const c = q[i];
            const n = [
                { x: c.x + 1, y: c.y },
                { x: c.x - 1, y: c.y },
                { x: c.x, y: c.y + 1 },
                { x: c.x, y: c.y - 1 },
            ];
            for (const p of n) {
                if (!walkable(p.x, p.y)) continue;
                const key = `${p.x},${p.y}`;
                if (blocked?.has(key) || seen.has(key)) continue;
                seen.add(key);
                q.push(p);
            }
        }
        return seen.size;
    }

    getDoorSideReachability(tiles, orientation) {
        const blocked = new Set((tiles || []).map((t) => `${t.x},${t.y}`));
        const [a, b] = tiles || [];
        if (!a || !b) return { sideA: 0, sideB: 0 };
        let sideA = [];
        let sideB = [];
        if (orientation === 'vertical') {
            sideA = [{ x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }];
            sideB = [{ x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }];
        } else if (orientation === 'horizontal') {
            sideA = [{ x: a.x, y: a.y - 1 }, { x: b.x, y: b.y - 1 }];
            sideB = [{ x: a.x, y: a.y + 1 }, { x: b.x, y: b.y + 1 }];
        } else {
            return { sideA: 0, sideB: 0 };
        }
        return {
            sideA: this.floodReachableWalkable(sideA, blocked, 96),
            sideB: this.floodReachableWalkable(sideB, blocked, 96),
        };
    }

    isAnchoredDoorTiles(tiles, orientation) {
        if (!tiles || tiles.length !== 2 || !orientation) return false;
        const grid = this.pathGrid;
        const width = Number(grid?.width) || 0;
        const height = Number(grid?.height) || 0;
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
        const walkable = (x, y) => inBounds(x, y) && grid.isWalkable(x, y);
        const blocked = (x, y) => inBounds(x, y) && !grid.isWalkable(x, y);
        const s = tiles.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const a = s[0];
        const b = s[1];

        if (orientation === 'vertical') {
            if (!blocked(a.x, a.y - 1) || !blocked(b.x, b.y + 1)) return false;
            if (!walkable(a.x - 1, a.y) || !walkable(a.x + 1, a.y)) return false;
            if (!walkable(b.x - 1, b.y) || !walkable(b.x + 1, b.y)) return false;
            const leftRun = walkable(a.x - 2, a.y) && walkable(b.x - 2, b.y);
            const rightRun = walkable(a.x + 2, a.y) && walkable(b.x + 2, b.y);
            if (!leftRun && !rightRun) return false;
            const reach = this.getDoorSideReachability([a, b], orientation);
            return reach.sideA >= DOOR_MIN_SIDE_REACH && reach.sideB >= DOOR_MIN_SIDE_REACH;
        }

        if (!blocked(a.x - 1, a.y) || !blocked(b.x + 1, b.y)) return false;
        if (!walkable(a.x, a.y - 1) || !walkable(a.x, a.y + 1)) return false;
        if (!walkable(b.x, b.y - 1) || !walkable(b.x, b.y + 1)) return false;
        const upRun = walkable(a.x, a.y - 2) && walkable(b.x, b.y - 2);
        const downRun = walkable(a.x, a.y + 2) && walkable(b.x, b.y + 2);
        if (!upRun && !downRun) return false;
        const reach = this.getDoorSideReachability([a, b], orientation);
        return reach.sideA >= DOOR_MIN_SIDE_REACH && reach.sideB >= DOOR_MIN_SIDE_REACH;
    }

    findNearestAnchoredDoorTiles(seedTiles, orientation, occupied = new Set(), radius = 8) {
        if (!seedTiles || seedTiles.length !== 2 || !orientation) return null;
        const grid = this.pathGrid;
        const width = Number(grid?.width) || 0;
        const height = Number(grid?.height) || 0;
        const cx = (seedTiles[0].x + seedTiles[1].x) * 0.5;
        const cy = (seedTiles[0].y + seedTiles[1].y) * 0.5;
        let best = null;
        let bestScore = Infinity;
        const minX = Math.max(1, Math.floor(cx) - radius);
        const minY = Math.max(1, Math.floor(cy) - radius);
        const maxX = Math.min(width - 2, Math.ceil(cx) + radius);
        const maxY = Math.min(height - 2, Math.ceil(cy) + radius);
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const cand = orientation === 'vertical'
                    ? [{ x, y }, { x, y: y + 1 }]
                    : [{ x, y }, { x: x + 1, y }];
                if (cand.some((t) => occupied.has(`${t.x},${t.y}`))) continue;
                if (!this.isAnchoredDoorTiles(cand, orientation)) continue;
                const dcx = (cand[0].x + cand[1].x) * 0.5;
                const dcy = (cand[0].y + cand[1].y) * 0.5;
                const score = (dcx - cx) * (dcx - cx) + (dcy - cy) * (dcy - cy);
                if (score < bestScore) {
                    bestScore = score;
                    best = cand;
                }
            }
        }
        return best;
    }

    createDoors() {
        const occupied = new Set();
        for (const def of this.doorDefinitions) {
            const rawTiles = Array.isArray(def?.tiles) ? def.tiles.map((t) => ({ x: t.x, y: t.y })) : [];
            const orientation = this.getDoorOrientationFromTiles(rawTiles);
            if (!orientation) continue;
            let placedTiles = rawTiles;
            const overlaps = placedTiles.some((t) => occupied.has(`${t.x},${t.y}`));
            if (overlaps || !this.isAnchoredDoorTiles(placedTiles, orientation)) {
                const snapped = this.findNearestAnchoredDoorTiles(rawTiles, orientation, occupied, 10);
                if (!snapped) continue;
                placedTiles = snapped;
            }
            for (const t of placedTiles) occupied.add(`${t.x},${t.y}`);
            const doorSprites = [];
            const group = new DoorGroup(def.id, def.type, doorSprites, this.options.integrityHits || 5, orientation, this.scene);

            for (const tile of placedTiles) {
                const door = new Door(this.scene, tile.x, tile.y, group);
                door.applyOrientationPlacement(orientation);
                doorSprites.push(door);
                this.physicsGroup.add(door);

                // Doors start closed — mark tiles as non-walkable
                this.pathGrid.setWalkable(tile.x, tile.y, false);
            }

            this.doorGroups.push(group);

            if (def.initialState === 'open') {
                group.open(this.pathGrid, this.physicsGroup, this.scene.lightBlockerGrid, this.wallLayer);
            } else if (def.initialState === 'locked') {
                group.lock(this.pathGrid, this.physicsGroup, this.scene.lightBlockerGrid, this.wallLayer);
            } else if (def.initialState === 'welded') {
                group.weld(this.pathGrid, this.physicsGroup, this.scene.lightBlockerGrid, this.wallLayer);
            }
        }
    }

    getDoorGroupAtWorldPos(worldX, worldY) {
        const tileX = Math.floor(worldX / CONFIG.TILE_SIZE);
        const tileY = Math.floor(worldY / CONFIG.TILE_SIZE);

        for (const group of this.doorGroups) {
            for (const door of group.doors) {
                if (door.tileX === tileX && door.tileY === tileY) {
                    return group;
                }
            }
        }
        return null;
    }

    getPhysicsGroup() {
        return this.physicsGroup;
    }

    getDoorsNear(x, y, range) {
        const results = [];
        for (const group of this.doorGroups) {
            if (group.isPassable) continue;
            const c = group.getCenter();
            if (Phaser.Math.Distance.Between(x, y, c.x, c.y) <= range) {
                results.push(group);
            }
        }
        return results;
    }

    getDoorAtTile(tileX, tileY) {
        for (const group of this.doorGroups) {
            for (const door of group.doors) {
                if (door.tileX === tileX && door.tileY === tileY) return group;
            }
        }
        return null;
    }

    hasClosedDoorBetweenWorldPoints(x1, y1, x2, y2) {
        if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return false;
        const line = new Phaser.Geom.Line(x1, y1, x2, y2);
        for (const group of this.doorGroups) {
            if (!group || group.isPassable) continue;
            for (const door of group.doors || []) {
                if (!door) continue;
                const rect = new Phaser.Geom.Rectangle(
                    door.x - door.displayWidth * 0.5,
                    door.y - door.displayHeight * 0.5,
                    door.displayWidth,
                    door.displayHeight
                );
                if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) return true;
            }
        }
        return false;
    }
}
