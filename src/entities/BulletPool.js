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

        this.lastFiredTime = 0;
    }

    fire(x, y, angle, time) {
        if (time - this.lastFiredTime < CONFIG.FIRE_RATE) return;

        const bullet = this.getFirstDead(false);
        if (bullet) {
            bullet.fire(x, y, angle, time);
            this.lastFiredTime = time;
        }
    }
}
