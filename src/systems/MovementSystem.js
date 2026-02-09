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

    update(entity) {
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

        const next = entity.currentPath[entity.pathIndex];
        const angle = Phaser.Math.Angle.Between(entity.x, entity.y, next.x, next.y);
        entity.body.setVelocity(
            Math.cos(angle) * CONFIG.LEADER_SPEED,
            Math.sin(angle) * CONFIG.LEADER_SPEED
        );
    }
}
