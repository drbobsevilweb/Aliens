import { CONFIG } from '../config.js';

const HUD_FONT = '"Share Tech Mono", "Consolas", monospace';
const FRAME_COLOR = 0x4aa4d8;
const FRAME_INSET = 20;
const FRAME_THICKNESS = 2;

/**
 * CRT-style scanline border frame 20px from screen edges.
 * Includes technical rectangles and section markers for military HUD aesthetic.
 */
export class CRTFrame {
    constructor(scene) {
        this.scene = scene;
        this.container = scene.add.container(0, 0);
        this.container.setScrollFactor(0);
        this.container.setDepth(198);

        this.graphics = scene.add.graphics();
        this.container.add(this.graphics);

        this.draw();
    }

    draw() {
        const g = this.graphics;
        const W = CONFIG.GAME_WIDTH;
        const H = CONFIG.GAME_HEIGHT;
        const I = FRAME_INSET;
        const T = FRAME_THICKNESS;

        g.clear();

        // Main border rectangle — 2px thick, 20px from each edge
        g.lineStyle(T, FRAME_COLOR, 0.55);
        g.strokeRect(I, I, W - I * 2, H - I * 2);

        // Inner thin hairline
        g.lineStyle(1, FRAME_COLOR, 0.18);
        g.strokeRect(I + 4, I + 4, W - I * 2 - 8, H - I * 2 - 8);

        // Scanline pattern across entire border band
        g.lineStyle(1, 0x000000, 0.08);
        for (let sy = I; sy < H - I; sy += 3) {
            // Left band
            g.lineBetween(0, sy, I + 6, sy);
            // Right band
            g.lineBetween(W - I - 6, sy, W, sy);
        }
        for (let sx = I; sx < W - I; sx += 3) {
            // Top band
            g.lineBetween(sx, 0, sx, I + 6);
            // Bottom band
            g.lineBetween(sx, H - I - 6, sx, H);
        }

        // Corner bracket marks — technical look
        const bracketLen = 28;
        const bracketAlpha = 0.6;
        g.lineStyle(T, FRAME_COLOR, bracketAlpha);

        // Top-left corner brackets
        g.lineBetween(I - 6, I, I + bracketLen, I);
        g.lineBetween(I, I - 6, I, I + bracketLen);

        // Top-right corner brackets
        g.lineBetween(W - I + 6, I, W - I - bracketLen, I);
        g.lineBetween(W - I, I - 6, W - I, I + bracketLen);

        // Bottom-left corner brackets
        g.lineBetween(I - 6, H - I, I + bracketLen, H - I);
        g.lineBetween(I, H - I + 6, I, H - I - bracketLen);

        // Bottom-right corner brackets
        g.lineBetween(W - I + 6, H - I, W - I - bracketLen, H - I);
        g.lineBetween(W - I, H - I + 6, W - I, H - I - bracketLen);

        // Technical tick marks along top edge
        g.lineStyle(1, FRAME_COLOR, 0.3);
        for (let x = I + 40; x < W - I - 40; x += 30) {
            const tickH = (x % 90 === I % 90) ? 6 : 3;
            g.lineBetween(x, I, x, I - tickH);
        }

        // Technical tick marks along bottom edge
        for (let x = I + 40; x < W - I - 40; x += 30) {
            const tickH = (x % 90 === I % 90) ? 6 : 3;
            g.lineBetween(x, H - I, x, H - I + tickH);
        }

        // Technical section rectangles — small outlined boxes for military look
        // Top-left section box
        this._drawSectionBox(g, I + 4, I - 10, 52, 8, 'SYS-4A');
        // Top-right section box
        this._drawSectionBox(g, W - I - 56, I - 10, 52, 8, 'COM-7B');
        // Bottom-left section box
        this._drawSectionBox(g, I + 4, H - I + 2, 52, 8, 'TAC-2C');
        // Bottom-right section box
        this._drawSectionBox(g, W - I - 56, H - I + 2, 52, 8, 'NAV-9D');

        // Side section markers
        this._drawSideMarker(g, I - 10, I + 60, 'left');
        this._drawSideMarker(g, I - 10, H - I - 80, 'left');
        this._drawSideMarker(g, W - I + 2, I + 60, 'right');
        this._drawSideMarker(g, W - I + 2, H - I - 80, 'right');

        // Horizontal divider lines across top between HUD columns
        g.lineStyle(1, FRAME_COLOR, 0.15);
        g.lineBetween(I, I + 36, I + 270, I + 36);
        g.lineBetween(W - I - 200, I + 36, W - I, I + 36);

        // Bottom horizontal technical lines
        g.lineBetween(I, H - I - 36, I + 180, H - I - 36);
        g.lineBetween(W - I - 220, H - I - 36, W - I, H - I - 36);

        // Add section labels
        this._addLabel('USCM TACTICAL', I + 8, I + 6, 7, 0.35);
        this._addLabel('FIRE TEAM ALPHA', W - I - 8, I + 6, 7, 0.35, 1);

        // Scanlines are drawn per-HUD-card only (not over gameplay)
    }

    _drawSectionBox(g, x, y, w, h, label) {
        g.lineStyle(1, FRAME_COLOR, 0.35);
        g.strokeRect(x, y, w, h);
        g.fillStyle(0x010810, 0.6);
        g.fillRect(x + 1, y + 1, w - 2, h - 2);

        const text = this.scene.add.text(x + w / 2, y + h / 2, label, {
            fontSize: '6px',
            fontFamily: HUD_FONT,
            color: '#4aa4d8',
        }).setOrigin(0.5).setAlpha(0.45);
        this.container.add(text);
    }

    _drawSideMarker(g, x, y, side) {
        const w = 8;
        const h = 20;
        g.lineStyle(1, FRAME_COLOR, 0.25);
        g.strokeRect(x, y, w, h);
        // Small filled indicator
        g.fillStyle(FRAME_COLOR, 0.15);
        g.fillRect(x + 1, y + 1, w - 2, 4);
    }

    _addLabel(text, x, y, size, alpha, originX = 0) {
        const label = this.scene.add.text(x, y, text, {
            fontSize: `${size}px`,
            fontFamily: HUD_FONT,
            color: '#4aa4d8',
            shadow: { offsetX: 0, offsetY: 0, color: '#1a5588', blur: 3, stroke: true, fill: true },
        }).setOrigin(originX, 0).setAlpha(alpha);
        this.container.add(label);
    }

    destroy() {
        if (this.container) this.container.destroy();
    }
}
