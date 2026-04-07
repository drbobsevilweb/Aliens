import { CONFIG } from '../config.js';

const TORCH_ENDPOINT_BRIGHTNESS_SCALE = 0.58;
const TORCH_FLARE_ALPHA_MAX = 0.12;
const TORCH_FLOOR_ENDPOINT_BRIGHTNESS_SCALE = 0.66;
const FLOOR_SHADOW_DEPTH = 4;
const FLOOR_LIGHT_GRAPHICS_DEPTH = FLOOR_SHADOW_DEPTH - 1;
const IMPACT_HIGHLIGHT_DEPTH = 6.6;
const WORLD_LIGHT_MULTIPLY_DEPTH = 188;
const WORLD_LIGHT_ADDITIVE_DEPTH = 189.5;
const WORLD_LIGHT_FLARE_DEPTH = 193.5;
const FLOOR_FADE_NEAR_WALL_PX = 72;
const FLOOR_FADE_FAR_WALL_PX = 236;
const WALL_IMPACT_INSET_PX = 4.2;
const TORCH_CAMERA_FACING_MIN = -0.2;
const WALL_DEPTH_SHADE_BASE_ALPHA = 0.036;
const WALL_DEPTH_SHADE_EDGE_ALPHA = 0.078;

export class LightingOverlay {
    constructor(scene, raycaster, lightBlockerGrid, tuning = null) {
        this.scene = scene;
        this.raycaster = raycaster;
        this.lightBlockerGrid = lightBlockerGrid;
        this.tuning = tuning || {};
        this.fixedWidth = CONFIG.GAME_WIDTH;
        this.fixedHeight = CONFIG.GAME_HEIGHT;
        this.destroyed = false;
        this.lowFxMode = false;
        this.qualityTier = 0;
        this._smoothedFps = 60;
        this._lowFpsDebtMs = 0;
        this._qualityRecoveryMs = 0;
        this._lastAdaptiveAt = 0;

        // RenderTexture covers the screen, pinned to camera
        this.rt = scene.add.renderTexture(0, 0, this.fixedWidth, this.fixedHeight);
        this.rt.setOrigin(0, 0);
        this.rt.setScrollFactor(0);
        // Keep the darkness pass above the whole world stack so floors, walls,
        // props, doors, marines, and aliens all receive the same environment light.
        this.rt.setDepth(WORLD_LIGHT_MULTIPLY_DEPTH);
        this.rt.setBlendMode(Phaser.BlendModes.MULTIPLY);

        // On-scene graphics for light polygon, hidden behind the RT
        this.lightGraphics = scene.add.graphics();
        this.lightGraphics.setDepth(FLOOR_LIGHT_GRAPHICS_DEPTH);
        this.lightGraphics.setScrollFactor(0);
        this.lightGraphics.setVisible(false);

        this.wallShadeGraphics = scene.add.graphics();
        this.wallShadeGraphics.setDepth(FLOOR_LIGHT_GRAPHICS_DEPTH - 0.1);
        this.wallShadeGraphics.setScrollFactor(0);
        this.wallShadeGraphics.setVisible(false);

        // Separate additive layer for wall/object impact highlights above geometry.
        this.hotspotGraphics = scene.add.graphics();
        this.hotspotGraphics.setDepth(WORLD_LIGHT_ADDITIVE_DEPTH);
        this.hotspotGraphics.setScrollFactor(0);
        this.hotspotGraphics.setBlendMode(Phaser.BlendModes.ADD);

        // Dedicated lens-flare layer above characters so source flares are always visible.
        this.torchLensGraphics = scene.add.graphics();
        this.torchLensGraphics.setDepth(WORLD_LIGHT_FLARE_DEPTH);
        this.torchLensGraphics.setScrollFactor(0);
        this.torchLensGraphics.setBlendMode(Phaser.BlendModes.ADD);
        // Separate orbital flare layer so ring/hex ghosts can be tuned independently.
        this.torchOrbitGraphics = scene.add.graphics();
        this.torchOrbitGraphics.setDepth(WORLD_LIGHT_FLARE_DEPTH + 0.6);
        this.torchOrbitGraphics.setScrollFactor(0);
        this.torchOrbitGraphics.setBlendMode(Phaser.BlendModes.ADD);

        this.torchTipTextureKey = scene.textures.exists('torch_hotspot') ? 'torch_hotspot'
            : (scene.textures.exists('torch_beam_tip') ? 'torch_beam_tip' : null);
        this.torchTipPool = [];
        this.activeTorchTipCount = 0;
        this.torchFlareTextureKey = scene.textures.exists('fx_flare') ? 'fx_flare' : null;
        this.torchFlarePool = [];
        this.activeTorchFlareCount = 0;
        this.wallImpactTextureKey = this.torchTipTextureKey || this.torchFlareTextureKey;
        this.wallImpactPool = [];
        this.activeWallImpactCount = 0;
        this.contactShadowGraphics = scene.add.graphics();
        this.contactShadowGraphics.setDepth(FLOOR_LIGHT_GRAPHICS_DEPTH + 0.05);
        this.contactShadowGraphics.setScrollFactor(0);
        this.contactShadowGraphics.setVisible(false);

        this.resizeHandler = () => this.enforceFixedSurfaceSize();
        if (scene.scale?.on) scene.scale.on('resize', this.resizeHandler);
        this.enforceFixedSurfaceSize();

        // Static map ambient / corridor lights (set once after map loads).
        this.staticLights = [];

        // Pool of pre-created sprites using the radial gradient texture for feathered area lights.
        this._lightGradientKey = scene.textures.exists('light_gradient') ? 'light_gradient' : null;
        this._lightGradientPool = [];
        this._activeLightGradientCount = 0;

        // Emergency lighting tint (RGB multipliers, 1.0 = neutral).
        this._ambientTintR = 1.0;
        this._ambientTintG = 1.0;
        this._ambientTintB = 1.0;

        // Warmup: pre-fill sprite pools to avoid creation during first frame update.
        this.prefillPools();
    }

    /** Called once after the map is built to supply static ambient lights. */
    setStaticLights(lights) {
        this.staticLights = Array.isArray(lights) ? lights : [];
    }

    /**
     * Set the ambient fill tint as RGB multipliers (0-1 each, 1.0 = neutral gray).
     * Used for emergency lighting tied to CombatDirector state.
     */
    setAmbientTint(r, g, b) {
        this._ambientTintR = Phaser.Math.Clamp(Number(r) || 1, 0, 1.5);
        this._ambientTintG = Phaser.Math.Clamp(Number(g) || 1, 0, 1.5);
        this._ambientTintB = Phaser.Math.Clamp(Number(b) || 1, 0, 1.5);
    }

    prefillPools() {
        const prefillCount = 8;
        if (this.torchTipTextureKey) {
            for (let i = 0; i < prefillCount; i++) this.getTorchTipSprite();
        }
        if (this.torchFlareTextureKey) {
            for (let i = 0; i < prefillCount; i++) this.getTorchFlareSprite();
        }
        if (this.wallImpactTextureKey) {
            for (let i = 0; i < prefillCount; i++) this.getWallImpactSprite();
        }
        if (this._lightGradientKey) {
            for (let i = 0; i < 16; i++) this._getLightGradientSprite();
        }
        this._objectSegmentScratch = [];
        this.hideTorchTipSprites();
        this.hideTorchFlareSprites();
        this.hideWallImpactSprites();
        this._hideLightGradientSprites();
    }

    /** Get or create a pooled light gradient sprite for feathered area lights. */
    _getLightGradientSprite() {
        if (this._activeLightGradientCount < this._lightGradientPool.length) {
            const sprite = this._lightGradientPool[this._activeLightGradientCount];
            this._activeLightGradientCount++;
            sprite.setVisible(true);
            sprite.setActive(true);
            return sprite;
        }
        const sprite = this.scene.add.image(0, 0, this._lightGradientKey);
        sprite.setOrigin(0.5, 0.5);
        sprite.setScrollFactor(0);
        sprite.setVisible(false);
        sprite.setActive(false);
        sprite.setDepth(FLOOR_LIGHT_GRAPHICS_DEPTH - 0.05);
        this._lightGradientPool.push(sprite);
        this._activeLightGradientCount = this._lightGradientPool.length;
        return sprite;
    }

    _hideLightGradientSprites() {
        for (let i = 0; i < this._activeLightGradientCount; i++) {
            this._lightGradientPool[i].setVisible(false);
            this._lightGradientPool[i].setActive(false);
        }
        this._activeLightGradientCount = 0;
    }

    getTuningNumber(key, fallback, min = -Infinity, max = Infinity) {
        const value = Number(this.tuning?.[key]);
        if (!Number.isFinite(value)) return fallback;
        return Phaser.Math.Clamp(value, min, max);
    }

    update(lightSources, objectCasters = [], entities = []) {
        if (this.destroyed) return;
        const cam = this.scene.cameras.main;
        const loop = this.scene?.game?.loop;
        const frame = Number(loop?.frame) || 0;
        const now = Number(this.scene?.time?.now) || 0;
        const dtMs = Phaser.Math.Clamp(
            this._lastAdaptiveAt > 0 ? (now - this._lastAdaptiveAt) : 16,
            16,
            250
        );
        this._lastAdaptiveAt = now;
        const rawFps = Number(loop?.actualFps) || 60;
        // Ignore low FPS readings during the first 10 frames to avoid cold-start lag
        // from triggering low FX mode prematurely.
        const fps = frame < 10 ? 60 : rawFps;
        const fpsBlend = Phaser.Math.Clamp(dtMs / 220, 0.08, 0.45);
        this._smoothedFps = Phaser.Math.Linear(this._smoothedFps, fps, fpsBlend);
        
        let hostileCount = 0;
        if (Array.isArray(entities)) {
            for (const ent of entities) {
                if (ent && typeof ent.enemyType === 'string') hostileCount++;
            }
        }
        const effectiveFps = Math.min(fps, this._smoothedFps);
        const severePerfDrop = effectiveFps < 18;
        const lowFxPressure = effectiveFps < 52 || hostileCount >= 14;
        if (lowFxPressure) {
            this._lowFpsDebtMs = Math.min(3200, this._lowFpsDebtMs + dtMs);
        } else {
            this._lowFpsDebtMs = Math.max(0, this._lowFpsDebtMs - dtMs * 1.6);
        }
        if (severePerfDrop) {
            this._lowFpsDebtMs = Math.max(this._lowFpsDebtMs, 1200);
        }
        this.lowFxMode = hostileCount >= 14 || this._lowFpsDebtMs >= 180 || severePerfDrop;
        // Hysteresis: degrade quickly on sustained pressure, recover more slowly.
        const prevTier = this.qualityTier;
        let newTier;
        if (effectiveFps < 26 || hostileCount >= 30) newTier = 3;
        else if (effectiveFps < 38 || hostileCount >= 22) newTier = 2;
        else if (effectiveFps < 52 || hostileCount >= 14) newTier = 1;
        else newTier = 0;
        if (severePerfDrop) {
            newTier = Math.max(newTier, 3);
        }
        if (newTier > prevTier) {
            const promoteThresholdMs = [0, 120, 260, 420];
            if (this._lowFpsDebtMs < (promoteThresholdMs[newTier] || 420)) {
                newTier = prevTier;
            }
            this._qualityRecoveryMs = 0;
        } else if (newTier < prevTier) {
            const upgradeThresholds = [0, 58, 46, 34];
            const hasRecoveryHeadroom = effectiveFps >= (upgradeThresholds[prevTier] || 60)
                && hostileCount < Math.max(0, 14 - prevTier * 2);
            if (hasRecoveryHeadroom) {
                this._qualityRecoveryMs = Math.min(2400, this._qualityRecoveryMs + dtMs);
                if (this._qualityRecoveryMs < 640) {
                    newTier = prevTier;
                }
            } else {
                this._qualityRecoveryMs = 0;
                newTier = prevTier;
            }
        } else {
            this._qualityRecoveryMs = 0;
        }
        this.qualityTier = newTier;
        const performanceRatio = Phaser.Math.Clamp(
            (effectiveFps - 24) / Math.max(1, CONFIG.LIGHTING_ADAPTIVE_SHADOW_FPS_RANGE),
            0,
            1
        );
        const adaptiveShadowAlpha = Phaser.Math.Linear(
            CONFIG.LIGHTING_ADAPTIVE_SHADOW_MIN_ALPHA,
            1,
            performanceRatio
        );

        this.lightGraphics.clear();
        this.wallShadeGraphics.clear();
        this.hotspotGraphics.clear();
        this.torchLensGraphics.clear();
        this.torchOrbitGraphics.clear();
        this.contactShadowGraphics.clear();
        this.hideTorchTipSprites();
        this.hideTorchFlareSprites();
        this.hideWallImpactSprites();
        this._hideLightGradientSprites();
        const d = this.tuning.ambientDarkness ?? CONFIG.AMBIENT_DARKNESS;
        const baseGray = (1 - d) * 255;
        const ar = Math.round(Phaser.Math.Clamp(baseGray * this._ambientTintR, 0, 255));
        const ag = Math.round(Phaser.Math.Clamp(baseGray * this._ambientTintG, 0, 255));
        const ab = Math.round(Phaser.Math.Clamp(baseGray * this._ambientTintB, 0, 255));
        const ambientHex = (ar << 16) | (ag << 8) | ab;
        this.rt.fill(ambientHex, 1.0);

        // Contact shadows are costly during heavy swarms; tighten gate when hostiles are high.
        const contactShadowMinFps = hostileCount >= 14 ? 56 : 38;
        if (fps >= contactShadowMinFps) {
            const prevContactAlpha = this.contactShadowGraphics.alpha;
            this.contactShadowGraphics.setAlpha(adaptiveShadowAlpha);
            this.drawEntityContactShadows(entities, cam, lightSources);
            this.contactShadowGraphics.setVisible(true);
            this.rt.draw(this.contactShadowGraphics, 0, 0);
            this.contactShadowGraphics.setVisible(false);
            this.contactShadowGraphics.setAlpha(prevContactAlpha);
        }

        if (this.qualityTier <= 1) {
            this.drawWallDepthShading(cam);
            this.wallShadeGraphics.setVisible(true);
            this.rt.draw(this.wallShadeGraphics, 0, 0);
            this.wallShadeGraphics.setVisible(false);
        }

        // Static map ambient & corridor lights — drawn regardless of marine count.
        if (this.staticLights?.length > 0) {
            this.drawStaticAmbientLights(this.staticLights, cam);
        }

        const cameraMidX = cam.scrollX + (cam.width / 2);
        const cameraMidY = cam.scrollY + (cam.height / 2);
        const viewRadiusBase = Number(this.tuning.lightViewRadius ?? CONFIG.LIGHT_SOURCE_VIEW_RADIUS);
        const shaderRangeBase = Number(this.tuning.lightShaderDistance ?? CONFIG.LIGHT_SHADER_EFFECT_RANGE);
        const initialLensAlpha = this.torchLensGraphics.alpha;
        const initialOrbitAlpha = this.torchOrbitGraphics.alpha;
        this.torchLensGraphics.setAlpha(adaptiveShadowAlpha);
        this.torchOrbitGraphics.setAlpha(adaptiveShadowAlpha);

        if (!lightSources || lightSources.length === 0) {
            this.lightGraphics.setVisible(true);
            this.rt.draw(this.lightGraphics, 0, 0);
            this.lightGraphics.setVisible(false);
            this.torchLensGraphics.setAlpha(initialLensAlpha);
            this.torchOrbitGraphics.setAlpha(initialOrbitAlpha);
            return;
        }
        const maxSources = this.qualityTier >= 3 ? 8 : (this.qualityTier >= 2 ? 14 : 24);
        const visibleSources = this._visibleSourceScratch || (this._visibleSourceScratch = []);
        visibleSources.length = 0;
        for (let sourceIndex = 0, processedSources = 0; sourceIndex < lightSources.length && processedSources < maxSources; sourceIndex++) {
            const source = lightSources[sourceIndex];
            if (!source) continue;
            const sourceRange = Number(source.range) || 0;
            const dx = source.x - cameraMidX;
            const dy = source.y - cameraMidY;
            const distSq = dx * dx + dy * dy;
            const viewRadius = viewRadiusBase + sourceRange;
            if (this.qualityTier >= 2 && distSq > (viewRadius * viewRadius)) continue;
            processedSources++;
            visibleSources.push(source);
            const kind = String(source?.kind || 'torch').toLowerCase();
            const raycastKind = kind === 'torch';
            let staticSegments = [];
            let segments = [];
            if (raycastKind) {
                const radius = sourceRange + CONFIG.TILE_SIZE;
                staticSegments = this.lightBlockerGrid.getSegmentsNear(source.x, source.y, radius);
                const objectSegments = this.buildObjectSegments(source, objectCasters);
                for (let i = 0; i < objectSegments.length; i++) {
                    staticSegments.push(objectSegments[i]);
                }
                segments = staticSegments;
                this.drawFeatheredCone(source, segments, cam);
                if (this.qualityTier <= 1) this.drawSurfaceContactLight(source, staticSegments, cam);
            }
            this.drawSoftGlow(source, cam);
            if (raycastKind) this.drawTerminalHotspot(source, segments, cam, entities);
            if (kind === 'torch') {
                const shaderRange = shaderRangeBase + sourceRange;
                const shouldRenderLens = distSq <= (shaderRange * shaderRange);
                if (shouldRenderLens) {
                    this.drawTorchSourceLensFlare(source, cam);
                    if (this.qualityTier <= 1) this.drawTorchDustMotes(source, cam);
                }
            }
            this.drawAlarmSpriteGlow(source, cam);
        }

        // Shared world-object illumination: use the same light field for props,
        // doors, marines, enemies, and authored large textures.
        if (this.qualityTier <= 2 && entities?.length > 0) {
            const prevHotspotAlpha = this.hotspotGraphics.alpha;
            this.hotspotGraphics.setAlpha(adaptiveShadowAlpha);
            this.drawEntityLighting(entities, visibleSources, cam);
            this.hotspotGraphics.setAlpha(prevHotspotAlpha);
        }

        this.lightGraphics.setVisible(true);
        this.rt.draw(this.lightGraphics, 0, 0);
        this.lightGraphics.setVisible(false);
        this.torchLensGraphics.setAlpha(initialLensAlpha);
        this.torchOrbitGraphics.setAlpha(initialOrbitAlpha);
    }

    drawEntityContactShadows(entities, cam, lightSources = null) {
        if (!entities || entities.length === 0) return;
        const g = this.contactShadowGraphics;

        for (const ent of entities) {
            if (!ent.active || !ent.visible) continue;

            const screenX = ent.x - cam.scrollX;
            const screenY = ent.y - cam.scrollY;

            // Basic check if on screen
            if (screenX < -64 || screenX > CONFIG.GAME_WIDTH + 64 ||
                screenY < -64 || screenY > CONFIG.GAME_HEIGHT + 64) continue;

            const baseScale = ent.scaleX || 1;
            const bodyW = Math.max(14, Number(ent.displayWidth) || 28);
            const bodyH = Math.max(10, Number(ent.displayHeight) || 20);
            const speed = Math.hypot(
                Number(ent?.body?.velocity?.x) || 0,
                Number(ent?.body?.velocity?.y) || 0
            );
            const motionStretch = 1 + Phaser.Math.Clamp(speed / 240, 0, 0.2);
            const shadowVec = this.getEntityShadowVector(ent, lightSources);
            const stretch = shadowVec?.stretch || 1;
            const blur = shadowVec?.blur || 1;
            const width = bodyW * 0.78 * baseScale * motionStretch * stretch;
            const height = bodyH * 0.42 * baseScale * Phaser.Math.Linear(0.94, 1.08, Phaser.Math.Clamp(stretch - 1, 0, 0.5));
            const offX = (shadowVec ? shadowVec.offX : 2) + blur * 0.2;
            const offY = (shadowVec ? shadowVec.offY : 4) + bodyH * 0.1 + blur * 0.24;
            const alphaMul = shadowVec ? shadowVec.alphaMul : 1;

            // Feathered contact shadow: compact core with penumbra. 3 layers instead of 4
            // for better perf while maintaining visual quality.
            g.fillStyle(0x050810, 0.32 * alphaMul);
            g.fillEllipse(screenX + offX * 0.32, screenY + offY * 0.32, width * 0.72, height * 0.66);
            g.fillStyle(0x060a14, 0.18 * alphaMul);
            g.fillEllipse(screenX + offX * 0.62, screenY + offY * 0.62, width * 1.1, height * 0.95);
            g.fillStyle(0x070b16, 0.07 * alphaMul);
            g.fillEllipse(screenX + offX * 1.0, screenY + offY * 1.0, width * 1.48, height * 1.34);
        }
    }

    getEntityShadowVector(ent, lightSources) {
        if (!Array.isArray(lightSources) || lightSources.length <= 0) return null;
        let sumX = 0;
        let sumY = 0;
        let total = 0;
        let strongest = 0;
        let strongestDx = 0;
        let strongestDy = 0;
        for (const src of lightSources) {
            if (!src) continue;
            const kind = String(src?.kind || 'torch').toLowerCase();
            const kindMul = kind === 'torch'
                ? 1
                : (kind === 'flash' ? 0.84 : (kind === 'spark' ? 0.58 : (kind === 'lamp' ? 0.52 : (kind === 'spot' ? 0.64 : 0.44))));
            const intensity = Math.max(0.05, Number(src.intensity) || 0) * kindMul;
            const range = Math.max(20, Number(src.range) || Number(src.softRadius) || 20);
            const dx = (Number(ent.x) || 0) - (Number(src.x) || 0);
            const dy = (Number(ent.y) || 0) - (Number(src.y) || 0);
            const distSq = dx * dx + dy * dy;
            const reachSq = (range * 1.35) * (range * 1.35);
            if (distSq > reachSq) continue;
            const dist = Math.sqrt(Math.max(1, distSq));
            const distFactor = 1 - Phaser.Math.Clamp(dist / (range * 1.35), 0, 1);
            let coneFactor = 1;
            const halfAngle = Number(src?.halfAngle);
            if (Number.isFinite(halfAngle) && halfAngle < (Math.PI - 0.01)) {
                const angle = Math.atan2(dy, dx);
                const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - (Number(src?.angle) || 0)));
                const conePad = kind === 'flash' ? 0.18 : (kind === 'spot' ? 0.08 : 0.14);
                const maxCone = Math.max(0.08, halfAngle + conePad);
                if (diff > maxCone) continue;
                coneFactor = Math.pow(1 - (diff / maxCone), 1.35);
            }
            const score = intensity * distFactor * distFactor * coneFactor;
            if (score <= 0.001) continue;
            total += score;
            sumX += (dx / dist) * score;
            sumY += (dy / dist) * score;
            if (score > strongest) {
                strongest = score;
                strongestDx = dx;
                strongestDy = dy;
            }
        }
        if (total <= 0) return null;
        let nx = sumX / total;
        let ny = sumY / total;
        const nLen = Math.hypot(nx, ny);
        if (nLen > 0.0001) {
            nx /= nLen;
            ny /= nLen;
        } else {
            const baseLen = Math.max(1, Math.hypot(strongestDx, strongestDy));
            nx = strongestDx / baseLen;
            ny = strongestDy / baseLen;
        }
        const reach = Phaser.Math.Clamp(2.2 + strongest * 7.2 + total * 0.9, 2, 8.2);
        return {
            offX: nx * reach,
            offY: ny * reach,
            stretch: Phaser.Math.Clamp(1 + strongest * 0.28 + total * 0.1, 1, 1.48),
            alphaMul: Phaser.Math.Clamp(0.68 + strongest * 0.42 + total * 0.12, 0.58, 1.15),
            blur: Phaser.Math.Clamp(0.9 + strongest * 0.6 + total * 0.22, 0.85, 1.8),
        };
    }

    drawFeatheredCone(source, segments, cam) {
        const kind = String(source?.kind || 'torch');
        const isFlash = kind === 'flash';
        const isSpark = kind === 'spark';
        const isSpot = kind === 'spot';
        const intensity = Phaser.Math.Clamp(Number(source?.intensity) || 1, 0.2, 3.6);
        const tier = Number(this.qualityTier) || 0;
        const layerScale = tier >= 3 ? 0.35 : (tier >= 2 ? 0.5 : (tier >= 1 ? 0.72 : 1));
        const featherLayers = Math.max(4, Math.round(this.getTuningNumber('featherLayers', CONFIG.TORCH_FEATHER_LAYERS, 4, 24)));
        const featherSpread = this.getTuningNumber('featherSpread', 1, 0.4, 2.5);
        const featherAngleStep = CONFIG.TORCH_FEATHER_ANGLE_STEP * featherSpread;
        const featherRangeStep = CONFIG.TORCH_FEATHER_RANGE_STEP * featherSpread;
        const layers = Math.max(1, Math.round((featherLayers + (isFlash ? 2 : (isSpot ? 1 : 0))) * layerScale));
        const halfAngleBoost = isFlash ? 0.16 : (isSpark ? 0.28 : (isSpot ? -0.03 : 0));
        const rangeMul = isFlash ? 1.08 : (isSpark ? 1.12 : (isSpot ? 1.02 : 1));
        const isTorch = kind === 'torch';
        // Compute the visibility polygon ONCE at the outermost feather layer.
        // All gradient rings are rendered from this single polygon — eliminating
        // 7 of the 8 redundant raycasting passes from the original per-layer loop.
        const maxLayer = layers - 1;
        const maxHalfAngle = Phaser.Math.Clamp(
            source.halfAngle + halfAngleBoost + maxLayer * featherAngleStep,
            0.08,
            Math.PI - 0.02
        );
        const maxRange = source.range * rangeMul * (1 + maxLayer * featherRangeStep);
        const alphaMul = isFlash ? 1.32 : (isSpark ? 0.9 : (isSpot ? 0.7 : 1));
        const kindMul = isTorch ? 0.70 : 1.0;
        let coreAlpha = (this.tuning.coreAlpha ?? CONFIG.TORCH_CORE_ALPHA) * alphaMul * intensity * kindMul;
        // Flashlight flicker — subtle sine-wave intensity modulation per source.
        // Each source gets a unique phase from its position so marines don't flicker in sync.
        if (isTorch) {
            const timeSec = (Number(this.scene?.time?.now) || 0) * 0.001;
            const phase = (Number(source.x) || 0) * 0.0137 + (Number(source.y) || 0) * 0.0091;
            const isPeak = this.scene?.combatDirector?.state === 'peak';
            const amp1 = isPeak ? 0.07 : 0.045;
            const amp2 = isPeak ? 0.035 : 0.02;
            let flickerMul = 1.0 + amp1 * Math.sin(timeSec * 3.2 + phase * 1.7);
            flickerMul *= 1.0 + amp2 * Math.sin(timeSec * 7.8 + phase * 3.1);
            coreAlpha *= flickerMul;
        }
        const polygon = this.raycaster.computeVisibilityPolygon(
            source.x, source.y, source.angle, maxHalfAngle, maxRange, segments,
            {
                fillScale: tier >= 3 ? 0.32 : (tier >= 2 ? 0.48 : (tier >= 1 ? 0.7 : 1)),
                pointStride: tier >= 3 ? 3 : (tier >= 2 ? 2 : 1),
                jitterRayCount: tier >= 2 ? 1 : 3,
            }
        );
        if (polygon.length >= 3) {
            this._drawRingGradientCone(
                source, polygon, cam,
                source.halfAngle + halfAngleBoost, maxHalfAngle, maxRange, coreAlpha, layers
            );
            // Soft penumbra wedges at wall-corner shadow edges (tier 0 and 1 only).
            if (tier <= 1) {
                this._drawPenumbraFans(source, polygon, cam, maxRange, coreAlpha);
            }
        }
        // Pulse-rifle firing beam: 3-layer rounded ellipse distinct from the
        // angular torch cone.  Drawn on the MULTIPLY RT so ambient darkness
        // and wall shadows bleed through naturally, plus a small additive
        // kick for muzzle flash pop.
        if (kind === 'torch') {
            const muzzleFlash = Phaser.Math.Clamp(Number(source?.muzzleFlash) || 0, 0, 1);
            if (muzzleFlash > 0.02) {
                const tune = this.scene?.runtimeSettings?.lighting || {};
                const alphaMul = Phaser.Math.Clamp(Number(tune.beamFlashAlphaMul) || 1, 0.2, 3);
                const widthMul = Phaser.Math.Clamp(Number(tune.beamFlashWidthMul) || 1, 0.4, 2.5);
                const beamRange = Number(source?.range) || 0;
                const flashTint = Number.isFinite(Number(source?.muzzleFlashColor)) ? Number(source.muzzleFlashColor) : 0xffffff;
                // Rapid stochastic flash pulse for more strobe-like feel
                const now = Number(this.scene?.time?.now) || 0;
                const flashPulse = 0.75 + 0.25 * Math.sin(now * 0.12 + (Number(source.muzzleX) || Number(source.x) || 0) * 0.07);
                // Base alpha (-10% from previous)
                const baseAlpha = Phaser.Math.Clamp((0.17 + muzzleFlash * 0.27) * alphaMul * flashPulse, 0.08, 0.51);
                // Ellipse dimensions: long axis = beam range, short axis = spread
                let majorLen = beamRange * Phaser.Math.Linear(0.58, 0.74, muzzleFlash);
                const blockHit = this.findFirstBlockingHit(source, segments);
                if (blockHit && Number.isFinite(blockHit.dist)) {
                    // `drawBeamEllipseLayers` extends to roughly 2*majorLen ahead of source.
                    const frontCap = Math.max(6, blockHit.dist - 4);
                    majorLen = Math.min(majorLen, frontCap * 0.5);
                }
                const minorLen = majorLen * Phaser.Math.Linear(0.075, 0.115, muzzleFlash) * widthMul;
                if (majorLen < 3 || minorLen < 1.2) return;
                this.drawBeamEllipseLayers(source, cam, majorLen, minorLen, baseAlpha, flashTint);
            }
        }
    }

    /**
     * Draw the firing beam as 3 nested ellipses whose back edge starts at
     * the marine.  Drawn on the MULTIPLY RT so ambient darkness and wall
     * shadows bleed through, plus a small additive kick for brightness pop.
     */
    drawBeamEllipseLayers(source, cam, majorLen, minorLen, baseAlpha, color) {
        const angle = Number(source.angle) || 0;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // Weapon bloom should originate at the muzzle, not the marine torso.
        const originX = Number.isFinite(Number(source?.muzzleX)) ? Number(source.muzzleX) : Number(source.x);
        const originY = Number.isFinite(Number(source?.muzzleY)) ? Number(source.muzzleY) : Number(source.y);
        const mx = originX - cam.scrollX;
        const my = originY - cam.scrollY;

        // 3 gradient layers drawn back-to-front: outer/faint first, inner/bright last
        const layerDefs = [
            { scaleMaj: 1.06, scaleMin: 0.98, alphaRT: 0.34, alphaAdd: 0.035 },
            { scaleMaj: 0.7, scaleMin: 0.62, alphaRT: 0.56, alphaAdd: 0.06 },
            { scaleMaj: 0.4, scaleMin: 0.3, alphaRT: 0.84, alphaAdd: 0.095 },
        ];
        for (const layer of layerDefs) {
            const w = majorLen * layer.scaleMaj;
            const ht = minorLen * layer.scaleMin;
            const cx = mx + cosA * w;
            const cy = my + sinA * w;
            // MULTIPLY RT — darkness/shadows bleed through naturally
            const aRT = Phaser.Math.Clamp(baseAlpha * layer.alphaRT, 0, 1);
            this._fillRotatedEllipse(this.lightGraphics, cx, cy, w, ht, angle, color, aRT);
            // Small additive kick for muzzle flash pop
            const aAdd = Phaser.Math.Clamp(baseAlpha * layer.alphaAdd, 0, 0.18);
            this._fillRotatedEllipse(this.hotspotGraphics, cx, cy, w, ht, angle, color, aAdd);
        }

        // Add a dedicated rounded end-cap so the beam terminus reads as a full
        // ellipse instead of narrowing into a pointed tail.
        const tipDist = majorLen * 1.92;
        const tipX = mx + cosA * tipDist;
        const tipY = my + sinA * tipDist;
        const tipHalfW = Math.max(3, minorLen * 0.62);
        const tipHalfH = Math.max(3, minorLen * 0.72);
        this._fillRotatedEllipse(
            this.lightGraphics,
            tipX,
            tipY,
            tipHalfW,
            tipHalfH,
            angle,
            color,
            Phaser.Math.Clamp(baseAlpha * 0.44, 0, 0.42)
        );
        this._fillRotatedEllipse(
            this.hotspotGraphics,
            tipX,
            tipY,
            tipHalfW * 0.94,
            tipHalfH * 0.94,
            angle,
            color,
            Phaser.Math.Clamp(baseAlpha * 0.08, 0, 0.12)
        );
    }

    /**
     * Draw a filled rotated ellipse using a polygon approximation.
     * Phaser Graphics.fillEllipse is axis-aligned only, so we compute
     * vertices manually and rotate them by the given angle.
     */
    _fillRotatedEllipse(graphics, cx, cy, halfW, halfH, angle, color, alpha) {
        if (alpha < 0.002) return;
        const segments = this.qualityTier >= 3 ? 8 : (this.qualityTier >= 2 ? 10 : (this.lowFxMode ? 14 : 24));
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        graphics.fillStyle(color, Phaser.Math.Clamp(alpha, 0, 1));
        graphics.beginPath();
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const lx = Math.cos(theta) * halfW;
            const ly = Math.sin(theta) * halfH;
            const rx = cx + lx * cosA - ly * sinA;
            const ry = cy + lx * sinA + ly * cosA;
            if (i === 0) {
                graphics.moveTo(rx, ry);
            } else {
                graphics.lineTo(rx, ry);
            }
        }
        graphics.closePath();
        graphics.fillPath();
    }

    drawConeLayer(source, segments, cam, halfAngle, range, alpha) {
        const tier = Number(this.qualityTier) || 0;
        const polygon = this.raycaster.computeVisibilityPolygon(
            source.x,
            source.y,
            source.angle,
            halfAngle,
            range,
            segments,
            {
                fillScale: tier >= 3 ? 0.32 : (tier >= 2 ? 0.48 : (tier >= 1 ? 0.7 : 1)),
                pointStride: tier >= 3 ? 3 : (tier >= 2 ? 2 : 1),
                jitterRayCount: tier >= 2 ? 1 : 3,
            }
        );
        if (polygon.length < 3) return;

        const screenX = source.x - cam.scrollX;
        const screenY = source.y - cam.scrollY;
        const lightColor = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xffffff;
        const clampedAlpha = Phaser.Math.Clamp(alpha, 0, 1);
        const sx = source.x;
        const sy = source.y;

        // Feathered tip: draw the cone in radial slices from far (dim) to near
        // (bright). Each slice clamps polygon vertices to a max radius, so the
        // far end naturally fades to nothing while the near beam stays solid.
        const fadeSteps = tier >= 3 ? 2 : (tier >= 2 ? 3 : 4);
        const invSteps = 1 / fadeSteps;

        for (let s = 0; s < fadeSteps; s++) {
            const t = fadeSteps === 1 ? 1 : s * invSteps;
            const falloff = 1 - t;
            const maxR = range * (0.46 + falloff * 0.54);
            const maxRSq = maxR * maxR;
            const stepAlpha = Phaser.Math.Clamp(
                clampedAlpha * Math.pow(falloff, 1.7) * Phaser.Math.Linear(0.45, 1.0, falloff) * invSteps,
                0,
                1
            );
            if (stepAlpha < 0.004) continue;

            this.lightGraphics.fillStyle(lightColor, stepAlpha);
            this.lightGraphics.beginPath();
            this.lightGraphics.moveTo(screenX, screenY);
            for (let i = 0; i < polygon.length; i++) {
                const px = polygon[i].x - sx;
                const py = polygon[i].y - sy;
                const dSq = px * px + py * py;
                if (dSq > maxRSq && dSq > 0.01) {
                    const scale = maxR / Math.sqrt(dSq);
                    this.lightGraphics.lineTo(
                        sx + px * scale - cam.scrollX,
                        sy + py * scale - cam.scrollY
                    );
                } else {
                    this.lightGraphics.lineTo(
                        polygon[i].x - cam.scrollX,
                        polygon[i].y - cam.scrollY
                    );
                }
            }
            this.lightGraphics.closePath();
            this.lightGraphics.fillPath();
        }
    }

    /**
     * Render the visibility polygon as a gradient cone using concentric rings
     * that expand in both radius and angular width from the bright core out to
     * the wide feather edge. A single pre-computed polygon supplies shadow
     * geometry for all rings — no redundant raycasting.
     *
     * Each ring applies:
     *   - Radial clamp  : vertices beyond ringMaxR are projected to the arc.
     *   - Angular clamp : vertices outside ringHalfAngle are projected to the
     *                     nearest cone boundary ray direction. This produces the
     *                     angular gradient without extra raycasting passes.
     */
    _drawRingGradientCone(source, polygon, cam, baseHalfAngle, maxHalfAngle, maxRange, coreAlpha, layers) {
        const tier = Number(this.qualityTier) || 0;
        const lightColor = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xffffff;
        const sx = source.x, sy = source.y;
        const facingAngle = source.angle;
        const angleSpan = maxHalfAngle - baseHalfAngle;
        const featherLayers = Math.max(4, Math.round(this.getTuningNumber('featherLayers', CONFIG.TORCH_FEATHER_LAYERS, 4, 24)));
        const featherSpread = this.getTuningNumber('featherSpread', 1, 0.4, 2.5);
        const featherDecay = this.getTuningNumber('featherDecay', CONFIG.TORCH_FEATHER_ALPHA_DECAY, 0.2, 0.95);
        const baseRingCount = tier >= 3 ? 3 : (tier >= 2 ? 4 : (tier >= 1 ? 6 : 8));
        const ringScale = featherLayers / Math.max(1, CONFIG.TORCH_FEATHER_LAYERS);
        const RINGS = Math.max(3, Math.round(baseRingCount * ringScale));
        const ringAlphaMul = 1.85 + Math.max(0, ringScale - 1) * 0.18;
        // Render outer (dim) to inner (bright) so core paints on top.
        for (let r = RINGS - 1; r >= 0; r--) {
            const t = RINGS > 1 ? r / (RINGS - 1) : 1;  // 0 = core, 1 = outer feather
            const ringMaxR = maxRange * (0.18 + t * 0.82);
            const ringHalfAngle = baseHalfAngle + t * angleSpan * Phaser.Math.Clamp(0.94 + featherSpread * 0.08, 0.85, 1.18);
            // Map ring index onto the original layer decay curve.
            const decayExp = r * (layers / RINGS);
            const alpha = Phaser.Math.Clamp(
                coreAlpha * Math.pow(featherDecay, decayExp) / RINGS * ringAlphaMul,
                0, 1
            );
            if (alpha < 0.003) continue;
            const ringMaxRSq = ringMaxR * ringMaxR;
            this.lightGraphics.fillStyle(lightColor, alpha);
            this.lightGraphics.beginPath();
            this.lightGraphics.moveTo(sx - cam.scrollX, sy - cam.scrollY);
            for (let i = 0; i < polygon.length; i++) {
                let px = polygon[i].x - sx;
                let py = polygon[i].y - sy;
                const distSq = px * px + py * py;
                // Radial clamp.
                if (distSq > ringMaxRSq && distSq > 0.01) {
                    const scale = ringMaxR / Math.sqrt(distSq);
                    px *= scale;
                    py *= scale;
                }
                // Angular clamp: project vertices outside this ring's half-angle
                // onto the nearest cone boundary ray.
                const vAngle = Math.atan2(py, px);
                let diff = vAngle - facingAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) > ringHalfAngle) {
                    const sign = diff >= 0 ? 1 : -1;
                    const cA = facingAngle + sign * ringHalfAngle;
                    const d = Math.sqrt(px * px + py * py);
                    px = Math.cos(cA) * d;
                    py = Math.sin(cA) * d;
                }
                this.lightGraphics.lineTo(sx + px - cam.scrollX, sy + py - cam.scrollY);
            }
            this.lightGraphics.closePath();
            this.lightGraphics.fillPath();
        }
    }

    /**
     * Draw soft penumbra wedges at wall-corner shadow edges within the cone.
     * Detects polygon edges where a large distance jump signals a wall occlusion
     * boundary, then draws small gradient triangles fanning from the occluder
     * corner toward the shadow zone at progressively lower alpha — giving the
     * "torch sweeping past a doorframe" softness from the film aesthetic.
     */
    _drawPenumbraFans(source, polygon, cam, maxRange, coreAlpha) {
        if (!polygon || polygon.length < 3) return;
        const lightColor = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xffffff;
        const sx = source.x, sy = source.y;
        const WALL_THRESHOLD = maxRange * 0.95;
        const PENUMBRA_STEPS = 3;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            const distI = Math.hypot(polygon[i].x - sx, polygon[i].y - sy);
            const distJ = Math.hypot(polygon[j].x - sx, polygon[j].y - sy);
            const jump = Math.abs(distI - distJ);
            // Only process edges with a significant shadow-forming distance jump.
            if (jump < maxRange * 0.14) continue;
            const nearDist = distI < distJ ? distI : distJ;
            if (nearDist > WALL_THRESHOLD) continue;  // Both vertices on arc, no wall
            const nearIdx = distI < distJ ? i : j;
            const farIdx  = distI < distJ ? j : i;
            // Draw gradient wedges fanning from the occluder corner toward the
            // far illuminated vertex, creating a soft penumbra at the shadow edge.
            for (let k = 1; k <= PENUMBRA_STEPS; k++) {
                const blend = k / (PENUMBRA_STEPS + 1);
                const midX = polygon[nearIdx].x + (polygon[farIdx].x - polygon[nearIdx].x) * blend * 0.30;
                const midY = polygon[nearIdx].y + (polygon[farIdx].y - polygon[nearIdx].y) * blend * 0.30;
                const penAlpha = Phaser.Math.Clamp(coreAlpha * 0.20 * (1 - blend), 0, 0.16);
                if (penAlpha < 0.003) continue;
                this.lightGraphics.fillStyle(lightColor, penAlpha);
                this.lightGraphics.beginPath();
                this.lightGraphics.moveTo(sx - cam.scrollX, sy - cam.scrollY);
                this.lightGraphics.lineTo(polygon[nearIdx].x - cam.scrollX, polygon[nearIdx].y - cam.scrollY);
                this.lightGraphics.lineTo(midX - cam.scrollX, midY - cam.scrollY);
                this.lightGraphics.closePath();
                this.lightGraphics.fillPath();
            }
        }
    }

    drawSoftGlow(source, cam) {
        const kind = String(source?.kind || 'torch');
        const isFlash = kind === 'flash';
        const isSpark = kind === 'spark';
        const isSpot = kind === 'spot';
        const isAlarm = kind === 'alarm';
        const isTorch = kind === 'torch';
        const lightColor = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xffffff;
        const intensity = Phaser.Math.Clamp(Number(source?.intensity) || 1, 0.2, 3.6);
        const glowStrength = this.getTuningNumber('glowStrength', 1, 0.1, 2);
        const baseSoft = Number(source?.softRadius) || (this.tuning.softRadius ?? CONFIG.MARINE_LIGHT_SOFT_RADIUS);
        const softRadius = baseSoft * (isFlash ? 1.18 : (isSpark ? 0.92 : (isSpot ? 0.76 : (isAlarm ? 0.98 : 0.72))));
        const haloRadiusFactor = isFlash
            ? 1.48
            : (isSpark ? CONFIG.TORCH_FOG_HALO_RADIUS_FACTOR : (isSpot ? CONFIG.TORCH_FOG_HALO_RADIUS_FACTOR * 0.46 : (isAlarm ? CONFIG.TORCH_FOG_HALO_RADIUS_FACTOR * 0.72 : (CONFIG.TORCH_FOG_HALO_RADIUS_FACTOR * 0.58))));
        const haloRadius = softRadius * haloRadiusFactor;
        const haloAlpha = Phaser.Math.Clamp(
            CONFIG.TORCH_FOG_HALO_ALPHA * (isFlash ? 1.7 : (isSpark ? 0.75 : (isSpot ? 0.22 : (isAlarm ? 0.55 : 0.32)))) * intensity * glowStrength,
            0,
            1
        );
        const sx = source.x - cam.scrollX;
        const sy = source.y - cam.scrollY;
        const useGradient = !!this._lightGradientKey;
        const gradientSize = 512;
        if (useGradient) {
            const haloSprite = this._getLightGradientSprite();
            const haloScale = (haloRadius * 2) / gradientSize;
            const haloTint = isTorch ? this.mixColors(lightColor, 0xc8d8e8, 0.24) : lightColor;
            haloSprite.setPosition(sx, sy);
            haloSprite.setScale(haloScale);
            haloSprite.setTint(haloTint);
            haloSprite.setAlpha(Phaser.Math.Clamp(haloAlpha * (isTorch ? 0.84 : 1.12), 0, 0.92));
            haloSprite.setVisible(true);
            haloSprite.setActive(true);
            this.rt.draw(haloSprite, sx, sy);
            haloSprite.setVisible(false);
            haloSprite.setActive(false);
        } else {
            this.lightGraphics.fillStyle(lightColor, haloAlpha);
            this.lightGraphics.fillCircle(sx, sy, haloRadius);
        }

        // Outer atmospheric scatter: multi-layer feathered halo for dusty corridor feel.
        if (isTorch) {
            const outerHaloR = haloRadius * 1.7;
            const outerHaloA = Phaser.Math.Clamp(haloAlpha * (useGradient ? 0.11 : 0.14) * intensity * glowStrength, 0, 0.12);
            if (outerHaloA > 0.005) {
                const scatterTint = this.mixColors(lightColor, 0xb7c9dd, 0.35);
                this.lightGraphics.fillStyle(scatterTint, outerHaloA * 0.45);
                this.lightGraphics.fillCircle(sx, sy, outerHaloR * 1.22);
                this.lightGraphics.fillStyle(scatterTint, outerHaloA * 0.78);
                this.lightGraphics.fillCircle(sx, sy, outerHaloR * 0.82);
                this.lightGraphics.fillStyle(scatterTint, outerHaloA);
                this.lightGraphics.fillCircle(sx, sy, outerHaloR * 0.48);
            }
            // Subtle bokeh ring at halo edge — faint bright ring simulating lens aperture
            if (!this.lowFxMode && outerHaloA > 0.008) {
                const ringAlpha = Phaser.Math.Clamp(outerHaloA * 0.3, 0.003, 0.035);
                this.hotspotGraphics.lineStyle(1.5, 0xc8dcf0, ringAlpha);
                this.hotspotGraphics.strokeCircle(
                    sx,
                    sy,
                    outerHaloR * 0.88
                );
            }
        }

        if (isTorch) {
            // Inner ambient glow around marine — scales with intensity (firing brightens it)
            const innerAlpha = Phaser.Math.Clamp(0.14 * intensity * glowStrength, 0, 0.44);
            const innerTint = this.mixColors(lightColor, 0xfff0cf, 0.34);
            this.lightGraphics.fillStyle(innerTint, innerAlpha * 0.72);
            this.lightGraphics.fillCircle(
                sx,
                sy,
                softRadius * Phaser.Math.Linear(0.26, 0.4, Phaser.Math.Clamp((intensity - 1) / 1.8, 0, 1))
            );
            this.lightGraphics.fillStyle(lightColor, innerAlpha * 0.45);
            this.lightGraphics.fillCircle(sx, sy, softRadius * 0.14);
            const muzzleFlash = Phaser.Math.Clamp(Number(source?.muzzleFlash) || 0, 0, 1);
            if (muzzleFlash > 0.02) {
                // Muzzle glow around marine — 3-layer gradient
                const coreR = softRadius * Phaser.Math.Linear(0.22, 0.42, muzzleFlash);
                const coreColor = Number.isFinite(Number(source?.muzzleFlashColor)) ? Number(source.muzzleFlashColor) : 0xffffff;
                // 3 concentric circles: outer faint, mid, inner bright
                const glowLayers = [
                    { scale: 2.2, aRT: 0.113, aAdd: 0.029, tint: 0xffe8c0 },
                    { scale: 1.4, aRT: 0.188, aAdd: 0.047, tint: coreColor },
                    { scale: 0.7, aRT: 0.30,  aAdd: 0.075, tint: coreColor },
                ];
                for (const gl of glowLayers) {
                    const r = coreR * gl.scale;
                    const aRT = Phaser.Math.Clamp(muzzleFlash * gl.aRT, 0, 0.45);
                    const aAdd = Phaser.Math.Clamp(muzzleFlash * gl.aAdd, 0, 0.12);
                    this.lightGraphics.fillStyle(gl.tint, aRT);
                    this.lightGraphics.fillCircle(sx, sy, r);
                    this.hotspotGraphics.fillStyle(gl.tint, aAdd);
                    this.hotspotGraphics.fillCircle(sx, sy, r);
                }
                // Body illumination — additive highlight directly on the marine sprite
                // so they visibly light up when firing, not just the floor around them.
                const bodyR = coreR * 0.55;
                this.hotspotGraphics.fillStyle(coreColor, Phaser.Math.Clamp(muzzleFlash * 0.55, 0, 0.65));
                this.hotspotGraphics.fillCircle(sx, sy, bodyR);
                this.hotspotGraphics.fillStyle(0xffd8a0, Phaser.Math.Clamp(muzzleFlash * 0.22, 0, 0.28));
                this.hotspotGraphics.fillCircle(sx, sy, bodyR * 2.0);
            }
        }

        const tier = Number(this.qualityTier) || 0;
        const stepScale = tier >= 3 ? 0.35 : (tier >= 2 ? 0.5 : (tier >= 1 ? 0.72 : 1));
        const baseSteps = (isTorch ? Math.ceil(CONFIG.TORCH_SOFT_GLOW_STEPS * 0.6) : CONFIG.TORCH_SOFT_GLOW_STEPS) + (isFlash ? 2 : 0);
        const steps = Math.max(1, Math.round(baseSteps * stepScale));

        // Use GPU-interpolated gradient texture for all light types to eliminate
        // visible circle banding. Torch still layers a warmer core over the smooth halo.
        const GRAD_TEX_SIZE = 512;
        if (this._lightGradientKey && !isTorch) {
            const alphaBase = CONFIG.TORCH_SOFT_GLOW_ALPHA *
                (isFlash ? 1.56 : (isSpark ? 0.74 : (isSpot ? 0.36 : (isAlarm ? 0.72 : 0.56)))) * glowStrength;
            const gradAlpha = Phaser.Math.Clamp(alphaBase * intensity, 0, 0.9);
            const gradSprite = this._getLightGradientSprite();
            const gradScale = (softRadius * 2) / GRAD_TEX_SIZE;
            gradSprite.setPosition(source.x - cam.scrollX, source.y - cam.scrollY);
            gradSprite.setScale(gradScale);
            gradSprite.setTint(lightColor);
            gradSprite.setAlpha(gradAlpha);
            gradSprite.setVisible(true);
            this.rt.draw(gradSprite, source.x - cam.scrollX, source.y - cam.scrollY);
            gradSprite.setVisible(false);
        } else {
            for (let i = steps; i >= 1; i--) {
                const t = i / steps;
                const radius = softRadius * t;
                const alphaBase = CONFIG.TORCH_SOFT_GLOW_ALPHA * (isFlash ? 1.56 : (isSpark ? 0.74 : (isSpot ? 0.36 : (isAlarm ? 0.72 : 0.56)))) * glowStrength;
                const alpha = Phaser.Math.Clamp(alphaBase * intensity * (1 - t * t), 0, 1);
                // Warm-to-cool color temperature shift: center stays warm, edges shift cool blue
                let stepColor = lightColor;
                if (isTorch && lightColor === 0xffffff) {
                    const coolBlend = t * t; // 0 at center → 1 at edge
                    // Lerp white (0xff,0xff,0xff) → cool blue-steel (0xb0,0xc8,0xff)
                    const r = Math.round(0xff - coolBlend * 0x4f);
                    const g = Math.round(0xff - coolBlend * 0x37);
                    const b = 0xff;
                    stepColor = (r << 16) | (g << 8) | b;
                }
                this.lightGraphics.fillStyle(stepColor, alpha);
                this.lightGraphics.fillCircle(
                    source.x - cam.scrollX,
                    source.y - cam.scrollY,
                    radius
                );
            }
        }
    }

    drawAlarmSpriteGlow(source, cam) {
        const kind = String(source?.kind || '').toLowerCase();
        if (kind !== 'alarm') return;
        const x = source.x - cam.scrollX;
        const y = source.y - cam.scrollY;
        const pulse = Phaser.Math.Clamp(Number(source?.pulse) || 0.5, 0, 1.4);
        const intensity = Phaser.Math.Clamp(Number(source?.intensity) || 0.25, 0.05, 1.2);
        const color = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xff3b3b;

        // ── Area illumination: draw feathered gradient onto the MULTIPLY RT ──
        // so the alarm light illuminates the surrounding floor/walls, not just
        // the marine sprite. Uses the same GPU-interpolated gradient texture.
        const alarmRadius = Phaser.Math.Linear(100, 170, pulse) * (0.8 + intensity * 0.4);
        if (this._lightGradientKey) {
            const GRAD_TEX_SIZE = 512;
            const areaSprite = this._getLightGradientSprite();
            const areaScale = (alarmRadius * 2) / GRAD_TEX_SIZE;
            areaSprite.setPosition(x, y);
            areaSprite.setScale(areaScale);
            areaSprite.setTint(color);
            areaSprite.setAlpha(Phaser.Math.Clamp(intensity * pulse * 0.6, 0, 0.52));
            areaSprite.setVisible(true);
            this.rt.draw(areaSprite, x, y);
            areaSprite.setVisible(false);
            areaSprite.setActive(false);
        }

        const rCore = Phaser.Math.Linear(24, 40, pulse);
        const rOuter = Phaser.Math.Linear(64, 102, pulse);
        const coreA = Phaser.Math.Clamp(0.05 + intensity * 0.14 * pulse, 0.03, 0.24);
        const outerA = Phaser.Math.Clamp(0.03 + intensity * 0.08 * pulse, 0.02, 0.14);
        this.torchLensGraphics.fillStyle(color, outerA);
        this.torchLensGraphics.fillCircle(x, y, rOuter);
        this.torchLensGraphics.fillStyle(color, coreA);
        this.torchLensGraphics.fillCircle(x, y, rCore);

        // ── Strobe lens flare streaks during pulse peaks ──
        if (pulse > 0.65 && intensity > 0.12) {
            const strobeFactor = Phaser.Math.Clamp((pulse - 0.65) / 0.35, 0, 1);
            const flareA = Phaser.Math.Clamp(strobeFactor * intensity * 0.18, 0.02, 0.22);
            const streakLen = Phaser.Math.Linear(40, 120, strobeFactor);
            const now = Number(this.scene?.time?.now) || 0;
            const seed = (source.x * 0.013 + source.y * 0.017) || 0;
            // Horizontal + vertical cross streaks
            this.torchLensGraphics.lineStyle(1.6, color, flareA);
            this.torchLensGraphics.beginPath();
            this.torchLensGraphics.moveTo(x - streakLen, y);
            this.torchLensGraphics.lineTo(x + streakLen, y);
            this.torchLensGraphics.strokePath();
            this.torchLensGraphics.lineStyle(1.2, color, flareA * 0.7);
            this.torchLensGraphics.beginPath();
            this.torchLensGraphics.moveTo(x, y - streakLen * 0.7);
            this.torchLensGraphics.lineTo(x, y + streakLen * 0.7);
            this.torchLensGraphics.strokePath();
            // Diagonal star streaks (rotated 45°)
            const diagLen = streakLen * 0.45;
            const diagA = flareA * 0.4;
            this.torchLensGraphics.lineStyle(1, color, diagA);
            this.torchLensGraphics.beginPath();
            this.torchLensGraphics.moveTo(x - diagLen * 0.707, y - diagLen * 0.707);
            this.torchLensGraphics.lineTo(x + diagLen * 0.707, y + diagLen * 0.707);
            this.torchLensGraphics.strokePath();
            this.torchLensGraphics.beginPath();
            this.torchLensGraphics.moveTo(x + diagLen * 0.707, y - diagLen * 0.707);
            this.torchLensGraphics.lineTo(x - diagLen * 0.707, y + diagLen * 0.707);
            this.torchLensGraphics.strokePath();
            // Small chromatic ghost circle offset from source
            const ghostDist = Phaser.Math.Linear(22, 58, strobeFactor);
            const ghostR = Phaser.Math.Linear(6, 16, strobeFactor);
            const ghostAngle = now * 0.0018 + seed;
            const gx = x + Math.cos(ghostAngle) * ghostDist;
            const gy = y + Math.sin(ghostAngle) * ghostDist;
            this.torchLensGraphics.fillStyle(color, flareA * 0.45);
            this.torchLensGraphics.fillCircle(gx, gy, ghostR);
            // Complementary ghost on opposite side
            this.torchLensGraphics.fillStyle(this.mixColors(color, 0x88ddff, 0.5), flareA * 0.3);
            this.torchLensGraphics.fillCircle(x - (gx - x), y - (gy - y), ghostR * 0.8);
        }
    }

    /**
     * Draw static ambient and corridor lights onto lightGraphics.
     * Corridor lights (red) tint the floor via MULTIPLY blend.
     * Ambient lights (blue-grey) gently brighten open areas.
     */
    drawStaticAmbientLights(lights, cam) {
        const g = this.lightGraphics;
        const add = this.hotspotGraphics;
        const tier = Number(this.qualityTier) || 0;
        const margin = tier >= 2 ? 220 : 320;
        const useGradient = !!this._lightGradientKey;
        // The gradient texture is 512x512, so diameter = 512. Scale = (radius*2) / 512.
        const GRAD_TEX_SIZE = 512;
        const now = Number(this.scene?.time?.now) || 0;
        const proceduralStride = tier >= 3 ? 4 : (tier >= 2 ? 3 : (tier >= 1 ? 2 : 1));
        const proceduralRadiusMul = tier >= 3 ? 0.64 : (tier >= 2 ? 0.74 : (tier >= 1 ? 0.84 : 1));
        const proceduralIntensityMul = tier >= 3 ? 0.5 : (tier >= 2 ? 0.62 : (tier >= 1 ? 0.78 : 1));
        let proceduralIndex = 0;

        for (const light of lights) {
            const procedural = light?.procedural === true;
            if (procedural) {
                if ((proceduralIndex % proceduralStride) !== 0) {
                    proceduralIndex++;
                    continue;
                }
                proceduralIndex++;
            }
            const sx = light.x - cam.scrollX;
            const sy = light.y - cam.scrollY;
            if (sx < -margin || sx > this.fixedWidth  + margin ||
                sy < -margin || sy > this.fixedHeight + margin) continue;

            const color     = Number.isFinite(Number(light.color)) ? Number(light.color) : 0xffffff;
            const radiusBase = Math.max(20, Number(light.radius) || 150);
            const intensityBase = Phaser.Math.Clamp(Number(light.intensity) || 0.15, 0, 1);
            const radius    = radiusBase * (procedural ? proceduralRadiusMul : 1);
            const intensity = intensityBase * (procedural ? proceduralIntensityMul : 1);

            // Animated intensity modulation for authored lights
            let finalIntensity = intensity;
            if (light.flickering) {
                const noiseVal = Math.sin(now * 0.047 + light.x * 7.3) *
                                 Math.cos(now * 0.031 + light.y * 5.1);
                finalIntensity *= 0.7 + 0.3 * (noiseVal * 0.5 + 0.5);
            }
            if (light.pulsing) {
                finalIntensity *= 0.6 + 0.4 * Math.sin(now * 0.003);
            }

            if (useGradient) {
                // GPU-interpolated radial gradient — smooth feathered falloff, no banding.
                // Draw onto lightGraphics as a tinted sprite via the RenderTexture.
                const sprite = this._getLightGradientSprite();
                const scale = (radius * 2) / GRAD_TEX_SIZE;
                sprite.setPosition(sx, sy);
                sprite.setScale(scale);
                sprite.setTint(color);
                // Alpha controls how much the light brightens the MULTIPLY RT.
                // Clamp so lights illuminate the area without washing out.
                sprite.setAlpha(Phaser.Math.Clamp(finalIntensity * 1.3, 0, 0.78));
                sprite.setVisible(true);
                sprite.setActive(true);
                // Draw the gradient directly onto the MULTIPLY RenderTexture
                // so it illuminates the floor, walls, and everything underneath.
                this.rt.draw(sprite, sx, sy);
                sprite.setVisible(false);
                sprite.setActive(false);
                if (!procedural || tier <= 1) {
                    add.fillStyle(color, Phaser.Math.Clamp(finalIntensity * 0.12, 0, 0.16));
                    add.fillCircle(sx, sy, radius * 0.6);
                }
            } else {
                // Fallback: stacked circles (for Canvas renderer or missing texture)
                const steps = procedural
                    ? (tier >= 2 ? 3 : (this.lowFxMode ? 4 : 6))
                    : (this.lowFxMode ? 4 : 10);
                for (let i = steps; i >= 1; i--) {
                    const t     = i / steps;
                    const alpha = Phaser.Math.Clamp(finalIntensity * 1.18 * (1 - t * t), 0, 0.68);
                    if (alpha < 0.004) continue;
                    g.fillStyle(color, alpha);
                    g.fillCircle(sx, sy, radius * t);
                }
            }

            // Additive spill so lights cast visible color onto the world
            const allowAdditiveSpill = !procedural || tier <= 1;
            const outerAddAlpha = allowAdditiveSpill ? Phaser.Math.Clamp(finalIntensity * 0.1, 0, 0.12) : 0;
            const innerAddAlpha = allowAdditiveSpill ? Phaser.Math.Clamp(finalIntensity * 0.14, 0, 0.18) : 0;
            if (outerAddAlpha > 0.003) {
                add.fillStyle(color, outerAddAlpha);
                add.fillCircle(sx, sy, radius * 0.72);
            }
            if (innerAddAlpha > 0.003) {
                add.fillStyle(color, innerAddAlpha);
                add.fillCircle(sx, sy, radius * 0.36);
            }
        }
    }

    /**
     * Additive glow on non-alien entities that are inside a static light radius.
     * Marines in red corridor lights will glow red; those in ambient lights glow cool-blue.
     */
    drawEntityLighting(entities, dynamicLights = [], cam) {
        const hasStatic = Array.isArray(this.staticLights) && this.staticLights.length > 0;
        const hasDynamic = Array.isArray(dynamicLights) && dynamicLights.length > 0;
        if (!hasStatic && !hasDynamic) return;
        const g = this.hotspotGraphics;

        for (const ent of entities) {
            if (!ent?.active || !ent?.visible) continue;

            const sx = ent.x - cam.scrollX;
            const sy = ent.y - cam.scrollY;
            if (sx < -80 || sx > this.fixedWidth  + 80 ||
                sy < -80 || sy > this.fixedHeight + 80) continue;

            let bestA = 0;
            let nextA = 0;
            let bestColor = 0xffffff;
            let nextColor = 0xffffff;

            if (hasStatic) {
                for (const light of this.staticLights) {
                    const radius = Math.max(1, Number(light.radius) || 0);
                    const ldx = ent.x - light.x;
                    const ldy = ent.y - light.y;
                    if (ldx * ldx + ldy * ldy >= radius * radius) continue;
                    const dist = Math.sqrt(ldx * ldx + ldy * ldy);
                    const falloff = 1 - dist / radius;
                    const a = light.intensity * falloff * falloff * 0.82;
                    if (a > bestA) {
                        nextA = bestA;
                        nextColor = bestColor;
                        bestA = a;
                        bestColor = light.color;
                    } else if (a > nextA) {
                        nextA = a;
                        nextColor = light.color;
                    }
                }
            }

            if (hasDynamic) {
                for (const light of dynamicLights) {
                    const contribution = this.sampleLightContribution(ent.x, ent.y, light);
                    if (contribution <= bestA) {
                        if (contribution > nextA) {
                            nextA = contribution;
                            nextColor = Number.isFinite(Number(light?.color)) ? Number(light.color) : 0xffffff;
                        }
                        continue;
                    }
                    nextA = bestA;
                    nextColor = bestColor;
                    bestA = contribution;
                    bestColor = Number.isFinite(Number(light?.color)) ? Number(light.color) : 0xffffff;
                }
            }

            if (bestA > 0.02) {
                const size = Math.max(16, Math.min(54, Math.max(Number(ent.displayWidth) || 0, Number(ent.displayHeight) || 0) * 0.5 || 18));
                const blend = Phaser.Math.Clamp(nextA / Math.max(0.001, bestA + nextA), 0, 0.48);
                const mixedColor = nextA > 0.02 ? this.mixColors(bestColor, nextColor, blend) : bestColor;
                const outerAlpha = Phaser.Math.Clamp(bestA * 0.16 + nextA * 0.08, 0, 0.18);
                const innerAlpha = Phaser.Math.Clamp(bestA * 0.3 + nextA * 0.1, 0, 0.28);
                g.fillStyle(mixedColor, outerAlpha);
                g.fillCircle(sx, sy, size * 2.6);
                g.fillStyle(mixedColor, innerAlpha);
                g.fillCircle(sx, sy, size * 1.45);
            }
        }
    }

    sampleLightContribution(x, y, source) {
        if (!source) return 0;
        const kind = String(source?.kind || 'torch').toLowerCase();
        const intensity = Math.max(0.04, Number(source?.intensity) || 0.04);
        const radiusBase = Number(source?.softRadius) || Number(source?.range) || 0;
        if (radiusBase <= 0) return 0;

        const radiusMul = kind === 'flash'
            ? 1.0
            : (kind === 'spark' ? 0.9 : (kind === 'alarm' ? 0.96 : (kind === 'lamp' ? 0.92 : 0.72)));
        const radius = Math.max(24, radiusBase * radiusMul);
        const dx = x - (Number(source?.x) || 0);
        const dy = y - (Number(source?.y) || 0);
        const distSq = dx * dx + dy * dy;
        const radiusSq = radius * radius;
        if (distSq >= radiusSq) return 0;
        const dist = Math.sqrt(distSq);

        let coneFactor = 1;
        const halfAngle = Number(source?.halfAngle);
        if (Number.isFinite(halfAngle) && halfAngle < (Math.PI - 0.01)) {
            const angle = Math.atan2(dy, dx);
            const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - (Number(source?.angle) || 0)));
            const conePad = kind === 'flash' ? 0.18 : (kind === 'spot' ? 0.08 : 0.14);
            const maxCone = Math.max(0.08, halfAngle + conePad);
            if (diff > maxCone) return 0;
            coneFactor = Math.pow(1 - (diff / maxCone), 1.35);
        }

        const distFactor = 1 - (dist / radius);
        const kindMul = kind === 'flash'
            ? 0.9
            : (kind === 'spark' ? 0.55 : (kind === 'alarm' ? 0.42 : (kind === 'lamp' ? 0.5 : (kind === 'spot' ? 0.58 : 0.44))));
        return intensity * distFactor * distFactor * coneFactor * kindMul;
    }

    drawSurfaceContactLight(source, staticSegments, cam) {
        const penetration = Phaser.Math.Clamp(
            Number(this.scene?.runtimeSettings?.walls?.lightPenetrationPct ?? 0.25),
            0,
            0.8
        );
        if (penetration <= 0 || !staticSegments || staticSegments.length === 0) return;
        const kind = String(source?.kind || 'torch');
        const isFlash = kind === 'flash';
        const isSpark = kind === 'spark';
        const isSpot = kind === 'spot';
        const isTorch = kind === 'torch';
        const rawLightColor = Number.isFinite(Number(source?.color)) ? Number(source.color) : 0xffffff;
        // Wall-bounce warm color shift: light picking up surface tone on reflection
        const lightColor = isTorch ? this.mixColors(rawLightColor, 0xffe0b0, 0.18) : rawLightColor;
        const intensity = Phaser.Math.Clamp(Number(source?.intensity) || 1, 0.2, 3.6);

        const actualFps = Number(this.scene?.game?.loop?.actualFps) || 60;
        const segLimit = actualFps < 35 ? 120 : (actualFps < 48 ? 170 : 220);
        const maxSegs = Math.min(staticSegments.length, segLimit);
        const hitFraction = 0.3; // illuminate roughly 30% of the struck wall edge
        const conePad = isFlash ? 0.22 : (isSpark ? 0.34 : 0.1);
        for (let i = 0; i < maxSegs; i++) {
            const seg = staticSegments[i];
            const segDx = seg.x2 - seg.x1;
            const segDy = seg.y2 - seg.y1;
            const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
            if (segLen <= 0.001) continue;

            const hit = this.closestPointOnSegment(source.x, source.y, seg.x1, seg.y1, seg.x2, seg.y2);
            const mx = hit.x;
            const my = hit.y;
            const dx = mx - source.x;
            const dy = my - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 0.001 || dist > source.range * 1.15) continue;

            const a = Math.atan2(dy, dx);
            const diff = Math.abs(Phaser.Math.Angle.Wrap(a - source.angle));
            const maxCone = source.halfAngle + conePad;
            if (diff > maxCone) continue;

            const distFactor = Phaser.Math.Clamp(1 - (dist / (source.range * 1.15)), 0, 1);
            const coneFactor = Phaser.Math.Clamp(1 - (diff / maxCone), 0, 1);
            const alphaMul = isFlash ? 1.65 : (isSpark ? 0.66 : (isSpot ? 0.42 : (isTorch ? 0.34 : 1)));
            const alpha = penetration * 0.34 * alphaMul * intensity * distFactor * coneFactor;
            if (alpha < 0.01) continue;

            const unitX = segDx / segLen;
            const unitY = segDy / segLen;
            const litLen = Math.max(8, Math.min(segLen, segLen * hitFraction));
            const half = litLen * 0.5;
            const lx1 = mx - unitX * half;
            const ly1 = my - unitY * half;
            const lx2 = mx + unitX * half;
            const ly2 = my + unitY * half;

            const w = 1.25 + 2.1 * penetration * (isFlash ? 1.12 : 1) * distFactor;
            this.hotspotGraphics.lineStyle(w, lightColor, alpha);
            this.hotspotGraphics.beginPath();
            this.hotspotGraphics.moveTo(lx1 - cam.scrollX, ly1 - cam.scrollY);
            this.hotspotGraphics.lineTo(lx2 - cam.scrollX, ly2 - cam.scrollY);
            this.hotspotGraphics.strokePath();

            if (!isTorch) {
                this.hotspotGraphics.fillStyle(lightColor, alpha * (isFlash ? 0.2 : 0.17));
                this.hotspotGraphics.fillCircle(mx - cam.scrollX, my - cam.scrollY, 0.95 + penetration * (isFlash ? 2.3 : 1.9) * distFactor);
            }
        }
    }

    drawTerminalHotspot(source, blockingSegments, cam, entities = null) {
        const kind = String(source?.kind || 'torch').toLowerCase();
        if (kind !== 'torch') return;
        const facingCameraFactor = this.getTorchFacingCameraFactor(source.angle);

        const dirX = Math.cos(source.angle);
        const dirY = Math.sin(source.angle);
        const tipDist = Math.max(0, Number(source.range) || 0);
        if (tipDist <= 0.001) return;

        // Use mouse-cursor-driven target distance when available (leader torch
        // tracks pointer position, capped at max range). Followers use full range.
        const cursorDist = Math.max(0, Number(source.targetDist) || tipDist);

        const hit = this.findFirstBlockingHit(source, blockingSegments);
        const wallDist = hit ? Math.min(hit.dist, cursorDist) : cursorDist;

        // If the beam passes over a visible alien, shorten the terminus to halfway
        // between the entity and the wall/beam-end. Alien is also instantly revealed.
        const entityDist = this._findNearestEntityInBeam(source, wallDist, entities);
        let terminalDist = wallDist;
        if (entityDist < wallDist) {
            terminalDist = entityDist + (wallDist - entityDist) * 0.5;
        }
        const terminalX = source.x + dirX * terminalDist;
        const terminalY = source.y + dirY * terminalDist;

        const mediumRatio = 2.4;
        const baseMajor = Phaser.Math.Clamp(tipDist * 0.22, 44, 128);
        const baseMinor = baseMajor / mediumRatio;
        const coreAlpha = Phaser.Math.Clamp(
            (Number(this.tuning.coreAlpha) || CONFIG.TORCH_CORE_ALPHA) * 3.0 * TORCH_ENDPOINT_BRIGHTNESS_SCALE,
            0,
            1
        );
        if (hit && hit.dist <= cursorDist) {
            const segDx = (hit.seg?.x2 ?? 0) - (hit.seg?.x1 ?? 0);
            const segDy = (hit.seg?.y2 ?? 0) - (hit.seg?.y1 ?? 0);
            const segLen = Math.max(0.001, Math.hypot(segDx, segDy));
            const horizontalWall = Math.abs(segDx) >= Math.abs(segDy);
            const wallAngle = horizontalWall ? 0 : (Math.PI * 0.5);
            // Wall beam is narrower than floor — torch hitting a vertical
            // surface produces a tighter, more compressed spot compared to
            // the wide floor ellipse.  ~40% smaller than the floor hotspot.
            const wallMajor = baseMajor * 0.64;
            const cornerThreshold = 18;
            const dEnd1 = Math.hypot((hit.x - (hit.seg?.x1 ?? hit.x)), (hit.y - (hit.seg?.y1 ?? hit.y)));
            const dEnd2 = Math.hypot((hit.x - (hit.seg?.x2 ?? hit.x)), (hit.y - (hit.seg?.y2 ?? hit.y)));
            const nearestEnd = Math.min(dEnd1, dEnd2);
            const cornerBlend = Phaser.Math.Clamp(1 - (nearestEnd / cornerThreshold), 0, 1);
            const wallMinor = Phaser.Math.Linear(1.6, 3.0, cornerBlend);
            this.drawWallEdgeHighlight(hit, wallAngle, coreAlpha, cam);
            // Restore masked wall/object impact ellipse at beam intersection.
            const impactCenter = this.getWallImpactCenter(hit, source, WALL_IMPACT_INSET_PX);
            const maskRect = this.getImpactMaskRect(hit, impactCenter);
            if (maskRect) {
                this.drawWallImpactSprite(
                    impactCenter.x,
                    impactCenter.y,
                    wallAngle,
                    wallMajor,
                    wallMinor,
                    Phaser.Math.Clamp(coreAlpha * 0.42, 0.06, 0.34),
                    maskRect,
                    cam
                );
            }

            // Illuminate up to 50% of the hit surface, fading out from the
            // beam strike point toward the segment endpoints.
            const ux = segDx / segLen;
            const uy = segDy / segLen;
            const litHalf = segLen * 0.25; // 25% each side = 50% total
            const surfaceSteps = this.qualityTier >= 2 ? 3 : 5;
            const distFactor = Phaser.Math.Clamp(1 - (hit.dist / tipDist), 0.15, 1);
            for (let s = 0; s < surfaceSteps; s++) {
                const t = (s + 1) / surfaceSteps;
                const fadeAlpha = (1 - t) * (1 - t); // quadratic fade-out
                const stepDist = litHalf * t;
                const alpha = Phaser.Math.Clamp(coreAlpha * 0.22 * fadeAlpha * distFactor, 0, 0.18);
                if (alpha < 0.005) continue;
                // Draw illumination stroke on both sides of the hit point
                const w = Phaser.Math.Linear(1.8, 0.6, t);
                this.hotspotGraphics.lineStyle(w, 0xd8ebff, alpha);
                this.hotspotGraphics.beginPath();
                this.hotspotGraphics.moveTo(
                    hit.x + ux * stepDist * 0.9 - cam.scrollX,
                    hit.y + uy * stepDist * 0.9 - cam.scrollY
                );
                this.hotspotGraphics.lineTo(
                    hit.x + ux * stepDist - cam.scrollX,
                    hit.y + uy * stepDist - cam.scrollY
                );
                this.hotspotGraphics.strokePath();
                this.hotspotGraphics.beginPath();
                this.hotspotGraphics.moveTo(
                    hit.x - ux * stepDist * 0.9 - cam.scrollX,
                    hit.y - uy * stepDist * 0.9 - cam.scrollY
                );
                this.hotspotGraphics.lineTo(
                    hit.x - ux * stepDist - cam.scrollX,
                    hit.y - uy * stepDist - cam.scrollY
                );
                this.hotspotGraphics.strokePath();
            }
        }

        // Floor endpoint remains beam-like and fades out as the marine closes on blocking geometry.
        // Proximity scale: shrinks the ellipse by ~50% when the terminus is very close to the
        // player (distRatio ≈ 0), scaling back up to full size at max range (distRatio ≈ 1).
        const distRatio = tipDist > 0.001 ? Phaser.Math.Clamp(terminalDist / tipDist, 0, 1) : 0;
        const proximityScale = Phaser.Math.Linear(0.5, 1.0, distRatio);
        const floorMajor = baseMajor * 1.06 * proximityScale;
        const floorMinor = baseMinor * proximityScale;
        const wallProximityFade = hit
            ? Phaser.Math.Clamp(
                (hit.dist - FLOOR_FADE_NEAR_WALL_PX) / (FLOOR_FADE_FAR_WALL_PX - FLOOR_FADE_NEAR_WALL_PX),
                0,
                1
            )
            : 1;
        const floorPresence = hit ? wallProximityFade : 1;
        // Distance-based brightness: floor hotspot is boosted when close to the marine
        // and fades to ~50% at maximum range.  Wall-hit case is handled separately by
        // wallProximityFade which zeros out the floor ellipse before this matters.
        const distanceFade = Phaser.Math.Linear(1.3, 0.5, distRatio);
        if (floorPresence > 0.01) {
            const floorCoreAlpha = coreAlpha * TORCH_FLOOR_ENDPOINT_BRIGHTNESS_SCALE * floorPresence * distanceFade;
            this.drawTorchFloorHotspotShape(
                terminalX,
                terminalY,
                source.angle,
                floorMajor,
                floorMinor,
                floorCoreAlpha,
                cam,
                this.lightGraphics
            );

            // Circular hotspot texture at beam terminus — more prominent than the old ellipse.
            // Use same radius for both axes so the OGA incandescent circle isn't squished.
            const hotspotR = floorMajor * 1.25;
            this.drawTorchTipTexture(
                terminalX,
                terminalY,
                source.angle,
                hotspotR,
                hotspotR,   // circular, not elongated
                Phaser.Math.Clamp(floorCoreAlpha * 0.72, 0.12, 0.55),
                cam
            );
            this.drawTorchEndpointFlare(
                terminalX,
                terminalY,
                source.angle,
                floorMajor,
                floorMinor,
                Phaser.Math.Clamp(floorCoreAlpha * 0.058, 0.009, 0.034),
                facingCameraFactor,
                cam
            );
        }
    }

    getTorchFacingCameraFactor(angle) {
        // In screen space, +Y points downward (toward camera perspective in this game).
        const facingY = Math.sin(Number(angle) || 0);
        return Phaser.Math.Clamp((facingY - TORCH_CAMERA_FACING_MIN) / (1 - TORCH_CAMERA_FACING_MIN), 0, 1);
    }

    getWallImpactCenter(hit, source, insetPx) {
        const segDx = (hit.seg?.x2 ?? 0) - (hit.seg?.x1 ?? 0);
        const segDy = (hit.seg?.y2 ?? 0) - (hit.seg?.y1 ?? 0);
        const segLen = Math.max(0.0001, Math.hypot(segDx, segDy));
        let nx = -segDy / segLen;
        let ny = segDx / segLen;
        const sample = 5;
        const plusBlocked = this.isPointBlocking(hit.x + nx * sample, hit.y + ny * sample);
        const minusBlocked = this.isPointBlocking(hit.x - nx * sample, hit.y - ny * sample);
        if (plusBlocked !== minusBlocked) {
            if (!plusBlocked) {
                nx *= -1;
                ny *= -1;
            }
        } else {
            const toSourceX = source.x - hit.x;
            const toSourceY = source.y - hit.y;
            if ((nx * toSourceX + ny * toSourceY) > 0) {
                nx *= -1;
                ny *= -1;
            }
        }
        return {
            x: hit.x + nx * insetPx,
            y: hit.y + ny * insetPx,
            maskProbeX: hit.x + nx * (insetPx + 3),
            maskProbeY: hit.y + ny * (insetPx + 3),
        };
    }

    getImpactMaskRect(hit, impactCenter) {
        if (hit?.seg?.maskRect) return hit.seg.maskRect;
        const probeX = Number(impactCenter?.maskProbeX);
        const probeY = Number(impactCenter?.maskProbeY);
        if (!Number.isFinite(probeX) || !Number.isFinite(probeY)) return null;
        const tx = Math.floor(probeX / CONFIG.TILE_SIZE);
        const ty = Math.floor(probeY / CONFIG.TILE_SIZE);
        if (!this.lightBlockerGrid || typeof this.lightBlockerGrid.isBlocking !== 'function') return null;
        if (!this.lightBlockerGrid.isBlocking(tx, ty)) return null;
        return {
            x: tx * CONFIG.TILE_SIZE,
            y: ty * CONFIG.TILE_SIZE,
            w: CONFIG.TILE_SIZE,
            h: CONFIG.TILE_SIZE,
        };
    }

    isPointBlocking(worldX, worldY) {
        const tx = Math.floor(worldX / CONFIG.TILE_SIZE);
        const ty = Math.floor(worldY / CONFIG.TILE_SIZE);
        if (!this.lightBlockerGrid || typeof this.lightBlockerGrid.isBlocking !== 'function') return false;
        return this.lightBlockerGrid.isBlocking(tx, ty) === true;
    }

    drawWallEdgeHighlight(hit, wallAngle, coreAlpha, cam) {
        if (!hit?.seg) return;
        const segDx = (hit.seg.x2 ?? 0) - (hit.seg.x1 ?? 0);
        const segDy = (hit.seg.y2 ?? 0) - (hit.seg.y1 ?? 0);
        const segLen = Math.max(0.001, Math.hypot(segDx, segDy));
        const ux = segDx / segLen;
        const uy = segDy / segLen;
        const half = Math.min(10, segLen * 0.24);
        const x1 = hit.x - ux * half;
        const y1 = hit.y - uy * half;
        const x2 = hit.x + ux * half;
        const y2 = hit.y + uy * half;
        const alpha = Phaser.Math.Clamp(coreAlpha * 0.26, 0.04, 0.18);
        this.hotspotGraphics.lineStyle(1.15, 0xd5e8f8, alpha);
        this.hotspotGraphics.beginPath();
        this.hotspotGraphics.moveTo(x1 - cam.scrollX, y1 - cam.scrollY);
        this.hotspotGraphics.lineTo(x2 - cam.scrollX, y2 - cam.scrollY);
        this.hotspotGraphics.strokePath();
        this.hotspotGraphics.lineStyle(0.8, 0xffffff, alpha * 0.48);
        this.hotspotGraphics.beginPath();
        this.hotspotGraphics.moveTo(hit.x - cam.scrollX - Math.cos(wallAngle) * 1.8, hit.y - cam.scrollY - Math.sin(wallAngle) * 1.8);
        this.hotspotGraphics.lineTo(hit.x - cam.scrollX + Math.cos(wallAngle) * 1.8, hit.y - cam.scrollY + Math.sin(wallAngle) * 1.8);
        this.hotspotGraphics.strokePath();
    }

    drawWallImpactSprite(worldX, worldY, angle, majorRadius, minorRadius, alpha, maskRectWorld, cam) {
        if (!this.wallImpactTextureKey) return;
        const sprite = this.getWallImpactSprite();
        const tex = this.scene.textures.get(this.wallImpactTextureKey);
        const frame = tex ? tex.get() : null;
        const texW = Math.max(1, Number(frame?.width) || 128);
        const texH = Math.max(1, Number(frame?.height) || 80);
        sprite.setVisible(true);
        sprite.setPosition(worldX - cam.scrollX, worldY - cam.scrollY);
        sprite.setRotation(angle);
        sprite.setScale((majorRadius * 2) / texW, (Math.max(2.2, minorRadius * 2)) / texH);
        sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));
        sprite.setTint(0xd8ebff);
        this.applyWallImpactMask(sprite, maskRectWorld, cam);
    }

    applyWallImpactMask(sprite, maskRectWorld, cam) {
        const mg = sprite._impactMaskGraphics;
        if (!mg) return;
        mg.clear();
        if (!maskRectWorld || !Number.isFinite(maskRectWorld.x) || !Number.isFinite(maskRectWorld.y)) {
            if (sprite._impactMask) sprite.clearMask();
            return;
        }
        const x = maskRectWorld.x - cam.scrollX;
        const y = maskRectWorld.y - cam.scrollY;
        const w = Math.max(1, Number(maskRectWorld.w) || CONFIG.TILE_SIZE);
        const h = Math.max(1, Number(maskRectWorld.h) || CONFIG.TILE_SIZE);
        mg.fillStyle(0xffffff, 1);
        mg.fillRect(x, y, w, h);
        if (sprite._impactMask) sprite.setMask(sprite._impactMask);
    }

    getWallImpactSprite() {
        const idx = this.activeWallImpactCount++;
        if (!this.wallImpactPool[idx]) {
            const sprite = this.scene.add.image(0, 0, this.wallImpactTextureKey);
            sprite.setDepth(WORLD_LIGHT_ADDITIVE_DEPTH + 0.08);
            sprite.setScrollFactor(0);
            sprite.setBlendMode(Phaser.BlendModes.ADD);
            sprite.setVisible(false);
            const maskGraphics = this.scene.add.graphics();
            maskGraphics.setScrollFactor(0);
            maskGraphics.setVisible(false);
            sprite._impactMaskGraphics = maskGraphics;
            sprite._impactMask = maskGraphics.createGeometryMask();
            sprite.setMask(sprite._impactMask);
            this.wallImpactPool[idx] = sprite;
        }
        return this.wallImpactPool[idx];
    }

    hideWallImpactSprites() {
        this.activeWallImpactCount = 0;
        for (const sprite of this.wallImpactPool) {
            if (sprite) {
                sprite.setVisible(false);
                if (sprite._impactMaskGraphics) sprite._impactMaskGraphics.clear();
            }
        }
    }

    drawTorchTipTexture(worldX, worldY, angle, majorRadius, minorRadius, alpha, cam) {
        if (!this.torchTipTextureKey) return;
        const sprite = this.getTorchTipSprite();
        const tex = this.scene.textures.get(this.torchTipTextureKey);
        const frame = tex ? tex.get() : null;
        const texW = Math.max(1, Number(frame?.width) || 128);
        const texH = Math.max(1, Number(frame?.height) || 80);
        sprite.setVisible(true);
        sprite.setPosition(worldX - cam.scrollX, worldY - cam.scrollY);
        sprite.setRotation(angle);
        sprite.setScale((majorRadius * 2) / texW, (minorRadius * 2) / texH);
        sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));
    }

    getTorchTipSprite() {
        const idx = this.activeTorchTipCount++;
        if (!this.torchTipPool[idx]) {
            const sprite = this.scene.add.image(0, 0, this.torchTipTextureKey);
            sprite.setDepth(WORLD_LIGHT_ADDITIVE_DEPTH + 0.2);
            sprite.setScrollFactor(0);
            sprite.setBlendMode(Phaser.BlendModes.ADD);
            sprite.setTint(0xfff4d0);   // warm incandescent colour
            sprite.setVisible(false);
            this.torchTipPool[idx] = sprite;
        }
        return this.torchTipPool[idx];
    }

    hideTorchTipSprites() {
        this.activeTorchTipCount = 0;
        for (const sprite of this.torchTipPool) {
            if (sprite) sprite.setVisible(false);
        }
    }

    drawTorchEndpointFlare(worldX, worldY, angle, majorRadius, minorRadius, alpha, facingCameraFactor, cam) {
        if (!this.torchFlareTextureKey) return;
        const facing = Phaser.Math.Clamp(Number(facingCameraFactor) || 0, 0, 1);
        if (facing <= 0.01) return;
        const now = Number(this.scene?.time?.now) || 0;
        const phase = (worldX * 0.011) + (worldY * 0.007);
        const pulse = 0.88 + 0.12 * Math.sin(now * 0.0058 + phase);
        const alphaBoost = Phaser.Math.Linear(0.65, 1.7, facing);
        const alphaCap = TORCH_FLARE_ALPHA_MAX * Phaser.Math.Linear(0.65, 1.25, facing);
        const baseAlpha = Phaser.Math.Clamp(alpha * pulse * alphaBoost, 0, alphaCap);
        if (baseAlpha <= 0.002) return;

        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const sizeMul = Phaser.Math.Linear(0.84, 1.28, facing);
        this.paintTorchFlareSprite(
            worldX,
            worldY,
            angle,
            majorRadius * 0.58 * sizeMul,
            Math.max(4, minorRadius * 0.2 * sizeMul),
            baseAlpha,
            0xc9e6ff,
            cam
        );

        const ghostOffset = Math.max(8, majorRadius * 0.2);
        this.paintTorchFlareSprite(
            worldX - dirX * ghostOffset,
            worldY - dirY * ghostOffset,
            angle,
            majorRadius * 0.34 * sizeMul,
            Math.max(3, minorRadius * 0.14 * sizeMul),
            Phaser.Math.Clamp(baseAlpha * 0.42, 0, 0.03),
            0x98bfff,
            cam
        );
    }

    drawTorchSourceLensFlare(source, cam) {
        if (source?.skipTorchLensFlare) return;
        const kind = String(source?.kind || 'torch').toLowerCase();
        if (kind !== 'torch') return;
        const facingRaw = this.getTorchFacingCameraFactor(source.angle);
        // Keep flare visible at all aim angles; still brightest when aiming down/forward.
        const facing = Phaser.Math.Clamp(0.22 + (facingRaw * 0.78), 0, 1);
        const muzzleX = Number.isFinite(Number(source?.muzzleX)) ? Number(source.muzzleX) : Number(source.x) || 0;
        const muzzleY = Number.isFinite(Number(source?.muzzleY)) ? Number(source.muzzleY) : Number(source.y) || 0;
        const shoulderX = Number.isFinite(Number(source?.shoulderX)) ? Number(source.shoulderX) : muzzleX;
        const shoulderY = Number.isFinite(Number(source?.shoulderY)) ? Number(source.shoulderY) : muzzleY;
        const lensBaseAngle = Number.isFinite(Number(source?.muzzleAngle)) ? Number(source.muzzleAngle) : (Number(source.angle) || 0);
        const lensAngle = lensBaseAngle + (Number(source.flareAngleBias) || 0);
        const now = Number(this.scene?.time?.now) || 0;
        const pulse = 0.84 + 0.16 * Math.sin(now * 0.007 + (source.x + source.y) * 0.003);
        const muzzleFlash = Phaser.Math.Clamp(Number(source?.muzzleFlash) || 0, 0, 1);
        const forwardPointerBoost = Phaser.Math.Clamp(Number(source?.forwardPointerBoost) || 0, 0, 1);
        const forwardBrightnessMul = Phaser.Math.Linear(1, 3.8, forwardPointerBoost);
        // Shoulder-core source should stay steady; weapon fire only affects outer transient ghosts.
        let alpha = Phaser.Math.Clamp((0.05 + facing * 0.14) * forwardBrightnessMul, 0.08, 0.95) * pulse;
        if (alpha <= 0.003) return;
        const flareSizeScale = 0.7; // ~30% smaller overall shoulder flare footprint.
        const major = Phaser.Math.Linear(28, 56, facing) * Phaser.Math.Linear(1, 1.92, forwardPointerBoost) * flareSizeScale;
        const minor = Phaser.Math.Linear(10, 20, facing) * Phaser.Math.Linear(1, 1.58, forwardPointerBoost) * flareSizeScale;
        // Source flare reads better at shoulder level; beam/muzzle logic stays unchanged.
        const shoulderForward = 0;
        const fx = shoulderX + Math.cos(lensAngle) * shoulderForward;
        const fy = shoulderY + Math.sin(lensAngle) * shoulderForward;
        const sx = fx - cam.scrollX;
        const sy = fy - cam.scrollY;
        const lateralAim = Phaser.Math.Clamp(Math.abs(Math.cos(lensAngle)), 0, 1);
        const offCenterX = Phaser.Math.Clamp(Math.abs((sx - CONFIG.GAME_WIDTH * 0.5) / (CONFIG.GAME_WIDTH * 0.5)), 0, 1);
        const aberration = Phaser.Math.Clamp(Math.max(lateralAim, offCenterX), 0, 1);
        const splitSign = Math.cos(lensAngle) >= 0 ? 1 : -1;
        const splitPx = Phaser.Math.Linear(12, CONFIG.GAME_WIDTH * 0.28, aberration);
        const muzzleColor = this.getTorchMuzzleColor(source, 0xe8f6ff);
        const warmColor = this.mixColors(muzzleColor, 0xffa36b, 0.52);
        const coolColor = this.mixColors(muzzleColor, 0x88d8ff, 0.46);
        const ghostHotColor = this.mixColors(warmColor, 0xffc19a, 0.45);
        const ghostCoolColor = this.mixColors(coolColor, 0xa8ecff, 0.45);

        if (this.torchFlareTextureKey) {
            this.paintTorchFlareSprite(
                fx,
                fy,
                lensAngle,
                major,
                minor,
                alpha,
                muzzleColor,
                cam
            );
            // Chromatic split ghosts become stronger as aim moves to far left/right.
            this.paintTorchFlareSprite(
                fx + splitPx * splitSign,
                fy,
                lensAngle,
                major * 0.55,
                minor * 0.82,
                alpha * Phaser.Math.Linear(0.08, 0.34, aberration),
                ghostHotColor,
                cam
            );
            this.paintTorchFlareSprite(
                fx - splitPx * splitSign,
                fy,
                lensAngle,
                major * 0.55,
                minor * 0.82,
                alpha * Phaser.Math.Linear(0.08, 0.36, aberration),
                ghostCoolColor,
                cam
            );
        }

        // Hard fallback: additive vector flare so visibility does not depend on texture/sprite state.
        const glowR = Phaser.Math.Linear(12, 26, facing) * Phaser.Math.Linear(1, 1.28, forwardPointerBoost) * flareSizeScale;
        this.torchLensGraphics.fillStyle(coolColor, Phaser.Math.Clamp((0.08 + facing * 0.14) * Phaser.Math.Linear(1, 3, forwardPointerBoost), 0.06, 0.82) * pulse);
        this.torchLensGraphics.fillCircle(sx, sy, glowR);
        this.torchLensGraphics.fillStyle(this.mixColors(coolColor, 0xb7e6ff, 0.4), Phaser.Math.Clamp((0.04 + facing * 0.08) * Phaser.Math.Linear(1, 2.1, forwardPointerBoost), 0.03, 0.4) * pulse);
        this.torchLensGraphics.fillCircle(sx, sy, glowR * 1.55);
        this.torchLensGraphics.lineStyle(2.4, muzzleColor, Phaser.Math.Clamp((0.09 + facing * 0.18) * Phaser.Math.Linear(1, 2.5, forwardPointerBoost), 0.08, 0.78) * pulse);
        this.torchLensGraphics.beginPath();
        this.torchLensGraphics.moveTo(
            sx - Math.cos(lensAngle) * glowR * 1.4,
            sy - Math.sin(lensAngle) * glowR * 1.4
        );
        this.torchLensGraphics.lineTo(
            sx + Math.cos(lensAngle) * glowR * 1.8,
            sy + Math.sin(lensAngle) * glowR * 1.8
        );
        this.torchLensGraphics.strokePath();
        // Tightened source-core treatment: tiny ring + short cross to mimic a sharper lens response.
        // Core is intentionally half-size while keeping the outer halo strength.
        const coreR = glowR * 0.25;
        const coreAlpha = Phaser.Math.Clamp((0.11 + facing * 0.26) * Phaser.Math.Linear(1, 2.8, forwardPointerBoost), 0.08, 0.95) * pulse;
        this.torchLensGraphics.lineStyle(1.2, this.mixColors(muzzleColor, 0xffffff, 0.38), coreAlpha);
        this.torchLensGraphics.strokeCircle(sx, sy, coreR);
        const crossLen = coreR * 1.28;
        const crossAngle = lensAngle + Math.PI * 0.5;
        this.torchLensGraphics.lineStyle(1, this.mixColors(muzzleColor, 0xbfe5ff, 0.46), coreAlpha * 0.88);
        this.torchLensGraphics.beginPath();
        this.torchLensGraphics.moveTo(
            sx - Math.cos(crossAngle) * crossLen,
            sy - Math.sin(crossAngle) * crossLen
        );
        this.torchLensGraphics.lineTo(
            sx + Math.cos(crossAngle) * crossLen,
            sy + Math.sin(crossAngle) * crossLen
        );
        this.torchLensGraphics.strokePath();
        this.drawLinearScreenLensFlares(
            sx,
            sy,
            glowR,
            lensAngle,
            now,
            facing,
            forwardPointerBoost,
            muzzleFlash,
            coolColor,
            warmColor,
            source
        );

        // Lens ghosts: adaptive quality based on FPS
        const actualFps = Number(this.scene?.game?.loop?.actualFps) || 60;
        if (actualFps < 38) return; // Skip all ghosts when FPS critically low
        const ghostQuality = actualFps < 48 ? 0.5 : 1; // Reduce ghost count at low FPS
        // - Total count halved (8 total): 4 circles + 4 hexes.
        // - Below ~50% separation they fade down.
        // - From 50% outward they grow larger and slightly brighter.
        const sepBeyondMid = Phaser.Math.Clamp((aberration - 0.5) / 0.5, 0, 1);
        const sepToMid = Phaser.Math.Clamp(aberration / 0.5, 0, 1);
        const closeFade = aberration < 0.5
            ? Phaser.Math.Linear(0.18, 0.55, sepToMid)
            : Phaser.Math.Linear(0.55, 1.18, sepBeyondMid);
        const sizeGain = aberration < 0.5
            ? Phaser.Math.Linear(0.72, 1.0, sepToMid)
            : Phaser.Math.Linear(1.0, 1.72, sepBeyondMid);
        const ghostSep = Phaser.Math.Linear(18, CONFIG.GAME_WIDTH * 0.28, aberration) * Phaser.Math.Linear(0.9, 1.24, sepBeyondMid);
        const ghostBaseAlpha = Phaser.Math.Linear(0.016, 0.044, aberration) * pulse * closeFade * Phaser.Math.Linear(0.32, 1.3, muzzleFlash) * Phaser.Math.Linear(1, 2.2, forwardPointerBoost);
        const chromaPx = Phaser.Math.Linear(1.2, 13.5, sepBeyondMid) * (1 + muzzleFlash * 0.64);
        const chromaAlpha = Phaser.Math.Linear(0.024, 0.19, sepBeyondMid) * (1 + muzzleFlash * 0.62);

        const nearCircleR = Phaser.Math.Linear(10.4, 22.5, aberration) * sizeGain;
        const farCircleR = nearCircleR * Phaser.Math.Linear(1.25, 1.54, sepBeyondMid);
        const nearHexR = Phaser.Math.Linear(10.8, 23.5, aberration) * sizeGain;
        const farHexR = nearHexR * Phaser.Math.Linear(1.28, 1.58, sepBeyondMid);
        const rightSideY = sy - Phaser.Math.Linear(4, 20, aberration);
        const leftSideY = sy + Phaser.Math.Linear(8, 30, aberration);
        const rotBase = lensAngle * 1.35 + (Number(source.flareAngleBias) || 0) * 3.2;

        // Right side: near circle + near hex, far circle + far hex.
        const rightX = sx + ghostSep * splitSign;
        const leftX = sx - ghostSep * splitSign;
        const rightFarX = sx + ghostSep * 2.35 * splitSign;
        const leftFarX = sx - ghostSep * 2.35 * splitSign;

        if (facing >= 0.16) {
            this.drawLensCircleGhost(rightX, rightSideY + 1, nearCircleR, ghostCoolColor, ghostBaseAlpha * 0.92);
            this.drawLensHexGhost(rightX + ghostSep * 0.94 * splitSign, rightSideY + 0.3, nearHexR, this.mixColors(coolColor, 0x6bc8ff, 0.4), ghostBaseAlpha * 0.88, rotBase * 0.72 + 0.24, 0.8);
            if (ghostQuality >= 1) {
                this.drawLensCircleGhost(rightFarX, rightSideY + 1.3, farCircleR, this.mixColors(coolColor, 0x9de4ff, 0.34), ghostBaseAlpha * 0.82);
                this.drawLensHexGhost(rightFarX + ghostSep * 1.05 * splitSign, rightSideY + 0.5, farHexR, this.mixColors(coolColor, 0x68d6ff, 0.48), ghostBaseAlpha * 0.74, rotBase * 1.16 + 1.08, 0.64);
            }

            // Left side: near circle + near hex, far circle + far hex.
            this.drawLensCircleGhost(leftX, leftSideY - 1, nearCircleR * 0.98, ghostHotColor, ghostBaseAlpha * 0.9);
            this.drawLensHexGhost(leftX - ghostSep * 0.94 * splitSign, leftSideY - 0.25, nearHexR * 0.98, this.mixColors(warmColor, 0xff8fad, 0.46), ghostBaseAlpha * 0.86, rotBase * 0.76 + 0.38, 0.8);
            if (ghostQuality >= 1) {
                this.drawLensCircleGhost(leftFarX, leftSideY - 1.1, farCircleR * 0.98, this.mixColors(warmColor, 0xffa6b8, 0.34), ghostBaseAlpha * 0.8);
                this.drawLensHexGhost(leftFarX - ghostSep * 1.05 * splitSign, leftSideY - 0.45, farHexR * 0.98, this.mixColors(warmColor, 0xff7ea3, 0.5), ghostBaseAlpha * 0.72, rotBase * 1.22 + 1.34, 0.64);
            }
        }

        // Weapon-fire tint pass on top of the regular torch lens flare.
        // This keeps one flare system and momentarily shifts it warmer during bursts.
        if (muzzleFlash > 0.03) {
            const boostMul = Phaser.Math.Linear(0.16, 0.76, muzzleFlash);
            const boostSep = ghostSep * Phaser.Math.Linear(0.86, 1.18, muzzleFlash);
            const boostHexR = nearHexR * Phaser.Math.Linear(0.86, 1.18, muzzleFlash);
            const boostCircleR = nearCircleR * Phaser.Math.Linear(0.84, 1.16, muzzleFlash);
            const boostA = ghostBaseAlpha * boostMul;
            this.drawLensHexGhost(sx + boostSep * splitSign, sy - 6, boostHexR, coolColor, boostA * 1.02, rotBase * 0.8 + 0.12, 0.7);
            this.drawLensHexGhost(sx - boostSep * splitSign, sy + 7, boostHexR * 0.95, warmColor, boostA * 0.94, rotBase * 1.12 + 0.9, 0.66);
            this.drawLensHexGhost(sx + boostSep * 1.62 * splitSign, sy - 11, boostHexR * 1.02, this.mixColors(muzzleColor, 0xffbb7a, 0.3), boostA * 0.74, rotBase * 1.34 + 1.14, 0.62);
            this.drawLensHexGhost(sx - boostSep * 1.76 * splitSign, sy + 12, boostHexR * 1.04, this.mixColors(coolColor, 0x8fddff, 0.32), boostA * 0.72, rotBase * 1.46 + 0.28, 0.64);
            this.drawLensCircleGhost(sx - boostSep * 1.62 * splitSign, sy + 12, boostCircleR * 1.02, ghostCoolColor, boostA * 0.7);
        }

        // Chromatic aberration: increases with separation.
        if (facing >= 0.16 && chromaAlpha > 0.005) {
            const cShift = chromaPx * splitSign;
            const cMul = chromaAlpha;
            const cA = 0xff6fa8;
            const cB = 0x6fd8ff;
            this.drawLensCircleGhost(rightX + cShift, rightSideY + 1, nearCircleR * 1.02, cA, ghostBaseAlpha * cMul);
            this.drawLensCircleGhost(rightX - cShift, rightSideY + 1, nearCircleR * 1.02, cB, ghostBaseAlpha * cMul);
            this.drawLensHexGhost(rightFarX + cShift, rightSideY + 1.3, farHexR * 1.02, cA, ghostBaseAlpha * cMul, rotBase * 1.2 + 0.72, 0.62);
            this.drawLensHexGhost(rightFarX - cShift, rightSideY + 1.3, farHexR * 1.02, cB, ghostBaseAlpha * cMul, rotBase * 1.2 + 0.72, 0.62);

            this.drawLensCircleGhost(leftX - cShift, leftSideY - 1, nearCircleR, cA, ghostBaseAlpha * cMul);
            this.drawLensCircleGhost(leftX + cShift, leftSideY - 1, nearCircleR, cB, ghostBaseAlpha * cMul);
            this.drawLensHexGhost(leftFarX - cShift, leftSideY - 1.1, farHexR, cA, ghostBaseAlpha * cMul, rotBase * 1.26 + 0.88, 0.62);
            this.drawLensHexGhost(leftFarX + cShift, leftSideY - 1.1, farHexR, cB, ghostBaseAlpha * cMul, rotBase * 1.26 + 0.88, 0.62);
        }
    }

    drawLinearScreenLensFlares(sx, sy, glowR, lensAngle, now, facing, forwardPointerBoost, muzzleFlash, coolColor, warmColor, source = null) {
        const pointer = this.scene?.input?.activePointer;
        if (!pointer) return;
        const px = Number(pointer.x) || sx;
        const py = Number(pointer.y) || sy;
        const minDim = Math.min(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
        const isLeader = source?.isLeader === true;
        const lowFxMode = this.lowFxMode === true;
        if (lowFxMode && !isLeader && muzzleFlash < 0.05) return;
        const screenCenterX = CONFIG.GAME_WIDTH * 0.5;
        const screenCenterY = CONFIG.GAME_HEIGHT * 0.5;
        const edgeX = Phaser.Math.Clamp(Math.abs(px - screenCenterX) / (CONFIG.GAME_WIDTH * 0.5), 0, 1);
        // Spread driver is horizontal-only: vertical mouse movement should not fan flares out.
        const edgeFactor = edgeX;

        // Soft vertical gate: fades smoothly above the marine instead of hard cut.
        const verticalSoftStart = minDim * 0.18;
        const verticalSoftSpan = minDim * 0.34;
        const belowFactor = Phaser.Math.Clamp((py - sy + verticalSoftStart) / verticalSoftSpan, 0, 1);
        if (isLeader && belowFactor <= 0.003) return;

        // Close-to-marine suppression: invisible inside ~20% of min screen dimension.
        const distToMarine = Math.abs(px - sx);
        const nearCutoff = minDim * 0.2;
        const farRamp = minDim * 0.48;
        const distFactor = Phaser.Math.Clamp((distToMarine - nearCutoff) / farRamp, 0, 1);
        // Followers are quieter and require both edge intent and local pointer relevance.
        const followerEdgeGate = isLeader ? 1 : 1;
        const followerDistGate = isLeader ? 1 : 1;
        const pointerForwardGate = 1;
        const followerVisibility = Phaser.Math.Clamp((0.28 + facing * 0.52 + muzzleFlash * 0.4) * (0.72 + forwardPointerBoost * 0.35), 0.16, 1);
        const visibility = isLeader
            ? distFactor * belowFactor * followerEdgeGate * followerDistGate * pointerForwardGate
            : followerVisibility;
        if (visibility <= 0.01) return;

        // Slight anti-clockwise bias with delayed/lagged source angle from scene input processing.
        const anticlockwiseBias = Phaser.Math.DegToRad(-10);
        const lineAngle = (Number(source?.flareLagAngle) || Number(source?.flareAngleBase) || 0) + anticlockwiseBias;
        const dirX = Math.cos(lineAngle);
        const dirY = Math.sin(lineAngle);
        const nX = -dirY;
        const nY = dirX;
        const lineShiftY = Number(source?.flareVerticalShift) || 0;
        // Flare-space center is the marine/player, not mouse location.
        const lineOriginX = sx;
        const lineOriginY = sy + lineShiftY;

        const strength = Phaser.Math.Clamp(visibility * Phaser.Math.Linear(0.9, 1.2, forwardPointerBoost), 0, 1.2);
        const spreadScale = 1.3; // ~30% bigger overall spread/size footprint.
        const sepBase = Phaser.Math.Linear(CONFIG.GAME_WIDTH * 0.05, CONFIG.GAME_WIDTH * 0.52, strength) * spreadScale;
        const sepMul = Phaser.Math.Linear(0.7, 1.3, strength);
        const edgeSizeMul = Phaser.Math.Linear(1, 1.5, edgeFactor);
        const pairSize = Phaser.Math.Clamp(glowR * Phaser.Math.Linear(0.22, 1.72, strength) * spreadScale * edgeSizeMul, 2.5, 70);
        const pairAlphaBase = Phaser.Math.Clamp((0.04 + 0.26 * facing) * (0.88 + muzzleFlash * 0.2), 0.04, 0.42);
        const alphaRoleMul = isLeader ? 1 : 0.5;
        const pairAlpha = Phaser.Math.Clamp(pairAlphaBase * Phaser.Math.Linear(0.1, 1.5, strength) * alphaRoleMul * 0.5, 0.01, 0.7);
        const overlap = pairSize * Phaser.Math.Linear(0.26, 0.44, strength);
        const chromaSep = Phaser.Math.Linear(0.8, lowFxMode ? 7.8 : 13.4, strength);
        const pairMode = Number(source?.flarePairMode) || 0;
        const groupSteps = lowFxMode ? [0.64, 1.0] : [0.42, 0.72, 1.0];
        const spinSlow = lineAngle + now * 0.00008;

        for (const side of [-1, 1]) {
            for (let gi = 0; gi < groupSteps.length; gi++) {
                const groupDist = sepBase * sepMul * groupSteps[gi] * side;
                const gx = lineOriginX + dirX * groupDist;
                const gy = lineOriginY + dirY * groupDist;
                const offX = nX * overlap * 0.5;
                const offY = nY * overlap * 0.5;
                const drawHexPair = ((pairMode + gi + (side > 0 ? 1 : 0)) % 2) === 0;
                const a = pairAlpha * (gi === 0 ? 1 : 0.84) * 0.82;
                const aDim = a * 0.5; // Paired lens element at 50% lower brightness.
                const rot = spinSlow + side * 0.08 + gi * 0.22;
                const groupDistNorm = Phaser.Math.Clamp(Math.abs(groupDist) / Math.max(1, sepBase * sepMul), 0, 1.6);
                const clusterSizeMul = Phaser.Math.Linear(1.05, 1.7, groupDistNorm) * Phaser.Math.Linear(1, 1.2, edgeFactor);
                const pairSizeGroup = pairSize * clusterSizeMul;
                const cA = this.mixColors(coolColor, 0x9fe5ff, 0.4);
                const cB = this.mixColors(warmColor, 0xffbd9b, 0.36);
                const cHot = 0xff84b7;
                const cCold = 0x7fd9ff;
                const cPurple = this.mixColors(0x8f6cff, 0xc59bff, 0.48);
                const usePurpleHex = ((gi + (side > 0 ? 1 : 0)) % 3) === 0;
                if (drawHexPair) {
                    this.drawLensHexGhost(
                        gx - offX,
                        gy - offY,
                        pairSizeGroup * 1.08,
                        usePurpleHex ? this.mixColors(cA, cPurple, 0.28) : cA,
                        a,
                        rot,
                        0.82,
                        this.torchOrbitGraphics
                    );
                    this.drawLensHexGhost(
                        gx + offX,
                        gy + offY,
                        pairSizeGroup * 1.02,
                        usePurpleHex ? this.mixColors(cB, cPurple, 0.34) : cB,
                        aDim,
                        rot + 0.55,
                        0.82,
                        this.torchOrbitGraphics
                    );
                    this.drawLensHexGhost(gx - offX - chromaSep, gy - offY, pairSizeGroup * 0.98, cHot, a * 0.34, rot + 0.08, 0.82, this.torchOrbitGraphics);
                    this.drawLensHexGhost(gx + offX + chromaSep, gy + offY, pairSizeGroup * 0.94, cCold, aDim * 0.68, rot + 0.6, 0.82, this.torchOrbitGraphics);
                } else {
                    const circleAlphaMul = 0.85; // 15% reduction for orbital circles
                    this.drawLensCircleGhost(gx - offX, gy - offY, pairSizeGroup * 0.96, cA, a * circleAlphaMul, this.torchOrbitGraphics);
                    this.drawLensCircleGhost(gx + offX, gy + offY, pairSizeGroup * 0.92, cB, aDim * circleAlphaMul, this.torchOrbitGraphics);
                    this.drawLensCircleGhost(gx - offX - chromaSep, gy - offY, pairSizeGroup * 0.9, cHot, a * 0.3 * circleAlphaMul, this.torchOrbitGraphics);
                    this.drawLensCircleGhost(gx + offX + chromaSep, gy + offY, pairSizeGroup * 0.88, cCold, aDim * 0.65 * circleAlphaMul, this.torchOrbitGraphics);
                }
                // Sharpened anamorphic-like streak accent for a harder lens character.
                const streakLen = pairSizeGroup * Phaser.Math.Linear(2.1, 3.4, strength);
                const sx1 = gx - dirX * streakLen;
                const sy1 = gy - dirY * streakLen;
                const sx2 = gx + dirX * streakLen;
                const sy2 = gy + dirY * streakLen;
                const streakAlphaMul = lowFxMode ? 0.52 : 1;
                this.torchOrbitGraphics.lineStyle(1.9, 0xf1fbff, a * 0.72 * streakAlphaMul);
                this.torchOrbitGraphics.beginPath();
                this.torchOrbitGraphics.moveTo(sx1, sy1);
                this.torchOrbitGraphics.lineTo(sx2, sy2);
                this.torchOrbitGraphics.strokePath();
                this.torchOrbitGraphics.lineStyle(1.15, 0x7fd9ff, a * 0.38 * streakAlphaMul);
                this.torchOrbitGraphics.beginPath();
                this.torchOrbitGraphics.moveTo(sx1 - nX * 0.9, sy1 - nY * 0.9);
                this.torchOrbitGraphics.lineTo(sx2 - nX * 0.9, sy2 - nY * 0.9);
                this.torchOrbitGraphics.strokePath();
                this.torchOrbitGraphics.lineStyle(1.15, 0xff8ebf, a * 0.32 * streakAlphaMul);
                this.torchOrbitGraphics.beginPath();
                this.torchOrbitGraphics.moveTo(sx1 + nX * 0.9, sy1 + nY * 0.9);
                this.torchOrbitGraphics.lineTo(sx2 + nX * 0.9, sy2 + nY * 0.9);
                this.torchOrbitGraphics.strokePath();
                // Added sharpen pass: thin high-contrast core to emulate lens-edge crispness.
                this.torchOrbitGraphics.lineStyle(0.9, 0xffffff, a * 0.42 * streakAlphaMul);
                this.torchOrbitGraphics.beginPath();
                this.torchOrbitGraphics.moveTo(gx - dirX * streakLen * 0.66, gy - dirY * streakLen * 0.66);
                this.torchOrbitGraphics.lineTo(gx + dirX * streakLen * 0.66, gy + dirY * streakLen * 0.66);
                this.torchOrbitGraphics.strokePath();
            }
        }
    }

    getTorchMuzzleColor(source, fallback = 0xffffff) {
        const n = Number(source?.muzzleFlashColor);
        return Number.isFinite(n) ? (n & 0xffffff) : fallback;
    }

    mixColors(colorA, colorB, t = 0.5) {
        const mix = Phaser.Math.Clamp(Number(t) || 0, 0, 1);
        const a = colorA & 0xffffff;
        const b = colorB & 0xffffff;
        const ar = (a >> 16) & 0xff;
        const ag = (a >> 8) & 0xff;
        const ab = a & 0xff;
        const br = (b >> 16) & 0xff;
        const bg = (b >> 8) & 0xff;
        const bb = b & 0xff;
        const r = Math.round(Phaser.Math.Linear(ar, br, mix));
        const g = Math.round(Phaser.Math.Linear(ag, bg, mix));
        const bl = Math.round(Phaser.Math.Linear(ab, bb, mix));
        return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
    }

    drawLensCircleGhost(cx, cy, radius, color, alpha = 0.2, graphics = null) {
        const g = graphics || this.torchLensGraphics;
        const r = Math.max(1, Number(radius) || 1);
        const a = Phaser.Math.Clamp((Number(alpha) || 0) * 0.85, 0, 1);
        if (a <= 0.001) return;
        g.fillStyle(color, a);
        g.fillCircle(cx, cy, r);
        g.lineStyle(1, color, a * 0.62);
        g.strokeCircle(cx, cy, r * 0.96);
    }

    drawLensHexGhost(cx, cy, radius, color, alpha = 0.2, rotation = 0, yScale = 1, graphics = null) {
        const g = graphics || this.torchLensGraphics;
        const r = Math.max(1, Number(radius) || 1);
        const a = Phaser.Math.Clamp(Number(alpha) || 0, 0, 1);
        const ys = Phaser.Math.Clamp(Number(yScale) || 1, 0.35, 1.4);
        if (a <= 0.001) return;
        g.fillStyle(color, a);
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const t = (Math.PI * 2 * i) / 6 + Math.PI / 6 + (Number(rotation) || 0);
            const x = cx + Math.cos(t) * r;
            const y = cy + Math.sin(t) * r * ys;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.closePath();
        g.fillPath();
        g.lineStyle(1.8, color, Phaser.Math.Clamp(a * 0.9, 0, 1));
        g.strokePath();
        // Subtle inner ring to make hex geometry read clearly in additive blending.
        g.lineStyle(1, color, Phaser.Math.Clamp(a * 0.42, 0, 1));
        g.beginPath();
        for (let i = 0; i < 6; i++) {
            const t = (Math.PI * 2 * i) / 6 + Math.PI / 6 + (Number(rotation) || 0);
            const x = cx + Math.cos(t) * r * 0.78;
            const y = cy + Math.sin(t) * r * ys * 0.78;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.closePath();
        g.strokePath();
    }

    paintTorchFlareSprite(worldX, worldY, angle, majorRadius, minorRadius, alpha, tint, cam) {
        const sprite = this.getTorchFlareSprite();
        const tex = this.scene.textures.get(this.torchFlareTextureKey);
        const frame = tex ? tex.get() : null;
        const texW = Math.max(1, Number(frame?.width) || 64);
        const texH = Math.max(1, Number(frame?.height) || 32);
        sprite.setVisible(true);
        sprite.setPosition(worldX - cam.scrollX, worldY - cam.scrollY);
        sprite.setRotation(angle);
        sprite.setScale((majorRadius * 0.75) / texW, (Math.max(6, minorRadius * 0.24)) / texH);
        sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));
        sprite.setTint(tint);
    }

    getTorchFlareSprite() {
        const idx = this.activeTorchFlareCount++;
        if (!this.torchFlarePool[idx]) {
            const sprite = this.scene.add.image(0, 0, this.torchFlareTextureKey);
            // Keep flare above multiply darkness pass; otherwise it is barely visible.
            sprite.setDepth(IMPACT_HIGHLIGHT_DEPTH + 6);
            sprite.setScrollFactor(0);
            sprite.setBlendMode(Phaser.BlendModes.ADD);
            sprite.setVisible(false);
            this.torchFlarePool[idx] = sprite;
        }
        return this.torchFlarePool[idx];
    }

    hideTorchFlareSprites() {
        this.activeTorchFlareCount = 0;
        for (const sprite of this.torchFlarePool) {
            if (sprite) sprite.setVisible(false);
        }
    }

    /**
     * Returns the distance to the nearest visible alien entity within the beam
     * cone that is closer than `maxDist` (the wall hit or full range).
     * Entities behind walls are excluded because maxDist is the wall distance.
     * Returns Infinity when nothing is found.
     */
    _findNearestEntityInBeam(source, maxDist, entities) {
        if (!entities || entities.length === 0 || !source) return Infinity;
        const halfAngle = Number(source.halfAngle) || 0;
        if (halfAngle <= 0) return Infinity;
        let nearest = Infinity;
        for (const ent of entities) {
            if (!ent || !ent.active || typeof ent.enemyType !== 'string') continue;
            if (ent.enemyType === 'egg') continue; // eggs always visible, no beam effect
            // Only entities already partly visible create a beam-snap effect.
            if ((Number(ent.alpha) || 0) < 0.05) continue;
            const dx = ent.x - source.x;
            const dy = ent.y - source.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= maxDist || dist < 12) continue; // beyond wall or too close
            // Cone angle check
            let diff = Math.atan2(dy, dx) - source.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > halfAngle) continue;
            // Entity is in beam — used for terminus shortening only.
            // revealCharge is managed exclusively by EnemyDetection to avoid double-increment.
            if (dist < nearest) nearest = dist;
        }
        return nearest;
    }

    findFirstBlockingHit(source, segments) {
        if (!source || !segments || segments.length === 0) return null;
        const dirX = Math.cos(source.angle);
        const dirY = Math.sin(source.angle);
        const maxDist = Math.max(0, Number(source.range) || 0);
        if (maxDist <= 0.001) return null;

        let best = null;
        let bestDist = maxDist + 0.001;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const hit = this.raycaster.raySegmentIntersection(
                source.x, source.y, dirX, dirY,
                seg.x1, seg.y1, seg.x2, seg.y2
            );
            if (!hit || hit.dist > maxDist) continue;
            if (hit.dist < bestDist) {
                bestDist = hit.dist;
                best = { ...hit, seg };
            }
        }
        return best;
    }

    drawTorchFloorHotspotShape(cx, cy, angle, majorRadius, minorRadius, alpha, cam, graphics = this.lightGraphics) {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        this.drawOrientedEllipseFeather(cx, cy, angle, majorRadius, minorRadius, alpha, cam, graphics);

        // Add a forward lobe and rear falloff to read more like a projected torch footprint.
        this.drawOrientedEllipseFeather(
            cx + dirX * majorRadius * 0.24,
            cy + dirY * majorRadius * 0.24,
            angle,
            majorRadius * 0.66,
            minorRadius * 0.78,
            alpha * 0.62,
            cam,
            graphics
        );
        this.drawOrientedEllipseFeather(
            cx - dirX * majorRadius * 0.2,
            cy - dirY * majorRadius * 0.2,
            angle,
            majorRadius * 0.48,
            minorRadius * 0.66,
            alpha * 0.42,
            cam,
            graphics
        );

        // ── Prismatic chromatic fringe ──
        // Simulates light dispersion at the hotspot edge: warm (amber/red) fringe
        // on the outer rim, cool (cyan/blue) fringe on the inner rim, offset
        // perpendicular to the beam axis.  Drawn on the additive hotspot layer
        // so it tints over the white multiply-pass ellipse naturally.
        if (this.qualityTier <= 1 && alpha > 0.04) {
            const perpX = -dirY;
            const perpY = dirX;
            const fringeSpread = minorRadius * 0.18;
            const fringeAlpha = Phaser.Math.Clamp(alpha * 0.12, 0.008, 0.065);
            const fringeMajor = majorRadius * 1.08;
            const fringeMinor = minorRadius * 1.12;
            // Warm fringe — offset outward on one side
            this.drawOrientedEllipse(
                cx + perpX * fringeSpread - cam.scrollX,
                cy + perpY * fringeSpread - cam.scrollY,
                angle, fringeMajor, fringeMinor, fringeAlpha,
                this.hotspotGraphics
            );
            this.hotspotGraphics.fillStyle(0xffb870, fringeAlpha * 0.7);
            // Repaint with warm tint (drawOrientedEllipse uses white; layer the color)
            this._fillPrismaticFringe(
                cx + perpX * fringeSpread, cy + perpY * fringeSpread,
                angle, fringeMajor, fringeMinor, fringeAlpha * 0.8, 0xffb870, cam
            );
            // Cool fringe — offset outward on opposite side
            this._fillPrismaticFringe(
                cx - perpX * fringeSpread, cy - perpY * fringeSpread,
                angle, fringeMajor, fringeMinor, fringeAlpha * 0.7, 0x7ab8ff, cam
            );
            // Forward-edge rainbow fringe — thin arc at the leading rim
            const rainbowDist = majorRadius * 0.92;
            const rainbowAlpha = Phaser.Math.Clamp(alpha * 0.06, 0.005, 0.035);
            this._fillPrismaticFringe(
                cx + dirX * rainbowDist + perpX * fringeSpread * 0.5,
                cy + dirY * rainbowDist + perpY * fringeSpread * 0.5,
                angle, majorRadius * 0.28, minorRadius * 0.55, rainbowAlpha, 0xff9060, cam
            );
            this._fillPrismaticFringe(
                cx + dirX * rainbowDist - perpX * fringeSpread * 0.5,
                cy + dirY * rainbowDist - perpY * fringeSpread * 0.5,
                angle, majorRadius * 0.28, minorRadius * 0.55, rainbowAlpha, 0x60a0ff, cam
            );
        }
    }

    _fillPrismaticFringe(cx, cy, angle, halfW, halfH, alpha, color, cam) {
        if (alpha < 0.003) return;
        const segments = this.qualityTier >= 1 ? 12 : 18;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const sx = cx - cam.scrollX;
        const sy = cy - cam.scrollY;
        this.hotspotGraphics.fillStyle(color, Phaser.Math.Clamp(alpha, 0, 0.12));
        this.hotspotGraphics.beginPath();
        for (let i = 0; i <= segments; i++) {
            const u = (i / segments) * Math.PI * 2;
            const ex = Math.cos(u) * halfW;
            const ey = Math.sin(u) * halfH;
            const px = sx + ex * cosA - ey * sinA;
            const py = sy + ex * sinA + ey * cosA;
            if (i === 0) this.hotspotGraphics.moveTo(px, py);
            else this.hotspotGraphics.lineTo(px, py);
        }
        this.hotspotGraphics.closePath();
        this.hotspotGraphics.fillPath();
    }

    drawOrientedEllipseFeather(cx, cy, angle, majorRadius, minorRadius, alpha, cam, graphics = this.lightGraphics) {
        // Hard center to keep hotspot brighter than the surrounding beam.
        this.drawOrientedEllipse(
            cx - cam.scrollX,
            cy - cam.scrollY,
            angle,
            majorRadius * 0.58,
            minorRadius * 0.58,
            Phaser.Math.Clamp(alpha, 0, 1),
            graphics
        );

        const layers = 6;
        for (let i = layers; i >= 1; i--) {
            const t = i / layers;
            const sideFeather = 1 + (1 - t) * 0.95;
            const major = majorRadius * (0.78 + t * 0.22);
            const minor = minorRadius * sideFeather;
            const layerAlpha = Phaser.Math.Clamp(alpha * (1 - t * 0.65), 0, 1);
            if (layerAlpha <= 0.002) continue;
            this.drawOrientedEllipse(
                cx - cam.scrollX,
                cy - cam.scrollY,
                angle,
                major,
                minor,
                layerAlpha,
                graphics
            );
        }
    }

    drawOrientedEllipse(cx, cy, angle, majorRadius, minorRadius, alpha, graphics = this.lightGraphics) {
        const points = 22;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        graphics.fillStyle(0xffffff, Phaser.Math.Clamp(alpha, 0, 1));
        graphics.beginPath();
        for (let i = 0; i <= points; i++) {
            const u = (i / points) * Math.PI * 2;
            const ex = Math.cos(u) * majorRadius;
            const ey = Math.sin(u) * minorRadius;
            const rx = ex * cosA - ey * sinA;
            const ry = ex * sinA + ey * cosA;
            const px = cx + rx;
            const py = cy + ry;
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();
    }

    /**
     * Draw dust motes floating in the torch beam cone with volumetric depth.
     * Multi-layer system: sharp bright core motes + larger soft halo motes +
     * faint background wisp streaks for a natural atmospheric beam look.
     * Uses deterministic pseudo-random positions seeded from world coords.
     * Drawn on the additive hotspot layer. Skipped at quality tier >= 2.
     */
    drawTorchDustMotes(source, cam) {
        if (this.qualityTier >= 2) return;
        const g = this.hotspotGraphics;
        const lg = this.lightGraphics;
        const now = Number(this.scene?.time?.now) || 0;
        const range = Math.max(40, Number(source.range) || 200);
        const halfAngle = Number(source.halfAngle) || 0.5;
        const angle = Number(source.angle) || 0;
        const intensity = Phaser.Math.Clamp(Number(source?.intensity) || 1, 0.3, 2.5);
        const muzzleFlash = Phaser.Math.Clamp(Number(source?.muzzleFlash) || 0, 0, 1);
        const lowFx = this.lowFxMode;
        const moteCount = lowFx ? 14 : 36;
        const wispCount = lowFx ? 4 : 12;

        // ── Primary dust motes: multi-pass with depth, turbulence, and shape variety ──
        for (let i = 0; i < moteCount; i++) {
            const seed = (source.x * 0.0137 + source.y * 0.0091 + i * 7.31) % 1000;
            // Multi-frequency drift: fast jitter + slow wander + very-slow current
            const timeFast = now * 0.00024 + seed;
            const timeDrift = now * 0.00016 + seed;
            const timeSlow = now * 0.00007 + seed * 1.3;
            const timeGlacial = now * 0.000025 + seed * 0.7;
            // Distance along beam — weighted toward mid-beam (bell curve feel)
            const rawT = (Math.sin(seed * 3.7 + timeDrift * 0.35) * 0.5 + 0.5);
            const distT = 0.08 + rawT * rawT * 0.84;
            const dist = range * distT;
            // Angle within cone — turbulent wander with two frequencies
            const wander = Math.sin(timeSlow * 2.1 + i * 4.7) * 0.08
                         + Math.sin(timeFast * 1.7 + i * 3.2) * 0.03;
            const angleOffset = (Math.sin(seed * 5.3 + timeDrift * 0.22) * 0.5 + wander) * halfAngle * 0.88;
            const moteAngle = angle + angleOffset;
            // Turbulent Lissajous drift — 3 frequencies for irregular, realistic motion
            const driftX = Math.sin(timeDrift * 0.9 + i * 1.7) * 4.5
                         + Math.sin(timeSlow * 3.1) * 2.0
                         + Math.sin(timeFast * 2.3 + i * 5.1) * 1.5
                         + Math.sin(timeGlacial * 1.1 + seed) * 7.0;
            const driftY = Math.cos(timeDrift * 0.7 + i * 2.3) * 3.2
                         + Math.cos(timeSlow * 2.7) * 1.5
                         + Math.cos(timeFast * 1.9 + i * 4.3) * 1.2
                         + Math.cos(timeGlacial * 0.9 + seed * 1.4) * 5.0;
            const mx = source.x + Math.cos(moteAngle) * dist + driftX;
            const my = source.y + Math.sin(moteAngle) * dist + driftY;
            const sx = mx - cam.scrollX;
            const sy = my - cam.scrollY;
            if (sx < -20 || sx > this.fixedWidth + 20 || sy < -20 || sy > this.fixedHeight + 20) continue;

            // Beam-center falloff — brighter near center axis, fading at cone edges
            const angleDiff = Math.abs(angleOffset) / (halfAngle * 0.88 + 0.001);
            const coneFade = 1 - angleDiff * angleDiff;
            // Distance falloff — bell curve peaking at ~40% beam range
            const distFade = Math.exp(-((distT - 0.4) * (distT - 0.4)) / 0.18);
            // Per-mote pulse — staggered multi-frequency breathing
            const pulse = 0.35 + 0.45 * Math.sin(timeDrift * 1.5 + i * 2.1)
                        + 0.2 * Math.sin(timeFast * 0.8 + i * 4.7);
            const pulseClamped = Phaser.Math.Clamp(pulse, 0, 1);
            // Muzzle flash brightens motes in the beam
            const flashBoost = 1 + muzzleFlash * 1.8;

            // Depth simulation: distant motes are larger/softer, near motes sharper/smaller
            const depthScale = Phaser.Math.Linear(0.7, 1.6, distT);

            // Shape variety: some motes are elongated (fibrous dust), others round
            const isElongated = (i % 5 < 2) && !lowFx;
            const moteRotation = isElongated
                ? (seed * 2.7 + timeSlow * 0.4)
                : 0;

            // Layer 1: Soft halo (larger, dimmer) — volumetric depth cue
            const haloAlpha = Phaser.Math.Clamp(0.028 * intensity * coneFade * distFade * pulseClamped * flashBoost, 0.004, 0.07);
            const haloRadius = Phaser.Math.Linear(3.5, 7.0, pulseClamped) * (1 + muzzleFlash * 0.5) * depthScale;
            const haloTint = (i % 4 === 0) ? 0xd8e8ff : ((i % 4 === 1) ? 0xeaf0ff : ((i % 4 === 2) ? 0xfff4e0 : 0xffecd0));
            g.fillStyle(haloTint, haloAlpha);
            if (isElongated) {
                // Elongated halo — rotated ellipse for fibrous dust
                this._fillRotatedEllipse(g, sx, sy, haloRadius * 1.6, haloRadius * 0.6, moteRotation, haloTint, haloAlpha);
            } else {
                g.fillCircle(sx, sy, haloRadius);
            }

            // Layer 2: Sharp bright core — the visible dust particle
            const coreAlpha = Phaser.Math.Clamp(0.07 * intensity * coneFade * distFade * pulseClamped * flashBoost, 0.01, 0.18);
            const coreRadius = Phaser.Math.Linear(1.0, 2.8, pulseClamped) * Phaser.Math.Linear(0.85, 1.2, depthScale - 0.7);
            // Warm near source, cooler further out — color temperature shift
            const warmCoolT = distT * distT;
            const moteTintCore = warmCoolT < 0.3
                ? ((i % 3 === 0) ? 0xffeabc : ((i % 3 === 1) ? 0xfff0d0 : 0xfff8e8))
                : ((i % 3 === 0) ? 0xe8f0ff : ((i % 3 === 1) ? 0xd6e4ff : 0xf0f4ff));
            if (isElongated) {
                this._fillRotatedEllipse(g, sx, sy, coreRadius * 1.8, coreRadius * 0.5, moteRotation, moteTintCore, coreAlpha);
            } else {
                g.fillStyle(moteTintCore, coreAlpha);
                g.fillCircle(sx, sy, coreRadius);
            }

            // Layer 3 (quality tier 0 only): Tiny specular glint on brightest motes
            if (!lowFx && pulseClamped > 0.8 && coreAlpha > 0.06) {
                const glintAlpha = Phaser.Math.Clamp((pulseClamped - 0.8) * 0.6 * intensity * flashBoost, 0, 0.12);
                g.fillStyle(0xffffff, glintAlpha);
                g.fillCircle(sx, sy, coreRadius * 0.5);
            }
        }

        // ── Wisp streaks: elongated faint trails that suggest air currents ──
        // Multi-frequency turbulence for more organic swirling motion.
        if (!lowFx) {
            for (let w = 0; w < wispCount; w++) {
                const wseed = (source.x * 0.0089 + source.y * 0.0127 + w * 11.37) % 1000;
                const wtime = now * 0.00012 + wseed;
                const wtimeFast = now * 0.00028 + wseed * 1.6;
                const wtimeGlacial = now * 0.00003 + wseed * 0.5;
                const wDistT = 0.15 + (Math.sin(wseed * 2.9 + wtime * 0.3) * 0.5 + 0.5) * 0.7;
                const wDist = range * wDistT;
                const wAngleOff = (Math.sin(wseed * 4.1 + wtime * 0.18) * 0.5
                                 + Math.sin(wtimeFast * 0.7 + w * 2.9) * 0.12) * halfAngle * 0.75;
                const wAngle = angle + wAngleOff;
                // Turbulent drift with slow air-current feel
                const wDriftX = Math.sin(wtime * 0.6 + w * 3.1) * 6
                              + Math.sin(wtimeGlacial * 1.3 + wseed) * 10;
                const wDriftY = Math.cos(wtime * 0.5 + w * 2.7) * 4
                              + Math.cos(wtimeGlacial * 1.1 + wseed * 1.2) * 8;
                const wx = source.x + Math.cos(wAngle) * wDist + wDriftX;
                const wy = source.y + Math.sin(wAngle) * wDist + wDriftY;
                const wsx = wx - cam.scrollX;
                const wsy = wy - cam.scrollY;
                if (wsx < -30 || wsx > this.fixedWidth + 30 || wsy < -30 || wsy > this.fixedHeight + 30) continue;

                // Streak direction: beam-following with turbulent curl
                const curl = Math.sin(wtimeFast * 1.1 + w * 1.7) * 0.25;
                const streakAngle = wAngle + Math.sin(wtime * 1.3) * 0.15 + curl;
                const streakLen = Phaser.Math.Linear(6, 22, Math.sin(wtime * 0.8 + w) * 0.5 + 0.5);
                const wConeFade = 1 - Math.pow(Math.abs(wAngleOff) / (halfAngle * 0.75 + 0.001), 2);
                const wDistFade = Math.exp(-((wDistT - 0.4) * (wDistT - 0.4)) / 0.22);
                const wPulse = 0.3 + 0.7 * Math.sin(wtime * 1.2 + w * 3.3);
                const wAlpha = Phaser.Math.Clamp(0.025 * intensity * wConeFade * wDistFade * wPulse * (1 + muzzleFlash * 1.2), 0.003, 0.06);
                const cdx = Math.cos(streakAngle) * streakLen;
                const cdy = Math.sin(streakAngle) * streakLen;
                // Tapered line: thicker center, thinner ends
                const lineW = Phaser.Math.Linear(0.6, 1.6, wPulse);
                g.lineStyle(lineW, 0xeef4ff, wAlpha);
                g.beginPath();
                g.moveTo(wsx - cdx, wsy - cdy);
                g.lineTo(wsx + cdx, wsy + cdy);
                g.strokePath();
                // Faint wider under-stroke for depth-of-field blur on distant wisps
                if (wDistT > 0.5) {
                    const blurAlpha = Phaser.Math.Clamp(wAlpha * 0.35 * (wDistT - 0.5) * 2, 0.002, 0.02);
                    g.lineStyle(lineW * 2.5, 0xd0e0f8, blurAlpha);
                    g.beginPath();
                    g.moveTo(wsx - cdx * 0.8, wsy - cdy * 0.8);
                    g.lineTo(wsx + cdx * 0.8, wsy + cdy * 0.8);
                    g.strokePath();
                }
            }
        }

        // ── Volumetric beam fill on the MULTIPLY layer: faint gradient cone that
        //    makes the beam itself slightly visible as scattered light ──
        if (!lowFx && intensity > 0.5) {
            const beamFillAlpha = Phaser.Math.Clamp(0.018 * (intensity - 0.5) * (1 + muzzleFlash * 2.5), 0.003, 0.05);
            const fillRange = range * 0.85;
            const fillSteps = 3;
            for (let s = fillSteps; s >= 1; s--) {
                const t = s / fillSteps;
                const stepRange = fillRange * t;
                const stepHalf = halfAngle * (0.6 + t * 0.35);
                const stepAlpha = beamFillAlpha * (1 - t * 0.6);
                if (stepAlpha < 0.002) continue;
                lg.fillStyle(0xe8f0ff, stepAlpha);
                lg.beginPath();
                lg.moveTo(source.x - cam.scrollX, source.y - cam.scrollY);
                const segments = 8;
                for (let j = 0; j <= segments; j++) {
                    const a = angle - stepHalf + (stepHalf * 2 * j / segments);
                    lg.lineTo(
                        source.x + Math.cos(a) * stepRange - cam.scrollX,
                        source.y + Math.sin(a) * stepRange - cam.scrollY
                    );
                }
                lg.closePath();
                lg.fillPath();
            }
        }
    }

    drawWallDepthShading(cam) {
        const walls = this.scene?.runtimeSettings?.walls || {};
        const strength = Phaser.Math.Clamp(Number(walls.wallDepthShadeStrength) || 0, 0, 2);
        if (strength <= 0.001) return;
        const rangePx = Phaser.Math.Clamp(Number(walls.wallDepthShadeRangePx) || 96, 24, 280);
        const steps = this.lowFxMode ? 3 : 4;
        const g = this.wallShadeGraphics;
        const sample = Math.max(6, CONFIG.TILE_SIZE * 0.38);
        const radius = Math.hypot(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT) * 0.6 + rangePx + CONFIG.TILE_SIZE * 2;
        const segs = this.lightBlockerGrid.getSegmentsNear(
            cam.scrollX + (CONFIG.GAME_WIDTH * 0.5),
            cam.scrollY + (CONFIG.GAME_HEIGHT * 0.5),
            radius
        );
        const maxSegs = Math.min(segs.length, this.lowFxMode ? 900 : 1400);
        for (let i = 0; i < maxSegs; i++) {
            const seg = segs[i];
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const len = Math.hypot(dx, dy);
            if (len <= 0.001) continue;
            const mx = (seg.x1 + seg.x2) * 0.5;
            const my = (seg.y1 + seg.y2) * 0.5;
            const n1x = -dy / len;
            const n1y = dx / len;
            const n2x = -n1x;
            const n2y = -n1y;
            const o1 = this.isPointBlocking(mx + n1x * sample, my + n1y * sample) ? 0 : 1;
            const o2 = this.isPointBlocking(mx + n2x * sample, my + n2y * sample) ? 0 : 1;
            if (o1 === 0 && o2 === 0) continue;
            const nx = o1 >= o2 ? n1x : n2x;
            const ny = o1 >= o2 ? n1y : n2y;

            // Edge contact shadow — crisp dark line at wall edge
            g.lineStyle(1.5, 0x040810, Phaser.Math.Clamp(WALL_DEPTH_SHADE_EDGE_ALPHA * strength * 1.4, 0, 0.38));
            g.beginPath();
            g.moveTo(seg.x1 - cam.scrollX, seg.y1 - cam.scrollY);
            g.lineTo(seg.x2 - cam.scrollX, seg.y2 - cam.scrollY);
            g.strokePath();

        // Feathered shadow gradient — smoothstep falloff for natural penumbra.
        for (let step = 1; step <= steps; step++) {
                const t = step / steps;
                const smoothT = t * t * (3 - 2 * t);
                const dist = rangePx * smoothT;
                const falloff = Math.pow(1 - t, 1.9);
                const alpha = WALL_DEPTH_SHADE_BASE_ALPHA * falloff * strength * 1.25;
                if (alpha <= 0.001) continue;
                const ox = nx * dist;
                const oy = ny * dist;
                // Wider lines at further distance for smoother feathering.
                const lineWidth = Phaser.Math.Linear(1.1, 3.1, smoothT);
                g.lineStyle(lineWidth, 0x040810, Phaser.Math.Clamp(alpha, 0, 0.18));
                g.beginPath();
                g.moveTo(seg.x1 + ox - cam.scrollX, seg.y1 + oy - cam.scrollY);
                g.lineTo(seg.x2 + ox - cam.scrollX, seg.y2 + oy - cam.scrollY);
                g.strokePath();
            }

            // Ambient occlusion darkening at wall base — subtle corner shadow
            const aoAlpha = Phaser.Math.Clamp(WALL_DEPTH_SHADE_EDGE_ALPHA * strength * 0.6, 0, 0.12);
            if (aoAlpha > 0.003) {
                const aoOx = nx * 3;
                const aoOy = ny * 3;
                g.lineStyle(4, 0x020408, aoAlpha);
                g.beginPath();
                g.moveTo(seg.x1 + aoOx - cam.scrollX, seg.y1 + aoOy - cam.scrollY);
                g.lineTo(seg.x2 + aoOx - cam.scrollX, seg.y2 + aoOy - cam.scrollY);
                g.strokePath();
            }
        }
    }

    closestPointOnSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0.000001) return { x: x1, y: y1 };
        const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
        return {
            x: x1 + dx * t,
            y: y1 + dy * t,
        };
    }

    buildObjectSegments(source, casters) {
        const segments = this._objectSegmentScratch || (this._objectSegmentScratch = []);
        segments.length = 0;
        for (const caster of casters) {
            if (!caster || caster.blocksLight !== true) continue;
            const radius = caster.radius || 14;
            const dx = caster.x - source.x;
            const dy = caster.y - source.y;
            if (dx * dx + dy * dy < radius * radius * 4) continue;

            const x0 = caster.x - radius;
            const y0 = caster.y - radius;
            const x1 = caster.x + radius;
            const y1 = caster.y + radius;
            const maskRect = { x: x0, y: y0, w: (x1 - x0), h: (y1 - y0) };

            segments.push({ x1: x0, y1: y0, x2: x1, y2: y0, maskRect });
            segments.push({ x1: x1, y1: y0, x2: x1, y2: y1, maskRect });
            segments.push({ x1: x1, y1: y1, x2: x0, y2: y1, maskRect });
            segments.push({ x1: x0, y1: y1, x2: x0, y2: y0, maskRect });
        }
        return segments;
    }

    enforceFixedSurfaceSize() {
        if (this.destroyed) return;
        const rt = this.rt;
        if (!rt || !rt.scene) return;
        try {
            if (typeof rt.setSize === 'function' && (rt.width !== this.fixedWidth || rt.height !== this.fixedHeight)) {
                rt.setSize(this.fixedWidth, this.fixedHeight);
            }
            if (typeof rt.setPosition === 'function') rt.setPosition(0, 0);
        } catch (_) {
            // Ignore late lifecycle RT resize errors during scene teardown/restart.
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.scene?.scale?.off && this.resizeHandler) {
            this.scene.scale.off('resize', this.resizeHandler);
        }
        this.resizeHandler = null;
        this.rt?.destroy();
        this.lightGraphics?.destroy();
        this.wallShadeGraphics?.destroy();
        this.hotspotGraphics?.destroy();
        this.torchLensGraphics?.destroy();
        this.torchOrbitGraphics?.destroy();
        this.contactShadowGraphics?.destroy();
        for (const s of this.torchTipPool || []) s?.destroy?.();
        for (const s of this.torchFlarePool || []) s?.destroy?.();
        for (const s of this.wallImpactPool || []) {
            if (s?._impactMaskGraphics) { s._impactMaskGraphics.destroy(); s._impactMaskGraphics = null; }
            if (s?._impactMask) { s._impactMask.destroy(); s._impactMask = null; }
            s?.destroy?.();
        }
        this.rt = null;
        this.lightGraphics = null;
        this.wallShadeGraphics = null;
        this.hotspotGraphics = null;
        this.torchLensGraphics = null;
        this.torchOrbitGraphics = null;
        this.contactShadowGraphics = null;
    }
}
