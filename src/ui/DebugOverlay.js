export class DebugOverlay {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.nextUpdateAt = 0;

        this.panel = scene.add.rectangle(10, 10, 320, 206, 0x000000, 0.68);
        this.panel.setOrigin(0, 0);
        this.panel.setDepth(260);
        this.panel.setScrollFactor(0);

        this.text = scene.add.text(18, 16, '', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ccffcc',
            align: 'left',
        });
        this.text.setDepth(261);
        this.text.setScrollFactor(0);

        this.panel.setVisible(false);
        this.text.setVisible(false);
    }

    setVisible(visible) {
        this.visible = visible;
        this.panel.setVisible(visible);
        this.text.setVisible(visible);
    }

    toggle() {
        this.setVisible(!this.visible);
    }

    update(time, snapshot) {
        if (!this.visible) return;
        if (time < this.nextUpdateAt) return;
        this.nextUpdateAt = time + 120;

        const fps = this.scene.game.loop.actualFps || 0;
        const pointer = snapshot.pointer || { worldX: 0, worldY: 0 };
        const path = snapshot.pathStats || null;
        const lines = [
            `FPS: ${fps.toFixed(1)}`,
            `Stage: ${snapshot.stage}`,
            `Campaign: ${snapshot.campaign || 'n/a'}`,
            `Hostiles: ${snapshot.hostiles}`,
            `Kills: ${snapshot.kills || 0}`,
            `HP: ${Math.ceil(snapshot.health)}`,
            `Paused: ${snapshot.paused ? 'yes' : 'no'}`,
            `Input: ${snapshot.inputMode}`,
            `Firing: ${snapshot.isFiring ? 'yes' : 'no'}`,
            `Pointer: ${Math.round(pointer.worldX)}, ${Math.round(pointer.worldY)}`,
        ];
        if (path) {
            lines.push(
                `Path req/hit: ${path.requests}/${Math.round(path.hitRate * 100)}%`,
                `Path src: ${path.lastSource} | cache: ${path.cacheEntries}`,
                `A* avg/last: ${path.avgAstarMs.toFixed(2)}ms / ${path.lastMs.toFixed(2)}ms`,
                `A* exp/gen: ${path.lastExpanded}/${path.lastGenerated}`
            );
        }
        if (Array.isArray(snapshot.warnings) && snapshot.warnings.length > 0) {
            lines.push(`Warnings: ${snapshot.warnings.length}`);
            for (const w of snapshot.warnings.slice(0, 3)) lines.push(`- ${w}`);
        }
        this.text.setText(lines.join('\n'));
    }

    destroy() {
        if (this.panel) this.panel.destroy();
        if (this.text) this.text.destroy();
    }
}
