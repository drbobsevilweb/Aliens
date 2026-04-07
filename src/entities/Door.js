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

        // Keep door visuals above wall and wall-face overlays so they read as mounted fixtures.
        this.setDepth(6.2);
        this.setInteractive();
        this.damageStage = 0;
        this.destroyedStyle = 'generic';
        this.crackOverlay = scene.add.graphics();
        this.crackOverlay.setDepth(6.35);
        this.crackOverlay.setVisible(false);
    }

    applyOrientationPlacement(orientation = 'vertical') {
        this.orientation = String(orientation) === 'horizontal' ? 'horizontal' : 'vertical';
        this.setRotation(this.orientation === 'vertical' ? Math.PI * 0.5 : 0);
        if (this.body && typeof this.body.updateFromGameObject === 'function') {
            this.body.updateFromGameObject();
        }
        this._ensureFullTileBody();
    }

    open() {
        this.setTexture('door_open');
        this.body.enable = false;
        this.body.checkCollision.none = true;
        this.setDamageStage(0);
    }

    close() {
        this.setTexture('door_closed');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
        this._ensureFullTileBody();
    }

    showLocked() {
        this.setTexture('door_locked');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
        this._ensureFullTileBody();
    }

    showWelded() {
        this.setTexture('door_welded');
        this.body.enable = true;
        this.body.checkCollision.none = false;
        this.body.updateFromGameObject();
        this._ensureFullTileBody();
        this.setDamageStage(0);
    }

    showDestroyed(style = 'generic') {
        this.destroyedStyle = String(style || 'generic');
        this.setTexture('door_destroyed');
        this.body.enable = false;
        this.body.checkCollision.none = true;
        this.damageStage = 0;
        this.renderDestroyedStyle(this.destroyedStyle);
    }

    setDamageStage(stage = 0) {
        const next = Math.max(0, Math.min(3, Math.floor(stage)));
        if (next === this.damageStage && ((next === 0 && !this.crackOverlay.visible) || next > 0)) return;
        const prev = this.damageStage;
        this.damageStage = next;
        this.renderDamageCracks(next);

        // Shader pipelines removed — damage shown via crack overlay only

        if (next > prev && this.scene && typeof this.scene.addSparkLight === 'function') {
            this.scene.addSparkLight(this.x, this.y, this.scene.time?.now || 0, {
                rangeMin: 16 + next * 2,
                rangeBoost: 28 + next * 6,
                intensityMin: 0.4 + next * 0.08,
                intensityBoost: 0.32 + next * 0.05,
                duration: 48 + next * 24,
                color: next >= 3 ? 0xff5a3a : 0xffc388,
            });
        }
    }

    renderDamageCracks(stage) {
        if (!this.crackOverlay) return;
        this.crackOverlay.clear();
        if (stage <= 0) {
            this.crackOverlay.setVisible(false);
            return;
        }
        const color = stage === 1 ? 0xffd066 : (stage === 2 ? 0xff8a3d : 0xff3f2a);
        const alpha = stage === 1 ? 0.78 : (stage === 2 ? 0.88 : 0.96);
        const x0 = this.x - this.displayWidth * 0.5;
        const y0 = this.y - this.displayHeight * 0.5;
        this.crackOverlay.lineStyle(1, color, alpha);
        this.crackOverlay.beginPath();
        this.crackOverlay.moveTo(x0 + 5, y0 + 7);
        this.crackOverlay.lineTo(x0 + 13, y0 + 14);
        this.crackOverlay.lineTo(x0 + 10, y0 + 22);
        this.crackOverlay.strokePath();
        this.crackOverlay.beginPath();
        this.crackOverlay.moveTo(x0 + 3, y0 + 3);
        this.crackOverlay.lineTo(x0 + 7, y0 + 5);
        this.crackOverlay.lineTo(x0 + 6, y0 + 11);
        this.crackOverlay.strokePath();
        this.crackOverlay.beginPath();
        this.crackOverlay.moveTo(x0 + this.displayWidth - 3, y0 + 4);
        this.crackOverlay.lineTo(x0 + this.displayWidth - 8, y0 + 8);
        this.crackOverlay.lineTo(x0 + this.displayWidth - 6, y0 + 13);
        this.crackOverlay.strokePath();
        if (stage >= 2) {
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 23, y0 + 6);
            this.crackOverlay.lineTo(x0 + 18, y0 + 12);
            this.crackOverlay.lineTo(x0 + 22, y0 + 19);
            this.crackOverlay.lineTo(x0 + 17, y0 + 25);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 4, y0 + this.displayHeight - 5);
            this.crackOverlay.lineTo(x0 + 10, y0 + this.displayHeight - 9);
            this.crackOverlay.lineTo(x0 + 15, y0 + this.displayHeight - 4);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + this.displayWidth - 4, y0 + this.displayHeight - 6);
            this.crackOverlay.lineTo(x0 + this.displayWidth - 11, y0 + this.displayHeight - 11);
            this.crackOverlay.lineTo(x0 + this.displayWidth - 15, y0 + this.displayHeight - 6);
            this.crackOverlay.strokePath();
        }
        if (stage >= 3) {
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 7, y0 + 26);
            this.crackOverlay.lineTo(x0 + 15, y0 + 18);
            this.crackOverlay.lineTo(x0 + 26, y0 + 23);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 2, y0 + 15);
            this.crackOverlay.lineTo(x0 + 8, y0 + 18);
            this.crackOverlay.lineTo(x0 + 6, y0 + 24);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + this.displayWidth - 2, y0 + 13);
            this.crackOverlay.lineTo(x0 + this.displayWidth - 9, y0 + 17);
            this.crackOverlay.lineTo(x0 + this.displayWidth - 7, y0 + 24);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 12, y0 + 2);
            this.crackOverlay.lineTo(x0 + 17, y0 + 7);
            this.crackOverlay.lineTo(x0 + 23, y0 + 3);
            this.crackOverlay.strokePath();
            this.crackOverlay.fillStyle(color, 0.32);
            this.crackOverlay.fillCircle(x0 + 15, y0 + 18, 1.4);
            this.crackOverlay.fillCircle(x0 + 21, y0 + 12, 1.2);
            this.crackOverlay.fillCircle(x0 + 8, y0 + 22, 1.1);
            this.crackOverlay.fillCircle(x0 + this.displayWidth - 9, y0 + 21, 1.1);
        }
        this.crackOverlay.setVisible(true);
    }

    _ensureFullTileBody() {
        if (!this.body) return;
        const ts = CONFIG.TILE_SIZE;
        if (this.body.width >= ts && this.body.height >= ts) return;
        // Visual scaling narrows the sprite for aesthetics, but the physics
        // body must cover the full tile to prevent aliens slipping through
        // gaps at the edges of scaled-down door sprites.
        const tree = this.body.world?.staticTree;
        if (tree) tree.remove(this.body);
        const dw = ts - this.body.width;
        const dh = ts - this.body.height;
        this.body.position.x -= dw / 2;
        this.body.position.y -= dh / 2;
        this.body.width = ts;
        this.body.height = ts;
        this.body.halfWidth = Math.floor(ts / 2);
        this.body.halfHeight = Math.floor(ts / 2);
        this.body.updateCenter();
        if (tree) tree.insert(this.body);
    }

    renderDestroyedStyle(style = 'generic') {
        if (!this.crackOverlay) return;
        this.crackOverlay.clear();
        const x0 = this.x - this.displayWidth * 0.5;
        const y0 = this.y - this.displayHeight * 0.5;
        const w = this.displayWidth;
        const h = this.displayHeight;
        const midX = x0 + w * 0.5;
        const midY = y0 + h * 0.5;

        if (style === 'bullet') {
            // Gunfire breach: panel split with sharp crack seams and exposed edge glow.
            this.crackOverlay.fillStyle(0x1f1712, 0.72);
            this.crackOverlay.fillRect(x0 + 2, y0 + h * 0.34, w - 4, h * 0.24);
            this.crackOverlay.lineStyle(1.4, 0xffd39a, 0.85);
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(midX - 9, y0 + 3);
            this.crackOverlay.lineTo(midX - 2, y0 + h * 0.24);
            this.crackOverlay.lineTo(midX + 4, y0 + h * 0.45);
            this.crackOverlay.lineTo(midX - 3, y0 + h * 0.66);
            this.crackOverlay.lineTo(midX + 8, y0 + h - 3);
            this.crackOverlay.strokePath();
            this.crackOverlay.lineStyle(1.1, 0xffa96f, 0.74);
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 3, y0 + h * 0.54);
            this.crackOverlay.lineTo(midX - 6, y0 + h * 0.5);
            this.crackOverlay.lineTo(x0 + w - 4, y0 + h * 0.6);
            this.crackOverlay.strokePath();
            this.crackOverlay.fillStyle(0xffb16b, 0.26);
            this.crackOverlay.fillCircle(midX + 1, y0 + h * 0.48, 2.3);
        } else if (style === 'enemy') {
            // Alien breach: crumpled inward plate folds.
            this.crackOverlay.fillStyle(0x11171d, 0.6);
            this.crackOverlay.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
            this.crackOverlay.lineStyle(1.5, 0x7d8d99, 0.82);
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 3, y0 + 5);
            this.crackOverlay.lineTo(midX - 3, midY - 2);
            this.crackOverlay.lineTo(x0 + 4, y0 + h - 4);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + w - 3, y0 + 4);
            this.crackOverlay.lineTo(midX + 4, midY + 1);
            this.crackOverlay.lineTo(x0 + w - 5, y0 + h - 4);
            this.crackOverlay.strokePath();
            this.crackOverlay.lineStyle(1.1, 0x4f5d68, 0.9);
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + 6, y0 + h * 0.28);
            this.crackOverlay.lineTo(midX + 1, y0 + h * 0.5);
            this.crackOverlay.lineTo(x0 + 6, y0 + h * 0.74);
            this.crackOverlay.strokePath();
            this.crackOverlay.beginPath();
            this.crackOverlay.moveTo(x0 + w - 6, y0 + h * 0.24);
            this.crackOverlay.lineTo(midX - 1, y0 + h * 0.5);
            this.crackOverlay.lineTo(x0 + w - 7, y0 + h * 0.78);
            this.crackOverlay.strokePath();
            this.crackOverlay.fillStyle(0x8ea0ad, 0.22);
            this.crackOverlay.fillTriangle(midX - 6, midY - 3, midX + 1, midY + 1, midX - 3, midY + 8);
            this.crackOverlay.fillTriangle(midX + 6, midY + 2, midX - 1, midY - 1, midX + 3, midY + 9);
        } else {
            this.crackOverlay.fillStyle(0x30251e, 0.58);
            this.crackOverlay.fillRect(x0 + 2, y0 + h * 0.42, w - 4, h * 0.2);
        }
        this.crackOverlay.setVisible(true);
    }

    destroy(fromScene) {
        if (this.crackOverlay) {
            this.crackOverlay.destroy();
            this.crackOverlay = null;
        }
        super.destroy(fromScene);
    }
}
