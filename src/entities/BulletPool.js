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
            return true;
        }
        return false;
    }

    fireSpread(x, y, centerAngle, time, weaponDef) {
        const count = weaponDef.bulletsPerShot;
        const totalSpread = weaponDef.spreadAngle;
        const startAngle = centerAngle - totalSpread / 2;
        const step = count > 1 ? totalSpread / (count - 1) : 0;
        let firedCount = 0;

        for (let i = 0; i < count; i++) {
            const angle = startAngle + step * i;
            if (this.fire(x, y, angle, time, weaponDef)) {
                firedCount++;
            }
        }
        return firedCount;
    }
}
