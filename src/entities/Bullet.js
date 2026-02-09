import { CONFIG } from '../config.js';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'bullet');
        this.spawnTime = 0;
    }

    fire(x, y, angle, time) {
        this.body.reset(x, y);
        this.setActive(true);
        this.setVisible(true);
        this.spawnTime = time;
        this.setRotation(angle);
        this.body.setVelocity(
            Math.cos(angle) * CONFIG.BULLET_SPEED,
            Math.sin(angle) * CONFIG.BULLET_SPEED
        );
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (time - this.spawnTime > CONFIG.BULLET_LIFESPAN) {
            this.deactivate();
        }
    }

    deactivate() {
        this.setActive(false);
        this.setVisible(false);
        this.body.stop();
    }
}
