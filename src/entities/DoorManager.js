import { CONFIG } from '../config.js';
import { Door } from './Door.js';
import { DOOR_DEFINITIONS } from '../map/doorData.js';

class DoorGroup {
    constructor(id, type, doorSprites) {
        this.id = id;
        this.type = type;
        this.doors = doorSprites;
        this.state = 'closed';
    }

    get supportsHackLock() {
        return this.type === 'electronic';
    }

    getAvailableActions() {
        const actions = [];
        switch (this.state) {
            case 'closed':
                actions.push({ label: 'Open', action: 'open' });
                if (this.supportsHackLock) {
                    actions.push({ label: 'Lock', action: 'lock' });
                }
                actions.push({ label: 'Weld', action: 'weld' });
                break;
            case 'open':
                actions.push({ label: 'Close', action: 'close' });
                if (this.supportsHackLock) {
                    actions.push({ label: 'Lock', action: 'lock' });
                }
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

    open(pathGrid, physicsGroup) {
        if (this.state !== 'closed') return;
        this.state = 'open';
        for (const door of this.doors) {
            door.open();
            pathGrid.setWalkable(door.tileX, door.tileY, true);
        }
    }

    close(pathGrid, physicsGroup) {
        if (this.state !== 'open') return;
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
            pathGrid.setWalkable(door.tileX, door.tileY, false);
        }
        physicsGroup.refresh();
    }

    lock(pathGrid, physicsGroup) {
        if (!this.supportsHackLock) return;
        if (this.state !== 'closed' && this.state !== 'open') return;
        // If open, close first
        if (this.state === 'open') {
            for (const door of this.doors) {
                pathGrid.setWalkable(door.tileX, door.tileY, false);
            }
        }
        this.state = 'locked';
        for (const door of this.doors) {
            door.showLocked();
        }
        physicsGroup.refresh();
    }

    hack() {
        if (!this.supportsHackLock) return;
        if (this.state !== 'locked') return;
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
        }
    }

    weld(pathGrid, physicsGroup) {
        if (this.state === 'welded') return;
        // If open, close first
        if (this.state === 'open') {
            for (const door of this.doors) {
                pathGrid.setWalkable(door.tileX, door.tileY, false);
            }
        }
        this.state = 'welded';
        for (const door of this.doors) {
            door.showWelded();
        }
        physicsGroup.refresh();
    }

    unweld() {
        if (this.state !== 'welded') return;
        this.state = 'closed';
        for (const door of this.doors) {
            door.close();
        }
    }
}

export class DoorManager {
    constructor(scene, pathGrid) {
        this.scene = scene;
        this.pathGrid = pathGrid;
        this.doorGroups = [];
        this.physicsGroup = scene.physics.add.staticGroup();

        this.createDoors();
    }

    createDoors() {
        for (const def of DOOR_DEFINITIONS) {
            const doorSprites = [];
            const group = new DoorGroup(def.id, def.type, doorSprites);

            for (const tile of def.tiles) {
                const door = new Door(this.scene, tile.x, tile.y, group);
                doorSprites.push(door);
                this.physicsGroup.add(door);

                // Doors start closed — mark tiles as non-walkable
                this.pathGrid.setWalkable(tile.x, tile.y, false);
            }

            this.doorGroups.push(group);
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
