import { CONFIG } from '../config.js';
import {
    ENEMIES,
    ENEMY_VENT_POINTS,
    EGG_CLUSTERS,
    EGG_TRIGGER_RANGE,
    EGG_OPEN_DURATION_MS,
    tileToWorld
} from '../data/enemyData.js';
import { AlienEnemy } from '../entities/AlienEnemy.js';
import { AlienEgg } from '../entities/AlienEgg.js';

import { EnemySpawner } from './EnemySpawner.js';
import { EnemyTargeting } from './EnemyTargeting.js';
import { EnemyDetection } from './EnemyDetection.js';
import { EnemyMovement } from './EnemyMovement.js';

// Diagonal-quadrant facing for warrior/drone sprites (NE/SE = right, NW/SW = left).
// Matches TeamLeader._applyDirectionFrame logic. No rotation — horizontal flip only.
export function applyEnemyFacing(enemy, angle) {
    enemy.setFlipX(false);
    const offset = enemy.def?.spriteAngleOffset || 0;
    enemy.setRotation(angle + offset);
}

const DOOR_ASSAULT_PRESSURE_HARD_MIN = 0.68;
const DOOR_ASSAULT_MIN_LOCAL_SWARM = 2;

export class EnemyManager {
    constructor(scene, wallLayer, doorGroup, raycaster, lightBlockerGrid, acidPool = null, options = null) {
        this.scene = scene;
        this.wallLayer = wallLayer;
        this.doorGroup = doorGroup;
        this.raycaster = raycaster;
        this.lightBlockerGrid = lightBlockerGrid;
        this.acidPool = acidPool;
        this.settings = (options && options.enemies) || {};
        this.director = null;

        this.enemyGroup = scene.physics.add.group();
        this.eggGroup = scene.physics.add.group({ immovable: true, allowGravity: false });
        
        // Add colliders for enemies — wall edge forgiveness is applied via processCallback
        scene.physics.add.collider(this.enemyGroup, wallLayer, null,
            (obj, tile) => this.shouldCollideWithWallTile(obj, tile)
        );
        this.shouldCollideWithDoor = (enemy, door) => {
            // Facehuggers slip under doors — no door collision
            if (enemy && enemy.enemyType === 'facehugger') return false;
            return !!door && !!door.doorGroup && door.doorGroup.isPassable !== true;
        };
        scene.physics.add.collider(this.enemyGroup, doorGroup, null, this.shouldCollideWithDoor);
        scene.physics.add.collider(this.enemyGroup, this.enemyGroup);

        this.enemies = [];
        this.eggs = [];
        this.labels = new Map();
        this.motionContacts = [];
        this.motionEchoes = new Map();

        this.targetPressure = new Map();
        this.targetLaneOccupancy = new Map();
        this.committedTargetCounts = new Map();
        this.enemyDensityGrid = new Map();
        
        this.lightStimuli = [];

        // Vent points: prefer editor-authored markers from tilemap, fallback to hardcoded
        const layoutVents = this.scene.missionLayout?.ventPoints;
        if (Array.isArray(layoutVents) && layoutVents.length > 0) {
            this.ventPoints = layoutVents.map(v => tileToWorld(v.tileX, v.tileY));
        } else {
            this.ventPoints = ENEMY_VENT_POINTS.map(v => tileToWorld(v.tileX, v.tileY));
        }

        // Cached per-frame lists (rebuilt at start of update())
        this._cachedActiveEnemies = [];
        this._cachedDetectedEnemies = [];
        this._cachedActiveFrame = -1;

        // Dying enemies awaiting corpse fade-out before final destruction
        this._dyingEnemies = [];

        // Sub-systems
        this.spawner = new EnemySpawner(this);
        this.targeting = new EnemyTargeting(this);
        this.detection = new EnemyDetection(this);
        this.movement = new EnemyMovement(this);

        // Tuning / Settings
        this.aliveCount = 0;
        this.maxOpenEggs = Number(this.settings.maxOpenEggs) || 2;
        this.enemyHealthScale = Number(this.settings.globalHealthScale ?? this.settings.healthScale) || 1;
        this.enemySpeedScale = Number(this.settings.globalSpeedScale ?? this.settings.speedScale) || 1;
        this.enemyDamageScale = Number(this.settings.globalDamageScale ?? this.settings.damageScale) || 1;
        this.visualAlertMs = Number(this.settings.visualAlertMs) || 1200;
        this.gunfireAlertMs = Number(this.settings.gunfireAlertMs) || 4000;
        this.stuckTriggerMs = Number(this.settings.stuckTriggerMs) || 820;
        this.unstuckCooldownMs = Number(this.settings.unstuckCooldownMs) || 520;
        this.lightStimulusMemoryMs = Number(this.settings.lightStimulusMemoryMs) || 5000;
        this.enemyDensityCellSize = Number(this.settings.enemyDensityCellSize) || CONFIG.TILE_SIZE;
        this.warriorSpotPauseMs = 500;
        this.warriorBeamPauseMs = 500;
        this.warriorGunfireResponseMs = 2000;
        this.wallEdgeForgivenessPx = 14;
        this.dormantActivationRange = Number(this.settings.dormantActivationRange) || (CONFIG.TILE_SIZE * 12);
        this.dormantScreenPadding = Number(this.settings.dormantScreenPadding) || 96;
        this.prevGunfireActive = false;
        this.warriorGunfireResponseUntil = 0;
        this.warriorGunfirePoint = { x: 0, y: 0 };

        this.siegeDoorUntil = 0;
        this.siegePressure = 0;
        this.doorPressure = 0;
        this.lastDoorPressureAt = 0;
        this.lastSustainedGunfireAt = 0;
        this.nextLabelUpdateAt = 0;
        this.breakoutCooldownMs = Number(this.settings.breakoutCooldownMs) || 25000;
        this.nextBreakoutAt = 0;

        // Map-1 tuning: expanded early test map has more narrow gate interactions.
        // Lower stuck threshold and faster retries reduce bounce/stick without globally altering later missions.
        if (String(this.scene?.activeMission?.id || '') === 'm1') {
            this.stuckTriggerMs = Math.min(this.stuckTriggerMs, 700);
            this.unstuckCooldownMs = Math.min(this.unstuckCooldownMs, 420);
        }
    }

    setDirector(director) {
        this.director = director;
    }

    update(time, delta, marines, context = {}) {
        // Rebuild cached active enemy list once per frame
        this._rebuildActiveCache();

        const camera = this.scene.cameras.main;
        const trackerActive = context.trackerActive === true;
        const trackerDoorOccluded = context.trackerDoorOccluded === true;
        const gunfire = context.gunfire === true;
        const combatMods = context.combatMods || {
            enemyAggressionMul: 1,
            enemyFlankMul: 1,
            enemyDoorDamageMul: 1,
            pressure: 0.3,
        };

        this.detection.pruneLightStimuli(time);
        this.spawner.updateEggs(time, marines);

        const ambientDarkness = Phaser.Math.Clamp(Number(this.scene?.runtimeSettings?.lighting?.ambientDarkness) || 0.5, 0, 1);
        const darknessBias = Phaser.Math.Clamp((ambientDarkness - 0.38) / 0.62, 0, 1);

        this.targetPressure.clear();
        this.targetLaneOccupancy.clear();
        this.targeting.rebuildCommittedTargetCounts(time);
        this.detection.rebuildEnemyDensityCache();
        this.movement._pathsThisFrame = 0;

        const targetPressure = this.targetPressure;
        const pressure = Number(combatMods?.pressure) || 0;
        const gunfireStarted = gunfire && !this.prevGunfireActive;
        if (gunfireStarted) {
            this.warriorGunfireResponseUntil = time + this.warriorGunfireResponseMs;
            const lead = this.scene?.leader;
            this.warriorGunfirePoint = {
                x: Number(lead?.x) || 0,
                y: Number(lead?.y) || 0,
            };
        }
        this.prevGunfireActive = gunfire;

        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            if (this.shouldThrottleEnemySimulation(enemy, marines, camera, time, trackerActive, gunfire)) {
                enemy.body.setVelocity(0, 0);
                if (typeof enemy.updateWalkAnimation === 'function') enemy.updateWalkAnimation(0, 0);
                enemy.prevVx = 0;
                enemy.prevVy = 0;
                enemy.navStuckMs = Math.max(0, (Number(enemy.navStuckMs) || 0) - delta * 1.5);
                enemy.navLastSampleAt = time;
                enemy.navLastSampleX = enemy.x;
                enemy.navLastSampleY = enemy.y;
                continue;
            }

            const target = this.targeting.pickTargetMarine(
                enemy,
                marines,
                targetPressure,
                time,
                pressure,
                this.committedTargetCounts
            );
            if (!target || target.active === false || target.alive === false) continue;

            this.targeting.assignAssaultLane(enemy, target, pressure, time);
            targetPressure.set(target, (targetPressure.get(target) || 0) + 1);

            const hasDirectMarineSense = this.detection.getEnemySenseState(enemy, marines, time);
            const flashStimulus = this.detection.getBestLightStimulus(enemy, time);

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
            if (
                enemy.enemyType !== 'warrior'
                && gunfire
                && this.targeting.isWithinCameraAggro(enemy, camera, enemy.stats.aggroRange)
            ) {
                enemy.alertUntil = Math.max(enemy.alertUntil, time + this.gunfireAlertMs);
            }
            // Warrior-only gunfire response: 2s reaction window after first shot in burst.
            if (
                enemy.enemyType === 'warrior'
                && time < this.warriorGunfireResponseUntil
                && this.targeting.isWithinCameraAggro(enemy, camera, enemy.stats.aggroRange)
            ) {
                enemy.alertUntil = Math.max(enemy.alertUntil, this.warriorGunfireResponseUntil);
                enemy.investigatePoint = {
                    x: this.warriorGunfirePoint.x,
                    y: this.warriorGunfirePoint.y,
                    power: 1,
                };
                enemy.investigateUntil = Math.max(enemy.investigateUntil || 0, this.warriorGunfireResponseUntil + 120);
                if (!enemy._hasSpotPaused && time >= (enemy.nextScreamAt || 0)) {
                    enemy.spotPauseUntil = Math.max(enemy.spotPauseUntil || 0, time + 280);
                    enemy.screamUntil = enemy.spotPauseUntil;
                    enemy.pounceAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.warriorGunfirePoint.x, this.warriorGunfirePoint.y);
                    enemy.pounceUntil = enemy.spotPauseUntil + Phaser.Math.Between(420, 720);
                    enemy.nextScreamAt = time + Phaser.Math.Between(2200, 3800);
                    if (this.scene.sfx) {
                        const dist = this.scene.leader ? Phaser.Math.Distance.Between(this.scene.leader.x, this.scene.leader.y, enemy.x, enemy.y) : 0;
                        this.scene.sfx.playAlienScreech(dist);
                    }
                }
            }

            const isAggro = time < enemy.alertUntil;
            if (isAggro && enemy.stats.canUseVents) {
                this.movement.tryDroneVentAmbush(enemy, target, marines, time);
            }

            if (enemy.enemyType === 'facehugger' && this.movement.updateFacehugger(enemy, target, time, delta)) {
                if (this.scene.sfx) this.scene.sfx.playFacehuggerCrawl();
                continue;
            }

            const hasSpotContact = hasDirectMarineSense || enemy.detected;
            if (isAggro && enemy.enemyType !== 'facehugger' && hasSpotContact) {
                // Spot pause fires ONCE per alien — first detection only
                if (!enemy._hasSpotPaused) {
                    enemy._hasSpotPaused = true;
                    enemy.lastSpottedTargetRef = target;
                    const isWarrior = enemy.enemyType === 'warrior';
                    const beamSpotted = enemy.detected && !hasDirectMarineSense;
                    const pauseMs = isWarrior
                        ? (beamSpotted ? this.warriorBeamPauseMs : this.warriorSpotPauseMs)
                        : Math.round(Phaser.Math.Between(90, 170));
                    enemy.screamUntil = time + pauseMs;
                    enemy.spotPauseUntil = enemy.screamUntil;
                    enemy.pounceUntil = enemy.spotPauseUntil + Math.round(isWarrior ? Phaser.Math.Between(680, 980) : Phaser.Math.Between(260, 480));
                    enemy.pounceAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                    if (isWarrior) {
                        enemy.investigatePoint = { x: target.x, y: target.y, power: 1 };
                        enemy.investigateUntil = Math.max(enemy.investigateUntil || 0, time + pauseMs + 2600);
                    }
                    if (time >= (enemy.nextScreamAt || 0)) {
                        if (typeof this.scene?.showFloatingText === 'function') {
                            this.scene.showFloatingText(enemy.x, enemy.y - 20, 'SCREECH!', '#ff9f9f');
                        }
                        if (this.scene.sfx) {
                            const dist = this.scene.leader ? Phaser.Math.Distance.Between(this.scene.leader.x, this.scene.leader.y, enemy.x, enemy.y) : 0;
                            this.scene.sfx.playAlienScreech(dist);
                        }
                        enemy.nextScreamAt = time + Phaser.Math.Between(2200, 3800);
                    }
                }
            }

            const pursuingLightStimulus = isAggro &&
                enemy.investigatePoint &&
                (time < (enemy.investigateUntil || 0)) &&
                (!enemy.detected || !hasDirectMarineSense);

            let desired = pursuingLightStimulus
                ? this.movement.computeInvestigateVelocity(enemy, enemy.investigatePoint, time)
                : (isAggro
                    ? this.movement.computeAggroVelocity(enemy, target, marines)
                    : this.movement.computePatrolVelocity(enemy));

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

            const focusCount = targetPressure.get(target) || 1;
            if (enemy.enemyType === 'warrior') {
                this.movement.updateWarriorIntent(enemy, target, time, pressure, focusCount);
                desired = this.movement.applyWarriorIntent(enemy, target, desired, combatMods, focusCount);
            }

            // Warriors in probe or retreat skip melee spacing, door engagement, and spot-pause
            const warriorDisengaged = enemy.enemyType === 'warrior'
                && (enemy.intent === 'probe' || enemy.intent === 'retreat');

            let navTargetX = target.x;
            let navTargetY = target.y;

            if (isAggro && !warriorDisengaged) {
                const spacing = this.movement.applyMeleeSpacing(enemy, target, desired, time, pressure);
                desired = spacing.desired;

                if (spacing.nearDoor) {
                    const doorDist = spacing.doorDist;
                    const doorGroup = spacing.doorGroup;
                    const center = doorGroup.getCenter();
                    const da = Phaser.Math.Angle.Between(enemy.x, enemy.y, center.x, center.y);
                    const localDoorSwarm = this.detection.getEnemyDensityCount(center.x, center.y, CONFIG.TILE_SIZE * 1.6, enemy);
                    const siegeActive = this.isDoorSiegeActive(time);
                    const siegeBoost = siegeActive ? Phaser.Math.Clamp(1 + this.siegePressure * 0.7, 1, 1.8) : 1;
                    const directorState = String(combatMods?.state || 'build');
                    const intenseFirefight = directorState === 'peak'
                        || pressure >= DOOR_ASSAULT_PRESSURE_HARD_MIN
                        || siegeActive;
                    const swarmGate = localDoorSwarm >= (pressure >= 0.82 ? 2 : DOOR_ASSAULT_MIN_LOCAL_SWARM);
                    const isAlertAndStuck = enemy.alertUntil > time && spacing.nearDoor && !doorGroup.isPassable;
                    // Any alerted alien that has a target on-screen (within ~1 screen diagonal)
                    // is close enough to "hear" combat and should be able to bash through doors.
                    const screenDiag = 1480;
                    const targetDist = target
                        ? Math.hypot(enemy.x - target.x, enemy.y - target.y)
                        : Infinity;
                    const marineOnScreen = isAggro && targetDist <= screenDiag;
                    const canBreachAnyDoor = enemy.stats.canBreachAnyDoor === true;
                    const doorImmune = doorGroup.state === 'locked' || doorGroup.state === 'welded';
                    const canDamageDoor = canBreachAnyDoor || (!doorImmune && (
                        (intenseFirefight && swarmGate)
                        || isAlertAndStuck
                        || marineOnScreen
                    ));
                    enemy.engagingDoor = spacing.nearDoor && !doorGroup.isPassable && canDamageDoor;

                    if (siegeActive && spacing.nearDoor && enemy.enemyType === 'warrior') enemy.intent = 'breach';

                    if (enemy.engagingDoor) {
                        const shouldSnap = doorDist <= (CONFIG.TILE_SIZE * 2.2)
                            && time >= (enemy.nextDoorPounceAt || 0)
                            && time >= (enemy.pounceUntil || 0);
                        if (shouldSnap) {
                            const snap = this.getDoorAttackSnap(enemy, doorGroup, target);
                            if (snap) {
                                const snapA = Phaser.Math.Angle.Between(enemy.x, enemy.y, snap.x, snap.y);
                                enemy.pounceAngle = snapA;
                                enemy.pounceUntil = time + Phaser.Math.Between(120, 220);
                                enemy.nextDoorPounceAt = time + Phaser.Math.Between(340, 760);
                                navTargetX = snap.x;
                                navTargetY = snap.y;
                            } else {
                                enemy.nextDoorPounceAt = time + Phaser.Math.Between(240, 460);
                            }
                        }
                    }

                    if (canDamageDoor && doorDist <= (CONFIG.TILE_SIZE * 1.95) && time >= enemy.nextDoorHitAt) {
                        const doorDamage = Math.max(1, Math.round(enemy.stats.doorDamage * combatMods.enemyDoorDamageMul * siegeBoost));
                        const breached = doorGroup.applyEnemyDamage(
                            doorDamage,
                            this.scene.pathGrid,
                            this.scene.doorManager.physicsGroup,
                            this.scene.lightBlockerGrid,
                            this.scene.wallLayer,
                            { force: canBreachAnyDoor }
                        );
                        this.doorPressure += doorDamage;
                        this.lastDoorPressureAt = time;
                        if (this.scene && typeof this.scene.reportDoorThump === 'function') {
                            this.scene.reportDoorThump(center.x, center.y, time, breached, false, doorGroup);
                        }
                        if (breached && this.scene && typeof this.scene.showDoorBreachEffect === 'function') {
                            this.scene.showDoorBreachEffect(center.x, center.y, 'enemy');
                        }
                        const cadence = enemy.intent === 'breach' ? 0.78 : (focusCount >= 2 ? 1.08 : 1.0);
                        const siegeCadenceMul = siegeActive ? Phaser.Math.Linear(0.88, 0.72, this.siegePressure) : 1;
                        enemy.nextDoorHitAt = time + Math.floor(enemy.stats.doorAttackCooldownMs * cadence * siegeCadenceMul);
                    }

                    if (spacing.nearDoor && !enemy.engagingDoor && (!canDamageDoor || doorImmune)) {
                        const tangent = da + (Math.PI * 0.5 * (enemy.swarmSide || 1));
                        const sideDrift = Phaser.Math.Clamp((localDoorSwarm - 1) * 0.1, 0.1, 0.34);
                        const towardTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                        desired.vx = desired.vx * 0.74 + Math.cos(tangent) * enemy.stats.speed * sideDrift + Math.cos(towardTarget) * enemy.stats.speed * 0.22;
                        desired.vy = desired.vy * 0.74 + Math.sin(tangent) * enemy.stats.speed * sideDrift + Math.sin(towardTarget) * enemy.stats.speed * 0.22;
                        const bypass = this.getDoorBypassSnap(enemy, target.x, target.y, doorGroup);
                        if (bypass) {
                            navTargetX = bypass.x;
                            navTargetY = bypass.y;
                            const toBypass = Phaser.Math.Angle.Between(enemy.x, enemy.y, bypass.x, bypass.y);
                            desired.vx = desired.vx * 0.56 + Math.cos(toBypass) * enemy.stats.speed * 0.58;
                            desired.vy = desired.vy * 0.56 + Math.sin(toBypass) * enemy.stats.speed * 0.58;
                        }
                    }
                }
            }

            if (isAggro && enemy.enemyType !== 'facehugger' && !warriorDisengaged) {
                if (time < (enemy.spotPauseUntil || 0)) {
                    const sAngle = Number.isFinite(enemy.pounceAngle) ? enemy.pounceAngle : Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                    if (enemy.enemyType === 'warrior') {
                        // Warriors should clearly pause/scream before rush.
                        desired = { vx: 0, vy: 0 };
                    } else {
                        desired = {
                            vx: Math.cos(sAngle) * enemy.stats.speed * 0.24,
                            vy: Math.sin(sAngle) * enemy.stats.speed * 0.24,
                        };
                    }
                } else if (time < (enemy.pounceUntil || 0)) {
                    const pounceA = Number.isFinite(enemy.pounceAngle) ? enemy.pounceAngle : Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                    const pSpeed = enemy.stats.speed * 1.58;
                    desired = {
                        vx: Math.cos(pounceA) * pSpeed,
                        vy: Math.sin(pounceA) * pSpeed,
                    };
                }
            }

            if (time < (enemy.navRecoverUntil || 0)) {
                const recX = Number.isFinite(enemy.navRecoverTargetX) ? enemy.navRecoverTargetX : navTargetX;
                const recY = Number.isFinite(enemy.navRecoverTargetY) ? enemy.navRecoverTargetY : navTargetY;
                const recAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, recX, recY);
                const recDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, recX, recY);
                const recoverWeight = Phaser.Math.Clamp(
                    (enemy.navRecoverUntil - time) / Math.max(120, enemy.navRecoverUntil - (enemy.navLastUnstuckAt || 0)),
                    0.25,
                    0.8
                );
                const recoverSpeed = enemy.stats.speed * Phaser.Math.Linear(0.58, 0.78, Phaser.Math.Clamp(recDist / (CONFIG.TILE_SIZE * 2.8), 0, 1));
                desired.vx = desired.vx * (1 - recoverWeight) + Math.cos(recAngle) * recoverSpeed * recoverWeight;
                desired.vy = desired.vy * (1 - recoverWeight) + Math.sin(recAngle) * recoverSpeed * recoverWeight;
            }

            const pathHint = this.movement.getEnemyPathHint(enemy, navTargetX, navTargetY, time, isAggro);
            if (pathHint) {
                const steerA = Phaser.Math.Angle.Between(enemy.x, enemy.y, pathHint.x, pathHint.y);
                const steerDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, pathHint.x, pathHint.y);
                const steerWeight = Phaser.Math.Clamp(steerDist / (CONFIG.TILE_SIZE * 3.4), 0.32, 0.66);
                desired.vx = desired.vx * (1 - steerWeight) + Math.cos(steerA) * enemy.stats.speed * steerWeight;
                desired.vy = desired.vy * (1 - steerWeight) + Math.sin(steerA) * enemy.stats.speed * steerWeight;
            }

            const speedScale = enemy.getSpeedMultiplier(time) * this.movement.getSuppressionSpeedMul(enemy, time);
            const maxSpeed = enemy.stats.speed * speedScale * combatMods.enemyAggressionMul;
            desired.vx *= speedScale;
            desired.vy *= speedScale;
            const mag = Math.sqrt(desired.vx * desired.vx + desired.vy * desired.vy);
            if (mag > maxSpeed) {
                desired.vx = (desired.vx / mag) * maxSpeed;
                desired.vy = (desired.vy / mag) * maxSpeed;
            }

            // Reduce ping-pong at tight door/object choke points by smoothing steering turns.
            // Skip momentum smoothing when stuck — it creates a feedback loop
            const stuckMs = Number(enemy.navStuckMs) || 0;
            const skipMomentum = stuckMs > (enemy._stuckTriggerMs || 400) * 0.8;
            const prevVx = Number(enemy.prevVx) || 0;
            const prevVy = Number(enemy.prevVy) || 0;
            const prevMag = Math.hypot(prevVx, prevVy);
            const desiredMag = Math.hypot(desired.vx, desired.vy);
            if (prevMag > 10 && desiredMag > 10 && !skipMomentum) {
                const dot = (prevVx * desired.vx + prevVy * desired.vy) / (prevMag * desiredMag);
                const sharpTurn = dot < -0.2;
                const navStuck = Number(enemy.navStuckMs) || 0;
                const chokeBias = enemy.engagingDoor ? 1 : 0;
                if (sharpTurn || navStuck > 220 || chokeBias > 0) {
                    // Keep some momentum through choke points without smearing the
                    // turn so hard that pursuit looks delayed.
                    const turnLerp = sharpTurn ? 0.52 : 0.64;
                    desired.vx = Phaser.Math.Linear(prevVx, desired.vx, turnLerp);
                    desired.vy = Phaser.Math.Linear(prevVy, desired.vy, turnLerp);
                    if (navStuck > 420 || chokeBias > 0) {
                        const preserve = Phaser.Math.Clamp(0.34 + chokeBias * 0.08, 0.3, 0.48);
                        desired.vx = desired.vx * (1 - preserve) + prevVx * preserve;
                        desired.vy = desired.vy * (1 - preserve) + prevVy * preserve;
                    }
                }
            }
            enemy.prevVx = desired.vx;
            enemy.prevVy = desired.vy;

            // Per-frame velocity jitter for organic insect-like movement
            desired = this.movement.applyMovementJitter(enemy, desired);

            // Hitstop: hold velocity at zero during brief impact freeze
            if (enemy.hitstopUntil && time < enemy.hitstopUntil) {
                enemy.body.setVelocity(0, 0);
            } else {
                enemy.body.setVelocity(desired.vx, desired.vy);
            }
            if (typeof enemy.updateWalkAnimation === 'function') enemy.updateWalkAnimation(desired.vx, desired.vy);
            if (Math.abs(desired.vx) + Math.abs(desired.vy) > 0.001) {
                applyEnemyFacing(enemy, Math.atan2(desired.vy, desired.vx));
            }

            const pathGrid = this.scene?.pathGrid;
            // Facehuggers slip under walls — skip stuck-in-wall recovery
            if (pathGrid && enemy.enemyType !== 'facehugger') {
                const tile = pathGrid.worldToTile(enemy.x, enemy.y);
                if (!pathGrid.isWalkable(tile.x, tile.y) && time >= (enemy.nextHardResolveAt || 0)) {
                    const corrected = this.resolveWalkableWorld(enemy.x, enemy.y, 2);
                    if (corrected && (corrected.x !== enemy.x || corrected.y !== enemy.y)) {
                        enemy.body.reset(corrected.x, corrected.y);
                        enemy.body.setVelocity(0, 0);
                    }
                    enemy.nextHardResolveAt = time + 170;
                }
            }

            if (pursuingLightStimulus && enemy.investigatePoint) {
                navTargetX = enemy.investigatePoint.x;
                navTargetY = enemy.investigatePoint.y;
            } else if (!isAggro && enemy.patrolTarget) {
                navTargetX = enemy.patrolTarget.x;
                navTargetY = enemy.patrolTarget.y;
            }

            this.movement.updateEnemyNavigationHealth(enemy, navTargetX, navTargetY, desired, time, pressure);

            const contactDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
            const meleeMin = CONFIG.TILE_SIZE * 0.7;
            const meleeMax = CONFIG.TILE_SIZE * 1.15;
            if (contactDist >= meleeMin && contactDist <= meleeMax && time >= enemy.nextAttackAt) {
                const targetHpPct = Phaser.Math.Clamp((Number(target?.health) || 0) / Math.max(1, Number(target?.maxHealth) || 100), 0, 1);
                if (this.targeting.rollMeleeHit(enemy, target, contactDist)) {
                    // Reveal alien when it attacks — acid blood sprays everywhere, can't hide.
                    enemy.revealCharge = 1;
                    enemy.hitRevealed = true;
                    enemy.lastSeenAt = time;
                    this.targeting.applyMarineDamage(target, enemy.stats.contactDamage, enemy);
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
                    enemy.rushUntil = Math.max(enemy.rushUntil || 0, time + Phaser.Math.Between(80, 170));
                    enemy.rushAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                    enemy.rushSpeedMul = Math.max(Number(enemy.rushSpeedMul) || 1, Phaser.Math.FloatBetween(1.22, 1.52));
                }
                const finisherMul = targetHpPct <= 0.35 ? Phaser.Math.Linear(0.78, 0.62, (0.35 - targetHpPct) / 0.35) : 1;
                enemy.nextAttackAt = time + Math.floor(enemy.stats.attackCooldownMs * finisherMul);
            }
        }

        // Hard push runs AFTER setVelocity so += delta on body.velocity is not wiped.
        this.applyAlienMarineHardPush(marines, delta);

        if (time >= (this.nextLabelUpdateAt || 0)) {
            this.updateLabels();
            this.nextLabelUpdateAt = time + 66;
        }

        // Update dying enemy corpse fades
        for (let i = this._dyingEnemies.length - 1; i >= 0; i--) {
            const corpse = this._dyingEnemies[i];
            if (!corpse || !corpse.isDying || corpse.updateCorpse(delta)) {
                // Fully faded — destroy and remove
                this._dyingEnemies.splice(i, 1);
                if (corpse) corpse.destroy();
            }
        }
    }

    shouldThrottleEnemySimulation(enemy, marines, camera, time, trackerActive = false, gunfire = false) {
        if (!enemy || !enemy.active) return false;
        if (trackerActive) return false;
        if (enemy.detected) return false;
        if (time < (enemy.alertUntil || 0)) return false;
        if (time < (enemy.investigateUntil || 0)) return false;
        if (time < (enemy.navRecoverUntil || 0)) return false;
        if (time < (enemy.pounceUntil || 0)) return false;
        if (time < (enemy.leapUntil || 0)) return false;

        const view = camera?.worldView;
        if (view) {
            const pad = Math.max(0, Number(this.dormantScreenPadding) || 96);
            const inView = (
                enemy.x >= (view.x - pad)
                && enemy.x <= (view.right + pad)
                && enemy.y >= (view.y - pad)
                && enemy.y <= (view.bottom + pad)
            );
            if (inView) return false;
        }

        const activationRange = Math.max(CONFIG.TILE_SIZE * 5, Number(this.dormantActivationRange) || (CONFIG.TILE_SIZE * 12));
        const gunfireRange = activationRange * 1.25;
        for (const marine of marines || []) {
            if (!marine || marine.active === false || marine.alive === false) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, marine.x, marine.y);
            if (d <= activationRange) return false;
            if (gunfire && d <= gunfireRange) return false;
        }
        return true;
    }

    // --- DELEGATED PUBLIC API ---

    updateDetection(lightSources, time, context = {}) {
        const delta = context.delta || 16;
        const camera = context.camera || this.scene.cameras.main;
        const marines = context.marines || this.scene.marines || [];
        const trackerActive = context.trackerActive === true;
        const trackerDoorOccluded = context.trackerDoorOccluded === true;
        
        this.detection.updateDetection(time, delta, marines, camera, trackerActive, trackerDoorOccluded, lightSources);
        this._rebuildActiveCache(true);
    }

    getPriorityThreat(x, y, allowUndetected = false) {
        return this.targeting.getPriorityThreat(x, y, allowUndetected);
    }

    /**
     * Rebuild the cached active enemies list. Called once per update.
     * Downstream getActiveEnemies / getAliveEnemies / getAliveCount
     * all return from this cache without allocating new arrays.
     */
    _rebuildActiveCache(force = false) {
        const frame = this.scene?.game?.loop?.frame ?? -1;
        if (!force && frame === this._cachedActiveFrame) return;
        this._cachedActiveFrame = frame;
        const arr = this._cachedActiveEnemies;
        arr.length = 0;
        const det = this._cachedDetectedEnemies;
        det.length = 0;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (!e.active) continue;
            arr.push(e);
            if (e.detected) det.push(e);
        }
    }

    getActiveEnemies() {
        this._rebuildActiveCache();
        return this._cachedActiveEnemies;
    }

    getShadowCasters() {
        // Eggs block light, enemies do not (to keep them stealthy in darkness).
        // Reuse array to avoid per-frame allocation.
        if (!this._shadowCasterCache) this._shadowCasterCache = [];
        const arr = this._shadowCasterCache;
        arr.length = 0;
        for (let i = 0; i < this.eggs.length; i++) {
            const egg = this.eggs[i];
            if (!egg.active) continue;
            arr.push({ x: egg.x, y: egg.y, radius: 18, blocksLight: true });
        }
        return arr;
    }

    spawnWave(spawns, waveNumber = 1) {
        return this.spawner.spawnWave(spawns, waveNumber);
    }

    spawnEnemyAtWorld(type, worldX, worldY, difficulty = 1) {
        return this.spawner.spawnEnemyAtWorld(type, worldX, worldY, difficulty);
    }

    createEggClusters() {
        return this.spawner.createEggClusters();
    }

    getMotionContacts() {
        return this.motionContacts;
    }

    getAliveCount() {
        this._rebuildActiveCache();
        return this._cachedActiveEnemies.length;
    }

    getOnScreenHostileCount(camera) {
        return this.detection.getOnScreenHostileCount(camera);
    }

    sampleDoorPressure(time = this.scene?.time?.now || 0) {
        if (time >= this.lastDoorPressureAt + 1000) {
            const decay = (time - this.lastDoorPressureAt) / 1000 * 0.15;
            this.doorPressure = Math.max(0, this.doorPressure - decay);
            this.lastDoorPressureAt = time;
        }
        return this.doorPressure;
    }

    getAliveEnemies() {
        return this.getActiveEnemies();
    }

    getDetectedEnemies() {
        this._rebuildActiveCache();
        return this._cachedDetectedEnemies;
    }

    // --- INTERNAL HELPERS ---

    getLightSources() {
        const sources = [];
        const marines = this.scene?.squadSystem?.getAllMarines?.()
            || this.scene?.marines
            || [this.scene?.leader].filter(Boolean);
        const lighting = this.scene?.runtimeSettings?.lighting || {};
        const halfAngle = lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE;
        const range = lighting.torchRange ?? CONFIG.TORCH_RANGE;

        for (const m of marines) {
            if (!m || m.active === false || m.alive === false) continue;
            sources.push({
                x: m.x,
                y: m.y,
                angle: (m.facingAngle ?? m.rotation) || 0,
                halfAngle,
                range,
                kind: 'torch',
            });
        }

        if (this.scene?.lightSources) {
            sources.push(...this.scene.lightSources);
        }
        return sources;
    }

    registerLightStimulus(x, y, time, power = 1) {
        this.detection.registerLightStimulus(x, y, time, power);
    }

    notifyGunfire(worldX = null, worldY = null, time = this.scene?.time?.now || 0, volume = 1) {
        // We use siege pressure to track sustained gunfire intensity.
        // Also could alert nearby enemies directly if needed.
        const v = Phaser.Math.Clamp(Number(volume) || 1, 0.1, 5);
        if (worldX !== null && worldY !== null) {
            // Potential for localized alerts
            for (const enemy of this.enemies) {
                if (!enemy.active) continue;
                const d = Phaser.Math.Distance.Between(worldX, worldY, enemy.x, enemy.y);
                if (d < (enemy.stats.aggroRange || 220) * 1.8 * v) {
                    enemy.alertUntil = Math.max(enemy.alertUntil || 0, time + this.gunfireAlertMs * v);
                }
            }
        }
    }

    notifySustainedGunfire(time = this.scene?.time?.now || 0, intensity = 1) {
        const clamped = Phaser.Math.Clamp(Number(intensity) || 1, 0.2, 2.4);
        this.lastSustainedGunfireAt = time;
        this.siegePressure = Phaser.Math.Clamp(
            Math.max(this.siegePressure || 0, Phaser.Math.Linear(0.45, 1, Math.min(1, clamped / 1.6))),
            0,
            1
        );
        const addMs = Math.floor(Phaser.Math.Linear(3200, 7400, this.siegePressure));
        this.siegeDoorUntil = Math.max(this.siegeDoorUntil || 0, time + addMs);
    }

    isDoorSiegeActive(time = this.scene?.time?.now || 0) {
        const active = time < (this.siegeDoorUntil || 0);
        if (!active && (this.siegePressure || 0) > 0) {
            this.siegePressure = Math.max(0, this.siegePressure - 0.02);
        }
        return active;
    }

    isWarriorInSameOpenRoom(sourceEnemy, otherEnemy, maxRange = CONFIG.TILE_SIZE * 14) {
        if (!sourceEnemy || !otherEnemy) return false;
        const d = Phaser.Math.Distance.Between(sourceEnemy.x, sourceEnemy.y, otherEnemy.x, otherEnemy.y);
        if (d > maxRange) return false;
        if (this.isClosedDoorBetweenWorldPoints(sourceEnemy.x, sourceEnemy.y, otherEnemy.x, otherEnemy.y)) return false;
        if (!this.hasLineOfSight(sourceEnemy.x, sourceEnemy.y, otherEnemy.x, otherEnemy.y, maxRange)) return false;
        return true;
    }

    propagateWarriorRoomRush(sourceEnemy, targetMarine, time, pauseMs) {
        if (!sourceEnemy || !targetMarine || sourceEnemy.enemyType !== 'warrior') return;
        if ((time - (Number(sourceEnemy.lastWarriorRoomCallAt) || -100000)) < 700) return;
        sourceEnemy.lastWarriorRoomCallAt = time;
        const tx = Number(targetMarine.x) || sourceEnemy.x;
        const ty = Number(targetMarine.y) || sourceEnemy.y;
        for (const other of this.enemies) {
            if (!other || !other.active || other === sourceEnemy) continue;
            if (other.enemyType !== 'warrior') continue;
            if (!this.isWarriorInSameOpenRoom(sourceEnemy, other)) continue;
            if ((time - (Number(other.lastWarriorRoomCallAt) || -100000)) < 700) continue;
            other.lastWarriorRoomCallAt = time;
            other.alertUntil = Math.max(other.alertUntil || 0, time + pauseMs + 2600);
            other.spotPauseUntil = Math.max(other.spotPauseUntil || 0, time + pauseMs);
            other.pounceUntil = Math.max(other.pounceUntil || 0, time + pauseMs + Phaser.Math.Between(680, 980));
            other.pounceAngle = Phaser.Math.Angle.Between(other.x, other.y, tx, ty);
            other.investigatePoint = { x: tx, y: ty, power: 1 };
            other.investigateUntil = Math.max(other.investigateUntil || 0, time + pauseMs + 2400);
            other.lastSeenAt = time;
        }
    }

    findNearbyBlockingDoor(x, y, range) {
        const doors = this.scene?.doorManager?.getDoorsNear?.(x, y, range) || [];
        let best = null;
        let bestDist = Infinity;
        for (const d of doors) {
            if (!d || d.isPassable) continue;
            const center = d.getCenter();
            const dist = Phaser.Math.Distance.Between(x, y, center.x, center.y);
            if (dist < bestDist) {
                bestDist = dist;
                best = d;
            }
        }
        return best ? { group: best, dist: bestDist } : null;
    }

    findNearbyVent(x, y, range) {
        const grid = this.scene?.pathGrid;
        let best = null;
        let bestDist = Infinity;
        for (const v of this.ventPoints) {
            const d = Phaser.Math.Distance.Between(x, y, v.x, v.y);
            if (d < range && d < bestDist) {
                // Validate walkability — skip vents placed inside walls
                if (grid) {
                    const t = grid.worldToTile(v.x, v.y);
                    if (!grid.isWalkable(t.x, t.y)) continue;
                }
                bestDist = d;
                best = v;
            }
        }
        return best;
    }

    isBlockedByRoomProp(x, y, padding = 18) {
        const roomProps = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        for (const p of roomProps) {
            const s = p?.sprite;
            if (!s || s.active === false) continue;
            const r = Math.max(10, Number(p.radius) || 18) + padding;
            if (Phaser.Math.Distance.Between(x, y, s.x, s.y) <= r) return true;
        }
        return false;
    }

    getDoorBypassSnap(enemy, tx, ty, doorGroup = null) {
        const pathGrid = this.scene?.pathGrid;
        if (!pathGrid) return null;
        const myTile = pathGrid.worldToTile(enemy.x, enemy.y);
        const targetX = Number(tx) || enemy.x;
        const targetY = Number(ty) || enemy.y;
        const doorCenter = doorGroup?.getCenter?.() || null;
        const isWalkable = (x, y) => !!pathGrid.isWalkable(x, y);
        const opennessAt = (x, y) => {
            let c = 0;
            if (isWalkable(x + 1, y)) c++;
            if (isWalkable(x - 1, y)) c++;
            if (isWalkable(x, y + 1)) c++;
            if (isWalkable(x, y - 1)) c++;
            return c;
        };
        let best = null;
        let bestScore = -Infinity;
        for (let r = 1; r <= 4; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = myTile.x + dx;
                    const ny = myTile.y + dy;
                    if (!pathGrid.isWalkable(nx, ny)) continue;
                    const door = this.scene.doorManager.getDoorAtTile(nx, ny);
                    if (door && !door.isPassable) continue;
                    const world = pathGrid.tileToWorld(nx, ny);
                    if (this.isBlockedByRoomProp(world.x, world.y, 14)) continue;
                    const toTarget = Phaser.Math.Distance.Between(world.x, world.y, targetX, targetY);
                    const fromEnemy = Phaser.Math.Distance.Between(world.x, world.y, enemy.x, enemy.y);
                    const openness = opennessAt(nx, ny);
                    const doorPenalty = doorCenter
                        ? Phaser.Math.Clamp(
                            1 - (Phaser.Math.Distance.Between(world.x, world.y, doorCenter.x, doorCenter.y) / (CONFIG.TILE_SIZE * 2.3)),
                            0,
                            1
                        ) * 36
                        : 0;
                    const blockedLOS = this.scene?.doorManager?.hasClosedDoorBetweenWorldPoints?.(world.x, world.y, targetX, targetY) === true;
                    const score = (-toTarget * 0.9) + (fromEnemy * 0.22) + (openness * 15) - doorPenalty - (blockedLOS ? 40 : 0);
                    if (score > bestScore) {
                        bestScore = score;
                        best = world;
                    }
                }
            }
        }
        return best;
    }

    getDoorAttackSnap(enemy, doorGroup, target) {
        if (!enemy || !doorGroup || !this.scene?.pathGrid) return null;
        const grid = this.scene.pathGrid;
        const center = doorGroup.getCenter();
        const centerTile = grid.worldToTile(center.x, center.y);
        const toTarget = Phaser.Math.Angle.Between(center.x, center.y, target.x, target.y);
        const sideA = toTarget + Math.PI;
        let best = null;
        let bestScore = Infinity;
        for (let r = 1; r <= 2; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = centerTile.x + dx;
                    const ty = centerTile.y + dy;
                    if (!grid.isWalkable(tx, ty)) continue;
                    const door = this.scene.doorManager.getDoorAtTile(tx, ty);
                    if (door && !door.isPassable) continue;
                    const w = grid.tileToWorld(tx, ty);
                    if (this.isBlockedByRoomProp(w.x, w.y, 14)) continue;
                    const dDoor = Phaser.Math.Distance.Between(w.x, w.y, center.x, center.y);
                    if (dDoor > CONFIG.TILE_SIZE * 1.55) continue;
                    const a = Phaser.Math.Angle.Between(center.x, center.y, w.x, w.y);
                    const sideDelta = Math.abs(Phaser.Math.Angle.Wrap(a - sideA));
                    const enemyDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, w.x, w.y);
                    const score = sideDelta * 160 + enemyDist * 0.24;
                    if (score < bestScore) {
                        bestScore = score;
                        best = w;
                    }
                }
            }
        }
        return best;
    }

    resolveWalkableWorld(x, y, radiusTiles = 2) {
        const pathGrid = this.scene?.pathGrid;
        if (!pathGrid) return { x, y };
        const origin = pathGrid.worldToTile(x, y);
        if (pathGrid.isWalkable(origin.x, origin.y) && !this.isBlockedByRoomProp(x, y, 14)) return { x, y };
        for (let r = 1; r <= radiusTiles; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = origin.x + dx;
                    const ty = origin.y + dy;
                    if (!pathGrid.isWalkable(tx, ty)) continue;
                    const world = pathGrid.tileToWorld(tx, ty);
                    if (this.isBlockedByRoomProp(world.x, world.y, 14)) continue;
                    return world;
                }
            }
        }
        return { x, y };
    }

    pickPatrolTarget(enemy) {
        const radiusTiles = enemy.stats.patrolRadiusTiles || 6;
        const tile = this.scene.pathGrid.worldToTile(enemy.spawnX, enemy.spawnY);
        let best = null;
        let bestScore = -Infinity;
        const lastTarget = enemy.lastPatrolTarget || null;
        for (let i = 0; i < 28; i++) {
            const dx = Phaser.Math.Between(-radiusTiles, radiusTiles);
            const dy = Phaser.Math.Between(-radiusTiles, radiusTiles);
            const tx = tile.x + dx;
            const ty = tile.y + dy;
            if (!this.scene.pathGrid.isWalkable(tx, ty)) continue;
            const world = this.scene.pathGrid.tileToWorld(tx, ty);
            const fromSpawn = Phaser.Math.Distance.Between(world.x, world.y, enemy.spawnX, enemy.spawnY);
            const fromEnemy = Phaser.Math.Distance.Between(world.x, world.y, enemy.x, enemy.y);
            const novelty = lastTarget ? Phaser.Math.Distance.Between(world.x, world.y, lastTarget.x, lastTarget.y) : (CONFIG.TILE_SIZE * 3);
            const distScore = Phaser.Math.Clamp(fromSpawn / (CONFIG.TILE_SIZE * radiusTiles), 0.2, 1.2) * 56;
            const moveScore = Phaser.Math.Clamp(fromEnemy / (CONFIG.TILE_SIZE * 6), 0.1, 1.2) * 38;
            const noveltyScore = Phaser.Math.Clamp(novelty / (CONFIG.TILE_SIZE * 4), 0, 1.5) * 24;
            const score = distScore + moveScore + noveltyScore + Phaser.Math.FloatBetween(-8, 8);
            if (score > bestScore) {
                bestScore = score;
                best = world;
            }
        }
        return best || { x: enemy.spawnX, y: enemy.spawnY };
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
        const contrastBoost = Phaser.Math.Clamp(Number(this.settings.visibility?.alienContrastBoost) || 1.26, 0.6, 2);
        const boostChannel = (v) => Phaser.Math.Clamp(Math.round(v * contrastBoost), 0, 255);
        if (!visible) {
            const ghostNeutralMix = Phaser.Math.Clamp(Number(this.settings.visibility?.ghostBlueMix) || 76, 0, 100);
            const neutralFog = Phaser.Display.Color.ValueToColor(0x98a2aa);
            const ghost = Phaser.Display.Color.Interpolate.ColorWithColor(base, neutralFog, 100, ghostNeutralMix);
            return Phaser.Display.Color.GetColor(
                boostChannel(ghost.r),
                boostChannel(ghost.g),
                boostChannel(ghost.b)
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
        return this.detection.hasLineOfSight(x1, y1, x2, y2, maxRange);
    }

    isWorldPointWalkableWithWallEdgeForgiveness(worldX, worldY, edgePx = this.wallEdgeForgivenessPx) {
        const grid = this.scene?.pathGrid;
        if (!grid) return true;
        const tileSize = Number(CONFIG.TILE_SIZE) || 64;
        const t = grid.worldToTile(worldX, worldY);
        if (grid.isWalkable(t.x, t.y)) return true;
        const doorAtTile = this.scene?.doorManager?.getDoorAtTile?.(t.x, t.y);
        if (doorAtTile && doorAtTile.isPassable !== true) return false;
        const localX = worldX - (t.x * tileSize);
        const localY = worldY - (t.y * tileSize);
        const tol = Phaser.Math.Clamp(Number(edgePx) || 10, 0, tileSize * 0.45);
        if (tol <= 0) return false;
        if (localX <= tol && grid.isWalkable(t.x - 1, t.y)) return true;
        if (localX >= (tileSize - tol) && grid.isWalkable(t.x + 1, t.y)) return true;
        if (localY <= tol && grid.isWalkable(t.x, t.y - 1)) return true;
        if (localY >= (tileSize - tol) && grid.isWalkable(t.x, t.y + 1)) return true;
        return false;
    }

    shouldCollideWithWallTile(enemy, tile) {
        if (!enemy || enemy.active === false || !tile) return false;
        // Facehuggers slip under walls — no wall collision
        if (enemy.enemyType === 'facehugger') return false;
        const body = enemy.body;
        if (!body) return true;
        const centerX = Number(body.center?.x) || Number(enemy.x) || 0;
        const centerY = Number(body.center?.y) || Number(enemy.y) || 0;
        const edgePx = this.wallEdgeForgivenessPx;
        if (this.isWorldPointWalkableWithWallEdgeForgiveness(centerX, centerY, edgePx)) {
            return false;
        }
        return true;
    }

    isClosedDoorBetweenWorldPoints(x1, y1, x2, y2) {
        return this.detection.isClosedDoorBetweenWorldPoints(x1, y1, x2, y2);
    }

    onEnemyKilled(enemy) {
        this.aliveCount = Math.max(0, this.aliveCount - 1);
        
        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) {
            this.enemies.splice(idx, 1);
            // Invalidate cache immediately
            this._cachedActiveFrame = -1;
        }

        const label = this.labels.get(enemy);
        if (label) {
            label.destroy();
            this.labels.delete(enemy);
        }
        const now = this.scene.time.now;
        if (enemy.detected) {
            this.motionEchoes.set(enemy, {
                x: enemy.x,
                y: enemy.y,
                confidence: enemy.revealCharge || 0.5,
                speed: enemy.body?.speed || 0,
                expiresAt: now + 760,
            });
        }
        
        this.scene.events.emit('enemy-killed', enemy);

        // Move to dying list for corpse fade-out instead of immediate destruction
        if (enemy.isDying) {
            this._dyingEnemies.push(enemy);
        } else {
            // Fallback: destroy immediately if not in dying state
            enemy.destroy();
        }
    }

    handleBulletHit(enemy, damage, projectile = null) {
        if (!enemy || !enemy.active) return false;
        const now = this.scene?.time?.now || 0;
        enemy.lastSeenAt = now;
        enemy.revealCharge = 1;
        enemy.hitRevealed = true;

        if (this.scene.sfx) this.scene.sfx.playAlienHiss();

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
                enemy.hitSlowUntil = Math.max(enemy.hitSlowUntil || 0, now + 220);
                enemy.hitSlowMultiplier = Math.min(enemy.hitSlowMultiplier || 1, 0.38);
            }
            if (this.scene && typeof this.scene.showAlienAcidSplash === 'function') {
                const acidSprayChance = key === 'shotgun' ? 0.72 : (key === 'pistol' ? 0.22 : 0.42);
                if (Math.random() < acidSprayChance) {
                    this.scene.showAlienAcidSplash(enemy.x, enemy.y, {
                        spawnPool: false,
                        intensity: key === 'shotgun' ? 0.95 : (key === 'pistol' ? 0.5 : 0.68),
                    });
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
            this.onEnemyKilled(enemy);
        }
        return killed;
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

    getPhysicsGroup() {
        return this.enemyGroup;
    }

    getEggPhysicsGroup() {
        return this.eggGroup;
    }

    applyAlienMarineHardPush(marines, delta) {
        if (!marines || marines.length === 0) return;
        const dt = Math.max(0.001, delta / 1000);
        const activeEnemies = this.getActiveEnemies();
        if (activeEnemies.length === 0) return;

        // Configuration
        const minSpacing = 48; // Increased from 32 to 48
        const pushForce = 320; // Increased velocity units per second for hard push

        for (const enemy of activeEnemies) {
            // Facehuggers can overlap during leap
            if (enemy.enemyType === 'facehugger' && enemy.leapUntil) continue;

            for (const marine of marines) {
                if (!marine.active || marine.alive === false) continue;

                const dx = enemy.x - marine.x;
                const dy = enemy.y - marine.y;
                const d2 = dx * dx + dy * dy;

                if (d2 > 0.0001 && d2 < minSpacing * minSpacing) {
                    const dist = Math.sqrt(d2);
                    const overlap = minSpacing - dist;
                    const inv = 1 / dist;
                    const pushMag = overlap * pushForce * dt;
                    
                    const px = (dx * inv) * pushMag;
                    const py = (dy * inv) * pushMag;

                    // Push enemy away from marine
                    enemy.body.velocity.x += px;
                    enemy.body.velocity.y += py;
                }
            }

            // Also keep away from closed doors to prevent clipping through
            const doorCheck = this.findNearbyBlockingDoor(enemy.x, enemy.y, 40);
            if (doorCheck) {
                const center = doorCheck.group.getCenter();
                const dx = enemy.x - center.x;
                const dy = enemy.y - center.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.0001 && dist < 42) {
                    const push = (42 - dist) * pushForce * 0.8 * dt;
                    enemy.body.velocity.x += (dx / dist) * push;
                    enemy.body.velocity.y += (dy / dist) * push;
                }
            }
        }
    }
}
