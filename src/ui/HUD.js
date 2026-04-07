const CARD_ORDER = Object.freeze([
    { key: 'leader', roleKey: 'leader', label: 'R. RODRIGUEZ' },
    { key: 'tech', roleKey: 'tech', label: 'M. HORROWITZ' },
    { key: 'medic', roleKey: 'medic', label: 'L. SHEEN' },
    { key: 'heavy', roleKey: 'heavy', label: 'T. CHANG' },
]);

import { CONFIG } from '../config.js';
import { getHudConfig } from '../settings/missionPackageRuntime.js';

const HUD_FONT = '"Share Tech Mono", "Consolas", monospace';
const HUD_NUMBER_FONT = 'SevenSegment, Alarm, "Share Tech Mono", monospace';

// ── Horizontal top-bar layout ──────────────────────────────────────────────
// Leader card is wider/taller; followers are smaller but same aspect ratio.
// All four cards sit in a row across the top of the screen.
const LEADER_W = 210;
const LEADER_H = 116;
const FOLLOWER_W = 165;
const FOLLOWER_H = 90;
const TOP_Y = 30;            // vertical offset from top of screen
const LEFT_X = 10;           // left margin
const CARD_GAP = 8;          // gap between cards
const HEAL_H = 16;           // heal button height below leader card
const HEAL_GAP = 4;          // gap between leader card and heal button

const HUD_COLORS = Object.freeze({
    panelFill: 0x020810,
    panelEdge: 0x4aa4d8,
    panelShadow: 0x000000,
    terminalBlue: '#7ecfff',
    vitalsGreen: '#33ff66',
    nameWhite: '#e8f0f8',
    ekgNominal: 0x33ff66,
    healthWarning: 0xffaa00,
    healthCritical: 0xff4444,
    buttonFill: 0x07172a,
    buttonStroke: 0x45b8ff,
    buttonHoverFill: 0x0e2a42,
    videoTint: 0x2a5a8c,
});

function makeGlow(color, blur = 8) {
    return { offsetX: 0, offsetY: 0, color, blur, stroke: true, fill: true };
}

function parseHexColor(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = value.trim().replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(normalized)) return parseInt(normalized, 16);
    }
    return fallback;
}

function resolveFontFamily(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
}

function clampAlpha(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? Phaser.Math.Clamp(number, 0, 1) : fallback;
}

function createCardSubDefaults(cardWidth, cardHeight, isLeader) {
    const ammoX = cardWidth - (isLeader ? 56 : 42);
    const ammoY = cardHeight - (isLeader ? 36 : 26);
    const ammoFontSize = isLeader ? 36 : 24;
    const defaults = {
        video: {
            relX: 0,
            relY: 0,
            width: cardWidth,
            height: cardHeight,
            color: '#2a5a8c',
            opacity: 0.46,
            videoAlpha: 0.65,
        },
        hp: {
            relX: 8,
            relY: 6,
            fontSize: isLeader ? 44 : 32,
            color: '#33ff66',
            opacity: 0.9,
            fontFamily: HUD_NUMBER_FONT,
        },
        ammo: {
            relX: ammoX,
            relY: ammoY,
            fontSize: ammoFontSize,
            color: '#ff6666',
            opacity: 0.8,
            fontFamily: HUD_NUMBER_FONT,
        },
        name: {
            relX: 8,
            relY: cardHeight - (isLeader ? 22 : 18),
            fontSize: isLeader ? 14 : 11,
            color: HUD_COLORS.nameWhite,
            opacity: 1,
            fontFamily: HUD_FONT,
        },
        ekg: {
            relX: 8,
            relY: Math.round((cardHeight - (isLeader ? 24 : 18)) / 2),
            width: cardWidth - 16,
            height: isLeader ? 24 : 18,
            opacity: 0.9,
            color: '#33ff66',
            color2: '#ffbb33',
        },
        button: {
            relX: 0,
            relY: cardHeight + HEAL_GAP,
            width: cardWidth,
            height: HEAL_H,
            color: '#7ecfff',
            borderColor: '#45b8ff',
            bgColor: '#07172a',
            opacity: 0.92,
            fontSize: 14,
            fontFamily: HUD_FONT,
        },
    };
    if (isLeader) {
        defaults.weaponName = {
            relX: ammoX - 4,
            relY: ammoY - 12,
            fontSize: 9,
            color: '#ff9999',
            opacity: 1,
            fontFamily: HUD_FONT,
        };
        defaults.overheat = {
            relX: 8,
            relY: ammoY + ammoFontSize + 18,
            width: cardWidth - 16,
            height: 4,
            color: '#ff4444',
            opacity: 0.9,
        };
    }
    return defaults;
}

function mergeHudSubConfig(defaults, overrides = {}) {
    const out = {};
    for (const [key, value] of Object.entries(defaults)) {
        out[key] = { ...value, ...(overrides[key] || {}) };
    }
    return out;
}

export class HUD {
    constructor(scene, weaponManager, leader) {
        this.scene = scene;
        this.weaponManager = weaponManager;
        this.leader = leader;
        this.cards = new Map();
        this._hudConfig = getHudConfig() || {};
        this._glitchTimers = new Map();

        this.createOverlay();
        this.createSquadCards();

        weaponManager.onWeaponChange = () => this.refreshNow();
        weaponManager.onAmmoChange = () => this.refreshNow();
        leader.onHealthChange = () => this.refreshNow();

        this._setupButtonInput();
        this.refreshNow();
        this.bootSequence();
        this.scene.time.delayedCall(500, () => this.refreshNow());
        this.scene.time.delayedCall(2000, () => this.refreshNow());
    }

    createOverlay() {
        this.overlayContainer = this.scene.add.container(0, 0);
        this.overlayContainer.setScrollFactor(0);
        this.overlayContainer.setDepth(200);

        // ── Screen-edge border frame with glow (10px inset) ──
        const sw = this.scene.scale.width;
        const sh = this.scene.scale.height;
        const inset = 10;
        const frameGlow = this.scene.add.graphics();
        frameGlow.setScrollFactor(0);
        frameGlow.setDepth(199);
        // Outer glow (wider, faint)
        frameGlow.lineStyle(4, 0x4aa4d8, 0.12);
        frameGlow.strokeRect(inset - 1, inset - 1, sw - inset * 2 + 2, sh - inset * 2 + 2);
        // Mid glow
        frameGlow.lineStyle(2, 0x4aa4d8, 0.25);
        frameGlow.strokeRect(inset, inset, sw - inset * 2, sh - inset * 2);
        // Core border
        frameGlow.lineStyle(1.5, 0x4aa4d8, 0.55);
        frameGlow.strokeRect(inset, inset, sw - inset * 2, sh - inset * 2);
        this.screenFrame = frameGlow;
    }

    _getCardConfig(roleKey) {
        const configKeys = { leader: 'leaderCard', tech: 'techCard', medic: 'medicCard', heavy: 'heavyCard' };
        const key = configKeys[roleKey];
        return (key && this._hudConfig[key] && typeof this._hudConfig[key] === 'object') ? this._hudConfig[key] : null;
    }

    createSquadCards() {
        let cursorX = LEFT_X;

        for (let i = 0; i < CARD_ORDER.length; i++) {
            const def = CARD_ORDER[i];
            const isLeader = (i === 0);
            const cardCfg = this._getCardConfig(def.roleKey);

            // Card dimensions — leader is larger
            const cardWidth = Math.round(cardCfg?.width || (isLeader ? LEADER_W : FOLLOWER_W));
            const cardHeight = Math.round(cardCfg?.height || (isLeader ? LEADER_H : FOLLOWER_H));
            const x = Math.round(cardCfg?.x ?? cursorX);
            const y = Math.round(cardCfg?.y ?? TOP_Y);
            const subConfig = mergeHudSubConfig(createCardSubDefaults(cardWidth, cardHeight, isLeader), cardCfg?._subs || {});
            const videoSub = subConfig.video;
            const hpSub = subConfig.hp;
            const ammoSub = subConfig.ammo;
            const nameSub = subConfig.name;
            const ekgSub = subConfig.ekg;
            const buttonSub = subConfig.button;
            const weaponSub = subConfig.weaponName || { relX: ammoSub.relX - 4, relY: ammoSub.relY - 12, fontSize: 9, color: '#ff9999', opacity: 1, fontFamily: HUD_FONT };
            const overheatSub = subConfig.overheat || { relX: 8, relY: ammoSub.relY + ammoSub.fontSize + 18, width: cardWidth - 16, height: 4, color: '#ff4444', opacity: 0.9 };
            const actionBarSub = subConfig.actionBar || { relX: ekgSub.relX, relY: ekgSub.relY + ekgSub.height + 2, width: ekgSub.width, height: 4, color: '#44aaff', opacity: 0.85 };

            cursorX = x + cardWidth + CARD_GAP;

            const container = this.scene.add.container(x, y);
            container.setScrollFactor(0);
            container.setDepth(200);

            // ── Panel background ──
            const panelShadow = this.scene.add.rectangle(3, 3, cardWidth, cardHeight, HUD_COLORS.panelShadow, 0.32).setOrigin(0);
            const panelFill = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, HUD_COLORS.panelFill, 0.06).setOrigin(0);

            const chrome = this.scene.add.graphics();
            // Outer glow (wider, faint blue bloom)
            chrome.lineStyle(4, 0x4aa4d8, 0.10);
            chrome.strokeRect(-1, -1, cardWidth + 2, cardHeight + 2);
            // Mid glow
            chrome.lineStyle(2.5, 0x4aa4d8, 0.22);
            chrome.strokeRect(0, 0, cardWidth, cardHeight);
            // Core border — 1.5px
            chrome.lineStyle(1.5, 0x4aa4d8, 0.75);
            chrome.strokeRect(0.5, 0.5, cardWidth - 1, cardHeight - 1);

            const panelScanlines = null; // scanlines removed

            // CRT vignette
            const vignette = this.scene.add.graphics();
            const vigEdge = 8;
            const vigAlpha = 0.10;
            vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, vigAlpha, vigAlpha, 0, 0);
            vignette.fillRect(0, 0, cardWidth, vigEdge);
            vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, vigAlpha, vigAlpha);
            vignette.fillRect(0, cardHeight - vigEdge, cardWidth, vigEdge);
            vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, vigAlpha, 0, vigAlpha, 0);
            vignette.fillRect(0, 0, vigEdge, cardHeight);
            vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, vigAlpha, 0, vigAlpha);
            vignette.fillRect(cardWidth - vigEdge, 0, vigEdge, cardHeight);

            // ── Video feed (full card background) ──
            const videoH = Math.round(videoSub.height || cardHeight);
            const videoKey = this.getPortraitVideoKey(def.roleKey);
            const vid = this.scene.add.video(Math.round(videoSub.relX || 0), Math.round(videoSub.relY || 0), videoKey);
            vid.setMute(true);
            vid.play(true);
            vid.setLoop(true);
            vid.setAlpha(clampAlpha(videoSub.videoAlpha, 0.65));
            vid.setTint(0xbbe0ff);
            vid.setOrigin(0, 0);
            // Shader pipelines removed

            const vidInter = this.scene.add.video(0, 0, 'interrupt_video');
            vidInter.setMute(true);
            vidInter.play(true);
            vidInter.setLoop(true);
            vidInter.setAlpha(0);
            vidInter.setOrigin(0, 0);
            vidInter.setVisible(false);
            // Shader pipelines removed

            // Dark panel behind data area (below video)
            const dataPanel = this.scene.add.rectangle(0, Math.round(cardHeight * 0.5), cardWidth, Math.round(cardHeight * 0.5), 0x020810, 0.50).setOrigin(0);

            const videoTint = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, parseHexColor(videoSub.color, HUD_COLORS.videoTint), clampAlpha(videoSub.opacity, 0.46))
                .setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
            const videoShade = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, 0x020810, 0.06).setOrigin(0);

            const scanlines = null; // scanlines removed

            const videoFrame = this.scene.add.graphics();
            // Video area border
            videoFrame.lineStyle(1, HUD_COLORS.panelEdge, 0.25);
            videoFrame.strokeRect(0.5, videoH - 0.5, cardWidth - 1, 1);

            // ── HP (top-left, green) ──
            const hpFontSize = Math.round(hpSub.fontSize || (isLeader ? 44 : 32));
            const hpX = Math.round(hpSub.relX || 8);
            const hpY = Math.round(hpSub.relY || 6);
            const hpGlow = this.scene.add.text(hpX - 1, hpY - 1, '99', {
                fontSize: `${hpFontSize + 4}px`, fontFamily: resolveFontFamily(hpSub.fontFamily, HUD_NUMBER_FONT), color: '#88ff99',
            }).setOrigin(0, 0).setAlpha(0.16);
            const hpValue = this.scene.add.text(hpX, hpY, '99', {
                fontSize: `${hpFontSize}px`, fontFamily: resolveFontFamily(hpSub.fontFamily, HUD_NUMBER_FONT), color: hpSub.color || HUD_COLORS.vitalsGreen,
                stroke: '#052010', strokeThickness: 4, shadow: makeGlow('#208040', 12),
            }).setOrigin(0, 0).setAlpha(clampAlpha(hpSub.opacity, 0.9));

            // ── Ammo (bottom-right, red per mockup) ──
            const ammoFontSize = Math.round(ammoSub.fontSize || (isLeader ? 36 : 24));
            const ammoX = Math.round(ammoSub.relX || (cardWidth - (isLeader ? 56 : 42)));
            const ammoY = Math.round(ammoSub.relY || (cardHeight - (isLeader ? 36 : 26)));
            const ammoGlow = this.scene.add.text(ammoX - 1, ammoY - 1, '99', {
                fontSize: `${ammoFontSize + 4}px`, fontFamily: resolveFontFamily(ammoSub.fontFamily, HUD_NUMBER_FONT), color: '#ff9999',
            }).setOrigin(0, 0).setAlpha(0.16);
            const ammoLabel = this.scene.add.text(ammoX, ammoY, '99', {
                fontSize: `${ammoFontSize}px`, fontFamily: resolveFontFamily(ammoSub.fontFamily, HUD_NUMBER_FONT), color: ammoSub.color || '#ff6666',
                stroke: '#220607', strokeThickness: 3, shadow: makeGlow('#8a2028', 8),
            }).setOrigin(0, 0).setAlpha(clampAlpha(ammoSub.opacity, 0.8));

            // ── EKG (vertically centred in card) ──
            const ekgX = Math.round(ekgSub.relX || 8);
            const ekgH = Math.round(ekgSub.height || (isLeader ? 24 : 18));
            const ekgY = Math.round(ekgSub.relY || Math.round((cardHeight - ekgH) / 2));
            const ekgW = Math.round(ekgSub.width || (cardWidth - 16));
            const ekg = this.scene.add.graphics();

            // ── Name (bottom-left) ──
            const nameFontSize = Math.round(nameSub.fontSize || (isLeader ? 14 : 11));
            const nameX = Math.round(nameSub.relX || 8);
            const nameY = Math.round(nameSub.relY || (cardHeight - (isLeader ? 22 : 18)));
            const titleGlow = this.scene.add.text(nameX, nameY, def.label, {
                fontSize: `${nameFontSize + 2}px`, fontFamily: resolveFontFamily(nameSub.fontFamily, HUD_FONT), color: '#e8f0ff', fontStyle: 'bold',
            }).setOrigin(0, 0).setAlpha(0.10);
            const title = this.scene.add.text(nameX, nameY, def.label, {
                fontSize: `${nameFontSize}px`, fontFamily: resolveFontFamily(nameSub.fontFamily, HUD_FONT), color: nameSub.color || HUD_COLORS.nameWhite,
                fontStyle: 'bold', stroke: '#03131b', strokeThickness: 2, shadow: makeGlow('#c8d8e8', 8),
            }).setOrigin(0, 0).setAlpha(clampAlpha(nameSub.opacity, 1));

            // ── HEAL button (leader only, below card) ──
            let heal;
            if (isLeader) {
                heal = this.createButton(
                    Math.round(buttonSub.relX || 0),
                    Math.round(buttonSub.relY || (videoH + HEAL_GAP)),
                    Math.round(buttonSub.width || cardWidth),
                    Math.round(buttonSub.height || HEAL_H),
                    parseHexColor(buttonSub.bgColor, HUD_COLORS.buttonFill),
                    parseHexColor(buttonSub.borderColor, HUD_COLORS.buttonStroke),
                    'HEAL',
                    buttonSub.color || '#7ecfff',
                    () => {
                        if (this.scene.inputHandler) this.scene.inputHandler.suppressClick = true;
                        const target = this.leader;
                        if (target) this.scene.startHealAction(target, this.scene.time.now, { auto: false });
                        if (typeof this.scene.playUiClickSfx === 'function') this.scene.playUiClickSfx(false);
                        this.scene.inputHandler?.consumeMenuClick?.();
                    },
                    `${Math.round(buttonSub.fontSize || 14)}px`,
                    {
                        bgAlpha: clampAlpha(buttonSub.opacity, 0.82),
                        fillAlpha: clampAlpha(buttonSub.opacity, 0.92),
                        strokeAlpha: 0.95,
                        fontFamily: resolveFontFamily(buttonSub.fontFamily, HUD_FONT),
                    }
                );
            } else {
                heal = { bg: null, text: null, x: 0, y: 0, width: 0, height: 0, onClick: () => {}, fill: 0, stroke: 0, color: '', _hovered: false };
            }

            // ── Weapon name (leader only, above ammo) ──
            const weaponNameLabel = this.scene.add.text(Math.round(weaponSub.relX || (ammoX - 4)), Math.round(weaponSub.relY || (ammoY - 12)), '', {
                fontSize: `${Math.round(weaponSub.fontSize || 9)}px`, fontFamily: resolveFontFamily(weaponSub.fontFamily, HUD_FONT), color: weaponSub.color || '#ff9999', shadow: makeGlow('#8a2028', 4),
            }).setOrigin(0, 0).setAlpha(clampAlpha(weaponSub.opacity, 1));
            weaponNameLabel.setVisible(isLeader);

            // ── Overheat indicator (leader only) ──
            const overheatBg = this.scene.add.rectangle(Math.round(overheatSub.relX || 8), Math.round(overheatSub.relY || (cardHeight - 8)), Math.round(overheatSub.width || (cardWidth - 16)), Math.round(overheatSub.height || 4), 0x1a0505, 0.7).setOrigin(0, 0);
            const overheatFill = this.scene.add.rectangle(Math.round(overheatSub.relX || 8), Math.round(overheatSub.relY || (cardHeight - 8)), 0, Math.round(overheatSub.height || 4), parseHexColor(overheatSub.color, 0xff4444), clampAlpha(overheatSub.opacity, 0.9)).setOrigin(0, 0);
            const overheatLabel = this.scene.add.text(Math.round(overheatSub.relX || (cardWidth - 40)), Math.round((overheatSub.relY || (cardHeight - 10)) - 2), 'HEAT', {
                fontSize: '7px', fontFamily: HUD_FONT, color: '#ff6666', shadow: makeGlow('#8a2028', 3),
            }).setOrigin(0, 0);
            overheatBg.setVisible(false);
            overheatFill.setVisible(false);
            overheatLabel.setVisible(false);

            // ── Data field labels ──
            const labelFontSize = isLeader ? 8 : 7;
            const labelAlpha = 0.72;
            const vitalLabel = this.scene.add.text(hpX, hpY - (isLeader ? 10 : 8), 'VITAL %', {
                fontSize: `${labelFontSize}px`, fontFamily: HUD_FONT, color: HUD_COLORS.vitalsGreen,
            }).setOrigin(0, 0).setAlpha(labelAlpha);
            const ammoHeaderLabel = this.scene.add.text(ammoX, ammoY - (isLeader ? 12 : 10), 'AMMO', {
                fontSize: `${labelFontSize}px`, fontFamily: HUD_FONT, color: '#ff6666',
            }).setOrigin(0, 0).setAlpha(labelAlpha);

            // ── Assemble container ──
            const parts = [
                panelShadow, panelFill, chrome,
                vid, vidInter, dataPanel, videoTint, videoShade, videoFrame,
                hpGlow, hpValue, ammoGlow, ammoLabel,
                ekg, titleGlow, title,
                vitalLabel, ammoHeaderLabel,
                weaponNameLabel, overheatBg, overheatFill, overheatLabel,
                vignette,
            ];
            if (heal.bg) parts.push(heal.bg, heal.text);
            container.add(parts);
            this.overlayContainer.add(container);

            // Glitch timer
            const now = this.scene.time.now;
            this._glitchTimers.set(def.key, { nextGlitchAt: now + 4000 + Math.random() * 12000, glitchEndAt: 0 });

            this.cards.set(def.key, {
                def, container, vid, vidInter, videoTint, videoShade,
                ekg, title, titleGlow,
                ammoLabel, ammoGlow,
                hpValue, hpGlow, heal,
                monitor: { bg: null, text: null, x: 0, y: 0, width: 0, height: 0, onClick: () => {}, fill: 0, stroke: 0, color: '', _hovered: false },
                weaponNameLabel, overheatBg, overheatFill, overheatLabel,
                actionBar: null, actionBarLabel: null,
                baseX: x, baseY: y,
                cardWidth, cardHeight, cardScale: 1,
                videoH,
                videoStyle: { x: Math.round(videoSub.relX || 0), y: Math.round(videoSub.relY || 0), width: Math.round(videoSub.width || cardWidth), height: Math.round(videoSub.height || videoH), tintAlpha: clampAlpha(videoSub.opacity, 0.46), tintColor: parseHexColor(videoSub.color, HUD_COLORS.videoTint), videoAlpha: clampAlpha(videoSub.videoAlpha, 0.8) },
                titleStyle: { color: nameSub.color || HUD_COLORS.nameWhite, alpha: clampAlpha(nameSub.opacity, 1) },
                ammoStyle: { color: ammoSub.color || '#ff6666', alpha: clampAlpha(ammoSub.opacity, 0.8) },
                hpStyle: { color: hpSub.color || HUD_COLORS.vitalsGreen, alpha: clampAlpha(hpSub.opacity, 0.9) },
                ekgLayout: { x: ekgX, y: ekgY, w: ekgW, h: ekgH },
                actionBarStyle: { relX: Math.round(actionBarSub.relX || ekgX), relY: Math.round(actionBarSub.relY || (ekgY + ekgH + 2)), width: Math.round(actionBarSub.width || ekgW), height: Math.round(actionBarSub.height || 4), color: actionBarSub.color || '#44aaff', opacity: clampAlpha(actionBarSub.opacity, 0.85) },
                overheatStyle: { relX: Math.round(overheatSub.relX || ammoX), relY: Math.round(overheatSub.relY || (ammoY + ammoFontSize + 18)), width: Math.round(overheatSub.width || 80), height: Math.round(overheatSub.height || 4), color: overheatSub.color || '#ff4444', opacity: clampAlpha(overheatSub.opacity, 0.9) },
                _ekgTimer: 0, _ammoFlashTimer: 0, _deadFlickerTimer: 0,
            });

            this.syncVideoFrame(vid, Math.round(videoSub.width || cardWidth), Math.round(videoSub.height || videoH), Math.round(videoSub.relX || 0), Math.round(videoSub.relY || 0));
            this.syncVideoFrame(vidInter, cardWidth, cardHeight, 0, 0);
        }
    }

    createButton(x, y, width, height, fill, stroke, label, color, onClick, fontSize = '18px', options = {}) {
        const bgAlpha = typeof options.bgAlpha === 'number' ? options.bgAlpha : 0.82;
        const fillAlpha = typeof options.fillAlpha === 'number' ? options.fillAlpha : 0.92;
        const strokeAlpha = typeof options.strokeAlpha === 'number' ? options.strokeAlpha : 0.95;
        const fontFamily = resolveFontFamily(options.fontFamily, HUD_FONT);
        const bg = this.scene.add.rectangle(x, y, width, height, fill, bgAlpha).setOrigin(0);
        bg.setStrokeStyle(2, stroke, 0.95);
        bg.setFillStyle(fill, fillAlpha);
        const text = this.scene.add.text(x + width / 2, y + height / 2, label, {
            fontSize, fontFamily, color,
            stroke: '#03131b', strokeThickness: 3, shadow: makeGlow('#48aee0', 10),
        }).setOrigin(0.5);
        bg.setStrokeStyle(2, stroke, strokeAlpha);
        return { bg, text, x, y, width, height, onClick, fill, stroke, color, bgAlpha: fillAlpha, strokeAlpha, _hovered: false };
    }

    _getButtonWorldBounds(card, button) {
        const cx = card.baseX;
        const cy = card.baseY;
        return { x: cx + button.x, y: cy + button.y, w: button.width, h: button.height };
    }

    _setupButtonInput() {
        this._allButtons = [];
        for (const card of this.cards.values()) {
            if (card.heal.bg) this._allButtons.push({ card, button: card.heal });
        }

        this._pointerMoveHandler = (pointer) => {
            const px = pointer.x;
            const py = pointer.y;
            let anyCursor = false;
            for (const { card, button } of this._allButtons) {
                const b = this._getButtonWorldBounds(card, button);
                const inside = px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
                if (inside && !button._hovered) {
                    button._hovered = true;
                    button.bg.setFillStyle(HUD_COLORS.buttonHoverFill, 1);
                    button.bg.setStrokeStyle(2, 0x7ecfff, 1);
                    button.text.setColor('#ffffff');
                } else if (!inside && button._hovered) {
                    button._hovered = false;
                    button.bg.setFillStyle(button.fill, button.bgAlpha ?? 0.92);
                    button.bg.setStrokeStyle(2, button.stroke, button.strokeAlpha ?? 0.95);
                    button.text.setColor(button.color);
                }
                if (inside) anyCursor = true;
            }
            this.scene.input.setDefaultCursor(anyCursor ? 'pointer' : 'default');
        };

        this._pointerDownButtonHandler = (pointer) => {
            const px = pointer.x;
            const py = pointer.y;
            for (const { card, button } of this._allButtons) {
                const b = this._getButtonWorldBounds(card, button);
                if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
                button.bg.setFillStyle(0x1a4466, 1);
                button.bg.setStrokeStyle(2, 0xaaddff, 1);
                button.text.setColor('#aaddff');
                if (this.scene.inputHandler) this.scene.inputHandler.suppressClick = true;
                this.scene.inputHandler?.consumeMenuClick?.();
                button.onClick(pointer);
                this.scene.time.delayedCall(120, () => {
                    if (button._hovered) {
                        button.bg.setFillStyle(HUD_COLORS.buttonHoverFill, 1);
                        button.bg.setStrokeStyle(2, 0x7ecfff, 1);
                        button.text.setColor('#ffffff');
                    } else {
                        button.bg.setFillStyle(button.fill, button.bgAlpha ?? 0.92);
                        button.bg.setStrokeStyle(2, button.stroke, button.strokeAlpha ?? 0.95);
                        button.text.setColor(button.color);
                    }
                });
                return;
            }
        };

        this.scene.input.on('pointermove', this._pointerMoveHandler);
        this.scene.input.on('pointerdown', this._pointerDownButtonHandler);
    }

    isPointerOverButton(px, py) {
        if (!this._allButtons) return false;
        for (const { card, button } of this._allButtons) {
            const b = this._getButtonWorldBounds(card, button);
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return true;
        }
        return false;
    }

    updateCardActionBar(card, cardKey, time) {
        const scene = this.scene;
        let progress = -1;
        let barLabel = '';
        let barColor = 0x33cc77;

        const heal = scene.healAction;
        if (heal) {
            const isTarget = (heal.targetRoleKey || 'leader') === cardKey;
            const isOperator = (heal.operatorRoleKey || 'leader') === cardKey;
            if (isTarget || isOperator) {
                const elapsed = time - heal.startedAt;
                const duration = heal.completeAt - heal.startedAt;
                progress = Phaser.Math.Clamp(elapsed / Math.max(1, duration), 0, 1);
                barLabel = isTarget ? 'HEALING' : 'ADMIN MED';
                barColor = 0x33cc77;
            }
        }

        // Render progress inside the HEAL button (leader card only)
        const btn = card.heal;
        if (btn.bg) {
            if (progress >= 0) {
                // Create fill overlay on demand
                if (!card._healFillGfx) {
                    card._healFillGfx = this.scene.add.graphics();
                    card.container.add(card._healFillGfx);
                }
                const gfx = card._healFillGfx;
                gfx.clear();
                gfx.setVisible(true);
                // Progress fill inside button bounds
                const fw = Math.round(btn.width * progress);
                gfx.fillStyle(barColor, 0.65);
                gfx.fillRect(btn.x, btn.y, fw, btn.height);
                // Bright top edge
                gfx.fillStyle(0xffffff, 0.18);
                gfx.fillRect(btn.x, btn.y, fw, 1);
                // Update button text to show action
                this.setTextIfChanged(btn.text, barLabel);
                btn.text.setColor('#ffffff');
            } else {
                // No active action — hide fill, reset button text
                if (card._healFillGfx) { card._healFillGfx.clear(); card._healFillGfx.setVisible(false); }
                this.setTextIfChanged(btn.text, 'HEAL');
                if (!btn._hovered) btn.text.setColor(btn.color || '#7ecfff');
            }
        }
    }

    getPortraitVideoKey(roleKey) {
        if (roleKey === 'heavy') return 'marine_4_video';
        if (roleKey === 'tech') return 'marine_2_video';
        if (roleKey === 'medic') return 'marine_3_video';
        return 'marine_1_video';
    }

    syncVideoFrame(video, targetW, targetH, posX, posY) {
        if (!video) return;
        // Edge/Chrome quirk: Native dimensions might be 0 before first frame decode.
        // setDisplaySize with 0 dimensions leads to Scale=Infinity/NaN which breaks alignment.
        if (video.width === 0 || video.height === 0) return;

        video.setDisplaySize(targetW, targetH);
        video.setPosition(posX, posY);
    }

    getMarineAmmoSnapshot(cardKey) {
        if (cardKey !== 'leader') return null;
        const weaponKey = this.weaponManager?.currentWeaponKey || 'pulseRifle';
        if (weaponKey !== 'pulseRifle') {
            return { ammo: Math.max(0, Math.floor(this.weaponManager?.ammo?.[weaponKey] || 0)), isReloading: false, isFiring: false };
        }
        return {
            ammo: Math.max(0, Math.floor(Number(this.weaponManager?.pulseAmmo) || 0)),
            isReloading: false,
            isFiring: this.weaponManager?.isFiringPulse === true,
        };
    }

    updateSquad(marines, time, delta = 16.6) {
        const byRole = new Map();
        for (const marine of marines || []) {
            if (!marine) continue;
            byRole.set(marine.roleKey || 'leader', marine);
        }

        for (const [cardKey, card] of this.cards.entries()) {
            const marine = byRole.get(cardKey);
            const alive = !!(marine && marine.active !== false && marine.alive !== false);

            // ── Interference glitch ──
            const glitchState = this._glitchTimers.get(cardKey);
            if (alive && glitchState) {
                if (glitchState.glitchEndAt === 0 && time >= glitchState.nextGlitchAt) {
                    const duration = 400 + Math.random() * 600;
                    const fadeIn = duration * 0.25, hold = duration * 0.5, fadeOut = duration * 0.25;
                    glitchState.glitchEndAt = time + duration;
                    if (card.vidInter) {
                        card.vidInter.setVisible(true);
                        card.vidInter.setTint(0xaaccff);
                        this.syncVideoFrame(card.vidInter, card.cardWidth, card.cardHeight, 0, 0);
                        this.scene.tweens.killTweensOf(card.vidInter);
                        this.scene.tweens.chain({
                            targets: card.vidInter,
                            tweens: [
                                { alpha: 0.5, duration: fadeIn, ease: 'Sine.easeIn' },
                                { alpha: 0.5, duration: hold },
                                { alpha: 0, duration: fadeOut, ease: 'Sine.easeOut', onComplete: () => { card.vidInter?.setVisible(false); } },
                            ],
                        });
                    }
                } else if (time >= glitchState.glitchEndAt && glitchState.glitchEndAt > 0) {
                    glitchState.nextGlitchAt = time + 6000 + Math.random() * 9000;
                    glitchState.glitchEndAt = 0;
                }
            }

            card.vid?.setVisible(alive);
            if (!alive) {
                card.vidInter?.setVisible(true);
                if (card.vidInter) {
                    this.scene.tweens.killTweensOf(card.vidInter);
                    card.vidInter.setAlpha(0.88);
                    card.vidInter.setTint(0xffffff);
                }
                if (card.videoTint) card.videoTint.setAlpha(Math.min(0.12, 0.46 * 0.18));
                if (card.videoShade) card.videoShade.setFillStyle(0x000000, 0.35);
            } else {
                if (card.videoTint) card.videoTint.setAlpha(0.46);
                if (card.videoShade) card.videoShade.setFillStyle(0x020810, 0.12);
            }
            this.syncVideoFrame(card.vid, card.cardWidth, card.videoH, 0, 0);
            this.syncVideoFrame(card.vidInter, card.cardWidth, card.cardHeight, 0, 0);

            // ── HP ──
            const maxHp = Math.max(1, Number(marine?.maxHealth) || 100);
            const hp = Math.max(0, Number(marine?.health) || 0);
            const hpPct = hp / maxHp;
            const hpVal = Math.min(99, Math.round(hpPct * 100));

            this.setTextIfChanged(card.title, alive ? card.def.label : `${card.def.label} [KIA]`);
            this.setTextIfChanged(card.titleGlow, alive ? card.def.label : `${card.def.label} [KIA]`);

            let deadReadout = '—';
            if (!alive) {
                card._deadFlickerTimer = (card._deadFlickerTimer || 0) + (delta / 1000);
                card._ammoFlashTimer = 0;
                const flicker = Math.sin(card._deadFlickerTimer * 4.7) + Math.sin(card._deadFlickerTimer * 7.3) * 0.6;
                deadReadout = flicker > 0.3 ? '—' : '';
            }

            this.setTextIfChanged(card.hpValue, alive ? String(Math.min(99, Math.round(hpVal))).padStart(2, '0') : deadReadout);
            this.setTextIfChanged(card.hpGlow, alive ? String(Math.min(99, Math.round(hpVal))).padStart(2, '0') : deadReadout);

            // ── Ammo ──
            const ammo = this.getMarineAmmoSnapshot(cardKey);
            const leaderPulse = cardKey === 'leader' && (this.weaponManager?.currentWeaponKey === 'pulseRifle');
            const showLeaderAmmo = cardKey === 'leader';
            if (!leaderPulse && showLeaderAmmo) {
                const ammoText = alive && ammo ? String(Math.min(999, ammo.ammo)).padStart(ammo.ammo >= 100 ? 3 : 2, '0') : deadReadout;
                this.setTextIfChanged(card.ammoLabel, ammoText);
                this.setTextIfChanged(card.ammoGlow, ammoText);
            } else if (!showLeaderAmmo) {
                this.setTextIfChanged(card.ammoLabel, '');
                this.setTextIfChanged(card.ammoGlow, '');
            }

            if (alive) {
                const firingPulse = ammo?.isFiring ? (0.88 + 0.12 * Math.sin(time * 0.06)) : 0;
                const ammoAlpha = ammo?.isFiring ? 1 : (card.ammoStyle?.alpha ?? 0.8);
                const ammoGlowAlpha = ammo?.isFiring ? (0.72 + firingPulse * 0.26) : Math.max(0.25, (card.ammoStyle?.alpha ?? 0.8) * 0.5);
                card.ammoLabel.setAlpha(showLeaderAmmo ? ammoAlpha : 0);
                card.ammoGlow.setAlpha(showLeaderAmmo ? ammoGlowAlpha : 0);
                card.hpValue.setAlpha(card.hpStyle?.alpha ?? 0.9);
                card.hpGlow.setAlpha(Math.max(0.2, (card.hpStyle?.alpha ?? 0.9) * 0.45));
                if (!leaderPulse && showLeaderAmmo) {
                    if (ammo?.isFiring) {
                        card.ammoLabel.setColor('#fff3c8');
                        card.ammoGlow.setColor('#ffd37a');
                    } else {
                        card.ammoLabel.setColor(card.ammoStyle?.color || '#ff6666');
                        card.ammoGlow.setColor('#ff9999');
                    }
                }
                const hpColor = hpPct < 0.25 ? '#ff4444' : hpPct < 0.5 ? '#ffaa00' : (card.hpStyle?.color || HUD_COLORS.vitalsGreen);
                card.hpValue.setColor(hpColor);
            } else {
                const flickAlpha = 0.25 + 0.2 * Math.sin((card._deadFlickerTimer || 0) * 5.1);
                card.ammoLabel.setAlpha(showLeaderAmmo ? flickAlpha : 0);
                card.ammoGlow.setAlpha(showLeaderAmmo ? (flickAlpha * 0.5) : 0);
                card.hpValue.setAlpha(flickAlpha);
                card.hpGlow.setAlpha(flickAlpha * 0.5);
                if (showLeaderAmmo) {
                    card.ammoLabel.setColor('#662222');
                    card.ammoGlow.setColor('#441111');
                }
                card.hpValue.setColor('#662222');
                card.hpGlow.setColor('#441111');
            }

            // ── EKG ──
            const g = card.ekg;
            g.clear();
            const ekgX = card.ekgLayout.x;
            const ekgY = card.ekgLayout.y;
            const ekgW = card.ekgLayout.w;
            const ekgH = card.ekgLayout.h;
            const ekgPrimaryColor = 0x33ff66;
            const ekgSecondaryColor = 0xffbb33;

            if (alive) {
                const contacts = this.scene.enemyManager?.getMotionContacts?.() || [];
                let minDist = 9999;
                for (const contact of contacts) {
                    const d = Phaser.Math.Distance.Between(marine.x, marine.y, contact.x, contact.y);
                    if (d < minDist) minDist = d;
                }
                const proximity = Phaser.Math.Clamp(1 - (minDist / 400), 0, 1);
                const stress = (1 - hpPct) * 0.5 + proximity * 0.5;
                const bpm = 70 + stress * 110;

                // Advance timer in real seconds so scroll speed is frame-rate independent
                const delta = this.scene.game.loop.delta || 16.67;
                card._ekgTimer += delta / 1000;

                if (cardKey === 'leader' && this.scene.sfx) this.scene.sfx.playHeartbeat(bpm);

                const step = 2;
                const numPoints = Math.ceil(ekgW / step);
                const midY = ekgY + ekgH / 2;
                const vGap = ekgH * 0.4;

                // Scroll window is always fixed (4 seconds of history) — scroll speed NEVER changes.
                // Only beatFreq (Hz) and amplitude change with stress.
                const totalWindow = 4.0; // seconds of history shown across full width
                const timePerPixel = totalWindow / numPoints;

                // Beat frequency: 0.5 Hz at rest = 1 beat per 2s; up to 1.8 Hz under max stress
                const beatFreq  = Phaser.Math.Linear(0.5, 1.8, stress);
                const plethFreq = beatFreq * 0.97; // slight offset for realism
                const plethPhaseOffset = 0.35 / beatFreq; // physical delay in seconds

                const ekgAmpMul   = Phaser.Math.Linear(0.85, 1.45, stress);
                const plethAmpMul = Phaser.Math.Linear(0.92,  1.4,  stress);
                const amp = ekgH * 0.8 * ekgAmpMul;

                // Green cardiac PQRST
                g.beginPath();
                g.lineStyle(1.5, ekgPrimaryColor, 0.9);
                for (let i = 0; i < numPoints; i++) {
                    const px = ekgX + i * step;
                    // t = absolute time for this pixel's historical position
                    const t = card._ekgTimer - (numPoints - 1 - i) * timePerPixel;
                    let py = midY - vGap;
                    // Normalise to 0..10 phase space for PQRST shapes
                    const phase = (((t * beatFreq) % 1.0 + 1.0) % 1.0) * 10;
                    if (phase >= 0.6 && phase < 1.4) py -= Math.sin((phase - 0.6) * Math.PI / 0.8) * (amp * 0.12);
                    else if (phase >= 1.8 && phase < 2.0) py += ((phase - 1.8) / 0.2) * (amp * 0.1);
                    else if (phase >= 2.0 && phase < 2.25) { const r = (phase - 2.0) / 0.25; py -= (r * (amp * 0.85)) - (amp * 0.1 * (1 - r)); }
                    else if (phase >= 2.25 && phase < 2.55) { const r = (phase - 2.25) / 0.3; py -= (1 - r) * (amp * 0.85); py += r * (amp * 0.18); }
                    else if (phase >= 2.55 && phase < 2.75) py += (1 - (phase - 2.55) / 0.2) * (amp * 0.18);
                    else if (phase >= 3.4 && phase < 4.4) py -= Math.sin((phase - 3.4) * Math.PI / 1.0) * (amp * 0.2);
                    if (i === 0) g.moveTo(px, Math.round(py));
                    else g.lineTo(px, Math.round(py));
                }
                g.strokePath();

                // Orange SpO2 plethysmograph (fixed physical phase delay from cardiac)
                g.beginPath();
                g.lineStyle(1.5, ekgSecondaryColor, 0.75);
                for (let i = 0; i < numPoints; i++) {
                    const px = ekgX + i * step;
                    const t = card._ekgTimer - (numPoints - 1 - i) * timePerPixel + plethPhaseOffset;
                    let py = midY + vGap;
                    const plethAmp = amp * 0.35 * plethAmpMul;
                    const phase = (((t * plethFreq) % 1.0 + 1.0) % 1.0) * 8;
                    if (phase < 0.6) py -= (phase / 0.6) * plethAmp;
                    else if (phase < 1.3) { const d = (phase - 0.6) / 0.7; py -= (1 - d) * plethAmp; if (d > 0.35 && d < 0.65) py -= Math.sin((d - 0.35) * Math.PI / 0.3) * (amp * 0.08 * plethAmpMul); }
                    else if (phase < 3.0) { const d = (phase - 1.3) / 1.7; py -= (1 - d) * (amp * 0.04 * plethAmpMul); }
                    if (i === 0) g.moveTo(px, Math.round(py));
                    else g.lineTo(px, Math.round(py));
                }
                g.strokePath();
            } else {
                // Dead flatlines
                const flickTimer = card._deadFlickerTimer || 0;
                const step = 2;
                const numPts = Math.ceil(ekgW / step);
                const vGap = ekgH * 0.4;
                const midY = ekgY + ekgH / 2;

                const flickAlpha1 = 0.3 + 0.2 * Math.sin(flickTimer * 5.1);
                g.beginPath();
                g.lineStyle(1.5, ekgPrimaryColor, flickAlpha1);
                for (let i = 0; i < numPts; i++) {
                    const px = ekgX + i * step;
                    const noise = Math.sin(flickTimer * 13.7 + i * 2.3) * Math.sin(flickTimer * 7.1 + i * 4.1);
                    const jitter = noise > 0.7 ? (noise - 0.7) * 6 * (Math.random() > 0.5 ? 1 : -1) : 0;
                    if (i === 0) g.moveTo(px, Math.round(midY - vGap + jitter));
                    else g.lineTo(px, Math.round(midY - vGap + jitter));
                }
                g.strokePath();

                const flickAlpha2 = 0.25 + 0.2 * Math.sin(flickTimer * 4.3 + 1.2);
                g.beginPath();
                g.lineStyle(1.5, ekgSecondaryColor, flickAlpha2);
                for (let i = 0; i < numPts; i++) {
                    const px = ekgX + i * step;
                    const noise = Math.sin(flickTimer * 11.3 + i * 3.1) * Math.sin(flickTimer * 6.7 + i * 5.3);
                    const jitter = noise > 0.7 ? (noise - 0.7) * 5 * (Math.random() > 0.5 ? 1 : -1) : 0;
                    if (i === 0) g.moveTo(px, Math.round(midY + vGap + jitter));
                    else g.lineTo(px, Math.round(midY + vGap + jitter));
                }
                g.strokePath();
            }

            card.container.setPosition(card.baseX, card.baseY);
            this.updateCardActionBar(card, cardKey, time);

            // ── Weapon name (leader only) ──
            if (cardKey === 'leader' && card.weaponNameLabel) {
                const wk = this.weaponManager?.currentWeaponKey || 'pulseRifle';
                const wDef = this.weaponManager?.getRuntimeWeaponDef?.(wk);
                const wName = (wDef?.name || wk).toUpperCase();
                this.setTextIfChanged(card.weaponNameLabel, wName);
            }

            // ── Pulse rifle counter (leader + followers) ──
            if (card.overheatBg) {
                let pulseAmmo, isOverheated, isFiring, showPulse, pulseTriggerHeld, pulseUnlockAt;
                const lowPulseWarningAmmo = 15;
                if (cardKey === 'leader') {
                    const wk = this.weaponManager?.currentWeaponKey || 'pulseRifle';
                    showPulse = alive && wk === 'pulseRifle';
                    pulseAmmo = Math.floor(Number(this.weaponManager?.pulseAmmo) || 0);
                    isOverheated = this.weaponManager?.isOverheated === true;
                    isFiring = this.weaponManager?.isFiringPulse === true;
                    pulseTriggerHeld = this.weaponManager?.pulseTriggerHeld === true;
                    pulseUnlockAt = Number(this.weaponManager?.pulseUnlockAt) || 20;
                } else {
                    showPulse = false;
                    pulseAmmo = 0;
                    isOverheated = false;
                    isFiring = false;
                    pulseTriggerHeld = false;
                    pulseUnlockAt = 20;
                }
                if (showPulse) {
                    const pulseText = String(Math.min(99, Math.max(0, pulseAmmo))).padStart(2, '0');
                    this.setTextIfChanged(card.ammoLabel, pulseText);
                    this.setTextIfChanged(card.ammoGlow, pulseText);
                }
                card.overheatBg.setVisible(false);
                card.overheatFill.setVisible(false);
                if (showPulse && isOverheated) {
                    card.overheatLabel.setVisible(true);
                    if (cardKey === 'leader' && pulseTriggerHeld && pulseAmmo < pulseUnlockAt) {
                        card.overheatLabel.setColor('#ff9900');
                        this.setTextIfChanged(card.overheatLabel, 'REL');
                    } else {
                        card.overheatLabel.setColor('#ff2200');
                        this.setTextIfChanged(card.overheatLabel, 'OVHT');
                    }
                } else {
                    card.overheatLabel.setVisible(false);
                }
                if (showPulse && isOverheated) {
                    card._ammoFlashTimer = (card._ammoFlashTimer || 0) + (delta / 1000);
                    const flashPhase = Math.sin(card._ammoFlashTimer * 8) > 0;
                    card.ammoLabel.setColor(flashPhase ? '#ff0000' : '#880000');
                    card.ammoGlow.setColor(flashPhase ? '#ff4444' : '#aa2222');
                    card.ammoLabel.setAlpha(1);
                    card.ammoGlow.setAlpha(0.92);
                } else if (showPulse && isFiring && !isOverheated) {
                    card._ammoFlashTimer = (card._ammoFlashTimer || 0) + (delta / 1000);
                    const firePhase = Math.sin(card._ammoFlashTimer * 18) > 0;
                    card.ammoLabel.setColor(firePhase ? '#ff5a00' : '#ffb347');
                    card.ammoGlow.setColor(firePhase ? '#ff2a00' : '#ffd27a');
                    card.ammoLabel.setAlpha(1);
                    card.ammoGlow.setAlpha(firePhase ? 1 : 0.9);
                } else if (showPulse && pulseAmmo <= lowPulseWarningAmmo && pulseAmmo > 0) {
                    card._ammoFlashTimer = (card._ammoFlashTimer || 0) + (delta / 1000);
                    const warnPulse = 0.5 + 0.5 * Math.sin(card._ammoFlashTimer * 5);
                    const warnAlpha = 0.55 + warnPulse * 0.45;
                    const r = 255, gg = Math.round(120 + warnPulse * 90), b = Math.round(28 + warnPulse * 36);
                    card.ammoLabel.setColor(`#${r.toString(16)}${gg.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
                    card.ammoGlow.setColor(warnPulse > 0.6 ? '#ffd86a' : '#ff9f3a');
                    card.ammoLabel.setAlpha(warnAlpha);
                    card.ammoGlow.setAlpha(Math.max(0.45, warnAlpha - 0.05));
                } else {
                    card.ammoLabel.setColor(card.ammoStyle?.color || '#ff6666');
                    card.ammoGlow.setColor('#ff9999');
                    card.ammoLabel.setAlpha(card.ammoStyle?.alpha ?? 0.8);
                    card.ammoGlow.setAlpha(Math.max(0.25, (card.ammoStyle?.alpha ?? 0.8) * 0.5));
                    card._ammoFlashTimer = 0;
                }
            }

            // ── Ammo warning flash ──
            const _isPulseCard = leaderPulse || cardKey !== 'leader';
            if (alive && ammo && !_isPulseCard) {
                const magSize = this.scene.marineAmmo?.get(cardKey)?.magSize || 99;
                const ammoPct = ammo.ammo / Math.max(1, magSize);
                if (ammoPct <= 0.25 && ammoPct > 0) {
                    card._ammoFlashTimer = (card._ammoFlashTimer || 0) + (delta / 1000);
                    const flashPhase = Math.sin(card._ammoFlashTimer * 6) > 0;
                    card.ammoLabel.setColor(flashPhase ? '#ffffff' : '#ff2222');
                    card.ammoGlow.setColor(flashPhase ? '#ffcccc' : '#ff4444');
                } else {
                    card._ammoFlashTimer = 0;
                    card.ammoLabel.setColor(card.ammoStyle?.color || '#ff6666');
                    card.ammoGlow.setColor('#ff9999');
                }
            }
        }
    }

    refreshNow(delta = 16.6) {
        this.updateSquad(this.scene?.squadSystem?.getAllMarines?.() || [this.leader], this.scene.time.now, delta);
    }

    setTextIfChanged(target, value) {
        if (!target) return;
        if (target.text !== value) target.setText(value);
    }

    bootSequence() {
        let stagger = 100;
        for (const card of this.cards.values()) {
            card.container.setAlpha(0);
            const cardRef = card;
            this.scene.tweens.addCounter({
                from: 0, to: 1, delay: stagger, duration: 280,
                onUpdate: (tween) => {
                    const progress = tween.getValue();
                    cardRef.container.setAlpha(progress > 0.85 ? 1 : (Math.random() > (1 - progress * 1.2) ? 0.85 : 0.05));
                },
                onComplete: () => cardRef.container.setAlpha(1),
            });
            stagger += 260;
        }
    }

    destroy() {
        if (this._pointerMoveHandler) this.scene.input.off('pointermove', this._pointerMoveHandler);
        if (this._pointerDownButtonHandler) this.scene.input.off('pointerdown', this._pointerDownButtonHandler);
        this.scene.input.setDefaultCursor('default');
        if (this.weaponManager) { this.weaponManager.onWeaponChange = null; this.weaponManager.onAmmoChange = null; }
        if (this.leader) this.leader.onHealthChange = null;
        if (this.screenFrame) this.screenFrame.destroy();
        if (this.overlayContainer) this.overlayContainer.destroy();
        for (const card of this.cards.values()) card.container.destroy();
        this.cards.clear();
    }
}
