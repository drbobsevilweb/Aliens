import { CONFIG } from '../config.js';
import { MapBuilder } from '../map/MapBuilder.js';
import { TeamLeader } from '../entities/TeamLeader.js';
import { BulletPool } from '../entities/BulletPool.js';
import { AcidPool } from '../entities/AcidPool.js';
import { InputHandler } from '../systems/InputHandler.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { PathGrid } from '../pathfinding/PathGrid.js';
import { AStar } from '../pathfinding/AStar.js';
import { PathPlanner } from '../pathfinding/PathPlanner.js';
import { DoorManager } from '../entities/DoorManager.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { DoorActionSystem } from '../systems/DoorActionSystem.js';
import { WeaponManager } from '../systems/WeaponManager.js';
import { HUD } from '../ui/HUD.js';
import { SquadSystem } from '../systems/SquadSystem.js';
import { LightBlockerGrid } from '../lighting/LightBlockerGrid.js';
import { Raycaster } from '../lighting/Raycaster.js';
import { LightingOverlay } from '../lighting/LightingOverlay.js';
import { EnemyManager } from '../systems/EnemyManager.js';
import { MotionTracker } from '../ui/MotionTracker.js';
import { StageFlow } from '../systems/StageFlow.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { ObjectivesPanel } from '../ui/ObjectivesPanel.js';
import { ControlsOverlay } from '../ui/ControlsOverlay.js';
import { MEDKIT_HEAL_AMOUNT, MEDKIT_WAVE_SPAWNS, AMMO_WAVE_SPAWNS, AMMO_PICKUP_VALUE } from '../data/pickupData.js';
import { resolveMissionLayout } from '../map/missionLayout.js';
import { MissionFlow } from '../systems/MissionFlow.js';
import { loadRuntimeSettings } from '../settings/runtimeSettings.js';
import {
    getMissionDirectorOverridesForMission,
    getMissionPackageMeta,
    getMissionPackageSummary,
    isMissionPackageMetaStale,
} from '../settings/missionPackageRuntime.js';
import { CombatDirector } from '../systems/CombatDirector.js';

const TEAM_SPEED_SCALE = 1.5;
const MARINE_SWEEP_ANCHORS = Object.freeze({
    tech: Math.PI / 2,      // South
    medic: Math.PI,         // West
    heavy: -Math.PI / 4,    // North East
});
const MARINE_SPOT_CALLOUTS = Object.freeze([
    'Movement!',
    "I've got something!",
    'Shit! What was that?!',
    'Over here!',
    'Contact front!',
    'Eyes on target!',
    'Xeno in the light!',
    'There! Moving fast!',
    'Hostile spotted!',
    'Target in sight!',
    'Motion left flank!',
    'Keep your lights up!',
    'I see one!',
    'Incoming!',
]);
const ROLE_SPOT_CALLOUTS = Object.freeze({
    leader: Object.freeze(['Movement ahead!', 'Eyes on target!', 'Contact front!', 'Keep the line tight!']),
    heavy: Object.freeze(['Target locked!', 'Suppressing!', 'On my mark, burn them down!']),
    tech: Object.freeze(['Movement on sensors!', 'Contact by the hatch!', 'I have visual!']),
    medic: Object.freeze(['Hostile in the light!', 'Contact confirmed!', "I see it, don't stop!"]),
});
const MARINE_ATTACK_CALLOUTS = Object.freeze([
    'Contact! Contact!',
    "I'm hit!",
    'They are all over us!',
    'Need suppressive fire now!',
    'Xenos on me!',
    'Push them back!',
    'Take them down!',
    'Hold this line!',
    'They are in close!',
    'Fall back a step!',
    'Keep firing!',
    'They are swarming us!',
]);
const ROLE_ATTACK_CALLOUTS = Object.freeze({
    leader: Object.freeze(["I'm taking hits!", 'Hold formation!', 'Push them back now!']),
    heavy: Object.freeze(['Taking fire!', 'Need backup on me!', 'They are rushing my lane!']),
    tech: Object.freeze(["I'm pinned here!", 'Contact too close!', "They're breaching through!"]),
    medic: Object.freeze(["I'm hit!", 'Need cover while I patch us up!', 'They are on top of us!']),
});
const LOW_AMMO_CALLOUTS = Object.freeze([
    'Low ammo!',
    'Magazine nearly dry!',
    'Running low here!',
    'Need ammo soon!',
    'Rounds almost gone!',
]);
const MARINE_AMBIENT_CHATTER = Object.freeze([
    'Check your corners.',
    'Watch those vents.',
    'Stay sharp, no hero moves.',
    "I don't like this silence.",
    'Keep formation tight.',
    'Eyes up, motion in the dark.',
    'Maintain spacing.',
    'Covering your left.',
    'Nothing on visual... yet.',
    'Keep your beams moving.',
    'Stay off those door lines.',
    'Slow is smooth. Smooth is fast.',
    'This place is crawling.',
    'No one gets left behind.',
]);
const RADIO_STATIC_INCIDENTS = Object.freeze([
    '--kssht-- movement in maintenance...',
    'Command, we have no clean signal.',
    '--static-- hold that corridor.',
    'Power fluctuation, lights are unstable.',
    '--kssht-- motion all around us.',
    'Copy? ... copy?!',
    '--static-- something in the vents.',
    'This place is alive, keep moving.',
]);

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.launchData = {};
    }

    init(data) {
        this.launchData = data || {};
    }

    create() {
        this.runtimeSettings = loadRuntimeSettings();
        const missionLayout = resolveMissionLayout(this.launchData.missionId);
        this.activeMission = missionLayout.mission;
        this.activeMissionWaves = missionLayout.missionWaves;
        this.warriorOnlyTesting = missionLayout.warriorOnlyTesting === true;
        this.missionFlow = new MissionFlow(this.activeMission, missionLayout.tilemap, {
            warriorOnly: this.warriorOnlyTesting,
        });

        const mapBuilder = new MapBuilder(this, {
            floorData: missionLayout.floorData,
            wallData: missionLayout.wallData,
            width: missionLayout.tilemap.width,
            height: missionLayout.tilemap.height,
        });
        const { wallLayer } = mapBuilder.build();
        this.wallLayer = wallLayer;

        this.pathGrid = new PathGrid(wallLayer, missionLayout.tilemap.width, missionLayout.tilemap.height);
        this.astar = new AStar();
        this.pathPlanner = new PathPlanner(this.astar, this.pathGrid);

        this.leader = new TeamLeader(this, missionLayout.spawnTile.x, missionLayout.spawnTile.y);
        this.leader.moveSpeed = this.runtimeSettings.player.leaderSpeed * TEAM_SPEED_SCALE;
        this.leader.moveResponseRate = this.runtimeSettings.player.moveResponseRate;
        this.leader.movementRigidity = this.runtimeSettings.player.movementRigidity;
        this.leader.turnSpeedRadPerSec = this.runtimeSettings.player.leaderTurnSpeed;
        this.leader.maxHealth = this.runtimeSettings.player.maxHealth;
        this.leader.health = Math.min(this.leader.maxHealth, this.runtimeSettings.player.startHealth);
        this.leader.setScale(Number(this.runtimeSettings?.spriteAnimation?.marineSpriteScale) || 1);
        this.bulletPool = new BulletPool(this);
        this.acidPool = new AcidPool(this);
        this.weaponManager = new WeaponManager(this.bulletPool, this.runtimeSettings.weapons);
        this.inputHandler = new InputHandler(this);
        this.movementSystem = new MovementSystem();
        this.squadSystem = new SquadSystem(this, this.leader, this.pathGrid, this.runtimeSettings.squad);
        this.doorManager = new DoorManager(
            this,
            this.pathGrid,
            missionLayout.doorDefinitions,
            this.wallLayer,
            { integrityHits: this.runtimeSettings.doors.integrityHits }
        );

        this.lightBlockerGrid = new LightBlockerGrid(
            wallLayer,
            missionLayout.tilemap.width,
            missionLayout.tilemap.height
        );
        for (const group of this.doorManager.doorGroups) {
            for (const door of group.doors) {
                this.lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
            }
        }
        this.raycaster = new Raycaster();
        this.lightingOverlay = new LightingOverlay(
            this,
            this.raycaster,
            this.lightBlockerGrid,
            this.runtimeSettings.lighting
        );

        this.enemyManager = new EnemyManager(
            this,
            wallLayer,
            this.doorManager.getPhysicsGroup(),
            this.raycaster,
            this.lightBlockerGrid,
            this.acidPool,
            { enemies: this.runtimeSettings.enemies }
        );
        this.stageFlow = new StageFlow(this.activeMissionWaves.length);
        this.enemyManager.spawnWave(this.activeMissionWaves[0], 1);
        this.sessionStartTime = this.time.now;
        this.totalKills = 0;
        this.meta = this.loadMetaProgress();

        this.contextMenu = new ContextMenu(this);
        this.doorActionSystem = new DoorActionSystem(this, this.pathGrid, this.pathPlanner, this.movementSystem);
        this.combatDirector = new CombatDirector(this.runtimeSettings.director);
        this.pickupGroup = this.physics.add.group({ immovable: true, allowGravity: false });
        const shouldCollideWithDoor = (obj, door) => {
            return !!door && !!door.doorGroup && door.doorGroup.state !== 'open';
        };
        const getProjectileFromPair = (a, b) => {
            if (a && typeof a.deactivate === 'function') return a;
            if (b && typeof b.deactivate === 'function') return b;
            return null;
        };
        const getDoorFromPair = (a, b) => {
            if (a && a.doorGroup) return a;
            if (b && b.doorGroup) return b;
            return null;
        };

        this.physics.add.collider(this.leader, wallLayer);
        this.physics.add.collider(this.leader, this.enemyManager.getPhysicsGroup());
        this.physics.add.collider(this.bulletPool, wallLayer, (a, b) => {
            const bullet = getProjectileFromPair(a, b);
            if (!bullet || !bullet.active) return;
            this.showImpactEffect(bullet.x, bullet.y, 0xdddddd);
            bullet.deactivate();
        });
        this.physics.add.collider(this.leader, this.doorManager.getPhysicsGroup(), null, shouldCollideWithDoor);
        this.physics.add.collider(
            this.bulletPool,
            this.doorManager.getPhysicsGroup(),
            (a, b) => {
                const bullet = getProjectileFromPair(a, b);
                if (!bullet || !bullet.active) return;
                const door = getDoorFromPair(a, b);
                let color = 0xdddddd;
                if (door && door.doorGroup) {
                    if (door.doorGroup.state === 'locked') color = 0xffcc66;
                    if (door.doorGroup.state === 'welded') color = 0x99ccff;
                }
                this.showImpactEffect(bullet.x, bullet.y, color);
                bullet.deactivate();
            },
            shouldCollideWithDoor
        );
        this.physics.add.collider(this.acidPool, wallLayer, (a, b) => {
            const projectile = getProjectileFromPair(a, b);
            if (projectile && projectile.active) projectile.deactivate();
        });
        this.physics.add.collider(
            this.acidPool,
            this.doorManager.getPhysicsGroup(),
            (a, b) => {
                const projectile = getProjectileFromPair(a, b);
                if (projectile && projectile.active) projectile.deactivate();
            },
            shouldCollideWithDoor
        );
        this.physics.add.overlap(this.bulletPool, this.enemyManager.getPhysicsGroup(), (a, b) => {
            const bullet = typeof a.deactivate === 'function' ? a : b;
            const enemy = bullet === a ? b : a;
            if (!bullet || !enemy || !bullet.active || !enemy.active) return;
            this.showImpactEffect(bullet.x, bullet.y, 0xff7777);
            this.showAlienAcidSplash(enemy.x, enemy.y);
            bullet.deactivate();
            const killed = this.enemyManager.handleBulletHit(enemy, bullet.damage || 0, bullet);
            if (killed) {
                this.showAlienDeathBurst(enemy.x, enemy.y);
                this.totalKills++;
                this.onEnemyKilled(enemy, bullet, this.time.now);
            }
        });
        this.physics.add.overlap(this.bulletPool, this.enemyManager.getEggPhysicsGroup(), (a, b) => {
            const bullet = typeof a.deactivate === 'function' ? a : b;
            const egg = bullet === a ? b : a;
            if (!bullet || !egg || !bullet.active || !egg.active) return;
            this.showImpactEffect(bullet.x, bullet.y, 0xffcc88);
            bullet.deactivate();
            this.enemyManager.handleEggHit(egg, bullet.damage || 0);
        });
        this.physics.add.overlap(this.acidPool, this.leader, (a, b) => {
            const projectile = getProjectileFromPair(a, b);
            const target = projectile === a ? b : a;
            if (!projectile || !projectile.active || this.stageFlow.isEnded()) return;
            projectile.deactivate();
            if (target && typeof target.takeDamage === 'function') {
                const dmg = Math.max(0, Number(projectile.damage) || 0);
                target.takeDamage(dmg);
                if (dmg > 0 && typeof this.onMarineDamaged === 'function') {
                    this.onMarineDamaged(target, dmg, this.time.now);
                }
            }
        });
        this.physics.add.overlap(this.leader, this.pickupGroup, (leader, pickup) => {
            if (!pickup.active || pickup.collected) return;
            pickup.collected = true;
            pickup.disableBody(true, true);
            if (pickup.kind === 'medkit') {
                this.leader.heal(MEDKIT_HEAL_AMOUNT);
                this.showFloatingText(this.leader.x, this.leader.y - 18, `+${MEDKIT_HEAL_AMOUNT} HP`, '#77ff77');
                return;
            }
            if (pickup.kind === 'ammo' && pickup.weaponKey && pickup.amount > 0) {
                this.weaponManager.addAmmo(pickup.weaponKey, pickup.amount);
                this.showFloatingText(
                    this.leader.x,
                    this.leader.y - 18,
                    `+${pickup.amount} ${pickup.weaponKey.toUpperCase()}`,
                    '#99ccff'
                );
            }
        });

        const mapWidthPx = missionLayout.tilemap.width * CONFIG.TILE_SIZE;
        const mapHeightPx = missionLayout.tilemap.height * CONFIG.TILE_SIZE;
        this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
        const cameraLerp = this.runtimeSettings?.game?.cameraLerp || CONFIG.CAMERA_LERP;
        this.cameras.main.startFollow(this.leader, true, cameraLerp, cameraLerp);
        // Keep leader centered in the playable region (screen area above HUD).
        this.cameras.main.setFollowOffset(0, -CONFIG.HUD_HEIGHT * 0.5);
        this.cameras.main.setDeadzone(CONFIG.CAMERA_DEADZONE_WIDTH, CONFIG.CAMERA_DEADZONE_HEIGHT);
        this.physics.world.setBounds(0, 0, mapWidthPx, mapHeightPx);
        const gameSpeed = this.runtimeSettings?.game?.gameSpeedMultiplier || 1;
        const globalTimeScale = this.runtimeSettings?.game?.globalTimeScale || 1;
        this.physics.world.timeScale = gameSpeed * globalTimeScale;

        this.hud = new HUD(this, this.weaponManager, this.leader);
        this.motionTracker = new MotionTracker(this);
        this.motionTracker.range = Number(this.runtimeSettings?.visibility?.trackerRange) || CONFIG.MOTION_TRACKER_RANGE;
        this.trackerOperator = null;
        this.trackerStartedAt = 0;
        this.trackerChannelUntil = 0;
        this.trackerScanUntil = 0;
        this.trackerRiskUntil = 0;
        this.trackerCooldownUntil = 0;
        this.nextTrackerBeepAt = 0;
        this.nextAmbientBeepAt = 0;
        this.nextTrackerWordAt = 0;
        this.trackerCueAnchorX = null;
        this.trackerCueAnchorY = null;
        this.nextThreatPulseAt = 0;
        this.nextImpactShakeAt = 0;
        this.healAction = null;
        this.nextMedicAutoHealAt = 0;
        this.followerCombatState = new Map();
        this.sharedMarineContact = null;
        this.lastMoraleKillCount = 0;
        this.lastObjectiveProgressCount = 0;
        this.nextMarineSpotCalloutAt = 0;
        this.nextMarineAttackCalloutAt = 0;
        this.nextMarineAmbientRadioAt = 0;
        this.nextAtmosphereIncidentAt = 0;
        this.nextLowAmmoCalloutAt = 0;
        this.lastLowAmmoWeaponKey = '';
        this.lastLowAmmoAmount = -1;
        this.lastDamageCalloutByMarine = new Map();
        this.teamDamageSampleWindowMs = 2400;
        this.lastTeamDamageSampleAt = -10000;
        this.lastTeamHealthSample = 0;
        this.lastDirectorUpdateAt = -10000;
        this.combatMods = this.combatDirector.getModifiers();
        const scriptBase = this.runtimeSettings?.scripting || {};
        const useMissionPackageDirector = (Number(scriptBase.useMissionPackageDirector) || 0) > 0;
        this.missionPackageMeta = getMissionPackageMeta();
        this.missionPackageSummary = getMissionPackageSummary();
        this.missionPackageMetaStale = isMissionPackageMetaStale();
        this.nextMissionPackageMetaRefreshAt = this.time.now + 2000;
        const missionDirectorOverrides = useMissionPackageDirector
            ? getMissionDirectorOverridesForMission(this.activeMission?.id || '')
            : null;
        const script = missionDirectorOverrides ? { ...scriptBase, ...missionDirectorOverrides } : scriptBase;
        this.directorSourceLabel = missionDirectorOverrides
            ? 'MISSION PACKAGE'
            : (useMissionPackageDirector ? 'SETTINGS (PACKAGE MISSING)' : 'SETTINGS');
        const missionPressureScale = this.getMissionSpawnPressureScale(this.activeMission?.id);
        const idleBaseMs = Number(script.idlePressureBaseMs) || 7000;
        const idleMinMs = Number(script.idlePressureMinMs) || 3500;
        const gunfireBaseMs = Number(script.gunfireReinforceBaseMs) || 4500;
        const gunfireMinMs = Number(script.gunfireReinforceMinMs) || 2200;
        this.idlePressureIntervalMs = Math.max(idleMinMs, Math.round(idleBaseMs * missionPressureScale));
        this.lastActionAt = this.time.now;
        this.nextIdlePressureAt = this.time.now + this.idlePressureIntervalMs;
        this.nextReinforcementSpawnAt = this.time.now + 600;
        this.gunfireReinforceCooldownMs = Math.max(gunfireMinMs, Math.round(gunfireBaseMs * missionPressureScale));
        this.nextGunfireReinforceAt = this.time.now + 2000;
        this.reinforceCap = Math.max(0, Math.floor(Number(script.reinforceCap) || 16));
        this.reinforceCapIdle = Math.max(0, Math.floor(Number(script.reinforceCapIdle) || 6));
        this.reinforceCapGunfire = Math.max(0, Math.floor(Number(script.reinforceCapGunfire) || 10));
        this.doorNoiseMemoryMs = Number(script.doorNoiseMemoryMs) || 16000;
        this.waveTransitionGraceMs = Math.max(0, Number(script.waveTransitionGraceMs) || 2600);
        this.pressureGraceUntil = this.time.now + this.waveTransitionGraceMs;
        this.applyMissionReinforcementCaps(this.activeMission?.id);
        this.doorNoiseHistory = [];
        this.gunfireEventWindowMs = 2400;
        this.gunfireBurstThreshold = 16;
        this.gunfireBurstDurationMs = 8000;
        this.gunfireBurstCooldownMs = 9000;
        this.gunfireBurstBonusPack = 2;
        this.gunfireBurstCooldownMul = 0.72;
        this.gunfireEvents = [];
        this.gunfireBurstUntil = 0;
        this.nextBurstEligibleAt = this.time.now + 2000;
        this.recentIdleSpawnPoints = [];
        this.idleSpawnMemoryMs = Math.max(2000, Number(script.idleSpawnMemoryMs) || 9000);
        this.nextDoorThumpCueAt = 0;
        this.fxQualityScale = 1;
        this.nextFxQualityEvalAt = 0;
        this.debugOverlay = new DebugOverlay(this);
        this.objectivesPanel = new ObjectivesPanel(this);
        this.controlsOverlay = new ControlsOverlay(this);
        this.lastTeamHealthSample = this.getTeamHealthTotal(this.squadSystem.getAllMarines());

        this.stageText = this.add.text(16, 16, `WAVE 1/${this.stageFlow.totalWaves} | HOSTILES`, {
            fontSize: '13px',
            fontFamily: 'monospace',
            color: '#d8e9f6',
            backgroundColor: '#111111',
            padding: { left: 5, right: 5, top: 3, bottom: 3 },
        });
        this.stageText.setDepth(240);
        this.stageText.setScrollFactor(0);
        if (useMissionPackageDirector && !missionDirectorOverrides) {
            this.showFloatingText(this.leader.x, this.leader.y - 32, 'MISSION PACKAGE NOT FOUND', '#ffb8a8');
        }

        this.endHintText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 + 32, '', {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#111111',
            padding: { left: 10, right: 10, top: 6, bottom: 6 },
            align: 'center',
        });
        this.endHintText.setOrigin(0.5);
        this.endHintText.setDepth(245);
        this.endHintText.setScrollFactor(0);
        this.endHintText.setVisible(false);
        this.createMoveTargetIcon();

        this.pauseText = this.add.text(CONFIG.GAME_WIDTH / 2, 36, 'PAUSED', {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#111111',
            padding: { left: 10, right: 10, top: 6, bottom: 6 },
        });
        this.pauseText.setOrigin(0.5);
        this.pauseText.setDepth(250);
        this.pauseText.setScrollFactor(0);
        this.pauseText.setVisible(false);
        this.isPaused = false;
        this.prevHealth = this.leader.health;
        this.damageFlash = this.add.rectangle(
            CONFIG.GAME_WIDTH / 2,
            CONFIG.GAME_HEIGHT / 2,
            CONFIG.GAME_WIDTH,
            CONFIG.GAME_HEIGHT,
            0xaa0000,
            0
        );
        this.damageFlash.setDepth(244);
        this.damageFlash.setScrollFactor(0);
        this.lowHealthText = this.add.text(CONFIG.GAME_WIDTH / 2, 78, 'LOW HEALTH', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#ff6666',
            backgroundColor: '#220000',
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        });
        this.lowHealthText.setOrigin(0.5);
        this.lowHealthText.setDepth(243);
        this.lowHealthText.setScrollFactor(0);
        this.lowHealthText.setVisible(false);
        this.trackerPulseText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT - 16, '', {
            fontSize: '26px',
            fontFamily: 'Impact, "Arial Black", sans-serif',
            fontStyle: 'bold',
            color: '#88ffcc',
            backgroundColor: '#11212b',
            padding: { left: 12, right: 12, top: 6, bottom: 5 },
        });
        this.trackerPulseText.setOrigin(0.5);
        this.trackerPulseText.setStroke('#001018', 5);
        this.trackerPulseText.setShadow(2, 2, '#000000', 0.7, false, true);
        this.trackerPulseText.setDepth(243);
        this.trackerPulseText.setScrollFactor(0);
        this.trackerPulseText.setVisible(false);
        this.gunFlashLights = [];
        this.sparkLights = [];
        this.acidHazards = [];
        this.initFxEmitters();

        this.extractionWorldPos = this.pathGrid.tileToWorld(missionLayout.extractionTile.x, missionLayout.extractionTile.y);
        this.extractionRing = this.add.circle(this.extractionWorldPos.x, this.extractionWorldPos.y, 24, 0x33cc88, 0.18);
        this.extractionRing.setStrokeStyle(2, 0x55ff99, 0.8);
        this.extractionRing.setDepth(7);
        this.extractionRing.setVisible(false);

        this.extractionLabel = this.add.text(this.extractionWorldPos.x, this.extractionWorldPos.y - 34, 'EXTRACT', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#99ffcc',
            backgroundColor: '#112211',
            padding: { left: 4, right: 4, top: 2, bottom: 2 },
        });
        this.extractionLabel.setOrigin(0.5);
        this.extractionLabel.setDepth(8);
        this.extractionLabel.setVisible(false);
        this.createObjectiveTargetMarker();

        this.weaponManager.addWeapon('shotgun');
        this.input.mouse.disableContextMenu();
        this.applyDefaultCursor();

        this.restartKeyHandler = () => {
            if (this.stageFlow.isEnded()) this.scene.restart(this.launchData);
        };
        this.restartPointerHandler = () => {
            if (this.stageFlow.isEnded()) this.scene.restart(this.launchData);
        };
        this.toggleDebugHandler = () => {
            if (this.debugOverlay) this.debugOverlay.toggle();
        };
        this.togglePauseHandler = () => {
            if (this.stageFlow.isEnded()) return;
            if (this.controlsOverlay.visible) {
                this.controlsOverlay.setVisible(false);
                if (!this.isPaused) this.physics.world.resume();
                return;
            }
            this.togglePause();
        };
        this.toggleHelpHandler = () => {
            const willShow = !this.controlsOverlay.visible;
            this.controlsOverlay.setVisible(willShow);
            if (willShow) {
                this.physics.world.pause();
                this.contextMenu.hide();
                this.doorActionSystem.cancelPending();
                this.movementSystem.clearPath(this.leader);
            } else if (!this.isPaused) {
                this.physics.world.resume();
            }
        };
        this.cycleBehaviorPresetHandler = () => {
            if (!this.squadSystem) return;
            const preset = this.squadSystem.cycleBehaviorPreset();
            this.showFloatingText(
                this.leader.x,
                this.leader.y - 30,
                `SQUAD: ${preset.toUpperCase()}`,
                '#88ddff'
            );
        };
        this.weaponHotkeysHandler = (event) => {
            if (this.stageFlow.isEnded() || this.isPaused || this.controlsOverlay.visible) return;
            let changed = false;
            if (event.code === 'Digit1') changed = this.weaponManager.switchByIndex(0) || changed;
            if (event.code === 'Digit2') changed = this.weaponManager.switchByIndex(1) || changed;
            if (event.code === 'Digit3') changed = this.weaponManager.switchByIndex(2) || changed;
            if (changed) this.inputHandler.consumeMenuClick();
        };
        this.wheelHandler = (pointer, over, dx, dy) => {
            if (this.stageFlow.isEnded() || this.isPaused || this.controlsOverlay.visible) return;
            const direction = dy > 0 ? 1 : -1;
            this.weaponManager.cycleWeapon(direction);
            this.inputHandler.consumeMenuClick();
        };
        if (this.input.keyboard) {
            this.input.keyboard.on('keydown-R', this.restartKeyHandler);
            this.input.keyboard.on('keydown-F3', this.toggleDebugHandler);
            this.input.keyboard.on('keydown-P', this.togglePauseHandler);
            this.input.keyboard.on('keydown-ESC', this.togglePauseHandler);
            this.input.keyboard.on('keydown-ESCAPE', this.togglePauseHandler);
            this.input.keyboard.on('keydown-F1', this.toggleHelpHandler);
            this.input.keyboard.on('keydown-F6', this.cycleBehaviorPresetHandler);
            this.input.keyboard.on('keydown', this.weaponHotkeysHandler);
        }
        this.input.on('pointerdown', this.restartPointerHandler);
        this.input.on('wheel', this.wheelHandler);

        this.events.once('shutdown', () => {
            if (this.input.keyboard) {
                this.input.keyboard.off('keydown-R', this.restartKeyHandler);
                this.input.keyboard.off('keydown-F3', this.toggleDebugHandler);
                this.input.keyboard.off('keydown-P', this.togglePauseHandler);
                this.input.keyboard.off('keydown-ESC', this.togglePauseHandler);
                this.input.keyboard.off('keydown-ESCAPE', this.togglePauseHandler);
                this.input.keyboard.off('keydown-F1', this.toggleHelpHandler);
                this.input.keyboard.off('keydown-F6', this.cycleBehaviorPresetHandler);
                this.input.keyboard.off('keydown', this.weaponHotkeysHandler);
            }
            this.input.off('pointerdown', this.restartPointerHandler);
            this.input.off('wheel', this.wheelHandler);
            this.contextMenu.hide();
            if (this.inputHandler) this.inputHandler.destroy();
            if (this.debugOverlay) this.debugOverlay.destroy();
            if (this.objectivesPanel) this.objectivesPanel.destroy();
            if (this.controlsOverlay) this.controlsOverlay.destroy();
            if (this.objectiveTargetMarker) this.objectiveTargetMarker.destroy();
            if (this.fxDotPool) {
                for (const sprite of this.fxDotPool) sprite.destroy();
            }
            if (this.fxSmokePool) {
                for (const sprite of this.fxSmokePool) sprite.destroy();
            }
            this.fxActiveSprites = [];
            if (this.acidHazards) {
                for (const hazard of this.acidHazards) {
                    if (hazard.ring) hazard.ring.destroy();
                }
                this.acidHazards = [];
            }
        });
    }

    update(time, delta) {
        if (this.stageFlow.isEnded()) return;
        if (this.controlsOverlay.visible) {
            this.updateDebugOverlay(time);
            return;
        }
        if (this.isPaused) {
            this.updateDebugOverlay(time);
            return;
        }

        this.inputHandler.update();
        this.updateCursorState();
        this.refreshMissionPackageRuntimeMeta(time);
        this.updateFxQualityBudget(time);
        this.updateFxSprites(delta);
        const trackerActive = this.isMotionTrackerActive(time);
        const trackerRiskLocked = this.isMotionTrackerRiskLocked(time);
        this.motionTracker.setState(trackerActive);
        const trackerLeaderBusy = this.isTrackerLeaderBusy(time);
        const healLeaderBusy = this.isLeaderHealBusy(time);
        this.resolveActionLockConflicts(time);
        this.updateTrackerOperatorLock(time, trackerRiskLocked);
        this.updateHealActionLock(time);

        const pointer = this.inputHandler.getPointerWorldPosition();
        this.leader.facePosition(pointer.worldX, pointer.worldY);
        this.leader.updateFacing(delta);

        const rightClick = this.inputHandler.consumeRightClick();
        if (rightClick && !trackerLeaderBusy && !healLeaderBusy) {
            const healTarget = this.findMarineAtWorldPos(rightClick.worldX, rightClick.worldY);
            if (healTarget) {
                this.handleMarineRightClick(healTarget, rightClick.worldX, rightClick.worldY);
            } else {
            const doorGroup = this.doorManager.getDoorGroupAtWorldPos(rightClick.worldX, rightClick.worldY);
            if (doorGroup) {
                this.handleDoorRightClick(doorGroup, rightClick.worldX, rightClick.worldY);
            } else {
                this.contextMenu.hide();
                this.doorActionSystem.cancelForLeaderMove();
                const startTile = this.pathGrid.worldToTile(this.leader.x, this.leader.y);
                const endTile = this.pathGrid.worldToTile(rightClick.worldX, rightClick.worldY);
                if (this.pathGrid.isWalkable(endTile.x, endTile.y)) {
                    const path = this.pathPlanner.findPath(startTile.x, startTile.y, endTile.x, endTile.y, this.pathGrid);
                    if (path) {
                        const worldPath = path.map((p) => this.pathGrid.tileToWorld(p.x, p.y));
                        this.movementSystem.assignPath(this.leader, worldPath);
                        this.setMoveTarget(rightClick.worldX, rightClick.worldY);
                    }
                }
            }
            }
        }

        this.movementSystem.update(this.leader, delta);
        this.doorActionSystem.update(this.leader, delta);
        let marines = this.squadSystem.getAllMarines();
        this.updateHealingSystem(time, delta, marines);
        const teamHealthBeforeEnemyUpdate = this.getTeamHealthTotal(marines);
        const activeDoorTimerBefore = this.doorActionSystem.getActiveTimer ? this.doorActionSystem.getActiveTimer() : null;
        const timerActorBefore = activeDoorTimerBefore && activeDoorTimerBefore.actorInfo
            ? activeDoorTimerBefore.actorInfo.actor
            : this.leader;
        const actorHpBefore = timerActorBefore && typeof timerActorBefore.health === 'number'
            ? timerActorBefore.health
            : null;
        const actorDamagedAtBefore = timerActorBefore && Number.isFinite(timerActorBefore.lastDamagedAt)
            ? timerActorBefore.lastDamagedAt
            : -1;
        this.enemyManager.update(time, delta, marines, {
            gunfire: this.inputHandler.isFiring,
            camera: this.cameras.main,
            combatMods: this.combatMods,
        });
        const teamHealthAfterEnemyUpdate = this.getTeamHealthTotal(marines);
        if (teamHealthAfterEnemyUpdate < teamHealthBeforeEnemyUpdate) {
            this.markCombatAction(time);
        }
        const activeDoorTimerAfter = this.doorActionSystem.getActiveTimer ? this.doorActionSystem.getActiveTimer() : null;
        if (activeDoorTimerAfter && timerActorBefore) {
            const actorHpAfter = typeof timerActorBefore.health === 'number' ? timerActorBefore.health : null;
            const actorDamagedAtAfter = Number.isFinite(timerActorBefore.lastDamagedAt) ? timerActorBefore.lastDamagedAt : -1;
            const actorWasDamaged = (
                (actorHpBefore !== null && actorHpAfter !== null && actorHpAfter < actorHpBefore) ||
                (actorDamagedAtAfter > actorDamagedAtBefore)
            );
            if (actorWasDamaged) {
                this.doorActionSystem.cancelPending();
                this.showFloatingText(this.leader.x, this.leader.y - 20, 'ACTION INTERRUPTED', '#ff9999');
            }
        }
        if (this.wasTrackerOperatorAttacked()) this.cancelMotionTrackerScan(true);
        this.combatMods = this.updateCombatDirector(time, delta, marines);
        const lightSources = this.buildMarineLightSources(marines);
        this.enemyManager.updateDetection(lightSources, time, {
            trackerActive: this.isMotionTrackerActive(time),
            camera: this.cameras.main,
        });
        const threat = this.enemyManager.getPriorityThreat(this.leader.x, this.leader.y, this.inputHandler.isFiring);
        this.squadSystem.update(delta, time, { threat });
        marines = this.squadSystem.getAllMarines();
        this.updateAcidHazards(time, delta, marines);
        this.updateFollowerCombat(time, delta, marines);
        this.updateMarineRadioChatter(time, marines);
        this.updateAtmosphereIncidents(time, marines);
        this.updateLowAmmoCallouts(time);
        if (this.hud && typeof this.hud.updateSquad === 'function') {
            this.hud.updateSquad(marines, time);
        }
        this.motionTracker.update(this.leader.x, this.leader.y, this.enemyManager.getMotionContacts(), time, marines);
        this.updateTrackerAudioCue(time);
        this.updateIdlePressureSpawns(time, marines);
        this.updateCombatBurstState(time);

        const shadowCasters = this.buildMarineShadowCasters(marines).concat(this.enemyManager.getShadowCasters());
        this.lightingOverlay.update(lightSources, shadowCasters);

        this.weaponManager.update(delta);
        if (this.inputHandler.isFiring && !trackerLeaderBusy && !healLeaderBusy) {
            const fired = this.weaponManager.fire(this.leader.x, this.leader.y, this.leader.rotation, time);
            if (fired) {
                this.noteGunfireEvent(time);
                this.markCombatAction(time);
                this.tryGunfireReinforcement(time, this.leader.x, this.leader.y, marines);
                const weaponKey = this.weaponManager.currentWeaponKey || 'pulseRifle';
                this.emitWeaponFlashAndStimulus(
                    this.leader.x,
                    this.leader.y,
                    this.leader.rotation,
                    time,
                    weaponKey
                );
            }
        }

        let stage = this.stageFlow.update(time, this.leader.health, this.enemyManager.getAliveCount());
        if (this.stageFlow.consumeWaveAdvance()) {
            const waveIndex = this.stageFlow.currentWave - 1;
            this.enemyManager.spawnWave(this.activeMissionWaves[waveIndex], this.stageFlow.currentWave);
            this.spawnWaveMedkit(this.stageFlow.currentWave);
            this.spawnWaveAmmo(this.stageFlow.currentWave);
            if (this.stageFlow.currentWave === 2) this.weaponManager.addWeapon('pistol');
            this.pressureGraceUntil = time + this.waveTransitionGraceMs;
            this.nextIdlePressureAt = Math.max(this.nextIdlePressureAt, this.pressureGraceUntil);
            this.nextGunfireReinforceAt = Math.max(this.nextGunfireReinforceAt, this.pressureGraceUntil);
            const waveGain = Phaser.Math.Clamp(Number(this.runtimeSettings?.marines?.panicObjectiveGain) || 10, 0, 40);
            this.applyTeamMoraleDelta(marines, waveGain);
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TEAM CONFIDENCE UP', '#b8ffc7');
        }

        const missionState = this.missionFlow.update(time, this.leader, this.enemyManager, stage);
        const completedObjectives = this.countCompletedObjectives(missionState);
        if (completedObjectives > this.lastObjectiveProgressCount) {
            const gainStep = Phaser.Math.Clamp(Number(this.runtimeSettings?.marines?.panicObjectiveGain) || 10, 0, 40);
            const gain = (completedObjectives - this.lastObjectiveProgressCount) * gainStep;
            this.applyTeamMoraleDelta(marines, gain);
            this.showFloatingText(this.leader.x, this.leader.y - 38, `OBJECTIVE SECURED +${Math.round(gain)}`, '#c4ffd2');
        }
        this.lastObjectiveProgressCount = completedObjectives;
        this.lastMissionState = missionState;
        if (missionState.requestQueenSpawn) {
            this.spawnMissionQueen(missionState.queenSpawnWorld);
        }

        if (stage === 'extract') {
            this.updateObjectiveTargetMarker(missionState.targetWorld, time);
            if (missionState.readyForExtraction) {
                this.extractionRing.setVisible(true);
                this.extractionLabel.setVisible(true);
                const extractDist = Phaser.Math.Distance.Between(
                    this.leader.x,
                    this.leader.y,
                    this.extractionWorldPos.x,
                    this.extractionWorldPos.y
                );
                if (extractDist <= 28) {
                    this.stageFlow.completeExtraction();
                    stage = this.stageFlow.state;
                }
            } else {
                this.extractionRing.setVisible(false);
                this.extractionLabel.setVisible(false);
            }
        } else {
            this.updateObjectiveTargetMarker(null, time);
        }

        this.updateStageUI(stage, missionState);
        this.updateObjectives(missionState);
        this.updateCombatFeedback(time);
        this.updateDebugOverlay(time);
        this.updateMoveTargetIcon(time, delta);
    }

    getTeamHealthTotal(marines) {
        let total = 0;
        for (const m of marines || []) {
            if (!m || typeof m.health !== 'number') continue;
            total += Math.max(0, m.health);
        }
        return total;
    }

    getTeamHealthPct(marines) {
        let hp = 0;
        let maxHp = 0;
        for (const m of marines || []) {
            if (!m || m.active === false || m.alive === false) continue;
            const mh = Math.max(1, Number(m.maxHealth) || 100);
            hp += Math.max(0, Number(m.health) || 0);
            maxHp += mh;
        }
        if (maxHp <= 0) return 0;
        return Phaser.Math.Clamp(hp / maxHp, 0, 1);
    }

    shouldApplySurvivalRelief(marines) {
        const teamHpPct = this.getTeamHealthPct(marines);
        if (teamHpPct <= 0.42) return true;
        const aliveCount = (marines || []).filter((m) => m && m.active !== false && m.alive !== false).length;
        return aliveCount <= 2;
    }

    getAverageMorale(marines) {
        let sum = 0;
        let n = 0;
        for (const m of marines || []) {
            if (!m || !Number.isFinite(m.morale)) continue;
            sum += m.morale;
            n++;
        }
        return n > 0 ? sum / n : 0;
    }

    applyMarineMoraleDelta(marine, delta) {
        if (!marine || !Number.isFinite(delta) || delta === 0) return;
        const base = Number.isFinite(marine.morale) ? marine.morale : 0;
        marine.morale = Phaser.Math.Clamp(base + delta, -100, 100);
    }

    applyTeamMoraleDelta(marines, delta) {
        if (!Array.isArray(marines) || !Number.isFinite(delta) || delta === 0) return;
        for (const marine of marines) {
            if (!marine || marine.alive === false || marine.active === false) continue;
            this.applyMarineMoraleDelta(marine, delta);
        }
    }

    onEnemyKilled(_enemy, projectile = null, time = this.time.now) {
        const owner = projectile && projectile.ownerRoleKey ? projectile.ownerRoleKey : 'leader';
        if (owner === 'leader') {
            this.showFloatingText(this.leader.x, this.leader.y - 20, 'HOSTILE DOWN', '#ffde9a');
            return;
        }
        const marine = this.squadSystem?.getFollowerByRole?.(owner) || null;
        if (!marine || marine.active === false || marine.alive === false) return;
        this.applyMarineMoraleDelta(marine, 3);
        const key = marine.roleKey || 'leader';
        this.lastDamageCalloutByMarine.set(key, Math.max(this.lastDamageCalloutByMarine.get(key) || 0, time + 700));
        if (Math.random() < 0.34) {
            const line = Phaser.Utils.Array.GetRandom(['Target down!', 'One less!', 'Got it!', 'Hostile dropped!']);
            this.showFloatingText(marine.x, marine.y - 20, line, '#ffe2a8');
        }
    }

    countCompletedObjectives(missionState = null) {
        if (!missionState || !Array.isArray(missionState.objectiveLines)) return 0;
        let n = 0;
        for (const line of missionState.objectiveLines) {
            if (typeof line === 'string' && line.trim().startsWith('[x]')) n++;
        }
        return n;
    }

    updateCombatDirector(time, delta, marines) {
        if (!this.combatDirector) return null;
        const scriptEnabled = (Number(this.runtimeSettings?.scripting?.directorEnabled) || 0) > 0;
        const directorEnabled = (Number(this.runtimeSettings?.director?.enabled) || 0) > 0;
        if (!scriptEnabled || !directorEnabled) {
            return {
                state: 'manual',
                pressure: 0.25,
                enemyAggressionMul: 1,
                enemyFlankMul: 1,
                enemyDoorDamageMul: 1,
                marineAccuracyMul: 1,
                marineJamMul: 1,
                marineReactionMul: 1,
            };
        }
        const tickMs = Number(this.runtimeSettings?.scripting?.eventTickMs) || 80;
        if ((time - this.lastDirectorUpdateAt) < tickMs) {
            return this.combatMods || this.combatDirector.getModifiers();
        }
        this.lastDirectorUpdateAt = time;
        const teamHealth = this.getTeamHealthTotal(marines);
        let recentDamage = 0;
        if ((time - this.lastTeamDamageSampleAt) >= this.teamDamageSampleWindowMs) {
            recentDamage = Math.max(0, this.lastTeamHealthSample - teamHealth);
            this.lastTeamHealthSample = teamHealth;
            this.lastTeamDamageSampleAt = time;
        }
        const telemetry = {
            hostilesOnScreen: this.enemyManager.getOnScreenHostileCount(this.cameras.main),
            teamDamageRecent: recentDamage,
            doorPressure: this.enemyManager.sampleDoorPressure ? this.enemyManager.sampleDoorPressure(time) : 0,
            firing: this.inputHandler.isFiring,
            avgMorale: this.getAverageMorale(marines),
        };
        return this.combatDirector.update(time, delta, telemetry);
    }

    showDoorContextMenu(doorGroup, worldX, worldY) {
        const actions = doorGroup.getAvailableActions();
        if (actions.length === 0) return;

        this.contextMenu.show(worldX, worldY, actions, (action) => {
            this.inputHandler.consumeMenuClick();
            const queued = this.doorActionSystem.queueAction(this.leader, doorGroup, action);
            if (!queued) {
                this.showFloatingText(this.leader.x, this.leader.y - 22, 'Cannot queue action from this side', '#ffb388');
            }
        });
    }

    handleDoorRightClick(doorGroup, worldX, worldY) {
        this.showDoorContextMenu(doorGroup, worldX, worldY);
    }

    findMarineAtWorldPos(worldX, worldY, radius = 26) {
        const r = Math.max(12, radius);
        const all = this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader];
        let best = null;
        let bestDist = Infinity;
        for (const marine of all) {
            if (!marine || marine.active === false || marine.alive === false) continue;
            const d = Phaser.Math.Distance.Between(worldX, worldY, marine.x, marine.y);
            if (d <= r && d < bestDist) {
                best = marine;
                bestDist = d;
            }
        }
        return best;
    }

    handleMarineRightClick(targetMarine, worldX, worldY) {
        if (!targetMarine || targetMarine.active === false || targetMarine.alive === false) return;
        if (this.healAction) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'HEAL IN PROGRESS', '#ffd18f');
            return;
        }
        this.contextMenu.show(worldX, worldY, [{ label: 'Order Heal', action: 'heal_target' }], (action) => {
            if (action !== 'heal_target') return;
            const ok = this.startHealAction(targetMarine, this.time.now, { auto: false, preferredRoleKey: 'medic' });
            if (!ok) {
                this.showFloatingText(this.leader.x, this.leader.y - 22, 'NO HEALER AVAILABLE', '#ffb388');
            }
        });
    }

    pickHealOperator(preferredRoleKey = 'medic') {
        if (!this.squadSystem) return { actor: this.leader, roleKey: null };
        const tryRole = (roleKey) => {
            const m = this.squadSystem.getFollowerByRole(roleKey);
            if (!m || m.active === false || m.alive === false) return null;
            if (this.squadSystem.isRoleTaskActive(roleKey)) return null;
            if (this.isMarineTrackerBusy(m, this.time.now)) return null;
            return { actor: m, roleKey };
        };
        const preferred = tryRole(preferredRoleKey);
        if (preferred) return preferred;
        const medic = preferredRoleKey !== 'medic' ? tryRole('medic') : null;
        if (medic) return medic;
        const tech = tryRole('tech');
        if (tech) return tech;
        const heavy = tryRole('heavy');
        if (heavy) return heavy;
        if (!this.isMarineTrackerBusy(this.leader, this.time.now)) return { actor: this.leader, roleKey: null };
        return null;
    }

    isMarineHealBusy(marine, time = this.time.now) {
        if (!marine || !this.healAction) return false;
        if (time > this.healAction.completeAt) return false;
        const h = this.healAction;
        if (marine === h.operator || marine === h.target) return true;
        if (marine.roleKey && (marine.roleKey === h.operatorRoleKey || marine.roleKey === h.targetRoleKey)) return true;
        return false;
    }

    isLeaderHealBusy(time = this.time.now) {
        return this.isMarineHealBusy(this.leader, time);
    }

    updateHealActionLock(time = this.time.now) {
        const h = this.healAction;
        if (!h) return;
        if (time > h.completeAt) return;
        if (h.operatorRoleKey && this.squadSystem) this.squadSystem.setExternalHoldRole(h.operatorRoleKey, true);
        if (h.targetRoleKey && this.squadSystem) this.squadSystem.setExternalHoldRole(h.targetRoleKey, true);
        if (h.operator === this.leader || h.target === this.leader) {
            this.inputHandler.isFiring = false;
            this.contextMenu.hide();
            this.movementSystem.clearPath(this.leader);
            if (this.leader?.body) this.leader.body.setVelocity(0, 0);
        }
    }

    startHealAction(targetMarine, time = this.time.now, options = {}) {
        if (!targetMarine || targetMarine.active === false || targetMarine.alive === false) return false;
        if (this.healAction) return false;
        if (this.isMarineTrackerBusy(targetMarine, time)) return false;
        if (targetMarine.roleKey && this.squadSystem && this.squadSystem.isRoleTaskActive(targetMarine.roleKey)) return false;
        const operatorInfo = this.pickHealOperator(options.preferredRoleKey || 'medic');
        if (!operatorInfo || !operatorInfo.actor) return false;
        const operator = operatorInfo.actor;
        if (operator.active === false || operator.alive === false) return false;
        if (this.isMarineTrackerBusy(operator, time)) return false;

        const isMedic = operatorInfo.roleKey === 'medic';
        const baseDurationMs = 4200;
        const durationMs = isMedic ? Math.floor(baseDurationMs * 0.5) : baseDurationMs;
        const capPct = isMedic ? 0.9 : 0.65;
        const maxHp = Math.max(1, Number(targetMarine.maxHealth) || 100);
        const capHealth = Math.floor(maxHp * capPct);
        if ((Number(targetMarine.health) || 0) >= capHealth) return false;

        this.healAction = {
            operator,
            operatorRoleKey: operatorInfo.roleKey || null,
            target: targetMarine,
            targetRoleKey: targetMarine.roleKey || null,
            capPct,
            startedAt: time,
            completeAt: time + durationMs,
            auto: options.auto === true,
            operatorPrevHealth: Number(operator.health) || 0,
            operatorPrevDamagedAt: Number.isFinite(operator.lastDamagedAt) ? operator.lastDamagedAt : -1,
            targetPrevHealth: Number(targetMarine.health) || 0,
            targetPrevDamagedAt: Number.isFinite(targetMarine.lastDamagedAt) ? targetMarine.lastDamagedAt : -1,
        };

        if (this.healAction.operatorRoleKey && this.squadSystem) {
            this.squadSystem.setExternalHoldRole(this.healAction.operatorRoleKey, true);
        }
        if (this.healAction.targetRoleKey && this.squadSystem) {
            this.squadSystem.setExternalHoldRole(this.healAction.targetRoleKey, true);
        }
        const opName = this.healAction.operatorRoleKey ? this.healAction.operatorRoleKey.toUpperCase() : 'LEADER';
        const tgtName = this.healAction.targetRoleKey ? this.healAction.targetRoleKey.toUpperCase() : 'LEADER';
        this.showFloatingText(this.leader.x, this.leader.y - 24, `${opName} HEALING ${tgtName}`, '#9fe9ff');
        this.updateHealActionLock(time);
        return true;
    }

    isHealParticipantAttacked() {
        const h = this.healAction;
        if (!h) return false;
        const op = h.operator;
        const target = h.target;
        const opHp = Number(op?.health) || 0;
        const opDmgAt = Number.isFinite(op?.lastDamagedAt) ? op.lastDamagedAt : -1;
        const tHp = Number(target?.health) || 0;
        const tDmgAt = Number.isFinite(target?.lastDamagedAt) ? target.lastDamagedAt : -1;
        const hit = opHp < h.operatorPrevHealth || tHp < h.targetPrevHealth || opDmgAt > h.operatorPrevDamagedAt || tDmgAt > h.targetPrevDamagedAt;
        h.operatorPrevHealth = opHp;
        h.targetPrevHealth = tHp;
        h.operatorPrevDamagedAt = opDmgAt;
        h.targetPrevDamagedAt = tDmgAt;
        return hit;
    }

    cancelHealAction(attacked = false) {
        const h = this.healAction;
        if (!h) return;
        if (h.operatorRoleKey && this.squadSystem) this.squadSystem.setExternalHoldRole(h.operatorRoleKey, false);
        if (h.targetRoleKey && this.squadSystem) this.squadSystem.setExternalHoldRole(h.targetRoleKey, false);
        this.healAction = null;
        this.nextMedicAutoHealAt = this.time.now + 1200;
        if (attacked) {
            this.applyMarineMoraleDelta(h.operator, -6);
            this.applyMarineMoraleDelta(h.target, -6);
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'HEAL INTERRUPTED: CONTACT', '#ff9a9a');
        }
    }

    completeHealAction() {
        const h = this.healAction;
        if (!h) return;
        const target = h.target;
        const maxHp = Math.max(1, Number(target?.maxHealth) || 100);
        const capHealth = Math.floor(maxHp * h.capPct);
        const current = Math.max(0, Number(target?.health) || 0);
        const healAmount = Math.max(0, capHealth - current);
        if (healAmount > 0) {
            if (typeof target.heal === 'function') target.heal(healAmount);
            else target.health = Math.min(maxHp, current + healAmount);
            this.showFloatingText(target.x, target.y - 18, `+${Math.round(healAmount)} HP`, '#83ff9f');
            this.applyMarineMoraleDelta(h.operator, 5);
            this.applyMarineMoraleDelta(target, 4);
        }
        this.cancelHealAction(false);
    }

    updateHealingSystem(time, _delta, marines) {
        if (this.healAction) {
            if (this.isHealParticipantAttacked()) {
                this.cancelHealAction(true);
                return;
            }
            if (time >= this.healAction.completeAt) {
                this.completeHealAction();
                return;
            }
            this.updateHealActionLock(time);
            return;
        }

        if (time < this.nextMedicAutoHealAt) return;
        const medic = this.squadSystem ? this.squadSystem.getFollowerByRole('medic') : null;
        if (!medic || medic.active === false || medic.alive === false) return;
        if (this.squadSystem && this.squadSystem.isRoleTaskActive('medic')) return;
        if (this.isMarineTrackerBusy(medic, time)) return;

        const all = Array.isArray(marines) && marines.length > 0 ? marines : this.squadSystem.getAllMarines();
        let critical = null;
        let low = null;
        for (const m of all) {
            if (!m || m.active === false || m.alive === false) continue;
            const maxHp = Math.max(1, Number(m.maxHealth) || 100);
            const hpPct = Phaser.Math.Clamp((Number(m.health) || 0) / maxHp, 0, 1);
            if (hpPct < 0.3 && (!critical || hpPct < critical.hpPct)) critical = { marine: m, hpPct };
            if (hpPct < 0.82 && (!low || hpPct < low.hpPct)) low = { marine: m, hpPct };
        }
        const target = (critical && critical.marine) || (low && low.marine) || null;
        if (!target) {
            this.nextMedicAutoHealAt = time + 700;
            return;
        }
        const started = this.startHealAction(target, time, { auto: true, preferredRoleKey: 'medic' });
        if (!started) {
            this.nextMedicAutoHealAt = time + 600;
            return;
        }
        this.nextMedicAutoHealAt = time + 450;
    }

    updateTrackerAudioCue(time) {
        const cam = this.cameras.main;
        const view = cam ? cam.worldView : null;
        const near = this.getClosestEnemyForTrackerCue(view, 920);
        const trackerLocked = this.isMotionTrackerRiskLocked(time);
        if (!near) {
            if (this.trackerPulseText) this.trackerPulseText.setVisible(false);
            return;
        }
        const t = Phaser.Math.Clamp(1 - (near.dist / 920), 0, 1);
        const dir = this.getDirectionBucket(near.enemy.x, near.enemy.y);
        const closeCount = this.countCloseEnemiesToTeam(260);
        const swarmHot = closeCount >= 4 && t >= 0.38;
        const cuePos = this.getSquadTrackerCueScreenPos();
        if (this.trackerPulseText) {
            this.trackerPulseText.setPosition(cuePos.x, cuePos.y);
        }
        if (swarmHot && time >= this.nextThreatPulseAt) {
            this.showSquadTrackerBeepWord('SWARM CLOSE', '#ff8d8d', time);
            this.nextThreatPulseAt = time + Phaser.Math.Linear(2200, 900, Phaser.Math.Clamp(closeCount / 9, 0, 1));
        }

        // Passive proximity beeps (always on), even when tracker is not active.
        if (!trackerLocked) {
            if (time < this.nextAmbientBeepAt) return;
            const interval = Phaser.Math.Linear(1300, 220, t);
            this.showSquadTrackerBeepWord('BEEP', '#9db7ff', time);
            if (this.trackerPulseText) {
                const pct = Math.round(t * 100);
                this.trackerPulseText.setText(swarmHot ? `SWARM ${dir} ${pct}%` : `MOTION ${dir} ${pct}%`);
                this.trackerPulseText.setColor(swarmHot ? '#ffb0a6' : '#9db7ff');
                this.trackerPulseText.setVisible(true);
                this.pulseTrackerCueVisual();
            }
            this.nextAmbientBeepAt = time + interval;
            return;
        }

        if (time < this.nextTrackerBeepAt) return;
        const interval = Phaser.Math.Linear(1100, 160, t);
        this.showSquadTrackerBeepWord('BEEP', '#9de7ff', time);
        if (this.trackerPulseText) {
            this.trackerPulseText.setText(`TRACKER ${dir} ${Math.round(t * 100)}%`);
            this.trackerPulseText.setColor('#9de7ff');
            this.trackerPulseText.setVisible(true);
            this.pulseTrackerCueVisual();
        }
        this.nextTrackerBeepAt = time + interval;
    }

    pulseTrackerCueVisual() {
        if (!this.trackerPulseText) return;
        this.tweens.killTweensOf(this.trackerPulseText);
        this.trackerPulseText.setScale(1.06);
        this.tweens.add({
            targets: this.trackerPulseText,
            scale: 1,
            duration: 120,
            ease: 'Cubic.out',
        });
    }

    getSquadTrackerCueScreenPos() {
        const marines = this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader];
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const m of marines) {
            if (!m || m.active === false || m.alive === false) continue;
            sx += m.x;
            sy += m.y;
            n++;
        }
        const wx = n > 0 ? (sx / n) : this.leader.x;
        const wy = n > 0 ? (sy / n) : this.leader.y;
        const cam = this.cameras.main;
        const screenX = cam ? (wx - cam.scrollX) : wx;
        const screenY = cam ? (wy - cam.scrollY) : wy;
        const targetX = Phaser.Math.Clamp(screenX, 120, CONFIG.GAME_WIDTH - 120);
        const targetY = Phaser.Math.Clamp(screenY - 96, 32, CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT - 62);
        if (!Number.isFinite(this.trackerCueAnchorX) || !Number.isFinite(this.trackerCueAnchorY)) {
            this.trackerCueAnchorX = targetX;
            this.trackerCueAnchorY = targetY;
        } else {
            this.trackerCueAnchorX = Phaser.Math.Linear(this.trackerCueAnchorX, targetX, 0.22);
            this.trackerCueAnchorY = Phaser.Math.Linear(this.trackerCueAnchorY, targetY, 0.22);
        }
        return {
            x: this.trackerCueAnchorX,
            y: this.trackerCueAnchorY,
        };
    }

    showSquadTrackerBeepWord(word, color = '#9db7ff', time = this.time.now) {
        if (time < (this.nextTrackerWordAt || 0)) return;
        this.nextTrackerWordAt = time + 180;
        const p = this.getSquadTrackerCueScreenPos();
        const msg = this.add.text(
            p.x + Phaser.Math.Between(-10, 10),
            p.y - 20 + Phaser.Math.Between(-3, 3),
            word,
            {
                fontSize: '20px',
                fontFamily: 'Impact, "Arial Black", sans-serif',
                fontStyle: 'bold',
                color,
                backgroundColor: '#11212b',
                padding: { left: 8, right: 8, top: 3, bottom: 3 },
            }
        );
        msg.setOrigin(0.5);
        msg.setStroke('#001018', 4);
        msg.setShadow(2, 2, '#000000', 0.75, false, true);
        msg.setDepth(242);
        msg.setScrollFactor(0);
        this.tweens.add({
            targets: msg,
            y: msg.y - 18,
            alpha: 0,
            scale: 1.06,
            duration: 460,
            ease: 'Cubic.out',
            onComplete: () => msg.destroy(),
        });
    }
    emitWeaponFlashAndStimulus(x, y, angle, time, weaponKey = 'pulseRifle', options = {}) {
        const stimulusMul = Number(options.stimulusMul) || 1;
        this.showMuzzleFlash(x, y, angle, weaponKey);
        this.addGunFlashLight(x, y, angle, time, weaponKey);
        if (this.enemyManager && typeof this.enemyManager.registerLightStimulus === 'function') {
            const basePower = weaponKey === 'shotgun' ? 1.45 : (weaponKey === 'pistol' ? 0.85 : 1.0);
            this.enemyManager.registerLightStimulus(x, y, time, basePower * stimulusMul);
        }
    }

    initFxEmitters() {
        this.fxDotPool = [];
        this.fxSmokePool = [];
        this.fxActiveSprites = [];

        const addPoolSprites = (pool, key, count, depth, blendMode) => {
            for (let i = 0; i < count; i++) {
                const sprite = this.add.image(-1000, -1000, key);
                sprite.setVisible(false);
                sprite.setActive(false);
                sprite.setDepth(depth);
                sprite.setBlendMode(blendMode);
                sprite.setScale(0);
                pool.push(sprite);
            }
        };

        addPoolSprites(this.fxDotPool, 'fx_dot', 320, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxSmokePool, 'fx_smoke', 220, 232, Phaser.BlendModes.SCREEN);
    }

    acquireFxSprite(poolKey) {
        const pool = poolKey === 'smoke' ? this.fxSmokePool : this.fxDotPool;
        if (!pool) return null;
        for (let i = 0; i < pool.length; i++) {
            const sprite = pool[i];
            if (!sprite.active) return sprite;
        }
        return null;
    }

    spawnFxSprite(poolKey, x, y, options = {}) {
        const activeCount = this.fxActiveSprites ? this.fxActiveSprites.length : 0;
        const impactFxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const intensityNorm = Phaser.Math.Clamp((impactFxIntensity - 0.2) / 2.8, 0, 1);
        const intensityCapMul = Phaser.Math.Linear(0.9, 1.32, intensityNorm);
        const baseCap = poolKey === 'smoke' ? 230 : 350;
        const cap = Math.max(60, Math.floor(baseCap * (this.fxQualityScale || 1) * intensityCapMul));
        if (activeCount >= cap) return null;
        const sprite = this.acquireFxSprite(poolKey);
        if (!sprite) return null;
        const life = Math.max(1, Number(options.life) || 80);
        sprite.setActive(true);
        sprite.setVisible(true);
        sprite.setPosition(x, y);
        sprite.setRotation(Number(options.rotation) || 0);
        sprite.setScale(Number(options.scaleStart) || 0.3);
        sprite.setAlpha(Number(options.alphaStart) || 1);
        sprite.setTint(options.tint ?? 0xffffff);

        sprite.fx = {
            life,
            maxLife: life,
            vx: Number(options.vx) || 0,
            vy: Number(options.vy) || 0,
            gravityY: Number(options.gravityY) || 0,
            spin: Number(options.spin) || 0,
            scaleStart: Number(options.scaleStart) || 0.3,
            scaleEnd: Number(options.scaleEnd) || 0,
            alphaStart: Number(options.alphaStart) || 1,
            alphaEnd: Number(options.alphaEnd) || 0,
        };
        this.fxActiveSprites.push(sprite);
        return sprite;
    }

    updateFxSprites(delta) {
        if (!this.fxActiveSprites || this.fxActiveSprites.length === 0) return;
        const dt = Math.max(0.001, delta / 1000);
        for (let i = this.fxActiveSprites.length - 1; i >= 0; i--) {
            const sprite = this.fxActiveSprites[i];
            const fx = sprite.fx;
            if (!sprite.active || !fx) {
                this.fxActiveSprites.splice(i, 1);
                continue;
            }
            fx.life -= delta;
            if (fx.life <= 0) {
                sprite.setActive(false);
                sprite.setVisible(false);
                sprite.fx = null;
                this.fxActiveSprites.splice(i, 1);
                continue;
            }
            const t = Phaser.Math.Clamp(1 - (fx.life / fx.maxLife), 0, 1);
            sprite.x += fx.vx * dt;
            sprite.y += fx.vy * dt;
            fx.vy += fx.gravityY * dt;
            sprite.rotation += fx.spin * dt;
            sprite.setScale(Phaser.Math.Linear(fx.scaleStart, fx.scaleEnd, t));
            sprite.setAlpha(Phaser.Math.Linear(fx.alphaStart, fx.alphaEnd, t));
        }
    }

    updateFxQualityBudget(time) {
        if (time < this.nextFxQualityEvalAt) return;
        this.nextFxQualityEvalAt = time + 900;
        const fps = this.game && this.game.loop ? this.game.loop.actualFps : 60;
        if (fps < 38) this.fxQualityScale = 0.4;
        else if (fps < 46) this.fxQualityScale = 0.58;
        else if (fps < 53) this.fxQualityScale = 0.78;
        else if (fps < 58) this.fxQualityScale = 0.98;
        else if (fps < 62) this.fxQualityScale = 1.1;
        else this.fxQualityScale = 1.2;
    }

    buildMarineLightSources(marines) {
        const lighting = this.runtimeSettings?.lighting || {};
        const out = marines.map((marine) => ({
            x: marine.x,
            y: marine.y,
            angle: marine.rotation || 0,
            halfAngle: lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE,
            range: lighting.torchRange ?? CONFIG.TORCH_RANGE,
        }));
        const now = this.time.now;
        this.gunFlashLights = this.gunFlashLights.filter((f) => f.expiresAt > now);
        this.sparkLights = this.sparkLights.filter((f) => f.expiresAt > now);
        for (const f of this.gunFlashLights) {
            const t = Phaser.Math.Clamp((f.expiresAt - now) / f.duration, 0, 1);
            out.push({
                x: f.x,
                y: f.y,
                angle: f.angle,
                halfAngle: f.halfAngle ?? Math.PI,
                range: (f.rangeMin ?? 120) + (f.rangeBoost ?? 110) * t,
            });
        }
        for (const f of this.sparkLights) {
            const t = Phaser.Math.Clamp((f.expiresAt - now) / f.duration, 0, 1);
            out.push({
                x: f.x,
                y: f.y,
                angle: 0,
                halfAngle: Math.PI,
                range: (f.rangeMin ?? 18) + (f.rangeBoost ?? 34) * t,
            });
        }
        return out;
    }

    addGunFlashLight(x, y, angle, time, weaponKey = 'pulseRifle') {
        const profiles = {
            pulseRifle: { duration: 125, halfAngle: 0.75, rangeMin: 136, rangeBoost: 150 },
            shotgun: { duration: 160, halfAngle: 1.1, rangeMin: 165, rangeBoost: 190 },
            pistol: { duration: 95, halfAngle: 0.62, rangeMin: 108, rangeBoost: 115 },
        };
        const p = profiles[weaponKey] || profiles.pulseRifle;
        const duration = p.duration;
        if (this.gunFlashLights.length >= 80) this.gunFlashLights.shift();
        this.gunFlashLights.push({
            x,
            y,
            angle,
            duration,
            halfAngle: p.halfAngle,
            rangeMin: p.rangeMin,
            rangeBoost: p.rangeBoost,
            expiresAt: time + duration,
        });
    }

    addSparkLight(x, y, time, options = {}) {
        const duration = Math.max(24, Number(options.duration) || 58);
        if (this.sparkLights.length >= 64) this.sparkLights.shift();
        this.sparkLights.push({
            x,
            y,
            duration,
            rangeMin: Math.max(8, Number(options.rangeMin) || 18),
            rangeBoost: Math.max(6, Number(options.rangeBoost) || 34),
            expiresAt: time + duration,
        });
    }

    buildMarineShadowCasters(marines) {
        return marines.map((marine) => ({
            x: marine.x,
            y: marine.y,
            radius: 14,
            blocksLight: true,
        }));
    }

    updateStageUI(stage, missionState = null) {
        if (stage === 'combat') {
            this.stageText.setText(`WAVE ${this.stageFlow.getWaveLabel()} | HOSTILES: ${this.enemyManager.getAliveCount()}`);
            return;
        }

        if (stage === 'intermission') {
            this.stageText.setText(`WAVE ${this.stageFlow.getWaveLabel()} CLEARED | NEXT WAVE INBOUND`);
            return;
        }

        if (stage === 'extract') {
            if (missionState && !missionState.readyForExtraction) {
                this.stageText.setText(`PHASE: ${missionState.phaseLabel.toUpperCase()}`);
            } else {
                this.stageText.setText('FINAL OBJECTIVE: REACH EXTRACTION');
            }
            return;
        }

        if (stage === 'victory') {
            this.physics.world.pause();
            this.contextMenu.hide();
            this.doorActionSystem.cancelPending();
            this.movementSystem.clearPath(this.leader);
            this.extractionRing.setVisible(false);
            this.extractionLabel.setVisible(false);
            this.objectiveTargetMarker.setVisible(false);
            this.updateMetaProgress(true);
            this.stageText.setText('STAGE: MISSION COMPLETE');
            this.endHintText.setText(`${this.buildMissionStatsText()}\n${this.buildMetaProgressText()}\nClick or press R to restart`);
            this.endHintText.setVisible(true);
            return;
        }

        if (stage === 'defeat') {
            this.physics.world.pause();
            this.contextMenu.hide();
            this.doorActionSystem.cancelPending();
            this.movementSystem.clearPath(this.leader);
            this.extractionRing.setVisible(false);
            this.extractionLabel.setVisible(false);
            this.objectiveTargetMarker.setVisible(false);
            this.updateMetaProgress(false);
            this.stageText.setText('STAGE: TEAM WIPED');
            this.endHintText.setText(`${this.buildMissionStatsText()}\n${this.buildMetaProgressText()}\nClick or press R to restart`);
            this.endHintText.setVisible(true);
        }
    }

    updateObjectives(missionState = null) {
        if (!this.objectivesPanel) return;
        this.objectivesPanel.update({
            stage: this.stageFlow.state,
            currentWave: this.stageFlow.currentWave,
            totalWaves: this.stageFlow.totalWaves,
            objectiveLines: missionState ? missionState.objectiveLines : null,
        });
    }

    spawnWaveMedkit(waveNumber) {
        if (waveNumber <= 1 || MEDKIT_WAVE_SPAWNS.length === 0) return;
        const idx = (waveNumber - 2) % MEDKIT_WAVE_SPAWNS.length;
        const spot = MEDKIT_WAVE_SPAWNS[idx];
        const pos = this.pathGrid.tileToWorld(spot.tileX, spot.tileY);
        const pickup = this.pickupGroup.create(pos.x, pos.y, 'pickup_medkit');
        pickup.setDepth(12);
        pickup.collected = false;
        pickup.kind = 'medkit';
    }

    spawnWaveAmmo(waveNumber) {
        if (waveNumber <= 1 || AMMO_WAVE_SPAWNS.length === 0) return;
        const idx = (waveNumber - 2) % AMMO_WAVE_SPAWNS.length;
        const spot = AMMO_WAVE_SPAWNS[idx];
        const pos = this.pathGrid.tileToWorld(spot.tileX, spot.tileY);
        const pickup = this.pickupGroup.create(pos.x, pos.y, 'pickup_ammo');
        pickup.setDepth(12);
        pickup.collected = false;
        pickup.kind = 'ammo';
        pickup.weaponKey = waveNumber % 2 === 0 ? 'pistol' : 'shotgun';
        pickup.amount = AMMO_PICKUP_VALUE[pickup.weaponKey] || 0;
    }

    buildMissionStatsText() {
        const elapsedMs = Math.max(0, this.time.now - this.sessionStartTime);
        const totalSec = Math.floor(elapsedMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = String(totalSec % 60).padStart(2, '0');
        const title = this.stageFlow.state === 'victory' ? 'MISSION COMPLETE' : 'TEAM WIPED';
        return `${title}\nKills: ${this.totalKills} | Time: ${min}:${sec}`;
    }

    loadMetaProgress() {
        const defaults = {
            bestClearSec: null,
            bestKills: 0,
            runs: 0,
        };
        try {
            const raw = localStorage.getItem('aliens_meta_progress');
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            return {
                bestClearSec: Number.isFinite(parsed.bestClearSec) ? parsed.bestClearSec : null,
                bestKills: Number.isFinite(parsed.bestKills) ? parsed.bestKills : 0,
                runs: Number.isFinite(parsed.runs) ? parsed.runs : 0,
            };
        } catch (_) {
            return defaults;
        }
    }

    updateMetaProgress(cleared) {
        if (this.metaUpdated) return;
        this.metaUpdated = true;
        const elapsedSec = Math.floor(Math.max(0, this.time.now - this.sessionStartTime) / 1000);
        this.meta.runs += 1;
        this.meta.bestKills = Math.max(this.meta.bestKills, this.totalKills);
        if (cleared) {
            if (this.meta.bestClearSec === null || elapsedSec < this.meta.bestClearSec) {
                this.meta.bestClearSec = elapsedSec;
            }
        }
        try {
            localStorage.setItem('aliens_meta_progress', JSON.stringify(this.meta));
        } catch (_) {
            // Ignore storage failures (private mode, quota, etc.)
        }
    }

    buildMetaProgressText() {
        const bestTime = this.meta.bestClearSec === null
            ? '--:--'
            : `${Math.floor(this.meta.bestClearSec / 60)}:${String(this.meta.bestClearSec % 60).padStart(2, '0')}`;
        return `Best Time: ${bestTime} | Best Kills: ${this.meta.bestKills} | Runs: ${this.meta.runs}`;
    }

    updateDebugOverlay(time) {
        if (!this.debugOverlay) return;
        const phase = this.lastMissionState && this.lastMissionState.phaseLabel
            ? ` | ${this.lastMissionState.phaseLabel}`
            : '';
        this.debugOverlay.update(time, {
            stage: `${this.stageFlow.state} (wave ${this.stageFlow.getWaveLabel()})${phase} | Director: ${this.directorSourceLabel || 'SETTINGS'}${this.getMissionPackageMetaDebugSuffix()}`,
            hostiles: this.enemyManager.getAliveCount(),
            health: this.leader.health,
            inputMode: 'mouse',
            isFiring: this.inputHandler.isFiring,
            pointer: this.inputHandler.getPointerWorldPosition(),
            paused: this.isPaused,
            kills: this.totalKills,
            pathStats: this.pathPlanner && this.pathPlanner.getStats ? this.pathPlanner.getStats() : null,
            warnings: this.collectLogicWarnings(time),
        });
    }

    collectLogicWarnings(time = this.time.now) {
        const warnings = [];
        if (this.healAction && this.isMotionTrackerRiskLocked(time) && this.trackerOperator) {
            const h = this.healAction;
            const t = this.trackerOperator;
            const sameActor = t.actor && (t.actor === h.operator || t.actor === h.target);
            const sameRole = !!(t.roleKey && (t.roleKey === h.operatorRoleKey || t.roleKey === h.targetRoleKey));
            if (sameActor || sameRole) warnings.push('Tracker/Heal lock overlap');
        }
        const maxAcid = Math.max(0, Math.floor(Number(this.runtimeSettings?.objects?.acidHazardMaxActive) || 16));
        if ((this.acidHazards?.length || 0) > maxAcid) warnings.push('Acid hazards over cap');
        const totalCap = Number.isFinite(this.reinforceCapEffective) ? this.reinforceCapEffective : this.reinforceCap;
        if (!Number.isFinite(totalCap) || totalCap < 0) warnings.push('Invalid reinforcement cap');
        const fxActive = this.fxActiveSprites ? this.fxActiveSprites.length : 0;
        const impactFxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const intensityNorm = Phaser.Math.Clamp((impactFxIntensity - 0.2) / 2.8, 0, 1);
        const intensityCapMul = Phaser.Math.Linear(0.9, 1.32, intensityNorm);
        const fxCap = Math.max(60, Math.floor(420 * (this.fxQualityScale || 1) * intensityCapMul));
        if (fxActive >= Math.floor(fxCap * 0.94)) warnings.push('FX near saturation cap');
        if (this.missionPackageMetaStale) warnings.push('Mission package checksum stale');
        return warnings;
    }

    getMissionPackageMetaDebugSuffix() {
        const meta = this.missionPackageMeta;
        const summary = this.missionPackageSummary;
        const stale = this.missionPackageMetaStale ? ' STALE' : '';
        if (!meta || !meta.publishedAt) {
            if (!summary) return '';
            return ` | Pkg:${summary.maps}/${summary.missions} evt:${summary.directorEvents} cue:${summary.audioCues}${stale}`;
        }
        const ageSec = Math.max(0, Math.floor((Date.now() - meta.publishedAt) / 1000));
        const counts = summary
            ? ` map:${summary.maps} mis:${summary.missions} evt:${summary.directorEvents} cue:${summary.audioCues}`
            : '';
        return ` | PkgAge:${ageSec}s${counts}${stale}`;
    }

    refreshMissionPackageRuntimeMeta(time = this.time.now) {
        if (time < (this.nextMissionPackageMetaRefreshAt || 0)) return;
        this.nextMissionPackageMetaRefreshAt = time + 2000;
        this.missionPackageMeta = getMissionPackageMeta();
        this.missionPackageSummary = getMissionPackageSummary();
        this.missionPackageMetaStale = isMissionPackageMetaStale();
    }

    updateCombatFeedback(time) {
        const hp = this.leader.health;
        if (hp < this.prevHealth) {
            const lost = this.prevHealth - hp;
            const alpha = Phaser.Math.Clamp(0.12 + lost / 100, 0.12, 0.4);
            this.damageFlash.setFillStyle(0xaa0000, alpha);
            this.tweens.add({
                targets: this.damageFlash,
                alpha: 0,
                duration: 220,
                ease: 'Quad.out',
            });
            const shakeMul = this.getCameraShakeMul();
            if (shakeMul > 0) {
                this.cameras.main.shake(90, Math.min(0.004 + lost * 0.0002, 0.012) * shakeMul, true);
            }
        }
        this.prevHealth = hp;

        const lowHealth = hp / this.leader.maxHealth <= 0.3;
        this.lowHealthText.setVisible(lowHealth && !this.stageFlow.isEnded());
        if (lowHealth) {
            const pulse = 0.5 + 0.5 * Math.sin(time / 140);
            this.lowHealthText.setAlpha(0.55 + pulse * 0.45);
        }
    }

    getCameraShakeMul() {
        return Phaser.Math.Clamp(Number(this.runtimeSettings?.other?.cameraShakeMul) || 1, 0, 2);
    }

    showFloatingText(x, y, text, color) {
        const msg = this.add.text(x, y, text, {
            fontSize: '11px',
            fontFamily: 'monospace',
            color,
            backgroundColor: '#111111',
            padding: { left: 3, right: 3, top: 1, bottom: 1 },
        });
        msg.setOrigin(0.5);
        msg.setDepth(235);
        this.tweens.add({
            targets: msg,
            y: y - 18,
            alpha: 0,
            duration: 750,
            ease: 'Quad.out',
            onComplete: () => msg.destroy(),
        });
    }

    tryMarineSpotCallout(marine, time = this.time.now) {
        if (!marine || marine.active === false || marine.alive === false) return;
        if (time < (this.nextMarineSpotCalloutAt || 0)) return;
        const perMarineNext = Number.isFinite(marine.nextSpotCalloutAt) ? marine.nextSpotCalloutAt : 0;
        if (time < perMarineNext) return;
        if (Math.random() > 0.68) return;

        const roleKey = marine.roleKey || 'leader';
        const rolePool = ROLE_SPOT_CALLOUTS[roleKey] || [];
        const sourcePool = rolePool.length > 0 ? rolePool.concat(MARINE_SPOT_CALLOUTS) : MARINE_SPOT_CALLOUTS;
        const prev = marine.lastSpotCallout || '';
        const pool = sourcePool.filter((line) => line !== prev);
        const line = Phaser.Utils.Array.GetRandom(pool.length > 0 ? pool : sourcePool);
        marine.lastSpotCallout = line;
        marine.nextSpotCalloutAt = time + Phaser.Math.Between(2600, 4200);
        this.nextMarineSpotCalloutAt = time + Phaser.Math.Between(1000, 1700);
        this.showFloatingText(marine.x, marine.y - 24, line, '#ffd9a6');
    }

    onMarineDamaged(marine, _damageAmount = 0, time = this.time.now) {
        if (!marine || marine.active === false || marine.alive === false) return;
        const tuning = this.runtimeSettings?.marines || {};
        const attackCooldown = Phaser.Math.Clamp(Number(tuning.radioUnderAttackMinMs) || 1800, 200, 12000);
        const attackChance = Phaser.Math.Clamp(Number(tuning.radioUnderAttackChance) || 0.86, 0, 1);
        const key = marine.roleKey || 'leader';
        const nextAt = this.lastDamageCalloutByMarine.get(key) || 0;
        if (time < nextAt) return;
        if (time < (this.nextMarineAttackCalloutAt || 0)) return;
        if (Math.random() > attackChance) return;
        const rolePool = ROLE_ATTACK_CALLOUTS[key] || [];
        const sourcePool = rolePool.length > 0 ? rolePool.concat(MARINE_ATTACK_CALLOUTS) : MARINE_ATTACK_CALLOUTS;
        const line = Phaser.Utils.Array.GetRandom(sourcePool);
        this.showFloatingText(marine.x, marine.y - 26, line, '#ffb9a0');
        this.lastDamageCalloutByMarine.set(key, time + attackCooldown);
        this.nextMarineAttackCalloutAt = time + Phaser.Math.Between(1200, 2100);
    }

    updateLowAmmoCallouts(time = this.time.now) {
        if (!this.weaponManager) return;
        if (time < (this.nextLowAmmoCalloutAt || 0)) return;
        const key = this.weaponManager.currentWeaponKey || 'pulseRifle';
        const def = this.weaponManager.getRuntimeWeaponDef(key);
        if (!def || def.ammoType !== 'limited') return;
        const ammo = Math.max(0, Number(this.weaponManager.ammo[key]) || 0);
        const threshold = key === 'shotgun' ? 3 : 6;
        if (ammo > threshold) return;

        const shouldSpeak = this.lastLowAmmoWeaponKey !== key
            || ammo !== this.lastLowAmmoAmount
            || Math.random() < 0.35;
        if (!shouldSpeak) {
            this.nextLowAmmoCalloutAt = time + Phaser.Math.Between(900, 1700);
            return;
        }

        const line = Phaser.Utils.Array.GetRandom(LOW_AMMO_CALLOUTS);
        this.showFloatingText(this.leader.x, this.leader.y - 28, line, '#ffd2a4');
        this.lastLowAmmoWeaponKey = key;
        this.lastLowAmmoAmount = ammo;
        this.nextLowAmmoCalloutAt = time + Phaser.Math.Between(2200, 3600);
    }

    updateMarineRadioChatter(time, marines) {
        const tuning = this.runtimeSettings?.marines || {};
        const ambientMin = Phaser.Math.Clamp(Number(tuning.radioAmbientMinMs) || 4200, 400, 15000);
        const ambientMax = Phaser.Math.Clamp(Number(tuning.radioAmbientMaxMs) || 8800, ambientMin, 24000);
        const ambientChance = Phaser.Math.Clamp(Number(tuning.radioAmbientChance) || 0.46, 0, 1);
        if (time < (this.nextMarineAmbientRadioAt || 0)) return;
        if (!Array.isArray(marines) || marines.length === 0) return;
        const onScreen = this.enemyManager?.getOnScreenHostileCount?.(this.cameras.main) || 0;
        if (onScreen <= 0) {
            this.nextMarineAmbientRadioAt = time + Phaser.Math.Between(ambientMin, ambientMax);
            return;
        }
        if (Math.random() > ambientChance) {
            this.nextMarineAmbientRadioAt = time + Phaser.Math.Between(ambientMin, ambientMax);
            return;
        }

        const candidates = marines.filter((m) => {
            if (!m || m.active === false || m.alive === false) return false;
            if (this.isMarineTrackerBusy(m, time) || this.isMarineHealBusy(m, time)) return false;
            const key = m.roleKey || 'leader';
            const blockedUntil = this.lastDamageCalloutByMarine.get(key) || 0;
            return time >= blockedUntil;
        });
        if (candidates.length === 0) {
            this.nextMarineAmbientRadioAt = time + Phaser.Math.Between(ambientMin, ambientMax);
            return;
        }
        const speaker = Phaser.Utils.Array.GetRandom(candidates);
        const line = Phaser.Utils.Array.GetRandom(MARINE_AMBIENT_CHATTER);
        this.showFloatingText(speaker.x, speaker.y - 22, line, '#bcd8ff');
        this.nextMarineAmbientRadioAt = time + Phaser.Math.Between(ambientMin, ambientMax);
    }

    updateAtmosphereIncidents(time, marines) {
        if (time < (this.nextAtmosphereIncidentAt || 0)) return;
        const pressure = Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0, 0, 1);
        const onScreen = this.enemyManager?.getOnScreenHostileCount?.(this.cameras.main) || 0;
        if (pressure < 0.46 || onScreen < 2) {
            this.nextAtmosphereIncidentAt = time + Phaser.Math.Between(2800, 5200);
            return;
        }
        const chance = Phaser.Math.Clamp((pressure - 0.46) * 1.3, 0.08, 0.64);
        if (Math.random() > chance) {
            this.nextAtmosphereIncidentAt = time + Phaser.Math.Between(2400, 4600);
            return;
        }
        const candidates = (marines || []).filter((m) => m && m.active !== false && m.alive !== false);
        if (candidates.length === 0) return;
        const anchor = Phaser.Utils.Array.GetRandom(candidates);
        const line = Phaser.Utils.Array.GetRandom(RADIO_STATIC_INCIDENTS);
        this.showFloatingText(anchor.x, anchor.y - 34, line, '#9ed0ff');
        this.nextAtmosphereIncidentAt = time + Phaser.Math.Between(4800, 9000);
    }

    createMoveTargetIcon() {
        this.moveTarget = this.add.container(0, 0);
        this.moveTarget.setDepth(230);
        this.moveTarget.setVisible(false);

        const ring = this.add.circle(0, 0, 10, 0x99ddff, 0);
        ring.setStrokeStyle(2, 0x99ddff, 0.95);
        const dot = this.add.circle(0, 0, 2, 0xcceeff, 1);
        this.moveTarget.add([ring, dot]);
        this.moveTarget.ring = ring;
        this.moveTarget.dot = dot;
        this.moveTarget.alpha = 0;
        this.moveTargetTTL = 0;
    }

    setMoveTarget(worldX, worldY) {
        if (!this.moveTarget) return;
        this.moveTarget.setPosition(worldX, worldY);
        this.moveTarget.setVisible(true);
        this.moveTarget.alpha = 1;
        this.moveTargetTTL = 1200;
        this.moveTarget.ring.setScale(0.65);
        this.tweens.add({
            targets: this.moveTarget.ring,
            scale: 1,
            duration: 220,
            ease: 'Quad.out',
        });
    }

    updateMoveTargetIcon(time, delta) {
        if (!this.moveTarget || !this.moveTarget.visible) return;
        if (!this.leader.currentPath && this.moveTargetTTL > 260) {
            this.moveTargetTTL = 260;
        }
        this.moveTargetTTL = Math.max(0, this.moveTargetTTL - delta);
        const pulse = 0.75 + 0.25 * Math.sin(time / 120);
        this.moveTarget.dot.setScale(pulse);
        if (this.moveTargetTTL <= 0) {
            this.moveTarget.setVisible(false);
            return;
        }
        if (this.moveTargetTTL < 260) {
            this.moveTarget.alpha = this.moveTargetTTL / 260;
        }
    }

    spawnMissionQueen(preferredWorld = null) {
        if (this.warriorOnlyTesting) return;
        let world = preferredWorld;
        if (!world) {
            const tx = Math.floor(this.pathGrid.width * 0.7);
            const ty = Math.floor(this.pathGrid.height * 0.5);
            world = this.pathGrid.tileToWorld(tx, ty);
        }
        const queen = this.enemyManager.spawnEnemyAtWorld('queen', world.x, world.y, 1.08);
        if (queen) {
            queen.alertUntil = Math.max(queen.alertUntil, this.time.now + 9000);
            this.showFloatingText(world.x, world.y - 28, 'QUEEN DETECTED', '#ff99aa');
        }
    }

    createObjectiveTargetMarker() {
        this.objectiveTargetMarker = this.add.circle(0, 0, 16, 0xffd166, 0.15);
        this.objectiveTargetMarker.setStrokeStyle(2, 0xffd166, 0.9);
        this.objectiveTargetMarker.setDepth(9);
        this.objectiveTargetMarker.setVisible(false);
    }

    updateObjectiveTargetMarker(targetWorld, time) {
        if (!this.objectiveTargetMarker) return;
        if (!targetWorld) {
            this.objectiveTargetMarker.setVisible(false);
            return;
        }
        this.objectiveTargetMarker.setVisible(true);
        this.objectiveTargetMarker.setPosition(targetWorld.x, targetWorld.y);
        const pulse = 1 + Math.sin(time * 0.01) * 0.18;
        this.objectiveTargetMarker.setScale(pulse);
    }

    applyDefaultCursor() {
        const targetSvg = [
            "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>",
            "<circle cx='16' cy='16' r='6' fill='none' stroke='%2399ddff' stroke-width='2'/>",
            "<circle cx='16' cy='16' r='1.8' fill='%23e6f7ff'/>",
            "<line x1='16' y1='2' x2='16' y2='8' stroke='%2399ddff' stroke-width='2'/>",
            "<line x1='16' y1='24' x2='16' y2='30' stroke='%2399ddff' stroke-width='2'/>",
            "<line x1='2' y1='16' x2='8' y2='16' stroke='%2399ddff' stroke-width='2'/>",
            "<line x1='24' y1='16' x2='30' y2='16' stroke='%2399ddff' stroke-width='2'/>",
            "</svg>",
        ].join('');
        const encoded = `data:image/svg+xml;utf8,${targetSvg}`;
        this.defaultCursor = `url("${encoded}") 16 16, crosshair`;
        this.input.setDefaultCursor(this.defaultCursor);
    }

    updateCursorState() {
        if (!this.input || !this.input.activePointer) return;
        if (this.contextMenu && this.contextMenu.isOpen) return;

        const pointer = this.input.activePointer;
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;
        let actionable = false;

        if (this.doorManager.getDoorGroupAtWorldPos(worldX, worldY)) {
            actionable = true;
        } else {
            const children = this.pickupGroup ? this.pickupGroup.getChildren() : [];
            for (let i = 0; i < children.length; i++) {
                const p = children[i];
                if (!p.active) continue;
                const d = Phaser.Math.Distance.Between(worldX, worldY, p.x, p.y);
                if (d <= 14) {
                    actionable = true;
                    break;
                }
            }
        }

        if (actionable) {
            this.input.setDefaultCursor('pointer');
        } else if (this.defaultCursor) {
            this.input.setDefaultCursor(this.defaultCursor);
        }
    }

    showMuzzleFlash(x, y, angle, weaponKey = 'pulseRifle') {
        const flashScale = Number(this.runtimeSettings?.spriteAnimation?.muzzleFlashScale) || 1;
        const profiles = {
            pulseRifle: {
                coneCore: 0.11,
                coneSpark: 0.09,
                coneEmber: 0.3,
                coreMul: 1.0,
                sparkMul: 1.0,
                emberMul: 0.9,
                smokeChance: 0.22,
                speedMul: 1.0,
                paletteCore: [0xffffff, 0xfff3bf, 0xffd57a],
                paletteSpark: [0xfff0a8, 0xffc25a, 0xff8f2e],
                paletteEmber: [0xffcf73, 0xff9f3f, 0xff6f2a],
            },
            shotgun: {
                coneCore: 0.22,
                coneSpark: 0.2,
                coneEmber: 0.44,
                coreMul: 1.45,
                sparkMul: 1.9,
                emberMul: 1.4,
                smokeChance: 0.38,
                speedMul: 1.2,
                paletteCore: [0xffffff, 0xffefb0, 0xffc56e],
                paletteSpark: [0xffe39e, 0xffb04a, 0xff7d25],
                paletteEmber: [0xffc261, 0xff8f33, 0xff5e1f],
            },
            pistol: {
                coneCore: 0.08,
                coneSpark: 0.06,
                coneEmber: 0.2,
                coreMul: 0.66,
                sparkMul: 0.6,
                emberMul: 0.55,
                smokeChance: 0.08,
                speedMul: 0.82,
                paletteCore: [0xffffff, 0xf3f5ff, 0xd8e2ff],
                paletteSpark: [0xdfe8ff, 0xc0d1ff, 0x97a9dd],
                paletteEmber: [0xc5d2ff, 0xa9bbef, 0x879cd9],
            },
        };
        const p = profiles[weaponKey] || profiles.pulseRifle;
        const offset = 18 * flashScale;
        const fx = x + Math.cos(angle) * offset;
        const fy = y + Math.sin(angle) * offset;
        const coreQty = Math.max(2, Math.round(8 * p.coreMul * flashScale * this.fxQualityScale));
        for (let i = 0; i < coreQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneCore, p.coneCore);
            const speed = Phaser.Math.FloatBetween(90, 220) * p.speedMul;
            const tint = Phaser.Utils.Array.GetRandom(p.paletteCore);
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                life: Phaser.Math.Between(24, 64),
                scaleStart: Phaser.Math.FloatBetween(0.34, 0.66) * flashScale,
                scaleEnd: 0,
                alphaStart: 1,
                alphaEnd: 0,
                tint,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-10, 10),
            });
        }

        const sparkQty = Math.max(2, Math.round(7 * p.sparkMul * flashScale * this.fxQualityScale));
        for (let i = 0; i < sparkQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneSpark, p.coneSpark);
            const speed = Phaser.Math.FloatBetween(280, 560) * p.speedMul;
            const tint = Phaser.Utils.Array.GetRandom(p.paletteSpark);
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-18, 12),
                gravityY: Phaser.Math.FloatBetween(220, 420),
                life: Phaser.Math.Between(45, 125),
                scaleStart: Phaser.Math.FloatBetween(0.1, 0.24) * flashScale,
                scaleEnd: 0,
                alphaStart: 0.95,
                alphaEnd: 0,
                tint,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-14, 14),
            });
        }

        const emberQty = Math.max(1, Math.round(5 * p.emberMul * flashScale * this.fxQualityScale));
        for (let i = 0; i < emberQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneEmber, p.coneEmber);
            const speed = Phaser.Math.FloatBetween(110, 260) * p.speedMul;
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                gravityY: Phaser.Math.FloatBetween(120, 240),
                life: Phaser.Math.Between(55, 150),
                scaleStart: Phaser.Math.FloatBetween(0.14, 0.3) * flashScale,
                scaleEnd: 0,
                alphaStart: 0.8,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(p.paletteEmber),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-8, 8),
            });
        }

        if (Math.random() < p.smokeChance * this.fxQualityScale) {
            this.spawnFxSprite('smoke', fx - Math.cos(angle) * 2, fy - Math.sin(angle) * 2, {
                vx: Phaser.Math.FloatBetween(-16, 16),
                vy: Phaser.Math.FloatBetween(-28, -8),
                life: Phaser.Math.Between(140, 260),
                scaleStart: Phaser.Math.FloatBetween(0.1, 0.2) * flashScale,
                scaleEnd: Phaser.Math.FloatBetween(0.28, 0.45) * flashScale,
                alphaStart: 0.24,
                alphaEnd: 0,
                tint: weaponKey === 'pistol' ? 0xd8dff9 : 0xffdfcc,
            });
        }
    }

    showImpactEffect(x, y, color = 0xdddddd) {
        const sparkIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.ricochetSparkIntensity) || 1, 0.4, 2.2);
        const impactFxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const fxBoost = 2.05 * impactFxIntensity;
        const coreQty = Math.max(3, Math.round((5 + Phaser.Math.Between(0, 3)) * this.fxQualityScale * sparkIntensity * fxBoost));
        for (let i = 0; i < coreQty; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(40, 140) * sparkIntensity;
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                gravityY: 180,
                life: Phaser.Math.Between(30, 95),
                scaleStart: Phaser.Math.FloatBetween(0.14, 0.3),
                scaleEnd: 0,
                alphaStart: 0.9,
                alphaEnd: 0,
                tint: color,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-10, 10),
            });
        }

        const sparkQty = Math.max(12, Math.round((18 + Phaser.Math.Between(0, 12)) * this.fxQualityScale * sparkIntensity * fxBoost));
        for (let i = 0; i < sparkQty; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(200, 560) * sparkIntensity;
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-20, 10),
                gravityY: Phaser.Math.FloatBetween(250, 460),
                life: Phaser.Math.Between(46, 145),
                scaleStart: Phaser.Math.FloatBetween(0.08, 0.2),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.85, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffe8b8, 0xffd27a, 0xffc26b, color]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-16, 16),
            });
        }

        if (Math.random() < 0.92 * this.fxQualityScale) {
            const steamQty = Math.max(2, Math.round((4 + Phaser.Math.Between(0, 3)) * this.fxQualityScale * fxBoost));
            for (let i = 0; i < steamQty; i++) {
                this.spawnFxSprite('smoke', x + Phaser.Math.Between(-3, 3), y + Phaser.Math.Between(-3, 3), {
                    vx: Phaser.Math.FloatBetween(-12, 14),
                    vy: Phaser.Math.FloatBetween(-36, -10),
                    life: Phaser.Math.Between(180, 360),
                    scaleStart: Phaser.Math.FloatBetween(0.08, 0.2),
                    scaleEnd: Phaser.Math.FloatBetween(0.42, 0.72),
                    alphaStart: Phaser.Math.FloatBetween(0.14, 0.24),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xe9edf5, 0xd8dfeb, 0xc9d3df]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.6, 0.6),
                });
            }
        }
        if (Math.random() < this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(96, 190),
                rangeMin: 34 * sparkIntensity,
                rangeBoost: 84 * sparkIntensity,
            });
        }
        if (Math.random() < 0.52 * this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(60, 130),
                rangeMin: 24 * sparkIntensity,
                rangeBoost: 66 * sparkIntensity,
            });
        }
        if (Math.random() < 0.22 && this.time.now >= (this.nextImpactShakeAt || 0)) {
            const shakeMul = this.getCameraShakeMul();
            if (shakeMul > 0) this.cameras.main.shake(45, (0.0018 + sparkIntensity * 0.0006) * shakeMul, true);
            this.nextImpactShakeAt = this.time.now + 120;
        }
    }

    showAlienAcidSplash(x, y, options = {}) {
        const acidPalette = [0x79ff76, 0x9aff90, 0xc5ff80, 0x7de6a5];
        const fxBoost = 1.5;
        const sprayQty = Math.max(10, Math.round((16 + Phaser.Math.Between(0, 8)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < sprayQty; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(80, 240);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(0, 26),
                gravityY: Phaser.Math.FloatBetween(110, 220),
                life: Phaser.Math.Between(85, 210),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.32),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.84, 0.98),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(acidPalette),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-8, 8),
            });
        }

        const glowQty = Math.max(4, Math.round((6 + Phaser.Math.Between(0, 4)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < glowQty; i++) {
            this.spawnFxSprite('dot', x + Phaser.Math.Between(-5, 5), y + Phaser.Math.Between(-4, 3), {
                vx: Phaser.Math.FloatBetween(-14, 14),
                vy: Phaser.Math.FloatBetween(-18, 8),
                gravityY: 0,
                life: Phaser.Math.Between(200, 380),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.3),
                scaleEnd: Phaser.Math.FloatBetween(0.02, 0.06),
                alphaStart: Phaser.Math.FloatBetween(0.5, 0.78),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xb7ff9f, 0xd5ffbc, 0x9dffcf]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-3, 3),
            });
        }

        const steamQty = Math.max(8, Math.round((13 + Phaser.Math.Between(0, 6)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < steamQty; i++) {
            this.spawnFxSprite('smoke', x + Phaser.Math.Between(-7, 7), y + Phaser.Math.Between(-3, 5), {
                vx: Phaser.Math.FloatBetween(-20, 22),
                vy: Phaser.Math.FloatBetween(-62, -20),
                life: Phaser.Math.Between(280, 700),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.28),
                scaleEnd: Phaser.Math.FloatBetween(0.7, 1.15),
                alphaStart: Phaser.Math.FloatBetween(0.16, 0.32),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd8ffe0, 0xbcecc6, 0x9ec9a8]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.9, 0.9),
            });
        }
        if (Math.random() < this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(130, 220),
                rangeMin: 28,
                rangeBoost: 78,
            });
        }
        const allowPool = options.spawnPool !== false;
        const poolChance = Phaser.Math.Clamp(Number(this.runtimeSettings?.objects?.acidPoolChanceOnSplash) || 0.42, 0, 1);
        if (allowPool && Math.random() < poolChance) {
            this.spawnAcidHazard(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), {
                radius: Phaser.Math.Between(16, 28),
                duration: Phaser.Math.Between(2200, 4600),
                damageScale: Phaser.Math.FloatBetween(0.55, 1.0),
            });
        }
    }

    showAlienDeathBurst(x, y) {
        const fxMul = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const count = Math.max(16, Math.round((28 + Phaser.Math.Between(0, 12)) * this.fxQualityScale * fxMul));
        for (let i = 0; i < count; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(120, 420) * fxMul;
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(0, 42),
                gravityY: Phaser.Math.FloatBetween(160, 320),
                life: Phaser.Math.Between(120, 300),
                scaleStart: Phaser.Math.FloatBetween(0.1, 0.28),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.76, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd7ffd1, 0x9aff90, 0x7de6a5, 0xc5ff80]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-12, 12),
            });
        }
        const smoke = Math.max(8, Math.round((12 + Phaser.Math.Between(0, 6)) * this.fxQualityScale * fxMul));
        for (let i = 0; i < smoke; i++) {
            this.spawnFxSprite('smoke', x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8), {
                vx: Phaser.Math.FloatBetween(-44, 44),
                vy: Phaser.Math.FloatBetween(-84, -24),
                life: Phaser.Math.Between(380, 920),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.28),
                scaleEnd: Phaser.Math.FloatBetween(0.82, 1.35),
                alphaStart: Phaser.Math.FloatBetween(0.22, 0.4),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd8ffe0, 0xbcecc6, 0x9ec9a8]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-1.2, 1.2),
            });
        }
        this.addSparkLight(x, y, this.time.now, {
            duration: Phaser.Math.Between(150, 260),
            rangeMin: 38 * fxMul,
            rangeBoost: 124 * fxMul,
        });
        if (Math.random() < 0.5) {
            this.addSparkLight(x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4), this.time.now, {
                duration: Phaser.Math.Between(90, 160),
                rangeMin: 24 * fxMul,
                rangeBoost: 82 * fxMul,
            });
        }
        if (this.time.now >= (this.nextImpactShakeAt || 0)) {
            const shakeMul = this.getCameraShakeMul();
            if (shakeMul > 0) this.cameras.main.shake(80, (0.0026 + fxMul * 0.0009) * shakeMul, true);
            this.nextImpactShakeAt = this.time.now + 140;
        }
    }

    spawnAcidHazard(x, y, options = {}) {
        if (!this.acidHazards) this.acidHazards = [];
        const maxActive = Math.max(0, Math.floor(Number(this.runtimeSettings?.objects?.acidHazardMaxActive) || 16));
        if (maxActive <= 0) return null;
        if (this.acidHazards.length >= maxActive) {
            const oldest = this.acidHazards.shift();
            if (oldest?.ring) oldest.ring.destroy();
        }
        const ring = this.add.circle(x, y, Number(options.radius) || 20, 0x9aff90, 0.16);
        ring.setStrokeStyle(2, 0x7de6a5, 0.8);
        ring.setDepth(10);
        const now = this.time.now;
        const duration = Math.max(400, Number(options.duration) || 2600);
        this.acidHazards.push({
            x,
            y,
            radius: Math.max(8, Number(options.radius) || 20),
            bornAt: now,
            expireAt: now + duration,
            nextTickAt: now + 240,
            damageScale: Phaser.Math.Clamp(Number(options.damageScale) || 1, 0.2, 2),
            ring,
        });
    }

    updateAcidHazards(time, _delta, marines) {
        if (!this.acidHazards || this.acidHazards.length === 0) return;
        const dps = Math.max(0, Number(this.runtimeSettings?.objects?.acidDamagePerSec) || 10);
        for (let i = this.acidHazards.length - 1; i >= 0; i--) {
            const h = this.acidHazards[i];
            if (!h || time >= h.expireAt) {
                if (h?.ring) h.ring.destroy();
                this.acidHazards.splice(i, 1);
                continue;
            }
            const lifeT = Phaser.Math.Clamp((time - h.bornAt) / Math.max(1, (h.expireAt - h.bornAt)), 0, 1);
            if (h.ring) {
                h.ring.setAlpha(Phaser.Math.Linear(0.24, 0.04, lifeT));
                h.ring.setScale(Phaser.Math.Linear(1, 1.18, lifeT));
            }
            if (time < h.nextTickAt || dps <= 0) continue;
            const list = Array.isArray(marines) && marines.length > 0 ? marines : [this.leader];
            for (const marine of list) {
                if (!marine || marine.active === false || marine.alive === false) continue;
                const dist = Phaser.Math.Distance.Between(h.x, h.y, marine.x, marine.y);
                if (dist > h.radius) continue;
                const dmg = Math.max(1, Math.round((dps * 0.24) * h.damageScale));
                if (typeof marine.takeDamage === 'function') marine.takeDamage(dmg);
                if (typeof this.onMarineDamaged === 'function') this.onMarineDamaged(marine, dmg, time);
                if (Math.random() < 0.24 * this.fxQualityScale) {
                    this.showAlienAcidSplash(
                        marine.x + Phaser.Math.Between(-6, 6),
                        marine.y + Phaser.Math.Between(-6, 6),
                        { spawnPool: false }
                    );
                }
            }
            h.nextTickAt = time + Phaser.Math.Between(220, 320);
        }
    }

    getFollowerCombatProfile(roleKey) {
        const marine = this.runtimeSettings?.marines || {};
        if (roleKey === 'heavy') {
            return {
                reactionMs: Number(marine.heavyReactionMs) || 260,
                baseSpread: 0.038 / (Number(marine.heavyAccuracyMul) || 1.1),
                fireRateMul: 0.86,
                damageMul: 1.25,
                heatPerShot: 10,
                coolRate: 26,
                jamSensitivity: Number(marine.heavyJamSensitivity) || 0.7,
            };
        }
        if (roleKey === 'tech') {
            return {
                reactionMs: Number(marine.techReactionMs) || 420,
                baseSpread: 0.085 / (Number(marine.techAccuracyMul) || 1),
                fireRateMul: 1.0,
                damageMul: 1.0,
                heatPerShot: 9,
                coolRate: 25,
                jamSensitivity: Number(marine.techJamSensitivity) || 0.9,
            };
        }
        return {
            reactionMs: Number(marine.medicReactionMs) || 560,
            baseSpread: 0.13 / (Number(marine.medicAccuracyMul) || 0.85),
            fireRateMul: 1.12,
            damageMul: 0.9,
            heatPerShot: 8,
            coolRate: 24,
            jamSensitivity: Number(marine.medicJamSensitivity) || 1.1,
        };
    }

    getFollowerCombatState(roleKey) {
        let state = this.followerCombatState.get(roleKey);
        if (state) return state;
        const anchor = MARINE_SWEEP_ANCHORS[roleKey] ?? 0;
        state = {
            nextFireAt: 0,
            jamUntil: 0,
            heat: 0,
            targetRef: null,
            lastKnownX: null,
            lastKnownY: null,
            lastKnownAt: -10000,
            readyAt: 0,
            nextThinkAt: 0,
            moraleRecoverMs: Phaser.Math.Between(
                Number(this.runtimeSettings?.marines?.moraleRecoverMinMs) || 30000,
                Number(this.runtimeSettings?.marines?.moraleRecoverMaxMs) || 60000
            ),
            lastMoraleShockAt: -10000,
            lastSelfShockAt: -10000,
            lastThreatPulseAt: -10000,
            sweepAnchor: anchor,
            sweepPhase: Math.random() * Math.PI * 2,
            assistNoticedAt: 0,
        };
        this.followerCombatState.set(roleKey, state);
        return state;
    }

    updateFollowerCombat(time, delta, marines) {
        if (!marines || marines.length === 0 || !this.enemyManager) return;
        const dtSec = Math.max(0.001, delta / 1000);
        const thinkIntervalMs = Number(this.runtimeSettings?.scripting?.aiThinkIntervalMs) || 120;
        const marineTuning = this.runtimeSettings?.marines || {};
        const calmPerSec = Phaser.Math.Clamp(Number(marineTuning.panicCalmPerSec) || 7, 0.5, 40);
        const lowHealthPerSec = Phaser.Math.Clamp(Number(marineTuning.panicLowHealthPerSec) || 9, 0, 40);
        const swarmPerSec = Phaser.Math.Clamp(Number(marineTuning.panicSwarmPerSec) || 6, 0, 40);
        const selfHitLoss = Phaser.Math.Clamp(Number(marineTuning.panicSelfHitLoss) || 10, 0, 60);
        const allyHitLoss = Phaser.Math.Clamp(Number(marineTuning.panicAllyHitLoss) || 3, 0, 30);
        const suppressWindowMs = Phaser.Math.Clamp(Number(marineTuning.supportSuppressWindowMs) || 900, 200, 3000);
        const combatMods = this.combatMods || {
            marineAccuracyMul: 1,
            marineJamMul: 1,
            marineReactionMul: 1,
            pressure: 0.3,
        };
        if (this.totalKills > this.lastMoraleKillCount) {
            const gainPerKill = Number(this.runtimeSettings?.marines?.panicKillGain ?? this.runtimeSettings?.marines?.moraleKillGain);
            const gain = (this.totalKills - this.lastMoraleKillCount) * (Number.isFinite(gainPerKill) ? gainPerKill : 5);
            for (const marine of marines) {
                if (!marine.roleKey || marine.alive === false || marine.active === false) continue;
                marine.morale = Phaser.Math.Clamp((marine.morale || 0) + gain, -100, 100);
            }
            this.lastMoraleKillCount = this.totalKills;
        }

        const enemies = this.enemyManager.getDetectedEnemies() || [];
        const lighting = this.runtimeSettings?.lighting || {};
        const halfAngle = lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE;
        const range = lighting.torchRange ?? CONFIG.TORCH_RANGE;
        const canSee = (marine, enemy) => {
            if (!enemy || !enemy.active) return false;
            const source = {
                x: marine.x,
                y: marine.y,
                angle: marine.rotation || 0,
                halfAngle,
                range,
            };
            if (!this.enemyManager.isInLightCone(source, enemy)) return false;
            return this.enemyManager.hasLineOfSight(source.x, source.y, enemy.x, enemy.y, source.range);
        };
        const now = time;
        const sharedContact = this.sharedMarineContact
            && (now - this.sharedMarineContact.at <= 3000)
            ? this.sharedMarineContact
            : null;
        if (!sharedContact) this.sharedMarineContact = null;

        let teammateRecentlyAttacked = false;
        let threatenedAlly = null;
        let threatenedAt = -100000;
        for (const m of marines) {
            if (!Number.isFinite(m.lastDamagedAt)) continue;
            if ((time - m.lastDamagedAt) <= 1400) {
                teammateRecentlyAttacked = true;
            }
            if ((time - m.lastDamagedAt) <= 1800 && m.lastDamagedAt > threatenedAt) {
                threatenedAt = m.lastDamagedAt;
                threatenedAlly = m;
            }
        }

        for (const follower of marines) {
            if (!follower.roleKey || follower.alive === false || follower.active === false) continue;
            if (this.isMarineTrackerBusy(follower, time)) continue;
            if (this.isMarineHealBusy(follower, time)) continue;
            const state = this.getFollowerCombatState(follower.roleKey);
            const profile = this.getFollowerCombatProfile(follower.roleKey);
            const selfRecentlyAttacked = Number.isFinite(follower.lastDamagedAt) && (time - follower.lastDamagedAt <= 1500);
            const maxHp = Math.max(1, Number(follower.maxHealth) || 100);
            const hpPct = Phaser.Math.Clamp((Number(follower.health) || 0) / maxHp, 0, 1);

            let morale = Phaser.Math.Clamp(follower.morale || 0, -100, 100);
            if (morale > 0) morale = Math.max(0, morale - calmPerSec * dtSec);
            else if (morale < 0) morale = Math.min(0, morale + calmPerSec * dtSec);

            if (selfRecentlyAttacked && (time - state.lastSelfShockAt) > 700) {
                morale -= selfHitLoss;
                state.lastSelfShockAt = time;
            }
            if (teammateRecentlyAttacked && (time - state.lastMoraleShockAt) > 1100) {
                morale -= allyHitLoss;
                state.lastMoraleShockAt = time;
            }
            if ((time - state.lastThreatPulseAt) > 260) {
                let fearPulse = 0;
                if (hpPct < 0.55) {
                    const lowHpNorm = Phaser.Math.Clamp((0.55 - hpPct) / 0.55, 0, 1);
                    fearPulse += lowHealthPerSec * lowHpNorm * 0.26;
                }
                const swarmNorm = Phaser.Math.Clamp((enemies.length - 2) / 7, 0, 1);
                fearPulse += swarmPerSec * swarmNorm * 0.26;
                if (fearPulse > 0) morale -= fearPulse;
                state.lastThreatPulseAt = time;
            }
            follower.morale = Phaser.Math.Clamp(morale, -100, 100);
            const moralePenalty = Phaser.Math.Clamp((-follower.morale) / 100, 0, 1);
            const moraleBoost = Phaser.Math.Clamp((follower.morale) / 100, 0, 1);
            state.heat = Math.max(0, state.heat - profile.coolRate * dtSec);

            let best = state.targetRef && state.targetRef.active ? state.targetRef : null;
            let bestDist = best ? Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y) : Infinity;

            if (time >= state.nextThinkAt) {
                state.nextThinkAt = time + thinkIntervalMs;
                best = null;
                bestDist = Infinity;
                let closeThreat = null;
                let closeThreatDist = Infinity;
                const closeSupportDist = CONFIG.TILE_SIZE * 1.9;
                for (const enemy of enemies) {
                    if (!canSee(follower, enemy)) continue;
                    const d = Phaser.Math.Distance.Between(follower.x, follower.y, enemy.x, enemy.y);
                    if (d <= closeSupportDist && d < closeThreatDist) {
                        closeThreat = enemy;
                        closeThreatDist = d;
                    }
                    if (d < bestDist) {
                        bestDist = d;
                        best = enemy;
                    }
                }
                if (closeThreat) {
                    best = closeThreat;
                    bestDist = closeThreatDist;
                }

                if (!best && selfRecentlyAttacked) {
                    const shared = this.enemyManager.getPriorityThreat(follower.x, follower.y, true);
                    if (shared && canSee(follower, shared)) {
                        best = shared;
                        bestDist = Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y);
                    }
                }

                if (!best && teammateRecentlyAttacked) {
                    const shared = this.enemyManager.getPriorityThreat(follower.x, follower.y, true);
                    if (shared && canSee(follower, shared)) {
                        best = shared;
                        bestDist = Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y);
                    }
                }

                if (!best && threatenedAlly && threatenedAlly !== follower) {
                    let bestThreat = null;
                    let bestThreatDist = Infinity;
                    for (const enemy of enemies) {
                        if (!enemy || !enemy.active) continue;
                        if (!canSee(follower, enemy)) continue;
                        const dAlly = Phaser.Math.Distance.Between(enemy.x, enemy.y, threatenedAlly.x, threatenedAlly.y);
                        if (dAlly < bestThreatDist) {
                            bestThreatDist = dAlly;
                            bestThreat = enemy;
                        }
                    }
                    const supportDist = CONFIG.TILE_SIZE * 2.35;
                    if (bestThreat && bestThreatDist <= supportDist) {
                        best = bestThreat;
                        bestDist = Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y);
                    }
                }

                // Marine-to-marine support: idle marines assist after ~1 second.
                if (!best && sharedContact && !selfRecentlyAttacked) {
                    if (!state.assistNoticedAt) state.assistNoticedAt = now;
                    let assistDelayMs = 1000;
                    if (follower.roleKey === 'heavy') assistDelayMs -= 140;
                    else if (follower.roleKey === 'tech') assistDelayMs -= 80;
                    else if (follower.roleKey === 'medic') assistDelayMs += 60;
                    assistDelayMs = Math.floor(assistDelayMs * Phaser.Math.Linear(1.08, 0.78, combatMods.pressure));
                    assistDelayMs = Phaser.Math.Clamp(assistDelayMs, 620, 1300);
                    if ((now - state.assistNoticedAt) >= assistDelayMs) {
                        const assistEnemy = sharedContact.enemy;
                        if (assistEnemy && assistEnemy.active && canSee(follower, assistEnemy)) {
                            best = assistEnemy;
                            bestDist = Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y);
                        }
                    }
                } else {
                    state.assistNoticedAt = 0;
                }
                state.targetRef = best;
            } else if (best && !canSee(follower, best)) {
                state.lastKnownX = best.x;
                state.lastKnownY = best.y;
                state.lastKnownAt = time;
                best = null;
                bestDist = Infinity;
                state.targetRef = null;
            }

            if (!best) {
                const hasLastKnown = Number.isFinite(state.lastKnownAt) && (time - state.lastKnownAt) <= suppressWindowMs;
                if (hasLastKnown && Number.isFinite(state.lastKnownX) && Number.isFinite(state.lastKnownY)) {
                    const aimLast = Phaser.Math.Angle.Between(follower.x, follower.y, state.lastKnownX, state.lastKnownY);
                    const dLast = Phaser.Math.Distance.Between(follower.x, follower.y, state.lastKnownX, state.lastKnownY);
                    if (dLast <= range * 0.96) {
                        follower.setDesiredRotation(aimLast);
                        follower.updateRotation(delta, time, { patrol: false });
                        if (time >= state.readyAt && time >= state.nextFireAt && time >= state.jamUntil && Math.random() < 0.46) {
                            const def = this.weaponManager.getRuntimeWeaponDef('pulseRifle');
                            if (def) {
                                const suppressSpread = profile.baseSpread * 2.2;
                                const shotAngle = aimLast + Phaser.Math.FloatBetween(-suppressSpread, suppressSpread);
                                const shotDef = {
                                    ...def,
                                    ownerRoleKey: follower.roleKey || 'follower',
                                    fireRate: Math.max(90, Math.floor(def.fireRate * 1.22)),
                                    damage: Math.max(1, def.damage * profile.damageMul * 0.74),
                                };
                                const fired = this.bulletPool.fire(follower.x, follower.y, shotAngle, time, shotDef);
                                if (fired) {
                                    this.noteGunfireEvent(time);
                                    this.markCombatAction(time);
                                    this.tryGunfireReinforcement(time, follower.x, follower.y, marines);
                                    this.emitWeaponFlashAndStimulus(follower.x, follower.y, shotAngle, time, 'pulseRifle', {
                                        stimulusMul: 0.72,
                                    });
                                    state.nextFireAt = time + shotDef.fireRate;
                                    state.heat = Math.min(160, state.heat + Math.max(3, profile.heatPerShot * 0.66));
                                }
                            }
                        }
                        continue;
                    }
                }
                state.targetRef = null;
                // Sector sweep when no current target.
                const sweepSpeed = 0.0024;
                const sweepAmp = 0.34;
                const sweepAngle = state.sweepAnchor + Math.sin(now * sweepSpeed + state.sweepPhase) * sweepAmp;
                follower.setDesiredRotation(sweepAngle);
                follower.updateRotation(delta, time, { patrol: false });
                continue;
            }

            const aim = Phaser.Math.Angle.Between(follower.x, follower.y, best.x, best.y);
            follower.setDesiredRotation(aim);
            follower.updateRotation(delta, time, { patrol: false });
            this.sharedMarineContact = { enemy: best, at: now, byRole: follower.roleKey || 'unknown' };
            state.lastKnownX = best.x;
            state.lastKnownY = best.y;
            state.lastKnownAt = now;

            const canShoot = bestDist < Infinity;
            if (!canShoot) continue;
            if (state.targetRef !== best) {
                state.targetRef = best;
                // Callouts fire only when a marine freshly spots a hostile in beam/LOS.
                this.tryMarineSpotCallout(follower, time);
                const reactionMul = Phaser.Math.Clamp(1 + moralePenalty * 0.8 - moraleBoost * 0.22, 0.58, 2.2);
                state.readyAt = time + profile.reactionMs * reactionMul * combatMods.marineReactionMul;
            }
            if (time < state.readyAt) continue;
            if (time < state.nextFireAt) continue;
            if (time < state.jamUntil) continue;

            const def = this.weaponManager.getRuntimeWeaponDef('pulseRifle');
            if (!def) continue;
            const spread = profile.baseSpread
                * Phaser.Math.Clamp(1 + moralePenalty * 1.1 - moraleBoost * 0.35 + Phaser.Math.Clamp(state.heat / 130, 0, 1), 0.35, 2.8)
                * (1 / Math.max(0.65, combatMods.marineAccuracyMul));
            const shotAngle = aim + Phaser.Math.FloatBetween(-spread, spread);
            const shotDef = {
                ...def,
                ownerRoleKey: follower.roleKey || 'follower',
                fireRate: Math.max(
                    70,
                    Math.floor(
                        def.fireRate
                        * profile.fireRateMul
                        * Phaser.Math.Clamp(1 + moralePenalty * 0.35 - moraleBoost * 0.18 + combatMods.pressure * 0.08, 0.62, 2.4)
                    )
                ),
                damage: Math.max(1, def.damage * profile.damageMul),
            };
            const fired = this.bulletPool.fire(follower.x, follower.y, shotAngle, time, shotDef);
            if (!fired) continue;
            this.noteGunfireEvent(time);
            this.markCombatAction(time);
            this.tryGunfireReinforcement(time, follower.x, follower.y, marines);

            this.emitWeaponFlashAndStimulus(follower.x, follower.y, shotAngle, time, 'pulseRifle', {
                stimulusMul: 0.95,
            });
            state.nextFireAt = time + shotDef.fireRate;
            state.heat = Math.min(160, state.heat + profile.heatPerShot);
            const jamChance = Phaser.Math.Clamp(
                (
                    Math.max(0, (state.heat - 82) / 140) * profile.jamSensitivity
                    + moralePenalty * 0.12
                    - moraleBoost * 0.06
                ) * combatMods.marineJamMul,
                0,
                0.45
            );
            if (Math.random() < jamChance) {
                state.jamUntil = time + Phaser.Math.Between(900, 1700);
            }
        }
    }

    pickTrackerOperator(preferredRoleKey = null) {
        const squad = this.squadSystem;
        const tryRole = (roleKey) => {
            if (!squad || !roleKey) return null;
            const m = squad.getFollowerByRole(roleKey);
            if (!m || squad.isRoleTaskActive(roleKey)) return null;
            return { actor: m, roleKey };
        };
        if (preferredRoleKey) {
            if (preferredRoleKey === 'leader') return { actor: this.leader, roleKey: null };
            const preferred = tryRole(preferredRoleKey);
            if (preferred) return preferred;
            return null;
        }
        if (squad) {
            const tech = tryRole('tech');
            if (tech) return tech;
            const medic = tryRole('medic');
            if (medic) return medic;
            const heavy = tryRole('heavy');
            if (heavy) return heavy;
        }
        return { actor: this.leader, roleKey: null };
    }

    isMarineTrackerBusy(marine, time = this.time.now) {
        if (!marine || !this.trackerOperator || !this.isMotionTrackerRiskLocked(time)) return false;
        if (marine === this.trackerOperator.actor) return true;
        if (marine.roleKey && this.trackerOperator.roleKey && marine.roleKey === this.trackerOperator.roleKey) return true;
        return false;
    }

    isTrackerLeaderBusy(time = this.time.now) {
        return this.isMarineTrackerBusy(this.leader, time);
    }

    updateTrackerOperatorLock(time, trackerRiskLocked) {
        const op = this.trackerOperator;
        const opRole = op && op.roleKey;
        if (!op) return;
        if (!trackerRiskLocked) {
            if (opRole && this.squadSystem) this.squadSystem.setExternalHoldRole(opRole, false);
            this.trackerOperator = null;
            this.trackerStartedAt = 0;
            return;
        }
        if (opRole && this.squadSystem) this.squadSystem.setExternalHoldRole(opRole, true);
        if (this.isTrackerLeaderBusy(time)) {
            this.inputHandler.isFiring = false;
            this.contextMenu.hide();
            this.movementSystem.clearPath(this.leader);
            this.leader.body.setVelocity(0, 0);
        }
    }

    wasTrackerOperatorAttacked() {
        const op = this.trackerOperator;
        if (!op || !op.actor || !this.isMotionTrackerRiskLocked(this.time.now)) return false;
        const actor = op.actor;
        const currentHp = Number(actor.health) || 0;
        const currentDamagedAt = Number.isFinite(actor.lastDamagedAt) ? actor.lastDamagedAt : -1;
        const hit = currentHp < op.previousHealth || currentDamagedAt > op.previousDamagedAt;
        op.previousHealth = currentHp;
        op.previousDamagedAt = currentDamagedAt;
        return hit;
    }

    isMotionTrackerActive(time) {
        return time >= this.trackerChannelUntil && time < this.trackerScanUntil;
    }

    getCombatPressure() {
        return Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0.3, 0, 1);
    }

    getDirectorState() {
        return this.combatMods?.state || 'manual';
    }

    getAdaptiveIdleIntervalMs() {
        const pressure = this.getCombatPressure();
        const state = this.getDirectorState();
        const minFloor = Math.max(1000, Math.floor(this.idlePressureIntervalMs * 0.45));
        const pressureScale = Phaser.Math.Linear(1.22, 0.72, pressure);
        const stateMul = state === 'release' ? 1.2 : (state === 'peak' ? 0.82 : 1);
        return Math.max(minFloor, Math.floor(this.idlePressureIntervalMs * pressureScale * stateMul));
    }

    getDynamicAliveSoftCap(marines = null) {
        const difficulty = this.activeMission?.difficulty || 'normal';
        let base = difficulty === 'extreme' ? 30 : (difficulty === 'hard' ? 24 : 18);
        const pressure = this.getCombatPressure();
        const wave = Math.max(1, Number(this.stageFlow?.currentWave) || 1);
        base += Math.round((wave - 1) * 1.5);
        base += Math.round(pressure * 8);
        const missionId = this.activeMission?.id || 'm1';
        if (missionId === 'm5') base += 4;
        else if (missionId === 'm4') base += 2;
        else if (missionId === 'm1') base -= 2;
        if (this.shouldApplySurvivalRelief(marines || this.squadSystem.getAllMarines())) base -= 4;
        return Phaser.Math.Clamp(base, 10, 48);
    }

    markCombatAction(time = this.time.now) {
        this.lastActionAt = time;
        this.nextIdlePressureAt = Math.max(this.nextIdlePressureAt, time + this.getAdaptiveIdleIntervalMs());
    }

    noteGunfireEvent(time = this.time.now) {
        this.gunfireEvents.push(time);
        this.pruneGunfireEvents(time);
    }

    pruneGunfireEvents(time = this.time.now) {
        const windowMs = Math.max(400, this.gunfireEventWindowMs || 2400);
        this.gunfireEvents = (this.gunfireEvents || []).filter((t) => (time - t) <= windowMs);
    }

    updateCombatBurstState(time = this.time.now) {
        this.pruneGunfireEvents(time);
        const active = this.isGunfireBurstActive(time);
        if (active) return;
        if (time < this.nextBurstEligibleAt) return;
        if ((this.gunfireEvents || []).length < this.gunfireBurstThreshold) return;
        this.gunfireBurstUntil = time + this.gunfireBurstDurationMs;
        this.nextBurstEligibleAt = this.gunfireBurstUntil + this.gunfireBurstCooldownMs;
        this.showFloatingText(this.leader.x, this.leader.y - 40, 'SWARM RESPONSE INTENSIFYING', '#ffb3b3');
    }

    isGunfireBurstActive(time = this.time.now) {
        return time < (this.gunfireBurstUntil || 0);
    }

    tryGunfireReinforcement(time, sourceX, sourceY, marines) {
        if (!this.enemyManager || !this.doorManager || this.stageFlow.isEnded()) return;
        if (time < this.nextGunfireReinforceAt) return;
        if (time < (this.nextReinforcementSpawnAt || 0)) return;
        if (time < this.pressureGraceUntil) return;
        if (this.stageFlow.state === 'intermission') return;
        const aliveNow = this.enemyManager.getAliveCount();
        const softCap = this.getDynamicAliveSoftCap(marines);
        if (aliveNow >= softCap) {
            this.nextGunfireReinforceAt = time + Phaser.Math.Between(900, 1500);
            return;
        }
        if (this.shouldApplySurvivalRelief(marines)) {
            this.nextGunfireReinforceAt = time + Math.max(900, Math.floor(this.gunfireReinforceCooldownMs * 1.5));
            return;
        }
        const spawned = this.spawnGunfireDoorPack(time, sourceX, sourceY, marines);
        const burstMul = this.isGunfireBurstActive(time) ? this.gunfireBurstCooldownMul : 1;
        const pressure = this.getCombatPressure();
        const state = this.getDirectorState();
        const pressureMul = Phaser.Math.Linear(1.2, 0.68, pressure);
        const stateMul = state === 'release' ? 1.15 : (state === 'peak' ? 0.82 : 1);
        const effectiveCd = Math.max(380, Math.floor(this.gunfireReinforceCooldownMs * burstMul * pressureMul * stateMul));
        this.nextGunfireReinforceAt = spawned > 0
            ? (time + effectiveCd)
            : (time + Math.min(1200, Math.max(450, Math.floor(effectiveCd * 0.35))));
        if (spawned > 0) {
            this.noteReinforcementSpawn(time, 'gunfire', spawned);
            this.showFloatingText(this.leader.x, this.leader.y - 34, 'ALIENS STIRRING BEHIND DOORS', '#99bbff');
        }
    }

    spawnGunfireDoorPack(time, _sourceX, _sourceY, marines) {
        const slots = this.getAvailableReinforcementSlots('gunfire');
        if (slots <= 0) return 0;
        const aliveNow = this.enemyManager?.getAliveCount?.() || 0;
        const softCap = this.getDynamicAliveSoftCap(marines);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) return 0;
        const basePack = this.activeMission?.difficulty === 'extreme' ? 5 : (this.activeMission?.difficulty === 'hard' ? 4 : 3);
        const pressure = this.getCombatPressure();
        const state = this.getDirectorState();
        const pressureBonus = pressure > 0.78 ? 2 : (pressure > 0.56 ? 1 : 0);
        const stateBonus = state === 'release' ? -1 : 0;
        const desiredPack = basePack
            + pressureBonus
            + stateBonus
            + (this.isGunfireBurstActive(time) ? this.gunfireBurstBonusPack : 0);
        const packSize = Math.min(desiredPack, slots, capRoom);
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : [this.leader];
        const view = this.cameras.main ? this.cameras.main.worldView : null;
        this.pruneDoorNoiseHistory(time);
        const candidates = [];
        for (const group of this.doorManager.doorGroups || []) {
            if (!group || group.state === 'open') continue;
            const center = this.getDoorGroupCenter(group);
            const nearestDist = marList.reduce((best, m) => {
                const d = Phaser.Math.Distance.Between(m.x, m.y, center.x, center.y);
                return Math.min(best, d);
            }, Infinity);
            if (nearestDist < CONFIG.TILE_SIZE * 5) continue;
            if (view && Phaser.Geom.Rectangle.Contains(view, center.x, center.y)) continue;
            const dir = this.getDirectionBucket(center.x, center.y);
            const repeatPenalty = this.getDoorRepeatPenalty(group.id, time);
            const score = nearestDist - this.getDoorNoisePenalty(dir, time) - repeatPenalty + Phaser.Math.Between(0, 120);
            candidates.push({ group, center, nearestDist, dir, score, repeatPenalty });
        }
        if (candidates.length === 0) return 0;
        candidates.sort((a, b) => b.score - a.score);
        const selected = [];
        const usedDirs = new Set();
        for (const c of candidates) {
            if (selected.length >= packSize) break;
            if (usedDirs.has(c.dir)) continue;
            selected.push(c);
            usedDirs.add(c.dir);
        }
        if (selected.length < packSize) {
            for (const c of candidates) {
                if (selected.length >= packSize) break;
                if (selected.includes(c)) continue;
                selected.push(c);
            }
        }
        let spawned = 0;
        for (let i = 0; i < selected.length; i++) {
            const c = selected[i];
            const spawnWorld = this.pickSpawnBehindDoor(c.group, c.center, marList);
            if (!spawnWorld) continue;
            const type = this.pickIdlePressureType(i + 1);
            const enemy = this.enemyManager.spawnEnemyAtWorld(type, spawnWorld.x, spawnWorld.y, this.stageFlow.currentWave || 1);
            if (!enemy) continue;
            enemy.dynamicReinforcement = true;
            enemy.reinforcementSource = 'gunfire';
            enemy.alertUntil = Math.max(enemy.alertUntil, time + 4200);
            enemy.investigatePoint = { x: c.center.x, y: c.center.y, power: 1.1 };
            enemy.investigateUntil = time + 3600;
            this.noteDoorNoiseDirection(c.dir, c.group.id, time);
            spawned++;
        }
        return spawned;
    }

    getDoorGroupCenter(doorGroup) {
        let sx = 0;
        let sy = 0;
        for (const d of doorGroup.doors) {
            sx += d.x;
            sy += d.y;
        }
        return {
            x: sx / doorGroup.doors.length,
            y: sy / doorGroup.doors.length,
        };
    }

    getMissionSpawnPressureScale(missionId = '') {
        if (missionId === 'm5') return 0.64;
        if (missionId === 'm4') return 0.72;
        if (missionId === 'm3') return 0.8;
        if (missionId === 'm2') return 0.88;
        return 0.95;
    }

    getMissionReinforcementCapScale(missionId = '') {
        if (missionId === 'm5') return 1.36;
        if (missionId === 'm4') return 1.24;
        if (missionId === 'm3') return 1.12;
        if (missionId === 'm2') return 1.0;
        return 0.9;
    }

    applyMissionReinforcementCaps(missionId = '') {
        const scale = this.getMissionReinforcementCapScale(missionId);
        this.reinforceCapEffective = Math.max(0, Math.round(this.reinforceCap * scale));
        this.reinforceCapIdleEffective = Math.max(0, Math.round(this.reinforceCapIdle * scale));
        this.reinforceCapGunfireEffective = Math.max(0, Math.round(this.reinforceCapGunfire * scale));
    }

    getDirectionBucket(worldX, worldY) {
        const dx = worldX - this.leader.x;
        const dy = worldY - this.leader.y;
        if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
        return dy >= 0 ? 'S' : 'N';
    }

    pruneDoorNoiseHistory(time = this.time.now) {
        const memory = Math.max(1000, this.doorNoiseMemoryMs || 16000);
        this.doorNoiseHistory = (this.doorNoiseHistory || []).filter((e) => (time - e.time) <= memory);
    }

    getDoorNoisePenalty(dir, time = this.time.now) {
        this.pruneDoorNoiseHistory(time);
        const memory = Math.max(1000, this.doorNoiseMemoryMs || 16000);
        let newest = null;
        for (const entry of this.doorNoiseHistory) {
            if (!entry || entry.dir !== dir) continue;
            if (!newest || entry.time > newest.time) newest = entry;
        }
        if (!newest) return 0;
        const age = Math.max(0, time - newest.time);
        const t = Phaser.Math.Clamp(age / memory, 0, 1);
        return Phaser.Math.Linear(2600, 0, t);
    }

    noteDoorNoiseDirection(dir, doorId = '', time = this.time.now) {
        if (!dir) return;
        if (!this.doorNoiseHistory) this.doorNoiseHistory = [];
        this.doorNoiseHistory.push({ dir, doorId, time });
        this.pruneDoorNoiseHistory(time);
    }

    getDoorRepeatPenalty(doorId = '', time = this.time.now) {
        if (!doorId) return 0;
        this.pruneDoorNoiseHistory(time);
        const memory = Math.max(1000, this.doorNoiseMemoryMs || 16000);
        let newest = null;
        for (const entry of this.doorNoiseHistory) {
            if (!entry || entry.doorId !== doorId) continue;
            if (!newest || entry.time > newest.time) newest = entry;
        }
        if (!newest) return 0;
        const age = Math.max(0, time - newest.time);
        const t = Phaser.Math.Clamp(age / memory, 0, 1);
        return Phaser.Math.Linear(3200, 0, t);
    }

    pruneIdleSpawnHistory(time = this.time.now) {
        const memory = Math.max(2000, this.idleSpawnMemoryMs || 9000);
        this.recentIdleSpawnPoints = (this.recentIdleSpawnPoints || []).filter((p) => (time - p.time) <= memory);
    }

    noteIdleSpawnPoint(world, time = this.time.now) {
        if (!world) return;
        if (!this.recentIdleSpawnPoints) this.recentIdleSpawnPoints = [];
        this.recentIdleSpawnPoints.push({ x: world.x, y: world.y, time });
        this.pruneIdleSpawnHistory(time);
    }

    getIdleSpawnRepeatPenalty(world, time = this.time.now) {
        if (!world) return 0;
        this.pruneIdleSpawnHistory(time);
        const memory = Math.max(2000, this.idleSpawnMemoryMs || 9000);
        let penalty = 0;
        for (const p of this.recentIdleSpawnPoints || []) {
            const dist = Phaser.Math.Distance.Between(world.x, world.y, p.x, p.y);
            if (dist > CONFIG.TILE_SIZE * 7) continue;
            const age = Math.max(0, time - p.time);
            const t = Phaser.Math.Clamp(age / memory, 0, 1);
            penalty += Phaser.Math.Linear(1100, 0, t);
        }
        return penalty;
    }

    countActiveReinforcements(source = null) {
        if (!this.enemyManager || !Array.isArray(this.enemyManager.enemies)) return 0;
        let n = 0;
        for (const e of this.enemyManager.enemies) {
            if (!e || !e.active) continue;
            if (e.dynamicReinforcement !== true) continue;
            if (source && e.reinforcementSource !== source) continue;
            n++;
        }
        return n;
    }

    getAvailableReinforcementSlots(source = null) {
        const totalCap = Number.isFinite(this.reinforceCapEffective) ? this.reinforceCapEffective : this.reinforceCap;
        if (!Number.isFinite(totalCap) || totalCap <= 0) return 0;
        const totalSlots = Math.max(0, totalCap - this.countActiveReinforcements());
        if (source === 'idle') {
            const sourceCap = Number.isFinite(this.reinforceCapIdleEffective) ? this.reinforceCapIdleEffective : this.reinforceCapIdle;
            return Math.max(0, Math.min(totalSlots, sourceCap - this.countActiveReinforcements('idle')));
        }
        if (source === 'gunfire') {
            const sourceCap = Number.isFinite(this.reinforceCapGunfireEffective) ? this.reinforceCapGunfireEffective : this.reinforceCapGunfire;
            return Math.max(0, Math.min(totalSlots, sourceCap - this.countActiveReinforcements('gunfire')));
        }
        return totalSlots;
    }

    noteReinforcementSpawn(time = this.time.now, source = 'idle', spawned = 1) {
        if (spawned <= 0) return;
        const pressure = this.getCombatPressure();
        const state = this.getDirectorState();
        const baseGap = source === 'gunfire' ? 620 : 900;
        const pressureMul = Phaser.Math.Linear(1.24, 0.72, pressure);
        const stateMul = state === 'peak' ? 0.8 : (state === 'release' ? 1.08 : 1);
        const burstMul = (source === 'gunfire' && this.isGunfireBurstActive(time)) ? 0.86 : 1;
        const sizeMul = Phaser.Math.Clamp(1 + (spawned - 1) * 0.12, 1, 1.6);
        const gap = Math.max(340, Math.floor(baseGap * pressureMul * stateMul * burstMul * sizeMul));
        this.nextReinforcementSpawnAt = Math.max(this.nextReinforcementSpawnAt || 0, time + gap);
    }

    pickSpawnBehindDoor(doorGroup, center, marines) {
        if (!doorGroup || !center || !this.pathGrid) return null;
        const vertical = doorGroup.doors.length < 2 || doorGroup.doors[0].tileX === doorGroup.doors[1].tileX;
        let nearest = marines[0] || this.leader;
        let nearestDist = Infinity;
        for (const m of marines) {
            const d = Phaser.Math.Distance.Between(m.x, m.y, center.x, center.y);
            if (d < nearestDist) {
                nearest = m;
                nearestDist = d;
            }
        }
        const marineSide = vertical
            ? (nearest.x < center.x ? -1 : 1)
            : (nearest.y < center.y ? -1 : 1);
        const spawnSide = -marineSide;
        const lateral = [-1, 0, 1];
        for (const step of [1.4, 1.9, 2.4]) {
            for (const lat of Phaser.Utils.Array.Shuffle([...lateral])) {
                let wx = center.x;
                let wy = center.y;
                if (vertical) {
                    wx += spawnSide * CONFIG.TILE_SIZE * step;
                    wy += lat * CONFIG.TILE_SIZE * 0.9;
                } else {
                    wy += spawnSide * CONFIG.TILE_SIZE * step;
                    wx += lat * CONFIG.TILE_SIZE * 0.9;
                }
                const t = this.pathGrid.worldToTile(wx, wy);
                if (!this.pathGrid.isWalkable(t.x, t.y)) continue;
                return this.pathGrid.tileToWorld(t.x, t.y);
            }
        }
        return null;
    }

    getClosestEnemyForTrackerCue(view, maxDist = 920) {
        if (!this.enemyManager || !Array.isArray(this.enemyManager.enemies)) return null;
        let best = null;
        for (const enemy of this.enemyManager.enemies) {
            if (!enemy || !enemy.active) continue;
            let dist = 0;
            if (view && Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y)) {
                dist = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, enemy.x, enemy.y) * 0.7;
            } else if (view) {
                const dx = Math.max(view.left - enemy.x, 0, enemy.x - view.right);
                const dy = Math.max(view.top - enemy.y, 0, enemy.y - view.bottom);
                dist = Math.sqrt(dx * dx + dy * dy);
            } else {
                dist = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, enemy.x, enemy.y);
            }
            if (dist > maxDist) continue;
            if (!best || dist < best.dist) best = { enemy, dist };
        }
        return best;
    }

    countCloseEnemiesToTeam(maxDist = 260, marines = null) {
        if (!this.enemyManager || !Array.isArray(this.enemyManager.enemies)) return 0;
        const team = Array.isArray(marines) && marines.length > 0
            ? marines
            : (this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader]);
        let count = 0;
        for (const enemy of this.enemyManager.enemies) {
            if (!enemy || !enemy.active) continue;
            let near = false;
            for (const m of team) {
                if (!m || m.active === false || m.alive === false) continue;
                if (Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y) <= maxDist) {
                    near = true;
                    break;
                }
            }
            if (near) count++;
        }
        return count;
    }

    reportDoorThump(worldX, worldY, time = this.time.now, breached = false) {
        if (time < this.nextDoorThumpCueAt) return;
        this.nextDoorThumpCueAt = time + 280;
        this.showEdgeWordCue(breached ? 'BREACH!!' : 'THUMP!!', worldX, worldY, breached ? '#ff7f7f' : '#ffb0a8');
    }

    showEdgeWordCue(word, worldX, worldY, color = '#ffffff') {
        const dx = worldX - this.leader.x;
        const dy = worldY - this.leader.y;
        let dir = 'N';
        let x = CONFIG.GAME_WIDTH / 2;
        let y = 30;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx >= 0) {
                dir = 'E';
                x = CONFIG.GAME_WIDTH - 72;
                y = CONFIG.GAME_HEIGHT / 2;
            } else {
                dir = 'W';
                x = 72;
                y = CONFIG.GAME_HEIGHT / 2;
            }
        } else if (dy >= 0) {
            dir = 'S';
            x = CONFIG.GAME_WIDTH / 2;
            y = CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT - 26;
        }
        const msg = this.add.text(x, y, `${word} ${dir}`, {
            fontSize: '24px',
            fontFamily: 'Impact, "Arial Black", sans-serif',
            fontStyle: 'bold',
            color,
            backgroundColor: '#111111',
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        });
        msg.setOrigin(0.5);
        msg.setStroke('#070707', 5);
        msg.setShadow(3, 3, '#000000', 0.85, false, true);
        msg.setRotation(Phaser.Math.FloatBetween(-0.05, 0.05));
        msg.setScale(0.86);
        msg.setScrollFactor(0);
        msg.setDepth(241);
        this.tweens.add({
            targets: msg,
            y: y - 22,
            scale: 1.06,
            alpha: 0,
            duration: 700,
            ease: 'Cubic.out',
            onComplete: () => msg.destroy(),
        });
    }

    updateIdlePressureSpawns(time, marines) {
        if (!this.enemyManager || this.stageFlow.isEnded()) return;
        if (this.getAvailableReinforcementSlots('idle') <= 0) return;
        if (time < this.nextIdlePressureAt) return;
        if (time < (this.nextReinforcementSpawnAt || 0)) return;
        if (time < this.pressureGraceUntil) return;
        const aliveNow = this.enemyManager.getAliveCount();
        const softCap = this.getDynamicAliveSoftCap(marines);
        if (aliveNow >= softCap) {
            this.nextIdlePressureAt = time + Phaser.Math.Between(900, 1700);
            return;
        }
        const adaptiveIdleMs = this.getAdaptiveIdleIntervalMs();
        if ((time - this.lastActionAt) < adaptiveIdleMs) return;
        if (this.stageFlow.state === 'intermission') return;
        if (this.shouldApplySurvivalRelief(marines)) {
            this.nextIdlePressureAt = time + Math.max(1200, Math.floor(adaptiveIdleMs * 1.4));
            return;
        }
        const onScreen = this.enemyManager.getOnScreenHostileCount(this.cameras.main);
        if (onScreen >= 3) return;
        const spawned = this.spawnIdlePressureWave(time, marines);
        this.nextIdlePressureAt = time + adaptiveIdleMs;
        if (spawned > 0) {
            this.markCombatAction(time);
            this.noteReinforcementSpawn(time, 'idle', spawned);
            this.showFloatingText(this.leader.x, this.leader.y - 28, 'CONTACT: NEW HOSTILES', '#99ddff');
        }
    }

    spawnIdlePressureWave(_time, marines) {
        const leader = this.leader;
        if (!leader || !this.pathGrid) return 0;
        const slots = this.getAvailableReinforcementSlots('idle');
        if (slots <= 0) return 0;
        const aliveNow = this.enemyManager?.getAliveCount?.() || 0;
        const softCap = this.getDynamicAliveSoftCap(marines);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) return 0;
        const view = this.cameras.main ? this.cameras.main.worldView : null;
        const difficulty = this.activeMission?.difficulty || 'normal';
        const desiredPack = difficulty === 'extreme' ? 5 : (difficulty === 'hard' ? 4 : 3);
        const pressure = this.getCombatPressure();
        const state = this.getDirectorState();
        const pressureBonus = pressure > 0.75 ? 2 : (pressure > 0.52 ? 1 : 0);
        const stateBonus = state === 'release' ? -1 : 0;
        const packSize = Math.min(slots, capRoom, Math.max(1, desiredPack + pressureBonus + stateBonus));
        let spawned = 0;
        for (let i = 0; i < packSize; i++) {
            const world = this.pickIdlePressureSpawnWorld(view, marines, _time);
            if (!world) continue;
            const type = this.pickIdlePressureType(i);
            const enemy = this.enemyManager.spawnEnemyAtWorld(type, world.x, world.y, this.stageFlow.currentWave || 1);
            if (enemy) {
                enemy.dynamicReinforcement = true;
                enemy.reinforcementSource = 'idle';
                const marList = Array.isArray(marines) && marines.length > 0 ? marines : [leader];
                const target = marList[Math.floor(Math.random() * marList.length)] || leader;
                enemy.alertUntil = Math.max(enemy.alertUntil, this.time.now + 3800);
                enemy.investigatePoint = { x: target.x, y: target.y, power: 1 };
                enemy.investigateUntil = this.time.now + 3200;
                this.noteIdleSpawnPoint(world, _time);
                spawned++;
            }
        }
        return spawned;
    }

    pickIdlePressureSpawnWorld(view, marines, time = this.time.now) {
        const leader = this.leader;
        const minDist = CONFIG.TILE_SIZE * 8;
        const maxAttempts = 120;
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : [leader];
        let best = null;
        let bestScore = -Infinity;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const tx = Phaser.Math.Between(0, this.pathGrid.width - 1);
            const ty = Phaser.Math.Between(0, this.pathGrid.height - 1);
            if (!this.pathGrid.isWalkable(tx, ty)) continue;
            const world = this.pathGrid.tileToWorld(tx, ty);
            let nearest = Infinity;
            for (const m of marList) {
                const d = Phaser.Math.Distance.Between(m.x, m.y, world.x, world.y);
                if (d < nearest) nearest = d;
            }
            if (nearest < minDist) continue;
            const onScreen = view && Phaser.Geom.Rectangle.Contains(view, world.x, world.y);
            const offscreenBonus = onScreen ? -2200 : 1800;
            const repeatPenalty = this.getIdleSpawnRepeatPenalty(world, time);
            const score = nearest + offscreenBonus - repeatPenalty + Phaser.Math.Between(0, 140);
            if (score > bestScore) {
                best = world;
                bestScore = score;
            }
        }
        return best;
    }

    pickIdlePressureType(index = 0) {
        if (this.warriorOnlyTesting) return 'warrior';
        const missionId = this.activeMission?.id || 'm1';
        if (missionId === 'm1') return index % 5 === 0 ? 'drone' : 'warrior';
        if (missionId === 'm2') return index % 4 === 0 ? 'facehugger' : (index % 3 === 0 ? 'drone' : 'warrior');
        if (missionId === 'm3' || missionId === 'm4') return index % 3 === 0 ? 'drone' : (index % 2 === 0 ? 'facehugger' : 'warrior');
        if (missionId === 'm5') return index % 3 === 0 ? 'drone' : (index % 2 === 0 ? 'facehugger' : 'warrior');
        return 'warrior';
    }

    isMotionTrackerRiskLocked(time) {
        return time < this.trackerRiskUntil;
    }

    resolveActionLockConflicts(time = this.time.now) {
        const trackerLocked = this.isMotionTrackerRiskLocked(time);
        if (!trackerLocked || !this.healAction || !this.trackerOperator) return;
        const h = this.healAction;
        const t = this.trackerOperator;
        const sameActor = t.actor && (t.actor === h.operator || t.actor === h.target);
        const sameRole = !!(t.roleKey && (t.roleKey === h.operatorRoleKey || t.roleKey === h.targetRoleKey));
        if (!sameActor && !sameRole) return;

        const trackerStart = Number(this.trackerStartedAt) || 0;
        const healStart = Number(h.startedAt) || 0;
        if (trackerStart >= healStart) {
            this.cancelMotionTrackerScan(false);
        } else {
            this.cancelHealAction(false);
        }
        this.showFloatingText(this.leader.x, this.leader.y - 24, 'ACTION DECONFLICT', '#ffcb8a');
    }

    startMotionTrackerScan(time, preferredRoleKey = null) {
        const visibility = this.runtimeSettings?.visibility || {};
        const actionMs = 5000;
        const scanMs = 5000;
        const cooldownMs = Number(visibility.trackerCooldownMs) || CONFIG.MOTION_TRACKER_COOLDOWN_MS;
        if (this.healAction) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER BLOCKED: HEAL ACTIVE', '#ffcc88');
            return;
        }
        if (this.isMotionTrackerRiskLocked(time)) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER IN PROGRESS', '#ffcc88');
            return;
        }
        if (time < this.trackerCooldownUntil) {
            const remain = ((this.trackerCooldownUntil - time) / 1000).toFixed(1);
            this.showFloatingText(this.leader.x, this.leader.y - 24, `TRACKER COOL ${remain}s`, '#88ffaa');
            return;
        }
        const operator = this.pickTrackerOperator(preferredRoleKey);
        if (!operator || !operator.actor) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'SELECTED TRACKER OPERATOR UNAVAILABLE', '#ff9999');
            return;
        }

        this.trackerOperator = {
            actor: operator.actor,
            roleKey: operator.roleKey || null,
            previousHealth: Number(operator.actor.health) || 0,
            previousDamagedAt: Number.isFinite(operator.actor.lastDamagedAt) ? operator.actor.lastDamagedAt : -1,
        };
        this.trackerStartedAt = time;
        this.trackerChannelUntil = time + actionMs;
        this.trackerScanUntil = this.trackerChannelUntil + scanMs;
        this.trackerRiskUntil = this.trackerScanUntil;
        this.trackerCooldownUntil = time + cooldownMs;
        this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER ACTIVATING', '#88ffaa');
    }

    cancelMotionTrackerScan(attacked = false) {
        if (!this.isMotionTrackerRiskLocked(this.time.now)) return;
        const roleKey = this.trackerOperator && this.trackerOperator.roleKey;
        if (roleKey && this.squadSystem) this.squadSystem.setExternalHoldRole(roleKey, false);
        this.trackerOperator = null;
        this.trackerStartedAt = 0;
        this.trackerChannelUntil = this.time.now;
        this.trackerScanUntil = this.time.now;
        this.trackerRiskUntil = this.time.now;
        if (attacked) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER CANCELLED: CONTACT', '#ff9a9a');
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.pauseText.setVisible(this.isPaused);
        if (this.isPaused) {
            this.physics.world.pause();
            this.contextMenu.hide();
            this.doorActionSystem.cancelPending();
            this.movementSystem.clearPath(this.leader);
        } else {
            this.physics.world.resume();
        }
    }
}
