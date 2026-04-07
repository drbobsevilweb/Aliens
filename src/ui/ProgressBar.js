const ACTION_DISPLAY = { weld: 'WELD', unweld: 'UNWELD', hack: 'HACK', lock: 'LOCK' };
const LABEL_FONT = 'SevenSegment, Alarm, "Share Tech Mono", monospace';

export class ProgressBar {
    constructor(scene) {
        this.scene = scene;
        this.graphics = null;
        this.label = null;
        this.worldX = 0;
        this.worldY = 0;
        this.barWidth = 80;
        this.barHeight = 10;
        this.fillColor = 0xff9944;
        this.actionName = '';
    }

    show(worldX, worldY, fillColor, actionName = '') {
        this.hide();
        this.worldX = worldX;
        this.worldY = worldY;
        this.fillColor = fillColor;
        this.actionName = actionName;

        this.graphics = this.scene.add.graphics();
        this.graphics.setDepth(99);

        const displayName = ACTION_DISPLAY[actionName] || actionName.toUpperCase();
        this.label = this.scene.add.text(worldX, worldY - 14, `${displayName} 0%`, {
            fontFamily: LABEL_FONT,
            fontSize: '12px',
            color: '#ff9944',
            stroke: '#3a1500',
            strokeThickness: 3,
            shadow: { color: '#c05500', blur: 6, fill: true },
        });
        this.label.setOrigin(0.5, 1);
        this.label.setDepth(100);

        this.draw(0);
    }

    draw(progress) {
        if (!this.graphics) return;
        const g = this.graphics;
        const x = this.worldX - this.barWidth / 2;
        const y = this.worldY;

        g.clear();

        // CRT-style background
        g.fillStyle(0x010508, 0.92);
        g.fillRect(x, y, this.barWidth, this.barHeight);

        // Fill
        if (progress > 0) {
            const fillWidth = Math.min(progress, 1) * (this.barWidth - 2);
            g.fillStyle(this.fillColor, 0.9);
            g.fillRect(x + 1, y + 1, fillWidth, this.barHeight - 2);
            // Glow highlight on fill top edge
            g.fillStyle(0xffffff, 0.12);
            g.fillRect(x + 1, y + 1, fillWidth, 1);
        }

        // Scanlines
        g.lineStyle(1, 0x000000, 0.08);
        for (let sy = y; sy < y + this.barHeight; sy += 3) {
            g.lineBetween(x, sy, x + this.barWidth, sy);
        }

        // CRT border — orange to match fill
        g.lineStyle(1, 0xff9944, 0.5);
        g.strokeRect(x, y, this.barWidth, this.barHeight);

        // Update label with live percentage
        if (this.label) {
            const displayName = ACTION_DISPLAY[this.actionName] || this.actionName.toUpperCase();
            this.label.setText(`${displayName} ${Math.round(progress * 100)}%`);
        }
    }

    update(progress) {
        this.draw(progress);
    }

    hide() {
        if (this.graphics) {
            this.graphics.destroy();
            this.graphics = null;
        }
        if (this.label) {
            this.label.destroy();
            this.label = null;
        }
    }
}
