import { CONFIG } from '../config.js';
import { MISSION_SET } from '../data/missionData.js';
import { soundManifest } from '../data/soundManifest.generated.js';
import { loadCampaignProgress, resetCampaignProgress } from '../settings/campaignProgress.js';
import { loadRuntimeSettings } from '../settings/runtimeSettings.js';
// Shader pipelines removed — working from single graphical baseline

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Sprites loaded from /assets/sprites/scaled/ at 1:1 pixel size (Image Editor is sole authority on sizing)
        this.load.image('marine_topdown', '/assets/sprites/scaled/marine/marine_topdown.png');
        this.load.image('alien_warrior', '/assets/sprites/scaled/alien_warrior/alien_warrior_idle.png');
        // Sprite registry — loaded here so create() can process additional animation assignments
        this.load.json('sprite_registry', '/data/sprite_registry.json');
        this.load.video('marine_1_video', '/videos/marine_1.mp4', 'loadeddata', false, true);
        this.load.video('marine_2_video', '/videos/marine_2.mp4', 'loadeddata', false, true);
        this.load.video('marine_3_video', '/videos/marine_3.mp4', 'loadeddata', false, true);
        this.load.video('marine_4_video', '/videos/marine_4.mp4', 'loadeddata', false, true);
        this.load.video('interference_video', '/images/interference_300.mp4', 'loadeddata', false, true);
        this.load.video('interrupt_video', '/videos/interrupt.mp4', 'loadeddata', false, true);
        // Alien sprites — facehugger still uses legacy path until migrated to sprite pipeline
        this.load.image('alien_facehugger', '/src/graphics/fhugger.png');
        this.load.image('alien_tail_parts', '/images/tail.png');
        this.load.image('__tail_src_base__', '/images/tailbase.png');
        this.load.image('__tail_src_mid__',  '/images/tailmid.png');
        this.load.image('__tail_src_end__',  '/images/tailend.png');
        // Torch hotspot texture — OGA incandescent flashlight pattern (CC0)
        this.load.image('torch_hotspot', '/images/torch_hotspot.png');
        // Motion tracker background image
        this.load.image('motiontracker_bg', '/images/motiontracker.png');

        // Audio assets — loaded from generated manifest
        for (const { key, path: audioPath } of soundManifest) {
            this.load.audio(key, audioPath);
        }
        // Music — custom key, not auto-generated
        this.load.audio('bg_colony', '/src/music/Colony.mp3');

    }

    create() {
        this.initText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2, 'INITIALIZING SYSTEMS...', {
            fontSize: '18px',
            fontFamily: '"Courier New", "Lucida Console", "Monaco", monospace',
            color: '#00aaff',
            align: 'center',
        });
        this.initText.setOrigin(0.5);
        this.initText.setAlpha(0.9);

        // Colonial Marines style glitch effect
        this.time.addEvent({
            delay: 50,
            callback: () => {
                if (!this.initText || !this.initText.active) return;
                const rnd = Math.random();
                if (rnd < 0.08) {
                    this.initText.setAlpha(0.3 + Math.random() * 0.4);
                    this.initText.x += (Math.random() - 0.5) * 4;
                } else if (rnd < 0.15) {
                    this.initText.setText('INITI_LIZING SYST_MS...');
                } else {
                    this.initText.setAlpha(0.85 + Math.random() * 0.15);
                    this.initText.x = CONFIG.GAME_WIDTH / 2;
                    this.initText.setText('INITIALIZING SYSTEMS...');
                }
            },
            loop: true,
        });

        // Queue of initialization tasks to run over multiple frames
        this.initTasks = [
            () => this.loadRegistrySprites(),
            () => this.generateTileset(),
            () => this.initMarineSheet(),
            () => this.generateLeaderTexture(),
            () => this.generateMarineTextures(),
            () => this.generateAlienTextures(),
            () => this.initAlienWalkAnimation(),
            () => this.generateAlienOverlayTextures(),
            () => this.generateBulletTextures(),
            () => this.generateFxTextures(),
            () => this.generatePropTextures(),
            () => this.generateDecalTextures(),
            () => this.generateAlienBloodSVGTextures(),
            () => this.generateLightTextures(),
            () => this.generateWeaponIcons(),
            () => this.generateDoorTextures(),
            // () => this.registerPipelines() — shaders removed
        ];
        this.currentTaskIndex = 0;

        // Prepare GameScene launch data
        const params = new URLSearchParams(window.location.search);
        const missionOrder = MISSION_SET.map((m) => m.id);
        const missionLookup = new Set(missionOrder);
        const explicitMission = String(params.get('mission') || '').trim();
        const resetCampaign = String(params.get('resetCampaign') || '').trim() === '1';
        const editorTest = String(params.get('editorTest') || '').trim() === 'true';
        let missionId = explicitMission || undefined;
        let testMapData = null;
        const runtimeSettings = loadRuntimeSettings();
        const autoSaveMissions = (Number(runtimeSettings?.scripting?.autoSaveBetweenMissions) || 0) > 0;

        this._editorTestReady = !editorTest;
        if (editorTest) {
            fetch('/api/editor-test-map')
                .then((res) => (res.ok ? res.json() : null))
                .then((payload) => {
                    if (payload?.testMap && typeof payload.testMap === 'object') {
                        testMapData = payload.testMap;
                    }
                })
                .catch((err) => {
                    console.warn('Failed to load editor test map:', err);
                })
                .finally(() => {
                    this.launchData = { missionId, editorTest, testMapData };
                    this._editorTestReady = true;
                });
        }

        if (resetCampaign && autoSaveMissions) {
            const reset = resetCampaignProgress(missionOrder);
            missionId = missionId || reset.currentMissionId || missionOrder[0] || undefined;
        }
        if (!missionId && autoSaveMissions) {
            const progress = loadCampaignProgress(missionOrder);
            missionId = progress.currentMissionId || missionOrder[0] || undefined;
        }
        if (missionId && !missionLookup.has(missionId)) missionId = missionOrder[0] || undefined;

        if (!editorTest) {
            this.launchData = { missionId, editorTest, testMapData };
        }
    }

    update() {
        if (!this._editorTestReady) return;
        if (this.currentTaskIndex === 0 && document.fonts) {
            if (!document.fonts.check('12px SevenSegment')) {
                // Font not ready, wait
                return;
            }
        }

        if (this.currentTaskIndex < this.initTasks.length) {
            // Run a few tasks per frame if they are small, or just one if large.
            // Texture generation can be heavy, so we do one per frame for maximum smoothness.
            const task = this.initTasks[this.currentTaskIndex];
            task();
            this.currentTaskIndex++;
        } else if (!this._startupDelay) {
            // Brief delay after texture generation to let GPU upload textures
            this._startupDelay = true;
            this.time.delayedCall(600, () => {
                this.scene.start('GameScene', this.launchData);
            });
        }
    }

    initMarineSheet() {
        // Spritesheet loading removed — marine uses single rotating image from sprite pipeline
        // Flags kept as false so downstream code uses marine_topdown texture
    }

    registerPipelines() {
        // Shader pipelines removed — working from single graphical baseline.
        // All pipeline registry flags set to false so downstream code skips gracefully.
        this.game.registry.set('TiltShiftSupported', false);
        this.game.registry.set('ScanlineSupported', false);
        this.game.registry.set('AlienToneSupported', false);
    }

    // Legacy 3/4 wall face texture generator (unused in top-down mode).
    _generateWallFaceTextures() {
        const size = CONFIG.TILE_SIZE; // 64
        const faceH = Math.round(size * 0.28); // ~18px wall face height
        const g = this.add.graphics();

        // ── South-facing wall face (3/4 view) ──
        // Blue-steel structural face with panel lines, rivets, and bottom shadow
        const w = size;

        // Top lip highlight (steel blue)
        g.fillStyle(0x8098b0, 0.95);
        g.fillRect(0, 0, w, 2);

        // Main wall face body (blue-gray)
        g.fillStyle(0x506878, 0.92);
        g.fillRect(0, 2, w, faceH - 4);

        // Horizontal panel recess lines (dark blue-gray)
        g.lineStyle(1, 0x3a4c5a, 0.6);
        g.lineBetween(0, Math.floor(faceH * 0.35), w, Math.floor(faceH * 0.35));
        g.lineBetween(0, Math.floor(faceH * 0.65), w, Math.floor(faceH * 0.65));

        // Panel highlight between recesses
        g.lineStyle(1, 0x6880a0, 0.4);
        g.lineBetween(0, Math.floor(faceH * 0.35) + 1, w, Math.floor(faceH * 0.35) + 1);

        // Rivet details along face (blue-gray)
        g.fillStyle(0x7888a0, 0.55);
        for (let x = 6; x < w - 4; x += 10) {
            g.fillRect(x, 4, 2, 2);
            g.fillRect(x, faceH - 6, 2, 2);
        }

        // Bottom shadow (dark blue-black)
        g.fillStyle(0x0a1018, 0.85);
        g.fillRect(0, faceH - 2, w, 2);
        // Soft shadow gradient below
        g.fillStyle(0x060a10, 0.35);
        g.fillRect(0, faceH, w, 2);

        g.generateTexture('wall_face_south', w, faceH + 2);
        g.destroy();
    }

    _drawAutoTileWall(g, ox, bitmask, size) {
        const hasN = (bitmask & 1) !== 0;
        const hasE = (bitmask & 2) !== 0;
        const hasS = (bitmask & 4) !== 0;
        const hasW = (bitmask & 8) !== 0;

        g.fillStyle(0x6c7f8e, 1);
        g.fillRect(ox, 0, size, size);
        g.fillStyle(0x576875, 1);
        g.fillRect(ox + 4, 4, size - 8, size - 8);

        if (hasN) { g.fillStyle(0x42505c, 1); g.fillRect(ox, 0, size, 6); }
        else { g.fillStyle(0x9caebb, 1); g.fillRect(ox + 4, 2, size - 8, 3); }

        if (hasS) { g.fillStyle(0x42505c, 1); g.fillRect(ox, size - 6, size, 6); }
        else { g.fillStyle(0x9caebb, 1); g.fillRect(ox + 4, size - 5, size - 8, 3); }

        if (hasW) { g.fillStyle(0x42505c, 1); g.fillRect(ox, 0, 6, size); }
        else { g.fillStyle(0x9caebb, 1); g.fillRect(ox + 2, 4, 3, size - 8); }

        if (hasE) { g.fillStyle(0x42505c, 1); g.fillRect(ox + size - 6, 0, 6, size); }
        else { g.fillStyle(0x9caebb, 1); g.fillRect(ox + size - 5, 4, 3, size - 8); }

        g.lineStyle(2, 0x2d3841, 1);
        g.strokeRect(ox + 1, 1, size - 2, size - 2);
    }

    generateTileset() {
        const size = CONFIG.TILE_SIZE;
        if (this.textures.exists('tileset')) {
            this.textures.remove('tileset');
        }
        const g = this.add.graphics();

        const drawFlatTile = (tileIndex, fill, border, accent = null) => {
            const ox = tileIndex * size;
            g.fillStyle(fill, 1);
            g.fillRect(ox, 0, size, size);
            g.fillStyle(border, 1);
            g.fillRect(ox, 0, size, 3);
            g.fillRect(ox, size - 3, size, 3);
            g.fillRect(ox, 0, 3, size);
            g.fillRect(ox + size - 3, 0, 3, size);
            if (accent !== null) {
                g.fillStyle(accent, 1);
                g.fillRect(ox + 8, 8, size - 16, size - 16);
            }
        };

        drawFlatTile(0, 0x2f3f4c, 0x23313b, 0x364956);
        drawFlatTile(1, 0x8093a3, 0x5f7282, 0x6f8390);
        drawFlatTile(2, 0x3a4c5a, 0x273743, 0x465b68);
        drawFlatTile(3, 0x354654, 0x22303a, 0x415461);

        // ── Indices 4-19: wall autotile variants (4-bit NESW bitmask) ─────────
        for (let bitmask = 0; bitmask < 16; bitmask++) {
            this._drawAutoTileWall(g, (4 + bitmask) * size, bitmask, size);
        }

        g.generateTexture('tileset', size * 20, size);
        g.destroy();
    }

    generateTilesetFromImported() {
        const size = CONFIG.TILE_SIZE;
        const totalW = size * 20;
        if (this.textures.exists('tileset')) this.textures.remove('tileset');
        const tex = this.textures.createCanvas('tileset', totalW, size);
        if (!tex) return false;
        const ctx = tex.getContext();
        if (!ctx) return false;

        const drawTile = (key, tileIndex) => {
            const source = this.textures.get(key)?.getSourceImage();
            if (!source) return false;
            ctx.drawImage(source, tileIndex * size, 0, size, size);
            return true;
        };
        const applyFloorMoodPass = (tileIndex) => {
            const x = tileIndex * size;
            const topGrad = ctx.createLinearGradient(0, 0, 0, size);
            topGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
            topGrad.addColorStop(0.35, 'rgba(0,0,0,0.08)');
            topGrad.addColorStop(1, 'rgba(0,0,0,0.02)');
            ctx.fillStyle = topGrad;
            ctx.fillRect(x, 0, size, size);
            const sideShade = ctx.createLinearGradient(x, 0, x + size, 0);
            sideShade.addColorStop(0, 'rgba(0,0,0,0.12)');
            sideShade.addColorStop(0.16, 'rgba(0,0,0,0.02)');
            sideShade.addColorStop(0.84, 'rgba(0,0,0,0.02)');
            sideShade.addColorStop(1, 'rgba(160,210,245,0.06)');
            ctx.fillStyle = sideShade;
            ctx.fillRect(x, 0, size, size);
            const sodiumStain = ctx.createLinearGradient(x, 0, x + size, size);
            sodiumStain.addColorStop(0, 'rgba(180,130,64,0.03)');
            sodiumStain.addColorStop(0.5, 'rgba(0,0,0,0)');
            sodiumStain.addColorStop(1, 'rgba(110,150,185,0.04)');
            ctx.fillStyle = sodiumStain;
            ctx.fillRect(x, 0, size, size);
        };
        const applyWallMoodPass = (tileIndex) => {
            const x = tileIndex * size;
            // Top-down wall mood: non-directional darkening (no bright south lip).
            const topDark = ctx.createLinearGradient(0, 0, 0, size);
            topDark.addColorStop(0, 'rgba(0,0,0,0.48)');
            topDark.addColorStop(0.5, 'rgba(0,0,0,0.34)');
            topDark.addColorStop(1, 'rgba(0,0,0,0.48)');
            ctx.fillStyle = topDark;
            ctx.fillRect(x, 0, size, size);
            const sideFeather = ctx.createLinearGradient(x, 0, x + size, 0);
            sideFeather.addColorStop(0, 'rgba(0,0,0,0.34)');
            sideFeather.addColorStop(0.12, 'rgba(0,0,0,0.08)');
            sideFeather.addColorStop(0.88, 'rgba(0,0,0,0.08)');
            sideFeather.addColorStop(1, 'rgba(0,0,0,0.34)');
            ctx.fillStyle = sideFeather;
            ctx.fillRect(x, 0, size, size);
        };

        // Index 0: denser "packed row" floor look using both grill variants.
        const grill = this.textures.get('tile_floor_grill_import')?.getSourceImage();
        const grillOffset = this.textures.get('tile_floor_grill_offset_import')?.getSourceImage();
        const customFloor = this.textures.get('tile_floor_custom_import')?.getSourceImage();
        const hadleysFloor = this.textures.get('tile_floor_hadleys_gen')?.getSourceImage();
        const hadleysFloorA = this.textures.get('tile_floor_hadleys_a_gen')?.getSourceImage();
        const hadleysFloorB = this.textures.get('tile_floor_hadleys_b_gen')?.getSourceImage();
        const hadleysFloorC = this.textures.get('tile_floor_hadleys_c_gen')?.getSourceImage();
        const hadleysWall = this.textures.get('tile_wall_hadleys_gen')?.getSourceImage();
        const hadleysWallA = this.textures.get('tile_wall_hadleys_a_gen')?.getSourceImage();
        const hadleysWallB = this.textures.get('tile_wall_hadleys_b_gen')?.getSourceImage();
        if (customFloor) {
            // User-provided floor texture: smooth sample to avoid chunky pixel stepping.
            ctx.imageSmoothingEnabled = true;
            const pattern = ctx.createPattern(customFloor, 'repeat');
            if (!pattern) return false;
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, size, size); // tile index 0
            ctx.fillRect(size * 2, 0, size, size); // tile index 2
            ctx.fillRect(size * 3, 0, size, size); // tile index 3
        } else {
            if (!grill || !grillOffset) return false;
            // Sharper + cooler floor pass.
            ctx.filter = 'contrast(1.2) saturate(1.12) brightness(0.98)';
            ctx.drawImage(grill, 0, 0, size, size);
            ctx.globalAlpha = 0.52;
            ctx.drawImage(grillOffset, 0, 0, size, size);
            ctx.globalAlpha = 1;
            ctx.filter = 'none';
            ctx.fillStyle = 'rgba(86, 156, 220, 0.16)';
            ctx.fillRect(0, 0, size, size);
            if (hadleysFloor || hadleysFloorA) {
                ctx.globalAlpha = 0.22;
                ctx.drawImage(hadleysFloorA || hadleysFloor, 0, 0, size, size);
                ctx.globalAlpha = 1;
            }
            // Row-packed readability pass: subtle horizontal bands + cool highlights.
            for (let y = 6; y < size - 2; y += 8) {
                ctx.fillStyle = 'rgba(10,16,24,0.28)';
                ctx.fillRect(0, y, size, 1);
                ctx.fillStyle = 'rgba(130,172,205,0.10)';
                ctx.fillRect(0, y + 1, size, 1);
            }
            // Frame edge to keep tile boundaries clean under lighting.
            ctx.fillStyle = 'rgba(8,12,18,0.46)';
            ctx.fillRect(0, 0, size, 1);
            ctx.fillRect(0, 0, 1, size);
            ctx.fillStyle = 'rgba(190,220,245,0.08)';
            ctx.fillRect(size - 1, 0, 1, size);
            ctx.fillRect(0, size - 1, size, 1);
            applyFloorMoodPass(0);
        }

        if (!drawTile('tile_wall_corridor_import', 1)) return false;
        if (hadleysWall || hadleysWallA || hadleysWallB) {
            ctx.globalAlpha = 0.2;
            ctx.drawImage(hadleysWallA || hadleysWall, size, 0, size, size);
            if (hadleysWallB) {
                ctx.globalAlpha = 0.12;
                ctx.drawImage(hadleysWallB, size, 0, size, size);
            }
            ctx.globalAlpha = 1;
        }
        applyWallMoodPass(1);

        // ── Wall autotile variants (indices 4-19) ─────────────────────────
        const wallSource = this.textures.get('tile_wall_corridor_import')?.getSourceImage();
        const hadleysWallSrc = hadleysWallA || hadleysWall;
        for (let bitmask = 0; bitmask < 16; bitmask++) {
            const ti = 4 + bitmask;
            const ox = ti * size;
            const hasN = (bitmask & 1) !== 0;
            const hasE = (bitmask & 2) !== 0;
            const hasS = (bitmask & 4) !== 0;
            const hasW = (bitmask & 8) !== 0;

            // Draw imported wall texture as base
            ctx.globalAlpha = 1;
            ctx.filter = 'none';
            if (wallSource) ctx.drawImage(wallSource, ox, 0, size, size);
            if (hadleysWallSrc) {
                ctx.globalAlpha = 0.2;
                ctx.drawImage(hadleysWallSrc, ox, 0, size, size);
                ctx.globalAlpha = 1;
            }
            if (hadleysWallB) {
                ctx.globalAlpha = 0.12;
                ctx.drawImage(hadleysWallB, ox, 0, size, size);
                ctx.globalAlpha = 1;
            }
            applyWallMoodPass(ti);

            // Connected-side dark continuation overlays
            if (hasN) { ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(ox, 0, size, 5); }
            if (hasS) { ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(ox, size - 5, size, 5); }
            if (hasW) { ctx.fillStyle = 'rgba(0,0,0,0.44)'; ctx.fillRect(ox, 0, 5, size); }
            if (hasE) { ctx.fillStyle = 'rgba(0,0,0,0.44)'; ctx.fillRect(ox + size - 5, 0, 5, size); }

            // Keep exposed-edge treatment symmetric in top-down mode.

            // Inner corner darkening
            if (hasN && hasW) { ctx.fillStyle = 'rgba(6,10,15,0.72)'; ctx.fillRect(ox, 0, 7, 7); }
            if (hasN && hasE) { ctx.fillStyle = 'rgba(6,10,15,0.72)'; ctx.fillRect(ox + size - 7, 0, 7, 7); }
            if (hasS && hasW) { ctx.fillStyle = 'rgba(6,10,15,0.72)'; ctx.fillRect(ox, size - 7, 7, 7); }
            if (hasS && hasE) { ctx.fillStyle = 'rgba(6,10,15,0.72)'; ctx.fillRect(ox + size - 7, size - 7, 7, 7); }

            // Outer corner highlights
            if (!hasN && !hasW) { ctx.fillStyle = 'rgba(127,161,184,0.18)'; ctx.fillRect(ox + 3, 3, 3, 3); }
            if (!hasN && !hasE) { ctx.fillStyle = 'rgba(127,161,184,0.18)'; ctx.fillRect(ox + size - 6, 3, 3, 3); }
            if (!hasS && !hasW) { ctx.fillStyle = 'rgba(127,161,184,0.18)'; ctx.fillRect(ox + 3, size - 6, 3, 3); }
            if (!hasS && !hasE) { ctx.fillStyle = 'rgba(127,161,184,0.18)'; ctx.fillRect(ox + size - 6, size - 6, 3, 3); }
        }

        if (!customFloor) {
            // Floor variants: match sharpening + blue tint so all floor tiles feel consistent.
            ctx.filter = 'contrast(1.2) saturate(1.12) brightness(0.98)';
            if (!drawTile('tile_floor_grill_offset_import', 2)) return false;
            if (!drawTile('tile_floor_grill_import', 3)) return false;
            ctx.filter = 'none';
            ctx.fillStyle = 'rgba(86, 156, 220, 0.13)';
            ctx.fillRect(size * 2, 0, size, size);
            ctx.fillRect(size * 3, 0, size, size);
            if (hadleysFloor || hadleysFloorB || hadleysFloorC) {
                ctx.globalAlpha = 0.18;
                ctx.drawImage(hadleysFloorB || hadleysFloor, size * 2, 0, size, size);
                ctx.drawImage(hadleysFloorC || hadleysFloor, size * 3, 0, size, size);
                ctx.globalAlpha = 1;
            }
            applyFloorMoodPass(2);
            applyFloorMoodPass(3);
        }

        tex.refresh();
        return true;
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

        // Ground shadow.
        g.fillStyle(0x080a0e, 0.58);
        g.fillEllipse(cx, cy + Math.floor(size * 0.3), Math.floor(size * 0.5), Math.floor(size * 0.2));

        // Backpack and harness.
        g.fillStyle(0x1a212a, 0.95);
        g.fillRoundedRect(cx - 5, cy - 1, 9, 12, 2);
        g.fillStyle(0x2a3442, 0.9);
        g.fillRect(cx - 4, cy + 1, 7, 2);
        g.fillRect(cx - 4, cy + 5, 7, 2);

        // Legs and boots.
        g.fillStyle(palette.fabric, 1);
        g.fillRoundedRect(cx - 8, cy + 6, 6, 11, 2);
        g.fillRoundedRect(cx + 2, cy + 6, 6, 11, 2);
        g.fillStyle(0x161c24, 1);
        g.fillRect(cx - 8, cy + 14, 6, 3);
        g.fillRect(cx + 2, cy + 14, 6, 3);

        // Main torso armor.
        g.fillStyle(palette.armorDark, 1);
        g.fillRoundedRect(cx - Math.floor(bodyW * 0.5), cy - 4, bodyW, bodyH, 5);
        g.fillStyle(palette.armor, 1);
        g.fillRoundedRect(cx - Math.floor(bodyW * 0.5) + 2, cy - 2, bodyW - 4, bodyH - 9, 4);

        // Shoulder armor.
        g.fillStyle(palette.armorDark, 1);
        g.fillRoundedRect(cx - 11, cy - 1, 5, 6, 2);
        g.fillRoundedRect(cx + 6, cy - 1, 5, 6, 2);

        // Chest plate + readout band.
        g.fillStyle(0x10161f, 0.95);
        g.fillRect(cx - 2, cy, 4, 9);
        g.fillStyle(palette.accent, 0.9);
        g.fillRect(cx - 7, cy + 7, 14, 2);
        g.fillStyle(0xbde9ff, 0.58);
        g.fillRect(cx - 1, cy + 2, 2, 2);

        // Helmet shell and visor.
        g.fillStyle(palette.armorDark, 1);
        g.fillEllipse(cx, cy - 10, helmetW, helmetH);
        g.fillStyle(palette.armor, 1);
        g.fillEllipse(cx - 1, cy - 11, helmetW - 5, helmetH - 6);
        g.fillStyle(palette.visor, 0.96);
        g.fillRoundedRect(cx + 2, cy - 14, Math.floor(size * 0.16), Math.floor(size * 0.11), 2);
        g.fillStyle(0xffffff, 0.5);
        g.fillRect(cx + 4, cy - 13, Math.floor(size * 0.09), 1);

        // Rifle + muzzle module.
        g.fillStyle(palette.weapon, 1);
        g.fillRect(cx + 8, cy - 1, Math.floor(size * 0.25), 4);
        g.fillRect(cx + 16, cy + 1, Math.floor(size * 0.12), 3);
        g.fillStyle(0x2a3138, 1);
        g.fillRect(cx + 8, cy + 3, Math.floor(size * 0.13), 3);
        g.fillStyle(0xaec2d8, 0.62);
        g.fillRect(cx + Math.floor(size * 0.29), cy - 1, 2, 3);

        // Directional rim highlight.
        g.fillStyle(0xd5e8ff, 0.22);
        g.fillRect(cx + 4, cy - 4, 2, 12);

        // Outline pass.
        g.lineStyle(1, 0x090c11, 0.92);
        g.strokeEllipse(cx, cy - 10, helmetW, helmetH);
        g.strokeRoundedRect(cx - Math.floor(bodyW * 0.5), cy - 4, bodyW, bodyH, 5);

        g.generateTexture(textureKey, size, size);
        g.destroy();
    }

    loadRegistrySprites() {
        // Load additional sprites from the sprite registry (editor Character assignments).
        // This makes editor-assigned walk/attack/etc. sprites available at runtime.
        const registry = this.cache.json.get('sprite_registry');
        if (!registry?.assignments) return;
        let needsLoad = false;
        for (const [key, spritePath] of Object.entries(registry.assignments)) {
            // Convert "alien_warrior:attack" → "alien_warrior_attack"
            const texKey = key.replace(':', '_');
            if (this.textures.exists(texKey)) continue;
            // Only auto-load from the sprite pipeline (scaled assets)
            if (!spritePath.startsWith('/assets/sprites/scaled/')) continue;
            this.load.image(texKey, spritePath);
            needsLoad = true;
        }
        if (needsLoad) {
            this.load.start();
        }
    }

    generateAlienTextures() {
        // Prefer generated pixel pack from sprite maker pipeline if present.
        if (
            this.textures.exists('alien_warrior')
            && this.textures.exists('alien_drone')
            && this.textures.exists('alien_facehugger')
            && this.textures.exists('alien_egg')
            && this.textures.exists('alien_queen_lesser')
            && this.textures.exists('alien_queen')
            && this.textures.exists('alien_runner')
            && this.textures.exists('alien_spitter')
        ) {
            return;
        }
        // ── Warrior: hard-edged pixel silhouette, long dome head, spider-like stance ──
        {
            const g = this.add.graphics();
            // Pixel body mass
            g.fillStyle(0x12161d, 1);
            g.fillRect(8, 11, 11, 13);
            g.fillRect(7, 14, 13, 8);
            // Dorsal spine
            g.fillStyle(0x1f2731, 1);
            g.fillRect(10, 10, 7, 2);
            g.fillRect(11, 9, 6, 1);
            // Elongated xeno dome
            g.fillStyle(0x1a212b, 1);
            g.fillRect(15, 7, 12, 4);
            g.fillRect(19, 6, 9, 2);
            g.fillStyle(0x0b0f14, 0.9);
            g.fillRect(20, 8, 6, 2);
            // Side legs / spider spread
            g.fillStyle(0x0d1117, 1);
            g.fillRect(4, 12, 4, 2);
            g.fillRect(3, 17, 5, 2);
            g.fillRect(22, 12, 5, 2);
            g.fillRect(22, 18, 6, 2);
            g.fillRect(5, 22, 5, 2);
            g.fillRect(21, 22, 6, 2);
            // Tail base + tip
            g.fillStyle(0x0e131a, 1);
            g.fillRect(6, 20, 3, 2);
            g.fillRect(4, 20, 2, 1);
            // Acid jaw glint
            g.fillStyle(0x2cb861, 0.65);
            g.fillRect(24, 9, 2, 2);
            // Pixel outline
            g.lineStyle(1, 0x86d8ff, 0.28);
            g.strokeRect(7, 10, 13, 14);
            g.strokeRect(15, 7, 12, 4);
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
            g.fillEllipse(23, 10, 24, 8);
            g.fillStyle(0x0a0e14, 0.9);
            g.fillEllipse(25, 10, 13, 4);
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
            g.strokeEllipse(23, 10, 25, 9);
            g.fillStyle(0x44cc77, 0.75);
            g.fillCircle(27, 10, 1.3);
            g.generateTexture('alien_drone', 32, 32);
            g.destroy();
        }

        // ── Facehugger: pixel crab/spider read with pronounced legs and hooked tail ──
        {
            const g = this.add.graphics();
            // Core
            g.fillStyle(0x2a313a, 1);
            g.fillRect(12, 13, 8, 6);
            g.fillStyle(0x3b4b58, 0.85);
            g.fillRect(13, 15, 6, 3);
            // Upper legs
            g.fillStyle(0x1a222b, 1);
            g.fillRect(6, 10, 6, 2);
            g.fillRect(20, 10, 6, 2);
            g.fillRect(4, 13, 7, 2);
            g.fillRect(21, 13, 7, 2);
            // Lower legs
            g.fillRect(5, 18, 7, 2);
            g.fillRect(20, 18, 7, 2);
            g.fillRect(7, 21, 6, 2);
            g.fillRect(19, 21, 6, 2);
            // Hooked tail
            g.fillStyle(0x171f28, 1);
            g.fillRect(10, 18, 2, 3);
            g.fillRect(8, 20, 2, 2);
            g.fillRect(7, 21, 1, 2);
            // Cyan cue
            g.lineStyle(1, 0x7fd7ff, 0.32);
            g.strokeRect(12, 13, 8, 6);
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
            g.fillEllipse(22, isSpitter ? 9 : 10, isSpitter ? 25 : 21, isSpitter ? 11 : 8);
            g.fillStyle(0x0e1218, 0.85);
            g.fillEllipse(24, isSpitter ? 9 : 10, isSpitter ? 14 : 10, 5);
            g.fillStyle(0x0e1218, 0.6);
            g.fillRect(9, 17, 12, 2);
            g.fillRect(9, 21, 12, 2);
            g.fillStyle(isSpitter ? 0x44bb22 : 0x28aa55, 0.5);
            g.fillCircle(isSpitter ? 25 : 24, 11, isSpitter ? 3 : 2);
            g.lineStyle(1, 0x7fd7ff, 0.4);
            g.strokeEllipse(15, 19, 20, 24);
            g.strokeEllipse(22, isSpitter ? 9 : 10, isSpitter ? 26 : 22, isSpitter ? 12 : 9);
            g.fillStyle(0x44cc77, 0.75);
            g.fillCircle(isSpitter ? 27 : 26, 10, 1.4);
            g.generateTexture(`alien_${key}`, 32, 32);
            g.destroy();
        }
    }

    initAlienWalkAnimation() {
        // Walk animations removed — using single idle sprites from /assets/sprites/scaled/
        // Animations will be re-added when GIF-based animation pipeline is implemented
    }

    generateAlienOverlayTextures() {
        // Subtle black tendril halo to reinforce alien silhouette at a glance.
        const g = this.add.graphics();
        const cx = 24;
        const cy = 24;
        g.clear();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6;
            const len = 12 + (i % 2) * 4;
            const mx = cx + Math.cos(a + 0.28) * (len * 0.52);
            const my = cy + Math.sin(a + 0.28) * (len * 0.52);
            const x2 = cx + Math.cos(a) * len;
            const y2 = cy + Math.sin(a) * len;
            g.lineStyle(3, 0x000000, 0.32);
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
            g.lineTo(mx, my);
            g.lineTo(x2, y2);
            g.strokePath();
            g.lineStyle(1, 0x000000, 0.48);
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
            g.lineTo(
                cx + Math.cos(a - 0.2) * (len * 0.46),
                cy + Math.sin(a - 0.2) * (len * 0.46)
            );
            g.lineTo(x2 * 0.98 + cx * 0.02, y2 * 0.98 + cy * 0.02);
            g.strokePath();
        }
        g.fillStyle(0x000000, 0.36);
        g.fillEllipse(cx, cy + 2, 20, 12);
        g.generateTexture('alien_tendril_overlay', 48, 48);
        g.destroy();

        // Lateral leg/tendril strip for spider-like side spread during movement.
        const gl = this.add.graphics();
        gl.lineStyle(3, 0x000000, 0.52);
        gl.beginPath();
        gl.moveTo(8, 16);
        gl.lineTo(16, 12);
        gl.lineTo(24, 15);
        gl.lineTo(32, 11);
        gl.lineTo(40, 14);
        gl.strokePath();
        gl.lineStyle(2, 0x000000, 0.42);
        gl.beginPath();
        gl.moveTo(8, 32);
        gl.lineTo(16, 36);
        gl.lineTo(24, 33);
        gl.lineTo(32, 37);
        gl.lineTo(40, 34);
        gl.strokePath();
        gl.generateTexture('alien_leg_overlay', 48, 48);
        gl.destroy();

        this.generateAlienTailTextures();

        // Shadow blob — soft feathered ellipse, 32×16 (2:1 for top-down perspective).
        // Three concentric fills build a centre-dark, edge-transparent gradient.
        const gs = this.make.graphics({ add: false });
        gs.fillStyle(0x000000, 0.5);
        gs.fillEllipse(16, 8, 32, 16);
        gs.fillStyle(0x000000, 0.35);
        gs.fillEllipse(16, 8, 20, 10);
        gs.fillStyle(0x000000, 0.3);
        gs.fillEllipse(16, 8, 10, 5);
        gs.generateTexture('shadow_blob', 32, 16);
        gs.destroy();
    }

    generateAlienTailTextures() {
        // Use the user-authored tail sprites: tailbase.png, tailmid.png, tailend.png.
        // These are 50×100px files with content centred inside (vertical orientation).
        const srcDefs = [
            { srcKey: '__tail_src_base__', destKey: 'alien_tail_base', cx: 11, cy: 11, cw: 26, ch: 75 },
            { srcKey: '__tail_src_mid__',  destKey: 'alien_tail_mid',  cx: 17, cy: 24, cw: 17, ch: 53 },
            { srcKey: '__tail_src_end__',  destKey: 'alien_tail_tip',  cx: 26, cy:  5, cw:  9, ch: 89 },
        ];
        
        let allLoaded = true;
        for (const def of srcDefs) {
            const tex = this.textures.get(def.srcKey);
            if (!tex || tex.key === '__MISSING') { allLoaded = false; break; }
            const src = tex.getSourceImage();
            if (!src || src.width === 0) { allLoaded = false; break; }
        }

        if (allLoaded) {
            for (const { srcKey, destKey, cx, cy, cw, ch } of srcDefs) {
                const src = this.textures.get(srcKey).getSourceImage();
                if (this.textures.exists(destKey)) this.textures.remove(destKey);
                const tw = Math.max(cw, 10);
                const th = ch;
                const tx = this.textures.createCanvas(destKey, tw, th);
                if (!tx) continue;
                const ctx = tx.getContext();
                ctx.clearRect(0, 0, tw, th);
                const xOffset = Math.floor((tw - cw) / 2);
                ctx.drawImage(src, cx, cy, cw, ch, xOffset, 0, cw, ch);
                tx.refresh();
            }

            // Generate a combined 'alien_tail_rope' for the mesh system
            // We stitch segments HORIZONTALLY now for natural rope bending
            const totalW = 75 + 53 + 89;
            const rh = 26;
            if (this.textures.exists('alien_tail_rope')) this.textures.remove('alien_tail_rope');
            const rtx = this.textures.createCanvas('alien_tail_rope', totalW, rh);
            if (rtx) {
                const rctx = rtx.getContext();
                const base = this.textures.get('alien_tail_base').getSourceImage();
                const mid = this.textures.get('alien_tail_mid').getSourceImage();
                const tip = this.textures.get('alien_tail_tip').getSourceImage();
                
                // Vertical to Horizontal: Draw segments rotated -90deg or just use their native orientation if the rope likes it.
                // Assuming the cropped textures are vertical (tall), we want them horizontal (wide) for the Rope.
                
                const drawRotated = (img, x, y) => {
                    rctx.save();
                    rctx.translate(x + img.height/2, y + img.width/2);
                    rctx.rotate(-Math.PI / 2);
                    rctx.drawImage(img, -img.width/2, -img.height/2);
                    rctx.restore();
                };

                drawRotated(base, 0, 0);
                drawRotated(mid, 75, 0);
                drawRotated(tip, 75 + 53, 0);
                rtx.refresh();
            }
            return;
        }

        // Fallback: procedural oval segments
        for (const [destKey, w, h] of [
            ['alien_tail_base', 24, 14],
            ['alien_tail_mid',  20, 11],
            ['alien_tail_tip',  14,  8],
        ]) {
            if (this.textures.exists(destKey)) this.textures.remove(destKey);
            const tx = this.textures.createCanvas(destKey, w, h);
            if (!tx) continue;
            const ctx = tx.getContext();
            ctx.fillStyle = 'rgba(50, 100, 60, 1.0)';
            ctx.beginPath();
            ctx.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(100, 160, 110, 0.55)';
            ctx.beginPath();
            ctx.ellipse(w / 2, h / 2 - 1, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
            ctx.fill();
            tx.refresh();
        }

        // Generate fallback 'alien_tail_rope'
        if (this.textures.exists('alien_tail_rope')) this.textures.remove('alien_tail_rope');
        const frtx = this.textures.createCanvas('alien_tail_rope', 20, 60);
        if (frtx) {
            const fctx = frtx.getContext();
            fctx.fillStyle = 'rgba(80, 160, 100, 0.8)';
            fctx.fillRect(4, 0, 12, 60);
            frtx.refresh();
        }
    }

    generateAlienBloodSVGTextures() {
        // SVG-style alien acid blood splatters — organic jagged shapes via Canvas 2D paths.
        // 4 variants in xenomorph acid green/yellow, each 32×32.
        const size = 32;
        const cx = 16;
        const cy = 16;

        // ── Variant 0: Irregular star-burst splat ──
        const t0 = this.textures.createCanvas('alien_blood_svg_0', size, size);
        const c0 = t0.getContext();
        c0.fillStyle = '#c8d828';
        c0.globalAlpha = 0.88;
        c0.beginPath();
        c0.moveTo(16, 5);
        c0.quadraticCurveTo(13, 10, 7, 8);
        c0.quadraticCurveTo(10, 13, 5, 16);
        c0.quadraticCurveTo(9, 19, 7, 24);
        c0.quadraticCurveTo(12, 21, 16, 27);
        c0.quadraticCurveTo(20, 22, 25, 24);
        c0.quadraticCurveTo(22, 19, 27, 16);
        c0.quadraticCurveTo(22, 12, 25, 8);
        c0.quadraticCurveTo(19, 11, 16, 5);
        c0.fill();
        // Visible stroke outline — 50% opacity to blend over holes and floor.
        c0.strokeStyle = '#a0b020';
        c0.globalAlpha = 0.5;
        c0.lineWidth = 2.5;
        c0.lineJoin = 'round';
        c0.stroke();
        // Dark corroded centre
        c0.fillStyle = '#1a1c08';
        c0.globalAlpha = 0.55;
        c0.beginPath();
        c0.arc(16, 16, 3.5, 0, Math.PI * 2);
        c0.fill();
        // Drip tendrils
        c0.strokeStyle = '#c8d828';
        c0.globalAlpha = 0.5;
        c0.lineWidth = 2.5;
        c0.lineCap = 'round';
        c0.beginPath(); c0.moveTo(7, 8); c0.lineTo(3, 3); c0.stroke();
        c0.beginPath(); c0.moveTo(25, 8); c0.lineTo(29, 4); c0.stroke();
        // Satellite droplets
        c0.fillStyle = '#c8d828';
        c0.globalAlpha = 0.5;
        c0.beginPath(); c0.arc(3, 3, 1.4, 0, Math.PI * 2); c0.fill();
        c0.beginPath(); c0.arc(29, 4, 1.0, 0, Math.PI * 2); c0.fill();
        t0.refresh();

        // ── Variant 1: Elongated drip splat ──
        const t1 = this.textures.createCanvas('alien_blood_svg_1', size, size);
        const c1 = t1.getContext();
        c1.fillStyle = '#b8c420';
        c1.globalAlpha = 0.85;
        c1.beginPath();
        c1.moveTo(14, 7);
        c1.quadraticCurveTo(9, 11, 6, 10);
        c1.quadraticCurveTo(8, 15, 5, 18);
        c1.quadraticCurveTo(9, 20, 12, 25);
        c1.quadraticCurveTo(15, 21, 17, 23);
        c1.quadraticCurveTo(19, 19, 24, 21);
        c1.quadraticCurveTo(22, 17, 26, 14);
        c1.quadraticCurveTo(21, 12, 23, 8);
        c1.quadraticCurveTo(19, 10, 14, 7);
        c1.fill();
        // Visible stroke outline — 50% opacity to blend over holes and floor.
        c1.strokeStyle = '#98a818';
        c1.globalAlpha = 0.5;
        c1.lineWidth = 2.5;
        c1.lineJoin = 'round';
        c1.stroke();
        c1.fillStyle = '#a0b018';
        c1.globalAlpha = 0.6;
        c1.beginPath(); c1.ellipse(15, 16, 5, 4, 0, 0, Math.PI * 2); c1.fill();
        c1.fillStyle = '#0d0f08';
        c1.globalAlpha = 0.5;
        c1.beginPath(); c1.arc(14, 15, 2.2, 0, Math.PI * 2); c1.fill();
        // Drip trail
        c1.strokeStyle = '#b8c420';
        c1.globalAlpha = 0.5;
        c1.lineWidth = 2.5;
        c1.lineCap = 'round';
        c1.beginPath(); c1.moveTo(12, 25); c1.lineTo(11, 30); c1.stroke();
        c1.fillStyle = '#b8c420';
        c1.globalAlpha = 0.45;
        c1.beginPath(); c1.arc(11, 30, 1.2, 0, Math.PI * 2); c1.fill();
        c1.beginPath(); c1.arc(4, 6, 1.0, 0, Math.PI * 2); c1.fill();
        t1.refresh();

        // ── Variant 2: Wide multi-lobe splat ──
        const t2 = this.textures.createCanvas('alien_blood_svg_2', size, size);
        const c2 = t2.getContext();
        c2.fillStyle = '#d4e832';
        c2.globalAlpha = 0.82;
        c2.beginPath();
        c2.moveTo(10, 13);
        c2.quadraticCurveTo(7, 9, 12, 7);
        c2.quadraticCurveTo(14, 5, 17, 10);
        c2.quadraticCurveTo(20, 5, 23, 8);
        c2.quadraticCurveTo(25, 11, 21, 15);
        c2.quadraticCurveTo(26, 17, 23, 21);
        c2.quadraticCurveTo(20, 23, 17, 19);
        c2.quadraticCurveTo(14, 23, 11, 21);
        c2.quadraticCurveTo(9, 18, 13, 16);
        c2.quadraticCurveTo(9, 14, 10, 13);
        c2.fill();
        // Visible stroke outline — 50% opacity to blend over holes and floor.
        c2.strokeStyle = '#b0c028';
        c2.globalAlpha = 0.5;
        c2.lineWidth = 2.5;
        c2.lineJoin = 'round';
        c2.stroke();
        c2.fillStyle = '#a8b820';
        c2.globalAlpha = 0.65;
        c2.beginPath(); c2.ellipse(16, 15, 4.5, 3.5, 0, 0, Math.PI * 2); c2.fill();
        c2.fillStyle = '#1a1c08';
        c2.globalAlpha = 0.5;
        c2.beginPath(); c2.arc(16, 15, 2, 0, Math.PI * 2); c2.fill();
        // Tendrils
        c2.strokeStyle = '#d4e832';
        c2.globalAlpha = 0.5;
        c2.lineWidth = 2.5;
        c2.lineCap = 'round';
        c2.beginPath(); c2.moveTo(12, 7); c2.lineTo(10, 2); c2.stroke();
        c2.beginPath(); c2.moveTo(23, 21); c2.lineTo(27, 26); c2.stroke();
        c2.fillStyle = '#d4e832';
        c2.globalAlpha = 0.4;
        c2.beginPath(); c2.arc(10, 2, 1.3, 0, Math.PI * 2); c2.fill();
        c2.beginPath(); c2.arc(27, 26, 1.0, 0, Math.PI * 2); c2.fill();
        t2.refresh();

        // ── Variant 3: Asymmetric angular splat ──
        const t3 = this.textures.createCanvas('alien_blood_svg_3', size, size);
        const c3 = t3.getContext();
        c3.fillStyle = '#e0f040';
        c3.globalAlpha = 0.8;
        c3.beginPath();
        c3.moveTo(18, 6);
        c3.quadraticCurveTo(13, 9, 9, 7);
        c3.quadraticCurveTo(7, 12, 11, 15);
        c3.quadraticCurveTo(7, 19, 9, 23);
        c3.quadraticCurveTo(13, 20, 16, 25);
        c3.quadraticCurveTo(19, 22, 23, 25);
        c3.quadraticCurveTo(25, 20, 21, 17);
        c3.quadraticCurveTo(26, 13, 23, 9);
        c3.quadraticCurveTo(20, 11, 18, 6);
        c3.fill();
        // Visible stroke outline — 50% opacity to blend over holes and floor.
        c3.strokeStyle = '#c0d030';
        c3.globalAlpha = 0.5;
        c3.lineWidth = 2.5;
        c3.lineJoin = 'round';
        c3.stroke();
        c3.fillStyle = '#c8d828';
        c3.globalAlpha = 0.6;
        c3.beginPath(); c3.ellipse(16, 16, 4, 5, 0, 0, Math.PI * 2); c3.fill();
        c3.fillStyle = '#0d0f08';
        c3.globalAlpha = 0.5;
        c3.beginPath(); c3.arc(15, 16, 2.2, 0, Math.PI * 2); c3.fill();
        c3.strokeStyle = '#e0f040';
        c3.globalAlpha = 0.5;
        c3.lineWidth = 2.5;
        c3.lineCap = 'round';
        c3.beginPath(); c3.moveTo(9, 7); c3.lineTo(5, 2); c3.stroke();
        c3.beginPath(); c3.moveTo(23, 25); c3.lineTo(28, 29); c3.stroke();
        c3.fillStyle = '#e0f040';
        c3.globalAlpha = 0.5;
        c3.beginPath(); c3.arc(5, 2, 1.5, 0, Math.PI * 2); c3.fill();
        c3.globalAlpha = 0.35;
        c3.beginPath(); c3.arc(28, 29, 1.2, 0, Math.PI * 2); c3.fill();
        c3.beginPath(); c3.arc(3, 18, 0.8, 0, Math.PI * 2); c3.fill();
        t3.refresh();
    }

    generateDecalTextures() {
        // Acid splatter decals — authentic xenomorph yellow-chartreuse, dark corroded centre.
        // Research palette: active acid is ~0xd4e832 (sulfuric yellow-green), centre is near-black
        // (completed reaction), edge has bright "hot rim" (still reacting).
        const variants = [
            // [angle_offset, num_blobs, blob_color, center_r]
            [0.0,  7, 0xc8d828, 9],
            [0.4,  6, 0xd4e832, 8],
            [1.1,  8, 0xb8c420, 10],
            [2.2,  6, 0xe0f040, 7],
        ];
        for (let vi = 0; vi < variants.length; vi++) {
            const [angOff, numBlobs, col, cr] = variants[vi];
            const g = this.add.graphics();
            const cx = 28;
            const cy = 28;
            for (let b = 0; b < numBlobs; b++) {
                const angle = angOff + (b / numBlobs) * Math.PI * 2;
                const dist = 3 + (b % 4) * 4 + vi;
                const bx = cx + Math.cos(angle) * dist;
                const by = cy + Math.sin(angle) * dist * 0.7;
                const bw = 10 + (b + vi) % 8;
                const bh = 6 + (b + vi * 2) % 6;
                const alpha = 0.28 - b * 0.025;
                g.fillStyle(col, Math.max(0.05, alpha));
                g.fillEllipse(bx, by, bw, bh);
            }
            // Central pool — brighter at edge (hot-rim: active reaction), dark centre (spent)
            g.fillStyle(col, 0.42);
            g.fillEllipse(cx, cy, cr * 2, cr * 1.4);
            // Dark corroded nucleus (completed reaction zone)
            g.fillStyle(0x0d0f08, 0.72);
            g.fillEllipse(cx + 1, cy + 1, cr * 0.9, cr * 0.65);
            // Dried yellow-brown residue ring at mid-radius
            g.fillStyle(0x8a8010, 0.22);
            g.fillEllipse(cx, cy, cr * 1.5, cr * 1.1);
            // Faint iridescent glint on nucleus surface
            g.fillStyle(0xf8ffc0, 0.14);
            g.fillEllipse(cx - 2, cy - 2, cr * 0.38, cr * 0.28);
            g.generateTexture(`acid_splat_${vi}`, 56, 56);
            g.destroy();
        }

        // ── Permanent acid burn scars ── left on floor after pool dissipates / alien killed.
        // Authentic look: near-black corroded centre, yellow-brown dried acid halo, irregular edges.
        const burnVars = [
            [0.0,  5, 10],
            [0.8,  6, 11],
            [1.6,  7, 9],
            [2.4,  5, 12],
        ];
        for (let vi = 0; vi < burnVars.length; vi++) {
            const [angOff, numBlobs, cr] = burnVars[vi];
            const g = this.add.graphics();
            const cx = 28;
            const cy = 28;
            // Outer yellow-brown acid residue — dried crust at halo edge
            for (let b = 0; b < numBlobs; b++) {
                const angle = angOff + (b / numBlobs) * Math.PI * 2;
                const dist = 5 + (b % 4) * 3.5 + vi * 0.6;
                const bx = cx + Math.cos(angle) * dist;
                const by = cy + Math.sin(angle) * dist * 0.68;
                const bw = 9 + (b + vi) % 7;
                const bh = 5 + (b + vi) % 5;
                g.fillStyle(0x8a8010, Math.max(0.06, 0.26 - b * 0.03));
                g.fillEllipse(bx, by, bw, bh);
            }
            // Dark olive mid-ring (partially reacted)
            g.fillStyle(0x2e3810, 0.78);
            g.fillEllipse(cx, cy, cr * 1.85, cr * 1.32);
            // Near-black corroded centre (fully reacted / carbonised)
            g.fillStyle(0x0d0f08, 0.92);
            g.fillEllipse(cx, cy, cr * 1.18, cr * 0.88);
            // Faint iridescent residue at very centre
            g.fillStyle(0x3d4810, 0.34);
            g.fillEllipse(cx - 1, cy - 1, cr * 0.55, cr * 0.42);
            g.generateTexture(`acid_burn_${vi}`, 56, 56);
            g.destroy();
        }

        // Scorch mark decals — left on floor/wall after bullet impacts.
        for (let si = 0; si < 3; si++) {
            const g = this.add.graphics();
            const cx = 16;
            const cy = 16;
            // Outer char ring
            g.fillStyle(0x0a0a0a, 0.45 - si * 0.05);
            g.fillEllipse(cx, cy, 20 + si * 2, 14 + si);
            // Inner scorch
            g.fillStyle(0x1a1208, 0.55);
            g.fillEllipse(cx + (si - 1), cy, 10, 7);
            // Tiny bright core remnant
            g.fillStyle(0xffcc44, 0.12);
            g.fillCircle(cx, cy, 2);
            g.generateTexture(`scorch_${si}`, 32, 32);
            g.destroy();
        }

        // Marine blood decals — subtle dark red splatters for hit feedback.
        const bloodVariants = [
            [0.0, 7, 0xa53232, 10],
            [0.7, 8, 0x8e2a2a, 11],
            [1.4, 6, 0xb23f3f, 9],
            [2.1, 9, 0x7a2424, 12],
        ];
        for (let vi = 0; vi < bloodVariants.length; vi++) {
            const [angOff, numBlobs, col, cr] = bloodVariants[vi];
            const g = this.add.graphics();
            const cx = 28;
            const cy = 28;
            for (let b = 0; b < numBlobs; b++) {
                const angle = angOff + (b / numBlobs) * Math.PI * 2;
                const dist = 4 + (b % 5) * 3 + vi;
                const bx = cx + Math.cos(angle) * dist;
                const by = cy + Math.sin(angle) * dist * 0.74;
                const bw = 8 + (b + vi) % 9;
                const bh = 5 + (b + vi * 2) % 6;
                const alpha = 0.3 - b * 0.02;
                g.fillStyle(col, Math.max(0.08, alpha));
                g.fillEllipse(bx, by, bw, bh);
            }
            g.fillStyle(col, 0.34);
            g.fillEllipse(cx, cy, cr * 1.9, cr * 1.3);
            g.fillStyle(0x2a0d0d, 0.52);
            g.fillEllipse(cx + 1, cy + 1, cr * 0.84, cr * 0.6);
            g.fillStyle(0xd18a8a, 0.14);
            g.fillEllipse(cx - 2, cy - 2, cr * 0.45, cr * 0.3);
            g.generateTexture(`blood_splat_${vi}`, 56, 56);
            g.destroy();
        }
    }

    generatePropTextures() {
        // Prefer generated prop pack when available.
        if (
            this.textures.exists('prop_desk')
            && this.textures.exists('prop_lamp')
            && this.textures.exists('prop_container')
            && this.textures.exists('prop_barrel')
        ) return;
        if (!this.textures.exists('prop_desk')) {
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
            gd.fillStyle(0x788c9b, 0.22);
            gd.fillRect(16, 20, deskW - 32, 1);
            gd.fillStyle(0x57462b, 0.2);
            gd.fillRect(18, deskH - 24, 3, 10);
            gd.fillRect(deskW - 21, deskH - 22, 3, 9);
            gd.fillStyle(0x1a1f25, 0.9);
            gd.fillRect(12, deskH - 13, 18, 6);
            gd.fillRect(deskW - 30, deskH - 13, 18, 6);
            gd.generateTexture('prop_desk', deskW, deskH);
            gd.destroy();
        }

        if (!this.textures.exists('prop_lamp')) {
            // Lamp prop — industrial ceiling fixture with bright emitter and bloom.
            const lampSize = CONFIG.TILE_SIZE;
            const gl = this.add.graphics();
            const cx = Math.floor(lampSize * 0.5);
            const cy = Math.floor(lampSize * 0.5);
            // Outer bloom haze
            gl.fillStyle(0xb8d8ff, 0.08);
            gl.fillCircle(cx, cy, 28);
            gl.fillStyle(0xb8d8ff, 0.14);
            gl.fillCircle(cx, cy, 20);
            // Fixture housing — octagonal base
            gl.fillStyle(0x18222c, 0.92);
            gl.fillCircle(cx, cy, 13);
            gl.fillStyle(0x27353f, 1);
            gl.fillRect(cx - 9, cy - 2, 18, 4);
            gl.fillRect(cx - 7, cy - 7, 14, 14);
            // Emitter disc — bright core
            gl.fillStyle(0x4a78a8, 1);
            gl.fillCircle(cx, cy, 7);
            gl.fillStyle(0x90c4e8, 1);
            gl.fillCircle(cx, cy, 5);
            gl.fillStyle(0xd8f0ff, 1);
            gl.fillCircle(cx, cy, 3);
            gl.fillStyle(0xffffff, 0.95);
            gl.fillCircle(cx, cy, 1.5);
            gl.fillStyle(0xffd38c, 0.2);
            gl.fillCircle(cx + 1, cy + 1, 2.8);
            // Emitter ring
            gl.lineStyle(1, 0x6aaad8, 0.82);
            gl.strokeCircle(cx, cy, 6);
            // Mounting bracket arms (cross)
            gl.lineStyle(2, 0x1a2530, 0.88);
            gl.lineBetween(cx - 9, cy, cx - 13, cy);
            gl.lineBetween(cx + 9, cy, cx + 13, cy);
            gl.lineBetween(cx, cy - 9, cx, cy - 13);
            gl.lineBetween(cx, cy + 9, cx, cy + 13);
            gl.generateTexture('prop_lamp', lampSize, lampSize);
            gl.destroy();
        }

        // Container prop — compact industrial cargo crate footprint.
        const contSize = CONFIG.TILE_SIZE;
        const gc = this.add.graphics();
        gc.fillStyle(0x1f2a34, 0.96);
        gc.fillRoundedRect(4, 6, contSize - 8, contSize - 12, 4);
        gc.lineStyle(2, 0x4e6479, 0.8);
        gc.strokeRoundedRect(4, 6, contSize - 8, contSize - 12, 4);
        gc.fillStyle(0x3c5062, 0.88);
        gc.fillRect(8, 10, contSize - 16, 6);
        gc.fillRect(8, contSize - 16, contSize - 16, 4);
        gc.fillStyle(0x89a0b2, 0.24);
        gc.fillRect(10, 12, contSize - 20, 2);
        gc.lineStyle(1, 0x6f879a, 0.55);
        gc.lineBetween(contSize * 0.5, 10, contSize * 0.5, contSize - 8);
        gc.generateTexture('prop_container', contSize, contSize);
        gc.destroy();

        // Barrel prop — cylindrical drum with top cap highlights.
        const barrelSize = CONFIG.TILE_SIZE;
        const gb = this.add.graphics();
        const bx = Math.floor(barrelSize * 0.5);
        const by = Math.floor(barrelSize * 0.5);
        gb.fillStyle(0x23303a, 0.96);
        gb.fillEllipse(bx, by, barrelSize * 0.62, barrelSize * 0.68);
        gb.lineStyle(2, 0x5a7384, 0.72);
        gb.strokeEllipse(bx, by, barrelSize * 0.62, barrelSize * 0.68);
        gb.fillStyle(0x3f5769, 0.7);
        gb.fillEllipse(bx, by - 6, barrelSize * 0.42, barrelSize * 0.22);
        gb.fillStyle(0x8ea6b7, 0.28);
        gb.fillEllipse(bx - 2, by - 7, barrelSize * 0.18, barrelSize * 0.08);
        gb.fillStyle(0x121a22, 0.45);
        gb.fillRect(bx - 10, by - 2, 20, 3);
        gb.fillRect(bx - 9, by + 6, 18, 2);
        gb.generateTexture('prop_barrel', barrelSize, barrelSize);
        gb.destroy();
    }

    generateLightTextures() {
        // Soft flashlight endpoint gobo used by LightingOverlay.
        const w = 128;
        const h = 80;
        const g = this.add.graphics();
        const cx = Math.floor(w * 0.5);
        const cy = Math.floor(h * 0.5);

        g.fillStyle(0xffffff, 0.06);
        g.fillEllipse(cx, cy, 122, 76);
        g.fillStyle(0xffffff, 0.1);
        g.fillEllipse(cx + 2, cy, 104, 62);
        g.fillStyle(0xffffff, 0.16);
        g.fillEllipse(cx + 4, cy, 82, 46);
        g.fillStyle(0xffffff, 0.28);
        g.fillEllipse(cx + 7, cy, 58, 30);
        g.fillStyle(0xffffff, 0.45);
        g.fillEllipse(cx + 9, cy, 34, 18);

        // Subtle streaks break up the perfect oval so it reads like projected light.
        g.fillStyle(0xffffff, 0.1);
        g.fillTriangle(cx + 2, cy - 2, cx + 36, cy - 7, cx + 36, cy - 1);
        g.fillTriangle(cx + 2, cy + 2, cx + 36, cy + 1, cx + 36, cy + 7);
        g.fillTriangle(cx - 5, cy - 1, cx - 32, cy - 4, cx - 32, cy + 2);

        g.generateTexture('torch_beam_tip', w, h);
        g.destroy();
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
        // Pulse rifle tracer — thin elongated diamond, hot yellow-white streak
        const gp = this.add.graphics();
        gp.fillStyle(0xccdd44, 0.4);
        gp.fillEllipse(8, 3, 16, 3);       // outer glow streak
        gp.fillStyle(0xeeff88, 0.9);
        gp.fillEllipse(8, 3, 12, 2);       // mid body
        gp.fillStyle(0xffffff, 1);
        gp.fillEllipse(8, 3, 6, 1);        // white-hot core
        gp.generateTexture('bullet_pulse', 16, 6);
        gp.destroy();

        // Shotgun pellet — small hot orange diamond sliver
        const gs = this.add.graphics();
        gs.fillStyle(0xff6600, 0.5);
        gs.fillEllipse(6, 2, 12, 3);       // outer glow
        gs.fillStyle(0xffaa44, 0.9);
        gs.fillEllipse(6, 2, 8, 2);        // mid
        gs.fillStyle(0xffddaa, 1);
        gs.fillEllipse(6, 2, 4, 1);        // core
        gs.generateTexture('bullet_shotgun', 12, 4);
        gs.destroy();

        // Pistol bolt — thin blue-white needle
        const gi = this.add.graphics();
        gi.fillStyle(0x6688ff, 0.4);
        gi.fillEllipse(6, 2, 12, 3);       // outer glow
        gi.fillStyle(0x99bbff, 0.9);
        gi.fillEllipse(6, 2, 8, 2);        // mid
        gi.fillStyle(0xddeeff, 1);
        gi.fillEllipse(6, 2, 4, 1);        // core
        gi.generateTexture('bullet_pistol', 12, 4);
        gi.destroy();

        // Spitter acid projectile — authentic xenomorph yellow-chartreuse droplet with bright core.
        // Color palette from research: sulfuric yellow-green, NOT neon lime.
        const ga = this.add.graphics();
        ga.fillStyle(0xd4e832, 0.22);   // outer halo: chartreuse
        ga.fillCircle(5, 5, 5);
        ga.fillStyle(0xb8c820, 0.90);   // mid body: darker chartreuse
        ga.fillEllipse(5, 5, 7, 9);
        ga.fillStyle(0xe8f040, 1);       // bright core: acid yellow
        ga.fillEllipse(4, 4, 3, 4);
        ga.fillStyle(0xfcff90, 0.92);   // specular hotspot
        ga.fillCircle(4, 3, 1.2);
        ga.lineStyle(1, 0x6a7a04, 0.88); // dark olive outline
        ga.strokeEllipse(5, 5, 7, 9);
        ga.generateTexture('acid_projectile', 10, 10);
        ga.destroy();

        // Medkit pickup — field medical kit with red cross and lid seam
        const gm = this.add.graphics();
        gm.fillStyle(0x2d6b35, 1);
        gm.fillRoundedRect(1, 2, 16, 14, 2);
        gm.fillStyle(0x1e4824, 1);
        gm.fillRect(1, 8, 16, 1);
        gm.fillStyle(0xffffff, 1);
        gm.fillRect(4, 4, 10, 10);
        gm.fillStyle(0xcc2222, 1);
        gm.fillRect(7, 4, 4, 10);
        gm.fillRect(4, 7, 10, 4);
        gm.fillStyle(0x8aaa8a, 0.85);
        gm.fillRect(2, 8, 2, 2);
        gm.fillRect(14, 8, 2, 2);
        gm.lineStyle(1, 0x111e14, 1);
        gm.strokeRoundedRect(1, 2, 16, 14, 2);
        gm.generateTexture('pickup_medkit', 18, 18);
        gm.destroy();

        // Ammo pickup — stencilled military crate with banding straps
        const gc = this.add.graphics();
        gc.fillStyle(0x555e6a, 1);
        gc.fillRoundedRect(1, 1, 16, 12, 2);
        gc.fillStyle(0x424a54, 1);
        gc.fillRect(1, 1, 16, 4);
        gc.fillStyle(0x7c8894, 0.65);
        gc.fillRect(5, 1, 2, 12);
        gc.fillRect(11, 1, 2, 12);
        gc.fillStyle(0xdce8f0, 0.85);
        gc.fillRect(3, 4, 12, 4);
        gc.fillStyle(0x424a54, 1);
        gc.fillRect(4, 5, 1, 2);
        gc.fillRect(7, 5, 1, 2);
        gc.fillRect(10, 5, 1, 2);
        gc.fillRect(13, 5, 1, 2);
        gc.lineStyle(1, 0x333840, 1);
        gc.strokeRoundedRect(1, 1, 16, 12, 2);
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

        // Soft circular mist patch — gaussian-style falloff for drifting corridor fog.
        const gm = this.add.graphics();
        gm.fillStyle(0xffffff, 0.03);
        gm.fillCircle(64, 64, 64);
        gm.fillStyle(0xffffff, 0.05);
        gm.fillCircle(64, 64, 52);
        gm.fillStyle(0xffffff, 0.08);
        gm.fillCircle(64, 64, 38);
        gm.fillStyle(0xffffff, 0.12);
        gm.fillCircle(64, 64, 24);
        gm.fillStyle(0xffffff, 0.16);
        gm.fillCircle(64, 64, 12);
        gm.generateTexture('fx_mist', 128, 128);
        gm.destroy();

        // Cinematic lens flare streak — longer fade, brighter central hotspot.
        const gf = this.add.graphics();
        gf.fillStyle(0xc5dfff, 0.08);
        gf.fillRoundedRect(0, 11, 64, 10, 4);
        gf.fillStyle(0x9bc8ff, 0.22);
        gf.fillRoundedRect(5, 12, 54, 8, 3);
        gf.fillStyle(0xffd08a, 0.34);
        gf.fillRoundedRect(14, 13, 36, 6, 3);
        gf.fillStyle(0xffffff, 0.96);
        gf.fillRoundedRect(24, 14, 16, 4, 2);
        gf.fillStyle(0x79bfff, 0.3);
        gf.fillRect(8, 15, 48, 2);
        gf.fillCircle(32, 16, 3);
        gf.generateTexture('fx_flare', 64, 32);
        gf.destroy();

        // Bullet splash — elongated burst shape for bullet→impact morph on alien hit.
        // Thin diamond that fans out into ragged splash fingers.
        const gsp = this.add.graphics();
        gsp.fillStyle(0xffffff, 0.15);
        gsp.fillEllipse(16, 8, 32, 16);          // wide outer glow
        gsp.fillStyle(0xffffff, 0.35);
        gsp.fillEllipse(16, 8, 24, 10);          // mid bloom
        // Splash fingers — irregular prongs radiating forward
        gsp.fillStyle(0xffffff, 0.7);
        gsp.fillTriangle(16, 4, 30, 0, 28, 8);   // upper-right prong
        gsp.fillTriangle(16, 12, 30, 16, 28, 8);  // lower-right prong
        gsp.fillTriangle(16, 6, 32, 7, 32, 9);    // center spike
        gsp.fillStyle(0xffffff, 0.5);
        gsp.fillTriangle(16, 2, 24, 0, 20, 6);    // small upper spray
        gsp.fillTriangle(16, 14, 24, 16, 20, 10);  // small lower spray
        gsp.fillStyle(0xffffff, 1);
        gsp.fillEllipse(14, 8, 10, 4);            // white-hot core (back of splash)
        gsp.generateTexture('fx_splash', 32, 16);
        gsp.destroy();

        // Metal debris shard — angular bright flake for wall-impact ricochets.
        const gdb = this.add.graphics();
        gdb.fillStyle(0xcbd9e6, 0.42);
        gdb.fillRect(1, 1, 10, 5);
        gdb.fillStyle(0xeaf1f7, 0.85);
        gdb.fillRect(3, 2, 6, 3);
        gdb.fillStyle(0xffd7a3, 0.92);
        gdb.fillRect(5, 2, 2, 2);
        gdb.generateTexture('fx_debris', 12, 8);
        gdb.destroy();

        // Alien body part debris textures — recognizable xeno fragments for corpse scatter.
        const partShapes = [
            { key: 'alien_part_tail', draw: (ctx, w, h) => {
                ctx.beginPath();
                ctx.moveTo(w*0.1, h*0.5);
                ctx.quadraticCurveTo(w*0.3, h*0.15, w*0.6, h*0.3);
                ctx.quadraticCurveTo(w*0.85, h*0.4, w*0.95, h*0.6);
                ctx.quadraticCurveTo(w*0.8, h*0.7, w*0.5, h*0.65);
                ctx.quadraticCurveTo(w*0.2, h*0.6, w*0.1, h*0.5);
                ctx.fillStyle = '#1a2418';
                ctx.fill();
                ctx.strokeStyle = '#384830';
                ctx.lineWidth = 1;
                ctx.stroke();
            }},
            { key: 'alien_part_limb', draw: (ctx, w, h) => {
                ctx.beginPath();
                ctx.moveTo(w*0.15, h*0.3);
                ctx.lineTo(w*0.4, h*0.15);
                ctx.lineTo(w*0.65, h*0.35);
                ctx.lineTo(w*0.85, h*0.25);
                ctx.lineTo(w*0.9, h*0.45);
                ctx.lineTo(w*0.6, h*0.65);
                ctx.lineTo(w*0.3, h*0.7);
                ctx.closePath();
                ctx.fillStyle = '#181e14';
                ctx.fill();
                ctx.strokeStyle = '#32402a';
                ctx.lineWidth = 1;
                ctx.stroke();
            }},
            { key: 'alien_part_crest', draw: (ctx, w, h) => {
                ctx.beginPath();
                ctx.moveTo(w*0.05, h*0.5);
                ctx.quadraticCurveTo(w*0.25, h*0.1, w*0.7, h*0.2);
                ctx.quadraticCurveTo(w*0.95, h*0.35, w*0.9, h*0.55);
                ctx.quadraticCurveTo(w*0.7, h*0.8, w*0.3, h*0.75);
                ctx.quadraticCurveTo(w*0.1, h*0.65, w*0.05, h*0.5);
                ctx.fillStyle = '#121a10';
                ctx.fill();
                ctx.strokeStyle = '#2a3822';
                ctx.lineWidth = 1;
                ctx.stroke();
            }},
            { key: 'alien_part_shard', draw: (ctx, w, h) => {
                ctx.beginPath();
                ctx.moveTo(w*0.2, h*0.1);
                ctx.lineTo(w*0.8, h*0.2);
                ctx.lineTo(w*0.9, h*0.6);
                ctx.lineTo(w*0.5, h*0.9);
                ctx.lineTo(w*0.15, h*0.7);
                ctx.closePath();
                ctx.fillStyle = '#161c12';
                ctx.fill();
                ctx.strokeStyle = '#303e28';
                ctx.lineWidth = 1;
                ctx.stroke();
            }},
        ];
        for (const part of partShapes) {
            const size = 24;
            const canvas = this.textures.createCanvas(part.key, size, size);
            const ctx = canvas.context;
            part.draw(ctx, size, size);
            canvas.refresh();
        }

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

        // Electrical arc streak — jagged lightning bolt segment for electrical spark FX.
        if (!this.textures.exists('fx_arc')) {
            const arcW = 32, arcH = 8;
            const arcTex = this.textures.createCanvas('fx_arc', arcW, arcH);
            const actx = arcTex.getContext();
            actx.clearRect(0, 0, arcW, arcH);
            // Outer glow
            actx.strokeStyle = 'rgba(140,200,255,0.25)';
            actx.lineWidth = 4;
            actx.beginPath();
            actx.moveTo(0, arcH / 2);
            actx.lineTo(8, 2); actx.lineTo(14, 6);
            actx.lineTo(20, 1); actx.lineTo(26, 5);
            actx.lineTo(arcW, arcH / 2);
            actx.stroke();
            // Core
            actx.strokeStyle = 'rgba(220,240,255,0.9)';
            actx.lineWidth = 1.5;
            actx.beginPath();
            actx.moveTo(0, arcH / 2);
            actx.lineTo(8, 2); actx.lineTo(14, 6);
            actx.lineTo(20, 1); actx.lineTo(26, 5);
            actx.lineTo(arcW, arcH / 2);
            actx.stroke();
            // Hot white center
            actx.strokeStyle = 'rgba(255,255,255,1)';
            actx.lineWidth = 0.7;
            actx.beginPath();
            actx.moveTo(1, arcH / 2);
            actx.lineTo(8, 2.5); actx.lineTo(14, 5.5);
            actx.lineTo(20, 1.5); actx.lineTo(26, 4.5);
            actx.lineTo(arcW - 1, arcH / 2);
            actx.stroke();
            arcTex.refresh();
        }

        // Molten glob — irregular hot droplet with incandescent glow for welding spatter.
        if (!this.textures.exists('fx_molten')) {
            const mSize = 12;
            const mTex = this.textures.createCanvas('fx_molten', mSize, mSize);
            const mctx = mTex.getContext();
            mctx.clearRect(0, 0, mSize, mSize);
            const cx = mSize / 2, cy = mSize / 2;
            // Outer glow halo
            const grd = mctx.createRadialGradient(cx, cy, 0, cx, cy, 6);
            grd.addColorStop(0, 'rgba(255,240,200,1)');
            grd.addColorStop(0.3, 'rgba(255,180,60,0.8)');
            grd.addColorStop(0.6, 'rgba(255,100,20,0.35)');
            grd.addColorStop(1, 'rgba(200,40,0,0)');
            mctx.fillStyle = grd;
            mctx.fillRect(0, 0, mSize, mSize);
            // Irregular blob shape (not a perfect circle)
            mctx.fillStyle = 'rgba(255,220,140,0.95)';
            mctx.beginPath();
            mctx.ellipse(cx, cy, 2.5, 2, 0.3, 0, Math.PI * 2);
            mctx.fill();
            // White-hot core
            mctx.fillStyle = 'rgba(255,255,240,1)';
            mctx.beginPath();
            mctx.arc(cx, cy - 0.3, 1, 0, Math.PI * 2);
            mctx.fill();
            mTex.refresh();
        }

        // ── Radial gradient texture for feathered area lights ──────────────
        // Single white-to-transparent gradient circle, tinted per-light at draw time.
        // GPU-interpolated so no visible banding/contour rings.
        // Higher resolution (512px) with more color stops for smoother feathered falloff.
        if (!this.textures.exists('light_gradient')) {
            const lgSize = 512;
            const lgTex = this.textures.createCanvas('light_gradient', lgSize, lgSize);
            const lgCtx = lgTex.getContext();
            const lgCx = lgSize / 2;
            const lgCy = lgSize / 2;
            const lgR = lgSize / 2;
            const lgGrad = lgCtx.createRadialGradient(lgCx, lgCy, 0, lgCx, lgCy, lgR);
            // Smooth exponential-decay falloff with many stops to eliminate banding
            lgGrad.addColorStop(0,     'rgba(255,255,255,1.0)');
            lgGrad.addColorStop(0.05,  'rgba(255,255,255,0.95)');
            lgGrad.addColorStop(0.12,  'rgba(255,255,255,0.85)');
            lgGrad.addColorStop(0.20,  'rgba(255,255,255,0.72)');
            lgGrad.addColorStop(0.30,  'rgba(255,255,255,0.55)');
            lgGrad.addColorStop(0.40,  'rgba(255,255,255,0.38)');
            lgGrad.addColorStop(0.50,  'rgba(255,255,255,0.25)');
            lgGrad.addColorStop(0.60,  'rgba(255,255,255,0.15)');
            lgGrad.addColorStop(0.70,  'rgba(255,255,255,0.08)');
            lgGrad.addColorStop(0.80,  'rgba(255,255,255,0.04)');
            lgGrad.addColorStop(0.90,  'rgba(255,255,255,0.015)');
            lgGrad.addColorStop(0.95,  'rgba(255,255,255,0.005)');
            lgGrad.addColorStop(1,     'rgba(255,255,255,0.0)');
            lgCtx.clearRect(0, 0, lgSize, lgSize);
            lgCtx.fillStyle = lgGrad;
            lgCtx.fillRect(0, 0, lgSize, lgSize);
            lgTex.refresh();
        }

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

        // ── Hive creep textures — dark organic growth patches ──────────────
        this._generateHiveCreepTextures();
    }

    _generateHiveCreepTextures() {
        // hive_creep_1: 96×96 large organic blob with irregular edges
        {
            const s = 96;
            const tex = this.textures.createCanvas('hive_creep_1', s, s);
            const ctx = tex.getContext();
            ctx.clearRect(0, 0, s, s);
            const cx = s / 2, cy = s / 2;
            // Layer several irregular radial blobs
            for (let layer = 0; layer < 5; layer++) {
                const r = (s * 0.42) - layer * 6;
                const opacity = 0.06 + layer * 0.06;
                ctx.beginPath();
                const points = 16;
                for (let i = 0; i <= points; i++) {
                    const a = (i / points) * Math.PI * 2;
                    const jitter = r * (0.5 + Math.sin(i * 3.7 + layer * 2.1) * 0.3 + Math.cos(i * 5.3) * 0.2);
                    const px = cx + Math.cos(a) * jitter;
                    const py = cy + Math.sin(a) * jitter;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                const g = layer < 3 ? 20 + layer * 6 : 10;
                ctx.fillStyle = `rgba(${8 + layer * 2}, ${g}, ${6 + layer}, ${opacity})`;
                ctx.fill();
            }
            // Central darker core
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.22);
            grad.addColorStop(0, 'rgba(6, 14, 4, 0.35)');
            grad.addColorStop(1, 'rgba(6, 14, 4, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, s, s);
            tex.refresh();
        }

        // hive_creep_2: 64×64 tendril patch
        {
            const s = 64;
            const tex = this.textures.createCanvas('hive_creep_2', s, s);
            const ctx = tex.getContext();
            ctx.clearRect(0, 0, s, s);
            const cx = s / 2, cy = s / 2;
            // Branching tendrils radiating outward
            for (let t = 0; t < 7; t++) {
                const angle = (t / 7) * Math.PI * 2 + Math.sin(t * 1.7) * 0.4;
                const len = s * (0.25 + Math.sin(t * 2.3) * 0.12);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                const mx = cx + Math.cos(angle + 0.2) * len * 0.5;
                const my = cy + Math.sin(angle - 0.15) * len * 0.5;
                const ex = cx + Math.cos(angle) * len;
                const ey = cy + Math.sin(angle) * len;
                ctx.quadraticCurveTo(mx, my, ex, ey);
                ctx.lineWidth = 4 - t * 0.3;
                ctx.strokeStyle = `rgba(10, ${18 + t * 3}, 8, ${0.12 + t * 0.02})`;
                ctx.stroke();
            }
            // Soft centre blob
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.2);
            grad.addColorStop(0, 'rgba(8, 16, 6, 0.3)');
            grad.addColorStop(1, 'rgba(8, 16, 6, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, s, s);
            tex.refresh();
        }

        // hive_creep_3: 48×48 small growth node
        {
            const s = 48;
            const tex = this.textures.createCanvas('hive_creep_3', s, s);
            const ctx = tex.getContext();
            ctx.clearRect(0, 0, s, s);
            const cx = s / 2, cy = s / 2;
            // Lumpy small node
            for (let layer = 0; layer < 4; layer++) {
                const r = (s * 0.36) - layer * 4;
                ctx.beginPath();
                const pts = 10;
                for (let i = 0; i <= pts; i++) {
                    const a = (i / pts) * Math.PI * 2;
                    const jitter = r * (0.6 + Math.sin(i * 4.1 + layer * 1.9) * 0.25);
                    const px = cx + Math.cos(a) * jitter;
                    const py = cy + Math.sin(a) * jitter;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = `rgba(${10 + layer * 2}, ${16 + layer * 4}, ${8 + layer}, ${0.08 + layer * 0.06})`;
                ctx.fill();
            }
            tex.refresh();
        }
    }

    generateWeaponIcons() {
        const size = CONFIG.WEAPON_ICON_SIZE; // 40×40

        // ── Pulse Rifle — M41A silhouette, points right ───────────────────────
        {
            const g = this.add.graphics();
            // Stock (left, wide)
            g.fillStyle(0x5a6070, 1);
            g.fillRoundedRect(2, 15, 9, 11, 2);
            g.fillStyle(0x3e454f, 1);
            g.fillRect(2, 22, 9, 4);
            // Receiver body
            g.fillStyle(0x6a7280, 1);
            g.fillRect(11, 13, 11, 13);
            // Top picatinny rail
            g.fillStyle(0x7a8a99, 1);
            g.fillRect(11, 13, 24, 3);
            g.fillStyle(0x4a5560, 0.7);
            for (let i = 0; i < 6; i++) g.fillRect(13 + i * 4, 13, 1, 3);
            // Magazine well — angled banana mag below receiver
            g.fillStyle(0x4e5660, 1);
            g.fillRect(14, 26, 6, 9);
            g.fillRect(16, 34, 4, 2);
            // Barrel — long and narrow
            g.fillStyle(0x7c8c9a, 1);
            g.fillRect(22, 15, 14, 7);
            g.fillStyle(0x5a6872, 1);
            g.fillRect(22, 20, 14, 2);
            // Undermounted grenade launcher
            g.fillStyle(0x505860, 1);
            g.fillRect(22, 22, 10, 4);
            g.fillStyle(0x3c4450, 1);
            g.fillRect(30, 22, 2, 4);
            // Muzzle brake
            g.fillStyle(0x8a9aa8, 1);
            g.fillRect(36, 14, 3, 9);
            g.fillStyle(0x3a4048, 1);
            g.fillRect(36, 17, 3, 3);
            // Energy cell indicator (green dot)
            g.fillStyle(0x55ff88, 0.9);
            g.fillCircle(18, 20, 1.5);
            // Outline
            g.lineStyle(1, 0x20252d, 0.8);
            g.strokeRect(11, 13, 28, 13);
            g.generateTexture('weapon_icon_pulseRifle', size, size);
            g.destroy();
        }

        // ── Shotgun — pump-action, short and wide ─────────────────────────────
        {
            const g = this.add.graphics();
            // Stock/pistol grip (right side for top-down LH view)
            g.fillStyle(0x5c4830, 1);
            g.fillRoundedRect(2, 13, 9, 14, 2);
            g.fillStyle(0x3d3020, 1);
            g.fillRect(2, 20, 9, 4);
            // Receiver
            g.fillStyle(0x6a6878, 1);
            g.fillRect(11, 13, 9, 14);
            // Double barrel tubes
            g.fillStyle(0x7a7888, 1);
            g.fillRect(20, 13, 17, 6);
            g.fillRect(20, 21, 17, 6);
            // Barrel separator
            g.fillStyle(0x3e3c4a, 0.9);
            g.fillRect(20, 19, 17, 2);
            // Pump fore-end
            g.fillStyle(0x4e4c5e, 1);
            g.fillRoundedRect(17, 14, 7, 12, 2);
            g.fillStyle(0x6a6878, 0.6);
            g.fillRect(18, 15, 5, 2);
            g.fillRect(18, 18, 5, 2);
            g.fillRect(18, 21, 5, 2);
            // Muzzle ends
            g.fillStyle(0x30303e, 1);
            g.fillRect(37, 13, 2, 6);
            g.fillRect(37, 21, 2, 6);
            // Shell indicator (side eject)
            g.fillStyle(0xd09828, 0.8);
            g.fillRect(13, 27, 5, 2);
            g.lineStyle(1, 0x20202c, 0.75);
            g.strokeRect(11, 13, 28, 14);
            g.generateTexture('weapon_icon_shotgun', size, size);
            g.destroy();
        }

        // ── Pistol — compact L-shape slide + grip ─────────────────────────────
        {
            const g = this.add.graphics();
            // Grip (lower-left)
            g.fillStyle(0x4a4c5a, 1);
            g.fillRoundedRect(8, 22, 8, 14, 2);
            g.fillStyle(0x363842, 0.8);
            g.fillRect(9, 24, 6, 2);
            g.fillRect(9, 28, 6, 2);
            g.fillRect(9, 32, 6, 2);
            // Frame
            g.fillStyle(0x5c6070, 1);
            g.fillRect(8, 16, 16, 8);
            // Slide (top, slightly lighter)
            g.fillStyle(0x727888, 1);
            g.fillRect(8, 11, 26, 7);
            g.fillStyle(0x8898a8, 0.6);
            g.fillRect(10, 12, 20, 2);
            // Barrel / muzzle
            g.fillStyle(0x7e8c9a, 1);
            g.fillRect(24, 13, 10, 5);
            g.fillStyle(0x282c34, 1);
            g.fillRect(33, 14, 2, 3);
            // Trigger guard
            g.lineStyle(1, 0x4e5260, 0.85);
            g.beginPath();
            g.moveTo(14, 24);
            g.lineTo(18, 26);
            g.lineTo(22, 24);
            g.strokePath();
            // Sight
            g.fillStyle(0xeef0ff, 0.7);
            g.fillRect(31, 11, 2, 2);
            g.lineStyle(1, 0x20242c, 0.8);
            g.strokeRect(8, 11, 26, 7);
            g.generateTexture('weapon_icon_pistol', size, size);
            g.destroy();
        }
    }

    generateDoorTextures() {
        const size = CONFIG.TILE_SIZE;

        // Closed door — Hadley's Hope bulkhead: heavy steel + hazard accents.
        const gc = this.add.graphics();
        gc.fillStyle(0x20262f, 1);
        gc.fillRect(0, 0, size, size);
        gc.lineStyle(2, 0x111821, 1);
        gc.strokeRect(0, 0, size, size);
        gc.fillStyle(0x2e3945, 0.95);
        gc.fillRoundedRect(4, 6, size - 8, size - 12, 3);
        gc.fillStyle(0x5a6d82, 0.36);
        gc.fillRect(6, 8, size - 12, 2);
        gc.fillStyle(0x10161f, 0.52);
        gc.fillRect(6, size - 10, size - 12, 2);
        gc.fillStyle(0x181f2a, 1);
        gc.fillRect(Math.floor(size * 0.45), 6, Math.floor(size * 0.1), size - 12);
        gc.lineStyle(1, 0x546478, 0.5);
        gc.lineBetween(6, Math.floor(size * 0.28), size - 6, Math.floor(size * 0.28));
        gc.lineBetween(6, Math.floor(size * 0.72), size - 6, Math.floor(size * 0.72));
        // Industrial caution blocks (Hadley's Hope vibe).
        gc.fillStyle(0x151b22, 0.95);
        gc.fillRect(0, 0, 4, size);
        gc.fillRect(size - 4, 0, 4, size);
        gc.fillStyle(0xd8a84b, 0.65);
        for (let i = 0; i < 6; i++) {
            const y = 4 + i * 6;
            gc.fillRect(0, y, 4, 2);
            gc.fillRect(size - 4, y + 2, 4, 2);
        }
        gc.fillStyle(0x11161d, 0.34);
        gc.fillRect(6, Math.floor(size * 0.48), size - 12, 3);
        gc.fillStyle(0x5f6d7a, 0.22);
        gc.fillRect(8, Math.floor(size * 0.5), size - 16, 1);
        gc.fillStyle(0xd0a35f, 0.28);
        for (let i = 0; i < 4; i++) gc.fillRect(3 + i * 14, size - 5, 8, 2);
        gc.generateTexture('door_closed', size, size);
        gc.destroy();

        // Open door — recessed rails with warm warning strips.
        const go = this.add.graphics();
        go.fillStyle(0x1f2a33, 1);
        go.fillRect(0, 0, size, size);
        go.fillStyle(0x2f3f4d, 1);
        go.fillRect(0, 0, 6, size);
        go.fillRect(size - 6, 0, 6, size);
        go.fillStyle(0xd8a84b, 0.7);
        go.fillRect(2, 5, 2, size - 10);
        go.fillRect(size - 4, 5, 2, size - 10);
        go.fillStyle(0x0f151d, 0.28);
        go.fillRect(Math.floor(size * 0.42), 0, Math.floor(size * 0.16), size);
        go.lineStyle(1, 0x2b3945, 0.65);
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
        gl.fillStyle(0xd3b97d, 0.3);
        gl.fillRect(6, 8, size - 12, 2);
        gl.fillStyle(0x4b3e22, 0.4);
        gl.fillRect(6, size - 10, size - 12, 2);
        gl.fillStyle(0xdbc17d, 0.5);
        gl.fillRect(8, Math.floor(size * 0.24), size - 16, 2);
        gl.fillRect(8, Math.floor(size * 0.76), size - 16, 2);
        gl.fillStyle(0x3a2e18, 1);
        gl.fillRect(Math.floor(size * 0.35), Math.floor(size * 0.3), Math.floor(size * 0.3), Math.floor(size * 0.35));
        gl.fillRect(Math.floor(size * 0.4), Math.floor(size * 0.2), Math.floor(size * 0.2), Math.floor(size * 0.15));
        gl.fillStyle(0xe0b86e, 0.22);
        gl.fillRect(Math.floor(size * 0.37), Math.floor(size * 0.33), Math.floor(size * 0.26), 2);
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
        gw.fillStyle(0x88a8c1, 0.35);
        gw.fillRect(6, 8, size - 12, 2);
        gw.fillStyle(0x334658, 0.35);
        gw.fillRect(6, size - 10, size - 12, 2);
        gw.lineStyle(3, 0xc0deff, 0.82);
        gw.lineBetween(8, 8, size - 8, size - 8);
        gw.lineBetween(size - 8, 8, 8, size - 8);
        gw.lineStyle(1, 0xeff8ff, 0.55);
        gw.lineBetween(11, 8, size - 5, size - 2);
        gw.lineBetween(size - 11, 8, 5, size - 2);
        gw.fillStyle(0x1a2733, 0.2);
        gw.fillRect(8, Math.floor(size * 0.5), size - 16, 2);
        gw.generateTexture('door_welded', size, size);
        gw.destroy();

        // Destroyed door — breached panel remains and scorched frame.
        const gd = this.add.graphics();
        gd.fillStyle(0x1d232d, 1);
        gd.fillRect(0, 0, size, size);
        gd.lineStyle(2, 0x0f141d, 1);
        gd.strokeRect(0, 0, size, size);
        gd.fillStyle(0x3c8d62, 0.55);
        gd.fillRect(0, 0, 4, size);
        gd.fillRect(size - 4, 0, 4, size);
        gd.fillStyle(0x0b1017, 0.94);
        gd.fillRoundedRect(6, 6, size - 12, size - 12, 3);
        gd.fillStyle(0x2e3c49, 0.36);
        gd.fillRect(9, 9, size - 18, 3);
        gd.fillStyle(0x000000, 0.42);
        gd.fillRect(9, size - 12, size - 18, 3);
        gd.fillStyle(0x40634f, 0.26);
        gd.fillRect(6, 6, 4, size - 12);
        gd.fillRect(size - 10, 6, 4, size - 12);
        gd.lineStyle(1, 0xffb34d, 0.55);
        gd.strokeRect(5, 5, size - 10, size - 10);
        gd.lineStyle(1, 0xff7a31, 0.8);
        gd.beginPath();
        gd.moveTo(5, 4);
        gd.lineTo(11, 8);
        gd.lineTo(9, 13);
        gd.strokePath();
        gd.beginPath();
        gd.moveTo(size - 5, 5);
        gd.lineTo(size - 12, 9);
        gd.lineTo(size - 9, 16);
        gd.strokePath();
        gd.beginPath();
        gd.moveTo(4, size - 5);
        gd.lineTo(13, size - 10);
        gd.lineTo(18, size - 5);
        gd.strokePath();
        gd.beginPath();
        gd.moveTo(size - 5, size - 5);
        gd.lineTo(size - 12, size - 11);
        gd.lineTo(size - 18, size - 6);
        gd.strokePath();
        gd.generateTexture('door_destroyed', size, size);
        gd.destroy();
    }
}
