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
    { role: 'heavy', nx: -0.55, ny: -1.05 },
    { role: 'tech',  nx: -0.55, ny:  1.05 },
    { role: 'medic', nx: -1.85, ny:  0.0  },
];
export const ROLE_SCAN_SECTOR = Object.freeze({
    heavy: Math.PI,         // West
    tech: 0,               // East
    medic: -Math.PI * 0.5, // North
});
const ROLE_SCAN_PHASE = Object.freeze({
    heavy: 0.0,
    tech: Math.PI,
    medic: Math.PI * 0.5,
});
const DEFAULT_SNAKE_BASE_SPEED = 180;
const DEFAULT_FORMUP_SPEED = 140;
const DEFAULT_SNAKE_CATCHUP_GAIN = 1.8;
const DEFAULT_SNAKE_STAGGER_MS = 250;
const DEFAULT_MIN_SPACING = 36;
const TEAM_SPEED_SCALE = 1.0;
const IDLE_FORMUP_PROXIMITY_TILES = 2;
const STOP_CATCHUP_SPACING_MULTIPLIERS = [1.0, 1.08, 1.16];
const FOLLOWER_STUCK_CHECK_MS = 180;
const FOLLOWER_STUCK_MIN_MOVE = 3.0;
const FOLLOWER_STUCK_DIST_MIN = CONFIG.TILE_SIZE * 0.95;
const FOLLOWER_STUCK_TRIGGER_MS = 800;
const FOLLOWER_REJOIN_STUCK_TRIGGER_MS = 1400;
const FOLLOWER_UNSTUCK_COOLDOWN_MS = 500;
const FOLLOWER_DETOUR_DURATION_MS = 760;
const FOLLOWER_FLANK_DETOUR_DURATION_MS = 1120;
const FOLLOWER_REJOIN_DETOUR_DURATION_MS = 1460;
const FOLLOWER_FAR_FLANK_TRIGGER_TILES = 4;
const FOLLOWER_DOOR_BYPASS_RADIUS = CONFIG.TILE_SIZE * 1.85;
const FOLLOWER_DOOR_CHOKE_RADIUS = CONFIG.TILE_SIZE * 1.55;
const FOLLOWER_AVOID_TILE_MEMORY_MS = 4000;
const FOLLOWER_AVOID_TILE_PENALTY = 520;
const FOLLOWER_AVOID_NEIGHBOR_PENALTY = 140;
const FOLLOWER_PLAN_COOLDOWN_MS = 320;
const FOLLOWER_MIN_PARTNER_SPACING_PENALTY = 1800;
const DOOR_RELEASE_RECOVERY_MS = 900;
const COVERAGE_REPLAN_MIN_MS = 1600;
const COVERAGE_REPLAN_MAX_MS = 3200;

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
        this.snakeStaggerMinMs = 250;
        this.snakeStaggerMaxMs = 250;
        this.idleFormationReady = false;
        this.snakeFollowStartAt = 0;
        this.postDoorRecoveryUntil = 0;
        this.trailDirX = 1;
        this.trailDirY = 0;
        this.idleCoveragePlan = new Map();
        this.nextIdleCoverageReplanAt = 0;
        this.targetReservations = new Set();
        this.temporalReservations = new Map();
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
            const start = this.findNearestWalkableWorld(this.leader.x + slot.x, this.leader.y + slot.y, 4);
            const startX = start.x;
            const startY = start.y;
            const follower = new MarineFollower(this.scene, startX, startY, slot.role);
            follower.setDesiredRotation(this.leader.facingAngle ?? this.leader.rotation);
            this.followers.push({
                sprite: follower,
                slot,
                index: i,
                nav: {
                    lastSampleAt: 0,
                    lastSampleX: startX,
                    lastSampleY: startY,
                    stuckMs: 0,
                    warpAccumMs: 0,
                    lastUnstuckAt: -10000,
                    detourUntil: 0,
                    detourX: startX,
                    detourY: startY,
                    detourMode: null,
                    nextDoorBypassAt: 0,
                    nextDiagAt: 0,
                    stepUntil: 0,
                    stepX: startX,
                    stepY: startY,
                    nextPathAt: 0,
                    avoidTiles: new Map(),
                    nextRecoverPlanAt: 0,
                },
            });
        }
    }

    update(delta, time, context = {}) {
        this.pruneStaleRoleLocks();
        this.beginReservationFrame();
        this.updateTrailDirection();
        this.leaderForwardX = this.trailDirX;
        this.leaderForwardY = this.trailDirY;
        this.sampleLeaderHistory(delta);
        this.updateRoleTasks(delta, time);
        const leaderMoving = this.isLeaderMoving();
        const leaderRepositioning = leaderMoving && this.isLeaderBeyondNearestMarine(2);
        const readyForIdleFormation = !leaderMoving && this.isSquadWithinLeaderProximity(IDLE_FORMUP_PROXIMITY_TILES);
        let crampedIdleZone = false;
        if (!leaderMoving && this.pathGrid) {
            const lt = this.pathGrid.worldToTile(this.leader.x, this.leader.y);
            crampedIdleZone = this.getWalkableNeighborCount(lt.x, lt.y) <= 2;
        }
        const shouldSnakeFollow = leaderRepositioning || (!leaderMoving && (!readyForIdleFormation || crampedIdleZone));

        if (!leaderRepositioning && this.leaderWasMoving && readyForIdleFormation) {
            this.captureIdleFormationTargets();
            this.idleFormationReady = true;
        }
        if (leaderRepositioning && !this.leaderWasMoving) {
            this.idleFormationTargets.clear();
            this.idleFormationReady = false;
            this.rebuildSnakeStaggerProfile();
            this.snakeFollowStartAt = time;
        }
        if (!leaderMoving && readyForIdleFormation && (!this.idleFormationReady || this.shouldRefreshIdleTargets())) {
            this.captureIdleFormationTargets();
            this.idleFormationReady = true;
        }
        if (!leaderMoving && !readyForIdleFormation) {
            this.idleFormationReady = false;
        }

        if (this.doorSync) {
            this.updateDoorSync(delta, time);
        } else if (shouldSnakeFollow) {
            this.updateSnakeFollow(delta, time, leaderMoving);
        } else {
            this.updateDiamondForm(delta, time);
        }
        this.applyFollowerSeparation(delta, time);

        const threat = context && context.threat ? context.threat : null;
        const coveragePlan = !threat ? this.getIdleCoveragePlan(time) : null;
        const assignedAngles = [];
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
            } else {
                const role = follower.sprite.roleKey || 'medic';
                const leaderFacing = this.leader.facingAngle ?? this.leader.rotation ?? 0;
                const roleOffset = ROLE_SCAN_SECTOR[role] ?? 0;
                const center = coveragePlan?.get(role) ?? (leaderFacing + roleOffset);
                const phase = ROLE_SCAN_PHASE[role] ?? 0;
                // Layered sweep: primary slow arc + secondary faster micro-glance for naturalism
                const sweep = Math.sin(time * 0.0025 + phase + follower.sprite.patrolPhase) * 0.95
                    + Math.sin(time * 0.0067 + phase * 1.7 + follower.sprite.patrolPhase * 2.3) * 0.18;
                targetAngle = center + sweep;
                // Deflect away from walls so torch doesn't stare at a surface
                targetAngle = this.deflectFromWall(follower.sprite.x, follower.sprite.y, targetAngle);
                for (const prev of assignedAngles) {
                    const diff = Phaser.Math.Angle.Wrap(targetAngle - prev);
                    if (Math.abs(diff) < 0.52) {
                        targetAngle = Phaser.Math.Angle.Wrap(targetAngle + (diff >= 0 ? 1 : -1) * 0.58);
                    }
                }
                patrol = true;
            }
            assignedAngles.push(targetAngle);
            follower.sprite.setDesiredRotation(targetAngle);
            follower.sprite.updateRotation(delta, time, { patrol });
        }
        this.leaderWasMoving = leaderRepositioning;
    }

    pruneStaleRoleLocks() {
        if (this.roleTasks instanceof Map) {
            for (const [roleKey, task] of this.roleTasks.entries()) {
                const sprite = this.getFollowerByRole(roleKey);
                if (!sprite || task?.released === true) this.roleTasks.delete(roleKey);
            }
        }
        if (this.externalHoldRoles instanceof Set) {
            for (const roleKey of [...this.externalHoldRoles]) {
                const sprite = this.getFollowerByRole(roleKey);
                if (!sprite) this.externalHoldRoles.delete(roleKey);
            }
        }
    }

    updateTrailDirection() {
        const vx = Number(this.leader?.body?.velocity?.x) || 0;
        const vy = Number(this.leader?.body?.velocity?.y) || 0;
        let dx = vx;
        let dy = vy;
        if (Math.hypot(dx, dy) < 8 && this.leader?.currentPath && this.leader.pathIndex < this.leader.currentPath.length) {
            const target = this.leader.currentPath[this.leader.pathIndex];
            if (target) {
                dx = target.x - this.leader.x;
                dy = target.y - this.leader.y;
            }
        }
        const len = Math.hypot(dx, dy);
        if (len >= 8) {
            this.trailDirX = dx / len;
            this.trailDirY = dy / len;
        }
    }

    isLeaderBeyondNearestMarine(maxTiles = 2) {
        const maxDist = Math.max(1, maxTiles) * CONFIG.TILE_SIZE;
        let nearest = Infinity;
        for (const follower of this.followers) {
            const s = follower?.sprite;
            if (!s || !s.active || s.alive === false || this.isRoleTaskActive(s.roleKey)) continue;
            const d = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, s.x, s.y);
            if (d < nearest) nearest = d;
        }
        if (!Number.isFinite(nearest)) return false;
        return nearest > maxDist;
    }

    getIdleCoveragePlan(time = this.scene?.time?.now || 0) {
        if (!(this.idleCoveragePlan instanceof Map)) this.idleCoveragePlan = new Map();
        const coveragePlan = this.idleCoveragePlan;
        const followers = this.followers
            .map((f) => f?.sprite)
            .filter((s) => s && s.active && s.alive !== false && !this.isRoleTaskActive(s.roleKey));
        if (followers.length <= 0) return null;
        if (time < (this.nextIdleCoverageReplanAt || 0) && coveragePlan.size > 0) {
            return coveragePlan;
        }
        const shouldReplan = coveragePlan.size <= 0 || Math.random() < 0.74;
        this.nextIdleCoverageReplanAt = time + Phaser.Math.Between(COVERAGE_REPLAN_MIN_MS, COVERAGE_REPLAN_MAX_MS);
        if (!shouldReplan) return coveragePlan;

        const candidates = [];
        for (let i = 0; i < 12; i++) candidates.push(-Math.PI + (Math.PI * 2 * i / 12));
        const used = [];
        const byPriority = [...followers].sort((a, b) => {
            const pa = a.roleKey === 'heavy' ? 0 : (a.roleKey === 'tech' ? 1 : 2);
            const pb = b.roleKey === 'heavy' ? 0 : (b.roleKey === 'tech' ? 1 : 2);
            return pa - pb;
        });
        const nextPlan = new Map();
        for (const sprite of byPriority) {
            const role = sprite.roleKey || 'medic';
            const preferred = ROLE_SCAN_SECTOR[role] ?? 0;
            let bestAngle = preferred;
            let bestScore = -Infinity;
            for (const a of candidates) {
                let sep = 0;
                for (const u of used) {
                    const d = Math.abs(Phaser.Math.Angle.Wrap(a - u));
                    sep = Math.max(sep, d);
                }
                const prefFit = 1 - Math.abs(Phaser.Math.Angle.Wrap(a - preferred)) / Math.PI;
                // Graduated wall penalty: close wall = heavy penalty, distant wall = mild
                const wallScore = this.estimateDirectionWallScore(sprite.x, sprite.y, a);
                const wallPenalty = -wallScore * 1.8;
                const score = sep * 2.4 + prefFit * 0.7 + wallPenalty + Math.random() * 0.08;
                if (score > bestScore) {
                    bestScore = score;
                    bestAngle = a;
                }
            }
            used.push(bestAngle);
            nextPlan.set(role, bestAngle);
        }
        this.idleCoveragePlan = nextPlan;
        return this.idleCoveragePlan;
    }

    /**
     * Returns a 0-1 "wall closeness" score for a facing direction.
     * 0 = clear corridor ahead, 1 = wall immediately adjacent.
     * Checks multiple distances so followers strongly avoid staring at close walls.
     */
    estimateDirectionWallScore(worldX, worldY, angle) {
        if (!this.pathGrid) return 0;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const tile = CONFIG.TILE_SIZE;
        // Check 3 distances: very close (0.8 tile), medium (1.5 tiles), far (2.5 tiles)
        const probes = [
            { dist: tile * 0.8, weight: 1.0 },
            { dist: tile * 1.5, weight: 0.5 },
            { dist: tile * 2.5, weight: 0.2 },
        ];
        let score = 0;
        for (const p of probes) {
            const tx = worldX + cosA * p.dist;
            const ty = worldY + sinA * p.dist;
            const t = this.pathGrid.worldToTile(tx, ty);
            if (!this.isTileWalkableWithProps(t.x, t.y)) score += p.weight;
        }
        return Math.min(1, score);
    }

    /** Legacy compat — returns true if immediate direction is blocked. */
    estimateDirectionBlocked(worldX, worldY, angle) {
        return this.estimateDirectionWallScore(worldX, worldY, angle) >= 0.5;
    }

    /**
     * Find the nearest open direction if the current angle faces a wall.
     * Searches alternating offsets (±15°, ±30°, ...) up to ±90°.
     * Returns the original angle if no wall is nearby.
     */
    deflectFromWall(worldX, worldY, angle) {
        if (this.estimateDirectionWallScore(worldX, worldY, angle) < 0.45) return angle;
        for (let step = 1; step <= 6; step++) {
            const offset = step * 0.26; // ~15° increments
            const ccw = Phaser.Math.Angle.Wrap(angle + offset);
            if (this.estimateDirectionWallScore(worldX, worldY, ccw) < 0.45) return ccw;
            const cw = Phaser.Math.Angle.Wrap(angle - offset);
            if (this.estimateDirectionWallScore(worldX, worldY, cw) < 0.45) return cw;
        }
        return angle;
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

    updateSnakeFollow(delta, time, leaderMoving = true) {
        const inDoorRecovery = time <= this.postDoorRecoveryUntil;
        if (inDoorRecovery) {
            this.updateSnakeQueueCatchup(delta, time);
            return;
        }
        if (!leaderMoving) {
            this.updateSnakeQueueCatchup(delta, time);
            return;
        }
        if (this.history.length === 0) {
            this.updateSnakeQueueCatchup(delta, time);
            return;
        }
        const base = this.snakeBaseSpeed;
        const minSpacing = Math.max(10, this.minSpacing);
        const catchupGain = Math.max(0, this.snakeCatchupGain || 0);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
                const departDelayMs = Math.max(0, Number(follower.staggerDelayMs) || ((follower.index + 1) * this.snakeStaggerMs));
                if ((time - (this.snakeFollowStartAt || 0)) < departDelayMs) {
                    const settleTarget = this.getQueueTargetWorld(follower.index, minSpacing * 0.95);
                    const settleSlot = this.claimFollowerTarget(settleTarget.x, settleTarget.y, 2, follower);
                    const moveTarget = this.getFollowerMoveTarget(follower, settleSlot.x, settleSlot.y, time);
                    const sdx = moveTarget.x - follower.sprite.x;
                    const sdy = moveTarget.y - follower.sprite.y;
                    const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
                    this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, base * 0.48, time);
                    if (sdist > 2) follower.sprite.setDesiredRotation(Math.atan2(sdy, sdx));
                    continue;
                }
            const delayMs = Math.max(0, Number(follower.staggerDelayMs) || ((follower.index + 1) * this.snakeStaggerMs));
            const target = this.getHistoryPointAtDelay(time, delayMs);
            let targetX = target.x;
            let targetY = target.y;
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 2);
                targetX = snap.x;
                targetY = snap.y;
            }
            const slotTarget = this.claimFollowerTarget(targetX, targetY, 2, follower);
            const moveTarget = this.getFollowerMoveTarget(follower, slotTarget.x, slotTarget.y, time);

            const dx = moveTarget.x - follower.sprite.x;
            const dy = moveTarget.y - follower.sprite.y;
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
            let speed = base * speedFloor + catchupBoost;
            // Boost follower speed during leader sprint
            if (this.scene?._sprintActive) speed *= (this.scene._sprintSpeedMul || 1.5);
            this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, speed, time);
            if (dist > 2) follower.sprite.setDesiredRotation(Math.atan2(dy, dx));
        }
    }

    updateSnakeQueueCatchup(delta, time = this.scene?.time?.now || 0) {
        const base = Math.max(80, this.snakeBaseSpeed);
        const minSpacing = Math.max(10, this.minSpacing);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            const spacingMul = STOP_CATCHUP_SPACING_MULTIPLIERS[follower.index] || 1;
            const spacing = minSpacing * spacingMul;
            const rawTarget = this.getQueueTargetWorld(follower.index, spacing);
            const target = this.pathGrid ? this.findNearestWalkableWorld(rawTarget.x, rawTarget.y, 2) : rawTarget;
            const slotTarget = this.claimFollowerTarget(target.x, target.y, 2, follower);
            const moveTarget = this.getFollowerMoveTarget(follower, slotTarget.x, slotTarget.y, time);
            const dx = moveTarget.x - follower.sprite.x;
            const dy = moveTarget.y - follower.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const catchupBoost = Phaser.Math.Clamp(dist / (spacing * 2.5), 0, 1) * base * 0.28;
            let speed = base * 0.72 + catchupBoost;
            // Boost follower speed during leader sprint
            if (this.scene?._sprintActive) speed *= (this.scene._sprintSpeedMul || 1.5);
            this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, speed, time);
            if (dist > 2) follower.sprite.setDesiredRotation(Math.atan2(dy, dx));
        }
    }

    getQueueTargetWorld(index, spacingPx) {
        let anchor = this.leader;
        if (index > 0) {
            const prev = this.followers[index - 1]?.sprite;
            if (prev && prev.alive !== false && prev.active) anchor = prev;
        }
        return {
            x: anchor.x - this.leaderForwardX * spacingPx,
            y: anchor.y - this.leaderForwardY * spacingPx,
        };
    }

    getHistoryPointAtDelay(now, delayMs) {
        const targetTime = now - delayMs;
        // Search newest→oldest for the first point at or before targetTime.
        for (let i = this.history.length - 1; i >= 0; i--) {
            const h = this.history[i];
            if (h.time <= targetTime) return h;
        }
        // No point old enough — leader just started moving. Use the oldest available
        // position (history[0]) as the furthest-back approximation we have.
        return this.history[0] || this.history[this.history.length - 1];
    }

    rebuildSnakeStaggerProfile() {
        const minMs = Math.max(100, Number(this.snakeStaggerMinMs) || 500);
        const maxMs = Math.max(minMs, Number(this.snakeStaggerMaxMs) || 1000);
        const count = Math.max(1, this.followers.length);
        let cumulative = 0;
        for (const follower of this.followers) {
            const t = (follower.index + 1) / (count + 1);
            const planned = Phaser.Math.Linear(minMs, maxMs, t);
            const jitter = Phaser.Math.Between(-36, 36);
            const gapMs = Phaser.Math.Clamp(Math.round(planned + jitter), minMs, maxMs);
            cumulative += gapMs;
            follower.staggerGapMs = gapMs;
            follower.staggerDelayMs = cumulative;
        }
    }

    updateDiamondForm(delta, time) {
        const base = this.formupSpeed;
        const facingAngle = this.leader.facingAngle ?? this.leader.rotation ?? 0;
        const cosA = Math.cos(facingAngle);
        const sinA = Math.sin(facingAngle);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            const lx = follower.slot.x;
            const ly = follower.slot.y;
            const target = this.idleFormationTargets.get(follower.index) || {
                x: this.leader.x + lx * cosA - ly * sinA,
                y: this.leader.y + lx * sinA + ly * cosA,
            };
            let targetX = target.x;
            let targetY = target.y;
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 2);
                targetX = snap.x;
                targetY = snap.y;
            }
            // Micro-patrol: subtle movement around slot position when idle
            if (!follower._microPatrolAt || time > follower._microPatrolAt) {
                follower._microPatrolAt = time + Phaser.Math.Between(2500, 4500);
                const jitter = CONFIG.TILE_SIZE * 0.4;
                follower._microPatrolX = Phaser.Math.FloatBetween(-jitter, jitter);
                follower._microPatrolY = Phaser.Math.FloatBetween(-jitter, jitter);
            }
            // Apply micro-patrol offset to target
            targetX += (follower._microPatrolX || 0);
            targetY += (follower._microPatrolY || 0);
            const slotTarget = this.claimFollowerTarget(targetX, targetY, 2, follower);
            const moveTarget = this.getFollowerMoveTarget(follower, slotTarget.x, slotTarget.y, time);
            this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, base, time);
        }
    }

    shouldRefreshIdleTargets() {
        if (!this.idleFormationAnchor) return true;
        const dx = this.leader.x - this.idleFormationAnchor.x;
        const dy = this.leader.y - this.idleFormationAnchor.y;
        if (dx * dx + dy * dy > 64) return true;
        const facingDelta = Math.abs(Phaser.Math.Angle.Wrap(
            (this.leader.facingAngle ?? this.leader.rotation ?? 0) - (this.idleFormationFacing ?? 0)
        ));
        if (facingDelta > 0.6) return true;
        return false;
    }

    isSquadWithinLeaderProximity(maxTiles = 2) {
        const maxDist = Math.max(1, maxTiles) * CONFIG.TILE_SIZE;
        const maxDistSq = maxDist * maxDist;
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            const dx = follower.sprite.x - this.leader.x;
            const dy = follower.sprite.y - this.leader.y;
            if ((dx * dx + dy * dy) > maxDistSq) return false;
        }
        return true;
    }

    captureIdleFormationTargets() {
        this.idleFormationTargets.clear();
        const facingAngle = this.leader.facingAngle ?? this.leader.rotation ?? 0;
        const cosA = Math.cos(facingAngle);
        const sinA = Math.sin(facingAngle);
        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            const lx = follower.slot.x;
            const ly = follower.slot.y;
            let targetX = this.leader.x + lx * cosA - ly * sinA;
            let targetY = this.leader.y + lx * sinA + ly * cosA;
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 4);
                targetX = snap.x;
                targetY = snap.y;
            }
            this.idleFormationTargets.set(follower.index, { x: targetX, y: targetY });
        }
        this.idleFormationAnchor = { x: this.leader.x, y: this.leader.y };
        this.idleFormationFacing = this.leader.facingAngle ?? this.leader.rotation ?? 0;
    }

    updateDoorSync(delta, time) {
        // Boost speed so followers clear the door area quickly
        const base = this.formupSpeed * 1.3;
        const { doorGroup, side } = this.doorSync;
        const center = this.getDoorCenter(doorGroup);
        const isVertical = this.isDoorVertical(doorGroup);
        // Push non-workers 1.25 tiles from door center and spread 44px apart so
        // they don't crowd the worker's path or block the door mouth.
        const clearDist = CONFIG.TILE_SIZE + 16;  // ~80px → snaps to tile beyond door
        const spreadDist = 44;                    // above minSpacing=36, below TILE_SIZE

        // Move Team Leader if movement is locked (implies lock action repositioning)
        if (this.scene.inputHandler && this.scene.inputHandler.movementLocked) {
            let targetX, targetY;
            if (isVertical) {
                targetX = center.x + side * clearDist;
                targetY = center.y - 40;
            } else {
                targetX = center.x - 40;
                targetY = center.y + side * clearDist;
            }
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 4);
                targetX = snap.x;
                targetY = snap.y;
            }
            this.leader.moveTowardRigid(targetX, targetY, delta, base);
        }

        for (const follower of this.followers) {
            if (!follower.sprite.alive || !follower.sprite.active) continue;
            if (this.isRoleTaskActive(follower.sprite.roleKey)) continue;
            let targetX = follower.sprite.x;
            let targetY = follower.sprite.y;
            if (isVertical) {
                targetX = center.x + side * clearDist;
                targetY = center.y + (follower.index - 1) * spreadDist;
            } else {
                targetX = center.x + (follower.index - 1) * spreadDist;
                targetY = center.y + side * clearDist;
            }
            if (this.pathGrid) {
                const snap = this.findNearestWalkableWorld(targetX, targetY, 4);
                targetX = snap.x;
                targetY = snap.y;
            }
            const slotTarget = this.claimFollowerTarget(targetX, targetY, 4, follower);
            const moveTarget = this.getFollowerMoveTarget(follower, slotTarget.x, slotTarget.y, time);
            this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, base, time);
        }
    }

    applyFollowerSeparation(delta, _time = this.scene?.time?.now || 0) {
        const dt = Math.max(0.001, delta / 1000);
        const minSpacing = Math.max(10, this.minSpacing);
        const minSpacingSq = minSpacing * minSpacing;
        const maxPush = minSpacing * 0.48 * dt * 9.5;
        const active = [];
        for (let i = 0; i < this.followers.length; i++) {
            const s = this.followers[i].sprite;
            if (s && s.active && s.alive !== false) active.push(s);
        }

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
                const tileAx = this.pathGrid ? this.pathGrid.worldToTile(a.x, a.y).x : 0;
                const tileAy = this.pathGrid ? this.pathGrid.worldToTile(a.x, a.y).y : 0;
                const tileBx = this.pathGrid ? this.pathGrid.worldToTile(b.x, b.y).x : 0;
                const tileBy = this.pathGrid ? this.pathGrid.worldToTile(b.x, b.y).y : 0;
                const roomA = this.getWalkableNeighborCount(tileAx, tileAy);
                const roomB = this.getWalkableNeighborCount(tileBx, tileBy);
                const corridorClamp = (roomA <= 2 || roomB <= 2) ? 0.72 : 1.0;
                const push = Math.min(maxPush * corridorClamp, overlap * 0.45);
                const px = dx * inv * push;
                const py = dy * inv * push;
                const nextAx = a.x - px;
                const nextAy = a.y - py;
                const nextBx = b.x + px;
                const nextBy = b.y + py;
                const canMoveA = this.isWalkableWorld(nextAx, nextAy);
                const canMoveB = this.isWalkableWorld(nextBx, nextBy);
                if (canMoveA && canMoveB) {
                    a.x = nextAx;
                    a.y = nextAy;
                    b.x = nextBx;
                    b.y = nextBy;
                } else if (canMoveA) {
                    a.x = nextAx;
                    a.y = nextAy;
                } else if (canMoveB) {
                    b.x = nextBx;
                    b.y = nextBy;
                }
            }
        }
        // Safety snap: only correct sprites that ended up in non-walkable tiles.
        // Skipping walkable sprites avoids undoing valid sub-pixel positions.
        for (const s of active) {
            if (!this.isWalkableWorld(s.x, s.y)) {
                const resolved = this.findNearestWalkableWorld(s.x, s.y, 2);
                s.x = resolved.x;
                s.y = resolved.y;
            }
        }
    }

    isWorldBlockedByProp(worldX, worldY, radius = 11) {
        const props = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        for (const prop of props) {
            if (prop?.blocksPath === false) continue;
            const s = prop?.sprite;
            if (!s || s.active === false) continue;
            const pr = Math.max(8, Number(prop?.radius) || 16);
            const d = Phaser.Math.Distance.Between(worldX, worldY, s.x, s.y);
            if (d <= (pr + radius)) return true;
        }
        return false;
    }

    isTileWalkableWithProps(tileX, tileY) {
        if (!this.pathGrid || !this.pathGrid.isWalkable(tileX, tileY)) return false;
        const world = this.pathGrid.tileToWorld(tileX, tileY);
        return !this.isWorldBlockedByProp(world.x, world.y, 11);
    }

    isWalkableWorld(worldX, worldY) {
        if (!this.pathGrid) return true;
        const edgePx = 10;
        const t = this.pathGrid.worldToTile(worldX, worldY);
        if (this.isTileWalkableWithProps(t.x, t.y)) return true;
        const doorAtTile = this.scene?.doorManager?.getDoorAtTile?.(t.x, t.y);
        if (doorAtTile && doorAtTile.isPassable !== true) return false;
        const tileSize = Number(CONFIG.TILE_SIZE) || 64;
        const localX = worldX - (t.x * tileSize);
        const localY = worldY - (t.y * tileSize);
        if (localX <= edgePx && this.isTileWalkableWithProps(t.x - 1, t.y)) return true;
        if (localX >= (tileSize - edgePx) && this.isTileWalkableWithProps(t.x + 1, t.y)) return true;
        if (localY <= edgePx && this.isTileWalkableWithProps(t.x, t.y - 1)) return true;
        if (localY >= (tileSize - edgePx) && this.isTileWalkableWithProps(t.x, t.y + 1)) return true;
        return false;
    }

    trackFollowerNavigation(follower, targetX, targetY, time = this.scene?.time?.now || 0) {
        if (!follower || !follower.sprite || !follower.nav) return;
        const sprite = follower.sprite;
        const nav = follower.nav;
        if (!sprite.active || sprite.alive === false) return;

        if (!Number.isFinite(nav.lastSampleAt) || nav.lastSampleAt <= 0) {
            nav.lastSampleAt = time;
            nav.lastSampleX = sprite.x;
            nav.lastSampleY = sprite.y;
            nav.stuckMs = 0;
            return;
        }

        const elapsed = Math.max(0, time - nav.lastSampleAt);
        if (elapsed < FOLLOWER_STUCK_CHECK_MS) return;
        const moved = Phaser.Math.Distance.Between(sprite.x, sprite.y, nav.lastSampleX, nav.lastSampleY);
        const distToTarget = Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY);
        let openness = 4;
        if (this.pathGrid) {
            const t = this.pathGrid.worldToTile(sprite.x, sprite.y);
            openness = this.getWalkableNeighborCount(t.x, t.y);
        }
        const corridorMul = openness <= 2 ? 0.62 : 1;
        const shouldBeMoving = distToTarget >= (FOLLOWER_STUCK_DIST_MIN * corridorMul);
        const barelyMoved = moved < (FOLLOWER_STUCK_MIN_MOVE * corridorMul);
        const blockedSegment = this.hasBlockedTileOnSegment(sprite.x, sprite.y, targetX, targetY);
        const closedDoorBlock = !!this.scene?.doorManager?.hasClosedDoorBetweenWorldPoints?.(
            sprite.x,
            sprite.y,
            targetX,
            targetY
        );

        const prevDistToTarget = Number.isFinite(nav._prevDistToTarget) ? nav._prevDistToTarget : distToTarget + 1;
        const progressPx = prevDistToTarget - distToTarget;
        nav._prevDistToTarget = distToTarget;

        if (shouldBeMoving && barelyMoved) {
            nav.stuckMs += elapsed;
            if (progressPx < 1.5) {
                nav.warpAccumMs = (nav.warpAccumMs || 0) + elapsed;
            }
        } else {
            nav.stuckMs = Math.max(0, nav.stuckMs - elapsed * 1.4);
            if (progressPx >= 1.5) nav.warpAccumMs = 0;
        }

        if (
            shouldBeMoving
            && (barelyMoved || blockedSegment || closedDoorBlock)
            && nav.stuckMs >= (FOLLOWER_STUCK_TRIGGER_MS * 0.45)
            && time >= (nav.nextDiagAt || 0)
        ) {
            this.emitNavDiagnostic('stall', follower, {
                targetX,
                targetY,
                moved,
                distToTarget,
                leaderDist: Phaser.Math.Distance.Between(sprite.x, sprite.y, this.leader.x, this.leader.y),
                openness,
                blockedSegment,
                closedDoorBlock,
                detourMode: nav.detourMode || null,
                stuckMs: nav.stuckMs,
            }, time);
            nav.nextDiagAt = time + 280;
        }

        nav.lastSampleAt = time;
        nav.lastSampleX = sprite.x;
        nav.lastSampleY = sprite.y;
        nav.nextDoorBypassAt = time + Phaser.Math.Between(180, 340);
        if (shouldBeMoving && (barelyMoved || blockedSegment || closedDoorBlock)) {
            const selfTile = this.pathGrid?.worldToTile(sprite.x, sprite.y);
            if (selfTile) this.markFollowerAvoidTile(nav, selfTile.x, selfTile.y, time, 1);
            const targetTile = this.pathGrid?.worldToTile(targetX, targetY);
            if (targetTile) this.markFollowerAvoidTile(nav, targetTile.x, targetTile.y, time, 0.6);
        }

        // Hard warp failsafe — if stuck for 3+ seconds and far from leader, teleport to safety
        // After 5+ seconds stuck, reduce distance threshold to catch near-leader stuck cases
        const warpAccum = nav.warpAccumMs || 0;
        if (warpAccum > 3000) {
            const leader = this.scene?.leader;
            if (leader && leader.active) {
                const warpLeaderDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, leader.x, leader.y);
                const distThreshold = warpAccum > 5000 ? CONFIG.TILE_SIZE * 2 : CONFIG.TILE_SIZE * 5;
                if (warpLeaderDist > distThreshold) {
                    const ltx = Math.floor(leader.x / CONFIG.TILE_SIZE);
                    const lty = Math.floor(leader.y / CONFIG.TILE_SIZE);
                    const grid = this.pathGrid || this.scene.pathGrid;
                    if (grid) {
                        let warped = false;
                        for (let r = 1; r <= 3 && !warped; r++) {
                            for (const [dx, dy] of [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]]) {
                                if (grid.isWalkable(ltx + dx, lty + dy)) {
                                    const wx = (ltx + dx) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5;
                                    const wy = (lty + dy) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5;
                                    sprite.body?.reset(wx, wy);
                                    sprite.x = wx;
                                    sprite.y = wy;
                                    nav.stuckMs = 0;
                                    nav.warpAccumMs = 0;
                                    nav.detourUntil = 0;
                                    nav.avoidTiles.clear();
                                    this.emitNavDiagnostic('hard_warp', follower, {
                                        targetX, targetY, leaderDist: warpLeaderDist,
                                        warpX: wx, warpY: wy,
                                    }, time);
                                    warped = true;
                                    break;
                                }
                            }
                        }
                        if (warped) return;
                    }
                }
            }
        }

        if (nav.stuckMs < FOLLOWER_STUCK_TRIGGER_MS) return;
        if (time < (nav.detourUntil || 0) && nav.detourMode) return;
        if (time < (nav.nextRecoverPlanAt || 0)) return;
        if ((time - (nav.lastUnstuckAt || -10000)) < FOLLOWER_UNSTUCK_COOLDOWN_MS) return;

        let snap = null;
        nav.detourMode = null;
        const leaderDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.leader.x, this.leader.y);
        const farFromLeader = leaderDist >= (FOLLOWER_FAR_FLANK_TRIGGER_TILES * CONFIG.TILE_SIZE);
        if (farFromLeader && nav.stuckMs >= FOLLOWER_REJOIN_STUCK_TRIGGER_MS) {
            const rejoin = this.getLeaderRejoinDetour(follower);
            if (rejoin) {
                snap = rejoin;
                nav.detourMode = 'rejoin';
                this.emitNavDiagnostic('rejoin_detour', follower, {
                    targetX,
                    targetY,
                    detourX: rejoin.x,
                    detourY: rejoin.y,
                    leaderDist,
                    stuckMs: nav.stuckMs,
                }, time);
            }
        }
        if (farFromLeader) {
            if (!snap) {
                const flankBypass = this.getFarLeaderFlankDetour(follower, targetX, targetY);
                if (flankBypass) {
                    snap = flankBypass;
                    nav.detourMode = 'flank';
                    this.emitNavDiagnostic('flank_detour', follower, {
                        targetX,
                        targetY,
                        detourX: flankBypass.x,
                        detourY: flankBypass.y,
                        leaderDist,
                    }, time);
                }
            }
        }
        if (!snap) {
            const doorBypass = this.getDoorBypassDetour(sprite, targetX, targetY);
            if (doorBypass) {
                snap = doorBypass;
                this.emitNavDiagnostic('door_detour', follower, {
                    targetX,
                    targetY,
                    detourX: doorBypass.x,
                    detourY: doorBypass.y,
                }, time);
            }
        }
        if (this.pathGrid && this.scene?.pathPlanner) {
            const start = this.pathGrid.worldToTile(sprite.x, sprite.y);
            const goal = this.pathGrid.worldToTile(targetX, targetY);
            const path = this.scene.pathPlanner.findPath(start.x, start.y, goal.x, goal.y, this.pathGrid);
            if (path && path.length > 0) {
                const stepIdx = Math.min(path.length - 1, 2);
                let bestStep = null;
                let bestScore = Infinity;
                for (let i = 0; i <= stepIdx; i++) {
                    const node = path[i];
                    const nodeWorld = this.pathGrid.tileToWorld(node.x, node.y);
                    const crowdPenalty = this.getFollowerCrowdPenalty(nodeWorld.x, nodeWorld.y, sprite);
                    const goalDist = Phaser.Math.Distance.Between(nodeWorld.x, nodeWorld.y, targetX, targetY);
                    const score = goalDist + crowdPenalty;
                    if (score < bestScore) {
                        bestScore = score;
                        bestStep = nodeWorld;
                    }
                }
                if (bestStep) {
                    snap = this.findNearestWalkableWorld(bestStep.x, bestStep.y, 3);
                }
            }
        }
        if (!snap) {
            const nearTarget = this.findNearestWalkableWorld(targetX, targetY, 6);
            const blendX = Phaser.Math.Linear(sprite.x, nearTarget.x, 0.58);
            const blendY = Phaser.Math.Linear(sprite.y, nearTarget.y, 0.58);
            snap = this.findBestDetourWorld(sprite, blendX, blendY, 4);
            this.emitNavDiagnostic('general_detour', follower, {
                targetX,
                targetY,
                detourX: snap.x,
                detourY: snap.y,
            }, time);
        }
        nav.detourUntil = time + (
            nav.detourMode === 'rejoin'
                ? FOLLOWER_REJOIN_DETOUR_DURATION_MS
                : (nav.detourMode === 'flank' ? FOLLOWER_FLANK_DETOUR_DURATION_MS : FOLLOWER_DETOUR_DURATION_MS)
        );
        nav.nextRecoverPlanAt = time + FOLLOWER_PLAN_COOLDOWN_MS;
        nav.detourX = snap.x;
        nav.detourY = snap.y;
        if (distToTarget > 2) sprite.setDesiredRotation(Math.atan2(targetY - sprite.y, targetX - sprite.x));

        nav.stuckMs = 0;
        nav.lastUnstuckAt = time;
        nav.lastSampleAt = time;
        nav.lastSampleX = sprite.x;
        nav.lastSampleY = sprite.y;
    }

    emitNavDiagnostic(type, follower, details = {}, time = this.scene?.time?.now || 0) {
        if (!this.scene || typeof this.scene.reportFollowerNavDiagnostic !== 'function') return;
        const sprite = follower?.sprite || null;
        this.scene.reportFollowerNavDiagnostic({
            type,
            time,
            role: sprite?.roleKey || 'unknown',
            x: Number(sprite?.x) || 0,
            y: Number(sprite?.y) || 0,
            ...details,
        });
    }

    getDoorBypassDetour(sprite, targetX, targetY) {
        const pathGrid = this.pathGrid;
        const mgr = this.scene?.doorManager;
        if (!sprite || !pathGrid || !mgr?.doorGroups) return null;
        let bestGroup = null;
        let bestDist = Infinity;
        for (const group of mgr.doorGroups) {
            if (!group || group.isPassable) continue;
            const center = this.getDoorCenter(group);
            const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, center.x, center.y);
            if (d < bestDist) {
                bestDist = d;
                bestGroup = group;
            }
        }
        if (!bestGroup || bestDist > FOLLOWER_DOOR_BYPASS_RADIUS) return null;
        const center = this.getDoorCenter(bestGroup);
        const toDoor = Phaser.Math.Angle.Between(sprite.x, sprite.y, center.x, center.y);
        const toTarget = Phaser.Math.Angle.Between(sprite.x, sprite.y, targetX, targetY);
        const sideSeed = (sprite.patrolPhase || 0) >= Math.PI ? 1 : -1;
        const baseAngle = toDoor;
        const angles = [
            baseAngle + Math.PI * 0.5,
            baseAngle - Math.PI * 0.5,
            baseAngle + Math.PI * 0.25,
            baseAngle - Math.PI * 0.25,
            baseAngle + Math.PI * 0.75,
            baseAngle - Math.PI * 0.75,
            baseAngle + Math.PI,
            baseAngle,
        ];
        const radii = [CONFIG.TILE_SIZE * 1.05, CONFIG.TILE_SIZE * 2.1];
        for (const a of angles) {
            for (const r of radii) {
            const candX = sprite.x + Math.cos(a) * r;
            const candY = sprite.y + Math.sin(a) * r;
            const snap = this.findBestDetourWorld(sprite, candX, candY, 2);
            if (!snap) continue;
            const tile = pathGrid.worldToTile(snap.x, snap.y);
            if (!this.isTileWalkableWithProps(tile.x, tile.y)) continue;
            const crowd = this.getFollowerCrowdPenalty(snap.x, snap.y, sprite);
            if (crowd > (this.minSpacing * 140)) continue;
            return snap;
            }
        }
        return null;
    }

    getFarLeaderFlankDetour(follower, targetX, targetY) {
        const sprite = follower?.sprite;
        if (!sprite || !this.pathGrid || !this.leader) return null;
        const leaderDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.leader.x, this.leader.y);
        if (leaderDist < (FOLLOWER_FAR_FLANK_TRIGGER_TILES * CONFIG.TILE_SIZE)) return null;

        const toLeader = Phaser.Math.Angle.Between(sprite.x, sprite.y, this.leader.x, this.leader.y);
        const sideSeed = ((Number(follower?.index) || 0) % 2 === 0) ? 1 : -1;
        const angles = [
            toLeader + Math.PI * 0.5 * sideSeed,
            toLeader - Math.PI * 0.5 * sideSeed,
            toLeader + Math.PI * 0.78 * sideSeed,
            toLeader - Math.PI * 0.78 * sideSeed,
            toLeader + Math.PI * 0.34 * sideSeed,
            toLeader - Math.PI * 0.34 * sideSeed,
        ];
        const radii = [
            CONFIG.TILE_SIZE * 1.15,
            CONFIG.TILE_SIZE * 1.65,
            CONFIG.TILE_SIZE * 2.15,
            CONFIG.TILE_SIZE * 2.65,
        ];

        let best = null;
        let bestScore = Infinity;
        for (const a of angles) {
            for (const r of radii) {
                const cx = sprite.x + Math.cos(a) * r;
                const cy = sprite.y + Math.sin(a) * r;
                const snap = this.findBestDetourWorld(sprite, cx, cy, 2);
                if (!snap) continue;
                const tile = this.pathGrid.worldToTile(snap.x, snap.y);
                if (!this.isTileWalkableWithProps(tile.x, tile.y)) continue;

                const toLeaderDist = Phaser.Math.Distance.Between(snap.x, snap.y, this.leader.x, this.leader.y);
                const toTargetDist = Phaser.Math.Distance.Between(snap.x, snap.y, targetX, targetY);
                const crowdPenalty = this.getFollowerCrowdPenalty(snap.x, snap.y, sprite);
                const doorPenalty = this.getDoorChokePenalty(snap.x, snap.y, sprite);
                const openness = this.getWalkableNeighborCount(tile.x, tile.y);
                const opennessPenalty = openness <= 1 ? 180 : (openness <= 2 ? 70 : 0);
                const blockedToLeaderPenalty = this.hasBlockedTileOnSegment(snap.x, snap.y, this.leader.x, this.leader.y) ? 85 : 0;
                const progressBonus = Math.max(0, leaderDist - toLeaderDist) * 24;
                const score = toLeaderDist * 1.15
                    + toTargetDist * 0.35
                    + crowdPenalty
                    + doorPenalty
                    + opennessPenalty
                    + blockedToLeaderPenalty
                    - progressBonus;
                if (score < bestScore) {
                    bestScore = score;
                    best = snap;
                }
            }
        }
        return best;
    }

    getLeaderRejoinDetour(follower) {
        const sprite = follower?.sprite;
        if (!sprite || !this.pathGrid || !this.scene?.pathPlanner) return null;
        const leaderTile = this.pathGrid.worldToTile(this.leader.x, this.leader.y);
        const start = this.pathGrid.worldToTile(sprite.x, sprite.y);
        const pathToLeader = this.scene.pathPlanner.findPath(start.x, start.y, leaderTile.x, leaderTile.y, this.pathGrid);
        if (pathToLeader && pathToLeader.length > 1) {
            const stepIdx = Math.min(pathToLeader.length - 1, 3);
            const node = pathToLeader[stepIdx];
            const world = this.pathGrid.tileToWorld(node.x, node.y);
            return this.findBestDetourWorld(sprite, world.x, world.y, 2);
        }
        const leaderForwardX = Number(this.leaderForwardX) || 1;
        const leaderForwardY = Number(this.leaderForwardY) || 0;
        const fallback = this.findBestDetourWorld(
            sprite,
            this.leader.x - leaderForwardX * CONFIG.TILE_SIZE * 1.45,
            this.leader.y - leaderForwardY * CONFIG.TILE_SIZE * 1.45,
            3
        );
        return fallback;
    }

    findNearestWalkableWorld(worldX, worldY, radiusTiles = 2) {
        if (!this.pathGrid) return { x: worldX, y: worldY };
        const t = this.pathGrid.worldToTile(worldX, worldY);
        if (this.isTileWalkableWithProps(t.x, t.y)) {
            return this.pathGrid.tileToWorld(t.x, t.y);
        }
        let best = null;
        let bestDist = Infinity;
        for (let r = 1; r <= radiusTiles; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = t.x + dx;
                    const ny = t.y + dy;
                    if (!this.isTileWalkableWithProps(nx, ny)) continue;
                    const candidate = this.pathGrid.tileToWorld(nx, ny);
                    const cdx = candidate.x - worldX;
                    const cdy = candidate.y - worldY;
                    const d2 = cdx * cdx + cdy * cdy;
                    if (d2 < bestDist) {
                        best = candidate;
                        bestDist = d2;
                    }
                }
            }
            if (best) break;
        }
        return best || { x: worldX, y: worldY };
    }

    beginReservationFrame() {
        this.targetReservations.clear();
        const now = this.scene?.time?.now || 0;
        for (const [key, rec] of this.temporalReservations.entries()) {
            if (!rec || !Number.isFinite(rec.until) || rec.until <= now) this.temporalReservations.delete(key);
        }
        if (!this.pathGrid) return;
        for (const follower of this.followers) {
            const s = follower?.sprite;
            if (!s || !s.active || s.alive === false) continue;
            const t = this.pathGrid.worldToTile(s.x, s.y);
            this.reserveTemporalTile(t.x, t.y, now + 140, follower.index);
        }
    }

    reserveTemporalTile(tileX, tileY, until, ownerIndex = -1) {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
        const key = `${tileX},${tileY}`;
        const prev = this.temporalReservations.get(key);
        if (!prev || (prev.until || 0) < until) {
            this.temporalReservations.set(key, { until, ownerIndex });
        }
    }

    isTileTemporallyReserved(tileX, tileY, selfFollower = null, now = this.scene?.time?.now || 0) {
        const key = `${tileX},${tileY}`;
        const rec = this.temporalReservations.get(key);
        if (!rec || !Number.isFinite(rec.until) || rec.until <= now) return false;
        const selfIndex = Number.isFinite(selfFollower?.index) ? selfFollower.index : -999;
        return rec.ownerIndex !== selfIndex;
    }

    getTemporalNeighborPenalty(tileX, tileY, selfFollower = null, now = this.scene?.time?.now || 0) {
        let penalty = 0;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;
                if (this.isTileTemporallyReserved(tileX + ox, tileY + oy, selfFollower, now)) {
                    penalty += 90;
                }
            }
        }
        return penalty;
    }

    getFollowerMoveTarget(follower, targetX, targetY, time) {
        const nav = follower?.nav;
        if (!nav || time > (nav.detourUntil || 0)) {
            if (nav) {
                nav.detourUntil = 0;
                nav.detourMode = null;
            }
            return this.resolvePathStepTarget(follower, targetX, targetY, time);
        }
        const detourDist = Phaser.Math.Distance.Between(
            follower.sprite.x,
            follower.sprite.y,
            nav.detourX || targetX,
            nav.detourY || targetY
        );
        const detourArrive = nav.detourMode === 'rejoin' ? 10 : 5;
        if (detourDist <= detourArrive) {
            nav.detourUntil = 0;
            nav.detourMode = null;
            return this.resolvePathStepTarget(follower, targetX, targetY, time);
        }
        return this.resolvePathStepTarget(follower, nav.detourX || targetX, nav.detourY || targetY, time);
    }

    resolvePathStepTarget(follower, targetX, targetY, time) {
        const nav = follower?.nav;
        const sprite = follower?.sprite;
        if (!nav || !sprite || !this.pathGrid || !this.scene?.pathPlanner) return { x: targetX, y: targetY };
        this.pruneFollowerAvoidTiles(nav, time);
        const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY);
        if (dist <= CONFIG.TILE_SIZE * 0.7) return { x: targetX, y: targetY };

        const hasClosedDoorBlock = !!this.scene?.doorManager?.hasClosedDoorBetweenWorldPoints?.(
            sprite.x,
            sprite.y,
            targetX,
            targetY
        );
        const hasTileBlock = this.hasBlockedTileOnSegment(sprite.x, sprite.y, targetX, targetY);
        const needsPathStep = hasClosedDoorBlock || hasTileBlock;

        if (!needsPathStep) {
            nav.stepUntil = 0;
            return { x: targetX, y: targetY };
        }

        if (time < (nav.stepUntil || 0) && Number.isFinite(nav.stepX) && Number.isFinite(nav.stepY)) {
            return { x: nav.stepX, y: nav.stepY };
        }
        if (time < (nav.nextPathAt || 0)) {
            if (Number.isFinite(nav.stepX) && Number.isFinite(nav.stepY)) return { x: nav.stepX, y: nav.stepY };
            return { x: targetX, y: targetY };
        }

        nav.nextPathAt = time + Phaser.Math.Between(130, 230);
        const start = this.pathGrid.worldToTile(sprite.x, sprite.y);
        const goal = this.pathGrid.worldToTile(targetX, targetY);
        const path = this.scene.pathPlanner.findPath(start.x, start.y, goal.x, goal.y, this.pathGrid);
        if (path && path.length > 0) {
            const maxIdx = Math.min(path.length - 1, 2);
            let bestNode = path[0];
            let bestScore = Infinity;
            for (let i = 0; i <= maxIdx; i++) {
                const node = path[i];
                const world = this.pathGrid.tileToWorld(node.x, node.y);
                const progress = Phaser.Math.Distance.Between(world.x, world.y, targetX, targetY);
                const crowdPenalty = this.getFollowerCrowdPenalty(world.x, world.y, sprite);
                const avoidPenalty = this.getFollowerAvoidPenalty(nav, node.x, node.y, time);
                const openness = this.getWalkableNeighborCount(node.x, node.y);
                const opennessPenalty = openness <= 1 ? 140 : (openness <= 2 ? 45 : 0);
                const score = progress + crowdPenalty + avoidPenalty + opennessPenalty;
                if (score < bestScore) {
                    bestScore = score;
                    bestNode = node;
                }
            }
            const world = this.pathGrid.tileToWorld(bestNode.x, bestNode.y);
            nav.stepX = world.x;
            nav.stepY = world.y;
            nav.stepUntil = time + Phaser.Math.Between(180, 340);
            return { x: world.x, y: world.y };
        }
        if (hasClosedDoorBlock) {
            const bypass = this.getDoorBypassDetour(sprite, targetX, targetY);
            if (bypass) {
                nav.detourUntil = time + FOLLOWER_DETOUR_DURATION_MS;
                nav.detourX = bypass.x;
                nav.detourY = bypass.y;
                nav.detourMode = null;
                nav.nextRecoverPlanAt = time + FOLLOWER_PLAN_COOLDOWN_MS;
                nav.stepUntil = 0;
                return { x: bypass.x, y: bypass.y };
            }
        }
        const flankBypass = this.getFarLeaderFlankDetour(follower, targetX, targetY);
        if (flankBypass) {
            nav.detourUntil = time + FOLLOWER_FLANK_DETOUR_DURATION_MS;
            nav.detourX = flankBypass.x;
            nav.detourY = flankBypass.y;
            nav.detourMode = 'flank';
            nav.nextRecoverPlanAt = time + FOLLOWER_PLAN_COOLDOWN_MS;
            nav.stepUntil = 0;
            return { x: flankBypass.x, y: flankBypass.y };
        }
        const leaderDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.leader.x, this.leader.y);
        if (leaderDist >= (FOLLOWER_FAR_FLANK_TRIGGER_TILES * CONFIG.TILE_SIZE)) {
            const rejoin = this.getLeaderRejoinDetour(follower);
            if (rejoin) {
                nav.detourUntil = time + FOLLOWER_REJOIN_DETOUR_DURATION_MS;
                nav.detourX = rejoin.x;
                nav.detourY = rejoin.y;
                nav.detourMode = 'rejoin';
                nav.nextRecoverPlanAt = time + FOLLOWER_PLAN_COOLDOWN_MS;
                nav.stepUntil = 0;
                return { x: rejoin.x, y: rejoin.y };
            }
        }
        nav.stepUntil = 0;
        return { x: targetX, y: targetY };
    }

    hasBlockedTileOnSegment(x1, y1, x2, y2) {
        if (!this.pathGrid) return false;
        const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
        if (dist < 4) return false;
        const steps = Math.max(2, Math.ceil(dist / (CONFIG.TILE_SIZE * 0.38)));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const sx = Phaser.Math.Linear(x1, x2, t);
            const sy = Phaser.Math.Linear(y1, y2, t);
            const tile = this.pathGrid.worldToTile(sx, sy);
            if (!this.isTileWalkableWithProps(tile.x, tile.y)) return true;
            if (this.isWorldBlockedByProp(sx, sy, 9)) return true;
        }
        return false;
    }

    moveFollowerToward(follower, targetX, targetY, delta, baseSpeed, time) {
        const sprite = follower?.sprite;
        if (!sprite) return;

        // Combat evasion: when FollowerCombatSystem signals an evade hint (alien within
        // ~1 tile), override the target to backstep away while still facing the threat.
        if (sprite._evadeHintUntil && time < sprite._evadeHintUntil && Number.isFinite(sprite._evadeHintAngle)) {
            const evadeDist = CONFIG.TILE_SIZE * 1.8;
            const evadeX = sprite.x + Math.cos(sprite._evadeHintAngle) * evadeDist;
            const evadeY = sprite.y + Math.sin(sprite._evadeHintAngle) * evadeDist;
            // Only evade into walkable space
            if (this.pathGrid) {
                const eTile = this.pathGrid.worldToTile(evadeX, evadeY);
                if (this.pathGrid.isWalkable(eTile.x, eTile.y)) {
                    targetX = evadeX;
                    targetY = evadeY;
                    baseSpeed *= 1.15; // slightly faster backstep
                }
            }
        }

        const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, targetX, targetY);
        const slowRadius = Math.max(CONFIG.TILE_SIZE * 0.8, this.minSpacing * 0.72);
        const arrival = Phaser.Math.Clamp(dist / slowRadius, 0.42, 1);
        const leaderDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.leader.x, this.leader.y);
        const farFromLeader = leaderDist >= (FOLLOWER_FAR_FLANK_TRIGGER_TILES * CONFIG.TILE_SIZE);
        const mode = follower?.nav?.detourMode || null;
        const flankBoost = (mode === 'flank' && farFromLeader) ? 1.18 : 1;
        const rejoinBoost = (mode === 'rejoin' && farFromLeader) ? 1.28 : 1;
        const acidSlow = (sprite.acidSlowUntil && sprite.acidSlowUntil > time) ? 0.5 : 1;
        const speed = baseSpeed * arrival * flankBoost * rejoinBoost * acidSlow;
        sprite.moveTowardRigid(targetX, targetY, delta, speed);
        this.trackFollowerNavigation(follower, targetX, targetY, time);
    }

    claimFollowerTarget(worldX, worldY, radiusTiles = 2, selfFollower = null) {
        if (!this.pathGrid) return { x: worldX, y: worldY };
        const center = this.pathGrid.worldToTile(worldX, worldY);
        const targetOpenness = this.getWalkableNeighborCount(center.x, center.y);
        const leaderMoving = this.isLeaderMoving();
        const now = this.scene?.time?.now || 0;
        const nav = selfFollower?.nav || null;
        this.pruneFollowerAvoidTiles(nav, now);
        const candidates = [];
        const maxR = Math.max(1, radiusTiles);
        for (let r = 0; r <= maxR; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = center.x + dx;
                    const ty = center.y + dy;
                    if (!this.isTileWalkableWithProps(tx, ty)) continue;
                    candidates.push({ tx, ty });
                }
            }
        }
        let best = null;
        let bestScore = Infinity;
        for (const c of candidates) {
            const key = `${c.tx},${c.ty}`;
            if (this.targetReservations.has(key)) continue;
            if (this.isTileTemporallyReserved(c.tx, c.ty, selfFollower, now)) continue;
            const world = this.pathGrid.tileToWorld(c.tx, c.ty);
            const dx = world.x - worldX;
            const dy = world.y - worldY;
            const distScore = dx * dx + dy * dy;
            let occupiedPenalty = 0;
            let nearestMate = Infinity;
            for (const follower of this.followers) {
                if (!follower?.sprite || follower === selfFollower) continue;
                const s = follower.sprite;
                if (!s.active || s.alive === false) continue;
                const d = Phaser.Math.Distance.Between(world.x, world.y, s.x, s.y);
                if (d < nearestMate) nearestMate = d;
                if (d < (this.minSpacing * 0.8)) {
                    occupiedPenalty += (this.minSpacing * 0.8 - d) * 160;
                }
            }
            if (nearestMate < (this.minSpacing * 1.02)) {
                // Corridors (openness ≤ 2) can't physically separate — massively reduce the
                // partner-spacing penalty so followers aren't routed backward or into walls.
                const corridorFactor = (this.getWalkableNeighborCount(c.tx, c.ty) <= 2) ? 0.12 : 1.0;
                occupiedPenalty += FOLLOWER_MIN_PARTNER_SPACING_PENALTY * corridorFactor;
            }
            const openness = this.getWalkableNeighborCount(c.tx, c.ty);
            const corridorBase = openness <= 2 ? 14 : 0;
            const corridorBias = leaderMoving ? 0.2 : (targetOpenness <= 2 ? 0.35 : 1);
            const corridor = corridorBase * corridorBias;
            const doorPenalty = this.getDoorChokePenalty(world.x, world.y, selfFollower?.sprite || null);
            const aroundTemporalPenalty = this.getTemporalNeighborPenalty(c.tx, c.ty, selfFollower, now);
            const avoidPenalty = this.getFollowerAvoidPenalty(nav, c.tx, c.ty, now);
            const score = distScore + occupiedPenalty + corridor + doorPenalty + avoidPenalty + aroundTemporalPenalty;
            if (score < bestScore) {
                best = world;
                bestScore = score;
            }
        }
        if (!best) {
            best = this.findNearestWalkableWorld(worldX, worldY, radiusTiles);
        }
        const t = this.pathGrid.worldToTile(best.x, best.y);
        this.targetReservations.add(`${t.x},${t.y}`);
        const ownerIndex = Number.isFinite(selfFollower?.index) ? selfFollower.index : -1;
        this.reserveTemporalTile(t.x, t.y, now + 260 + Math.max(0, ownerIndex) * 70, ownerIndex);
        return best;
    }

    getFollowerCrowdPenalty(worldX, worldY, selfSprite = null) {
        let penalty = 0;
        for (const follower of this.followers) {
            const s = follower?.sprite;
            if (!s || s === selfSprite || !s.active || s.alive === false) continue;
            const d = Phaser.Math.Distance.Between(worldX, worldY, s.x, s.y);
            if (d < this.minSpacing) {
                penalty += (this.minSpacing - d) * 120;
            }
        }
        return penalty;
    }

    pruneFollowerAvoidTiles(nav, time = this.scene?.time?.now || 0) {
        if (!nav || !(nav.avoidTiles instanceof Map)) return;
        for (const [key, until] of nav.avoidTiles.entries()) {
            if (!Number.isFinite(until) || until <= time) nav.avoidTiles.delete(key);
        }
    }

    markFollowerAvoidTile(nav, tileX, tileY, time = this.scene?.time?.now || 0, ttlMul = 1) {
        if (!nav || !(nav.avoidTiles instanceof Map)) return;
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
        const ttl = FOLLOWER_AVOID_TILE_MEMORY_MS * Phaser.Math.Clamp(Number(ttlMul) || 1, 0.3, 2);
        const key = `${tileX},${tileY}`;
        nav.avoidTiles.set(key, Math.max(nav.avoidTiles.get(key) || 0, time + ttl));
    }

    getFollowerAvoidPenalty(nav, tileX, tileY, time = this.scene?.time?.now || 0) {
        if (!nav || !(nav.avoidTiles instanceof Map)) return 0;
        let penalty = 0;
        const own = nav.avoidTiles.get(`${tileX},${tileY}`);
        if (Number.isFinite(own) && own > time) penalty += FOLLOWER_AVOID_TILE_PENALTY;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;
                const around = nav.avoidTiles.get(`${tileX + ox},${tileY + oy}`);
                if (Number.isFinite(around) && around > time) penalty += FOLLOWER_AVOID_NEIGHBOR_PENALTY;
            }
        }
        return penalty;
    }

    countFollowersNearWorld(worldX, worldY, radius = CONFIG.TILE_SIZE, selfSprite = null) {
        const r2 = radius * radius;
        let n = 0;
        for (const follower of this.followers) {
            const s = follower?.sprite;
            if (!s || !s.active || s.alive === false || s === selfSprite) continue;
            const dx = worldX - s.x;
            const dy = worldY - s.y;
            if ((dx * dx + dy * dy) <= r2) n++;
        }
        return n;
    }

    getDoorChokePenalty(worldX, worldY, selfSprite = null) {
        const mgr = this.scene?.doorManager;
        if (!mgr?.doorGroups || !Number.isFinite(worldX) || !Number.isFinite(worldY)) return 0;
        const radius = CONFIG.TILE_SIZE * 1.25;
        let penalty = 0;
        for (const group of mgr.doorGroups) {
            if (!group || group.isPassable) continue;
            const center = this.getDoorCenter(group);
            const d = Phaser.Math.Distance.Between(worldX, worldY, center.x, center.y);
            if (d > radius) continue;
            const crowd = this.countFollowersNearWorld(center.x, center.y, CONFIG.TILE_SIZE * 1.15, selfSprite);
            const t = 1 - Phaser.Math.Clamp(d / radius, 0, 1);
            penalty += t * (120 + crowd * 90);
        }
        return penalty;
    }

    findBestDetourWorld(sprite, worldX, worldY, radiusTiles = 4) {
        if (!this.pathGrid) return { x: worldX, y: worldY };
        const origin = this.pathGrid.worldToTile(worldX, worldY);
        const targetOpenness = this.getWalkableNeighborCount(origin.x, origin.y);
        const leaderMoving = this.isLeaderMoving();
        let best = null;
        let bestScore = Infinity;
        for (let r = 0; r <= Math.max(1, radiusTiles); r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = origin.x + dx;
                    const ty = origin.y + dy;
                    if (!this.isTileWalkableWithProps(tx, ty)) continue;
                    const candidate = this.pathGrid.tileToWorld(tx, ty);
                    const distToGoal = Phaser.Math.Distance.Between(candidate.x, candidate.y, worldX, worldY);
                    const crowdPenalty = this.getFollowerCrowdPenalty(candidate.x, candidate.y, sprite);
                    const openness = this.getWalkableNeighborCount(tx, ty);
                    const corridorPenalty = (openness <= 2 ? 16 : 0) * (leaderMoving ? 0.22 : (targetOpenness <= 2 ? 0.4 : 1));
                    const doorPenalty = this.getDoorChokePenalty(candidate.x, candidate.y, sprite);
                    const score = distToGoal + crowdPenalty + corridorPenalty + doorPenalty;
                    if (score < bestScore) {
                        best = candidate;
                        bestScore = score;
                    }
                }
            }
        }
        return best || this.findNearestWalkableWorld(worldX, worldY, radiusTiles);
    }

    requestDoorSync(doorGroup, side) {
        this.doorSync = { doorGroup, side };
    }

    clearDoorSync() {
        this.doorSync = null;
        this.postDoorRecoveryUntil = this.scene?.time?.now
            ? this.scene.time.now + DOOR_RELEASE_RECOVERY_MS
            : DOOR_RELEASE_RECOVERY_MS;
    }

    getWalkableNeighborCount(tileX, tileY) {
        if (!this.pathGrid || !Number.isFinite(tileX) || !Number.isFinite(tileY)) return 4;
        let open = 0;
        if (this.isTileWalkableWithProps(tileX + 1, tileY)) open++;
        if (this.isTileWalkableWithProps(tileX - 1, tileY)) open++;
        if (this.isTileWalkableWithProps(tileX, tileY + 1)) open++;
        if (this.isTileWalkableWithProps(tileX, tileY - 1)) open++;
        return open;
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
        if (!roleKey) return false;
        const task = this.roleTasks.get(roleKey);
        let held = (!!task && task.released !== true) || this.externalHoldRoles.has(roleKey);
        
        // Also check if the follower is busy with a door action
        if (!held && this.scene.doorActionSystem) {
            const sprite = this.getFollowerByRole(roleKey);
            if (sprite && this.scene.doorActionSystem.isActorBusy(sprite)) {
                held = true;
            }
        }

        return held;
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

    updateRoleTasks(delta, time = this.scene?.time?.now || 0) {
        for (const [roleKey, task] of this.roleTasks.entries()) {
            if (!task || task.done) continue;
            const follower = this.followers.find((f) => f.sprite && f.sprite.roleKey === roleKey);
            const sprite = follower?.sprite;
            if (!sprite || !sprite.active || sprite.alive === false) {
                this.roleTasks.delete(roleKey);
                continue;
            }
            const idx = Phaser.Math.Clamp(task.index, 0, Math.max(0, task.worldPath.length - 1));
            const node = task.worldPath[idx];
            // Use a faster speed for door approach tasks so the worker reaches the door promptly
            const speed = this.formupSpeed * 1.35;
            const slotTarget = this.claimFollowerTarget(node.x, node.y, 2, follower);
            const moveTarget = this.getFollowerMoveTarget(follower, slotTarget.x, slotTarget.y, time);
            this.moveFollowerToward(follower, moveTarget.x, moveTarget.y, delta, speed, time);
            const dx = node.x - sprite.x;
            const dy = node.y - sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1.2) {
                sprite.setDesiredRotation(Math.atan2(dy, dx));
            }
            if (!task.stepStartedAt) task.stepStartedAt = time;
            const stepElapsed = time - task.stepStartedAt;
            // Relaxed distance and timeout to prevent getting stuck
            if (dist <= 10.0 || stepElapsed > 1800) {
                if (task.index >= task.worldPath.length - 1) {
                    task.done = true;
                } else {
                    task.index += 1;
                    task.stepStartedAt = time;
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
        // Team leader and followers run the same move speed.
        this.snakeBaseSpeed = targetTeamSpeed;
        this.formupSpeed = targetTeamSpeed;
        this.snakeCatchupGain = this.runtimeTuning.snakeCatchupGain || DEFAULT_SNAKE_CATCHUP_GAIN;
        this.snakeStaggerMs = 250;
        this.snakeStaggerMinMs = 250;
        this.snakeStaggerMaxMs = 250;
        this.minSpacing = this.runtimeTuning.minSpacing || DEFAULT_MIN_SPACING;
        this.snakeStep = preset.snakeStep;
        this.rebuildSnakeStaggerProfile();
        this.leader.turnSpeedRadPerSec = preset.leaderTurn;
        const followerTurnSpeed = Phaser.Math.Clamp(preset.followerTurn * followerTurnMul, 3.8, 10.5);
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
