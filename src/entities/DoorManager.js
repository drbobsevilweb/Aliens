import { CONFIG } from '../config.js';
import { Door } from './Door.js';
import { DOOR_DEFINITIONS } from '../map/doorData.js';

class DoorGroup {
    constructor(id, type, doorSprites, integrityHits = 5) {
        this.id = id;
        this.type = type;
        this.doors = doorSprites;
        this.state = 'closed';
        this.maxIntegrity = integrityHits;
        this.integrity = integrityHits;
    }

    get supportsHackLock() {
        return this.type === 'electronic';
    }

    getAvailableActions() {
        const actions = [];
        switch (this.state) {
            case 'closed':
                actions.push({ label: 'Open', action: 'open' });
                actions.push({ label: 'Weld', action: 'weld' });
                break;
            case 'open':
                actions.push({ label: 'Close', action: 'close' });
                actions.push({ label: 'Weld', action: 'weld' });
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
    }

    open(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state !== 'closed') return;
        this.state = 'open';
        for (const door of this.doors) {
            door.open();
            pathGrid.setWalkable(door.tileX, door.tileY, true);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
        }
        this.setWallCollision(wallLayer, false);
        physicsGroup.refresh();
    }

    close(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state !== 'open') return;
        this.resetIntegrity();
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
            pathGrid.setWalkable(door.tileX, door.tileY, false);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
    }

    lock(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (!this.supportsHackLock) return;
        if (this.state !== 'closed' && this.state !== 'open') return;
        this.resetIntegrity();
        if (this.state === 'open') {
            for (const door of this.doors) {
                pathGrid.setWalkable(door.tileX, door.tileY, false);
                if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
            }
        }
        this.state = 'locked';
        for (const door of this.doors) {
            door.showLocked();
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
    }

    hack(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (!this.supportsHackLock) return;
        if (this.state !== 'locked') return;
        this.resetIntegrity();
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
    }

    weld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'welded') return;
        this.resetIntegrity();
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
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
    }

    unweld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state !== 'welded') return;
        this.resetIntegrity();
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
        }
        this.setWallCollision(wallLayer, true);
        physicsGroup.refresh();
    }

    forceOpen(pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'open') return;
        this.state = 'open';
        for (const door of this.doors) {
            door.open();
            pathGrid.setWalkable(door.tileX, door.tileY, true);
            if (lightBlockerGrid) lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, false);
        }
        this.setWallCollision(wallLayer, false);
        physicsGroup.refresh();
    }

    applyEnemyDamage(amount, pathGrid, physicsGroup, lightBlockerGrid, wallLayer) {
        if (this.state === 'open') return false;
        this.integrity = Math.max(0, this.integrity - amount);
        if (this.integrity > 0) return false;
        this.forceOpen(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
        this.resetIntegrity();
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

    createDoors() {
        for (const def of this.doorDefinitions) {
            const doorSprites = [];
            const group = new DoorGroup(def.id, def.type, doorSprites, this.options.integrityHits || 5);

            for (const tile of def.tiles) {
                const door = new Door(this.scene, tile.x, tile.y, group);
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
}
