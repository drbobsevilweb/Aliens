import { CONFIG } from '../config.js';

export class TeamLeader extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, tileX, tileY) {
        const worldX = tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        const worldY = tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        super(scene, worldX, worldY, 'leader');

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setSize(CONFIG.LEADER_SIZE - 4, CONFIG.LEADER_SIZE - 4);
        this.body.setCollideWorldBounds(true);
        this.setDepth(10);
        this.turnSpeedRadPerSec = 8.5;
        this.desiredRotation = 0;

        // Path state
        this.currentPath = null;
        this.pathIndex = 0;

        // Health
        this.maxHealth = CONFIG.PLAYER_MAX_HEALTH;
        this.health = CONFIG.PLAYER_START_HEALTH;
        this.lastDamagedAt = -1;
        this.morale = 0;
        this.onHealthChange = null;
    }

    facePosition(worldX, worldY) {
        this.desiredRotation = Phaser.Math.Angle.Between(this.x, this.y, worldX, worldY);
    }

    updateFacing(delta) {
        this.rotation = Phaser.Math.Angle.RotateTo(
            this.rotation,
            this.desiredRotation,
            this.turnSpeedRadPerSec * (delta / 1000)
        );
    }

    takeDamage(amount) {
        const dmg = Math.max(0, Number(amount) || 0);
        if (dmg <= 0) return;
        this.lastDamagedAt = this.scene?.time?.now ?? this.lastDamagedAt;
        this.health = Math.max(0, this.health - dmg);
        if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
        if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
    }
}
