import { CONFIG } from '../config.js';
import { Bullet } from './Bullet.js';

export class BulletPool extends Phaser.Physics.Arcade.Group {
    constructor(scene) {
        super(scene.physics.world, scene);

        this.createMultiple({
            classType: Bullet,
            frameQuantity: CONFIG.BULLET_POOL_SIZE,
            active: false,
            visible: false,
            key: 'bullet'
        });
    }

    fire(x, y, angle, time, weaponDef) {
        const bullet = this.getFirstDead(false);
        if (bullet) {
            bullet.fire(x, y, angle, time, weaponDef);
            return bullet;
        }
        return null;
    }

    fireSpread(x, y, centerAngle, time, weaponDef) {
        const count = weaponDef.bulletsPerShot;
        const totalSpread = weaponDef.spreadAngle;
        const startAngle = centerAngle - totalSpread / 2;
        const step = count > 1 ? totalSpread / (count - 1) : 0;
        let firedCount = 0;

        for (let i = 0; i < count; i++) {
            const jitter = (weaponDef.pelletJitter || 0) * (Math.random() * 2 - 1);
            const angle = startAngle + step * i + jitter;
            if (this.fire(x, y, angle, time, weaponDef)) {
                firedCount++;
            }
        }
        return firedCount;
    }

    /**
     * Draw fading tracer trails for active tracer bullets.
     * Call once per frame from the scene update loop.
     * @param {Phaser.GameObjects.Graphics} gfx - shared graphics object
     */
    drawTracerTrails(gfx) {
        const alphas = [0.15, 0.3, 0.5];
        const sizes = [1.2, 1.6, 2.0];
        const children = this.getChildren();
        for (let i = 0; i < children.length; i++) {
            const b = children[i];
            if (!b.active || !b.isTracer) continue;
            const trail = b._trail;
            const idx = b._trailIdx;
            for (let t = 0; t < 3; t++) {
                // Read oldest first: idx is next write slot, so idx+0 is oldest
                const pos = trail[(idx + t) % 3];
                if (!pos) continue;
                gfx.fillStyle(0xffeebb, alphas[t]);
                gfx.fillCircle(pos.x, pos.y, sizes[t]);
            }
        }
    }
}
