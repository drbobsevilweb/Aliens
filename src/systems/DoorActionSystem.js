import { CONFIG } from '../config.js';
import { ProgressBar } from '../ui/ProgressBar.js';

const TIMED_ACTIONS = {
    hack: { color: 0x44cccc },
    weld: { color: 0x44cc44 },
    unweld: { color: 0x44cc44 },
};

export class DoorActionSystem {
    constructor(scene, pathGrid, pathfinder, movementSystem) {
        this.scene = scene;
        this.pathGrid = pathGrid;
        this.pathfinder = pathfinder;
        this.movementSystem = movementSystem;
        this.pendingAction = null;
        this.pendingSquadSync = null;
        this.activeTimer = null;
    }

    queueAction(entity, doorGroup, action) {
        this.cancelPending();
        const actorInfo = this.resolveActionActor(entity, action);
        const actor = actorInfo.actor;
        if (!actor) return false;

        const leader = this.scene.leader || entity;
        const leaderSide = this.scene.squadSystem
            ? this.scene.squadSystem.getDoorSide(leader.x, leader.y, doorGroup)
            : null;

        const actorTile = this.pathGrid.worldToTile(actor.x, actor.y);
        const targetInfo = this.findBestAdjacentTile(actorTile, doorGroup, {
            requiredSide: actorInfo.mustUseLeaderSide ? leaderSide : null,
        });
        if (!targetInfo) return false;
        const { targetTile, path } = targetInfo;

        if (actorTile.x === targetTile.x && actorTile.y === targetTile.y) {
            this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            return true;
        }

        if (actorInfo.roleKey) {
            if (!this.scene.squadSystem || !this.scene.squadSystem.assignRoleTask(actorInfo.roleKey, targetTile)) {
                return false;
            }
        } else {
            const worldPath = path.map((p) => this.pathGrid.tileToWorld(p.x, p.y));
            this.movementSystem.assignPath(actor, worldPath);
        }

        this.pendingAction = { doorGroup, action, targetTile, actorInfo, leaderSide };
        return true;
    }

    update(entity, delta) {
        if (this.pendingSquadSync) {
            const sync = this.pendingSquadSync;
            if (this.scene.squadSystem && this.scene.squadSystem.isDoorSyncReady(sync.doorGroup, sync.side)) {
                this.pendingSquadSync = null;
                this.scene.squadSystem.clearDoorSync();
                this.startOrExecute(sync.doorGroup, sync.action, sync.actorInfo, sync.side);
            }
            return;
        }

        if (this.activeTimer) {
            this.activeTimer.elapsed += delta;
            const progress = this.activeTimer.elapsed / this.activeTimer.duration;
            this.activeTimer.progressBar.update(progress);

            if (this.activeTimer.elapsed >= this.activeTimer.duration) {
                this.completeTimedAction();
            }
            return;
        }

        if (!this.pendingAction) return;

        const actorInfo = this.pendingAction.actorInfo || { actor: entity, roleKey: null, mustUseLeaderSide: false };
        if (actorInfo.roleKey) {
            if (this.scene.squadSystem && this.scene.squadSystem.isRoleTaskComplete(actorInfo.roleKey)) {
                const { doorGroup, action, leaderSide } = this.pendingAction;
                this.pendingAction = null;
                this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            }
            return;
        }

        if (!actorInfo.actor.currentPath) {
            const actorTile = this.pathGrid.worldToTile(actorInfo.actor.x, actorInfo.actor.y);
            const target = this.pendingAction.targetTile;
            if (actorTile.x === target.x && actorTile.y === target.y) {
                const { doorGroup, action, leaderSide } = this.pendingAction;
                this.pendingAction = null;
                this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            } else {
                this.pendingAction = null;
            }
        }
    }

    startOrExecute(doorGroup, action, actorInfo, leaderSide = null) {
        if (this.requiresSquadSync(action, actorInfo) && this.scene.squadSystem) {
            const side = leaderSide ?? this.scene.squadSystem.getDoorSide(this.scene.leader.x, this.scene.leader.y, doorGroup);
            if (!this.scene.squadSystem.isDoorSyncReady(doorGroup, side)) {
                this.scene.squadSystem.requestDoorSync(doorGroup, side);
                this.pendingSquadSync = { doorGroup, action, side, actorInfo };
                return;
            }
            this.scene.squadSystem.clearDoorSync();
        }

        const timedConfig = TIMED_ACTIONS[action];
        if (timedConfig) {
            this.startTimedAction(
                doorGroup,
                action,
                {
                    ...timedConfig,
                    duration: this.getActionDuration(action, actorInfo),
                },
                actorInfo
            );
        } else {
            this.executeAction(doorGroup, action);
        }
    }

    getActionDuration(action, actorInfo = null) {
        const d = this.scene.runtimeSettings?.doors || {};
        let duration = 0;
        if (action === 'hack') duration = d.hackDurationMs || CONFIG.DOOR_HACK_DURATION;
        else if (action === 'weld') duration = d.weldDurationMs || CONFIG.DOOR_WELD_DURATION;
        else if (action === 'unweld') duration = d.unweldDurationMs || CONFIG.DOOR_UNWELD_DURATION;
        if (
            actorInfo &&
            actorInfo.roleKey === 'tech' &&
            (action === 'hack' || action === 'weld' || action === 'unweld')
        ) {
            duration = Math.max(350, Math.floor(duration * 0.5));
        }
        if (duration > 0) return duration;
        return 0;
    }

    requiresSquadSync(action, actorInfo = null) {
        if (action === 'close') return true;
        if (action === 'weld' || action === 'hack' || action === 'unweld') return true;
        if (actorInfo && actorInfo.roleKey) return true;
        return false;
    }

    startTimedAction(doorGroup, action, timedConfig, actorInfo = null) {
        let sumX = 0;
        let sumY = 0;
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
            actorInfo,
            startedAt: this.scene.time.now,
        };
    }

    completeTimedAction() {
        const { doorGroup, action } = this.activeTimer;
        this.activeTimer.progressBar.hide();
        if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.roleKey && this.scene.squadSystem) {
            this.scene.squadSystem.clearRoleTask(this.activeTimer.actorInfo.roleKey);
        }
        this.activeTimer = null;
        this.executeAction(doorGroup, action);
    }

    cancelPending() {
        if (this.pendingAction && this.pendingAction.actorInfo && this.pendingAction.actorInfo.roleKey && this.scene.squadSystem) {
            this.scene.squadSystem.clearRoleTask(this.pendingAction.actorInfo.roleKey);
        }
        if (this.pendingSquadSync && this.pendingSquadSync.actorInfo && this.pendingSquadSync.actorInfo.roleKey && this.scene.squadSystem) {
            this.scene.squadSystem.clearRoleTask(this.pendingSquadSync.actorInfo.roleKey);
        }
        this.pendingAction = null;
        this.pendingSquadSync = null;
        if (this.scene.squadSystem) this.scene.squadSystem.clearDoorSync();
        if (this.activeTimer) {
            if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.roleKey && this.scene.squadSystem) {
                this.scene.squadSystem.clearRoleTask(this.activeTimer.actorInfo.roleKey);
            }
            this.activeTimer.progressBar.hide();
            this.activeTimer = null;
        }
    }

    hasFollowerOwnedAction() {
        const isFollowerTask = (entry) => {
            return !!(entry && entry.actorInfo && entry.actorInfo.roleKey);
        };
        return isFollowerTask(this.pendingAction)
            || isFollowerTask(this.pendingSquadSync)
            || isFollowerTask(this.activeTimer);
    }

    cancelForLeaderMove() {
        if (this.hasFollowerOwnedAction()) return false;
        this.cancelPending();
        return true;
    }

    resolveActionActor(defaultActor, action) {
        const timedSpecialist = action === 'hack' || action === 'weld' || action === 'unweld';
        if (!timedSpecialist || !this.scene.squadSystem) {
            return { actor: defaultActor, roleKey: null, mustUseLeaderSide: false };
        }
        const tech = this.scene.squadSystem.getFollowerByRole('tech');
        if (tech) {
            return { actor: tech, roleKey: 'tech', mustUseLeaderSide: true };
        }
        return { actor: defaultActor, roleKey: null, mustUseLeaderSide: false };
    }

    getActiveTimer() {
        return this.activeTimer;
    }

    executeAction(doorGroup, action) {
        const pathGrid = this.pathGrid;
        const physicsGroup = this.scene.doorManager.physicsGroup;
        const lightBlockerGrid = this.scene.lightBlockerGrid;
        const wallLayer = this.scene.wallLayer;

        switch (action) {
            case 'open':
                doorGroup.open(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
            case 'close':
                doorGroup.close(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
            case 'hack':
                doorGroup.hack(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
            case 'lock':
                doorGroup.lock(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
            case 'weld':
                doorGroup.weld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
            case 'unweld':
                doorGroup.unweld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
                break;
        }
    }

    findBestAdjacentTile(entityTile, doorGroup, options = null) {
        const doorTileKeys = new Set();
        for (const door of doorGroup.doors) {
            doorTileKeys.add(`${door.tileX},${door.tileY}`);
        }
        const requiredSide = options && Number.isFinite(options.requiredSide) ? options.requiredSide : null;

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
                if (!this.pathGrid.isWalkable(nx, ny) || doorTileKeys.has(key)) continue;
                if (requiredSide !== null && this.scene.squadSystem) {
                    const world = this.pathGrid.tileToWorld(nx, ny);
                    const side = this.scene.squadSystem.getDoorSide(world.x, world.y, doorGroup);
                    if (side !== requiredSide) continue;
                }
                candidates.push({ x: nx, y: ny, key });
            }
        }

        if (candidates.length === 0) return null;

        const seen = new Set();
        let best = null;
        let bestPathLength = Infinity;

        for (const c of candidates) {
            if (seen.has(c.key)) continue;
            seen.add(c.key);

            if (c.x === entityTile.x && c.y === entityTile.y) {
                return { targetTile: { x: c.x, y: c.y }, path: [] };
            }

            const path = this.pathfinder.findPath(entityTile.x, entityTile.y, c.x, c.y, this.pathGrid);
            if (!path) continue;

            if (path.length < bestPathLength) {
                bestPathLength = path.length;
                best = {
                    targetTile: { x: c.x, y: c.y },
                    path,
                };
            }
        }

        return best;
    }
}
