import { CONFIG } from '../config.js';

export class Raycaster {
    constructor() {
        // Reusable scratch arrays to avoid per-frame allocations
        this._points = [];
        this._pointKeys = new Set();
        this._rays = [];
        this._rayKeys = new Set();
        this._polygon = [];
    }

    computeVisibilityPolygon(originX, originY, facingAngle, halfAngle, maxRange, segments, options = null) {
        const EPSILON = CONFIG.TORCH_RAY_EPSILON;
        const minAngle = facingAngle - halfAngle;
        const maxAngle = facingAngle + halfAngle;
        const opt = options || {};
        const fillScale = Phaser.Math.Clamp(Number(opt.fillScale) || 1, 0.25, 1.6);
        const pointStride = Math.max(1, Math.floor(Number(opt.pointStride) || 1));
        const jitterRayCount = Math.max(1, Math.floor(Number(opt.jitterRayCount) || 3));

        // Reuse scratch arrays — clear without reallocating
        const points = this._points;
        points.length = 0;
        const pointSet = this._pointKeys;
        pointSet.clear();

        const addPoint = (x, y) => {
            // Integer-keyed hashing avoids string concat GC pressure
            const key = (x | 0) * 131071 + (y | 0);
            if (!pointSet.has(key)) {
                pointSet.add(key);
                points.push(x, y); // flat array: [x0, y0, x1, y1, ...]
            }
        };

        for (let i = 0; i < segments.length; i += pointStride) {
            const seg = segments[i];
            addPoint(seg.x1, seg.y1);
            addPoint(seg.x2, seg.y2);
        }

        // Build ray angles: 3 per corner point + cone boundaries
        const rays = this._rays;
        rays.length = 0;
        const raySet = this._rayKeys;
        raySet.clear();
        const addRay = (angle) => {
            const normalized = this.normalizeAngle(angle);
            const key = (normalized * 100000 + 0.5) | 0;
            if (raySet.has(key)) return;
            raySet.add(key);
            rays.push(angle);
        };

        const expandedHalf = halfAngle + EPSILON * 3;
        for (let i = 0; i < points.length; i += 2) {
            const angle = Math.atan2(points[i + 1] - originY, points[i] - originX);
            if (this.isAngleInCone(angle, facingAngle, expandedHalf)) {
                if (jitterRayCount >= 3) addRay(angle - EPSILON);
                addRay(angle);
                if (jitterRayCount >= 2) addRay(angle + EPSILON);
            }
        }

        // Cone boundary rays
        addRay(minAngle);
        addRay(maxAngle);

        // Arc-length based fill rays: s = r * theta, then sample by target spacing.
        const arcLength = maxRange * (maxAngle - minAngle);
        const targetSpacing = Math.max(1, CONFIG.TORCH_FILL_RAY_SPACING);
        const fillRayCount = Math.max(
            CONFIG.TORCH_FILL_RAY_MIN,
            Math.min(CONFIG.TORCH_FILL_RAY_MAX, Math.ceil(arcLength / targetSpacing) * fillScale)
        );
        const step = (maxAngle - minAngle) / fillRayCount;
        for (let i = 1; i < fillRayCount; i++) {
            addRay(minAngle + step * i);
        }

        // Sort rays by angle relative to cone start
        rays.sort((a, b) => {
            return this.normalizeAngle(a - minAngle) - this.normalizeAngle(b - minAngle);
        });

        // Cast each ray and find closest intersection
        const polygon = [];

        for (let r = 0; r < rays.length; r++) {
            const angle = rays[r];
            if (!this.isAngleInCone(angle, facingAngle, halfAngle)) continue;

            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            let closestDist = maxRange;
            let hitX = originX + dx * maxRange;
            let hitY = originY + dy * maxRange;

            for (let s = 0; s < segments.length; s++) {
                const seg = segments[s];
                // Quick AABB rejection: skip segments whose bounding box
                // is entirely beyond the current closest hit distance.
                const segMinX = seg.x1 < seg.x2 ? seg.x1 : seg.x2;
                const segMaxX = seg.x1 > seg.x2 ? seg.x1 : seg.x2;
                const segMinY = seg.y1 < seg.y2 ? seg.y1 : seg.y2;
                const segMaxY = seg.y1 > seg.y2 ? seg.y1 : seg.y2;
                // Ray travels from origin in direction (dx,dy). If the segment's
                // nearest corner is farther than closestDist, skip it.
                const nearX = dx >= 0 ? segMinX - originX : originX - segMaxX;
                const nearY = dy >= 0 ? segMinY - originY : originY - segMaxY;
                if (nearX > closestDist && nearY > closestDist) continue;

                // Inline raySegmentIntersection to save object allocations
                const sx = seg.x2 - seg.x1;
                const sy = seg.y2 - seg.y1;
                if (sx * sx + sy * sy < 1e-12) continue;
                const denom = dx * sy - dy * sx;
                if (denom > -1e-10 && denom < 1e-10) continue;

                const t = ((seg.x1 - originX) * sy - (seg.y1 - originY) * sx) / denom;
                const u = ((seg.x1 - originX) * dy - (seg.y1 - originY) * dx) / denom;

                if (t >= 0 && u >= 0 && u <= 1 && t < closestDist) {
                    closestDist = t;
                    hitX = originX + dx * t;
                    hitY = originY + dy * t;
                }
            }

            polygon.push({ x: hitX, y: hitY });
        }

        return polygon;
    }

    /**
     * Cast a single ray from (originX, originY) in direction `angle` and return
     * the closest intersection with the provided wall segments, or the arc
     * endpoint at maxRange if nothing is hit. Uses the same AABB optimisation as
     * computeVisibilityPolygon for consistent performance.
     */
    castSingleRay(originX, originY, angle, maxRange, segments) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let closestDist = maxRange;
        let hitX = originX + dx * maxRange;
        let hitY = originY + dy * maxRange;
        for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            const segMinX = seg.x1 < seg.x2 ? seg.x1 : seg.x2;
            const segMaxX = seg.x1 > seg.x2 ? seg.x1 : seg.x2;
            const segMinY = seg.y1 < seg.y2 ? seg.y1 : seg.y2;
            const segMaxY = seg.y1 > seg.y2 ? seg.y1 : seg.y2;
            const nearX = dx >= 0 ? segMinX - originX : originX - segMaxX;
            const nearY = dy >= 0 ? segMinY - originY : originY - segMaxY;
            if (nearX > closestDist && nearY > closestDist) continue;
            
            const sx = seg.x2 - seg.x1;
            const sy = seg.y2 - seg.y1;
            if (sx * sx + sy * sy < 1e-12) continue;
            const denom = dx * sy - dy * sx;
            if (denom > -1e-10 && denom < 1e-10) continue;

            const t = ((seg.x1 - originX) * sy - (seg.y1 - originY) * sx) / denom;
            const u = ((seg.x1 - originX) * dy - (seg.y1 - originY) * dx) / denom;

            if (t >= 0 && u >= 0 && u <= 1 && t < closestDist) {
                closestDist = t;
                hitX = originX + dx * t;
                hitY = originY + dy * t;
            }
        }
        return { x: hitX, y: hitY, dist: closestDist };
    }

    raySegmentIntersection(ox, oy, dx, dy, x1, y1, x2, y2) {
        const sx = x2 - x1;
        const sy = y2 - y1;
        // Guard against zero-length segments (NaN/garbage results)
        if (sx * sx + sy * sy < 1e-12) return null;
        const denom = dx * sy - dy * sx;

        if (denom > -1e-10 && denom < 1e-10) return null; // parallel

        const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
        const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;

        if (t < 0 || u < 0 || u > 1) return null;

        return {
            x: ox + dx * t,
            y: oy + dy * t,
            dist: t
        };
    }

    isAngleInCone(angle, center, half) {
        let diff = angle - center;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= half;
    }

    normalizeAngle(angle) {
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;
        return angle;
    }

    /**
     * Pre-exercise the visibility calculation to warm up the JIT compiler.
     * This avoids a "cold-start" lag spike on the very first raycasting frame.
     */
    warmup() {
        const dummySegments = [];
        for (let i = 0; i < 20; i++) {
            dummySegments.push({ x1: i * 10, y1: 0, x2: i * 10, y2: 100 });
            dummySegments.push({ x1: 0, y1: i * 10, x2: 100, y2: i * 10 });
        }
        // Run 50 iterations to ensure JIT kicks in
        for (let i = 0; i < 50; i++) {
            this.computeVisibilityPolygon(50, 50, 0, Math.PI * 0.25, 200, dummySegments);
        }
    }
}
