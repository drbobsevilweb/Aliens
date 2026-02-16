export class ObjectivesPanel {
    constructor(scene) {
        this.scene = scene;
        const x = 12;
        const y = 46;
        this.minWidth = 288;
        this.minHeight = 44;

        this.bg = scene.add.rectangle(x, y, this.minWidth, this.minHeight, 0x000000, 0.58);
        this.bg.setOrigin(0, 0);
        this.bg.setDepth(236);
        this.bg.setScrollFactor(0);

        this.title = scene.add.text(x + 6, y + 4, 'OBJECTIVES', {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#c7d6df',
        });
        this.title.setDepth(237);
        this.title.setScrollFactor(0);

        this.lines = scene.add.text(x + 6, y + 18, '', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ccffcc',
            lineSpacing: 2,
        });
        this.lines.setDepth(237);
        this.lines.setScrollFactor(0);
    }

    update(data) {
        let lines = null;
        if (Array.isArray(data.objectiveLines) && data.objectiveLines.length > 0) {
            lines = data.objectiveLines;
        } else {
            const wavesDone = data.currentWave > data.totalWaves
                ? data.totalWaves
                : (data.stage === 'intermission' || data.stage === 'extract' || data.stage === 'victory'
                    ? Math.max(0, data.currentWave)
                    : Math.max(0, data.currentWave - 1));
            const clearMark = data.stage === 'extract' || data.stage === 'victory' ? '[x]' : '[ ]';
            const extractMark = data.stage === 'victory' ? '[x]' : '[ ]';
            lines = [
                `${clearMark} Clear waves ${Math.min(wavesDone, data.totalWaves)}/${data.totalWaves}`,
                `${extractMark} Reach extraction zone`,
            ];
        }
        this.lines.setText(lines.join('\n'));
        this.resizeToContent(lines);
    }

    resizeToContent(lines) {
        const count = Math.max(1, Array.isArray(lines) ? lines.length : 1);
        const lineH = 15;
        const targetH = Math.max(this.minHeight, 20 + count * lineH);
        if (typeof this.bg.setSize === 'function') this.bg.setSize(this.minWidth, targetH);
        else {
            this.bg.width = this.minWidth;
            this.bg.height = targetH;
        }
    }

    destroy() {
        this.bg.destroy();
        this.title.destroy();
        this.lines.destroy();
    }
}
