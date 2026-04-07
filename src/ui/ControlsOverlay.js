export class ControlsOverlay {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;

        this.bg = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2, 620, 380, 0x071423, 0.9);
        this.bg.setDepth(270);
        this.bg.setScrollFactor(0);
        this.bg.setVisible(false);
        this.bgFrame = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2, 624, 384, 0x000000, 0);
        this.bgFrame.setStrokeStyle(2, 0x00aaff, 0.85);
        this.bgFrame.setDepth(271);
        this.bgFrame.setScrollFactor(0);
        this.bgFrame.setVisible(false);

        this.bgRailTop = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2 - 180, 620, 2, 0x00aaff, 0.28);
        this.bgRailTop.setDepth(271);
        this.bgRailTop.setScrollFactor(0);
        this.bgRailTop.setVisible(false);
        this.bgRailBottom = scene.add.rectangle(scene.scale.width / 2, scene.scale.height / 2 + 180, 620, 2, 0x00aaff, 0.22);
        this.bgRailBottom.setDepth(271);
        this.bgRailBottom.setScrollFactor(0);
        this.bgRailBottom.setVisible(false);

        this.title = scene.add.text(scene.scale.width / 2, scene.scale.height / 2 - 160, 'CONTROLS', {
            fontSize: '20px',
            fontFamily: '"Share Tech Mono", monospace',
            color: '#c7ecff',
        });
        this.title.setOrigin(0.5);
        this.title.setDepth(271);
        this.title.setScrollFactor(0);
        this.title.setVisible(false);

        this.body = scene.add.text(scene.scale.width / 2, scene.scale.height / 2 - 124, [
            'LMB Floor - Move / Target / Menus',
            'RMB Hold  - Fire',
            'RMB Door  - Hint, RMB again for menu',
            'MouseWheel- Cycle Weapon',
            '1/2/3     - Select Weapon',
            'HUD Button- Check Motion Tracker (5s prep + 5s scan)',
            'M         - Toggle Tactical Map',
            'P         - Pause',
            'ESC       - Pause',
            'F3        - Debug Overlay',
            'F1        - Toggle This Help',
            'F6        - Cycle Squad Style',
            '',
            'Objective:',
            'Clear all waves, then reach extraction.',
        ].join('\n'), {
            fontSize: '14px',
            fontFamily: '"Share Tech Mono", monospace',
            color: '#9dd8ff',
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
        this.bgFrame.setVisible(visible);
        this.bgRailTop.setVisible(visible);
        this.bgRailBottom.setVisible(visible);
        this.title.setVisible(visible);
        this.body.setVisible(visible);
    }

    toggle() {
        this.setVisible(!this.visible);
    }

    destroy() {
        this.bg.destroy();
        this.bgFrame.destroy();
        this.bgRailTop.destroy();
        this.bgRailBottom.destroy();
        this.title.destroy();
        this.body.destroy();
    }
}
