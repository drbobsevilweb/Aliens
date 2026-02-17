import { CONFIG } from '../config.js';
import {
    ENEMIES,
    ENEMY_VENT_POINTS,
    EGG_CLUSTERS,
    EGG_TRIGGER_RANGE,
    EGG_OPEN_DURATION_MS,
    EGG_COOLDOWN_MS,
    tileToWorld
} from '../data/enemyData.js';
import { AlienEnemy } from '../entities/AlienEnemy.js';
import { AlienEgg } from '../entities/AlienEgg.js';

export class EnemyManager {
    constructor(scene, wallLayer, doorGroup, raycaster, lightBlockerGrid, acidPool = null, options = null) {
        this.scene = scene;
        this.wallLayer = wallLayer;
        this.doorGroup = doorGroup;
        this.raycaster = raycaster;
        this.lightBlockerGrid = lightBlockerGrid;
        this.acidPool = acidPool;
        this.enemies = [];
        this.labels = new Map();
        this.motionContacts = [];
        this.aliveCount = 0;
        this.detectionCooldownMs = Number(scene.runtimeSettings?.scripting?.eventTickMs) || 80;
        this.nextDetectionAt = 0;
        this.enemyGroup = this.scene.physics.add.group();
        this.eggGroup = this.scene.physics.add.group({ immovable: true, allowGravity: false });
        this.settings = (options && options.enemies) || {};
        this.gunfireAlertMs = 3400;
        this.visualAlertMs = 4200;
        this.lightStimulusMemoryMs = 520;
        this.lightStimulusRange = 460;
        this.lightStimuli = [];
        this.enemyHealthScale = Number(this.settings.globalHealthScale) || 0.68;
        this.enemySpeedScale = (Number(this.settings.globalSpeedScale) || 1) * 1.5;
        this.enemyDamageScale = Number(this.settings.globalDamageScale) || 1;
        this.visibilitySettings = (this.scene.runtimeSettings && this.scene.runtimeSettings.visibility) || {};
        this.spottedMemoryMs = Number(this.visibilitySettings.spottedMemoryMs) || CONFIG.SPOTTED_MEMORY_MS;
        this.trackerRange = Number(this.visibilitySettings.trackerRange) || CONFIG.MOTION_TRACKER_RANGE;
        this.ventPoints = ENEMY_VENT_POINTS.map((v) => tileToWorld(v.tileX, v.tileY));
        this.eggs = [];
        this.maxOpenEggs = 2;
        this.doorPressure = 0;
        this.lastDoorPressureAt = 0;
        this.shouldCollideWithDoor = (enemy, door) => {
            return !!door && !!door.doorGroup && door.doorGroup.state !== 'open';
        };
        this.createEggClusters();
    }

    spawnWave(spawns, waveNumber = 1) {
        if (!spawns || spawns.length === 0) return 0;
        const difficulty = Math.max(1, 1 + (waveNumber - 1) * 0.14);

        let spawned = 0;
        for (const spawn of spawns) {
            if (this.scene && this.scene.warriorOnlyTesting && spawn.type !== 'warrior') continue;
            const p = tileToWorld(spawn.tileX, spawn.tileY);
            if (this.spawnEnemyAtWorld(spawn.type, p.x, p.y, difficulty)) spawned++;
        }

        return spawned;
    }

    spawnEnemyAtWorld(type, worldX, worldY, difficulty = 1) {
        if (this.scene && this.scene.warriorOnlyTesting && type !== 'warrior') {
            type = 'warrior';
        }
        const def = ENEMIES[type];
        if (!def) return null;
        const enemy = new AlienEnemy(this.scene, worldX, worldY, def);
        this.enemies.push(enemy);
        this.enemyGroup.add(enemy);
        this.aliveCount++;
        const typeTuning = (this.settings.types && this.settings.types[type]) || {};
        const hpMul = Number(typeTuning.healthMultiplier) || 1;
        const speedMul = Number(typeTuning.speedMultiplier) || 1;
        const dmgMul = Number(typeTuning.damageMultiplier) || 1;

        enemy.maxHealth = Math.ceil(enemy.maxHealth * difficulty * this.enemyHealthScale * hpMul);
        enemy.health = enemy.maxHealth;
        enemy.stats.speed *= difficulty * this.enemySpeedScale * speedMul;
        enemy.stats.contactDamage = Math.ceil(enemy.stats.contactDamage * difficulty * this.enemyDamageScale * dmgMul);
        enemy.stats.doorAttackCooldownMs = Math.max(220, Math.floor(enemy.stats.doorAttackCooldownMs / difficulty));
        const alienScale = Number(this.scene?.runtimeSettings?.spriteAnimation?.alienSpriteScale) || 1;
        enemy.setScale((def.sizeScale || 1) * alienScale);

        const label = this.scene.add.text(0, 0, def.name.toUpperCase(), {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#111111',
            padding: { left: 3, right: 3, top: 1, bottom: 1 },
        });
        label.setDepth(CONFIG.DETECTION_LABEL_DEPTH);
        label.setVisible(false);
        this.labels.set(enemy, label);

        this.scene.physics.add.collider(enemy, this.wallLayer);
        this.scene.physics.add.collider(enemy, this.doorGroup, null, this.shouldCollideWithDoor);
        enemy.visibleUntil = 0;
        enemy.fullVisibleUntil = 0;
        enemy.revealCharge = 0;
        enemy.lastRevealTickAt = this.scene.time.now || 0;
        enemy.intent = 'assault';
        enemy.nextIntentAt = 0;
        enemy.detected = false;
        enemy.investigatePoint = null;
        enemy.investigateUntil = 0;
        enemy.feintPhase = Math.random() * Math.PI * 2;
        enemy.feintDir = Math.random() < 0.5 ? -1 : 1;
        enemy.nextFeintFlipAt = this.scene.time.now + Phaser.Math.Between(180, 520);
        enemy.nextDodgeAt = this.scene.time.now + Phaser.Math.Between(280, 1200);
        enemy.dodgeUntil = 0;
        enemy.dodgeAngle = 0;
        enemy.dodgeForwardMul = 0.5;
        enemy.nextLungeAt = this.scene.time.now + Phaser.Math.Between(520, 1800);
        enemy.lungeUntil = 0;
        enemy.lungeAngle = 0;
        enemy.lungeSpeedMul = 1;
        enemy.setAlpha(0);
        return enemy;
    }

    registerLightStimulus(x, y, time, power = 1) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(time)) return;
        const p = Phaser.Math.Clamp(Number(power) || 1, 0.2, 2.5);
        if (this.lightStimuli.length >= 120) this.lightStimuli.shift();
        this.lightStimuli.push({ x, y, time, power: p });
    }

    pruneLightStimuli(time) {
        const maxAge = this.lightStimulusMemoryMs;
        this.lightStimuli = this.lightStimuli.filter((s) => (time - s.time) <= maxAge);
    }

    getBestLightStimulus(enemy, time) {
        if (!enemy || !this.lightStimuli || this.lightStimuli.length === 0) return null;
        let best = null;
        let bestScore = 0;
        const maxAge = Math.max(1, this.lightStimulusMemoryMs);
        for (const s of this.lightStimuli) {
            const age = time - s.time;
            if (age < 0 || age > maxAge) continue;
            const freshness = 1 - (age / maxAge);
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y);
            const effectiveRange = this.lightStimulusRange * (0.75 + s.power * 0.25);
            if (dist > effectiveRange) continue;
            const score = (freshness * s.power) / Math.max(1, dist);
            if (score > bestScore) {
                best = s;
                bestScore = score;
            }
        }
        return best;
    }

    update(time, delta, marines, context = {}) {
        if (!marines || marines.length === 0) return;
        const dt = delta / 1000;
        const camera = context.camera || this.scene.cameras.main;
        const gunfire = context.gunfire === true;
        const combatMods = context.combatMods || {
            enemyAggressionMul: 1,
            enemyFlankMul: 1,
            enemyDoorDamageMul: 1,
            pressure: 0.3,
        };
        this.pruneLightStimuli(time);
        this.updateEggs(time, marines);
        const ambientDarkness = Phaser.Math.Clamp(Number(this.scene?.runtimeSettings?.lighting?.ambientDarkness) || 0.5, 0, 1);
        const darknessBias = Phaser.Math.Clamp((ambientDarkness - 0.38) / 0.62, 0, 1);
        const targetPressure = new Map();

        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            const target = this.pickTargetMarine(enemy, marines, targetPressure);
            if (!target || target.active === false || target.alive === false) continue;
            targetPressure.set(target, (targetPressure.get(target) || 0) + 1);
            const hasDirectMarineSense = this.hasDirectMarineSense(enemy, marines);
            const flashStimulus = this.getBestLightStimulus(enemy, time);
            if (flashStimulus) {
                const alertMs = 900 + Math.round(1200 * flashStimulus.power * (1 + darknessBias * 0.9));
                enemy.alertUntil = Math.max(enemy.alertUntil, time + alertMs);
                enemy.investigatePoint = { x: flashStimulus.x, y: flashStimulus.y, power: flashStimulus.power };
                enemy.investigateUntil = Math.max(enemy.investigateUntil || 0, time + Math.floor(alertMs * (0.95 + darknessBias * 0.3)));
            }

            if (enemy.detected) {
                enemy.alertUntil = Math.max(enemy.alertUntil, time + this.visualAlertMs);
                enemy.lastSeenAt = time;
            }
            if (gunfire && this.isWithinCameraAggro(enemy, camera, enemy.stats.aggroRange)) {
                enemy.alertUntil = Math.max(enemy.alertUntil, time + this.gunfireAlertMs);
            }

            const isAggro = time < enemy.alertUntil;
            if (isAggro && enemy.stats.canUseVents) {
                this.tryDroneVentAmbush(enemy, target, marines, time);
            }

            if (enemy.enemyType === 'facehugger' && this.updateFacehugger(enemy, target, time, dt)) {
                continue;
            }

            const pursuingLightStimulus = isAggro &&
                enemy.investigatePoint &&
                (time < (enemy.investigateUntil || 0)) &&
                (!enemy.detected || !hasDirectMarineSense);
            let desired = pursuingLightStimulus
                ? this.computeInvestigateVelocity(enemy, enemy.investigatePoint, time)
                : (isAggro
                    ? this.computeAggroVelocity(enemy, target, marines)
                    : this.computePatrolVelocity(enemy));
            if (pursuingLightStimulus) {
                const dStim = Phaser.Math.Distance.Between(
                    enemy.x,
                    enemy.y,
                    enemy.investigatePoint.x,
                    enemy.investigatePoint.y
                );
                if (dStim <= 18 && !hasDirectMarineSense) {
                    enemy.investigateUntil = Math.max(enemy.investigateUntil, time + Math.round(380 + darknessBias * 760));
                }
            }

            if (enemy.enemyType === 'warrior') {
                this.updateWarriorIntent(enemy, time, combatMods.pressure);
                desired = this.applyWarriorIntent(enemy, target, desired, combatMods);
            }

            if (isAggro && enemy.enemyType !== 'facehugger') {
                const spacing = this.applyMeleeSpacing(enemy, target, desired, time);
                desired = spacing.desired;
            }
            if (isAggro) {
                desired = this.applyAggroBurstMovement(enemy, target, desired, time, combatMods);
            }

            const doorGroup = this.findNearbyBlockingDoor(enemy, 48);
            if (doorGroup) {
                if (enemy.stats.canOpenUnlockedDoors && doorGroup.state === 'closed') {
                    doorGroup.open(
                        this.scene.pathGrid,
                        this.scene.doorManager.physicsGroup,
                        this.scene.lightBlockerGrid,
                        this.scene.wallLayer
                    );
                }
                const center = this.getDoorCenter(doorGroup);
                const da = Phaser.Math.Angle.Between(enemy.x, enemy.y, center.x, center.y);
                const doorBias = enemy.swarmSide * 0.55;
                const nearDoor = Phaser.Math.Distance.Between(enemy.x, enemy.y, center.x, center.y) < 90;
                if (nearDoor) {
                    desired.vx += Math.cos(da + doorBias) * enemy.stats.speed * 0.4 * combatMods.enemyAggressionMul;
                    desired.vy += Math.sin(da + doorBias) * enemy.stats.speed * 0.4 * combatMods.enemyAggressionMul;
                }
                const canDamageDoor = enemy.stats.canBreachAnyDoor || doorGroup.state !== 'open';
                if (
                    canDamageDoor &&
                    Phaser.Math.Distance.Between(enemy.x, enemy.y, center.x, center.y) <= 30 &&
                    time >= enemy.nextDoorHitAt
                ) {
                    const doorDamage = Math.max(1, Math.round(enemy.stats.doorDamage * combatMods.enemyDoorDamageMul));
                    const breached = doorGroup.applyEnemyDamage(
                        doorDamage,
                        this.scene.pathGrid,
                        this.scene.doorManager.physicsGroup,
                        this.scene.lightBlockerGrid,
                        this.scene.wallLayer
                    );
                    this.doorPressure += doorDamage;
                    this.lastDoorPressureAt = time;
                    if (this.scene && typeof this.scene.reportDoorThump === 'function') {
                        this.scene.reportDoorThump(center.x, center.y, time, breached);
                    }
                    enemy.nextDoorHitAt = time + enemy.stats.doorAttackCooldownMs;
                }
            }

            const speedScale = enemy.getSpeedMultiplier(time);
            const maxSpeed = enemy.stats.speed * speedScale * combatMods.enemyAggressionMul;
            desired.vx *= speedScale;
            desired.vy *= speedScale;
            const mag = Math.sqrt(desired.vx * desired.vx + desired.vy * desired.vy);
            if (mag > maxSpeed) {
                desired.vx = (desired.vx / mag) * maxSpeed;
                desired.vy = (desired.vy / mag) * maxSpeed;
            }
            enemy.body.setVelocity(desired.vx, desired.vy);
            if (Math.abs(desired.vx) + Math.abs(desired.vy) > 0.001) {
                enemy.setRotation(Math.atan2(desired.vy, desired.vx));
            }

            const contactDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
            const meleeMin = CONFIG.TILE_SIZE * 0.82;
            const meleeMax = CONFIG.TILE_SIZE * 1.18;
            if (contactDist >= meleeMin && contactDist <= meleeMax && time >= enemy.nextAttackAt) {
                if (this.rollMeleeHit(enemy, target, contactDist)) {
                    this.applyMarineDamage(target, enemy.stats.contactDamage, enemy);
                    const objTune = this.scene?.runtimeSettings?.objects || {};
                    const splashChance = Phaser.Math.Clamp(Number(objTune.acidMeleeSplashChance) || 0.48, 0, 1);
                    const poolChance = Phaser.Math.Clamp(Number(objTune.acidMeleePoolChance) || 0.26, 0, 1);
                    if (this.scene && typeof this.scene.showAlienAcidSplash === 'function' && Math.random() < splashChance) {
                        this.scene.showAlienAcidSplash(target.x, target.y);
                    }
                    if (this.scene && typeof this.scene.spawnAcidHazard === 'function' && Math.random() < poolChance) {
                        this.scene.spawnAcidHazard(target.x + Phaser.Math.Between(-8, 8), target.y + Phaser.Math.Between(-8, 8), {
                            radius: Phaser.Math.Between(12, 20),
                            duration: Phaser.Math.Between(1600, 3000),
                            damageScale: Phaser.Math.FloatBetween(0.5, 0.9),
                        });
                    }
                }
                enemy.nextAttackAt = time + enemy.stats.attackCooldownMs;
            }
        }

        this.updateLabels();
    }

    applyAggroBurstMovement(enemy, target, desired, time, combatMods = null) {
        if (!enemy || !target || !desired) return desired;
        if (enemy.enemyType !== 'warrior' && enemy.enemyType !== 'drone') return desired;

        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const nearMin = CONFIG.TILE_SIZE * 1.25;
        const farMax = CONFIG.TILE_SIZE * 6.2;
        const pressure = Phaser.Math.Clamp(Number(combatMods?.pressure) || 0.3, 0, 1);
        const burstSpeedMul = enemy.enemyType === 'drone' ? 1.26 : 1.16;
        const toTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        if (enemy.enemyType === 'drone') {
            if (time < (enemy.lungeUntil || 0)) {
                const lungeA = Number(enemy.lungeAngle) || toTarget;
                const lungeMul = Phaser.Math.Clamp(Number(enemy.lungeSpeedMul) || 1.4, 1.2, 2.2);
                return {
                    vx: desired.vx * 0.06 + Math.cos(lungeA) * enemy.stats.speed * lungeMul,
                    vy: desired.vy * 0.06 + Math.sin(lungeA) * enemy.stats.speed * lungeMul,
                };
            }
            const lungeRangeMin = CONFIG.TILE_SIZE * 1.4;
            const lungeRangeMax = CONFIG.TILE_SIZE * 4.2;
            const canLunge = dist >= lungeRangeMin && dist <= lungeRangeMax && time >= (enemy.nextLungeAt || 0);
            if (canLunge) {
                const lungeChance = Phaser.Math.Clamp(0.11 + pressure * 0.24, 0.1, 0.42);
                if (Math.random() < lungeChance) {
                    const sideOffset = Phaser.Math.FloatBetween(-0.12, 0.12) + (enemy.swarmSide || 1) * Phaser.Math.FloatBetween(0.02, 0.08);
                    enemy.lungeAngle = toTarget + sideOffset;
                    enemy.lungeSpeedMul = Phaser.Math.FloatBetween(1.34, 1.82);
                    enemy.lungeUntil = time + Phaser.Math.Between(130, 220);
                    enemy.nextLungeAt = time + Phaser.Math.Between(
                        Math.max(620, Math.floor(1280 - pressure * 420)),
                        Math.max(900, Math.floor(1860 - pressure * 260))
                    );
                    return {
                        vx: desired.vx * 0.08 + Math.cos(enemy.lungeAngle) * enemy.stats.speed * enemy.lungeSpeedMul,
                        vy: desired.vy * 0.08 + Math.sin(enemy.lungeAngle) * enemy.stats.speed * enemy.lungeSpeedMul,
                    };
                }
                enemy.nextLungeAt = time + Phaser.Math.Between(420, 860);
            }
        }

        if (time < (enemy.dodgeUntil || 0)) {
            const lat = enemy.dodgeAngle || (toTarget + Math.PI * 0.5 * (enemy.swarmSide || 1));
            const fwd = Number(enemy.dodgeForwardMul) || 0.5;
            return {
                vx: desired.vx * 0.18 + Math.cos(lat) * enemy.stats.speed * burstSpeedMul + Math.cos(toTarget) * enemy.stats.speed * fwd,
                vy: desired.vy * 0.18 + Math.sin(lat) * enemy.stats.speed * burstSpeedMul + Math.sin(toTarget) * enemy.stats.speed * fwd,
            };
        }

        if (dist < nearMin || dist > farMax || time < (enemy.nextDodgeAt || 0)) return desired;

        const burstChance = Phaser.Math.Clamp(0.06 + pressure * 0.22, 0.05, 0.34);
        if (Math.random() > burstChance) {
            enemy.nextDodgeAt = time + Phaser.Math.Between(380, 880);
            return desired;
        }

        const side = Math.random() < 0.5 ? -1 : 1;
        enemy.dodgeAngle = toTarget + side * Math.PI * 0.5 + Phaser.Math.FloatBetween(-0.18, 0.18);
        enemy.dodgeForwardMul = enemy.enemyType === 'drone'
            ? Phaser.Math.FloatBetween(0.42, 0.58)
            : Phaser.Math.FloatBetween(0.5, 0.7);
        const burstMs = enemy.enemyType === 'drone'
            ? Phaser.Math.Between(120, 240)
            : Phaser.Math.Between(140, 260);
        enemy.dodgeUntil = time + burstMs;
        enemy.nextDodgeAt = time + Phaser.Math.Between(
            Math.max(320, Math.floor(980 - pressure * 520)),
            Math.max(620, Math.floor(1500 - pressure * 420))
        );
        return desired;
    }

    pickTargetMarine(enemy, marines, targetPressure = null) {
        let best = null;
        let bestScore = Infinity;
        for (const m of marines) {
            if (!m || m.active === false || m.alive === false) continue;
            if (typeof m.health === 'number' && m.health <= 0) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
            const pressureN = targetPressure ? (targetPressure.get(m) || 0) : 0;
            const pressurePenalty = pressureN * 72;
            const maxHp = Math.max(1, Number(m.maxHealth) || 100);
            const hpPct = Phaser.Math.Clamp((Number(m.health) || 0) / maxHp, 0, 1);
            const protectLowHpBonus = (1 - hpPct) * 42;
            const score = d + pressurePenalty + protectLowHpBonus;
            if (score < bestScore) {
                bestScore = score;
                best = m;
            }
        }
        return best || marines[0] || null;
    }

    applyMarineDamage(target, amount, attacker = null) {
        if (!target || amount <= 0) return;
        const tuning = this.scene?.runtimeSettings?.marines || {};
        const maxHp = Math.max(1, Number(target.maxHealth) || 100);
        let dmg = Math.max(0, Number(amount) || 0);

        const baseMul = Phaser.Math.Clamp(Number(tuning.incomingDamageMul) || 0.84, 0.2, 2);
        const leaderMul = Phaser.Math.Clamp(Number(tuning.leaderIncomingDamageMul) || 0.9, 0.2, 2);
        const heavyMul = Phaser.Math.Clamp(Number(tuning.heavyIncomingDamageMul) || 0.82, 0.2, 2);
        const techMul = Phaser.Math.Clamp(Number(tuning.techIncomingDamageMul) || 0.96, 0.2, 2);
        const medicMul = Phaser.Math.Clamp(Number(tuning.medicIncomingDamageMul) || 0.98, 0.2, 2);
        dmg *= baseMul;
        if (!target.roleKey) dmg *= leaderMul;
        else if (target.roleKey === 'heavy') dmg *= heavyMul;
        else if (target.roleKey === 'tech') dmg *= techMul;
        else if (target.roleKey === 'medic') dmg *= medicMul;

        const focusGraceMs = Phaser.Math.Clamp(Number(tuning.focusFireGraceMs) || 900, 100, 4000);
        const focusGraceMul = Phaser.Math.Clamp(Number(tuning.focusFireGraceMul) || 0.62, 0.1, 1);
        const lastHitAt = Number.isFinite(target.lastDamagedAt) ? target.lastDamagedAt : -100000;
        const now = this.scene?.time?.now || 0;
        if ((now - lastHitAt) <= focusGraceMs) {
            dmg *= focusGraceMul;
        }

        const maxHitPct = Phaser.Math.Clamp(Number(tuning.maxHitPctOfMaxHp) || 0.16, 0.04, 0.5);
        const maxHit = Math.max(1, Math.floor(maxHp * maxHitPct));
        const currentHp = Math.max(0, Number(target.health) || 0);
        const hpPct = Phaser.Math.Clamp(currentHp / maxHp, 0, 1);
        const squad = this.scene?.squadSystem?.getAllMarines?.() || [this.scene?.leader].filter(Boolean);
        const teamHpPctRaw = this.scene?.getTeamHealthPct ? this.scene.getTeamHealthPct(squad) : 1;
        const teamHpPct = Phaser.Math.Clamp(Number(teamHpPctRaw) || 1, 0, 1);
        const lowHpStart = Phaser.Math.Clamp(Number(tuning.lowHpMitigationStartPct) || 0.35, 0.1, 0.8);
        const lowHpMinMul = Phaser.Math.Clamp(Number(tuning.lowHpMitigationMulMin) || 0.58, 0.2, 1);
        if (hpPct < lowHpStart) {
            const t = Phaser.Math.Clamp(hpPct / Math.max(0.001, lowHpStart), 0, 1);
            dmg *= Phaser.Math.Linear(lowHpMinMul, 1, t);
        }
        if (teamHpPct < 0.5) {
            const teamRelief = Phaser.Math.Linear(0.64, 1, Phaser.Math.Clamp(teamHpPct / 0.5, 0, 1));
            dmg *= teamRelief;
        }
        if (hpPct < 0.2) dmg *= 0.86;
        dmg = Math.max(1, Math.min(maxHit, Math.round(dmg)));

        const attackerRef = attacker && attacker.active ? attacker : null;
        if (attackerRef) {
            target.lastThreatX = attackerRef.x;
            target.lastThreatY = attackerRef.y;
            target.lastThreatAt = now;
            target.lastThreatType = attackerRef.enemyType || 'xeno';
        }
        if (typeof target.takeDamage === 'function') {
            target.takeDamage(dmg);
            if (this.scene && typeof this.scene.onMarineDamaged === 'function') {
                this.scene.onMarineDamaged(target, dmg, now);
            }
            return;
        }
        const leader = this.scene && this.scene.leader;
        if (leader && typeof leader.takeDamage === 'function') {
            leader.takeDamage(dmg);
            if (this.scene && typeof this.scene.onMarineDamaged === 'function') {
                this.scene.onMarineDamaged(leader, dmg, now);
            }
        }
    }

    rollMeleeHit(enemy, target, contactDist) {
        const maxHp = Math.max(1, Number(target?.maxHealth) || 100);
        const hpPct = Phaser.Math.Clamp((Number(target?.health) || 0) / maxHp, 0, 1);
        let hitChance = 0.82;
        if (enemy?.enemyType === 'drone') hitChance = 0.78;
        if (enemy?.enemyType === 'facehugger') hitChance = 0.86;
        if (enemy?.enemyType === 'queen' || enemy?.enemyType === 'queenLesser') hitChance = 0.9;

        const rangeSpan = Math.max(1, CONFIG.TILE_SIZE * 0.36);
        const edgePenalty = Phaser.Math.Clamp((contactDist - CONFIG.TILE_SIZE * 0.94) / rangeSpan, 0, 1) * 0.14;
        hitChance -= edgePenalty;

        // Slight mercy when target is already critical.
        if (hpPct < 0.32) hitChance -= (0.32 - hpPct) * 0.35;

        const slowed = (this.scene?.time?.now || 0) <= (enemy?.hitSlowUntil || 0);
        if (slowed) hitChance -= 0.08;

        hitChance = Phaser.Math.Clamp(hitChance, 0.48, 0.95);
        return Math.random() < hitChance;
    }

    isWithinCameraAggro(enemy, camera, range) {
        const view = camera.worldView;
        const inView = Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y);
        if (inView) return true;
        const cx = view.centerX;
        const cy = view.centerY;
        return Phaser.Math.Distance.Between(cx, cy, enemy.x, enemy.y) <= range;
    }

    computePatrolVelocity(enemy) {
        const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y);
        if (d <= 14) {
            enemy.patrolTarget = this.pickPatrolTarget(enemy);
        }
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y);
        return {
            vx: Math.cos(angle) * enemy.stats.speed * 0.62,
            vy: Math.sin(angle) * enemy.stats.speed * 0.62,
        };
    }

    computeInvestigateVelocity(enemy, point, time) {
        const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, point.x, point.y);
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, point.x, point.y);
        if (dist <= 24) {
            const orbitDir = enemy.swarmSide || 1;
            const wobble = Math.sin(time * 0.009 + enemy.patternSeed) * 0.35;
            const searchA = a + orbitDir * (Math.PI * 0.5 + wobble);
            const s = enemy.stats.speed * 0.62;
            return {
                vx: Math.cos(searchA) * s,
                vy: Math.sin(searchA) * s,
            };
        }
        const s = enemy.stats.speed * 0.9;
        return {
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
        };
    }

    hasDirectMarineSense(enemy, marines) {
        if (!enemy || !marines || marines.length === 0) return false;
        const senseRange = (enemy.stats.aggroRange || 220) * 1.05;
        for (const m of marines) {
            if (!m || !m.active || m.alive === false) continue;
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
            if (dist > senseRange) continue;
            if (this.hasLineOfSight(enemy.x, enemy.y, m.x, m.y, senseRange + 8)) return true;
        }
        return false;
    }

    pickPatrolTarget(enemy) {
        const radiusTiles = enemy.stats.patrolRadiusTiles || 6;
        const tile = this.scene.pathGrid.worldToTile(enemy.spawnX, enemy.spawnY);
        for (let i = 0; i < 20; i++) {
            const dx = Phaser.Math.Between(-radiusTiles, radiusTiles);
            const dy = Phaser.Math.Between(-radiusTiles, radiusTiles);
            const tx = tile.x + dx;
            const ty = tile.y + dy;
            if (!this.scene.pathGrid.isWalkable(tx, ty)) continue;
            return this.scene.pathGrid.tileToWorld(tx, ty);
        }
        return { x: enemy.spawnX, y: enemy.spawnY };
    }

    computeAggroVelocity(enemy, target, marines) {
        const toTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        const flank = enemy.enemyType === 'drone'
            ? enemy.swarmSide * enemy.stats.flankStrength * 0.45
            : enemy.swarmSide * enemy.stats.flankStrength;
        let vx = Math.cos(toTarget) * enemy.stats.speed;
        let vy = Math.sin(toTarget) * enemy.stats.speed;
        vx += Math.cos(toTarget + Math.PI * 0.5) * enemy.stats.speed * flank;
        vy += Math.sin(toTarget + Math.PI * 0.5) * enemy.stats.speed * flank;

        if (enemy.enemyType === 'facehugger') {
            const jitterA = enemy.patternSeed + this.scene.time.now * 0.011 + enemy.wobble;
            const jitterB = enemy.patternSeed * 0.67 + this.scene.time.now * 0.009;
            vx += Math.cos(jitterA) * enemy.stats.speed * enemy.stats.randomPatternStrength * 0.45;
            vy += Math.sin(jitterB) * enemy.stats.speed * enemy.stats.randomPatternStrength * 0.45;
        }

        const sep = this.computeSeparation(enemy, marines);
        vx += sep.vx;
        vy += sep.vy;
        return { vx, vy };
    }

    updateWarriorIntent(enemy, time, pressure = 0.3) {
        if (time < enemy.nextIntentAt) return;
        const r = Math.random();
        let intent = 'assault';
        if (pressure >= 0.66) {
            intent = r < 0.52 ? 'breach' : (r < 0.82 ? 'flank' : 'assault');
        } else if (pressure >= 0.38) {
            intent = r < 0.38 ? 'flank' : 'assault';
        } else {
            intent = r < 0.2 ? 'flank' : 'assault';
        }
        enemy.intent = intent;
        enemy.nextIntentAt = time + Phaser.Math.Between(900, 1800);
    }

    applyWarriorIntent(enemy, target, desired, mods) {
        const toTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        if (enemy.intent === 'flank') {
            const side = enemy.swarmSide || 1;
            const flankBoost = enemy.stats.speed * 0.42 * mods.enemyFlankMul;
            desired.vx += Math.cos(toTarget + Math.PI * 0.5 * side) * flankBoost;
            desired.vy += Math.sin(toTarget + Math.PI * 0.5 * side) * flankBoost;
            return desired;
        }
        if (enemy.intent === 'breach') {
            desired.vx += Math.cos(toTarget) * enemy.stats.speed * 0.38;
            desired.vy += Math.sin(toTarget) * enemy.stats.speed * 0.38;
            return desired;
        }
        return desired;
    }

    applyMeleeSpacing(enemy, target, desired, time = 0) {
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const toTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        const minDist = CONFIG.TILE_SIZE * 0.82;
        const holdDist = CONFIG.TILE_SIZE * 1.08;
        const side = enemy.swarmSide || 1;

        if (dist < minDist) {
            const away = toTarget + Math.PI;
            return {
                desired: {
                    vx: Math.cos(away) * enemy.stats.speed * 0.85 +
                        Math.cos(toTarget + Math.PI * 0.5 * side) * enemy.stats.speed * 0.22,
                    vy: Math.sin(away) * enemy.stats.speed * 0.85 +
                        Math.sin(toTarget + Math.PI * 0.5 * side) * enemy.stats.speed * 0.22,
                },
            };
        }

        if (dist <= holdDist) {
            const tangent = toTarget + Math.PI * 0.5 * side;
            if (
                enemy.enemyType !== 'facehugger' &&
                enemy.enemyType !== 'queen' &&
                enemy.enemyType !== 'queenLesser'
            ) {
                if (time >= (enemy.nextFeintFlipAt || 0)) {
                    enemy.feintDir = (enemy.feintDir || 1) * -1;
                    enemy.nextFeintFlipAt = time + Phaser.Math.Between(180, 520);
                }
                const phase = (enemy.feintPhase || 0) + time * 0.024;
                const pulse = 0.5 + 0.5 * Math.sin(phase);
                const foreMul = Phaser.Math.Linear(-0.36, 0.72, pulse) * (enemy.feintDir || 1);
                const foreSpeed = enemy.stats.speed * foreMul;
                const tangentSpeed = enemy.stats.speed * 0.36;
                return {
                    desired: {
                        vx: desired.vx * 0.08 + Math.cos(toTarget) * foreSpeed + Math.cos(tangent) * tangentSpeed,
                        vy: desired.vy * 0.08 + Math.sin(toTarget) * foreSpeed + Math.sin(tangent) * tangentSpeed,
                    },
                };
            }
            return {
                desired: {
                    vx: desired.vx * 0.08 + Math.cos(tangent) * enemy.stats.speed * 0.32,
                    vy: desired.vy * 0.08 + Math.sin(tangent) * enemy.stats.speed * 0.32,
                },
            };
        }

        return { desired };
    }

    computeSeparation(enemy, marines) {
        let sx = 0;
        let sy = 0;
        const sepR = enemy.stats.separationRadius;
        const sepR2 = sepR * sepR;
        for (const other of this.enemies) {
            if (other === enemy || !other.active) continue;
            const dx = enemy.x - other.x;
            const dy = enemy.y - other.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= 0.0001 || d2 > sepR2) continue;
            const inv = 1 / Math.sqrt(d2);
            const strength = (1 - Math.sqrt(d2) / sepR) * enemy.stats.separationForce * enemy.stats.speed;
            sx += dx * inv * strength;
            sy += dy * inv * strength;
        }
        for (const m of marines) {
            const dx = enemy.x - m.x;
            const dy = enemy.y - m.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= 0.0001 || d2 > 900) continue;
            const inv = 1 / Math.sqrt(d2);
            sx += dx * inv * enemy.stats.speed * 0.1;
            sy += dy * inv * enemy.stats.speed * 0.1;
        }
        return { vx: sx, vy: sy };
    }

    tryDroneVentAmbush(enemy, target, marines, time) {
        if (!enemy.stats.canUseVents || this.ventPoints.length === 0) return false;
        if (time < enemy.nextVentAt) return false;
        const distToTarget = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        if (distToTarget < enemy.stats.ventMinDist) return false;

        let best = null;
        let bestScore = -Infinity;
        for (const v of this.ventPoints) {
            const dTarget = Phaser.Math.Distance.Between(v.x, v.y, target.x, target.y);
            if (dTarget < enemy.stats.ventMinDist || dTarget > enemy.stats.ventMaxDist) continue;
            let tooClose = false;
            for (const m of marines) {
                if (Phaser.Math.Distance.Between(v.x, v.y, m.x, m.y) < 120) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
            const dSelf = Phaser.Math.Distance.Between(v.x, v.y, enemy.x, enemy.y);
            const score = dSelf * 0.2 + dTarget * 0.4 + Math.random() * 50;
            if (score > bestScore) {
                best = v;
                bestScore = score;
            }
        }
        if (!best) return false;

        enemy.body.reset(best.x, best.y);
        enemy.alertUntil = Math.max(enemy.alertUntil, time + this.visualAlertMs);
        enemy.nextVentAt = time + enemy.stats.ventCooldownMs;
        return true;
    }

    updateFacehugger(enemy, target, time, dt) {
        if (enemy.latchedTo && enemy.latchedTo.active) {
            const host = enemy.latchedTo;
            enemy.body.setVelocity(0, 0);
            enemy.x = host.x + Math.cos(time * 0.016 + enemy.patternSeed) * 3;
            enemy.y = host.y + Math.sin(time * 0.018 + enemy.patternSeed) * 3;
            enemy.setRotation(Phaser.Math.Angle.Between(enemy.x, enemy.y, host.x, host.y));

            if (time >= enemy.nextLatchTickAt) {
                this.applyMarineDamage(host, enemy.stats.latchDamage, enemy);
                const latchSplashChance = Phaser.Math.Clamp(
                    Number(this.scene?.runtimeSettings?.objects?.acidLatchSplashChance) || 0.34,
                    0,
                    1
                );
                if (this.scene && typeof this.scene.showAlienAcidSplash === 'function' && Math.random() < latchSplashChance) {
                    this.scene.showAlienAcidSplash(host.x, host.y);
                }
                enemy.nextLatchTickAt = time + enemy.stats.latchTickMs;
            }
            if (time >= enemy.latchUntil) {
                enemy.latchedTo = null;
                enemy.nextLeapAt = time + enemy.stats.leapCooldownMs * 0.6;
            }
            return true;
        }

        if (enemy.leaping) {
            if (time >= enemy.leapUntil) {
                enemy.leaping = false;
            } else {
                const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
                if (dist <= 26 && time >= enemy.nextAttackAt) {
                    enemy.latchedTo = target;
                    enemy.latchUntil = time + enemy.stats.latchDurationMs;
                    enemy.nextLatchTickAt = time + 80;
                    enemy.nextAttackAt = time + enemy.stats.attackCooldownMs;
                    enemy.body.setVelocity(0, 0);
                    enemy.leaping = false;
                }
                return true;
            }
        }

        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        if (
            time >= enemy.nextLeapAt &&
            dist >= enemy.stats.leapMinRange &&
            dist <= enemy.stats.leapMaxRange
        ) {
            const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            const wobble = Math.sin(time * 0.02 + enemy.patternSeed) * 0.22;
            enemy.body.setVelocity(
                Math.cos(a + wobble) * enemy.stats.leapSpeed,
                Math.sin(a + wobble) * enemy.stats.leapSpeed
            );
            enemy.setRotation(a + wobble);
            enemy.leaping = true;
            enemy.leapUntil = time + 320;
            enemy.nextLeapAt = time + enemy.stats.leapCooldownMs;
            return true;
        }

        // fallback to normal aggro/patrol flow
        return false;
    }

    findNearbyBlockingDoor(enemy, radius = 48) {
        if (!this.scene.doorManager) return null;
        let best = null;
        let bestDist = Infinity;
        for (const group of this.scene.doorManager.doorGroups) {
            if (group.state === 'open') continue;
            const center = this.getDoorCenter(group);
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, center.x, center.y);
            if (d <= radius && d < bestDist) {
                best = group;
                bestDist = d;
            }
        }
        return best;
    }

    getDoorCenter(doorGroup) {
        let sx = 0;
        let sy = 0;
        for (const door of doorGroup.doors) {
            sx += door.x;
            sy += door.y;
        }
        return { x: sx / doorGroup.doors.length, y: sy / doorGroup.doors.length };
    }

    createEggClusters() {
        for (const cluster of EGG_CLUSTERS) {
            for (const eggTile of cluster) {
                const p = tileToWorld(eggTile.tileX, eggTile.tileY);
                const egg = new AlienEgg(this.scene, p.x, p.y);
                this.eggs.push(egg);
                this.eggGroup.add(egg);
            }
        }
    }

    updateEggs(time, marines) {
        let openCount = 0;
        for (const egg of this.eggs) {
            if (!egg.active) continue;
            if (egg.state === 'open' && time >= egg.openUntil) {
                egg.close(time + EGG_COOLDOWN_MS);
            }
            if (egg.state === 'open') openCount++;
        }

        for (const egg of this.eggs) {
            if (!egg.active) continue;
            if (openCount >= this.maxOpenEggs) break;
            if (egg.state !== 'closed' || time < egg.nextReadyAt) continue;

            let inRange = false;
            for (const m of marines) {
                if (Phaser.Math.Distance.Between(egg.x, egg.y, m.x, m.y) <= EGG_TRIGGER_RANGE) {
                    inRange = true;
                    break;
                }
            }
            if (!inRange) continue;

            egg.open(time + EGG_OPEN_DURATION_MS);
            openCount++;
            const a = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            const sx = egg.x + Math.cos(a) * 18;
            const sy = egg.y + Math.sin(a) * 18;
            const eggSpawnType = this.scene && this.scene.warriorOnlyTesting ? 'warrior' : 'facehugger';
            const spawned = this.spawnEnemyAtWorld(eggSpawnType, sx, sy, 1);
            if (spawned) {
                spawned.alertUntil = Math.max(spawned.alertUntil, time + this.visualAlertMs);
                spawned.nextLeapAt = time + 180;
            }
        }
    }

    handleEggHit(egg, damage) {
        if (!egg || !egg.active) return false;
        const killed = egg.takeDamage(damage);
        if (killed) {
            const idx = this.eggs.indexOf(egg);
            if (idx >= 0) this.eggs.splice(idx, 1);
        }
        return killed;
    }

    updateDetection(lightSources, time, options = {}) {
        if (!lightSources || lightSources.length === 0) return;
        if (time < this.nextDetectionAt) return;
        this.nextDetectionAt = time + this.detectionCooldownMs;
        this.motionContacts = [];
        const trackerActive = options.trackerActive === true;
        const camera = options.camera || this.scene.cameras.main;
        const holdVisibleMs = 2000;
        const fadeMemoryMs = Math.max(400, Number(this.visibilitySettings.spottedMemoryMs) || this.spottedMemoryMs);
        const trackerRange = Number(this.visibilitySettings.trackerRange) || this.trackerRange;
        const view = camera ? camera.worldView : null;
        const leader = lightSources[0];

        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            let litNow = false;
            let litByPersistent = false;
            const dt = Math.max(0, time - (enemy.lastRevealTickAt || time));
            enemy.lastRevealTickAt = time;

            for (const source of lightSources) {
                const dist = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
                if (dist > source.range) continue;
                if (!this.isInLightCone(source, enemy)) continue;
                if (!this.hasLineOfSight(source.x, source.y, enemy.x, enemy.y, source.range)) continue;
                litNow = true;
                const kind = String(source.kind || 'torch').toLowerCase();
                if (kind === 'torch') litByPersistent = true;
            }

            if (litNow) {
                const revealBoost = litByPersistent ? 1 : 0.62;
                enemy.revealCharge = Math.max(enemy.revealCharge || 0, revealBoost);
                enemy.lastSeenAt = time;
                if (litByPersistent) {
                    enemy.fullVisibleUntil = Math.max(enemy.fullVisibleUntil || 0, time + holdVisibleMs);
                }
            }
            const trackerReveal = trackerActive && view && Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y);
            if (trackerReveal) {
                enemy.revealCharge = 1;
                enemy.lastSeenAt = time;
                enemy.fullVisibleUntil = Math.max(enemy.fullVisibleUntil || 0, time + holdVisibleMs);
            }
            const holdVisible = !litNow && !trackerReveal && time <= (enemy.fullVisibleUntil || 0);
            const visibleNow = litNow || holdVisible || trackerReveal;
            if (visibleNow) {
                const inRate = dt / Math.max(60, fadeMemoryMs * 0.18);
                enemy.revealCharge = Phaser.Math.Clamp(enemy.revealCharge + inRate, 0, 1);
            } else {
                // Let flash/spark reveals ghost out quickly, while torch/tracker still honor the 2s hold window.
                const outRate = dt / Math.max(120, fadeMemoryMs * 0.24);
                enemy.revealCharge = Phaser.Math.Clamp(enemy.revealCharge - outRate, 0, 1);
            }

            const visible = enemy.revealCharge > 0.03;
            const ghostMin = 0.34;
            const ghostMax = 1;
            const alpha = visible
                ? Phaser.Math.Clamp(ghostMin + enemy.revealCharge * (ghostMax - ghostMin), ghostMin, ghostMax)
                : CONFIG.DETECTION_FADE_ALPHA;
            enemy.detected = visible;
            enemy.setAlpha(alpha);
            const tintColor = this.getVisibilityTintColor(enemy, enemy.revealCharge, visible);
            enemy.currentDisplayTint = tintColor;
            enemy.setTint(tintColor);

            const label = this.labels.get(enemy);
            if (label) {
                label.setVisible(visible);
            }

            if (!leader) continue;
            const trackerDist = Phaser.Math.Distance.Between(leader.x, leader.y, enemy.x, enemy.y);
            const inTrackerScope = trackerReveal || trackerDist <= trackerRange;
            if (trackerActive && inTrackerScope) {
                this.motionContacts.push({
                    type: enemy.enemyType,
                    x: enemy.x,
                    y: enemy.y,
                    tracked: trackerReveal,
                });
            }
        }
    }

    updateLabels() {
        for (const enemy of this.enemies) {
            const label = this.labels.get(enemy);
            if (!label) continue;
            if (!enemy.active) {
                label.setVisible(false);
                continue;
            }
            label.setPosition(enemy.x - label.width / 2, enemy.y - 28);
        }
    }

    getVisibilityTintColor(enemy, revealCharge = 0, visible = false) {
        const base = Phaser.Display.Color.ValueToColor(enemy.baseTint || 0x9dcbb9);
        const contrastBoost = Phaser.Math.Clamp(Number(this.visibilitySettings?.alienContrastBoost) || 1.15, 0.6, 2);
        const boostChannel = (v) => Phaser.Math.Clamp(Math.round(v * contrastBoost), 0, 255);
        if (!visible) {
            return Phaser.Display.Color.GetColor(
                boostChannel(base.r),
                boostChannel(base.g),
                boostChannel(base.b)
            );
        }
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(
            base,
            Phaser.Display.Color.ValueToColor(0xf3fff9),
            100,
            Math.round(Phaser.Math.Clamp(revealCharge, 0, 1) * 100)
        );
        return Phaser.Display.Color.GetColor(
            boostChannel(c.r),
            boostChannel(c.g),
            boostChannel(c.b)
        );
    }

    isInLightCone(source, enemy) {
        const a = Phaser.Math.Angle.Between(source.x, source.y, enemy.x, enemy.y);
        let d = a - source.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d) <= source.halfAngle;
    }

    hasLineOfSight(x1, y1, x2, y2, maxRange) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= 0.0001) return true;

        const dirX = dx / len;
        const dirY = dy / len;
        const segments = this.lightBlockerGrid.getSegmentsNear(x1, y1, maxRange + CONFIG.TILE_SIZE);

        for (const seg of segments) {
            const hit = this.raycaster.raySegmentIntersection(
                x1, y1, dirX, dirY,
                seg.x1, seg.y1, seg.x2, seg.y2
            );
            if (hit && hit.dist < len) {
                return false;
            }
        }
        return true;
    }

    getMotionContacts() {
        return this.motionContacts;
    }

    getDetectedEnemies() {
        const list = [];
        for (const enemy of this.enemies) {
            if (!enemy.active || !enemy.detected) continue;
            list.push(enemy);
        }
        return list;
    }

    getAliveEnemies() {
        const list = [];
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            list.push(enemy);
        }
        return list;
    }

    getPriorityThreat(x, y, allowUndetected = false) {
        const pool = this.getDetectedEnemies();
        if (pool.length === 0 && allowUndetected) {
            pool.push(...this.getAliveEnemies());
        }
        if (pool.length === 0) return null;

        let best = null;
        let bestDist = Infinity;
        for (const enemy of pool) {
            const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            if (d < bestDist) {
                bestDist = d;
                best = enemy;
            }
        }
        return best;
    }

    getShadowCasters() {
        const casters = [];
        for (const enemy of this.enemies) {
            if (!enemy.active || !enemy.detected) continue;
            casters.push({
                x: enemy.x,
                y: enemy.y,
                radius: 13,
                blocksLight: true,
            });
        }
        return casters;
    }

    handleBulletHit(enemy, damage, projectile = null) {
        if (!enemy || !enemy.active) return false;
        const now = this.scene?.time?.now || 0;
        enemy.lastSeenAt = now;
        enemy.fullVisibleUntil = Math.max(enemy.fullVisibleUntil || 0, now + 2000);
        enemy.revealCharge = Math.max(enemy.revealCharge || 0, 0.65);
        enemy.lastRevealTickAt = now;
        const killed = enemy.takeDamage(damage);
        if (!killed && projectile && enemy.body) {
            const key = projectile.weaponKey || 'pulseRifle';
            const impulseByWeapon = {
                pulseRifle: 90,
                pistol: 70,
                shotgun: 170,
            };
            const impulse = impulseByWeapon[key] || 80;
            const vx = Number(projectile.body?.velocity?.x) || 0;
            const vy = Number(projectile.body?.velocity?.y) || 0;
            const mag = Math.sqrt(vx * vx + vy * vy) || 1;
            const ix = (vx / mag) * impulse;
            const iy = (vy / mag) * impulse;
            enemy.body.velocity.x += ix;
            enemy.body.velocity.y += iy;
            if (key === 'shotgun') {
                const now = this.scene?.time?.now || 0;
                enemy.hitSlowUntil = Math.max(enemy.hitSlowUntil || 0, now + 220);
                enemy.hitSlowMultiplier = Math.min(enemy.hitSlowMultiplier || 1, 0.38);
            }
            if (this.scene && typeof this.scene.showAlienAcidSplash === 'function') {
                const acidSprayChance = key === 'shotgun' ? 0.34 : (key === 'pistol' ? 0.14 : 0.22);
                if (Math.random() < acidSprayChance) {
                    this.scene.showAlienAcidSplash(enemy.x, enemy.y, { spawnPool: false });
                }
            }
            if (this.scene && typeof this.scene.spawnAcidHazard === 'function') {
                const hazardChance = key === 'shotgun' ? 0.18 : 0.1;
                if (Math.random() < hazardChance) {
                    this.scene.spawnAcidHazard(
                        enemy.x + Phaser.Math.Between(-6, 6),
                        enemy.y + Phaser.Math.Between(-6, 6),
                        {
                            radius: Phaser.Math.Between(10, 18),
                            duration: Phaser.Math.Between(1200, 2600),
                            damageScale: Phaser.Math.FloatBetween(0.35, 0.7),
                        }
                    );
                }
            }
        }
        if (killed) {
            this.aliveCount = Math.max(0, this.aliveCount - 1);
            const label = this.labels.get(enemy);
            if (label) label.setVisible(false);
        }
        return killed;
    }

    getAliveCount() {
        return this.aliveCount;
    }

    getAliveCountByType(enemyType) {
        let count = 0;
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            if (enemy.enemyType === enemyType) count++;
        }
        return count;
    }

    getEggAliveCount() {
        let count = 0;
        for (const egg of this.eggs) {
            if (egg.active) count++;
        }
        return count;
    }

    getOnScreenHostileCount(camera) {
        const cam = camera || this.scene.cameras.main;
        if (!cam || !cam.worldView) return this.getAliveCount();
        let count = 0;
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            if (Phaser.Geom.Rectangle.Contains(cam.worldView, enemy.x, enemy.y)) count++;
        }
        return count;
    }

    sampleDoorPressure(time) {
        const dt = Math.max(0, time - this.lastDoorPressureAt);
        if (dt > 0) {
            const decay = dt / 1600;
            this.doorPressure = Math.max(0, this.doorPressure - decay);
            this.lastDoorPressureAt = time;
        }
        return this.doorPressure;
    }

    getPhysicsGroup() {
        return this.enemyGroup;
    }

    getEggPhysicsGroup() {
        return this.eggGroup;
    }
}
