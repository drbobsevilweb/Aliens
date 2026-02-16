import { CONFIG } from '../config.js';

export class Door extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, tileX, tileY, doorGroup) {
        const worldX = tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        const worldY = tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
        super(scene, worldX, worldY, 'door_closed');

        this.tileX = tileX;
        this.tileY = tileY;
        this.doorGroup = doorGroup;

        scene.add.existing(this);
        scene.physics.add.existing(this, true); // static body

        this.setDepth(5);
        this.setInteractive();
    }

    open() {
        this.setTexture('door_open');
        this.body.enable = false;
        this.body.checkCollision.none = true;
    }

    close() {
        this.setTexture('door_closed');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
    }

    showLocked() {
        this.setTexture('door_locked');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
    }

    showWelded() {
        this.setTexture('door_welded');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
    }
}
