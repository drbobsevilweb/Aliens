export class AcidProjectile extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'acid_projectile');
        this.spawnTime = 0;
        this.lifespan = 1200;
        this.damage = 0;
        this.setDepth(12);
    }

    fire(x, y, angle, time, speed, damage, lifespan) {
        this.body.reset(x, y);
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.setActive(true);
        this.setVisible(true);
        this.spawnTime = time;
        this.lifespan = lifespan;
        this.damage = damage;
        this.setRotation(angle);
        this.body.setVelocity(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed
        );
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (time - this.spawnTime > this.lifespan) {
            this.deactivate();
        }
    }

    deactivate() {
        this.setActive(false);
        this.setVisible(false);
        this.body.stop();
        this.body.enable = false;
        this.body.checkCollision.none = true;
    }
}
