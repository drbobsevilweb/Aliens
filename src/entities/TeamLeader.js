import { CONFIG } from '../config.js';

const MUZZLE_OFFSET_X_RATIO = 184 / 1602;
const MUZZLE_OFFSET_Y_RATIO = -542 / 1536;

export class TeamLeader extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, tileX, tileY) {
        const worldX = tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        const worldY = tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        // Single rotating sprite — Image Editor is sole authority on sizing (no code-driven scaling)
        const textureKey = scene.textures.exists('marine_topdown') ? 'marine_topdown' : 'leader';
        super(scene, worldX, worldY, textureKey);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Physics body derived from sprite pixel dimensions (~80% of visual)
        const bodyW = Math.round(this.width * 0.8);
        const bodyH = Math.round(this.height * 0.8);
        this.body.setSize(bodyW, bodyH);
        this.body.setCollideWorldBounds(true);
        this.setImmovable(true);
        this.body.setImmovable(true);
        this.body.immovable = true;
        this.body.pushable = false;
        this.setDepth(10);
        this.turnSpeedRadPerSec = 8.5;
        this.desiredRotation = 0;
        this._logicalRot = 0;
        this._sheetLoaded = false;
        this._spriteAngleOffset = textureKey === 'marine_topdown' ? (Math.PI * 0.5 - Phaser.Math.DegToRad(10)) : 0;
        this.usesTopDownMarineSprite = textureKey === 'marine_topdown';
        this.lightShoulderLocalX = -6.3;
        this.lightShoulderLocalY = -2.5;
        this.muzzleLocalX = this.displayWidth * MUZZLE_OFFSET_X_RATIO;
        this.muzzleLocalY = this.displayHeight * MUZZLE_OFFSET_Y_RATIO;

        // Shadow at depth 5 — below all sprites, above floor.
        this.shadowSprite = scene.add.image(worldX, worldY + 2, 'shadow_blob');
        this.shadowSprite.setDepth(5);
        this.shadowSprite.setAlpha(0.3);
        this.shadowSprite.setScale(this.scaleX);

        this.walkBobPhase = Math.random() * Math.PI * 2;
        this.walkBobBaseScale = this.scaleX;

        this.roleKey = 'leader';
        this.alive = true;
        this.maxHealth = CONFIG.PLAYER_MAX_HEALTH;
        this.health = CONFIG.PLAYER_START_HEALTH;
        this.lastDamagedAt = -1;
        this.morale = 0;
        this.onHealthChange = null;
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (this.shadowSprite) {
            this.shadowSprite.setVisible(this.visible);
            this.shadowSprite.setPosition(this.x, this.y + 2);
        }
        this._applyWalkBob(delta);
    }

    get facingAngle() {
        return this._logicalRot;
    }

    facePosition(worldX, worldY) {
        this.desiredRotation = Phaser.Math.Angle.Between(this.x, this.y, worldX, worldY);
    }

    moveTowardRigid(targetX, targetY, _delta, maxSpeed) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 4) {
            this.body.setVelocity(0, 0);
            return;
        }

        const speed = Math.min(maxSpeed, dist * 5);
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        this.body.setVelocity(vx, vy);
    }

    updateFacing(delta) {
        this._logicalRot = Phaser.Math.Angle.RotateTo(
            this._logicalRot,
            this.desiredRotation,
            this.turnSpeedRadPerSec * (delta / 1000)
        );
        this.rotation = this._logicalRot + (Number(this._spriteAngleOffset) || 0) + (Number(this._walkBobRotOffset) || 0);
    }

    _applyWalkBob(delta) {
        const vx = Number(this.body?.velocity?.x) || 0;
        const vy = Number(this.body?.velocity?.y) || 0;
        const speed = Math.hypot(vx, vy);

        // Fire shake: small random jitter while shooting
        if (this._fireShakeUntil && this.scene?.time?.now < this._fireShakeUntil) {
            this._fireShakeOffsetX = (Math.random() - 0.5) * 3;  // ±1.5px
            this._fireShakeOffsetY = (Math.random() - 0.5) * 3;
        } else {
            this._fireShakeOffsetX = 0;
            this._fireShakeOffsetY = 0;
        }

        if (speed < 6) {
            this._walkBobRotOffset = 0;
            return;
        }
        const dt = Math.max(1, delta);
        // 50% faster walk animation
        this.walkBobPhase += (0.012 + speed / 320) * (dt / 16);
        const intensity = Phaser.Math.Clamp(speed / 200, 0, 1);
        // Wider, slower sway for a visible walk rather than a wobble
        const primary = Math.sin(this.walkBobPhase) * 0.09 * intensity;
        const secondary = Math.sin(this.walkBobPhase * 2.0 + 0.4) * 0.018 * intensity;
        this._walkBobRotOffset = primary + secondary;
    }

    destroy() {
        if (this.shadowSprite) {
            this.shadowSprite.destroy();
            this.shadowSprite = null;
        }
        this.onHealthChange = null;
        super.destroy();
    }

    takeDamage(amount) {
        if (!this.alive) return 0;
        const dmg = Math.max(0, Number(amount) || 0);
        if (dmg <= 0) return 0;
        const healthBefore = this.health;
        this.lastDamagedAt = this.scene?.time?.now ?? this.lastDamagedAt;
        this.health = Math.max(0, this.health - dmg);
        if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
        this.scene?.eventBus?.emit('leaderDamaged', { leader: this, amount: dmg, healthAfter: this.health, healthBefore });
        if (this.health <= 0) {
            this.alive = false;
            if (this.body) {
                this.body.setVelocity(0, 0);
                this.body.enable = false;
            }
            if (this.shadowSprite) this.shadowSprite.setVisible(false);
            this.scene?.eventBus?.emit('leaderDied', { leader: this, x: this.x, y: this.y });
        }
        return dmg;
    }

    heal(amount) {
        if (!this.alive || this.active === false) return 0;
        const gain = Math.max(0, Number(amount) || 0);
        if (gain <= 0) return 0;
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + gain);
        if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
        this.scene?.eventBus?.emit('leaderHealed', { leader: this, amount: Math.max(0, this.health - before), healthAfter: this.health });
        return Math.max(0, this.health - before);
    }
}
