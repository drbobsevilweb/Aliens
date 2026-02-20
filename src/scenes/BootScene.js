import { CONFIG } from '../config.js';
import { MISSION_SET } from '../data/missionData.js';
import { loadCampaignProgress, resetCampaignProgress } from '../settings/campaignProgress.js';
import { loadRuntimeSettings } from '../settings/runtimeSettings.js';
import { TiltShiftPipeline } from '../graphics/TiltShiftPipeline.js';
import { ScanlinePipeline } from '../graphics/ScanlinePipeline.js';
import { AlienTonePipeline } from '../graphics/AlienTonePipeline.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        this.generateTileset();
        this.generateLeaderTexture();
        this.generateMarineTextures();
        this.generateAlienTextures();
        this.generateBulletTextures();
        this.generateFxTextures();
        this.generatePropTextures();
        this.generateWeaponIcons();
        this.generateDoorTextures();
        this.registerPipelines();
        const params = new URLSearchParams(window.location.search);
        const missionOrder = MISSION_SET.map((m) => m.id);
        const missionLookup = new Set(missionOrder);
        const explicitMission = String(params.get('mission') || '').trim();
        const resetCampaign = String(params.get('resetCampaign') || '').trim() === '1';
        let missionId = explicitMission || undefined;
        const runtimeSettings = loadRuntimeSettings();
        const autoSaveMissions = (Number(runtimeSettings?.scripting?.autoSaveBetweenMissions) || 0) > 0;
        if (resetCampaign && autoSaveMissions) {
            const reset = resetCampaignProgress(missionOrder);
            missionId = missionId || reset.currentMissionId || missionOrder[0] || undefined;
        }
        if (!missionId && autoSaveMissions) {
            const progress = loadCampaignProgress(missionOrder);
            missionId = progress.currentMissionId || missionOrder[0] || undefined;
        }
        if (missionId && !missionLookup.has(missionId)) missionId = missionOrder[0] || undefined;
        this.scene.start('GameScene', { missionId });
    }

    registerPipelines() {
        const r = this.game.renderer;
        const isWebGL = r && r instanceof Phaser.Renderer.WebGL.WebGLRenderer;
        const pm = isWebGL ? r.pipelines : null;
        const canRegister = pm && typeof pm.addPostPipeline === 'function';
        if (!canRegister) {
            this.game.registry.set('TiltShiftSupported', false);
            this.game.registry.set('ScanlineSupported', false);
            this.game.registry.set('AlienToneSupported', false);
            return;
        }
        if (!this.game.registry.get('TiltShiftRegistered')) {
            pm.addPostPipeline('TiltShift', TiltShiftPipeline);
            this.game.registry.set('TiltShiftRegistered', true);
        }
        if (!this.game.registry.get('ScanlineRegistered')) {
            pm.addPostPipeline('Scanline', ScanlinePipeline);
            this.game.registry.set('ScanlineRegistered', true);
        }
        this.game.registry.set('TiltShiftSupported', true);
        this.game.registry.set('ScanlineSupported', true);
        if (!this.game.registry.get('AlienToneRegistered')) {
            pm.addPostPipeline('AlienTone', AlienTonePipeline);
            this.game.registry.set('AlienToneRegistered', true);
        }
        this.game.registry.set('AlienToneSupported', true);
    }

    generateTileset() {
        // 4-tile tileset:
        // index 0 = floor base, index 1 = wall, index 2 = floor variant A, index 3 = floor variant B.
        const size = CONFIG.TILE_SIZE;
        const g = this.add.graphics();
        const drawFloorVariant = (offsetX, palette, hazard = false) => {
            g.fillStyle(palette.bg, 1);
            g.fillRect(offsetX, 0, size, size);
            g.lineStyle(1, palette.frame, 0.95);
            g.strokeRect(offsetX + 0.5, 0.5, size - 1, size - 1);

            g.fillStyle(palette.outer, 1);
            g.fillRect(offsetX + 2, 2, size - 4, size - 4);
            g.lineStyle(1, palette.outerLine, 0.5);
            g.strokeRect(offsetX + 2.5, 2.5, size - 5, size - 5);

            g.fillStyle(palette.inner, 1);
            g.fillRect(offsetX + 4, 4, size - 8, size - 8);
            g.lineStyle(1, palette.innerLine, 0.32);
            g.strokeRect(offsetX + 4.5, 4.5, size - 9, size - 9);

            const grateW = Math.max(8, Math.floor(size * 0.42));
            const grateX = offsetX + Math.floor((size - grateW) * 0.5);
            g.fillStyle(palette.grate, 1);
            g.fillRect(grateX, 5, grateW, size - 10);
            g.lineStyle(1, palette.grateLine, 0.38);
            g.strokeRect(grateX + 0.5, 5.5, grateW - 1, size - 11);

            g.lineStyle(1, palette.slat, 0.3);
            for (let x = grateX + 2; x < grateX + grateW - 1; x += 3) {
                g.lineBetween(x + 0.5, 7, x + 0.5, size - 7);
            }
            g.lineStyle(1, palette.slatDark, 0.75);
            for (let y = 8; y < size - 7; y += 5) {
                g.lineBetween(grateX + 1, y + 0.5, grateX + grateW - 2, y + 0.5);
            }

            g.fillStyle(palette.sidePlate, 0.85);
            const sideW = Math.max(3, Math.floor(size * 0.18));
            const sideH = Math.max(4, Math.floor(size * 0.34));
            const sideY = Math.floor(size * 0.33);
            g.fillRect(offsetX + 5, sideY, sideW, sideH);
            g.fillRect(offsetX + size - 5 - sideW, sideY, sideW, sideH);

            const boltR = Math.max(1, Math.floor(size * 0.05));
            g.fillStyle(palette.bolt, 0.95);
            g.fillCircle(offsetX + 4, 4, boltR);
            g.fillCircle(offsetX + size - 4, 4, boltR);
            g.fillCircle(offsetX + 4, size - 4, boltR);
            g.fillCircle(offsetX + size - 4, size - 4, boltR);

            if (hazard) {
                for (let i = 0; i < 6; i++) {
                    const yy = 5 + i * 4;
                    g.fillStyle(0xf0a020, 0.38);
                    g.fillRect(offsetX + 1, yy, 2, 2);
                    g.fillRect(offsetX + size - 3, yy + 1, 2, 2);
                }
            }
            g.lineStyle(1, 0x10161d, 0.24);
            for (let i = 0; i < 8; i++) {
                const sx = offsetX + 6 + i * 7;
                const ex = sx + 4;
                const y = 9 + ((i * 5) % (size - 18));
                g.lineBetween(sx, y, ex, y + 2);
            }
        };

        drawFloorVariant(0, {
            bg: 0x1c2830, frame: 0x0d1318, outer: 0x263340, outerLine: 0x3d5060, inner: 0x1a2636,
            innerLine: 0x3a5068, grate: 0x131d26, grateLine: 0x3a5060, slat: 0x5a7a90, slatDark: 0x090e13,
            sidePlate: 0x283a48, bolt: 0x8aabb8,
        }, false);
        drawFloorVariant(size * 2, {
            bg: 0x1a2530, frame: 0x0c1218, outer: 0x22303d, outerLine: 0x3a4e5e, inner: 0x162230,
            innerLine: 0x364c60, grate: 0x111a22, grateLine: 0x38506a, slat: 0x527080, slatDark: 0x080d12,
            sidePlate: 0x263645, bolt: 0x7e9aac,
        }, true);
        drawFloorVariant(size * 3, {
            bg: 0x1e2a34, frame: 0x0e1418, outer: 0x283642, outerLine: 0x42566a, inner: 0x1c2a38,
            innerLine: 0x3e5470, grate: 0x151e28, grateLine: 0x3c5268, slat: 0x608090, slatDark: 0x0b1018,
            sidePlate: 0x2c3e50, bolt: 0x92aec0,
        }, false);

        // Wall tile (index 1) at x=size — cold gunmetal industrial aesthetic.
        const wx = size;
        g.fillStyle(0x3a3e48, 1);
        g.fillRect(wx, 0, size, size);
        g.lineStyle(2, 0x191c22, 0.95);
        g.strokeRect(wx + 0.5, 0.5, size - 1, size - 1);
        g.fillStyle(0x32363e, 1);
        g.fillRoundedRect(wx + 4, 6, size - 8, size - 12, 3);
        g.lineStyle(1, 0x6a7282, 0.38);
        g.strokeRoundedRect(wx + 4.5, 6.5, size - 9, size - 13, 3);
        g.fillStyle(0x282b32, 1);
        g.fillRect(wx + Math.floor(size * 0.46), 8, Math.floor(size * 0.08), size - 16);
        g.fillStyle(0x4a5060, 0.55);
        g.fillRect(wx + 8, Math.floor(size * 0.3), size - 16, 3);
        g.fillRect(wx + 8, Math.floor(size * 0.62), size - 16, 3);
        g.fillStyle(0x4a8050, 0.2);
        for (let i = 0; i < 5; i++) {
            g.fillRect(wx + 2 + i * 12, size - 7, 6, 2);
        }
        g.lineStyle(1, 0x0e1014, 0.42);
        for (let i = 0; i < 7; i++) {
            const y = 7 + i * 8;
            g.lineBetween(wx + 6, y, wx + size - 6, y + Phaser.Math.Between(-1, 1));
        }

        g.generateTexture('tileset', size * 4, size);
        g.destroy();
    }

    generateLeaderTexture() {
        const size = CONFIG.LEADER_SIZE;
        const palette = {
            armor: 0x3b78ff,
            armorDark: 0x234a9c,
            fabric: 0x2a3642,
            visor: 0xa9dcff,
            accent: 0xd9e7ff,
            weapon: 0x5b6572,
        };
        this.drawMarineStandInTexture('leader', size, palette);
    }

    generateMarineTextures() {
        const size = CONFIG.LEADER_SIZE;
        const defs = [
            {
                key: 'tech',
                palette: {
                    armor: 0x49b8ff,
                    armorDark: 0x2b6f9c,
                    fabric: 0x2b353d,
                    visor: 0xa7e7ff,
                    accent: 0xe3f5ff,
                    weapon: 0x68717e,
                },
            },
            {
                key: 'medic',
                palette: {
                    armor: 0x5ccf91,
                    armorDark: 0x35805a,
                    fabric: 0x2b3539,
                    visor: 0xc2ffe0,
                    accent: 0xf2fff8,
                    weapon: 0x68717e,
                },
            },
            {
                key: 'heavy',
                palette: {
                    armor: 0xe1a85a,
                    armorDark: 0x9a6d34,
                    fabric: 0x2d353b,
                    visor: 0xffe2b4,
                    accent: 0xfff2df,
                    weapon: 0x6f7782,
                },
            },
        ];

        for (const def of defs) {
            this.drawMarineStandInTexture(`marine_${def.key}`, size, def.palette);
        }
    }

    drawMarineStandInTexture(textureKey, size, palette) {
        const g = this.add.graphics();
        const cx = Math.floor(size * 0.5);
        const cy = Math.floor(size * 0.5);
        const bodyW = Math.floor(size * 0.46);
        const bodyH = Math.floor(size * 0.42);
        const helmetW = Math.floor(size * 0.38);
        const helmetH = Math.floor(size * 0.3);

        // Shadow base.
        g.fillStyle(0x0b0f14, 0.5);
        g.fillEllipse(cx, cy + Math.floor(size * 0.3), Math.floor(size * 0.46), Math.floor(size * 0.18));

        // Legs/fabric.
        g.fillStyle(palette.fabric, 1);
        g.fillEllipse(cx - 4, cy + 8, Math.floor(bodyW * 0.48), Math.floor(bodyH * 0.52));
        g.fillEllipse(cx + 4, cy + 8, Math.floor(bodyW * 0.48), Math.floor(bodyH * 0.52));

        // Main torso armor.
        g.fillStyle(palette.armorDark, 1);
        g.fillRoundedRect(cx - Math.floor(bodyW * 0.5), cy - 4, bodyW, bodyH, 6);
        g.fillStyle(palette.armor, 1);
        g.fillRoundedRect(cx - Math.floor(bodyW * 0.5) + 2, cy - 2, bodyW - 4, bodyH - 8, 5);

        // Shoulder pads.
        g.fillStyle(palette.armorDark, 1);
        g.fillEllipse(cx - Math.floor(bodyW * 0.45), cy + 1, Math.floor(size * 0.18), Math.floor(size * 0.16));
        g.fillEllipse(cx + Math.floor(bodyW * 0.45), cy + 1, Math.floor(size * 0.18), Math.floor(size * 0.16));

        // Chest straps / panel.
        g.fillStyle(0x11171f, 0.85);
        g.fillRect(cx - 2, cy - 1, 4, Math.floor(bodyH * 0.56));
        g.fillStyle(palette.accent, 0.85);
        g.fillRect(cx - 6, cy + 8, 12, 3);

        // Helmet.
        g.fillStyle(palette.armorDark, 1);
        g.fillEllipse(cx, cy - 9, helmetW, helmetH);
        g.fillStyle(palette.armor, 1);
        g.fillEllipse(cx - 1, cy - 10, helmetW - 5, helmetH - 6);

        // Visor (facing right, helps readability).
        g.fillStyle(palette.visor, 0.95);
        g.fillRoundedRect(cx + 3, cy - 14, Math.floor(size * 0.17), Math.floor(size * 0.12), 3);
        g.fillStyle(0xffffff, 0.45);
        g.fillRect(cx + 5, cy - 13, Math.floor(size * 0.1), 2);

        // Rifle silhouette (to the right, direction cue).
        g.fillStyle(palette.weapon, 1);
        g.fillRect(cx + 8, cy - 2, Math.floor(size * 0.24), 5);
        g.fillRect(cx + 15, cy + 1, Math.floor(size * 0.12), 3);
        g.fillStyle(0x2a3138, 1);
        g.fillRect(cx + 8, cy + 3, Math.floor(size * 0.12), 4);
        g.fillStyle(0x98a6b6, 0.5);
        g.fillRect(cx + Math.floor(size * 0.28), cy - 1, 2, 4);

        // Outline.
        g.lineStyle(1, 0x0d1015, 0.9);
        g.strokeEllipse(cx, cy - 10, helmetW, helmetH);
        g.strokeRoundedRect(cx - Math.floor(bodyW * 0.5), cy - 4, bodyW, bodyH, 6);

        g.generateTexture(textureKey, size, size);
        g.destroy();
    }

    generateAlienTextures() {
        // ── Warrior: near-black carapace, elongated dome, segmented body, limb hints ──
        {
            const g = this.add.graphics();
            // Body/thorax — very dark
            g.fillStyle(0x1a1e26, 1);
            g.fillEllipse(15, 19, 20, 20);
            // Limb silhouettes flanking the body
            g.fillStyle(0x141820, 0.85);
            g.fillEllipse(10, 14, 8, 10);
            g.fillEllipse(10, 24, 8, 10);
            g.fillEllipse(22, 14, 7, 9);
            g.fillEllipse(22, 24, 7, 9);
            // Elongated head dome (upper-right)
            g.fillStyle(0x222830, 1);
            g.fillEllipse(20, 11, 18, 10);
            // Inner dome shadow (ridge cue)
            g.fillStyle(0x0e1218, 0.9);
            g.fillEllipse(22, 11, 11, 6);
            // Carapace rib segments across body
            g.fillStyle(0x0e1218, 0.65);
            g.fillRect(9, 16, 14, 2);
            g.fillRect(9, 20, 14, 2);
            // Tail stub (lower-left)
            g.fillStyle(0x13181f, 0.7);
            g.fillEllipse(5, 22, 7, 5);
            // Acid inner-jaw glow
            g.fillStyle(0x28aa55, 0.45);
            g.fillCircle(24, 12, 2.2);
            // Cyan detection outline
            g.lineStyle(1, 0x7fd7ff, 0.42);
            g.strokeEllipse(15, 18, 22, 22);
            g.strokeEllipse(20, 11, 19, 11);
            // Sensor dot
            g.fillStyle(0x44cc77, 0.8);
            g.fillCircle(26, 10, 1.4);
            g.generateTexture('alien_warrior', 32, 32);
            g.destroy();
        }

        // ── Drone: thinner and more sinuous than warrior, darker with subtle ridge ──
        {
            const g = this.add.graphics();
            g.fillStyle(0x141820, 1);
            g.fillEllipse(14, 19, 18, 22);
            g.fillStyle(0x10141c, 0.8);
            g.fillEllipse(9, 15, 7, 12);
            g.fillEllipse(9, 23, 7, 10);
            g.fillEllipse(21, 14, 6, 9);
            g.fillEllipse(21, 23, 6, 9);
            // Longer, more tapered head dome
            g.fillStyle(0x1c2430, 1);
            g.fillEllipse(22, 11, 20, 9);
            g.fillStyle(0x0a0e14, 0.9);
            g.fillEllipse(24, 11, 12, 5);
            // Single dorsal ridge line
            g.lineStyle(1, 0x2a3442, 0.8);
            g.lineBetween(12, 11, 28, 11);
            g.fillStyle(0x0a0e14, 0.55);
            g.fillRect(8, 17, 12, 2);
            g.fillRect(8, 21, 12, 2);
            g.fillStyle(0x2a9955, 0.4);
            g.fillCircle(26, 11, 2);
            g.lineStyle(1, 0x7fd7ff, 0.38);
            g.strokeEllipse(14, 19, 20, 24);
            g.strokeEllipse(22, 11, 21, 10);
            g.fillStyle(0x44cc77, 0.75);
            g.fillCircle(27, 10, 1.3);
            g.generateTexture('alien_drone', 32, 32);
            g.destroy();
        }

        // ── Facehugger: spider-like with splayed appendage hints ──
        {
            const g = this.add.graphics();
            // Central body mass
            g.fillStyle(0x2e3840, 1);
            g.fillEllipse(16, 16, 14, 12);
            // Radiating appendages (top-left, left, bottom-left, top-right, right, bottom-right)
            g.fillStyle(0x222c34, 0.85);
            g.fillEllipse(7, 9, 8, 4);
            g.fillEllipse(4, 16, 8, 3);
            g.fillEllipse(7, 23, 8, 4);
            g.fillEllipse(25, 9, 8, 4);
            g.fillEllipse(28, 16, 8, 3);
            g.fillEllipse(25, 23, 8, 4);
            // Tail curl hint
            g.fillStyle(0x1e2830, 0.7);
            g.fillEllipse(8, 18, 5, 3);
            // Organic belly underside (lighter, fleshy)
            g.fillStyle(0x3c4e58, 0.8);
            g.fillEllipse(16, 17, 9, 8);
            // Cyan cue
            g.lineStyle(1, 0x7fd7ff, 0.38);
            g.strokeEllipse(16, 16, 16, 14);
            g.generateTexture('alien_facehugger', 32, 32);
            g.destroy();
        }

        // ── Egg: dark shell, visible petal opening, acid glow within ──
        {
            const g = this.add.graphics();
            // Shell halves
            g.fillStyle(0x3d3020, 1);
            g.fillEllipse(12, 17, 18, 24);
            g.fillEllipse(20, 17, 18, 24);
            // Shell surface variation
            g.fillStyle(0x4a3d28, 0.85);
            g.fillEllipse(16, 20, 16, 10);
            // Petal opening at top (4 petals)
            g.fillStyle(0x2a1e10, 0.9);
            g.fillEllipse(16, 8, 12, 8);
            g.fillStyle(0x553d22, 0.8);
            g.fillEllipse(13, 6, 6, 5);
            g.fillEllipse(19, 6, 6, 5);
            g.fillEllipse(16, 4, 5, 5);
            // Acid glow within the opening
            g.fillStyle(0x33bb44, 0.55);
            g.fillCircle(16, 9, 4);
            g.fillStyle(0x55dd66, 0.3);
            g.fillCircle(16, 9, 6);
            // Organic detail lines
            g.lineStyle(1, 0x221508, 0.7);
            g.strokeEllipse(16, 17, 22, 28);
            g.generateTexture('alien_egg', 32, 32);
            g.destroy();
        }

        // ── Queen Lesser (mini-boss): larger crown, more imposing head crest ──
        {
            const g = this.add.graphics();
            g.fillStyle(0x181e2a, 1);
            g.fillEllipse(14, 18, 22, 22);
            // Wing-like limb plates
            g.fillStyle(0x101420, 0.9);
            g.fillEllipse(7, 13, 10, 14);
            g.fillEllipse(7, 24, 10, 10);
            g.fillEllipse(23, 13, 9, 14);
            g.fillEllipse(23, 24, 9, 10);
            // Head with inner-jaw crown
            g.fillStyle(0x202836, 1);
            g.fillEllipse(21, 11, 20, 12);
            // Crown spines (three short lines above head)
            g.lineStyle(2, 0x2a3848, 0.85);
            g.lineBetween(17, 7, 17, 4);
            g.lineBetween(21, 6, 22, 3);
            g.lineBetween(25, 8, 27, 5);
            // Inner dome
            g.fillStyle(0x0e1220, 0.85);
            g.fillEllipse(23, 12, 12, 7);
            // Rib segments
            g.fillStyle(0x0e1220, 0.6);
            g.fillRect(8, 16, 14, 2);
            g.fillRect(8, 20, 14, 2);
            // Acid glow — brighter for mini-boss
            g.fillStyle(0x22cc66, 0.6);
            g.fillCircle(25, 11, 2.5);
            g.fillStyle(0x44ff88, 0.3);
            g.fillCircle(25, 11, 4);
            g.lineStyle(1, 0x7fd7ff, 0.5);
            g.strokeEllipse(14, 18, 24, 24);
            g.strokeEllipse(21, 11, 22, 13);
            g.fillStyle(0x55dd88, 0.9);
            g.fillCircle(27, 10, 1.6);
            g.generateTexture('alien_queen_lesser', 32, 32);
            g.destroy();
        }

        // ── Queen (boss): massive, regal, thick crest ──
        {
            const g = this.add.graphics();
            g.fillStyle(0x14181e, 1);
            g.fillEllipse(14, 17, 24, 26);
            // Broad carapace wings
            g.fillStyle(0x0e1218, 0.9);
            g.fillEllipse(6, 12, 12, 16);
            g.fillEllipse(6, 25, 12, 12);
            g.fillEllipse(24, 12, 10, 16);
            g.fillEllipse(24, 25, 10, 12);
            // Elongated regal head (very large dome)
            g.fillStyle(0x1c2432, 1);
            g.fillEllipse(22, 10, 22, 14);
            // Crown crest — tall spines
            g.lineStyle(2, 0x283648, 0.9);
            g.lineBetween(15, 6, 14, 2);
            g.lineBetween(19, 5, 19, 1);
            g.lineBetween(23, 5, 24, 2);
            g.lineBetween(27, 7, 29, 4);
            // Inner dome shadow
            g.fillStyle(0x0a0e18, 0.9);
            g.fillEllipse(24, 10, 14, 8);
            // Heavy carapace ribs
            g.fillStyle(0x0a0e18, 0.65);
            g.fillRect(7, 15, 14, 2);
            g.fillRect(7, 19, 14, 2);
            g.fillRect(7, 23, 14, 2);
            // Bright acid inner-jaw glow
            g.fillStyle(0x33dd77, 0.7);
            g.fillCircle(26, 10, 3);
            g.fillStyle(0x88ffaa, 0.35);
            g.fillCircle(26, 10, 5);
            g.lineStyle(2, 0x7fd7ff, 0.55);
            g.strokeEllipse(14, 17, 26, 28);
            g.strokeEllipse(22, 10, 24, 15);
            g.fillStyle(0x66ffaa, 0.95);
            g.fillCircle(28, 9, 2);
            g.generateTexture('alien_queen', 32, 32);
            g.destroy();
        }

        // ── Runner / Spitter: generic xenomorph variants ──
        for (const key of ['runner', 'spitter']) {
            const isSpitter = key === 'spitter';
            const g = this.add.graphics();
            // Runner is leaner; spitter has bulkier head
            g.fillStyle(0x1c2028, 1);
            g.fillEllipse(15, 19, isSpitter ? 18 : 16, 22);
            g.fillStyle(0x141820, 0.8);
            g.fillEllipse(9, 15, 7, 10);
            g.fillEllipse(9, 23, 7, 9);
            g.fillEllipse(22, 14, 6, 8);
            g.fillEllipse(22, 23, 6, 8);
            g.fillStyle(0x1e2630, 1);
            g.fillEllipse(21, isSpitter ? 10 : 11, isSpitter ? 22 : 17, isSpitter ? 12 : 9);
            g.fillStyle(0x0e1218, 0.85);
            g.fillEllipse(23, isSpitter ? 10 : 11, isSpitter ? 13 : 9, 6);
            g.fillStyle(0x0e1218, 0.6);
            g.fillRect(9, 17, 12, 2);
            g.fillRect(9, 21, 12, 2);
            g.fillStyle(isSpitter ? 0x44bb22 : 0x28aa55, 0.5);
            g.fillCircle(isSpitter ? 25 : 24, 11, isSpitter ? 3 : 2);
            g.lineStyle(1, 0x7fd7ff, 0.4);
            g.strokeEllipse(15, 19, 20, 24);
            g.strokeEllipse(21, isSpitter ? 10 : 11, isSpitter ? 23 : 18, isSpitter ? 13 : 10);
            g.fillStyle(0x44cc77, 0.75);
            g.fillCircle(isSpitter ? 27 : 26, 10, 1.4);
            g.generateTexture(`alien_${key}`, 32, 32);
            g.destroy();
        }
    }

    generatePropTextures() {
        // Desk prop (2x1 tile silhouette, top-down).
        const deskW = CONFIG.TILE_SIZE * 2;
        const deskH = CONFIG.TILE_SIZE;
        const gd = this.add.graphics();
        gd.fillStyle(0x2a3037, 1);
        gd.fillRoundedRect(2, 6, deskW - 4, deskH - 12, 5);
        gd.lineStyle(2, 0x53606c, 0.75);
        gd.strokeRoundedRect(2, 6, deskW - 4, deskH - 12, 5);
        gd.fillStyle(0x3b4652, 1);
        gd.fillRoundedRect(7, 11, deskW - 14, deskH - 22, 3);
        gd.fillStyle(0x89a0b4, 0.3);
        gd.fillRect(12, 16, deskW - 24, 3);
        gd.fillStyle(0x1a1f25, 0.9);
        gd.fillRect(12, deskH - 13, 18, 6);
        gd.fillRect(deskW - 30, deskH - 13, 18, 6);
        gd.generateTexture('prop_desk', deskW, deskH);
        gd.destroy();

        // Lamp prop (1x1 tile with lit emitter cap).
        const lampSize = CONFIG.TILE_SIZE;
        const gl = this.add.graphics();
        const cx = Math.floor(lampSize * 0.5);
        const cy = Math.floor(lampSize * 0.5);
        gl.fillStyle(0x10161c, 0.85);
        gl.fillCircle(cx, cy + 4, 11);
        gl.fillStyle(0x27323d, 1);
        gl.fillCircle(cx, cy + 2, 8);
        gl.fillStyle(0x8fbad6, 0.9);
        gl.fillCircle(cx, cy + 1, 4);
        gl.lineStyle(1, 0xc9e8ff, 0.75);
        gl.strokeCircle(cx, cy + 1, 5);
        gl.fillStyle(0xb8e2ff, 0.28);
        gl.fillCircle(cx, cy + 1, 14);
        gl.generateTexture('prop_lamp', lampSize, lampSize);
        gl.destroy();
    }

    generateBulletTextures() {
        // Legacy 'bullet' texture for pool initialization
        const g0 = this.add.graphics();
        g0.fillStyle(0xaadd44, 0.4);
        g0.fillCircle(6, 6, 6);
        g0.fillStyle(0xeeff88, 1);
        g0.fillCircle(6, 6, 3);
        g0.fillStyle(0xffffff, 0.9);
        g0.fillCircle(6, 6, 1.5);
        g0.generateTexture('bullet', 12, 12);
        g0.destroy();

        // Pulse rifle bolt — green-yellow energy tracer with bright core and dim halo
        const gp = this.add.graphics();
        gp.fillStyle(0x44aa22, 0.2);
        gp.fillCircle(6, 6, 6);
        gp.fillStyle(0x88dd44, 0.6);
        gp.fillCircle(6, 6, 4);
        gp.fillStyle(0xeeff88, 1);
        gp.fillEllipse(6, 6, 7, 4);
        gp.fillStyle(0xffffff, 0.95);
        gp.fillCircle(6, 6, 1.5);
        gp.generateTexture('bullet_pulse', 12, 12);
        gp.destroy();

        // Shotgun pellet — orange plasma fragment with bright core
        const gs = this.add.graphics();
        gs.fillStyle(0xcc3300, 0.35);
        gs.fillCircle(4, 4, 4);
        gs.fillStyle(0xff7700, 0.9);
        gs.fillCircle(4, 4, 2.5);
        gs.fillStyle(0xffcc88, 1);
        gs.fillCircle(4, 4, 1.2);
        gs.generateTexture('bullet_shotgun', 8, 8);
        gs.destroy();

        // Pistol bolt — cool blue-white with visible core
        const gi = this.add.graphics();
        gi.fillStyle(0x3344cc, 0.25);
        gi.fillCircle(4, 4, 4);
        gi.fillStyle(0x8899ff, 0.8);
        gi.fillCircle(4, 4, 2.5);
        gi.fillStyle(0xddeeff, 1);
        gi.fillCircle(4, 4, 1.2);
        gi.generateTexture('bullet_pistol', 8, 8);
        gi.destroy();

        // Spitter acid projectile
        const ga = this.add.graphics();
        ga.fillStyle(0x66ff88, 0.95);
        ga.fillCircle(5, 5, 5);
        ga.lineStyle(1, 0x225533, 1);
        ga.strokeCircle(5, 5, 5);
        ga.generateTexture('acid_projectile', 10, 10);
        ga.destroy();

        // Medkit pickup
        const gm = this.add.graphics();
        gm.fillStyle(0x33aa33, 1);
        gm.fillRect(0, 0, 18, 18);
        gm.fillStyle(0xffffff, 1);
        gm.fillRect(7, 3, 4, 12);
        gm.fillRect(3, 7, 12, 4);
        gm.lineStyle(1, 0x114411, 1);
        gm.strokeRect(0, 0, 18, 18);
        gm.generateTexture('pickup_medkit', 18, 18);
        gm.destroy();

        // Ammo pickup (generic crate)
        const gc = this.add.graphics();
        gc.fillStyle(0x666688, 1);
        gc.fillRect(0, 0, 18, 14);
        gc.lineStyle(1, 0xaabbee, 1);
        gc.strokeRect(0, 0, 18, 14);
        gc.fillStyle(0xeeeeff, 1);
        gc.fillRect(3, 5, 12, 4);
        gc.generateTexture('pickup_ammo', 18, 14);
        gc.destroy();
    }

    generateFxTextures() {
        // Spark/muzzle dot — bright hot core with a soft falloff halo.
        const gd = this.add.graphics();
        gd.fillStyle(0xffffff, 0.12);
        gd.fillCircle(8, 8, 8);
        gd.fillStyle(0xffffff, 0.4);
        gd.fillCircle(8, 8, 5);
        gd.fillStyle(0xffffff, 0.85);
        gd.fillCircle(8, 8, 3);
        gd.fillStyle(0xffffff, 1);
        gd.fillCircle(8, 8, 1.5);
        gd.generateTexture('fx_dot', 16, 16);
        gd.destroy();

        // Smoke puff — irregular multi-blob with feathered outer edge for steam/acid plumes.
        const gs = this.add.graphics();
        gs.fillStyle(0xffffff, 0.06);
        gs.fillCircle(16, 16, 16);
        gs.fillStyle(0xffffff, 0.13);
        gs.fillCircle(14, 16, 12);
        gs.fillStyle(0xffffff, 0.2);
        gs.fillCircle(18, 14, 9);
        gs.fillStyle(0xffffff, 0.3);
        gs.fillCircle(16, 17, 7);
        gs.fillStyle(0xffffff, 0.16);
        gs.fillCircle(11, 18, 7);
        gs.generateTexture('fx_smoke', 32, 32);
        gs.destroy();

        // Shockwave ring — thin bright rim for impacts and muzzle blasts.
        const gr = this.add.graphics();
        gr.fillStyle(0xffffff, 0.04);
        gr.fillCircle(24, 24, 23);
        gr.fillStyle(0xffffff, 0.1);
        gr.fillCircle(24, 24, 19);
        gr.lineStyle(3, 0xffffff, 0.92);
        gr.strokeCircle(24, 24, 16);
        gr.lineStyle(1, 0xffffff, 0.5);
        gr.strokeCircle(24, 24, 11);
        gr.fillStyle(0xffffff, 0.2);
        gr.fillCircle(24, 24, 6);
        gr.generateTexture('fx_ring', 48, 48);
        gr.destroy();

        // Cinematic bokeh disc — hexagonal lens-flare disc for atmosphere drift.
        const gb = this.add.graphics();
        gb.fillStyle(0xffffff, 0.04);
        gb.fillCircle(24, 24, 22);
        gb.fillStyle(0xffffff, 0.14);
        gb.fillCircle(24, 24, 15);
        gb.fillStyle(0xffffff, 0.38);
        gb.fillCircle(24, 24, 8);
        gb.fillStyle(0xffffff, 0.88);
        gb.fillCircle(24, 24, 3);
        gb.lineStyle(1, 0xffffff, 0.22);
        gb.strokeCircle(24, 24, 20);
        gb.generateTexture('fx_bokeh', 48, 48);
        gb.destroy();

        // Cinematic lens flare streak — longer fade, brighter central hotspot.
        const gf = this.add.graphics();
        gf.fillStyle(0xffffff, 0.06);
        gf.fillRoundedRect(0, 11, 64, 10, 4);
        gf.fillStyle(0xffffff, 0.18);
        gf.fillRoundedRect(5, 12, 54, 8, 3);
        gf.fillStyle(0xffffff, 0.52);
        gf.fillRoundedRect(14, 13, 36, 6, 3);
        gf.fillStyle(0xffffff, 1);
        gf.fillRoundedRect(24, 14, 16, 4, 2);
        gf.fillCircle(32, 16, 3);
        gf.generateTexture('fx_flare', 64, 32);
        gf.destroy();

        // Metal debris shard — angular bright flake for wall-impact ricochets.
        const gdb = this.add.graphics();
        gdb.fillStyle(0xffffff, 0.35);
        gdb.fillRect(1, 1, 10, 5);
        gdb.fillStyle(0xffffff, 0.85);
        gdb.fillRect(3, 2, 6, 3);
        gdb.fillStyle(0xffffff, 1);
        gdb.fillRect(5, 2, 2, 2);
        gdb.generateTexture('fx_debris', 12, 8);
        gdb.destroy();

        // Ember — warm glowing particle for death bursts and sustained heat.
        const ge = this.add.graphics();
        ge.fillStyle(0xff7020, 0.12);
        ge.fillCircle(8, 8, 8);
        ge.fillStyle(0xff9040, 0.45);
        ge.fillCircle(8, 8, 5);
        ge.fillStyle(0xffc060, 0.9);
        ge.fillCircle(8, 8, 2.5);
        ge.fillStyle(0xffeeb0, 1);
        ge.fillCircle(8, 8, 1.2);
        ge.generateTexture('fx_ember', 16, 16);
        ge.destroy();

        // Screen-space vignette for atmosphere passes in GameScene.
        const vignetteKey = 'fx_vignette';
        if (!this.textures.exists(vignetteKey)) {
            const size = 512;
            const tex = this.textures.createCanvas(vignetteKey, size, size);
            const ctx = tex.getContext();
            const cx = size / 2;
            const cy = size / 2;
            const r = size * 0.64;
            const grad = ctx.createRadialGradient(cx, cy, size * 0.12, cx, cy, r);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(0.52, 'rgba(0,0,0,0.08)');
            grad.addColorStop(0.76, 'rgba(0,0,0,0.35)');
            grad.addColorStop(1, 'rgba(0,0,0,0.88)');
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
            tex.refresh();
        }
    }

    generateWeaponIcons() {
        const size = CONFIG.WEAPON_ICON_SIZE;

        // Pulse Rifle icon — long barrel with stock
        const g1 = this.add.graphics();
        g1.fillStyle(0x8888aa, 1);
        g1.fillRect(4, 14, 32, 8);
        g1.fillRect(2, 12, 10, 16);
        g1.fillStyle(0xffff00, 0.7);
        g1.fillRect(34, 16, 4, 4);
        g1.lineStyle(1, 0xaaaacc, 0.8);
        g1.strokeRect(4, 14, 32, 8);
        g1.generateTexture('weapon_icon_pulseRifle', size, size);
        g1.destroy();

        // Shotgun icon — double barrel with wooden stock
        const g2 = this.add.graphics();
        g2.fillStyle(0x996633, 1);
        g2.fillRect(2, 14, 12, 12);
        g2.fillStyle(0x777799, 1);
        g2.fillRect(14, 14, 22, 5);
        g2.fillRect(14, 21, 22, 5);
        g2.lineStyle(1, 0x999999, 0.8);
        g2.strokeRect(14, 14, 22, 12);
        g2.generateTexture('weapon_icon_shotgun', size, size);
        g2.destroy();

        // Pistol icon — small L-shape
        const g3 = this.add.graphics();
        g3.fillStyle(0x666688, 1);
        g3.fillRect(10, 12, 22, 8);
        g3.fillRect(12, 20, 8, 12);
        g3.fillStyle(0x8888aa, 1);
        g3.fillRect(10, 12, 22, 3);
        g3.lineStyle(1, 0x888888, 0.6);
        g3.strokeRect(10, 12, 22, 8);
        g3.generateTexture('weapon_icon_pistol', size, size);
        g3.destroy();
    }

    generateDoorTextures() {
        const size = CONFIG.TILE_SIZE;

        // Closed door — cold gunmetal blast door matching the wall palette.
        const gc = this.add.graphics();
        gc.fillStyle(0x282e3a, 1);
        gc.fillRect(0, 0, size, size);
        gc.lineStyle(2, 0x18202c, 1);
        gc.strokeRect(0, 0, size, size);
        gc.fillStyle(0x323c4c, 0.95);
        gc.fillRoundedRect(4, 6, size - 8, size - 12, 3);
        gc.fillStyle(0x1e2430, 1);
        gc.fillRect(Math.floor(size * 0.45), 6, Math.floor(size * 0.1), size - 12);
        gc.lineStyle(1, 0x546478, 0.5);
        gc.lineBetween(6, Math.floor(size * 0.28), size - 6, Math.floor(size * 0.28));
        gc.lineBetween(6, Math.floor(size * 0.72), size - 6, Math.floor(size * 0.72));
        // Emergency lighting status markers — amber, same language as wall accents
        gc.fillStyle(0xd0a35f, 0.28);
        for (let i = 0; i < 4; i++) gc.fillRect(3 + i * 14, size - 5, 8, 2);
        gc.generateTexture('door_closed', size, size);
        gc.destroy();

        // Open door — recessed side rails.
        const go = this.add.graphics();
        go.fillStyle(0x26323b, 1);
        go.fillRect(0, 0, size, size);
        go.fillStyle(0x3c8d62, 1);
        go.fillRect(0, 0, 6, size);
        go.fillRect(size - 6, 0, 6, size);
        go.fillStyle(0x64c591, 0.45);
        go.fillRect(2, 5, 2, size - 10);
        go.fillRect(size - 4, 5, 2, size - 10);
        go.lineStyle(1, 0x1d5d3f, 0.55);
        go.strokeRect(0, 0, size, size);
        go.generateTexture('door_open', size, size);
        go.destroy();

        // Locked door — amber security state.
        const gl = this.add.graphics();
        gl.fillStyle(0x7b6840, 1);
        gl.fillRect(0, 0, size, size);
        gl.lineStyle(2, 0x3f331e, 1);
        gl.strokeRect(0, 0, size, size);
        gl.fillStyle(0xa88b52, 1);
        gl.fillRoundedRect(4, 6, size - 8, size - 12, 3);
        gl.fillStyle(0xdbc17d, 0.5);
        gl.fillRect(8, Math.floor(size * 0.24), size - 16, 2);
        gl.fillRect(8, Math.floor(size * 0.76), size - 16, 2);
        gl.fillStyle(0x3a2e18, 1);
        gl.fillRect(Math.floor(size * 0.35), Math.floor(size * 0.3), Math.floor(size * 0.3), Math.floor(size * 0.35));
        gl.fillRect(Math.floor(size * 0.4), Math.floor(size * 0.2), Math.floor(size * 0.2), Math.floor(size * 0.15));
        gl.generateTexture('door_locked', size, size);
        gl.destroy();

        // Welded door — steel with bright weld seams.
        const gw = this.add.graphics();
        gw.fillStyle(0x50667a, 1);
        gw.fillRect(0, 0, size, size);
        gw.lineStyle(2, 0x2b3945, 1);
        gw.strokeRect(0, 0, size, size);
        gw.fillStyle(0x607c92, 1);
        gw.fillRoundedRect(4, 6, size - 8, size - 12, 3);
        gw.lineStyle(3, 0xc0deff, 0.82);
        gw.lineBetween(8, 8, size - 8, size - 8);
        gw.lineBetween(size - 8, 8, 8, size - 8);
        gw.lineStyle(1, 0xeff8ff, 0.55);
        gw.lineBetween(11, 8, size - 5, size - 2);
        gw.lineBetween(size - 11, 8, 5, size - 2);
        gw.generateTexture('door_welded', size, size);
        gw.destroy();
    }
}
