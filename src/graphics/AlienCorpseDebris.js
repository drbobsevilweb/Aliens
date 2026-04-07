/**
 * AlienCorpseDebris — scattered body-part fragments on alien death.
 *
 * Each piece is a diamond or irregular triangle drawn with Phaser Graphics.
 * Pieces scatter outward on spawn, decelerate, then fade over 30 seconds
 * while shifting from near-black chitin to a sickly acid green.
 * A dark green acid-bleed outline rings every shape throughout.
 */
export class AlienCorpseDebris {
    constructor(scene) {
        this.scene  = scene;
        this.pieces = [];
        this.imagePieces = [];
        this.bodyPartKeys = ['alien_part_tail', 'alien_part_limb', 'alien_part_crest', 'alien_part_shard'];

        this.gfx = scene.add.graphics();
        this.gfx.setDepth(4.5);       // above floor, below entities
        this.gfx.setScrollFactor(1);

        // Steam tints for dissolve effect: warm yellow-green → grey-olive
        this._steamTints = [0xd4e060, 0xc8d028, 0xa8b020, 0x808830];
    }

    /**
     * Spawn debris fragments at world position (x, y).
     * @param {number} count  number of pieces (default 9)
     */
    spawn(x, y, count = 9) {
        const now = this.scene.time.now;

        for (let i = 0; i < count; i++) {
            const angle   = Math.random() * Math.PI * 2;
            const isBig   = i < 3;                          // first 3 = larger chunks
            const speed   = isBig
                ? 52 + Math.random() * 72
                : 78 + Math.random() * 138;
            const size    = isBig
                ? 14 + Math.random() * 14
                :  5 + Math.random() * 10;
            const shapeR  = Math.random();                  // 0-0.6 → diamond, else triangle

            this.pieces.push({
                x,  y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rot:  Math.random() * Math.PI * 2,
                rotV: (Math.random() - 0.5) * 4,
                size,
                baseSize: size,
                diamond: shapeR < 0.6,
                born:     now,
                lifetime: 30000,
                nextSteam: now + 3000 + Math.random() * 4000,
            });
        }

        // Spawn image-based alien body part fragments
        const imgCount = 2 + Math.floor(Math.random() * 2); // 2-3 pieces
        for (let i = 0; i < imgCount; i++) {
            const key = this.bodyPartKeys[Math.floor(Math.random() * this.bodyPartKeys.length)];
            if (!this.scene.textures.exists(key)) continue;
            const angle = Math.random() * Math.PI * 2;
            const speed = 72 + Math.random() * 110;
            const img = this.scene.add.image(x, y, key);
            img.setDepth(4.5);
            img.setScale(0.8 + Math.random() * 0.6);
            img.setRotation(Math.random() * Math.PI * 2);
            this.imagePieces.push({
                img,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotV: (Math.random() - 0.5) * 3,
                born: now,
                lifetime: 30000,
                baseScale: img.scaleX,
                nextSteam: now + 3000 + Math.random() * 4000,
            });
        }
    }

    update(time, delta) {
        if (this.pieces.length === 0 && this.imagePieces.length === 0) return;

        const dt   = delta * 0.001;
        // Lighter drag lets fragments carry out to roughly two tiles before settling.
        const drag = Math.pow(0.965, delta / 16.67);

        this.gfx.clear();

        // Remove expired pieces
        this.pieces = this.pieces.filter(p => (time - p.born) < p.lifetime);

        for (const p of this.pieces) {
            const elapsed = time - p.born;
            const t       = elapsed / p.lifetime;   // 0 → 1 over 30 s

            // Velocity & rotation
            p.vx  *= drag;
            p.vy  *= drag;
            p.x   += p.vx  * dt;
            p.y   += p.vy  * dt;
            p.rot += p.rotV * dt;
            p.rotV *= drag;

            // Alpha: hold opaque for first 5 s, then linear fade
            const holdEnd = 5000 / p.lifetime;   // fraction = 1/6
            const alpha   = t < holdEnd
                ? 1.0
                : 1.0 - (t - holdEnd) / (1.0 - holdEnd);
            if (alpha < 0.01) continue;

            // Dissolve progress: 0 during hold, 0→1 during fade
            const dissolveT = t < holdEnd ? 0 : (t - holdEnd) / (1 - holdEnd);

            // Acid dissolve scale: shrink to 35% over fade period
            p.size = p.baseSize * (1 - dissolveT * 0.65);

            // Fill colour: near-black → sickly bright acid green as acid eats the part
            const fillR = Math.round(Phaser.Math.Linear( 12,  22, t));
            const fillG = Math.round(Phaser.Math.Linear( 12, 100, t));
            const fillB = Math.round(Phaser.Math.Linear( 12,  10, t));
            const fillColor = (fillR << 16) | (fillG << 8) | fillB;

            // Outline colour: dark green → brighter acid green (bubbling edge)
            const outG  = Math.round(Phaser.Math.Linear( 55, 160, t));
            const outColor = (10 << 16) | (outG << 8) | 12;

            this.gfx.fillStyle(fillColor, alpha);
            this._fillShape(p);

            this.gfx.lineStyle(1.4, outColor, Math.min(alpha * 1.1, 1));
            this._strokeShape(p);

            // Acid steam wisps rising from dissolving gibs
            if (dissolveT > 0.05 && time >= p.nextSteam && this.scene?.spawnFxSprite) {
                p.nextSteam = time + 800 + Math.random() * 1600;
                this.scene.spawnFxSprite('smoke', p.x + (Math.random() - 0.5) * 6, p.y, {
                    vx: (Math.random() - 0.5) * 8,
                    vy: -(30 + Math.random() * 50),
                    life: 400 + Math.random() * 600,
                    scaleStart: 0.04 + Math.random() * 0.06,
                    scaleEnd: 0.2 + Math.random() * 0.3,
                    alphaStart: 0.12 + Math.random() * 0.1,
                    alphaEnd: 0,
                    tint: this._steamTints[Math.floor(Math.random() * this._steamTints.length)],
                    rotation: Math.random() * Math.PI * 2,
                    spin: (Math.random() - 0.5) * 0.4,
                    drag: 0.3,
                });
            }
        }

        // Update image-based body part pieces
        for (let i = this.imagePieces.length - 1; i >= 0; i--) {
            const p = this.imagePieces[i];
            const elapsed = time - p.born;
            if (elapsed >= p.lifetime) {
                p.img.destroy();
                this.imagePieces.splice(i, 1);
                continue;
            }
            const t = elapsed / p.lifetime;
            p.vx *= drag;
            p.vy *= drag;
            p.img.x += p.vx * dt;
            p.img.y += p.vy * dt;
            p.img.rotation += p.rotV * dt;
            p.rotV *= drag;

            const holdEnd = 5000 / p.lifetime;
            const alpha = t < holdEnd ? 1.0 : 1.0 - (t - holdEnd) / (1.0 - holdEnd);
            if (alpha < 0.01) {
                p.img.destroy();
                this.imagePieces.splice(i, 1);
                continue;
            }
            p.img.setAlpha(alpha);

            // Dissolve progress for image parts
            const dissolveT = t < holdEnd ? 0 : (t - holdEnd) / (1 - holdEnd);

            // Acid dissolve shrink: scale down to 40% as acid eats the body part
            p.img.setScale(p.baseScale * (1 - dissolveT * 0.6));

            // Tint shift: near-black → sickly acid green as acid consumes the remains
            const fillR = Math.round(Phaser.Math.Linear(12, 22, t));
            const fillG = Math.round(Phaser.Math.Linear(12, 100, t));
            const fillB = Math.round(Phaser.Math.Linear(12, 10, t));
            p.img.setTint((fillR << 16) | (fillG << 8) | fillB);

            // Acid steam wisps rising from dissolving body parts
            if (dissolveT > 0.05 && time >= p.nextSteam && this.scene?.spawnFxSprite) {
                p.nextSteam = time + 600 + Math.random() * 1200;
                const steamCount = 1 + Math.floor(Math.random() * 2);
                for (let s = 0; s < steamCount; s++) {
                    this.scene.spawnFxSprite('smoke', p.img.x + (Math.random() - 0.5) * 10, p.img.y + (Math.random() - 0.5) * 6, {
                        vx: (Math.random() - 0.5) * 10,
                        vy: -(35 + Math.random() * 55),
                        life: 500 + Math.random() * 700,
                        scaleStart: 0.05 + Math.random() * 0.08,
                        scaleEnd: 0.25 + Math.random() * 0.35,
                        alphaStart: 0.14 + Math.random() * 0.12,
                        alphaEnd: 0,
                        tint: this._steamTints[Math.floor(Math.random() * this._steamTints.length)],
                        rotation: Math.random() * Math.PI * 2,
                        spin: (Math.random() - 0.5) * 0.4,
                        drag: 0.3,
                    });
                }
            }
        }
    }

    // ─── private helpers ──────────────────────────────────────────────────────

    /** Returns the 3 or 4 world-space vertices for piece p. */
    _verts(p) {
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        const s   = p.size;
        const tx  = (lx, ly) => ({
            x: p.x + lx * cos - ly * sin,
            y: p.y + lx * sin + ly * cos,
        });

        if (p.diamond) {
            return [
                tx(  0,    -s),          // top tip
                tx( s * 0.55,  0),       // right
                tx(  0,  s * 0.78),      // bottom tip (slightly longer = teardrop feel)
                tx(-s * 0.55,  0),       // left
            ];
        } else {
            // Irregular triangle — asymmetric so it reads as a body shard
            return [
                tx(  0,    -s),
                tx( s * 0.85,  s * 0.65),
                tx(-s * 0.50,  s * 0.55),
            ];
        }
    }

    _fillShape(p) {
        const v = this._verts(p);
        if (p.diamond) {
            // Split diamond into two triangles across the horizontal axis
            this.gfx.fillTriangle(v[0].x, v[0].y, v[1].x, v[1].y, v[3].x, v[3].y);
            this.gfx.fillTriangle(v[2].x, v[2].y, v[1].x, v[1].y, v[3].x, v[3].y);
        } else {
            this.gfx.fillTriangle(v[0].x, v[0].y, v[1].x, v[1].y, v[2].x, v[2].y);
        }
    }

    _strokeShape(p) {
        // strokePoints draws the outline without any fill side-effect
        this.gfx.strokePoints(this._verts(p), true);
    }

    destroy() {
        if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
        this.pieces = [];
        for (const p of this.imagePieces) {
            if (p.img) p.img.destroy();
        }
        this.imagePieces = [];
    }
}
