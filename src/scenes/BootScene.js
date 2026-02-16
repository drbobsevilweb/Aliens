import { CONFIG } from '../config.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        this.generateTileset();
        this.generateLeaderTexture();
        this.generateMarineTextures();
        this.generateAlienTextures();
        this.generateBulletTextures();
        this.generateFxTextures();
        this.generateWeaponIcons();
        this.generateDoorTextures();
        const params = new URLSearchParams(window.location.search);
        const missionId = params.get('mission') || undefined;
        this.scene.start('GameScene', { missionId });
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

    generateMarineTextures() {
        const size = CONFIG.LEADER_SIZE;
        const defs = [
            { key: 'tech', color: 0x44aaff },
            { key: 'medic', color: 0x55cc66 },
            { key: 'heavy', color: 0xcc9944 },
        ];

        for (const def of defs) {
            const g = this.add.graphics();
            g.fillStyle(def.color, 1);
            g.fillRect(0, 0, size, size);
            g.lineStyle(2, 0x111111, 0.8);
            g.strokeRect(0, 0, size, size);
            g.fillStyle(0xffffff, 0.85);
            g.fillTriangle(size, size / 2, size - 10, size / 2 - 6, size - 10, size / 2 + 6);
            g.generateTexture(`marine_${def.key}`, size, size);
            g.destroy();
        }
    }

    generateAlienTextures() {
        const defs = [
            { key: 'warrior', color: 0x4a4f56 },
            { key: 'drone', color: 0x3f464d },
            { key: 'queen_lesser', color: 0x565b63 },
            { key: 'queen', color: 0x5f636b },
            { key: 'runner', color: 0x484d54 },
            { key: 'spitter', color: 0x4c5158 },
            { key: 'facehugger', color: 0x5a5e66 },
            { key: 'egg', color: 0x887744 },
        ];

        for (const def of defs) {
            const g = this.add.graphics();
            if (def.key === 'egg') {
                g.fillStyle(0x665533, 1);
                g.fillEllipse(12, 16, 18, 24);
                g.fillEllipse(20, 16, 18, 24);
                g.fillStyle(0x887744, 0.9);
                g.fillEllipse(16, 19, 18, 12);
                g.lineStyle(1, 0x332211, 0.8);
                g.strokeEllipse(16, 16, 22, 26);
                g.generateTexture('alien_egg', 32, 32);
            } else {
                // Dark oblong xenomorph silhouette with head dome/ridges
                g.fillStyle(def.color, 1);
                g.fillEllipse(16, 18, 18, 24);
                g.fillEllipse(18, 12, 16, 12);
                g.fillStyle(0x2f343a, 0.95);
                g.fillRect(10, 19, 14, 7);
                g.fillStyle(0x22262b, 0.85);
                g.fillEllipse(19, 10, 11, 7);
                g.lineStyle(1, 0x161a1f, 0.9);
                g.lineBetween(8, 18, 24, 18);
                g.lineBetween(9, 22, 23, 22);
                g.fillStyle(0x89a79a, 0.45);
                g.fillCircle(21, 12, 1.6);
                g.generateTexture(`alien_${def.key}`, 32, 32);
            }
            g.destroy();
        }
    }

    generateBulletTextures() {
        // Legacy 'bullet' texture for pool initialization
        const g0 = this.add.graphics();
        g0.fillStyle(0xffff00, 1);
        g0.fillCircle(6, 6, 6);
        g0.generateTexture('bullet', 12, 12);
        g0.destroy();

        // Pulse rifle bullet — yellow circle
        const gp = this.add.graphics();
        gp.fillStyle(0xffff00, 1);
        gp.fillCircle(6, 6, 6);
        gp.generateTexture('bullet_pulse', 12, 12);
        gp.destroy();

        // Shotgun pellet — smaller orange circle
        const gs = this.add.graphics();
        gs.fillStyle(0xff8800, 1);
        gs.fillCircle(4, 4, 4);
        gs.generateTexture('bullet_shotgun', 8, 8);
        gs.destroy();

        // Pistol bullet — small blue-white circle
        const gi = this.add.graphics();
        gi.fillStyle(0xccccff, 1);
        gi.fillCircle(4, 4, 4);
        gi.generateTexture('bullet_pistol', 8, 8);
        gi.destroy();

        // Spitter acid projectile
        const ga = this.add.graphics();
        ga.fillStyle(0x66ff88, 0.95);
        ga.fillCircle(5, 5, 5);
        ga.lineStyle(1, 0x225533, 1);
        ga.strokeCircle(5, 5, 5);
        ga.generateTexture('acid_projectile', 10, 10);
        ga.destroy();

        // Medkit pickup
        const gm = this.add.graphics();
        gm.fillStyle(0x33aa33, 1);
        gm.fillRect(0, 0, 18, 18);
        gm.fillStyle(0xffffff, 1);
        gm.fillRect(7, 3, 4, 12);
        gm.fillRect(3, 7, 12, 4);
        gm.lineStyle(1, 0x114411, 1);
        gm.strokeRect(0, 0, 18, 18);
        gm.generateTexture('pickup_medkit', 18, 18);
        gm.destroy();

        // Ammo pickup (generic crate)
        const gc = this.add.graphics();
        gc.fillStyle(0x666688, 1);
        gc.fillRect(0, 0, 18, 14);
        gc.lineStyle(1, 0xaabbee, 1);
        gc.strokeRect(0, 0, 18, 14);
        gc.fillStyle(0xeeeeff, 1);
        gc.fillRect(3, 5, 12, 4);
        gc.generateTexture('pickup_ammo', 18, 14);
        gc.destroy();
    }

    generateFxTextures() {
        // Bright particle dot for sparks/muzzle
        const gd = this.add.graphics();
        gd.fillStyle(0xffffff, 1);
        gd.fillCircle(6, 6, 6);
        gd.generateTexture('fx_dot', 12, 12);
        gd.destroy();

        // Soft smoke puff for acid steam
        const gs = this.add.graphics();
        gs.fillStyle(0xffffff, 0.95);
        gs.fillCircle(16, 16, 12);
        gs.fillStyle(0xffffff, 0.35);
        gs.fillCircle(22, 14, 8);
        gs.generateTexture('fx_smoke', 32, 32);
        gs.destroy();
    }

    generateWeaponIcons() {
        const size = CONFIG.WEAPON_ICON_SIZE;

        // Pulse Rifle icon — long barrel with stock
        const g1 = this.add.graphics();
        g1.fillStyle(0x8888aa, 1);
        g1.fillRect(4, 14, 32, 8);
        g1.fillRect(2, 12, 10, 16);
        g1.fillStyle(0xffff00, 0.7);
        g1.fillRect(34, 16, 4, 4);
        g1.lineStyle(1, 0xaaaacc, 0.8);
        g1.strokeRect(4, 14, 32, 8);
        g1.generateTexture('weapon_icon_pulseRifle', size, size);
        g1.destroy();

        // Shotgun icon — double barrel with wooden stock
        const g2 = this.add.graphics();
        g2.fillStyle(0x996633, 1);
        g2.fillRect(2, 14, 12, 12);
        g2.fillStyle(0x777799, 1);
        g2.fillRect(14, 14, 22, 5);
        g2.fillRect(14, 21, 22, 5);
        g2.lineStyle(1, 0x999999, 0.8);
        g2.strokeRect(14, 14, 22, 12);
        g2.generateTexture('weapon_icon_shotgun', size, size);
        g2.destroy();

        // Pistol icon — small L-shape
        const g3 = this.add.graphics();
        g3.fillStyle(0x666688, 1);
        g3.fillRect(10, 12, 22, 8);
        g3.fillRect(12, 20, 8, 12);
        g3.fillStyle(0x8888aa, 1);
        g3.fillRect(10, 12, 22, 3);
        g3.lineStyle(1, 0x888888, 0.6);
        g3.strokeRect(10, 12, 22, 8);
        g3.generateTexture('weapon_icon_pistol', size, size);
        g3.destroy();
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
