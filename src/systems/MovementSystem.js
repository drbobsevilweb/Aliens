import { CONFIG } from '../config.js';

/** Acceleration toward desired velocity (px/s²) */
const MOVEMENT_ACCEL = 2200;
/** Deceleration when braking to stop (px/s²) */
const MOVEMENT_DECEL = 2600;

export class MovementSystem {
    constructor(scene) {
        this.scene = scene || null;
        // System no longer holds global stall state to ensure multi-entity safety.
    }

    assignPath(entity, path) {
        entity.currentPath = path;
        entity.pathIndex = 0;
        entity._mvStallFrames = 0;
    }

    clearPath(entity) {
        entity.currentPath = null;
        entity.pathIndex = 0;
        if (entity.body) entity.body.setVelocity(0, 0);
        entity._mvStallFrames = 0;
    }

    update(entity, delta = 16.6667) {
        if (!entity.currentPath || entity.pathIndex >= entity.currentPath.length) {
            if (entity.currentPath) {
                if (entity.body) entity.body.setVelocity(0, 0);
                entity.currentPath = null;
            }
            entity._mvStallFrames = 0;
            return;
        }

        const target = entity.currentPath[entity.pathIndex];
        const dist = Phaser.Math.Distance.Between(entity.x, entity.y, target.x, target.y);
        const isLastNode = entity.pathIndex >= entity.currentPath.length - 1;
        // Intermediate waypoints only steer direction — pixel-perfect arrival
        // is unnecessary and impossible near walls where the physics body
        // (36px) prevents reaching within ~14px of the tile-center waypoint.
        // Use generous thresholds so physics-deflected marines don't stall.
        const threshold = isLastNode
            ? Math.max(CONFIG.PATH_ARRIVAL_THRESHOLD || 12, 18)
            : Math.max(CONFIG.PATH_ARRIVAL_THRESHOLD || 12, 16);

        if (dist < threshold) {
            entity.pathIndex++;
            entity._mvStallFrames = 0;
            if (entity.pathIndex >= entity.currentPath.length) {
                if (entity.body) entity.body.setVelocity(0, 0);
                entity.currentPath = null;
                return;
            }
        }

        // Stall detection: if the entity is barely moving despite having a path
        // (e.g. physics collider blocking it near a wall/prop), recover.
        const prevX = Number.isFinite(entity._mvPrevX) ? entity._mvPrevX : entity.x;
        const prevY = Number.isFinite(entity._mvPrevY) ? entity._mvPrevY : entity.y;
        const movedSq = (entity.x - prevX) ** 2 + (entity.y - prevY) ** 2;
        const stallThreshold = 0.04 * delta;
        if (movedSq < stallThreshold) {
            entity._mvStallFrames = (entity._mvStallFrames || 0) + 1;
        } else {
            entity._mvStallFrames = 0;
        }

        if (isLastNode) {
            // At the final waypoint, clear the entire path after a short stall.
            if ((entity._mvStallFrames || 0) > 5) {
                if (entity.body) entity.body.setVelocity(0, 0);
                entity.currentPath = null;
                entity._mvStallFrames = 0;
                return;
            }
        } else {
            // At intermediate waypoints, skip to the next one instead of
            // abandoning the whole path — the marine can still reach the goal.
            if ((entity._mvStallFrames || 0) > 10) {
                // Try nudging perpendicular to path direction before skipping
                if (!entity._mvDetourUntil || entity._mvDetourUntil < (this.scene?.time?.now || 0)) {
                    const nextPt = entity.currentPath[entity.pathIndex];
                    const pathAngle = Math.atan2(nextPt.y - entity.y, nextPt.x - entity.x);
                    entity._mvNudgeSide = -(entity._mvNudgeSide || 1);
                    const side = entity._mvNudgeSide;
                    const perpAngle = pathAngle + side * Math.PI * 0.5;
                    const nudgeSpeed = (entity.moveSpeed || CONFIG.LEADER_SPEED) * 0.7;
                    entity.body.setVelocity(
                        Math.cos(perpAngle) * nudgeSpeed,
                        Math.sin(perpAngle) * nudgeSpeed
                    );
                    entity._mvDetourUntil = (this.scene?.time?.now || 0) + 200;
                    entity._mvStallFrames = 0;
                    return; // Let the nudge play out before reassessing
                }
                // If nudge didn't help, skip forward
                entity.pathIndex++;
                entity._mvStallFrames = 0;
                entity._mvDetourUntil = 0;
                if (entity.pathIndex >= entity.currentPath.length) {
                    if (entity.body) entity.body.setVelocity(0, 0);
                    entity.currentPath = null;
                    return;
                }
            }
        }
        entity._mvPrevX = entity.x;
        entity._mvPrevY = entity.y;

        const desired = this.computeDesiredVelocity(entity);
        // Smooth arrival deceleration — ease into final waypoint
        if (isLastNode) {
            const distToFinal = Phaser.Math.Distance.Between(entity.x, entity.y,
                entity.currentPath[entity.currentPath.length - 1].x,
                entity.currentPath[entity.currentPath.length - 1].y);
            const arrivalRadius = 48;
            if (distToFinal < arrivalRadius) {
                const arrivalScale = Phaser.Math.Clamp(distToFinal / arrivalRadius, 0.15, 1);
                desired.vx *= arrivalScale;
                desired.vy *= arrivalScale;
            }
        }
        this.approachVelocity(entity, desired.vx, desired.vy, delta);
    }

    computeDesiredVelocity(entity) {
        const path = entity.currentPath;
        const i = entity.pathIndex;
        const pointA = path[i];
        const pointB = path[Math.min(i + 1, path.length - 1)];
        const useNext = pointA !== pointB;

        let tx = pointA.x;
        let ty = pointA.y;
        if (useNext) {
            const segX = pointB.x - pointA.x;
            const segY = pointB.y - pointA.y;
            const segLen = Math.sqrt(segX * segX + segY * segY);
            if (segLen > 0.001) {
                const look = Math.min(CONFIG.PATH_LOOKAHEAD_DIST || 32, segLen);
                const ux = segX / segLen;
                const uy = segY / segLen;
                tx = pointA.x + ux * look;
                ty = pointA.y + uy * look;
            }
        }

        const dx = tx - entity.x;
        const dy = ty - entity.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.0001) return { vx: 0, vy: 0 };
        let speed = entity.moveSpeed || CONFIG.LEADER_SPEED;
        if (entity.acidSlowUntil && entity.acidSlowUntil > (this.scene?.time?.now || 0)) {
            speed *= 0.5;
        }
        if (entity._sprintActive) {
            speed *= 1.45;
        }

        let vx = (dx / len) * speed;
        let vy = (dy / len) * speed;

        return { vx, vy };
    }

    approachVelocity(entity, targetVx, targetVy, delta) {
        const dt = Math.max(0.0001, delta / 1000);
        const rigidity = Phaser.Math.Clamp(entity.movementRigidity ?? 0.86, 0, 1);

        const currentVx = entity.body.velocity.x;
        const currentVy = entity.body.velocity.y;
        const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);

        // Rigidity scales acceleration: 0 → 1×, 1 → 3×
        const rigidityMul = 1 + rigidity * 2;

        if (targetSpeed < 0.5) {
            // No desired movement — decelerate to stop
            const currentSpeed = Math.sqrt(currentVx * currentVx + currentVy * currentVy);
            if (currentSpeed < 1) {
                entity.body.setVelocity(0, 0);
                return;
            }
            const decel = MOVEMENT_DECEL * rigidityMul * dt;
            const newSpeed = Math.max(0, currentSpeed - decel);
            const ratio = newSpeed / currentSpeed;
            entity.body.setVelocity(currentVx * ratio, currentVy * ratio);
            return;
        }

        // Accelerate toward desired velocity
        const diffVx = targetVx - currentVx;
        const diffVy = targetVy - currentVy;
        const diffMag = Math.sqrt(diffVx * diffVx + diffVy * diffVy);

        if (diffMag < 0.5) {
            entity.body.setVelocity(targetVx, targetVy);
            return;
        }

        const accel = MOVEMENT_ACCEL * rigidityMul * dt;

        let nextVx, nextVy;
        if (accel >= diffMag) {
            nextVx = targetVx;
            nextVy = targetVy;
        } else {
            const stepRatio = accel / diffMag;
            nextVx = currentVx + diffVx * stepRatio;
            nextVy = currentVy + diffVy * stepRatio;
        }

        // Cap at max speed
        const maxSpeed = entity.moveSpeed || CONFIG.LEADER_SPEED;
        const nextSpeed = Math.sqrt(nextVx * nextVx + nextVy * nextVy);
        if (nextSpeed > maxSpeed) {
            const clampRatio = maxSpeed / nextSpeed;
            nextVx *= clampRatio;
            nextVy *= clampRatio;
        }

        entity.body.setVelocity(nextVx, nextVy);
    }
}
