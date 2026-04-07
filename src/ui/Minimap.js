import { CONFIG } from '../config.js';
import { getHudConfig } from '../settings/missionPackageRuntime.js';

const HUD_FONT = '"Share Tech Mono", "Consolas", monospace';
const MAP_COLOR = 0x4aa4d8;
const MAP_COLOR_CSS = '#4aa4d8';
const GRID_COLOR = 0x4aa4d8;

/**
 * Minimap — outline-only tactical map in bottom-right corner.
 * Same size as MotionTracker (190×130) so tracker overlays naturally.
 * Features: gridlines, objective markers, TRACK/MAP buttons, fullscreen with click-to-close.
 * Tracker status text appears above minimap during activation.
 */
export class Minimap {
    constructor(scene) {
        this.scene = scene;
        this.isFullscreen = false;
        const hudCfg = getHudConfig();
        const mapCfg = hudCfg && hudCfg.mapPanel && typeof hudCfg.mapPanel === 'object' ? hudCfg.mapPanel : null;
        const subs = mapCfg && mapCfg._subs && typeof mapCfg._subs === 'object' ? mapCfg._subs : {};
        const titleCfg = subs.title && typeof subs.title === 'object' ? subs.title : {};
        const buttonCfg = subs.mapButton && typeof subs.mapButton === 'object' ? subs.mapButton : {};

        // Panel dimensions — matches MotionTracker exactly
        this.miniW = Number.isFinite(Number(mapCfg?.width)) ? Number(mapCfg.width) : 190;
        this.miniH = Number.isFinite(Number(mapCfg?.height)) ? Number(mapCfg.height) : 130;
        this.miniX = Number.isFinite(Number(mapCfg?.x)) ? Number(mapCfg.x) : CONFIG.GAME_WIDTH - this.miniW - 26;
        this.miniY = Number.isFinite(Number(mapCfg?.y)) ? Number(mapCfg.y) : CONFIG.GAME_HEIGHT - this.miniH - 60;
        this._titleCfg = titleCfg;
        this._mapButtonCfg = buttonCfg;

        // Container for the minimap
        this.container = scene.add.container(this.miniX, this.miniY);
        this.container.setScrollFactor(0);
        this.container.setDepth(199);

        // Background panel
        this.bg = scene.add.graphics();
        this.gridGraphics = scene.add.graphics();
        this.mapGraphics = scene.add.graphics();
        this.blipGraphics = scene.add.graphics();
        this.objectiveGraphics = scene.add.graphics();

        // Frame chrome
        this.chrome = scene.add.graphics();

        // Title label
        this.titleLabel = scene.add.text(
            Number.isFinite(Number(titleCfg.relX)) ? Number(titleCfg.relX) : 4,
            Number.isFinite(Number(titleCfg.relY)) ? Number(titleCfg.relY) : 3,
            'MAP',
            {
                fontSize: `${Number.isFinite(Number(titleCfg.fontSize)) ? Number(titleCfg.fontSize) : 7}px`,
                fontFamily: titleCfg.fontFamily || HUD_FONT,
                color: titleCfg.color || MAP_COLOR_CSS,
            shadow: { offsetX: 0, offsetY: 0, color: '#1a5588', blur: 3, stroke: true, fill: true },
            }
        ).setOrigin(0, 0).setAlpha(Number.isFinite(Number(titleCfg.opacity)) ? Number(titleCfg.opacity) : 0.6);

        // Interference video overlay
        this.interferenceVideo = null; // Interference video overlay — local to the minimap card only
        try {
            this.interferenceVideo = scene.add.video(0, 0, 'interrupt_video');
            this.interferenceVideo.setMute(true);
            this.interferenceVideo.play(true);
            this.interferenceVideo.setLoop(true);
            this.interferenceVideo.setAlpha(0);
            this.interferenceVideo.setOrigin(0, 0);
            this.interferenceVideo.setVisible(false);
            this.interferenceVideo.setTint(0xaaccff);
            this._nextInterferenceAt = scene.time.now + 5000 + Math.random() * 9000;
            this._interferenceEndAt = 0;
        } catch (e) {
            // Video not available
        }

        this.container.add([this.bg, this.gridGraphics, this.mapGraphics, this.blipGraphics, this.objectiveGraphics, this.chrome]);
        if (this.interferenceVideo) this.container.add(this.interferenceVideo);
        this.container.add(this.titleLabel);

        // Cached map state
        this._cachedRevision = -1;
        this._mapScale = 1;
        this._mapOffsetX = 0;
        this._mapOffsetY = 0;
        this._gridW = 0;
        this._gridH = 0;
        this._miniZoom = 2.0;  // 50% zoom-in (show half the map area)
        this._baseScale = 1;
        this._baseOffX = 0;
        this._baseOffY = 0;

        // Geometry mask to clip zoomed minimap content
        // Must match container's scrollFactor(0) so mask stays fixed on screen
        this._maskShape = scene.add.graphics();
        this._maskShape.setScrollFactor(0);
        this._maskShape.setPosition(this.miniX, this.miniY);
        this._maskShape.fillStyle(0xffffff);
        this._maskShape.fillRoundedRect(0, 0, this.miniW, this.miniH, 3);
        this._maskShape.setVisible(false);
        this._minimapMask = this._maskShape.createGeometryMask();
        this.container.setMask(this._minimapMask);

        // Button containers (TRACK + MAP buttons)
        this.buttonContainer = scene.add.container(this.miniX, this.miniY);
        this.buttonContainer.setScrollFactor(0);
        this.buttonContainer.setDepth(199);

        this.trackButton = null;
        this.mapButton = null;
        this._createButtons();



        // Objective world position (set by GameScene each frame)
        this._objectiveWorld = null;

        // Fullscreen overlay elements
        this.fullscreenContainer = null;
        this.fullscreenBg = null;
        this.fullscreenMap = null;
        this.fullscreenBlips = null;
        this.fullscreenGrid = null;
        this.fullscreenObjectives = null;
        this.fullscreenChrome = null;
        this.fullscreenLabel = null;
    }

    _createButtons() {
        const btnW = Number.isFinite(Number(this._mapButtonCfg.width)) ? Number(this._mapButtonCfg.width) : 88;
        const btnH = Number.isFinite(Number(this._mapButtonCfg.height)) ? Number(this._mapButtonCfg.height) : 18;
        const startX = Number.isFinite(Number(this._mapButtonCfg.relX))
            ? Number(this._mapButtonCfg.relX)
            : (this.miniW - btnW) / 2;
        const startY = Number.isFinite(Number(this._mapButtonCfg.relY))
            ? Number(this._mapButtonCfg.relY)
            : this.miniH + 4;

        this.trackButton = null;

        this.mapButton = this._makeButton(startX, startY, btnW, btnH, 'MAP', () => {
            this.toggleFullscreen();
            if (typeof this.scene.playUiClickSfx === 'function') this.scene.playUiClickSfx(false);
        });

        this.buttonContainer.add([
            this.mapButton.bg, this.mapButton.text,
        ]);
    }

    _makeButton(x, y, w, h, label, onClick) {
        const borderColor = this._mapButtonCfg.borderColor || MAP_COLOR_CSS;
        const fillColor = this._mapButtonCfg.bgColor || '#07172a';
        const textColor = this._mapButtonCfg.color || MAP_COLOR_CSS;
        const alpha = Number.isFinite(Number(this._mapButtonCfg.opacity)) ? Number(this._mapButtonCfg.opacity) : 0.82;
        const bg = this.scene.add.rectangle(x, y, w, h, parseInt(fillColor.replace('#', ''), 16), alpha).setOrigin(0);
        bg.setStrokeStyle(1, parseInt(borderColor.replace('#', ''), 16), 0.7);
        const text = this.scene.add.text(x + w / 2, y + h / 2, label, {
            fontSize: `${Number.isFinite(Number(this._mapButtonCfg.fontSize)) ? Number(this._mapButtonCfg.fontSize) : 9}px`,
            fontFamily: this._mapButtonCfg.fontFamily || HUD_FONT,
            color: textColor,
            shadow: { offsetX: 0, offsetY: 0, color: '#1a5588', blur: 3, stroke: true, fill: true },
        }).setOrigin(0.5);

        return { bg, text, x, y, w, h, onClick, _hovered: false };
    }

    _computeFit(gridW, gridH, panelW, panelH) {
        const margin = 12;
        const availW = panelW - margin * 2;
        const availH = panelH - margin * 2 - 10;
        const scale = Math.min(availW / gridW, availH / gridH);
        const offX = margin + (availW - gridW * scale) / 2;
        const offY = margin + 10 + (availH - gridH * scale) / 2;
        return { scale, offX, offY };
    }

    /** Set the objective world position for marker display on the map */
    setObjectiveTarget(worldPos) {
        this._objectiveWorld = worldPos || null;
    }

    drawMap(pathGrid) {
        if (!pathGrid) return;
        const rev = pathGrid.getRevision();
        if (rev === this._cachedRevision) return;
        this._cachedRevision = rev;

        const gw = pathGrid.width;
        const gh = pathGrid.height;
        this._gridW = gw;
        this._gridH = gh;
        const { scale, offX, offY } = this._computeFit(gw, gh, this.miniW, this.miniH);
        // Apply zoom — use larger scale for zoomed-in mini view
        const zoomedScale = scale * this._miniZoom;
        this._baseScale = scale;
        this._baseOffX = offX;
        this._baseOffY = offY;
        this._mapScale = zoomedScale;
        this._mapOffsetX = offX;
        this._mapOffsetY = offY;

        // Draw map at zoomed scale (larger than panel — clipped by mask)
        this._drawMapToGraphics(this.mapGraphics, pathGrid, zoomedScale, offX, offY, this.miniW * this._miniZoom, this.miniH * this._miniZoom);
        this._drawGridlines(this.gridGraphics, gw, gh, zoomedScale, offX, offY, this.miniW * this._miniZoom, this.miniH * this._miniZoom);
        this._drawChrome(this.chrome, this.miniW, this.miniH);
        this._drawBg(this.bg, this.miniW, this.miniH);

        if (this.interferenceVideo) {
            this.interferenceVideo.setDisplaySize(this.miniW, this.miniH);
            this.interferenceVideo.setPosition(0, 0);
        }
    }

    /** Center the zoomed minimap view on a world position (call each frame) */
    centerOnPlayer(leader) {
        if (this.isFullscreen || !leader || !this.scene.pathGrid || this._cachedRevision < 0) return;
        const pg = this.scene.pathGrid;
        const tile = pg.worldToTile(leader.x, leader.y);
        const scale = this._mapScale;
        // Player position in zoomed map-local coords
        const playerLocalX = this._mapOffsetX + tile.x * scale + scale / 2;
        const playerLocalY = this._mapOffsetY + tile.y * scale + scale / 2;
        // Shift so player is at center of minimap panel
        const shiftX = this.miniW / 2 - playerLocalX;
        const shiftY = this.miniH / 2 - playerLocalY;
        // Apply shift to all map content graphics (not bg/chrome which stay fixed)
        this.mapGraphics.setPosition(shiftX, shiftY);
        this.gridGraphics.setPosition(shiftX, shiftY);
        this.blipGraphics.setPosition(shiftX, shiftY);
        this.objectiveGraphics.setPosition(shiftX, shiftY);
    }

    _drawBg(g, w, h) {
        g.clear();
        g.fillStyle(0x010810, 0.75);
        g.fillRoundedRect(0, 0, w, h, 3);
    }

    _drawChrome(g, w, h) {
        g.clear();
        g.lineStyle(1, MAP_COLOR, 0.45);
        g.strokeRoundedRect(0, 0, w, h, 3);
        g.lineStyle(1, MAP_COLOR, 0.12);
        g.strokeRoundedRect(2, 2, w - 4, h - 4, 2);
        g.lineStyle(1, 0x000000, 0.06);
        for (let sy = 0; sy < h; sy += 3) {
            g.lineBetween(2, sy, w - 2, sy);
        }
    }

    /** Draw faint gridlines across the map area */
    _drawGridlines(g, gridW, gridH, scale, offX, offY, clampW, clampH) {
        g.clear();
        if (gridW <= 0 || gridH <= 0) return;

        const pixW = gridW * scale;
        const pixH = gridH * scale;
        const targetLines = 10;
        const cellsPerLine = Math.max(1, Math.round(Math.max(gridW, gridH) / targetLines));

        g.lineStyle(1, GRID_COLOR, 0.06);

        for (let x = cellsPerLine; x < gridW; x += cellsPerLine) {
            const px = offX + x * scale;
            if (px > 2 && px < clampW - 2) {
                g.lineBetween(px, offY, px, offY + pixH);
            }
        }
        for (let y = cellsPerLine; y < gridH; y += cellsPerLine) {
            const py = offY + y * scale;
            if (py > 2 && py < clampH - 2) {
                g.lineBetween(offX, py, offX + pixW, py);
            }
        }
    }

    _drawMapToGraphics(g, pathGrid, scale, offX, offY, clampW, clampH) {
        g.clear();
        const gw = pathGrid.width;
        const gh = pathGrid.height;

        g.lineStyle(1, MAP_COLOR, 0.6);

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                if (pathGrid.isWalkable(x, y)) continue;
                const hasWalkableNeighbor =
                    pathGrid.isWalkable(x - 1, y) || pathGrid.isWalkable(x + 1, y) ||
                    pathGrid.isWalkable(x, y - 1) || pathGrid.isWalkable(x, y + 1);
                if (!hasWalkableNeighbor) continue;

                const px = offX + x * scale;
                const py = offY + y * scale;
                const pw = Math.max(1, scale);
                const ph = Math.max(1, scale);

                if (pathGrid.isWalkable(x, y - 1)) g.lineBetween(px, py, px + pw, py);
                if (pathGrid.isWalkable(x, y + 1)) g.lineBetween(px, py + ph, px + pw, py + ph);
                if (pathGrid.isWalkable(x - 1, y)) g.lineBetween(px, py, px, py + ph);
                if (pathGrid.isWalkable(x + 1, y)) g.lineBetween(px + pw, py, px + pw, py + ph);
            }
        }
    }

    /** Draw objective marker diamond on the minimap */
    _drawObjectiveMarkers(g, pathGrid, scale, offX, offY) {
        g.clear();
        if (!this._objectiveWorld || !pathGrid) return;
        const tile = pathGrid.worldToTile(this._objectiveWorld.x, this._objectiveWorld.y);
        const px = offX + tile.x * scale + scale / 2;
        const py = offY + tile.y * scale + scale / 2;
        const time = this.scene.time.now;
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.004);

        const s = 4;
        g.lineStyle(1.5, 0xffd166, pulse);
        g.beginPath();
        g.moveTo(px, py - s);
        g.lineTo(px + s, py);
        g.lineTo(px, py + s);
        g.lineTo(px - s, py);
        g.closePath();
        g.strokePath();
        g.fillStyle(0xffd166, pulse * 0.3);
        g.fillPath();
    }

    updateBlips(leader, followers, trackerActive, contacts, time, allEnemies = []) {
        this._updateInterference(time);
        const g = this.blipGraphics;
        g.clear();
        if (!this.scene.pathGrid) return;
        const pg = this.scene.pathGrid;
        const scale = this._mapScale;
        const offX = this._mapOffsetX;
        const offY = this._mapOffsetY;

        if (leader && leader.active && leader.alive !== false) {
            const tile = pg.worldToTile(leader.x, leader.y);
            const px = offX + tile.x * scale + scale / 2;
            const py = offY + tile.y * scale + scale / 2;
            const pulse = 0.7 + 0.3 * Math.sin(time * 0.005);
            g.fillStyle(0x44ffaa, pulse);
            g.fillCircle(px, py, 2.5);
        }

        if (followers) {
            for (const f of followers) {
                if (!f || !f.active || f.alive === false) continue;
                const tile = pg.worldToTile(f.x, f.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                g.fillStyle(0x44aadd, 0.65);
                g.fillCircle(px, py, 1.5);
            }
        }

        if (contacts) {
            for (const c of contacts) {
                if (!c) continue;
                const tile = pg.worldToTile(c.x, c.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                const flash = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.004 + px * 0.1));
                g.fillStyle(0xff4444, flash * 0.8);
                g.fillCircle(px, py, 2);
            }
        }

        // DEBUG: show all alive enemies as orange dots regardless of tracker state
        if (allEnemies) {
            for (const e of allEnemies) {
                if (!e || !e.active || e.isDying) continue;
                const tile = pg.worldToTile(e.x, e.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                g.fillStyle(0xff8800, 0.7);
                g.fillCircle(px, py, 1.5);
            }
        }

        this._drawObjectiveMarkers(this.objectiveGraphics, pg, scale, offX, offY);
    }

    _updateInterference(time) {
        if (!this.interferenceVideo || this.isFullscreen) return;

        if (this._interferenceEndAt === 0 && time >= this._nextInterferenceAt) {
            const duration = 280 + Math.random() * 520;
            const peakAlpha = 0.32 + Math.random() * 0.18;
            const fadeIn = duration * 0.2;
            const hold = duration * 0.45;
            const fadeOut = duration * 0.35;
            this._interferenceEndAt = time + duration;
            this.interferenceVideo.setVisible(true);
            this.scene.tweens.killTweensOf(this.interferenceVideo);
            this.scene.tweens.chain({
                targets: this.interferenceVideo,
                tweens: [
                    { alpha: peakAlpha, duration: fadeIn, ease: 'Sine.easeIn' },
                    { alpha: peakAlpha, duration: hold },
                    { alpha: 0, duration: fadeOut, ease: 'Sine.easeOut', onComplete: () => this.interferenceVideo?.setVisible(false) },
                ],
            });
            return;
        }

        if (time >= this._interferenceEndAt && this._interferenceEndAt > 0) {
            this._nextInterferenceAt = time + 7000 + Math.random() * 12000;
            this._interferenceEndAt = 0;
        }
    }

    toggleFullscreen() {
        if (this.isFullscreen) {
            this.closeFullscreen();
        } else {
            this.openFullscreen();
        }
    }

    openFullscreen() {
        if (this.isFullscreen) return;
        this.isFullscreen = true;

        this.container.setVisible(false);
        this.buttonContainer.setVisible(false);

        const W = CONFIG.GAME_WIDTH;
        const H = CONFIG.GAME_HEIGHT;

        this.fullscreenContainer = this.scene.add.container(0, 0);
        this.fullscreenContainer.setScrollFactor(0);
        this.fullscreenContainer.setDepth(240);

        // Semi-transparent backdrop — see game behind
        const backdrop = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x010810, 0.45);
        this.fullscreenContainer.add(backdrop);

        this.fullscreenBg = this.scene.add.graphics();
        this.fullscreenGrid = this.scene.add.graphics();
        this.fullscreenMap = this.scene.add.graphics();
        this.fullscreenBlips = this.scene.add.graphics();
        this.fullscreenObjectives = this.scene.add.graphics();
        this.fullscreenChrome = this.scene.add.graphics();

        const panelW = W - 80;
        const panelH = H - 80;
        const panelX = 40;
        const panelY = 40;

        this.fullscreenBg.fillStyle(0x010810, 0.7);
        this.fullscreenBg.fillRoundedRect(panelX, panelY, panelW, panelH, 4);

        this.fullscreenChrome.lineStyle(2, MAP_COLOR, 0.55);
        this.fullscreenChrome.strokeRoundedRect(panelX, panelY, panelW, panelH, 4);
        this.fullscreenChrome.lineStyle(1, MAP_COLOR, 0.18);
        this.fullscreenChrome.strokeRoundedRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6, 3);
        this.fullscreenChrome.lineStyle(1, 0x000000, 0.05);
        for (let sy = panelY; sy < panelY + panelH; sy += 3) {
            this.fullscreenChrome.lineBetween(panelX + 2, sy, panelX + panelW - 2, sy);
        }

        const pg = this.scene.pathGrid;
        if (pg) {
            const { scale, offX, offY } = this._computeFit(pg.width, pg.height, panelW, panelH);
            this._fsScale = scale;
            this._fsOffX = panelX + offX;
            this._fsOffY = panelY + offY;
            this._fsPanelW = panelW;
            this._fsPanelH = panelH;
            this._drawMapToGraphics(this.fullscreenMap, pg, scale, panelX + offX, panelY + offY, panelW, panelH);
            this._drawGridlines(this.fullscreenGrid, pg.width, pg.height, scale, panelX + offX, panelY + offY, panelX + panelW, panelY + panelH);
        }

        this.fullscreenLabel = this.scene.add.text(W / 2, panelY + 10, 'TACTICAL MAP \u2014 CLICK TO CLOSE', {
            fontSize: '11px',
            fontFamily: HUD_FONT,
            color: MAP_COLOR_CSS,
            shadow: { offsetX: 0, offsetY: 0, color: '#1a5588', blur: 4, stroke: true, fill: true },
        }).setOrigin(0.5, 0).setAlpha(0.7);

        this.fullscreenContainer.add([
            this.fullscreenBg, this.fullscreenGrid, this.fullscreenMap, this.fullscreenBlips,
            this.fullscreenObjectives, this.fullscreenChrome, this.fullscreenLabel,
        ]);

        // Click-to-close with slight delay so opening click doesn't close immediately
        this._fullscreenCloseHandler = () => {
            this.closeFullscreen();
        };
        this.scene.time.delayedCall(200, () => {
            if (this.isFullscreen) {
                this.scene.input.once('pointerdown', this._fullscreenCloseHandler);
            }
        });
    }

    /** Draw fullscreen objective markers */
    _drawFullscreenObjectives(g, pathGrid) {
        g.clear();
        if (!this._objectiveWorld || !pathGrid) return;
        const tile = pathGrid.worldToTile(this._objectiveWorld.x, this._objectiveWorld.y);
        const scale = this._fsScale || 1;
        const offX = this._fsOffX || 0;
        const offY = this._fsOffY || 0;
        const px = offX + tile.x * scale + scale / 2;
        const py = offY + tile.y * scale + scale / 2;
        const time = this.scene.time.now;
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.004);

        const s = 7;
        g.lineStyle(2, 0xffd166, pulse);
        g.beginPath();
        g.moveTo(px, py - s);
        g.lineTo(px + s, py);
        g.lineTo(px, py + s);
        g.lineTo(px - s, py);
        g.closePath();
        g.strokePath();
        g.fillStyle(0xffd166, pulse * 0.2);
        g.fillPath();
    }

    updateFullscreenBlips(leader, followers, trackerActive, contacts, time, allEnemies = []) {
        if (!this.isFullscreen || !this.fullscreenBlips) return;
        const g = this.fullscreenBlips;
        g.clear();
        const pg = this.scene.pathGrid;
        if (!pg) return;

        const scale = this._fsScale || 1;
        const offX = this._fsOffX || 0;
        const offY = this._fsOffY || 0;

        if (leader && leader.active && leader.alive !== false) {
            const tile = pg.worldToTile(leader.x, leader.y);
            const px = offX + tile.x * scale + scale / 2;
            const py = offY + tile.y * scale + scale / 2;
            const pulse = 0.7 + 0.3 * Math.sin(time * 0.005);
            g.fillStyle(0x44ffaa, pulse);
            g.fillCircle(px, py, 4);
            g.lineStyle(1, 0x44ffaa, pulse * 0.5);
            g.strokeCircle(px, py, 7);
        }

        if (followers) {
            for (const f of followers) {
                if (!f || !f.active || f.alive === false) continue;
                const tile = pg.worldToTile(f.x, f.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                g.fillStyle(0x44aadd, 0.7);
                g.fillCircle(px, py, 3);
            }
        }

        if (contacts) {
            for (const c of contacts) {
                if (!c) continue;
                const tile = pg.worldToTile(c.x, c.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                const flash = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.004 + px * 0.1));
                g.fillStyle(0xff4444, flash * 0.8);
                g.fillCircle(px, py, 3.5);
            }
        }

        // DEBUG: show all alive enemies as orange dots regardless of tracker state
        if (allEnemies) {
            for (const e of allEnemies) {
                if (!e || !e.active || e.isDying) continue;
                const tile = pg.worldToTile(e.x, e.y);
                const px = offX + tile.x * scale + scale / 2;
                const py = offY + tile.y * scale + scale / 2;
                g.fillStyle(0xff8800, 0.7);
                g.fillCircle(px, py, 2.5);
            }
        }

        if (this.fullscreenObjectives) {
            this._drawFullscreenObjectives(this.fullscreenObjectives, pg);
        }
    }

    closeFullscreen() {
        if (!this.isFullscreen) return;
        this.isFullscreen = false;

        if (this._fullscreenCloseHandler) {
            this.scene.input.off('pointerdown', this._fullscreenCloseHandler);
            this._fullscreenCloseHandler = null;
        }

        if (this.fullscreenContainer) {
            this.fullscreenContainer.destroy();
            this.fullscreenContainer = null;
        }
        this.fullscreenBg = null;
        this.fullscreenGrid = null;
        this.fullscreenMap = null;
        this.fullscreenBlips = null;
        this.fullscreenObjectives = null;
        this.fullscreenChrome = null;
        this.fullscreenLabel = null;

        this.container.setVisible(true);
        this.buttonContainer.setVisible(true);
    }

    getButtons() {
        return [this.trackButton, this.mapButton].filter(Boolean);
    }

    getButtonWorldBounds(button) {
        if (!button) return null;
        return {
            x: this.buttonContainer.x + button.x,
            y: this.buttonContainer.y + button.y,
            w: button.w,
            h: button.h,
        };
    }

    isPointerOverButton(px, py) {
        for (const btn of this.getButtons()) {
            const b = this.getButtonWorldBounds(btn);
            if (!b) continue;
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
        }
        return false;
    }

    isPointerOverPanel(px, py) {
        if (this.isFullscreen) return true;
        return px >= this.miniX && px <= this.miniX + this.miniW &&
               py >= this.miniY && py <= this.miniY + this.miniH;
    }

    destroy() {
        if (this._fullscreenCloseHandler) {
            this.scene.input.off('pointerdown', this._fullscreenCloseHandler);
        }
        if (this.interferenceVideo) this.scene.tweens.killTweensOf(this.interferenceVideo);
        if (this.fullscreenContainer) this.fullscreenContainer.destroy();
        if (this.container) this.container.destroy();
        if (this.buttonContainer) this.buttonContainer.destroy();
    }
}
