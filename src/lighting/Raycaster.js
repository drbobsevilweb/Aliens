import { CONFIG } from '../config.js';

export class Raycaster {
    computeVisibilityPolygon(originX, originY, facingAngle, halfAngle, maxRange, segments) {
        const EPSILON = CONFIG.TORCH_RAY_EPSILON;
        const minAngle = facingAngle - halfAngle;
        const maxAngle = facingAngle + halfAngle;

        // Collect unique corner points from segments
        const pointSet = new Set();
        const points = [];

        const addPoint = (x, y) => {
            const key = x + ',' + y;
            if (!pointSet.has(key)) {
                pointSet.add(key);
                points.push({ x, y });
            }
        };

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            addPoint(seg.x1, seg.y1);
            addPoint(seg.x2, seg.y2);
        }

        // Build ray angles: 3 per corner point + cone boundaries
        const rays = [];
        const raySet = new Set();
        const addRay = (angle) => {
            const normalized = this.normalizeAngle(angle);
            const key = Math.round(normalized * 100000);
            if (raySet.has(key)) return;
            raySet.add(key);
            rays.push(angle);
        };

        for (let i = 0; i < points.length; i++) {
            const angle = Math.atan2(points[i].y - originY, points[i].x - originX);
            if (this.isAngleInCone(angle, facingAngle, halfAngle + EPSILON * 3)) {
                addRay(angle - EPSILON);
                addRay(angle);
                addRay(angle + EPSILON);
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
            Math.min(CONFIG.TORCH_FILL_RAY_MAX, Math.ceil(arcLength / targetSpacing))
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
                const hit = this.raySegmentIntersection(
                    originX, originY, dx, dy,
                    seg.x1, seg.y1, seg.x2, seg.y2
                );
                if (hit !== null && hit.dist < closestDist) {
                    closestDist = hit.dist;
                    hitX = hit.x;
                    hitY = hit.y;
                }
            }

            polygon.push({ x: hitX, y: hitY });
        }

        return polygon;
    }

    raySegmentIntersection(ox, oy, dx, dy, x1, y1, x2, y2) {
        const sx = x2 - x1;
        const sy = y2 - y1;
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
}
