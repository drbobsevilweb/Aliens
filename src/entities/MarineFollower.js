import { CONFIG } from '../config.js';

const MUZZLE_OFFSET_X_RATIO = 184 / 1602;
const MUZZLE_OFFSET_Y_RATIO = -542 / 1536;

export class MarineFollower extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, worldX, worldY, roleKey) {
        // Single rotating sprite — Image Editor is sole authority on sizing (no code-driven scaling)
        const textureKey = scene.textures.exists('marine_topdown') ? 'marine_topdown' : `marine_${roleKey}`;
        super(scene, worldX, worldY, textureKey);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.roleKey = roleKey;
        this.maxHealth = 100;
        this.health = 100;
        this.alive = true;
        this.lastDamagedAt = -1;
        this.morale = 0;
        this.baseRotation = 0;
        this._logicalRot = 0;
        this._sheetLoaded = false;
        this._spriteAngleOffset = textureKey === 'marine_topdown' ? (Math.PI * 0.5 - Phaser.Math.DegToRad(10)) : 0;
        this.usesTopDownMarineSprite = textureKey === 'marine_topdown';
        this.turnSpeedRadPerSec = 7.2;
        this.patrolPhase = Math.random() * Math.PI * 2;
        this.patrolSpeed = 0.004 + Math.random() * 0.0015;
        this.patrolAmplitude = 0.16 + Math.random() * 0.05;
        this.followLerp = CONFIG.MARINE_FOLLOWER_LERP;
        this.setDepth(9);

        // Physics body derived from sprite pixel dimensions (~80%)
        const bodyRadius = Math.round(Math.min(this.width, this.height) * 0.4);
        this.body.setCircle(bodyRadius, this.width / 2 - bodyRadius, this.height / 2 - bodyRadius);
        this.body.setCollideWorldBounds(true);
        this.setImmovable(true);
        this.body.setImmovable(true);
        this.body.immovable = true;
        this.body.pushable = false;

        this._roleTint = null; // Role tints removed — each follower will have its own sprite
        this.lightShoulderLocalX = -6.3;
        this.lightShoulderLocalY = -2.5;
        this.muzzleLocalX = this.displayWidth * MUZZLE_OFFSET_X_RATIO;
        this.muzzleLocalY = this.displayHeight * MUZZLE_OFFSET_Y_RATIO;

        this.shadowSprite = scene.add.image(worldX, worldY + 2, 'shadow_blob');
        this.shadowSprite.setDepth(5);
        this.shadowSprite.setAlpha(0.3);
        this.shadowSprite.setScale(this.scaleX);
        this.walkBobPhase = Math.random() * Math.PI * 2;
        this.walkBobBaseScale = this.scaleX;
        this._lastVisualX = this.x;
        this._lastVisualY = this.y;
        this._damageTintUntil = 0;
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (this.shadowSprite) {
            this.shadowSprite.setVisible(this.visible);
            this.shadowSprite.setPosition(this.x, this.y + 2);
        }
        this._applyWalkBob(delta);
        this._lastVisualX = this.x;
        this._lastVisualY = this.y;
    }

    // Velocity-based moveToward
    moveToward(targetX, targetY, dtScale) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) {
            this.body.setVelocity(0, 0);
            return;
        }
        const speed = (this.moveSpeed || 100) * this.followLerp * dtScale * 10;
        this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    }

    moveTowardRigid(targetX, targetY, delta, maxSpeed) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 4) {
            this.body.setVelocity(0, 0);
            return;
        }
        
        const speed = Math.min(maxSpeed, dist * 5); // Smooth slowdown
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        this.body.setVelocity(vx, vy);
    }

    setDesiredRotation(angle) {
        this.baseRotation = angle;
    }

    get facingAngle() {
        return this._logicalRot;
    }

    updateRotation(delta, time, options = {}) {
        const patrol = options.patrol === true;
        const target = patrol
            ? this.baseRotation + Math.sin(time * this.patrolSpeed + this.patrolPhase) * this.patrolAmplitude
            : this.baseRotation;
        const speedMul = Number(options.turnSpeedMul) || 1;
        this._logicalRot = Phaser.Math.Angle.RotateTo(
            this._logicalRot,
            target,
            this.turnSpeedRadPerSec * speedMul * (delta / 1000)
        );
        this.rotation = this._logicalRot + (Number(this._spriteAngleOffset) || 0) + (Number(this._walkBobRotOffset) || 0);
    }

    destroy() {
        if (this.shadowSprite) {
            this.shadowSprite.destroy();
            this.shadowSprite = null;
        }
        super.destroy();
    }

    _applyWalkBob(delta) {
        const vx = Number(this.body?.velocity?.x) || 0;
        const vy = Number(this.body?.velocity?.y) || 0;
        const speed = Math.hypot(vx, vy);
        if (speed < 6) {
            this._walkBobRotOffset = 0;
            return;
        }
        // 50% faster walk animation
        this.walkBobPhase += (0.012 + speed * 0.0012) * (Math.max(1, delta) / 16);
        const intensity = Phaser.Math.Clamp(speed * 0.01, 0, 1);
        // Wider sway for a visible walk
        const primary = Math.sin(this.walkBobPhase) * 0.085 * intensity;
        const secondary = Math.sin(this.walkBobPhase * 2.0 + 0.35) * 0.016 * intensity;
        this._walkBobRotOffset = primary + secondary;
    }

    takeDamage(amount) {
        if (!this.alive) return;
        const dmg = Math.max(0, Number(amount) || 0);
        if (dmg <= 0) return;
        const moraleLoss = Number(this.scene?.runtimeSettings?.marines?.moraleDamageLoss);
        this.health = Math.max(0, this.health - dmg);
        this.lastDamagedAt = this.scene.time.now;
        this.scene?.eventBus?.emit('followerDamaged', { follower: this, roleKey: this.roleKey, amount: dmg, healthAfter: this.health });
        this.morale = Math.max(-100, this.morale - (Number.isFinite(moraleLoss) ? moraleLoss : 10));
        this._damageTintUntil = (this.scene?.time?.now || 0) + 90;
        if (this.health <= 0) {
            this.scene?.eventBus?.emit('followerDied', { follower: this, roleKey: this.roleKey, x: this.x, y: this.y });
            this.alive = false;
            this.setActive(false);
            this.setVisible(false);
            this.body.enable = false;
            if (this.shadowSprite) this.shadowSprite.setVisible(false);
        }
    }

    heal(amount) {
        if (!this.alive || this.active === false) return 0;
        const gain = Math.max(0, Number(amount) || 0);
        if (gain <= 0) return 0;
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + gain);
        this.scene?.eventBus?.emit('followerHealed', { follower: this, roleKey: this.roleKey, amount: Math.max(0, this.health - before), healthAfter: this.health });
        return Math.max(0, this.health - before);
    }

    setFollowLerp(lerp) {
        this.followLerp = Phaser.Math.Clamp(lerp, 0.02, 0.35);
    }

    setPatrolProfile(speed, amplitude) {
        this.patrolSpeed = Phaser.Math.Clamp(speed, 0.001, 0.02);
        this.patrolAmplitude = Phaser.Math.Clamp(amplitude, 0.03, 0.5);
    }
}
