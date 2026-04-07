import { CONFIG } from '../config.js';
import { ProgressBar } from '../ui/ProgressBar.js';
const TIMED_ACTIONS = {
    hack:   { color: 0xff9944 },
    lock:   { color: 0xff9944 },
    weld:   { color: 0xff9944 },
    unweld: { color: 0xff9944 },
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
        const actorInfo = this.resolveActionActor(entity, action);
        const actor = actorInfo.actor;
        if (!actor) return false;

        const leader = this.scene.leader || entity;
        const leaderSide = this.scene.squadSystem
            ? this.scene.squadSystem.getDoorSide(leader.x, leader.y, doorGroup)
            : null;

        let actorTile = this.pathGrid.worldToTile(actor.x, actor.y);

        // If actor is standing in a non-walkable tile (edge-feathering near walls),
        // snap to the nearest walkable neighbor so pathfinding can start.
        if (!this.pathGrid.isWalkable(actorTile.x, actorTile.y)) {
            actorTile = this._snapToNearestWalkable(actor.x, actor.y, actorTile);
        }

        // Proximity auto-approach: if actor is already tile-adjacent, proceed immediately
        if (this.isTileAdjacentToDoor(actorTile, doorGroup)) {
            this.cancelPending();
            this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            return true;
        }

        const targetInfo = this.findBestAdjacentTile(actorTile, doorGroup, {
            requiredSide: actorInfo.mustUseLeaderSide ? leaderSide : null,
        });

        // If within 80px and pathfinding failed, try direct move to nearest adjacent tile
        if (!targetInfo) {
            const doorCenter = this.getDoorCenter(doorGroup);
            const distToDoor = Math.hypot(actor.x - doorCenter.x, actor.y - doorCenter.y);
            if (distToDoor <= 80) {
                const relaxedTarget = this.findBestAdjacentTile(actorTile, doorGroup, {
                    requiredSide: null,
                });
                if (relaxedTarget) {
                    const targetWorld = this.pathGrid.tileToWorld(relaxedTarget.targetTile.x, relaxedTarget.targetTile.y);
                    if (!actorInfo.roleKey) {
                        this.cancelPending();
                        this.movementSystem.assignPath(actor, [targetWorld]);
                    }
                    this.pendingAction = { doorGroup, action, targetTile: relaxedTarget.targetTile, actorInfo, leaderSide };
                    return true;
                }
            }
            return false;
        }
        const { targetTile, path } = targetInfo;

        if (actorTile.x === targetTile.x && actorTile.y === targetTile.y) {
            this.cancelPending();
            this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            return true;
        }

        if (actorInfo.roleKey) {
            if (!this.scene.squadSystem || !this.scene.squadSystem.assignRoleTask(actorInfo.roleKey, targetTile)) {
                return false;
            }
        } else {
            const worldPath = path.map((p) => this.pathGrid.tileToWorld(p.x, p.y));
            this.cancelPending();
            this.movementSystem.assignPath(actor, worldPath);
        }

        if (actorInfo.roleKey) this.cancelPending();
        this.pendingAction = { doorGroup, action, targetTile, actorInfo, leaderSide };
        return true;
    }

    update(entity, delta) {
        if (this.pendingSquadSync) {
            const sync = this.pendingSquadSync;
            
            // Cancel if actor died
            if (sync.actorInfo && sync.actorInfo.actor) {
                const actor = sync.actorInfo.actor;
                if (!actor.active || (Number.isFinite(actor.health) && actor.health <= 0)) {
                    this.cancelPending();
                    return;
                }
            }

            // Timeout after 2 seconds (10s for lock) to prevent stuck state
            if (!sync._startedAt) sync._startedAt = this.scene.time.now;
            const elapsed = this.scene.time.now - sync._startedAt;
            const timeout = sync.action === 'lock' ? 10000 : 2000;

            if (this.scene.squadSystem && this.scene.squadSystem.isDoorSyncReady(sync.doorGroup, sync.side)) {
                this.pendingSquadSync = null;
                this.scene.squadSystem.clearDoorSync();
                this.releaseMovementLock();
                this.startOrExecute(sync.doorGroup, sync.action, sync.actorInfo, sync.side);
            } else if (elapsed > timeout) {
                // Squad sync timed out — proceed anyway, bypass sync check to prevent re-loop
                this.pendingSquadSync = null;
                if (this.scene.squadSystem) this.scene.squadSystem.clearDoorSync();
                this.releaseMovementLock();
                this.startOrExecute(sync.doorGroup, sync.action, sync.actorInfo, sync.side, true);
            }
            return;
        }

        if (this.activeTimer) {
            // Cancel if actor died
            if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.actor) {
                const actor = this.activeTimer.actorInfo.actor;
                if (!actor.active || (Number.isFinite(actor.health) && actor.health <= 0)) {
                    this.cancelPending();
                    return;
                }
            }

            this.activeTimer.elapsed += delta;

            // Keep actor facing the door and pinned to work position (resists separation forces)
            if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.actor) {
                const actor = this.activeTimer.actorInfo.actor;
                const center = this.getDoorCenter(this.activeTimer.doorGroup);
                const angle = Phaser.Math.Angle.Between(actor.x, actor.y, center.x, center.y);
                if (typeof actor.setDesiredRotation === 'function') {
                    actor.setDesiredRotation(angle);
                }
                if (typeof actor.updateRotation === 'function') {
                    actor.updateRotation(delta, this.scene.time.now, { patrol: false });
                }
                // Pin worker to the position they arrived at — prevents separation forces drifting them off the door
                if (this.activeTimer.actorWorkPos) {
                    const wp = this.activeTimer.actorWorkPos;
                    const pdx = wp.x - actor.x;
                    const pdy = wp.y - actor.y;
                    if (pdx * pdx + pdy * pdy > 4) {
                        const pinSpeed = (this.scene.squadSystem?.formupSpeed || 120) * 1.5;
                        if (typeof actor.moveTowardRigid === 'function') {
                            actor.moveTowardRigid(wp.x, wp.y, delta, pinSpeed);
                        }
                    }
                }
            }

            const progress = this.activeTimer.elapsed / this.activeTimer.duration;
            this.activeTimer.progressBar.update(progress);

            // Play welding sound during progress
            if (this.activeTimer.action === 'weld' || this.activeTimer.action === 'unweld') {
                if (this.scene.sfx) this.scene.sfx.playDoorWeld(true);
            }

            if (this.activeTimer.elapsed >= this.activeTimer.duration) {
                if (this.scene.sfx) this.scene.sfx.playDoorWeld(false);
                this.completeTimedAction();
            }
            return;
        }

        if (!this.pendingAction) return;

        const actorInfo = this.pendingAction.actorInfo || { actor: entity, roleKey: null, mustUseLeaderSide: false };
        if (actorInfo.actor) {
            if (!actorInfo.actor.active || (Number.isFinite(actorInfo.actor.health) && actorInfo.actor.health <= 0)) {
                this.cancelPending();
                return;
            }
        }

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
            const reachedTarget = actorTile.x === target.x && actorTile.y === target.y;
            const adjacentToDoor = this.isTileAdjacentToDoor(actorTile, this.pendingAction.doorGroup);
            if (reachedTarget || adjacentToDoor) {
                const { doorGroup, action, leaderSide } = this.pendingAction;
                this.pendingAction = null;
                this.startOrExecute(doorGroup, action, actorInfo, leaderSide);
            } else {
                this.pendingAction = null;
            }
        }
    }

    startOrExecute(doorGroup, action, actorInfo, leaderSide = null, bypassSync = false) {
        if (!bypassSync && this.requiresSquadSync(action, actorInfo) && this.scene.squadSystem) {
            const side = leaderSide ?? this.scene.squadSystem.getDoorSide(this.scene.leader.x, this.scene.leader.y, doorGroup);
            if (!this.scene.squadSystem.isDoorSyncReady(doorGroup, side)) {
                this.scene.squadSystem.requestDoorSync(doorGroup, side);
                this.pendingSquadSync = { doorGroup, action, side, actorInfo };
                if (action === 'lock') {
                    this.setMovementLock();
                }
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
        else if (action === 'lock') duration = d.lockDurationMs || CONFIG.DOOR_LOCK_DURATION;
        else if (action === 'weld') duration = d.weldDurationMs || CONFIG.DOOR_WELD_DURATION;
        else if (action === 'unweld') duration = d.unweldDurationMs || CONFIG.DOOR_UNWELD_DURATION;
        
        if (duration > 0) return duration;
        return 0;
    }

    requiresSquadSync(action, actorInfo = null) {
        if (action === 'close') return true;
        if (action === 'lock' || action === 'weld' || action === 'hack' || action === 'unweld') return true;
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
        progressBar.show(centerX, centerY, timedConfig.color, action);

        this.activeTimer = {
            doorGroup,
            action,
            duration: timedConfig.duration,
            elapsed: 0,
            progressBar,
            actorInfo,
            startedAt: this.scene.time.now,
            // Capture work position so we can pin the actor against separation forces
            actorWorkPos: (actorInfo && actorInfo.actor)
                ? { x: actorInfo.actor.x, y: actorInfo.actor.y }
                : null,
        };
    }

    completeTimedAction() {
        const { doorGroup, action } = this.activeTimer;
        this.activeTimer.progressBar.hide();
        if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.roleKey && this.scene.squadSystem) {
            this.scene.squadSystem.clearRoleTask(this.activeTimer.actorInfo.roleKey);
        }
        this.activeTimer = null;
        this.releaseMovementLock();
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
        this.releaseMovementLock();
        if (this.activeTimer) {
            // Stop weld sound on cancel
            if ((this.activeTimer.action === 'weld' || this.activeTimer.action === 'unweld') && this.scene.sfx) {
                this.scene.sfx.playDoorWeld(false);
            }
            if (this.activeTimer.actorInfo && this.activeTimer.actorInfo.roleKey && this.scene.squadSystem) {
                this.scene.squadSystem.clearRoleTask(this.activeTimer.actorInfo.roleKey);
            }
            this.activeTimer.progressBar.hide();
            this.activeTimer = null;
        }
    }

    setMovementLock() {
        if (this.scene.inputHandler) {
            this.scene.inputHandler.movementLocked = true;
        }
    }

    releaseMovementLock() {
        if (this.scene.inputHandler) {
            this.scene.inputHandler.movementLocked = false;
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

    isActorBusy(actor) {
        const check = (entry) => {
            return entry && entry.actorInfo && entry.actorInfo.actor === actor;
        };
        return check(this.pendingAction) || check(this.pendingSquadSync) || check(this.activeTimer);
    }

    cancelForLeaderMove() {
        if (this.hasFollowerOwnedAction()) return false;
        this.cancelPending();
        return true;
    }

    resolveActionActor(defaultActor, action) {
        const timedSpecialist = action === 'hack' || action === 'lock' || action === 'weld' || action === 'unweld';
        if (!timedSpecialist || !this.scene.squadSystem) {
            return { actor: defaultActor, roleKey: null, mustUseLeaderSide: false };
        }
        
        const squad = this.scene.squadSystem;
        const canAssignRole = (roleKey) => {
            const follower = squad.getFollowerByRole(roleKey);
            if (!follower) return null;
            if (squad.isRoleTaskActive?.(roleKey)) return null;
            if (this.scene.isMarineTrackerBusy?.(follower, this.scene.time.now)) return null;
            if (this.scene.isMarineHealBusy?.(follower, this.scene.time.now)) return null;
            return follower;
        };

        const tech = canAssignRole('tech');
        const medic = canAssignRole('medic');
        const heavy = canAssignRole('heavy');

        // Priority: tech -> medic -> heavy
        if (tech) return { actor: tech, roleKey: 'tech', mustUseLeaderSide: true };
        if (medic) return { actor: medic, roleKey: 'medic', mustUseLeaderSide: true };
        if (heavy) return { actor: heavy, roleKey: 'heavy', mustUseLeaderSide: true };

        return { actor: defaultActor, roleKey: null, mustUseLeaderSide: false };
    }

    getDoorCenter(doorGroup) {
        let sx = 0;
        let sy = 0;
        for (const door of doorGroup.doors) {
            sx += door.x;
            sy += door.y;
        }
        return {
            x: sx / doorGroup.doors.length,
            y: sy / doorGroup.doors.length,
        };
    }

    getActiveTimer() {
        return this.activeTimer;
    }

    executeAction(doorGroup, action) {
        const pathGrid = this.pathGrid;
        const physicsGroup = this.scene.doorManager.physicsGroup;
        const lightBlockerGrid = this.scene.lightBlockerGrid;
        const wallLayer = this.scene.wallLayer;

        // Sound triggers for door actions
        if (this.scene.sfx) {
            if (action === 'open' || action === 'close') {
                this.scene.sfx.playDoorOpenClose();
                this.scene.sfx.playSteamHiss();
            } else if (action === 'hack' || action === 'lock' || action === 'weld' || action === 'unweld') {
                this.scene.sfx.playSteamHiss();
            }
        }

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

    _snapToNearestWalkable(worldX, worldY, tile) {
        const ts = CONFIG.TILE_SIZE;
        const dirs = [
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        ];
        let best = tile;
        let bestDist = Infinity;
        for (const d of dirs) {
            const nx = tile.x + d.dx;
            const ny = tile.y + d.dy;
            if (!this.pathGrid.isWalkable(nx, ny)) continue;
            const cx = nx * ts + ts / 2;
            const cy = ny * ts + ts / 2;
            const dist = (worldX - cx) ** 2 + (worldY - cy) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                best = { x: nx, y: ny };
            }
        }
        return best;
    }

    isTileAdjacentToDoor(tile, doorGroup) {
        if (!tile || !doorGroup || !Array.isArray(doorGroup.doors)) return false;
        for (const door of doorGroup.doors) {
            if (!door) continue;
            const md = Math.abs(tile.x - door.tileX) + Math.abs(tile.y - door.tileY);
            if (md === 1) return true;
        }
        return false;
    }

    destroy() {
        if (this.scene?.sfx) {
            this.scene.sfx.playDoorWeld(false);
        }
    }
}
