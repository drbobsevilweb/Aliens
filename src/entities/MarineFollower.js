import { CONFIG } from '../config.js';

export class MarineFollower extends Phaser.GameObjects.Sprite {
    constructor(scene, worldX, worldY, roleKey) {
        super(scene, worldX, worldY, `marine_${roleKey}`);
        this.roleKey = roleKey;
        this.maxHealth = 100;
        this.health = 100;
        this.alive = true;
        this.lastDamagedAt = -1;
        this.morale = 0;
        this.rotation = 0;
        this.baseRotation = 0;
        this.turnSpeedRadPerSec = 7.2;
        this.patrolPhase = Math.random() * Math.PI * 2;
        this.patrolSpeed = 0.004 + Math.random() * 0.0015;
        this.patrolAmplitude = 0.16 + Math.random() * 0.05;
        this.followLerp = CONFIG.MARINE_FOLLOWER_LERP;
        this.setDepth(9);
        const marineScale = Number(scene?.runtimeSettings?.spriteAnimation?.marineSpriteScale) || 1;
        this.setScale(marineScale);
        scene.add.existing(this);
    }

    moveToward(targetX, targetY, dtScale) {
        const lerp = Math.min(1, this.followLerp * dtScale);
        this.x += (targetX - this.x) * lerp;
        this.y += (targetY - this.y) * lerp;
    }

    moveTowardRigid(targetX, targetY, delta, maxSpeed) {
        const dt = Math.max(0.0001, delta / 1000);
        const step = Math.max(0, maxSpeed) * dt;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.0001) return;
        if (dist <= step) {
            this.x = targetX;
            this.y = targetY;
            return;
        }
        const inv = 1 / dist;
        this.x += dx * inv * step;
        this.y += dy * inv * step;
    }

    setDesiredRotation(angle) {
        this.baseRotation = angle;
    }

    updateRotation(delta, time, options = {}) {
        const patrol = options.patrol === true;
        const target = patrol
            ? this.baseRotation + Math.sin(time * this.patrolSpeed + this.patrolPhase) * this.patrolAmplitude
            : this.baseRotation;
        this.rotation = Phaser.Math.Angle.RotateTo(
            this.rotation,
            target,
            this.turnSpeedRadPerSec * (delta / 1000)
        );
    }

    setFollowLerp(lerp) {
        this.followLerp = Phaser.Math.Clamp(lerp, 0.02, 0.35);
    }

    setPatrolProfile(speed, amplitude) {
        this.patrolSpeed = Phaser.Math.Clamp(speed, 0.001, 0.02);
        this.patrolAmplitude = Phaser.Math.Clamp(amplitude, 0.03, 0.5);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        const dmg = Math.max(0, Number(amount) || 0);
        if (dmg <= 0) return;
        const moraleLoss = Number(this.scene?.runtimeSettings?.marines?.moraleDamageLoss);
        this.health = Math.max(0, this.health - dmg);
        this.lastDamagedAt = this.scene.time.now;
        this.morale = Math.max(-100, this.morale - (Number.isFinite(moraleLoss) ? moraleLoss : 10));
        this.setTint(0xff6666);
        this.scene.time.delayedCall(70, () => {
            if (this.active) this.clearTint();
        });
        if (this.health <= 0) {
            this.alive = false;
            this.setActive(false);
            this.setVisible(false);
        }
    }

    heal(amount) {
        if (!this.alive || this.active === false) return 0;
        const gain = Math.max(0, Number(amount) || 0);
        if (gain <= 0) return 0;
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + gain);
        return Math.max(0, this.health - before);
    }
}
