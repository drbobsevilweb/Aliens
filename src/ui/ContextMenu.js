import { CONFIG } from '../config.js';

export class ContextMenu {
    constructor(scene) {
        this.scene = scene;
        this.container = null;
        this.isOpen = false;
        this._dismissHandler = null;
    }

    show(worldX, worldY, options, onSelect) {
        this.hide();

        const ITEM_WIDTH = 140;
        const ITEM_HEIGHT = 28;
        const PADDING = 2;
        const FONT_SIZE = 14;
        const MENU_MARGIN = 8;

        // Position menu to the right of the door, or left if near screen edge
        const cam = this.scene.cameras.main;
        const screenX = worldX - cam.scrollX;
        const offsetX = (screenX + ITEM_WIDTH + CONFIG.TILE_SIZE > cam.width)
            ? -(ITEM_WIDTH + MENU_MARGIN)
            : CONFIG.TILE_SIZE + MENU_MARGIN;

        // Vertically center on the click point, clamped to camera
        const menuTotalHeight = options.length * (ITEM_HEIGHT + PADDING) - PADDING;
        const screenY = worldY - cam.scrollY;
        let offsetY = -menuTotalHeight / 2;
        if (screenY + offsetY < 0) offsetY = -screenY;
        if (screenY + offsetY + menuTotalHeight > cam.height) {
            offsetY = cam.height - screenY - menuTotalHeight;
        }

        this.container = this.scene.add.container(worldX + offsetX, worldY + offsetY);
        this.container.setDepth(100);
        this.isOpen = true;

        options.forEach((opt, index) => {
            const yOff = index * (ITEM_HEIGHT + PADDING);

            const bg = this.scene.add.rectangle(
                ITEM_WIDTH / 2, yOff + ITEM_HEIGHT / 2,
                ITEM_WIDTH, ITEM_HEIGHT,
                0x222222, 0.9
            );
            bg.setStrokeStyle(1, 0x666666);
            bg.setInteractive({ useHandCursor: true });

            const label = this.scene.add.text(10, yOff + 5, opt.label, {
                fontSize: `${FONT_SIZE}px`,
                fontFamily: 'monospace',
                color: '#ffffff',
            });

            bg.on('pointerover', () => bg.setFillStyle(0x444444, 0.95));
            bg.on('pointerout', () => bg.setFillStyle(0x222222, 0.9));

            bg.on('pointerdown', (pointer) => {
                if (pointer.leftButtonDown()) {
                    const action = opt.action;
                    this.hide();
                    if (onSelect) onSelect(action);
                }
            });

            this.container.add([bg, label]);
        });

        // Dismiss on any click outside menu items (delayed to avoid self-dismiss)
        this.scene.time.delayedCall(50, () => {
            if (!this.isOpen) return;
            this._dismissHandler = () => {
                if (this.isOpen) this.hide();
            };
            this.scene.input.on('pointerdown', this._dismissHandler);
        });
    }

    hide() {
        if (this._dismissHandler) {
            this.scene.input.off('pointerdown', this._dismissHandler);
            this._dismissHandler = null;
        }
        if (this.container) {
            this.container.destroy();
            this.container = null;
        }
        this.isOpen = false;
    }
}
