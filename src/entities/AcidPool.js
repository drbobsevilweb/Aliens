import { AcidProjectile } from './AcidProjectile.js';

export class AcidPool extends Phaser.Physics.Arcade.Group {
    constructor(scene, size = 40) {
        super(scene.physics.world, scene);

        this.createMultiple({
            classType: AcidProjectile,
            frameQuantity: size,
            active: false,
            visible: false,
            key: 'acid_projectile',
        });
    }

    fire(x, y, angle, time, speed, damage, lifespan) {
        const projectile = this.getFirstDead(false);
        if (!projectile) return false;
        projectile.fire(x, y, angle, time, speed, damage, lifespan);
        return true;
    }
}
