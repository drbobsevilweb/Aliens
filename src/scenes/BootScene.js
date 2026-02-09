import { CONFIG } from '../config.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        this.generateTileset();
        this.generateLeaderTexture();
        this.generateBulletTexture();
        this.generateDoorTextures();
        this.scene.start('GameScene');
    }

    generateTileset() {
        // 2-tile tileset: index 0 = floor, index 1 = wall
        const size = CONFIG.TILE_SIZE;
        const g = this.add.graphics();

        // Floor tile (index 0) at x=0
        g.fillStyle(CONFIG.FLOOR_COLOR, 1);
        g.fillRect(0, 0, size, size);
        g.lineStyle(1, 0x444444, 0.3);
        g.strokeRect(0, 0, size, size);

        // Wall tile (index 1) at x=64
        g.fillStyle(CONFIG.WALL_COLOR, 1);
        g.fillRect(size, 0, size, size);
        g.lineStyle(2, 0x664422, 1);
        g.strokeRect(size, 0, size, size);
        // Inner detail on wall
        g.lineStyle(1, 0xaa8866, 0.5);
        g.strokeRect(size + 4, 4, size - 8, size - 8);

        g.generateTexture('tileset', size * 2, size);
        g.destroy();
    }

    generateLeaderTexture() {
        const size = CONFIG.LEADER_SIZE;
        const g = this.add.graphics();

        // Body
        g.fillStyle(CONFIG.LEADER_COLOR, 1);
        g.fillRect(0, 0, size, size);

        // Direction indicator (triangle "nose" on the right side)
        g.fillStyle(0xffffff, 0.9);
        g.fillTriangle(
            size, size / 2,           // tip (right center)
            size - 10, size / 2 - 6,  // top-left of triangle
            size - 10, size / 2 + 6   // bottom-left of triangle
        );

        g.generateTexture('leader', size, size);
        g.destroy();
    }

    generateBulletTexture() {
        const r = CONFIG.BULLET_SIZE;
        const g = this.add.graphics();

        g.fillStyle(CONFIG.BULLET_COLOR, 1);
        g.fillCircle(r, r, r);

        g.generateTexture('bullet', r * 2, r * 2);
        g.destroy();
    }

    generateDoorTextures() {
        const size = CONFIG.TILE_SIZE;

        // Closed door — red with horizontal bars
        const gc = this.add.graphics();
        gc.fillStyle(CONFIG.DOOR_COLOR_CLOSED, 1);
        gc.fillRect(0, 0, size, size);
        gc.lineStyle(2, CONFIG.DOOR_BORDER_CLOSED, 1);
        gc.strokeRect(0, 0, size, size);
        gc.lineStyle(2, CONFIG.DOOR_BORDER_CLOSED, 0.7);
        gc.lineBetween(4, size * 0.25, size - 4, size * 0.25);
        gc.lineBetween(4, size * 0.50, size - 4, size * 0.50);
        gc.lineBetween(4, size * 0.75, size - 4, size * 0.75);
        gc.generateTexture('door_closed', size, size);
        gc.destroy();

        // Open door — floor background with thin green strips on edges
        const go = this.add.graphics();
        go.fillStyle(CONFIG.FLOOR_COLOR, 1);
        go.fillRect(0, 0, size, size);
        go.fillStyle(CONFIG.DOOR_COLOR_OPEN, 1);
        go.fillRect(0, 0, 6, size);
        go.fillRect(size - 6, 0, 6, size);
        go.lineStyle(1, CONFIG.DOOR_BORDER_OPEN, 0.5);
        go.strokeRect(0, 0, size, size);
        go.generateTexture('door_open', size, size);
        go.destroy();

        // Locked door — amber with lock icon
        const gl = this.add.graphics();
        gl.fillStyle(CONFIG.DOOR_COLOR_LOCKED, 1);
        gl.fillRect(0, 0, size, size);
        gl.lineStyle(2, CONFIG.DOOR_BORDER_LOCKED, 1);
        gl.strokeRect(0, 0, size, size);
        gl.fillStyle(CONFIG.DOOR_BORDER_LOCKED, 1);
        gl.fillRect(size * 0.35, size * 0.3, size * 0.3, size * 0.35);
        gl.fillRect(size * 0.4, size * 0.2, size * 0.2, size * 0.15);
        gl.generateTexture('door_locked', size, size);
        gl.destroy();

        // Welded door — steel blue with X weld marks
        const gw = this.add.graphics();
        gw.fillStyle(CONFIG.DOOR_COLOR_WELDED, 1);
        gw.fillRect(0, 0, size, size);
        gw.lineStyle(2, CONFIG.DOOR_BORDER_WELDED, 1);
        gw.strokeRect(0, 0, size, size);
        gw.lineStyle(3, CONFIG.DOOR_WELD_MARK, 0.8);
        gw.lineBetween(8, 8, size - 8, size - 8);
        gw.lineBetween(size - 8, 8, 8, size - 8);
        gw.generateTexture('door_welded', size, size);
        gw.destroy();
    }
}
