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

        // Path state
        this.currentPath = null;
        this.pathIndex = 0;
    }

    facePosition(worldX, worldY) {
        this.rotation = Phaser.Math.Angle.Between(this.x, this.y, worldX, worldY);
    }
}
