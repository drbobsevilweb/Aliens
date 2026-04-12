import { CONFIG } from '../config.js';

const MAX_ATTACKERS_PER_MARINE = 3;

export class EnemyTargeting {
    constructor(manager) {
        this.manager = manager;
        this.scene = manager.scene;
    }

    pickTargetMarine(enemy, marines, targetPressure = null, time = 0, pressure = 0, committedCounts = null) {
        const pressureN = Phaser.Math.Clamp(Number(pressure) || 0, 0, 1);
        const maxAttackersPerMarine = pressureN >= 0.72 ? (MAX_ATTACKERS_PER_MARINE + 1) : MAX_ATTACKERS_PER_MARINE;
        const prevTarget = enemy?.targetRef;
        const canKeepPrev = prevTarget
            && prevTarget.active !== false
            && prevTarget.alive !== false
            && (Number(prevTarget.health) || 0) > 0
            && time < (enemy.retargetAt || 0);
            
        if (canKeepPrev) {
            const keepDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, prevTarget.x, prevTarget.y);
            const keepPressure = targetPressure ? (targetPressure.get(prevTarget) || 0) : 0;
            const keepCommitted = this.getCommittedCountForTarget(prevTarget, enemy, committedCounts, time);
            const keepDoorPenalty = this.manager.isClosedDoorBetweenWorldPoints(enemy.x, enemy.y, prevTarget.x, prevTarget.y) ? 1 : 0;
            if (
                keepDist <= (enemy.stats?.aggroRange || 220) * 1.4
                && (keepPressure + keepCommitted * 0.45) <= (maxAttackersPerMarine + 1.1)
                && keepDoorPenalty <= 0
            ) {
                return prevTarget;
            }
        }

        let bestPreferred = null;
        let bestPreferredScore = Infinity;
        let bestFallback = null;
        let bestFallbackScore = Infinity;
        
        for (const m of marines) {
            if (!m || m.active === false || m.alive === false) continue;
            if (typeof m.health === 'number' && m.health <= 0) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
            const pressureLocal = targetPressure ? (targetPressure.get(m) || 0) : 0;
            const committed = this.getCommittedCountForTarget(m, enemy, committedCounts, time);
            const isolation = this.getMarineIsolationScore(m, marines);
            const healthPct = Phaser.Math.Clamp(
                (Number(m.health) || 0) / Math.max(1, Number(m.maxHealth) || 100),
                0,
                1
            );
            const doorPenalty = this.manager.isClosedDoorBetweenWorldPoints(enemy.x, enemy.y, m.x, m.y) ? 220 : 0;
            const pressurePenalty = pressureLocal * pressureLocal * Phaser.Math.Linear(42, 30, pressureN);
            const committedPenalty = committed * Phaser.Math.Linear(18, 14, pressureN);
            const woundedBonus = (1 - healthPct) * 12;
            const isolationBonus = isolation * Phaser.Math.Linear(18, 28, pressureN);
            const roleBias = m.roleKey === 'leader' ? 0 : 16; // Keep some peel pressure on exposed followers without stripping the squad before the leader draws heat.
            const score = d + pressurePenalty + committedPenalty + doorPenalty - woundedBonus - isolationBonus + roleBias;
            const isolationCapBonus = isolation >= 0.7 ? 1.5 : (isolation >= 0.5 ? 0.75 : 0);
            
            if ((pressureLocal + committed * 0.35) < (maxAttackersPerMarine + isolationCapBonus) && score < bestPreferredScore) {
                bestPreferredScore = score;
                bestPreferred = m;
            }
            const fallbackScore = score + pressureLocal * 8;
            if (fallbackScore < bestFallbackScore) {
                bestFallbackScore = fallbackScore;
                bestFallback = m;
            }
        }
        
        const picked = bestPreferred || bestFallback || marines[0] || null;
        if (enemy && picked) {
            enemy.targetRef = picked;
            const changePenalty = prevTarget && prevTarget !== picked ? 1 : 0;
            const churnGuard = pressureN >= 0.62 ? 1.22 : 1;
            enemy.retargetAt = time + Phaser.Math.Between(
                Math.round((changePenalty ? 220 : 180) * churnGuard),
                Math.round((changePenalty ? 560 : 420) * churnGuard)
            );
        }
        return picked;
    }

    getMarineIsolationScore(marine, marines) {
        if (!marine || !marines) return 0;
        const nearest = this.getNearestMarineDistance(marine, marines);
        const isolationBand = CONFIG.TILE_SIZE * 4.5;
        return Phaser.Math.Clamp(nearest / isolationBand, 0, 1);
    }

    rebuildCommittedTargetCounts(time = this.scene?.time?.now || 0) {
        this.manager.committedTargetCounts.clear();
        for (const other of this.manager.enemies) {
            if (!other || !other.active) continue;
            const target = other.targetRef;
            if (!target || target.active === false || target.alive === false) continue;
            if (time >= (other.retargetAt || 0)) continue;
            this.manager.committedTargetCounts.set(target, (this.manager.committedTargetCounts.get(target) || 0) + 1);
        }
    }

    getCommittedCountForTarget(target, ignoreEnemy = null, committedCounts = null, time = this.scene?.time?.now || 0) {
        if (!target) return 0;
        const counts = committedCounts || this.manager.committedTargetCounts;
        let count = counts ? (counts.get(target) || 0) : 0;
        if (
            ignoreEnemy
            && ignoreEnemy.targetRef === target
            && ignoreEnemy.active
            && time < (ignoreEnemy.retargetAt || 0)
        ) {
            count = Math.max(0, count - 1);
        }
        return count;
    }

    assignAssaultLane(enemy, target, pressure = 0.3, time = 0) {
        if (!enemy || !target) return;
        const pressureN = Phaser.Math.Clamp(Number(pressure) || 0, 0, 1);
        const laneCount = pressureN >= 0.62 ? 4 : 3;
        let occupancy = this.manager.targetLaneOccupancy.get(target);
        if (!Array.isArray(occupancy) || occupancy.length !== laneCount) {
            occupancy = new Array(laneCount).fill(0);
            this.manager.targetLaneOccupancy.set(target, occupancy);
        }
        const seed = Math.abs(Math.floor((enemy.patternSeed || 0.5) * 997));
        const preferred = seed % laneCount;
        let bestLane = 0;
        let bestScore = Infinity;
        for (let i = 0; i < laneCount; i++) {
            const load = occupancy[i] || 0;
            const prefDelta = Math.abs(i - preferred);
            const score = load * 2.4 + prefDelta * 0.35 + Math.random() * 0.04;
            if (score < bestScore) {
                bestScore = score;
                bestLane = i;
            }
        }
        occupancy[bestLane] = (occupancy[bestLane] || 0) + 1;
        const laneAngles = laneCount >= 4
            ? [-0.56, -0.2, 0.2, 0.56]
            : [-0.42, 0, 0.42];
        enemy.assaultLaneIndex = bestLane;
        enemy.assaultLaneAngle = laneAngles[Math.min(bestLane, laneAngles.length - 1)] || 0;
        enemy.assaultLaneUntil = time + 480;
    }

    getNearestMarineDistance(marine, marines) {
        let best = Infinity;
        for (const other of marines) {
            if (!other || other === marine || other.active === false || other.alive === false) continue;
            const d = Phaser.Math.Distance.Between(marine.x, marine.y, other.x, other.y);
            if (d < best) best = d;
        }
        return Number.isFinite(best) ? best : CONFIG.TILE_SIZE * 4;
    }

    isWithinCameraAggro(enemy, camera, range) {
        if (!enemy || !camera) return false;
        const view = camera.worldView;
        const inView = Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y);
        if (inView) return true;
        const cx = view.centerX;
        const cy = view.centerY;
        return Phaser.Math.Distance.Between(cx, cy, enemy.x, enemy.y) <= range;
    }

    rollMeleeHit(enemy, target, dist) {
        const baseChance = 0.72;
        const distNorm = Phaser.Math.Clamp((dist - CONFIG.TILE_SIZE * 0.7) / (CONFIG.TILE_SIZE * 0.6), 0, 1);
        const chance = baseChance - distNorm * 0.24;
        return Math.random() < chance;
    }

    applyMarineDamage(target, amount, attacker = null) {
        const dmg = Math.max(0, Number(amount) || 0);
        if (!target || dmg <= 0) return;
        if (typeof target.takeDamage === 'function') {
            target.takeDamage(dmg, attacker);
        }
        if (typeof this.scene?.onMarineDamaged === 'function') {
            this.scene.onMarineDamaged(target, dmg, this.scene?.time?.now);
        }
        const isLeader = target === this.scene?.leader;
        if (isLeader) {
            this.scene?.eventBus?.emit('alienHitLeader', { alien: attacker, leader: target, damage: dmg });
        } else {
            this.scene?.eventBus?.emit('alienHitFollower', { alien: attacker, follower: target, damage: dmg });
        }
    }

    getPriorityThreat(x, y, allowUndetected = false) {
        const pool = allowUndetected 
            ? this.manager.enemies.filter(e => e.active) 
            : this.manager.enemies.filter(e => e.active && e.detected);
        if (pool.length === 0) return null;
        
        let best = null;
        let bestScore = -Infinity;
        const priority = { queen: 100, queenLesser: 80, warrior: 60, drone: 40, facehugger: 20 };
        
        for (const enemy of pool) {
            const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            const p = priority[enemy.enemyType] || 10;
            const score = p * 300 - d * 0.5;
            if (score > bestScore) {
                bestScore = score;
                best = enemy;
            }
        }
        return best;
    }
}
