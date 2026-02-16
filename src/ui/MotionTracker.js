import { CONFIG } from '../config.js';

export class MotionTracker {
    constructor(scene) {
        this.scene = scene;
        this.range = CONFIG.MOTION_TRACKER_RANGE;
        this.active = false;
        this.panelSize = 170;
        this.graphics = scene.add.graphics();
        this.graphics.setScrollFactor(0);
        this.graphics.setDepth(CONFIG.MOTION_TRACKER_DEPTH);
        this.label = scene.add.text(0, 0, 'MOTION TRACKER', {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#8fdfff',
        });
        this.label.setScrollFactor(0);
        this.label.setDepth(CONFIG.MOTION_TRACKER_DEPTH + 1);
        this.label.setVisible(false);
        this.smudgePool = [];
        for (let i = 0; i < 40; i++) {
            const smudge = scene.add.image(-1000, -1000, 'fx_smoke');
            smudge.setVisible(false);
            smudge.setActive(false);
            smudge.setDepth(14);
            smudge.setBlendMode(Phaser.BlendModes.ADD);
            smudge.setTint(0x99e7ff);
            this.smudgePool.push(smudge);
        }
    }

    setState(active) {
        this.active = active === true;
    }

    update(leaderX, leaderY, contacts, time, marines = []) {
        if (!this.active) {
            this.graphics.clear();
            this.label.setVisible(false);
            for (const smudge of this.smudgePool) {
                if (!smudge.active) continue;
                smudge.setActive(false);
                smudge.setVisible(false);
            }
            return;
        }

        this.drawRadarPanel(leaderX, leaderY, contacts, marines, time);

        const tracked = (contacts || []).filter((c) => c && c.tracked);
        const pulse = 0.35 + 0.35 * (1 + Math.sin(time * 0.011));
        let smudgeIndex = 0;
        for (let i = 0; i < tracked.length; i++) {
            const c = tracked[i];
            const blobCount = 3;
            for (let n = 0; n < blobCount; n++) {
                if (smudgeIndex >= this.smudgePool.length) break;
                const smudge = this.smudgePool[smudgeIndex++];
                const driftA = time * 0.002 + i * 0.87 + n * 2.1;
                const driftR = 8 + n * 6;
                smudge.x = c.x + Math.cos(driftA) * driftR;
                smudge.y = c.y + Math.sin(driftA * 1.2) * (driftR * 0.65);
                smudge.setScale(0.22 + n * 0.08 + pulse * 0.18);
                smudge.setAlpha(0.2 + pulse * 0.33 - n * 0.03);
                smudge.setActive(true);
                smudge.setVisible(true);
            }
        }

        for (let i = smudgeIndex; i < this.smudgePool.length; i++) {
            const smudge = this.smudgePool[i];
            if (!smudge.active) continue;
            smudge.setActive(false);
            smudge.setVisible(false);
        }
    }

    drawRadarPanel(leaderX, leaderY, contacts, marines, time) {
        const g = this.graphics;
        const size = this.panelSize;
        const x = CONFIG.GAME_WIDTH - size - 14;
        const y = 12;
        const cx = x + size / 2;
        const cy = y + size / 2;
        const scope = Math.max(220, Math.min(380, this.range * 0.78));
        g.clear();
        g.fillStyle(0x071722, 0.86);
        g.fillRect(x, y, size, size);
        g.lineStyle(1, 0x5caac8, 0.8);
        g.strokeRect(x, y, size, size);
        g.lineStyle(1, 0x2f6b86, 0.45);
        g.lineBetween(cx, y + 6, cx, y + size - 6);
        g.lineBetween(x + 6, cy, x + size - 6, cy);
        this.label.setPosition(x, y - 12);
        this.label.setVisible(true);

        this.drawMapOutline(g, x, y, size, leaderX, leaderY, scope);

        const toPanel = (wx, wy) => ({
            px: cx + ((wx - leaderX) / scope) * (size * 0.46),
            py: cy + ((wy - leaderY) / scope) * (size * 0.46),
        });
        const pulse = 0.55 + 0.45 * Math.sin(time * 0.012);

        for (const m of marines || []) {
            if (!m || m.active === false || m.alive === false) continue;
            const p = toPanel(m.x, m.y);
            if (p.px < x + 2 || p.px > x + size - 2 || p.py < y + 2 || p.py > y + size - 2) continue;
            g.fillStyle(0x93e6ff, 0.9);
            g.fillCircle(p.px, p.py, 2.3);
        }

        for (const c of contacts || []) {
            if (!c) continue;
            const p = toPanel(c.x, c.y);
            if (p.px < x + 2 || p.px > x + size - 2 || p.py < y + 2 || p.py > y + size - 2) continue;
            const alpha = c.tracked ? 0.95 : 0.45 + pulse * 0.3;
            g.fillStyle(0x6ad5ff, alpha);
            g.fillCircle(p.px, p.py, c.tracked ? 2.9 : 2.1);
        }
    }

    drawMapOutline(g, x, y, size, centerX, centerY, scope) {
        const grid = this.scene.pathGrid;
        if (!grid) return;
        const tileCenter = grid.worldToTile(centerX, centerY);
        const radiusTiles = Math.max(2, Math.ceil(scope / CONFIG.TILE_SIZE));
        const tilePx = (size * 0.92) / Math.max(1, radiusTiles * 2 + 1);
        const originX = x + size * 0.04;
        const originY = y + size * 0.04;
        g.fillStyle(0x7ecfff, 0.14);
        for (let ty = tileCenter.y - radiusTiles; ty <= tileCenter.y + radiusTiles; ty++) {
            for (let tx = tileCenter.x - radiusTiles; tx <= tileCenter.x + radiusTiles; tx++) {
                if (grid.isWalkable(tx, ty)) continue;
                const lx = tx - (tileCenter.x - radiusTiles);
                const ly = ty - (tileCenter.y - radiusTiles);
                g.fillRect(
                    originX + lx * tilePx,
                    originY + ly * tilePx,
                    Math.max(1, tilePx - 0.3),
                    Math.max(1, tilePx - 0.3)
                );
            }
        }
    }
}
