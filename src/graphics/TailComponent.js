/**
 * TailComponent — smooth physics-based alien tail.
 *
 * Verlet chain (10 points) drives physics. Each frame a Catmull-Rom spline is
 * sampled through those points and rendered as a series of overlapping triangles
 * that taper from wide at the hip to a fine point at the tip — like the bony,
 * segmented spine of a xenomorph tail.
 *
 * COORDINATE CONVENTION:
 *   spriteAngleOffset = π/2 for all aliens → enemy.rotation = moveAngle + π/2
 *   Sprite "south" (hip) in world space = (-sin(rotation), +cos(rotation))
 */
export class TailComponent {
    constructor(scene, owner, options = {}) {
        this.scene  = scene;
        this.owner  = owner;
        this.active = true;

        this.anchorOffset = options.anchorOffset || 22;
        this.numPoints    = options.numPoints    || 10;
        this.stiffness    = options.stiffness    || 0.6;
        this.drag         = options.drag         || 0.85;
        this.gravityX     = options.gravityX     || 0;
        this.gravityY     = options.gravityY     || 0;
        this.waveFreq     = options.waveFreq     || 2.15;

        const bs = owner.baseScale || 1;
        const bodyPx        = 128 * bs;
        const lenMul        = options.lengthMul  || 2.33;
        this.segmentLength  = (bodyPx * lenMul) / (this.numPoints - 1);
        this.baseWidth      = (options.baseWidth ?? 28) * bs;
        this.tipWidth       = (options.tipWidth  ??  2) * bs;

        // Colour palette — overridable per enemy type.
        this.fillDark  = options.fillDark  ?? 0x0f1210;
        this.fillMid   = options.fillMid   ?? 0x1a1f18;
        this.edgeColor = options.edgeColor ?? 0x3a4535;

        this.gfx = scene.add.graphics();
        this.gfx.setDepth(owner.depth - 0.1);
        this.gfx.setAlpha(0);
        this.gfx.setVisible(false);

        // All points start clustered at the anchor — zero-size chain on first frame
        // so there is nothing visible until physics spreads them as the alien moves.
        const ax = owner.x;
        const ay = owner.y + this.anchorOffset;
        this.points = Array.from({ length: this.numPoints }, () =>
            ({ x: ax, y: ay, oldX: ax, oldY: ay })
        );
    }

    /** Immediately hide and clear tail graphics (e.g. on alien death). */
    hide() {
        if (this.gfx) { this.gfx.setVisible(false); this.gfx.clear(); }
    }

    // Kept for API compatibility — visibility is managed entirely inside update().
    setVisible() {}
    setAlpha()   {}

    destroy() {
        if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
        this.points = [];
    }

    update(time, delta) {
        if (!this.active || !this.gfx) return;

        // Alien inactive (dead / pooled) — hide immediately and stop.
        if (!this.owner || !this.owner.active) {
            this.gfx.setVisible(false);
            this.gfx.clear();
            return;
        }

        const ownerAlpha = this.owner.alpha;
        const show = this.owner.visible && ownerAlpha > 0.05;
        this.gfx.setVisible(show);
        this.gfx.setAlpha(ownerAlpha);
        if (!show) { this.gfx.clear(); return; }

        // ── 1. Pin anchor to alien hip ────────────────────────────────────────
        const rot    = this.owner.rotation;
        const southX = -Math.sin(rot);
        const southY =  Math.cos(rot);
        const head   = this.points[0];
        head.x = this.owner.x + southX * this.anchorOffset;
        head.y = this.owner.y + southY * this.anchorOffset;

        const velX = Number(this.owner.body?.velocity?.x) || 0;
        const velY = Number(this.owner.body?.velocity?.y) || 0;
        const moveSpeed = Math.hypot(velX, velY);
        const moveAngle = moveSpeed > 0.001 ? Math.atan2(velY, velX) : (this.owner.rotation - Math.PI * 0.5);
        const sideX = -Math.sin(moveAngle);
        const sideY = Math.cos(moveAngle);
        const snakeStrength = Phaser.Math.Clamp(moveSpeed / Math.max(1, this.owner.stats?.speed || 1), 0, 1);
        const undulation = (time || 0) * 0.004;

        // ── 2. Verlet integration ─────────────────────────────────────────────
        const dt = delta * 0.001;
        for (let i = 1; i < this.points.length; i++) {
            const p  = this.points[i];
            const vx = (p.x - p.oldX) * this.drag;
            const vy = (p.y - p.oldY) * this.drag;
            p.oldX = p.x;
            p.oldY = p.y;
            p.x   += vx + this.gravityX * dt;
            p.y   += vy + this.gravityY * dt;

            const chainT = i / (this.points.length - 1);
            const wave = Math.sin(undulation - chainT * this.waveFreq) * (6 + chainT * 10) * snakeStrength;
            p.x += sideX * wave * dt * 8;
            p.y += sideY * wave * dt * 8;
        }

        // ── 3. Distance constraints ───────────────────────────────────────────
        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < this.points.length - 1; i++) {
                const p1  = this.points[i];
                const p2  = this.points[i + 1];
                const dx  = p2.x - p1.x;
                const dy  = p2.y - p1.y;
                const d   = Math.sqrt(dx * dx + dy * dy) || 0.001;
                const cor = (this.segmentLength - d) / d;
                const ox  = dx * cor * 0.5;
                const oy  = dy * cor * 0.5;
                if (i === 0) {
                    p2.x += ox * 2 * this.stiffness;
                    p2.y += oy * 2 * this.stiffness;
                } else {
                    p1.x -= ox * this.stiffness;
                    p1.y -= oy * this.stiffness;
                    p2.x += ox * this.stiffness;
                    p2.y += oy * this.stiffness;
                }
            }
        }

        this._draw();
    }

    _draw() {
        this.gfx.clear();

        // Sample a smooth Catmull-Rom spline through the Verlet points.
        const SAMPLES = 20;
        const spine = [];
        for (let s = 0; s <= SAMPLES; s++) {
            spine.push(this._catmullRom(s / SAMPLES));
        }

        const bs = this.owner.baseScale || 1;
        const n  = spine.length;

        const FILL_DARK  = this.fillDark;
        const FILL_MID   = this.fillMid;
        const EDGE_COLOR = this.edgeColor;

        for (let i = 0; i < n - 1; i++) {
            const t  = i / (n - 2);     // 0 = hip, 1 = tip
            const p1 = spine[i];
            const p2 = spine[i + 1];

            const dx  = p2.x - p1.x;
            const dy  = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            // Skip degenerate segments (all points still clustered at start)
            if (len < 0.5) continue;

            // Normal perpendicular to segment direction
            const nx = -dy / len;
            const ny =  dx / len;

            // Half-width at this segment, tapering toward tip
            const hw = (this.baseWidth + (this.tipWidth - this.baseWidth) * t) * 0.5;

            // Diamond: p1 and p2 are the pointed ends; the bulge sits at the midpoint.
            const mx   = (p1.x + p2.x) * 0.5;
            const my   = (p1.y + p2.y) * 0.5;
            const lx   = mx + nx * hw;   // left  bulge
            const ly   = my + ny * hw;
            const rx   = mx - nx * hw;   // right bulge
            const ry   = my - ny * hw;

            // Two triangles form the diamond: front half + back half
            const fillColor = (i % 2 === 0) ? FILL_DARK : FILL_MID;
            this.gfx.fillStyle(fillColor, 0.98 - t * 0.08);
            this.gfx.fillTriangle(p1.x, p1.y, lx, ly, rx, ry); // hip-side
            this.gfx.fillTriangle(p2.x, p2.y, lx, ly, rx, ry); // tip-side

            // Four edges of the diamond
            this.gfx.lineStyle(Math.max(0.6, bs * 0.9), EDGE_COLOR, 0.55 - t * 0.3);
            this.gfx.lineBetween(p1.x, p1.y, lx, ly);
            this.gfx.lineBetween(p1.x, p1.y, rx, ry);
            this.gfx.lineBetween(p2.x, p2.y, lx, ly);
            this.gfx.lineBetween(p2.x, p2.y, rx, ry);
        }
    }

    /** Catmull-Rom interpolation through this.points at t ∈ [0, 1]. */
    _catmullRom(t) {
        const pts  = this.points;
        const last = pts.length - 1;
        const ft   = t * last;
        const i    = Math.min(Math.floor(ft), last - 1);
        const lt   = ft - i;
        const lt2  = lt * lt;
        const lt3  = lt2 * lt;

        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[Math.min(last, i + 1)];
        const p3 = pts[Math.min(last, i + 2)];

        return {
            x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*lt + (2*p0.x-5*p1.x+4*p2.x-p3.x)*lt2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*lt3),
            y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*lt + (2*p0.y-5*p1.y+4*p2.y-p3.y)*lt2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*lt3),
        };
    }
}
