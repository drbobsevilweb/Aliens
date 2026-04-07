import { CONFIG } from '../config.js';

export class ContextMenu {
    constructor(scene) {
        this.scene = scene;
        this.container = null;
        this.isOpen = false;
        this._dismissHandler = null;
        this._dismissDelayTimer = null;
        this._bgItems = null;
        this.meta = null;
        this.bounds = null;
    }

    show(worldX, worldY, options, onSelect, meta = null) {
        this.hide();

        const ITEM_WIDTH = 140;
        const ITEM_HEIGHT = 28;
        const PADDING = 2;
        const FONT_SIZE = 14;
        const MENU_MARGIN = 8;

        const cam = this.scene.cameras.main;
        const menuTotalHeight = options.length * (ITEM_HEIGHT + PADDING) - PADDING;

        let menuX = worldX + CONFIG.TILE_SIZE + MENU_MARGIN;
        let menuY = worldY - menuTotalHeight / 2;
        const anchorBounds = meta?.anchorBounds;
        if (meta?.kind === 'door_hover' && anchorBounds) {
            const gap = 3;
            const rightX = Number(anchorBounds.maxX) + gap;
            const leftX = Number(anchorBounds.minX) - ITEM_WIDTH - gap;
            const camLeft = cam.scrollX;
            const camRight = cam.scrollX + cam.width;
            menuX = (rightX + ITEM_WIDTH <= camRight - 4) ? rightX : leftX;
            menuY = ((Number(anchorBounds.minY) + Number(anchorBounds.maxY)) * 0.5) - (menuTotalHeight * 0.5);
            if (!Number.isFinite(menuX)) menuX = worldX + CONFIG.TILE_SIZE + MENU_MARGIN;
            if (!Number.isFinite(menuY)) menuY = worldY - menuTotalHeight / 2;
            menuX = Phaser.Math.Clamp(menuX, camLeft + 2, camRight - ITEM_WIDTH - 2);
        } else {
            const screenX = worldX - cam.scrollX;
            const offsetX = (screenX + ITEM_WIDTH + CONFIG.TILE_SIZE > cam.width)
                ? -(ITEM_WIDTH + MENU_MARGIN)
                : CONFIG.TILE_SIZE + MENU_MARGIN;
            menuX = worldX + offsetX;
        }

        const camTop = cam.scrollY;
        const camBottom = cam.scrollY + cam.height;
        if (menuY < camTop) menuY = camTop;
        if (menuY + menuTotalHeight > camBottom) {
            menuY = camBottom - menuTotalHeight;
        }

        this.container = this.scene.add.container(menuX, menuY);
        this.container.setDepth(195);
        this.container.setAlpha(0);
        this.isOpen = true;
        this.meta = meta || null;
        this.bounds = {
            x: this.container.x,
            y: this.container.y,
            width: ITEM_WIDTH,
            height: menuTotalHeight,
        };

        this._bgItems = [];

        options.forEach((opt, index) => {
            const yOff = index * (ITEM_HEIGHT + PADDING);

            const bg = this.scene.add.rectangle(
                ITEM_WIDTH / 2, yOff + ITEM_HEIGHT / 2,
                ITEM_WIDTH, ITEM_HEIGHT,
                0x050a0f, 0.95
            );
            bg.setStrokeStyle(1, 0x45b8ff, 0.6);
            bg.setInteractive({ useHandCursor: true });

            const label = this.scene.add.text(10, yOff + 6, `> [ ${opt.label.toUpperCase()} ]`, {
                fontSize: `${FONT_SIZE - 2}px`,
                fontFamily: '"Share Tech Mono", "Consolas", monospace',
                color: '#7ecfff',
                fontStyle: 'bold'
            });

            bg.on('pointerover', () => {
                bg.setFillStyle(0x45b8ff, 0.2);
                bg.setStrokeStyle(1.5, 0x45b8ff, 1);
                label.setColor('#ffffff');
            });
            bg.on('pointerout', () => {
                bg.setFillStyle(0x050a0f, 0.95);
                bg.setStrokeStyle(1, 0x45b8ff, 0.6);
                label.setColor('#7ecfff');
            });

            bg.on('pointerdown', (pointer) => {
                const isActionInput = pointer.leftButtonDown() // Was rightButtonDown
                    || (pointer?.event?.button === 0); // Was 2 (Right)
                if (!isActionInput) return;
                if (typeof this.scene.playUiClickSfx === 'function') this.scene.playUiClickSfx(false);

                const action = opt.action;
                this.hide();
                if (this.scene.inputHandler) {
                    this.scene.inputHandler.consumeMenuClick();
                }
                if (onSelect) onSelect(action);
            });

            this.container.add([bg, label]);
            this._bgItems.push(bg);
        });

        // --- Interference intro animation (200ms) ---
        const interferenceSteps = [
            { delay: 0,   alpha: 0.6,  scaleX: 1.08, scaleY: 0.7,  strokeColor: 0x00aaff, caAlpha: 0.35, caOff: 4 },
            { delay: 35,  alpha: 0.15, scaleX: 0.92, scaleY: 0.85, strokeColor: 0xff2244, caAlpha: 0.28, caOff: 3 },
            { delay: 70,  alpha: 0.8,  scaleX: 1.04, scaleY: 0.9,  strokeColor: 0x00ff88, caAlpha: 0.22, caOff: 2.5 },
            { delay: 105, alpha: 0.3,  scaleX: 0.96, scaleY: 0.95, strokeColor: 0x00aaff, caAlpha: 0.18, caOff: 2 },
            { delay: 140, alpha: 0.7,  scaleX: 1.02, scaleY: 0.98, strokeColor: 0x6f8aaf, caAlpha: 0.14, caOff: 1.5 },
        ];

        for (const step of interferenceSteps) {
            this.scene.time.delayedCall(step.delay, () => {
                if (!this.isOpen || !this.container) return;
                this.container.setAlpha(step.alpha);
                this.container.setScale(step.scaleX, step.scaleY);
                // Flash border color on bg items during interference
                if (this._bgItems) {
                    for (const bg of this._bgItems) {
                        bg.setStrokeStyle(1.5, step.strokeColor, 0.7);
                    }
                }
            });
        }

        // Settle to final state after interference
        this.scene.time.delayedCall(200, () => {
            if (!this.isOpen || !this.container) return;
            // Restore normal border color
            if (this._bgItems) {
                for (const bg of this._bgItems) {
                    bg.setStrokeStyle(1, 0x45b8ff, 0.6);
                }
            }
            this.scene.tweens.add({
                targets: this.container,
                scaleX: 1,
                scaleY: 1,
                alpha: 1,
                duration: 100,
                ease: 'Cubic.Out',
            });
        });

        // Dismiss on any click outside menu items (delayed past interference)
        this._dismissDelayTimer = this.scene.time.delayedCall(220, () => {
            this._dismissDelayTimer = null;
            if (!this.isOpen) return;
            this._dismissHandler = () => {
                if (this.isOpen) this.hide();
            };
            this.scene.input.on('pointerdown', this._dismissHandler);
        });
    }

    hide() {
        if (this._dismissDelayTimer) {
            this._dismissDelayTimer.remove();
            this._dismissDelayTimer = null;
        }
        if (this._dismissHandler) {
            this.scene.input.off('pointerdown', this._dismissHandler);
            this._dismissHandler = null;
        }
        this._bgItems = null;
        if (this.container) {
            this.container.destroy();
            this.container = null;
        }
        this.isOpen = false;
        this.meta = null;
        this.bounds = null;
    }

    containsWorldPoint(worldX, worldY, padding = 0) {
        if (!this.isOpen || !this.bounds) return false;
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
        const p = Math.max(0, Number(padding) || 0);
        return (
            worldX >= (this.bounds.x - p)
            && worldX <= (this.bounds.x + this.bounds.width + p)
            && worldY >= (this.bounds.y - p)
            && worldY <= (this.bounds.y + this.bounds.height + p)
        );
    }
}
