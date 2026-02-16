import { CONFIG } from '../config.js';

export class MovementSystem {
    assignPath(entity, path) {
        entity.currentPath = path;
        entity.pathIndex = 0;
    }

    clearPath(entity) {
        entity.currentPath = null;
        entity.pathIndex = 0;
        entity.body.setVelocity(0, 0);
    }

    update(entity, delta = 16.6667) {
        if (!entity.currentPath || entity.pathIndex >= entity.currentPath.length) {
            if (entity.currentPath) {
                entity.body.setVelocity(0, 0);
                entity.currentPath = null;
            }
            return;
        }

        const target = entity.currentPath[entity.pathIndex];
        const dist = Phaser.Math.Distance.Between(entity.x, entity.y, target.x, target.y);

        if (dist < CONFIG.PATH_ARRIVAL_THRESHOLD) {
            entity.pathIndex++;
            if (entity.pathIndex >= entity.currentPath.length) {
                entity.body.setVelocity(0, 0);
                entity.currentPath = null;
                return;
            }
        }

        const desired = this.computeDesiredVelocity(entity);
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
                const look = Math.min(CONFIG.PATH_LOOKAHEAD_DIST, segLen);
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
        const speed = entity.moveSpeed || CONFIG.LEADER_SPEED;
        return {
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
        };
    }

    approachVelocity(entity, targetVx, targetVy, delta) {
        const dt = Math.max(0.0001, delta / 1000);
        const rigidity = Phaser.Math.Clamp(entity.movementRigidity ?? 0.86, 0, 1);
        if (rigidity >= 0.97) {
            entity.body.setVelocity(targetVx, targetVy);
            return;
        }
        const responseRate = (entity.moveResponseRate || CONFIG.MOVE_RESPONSE_RATE) * (1 + rigidity * 3.5);
        const alpha = 1 - Math.exp(-responseRate * dt);
        const currentVx = entity.body.velocity.x;
        const currentVy = entity.body.velocity.y;
        const nextVx = currentVx + (targetVx - currentVx) * alpha;
        const nextVy = currentVy + (targetVy - currentVy) * alpha;
        entity.body.setVelocity(nextVx, nextVy);
    }
}
