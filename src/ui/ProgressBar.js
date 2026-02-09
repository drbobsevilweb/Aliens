export class ProgressBar {
    constructor(scene) {
        this.scene = scene;
        this.graphics = null;
        this.worldX = 0;
        this.worldY = 0;
        this.barWidth = 80;
        this.barHeight = 10;
        this.fillColor = 0x44cc44;
    }

    show(worldX, worldY, fillColor) {
        this.hide();
        this.worldX = worldX;
        this.worldY = worldY;
        this.fillColor = fillColor;
        this.graphics = this.scene.add.graphics();
        this.graphics.setDepth(99);
        this.draw(0);
    }

    draw(progress) {
        if (!this.graphics) return;
        const g = this.graphics;
        const x = this.worldX - this.barWidth / 2;
        const y = this.worldY;

        g.clear();

        // Background
        g.fillStyle(0x222222, 0.9);
        g.fillRect(x, y, this.barWidth, this.barHeight);

        // Fill
        if (progress > 0) {
            const fillWidth = Math.min(progress, 1) * (this.barWidth - 2);
            g.fillStyle(this.fillColor, 1);
            g.fillRect(x + 1, y + 1, fillWidth, this.barHeight - 2);
        }

        // Border
        g.lineStyle(1, 0x666666, 1);
        g.strokeRect(x, y, this.barWidth, this.barHeight);
    }

    update(progress) {
        this.draw(progress);
    }

    hide() {
        if (this.graphics) {
            this.graphics.destroy();
            this.graphics = null;
        }
    }
}
