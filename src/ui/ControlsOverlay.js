export class ControlsOverlay {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;

        this.bg = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2, 620, 380, 0x000000, 0.84);
        this.bg.setDepth(270);
        this.bg.setScrollFactor(0);
        this.bg.setVisible(false);

        this.title = scene.add.text(scene.scale.width / 2, scene.scale.height / 2 - 160, 'CONTROLS', {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#ffffff',
        });
        this.title.setOrigin(0.5);
        this.title.setDepth(271);
        this.title.setScrollFactor(0);
        this.title.setVisible(false);

        this.body = scene.add.text(scene.scale.width / 2, scene.scale.height / 2 - 124, [
            'LMB Hold  - Fire',
            'RMB Floor - Move',
            'RMB Door  - Hint, RMB again for menu',
            'MouseWheel- Cycle Weapon',
            '1/2/3     - Select Weapon',
            'HUD Button- Check Motion Tracker (5s prep + 5s scan)',
            'P / ESC   - Pause',
            'F3        - Debug Overlay',
            'F1        - Toggle This Help',
            'F6        - Cycle Squad Style',
            '',
            'Objective:',
            'Clear all waves, then reach extraction.',
        ].join('\n'), {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#ccffdd',
            lineSpacing: 7,
            align: 'left',
        });
        this.body.setDepth(271);
        this.body.setScrollFactor(0);
        this.body.setVisible(false);
        this.body.setOrigin(0.5, 0);
    }

    setVisible(visible) {
        this.visible = visible;
        this.bg.setVisible(visible);
        this.title.setVisible(visible);
        this.body.setVisible(visible);
    }

    toggle() {
        this.setVisible(!this.visible);
    }

    destroy() {
        this.bg.destroy();
        this.title.destroy();
        this.body.destroy();
    }
}
