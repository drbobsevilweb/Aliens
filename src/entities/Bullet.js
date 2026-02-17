export class Bullet extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'bullet');
        this.spawnTime = 0;
        this.lifespan = 2000;
        this.damage = 0;
        this.weaponKey = 'pulseRifle';
        this.ownerRoleKey = 'leader';
    }

    fire(x, y, angle, time, weaponDef) {
        this.body.reset(x, y);
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.setActive(true);
        this.setVisible(false);
        this.setAlpha(0);
        this.setTexture(weaponDef.bulletTexture);
        this.body.setCircle(weaponDef.bulletSize);
        this.setDepth(14);
        this.spawnTime = time;
        this.lifespan = weaponDef.bulletLifespan;
        this.damage = weaponDef.damage;
        this.weaponKey = weaponDef.key || this.weaponKey || 'pulseRifle';
        this.ownerRoleKey = weaponDef.ownerRoleKey || this.ownerRoleKey || 'leader';
        this.setRotation(angle);
        this.body.setVelocity(
            Math.cos(angle) * weaponDef.bulletSpeed,
            Math.sin(angle) * weaponDef.bulletSpeed
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
