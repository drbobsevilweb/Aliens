import { MarineFollower } from '../entities/MarineFollower.js';
import { CONFIG } from '../config.js';

const SNAKE_HISTORY_CAP = 120;
const LEADER_MOVING_SPEED = 28;
const BEHAVIOR_PRESETS = Object.freeze({
    cinematic: Object.freeze({
        leaderTurn: 5.8,
        followerTurn: 5.4,
        snakeStep: 8,
        followLerp: 0.085,
        patrolSpeed: 0.0032,
        patrolAmplitude: 0.23,
    }),
    balanced: Object.freeze({
        leaderTurn: 8.5,
        followerTurn: 7.2,
        snakeStep: 6,
        followLerp: 0.1,
        patrolSpeed: 0.0045,
        patrolAmplitude: 0.18,
    }),
    snappy: Object.freeze({
        leaderTurn: 12.5,
        followerTurn: 10.2,
        snakeStep: 5,
        followLerp: 0.14,
        patrolSpeed: 0.0055,
        patrolAmplitude: 0.12,
    }),
});
const PRESET_ORDER = ['cinematic', 'balanced', 'snappy'];

const DIAMOND_SLOT_LAYOUT = [
    { role: 'tech', nx: -1.25, ny: 0.95 },
    { role: 'medic', nx: -2.15, ny: 0.0 },
    { role: 'heavy', nx: -1.25, ny: -0.95 },
];
const DEFAULT_SNAKE_BASE_SPEED = 280;
const DEFAULT_FORMUP_SPEED = 210;
const DEFAULT_SNAKE_CATCHUP_GAIN = 1.8;
const DEFAULT_SNAKE_STAGGER_MS = 380;
const DEFAULT_MIN_SPACING = 40;
const TEAM_SPEED_SCALE = 1.0;

export class SquadSystem {
    constructor(scene, leader, pathGrid = null, runtimeTuning = null) {
        this.scene = scene;
        this.leader = leader;
        this.pathGrid = pathGrid;
        this.runtimeTuning = runtimeTuning || {};
        this.followers = [];
        this.sampleTimer = 0;
        this.history = [];
        this.doorSync = null;
        this.currentPreset = 'balanced';
        this.snakeStep = 6;
        this.snakeBaseSpeed = DEFAULT_SNAKE_BASE_SPEED;
        this.formupSpeed = DEFAULT_FORMUP_SPEED;
        this.snakeCatchupGain = DEFAULT_SNAKE_CATCHUP_GAIN;
        this.snakeStaggerMs = DEFAULT_SNAKE_STAGGER_MS;
        this.minSpacing = DEFAULT_MIN_SPACING;
        this.leaderWasMoving = false;
        this.idleFormationTargets = new Map();
        this.idleFormationAnchor = { x: leader.x, y: leader.y };
        this.roleTasks = new Map();
        this.externalHoldRoles = new Set();
        this.slotScalePx = CONFIG.TILE_SIZE;
        this.snakeStaggerMinMs = 500;
        this.snakeStaggerMaxMs = 1000;
        this.diamondSlots = DIAMOND_SLOT_LAYOUT.map((s) => ({
            role: s.role,
            x: s.nx * this.slotScalePx,
            y: s.ny * this.slotScalePx,
        }));

        this.createFollowers();
        this.applyBehaviorPreset(this.currentPreset);
        this.rebuildSnakeStaggerProfile();
    }

    createFollowers() {
        for (let i = 0; i < this.diamondSlots.length; i++) {
            const slot = this.diamondSlots[i];
            const startX = this.leader.x + slot.x;
            const startY = this.leader.y + slot.y;
            const follower = new MarineFollower(this.scene, startX, startY, slot.role);
            follower.setDesiredRotation(this.leader.rotation);
            this.followers.push({ sprite: follower, slot, index: i });
        }
    }

    update(delta, time, context = {}) {
        this.sampleLeaderHistory(delta);
        this.updateRoleTasks(delta);
        const leaderMoving = this.isLeaderMoving();
        if (!leaderMoving && this.leaderWasMoving) {
            this.captureIdleFormationTargets();
        }
        if (leaderMoving && !this.leaderWasMoving) {
            this.idleFormationTargets.clear();
            this.rebuildSnakeStaggerProfile();
        }
        if (!leaderMoving && this.shouldRefreshIdleTargets()) {
            this.captureIdleFormationTargets();
        }

        if (this.doorSync) {
            this.updateDoorSync(delta, time);
        } else if (leaderMoving) {
            this.updateSnakeFollow(delta, time);
        } else {
            this.updateDiamondForm(delta, time);
        }
        this.applyFollowerSeparation(delta);

        const threat = null;
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            let targetAngle = follower.sprite.baseRotation;
            let patrol = false;
            if (threat) {
                targetAngle = Phaser.Math.Angle.Between(
                    follower.sprite.x,
                    follower.sprite.y,
                    threat.x,
                    threat.y
                );
                patrol = false;
            }
            follower.sprite.setDesiredRotation(targetAngle);
            follower.sprite.updateRotation(delta, time, { patrol });
        }
        this.leaderWasMoving = leaderMoving;
    }

    sampleLeaderHistory(delta) {
        this.sampleTimer += delta;
        const reactionDelay = this.runtimeTuning.reactionDelayMs || CONFIG.MARINE_REACTION_DELAY_MS;
        if (this.sampleTimer < reactionDelay) return;
        this.sampleTimer = 0;
        this.history.push({
            x: this.leader.x,
            y: this.leader.y,
            rotation: this.leader.rotation,
            time: this.scene.time.now,
        });
        if (this.history.length > SNAKE_HISTORY_CAP) this.history.shift();
    }

    isLeaderMoving() {
        const v = this.leader.body ? this.leader.body.velocity : { x: 0, y: 0 };
        const speedSq = v.x * v.x + v.y * v.y;
        const movingByVelocity = speedSq >= LEADER_MOVING_SPEED * LEADER_MOVING_SPEED;
        return movingByVelocity || !!this.leader.currentPath;
    }

    updateSnakeFollow(delta, time) {
        if (this.history.length === 0) return;
        const base = this.snakeBaseSpeed;
        const minSpacing = Math.max(10, this.minSpacing);
        const catchupGain = Math.max(0, this.snakeCatchupGain || 0);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            const delayMs = Math.max(0, Number(follower.staggerDelayMs) || ((follower.index + 1) * this.snakeStaggerMs));
            const target = this.getHistoryPointAtDelay(time, delayMs);
            const targetX = target.x;
            const targetY = target.y;

            const dx = targetX - follower.sprite.x;
            const dy = targetY - follower.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const anchor = follower.index === 0 ? this.leader : this.followers[follower.index - 1].sprite;
            const adx = anchor.x - follower.sprite.x;
            const ady = anchor.y - follower.sprite.y;
            const anchorDist = Math.sqrt(adx * adx + ady * ady);
            const spacingRatio = Phaser.Math.Clamp((anchorDist - minSpacing * 0.55) / (minSpacing * 0.9), 0, 1);
            const speedFloor = 0.28 + spacingRatio * 0.72;
            const catchupBoost = Phaser.Math.Clamp((dist - minSpacing) / Math.max(1, minSpacing * 2.8), 0, 1)
                * base
                * 0.35
                * catchupGain;
            const speed = base * speedFloor + catchupBoost;
            follower.sprite.moveTowardRigid(targetX, targetY, delta, speed);
            if (dist > 2) follower.sprite.setDesiredRotation(Math.atan2(dy, dx));
        }
    }

    getHistoryPointAtDelay(now, delayMs) {
        const targetTime = now - delayMs;
        let candidate = this.history[0];
        for (let i = this.history.length - 1; i >= 0; i--) {
            const h = this.history[i];
            if (h.time <= targetTime) {
                candidate = h;
                break;
            }
        }
        return candidate || this.history[0];
    }

    rebuildSnakeStaggerProfile() {
        const minMs = Math.max(100, Number(this.snakeStaggerMinMs) || 500);
        const maxMs = Math.max(minMs, Number(this.snakeStaggerMaxMs) || 1000);
        let cumulative = 0;
        for (const follower of this.followers) {
            const gapMs = Phaser.Math.Between(minMs, maxMs);
            cumulative += gapMs;
            follower.staggerGapMs = gapMs;
            follower.staggerDelayMs = cumulative;
        }
    }

    updateDiamondForm(delta, time) {
        const base = this.formupSpeed;
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            const target = this.idleFormationTargets.get(follower.index) || {
                x: this.leader.x + follower.slot.x,
                y: this.leader.y + follower.slot.y,
            };
            const targetX = target.x;
            const targetY = target.y;
            const dx = targetX - follower.sprite.x;
            const dy = targetY - follower.sprite.y;
            const speed = base;
            follower.sprite.moveTowardRigid(targetX, targetY, delta, speed);
        }
    }

    shouldRefreshIdleTargets() {
        if (!this.idleFormationAnchor) return true;
        const dx = this.leader.x - this.idleFormationAnchor.x;
        const dy = this.leader.y - this.idleFormationAnchor.y;
        return (dx * dx + dy * dy) > 64;
    }

    captureIdleFormationTargets() {
        this.idleFormationTargets.clear();
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            const localX = follower.slot.x;
            const localY = follower.slot.y;
            let targetX = this.leader.x + localX;
            let targetY = this.leader.y + localY;
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 4, null, null);
                targetX = snap.x;
                targetY = snap.y;
            }
            this.idleFormationTargets.set(follower.index, { x: targetX, y: targetY });
        }
        this.idleFormationAnchor = { x: this.leader.x, y: this.leader.y };
    }

    updateDoorSync(delta, time) {
        const base = this.formupSpeed * 0.95;
        const { doorGroup, side } = this.doorSync;
        const center = this.getDoorCenter(doorGroup);
        const isVertical = this.isDoorVertical(doorGroup);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            let targetX = follower.sprite.x;
            let targetY = follower.sprite.y;
            if (isVertical) {
                targetX = center.x + side * 44;
                targetY = center.y + (follower.index - 1) * 20;
            } else {
                targetX = center.x + (follower.index - 1) * 20;
                targetY = center.y + side * 44;
            }
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 4, null, null);
                targetX = snap.x;
                targetY = snap.y;
            }
            const dx = targetX - follower.sprite.x;
            const dy = targetY - follower.sprite.y;
            const speed = base;
            follower.sprite.moveTowardRigid(targetX, targetY, delta, speed);
        }
    }

    applyFollowerSeparation(delta) {
        const dt = Math.max(0.001, delta / 1000);
        const minSpacing = Math.max(8, this.minSpacing);
        const minSpacingSq = minSpacing * minSpacing;
        const maxPush = minSpacing * 0.95 * dt * 9.5;
        const active = this.followers
            .map((f) => f.sprite)
            .filter((s) => s && s.active && s.alive !== false);

        for (let i = 0; i < active.length; i++) {
            const a = active[i];
            for (let j = i + 1; j < active.length; j++) {
                const b = active[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d2 = dx * dx + dy * dy;
                if (d2 <= 0.0001 || d2 >= minSpacingSq) continue;
                const dist = Math.sqrt(d2);
                const overlap = minSpacing - dist;
                const inv = 1 / dist;
                const push = Math.min(maxPush, overlap * 0.5);
                const px = dx * inv * push;
                const py = dy * inv * push;
                a.x -= px;
                a.y -= py;
                b.x += px;
                b.y += py;
            }
        }
    }

    findNearestWalkableWorld(worldX, worldY, radiusTiles = 2, reservedTiles = null, forbiddenTiles = null) {
        if (!this.pathGrid) return { x: worldX, y: worldY };
        const t = this.pathGrid.worldToTile(worldX, worldY);
        const currentKey = `${t.x},${t.y}`;
        if (
            this.pathGrid.isWalkable(t.x, t.y) &&
            (!reservedTiles || !reservedTiles.has(currentKey)) &&
            (!forbiddenTiles || !forbiddenTiles.has(currentKey))
        ) {
            if (reservedTiles) reservedTiles.add(currentKey);
            return this.pathGrid.tileToWorld(t.x, t.y);
        }
        let best = null;
        let bestDist = Infinity;
        for (let r = 1; r <= radiusTiles; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = t.x + dx;
                    const ny = t.y + dy;
                    if (!this.pathGrid.isWalkable(nx, ny)) continue;
                    const key = `${nx},${ny}`;
                    if (reservedTiles && reservedTiles.has(key)) continue;
                    if (forbiddenTiles && forbiddenTiles.has(key)) continue;
                    const candidate = this.pathGrid.tileToWorld(nx, ny);
                    const cdx = candidate.x - worldX;
                    const cdy = candidate.y - worldY;
                    const d2 = cdx * cdx + cdy * cdy;
                    if (d2 < bestDist) {
                        best = { world: candidate, key };
                        bestDist = d2;
                    }
                }
            }
            if (best) break;
        }
        if (best) {
            if (reservedTiles) reservedTiles.add(best.key);
            return best.world;
        }
        return { x: worldX, y: worldY };
    }

    requestDoorSync(doorGroup, side) {
        this.doorSync = { doorGroup, side };
    }

    clearDoorSync() {
        this.doorSync = null;
    }

    isDoorSyncReady(doorGroup, side) {
        if (this.getDoorSide(this.leader.x, this.leader.y, doorGroup) !== side) return false;
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            if (this.getDoorSide(follower.sprite.x, follower.sprite.y, doorGroup) !== side) return false;
        }
        return true;
    }

    getDoorSide(worldX, worldY, doorGroup) {
        const center = this.getDoorCenter(doorGroup);
        if (this.isDoorVertical(doorGroup)) {
            return worldX < center.x ? -1 : 1;
        }
        return worldY < center.y ? -1 : 1;
    }

    isDoorVertical(doorGroup) {
        if (!doorGroup || !doorGroup.doors || doorGroup.doors.length < 2) return true;
        return doorGroup.doors[0].tileX === doorGroup.doors[1].tileX;
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

    getAllMarines() {
        const aliveFollowers = this.followers
            .map((f) => f.sprite)
            .filter((sprite) => sprite && sprite.active && sprite.alive !== false);
        return [this.leader, ...aliveFollowers];
    }

    getFollowerByRole(roleKey) {
        const found = this.followers.find((f) => f.sprite && f.sprite.roleKey === roleKey);
        if (!found) return null;
        const sprite = found.sprite;
        if (!sprite.active || sprite.alive === false) return null;
        return sprite;
    }

    assignRoleTask(roleKey, targetTile) {
        const sprite = this.getFollowerByRole(roleKey);
        if (!sprite || !this.pathGrid || !this.scene.pathPlanner) return false;
        const start = this.pathGrid.worldToTile(sprite.x, sprite.y);
        const path = this.scene.pathPlanner.findPath(start.x, start.y, targetTile.x, targetTile.y, this.pathGrid);
        if (!path || path.length === 0) return false;
        const worldPath = path.map((p) => this.pathGrid.tileToWorld(p.x, p.y));
        this.roleTasks.set(roleKey, {
            roleKey,
            worldPath,
            index: 0,
            targetTile: { x: targetTile.x, y: targetTile.y },
            done: false,
            released: false,
        });
        return true;
    }

    clearRoleTask(roleKey) {
        this.roleTasks.delete(roleKey);
    }

    isRoleTaskActive(roleKey) {
        const task = this.roleTasks.get(roleKey);
        return (!!task && task.released !== true) || this.externalHoldRoles.has(roleKey);
    }

    isRoleTaskComplete(roleKey) {
        const task = this.roleTasks.get(roleKey);
        return !!task && task.done === true;
    }

    setExternalHoldRole(roleKey, enabled) {
        if (!roleKey) return;
        if (enabled) {
            this.externalHoldRoles.add(roleKey);
            return;
        }
        this.externalHoldRoles.delete(roleKey);
    }

    updateRoleTasks(delta) {
        for (const [roleKey, task] of this.roleTasks.entries()) {
            if (!task || task.done) continue;
            const sprite = this.getFollowerByRole(roleKey);
            if (!sprite) {
                this.roleTasks.delete(roleKey);
                continue;
            }
            const idx = Phaser.Math.Clamp(task.index, 0, Math.max(0, task.worldPath.length - 1));
            const node = task.worldPath[idx];
            const speed = this.formupSpeed;
            sprite.moveTowardRigid(node.x, node.y, delta, speed);
            const dx = node.x - sprite.x;
            const dy = node.y - sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1.2) {
                sprite.setDesiredRotation(Math.atan2(dy, dx));
            }
            if (dist <= 3.0) {
                if (task.index >= task.worldPath.length - 1) {
                    task.done = true;
                } else {
                    task.index += 1;
                }
            }
        }
    }

    applyBehaviorPreset(name) {
        const preset = BEHAVIOR_PRESETS[name];
        if (!preset) return false;
        const followLerp = this.runtimeTuning.followLerp || preset.followLerp;
        const followerTurnMul = this.runtimeTuning.followerTurnMultiplier || 1;
        this.currentPreset = name;
        const targetTeamSpeed = this.leader.moveSpeed
            || (this.runtimeTuning.snakeBaseSpeed || DEFAULT_SNAKE_BASE_SPEED) * TEAM_SPEED_SCALE;
        // Leader remains roughly 10% faster than followers.
        this.snakeBaseSpeed = targetTeamSpeed / 1.1;
        this.formupSpeed = targetTeamSpeed / 1.1;
        this.snakeCatchupGain = this.runtimeTuning.snakeCatchupGain || DEFAULT_SNAKE_CATCHUP_GAIN;
        this.snakeStaggerMs = this.runtimeTuning.snakeStaggerMs || DEFAULT_SNAKE_STAGGER_MS;
        this.snakeStaggerMinMs = Number(this.runtimeTuning.snakeStaggerMinMs) || 500;
        this.snakeStaggerMaxMs = Number(this.runtimeTuning.snakeStaggerMaxMs) || 1000;
        this.minSpacing = this.runtimeTuning.minSpacing || DEFAULT_MIN_SPACING;
        this.snakeStep = preset.snakeStep;
        this.rebuildSnakeStaggerProfile();
        this.leader.turnSpeedRadPerSec = preset.leaderTurn;
        const followerTurnSpeed = Math.min(6.2, preset.followerTurn * followerTurnMul);
        for (const follower of this.followers) {
            follower.sprite.turnSpeedRadPerSec = followerTurnSpeed;
            follower.sprite.setFollowLerp(followLerp);
            follower.sprite.setPatrolProfile(preset.patrolSpeed, preset.patrolAmplitude);
        }
        return true;
    }

    setRuntimeTuning(tuning) {
        this.runtimeTuning = tuning || {};
        this.applyBehaviorPreset(this.currentPreset);
    }

    cycleBehaviorPreset() {
        const idx = PRESET_ORDER.indexOf(this.currentPreset);
        const next = PRESET_ORDER[(idx + 1 + PRESET_ORDER.length) % PRESET_ORDER.length];
        this.applyBehaviorPreset(next);
        return this.currentPreset;
    }
}
