import { CONFIG } from '../config.js';

const HIVE_TEXTURES = ['hive_creep_1', 'hive_creep_2', 'hive_creep_3'];
const MAX_PATCHES = 50;
const GROW_DURATION_MS = 15000;       // 15s to reach full scale
const SPREAD_INTERVAL_MS = 4000;      // attempt spread every 4s
const SPREAD_RADIUS = CONFIG.TILE_SIZE * 2.5; // how far a child can spawn from parent
const PULSE_SPEED = 0.8;             // alpha oscillation rad/s
const PULSE_AMPLITUDE = 0.04;        // ±alpha wobble
const MIN_ALPHA = 0.15;
const MAX_ALPHA = 0.28;
const MIN_FINAL_SCALE = 1.0;
const MAX_FINAL_SCALE = 1.5;
const DEPTH = 2.5;

/**
 * Bio-mechanical hive creep — dark organic growth patches that appear near
 * alien activity and slowly spread, marking alien territory on the floor.
 */
export class HiveGrowthSystem {
    constructor(scene) {
        this.scene = scene;
        /** @type {{ sprite: Phaser.GameObjects.Image, bornAt: number, finalScale: number, baseAlpha: number, pulsePhase: number, grown: boolean, spreadCount: number }[]} */
        this.patches = [];
        this._lastSpreadTime = 0;

        // Listen for alien deaths to seed growth
        scene.events.on('enemy-killed', this._onEnemyKilled, this);
    }

    // ── Public API ──────────────────────────────────────────────────────

    /** Seed a growth patch at the given world position. */
    seed(x, y) {
        if (this.patches.length >= MAX_PATCHES) return;
        const texKey = HIVE_TEXTURES[Math.floor(Math.random() * HIVE_TEXTURES.length)];
        const sprite = this.scene.add.image(x, y, texKey);
        sprite.setDepth(DEPTH);
        sprite.setScale(0.01);
        sprite.setAlpha(0);
        sprite.setAngle(Math.random() * 360);
        // Dark organic tint — near-black green/brown
        const tints = [0x0e1a0a, 0x121e0c, 0x162210, 0x0c180a, 0x141c0e];
        sprite.setTint(tints[Math.floor(Math.random() * tints.length)]);

        this.patches.push({
            sprite,
            bornAt: this.scene.time.now,
            finalScale: MIN_FINAL_SCALE + Math.random() * (MAX_FINAL_SCALE - MIN_FINAL_SCALE),
            baseAlpha: MIN_ALPHA + Math.random() * (MAX_ALPHA - MIN_ALPHA),
            pulsePhase: Math.random() * Math.PI * 2,
            grown: false,
            spreadCount: 0,
        });
    }

    update(time, delta) {
        const rs = this.scene.runtimeSettings;
        const enabled = rs?.game?.hiveGrowthEnabled ?? 1;
        if (!enabled) {
            for (const p of this.patches) p.sprite.setVisible(false);
            return;
        }

        const dt = delta / 1000;
        // Determine growth rate multiplier from CombatDirector state
        let growthMul = 0.3; // calm — very slow
        const mods = this.scene.combatMods;
        if (mods) {
            const state = mods.state;
            if (state === 'build') growthMul = 0.7;
            else if (state === 'peak') growthMul = 1.0;
            else if (state === 'release') growthMul = 0.5;
        }

        for (const p of this.patches) {
            p.sprite.setVisible(true);
            const age = time - p.bornAt;

            if (!p.grown) {
                // Grow from 0 to finalScale
                const progress = Math.min(1, (age * growthMul) / GROW_DURATION_MS);
                // Ease-out curve for organic feel
                const eased = 1 - Math.pow(1 - progress, 2);
                p.sprite.setScale(eased * p.finalScale);
                p.sprite.setAlpha(eased * p.baseAlpha);
                if (progress >= 1) p.grown = true;
            } else {
                // Subtle organic pulsing
                p.pulsePhase += PULSE_SPEED * dt;
                const pulse = Math.sin(p.pulsePhase) * PULSE_AMPLITUDE;
                p.sprite.setAlpha(p.baseAlpha + pulse);
            }
        }

        // Spreading — grown patches occasionally spawn adjacent patches
        if (time - this._lastSpreadTime > SPREAD_INTERVAL_MS && growthMul > 0.3) {
            this._lastSpreadTime = time;
            this._trySpread();
        }
    }

    // ── Private ─────────────────────────────────────────────────────────

    _onEnemyKilled(enemy) {
        if (!enemy || !enemy.x || !enemy.y) return;
        // Offset slightly so it doesn't stack exactly on corpse debris
        const ox = (Math.random() - 0.5) * CONFIG.TILE_SIZE * 0.6;
        const oy = (Math.random() - 0.5) * CONFIG.TILE_SIZE * 0.6;
        this.seed(enemy.x + ox, enemy.y + oy);
    }

    _trySpread() {
        if (this.patches.length >= MAX_PATCHES) return;
        // Pick a random grown patch to spread from
        const grownPatches = this.patches.filter(p => p.grown && p.spreadCount < 2);
        if (grownPatches.length === 0) return;

        const parent = grownPatches[Math.floor(Math.random() * grownPatches.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = CONFIG.TILE_SIZE + Math.random() * SPREAD_RADIUS;
        const nx = parent.sprite.x + Math.cos(angle) * dist;
        const ny = parent.sprite.y + Math.sin(angle) * dist;

        // Only spread to walkable areas (floor, not wall)
        const pg = this.scene.pathGrid;
        if (pg) {
            const tx = Math.floor(nx / CONFIG.TILE_SIZE);
            const ty = Math.floor(ny / CONFIG.TILE_SIZE);
            if (!pg.isWalkable(tx, ty)) return;
        }

        parent.spreadCount++;
        this.seed(nx, ny);
    }

    destroy() {
        this.scene.events.off('enemy-killed', this._onEnemyKilled, this);
        for (const p of this.patches) {
            p.sprite.destroy();
        }
        this.patches.length = 0;
    }
}
