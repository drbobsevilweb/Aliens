import { CONFIG } from '../config.js';

export class AlienEnemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, def) {
        const textureKey = def.textureKey || def.key;
        super(scene, x, y, `alien_${textureKey}`);
        this.enemyType = def.key;
        this.def = def;
        this.detected = false;
        this.spawnX = x;
        this.spawnY = y;
        this.patrolTarget = { x, y };
        this.alertUntil = 0;
        this.lastSeenAt = 0;
        this.swarmSide = Math.random() < 0.5 ? -1 : 1;
        this.wobble = Math.random() * Math.PI * 2;
        this.patternSeed = Math.random() * Math.PI * 2;
        this.maxHealth = def.maxHealth || 40;
        this.health = this.maxHealth;
        this.nextAttackAt = 0;
        this.nextDoorHitAt = 0;
        this.nextVentAt = 0;
        this.nextLeapAt = 0;
        this.leaping = false;
        this.leapUntil = 0;
        this.latchedTo = null;
        this.latchUntil = 0;
        this.nextLatchTickAt = 0;
        this.nextSpitAt = 0;
        this.hitSlowUntil = 0;
        this.hitSlowMultiplier = 1;
        this.stats = {
            speed: def.speed || 80,
            contactDamage: def.contactDamage || 10,
            attackCooldownMs: def.attackCooldownMs || 600,
            patrolRadiusTiles: def.patrolRadiusTiles || 5,
            aggroRange: def.aggroRange || 600,
            separationRadius: def.separationRadius || 40,
            separationForce: def.separationForce || 0.8,
            flankStrength: def.flankStrength || 0.45,
            doorDamage: def.doorDamage || 1,
            doorAttackCooldownMs: def.doorAttackCooldownMs || 450,
            canUseVents: def.canUseVents === true,
            ventCooldownMs: def.ventCooldownMs || 9000,
            ventMinDist: def.ventMinDist || 180,
            ventMaxDist: def.ventMaxDist || 420,
            canOpenUnlockedDoors: def.canOpenUnlockedDoors === true,
            randomPatternStrength: def.randomPatternStrength || 0.3,
            leapMinRange: def.leapMinRange || 0,
            leapMaxRange: def.leapMaxRange || 0,
            leapSpeed: def.leapSpeed || 0,
            leapCooldownMs: def.leapCooldownMs || 0,
            latchDurationMs: def.latchDurationMs || 0,
            latchTickMs: def.latchTickMs || 0,
            latchDamage: def.latchDamage || 0,
            canSpit: def.canSpit === true,
            spitRange: def.spitRange || 0,
            spitDamage: def.spitDamage || 0,
            spitSpeed: def.spitSpeed || 0,
            spitCooldownMs: def.spitCooldownMs || 0,
            spitLifespan: def.spitLifespan || 0,
        };

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setCircle(14);
        this.setDepth(11);
        this.setAlpha(CONFIG.DETECTION_FADE_ALPHA);
        this.setScale(def.sizeScale || 1);
        this.baseTint = this.getBaseTint(this.enemyType);
        this.currentDisplayTint = this.baseTint;
        this.setTint(this.baseTint);
    }

    getBaseTint(enemyType) {
        if (enemyType === 'drone') return 0xa3d2bf;
        if (enemyType === 'facehugger') return 0xc8e7d2;
        if (enemyType === 'queenLesser') return 0x8fc5b5;
        if (enemyType === 'queen') return 0x84b5a8;
        return 0x9dcbb9;
    }

    takeDamage(amount) {
        if (!this.active) return false;
        this.health = Math.max(0, this.health - amount);
        this.applyHitSlow();
        this.setTint(0xff6666);
        this.scene.time.delayedCall(60, () => {
            if (this.active) this.setTint(this.currentDisplayTint || this.baseTint || 0xffffff);
        });
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    applyHitSlow() {
        const now = this.scene.time.now || 0;
        const s = (this.scene && this.scene.runtimeSettings && this.scene.runtimeSettings.enemies) || {};
        const minPct = Number(s.hitSlowMinPct);
        const maxPct = Number(s.hitSlowMaxPct);
        const minDuration = Number(s.hitSlowDurationMinMs);
        const maxDuration = Number(s.hitSlowDurationMaxMs);
        const slowMin = Number.isFinite(minPct) ? minPct : 25;
        const slowMax = Number.isFinite(maxPct) ? maxPct : 50;
        const durationMin = Number.isFinite(minDuration) ? minDuration : 180;
        const durationMax = Number.isFinite(maxDuration) ? maxDuration : 320;
        const slowDurationMs = Phaser.Math.Between(durationMin, durationMax);
        const lowMul = 1 - slowMax / 100;
        const highMul = 1 - slowMin / 100;
        const speedMultiplier = Phaser.Math.FloatBetween(lowMul, highMul);
        this.hitSlowUntil = Math.max(this.hitSlowUntil, now + slowDurationMs);
        this.hitSlowMultiplier = Math.min(this.hitSlowMultiplier, speedMultiplier);
    }

    getSpeedMultiplier(now) {
        if (now <= this.hitSlowUntil) return this.hitSlowMultiplier;
        this.hitSlowMultiplier = 1;
        return 1;
    }

    die() {
        if (!this.active) return;
        this.setActive(false);
        this.setVisible(false);
        this.body.stop();
        this.body.enable = false;
    }
}
