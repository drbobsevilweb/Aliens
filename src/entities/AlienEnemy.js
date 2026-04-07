import { CONFIG } from '../config.js';
import { TailComponent } from '../graphics/TailComponent.js';

export class AlienEnemy extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, def) {
        const textureKey = def.textureKey || def.key;
        super(scene, x, y, `alien_${textureKey}`);
        this.enemyType = def.key;
        this.def = def;
        this.usesWalkSheet = false;
        this.walkAnimKey = null;
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
        this.nextSpitAt = 0;
        this.hitSlowUntil = 0;
        this.hitSlowMultiplier = 1;
        this.damageTaken = 0;
        this.nextWoundSteamAt = 0;
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
            canBreachAnyDoor: def.canBreachAnyDoor === true,
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
        this.walkAnimRate = Number(def.walkAnimRate) || 1;
        this.animStrideSpeed = Math.max(1, Number(def.speed) || Number(this.stats.speed) || 80);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Facehuggers render below wall layer (depth 5) so they slip under walls/doors
        this.setDepth(this.enemyType === 'facehugger' ? 4.5 : 11);
        // Pipeline sprites (from /assets/sprites/scaled/) render at 1:1 — Image Editor is sole authority on sizing.
        // Procedural fallback textures (32x32) still need sizeScale.
        const isPipelineSprite = this.width > 32 || this.height > 32;
        this.baseScale = isPipelineSprite ? 1 : (def.sizeScale || 1);
        this.setAlpha(0);
        this.setVisible(false);
        this.revealCharge = 0;
        this.setScale(this.baseScale);
        const bodyRadius = Number.isFinite(def.bodyRadius) ? def.bodyRadius
            : isPipelineSprite ? Math.round(Math.min(this.width, this.height) * 0.35)
            : Math.round(14 * this.baseScale);
        const cx = this.displayWidth * 0.5 - bodyRadius;
        const cy = this.displayHeight * 0.5 - bodyRadius;
        this.body.setCircle(bodyRadius, cx, cy);
        this.baseTint = this.getBaseTint(this.enemyType);
        this.currentDisplayTint = this.baseTint;
        this.setTint(this.baseTint);
        if (this.walkAnimKey) {
            this.anims.play(this.walkAnimKey);
            this.anims.pause();
        }

        this.ghostBlurStrength = 0;
        this.hitRevealed = false;
        this.ghostBlurSprite = this.createGhostBlurSprite(textureKey);
        this.tendrilSprite = this.createTendrilSprite();
        this.legLeftSprite = this.createLegSprite(-1);
        this.legRightSprite = this.createLegSprite(1);
        
        // Physics-based tail — only for types that canonically have one.
        // anchorOffset = 22 world px derived from aline_tail_placement.png.
        const type = this.enemyType;
        if (type === 'warrior' || type === 'drone' || type === 'queen' || type === 'queenLesser') {
            this.tail = new TailComponent(scene, this, {
                anchorOffset: 22,
                stiffness: 0.6,
                drag: 0.85,
            });
        } else if (type === 'facehugger') {
            // Facehuggers have a thin vestigial tail matching their pale skin tone.
            this.tail = new TailComponent(scene, this, {
                anchorOffset: 7,
                numPoints: 14,     // more points = more turns in the tail
                stiffness: 0.50,
                drag: 0.82,
                lengthMul: 0.8,    // shorter tail for smaller body
                baseWidth: 4,      // thinner at hip
                tipWidth:  0.5,
                waveFreq:  4.5,        // tighter undulation = more turns
                fillDark:  0xc8b89a,   // pale tan — matches facehugger skin
                fillMid:   0xd4c4a8,   // slightly lighter band
                edgeColor: 0xa08060,   // muted amber outline
            });
        } else {
            this.tail = null;
        }

        // Shadow — fixed depth 5 sits below all sprites (floor decals are 2-3, chars start at 9+).
        this.shadowSprite = scene.add.image(this.x, this.y + 2, 'shadow_blob');
        this.shadowSprite.setDepth(5);
        this.shadowSprite.setScale(this.baseScale);

        this.nextVisualSyncAt = 0;
        this.syncVisualLayers(true);
    }

    getBaseTint(enemyType) {
        if (enemyType === 'drone') return 0xffffff;
        if (enemyType === 'facehugger') return 0xd5f5e3;
        if (enemyType === 'queenLesser') return 0x9ad2c3;
        if (enemyType === 'queen') return 0x8ec8ba;
        if (enemyType === 'warrior') return 0xffffff;
        return 0xb0dfcf;
    }

    takeDamage(amount) {
        if (!this.active) return false;
        this.health = Math.max(0, this.health - amount);
        this.damageTaken = (this.damageTaken || 0) + amount;
        this.applyHitSlow();

        if (this.scene && typeof this.scene.spawnAcidBloodEffect === 'function') {
            this.scene.spawnAcidBloodEffect(this.x, this.y);
        }

        this.setTintFill(0xffffff);
        this._hitFlashUntil = (this.scene?.time?.now || 0) + 60;
        // Hitstop: freeze velocity briefly for impact feel
        this.hitstopUntil = (this.scene?.time?.now || 0) + 50;
        if (this.body && this.body.enable) {
            this.body.setVelocity(0, 0);
        }
        this.scene?.eventBus?.emit('alienDamaged', { enemy: this, amount, healthAfter: this.health, type: this.enemyType });
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
        const typeSlowScale = this.enemyType === 'warrior' ? 0.45 : 1;
        const lowMul = 1 - (slowMax * typeSlowScale) / 100;
        const highMul = 1 - (slowMin * typeSlowScale) / 100;
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
        if (this.isDying) return;
        if (!this.active) return;
        this.isDying = true;
        this.scene?.eventBus?.emit('alienDied', { enemy: this, x: this.x, y: this.y, type: this.enemyType });
        this._corpseTimer = 0;
        this._corpseDuration = 8000;
        this.damageTaken = 0;
        // Corpse drift: subtle settling slide
        this._driftVx = (Math.random() - 0.5) * 8;
        this._driftVy = (Math.random() - 0.5) * 8;
        if (this.anims?.isPlaying) this.anims.pause();
        this.setActive(false);   // exclude from physics overlaps and targeting
        // Keep visible — corpse will fade out over _corpseDuration
        this.setVisible(true);
        this.setAlpha(1);
        this.setDepth(3);        // below living entities (chars start at 9+)
        this.body.stop();
        this.body.enable = false;
        this.setTint(0x304028);  // dark green corpse tint
        if (this.shadowSprite) this.shadowSprite.setVisible(false);
        if (this.ghostBlurSprite) this.ghostBlurSprite.setVisible(false);
        if (this.tendrilSprite) this.tendrilSprite.setVisible(false);
        if (this.legLeftSprite) this.legLeftSprite.setVisible(false);
        if (this.legRightSprite) this.legRightSprite.setVisible(false);
        if (this.tail) this.tail.hide();
        this._tailPos = null;

        // Scatter debris fragments from the corpse position (not facehuggers — just acid).
        if (this.scene?.alienCorpseDebris && this.enemyType !== 'facehugger') {
            if (this.enemyType === 'queen' || this.enemyType === 'queenLesser') {
                // === QUEEN MEGA-DEATH FX ===
                const isFullQueen = this.enemyType === 'queen';
                const debrisCount = isFullQueen ? 8 : 5;
                for (let i = 0; i < debrisCount; i++) {
                    this.scene.alienCorpseDebris.spawn(
                        this.x + Phaser.Math.Between(-40, 40), 
                        this.y + Phaser.Math.Between(-40, 40)
                    );
                }
                // Heavy camera shake
                if (this.scene.cameras?.main) {
                    const shakeDur = isFullQueen ? 1200 : 800;
                    const shakeIntensity = isFullQueen ? 0.038 : 0.022;
                    this.scene.cameras.main.shake(shakeDur, shakeIntensity);
                }
                // Acid geyser columns: 3 tall pillars of green smoke erupting upward
                const geyserCount = isFullQueen ? 3 : 2;
                for (let g = 0; g < geyserCount; g++) {
                    const gx = this.x + Phaser.Math.Between(-54, 54);
                    const gy = this.y + Phaser.Math.Between(-36, 36);
                    for (let j = 0; j < 7; j++) {
                        if (typeof this.scene.spawnFxSprite === 'function') {
                            this.scene.spawnFxSprite('smoke', gx, gy, {
                                life: Phaser.Math.Between(700, 1400),
                                vx: Phaser.Math.FloatBetween(-18, 18),
                                vy: -Phaser.Math.FloatBetween(100, 200),
                                gravityY: Phaser.Math.FloatBetween(25, 55),
                                drag: 0.1,
                                scaleStart: Phaser.Math.FloatBetween(0.12, 0.24),
                                scaleEnd: Phaser.Math.FloatBetween(0.55, 1.0),
                                alphaStart: Phaser.Math.FloatBetween(0.38, 0.68),
                                alphaEnd: 0,
                                tint: Phaser.Utils.Array.GetRandom([0x5ef03e, 0x3ed048, 0x88f844, 0x5ae070]),
                            });
                        }
                    }
                }
                // Particle storm: radial burst of acid fragments
                const stormCount = isFullQueen ? 28 : 16;
                for (let p = 0; p < stormCount; p++) {
                    const angle = ((p / stormCount) * Math.PI * 2) + Phaser.Math.FloatBetween(-0.25, 0.25);
                    const speed = Phaser.Math.FloatBetween(isFullQueen ? 220 : 150, isFullQueen ? 480 : 320);
                    if (typeof this.scene.spawnFxSprite === 'function') {
                        this.scene.spawnFxSprite('dot', this.x, this.y, {
                            life: Phaser.Math.Between(350, 800),
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            gravityY: Phaser.Math.FloatBetween(60, 140),
                            scaleStart: Phaser.Math.FloatBetween(0.28, 0.55),
                            scaleEnd: 0,
                            alphaStart: Phaser.Math.FloatBetween(0.65, 0.92),
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xd4e832, 0xe0f040, 0xc8d028, 0x5ef03e, 0x88f844]),
                            spin: Phaser.Math.FloatBetween(-14, 14),
                        });
                    }
                }
                // Screen flash: brief green-white wash
                if (this.scene.hitFlash && isFullQueen) {
                    this.scene.hitFlash.setFillStyle(0x88ff44, 1);
                    this.scene.hitFlash.setAlpha(0.28);
                    if (typeof this.scene.tweens?.add === 'function') {
                        this.scene.tweens.add({
                            targets: this.scene.hitFlash,
                            alpha: 0,
                            duration: 700,
                            ease: 'Cubic.out',
                        });
                    }
                }
                // Acid hazard pools: more for full queen
                const acidCount = isFullQueen ? 12 : 6;
                for (let i = 0; i < acidCount; i++) {
                    const spread = isFullQueen ? 72 : 48;
                    if (typeof this.scene.spawnAcidHazard === 'function') {
                        this.scene.spawnAcidHazard(
                            this.x + Phaser.Math.Between(-spread, spread),
                            this.y + Phaser.Math.Between(-spread, spread)
                        );
                    }
                }
            } else {
                this.scene.alienCorpseDebris.spawn(this.x, this.y);
            }
        }
    }

    /**
     * Update corpse fade. Called manually from EnemyManager on dying enemies.
     * @returns {boolean} true when fully faded and ready for cleanup.
     */
    updateCorpse(delta) {
        if (!this.isDying) return false;
        this._corpseTimer += delta;
        const dt = delta / 1000;
        // Corpse drift
        if (this._driftVx || this._driftVy) {
            this.x += this._driftVx * dt;
            this.y += this._driftVy * dt;
            this._driftVx *= 0.995;
            this._driftVy *= 0.995;
        }
        const progress = this._corpseTimer / this._corpseDuration;
        this.setAlpha(Math.max(0, 1 - progress * progress)); // ease-out fade
        if (progress >= 1) {
            this.setVisible(false);
            this.isDying = false;
            return true; // fully dead, can be cleaned up
        }
        return false;
    }

    createGhostBlurSprite(textureKey) {
        const key = `alien_${textureKey}`;
        if (!this.scene?.textures?.exists(key)) return null;
        const s = this.scene.add.image(this.x, this.y, key);
        s.setDepth(this.depth - 0.06);
        s.setVisible(false);
        s.setAlpha(0);
        s.setBlendMode(Phaser.BlendModes.NORMAL);
        return s;
    }

    createTendrilSprite() {
        if (!this.scene?.textures?.exists('alien_tendril_overlay')) return null;
        const s = this.scene.add.image(this.x, this.y, 'alien_tendril_overlay');
        s.setDepth(this.depth - 0.12);
        s.setVisible(true);
        s.setAlpha(0.34);
        s.setBlendMode(Phaser.BlendModes.NORMAL);
        return s;
    }

    createLegSprite(side = 1) {
        if (!this.scene?.textures?.exists('alien_leg_overlay')) return null;
        const s = this.scene.add.image(this.x, this.y, 'alien_leg_overlay');
        s.setDepth(this.depth - 0.16);
        s.setVisible(true);
        s.setAlpha(0.42);
        s.setBlendMode(Phaser.BlendModes.NORMAL);
        s._legSide = side >= 0 ? 1 : -1;
        return s;
    }

    setGhostBlur(strength = 0, tint = 0xa3adb5) {
        this.ghostBlurStrength = Phaser.Math.Clamp(Number(strength) || 0, 0, 1);
        if (!this.ghostBlurSprite) return;
        if (this.ghostBlurStrength <= 0.02 || !this.active) {
            this.ghostBlurSprite.setVisible(false);
            return;
        }
        this.ghostBlurSprite.setVisible(true);
        this.ghostBlurSprite.setTint(Number(tint) || 0xa3adb5);
        this.ghostBlurSprite.setAlpha(Phaser.Math.Clamp(0.08 + this.ghostBlurStrength * 0.44, 0.04, 0.52));
    }

    syncVisualLayers(force = false, time = 0) {
        const cam = this.scene?.cameras?.main;
        const worldView = cam?.worldView;
        const inView = !worldView
            ? true
            : (
                this.x >= (worldView.x - 128)
                && this.x <= (worldView.right + 128)
                && this.y >= (worldView.y - 128)
                && this.y <= (worldView.bottom + 128)
            );
        const show = this.active && this.visible && inView;
        if (this.shadowSprite) {
            this.shadowSprite.setVisible(show);
            if (show) {
                this.shadowSprite.setPosition(this.x, this.y + 2);
                // Match entity detection fade so undetected aliens don't cast a full shadow.
                this.shadowSprite.setAlpha(this.alpha * 0.3);
            }
        }
        if (this.tendrilSprite) this.tendrilSprite.setVisible(show);
        if (this.legLeftSprite) this.legLeftSprite.setVisible(show);
        if (this.legRightSprite) this.legRightSprite.setVisible(show);

        // Ghost blur can show even when main sprite is invisible (undetected alien shimmer)
        const ghostActive = this.active && inView && this.ghostBlurStrength > 0.02;
        if (this.ghostBlurSprite) this.ghostBlurSprite.setDepth(this.depth - 0.22);
        if (!show) {
            // Update ghost blur position even when main sprite is hidden
            if (this.ghostBlurSprite) {
                if (ghostActive) {
                    const gt = (Number(time) || 0) * 0.0032 + (this.patternSeed || 0);
                    const gjx = Math.sin(gt * 1.9) * 0.6;
                    const gjy = Math.cos(gt * 1.6) * 0.4;
                    this.ghostBlurSprite.setVisible(true);
                    this.ghostBlurSprite.setPosition(this.x + gjx * 1.3, this.y + gjy * 1.1);
                    this.ghostBlurSprite.setRotation(this.rotation || 0);
                    const blurScale = 1.02 + this.ghostBlurStrength * 0.08;
                    this.ghostBlurSprite.setScale((this.scaleX || 1) * blurScale, (this.scaleY || 1) * blurScale);
                    this.ghostBlurSprite.setAlpha(Phaser.Math.Clamp(0.06 + this.ghostBlurStrength * 0.32, 0.04, 0.42));
                } else {
                    this.ghostBlurSprite.setVisible(false);
                }
            }
            return;
        }
        const t = (Number(time) || 0) * 0.0032 + (this.patternSeed || 0);
        const jitterX = Math.sin(t * 1.9) * 0.6;
        const jitterY = Math.cos(t * 1.6) * 0.4;
        const forwardA = this.rotation || 0;
        
        if (this.tendrilSprite) {
            const bob = 0.96 + 0.08 * Math.sin(t * 2.2 + (this.wobble || 0));
            this.tendrilSprite.setPosition(this.x + jitterX, this.y + 2 + jitterY);
            this.tendrilSprite.setRotation(forwardA + Math.sin(t * 2.4) * 0.22);
            this.tendrilSprite.setScale((this.scaleX || 1) * bob, (this.scaleY || 1) * (0.92 + 0.08 * Math.cos(t * 2.0)));
            // Scale with main alpha, but keep a lower ceiling
            this.tendrilSprite.setAlpha(this.alpha * 0.45);
        }

        const updateLeg = (legSprite, phase = 0) => {
            if (!legSprite) return;
            const side = Number(legSprite._legSide) || 1;
            const spread = (9 + 3.5 * Math.sin(t * 2.6 + phase)) * (this.scaleX || 1);
            const back = 3.5 * (this.scaleX || 1);
            const lateralX = Math.cos(forwardA + Math.PI * 0.5) * spread * side;
            const lateralY = Math.sin(forwardA + Math.PI * 0.5) * spread * side;
            const backX = -Math.cos(forwardA) * back;
            const backY = -Math.sin(forwardA) * back;
            legSprite.setPosition(this.x + lateralX + backX, this.y + lateralY + backY);
            legSprite.setRotation(forwardA + side * (0.42 + Math.sin(t * 3.3 + phase) * 0.28));
            legSprite.setScale(
                (this.scaleX || 1) * (0.76 + 0.16 * Math.sin(t * 2.9 + phase)),
                (this.scaleY || 1) * (0.74 + 0.14 * Math.cos(t * 2.5 + phase))
            );
            // Scale with main alpha
            legSprite.setAlpha(this.alpha * 0.55);
        };
        updateLeg(this.legLeftSprite, 0.2);
        updateLeg(this.legRightSprite, 1.6);

        // Tail visibility is managed entirely in TailComponent.update() (called from preUpdate).
        // It hard-couples to owner.visible + owner.alpha every frame — no manual sync needed.

        if (this.ghostBlurSprite && (this.ghostBlurStrength > 0.02 || force)) {
            this.ghostBlurSprite.setVisible(this.ghostBlurStrength > 0.02);
            this.ghostBlurSprite.setPosition(this.x + jitterX * 1.3, this.y + jitterY * 1.1);
            this.ghostBlurSprite.setRotation(this.rotation || 0);
            const blurScale = 1.06 + this.ghostBlurStrength * 0.16;
            this.ghostBlurSprite.setScale((this.scaleX || 1) * blurScale, (this.scaleY || 1) * blurScale);
            this.ghostBlurSprite.setAlpha(Phaser.Math.Clamp(0.08 + this.ghostBlurStrength * 0.44, 0.04, 0.52));
        }
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        if (this.tail) this.tail.update(time, delta);

        // ── Wound steam ── the more damage taken, the more acid steam leaks out.
        if (this.active && !this.isDying && (this.damageTaken || 0) > 0 && time >= (this.nextWoundSteamAt || 0)) {
            const woundRatio = Phaser.Math.Clamp(this.damageTaken / Math.max(1, this.maxHealth), 0, 1);
            // Only start emitting once they've taken >=15% of max HP.
            if (woundRatio >= 0.15 && this.scene && typeof this.scene.spawnFxSprite === 'function') {
                const wisps = woundRatio > 0.6 ? Phaser.Math.Between(2, 4) : (woundRatio > 0.35 ? Phaser.Math.Between(1, 3) : 1);
                for (let w = 0; w < wisps; w++) {
                    const sDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    this.scene.spawnFxSprite('smoke',
                        this.x + Phaser.Math.FloatBetween(-6, 6),
                        this.y + Phaser.Math.FloatBetween(-6, 6),
                        {
                            vx: Math.cos(sDir) * Phaser.Math.FloatBetween(4, 14),
                            vy: Phaser.Math.FloatBetween(-40, -12) - woundRatio * 20,
                            life: Phaser.Math.Between(400, 900),
                            scaleStart: Phaser.Math.FloatBetween(0.05, 0.12 + woundRatio * 0.08),
                            scaleEnd: Phaser.Math.FloatBetween(0.2, 0.45 + woundRatio * 0.15),
                            alphaStart: Phaser.Math.FloatBetween(0.10, 0.22) * (0.5 + woundRatio * 0.5),
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xb0b840, 0xc0c828, 0x909828, 0xa0a830]),
                            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                            spin: Phaser.Math.FloatBetween(-0.8, 0.8),
                            drag: 1.05,
                        }
                    );
                }
                // Interval shrinks as damage increases (more wounded = more frequent steam).
                const baseInterval = Phaser.Math.Linear(1400, 350, woundRatio);
                this.nextWoundSteamAt = time + Phaser.Math.Between(
                    Math.round(baseInterval * 0.7),
                    Math.round(baseInterval * 1.3)
                );
            } else {
                this.nextWoundSteamAt = time + 800;
            }
        }

        if (this._hitFlashUntil && time >= this._hitFlashUntil) {
            this._hitFlashUntil = 0;
            if (this.active) {
                this.clearTint();
                this.setTint(this.currentDisplayTint || this.baseTint || 0xffffff);
            }
        }

        const alive = Number(this.scene?.enemyManager?.aliveCount) || 0;
        let intervalMs = 16;
        if (alive >= 28) intervalMs = 44;
        else if (alive >= 20) intervalMs = 34;
        else if (alive >= 14) intervalMs = 24;
        const cam = this.scene?.cameras?.main;
        const view = cam?.worldView;
        if (view) {
            const onScreen = (
                this.x >= view.x
                && this.x <= view.right
                && this.y >= view.y
                && this.y <= view.bottom
            );
            if (!onScreen) intervalMs = Math.max(intervalMs, 58);
        }
        if (!Number.isFinite(this.nextVisualSyncAt) || time >= this.nextVisualSyncAt) {
            this.nextVisualSyncAt = time + intervalMs;
        } else {
            return;
        }
        this.syncVisualLayers(false, time);
    }

    updateWalkAnimation(vx = Number(this.body?.velocity?.x) || 0, vy = Number(this.body?.velocity?.y) || 0) {
        if (!this.walkAnimKey || !this.anims) return;
        const bodyVx = Number(this.body?.velocity?.x);
        const bodyVy = Number(this.body?.velocity?.y);
        const speed = Math.hypot(
            Number.isFinite(bodyVx) ? bodyVx : (Number(vx) || 0),
            Number.isFinite(bodyVy) ? bodyVy : (Number(vy) || 0)
        );
        if (!this.active || !this.visible || speed < 8) {
            if (this.anims.isPlaying) this.anims.pause();
            return;
        }
        if (!this.anims.currentAnim || this.anims.currentAnim.key !== this.walkAnimKey) {
            this.anims.play(this.walkAnimKey, true);
        }
        if (this.anims.isPaused) this.anims.resume();
        const runtimeMul = Phaser.Math.Clamp(Number(this.scene?.runtimeSettings?.spriteAnimation?.animationRateMul) || 1, 0.1, 4);
        const strideSpeed = Math.max(1, Number(this.animStrideSpeed) || Number(this.stats?.speed) || 100);
        const normalized = Phaser.Math.Clamp(speed / strideSpeed, 0.3, 2.4);
        this.anims.timeScale = Phaser.Math.Clamp(normalized * this.walkAnimRate * runtimeMul, 0.42, 3.2);
    }

    destroy(fromScene) {
        if (this.ghostBlurSprite) {
            this.ghostBlurSprite.destroy();
            this.ghostBlurSprite = null;
        }
        if (this.tendrilSprite) {
            this.tendrilSprite.destroy();
            this.tendrilSprite = null;
        }
        if (this.legLeftSprite) {
            this.legLeftSprite.destroy();
            this.legLeftSprite = null;
        }
        if (this.legRightSprite) {
            this.legRightSprite.destroy();
            this.legRightSprite = null;
        }
        if (this.tail) {
            this.tail.destroy();
            this.tail = null;
        }
        if (this.shadowSprite) {
            this.shadowSprite.destroy();
            this.shadowSprite = null;
        }
        super.destroy(fromScene);
    }
}
