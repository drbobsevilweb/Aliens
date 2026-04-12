import { CONFIG } from '../config.js';
import { getHudConfig } from '../settings/missionPackageRuntime.js';

const HUD_FONT = '"Share Tech Mono", "Consolas", monospace';
const OBJ_COLOR_CSS = '#8fe7ff';
const OBJ_COLOR = 0x4aa4d8;

/**
 * ObjectivesPanel — top-right corner.
 * Shows mission objectives that slide down every 10 seconds for a few seconds,
 * then pushes back up out of sight. When objectives are hidden, shows a
 * compact mission time / kills / wave bar.
 */
export class ObjectivesPanel {
    constructor(scene) {
        this.scene = scene;

        // Load editor overrides
        const hudCfg = getHudConfig();
        const opCfg = hudCfg && hudCfg.objectivesPanel && typeof hudCfg.objectivesPanel === 'object' ? hudCfg.objectivesPanel : null;
        const textCfg = opCfg && opCfg._subs && opCfg._subs.objectiveText && typeof opCfg._subs.objectiveText === 'object'
            ? opCfg._subs.objectiveText
            : null;

        // Panel sizing
        this.panelW = opCfg && typeof opCfg.width === 'number' ? opCfg.width : 200;
        this.panelH = opCfg && typeof opCfg.height === 'number' ? opCfg.height : 60;
        this.panelX = opCfg && typeof opCfg.x === 'number' ? opCfg.x : CONFIG.GAME_WIDTH - this.panelW - 26;
        this.panelY = -this.panelH - 4; // starts hidden above screen

        // Container (starts off-screen)
        this.container = scene.add.container(this.panelX, this.panelY);
        this.container.setScrollFactor(0);
        this.container.setDepth(236);

        // Background
        this.bg = scene.add.graphics();
        this._drawBg();

        // Objective title
        this.title = scene.add.text(10, 6, 'MISSION OBJECTIVES', {
            fontSize: '8px',
            fontFamily: HUD_FONT,
            color: OBJ_COLOR_CSS,
            fontStyle: 'bold',
            shadow: { offsetX: 0, offsetY: 0, color: '#00aaff', blur: 4, stroke: true, fill: true }
        });

        // Objective lines
        this.lines = scene.add.text(10, 20, '', {
            fontSize: `${textCfg && typeof textCfg.fontSize === 'number' ? textCfg.fontSize : 8}px`,
            fontFamily: textCfg?.fontFamily || HUD_FONT,
            color: textCfg?.color || '#55d8ff',
            lineSpacing: 2,
            shadow: { offsetX: 0, offsetY: 0, color: '#00aaff', blur: 2, stroke: true, fill: true },
            wordWrap: { width: this.panelW - 20 },
        }).setAlpha(textCfg && typeof textCfg.opacity === 'number' ? textCfg.opacity : 1);
        this.lines.setPosition(
            textCfg && typeof textCfg.relX === 'number' ? textCfg.relX : 10,
            textCfg && typeof textCfg.relY === 'number' ? textCfg.relY : 20
        );

        // Interference overlay — random brief flashes
        this._interVid = scene.add.video(0, 0, 'interrupt_video');
        this._interVid.setMute(true);
        this._interVid.play(true);
        this._interVid.setLoop(true);
        this._scaleVideoToFit(this._interVid, this.panelW, this.panelH);
        this._interVid.setOrigin(0, 0);
        this._interVid.setAlpha(0);
        this._interVid.setVisible(false);
        this._interVid.setTint(0xaaccff);
        this._nextInterAt = scene.time.now + 7000 + Math.random() * 12000;
        this._interEndAt = 0;

        this.container.add([this.bg, this.title, this.lines, this._interVid]);

        // Compact status bar (shown when objectives are hidden)
        this.statusContainer = scene.add.container(this.panelX, 24);
        this.statusContainer.setScrollFactor(0);
        this.statusContainer.setDepth(236);

        this.statusBg = scene.add.graphics();
        this.statusBg.fillStyle(0x010810, 0.7);
        this.statusBg.fillRoundedRect(0, 0, this.panelW, 16, 3);
        this.statusBg.lineStyle(1, OBJ_COLOR, 0.3);
        this.statusBg.strokeRoundedRect(0, 0, this.panelW, 16, 3);

        this.statusText = scene.add.text(this.panelW / 2, 8, '', {
            fontSize: '8px',
            fontFamily: HUD_FONT,
            color: '#55d8ff',
            shadow: { offsetX: 0, offsetY: 0, color: '#1a5588', blur: 3, stroke: true, fill: true },
        }).setOrigin(0.5);

        this.statusContainer.add([this.statusBg, this.statusText]);

        // Animation state
        this._isShowing = false;
        this._showTimer = 0;
        this._nextShowAt = scene.time.now + 3000; // first show after 3s
        this._showDuration = 5000; // visible for 5s
        this._showInterval = 10000; // every 10s
        this._slideTargetY = 24; // where objective panel slides to
        this._hideY = -this.panelH - 4;

        // Objective data cache
        this._objectiveLines = [];
        this._waveText = '';
        this._killCount = 0;
        this._missionTimeSec = 0;
        this._combatPhase = '';

        // Typewriter state
        this._typingIndex = 0;
        this._charIndex = 0;
        this._isTyping = false;
        this._displayedLines = [];
        this._typingTimer = null;
    }

    _drawBg() {
        const g = this.bg;
        g.clear();
        g.fillStyle(0x010810, 0.88);
        g.fillRoundedRect(0, 0, this.panelW, this.panelH, 4);
        g.lineStyle(1, OBJ_COLOR, 0.4);
        g.strokeRoundedRect(0, 0, this.panelW, this.panelH, 4);
        g.lineStyle(1, 0x000000, 0.06);
        for (let sy = 0; sy < this.panelH; sy += 3) {
            g.lineBetween(2, sy, this.panelW - 2, sy);
        }
    }

    forceShow(duration = 5000) {
        this._showTimer = duration;
        if (!this._isShowing) {
            this._slideIn();
        }
    }

    _slideIn() {
        if (this._isShowing) return;
        this._isShowing = true;
        this.statusContainer.setAlpha(0); // hide status bar while objectives show
        this.scene.tweens.add({
            targets: this.container,
            y: this._slideTargetY,
            duration: 400,
            ease: 'Power2'
        });
        // Start typewriter for current lines
        this._startTypewriter();
    }

    _slideOut() {
        if (!this._isShowing) return;
        this._isShowing = false;
        this.scene.tweens.add({
            targets: this.container,
            y: this._hideY,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                // Fade in status bar when objectives slide out
                this.scene.tweens.add({
                    targets: this.statusContainer,
                    alpha: 1,
                    duration: 300,
                });
            }
        });
    }

    _startTypewriter() {
        this._displayedLines = this._objectiveLines.map(() => '');
        this._typingIndex = 0;
        this._charIndex = 0;
        this._isTyping = true;
        if (this._typingTimer) this._typingTimer.remove();
        this._typingTimer = this.scene.time.addEvent({
            delay: 25,
            callback: this._typeNextChar,
            callbackScope: this,
            loop: true,
        });
    }

    _typeNextChar() {
        if (!this._isTyping || this._typingIndex >= this._objectiveLines.length) {
            this._isTyping = false;
            if (this._typingTimer) this._typingTimer.remove();
            return;
        }
        const line = this._objectiveLines[this._typingIndex];
        if (this._charIndex < line.length) {
            this._displayedLines[this._typingIndex] += line[this._charIndex];
            this._charIndex++;
        } else {
            this._typingIndex++;
            this._charIndex = 0;
        }
        this.lines.setText(this._displayedLines.join('\n'));
        this._resizeToContent();
    }

    _resizeToContent() {
        const lineCount = Math.max(1, this._objectiveLines.length);
        const lineH = 12;
        this.panelH = Math.max(40, 24 + lineCount * lineH);
        this._drawBg();
        // Keep interference overlay matched to current panel size
        if (this._interVid) this._scaleVideoToFit(this._interVid, this.panelW, this.panelH);
    }

    /**
     * Called per-frame from ObjectiveSystem.updatePanel via GameScene.
     */
    update(data, time, delta) {
        this._updateInterference(time);
        const useWaveObjectives = this.scene.requireAuthoredAlienSpawns !== true;
        // Update cached data
        if (Array.isArray(data.objectiveLines) && data.objectiveLines.length > 0) {
            const newLines = data.objectiveLines.map(l => `[ ${l.toUpperCase()} ]`);
            const combined = newLines.join('\n');
            if (combined !== this._objectiveLines.join('\n')) {
                this._objectiveLines = newLines;
                if (this._isShowing) this._startTypewriter();
            }
        } else {
            const clearMark = data.stage === 'extract' || data.stage === 'victory' ? 'X' : ' ';
            const extractMark = data.stage === 'victory' ? 'X' : ' ';
            const newLines = useWaveObjectives
                ? (() => {
                    const wavesDone = data.currentWave > data.totalWaves
                        ? data.totalWaves
                        : (data.stage === 'intermission' || data.stage === 'extract' || data.stage === 'victory'
                            ? Math.max(0, data.currentWave)
                            : Math.max(0, data.currentWave - 1));
                    return [
                        `[ ${clearMark} ] CLEAR WAVES ${Math.min(wavesDone, data.totalWaves)}/${data.totalWaves}`,
                        `[ ${extractMark} ] REACH EXTRACTION ZONE`,
                    ];
                })()
                : [
                    `[ ${clearMark} ] CLEAR HOSTILE CONTACTS`,
                    `[ ${extractMark} ] REACH EXTRACTION ZONE`,
                ];
            const combined = newLines.join('\n');
            if (combined !== this._objectiveLines.join('\n')) {
                this._objectiveLines = newLines;
                if (this._isShowing) this._startTypewriter();
            }
        }

        // Update status data
        const sf = this.scene.stageFlow;
        this._waveText = (useWaveObjectives && sf) ? `W${sf.getWaveLabel()}` : 'OBJ';
        this._killCount = Math.max(0, Number(this.scene.totalKills) || 0);
        const startTime = this.scene.sessionStartTime || time;
        this._missionTimeSec = Math.floor((time - startTime) / 1000);

        const cdState = this.scene.combatMods?.state;
        if (cdState === 'peak') this._combatPhase = 'CONTACT';
        else if (cdState === 'build') this._combatPhase = 'ALERT';
        else if (cdState === 'release') this._combatPhase = 'CLEAR';
        else this._combatPhase = '';

        // Auto-show every 10 seconds
        if (time >= this._nextShowAt && !this._isShowing) {
            this._showTimer = this._showDuration;
            this._nextShowAt = time + this._showInterval;
            this._slideIn();
        }

        // Count down show timer
        if (this._isShowing) {
            this._showTimer -= delta;
            if (this._showTimer <= 0) {
                this._slideOut();
                this._nextShowAt = time + this._showInterval;
            }
        }

        // Update compact status text
        const min = String(Math.floor(this._missionTimeSec / 60)).padStart(2, '0');
        const sec = String(this._missionTimeSec % 60).padStart(2, '0');
        const phaseStr = this._combatPhase ? ` ${this._combatPhase}` : '';
        this.statusText.setText(`${min}:${sec} | K:${this._killCount} | ${this._waveText}${phaseStr}`);
    }

    _updateInterference(time) {
        if (!this._isShowing || this.container.y <= this._hideY + 1) {
            if (this._interVid?.visible) {
                this.scene.tweens.killTweensOf(this._interVid);
                this._interVid.setAlpha(0);
                this._interVid.setVisible(false);
            }
            if (this._interEndAt > 0) this._interEndAt = 0;
            return;
        }

        if (this._interEndAt === 0 && time >= this._nextInterAt) {
            const duration = 300 + Math.random() * 500;
            const fadeIn = duration * 0.25;
            const hold = duration * 0.5;
            const fadeOut = duration * 0.25;
            this._interEndAt = time + duration;
            this._interVid.setVisible(true);
            // Re-apply scale now that native video dimensions are available
            this._scaleVideoToFit(this._interVid, this.panelW, this.panelH);
            this.scene.tweens.killTweensOf(this._interVid);
            this.scene.tweens.chain({
                targets: this._interVid,
                tweens: [
                    { alpha: 0.5, duration: fadeIn, ease: 'Sine.easeIn' },
                    { alpha: 0.5, duration: hold },
                    { alpha: 0, duration: fadeOut, ease: 'Sine.easeOut',
                      onComplete: () => { this._interVid.setVisible(false); } },
                ],
            });
        } else if (time >= this._interEndAt && this._interEndAt > 0) {
            this._nextInterAt = time + 8000 + Math.random() * 12000;
            this._interEndAt = 0;
        }
    }

    _scaleVideoToFit(vid, w, h) {
        if (!vid) return;
        vid.setDisplaySize(w, h);
    }

    destroy() {
        if (this._typingTimer) this._typingTimer.remove();
        if (this.container) this.container.destroy();
        if (this.statusContainer) this.statusContainer.destroy();
    }
}
