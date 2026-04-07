import { CONFIG } from '../config.js';
import { MapBuilder } from '../map/MapBuilder.js';
import { TeamLeader } from '../entities/TeamLeader.js';
import { BulletPool } from '../entities/BulletPool.js';
import { AcidPool } from '../entities/AcidPool.js';
import { InputHandler } from '../systems/InputHandler.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { PathGrid } from '../pathfinding/PathGrid.js';
import { AStar } from '../pathfinding/AStar.js';
import { EasyStarAdapter } from '../pathfinding/EasyStarAdapter.js';
import { PathPlanner } from '../pathfinding/PathPlanner.js';
import { DoorManager } from '../entities/DoorManager.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { DoorActionSystem } from '../systems/DoorActionSystem.js';
import { WeaponManager } from '../systems/WeaponManager.js';
import { HUD } from '../ui/HUD.js';
import { SquadSystem } from '../systems/SquadSystem.js';
import { FollowerCombatSystem } from '../systems/FollowerCombatSystem.js';
import { CommanderSystem } from '../systems/CommanderSystem.js';
import { AtmosphereSystem } from '../systems/AtmosphereSystem.js';
import { ObjectiveSystem } from '../systems/ObjectiveSystem.js';
import { SetpieceSystem } from '../systems/SetpieceSystem.js';
import { MissionLog } from '../ui/MissionLog.js';
import { TargetingSystem } from '../systems/TargetingSystem.js';
import { LightBlockerGrid } from '../lighting/LightBlockerGrid.js';
import { Raycaster } from '../lighting/Raycaster.js';
import { LightingOverlay } from '../lighting/LightingOverlay.js';
import { EnemyManager } from '../systems/EnemyManager.js';
import { MotionTracker } from '../ui/MotionTracker.js';
import { CRTFrame } from '../ui/CRTFrame.js';
import { Minimap } from '../ui/Minimap.js';
import { StageFlow } from '../systems/StageFlow.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { ObjectivesPanel } from '../ui/ObjectivesPanel.js';
import { ControlsOverlay } from '../ui/ControlsOverlay.js';
import { MEDKIT_WAVE_SPAWNS, AMMO_WAVE_SPAWNS, AMMO_PICKUP_VALUE } from '../data/pickupData.js';
import { EGG_CLUSTERS } from '../data/enemyData.js';
import { MISSION_SET } from '../data/missionData.js';
import { resolveMissionLayout } from '../map/missionLayout.js';
import { MissionFlow } from '../systems/MissionFlow.js';
import { DEFAULT_RUNTIME_SETTINGS, loadRuntimeSettings } from '../settings/runtimeSettings.js';
import { SfxEngine } from '../audio/SfxEngine.js';
import {
    loadCampaignProgress,
    saveCampaignProgress,
    completeCampaignMission,
    resetCampaignProgress,
} from '../settings/campaignProgress.js';
import {
    getMissionDirectorOverridesForMission,
    getMissionDirectorEventsForMission,
    getMissionAudioCuesForMission,
    getMissionStoryPointsForMission,
    getMissionPackageMeta,
    getMissionPackageSummary,
    isMissionPackageMetaStale,
    getMissionNodeGraphs,
} from '../settings/missionPackageRuntime.js';
import { CombatDirector } from '../systems/CombatDirector.js';
import { ReinforcementSystem } from '../systems/ReinforcementSystem.js';
import { AlienCorpseDebris } from '../graphics/AlienCorpseDebris.js';
import { MistSystem } from '../systems/MistSystem.js';
import { HiveGrowthSystem } from '../systems/HiveGrowthSystem.js';
import { EventBus } from '../events/EventBus.js';
import { ActionDispatcher } from '../events/ActionDispatcher.js';
import { GraphRunner } from '../events/GraphRunner.js';

const TEAM_SPEED_SCALE = 1.0;
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
const THREAT_SPOT_CALLOUTS = Object.freeze({
    facehugger: Object.freeze(['Facehugger! Keep it off me!', 'Hugger in the beam!', 'Small fast mover, front!']),
    drone: Object.freeze(['Drone charging!', 'Fast xeno, right there!', 'Drone breaking line!']),
    warrior: Object.freeze(['Warrior class contact!', 'Big one pushing up!', 'Warrior in front arc!']),
    queenLesser: Object.freeze(['Lesser queen on visual!', 'Heavy bio-signature closing!', 'Queen-class xeno ahead!']),
    queen: Object.freeze(['Queen contact! Hold this line!', 'Queen in sight! All guns!', 'Major xeno! Focus fire now!']),
});
const THREAT_ATTACK_CALLOUTS = Object.freeze({
    facehugger: Object.freeze(['Hugger on me!', 'Get this thing off!', 'Facehugger close!']),
    drone: Object.freeze(['Drone hit me!', 'Fast mover in close!', 'Drone in my lane!']),
    warrior: Object.freeze(['Warrior is on top of us!', 'Heavy xeno pressure!', 'Warrior hit taken!']),
    queenLesser: Object.freeze(['Lesser queen striking us!', 'Queen-class in close!', 'Heavy contact!']),
    queen: Object.freeze(['Queen is in contact range!', 'Major xeno impact!', 'Queen pressure! Hold!']),
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
    'Short controlled bursts.',
    'Stay frosty.',
    'Another bug hunt.',
    'Movement. Sector four.',
    'Copy that. Holding position.',
    'Mag check. Green.',
    'Eyes on that corridor.',
    'Seal it up behind us.',
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
    '--kssht-- they\'re in the walls...',
    'Sensor says clear but... I don\'t buy it.',
]);

const OFFSCREEN_INCIDENTS = Object.freeze([
    'Movement in the vents.',
    'Motion on the flank.',
    'Tracker chirping hard.',
    'Something is circling us.',
    'Contact just outside beam.',
    'They\'re probing our perimeter.',
    'Multiple returns, can\'t get a lock.',
]);
const COMMANDER_PHASE_CHATTER = Object.freeze({
    normal: Object.freeze([
        'APC: stay frosty, keep moving.',
        'APC: hold your spacing and clear methodically.',
        'APC: copy objectives, maintain discipline.',
    ]),
    hard: Object.freeze([
        'APC: no stalls, keep the pressure forward.',
        'APC: tighten the line and clear fast.',
        'APC: expect contact spikes, stay in formation.',
    ]),
    extreme: Object.freeze([
        'APC: this is a kill zone, no mistakes.',
        'APC: contact will surge, hold your arcs.',
        'APC: keep guns up, nothing gets through.',
    ]),
});
const COMMANDER_SURGE_CHATTER = Object.freeze({
    normal: Object.freeze([
        'APC: surge detected, hold formation.',
        'APC: contact wave incoming, anchor now.',
    ]),
    hard: Object.freeze([
        'APC: corridor surge, lock your lanes.',
        'APC: wave push inbound, split and suppress.',
    ]),
    extreme: Object.freeze([
        'APC: major surge, fall back by arc.',
        'APC: hard contact, hold the line now.',
    ]),
});
const COMBAT_TELEMETRY_STORAGE_KEY = 'aliens_combat_telemetry_v1';
const COMBAT_TELEMETRY_SAMPLE_MS = 1000;
const COMBAT_TELEMETRY_MAX_SAMPLES = 360;
const MISSION_BALANCE_HISTORY_KEY = 'aliens_mission_balance_history_v1';
const MISSION_BALANCE_HISTORY_MAX = 60;
const MISSION_DIRECTOR_ALLOWED_TRIGGERS = new Set(['always', 'time', 'wave', 'pressure', 'kills', 'stage', 'objective']);
const MISSION_DIRECTOR_ALLOWED_ACTIONS = new Set([
    'spawn_pack',
    'text_cue',
    'cue_text',
    'show_text',
    'door_thump',
    'thump',
    'edge_cue',
    'set_pressure_grace',
    'door_action',
    'door_state',
    'set_reinforce_caps',
    'set_reinforcement_caps',
    'set_lighting',
    'set_combat_mods',
    'morale_delta',
    'panic_delta',
    'trigger_tracker',
    'start_tracker',
    'spawn_queen',
    'spawn_boss',
]);
const MISSION_DIRECTOR_DOOR_OPS = Object.freeze(['open', 'close', 'lock', 'hack', 'weld', 'unweld']);
const MISSION_DIRECTOR_DOOR_OPS_SET = new Set(MISSION_DIRECTOR_DOOR_OPS);
const MISSION_DIRECTOR_TRACKER_ROLES = new Set(['tech', 'medic', 'heavy', 'leader']);
const MISSION_DIRECTOR_SPAWN_TYPES = new Set(['warrior', 'drone', 'facehugger', 'queenlesser', 'queen_lesser', 'queen']);

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.launchData = {};
    }

    init(data) {
        this.launchData = data || {};
    }

    applyHadleysHopeStyleProfile() {
        const s = this.runtimeSettings || {};
        s.lighting = s.lighting || {};
        s.graphics = s.graphics || {};
        s.visibility = s.visibility || {};
        s.walls = s.walls || {};
        s.other = s.other || {};
        s.marines = s.marines || {};
        s.scripting = s.scripting || {};
        s.spriteAnimation = s.spriteAnimation || {};

        // Hadley's Hope profile: darker industrial ambience and harder practical contrast.
        s.lighting.ambientDarkness = Phaser.Math.Clamp(Math.max(0.9, Number(s.lighting.ambientDarkness) || 0.8), 0.45, 1);
        s.lighting.softRadius = Phaser.Math.Clamp((Number(s.lighting.softRadius) || 155) * 0.8, 10, 600);
        s.lighting.coreAlpha = Phaser.Math.Clamp((Number(s.lighting.coreAlpha) || 0.82) * 0.9, 0, 1);

        s.graphics.scanlineStrength = 0;
        s.graphics.filmGrain = Phaser.Math.Clamp(Math.max(0.09, Number(s.graphics.filmGrain) || 0.07), 0, 0.3);
        s.graphics.pressureChromaticAberration = Phaser.Math.Clamp(Number(s.graphics.pressureChromaticAberration) || 1, 0, 1);
        s.graphics.pressureColorBleed = Phaser.Math.Clamp(Number(s.graphics.pressureColorBleed) || 1, 0, 1);

        s.visibility.ghostBlueMix = Phaser.Math.Clamp(Math.max(88, Number(s.visibility.ghostBlueMix) || 86), 0, 100);
        s.visibility.ghostAlphaMin = Phaser.Math.Clamp(Math.max(0.64, Number(s.visibility.ghostAlphaMin) || 0.62), 0.1, 0.9);
        s.visibility.ghostAlphaMax = Phaser.Math.Clamp(Math.max(0.84, Number(s.visibility.ghostAlphaMax) || 0.82), s.visibility.ghostAlphaMin, 1);

        s.walls.lightPenetrationPct = Phaser.Math.Clamp(Math.min(0.14, Number(s.walls.lightPenetrationPct) || 0.25), 0, 0.8);
        s.walls.impactFxIntensity = Phaser.Math.Clamp(Math.max(1.65, Number(s.walls.impactFxIntensity) || 1.5), 0.2, 3);

        s.other.audioBeepVolume = Phaser.Math.Clamp(Number(s.other.audioBeepVolume) || 0.4, 0, 2);
        s.other.atmoVignetteBase = Phaser.Math.Clamp(Math.max(0.24, Number(s.other.atmoVignetteBase) || 0.18), 0, 0.6);
        s.other.atmoVignettePressureGain = Phaser.Math.Clamp(Math.max(0.22, Number(s.other.atmoVignettePressureGain) || 0.16), 0, 0.8);

        s.marines.radioAmbientChance = Phaser.Math.Clamp(Math.min(0.38, Number(s.marines.radioAmbientChance) || 0.46), 0, 1);
        s.marines.radioUnderAttackChance = Phaser.Math.Clamp(Math.max(0.9, Number(s.marines.radioUnderAttackChance) || 0.86), 0, 1);

        s.scripting.idlePressureBaseMs = Math.max(2800, Number(s.scripting.idlePressureBaseMs) || 6000);
        s.scripting.gunfireReinforceBaseMs = Math.max(1700, Number(s.scripting.gunfireReinforceBaseMs) || 3900);

        s.spriteAnimation.muzzleFlashScale = Phaser.Math.Clamp(Math.max(1.24, Number(s.spriteAnimation.muzzleFlashScale) || 1.18), 0.2, 4);
    }

    normalizeMissionWavesForFullStart(missionWaves) {
        const waves = Array.isArray(missionWaves) ? missionWaves : [];
        const normalized = [];
        for (const wave of waves) {
            if (!Array.isArray(wave) || wave.length <= 0) continue;
            const nextWave = [];
            for (const spawn of wave) {
                if (!spawn || typeof spawn !== 'object') continue;
                nextWave.push({ ...spawn });
            }
            if (nextWave.length > 0) normalized.push(nextWave);
        }
        return normalized.length > 0 ? normalized : [[]];
    }

    getMarineAmmoState(role = 'leader') {
        return this.marineAmmo?.get(role) || null;
    }

    addPulseRifleMagazines(amount = 1) {
        const grant = Math.max(0, Math.floor(Number(amount) || 0));
        if (grant <= 0 || !this.marineAmmo) return 0;

        let applied = 0;
        for (const state of this.marineAmmo.values()) {
            if (!state) continue;
            state.magsLeft = Math.max(0, Number(state.magsLeft) || 0) + grant;
            applied += 1;
        }
        if (applied > 0) this.hud?.refreshNow();
        return applied;
    }

    requestMarineReload(role = 'leader', time = this.time.now, options = {}) {
        const state = this.getMarineAmmoState(role);
        if (!state) return false;

        const magSize = Math.max(1, Number(state.magSize) || 99);
        const currentMag = Math.max(0, Number(state.currentMag) || 0);
        const magsLeft = Math.max(0, Number(state.magsLeft) || 0);
        const force = options.force === true;
        if (state.isReloading || magsLeft <= 0) return false;
        if (!force && currentMag >= magSize) return false;

        state.isReloading = true;
        state.reloadUntil = time + Math.max(250, Number(options.durationMs) || 2400);
        state.displayedAmmo = Math.max(0, Math.min(Number(state.displayedAmmo) || 0, currentMag));
        this.hud?.refreshNow();
        return true;
    }

    requestLeaderReload(time = this.time.now, options = {}) {
        if (this.stageFlow?.isEnded?.() || this.isPaused || this.controlsOverlay?.visible) return false;
        if ((this.weaponManager?.currentWeaponKey || 'pulseRifle') !== 'pulseRifle') return false;

        const ammoState = this.getMarineAmmoState('leader');
        if (!ammoState) return false;

        const visualAmmo = Math.max(0, Number(ammoState.displayedAmmo) || 0);
        const magSize = Math.max(1, Number(ammoState.magSize) || 99);
        const currentMag = Math.max(0, Number(ammoState.currentMag) || 0);
        const manual = options.manual === true;
        const fastWindow = visualAmmo >= 5 && visualAmmo <= 10;
        const durationMs = fastWindow ? 1200 : 2400;
        const shouldReload = manual
            ? currentMag < magSize
            : (currentMag <= 0 || visualAmmo <= 0 || fastWindow);

        if (!shouldReload) return false;
        return this.requestMarineReload('leader', time, { durationMs, force: manual });
    }

    syncLeaderPulseAmmoState() {
        const ammoState = this.getMarineAmmoState('leader');
        const weaponManager = this.weaponManager;
        if (!ammoState || !weaponManager) return;

        const pulseAmmo = Phaser.Math.Clamp(Number(weaponManager.pulseAmmo) || 0, 0, 99);
        ammoState.currentMag = pulseAmmo;
        ammoState.displayedAmmo = pulseAmmo;
        ammoState.isReloading = false;
        ammoState.reloadUntil = 0;
        ammoState.magsLeft = 0;
        ammoState.pulseHeat = Math.max(0, 99 - pulseAmmo);
        ammoState.isOverheated = weaponManager.isOverheated === true;
        ammoState.overheatCooldownUntil = Number(weaponManager.overheatCooldownUntil) || 0;
        ammoState.isFiring = weaponManager.isFiringPulse === true;
        if (weaponManager.lastPulseFiredTime > 0) {
            ammoState.lastFiredAt = weaponManager.lastPulseFiredTime;
        }
    }

    create() {
        this.runtimeSettings = loadRuntimeSettings();
        this.sfx = new SfxEngine(this);
        if (typeof window !== 'undefined') {
            window.__ALIENS_DEBUG_SCENE__ = this;
        }

        // ── Node-based action system (EventBus + ActionDispatcher + GraphRunner) ──
        this.eventBus = new EventBus();
        this.actionDispatcher = new ActionDispatcher(this);
        this._registerDefaultActions();
        this.graphRunner = new GraphRunner(this.eventBus, this.actionDispatcher);
        this.graphRunner.scene = this;
        const nodeGraphs = getMissionNodeGraphs();
        if (nodeGraphs.length > 0) {
            this.graphRunner.loadGraphs(nodeGraphs);
        }

        const missionLayout = resolveMissionLayout(this.launchData.missionId);
        this.missionLayout = missionLayout;
        this.tilemapSourceLabel = String(missionLayout?.tilemapSource || 'TEMPLATE');
        this.activeLightingOverrides = {};
        this.zoneLightingOverrides = {};

        this.activeMission = missionLayout.mission;
        // ?noaliens flag: zero out waves + disable all spawning for clean map testing
        this.noAliens = new URLSearchParams(window.location.search).has('noaliens');
        this.activeMissionWaves = this.noAliens ? [] : this.normalizeMissionWavesForFullStart(missionLayout.missionWaves);
        this.forceWarriorOnly = missionLayout.forceWarriorOnly === true;
        this.missionFlow = new MissionFlow(this.activeMission, missionLayout.tilemap, {
            warriorOnly: this.forceWarriorOnly,
        });

        this.roomPropGroup = this.physics.add.staticGroup();

        const mapBuilder = new MapBuilder(this, {
            id: missionLayout.mission.id,
            floorData: missionLayout.floorData,
            wallData: missionLayout.wallData,
            doors: missionLayout.tilemap.doors,
            width: missionLayout.tilemap.width,
            height: missionLayout.tilemap.height,
            floorTextureKey: missionLayout.floorTextureKey,
            wallTextureKey: missionLayout.wallTextureKey,
            terrainTextures: missionLayout.terrainTextures,
            props: missionLayout.props,
            largeTextures: missionLayout.largeTextures,
        });
        const { floorLayer, wallLayer, propSprites, largeTextureSprites } = mapBuilder.build(this.roomPropGroup);
        this.floorLayer = floorLayer;
        this.wallLayer = wallLayer;
        this.largeTextureSprites = Array.isArray(largeTextureSprites) ? largeTextureSprites : [];
        this.roomProps = [];
        this.environmentLampLights = [];
        this.environmentSpotLights = [];
        this.environmentAlarmLights = [];
        this.lightBlockerGrid = new LightBlockerGrid(
            wallLayer,
            missionLayout.tilemap.width,
            missionLayout.tilemap.height
        );

        this.pathGrid = new PathGrid(wallLayer, missionLayout.tilemap.width, missionLayout.tilemap.height);
        this.astar = new AStar();
        this.hybridPathfinder = new EasyStarAdapter(this.astar);
        this.pathPlanner = new PathPlanner(this.hybridPathfinder, this.pathGrid);
        this.registerAuthoredRoomProps(propSprites);
        this.placeRoomProps(missionLayout);
        this.ensureGlobalPathConnectivity(missionLayout.spawnTile);

        const spawnWorld = this.pathGrid.tileToWorld(missionLayout.spawnTile.x, missionLayout.spawnTile.y);
        const resolvedSpawn = this.findNearestWalkableWorld(spawnWorld.x, spawnWorld.y, 6);
        const leaderSpawnTile = this.pathGrid.worldToTile(resolvedSpawn.x, resolvedSpawn.y);
        this.leader = new TeamLeader(this, leaderSpawnTile.x, leaderSpawnTile.y);
        this.leader.moveSpeed = this.runtimeSettings.player.leaderSpeed * TEAM_SPEED_SCALE;
        this.leader.moveResponseRate = this.runtimeSettings.player.moveResponseRate;
        this.leader.movementRigidity = this.runtimeSettings.player.movementRigidity;
        this.leader.turnSpeedRadPerSec = this.runtimeSettings.player.leaderTurnSpeed;
        this.leader.maxHealth = this.runtimeSettings.player.maxHealth;
        this.leader.health = Math.min(this.leader.maxHealth, this.runtimeSettings.player.startHealth);
        // Sprite sizing removed — Image Editor is sole authority (no code-driven scaling)
        this.initStagingSafeArea(leaderSpawnTile);
        this.bulletPool = new BulletPool(this);
        this.acidPool = new AcidPool(this);
        this.weaponManager = new WeaponManager(this.bulletPool, this.runtimeSettings.weapons);
        this.weaponManager.scene = this;
        this.weaponManager.onJam = ({ ownerRoleKey = 'leader', jamDuration = 0 } = {}) => {
            const isLeader = ownerRoleKey === 'leader' || !ownerRoleKey;
            const actor = isLeader
                ? this.leader
                : (this.squadSystem?.getFollowerByRole?.(ownerRoleKey) || this.leader);
            const sec = Math.max(0, jamDuration / 1000);
            const label = isLeader ? 'WEAPON JAM!' : `${String(ownerRoleKey).toUpperCase()} JAM!`;
            this.showFloatingText(actor.x, actor.y - 24, `${label} ${sec.toFixed(1)}s`, '#ffb7a2');
            if (isLeader && this.sfx && typeof this.sfx.playJamPulse === 'function') {
                this.sfx.playJamPulse();
            }
        };
        this.weaponManager.onLowAmmoWarning = (ammoLeft, _time) => {
            if (this.sfx && ammoLeft <= 10) {
                // Escalating warning beep — higher pitch as ammo gets lower
                const urgency = 1 - (ammoLeft / 15);
                const freq = 800 + urgency * 600;
                const ctx = this.sfx.ensureContext(false, false);
                if (ctx && ctx.state === 'running') {
                    this.sfx.createTone(freq, 'square', ctx.currentTime, 0.04, 0.04 + urgency * 0.03);
                }
            }
        };
        this.weaponManager.onOverheatStart = (_time) => {
            if (this.sfx) this.sfx.playJamAlert();
        };
        this.inputHandler = new InputHandler(this);
        this.movementSystem = new MovementSystem(this);

        // Sprint ("hump it") state
        this._sprintActive = false;
        this._sprintUntil = 0;
        this._sprintCooldownUntil = 0;
        this._sprintDuration = 3000;   // 3 seconds of sprint
        this._sprintCooldown = 10000;  // 10 seconds to recharge
        this._sprintSpeedMul = 1.5;    // 1.5× speed boost
        this._baseMoveSpeed = 0;       // stored when sprint starts
        this.squadSystem = new SquadSystem(this, this.leader, this.pathGrid, this.runtimeSettings.squad);
        this.followerCombatSystem = new FollowerCombatSystem(this);
        this.reinforcementSystem = new ReinforcementSystem(this);
        this.commanderSystem = new CommanderSystem(this);
        this.atmosphereSystem = new AtmosphereSystem(this);
        if (missionLayout.atmosphere) this.atmosphereSystem.atmosphereConfig = missionLayout.atmosphere;
        this.mistSystem = new MistSystem(this);
        this.hiveGrowthSystem = new HiveGrowthSystem(this);
        this.objectiveSystem = new ObjectiveSystem(this);
        this.setpieceSystem = new SetpieceSystem(this);
        this.targetingSystem = new TargetingSystem(this);
        this.initSquadNavDiagnosticsBridge();
        this.initAutomationBridge();
        this.commandFormationBase = {
            minSpacing: this.squadSystem.minSpacing,
            snakeCatchupGain: this.squadSystem.snakeCatchupGain,
            snakeStaggerMinMs: this.squadSystem.snakeStaggerMinMs,
            snakeStaggerMaxMs: this.squadSystem.snakeStaggerMaxMs,
        };
        this.doorManager = new DoorManager(
            this,
            this.pathGrid,
            missionLayout.doorDefinitions,
            this.wallLayer,
            { integrityHits: this.runtimeSettings.doors.integrityHits }
        );

        for (const group of this.doorManager.doorGroups) {
            for (const door of group.doors) {
                this.lightBlockerGrid.setTileBlocking(door.tileX, door.tileY, true);
            }
        }
        this.raycaster = new Raycaster();
        this.raycaster.warmup();

        this.lightingOverlay = new LightingOverlay(
            this,
            this.raycaster,
            this.lightBlockerGrid,
            this.runtimeSettings.lighting
        );
        this.applyEffectiveLightingSettings();
        this._buildMapAmbientLights(missionLayout);

        this.alienCorpseDebris = new AlienCorpseDebris(this);

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
        this.stageFlow.eventBus = this.eventBus;
        if (!this.noAliens && this.activeMissionWaves.length > 0) {
            // Phase 1: Use author-specified spawn points if available, else fall back to wave-based spawning
            const hasAuthoredSpawns = Array.isArray(missionLayout.spawnPoints) && missionLayout.spawnPoints.length > 0;
            if (hasAuthoredSpawns) {
                const missionDifficulty = missionLayout.mission?.difficulty === 'hard' ? 1.5 : 1.0;
                this.enemyManager.spawner.spawnFromAuthoredPoints(missionLayout.spawnPoints, 1, missionDifficulty);
            } else {
                this.enemyManager.spawnWave(this.activeMissionWaves[0], 1);
            }
        }
        this.sessionStartTime = this.time.now;
        this.sessionStartEpochMs = Date.now();
        this.totalKills = 0;
        this.meta = this.loadMetaProgress();
        this.campaignMissionOrder = MISSION_SET.map((m) => m.id);
        this.campaignProgress = loadCampaignProgress(this.campaignMissionOrder);
        this.campaignProgressUpdated = false;
        const autoSaveMissions = (Number(this.runtimeSettings?.scripting?.autoSaveBetweenMissions) || 0) > 0;
        if (autoSaveMissions && this.activeMission?.id) {
            this.campaignProgress = saveCampaignProgress({
                ...this.campaignProgress,
                currentMissionId: this.activeMission.id,
                updatedAt: Date.now(),
            }, this.campaignMissionOrder);
        }

        this.contextMenu = new ContextMenu(this);
        this.doorActionSystem = new DoorActionSystem(this, this.pathGrid, this.pathPlanner, this.movementSystem);
        this.combatDirector = new CombatDirector(this.runtimeSettings.director);
        this.combatDirector.scene = this;
        this.missionBalanceSnapshotRecorded = false;
        this.pickupGroup = this.physics.add.group({ immovable: true, allowGravity: false });
        const shouldCollideWithDoor = (obj, door) => {
            return !!door && !!door.doorGroup && door.doorGroup.isPassable !== true;
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
        const getHitBounds = (obj) => {
            if (!obj) return null;
            if (typeof obj.getBounds === 'function') {
                const b = obj.getBounds();
                if (b) return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
            }
            const tx = Number(obj.pixelX);
            const ty = Number(obj.pixelY);
            const tw = Number(obj.width) || Number(obj.baseWidth);
            const th = Number(obj.height) || Number(obj.baseHeight);
            if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tw) && Number.isFinite(th)) {
                return { left: tx, right: tx + tw, top: ty, bottom: ty + th };
            }
            return null;
        };
        const resolveImpactPoint = (projectile, hitObj) => {
            if (!projectile) return { x: 0, y: 0 };
            const body = projectile.body;
            const vx = Number(body?.velocity?.x) || 0;
            const vy = Number(body?.velocity?.y) || 0;
            const speed = Math.hypot(vx, vy);
            const nx = speed > 0.001 ? (vx / speed) : 0;
            const ny = speed > 0.001 ? (vy / speed) : 0;
            const bounds = getHitBounds(hitObj);
            if (!bounds) {
                return {
                    x: projectile.x - nx * 8,
                    y: projectile.y - ny * 8,
                };
            }
            const inside = (
                projectile.x >= bounds.left && projectile.x <= bounds.right &&
                projectile.y >= bounds.top && projectile.y <= bounds.bottom
            );
            if (!inside) {
                return {
                    x: Phaser.Math.Clamp(projectile.x, bounds.left, bounds.right),
                    y: Phaser.Math.Clamp(projectile.y, bounds.top, bounds.bottom),
                };
            }
            if (Math.abs(nx) >= Math.abs(ny)) {
                return {
                    x: nx >= 0 ? bounds.left : bounds.right,
                    y: Phaser.Math.Clamp(projectile.y, bounds.top, bounds.bottom),
                };
            }
            return {
                x: Phaser.Math.Clamp(projectile.x, bounds.left, bounds.right),
                y: ny >= 0 ? bounds.top : bounds.bottom,
            };
        };
        const getProjectileImpactAngle = (projectile) => {
            const vx = Number(projectile?.body?.velocity?.x) || 0;
            const vy = Number(projectile?.body?.velocity?.y) || 0;
            if ((vx * vx + vy * vy) > 0.01) return Math.atan2(vy, vx);
            const rot = Number(projectile?.rotation);
            if (Number.isFinite(rot)) return rot;
            return null;
        };
        const getImpactNormalAngle = (projectile, hitObj) => {
            const bounds = getHitBounds(hitObj);
            const vx = Number(projectile?.body?.velocity?.x) || 0;
            const vy = Number(projectile?.body?.velocity?.y) || 0;
            const speed = Math.hypot(vx, vy);
            const pvx = speed > 0.001 ? (vx / speed) : 0;
            const pvy = speed > 0.001 ? (vy / speed) : 0;
            if (!bounds) {
                if (speed <= 0.001) return null;
                return Math.atan2(-pvy, -pvx);
            }
            const px = Number(projectile?.x) || 0;
            const py = Number(projectile?.y) || 0;
            const dLeft = Math.abs(px - bounds.left);
            const dRight = Math.abs(px - bounds.right);
            const dTop = Math.abs(py - bounds.top);
            const dBottom = Math.abs(py - bounds.bottom);
            const minD = Math.min(dLeft, dRight, dTop, dBottom);
            let nx = 0;
            let ny = 0;
            if (minD === dLeft) nx = -1;
            else if (minD === dRight) nx = 1;
            else if (minD === dTop) ny = -1;
            else ny = 1;
            // Ensure normal faces against incoming projectile direction.
            const dot = nx * pvx + ny * pvy;
            if (dot > 0) {
                nx = -nx;
                ny = -ny;
            }
            if ((nx * nx + ny * ny) < 0.001) {
                if (speed <= 0.001) return null;
                return Math.atan2(-pvy, -pvx);
            }
            return Math.atan2(ny, nx);
        };
        const findBlockingHitBetweenPoints = (x1, y1, x2, y2) => {
            if (!this.raycaster || !this.lightBlockerGrid) return null;
            if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return null;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0.001) return null;
            const dirX = dx / dist;
            const dirY = dy / dist;
            const mx = (x1 + x2) * 0.5;
            const my = (y1 + y2) * 0.5;
            const radius = (dist * 0.5) + (CONFIG.TILE_SIZE * 0.85);
            const segments = this.lightBlockerGrid.getSegmentsNear(mx, my, radius);
            if (!Array.isArray(segments) || segments.length === 0) return null;
            let best = null;
            let bestDist = dist + 0.001;
            for (const seg of segments) {
                const hit = this.raycaster.raySegmentIntersection(
                    x1, y1, dirX, dirY,
                    seg.x1, seg.y1, seg.x2, seg.y2
                );
                if (!hit || hit.dist > dist || hit.dist < 0) continue;
                if (hit.dist < bestDist) {
                    bestDist = hit.dist;
                    best = hit;
                }
            }
            if (!best) {
                const steps = Math.max(2, Math.ceil(dist / Math.max(8, CONFIG.TILE_SIZE * 0.25)));
                for (let step = 1; step < steps; step++) {
                    const t = step / steps;
                    const sx = x1 + dx * t;
                    const sy = y1 + dy * t;
                    const tx = Math.floor(sx / CONFIG.TILE_SIZE);
                    const ty = Math.floor(sy / CONFIG.TILE_SIZE);
                    const blocked = this.lightBlockerGrid.isBlocking(tx, ty)
                        || (this.pathGrid && !this.pathGrid.isWalkable(tx, ty));
                    if (!blocked) continue;
                    const hitDist = dist * t;
                    return {
                        x: sx,
                        y: sy,
                        dist: hitDist,
                        totalDist: dist,
                    };
                }
                return null;
            }
            return {
                x: x1 + dirX * best.dist,
                y: y1 + dirY * best.dist,
                dist: best.dist,
                totalDist: dist,
            };
        };
        const getProjectilePrevPos = (projectile) => {
            const px = Number(projectile?.body?.prev?.x);
            const py = Number(projectile?.body?.prev?.y);
            if (Number.isFinite(px) && Number.isFinite(py)) return { x: px, y: py };
            return { x: Number(projectile?.x) || 0, y: Number(projectile?.y) || 0 };
        };
        const getProjectileOcclusionHit = (projectile, target) => {
            if (!projectile || !target) return null;
            // First check if current point is ALREADY inside a wall
            const tx = Math.floor(projectile.x / CONFIG.TILE_SIZE);
            const ty = Math.floor(projectile.y / CONFIG.TILE_SIZE);
            const tileBlocked = (this.lightBlockerGrid && this.lightBlockerGrid.isBlocking(tx, ty))
                || (this.pathGrid && !this.pathGrid.isWalkable(tx, ty));
            if (tileBlocked) {
                return { x: projectile.x, y: projectile.y, dist: 0, totalDist: 1 };
            }
            const x1 = Number.isFinite(projectile.fireX) ? projectile.fireX : getProjectilePrevPos(projectile).x;
            const y1 = Number.isFinite(projectile.fireY) ? projectile.fireY : getProjectilePrevPos(projectile).y;
            const hit = findBlockingHitBetweenPoints(x1, y1, projectile.x, projectile.y);
            if (!hit) return null;
            // Allow tiny endpoint overlap tolerance so edge grazes still register.
            if (hit.dist >= (hit.totalDist - 4)) return null;
            return hit;
        };

        // Wall-edge forgiveness for marines — allows body to feather 14px
        // into wall tiles so pathfinding near corners doesn't jam.
        const marineWallFeatherPx = 14;
        const shouldCollideWithWallForMarine = (marine, tile) => {
            const body = marine.body;
            if (!body) return true;
            const cx = body.center?.x ?? marine.x;
            const cy = body.center?.y ?? marine.y;
            const grid = this.pathGrid;
            const t = grid.worldToTile(cx, cy);
            if (grid.isWalkable(t.x, t.y)) return false;
            const ts = CONFIG.TILE_SIZE;
            const lx = cx - t.x * ts;
            const ly = cy - t.y * ts;
            if (lx <= marineWallFeatherPx && grid.isWalkable(t.x - 1, t.y)) return false;
            if (lx >= ts - marineWallFeatherPx && grid.isWalkable(t.x + 1, t.y)) return false;
            if (ly <= marineWallFeatherPx && grid.isWalkable(t.x, t.y - 1)) return false;
            if (ly >= ts - marineWallFeatherPx && grid.isWalkable(t.x, t.y + 1)) return false;
            return true;
        };
        this.physics.add.collider(this.leader, wallLayer, null, shouldCollideWithWallForMarine);
        if (this.roomPropGroup) this.physics.add.collider(this.leader, this.roomPropGroup);

        // Marine follower colliders
        const followerSprites = this.squadSystem.followers.map(f => f.sprite);
        const followerGroup = this.physics.add.group(followerSprites);
        this.physics.add.collider(followerGroup, wallLayer, null, shouldCollideWithWallForMarine);
        if (this.roomPropGroup) this.physics.add.collider(followerGroup, this.roomPropGroup);
        this.physics.add.collider(followerGroup, this.doorManager.getPhysicsGroup(), null, shouldCollideWithDoor);

        if (this.roomPropGroup) {
            this.physics.add.overlap(this.enemyManager.getPhysicsGroup(), this.roomPropGroup, (a, b) => {
                const enemy = (a && a.enemyType) ? a : ((b && b.enemyType) ? b : null);
                const prop = enemy === a ? b : a;
                if (!enemy || !prop || enemy.active === false || prop.active === false) return;
                const pr = Math.max(8, Number(prop._roomPropRadius) || 18);
                const er = Math.max(8, Number(enemy.body?.halfWidth) || 12);
                const minDist = pr + er * 0.72;
                const dx = enemy.x - prop.x;
                const dy = enemy.y - prop.y;
                const dist = Math.max(0.0001, Math.hypot(dx, dy));
                if (dist >= minDist) return;
                const nx = dx / dist;
                const ny = dy / dist;
                const push = Math.min(12, minDist - dist + 1);
                enemy.x += nx * push;
                enemy.y += ny * push;
                if (enemy.body) {
                    enemy.body.setVelocity(
                        (Number(enemy.body.velocity.x) || 0) * 0.78,
                        (Number(enemy.body.velocity.y) || 0) * 0.78
                    );
                    enemy.body.updateFromGameObject?.();
                }
                const now = Number(this.time?.now) || 0;
                enemy.navRecoverUntil = Math.max(Number(enemy.navRecoverUntil) || 0, now + 340);
                // Before pushing, verify target tile is walkable
                const recoverX = enemy.x + nx * (CONFIG.TILE_SIZE * 1.25);
                const recoverY = enemy.y + ny * (CONFIG.TILE_SIZE * 1.25);
                if (this.pathGrid) {
                    const rt = this.pathGrid.worldToTile(recoverX, recoverY);
                    if (!this.pathGrid.isWalkable(rt.x, rt.y)) {
                        // Try perpendicular directions instead
                        const perpDirs = [[-ny, nx], [ny, -nx]];
                        let found = false;
                        for (const [px, py] of perpDirs) {
                            const altX = enemy.x + px * (CONFIG.TILE_SIZE * 1.25);
                            const altY = enemy.y + py * (CONFIG.TILE_SIZE * 1.25);
                            const at = this.pathGrid.worldToTile(altX, altY);
                            if (this.pathGrid.isWalkable(at.x, at.y)) {
                                enemy.navRecoverTargetX = altX;
                                enemy.navRecoverTargetY = altY;
                                found = true;
                                break;
                            }
                        }
                        if (!found) return; // skip this push entirely
                    } else {
                        enemy.navRecoverTargetX = recoverX;
                        enemy.navRecoverTargetY = recoverY;
                    }
                } else {
                    enemy.navRecoverTargetX = recoverX;
                    enemy.navRecoverTargetY = recoverY;
                }
            });
        }
        this.physics.add.collider(this.bulletPool, wallLayer, (a, b) => {
            const bullet = getProjectileFromPair(a, b);
            if (!bullet || !bullet.active) return;
            const impact = resolveImpactPoint(bullet, b);
            this.showImpactEffect(impact.x, impact.y, 0xdddddd, {
                profile: 'wall',
                weaponKey: bullet.weaponKey,
                impactAngle: getProjectileImpactAngle(bullet),
                impactNormalAngle: getImpactNormalAngle(bullet, b),
            });
            this.eventBus?.emit('bulletHitWall', { bullet, x: impact.x, y: impact.y, weaponKey: bullet.weaponKey });
            bullet.deactivate();
        });
        if (this.roomPropGroup) {
            this.physics.add.collider(this.bulletPool, this.roomPropGroup, (a, b) => {
                const bullet = getProjectileFromPair(a, b);
                if (!bullet || !bullet.active) return;
                const impact = resolveImpactPoint(bullet, b);
                this.showImpactEffect(impact.x, impact.y, 0xdddddd, {
                    profile: 'wall',
                    weaponKey: bullet.weaponKey,
                    impactAngle: getProjectileImpactAngle(bullet),
                    impactNormalAngle: getImpactNormalAngle(bullet, b),
                });
                bullet.deactivate();
            });
        }
        this.physics.add.collider(this.leader, this.doorManager.getPhysicsGroup(), null, shouldCollideWithDoor);
        this.physics.add.collider(
            this.bulletPool,
            this.doorManager.getPhysicsGroup(),
            (a, b) => {
                const bullet = getProjectileFromPair(a, b);
                if (!bullet || !bullet.active) return;
                const door = getDoorFromPair(a, b);
                let color = 0xdddddd;
                let breached = false;
                const shotDamage = Math.max(1, Number(bullet.damage) || 0);
                if (door && door.doorGroup) {
                    if (door.doorGroup.state === 'locked') color = 0xffcc66;
                    if (door.doorGroup.state === 'welded') color = 0x99ccff;
                    const doorGroup = door.doorGroup;
                    const state = doorGroup.state;
                    if (state === 'closed') {
                        const doorScale = Phaser.Math.Clamp(
                            Number(this.runtimeSettings?.doors?.bulletDamageScale) || 0.34,
                            0.05,
                            2
                        );
                        const doorDamage = Math.max(1, Math.round(shotDamage * doorScale));
                        breached = doorGroup.applyBulletDamage(
                            doorDamage,
                            this.pathGrid,
                            this.doorManager.physicsGroup,
                            this.lightBlockerGrid,
                            this.wallLayer
                        );
                    }
                }
                const impact = resolveImpactPoint(bullet, door || a || b);
                this.showImpactEffect(impact.x, impact.y, color, {
                    profile: 'door',
                    weaponKey: bullet.weaponKey,
                    impactAngle: getProjectileImpactAngle(bullet),
                    impactNormalAngle: getImpactNormalAngle(bullet, door || a || b),
                });
                if (breached) {
                    this.showDoorBreachEffect(impact.x, impact.y, 'bullet', getProjectileImpactAngle(bullet));
                    this.showFloatingText(impact.x, impact.y - 18, 'DOOR BREACHED', '#8fcfff');
                }
                this.eventBus?.emit('bulletHitDoor', { bullet, door, damage: shotDamage || 0, breached });
                bullet.deactivate();
            },
            shouldCollideWithDoor
        );
        this.physics.add.collider(this.acidPool, wallLayer, (a, b) => {
            const projectile = getProjectileFromPair(a, b);
            if (projectile && projectile.active) projectile.deactivate();
        });
        if (this.roomPropGroup) {
            this.physics.add.collider(this.acidPool, this.roomPropGroup, (a, b) => {
                const projectile = getProjectileFromPair(a, b);
                if (projectile && projectile.active) projectile.deactivate();
            });
        }
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
            const bulletOriginX = Number.isFinite(bullet.fireX) ? bullet.fireX : getProjectilePrevPos(bullet).x;
            const bulletOriginY = Number.isFinite(bullet.fireY) ? bullet.fireY : getProjectilePrevPos(bullet).y;
            const directBlockedHit = findBlockingHitBetweenPoints(bulletOriginX, bulletOriginY, enemy.x, enemy.y);
            const occludedHit = directBlockedHit || getProjectileOcclusionHit(bullet, enemy);
            if (occludedHit) {
                // If the blocking hit is a closed door, damage the door instead of silently eating the bullet.
                const blockedDoor = this.doorManager.getDoorGroupAtWorldPos(occludedHit.x, occludedHit.y);
                if (blockedDoor && blockedDoor.state === 'closed') {
                    const doorScale = Phaser.Math.Clamp(
                        Number(this.runtimeSettings?.doors?.bulletDamageScale) || 0.34,
                        0.05, 2
                    );
                    const doorDamage = Math.max(1, Math.round(Math.max(1, Number(bullet.damage) || 0) * doorScale));
                    const breached = blockedDoor.applyBulletDamage(
                        doorDamage, this.pathGrid,
                        this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer
                    );
                    this.showImpactEffect(occludedHit.x, occludedHit.y, 0x8fcfff, {
                        profile: 'door', weaponKey: bullet.weaponKey, impactAngle: getProjectileImpactAngle(bullet),
                    });
                    if (breached) {
                        this.showDoorBreachEffect(occludedHit.x, occludedHit.y, 'bullet', getProjectileImpactAngle(bullet));
                        this.showFloatingText(occludedHit.x, occludedHit.y - 18, 'DOOR BREACHED', '#8fcfff');
                    }
                } else {
                    this.showImpactEffect(occludedHit.x, occludedHit.y, 0xdddddd, {
                        profile: 'wall',
                        weaponKey: bullet.weaponKey,
                        impactAngle: getProjectileImpactAngle(bullet),
                    });
                }
                bullet.deactivate();
                return;
            }
            this.showImpactEffect(bullet.x, bullet.y, 0xff7777, { profile: 'flesh', weaponKey: bullet.weaponKey });
            // Quick bright hit flash — small balls of light at impact point.
            this.showAlienHitFlash(bullet.x, bullet.y, bullet);
            // Small metallic ricochet/chip marks on alien hit.
            this.showAlienRicochetMicroMarks(enemy, bullet);
            // Directional micro acid spurts: spray away from shooter and burn floor in small patches.
            this.showAlienDirectionalAcidSpurt(enemy, bullet);
            // SVG acid blood splatters — fly outward, land on floor, steam away.
            this.showAlienBloodSplatter(enemy, bullet);
            // Wound steam — small puff from every hit (micro acid sac rupture).
            this.showAlienHitSteam(enemy.x, enemy.y);
            // Extend hit into a brief moving smoke/steam trail on the wounded alien.
            this.beginAlienWoundTrail(enemy, bullet, this.time.now);
            // Sharper spark pop at bullet impact on alien body.
            this.showAlienHitSparks(enemy, bullet);
            // Acid debris on heavier hits (shotgun pellets, accumulated damage).
            if ((bullet.damage || 0) >= 8) {
                this.showAlienHitAftermath(enemy, bullet);
            }
            // Bullet→splash morph: bullet shape fans out into directional splatter.
            this.showBulletSplash(bullet);
            bullet.deactivate();
            const killed = this.enemyManager.handleBulletHit(enemy, bullet.damage || 0, bullet);
            this.eventBus?.emit('bulletHitAlien', { bullet, enemy, damage: bullet.damage || 0, killed });
            this.onHostileHitConfirm(enemy, bullet, killed, this.time.now);
            if (killed) {
                // Full acid splatter only on kill — body ruptures completely.
                this.showAlienAcidSplash(enemy.x, enemy.y);
                this.showAlienDeathBurst(enemy.x, enemy.y);
                this.totalKills++;
                this.onEnemyKilled(enemy, bullet, this.time.now);
            }
        });
        this.physics.add.overlap(this.bulletPool, this.enemyManager.getEggPhysicsGroup(), (a, b) => {
            const bullet = typeof a.deactivate === 'function' ? a : b;
            const egg = bullet === a ? b : a;
            if (!bullet || !egg || !bullet.active || !egg.active) return;
            const bulletOriginX = Number.isFinite(bullet.fireX) ? bullet.fireX : getProjectilePrevPos(bullet).x;
            const bulletOriginY = Number.isFinite(bullet.fireY) ? bullet.fireY : getProjectilePrevPos(bullet).y;
            const directBlockedHit = findBlockingHitBetweenPoints(bulletOriginX, bulletOriginY, egg.x, egg.y);
            const occludedHit = directBlockedHit || getProjectileOcclusionHit(bullet, egg);
            if (occludedHit) {
                this.showImpactEffect(occludedHit.x, occludedHit.y, 0xdddddd, {
                    profile: 'wall',
                    weaponKey: bullet.weaponKey,
                    impactAngle: getProjectileImpactAngle(bullet),
                });
                bullet.deactivate();
                return;
            }
            this.showImpactEffect(bullet.x, bullet.y, 0xffcc88, { profile: 'egg', weaponKey: bullet.weaponKey });
            bullet.deactivate();
            this.eventBus?.emit('bulletHitEgg', { bullet, egg, damage: bullet.damage || 0 });
            this.enemyManager.handleEggHit(egg, bullet.damage || 0);
        });
        // NOTE: alien-alien self-collider is already registered inside EnemyManager constructor. Do NOT add a second one here.
        this.physics.add.overlap(this.acidPool, this.leader, (a, b) => {
            const projectile = getProjectileFromPair(a, b);
            const target = projectile === a ? b : a;
            if (!projectile || !projectile.active || this.stageFlow.isEnded()) return;
            projectile.deactivate();
            if (target && typeof target.takeDamage === 'function') {
                const dmg = Math.max(0, Number(projectile.damage) || 0);
                target.takeDamage(dmg);
                this.eventBus?.emit('acidHitLeader', { projectile, target, damage: dmg });
                if (dmg > 0 && typeof this.onMarineDamaged === 'function') {
                    this.onMarineDamaged(target, dmg, this.time.now);
                }
            }
        });
        this.physics.add.overlap(this.acidPool, followerGroup, (a, b) => {
            const projectile = getProjectileFromPair(a, b);
            const target = projectile === a ? b : a;
            if (!projectile || !projectile.active || this.stageFlow.isEnded()) return;
            projectile.deactivate();
            if (target && typeof target.takeDamage === 'function') {
                const dmg = Math.max(0, Number(projectile.damage) || 0);
                target.takeDamage(dmg);
                this.eventBus?.emit('acidHitFollower', { projectile, target, damage: dmg });
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
                this.medicPacks = Phaser.Math.Clamp((Number(this.medicPacks) || 0) + 1, 0, this.maxMedicPacks || 2);
                this.showFloatingText(this.leader.x, this.leader.y - 18, `MED-PACK ${this.medicPacks}/${this.maxMedicPacks || 2}`, '#77ff77');
                return;
            }
            if (pickup.kind === 'magazine' || (pickup.kind === 'ammo' && pickup.weaponKey === 'pulseRifle')) {
                const amount = Math.max(1, Number(pickup.amount) || 1);
                this.addPulseRifleMagazines(amount);
                this.showFloatingText(
                    this.leader.x,
                    this.leader.y - 18,
                    `+${amount} MAGS`,
                    '#99ccff'
                );
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
                return;
            }
        });

        const mapWidthPx = missionLayout.tilemap.width * CONFIG.TILE_SIZE;
        const mapHeightPx = missionLayout.tilemap.height * CONFIG.TILE_SIZE;
        this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
        // Leader always at exact screen centre — lerp=1, no deadzone, no offset.
        this.cameras.main.startFollow(this.leader, true, 1, 1);
        this.initAlienTone();
        this.physics.world.setBounds(0, 0, mapWidthPx, mapHeightPx);
        const gameSpeed = this.runtimeSettings?.game?.gameSpeedMultiplier || 1;
        const globalTimeScale = this.runtimeSettings?.game?.globalTimeScale || 1;
        this.physics.world.timeScale = gameSpeed * globalTimeScale;

        this.nextMarineSpotCalloutAt = 0;
        this.nextMarineAttackCalloutAt = 0;
        this.nextMarineAmbientRadioAt = 0;
        this.nextAtmosphereIncidentAt = 0;
        this.nextLowAmmoCalloutAt = 0;
        this._phantomBlips = [];
        this._nextPhantomBlipAt = 0;
        this.lastTeamKillAt = -100000;
        this.lastLowAmmoWeaponKey = '';
        this.lastLowAmmoAmount = -1;
        this.lastDamageCalloutByMarine = new Map();

        // Initialize marine ammo states before HUD so HUD.updateSquad can read them.
        this.marineAmmo = new Map();
        const _initAmmo = (key) => {
            this.marineAmmo.set(key, {
                magSize: 99,
                currentMag: 99,
                displayedAmmo: 99,
                magsLeft: 10,
                isReloading: false,
                reloadUntil: 0,
                lastFiredAt: 0,
                isFiring: false,
                // Overheat (mirrors leader's WeaponManager system)
                pulseHeat: 0,
                isOverheated: false,
                overheatCooldownUntil: 0,
            });
        };
        _initAmmo('leader');
        _initAmmo('tech');
        _initAmmo('medic');
        _initAmmo('heavy');
        this.syncLeaderPulseAmmoState();

        this.hud = new HUD(this, this.weaponManager, this.leader);
        this.missionLog = new MissionLog(this);
        this.motionTracker = new MotionTracker(this);

        // CRT frame overlay + minimap
        this.crtFrame = new CRTFrame(this);
        this.minimap = new Minimap(this);
        this._setupMinimapInput();
        this.lastLeaderPulseShotAt = -100000;
        this.nextThreatPulseAt = 0;
        this.nextImpactShakeAt = 0;
        this.nextShotKickAt = 0;
        this.nextPulseMuzzleEllipseAt = 0;
        this.nextHitConfirmAt = 0;
        this.hitStreak = 0;
        this.lastHitAt = -10000;
        this.nextRicochetWordAt = 0;
        this.healAction = null;
        this.nextMedicAutoHealAt = 0;
        this.maxMedicPacks = 2;
        this.medicPacks = 1;
        
        // marineAmmo Map is initialized earlier, before HUD construction.

        this.teamDamageSampleWindowMs = 2400;
        this.lastTeamDamageSampleAt = -10000;
        this.lastTeamHealthSample = 0;
        this.lastDirectorUpdateAt = -10000;
        this.directorOverrideMods = null;
        this.directorOverrideUntil = 0;
        this.combatMods = this.combatDirector.getModifiers();
        this.combatTelemetryMissionId = String(this.activeMission?.id || '');
        this.nextCombatTelemetrySampleAt = this.time.now + COMBAT_TELEMETRY_SAMPLE_MS;
        const scriptBase = this.runtimeSettings?.scripting || {};
        const useMissionPackageDirector = (Number(scriptBase.useMissionPackageDirector) || 0) > 0;
        this.useMissionPackageDirector = useMissionPackageDirector;
        this.missionPackageMeta = getMissionPackageMeta();
        this.missionPackageSummary = getMissionPackageSummary();
        this.missionPackageMetaStale = isMissionPackageMetaStale();
        this.nextMissionPackageMetaRefreshAt = this.time.now + 2000;
        this.missionDirectorEvents = this.useMissionPackageDirector
            ? getMissionDirectorEventsForMission(this.activeMission?.id || '')
            : [];
        this.missionDirectorEventState = new Map();
        this.missionAudioCues = this.useMissionPackageDirector
            ? getMissionAudioCuesForMission(this.activeMission?.id || '')
            : [];
        this.missionAudioCueIssues = this.validateMissionAudioCues(this.missionAudioCues);
        this.missionAudioCueMap = this.useMissionPackageDirector
            ? this.buildMissionAudioCueMap(this.missionAudioCues)
            : new Map();
        this.missionStoryPoints = getMissionStoryPointsForMission(
            this.activeMission?.id || '',
            this.missionLayout?.tilemap?.id || ''
        );
        this.syncMissionStoryPointState();
        this.missionDirectorEventIssues = this.validateMissionDirectorEvents(this.missionDirectorEvents);
        const missionDirectorOverrides = useMissionPackageDirector
            ? getMissionDirectorOverridesForMission(this.activeMission?.id || '')
            : null;
        const script = missionDirectorOverrides ? { ...scriptBase, ...missionDirectorOverrides } : scriptBase;
        this.directorSourceLabel = missionDirectorOverrides
            ? 'MISSION PACKAGE'
            : (useMissionPackageDirector ? 'SETTINGS (PACKAGE MISSING)' : 'SETTINGS');
        this.waveTransitionGraceMs = Math.max(0, Number(script.waveTransitionGraceMs) || 2600);
        this.pressureGraceUntil = this.time.now + this.waveTransitionGraceMs;
        this.reinforcementSystem.init(script, this.activeMission?.id);
        this.nextDoorThumpCueAt = 0;
        this.setpieceSystem.init(this.time.now);
        this.commandFormationActive = false;
        this.lastCommanderPhaseLabel = '';
        this.nextCommanderPhaseCueAt = 0;
        this.nextAmbientDustAt = 0;
        this.nextAmbientTorchDustAt = 0;
        this.nextAmbientBokehAt = 0;
        this.nextAmbientSteamAt = 0;
        this.nextAmbientZoneSteamAt = 0;
        this.fxQualityScale = 1;
        this.nextFxQualityEvalAt = 0;
        this.fxSpawnWindowStart = 0;
        this.fxSpawnedInWindow = 0;
        this.fxSpawnWindowMs = 16;
        this.combatExposurePulse = 0;
        this.alienTonePipeline = null;
        this.scanline = null;
        this.tiltShift = null;
        this.initAtmosphereZones(missionLayout);
        this.initAlarmLights(missionLayout);
        this.initRouteEventController(missionLayout);
        this.createAtmosphereOverlay();
        this.initScanline();
        this.initTiltShift();
        this.createScanlineOverlay();

        this.debugOverlay = new DebugOverlay(this);
        this.objectivesPanel = new ObjectivesPanel(this);
        this.controlsOverlay = new ControlsOverlay(this);
        this.lastTeamHealthSample = this.getTeamHealthTotal(this.squadSystem.getAllMarines());

        // --- Screen edge threat indicators (red arrows when enemies off-screen) ---
        this._edgeThreatArrows = {};
        const arrowDirs = [
            { key: 'N', x: CONFIG.GAME_WIDTH / 2, y: 12, angle: 0 },
            { key: 'S', x: CONFIG.GAME_WIDTH / 2, y: CONFIG.GAME_HEIGHT - 12, angle: Math.PI },
            { key: 'E', x: CONFIG.GAME_WIDTH - 12, y: CONFIG.GAME_HEIGHT / 2, angle: -Math.PI / 2 },
            { key: 'W', x: 12, y: CONFIG.GAME_HEIGHT / 2, angle: Math.PI / 2 },
        ];
        for (const dir of arrowDirs) {
            const arrow = this.add.triangle(dir.x, dir.y, 0, 12, 7, 0, 14, 12, 0xff2222, 0);
            arrow.setOrigin(0.5);
            arrow.setRotation(dir.angle);
            arrow.setDepth(242);
            arrow.setScrollFactor(0);
            arrow.setVisible(false);
            this._edgeThreatArrows[dir.key] = arrow;
        }
        this._edgeThreatActiveUntil = {};

        // --- Damage direction indicators (red flash on screen edges) ---
        this._damageDirectionFlashes = {};
        const flashDirs = [
            { key: 'top', x: CONFIG.GAME_WIDTH / 2, y: 0, w: CONFIG.GAME_WIDTH, h: 40 },
            { key: 'bottom', x: CONFIG.GAME_WIDTH / 2, y: CONFIG.GAME_HEIGHT - 40, w: CONFIG.GAME_WIDTH, h: 40 },
            { key: 'left', x: 0, y: CONFIG.GAME_HEIGHT / 2, w: 40, h: CONFIG.GAME_HEIGHT },
            { key: 'right', x: CONFIG.GAME_WIDTH - 40, y: CONFIG.GAME_HEIGHT / 2, w: 40, h: CONFIG.GAME_HEIGHT },
        ];
        for (const fd of flashDirs) {
            const flash = this.add.rectangle(fd.x, fd.y, fd.w, fd.h, 0xcc0000, 0);
            flash.setOrigin(fd.key === 'right' ? 0 : (fd.key === 'left' ? 0 : 0.5),
                            fd.key === 'bottom' ? 0 : (fd.key === 'top' ? 0 : 0.5));
            flash.setDepth(243);
            flash.setScrollFactor(0);
            this._damageDirectionFlashes[fd.key] = flash;
        }
        this._lastDamageSource = null;

        // --- Last stand state (all followers KIA) ---
        this._lastStandActive = false;
        this._lastStandVignette = this.add.graphics();
        this._lastStandVignette.setDepth(241);
        this._lastStandVignette.setScrollFactor(0);
        this._lastStandVignette.setAlpha(0);

        this.commanderSystem.initOverlay();
        if (useMissionPackageDirector && !missionDirectorOverrides) {
            this.showFloatingText(this.leader.x, this.leader.y - 32, 'MISSION PACKAGE NOT FOUND', '#ffb8a8');
        }

        this.endHintText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 + 32, '', {
            fontSize: '18px',
            fontFamily: '"Share Tech Mono", monospace',
            color: '#d2eeff',
            backgroundColor: '#071a2a',
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
            fontFamily: '"Share Tech Mono", monospace',
            color: '#d3f0ff',
            backgroundColor: '#082033',
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
        this.hitFlash = this.add.rectangle(
            CONFIG.GAME_WIDTH / 2,
            CONFIG.GAME_HEIGHT / 2,
            CONFIG.GAME_WIDTH,
            CONFIG.GAME_HEIGHT,
            0x6bb9ff,
            0
        );
        this.hitFlash.setDepth(243);
        this.hitFlash.setScrollFactor(0);
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
        this.initExtractionSecurityGates();
        this.objectiveSystem.createTargetMarker();

        this.weaponManager.addWeapon('shotgun');
        this.input.mouse.disableContextMenu();
        this.createEnemyHoverIndicator();
        this.createDoorHoverIndicator();
        this.targetingSystem.init();
        this.applyDefaultCursor();
        this.endRestartKeys = [];
        this.endRestartPointerWasDown = false;
        this.endRestartCooldownUntil = 0;

        this.restartKeyHandler = () => {
            if (this.stageFlow?.isEnded?.()) {
                this.requestEndRestart(this.time.now);
                return;
            }
            this.requestLeaderReload(this.time.now, { manual: true });
        };
        this.restartPointerHandler = () => {
            this.requestEndRestart(this.time.now);
        };
        this.nextMissionKeyHandler = () => {
            if (this.stageFlow.state === 'victory') this.startNextMissionIfAvailable();
        };
        this.resetCampaignKeyHandler = () => {
            this.resetCampaignProgressForDebug();
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
            // Close fullscreen map instead of pausing if it's open
            if (this.minimap?.isFullscreen) {
                this.minimap.closeFullscreen();
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
        this.adjustBeamFlashTuningHandler = (event) => {
            if (!this.debugOverlay?.visible) return;
            if (!this.runtimeSettings?.lighting) return;
            const fine = event.shiftKey ? 0.02 : 0.05;
            let changed = false;
            if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
                this.runtimeSettings.lighting.beamFlashAlphaMul = Phaser.Math.Clamp(
                    (Number(this.runtimeSettings.lighting.beamFlashAlphaMul) || 1) - fine,
                    0.2,
                    3
                );
                changed = true;
            } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
                this.runtimeSettings.lighting.beamFlashAlphaMul = Phaser.Math.Clamp(
                    (Number(this.runtimeSettings.lighting.beamFlashAlphaMul) || 1) + fine,
                    0.2,
                    3
                );
                changed = true;
            } else if (event.code === 'BracketLeft') {
                this.runtimeSettings.lighting.beamFlashWidthMul = Phaser.Math.Clamp(
                    (Number(this.runtimeSettings.lighting.beamFlashWidthMul) || 1) - fine,
                    0.4,
                    2.5
                );
                changed = true;
            } else if (event.code === 'BracketRight') {
                this.runtimeSettings.lighting.beamFlashWidthMul = Phaser.Math.Clamp(
                    (Number(this.runtimeSettings.lighting.beamFlashWidthMul) || 1) + fine,
                    0.4,
                    2.5
                );
                changed = true;
            }
            if (changed) {
                event.preventDefault?.();
                const a = Number(this.runtimeSettings.lighting.beamFlashAlphaMul) || 1;
                const w = Number(this.runtimeSettings.lighting.beamFlashWidthMul) || 1;
                this.showFloatingText(this.leader.x, this.leader.y - 44, `BEAM FLASH A:${a.toFixed(2)} W:${w.toFixed(2)}`, '#b8e6ff');
            }
        };
        this.wheelHandler = (pointer, over, dx, dy) => {
            if (this.stageFlow.isEnded() || this.isPaused || this.controlsOverlay.visible) return;
            const direction = dy > 0 ? 1 : -1;
            this.weaponManager.cycleWeapon(direction);
            this.inputHandler.consumeMenuClick();
        };
        this.toggleMapHandler = () => {
            if (this.stageFlow.isEnded()) return;
            if (this.minimap) this.minimap.toggleFullscreen();
        };
        if (this.input.keyboard) {
            this.endRestartKeys = [
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
            ];
            this.input.keyboard.on('keydown-R', this.restartKeyHandler);
            this.input.keyboard.on('keydown-N', this.nextMissionKeyHandler);
            this.input.keyboard.on('keydown-F7', this.resetCampaignKeyHandler);
            this.input.keyboard.on('keydown-F3', this.toggleDebugHandler);
            this.input.keyboard.on('keydown-P', this.togglePauseHandler);
            this.input.keyboard.on('keydown-ESC', this.togglePauseHandler);
            this.input.keyboard.on('keydown-ESCAPE', this.togglePauseHandler);
            this.input.keyboard.on('keydown-F1', this.toggleHelpHandler);
            this.input.keyboard.on('keydown-F6', this.cycleBehaviorPresetHandler);
            this.input.keyboard.on('keydown-M', this.toggleMapHandler);
            this.input.keyboard.on('keydown', this.weaponHotkeysHandler);
            this.input.keyboard.on('keydown', this.adjustBeamFlashTuningHandler);
        }
        this.input.on('pointerdown', this.restartPointerHandler);
        this.input.on('wheel', this.wheelHandler);

        this.events.once('shutdown', () => {
            if (this.input.keyboard) {
                this.input.keyboard.off('keydown-R', this.restartKeyHandler);
                this.input.keyboard.off('keydown-N', this.nextMissionKeyHandler);
                this.input.keyboard.off('keydown-F7', this.resetCampaignKeyHandler);
                this.input.keyboard.off('keydown-F3', this.toggleDebugHandler);
                this.input.keyboard.off('keydown-P', this.togglePauseHandler);
                this.input.keyboard.off('keydown-ESC', this.togglePauseHandler);
                this.input.keyboard.off('keydown-ESCAPE', this.togglePauseHandler);
                this.input.keyboard.off('keydown-F1', this.toggleHelpHandler);
                this.input.keyboard.off('keydown-F6', this.cycleBehaviorPresetHandler);
                this.input.keyboard.off('keydown-M', this.toggleMapHandler);
                this.input.keyboard.off('keydown', this.weaponHotkeysHandler);
                this.input.keyboard.off('keydown', this.adjustBeamFlashTuningHandler);
            }
            this.endRestartKeys = [];
            this.endRestartPointerWasDown = false;
            this.input.off('pointerdown', this.restartPointerHandler);
            this.input.off('wheel', this.wheelHandler);
            if (this._minimapPointerMoveHandler) this.input.off('pointermove', this._minimapPointerMoveHandler);
            if (this._minimapPointerDownHandler) this.input.off('pointerdown', this._minimapPointerDownHandler);
            this.contextMenu.hide();
            if (this.hud) this.hud.destroy();
            if (this.inputHandler) this.inputHandler.destroy();
            if (this.debugOverlay) this.debugOverlay.destroy();
            if (this.objectivesPanel) this.objectivesPanel.destroy();
            if (this.controlsOverlay) this.controlsOverlay.destroy();
            if (this.motionTracker) this.motionTracker.destroy();
            if (this.missionLog) this.missionLog.destroy();
            if (this.crtFrame) this.crtFrame.destroy();
            if (this.minimap) this.minimap.destroy();
            if (this.objectiveSystem) this.objectiveSystem.destroy();
            if (this.enemyHoverBox) this.enemyHoverBox.destroy();
            if (this.doorHoverBox) this.doorHoverBox.destroy();
            if (this.lightingOverlay) this.lightingOverlay.destroy();
            if (this.alienCorpseDebris) this.alienCorpseDebris.destroy();
            if (this.doorMenuLinkFx) this.doorMenuLinkFx.destroy();
            if (this.atmoColorGrade) this.atmoColorGrade.destroy();
            if (this.atmoVignette) this.atmoVignette.destroy();
            if (this.screenScanlineOverlay) this.screenScanlineOverlay.destroy();
            if (this.fxDotPool) {
                for (const sprite of this.fxDotPool) sprite.destroy();
            }
            if (this.fxSmokePool) {
                for (const sprite of this.fxSmokePool) sprite.destroy();
            }
            if (this.fxRingPool) {
                for (const sprite of this.fxRingPool) sprite.destroy();
            }
            if (this.fxBokehPool) {
                for (const sprite of this.fxBokehPool) sprite.destroy();
            }
            if (this.fxFlarePool) {
                for (const sprite of this.fxFlarePool) sprite.destroy();
            }
            if (this.fxDebrisPool) {
                for (const sprite of this.fxDebrisPool) sprite.destroy();
            }
            if (this.fxEmberPool) {
                for (const sprite of this.fxEmberPool) sprite.destroy();
            }
            if (this.fxSplashPool) {
                for (const sprite of this.fxSplashPool) sprite.destroy();
            }
            if (this.fxArcPool) {
                for (const sprite of this.fxArcPool) sprite.destroy();
            }
            if (this.fxMoltenPool) {
                for (const sprite of this.fxMoltenPool) sprite.destroy();
            }
            if (this.fxBloodSplatPool) {
                for (const sprite of this.fxBloodSplatPool) sprite.destroy();
            }
            if (this.muzzleLensPool) {
                for (const sprite of this.muzzleLensPool) sprite.destroy();
            }
            if (this.muzzleHexPool) {
                for (const sprite of this.muzzleHexPool) sprite.destroy();
            }
            this.fxActiveSprites = [];
            if (this.acidHazards) {
                for (const hazard of this.acidHazards) {
                    if (hazard.ring) hazard.ring.destroy();
                    if (hazard.core) hazard.core.destroy();
                    if (hazard.soak) hazard.soak.destroy();
                }
                this.acidHazards = [];
            }
            if (this.burnDecals) {
                for (const d of this.burnDecals) { if (d?.active) d.destroy(); }
                this.burnDecals = [];
            }
            if (this.roomPropGroup) {
                try {
                    if (typeof this.roomPropGroup.clear === 'function') {
                        this.roomPropGroup.clear(true, true);
                    } else if (typeof this.roomPropGroup.destroy === 'function') {
                        this.roomPropGroup.destroy(true);
                    }
                } catch (_) {
                    // Group internals can already be partially torn down during scene restarts.
                    try { this.roomPropGroup.destroy(true); } catch {}
                }
                this.roomPropGroup = null;
            }
            if (this.roomProps) {
                this.roomProps = [];
            }
            if (this.sfx) {
                this.sfx.destroy();
                this.sfx = null;
            }
            if (this.bgmUnlockHandler) {
                this.input?.off?.('pointerdown', this.bgmUnlockHandler);
                this.input?.keyboard?.off?.('keydown', this.bgmUnlockHandler);
                this.bgmUnlockHandler = null;
            }
            if (this.bgmUnlockedEventHandler && this.sound) {
                this.sound.off('unlocked', this.bgmUnlockedEventHandler);
                this.bgmUnlockedEventHandler = null;
            }
            if (this.bgm) {
                try { if (this.bgm.isPlaying) this.bgm.stop(); } catch {}
                this.bgm.destroy();
                this.bgm = null;
            }
            this.detachSquadNavDiagnosticsBridge();
            this.detachAutomationBridge();
            this.environmentLampLights = [];
            this.environmentSpotLights = [];
            this.environmentAlarmLights = [];
            this.clearInitializationOverlay();
        });
        this.createInitializationOverlay();
        this.initBackgroundMusic();
    }

    initBackgroundMusic() {
        if (!this.sound || this.sound.noAudio === true || !this.cache?.audio?.exists('bg_colony')) return;
        this.bgm = this.sound.add('bg_colony', {
            loop: true,
            volume: 0,
        });
        this.updateBackgroundMusicVolume();
        this.bgmStarted = false;
        this.bgmUnlockHandler = () => this.tryStartBackgroundMusic();
        this.input?.on?.('pointerdown', this.bgmUnlockHandler);
        this.input?.keyboard?.on?.('keydown', this.bgmUnlockHandler);
        this.bgmUnlockedEventHandler = () => this.tryStartBackgroundMusic();
        this.sound?.on?.('unlocked', this.bgmUnlockedEventHandler);
        this.tryStartBackgroundMusic();
    }

    tryStartBackgroundMusic() {
        if (!this.bgm || this.bgmStarted) return;
        if (!this.sound) return;
        if (this.sound.locked) return;
        const ctx = this.sound.context;
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        try {
            this.bgm.play();
            this.bgmStarted = true;
        } catch (_) {
            // Keep unlock handlers attached; next user gesture can retry.
        }
    }

    updateBackgroundMusicVolume() {
        if (!this.bgm) return;
        const s = this.runtimeSettings?.other || {};
        const userMul = Phaser.Math.Clamp(Number(s.audioMusicVolume) || 1, 0, 2);
        const baseVol = Phaser.Math.Clamp(0.065 * userMul, 0, 0.22);
        if (typeof this.bgm.setVolume === 'function') this.bgm.setVolume(baseVol);
        else this.bgm.volume = baseVol;
    }

    getMissionLightingOverrides() {
        const atmo = (this.missionLayout?.atmosphere && typeof this.missionLayout.atmosphere === 'object')
            ? this.missionLayout.atmosphere
            : null;
        if (!atmo) return {};
        const overrides = {};
        if (typeof atmo.ambientDarkness === 'number') overrides.ambientDarkness = atmo.ambientDarkness;
        if (typeof atmo.torchRange === 'number') overrides.torchRange = atmo.torchRange;
        if (typeof atmo.softRadius === 'number') overrides.softRadius = atmo.softRadius;
        if (typeof atmo.coreAlpha === 'number') overrides.coreAlpha = atmo.coreAlpha;
        if (typeof atmo.featherLayers === 'number') overrides.featherLayers = atmo.featherLayers;
        if (typeof atmo.featherSpread === 'number') overrides.featherSpread = atmo.featherSpread;
        if (typeof atmo.featherDecay === 'number') overrides.featherDecay = atmo.featherDecay;
        if (typeof atmo.glowStrength === 'number') overrides.glowStrength = atmo.glowStrength;
        if (typeof atmo.dustDensity === 'number') overrides.ambientDustDensity = atmo.dustDensity;
        return overrides;
    }

    applyEffectiveLightingSettings() {
        const baseLighting = {
            ...(this.runtimeSettings?.lighting || DEFAULT_RUNTIME_SETTINGS.lighting),
        };
        const missionOverrides = this.getMissionLightingOverrides();
        const zoneOverrides = (this.zoneLightingOverrides && typeof this.zoneLightingOverrides === 'object')
            ? this.zoneLightingOverrides
            : {};
        const activeOverrides = (this.activeLightingOverrides && typeof this.activeLightingOverrides === 'object')
            ? this.activeLightingOverrides
            : {};
        const effectiveLighting = {
            ...baseLighting,
            ...missionOverrides,
            ...zoneOverrides,
            ...activeOverrides,
        };
        this.runtimeSettings = this.runtimeSettings || {};
        this.runtimeSettings.lighting = effectiveLighting;
        if (this.lightingOverlay) {
            this.lightingOverlay.tuning = effectiveLighting;
        }
    }

    createInitializationOverlay() {
        this.clearInitializationOverlay();
        this.initOverlayUntil = Infinity; // wait for keypress, not a timer
        this.initOverlayStartedAt = Number(this.time?.now) || 0;
        this._initWaitingForKey = false;
        this._initDismissing = false;

        const mapName = String(this.tilemapSourceLabel || 'HADLEYS HOPE').toUpperCase();
        const missionName = String(this.activeMission?.name || this.activeMission?.id || 'MISSION').toUpperCase();
        const missionObj = String(this.activeMission?.objective || 'SEARCH AND SECURE').toUpperCase();
        const squadSize = (this.squadSystem?.followers?.length || 3) + 1;
        const dateStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

        this.initOverlayFullText = [
            'USCM TACTICAL NETWORK v4.2.1',
            `DATE: ${dateStr} UTC`,
            '',
            'BOOTING COMBAT SYSTEMS...',
            '> IFF TRANSPONDER ...... ONLINE',
            '> MOTION TRACKER ....... CALIBRATED',
            '> WEAPON SYSTEMS ....... ARMED',
            `> SQUAD LINK (${squadSize} UNITS) .. SYNC`,
            '> TACTICAL DISPLAY ..... ACTIVE',
            '',
            `MISSION: ${missionName}`,
            `MAP: ${mapName}`,
            `OBJECTIVE: ${missionObj}`,
            '',
            'ALL SYSTEMS NOMINAL',
        ].join('\n');
        this.initOverlayTypedLen = 0;
        this.initOverlayNextTypeAt = this.initOverlayStartedAt + 400;

        const c = this.add.container(0, 0);
        c.setDepth(320);
        c.setScrollFactor(0);

        const bg = this.add.rectangle(
            CONFIG.GAME_WIDTH * 0.5,
            CONFIG.GAME_HEIGHT * 0.5,
            CONFIG.GAME_WIDTH,
            CONFIG.GAME_HEIGHT,
            0x010a12,
            1
        );
        bg.setData('initOverlayArtifact', true);

        // CRT scanline overlay
        const scan = this.add.graphics();
        scan.setData('initOverlayArtifact', true);
        for (let y = 0; y < CONFIG.GAME_HEIGHT; y += 3) {
            scan.fillStyle(0x8dd9ff, 0.04);
            scan.fillRect(0, y, CONFIG.GAME_WIDTH, 1);
        }

        // Subtle border frame
        const frame = this.add.graphics();
        frame.setData('initOverlayArtifact', true);
        frame.lineStyle(1, 0x4aa4d8, 0.3);
        frame.strokeRect(40, 30, CONFIG.GAME_WIDTH - 80, CONFIG.GAME_HEIGHT - 60);
        frame.lineStyle(1, 0x4aa4d8, 0.12);
        frame.strokeRect(44, 34, CONFIG.GAME_WIDTH - 88, CONFIG.GAME_HEIGHT - 68);

        const txt = this.add.text(
            60,
            50,
            '',
            {
                fontSize: '16px',
                fontFamily: '"Share Tech Mono", "Consolas", monospace',
                color: '#7ecfff',
                align: 'left',
                lineSpacing: 6,
            }
        );
        txt.setOrigin(0, 0);
        txt.setData('initOverlayArtifact', true);

        // Block cursor
        const cursor = this.add.rectangle(
            txt.x + 2,
            txt.y + 8,
            9,
            16,
            0x7ecfff,
            0.9
        );
        cursor.setOrigin(0, 0.5);
        cursor.setData('initOverlayArtifact', true);

        // "PRESS ANY KEY" prompt (hidden until typing finishes)
        const prompt = this.add.text(
            CONFIG.GAME_WIDTH * 0.5,
            CONFIG.GAME_HEIGHT - 80,
            'PRESS ANY KEY TO CONTINUE',
            {
                fontSize: '18px',
                fontFamily: '"Share Tech Mono", "Consolas", monospace',
                color: '#7ecfff',
                align: 'center',
                shadow: { offsetX: 0, offsetY: 0, color: '#00aaff', blur: 8, stroke: true, fill: true },
            }
        );
        prompt.setOrigin(0.5);
        prompt.setAlpha(0);
        prompt.setData('initOverlayArtifact', true);
        this.initOverlayPrompt = prompt;

        // Full-screen interference rows — 4 strips covering the entire viewport
        const rowH = CONFIG.GAME_HEIGHT / 4;
        this.initOverlayFlashRows = [];
        for (let i = 0; i < 4; i++) {
            const vid = this.add.video(0, rowH * i, 'interrupt_video');
            vid.setMute(true);
            vid.play(true);
            vid.setLoop(true);
            vid.setPlaybackRate(2); // Play 2x faster
            vid.setOrigin(0, 0);
            vid.setDisplaySize(CONFIG.GAME_WIDTH, rowH);
            // Phaser resets a Video's scale to native dimensions when its texture
            // is (re)created — reapply so all 4 rows tile seamlessly edge-to-edge.
            vid.on('created', () => vid.setDisplaySize(CONFIG.GAME_WIDTH, rowH));
            vid.setAlpha(0);
            vid.setVisible(false);
            vid.setData('initOverlayArtifact', true);
            this.initOverlayFlashRows.push(vid);
        }

        c.add([bg, scan, frame, txt, cursor, prompt, ...this.initOverlayFlashRows]);
        this.initOverlayContainer = c;
        this.initOverlayText = txt;
        this.initOverlayCursor = cursor;
        this.initOverlayScan = scan;
        this.initOverlayBg = bg;

        // Allow click/key to dismiss at any time (even mid-typing)
        const earlyDismiss = () => {
            if (this._initDismissing) return;
            this._initDismissing = true;
            this.input.keyboard.off('keydown', earlyDismiss);
            this.input.off('pointerdown', earlyDismiss);
            this._playInitDismissFlash();
        };
        this.input.keyboard.on('keydown', earlyDismiss);
        this.input.on('pointerdown', earlyDismiss);
    }

    clearInitializationOverlay() {
        const allChildren = Array.isArray(this.children?.list) ? [...this.children.list] : [];
        for (const child of allChildren) {
            if (!child || typeof child.getData !== 'function') continue;
            if (child.getData('initOverlayArtifact') !== true) continue;
            child.destroy();
        }
        if (this.initOverlayContainer) this.initOverlayContainer.destroy(true);
        this.initOverlayContainer = null;
        this.initOverlayText = null;
        this.initOverlayCursor = null;
        this.initOverlayScan = null;
        this.initOverlayPrompt = null;
        this.initOverlayFlashRows = null;
        this.initOverlayBg = null;
        this._initWaitingForKey = false;
        this._initDismissing = false;
    }

    isInitializationBlockingActive(time = this.time.now) {
        return !!(this.initOverlayContainer && Number(time) < (Number(this.initOverlayUntil) || 0));
    }

    updateInitializationOverlay(time = this.time.now) {
        if (!this.initOverlayContainer || !this.initOverlayText || !this.initOverlayCursor) return;
        if (this._initDismissing) return; // fade-out in progress

        const now = Number(time) || 0;
        const fullText = String(this.initOverlayFullText || '');

        // Typewriter effect (3x faster)
        while (this.initOverlayTypedLen < fullText.length && now >= (Number(this.initOverlayNextTypeAt) || 0)) {
            const ch = fullText[this.initOverlayTypedLen];
            this.initOverlayTypedLen += 1;
            // Delays divided by 3 for 3x speed
            const delay = ch === '\n' ? 26
                : ch === '.' ? Phaser.Math.Between(1, 3)
                : fullText[this.initOverlayTypedLen - 2] === '>' ? Phaser.Math.Between(3, 7)
                : Phaser.Math.Between(5, 11);
            this.initOverlayNextTypeAt = now + delay;
        }
        const visibleText = fullText.slice(0, this.initOverlayTypedLen);
        this.initOverlayText.setText(visibleText);

        // Position cursor at end of typed text
        const lines = visibleText.split('\n');
        const lineHeight = 22;
        const lastLine = lines[lines.length - 1] || '';
        const cursorX = this.initOverlayText.x + Math.max(0, lastLine.length * 9.6);
        const cursorY = this.initOverlayText.y + Math.max(0, (lines.length - 1) * lineHeight);
        this.initOverlayCursor.setPosition(cursorX, cursorY + 8);
        this.initOverlayCursor.setAlpha(Math.sin(now * 0.006) > 0 ? 0.9 : 0.1);

        // Random interference video glitches (reduced appearance by 50% from typical glitch rates)
        if (this.initOverlayFlashRows && Math.random() < 0.015) {
            const row = Phaser.Utils.Array.GetRandom(this.initOverlayFlashRows);
            if (row) {
                row.setVisible(true);
                row.setAlpha(0.4 + Math.random() * 0.4);
                this.time.delayedCall(Phaser.Math.Between(40, 100), () => {
                    if (row && row.active && !this._initDismissing) {
                        row.setVisible(false);
                        row.setAlpha(0);
                    }
                });
            }
        }

        // Scanline drift
        if (this.initOverlayScan) {
            this.initOverlayScan.y = Math.sin(now * 0.0025) * 3;
            this.initOverlayScan.alpha = 0.78 + Math.sin(now * 0.004) * 0.12;
        }

        // Typing complete — show "PRESS ANY KEY" prompt
        const typingDone = this.initOverlayTypedLen >= fullText.length;
        if (typingDone && !this._initWaitingForKey) {
            this._initWaitingForKey = true;
            this.initOverlayCursor.setVisible(false);
            if (this.initOverlayPrompt) {
                this.tweens.add({
                    targets: this.initOverlayPrompt,
                    alpha: 1,
                    duration: 400,
                    ease: 'Sine.easeOut',
                });
                // Blink the prompt
                this.time.addEvent({
                    delay: 600,
                    callback: () => {
                        if (!this.initOverlayPrompt || this._initDismissing) return;
                        this.initOverlayPrompt.setAlpha(this.initOverlayPrompt.alpha > 0.5 ? 0.2 : 1);
                    },
                    loop: true,
                });
            }
        }
    }

    _playInitDismissFlash() {
        // Full-screen interrupt video flash, then disappear to reveal game after 1 second
        if (this.initOverlayPrompt) this.initOverlayPrompt.setVisible(false);
        if (this.initOverlayText) this.initOverlayText.setVisible(false);
        if (this.initOverlayCursor) this.initOverlayCursor.setVisible(false);

        // Show all 4 interference rows at full opacity
        const rows = this.initOverlayFlashRows || [];
        for (const row of rows) {
            row.setVisible(true);
            row.setAlpha(1);
        }

        // Clean up after 1 second (no fade out, just snap disappear)
        this.time.delayedCall(1000, () => {
            this.initOverlayUntil = 0;
            this.clearInitializationOverlay();
        });
    }

    initSquadNavDiagnosticsBridge() {
        this.squadNavDiagnostics = [];
        this.maxSquadNavDiagnostics = 320;
        if (typeof window === 'undefined') return;
        window.getSquadNavDiagnostics = (limit = 120) => {
            const n = Math.max(1, Math.min(400, Number(limit) || 120));
            return this.squadNavDiagnostics.slice(-n);
        };
        window.clearSquadNavDiagnostics = () => {
            this.squadNavDiagnostics.length = 0;
            return true;
        };
        window.getSquadNavState = () => {
            if (!this.squadSystem || !Array.isArray(this.squadSystem.followers)) return [];
            return this.squadSystem.followers.map((f) => ({
                role: f?.sprite?.roleKey || 'unknown',
                x: Math.round(Number(f?.sprite?.x) || 0),
                y: Math.round(Number(f?.sprite?.y) || 0),
                alive: !!(f?.sprite && f.sprite.active && f.sprite.alive !== false),
                stuckMs: Math.round(Number(f?.nav?.stuckMs) || 0),
                detourMode: f?.nav?.detourMode || null,
                detourUntil: Math.round(Number(f?.nav?.detourUntil) || 0),
                detourX: Math.round(Number(f?.nav?.detourX) || 0),
                detourY: Math.round(Number(f?.nav?.detourY) || 0),
            }));
        };
        window.captureSquadNavSnapshot = () => {
            if (!this.squadSystem || !Array.isArray(this.squadSystem.followers)) return [];
            const out = [];
            const now = Number(this.time?.now) || 0;
            for (const f of this.squadSystem.followers) {
                const s = f?.sprite;
                if (!s) continue;
                const targetX = Number(f?.nav?.detourX) || s.x;
                const targetY = Number(f?.nav?.detourY) || s.y;
                const blockedSegment = !!this.squadSystem?.hasBlockedTileOnSegment?.(s.x, s.y, targetX, targetY);
                const closedDoorBlock = !!this.doorManager?.hasClosedDoorBetweenWorldPoints?.(s.x, s.y, targetX, targetY);
                const tile = this.pathGrid?.worldToTile?.(s.x, s.y) || { x: 0, y: 0 };
                const openness = this.squadSystem?.getWalkableNeighborCount?.(tile.x, tile.y) ?? null;
                const leaderDist = Phaser.Math.Distance.Between(s.x, s.y, this.leader.x, this.leader.y);
                const rec = {
                    type: 'snapshot',
                    time: now,
                    role: s.roleKey || 'unknown',
                    x: s.x,
                    y: s.y,
                    targetX,
                    targetY,
                    leaderDist,
                    distToTarget: Phaser.Math.Distance.Between(s.x, s.y, targetX, targetY),
                    openness,
                    blockedSegment,
                    closedDoorBlock,
                    detourMode: f?.nav?.detourMode || null,
                    stuckMs: Number(f?.nav?.stuckMs) || 0,
                };
                this.reportFollowerNavDiagnostic(rec);
                out.push(rec);
            }
            return out;
        };
    }

    detachSquadNavDiagnosticsBridge() {
        if (typeof window === 'undefined') return;
        if (window.getSquadNavDiagnostics) delete window.getSquadNavDiagnostics;
        if (window.clearSquadNavDiagnostics) delete window.clearSquadNavDiagnostics;
        if (window.getSquadNavState) delete window.getSquadNavState;
        if (window.captureSquadNavSnapshot) delete window.captureSquadNavSnapshot;
    }

    initAutomationBridge() {
        if (typeof window === 'undefined') return;
        window.render_game_to_text = () => this.renderGameToText();
        window.advanceTime = (ms = 16) => {
            const delta = Phaser.Math.Clamp(Number(ms) || 16, 1, 1000);
            this.update((Number(this.time?.now) || 0) + delta, delta);
            return this.renderGameToText();
        };
    }

    detachAutomationBridge() {
        if (typeof window === 'undefined') return;
        if (window.render_game_to_text) delete window.render_game_to_text;
        if (window.advanceTime) delete window.advanceTime;
    }

    renderGameToText() {
        const time = Number(this.time?.now) || 0;
        const marines = this.squadSystem?.getAllMarines?.() || [];
        const enemies = this.enemyManager?.getActiveEnemies?.() || [];
        const contacts = this.enemyManager?.getMotionContacts?.() || [];
        const payload = {
            coordinateSystem: 'origin top-left, +x right, +y down, units in world pixels',
            mode: this.stageFlow?.state || 'unknown',
            timeMs: Math.round(time),
            leader: {
                x: Math.round(Number(this.leader?.x) || 0),
                y: Math.round(Number(this.leader?.y) || 0),
                health: Math.round(Number(this.leader?.health) || 0),
                maxHealth: Math.round(Number(this.leader?.maxHealth) || 0),
                facingRad: Number(this.leader?.facingAngle || this.leader?.rotation || 0).toFixed(3),
            },
            squad: marines.map((m) => ({
                role: String(m?.roleKey || (m === this.leader ? 'leader' : 'marine')),
                x: Math.round(Number(m?.x) || 0),
                y: Math.round(Number(m?.y) || 0),
                hp: Math.round(Number(m?.health) || 0),
                alive: !(m?.alive === false || m?.active === false),
                morale: Math.round(Number(m?.morale) || 0),
            })),
            hostiles: enemies.slice(0, 24).map((e) => ({
                type: String(e?.enemyType || 'unknown'),
                x: Math.round(Number(e?.x) || 0),
                y: Math.round(Number(e?.y) || 0),
                hp: Math.round(Number(e?.health) || 0),
                visible: e?.detected === true,
            })),
            tracker: {
                active: this.isMotionTrackerActive?.(time) === true,
                contacts: contacts.slice(0, 12).map((c) => ({
                    x: Math.round(Number(c?.x) || 0),
                    y: Math.round(Number(c?.y) || 0),
                    confidence: Number((Number(c?.confidence) || 0).toFixed(2)),
                    speed: Math.round(Number(c?.speed) || 0),
                    echo: c?.isEcho === true,
                })),
            },
            combat: {
                pressure: Number((Number(this.combatMods?.pressure) || 0).toFixed(2)),
                state: String(this.combatMods?.state || 'manual'),
            },
            objective: {
                completed: Number(this.lastObjectiveProgressCount) || 0,
                total: Number(this.activeMission?.objectives?.length) || 0,
            },
        };
        return JSON.stringify(payload);
    }

    reportFollowerNavDiagnostic(entry = {}) {
        if (!Array.isArray(this.squadNavDiagnostics)) this.squadNavDiagnostics = [];
        const payload = {
            t: Math.round(Number(entry.time) || Number(this.time?.now) || 0),
            type: String(entry.type || 'nav'),
            role: String(entry.role || 'unknown'),
            x: Math.round(Number(entry.x) || 0),
            y: Math.round(Number(entry.y) || 0),
            targetX: Number.isFinite(Number(entry.targetX)) ? Math.round(Number(entry.targetX)) : null,
            targetY: Number.isFinite(Number(entry.targetY)) ? Math.round(Number(entry.targetY)) : null,
            detourX: Number.isFinite(Number(entry.detourX)) ? Math.round(Number(entry.detourX)) : null,
            detourY: Number.isFinite(Number(entry.detourY)) ? Math.round(Number(entry.detourY)) : null,
            distToTarget: Number.isFinite(Number(entry.distToTarget)) ? Math.round(Number(entry.distToTarget)) : null,
            leaderDist: Number.isFinite(Number(entry.leaderDist)) ? Math.round(Number(entry.leaderDist)) : null,
            moved: Number.isFinite(Number(entry.moved)) ? Number(entry.moved).toFixed(2) : null,
            openness: Number.isFinite(Number(entry.openness)) ? Number(entry.openness) : null,
            blockedSegment: entry.blockedSegment === true,
            closedDoorBlock: entry.closedDoorBlock === true,
            detourMode: entry.detourMode || null,
            stuckMs: Number.isFinite(Number(entry.stuckMs)) ? Math.round(Number(entry.stuckMs)) : null,
        };
        this.squadNavDiagnostics.push(payload);
        const max = Math.max(80, Number(this.maxSquadNavDiagnostics) || 320);
        if (this.squadNavDiagnostics.length > max) {
            this.squadNavDiagnostics.splice(0, this.squadNavDiagnostics.length - max);
        }
    }

    findNearestWalkableWorld(worldX, worldY, radiusTiles = 2) {
        if (!this.pathGrid) return { x: worldX, y: worldY };
        const t = this.pathGrid.worldToTile(worldX, worldY);
        if (this.pathGrid.isWalkable(t.x, t.y)) return { x: worldX, y: worldY };
        let best = null;
        let bestDist = Infinity;
        for (let r = 1; r <= radiusTiles; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = t.x + dx;
                    const ny = t.y + dy;
                    if (!this.pathGrid.isWalkable(nx, ny)) continue;
                    const candidate = this.pathGrid.tileToWorld(nx, ny);
                    const cdx = candidate.x - worldX;
                    const cdy = candidate.y - worldY;
                    const d2 = cdx * cdx + cdy * cdy;
                    if (d2 < bestDist) {
                        best = candidate;
                        bestDist = d2;
                    }
                }
            }
            if (best) break;
        }
        return best || { x: worldX, y: worldY };
    }

    initStagingSafeArea(spawnTile) {
        if (!this.pathGrid || !spawnTile) {
            this.stagingSafeArea = null;
            return;
        }
        const center = this.pathGrid.tileToWorld(spawnTile.x, spawnTile.y);
        const radius = CONFIG.TILE_SIZE * 3.2;
        this.stagingSafeArea = {
            active: true,
            cleared: false,
            centerX: center.x,
            centerY: center.y,
            radius,
            unlockDistance: radius + CONFIG.TILE_SIZE * 0.9,
        };
    }

    isWorldInsideStagingSafeArea(worldX, worldY, pad = 0) {
        const s = this.stagingSafeArea;
        if (!s || s.active !== true) return false;
        const dx = (Number(worldX) || 0) - s.centerX;
        const dy = (Number(worldY) || 0) - s.centerY;
        const r = Math.max(0, s.radius + (Number(pad) || 0));
        return (dx * dx + dy * dy) <= (r * r);
    }

    isStagingSafeActive(time = this.time.now) {
        const s = this.stagingSafeArea;
        if (!s || s.active !== true) return false;
        const d = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, s.centerX, s.centerY);
        if (d > s.unlockDistance) {
            s.active = false;
            if (!s.cleared) {
                s.cleared = true;
                this.showFloatingText(this.leader.x, this.leader.y - 24, 'LEAVING STAGING AREA', '#9fd6ff');
            }
            return false;
        }
        return true;
    }

    enforceStagingAreaSafety(time = this.time.now) {
        if (!this.isStagingSafeActive(time)) return;
        if (!this.enemyManager || !Array.isArray(this.enemyManager.enemies)) return;
        const s = this.stagingSafeArea;
        for (const enemy of this.enemyManager.enemies) {
            if (!enemy || !enemy.active) continue;
            const dx = enemy.x - s.centerX;
            const dy = enemy.y - s.centerY;
            const dist = Math.hypot(dx, dy);
            if (dist > s.radius - 6) continue;
            const nx = dist > 0.0001 ? (dx / dist) : 1;
            const ny = dist > 0.0001 ? (dy / dist) : 0;
            const pushX = s.centerX + nx * (s.radius + CONFIG.TILE_SIZE * 0.4);
            const pushY = s.centerY + ny * (s.radius + CONFIG.TILE_SIZE * 0.4);
            const snap = this.findNearestWalkableWorld(pushX, pushY, 4);
            enemy.x = snap.x;
            enemy.y = snap.y;
            if (enemy.body && typeof enemy.body.setVelocity === 'function') {
                enemy.body.setVelocity(nx * (enemy.stats?.speed || 120), ny * (enemy.stats?.speed || 120));
            }
            enemy.alertUntil = Math.max(Number(enemy.alertUntil) || 0, time + 600);
            enemy.investigatePoint = { x: snap.x + nx * CONFIG.TILE_SIZE, y: snap.y + ny * CONFIG.TILE_SIZE, power: 0.9 };
            enemy.investigateUntil = time + 800;
        }
    }

    update(time, delta) {
        // Cap delta to 100ms (10fps) to prevent huge jumps when returning to tab.
        // This ensures physics, AI and FX systems don't try to "catch up" over
        // several seconds in a single frame, which causes massive lag spikes.
        const cappedDelta = Math.min(delta, 100);

        if (this.initOverlayContainer) {
            this.updateInitializationOverlay(time);
            if (this.isInitializationBlockingActive(time)) {
                this.updateAlienHoverIndicator(null);
                return;
            }
        }

        if (this.stageFlow.isEnded()) {
            this.pollEndRestartInput(time);
            this.updateAlienHoverIndicator(null);
            return;
        }
        if (this.controlsOverlay.visible) {
            this.updateAlienHoverIndicator(null);
            this.updateDebugOverlay(time);
            return;
        }
        if (this.isPaused) {
            this.updateAlienHoverIndicator(null);
            this.updateDebugOverlay(time);
            return;
        }
        try {
            this._updateImpl(time, cappedDelta);
        } catch (err) {
            // Prevent a single frame error from killing the game loop
            if (!this._lastUpdateError || time - this._lastUpdateErrorAt > 5000) {
                console.error('[GameScene] update error:', err);
                this._lastUpdateError = err;
                this._lastUpdateErrorAt = time;
                this._updateErrorCount = (this._updateErrorCount || 0) + 1;
            }
            // Keep running and log to console only; avoid dev overlay popup interrupting play.
        }
    }

    _updateImpl(time, delta) {
        // Reset error counter on successful frame
        this._updateErrorCount = 0;
        this.resetAlienHitFxBudget(time);

        this.inputHandler.update();
        this.updateCursorState();
        this.targetingSystem.update(time, delta);
        
        // Update per-marine ammo and reloads
        for (const [role, state] of this.marineAmmo.entries()) {
            const marine = role === 'leader' ? this.leader : this.squadSystem.getFollowerByRole(role);
            if (!marine || !marine.active || !marine.alive) continue;

            if (state.isReloading && time >= state.reloadUntil) {
                state.isReloading = false;
                state.magsLeft = Math.max(0, (Number(state.magsLeft) || 0) - 1);
                state.currentMag = state.magSize;
                state.displayedAmmo = state.magSize;
                state.pulseHeat = 0;
                state.isOverheated = false;
                state.overheatCooldownUntil = 0;
                this.hud.refreshNow();
            }
        }

        this.missionLog.update(time, delta);
        this.refreshRuntimeSettings(time);
        this.refreshMissionPackageRuntimeMeta(time);
        this.updateMissionStoryPoints(time);
        this._updateZoneLighting();
        this.updateFxQualityBudget(time);
        this.updateFxSprites(delta);
        this.atmosphereSystem.updateAmbientEffects(time, delta);
        this.mistSystem.update(time, delta);
        if (this.hiveGrowthSystem) this.hiveGrowthSystem.update(time, delta);
        this.resolveActionLockConflicts(time);
        this.updateOverheatBar(time);
        this.updateHealActionLock(time);
        const trackerLeaderBusy = false;
        const healLeaderBusy = this.isLeaderHealBusy(time);

        const pointer = this.inputHandler.getPointerWorldPosition();
        this.leader.facePosition(pointer.worldX, pointer.worldY);
        this.leader.updateFacing(delta);

        // Sprint ("hump it") — double-click activates, 3s duration, 10s cooldown
        if (this.inputHandler.consumeSprint() && time >= (this._sprintCooldownUntil || 0) && !this._sprintActive) {
            this._sprintActive = true;
            this._sprintUntil = time + this._sprintDuration;
            this._baseMoveSpeed = this.leader.moveSpeed;
            this.leader.moveSpeed = this._baseMoveSpeed * this._sprintSpeedMul;
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'HUMP IT!', '#ffff44');
        }
        if (this._sprintActive && time >= this._sprintUntil) {
            this._sprintActive = false;
            this._sprintCooldownUntil = time + this._sprintCooldown;
            this.leader.moveSpeed = this._baseMoveSpeed || (this.runtimeSettings.player.leaderSpeed * TEAM_SPEED_SCALE);
        }

        const rightClick = this.inputHandler.consumeRightClick();
        const ignoreMenuEchoClick = rightClick && ((this.time.now || 0) < (this.menuActionGraceUntil || 0));
        if (rightClick && !ignoreMenuEchoClick && !trackerLeaderBusy && !healLeaderBusy) {
            // Heal / monitor actions are triggered exclusively via the HUD portrait card
            // buttons — clicking a marine sprite in the world no longer opens a context menu.
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

        // Stop leader movement while firing — plant feet when RMB held
        if (this.inputHandler.isFiring && this.leader.currentPath) {
            this.movementSystem.clearPath(this.leader);
        }
        this.movementSystem.update(this.leader, delta);
        this.doorActionSystem.update(this.leader, delta);
        let marines = this.squadSystem.getAllMarines();
        this.updateHealingSystem(time, delta, marines);
        this.updateVentSwarmAmbush(time, marines);
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
        this.resolveAlienMarineSeparation(time, marines);
        this.updateAlienWoundTrails(time);
        this.enforceStagingAreaSafety(time);
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
        this.combatMods = this.updateCombatDirector(time, delta, marines);

        // Dynamic alien spawning based on CombatDirector idle tension
        if (this.combatDirector && this.enemyManager && !this.noAliens && this.stageFlow?.state !== 'extract') {
            const dynamicCount = this.combatDirector.getDynamicSpawnCount(time);
            if (dynamicCount > 0) {
                const spawned = this.enemyManager.spawner.spawnDynamic(dynamicCount, marines, 1);
                if (spawned > 0) {
                    this.combatDirector.recordDynamicSpawn(time, spawned);
                }
            }
        }

        const lightSources = this.buildMarineLightSources(marines);
        this.enemyManager.updateDetection(lightSources, time, {
            delta,
            trackerActive: true,
            camera: this.cameras.main,
            marines,
        });
        const threat = this.enemyManager.getPriorityThreat(this.leader.x, this.leader.y, this.inputHandler.isFiring);
        this.updateCommandFormationDirective(time);
        this.squadSystem.update(delta, time, { threat });
        marines = this.squadSystem.getAllMarines();
        // Y-depth sort: entities lower on screen render in front (isometric depth illusion).
        const mapH = (this.missionLayout?.tilemap?.height || CONFIG.MAP_HEIGHT_TILES) * CONFIG.TILE_SIZE;
        const depthY = (mapH > 0) ? 1 / mapH : 0;
        this.leader.setDepth(9.5 + this.leader.y * depthY * 4);
        for (const m of marines) m.setDepth(9 + m.y * depthY * 4);
        for (const e of this.enemyManager.getActiveEnemies()) e.setDepth(10 + e.y * depthY * 4);
        this.updateAcidHazards(time, delta, marines);
        this.updateAcidSpecular(time);
        // ── Bullet tracer trails ──
        if (this.bulletPool) {
            if (!this._tracerGfx) {
                this._tracerGfx = this.add.graphics();
                this._tracerGfx.setDepth(14);
            }
            this._tracerGfx.clear();
            this.bulletPool.drawTracerTrails(this._tracerGfx);
        }
        this.updateFollowerCombat(time, delta, marines);
        // Reaction runs AFTER FollowerCombatSystem so it can override the target just selected.
        this._updateFollowerReaction(time, marines);
        this.atmosphereSystem.updateMarineRadioChatter(time, marines);
        this.atmosphereSystem.updateAtmosphereIncidents(time, marines);
        this.updateLowAmmoCallouts(time);
        if (this.hud && typeof this.hud.updateSquad === 'function') {
            this.hud.updateSquad(marines, time, delta);
        }
        this.motionTracker.update(this.leader.x, this.leader.y, this.leader.facingAngle ?? this.leader.rotation, this._getAugmentedMotionContacts(time), time);
        this.updateTrackerAudioCue(time);

        // Update minimap
        if (this.minimap) {
            this.minimap.drawMap(this.pathGrid);
            const followers = this.squadSystem?.getFollowers?.() || [];
            const contacts = this.enemyManager?.getMotionContacts?.() || [];
            const trActive = false;
            // Pass objective target to minimap for marker display
            const objTarget = this.objectiveSystem?.objectiveTargetMarker;
            if (objTarget && objTarget.visible) {
                this.minimap.setObjectiveTarget({ x: objTarget.x, y: objTarget.y });
            } else {
                this.minimap.setObjectiveTarget(null);
            }
            this.minimap.updateBlips(this.leader, followers, trActive, contacts, time, this.enemyManager.getAliveEnemies());
            this.minimap.centerOnPlayer(this.leader);
            if (this.minimap.isFullscreen) {
                this.minimap.updateFullscreenBlips(this.leader, followers, trActive, contacts, time, this.enemyManager.getAliveEnemies());
            }
        }
        const aliveHostilesBeforeStageFlow = this.enemyManager.getAliveCount();
        const allowBackgroundSpawnsThisFrame = aliveHostilesBeforeStageFlow > 0;
        if (!this.noAliens && allowBackgroundSpawnsThisFrame) this.reinforcementSystem.update(time, marines);
        if (!this.noAliens && allowBackgroundSpawnsThisFrame) this.setpieceSystem.updateCorridorSetpieces(time, marines);
        if (allowBackgroundSpawnsThisFrame) this.updateMissionDirectorEvents(time, marines);
        this.commanderSystem.updateOverlay(time, marines);

        const shadowCasters = this.buildMarineShadowCasters(marines).concat(this.enemyManager.getShadowCasters());
        // Reuse cached lighting target array to avoid per-frame allocations.
        if (!this._lightingEntities) this._lightingEntities = [];
        const allEntities = this._lightingEntities;
        allEntities.length = 0;
        allEntities.push(this.leader);
        for (let i = 0; i < marines.length; i++) {
            if (marines[i] !== this.leader) allEntities.push(marines[i]);
        }
        const activeEnemies = this.enemyManager.getActiveEnemies();
        for (let i = 0; i < activeEnemies.length; i++) allEntities.push(activeEnemies[i]);
        if (Array.isArray(this.roomProps)) {
            for (let i = 0; i < this.roomProps.length; i++) {
                const sprite = this.roomProps[i]?.sprite;
                if (sprite) allEntities.push(sprite);
            }
        }
        if (Array.isArray(this.largeTextureSprites)) {
            for (let i = 0; i < this.largeTextureSprites.length; i++) {
                const sprite = this.largeTextureSprites[i];
                if (sprite) allEntities.push(sprite);
            }
        }
        if (Array.isArray(this.doorManager?.doorGroups)) {
            for (let groupIdx = 0; groupIdx < this.doorManager.doorGroups.length; groupIdx++) {
                const group = this.doorManager.doorGroups[groupIdx];
                const doors = Array.isArray(group?.doors) ? group.doors : [];
                for (let doorIdx = 0; doorIdx < doors.length; doorIdx++) {
                    const door = doors[doorIdx];
                    if (!door) continue;
                    allEntities.push(door);
                    if (door.crackOverlay) allEntities.push(door.crackOverlay);
                }
            }
        }
        // --- Emergency lighting tint driven by CombatDirector state ---
        if (this.lightingOverlay && this.combatMods) {
            const cdState = this.combatMods.state;
            let targetR = 1.0, targetG = 1.0, targetB = 1.0;
            if (cdState === 'peak') {
                // Strong amber emergency lighting with pulsing
                const peakPulse = 0.85 + 0.15 * Math.sin((time || 0) * 0.005);
                targetR = 1.15 * peakPulse; targetG = 0.72 * peakPulse; targetB = 0.38;
            } else if (cdState === 'build') {
                // Subtle amber warning during build phase
                targetR = 1.04; targetG = 0.92; targetB = 0.78;
            } else if (cdState === 'release') {
                // Cool blue relief lighting
                targetR = 0.7; targetG = 0.8; targetB = 1.0;
            }
            // Smooth lerp toward target tint (~1.2s transition for faster response)
            const tintLerp = Math.min(1, (delta / 1000) * 0.9);
            if (!this._emergencyTintR) { this._emergencyTintR = 1; this._emergencyTintG = 1; this._emergencyTintB = 1; }
            this._emergencyTintR += (targetR - this._emergencyTintR) * tintLerp;
            this._emergencyTintG += (targetG - this._emergencyTintG) * tintLerp;
            this._emergencyTintB += (targetB - this._emergencyTintB) * tintLerp;
            this.lightingOverlay.setAmbientTint(this._emergencyTintR, this._emergencyTintG, this._emergencyTintB);
        }
        this.lightingOverlay.update(lightSources, shadowCasters, allEntities);
        if (this.alienCorpseDebris) this.alienCorpseDebris.update(time, delta);

        const leaderPulseTriggerHeld = !!(
            this.inputHandler.isFiring
            && !trackerLeaderBusy
            && !healLeaderBusy
            && (this.weaponManager?.currentWeaponKey || 'pulseRifle') === 'pulseRifle'
        );
        this.weaponManager.setPulseTriggerHeld(leaderPulseTriggerHeld);
        this.weaponManager.update(delta, time);
        this.syncLeaderPulseAmmoState();

        // Mobile auto-fire: check if any active enemy is within aim cone
        if (this.inputHandler._isTouchDevice && this.leader) {
            const aimAngle = this.leader.facingAngle ?? this.leader.rotation;
            const coneDeg = 25; // ±25 degree cone
            const coneRad = coneDeg * Math.PI / 180;
            const maxRange = 500;
            let enemyInSights = false;
            const activeEnemies = this.enemyManager?.getActiveEnemies?.() || [];
            for (let i = 0; i < activeEnemies.length; i++) {
                const e = activeEnemies[i];
                if (!e || !e.active || e.isDying) continue;
                const dx = e.x - this.leader.x;
                const dy = e.y - this.leader.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxRange) continue;
                const angleToEnemy = Math.atan2(dy, dx);
                let diff = angleToEnemy - aimAngle;
                // Normalize to -PI..PI
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) <= coneRad) {
                    enemyInSights = true;
                    break;
                }
            }
            this.inputHandler._mobileAutoFire = enemyInSights;
        }

        const ammoState = this.marineAmmo.get('leader');
        if (this.inputHandler.isFiring && !trackerLeaderBusy && !healLeaderBusy) {
            const leaderDynamics = this.computeLeaderWeaponDynamics(time, marines);
            const weaponKey = leaderDynamics.weaponKey;
            const weaponDef = this.weaponManager.getRuntimeWeaponDef(weaponKey);
            const usesPulseMagazine = weaponDef?.ammoType === 'unlimited';
            const spreadMul = leaderDynamics.spreadMul;
            const fireRateMul = leaderDynamics.fireRateMul;
            const angleJitterBase = weaponKey === 'shotgun'
                ? 0.034
                : (weaponKey === 'pistol' ? 0.016 : 0.023);
            const crowdNorm = leaderDynamics.crowdNorm;
            const recentHitNorm = leaderDynamics.recentHitNorm;
            const momentum = leaderDynamics.momentum;
            const moveNorm = leaderDynamics.moveNorm;
            const stability = leaderDynamics.stability;
            const baseAngle = this.leader.facingAngle ?? this.leader.rotation;
            let fireAngle = this.computeLeaderAimAssistAngle(baseAngle, leaderDynamics);
            const leaderHitChance = this.computeMarineHitChance('leader', this.leader);
            if (Math.random() > leaderHitChance) {
                fireAngle += this.getMissAngleOffset('leader', leaderHitChance);
            }

            const canFireLeader = !ammoState.isReloading
                && (!usesPulseMagazine || this.weaponManager.pulseAmmo > 0);

            if (canFireLeader) {
                const fired = this.weaponManager.fire(this.leader.x, this.leader.y, fireAngle, time, {
                    ownerRoleKey: 'leader',
                    fireRateMul,
                    angleJitter: angleJitterBase * spreadMul,
                    stability,
                });
                if (!fired && !usesPulseMagazine) {
                    // Limited ammo weapon empty — dry fire click
                    const wDef = this.weaponManager.getRuntimeWeaponDef(weaponKey);
                    if (wDef?.ammoType === 'limited' && (this.weaponManager.ammo[weaponKey] || 0) <= 0) {
                        if (this.sfx) this.sfx.playEmptyClick();
                    }
                }
                if (fired) {
                    if (usesPulseMagazine) {
                        ammoState.lastFiredAt = time;
                        ammoState.isFiring = true;
                        this.syncLeaderPulseAmmoState();
                    } else {
                        ammoState.isFiring = false;
                    }
                    this.enemyManager.notifyGunfire(this.leader.x, this.leader.y, time, 1.2);
                    this.eventBus?.emit('playerFired', { x: this.leader.x, y: this.leader.y, weaponKey, time });
                    if (weaponKey === 'pulseRifle') this.lastLeaderPulseShotAt = time;
                    this.applyLeaderShotKick(weaponKey, time, {
                        moveNorm,
                        pressure: leaderDynamics.pressure,
                        momentum,
                    });
                    this.reinforcementSystem.noteGunfireEvent(time);
                    this.reinforcementSystem.reinforcementAt = time; 
                    this.reinforcementSystem.markCombatAction(time);
                    this.reinforcementSystem.tryGunfireReinforcement(time, this.leader.x, this.leader.y, marines);
                    this.emitWeaponFlashAndStimulus(
                        this.leader.x,
                        this.leader.y,
                        fireAngle,
                        time,
                        weaponKey,
                        { marine: this.leader }
                    );
                    this.hud.refreshNow();
                }
            } else if (usesPulseMagazine && this.weaponManager.pulseAmmo <= 0) {
                if (this.sfx) this.sfx.playEmptyClick();
                ammoState.isFiring = false;
            }
        } else {
            if (ammoState.isFiring) {
                ammoState.isFiring = false;
            }
        }
        this.emitContinuousLeaderPulseFlash(time);
        this.updateLeaderWeaponAudioState(time, trackerLeaderBusy, healLeaderBusy);

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
        this.updateExtractionSecurityGates(missionState, time);
        this.updateTimedRouteEvents(time, stage, missionState);
        
        this.updateObjectives(missionState);
        this.lastMissionState = missionState;
        if (missionState.requestQueenSpawn) {
            this.spawnMissionQueen(missionState.queenSpawnWorld);
        }

        const objectiveTargetWorld = missionState.readyForExtraction
            ? this.extractionWorldPos
            : missionState.targetWorld;
        this.objectiveSystem.updateTargetMarker(objectiveTargetWorld, time);

        if (stage === 'extract') {
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
            this.extractionRing.setVisible(false);
            this.extractionLabel.setVisible(false);
        }

        this.updateStageUI(stage, missionState);
        this.updateCombatFeedback(time);
        this.sampleCombatTelemetry(time);
        this.updateAtmosphereOverlay(time);
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

    resolveAlienMarineSeparation(time = this.time.now, marines = null) {
        if (!this.enemyManager) return;
        const allMarines = Array.isArray(marines) && marines.length > 0
            ? marines
            : (this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader]);
        const enemies = this.enemyManager.getActiveEnemies();
        if (!Array.isArray(enemies) || enemies.length <= 0) return;
        for (const enemy of enemies) {
            if (!enemy || !enemy.active || enemy.enemyType === 'facehugger') continue;
            const er = Math.max(10, Number(enemy.body?.halfWidth) || 14);
            for (const marine of allMarines) {
                if (!marine || marine.active === false || marine.alive === false) continue;
                const mr = marine === this.leader
                    ? Math.max(10, Number(this.leader.body?.halfWidth) || 14)
                    : 17;
                const minDist = er + mr + 6;
                const dx = enemy.x - marine.x;
                const dy = enemy.y - marine.y;
                const d = Math.max(0.0001, Math.hypot(dx, dy));
                if (d >= minDist) continue;
                const nx = dx / d;
                const ny = dy / d;
                const push = Math.min(16, minDist - d + 1);
                enemy.x += nx * push;
                enemy.y += ny * push;
                enemy.navRecoverUntil = Math.max(Number(enemy.navRecoverUntil) || 0, (Number(time) || 0) + 220);
                // Before pushing, verify target tile is walkable
                const recoverX2 = enemy.x + nx * (CONFIG.TILE_SIZE * 0.9);
                const recoverY2 = enemy.y + ny * (CONFIG.TILE_SIZE * 0.9);
                if (this.pathGrid) {
                    const rt2 = this.pathGrid.worldToTile(recoverX2, recoverY2);
                    if (!this.pathGrid.isWalkable(rt2.x, rt2.y)) {
                        const perpDirs2 = [[-ny, nx], [ny, -nx]];
                        let found2 = false;
                        for (const [px, py] of perpDirs2) {
                            const altX2 = enemy.x + px * (CONFIG.TILE_SIZE * 0.9);
                            const altY2 = enemy.y + py * (CONFIG.TILE_SIZE * 0.9);
                            const at2 = this.pathGrid.worldToTile(altX2, altY2);
                            if (this.pathGrid.isWalkable(at2.x, at2.y)) {
                                enemy.navRecoverTargetX = altX2;
                                enemy.navRecoverTargetY = altY2;
                                found2 = true;
                                break;
                            }
                        }
                        if (!found2) continue; // skip this push entirely
                    } else {
                        enemy.navRecoverTargetX = recoverX2;
                        enemy.navRecoverTargetY = recoverY2;
                    }
                } else {
                    enemy.navRecoverTargetX = recoverX2;
                    enemy.navRecoverTargetY = recoverY2;
                }
                if (enemy.body) {
                    enemy.body.setVelocity(
                        (Number(enemy.body.velocity.x) || 0) * 0.7,
                        (Number(enemy.body.velocity.y) || 0) * 0.7
                    );
                    enemy.body.updateFromGameObject?.();
                }
            }
        }
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

    onEnemyKilled(enemy, projectile = null, time = this.time.now) {
        this.lastTeamKillAt = time;

        // Suppressive Fire: nearby xenos are momentarily slowed when a kill happens.
        const suppressRange = CONFIG.TILE_SIZE * 3.5;
        const enemies = this.enemyManager.enemies;
        for (const e of enemies) {
            if (!e.active || e === enemy) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, e.x, e.y);
            if (d < suppressRange) {
                const intensity = 1.0 - (d / suppressRange);
                e.suppressUntil = time + Phaser.Math.Between(400, 800) * intensity;
                e.suppressSlow = 0.5 * intensity;
            }
        }

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
        return this.objectiveSystem.countCompletedObjectives(missionState);
    }

    getKillMomentum(time = this.time.now) {
        const age = Math.max(0, time - (Number(this.lastTeamKillAt) || -100000));
        if (age > 2600) return 0;
        return Phaser.Math.Clamp(1 - age / 2600, 0, 1);
    }

    updateCombatDirector(time, delta, marines) {
        if (!this.combatDirector) return null;
        const scriptEnabled = (Number(this.runtimeSettings?.scripting?.directorEnabled) || 0) > 0;
        const directorEnabled = (Number(this.runtimeSettings?.director?.enabled) || 0) > 0;
        if (!scriptEnabled || !directorEnabled) {
            return this.applyDirectorModifierOverrides({
                state: 'manual',
                pressure: 0.25,
                enemyAggressionMul: 1,
                enemyFlankMul: 1,
                enemyDoorDamageMul: 1,
                marineAccuracyMul: 1,
                marineJamMul: 1,
                marineReactionMul: 1,
            }, time);
        }
        const tickMs = Number(this.runtimeSettings?.scripting?.eventTickMs) || 80;
        if ((time - this.lastDirectorUpdateAt) < tickMs) {
            return this.applyDirectorModifierOverrides(this.combatMods || this.combatDirector.getModifiers(), time);
        }
        this.lastDirectorUpdateAt = time;
        const teamHealth = this.getTeamHealthTotal(marines);
        const teamHealthPct = this.getTeamHealthPct(marines);
        let recentDamage = 0;
        if ((time - this.lastTeamDamageSampleAt) >= this.teamDamageSampleWindowMs) {
            recentDamage = Math.max(0, this.lastTeamHealthSample - teamHealth);
            this.lastTeamHealthSample = teamHealth;
            this.lastTeamDamageSampleAt = time;
        }
        const hostilesOnScreen = this.enemyManager.getOnScreenHostileCount(this.cameras.main);
        const engaged = this.inputHandler.isFiring || hostilesOnScreen > 0 || recentDamage > 0;
        const telemetry = {
            hostilesOnScreen,
            teamDamageRecent: recentDamage,
            doorPressure: this.enemyManager.sampleDoorPressure ? this.enemyManager.sampleDoorPressure(time) : 0,
            firing: this.inputHandler.isFiring,
            engaged,
            teamHealthPct,
            avgMorale: this.getAverageMorale(marines),
        };
        const baseMods = this.combatDirector.update(time, delta, telemetry);
        return this.applyDirectorModifierOverrides(baseMods, time);
    }

    applyDirectorModifierOverrides(baseMods, time = this.time.now) {
        const mods = baseMods ? { ...baseMods } : {};
        const override = this.directorOverrideMods;
        if (!override || typeof override !== 'object') return mods;
        if (this.directorOverrideUntil > 0 && time > this.directorOverrideUntil) {
            this.directorOverrideMods = null;
            this.directorOverrideUntil = 0;
            return mods;
        }
        for (const [k, v] of Object.entries(override)) {
            if (!Number.isFinite(v)) continue;
            mods[k] = Number(v);
        }
        return mods;
    }

    showDoorContextMenu(doorGroup, worldX, worldY, meta = null) {
        const actions = doorGroup.getAvailableActions();
        if (actions.length === 0) return;

        this.contextMenu.show(worldX, worldY, actions, (action) => {
            this.menuActionGraceUntil = (this.time.now || 0) + 260;
            this.inputHandler.consumeMenuClick();
            const queued = this.doorActionSystem.queueAction(this.leader, doorGroup, action);
            if (!queued) {
                this.showFloatingText(this.leader.x, this.leader.y - 22, 'Cannot queue action from this side', '#8fcfff');
            }
        }, meta);
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
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'HEAL IN PROGRESS', '#8fcfff');
            return;
        }
        this.contextMenu.show(worldX, worldY, [{ label: 'Order Heal', action: 'heal_target' }], (action) => {
            this.menuActionGraceUntil = (this.time.now || 0) + 260;
            if (action !== 'heal_target') return;
            const ok = this.startHealAction(targetMarine, this.time.now, { auto: false, preferredRoleKey: 'leader' });
            if (!ok) {
                const reason = this.lastHealFailReason || 'NO HEALER AVAILABLE';
                this.showFloatingText(this.leader.x, this.leader.y - 22, reason, '#8fcfff');
            }
        });
    }

    pickHealOperator(preferredRoleKey = 'leader') {
        const now = this.time.now;
        const roleCandidates = [preferredRoleKey, 'medic', 'tech', 'heavy']
            .filter((roleKey, index, list) => roleKey && roleKey !== 'leader' && list.indexOf(roleKey) === index);

        for (const roleKey of roleCandidates) {
            const actor = this.squadSystem?.getFollowerByRole?.(roleKey);
            if (!actor || actor.active === false || actor.alive === false) continue;
            if (this.isMarineHealBusy(actor, now)) continue;
            if (this.squadSystem?.isRoleTaskActive?.(roleKey)) continue;
            return { actor, roleKey };
        }

        if (this.isLeaderHealBusy(now)) return null;
        return { actor: this.leader, roleKey: null };
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
        this.lastHealFailReason = '';
        if (!targetMarine || targetMarine.active === false || targetMarine.alive === false) {
            this.lastHealFailReason = 'INVALID HEAL TARGET';
            return false;
        }
        if (this.healAction) {
            this.lastHealFailReason = 'HEAL IN PROGRESS';
            return false;
        }
        if ((Number(this.medicPacks) || 0) <= 0) {
            this.lastHealFailReason = 'NO MED-PACKS';
            return false;
        }
        if (this.doorActionSystem?.isActorBusy?.(targetMarine)) {
            this.lastHealFailReason = 'TARGET BUSY: DOOR';
            return false;
        }
        if (targetMarine.roleKey && this.squadSystem && this.squadSystem.isRoleTaskActive(targetMarine.roleKey)) {
            this.lastHealFailReason = 'TARGET BUSY: TASK';
            return false;
        }
        const operatorInfo = this.pickHealOperator(options.preferredRoleKey || 'leader');
        if (!operatorInfo || !operatorInfo.actor) {
            this.lastHealFailReason = 'NO HEALER AVAILABLE';
            return false;
        }
        const operator = operatorInfo.actor;
        if (operator.active === false || operator.alive === false) {
            this.lastHealFailReason = 'HEALER UNAVAILABLE';
            return false;
        }
        if (this.doorActionSystem?.isActorBusy?.(operator)) {
            this.lastHealFailReason = 'HEALER BUSY: DOOR';
            return false;
        }

        const baseDurationMs = 4200;
        const durationMs = baseDurationMs;
        const capPct = 0.6;
        const maxHp = Math.max(1, Number(targetMarine.maxHealth) || 100);
        const capHealth = Math.floor(maxHp * capPct);
        if ((Number(targetMarine.health) || 0) >= capHealth) {
            this.lastHealFailReason = 'TARGET ABOVE 60% HP';
            return false;
        }
        this.medicPacks = Math.max(0, (Number(this.medicPacks) || 0) - 1);

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
        this.showFloatingText(this.leader.x, this.leader.y - 24, `${opName} HEALING ${tgtName} [PACK ${this.medicPacks}/${this.maxMedicPacks || 2}]`, '#9fe9ff');
        this.updateHealActionLock(time);
        this.lastHealFailReason = '';
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
        
        // Refund medkit on cancel
        this.medicPacks = Phaser.Math.Clamp((Number(this.medicPacks) || 0) + 1, 0, this.maxMedicPacks || 2);

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

    updateHealingSystem(time, delta, marines) {
        if (this.healAction) {
            if (this.isHealParticipantAttacked()) {
                this.cancelHealAction(true);
                return;
            }

            const h = this.healAction;
            // Medic rendezvous: make operator move toward target if far
            if (h.operator && h.target && h.operator !== this.leader) {
                const dist = Phaser.Math.Distance.Between(h.operator.x, h.operator.y, h.target.x, h.target.y);
                if (dist > 45) {
                    // Pause the heal timer while walking to preventing timing out before arriving
                    h.completeAt += delta; 
                    h._approachTime = (h._approachTime || 0) + delta;
                    
                    if (h._approachTime > 6000) {
                        this.showFloatingText(h.operator.x, h.operator.y - 18, 'HEAL FAILED: TARGET EVADED', '#ff9a9a');
                        this.cancelHealAction(false);
                        return;
                    }
                    
                    if (typeof h.operator.moveTowardRigid === 'function') {
                        const speed = (this.squadSystem?.formupSpeed || 140) * 1.25;
                        h.operator.moveTowardRigid(h.target.x, h.target.y, delta, speed);
                    }
                    if (typeof h.operator.setDesiredRotation === 'function') {
                        h.operator.setDesiredRotation(Math.atan2(h.target.y - h.operator.y, h.target.x - h.operator.x));
                    }
                } else {
                    h._approachTime = 0;
                }
            }

            if (time >= this.healAction.completeAt) {
                this.completeHealAction();
                return;
            }
            this.updateHealActionLock(time);
            return;
        }
    }

    updateTrackerAudioCue(time) {
        if (!this.nextTrackerBeepAt) this.nextTrackerBeepAt = time;
        if (!this.nextAmbientBeepAt) this.nextAmbientBeepAt = time;
        const cam = this.cameras.main;
        const view = cam ? cam.worldView : null;
        const audioRange = 1472; // 23 tiles — matches visual tracker cone range
        const near = this.getClosestEnemyForTrackerCue(view, audioRange);
        
        // Mode 1: Nothing detected within audio range
        if (!near) {
            if (time < this.nextAmbientBeepAt) return;
            this.showSquadTrackerBeepWord('...', '#55d8ff', time, null, false, 'N');
            this.nextAmbientBeepAt = time + 3000; // Tap every 3s
            this.nextTrackerBeepAt = time; // Reset tracker timer
            return;
        }

        const dist = Number(near.dist) || 999;
        const hasClosedDoor = this.enemyManager.isClosedDoorBetweenWorldPoints(this.leader.x, this.leader.y, near.enemy.x, near.enemy.y);
        
        // Smooth continuous beep interval: 2500ms (far) → 250ms (touching)
        // More aliens compress the interval further
        const contacts = this.enemyManager.getMotionContacts() || [];
        const countBonus = Math.min(contacts.length, 8) * 0.04; // Up to +0.32 proximity
        
        const doorPenalty = hasClosedDoor ? 400 : 0;
        const effectiveDist = Math.max(0, dist + doorPenalty);
        const proximity = Phaser.Math.Clamp(1 - effectiveDist / audioRange + countBonus, 0, 1);
        
        // Power 1.5 ease — beeps accelerate noticeably in mid-range, rapid at close
        const t = Math.pow(proximity, 1.5);
        const interval = Math.round(2200 - 1900 * t); // 2200ms → 300ms

        if (time < this.nextTrackerBeepAt) return;

        const meters = Math.max(1, Math.round(dist / (CONFIG.TILE_SIZE * 2)));
        const cueDir = this.getTrackerCueDirection(near.enemy);
        const strong = proximity >= 0.5; // Strong beep when closer than half range

        this.showSquadTrackerBeepWord('BEEP', strong ? '#9de7ff' : '#9db7ff', time, meters, strong, cueDir, proximity);
        
        this.nextTrackerBeepAt = time + interval;
        this.nextAmbientBeepAt = this.nextTrackerBeepAt;
    }

    getTrackerCueDirection(enemy) {
        if (!enemy || !this.leader) return 'N';
        const dx = (Number(enemy.x) || 0) - (Number(this.leader.x) || 0);
        const dy = (Number(enemy.y) || 0) - (Number(this.leader.y) || 0);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
        return dy >= 0 ? 'S' : 'N';
    }

    getTrackerSignalProfile(contacts) {
        if (!Array.isArray(contacts) || contacts.length <= 0) {
            return { confidence: 0, proximity: 0 };
        }
        let topConfidence = 0;
        let bestProximity = 0;
        for (const c of contacts) {
            if (!c) continue;
            const conf = Phaser.Math.Clamp(Number(c.confidence) || 0, 0, 1);
            topConfidence = Math.max(topConfidence, conf);
            const dist = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, Number(c.x) || 0, Number(c.y) || 0);
            const prox = Phaser.Math.Clamp(1 - (dist / Math.max(1, this.motionTracker?.range || 420)), 0, 1);
            bestProximity = Math.max(bestProximity, prox);
        }
        return { confidence: topConfidence, proximity: bestProximity };
    }

    /**
     * Returns motion contacts augmented with phantom blips during the CombatDirector 'build'
     * state — brief, low-confidence contacts at off-screen walkable positions with no sprite.
     * Creates the "they're in the walls" tension effect.
     */
    _getAugmentedMotionContacts(time) {
        const realContacts = this.enemyManager.getMotionContacts();
        // Expire old phantom blips
        if (Array.isArray(this._phantomBlips)) {
            this._phantomBlips = this._phantomBlips.filter(b => b.expiresAt > time);
        } else {
            this._phantomBlips = [];
        }
        // Only inject phantoms during 'build' state with few real contacts
        if (!this._nextPhantomBlipAt) this._nextPhantomBlipAt = 0;
        if (this.combatMods?.state === 'build' && realContacts.length < 3 && !this.noAliens) {
            if (time >= this._nextPhantomBlipAt) {
                // Spawn 1-2 phantom blips at random walkable positions 6-14 tiles away
                const count = Math.random() < 0.3 ? 2 : 1;
                for (let i = 0; i < count; i++) {
                    const rangePx = CONFIG.TILE_SIZE * Phaser.Math.Between(6, 14);
                    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    const px = this.leader.x + Math.cos(angle) * rangePx;
                    const py = this.leader.y + Math.sin(angle) * rangePx;
                    if (this.pathGrid) {
                        const tile = this.pathGrid.worldToTile(px, py);
                        if (!this.pathGrid.isWalkable(tile.x, tile.y)) continue;
                    }
                    this._phantomBlips.push({
                        x: px,
                        y: py,
                        speed: Phaser.Math.Between(50, 130),
                        confidence: Phaser.Math.FloatBetween(0.22, 0.44),
                        isEcho: false,
                        isPhantom: true,
                        expiresAt: time + Phaser.Math.Between(450, 1100),
                    });
                }
                this._nextPhantomBlipAt = time + Phaser.Math.Between(9000, 16000);
            }
        }
        if (!this._phantomBlips || this._phantomBlips.length === 0) return realContacts;
        return [...realContacts, ...this._phantomBlips];
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

    getSquadTrackerDirectionalPos(direction = 'N') {
        const wx = this.leader?.x || 0;
        const wy = this.leader?.y || 0;
        const cam = this.cameras.main;
        const screenX = cam ? (wx - cam.scrollX) : wx;
        const screenY = cam ? (wy - cam.scrollY) : wy;
        const left = 30;
        const right = CONFIG.GAME_WIDTH - 30;
        const top = 24;
        const bottom = CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT - 24;
        let edgeX = screenX;
        let edgeY = screenY;
        if (direction === 'N') edgeY = top;
        else if (direction === 'S') edgeY = bottom;
        else if (direction === 'E') edgeX = right;
        else if (direction === 'W') edgeX = left;
        const tx = Phaser.Math.Linear(screenX, edgeX, 0.5);
        const ty = Phaser.Math.Linear(screenY, edgeY, 0.5);
        return {
            x: Phaser.Math.Clamp(tx, 56, CONFIG.GAME_WIDTH - 56),
            y: Phaser.Math.Clamp(ty, 30, CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT - 36),
        };
    }

    showSquadTrackerBeepWord(_word, color = '#9db7ff', time = this.time.now, meters = null, strong = false, direction = 'N', passedProximity = null) {
        if (time < (this.nextTrackerWordAt || 0)) return;
        this.nextTrackerWordAt = time + 180;
        
        let proximity = 0; // 0 = nothing, 1 = touching
        if (passedProximity !== null) {
            proximity = passedProximity;
        } else if (meters !== null) {
            const m = Number(meters) || 0;
            proximity = Phaser.Math.Clamp(1 - (m / (CONFIG.MOTION_TRACKER_RANGE || 420)), 0, 1);
        }

        if (this.sfx) this.sfx.playTrackerPing({ strong: !!strong, proximity });
        // Textual cues removed per UI polish request (rely on HUD pulse and audio)
    }

    resolveMuzzleWorldPos(actor, angle, weaponKey = 'pulseRifle') {
        if (!actor || actor.active === false) {
            return { x: Number(actor?.x) || 0, y: Number(actor?.y) || 0 };
        }
        if (actor.usesTopDownMarineSprite) {
            const base = this.resolveMarineLocalPoint(
                actor,
                angle,
                Number(actor.muzzleLocalX) || 0,
                Number(actor.muzzleLocalY) || -20
            );
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const widthNorm = Phaser.Math.Clamp((Number(actor.displayWidth) || 100) / 100, 0.7, 1.6);
            const forwardExtra = (weaponKey === 'shotgun' ? 8 : (weaponKey === 'pistol' ? 4 : 6)) * widthNorm;
            return {
                x: base.x + dirX * forwardExtra,
                y: base.y + dirY * forwardExtra,
            };
        }
        const ax = Number(actor.x) || 0;
        const ay = Number(actor.y) || 0;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const sideX = -dirY;
        const sideY = dirX;
        const displayW = Math.max(22, Number(actor.displayWidth) || 46);
        const forwardMul = weaponKey === 'shotgun' ? 0.36 : (weaponKey === 'pistol' ? 0.29 : 0.33);
        const forward = Phaser.Math.Clamp(displayW * forwardMul, 10, 28);
        const texKey = String(actor.texture?.key || '');
        const frameIdx = Number(actor.frame?.name);
        let lateral = 0;
        if (Number.isFinite(frameIdx)) {
            if (texKey === 'marine_team_leader') {
                if (frameIdx === 0 || frameIdx === 2) lateral = 2.8;
                else if (frameIdx === 1 || frameIdx === 3) lateral = -2.8;
            } else if (frameIdx === 1 || frameIdx === 3) {
                lateral = -2.2;
            } else {
                lateral = 2.2;
            }
        }
        return {
            x: ax + dirX * forward + sideX * lateral,
            y: ay + dirY * forward + sideY * lateral,
        };
    }

    resolveMarineLocalPoint(actor, facingAngle, localX = 0, localY = 0) {
        const ax = Number(actor?.x) || 0;
        const ay = Number(actor?.y) || 0;
        const visualAngle = (Number(facingAngle) || 0) + (Number(actor?._spriteAngleOffset) || 0);
        const cosA = Math.cos(visualAngle);
        const sinA = Math.sin(visualAngle);
        return {
            x: ax + (localX * cosA - localY * sinA),
            y: ay + (localX * sinA + localY * cosA),
        };
    }

    updateMarineSceneShading(time, marines) {
        // Retained for compatibility. Scene lighting is now driven by the unified
        // overlay stack instead of a marine-only fallback tint.
        return;
    }

    emitWeaponFlashAndStimulus(x, y, angle, time, weaponKey = 'pulseRifle', options = {}) {
        const stimulusMul = Number(options.stimulusMul) || 1;
        if (this.sfx && weaponKey !== 'pulseRifle') this.sfx.playWeapon(weaponKey);
        // Shell casing tinkle — delayed slightly after shot
        if (this.sfx && (weaponKey === 'pulseRifle' || weaponKey === 'shotgun')) {
            if (Math.random() < 0.3) this.sfx.playShellCasing();
        }
        const ownerMarine = options.marine;
        const muzzle = this.resolveMuzzleWorldPos(ownerMarine, angle, weaponKey);
        const fxX = Number.isFinite(muzzle.x) ? muzzle.x : x;
        const fxY = Number.isFinite(muzzle.y) ? muzzle.y : y;
        if (ownerMarine) {
            ownerMarine.lastWeaponFlashAt = time;
            ownerMarine.lastWeaponKey = weaponKey;
            ownerMarine.lastMuzzleFlashX = fxX;
            ownerMarine.lastMuzzleFlashY = fxY;
            ownerMarine.lastMuzzleFlashAngle = angle;
        }
        this.addGunFlashLight(fxX, fxY, angle, time, weaponKey);
        if (weaponKey === 'pulseRifle') this.spawnPulseMuzzleEllipseFlash(fxX, fxY, angle, time, ownerMarine);
        this.playMuzzleLensFlash(fxX, fxY, angle, weaponKey);
        // Bright muzzle circle — weapon-scaled with random size variation
        {
            const mfBaseScale = weaponKey === 'shotgun' ? 1.8 : (weaponKey === 'pistol' ? 0.7 : 1.0);
            const mfVariation = 1.0 + (Math.random() - 0.5) * 0.3; // ±15%
            const mfScale = mfBaseScale * mfVariation;
            const mfLife = 50 + Math.random() * 30; // 50-80ms
            this.spawnFxSprite('dot', fxX, fxY, {
                life: mfLife,
                scaleStart: 0.7 * mfScale,
                scaleEnd: 0.15 * mfScale,
                alphaStart: 0.9,
                alphaEnd: 0,
                tint: 0xffffff,
                rotation: 0,
                spin: 0,
            });
        }
        this.spawnGunfireLensGhosts(fxX, fxY, angle, weaponKey);
        this.combatExposurePulse = Math.max(
            this.combatExposurePulse || 0,
            weaponKey === 'shotgun' ? 0.2 : (weaponKey === 'pistol' ? 0.09 : 0.02)
        );
        if (this.enemyManager && typeof this.enemyManager.registerLightStimulus === 'function') {
            const basePower = weaponKey === 'shotgun' ? 1.45 : (weaponKey === 'pistol' ? 0.85 : 1.0);
            this.enemyManager.registerLightStimulus(fxX, fxY, time, basePower * stimulusMul);
        }
    }

    updateLeaderWeaponAudioState(time, trackerLeaderBusy, healLeaderBusy) {
        if (!this.sfx || typeof this.sfx.setPulseFireState !== 'function') return;
        const pressing = !!this.inputHandler?.isFiring;
        const weaponKey = this.weaponManager?.currentWeaponKey || 'pulseRifle';
        const jammed = time < (Number(this.weaponManager?.jamUntil) || 0);
        const blocked = trackerLeaderBusy || healLeaderBusy;
        const shotRecently = (time - (Number(this.lastLeaderPulseShotAt) || -100000)) <= 260;
        const activePulse = !blocked && weaponKey === 'pulseRifle' && pressing && shotRecently;
        if (!pressing || weaponKey !== 'pulseRifle') this.lastLeaderPulseShotAt = -100000;
        this.sfx.setPulseFireState({ active: activePulse, jammed });
    }

    initFxEmitters() {
        this.fxDotPool = [];
        this.fxSmokePool = [];
        this.fxRingPool = [];
        this.fxBokehPool = [];
        this.fxFlarePool = [];
        this.fxDebrisPool = [];
        this.fxEmberPool = [];
        this.fxSplashPool = [];
        this.fxArcPool = [];
        this.fxMoltenPool = [];
        this.muzzleLensPool = [];
        this.muzzleHexPool = [];
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

        addPoolSprites(this.fxDotPool, 'fx_dot', 480, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxSmokePool, 'fx_smoke', 340, 232, Phaser.BlendModes.SCREEN);
        addPoolSprites(this.fxRingPool, 'fx_ring', 180, 233, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxBokehPool, 'fx_bokeh', 128, 229, Phaser.BlendModes.SCREEN);
        addPoolSprites(this.fxFlarePool, 'fx_flare', 68, 234, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxDebrisPool, 'fx_debris', 120, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxEmberPool, 'fx_ember', 96, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxSplashPool, 'fx_splash', 80, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxArcPool, 'fx_arc', 64, 232, Phaser.BlendModes.ADD);
        addPoolSprites(this.fxMoltenPool, 'fx_molten', 48, 231, Phaser.BlendModes.ADD);
        addPoolSprites(this.muzzleLensPool, 'fx_flare', 28, 236, Phaser.BlendModes.ADD);
        addPoolSprites(this.muzzleHexPool, 'fx_bokeh', 28, 236, Phaser.BlendModes.ADD);

        // Alien blood SVG splatter pool — NORMAL blend so the green shows on dark floor.
        this.fxBloodSplatPool = [];
        for (let i = 0; i < 80; i++) {
            const key = `alien_blood_svg_${i % 4}`;
            if (!this.textures.exists(key)) continue;
            const sprite = this.add.image(-1000, -1000, key);
            sprite.setVisible(false);
            sprite.setActive(false);
            sprite.setDepth(231);
            sprite.setBlendMode(Phaser.BlendModes.NORMAL);
            sprite.setScale(0);
            this.fxBloodSplatPool.push(sprite);
        }

        // Keyed lookup tables — avoid nested ternary chains in hot paths.
        this.fxPools = {
            dot: this.fxDotPool,
            smoke: this.fxSmokePool,
            ring: this.fxRingPool,
            bokeh: this.fxBokehPool,
            flare: this.fxFlarePool,
            debris: this.fxDebrisPool,
            ember: this.fxEmberPool,
            splash: this.fxSplashPool,
            arc: this.fxArcPool,
            molten: this.fxMoltenPool,
            bloodSplat: this.fxBloodSplatPool,
        };
        this.fxPoolCaps = { smoke: 230, ring: 160, bokeh: 86, flare: 56, debris: 100, ember: 80, splash: 80, arc: 50, molten: 40, bloodSplat: 80 };
    }

    acquireMuzzleLensSprite(pool) {
        if (!Array.isArray(pool)) return null;
        for (let i = 0; i < pool.length; i++) {
            const sprite = pool[i];
            if (sprite && !sprite.active) return sprite;
        }
        if (pool.length <= 0) return null;
        return pool[0] || null;
    }

    playMuzzleLensFlash(x, y, angle, weaponKey, visualScale = 1) {
        const streak = this.acquireMuzzleLensSprite(this.muzzleLensPool);
        if (streak) {
            const isShotgun = weaponKey === 'shotgun';
            const isPistol = weaponKey === 'pistol';
            this.tweens.killTweensOf(streak);
            streak.setActive(true);
            streak.setVisible(true);
            streak.setPosition(x, y);
            streak.setRotation(angle + Phaser.Math.FloatBetween(-0.04, 0.04));
            streak.setTint(Phaser.Utils.Array.GetRandom(
                isPistol ? [0xc7d8ff, 0x8ab4ff, 0xa0c8ff]
                         : [0xc4d8ff, 0x88b0ff, 0xffe8c0, 0xd0b8ff, 0x7aacff]
            ));
            // Wider anamorphic stretch for cinematic look
            streak.setScale(
                (isShotgun ? 1.66 : (isPistol ? 1.14 : 1.42)) * visualScale,
                (isShotgun ? 0.42 : (isPistol ? 0.32 : 0.36)) * visualScale
            );
            streak.setAlpha(isShotgun ? 0.78 : (isPistol ? 0.54 : 0.66));
            this.tweens.add({
                targets: streak,
                alpha: 0,
                scaleX: streak.scaleX * 1.18,
                x: x + Math.cos(angle) * (isShotgun ? 4.2 : 3.0),
                y: y + Math.sin(angle) * (isShotgun ? 4.2 : 3.0),
                duration: isShotgun ? 118 : 100,
                ease: 'Cubic.out',
                onComplete: () => {
                    streak.setActive(false);
                    streak.setVisible(false);
                },
            });
        }

        const hex = this.acquireMuzzleLensSprite(this.muzzleHexPool);
        if (hex) {
            const isShotgun = weaponKey === 'shotgun';
            const isPistol = weaponKey === 'pistol';
            this.tweens.killTweensOf(hex);
            hex.setActive(true);
            hex.setVisible(true);
            hex.setPosition(
                x + Phaser.Math.FloatBetween(-1.8, 1.8),
                y + Phaser.Math.FloatBetween(-1.8, 1.8)
            );
            hex.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
            hex.setTint(Phaser.Utils.Array.GetRandom(
                isPistol ? [0xa8c0ff, 0x7a9eff, 0xc0aaff]
                         : [0x8ab8ff, 0xb490ff, 0x6aaaff, 0xffd4a0, 0xc8aaff]
            ));
            hex.setScale((isShotgun ? 0.6 : (isPistol ? 0.4 : 0.5)) * visualScale);
            hex.setAlpha(isShotgun ? 0.6 : (isPistol ? 0.42 : 0.52));
            this.tweens.add({
                targets: hex,
                alpha: 0,
                scaleX: (isShotgun ? 0.92 : (isPistol ? 0.64 : 0.76)) * visualScale,
                scaleY: (isShotgun ? 0.92 : (isPistol ? 0.64 : 0.76)) * visualScale,
                duration: isShotgun ? 130 : 112,
                ease: 'Quad.out',
                onComplete: () => {
                    hex.setActive(false);
                    hex.setVisible(false);
                },
            });
        }

        // Disabled for gameplay readability: wide lens ghosts can look like misplaced muzzle flashes.
    }

    spawnGunfireLensGhosts(x, y, angle, weaponKey, visualScale = 1) {
        const now = this.time.now || 0;
        if (now < (this.nextGunLensGhostAt || 0)) return;
        this.nextGunLensGhostAt = now + Phaser.Math.Between(180, 360);
        const triggerChance = weaponKey === 'shotgun' ? 1.0 : (weaponKey === 'pistol' ? 0.94 : 0.98);
        if (Math.random() > triggerChance) return;

        const cam = this.cameras?.main;
        if (!cam) return;
        const paletteByWeapon = {
            shotgun: [0x6a9eff, 0x88b4ff, 0xbf63ff, 0xa04fff, 0xff9628, 0x55ccff],
            pulseRifle: [0x6aafff, 0x88c4ff, 0xb46dff, 0xc898ff, 0xffe058, 0x44bbff],
            pistol: [0x7ab8ff, 0x99ccff, 0xb782ff, 0xffd16a, 0x55aaff],
        };
        const palette = paletteByWeapon[weaponKey] || paletteByWeapon.pulseRifle;
        const burstCount = weaponKey === 'shotgun' ? Phaser.Math.Between(7, 10) : Phaser.Math.Between(5, 8);
        const forward = 18;
        const mx = x + Math.cos(angle) * forward;
        const my = y + Math.sin(angle) * forward;
        const screenMuzzleX = cam.x + (mx - cam.worldView.x) * cam.zoom;
        const screenMuzzleY = cam.y + (my - cam.worldView.y) * cam.zoom;
        const axisX = Math.cos(angle);
        const axisY = Math.sin(angle);
        const normalX = -axisY;
        const normalY = axisX;
        const lateral = Phaser.Math.Clamp(Math.abs(normalX), 0, 1);
        const sep = Phaser.Math.Linear(cam.width * 0.34, cam.width * 0.8, lateral) * visualScale;
        const margin = 56;
        const minX = cam.x - margin;
        const maxX = cam.x + cam.width + margin;
        const minY = cam.y - margin;
        const maxY = cam.y + cam.height + margin;
        const edgeBias = weaponKey === 'shotgun' ? 0.86 : 0.78;

        for (let i = 0; i < burstCount; i++) {
            const tint = palette[Phaser.Math.Between(0, palette.length - 1)];
            const life = Phaser.Math.Between(340, 720);
            const jx = Phaser.Math.FloatBetween(-32, 32);
            const jy = Phaser.Math.FloatBetween(-32, 32);
            const side = i % 2 === 0 ? 1 : -1;
            const forwardBias = Phaser.Math.FloatBetween(-0.22, 0.28);
            const spread = sep * Phaser.Math.FloatBetween(1.0, 2.25);
            const baseX = screenMuzzleX + normalX * side * spread + axisX * spread * forwardBias + jx;
            const baseY = screenMuzzleY + normalY * side * spread + axisY * spread * forwardBias + jy;
            const edgeAnchorX = side > 0 ? maxX : minX;
            const edgeAnchorY = Phaser.Math.Clamp(
                screenMuzzleY + normalY * side * cam.height * Phaser.Math.FloatBetween(0.35, 0.75) + jy,
                minY,
                maxY
            );
            const edgeBlend = Phaser.Math.FloatBetween(edgeBias, 0.98);
            const biasedX = Phaser.Math.Linear(baseX, edgeAnchorX, edgeBlend);
            const biasedY = Phaser.Math.Linear(baseY, edgeAnchorY, Phaser.Math.FloatBetween(0.55, 0.9));
            const hx = Phaser.Math.Clamp(biasedX, minX, maxX);
            const hy = Phaser.Math.Clamp(biasedY, minY, maxY);

            this.flashLensShapeAt(hx, hy, {
                shape: 'hex',
                radius: Phaser.Math.FloatBetween(34, 70) * visualScale,
                tint,
                alphaPeak: Phaser.Math.FloatBetween(0.015, 0.045),
                life,
                rotation: angle * Phaser.Math.FloatBetween(0.65, 1.1) + Phaser.Math.FloatBetween(-0.35, 0.35),
                instantOn: true,
                screenSpace: true,
            });
            this.flashLensShapeAt(hx, hy, {
                shape: 'hex',
                radius: Phaser.Math.FloatBetween(28, 58) * visualScale,
                tint,
                alphaPeak: Phaser.Math.FloatBetween(0.012, 0.038),
                life: Math.max(220, life - Phaser.Math.Between(30, 130)),
                rotation: angle * Phaser.Math.FloatBetween(0.9, 1.35) + Phaser.Math.FloatBetween(0.55, 1.1),
                instantOn: true,
                delayMs: Phaser.Math.Between(8, 24),
                screenSpace: true,
            });
        }
    }

    flashLensShapeAt(x, y, options = {}) {
        const g = this.add.graphics();
        g.setDepth(251);
        g.setBlendMode(Phaser.BlendModes.ADD);
        g.setAlpha(0);
        if (options.screenSpace === true) g.setScrollFactor(0);
        const tint = options.tint ?? 0xffffff;
        const r = Math.max(4, Number(options.radius) || 24);
        const shape = String(options.shape || 'circle');
        const rot = Number(options.rotation) || 0;
        g.fillStyle(tint, 1);
        g.lineStyle(2, tint, 0.8);
        if (shape === 'hex') {
            g.beginPath();
            for (let i = 0; i < 6; i++) {
                const t = rot + (Math.PI * 2 * i) / 6;
                const px = x + Math.cos(t) * r;
                const py = y + Math.sin(t) * r;
                if (i === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            }
            g.closePath();
            g.fillPath();
            g.strokePath();
        } else {
            g.fillCircle(x, y, r);
            g.strokeCircle(x, y, r * 0.95);
        }
        const life = Math.max(120, Number(options.life) || 820);
        const peak = Phaser.Math.Clamp(Number(options.alphaPeak) || 0.1, 0.03, 0.3);
        const delayMs = Math.max(0, Number(options.delayMs) || 0);
        const instantOn = options.instantOn === true;
        const fadeInMs = Math.max(60, Math.floor(life * 0.3));
        const fadeOutMs = Math.max(120, life - fadeInMs);
        if (instantOn) {
            g.setAlpha(peak);
            this.tweens.add({
                targets: g,
                alpha: 0,
                delay: delayMs,
                duration: Math.max(220, life),
                ease: 'Sine.Out',
                onComplete: () => g.destroy(),
            });
            return;
        }
        this.tweens.add({
            targets: g,
            alpha: peak,
            delay: delayMs,
            duration: fadeInMs,
            ease: 'Quad.out',
        });
        this.tweens.add({
            targets: g,
            alpha: 0,
            delay: delayMs + fadeInMs,
            duration: fadeOutMs,
            ease: 'Quad.in',
            onComplete: () => g.destroy(),
        });
    }

    createAtmosphereOverlay() {
        const playHeight = CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT;
        this.atmoColorGrade = this.add.rectangle(
            CONFIG.GAME_WIDTH * 0.5,
            playHeight * 0.5,
            CONFIG.GAME_WIDTH,
            playHeight,
            0x5f788a,
            0.06
        );
        this.atmoColorGrade.setDepth(205.6);
        this.atmoColorGrade.setScrollFactor(0);
        this.atmoColorGrade.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.atmoVignette = this.add.image(
            CONFIG.GAME_WIDTH * 0.5,
            playHeight * 0.5,
            'fx_vignette'
        );
        this.atmoVignette.setDepth(206);
        this.atmoVignette.setScrollFactor(0);
        const tex = this.textures.get('fx_vignette');
        const tw = Math.max(1, tex ? tex.getSourceImage().width : 512);
        const th = Math.max(1, tex ? tex.getSourceImage().height : 512);
        this.atmoVignette.setScale(CONFIG.GAME_WIDTH / tw, playHeight / th);
        this.atmoVignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
        this.atmoVignette.setAlpha(0.16);
    }

    initAlienTone() {
        // Shader pipelines removed
    }

    initTiltShift() {
        // Shader pipelines removed
    }

    initScanline() {
        // Shader pipelines removed
    }

    createScanlineOverlay() {
        const graphics = this.runtimeSettings?.graphics || DEFAULT_RUNTIME_SETTINGS.graphics;
        const shaderEnabled = !!this.scanline;
        const overlayStrength = Phaser.Math.Clamp(Number(graphics.scanlineOverlayStrength) || 0, 0, 0.2);
        if (shaderEnabled || overlayStrength <= 0.001) return;
        const scanlines = this.add.graphics();
        scanlines.lineStyle(1, 0x000000, overlayStrength);
        for (let y = 0; y < CONFIG.GAME_HEIGHT; y += 4) {
            scanlines.lineBetween(0, y, CONFIG.GAME_WIDTH, y);
        }
        scanlines.setDepth(260);
        scanlines.setScrollFactor(0);
        this.screenScanlineOverlay = scanlines;
    }

updateAtmosphereOverlay(_time = this.time.now) {
        if (!this.atmoVignette) return;
        const pressure = this.getCombatPressure();
        const tuning = this.runtimeSettings?.other || {};
        const base = Phaser.Math.Clamp(Number(tuning.atmoVignetteBase) || 0.18, 0, 0.6);
        const gain = Phaser.Math.Clamp(Number(tuning.atmoVignettePressureGain) || 0.16, 0, 0.8);
        const onScreen = this.enemyManager?.getOnScreenHostileCount?.(this.cameras.main) || 0;
        const crowdMul = Phaser.Math.Clamp(onScreen / 8, 0, 1) * 0.08;
        const burstMul = this.isGunfireBurstActive() ? 0.05 : 0;
        const time = Number(_time) || this.time.now;
        const flicker = Math.sin(time * 0.0052) * 0.012 + Math.sin(time * 0.0018 + pressure * 4.2) * 0.008;
        const target = Phaser.Math.Clamp(base + pressure * gain + crowdMul + burstMul, 0.08, 0.8);
        this.combatExposurePulse = Phaser.Math.Linear(this.combatExposurePulse || 0, 0, 0.14);
        const pulseLift = Phaser.Math.Clamp(this.combatExposurePulse || 0, 0, 0.28);
        const litTarget = Phaser.Math.Clamp(target - pulseLift + flicker, 0.02, 0.9);
        this.atmoVignette.alpha = Phaser.Math.Linear(this.atmoVignette.alpha || litTarget, litTarget, 0.12);
        if (this.atmoColorGrade) {
            const gradeTarget = Phaser.Math.Clamp(0.045 + pressure * 0.04, 0.04, 0.11);
            this.atmoColorGrade.alpha = Phaser.Math.Linear(this.atmoColorGrade.alpha || gradeTarget, gradeTarget, 0.12);
            const heat = Phaser.Math.Clamp((pressure - 0.58) / 0.42, 0, 1);
            const r = Math.round(Phaser.Math.Linear(0x5f, 0x83, heat));
            const g = Math.round(Phaser.Math.Linear(0x78, 0x56, heat));
            const b = Math.round(Phaser.Math.Linear(0x8a, 0x58, heat));
            this.atmoColorGrade.fillColor = (r << 16) | (g << 8) | b;
        }
        this.updateAdaptivePostFx(pressure, this.time.now);
    }

    updateAdaptivePostFx(pressure = 0, time = this.time.now) {
        return; // Game shaders disabled
        const now = Number(time) || this.time.now;
        if (now < (this.nextAdaptivePostFxAt || 0)) return;
        this.nextAdaptivePostFxAt = now + 33;
        const fps = Number(this.game?.loop?.actualFps) || 60;
        const postFxLoadMul = fps < 46 ? 0.2 : (fps < 52 ? 0.45 : (fps < 56 ? 0.7 : 1));
        const p = Phaser.Math.Clamp(Number(pressure) || 0, 0, 1);
        const graphics = this.runtimeSettings?.graphics || {};
        const hpNorm = Phaser.Math.Clamp(
            (Number(this.leader?.health) || 0) / Math.max(1, Number(this.leader?.maxHealth) || 100),
            0,
            1
        );
        const lowHealth = 1 - hpNorm;
        const trackerActive = 0;
        if (this.scanline) {
            const baseScan = Phaser.Math.Clamp(graphics.scanlineStrength ?? defaultGraphics.scanlineStrength, 0, 0.5);
            const baseGrain = Phaser.Math.Clamp(graphics.filmGrain ?? defaultGraphics.filmGrain, 0, 0.3);
            const targetScan = Phaser.Math.Clamp(baseScan * (0.86 + p * 0.52), 0, 0.5);
            const targetGrain = Phaser.Math.Clamp(baseGrain * (0.9 + p * 0.44), 0, 0.3);
            if (!Number.isFinite(this._scanlineCurrent)) this._scanlineCurrent = targetScan;
            if (!Number.isFinite(this._grainCurrent)) this._grainCurrent = targetGrain;
            this._scanlineCurrent = Phaser.Math.Linear(this._scanlineCurrent, targetScan * postFxLoadMul, 0.08);
            this._grainCurrent = Phaser.Math.Linear(this._grainCurrent, targetGrain * postFxLoadMul, 0.08);
            if (this.scanline.setScanlines) this.scanline.setScanlines(this._scanlineCurrent);
            if (this.scanline.setGrain) this.scanline.setGrain(this._grainCurrent);
        }
        if (this.tiltShift) {
            const baseStrength = Phaser.Math.Clamp(graphics.tiltShiftStrength ?? defaultGraphics.tiltShiftStrength, 0, 3);
            const baseRange = Phaser.Math.Clamp(graphics.tiltShiftRange ?? defaultGraphics.tiltShiftRange, 0.05, 1);
            const baseFocus = Phaser.Math.Clamp(graphics.tiltShiftFocus ?? defaultGraphics.tiltShiftFocus, 0, 1);
            const targetStrength = Phaser.Math.Clamp(baseStrength * (0.94 + p * 0.28) * postFxLoadMul, 0, 3);
            const targetRange = Phaser.Math.Clamp(baseRange * (1.02 - p * 0.24), 0.05, 1);
            const cam = this.cameras?.main;
            const leaderY = Number(this.leader?.y) || 0;
            const viewTop = Number(cam?.worldView?.y) || 0;
            const viewHeight = Math.max(1, Number(cam?.worldView?.height) || CONFIG.GAME_HEIGHT);
            const leaderFocus = Phaser.Math.Clamp((leaderY - viewTop) / viewHeight, 0, 1);
            const focusBlend = 0.2 + p * 0.26;
            const targetFocus = Phaser.Math.Linear(baseFocus, leaderFocus, focusBlend);
            if (!Number.isFinite(this._tiltStrengthCurrent)) this._tiltStrengthCurrent = targetStrength;
            if (!Number.isFinite(this._tiltRangeCurrent)) this._tiltRangeCurrent = targetRange;
            if (!Number.isFinite(this._tiltFocusCurrent)) this._tiltFocusCurrent = targetFocus;
            this._tiltStrengthCurrent = Phaser.Math.Linear(this._tiltStrengthCurrent, targetStrength, 0.08);
            this._tiltRangeCurrent = Phaser.Math.Linear(this._tiltRangeCurrent, targetRange, 0.08);
            this._tiltFocusCurrent = Phaser.Math.Linear(this._tiltFocusCurrent, targetFocus, 0.08);
            if (this.tiltShift.setStrength) this.tiltShift.setStrength(this._tiltStrengthCurrent);
            if (this.tiltShift.setRange) this.tiltShift.setRange(this._tiltRangeCurrent);
            if (this.tiltShift.setFocus) this.tiltShift.setFocus(this._tiltFocusCurrent);
        }
        if (this.alienTonePipeline) {
            const chromaEnabled = (Number(graphics.pressureChromaticAberration) || 0) > 0;
            const bleedEnabled = (Number(graphics.pressureColorBleed) || 0) > 0;
            const pressureForShader = chromaEnabled ? p : 0;
            const lowHpForShader = bleedEnabled ? lowHealth : 0;
            const ambientDarkness = Phaser.Math.Clamp(Number(this.runtimeSettings?.lighting?.ambientDarkness) || 0.82, 0.45, 1);
            const ambientLift = Phaser.Math.Clamp((ambientDarkness - 0.45) / 0.55, 0, 1);
            const tintR = Number(this._emergencyTintR) || 1;
            const tintG = Number(this._emergencyTintG) || 1;
            const tintB = Number(this._emergencyTintB) || 1;
            const warmTintBias = Phaser.Math.Clamp((tintR - tintB) * 0.55, -0.2, 0.26);
            const coolTintBias = Phaser.Math.Clamp((tintB - tintR) * 0.5, -0.16, 0.22);
            const lightingPressure = Phaser.Math.Clamp(ambientLift * 0.45 + Math.max(0, warmTintBias) * 0.7, 0, 1);
            const baseBloom = Phaser.Math.Clamp(graphics.cinematicBloom ?? defaultGraphics.cinematicBloom, 0, 1);
            const baseWarp = Phaser.Math.Clamp(graphics.cinematicWarp ?? defaultGraphics.cinematicWarp, 0, 1);
            const baseFlicker = Phaser.Math.Clamp(graphics.filmFlicker ?? defaultGraphics.filmFlicker, 0, 1);
            const baseHalation = Phaser.Math.Clamp(graphics.cinematicHalation ?? defaultGraphics.cinematicHalation, 0, 1);
            const baseExposure = Phaser.Math.Clamp(graphics.cinematicExposure ?? defaultGraphics.cinematicExposure, 0.7, 1.5);
            const baseBleach = Phaser.Math.Clamp(graphics.cinematicBleachBypass ?? defaultGraphics.cinematicBleachBypass, 0, 1);
            const targetBloom = Phaser.Math.Clamp(baseBloom * (0.82 + p * 0.36 + trackerActive * 0.12 + lightingPressure * 0.22), 0, 1);
            const targetWarp = Phaser.Math.Clamp(baseWarp * (0.82 + p * 0.62 + lowHealth * 0.22), 0, 1);
            const targetFlicker = Phaser.Math.Clamp(baseFlicker * (0.88 + p * 0.48 + lowHealth * 0.4), 0, 1);
            const targetHalation = Phaser.Math.Clamp(baseHalation * (0.82 + p * 0.4 + lowHealth * 0.16 + ambientLift * 0.18 + Math.max(0, warmTintBias) * 0.24), 0, 1);
            const targetExposure = Phaser.Math.Clamp(baseExposure * (1.02 - ambientLift * 0.12 + p * 0.04 + coolTintBias * 0.06), 0.7, 1.5);
            const targetBleach = Phaser.Math.Clamp(baseBleach * (0.62 + p * 0.74 + lowHealth * 0.44), 0, 1);
            if (!Number.isFinite(this._toneBloomCurrent)) this._toneBloomCurrent = targetBloom;
            if (!Number.isFinite(this._toneWarpCurrent)) this._toneWarpCurrent = targetWarp;
            if (!Number.isFinite(this._toneFlickerCurrent)) this._toneFlickerCurrent = targetFlicker;
            if (!Number.isFinite(this._toneHalationCurrent)) this._toneHalationCurrent = targetHalation;
            if (!Number.isFinite(this._toneExposureCurrent)) this._toneExposureCurrent = targetExposure;
            if (!Number.isFinite(this._toneBleachCurrent)) this._toneBleachCurrent = targetBleach;
            const toneSmoothing = 0.1;
            this._toneBloomCurrent = Phaser.Math.Linear(this._toneBloomCurrent, targetBloom * postFxLoadMul, toneSmoothing);
            this._toneWarpCurrent = Phaser.Math.Linear(this._toneWarpCurrent, targetWarp * postFxLoadMul, toneSmoothing);
            this._toneFlickerCurrent = Phaser.Math.Linear(this._toneFlickerCurrent, targetFlicker * postFxLoadMul, toneSmoothing);
            this._toneHalationCurrent = Phaser.Math.Linear(this._toneHalationCurrent, targetHalation * postFxLoadMul, toneSmoothing);
            this._toneExposureCurrent = Phaser.Math.Linear(this._toneExposureCurrent, targetExposure, toneSmoothing);
            this._toneBleachCurrent = Phaser.Math.Linear(this._toneBleachCurrent, targetBleach * postFxLoadMul, toneSmoothing);
            this.alienTonePipeline.setPressure?.(pressureForShader);
            this.alienTonePipeline.setLowHealth?.(lowHpForShader);
            this.alienTonePipeline.setTrackerActive?.(trackerActive);
            this.alienTonePipeline.setBloom?.(this._toneBloomCurrent);
            this.alienTonePipeline.setWarp?.(this._toneWarpCurrent);
            this.alienTonePipeline.setFlicker?.(this._toneFlickerCurrent);
            this.alienTonePipeline.setHalation?.(this._toneHalationCurrent);
            this.alienTonePipeline.setExposure?.(this._toneExposureCurrent);
            this.alienTonePipeline.setBleach?.(this._toneBleachCurrent);
        }
    }

    updateAmbientDust(time = this.time.now) {
        this.atmosphereSystem.updateAmbientEffects(time, this.game.loop.delta);
    }

    spawnAmbientDust(time) {
        const view = this.cameras.main.worldView;
        this.spawnFxSprite('dot', view.centerX + Phaser.Math.Between(-180, 180), view.centerY + Phaser.Math.Between(-120, 120), {
            life: Phaser.Math.Between(520, 920),
            vx: Phaser.Math.FloatBetween(-6, 6),
            vy: -Phaser.Math.FloatBetween(8, 18),
            drag: 0.9,
            scaleStart: Phaser.Math.FloatBetween(0.12, 0.2),
            scaleEnd: 0,
            alphaStart: 0.18,
            alphaEnd: 0,
            tint: 0x9dc7ff,
        });
    }

    spawnAmbientTorchDust(m, time) {
        const view = this.cameras.main.worldView;
        const lighting = this.runtimeSettings?.lighting || {};
        const beamHalf = (lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE) * 0.35;
        const beamRange = (lighting.torchRange ?? CONFIG.TORCH_RANGE) * 0.75;
        const facing = (m.facingAngle ?? m.rotation) || 0;
        // Spawn 1-2 particles per call for denser beam dust
        const count = Math.random() < 0.4 ? 2 : 1;
        for (let p = 0; p < count; p++) {
            const a = facing + Phaser.Math.FloatBetween(-beamHalf * 0.85, beamHalf * 0.85);
            const dNorm = Math.pow(Math.random(), 0.7); // bias toward closer range
            const d = Phaser.Math.FloatBetween(24, Math.max(40, beamRange * 0.72)) * dNorm + 20;
            const px = m.x + Math.cos(a) * d + Phaser.Math.FloatBetween(-7, 7);
            const py = m.y + Math.sin(a) * d + Phaser.Math.FloatBetween(-7, 7);
            if (!view.contains(px, py)) continue;
            // Drift perpendicular to beam + slight upward float
            const perpAngle = a + Math.PI * 0.5 * (Math.random() < 0.5 ? 1 : -1);
            const perpDrift = Phaser.Math.FloatBetween(2, 8);
            const beamDrift = Phaser.Math.FloatBetween(-3, 6);
            const vx = Math.cos(perpAngle) * perpDrift + Math.cos(a) * beamDrift;
            const vy = Math.sin(perpAngle) * perpDrift + Math.sin(a) * beamDrift - Phaser.Math.FloatBetween(2, 8);
            // Farther motes are dimmer and larger (depth cue)
            const distFactor = Phaser.Math.Clamp(d / beamRange, 0, 1);
            const life = Phaser.Math.Between(420, 900);
            const alphaStart = Phaser.Math.FloatBetween(0.06, 0.15) * (1 - distFactor * 0.5);
            const scaleStart = Phaser.Math.FloatBetween(0.06, 0.14) * (1 + distFactor * 0.6);
            // Warm tints near source, cooler farther out
            const tint = distFactor < 0.4
                ? Phaser.Utils.Array.GetRandom([0xfff4e0, 0xffecd0, 0xffe8c4])
                : Phaser.Utils.Array.GetRandom([0xbfd7e8, 0xd6ecff, 0xc7e0f4, 0xe0eeff]);
            this.spawnFxSprite('dot', px, py, {
                life,
                vx,
                vy,
                drag: 0.82,
                scaleStart,
                scaleEnd: scaleStart * 0.3,
                alphaStart,
                alphaEnd: 0,
                tint,
            });
        }
    }

    spawnAmbientBokeh(time) {
        const view = this.cameras.main.worldView;
        // Spawn 1-2 bokeh orbs per call for richer depth-of-field feel
        const count = Math.random() < 0.3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            // Bias spawn toward screen edges for cinematic vignette-bokeh feel
            const edgeBias = Math.random() < 0.6;
            const spawnX = edgeBias
                ? view.centerX + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(160, 320)
                : view.centerX + Phaser.Math.Between(-240, 240);
            const spawnY = view.centerY + Phaser.Math.Between(-180, 160);
            // Varied sizes — some tiny background, some large foreground
            const sizeClass = Math.random();
            const scaleStart = sizeClass < 0.3
                ? Phaser.Math.FloatBetween(0.08, 0.16) // tiny distant
                : (sizeClass < 0.7
                    ? Phaser.Math.FloatBetween(0.18, 0.34) // medium
                    : Phaser.Math.FloatBetween(0.36, 0.58)); // large foreground
            const scaleEnd = scaleStart * Phaser.Math.FloatBetween(1.3, 2.2);
            // Larger bokeh are brighter but more transparent (out of focus)
            const alphaStart = sizeClass < 0.3
                ? Phaser.Math.FloatBetween(0.04, 0.08)
                : (sizeClass < 0.7
                    ? Phaser.Math.FloatBetween(0.035, 0.07)
                    : Phaser.Math.FloatBetween(0.02, 0.05));
            // Color palette: cool blues, warm highlights, occasional lens-tinted
            const tintPool = sizeClass > 0.7
                ? [0xc0d8f0, 0xd4e4f4, 0xf0e8d0, 0xe8d8c0] // warm foreground
                : [0x8fb4d6, 0xa6c4de, 0xc7d9ea, 0x98b8d8, 0xb0c8e0];
            this.spawnFxSprite('bokeh', spawnX, spawnY, {
                life: Phaser.Math.Between(1200, 2400),
                vx: Phaser.Math.FloatBetween(-4, 4),
                vy: Phaser.Math.FloatBetween(-7, -1),
                drag: 0.45,
                scaleStart,
                scaleEnd,
                alphaStart,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(tintPool),
            });
        }
    }

    spawnAmbientSteam(time) {
        const view = this.cameras.main.worldView;
        this.spawnFxSprite('smoke', view.centerX + Phaser.Math.Between(-210, 210), view.bottom - Phaser.Math.Between(10, 80), {
            life: Phaser.Math.Between(1000, 1800),
            vx: Phaser.Math.FloatBetween(-10, 10),
            vy: Phaser.Math.FloatBetween(-22, -12),
            drag: 0.42,
            scaleStart: Phaser.Math.FloatBetween(0.08, 0.14),
            scaleEnd: Phaser.Math.FloatBetween(0.38, 0.68),
            alphaStart: Phaser.Math.FloatBetween(0.045, 0.085),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0x9db0b7, 0x8a9ca5, 0xb0bec4]),
        });
    }

    triggerRandomLightFlicker(time) {
        if (this.lightingOverlay && typeof this.lightingOverlay.triggerRandomFlicker === 'function') {
            this.lightingOverlay.triggerRandomFlicker(time);
        }
    }

    emitAmbientVentSteam(time) {
        const view = this.cameras.main.worldView;
        this.emitAlienSteamPlume(view.centerX + Phaser.Math.Between(-150, 150), view.centerY + Phaser.Math.Between(-100, 100));
    }

    updateAmbientZoneSteam(time = this.time.now) {
        if (time >= this.nextAmbientZoneSteamAt && Array.isArray(this.atmoZones) && this.atmoZones.length > 0) {
            const zone = Phaser.Utils.Array.GetRandom(this.atmoZones);
            if (zone) {
                const zx = zone.x + Phaser.Math.Between(-Math.floor(zone.radius * 0.35), Math.floor(zone.radius * 0.35));
                const zy = zone.y + Phaser.Math.Between(-Math.floor(zone.radius * 0.28), Math.floor(zone.radius * 0.28));
                this.spawnFxSprite('smoke', zx, zy, {
                    life: Phaser.Math.Between(900, 1650),
                    vx: Phaser.Math.FloatBetween(-9, 9),
                    vy: Phaser.Math.FloatBetween(-24, -10),
                    drag: 0.46,
                    scaleStart: Phaser.Math.FloatBetween(0.09, 0.16) * (zone.steamBias || 1),
                    scaleEnd: Phaser.Math.FloatBetween(0.42, 0.74) * (zone.steamBias || 1),
                    alphaStart: Phaser.Math.FloatBetween(0.04, 0.08),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0x9eb0b8, 0x8899a2, 0xb1bec3]),
                });
                if (Math.random() < 0.46) {
                    this.spawnFxSprite('bokeh', zx + Phaser.Math.Between(-24, 24), zy + Phaser.Math.Between(-20, 20), {
                        life: Phaser.Math.Between(880, 1460),
                        vx: Phaser.Math.FloatBetween(-4, 4),
                        vy: Phaser.Math.FloatBetween(-8, -2),
                        drag: 0.5,
                        scaleStart: Phaser.Math.FloatBetween(0.12, 0.2) * (zone.bokehBias || 1),
                        scaleEnd: Phaser.Math.FloatBetween(0.36, 0.62) * (zone.bokehBias || 1),
                        alphaStart: Phaser.Math.FloatBetween(0.03, 0.07),
                        alphaEnd: 0,
                        tint: Phaser.Utils.Array.GetRandom([0x90b2cb, 0xa8c1d4, 0xbad1e2]),
                    });
                }
            }
            this.nextAmbientZoneSteamAt = time + Phaser.Math.Between(420, 760);
        }
        if (time >= (this.nextFloorSteamAt || 0)) {
            let sx = view.centerX + Phaser.Math.Between(-220, 220);
            let sy = view.centerY + Phaser.Math.Between(-160, 160);
            if (Array.isArray(this.acidHazards) && this.acidHazards.length > 0 && Math.random() < 0.64) {
                const h = Phaser.Utils.Array.GetRandom(this.acidHazards);
                if (h) {
                    sx = h.x + Phaser.Math.Between(-Math.floor(h.radius * 0.7), Math.floor(h.radius * 0.7));
                    sy = h.y + Phaser.Math.Between(-Math.floor(h.radius * 0.6), Math.floor(h.radius * 0.6));
                }
            }
            this.spawnFxSprite('smoke', sx, sy, {
                life: Phaser.Math.Between(820, 1480),
                vx: Phaser.Math.FloatBetween(-6, 6),
                vy: Phaser.Math.FloatBetween(-34, -16),
                gravityY: Phaser.Math.FloatBetween(-4, -1),
                drag: 0.22,
                scaleStart: Phaser.Math.FloatBetween(0.06, 0.12),
                scaleEnd: Phaser.Math.FloatBetween(0.28, 0.58),
                alphaStart: Phaser.Math.FloatBetween(0.04, 0.1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xb4c0b9, 0x9ea9a3, 0xc2ccc7, 0x9cffb2]),
            });
            this.nextFloorSteamAt = time + Phaser.Math.Between(220, 460);
        }
        if (time >= (this.nextBrokenLampSparkAt || 0) && Array.isArray(this.environmentLampLights)) {
            const broken = this.environmentLampLights.filter((l) => l && l.broken);
            if (broken.length > 0) {
                const lamp = Phaser.Utils.Array.GetRandom(broken);
                const px = lamp.x + Phaser.Math.Between(-5, 5);
                const py = lamp.y + Phaser.Math.Between(-5, 5);
                this.spawnFxSprite('dot', px, py, {
                    life: Phaser.Math.Between(120, 240),
                    vx: Phaser.Math.FloatBetween(-20, 20),
                    vy: Phaser.Math.FloatBetween(-38, -12),
                    gravityY: Phaser.Math.FloatBetween(40, 90),
                    scaleStart: Phaser.Math.FloatBetween(0.09, 0.18),
                    scaleEnd: 0,
                    alphaStart: Phaser.Math.FloatBetween(0.68, 0.96),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xffe89d, 0xffc971, 0x9fd7ff]),
                });
                this.spawnFxSprite('ring', px, py, {
                    life: Phaser.Math.Between(90, 180),
                    scaleStart: Phaser.Math.FloatBetween(0.08, 0.14),
                    scaleEnd: Phaser.Math.FloatBetween(0.22, 0.36),
                    alphaStart: Phaser.Math.FloatBetween(0.1, 0.24),
                    alphaEnd: 0,
                    tint: 0xb8ddff,
                });
            }
            this.nextBrokenLampSparkAt = time + Phaser.Math.Between(320, 820);
        }
        return sprite;
    }

    acquireFxSprite(poolKey) {
        const pool = this.fxPools[poolKey] || this.fxDotPool;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].active) return pool[i];
        }
        return null;
    }

    spawnFxSprite(poolKey, x, y, options = {}) {
        const activeCount = this.fxActiveSprites ? this.fxActiveSprites.length : 0;
        const impactFxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const intensityNorm = Phaser.Math.Clamp((impactFxIntensity - 0.2) / 2.8, 0, 1);
        const intensityCapMul = Phaser.Math.Linear(0.9, 1.32, intensityNorm);
        const now = this.time.now || 0;
        const windowMs = Math.max(8, Number(this.fxSpawnWindowMs) || 16);
        if ((now - (this.fxSpawnWindowStart || 0)) > windowMs) {
            this.fxSpawnWindowStart = now;
            this.fxSpawnedInWindow = 0;
        }
        const burstBase = Math.max(12, Number(this.runtimeSettings?.walls?.fxBurstCapBase) || 56);
        const burstMul = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.fxBurstCapMul) || 1, 0.4, 3);
        const windowCap = Math.max(12, Math.floor(burstBase * (this.fxQualityScale || 1) * burstMul));
        if ((this.fxSpawnedInWindow || 0) >= windowCap) return null;
        const baseCap = this.fxPoolCaps[poolKey] || 350;
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
            drag: Number.isFinite(Number(options.drag))
                ? Math.max(0, Number(options.drag))
                : (poolKey === 'smoke' ? 1.8 : 0),
        };
        this.fxActiveSprites.push(sprite);
        this.fxSpawnedInWindow = (this.fxSpawnedInWindow || 0) + 1;
        return sprite;
    }

    updateFxSprites(delta) {
        if (!this.fxActiveSprites || this.fxActiveSprites.length === 0) return;
        const dt = Math.max(0.001, delta / 1000);
        const arr = this.fxActiveSprites;
        let len = arr.length;
        for (let i = len - 1; i >= 0; i--) {
            const sprite = arr[i];
            const fx = sprite.fx;
            if (!sprite.active || !fx) {
                // Swap-and-pop: O(1) removal instead of O(n) splice
                arr[i] = arr[len - 1];
                len--;
                continue;
            }
            fx.life -= delta;
            if (fx.life <= 0) {
                sprite.setActive(false);
                sprite.setVisible(false);
                sprite.fx = null;
                arr[i] = arr[len - 1];
                len--;
                continue;
            }
            const t = Phaser.Math.Clamp(1 - (fx.life / fx.maxLife), 0, 1);
            sprite.x += fx.vx * dt;
            sprite.y += fx.vy * dt;
            fx.vy += fx.gravityY * dt;
            if (fx.drag > 0) {
                const damp = Math.max(0, 1 - fx.drag * dt);
                fx.vx *= damp;
                fx.vy *= damp;
            }
            sprite.rotation += fx.spin * dt;
            sprite.setScale(Phaser.Math.Linear(fx.scaleStart, fx.scaleEnd, t));
            sprite.setAlpha(Phaser.Math.Linear(fx.alphaStart, fx.alphaEnd, t));
        }
        arr.length = len;
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

    createSeededRandom(seedText) {
        const text = String(seedText || 'seed');
        let h = 2166136261 >>> 0;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return function rnd() {
            h += 0x6D2B79F5;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    tileToWorldCenter(tileX, tileY) {
        return {
            x: tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5,
            y: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5,
        };
    }

    collectMarkerTiles(markers, markerValue) {
        if (!Array.isArray(markers)) return [];
        const out = [];
        for (let y = 0; y < markers.length; y++) {
            const row = markers[y];
            if (!Array.isArray(row)) continue;
            for (let x = 0; x < row.length; x++) {
                if ((row[x] | 0) === markerValue) out.push({ x, y });
            }
        }
        return out;
    }

    initAtmosphereZones(missionLayout) {
        const existing = Array.isArray(this.atmoZones) ? this.atmoZones : [];
        this.atmoZones = [...existing];
        const markers = missionLayout?.tilemap?.markers;
        const zone4 = this.collectMarkerTiles(markers, 4);
        const zone5 = this.collectMarkerTiles(markers, 5);
        for (const t of zone4) {
            const p = this.tileToWorldCenter(t.x, t.y);
            this.atmoZones.push({ x: p.x, y: p.y, radius: 120, steamBias: 1.1, bokehBias: 0.75 });
        }
        for (const t of zone5) {
            const p = this.tileToWorldCenter(t.x, t.y);
            this.atmoZones.push({ x: p.x, y: p.y, radius: 138, steamBias: 1.35, bokehBias: 0.95 });
        }
        // Add subtle steam/mist pockets near selected doorways for industrial atmosphere.
        const groups = Array.isArray(this.doorManager?.doorGroups) ? this.doorManager.doorGroups : [];
        for (let i = 0; i < groups.length; i++) {
            if (i % 3 !== 0) continue;
            const center = this.getDoorGroupCenter(groups[i]);
            if (!center) continue;
            this.atmoZones.push({
                x: center.x + Phaser.Math.Between(-14, 14),
                y: center.y + Phaser.Math.Between(-14, 14),
                radius: Phaser.Math.Between(86, 128),
                steamBias: Phaser.Math.FloatBetween(1.15, 1.55),
                bokehBias: Phaser.Math.FloatBetween(0.35, 0.72),
            });
        }
        // Load environmental lighting zones from authored props (zone_colony / zone_damaged / zone_hive).
        // These override localized darkness and softness when the leader enters the zone.
        this._lightingZones = [];
        const ZONE_LIGHTING = {
            zone_colony: {
                ambientDarkness: 0.68,
                torchRange: 310,
                softRadius: 248,
                coreAlpha: 0.9,
                featherLayers: 16,
                featherSpread: 1.26,
                featherDecay: 0.72,
                glowStrength: 1.18,
            },
            zone_damaged: {
                ambientDarkness: 0.86,
                torchRange: 195,
                softRadius: 214,
                coreAlpha: 0.84,
                featherLayers: 18,
                featherSpread: 1.34,
                featherDecay: 0.64,
                glowStrength: 1.04,
            },
            zone_hive: {
                ambientDarkness: 0.96,
                torchRange: 150,
                softRadius: 178,
                coreAlpha: 0.76,
                featherLayers: 20,
                featherSpread: 1.48,
                featherDecay: 0.58,
                glowStrength: 0.9,
            },
        };
        const props = missionLayout?.tilemap?.props;
        if (Array.isArray(props)) {
            for (const p of props) {
                if (!p || !ZONE_LIGHTING[p.type]) continue;
                const wx = (Number(p.tileX) || 0) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5;
                const wy = (Number(p.tileY) || 0) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE * 0.5;
                const r = Math.max(64, Number(p.radius) || 128);
                this._lightingZones.push({
                    x: wx, y: wy, radius: r,
                    type: p.type,
                    ...ZONE_LIGHTING[p.type],
                });
            }
        }
        this._currentLightingZone = null;
    }

    /** Check if leader has entered a lighting zone and update activeLightingOverrides accordingly. */
    _updateZoneLighting() {
        if (!Array.isArray(this._lightingZones) || this._lightingZones.length === 0) return;
        const zoneKeys = ['ambientDarkness', 'torchRange', 'softRadius', 'coreAlpha', 'featherLayers', 'featherSpread', 'featherDecay', 'glowStrength'];
        let best = null;
        let bestDist = Infinity;
        for (const zone of this._lightingZones) {
            const dx = this.leader.x - zone.x;
            const dy = this.leader.y - zone.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= zone.radius && dist < bestDist) {
                best = zone;
                bestDist = dist;
            }
        }
        const prev = this._currentLightingZone;
        this._currentLightingZone = best;
        if (prev !== best) {
            // Zone changed — apply or clear only the dedicated zone override layer.
            if (best) {
                this.zoneLightingOverrides = zoneKeys.reduce((acc, key) => {
                    if (typeof best[key] === 'number') acc[key] = best[key];
                    return acc;
                }, {});
                this.applyEffectiveLightingSettings();
            } else if (prev) {
                this.zoneLightingOverrides = {};
                this.applyEffectiveLightingSettings();
            }
        }
    }

    initAlarmLights(missionLayout) {
        const markers = missionLayout?.tilemap?.markers;
        const alarmTiles = this.collectMarkerTiles(markers, 6);
        if (!Array.isArray(this.environmentAlarmLights)) this.environmentAlarmLights = [];
        for (const t of alarmTiles) {
            const p = this.tileToWorldCenter(t.x, t.y);
            this.environmentAlarmLights.push({
                x: p.x,
                y: p.y,
                angle: -Math.PI * 0.5,
                halfAngle: Math.PI,
                range: Phaser.Math.Between(150, 210),
                intensity: Phaser.Math.FloatBetween(0.2, 0.33),
                softRadius: Phaser.Math.Between(122, 168),
                pulseSpeed: Phaser.Math.FloatBetween(0.34, 0.56),
                seed: Math.random(),
                color: Phaser.Utils.Array.GetRandom([0xff3636, 0xff4545, 0xe93333]),
            });
        }
    }

    initRouteEventController(missionLayout) {
        const missionId = String(this.activeMission?.id || '');
        this.routeEventController = {
            enabled: false,
            extractStarted: false,
            startAt: 0,
            nextIndex: 0,
            events: [],
            missionId,
        };
        if (missionId !== 'm3' && missionId !== 'm4' && missionId !== 'm5') return;
        const groups = Array.isArray(this.doorManager?.doorGroups) ? this.doorManager.doorGroups : [];
        if (groups.length <= 0) return;
        const mapCx = (Number(missionLayout?.tilemap?.width) || 1) * CONFIG.TILE_SIZE * 0.5;
        const mapCy = (Number(missionLayout?.tilemap?.height) || 1) * CONFIG.TILE_SIZE * 0.5;
        const ranked = groups.map((group) => {
            const c = this.getDoorGroupCenter(group);
            return {
                group,
                center: c,
                centerDist: Phaser.Math.Distance.Between(c.x, c.y, mapCx, mapCy),
            };
        });
        const byCenter = ranked.slice().sort((a, b) => a.centerDist - b.centerDist);
        const byNorth = ranked.slice().sort((a, b) => a.center.y - b.center.y);
        const byWest = ranked.slice().sort((a, b) => a.center.x - b.center.x);
        const byEast = ranked.slice().sort((a, b) => b.center.x - a.center.x);
        const primary = byCenter[0]?.group || groups[0];
        const north = byNorth.find((e) => e.group !== primary)?.group || byNorth[0]?.group || primary;
        const west = byWest.find((e) => e.group !== primary && e.group !== north)?.group || byWest[0]?.group || primary;
        const east = byEast.find((e) => e.group !== primary && e.group !== north && e.group !== west)?.group || byEast[0]?.group || primary;
        const events = [];
        if (missionId === 'm3') {
            // Queen Cathedral: lockdown sequence forces route adaptation around queen zone
            events.push({ delayMs: 4500, action: 'seal', group: north, text: 'QUEEN LOCKDOWN: NORTH HATCH SEALED', color: '#ffb39f' });
            events.push({ delayMs: 10500, action: 'open', group: west, text: 'QUEEN LOCKDOWN: WEST FLANK OPEN', color: '#9fddff' });
            events.push({ delayMs: 17500, action: 'seal', group: east, text: 'QUEEN LOCKDOWN: EAST HATCH SEALED', color: '#ffb39f' });
            events.push({ delayMs: 24500, action: 'open', group: north, text: 'QUEEN LOCKDOWN: NORTH HATCH RELEASED', color: '#c4ffcb' });
        } else if (missionId === 'm4') {
            // Hydroponics Array: grow-bay access shifts force replanning
            events.push({ delayMs: 5000, action: 'seal', group: primary, text: 'ROUTE SHIFT: GROW-BAY ACCESS SEALED', color: '#ffbf99' });
            events.push({ delayMs: 12500, action: 'open', group: west, text: 'ROUTE SHIFT: EMERGENCY BYPASS WEST', color: '#9fe7ff' });
            events.push({ delayMs: 19500, action: 'open', group: primary, text: 'ROUTE SHIFT: ACCESS RESTORED', color: '#c4ffcb' });
        } else {
            // Docking Ring (m5): ring sector lockdown
            events.push({ delayMs: 4500, action: 'seal', group: north, text: 'RING LOCKDOWN: NORTH SECTOR SEALED', color: '#ffb39f' });
            events.push({ delayMs: 10500, action: 'open', group: west, text: 'RING LOCKDOWN: WEST CORRIDOR OPEN', color: '#9fddff' });
            events.push({ delayMs: 17500, action: 'seal', group: east, text: 'RING LOCKDOWN: EAST SECTOR SEALED', color: '#ffb39f' });
            events.push({ delayMs: 24500, action: 'open', group: north, text: 'RING LOCKDOWN: NORTH SECTOR RELEASED', color: '#c4ffcb' });
        }
        this.routeEventController.events = events;
        this.routeEventController.enabled = events.length > 0;
    }

    applyRouteDoorAction(action, doorGroup) {
        if (!doorGroup) return false;
        const pathGrid = this.pathGrid;
        const physicsGroup = this.doorManager.physicsGroup;
        const lightBlockerGrid = this.lightBlockerGrid;
        const wallLayer = this.wallLayer;
        if (action === 'seal') {
            if (doorGroup.state === 'open') {
                doorGroup.close(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
            }
            doorGroup.weld(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
            return true;
        }
        if (action === 'open') {
            doorGroup.forceOpen(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
            return true;
        }
        return false;
    }

    updateTimedRouteEvents(time, stage, _missionState = null) {
        const ctl = this.routeEventController;
        if (!ctl || ctl.enabled !== true) return;
        if (!ctl.extractStarted) {
            if (stage !== 'extract') return;
            ctl.extractStarted = true;
            ctl.startAt = time;
            ctl.nextIndex = 0;
            this.showFloatingText(this.leader.x, this.leader.y - 30, 'WARNING: ROUTE SYSTEMS CYCLING', '#ffd6a8');
        }
        while (ctl.nextIndex < ctl.events.length) {
            const ev = ctl.events[ctl.nextIndex];
            if (!ev || time < (ctl.startAt + ev.delayMs)) break;
            const ok = this.applyRouteDoorAction(ev.action, ev.group);
            if (ok && ev.text) {
                this.showFloatingText(this.leader.x, this.leader.y - 32, String(ev.text), String(ev.color || '#a9d8ff'));
            }
            ctl.nextIndex++;
        }
    }

    initExtractionSecurityGates() {
        this.extractionSecurity = {
            enabled: false,
            unlocked: false,
            gates: [],
        };
        const requiredCards = Math.max(0, Math.floor(Number(this.activeMission?.requiredCards) || 0));
        const requiredTerminals = Math.max(0, Math.floor(Number(this.activeMission?.requiredTerminals) || 0));
        if ((requiredCards + requiredTerminals) <= 0) return;
        if (!this.extractionWorldPos || !this.doorManager?.doorGroups) return;

        const ranked = [];
        for (const group of this.doorManager.doorGroups) {
            const center = this.getDoorGroupCenter(group);
            const dist = Phaser.Math.Distance.Between(center.x, center.y, this.extractionWorldPos.x, this.extractionWorldPos.y);
            if (dist > CONFIG.TILE_SIZE * 8) continue;
            ranked.push({ group, dist });
        }
        ranked.sort((a, b) => a.dist - b.dist);
        const picked = ranked.slice(0, 3).map((r) => r.group);
        if (picked.length <= 0) return;

        for (const group of picked) {
            if (group.supportsHackLock) {
                group.lock(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
            } else {
                group.weld(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
            }
        }
        this.extractionSecurity.enabled = true;
        this.extractionSecurity.gates = picked;
    }

    updateExtractionSecurityGates(missionState, time = this.time.now) {
        const sec = this.extractionSecurity;
        if (!sec || sec.enabled !== true || sec.unlocked === true) return;
        if (!missionState || missionState.readyForExtraction !== true) return;
        sec.unlocked = true;
        for (const group of sec.gates || []) {
            group.forceOpen(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
        }
        this.showFloatingText(this.leader.x, this.leader.y - 30, 'SECURITY GATES UNLOCKED: ELEVATOR ACCESS', '#aef3c2');
        this.nextDoorThumpCueAt = Math.max(this.nextDoorThumpCueAt || 0, time + 800);
    }

    _buildMapAmbientLights(missionLayout) {
        const terrain = missionLayout?.tilemap?.terrain;
        const width   = missionLayout?.tilemap?.width  || 0;
        const height  = missionLayout?.tilemap?.height || 0;
        const ts      = CONFIG.TILE_SIZE;
        if (!terrain || width <= 0 || height <= 0 || !this.lightingOverlay) return;

        const lights  = [];
        const areaTiles = width * height;
        // Large maps were generating hundreds of procedural fill lights that then
        // had to be redrawn every frame in WebGL. Thin the grid as map size grows.
        const spacing = areaTiles >= 6000 ? 8 : (areaTiles >= 3600 ? 7 : 6);

        for (let ty = 1; ty < height - 1; ty++) {
            for (let tx = 1; tx < width - 1; tx++) {
                if (terrain[ty]?.[tx] !== 0) continue;
                if (tx % spacing !== 0 || ty % spacing !== 0) continue;

                // Corridor detection: walls close on one axis but open on the other.
                const wN1 = terrain[ty - 1]?.[tx] === 1;
                const wS1 = terrain[ty + 1]?.[tx] === 1;
                const wE1 = terrain[ty]?.[tx + 1] === 1;
                const wW1 = terrain[ty]?.[tx - 1] === 1;
                const wN2 = !wN1 && terrain[ty - 2]?.[tx] === 1;
                const wS2 = !wS1 && terrain[ty + 2]?.[tx] === 1;
                const wE2 = !wE1 && terrain[ty]?.[tx + 2] === 1;
                const wW2 = !wW1 && terrain[ty]?.[tx - 2] === 1;

                const closedV = (wN1 || wN2) && (wS1 || wS2);
                const closedH = (wE1 || wE2) && (wW1 || wW2);
                const isCorridor = (closedV && !closedH) || (!closedV && closedH);

                lights.push({
                    x:         (tx + 0.5) * ts,
                    y:         (ty + 0.5) * ts,
                    color:     isCorridor ? 0xff4444 : 0x7aaabb,
                    radius:    isCorridor ? 164 : 196,
                    intensity: isCorridor ? 0.24 : 0.11,
                    procedural: true,
                });
            }
        }

        // Append authored lights from editor
        const authoredLights = Array.isArray(missionLayout?.lights) ? missionLayout.lights : [];
        if (authoredLights.length > 0) console.log(`[ALIENS] Loaded ${authoredLights.length} authored light(s) from editor`);
        for (const al of authoredLights) {
            const tx = Number(al.tileX);
            const ty = Number(al.tileY);
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const hexColor = String(al.color || '#ffffff');
            const colorNum = parseInt(hexColor.replace('#', ''), 16) || 0xffffff;
            lights.push({
                x:         (tx + 0.5) * ts,
                y:         (ty + 0.5) * ts,
                color:     colorNum,
                radius:    Math.max(20, Number(al.radius) || 150),
                intensity: Phaser.Math.Clamp(Number(al.brightness) || 0.5, 0, 1),
                flickering: !!al.flickering,
                pulsing:    !!al.pulsing,
                type:       String(al.type || 'spot'),
                procedural: false,
            });
        }

        this.lightingOverlay.setStaticLights(lights);
    }

    placeRoomProps(missionLayout) {
        // Procedural prop generation disabled — all props come from the map editor.
        return;
        if (!Array.isArray(this.atmoZones)) this.atmoZones = [];
        const terrain = missionLayout.tilemap.terrain;
        const width = missionLayout.tilemap.width;
        const height = missionLayout.tilemap.height;
        if (width <= 0 || height <= 0) return;
        const rnd = this.createSeededRandom(`props:${missionLayout?.mission?.id || 'm'}:${width}x${height}`);
        const reserved = new Set();
        const reserve = (x, y, radius = 0) => {
            for (let oy = -radius; oy <= radius; oy++) {
                for (let ox = -radius; ox <= radius; ox++) {
                    const tx = x + ox;
                    const ty = y + oy;
                    if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
                    reserved.add(`${tx},${ty}`);
                }
            }
        };
        reserve(missionLayout.spawnTile.x, missionLayout.spawnTile.y, 2);
        reserve(missionLayout.extractionTile.x, missionLayout.extractionTile.y, 2);
        for (const doorDef of missionLayout.doorDefinitions || []) {
            for (const t of doorDef.tiles || []) reserve(t.x, t.y, 1);
        }
        for (const cluster of EGG_CLUSTERS || []) {
            for (const eggTile of cluster || []) {
                reserve(eggTile.tileX, eggTile.tileY, 1);
            }
        }
        const markers = missionLayout.tilemap.markers || [];
        for (let y = 0; y < markers.length; y++) {
            for (let x = 0; x < (markers[y]?.length || 0); x++) {
                if ((markers[y][x] | 0) > 0) reserve(x, y, 3);
            }
        }
        if (missionLayout.spawnTile) reserve(missionLayout.spawnTile.x, missionLayout.spawnTile.y, 4);
        if (missionLayout.extractionTile) reserve(missionLayout.extractionTile.x, missionLayout.extractionTile.y, 4);

        const isFloor = (x, y) => (
            x >= 0 && y >= 0 && x < width && y < height && terrain[y][x] === 0
        );
        const neighbors8 = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0], [1, 0],
            [-1, 1], [0, 1], [1, 1],
        ];
        const candidates = [];
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (!isFloor(x, y)) continue;
                if (reserved.has(`${x},${y}`)) continue;
                const open4 = isFloor(x - 1, y) && isFloor(x + 1, y) && isFloor(x, y - 1) && isFloor(x, y + 1);
                if (!open4) continue;
                let open8 = 0;
                for (const d of neighbors8) {
                    if (isFloor(x + d[0], y + d[1])) open8++;
                }
                if (open8 < 6) continue;
                candidates.push({ x, y });
            }
        }
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = t;
        }
        const floorCount = width * height;
        const missionId = String(missionLayout?.mission?.id || '');
        const propScaleByMission = {
            m1: 0.58,
            m2: 0.78,
            m3: 0.86,
            m4: 0.84,
            m5: 0.82,
        };
        const propScale = Phaser.Math.Clamp(Number(propScaleByMission[missionId] ?? 0.84), 0.45, 1);
        const deskTarget = Phaser.Math.Clamp(Math.round((floorCount / 170) * propScale), 3, 24);
        const lampTarget = Phaser.Math.Clamp(Math.round((floorCount / 420) * propScale), 1, 10);
        const containerTarget = Phaser.Math.Clamp(Math.round((floorCount / 240) * propScale), 2, 18);
        const barrelTarget = Phaser.Math.Clamp(Math.round((floorCount / 200) * propScale), 3, 24);
        const placedDesks = [];
        const placedLamps = [];
        const placedContainers = [];
        const placedBarrels = [];
        const farEnough = (list, tx, ty, minDistTiles) => {
            const minSq = minDistTiles * minDistTiles;
            for (const p of list) {
                const dx = p.x - tx;
                const dy = p.y - ty;
                if ((dx * dx + dy * dy) < minSq) return false;
            }
            return true;
        };
        let connectivityState = this.computePathGridConnectivity(missionLayout.spawnTile, missionLayout.extractionTile);
        const preservePathConnectivity = !!(
            this.pathGrid
            && connectivityState
            && connectivityState.spawnReachable
            && connectivityState.extractionReachable
        );
        const normalizeTiles = (tiles) => {
            const out = [];
            const seen = new Set();
            for (const t of tiles || []) {
                const tx = Number(t?.x);
                const ty = Number(t?.y);
                if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
                if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
                const key = `${tx},${ty}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ x: tx, y: ty, key });
            }
            return out;
        };
        const wouldKeepConnectivity = (tiles) => {
            if (!preservePathConnectivity || !this.pathGrid) return true;
            const uniqueTiles = normalizeTiles(tiles);
            if (uniqueTiles.length <= 0) return false;
            const touched = [];
            for (const t of uniqueTiles) {
                const wasWalkable = !!this.pathGrid.isWalkable(t.x, t.y);
                if (!wasWalkable) {
                    for (const r of touched) this.pathGrid.setWalkable(r.x, r.y, true);
                    return false;
                }
                touched.push(t);
                this.pathGrid.setWalkable(t.x, t.y, false);
            }
            const trial = this.computePathGridConnectivity(missionLayout.spawnTile, missionLayout.extractionTile);
            for (const r of touched) this.pathGrid.setWalkable(r.x, r.y, true);
            if (!trial || !trial.spawnReachable || !trial.extractionReachable) return false;
            let blockedReachable = 0;
            for (const t of uniqueTiles) {
                if (connectivityState.reachableSet?.has(t.key)) blockedReachable++;
            }
            const minExpectedReachable = Math.max(0, (connectivityState.reachableCount || 0) - blockedReachable);
            return trial.reachableCount >= minExpectedReachable;
        };
        const commitConnectivityTiles = (tiles) => {
            if (!preservePathConnectivity || !this.pathGrid) return;
            const uniqueTiles = normalizeTiles(tiles);
            for (const t of uniqueTiles) this.pathGrid.setWalkable(t.x, t.y, false);
            connectivityState = this.computePathGridConnectivity(missionLayout.spawnTile, missionLayout.extractionTile);
        };

        for (const c of candidates) {
            if (placedDesks.length >= deskTarget) break;
            if (!isFloor(c.x + 1, c.y) || reserved.has(`${c.x + 1},${c.y}`)) continue;
            if (!farEnough(placedDesks, c.x, c.y, 2.4)) continue;
            if (!farEnough(placedLamps, c.x, c.y, 1.8)) continue;
            if (!wouldKeepConnectivity([{ x: c.x, y: c.y }, { x: c.x + 1, y: c.y }])) continue;
            placedDesks.push({ x: c.x, y: c.y });
            reserve(c.x, c.y, 0);
            reserve(c.x + 1, c.y, 0);
            commitConnectivityTiles([{ x: c.x, y: c.y }, { x: c.x + 1, y: c.y }]);
        }
        for (const c of candidates) {
            if (placedLamps.length >= lampTarget) break;
            if (!farEnough(placedLamps, c.x, c.y, 4.2)) continue;
            if (!farEnough(placedDesks, c.x, c.y, 2.3)) continue;
            if (!farEnough(placedContainers, c.x, c.y, 2.2)) continue;
            if (!farEnough(placedBarrels, c.x, c.y, 1.8)) continue;
            if (!wouldKeepConnectivity([{ x: c.x, y: c.y }])) continue;
            placedLamps.push({ x: c.x, y: c.y });
            reserve(c.x, c.y, 0);
            commitConnectivityTiles([{ x: c.x, y: c.y }]);
        }
        for (const c of candidates) {
            if (placedContainers.length >= containerTarget) break;
            if (!farEnough(placedContainers, c.x, c.y, 3.1)) continue;
            if (!farEnough(placedDesks, c.x, c.y, 2.1)) continue;
            if (!farEnough(placedLamps, c.x, c.y, 1.8)) continue;
            if (!farEnough(placedBarrels, c.x, c.y, 1.4)) continue;
            if (!wouldKeepConnectivity([{ x: c.x, y: c.y }])) continue;
            placedContainers.push({ x: c.x, y: c.y });
            reserve(c.x, c.y, 0);
            commitConnectivityTiles([{ x: c.x, y: c.y }]);
        }
        for (const c of candidates) {
            if (placedBarrels.length >= barrelTarget) break;
            if (!farEnough(placedBarrels, c.x, c.y, 2.6)) continue;
            if (!farEnough(placedDesks, c.x, c.y, 1.8)) continue;
            if (!farEnough(placedLamps, c.x, c.y, 1.4)) continue;
            if (!farEnough(placedContainers, c.x, c.y, 1.6)) continue;
            if (!wouldKeepConnectivity([{ x: c.x, y: c.y }])) continue;
            placedBarrels.push({ x: c.x, y: c.y });
            reserve(c.x, c.y, 0);
            commitConnectivityTiles([{ x: c.x, y: c.y }]);
        }

        const depth = 6;
        for (const d of placedDesks) {
            const p = this.tileToWorldCenter(d.x, d.y);
            const s = this.add.sprite(p.x + CONFIG.TILE_SIZE * 0.5, p.y, 'prop_desk');
            s.setDepth(depth);
            s.setAlpha(0.9);
            s.setRotation(rnd() < 0.5 ? 0 : Math.PI);
            if (this.roomPropGroup) {
                this.roomPropGroup.add(s);
                if (s.body && typeof s.body.setSize === 'function') {
                    s.body.setSize(CONFIG.TILE_SIZE * 2 - 6, CONFIG.TILE_SIZE - 8, true);
                }
                if (typeof s.refreshBody === 'function') s.refreshBody();
            }
            if (this.pathGrid) {
                this.pathGrid.setWalkable(d.x, d.y, false);
                this.pathGrid.setWalkable(d.x + 1, d.y, false);
            }
            if (this.lightBlockerGrid) {
                this.lightBlockerGrid.setTileBlocking(d.x, d.y, true);
                this.lightBlockerGrid.setTileBlocking(d.x + 1, d.y, true);
            }
            s._roomPropRadius = 24;
            this.roomProps.push({ kind: 'desk', tileX: d.x, tileY: d.y, sprite: s, blocksLight: true, radius: 24 });
        }
        for (const l of placedLamps) {
            const p = this.tileToWorldCenter(l.x, l.y);
            const s = this.add.sprite(p.x, p.y, 'prop_lamp');
            s.setDepth(depth + 0.2);
            s.setAlpha(0.95);
            if (this.roomPropGroup) {
                this.roomPropGroup.add(s);
                if (s.body && typeof s.body.setSize === 'function') {
                    s.body.setSize(CONFIG.TILE_SIZE - 8, CONFIG.TILE_SIZE - 8, true);
                }
                if (typeof s.refreshBody === 'function') s.refreshBody();
            }
            if (this.pathGrid) {
                this.pathGrid.setWalkable(l.x, l.y, false);
            }
            s._roomPropRadius = 8;
            this.roomProps.push({ kind: 'lamp', tileX: l.x, tileY: l.y, sprite: s, blocksLight: false, radius: 8 });
            const lit = rnd() < 0.68;
            if (lit) {
                const broken = rnd() < 0.24;
                this.environmentLampLights.push({
                    x: p.x,
                    y: p.y,
                    angle: 0,
                    halfAngle: Math.PI,
                    range: Phaser.Math.Between(118, 152),
                    kind: 'lamp',
                    intensity: Phaser.Math.FloatBetween(0.46, 0.7) * (broken ? Phaser.Math.FloatBetween(0.62, 0.9) : 1),
                    softRadius: Phaser.Math.Between(108, 148),
                    seed: rnd(),
                    broken,
                });
                if (rnd() < 0.58) {
                    const spotAngle = this.pickLampSpotAngle(l.x, l.y, isFloor, rnd);
                    if (Number.isFinite(spotAngle)) {
                        this.environmentSpotLights.push({
                            x: p.x,
                            y: p.y,
                            angle: spotAngle,
                            halfAngle: Phaser.Math.FloatBetween(0.34, 0.58),
                            range: Phaser.Math.Between(170, 244),
                            intensity: Phaser.Math.FloatBetween(0.22, 0.36),
                            softRadius: Phaser.Math.Between(88, 130),
                            swingAmp: Phaser.Math.FloatBetween(0.03, 0.09),
                            swingSpeed: Phaser.Math.FloatBetween(0.36, 0.74),
                            seed: rnd(),
                            color: Phaser.Utils.Array.GetRandom([0x9ec9ef, 0xaed5f8, 0x93bce4]),
                        });
                    }
                }
            } else {
                // Unlit fixtures become atmospheric dark pockets.
                this.atmoZones.push({
                    x: p.x,
                    y: p.y,
                    radius: Phaser.Math.Between(82, 116),
                    steamBias: 0.9,
                    bokehBias: 0.4,
                });
            }
        }
        for (const c of placedContainers) {
            const p = this.tileToWorldCenter(c.x, c.y);
            const s = this.add.sprite(p.x, p.y, 'prop_container');
            s.setDepth(depth + 0.05);
            s.setAlpha(0.92);
            s.setRotation(Phaser.Utils.Array.GetRandom([0, 0, 0, Math.PI * 0.5, -Math.PI * 0.5]));
            if (this.roomPropGroup) {
                this.roomPropGroup.add(s);
                if (s.body && typeof s.body.setSize === 'function') {
                    s.body.setSize(CONFIG.TILE_SIZE - 10, CONFIG.TILE_SIZE - 12, true);
                }
                if (typeof s.refreshBody === 'function') s.refreshBody();
            }
            if (this.pathGrid) this.pathGrid.setWalkable(c.x, c.y, false);
            if (this.lightBlockerGrid) this.lightBlockerGrid.setTileBlocking(c.x, c.y, true);
            s._roomPropRadius = 16;
            this.roomProps.push({ kind: 'container', tileX: c.x, tileY: c.y, sprite: s, blocksLight: true, radius: 16 });
        }
        for (const b of placedBarrels) {
            const p = this.tileToWorldCenter(b.x, b.y);
            const s = this.add.sprite(p.x, p.y, 'prop_barrel');
            s.setDepth(depth + 0.08);
            s.setAlpha(0.9);
            s.setRotation(Phaser.Math.FloatBetween(-0.08, 0.08));
            if (this.roomPropGroup) {
                this.roomPropGroup.add(s);
                if (s.body && typeof s.body.setSize === 'function') {
                    s.body.setSize(CONFIG.TILE_SIZE - 18, CONFIG.TILE_SIZE - 16, true);
                }
                if (typeof s.refreshBody === 'function') s.refreshBody();
            }
            if (this.pathGrid) this.pathGrid.setWalkable(b.x, b.y, false);
            if (this.lightBlockerGrid) this.lightBlockerGrid.setTileBlocking(b.x, b.y, true);
            s._roomPropRadius = 12;
            this.roomProps.push({ kind: 'barrel', tileX: b.x, tileY: b.y, sprite: s, blocksLight: true, radius: 12 });
        }
    }

    registerAuthoredRoomProps(propSprites) {
        if (!Array.isArray(propSprites) || propSprites.length <= 0) return;
        for (const sprite of propSprites) {
            const tileX = Math.round(Number(sprite?._tileX));
            const tileY = Math.round(Number(sprite?._tileY));
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
            const radius = Math.max(8, Number(sprite?._roomPropRadius) || 18);
            const kind = String(sprite?._propType || sprite?.texture?.key || 'prop');
            const blocksLight = sprite?._blocksLight !== false;
            if (this.pathGrid) this.pathGrid.setWalkable(tileX, tileY, false);
            if (blocksLight && this.lightBlockerGrid) this.lightBlockerGrid.setTileBlocking(tileX, tileY, true);
            this.roomProps.push({
                kind,
                tileX,
                tileY,
                sprite,
                blocksLight,
                radius,
            });
        }
    }

    computePathGridConnectivity(spawnTile, extractionTile = null) {
        if (!this.pathGrid) {
            return {
                reachableCount: 0,
                totalWalkable: 0,
                spawnReachable: false,
                extractionReachable: false,
                reachableSet: new Set(),
            };
        }
        const grid = this.pathGrid;
        const width = Number(grid.width) || 0;
        const height = Number(grid.height) || 0;
        if (width <= 0 || height <= 0) {
            return {
                reachableCount: 0,
                totalWalkable: 0,
                spawnReachable: false,
                extractionReachable: false,
                reachableSet: new Set(),
            };
        }
        const sx = Number(spawnTile?.x);
        const sy = Number(spawnTile?.y);
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
        const isWalkable = (x, y) => inBounds(x, y) && !!grid.isWalkable(x, y);
        let totalWalkable = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (isWalkable(x, y)) totalWalkable++;
            }
        }
        if (!isWalkable(sx, sy)) {
            return {
                reachableCount: 0,
                totalWalkable,
                spawnReachable: false,
                extractionReachable: false,
                reachableSet: new Set(),
            };
        }
        const reachableSet = new Set();
        const q = [{ x: sx, y: sy }];
        reachableSet.add(`${sx},${sy}`);
        for (let i = 0; i < q.length; i++) {
            const c = q[i];
            const n = [
                { x: c.x + 1, y: c.y },
                { x: c.x - 1, y: c.y },
                { x: c.x, y: c.y + 1 },
                { x: c.x, y: c.y - 1 },
            ];
            for (const p of n) {
                if (!isWalkable(p.x, p.y)) continue;
                const key = `${p.x},${p.y}`;
                if (reachableSet.has(key)) continue;
                reachableSet.add(key);
                q.push(p);
            }
        }
        const ex = Number(extractionTile?.x);
        const ey = Number(extractionTile?.y);
        const extractionReachable = Number.isFinite(ex) && Number.isFinite(ey)
            ? reachableSet.has(`${ex},${ey}`)
            : true;
        return {
            reachableCount: reachableSet.size,
            totalWalkable,
            spawnReachable: true,
            extractionReachable,
            reachableSet,
        };
    }

    computeWalkablePathGridComponents() {
        if (!this.pathGrid) return [];
        const grid = this.pathGrid;
        const width = Number(grid.width) || 0;
        const height = Number(grid.height) || 0;
        if (width <= 0 || height <= 0) return [];
        const seen = Array.from({ length: height }, () => Array(width).fill(false));
        const comps = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (seen[y][x] || !grid.isWalkable(x, y)) continue;
                const tiles = [];
                const q = [{ x, y }];
                seen[y][x] = true;
                for (let i = 0; i < q.length; i++) {
                    const c = q[i];
                    tiles.push(c);
                    const n = [
                        { x: c.x + 1, y: c.y },
                        { x: c.x - 1, y: c.y },
                        { x: c.x, y: c.y + 1 },
                        { x: c.x, y: c.y - 1 },
                    ];
                    for (const p of n) {
                        if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue;
                        if (seen[p.y][p.x] || !grid.isWalkable(p.x, p.y)) continue;
                        seen[p.y][p.x] = true;
                        q.push(p);
                    }
                }
                comps.push(tiles);
            }
        }
        return comps;
    }

    clearRoomPropAtTile(tileX, tileY) {
        if (!Array.isArray(this.roomProps) || this.roomProps.length <= 0) return;
        for (let i = this.roomProps.length - 1; i >= 0; i--) {
            const p = this.roomProps[i];
            if (!p) continue;
            const kind = String(p.kind || '');
            if (kind === 'desk') {
                const hit = (p.tileX === tileX && p.tileY === tileY) || ((p.tileX + 1) === tileX && p.tileY === tileY);
                if (!hit) continue;
            } else if (p.tileX !== tileX || p.tileY !== tileY) {
                continue;
            }
            const s = p.sprite;
            if (s && s.active) s.destroy();
            this.roomProps.splice(i, 1);
        }
    }

    setTileWalkableAndClearWall(tileX, tileY) {
        if (!this.pathGrid) return;
        this.pathGrid.setWalkable(tileX, tileY, true);
        if (this.wallLayer?.removeTileAt) {
            this.wallLayer.removeTileAt(tileX, tileY, true, true);
        }
        this.clearRoomPropAtTile(tileX, tileY);
    }

    carveOrthogonalPathGridLink(a, b) {
        if (!a || !b) return;
        const ax = Number(a.x);
        const ay = Number(a.y);
        const bx = Number(b.x);
        const by = Number(b.y);
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return;
        const sx = Math.min(ax, bx);
        const ex = Math.max(ax, bx);
        for (let x = sx; x <= ex; x++) this.setTileWalkableAndClearWall(x, ay);
        const sy = Math.min(ay, by);
        const ey = Math.max(ay, by);
        for (let y = sy; y <= ey; y++) this.setTileWalkableAndClearWall(bx, y);
    }

    ensureGlobalPathConnectivity(spawnTile) {
        if (!this.pathGrid || !spawnTile) return;
        const sx = Number(spawnTile.x);
        const sy = Number(spawnTile.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
        let guard = 0;
        while (guard < 96) {
            guard++;
            const comps = this.computeWalkablePathGridComponents();
            if (comps.length <= 1) return;
            const spawnComp = comps.find((c) => c.some((t) => t.x === sx && t.y === sy));
            if (!spawnComp) return;
            let best = null;
            let bestCost = Infinity;
            for (const comp of comps) {
                if (comp === spawnComp) continue;
                for (let i = 0; i < Math.min(comp.length, 280); i += 2) {
                    const b = comp[i];
                    for (let j = 0; j < Math.min(spawnComp.length, 420); j += 3) {
                        const a = spawnComp[j];
                        const cost = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                        if (cost < bestCost) {
                            bestCost = cost;
                            best = { a, b };
                        }
                    }
                }
            }
            if (!best) return;
            this.carveOrthogonalPathGridLink(best.a, best.b);
        }
    }

    pickLampSpotAngle(tileX, tileY, isFloor, rnd = Math.random) {
        const dirs = [
            { dx: 0, dy: -1, angle: -Math.PI * 0.5 }, // N
            { dx: 1, dy: 0, angle: 0 }, // E
            { dx: 0, dy: 1, angle: Math.PI * 0.5 }, // S
            { dx: -1, dy: 0, angle: Math.PI }, // W
        ];
        let best = null;
        for (const d of dirs) {
            let score = 0;
            for (let step = 1; step <= 6; step++) {
                const tx = tileX + d.dx * step;
                const ty = tileY + d.dy * step;
                if (!isFloor(tx, ty)) break;
                score += 1;
                const sx = d.dy;
                const sy = -d.dx;
                if (isFloor(tx + sx, ty + sy)) score += 0.14;
                if (isFloor(tx - sx, ty - sy)) score += 0.14;
            }
            if (!best || score > best.score) best = { score, angle: d.angle };
        }
        if (!best || best.score < 2.2) return null;
        const jitter = Phaser.Math.FloatBetween(-0.18, 0.18) * (Number(rnd()) > 0.5 ? 1 : -1);
        return best.angle + jitter;
    }

    buildMarineLightSources(marines) {
        const lighting = this.runtimeSettings?.lighting || {};
        const beamWidthMul = 0.5;
        const beamRangeMul = 0.94;
        const now = this.time.now;
        // Cache marine light source objects to avoid per-frame allocations.
        if (!this._marineLightCache) this._marineLightCache = [];
        const cache = this._marineLightCache;
        // Resize cache if marine count changed
        while (cache.length < marines.length) {
            cache.push({ x: 0, y: 0, angle: 0, halfAngle: 0, range: 0, targetDist: 0, kind: 'torch',
                flareAngleBias: 0, intensity: 1, color: 0xffffff, muzzleFlashColor: 0xffffff, muzzleFlash: 0, forwardPointerBoost: 0, flareLineOffset: 0, flarePairMode: 0, flareAngleBase: 0, flareLagAngle: 0, flareVerticalShift: 0, isLeader: false });
        }
        cache.length = marines.length;
        const out = cache;
        for (let idx = 0; idx < marines.length; idx++) {
            const marine = marines[idx];
            const entry = out[idx];
            if (!Number.isFinite(marine.lightBobSeed)) {
                marine.lightBobSeed = (idx + 1) * 1.73 + Math.random() * Math.PI * 2;
            }
            if (!Number.isFinite(marine.lightFlareLineOffset)) {
                marine.lightFlareLineOffset = Phaser.Math.FloatBetween(-0.22, 0.22);
            }
            if (!Number.isFinite(marine.lightFlarePairMode)) {
                marine.lightFlarePairMode = Phaser.Math.Between(0, 1);
            }
            if (!Number.isFinite(marine.lightFlareAngleBase)) {
                if (!Number.isFinite(this._flareAngleSceneBase)) {
                    // Constrain flare axis to clock-angle band 19:15 -> 20:10.
                    // Clock-to-math conversion gives approximately 205deg..232.5deg.
                    const flareBandMin = Phaser.Math.DegToRad(205);
                    const flareBandMax = Phaser.Math.DegToRad(232.5);
                    const raw = Phaser.Math.FloatBetween(flareBandMin, flareBandMax);
                    this._flareAngleSceneBase = raw;
                }
                const flareBandMin = Phaser.Math.DegToRad(205);
                const flareBandMax = Phaser.Math.DegToRad(232.5);
                const flareBandSpan = flareBandMax - flareBandMin;
                // Subtle per-marine variation, capped inside the same band.
                const perMarineStep = flareBandSpan * 0.2;
                const centeredIdx = idx - ((marines.length - 1) * 0.5);
                marine.lightFlareAngleBase = Phaser.Math.Clamp(
                    this._flareAngleSceneBase + centeredIdx * perMarineStep,
                    flareBandMin,
                    flareBandMax
                );
            }
            if (!Number.isFinite(marine.lightFlareVerticalShift)) {
                marine.lightFlareVerticalShift = 0;
            }
            if (!Number.isFinite(marine.lightFlareLagAngle)) {
                marine.lightFlareLagAngle = Number(marine.lightFlareAngleBase) || 0;
            }
            const t = now * 0.0029 + marine.lightBobSeed;
            const vx = Number(marine?.body?.velocity?.x) || 0;
            const vy = Number(marine?.body?.velocity?.y) || 0;
            const speed = Math.hypot(vx, vy);
            const moveNorm = Phaser.Math.Clamp(speed / 130, 0, 1);
            const bobAmp = Phaser.Math.Linear(0.9, 1.6, moveNorm);
            const bobX = Math.cos(t) * bobAmp;
            const bobY = Math.sin(t * 1.12) * bobAmp;
            const bobAngle = Math.sin(t * 0.8) * Phaser.Math.Linear(0.009, 0.017, 1 - moveNorm);
            const formationPos = idx - ((marines.length - 1) * 0.5);
            const baseFlareBias = Phaser.Math.Clamp(formationPos * 0.2, -0.32, 0.32);
            const dynamicFlareBias = Math.sin(t * 0.55 + (marine.lightBobSeed || 0) * 0.7) * 0.04;
            const flareAngleBias = baseFlareBias + dynamicFlareBias;
            const isLeader = marine === this.leader;
            const shotAt = Number(marine.lastWeaponFlashAt) || -10000;
            const shotAge = now - shotAt;
            const shotPulse = Phaser.Math.Clamp(1 - (shotAge / 125), 0, 1);
            const pointer = this.input?.mousePointer || this.input?.activePointer;
            const pointerDown = !!(pointer && pointer.isDown && pointer.rightButtonDown && pointer.rightButtonDown());
            const leaderPulseActive = isLeader
                && pointerDown
                && this.inputHandler?.isFiring
                && (this.weaponManager?.currentWeaponKey || 'pulseRifle') === 'pulseRifle';
            // Keep sustained pulse-rifle glow tied to actual recent shots instead of a constant hold flare.
            const holdPulse = leaderPulseActive
                ? Phaser.Math.Clamp(1 - (shotAge / 175), 0, 1) * (0.3 + 0.22 * Math.sin(now * 0.08 + marine.lightBobSeed))
                : 0;
            const firePulse = Phaser.Math.Clamp(Math.max(shotPulse, holdPulse), 0, 1);
            const lightFirePulse = isLeader ? firePulse : 0;
            const colorPhase = now * 0.038 + marine.lightBobSeed * 1.8 + idx * 0.9;
            const warmPhase = Phaser.Math.Clamp(0.5 + 0.5 * Math.sin(colorPhase), 0, 1);
            const coolR = Phaser.Math.Linear(0x7c, 0xa4, warmPhase);
            const coolG = Phaser.Math.Linear(0xc7, 0xe0, warmPhase);
            const coolB = Phaser.Math.Linear(0xff, 0xff, warmPhase);
            const warmR = Phaser.Math.Linear(0xff, 0xff, warmPhase);
            const warmG = Phaser.Math.Linear(0xa8, 0xcf, warmPhase);
            const warmB = Phaser.Math.Linear(0x44, 0x78, warmPhase);
            const blend = firePulse * Phaser.Math.Clamp(0.6 + 0.4 * Math.sin(colorPhase * 1.23 + 1.1), 0, 1);
            const flashR = Phaser.Math.Linear(coolR, warmR, blend);
            const flashG = Phaser.Math.Linear(coolG, warmG, blend);
            const flashB = Phaser.Math.Linear(coolB, warmB, blend);
            const muzzleFlashColor = ((Math.round(flashR) << 16) | (Math.round(flashG) << 8) | Math.round(flashB));
            const facingNow = (marine.facingAngle ?? marine.rotation) || 0;
            if (!Number.isFinite(marine._torchLagAngle)) marine._torchLagAngle = facingNow;
            // Delta-corrected exponential sway: torch lags ~18% closer per frame @ 60fps.
            // A 90° turn takes ~18 frames (0.3 s) to settle — visible but not sluggish.
            const torchLastT = Number(marine._torchLagTime) || now;
            const torchDt    = Math.min(now - torchLastT, 80); // cap at 80 ms to avoid jump on tab-back
            marine._torchLagTime = now;
            const lagAlpha = 1 - Math.pow(0.82, torchDt / 16.67);
            const angleDiff = Phaser.Math.Angle.Wrap(facingNow - marine._torchLagAngle);
            marine._torchLagAngle = Phaser.Math.Angle.Wrap(marine._torchLagAngle + angleDiff * lagAlpha);
            const torchAngle = marine._torchLagAngle + bobAngle;
            const shoulderAnchor = this.resolveMarineLocalPoint(
                marine,
                torchAngle,
                Number(marine.lightShoulderLocalX) || -6.3,
                Number(marine.lightShoulderLocalY) || -2.5
            );
            entry.x = shoulderAnchor.x + bobX;
            entry.y = shoulderAnchor.y + bobY;
            entry.angle = torchAngle;
            entry.halfAngle = (lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE) * beamWidthMul * (1 + lightFirePulse * 1.35);
            entry.range = (lighting.torchRange ?? CONFIG.TORCH_RANGE) * beamRangeMul * (1 + lightFirePulse * 0.34);
            entry.kind = 'torch';
            entry.flareAngleBias = flareAngleBias;
            entry.intensity = 1.1 + lightFirePulse * 1.44;
            entry.color = 0xffffff;
            entry.muzzleFlashColor = muzzleFlashColor;
            entry.muzzleFlash = lightFirePulse;
            entry.isLeader = isLeader;
            // For the leader, compute distance to mouse cursor so the torch
            // endpoint tracks the pointer position (capped at max range).
            if (isLeader && pointer && this.cameras?.main) {
                const cam = this.cameras.main;
                const pwx = pointer.worldX;
                const pwy = pointer.worldY;
                const dxP = pwx - entry.x;
                const dyP = pwy - entry.y;
                const pointerDist = Math.sqrt(dxP * dxP + dyP * dyP);
                entry.targetDist = Math.min(pointerDist, entry.range);
            } else {
                entry.targetDist = entry.range;
            }
            entry.flareLineOffset = marine.lightFlareLineOffset;
            entry.flarePairMode = marine.lightFlarePairMode;
            entry.flareAngleBase = marine.lightFlareAngleBase;
            entry.muzzleX = Number.isFinite(Number(marine.lastMuzzleFlashX)) ? Number(marine.lastMuzzleFlashX) : marine.x;
            entry.muzzleY = Number.isFinite(Number(marine.lastMuzzleFlashY)) ? Number(marine.lastMuzzleFlashY) : marine.y;
            entry.muzzleAngle = Number.isFinite(Number(marine.lastMuzzleFlashAngle))
                ? Number(marine.lastMuzzleFlashAngle)
                : (((marine.facingAngle ?? marine.rotation) || 0) + bobAngle);
            // Use sprite-local shoulder anchor so flare origin follows marine rotation.
            const shoulder = this.resolveMarineLocalPoint(
                marine,
                facingNow,
                Number(marine.lightShoulderLocalX) || -6.3,
                Number(marine.lightShoulderLocalY) || -2.5
            );
            entry.shoulderX = shoulder.x;
            entry.shoulderY = shoulder.y;
            const flareShiftTarget = Phaser.Math.Clamp(vx / 125, -1, 1) * 22;
            marine.lightFlareVerticalShift = Phaser.Math.Linear(
                marine.lightFlareVerticalShift,
                flareShiftTarget,
                0.08
            );
            // Naturalistic lag: flare axis trails horizontal pointer influence, not instant snap.
            let flareLagTarget = Number(marine.lightFlareAngleBase) || 0;
            if (pointer && this.cameras?.main) {
                const cam = this.cameras.main;
                const px = Number(pointer.x) || 0;
                const marineSX = marine.x - cam.scrollX;
                const horizontalNorm = Phaser.Math.Clamp((px - marineSX) / (CONFIG.GAME_WIDTH * 0.5), -1, 1);
                flareLagTarget += horizontalNorm * Phaser.Math.DegToRad(20);
            }
            marine.lightFlareLagAngle = Phaser.Math.Angle.RotateTo(
                marine.lightFlareLagAngle,
                flareLagTarget,
                Phaser.Math.DegToRad(1.9)
            );
            entry.flareLagAngle = marine.lightFlareLagAngle;
            entry.flareVerticalShift = marine.lightFlareVerticalShift;
            // Enable lens flares when facing down toward camera or firing
            const facingDown = Math.sin(entry.angle) > 0.08;
            const recentShot = firePulse > 0.02;
            entry.skipTorchLensFlare = !(facingDown || recentShot);
            let forwardPointerBoost = 0;
            if (pointer && this.cameras?.main) {
                const cam = this.cameras.main;
                const px = Number(pointer.x) || 0;
                const py = Number(pointer.y) || 0;
                const marineSX = marine.x - cam.scrollX;
                const marineSY = marine.y - cam.scrollY;
                const centerDX = px - (CONFIG.GAME_WIDTH * 0.5);
                const centerDY = py - (CONFIG.GAME_HEIGHT * 0.5);
                const centerDistNorm = Phaser.Math.Clamp(
                    Math.hypot(centerDX, centerDY) / (Math.min(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT) * 0.54),
                    0,
                    1
                );
                const centerProx = 1 - centerDistNorm;
                const belowFactor = Phaser.Math.Clamp((py - (marineSY + 8)) / (CONFIG.GAME_HEIGHT * 0.34), 0, 1);
                const downAimFactor = Phaser.Math.Clamp((Math.sin(entry.angle) - 0.08) / 0.92, 0, 1);
                forwardPointerBoost = centerProx * belowFactor * downAimFactor;
            }
            entry.forwardPointerBoost = Phaser.Math.Clamp(forwardPointerBoost, 0, 1);
        }
        // Append environment + flash lights to a separate output array to avoid mutating cache
        const result = [];
        for (let i = 0; i < marines.length; i++) result.push(out[i]);
        if (Array.isArray(this.environmentLampLights) && this.environmentLampLights.length > 0) {
            const t = this.time.now * 0.001;
            for (const lamp of this.environmentLampLights) {
                const seed = Number(lamp.seed) || 0;
                const flicker = 0.9 + 0.1 * Math.sin(t * (2.4 + seed * 0.9) + seed * 5.3);
                const pulse = 0.96 + 0.04 * Math.sin(t * (0.9 + seed * 0.3) + seed * 1.7);
                const broken = lamp.broken === true;
                const burst = Math.max(0, Math.sin(t * (8.4 + seed * 3.8) + seed * 10.7));
                const stutter = Math.sin(t * (27 + seed * 6.5) + seed * 17.1) > 0.82 ? 1 : 0;
                const brokenMul = broken
                    ? Phaser.Math.Clamp(0.08 + burst * 0.62 + stutter * 0.95, 0.04, 1.2)
                    : 1;
                result.push({
                    x: lamp.x,
                    y: lamp.y,
                    angle: 0,
                    halfAngle: Math.PI,
                    range: (Number(lamp.range) || 136) * pulse,
                    kind: 'lamp',
                    intensity: (Number(lamp.intensity) || 0.44) * flicker * brokenMul,
                    softRadius: (Number(lamp.softRadius) || 118) * pulse,
                });
            }
        }
        if (Array.isArray(this.environmentSpotLights) && this.environmentSpotLights.length > 0) {
            const t = this.time.now * 0.001;
            for (const spot of this.environmentSpotLights) {
                const seed = Number(spot.seed) || 0;
                const swing = Math.sin(t * (Number(spot.swingSpeed) || 0.5) + seed * 4.2) * (Number(spot.swingAmp) || 0.06);
                const flicker = 0.9 + 0.1 * Math.sin(t * (2.2 + seed * 1.1) + seed * 6.5);
                const pulse = 0.95 + 0.05 * Math.sin(t * (0.8 + seed * 0.27) + seed * 1.9);
                result.push({
                    x: spot.x,
                    y: spot.y,
                    angle: (Number(spot.angle) || 0) + swing,
                    halfAngle: Phaser.Math.Clamp(Number(spot.halfAngle) || 0.48, 0.2, 0.8),
                    range: (Number(spot.range) || 196) * pulse,
                    kind: 'spot',
                    intensity: (Number(spot.intensity) || 0.28) * flicker,
                    softRadius: (Number(spot.softRadius) || 106) * pulse,
                    color: Number(spot.color) || 0xa6cdf2,
                });
            }
        }
        if (Array.isArray(this.environmentAlarmLights) && this.environmentAlarmLights.length > 0) {
            const t = this.time.now * 0.001;
            for (const alarm of this.environmentAlarmLights) {
                const seed = Number(alarm.seed) || 0;
                const pulseSpeed = Number(alarm.pulseSpeed) || 0.45;
                // Slow warning-beacon pulse: smooth rise/fall with a mild sharper crest.
                const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t + seed * 3.1) * Math.PI * pulseSpeed * 2));
                const crest = Math.pow(pulse, 1.25);
                result.push({
                    x: alarm.x,
                    y: alarm.y,
                    angle: Number(alarm.angle) || 0,
                    halfAngle: Number(alarm.halfAngle) || Math.PI,
                    range: (Number(alarm.range) || 176) * Phaser.Math.Linear(0.9, 1.08, crest),
                    kind: 'alarm',
                    intensity: (Number(alarm.intensity) || 0.25) * Phaser.Math.Linear(0.52, 1.15, crest),
                    softRadius: (Number(alarm.softRadius) || 146) * Phaser.Math.Linear(0.9, 1.12, crest),
                    color: Number(alarm.color) || 0xff3b3b,
                    pulse: crest,
                });
            }
        }
        // Prune expired flash/spark lights in-place
        let writeIdx = 0;
        for (let i = 0; i < this.gunFlashLights.length; i++) {
            if (this.gunFlashLights[i].expiresAt > now) this.gunFlashLights[writeIdx++] = this.gunFlashLights[i];
        }
        this.gunFlashLights.length = writeIdx;
        writeIdx = 0;
        for (let i = 0; i < this.sparkLights.length; i++) {
            if (this.sparkLights[i].expiresAt > now) this.sparkLights[writeIdx++] = this.sparkLights[i];
        }
        this.sparkLights.length = writeIdx;
        for (const f of this.gunFlashLights) {
            const t = Phaser.Math.Clamp((f.expiresAt - now) / f.duration, 0, 1);
            result.push({
                x: f.x,
                y: f.y,
                angle: f.angle,
                halfAngle: f.halfAngle ?? Math.PI,
                range: (f.rangeMin ?? 120) + (f.rangeBoost ?? 110) * t,
                kind: 'flash',
                intensity: (f.intensityMin ?? 0.82) + (f.intensityBoost ?? 0.74) * t,
                softRadius: (f.softRadiusMin ?? 120) + (f.softRadiusBoost ?? 130) * t,
            });
        }
        for (const f of this.sparkLights) {
            const t = Phaser.Math.Clamp((f.expiresAt - now) / f.duration, 0, 1);
            result.push({
                x: f.x,
                y: f.y,
                angle: 0,
                halfAngle: Math.PI,
                range: (f.rangeMin ?? 18) + (f.rangeBoost ?? 34) * t,
                kind: 'spark',
                intensity: (f.intensityMin ?? 0.38) + (f.intensityBoost ?? 0.26) * t,
                softRadius: (f.softRadiusMin ?? 26) + (f.softRadiusBoost ?? 28) * t,
                color: f.color ?? 0xffffff,
            });
        }
        return result;
    }

    addGunFlashLight(x, y, angle, time, weaponKey = 'pulseRifle') {
        const profiles = {
            pulseRifle: {
                duration: 68, halfAngle: 0.42, rangeMin: 128, rangeBoost: 92,
                intensityMin: 1.36, intensityBoost: 1.18, softRadiusMin: 62, softRadiusBoost: 46,
            },
            shotgun: {
                duration: 190, halfAngle: 1.35, rangeMin: 230, rangeBoost: 250,
                intensityMin: 1.18, intensityBoost: 1.05, softRadiusMin: 220, softRadiusBoost: 200,
            },
            pistol: {
                duration: 120, halfAngle: 0.82, rangeMin: 140, rangeBoost: 145,
                intensityMin: 0.78, intensityBoost: 0.66, softRadiusMin: 130, softRadiusBoost: 120,
            },
        };
        const p = profiles[weaponKey] || profiles.pulseRifle;
        const duration = p.duration;
        if (this.gunFlashLights.length >= 80) this.gunFlashLights.length = 60;
        this.gunFlashLights.push({
            x,
            y,
            angle,
            duration,
            halfAngle: p.halfAngle,
            rangeMin: p.rangeMin,
            rangeBoost: p.rangeBoost,
            intensityMin: p.intensityMin,
            intensityBoost: p.intensityBoost,
            softRadiusMin: p.softRadiusMin,
            softRadiusBoost: p.softRadiusBoost,
            expiresAt: time + duration,
        });
    }

    spawnPulseMuzzleEllipseFlash(x, y, angle, time = this.time.now, ownerMarine = null) {
        if (time < (this.nextPulseMuzzleEllipseAt || 0)) return;
        this.nextPulseMuzzleEllipseAt = time + 18;
        const fps = Number(this.game?.loop?.actualFps) || 60;
        if (fps < 36 && Math.random() < 0.35) return;

        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const major = Phaser.Math.FloatBetween(34, 58);
        const minor = Phaser.Math.FloatBetween(12, 22);
        const finalScaleX = Phaser.Math.FloatBetween(1.4, 2.2);

        // Pin the near edge 7px back from the resolved barrel tip so the flash
        // sits snug against the muzzle rather than floating ahead of it.
        const pinX = x - dirX * 7;
        const pinY = y - dirY * 7;
        const startCx = pinX + dirX * major * 0.5;
        const startCy = pinY + dirY * major * 0.5;
        const endCx   = pinX + dirX * major * 0.5 * finalScaleX;
        const endCy   = pinY + dirY * major * 0.5 * finalScaleX;

        const ownerDepth = Number(ownerMarine?.depth);
        const flashDepth = Number.isFinite(ownerDepth) ? (ownerDepth + 0.06) : 236;

        const e = this.add.ellipse(startCx, startCy, major, minor, 0xffffff, 0.85);
        e.setDepth(flashDepth);
        e.setBlendMode(Phaser.BlendModes.ADD);
        e.setRotation(angle);
        this.tweens.add({
            targets: e,
            alpha: 0,
            scaleX: finalScaleX,
            scaleY: Phaser.Math.FloatBetween(1.1, 1.5),
            x: endCx,
            y: endCy,
            duration: Phaser.Math.Between(28, 42),
            ease: 'Cubic.out',
            onComplete: () => e.destroy(),
        });
    }

    emitContinuousLeaderPulseFlash(time) {
        if (!this.leader || !this.inputHandler?.isFiring) return;
        if ((this.weaponManager?.currentWeaponKey || 'pulseRifle') !== 'pulseRifle') return;
        if (time < (Number(this.weaponManager?.jamUntil) || 0)) return;
        const angle = this.leader.facingAngle ?? this.leader.rotation;
        const muzzle = this.resolveMuzzleWorldPos(this.leader, angle, 'pulseRifle');
        this.spawnPulseMuzzleEllipseFlash(muzzle.x, muzzle.y, angle, time, this.leader);
    }

    addSparkLight(x, y, time, options = {}) {
        const duration = Math.max(24, Number(options.duration) || 58);
        if (this.sparkLights.length >= 64) this.sparkLights.length = 48;
        this.sparkLights.push({
            x,
            y,
            duration,
            rangeMin: Math.max(8, Number(options.rangeMin) || 18),
            rangeBoost: Math.max(6, Number(options.rangeBoost) || 34),
            intensityMin: Math.max(0.1, Number(options.intensityMin) || 0.38),
            intensityBoost: Math.max(0.1, Number(options.intensityBoost) || 0.26),
            softRadiusMin: Math.max(8, Number(options.softRadiusMin) || 26),
            softRadiusBoost: Math.max(8, Number(options.softRadiusBoost) || 28),
            color: Number(options.color) || 0xffffff,
            expiresAt: time + duration,
        });
    }

    buildMarineShadowCasters(marines) {
        const casters = marines.map((marine) => ({
            x: marine.x,
            y: marine.y,
            radius: 14,
            blocksLight: true,
        }));
        if (Array.isArray(this.roomProps)) {
            for (const prop of this.roomProps) {
                if (!prop?.sprite?.active || prop.blocksLight !== true) continue;
                casters.push({
                    x: prop.sprite.x,
                    y: prop.sprite.y,
                    radius: prop.radius || 18,
                    blocksLight: true,
                });
            }
        }
        return casters;
    }

    updateStageUI(stage, missionState = null) {
        if (stage === 'combat') {
            return;
        }

        if (stage === 'intermission') {
            return;
        }

        if (stage === 'extract') {
            return;
        }

        if (stage === 'victory') {
            this.physics.world.pause();
            this.contextMenu.hide();
            this.doorActionSystem.cancelPending();
            this.movementSystem.clearPath(this.leader);
            this.extractionRing.setVisible(false);
            this.extractionLabel.setVisible(false);
            this.objectiveSystem.updateTargetMarker(null);
            this.recordMissionBalanceSnapshot('victory');
            this.updateMetaProgress(true);
            this.updateCampaignProgressOnVictory();
            this.endHintText.setText(`${this.buildMissionStatsText()}\n${this.buildMetaProgressText()}\n${this.buildMissionEndPrompt('victory')}`);
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
            this.objectiveSystem.updateTargetMarker(null);
            this.recordMissionBalanceSnapshot('defeat');
            this.updateMetaProgress(false);
            this.endHintText.setText(`${this.buildMissionStatsText()}\n${this.buildMetaProgressText()}\n${this.buildMissionEndPrompt('defeat')}`);
            this.endHintText.setVisible(true);
        }
    }

    buildNearestDoorStatusHint() {
        if (!this.leader || !this.doorManager?.doorGroups) return '';
        let best = null;
        let bestDist = Infinity;
        for (const group of this.doorManager.doorGroups) {
            if (!group || !group.getCenter) continue;
            const c = group.getCenter();
            const d = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, c.x, c.y);
            if (d < bestDist) {
                bestDist = d;
                best = group;
            }
        }
        if (!best || !Number.isFinite(bestDist)) return '';
        const nearTiles = bestDist / CONFIG.TILE_SIZE;
        if (nearTiles > 12) return 'DOOR: NONE NEAR';
        const raw = String(best.state || 'closed').toUpperCase();
        const state = raw === 'DESTROYED' ? 'BREACHED' : raw;
        const integrity = Math.max(0, Math.floor(((Number(best.integrity) || 0) / Math.max(1, Number(best.maxIntegrity) || 1)) * 100));
        const integrityTxt = state === 'OPEN' || state === 'BREACHED' ? '' : ` | INT ${integrity}%`;
        return `NEAREST DOOR: ${state}${integrityTxt} | ${nearTiles.toFixed(1)}T`;
    }

    updateObjectives(missionState = null) {
        this.objectiveSystem.updateObjectives(missionState);
        this.objectiveSystem.updatePanel(missionState);
        this.updateCommanderPhaseCue(missionState, this.time.now);
    }

    updateCommanderPhaseCue(missionState = null, time = this.time.now) {
        if (!missionState || this.stageFlow.state !== 'extract') return;
        const phase = String(missionState.phaseLabel || '').trim().toUpperCase();
        if (!phase || phase === this.lastCommanderPhaseLabel) return;
        this.lastCommanderPhaseLabel = phase;
        if (time < (this.nextCommanderPhaseCueAt || 0)) return;
        const difficulty = String(this.activeMission?.difficulty || 'normal').toLowerCase();
        const prefix = difficulty === 'extreme'
            ? 'APC: PRIORITY'
            : (difficulty === 'hard' ? 'APC: DIRECTIVE' : 'APC: TASK');
        const directive = missionState.readyForExtraction
            ? 'SECURE ELEVATOR ROUTE'
            : phase;
        this.commanderSystem.setDirectiveOverride(directive, time, 4200);
        this.showFloatingText(this.leader.x, this.leader.y - 40, `${prefix} ${directive}`, '#b8d8ff');
        const chatter = this.getCommanderCueLine('phase');
        if (chatter) {
            this.showFloatingText(this.leader.x, this.leader.y - 58, chatter, '#9fc7ff');
        }
        this.nextCommanderPhaseCueAt = time + 4400;
    }

    getCommanderDifficultyKey() {
        const diff = String(this.activeMission?.difficulty || 'normal').toLowerCase();
        if (diff === 'extreme') return 'extreme';
        if (diff === 'hard') return 'hard';
        return 'normal';
    }

    getCommanderCueLine(kind = 'phase') {
        const key = this.getCommanderDifficultyKey();
        const bank = kind === 'surge' ? COMMANDER_SURGE_CHATTER : COMMANDER_PHASE_CHATTER;
        const list = bank[key] || bank.normal || [];
        if (!Array.isArray(list) || list.length <= 0) return '';
        return Phaser.Utils.Array.GetRandom(list);
    }

    getMissionPackageHudStatusLine() {
        const events = Array.isArray(this.missionDirectorEvents) ? this.missionDirectorEvents.length : 0;
        const fired = this.countMissionDirectorEventsFired();
        const issues = Array.isArray(this.missionDirectorEventIssues) ? this.missionDirectorEventIssues.length : 0;
        const cueIssues = Array.isArray(this.missionAudioCueIssues) ? this.missionAudioCueIssues.length : 0;
        const issueLabel = `${issues > 0 ? ` | ISS:${issues}` : ''}${cueIssues > 0 ? ` | CUE:${cueIssues}` : ''}`;
        const mapLabel = String(this.tilemapSourceLabel || 'TEMPLATE');
        if (!this.useMissionPackageDirector) return `PKG: OFF | MAP:${mapLabel} | EVT:${fired}/${events}${issueLabel}`;
        const tag = this.missionPackageMetaStale ? 'STALE' : 'OK';
        return `PKG: ${tag} | MAP:${mapLabel} | EVT:${fired}/${events}${issueLabel}`;
    }

    countMissionDirectorEventsFired() {
        if (!this.missionDirectorEventState || typeof this.missionDirectorEventState.values !== 'function') return 0;
        let n = 0;
        for (const s of this.missionDirectorEventState.values()) {
            if (s && s.fired) n++;
        }
        return n;
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
        const typeIdx = (waveNumber - 2) % 3;
        const pickupKey = typeIdx === 0 ? 'pickup_magazine' : 'pickup_ammo';
        const pickup = this.pickupGroup.create(pos.x, pos.y, pickupKey);
        pickup.setDepth(12);
        pickup.collected = false;

        if (typeIdx === 0) {
            pickup.kind = 'magazine';
            pickup.amount = 2;
            return;
        }

        pickup.kind = 'ammo';
        pickup.weaponKey = typeIdx === 1 ? 'shotgun' : 'pistol';
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

    buildMissionEndPrompt(result = 'defeat') {
        if (result === 'victory') {
            const nextMissionId = this.getNextCampaignMissionId();
            if (nextMissionId) {
                const nextName = this.getMissionNameById(nextMissionId);
                return `Press N for ${nextName}, or click/press R to replay`;
            }
        }
        return 'Click or press R to restart';
    }

    requestEndRestart(time = this.time.now) {
        if (!this.stageFlow?.isEnded?.()) return false;
        const now = Number(time) || 0;
        if (now < (Number(this.endRestartCooldownUntil) || 0)) return false;
        this.endRestartCooldownUntil = now + 220;
        this.scene.restart(this.launchData);
        return true;
    }

    pollEndRestartInput(time = this.time.now) {
        const now = Number(time) || 0;
        const keys = Array.isArray(this.endRestartKeys) ? this.endRestartKeys : [];
        let keyPressed = false;
        for (const key of keys) {
            if (key && Phaser.Input.Keyboard.JustDown(key)) {
                keyPressed = true;
                break;
            }
        }
        const pointer = this.input?.mousePointer || this.input?.activePointer;
        const isRightDown = !!(pointer && pointer.rightButtonDown && pointer.rightButtonDown());
        const pointerPressed = isRightDown && !this.endRestartPointerWasDown;
        this.endRestartPointerWasDown = isRightDown;
        if (!keyPressed && !pointerPressed) return false;
        return this.requestEndRestart(now);
    }

    getNextCampaignMissionId() {
        const order = Array.isArray(this.campaignMissionOrder) ? this.campaignMissionOrder : [];
        if (!this.activeMission?.id || order.length <= 0) return null;
        const idx = order.indexOf(this.activeMission.id);
        if (idx < 0 || idx >= (order.length - 1)) return null;
        return order[idx + 1];
    }

    getMissionNameById(missionId = '') {
        const found = MISSION_SET.find((m) => m && String(m.id) === String(missionId));
        return found && found.name ? found.name : String(missionId || 'next mission');
    }

    updateCampaignProgressOnVictory() {
        if (this.campaignProgressUpdated) return;
        this.campaignProgressUpdated = true;
        const autoSaveMissions = (Number(this.runtimeSettings?.scripting?.autoSaveBetweenMissions) || 0) > 0;
        if (!autoSaveMissions || !this.activeMission?.id) return;
        this.campaignProgress = completeCampaignMission(
            this.campaignProgress,
            this.activeMission.id,
            this.campaignMissionOrder
        );
        this.campaignProgress = saveCampaignProgress(this.campaignProgress, this.campaignMissionOrder);
    }

    startNextMissionIfAvailable() {
        const nextMissionId = this.getNextCampaignMissionId();
        if (!nextMissionId) return false;
        const data = { ...(this.launchData || {}), missionId: nextMissionId };
        this.scene.restart(data);
        return true;
    }

    resetCampaignProgressForDebug() {
        if (!Array.isArray(this.campaignMissionOrder) || this.campaignMissionOrder.length === 0) return;
        this.campaignProgress = resetCampaignProgress(this.campaignMissionOrder);
        const first = this.campaignMissionOrder[0] || 'm1';
        this.showFloatingText(this.leader.x, this.leader.y - 34, `CAMPAIGN RESET -> ${first.toUpperCase()}`, '#ffd7a6');
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

    recordMissionBalanceSnapshot(result = 'defeat') {
        if (this.missionBalanceSnapshotRecorded) return;
        this.missionBalanceSnapshotRecorded = true;
        const missionId = String(this.activeMission?.id || '');
        if (!missionId) return;
        const telemetry = this.loadTelemetryBucketForMission(missionId);
        const runSamples = telemetry.filter((s) => Number(s?.ts) >= this.sessionStartEpochMs);
        const avgPressure = this.averageSampleValue(runSamples, 'pressure');
        const avgJam = this.averageSampleValue(runSamples, 'jamMul');
        const avgReaction = this.averageSampleValue(runSamples, 'reactionMul');
        const avgReinforceGapMs = this.averageSampleValue(runSamples, 'reinforceGapMs');
        const highPressureRate = this.ratioWhere(runSamples, (s) => Number(s?.pressure) >= 0.78);
        const highJamRate = this.ratioWhere(runSamples, (s) => Number(s?.jamMul) >= 1.28);
        const stressTier = this.classifySnapshotStress(avgPressure, avgJam, highPressureRate, highJamRate);
        const anomalies = this.getSnapshotAnomalies(runSamples, avgPressure, avgJam, highPressureRate, highJamRate);
        const suggestedProfile = this.recommendProfileFromSnapshot(avgPressure, avgJam);
        const suggestion = this.buildDirectorSuggestionForMission(avgPressure, avgJam);
        const elapsedSec = Math.floor(Math.max(0, this.time.now - this.sessionStartTime) / 1000);
        const survivalIndex = this.computeSurvivalIndex(result, elapsedSec, this.totalKills);
        const pacingScore = this.computePacingScore(avgPressure, avgJam, highPressureRate, highJamRate);
        const entry = {
            ts: Date.now(),
            result: String(result || 'defeat'),
            missionId,
            missionName: String(this.activeMission?.name || missionId),
            difficulty: String(this.activeMission?.difficulty || 'normal'),
            elapsedSec,
            kills: Math.max(0, Number(this.totalKills) || 0),
            sampleCount: runSamples.length,
            avgPressure: round3(avgPressure),
            avgJam: round3(avgJam),
            avgReaction: round3(avgReaction),
            avgReinforceGapMs: Math.round(avgReinforceGapMs),
            highPressureRate: round3(highPressureRate),
            highJamRate: round3(highJamRate),
            stressTier,
            anomalies,
            survivalIndex,
            pacingScore,
            suggestedProfile,
            suggestion,
        };
        this.pushMissionBalanceHistoryEntry(entry);
    }

    loadTelemetryBucketForMission(missionId) {
        try {
            const raw = localStorage.getItem(COMBAT_TELEMETRY_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const bucket = parsed?.missions?.[missionId];
            return Array.isArray(bucket) ? bucket : [];
        } catch {
            return [];
        }
    }

    averageSampleValue(samples, key) {
        if (!Array.isArray(samples) || samples.length === 0) return 0;
        const values = samples
            .map((s) => Number(s?.[key]))
            .filter((n) => Number.isFinite(n));
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    ratioWhere(samples, predicate) {
        if (!Array.isArray(samples) || samples.length === 0) return 0;
        let hit = 0;
        let total = 0;
        for (const s of samples) {
            total++;
            if (predicate(s)) hit++;
        }
        return total > 0 ? (hit / total) : 0;
    }

    classifySnapshotStress(avgPressure = 0, avgJam = 1, highPressureRate = 0, highJamRate = 0) {
        if (avgPressure >= 0.72 || avgJam >= 1.32 || highPressureRate >= 0.3 || highJamRate >= 0.25) return 'high';
        if (avgPressure <= 0.42 && avgJam <= 1.04 && highPressureRate <= 0.08) return 'low';
        return 'target';
    }

    getSnapshotAnomalies(samples, avgPressure, avgJam, highPressureRate, highJamRate) {
        const flags = [];
        if (!Array.isArray(samples) || samples.length < 12) flags.push('low_sample_count');
        if (avgPressure >= 0.82) flags.push('overpressure');
        if (avgPressure <= 0.34) flags.push('underpressure');
        if (avgJam >= 1.42) flags.push('high_jam');
        if (highPressureRate >= 0.42) flags.push('spiky_pressure');
        if (highJamRate >= 0.34) flags.push('spiky_jam');
        return flags;
    }

    computeSurvivalIndex(result = 'defeat', elapsedSec = 0, kills = 0) {
        const winBonus = result === 'victory' ? 42 : 10;
        const timeScore = Phaser.Math.Clamp((Number(elapsedSec) || 0) / 320, 0, 1) * 28;
        const killScore = Phaser.Math.Clamp((Number(kills) || 0) / 80, 0, 1) * 30;
        return Math.round(winBonus + timeScore + killScore);
    }

    computePacingScore(avgPressure = 0, avgJam = 1, highPressureRate = 0, highJamRate = 0) {
        const targetPressure = this.activeMission?.difficulty === 'extreme'
            ? 0.67
            : (this.activeMission?.difficulty === 'hard' ? 0.6 : 0.53);
        const pressureFit = 1 - Phaser.Math.Clamp(Math.abs(avgPressure - targetPressure) / 0.3, 0, 1);
        const jamFit = 1 - Phaser.Math.Clamp(Math.abs(avgJam - 1.08) / 0.5, 0, 1);
        const spikePenalty = Phaser.Math.Clamp(highPressureRate * 0.55 + highJamRate * 0.45, 0, 1);
        const score = (pressureFit * 0.55 + jamFit * 0.35 + (1 - spikePenalty) * 0.1) * 100;
        return Math.round(score);
    }

    recommendProfileFromSnapshot(avgPressure = 0, avgJam = 1) {
        if (avgPressure >= 0.72 || avgJam >= 1.32) return 'cinematic';
        if (avgPressure <= 0.42 && avgJam <= 1.04) return 'hardcore';
        return 'balanced';
    }

    buildDirectorSuggestionForMission(avgPressure = 0, avgJam = 1) {
        const d = (this.activeMission?.director && typeof this.activeMission.director === 'object')
            ? this.activeMission.director
            : {};
        const idleBase = Number(d.idlePressureBaseMs) || 7000;
        const gunfireBase = Number(d.gunfireReinforceBaseMs) || 4500;
        const reinforceCap = Number(d.reinforceCap) || 16;
        const ambushMs = Number(d.inactivityAmbushMs) || 10000;
        const ambushCdMs = Number(d.inactivityAmbushCooldownMs) || 14000;
        const targetPressure = this.activeMission?.difficulty === 'extreme'
            ? 0.67
            : (this.activeMission?.difficulty === 'hard' ? 0.6 : 0.53);
        const pressureErr = Phaser.Math.Clamp((targetPressure - avgPressure) / 0.22, -1, 1);
        const jamErr = Phaser.Math.Clamp((1.06 - avgJam) / 0.28, -1, 1);
        const paceSignal = Phaser.Math.Clamp(pressureErr * 0.74 + jamErr * 0.26, -1, 1);
        return {
            idlePressureBaseMs: Math.round(Phaser.Math.Clamp(idleBase * (1 - paceSignal * 0.16), 2000, 30000)),
            gunfireReinforceBaseMs: Math.round(Phaser.Math.Clamp(gunfireBase * (1 - paceSignal * 0.18), 1200, 20000)),
            reinforceCap: Math.round(Phaser.Math.Clamp(reinforceCap * (1 + paceSignal * 0.14), 0, 80)),
            inactivityAmbushMs: Math.round(Phaser.Math.Clamp(ambushMs * (1 - paceSignal * 0.14), 2000, 45000)),
            inactivityAmbushCooldownMs: Math.round(Phaser.Math.Clamp(ambushCdMs * (1 - paceSignal * 0.12), 1500, 60000)),
            paceSignal: round3(paceSignal),
            targetPressure: round3(targetPressure),
        };
    }

    pushMissionBalanceHistoryEntry(entry) {
        try {
            const raw = localStorage.getItem(MISSION_BALANCE_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            const entries = Array.isArray(parsed) ? parsed : [];
            entries.unshift(entry);
            if (entries.length > MISSION_BALANCE_HISTORY_MAX) {
                entries.splice(MISSION_BALANCE_HISTORY_MAX);
            }
            localStorage.setItem(MISSION_BALANCE_HISTORY_KEY, JSON.stringify(entries));
        } catch {
            // Ignore storage failures.
        }
    }

    sampleCombatTelemetry(time = this.time.now) {
        if (!this.combatTelemetryMissionId || time < this.nextCombatTelemetrySampleAt) return;
        this.nextCombatTelemetrySampleAt = time + COMBAT_TELEMETRY_SAMPLE_MS;
        const pressure = Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0, 0, 1);
        const jamMul = Phaser.Math.Clamp(Number(this.combatMods?.marineJamMul) || 1, 0, 10);
        const reactionMul = Phaser.Math.Clamp(Number(this.combatMods?.marineReactionMul) || 1, 0, 10);
        const idleGapMs = Math.max(0, Math.floor((Number(this.nextIdlePressureAt) || time) - time));
        const gunGapMs = Math.max(0, Math.floor((Number(this.nextGunfireReinforceAt) || time) - time));
        const reinforceGapMs = Math.min(idleGapMs, gunGapMs);

        let snapshot = { updatedAt: Date.now(), missions: {} };
        try {
            const raw = localStorage.getItem(COMBAT_TELEMETRY_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.missions && typeof parsed.missions === 'object') {
                    snapshot = parsed;
                }
            }
        } catch {
            snapshot = { updatedAt: Date.now(), missions: {} };
        }

        const bucket = Array.isArray(snapshot.missions[this.combatTelemetryMissionId])
            ? snapshot.missions[this.combatTelemetryMissionId]
            : [];
        bucket.push({
            ts: Date.now(),
            tMs: Math.floor(time),
            pressure,
            jamMul,
            reactionMul,
            reinforceGapMs,
            reinforceIdleMs: idleGapMs,
            reinforceGunMs: gunGapMs,
        });
        if (bucket.length > COMBAT_TELEMETRY_MAX_SAMPLES) {
            bucket.splice(0, bucket.length - COMBAT_TELEMETRY_MAX_SAMPLES);
        }
        snapshot.missions[this.combatTelemetryMissionId] = bucket;
        snapshot.updatedAt = Date.now();

        try {
            localStorage.setItem(COMBAT_TELEMETRY_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
            // Ignore storage failures.
        }
    }

    updateDebugOverlay(time) {
        if (!this.debugOverlay) return;
        const phase = this.lastMissionState && this.lastMissionState.phaseLabel
            ? ` | ${this.lastMissionState.phaseLabel}`
            : '';
        this.debugOverlay.update(time, {
            stage: `${this.stageFlow.state} (wave ${this.stageFlow.getWaveLabel()})${phase} | Director: ${this.directorSourceLabel || 'SETTINGS'} | Map: ${this.tilemapSourceLabel || 'TEMPLATE'}${this.getMissionPackageMetaDebugSuffix()}`,
            campaign: this.getCampaignDebugLabel(),
            hostiles: this.enemyManager.getAliveCount(),
            health: this.leader.health,
            inputMode: 'mouse',
            isFiring: this.inputHandler.isFiring,
            pointer: this.inputHandler.getPointerWorldPosition(),
            paused: this.isPaused,
            kills: this.totalKills,
            pathStats: this.pathPlanner && this.pathPlanner.getStats ? this.pathPlanner.getStats() : null,
            combat: {
                state: String(this.combatMods?.state || 'manual'),
                pressure: Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0, 0, 1),
                jamMul: Phaser.Math.Clamp(Number(this.combatMods?.marineJamMul) || 1, 0, 10),
                reactionMul: Phaser.Math.Clamp(Number(this.combatMods?.marineReactionMul) || 1, 0, 10),
                reinforceInMs: Math.max(0, Math.floor((Number(this.nextIdlePressureAt) || time) - time)),
                reinforceCdMs: Math.max(0, Math.floor((Number(this.nextGunfireReinforceAt) || time) - time)),
                momentum: this.getKillMomentum(time),
            },
            beamFlash: {
                alphaMul: Phaser.Math.Clamp(Number(this.runtimeSettings?.lighting?.beamFlashAlphaMul) || 1, 0.2, 3),
                widthMul: Phaser.Math.Clamp(Number(this.runtimeSettings?.lighting?.beamFlashWidthMul) || 1, 0.4, 2.5),
            },
        });
    }

    getCampaignDebugLabel() {
        if (!Array.isArray(this.campaignMissionOrder) || this.campaignMissionOrder.length === 0) return 'n/a';
        const p = this.campaignProgress || {};
        const unlocked = Math.max(1, Math.min(this.campaignMissionOrder.length, (Number(p.unlockedIndex) || 0) + 1));
        const cur = p.currentMissionId || this.activeMission?.id || this.campaignMissionOrder[0];
        const auto = (Number(this.runtimeSettings?.scripting?.autoSaveBetweenMissions) || 0) > 0 ? 'on' : 'off';
        return `${auto} ${cur} (${unlocked}/${this.campaignMissionOrder.length})`;
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
        const evtIssues = Array.isArray(this.missionDirectorEventIssues) ? this.missionDirectorEventIssues.length : 0;
        if (evtIssues > 0) warnings.push(`Director event issues: ${evtIssues}`);
        const cueIssues = Array.isArray(this.missionAudioCueIssues) ? this.missionAudioCueIssues.length : 0;
        if (cueIssues > 0) warnings.push(`Audio cue issues: ${cueIssues}`);
        if (this.missionPackageMetaStale) warnings.push('Mission package checksum stale');
        return warnings;
    }

    getMissionPackageMetaDebugSuffix() {
        const meta = this.missionPackageMeta;
        const summary = this.missionPackageSummary;
        const stale = this.missionPackageMetaStale ? ' STALE' : '';
        const fired = this.countMissionDirectorEventsFired();
        const totalEvents = Array.isArray(this.missionDirectorEvents) ? this.missionDirectorEvents.length : 0;
        const evtProgress = totalEvents > 0 ? ` evtRun:${fired}/${totalEvents}` : '';
        if (!meta || !meta.publishedAt) {
            if (!summary) return '';
            return ` | Pkg:${summary.maps}/${summary.missions} evt:${summary.directorEvents} cue:${summary.audioCues} story:${summary.storyPoints || 0}${stale}${evtProgress}`;
        }
        const ageSec = Math.max(0, Math.floor((Date.now() - meta.publishedAt) / 1000));
        const counts = summary
            ? ` map:${summary.maps} mis:${summary.missions} evt:${summary.directorEvents} cue:${summary.audioCues} story:${summary.storyPoints || 0}`
            : '';
        return ` | PkgAge:${ageSec}s${counts}${stale}${evtProgress}`;
    }

    refreshMissionPackageRuntimeMeta(time = this.time.now) {
        if (time < (this.nextMissionPackageMetaRefreshAt || 0)) return;
        this.nextMissionPackageMetaRefreshAt = time + 2000;
        this.missionPackageMeta = getMissionPackageMeta();
        this.missionPackageSummary = getMissionPackageSummary();
        this.missionPackageMetaStale = isMissionPackageMetaStale();
        this.missionStoryPoints = getMissionStoryPointsForMission(
            this.activeMission?.id || '',
            this.missionLayout?.tilemap?.id || ''
        );
        this.syncMissionStoryPointState();
        if (this.useMissionPackageDirector) {
            this.missionDirectorEvents = getMissionDirectorEventsForMission(this.activeMission?.id || '');
            this.missionAudioCues = getMissionAudioCuesForMission(this.activeMission?.id || '');
            this.missionAudioCueIssues = this.validateMissionAudioCues(this.missionAudioCues);
            this.missionAudioCueMap = this.buildMissionAudioCueMap(this.missionAudioCues);
            this.missionDirectorEventIssues = this.validateMissionDirectorEvents(this.missionDirectorEvents);
            this.ensureMissionDirectorEventState();
        } else {
            this.missionDirectorEvents = [];
            this.missionDirectorEventIssues = [];
            this.missionAudioCues = [];
            this.missionAudioCueIssues = [];
            this.missionAudioCueMap = new Map();
        }
    }

    refreshRuntimeSettings(time = this.time.now) {
        if (time < (this.nextRuntimeSettingsRefreshAt || 0)) return;
        this.nextRuntimeSettingsRefreshAt = time + 1000;
        this.runtimeSettings = loadRuntimeSettings();
        this.applyEffectiveLightingSettings();
        this.updateBackgroundMusicVolume();
        this.updatePipelinesFromSettings();
    }

    updatePipelinesFromSettings() {
        const graphics = this.runtimeSettings?.graphics || DEFAULT_RUNTIME_SETTINGS.graphics;
        
        if (this.alienTonePipeline) {
            const p = this.alienTonePipeline;
            p.setHalation?.(graphics.cinematicHalation ?? DEFAULT_RUNTIME_SETTINGS.graphics.cinematicHalation);
            p.setExposure?.(graphics.cinematicExposure ?? DEFAULT_RUNTIME_SETTINGS.graphics.cinematicExposure);
            p.setBleach?.(graphics.cinematicBleachBypass ?? DEFAULT_RUNTIME_SETTINGS.graphics.cinematicBleachBypass);
            p.setBloom?.(graphics.cinematicBloom ?? DEFAULT_RUNTIME_SETTINGS.graphics.cinematicBloom);
            p.setWarp?.(graphics.cinematicWarp ?? DEFAULT_RUNTIME_SETTINGS.graphics.cinematicWarp);
            p.setFlicker?.(graphics.filmFlicker ?? DEFAULT_RUNTIME_SETTINGS.graphics.filmFlicker);
        }

        if (this.tiltShift) {
            const p = this.tiltShift;
            p.setFocus?.(graphics.tiltShiftFocus ?? DEFAULT_RUNTIME_SETTINGS.graphics.tiltShiftFocus);
            p.setRange?.(graphics.tiltShiftRange ?? DEFAULT_RUNTIME_SETTINGS.graphics.tiltShiftRange);
            p.setStrength?.(graphics.tiltShiftStrength ?? DEFAULT_RUNTIME_SETTINGS.graphics.tiltShiftStrength);
        }

        if (this.scanline) {
            const p = this.scanline;
            p.setGrain?.(graphics.filmGrain ?? DEFAULT_RUNTIME_SETTINGS.graphics.filmGrain);
            p.setScanlines?.(graphics.scanlineStrength ?? DEFAULT_RUNTIME_SETTINGS.graphics.scanlineStrength);
        }
    }

    validateMissionDirectorEvents(events = []) {
        const issues = [];
        for (const e of events || []) {
            const id = String(e?.id || '?');
            const trigger = String(e?.trigger || '').trim().toLowerCase();
            const action = String(e?.action || '').trim().toLowerCase();
            const params = (e?.params && typeof e.params === 'object') ? e.params : {};
            const triggerKind = trigger ? String(trigger.split(':', 1)[0]).trim() : '';
            if (!triggerKind || !MISSION_DIRECTOR_ALLOWED_TRIGGERS.has(triggerKind)) issues.push(`Director event ${id} has unsupported trigger`);
            if (!action || !MISSION_DIRECTOR_ALLOWED_ACTIONS.has(action)) issues.push(`Director event ${id} has unsupported action`);
            if (action === 'spawn_pack') {
                const size = Number(params.size);
                if (Number.isFinite(size) && (size < 1 || size > 16)) issues.push(`Director event ${id} spawn_pack size out of range`);
                const source = String(params.source || '').toLowerCase().trim();
                if (source && source !== 'idle' && source !== 'gunfire') issues.push(`Director event ${id} spawn_pack source invalid`);
                const type = String(params.type || '').toLowerCase().trim();
                if (type && !MISSION_DIRECTOR_SPAWN_TYPES.has(type)) issues.push(`Director event ${id} spawn_pack type invalid`);
                const dir = String(params.dir || '').toUpperCase().trim();
                if (dir && !['N', 'S', 'E', 'W'].includes(dir)) issues.push(`Director event ${id} spawn_pack dir invalid`);
            }
            if (action === 'door_action' || action === 'door_state') {
                const op = String(params.op || params.state || params.action || '').toLowerCase().trim();
                if (!MISSION_DIRECTOR_DOOR_OPS_SET.has(op)) issues.push(`Director event ${id} door action invalid`);
            }
            if (action === 'trigger_tracker' || action === 'start_tracker') {
                const role = String(params.role || 'tech').toLowerCase().trim();
                if (!MISSION_DIRECTOR_TRACKER_ROLES.has(role)) issues.push(`Director event ${id} tracker role invalid`);
            }
            if (action === 'set_pressure_grace' && params.ms !== undefined && !Number.isFinite(Number(params.ms))) {
                issues.push(`Director event ${id} pressure grace ms invalid`);
            }
            if ((action === 'morale_delta' || action === 'panic_delta') && !Number.isFinite(Number(params.amount))) {
                issues.push(`Director event ${id} morale amount invalid`);
            }
            if ((action === 'set_reinforce_caps' || action === 'set_reinforcement_caps')) {
                const hasAny = params.total !== undefined || params.idle !== undefined || params.gunfire !== undefined;
                if (!hasAny) issues.push(`Director event ${id} reinforce caps missing values`);
            }
            if (action === 'set_lighting') {
                const hasAny = params.ambientDarkness !== undefined || params.ambient !== undefined
                    || params.torchRange !== undefined || params.torchConeHalfAngle !== undefined
                    || params.softRadius !== undefined || params.coreAlpha !== undefined
                    || params.featherLayers !== undefined || params.featherSpread !== undefined
                    || params.featherDecay !== undefined || params.glowStrength !== undefined;
                if (!hasAny) issues.push(`Director event ${id} set_lighting missing values`);
            }
            if (action === 'set_combat_mods') {
                const keys = ['enemyAggressionMul', 'enemyFlankMul', 'enemyDoorDamageMul', 'marineAccuracyMul', 'marineJamMul', 'marineReactionMul'];
                const hasAny = keys.some((k) => params[k] !== undefined);
                if (!hasAny) issues.push(`Director event ${id} set_combat_mods missing values`);
            }
            if (action === 'text_cue' || action === 'cue_text' || action === 'show_text' || action === 'edge_cue') {
                const cueId = String(params.cueId || params.audioCueId || '').trim();
                if (cueId && !(this.missionAudioCueMap && this.missionAudioCueMap.has(cueId))) {
                    issues.push(`Director event ${id} references missing cueId ${cueId}`);
                }
            }
        }
        return issues;
    }

    validateMissionAudioCues(cues = []) {
        const issues = [];
        const seen = new Set();
        for (const cue of cues || []) {
            const id = String(cue?.id || '').trim();
            const textCue = String(cue?.textCue || '').trim();
            if (!id) {
                issues.push('Audio cue missing id');
                continue;
            }
            if (seen.has(id)) issues.push(`Duplicate audio cue id: ${id}`);
            seen.add(id);
            if (!textCue) issues.push(`Audio cue ${id} missing textCue`);
        }
        return issues;
    }

    buildMissionAudioCueMap(cues = []) {
        const map = new Map();
        for (const cue of cues || []) {
            if (!cue || !cue.id || !cue.textCue) continue;
            map.set(String(cue.id), String(cue.textCue));
        }
        return map;
    }

    getMissionAudioCueText(id, fallback = '') {
        if (!id) return fallback;
        const text = this.missionAudioCueMap && this.missionAudioCueMap.get(String(id));
        return text ? String(text) : fallback;
    }

    syncMissionStoryPointState() {
        const next = new Map();
        const current = this.missionStoryPointState || new Map();
        for (const point of this.missionStoryPoints || []) {
            if (!point || !point.id) continue;
            const prev = current.get(point.id);
            next.set(point.id, {
                fired: prev?.fired === true,
                firedAt: Number(prev?.firedAt) || 0,
            });
        }
        this.missionStoryPointState = next;
        this.storyPointTriggerHistory = Array.isArray(this.storyPointTriggerHistory)
            ? this.storyPointTriggerHistory.filter((entry) => next.has(String(entry?.id || '')))
            : [];
    }

    getMissionStoryPointMessage(point) {
        if (!point) return '';
        const title = String(point.title || '').trim();
        const note = String(point.note || '').trim();
        if (title && note) return `${title}: ${note}`;
        return title || note || 'Story beat reached';
    }

    triggerMissionStoryPoint(point, time = this.time.now) {
        if (!point || !point.id) return false;
        const state = this.missionStoryPointState?.get(point.id);
        if (!state || state.fired) return false;
        state.fired = true;
        state.firedAt = time;
        const world = this.tileToWorldCenter(point.tileX, point.tileY);
        const color = String(point.kind || '').toLowerCase() === 'objective' ? '#ffde8a' : '#9be8ff';
        const message = this.getMissionStoryPointMessage(point);
        this.storyPointTriggerHistory = Array.isArray(this.storyPointTriggerHistory) ? this.storyPointTriggerHistory : [];
        this.storyPointTriggerHistory.push({
            id: String(point.id),
            kind: String(point.kind || 'story'),
            message,
            firedAt: time,
            tileX: point.tileX,
            tileY: point.tileY,
        });
        this.lastTriggeredStoryPoint = {
            id: String(point.id),
            kind: String(point.kind || 'story'),
            message,
            firedAt: time,
            tileX: point.tileX,
            tileY: point.tileY,
        };
        this.showFloatingText(world.x, world.y - 28, message.toUpperCase(), color);
        return true;
    }

    updateMissionStoryPoints(time = this.time.now) {
        if (this.stageFlow?.isEnded?.()) return;
        if (!this.leader || !Array.isArray(this.missionStoryPoints) || this.missionStoryPoints.length === 0) return;
        const triggerRadius = CONFIG.TILE_SIZE * 0.95;
        for (const point of this.missionStoryPoints) {
            if (!point || !point.id) continue;
            const state = this.missionStoryPointState?.get(point.id);
            if (state?.fired) continue;
            const world = this.tileToWorldCenter(point.tileX, point.tileY);
            if (Phaser.Math.Distance.Between(this.leader.x, this.leader.y, world.x, world.y) > triggerRadius) continue;
            this.triggerMissionStoryPoint(point, time);
        }
    }

    ensureMissionDirectorEventState() {
        const next = new Map();
        const current = this.missionDirectorEventState || new Map();
        for (const event of this.missionDirectorEvents || []) {
            if (!event || !event.id) continue;
            const prev = current.get(event.id);
            next.set(event.id, prev || { fired: false, lastFiredAt: -100000, fireCount: 0, lastTriedAt: -100000 });
        }
        this.missionDirectorEventState = next;
    }

    updateMissionDirectorEvents(time, marines) {
        if (!this.useMissionPackageDirector) return;
        if (this.stageFlow?.isEnded?.()) return;
        if (!Array.isArray(this.missionDirectorEvents) || this.missionDirectorEvents.length === 0) return;
        this.ensureMissionDirectorEventState();
        for (const event of this.missionDirectorEvents) {
            if (!event || !event.id) continue;
            if (event.enabled === false) continue;
            const state = this.missionDirectorEventState.get(event.id) || { fired: false, lastFiredAt: -100000, fireCount: 0, lastTriedAt: -100000 };
            const repeatMs = Math.max(0, Math.floor(Number(event.repeatMs) || Number(event?.params?.repeatMs) || 0));
            const maxFires = Math.max(0, Math.floor(Number(event.maxFires) || Number(event?.params?.maxFires) || 0));
            const retryMs = Math.max(
                120,
                Math.floor(Number(event.cooldownMs) || Number(event?.params?.cooldownMs) || Number(event?.params?.retryMs) || 600)
            );
            const chance = Phaser.Math.Clamp(Number(event.chance), 0, 100);
            if (state.fired && repeatMs <= 0) continue;
            if (maxFires > 0 && (Number(state.fireCount) || 0) >= maxFires) continue;
            if (repeatMs > 0 && time < (state.lastFiredAt + repeatMs)) continue;
            if (time < ((Number(state.lastTriedAt) || -100000) + retryMs)) continue;
            if (!this.isMissionDirectorTriggerMet(event, time)) continue;
            state.lastTriedAt = time;
            if (chance < 100 && Math.random() * 100 >= chance) {
                this.missionDirectorEventState.set(event.id, state);
                continue;
            }
            const executed = this.executeMissionDirectorAction(event, time, marines);
            if (!executed) {
                this.missionDirectorEventState.set(event.id, state);
                continue;
            }
            state.fired = true;
            state.lastFiredAt = time;
            state.fireCount = (Number(state.fireCount) || 0) + 1;
            this.missionDirectorEventState.set(event.id, state);
        }
    }

    isMissionDirectorTriggerMet(event, time) {
        const triggerRaw = String(event?.trigger || '').trim().toLowerCase();
        if (!triggerRaw) return false;
        const [kindRaw, valueRaw = ''] = triggerRaw.split(':', 2);
        const kind = String(kindRaw || '').trim();
        const value = String(valueRaw || '').trim();
        if (kind === 'always') return true;
        if (kind === 'time') {
            const sec = Math.max(0, Number(value) || 0);
            const elapsedSec = Math.max(0, (time - (this.sessionStartTime || 0)) / 1000);
            return elapsedSec >= sec;
        }
        if (kind === 'wave') {
            const wave = Math.max(1, Math.floor(Number(value) || 1));
            return (this.stageFlow?.currentWave || 1) >= wave;
        }
        if (kind === 'pressure') {
            const p = Phaser.Math.Clamp(Number(value) || 0, 0, 1);
            return this.getCombatPressure() >= p;
        }
        if (kind === 'kills') {
            const n = Math.max(0, Math.floor(Number(value) || 0));
            return (this.totalKills || 0) >= n;
        }
        if (kind === 'stage') {
            return String(this.stageFlow?.state || '').toLowerCase() === value;
        }
        if (kind === 'objective') {
            const n = Math.max(0, Math.floor(Number(value) || 0));
            return (this.lastObjectiveProgressCount || 0) >= n;
        }
        return false;
    }

    executeMissionDirectorAction(event, time, marines) {
        const action = String(event?.action || '').trim().toLowerCase();
        const params = (event?.params && typeof event.params === 'object') ? event.params : {};
        if (action === 'spawn_pack') {
            const spawned = this.setpieceSystem.spawnDirectorPack(params, time, marines);
            if (spawned > 0 && params.textCue) {
                this.showFloatingText(this.leader.x, this.leader.y - 42, String(params.textCue), '#a9d8ff');
            }
            return spawned > 0;
        }
        if (action === 'text_cue' || action === 'cue_text' || action === 'show_text') {
            const cueId = String(params.cueId || params.audioCueId || '').trim();
            const fallback = String(params.text || params.message || event.id || 'DIRECTOR CUE');
            const msg = this.getMissionAudioCueText(cueId, fallback);
            const color = String(params.color || '#a9d8ff');
            this.showFloatingText(this.leader.x, this.leader.y - 42, msg.toUpperCase(), color);
            return true;
        }
        if (action === 'door_thump' || action === 'thump') {
            const word = String(params.word || 'THUMP!!');
            const cue = this.buildMissionCueWorldFromDir(params.dir);
            this.showEdgeWordCue(word, cue.x, cue.y, String(params.color || '#8fcfff'));
            return true;
        }
        if (action === 'set_pressure_grace') {
            const ms = Phaser.Math.Clamp(Number(params.ms) || 0, 0, 30000);
            this.pressureGraceUntil = Math.max(this.pressureGraceUntil || 0, time + ms);
            this.nextIdlePressureAt = Math.max(this.nextIdlePressureAt || 0, this.pressureGraceUntil);
            this.nextGunfireReinforceAt = Math.max(this.nextGunfireReinforceAt || 0, this.pressureGraceUntil);
            return true;
        }
        if (action === 'door_action' || action === 'door_state') {
            return this.applyDirectorDoorAction(params);
        }
        if (action === 'edge_cue') {
            const cueId = String(params.cueId || params.audioCueId || '').trim();
            const fallback = String(params.word || params.text || 'MOVEMENT');
            const word = this.getMissionAudioCueText(cueId, fallback);
            const cue = this.buildMissionCueWorldFromDir(params.dir);
            this.showEdgeWordCue(word, cue.x, cue.y, String(params.color || '#9dc8ff'));
            return true;
        }
        if (action === 'set_reinforce_caps' || action === 'set_reinforcement_caps') {
            let changed = false;
            const total = Number(params.total);
            if (Number.isFinite(total)) {
                this.reinforceCapEffective = Phaser.Math.Clamp(Math.floor(total), 0, 120);
                changed = true;
            }
            const idle = Number(params.idle);
            if (Number.isFinite(idle)) {
                this.reinforceCapIdleEffective = Phaser.Math.Clamp(Math.floor(idle), 0, 120);
                changed = true;
            }
            const gunfire = Number(params.gunfire);
            if (Number.isFinite(gunfire)) {
                this.reinforceCapGunfireEffective = Phaser.Math.Clamp(Math.floor(gunfire), 0, 120);
                changed = true;
            }
            if (changed) this.showFloatingText(this.leader.x, this.leader.y - 44, 'DIRECTOR CAP SHIFT', '#9fc7ff');
            return changed;
        }
        if (action === 'set_lighting') {
            let changed = false;
            const darkness = Number(params.ambientDarkness ?? params.ambient);
            if (Number.isFinite(darkness)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.ambientDarkness = Phaser.Math.Clamp(darkness, 0, 1);
                changed = true;
            }
            const range = Number(params.torchRange);
            if (Number.isFinite(range)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.torchRange = Phaser.Math.Clamp(range, 120, 1800);
                changed = true;
            }
            const halfAngle = Number(params.torchConeHalfAngle);
            if (Number.isFinite(halfAngle)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.torchConeHalfAngle = Phaser.Math.Clamp(halfAngle, 0.1, 1.5);
                changed = true;
            }
            const softRadius = Number(params.softRadius);
            if (Number.isFinite(softRadius)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.softRadius = Phaser.Math.Clamp(softRadius, 10, 600);
                changed = true;
            }
            const coreAlpha = Number(params.coreAlpha);
            if (Number.isFinite(coreAlpha)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.coreAlpha = Phaser.Math.Clamp(coreAlpha, 0, 1);
                changed = true;
            }
            const featherLayers = Number(params.featherLayers);
            if (Number.isFinite(featherLayers)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.featherLayers = Phaser.Math.Clamp(Math.round(featherLayers), 4, 24);
                changed = true;
            }
            const featherSpread = Number(params.featherSpread);
            if (Number.isFinite(featherSpread)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.featherSpread = Phaser.Math.Clamp(featherSpread, 0.4, 2.5);
                changed = true;
            }
            const featherDecay = Number(params.featherDecay);
            if (Number.isFinite(featherDecay)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.featherDecay = Phaser.Math.Clamp(featherDecay, 0.2, 0.95);
                changed = true;
            }
            const glowStrength = Number(params.glowStrength);
            if (Number.isFinite(glowStrength)) {
                this.activeLightingOverrides = this.activeLightingOverrides || {};
                this.activeLightingOverrides.glowStrength = Phaser.Math.Clamp(glowStrength, 0.1, 2);
                changed = true;
            }
            if (changed) {
                this.applyEffectiveLightingSettings();
                this.showFloatingText(this.leader.x, this.leader.y - 44, 'LIGHTING SHIFT', '#9dc8ff');
            }
            return changed;
        }
        if (action === 'set_combat_mods') {
            const keys = [
                'enemyAggressionMul',
                'enemyFlankMul',
                'enemyDoorDamageMul',
                'marineAccuracyMul',
                'marineJamMul',
                'marineReactionMul',
            ];
            const mods = {};
            let changed = false;
            for (const key of keys) {
                const v = Number(params[key]);
                if (!Number.isFinite(v)) continue;
                mods[key] = Phaser.Math.Clamp(v, 0.2, 3);
                changed = true;
            }
            if (!changed) return false;
            const ms = Phaser.Math.Clamp(Number(params.ms) || 0, 0, 30000);
            this.directorOverrideMods = mods;
            this.directorOverrideUntil = ms > 0 ? (time + ms) : 0;
            this.showFloatingText(this.leader.x, this.leader.y - 44, 'COMBAT POSTURE SHIFT', '#9fc7ff');
            return true;
        }
        if (action === 'morale_delta' || action === 'panic_delta') {
            const marines = this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader];
            const amount = Phaser.Math.Clamp(Number(params.amount) || 0, -40, 40);
            if (Math.abs(amount) < 0.001) return false;
            this.applyTeamMoraleDelta(marines, amount);
            const label = amount > 0 ? `MORALE +${Math.round(amount)}` : `PANIC +${Math.round(Math.abs(amount))}`;
            const color = amount > 0 ? '#b8ffc7' : '#ffb1b1';
            this.showFloatingText(this.leader.x, this.leader.y - 44, label, color);
            return true;
        }
        if (action === 'trigger_tracker' || action === 'start_tracker') {
            // Tracker is now passive — no operator scan needed
            return true;
        }
        if (action === 'spawn_queen' || action === 'spawn_boss') {
            if (this.isStagingSafeActive(time)) return false;
            const queenType = String(params.type || '').toLowerCase().trim();
            if (queenType === 'queenlesser' || queenType === 'lesser' || queenType === 'queen_lesser') {
                const world = this.pickIdlePressureSpawnWorld(this.cameras.main?.worldView || null, this.squadSystem.getAllMarines(), time);
                const e = world ? this.enemyManager.spawnEnemyAtWorld('queenLesser', world.x, world.y, this.stageFlow.currentWave || 1) : null;
                if (e) {
                    e.dynamicReinforcement = true;
                    e.reinforcementSource = 'gunfire';
                    e.alertUntil = Math.max(e.alertUntil, time + 6000);
                    this.noteReinforcementTypeSpawn('queenLesser', time);
                    this.showFloatingText(this.leader.x, this.leader.y - 44, 'ELITE CONTACT INBOUND', '#ffb8b8');
                    return true;
                }
                return false;
            }
            this.spawnMissionQueen();
            this.showFloatingText(this.leader.x, this.leader.y - 44, 'QUEEN SIGNATURE DETECTED', '#ff9fa6');
            return true;
        }
        return false;
    }

    applyDirectorDoorAction(params = {}) {
        if (!this.doorManager || !Array.isArray(this.doorManager.doorGroups)) return false;
        const opRaw = String(params.op || params.state || params.action || '').toLowerCase().trim();
        const op = MISSION_DIRECTOR_DOOR_OPS_SET.has(opRaw) ? opRaw : '';
        if (!op) return false;
        const doorId = String(params.doorId || '').trim();
        let group = null;
        if (doorId) {
            group = (this.doorManager.doorGroups || []).find((g) => g && String(g.id) === doorId) || null;
        }
        if (!group) {
            const dir = String(params.dir || '').toUpperCase().trim();
            const candidates = (this.doorManager.doorGroups || []).filter((g) => g && g.isPassable !== true);
            let best = null;
            let bestScore = -Infinity;
            for (const g of candidates) {
                const center = this.getDoorGroupCenter(g);
                const bucket = this.getDirectionBucket(center.x, center.y);
                const dirScore = dir && bucket === dir ? 800 : 0;
                const dist = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, center.x, center.y);
                const score = dirScore + dist;
                if (score > bestScore) {
                    best = g;
                    bestScore = score;
                }
            }
            group = best;
        }
        if (!group) return false;
        const pathGrid = this.pathGrid;
        const physicsGroup = this.doorManager.physicsGroup;
        const lightBlockerGrid = this.lightBlockerGrid;
        const wallLayer = this.wallLayer;
        if (typeof group[op] !== 'function' && op !== 'open') return false;
        if (op === 'open') {
            group.forceOpen(pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
        } else {
            group[op](pathGrid, physicsGroup, lightBlockerGrid, wallLayer);
        }
        return true;
    }

    spawnDirectorPack(params = {}, time = this.time.now, marines = null) {
        return this.setpieceSystem.spawnDirectorPack(params, time, marines);
    }

    pickVentSwarmSpawnWorld(marines = null, usedWorld = []) {
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : (this.squadSystem?.getAllMarines?.() || [this.leader]);
        const view = this.cameras.main?.worldView || null;
        for (let i = 0; i < 18; i++) {
            const world = this.pickIdlePressureSpawnWorld(view, marList, this.time.now);
            if (!world) continue;
            let tooNearUsed = false;
            for (const u of usedWorld || []) {
                if (!u) continue;
                const du = Phaser.Math.Distance.Between(world.x, world.y, u.x, u.y);
                if (du < CONFIG.TILE_SIZE * 2.4) {
                    tooNearUsed = true;
                    break;
                }
            }
            if (!tooNearUsed) return world;
        }
        return null;
    }

    updateVentSwarmAmbush(time, marines) {
        if (!this.enemyManager || this.stageFlow?.isEnded?.()) return;
        if (this.stageFlow?.state === 'extract') return;
        if (this.isStagingSafeActive(time)) return;
        if (time < (this.nextVentSwarmAt || 0)) return;
        const pressure = Phaser.Math.Clamp(Number(this.combatMods?.pressure) || this.getCombatPressure(), 0, 1);
        const missionId = String(this.activeMission?.id || 'm1');
        const earlyMission = missionId === 'm1' || missionId === 'm2';
        const pressureThreshold = earlyMission ? 0.52 : 0.36;
        const shouldSpawn = pressure >= pressureThreshold || Math.random() < Phaser.Math.Clamp((pressure - (earlyMission ? 0.36 : 0.22)) * 1.1, earlyMission ? 0.01 : 0.04, 0.5);
        if (!shouldSpawn) {
            this.nextVentSwarmAt = time + Phaser.Math.Between(earlyMission ? 8600 : 3200, earlyMission ? 14200 : 6200);
            return;
        }

        const slots = this.getAvailableReinforcementSlots('idle');
        if (slots <= 0) {
            this.nextVentSwarmAt = time + Phaser.Math.Between(1800, 3600);
            return;
        }
        const aliveNow = this.enemyManager.getAliveCount();
        const softCap = this.getDynamicAliveSoftCap(marines);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) {
            this.nextVentSwarmAt = time + Phaser.Math.Between(1800, 3200);
            return;
        }

        const maxByMission = earlyMission ? 2 : 4;
        const desired = Phaser.Math.Between(earlyMission ? 1 : 2, maxByMission);
        const count = Math.max(1, Math.min(4, slots, capRoom, desired));
        const usedVents = [];
        let spawned = 0;
        for (let i = 0; i < count; i++) {
            const world = this.pickVentSwarmSpawnWorld(marines, usedVents);
            if (!world) continue;
            usedVents.push({ x: world.x, y: world.y });
            const type = this.pickReinforcementType('idle', i, time);
            const enemy = this.enemyManager.spawnEnemyAtWorld(type, world.x, world.y, this.stageFlow.currentWave || 1);
            if (!enemy) continue;
            this.noteReinforcementTypeSpawn(type, time);
            enemy.dynamicReinforcement = true;
            enemy.reinforcementSource = 'vent';
            enemy.alertUntil = Math.max(enemy.alertUntil, time + 4600);
            enemy.investigatePoint = { x: this.leader.x, y: this.leader.y, power: 1.2 };
            enemy.investigateUntil = time + 3400;
            this.emitAlienSteamPlume(world.x, world.y, { intensity: Phaser.Math.FloatBetween(0.7, 1.2), directionless: true });
            spawned++;
        }
        if (spawned > 0) {
            this.noteReinforcementSpawn(time, 'idle', spawned);
            this.markCombatAction(time);
            this.showEdgeWordCue('VENT BREACH', this.leader.x + Phaser.Math.Between(-80, 80), this.leader.y + Phaser.Math.Between(-80, 80), '#b5ffcf');
        }
        const missionMul = earlyMission ? 1.95 : 1;
        const cd = Math.floor(Phaser.Math.Linear(12200, 6400, pressure) * missionMul);
        this.nextVentSwarmAt = time + Phaser.Math.Between(Math.max(3400, cd - 1400), cd + 1500);
    }

    buildMissionCueWorldFromDir(rawDir = null) {
        let dir = String(rawDir || '').toUpperCase().trim();
        if (!['N', 'S', 'E', 'W'].includes(dir)) {
            dir = Phaser.Utils.Array.GetRandom(['N', 'S', 'E', 'W']);
        }
        const dist = CONFIG.TILE_SIZE * 9;
        if (dir === 'N') return { x: this.leader.x, y: this.leader.y - dist };
        if (dir === 'S') return { x: this.leader.x, y: this.leader.y + dist };
        if (dir === 'E') return { x: this.leader.x + dist, y: this.leader.y };
        return { x: this.leader.x - dist, y: this.leader.y };
    }

    updateCombatFeedback(time) {
        const hp = this.leader.health;
        if (hp < this.prevHealth) {
            const lost = this.prevHealth - hp;
            const alpha = Phaser.Math.Clamp(0.15 + lost / 60, 0.15, 0.45);
            this.damageFlash.setFillStyle(0xaa0000, alpha);
            this.tweens.add({
                targets: this.damageFlash,
                alpha: 0,
                duration: 300,
                ease: 'Quad.out',
            });
            const shakeMul = this.getCameraShakeMul();
            if (shakeMul > 0) {
                this.cameras.main.shake(120, Math.min(0.008 + lost * 0.0004, 0.015) * shakeMul, true);
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

    /**
     * Handle squad callout events from FollowerCombatSystem.
     * Displays directional threat warnings in the mission log and as floating text.
     */
    onMarineCallout(info) {
        if (!info) return;
        const roleNames = { tech: 'TECH', medic: 'MEDIC', heavy: 'HEAVY' };
        const name = roleNames[info.roleKey] || 'MARINE';
        const typeLabels = {
            contact: 'CONTACT',
            facehugger: 'FACEHUGGER',
            queen: 'QUEEN',
        };
        const typeLabel = typeLabels[info.callType] || 'CONTACT';
        const dir = (info.direction || '').toUpperCase();
        const urgency = info.close ? '!' : '';
        const text = `${name}: ${typeLabel} ${dir}${urgency}`;
        if (this.missionLog) this.missionLog.addMessage(text);
    }

    showFloatingText(x, y, text, color) {
        if (this.missionLog) {
            this.missionLog.addMessage(text);
        }
        const len = String(text || '').length;
        const fontPx = len > 34 ? 14 : (len > 22 ? 15 : 16);
        const msg = this.add.text(x, y, text, {
            fontSize: `${fontPx}px`,
            fontFamily: 'Impact, "Arial Black", sans-serif',
            fontStyle: 'bold',
            color,
            backgroundColor: '#0f1a22',
            padding: { left: 6, right: 6, top: 3, bottom: 3 },
        });
        msg.setOrigin(0.5);
        msg.setStroke('#03080d', 4);
        msg.setShadow(2, 2, '#000000', 0.75, false, true);
        msg.setDepth(235);
        this.tweens.add({
            targets: msg,
            y: y - 22,
            scale: 1.04,
            alpha: 0,
            duration: 820,
            ease: 'Cubic.out',
            onComplete: () => msg.destroy(),
        });
    }

    get currentCommanderDirective() {
        return this.commanderSystem ? this.commanderSystem.currentCommanderDirective : '';
    }

    get lastObjectiveProgressCount() {
        return this.objectiveSystem ? this.objectiveSystem.lastObjectiveProgressCount : 0;
    }

    createCommanderOverlay() {
        this.commanderSystem.initOverlay();
    }

    summarizeThreatLanes(marines = null, maxDist = CONFIG.TILE_SIZE * 14) {
        return this.commanderSystem.summarizeThreatLanes(marines, maxDist);
    }

    parseCommanderLaneDirective(text = '') {
        return this.commanderSystem.parseCommanderLaneDirective(text);
    }

    getRoleAssignedLane(roleKey = '', laneDirective = null) {
        return this.commanderSystem.getRoleAssignedLane(roleKey, laneDirective);
    }

    updateCommanderOverlay(time = this.time.now, marines = null) {
        this.commanderSystem.updateOverlay(time, marines);
    }

    updateCommandFormationDirective(time = this.time.now) {
        const active = time <= (this.commandFormationUntil || 0);
        if (active === this.commandFormationActive) return;
        if (!this.squadSystem || !this.commandFormationBase) return;
        this.commandFormationActive = active;
        if (active) {
            this.squadSystem.minSpacing = Math.max(24, this.commandFormationBase.minSpacing * 0.82);
            this.squadSystem.snakeCatchupGain = this.commandFormationBase.snakeCatchupGain * 1.2;
            this.squadSystem.snakeStaggerMinMs = 250;
            this.squadSystem.snakeStaggerMaxMs = 250;
            this.squadSystem.rebuildSnakeStaggerProfile();
            return;
        }
        this.squadSystem.minSpacing = this.commandFormationBase.minSpacing;
        this.squadSystem.snakeCatchupGain = this.commandFormationBase.snakeCatchupGain;
        this.squadSystem.snakeStaggerMinMs = 250;
        this.squadSystem.snakeStaggerMaxMs = 250;
        this.squadSystem.rebuildSnakeStaggerProfile();
    }

    onFacehuggerLatch(target, _enemy = null, time = this.time.now) {
        if (!target || target.active === false || target.alive === false) return;
        this.showFloatingText(target.x, target.y - 30, 'FACEHUGGER LATCHED', '#ff9fa8');
        this.markCombatAction(time);
        const team = this.squadSystem ? this.squadSystem.getAllMarines() : [this.leader];
        for (const marine of team) {
            if (!marine || marine.active === false || marine.alive === false || !Number.isFinite(marine.morale)) continue;
            const shock = marine === target ? 10 : 4.5;
            marine.morale = Phaser.Math.Clamp(marine.morale - shock, -100, 100);
        }
        this.directorOverrideMods = {
            ...(this.directorOverrideMods || {}),
            marineJamMul: Phaser.Math.Clamp((Number(this.combatMods?.marineJamMul) || 1) * 1.12, 0.2, 3),
            marineReactionMul: Phaser.Math.Clamp((Number(this.combatMods?.marineReactionMul) || 1) * 1.08, 0.2, 3),
        };
        this.directorOverrideUntil = Math.max(this.directorOverrideUntil || 0, time + 2200);
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
        const threatType = this.getMarineImmediateThreatType(marine, CONFIG.TILE_SIZE * 7.2);
        const threatPool = THREAT_SPOT_CALLOUTS[threatType] || null;
        const prev = marine.lastSpotCallout || '';
        const basePool = (threatPool && Math.random() < 0.82)
            ? threatPool.concat(sourcePool)
            : sourcePool;
        const pool = basePool.filter((line) => line !== prev);
        const line = Phaser.Utils.Array.GetRandom(pool.length > 0 ? pool : sourcePool);
        marine.lastSpotCallout = line;
        marine.nextSpotCalloutAt = time + Phaser.Math.Between(2600, 4200);
        this.nextMarineSpotCalloutAt = time + Phaser.Math.Between(1000, 1700);
        this.showFloatingText(marine.x, marine.y - 24, line, '#ffd9a6');
    }

    onMarineDamaged(marine, damageAmount = 0, time = this.time.now) {
        if (!marine || marine.active === false || marine.alive === false) return;

        // Marine pain grunt
        if (this.sfx) this.sfx.playMarineDamageGrunt();

        // Reload interrupt — taking damage cancels active reload
        const role = marine.roleKey || 'leader';
        const ammoState = this.marineAmmo?.get(role);
        if (ammoState && ammoState.isReloading) {
            ammoState.isReloading = false;
            ammoState.reloadUntil = 0;
            this.showFloatingText(marine.x, marine.y - 32, 'RELOAD INTERRUPTED', '#ff9999');
            this.hud?.refreshNow();
        }

        this.showMarineBloodSplash(marine, damageAmount, time);
        const threatType = this.getMarineImmediateThreatType(marine, CONFIG.TILE_SIZE * 4.5);
        const threatShockByType = {
            queen: 7.5,
            queenLesser: 5.8,
            warrior: 4.2,
            drone: 3.2,
            facehugger: 2.8,
        };
        const maxHp = Math.max(1, Number(marine.maxHealth) || 100);
        const dmgNorm = Phaser.Math.Clamp((Number(damageAmount) || 0) / maxHp, 0, 0.6);
        const panicShock = 2.4 + dmgNorm * 9 + (threatShockByType[threatType] || 0);
        marine.morale = Phaser.Math.Clamp((marine.morale || 0) - panicShock, -100, 100);
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
        const threatPool = THREAT_ATTACK_CALLOUTS[threatType] || null;
        const finalPool = (threatPool && Math.random() < 0.88)
            ? threatPool.concat(sourcePool)
            : sourcePool;
        const line = Phaser.Utils.Array.GetRandom(finalPool);
        this.showFloatingText(marine.x, marine.y - 26, line, '#ffb9a0');
        this.lastDamageCalloutByMarine.set(key, time + attackCooldown);
        this.nextMarineAttackCalloutAt = time + Phaser.Math.Between(1200, 2100);
    }

    showMarineBloodSplash(marine, damageAmount = 0, time = this.time.now) {
        if (!marine) return;
        const maxHp = Math.max(1, Number(marine.maxHealth) || 100);
        const dmgNorm = Phaser.Math.Clamp((Number(damageAmount) || 0) / maxHp, 0, 0.6);
        const intensity = Phaser.Math.Clamp(0.7 + dmgNorm * 2.8, 0.7, 2.6);
        const count = Math.max(6, Math.round((11 + Phaser.Math.Between(0, 8)) * this.fxQualityScale * intensity));
        const moveA = Phaser.Math.Angle.Between(0, 0, Number(marine.body?.velocity?.x) || 0, Number(marine.body?.velocity?.y) || 0);
        const hasMove = Number.isFinite(moveA);
        for (let i = 0; i < count; i++) {
            const dir = hasMove
                ? (moveA + Math.PI + Phaser.Math.FloatBetween(-1.4, 1.4))
                : Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(55, 210) * intensity;
            this.spawnFxSprite('dot', marine.x, marine.y - 4, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(0, 24),
                gravityY: Phaser.Math.FloatBetween(140, 280),
                life: Phaser.Math.Between(90, 220),
                scaleStart: Phaser.Math.FloatBetween(0.1, 0.24),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.72, 0.96),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xcc5252, 0xa63d3d, 0x8d2f2f, 0xd36a6a]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-9, 9),
            });
        }
        if (Math.random() < Phaser.Math.Clamp(0.42 + dmgNorm * 0.7, 0.42, 0.98)) {
            this.spawnFloorDecal(
                marine.x + Phaser.Math.FloatBetween(-10, 10),
                marine.y + Phaser.Math.FloatBetween(-10, 10),
                'blood'
            );
            if (Math.random() < 0.5) {
                this.spawnFloorDecal(
                    marine.x + Phaser.Math.FloatBetween(-14, 14),
                    marine.y + Phaser.Math.FloatBetween(-14, 14),
                    'blood'
                );
            }
        }
        if (time >= (this.nextImpactShakeAt || 0)) {
            const shakeMul = this.getCameraShakeMul();
            if (shakeMul > 0) this.cameras.main.shake(44, (0.0012 + dmgNorm * 0.0021) * shakeMul, true);
            this.nextImpactShakeAt = time + 120;
        }
    }

    // Brief steam puff from a bullet wound — the bullet micro-ruptures an acid sac.
    // Small, localised, 0.5-1 s, yellow-green tinted.
    showAlienRicochetMicroMarks(enemy, bullet) {
        if (this.fxQualityScale < 0.18) return;
        const ex = Number(enemy?.x) || 0;
        const ey = Number(enemy?.y) || 0;
        const key = String(bullet?.weaponKey || 'pulseRifle');
        const bvx = Number(bullet?.body?.velocity?.x) || 0;
        const bvy = Number(bullet?.body?.velocity?.y) || 0;
        const mag = Math.hypot(bvx, bvy);
        const hitAngle = mag > 0.01 ? Math.atan2(bvy, bvx) : Phaser.Math.FloatBetween(0, Math.PI * 2);
        // Tiny chip burst (not full wall-ricochet intensity).
        const count = key === 'shotgun' ? Phaser.Math.Between(4, 7) : Phaser.Math.Between(2, 4);
        for (let i = 0; i < count; i++) {
            const a = hitAngle + Math.PI + Phaser.Math.FloatBetween(-0.9, 0.9);
            const speed = Phaser.Math.FloatBetween(40, key === 'shotgun' ? 180 : 130);
            this.spawnFxSprite('debris', ex, ey, {
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - Phaser.Math.FloatBetween(8, 24),
                gravityY: Phaser.Math.FloatBetween(180, 340),
                life: Phaser.Math.Between(110, 260),
                scaleStart: Phaser.Math.FloatBetween(0.06, 0.14),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.28, 0.46),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd6d6d6, 0xb9c1c8, 0x8f9ca8]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-8, 8),
            });
            this.spawnFxSprite('dot', ex, ey, {
                vx: Math.cos(a) * (speed * 0.8),
                vy: Math.sin(a) * (speed * 0.8),
                life: Phaser.Math.Between(80, 170),
                scaleStart: Phaser.Math.FloatBetween(0.05, 0.11),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.22, 0.4),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xcfd8e0, 0x97a7b7]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-6, 6),
            });
        }
        // Occasional tiny scorch nick near the impact area.
        const scorchChance = key === 'shotgun' ? 0.26 : 0.14;
        if (Math.random() < scorchChance) {
            this.spawnFloorDecal(
                ex + Phaser.Math.Between(-5, 5),
                ey + Phaser.Math.Between(-5, 5),
                'scorch'
            );
        }
    }

    // Brief steam puff from a bullet wound — the bullet micro-ruptures an acid sac.
    // Small, localised, 0.5-1 s, yellow-green tinted.
    showAlienDirectionalAcidSpurt(enemy, bullet) {
        if (this.fxQualityScale < 0.18) return;
        const ex = Number(enemy?.x) || 0;
        const ey = Number(enemy?.y) || 0;
        const bvx = Number(bullet?.body?.velocity?.x) || 0;
        const bvy = Number(bullet?.body?.velocity?.y) || 0;
        const mag = Math.hypot(bvx, bvy);
        // Spurt away from shooter (same direction as incoming bullet travel).
        const baseAngle = mag > 0.01
            ? Math.atan2(bvy, bvx)
            : Phaser.Math.FloatBetween(0, Math.PI * 2);
        const key = String(bullet?.weaponKey || 'pulseRifle');
        const count = key === 'shotgun' ? Phaser.Math.Between(5, 9) : Phaser.Math.Between(3, 5);
        const cone = key === 'shotgun' ? 0.68 : 0.42;
        const acidPalette = [0xd4e832, 0xe0f040, 0xcbe22f, 0xb8d81f, 0xefff78];
        const acidHotPalette = [0xf6ffb8, 0xeeffcc, 0xffffff, 0xe8ff84];

        for (let i = 0; i < count; i++) {
            const a = baseAngle + Phaser.Math.FloatBetween(-cone, cone);
            const speed = Phaser.Math.FloatBetween(80, key === 'shotgun' ? 260 : 190);
            const vx = Math.cos(a) * speed;
            const vy = Math.sin(a) * speed;
            const sx = ex + Math.cos(a) * Phaser.Math.FloatBetween(3, 7);
            const sy = ey + Math.sin(a) * Phaser.Math.FloatBetween(3, 7);
            // Elongated liquid droplet — higher initial alpha, slight fade to simulate shiny surface
            const droplet = this.spawnFxSprite('dot', sx, sy, {
                vx,
                vy: vy - Phaser.Math.FloatBetween(10, 28),
                gravityY: Phaser.Math.FloatBetween(160, 320),
                life: Phaser.Math.Between(140, 300),
                scaleStart: Phaser.Math.FloatBetween(0.10, 0.20),
                scaleEnd: 0.02,
                alphaStart: Phaser.Math.FloatBetween(0.82, 1.0),
                alphaEnd: 0.15,
                tint: Phaser.Utils.Array.GetRandom(acidPalette),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-5, 5),
            });
            this.spawnFxSprite('ember', sx, sy, {
                vx: vx * Phaser.Math.FloatBetween(0.7, 0.92),
                vy: (vy - Phaser.Math.FloatBetween(12, 30)) * Phaser.Math.FloatBetween(0.68, 0.88),
                gravityY: Phaser.Math.FloatBetween(140, 280),
                life: Phaser.Math.Between(180, 360),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.24),
                scaleEnd: Phaser.Math.FloatBetween(0.04, 0.10),
                alphaStart: Phaser.Math.FloatBetween(0.64, 0.92),
                alphaEnd: 0.02,
                tint: Phaser.Utils.Array.GetRandom(acidPalette),
                rotation: a,
                spin: Phaser.Math.FloatBetween(-4, 4),
                drag: Phaser.Math.FloatBetween(0.7, 1.1),
            });
            // Bright specular glint trailing each droplet — shiny wet liquid look
            if (droplet && Math.random() < 0.6) {
                this.spawnFxSprite('dot', sx, sy, {
                    vx: vx * 0.7,
                    vy: (vy - Phaser.Math.FloatBetween(8, 20)) * 0.7,
                    gravityY: Phaser.Math.FloatBetween(100, 240),
                    life: Phaser.Math.Between(50, 120),
                    scaleStart: Phaser.Math.FloatBetween(0.06, 0.14),
                    scaleEnd: 0,
                    alphaStart: 1.0,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom(acidHotPalette),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-8, 8),
                });
            }
            if (!droplet) continue;
            const landDelay = Phaser.Math.Between(90, 240);
            this.time.delayedCall(landDelay, () => {
                if (!this.scene?.isActive?.()) return;
                const lx = droplet.x;
                const ly = droplet.y;
                // Small corrosive marks where droplets land.
                if (Math.random() < 0.92) {
                    this.spawnFloorDecal(
                        lx + Phaser.Math.Between(-2, 2),
                        ly + Phaser.Math.Between(-2, 2),
                        'acid_burn'
                    );
                } else {
                    this.spawnFloorDecal(
                        lx + Phaser.Math.Between(-2, 2),
                        ly + Phaser.Math.Between(-2, 2),
                        'acid'
                    );
                }
                if (Math.random() < 0.68) {
                    this.spawnAcidHazard(
                        lx + Phaser.Math.Between(-2, 2),
                        ly + Phaser.Math.Between(-2, 2),
                        {
                            radius: Phaser.Math.Between(6, 10),
                            duration: Phaser.Math.Between(850, 1800),
                            damageScale: Phaser.Math.FloatBetween(0.12, 0.28),
                            visualOnly: true,
                        }
                    );
                }
                this.spawnAcidImpactSheen(lx, ly, {
                    intensity: key === 'shotgun' ? 0.82 : 0.62,
                    radius: Phaser.Math.FloatBetween(0.28, 0.52),
                });
            });
        }
    }

    // Brief steam puff from a bullet wound — the bullet micro-ruptures an acid sac.
    // Small, localised, 0.5-1 s, yellow-green tinted.
    showAlienBloodSplatter(enemy, bullet) {
        if (this.fxQualityScale < 0.2) return;
        const ex = Number(enemy.x) || 0;
        const ey = Number(enemy.y) || 0;
        const bvx = Number(bullet?.body?.velocity?.x) || 0;
        const bvy = Number(bullet?.body?.velocity?.y) || 0;
        const mag = Math.hypot(bvx, bvy);
        // Blood flies in bullet direction (exit wound).
        const baseAngle = mag > 0.01
            ? Math.atan2(bvy, bvx)
            : Phaser.Math.FloatBetween(0, Math.PI * 2);
        const count = Phaser.Math.Between(3, 7);
        for (let i = 0; i < count; i++) {
            const a = baseAngle + Phaser.Math.FloatBetween(-0.7, 0.7);
            const speed = Phaser.Math.FloatBetween(50, 180);
            const vx = Math.cos(a) * speed;
            const vy = Math.sin(a) * speed;
            const sx = ex + Math.cos(a) * Phaser.Math.FloatBetween(2, 8);
            const sy = ey + Math.sin(a) * Phaser.Math.FloatBetween(2, 8);
            const splatSprite = this.spawnFxSprite('bloodSplat', sx, sy, {
                vx,
                vy: vy - Phaser.Math.FloatBetween(10, 30),
                gravityY: Phaser.Math.FloatBetween(120, 260),
                life: Phaser.Math.Between(300, 600),
                scaleStart: Phaser.Math.FloatBetween(0.25, 0.55),
                scaleEnd: Phaser.Math.FloatBetween(0.35, 0.65),
                alphaStart: Phaser.Math.FloatBetween(0.7, 0.95),
                alphaEnd: 0,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-3, 3),
            });
            this.spawnFxSprite('splash', sx, sy, {
                vx: vx * Phaser.Math.FloatBetween(0.45, 0.8),
                vy: (vy - Phaser.Math.FloatBetween(6, 18)) * Phaser.Math.FloatBetween(0.45, 0.72),
                gravityY: Phaser.Math.FloatBetween(80, 180),
                life: Phaser.Math.Between(120, 220),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.3),
                scaleEnd: Phaser.Math.FloatBetween(0.48, 0.82),
                alphaStart: Phaser.Math.FloatBetween(0.24, 0.42),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xe6ff84, 0xd4e832, 0xf0ffa0]),
                rotation: a,
                spin: Phaser.Math.FloatBetween(-1.8, 1.8),
            });
            // After the droplet 'lands', leave a floor decal + steam puff + splash.
            if (splatSprite) {
                const landTime = Phaser.Math.Between(200, 420);
                this.time.delayedCall(landTime, () => {
                    if (!this.scene?.isActive?.()) return;
                    const lx = splatSprite.x;
                    const ly = splatSprite.y;
                    // Small floor acid splat where it landed
                    if (Math.random() < 0.65) {
                        this.spawnFloorDecal(
                            lx + Phaser.Math.Between(-4, 4),
                            ly + Phaser.Math.Between(-4, 4),
                            'acid'
                        );
                    }
                    if (Math.random() < 0.92) {
                        this.spawnAcidHazard(
                            lx + Phaser.Math.Between(-3, 3),
                            ly + Phaser.Math.Between(-3, 3),
                            {
                                radius: Phaser.Math.Between(8, 14),
                                duration: Phaser.Math.Between(1400, 2600),
                                damageScale: Phaser.Math.FloatBetween(0.24, 0.52),
                                visualOnly: true,
                            }
                        );
                    }
                    // Steam-away puff — larger, more visible hissing steam on contact
                    this.spawnFxSprite('smoke', lx, ly, {
                        vx: Phaser.Math.FloatBetween(-10, 10),
                        vy: Phaser.Math.FloatBetween(-36, -14),
                        life: Phaser.Math.Between(400, 800),
                        scaleStart: Phaser.Math.FloatBetween(0.08, 0.18),
                        scaleEnd: Phaser.Math.FloatBetween(0.26, 0.50),
                        alphaStart: Phaser.Math.FloatBetween(0.18, 0.36),
                        alphaEnd: 0,
                        tint: Phaser.Utils.Array.GetRandom([0xc8d828, 0xa8b820, 0xd0e030]),
                        rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                        spin: Phaser.Math.FloatBetween(-1, 1),
                    });
                    // Splash micro-droplets on impact — tiny bright dots scatter from landing
                    const splashCount = Phaser.Math.Between(2, 4);
                    for (let s = 0; s < splashCount; s++) {
                        const sDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
                        this.spawnFxSprite('dot', lx, ly, {
                            vx: Math.cos(sDir) * Phaser.Math.FloatBetween(20, 60),
                            vy: -Phaser.Math.FloatBetween(18, 44),
                            gravityY: Phaser.Math.FloatBetween(180, 360),
                            life: Phaser.Math.Between(80, 180),
                            scaleStart: Phaser.Math.FloatBetween(0.05, 0.12),
                            scaleEnd: 0,
                            alphaStart: Phaser.Math.FloatBetween(0.8, 1.0),
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xeeff60, 0xf8ffb0, 0xd4e832, 0xffffff]),
                        });
                    }
                    this.spawnAcidImpactSheen(lx, ly, {
                        intensity: 0.86,
                        radius: Phaser.Math.FloatBetween(0.42, 0.72),
                    });
                });
            }
        }
    }

    resetAlienHitFxBudget(_time = this.time.now) {
        const alive = Math.max(0, Number(this.enemyManager?.getAliveCount?.()) || 0);
        const pressure = Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0, 0, 1);
        const fxMul = Phaser.Math.Clamp(Number(this.fxQualityScale) || 1, 0.2, 1.8);
        const aliveMul = Phaser.Math.Clamp(1 - (alive / 42), 0.4, 1);
        const pressureMul = Phaser.Math.Linear(1, 0.72, pressure);
        const steamCap = Math.max(10, Math.round(42 * fxMul * aliveMul * pressureMul));
        const sparkCap = Math.max(14, Math.round(56 * fxMul * aliveMul * pressureMul));
        this.alienHitFxBudget = {
            steamCap,
            sparkCap,
            steamUsed: 0,
            sparkUsed: 0,
        };
    }

    consumeAlienHitFxBudget(kind = 'steam', amount = 1) {
        const budget = this.alienHitFxBudget;
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (!budget || qty <= 0) return qty;
        if (kind === 'spark') {
            const remain = Math.max(0, budget.sparkCap - budget.sparkUsed);
            const allow = Math.min(remain, qty);
            budget.sparkUsed += allow;
            return allow;
        }
        const remain = Math.max(0, budget.steamCap - budget.steamUsed);
        const allow = Math.min(remain, qty);
        budget.steamUsed += allow;
        return allow;
    }

    showAlienHitSteam(x, y) {
        if (this.fxQualityScale < 0.25) return;
        const count = this.consumeAlienHitFxBudget('steam', Phaser.Math.Between(6, 12));
        if (count <= 0) return;
        const steamTints = [0xc8d828, 0xa8b820, 0xd0e030, 0xb0c020, 0xe0f040];
        for (let i = 0; i < count; i++) {
            const dir = Phaser.Math.FloatBetween(-0.8, 0.8);
            const spd = Phaser.Math.FloatBetween(4, 16);
            this.spawnFxSprite('smoke',
                x + Phaser.Math.Between(-5, 5),
                y + Phaser.Math.Between(-5, 5),
                {
                    vx: Math.cos(dir) * spd,
                    vy: -Phaser.Math.FloatBetween(18, 46),
                    gravityY: Phaser.Math.FloatBetween(-2, 4),
                    life: Phaser.Math.Between(760, 1560),
                    scaleStart: Phaser.Math.FloatBetween(0.1, 0.21),
                    scaleEnd: Phaser.Math.FloatBetween(0.38, 0.76),
                    alphaStart: Phaser.Math.FloatBetween(0.16, 0.38),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom(steamTints),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.24, 0.24),
                    drag: 0.14,
                }
            );
        }
        // Fast acid squirt jets — bright dots that spray out and arc down like shiny liquid.
        const squirtCount = this.consumeAlienHitFxBudget('steam', Phaser.Math.Between(4, 8));
        for (let i = 0; i < squirtCount; i++) {
            const sDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const sSpd = Phaser.Math.FloatBetween(70, 200);
            this.spawnFxSprite('dot',
                x + Phaser.Math.Between(-3, 3),
                y + Phaser.Math.Between(-3, 3),
                {
                    vx: Math.cos(sDir) * sSpd,
                    vy: Math.sin(sDir) * sSpd - Phaser.Math.FloatBetween(24, 60),
                    gravityY: Phaser.Math.FloatBetween(160, 340),
                    life: Phaser.Math.Between(160, 380),
                    scaleStart: Phaser.Math.FloatBetween(0.09, 0.22),
                    scaleEnd: 0,
                    alphaStart: Phaser.Math.FloatBetween(0.78, 1.0),
                    alphaEnd: 0.1,
                    tint: Phaser.Utils.Array.GetRandom([0xd4e832, 0xe0f040, 0xc8d020, 0xaaff44]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-6, 6),
                }
            );
        }
        // Shiny liquid specular highlights — bright near-white dots that pop briefly
        const glossCount = this.consumeAlienHitFxBudget('spark', Phaser.Math.Between(2, 4));
        for (let i = 0; i < glossCount; i++) {
            const gDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const gSpd = Phaser.Math.FloatBetween(30, 100);
            this.spawnFxSprite('dot',
                x + Phaser.Math.Between(-2, 2),
                y + Phaser.Math.Between(-2, 2),
                {
                    vx: Math.cos(gDir) * gSpd,
                    vy: Math.sin(gDir) * gSpd - Phaser.Math.FloatBetween(16, 40),
                    gravityY: Phaser.Math.FloatBetween(80, 200),
                    life: Phaser.Math.Between(60, 160),
                    scaleStart: Phaser.Math.FloatBetween(0.12, 0.26),
                    scaleEnd: 0.02,
                    alphaStart: 1.0,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xf8ffb0, 0xffffff, 0xeeffcc, 0xf0ffa0]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-8, 8),
                }
            );
        }
    }

    beginAlienWoundTrail(enemy, bullet, time = this.time.now) {
        if (!enemy || !enemy.active) return;
        const key = String(bullet?.weaponKey || 'pulseRifle');
        const bonusMs = key === 'shotgun'
            ? Phaser.Math.Between(1200, 2200)
            : Phaser.Math.Between(900, 1700);
        enemy.woundTrailUntil = Math.max(Number(enemy.woundTrailUntil) || 0, time + bonusMs);
        const cadence = key === 'shotgun' ? Phaser.Math.Between(64, 110) : Phaser.Math.Between(82, 138);
        enemy.nextWoundSteamAt = Math.min(
            Number(enemy.nextWoundSteamAt) || (time + cadence),
            time + Phaser.Math.Between(38, 72)
        );
        enemy.woundTrailStrength = Phaser.Math.Clamp(
            Math.max(Number(enemy.woundTrailStrength) || 0, key === 'shotgun' ? 1 : 0.7),
            0.35,
            1.2
        );
    }

    updateAlienWoundTrails(time) {
        if (this.fxQualityScale < 0.2 || !this.enemyManager) return;
        const enemies = this.enemyManager.getActiveEnemies?.() || [];
        for (const enemy of enemies) {
            if (!enemy || !enemy.active) continue;
            const until = Number(enemy.woundTrailUntil) || 0;
            if (time >= until) continue;
            if (time < (Number(enemy.nextWoundSteamAt) || 0)) continue;
            const vx = Number(enemy.body?.velocity?.x) || 0;
            const vy = Number(enemy.body?.velocity?.y) || 0;
            const speed = Math.hypot(vx, vy);
            // Trail reads as "following smoke", only when moving.
            if (speed < 16) {
                enemy.nextWoundSteamAt = time + Phaser.Math.Between(130, 220);
                continue;
            }
            const dir = Math.atan2(vy, vx);
            const tx = enemy.x - Math.cos(dir) * Phaser.Math.FloatBetween(5, 10) + Phaser.Math.FloatBetween(-2, 2);
            const ty = enemy.y - Math.sin(dir) * Phaser.Math.FloatBetween(5, 10) + Phaser.Math.FloatBetween(-2, 2);
            const lifeNorm = Phaser.Math.Clamp((until - time) / 2200, 0.15, 1);
            const strength = Phaser.Math.Clamp(Number(enemy.woundTrailStrength) || 0.7, 0.35, 1.2) * lifeNorm;
            const puffs = Math.random() < 0.34 ? 2 : 1;
            const emitCount = this.consumeAlienHitFxBudget('steam', puffs);
            if (emitCount <= 0) {
                enemy.nextWoundSteamAt = time + Phaser.Math.Between(92, 180);
                continue;
            }
            for (let i = 0; i < emitCount; i++) {
                this.spawnFxSprite('smoke', tx + Phaser.Math.Between(-2, 2), ty + Phaser.Math.Between(-2, 2), {
                    vx: -Math.cos(dir) * Phaser.Math.FloatBetween(8, 28) + Phaser.Math.FloatBetween(-8, 8),
                    vy: -Math.sin(dir) * Phaser.Math.FloatBetween(8, 28) - Phaser.Math.FloatBetween(6, 20),
                    life: Phaser.Math.Between(170, 420),
                    scaleStart: Phaser.Math.FloatBetween(0.035, 0.085) * strength,
                    scaleEnd: Phaser.Math.FloatBetween(0.15, 0.34) * strength,
                    alphaStart: Phaser.Math.FloatBetween(0.11, 0.22) * strength,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xd8ffe0, 0xbcecc6, 0x9ec9a8]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.9, 0.9),
                });
            }
            enemy.nextWoundSteamAt = time + Phaser.Math.Between(72, 146);
            enemy.woundTrailStrength = Phaser.Math.Clamp(strength * 0.98, 0.3, 1.2);
        }
    }

    showAlienHitSparks(enemy, bullet) {
        if (this.fxQualityScale < 0.18 || !enemy) return;
        const x = Number(enemy.x) || 0;
        const y = Number(enemy.y) || 0;
        const key = String(bullet?.weaponKey || 'pulseRifle');
        const bvx = Number(bullet?.body?.velocity?.x) || 0;
        const bvy = Number(bullet?.body?.velocity?.y) || 0;
        const baseA = Math.hypot(bvx, bvy) > 0.01 ? Math.atan2(bvy, bvx) : Phaser.Math.FloatBetween(0, Math.PI * 2);
        const count = this.consumeAlienHitFxBudget('spark', key === 'shotgun' ? Phaser.Math.Between(7, 12) : Phaser.Math.Between(4, 8));
        if (count <= 0) return;
        for (let i = 0; i < count; i++) {
            const a = baseA + Math.PI + Phaser.Math.FloatBetween(-0.85, 0.85);
            const speed = Phaser.Math.FloatBetween(120, key === 'shotgun' ? 360 : 260);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed - Phaser.Math.FloatBetween(10, 34),
                gravityY: Phaser.Math.FloatBetween(220, 480),
                life: Phaser.Math.Between(44, 120),
                scaleStart: Phaser.Math.FloatBetween(0.06, 0.14),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.75, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xfff6cf, 0xffcf86, 0xffb45e]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-16, 16),
            });
        }
        if (Math.random() < 0.68 * this.fxQualityScale && this.consumeAlienHitFxBudget('spark', 1) > 0) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(44, 96),
                rangeMin: 16,
                rangeBoost: key === 'shotgun' ? 40 : 28,
                intensityMin: 0.22,
                intensityBoost: key === 'shotgun' ? 0.44 : 0.34,
                softRadiusMin: 18,
                softRadiusBoost: 22,
                color: Phaser.Utils.Array.GetRandom([0xffb95f, 0xffd487, 0xff8f3f]),
            });
        }
        const moltenQty = this.consumeAlienHitFxBudget('spark', key === 'shotgun' ? Phaser.Math.Between(3, 5) : Phaser.Math.Between(2, 4));
        if (moltenQty > 0) {
            this.spawnMoltenSparkCascade(x, y, {
                count: moltenQty,
                angle: baseA + Math.PI,
                cone: 1.0,
                speedMin: 140,
                speedMax: key === 'shotgun' ? 400 : 300,
                scaleMin: 0.08,
                scaleMax: 0.16,
                gravityMin: 350,
                gravityMax: 650,
                smokeChance: 0.48,
                lightChance: 0.16,
            });
        }
    }

    spawnAcidImpactSheen(x, y, options = {}) {
        if (this.fxQualityScale < 0.18) return;
        const intensity = Phaser.Math.Clamp(Number(options.intensity) || 1, 0.2, 1.8);
        const radius = Phaser.Math.Clamp(Number(options.radius) || 0.5, 0.18, 1.4);
        const acidBright = [0xffffff, 0xf8ffb0, 0xeeffcc, 0xe8ff84, 0xd4ff8a];
        const acidBody = [0xe7ff72, 0xd4e832, 0xc2db28, 0xa6cd2d];

        this.spawnFxSprite('flare', x, y, {
            life: Phaser.Math.Between(80, 160),
            scaleStart: Phaser.Math.FloatBetween(0.08, 0.18) * radius,
            scaleEnd: Phaser.Math.FloatBetween(0.5, 0.9) * radius,
            alphaStart: Phaser.Math.FloatBetween(0.25, 0.42) * intensity,
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom(acidBright),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.2, 1.2),
        });
        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(120, 220),
            scaleStart: Phaser.Math.FloatBetween(0.08, 0.16) * radius,
            scaleEnd: Phaser.Math.FloatBetween(0.62, 1.05) * radius,
            alphaStart: Phaser.Math.FloatBetween(0.18, 0.34) * intensity,
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom(acidBody),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-0.8, 0.8),
        });
        if (Math.random() < 0.72 * intensity) {
            this.spawnFxSprite('bokeh', x + Phaser.Math.FloatBetween(-6, 6), y + Phaser.Math.FloatBetween(-5, 5), {
                vx: Phaser.Math.FloatBetween(-8, 8),
                vy: Phaser.Math.FloatBetween(-10, -2),
                life: Phaser.Math.Between(100, 220),
                scaleStart: Phaser.Math.FloatBetween(0.08, 0.18) * radius,
                scaleEnd: Phaser.Math.FloatBetween(0.28, 0.52) * radius,
                alphaStart: Phaser.Math.FloatBetween(0.14, 0.28) * intensity,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(acidBright),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.5, 0.5),
            });
        }
    }

    spawnMoltenSparkCascade(x, y, options = {}) {
        if (this.fxQualityScale < 0.16) return;
        const count = Math.max(1, Math.floor(Number(options.count) || 4));
        const angle = Number.isFinite(Number(options.angle)) ? Number(options.angle) : Phaser.Math.FloatBetween(0, Math.PI * 2);
        const cone = Math.max(0.05, Number(options.cone) || 0.7);
        const speedMin = Math.max(40, Number(options.speedMin) || 180);
        const speedMax = Math.max(speedMin + 10, Number(options.speedMax) || 520);
        const scaleMin = Math.max(0.02, Number(options.scaleMin) || 0.10);
        const scaleMax = Math.max(scaleMin, Number(options.scaleMax) || 0.24);
        const gravityMin = Math.max(0, Number(options.gravityMin) || 380);
        const gravityMax = Math.max(gravityMin, Number(options.gravityMax) || 720);
        const smokeChance = Phaser.Math.Clamp(Number(options.smokeChance) || 0.55, 0, 1);
        const lightChance = Phaser.Math.Clamp(Number(options.lightChance) || 0.18, 0, 1);
        const palette = options.palette || [0xffffff, 0xfff1c2, 0xffd37a, 0xffa349, 0xff7326, 0xcc3f15];

        for (let i = 0; i < count; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-cone, cone);
            const speed = Phaser.Math.FloatBetween(speedMin, speedMax);
            const ember = this.spawnFxSprite('ember', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(20, 70),
                gravityY: Phaser.Math.FloatBetween(gravityMin, gravityMax),
                life: Phaser.Math.Between(180, 420),
                scaleStart: Phaser.Math.FloatBetween(scaleMin, scaleMax),
                scaleEnd: Phaser.Math.FloatBetween(scaleMin * 0.18, scaleMax * 0.42),
                alphaStart: Phaser.Math.FloatBetween(0.86, 1.0),
                alphaEnd: Phaser.Math.FloatBetween(0.08, 0.28),
                tint: Phaser.Utils.Array.GetRandom(palette),
                rotation: dir,
                spin: Phaser.Math.FloatBetween(-6, 6),
                drag: Phaser.Math.FloatBetween(0.7, 1.3),
            });
            if (ember && Math.random() < smokeChance) {
                this.spawnFxSprite('smoke', x, y, {
                    vx: ember.fx.vx * Phaser.Math.FloatBetween(0.05, 0.14),
                    vy: ember.fx.vy * Phaser.Math.FloatBetween(0.05, 0.14),
                    gravityY: Phaser.Math.FloatBetween(-8, 8),
                    life: Phaser.Math.Between(120, 260),
                    scaleStart: Phaser.Math.FloatBetween(0.05, 0.11),
                    scaleEnd: Phaser.Math.FloatBetween(0.24, 0.42),
                    alphaStart: Phaser.Math.FloatBetween(0.08, 0.16),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xfff0cf, 0xe7d6b6, 0xb7a186]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.6, 0.6),
                });
            }
        }

        if (Math.random() < lightChance * this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(110, 220),
                rangeMin: 18,
                rangeBoost: 36,
                intensityMin: 0.2,
                intensityBoost: 0.24,
                softRadiusMin: 18,
                softRadiusBoost: 24,
                color: Phaser.Utils.Array.GetRandom([0xffcf70, 0xff9a42, 0xff6f22]),
            });
        }
    }

    /**
     * Bullet→splash morph: at the moment of impact the bullet shape fans out
     * into a directional splatter, keeping the same travel angle. Gives the
     * visual impression of the round flattening/fragmenting on contact.
     */
    showBulletSplash(bullet) {
        if (!bullet || this.fxQualityScale < 0.15) return;
        const x = Number(bullet.x) || 0;
        const y = Number(bullet.y) || 0;
        const bvx = Number(bullet.body?.velocity?.x) || 0;
        const bvy = Number(bullet.body?.velocity?.y) || 0;
        const angle = Math.hypot(bvx, bvy) > 0.01
            ? Math.atan2(bvy, bvx)
            : (Number(bullet.rotation) || 0);
        const key = String(bullet.weaponKey || 'pulseRifle');

        // Weapon-specific tint palettes (match bullet colour)
        const tints = key === 'shotgun'
            ? [0xffcc66, 0xff9933, 0xffaa44, 0xffe0a0]
            : key === 'pistol'
                ? [0xaabbff, 0x99ccff, 0xddeeff, 0xbbccff]
                : [0xeeff88, 0xccdd44, 0xffff66, 0xffffff]; // pulseRifle

        // Primary splash — large, same direction as bullet
        this.spawnFxSprite('splash', x, y, {
            vx: Math.cos(angle) * Phaser.Math.FloatBetween(60, 140),
            vy: Math.sin(angle) * Phaser.Math.FloatBetween(60, 140),
            life: Phaser.Math.Between(60, 120),
            scaleStart: Phaser.Math.FloatBetween(0.4, 0.7),
            scaleEnd: Phaser.Math.FloatBetween(1.0, 1.6),
            alphaStart: Phaser.Math.FloatBetween(0.8, 1),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom(tints),
            rotation: angle,
            spin: 0,
        });

        // Secondary smaller splashes — fan out slightly from center
        const fanCount = key === 'shotgun' ? Phaser.Math.Between(2, 4) : Phaser.Math.Between(1, 2);
        for (let i = 0; i < fanCount; i++) {
            const spread = Phaser.Math.FloatBetween(-0.5, 0.5);
            const dir = angle + spread;
            const speed = Phaser.Math.FloatBetween(80, 200);
            this.spawnFxSprite('splash', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                life: Phaser.Math.Between(50, 100),
                scaleStart: Phaser.Math.FloatBetween(0.2, 0.45),
                scaleEnd: Phaser.Math.FloatBetween(0.6, 1.1),
                alphaStart: Phaser.Math.FloatBetween(0.6, 0.9),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(tints),
                rotation: dir,
                spin: Phaser.Math.FloatBetween(-1.5, 1.5),
            });
        }
    }

    /**
     * Quick bright hit-flash balls at the bullet impact point on an alien.
     * Small explosive pops of light to show each hit landing.
     */
    showAlienHitFlash(x, y, bullet = null) {
        if (this.fxQualityScale < 0.2) return;
        const bvx = Number(bullet?.body?.velocity?.x) || 0;
        const bvy = Number(bullet?.body?.velocity?.y) || 0;
        const mag = Math.hypot(bvx, bvy);
        const hitAngle = mag > 0.01 ? Math.atan2(bvy, bvx) : Phaser.Math.FloatBetween(0, Math.PI * 2);

        // Bright centre flash — a quick pop of white-yellow light.
        this.spawnFxSprite('flare', x, y, {
            life: Phaser.Math.Between(40, 80),
            scaleStart: Phaser.Math.FloatBetween(0.18, 0.32),
            scaleEnd: Phaser.Math.FloatBetween(0.5, 0.8),
            alphaStart: Phaser.Math.FloatBetween(0.85, 1.0),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xeeffcc, 0xddffaa]),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-3, 3),
        });

        // 2-4 small bright balls flying outward from impact — micro explosion.
        const ballCount = Phaser.Math.Between(2, 4);
        for (let i = 0; i < ballCount; i++) {
            const a = hitAngle + Phaser.Math.FloatBetween(-1.2, 1.2);
            const spd = Phaser.Math.FloatBetween(40, 130);
            this.spawnFxSprite('dot',
                x + Phaser.Math.FloatBetween(-2, 2),
                y + Phaser.Math.FloatBetween(-2, 2),
                {
                    vx: Math.cos(a) * spd,
                    vy: Math.sin(a) * spd,
                    gravityY: Phaser.Math.FloatBetween(60, 160),
                    life: Phaser.Math.Between(80, 180),
                    scaleStart: Phaser.Math.FloatBetween(0.10, 0.22),
                    scaleEnd: 0,
                    alphaStart: Phaser.Math.FloatBetween(0.8, 1.0),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xfff8cc, 0xeeff99, 0xccff66]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-5, 5),
                }
            );
        }

        // Soft glow ring around impact.
        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(60, 120),
            scaleStart: Phaser.Math.FloatBetween(0.08, 0.16),
            scaleEnd: Phaser.Math.FloatBetween(0.4, 0.7),
            alphaStart: Phaser.Math.FloatBetween(0.35, 0.6),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0xddffaa, 0xccff88, 0xeeffcc]),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
        });
    }

    showAlienHitAftermath(enemy, projectile = null) {
        if (!enemy || enemy.active === false) return;
        const x = Number(enemy.x) || 0;
        const y = Number(enemy.y) || 0;
        const vx = Number(projectile?.body?.velocity?.x) || 0;
        const vy = Number(projectile?.body?.velocity?.y) || 0;
        const mag = Math.hypot(vx, vy);
        const hasDir = mag > 0.01;
        const backA = hasDir ? Math.atan2(vy, vx) + Math.PI : Phaser.Math.FloatBetween(0, Math.PI * 2);
        const spillCount = Phaser.Math.Between(2, 5);
        for (let i = 0; i < spillCount; i++) {
            const a = backA + Phaser.Math.FloatBetween(-0.55, 0.55);
            const d = Phaser.Math.FloatBetween(8, 28);
            const sx = x + Math.cos(a) * d + Phaser.Math.FloatBetween(-3, 3);
            const sy = y + Math.sin(a) * d + Phaser.Math.FloatBetween(-3, 3);
            if (Math.random() < 0.76) this.spawnFloorDecal(sx, sy, 'acid');
            if (Math.random() < 0.82) {
                this.spawnAcidHazard(sx, sy, {
                    radius: Phaser.Math.Between(9, 16),
                    duration: Phaser.Math.Between(1800, 3400),
                    damageScale: Phaser.Math.FloatBetween(0.3, 0.66),
                    visualOnly: true,
                });
            }
            this.spawnFxSprite('dot', sx, sy, {
                vx: Math.cos(a) * Phaser.Math.FloatBetween(18, 70),
                vy: Math.sin(a) * Phaser.Math.FloatBetween(18, 70) - Phaser.Math.FloatBetween(4, 20),
                gravityY: Phaser.Math.FloatBetween(80, 170),
                life: Phaser.Math.Between(120, 260),
                scaleStart: Phaser.Math.FloatBetween(0.08, 0.2),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.6, 0.9),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0x79ff76, 0x9aff90, 0x7de6a5]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-5, 5),
            });
        }
        this.emitAlienSteamPlume(x, y, { intensity: Phaser.Math.FloatBetween(0.7, 1.3), directionless: true });
    }

    getMarineImmediateThreatType(marine, maxDist = CONFIG.TILE_SIZE * 5.5) {
        if (!marine || !this.enemyManager || typeof this.enemyManager.getAliveEnemies !== 'function') return null;
        const enemies = this.enemyManager.getAliveEnemies() || [];
        const priority = { queen: 5, queenLesser: 4, warrior: 3, drone: 2, facehugger: 1 };
        let best = null;
        let bestScore = -Infinity;
        for (const enemy of enemies) {
            if (!enemy || !enemy.active) continue;
            const d = Phaser.Math.Distance.Between(marine.x, marine.y, enemy.x, enemy.y);
            if (d > maxDist) continue;
            const p = priority[enemy.enemyType] || 0;
            const score = p * 1000 - d;
            if (score > bestScore) {
                bestScore = score;
                best = enemy.enemyType;
            }
        }
        return best;
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
        this.atmosphereSystem.updateMarineRadioChatter(time, marines);
    }

    updateAtmosphereIncidents(time, marines) {
        this.atmosphereSystem.updateAtmosphereIncidents(time, marines);
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
        if (this.isStagingSafeActive(this.time.now)) return;
        if (this.forceWarriorOnly) return;
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
        this.objectiveSystem.createTargetMarker();
    }

    updateObjectiveTargetMarker(targetWorld, time) {
        this.objectiveSystem.updateTargetMarker(targetWorld, time);
    }

    applyDefaultCursor() {
        // We use a custom reticle in TargetingSystem, so we hide the system cursor
        // except when over interactive UI elements.
        this.input.setDefaultCursor('none');
        
        const neutralSvg = [
            "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>",
            "<circle cx='16' cy='16' r='6' fill='none' stroke='%2356b8ff' stroke-width='2'/>",
            "<circle cx='16' cy='16' r='1.8' fill='%23dff4ff'/>",
            "<line x1='16' y1='2' x2='16' y2='8' stroke='%2356b8ff' stroke-width='2'/>",
            "<line x1='16' y1='24' x2='16' y2='30' stroke='%2356b8ff' stroke-width='2'/>",
            "<line x1='2' y1='16' x2='8' y2='16' stroke='%2356b8ff' stroke-width='2'/>",
            "<line x1='24' y1='16' x2='30' y2='16' stroke='%2356b8ff' stroke-width='2'/>",
            "</svg>",
        ].join('');
        const enemySvg = [
            "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>",
            "<circle cx='16' cy='16' r='6' fill='none' stroke='%23ff4444' stroke-width='2'/>",
            "<circle cx='16' cy='16' r='1.9' fill='%23ffd6d6'/>",
            "<line x1='16' y1='2' x2='16' y2='8' stroke='%23ff4444' stroke-width='2'/>",
            "<line x1='16' y1='24' x2='16' y2='30' stroke='%23ff4444' stroke-width='2'/>",
            "<line x1='2' y1='16' x2='8' y2='16' stroke='%23ff4444' stroke-width='2'/>",
            "<line x1='24' y1='16' x2='30' y2='16' stroke='%23ff4444' stroke-width='2'/>",
            "</svg>",
        ].join('');
        const encoded = `data:image/svg+xml;utf8,${neutralSvg}`;
        const enemyEncoded = `data:image/svg+xml;utf8,${enemySvg}`;
        this.defaultCursor = `url("${encoded}") 16 16, crosshair`;
        this.enemyTargetCursor = `url("${enemyEncoded}") 16 16, crosshair`;
    }

    createEnemyHoverIndicator() {
        this.enemyHoverBox = this.add.graphics();
        this.enemyHoverBox.setDepth(212);
        this.enemyHoverBox.setScrollFactor(1);
        this.enemyHoverBox.setVisible(false);

        this.enemyHoverText = this.add.text(0, 0, '', {
            fontSize: '11px',
            fontFamily: '"Share Tech Mono", monospace',
            color: '#ff4444',
            stroke: '#000000',
            strokeThickness: 2,
        });
        this.enemyHoverText.setDepth(213);
        this.enemyHoverText.setScrollFactor(1);
        this.enemyHoverText.setVisible(false);
    }

    createDoorHoverIndicator() {
        this.doorHoverBox = this.add.graphics();
        this.doorHoverBox.setDepth(211);
        this.doorHoverBox.setScrollFactor(1);
        this.doorHoverBox.setVisible(false);
        this.doorMenuLinkFx = this.add.graphics();
        this.doorMenuLinkFx.setDepth(210);
        this.doorMenuLinkFx.setScrollFactor(1);
        this.doorMenuLinkFx.setVisible(false);
        this.activeDoorHoverAnchor = null;
        this.doorHoverMenuGraceUntil = 0;
    }

    findHoveredEnemy(worldX, worldY) {
        if (!this.enemyManager) return null;
        const enemies = this.enemyManager.getActiveEnemies
            ? this.enemyManager.getActiveEnemies()
            : (Array.isArray(this.enemyManager.enemies) ? this.enemyManager.enemies.filter((e) => e?.active) : []);
        let best = null;
        let bestDist = Infinity;
        for (const enemy of enemies) {
            if (!enemy || enemy.active === false || enemy.visible === false) continue;
            const b = (typeof enemy.getBounds === 'function')
                ? enemy.getBounds()
                : { left: enemy.x - 14, top: enemy.y - 14, right: enemy.x + 14, bottom: enemy.y + 14, width: 28, height: 28 };
            const pad = 4;
            if (worldX < (b.left - pad) || worldX > (b.right + pad) || worldY < (b.top - pad) || worldY > (b.bottom + pad)) continue;
            const d = Phaser.Math.Distance.Between(worldX, worldY, enemy.x, enemy.y);
            if (d < bestDist) {
                bestDist = d;
                best = enemy;
            }
        }
        return best;
    }

    updateAlienHoverIndicator(enemy) {
        if (!this.enemyHoverBox || !this.enemyHoverText) return;
        if (!this._reticleLoggedOnce) { this._reticleLoggedOnce = true; console.log('[ALIENS] reticle v2 running'); }

        const now = this.time.now;

        // Track target changes to drive lock-on animation.
        const targetChanged = enemy !== this._reticleLastEnemy;
        if (targetChanged) {
            this._reticleLockAt = now;
            this._reticleLastEnemy = enemy;
        }
        const lockAge = now - (this._reticleLockAt || 0);
        const LOCK_MS = 220; // ms to complete lock-on animation
        const lockProgress = Math.min(1, lockAge / LOCK_MS); // 0 → 1

        // Called with null (pause / menu) — reset state.
        if (enemy === null) {
            this._reticleLastEnemy = null;
            this._reticleLockAt = undefined;
            this._lastHoveredEnemy = null;
            this._lastHoverX = undefined;
        }

        // Invalidate if cached enemy died.
        if (this._reticleLastEnemy && (!this._reticleLastEnemy.active || !this._reticleLastEnemy.visible)) {
            this._reticleLastEnemy = null;
            enemy = null;
        }

        this.enemyHoverBox.clear();

        const pointer = this.input.activePointer;
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;

        // ── IDLE STATE: no enemy under cursor ──────────────────────────────────
        if (!enemy || enemy.active === false || enemy.visible === false) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.0038);
            const alpha = 0.88 + 0.10 * pulse;
            const rSize = 10 + pulse * 2;
            const rGap = 4;

            this.enemyHoverBox.lineStyle(2, 0xffffff, alpha);

            // Four crosshair arms
            this.enemyHoverBox.lineBetween(worldX - rSize - rGap, worldY, worldX - rGap, worldY);
            this.enemyHoverBox.lineBetween(worldX + rGap, worldY, worldX + rSize + rGap, worldY);
            this.enemyHoverBox.lineBetween(worldX, worldY - rSize - rGap, worldX, worldY - rGap);
            this.enemyHoverBox.lineBetween(worldX, worldY + rGap, worldX, worldY + rSize + rGap);

            // Centre pip
            this.enemyHoverBox.fillStyle(0xffffff, alpha * 0.9);
            this.enemyHoverBox.fillCircle(worldX, worldY, 2);

            // Expanding scan ring — repeats every 2.8s
            const scanPhase = (now % 2800) / 2800;
            const scanR = rGap + (rSize + rGap + 10) * scanPhase;
            this.enemyHoverBox.lineStyle(1, 0xffffff, 0.70 * (1 - scanPhase));
            this.enemyHoverBox.strokeCircle(worldX, worldY, scanR);

            this.enemyHoverBox.setVisible(true);
            this.enemyHoverText.setVisible(false);
            if (this.enemyHoverBg) this.enemyHoverBg.setVisible(false);
            return;
        }

        // ── LOCK-ON / LOCKED STATE: enemy targeted ─────────────────────────────
        const b = (typeof enemy.getBounds === 'function')
            ? enemy.getBounds()
            : { left: enemy.x - 14, top: enemy.y - 14, width: 28, height: 28 };

        // Brackets start 12px expanded outward and contract to 3px pad over LOCK_MS.
        const expandPad = (1 - lockProgress) * 12;
        const pad = 3 + expandPad;
        const left   = b.left   - pad;
        const top    = b.top    - pad;
        const right  = b.left   + b.width  + pad;
        const bottom = b.top    + b.height + pad;

        // Color: orange (#ff8800) → red (#ff4444) during lock-on, gentle breathe after.
        const breathe = lockProgress >= 1 ? 0.04 * Math.sin(now * 0.005) : 0;
        const gr = Math.round(Phaser.Math.Linear(0x88, 0x44, lockProgress));
        const gb = Math.round(Phaser.Math.Linear(0x00, 0x44, lockProgress));
        const lockColor = Phaser.Display.Color.GetColor(0xff, gr, gb);
        const lineAlpha = Phaser.Math.Clamp(0.75 + lockProgress * 0.2 + breathe, 0.6, 1.0);
        const lineW = lockProgress >= 1 ? 1.5 : 2.0;

        this.enemyHoverBox.lineStyle(lineW, lockColor, lineAlpha);

        // Corner tick length: longer at start, snaps shorter at lock
        const cLen = 7 + (1 - lockProgress) * 5;

        // Corner brackets
        this.enemyHoverBox.beginPath();
        // Top-left
        this.enemyHoverBox.moveTo(left, top + cLen); this.enemyHoverBox.lineTo(left, top); this.enemyHoverBox.lineTo(left + cLen, top);
        // Top-right
        this.enemyHoverBox.moveTo(right - cLen, top); this.enemyHoverBox.lineTo(right, top); this.enemyHoverBox.lineTo(right, top + cLen);
        // Bottom-left
        this.enemyHoverBox.moveTo(left, bottom - cLen); this.enemyHoverBox.lineTo(left, bottom); this.enemyHoverBox.lineTo(left + cLen, bottom);
        // Bottom-right
        this.enemyHoverBox.moveTo(right - cLen, bottom); this.enemyHoverBox.lineTo(right, bottom); this.enemyHoverBox.lineTo(right, bottom - cLen);
        this.enemyHoverBox.strokePath();

        // Horizontal scan sweep during first 160ms of lock-on
        if (lockAge < 160) {
            const scanY = top + (bottom - top) * (lockAge / 160);
            this.enemyHoverBox.lineStyle(1, 0xffffff, 0.55 * (1 - lockAge / 160));
            this.enemyHoverBox.lineBetween(left + 2, scanY, right - 2, scanY);
        }

        // HP bar below the box — appears after half-lock
        if (lockProgress > 0.5) {
            const barAlpha = (lockProgress - 0.5) * 2;
            const hp = Phaser.Math.Clamp((enemy.health || 0) / Math.max(1, enemy.maxHealth || 100), 0, 1);
            const barW = right - left;
            const barY = bottom + 5;
            // Track
            this.enemyHoverBox.lineStyle(1, 0x333344, 0.5 * barAlpha);
            this.enemyHoverBox.lineBetween(left, barY, right, barY);
            // Fill
            const hpColor = hp > 0.6 ? 0xff4444 : (hp > 0.3 ? 0xff8822 : 0xffff33);
            this.enemyHoverBox.lineStyle(2, hpColor, 0.88 * barAlpha);
            this.enemyHoverBox.lineBetween(left, barY, left + barW * hp, barY);
        }

        // Target text — types in character-by-character during lock-on
        const name    = (enemy.enemyType || 'ALIEN').toUpperCase();
        const hpInt   = Math.ceil(enemy.health || 0);
        const maxHpInt = Math.ceil(enemy.maxHealth || 100);
        const fullText = `TGT: ${name}  ${hpInt}/${maxHpInt}`;
        const charsToShow = lockProgress >= 1
            ? fullText.length
            : Math.floor(lockProgress * fullText.length);
        const displayText = fullText.slice(0, charsToShow) + (charsToShow < fullText.length ? '_' : '');

        this.enemyHoverText.setText(displayText);
        this.enemyHoverText.setColor(lockProgress >= 1 ? '#ff4444' : '#ff8800');
        this.enemyHoverText.setFontSize('11px');
        this.enemyHoverText.setPosition(left, bottom + 12);
        this.enemyHoverText.setOrigin(0, 0);

        if (!this.enemyHoverBg) {
            this.enemyHoverBg = this.add.graphics();
            this.enemyHoverBg.setDepth(this.enemyHoverText.depth - 1);
        }
        this.enemyHoverBg.clear();
        if (charsToShow > 0) {
            const tb = this.enemyHoverText.getBounds();
            this.enemyHoverBg.fillStyle(0x000000, 0.65);
            this.enemyHoverBg.fillRect(tb.x - 3, tb.y - 3, tb.width + 6, tb.height + 6);
        }

        this.enemyHoverBox.setVisible(true);
        this.enemyHoverText.setVisible(charsToShow > 0);
        if (this.enemyHoverBg) this.enemyHoverBg.setVisible(charsToShow > 0);
    }

    updateCursorState() {
        if (!this.input || !this.input.activePointer) return;
        const menuKind = String(this.contextMenu?.meta?.kind || '');
        if (this.contextMenu && this.contextMenu.isOpen && menuKind !== 'door_hover') {
            this.updateAlienHoverIndicator(null);
            this.updateDoorHoverIndicator(null, null, null);
            return;
        }

        const pointer = this.input.activePointer;
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;
        // Skip expensive hover re-scan when pointer hasn't moved significantly (>2px).
        const pxDiff = Math.abs(worldX - (this._lastHoverX || 0)) + Math.abs(worldY - (this._lastHoverY || 0));
        if (pxDiff < 2 && this._lastHoveredEnemy !== undefined) {
            this.updateAlienHoverIndicator(this._lastHoveredEnemy);
        } else {
            this._lastHoverX = worldX;
            this._lastHoverY = worldY;
            this._lastHoveredEnemy = this.findHoveredEnemy(worldX, worldY);
            this.updateAlienHoverIndicator(this._lastHoveredEnemy);
        }
        const hoveredEnemy = this._lastHoveredEnemy;
        const hoveredDoor = this.doorManager.getDoorGroupAtWorldPos(worldX, worldY);
        this.updateDoorHoverIndicator(hoveredDoor, worldX, worldY);
        if (hoveredEnemy) {
            this.input.setDefaultCursor('none');
            return;
        }
        let actionable = false;

        if (hoveredDoor) {
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
        } else {
            this.input.setDefaultCursor('none');
        }
    }

    updateDoorHoverIndicator(doorGroup, worldX, worldY) {
        if (!this.doorHoverBox || !this.doorMenuLinkFx) return;
        const now = this.time?.now || 0;
        this.doorHoverBox.clear();
        this.doorMenuLinkFx.clear();
        const menuIsDoorHover = this.contextMenu?.isOpen && String(this.contextMenu?.meta?.kind || '') === 'door_hover';
        const menuHovered = menuIsDoorHover && this.contextMenu?.containsWorldPoint?.(worldX, worldY, 4);
        const hasDoor = !!(doorGroup && Array.isArray(doorGroup.doors) && doorGroup.doors.length > 0);
        if (hasDoor || menuHovered) {
            this.doorHoverMenuGraceUntil = now + 1000;
        }
        const inGrace = menuIsDoorHover && now < (this.doorHoverMenuGraceUntil || 0);

        if (!hasDoor && !menuHovered && !inGrace) {
            this.doorHoverBox.setVisible(false);
            this.doorMenuLinkFx.setVisible(false);
            this.activeDoorHoverAnchor = null;
            this.doorHoverMenuGraceUntil = 0;
            if (menuIsDoorHover) {
                this.contextMenu.hide();
            }
            return;
        }

        let center = null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let anchorDoorId = '';
        if (hasDoor) {
            center = this.getDoorGroupCenter(doorGroup);
            anchorDoorId = String(doorGroup.id || '');
            for (const door of doorGroup.doors) {
                if (!door) continue;
                const db = (typeof door.getBounds === 'function')
                    ? door.getBounds()
                    : new Phaser.Geom.Rectangle(door.x - 16, door.y - 16, 32, 32);
                minX = Math.min(minX, db.x);
                minY = Math.min(minY, db.y);
                maxX = Math.max(maxX, db.x + db.width);
                maxY = Math.max(maxY, db.y + db.height);
            }
            this.activeDoorHoverAnchor = {
                centerX: center.x,
                centerY: center.y,
                minX,
                minY,
                maxX,
                maxY,
                doorGroupId: anchorDoorId,
            };
        } else if (this.activeDoorHoverAnchor) {
            center = {
                x: this.activeDoorHoverAnchor.centerX,
                y: this.activeDoorHoverAnchor.centerY,
            };
            minX = this.activeDoorHoverAnchor.minX;
            minY = this.activeDoorHoverAnchor.minY;
            maxX = this.activeDoorHoverAnchor.maxX;
            maxY = this.activeDoorHoverAnchor.maxY;
            anchorDoorId = String(this.activeDoorHoverAnchor.doorGroupId || '');
        }
        if (!center || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            this.doorHoverBox.setVisible(false);
            this.doorMenuLinkFx.setVisible(false);
            if (menuIsDoorHover) this.contextMenu.hide();
            this.activeDoorHoverAnchor = null;
            return;
        }
        const pad = 4;
        this.doorHoverBox.lineStyle(1.5, 0xd9b96f, 0.94);
        this.doorHoverBox.fillStyle(0x5f4820, 0.12);
        this.doorHoverBox.fillRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        this.doorHoverBox.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        this.doorHoverBox.setVisible(true);

        const menuOnDoor = menuIsDoorHover
            && String(this.contextMenu?.meta?.doorGroupId || '') === anchorDoorId;
        if (hasDoor && !menuOnDoor) {
            this.showDoorContextMenu(doorGroup, center.x, center.y, {
                kind: 'door_hover',
                doorGroupId: anchorDoorId,
                anchorBounds: { minX, minY, maxX, maxY },
            });
        }
        if (!this.contextMenu?.container) {
            this.doorMenuLinkFx.setVisible(false);
            return;
        }

        const mx = this.contextMenu.container.x + 8;
        const my = this.contextMenu.container.y + 8;
        const dx = mx - center.x;
        const dy = my - center.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / dist;
        const uy = dy / dist;
        this.doorMenuLinkFx.fillStyle(0xe1bc62, 0.86);
        const step = 9;
        const size = 2;
        const jitterSeed = Number.isFinite(worldX) && Number.isFinite(worldY)
            ? Math.floor((worldX + worldY) * 0.1)
            : Math.floor((this.time?.now || 0) * 0.02);
        for (let t = 0; t < dist; t += step) {
            const jitter = (((Math.floor(t / step) + jitterSeed) % 2) === 0) ? 0 : 1;
            const px = center.x + ux * t;
            const py = center.y + uy * t;
            this.doorMenuLinkFx.fillRect(Math.round(px) - size + jitter, Math.round(py) - size, size * 2, size * 2);
        }
        this.doorMenuLinkFx.setVisible(true);
    }

    showMuzzleFlash(x, y, angle, weaponKey = 'pulseRifle') {
        const flashScale = Number(this.runtimeSettings?.spriteAnimation?.muzzleFlashScale) || 1;
        const fxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const flashBoost = Phaser.Math.Linear(0.85, 1.45, Phaser.Math.Clamp((fxIntensity - 0.2) / 2.8, 0, 1));
        const fps = Number(this.game?.loop?.actualFps) || 60;
        const perfMul = fps < 42 ? 0.52 : (fps < 50 ? 0.66 : (fps < 56 ? 0.8 : 1));
        const weaponScale = weaponKey === 'shotgun' ? 1.42 : (weaponKey === 'pistol' ? 1.08 : 1.26);
        const visualScale = flashScale * weaponScale;
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
        const offset = 18 * visualScale;
        const fx = x + Math.cos(angle) * offset;
        const fy = y + Math.sin(angle) * offset;
        this.spawnFxSprite('ring', fx, fy, {
            life: weaponKey === 'shotgun' ? 150 : 110,
            scaleStart: (weaponKey === 'shotgun' ? 0.24 : 0.16) * visualScale,
            scaleEnd: (weaponKey === 'shotgun' ? 1.05 : 0.76) * visualScale,
            alphaStart: weaponKey === 'shotgun' ? 0.62 : 0.5,
            alphaEnd: 0,
            tint: weaponKey === 'pistol' ? 0xbfd3ff : 0xffe4b5,
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.2, 1.2),
        });
        const coreQty = Math.max(3, Math.round(9 * p.coreMul * visualScale * this.fxQualityScale * flashBoost * perfMul));
        for (let i = 0; i < coreQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneCore, p.coneCore);
            const speed = Phaser.Math.FloatBetween(90, 220) * p.speedMul;
            const tint = Phaser.Utils.Array.GetRandom(p.paletteCore);
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                life: Phaser.Math.Between(24, 64),
                scaleStart: Phaser.Math.FloatBetween(0.36, 0.7) * visualScale,
                scaleEnd: 0,
                alphaStart: 1,
                alphaEnd: 0,
                tint,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-10, 10),
            });
        }

        const sparkQty = Math.max(4, Math.round(9 * p.sparkMul * visualScale * this.fxQualityScale * flashBoost * perfMul));
        for (let i = 0; i < sparkQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneSpark, p.coneSpark);
            const speed = Phaser.Math.FloatBetween(280, 560) * p.speedMul;
            const tint = Phaser.Utils.Array.GetRandom(p.paletteSpark);
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-18, 12),
                gravityY: Phaser.Math.FloatBetween(220, 420),
                life: Phaser.Math.Between(45, 125),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.26) * visualScale,
                scaleEnd: 0,
                alphaStart: 0.95,
                alphaEnd: 0,
                tint,
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-14, 14),
            });
        }

        const emberQty = Math.max(1, Math.round(6 * p.emberMul * visualScale * this.fxQualityScale * flashBoost * perfMul));
        for (let i = 0; i < emberQty; i++) {
            const dir = angle + Phaser.Math.FloatBetween(-p.coneEmber, p.coneEmber);
            const speed = Phaser.Math.FloatBetween(110, 260) * p.speedMul;
            this.spawnFxSprite('dot', fx, fy, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed,
                gravityY: Phaser.Math.FloatBetween(120, 240),
                life: Phaser.Math.Between(55, 150),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.32) * visualScale,
                scaleEnd: 0,
                alphaStart: 0.8,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(p.paletteEmber),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-8, 8),
            });
        }

        const smokeDirX = Math.cos(angle);
        const smokeDirY = Math.sin(angle);
        const smokeMul = weaponKey === 'shotgun' ? 1.36 : (weaponKey === 'pistol' ? 0.75 : 1.0);
        const smokeBaseChance = Phaser.Math.Clamp(p.smokeChance * 1.35, 0.08, 0.92);
        if (Math.random() < smokeBaseChance * this.fxQualityScale * flashBoost * perfMul) {
            const smokeCount = weaponKey === 'shotgun'
                ? Phaser.Math.Between(3, 5)
                : Phaser.Math.Between(1, 3);
            for (let i = 0; i < smokeCount; i++) {
                const along = Phaser.Math.FloatBetween(8, 26) * smokeMul;
                const lateral = Phaser.Math.FloatBetween(-9, 9);
                const sx = fx - smokeDirX * 4 + smokeDirX * along + (-smokeDirY) * lateral;
                const sy = fy - smokeDirY * 4 + smokeDirY * along + (smokeDirX) * lateral;
                this.spawnFxSprite('smoke', sx, sy, {
                    vx: smokeDirX * Phaser.Math.FloatBetween(28, 82) + Phaser.Math.FloatBetween(-16, 16),
                    vy: smokeDirY * Phaser.Math.FloatBetween(28, 82) + Phaser.Math.FloatBetween(-46, -12),
                    life: Phaser.Math.Between(280, 620),
                    scaleStart: Phaser.Math.FloatBetween(0.12, 0.24) * visualScale * smokeMul,
                    scaleEnd: Phaser.Math.FloatBetween(0.42, 0.88) * visualScale * smokeMul,
                    alphaStart: Phaser.Math.FloatBetween(0.2, 0.34),
                    alphaEnd: 0,
                    tint: weaponKey === 'pistol' ? 0xd8dff9 : 0xd8dbe0,
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.7, 0.7),
                });
            }
        }
        if (weaponKey !== 'pistol' && Math.random() < 0.46 * this.fxQualityScale * flashBoost * perfMul) {
            const hazeCount = weaponKey === 'shotgun' ? Phaser.Math.Between(2, 4) : Phaser.Math.Between(1, 2);
            for (let i = 0; i < hazeCount; i++) {
                this.spawnFxSprite('smoke', fx - smokeDirX * Phaser.Math.FloatBetween(3, 9), fy - smokeDirY * Phaser.Math.FloatBetween(3, 9), {
                    vx: Phaser.Math.FloatBetween(-12, 12),
                    vy: Phaser.Math.FloatBetween(-40, -16),
                    life: Phaser.Math.Between(520, 980),
                    scaleStart: Phaser.Math.FloatBetween(0.18, 0.3) * visualScale * smokeMul,
                    scaleEnd: Phaser.Math.FloatBetween(0.76, 1.28) * visualScale * smokeMul,
                    alphaStart: Phaser.Math.FloatBetween(0.12, 0.22),
                    alphaEnd: 0,
                    tint: 0xd2d8de,
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.35, 0.35),
                });
            }
        }
        if (Math.random() < 0.55 * this.fxQualityScale * flashBoost) {
            this.addSparkLight(fx, fy, this.time.now, {
                duration: Phaser.Math.Between(54, 120),
                rangeMin: 20,
                rangeBoost: 42 * flashBoost * weaponScale,
            });
        }
    }

    applyLeaderShotKick(weaponKey, time = this.time.now, context = {}) {
        if (time < (this.nextShotKickAt || 0)) return;
        const recoilNorm = Phaser.Math.Clamp(Number(this.weaponManager?.getRecoilNormalized?.(weaponKey)) || 0, 0, 1);
        const moveNorm = Phaser.Math.Clamp(Number(context.moveNorm) || 0, 0, 1.4);
        const pressure = Phaser.Math.Clamp(Number(context.pressure) || 0, 0, 1);
        const momentum = Phaser.Math.Clamp(Number(context.momentum) || 0, 0, 1);
        const baseByWeapon = {
            pulseRifle: 0.0022,
            shotgun: 0.0038,
            pistol: 0.0015,
        };
        const base = baseByWeapon[weaponKey] || 0.0018;
        const amp = base * (0.88 + recoilNorm * 0.9 + moveNorm * 0.35 + pressure * 0.2 - momentum * 0.16);
        const shakeMul = this.getCameraShakeMul();
        if (shakeMul > 0) this.cameras.main.shake(48, amp * shakeMul, true);

        // Sprite-level fire shake: 1-2px random jitter on the marine sprite
        if (this.leader) {
            this.leader._fireShakeUntil = time + 60;
        }
        
        this.nextShotKickAt = time + (weaponKey === 'shotgun' ? 72 : 48);
    }

    onHostileHitConfirm(enemy, bullet, killed = false, time = this.time.now) {
        if (!enemy || !bullet) return;
        const owner = String(bullet.ownerRoleKey || 'leader').toLowerCase();
        if (owner !== 'leader') return;
        const weaponKey = String(bullet.weaponKey || 'pulseRifle');
        const dt = time - (this.lastHitAt || -10000);
        this.hitStreak = dt <= 680 ? Math.min(9, (this.hitStreak || 0) + 1) : 1;
        this.lastHitAt = time;
        const shakeMul = this.getCameraShakeMul();
        const hitAmp = killed ? 0.0031 : 0.0022;
        if (shakeMul > 0) this.cameras.main.shake(killed ? 58 : 40, hitAmp * shakeMul, true);
        if (time < (this.nextHitConfirmAt || 0)) return;
        const hp = Math.max(0, Number(enemy.health) || 0);
        const hpMax = Math.max(1, Number(enemy.maxHealth) || 1);
        const hpPct = Phaser.Math.Clamp(hp / hpMax, 0, 1);
        const isCritical = !killed && hpPct <= 0.22;
        const label = killed
            ? (this.hitStreak >= 2 ? `KILL x${this.hitStreak}` : 'KILL')
            : (isCritical ? 'CRITICAL' : (this.hitStreak >= 3 ? `HIT x${this.hitStreak}` : 'HIT'));
        const color = killed
            ? (weaponKey === 'shotgun' ? '#ffc8a2' : '#ffe7b0')
            : (isCritical ? '#ffd6a5' : '#bdeaff');
        this.showFloatingText(enemy.x, enemy.y - 18, label, color);
        const flashColor = killed ? 0xffd79f : (isCritical ? 0xffb57a : 0x7cc7ff);
        const flashStrength = killed ? 0.18 : (isCritical ? 0.13 : 0.08);
        this.pulseHitFlash(flashStrength, flashColor);
        this.nextHitConfirmAt = time + (killed ? 80 : 120);
    }

    pulseHitFlash(strength = 0.08, color = 0x7cc7ff) {
        if (!this.hitFlash) return;
        const alpha = Phaser.Math.Clamp(Number(strength) || 0.08, 0.02, 0.24);
        this.hitFlash.setFillStyle(Number(color) || 0x7cc7ff, alpha);
        this.hitFlash.setAlpha(alpha);
        this.tweens.killTweensOf(this.hitFlash);
        this.tweens.add({
            targets: this.hitFlash,
            alpha: 0,
            duration: Math.floor(Phaser.Math.Linear(130, 210, alpha / 0.24)),
            ease: 'Quad.out',
        });
    }

    showImpactEffect(x, y, color = 0xdddddd, options = {}) {
        const profile = String(options.profile || 'wall').toLowerCase();
        if (this.sfx) this.sfx.playImpact(profile);
        const weaponKey = String(options.weaponKey || '').toLowerCase();
        const impactAngle = Number.isFinite(Number(options.impactAngle)) ? Number(options.impactAngle) : null;
        const impactNormalAngle = Number.isFinite(Number(options.impactNormalAngle)) ? Number(options.impactNormalAngle) : null;
        const directionalRicochet = (profile === 'wall' || profile === 'door') && Number.isFinite(impactAngle);
        const useSurfaceNormal = directionalRicochet && Number.isFinite(impactNormalAngle);
        const tangentA = useSurfaceNormal ? (impactNormalAngle + Math.PI * 0.5) : null;
        const tangentB = useSurfaceNormal ? (impactNormalAngle - Math.PI * 0.5) : null;
        const warmSparkPalette = [0xfff6d2, 0xffe09a, 0xffc65c, 0xffad3f, 0xff8c2f, 0xff6a22, 0xffcc44, 0xffaa22, 0xcc4a18];
        const profileMul = profile === 'door'
            ? 1.3
            : (profile === 'flesh' ? 0.92 : (profile === 'egg' ? 1.05 : 1.14));
        const weaponMul = weaponKey === 'shotgun'
            ? 1.28
            : (weaponKey === 'pistol' ? 0.9 : 1.0);
        const sparkIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.ricochetSparkIntensity) || 1, 0.4, 2.2);
        const impactFxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        // Boosted base multiplier from 2.45 to 3.85 for more sparks
        const fxBoost = 5.5 * impactFxIntensity * profileMul * weaponMul;
        const ricochetEnhance = (profile === 'wall' || profile === 'door') ? 1.28 : 1.0;
        const splashMul = fxBoost * ricochetEnhance;

        // Layered impact flash: bright center flare + larger soft flare to make ricochets pop.
        this.spawnFxSprite('flare', x, y, {
            life: Phaser.Math.Between(44, 88),
            scaleStart: Phaser.Math.FloatBetween(0.34, 0.56) * ricochetEnhance,
            scaleEnd: Phaser.Math.FloatBetween(0.98, 1.42) * ricochetEnhance,
            alphaStart: Phaser.Math.FloatBetween(0.9, 1),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xfff2cd, 0xffe2a4]),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-2.2, 2.2),
        });
        this.spawnFxSprite('flare', x, y, {
            life: Phaser.Math.Between(62, 120),
            scaleStart: Phaser.Math.FloatBetween(0.42, 0.72) * ricochetEnhance,
            scaleEnd: Phaser.Math.FloatBetween(1.35, 1.95) * ricochetEnhance,
            alphaStart: Phaser.Math.FloatBetween(0.44, 0.72),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0xffdba0, 0xffcf86, 0xffbe72]),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.3, 1.3),
        });

        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(120, 190),
            scaleStart: Phaser.Math.FloatBetween(0.12, 0.2),
            scaleEnd: Phaser.Math.FloatBetween(0.82, 1.34) * ricochetEnhance,
            alphaStart: Phaser.Math.FloatBetween(0.32, 0.56),
            alphaEnd: 0,
            tint: color,
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-0.8, 0.8),
        });
        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(130, 220),
            scaleStart: Phaser.Math.FloatBetween(0.1, 0.18),
            scaleEnd: Phaser.Math.FloatBetween(1.05, 1.75) * ricochetEnhance,
            alphaStart: Phaser.Math.FloatBetween(0.18, 0.34),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0xffd798, 0xffefcc, color]),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-0.6, 0.6),
        });
        if (profile === 'flesh') {
            const goreGlow = weaponKey === 'shotgun' ? 1.22 : (weaponKey === 'pistol' ? 0.88 : 1.0);
            this.spawnFxSprite('ring', x, y, {
                life: Phaser.Math.Between(110, 180),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.2),
                scaleEnd: Phaser.Math.FloatBetween(0.8, 1.2) * goreGlow,
                alphaStart: Phaser.Math.FloatBetween(0.24, 0.42),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xff9c8b, 0xffb2a4, 0xffc9bf]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.9, 0.9),
            });
        }

        const coreQty = Math.max(64, Math.round((96 + Phaser.Math.Between(0, 40)) * this.fxQualityScale * sparkIntensity * splashMul));
        for (let i = 0; i < coreQty; i++) {
            const dir = directionalRicochet
                ? (impactAngle + Math.PI + Phaser.Math.FloatBetween(-1.08, 1.08))
                : Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(90, 280) * sparkIntensity * ricochetEnhance;
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-18, 6),
                gravityY: 210,
                life: Phaser.Math.Between(38, 110),
                scaleStart: Phaser.Math.FloatBetween(0.18, 0.38),
                scaleEnd: 0,
                alphaStart: 1,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffcc44, 0xffaa22, 0xffe066, 0xffdd7a, 0xff9911, 0xfff0cf]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-10, 10),
            });
        }

        const sparkQty = Math.max(320, Math.round((440 + Phaser.Math.Between(0, 160)) * this.fxQualityScale * sparkIntensity * splashMul));
        for (let i = 0; i < sparkQty; i++) {
            const dir = directionalRicochet
                ? (
                    Math.random() < 0.58
                        ? (impactAngle + Math.PI + Phaser.Math.FloatBetween(-0.56, 0.56))
                        : ((useSurfaceNormal
                            ? (Math.random() < 0.5 ? tangentA : tangentB)
                            : (impactAngle + (Math.random() < 0.5 ? (Math.PI * 0.5) : -(Math.PI * 0.5))))
                            + Phaser.Math.FloatBetween(-0.34, 0.34))
                )
                : Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(300, 900) * sparkIntensity * ricochetEnhance;
            const speedNorm = Phaser.Math.Clamp((speed - 260) / 500, 0, 1);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-34, 14),
                gravityY: Phaser.Math.FloatBetween(260, 500),
                life: Phaser.Math.Between(56, 160),
                scaleStart: Phaser.Math.FloatBetween(0.18, 0.3) * (1 - speedNorm * 0.58),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.9, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(warmSparkPalette),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-16, 16),
            });
        }

        const ricochetQty = Math.max(56, Math.round((84 + Phaser.Math.Between(0, 36)) * this.fxQualityScale * sparkIntensity * profileMul * ricochetEnhance));
        for (let i = 0; i < ricochetQty; i++) {
            const dir = directionalRicochet
                ? (
                    (useSurfaceNormal
                        ? (Math.random() < 0.5 ? tangentA : tangentB)
                        : (impactAngle + (Math.random() < 0.5 ? (Math.PI * 0.5) : -(Math.PI * 0.5))))
                    + Phaser.Math.FloatBetween(-0.3, 0.3)
                )
                : Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(400, 1100) * sparkIntensity * Phaser.Math.Linear(0.9, 1.25, profileMul - 0.9) * ricochetEnhance;
            const speedNorm = Phaser.Math.Clamp((speed - 340) / 580, 0, 1);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-44, 24),
                gravityY: Phaser.Math.FloatBetween(320, 640),
                life: Phaser.Math.Between(36, 118),
                scaleStart: Phaser.Math.FloatBetween(0.13, 0.22) * (1 - speedNorm * 0.7),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.9, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(warmSparkPalette),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-20, 20),
            });
        }
        // Angular metal debris shards — heavier, tumble slowly, cold steel palette
        const debrisQty = Math.max(5, Math.round((8 + Phaser.Math.Between(0, 5)) * this.fxQualityScale * sparkIntensity));
        for (let i = 0; i < debrisQty; i++) {
            const dir = directionalRicochet
                ? (
                    Math.random() < 0.68
                        ? (impactAngle + Math.PI + Phaser.Math.FloatBetween(-0.5, 0.5))
                        : (
                            (useSurfaceNormal
                                ? (Math.random() < 0.5 ? tangentA : tangentB)
                                : (impactAngle + (Math.random() < 0.5 ? (Math.PI * 0.5) : -(Math.PI * 0.5))))
                            + Phaser.Math.FloatBetween(-0.24, 0.24)
                        )
                )
                : Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(120, 360) * sparkIntensity;
            this.spawnFxSprite('debris', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-20, 10),
                gravityY: Phaser.Math.FloatBetween(480, 820),
                life: Phaser.Math.Between(80, 200),
                scaleStart: Phaser.Math.FloatBetween(0.5, 1.1),
                scaleEnd: Phaser.Math.FloatBetween(0.1, 0.4),
                alphaStart: Phaser.Math.FloatBetween(0.7, 0.95),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xaabbc8, 0x8a9aac, 0xc0cad4, 0x7a8a98]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-6, 6),
            });
        }

        if (Math.random() < 0.96 * this.fxQualityScale) {
            const steamQty = Math.max(4, Math.round((7 + Phaser.Math.Between(0, 5)) * this.fxQualityScale * fxBoost * Phaser.Math.Linear(0.82, 1.25, profileMul - 0.9)));
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
                duration: Phaser.Math.Between(110, 220),
                rangeMin: 48 * sparkIntensity * profileMul * ricochetEnhance,
                rangeBoost: 120 * sparkIntensity * profileMul * ricochetEnhance,
                intensityMin: 0.66 * ricochetEnhance,
                intensityBoost: 0.64 * ricochetEnhance,
                softRadiusMin: 44 * ricochetEnhance,
                softRadiusBoost: 60 * ricochetEnhance,
                color: 0xffb24a,
            });
        }
        if (Math.random() < 0.52 * this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(72, 150),
                rangeMin: 34 * sparkIntensity * profileMul * ricochetEnhance,
                rangeBoost: 92 * sparkIntensity * profileMul * ricochetEnhance,
                intensityMin: 0.52 * ricochetEnhance,
                intensityBoost: 0.5 * ricochetEnhance,
                softRadiusMin: 34 * ricochetEnhance,
                softRadiusBoost: 48 * ricochetEnhance,
                color: 0xff8f2f,
            });
        }
        if (Math.random() < 0.22 * weaponMul && this.time.now >= (this.nextImpactShakeAt || 0)) {
            const shakeMul = this.getCameraShakeMul();
            const fleshBoost = profile === 'flesh' ? 1.22 : 1.0;
            if (shakeMul > 0) this.cameras.main.shake(45, (0.0018 + sparkIntensity * 0.0006) * shakeMul * weaponMul * fleshBoost, true);
            this.nextImpactShakeAt = this.time.now + 120;
        }
        // Molten trailing sparks — long-arcing white-hot→orange embers like welding spatter.
        if (profile === 'wall' || profile === 'door') {
            const moltenQty = Math.max(4, Math.round((7 + Phaser.Math.Between(0, 5)) * this.fxQualityScale * sparkIntensity * ricochetEnhance));
            this.spawnMoltenSparkCascade(x, y, {
                count: moltenQty,
                angle: directionalRicochet ? (impactAngle + Math.PI) : Phaser.Math.FloatBetween(0, Math.PI * 2),
                cone: directionalRicochet ? 0.78 : Math.PI,
                speedMin: 180 * sparkIntensity,
                speedMax: 520 * sparkIntensity * ricochetEnhance,
                scaleMin: 0.12,
                scaleMax: 0.24,
                gravityMin: 380,
                gravityMax: 700,
                smokeChance: 0.62,
                lightChance: 0.24,
                palette: [0xffffff, 0xfff4c8, 0xffd57a, 0xffa13d, 0xff7424, 0xcc4411],
            });

            // Electrical arc streaks — brief jagged lightning forks from metal impact
            const arcQty = Math.max(1, Math.round((2 + Phaser.Math.Between(0, 3)) * this.fxQualityScale * sparkIntensity));
            for (let i = 0; i < arcQty; i++) {
                const arcDir = directionalRicochet
                    ? (impactAngle + Math.PI + Phaser.Math.FloatBetween(-0.9, 0.9))
                    : Phaser.Math.FloatBetween(0, Math.PI * 2);
                const arcSpeed = Phaser.Math.FloatBetween(80, 220) * sparkIntensity;
                this.spawnFxSprite('arc', x, y, {
                    vx: Math.cos(arcDir) * arcSpeed,
                    vy: Math.sin(arcDir) * arcSpeed,
                    gravityY: 0,
                    life: Phaser.Math.Between(40, 120),
                    scaleStart: Phaser.Math.FloatBetween(0.4, 1.0) * ricochetEnhance,
                    scaleEnd: Phaser.Math.FloatBetween(0.05, 0.15),
                    alphaStart: Phaser.Math.FloatBetween(0.7, 1),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xddeeff, 0xaaccff, 0x88bbff, 0xffffff, 0xffe8cc]),
                    rotation: arcDir,
                    spin: Phaser.Math.FloatBetween(-6, 6),
                });
            }

            // Molten globs — heavy incandescent droplets that drip down with gravity
            const moltenGlobQty = Math.max(1, Math.round((2 + Phaser.Math.Between(0, 2)) * this.fxQualityScale * sparkIntensity));
            for (let i = 0; i < moltenGlobQty; i++) {
                const globDir = directionalRicochet
                    ? (impactAngle + Math.PI + Phaser.Math.FloatBetween(-0.7, 0.7))
                    : Phaser.Math.FloatBetween(0, Math.PI * 2);
                const globSpeed = Phaser.Math.FloatBetween(30, 100) * sparkIntensity;
                this.spawnFxSprite('molten', x, y, {
                    vx: Math.cos(globDir) * globSpeed,
                    vy: Math.sin(globDir) * globSpeed - Phaser.Math.FloatBetween(20, 50),
                    gravityY: Phaser.Math.FloatBetween(320, 560),
                    life: Phaser.Math.Between(250, 500),
                    scaleStart: Phaser.Math.FloatBetween(0.5, 1.0),
                    scaleEnd: Phaser.Math.FloatBetween(0.1, 0.3),
                    alphaStart: 1,
                    alphaEnd: Phaser.Math.FloatBetween(0.08, 0.2),
                    tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xfff4cc, 0xffcc55, 0xffaa22, 0xff7711]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-4, 4),
                });
            }
        }
        // Scorch decal on wall/floor hits (low probability — battlefield atmosphere).
        if ((profile === 'wall' || profile === 'floor') && Math.random() < 0.14 * weaponMul) {
            this.spawnFloorDecal(x, y, 'scorch');
        }
    }

    showDoorBreachEffect(x, y, cause = 'bullet', impactAngle = null) {
        const style = String(cause || 'bullet');
        if (style === 'enemy') {
            this.spawnFxSprite('ring', x, y, {
                life: Phaser.Math.Between(180, 300),
                scaleStart: Phaser.Math.FloatBetween(0.18, 0.26),
                scaleEnd: Phaser.Math.FloatBetween(1.05, 1.55),
                alphaStart: Phaser.Math.FloatBetween(0.22, 0.34),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0x93a3b2, 0x7b8b99, 0x5f6d79]),
            });
            const bucklePieces = Phaser.Math.Between(5, 9);
            for (let i = 0; i < bucklePieces; i++) {
                const dir = (Math.PI + Phaser.Math.FloatBetween(-0.9, 0.9));
                const speed = Phaser.Math.FloatBetween(100, 260);
                this.spawnFxSprite('debris', x, y, {
                    vx: Math.cos(dir) * speed,
                    vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(8, 36),
                    gravityY: Phaser.Math.FloatBetween(520, 860),
                    life: Phaser.Math.Between(130, 260),
                    scaleStart: Phaser.Math.FloatBetween(0.68, 1.22),
                    scaleEnd: Phaser.Math.FloatBetween(0.2, 0.45),
                    alphaStart: Phaser.Math.FloatBetween(0.7, 0.94),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0x9ca9b6, 0x6f7f8f, 0x4f5d69]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-7, 7),
                });
            }
        } else {
            this.spawnFxSprite('ring', x, y, {
                life: Phaser.Math.Between(120, 190),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.22),
                scaleEnd: Phaser.Math.FloatBetween(0.95, 1.42),
                alphaStart: Phaser.Math.FloatBetween(0.34, 0.48),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffd29b, 0xffb66f, 0xff9554]),
            });
            const crackSparks = Phaser.Math.Between(14, 22);
            for (let i = 0; i < crackSparks; i++) {
                const dir = Number.isFinite(Number(impactAngle))
                    ? (
                        Math.random() < 0.72
                            ? (Number(impactAngle) + Math.PI + Phaser.Math.FloatBetween(-0.5, 0.5))
                            : (Number(impactAngle) + (Math.random() < 0.5 ? (Math.PI * 0.5) : -(Math.PI * 0.5)) + Phaser.Math.FloatBetween(-0.32, 0.32))
                    )
                    : Phaser.Math.FloatBetween(0, Math.PI * 2);
                const speed = Phaser.Math.FloatBetween(220, 560);
                this.spawnFxSprite('dot', x, y, {
                    vx: Math.cos(dir) * speed,
                    vy: Math.sin(dir) * speed + Phaser.Math.FloatBetween(-30, 12),
                    gravityY: Phaser.Math.FloatBetween(240, 520),
                    life: Phaser.Math.Between(60, 150),
                    scaleStart: Phaser.Math.FloatBetween(0.14, 0.26),
                    scaleEnd: 0,
                    alphaStart: Phaser.Math.FloatBetween(0.85, 1),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xfff0bc, 0xffc777, 0xff9d46]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-16, 16),
                });
            }
        }
        const shakeMul = this.getCameraShakeMul();
        if (shakeMul > 0) {
            this.cameras.main.shake(style === 'enemy' ? 110 : 86, (style === 'enemy' ? 0.0028 : 0.0022) * shakeMul, true);
        }
    }

    showAlienAcidSplash(x, y, options = {}) {
        // Authentic palette: sulfuric yellow-chartreuse, NOT neon lime.
        const acidPalette = [0xd4e832, 0xe0f040, 0xc8d028, 0xb8c820, 0xecf458];
        const fxIntensity = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        const fxBoost = 1.4 * Phaser.Math.Linear(0.84, 1.28, Phaser.Math.Clamp((fxIntensity - 0.2) / 2.8, 0, 1));
        const acidBright = [0xffffff, 0xf8ffb0, 0xeeffcc, 0xe8ff84];

        this.spawnFxSprite('splash', x, y, {
            vx: Phaser.Math.FloatBetween(-24, 24),
            vy: Phaser.Math.FloatBetween(-18, 10),
            gravityY: Phaser.Math.FloatBetween(40, 120),
            life: Phaser.Math.Between(140, 240),
            scaleStart: Phaser.Math.FloatBetween(0.28, 0.42) * fxBoost,
            scaleEnd: Phaser.Math.FloatBetween(0.9, 1.4) * fxBoost,
            alphaStart: Phaser.Math.FloatBetween(0.2, 0.34),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom(acidPalette),
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.2, 1.2),
        });
        this.spawnAcidImpactSheen(x, y, {
            intensity: 1.05 * fxBoost,
            radius: Phaser.Math.FloatBetween(0.75, 1.15),
        });
        // Reduced spray — emphasis is on floor burn, not aerial explosion.
        const sprayQty = Math.max(7, Math.round((12 + Phaser.Math.Between(0, 6)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < sprayQty; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(55, 160);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - Phaser.Math.FloatBetween(0, 18),
                gravityY: Phaser.Math.FloatBetween(90, 180),
                life: Phaser.Math.Between(80, 190),
                scaleStart: Phaser.Math.FloatBetween(0.1, 0.24),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.72, 0.92),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(acidPalette),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-6, 6),
            });
        }

        // Lingering luminous drips — settle on the floor, shiny liquid look
        const glowQty = Math.max(5, Math.round((8 + Phaser.Math.Between(0, 5)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < glowQty; i++) {
            this.spawnFxSprite('dot', x + Phaser.Math.Between(-5, 5), y + Phaser.Math.Between(-4, 3), {
                vx: Phaser.Math.FloatBetween(-14, 14),
                vy: Phaser.Math.FloatBetween(-18, 6),
                gravityY: Phaser.Math.FloatBetween(20, 60),
                life: Phaser.Math.Between(260, 480),
                scaleStart: Phaser.Math.FloatBetween(0.16, 0.32),
                scaleEnd: Phaser.Math.FloatBetween(0.03, 0.08),
                alphaStart: Phaser.Math.FloatBetween(0.56, 0.82),
                alphaEnd: 0.05,
                tint: Phaser.Utils.Array.GetRandom([0xe4f448, 0xd0e030, 0xf0fc60]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-3, 3),
            });
        }
        // Wet gloss highlights — near-white specular dots that sell the shiny liquid surface
        const glossQty = Math.max(3, Math.round(5 * this.fxQualityScale * fxBoost));
        for (let i = 0; i < glossQty; i++) {
            const gDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            this.spawnFxSprite('dot', x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-3, 3), {
                vx: Math.cos(gDir) * Phaser.Math.FloatBetween(30, 90),
                vy: Math.sin(gDir) * Phaser.Math.FloatBetween(30, 90) - Phaser.Math.FloatBetween(10, 30),
                gravityY: Phaser.Math.FloatBetween(100, 220),
                life: Phaser.Math.Between(50, 140),
                scaleStart: Phaser.Math.FloatBetween(0.10, 0.22),
                scaleEnd: 0,
                alphaStart: 1.0,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xf8ffb0, 0xeeffcc, 0xf0ffa0]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-10, 10),
            });
            this.spawnFxSprite('bokeh', x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-5, 5), {
                vx: Math.cos(gDir) * Phaser.Math.FloatBetween(10, 34),
                vy: Math.sin(gDir) * Phaser.Math.FloatBetween(8, 22) - Phaser.Math.FloatBetween(6, 20),
                gravityY: Phaser.Math.FloatBetween(40, 120),
                life: Phaser.Math.Between(120, 260),
                scaleStart: Phaser.Math.FloatBetween(0.06, 0.14),
                scaleEnd: Phaser.Math.FloatBetween(0.22, 0.44),
                alphaStart: Phaser.Math.FloatBetween(0.1, 0.22),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(acidBright),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.8, 0.8),
            });
        }

        const steamQty = Math.max(20, Math.round((32 + Phaser.Math.Between(0, 16)) * this.fxQualityScale * fxBoost));
        for (let i = 0; i < steamQty; i++) {
            this.spawnFxSprite('smoke', x + Phaser.Math.Between(-9, 9), y + Phaser.Math.Between(-4, 6), {
                vx: Phaser.Math.FloatBetween(-32, 34),
                vy: Phaser.Math.FloatBetween(-128, -36),
                life: Phaser.Math.Between(580, 1500),
                scaleStart: Phaser.Math.FloatBetween(0.2, 0.38),
                scaleEnd: Phaser.Math.FloatBetween(1.1, 1.9),
                alphaStart: Phaser.Math.FloatBetween(0.22, 0.44),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd8ffe0, 0xbcecc6, 0x9ec9a8, 0xe0ffcc]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-1.1, 1.1),
            });
        }
        // Chemical reaction flash — instant bright ring that expands on impact
        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(90, 160),
            scaleStart: Phaser.Math.FloatBetween(0.1, 0.2),
            scaleEnd: Phaser.Math.FloatBetween(1.0, 1.6),
            alphaStart: Phaser.Math.FloatBetween(0.28, 0.52),
            alphaEnd: 0,
            tint: Phaser.Utils.Array.GetRandom([0x9dff80, 0xc8ff88, 0xaaff66]),
        });
        this.emitAlienSteamPlume(x, y, { intensity: fxBoost * 1.15, directionless: true });
        if (Math.random() < this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(130, 220),
                rangeMin: 28,
                rangeBoost: 78,
            });
        }
        if (Math.random() < 0.44 * this.fxQualityScale) {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(84, 170),
                rangeMin: 20,
                rangeBoost: 52,
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
        // Transient acid splat on floor (fades with other combat decals).
        if (Math.random() < 0.55) {
            this.spawnFloorDecal(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-6, 6), 'acid');
        }
        // Permanent burn scar — always left where acid lands, never fades.
        if (options.spawnBurn !== false && Math.random() < 0.72) {
            this.spawnFloorDecal(x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4), 'acid_burn');
        }
    }

    showAlienDeathBurst(x, y) {
        if (this.sfx) {
            const dist = this.leader ? Phaser.Math.Distance.Between(this.leader.x, this.leader.y, x, y) : 0;
            this.sfx.playAlienDeath(dist);
        }
        const fxMul = Phaser.Math.Clamp(Number(this.runtimeSettings?.walls?.impactFxIntensity) || 1, 0.2, 3);
        this.spawnFxSprite('ring', x, y, {
            life: Phaser.Math.Between(180, 260),
            scaleStart: 0.2 * fxMul,
            scaleEnd: 1.05 * fxMul,
            alphaStart: 0.44,
            alphaEnd: 0,
            tint: 0x9cff8f,
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-0.5, 0.5),
        });
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
        // Acid droplets — linger and float (xenomorph blood, not fire embers)
        const emberCount = Math.max(6, Math.round((10 + Phaser.Math.Between(0, 6)) * this.fxQualityScale * fxMul));
        for (let i = 0; i < emberCount; i++) {
            this.spawnFxSprite('dot', x + Phaser.Math.Between(-12, 12), y + Phaser.Math.Between(-12, 12), {
                vx: Phaser.Math.FloatBetween(-28, 28),
                vy: Phaser.Math.FloatBetween(-60, -14),
                gravityY: Phaser.Math.FloatBetween(40, 120),
                life: Phaser.Math.Between(400, 900),
                scaleStart: Phaser.Math.FloatBetween(0.14, 0.36),
                scaleEnd: 0,
                alphaStart: Phaser.Math.FloatBetween(0.55, 0.88),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xd4e832, 0xe0f040, 0xb8c820, 0xc8d028, 0xf0fc60]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-3, 3),
            });
        }
        // Permanent burn scars scattered across a ~3-tile death radius
        const burnCount = Phaser.Math.Between(3, 6);
        for (let b = 0; b < burnCount; b++) {
            const bAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const bDist  = Phaser.Math.FloatBetween(4, 52);
            this.spawnFloorDecal(
                x + Math.cos(bAngle) * bDist,
                y + Math.sin(bAngle) * bDist * 0.72,
                'acid_burn'
            );
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
        // Persistent acid splatter on the floor.
        this.spawnFloorDecal(x, y, 'acid');
        this.emitAlienSteamPlume(x, y, { intensity: fxMul * 1.1, directionless: true });
        if (Math.random() < 0.5) {
            this.spawnFloorDecal(
                x + Phaser.Math.FloatBetween(-18, 18),
                y + Phaser.Math.FloatBetween(-18, 18),
                'acid'
            );
        }
    }

    spawnAcidBloodEffect(x, y) {
        if (this.fxQualityScale < 0.2) return;
        
        // Spawn floor splatter — increased chance and multiple drops
        const splatterCount = Phaser.Math.Between(1, 2);
        for (let i = 0; i < splatterCount; i++) {
            if (Math.random() < 0.65) {
                this.spawnFloorDecal(x + Phaser.Math.Between(-16, 16), y + Phaser.Math.Between(-16, 16), 'acid');
            }
        }
        
        // Emit steam plume — increased intensity
        this.emitAlienSteamPlume(x, y, { intensity: 1.1 + Math.random() * 0.7, directionless: true });
        
        // Directional acid spurts (micro-bursts of green dots)
        const spurtCount = Math.round(12 * this.fxQualityScale);
        for (let i = 0; i < spurtCount; i++) {
            const dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(40, 160);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(dir) * speed,
                vy: Math.sin(dir) * speed - 15,
                gravityY: 180,
                life: Phaser.Math.Between(300, 600),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.24),
                scaleEnd: 0.05,
                alphaStart: 0.8,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xccff00, 0xeeff22, 0xaaff11, 0x99dd00]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-5, 5),
                drag: 0.92,
            });
        }

        // Add a small green glow flare
        if (this.fxQualityScale >= 0.5) {
            this.spawnFxSprite('flare', x, y, {
                life: 300,
                scaleStart: 0.1,
                scaleEnd: 0.6,
                alphaStart: 0.35,
                alphaEnd: 0,
                tint: 0xccffaa,
                blendMode: Phaser.BlendModes.ADD
            });
        }
    }

    emitAlienSteamPlume(x, y, options = {}) {
        const intensity = Phaser.Math.Clamp(Number(options.intensity) || 1, 0.05, 3);
        const mode = String(options.mode || '');
        const poolMode = mode === 'acid_pool';
        const countBase = poolMode ? 14 : 11;
        const count = Math.max(6, Math.round((countBase + Phaser.Math.Between(0, 8)) * this.fxQualityScale * intensity));
        // Warm yellow near the acid surface → grey-olive as the fume disperses.
        const steamTints = [0xd4e060, 0xc8d028, 0xa8b020, 0xb0b840, 0x808830, 0x686830];
        for (let i = 0; i < count; i++) {
            const swirl = Phaser.Math.FloatBetween(-0.85, 0.85);
            // Keep emission narrow and vertical so it reads like steam wisps, not puffs.
            const spread = h => Phaser.Math.FloatBetween(-h, h);
            this.spawnFxSprite('smoke', x + spread(12), y + spread(9), {
                vx: Phaser.Math.FloatBetween(-9, 9) + swirl * 6,
                vy: Phaser.Math.FloatBetween(-96, -44),
                gravityY: Phaser.Math.FloatBetween(-6, -1),
                life: Phaser.Math.Between(poolMode ? 2200 : 1000, poolMode ? 6400 : 2600),
                scaleStart: Phaser.Math.FloatBetween(poolMode ? 0.1 : 0.08, poolMode ? 0.24 : 0.18),
                scaleEnd: Phaser.Math.FloatBetween(poolMode ? 0.88 : 0.72, poolMode ? 1.76 : 1.24),
                alphaStart: Phaser.Math.FloatBetween(poolMode ? 0.12 : 0.08, poolMode ? 0.24 : 0.16),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom(steamTints),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.3, 0.3),
                drag: 0.22,
            });
        }
        // Chemical shimmer ring — subtle heat-distortion halo at plume base
        if (Math.random() < 0.42 * this.fxQualityScale) {
            this.spawnFxSprite('ring', x, y, {
                life: Phaser.Math.Between(220, 460),
                scaleStart: Phaser.Math.FloatBetween(0.12, 0.22),
                scaleEnd: Phaser.Math.FloatBetween(0.7, 1.1),
                alphaStart: Phaser.Math.FloatBetween(0.1, 0.2),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xa8ffc0, 0xd0ffb0, 0x90ff90]),
            });
        }
    }

    spawnWeldSparkEffect(doorGroup) {
        const center = doorGroup?.getCenter?.();
        if (!center) return;
        const { x, y } = center;
        const now = this.time.now;

        // ── Molten glob drips — heavy incandescent droplets that fall with gravity ──
        const moltenCount = Phaser.Math.Between(3, 6);
        for (let i = 0; i < moltenCount; i++) {
            const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, -Math.PI * 0.2); // mostly downward
            const speed = Phaser.Math.FloatBetween(20, 60);
            this.spawnFxSprite('molten', x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - Phaser.Math.FloatBetween(30, 60),
                gravityY: Phaser.Math.FloatBetween(280, 480),
                life: Phaser.Math.Between(300, 600),
                scaleStart: Phaser.Math.FloatBetween(0.6, 1.2),
                scaleEnd: Phaser.Math.FloatBetween(0.15, 0.35),
                alphaStart: 1,
                alphaEnd: Phaser.Math.FloatBetween(0.1, 0.3),
                tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xfff0c0, 0xffcc55, 0xffa020]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-3, 3),
            });
        }

        // ── Hot spark particles — bright fast-moving points ──
        const sparkCount = Phaser.Math.Between(10, 16);
        for (let i = 0; i < sparkCount; i++) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(60, 180);
            this.spawnFxSprite('dot', x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - Phaser.Math.FloatBetween(20, 50),
                gravityY: Phaser.Math.FloatBetween(180, 360),
                life: Phaser.Math.Between(120, 320),
                scaleStart: Phaser.Math.FloatBetween(0.15, 0.35),
                scaleEnd: 0,
                alphaStart: 1,
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xfff4cc, 0xffdd77, 0xffaa33, 0xff8822]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-12, 12),
            });
        }

        // ── Electrical arc streaks — jagged lightning bolts that fork outward ──
        const arcCount = Phaser.Math.Between(2, 5);
        for (let i = 0; i < arcCount; i++) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(40, 120);
            this.spawnFxSprite('arc', x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - Phaser.Math.FloatBetween(10, 30),
                gravityY: 0,
                life: Phaser.Math.Between(60, 180),
                scaleStart: Phaser.Math.FloatBetween(0.5, 1.2),
                scaleEnd: Phaser.Math.FloatBetween(0.1, 0.3),
                alphaStart: Phaser.Math.FloatBetween(0.8, 1),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xccddff, 0x88bbff, 0xaaccff, 0xffffff]),
                rotation: angle,
                spin: Phaser.Math.FloatBetween(-8, 8),
            });
        }

        // ── Central molten flash — white-hot glow burst at weld point ──
        this.spawnFxSprite('flare', x, y, {
            life: Phaser.Math.Between(80, 160),
            scaleStart: Phaser.Math.FloatBetween(0.3, 0.5),
            scaleEnd: Phaser.Math.FloatBetween(0.8, 1.2),
            alphaStart: 0.9,
            alphaEnd: 0,
            tint: 0xfff8e0,
            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
            spin: Phaser.Math.FloatBetween(-1.5, 1.5),
        });

        // ── Smoke wisps from molten spatter ──
        const smokeCount = Phaser.Math.Between(2, 4);
        for (let i = 0; i < smokeCount; i++) {
            this.spawnFxSprite('smoke', x + Phaser.Math.Between(-4, 4), y + Phaser.Math.Between(-4, 4), {
                vx: Phaser.Math.FloatBetween(-8, 8),
                vy: Phaser.Math.FloatBetween(-25, -8),
                life: Phaser.Math.Between(200, 400),
                scaleStart: Phaser.Math.FloatBetween(0.06, 0.12),
                scaleEnd: Phaser.Math.FloatBetween(0.28, 0.48),
                alphaStart: Phaser.Math.FloatBetween(0.12, 0.22),
                alphaEnd: 0,
                tint: Phaser.Utils.Array.GetRandom([0xfff0cf, 0xd8c8a0, 0xa09070]),
                rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                spin: Phaser.Math.FloatBetween(-0.5, 0.5),
            });
        }

        // Bright spark light at weld point
        this.addSparkLight(x, y, now, {
            duration: 350,
            rangeMin: 36,
            rangeBoost: 64,
            intensityMin: 0.6,
            intensityBoost: 0.5,
            color: 0xffbb55,
        });
        // Secondary delayed flash for sputtering effect
        this.time.delayedCall(120, () => {
            this.addSparkLight(x, y, this.time.now, {
                duration: 220,
                rangeMin: 20,
                rangeBoost: 40,
                intensityMin: 0.4,
                intensityBoost: 0.3,
                color: 0xffdd88,
            });
        });
        // Electrical flash — blue-white pop
        this.time.delayedCall(Phaser.Math.Between(40, 100), () => {
            this.addSparkLight(x, y, this.time.now, {
                duration: Phaser.Math.Between(60, 140),
                rangeMin: 22,
                rangeBoost: 44,
                intensityMin: 0.35,
                intensityBoost: 0.35,
                color: 0x88bbff,
            });
        });
    }

    spawnFloorDecal(x, y, type = 'acid') {
        if (!this.floorDecals) this.floorDecals = [];
        // Permanent acid burns have a separate, larger pool so they persist through combat clutter.
        if (type === 'acid_burn') {
            if (!this.burnDecals) this.burnDecals = [];
            const MAX_BURNS = 96;
            if (this.burnDecals.length >= MAX_BURNS) {
                const oldest = this.burnDecals.shift();
                if (oldest?.active) oldest.destroy();
            }
            const key = `acid_burn_${Phaser.Math.Between(0, 3)}`;
            if (!this.textures.exists(key)) return;
            const decal = this.add.image(
                x + Phaser.Math.FloatBetween(-5, 5),
                y + Phaser.Math.FloatBetween(-5, 5),
                key
            );
            decal.setDepth(1.8); // slightly below active acid (depth 2)
            decal.setAlpha(Phaser.Math.FloatBetween(0.55, 0.85));
            decal.setAngle(Phaser.Math.Between(0, 359));
            decal.setScale(Phaser.Math.FloatBetween(0.9, 1.6));
            this.burnDecals.push(decal);
            return;
        }
        const MAX_DECALS = 64;
        if (this.floorDecals.length >= MAX_DECALS) {
            const oldest = this.floorDecals.shift();
            if (oldest?.active) oldest.destroy();
        }
        let key;
        if (type === 'scorch') {
            key = `scorch_${Phaser.Math.Between(0, 2)}`;
        } else if (type === 'blood') {
            key = `blood_splat_${Phaser.Math.Between(0, 3)}`;
        } else {
            key = `acid_splat_${Phaser.Math.Between(0, 3)}`;
        }
        if (!this.textures.exists(key)) return;
        const decal = this.add.image(
            x + Phaser.Math.FloatBetween(-6, 6),
            y + Phaser.Math.FloatBetween(-6, 6),
            key
        );
        decal.setDepth(2);
        decal.setAlpha(
            type === 'scorch'
                ? Phaser.Math.FloatBetween(0.22, 0.38)
                : (type === 'blood' ? Phaser.Math.FloatBetween(0.26, 0.48) : Phaser.Math.FloatBetween(0.42, 0.58))
        );
        decal.setAngle(Phaser.Math.Between(0, 359));
        decal.setScale(
            type === 'scorch'
                ? Phaser.Math.FloatBetween(0.6, 1.0)
                : (type === 'blood' ? Phaser.Math.FloatBetween(0.7, 1.35) : Phaser.Math.FloatBetween(0.85, 1.55))
        );
        this.floorDecals.push(decal);
    }

    createAcidSubHoles(radius, seed = 0, extraCount = 0) {
        const subHoles = [];
        const count = Phaser.Math.Clamp(2 + Math.floor(radius / 14) + (extraCount | 0), 2, 8);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + ((seed * 0.00031 + i * 0.37) % (Math.PI * 2));
            const d = radius * Phaser.Math.FloatBetween(0.08, 0.46);
            subHoles.push({
                ox: Math.cos(a) * d,
                oy: Math.sin(a) * d * Phaser.Math.FloatBetween(0.76, 1.12),
                rMul: Phaser.Math.FloatBetween(0.24, 0.56),
                jagged: Phaser.Math.FloatBetween(0.34, 0.64),
                points: Phaser.Math.Between(12, 20),
                seed: seed + i * 173,
            });
        }
        return subHoles;
    }

    addAcidSubHole(hazard, worldX, worldY, intensity = 1) {
        if (!hazard) return;
        if (!Array.isArray(hazard.subHoles)) hazard.subHoles = [];
        const dx = (Number(worldX) || hazard.x) - hazard.x;
        const dy = (Number(worldY) || hazard.y) - hazard.y;
        const dist = Math.max(0.0001, Math.hypot(dx, dy));
        const nx = dx / dist;
        const ny = dy / dist;
        const maxOffset = hazard.radius * Phaser.Math.FloatBetween(0.15, 0.62);
        hazard.subHoles.push({
            ox: nx * maxOffset + Phaser.Math.FloatBetween(-4, 4),
            oy: ny * maxOffset + Phaser.Math.FloatBetween(-4, 4),
            rMul: Phaser.Math.Clamp(0.2 + 0.24 * (Number(intensity) || 1), 0.2, 0.62),
            jagged: Phaser.Math.FloatBetween(0.34, 0.7),
            points: Phaser.Math.Between(12, 20),
            seed: Phaser.Math.Between(0, 999999),
        });
        const cap = 14;
        if (hazard.subHoles.length > cap) {
            hazard.subHoles.splice(0, hazard.subHoles.length - cap);
        }
    }

    spawnAcidHazard(x, y, options = {}) {
        if (!this.acidHazards) this.acidHazards = [];
        const maxActive = Math.max(0, Math.floor(Number(this.runtimeSettings?.objects?.acidHazardMaxActive) || 16));
        if (maxActive <= 0) return null;
        if (this.acidHazards.length >= maxActive) {
            const oldest = this.acidHazards.shift();
            if (oldest?.ring) oldest.ring.destroy();
            if (oldest?.core) oldest.core.destroy();
            if (oldest?.soak) oldest.soak.destroy();
            if (oldest?.hole) oldest.hole.destroy();
        }
        // ── Merge nearby acid pools ── if a pool is within ~1.5× radius, absorb it.
        const mergeRadius = (Number(options.radius) || 20) * 1.5;
        for (let mi = this.acidHazards.length - 1; mi >= 0; mi--) {
            const other = this.acidHazards[mi];
            if (!other) continue;
            const dist = Phaser.Math.Distance.Between(x, y, other.x, other.y);
            if (dist < mergeRadius + other.radius * 0.6) {
                // Merge: grow radius, extend duration, destroy old visuals.
                const mergedR = Math.min(48, other.radius + (Number(options.radius) || 20) * 0.55);
                other.radius = mergedR;
                other.expireAt = Math.max(other.expireAt, this.time.now + (Number(options.duration) || 6000) * 0.7);
                // Re-centre between old and new.
                other.x = (other.x + x) * 0.5;
                other.y = (other.y + y) * 0.5;
                if (other.ring) { other.ring.x = other.x; other.ring.y = other.y; other.ring.setRadius(mergedR); }
                if (other.core) { other.core.x = other.x; other.core.y = other.y; }
                if (other.soak) {
                    other._soakPolys = null;
                }
                // Reactive hole growth: each impact adds a fresh jagged pocket.
                other.jaggedSeed = Phaser.Math.Between(0, 99999);
                const mergeIntensity = Number(options.damageScale) || 1;
                this.addAcidSubHole(other, x, y, mergeIntensity);
                this.addAcidSubHole(
                    other,
                    x + Phaser.Math.FloatBetween(-8, 8),
                    y + Phaser.Math.FloatBetween(-8, 8),
                    mergeIntensity * 0.9
                );
                other.visualOnly = other.visualOnly && options.visualOnly === true;
                return; // absorbed — don't create a new hazard.
            }
        }
        const radius = Number(options.radius) || 20;
        const ring = this.add.circle(x, y, radius, 0xd0e028, 0.0);
        ring.setStrokeStyle(2, 0xe8f050, 0.5);
        ring.setDepth(3);
        ring.setScale(0.1);  // Start tiny — grows over time.
        const core = this.add.circle(
            x + Phaser.Math.FloatBetween(-2, 2),
            y + Phaser.Math.FloatBetween(-2, 2),
            Math.max(5, radius * Phaser.Math.FloatBetween(0.34, 0.52)),
            0x1a1c08, 0.0
        );
        core.setDepth(3.1);
        core.setScale(0.1);  // Also starts tiny.
        const soak = this.add.graphics();
        // Behind active acid layers so it reads as floor soaking.
        soak.setDepth(1.6);
        soak.setAlpha(0);
        const now = this.time.now;
        const duration = Math.max(400, Number(options.duration) || 6000);
        // growDuration: time to reach full size (2.5 seconds = slow growth).
        const growDuration = Math.min(duration * 0.4, 2500);
        this.acidHazards.push({
            x, y,
            radius: Math.max(8, radius),
            bornAt: now,
            damageUntil: now + 5000,
            growUntil: now + growDuration,
            expireAt: now + duration,
            steamLingerUntil: now + duration * 3,
            steamLingerStartAt: now + duration,
            dissolvedAt: 0,
            nextTickAt: now + 240,
            nextSteamAt: now + Phaser.Math.Between(300, 700),
            nextSizzleAt: now + Phaser.Math.Between(150, 400),
            damageScale: Phaser.Math.Clamp(Number(options.damageScale) || 1, 0.2, 2),
            visualOnly: options.visualOnly === true,
            ring, core, soak,
            hole: null,
            _soakPolys: null,
            _phaseOffset: Math.random() * Math.PI * 2,
            jaggedSeed: Phaser.Math.Between(0, 99999),
            subHoles: this.createAcidSubHoles(Math.max(8, radius), Phaser.Math.Between(0, 999999)),
        });
    }

    updateAcidHazards(time, _delta, marines) {
        if (!this.acidHazards || this.acidHazards.length === 0) return;
        const dps = Math.max(0, Number(this.runtimeSettings?.objects?.acidDamagePerSec) || 10);
        for (let i = this.acidHazards.length - 1; i >= 0; i--) {
            const h = this.acidHazards[i];
            if (!h) {
                this.acidHazards.splice(i, 1);
                continue;
            }
            if (time >= h.expireAt) {
                // After pool dissipation, keep steam lingering (wisping out) so total plume life is ~3x.
                if ((Number(h.steamLingerUntil) || 0) > time) {
                    if (!h.dissolvedAt) {
                        h.dissolvedAt = time;
                        this.spawnFloorDecal(h.x, h.y, 'acid_burn');
                        if (this.burnDecals && this.burnDecals.length > 0) {
                            const lastBurn = this.burnDecals[this.burnDecals.length - 1];
                            if (lastBurn) {
                                lastBurn._fizzleUntil = time + Phaser.Math.Between(8000, 12000);
                                lastBurn._nextFizzleAt = time + Phaser.Math.Between(200, 600);
                            }
                        }
                        if (h?.ring) h.ring.destroy();
                        if (h?.core) h.core.destroy();
                        h.ring = null;
                        h.core = null;
                        h.nextTickAt = Infinity;
                    }
                    if (time >= (h.nextSteamAt || 0)) {
                        const lingerT = Phaser.Math.Clamp(
                            (time - (Number(h.steamLingerStartAt) || h.expireAt))
                            / Math.max(1, (Number(h.steamLingerUntil) || time + 1) - (Number(h.steamLingerStartAt) || h.expireAt)),
                            0,
                            1
                        );
                        const wispIntensity = Phaser.Math.Linear(0.65, 0.08, lingerT);
                        if (wispIntensity > 0.05) {
                            const sr = Math.max(2, Math.floor(h.radius * 0.55));
                            this.emitAlienSteamPlume(
                                h.x + Phaser.Math.Between(-sr, sr),
                                h.y + Phaser.Math.Between(-Math.floor(sr * 0.65), Math.floor(sr * 0.65)),
                                { intensity: wispIntensity, mode: 'acid_pool' }
                            );
                        }
                        h.nextSteamAt = time + Phaser.Math.Between(
                            Math.round(Phaser.Math.Linear(520, 1200, lingerT)),
                            Math.round(Phaser.Math.Linear(1100, 2200, lingerT))
                        );
                    }
                    if (h.soak) {
                        const lingerT = Phaser.Math.Clamp(
                            (time - (Number(h.steamLingerStartAt) || h.expireAt))
                            / Math.max(1, (Number(h.steamLingerUntil) || time + 1) - (Number(h.steamLingerStartAt) || h.expireAt)),
                            0,
                            1
                        );
                        h.soak.setAlpha(Phaser.Math.Linear(0.24, 0.04, lingerT));
                    }
                    continue;
                }
                this.time.delayedCall(80, () => {
                    if (this.scene?.isActive?.()) {
                        this.emitAlienSteamPlume(h.x, h.y, { intensity: 0.16, mode: 'acid_pool' });
                    }
                });
                if (h?.ring) h.ring.destroy();
                if (h?.core) h.core.destroy();
                if (h?.soak) h.soak.destroy();
                // h.hole intentionally kept — permanent floor feature
                this.acidHazards.splice(i, 1);
                continue;
            }
            const lifeT = Phaser.Math.Clamp((time - h.bornAt) / Math.max(1, (h.expireAt - h.bornAt)), 0, 1);

            // ── Slow growth phase ── ring/core grow from tiny to full over growDuration.
            const growT = h.growUntil
                ? Phaser.Math.Clamp((time - h.bornAt) / Math.max(1, h.growUntil - h.bornAt), 0, 1)
                : 1;
            // Ease-out curve for satisfying organic growth.
            const growScale = 1 - Math.pow(1 - growT, 2.5);

            // ── Phase determination ──
            // Phase 1 (0-0.33): Active acid — bright, heavy steam, full damage
            // Phase 2 (0.33-0.67): Melting — hole grows, reduced damage
            // Phase 3 (0.67-1.0): Hole formed — no damage, speed reduction
            const phase = lifeT < 0.33 ? 1 : (lifeT < 0.67 ? 2 : 3);

            // ── Ring visual progression (includes growth scale) ──
            if (h.ring) {
                const ringAlpha = phase === 1
                    ? Phaser.Math.Linear(0.28, 0.18, lifeT / 0.33)
                    : (phase === 2
                        ? Phaser.Math.Linear(0.18, 0.06, (lifeT - 0.33) / 0.34)
                        : Phaser.Math.Linear(0.06, 0.01, (lifeT - 0.67) / 0.33));
                h.ring.setAlpha(ringAlpha * growScale);
                const phOff = h._phaseOffset || 0;
                const pulse = 1.0 + 0.05 * Math.sin(time * 0.0025 + phOff);
                h.ring.setScale(Phaser.Math.Linear(1.0, 0.72, lifeT) * growScale * pulse);
                h.ring.rotation = 0.03 * Math.sin(time * 0.0018 + phOff * 0.7);
                const ringTint = Phaser.Display.Color.Interpolate.ColorWithColor(
                    Phaser.Display.Color.ValueToColor(0xe8f050),
                    Phaser.Display.Color.ValueToColor(0x6a7008),
                    100, Math.round(lifeT * 100)
                );
                h.ring.setFillStyle(
                    Phaser.Display.Color.GetColor(ringTint.r, ringTint.g, ringTint.b),
                    ringAlpha * growScale
                );
            }

            // ── Core progression (includes growth scale) ──
            if (h.core) {
                h.core.setAlpha(Phaser.Math.Linear(0.38, 0.08, lifeT) * growScale);
                h.core.setScale(Phaser.Math.Linear(0.88, 1.3, lifeT) * growScale);
                h.core.x = h.x + Math.sin(time * 0.003 + i * 1.7) * 2.4;
                h.core.y = h.y + Math.cos(time * 0.0026 + i * 1.4) * 2.2;
            }
            // ── Melting hole (phases 2-3) ──
            if (phase >= 2) {
                const holeT = Phaser.Math.Clamp((lifeT - 0.33) / 0.67, 0, 1);
                const holeRadius = h.radius * 0.425 * (1 - Math.pow(1 - holeT, 1.85));
                if (!h.hole) {
                    h.hole = this.add.graphics();
                    h.hole.setDepth(2.5);
                    h._lastHoleRedraw = 0;
                }
                // Throttle hole redraws — skip if drawn recently (perf)
                const holeRedrawInterval = this.fxQualityScale < 0.6 ? 120 : 42;
                if (time - (h._lastHoleRedraw || 0) >= holeRedrawInterval) {
                    h._lastHoleRedraw = time;
                    h.hole.clear();
                    const baseSeed = h.jaggedSeed || 0;
                    const holes = Array.isArray(h.subHoles) && h.subHoles.length > 0
                        ? h.subHoles
                        : this.createAcidSubHoles(Math.max(10, h.radius), baseSeed);
                    const floorBlendAlpha = Phaser.Math.Linear(0.24, 0.1, holeT);
                    const rimYellow = 0xe7ef62;
                    const rimGreen = 0x9fcb3b;
                    const rimLayerAlpha = 0.25; // 50% total blend split across two color passes.
                    const bodyAlpha = Phaser.Math.Linear(0.52, 0.9, holeT);
                    const innerAlpha = Phaser.Math.Linear(0.64, 0.96, holeT);
                    const subCenters = [];
                    const soakPolys = [];

                    for (let hi = 0; hi < holes.length; hi++) {
                        const sub = holes[hi];
                        const subCx = h.x + (Number(sub.ox) || 0);
                        const subCy = h.y + (Number(sub.oy) || 0);
                        const points = Phaser.Math.Clamp(Math.round(Number(sub.points) || 14), 10, 24);
                        const jagged = Phaser.Math.Clamp(Number(sub.jagged) || 0.48, 0.22, 0.78);
                        const seed = (Number(sub.seed) || baseSeed) + hi * 61;
                        const subR = Math.max(2, holeRadius * Phaser.Math.Clamp(Number(sub.rMul) || 0.34, 0.16, 0.68));
                        const verts = [];
                        subCenters.push({ x: subCx, y: subCy, r: subR });
                        for (let j = 0; j < points; j++) {
                            const a = (j / points) * Math.PI * 2;
                            const n1 = Math.sin(seed * 0.0017 + j * 2.17);
                            const n2 = Math.cos(seed * 0.0023 + j * 1.53) * 0.72;
                            const n3 = Math.sin(seed * 0.0047 + j * 5.23) * 0.36;
                            const noise = (n1 + n2 + n3) / 2.08;
                            const jr = subR * (1 + noise * jagged);
                            const ySkew = 0.94 + Math.sin(seed * 0.0009 + j * 0.73) * 0.08;
                            verts.push({
                                x: subCx + Math.cos(a) * jr,
                                y: subCy + Math.sin(a) * jr * ySkew,
                            });
                        }
                        if (verts.length < 3) continue;
                        soakPolys.push(verts.map((p) => ({
                            x: subCx + (p.x - subCx) * 1.2,
                            y: subCy + (p.y - subCy) * 1.2,
                        })));

                        // Blend ring where acid meets panel.
                        h.hole.fillStyle(0x95aa1e, floorBlendAlpha * 0.52);
                        h.hole.beginPath();
                        h.hole.moveTo(
                            subCx + (verts[0].x - subCx) * 1.26,
                            subCy + (verts[0].y - subCy) * 1.26
                        );
                        for (let j = 1; j < verts.length; j++) {
                            h.hole.lineTo(
                                subCx + (verts[j].x - subCx) * 1.26,
                                subCy + (verts[j].y - subCy) * 1.26
                            );
                        }
                        h.hole.closePath();
                        h.hole.fillPath();

                        // 50% translucent green/yellow stroke on jagged rim.
                        h.hole.lineStyle(2, rimYellow, rimLayerAlpha);
                        h.hole.beginPath();
                        h.hole.moveTo(verts[0].x, verts[0].y);
                        for (let j = 1; j < verts.length; j++) h.hole.lineTo(verts[j].x, verts[j].y);
                        h.hole.closePath();
                        h.hole.strokePath();
                        h.hole.lineStyle(1, rimGreen, rimLayerAlpha);
                        h.hole.strokePath();

                        // Melted cavity body.
                        h.hole.fillStyle(0x090909, bodyAlpha);
                        h.hole.fillPath();

                        // Hot inner contour.
                        const innerScale = Phaser.Math.FloatBetween(0.55, 0.74);
                        h.hole.fillStyle(0x030303, innerAlpha);
                        h.hole.beginPath();
                        h.hole.moveTo(
                            subCx + (verts[0].x - subCx) * innerScale,
                            subCy + (verts[0].y - subCy) * innerScale
                        );
                        for (let j = 1; j < verts.length; j++) {
                            h.hole.lineTo(
                                subCx + (verts[j].x - subCx) * innerScale,
                                subCy + (verts[j].y - subCy) * innerScale
                            );
                        }
                        h.hole.closePath();
                        h.hole.fillPath();
                    }

                    // Connect nearest pockets so merged pools read as segmented/jagged fused lanes.
                    if (subCenters.length >= 2) {
                        for (let a = 0; a < subCenters.length - 1; a++) {
                            const ca = subCenters[a];
                            let nearest = null;
                            let nearestDist = Infinity;
                            for (let b = a + 1; b < subCenters.length; b++) {
                                const cb = subCenters[b];
                                const d = Math.hypot(cb.x - ca.x, cb.y - ca.y);
                                if (d < nearestDist) {
                                    nearestDist = d;
                                    nearest = cb;
                                }
                            }
                            if (!nearest) continue;
                            const maxBridgeDist = (ca.r + nearest.r) * 2.25;
                            if (nearestDist > maxBridgeDist) continue;
                            const ang = Math.atan2(nearest.y - ca.y, nearest.x - ca.x);
                            const nx = Math.cos(ang + Math.PI * 0.5);
                            const ny = Math.sin(ang + Math.PI * 0.5);
                            const w = Math.max(1.2, Math.min(ca.r, nearest.r) * 0.38);

                            h.hole.fillStyle(0x95aa1e, floorBlendAlpha * 0.36);
                            h.hole.beginPath();
                            h.hole.moveTo(ca.x + nx * w, ca.y + ny * w);
                            h.hole.lineTo(ca.x - nx * w, ca.y - ny * w);
                            h.hole.lineTo(nearest.x - nx * w, nearest.y - ny * w);
                            h.hole.lineTo(nearest.x + nx * w, nearest.y + ny * w);
                            h.hole.closePath();
                            h.hole.fillPath();

                            h.hole.fillStyle(0x090909, bodyAlpha * 0.92);
                            h.hole.fillPath();
                        }
                    }
                    h._soakPolys = soakPolys;
                }
            }
            if (h.soak) {
                const soakGrow = Phaser.Math.Clamp(lifeT / 0.75, 0, 1);
                const soakAlphaBase = Phaser.Math.Linear(0.06, 0.5, soakGrow);
                const soakFade = phase === 3
                    ? Phaser.Math.Linear(1, 0.68, Phaser.Math.Clamp((lifeT - 0.67) / 0.33, 0, 1))
                    : 1;
                const soakAlpha = Phaser.Math.Clamp(soakAlphaBase * soakFade * growScale, 0, 0.5);
                h.soak.clear();
                h.soak.fillStyle(0x1a3518, soakAlpha);
                const soakPolys = Array.isArray(h._soakPolys) ? h._soakPolys : null;
                if (soakPolys && soakPolys.length > 0) {
                    for (let si = 0; si < soakPolys.length; si++) {
                        const poly = soakPolys[si];
                        if (!poly || poly.length < 3) continue;
                        h.soak.beginPath();
                        h.soak.moveTo(poly[0].x, poly[0].y);
                        for (let pj = 1; pj < poly.length; pj++) h.soak.lineTo(poly[pj].x, poly[pj].y);
                        h.soak.closePath();
                        h.soak.fillPath();
                    }
                } else {
                    const fallbackR = Math.max(10, h.radius * Phaser.Math.Linear(0.5, 1.35, soakGrow) * growScale);
                    h.soak.fillEllipse(h.x, h.y, fallbackR * 2.2, fallbackR * 1.75);
                }
            }

            // ── Bubbling (reduced in later phases) ──
            const bubbleChance = phase === 1 ? 0.62 : (phase === 2 ? 0.30 : 0.08);
            if (Math.random() < (bubbleChance + this.fxQualityScale * 0.15)) {
                const bubbleA = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const bubbleR = Phaser.Math.FloatBetween(1, Math.max(2, h.radius - 2));
                const bx = h.x + Math.cos(bubbleA) * bubbleR;
                const by = h.y + Math.sin(bubbleA) * bubbleR;
                this.spawnFxSprite('dot', bx, by, {
                    vx: Phaser.Math.FloatBetween(-10, 10),
                    vy: Phaser.Math.FloatBetween(-36, -12),
                    life: Phaser.Math.Between(160, 340),
                    scaleStart: Phaser.Math.FloatBetween(0.1, 0.22),
                    scaleEnd: Phaser.Math.FloatBetween(0.22, 0.4),
                    alphaStart: Phaser.Math.FloatBetween(0.45, 0.78),
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xd4e832, 0xe0f040, 0xc8d020, 0xecf458]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-2, 2),
                });
                if (Math.random() < 0.32) {
                    this.spawnFxSprite('ring', bx, by, {
                        life: Phaser.Math.Between(100, 200),
                        scaleStart: Phaser.Math.FloatBetween(0.08, 0.16),
                        scaleEnd: Phaser.Math.FloatBetween(0.42, 0.68),
                        alphaStart: Phaser.Math.FloatBetween(0.22, 0.38),
                        alphaEnd: 0,
                        tint: Phaser.Utils.Array.GetRandom([0xe4f448, 0xf0fc60, 0xd0e030]),
                    });
                }
                if (Math.random() < 0.34) {
                    this.spawnFxSprite('smoke', bx, by, {
                        vx: Phaser.Math.FloatBetween(-10, 10),
                        vy: Phaser.Math.FloatBetween(-38, -14),
                        life: Phaser.Math.Between(500, 1100),
                        scaleStart: Phaser.Math.FloatBetween(0.1, 0.2),
                        scaleEnd: Phaser.Math.FloatBetween(0.4, 0.72),
                        alphaStart: Phaser.Math.FloatBetween(0.12, 0.22),
                        alphaEnd: 0,
                        tint: Phaser.Utils.Array.GetRandom([0xd4e060, 0xa8b840, 0xc0cc40, 0x8a9830]),
                    });
                }
            }

            // ── Steam (intensity drops per phase) ──
            if (time >= (h.nextSteamAt || 0)) {
                const steamIntensity = phase === 1 ? 0.78 + (1 - lifeT) * 0.75
                    : (phase === 2 ? 0.46 : 0.24);
                if (steamIntensity > 0.05) {
                    const sr = Math.max(2, Math.floor(h.radius * 0.55));
                    this.emitAlienSteamPlume(
                        h.x + Phaser.Math.Between(-sr, sr),
                        h.y + Phaser.Math.Between(-Math.floor(sr * 0.65), Math.floor(sr * 0.65)),
                        { intensity: steamIntensity, mode: 'acid_pool' }
                    );
                }
                h.nextSteamAt = time + Phaser.Math.Between(
                    phase === 1 ? 380 : (phase === 2 ? 620 : 900),
                    phase === 1 ? 780 : (phase === 2 ? 1380 : 1800)
                );
            }

            // ── Sizzle (phases 1-2 only) ──
            if (phase <= 2 && time >= (h.nextSizzleAt || 0)) {
                const sc = Phaser.Math.Between(phase === 1 ? 3 : 1, phase === 1 ? 7 : 4);
                for (let si = 0; si < sc; si++) {
                    const sA = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    const sR = Phaser.Math.FloatBetween(0, Math.max(1, h.radius * 0.6));
                    this.spawnFxSprite('dot',
                        h.x + Math.cos(sA) * sR,
                        h.y + Math.sin(sA) * sR,
                        {
                            vx: Math.cos(sA) * Phaser.Math.FloatBetween(14, 44),
                            vy: Math.sin(sA) * Phaser.Math.FloatBetween(8, 28) - Phaser.Math.FloatBetween(14, 34),
                            gravityY: Phaser.Math.FloatBetween(70, 150),
                            life: Phaser.Math.Between(70, 160),
                            scaleStart: Phaser.Math.FloatBetween(0.06, 0.14),
                            scaleEnd: 0,
                            alphaStart: Phaser.Math.FloatBetween(0.72, 0.98),
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xddff55, 0xaaff44, 0x88ff44, 0xc8ff66]),
                        }
                    );
                }
                h.nextSizzleAt = time + Phaser.Math.Between(240, 620);
            }

            // ── Marine damage + speed reduction ──
            if (time < h.nextTickAt) continue;
            const list = Array.isArray(marines) && marines.length > 0 ? marines : [this.leader];
            for (const marine of list) {
                if (!marine || marine.active === false || marine.alive === false) continue;
                const dist = Phaser.Math.Distance.Between(h.x, h.y, marine.x, marine.y);
                if (dist > h.radius) continue;
                if (h.visualOnly === true) continue;

                const damageActive = time <= (Number(h.damageUntil) || 0);
                // After damage window, only speed reduction remains.
                if (!damageActive) {
                    marine.acidSlowUntil = time + 300;
                    continue;
                }

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
                // Active acid also slows
                marine.acidSlowUntil = time + 300;
            }
            h.nextTickAt = time + Phaser.Math.Between(220, 320);
        }

        // ── Burn scar speed reduction + residual fizzle steam ──
        if (this.burnDecals && this.burnDecals.length > 0) {
            const allMarines = Array.isArray(marines) && marines.length > 0 ? marines : [this.leader];
            for (const marine of allMarines) {
                if (!marine || marine.active === false || marine.alive === false) continue;
                for (const scar of this.burnDecals) {
                    if (!scar || !scar.active) continue;
                    const dist = Phaser.Math.Distance.Between(scar.x, scar.y, marine.x, marine.y);
                    if (dist < 20) {
                        marine.acidSlowUntil = time + 300;
                        break;
                    }
                }
            }
            // Residual fizzle steam from fresh burn scars (~10 seconds).
            for (const scar of this.burnDecals) {
                if (!scar || !scar.active || !scar._fizzleUntil) continue;
                if (time >= scar._fizzleUntil) { scar._fizzleUntil = 0; continue; }
                if (time < (scar._nextFizzleAt || 0)) continue;
                // Gentle fizzle — just 1-3 small wisps per tick.
                const fizzleT = Phaser.Math.Clamp((scar._fizzleUntil - time) / 10000, 0, 1);
                const wisps = Phaser.Math.Between(1, 2 + (fizzleT > 0.5 ? 1 : 0));
                for (let w = 0; w < wisps; w++) {
                    this.spawnFxSprite('smoke',
                        scar.x + Phaser.Math.FloatBetween(-8, 8),
                        scar.y + Phaser.Math.FloatBetween(-6, 6),
                        {
                            vx: Phaser.Math.FloatBetween(-6, 6),
                            vy: Phaser.Math.FloatBetween(-66, -26),
                            gravityY: Phaser.Math.FloatBetween(-5, -1),
                            life: Phaser.Math.Between(900, 1800),
                            scaleStart: Phaser.Math.FloatBetween(0.05, 0.12),
                            scaleEnd: Phaser.Math.FloatBetween(0.2, 0.46),
                            alphaStart: Phaser.Math.FloatBetween(0.08, 0.18) * fizzleT,
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xb0b840, 0x909828, 0xa0a830, 0x808820]),
                            rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                            spin: Phaser.Math.FloatBetween(-0.26, 0.26),
                            drag: 0.24,
                        }
                    );
                }
                // Occasional tiny sizzle spark.
                if (Math.random() < 0.25 * fizzleT) {
                    this.spawnFxSprite('dot',
                        scar.x + Phaser.Math.FloatBetween(-6, 6),
                        scar.y + Phaser.Math.FloatBetween(-4, 4),
                        {
                            vx: Phaser.Math.FloatBetween(-12, 12),
                            vy: Phaser.Math.FloatBetween(-30, -8),
                            gravityY: Phaser.Math.FloatBetween(50, 100),
                            life: Phaser.Math.Between(60, 140),
                            scaleStart: Phaser.Math.FloatBetween(0.04, 0.1),
                            scaleEnd: 0,
                            alphaStart: Phaser.Math.FloatBetween(0.5, 0.8),
                            alphaEnd: 0,
                            tint: Phaser.Utils.Array.GetRandom([0xddff55, 0xaaff44, 0xc8ff66]),
                        }
                    );
                }
                scar._nextFizzleAt = time + Phaser.Math.Between(
                    Math.round(Phaser.Math.Linear(600, 1200, 1 - fizzleT)),
                    Math.round(Phaser.Math.Linear(1200, 2200, 1 - fizzleT))
                );
            }
        }
    }

    /**
     * Specular shimmer on acid pools lit by torch beam.
     * Spawns brief bright glints when the leader's torch cone falls on acid.
     */
    updateAcidSpecular(time) {
        if (!this.acidHazards || this.acidHazards.length === 0) return;
        if (this.fxQualityScale < 0.2) return;
        if (!this.leader || !this.leader.active) return;
        // Throttle — check every ~80ms
        if (time < (this._nextAcidSpecularAt || 0)) return;
        this._nextAcidSpecularAt = time + 80;

        const lx = this.leader.x;
        const ly = this.leader.y;
        const facing = this.leader.facingAngle ?? this.leader.rotation ?? 0;
        const lighting = this.runtimeSettings?.lighting || {};
        const halfAngle = (lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE) || 0.5;
        const torchRange = (lighting.torchRange ?? CONFIG.TORCH_RANGE) || 300;
        const rangeSq = torchRange * torchRange;

        for (let i = 0; i < this.acidHazards.length; i++) {
            const h = this.acidHazards[i];
            if (!h || !h.ring) continue;
            const dx = h.x - lx;
            const dy = h.y - ly;
            const distSq = dx * dx + dy * dy;
            if (distSq > rangeSq || distSq < 1) continue;

            // Check if acid is within the torch cone
            const angleToAcid = Math.atan2(dy, dx);
            let diff = angleToAcid - facing;
            // Normalize to [-PI, PI]
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > halfAngle * 1.2) continue;

            // Intensity based on distance and cone alignment
            const dist = Math.sqrt(distSq);
            const distFade = 1 - dist / torchRange;
            const coneFade = 1 - Math.abs(diff) / (halfAngle * 1.2);
            const intensity = distFade * coneFade;
            if (intensity < 0.1) continue;

            // Spawn 1-3 specular glint dots on the acid surface
            const glintCount = Math.max(1, Math.round(intensity * 3 * this.fxQualityScale));
            for (let g = 0; g < glintCount; g++) {
                const r = h.radius * Phaser.Math.FloatBetween(0.1, 0.85);
                const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
                const gx = h.x + Math.cos(a) * r;
                const gy = h.y + Math.sin(a) * r;

                // Shimmer — tiny bright flash that drifts slightly
                this.spawnFxSprite('dot', gx, gy, {
                    vx: Phaser.Math.FloatBetween(-8, 8),
                    vy: Phaser.Math.FloatBetween(-12, -4),
                    life: Phaser.Math.Between(60, 160),
                    scaleStart: Phaser.Math.FloatBetween(0.06, 0.16) * intensity,
                    scaleEnd: 0,
                    alphaStart: Phaser.Math.FloatBetween(0.5, 1.0) * intensity,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([
                        0xffffff, 0xeeffcc, 0xddffaa,  // white specular
                        0xe8ff60, 0xd0f040, 0xbbee33,  // acid-green specular
                    ]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-2, 2),
                });
            }

            // Occasional larger wet-gloss flare for glassy effect
            if (Math.random() < 0.3 * intensity * this.fxQualityScale) {
                this.spawnFxSprite('flare', h.x + Phaser.Math.FloatBetween(-h.radius * 0.4, h.radius * 0.4),
                    h.y + Phaser.Math.FloatBetween(-h.radius * 0.4, h.radius * 0.4), {
                    life: Phaser.Math.Between(80, 180),
                    scaleStart: Phaser.Math.FloatBetween(0.08, 0.2) * intensity,
                    scaleEnd: Phaser.Math.FloatBetween(0.2, 0.4) * intensity,
                    alphaStart: Phaser.Math.FloatBetween(0.3, 0.6) * intensity,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xffffff, 0xe8ffc0, 0xd4f090]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.5, 0.5),
                });
            }
            if (Math.random() < 0.22 * intensity * this.fxQualityScale) {
                this.spawnFxSprite('ring', h.x + Phaser.Math.FloatBetween(-h.radius * 0.25, h.radius * 0.25),
                    h.y + Phaser.Math.FloatBetween(-h.radius * 0.22, h.radius * 0.22), {
                    life: Phaser.Math.Between(120, 220),
                    scaleStart: Phaser.Math.FloatBetween(0.06, 0.12) * intensity,
                    scaleEnd: Phaser.Math.FloatBetween(0.26, 0.52) * intensity,
                    alphaStart: Phaser.Math.FloatBetween(0.12, 0.24) * intensity,
                    alphaEnd: 0,
                    tint: Phaser.Utils.Array.GetRandom([0xe7ff72, 0xcde850, 0xefffb0]),
                    rotation: Phaser.Math.FloatBetween(0, Math.PI * 2),
                    spin: Phaser.Math.FloatBetween(-0.6, 0.6),
                });
            }
        }
    }

    getFollowerCombatProfile(roleKey) {
        const marine = this.runtimeSettings?.marines || {};
        if (roleKey === 'heavy') {
            return {
                roleLabel: 'smartgun',
                reactionMs: Number(marine.heavyReactionMs) || 120,
                baseSpread: 0.02 / (Number(marine.heavyAccuracyMul) || 1.1),
                fireRateMul: 0.86,
                damageMul: 1.25,
                boostedHitChance: 0.5,
                boostedFireChance: 0.5,
                boostedFireMinMul: 1.1,
                boostedFireMaxMul: 1.5,
                heatPerShot: 10,
                coolRate: 26,
                jamSensitivity: Number(marine.heavyJamSensitivity) || 0.7,
                burstMin: 6,
                burstMax: 10,
                burstPauseMinMs: 90,
                burstPauseMaxMs: 220,
                suppressChance: 0.74,
            };
        }
        // Standard marines: use per-role reaction times from runtime settings.
        const defaultReaction = 150;
        const reactionMs = roleKey === 'tech'
            ? (Number(marine.techReactionMs) || defaultReaction)
            : roleKey === 'medic'
            ? (Number(marine.medicReactionMs) || defaultReaction)
            : defaultReaction;
        return {
            roleLabel: 'standard',
            reactionMs,
            baseSpread: 0.045,
            fireRateMul: 1.0,
            damageMul: 1.0,
            boostedHitChance: 0,
            boostedFireChance: 0,
            boostedFireMinMul: 1.0,
            boostedFireMaxMul: 1.0,
            heatPerShot: 9,
            coolRate: 25,
            jamSensitivity: 0.95,
            burstMin: 4,
            burstMax: 7,
            burstPauseMinMs: 130,
            burstPauseMaxMs: 320,
            suppressChance: 0.58,
        };
    }

    getFollowerCombatState(roleKey) {
        return this.followerCombatSystem.getFollowerCombatState(roleKey);
    }

    updateFollowerCombat(time, delta, marines) {
        this.followerCombatSystem.update(time, delta, marines);
    }

    /**
     * Follower reaction: when a teammate is hit, nearby idle followers target
     * the attacking alien with a ~1s delay. Integrates with FollowerCombatSystem
     * by injecting targetRef into the follower combat state.
     * Allocation: 2 helpers → attack role, remainder → guard (face threat, hold).
     */
    _updateFollowerReaction(time, marines) {
        if (!marines || !this.enemyManager || !this.followerCombatSystem) return;

        // Find any marine recently damaged (within 1500ms).
        let recentlyHitMarine = null;
        let mostRecentHitAt = -Infinity;
        for (const marine of marines) {
            if (!marine || !marine.active || marine.alive === false) continue;
            if (!Number.isFinite(marine.lastDamagedAt)) continue;
            if (marine.lastDamagedAt > mostRecentHitAt && (time - marine.lastDamagedAt) <= 1500) {
                mostRecentHitAt = marine.lastDamagedAt;
                recentlyHitMarine = marine;
            }
        }

        if (!recentlyHitMarine) {
            // No recent hit — clear stale reaction state on all followers.
            if (this.squadSystem) {
                for (const followerData of this.squadSystem.followers) {
                    const sprite = followerData?.sprite;
                    if (sprite) {
                        sprite._reactionTarget = null;
                        sprite._reactionDelay = 0;
                    }
                }
            }
            return;
        }

        // Find the alien that most likely attacked this marine (closest active
        // alien to the hit marine — a simple but effective heuristic).
        const allEnemies = this.enemyManager.getAliveEnemies() || [];
        let attackerAlien = null;
        let attackerDist = Infinity;
        for (const enemy of allEnemies) {
            if (!enemy || !enemy.active) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, recentlyHitMarine.x, recentlyHitMarine.y);
            if (d < attackerDist) {
                attackerDist = d;
                attackerAlien = enemy;
            }
        }

        if (!attackerAlien) return;

        // Collect followers that are not the hit marine, not recently hit
        // themselves, and alive.
        const candidates = [];
        if (this.squadSystem) {
            for (const followerData of this.squadSystem.followers) {
                const sprite = followerData?.sprite;
                if (!sprite || sprite.alive === false || !sprite.active) continue;
                if (sprite === recentlyHitMarine) continue;
                // Skip if recently hit themselves.
                if (Number.isFinite(sprite.lastDamagedAt) && (time - sprite.lastDamagedAt) <= 1500) continue;
                // Skip if currently firing (nextFireAt check via combat state).
                const state = this.followerCombatSystem.followerCombatState.get(sprite.roleKey);
                const isFiring = state && state.targetRef && state.targetRef.active
                    && (time < (state.nextFireAt || 0) + 400);
                if (isFiring) continue;
                candidates.push({ sprite, dist: Phaser.Math.Distance.Between(sprite.x, sprite.y, recentlyHitMarine.x, recentlyHitMarine.y) });
            }
        }

        // Sort by proximity to hit marine.
        candidates.sort((a, b) => a.dist - b.dist);

        for (let i = 0; i < candidates.length; i++) {
            const { sprite } = candidates[i];
            // Set reaction state if not already set for this attacker.
            if (sprite._reactionTarget !== attackerAlien) {
                sprite._reactionTarget = attackerAlien;
                sprite._reactionDelay = time + 1000;
            }

            // If delay has elapsed and target is still active, inject into combat state.
            if (time >= sprite._reactionDelay && attackerAlien.active) {
                const state = this.followerCombatSystem.followerCombatState.get(sprite.roleKey);
                if (state) {
                    if (i < 2) {
                        // Attack role: override targetRef so FollowerCombatSystem aims at attacker.
                        state.targetRef = attackerAlien;
                        state.lastKnownX = attackerAlien.x;
                        state.lastKnownY = attackerAlien.y;
                        state.lastKnownAt = time;
                    } else {
                        // Guard role: face the threat direction but don't override target.
                        const guardAngle = Phaser.Math.Angle.Between(sprite.x, sprite.y, attackerAlien.x, attackerAlien.y);
                        sprite.setDesiredRotation(guardAngle);
                    }
                }
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
        if (!marine || !this.trackerOperator || !this.isTrackerOperatorLocked(time)) return false;
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
        const operatorLocked = this.isTrackerOperatorLocked(time);
        if (opRole && this.squadSystem) this.squadSystem.setExternalHoldRole(opRole, operatorLocked);
        if (this.isTrackerLeaderBusy(time)) {
            this.inputHandler.isFiring = false;
            this.contextMenu.hide();
            this.movementSystem.clearPath(this.leader);
            this.leader.body.setVelocity(0, 0);
        }
    }

    wasTrackerOperatorAttacked() {
        const now = this.time.now;
        const op = this.trackerOperator;
        if (!op || !op.actor || !this.isTrackerOperatorLocked(now)) return false;
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

    isTrackerOperatorLocked(time = this.time.now) {
        // Marine is only locked during the 5s activation channel, not the full scan
        return !!this.trackerOperator && time < this.trackerChannelUntil;
    }

    getCombatPressure() {
        return Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0.3, 0, 1);
    }

    getDirectorState() {
        return this.combatMods?.state || 'manual';
    }

    getAdaptiveIdleIntervalMs() { return this.reinforcementSystem.getAdaptiveIdleIntervalMs(); }

    getDynamicAliveSoftCap(marines = null) {
        const difficulty = this.activeMission?.difficulty || 'normal';
        let base = difficulty === 'extreme' ? 16 : (difficulty === 'hard' ? 12 : 5);
        const pressure = this.getCombatPressure();
        const wave = Math.max(1, Number(this.stageFlow?.currentWave) || 1);
        base += Math.round((wave - 1) * 1.0);
        base += Math.round(pressure * 4);
        const missionId = this.activeMission?.id || 'm1';
        if (missionId === 'm5') base += 4;
        else if (missionId === 'm4') base += 2;
        else if (missionId === 'm1') base -= 2;
        if (this.shouldApplySurvivalRelief(marines || this.squadSystem.getAllMarines())) base -= 4;
        return Phaser.Math.Clamp(base, 10, 48);
    }

    markCombatAction(time = this.time.now) {
        this.reinforcementSystem.markCombatAction(time);
        if (this.combatDirector) this.combatDirector.noteFirefight(time);
    }
    noteGunfireEvent(time = this.time.now) {
        this.reinforcementSystem.noteGunfireEvent(time);
        if (this.combatDirector) this.combatDirector.noteFirefight(time);
    }
    pruneGunfireEvents(time = this.time.now) { this.reinforcementSystem.pruneGunfireEvents(time); }

    updateCombatBurstState(time = this.time.now) { this.reinforcementSystem.updateCombatBurstState(time); }
    isGunfireBurstActive(time = this.time.now) { return this.reinforcementSystem.isGunfireBurstActive(time); }

    tryGunfireReinforcement(time, sourceX, sourceY, marines) { this.reinforcementSystem.tryGunfireReinforcement(time, sourceX, sourceY, marines); }

    spawnGunfireDoorPack(time, sourceX, sourceY, marines) { return this.reinforcementSystem.spawnGunfireDoorPack(time, sourceX, sourceY, marines); }

    getDoorGroupCenter(g) { return this.reinforcementSystem.getDoorGroupCenter(g); }
    getMissionSpawnPressureScale(id = '') { return this.reinforcementSystem.getMissionSpawnPressureScale(id); }
    getMissionReinforcementCapScale(id = '') { return this.reinforcementSystem.getMissionReinforcementCapScale(id); }
    applyMissionReinforcementCaps(id = '') { this.reinforcementSystem.applyMissionReinforcementCaps(id); }
    getDirectionBucket(wx, wy) { return this.reinforcementSystem.getDirectionBucket(wx, wy); }
    pruneDoorNoiseHistory(t = this.time.now) { this.reinforcementSystem.pruneDoorNoiseHistory(t); }
    getDoorNoisePenalty(dir, t = this.time.now) { return this.reinforcementSystem.getDoorNoisePenalty(dir, t); }
    noteDoorNoiseDirection(dir, id = '', t = this.time.now) { this.reinforcementSystem.noteDoorNoiseDirection(dir, id, t); }
    getDoorRepeatPenalty(id = '', t = this.time.now) { return this.reinforcementSystem.getDoorRepeatPenalty(id, t); }
    pruneIdleSpawnHistory(t = this.time.now) { this.reinforcementSystem.pruneIdleSpawnHistory(t); }
    noteIdleSpawnPoint(world, t = this.time.now) { this.reinforcementSystem.noteIdleSpawnPoint(world, t); }
    getIdleSpawnRepeatPenalty(world, t = this.time.now) { return this.reinforcementSystem.getIdleSpawnRepeatPenalty(world, t); }
    countActiveReinforcements(src = null) { return this.reinforcementSystem.countActiveReinforcements(src); }
    getAvailableReinforcementSlots(src = null) { return this.reinforcementSystem.getAvailableReinforcementSlots(src); }
    noteReinforcementSpawn(t = this.time.now, src = 'idle', n = 1) { this.reinforcementSystem.noteReinforcementSpawn(t, src, n); }
    pickSpawnBehindDoor(dg, center, marines) { return this.reinforcementSystem.pickSpawnBehindDoor(dg, center, marines); }

    getClosestEnemyForTrackerCue(view, maxDist = 1472) {
        if (!this.enemyManager || !this.leader) return null;
        const contacts = this.enemyManager.getMotionContacts() || [];
        if (contacts.length === 0) return null;

        // Apply the same cone filter as MotionTracker.js: ±30° from facingAngle, within maxDist
        const CONE_HALF_ANGLE = Math.PI / 6; // 30°
        const facingAngle = this.leader.facingAngle || 0;

        let best = null;
        for (const contact of contacts) {
            if (!contact) continue;
            const dx = (Number(contact.x) || 0) - this.leader.x;
            const dy = (Number(contact.y) || 0) - this.leader.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist) continue;

            // Cone angle check
            let diff = Math.atan2(dy, dx) - facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > CONE_HALF_ANGLE) continue;

            if (!best || dist < best.dist) best = { enemy: contact, dist };
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

    computeLeaderAimAssistAngle(baseAngle, dynamics = null) {
        const angle = Number(baseAngle) || 0;
        if (!this.enemyManager || !Array.isArray(this.enemyManager.enemies)) return angle;
        if (!this.weaponManager || !this.leader) return angle;
        const weaponKey = this.weaponManager.currentWeaponKey || 'pulseRifle';
        const assistByWeapon = {
            pulseRifle: { cone: 0.26, maxDist: 430, base: 0.2 },
            shotgun: { cone: 0.2, maxDist: 260, base: 0.1 },
            pistol: { cone: 0.22, maxDist: 360, base: 0.14 },
        };
        const cfg = assistByWeapon[weaponKey] || assistByWeapon.pulseRifle;
        const cone = cfg.cone;
        const maxDist = cfg.maxDist;
        let best = null;
        for (const enemy of this.enemyManager.enemies) {
            if (!enemy || !enemy.active) continue;
            const dx = enemy.x - this.leader.x;
            const dy = enemy.y - this.leader.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0.0001 || dist > maxDist) continue;
            const toEnemy = Math.atan2(dy, dx);
            const delta = Phaser.Math.Angle.Wrap(toEnemy - angle);
            const absDelta = Math.abs(delta);
            if (absDelta > cone) continue;
            const hpNorm = Phaser.Math.Clamp(
                (Number(enemy.health) || 0) / Math.max(1, Number(enemy.maxHealth) || 1),
                0,
                1
            );
            const distNorm = dist / maxDist;
            const score = absDelta * 1.22 + distNorm * 0.74 + hpNorm * 0.06;
            if (!best || score < best.score) {
                best = { score, delta, distNorm };
            }
        }
        if (!best) return angle;
        const moveNorm = Phaser.Math.Clamp(Number(dynamics?.moveNorm) || 0, 0, 1.3);
        const pressure = Phaser.Math.Clamp(Number(dynamics?.pressure) || 0, 0, 1);
        const recoilNorm = Phaser.Math.Clamp(Number(this.weaponManager.getRecoilNormalized?.(weaponKey)) || 0, 0, 1);
        const assist = Phaser.Math.Clamp(
            cfg.base + (1 - best.distNorm) * 0.1 - moveNorm * 0.12 - recoilNorm * 0.1 - pressure * 0.07,
            0.04,
            0.28
        );
        return angle + best.delta * assist;
    }

    computeMarineHitChance(roleKey, marine, options = {}) {
        const role = String(roleKey || marine?.roleKey || 'marine').toLowerCase();
        const bandByRole = {
            leader: { min: 0.8, max: 0.9 },
            heavy: { min: 0.72, max: 0.84 },
            marine: { min: 0.58, max: 0.70 },
        };
        const band = role === 'leader'
            ? bandByRole.leader
            : (role === 'heavy' ? bandByRole.heavy : bandByRole.marine);
        const hpPctRaw = Number(options.hpPct);
        const hpPct = Number.isFinite(hpPctRaw)
            ? Phaser.Math.Clamp(hpPctRaw, 0, 1)
            : Phaser.Math.Clamp((Number(marine?.health) || 0) / Math.max(1, Number(marine?.maxHealth) || 100), 0, 1);
        const moralePenaltyRaw = Number(options.moralePenalty);
        const moraleBoostRaw = Number(options.moraleBoost);
        let moralePenalty;
        let moraleBoost;
        if (Number.isFinite(moralePenaltyRaw) && Number.isFinite(moraleBoostRaw)) {
            moralePenalty = Phaser.Math.Clamp(moralePenaltyRaw, 0, 1);
            moraleBoost = Phaser.Math.Clamp(moraleBoostRaw, 0, 1);
        } else {
            const morale = Number.isFinite(marine?.morale) ? Number(marine.morale) : 0;
            moralePenalty = Phaser.Math.Clamp(-morale / 100, 0, 1);
            moraleBoost = Phaser.Math.Clamp(morale / 100, 0, 1);
        }

        let chance = (band.min + band.max) * 0.5;
        // Fear/confidence impact.
        chance += moraleBoost * 0.07;
        chance -= moralePenalty * 0.12;
        // Health impact: >80% gets a small buff, <60% scales down progressively.
        if (hpPct > 0.8) {
            chance += Phaser.Math.Clamp((hpPct - 0.8) / 0.2, 0, 1) * 0.04;
        } else if (hpPct < 0.6) {
            chance -= Phaser.Math.Clamp((0.6 - hpPct) / 0.6, 0, 1) * 0.2;
        }
        return Phaser.Math.Clamp(chance, band.min, band.max);
    }

    getMissAngleOffset(roleKey, hitChance) {
        const role = String(roleKey || 'marine').toLowerCase();
        const missMul = Phaser.Math.Clamp((1 - (Number(hitChance) || 0.5)) / 0.5, 0.5, 1.5);
        let minOffset = 0.14;
        let maxOffset = 0.38;
        if (role === 'leader') {
            minOffset = 0.10;
            maxOffset = 0.28;
        } else if (role === 'heavy') {
            minOffset = 0.12;
            maxOffset = 0.34;
        }
        const mag = Phaser.Math.FloatBetween(minOffset, maxOffset) * missMul;
        return mag * (Math.random() < 0.5 ? -1 : 1);
    }

    getLeaderJamRisk(time = this.time.now, marines = null) {
        if (!this.weaponManager || !this.leader) return 0;
        if (time < (Number(this.weaponManager.jamUntil) || 0)) return 1;
        const dynamics = this.computeLeaderWeaponDynamics(time, marines);
        // Render a "jam within current burst" risk, not just raw per-shot chance.
        const fireRate = Math.max(20, Number(dynamics.effectiveFireRate) || 90);
        const burstWindowMs = 1600;
        const expectedShots = Phaser.Math.Clamp(Math.round(burstWindowMs / fireRate), 1, 30);
        const p = Phaser.Math.Clamp(Number(dynamics.effectiveJamChance) || 0, 0, 0.95);
        const burstRisk = 1 - Math.pow(1 - p, expectedShots);
        return Phaser.Math.Clamp(burstRisk, 0, 1);
    }

    computeLeaderWeaponDynamics(time = this.time.now, marines = null) {
        if (!this.weaponManager || !this.leader) {
            return {
                weaponKey: 'pulseRifle',
                spreadMul: 1,
                fireRateMul: 1,
                jamChanceFinal: 0,
                effectiveJamChance: 0,
                effectiveFireRate: 90,
                crowdNorm: 0,
                recentHitNorm: 0,
                pressure: 0,
                momentum: 0,
                moveNorm: 0,
                stability: 1,
            };
        }
        const morale = Number.isFinite(this.leader?.morale) ? this.leader.morale : 0;
        const moralePenalty = Phaser.Math.Clamp(-morale / 100, 0, 1);
        const moraleBoost = Phaser.Math.Clamp(morale / 100, 0, 1);
        const momentum = this.getKillMomentum(time);
        const pressure = Phaser.Math.Clamp(Number(this.combatMods?.pressure) || 0, 0, 1);
        const jamMul = Phaser.Math.Clamp(Number(this.combatMods?.marineJamMul) || 1, 0.25, 3);
        const weaponKey = this.weaponManager.currentWeaponKey || 'pulseRifle';
        const weaponDef = this.weaponManager.getRuntimeWeaponDef(weaponKey);
        // Heat derived from pulse ammo counter: low ammo = high heat
        const pulseAmmo = Number(this.weaponManager.pulseAmmo) || 99;
        const heatNorm = weaponKey === 'pulseRifle' ? Phaser.Math.Clamp(1 - (pulseAmmo / 99), 0, 1) : 0;
        const spreadMul = Phaser.Math.Clamp(
            1 + moralePenalty * 1.05 - moraleBoost * 0.26 + pressure * 0.05 - momentum * 0.18
            // Hit streak tightens spread — consecutive hits reward accurate aim
            - Phaser.Math.Clamp((this.hitStreak || 0) / 20, 0, 0.25),
            0.5,
            2.8
        );
        const fireRateMul = Phaser.Math.Clamp(
            1 + moralePenalty * 0.36 - moraleBoost * 0.2 + pressure * 0.08 - momentum * 0.16,
            0.62,
            2.4
        );
        const jamChance = Phaser.Math.Clamp(
            (0.018 + moralePenalty * 0.13 + heatNorm * 0.095) * jamMul * (1 - momentum * 0.34),
            0,
            0.46
        );
        const closeHostiles = this.countCloseEnemiesToTeam(260, marines);
        const crowdNorm = Phaser.Math.Clamp((closeHostiles - 2) / 7, 0, 1);
        const recentlyHit = Number.isFinite(this.leader?.lastDamagedAt) && (time - this.leader.lastDamagedAt) <= 1800;
        const recentHitNorm = recentlyHit ? Phaser.Math.Clamp(1 - ((time - this.leader.lastDamagedAt) / 1800), 0, 1) : 0;
        const panicJamLift = crowdNorm * 0.045 + recentHitNorm * 0.05;
        const calmControl = moraleBoost * 0.02 + momentum * 0.015;
        // Keep jams noticeable under sustained stress while preserving short bursts.
        const jamDelayMul = 1.15;
        const jamChanceFinal = Phaser.Math.Clamp((jamChance + panicJamLift - calmControl) / jamDelayMul, 0, 0.42);
        const lvx = Number(this.leader?.body?.velocity?.x) || 0;
        const lvy = Number(this.leader?.body?.velocity?.y) || 0;
        const moveSpeed = Math.hypot(lvx, lvy);
        const maxLeaderSpeed = Math.max(1, Number(this.leader?.moveSpeed) || Number(this.runtimeSettings?.player?.leaderSpeed) || 120);
        const moveNorm = Phaser.Math.Clamp(moveSpeed / maxLeaderSpeed, 0, 1.4);
        const stability = Phaser.Math.Clamp(1.18 - moveNorm * 0.38 + moraleBoost * 0.14 - moralePenalty * 0.08, 0.62, 1.28);
        const recoilNorm = Phaser.Math.Clamp(Number(this.weaponManager.getRecoilNormalized?.(weaponKey)) || 0, 0, 1);
        const instability = Phaser.Math.Clamp((1 / Math.max(0.55, stability)) - 1, 0, 1.2);
        const effectiveJamChance = Phaser.Math.Clamp(
            jamChanceFinal * (1 + recoilNorm * 0.5 + instability * 0.35),
            0,
            0.95
        );
        const effectiveFireRate = this.weaponManager.getAdjustedFireRate
            ? this.weaponManager.getAdjustedFireRate(weaponDef, { fireRateMul })
            : Math.max(20, Math.floor((Number(weaponDef?.fireRate) || 90) * fireRateMul));
        return {
            weaponKey,
            spreadMul,
            fireRateMul,
            jamChanceFinal,
            effectiveJamChance,
            effectiveFireRate,
            crowdNorm,
            recentHitNorm,
            pressure,
            momentum,
            moveNorm,
            stability,
        };
    }

    reportDoorThump(worldX, worldY, time = this.time.now, breached = false, force = false, doorGroup = null) {
        if (!force && time < this.nextDoorThumpCueAt) return;
        this.nextDoorThumpCueAt = time + (force ? 120 : 280);
        this.rattleDoorGroup(doorGroup, breached ? 1.25 : 1);
        const thumpWord = this.getMissionAudioCueText('cue_door_thump', 'THUMP!!');
        const breachWord = this.getMissionAudioCueText('cue_door_breach', 'BREACH!!');
        this.showEdgeWordCue(breached ? breachWord : thumpWord, worldX, worldY, breached ? '#72bfff' : '#8fcfff');
    }

    rattleDoorGroup(doorGroup, strength = 1) {
        if (!doorGroup || !Array.isArray(doorGroup.doors) || doorGroup.doors.length === 0) return;
        const mul = Phaser.Math.Clamp(Number(strength) || 1, 0.5, 2.2);
        for (const door of doorGroup.doors) {
            if (!door || door.active === false) continue;
            if (door._rattleTween) {
                door._rattleTween.stop();
                door._rattleTween = null;
            }
            const baseX = Number(door._rattleBaseX);
            const baseY = Number(door._rattleBaseY);
            const startX = Number.isFinite(baseX) ? baseX : door.x;
            const startY = Number.isFinite(baseY) ? baseY : door.y;
            door._rattleBaseX = startX;
            door._rattleBaseY = startY;
            door._rattleTween = this.tweens.add({
                targets: door,
                x: startX + Phaser.Math.FloatBetween(-1.6, 1.6) * mul,
                y: startY + Phaser.Math.FloatBetween(-1.2, 1.2) * mul,
                duration: Phaser.Math.Between(28, 52),
                yoyo: true,
                repeat: 2,
                ease: 'Quad.InOut',
                onComplete: () => {
                    if (!door || door.active === false) return;
                    door.x = startX;
                    door.y = startY;
                    if (door.body && typeof door.body.updateFromGameObject === 'function') {
                        door.body.updateFromGameObject();
                    }
                    door._rattleTween = null;
                },
            });
        }
    }

    showEdgeWordCue(word, worldX, worldY, color = '#ffffff') {
        // Textual cues removed per UI polish request (rely on HUD pulse and audio)
    }

    isStagingSafeActive(time = this.time.now) {
        const missionId = this.activeMission?.id || 'm1';
        if (missionId !== 'm1') return false;
        // In M1, if the player is within 8.5 tiles of the start, they are 'safe'
        const spawnX = Number(this.spawnMarker?.x) || 0;
        const spawnY = Number(this.spawnMarker?.y) || 0;
        const d = Phaser.Math.Distance.Between(this.leader.x, this.leader.y, spawnX, spawnY);
        return d < (CONFIG.TILE_SIZE * 8.5);
    }

    getWeightedSpawnType() {
        const missionId = this.activeMission?.id || 'm1';
        const difficulty = this.activeMission?.difficulty || 'normal';
        const isM1 = missionId === 'm1';
        const isM2 = missionId === 'm2';
        
        // Define weights: [type, weight]
        let weights = [];
        if (isM1) {
            weights = [['facehugger', 45], ['drone', 45], ['warrior', 10]];
        } else if (isM2) {
            weights = [['facehugger', 30], ['drone', 50], ['warrior', 20]];
        } else if (difficulty === 'extreme') {
            weights = [['facehugger', 15], ['drone', 35], ['warrior', 50]];
        } else {
            weights = [['facehugger', 20], ['drone', 40], ['warrior', 40]];
        }

        const totalWeight = weights.reduce((sum, w) => sum + w[1], 0);
        let rnd = Math.random() * totalWeight;
        for (const [type, weight] of weights) {
            if (rnd < weight) return type;
            rnd -= weight;
        }
        return 'drone';
    }

    updateIdlePressureSpawns(time, marines) { this.reinforcementSystem.updateIdlePressureSpawns(time, marines); }
    updateInactivityAmbush(time, marines) { this.reinforcementSystem.updateInactivityAmbush(time, marines); }

    get lastSetpieceDir() {
        return this.setpieceSystem ? this.setpieceSystem.lastSetpieceDir : '';
    }

    set lastSetpieceDir(val) {
        if (this.setpieceSystem) this.setpieceSystem.lastSetpieceDir = val;
    }

    getMissionSetpieceTemplates() {
        return this.setpieceSystem.getMissionSetpieceTemplates();
    }

    tryMissionAuthoredSetpiece(time, marines, pressure) {
        return this.setpieceSystem.tryMissionAuthoredSetpiece(time, marines, pressure);
    }

    updateCorridorSetpieces(time, marines) {
        this.setpieceSystem.updateCorridorSetpieces(time, marines);
    }

    spawnIdlePressureWave(t, marines) { return this.reinforcementSystem.spawnIdlePressureWave(t, marines); }
    pickIdlePressureSpawnWorld(view, marines, t = this.time.now, dir = '', anchor = null) { return this.reinforcementSystem.pickIdlePressureSpawnWorld(view, marines, t, dir, anchor); }
    pickReinforcementType(src = 'idle', idx = 0, t = this.time.now) { return this.reinforcementSystem.pickReinforcementType(src, idx, t); }
    noteReinforcementTypeSpawn(type, t = this.time.now) { this.reinforcementSystem.noteReinforcementTypeSpawn(type, t); }
    isReinforcementTypeReady(type, t = this.time.now, cd = 3000) { return this.reinforcementSystem.isReinforcementTypeReady(type, t, cd); }

    isMotionTrackerRiskLocked(time) {
        return time < this.trackerRiskUntil;
    }

    resolveActionLockConflicts(time = this.time.now) {
        // No tracker lock conflicts — tracker is passive
    }

    startMotionTrackerScan(time, preferredRoleKey = null, options = null) {
        const visibility = this.runtimeSettings?.visibility || {};
        const force = !!(options && options.force === true);
        const actionMs = 5000; // startup channel stays 5s
        const scanMs = Number(visibility.trackerScanMs) || CONFIG.MOTION_TRACKER_SCAN_MS;
        const riskMs = Number(visibility.trackerRiskMs) || CONFIG.MOTION_TRACKER_RISK_MS;
        const cooldownMs = Number(visibility.trackerCooldownMs) || CONFIG.MOTION_TRACKER_COOLDOWN_MS;
        if (this.healAction) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER BLOCKED: HEAL ACTIVE', '#ffcc88');
            return false;
        }
        if (this.isMotionTrackerRiskLocked(time)) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER IN PROGRESS', '#ffcc88');
            return false;
        }
        if (!force && time < this.trackerCooldownUntil) {
            const remain = ((this.trackerCooldownUntil - time) / 1000).toFixed(1);
            this.showFloatingText(this.leader.x, this.leader.y - 24, `TRACKER COOL ${remain}s`, '#88ffaa');
            return false;
        }
        const operator = this.pickTrackerOperator(preferredRoleKey);
        if (!operator || !operator.actor) {
            this.showFloatingText(this.leader.x, this.leader.y - 24, 'SELECTED TRACKER OPERATOR UNAVAILABLE', '#ff9999');
            return false;
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
        // Risk window matches configured value (defaults to scan duration).
        this.trackerRiskUntil = this.trackerChannelUntil + riskMs;
        this.trackerCooldownUntil = time + cooldownMs;
        this.showFloatingText(this.leader.x, this.leader.y - 24, 'TRACKER ACTIVATING', '#88ffaa');
        if (this.sfx) this.sfx.playUiClick(true);
        return true;
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

    playUiClickSfx(strong = false) {
        if (this.sfx) this.sfx.playUiClick(strong);
    }

    updateOverheatBar(time) {
        if (!this.leader || !this.weaponManager) return;
        
        const pulseAmmo = Number(this.weaponManager.pulseAmmo) || 99;
        const heatPct = 1 - (pulseAmmo / 99); // low ammo = high heat
        
        if (!this.overheatBar) {
            this.overheatBar = this.add.graphics();
            this.overheatBar.setDepth(150);
            this.overheatLabel = this.add.text(0, 0, 'OVERHEAT', {
                fontSize: '10px',
                fontFamily: '"Share Tech Mono", monospace',
                color: '#ff4444',
                fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(151).setVisible(false);
        }

        const bar = this.overheatBar;
        const label = this.overheatLabel;

        // Display logic: show when > 80%, hide when < 50%
        if (heatPct > 0.8) {
            this._showOverheat = true;
        } else if (heatPct < 0.5) {
            this._showOverheat = false;
        }

        if (this._showOverheat) {
            bar.clear();
            bar.setVisible(true);
            label.setVisible(true);

            const x = this.leader.x;
            const y = this.leader.y - 35;
            const w = 40;
            const h = 4;

            // Background
            bar.fillStyle(0x000000, 0.5);
            bar.fillRect(x - w/2, y, w, h);
            
            // Fill
            const color = heatPct > 0.95 ? 0xff0000 : 0xffaa00;
            bar.fillStyle(color, 0.8);
            bar.fillRect(x - w/2, y, w * heatPct, h);
            
            // Border
            bar.lineStyle(1, 0x4aa4d8, 0.4);
            bar.strokeRect(x - w/2, y, w, h);

            label.setPosition(x, y - 8);
            if (heatPct > 0.95) {
                const alpha = 0.6 + Math.sin(time * 0.02) * 0.4;
                label.setAlpha(alpha);
            } else {
                label.setAlpha(1);
            }
        } else {
            bar.setVisible(false);
            label.setVisible(false);
        }
    }

    _setupMinimapInput() {
        if (!this.minimap) return;

        this._minimapPointerMoveHandler = (pointer) => {
            const px = pointer.x;
            const py = pointer.y;
            let anyCursor = false;
            for (const btn of this.minimap.getButtons()) {
                const b = this.minimap.getButtonWorldBounds(btn);
                if (!b) continue;
                const inside = px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
                if (inside && !btn._hovered) {
                    btn._hovered = true;
                    btn.bg.setFillStyle(0x0e2a42, 1);
                    btn.bg.setStrokeStyle(1, 0x7ecfff, 1);
                    btn.text.setColor('#ffffff');
                } else if (!inside && btn._hovered) {
                    btn._hovered = false;
                    btn.bg.setFillStyle(0x07172a, 0.82);
                    btn.bg.setStrokeStyle(1, 0x4aa4d8, 0.7);
                    btn.text.setColor('#4aa4d8');
                }
                if (inside) anyCursor = true;
            }
            if (anyCursor) this.input.setDefaultCursor('pointer');
        };

        this._minimapPointerDownHandler = (pointer) => {
            const px = pointer.x;
            const py = pointer.y;
            for (const btn of this.minimap.getButtons()) {
                const b = this.minimap.getButtonWorldBounds(btn);
                if (!b) continue;
                if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
                    if (this.inputHandler) this.inputHandler.suppressClick = true;
                    this.inputHandler?.consumeMenuClick?.();
                    btn.onClick(pointer);
                    return;
                }
            }
        };

        this.input.on('pointermove', this._minimapPointerMoveHandler);
        this.input.on('pointerdown', this._minimapPointerDownHandler);
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.sfx) this.sfx.playUiClick(true);
        this.pauseText.setVisible(this.isPaused);
        if (this.isPaused) {
            // Close fullscreen map when pausing
            if (this.minimap?.isFullscreen) this.minimap.closeFullscreen();
            this.physics.world.pause();
            this.contextMenu.hide();
            this.doorActionSystem.cancelPending();
            this.movementSystem.clearPath(this.leader);
            if (this.sfx) this.sfx.pauseAudio();
            if (this.atmosphereSystem) {
                try { this.atmosphereSystem.pauseVentHum(); } catch {}
            }
        } else {
            this.physics.world.resume();
            if (this.sfx) this.sfx.resumeAudio();
            if (this.atmosphereSystem) {
                try { this.atmosphereSystem.resumeVentHum(); } catch {}
            }
        }
    }

    // ── Node-based action system: default action registrations ──
    _registerDefaultActions() {
        const d = this.actionDispatcher;

        d.register('screen_shake', (params) => {
            const dur = Number(params.duration) || 200;
            const intensity = Number(params.intensity) || 0.01;
            this.cameras.main?.shake(dur, intensity);
        });

        d.register('play_sound', (params) => {
            const key = String(params.key || params.sound || '');
            if (key && this.sfx) this.sfx.playSample(key);
        });

        d.register('show_text', (params, payload) => {
            const x = Number(params.x) || Number(payload?.x) || (this.leader?.x ?? 400);
            const y = Number(params.y) || Number(payload?.y) || (this.leader?.y ?? 300);
            const text = String(params.text || '');
            const color = String(params.color || '#ffffff');
            if (text && typeof this.showFloatingText === 'function') {
                this.showFloatingText(x, y - 18, text, color);
            }
        });

        d.register('spawn_pack', (params) => {
            if (this.setpieceSystem) {
                this.setpieceSystem.spawnDirectorPack(params, this.time.now);
            }
        });

        d.register('set_lighting', (params) => {
            if (!this.lightingOverlay) return;
            if (params.ambient != null) {
                this.lightingOverlay.setAmbient(Number(params.ambient));
            }
            if (params.tintR != null || params.tintG != null || params.tintB != null) {
                this.lightingOverlay.setAmbientTint(
                    Number(params.tintR ?? 1),
                    Number(params.tintG ?? 1),
                    Number(params.tintB ?? 1)
                );
            }
        });

        d.register('door_action', (params) => {
            if (!this.doorManager) return;
            const doorId = String(params.doorId || '');
            const action = String(params.action || params.state || 'open');
            const group = this.doorManager.getDoorGroupById?.(doorId);
            if (!group) return;
            if (action === 'open') group.open?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
            else if (action === 'close') group.close?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
            else if (action === 'lock') group.lock?.();
            else if (action === 'weld') group.weld?.();
        });

        // ── Phase 4 expanded actions ──

        d.register('screen_flash', (params) => {
            const dur = Number(params.duration) || 200;
            this.cameras.main?.flash(dur);
        });

        d.register('camera_zoom', (params) => {
            const level = Number(params.zoom) || 1;
            const dur = Number(params.duration) || 500;
            this.cameras.main?.zoomTo(level, dur);
        });

        d.register('show_floating_text', (params, payload) => {
            const x = Number(params.x) || Number(payload?.x) || (this.leader?.x ?? 400);
            const y = Number(params.y) || Number(payload?.y) || (this.leader?.y ?? 300);
            const text = String(params.text || '');
            const color = String(params.color || '#ffffff');
            if (text && typeof this.showFloatingText === 'function') {
                this.showFloatingText(x, y - 18, text, color);
            }
        });

        d.register('spawn_decal', (params, payload) => {
            const x = Number(payload?.x) || (this.leader?.x ?? 400);
            const y = Number(payload?.y) || (this.leader?.y ?? 300);
            const type = String(params.type || 'acid');
            if (typeof this.spawnFloorDecal === 'function') {
                this.spawnFloorDecal(x, y, type);
            }
        });

        d.register('set_ambient_darkness', (params) => {
            if (this.lightingOverlay && params.value != null) {
                this.lightingOverlay.setAmbient(Number(params.value));
            }
        });

        d.register('emergency_lighting', (params) => {
            if (!this.lightingOverlay) return;
            if (Number(params.enabled)) {
                this.lightingOverlay.setAmbientTint(1.2, 0.3, 0.2);
            } else {
                this.lightingOverlay.setAmbientTint(1, 1, 1);
            }
        });

        d.register('spawn_alien', (params) => {
            if (!this.enemyManager) return;
            const type = String(params.type || 'warrior');
            const count = Math.max(1, Number(params.count) || 1);
            for (let i = 0; i < count; i++) {
                const view = this.cameras.main?.worldView;
                const world = this.reinforcementSystem?.pickIdlePressureSpawnWorld(view, this.squadSystem?.getAllMarines(), this.time.now);
                if (world) this.enemyManager.spawnEnemyAtWorld(type, world.x, world.y, this.stageFlow?.currentWave || 1);
            }
        });

        d.register('spawn_queen', (params) => {
            if (!this.enemyManager) return;
            const view = this.cameras.main?.worldView;
            const world = this.reinforcementSystem?.pickIdlePressureSpawnWorld(view, this.squadSystem?.getAllMarines(), this.time.now, String(params.sector || ''));
            if (world) this.enemyManager.spawnEnemyAtWorld('queen', world.x, world.y, this.stageFlow?.currentWave || 1);
        });

        d.register('kill_all_aliens', () => {
            if (!this.enemyManager) return;
            for (const enemy of this.enemyManager.enemies) {
                if (enemy.active && !enemy.isDying) enemy.die();
            }
        });

        d.register('heal_leader', (params) => {
            if (this.leader && typeof this.leader.heal === 'function') {
                this.leader.heal(Number(params.amount) || 20);
            }
        });

        d.register('damage_leader', (params) => {
            if (this.leader && typeof this.leader.takeDamage === 'function') {
                this.leader.takeDamage(Number(params.amount) || 10);
            }
        });

        d.register('open_door', (params) => {
            const group = this.doorManager?.getDoorGroupById?.(String(params.doorId || ''));
            if (group) group.open?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
        });

        d.register('close_door', (params) => {
            const group = this.doorManager?.getDoorGroupById?.(String(params.doorId || ''));
            if (group) group.close?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
        });

        d.register('lock_door', (params) => {
            const group = this.doorManager?.getDoorGroupById?.(String(params.doorId || ''));
            if (group) group.lock?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
        });

        d.register('weld_door', (params) => {
            const group = this.doorManager?.getDoorGroupById?.(String(params.doorId || ''));
            if (group) group.weld?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer);
        });

        d.register('breach_door', (params) => {
            const group = this.doorManager?.getDoorGroupById?.(String(params.doorId || ''));
            if (group) group.destroy?.(this.pathGrid, this.doorManager.physicsGroup, this.lightBlockerGrid, this.wallLayer, 'action');
        });

        d.register('set_pressure', (params) => {
            if (this.combatDirector && params.value != null) {
                this.combatDirector.pressure = Number(params.value);
                this.combatDirector.targetPressure = Number(params.value);
            }
        });

        d.register('set_combat_mods', (params) => {
            if (!this.combatDirector) return;
            if (params.speedMult != null) this.combatDirector.modifiers.enemyAggressionMul = Number(params.speedMult);
            if (params.damageMult != null) this.combatDirector.modifiers.enemyDoorDamageMul = Number(params.damageMult);
        });

        d.register('force_stage', (params) => {
            if (!this.stageFlow) return;
            const stage = String(params.stage || 'combat');
            if (['combat', 'intermission', 'extract', 'victory', 'defeat'].includes(stage)) {
                this.stageFlow.state = stage;
            }
        });

        d.register('follower_callout', (params) => {
            const text = String(params.text || 'Contact!');
            const marines = this.squadSystem?.getAllMarines() || [];
            const follower = marines.length > 1 ? marines[1 + Math.floor(Math.random() * (marines.length - 1))] : null;
            if (follower && typeof this.showFloatingText === 'function') {
                this.showFloatingText(follower.x, follower.y - 24, text, '#a7dfff');
            }
        });

        d.register('show_objective', (params) => {
            if (this.objectivesPanel && typeof this.objectivesPanel.setObjective === 'function') {
                this.objectivesPanel.setObjective(String(params.text || ''));
            }
        });

        d.register('show_mission_text', (params) => {
            const text = String(params.text || '');
            const dur = Number(params.duration) || 3000;
            if (text && typeof this.showFloatingText === 'function') {
                this.showFloatingText(this.cameras.main.worldView.centerX, this.cameras.main.worldView.centerY - 60, text, '#4fa4d8');
            }
        });
    }
}

function round3(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
}
