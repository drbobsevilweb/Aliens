export class Bullet extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'bullet');
        this.spawnTime = 0;
        this.lifespan = 900;
        this.damage = 0;
        this.weaponKey = 'pulseRifle';
        this.ownerRoleKey = 'leader';
        this.isTracer = false;
        this._trail = [null, null, null];
        this._trailIdx = 0;
    }

    fire(x, y, angle, time, weaponDef) {
        this.body.reset(x, y);
        this.fireX = x;
        this.fireY = y;
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.setActive(true);
        this.setTexture(weaponDef.bulletTexture);
        this.body.setCircle(weaponDef.bulletSize);
        this.setDepth(14);
        this.spawnTime = time;
        this.lifespan = weaponDef.bulletLifespan;
        this.damage = weaponDef.damage;
        this.weaponKey = weaponDef.key || this.weaponKey || 'pulseRifle';
        this.ownerRoleKey = weaponDef.ownerRoleKey || this.ownerRoleKey || 'leader';
        this.setRotation(angle);

        // Tracer variance — only a fraction of bullets render as visible tracers
        const tracerRatio = Number(weaponDef.tracerRatio) || 0.33;
        this.isTracer = Math.random() < tracerRatio;
        if (this.isTracer) {
            this.setVisible(true);
            this.setAlpha(0.85);
        } else {
            this.setVisible(false);
            this.setAlpha(0);
        }

        this.body.setVelocity(
            Math.cos(angle) * weaponDef.bulletSpeed,
            Math.sin(angle) * weaponDef.bulletSpeed
        );
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (time - this.spawnTime > this.lifespan) {
            this.deactivate();
            return;
        }
        if (this.isTracer) {
            this._trail[this._trailIdx] = { x: this.x, y: this.y };
            this._trailIdx = (this._trailIdx + 1) % 3;
        }
    }

    deactivate() {
        this.setActive(false);
        this.setVisible(false);
        this.body.stop();
        this.body.enable = false;
        this.body.checkCollision.none = true;
        this._trail[0] = null;
        this._trail[1] = null;
        this._trail[2] = null;
        this._trailIdx = 0;
    }
}
