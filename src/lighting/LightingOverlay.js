import { CONFIG } from '../config.js';

export class LightingOverlay {
    constructor(scene, raycaster, lightBlockerGrid, tuning = null) {
        this.scene = scene;
        this.raycaster = raycaster;
        this.lightBlockerGrid = lightBlockerGrid;
        this.tuning = tuning || {};

        // RenderTexture covers the screen, pinned to camera
        this.rt = scene.add.renderTexture(0, 0, CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
        this.rt.setOrigin(0, 0);
        this.rt.setScrollFactor(0);
        this.rt.setDepth(CONFIG.LIGHTING_DEPTH);

        // On-scene graphics for light polygon, hidden behind the RT
        this.lightGraphics = scene.add.graphics();
        this.lightGraphics.setDepth(CONFIG.LIGHTING_DEPTH - 1);
        this.lightGraphics.setScrollFactor(0);
        this.lightGraphics.setVisible(false);
    }

    update(lightSources, objectCasters = []) {
        const cam = this.scene.cameras.main;

        this.lightGraphics.clear();
        this.rt.clear();
        this.rt.fill(0x000000, this.tuning.ambientDarkness ?? CONFIG.AMBIENT_DARKNESS);

        if (!lightSources || lightSources.length === 0) {
            return;
        }

        for (const source of lightSources) {
            const radius = source.range + CONFIG.TILE_SIZE;
            const staticSegments = this.lightBlockerGrid.getSegmentsNear(source.x, source.y, radius);
            const objectSegments = this.buildObjectSegments(source, objectCasters);
            const segments = staticSegments.concat(objectSegments);

            this.drawFeatheredCone(source, segments, cam);
            this.drawSurfaceContactLight(source, staticSegments, cam);
            this.drawSoftGlow(source, cam);
        }

        this.rt.erase(this.lightGraphics, 0, 0);
    }

    drawFeatheredCone(source, segments, cam) {
        const layers = Math.max(1, CONFIG.TORCH_FEATHER_LAYERS);
        for (let i = layers - 1; i >= 0; i--) {
            const halfAngle = source.halfAngle + i * CONFIG.TORCH_FEATHER_ANGLE_STEP;
            const range = source.range * (1 + i * CONFIG.TORCH_FEATHER_RANGE_STEP);
            const coreAlpha = this.tuning.coreAlpha ?? CONFIG.TORCH_CORE_ALPHA;
            const alpha = coreAlpha * Math.pow(CONFIG.TORCH_FEATHER_ALPHA_DECAY, i);
            this.drawConeLayer(source, segments, cam, halfAngle, range, alpha);
        }
    }

    drawConeLayer(source, segments, cam, halfAngle, range, alpha) {
        const polygon = this.raycaster.computeVisibilityPolygon(
            source.x,
            source.y,
            source.angle,
            halfAngle,
            range,
            segments
        );
        if (polygon.length < 3) return;

        const screenX = source.x - cam.scrollX;
        const screenY = source.y - cam.scrollY;

        this.lightGraphics.fillStyle(0xffffff, Phaser.Math.Clamp(alpha, 0, 1));
        this.lightGraphics.beginPath();
        this.lightGraphics.moveTo(screenX, screenY);
        for (let i = 0; i < polygon.length; i++) {
            this.lightGraphics.lineTo(
                polygon[i].x - cam.scrollX,
                polygon[i].y - cam.scrollY
            );
        }
        this.lightGraphics.closePath();
        this.lightGraphics.fillPath();
    }

    drawSoftGlow(source, cam) {
        const softRadius = this.tuning.softRadius ?? CONFIG.MARINE_LIGHT_SOFT_RADIUS;
        const haloRadius = softRadius * CONFIG.TORCH_FOG_HALO_RADIUS_FACTOR;
        this.lightGraphics.fillStyle(0xffffff, CONFIG.TORCH_FOG_HALO_ALPHA);
        this.lightGraphics.fillCircle(
            source.x - cam.scrollX,
            source.y - cam.scrollY,
            haloRadius
        );

        const steps = Math.max(1, CONFIG.TORCH_SOFT_GLOW_STEPS);
        for (let i = steps; i >= 1; i--) {
            const t = i / steps;
            const radius = softRadius * t;
            const alpha = CONFIG.TORCH_SOFT_GLOW_ALPHA * (1 - t * t);
            this.lightGraphics.fillStyle(0xffffff, alpha);
            this.lightGraphics.fillCircle(
                source.x - cam.scrollX,
                source.y - cam.scrollY,
                radius
            );
        }
    }

    drawSurfaceContactLight(source, staticSegments, cam) {
        const penetration = Phaser.Math.Clamp(
            Number(this.scene?.runtimeSettings?.walls?.lightPenetrationPct ?? 0.25),
            0,
            0.8
        );
        if (penetration <= 0 || !staticSegments || staticSegments.length === 0) return;

        const maxSegs = Math.min(staticSegments.length, 220);
        const conePad = 0.1;
        for (let i = 0; i < maxSegs; i++) {
            const seg = staticSegments[i];
            const mx = (seg.x1 + seg.x2) * 0.5;
            const my = (seg.y1 + seg.y2) * 0.5;
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
            const alpha = penetration * 0.34 * distFactor * coneFactor;
            if (alpha < 0.01) continue;

            const w = 1.8 + 4 * penetration * distFactor;
            this.lightGraphics.lineStyle(w, 0xffffff, alpha);
            this.lightGraphics.beginPath();
            this.lightGraphics.moveTo(seg.x1 - cam.scrollX, seg.y1 - cam.scrollY);
            this.lightGraphics.lineTo(seg.x2 - cam.scrollX, seg.y2 - cam.scrollY);
            this.lightGraphics.strokePath();

            this.lightGraphics.fillStyle(0xffffff, alpha * 0.35);
            this.lightGraphics.fillCircle(mx - cam.scrollX, my - cam.scrollY, 2 + penetration * 4 * distFactor);
        }
    }

    buildObjectSegments(source, casters) {
        const segments = [];
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

            segments.push({ x1: x0, y1: y0, x2: x1, y2: y0 });
            segments.push({ x1: x1, y1: y0, x2: x1, y2: y1 });
            segments.push({ x1: x1, y1: y1, x2: x0, y2: y1 });
            segments.push({ x1: x0, y1: y1, x2: x0, y2: y0 });
        }
        return segments;
    }
}
