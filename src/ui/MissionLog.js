import { CONFIG } from '../config.js';
import { getHudConfig } from '../settings/missionPackageRuntime.js';

export class MissionLog {
    constructor(scene) {
        this.scene = scene;
        this.fullText = '';
        this.currentText = '';
        this.charIndex = 0;
        this.isTyping = false;
        this.visibleTimeLeft = 0;

        // Load editor overrides
        const hudCfg = getHudConfig();
        const mlCfg = hudCfg && hudCfg.missionLog && typeof hudCfg.missionLog === 'object' ? hudCfg.missionLog : null;
        const subtitleCfg = mlCfg && mlCfg._subs && mlCfg._subs.subtitleText && typeof mlCfg._subs.subtitleText === 'object'
            ? mlCfg._subs.subtitleText
            : null;

        // Subtitle treatment: larger and lower on screen like film subtitles.
        const x = mlCfg && typeof mlCfg.x === 'number' ? mlCfg.x : CONFIG.GAME_WIDTH / 2;
        const y = mlCfg && typeof mlCfg.y === 'number' ? mlCfg.y : CONFIG.GAME_HEIGHT - 56;
        this.panelW = mlCfg && typeof mlCfg.width === 'number' ? mlCfg.width : CONFIG.GAME_WIDTH * 0.74;
        this.panelH = mlCfg && typeof mlCfg.height === 'number' ? mlCfg.height : 60;
        this.textAnchorX = subtitleCfg && typeof subtitleCfg.relX === 'number' ? subtitleCfg.relX : 0.5;
        this.textAnchorY = subtitleCfg && typeof subtitleCfg.relY === 'number' ? subtitleCfg.relY : 0.5;
        this.textWrapWidth = Math.max(240, this.panelW - 54);

        this.container = scene.add.container(x, y);
        this.container.setDepth(250);
        this.container.setScrollFactor(0);

        this.backdrop = scene.add.rectangle(0, 0, this.panelW, this.panelH, 0x000000, 0.4);
        this.backdrop.setOrigin(0.5);

        this.textObj = scene.add.text(0, 0, '', {
            fontSize: `${subtitleCfg && typeof subtitleCfg.fontSize === 'number' ? subtitleCfg.fontSize : 22}px`,
            fontFamily: subtitleCfg?.fontFamily || '"Share Tech Mono", "Consolas", monospace',
            color: subtitleCfg?.color || '#9be8ff',
            align: 'center',
            fontStyle: 'bold',
            stroke: '#001018',
            strokeThickness: 4,
            shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 8, fill: true },
            wordWrap: { width: this.textWrapWidth, useAdvancedWrap: true },
            lineSpacing: 4,
        });
        this.textObj.setOrigin(0.5, 0.5).setAlpha(subtitleCfg && typeof subtitleCfg.opacity === 'number' ? subtitleCfg.opacity : 1);

        // CLI block cursor — sits directly after the last typed character
        this.blockCursor = scene.add.rectangle(0, 0, 10, 23, 0x9be8ff, 0.9);
        this.blockCursor.setOrigin(0, 0.5);
        this.blockCursor.setVisible(false);

        // Reusable hidden text for width measurement (avoids create/destroy per keystroke)
        this._measureText = scene.add.text(0, 0, '', {
            fontSize: '22px',
            fontFamily: '"Share Tech Mono", "Consolas", monospace',
            fontStyle: 'bold',
        }).setVisible(false);

        this.container.add([this.backdrop, this.textObj, this.blockCursor]);
    }

    addMessage(msg) {
        this.fullText = msg.toUpperCase();
        this.currentText = '';
        this.charIndex = 0;
        this.isTyping = true;
        this.visibleTimeLeft = 6000;

        // Kill any leftover blink tween and reset cursor.
        this.scene.tweens.killTweensOf(this.blockCursor);
        this.blockCursor.setAlpha(1);
        this.blockCursor.setVisible(true);
        this.textObj.setText('');
        this.refreshLayout();
        this._updateCursorPos();

        if (this.typingTimer) this.typingTimer.remove();
        this.typingTimer = this.scene.time.addEvent({
            delay: 72,
            callback: this.typeNextChar,
            callbackScope: this,
            loop: true
        });
    }

    typeNextChar() {
        if (!this.isTyping) return;

        if (this.charIndex < this.fullText.length) {
            this.currentText += this.fullText[this.charIndex];
            this.charIndex++;
            this.textObj.setText(this.currentText);
            this.refreshLayout();

            // Place cursor immediately after the last character.
            // textObj is origin(0.5) so its right edge is at +width/2.
            this._updateCursorPos();
        } else {
            // Typing complete — cursor disappears like a real CLI.
            this.isTyping = false;
            this.typingTimer.remove();
            this.blockCursor.setVisible(false);
        }
    }

    _updateCursorPos() {
        const lines = String(this.currentText || '').split('\n');
        const lastLine = lines[lines.length - 1] || '';
        this._measureText.setText(lastLine);
        const lastLineWidth = this._measureText.width;
        const lineHeight = this.textObj.height / Math.max(1, lines.length);
        const cursorY = ((lines.length - 1) * lineHeight) - (this.textObj.height / 2) + (lineHeight * 0.5);
        this.blockCursor.setPosition((lastLineWidth / 2) + 3, cursorY);
        this.blockCursor.setAlpha(1);
    }

    refreshLayout() {
        const width = Math.max(this.panelW, this.textObj.width + 54);
        const height = Math.max(this.panelH, this.textObj.height + 26);
        this.backdrop.setSize(width, height);
        this.textObj.setPosition((this.textAnchorX - 0.5) * width, (this.textAnchorY - 0.5) * height);
    }

    update(time, delta) {
        if (this.visibleTimeLeft > 0) {
            this.visibleTimeLeft -= delta;
            this.container.setAlpha(1);
            if (this.visibleTimeLeft <= 0) {
                this.scene.tweens.add({
                    targets: this.container,
                    alpha: 0,
                    duration: 500
                });
            }
        }
    }

    destroy() {
        if (this.typingTimer) this.typingTimer.remove();
        if (this._measureText) this._measureText.destroy();
        this.container.destroy();
    }
}
