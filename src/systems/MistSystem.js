import { CONFIG } from '../config.js';

/**
 * Drifting corridor mist / steam system.
 * Creates a small pool of large, soft, semi-transparent sprites that drift
 * slowly across the map, creating an atmospheric "they could be anywhere" feel.
 * Very subtle — wisps are barely visible, never obscuring gameplay.
 */
export class MistSystem {
    constructor(scene, count = 20) {
        this.scene = scene;
        this.patches = [];
        this.enabled = true;

        const cam = scene.cameras.main;
        const camW = cam.width;
        const camH = cam.height;

        for (let i = 0; i < count; i++) {
            const sprite = scene.add.image(0, 0, 'fx_mist');
            sprite.setDepth(6.5);
            sprite.setBlendMode(Phaser.BlendModes.ADD);

            // Randomise starting properties
            const scale = 2 + Math.random() * 4;           // 2–6×
            const alpha = 0.03 + Math.random() * 0.05;     // 0.03–0.08
            const tint  = Phaser.Math.Between(0xd8e4f8, 0xffffff); // white to pale blue
            const vx    = (Math.random() - 0.5) * 20;      // -10 to +10 px/s
            const vy    = (Math.random() - 0.5) * 14;      // -7 to +7 px/s
            const rot   = (Math.random() - 0.5) * 0.004;   // very slow spin

            sprite.setScale(scale);
            sprite.setAlpha(alpha);
            sprite.setTint(tint);

            // Place within the camera viewport (they'll be repositioned each frame)
            sprite.x = cam.scrollX + Math.random() * camW;
            sprite.y = cam.scrollY + Math.random() * camH;

            this.patches.push({
                sprite,
                vx,
                vy,
                rotSpeed: rot,
                baseAlpha: alpha,
                baseScale: scale,
                // Each patch breathes in and out on its own cycle
                breathPhase: Math.random() * Math.PI * 2,
                breathRate: 0.3 + Math.random() * 0.4,     // 0.3–0.7 rad/s
            });
        }
    }

    update(time, delta) {
        // Check runtime toggle
        const rs = this.scene.runtimeSettings;
        const mistOn = rs?.game?.mistEnabled ?? 1;
        if (!mistOn || !this.enabled) {
            for (const p of this.patches) p.sprite.setVisible(false);
            return;
        }

        const dt = delta / 1000;
        const cam = this.scene.cameras.main;
        const margin = 200; // respawn margin beyond camera edges
        const left   = cam.scrollX - margin;
        const right  = cam.scrollX + cam.width + margin;
        const top    = cam.scrollY - margin;
        const bottom = cam.scrollY + cam.height + margin;

        for (const p of this.patches) {
            const s = p.sprite;
            s.setVisible(true);

            // Drift
            s.x += p.vx * dt;
            s.y += p.vy * dt;
            s.rotation += p.rotSpeed * dt;

            // Breathing alpha / scale oscillation
            p.breathPhase += p.breathRate * dt;
            const breath = Math.sin(p.breathPhase);
            s.setAlpha(p.baseAlpha + breath * 0.015);       // ±0.015
            s.setScale(p.baseScale + breath * 0.3);          // ±0.3

            // Respawn if too far from camera
            if (s.x < left || s.x > right || s.y < top || s.y > bottom) {
                this._respawn(p, cam);
            }
        }
    }

    /** Place a patch at a random position just inside the camera viewport. */
    _respawn(p, cam) {
        const s = p.sprite;
        // Pick a random edge to enter from
        const edge = Math.random();
        if (edge < 0.25) {
            // left edge
            s.x = cam.scrollX - 80;
            s.y = cam.scrollY + Math.random() * cam.height;
        } else if (edge < 0.5) {
            // right edge
            s.x = cam.scrollX + cam.width + 80;
            s.y = cam.scrollY + Math.random() * cam.height;
        } else if (edge < 0.75) {
            // top edge
            s.x = cam.scrollX + Math.random() * cam.width;
            s.y = cam.scrollY - 80;
        } else {
            // bottom edge
            s.x = cam.scrollX + Math.random() * cam.width;
            s.y = cam.scrollY + cam.height + 80;
        }

        // Re-randomise drift so patches don't all move the same way
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = (Math.random() - 0.5) * 14;
        p.baseAlpha = 0.03 + Math.random() * 0.05;
        p.baseScale = 2 + Math.random() * 4;
        p.breathPhase = Math.random() * Math.PI * 2;
        s.setAlpha(p.baseAlpha);
        s.setScale(p.baseScale);
    }

    destroy() {
        for (const p of this.patches) {
            p.sprite.destroy();
        }
        this.patches.length = 0;
    }
}
