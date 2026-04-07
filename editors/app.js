import { buildPackageFromEditorState } from './backend/js/buildPackageFromEditorState.js';
import { normalizeMissionPackage, validateMissionPackageShape } from './backend/js/normalizeMissionPackage.js';
import { analyzeMissionPackageQuality, autoTuneMissionPackage, applyQualityProfile } from './backend/js/missionPackageQuality.js';
import { MISSION_SET } from '../src/data/missionData.js';
import { TILEMAP_TEMPLATES } from '../src/data/tilemapTemplates.js';
import { TILED_MAP_TEMPLATES } from '../src/data/tiledMaps.generated.js';

const PACKAGE_HISTORY_KEY = 'aliens_mission_package_history_v1';
const PACKAGE_HISTORY_MAX = 16;
const STRICT_QUALITY_STORAGE_KEY = 'aliens_package_strict_quality_v1';
const COMBAT_TELEMETRY_STORAGE_KEY = 'aliens_combat_telemetry_v1';
const MISSION_BALANCE_HISTORY_KEY = 'aliens_mission_balance_history_v1';

const TILE_VALUES = {
    terrain: [
        { value: 0, label: 'floor', color: '#2f3f4c' },
        { value: 1, label: 'wall', color: '#8093a3' },
    ],
    doors: [
        { value: 0, label: 'none', color: '#00000000' },
        { value: 1, label: 'standard', color: '#a3504e' },
        { value: 2, label: 'electronic', color: '#45739f' },
        { value: 3, label: 'locked', color: '#af8f4a' },
        { value: 4, label: 'welded', color: '#8ca2b3' },
    ],
    markers: [
        { value: 0, label: 'none', color: '#00000000' },
        { value: 1, label: 'spawn', color: '#4fdb8e' },
        { value: 2, label: 'extract', color: '#6eb8ff' },
        { value: 3, label: 'terminal', color: '#c47ae8' },
        { value: 4, label: 'security_card', color: '#d5da62' },
        { value: 5, label: 'alien_spawn', color: '#ff4400' },
        { value: 6, label: 'warning_strobe', color: '#ff6688' },
        { value: 7, label: 'vent_point', color: '#88ffdd' },
        { value: 8, label: 'egg_cluster', color: '#cc66ff' },
    ],
    // props and lights layers are object-based, not a grid of values
    props: [],
    lights: [],
};

const LIGHT_PRESETS = [
    { label: 'Cool Lamp', type: 'spot',  radius: 240, color: '#aaccff', brightness: 0.85, info: 'Standard blue-ish overhead lamp' },
    { label: 'Warm Spot', type: 'spot',  radius: 320, color: '#ffeebb', brightness: 1.0,  info: 'Amber focused spotlight' },
    { label: 'Emergency', type: 'alarm', radius: 180, color: '#ff4444', brightness: 1.2,  info: 'Red rotating alarm beacon' },
    { label: 'Dim Fill',  type: 'spot',  radius: 400, color: '#ffffff', brightness: 0.4,  info: 'Large area low-intensity fill' },
];

// Mutable working copies of light presets (originals stay intact for reset)
const activeLightPresets = LIGHT_PRESETS.map(p => ({ ...p }));

const DOOR_PRESETS = [
    { label: 'Standard', value: 1, info: 'Normal sliding door' },
    { label: 'Electronic', value: 2, info: 'Secured electronic latch' },
    { label: 'Locked', value: 3, info: 'Hard-locked, requires override' },
    { label: 'Welded', value: 4, info: 'Permanently sealed' },
];

const MISSION_TEMPLATE_LOOKUP = new Map(
    MISSION_SET.map((mission) => [String(mission.id), mission])
);

const EDITOR_PLACEHOLDER_PREVIEWS = Object.freeze({
    character: '/assets/sprites/scaled/marine/marine_topdown.png',
    alien: '/assets/sprites/scaled/alien_warrior/alien_warrior_idle.png',
    floor: '/assets/editor/placeholders/preview-floor.svg',
    wall: '/assets/editor/placeholders/preview-wall.svg',
    prop: '/assets/editor/placeholders/preview-prop.svg',
    zone: '/assets/editor/placeholders/preview-zone.svg',
    object: '/assets/editor/placeholders/preview-object.svg',
    projectile: '/assets/editor/placeholders/preview-projectile.svg',
    facehugger: '/src/graphics/fhugger.png',
});

// Known game image assets indexed by Phaser texture key.
const ASSET_MANIFEST = [
    { key: 'tile_floor_grill_import',        label: 'Corridor Floor',          path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_floor_grill_offset_import', label: 'Corridor Floor Offset',   path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_floor_custom_import',       label: 'Floor (custom)',           path: '/floor.png',                                                        category: 'floor' },
    { key: 'floor_attachment',               label: 'Floor Attachment',         path: '/floor_attachment.png',                                             category: 'floor' },
    { key: 'tile_floor_hadleys_gen',         label: "Hadley's Floor",           path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_floor_hadleys_a_gen',       label: "Hadley's Floor A",         path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_floor_hadleys_b_gen',       label: "Hadley's Floor B",         path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_floor_hadleys_c_gen',       label: "Hadley's Floor C",         path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                                   category: 'floor' },
    { key: 'tile_wall_corridor_import',      label: 'Corridor Wall',            path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                                    category: 'wall' },
    { key: 'tile_wall_hadleys_gen',          label: "Hadley's Wall",            path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                                    category: 'wall' },
    { key: 'tile_wall_hadleys_a_gen',        label: "Hadley's Wall A",          path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                                    category: 'wall' },
    { key: 'tile_wall_hadleys_b_gen',        label: "Hadley's Wall B",          path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                                    category: 'wall' },
    { key: 'prop_desk',                      label: 'Desk',                     path: EDITOR_PLACEHOLDER_PREVIEWS.prop,                                    category: 'prop' },
    { key: 'prop_lamp',                      label: 'Lamp',                     path: EDITOR_PLACEHOLDER_PREVIEWS.prop,                                    category: 'prop' },
    { key: 'alien_spawn',                    label: 'Alien Spawn Point',        path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'prop' },
    { key: 'zone_colony',                    label: 'Zone: Colony',             path: EDITOR_PLACEHOLDER_PREVIEWS.zone,                                    category: 'zone' },
    { key: 'zone_damaged',                   label: 'Zone: Damaged',            path: EDITOR_PLACEHOLDER_PREVIEWS.zone,                                    category: 'zone' },
    { key: 'zone_hive',                      label: 'Zone: Hive',               path: EDITOR_PLACEHOLDER_PREVIEWS.zone,                                    category: 'zone' },
    { key: 'alien_warrior',                  label: 'Warrior',                  path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
    { key: 'alien_drone',                    label: 'Drone',                    path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
    { key: 'alien_runner',                   label: 'Runner',                   path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
    { key: 'alien_spitter',                  label: 'Spitter',                  path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
    { key: 'alien_egg',                      label: 'Egg',                      path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
    { key: 'alien_facehugger',               label: 'Facehugger',               path: '/src/graphics/fhugger.png',                                         category: 'alien' },
    { key: 'alien_queen',                    label: 'Queen',                    path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                                   category: 'alien' },
];

const assetByKey = {};
for (const a of ASSET_MANIFEST) assetByKey[a.key] = a;

const PROP_PRESETS = ASSET_MANIFEST.filter((asset) => asset.category === 'prop').slice(0, 4);

// Sprite scale catalog: every visual game element with source image path,
// source pixel size, and in-game display size for the Scale Preview panel.
const SPRITE_SCALE_CATALOG = [
    // ─── Characters ───
    { key: 'marine_leader',    label: 'Team Leader',       path: EDITOR_PLACEHOLDER_PREVIEWS.character,                   srcW: 64,  srcH: 64,  gameW: 60,  gameH: 60,  category: 'character' },
    { key: 'marine_follower',  label: 'Marine Follower',    path: EDITOR_PLACEHOLDER_PREVIEWS.character,                   srcW: 64,  srcH: 64,  gameW: 60,  gameH: 60,  category: 'character' },
    // ─── Enemies ───
    { key: 'alien_warrior',    label: 'Warrior',            path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 56,  gameH: 56,  category: 'enemy',  note: 'Placeholder preview — authored runtime sprite' },
    { key: 'alien_drone',      label: 'Drone',              path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 56,  gameH: 56,  category: 'enemy',  note: 'Placeholder preview — authored runtime sprite' },
    { key: 'alien_runner',     label: 'Runner',             path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 56,  gameH: 56,  category: 'enemy',  note: 'Placeholder preview' },
    { key: 'alien_spitter',    label: 'Spitter',            path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 56,  gameH: 56,  category: 'enemy',  note: 'Placeholder preview' },
    { key: 'alien_facehugger', label: 'Facehugger',         path: EDITOR_PLACEHOLDER_PREVIEWS.facehugger,                  srcW: 32,  srcH: 32,  gameW: 6,   gameH: 6,   category: 'enemy',  note: '0.20× scale' },
    { key: 'alien_egg',        label: 'Egg',                path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 42,  gameH: 42,  category: 'enemy',  note: 'Placeholder preview — authored art pending' },
    { key: 'alien_queen_lesser', label: 'Lesser Queen',     path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 46,  gameH: 46,  category: 'enemy',  note: 'Placeholder preview — authored art pending' },
    { key: 'alien_queen',      label: 'Queen',              path: EDITOR_PLACEHOLDER_PREVIEWS.alien,                       srcW: 32,  srcH: 32,  gameW: 58,  gameH: 58,  category: 'enemy',  note: 'Placeholder preview — authored art pending' },
    // ─── Props / Objects ───
    { key: 'prop_desk',        label: 'Desk',               path: EDITOR_PLACEHOLDER_PREVIEWS.prop,                        srcW: 128, srcH: 64,  gameW: 64,  gameH: 64,  category: 'object', note: 'Placeholder preview — authored art pending' },
    { key: 'prop_lamp',        label: 'Lamp',               path: EDITOR_PLACEHOLDER_PREVIEWS.prop,                        srcW: 32,  srcH: 32,  gameW: 64,  gameH: 64,  category: 'object', note: 'Placeholder preview — authored art pending' },
    // ─── Tiles / Environment ───
    { key: 'tile_floor_grill',   label: 'Corridor Floor',   path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                       srcW: 64, srcH: 64, gameW: 64, gameH: 64, category: 'environment', note: 'Placeholder preview — authored art pending' },
    { key: 'tile_wall_corridor', label: 'Corridor Wall',    path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                        srcW: 64, srcH: 64, gameW: 64, gameH: 64, category: 'environment', note: 'Placeholder preview — authored art pending' },
    { key: 'tile_floor_hadleys', label: "Hadley's Floor",   path: EDITOR_PLACEHOLDER_PREVIEWS.floor,                       srcW: 64,  srcH: 64,  gameW: 64,  gameH: 64,  category: 'environment', note: 'Placeholder preview — authored art pending' },
    { key: 'tile_wall_hadleys',  label: "Hadley's Wall",    path: EDITOR_PLACEHOLDER_PREVIEWS.wall,                        srcW: 64,  srcH: 64,  gameW: 64,  gameH: 64,  category: 'environment', note: 'Placeholder preview — authored art pending' },
    // ─── Projectiles ───
    { key: 'bullet_pulse',     label: 'Pulse Rifle Bullet', path: EDITOR_PLACEHOLDER_PREVIEWS.projectile,                  srcW: 16,  srcH: 6,   gameW: 16,  gameH: 6,   category: 'projectile', note: 'Placeholder preview — procedural at runtime' },
    { key: 'bullet_shotgun',   label: 'Shotgun Pellet',     path: EDITOR_PLACEHOLDER_PREVIEWS.projectile,                  srcW: 12,  srcH: 4,   gameW: 12,  gameH: 4,   category: 'projectile', note: 'Placeholder preview — procedural at runtime' },
    // ─── Doors ───
    { key: 'door_horizontal',  label: 'Door (H)',           path: EDITOR_PLACEHOLDER_PREVIEWS.object,                      srcW: 64,  srcH: 64,  gameW: 64,  gameH: 32,  category: 'object', note: 'Placeholder preview — procedural at runtime' },
    { key: 'door_vertical',    label: 'Door (V)',           path: EDITOR_PLACEHOLDER_PREVIEWS.object,                      srcW: 64,  srcH: 64,  gameW: 32,  gameH: 64,  category: 'object', note: 'Placeholder preview — procedural at runtime' },
];

function createGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

// Build editor-default tilemaps from the canonical game templates (104×70).
// Deep-cloning via JSON ensures mutable, non-frozen copies the editor can paint on.
function createDefaultTilemaps() {
    const sourceTemplates = Array.isArray(TILED_MAP_TEMPLATES) && TILED_MAP_TEMPLATES.length > 0
        ? TILED_MAP_TEMPLATES
        : TILEMAP_TEMPLATES;
    return sourceTemplates.map((t) => JSON.parse(JSON.stringify(t)));
}

function defaultGameConfig() {
    return {
        weapons: {},
        enemies: {},
        squad: {
            size: 4,
            leaderHealth: 100,
            followerHealth: 100,
            leaderSpeed: 180,
            followerSpeed: 220,
            reactionDelayMs: 90,
        },
        global: {
            torchRange: 470,
            torchConeHalfAngle: 0.65,
            motionTrackerRange: 420,
            doorHackDuration: 3000,
            doorLockDuration: 3000,
            doorWeldDuration: 4000,
            doorUnweldDuration: 3000,
        },
    };
}

function defaultState() {
    const frame = createGrid(16, 16, -1);
    for (let y = 4; y < 12; y++) {
        for (let x = 5; x < 11; x++) {
            frame[y][x] = 2;
        }
    }
    return {
        sprite: {
            width: 16,
            height: 16,
            pixelSize: 24,
            palette: ['#00000000', '#e9f0f6', '#67a8ff', '#ff6f5f', '#9be092', '#ffd37a', '#7ddfd4', '#bf9dff'],
            activeColor: 2,
            tool: 'pen',
            onionSkin: false,
            originX: 8,
            originY: 8,
            frames: [frame],
            currentFrame: 0,
        },
        animations: [
            { id: 'anim_idle', name: 'marine_idle', fps: 6, loop: true, frames: [0] },
            { id: 'anim_move', name: 'marine_move', fps: 12, loop: true, frames: [0] },
        ],
        tilemaps: createDefaultTilemaps(),
        missions: [
            {
                id: 'm1', name: 'Mission 1: Cargo Concourse', mapId: 'lv1_colony_hub', objective: 'Reach elevator with access credentials',
                difficulty: 'normal', enemyBudget: 24, notes: 'Intro mission with basic doors',
                requiredCards: 1, requiredTerminals: 0,
                director: {
                    idlePressureBaseMs: 7600,
                    gunfireReinforceBaseMs: 5000,
                    reinforceCap: 14,
                    inactivityAmbushMs: 11000,
                    inactivityAmbushCooldownMs: 15000,
                },
            },
            {
                id: 'm2', name: 'Mission 2: Reactor Spine', mapId: 'lv2_reactor_spine', objective: 'Collect card then reactivate security terminal',
                difficulty: 'normal', enemyBudget: 32, notes: 'Adds pressure events',
                requiredCards: 1, requiredTerminals: 1,
                director: {
                    idlePressureBaseMs: 6900,
                    gunfireReinforceBaseMs: 4600,
                    reinforceCap: 16,
                    inactivityAmbushMs: 10000,
                    inactivityAmbushCooldownMs: 14200,
                },
            },
            {
                id: 'm3', name: 'Mission 3: Queen Cathedral', mapId: 'lv5_queen_cathedral', objective: 'Cross lockdown sectors and secure elevator route',
                difficulty: 'normal', enemyBudget: 40, notes: 'Long corridors and flanks',
                requiredCards: 1, requiredTerminals: 1,
                director: {
                    idlePressureBaseMs: 6200,
                    gunfireReinforceBaseMs: 4200,
                    reinforceCap: 20,
                    inactivityAmbushMs: 9000,
                    inactivityAmbushCooldownMs: 13000,
                },
            },
            {
                id: 'm4', name: 'Mission 4: Hydroponics Array', mapId: 'lv6_hydroponics_array', objective: 'Collect two cards and route power to elevator',
                difficulty: 'normal', enemyBudget: 46, notes: 'Vertical ambush pressure',
                requiredCards: 2, requiredTerminals: 1,
                director: {
                    idlePressureBaseMs: 5600,
                    gunfireReinforceBaseMs: 3800,
                    reinforceCap: 24,
                    inactivityAmbushMs: 8200,
                    inactivityAmbushCooldownMs: 11800,
                },
            },
            {
                id: 'm5', name: 'Mission 5: Docking Ring', mapId: 'lv9_docking_ring', objective: 'Unlock ring sectors and board freight elevator',
                difficulty: 'hard', enemyBudget: 56, notes: 'Finale with breach threats',
                requiredCards: 2, requiredTerminals: 2,
                director: {
                    idlePressureBaseMs: 5200,
                    gunfireReinforceBaseMs: 3400,
                    reinforceCap: 28,
                    inactivityAmbushMs: 7600,
                    inactivityAmbushCooldownMs: 10800,
                },
            },
        ],
        directorEvents: [
            { id: 'evt_intro_pressure', missionId: 'm1', trigger: 'time:20', action: 'spawn_pack', params: { size: 3, type: 'warrior', source: 'idle', textCue: 'CONTACT INBOUND' } },
            { id: 'evt_wave2_push', missionId: 'm2', trigger: 'wave:2', action: 'spawn_pack', params: { size: 4, source: 'gunfire' } },
            { id: 'evt_m2_tracker_check', missionId: 'm2', trigger: 'time:35', action: 'trigger_tracker', params: { role: 'tech' } },
            { id: 'evt_midfight_breach_warning', missionId: 'm3', trigger: 'pressure:0.72', action: 'door_thump', params: { word: 'THUMP!!', dir: 'S' } },
            { id: 'evt_m3_edge_noise', missionId: 'm3', trigger: 'time:45', action: 'edge_cue', params: { word: 'VENT NOISE', dir: 'E' } },
            { id: 'evt_m3_blackout_push', missionId: 'm3', trigger: 'pressure:0.78', action: 'set_lighting', params: { ambientDarkness: 0.62, torchRange: 290 } },
            { id: 'evt_objective_relief', missionId: 'm4', trigger: 'objective:1', action: 'set_pressure_grace', params: { ms: 1800 } },
            { id: 'evt_m4_relief_caps', missionId: 'm4', trigger: 'objective:1', action: 'set_reinforce_caps', params: { idle: 4, gunfire: 7 } },
            { id: 'evt_m4_regroup_posture', missionId: 'm4', trigger: 'objective:1', action: 'set_combat_mods', params: { marineAccuracyMul: 1.12, marineJamMul: 0.82, ms: 7000 } },
            { id: 'evt_extract_lockdown', missionId: 'm5', trigger: 'stage:extract', action: 'door_action', params: { op: 'weld', dir: 'N' } },
            { id: 'evt_m5_queen_reveal', missionId: 'm5', trigger: 'pressure:0.8', action: 'spawn_queen', params: { type: 'queenLesser' } },
        ],
        audioCues: [
            { id: 'cue_motion_near', textCue: 'BEEP', priority: 5 },
            { id: 'cue_tracker_active', textCue: 'BEEP', priority: 5 },
            { id: 'cue_swarm_close', textCue: 'SWARM CLOSE', priority: 6 },
            { id: 'cue_door_thump', textCue: 'THUMP!!', priority: 7 },
            { id: 'cue_door_breach', textCue: 'BREACH!!', priority: 8 },
        ],
    };
}

function clone(data) {
    return JSON.parse(JSON.stringify(data));
}

async function loadState() {
    try {
        const res = await fetch('/api/editor-state');
        if (!res.ok) return defaultState();
        const json = await res.json();
        if (json && json.state) {
            return mergeWithDefaults(json.state);
        }
        return defaultState();
    } catch {
        return defaultState();
    }
}

const DEFAULT_TEMPLATE_IDS = new Set(
    createDefaultTilemaps().map((t) => String(t.id))
);

function mergeWithDefaults(loaded) {
    const d = defaultState();
    // Migrate any stale small maps (old 40×26 format) that have a default template ID.
    const freshTemplates = createDefaultTilemaps();
    const tilemaps = Array.isArray(loaded.tilemaps) && loaded.tilemaps.length > 0
        ? loaded.tilemaps.map((raw) => {
            const m = normalizeTilemapShape(raw);
            if (DEFAULT_TEMPLATE_IDS.has(m.id) && (m.width < 100 || m.height < 60)) {
                const fresh = freshTemplates.find((t) => t.id === m.id);
                if (fresh) return fresh;
            }
            return m;
        })
        : d.tilemaps.map((m) => clone(m));
    const mapIdSet = new Set(tilemaps.map((m) => String(m.id)));
    const fallbackMapId = tilemaps[0]?.id || d.tilemaps[0].id;
    const missions = Array.isArray(loaded.missions) && loaded.missions.length > 0
        ? loaded.missions.map((m, idx) => {
            const base = d.missions[idx % d.missions.length];
            const mapId = mapIdSet.has(String(m?.mapId)) ? String(m.mapId) : fallbackMapId;
            return {
                ...base,
                ...(m || {}),
                requiredCards: Math.max(0, Math.floor(Number(m?.requiredCards ?? base.requiredCards) || 0)),
                requiredTerminals: Math.max(0, Math.floor(Number(m?.requiredTerminals ?? base.requiredTerminals) || 0)),
                mapId,
            };
        })
        : d.missions.map((m) => clone(m));
    return {
        sprite: { ...d.sprite, ...(loaded.sprite || {}) },
        animations: Array.isArray(loaded.animations) && loaded.animations.length ? loaded.animations : d.animations,
        tilemaps,
        missions,
        directorEvents: Array.isArray(loaded.directorEvents)
            ? loaded.directorEvents.map((event, idx) => normalizeEditorMissionEvent(event, idx))
            : d.directorEvents.map((event, idx) => normalizeEditorMissionEvent(event, idx)),
        audioCues: Array.isArray(loaded.audioCues)
            ? loaded.audioCues.map((cue, idx) => normalizeEditorAudioCue(cue, idx))
            : d.audioCues.map((cue, idx) => normalizeEditorAudioCue(cue, idx)),
        gameConfig: loaded.gameConfig && typeof loaded.gameConfig === 'object'
            ? loaded.gameConfig
            : defaultGameConfig(),
        ...(Array.isArray(loaded.nodeGraphs) ? { nodeGraphs: loaded.nodeGraphs } : {}),
        ...(loaded.missionGraph && typeof loaded.missionGraph === 'object' ? { missionGraph: loaded.missionGraph } : {}),
    };
}

const MISSION_TRIGGER_OPTIONS = Object.freeze([
    { value: 'always', label: 'Mission Start', needsValue: false, placeholder: '' },
    { value: 'time', label: 'Elapsed Time', needsValue: true, placeholder: 'seconds' },
    { value: 'wave', label: 'Wave Reached', needsValue: true, placeholder: 'wave #' },
    { value: 'pressure', label: 'Pressure Threshold', needsValue: true, placeholder: '0.0 - 1.0' },
    { value: 'kills', label: 'Kill Count', needsValue: true, placeholder: 'kills' },
    { value: 'objective', label: 'Objective Count', needsValue: true, placeholder: 'completed objectives' },
    { value: 'stage', label: 'Mission Stage', needsValue: true, placeholder: 'combat / extract' },
]);

const MISSION_ACTION_LIBRARY = Object.freeze({
    spawn_pack: {
        label: 'Spawn Surge',
        category: 'spawns',
        description: 'Inject a pack from idle, gunfire, or edge direction.',
        fields: ['size', 'type', 'source', 'dir', 'textCue'],
    },
    set_reinforce_caps: {
        label: 'Reinforcement Policy',
        category: 'pressure',
        description: 'Raise, lower, or zero idle/gunfire reinforcement caps.',
        fields: ['idle', 'gunfire', 'total', 'textCue'],
    },
    set_pressure_grace: {
        label: 'Pressure Relief Window',
        category: 'pressure',
        description: 'Pause pressure escalation for a defined number of milliseconds.',
        fields: ['ms', 'textCue'],
    },
    set_lighting: {
        label: 'Lighting Shift',
        category: 'lighting',
        description: 'Shift ambience, beam softness, and glow tuning.',
        fields: ['ambientDarkness', 'torchRange', 'torchConeHalfAngle', 'softRadius', 'coreAlpha', 'featherLayers', 'featherSpread', 'featherDecay', 'glowStrength', 'textCue'],
    },
    door_action: {
        label: 'Door Control',
        category: 'doors',
        description: 'Open, close, lock, weld, or release a directional gate.',
        fields: ['op', 'dir', 'textCue'],
    },
    trigger_tracker: {
        label: 'Tracker Check',
        category: 'tracking',
        description: 'Request a tracker read from a specific marine role.',
        fields: ['role', 'textCue'],
    },
    set_combat_mods: {
        label: 'Combat Modifier Window',
        category: 'combat',
        description: 'Temporarily bias marine or alien combat behavior.',
        fields: ['marineAccuracyMul', 'marineJamMul', 'enemyAggressionMul', 'ms', 'textCue'],
    },
    text_cue: {
        label: 'Narrative Cue',
        category: 'narrative',
        description: 'Show a briefing, bark, or warning text cue.',
        fields: ['textCue', 'cueId', 'color'],
    },
    edge_cue: {
        label: 'Edge Cue',
        category: 'narrative',
        description: 'Flash a directional environmental cue at the edge of the screen.',
        fields: ['word', 'dir', 'color'],
    },
    spawn_queen: {
        label: 'Boss Reveal',
        category: 'spawns',
        description: 'Escalate with a queen-class contact reveal.',
        fields: ['type', 'textCue'],
    },
});

const MISSION_EVENT_FIELD_LIBRARY = Object.freeze({
    size: { label: 'Pack Size', type: 'number', min: 1 },
    type: { label: 'Type', type: 'text', placeholder: 'warrior / drone / queenLesser' },
    source: { label: 'Source', type: 'text', placeholder: 'idle / gunfire / edge' },
    dir: { label: 'Direction', type: 'text', placeholder: 'N / S / E / W' },
    textCue: { label: 'Text Cue', type: 'text', placeholder: 'CONTACT INBOUND' },
    idle: { label: 'Idle Cap', type: 'number', min: 0 },
    gunfire: { label: 'Gunfire Cap', type: 'number', min: 0 },
    total: { label: 'Total Cap', type: 'number', min: 0 },
    ms: { label: 'Duration MS', type: 'number', min: 0 },
    ambientDarkness: { label: 'Ambient', type: 'number', min: 0.45, max: 1, step: 0.01 },
    torchRange: { label: 'Torch Range', type: 'number', min: 80, max: 1400, step: 10 },
    torchConeHalfAngle: { label: 'Torch Cone', type: 'number', min: 0.1, max: 1.2, step: 0.01 },
    softRadius: { label: 'Soft Radius', type: 'number', min: 10, max: 600, step: 1 },
    coreAlpha: { label: 'Core Alpha', type: 'number', min: 0, max: 1, step: 0.01 },
    featherLayers: { label: 'Feather Layers', type: 'number', min: 4, max: 24, step: 1 },
    featherSpread: { label: 'Feather Spread', type: 'number', min: 0.4, max: 2.5, step: 0.01 },
    featherDecay: { label: 'Feather Decay', type: 'number', min: 0.2, max: 0.95, step: 0.01 },
    glowStrength: { label: 'Glow Strength', type: 'number', min: 0.1, max: 2, step: 0.01 },
    op: { label: 'Door Op', type: 'text', placeholder: 'open / close / lock / weld' },
    role: { label: 'Role', type: 'text', placeholder: 'tech / medic / heavy / leader' },
    marineAccuracyMul: { label: 'Marine Acc', type: 'number', min: 0, max: 3, step: 0.01 },
    marineJamMul: { label: 'Marine Jam', type: 'number', min: 0, max: 3, step: 0.01 },
    enemyAggressionMul: { label: 'Alien Aggro', type: 'number', min: 0, max: 3, step: 0.01 },
    cueId: { label: 'Cue ID', type: 'text', placeholder: 'cue_door_breach' },
    color: { label: 'Color', type: 'text', placeholder: '#a9d8ff' },
    word: { label: 'Word', type: 'text', placeholder: 'THUMP!!' },
});

function buildMissionEventId(prefix = 'evt_gui') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function getMissionActionMeta(action = '') {
    return MISSION_ACTION_LIBRARY[String(action || '').trim()] || MISSION_ACTION_LIBRARY.text_cue;
}

function parseMissionTrigger(triggerRaw = 'time:20') {
    const raw = String(triggerRaw || 'time:20').trim();
    if (!raw || raw === 'always') return { kind: 'always', value: '' };
    const [kindRaw, valueRaw = ''] = raw.split(':', 2);
    const kind = MISSION_TRIGGER_OPTIONS.some((item) => item.value === kindRaw) ? kindRaw : 'time';
    return { kind, value: kind === 'always' ? '' : valueRaw };
}

function normalizeEditorMissionEvent(event, idx = 0) {
    const src = event && typeof event === 'object' ? event : {};
    const actionRaw = String(src.action || '').trim();
    const action = Object.prototype.hasOwnProperty.call(MISSION_ACTION_LIBRARY, actionRaw) ? actionRaw : 'text_cue';
    const trigger = parseMissionTrigger(src.trigger || 'time:20');
    const params = src.params && typeof src.params === 'object' ? clone(src.params) : {};
    const meta = getMissionActionMeta(action);
    const repeatMs = Number(src.repeatMs ?? params.repeatMs);
    const cooldownMs = Number(src.cooldownMs ?? src.retryMs ?? params.retryMs);
    const maxFires = Number(src.maxFires ?? params.maxFires);
    const chance = Number(src.chance ?? params.chance);
    return {
        id: String(src.id || `evt_${idx + 1}`),
        label: String(src.label || meta.label || `Event ${idx + 1}`),
        category: String(src.category || meta.category || 'systems'),
        enabled: src.enabled !== false,
        notes: String(src.notes || ''),
        missionId: String(src.missionId || src.mission || 'all'),
        trigger: trigger.kind === 'always' ? 'always' : `${trigger.kind}:${trigger.value || '1'}`,
        action,
        chance: Number.isFinite(chance) ? clamp(chance, 0, 100) : 100,
        cooldownMs: Number.isFinite(cooldownMs) ? Math.max(0, Math.round(cooldownMs)) : 600,
        repeatMs: Number.isFinite(repeatMs) && repeatMs > 0 ? Math.round(repeatMs) : '',
        maxFires: Number.isFinite(maxFires) && maxFires > 0 ? Math.round(maxFires) : '',
        params,
    };
}

function normalizeEditorAudioCue(cue, idx = 0) {
    const src = cue && typeof cue === 'object' ? cue : {};
    return {
        id: String(src.id || `cue_${idx + 1}`),
        missionId: String(src.missionId || src.mission || 'all'),
        textCue: String(src.textCue || ''),
        priority: Number.isFinite(Number(src.priority)) ? clamp(Math.round(Number(src.priority)), 0, 10) : 0,
    };
}

function applyMissionPackageToState(pkg) {
    const d = defaultState();
    const normalized = normalizeMissionPackage(pkg);
    const shapeErrors = validateMissionPackageShape(normalized);
    if (shapeErrors.length) {
        throw new Error(shapeErrors[0]);
    }

    const maps = normalized.maps.map(normalizeTilemapShape);
    if (maps.length === 0) {
        for (const fallbackMap of d.tilemaps) {
            maps.push(clone(fallbackMap));
        }
    }

    const missions = normalized.missions.slice(0, 5).map((m, idx) => ({
        id: m.id || d.missions[idx]?.id || `m${idx + 1}`,
        name: m.name || d.missions[idx]?.name || `Mission ${idx + 1}`,
        mapId: maps.some((tm) => tm.id === m.mapId) ? m.mapId : maps[0].id,
        objective: m.objective || '',
        difficulty: ['normal', 'hard', 'extreme'].includes(m.difficulty) ? m.difficulty : 'normal',
        enemyBudget: clamp(Number(m.enemyBudget) || 0, 0, 999),
        requiredCards: Math.max(0, Math.floor(Number(m.requiredCards ?? d.missions[idx]?.requiredCards) || 0)),
        requiredTerminals: Math.max(0, Math.floor(Number(m.requiredTerminals ?? d.missions[idx]?.requiredTerminals) || 0)),
        notes: m.notes || '',
        director: {
            ...(d.missions[idx]?.director || {}),
            ...(m.director && typeof m.director === 'object' ? m.director : {}),
        },
    }));
    while (missions.length < 5) {
        const fallback = clone(d.missions[missions.length]);
        fallback.mapId = maps[Math.min(missions.length % maps.length, maps.length - 1)].id;
        missions.push(fallback);
    }

    state.tilemaps = maps;
    state.missions = missions;
    state.directorEvents = Array.isArray(normalized.directorEvents)
        ? normalized.directorEvents.map((event, idx) => normalizeEditorMissionEvent(event, idx))
        : [];
    state.audioCues = Array.isArray(normalized.audioCues)
        ? normalized.audioCues.map((cue, idx) => normalizeEditorAudioCue(cue, idx))
        : [];
    activeMapIndex = clamp(activeMapIndex, 0, Math.max(0, state.tilemaps.length - 1));
}

function normalizeTilemapShape(mapLike) {
    const width = clamp(Math.round(Number(mapLike.width) || 40), 8, 256);
    const height = clamp(Math.round(Number(mapLike.height) || 26), 8, 256);
    const terrainFill = 1;
    const doorsFill = 0;
    const markersFill = 0;
    // Normalize terrainTextures: 2D grid of string|null, null = use map-level default
    const blankTexGrid = () => Array.from({ length: height }, () => Array(width).fill(null));
    let terrainTextures = blankTexGrid();
    if (Array.isArray(mapLike.terrainTextures)) {
        for (let y = 0; y < Math.min(height, mapLike.terrainTextures.length); y++) {
            if (!Array.isArray(mapLike.terrainTextures[y])) continue;
            for (let x = 0; x < Math.min(width, mapLike.terrainTextures[y].length); x++) {
                const v = mapLike.terrainTextures[y][x];
                terrainTextures[y][x] = (typeof v === 'string' && v.length > 0) ? v : null;
            }
        }
    }

    return {
        id: String(mapLike.id || `map_${Date.now()}`),
        name: String(mapLike.name || mapLike.id || 'Map'),
        width,
        height,
        terrain: coerceLayerGrid(mapLike.terrain, width, height, terrainFill),
        doors: coerceLayerGrid(mapLike.doors, width, height, doorsFill),
        markers: coerceLayerGrid(mapLike.markers, width, height, markersFill),
        floorTextureKey: String(mapLike.floorTextureKey || 'tile_floor_grill_import'),
        wallTextureKey: String(mapLike.wallTextureKey || 'tile_wall_corridor_import'),
        terrainTextures,
        props: Array.isArray(mapLike.props) ? mapLike.props
            .filter((p) => p && typeof p.tileX === 'number' && typeof p.tileY === 'number')
            .map((p) => ({
                id: String(p.id || makePropId()),
                tileX: Math.round(Number(p.tileX)),
                tileY: Math.round(Number(p.tileY)),
                type: String(p.type || 'prop'),
                imageKey: String(p.imageKey || ''),
                radius: typeof p.radius === 'number' ? p.radius : 18,
                rotation: typeof p.rotation === 'number' ? p.rotation : 0,
            })) : [],
        lights: Array.isArray(mapLike.lights) ? mapLike.lights
            .filter((l) => l && typeof l.tileX === 'number' && typeof l.tileY === 'number')
            .map((l) => ({
                id: String(l.id || makePropId()),
                tileX: Math.round(Number(l.tileX)),
                tileY: Math.round(Number(l.tileY)),
                type: String(l.type || 'spot'),
                color: String(l.color || '#ffffff'),
                radius: typeof l.radius === 'number' ? l.radius : 240,
                brightness: typeof l.brightness === 'number' ? l.brightness : (typeof l.intensity === 'number' ? l.intensity : 0.5),
                flickering: !!l.flickering,
                pulsing: !!l.pulsing,
            })) : [],
        storyPoints: Array.isArray(mapLike.storyPoints) ? mapLike.storyPoints
            .filter((sp) => sp && typeof sp.tileX === 'number' && typeof sp.tileY === 'number')
            .map((sp) => ({
                id: String(sp.id || makePropId()),
                tileX: Math.round(Number(sp.tileX)),
                tileY: Math.round(Number(sp.tileY)),
                title: String(sp.title || 'Story Beat'),
                note: String(sp.note || ''),
                kind: String(sp.kind || 'story'),
                missionId: String(sp.missionId || 'all'),
            })) : [],
        atmosphere: {
            ambientDarkness: typeof mapLike.atmosphere?.ambientDarkness === 'number' ? mapLike.atmosphere.ambientDarkness : 0.82,
            torchRange: typeof mapLike.atmosphere?.torchRange === 'number' ? mapLike.atmosphere.torchRange : 560,
            dustDensity: typeof mapLike.atmosphere?.dustDensity === 'number' ? mapLike.atmosphere.dustDensity : 0.5,
            ventHum: typeof mapLike.atmosphere?.ventHum === 'boolean' ? mapLike.atmosphere.ventHum : true,
            pipeGroans: typeof mapLike.atmosphere?.pipeGroans === 'boolean' ? mapLike.atmosphere.pipeGroans : true,
            distantThumps: typeof mapLike.atmosphere?.distantThumps === 'boolean' ? mapLike.atmosphere.distantThumps : true,
            alienChittering: typeof mapLike.atmosphere?.alienChittering === 'boolean' ? mapLike.atmosphere.alienChittering : true,
        },
        largeTextures: Array.isArray(mapLike.largeTextures) ? mapLike.largeTextures
            .filter(lt => lt && typeof lt.tileX === 'number' && typeof lt.tileY === 'number')
            .map(lt => ({
                id: String(lt.id || 'lt_' + Date.now() + '_' + Math.floor(Math.random() * 9999)),
                imageKey: String(lt.imageKey || ''),
                tileX: Math.round(Number(lt.tileX)),
                tileY: Math.round(Number(lt.tileY)),
                widthTiles: Math.max(1, Math.round(Number(lt.widthTiles) || 2)),
                heightTiles: Math.max(1, Math.round(Number(lt.heightTiles) || 2)),
                depth: typeof lt.depth === 'number' ? lt.depth : 1,
                opacity: typeof lt.opacity === 'number' ? Math.max(0, Math.min(1, lt.opacity)) : 1,
            })) : [],
    };
}

function coerceLayerGrid(layer, width, height, fill = 0) {
    const out = createGrid(width, height, fill);
    if (!Array.isArray(layer)) return out;
    for (let y = 0; y < Math.min(height, layer.length); y++) {
        if (!Array.isArray(layer[y])) continue;
        for (let x = 0; x < Math.min(width, layer[y].length); x++) {
            const n = Number(layer[y][x]);
            out[y][x] = Number.isFinite(n) ? Math.round(n) : fill;
        }
    }
    return out;
}

const TILED_TILE_SIZE = 64;
const TILED_TERRAIN_TILECOUNT = 4;
const TILED_DOOR_VALUE_MAP = {
    1: { type: 'standard', initialState: 'closed' },
    2: { type: 'electronic', initialState: 'closed' },
    3: { type: 'electronic', initialState: 'locked' },
    4: { type: 'standard', initialState: 'welded' },
};
const TILED_DOOR_REVERSE = {
    'standard|closed': 1,
    'electronic|closed': 2,
    'electronic|locked': 3,
    'standard|welded': 4,
};
const TILED_MARKER_VALUE_MAP = {
    1: 'spawn',
    2: 'extraction',
    3: 'terminal',
    4: 'security_card',
    5: 'alien_spawn',
    6: 'warning_strobe',
    7: 'vent_point',
    8: 'egg_cluster',
};
const TILED_MARKER_REVERSE = {
    spawn: 1,
    extraction: 2,
    terminal: 3,
    objective: 3,
    security_card: 4,
    queen_marker: 4,
    alien_spawn: 5,
    warning_strobe: 6,
    vent_point: 7,
    egg_cluster: 8,
};
const SINGLE_INSTANCE_MARKERS = new Set([1, 2]);

function getTiledProperty(obj, name) {
    if (!Array.isArray(obj?.properties)) return undefined;
    for (let i = obj.properties.length - 1; i >= 0; i--) {
        const prop = obj.properties[i];
        if (prop?.name === name) return prop.value;
    }
    return undefined;
}

function makeTiledProperty(name, type, value) {
    return { name, type, value };
}

function collectDoorComponents(doorGrid) {
    const h = doorGrid.length;
    const w = (doorGrid[0] || []).length;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const groups = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const value = doorGrid[y]?.[x] || 0;
            if (value <= 0 || visited[y][x]) continue;
            const queue = [{ x, y }];
            visited[y][x] = true;
            const tiles = [];
            while (queue.length > 0) {
                const cur = queue.shift();
                tiles.push(cur);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (visited[ny][nx] || doorGrid[ny]?.[nx] !== value) continue;
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }
            groups.push({ value, tiles });
        }
    }
    return groups;
}

function buildTiledMapFromEditorMap(map) {
    const width = Number(map?.width) || 0;
    const height = Number(map?.height) || 0;
    const terrainData = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            terrainData.push(((Number(map?.terrain?.[y]?.[x]) || 0) + 1));
        }
    }

    const doorObjects = collectDoorComponents(Array.isArray(map?.doors) ? map.doors : []).map((group, index) => {
        const def = TILED_DOOR_VALUE_MAP[group.value] || TILED_DOOR_VALUE_MAP[1];
        const xs = group.tiles.map((t) => t.x);
        const ys = group.tiles.map((t) => t.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const isHorizontal = (maxX - minX) >= (maxY - minY);
        return {
            id: index + 1,
            name: `door_${index + 1}`,
            type: 'door',
            x: minX * TILED_TILE_SIZE,
            y: minY * TILED_TILE_SIZE,
            width: (maxX - minX + 1) * TILED_TILE_SIZE,
            height: (maxY - minY + 1) * TILED_TILE_SIZE,
            rotation: 0,
            visible: true,
            properties: [
                makeTiledProperty('doorType', 'string', def.type),
                makeTiledProperty('initialState', 'string', def.initialState),
                makeTiledProperty('orientation', 'string', isHorizontal ? 'horizontal' : 'vertical'),
                makeTiledProperty('doorValue', 'int', group.value),
            ],
        };
    });

    const markerObjects = [];
    let nextObjectId = doorObjects.length + 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const markerValue = Number(map?.markers?.[y]?.[x]) || 0;
            if (markerValue <= 0) continue;
            markerObjects.push({
                id: nextObjectId++,
                name: TILED_MARKER_VALUE_MAP[markerValue] || `marker_${markerValue}`,
                type: TILED_MARKER_VALUE_MAP[markerValue] || `marker_${markerValue}`,
                x: x * TILED_TILE_SIZE,
                y: y * TILED_TILE_SIZE,
                width: TILED_TILE_SIZE,
                height: TILED_TILE_SIZE,
                rotation: 0,
                visible: true,
                properties: [makeTiledProperty('markerValue', 'int', markerValue)],
            });
        }
    }

    const textureObjects = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const imageKey = typeof map?.terrainTextures?.[y]?.[x] === 'string'
                ? map.terrainTextures[y][x].trim()
                : '';
            if (!imageKey) continue;
            textureObjects.push({
                id: nextObjectId++,
                name: `tex_${x}_${y}`,
                type: 'terrain_texture',
                x: x * TILED_TILE_SIZE,
                y: y * TILED_TILE_SIZE,
                width: TILED_TILE_SIZE,
                height: TILED_TILE_SIZE,
                rotation: 0,
                visible: true,
                properties: [makeTiledProperty('imageKey', 'string', imageKey)],
            });
        }
    }

    const propObjects = (Array.isArray(map?.props) ? map.props : [])
        .filter((prop) => Number.isFinite(Number(prop?.tileX)) && Number.isFinite(Number(prop?.tileY)))
        .map((prop) => ({
            id: nextObjectId++,
            name: String(prop.id || `prop_${prop.tileX}_${prop.tileY}`),
            type: 'prop',
            x: Math.round(Number(prop.tileX)) * TILED_TILE_SIZE,
            y: Math.round(Number(prop.tileY)) * TILED_TILE_SIZE,
            width: TILED_TILE_SIZE,
            height: TILED_TILE_SIZE,
            rotation: Number(prop.rotation) || 0,
            visible: true,
            properties: [
                makeTiledProperty('imageKey', 'string', String(prop.imageKey || '')),
                makeTiledProperty('propType', 'string', String(prop.type || 'prop')),
                makeTiledProperty('radius', 'float', Math.max(0, Number(prop.radius) || 18)),
                ...(prop.type === 'alien_spawn' ? [makeTiledProperty('count', 'int', Number(prop.count) || 4)] : []),
            ],
        }));

    const lightObjects = (Array.isArray(map?.lights) ? map.lights : [])
        .filter((light) => Number.isFinite(Number(light?.tileX)) && Number.isFinite(Number(light?.tileY)))
        .map((light) => ({
            id: nextObjectId++,
            name: String(light.id || `light_${light.tileX}_${light.tileY}`),
            type: 'light',
            x: Math.round(Number(light.tileX)) * TILED_TILE_SIZE,
            y: Math.round(Number(light.tileY)) * TILED_TILE_SIZE,
            width: TILED_TILE_SIZE,
            height: TILED_TILE_SIZE,
            rotation: 0,
            visible: true,
            properties: [
                makeTiledProperty('lightType', 'string', String(light.type || 'spot')),
                makeTiledProperty('color', 'string', String(light.color || '#ffffff')),
                makeTiledProperty('radius', 'float', Math.max(0, Number(light.radius) || 240)),
                makeTiledProperty('brightness', 'float', Math.max(0, Number(light.brightness) || 0.5)),
            ],
        }));

    return {
        compressionlevel: -1,
        height,
        width,
        infinite: false,
        orientation: 'orthogonal',
        renderorder: 'right-down',
        tiledversion: '1.11',
        tilewidth: TILED_TILE_SIZE,
        tileheight: TILED_TILE_SIZE,
        type: 'map',
        version: '1.10',
        layers: [
            {
                id: 1,
                name: 'terrain',
                type: 'tilelayer',
                data: terrainData,
                width,
                height,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
            },
            {
                id: 2,
                name: 'doors',
                type: 'objectgroup',
                objects: doorObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 3,
                name: 'markers',
                type: 'objectgroup',
                objects: markerObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 4,
                name: 'texture_overrides',
                type: 'objectgroup',
                objects: textureObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 5,
                name: 'props',
                type: 'objectgroup',
                objects: propObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 6,
                name: 'lights',
                type: 'objectgroup',
                objects: lightObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: 'aliens_tiles',
                tilewidth: TILED_TILE_SIZE,
                tileheight: TILED_TILE_SIZE,
                tilecount: TILED_TERRAIN_TILECOUNT,
                columns: TILED_TERRAIN_TILECOUNT,
                image: 'aliens_tileset.png',
                imagewidth: TILED_TILE_SIZE * TILED_TERRAIN_TILECOUNT,
                imageheight: TILED_TILE_SIZE,
                margin: 0,
                spacing: 0,
            },
        ],
        properties: [
            makeTiledProperty('templateId', 'string', String(map?.id || 'map')),
            makeTiledProperty('templateName', 'string', String(map?.name || map?.id || 'Map')),
            makeTiledProperty('floorTextureKey', 'string', String(map?.floorTextureKey || 'tile_floor_grill_import')),
            makeTiledProperty('wallTextureKey', 'string', String(map?.wallTextureKey || 'tile_wall_corridor_import')),
        ],
    };
}

function buildEditorMapFromTiledJson(tiledMap, fallbackMap = null) {
    const width = clamp(Math.round(Number(tiledMap?.width) || Number(fallbackMap?.width) || 40), 8, 256);
    const height = clamp(Math.round(Number(tiledMap?.height) || Number(fallbackMap?.height) || 26), 8, 256);
    const terrain = createGrid(width, height, 1);
    const doors = createGrid(width, height, 0);
    const markers = createGrid(width, height, 0);
    const terrainTextures = Array.from({ length: height }, () => Array(width).fill(null));
    const props = [];

    const terrainLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'terrain' && layer?.type === 'tilelayer')
        : null;
    if (Array.isArray(terrainLayer?.data)) {
        for (let i = 0; i < terrainLayer.data.length; i++) {
            const x = i % width;
            const y = Math.floor(i / width);
            if (y >= height) break;
            terrain[y][x] = Math.max(0, (Number(terrainLayer.data[i]) || 1) - 1);
        }
    }

    const doorLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'doors' && layer?.type === 'objectgroup')
        : null;
    for (const obj of (Array.isArray(doorLayer?.objects) ? doorLayer.objects : [])) {
        let doorValue = Number(getTiledProperty(obj, 'doorValue'));
        if (!Number.isFinite(doorValue) || doorValue <= 0) {
            const doorType = String(getTiledProperty(obj, 'doorType') || 'standard');
            const initialState = String(getTiledProperty(obj, 'initialState') || 'closed');
            doorValue = TILED_DOOR_REVERSE[`${doorType}|${initialState}`] || 1;
        }
        const startTileX = Math.round(Number(obj.x) / TILED_TILE_SIZE);
        const startTileY = Math.round(Number(obj.y) / TILED_TILE_SIZE);
        const orientation = String(getTiledProperty(obj, 'orientation') || '').toLowerCase();
        const rotation = ((Math.round((Number(obj.rotation) || 0) / 90) * 90) % 360 + 360) % 360;
        const longAxisTiles = Math.max(1, Math.round(Math.max(Number(obj.width) || 0, Number(obj.height) || 0) / TILED_TILE_SIZE));
        const isVertical = orientation === 'vertical'
            || rotation === 90
            || rotation === 270
            || (Number(obj.height) || 0) > (Number(obj.width) || 0);
        const tilesW = isVertical ? 1 : Math.max(1, Math.round(Number(obj.width) / TILED_TILE_SIZE) || longAxisTiles);
        const tilesH = isVertical ? longAxisTiles : 1;
        for (let dy = 0; dy < tilesH; dy++) {
            for (let dx = 0; dx < tilesW; dx++) {
                const tx = startTileX + dx;
                const ty = startTileY + dy;
                if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                    doors[ty][tx] = doorValue;
                }
            }
        }
    }

    const markerLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'markers' && layer?.type === 'objectgroup')
        : null;
    for (const obj of (Array.isArray(markerLayer?.objects) ? markerLayer.objects : [])) {
        let markerValue = Number(getTiledProperty(obj, 'markerValue'));
        if (!Number.isFinite(markerValue) || markerValue <= 0) {
            const markerType = String(obj?.type || obj?.name || '').toLowerCase();
            markerValue = TILED_MARKER_REVERSE[markerType] || 0;
        }
        const tileX = Math.round(Number(obj.x) / TILED_TILE_SIZE);
        const tileY = Math.round(Number(obj.y) / TILED_TILE_SIZE);
        if (markerValue > 0 && tileX >= 0 && tileX < width && tileY >= 0 && tileY < height) {
            markers[tileY][tileX] = markerValue;
        }
    }

    const textureLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'texture_overrides' && layer?.type === 'objectgroup')
        : null;
    for (const obj of (Array.isArray(textureLayer?.objects) ? textureLayer.objects : [])) {
        const imageKey = String(getTiledProperty(obj, 'imageKey') || '').trim();
        if (!imageKey) continue;
        const tileX = Math.round(Number(obj.x) / TILED_TILE_SIZE);
        const tileY = Math.round(Number(obj.y) / TILED_TILE_SIZE);
        if (tileX >= 0 && tileX < width && tileY >= 0 && tileY < height) {
            terrainTextures[tileY][tileX] = imageKey;
        }
    }

    const propLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'props' && layer?.type === 'objectgroup')
        : null;
    for (const obj of (Array.isArray(propLayer?.objects) ? propLayer.objects : [])) {
        const imageKey = String(getTiledProperty(obj, 'imageKey') || '').trim();
        if (!imageKey) continue;
        const tileX = Math.round(Number(obj.x) / TILED_TILE_SIZE);
        const tileY = Math.round(Number(obj.y) / TILED_TILE_SIZE);
        if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) continue;
        const propType = String(getTiledProperty(obj, 'propType') || obj?.type || 'prop');
        const pushProp = {
            id: String(obj?.name || makePropId()),
            tileX,
            tileY,
            type: propType,
            imageKey,
            radius: Math.max(4, Math.min(64, Number(getTiledProperty(obj, 'radius')) || 18)),
            rotation: Number(obj?.rotation) || 0,
        };
        if (propType === 'alien_spawn') {
            pushProp.count = Number(getTiledProperty(obj, 'count')) || 4;
        }
        props.push(pushProp);
    }

    const lights = [];
    const lightLayer = Array.isArray(tiledMap?.layers)
        ? tiledMap.layers.find((layer) => layer?.name === 'lights' && layer?.type === 'objectgroup')
        : null;
    for (const obj of (Array.isArray(lightLayer?.objects) ? lightLayer.objects : [])) {
        const tileX = Math.round(Number(obj.x) / TILED_TILE_SIZE);
        const tileY = Math.round(Number(obj.y) / TILED_TILE_SIZE);
        if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) continue;
        lights.push({
            id: String(obj?.name || makePropId()),
            tileX,
            tileY,
            type: String(getTiledProperty(obj, 'lightType') || 'spot'),
            color: String(getTiledProperty(obj, 'color') || '#ffffff'),
            radius: Math.max(0, Number(getTiledProperty(obj, 'radius')) || 240),
            brightness: Math.max(0, Number(getTiledProperty(obj, 'brightness') || getTiledProperty(obj, 'intensity')) || 0.5),
        });
    }

    return normalizeTilemapShape({
        id: String(fallbackMap?.id || getTiledProperty(tiledMap, 'templateId') || `map_${Date.now()}`),
        name: String(fallbackMap?.name || getTiledProperty(tiledMap, 'templateName') || fallbackMap?.id || 'Map'),
        width,
        height,
        terrain,
        doors,
        markers,
        floorTextureKey: String(getTiledProperty(tiledMap, 'floorTextureKey') || fallbackMap?.floorTextureKey || 'tile_floor_grill_import'),
        wallTextureKey: String(getTiledProperty(tiledMap, 'wallTextureKey') || fallbackMap?.wallTextureKey || 'tile_wall_corridor_import'),
        terrainTextures,
        props,
        lights,
    });
}

function validateTiledMapShape(tiledMap) {
    const errors = [];
    if (!tiledMap || typeof tiledMap !== 'object') {
        errors.push('payload is not an object');
        return { valid: false, errors };
    }
    const width = Number(tiledMap.width);
    const height = Number(tiledMap.height);
    if (!Number.isFinite(width) || width < 8) errors.push('missing or invalid width');
    if (!Number.isFinite(height) || height < 8) errors.push('missing or invalid height');
    if (!Array.isArray(tiledMap.layers)) {
        errors.push('missing layers array');
        return { valid: false, errors };
    }
    const terrainLayer = tiledMap.layers.find((layer) => layer?.name === 'terrain' && layer?.type === 'tilelayer');
    if (!terrainLayer || !Array.isArray(terrainLayer.data)) {
        errors.push('missing terrain tilelayer');
    } else if (Number.isFinite(width) && Number.isFinite(height) && terrainLayer.data.length < width * height) {
        errors.push('terrain layer data is shorter than width*height');
    }
    const hasMarkersLayer = tiledMap.layers.some((layer) => layer?.name === 'markers' && layer?.type === 'objectgroup');
    if (!hasMarkersLayer) errors.push('missing markers object layer');
    return { valid: errors.length === 0, errors };
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function getCanonicalTiledMapById(mapId) {
    return (Array.isArray(TILED_MAP_TEMPLATES) ? TILED_MAP_TEMPLATES : [])
        .find((entry) => String(entry?.id || '') === String(mapId || '')) || null;
}

function countTerrainTextureOverrides(map) {
    let count = 0;
    for (const row of (Array.isArray(map?.terrainTextures) ? map.terrainTextures : [])) {
        if (!Array.isArray(row)) continue;
        for (const value of row) if (typeof value === 'string' && value.trim()) count++;
    }
    return count;
}

function buildMapDriftSummary(currentMap, canonicalMap) {
    if (!canonicalMap) {
        return {
            status: 'local-only',
            lines: ['Canonical Tiled: none'],
            mismatched: [],
        };
    }

    const mismatched = [];
    const compareJson = (label, a, b) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) mismatched.push(label);
    };

    compareJson('terrain', currentMap?.terrain || [], canonicalMap?.terrain || []);
    compareJson('doors', currentMap?.doors || [], canonicalMap?.doors || []);
    compareJson('markers', currentMap?.markers || [], canonicalMap?.markers || []);
    compareJson('terrainTextures', currentMap?.terrainTextures || [], canonicalMap?.terrainTextures || []);
    compareJson('props', currentMap?.props || [], canonicalMap?.props || []);
    if (String(currentMap?.floorTextureKey || '') !== String(canonicalMap?.floorTextureKey || '')) mismatched.push('floorTextureKey');
    if (String(currentMap?.wallTextureKey || '') !== String(canonicalMap?.wallTextureKey || '')) mismatched.push('wallTextureKey');

    const lines = [];
    if (mismatched.length === 0) {
        lines.push('Canonical Tiled: in sync');
    } else {
        lines.push(`Canonical Tiled: drifted (${mismatched.length} change area${mismatched.length === 1 ? '' : 's'})`);
        lines.push(`Changed: ${mismatched.join(', ')}`);
    }
    lines.push(`Props: ${(currentMap?.props || []).length} current / ${(canonicalMap?.props || []).length} canonical`);
    lines.push(`Texture overrides: ${countTerrainTextureOverrides(currentMap)} current / ${countTerrainTextureOverrides(canonicalMap)} canonical`);

    return {
        status: mismatched.length === 0 ? 'in-sync' : 'drifted',
        lines,
        mismatched,
    };
}

function renderCanonicalTiledStatus() {
    const map = state.tilemaps[activeMapIndex];
    const root = document.getElementById('canonicalTiledStatus');
    if (!map || !root) return;
    const canonicalTiledMap = getCanonicalTiledMapById(map.id);
    const tiledDrift = buildMapDriftSummary(map, canonicalTiledMap);
    const color = tiledDrift.status === 'in-sync'
        ? '#8ce0b7'
        : (tiledDrift.status === 'drifted' ? '#ffd27a' : 'var(--muted)');
    if (!canonicalTiledMap) {
        root.innerHTML = `<div class="small" style="margin-bottom:8px;color:var(--muted)">Canonical source: local editor only</div>`;
        return;
    }
    root.innerHTML = `
        <div class="small" style="margin-bottom:8px;color:${color}">Canonical source: Tiled (${map.id})</div>
        <div class="small" style="margin-bottom:8px;line-height:1.5;color:${color}">${tiledDrift.lines.join('<br>')}</div>
    `;
}

function buildMapSummary(map) {
    const summary = {
        floor: 0,
        wall: 0,
        props: Array.isArray(map?.props) ? map.props.length : 0,
        textureOverrides: countTerrainTextureOverrides(map),
        doorCounts: { standard: 0, electronic: 0, locked: 0, welded: 0 },
        markerCounts: { spawn: 0, extract: 0, terminal: 0, security_card: 0, alien_spawn: 0, warning_strobe: 0, vent_point: 0, egg_cluster: 0 },
    };
    const markerValueToKey = {
        1: 'spawn',
        2: 'extract',
        3: 'terminal',
        4: 'security_card',
        5: 'alien_spawn',
        6: 'warning_strobe',
        7: 'vent_point',
        8: 'egg_cluster',
    };
    const doorValueToKey = {
        1: 'standard',
        2: 'electronic',
        3: 'locked',
        4: 'welded',
    };

    for (let y = 0; y < (map?.height || 0); y++) {
        for (let x = 0; x < (map?.width || 0); x++) {
            const terrain = Number(map?.terrain?.[y]?.[x]) || 0;
            if (terrain === 0) summary.floor++;
            else summary.wall++;

            const doorKey = doorValueToKey[Number(map?.doors?.[y]?.[x]) || 0];
            if (doorKey) summary.doorCounts[doorKey]++;

            const markerKey = markerValueToKey[Number(map?.markers?.[y]?.[x]) || 0];
            if (markerKey) summary.markerCounts[markerKey]++;
        }
    }
    return summary;
}

function renderMapSummary() {
    const map = state.tilemaps[activeMapIndex];
    const root = document.getElementById('mapSummary');
    if (!map || !root) return;
    const s = buildMapSummary(map);
    const linkedMissions = (Array.isArray(state?.missions) ? state.missions : [])
        .filter((mission) => String(mission?.mapId || '') === String(map.id || ''));
    const maxRequiredCards = linkedMissions.reduce((best, mission) => Math.max(best, Math.max(0, Math.floor(Number(mission?.requiredCards) || 0))), 0);
    const maxRequiredTerminals = linkedMissions.reduce((best, mission) => Math.max(best, Math.max(0, Math.floor(Number(mission?.requiredTerminals) || 0))), 0);
    const total = Math.max(1, s.floor + s.wall);
    const floorPct = ((s.floor / total) * 100).toFixed(1);
    const lines = [
        `Tiles: ${map.width}x${map.height} | Floor ${s.floor} (${floorPct}%) | Wall ${s.wall}`,
        `Doors: std ${s.doorCounts.standard}, elec ${s.doorCounts.electronic}, locked ${s.doorCounts.locked}, welded ${s.doorCounts.welded}`,
        `Markers: spawn ${s.markerCounts.spawn}, extract ${s.markerCounts.extract}, terminal ${s.markerCounts.terminal}, cards ${s.markerCounts.security_card}`,
        `Threat/FX: alien spawns ${s.markerCounts.alien_spawn}, warning strobes ${s.markerCounts.warning_strobe}`,
        `Vents: ${s.markerCounts.vent_point} | Egg clusters: ${s.markerCounts.egg_cluster}`,
        `Props: ${s.props} | Texture overrides: ${s.textureOverrides}`,
    ];
    if (linkedMissions.length > 0) {
        const missionIds = linkedMissions.map((mission) => String(mission?.id || '')).filter(Boolean).join(', ');
        const terminalStatus = s.markerCounts.terminal >= maxRequiredTerminals ? 'ok' : `needs ${maxRequiredTerminals}`;
        const cardStatus = s.markerCounts.security_card >= maxRequiredCards ? 'ok' : `needs ${maxRequiredCards}`;
        lines.push(`Missions: ${missionIds} | terminals ${terminalStatus} | cards ${cardStatus}`);
    }
    root.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
}

function collectMarkerPositions(map, value) {
    const positions = [];
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.markers[y][x] === value) positions.push({ x, y });
        }
    }
    return positions;
}

function applyDoorDirective(mode) {
    const map = state.tilemaps[activeMapIndex];
    const spawnTiles = collectMarkerPositions(map, 1);
    const extractTiles = collectMarkerPositions(map, 2);
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    const within = (x, y, positions, maxDist = 2) =>
        positions.some((pos) => dist(pos, { x, y }) <= maxDist);

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.doors[y][x] <= 0) continue;
            if (mode === 'lockdown') {
                if (within(x, y, extractTiles)) {
                    map.doors[y][x] = 4;
                } else if (within(x, y, spawnTiles)) {
                    map.doors[y][x] = 3;
                } else {
                    map.doors[y][x] = 2;
                }
            } else {
                map.doors[y][x] = 1;
            }
        }
    }
    redrawTilemapCanvas();
    setStatus(`Doors ${mode === 'lockdown' ? 'locked' : 'released'} per directive`);
}

let state = await loadState();

const statusEl = document.getElementById('status');
const validationEl = document.getElementById('packageValidation');
const packageDiffEl = document.getElementById('packageDiff');
const packageHistoryEl = document.getElementById('packageHistory');
const diagnosticsEl = document.getElementById('editorDiagnostics');
const diagMapInfoEl = document.getElementById('diagMapInfo');
const diagMissionInfoEl = document.getElementById('diagMissionInfo');
const diagLightCountEl = document.getElementById('diagLightCount');
const diagZoomInfoEl = document.getElementById('diagZoomInfo');
const diagRefreshBtn = document.getElementById('diagRefreshBtn');
const feedbackPopupEl = document.getElementById('feedbackPopup');

[validationEl, packageDiffEl, packageHistoryEl].forEach((el) => {
    if (!el) return;
    el.addEventListener('click', (ev) => {
        // Stop bubbling so clicking inside the box doesn't close it (if we added it later)
        // But also close others if this one is opened.
        const wasExpanded = el.classList.contains('expanded');
        [validationEl, packageDiffEl, packageHistoryEl].forEach((box) => box.classList.remove('expanded'));
        if (!wasExpanded) el.classList.add('expanded');
        ev.stopPropagation();
    });
});

window.addEventListener('click', () => {
    [validationEl, packageDiffEl, packageHistoryEl].forEach((box) => box.classList.remove('expanded'));
    document.querySelectorAll('.topbar-dropdown-wrap').forEach((w) => w.classList.remove('open'));
});

document.querySelectorAll('.topbar-trigger').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
        const wrap = btn.closest('.topbar-dropdown-wrap');
        const wasOpen = wrap.classList.contains('open');
        document.querySelectorAll('.topbar-dropdown-wrap').forEach((w) => w.classList.remove('open'));
        if (!wasOpen) wrap.classList.add('open');
        ev.stopPropagation();
    });
});
// Keep dropdown open while mouse is inside it (prevents flicker on hover gap)
document.querySelectorAll('.topbar-dropdown-wrap').forEach((wrap) => {
    let closeTimer = null;
    wrap.addEventListener('mouseenter', () => { clearTimeout(closeTimer); });
    wrap.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(() => wrap.classList.remove('open'), 120);
    });
});

// --- Accessibility: Font Size Controls ---
let _editorFontScale = 100; // Accessibility font scale percentage (80-200)
function applyEditorFontScale(pct) {
    _editorFontScale = Math.max(80, Math.min(200, pct));
    document.documentElement.style.setProperty('--editor-font-scale', (_editorFontScale / 100).toFixed(2));
    const lbl = document.getElementById('fontSizeLabel');
    if (lbl) lbl.textContent = _editorFontScale + '%';
    try { localStorage.setItem('aliens_editor_font_scale', String(_editorFontScale)); } catch (_e) { /* ignore */ }
}
// Restore saved font scale on load
(function restoreFontScale() {
    try {
        const saved = Number(localStorage.getItem('aliens_editor_font_scale'));
        if (saved >= 80 && saved <= 200) _editorFontScale = saved;
    } catch (_e) { /* ignore */ }
    applyEditorFontScale(_editorFontScale);
})();
document.getElementById('fontSizeUp')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyEditorFontScale(_editorFontScale + 10);
});
document.getElementById('fontSizeDown')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyEditorFontScale(_editorFontScale - 10);
});
document.getElementById('fontSizeReset')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyEditorFontScale(100);
});

window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && String(ev.key || '').toLowerCase() === 's') {
        ev.preventDefault();
        saveState('Saved all sections', {
            packageSource: 'save',
            recordPackageHistory: true,
        });
    }
    // Tilemap undo/redo — only when tilemap tab is active
    if ((ev.ctrlKey || ev.metaKey) && activeTab === 'tilemap') {
        const key = String(ev.key || '').toLowerCase();
        if (key === 'z' && !ev.shiftKey) {
            ev.preventDefault();
            if (tilemapUndo()) {
                setStatus('Undo');
                renderTilemapTab();
            }
        } else if ((key === 'z' && ev.shiftKey) || key === 'y') {
            ev.preventDefault();
            if (tilemapRedo()) {
                setStatus('Redo');
                renderTilemapTab();
            }
        }
    }
});

const strictQualityToggleEl = document.getElementById('strictQualityToggle');
const strictQualityThresholdEl = document.getElementById('strictQualityThreshold');
const tabRoot = document.getElementById('tabs');
const panels = {
    sprite: document.getElementById('tab-sprite'),
    animation: document.getElementById('tab-animation'),
    tilemap: document.getElementById('tab-tilemap'),
    missions: document.getElementById('tab-missions'),
    gameconfig: document.getElementById('tab-gameconfig'),
    hud: document.getElementById('tab-hud'),
    sound: document.getElementById('tab-sound'),
};

let spriteCtx;
let previewCtx;
let tilemapCtx;
let animationTimer = null;
let showDebugOverlay = false;
let animationPreviewIndex = 0;
let activeAnimationId = state.animations[0]?.id || null;
let activeMapIndex = 0;
let activeLayer = 'terrain';
let activeTileTool = 'pen';
let activeTileValue = 1;
let activeDoorValue = 1;
let selectedTile = null; // { x, y } when Select tool is active
let selectedObject = null; // { kind, id }
let activeTab = 'sprite';
let telemetryRange = '5m';
let qualityProfilePreviewName = 'balanced';
let balanceSnapshotFilter = 'all';
let activeBrushAsset = null; // { key, label, path, category } from ASSET_MANIFEST
let _scalePreviewPct = 100; // Scale Preview zoom percentage (50-400)
let _scalePreviewOpen = true; // Whether the Scale Preview panel is expanded
let _marineRefZoom = 2; // Marine reference panel zoom (1-6x)
let _tilemapZoom = 100; // Map editor zoom percentage (50-200)
const TILEMAP_ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];
let activeLargeTexAsset = null; // { key, label, path, category } for large texture placement
let activePropRadius = 18;
let activePropRotation = 0; // degrees: 0, 90, 180, 270
let activeTextureBrush = null; // key string for per-tile texture paint
let activeLightPresetIndex = 0;

// === Sound Tab State ===
const SOUNDS_STORAGE_KEY = 'aliens-editor-sounds';
let _soundList = [];          // [{ id, name, category, dataUrl }]
let _activeSoundId = null;
let _soundCategory = 'all';
let _soundWaveSurfer = null;
let _soundEffects = { reverbAmount: 0.2, echoTime: 0.25, echoFeedback: 0.3, fadeIn: 0, fadeOut: 0 };

function _loadSounds() {
    try { return JSON.parse(localStorage.getItem(SOUNDS_STORAGE_KEY)) || []; }
    catch { return []; }
}
function _saveSounds() {
    localStorage.setItem(SOUNDS_STORAGE_KEY, JSON.stringify(_soundList));
}
_soundList = _loadSounds();
let selectMode = 'any'; // 'any', 'floor', 'object'
let _tilemapAbort = null; // AbortController for tilemap event listeners
let _spriteAbort = null;  // AbortController for sprite canvas event listeners
let activeStoryKind = 'story';
let activeStoryTitle = 'Story Beat';
let activeStoryMissionId = 'all';
const SHAPE_TOOLS = new Set(['line', 'rect', 'circle']);
let shapeStartTile = null;
let shapePreviewTiles = [];
const _tilemapUndoStack = []; // array of JSON snapshots of map state
const _tilemapRedoStack = [];
const TILEMAP_UNDO_MAX = 40;
let _isPanning = false; // true while middle-click or space+drag is panning
let layerVisibility = {
    terrain: true,
    doors: true,
    markers: true,
    props: true,
    lights: true,
    textures: true,
    story: true,
};
let layerLocks = {
    terrain: false,
    doors: false,
    markers: false,
    props: false,
    lights: false,
    textures: false,
    story: false,
};

const _assetImgCache = new Map();

function getAssetImage(asset) {
    if (!asset || !asset.path) return null;
    if (_assetImgCache.has(asset.key)) return _assetImgCache.get(asset.key);
    const img = new Image();
    img.onload = () => redrawTilemapCanvas();
    img.src = asset.path;
    _assetImgCache.set(asset.key, img);
    return img;
}

function drawEditorPlaceholder(ctx, x, y, width, height, label = '') {
    const size = Math.max(10, Math.min(width, height) * 0.68);
    const left = x + (width - size) * 0.5;
    const top = y + (height - size) * 0.5;
    ctx.save();
    ctx.fillStyle = '#3b5160';
    ctx.fillRect(left, top, size, size);
    ctx.strokeStyle = '#9fc7da';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    if (label && size >= 16) {
        ctx.fillStyle = '#d9edf7';
        ctx.font = `bold ${Math.max(7, Math.floor(size * 0.24))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left + size / 2, top + size / 2);
    }
    ctx.restore();
}

function makePropId() {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function setStatus(text) {
    statusEl.textContent = text;
    // Close any open dropdown menus so the user sees the status change
    document.querySelectorAll('.topbar-dropdown-wrap').forEach((w) => w.classList.remove('open'));
    // Brief highlight flash on the status bar for visibility
    statusEl.style.background = '#1a3a52';
    clearTimeout(statusEl._flashTimer);
    statusEl._flashTimer = setTimeout(() => { statusEl.style.background = ''; }, 1200);
    // Also show a save toast near the canvas toolbar
    const toast = document.getElementById('saveToast');
    if (toast) {
        toast.textContent = text;
        toast.classList.add('visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
    }
}

function updateEditorDiagnostics() {
    if (!diagnosticsEl) return;
    const map = Array.isArray(state.tilemaps) ? state.tilemaps[activeMapIndex] : null;
    const missionCount = Array.isArray(state.missions) ? state.missions.length : 0;
    const lightCount = map?.lights?.length || 0;
    diagMapInfoEl.textContent = map ? `${map.name} ${map.width}×${map.height}` : 'No map loaded';
    diagMissionInfoEl.textContent = `${missionCount} mission${missionCount === 1 ? '' : 's'}`;
    diagLightCountEl.textContent = `${lightCount} light${lightCount === 1 ? '' : 's'}`;
    diagZoomInfoEl.textContent = `${Math.round(_tilemapZoom)}%`;
    diagnosticsEl.classList.add('updated');
    clearTimeout(diagnosticsEl._timer);
    diagnosticsEl._timer = setTimeout(() => diagnosticsEl.classList.remove('updated'), 1200);
}

let feedbackPopupTimer = null;
function showFeedbackPopup(message, type = 'success') {
    if (!feedbackPopupEl) return;
    feedbackPopupEl.textContent = message;
    feedbackPopupEl.classList.remove('success', 'error');
    feedbackPopupEl.classList.add(type === 'error' ? 'error' : 'success', 'visible');
    clearTimeout(feedbackPopupTimer);
    feedbackPopupTimer = setTimeout(() => {
        feedbackPopupEl.classList.remove('visible');
    }, 2600);
}

diagRefreshBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    updateEditorDiagnostics();
    setStatus('Diagnostics refreshed');
});
setInterval(() => updateEditorDiagnostics(), 7000);
updateEditorDiagnostics();

function writePackageSnapshot(payload, {
    source = 'autosave',
    recordHistory = false,
} = {}) {
    fetch('/api/mission-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
    }).then(() => {
        refreshPackageValidationSummary();
        renderPackageDiffPreview();
    }).catch(err => {
        console.error('Mission package save failed:', err);
        showToast?.('Save failed: ' + (err.message || 'network error'), 'error');
    });
    if (recordHistory) pushPackageHistory(payload, source);
}

// Wrapper that merges HUD config into state before building the package,
// so all package builds include HUD layout overrides from the HUD editor tab.
function buildPackageWithHud() {
    const stateWithHud = { ...state, hudConfig: loadHudConfig() };
    return buildPackageFromEditorState(stateWithHud);
}

// ── Tilemap Undo / Redo ──
function _snapshotMap(map) {
    return JSON.stringify({
        terrain: map.terrain,
        doors: map.doors,
        markers: map.markers,
        props: map.props,
        lights: map.lights,
        storyPoints: map.storyPoints,
        terrainTextures: map.terrainTextures,
        width: map.width,
        height: map.height,
    });
}

function _restoreMapSnapshot(map, json) {
    const snap = JSON.parse(json);
    map.terrain = snap.terrain;
    map.doors = snap.doors;
    map.markers = snap.markers;
    map.props = snap.props || [];
    map.lights = snap.lights || [];
    map.storyPoints = snap.storyPoints || [];
    map.terrainTextures = snap.terrainTextures || null;
    map.width = snap.width;
    map.height = snap.height;
}

function pushTilemapUndo() {
    const map = state.tilemaps[activeMapIndex];
    if (!map) return;
    _tilemapUndoStack.push(_snapshotMap(map));
    if (_tilemapUndoStack.length > TILEMAP_UNDO_MAX) _tilemapUndoStack.shift();
    _tilemapRedoStack.length = 0; // clear redo on new action
}

function tilemapUndo() {
    if (_tilemapUndoStack.length === 0) return false;
    const map = state.tilemaps[activeMapIndex];
    if (!map) return false;
    _tilemapRedoStack.push(_snapshotMap(map));
    _restoreMapSnapshot(map, _tilemapUndoStack.pop());
    saveState('Undo tilemap');
    return true;
}

function tilemapRedo() {
    if (_tilemapRedoStack.length === 0) return false;
    const map = state.tilemaps[activeMapIndex];
    if (!map) return false;
    _tilemapUndoStack.push(_snapshotMap(map));
    _restoreMapSnapshot(map, _tilemapRedoStack.pop());
    saveState('Redo tilemap');
    return true;
}

function saveState(reason = 'Saved', options = {}) {
    state._savedAt = Date.now();
    const stateJson = JSON.stringify(state);
    fetch('/api/editor-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stateJson,
    }).catch(err => {
        console.error('Editor state save failed:', err);
        showToast?.('State save failed: ' + (err.message || 'network error'), 'error');
    });
    const {
        packageSource = 'autosave',
        recordPackageHistory = false,
    } = options && typeof options === 'object' ? options : {};

    // Live-sync to game storage so edits are immediately visible in-game.
    let autoPublishErr = null;
    // Compute diff BEFORE writing so the comparison is meaningful.
    const pendingPayload = JSON.stringify(buildPackageWithHud());
    if (recordPackageHistory) {
        renderPackageDiffPreview();
    }
    try {
        writePackageSnapshot(pendingPayload, {
            source: packageSource,
            recordHistory: recordPackageHistory,
        });
    } catch (err) {
        autoPublishErr = err;
        console.error('Auto-publish failed:', err);
    }
    setStatus(`${reason} @ ${new Date().toLocaleTimeString()}`);
    refreshPackageValidationSummary();
    if (recordPackageHistory) {
        renderPackageHistory();
    }
    if (autoPublishErr) {
        showFeedbackPopup(`Save failed: ${autoPublishErr.message || 'auto-publish error'}`, 'error');
    } else {
        showFeedbackPopup('Saved successfully', 'success');
    }
}

function switchTab(name) {
    const prev = activeTab;
    activeTab = name;
    // Cancel graph RAF when leaving missions tab
    if (prev === 'missions' && name !== 'missions') {
        cancelAnimationFrame(_gRAF);
        _gRAF = null;
    }
    for (const [key, panel] of Object.entries(panels)) {
        panel.classList.toggle('active', key === name);
    }
    for (const btn of tabRoot.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.tab === name);
    }
    if (name === 'sound') renderSoundTab();
    // Restart graph loop when returning to missions tab if canvas already exists
    if (name === 'missions' && _gCanvas) {
        if (_gRAF) cancelAnimationFrame(_gRAF);
        const loop = () => { _graphDraw(); _gRAF = requestAnimationFrame(loop); };
        loop();
    }
}

tabRoot.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
});

function activeFrame() {
    return state.sprite.frames[state.sprite.currentFrame];
}

function getSwatch(index) {
    return state.sprite.palette[index] || '#00000000';
}

function renderSpriteTab() {
    renderAssetBrowserTab();
}

function renderScalePreviewSection() {
    const pct = _scalePreviewPct;
    const scale = pct / 100;
    const open = _scalePreviewOpen;
    const cats = [
        { id: 'character',   label: 'Characters' },
        { id: 'enemy',       label: 'Enemies' },
        { id: 'object',      label: 'Objects & Doors' },
        { id: 'environment', label: 'Tiles / Environment' },
        { id: 'projectile',  label: 'Projectiles' },
    ];
    let bodyHtml = '';
    if (open) {
        const sections = cats.map(cat => {
            const items = SPRITE_SCALE_CATALOG.filter(s => s.category === cat.id);
            if (!items.length) return '';
            const cards = items.map(s => {
                const dw = Math.round(s.gameW * scale);
                const dh = Math.round(s.gameH * scale);
                const tooltip = `Source: ${s.srcW}×${s.srcH}px\nIn-game: ${s.gameW}×${s.gameH}px${s.note ? '\n' + s.note : ''}`;
                return `<div class="scale-card" title="${tooltip}">
                    <div class="scale-card-img" style="width:${Math.max(dw, 4)}px;height:${Math.max(dh, 4)}px">
                        <img src="${s.path}" style="width:${Math.max(dw, 4)}px;height:${Math.max(dh, 4)}px;image-rendering:pixelated" onerror="this.parentElement.innerHTML='<span style=color:var(--muted)>?</span>'">
                    </div>
                    <div class="scale-card-label">${s.label}</div>
                    <div class="scale-card-size">${s.gameW}×${s.gameH}px</div>
                </div>`;
            }).join('');
            return `<div class="scale-cat"><h4>${cat.label}</h4><div class="scale-grid">${cards}</div></div>`;
        }).join('');
        bodyHtml = `<div class="scale-preview-body">${sections}</div>`;
    }
    return `
        <div class="scale-preview">
            <div class="scale-preview-header">
                <button data-scale-toggle class="scale-toggle-btn">${open ? '▼' : '▶'} Sprite Scale Preview</button>
                ${open ? `<div class="scale-controls">
                    <button data-scale-delta="-25" title="Shrink 25%">−</button>
                    <span class="scale-readout">${pct}%</span>
                    <button data-scale-delta="25" title="Grow 25%">+</button>
                    <button data-scale-reset title="Reset to 100%">Reset</button>
                </div>
                <span class="scale-hint">Sprites shown at in-game pixel size × ${pct}%</span>` : `<span class="scale-hint">Click to expand</span>`}
            </div>
            ${bodyHtml}
        </div>`;
}

function attachScalePreviewListeners() {
    document.querySelector('[data-scale-toggle]')?.addEventListener('click', () => {
        _scalePreviewOpen = !_scalePreviewOpen;
        renderSpriteTab();
    });
    document.querySelectorAll('[data-scale-delta]').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = parseInt(btn.dataset.scaleDelta, 10);
            _scalePreviewPct = Math.max(25, Math.min(400, _scalePreviewPct + d));
            renderSpriteTab();
        });
    });
    document.querySelector('[data-scale-reset]')?.addEventListener('click', () => {
        _scalePreviewPct = 100;
        renderSpriteTab();
    });
}

function renderMarineReferencePanel() {
    const z = _marineRefZoom;
    const disp = 64 * z;
    return `
        <div class="marine-ref-panel">
            <div class="marine-ref-header">
                <span class="marine-ref-title">Marine Reference (64×64)</span>
                <div class="marine-ref-zoom-controls">
                    <button data-marine-zoom="-1" title="Zoom out">−</button>
                    <span class="marine-ref-zoom-label">${z}×</span>
                    <button data-marine-zoom="1" title="Zoom in">+</button>
                </div>
            </div>
            <div class="marine-ref-viewport" style="width:${disp}px;height:${disp}px">
                <div class="marine-ref-sprite" style="width:${disp}px;height:${disp}px;background-size:${256 * z}px ${64 * z}px"></div>
            </div>
            <div class="marine-ref-dims">Team Leader · 64×64 px · ${z}×</div>
        </div>`;
}

function attachMarineRefListeners() {
    document.querySelectorAll('[data-marine-zoom]').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = parseInt(btn.dataset.marineZoom, 10);
            _marineRefZoom = Math.max(1, Math.min(6, _marineRefZoom + d));
            renderSpriteTab();
        });
    });
}

function renderAssetBrowserTab() {
    const categories = [
        { id: 'floor', label: 'Floor Textures' },
        { id: 'wall',  label: 'Wall Textures' },
        { id: 'prop',  label: 'Props' },
        { id: 'alien', label: 'Aliens' },
    ];

    const currentMap = state.tilemaps[activeMapIndex];

    const assetGrid = categories.map((cat) => {
        const items = ASSET_MANIFEST.filter((a) => a.category === cat.id).map((asset) => {
            const isSelected = activeBrushAsset?.key === asset.key;
            const isFloor = currentMap?.floorTextureKey === asset.key;
            const isWall = currentMap?.wallTextureKey === asset.key;
            const badge = isFloor ? ' <span style="color:#8ce0b7">●floor</span>' : isWall ? ' <span style="color:#ffd27a">●wall</span>' : '';
            return `
                <div data-asset-key="${asset.key}" class="asset-thumb${isSelected ? ' asset-selected' : ''}" title="${asset.label}">
                    <img src="${asset.path}" onerror="this.style.opacity='0.2'" loading="lazy">
                    <div class="asset-label">${asset.label}${badge}</div>
                </div>`;
        }).join('');
        return `<div class="asset-category"><h3>${cat.label}</h3><div class="asset-grid">${items}</div></div>`;
    }).join('');

    const selAsset = activeBrushAsset;
    const selSection = selAsset ? `
        <div class="asset-selected-bar">
            <img src="${selAsset.path}" style="width:40px;height:40px;object-fit:contain;border:1px solid var(--line);border-radius:6px;">
            <strong>${selAsset.label}</strong>
            <span style="color:var(--muted);font-size:12px">${selAsset.category}</span>
            ${selAsset.category === 'floor' ? `<button id="assignFloorBtn">Set Floor Texture</button>` : ''}
            ${selAsset.category === 'wall' ? `<button id="assignWallBtn">Set Wall Texture</button>` : ''}
            ${(selAsset.category === 'prop' || selAsset.category === 'alien') ? `<button id="usePropBrushBtn">Use as Prop Brush → Tilemap</button>` : ''}
            <button id="useLargeTexBtn">Use as Large Texture → Tilemap</button>
        </div>` : `<div class="asset-selected-bar" style="color:var(--muted)">${window.__pickAssetForLargeTex ? 'Pick an asset for large texture placement.' : 'Click an asset to select it.'}</div>`;

    const scalePreviewHtml = renderScalePreviewSection();

    panels.sprite.innerHTML = `
        <div class="controls">
            <h2>Asset Browser</h2>
            <div class="small" style="color:var(--muted)">Click to select. Assign to floor/wall or use as a prop brush in the Tilemap Editor.</div>
            <h3 style="margin-top:12px">Current Map</h3>
            <div class="small"><b>Floor:</b> ${currentMap?.floorTextureKey || '—'}</div>
            <div class="small"><b>Wall:</b> ${currentMap?.wallTextureKey || '—'}</div>
            <div class="small" style="margin-top:8px"><b>Prop brush:</b> ${activeBrushAsset ? activeBrushAsset.label : 'none'}</div>
            ${renderMarineReferencePanel()}
        </div>
        <div class="workspace">
            ${scalePreviewHtml}
            ${selSection}
            ${assetGrid}
        </div>
    `;

    panels.sprite.querySelectorAll('[data-asset-key]').forEach((el) => {
        el.addEventListener('click', () => {
            activeBrushAsset = assetByKey[el.dataset.assetKey] || null;
            renderAssetBrowserTab();
        });
    });

    document.getElementById('assignFloorBtn')?.addEventListener('click', () => {
        if (!activeBrushAsset || !currentMap) return;
        currentMap.floorTextureKey = activeBrushAsset.key;
        saveState(`Floor texture → ${activeBrushAsset.label}`);
        renderAssetBrowserTab();
    });

    document.getElementById('assignWallBtn')?.addEventListener('click', () => {
        if (!activeBrushAsset || !currentMap) return;
        currentMap.wallTextureKey = activeBrushAsset.key;
        saveState(`Wall texture → ${activeBrushAsset.label}`);
        renderAssetBrowserTab();
    });

    document.getElementById('usePropBrushBtn')?.addEventListener('click', () => {
        switchTab('tilemap');
        activeLayer = 'props';
        renderTilemapTab();
    });

    document.getElementById('useLargeTexBtn')?.addEventListener('click', () => {
        if (activeBrushAsset) {
            activeLargeTexAsset = activeBrushAsset;
            window.__pickAssetForLargeTex = false;
        }
        switchTab('tilemap');
        activeLayer = 'textures';
        renderTilemapTab();
    });

    // Consume __pickAssetForLargeTex flag when an asset is selected
    if (window.__pickAssetForLargeTex && activeBrushAsset) {
        activeLargeTexAsset = activeBrushAsset;
        window.__pickAssetForLargeTex = false;
    }

    attachScalePreviewListeners();
    attachMarineRefListeners();
}

function bindSpriteControls() {
    const paletteEl = document.getElementById('palette');
    paletteEl.innerHTML = '';
    state.sprite.palette.forEach((hex, idx) => {
        const sw = document.createElement('button');
        sw.className = `swatch ${idx === state.sprite.activeColor ? 'active' : ''}`;
        sw.style.background = hex;
        sw.title = `Color ${idx}`;
        sw.addEventListener('click', () => {
            state.sprite.activeColor = idx;
            renderSpriteTab();
        });
        paletteEl.appendChild(sw);
    });

    const frameStrip = document.getElementById('frameStrip');
    frameStrip.innerHTML = '';
    state.sprite.frames.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = `frame-btn ${idx === state.sprite.currentFrame ? 'active' : ''}`;
        btn.textContent = `Frame ${idx}`;
        btn.addEventListener('click', () => {
            state.sprite.currentFrame = idx;
            redrawSpriteCanvas();
            renderSpriteTab();
        });
        frameStrip.appendChild(btn);
    });

    document.querySelectorAll('[data-sprite-tool]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.sprite.tool = btn.dataset.spriteTool;
            renderSpriteTab();
        });
    });

    document.getElementById('spriteOnionToggle').addEventListener('change', (ev) => {
        state.sprite.onionSkin = ev.target.checked;
        saveState('Onion skin updated');
        redrawSpriteCanvas();
    });

    document.getElementById('originX').addEventListener('change', (ev) => {
        state.sprite.originX = clamp(Number(ev.target.value), 0, state.sprite.width - 1);
        saveState('Sprite origin updated');
        redrawSpriteCanvas();
    });

    document.getElementById('originY').addEventListener('change', (ev) => {
        state.sprite.originY = clamp(Number(ev.target.value), 0, state.sprite.height - 1);
        saveState('Sprite origin updated');
        redrawSpriteCanvas();
    });

    document.getElementById('addColorBtn').addEventListener('click', () => {
        const c = document.getElementById('newColorInput').value;
        if (!state.sprite.palette.includes(c)) {
            state.sprite.palette.push(c);
            state.sprite.activeColor = state.sprite.palette.length - 1;
            saveState('Palette updated');
            renderSpriteTab();
        }
    });

    document.getElementById('addFrameBtn').addEventListener('click', () => {
        state.sprite.frames.push(createGrid(state.sprite.width, state.sprite.height, -1));
        state.sprite.currentFrame = state.sprite.frames.length - 1;
        saveState('Frame added');
        renderSpriteTab();
    });

    document.getElementById('dupFrameBtn').addEventListener('click', () => {
        state.sprite.frames.push(clone(activeFrame()));
        state.sprite.currentFrame = state.sprite.frames.length - 1;
        saveState('Frame duplicated');
        renderSpriteTab();
    });

    document.getElementById('deleteFrameBtn').addEventListener('click', () => {
        if (state.sprite.frames.length <= 1) return;
        state.sprite.frames.splice(state.sprite.currentFrame, 1);
        state.sprite.currentFrame = Math.max(0, state.sprite.currentFrame - 1);
        saveState('Frame deleted');
        renderSpriteTab();
    });

    document.getElementById('resizeSpriteBtn').addEventListener('click', () => {
        const width = Number(document.getElementById('spriteWidth').value);
        const height = Number(document.getElementById('spriteHeight').value);
        resizeSpriteFrames(width, height);
        saveState('Sprite resized');
        renderSpriteTab();
    });

    bindSpriteCanvasInput();
}

function resizeSpriteFrames(width, height) {
    state.sprite.width = width;
    state.sprite.height = height;
    state.sprite.originX = clamp(state.sprite.originX, 0, width - 1);
    state.sprite.originY = clamp(state.sprite.originY, 0, height - 1);
    state.sprite.frames = state.sprite.frames.map((frame) => {
        const next = createGrid(width, height, -1);
        const maxY = Math.min(height, frame.length);
        const maxX = Math.min(width, frame[0]?.length || 0);
        for (let y = 0; y < maxY; y++) {
            for (let x = 0; x < maxX; x++) next[y][x] = frame[y][x];
        }
        return next;
    });
}

function bindSpriteCanvasInput() {
    const canvas = document.getElementById('spriteCanvas');
    if (!canvas) return;
    // Cancel any previous listeners before re-binding
    if (_spriteAbort) _spriteAbort.abort();
    _spriteAbort = new AbortController();
    const sig = { signal: _spriteAbort.signal };
    let drawing = false;

    const paintAt = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / state.sprite.pixelSize);
        const y = Math.floor((event.clientY - rect.top) / state.sprite.pixelSize);
        if (!activeFrame()[y] || typeof activeFrame()[y][x] === 'undefined') return;

        if (state.sprite.tool === 'fill') {
            floodFill(activeFrame(), x, y, state.sprite.activeColor);
            redrawSpriteCanvas();
            saveState('Sprite fill');
            return;
        }

        activeFrame()[y][x] = state.sprite.tool === 'erase' ? -1 : state.sprite.activeColor;
        redrawSpriteCanvas();
    };

    canvas.addEventListener('pointerdown', (event) => {
        drawing = true;
        paintAt(event);
    }, sig);
    canvas.addEventListener('pointermove', (event) => {
        if (!drawing) return;
        paintAt(event);
    }, sig);
    window.addEventListener('pointerup', () => {
        if (drawing) saveState('Sprite edited');
        drawing = false;
    }, sig);
}

function floodFill(grid, sx, sy, newVal) {
    const h = grid.length;
    const w = grid[0].length;
    const start = grid[sy][sx];
    if (start === newVal) return;
    const stack = [[sx, sy]];
    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (grid[y][x] !== start) continue;
        grid[y][x] = newVal;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
}

function getLineTiles(x0, y0, x1, y1) {
    const tiles = [];
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (true) {
        tiles.push({ x, y });
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    return tiles;
}

function getRectTiles(x0, y0, x1, y1, filled) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const tiles = [];
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (filled || y === minY || y === maxY || x === minX || x === maxX) {
                tiles.push({ x, y });
            }
        }
    }
    return tiles;
}

function getCircleTiles(cx, cy, radius, filled) {
    if (radius <= 0) return [{ x: cx, y: cy }];
    const tiles = new Map();
    const add = (x, y) => tiles.set(`${x},${y}`, { x, y });
    if (filled) {
        for (let dy = -radius; dy <= radius; dy++) {
            const halfWidth = Math.round(Math.sqrt(radius * radius - dy * dy));
            for (let dx = -halfWidth; dx <= halfWidth; dx++) {
                add(cx + dx, cy + dy);
            }
        }
    } else {
        let x = radius, y = 0, d = 1 - radius;
        while (x >= y) {
            add(cx + x, cy + y); add(cx - x, cy + y);
            add(cx + x, cy - y); add(cx - x, cy - y);
            add(cx + y, cy + x); add(cx - y, cy + x);
            add(cx + y, cy - x); add(cx - y, cy - x);
            y++;
            if (d <= 0) { d += 2 * y + 1; }
            else { x--; d += 2 * (y - x) + 1; }
        }
    }
    return Array.from(tiles.values());
}

function commitShapeTiles(tiles) {
    const map = state.tilemaps[activeMapIndex];
    if (!map) return;
    if (isLayerLocked(activeLayer)) return;
    if (!['terrain', 'doors', 'markers'].includes(activeLayer)) return;
    if (tiles.length === 0) return;
    const grid = map[activeLayer];
    const value = activeLayer === 'doors' ? activeDoorValue : activeTileValue;
    if (activeLayer === 'markers' && SINGLE_INSTANCE_MARKERS.has(value)) return;
    for (const t of tiles) {
        if (t.x < 0 || t.x >= map.width || t.y < 0 || t.y >= map.height) continue;
        if (!grid[t.y]) continue;
        grid[t.y][t.x] = value;
    }
    redrawTilemapCanvas();
    saveState(`${activeTileTool} on ${activeLayer}`);
}

function redrawSpriteCanvas() {
    if (!spriteCtx || !previewCtx) return;
    const canvas = spriteCtx.canvas;
    const w = state.sprite.width;
    const h = state.sprite.height;
    const p = state.sprite.pixelSize;
    canvas.width = w * p;
    canvas.height = h * p;

    spriteCtx.clearRect(0, 0, canvas.width, canvas.height);
    spriteCtx.fillStyle = '#081017';
    spriteCtx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.sprite.onionSkin && state.sprite.frames.length > 1) {
        const prevIdx = (state.sprite.currentFrame - 1 + state.sprite.frames.length) % state.sprite.frames.length;
        const nextIdx = (state.sprite.currentFrame + 1) % state.sprite.frames.length;
        drawOnionFrame(spriteCtx, state.sprite.frames[prevIdx], w, h, p, '#4ea5ff', 0.25);
        drawOnionFrame(spriteCtx, state.sprite.frames[nextIdx], w, h, p, '#ff8b6b', 0.2);
    }

    const frame = activeFrame();
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = frame[y][x];
            if (cell >= 0) {
                spriteCtx.fillStyle = getSwatch(cell);
                spriteCtx.fillRect(x * p, y * p, p, p);
            }
            spriteCtx.strokeStyle = '#1e3240';
            spriteCtx.lineWidth = 1;
            spriteCtx.strokeRect(x * p + 0.5, y * p + 0.5, p - 1, p - 1);
        }
    }

    spriteCtx.strokeStyle = '#8ce0b7';
    spriteCtx.lineWidth = 2;
    spriteCtx.beginPath();
    spriteCtx.moveTo(state.sprite.originX * p + p / 2, 0);
    spriteCtx.lineTo(state.sprite.originX * p + p / 2, canvas.height);
    spriteCtx.moveTo(0, state.sprite.originY * p + p / 2);
    spriteCtx.lineTo(canvas.width, state.sprite.originY * p + p / 2);
    spriteCtx.stroke();

    previewCtx.clearRect(0, 0, 128, 128);
    const scale = Math.floor(Math.min(128 / w, 128 / h));
    const ox = Math.floor((128 - (w * scale)) / 2);
    const oy = Math.floor((128 - (h * scale)) / 2);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = frame[y][x];
            if (cell >= 0) {
                previewCtx.fillStyle = getSwatch(cell);
                previewCtx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
            }
        }
    }

    previewCtx.strokeStyle = '#8ce0b7';
    previewCtx.beginPath();
    previewCtx.moveTo(ox + state.sprite.originX * scale + scale / 2, oy);
    previewCtx.lineTo(ox + state.sprite.originX * scale + scale / 2, oy + h * scale);
    previewCtx.moveTo(ox, oy + state.sprite.originY * scale + scale / 2);
    previewCtx.lineTo(ox + w * scale, oy + state.sprite.originY * scale + scale / 2);
    previewCtx.stroke();
}

function drawOnionFrame(ctx, frame, w, h, p, tint, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = frame[y][x];
            if (cell >= 0) {
                ctx.fillStyle = tint;
                ctx.fillRect(x * p, y * p, p, p);
            }
        }
    }
    ctx.restore();
}

function renderAnimationTab() {
    const mapOptions = state.animations
        .map((a) => `<option value="${a.id}" ${a.id === activeAnimationId ? 'selected' : ''}>${a.name}</option>`)
        .join('');

    const anim = state.animations.find((a) => a.id === activeAnimationId) || state.animations[0];
    activeAnimationId = anim.id;

    panels.animation.innerHTML = `
        <div class="controls">
            <h2>Animation Editor</h2>
            <label>Active Animation
                <select id="animSelect">${mapOptions}</select>
            </label>
            <div class="row">
                <button id="newAnimBtn">New Anim</button>
                <button id="deleteAnimBtn">Delete</button>
            </div>
            <label>Name <input id="animName" type="text" value="${anim.name}"></label>
            <div class="row">
                <label>FPS <input id="animFps" type="number" min="1" max="30" value="${anim.fps}"></label>
                <label>Loop
                    <select id="animLoop">
                        <option value="true" ${anim.loop ? 'selected' : ''}>true</option>
                        <option value="false" ${anim.loop ? '' : 'selected'}>false</option>
                    </select>
                </label>
            </div>
            <label>Frame Sequence (comma-separated)
                <input id="animFrames" type="text" value="${anim.frames.join(',')}">
            </label>
            <div class="row">
                <button id="applyAnimBtn">Apply</button>
                <button id="playAnimBtn">Play/Stop</button>
            </div>
            <div class="small">Frames reference Sprite Editor frame indexes.</div>
        </div>
        <div class="workspace">
            <h2>Timeline</h2>
            <div class="timeline" id="animTimeline"></div>
            <h3>Preview</h3>
            <canvas id="animPreview" class="preview-canvas" width="256" height="256"></canvas>
        </div>
    `;

    const timeline = document.getElementById('animTimeline');
    timeline.innerHTML = '';
    anim.frames.forEach((idx, i) => {
        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.textContent = `Step ${i}: frame ${idx}`;
        timeline.appendChild(div);
    });

    document.getElementById('animSelect').addEventListener('change', (ev) => {
        activeAnimationId = ev.target.value;
        stopAnimationPreview();
        renderAnimationTab();
    });

    document.getElementById('newAnimBtn').addEventListener('click', () => {
        const id = `anim_${Date.now()}`;
        state.animations.push({ id, name: 'new_anim', fps: 8, loop: true, frames: [0] });
        activeAnimationId = id;
        saveState('Animation added');
        renderAnimationTab();
    });

    document.getElementById('deleteAnimBtn').addEventListener('click', () => {
        if (state.animations.length <= 1) return;
        const idx = state.animations.findIndex((a) => a.id === activeAnimationId);
        state.animations.splice(idx, 1);
        activeAnimationId = state.animations[0].id;
        saveState('Animation deleted');
        renderAnimationTab();
    });

    document.getElementById('applyAnimBtn').addEventListener('click', () => {
        const a = state.animations.find((x) => x.id === activeAnimationId);
        a.name = document.getElementById('animName').value.trim() || a.name;
        a.fps = Math.max(1, Number(document.getElementById('animFps').value) || 8);
        a.loop = document.getElementById('animLoop').value === 'true';
        a.frames = parseFrameIndexes(document.getElementById('animFrames').value, state.sprite.frames.length);
        animationPreviewIndex = 0;
        saveState('Animation updated');
        renderAnimationTab();
    });

    document.getElementById('playAnimBtn').addEventListener('click', () => {
        if (animationTimer) {
            stopAnimationPreview();
        } else {
            playAnimationPreview();
        }
    });

    drawAnimationPreviewFrame(anim.frames[0] ?? 0, document.getElementById('animPreview'));
}

function parseFrameIndexes(text, frameCount) {
    const parsed = text
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < frameCount);
    return parsed.length ? parsed : [0];
}

function drawAnimationPreviewFrame(frameIdx, canvas) {
    const ctx = canvas.getContext('2d');
    const frame = state.sprite.frames[frameIdx] || state.sprite.frames[0];
    const w = state.sprite.width;
    const h = state.sprite.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#081017';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.floor(Math.min(canvas.width / w, canvas.height / h));
    const ox = Math.floor((canvas.width - w * scale) / 2);
    const oy = Math.floor((canvas.height - h * scale) / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = frame[y][x];
            if (cell >= 0) {
                ctx.fillStyle = getSwatch(cell);
                ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
            }
        }
    }
}

function playAnimationPreview() {
    const anim = state.animations.find((a) => a.id === activeAnimationId);
    if (!anim) return;
    const canvas = document.getElementById('animPreview');
    if (!canvas) return;

    animationPreviewIndex = 0;
    const stepMs = Math.max(30, Math.floor(1000 / anim.fps));
    animationTimer = setInterval(() => {
        const frameIdx = anim.frames[animationPreviewIndex] ?? 0;
        drawAnimationPreviewFrame(frameIdx, canvas);

        animationPreviewIndex += 1;
        if (animationPreviewIndex >= anim.frames.length) {
            if (anim.loop) animationPreviewIndex = 0;
            else stopAnimationPreview();
        }
    }, stepMs);

    setStatus(`Animation playing (${anim.name})`);
}

function stopAnimationPreview() {
    if (!animationTimer) return;
    clearInterval(animationTimer);
    animationTimer = null;
    setStatus('Animation stopped');
}

const TILEMAP_LAYER_PRESETS = [
    { id: 'floor', label: 'Floor', layer: 'terrain', tileValue: 0 },
    { id: 'walls', label: 'Walls', layer: 'terrain', tileValue: 1 },
    { id: 'doors', label: 'Doors', layer: 'doors' },
    { id: 'spawn', label: 'Spawn Points', layer: 'markers', tileValue: 5 },
    { id: 'props', label: 'Props', layer: 'props' },
    { id: 'lights', label: 'Lights', layer: 'lights' },
    { id: 'story', label: 'Story', layer: 'story' },
    { id: 'textures', label: 'Textures', layer: 'textures' },
];

function setActiveTilemapLayer(presetId) {
    const preset = TILEMAP_LAYER_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    activeLayer = preset.layer;
    if (Number.isFinite(preset.tileValue)) activeTileValue = preset.tileValue;
    if (preset.layer === 'props' && !activeBrushAsset) {
        activeBrushAsset = PROP_PRESETS[0] || null;
    }
    if ((preset.layer === 'props' || preset.layer === 'lights' || preset.layer === 'story') && activeTileTool === 'fill') {
        activeTileTool = 'pen';
    }
    renderTilemapTab();
}

// ── Floating Context Menu for Tilemap ──────────────────────────────────────
let _tileCtxMenu = null;

function getTileContextMenuEl() {
    if (_tileCtxMenu) return _tileCtxMenu;
    _tileCtxMenu = document.createElement('div');
    _tileCtxMenu.className = 'tile-ctx-menu';
    document.body.appendChild(_tileCtxMenu);
    // Dismiss on outside click
    document.addEventListener('pointerdown', (ev) => {
        if (_tileCtxMenu && !_tileCtxMenu.contains(ev.target)) {
            _tileCtxMenu.classList.remove('visible');
        }
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && _tileCtxMenu) _tileCtxMenu.classList.remove('visible');
    });
    return _tileCtxMenu;
}

function hideTileContextMenu() {
    if (_tileCtxMenu) _tileCtxMenu.classList.remove('visible');
}

function showTileContextMenu(tileX, tileY, clientX, clientY) {
    const menu = getTileContextMenuEl();
    const map = state.tilemaps[activeMapIndex];
    if (!map || tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
        menu.classList.remove('visible');
        return;
    }

    // Gather everything at this tile
    const propsHere = (map.props || []).filter(p => p.tileX === tileX && p.tileY === tileY);
    const lightsHere = (map.lights || []).filter(l => l.tileX === tileX && l.tileY === tileY);
    const storyHere = (map.storyPoints || []).filter(sp => sp.tileX === tileX && sp.tileY === tileY);
    const doorVal = map.doors?.[tileY]?.[tileX] ?? 0;
    const markerVal = map.markers?.[tileY]?.[tileX] ?? 0;
    const terrainVal = map.terrain?.[tileY]?.[tileX] ?? 0;
    const texOverride = map.terrainTextures?.[tileY]?.[tileX] || null;

    const items = [];

    // Header
    items.push(`<div class="tile-ctx-menu-header">Tile (${tileX}, ${tileY})</div>`);

    // Select & Inspect
    items.push(`<div class="tile-ctx-menu-item" data-ctx-action="inspect"><span class="ctx-icon">🔍</span>Select &amp; Inspect</div>`);

    // Terrain toggle
    if (terrainVal === 0) {
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="set-wall"><span class="ctx-icon">🧱</span>Set Wall</div>`);
    } else {
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="set-floor"><span class="ctx-icon">⬜</span>Set Floor</div>`);
    }

    // Door actions
    if (doorVal > 0) {
        const doorLabel = TILE_VALUES.doors.find(v => v.value === doorVal)?.label || 'door';
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-door"><span class="ctx-icon">🚪</span>Remove ${doorLabel} door</div>`);
    }

    // Marker actions
    if (markerVal > 0) {
        const markerLabel = TILE_VALUES.markers.find(v => v.value === markerVal)?.label || 'marker';
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-marker"><span class="ctx-icon">📍</span>Remove ${markerLabel}</div>`);
    }

    // Props
    for (const p of propsHere) {
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        const label = p.imageKey || p.type || 'prop';
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="rotate-prop" data-ctx-id="${p.id}"><span class="ctx-icon">🔄</span>Rotate ${label}</div>`);
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="dup-prop" data-ctx-id="${p.id}"><span class="ctx-icon">📋</span>Duplicate ${label}</div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-prop" data-ctx-id="${p.id}"><span class="ctx-icon">✕</span>Delete ${label}</div>`);
    }

    // Lights
    for (const l of lightsHere) {
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        const label = l.type || 'light';
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="dup-light" data-ctx-id="${l.id}"><span class="ctx-icon">📋</span>Duplicate ${label}</div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-light" data-ctx-id="${l.id}"><span class="ctx-icon">✕</span>Delete ${label}</div>`);
    }

    // Story points
    for (const sp of storyHere) {
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        items.push(`<div class="tile-ctx-menu-item" data-ctx-action="dup-story" data-ctx-id="${sp.id}"><span class="ctx-icon">📋</span>Duplicate "${sp.title}"</div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-story" data-ctx-id="${sp.id}"><span class="ctx-icon">✕</span>Delete "${sp.title}"</div>`);
    }

    // Texture override
    if (texOverride) {
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="del-texture"><span class="ctx-icon">🎨</span>Clear texture override</div>`);
    }

    // Erase all at tile
    const hasAnything = propsHere.length || lightsHere.length || storyHere.length || doorVal || markerVal || texOverride;
    if (hasAnything) {
        items.push(`<div class="tile-ctx-menu-sep"></div>`);
        items.push(`<div class="tile-ctx-menu-item danger" data-ctx-action="erase-all"><span class="ctx-icon">🗑</span>Erase everything at tile</div>`);
    }

    menu.innerHTML = items.join('');
    menu.classList.add('visible');

    // Position — keep on-screen
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let mx = clientX;
    let my = clientY;
    // Render offscreen to measure
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    const rect = menu.getBoundingClientRect();
    if (mx + rect.width > vw - 8) mx = vw - rect.width - 8;
    if (my + rect.height > vh - 8) my = vh - rect.height - 8;
    if (mx < 4) mx = 4;
    if (my < 4) my = 4;
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';

    // Wire actions (one-shot via event delegation)
    menu.onclick = (ev) => {
        const row = ev.target.closest('[data-ctx-action]');
        if (!row) return;
        const action = row.dataset.ctxAction;
        const id = row.dataset.ctxId;
        handleTileContextAction(action, id, tileX, tileY, map);
        menu.classList.remove('visible');
    };
}

function handleTileContextAction(action, id, tileX, tileY, map) {
    let changed = false;
    const label = `ctx-menu ${action}`;

    switch (action) {
        case 'inspect':
            activeTileTool = 'select';
            selectedTile = { x: tileX, y: tileY };
            selectedObject = findObjectAtTile(map, tileX, tileY);
            renderTilemapTab();
            return;

        case 'set-wall':
            if (map.terrain?.[tileY]) { map.terrain[tileY][tileX] = 1; changed = true; }
            break;
        case 'set-floor':
            if (map.terrain?.[tileY]) { map.terrain[tileY][tileX] = 0; changed = true; }
            break;

        case 'del-door':
            if (map.doors?.[tileY]) { map.doors[tileY][tileX] = 0; changed = true; }
            break;
        case 'del-marker':
            if (map.markers?.[tileY]) { map.markers[tileY][tileX] = 0; changed = true; }
            break;

        case 'del-prop':
            map.props = (map.props || []).filter(p => p.id !== id);
            changed = true;
            break;
        case 'rotate-prop': {
            const prop = (map.props || []).find(p => p.id === id);
            if (prop) {
                prop.rotation = ((prop.rotation || 0) + 90) % 360;
                changed = true;
            }
            break;
        }
        case 'dup-prop': {
            const src = (map.props || []).find(p => p.id === id);
            if (src) {
                const dup = { ...src, id: crypto.randomUUID(), tileX: src.tileX + 1, tileY: src.tileY };
                if (dup.tileX >= map.width) dup.tileX = src.tileX;
                map.props.push(dup);
                changed = true;
            }
            break;
        }

        case 'del-light':
            map.lights = (map.lights || []).filter(l => l.id !== id);
            changed = true;
            break;
        case 'dup-light': {
            const src = (map.lights || []).find(l => l.id === id);
            if (src) {
                const dup = { ...src, id: crypto.randomUUID(), tileX: src.tileX + 1, tileY: src.tileY };
                if (dup.tileX >= map.width) dup.tileX = src.tileX;
                map.lights.push(dup);
                changed = true;
            }
            break;
        }

        case 'del-story':
            map.storyPoints = (map.storyPoints || []).filter(sp => sp.id !== id);
            changed = true;
            break;
        case 'dup-story': {
            const src = (map.storyPoints || []).find(sp => sp.id === id);
            if (src) {
                const dup = { ...src, id: crypto.randomUUID(), tileX: src.tileX + 1, tileY: src.tileY };
                if (dup.tileX >= map.width) dup.tileX = src.tileX;
                map.storyPoints.push(dup);
                changed = true;
            }
            break;
        }

        case 'del-texture':
            if (map.terrainTextures?.[tileY]) { map.terrainTextures[tileY][tileX] = null; changed = true; }
            break;

        case 'erase-all':
            // Erase everything at this tile
            map.props = (map.props || []).filter(p => !(p.tileX === tileX && p.tileY === tileY));
            map.lights = (map.lights || []).filter(l => !(l.tileX === tileX && l.tileY === tileY));
            map.storyPoints = (map.storyPoints || []).filter(sp => !(sp.tileX === tileX && sp.tileY === tileY));
            if (map.doors?.[tileY]) map.doors[tileY][tileX] = 0;
            if (map.markers?.[tileY]) map.markers[tileY][tileX] = 0;
            if (map.terrainTextures?.[tileY]) map.terrainTextures[tileY][tileX] = null;
            changed = true;
            break;
    }

    if (changed) {
        redrawTilemapCanvas();
        saveState(label);
        // Refresh inspector panel after context-menu changes
        if (activeTileTool === 'select' && selectedTile) {
            renderTilemapTab();
        }
    }
}

function findObjectAtTile(map, x, y) {
    if (!map) return null;
    const story = (map.storyPoints || []).find((sp) => sp.tileX === x && sp.tileY === y);
    if (story) return { kind: 'story', id: story.id };
    const light = (map.lights || []).find((l) => l.tileX === x && l.tileY === y);
    if (light) return { kind: 'light', id: light.id };
    const prop = (map.props || []).find((p) => p.tileX === x && p.tileY === y);
    if (prop) return { kind: 'prop', id: prop.id };
    const markerValue = Number(map.markers?.[y]?.[x]) || 0;
    if (markerValue > 0) return { kind: 'marker', x, y, value: markerValue };
    return null;
}

function getSelectedObjectEntity(map) {
    if (!selectedObject || !map) return null;
    if (selectedObject.kind === 'prop') return (map.props || []).find((p) => p.id === selectedObject.id) || null;
    if (selectedObject.kind === 'light') return (map.lights || []).find((l) => l.id === selectedObject.id) || null;
    if (selectedObject.kind === 'story') return (map.storyPoints || []).find((sp) => sp.id === selectedObject.id) || null;
    if (selectedObject.kind === 'marker') return selectedObject;
    return null;
}

function nudgeSelectedObject(dx, dy) {
    const map = state.tilemaps[activeMapIndex];
    const entity = getSelectedObjectEntity(map);
    if (!entity || !selectedObject) return false;
    const nx = Math.max(0, Math.min(map.width - 1, (Number(entity.tileX ?? entity.x) || 0) + dx));
    const ny = Math.max(0, Math.min(map.height - 1, (Number(entity.tileY ?? entity.y) || 0) + dy));
    if (selectedObject.kind === 'prop' || selectedObject.kind === 'light' || selectedObject.kind === 'story') {
        entity.tileX = nx;
        entity.tileY = ny;
    } else if (selectedObject.kind === 'marker') {
        const markerValue = Number(entity.value || selectedObject.value) || 0;
        map.markers[entity.y][entity.x] = 0;
        clearUniqueMarker(map, markerValue, nx, ny);
        map.markers[ny][nx] = markerValue;
        selectedObject = { kind: 'marker', x: nx, y: ny, value: markerValue };
    } else {
        return false;
    }
    selectedTile = { x: nx, y: ny };
    return true;
}

function duplicateSelectedObject() {
    const map = state.tilemaps[activeMapIndex];
    const entity = getSelectedObjectEntity(map);
    if (!entity || !selectedObject) return false;

    const nextTileX = Math.min(map.width - 1, (Number(entity.tileX) || 0) + 1);
    const nextTileY = Math.min(map.height - 1, Number(entity.tileY) || 0);

    if (selectedObject.kind === 'prop') {
        map.props = (map.props || []).filter((p) => !(p.tileX === nextTileX && p.tileY === nextTileY));
        const dup = { ...entity, id: makePropId(), tileX: nextTileX, tileY: nextTileY };
        map.props.push(dup);
        selectedObject = { kind: 'prop', id: dup.id };
        selectedTile = { x: dup.tileX, y: dup.tileY };
        return true;
    }
    if (selectedObject.kind === 'light') {
        map.lights = (map.lights || []).filter((l) => !(l.tileX === nextTileX && l.tileY === nextTileY));
        const dup = { ...entity, id: makePropId(), tileX: nextTileX, tileY: nextTileY };
        map.lights.push(dup);
        selectedObject = { kind: 'light', id: dup.id };
        selectedTile = { x: dup.tileX, y: dup.tileY };
        return true;
    }
    if (selectedObject.kind === 'story') {
        map.storyPoints = (map.storyPoints || []).filter((sp) => !(sp.tileX === nextTileX && sp.tileY === nextTileY));
        const dup = { ...entity, id: makePropId(), tileX: nextTileX, tileY: nextTileY };
        map.storyPoints.push(dup);
        selectedObject = { kind: 'story', id: dup.id };
        selectedTile = { x: dup.tileX, y: dup.tileY };
        return true;
    }
    if (selectedObject.kind === 'marker') {
        const markerValue = Number(entity.value || selectedObject.value) || 0;
        if (!markerValue || !map.markers?.[nextTileY]) return false;
        clearUniqueMarker(map, markerValue, nextTileX, nextTileY);
        map.markers[nextTileY][nextTileX] = markerValue;
        selectedObject = { kind: 'marker', x: nextTileX, y: nextTileY, value: markerValue };
        selectedTile = { x: nextTileX, y: nextTileY };
        return true;
    }
    return false;
}

function rotateSelectedPropOrBrush() {
    const map = state.tilemaps[activeMapIndex];
    const entity = getSelectedObjectEntity(map);
    if (selectedObject?.kind === 'prop' && entity) {
        entity.rotation = (((Number(entity.rotation) || 0) + 90) % 360 + 360) % 360;
        return true;
    }
    if (activeTab === 'tilemap' && activeLayer === 'props') {
        activePropRotation = (((Number(activePropRotation) || 0) + 90) % 360 + 360) % 360;
        return true;
    }
    return false;
}

function mirrorMapByAxis(axis = 'x') {
    const map = state.tilemaps[activeMapIndex];
    const w = map.width;
    const h = map.height;

    if (axis === 'y') {
        for (const layerName of ['terrain', 'doors', 'markers']) {
            map[layerName] = [...map[layerName]].reverse();
        }
        if (Array.isArray(map.terrainTextures)) {
            map.terrainTextures = [...map.terrainTextures].reverse();
        }
        if (Array.isArray(map.props)) {
            map.props.forEach((p) => { p.tileY = h - 1 - p.tileY; });
        }
        if (Array.isArray(map.lights)) {
            map.lights.forEach((l) => { l.tileY = h - 1 - l.tileY; });
        }
        if (Array.isArray(map.storyPoints)) {
            map.storyPoints.forEach((sp) => { sp.tileY = h - 1 - sp.tileY; });
        }
        if (selectedTile) selectedTile = { x: selectedTile.x, y: h - 1 - selectedTile.y };
        if (selectedObject?.kind === 'marker') {
            selectedObject = { ...selectedObject, y: h - 1 - (selectedObject.y || 0) };
        }
        return;
    }

    for (const layerName of ['terrain', 'doors', 'markers']) {
        map[layerName] = map[layerName].map((row) => [...row].reverse());
    }
    if (Array.isArray(map.terrainTextures)) {
        map.terrainTextures = map.terrainTextures.map((row) => [...row].reverse());
    }
    if (Array.isArray(map.props)) {
        map.props.forEach((p) => { p.tileX = w - 1 - p.tileX; });
    }
    if (Array.isArray(map.lights)) {
        map.lights.forEach((l) => { l.tileX = w - 1 - l.tileX; });
    }
    if (Array.isArray(map.storyPoints)) {
        map.storyPoints.forEach((sp) => { sp.tileX = w - 1 - sp.tileX; });
    }
    if (selectedTile) selectedTile = { x: w - 1 - selectedTile.x, y: selectedTile.y };
    if (selectedObject?.kind === 'marker') {
        selectedObject = { ...selectedObject, x: w - 1 - (selectedObject.x || 0) };
    }
}

function clearUniqueMarker(map, markerValue, keepX, keepY) {
    if (!SINGLE_INSTANCE_MARKERS.has(markerValue)) return;
    for (let yy = 0; yy < map.height; yy++) {
        for (let xx = 0; xx < map.width; xx++) {
            if (xx === keepX && yy === keepY) continue;
            if (map.markers[yy][xx] === markerValue) map.markers[yy][xx] = 0;
        }
    }
}

function isLayerVisible(layer) {
    return layerVisibility[layer] !== false;
}

function isLayerLocked(layer) {
    return layerLocks[layer] === true;
}

function buildSelectionInspector(map, sel, selectedEntity = null) {
    if (!sel) return '<h3>Selection</h3><div class="small" style="color:var(--muted)">Click a tile to inspect it.</div>';
    const { x, y } = sel;
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return '<h3>Selection</h3><div class="small">Out of bounds</div>';

    const lines = [];
    lines.push(`<h3>Tile (${x}, ${y})</h3>`);

    // Terrain
    const tv = map.terrain?.[y]?.[x] ?? 0;
    const terrainLabel = TILE_VALUES.terrain.find(v => v.value === tv)?.label || String(tv);
    lines.push(`<div class="sel-row"><span class="sel-label">Terrain</span><span class="sel-val">${terrainLabel}</span>
        <select id="selTerrainVal">${TILE_VALUES.terrain.map(v => `<option value="${v.value}" ${v.value === tv ? 'selected' : ''}>${v.value}: ${v.label}</option>`).join('')}</select></div>`);

    // Door
    const dv = map.doors?.[y]?.[x] ?? 0;
    const doorLabel = TILE_VALUES.doors.find(v => v.value === dv)?.label || String(dv);
    lines.push(`<div class="sel-row"><span class="sel-label">Door</span><span class="sel-val">${doorLabel}</span>
        <select id="selDoorVal">${TILE_VALUES.doors.map(v => `<option value="${v.value}" ${v.value === dv ? 'selected' : ''}>${v.value}: ${v.label}</option>`).join('')}</select></div>`);

    // Marker
    const mv = map.markers?.[y]?.[x] ?? 0;
    const markerLabel = TILE_VALUES.markers.find(v => v.value === mv)?.label || String(mv);
    lines.push(`<div class="sel-row"><span class="sel-label">Marker</span><span class="sel-val">${markerLabel}</span>
        <select id="selMarkerVal">${TILE_VALUES.markers.map(v => `<option value="${v.value}" ${v.value === mv ? 'selected' : ''}>${v.value}: ${v.label}</option>`).join('')}</select></div>`);

    // Props
    const propsHere = (map.props || []).filter(p => p.tileX === x && p.tileY === y);
    if (propsHere.length > 0) {
        for (const p of propsHere) {
            const isAlienSpawnProp = p.type === 'alien_spawn' || p.type === 'spawn';
            const isZoneProp = p.type === 'zone_colony' || p.type === 'zone_damaged' || p.type === 'zone_hive';
            const zoneRadiusDefault = 128;
            lines.push(`<div class="sel-row"><span class="sel-label">Prop</span><span class="sel-val">${p.imageKey || p.type}</span>
                <span class="small">r=${p.radius || 0} rot=${p.rotation || 0}°${isAlienSpawnProp ? ` cnt=${p.count || 2}` : ''}${isZoneProp ? ` zone=${p.type}` : ''}</span>
                <button class="sel-del" data-sel-del-prop="${p.id}">Delete</button></div>`);
            lines.push(`<div class="sel-edit">
                <label>Radius <input type="number" data-sel-prop-radius="${p.id}" value="${p.radius || (isZoneProp ? zoneRadiusDefault : 18)}" min="4" max="${isZoneProp ? 512 : 64}" step="${isZoneProp ? 16 : 1}" style="width:56px"></label>
                <label>Rotation <select data-sel-prop-rotation="${p.id}">
                    <option value="0" ${(p.rotation || 0) === 0 ? 'selected' : ''}>0°</option>
                    <option value="90" ${p.rotation === 90 ? 'selected' : ''}>90°</option>
                    <option value="180" ${p.rotation === 180 ? 'selected' : ''}>180°</option>
                    <option value="270" ${p.rotation === 270 ? 'selected' : ''}>270°</option>
                </select></label>
                ${isAlienSpawnProp ? `<label>Alien Count <select data-sel-prop-count="${p.id}">
                    <option value="2" ${(p.count || 2) === 2 ? 'selected' : ''}>2</option>
                    <option value="4" ${p.count === 4 ? 'selected' : ''}>4</option>
                    <option value="6" ${p.count === 6 ? 'selected' : ''}>6</option>
                    <option value="8" ${p.count === 8 ? 'selected' : ''}>8</option>
                </select></label>` : ''}
                ${isZoneProp ? `<label>Zone Type <select data-sel-prop-zone-type="${p.id}">
                    <option value="zone_colony" ${p.type === 'zone_colony' ? 'selected' : ''}>Colony (normal)</option>
                    <option value="zone_damaged" ${p.type === 'zone_damaged' ? 'selected' : ''}>Damaged (dark)</option>
                    <option value="zone_hive" ${p.type === 'zone_hive' ? 'selected' : ''}>Hive (very dark)</option>
                </select></label>` : ''}
            </div>`);
        }
    }

    // Lights
    const lightsHere = (map.lights || []).filter(l => l.tileX === x && l.tileY === y);
    if (lightsHere.length > 0) {
        for (const l of lightsHere) {
            lines.push(`<div class="sel-row"><span class="sel-label">Light</span>
                <span class="sel-val" style="color:${l.color || '#fff'}">${l.type || 'spot'}</span>
                <span class="small">r=${l.radius} b=${l.brightness}</span>
                <button class="sel-del" data-sel-del-light="${l.id}">Delete</button></div>`);
            lines.push(`<div class="sel-edit">
                <label>Color <input type="color" data-sel-light-color="${l.id}" value="${l.color || '#ffffff'}" style="width:36px;height:20px;vertical-align:middle"></label>
                <label>Radius <input type="number" data-sel-light-radius="${l.id}" value="${l.radius || 240}" min="40" max="800" step="10" style="width:56px"></label>
                <label>Brightness <input type="number" data-sel-light-brightness="${l.id}" value="${l.brightness || 0.5}" min="0.1" max="2" step="0.05" style="width:56px"></label>
            </div>`);
        }
    }

    // Texture override with swap picker
    const texOverride = map.terrainTextures?.[y]?.[x];
    const texCategory = tv === 1 ? 'wall' : 'floor';
    const texOptions = ASSET_MANIFEST.filter(a => a.category === texCategory);
    lines.push(`<div class="sel-section"><span class="sel-label">Texture Override</span>`);
    if (texOverride) {
        const texAsset = assetByKey[texOverride];
        lines.push(`<div class="sel-tex-preview"><img src="${texAsset?.path || ''}" style="width:48px;height:48px;object-fit:contain;border:1px solid var(--line);border-radius:4px" onerror="this.style.opacity='0.2'"> <span class="small">${texAsset?.label || texOverride}</span></div>`);
    }
    lines.push(`<select id="selTextureSwap" style="width:100%;margin:4px 0">
        <option value="">${texOverride ? '— Clear override —' : '— No override —'}</option>
        ${texOptions.map(a => `<option value="${a.key}" ${a.key === texOverride ? 'selected' : ''}>${a.label}</option>`).join('')}
    </select></div>`);

    const storyHere = (map.storyPoints || []).filter((sp) => sp.tileX === x && sp.tileY === y);
    if (storyHere.length > 0) {
        for (const sp of storyHere) {
            lines.push(`<div class="sel-row"><span class="sel-label">Story</span><span class="sel-val">${sp.title}</span>
                <span class="small">${sp.kind}</span>
                <button class="sel-del" data-sel-del-story="${sp.id}">Delete</button></div>`);
            lines.push(`<div class="sel-edit">
                <label>Title <input type="text" data-sel-story-title="${sp.id}" value="${escapeHtml(sp.title)}"></label>
                <label>Kind
                    <select data-sel-story-kind="${sp.id}">
                        ${['story', 'objective', 'warning', 'beat'].map((kind) => `<option value="${kind}" ${kind === sp.kind ? 'selected' : ''}>${kind}</option>`).join('')}
                    </select>
                </label>
                <label>Mission
                    <select data-sel-story-mission="${sp.id}">
                        <option value="all" ${sp.missionId === 'all' ? 'selected' : ''}>all</option>
                        ${state.missions.map((mission) => `<option value="${mission.id}" ${mission.id === sp.missionId ? 'selected' : ''}>${mission.id}</option>`).join('')}
                    </select>
                </label>
                <label style="grid-column:1 / -1">Note
                    <textarea data-sel-story-note="${sp.id}" rows="3">${escapeHtml(sp.note || '')}</textarea>
                </label>
            </div>`);
        }
    }

    if (selectedEntity && selectedObject && selectedObject.kind === 'marker') {
        lines.push(`<div class="small" style="margin-top:6px;color:var(--accent)">Marker drag enabled in Select mode.</div>`);
    }

    if (propsHere.length === 0 && lightsHere.length === 0 && storyHere.length === 0 && !texOverride && dv === 0 && mv === 0) {
        lines.push(`<div class="small" style="color:var(--muted);margin-top:4px">Empty tile — ${tv === 1 ? 'wall' : 'floor'} only</div>`);
    }

    return lines.join('\n');
}

function renderTilemapTab() {
    const mapButtons = state.tilemaps.map((m, idx) => `
        <button data-map-idx="${idx}" class="map-btn ${idx === activeMapIndex ? 'active' : ''}">${m.name}</button>
    `).join('');

    const currentMap = state.tilemaps[activeMapIndex];
    const layerOptions = ['terrain', 'doors', 'markers', 'props', 'lights', 'textures', 'story']
        .map((layer) => `<option value="${layer}" ${layer === activeLayer ? 'selected' : ''}>${layer}</option>`)
        .join('');

    const isPropsLayer = activeLayer === 'props';
    const isLightsLayer = activeLayer === 'lights';
    const isTexturesLayer = activeLayer === 'textures';
    const isStoryLayer = activeLayer === 'story';
    const fillAllowed = !(isPropsLayer || isLightsLayer || isTexturesLayer || isStoryLayer || activeLayer === 'markers');
    const shapesAllowed = !(isPropsLayer || isLightsLayer || isTexturesLayer || isStoryLayer);
    const valueOptions = (isPropsLayer || isLightsLayer || isTexturesLayer || isStoryLayer)
        ? `<option disabled>— use palette below —</option>`
        : (TILE_VALUES[activeLayer] || [])
            .map((v) => `<option value="${v.value}" ${v.value === activeTileValue ? 'selected' : ''}>${v.value}: ${v.label}</option>`)
            .join('');
    const layerPresetButtons = TILEMAP_LAYER_PRESETS.map((preset) => `
        <button data-layer-preset="${preset.id}" class="${activeLayer === preset.layer && (!Number.isFinite(preset.tileValue) || activeTileValue === preset.tileValue) ? 'active' : ''}">
            ${preset.label}
        </button>
    `).join('');
    const layerManagerRows = TILEMAP_LAYER_PRESETS.map((preset) => {
        const layer = preset.layer;
        const active = activeLayer === layer && (!Number.isFinite(preset.tileValue) || activeTileValue === preset.tileValue);
        return `
            <div class="layer-row ${active ? 'active' : ''}">
                <button class="layer-row-main ${active ? 'active' : ''}" data-layer-preset="${preset.id}">${preset.label}</button>
                <button class="layer-row-toggle ${isLayerVisible(layer) ? 'active' : ''}" data-layer-visible="${layer}" title="Toggle visibility">${isLayerVisible(layer) ? 'Show' : 'Hide'}</button>
                <button class="layer-row-toggle ${isLayerLocked(layer) ? 'active lock' : ''}" data-layer-lock="${layer}" title="Toggle lock">${isLayerLocked(layer) ? 'Lock' : 'Edit'}</button>
            </div>
        `;
    }).join('');

    const floorAsset = assetByKey[currentMap.floorTextureKey];
    const wallAsset = assetByKey[currentMap.wallTextureKey];
    const canonicalTiledMap = getCanonicalTiledMapById(currentMap.id);
    if (isPropsLayer && !activeBrushAsset) activeBrushAsset = PROP_PRESETS[0] || null;
    const textureBar = `
        <h3>Textures</h3>
        <div class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            <img src="${floorAsset?.path || ''}" style="width:28px;height:28px;object-fit:cover;border:1px solid var(--line);border-radius:4px" onerror="this.style.opacity='0.2'">
            <span>Floor: <b>${floorAsset?.label || currentMap.floorTextureKey}</b></span>
        </div>
        <div class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <img src="${wallAsset?.path || ''}" style="width:28px;height:28px;object-fit:cover;border:1px solid var(--line);border-radius:4px" onerror="this.style.opacity='0.2'">
            <span>Wall: <b>${wallAsset?.label || currentMap.wallTextureKey}</b></span>
        </div>
        <div id="canonicalTiledStatus"></div>
        <button id="openAssetBrowserBtn" style="width:100%;margin-bottom:8px">Open Asset Browser</button>`;

    const propsBrushBar = isPropsLayer ? `
        <h3>Prop Brush</h3>
        <div class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            ${activeBrushAsset
                ? `<img src="${activeBrushAsset.path}" style="width:32px;height:32px;object-fit:contain;border:1px solid var(--accent);border-radius:4px">
                   <span style="color:var(--accent)">${activeBrushAsset.label}</span>`
                : `<span style="color:var(--muted)">No brush — select in Asset Browser</span>`}
        </div>
        <button id="openAssetBrowserBtn2" style="width:100%;margin-bottom:4px">Pick from Asset Browser</button>
        <div class="small" style="margin-bottom:6px">
            <label>Collision Radius <input type="number" id="propRadiusInput" value="${activePropRadius}" step="1" min="4" max="64" style="width:44px"></label>
        </div>
        <div class="small" style="margin-bottom:6px;display:flex;gap:6px;align-items:center">
            <label>Rotation</label>
            <button id="propRotBtn0" class="prop-rot-btn ${activePropRotation === 0 ? 'active' : ''}" data-rot="0">0°</button>
            <button id="propRotBtn90" class="prop-rot-btn ${activePropRotation === 90 ? 'active' : ''}" data-rot="90">90°</button>
            <button id="propRotBtn180" class="prop-rot-btn ${activePropRotation === 180 ? 'active' : ''}" data-rot="180">180°</button>
            <button id="propRotBtn270" class="prop-rot-btn ${activePropRotation === 270 ? 'active' : ''}" data-rot="270">270°</button>
        </div>
        <div class="small" style="color:var(--muted)">Pen: place prop. Erase: remove prop at tile.</div>
        <div class="small" style="margin-top:6px">Props on map: <b>${(currentMap.props || []).length}</b></div>
        <div class="row" id="propPresetRow">
            ${PROP_PRESETS.map((preset) => `
                <button data-prop-key="${preset.key}" class="prop-preset">
                    ${preset.label}
                </button>
            `).join('')}
        </div>
        <div class="small" style="margin-bottom:6px;color:var(--muted)">Preset selects brush + radius</div>
        <button id="clearPropsBtn" style="width:100%;margin-top:4px">Clear All Props</button>` : '';

    const lightsBrushBar = isLightsLayer ? `
        <h3>Light Brush</h3>
        <div class="row" id="lightPresetRow" style="margin-bottom:8px">
            ${LIGHT_PRESETS.map((preset, idx) => `
                <button data-light-idx="${idx}" class="light-preset ${activeLightPresetIndex === idx ? 'active' : ''}" style="font-size:10px;padding:4px">
                    ${preset.label}
                </button>
            `).join('')}
        </div>
        <div class="row-3" id="lightTypeRow" style="margin-bottom:8px">
            <button data-light-type="spot" class="${activeLightPresets[activeLightPresetIndex]?.type === 'spot' ? 'active' : ''}">Spot</button>
            <button data-light-type="point" class="${activeLightPresets[activeLightPresetIndex]?.type === 'point' ? 'active' : ''}">Point</button>
            <button data-light-type="alarm" class="${activeLightPresets[activeLightPresetIndex]?.type === 'alarm' ? 'active' : ''}">Alarm</button>
        </div>
        <div class="small" style="margin-bottom:8px">
            <label>Color <input type="color" id="lightColorInput" value="${activeLightPresets[activeLightPresetIndex]?.color || '#ffffff'}" style="width:40px;height:24px;padding:2px;vertical-align:middle"></label>
        </div>
        <div class="small" style="margin-bottom:8px">
            <label style="display:block">Brightness (${(activeLightPresets[activeLightPresetIndex]?.brightness || 0.5).toFixed(2)})</label>
            <input type="range" id="lightBrightnessInput" value="${activeLightPresets[activeLightPresetIndex]?.brightness || 0.5}" min="0.1" max="2.0" step="0.05" style="width:100%">
        </div>
        <div class="small" style="margin-bottom:8px">
            <label style="display:block">Radius (${activeLightPresets[activeLightPresetIndex]?.radius || 240}px)</label>
            <input type="range" id="lightRadiusInput" value="${activeLightPresets[activeLightPresetIndex]?.radius || 240}" min="40" max="800" step="10" style="width:100%">
        </div>
        <div class="small" style="margin-bottom:8px;display:flex;gap:12px">
            <label><input type="checkbox" id="lightFlickerToggle" ${activeLightPresets[activeLightPresetIndex]?.flickering ? 'checked' : ''}> Flicker</label>
            <label><input type="checkbox" id="lightPulseToggle" ${activeLightPresets[activeLightPresetIndex]?.pulsing ? 'checked' : ''}> Pulse</label>
        </div>
        <div class="small" style="color:var(--muted)">Pen: place light. Erase: remove light.</div>
        <div class="small" style="margin-top:6px">Lights on map: <b>${(currentMap.lights || []).length}</b></div>
        <button id="clearLightsBtn" style="width:100%;margin-top:4px">Clear All Lights</button>` : '';

    const texturePalette = isTexturesLayer ? (() => {
        const texAssets = ASSET_MANIFEST.filter((a) => a.category === 'floor' || a.category === 'wall');
        const thumbs = texAssets.map((a) => `
            <div data-tex-key="${a.key}" class="asset-thumb ${activeTextureBrush === a.key ? 'asset-selected' : ''}" title="${a.label} (${a.category})" style="width:52px">
                <img src="${a.path}" style="width:44px;height:44px;object-fit:cover" onerror="this.style.opacity='0.2'">
                <div class="asset-label">${a.label}</div>
            </div>`).join('');
        return `<h3>Texture Brush</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${thumbs}</div>
        <div class="small" style="color:var(--muted);margin-bottom:4px">Pen: paint texture override. Erase: clear override (reverts to map default).</div>
        <button id="clearTexturesBtn" style="width:100%;margin-top:4px">Clear All Texture Overrides</button>
        <hr style="border-color:var(--line);margin:10px 0">
        <h3>Large Textures</h3>
        <div class="small" style="margin-bottom:6px;color:var(--muted)">Place multi-tile texture spans. Select an asset, then click canvas to place (2x2 default).</div>
        <button id="openLargeTexAssetBtn" style="width:100%;margin-bottom:4px">Select Image for Large Texture</button>
        <div class="small" style="margin-bottom:6px">Active: <b>${activeLargeTexAsset ? activeLargeTexAsset.label : 'None'}</b></div>
        <div class="small" style="margin-bottom:4px">Large textures on map: <b>${(currentMap.largeTextures || []).length}</b></div>
        ${(currentMap.largeTextures || []).map((lt, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:2px 4px;background:rgba(255,153,68,0.08);border-radius:3px;margin-bottom:2px">
                <span>${lt.imageKey || '(no image)'}</span>
                <span>${lt.widthTiles}x${lt.heightTiles} @ (${lt.tileX},${lt.tileY})</span>
                <button data-del-lt="${i}" style="font-size:10px;padding:1px 6px">Del</button>
            </div>
        `).join('')}
        <button id="clearLargeTexBtn" style="width:100%;margin-top:4px">Clear All Large Textures</button>`;
    })() : '';

    const storyBrushBar = isStoryLayer ? `
        <h3>Story Overlay</h3>
        <div class="small" style="margin-bottom:8px;color:var(--muted)">Place narrative beats or objective callouts, then drag them in Select mode.</div>
        <label>Kind
            <select id="storyKindSelect">
                ${['story', 'objective', 'warning', 'beat'].map((kind) => `<option value="${kind}" ${kind === activeStoryKind ? 'selected' : ''}>${kind}</option>`).join('')}
            </select>
        </label>
        <label style="display:block;margin-top:6px">Title
            <input id="storyTitleInput" type="text" value="${escapeHtml(activeStoryTitle)}">
        </label>
        <label style="display:block;margin-top:6px">Mission
            <select id="storyMissionSelect">
                <option value="all" ${activeStoryMissionId === 'all' ? 'selected' : ''}>all missions</option>
                ${state.missions.map((mission) => `<option value="${mission.id}" ${mission.id === activeStoryMissionId ? 'selected' : ''}>${mission.name}</option>`).join('')}
            </select>
        </label>
        <div class="small" style="margin-top:6px">Story points on map: <b>${(currentMap.storyPoints || []).length}</b></div>
        <button id="clearStoryBtn" style="width:100%;margin-top:6px">Clear Story Points</button>
    ` : '';

    // --- Selection inspector for Select tool ---
    const selInspector = buildSelectionInspector(currentMap, selectedTile, getSelectedObjectEntity(currentMap));

    // --- Brush options (only shown when NOT in select mode) ---
    const brushPanel = activeTileTool === 'select' ? '' : `
            <h3>Layer</h3>
            <select id="layerSelect">${layerOptions}</select>
            ${activeLayer === 'doors' ? `
                <div class="row" id="doorPresetRow" style="margin-top:6px">
                    ${DOOR_PRESETS.map((preset) => `
                        <button data-door-value="${preset.value}" class="door-preset ${activeDoorValue === preset.value ? 'active' : ''}">
                            ${preset.label}
                        </button>
                    `).join('')}
                </div>
                <div class="small" style="margin-bottom:8px">
                    ${DOOR_PRESETS.find((preset) => preset.value === activeDoorValue)?.info || 'Select door preset before painting'}
                </div>
            ` : ''}
            ${isPropsLayer ? propsBrushBar : isLightsLayer ? lightsBrushBar : isTexturesLayer ? texturePalette : isStoryLayer ? storyBrushBar : `<label>Brush value<select id="tileValueSelect">${valueOptions}</select></label>`}
    `;

    panels.tilemap.innerHTML = `
        <div class="controls">
            <h2>${(() => {
                const preset = TILEMAP_LAYER_PRESETS.find(p => activeLayer === p.layer && (!Number.isFinite(p.tileValue) || activeTileValue === p.tileValue));
                return preset ? preset.label + ' Layer' : 'Tilemap Editor';
            })()}</h2>
            ${textureBar}
            ${activeTileTool === 'select' ? selInspector : brushPanel}
            <details class="collapsible-section" style="margin-top:8px">
                <summary>Atmosphere &amp; Lighting</summary>
                <div class="collapsible-section-body">
                    <div class="small" style="margin-bottom:6px">
                        <label style="display:block">Ambient Darkness (${(currentMap.atmosphere?.ambientDarkness ?? 0.82).toFixed(2)})</label>
                        <input type="range" id="atmosDarknessSlider" value="${currentMap.atmosphere?.ambientDarkness ?? 0.82}" min="0.45" max="1.0" step="0.01" style="width:100%">
                    </div>
                    <div class="small" style="margin-bottom:6px">
                        <label style="display:block">Torch Range (${currentMap.atmosphere?.torchRange ?? 560}px)</label>
                        <input type="range" id="atmosTorchSlider" value="${currentMap.atmosphere?.torchRange ?? 560}" min="80" max="1200" step="10" style="width:100%">
                    </div>
                    <div class="small" style="margin-bottom:6px">
                        <label style="display:block">Dust Density (${(currentMap.atmosphere?.dustDensity ?? 0.5).toFixed(2)})</label>
                        <input type="range" id="atmosDustSlider" value="${currentMap.atmosphere?.dustDensity ?? 0.5}" min="0" max="1" step="0.01" style="width:100%">
                    </div>
                    <div class="small" style="margin-bottom:4px;display:flex;flex-wrap:wrap;gap:8px">
                        <label><input type="checkbox" id="atmosVentHum" ${(currentMap.atmosphere?.ventHum !== false) ? 'checked' : ''}> Vent Hum</label>
                        <label><input type="checkbox" id="atmosPipeGroans" ${(currentMap.atmosphere?.pipeGroans !== false) ? 'checked' : ''}> Pipe Groans</label>
                        <label><input type="checkbox" id="atmosDistantThumps" ${(currentMap.atmosphere?.distantThumps !== false) ? 'checked' : ''}> Distant Thumps</label>
                        <label><input type="checkbox" id="atmosAlienChitter" ${(currentMap.atmosphere?.alienChittering !== false) ? 'checked' : ''}> Alien Chittering</label>
                    </div>
                </div>
            </details>
            ${(() => {
                const categories = ['prop', 'alien', 'floor', 'wall'];
                const categoryLabels = { prop: 'Props', alien: 'Aliens', floor: 'Floor', wall: 'Wall' };
                const quickAssetHtml = categories.map(cat => {
                    const assets = ASSET_MANIFEST.filter(a => a.category === cat);
                    if (assets.length === 0) return '';
                    return `<div class="small" style="margin-bottom:2px;color:var(--muted);font-weight:600">${categoryLabels[cat] || cat}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
                            ${assets.map(a => `<div class="quick-asset-thumb" draggable="true" data-drag-key="${a.key}" data-drag-category="${a.category}" title="${a.label}">
                                <img src="${a.path}" style="width:36px;height:36px;object-fit:contain;pointer-events:none" onerror="this.style.opacity='0.2'">
                            </div>`).join('')}
                        </div>`;
                }).join('');
                return `<details class="collapsible-section" style="margin-top:8px">
                    <summary>Quick Assets</summary>
                    <div class="collapsible-section-body">
                        ${quickAssetHtml}
                    </div>
                </details>`;
            })()}
            <h3 style="margin-bottom:2px">Tiled <span style="font-size:10px;font-weight:normal;color:var(--muted)">(canonical source)</span></h3>
            <p class="small" style="margin:0 0 6px;color:var(--muted)">Edit in Tiled → Save → Rebuild here or run <code>npm run build:tiled</code>.</p>
            <div class="row">
                <button id="rebuildTiledBtn" title="POST /api/tiled-build — runs npm run build:tiled-maps on the server">Rebuild Module</button>
            </div>
            <div class="row">
                <button id="exportTiledBtn" title="Export editor map as Tiled JSON — save to maps/*.json, then Rebuild">Save to Tiled</button>
                <button id="importTiledBtn" title="Load a Tiled JSON file into the editor canvas">Load from Tiled</button>
            </div>
            <div class="row">
                <button id="resetLayerFromTiledBtn" ${canonicalTiledMap ? '' : 'disabled'} title="Reset active layer to the canonical Tiled source">Reset Layer</button>
                <button id="resetFromTiledBtn" ${canonicalTiledMap ? '' : 'disabled'} title="Reset entire map to the canonical Tiled source">Reset Map</button>
            </div>
            <input id="importTiledFile" type="file" accept="application/json" style="display:none">
            <div class="row">
                <button id="lockdownDoorsBtn">Lockdown Doors</button>
                <button id="releaseDoorsBtn">Release Doors</button>
            </div>
            <div class="row">
                <button id="debugOverlayBtn" class="${showDebugOverlay ? 'active' : ''}">Debug Overlay</button>
            </div>
            <details class="collapsible-section" style="margin-top:8px">
                <summary>Map Management</summary>
                <div class="collapsible-section-body">
                    <div class="row" style="margin-bottom:6px">
                        <label class="small">Width <input type="number" id="mapResizeW" value="${currentMap.width}" min="8" max="256" style="width:56px"></label>
                        <label class="small">Height <input type="number" id="mapResizeH" value="${currentMap.height}" min="8" max="256" style="width:56px"></label>
                    </div>
                    <button id="resizeMapBtn" style="width:100%;margin-bottom:6px">Resize Map</button>
                    <hr class="action-divider">
                    <p class="small" style="margin:4px 0 4px">Expand map from any edge:</p>
                    <div class="row" style="margin-bottom:4px">
                        <label class="small">Tiles <input type="number" id="expandAmount" value="5" min="1" max="64" style="width:48px"></label>
                    </div>
                    <div class="expand-grid">
                        <button id="expandTopBtn" class="expand-btn" title="Add rows to top">+ Top</button>
                        <div class="expand-grid-mid">
                            <button id="expandLeftBtn" class="expand-btn" title="Add columns to left">+ Left</button>
                            <span class="expand-map-size small">${currentMap.width}×${currentMap.height}</span>
                            <button id="expandRightBtn" class="expand-btn" title="Add columns to right">+ Right</button>
                        </div>
                        <button id="expandBottomBtn" class="expand-btn" title="Add rows to bottom">+ Bottom</button>
                    </div>
                    <hr class="action-divider">
                    <button id="newMapBtn" style="width:100%;margin-bottom:4px">New Map</button>
                    <button id="cloneMapBtn" style="width:100%;margin-bottom:4px">Clone Map</button>
                    <button id="deleteMapBtn" style="width:100%;margin-bottom:4px;color:#ff8888">Delete Map</button>
                </div>
            </details>
            <h3>Map Health</h3>
            <div id="mapSummary" class="small" style="line-height:1.55;margin-bottom:8px"></div>
            <div id="topoStatus" class="small" style="line-height:1.6"></div>
            <button id="fixWarningsBtn" style="display:none;width:100%;margin-top:4px">Auto-Fix Warnings</button>
            <h3>Legend</h3>
            <div id="layerLegend" class="frame-strip"></div>
        </div>
        <div class="workspace">
            <div class="map-toolbar">
                <label class="toolbar-dd-label">Map
                    <select id="toolbarMapSelect" class="toolbar-dd">
                        ${state.tilemaps.map((m, idx) => `<option value="${idx}" ${idx === activeMapIndex ? 'selected' : ''}>${m.name}</option>`).join('')}
                    </select>
                </label>
                <div class="map-toolbar-sep"></div>
                <div class="toolbar-btn-group" title="Tools">
                    <button class="toolbar-tool-btn ${activeTileTool === 'select' ? 'active' : ''}" data-tool-pick="select" title="Select (S)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 1l8 5.5-3.5.5 2 4-2 1-2-4L2 11z" fill="currentColor"/></svg>
                    </button>
                    <button class="toolbar-tool-btn ${activeTileTool === 'pen' ? 'active' : ''}" data-tool-pick="pen" title="Brush (B)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 1.5l2 2-8 8H2.5v-2z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                    <button class="toolbar-tool-btn ${activeTileTool === 'erase' ? 'active' : ''}" data-tool-pick="erase" title="Eraser (E)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="4" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" transform="rotate(-25 6 7)"/><line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                    ${fillAllowed ? `<button class="toolbar-tool-btn ${activeTileTool === 'fill' ? 'active' : ''}" data-tool-pick="fill" title="Fill (F)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 10l4-8 4 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>` : ''}
                    ${shapesAllowed ? `
                    <button class="toolbar-tool-btn ${activeTileTool === 'line' ? 'active' : ''}" data-tool-pick="line" title="Line (L)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" stroke-width="1.5"/></svg>
                    </button>
                    <button class="toolbar-tool-btn ${activeTileTool === 'rect' ? 'active' : ''}" data-tool-pick="rect" title="Rect (X)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="3" width="10" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                    <button class="toolbar-tool-btn ${activeTileTool === 'circle' ? 'active' : ''}" data-tool-pick="circle" title="Circle (O)">
                        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>` : ''}
                </div>
                <div class="map-toolbar-sep"></div>
                <div class="toolbar-btn-group" title="Layers">
                    ${TILEMAP_LAYER_PRESETS.map((preset) => {
                        const sel = activeLayer === preset.layer && (!Number.isFinite(preset.tileValue) || activeTileValue === preset.tileValue);
                        const icons = {
                            floor: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="0.8"/><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="0.8"/></svg>',
                            walls: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="0.6"/><line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="0.6"/><line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" stroke-width="0.6"/><line x1="9" y1="5" x2="9" y2="9" stroke="currentColor" stroke-width="0.6"/><line x1="5" y1="9" x2="5" y2="13" stroke="currentColor" stroke-width="0.6"/></svg>',
                            doors: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="4" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="4" height="12" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
                            spawn: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="3" fill="currentColor"/><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>',
                            props: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="4" width="10" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="4" x2="4" y2="2" stroke="currentColor" stroke-width="1.2"/><line x1="10" y1="4" x2="10" y2="2" stroke="currentColor" stroke-width="1.2"/></svg>',
                            lights: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="1" x2="7" y2="2" stroke="currentColor" stroke-width="1"/><line x1="11" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1"/><line x1="2" y1="6" x2="3" y2="6" stroke="currentColor" stroke-width="1"/><line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1"/><line x1="5.5" y1="12" x2="8.5" y2="12" stroke="currentColor" stroke-width="1"/></svg>',
                            story: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="1" width="8" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="4" x2="9" y2="4" stroke="currentColor" stroke-width="0.8"/><line x1="5" y1="6" x2="9" y2="6" stroke="currentColor" stroke-width="0.8"/><line x1="5" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="0.8"/></svg>',
                            textures: '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1 10l4-5 3 3 2-2 3 4" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>',
                        };
                        return `<button class="toolbar-layer-btn ${sel ? 'active' : ''}" data-layer-pick="${preset.id}" title="${preset.label}">
                            ${icons[preset.id] || preset.label.charAt(0)}
                        </button>`;
                    }).join('')}
                </div>
                <button id="toolbarVisToggle" class="toolbar-icon-btn ${isLayerVisible(activeLayer) ? 'active' : ''}" title="Toggle layer visibility">${isLayerVisible(activeLayer) ? '👁' : '🚫'}</button>
                <button id="toolbarLockToggle" class="toolbar-icon-btn ${isLayerLocked(activeLayer) ? 'active' : ''}" title="Toggle layer lock">${isLayerLocked(activeLayer) ? '🔒' : '🔓'}</button>
                <div class="map-toolbar-sep"></div>
                <button id="clearLayerBtn" class="toolbar-sm-btn" title="Clear active layer">Clear Layer</button>
                <button id="undoBtn" class="toolbar-sm-btn" title="Undo (Ctrl+Z)">Undo</button>
                <button id="redoBtn" class="toolbar-sm-btn" title="Redo (Ctrl+Shift+Z)">Redo</button>
                <button id="mirrorMapBtn" class="toolbar-sm-btn" title="Mirror map horizontally">Mirror X</button>
                <button id="mirrorMapYBtn" class="toolbar-sm-btn" title="Mirror map vertically">Mirror Y</button>
                <div class="map-toolbar-sep"></div>
                <button id="zoomOutBtn" class="toolbar-icon-btn" title="Zoom out">&minus;</button>
                <span id="zoomLabel" class="toolbar-zoom-label">${_tilemapZoom}%</span>
                <button id="zoomInBtn" class="toolbar-icon-btn" title="Zoom in">+</button>
                <button id="zoomResetBtn" class="toolbar-sm-btn" title="Reset zoom to 100%">1:1</button>
                <div id="saveToast" class="save-toast"></div>
            </div>
            <canvas id="tilemapCanvas" class="tile-canvas"></canvas>
            <div class="small" style="margin-top:8px;color:var(--muted)">Shortcuts: 1-8 layers, B brush, E erase, F fill, S select, L line, X rect, O circle (Shift=filled), R rotate prop, Ctrl/Cmd+D duplicate, Shift+Arrows nudge, Middle-click drag to pan, Ctrl+Wheel zoom, Ctrl+Z undo, Ctrl+Shift+Z redo</div>
        </div>
    `;

    // --- Toolbar bindings ---
    document.getElementById('toolbarMapSelect')?.addEventListener('change', (ev) => {
        activeMapIndex = Number(ev.target.value);
        renderTilemapTab();
    });
    // Tool icon buttons
    document.querySelectorAll('[data-tool-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activeTileTool = btn.dataset.toolPick;
            if (activeTileTool !== 'select') selectedTile = null;
            shapeStartTile = null;
            shapePreviewTiles = [];
            renderTilemapTab();
        });
    });
    // Layer icon buttons
    document.querySelectorAll('[data-layer-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
            setActiveTilemapLayer(btn.dataset.layerPick);
        });
    });
    document.getElementById('toolbarVisToggle')?.addEventListener('click', () => {
        layerVisibility[activeLayer] = !isLayerVisible(activeLayer);
        renderTilemapTab();
    });
    document.getElementById('toolbarLockToggle')?.addEventListener('click', () => {
        layerLocks[activeLayer] = !isLayerLocked(activeLayer);
        renderTilemapTab();
    });


    // Selection inspector bindings
    document.getElementById('selTerrainVal')?.addEventListener('change', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (selectedTile && map.terrain?.[selectedTile.y]) {
            map.terrain[selectedTile.y][selectedTile.x] = Number(ev.target.value);
            saveState('Terrain changed');
            redrawTilemapCanvas();
        }
    });
    document.getElementById('selDoorVal')?.addEventListener('change', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (selectedTile && map.doors?.[selectedTile.y]) {
            map.doors[selectedTile.y][selectedTile.x] = Number(ev.target.value);
            saveState('Door changed');
            redrawTilemapCanvas();
        }
    });
    document.getElementById('selMarkerVal')?.addEventListener('change', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (selectedTile && map.markers?.[selectedTile.y]) {
            map.markers[selectedTile.y][selectedTile.x] = Number(ev.target.value);
            saveState('Marker changed');
            redrawTilemapCanvas();
        }
    });
    document.querySelectorAll('[data-sel-del-prop]').forEach(btn => {
        btn.addEventListener('click', () => {
            const map = state.tilemaps[activeMapIndex];
            map.props = (map.props || []).filter(p => p.id !== btn.dataset.selDelProp);
            saveState('Prop deleted');
            renderTilemapTab();
        });
    });
    document.querySelectorAll('[data-sel-del-light]').forEach(btn => {
        btn.addEventListener('click', () => {
            const map = state.tilemaps[activeMapIndex];
            map.lights = (map.lights || []).filter(l => l.id !== btn.dataset.selDelLight);
            saveState('Light deleted');
            renderTilemapTab();
        });
    });
    document.querySelectorAll('[data-sel-del-story]').forEach(btn => {
        btn.addEventListener('click', () => {
            const map = state.tilemaps[activeMapIndex];
            map.storyPoints = (map.storyPoints || []).filter(sp => sp.id !== btn.dataset.selDelStory);
            if (selectedObject?.id === btn.dataset.selDelStory) selectedObject = null;
            saveState('Story point deleted');
            renderTilemapTab();
        });
    });
    document.querySelectorAll('[data-sel-prop-radius]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const prop = (map.props || []).find((p) => p.id === input.dataset.selPropRadius);
            if (prop) {
                prop.radius = Math.max(4, Math.min(512, Number(input.value) || 18));
                saveState('Prop radius changed');
                redrawTilemapCanvas();
            }
        });
    });
    document.querySelectorAll('[data-sel-prop-rotation]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const prop = (map.props || []).find((p) => p.id === input.dataset.selPropRotation);
            if (prop) {
                prop.rotation = Number(input.value) || 0;
                saveState('Prop rotation changed');
                redrawTilemapCanvas();
            }
        });
    });
    document.querySelectorAll('[data-sel-prop-count]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const prop = (map.props || []).find((p) => p.id === input.dataset.selPropCount);
            if (prop) {
                prop.count = Math.max(1, Number(input.value) || 2);
                saveState('Alien spawn count changed');
                renderTilemapTab();
            }
        });
    });
    document.querySelectorAll('[data-sel-prop-zone-type]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const prop = (map.props || []).find((p) => p.id === input.dataset.selPropZoneType);
            if (prop) {
                prop.type = input.value;
                prop.imageKey = input.value;
                saveState('Zone type changed');
                renderTilemapTab();
            }
        });
    });
    // Light inline editors
    document.querySelectorAll('[data-sel-light-color]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const light = (map.lights || []).find(l => l.id === input.dataset.selLightColor);
            if (light) { light.color = input.value; saveState('Light color changed'); redrawTilemapCanvas(); }
        });
    });
    document.querySelectorAll('[data-sel-light-radius]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const light = (map.lights || []).find(l => l.id === input.dataset.selLightRadius);
            if (light) { light.radius = Number(input.value) || 240; saveState('Light radius changed'); redrawTilemapCanvas(); }
        });
    });
    document.querySelectorAll('[data-sel-light-brightness]').forEach(input => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const light = (map.lights || []).find(l => l.id === input.dataset.selLightBrightness);
            if (light) { light.brightness = Number(input.value) || 0.5; saveState('Light brightness changed'); redrawTilemapCanvas(); }
        });
    });
    document.getElementById('selClearTexture')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        if (selectedTile && map.terrainTextures?.[selectedTile.y]) {
            map.terrainTextures[selectedTile.y][selectedTile.x] = null;
            saveState('Texture cleared');
            redrawTilemapCanvas();
        }
    });
    document.getElementById('selTextureSwap')?.addEventListener('change', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (!selectedTile) return;
        if (!map.terrainTextures) {
            map.terrainTextures = Array.from({ length: map.height }, () => Array(map.width).fill(null));
        }
        const val = ev.target.value || null;
        map.terrainTextures[selectedTile.y][selectedTile.x] = val;
        pushTilemapUndo();
        saveState('Texture override changed');
        renderTilemapTab();
    });
    document.querySelectorAll('[data-sel-story-title]').forEach((input) => {
        input.addEventListener('input', () => {
            const map = state.tilemaps[activeMapIndex];
            const story = (map.storyPoints || []).find((sp) => sp.id === input.dataset.selStoryTitle);
            if (story) {
                story.title = input.value || 'Story Beat';
                redrawTilemapCanvas();
            }
        });
        input.addEventListener('change', () => saveState('Story point updated'));
    });
    document.querySelectorAll('[data-sel-story-kind]').forEach((input) => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const story = (map.storyPoints || []).find((sp) => sp.id === input.dataset.selStoryKind);
            if (story) {
                story.kind = input.value || 'story';
                saveState('Story point updated');
                redrawTilemapCanvas();
            }
        });
    });
    document.querySelectorAll('[data-sel-story-mission]').forEach((input) => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const story = (map.storyPoints || []).find((sp) => sp.id === input.dataset.selStoryMission);
            if (story) {
                story.missionId = input.value || 'all';
                saveState('Story point updated');
            }
        });
    });
    document.querySelectorAll('[data-sel-story-note]').forEach((input) => {
        input.addEventListener('change', () => {
            const map = state.tilemaps[activeMapIndex];
            const story = (map.storyPoints || []).find((sp) => sp.id === input.dataset.selStoryNote);
            if (story) {
                story.note = input.value || '';
                saveState('Story point updated');
            }
        });
    });

    document.getElementById('layerSelect')?.addEventListener('change', (ev) => {
        activeLayer = ev.target.value;
        if (activeLayer !== 'props' && TILE_VALUES[activeLayer]?.length) {
            activeTileValue = TILE_VALUES[activeLayer][0].value;
        }
        renderTilemapTab();
    });

    document.querySelectorAll('[data-layer-preset]').forEach((btn) => {
        btn.addEventListener('click', () => setActiveTilemapLayer(btn.dataset.layerPreset));
    });
    document.querySelectorAll('[data-layer-visible]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const layer = String(btn.dataset.layerVisible || '');
            layerVisibility[layer] = !isLayerVisible(layer);
            renderTilemapTab();
        });
    });
    document.querySelectorAll('[data-layer-lock]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const layer = String(btn.dataset.layerLock || '');
            layerLocks[layer] = !isLayerLocked(layer);
            renderTilemapTab();
        });
    });

    if (isPropsLayer) {
        document.getElementById('propRadiusInput')?.addEventListener('change', (ev) => {
            activePropRadius = Math.max(4, Math.min(64, Number(ev.target.value) || 18));
        });
        document.querySelectorAll('.prop-rot-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activePropRotation = Number(btn.dataset.rot) || 0;
                document.querySelectorAll('.prop-rot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    document.getElementById('storyKindSelect')?.addEventListener('change', (ev) => {
        activeStoryKind = String(ev.target.value || 'story');
    });
    document.getElementById('storyTitleInput')?.addEventListener('input', (ev) => {
        activeStoryTitle = String(ev.target.value || 'Story Beat');
    });
    document.getElementById('storyMissionSelect')?.addEventListener('change', (ev) => {
        activeStoryMissionId = String(ev.target.value || 'all');
    });
    document.getElementById('clearStoryBtn')?.addEventListener('click', () => {
        const count = (state.tilemaps[activeMapIndex].storyPoints || []).length;
        if (count === 0) return;
        if (!confirm(`Clear all ${count} story points from this map?`)) return;
        state.tilemaps[activeMapIndex].storyPoints = [];
        selectedObject = null;
        saveState('Story points cleared');
        renderTilemapTab();
    });

    document.getElementById('tileValueSelect')?.addEventListener('change', (ev) => {
        activeTileValue = Number(ev.target.value);
    });

    document.getElementById('openAssetBrowserBtn')?.addEventListener('click', () => {
        switchTab('sprite');
        renderAssetBrowserTab();
    });

    document.getElementById('openAssetBrowserBtn2')?.addEventListener('click', () => {
        switchTab('sprite');
        renderAssetBrowserTab();
    });

    document.getElementById('clearPropsBtn')?.addEventListener('click', () => {
        const count = (state.tilemaps[activeMapIndex].props || []).length;
        if (count === 0) return;
        if (!confirm(`Clear all ${count} props from this map?`)) return;
        state.tilemaps[activeMapIndex].props = [];
        saveState('Props cleared');
        renderTilemapTab();
    });

    document.getElementById('clearLightsBtn')?.addEventListener('click', () => {
        const count = (state.tilemaps[activeMapIndex].lights || []).length;
        if (count === 0) return;
        if (!confirm(`Clear all ${count} lights from this map?`)) return;
        state.tilemaps[activeMapIndex].lights = [];
        saveState('Lights cleared');
        renderTilemapTab();
    });

    document.getElementById('lightPresetRow')?.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-light-idx]');
        if (!btn) return;
        activeLightPresetIndex = Number(btn.dataset.lightIdx);
        renderTilemapTab();
    });

    document.getElementById('lightTypeRow')?.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-light-type]');
        if (!btn) return;
        const type = btn.dataset.lightType;
        activeLightPresets[activeLightPresetIndex].type = type;
        renderTilemapTab();
    });

    document.getElementById('lightColorInput')?.addEventListener('change', (ev) => {
        activeLightPresets[activeLightPresetIndex].color = ev.target.value;
        redrawTilemapCanvas();
    });

    document.getElementById('lightBrightnessInput')?.addEventListener('input', (ev) => {
        activeLightPresets[activeLightPresetIndex].brightness = Number(ev.target.value);
        renderTilemapTab();
        redrawTilemapCanvas();
    });

    document.getElementById('lightRadiusInput')?.addEventListener('input', (ev) => {
        activeLightPresets[activeLightPresetIndex].radius = Number(ev.target.value);
        renderTilemapTab();
        redrawTilemapCanvas();
    });

    document.getElementById('lightFlickerToggle')?.addEventListener('change', (ev) => {
        activeLightPresets[activeLightPresetIndex].flickering = ev.target.checked;
        redrawTilemapCanvas();
    });

    document.getElementById('lightPulseToggle')?.addEventListener('change', (ev) => {
        activeLightPresets[activeLightPresetIndex].pulsing = ev.target.checked;
        redrawTilemapCanvas();
    });

    document.getElementById('clearTexturesBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const count = countTerrainTextureOverrides(map);
        if (count === 0) return;
        if (!confirm(`Clear all ${count} texture overrides from this map?`)) return;
        map.terrainTextures = Array.from({ length: map.height }, () => Array(map.width).fill(null));
        saveState('Texture overrides cleared');
        renderTilemapTab();
    });

    document.querySelectorAll('[data-tex-key]').forEach((thumb) => {
        thumb.addEventListener('click', () => {
            activeTextureBrush = thumb.dataset.texKey;
            document.querySelectorAll('[data-tex-key]').forEach((t) => t.classList.toggle('asset-selected', t.dataset.texKey === activeTextureBrush));
        });
    });

    document.getElementById('openLargeTexAssetBtn')?.addEventListener('click', () => {
        // Set a flag so the asset browser knows we're picking for large texture
        window.__pickAssetForLargeTex = true;
        switchTab('sprite');
        renderAssetBrowserTab();
    });

    document.getElementById('clearLargeTexBtn')?.addEventListener('click', () => {
        state.tilemaps[activeMapIndex].largeTextures = [];
        saveState('Large textures cleared');
        renderTilemapTab();
    });

    document.querySelectorAll('[data-del-lt]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.delLt);
            const map = state.tilemaps[activeMapIndex];
            if (map.largeTextures?.[idx] !== undefined) {
                map.largeTextures.splice(idx, 1);
                saveState('Large texture deleted');
                renderTilemapTab();
            }
        });
    });

    document.getElementById('doorPresetRow')?.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-door-value]');
        if (!btn) return;
        activeDoorValue = Number(btn.dataset.doorValue);
        renderTilemapTab();
    });

    document.getElementById('propPresetRow')?.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-prop-key]');
        if (!btn) return;
        const asset = assetByKey[btn.dataset.propKey];
        if (!asset) return;
        activeBrushAsset = asset;
        activePropRadius = 18;
        activePropRotation = 0;
        renderTilemapTab();
    });

    document.getElementById('clearLayerBtn').addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        if (isLayerLocked(activeLayer)) {
            setStatus(`${activeLayer} is locked`);
            return;
        }
        if (!confirm(`Clear the entire ${activeLayer} layer?`)) return;
        pushTilemapUndo();
        if (activeLayer === 'textures') {
            map.terrainTextures = Array.from({ length: map.height }, () => Array(map.width).fill(null));
        } else if (activeLayer === 'props' || activeLayer === 'lights' || activeLayer === 'story') {
            map[activeLayer === 'story' ? 'storyPoints' : activeLayer] = [];
        } else {
            const fill = activeLayer === 'terrain' ? 1 : 0;
            map[activeLayer] = createGrid(map.width, map.height, fill);
        }
        saveState(`${activeLayer} cleared`);
        renderTilemapTab();
    });

    document.getElementById('mirrorMapBtn').addEventListener('click', () => {
        pushTilemapUndo();
        mirrorMapByAxis('x');
        saveState('Map mirrored horizontally');
        renderTilemapTab();
    });

    document.getElementById('mirrorMapYBtn').addEventListener('click', () => {
        pushTilemapUndo();
        mirrorMapByAxis('y');
        saveState('Map mirrored vertically');
        renderTilemapTab();
    });

    // --- Undo / Redo ---
    document.getElementById('undoBtn')?.addEventListener('click', () => {
        if (tilemapUndo()) {
            setStatus('Undo');
            renderTilemapTab();
        }
    });
    document.getElementById('redoBtn')?.addEventListener('click', () => {
        if (tilemapRedo()) {
            setStatus('Redo');
            renderTilemapTab();
        }
    });

    // --- Zoom controls ---
    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
        const idx = TILEMAP_ZOOM_STEPS.indexOf(_tilemapZoom);
        if (idx < TILEMAP_ZOOM_STEPS.length - 1) {
            _tilemapZoom = TILEMAP_ZOOM_STEPS[idx + 1];
        } else {
            _tilemapZoom = Math.min(400, _tilemapZoom + 25);
        }
        bindTilemapInput();
        redrawTilemapCanvas();
        const lbl = document.getElementById('zoomLabel');
        if (lbl) lbl.textContent = _tilemapZoom + '%';
    });
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
        const idx = TILEMAP_ZOOM_STEPS.indexOf(_tilemapZoom);
        if (idx > 0) {
            _tilemapZoom = TILEMAP_ZOOM_STEPS[idx - 1];
        } else {
            _tilemapZoom = Math.max(25, _tilemapZoom - 25);
        }
        bindTilemapInput();
        redrawTilemapCanvas();
        const lbl = document.getElementById('zoomLabel');
        if (lbl) lbl.textContent = _tilemapZoom + '%';
    });
    document.getElementById('zoomResetBtn')?.addEventListener('click', () => {
        _tilemapZoom = 100;
        bindTilemapInput();
        redrawTilemapCanvas();
        const lbl = document.getElementById('zoomLabel');
        if (lbl) lbl.textContent = '100%';
    });

    // --- Map management ---
    // Shared resize helper with optional x/y offset for directional expansion
    function resizeMap(newW, newH, offsetX = 0, offsetY = 0, label = '') {
        const map = state.tilemaps[activeMapIndex];
        newW = Math.max(8, Math.min(256, newW));
        newH = Math.max(8, Math.min(256, newH));
        if (newW === map.width && newH === map.height && offsetX === 0 && offsetY === 0) return;
        const resizeGrid = (grid, oldW, oldH, fill) => {
            const out = Array.from({ length: newH }, () => Array(newW).fill(fill));
            for (let y = 0; y < oldH; y++) {
                for (let x = 0; x < oldW; x++) {
                    const ny = y + offsetY, nx = x + offsetX;
                    if (ny >= 0 && ny < newH && nx >= 0 && nx < newW && grid[y]?.[x] !== undefined) {
                        out[ny][nx] = grid[y][x];
                    }
                }
            }
            return out;
        };
        map.terrain = resizeGrid(map.terrain, map.width, map.height, 1);
        map.doors = resizeGrid(map.doors, map.width, map.height, 0);
        map.markers = resizeGrid(map.markers, map.width, map.height, 0);
        map.terrainTextures = resizeGrid(map.terrainTextures, map.width, map.height, null);
        // Shift and clip props/lights/storyPoints
        const shiftAndClip = (arr) => arr.map(o => ({ ...o, tileX: o.tileX + offsetX, tileY: o.tileY + offsetY }))
            .filter(o => o.tileX >= 0 && o.tileX < newW && o.tileY >= 0 && o.tileY < newH);
        if (Array.isArray(map.props)) map.props = shiftAndClip(map.props);
        if (Array.isArray(map.lights)) map.lights = shiftAndClip(map.lights);
        if (Array.isArray(map.storyPoints)) map.storyPoints = shiftAndClip(map.storyPoints);
        map.width = newW;
        map.height = newH;
        saveState(label || `Resized map to ${newW}×${newH}`);
        renderTilemapTab();
    }

    document.getElementById('resizeMapBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const newW = Math.round(Number(document.getElementById('mapResizeW')?.value) || map.width);
        const newH = Math.round(Number(document.getElementById('mapResizeH')?.value) || map.height);
        resizeMap(newW, newH, 0, 0);
    });

    // Directional expand buttons
    const expandAmt = () => Math.max(1, Math.min(64, Math.round(Number(document.getElementById('expandAmount')?.value) || 5)));
    document.getElementById('expandTopBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const n = expandAmt();
        resizeMap(map.width, map.height + n, 0, n, `Expanded ${n} rows from top`);
    });
    document.getElementById('expandBottomBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const n = expandAmt();
        resizeMap(map.width, map.height + n, 0, 0, `Expanded ${n} rows from bottom`);
    });
    document.getElementById('expandLeftBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const n = expandAmt();
        resizeMap(map.width + n, map.height, n, 0, `Expanded ${n} columns from left`);
    });
    document.getElementById('expandRightBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const n = expandAmt();
        resizeMap(map.width + n, map.height, 0, 0, `Expanded ${n} columns from right`);
    });

    document.getElementById('newMapBtn')?.addEventListener('click', () => {
        const id = prompt('Map ID (e.g. map_custom_1):', `map_${Date.now()}`);
        if (!id) return;
        const name = prompt('Map name:', id);
        if (name === null) return;
        const w = Math.max(8, Math.min(256, Math.round(Number(prompt('Width (8-256):', '40')) || 40)));
        const h = Math.max(8, Math.min(256, Math.round(Number(prompt('Height (8-256):', '26')) || 26)));
        const newMap = normalizeTilemapShape({ id, name: name || id, width: w, height: h });
        state.tilemaps.push(newMap);
        activeMapIndex = state.tilemaps.length - 1;
        saveState(`Created new map: ${id}`);
        renderTilemapTab();
    });

    document.getElementById('cloneMapBtn')?.addEventListener('click', () => {
        const source = state.tilemaps[activeMapIndex];
        const newId = prompt('ID for cloned map:', `${source.id}_clone`);
        if (!newId) return;
        const cloned = normalizeTilemapShape(JSON.parse(JSON.stringify(source)));
        cloned.id = newId;
        cloned.name = `${source.name} (clone)`;
        state.tilemaps.push(cloned);
        activeMapIndex = state.tilemaps.length - 1;
        saveState(`Cloned map: ${newId}`);
        renderTilemapTab();
    });

    document.getElementById('deleteMapBtn')?.addEventListener('click', () => {
        if (state.tilemaps.length <= 1) {
            setStatus('Cannot delete the only map');
            return;
        }
        const map = state.tilemaps[activeMapIndex];
        if (!confirm(`Delete map "${map.name}" (${map.id})? This cannot be undone.`)) return;
        state.tilemaps.splice(activeMapIndex, 1);
        activeMapIndex = Math.min(activeMapIndex, state.tilemaps.length - 1);
        saveState(`Deleted map: ${map.id}`);
        renderTilemapTab();
    });

    document.getElementById('rebuildTiledBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('rebuildTiledBtn');
        btn.disabled = true;
        btn.textContent = 'Building…';
        try {
            const res = await fetch('/api/tiled-build', { method: 'POST' });
            const data = await res.json();
            if (data.ok) {
                setStatus('Tiled module rebuilt. Reload the page to use updated maps.');
                btn.textContent = 'Rebuild Module ✓';
            } else {
                setStatus('Tiled build failed — check console for details.');
                console.error('[tiled-build]', data.stderr || data.error);
                btn.textContent = 'Rebuild Module ✗';
            }
        } catch (e) {
            setStatus('Tiled build request failed: ' + e.message);
            btn.textContent = 'Rebuild Module ✗';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Rebuild Module'; }, 3000);
    });

    document.getElementById('exportTiledBtn')?.addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const tiled = buildTiledMapFromEditorMap(map);
        downloadJson(`${map.id || 'map'}.json`, tiled);
        setStatus(`Exported ${map.id} as Tiled JSON`);
    });

    document.getElementById('importTiledBtn')?.addEventListener('click', () => {
        document.getElementById('importTiledFile')?.click();
    });

    document.getElementById('importTiledFile')?.addEventListener('change', async (ev) => {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const tiledValidation = validateTiledMapShape(parsed);
            if (!tiledValidation.valid) {
                setStatus(`Tiled import blocked: ${tiledValidation.errors[0]}`);
                return;
            }
            const current = state.tilemaps[activeMapIndex];
            const importedMap = buildEditorMapFromTiledJson(parsed, current);
            const topo = validateMapTopology(importedMap);
            if (topo.errors.length > 0) {
                setStatus(`Tiled import blocked: ${topo.errors[0]}`);
                return;
            }
            state.tilemaps[activeMapIndex] = importedMap;
            saveState(`Imported Tiled map into ${current.id}${topo.warnings.length ? ` (${topo.warnings.length} warning${topo.warnings.length === 1 ? '' : 's'})` : ''}`);
            renderTilemapTab();
        } catch (err) {
            const detail = err && err.message ? err.message : 'invalid Tiled JSON';
            setStatus(`Tiled import failed: ${detail}`);
        }
    });

    document.getElementById('resetFromTiledBtn')?.addEventListener('click', () => {
        const current = state.tilemaps[activeMapIndex];
        const canonical = getCanonicalTiledMapById(current.id);
        if (!canonical) {
            setStatus(`No canonical Tiled map found for ${current.id}`);
            return;
        }
        state.tilemaps[activeMapIndex] = normalizeTilemapShape(canonical);
        saveState(`Reset ${current.id} from canonical Tiled data`);
        renderTilemapTab();
    });

    document.getElementById('lockdownDoorsBtn')?.addEventListener('click', () => applyDoorDirective('lockdown'));
    document.getElementById('releaseDoorsBtn')?.addEventListener('click', () => applyDoorDirective('release'));

    document.getElementById('resetLayerFromTiledBtn')?.addEventListener('click', () => {
        const current = state.tilemaps[activeMapIndex];
        const canonical = getCanonicalTiledMapById(current.id);
        if (!canonical) {
            setStatus(`No canonical Tiled map found for ${current.id}`);
            return;
        }
        const normalizedCanonical = normalizeTilemapShape(canonical);
        if (activeLayer === 'textures') {
            current.terrainTextures = normalizedCanonical.terrainTextures.map((row) => row.slice());
        } else if (activeLayer === 'props') {
            current.props = normalizedCanonical.props.map((prop) => ({ ...prop }));
        } else if (activeLayer === 'terrain' || activeLayer === 'doors' || activeLayer === 'markers') {
            current[activeLayer] = normalizedCanonical[activeLayer].map((row) => row.slice());
        } else {
            setStatus(`Reset layer not supported for ${activeLayer}`);
            return;
        }
        saveState(`Reset ${activeLayer} from canonical Tiled data`);
        renderTilemapTab();
    });

    document.getElementById('debugOverlayBtn').addEventListener('click', () => {
        showDebugOverlay = !showDebugOverlay;
        document.getElementById('debugOverlayBtn').classList.toggle('active', showDebugOverlay);
        redrawTilemapCanvas();
    });

    // Atmosphere sliders
    document.getElementById('atmosDarknessSlider')?.addEventListener('input', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (!map.atmosphere) map.atmosphere = {};
        map.atmosphere.ambientDarkness = Number(ev.target.value);
        ev.target.previousElementSibling.textContent = `Ambient Darkness (${map.atmosphere.ambientDarkness.toFixed(2)})`;
    });
    document.getElementById('atmosDarknessSlider')?.addEventListener('change', () => saveState('Atmosphere updated'));

    document.getElementById('atmosTorchSlider')?.addEventListener('input', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (!map.atmosphere) map.atmosphere = {};
        map.atmosphere.torchRange = Number(ev.target.value);
        ev.target.previousElementSibling.textContent = `Torch Range (${map.atmosphere.torchRange}px)`;
    });
    document.getElementById('atmosTorchSlider')?.addEventListener('change', () => saveState('Atmosphere updated'));

    document.getElementById('atmosDustSlider')?.addEventListener('input', (ev) => {
        const map = state.tilemaps[activeMapIndex];
        if (!map.atmosphere) map.atmosphere = {};
        map.atmosphere.dustDensity = Number(ev.target.value);
        ev.target.previousElementSibling.textContent = `Dust Density (${map.atmosphere.dustDensity.toFixed(2)})`;
    });
    document.getElementById('atmosDustSlider')?.addEventListener('change', () => saveState('Atmosphere updated'));

    for (const [elId, key] of [['atmosVentHum', 'ventHum'], ['atmosPipeGroans', 'pipeGroans'], ['atmosDistantThumps', 'distantThumps'], ['atmosAlienChitter', 'alienChittering']]) {
        document.getElementById(elId)?.addEventListener('change', (ev) => {
            const map = state.tilemaps[activeMapIndex];
            if (!map.atmosphere) map.atmosphere = {};
            map.atmosphere[key] = ev.target.checked;
            saveState('Atmosphere updated');
        });
    }

    const legend = document.getElementById('layerLegend');
    legend.innerHTML = '';
    for (const item of (TILE_VALUES[activeLayer] || [])) {
        const d = document.createElement('div');
        d.className = 'small';
        d.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${item.color};border:1px solid #618198;margin-right:6px"></span>${item.value}: ${item.label}`;
        legend.appendChild(d);
    }

    // Quick asset drag-and-drop
    document.querySelectorAll('.quick-asset-thumb[draggable]').forEach(thumb => {
        thumb.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('application/x-alien-asset', JSON.stringify({
                key: thumb.dataset.dragKey,
                category: thumb.dataset.dragCategory,
            }));
            ev.dataTransfer.effectAllowed = 'copy';
        });
    });

    renderCanonicalTiledStatus();
    renderMapSummary();

    tilemapCtx = document.getElementById('tilemapCanvas').getContext('2d');
    // Set cursor data attribute for CSS-based tool cursor
    const canvasEl = tilemapCtx.canvas;
    canvasEl.dataset.tool = activeTileTool;
    if (isLayerLocked(activeLayer)) {
        canvasEl.dataset.toolLocked = '';
    } else {
        delete canvasEl.dataset.toolLocked;
    }
    bindTilemapInput();
    redrawTilemapCanvas();

    // Canvas drop target for quick assets
    const tileCanvas = document.getElementById('tilemapCanvas');
    if (tileCanvas) {
        tileCanvas.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            tileCanvas.classList.add('drag-over');
        });
        tileCanvas.addEventListener('dragleave', () => {
            tileCanvas.classList.remove('drag-over');
        });
        tileCanvas.addEventListener('drop', (ev) => {
            ev.preventDefault();
            tileCanvas.classList.remove('drag-over');
            const raw = ev.dataTransfer.getData('application/x-alien-asset');
            if (!raw) return;
            let asset;
            try { asset = JSON.parse(raw); } catch { return; }
            const map = state.tilemaps[activeMapIndex];
            const rect = tileCanvas.getBoundingClientRect();
            const scale = tileCanvas.width / rect.width;
            const px = (ev.clientX - rect.left) * scale;
            const py = (ev.clientY - rect.top) * scale;
            const cell = Math.round(24 * _tilemapZoom / 100); // matches redrawTilemapCanvas cell size
            const tileX = Math.floor(px / cell);
            const tileY = Math.floor(py / cell);
            if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) return;

            if (asset.category === 'prop' || asset.category === 'alien' || asset.category === 'zone') {
                pushTilemapUndo();
                if (!map.props) map.props = [];
                // Replace any existing prop at this tile
                map.props = map.props.filter(p => !(p.tileX === tileX && p.tileY === tileY));
                const propType = asset.category === 'alien' ? 'alien_spawn'
                    : asset.category === 'zone' ? asset.key
                    : 'prop';
                const newProp = {
                    id: makePropId(),
                    tileX,
                    tileY,
                    type: propType,
                    imageKey: asset.key,
                    radius: asset.category === 'zone' ? 128 : 18,
                    rotation: activePropRotation || 0,
                };
                if (propType === 'alien_spawn') {
                    newProp.count = 4;
                }
                map.props.push(newProp);
                saveState(`Dropped ${asset.key} at (${tileX},${tileY})`);
            } else if (asset.category === 'floor' || asset.category === 'wall') {
                pushTilemapUndo();
                if (!map.terrainTextures) {
                    map.terrainTextures = Array.from({ length: map.height }, () => Array(map.width).fill(null));
                }
                if (map.terrainTextures[tileY]) {
                    map.terrainTextures[tileY][tileX] = asset.key;
                }
                saveState(`Dropped ${asset.key} texture at (${tileX},${tileY})`);
            }
            redrawTilemapCanvas();
        });
    }

    // Topology health badge
    const topo = validateMapTopology(currentMap);
    const topoEl = document.getElementById('topoStatus');
    const fixBtn = document.getElementById('fixWarningsBtn');
    if (topoEl) {
        if (topo.errors.length > 0) {
            topoEl.innerHTML = topo.errors.map((e) => `<span style="color:#ff6b6b">✖ ${e}</span>`).join('<br>');
        } else if (topo.warnings.length > 0) {
            topoEl.innerHTML = topo.warnings.map((w) => `<span style="color:#ffd27a">⚠ ${w}</span>`).join('<br>');
            if (fixBtn) fixBtn.style.display = '';
        } else {
            topoEl.innerHTML = '<span style="color:#8ce0b7">✔ Map OK</span>';
        }
    }
    fixBtn?.addEventListener('click', () => {
        const result = autoFixMapTopology(currentMap);
        if (result.fixed.length > 0) {
            saveState(`Auto-fixed: ${result.fixed.join('; ')}`);
            renderTilemapTab();
            setStatus(`Fixed: ${result.fixed.join('; ')}`);
        }
        if (result.couldNotFix.length > 0) setStatus(`Could not fix: ${result.couldNotFix.join('; ')}`);
    });
}

function bindTilemapInput() {
    // Abort previous listeners to prevent handler accumulation on re-render
    if (_tilemapAbort) _tilemapAbort.abort();
    _tilemapAbort = new AbortController();
    const signal = _tilemapAbort.signal;

    const canvas = document.getElementById('tilemapCanvas');
    const map = state.tilemaps[activeMapIndex];
    const cellSize = Math.round(24 * _tilemapZoom / 100);
    let drawing = false;
    let dirty = false;
    let dragState = null;

    const getTileFromEvent = (event) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.floor((event.clientX - rect.left) * scaleX / cellSize),
            y: Math.floor((event.clientY - rect.top) * scaleY / cellSize),
        };
    };

    const applyAt = (event) => {
        const { x, y } = getTileFromEvent(event);
        if (isLayerLocked(activeLayer)) {
            setStatus(`${activeLayer} is locked`);
            return;
        }

        // Props layer: object placement
        if (activeLayer === 'props') {
            if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
            const brushAsset = activeBrushAsset || PROP_PRESETS[0] || null;
            if (activeTileTool === 'erase') {
                map.props = map.props.filter((p) => !(p.tileX === x && p.tileY === y));
            } else if (brushAsset) {
                // Replace any existing prop at this tile, then place new one
                map.props = map.props.filter((p) => !(p.tileX === x && p.tileY === y));
                map.props.push({
                    id: makePropId(),
                    tileX: x,
                    tileY: y,
                    type: brushAsset.category,
                    imageKey: brushAsset.key,
                    radius: activePropRadius,
                    rotation: activePropRotation || 0
                });
            }
            dirty = true;
            redrawTilemapCanvas();
            return;
        }

        // Lights layer: object placement
        if (activeLayer === 'lights') {
            if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
            if (activeTileTool === 'erase') {
                map.lights = (map.lights || []).filter((l) => !(l.tileX === x && l.tileY === y));
            } else {
                const preset = activeLightPresets[activeLightPresetIndex];
                if (preset) {
                    // Replace existing light at tile
                    map.lights = (map.lights || []).filter((l) => !(l.tileX === x && l.tileY === y));
                    map.lights.push({
                        id: makePropId(),
                        tileX: x,
                        tileY: y,
                        type: preset.type,
                        color: preset.color,
                        radius: preset.radius,
                        brightness: preset.brightness,
                        flickering: !!preset.flickering,
                        pulsing: !!preset.pulsing
                    });
                }
            }
            dirty = true;
            redrawTilemapCanvas();
            return;
        }

        if (activeLayer === 'story') {
            if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
            if (!Array.isArray(map.storyPoints)) map.storyPoints = [];
            if (activeTileTool === 'erase') {
                map.storyPoints = map.storyPoints.filter((sp) => !(sp.tileX === x && sp.tileY === y));
            } else {
                map.storyPoints = map.storyPoints.filter((sp) => !(sp.tileX === x && sp.tileY === y));
                map.storyPoints.push({
                    id: makePropId(),
                    tileX: x,
                    tileY: y,
                    title: activeStoryTitle || 'Story Beat',
                    note: '',
                    kind: activeStoryKind || 'story',
                    missionId: activeStoryMissionId || 'all',
                });
            }
            dirty = true;
            redrawTilemapCanvas();
            return;
        }

        // Textures layer: per-tile texture override
        if (activeLayer === 'textures') {
            if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
            if (!map.terrainTextures) map.terrainTextures = Array.from({ length: map.height }, () => Array(map.width).fill(null));
            map.terrainTextures[y][x] = activeTileTool === 'erase' ? null : (activeTextureBrush || null);
            dirty = true;
            redrawTilemapCanvas();
            return;
        }

        if (activeLayer === 'doors') {
            if (activeTileTool === 'fill') {
                floodFill(map.doors, x, y, activeDoorValue);
                dirty = true;
                redrawTilemapCanvas();
                return;
            }
            map.doors[y][x] = activeTileTool === 'erase' ? 0 : activeDoorValue;
            dirty = true;
            redrawTilemapCanvas();
            return;
        }

        if (!map[activeLayer]?.[y] || typeof map[activeLayer][y][x] === 'undefined') return;

        if (activeTileTool === 'fill') {
            floodFill(map[activeLayer], x, y, activeTileValue);
            redrawTilemapCanvas();
            dirty = true;
            saveState(`Filled ${activeLayer}`);
            return;
        }

        if (activeLayer === 'markers' && activeTileTool !== 'erase' && SINGLE_INSTANCE_MARKERS.has(activeTileValue)) {
            for (let yy = 0; yy < map.height; yy++) {
                for (let xx = 0; xx < map.width; xx++) {
                    if (map.markers[yy][xx] === activeTileValue) {
                        map.markers[yy][xx] = 0;
                    }
                }
            }
        }

        map[activeLayer][y][x] = activeTileTool === 'erase' ? 0 : activeTileValue;
        dirty = true;
        redrawTilemapCanvas();
    };

    // Hover tooltip for tile inspection
    let tooltip = document.getElementById('tileTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tileTooltip';
        tooltip.style.cssText = 'position:fixed;pointer-events:none;z-index:10000;display:none;' +
            'background:rgba(6,16,24,0.94);color:#c4dbe8;border:1px solid #2a5a78;border-radius:6px;' +
            'padding:6px 10px;font:11px/1.5 monospace;max-width:280px;box-shadow:0 4px 12px rgba(0,0,0,0.5)';
        document.body.appendChild(tooltip);
    }

    const getTileInfo = (x, y) => {
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
        const lines = [`<b style="color:#7ecfff">Tile (${x}, ${y})</b>`];
        const tv = map.terrain?.[y]?.[x];
        if (isLayerVisible('terrain')) {
            const terrainLabel = TILE_VALUES.terrain.find(v => v.value === tv)?.label || String(tv);
            lines.push(`Terrain: <span style="color:${tv === 1 ? '#8093a3' : '#4a6a7c'}">${terrainLabel}</span>`);
        }
        const dv = map.doors?.[y]?.[x];
        if (isLayerVisible('doors') && dv > 0) {
            const doorLabel = TILE_VALUES.doors.find(v => v.value === dv)?.label || String(dv);
            lines.push(`Door: <span style="color:#a3504e">${doorLabel}</span>`);
        }
        const mv = map.markers?.[y]?.[x];
        if (isLayerVisible('markers') && mv > 0) {
            const markerLabel = TILE_VALUES.markers.find(v => v.value === mv)?.label || String(mv);
            lines.push(`Marker: <span style="color:#4fdb8e">${markerLabel}</span>`);
        }
        const propsHere = isLayerVisible('props') ? (map.props || []).filter(p => p.tileX === x && p.tileY === y) : [];
        for (const p of propsHere) {
            lines.push(`Prop: <span style="color:#d5a858">${p.imageKey || p.type || 'unknown'}</span> r=${p.radius || 0}`);
        }
        const lightsHere = isLayerVisible('lights') ? (map.lights || []).filter(l => l.tileX === x && l.tileY === y) : [];
        for (const l of lightsHere) {
            lines.push(`Light: <span style="color:${l.color || '#fff'}">${l.type || 'spot'}</span> r=${l.radius || 0} b=${l.brightness || 0}`);
        }
        const storyHere = isLayerVisible('story') ? (map.storyPoints || []).filter(sp => sp.tileX === x && sp.tileY === y) : [];
        for (const sp of storyHere) {
            lines.push(`Story: <span style="color:#7ecfff">${sp.title || 'Story Beat'}</span> (${sp.kind || 'story'})`);
        }
        const texOverride = isLayerVisible('textures') ? map.terrainTextures?.[y]?.[x] : null;
        if (texOverride) lines.push(`Texture: <span style="color:#9a8fcc">${texOverride}</span>`);
        lines.push(`Floor: ${map.floorTextureKey || 'default'}`);
        lines.push(`Wall: ${map.wallTextureKey || 'default'}`);
        return lines.join('<br>');
    };

    canvas.addEventListener('pointerdown', (ev) => {
        tooltip.style.display = 'none';
        const { x, y } = getTileFromEvent(ev);
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
        selectedTile = { x, y };

        if (activeTileTool === 'select') {
            const found = findObjectAtTile(map, x, y);
            selectedObject = found;
            if (found) {
                pushTilemapUndo();
                dragState = { ...found, startX: x, startY: y };
                if (found.kind === 'marker') {
                    selectMode = 'object';
                }
                redrawTilemapCanvas();
                return;
            }
            selectMode = 'floor';
            renderTilemapTab();
            return;
        }

        selectedObject = null;
        if (SHAPE_TOOLS.has(activeTileTool)) {
            if (isLayerLocked(activeLayer)) return;
            pushTilemapUndo();
            shapeStartTile = { x, y };
            shapePreviewTiles = [{ x, y }];
            redrawTilemapCanvas();
            return;
        }
        pushTilemapUndo();
        drawing = true;
        applyAt(ev);
    }, { signal });
    canvas.addEventListener('pointermove', (ev) => {
        const { x, y } = getTileFromEvent(ev);
        if (dragState) {
            if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
            if (dragState.kind === 'prop') {
                const prop = (map.props || []).find((p) => p.id === dragState.id);
                if (prop) {
                    prop.tileX = x;
                    prop.tileY = y;
                    selectedTile = { x, y };
                    dirty = true;
                    redrawTilemapCanvas();
                }
            } else if (dragState.kind === 'light') {
                const light = (map.lights || []).find((l) => l.id === dragState.id);
                if (light) {
                    light.tileX = x;
                    light.tileY = y;
                    selectedTile = { x, y };
                    dirty = true;
                    redrawTilemapCanvas();
                }
            } else if (dragState.kind === 'story') {
                const story = (map.storyPoints || []).find((sp) => sp.id === dragState.id);
                if (story) {
                    story.tileX = x;
                    story.tileY = y;
                    selectedTile = { x, y };
                    dirty = true;
                    redrawTilemapCanvas();
                }
            } else if (dragState.kind === 'marker') {
                const markerValue = Number(dragState.value) || 0;
                if (markerValue > 0 && (dragState.startX !== x || dragState.startY !== y)) {
                    map.markers[dragState.startY][dragState.startX] = 0;
                    clearUniqueMarker(map, markerValue, x, y);
                    map.markers[y][x] = markerValue;
                    dragState.startX = x;
                    dragState.startY = y;
                    selectedTile = { x, y };
                    selectedObject = { kind: 'marker', x, y, value: markerValue };
                    dirty = true;
                    redrawTilemapCanvas();
                }
            }
            return;
        }
        if (shapeStartTile && SHAPE_TOOLS.has(activeTileTool)) {
            const s = shapeStartTile;
            const filled = ev.shiftKey;
            if (activeTileTool === 'line') {
                shapePreviewTiles = getLineTiles(s.x, s.y, x, y);
            } else if (activeTileTool === 'rect') {
                shapePreviewTiles = getRectTiles(s.x, s.y, x, y, filled);
            } else if (activeTileTool === 'circle') {
                const r = Math.round(Math.hypot(x - s.x, y - s.y));
                shapePreviewTiles = getCircleTiles(s.x, s.y, r, filled);
            }
            redrawTilemapCanvas();
            return;
        }
        if (drawing) { applyAt(ev); return; }
        const info = getTileInfo(x, y);
        if (info) {
            tooltip.innerHTML = info;
            tooltip.style.display = 'block';
            tooltip.style.left = (ev.clientX + 14) + 'px';
            tooltip.style.top = (ev.clientY + 14) + 'px';
            // Show tile coordinates in status bar
            const saveToast = document.getElementById('saveToast');
            if (saveToast && !saveToast.classList.contains('visible')) {
                statusEl.textContent = `Tile (${x}, ${y})`;
            }
        } else {
            tooltip.style.display = 'none';
        }
    }, { signal });
    canvas.addEventListener('pointerleave', () => {
        tooltip.style.display = 'none';
        if (shapeStartTile) {
            shapeStartTile = null;
            shapePreviewTiles = [];
            redrawTilemapCanvas();
        }
    }, { signal });
    // Right-click: show floating context menu
    canvas.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const { x, y } = getTileFromEvent(ev);
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;
        showTileContextMenu(x, y, ev.clientX, ev.clientY);
    }, { signal });
    // Also hide context menu on left-click canvas
    canvas.addEventListener('pointerdown', (ev) => {
        if (ev.button === 0) hideTileContextMenu();
    }, { capture: true, signal });
    window.addEventListener('pointerup', () => {
        if (shapeStartTile && SHAPE_TOOLS.has(activeTileTool)) {
            commitShapeTiles(shapePreviewTiles);
            shapeStartTile = null;
            shapePreviewTiles = [];
            return;
        }
        if (dragState && dirty) {
            saveState(`${dragState.kind} moved`);
            renderTilemapTab();
        } else if (drawing && dirty) {
            saveState(`${activeLayer} painted`);
        }
        dragState = null;
        drawing = false;
        dirty = false;
        _isPanning = false;
    }, { signal });

    // Mouse wheel zoom (Ctrl+wheel or just wheel on canvas)
    canvas.addEventListener('wheel', (ev) => {
        if (!ev.ctrlKey && !ev.metaKey) return; // only zoom with Ctrl held
        ev.preventDefault();
        const dir = ev.deltaY < 0 ? 1 : -1;
        const idx = TILEMAP_ZOOM_STEPS.indexOf(_tilemapZoom);
        if (dir > 0 && idx < TILEMAP_ZOOM_STEPS.length - 1) {
            _tilemapZoom = TILEMAP_ZOOM_STEPS[idx + 1];
        } else if (dir < 0 && idx > 0) {
            _tilemapZoom = TILEMAP_ZOOM_STEPS[idx - 1];
        } else {
            return;
        }
        bindTilemapInput();
        redrawTilemapCanvas();
        const lbl = document.getElementById('zoomLabel');
        if (lbl) lbl.textContent = _tilemapZoom + '%';
    }, { passive: false, signal });

    // Middle-click pan: drag to scroll the canvas container
    canvas.addEventListener('pointerdown', (ev) => {
        if (ev.button === 1) { // middle click
            ev.preventDefault();
            _isPanning = true;
            canvas.style.cursor = 'grabbing';
            canvas.setPointerCapture(ev.pointerId);
        }
    }, { signal });
    canvas.addEventListener('pointermove', (ev) => {
        if (!_isPanning) return;
        const container = canvas.closest('.workspace');
        if (container) {
            container.scrollLeft -= ev.movementX;
            container.scrollTop -= ev.movementY;
        }
    }, { signal });
    canvas.addEventListener('pointerup', (ev) => {
        if (ev.button === 1 && _isPanning) {
            _isPanning = false;
            canvas.style.cursor = '';
            canvas.releasePointerCapture(ev.pointerId);
        }
    }, { signal });
}

function computeFloorRegions(map) {
    const visited = Array.from({ length: map.height }, () => new Array(map.width).fill(-1));
    const regions = [];
    let regionId = 0;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.terrain[y][x] === 0 && visited[y][x] === -1) {
                const queue = [[x, y]];
                visited[y][x] = regionId;
                const cells = [];
                while (queue.length > 0) {
                    const [cx, cy] = queue.shift();
                    cells.push([cx, cy]);
                    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height
                            && map.terrain[ny][nx] === 0 && visited[ny][nx] === -1) {
                            visited[ny][nx] = regionId;
                            queue.push([nx, ny]);
                        }
                    }
                }
                regions.push({ id: regionId, cells });
                regionId++;
            }
        }
    }
    return { regions, visited };
}

function floodReachableTerrain(map, starts, blockedSet, limit = 96) {
    if (!map || !Array.isArray(starts) || starts.length === 0) return 0;
    const q = [];
    const seen = new Set();
    for (const s of starts) {
        if (s.x < 0 || s.x >= map.width || s.y < 0 || s.y >= map.height) continue;
        if (map.terrain[s.y][s.x] !== 0) continue;
        const key = `${s.x},${s.y}`;
        if (blockedSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        q.push(s);
    }
    for (let i = 0; i < q.length && seen.size < limit; i++) {
        const c = q[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = c.x + dx, ny = c.y + dy;
            if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && map.terrain[ny][nx] === 0) {
                const key = `${nx},${ny}`;
                if (blockedSet.has(key) || seen.has(key)) continue;
                seen.add(key);
                q.push({ x: nx, y: ny });
            }
        }
    }
    return seen.size;
}

function computeDoorReaches(map) {
    const reaches = [];
    const visited = new Set();
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.doors[y][x] > 0 && !visited.has(`${x},${y}`)) {
                let orientation = null;
                let tiles = [];
                if (y + 1 < map.height && map.doors[y + 1][x] > 0) {
                    orientation = 'vertical';
                    tiles = [{ x, y }, { x, y: y + 1 }];
                } else if (x + 1 < map.width && map.doors[y][x + 1] > 0) {
                    orientation = 'horizontal';
                    tiles = [{ x, y }, { x: x + 1, y }];
                }

                if (orientation) {
                    tiles.forEach(t => visited.add(`${t.x},${t.y}`));
                    const blocked = new Set(tiles.map(t => `${t.x},${t.y}`));
                    let sideA = [], sideB = [];
                    if (orientation === 'vertical') {
                        sideA = [{ x: x - 1, y }, { x: x - 1, y: y + 1 }];
                        sideB = [{ x: x + 1, y }, { x: x + 1, y: y + 1 }];
                    } else {
                        sideA = [{ x, y: y - 1 }, { x: x + 1, y: y - 1 }];
                        sideB = [{ x, y: y + 1 }, { x: x + 1, y: y + 1 }];
                    }
                    reaches.push({
                        x, y,
                        orientation,
                        reachA: floodReachableTerrain(map, sideA, blocked),
                        reachB: floodReachableTerrain(map, sideB, blocked)
                    });
                }
            }
        }
    }
    return reaches;
}

function autoFixMapTopology(map) {
    const fixed = [];
    const couldNotFix = [];

    let spawnPos = null;
    for (let y = 0; y < map.height && !spawnPos; y++) {
        for (let x = 0; x < map.width && !spawnPos; x++) {
            if (map.markers[y][x] === 1) spawnPos = { x, y };
        }
    }

    // Fix 1: remove alien spawns too close to marine spawn
    if (spawnPos) {
        let removed = 0;
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                if (map.markers[y][x] === 5 && Math.sqrt((x - spawnPos.x) ** 2 + (y - spawnPos.y) ** 2) < 10) {
                    map.markers[y][x] = 0;
                    removed++;
                }
            }
        }
        if (removed > 0) fixed.push(`Removed ${removed} alien spawn(s) within 10 tiles of marine spawn`);
    }

    // Fix 2: auto-place alien spawns if none exist
    let alienCount = 0;
    for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++)
            if (map.markers[y][x] === 5) alienCount++;

    if (alienCount === 0) {
        const minDist = spawnPos ? 15 : 0;
        const candidates = [];
        for (let y = 0; y < map.height; y++)
            for (let x = 0; x < map.width; x++)
                if (map.terrain[y][x] === 0 && map.markers[y][x] === 0) {
                    const d = spawnPos ? Math.sqrt((x - spawnPos.x) ** 2 + (y - spawnPos.y) ** 2) : 999;
                    if (d >= minDist) candidates.push({ x, y, d });
                }
        candidates.sort((a, b) => b.d - a.d);
        const placed = [];
        for (const c of candidates) {
            if (placed.length >= 6) break;
            if (!placed.some((p) => Math.sqrt((c.x - p.x) ** 2 + (c.y - p.y) ** 2) < 8)) {
                map.markers[c.y][c.x] = 5;
                placed.push(c);
            }
        }
        if (placed.length > 0) fixed.push(`Auto-placed ${placed.length} alien spawn markers`);
        else couldNotFix.push('No valid floor tiles for alien spawns');
    }

    // Fix 3: move marine spawn onto nearest floor tile if it sits on a wall
    if (spawnPos && map.terrain[spawnPos.y]?.[spawnPos.x] !== 0) {
        let best = null, bestDist = 999;
        for (let y = 0; y < map.height; y++)
            for (let x = 0; x < map.width; x++) {
                if (map.terrain[y][x] === 0 && map.markers[y][x] === 0) {
                    const d = Math.sqrt((x - spawnPos.x) ** 2 + (y - spawnPos.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = { x, y }; }
                }
            }
        if (best) {
            map.markers[spawnPos.y][spawnPos.x] = 0;
            map.markers[best.y][best.x] = 1;
            fixed.push(`Moved marine spawn off wall to (${best.x},${best.y})`);
        } else {
            couldNotFix.push('Marine spawn is on a wall and no floor tiles found');
        }
    }

    return { fixed, couldNotFix };
}

function validateMapTopology(map) {
    const { regions, visited } = computeFloorRegions(map);
    const errors = [];
    const warnings = [];

    // 1. Connectivity: Marine Spawn -> Extraction
    let spawnPos = null;
    let extractPos = null;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.markers[y][x] === 1) spawnPos = { x, y };
            if (map.markers[y][x] === 2) extractPos = { x, y };
        }
    }

    const getRegionAt = (tx, ty) => {
        if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return -1;
        if (visited[ty][tx] >= 0) return visited[ty][tx];
        // If on a door or wall, check neighbors
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = tx + dx, ny = ty + dy;
            if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && visited[ny][nx] >= 0) {
                return visited[ny][nx];
            }
        }
        return -1;
    };

    if (!spawnPos) errors.push('Mission has no marine spawn marker');
    if (!extractPos) errors.push('Mission has no extraction marker');

    if (spawnPos && extractPos) {
        const spawnRegion = getRegionAt(spawnPos.x, spawnPos.y);
        const extractRegion = getRegionAt(extractPos.x, extractPos.y);
        if (spawnRegion === -1) errors.push('Marine spawn is in an unreachable area (walls)');
        if (extractRegion === -1) errors.push('Extraction point is in an unreachable area (walls)');
        if (spawnRegion >= 0 && extractRegion >= 0 && spawnRegion !== extractRegion) {
            // Check if they are connected via doors
            // This is a simplified check: we assume if they are in different regions, they are DISCONNECTED
            // because computeFloorRegions treats doors as blockers.
            // Designers must ensure all rooms are connected by doors or floor.
            warnings.push(`Marine spawn (Region ${spawnRegion}) and Extraction (Region ${extractRegion}) are in disconnected areas.`);
        }
    }

    // 2. Door Reach
    const reaches = computeDoorReaches(map);
    for (const dr of reaches) {
        if (dr.reachA < 14 || dr.reachB < 14) {
            warnings.push(`Door at ${dr.x},${dr.y} has weak side reach (${dr.reachA}⚡${dr.reachB}). Min 14 recommended.`);
        }
    }

    // 3. Alien Spawns
    let alienSpawnCount = 0;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (map.markers[y][x] === 5) {
                alienSpawnCount++;
                if (spawnPos && Math.sqrt((x - spawnPos.x)**2 + (y - spawnPos.y)**2) < 10) {
                    warnings.push(`Alien spawn at ${x},${y} is too close to marine spawn.`);
                }
            }
        }
    }
    if (alienSpawnCount === 0) warnings.push('No alien spawn markers placed; using default random walkable tiles.');

    return { errors, warnings };
}

let _tilemapRedrawRequested = false;
function redrawTilemapCanvas() {
    if (_tilemapRedrawRequested) return;
    _tilemapRedrawRequested = true;
    requestAnimationFrame(_redrawTilemapCanvasImpl);
}

function _redrawTilemapCanvasImpl() {
    _tilemapRedrawRequested = false;
    if (!tilemapCtx) return;
    const map = state.tilemaps[activeMapIndex];
    if (!map) return;
    renderCanonicalTiledStatus();
    renderMapSummary();
    const cell = Math.round(24 * _tilemapZoom / 100);
    const c = tilemapCtx.canvas;
    c.width = map.width * cell;
    c.height = map.height * cell;

    tilemapCtx.clearRect(0, 0, c.width, c.height);

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const terrainVal = map.terrain[y][x];
            const showTerrain = isLayerVisible('terrain');

            tilemapCtx.fillStyle = showTerrain
                ? (TILE_VALUES.terrain.find((v) => v.value === terrainVal)?.color || '#111')
                : '#091219';
            tilemapCtx.fillRect(x * cell, y * cell, cell, cell);

            // Per-tile texture override
            const texKey = map.terrainTextures?.[y]?.[x];
            if (isLayerVisible('textures') && texKey) {
                drawEditorPlaceholder(tilemapCtx, x * cell, y * cell, cell, cell, 'TX');
            }

            const doorVal = map.doors[y][x];
            if (isLayerVisible('doors') && doorVal > 0) {
                const dx = x * cell;
                const dy = y * cell;
                const m = 2; // inset margin
                const dw = cell - m * 2;
                const dh = cell - m * 2;
                tilemapCtx.globalAlpha = 0.88;

                // Door base color by type
                const doorColors = {
                    1: { bg: '#4a3230', frame: '#6b4a47', accent: '#a3504e', label: 'STD' },
                    2: { bg: '#2a3d52', frame: '#3d5a78', accent: '#45739f', label: 'ELEC' },
                    3: { bg: '#4a3c20', frame: '#6b5830', accent: '#af8f4a', label: 'LOCK' },
                    4: { bg: '#3a4550', frame: '#556878', accent: '#8ca2b3', label: 'WELD' },
                };
                const dc = doorColors[doorVal] || doorColors[1];

                // Door frame / bulkhead
                tilemapCtx.fillStyle = dc.frame;
                tilemapCtx.fillRect(dx + m, dy + m, dw, dh);

                // Inner panel — darker recessed center
                tilemapCtx.fillStyle = dc.bg;
                tilemapCtx.fillRect(dx + m + 2, dy + m + 2, dw - 4, dh - 4);

                // Center seam line (door split)
                tilemapCtx.strokeStyle = dc.accent;
                tilemapCtx.lineWidth = 1;
                tilemapCtx.beginPath();
                tilemapCtx.moveTo(dx + cell / 2, dy + m + 2);
                tilemapCtx.lineTo(dx + cell / 2, dy + cell - m - 2);
                tilemapCtx.stroke();

                // Hazard caution blocks at top/bottom edges
                tilemapCtx.fillStyle = dc.accent;
                tilemapCtx.fillRect(dx + m + 2, dy + m, dw - 4, 2);
                tilemapCtx.fillRect(dx + m + 2, dy + cell - m - 2, dw - 4, 2);

                // Type label for clarity
                tilemapCtx.font = `bold ${Math.max(6, Math.floor(cell * 0.28))}px monospace`;
                tilemapCtx.textAlign = 'center';
                tilemapCtx.textBaseline = 'middle';
                tilemapCtx.fillStyle = dc.accent;
                tilemapCtx.fillText(dc.label, dx + cell / 2, dy + cell / 2);

                tilemapCtx.globalAlpha = 1;
            }

            const markerVal = map.markers[y][x];
            if (isLayerVisible('markers') && markerVal > 0) {
                tilemapCtx.fillStyle = TILE_VALUES.markers.find((v) => v.value === markerVal)?.color || '#fff';
                tilemapCtx.beginPath();
                tilemapCtx.arc(x * cell + cell / 2, y * cell + cell / 2, 4, 0, Math.PI * 2);
                tilemapCtx.fill();
            }

            tilemapCtx.strokeStyle = 'rgba(31, 51, 64, 0.45)';
            tilemapCtx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);

            // Highlight tiles with texture overrides when on textures layer
            if (activeLayer === 'textures' && isLayerVisible('textures') && texKey) {
                tilemapCtx.strokeStyle = '#ffd27a';
                tilemapCtx.lineWidth = 1.5;
                tilemapCtx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
                tilemapCtx.lineWidth = 1;
            }
        }
    }

    if (activeLayer === 'textures') {
        tilemapCtx.strokeStyle = '#ffd27a';
        tilemapCtx.lineWidth = 2;
        tilemapCtx.strokeRect(1, 1, c.width - 2, c.height - 2);
        tilemapCtx.lineWidth = 1;
    } else if (activeLayer !== 'terrain') {
        tilemapCtx.strokeStyle = '#8ce0b7';
        tilemapCtx.lineWidth = 2;
        tilemapCtx.strokeRect(1, 1, c.width - 2, c.height - 2);
        tilemapCtx.lineWidth = 1;
    }

    // Draw props as image thumbnails (always visible, highlighted when on props layer)
    if (isLayerVisible('props')) for (const prop of (map.props || [])) {
        const asset = assetByKey[prop.imageKey];
        const px = prop.tileX * cell;
        const py = prop.tileY * cell;
        const isSelected = selectedObject?.kind === 'prop' && selectedObject?.id === prop.id;

        // Zone props: draw as translucent colored radius circle, no image
        const ZONE_COLORS = { zone_colony: '#88ccff', zone_damaged: '#ffaa44', zone_hive: '#44ff88' };
        if (prop.type && ZONE_COLORS[prop.type]) {
            const zoneColor = ZONE_COLORS[prop.type];
            const zoneRadius = Math.max(16, Number(prop.radius) || 128);
            const zoneRadiusPx = (zoneRadius / 32) * cell;  // radius in world px → canvas px
            const cx = px + cell * 0.5;
            const cy = py + cell * 0.5;
            tilemapCtx.save();
            tilemapCtx.globalAlpha = (activeLayer === 'props' || isSelected) ? 0.22 : 0.09;
            tilemapCtx.fillStyle = zoneColor;
            tilemapCtx.beginPath();
            tilemapCtx.arc(cx, cy, zoneRadiusPx, 0, Math.PI * 2);
            tilemapCtx.fill();
            tilemapCtx.globalAlpha = (activeLayer === 'props' || isSelected) ? 0.7 : 0.4;
            tilemapCtx.strokeStyle = zoneColor;
            tilemapCtx.lineWidth = isSelected ? 2 : 1;
            tilemapCtx.stroke();
            // Label at center
            tilemapCtx.globalAlpha = 1;
            const labelFontSize = Math.max(6, Math.round(cell * 0.3));
            tilemapCtx.font = `bold ${labelFontSize}px monospace`;
            tilemapCtx.textAlign = 'center';
            tilemapCtx.textBaseline = 'middle';
            tilemapCtx.fillStyle = zoneColor;
            const zoneLabel = prop.type === 'zone_colony' ? 'COL' : prop.type === 'zone_damaged' ? 'DMG' : 'HIVE';
            tilemapCtx.fillText(zoneLabel, cx, cy);
            tilemapCtx.textAlign = 'left';
            tilemapCtx.textBaseline = 'alphabetic';
            tilemapCtx.restore();
            continue;
        }

        if (asset) {
            const img = getAssetImage(asset);
            if (img && img.complete && img.naturalWidth > 0) {
                tilemapCtx.globalAlpha = (activeLayer === 'props' || isSelected) ? 1 : 0.6;
                const rot = (Number(prop.rotation) || 0) * Math.PI / 180;
                if (rot !== 0) {
                    tilemapCtx.save();
                    tilemapCtx.translate(px + cell / 2, py + cell / 2);
                    tilemapCtx.rotate(rot);
                    tilemapCtx.drawImage(img, -cell / 2, -cell / 2, cell, cell);
                    tilemapCtx.restore();
                } else {
                    tilemapCtx.drawImage(img, px, py, cell, cell);
                }
                tilemapCtx.globalAlpha = 1;
            } else {
                drawEditorPlaceholder(tilemapCtx, px, py, cell, cell, 'SPR');
            }
        } else {
            drawEditorPlaceholder(tilemapCtx, px, py, cell, cell, 'SPR');
        }
        if (activeLayer === 'props' || isSelected) {
            tilemapCtx.strokeStyle = '#8ce0b7';
            tilemapCtx.lineWidth = 1.5;
            tilemapCtx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
            tilemapCtx.lineWidth = 1;
        }
        // Draw alien spawn count badge
        if (prop.type === 'alien_spawn' || prop.type === 'spawn') {
            const spawnCount = prop.count || 2;
            const badgeFontSize = Math.max(7, Math.round(cell * 0.38));
            tilemapCtx.font = `bold ${badgeFontSize}px monospace`;
            tilemapCtx.textAlign = 'right';
            tilemapCtx.textBaseline = 'bottom';
            tilemapCtx.fillStyle = '#ff4400';
            tilemapCtx.fillText(String(spawnCount), px + cell - 1, py + cell - 1);
            tilemapCtx.textAlign = 'left';
            tilemapCtx.textBaseline = 'alphabetic';
        }
    }

    // Draw authored lights (always visible, highlighted when on lights layer)
    if (isLayerVisible('lights')) for (const light of (map.lights || [])) {
        const px = (light.tileX + 0.5) * cell;
        const py = (light.tileY + 0.5) * cell;
        const isSelected = activeLayer === 'lights' || (selectedObject?.kind === 'light' && selectedObject?.id === light.id);

        // Draw light source marker
        tilemapCtx.fillStyle = light.color || '#ffffff';
        tilemapCtx.globalAlpha = isSelected ? 1 : 0.4;
        tilemapCtx.beginPath();
        if (light.type === 'alarm') {
            // Triangle for alarm/emergency beacons
            tilemapCtx.moveTo(px, py - 6);
            tilemapCtx.lineTo(px + 6, py + 6);
            tilemapCtx.lineTo(px - 6, py + 6);
            tilemapCtx.closePath();
        } else if (light.type === 'spot') {
            // Diamond for spotlights
            tilemapCtx.moveTo(px, py - 6);
            tilemapCtx.lineTo(px + 6, py);
            tilemapCtx.lineTo(px, py + 6);
            tilemapCtx.lineTo(px - 6, py);
            tilemapCtx.closePath();
        } else {
            // Circle for point lights
            tilemapCtx.arc(px, py, 5, 0, Math.PI * 2);
        }
        tilemapCtx.fill();
        tilemapCtx.globalAlpha = 1;

        // Draw radius preview if on lights layer
        if (isSelected) {
            const editorRadius = (light.radius / 64) * cell;
            tilemapCtx.strokeStyle = light.color || '#ffffff';
            tilemapCtx.setLineDash([4, 4]);
            tilemapCtx.beginPath();
            tilemapCtx.arc(px, py, editorRadius, 0, Math.PI * 2);
            tilemapCtx.stroke();
            tilemapCtx.setLineDash([]);

            // Draw a subtle fill for the light influence
            tilemapCtx.globalAlpha = 0.05 * (light.brightness || 0.5);
            tilemapCtx.fillStyle = light.color || '#ffffff';
            tilemapCtx.fill();
            tilemapCtx.globalAlpha = 1;
        }
    }

    if (isLayerVisible('story')) for (const story of (map.storyPoints || [])) {
        const px = (story.tileX + 0.5) * cell;
        const py = (story.tileY + 0.5) * cell;
        const isSelected = selectedObject?.kind === 'story' && selectedObject?.id === story.id;
        const color = story.kind === 'objective' ? '#f59e0b' : story.kind === 'warning' ? '#ff4444' : '#7ecfff';
        tilemapCtx.fillStyle = color;
        tilemapCtx.globalAlpha = isSelected || activeLayer === 'story' ? 0.95 : 0.72;
        tilemapCtx.fillRect(px - 6, py - 6, 12, 12);
        tilemapCtx.globalAlpha = 1;
        tilemapCtx.strokeStyle = isSelected ? '#ffffff' : color;
        tilemapCtx.strokeRect(px - 7.5, py - 7.5, 15, 15);
        tilemapCtx.font = '10px "IBM Plex Mono", monospace';
        tilemapCtx.textAlign = 'left';
        tilemapCtx.textBaseline = 'middle';
        tilemapCtx.fillStyle = color;
        tilemapCtx.fillText(String(story.title || 'Story').slice(0, 14), px + 10, py - 8);
    }
    tilemapCtx.textAlign = 'left';
    tilemapCtx.textBaseline = 'alphabetic';

    if (showDebugOverlay) {
        const { regions, visited } = computeFloorRegions(map);
        const palette = ['#ff4466', '#44aaff', '#44ff88', '#ffaa22', '#cc44ff', '#22ffee', '#ff8844', '#88ff44'];
        tilemapCtx.font = `bold ${Math.max(7, Math.floor(cell * 0.5))}px monospace`;
        tilemapCtx.textAlign = 'center';
        tilemapCtx.textBaseline = 'middle';

        // Color-wash each floor region and label its midpoint
        for (const region of regions) {
            const color = palette[region.id % palette.length];
            tilemapCtx.globalAlpha = 0.28;
            tilemapCtx.fillStyle = color;
            for (const [rx, ry] of region.cells) {
                tilemapCtx.fillRect(rx * cell, ry * cell, cell, cell);
            }
            tilemapCtx.globalAlpha = 1;
            const mid = region.cells[Math.floor(region.cells.length / 2)];
            tilemapCtx.fillStyle = '#ffffff';
            tilemapCtx.fillText(String(region.id), mid[0] * cell + cell / 2, mid[1] * cell + cell / 2);
        }

        // Annotate door tiles with the region IDs on each reachable side
        tilemapCtx.font = `bold ${Math.max(6, Math.floor(cell * 0.38))}px monospace`;
        for (let dy = 0; dy < map.height; dy++) {
            for (let dx = 0; dx < map.width; dx++) {
                if (map.doors[dy][dx] <= 0) continue;
                const sides = new Set();
                for (const [ox, oy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    const nx = dx + ox, ny = dy + oy;
                    if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && visited[ny][nx] >= 0) {
                        sides.add(visited[ny][nx]);
                    }
                }
                if (sides.size > 0) {
                    const label = [...sides].join('↔');
                    tilemapCtx.fillStyle = '#ffffff';
                    tilemapCtx.fillText(label, dx * cell + cell / 2, dy * cell + cell / 2 - 4);
                }
            }
        }

        // Annotate door pairs with side reach numbers (minimum 14 required for passing validation)
        const doorReaches = computeDoorReaches(map);
        tilemapCtx.font = `bold ${Math.max(6, Math.floor(cell * 0.32))}px monospace`;
        for (const dr of doorReaches) {
            const label = `${dr.reachA}⚡${dr.reachB}`;
            tilemapCtx.fillStyle = (dr.reachA < 14 || dr.reachB < 14) ? '#ff4444' : '#ffe566';
            const ox = dr.orientation === 'horizontal' ? cell : 0;
            const oy = dr.orientation === 'vertical' ? cell : 0;
            tilemapCtx.fillText(label, dr.x * cell + cell / 2 + ox / 2, dr.y * cell + cell / 2 + oy / 2 + 5);
        }

        // Visualize prop collision circles
        tilemapCtx.lineWidth = 1;
        for (const prop of (map.props || [])) {
            if (prop.radius > 0) {
                const px = (prop.tileX + 0.5) * cell;
                const py = (prop.tileY + 0.5) * cell;
                // Game uses 64px tiles, editor uses 24px (cell)
                const editorRadius = (prop.radius / 64) * cell;
                tilemapCtx.strokeStyle = '#ffcc66';
                tilemapCtx.globalAlpha = 0.6;
                tilemapCtx.beginPath();
                tilemapCtx.arc(px, py, editorRadius, 0, Math.PI * 2);
                tilemapCtx.stroke();
                tilemapCtx.globalAlpha = 1;
            }
        }

        tilemapCtx.textAlign = 'left';
        tilemapCtx.textBaseline = 'alphabetic';
    }

    // Shape tool preview overlay
    if (shapePreviewTiles.length > 0 && SHAPE_TOOLS.has(activeTileTool)) {
        tilemapCtx.globalAlpha = 0.4;
        tilemapCtx.fillStyle = '#7ecfff';
        for (const t of shapePreviewTiles) {
            if (t.x >= 0 && t.x < map.width && t.y >= 0 && t.y < map.height) {
                tilemapCtx.fillRect(t.x * cell + 1, t.y * cell + 1, cell - 2, cell - 2);
            }
        }
        tilemapCtx.globalAlpha = 1;
    }

    // Draw selection highlight
    if (selectedTile && activeTileTool === 'select') {
        const sx = selectedTile.x * cell;
        const sy = selectedTile.y * cell;
        tilemapCtx.strokeStyle = '#7ecfff';
        tilemapCtx.lineWidth = 2.5;
        tilemapCtx.strokeRect(sx + 1, sy + 1, cell - 2, cell - 2);
        tilemapCtx.lineWidth = 1;
    }
}

// ── Graph-canvas mission editor (module-level state) ───────────────────────
let _gNodes = [];
let _gEdges = [];
let _gView = { x: 60, y: 60, zoom: 1 };
let _gSel = null;
let _gPendEdge = null;
let _gDrag = null;
let _gPan = null;
let _gSpaceDown = false;
let _gCanvas = null;
let _gCtx = null;
let _gRAF = 0;
let _gConnectHover = null;
let _gKbDown = null;
let _gKbUp = null;
const _G_NODE_W = 160;
const _G_NODE_H = 56;
const _G_PORT_R = 7;
const _G_COLORS = {
    start:      { fill: '#22c55e', stroke: '#16a34a', text: '#fff' },
    event:      { fill: '#3b82f6', stroke: '#2563eb', text: '#fff' },
    condition:  { fill: '#eab308', stroke: '#ca8a04', text: '#1e1e1e' },
    audioCue:   { fill: '#a855f7', stroke: '#7c3aed', text: '#fff' },
    storyPoint: { fill: '#14b8a6', stroke: '#0f766e', text: '#fff' },
    end:        { fill: '#ef4444', stroke: '#b91c1c', text: '#fff' },
};
const _G_NODE_TYPES = ['start', 'event', 'condition', 'audioCue', 'storyPoint', 'end'];

function _graphToCanvas(cx, cy) {
    return [(cx - _gView.x) / _gView.zoom, (cy - _gView.y) / _gView.zoom];
}
function _graphPortOut(node) { return [node.x + _G_NODE_W, node.y + _G_NODE_H / 2]; }
function _graphPortIn(node)  { return [node.x, node.y + _G_NODE_H / 2]; }

function _graphDraw() {
    if (!_gCanvas || !_gCtx) return;
    const ctx = _gCtx;
    const W = _gCanvas.width;
    const H = _gCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, W, H);
    // Background grid
    const gs = 32 * _gView.zoom;
    const ox = _gView.x % gs;
    const oy = _gView.y % gs;
    ctx.strokeStyle = '#1a2535';
    ctx.lineWidth = 1;
    for (let gx = ox; gx < W; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = oy; gy < H; gy += gs) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.save();
    ctx.translate(_gView.x, _gView.y);
    ctx.scale(_gView.zoom, _gView.zoom);
    // Edges
    for (const edge of _gEdges) {
        const fn = _gNodes.find((n) => n.id === edge.from);
        const tn = _gNodes.find((n) => n.id === edge.to);
        if (!fn || !tn) continue;
        const [x1, y1] = _graphPortOut(fn);
        const [x2, y2] = _graphPortIn(tn);
        const mx = (x1 + x2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        ctx.strokeStyle = edge.id === _gConnectHover ? '#ff5555' : '#4a90d0';
        ctx.lineWidth = 2 / _gView.zoom;
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const ax = x2 - 10 * Math.cos(ang);
        const ay = y2 - 10 * Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(ax - 5 * Math.sin(ang), ay + 5 * Math.cos(ang));
        ctx.lineTo(ax + 5 * Math.sin(ang), ay - 5 * Math.cos(ang));
        ctx.closePath();
        ctx.fillStyle = edge.id === _gConnectHover ? '#ff5555' : '#4a90d0';
        ctx.fill();
    }
    // Pending edge drag
    if (_gPendEdge) {
        const { fromX, fromY, curX, curY } = _gPendEdge;
        const mx = (fromX + curX) / 2;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(mx, fromY, mx, curY, curX, curY);
        ctx.strokeStyle = '#7ecfff';
        ctx.lineWidth = 1.5 / _gView.zoom;
        ctx.setLineDash([5 / _gView.zoom, 3 / _gView.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    // Nodes
    for (const node of _gNodes) {
        const sch = _G_COLORS[node.type] || _G_COLORS.event;
        const sel = node.id === _gSel;
        ctx.strokeStyle = sel ? '#ffffff' : sch.stroke;
        ctx.lineWidth = (sel ? 2.5 : 1.5) / _gView.zoom;
        ctx.fillStyle = sch.fill + (sel ? 'dd' : '99');
        ctx.beginPath();
        ctx.roundRect(node.x, node.y, _G_NODE_W, _G_NODE_H, 6 / _gView.zoom);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = sch.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fs1 = Math.max(8, 12 / _gView.zoom);
        const fs2 = Math.max(7, 10 / _gView.zoom);
        ctx.font = `bold ${fs1}px "IBM Plex Mono", monospace`;
        ctx.fillText((node.label || node.type).slice(0, 16), node.x + _G_NODE_W / 2, node.y + _G_NODE_H / 2 - 7);
        ctx.font = `${fs2}px "IBM Plex Mono", monospace`;
        ctx.globalAlpha = 0.7;
        ctx.fillText(node.type, node.x + _G_NODE_W / 2, node.y + _G_NODE_H / 2 + 11);
        ctx.globalAlpha = 1;
        const pr = _G_PORT_R / _gView.zoom;
        const [ipx, ipy] = _graphPortIn(node);
        ctx.beginPath(); ctx.arc(ipx, ipy, pr, 0, Math.PI * 2); ctx.fillStyle = '#1e2a38'; ctx.fill(); ctx.strokeStyle = '#7ecfff'; ctx.lineWidth = 1.5 / _gView.zoom; ctx.stroke();
        const [opx, opy] = _graphPortOut(node);
        ctx.beginPath(); ctx.arc(opx, opy, pr, 0, Math.PI * 2); ctx.fillStyle = '#1e2a38'; ctx.fill(); ctx.strokeStyle = '#7ecfff'; ctx.lineWidth = 1.5 / _gView.zoom; ctx.stroke();
    }
    ctx.restore();
}

function _graphHitNode(wx, wy) {
    for (let i = _gNodes.length - 1; i >= 0; i--) {
        const n = _gNodes[i];
        if (wx >= n.x && wx <= n.x + _G_NODE_W && wy >= n.y && wy <= n.y + _G_NODE_H) return n;
    }
    return null;
}

function _graphHitPort(node, wx, wy) {
    const pr = _G_PORT_R * 2 / _gView.zoom;
    const [opx, opy] = _graphPortOut(node);
    if (Math.hypot(wx - opx, wy - opy) < pr) return 'out';
    const [ipx, ipy] = _graphPortIn(node);
    if (Math.hypot(wx - ipx, wy - ipy) < pr) return 'in';
    return null;
}

function _graphHitEdge(wx, wy) {
    for (const edge of _gEdges) {
        const fn = _gNodes.find((n) => n.id === edge.from);
        const tn = _gNodes.find((n) => n.id === edge.to);
        if (!fn || !tn) continue;
        const [x1, y1] = _graphPortOut(fn);
        const [x2, y2] = _graphPortIn(tn);
        const mx = (x1 + x2) / 2;
        for (let t = 0; t <= 1; t += 0.04) {
            const mt = 1 - t;
            const bx = mt * mt * mt * x1 + 3 * mt * mt * t * mx + 3 * mt * t * t * mx + t * t * t * x2;
            const by = mt * mt * mt * y1 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y2;
            if (Math.hypot(wx - bx, wy - by) < 8 / _gView.zoom) return edge;
        }
    }
    return null;
}

function _graphSave() {
    state.missionGraph = { nodes: _gNodes.map((n) => ({ ...n })), edges: _gEdges.map((e) => ({ ...e })) };
    saveState('Graph saved');
}

function _graphRenderProps() {
    const panel = document.getElementById('graphNodeProps');
    if (!panel) return;
    const node = _gNodes.find((n) => n.id === _gSel);
    if (!node) {
        panel.innerHTML = `<div style="padding:12px;color:#8fa;font-size:11px">Select a node to edit.<br><br>Double-click canvas to add a node.<br>Drag out-port → in-port to connect.<br>Right-click edge to delete.<br>Delete key removes selected node.</div>`;
        return;
    }
    const sch = _G_COLORS[node.type] || _G_COLORS.event;
    const mOpts = ['all', ...state.missions.map((m) => m.id)].map((id) => {
        const name = id === 'all' ? 'all missions' : (state.missions.find((m) => m.id === id)?.name || id);
        return `<option value="${escapeHtml(id)}" ${(node.data?.missionId || 'all') === id ? 'selected' : ''}>${escapeHtml(String(name).slice(0, 24))}</option>`;
    }).join('');
    let dataHtml = '';
    if (node.type === 'event') {
        dataHtml = `
            <label>Trigger<input id="gnTrigger" value="${escapeHtml(node.data?.trigger || '')}"></label>
            <label>Action<select id="gnAction">${Object.entries(MISSION_ACTION_LIBRARY).map(([k, m]) => `<option value="${escapeHtml(k)}" ${node.data?.action === k ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}</select></label>
            <label>Mission<select id="gnMission">${mOpts}</select></label>
            <label>Params JSON<textarea id="gnParams" rows="4" style="font-size:10px">${escapeHtml(JSON.stringify(node.data?.params || {}, null, 2))}</textarea></label>`;
    } else if (node.type === 'audioCue') {
        dataHtml = `
            <label>Text Cue<input id="gnTextCue" value="${escapeHtml(node.data?.textCue || '')}"></label>
            <label>Priority<input id="gnPriority" type="number" min="0" max="10" value="${Number(node.data?.priority) || 5}"></label>
            <label>Mission<select id="gnMission">${mOpts}</select></label>`;
    } else if (node.type === 'condition') {
        dataHtml = `
            <label>Condition<input id="gnCond" value="${escapeHtml(node.data?.condition || '')}"></label>
            <label>Value<input id="gnCondVal" value="${escapeHtml(node.data?.value || '')}"></label>`;
    } else if (node.type === 'storyPoint') {
        dataHtml = `
            <label>Story ID<input id="gnStoryId" value="${escapeHtml(node.data?.storyId || '')}"></label>
            <label>Note<textarea id="gnNote" rows="2">${escapeHtml(node.data?.note || '')}</textarea></label>`;
    }
    panel.innerHTML = `
        <div style="padding:8px 10px;background:${sch.fill}22;border-bottom:1px solid ${sch.stroke}55;flex-shrink:0">
            <strong style="color:${sch.fill};font-size:11px">${escapeHtml(node.type.toUpperCase())}</strong>
            <div style="color:#8fa;font-size:10px;margin-top:1px;word-break:break-all">${escapeHtml(node.id)}</div>
        </div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:7px;overflow-y:auto;flex:1">
            <label>Label<input id="gnLabel" value="${escapeHtml(node.label || '')}"></label>
            ${dataHtml}
            <button id="gnSaveBtn" style="margin-top:2px">Save Node</button>
            <button id="gnDeleteBtn" style="background:#7f1d1d;margin-top:2px">Delete Node</button>
        </div>`;
    document.getElementById('gnSaveBtn')?.addEventListener('click', () => {
        node.label = String(document.getElementById('gnLabel')?.value || node.label).trim();
        if (node.type === 'event') {
            node.data = node.data || {};
            node.data.trigger = String(document.getElementById('gnTrigger')?.value || '').trim();
            node.data.action = String(document.getElementById('gnAction')?.value || 'text_cue').trim();
            node.data.missionId = String(document.getElementById('gnMission')?.value || 'all').trim();
            try { node.data.params = JSON.parse(document.getElementById('gnParams')?.value || '{}'); } catch { /* keep */ }
        } else if (node.type === 'audioCue') {
            node.data = node.data || {};
            node.data.textCue = String(document.getElementById('gnTextCue')?.value || '').trim();
            node.data.priority = Number(document.getElementById('gnPriority')?.value) || 5;
            node.data.missionId = String(document.getElementById('gnMission')?.value || 'all').trim();
        } else if (node.type === 'condition') {
            node.data = node.data || {};
            node.data.condition = String(document.getElementById('gnCond')?.value || '').trim();
            node.data.value = String(document.getElementById('gnCondVal')?.value || '').trim();
        } else if (node.type === 'storyPoint') {
            node.data = node.data || {};
            node.data.storyId = String(document.getElementById('gnStoryId')?.value || '').trim();
            node.data.note = String(document.getElementById('gnNote')?.value || '').trim();
        }
        _graphSave();
        _graphRenderProps();
        setStatus('Node saved');
    });
    document.getElementById('gnDeleteBtn')?.addEventListener('click', () => {
        _gNodes = _gNodes.filter((n) => n.id !== node.id);
        _gEdges = _gEdges.filter((e) => e.from !== node.id && e.to !== node.id);
        _gSel = null;
        _graphSave();
        _graphRenderProps();
        setStatus('Node deleted');
    });
}

function _graphShowTypePicker(screenX, screenY, wx, wy) {
    document.getElementById('graphTypePicker')?.remove();
    const div = document.createElement('div');
    div.id = 'graphTypePicker';
    div.className = 'graph-type-picker';
    div.style.left = `${screenX}px`;
    div.style.top = `${screenY}px`;
    div.innerHTML = `<div class="graph-picker-title">Add Node</div>` +
        _G_NODE_TYPES.map((t) => `<button data-gtype="${t}" style="background:${_G_COLORS[t].fill};color:${_G_COLORS[t].text}">${t}</button>`).join('') +
        `<button data-gtype="">Cancel</button>`;
    document.body.appendChild(div);
    const removePicker = () => div.remove();
    div.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-gtype]');
        if (!btn) return;
        removePicker();
        const type = btn.dataset.gtype;
        if (!type) return;
        const id = `gn_${type}_${Date.now().toString(36)}`;
        _gNodes.push({ id, type, x: Math.round(wx - _G_NODE_W / 2), y: Math.round(wy - _G_NODE_H / 2), label: type, data: {} });
        _gSel = id;
        _graphSave();
        _graphRenderProps();
    });
    const outside = (ev) => { if (!div.contains(ev.target)) { removePicker(); document.removeEventListener('mousedown', outside); } };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
}

function _graphHandleMouseDown(ev) {
    _gCanvas.focus();
    const rect = _gCanvas.getBoundingClientRect();
    const [wx, wy] = _graphToCanvas(ev.clientX - rect.left, ev.clientY - rect.top);
    if (_gSpaceDown || ev.button === 1) {
        _gPan = { startX: ev.clientX, startY: ev.clientY, viewX: _gView.x, viewY: _gView.y };
        return;
    }
    for (const node of _gNodes) {
        if (_graphHitPort(node, wx, wy) === 'out') {
            const [opx, opy] = _graphPortOut(node);
            _gPendEdge = { fromId: node.id, fromX: opx, fromY: opy, curX: wx, curY: wy };
            return;
        }
    }
    const hit = _graphHitNode(wx, wy);
    if (hit) {
        _gSel = hit.id;
        _gDrag = { nodeId: hit.id, ox: wx - hit.x, oy: wy - hit.y };
        _graphRenderProps();
        return;
    }
    _gSel = null;
    _graphRenderProps();
}

function _graphHandleMouseMove(ev) {
    const rect = _gCanvas.getBoundingClientRect();
    const [wx, wy] = _graphToCanvas(ev.clientX - rect.left, ev.clientY - rect.top);
    if (_gPan) {
        _gView.x = _gPan.viewX + (ev.clientX - _gPan.startX);
        _gView.y = _gPan.viewY + (ev.clientY - _gPan.startY);
        return;
    }
    if (_gPendEdge) { _gPendEdge.curX = wx; _gPendEdge.curY = wy; return; }
    if (_gDrag) {
        const node = _gNodes.find((n) => n.id === _gDrag.nodeId);
        if (node) { node.x = wx - _gDrag.ox; node.y = wy - _gDrag.oy; }
        return;
    }
    _gConnectHover = null;
    const edge = _graphHitEdge(wx, wy);
    if (edge) _gConnectHover = edge.id;
}

function _graphHandleMouseUp(ev) {
    if (_gPan) { _gPan = null; return; }
    if (_gDrag) { _gDrag = null; _graphSave(); return; }
    if (_gPendEdge) {
        const rect = _gCanvas.getBoundingClientRect();
        const [wx, wy] = _graphToCanvas(ev.clientX - rect.left, ev.clientY - rect.top);
        const fromId = _gPendEdge.fromId;
        for (const node of _gNodes) {
            if (node.id === fromId) continue;
            if (_graphHitPort(node, wx, wy) === 'in') {
                if (!_gEdges.find((e) => e.from === fromId && e.to === node.id)) {
                    _gEdges.push({ id: `edge_${Date.now().toString(36)}`, from: fromId, to: node.id });
                    _graphSave();
                }
                break;
            }
        }
        _gPendEdge = null;
    }
}

function _graphHandleWheel(ev) {
    ev.preventDefault();
    const rect = _gCanvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    const nz = Math.max(0.2, Math.min(3, _gView.zoom * factor));
    _gView.x = mx - (mx - _gView.x) * (nz / _gView.zoom);
    _gView.y = my - (my - _gView.y) * (nz / _gView.zoom);
    _gView.zoom = nz;
}

function _graphHandleDoubleClick(ev) {
    const rect = _gCanvas.getBoundingClientRect();
    const [wx, wy] = _graphToCanvas(ev.clientX - rect.left, ev.clientY - rect.top);
    if (_graphHitNode(wx, wy)) return;
    _graphShowTypePicker(ev.clientX, ev.clientY, wx, wy);
}

function _graphHandleContextMenu(ev) {
    ev.preventDefault();
    const rect = _gCanvas.getBoundingClientRect();
    const [wx, wy] = _graphToCanvas(ev.clientX - rect.left, ev.clientY - rect.top);
    const edge = _graphHitEdge(wx, wy);
    if (edge) {
        _gEdges = _gEdges.filter((e) => e.id !== edge.id);
        _graphSave();
        setStatus('Connection deleted');
    }
}

function _graphInit() {
    // If canvas already set up, just restart the RAF loop (idempotent)
    if (_gCanvas) {
        if (_gRAF) cancelAnimationFrame(_gRAF);
        const loop = () => { _graphDraw(); _gRAF = requestAnimationFrame(loop); };
        loop();
        return;
    }
    _gCanvas = document.getElementById('missionGraphCanvas');
    if (!_gCanvas) return;
    _gCtx = _gCanvas.getContext('2d');
    const saved = state.missionGraph;
    if (saved && Array.isArray(saved.nodes)) {
        _gNodes = saved.nodes.map((n) => ({ ...n }));
        _gEdges = (saved.edges || []).map((e) => ({ ...e }));
    } else {
        _gNodes = [];
        _gEdges = [];
        let ix = 80;
        for (const evt of (state.directorEvents || [])) {
            _gNodes.push({ id: evt.id, type: 'event', x: ix, y: 80, label: evt.label || evt.id, data: { trigger: evt.trigger, action: evt.action, missionId: evt.missionId || 'all', params: evt.params || {} } });
            ix += 200;
        }
        for (const cue of (state.audioCues || [])) {
            _gNodes.push({ id: cue.id, type: 'audioCue', x: ix, y: 280, label: cue.id, data: { textCue: cue.textCue, priority: cue.priority, missionId: cue.missionId || 'all' } });
            ix += 200;
        }
    }
    const doResize = () => {
        if (!_gCanvas) return;
        _gCanvas.width = _gCanvas.offsetWidth || 800;
        _gCanvas.height = _gCanvas.offsetHeight || 500;
    };
    doResize();
    if (_gKbDown) window.removeEventListener('keydown', _gKbDown);
    if (_gKbUp) window.removeEventListener('keyup', _gKbUp);
    _gKbDown = (ev) => {
        if (ev.code === 'Space' && document.activeElement === _gCanvas) { ev.preventDefault(); _gSpaceDown = true; }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && _gSel && document.activeElement === _gCanvas) {
            _gNodes = _gNodes.filter((n) => n.id !== _gSel);
            _gEdges = _gEdges.filter((e) => e.from !== _gSel && e.to !== _gSel);
            _gSel = null;
            _graphSave();
            _graphRenderProps();
        }
    };
    _gKbUp = (ev) => { if (ev.code === 'Space') _gSpaceDown = false; };
    window.addEventListener('keydown', _gKbDown);
    window.addEventListener('keyup', _gKbUp);
    _gCanvas.addEventListener('mousedown', _graphHandleMouseDown);
    _gCanvas.addEventListener('mousemove', _graphHandleMouseMove);
    _gCanvas.addEventListener('mouseup', _graphHandleMouseUp);
    _gCanvas.addEventListener('wheel', _graphHandleWheel, { passive: false });
    _gCanvas.addEventListener('dblclick', _graphHandleDoubleClick);
    _gCanvas.addEventListener('contextmenu', _graphHandleContextMenu);
    const obs = new ResizeObserver(doResize);
    obs.observe(_gCanvas);
    if (_gRAF) cancelAnimationFrame(_gRAF);
    const loop = () => { _graphDraw(); _gRAF = requestAnimationFrame(loop); };
    loop();
    _graphRenderProps();
}

function renderMissionsTab() {
    const rows = state.missions.map((m, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><input data-mission="name" data-i="${i}" value="${escapeHtml(m.name)}"></td>
            <td>
                <select data-mission="mapId" data-i="${i}">
                    ${state.tilemaps.map((tm) => `<option value="${escapeHtml(tm.id)}" ${tm.id === m.mapId ? 'selected' : ''}>${escapeHtml(tm.name)}</option>`).join('')}
                </select>
            </td>
            <td><input data-mission="objective" data-i="${i}" value="${escapeHtml(m.objective)}"></td>
            <td>
                <select data-mission="difficulty" data-i="${i}">
                    ${['normal', 'hard', 'extreme'].map((d) => `<option value="${d}" ${d === m.difficulty ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
            </td>
            <td><input data-mission="enemyBudget" data-i="${i}" type="number" min="1" value="${m.enemyBudget}"></td>
            <td><input data-mission="requiredCards" data-i="${i}" type="number" min="0" max="8" value="${m.requiredCards ?? 0}"></td>
            <td><input data-mission="requiredTerminals" data-i="${i}" type="number" min="0" max="8" value="${m.requiredTerminals ?? 0}"></td>
            <td><input data-missiondir="idlePressureBaseMs" data-i="${i}" type="number" min="500" value="${m.director?.idlePressureBaseMs ?? ''}"></td>
            <td><input data-missiondir="gunfireReinforceBaseMs" data-i="${i}" type="number" min="500" value="${m.director?.gunfireReinforceBaseMs ?? ''}"></td>
            <td><input data-missiondir="reinforceCap" data-i="${i}" type="number" min="0" value="${m.director?.reinforceCap ?? ''}"></td>
            <td><input data-missiondir="inactivityAmbushMs" data-i="${i}" type="number" min="1000" value="${m.director?.inactivityAmbushMs ?? ''}"></td>
            <td><input data-missiondir="inactivityAmbushCooldownMs" data-i="${i}" type="number" min="500" value="${m.director?.inactivityAmbushCooldownMs ?? ''}"></td>
            <td><input data-mission="notes" data-i="${i}" value="${escapeHtml(m.notes)}"></td>
        </tr>`).join('');
    panels.missions.innerHTML = `
        <div id="missionGraphPanel" class="graph-editor-shell">
            <div class="graph-left-panel">
                <h2 style="margin:0 0 8px">Campaign Table</h2>
                <button id="applyMissionChanges">Apply Mission Changes</button>
                <button id="resetMissionsBtn" style="margin-top:4px">Reset Missions</button>
                <div style="overflow-x:auto;margin-top:8px">
                    <table class="table" style="min-width:900px">
                        <thead><tr>
                            <th>#</th><th>Name</th><th>Tilemap</th><th>Objective</th>
                            <th>Diff</th><th>Budget</th><th>Cards</th><th>Terms</th>
                            <th>Idle Ms</th><th>Gun Ms</th><th>Cap</th><th>Amb Ms</th><th>Amb CD</th><th>Notes</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <details style="margin-top:10px">
                    <summary class="small">Advanced JSON (read-only)</summary>
                    <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
                        <textarea id="directorEventsJson" rows="7" readonly style="font-size:10px">${escapeHtml(JSON.stringify(state.directorEvents || [], null, 2))}</textarea>
                        <textarea id="audioCuesJson" rows="5" readonly style="font-size:10px">${escapeHtml(JSON.stringify(state.audioCues || [], null, 2))}</textarea>
                    </div>
                </details>
            </div>
            <div class="graph-canvas-area">
                <div class="graph-toolbar">
                    <span class="small">Double-click: add node &nbsp;|&nbsp; Drag out-port→in-port: connect &nbsp;|&nbsp; Right-click edge: delete &nbsp;|&nbsp; Space+drag / middle-drag: pan &nbsp;|&nbsp; Scroll: zoom &nbsp;|&nbsp; Delete key: remove selected</span>
                    <button id="graphResetViewBtn">Reset View</button>
                    <button id="graphClearBtn">Clear Graph</button>
                </div>
                <canvas id="missionGraphCanvas" tabindex="0"></canvas>
            </div>
            <div class="graph-right-panel" id="graphNodeProps">
                <div style="padding:12px;color:#8fa;font-size:11px">Select a node to edit its properties.</div>
            </div>
        </div>`;

    document.getElementById('applyMissionChanges')?.addEventListener('click', () => {
        try {
            const next = clone(state);
            document.querySelectorAll('[data-mission]').forEach((input) => {
                const idx = Number(input.dataset.i);
                const key = input.dataset.mission;
                next.missions[idx][key] = ['enemyBudget', 'requiredCards', 'requiredTerminals'].includes(key) ? Number(input.value) : input.value;
            });
            document.querySelectorAll('[data-missiondir]').forEach((input) => {
                const idx = Number(input.dataset.i);
                const key = input.dataset.missiondir;
                if (!next.missions[idx].director || typeof next.missions[idx].director !== 'object') next.missions[idx].director = {};
                next.missions[idx].director[key] = Number(input.value);
            });
            const pkgPreview = buildPackageFromEditorState(next);
            const errors = validateMissionPackageShape(pkgPreview);
            if (errors.length) throw new Error(errors[0]);
            Object.assign(state, next);
            saveState('Mission table updated');
            renderMissionsTab();
        } catch (err) {
            setStatus(`Apply failed: ${err?.message || 'invalid mission data'}`);
        }
    });

    document.getElementById('graphResetViewBtn')?.addEventListener('click', () => {
        _gView = { x: 60, y: 60, zoom: 1 };
    });

    document.getElementById('graphClearBtn')?.addEventListener('click', () => {
        if (!confirm('Clear all graph nodes and edges? This cannot be undone.')) return;
        _gNodes = [];
        _gEdges = [];
        _gSel = null;
        _graphSave();
        _graphRenderProps();
        setStatus('Graph cleared');
    });

    panels.missions.addEventListener('click', (ev) => {
        if (ev.target.closest('#resetMissionsBtn')) {
            if (!confirm('Reset all missions, director events, and audio cues to defaults? This cannot be undone.')) return;
            state.missions = defaultState().missions;
            state.directorEvents = defaultState().directorEvents;
            state.audioCues = defaultState().audioCues;
            delete state.missionGraph;
            _gNodes = [];
            _gEdges = [];
            saveState('Missions reset');
            renderMissionsTab();
        }
    });

    // innerHTML was just replaced — detach stale canvas ref so _graphInit re-initialises
    if (_gRAF) { cancelAnimationFrame(_gRAF); _gRAF = 0; }
    _gCanvas = null;
    _gCtx = null;
    _graphInit();
}

function escapeHtml(s) {
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function parseJsonArrayInput(text, fieldLabel = 'json') {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`${fieldLabel} must be valid JSON`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${fieldLabel} must be a JSON array`);
    return parsed;
}

function filterTelemetrySamplesByRange(samples, range = '5m', nowTs = Date.now()) {
    if (!Array.isArray(samples)) return [];
    if (range === 'all') return [...samples];
    const ms = range === '1m' ? 60000 : 300000;
    const cutoff = nowTs - ms;
    return samples.filter((s) => Number(s?.ts) >= cutoff);
}

function exportCombatTelemetry(snapshot, range = '5m') {
    const missions = {};
    const inputMissions = snapshot && snapshot.missions && typeof snapshot.missions === 'object'
        ? snapshot.missions
        : {};
    for (const [missionId, samples] of Object.entries(inputMissions)) {
        missions[missionId] = filterTelemetrySamplesByRange(samples, range);
    }
    const payload = {
        exportedAt: Date.now(),
        range,
        missions,
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aliens-combat-telemetry-${range}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported combat telemetry (${range})`);
}

function summarizeProfileDeltaPreview(basePkg, profileName = 'balanced') {
    const profiledPkg = applyQualityProfile(basePkg, profileName);
    const lines = [`Profile Delta (${profileName}):`];
    const missionNow = Array.isArray(basePkg?.missions) ? basePkg.missions : [];
    const missionNext = Array.isArray(profiledPkg?.missions) ? profiledPkg.missions : [];
    const directorKeys = [
        'idlePressureBaseMs',
        'idlePressureMinMs',
        'gunfireReinforceBaseMs',
        'gunfireReinforceMinMs',
        'reinforceCap',
        'reinforceCapIdle',
        'reinforceCapGunfire',
        'inactivityAmbushMs',
        'inactivityAmbushCooldownMs',
    ];
    let changedMissions = 0;
    for (let i = 0; i < Math.min(missionNow.length, missionNext.length); i++) {
        const a = missionNow[i] || {};
        const b = missionNext[i] || {};
        const changes = [];
        for (const key of directorKeys) {
            const va = Number(a?.director?.[key]);
            const vb = Number(b?.director?.[key]);
            if (Number.isFinite(va) && Number.isFinite(vb) && va !== vb) {
                changes.push(`${key} ${va}->${vb}`);
            }
        }
        if (changes.length) {
            changedMissions++;
            lines.push(`${String(a.id || `m${i + 1}`)}: ${changes.join(' | ')}`);
        }
    }
    if (changedMissions === 0) lines.push('No mission director field changes');

    const spawnBaseById = new Map();
    for (const e of Array.isArray(basePkg?.directorEvents) ? basePkg.directorEvents : []) {
        if (String(e?.action || '').toLowerCase() !== 'spawn_pack') continue;
        spawnBaseById.set(String(e?.id || ''), Number(e?.params?.size));
    }
    const spawnNextById = new Map();
    for (const e of Array.isArray(profiledPkg?.directorEvents) ? profiledPkg.directorEvents : []) {
        if (String(e?.action || '').toLowerCase() !== 'spawn_pack') continue;
        spawnNextById.set(String(e?.id || ''), Number(e?.params?.size));
    }
    let spawnChanges = 0;
    for (const [id, sizeA] of spawnBaseById.entries()) {
        const sizeB = spawnNextById.get(id);
        if (Number.isFinite(sizeA) && Number.isFinite(sizeB) && sizeA !== sizeB) {
            if (spawnChanges < 8) lines.push(`spawn_pack ${id}: ${sizeA}->${sizeB}`);
            spawnChanges++;
        }
    }
    const eventCountDelta = (Array.isArray(profiledPkg?.directorEvents) ? profiledPkg.directorEvents.length : 0)
        - (Array.isArray(basePkg?.directorEvents) ? basePkg.directorEvents.length : 0);
    lines.push(`spawn_pack size changes: ${spawnChanges}`);
    lines.push(`director event count delta: ${eventCountDelta >= 0 ? `+${eventCountDelta}` : eventCountDelta}`);
    lines.push('Apply Selected commits these changes into editor state.');
    return lines;
}

function recommendBalanceProfileFromTelemetry(snapshot, range = '5m') {
    const missionsObj = snapshot && snapshot.missions && typeof snapshot.missions === 'object'
        ? snapshot.missions
        : {};
    const all = [];
    for (const samples of Object.values(missionsObj)) {
        all.push(...filterTelemetrySamplesByRange(samples, range));
    }
    if (all.length === 0) {
        return { profile: 'balanced', reason: 'no telemetry data yet' };
    }
    const avgPressure = averageOf(all, 'pressure');
    const avgJam = averageOf(all, 'jamMul');
    const highPressureRate = ratioWhere(all, (s) => Number(s?.pressure) >= 0.78);
    const highJamRate = ratioWhere(all, (s) => Number(s?.jamMul) >= 1.28);
    if (avgPressure >= 0.72 || highPressureRate >= 0.3 || avgJam >= 1.35 || highJamRate >= 0.25) {
        return {
            profile: 'cinematic',
            reason: `pressure/jam high (p=${avgPressure.toFixed(2)} jam=${avgJam.toFixed(2)})`,
        };
    }
    if (avgPressure <= 0.42 && highPressureRate <= 0.1 && avgJam <= 1.04) {
        return {
            profile: 'hardcore',
            reason: `pressure low (p=${avgPressure.toFixed(2)} jam=${avgJam.toFixed(2)})`,
        };
    }
    return {
        profile: 'balanced',
        reason: `within target band (p=${avgPressure.toFixed(2)} jam=${avgJam.toFixed(2)})`,
    };
}

function averageOf(samples, key) {
    if (!Array.isArray(samples) || samples.length === 0) return 0;
    const vals = samples.map((s) => Number(s?.[key])).filter((n) => Number.isFinite(n));
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ratioWhere(samples, predicate) {
    if (!Array.isArray(samples) || samples.length === 0) return 0;
    let hit = 0;
    let total = 0;
    for (const s of samples) {
        total++;
        if (predicate(s)) hit++;
    }
    return total > 0 ? hit / total : 0;
}

function targetPressureForMissionDifficulty(difficulty = 'normal') {
    if (difficulty === 'extreme') return 0.67;
    if (difficulty === 'hard') return 0.6;
    return 0.53;
}

function buildTelemetryCalibrationPlan(editorState, snapshot, range = '5m') {
    const plans = [];
    const missionsById = snapshot && snapshot.missions && typeof snapshot.missions === 'object'
        ? snapshot.missions
        : {};
    for (const mission of Array.isArray(editorState?.missions) ? editorState.missions : []) {
        const missionId = String(mission?.id || '');
        if (!missionId) continue;
        const rawSamples = Array.isArray(missionsById[missionId]) ? missionsById[missionId] : [];
        const samples = filterTelemetrySamplesByRange(rawSamples, range);
        if (samples.length < 12) {
            plans.push({
                missionId,
                missionName: String(mission?.name || missionId),
                sampleCount: samples.length,
                skipped: true,
                reason: 'insufficient samples',
            });
            continue;
        }
        const avgPressure = averageOf(samples, 'pressure');
        const avgJam = averageOf(samples, 'jamMul');
        const targetPressure = targetPressureForMissionDifficulty(String(mission?.difficulty || 'normal'));
        const pressureErr = clamp((targetPressure - avgPressure) / 0.22, -1, 1);
        const jamErr = clamp((1.06 - avgJam) / 0.28, -1, 1);
        const paceSignal = clamp(pressureErr * 0.74 + jamErr * 0.26, -1, 1);

        const d = mission?.director && typeof mission.director === 'object' ? mission.director : {};
        const idleBase = Number(d.idlePressureBaseMs) || 7000;
        const gunfireBase = Number(d.gunfireReinforceBaseMs) || 4500;
        const reinforceCap = Number(d.reinforceCap) || 16;
        const ambushMs = Number(d.inactivityAmbushMs) || 10000;
        const ambushCdMs = Number(d.inactivityAmbushCooldownMs) || 14000;

        const next = {
            idlePressureBaseMs: Math.round(clamp(idleBase * (1 - paceSignal * 0.16), 2000, 30000)),
            gunfireReinforceBaseMs: Math.round(clamp(gunfireBase * (1 - paceSignal * 0.18), 1200, 20000)),
            reinforceCap: Math.round(clamp(reinforceCap * (1 + paceSignal * 0.14), 0, 80)),
            inactivityAmbushMs: Math.round(clamp(ambushMs * (1 - paceSignal * 0.14), 2000, 45000)),
            inactivityAmbushCooldownMs: Math.round(clamp(ambushCdMs * (1 - paceSignal * 0.12), 1500, 60000)),
        };

        plans.push({
            missionId,
            missionName: String(mission?.name || missionId),
            sampleCount: samples.length,
            skipped: false,
            avgPressure,
            avgJam,
            targetPressure,
            paceSignal,
            current: {
                idlePressureBaseMs: idleBase,
                gunfireReinforceBaseMs: gunfireBase,
                reinforceCap,
                inactivityAmbushMs: ambushMs,
                inactivityAmbushCooldownMs: ambushCdMs,
            },
            next,
        });
    }
    return plans;
}

function summarizeTelemetryCalibrationPlan(plan) {
    const out = ['Telemetry Calibration Preview:'];
    const actionable = (Array.isArray(plan) ? plan : []).filter((p) => p && !p.skipped);
    if (actionable.length === 0) {
        out.push('No actionable missions (need at least 12 samples per mission in selected range).');
        return out;
    }
    for (const p of plan) {
        if (p.skipped) {
            out.push(`${p.missionId}: skipped (${p.sampleCount} samples)`);
            continue;
        }
        out.push(
            `${p.missionId}: p ${p.avgPressure.toFixed(2)} -> tgt ${p.targetPressure.toFixed(2)}, jam ${p.avgJam.toFixed(2)}, signal ${p.paceSignal.toFixed(2)}`
        );
        out.push(
            `  idle ${p.current.idlePressureBaseMs}->${p.next.idlePressureBaseMs} | gun ${p.current.gunfireReinforceBaseMs}->${p.next.gunfireReinforceBaseMs} | cap ${p.current.reinforceCap}->${p.next.reinforceCap}`
        );
        out.push(
            `  amb ${p.current.inactivityAmbushMs}->${p.next.inactivityAmbushMs} | ambCD ${p.current.inactivityAmbushCooldownMs}->${p.next.inactivityAmbushCooldownMs}`
        );
    }
    return out;
}

function applyTelemetryCalibrationPlan(plan) {
    let applied = 0;
    const list = Array.isArray(plan) ? plan : [];
    for (const p of list) {
        if (!p || p.skipped) continue;
        const mission = state.missions.find((m) => String(m?.id || '') === p.missionId);
        if (!mission) continue;
        if (!mission.director || typeof mission.director !== 'object') mission.director = {};
        mission.director.idlePressureBaseMs = p.next.idlePressureBaseMs;
        mission.director.gunfireReinforceBaseMs = p.next.gunfireReinforceBaseMs;
        mission.director.reinforceCap = p.next.reinforceCap;
        mission.director.inactivityAmbushMs = p.next.inactivityAmbushMs;
        mission.director.inactivityAmbushCooldownMs = p.next.inactivityAmbushCooldownMs;
        applied++;
    }
    return applied;
}

function toIdSet(arr = []) {
    const out = new Set();
    for (const item of arr) {
        const id = String(item?.id || '').trim();
        if (id) out.add(id);
    }
    return out;
}

function summarizePackageDiff(currentPkg, publishedPkg) {
    if (!publishedPkg || typeof publishedPkg !== 'object') {
        return ['Diff vs Published: no published package'];
    }
    const lines = ['Diff vs Published:'];
    const addLine = (label, value) => lines.push(`${label}: ${value >= 0 ? `+${value}` : `${value}`}`);

    const countDelta = (key) => {
        const a = Array.isArray(currentPkg?.[key]) ? currentPkg[key].length : 0;
        const b = Array.isArray(publishedPkg?.[key]) ? publishedPkg[key].length : 0;
        return a - b;
    };
    addLine('Maps', countDelta('maps'));
    addLine('Missions', countDelta('missions'));
    addLine('Events', countDelta('directorEvents'));
    addLine('Cues', countDelta('audioCues'));

    const eventNow = toIdSet(currentPkg?.directorEvents || []);
    const eventPrev = toIdSet(publishedPkg?.directorEvents || []);
    const cueNow = toIdSet(currentPkg?.audioCues || []);
    const cuePrev = toIdSet(publishedPkg?.audioCues || []);

    const countSetDelta = (a, b) => {
        let add = 0;
        let rem = 0;
        for (const id of a) if (!b.has(id)) add++;
        for (const id of b) if (!a.has(id)) rem++;
        return { add, rem };
    };
    const evtDelta = countSetDelta(eventNow, eventPrev);
    const cueDelta = countSetDelta(cueNow, cuePrev);
    lines.push(`Event IDs: +${evtDelta.add} / -${evtDelta.rem}`);
    lines.push(`Cue IDs: +${cueDelta.add} / -${cueDelta.rem}`);

    const currentMissions = new Map((Array.isArray(currentPkg?.missions) ? currentPkg.missions : [])
        .map((m) => [String(m?.id || ''), m]));
    const publishedMissions = new Map((Array.isArray(publishedPkg?.missions) ? publishedPkg.missions : [])
        .map((m) => [String(m?.id || ''), m]));
    const allMissionIds = new Set([...currentMissions.keys(), ...publishedMissions.keys()]);
    const missionDiffLines = [];
    const missionFields = ['name', 'mapId', 'objective', 'difficulty', 'enemyBudget', 'requiredCards', 'requiredTerminals'];
    const directorFields = [
        'idlePressureBaseMs',
        'idlePressureMinMs',
        'gunfireReinforceBaseMs',
        'gunfireReinforceMinMs',
        'reinforceCap',
        'reinforceCapIdle',
        'reinforceCapGunfire',
        'inactivityAmbushMs',
        'inactivityAmbushCooldownMs',
    ];
    for (const missionId of allMissionIds) {
        const a = currentMissions.get(missionId);
        const b = publishedMissions.get(missionId);
        if (!a && b) {
            missionDiffLines.push(`${missionId}: removed`);
            continue;
        }
        if (a && !b) {
            missionDiffLines.push(`${missionId}: added`);
            continue;
        }
        const changes = [];
        for (const key of missionFields) {
            const va = String(a?.[key] ?? '');
            const vb = String(b?.[key] ?? '');
            if (va !== vb) changes.push(`${key} ${vb} -> ${va}`);
        }
        for (const key of directorFields) {
            const va = Number(a?.director?.[key]);
            const vb = Number(b?.director?.[key]);
            if (Number.isFinite(va) && Number.isFinite(vb) && va !== vb) {
                changes.push(`${key} ${vb} -> ${va}`);
            }
        }
        if (changes.length) {
            missionDiffLines.push(`${missionId}: ${changes.slice(0, 8).join(' | ')}`);
        }
    }
    if (missionDiffLines.length > 0) {
        lines.push('Mission field changes:');
        for (const l of missionDiffLines.slice(0, 20)) lines.push(`- ${l}`);
    } else {
        lines.push('Mission field changes: none');
    }
    return lines;
}

async function renderPackageDiffPreview() {
    if (!packageDiffEl) return;
    const currentPkg = buildPackageWithHud();
    let publishedPkg = null;
    try {
        const res = await fetch('/api/mission-package');
        if (res.ok) {
            const data = await res.json();
            if (data.package) {
                publishedPkg = typeof data.package === 'string'
                    ? JSON.parse(data.package)
                    : data.package;
            }
        }
    } catch {
        publishedPkg = null;
    }
    const diff = summarizePackageDiff(currentPkg, publishedPkg);
    const summary = diff.length === 0 ? 'Diff: no changes' : `Diff: ${diff.length} line(s)`;
    packageDiffEl.innerHTML = `
        <div class="topbar-summary">${summary}</div>
        <div class="topbar-details">${diff.join('\n')}</div>`;
}

function loadCombatTelemetrySnapshot() {
    try {
        const raw = localStorage.getItem(COMBAT_TELEMETRY_STORAGE_KEY);
        if (!raw) return { missions: {} };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.missions !== 'object') {
            return { missions: {} };
        }
        return parsed;
    } catch {
        return { missions: {} };
    }
}

function loadMissionBalanceHistory() {
    try {
        const raw = localStorage.getItem(MISSION_BALANCE_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getSnapshotStressTier(entry) {
    const explicit = String(entry?.stressTier || '').toLowerCase();
    if (explicit === 'high' || explicit === 'target' || explicit === 'low') return explicit;
    const p = Number(entry?.avgPressure) || 0;
    const j = Number(entry?.avgJam) || 1;
    if (p >= 0.72 || j >= 1.32) return 'high';
    if (p <= 0.42 && j <= 1.04) return 'low';
    return 'target';
}

function buildMissionBalanceSummaries(history) {
    const grouped = new Map();
    for (const entry of Array.isArray(history) ? history : []) {
        const missionId = String(entry?.missionId || '');
        if (!missionId) continue;
        if (!grouped.has(missionId)) grouped.set(missionId, []);
        grouped.get(missionId).push(entry);
    }
    const out = [];
    for (const [missionId, runs] of grouped.entries()) {
        const ordered = [...runs].sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0)).slice(-6);
        const pressureSpark = toSparkline(ordered, 'avgPressure', 20);
        const jamSpark = toSparkline(ordered, 'avgJam', 20);
        const avgPressure = averageOf(ordered, 'avgPressure');
        const avgJam = averageOf(ordered, 'avgJam');
        const vol = volatilityOf(ordered, 'avgPressure');
        const volatility = vol > 0.12 ? 'high' : (vol < 0.05 ? 'low' : 'mid');
        out.push({
            missionId,
            missionName: String(ordered[ordered.length - 1]?.missionName || missionId),
            runCount: runs.length,
            pressureSpark,
            jamSpark,
            avgPressure,
            avgJam,
            volatility,
        });
    }
    return out.sort((a, b) => String(a.missionId).localeCompare(String(b.missionId)));
}

function volatilityOf(samples, key) {
    if (!Array.isArray(samples) || samples.length === 0) return 0;
    const vals = samples.map((s) => Number(s?.[key])).filter((n) => Number.isFinite(n));
    if (vals.length <= 1) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
    return Math.sqrt(variance);
}

function blendSuggestions(suggestions) {
    const keys = [
        'idlePressureBaseMs',
        'gunfireReinforceBaseMs',
        'reinforceCap',
        'inactivityAmbushMs',
        'inactivityAmbushCooldownMs',
    ];
    const out = {};
    for (const key of keys) {
        const vals = suggestions.map((s) => Number(s?.[key])).filter((n) => Number.isFinite(n));
        const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        out[key] = Math.round(avg);
    }
    return out;
}

function exportMissionBalanceSnapshots(history) {
    const payload = {
        exportedAt: Date.now(),
        count: Array.isArray(history) ? history.length : 0,
        entries: Array.isArray(history) ? history : [],
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aliens-mission-balance-snapshots.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported mission-end balance snapshots');
}

function buildAnomalyStabilizerPlan(editorState, history) {
    const latestByMission = new Map();
    for (const entry of Array.isArray(history) ? history : []) {
        const missionId = String(entry?.missionId || '');
        if (!missionId || latestByMission.has(missionId)) continue;
        latestByMission.set(missionId, entry);
    }
    const missionPlans = [];
    const existingEventIds = new Set((editorState?.directorEvents || []).map((e) => String(e?.id || '')).filter(Boolean));
    for (const mission of Array.isArray(editorState?.missions) ? editorState.missions : []) {
        const missionId = String(mission?.id || '');
        if (!missionId) continue;
        const snapshot = latestByMission.get(missionId);
        const anomalies = Array.isArray(snapshot?.anomalies) ? snapshot.anomalies : [];
        if (anomalies.length === 0) continue;

        const addEvents = [];
        const tune = {};
        const d = mission?.director || {};
        if (anomalies.includes('overpressure') || anomalies.includes('high_jam') || anomalies.includes('spiky_pressure')) {
            const reliefId = `stabilize_${missionId}_relief`;
            if (!existingEventIds.has(reliefId)) {
                addEvents.push({
                    id: reliefId,
                    missionId,
                    trigger: 'pressure:0.78',
                    action: 'set_pressure_grace',
                    params: { ms: 2200 },
                });
                existingEventIds.add(reliefId);
            }
            const capId = `stabilize_${missionId}_caps`;
            if (!existingEventIds.has(capId)) {
                addEvents.push({
                    id: capId,
                    missionId,
                    trigger: 'pressure:0.8',
                    action: 'set_reinforce_caps',
                    params: { idle: 3, gunfire: 6 },
                });
                existingEventIds.add(capId);
            }
            tune.reinforceCap = Math.round(clamp((Number(d.reinforceCap) || 16) * 0.92, 0, 80));
            tune.gunfireReinforceBaseMs = Math.round(clamp((Number(d.gunfireReinforceBaseMs) || 4500) * 1.08, 1200, 20000));
        }
        if (anomalies.includes('underpressure')) {
            const pushId = `stabilize_${missionId}_push`;
            if (!existingEventIds.has(pushId)) {
                addEvents.push({
                    id: pushId,
                    missionId,
                    trigger: 'time:24',
                    action: 'spawn_pack',
                    params: { size: 3, source: 'idle', dir: 'N' },
                });
                existingEventIds.add(pushId);
            }
            const edgeId = `stabilize_${missionId}_edge`;
            if (!existingEventIds.has(edgeId)) {
                addEvents.push({
                    id: edgeId,
                    missionId,
                    trigger: 'pressure:0.55',
                    action: 'edge_cue',
                    params: { cueId: 'cue_edge_contact', word: 'CONTACT' },
                });
                existingEventIds.add(edgeId);
            }
            tune.reinforceCap = Math.round(clamp((Number(d.reinforceCap) || 16) * 1.1, 0, 80));
            tune.idlePressureBaseMs = Math.round(clamp((Number(d.idlePressureBaseMs) || 7000) * 0.92, 2000, 30000));
        }

        missionPlans.push({
            missionId,
            missionName: String(mission?.name || missionId),
            anomalies,
            addEvents,
            tune,
        });
    }
    return missionPlans;
}

function summarizeAnomalyStabilizerPlan(plan) {
    const lines = ['Anomaly Stabilizer Preview:'];
    if (!Array.isArray(plan) || plan.length === 0) {
        lines.push('No anomaly-driven changes pending.');
        return lines;
    }
    for (const p of plan) {
        const tuneKeys = Object.keys(p.tune || {});
        lines.push(`${p.missionId}: ${p.anomalies.join(', ')}`);
        if (tuneKeys.length > 0) {
            lines.push(`  tune: ${tuneKeys.map((k) => `${k}=${p.tune[k]}`).join(' | ')}`);
        }
        if (p.addEvents.length > 0) {
            lines.push(`  events: +${p.addEvents.length} (${p.addEvents.map((e) => e.action).join(', ')})`);
        }
    }
    return lines;
}

function applyAnomalyStabilizerPlan(plan) {
    if (!Array.isArray(plan) || plan.length === 0) return { missions: 0, events: 0 };
    let missions = 0;
    let events = 0;
    const byId = new Map(state.missions.map((m) => [String(m?.id || ''), m]));
    const existingEventIds = new Set((state.directorEvents || []).map((e) => String(e?.id || '')).filter(Boolean));
    for (const p of plan) {
        const mission = byId.get(String(p.missionId || ''));
        if (!mission) continue;
        if (!mission.director || typeof mission.director !== 'object') mission.director = {};
        let tuned = false;
        for (const [k, v] of Object.entries(p.tune || {})) {
            const n = Number(v);
            if (!Number.isFinite(n)) continue;
            mission.director[k] = n;
            tuned = true;
        }
        if (tuned) missions++;
        for (const evt of p.addEvents || []) {
            const id = String(evt?.id || '');
            if (!id || existingEventIds.has(id)) continue;
            state.directorEvents.push(evt);
            existingEventIds.add(id);
            events++;
        }
    }
    return { missions, events };
}

function toSparkline(samples, key, width = 42) {
    if (!Array.isArray(samples) || samples.length === 0) return '(no data)';
    const chars = ' .:-=+*#%@';
    const vals = samples
        .map((s) => Number(s?.[key]))
        .filter((v) => Number.isFinite(v));
    if (vals.length === 0) return '(no data)';
    const step = Math.max(1, Math.floor(vals.length / width));
    const windowed = [];
    for (let i = 0; i < vals.length; i += step) {
        const chunk = vals.slice(i, i + step);
        const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
        windowed.push(avg);
    }
    const min = Math.min(...windowed);
    const max = Math.max(...windowed);
    const span = Math.max(0.0001, max - min);
    return windowed.map((v) => {
        const t = (v - min) / span;
        const idx = Math.max(0, Math.min(chars.length - 1, Math.round(t * (chars.length - 1))));
        return chars[idx];
    }).join('');
}

// ── Game Config Tab ────────────────────────────────────────────────────────

const WEAPON_DEFAULTS = Object.freeze({
    pulseRifle: { name: 'Pulse Rifle', damage: 13, fireRate: 110, bulletSpeed: 1200, spreadAngle: 0, bulletsPerShot: 1, heatPerShot: 6, overheatThreshold: 145, maxAmmo: null, ammoPickupAmount: null },
    shotgun:    { name: 'Shotgun',     damage: 30, fireRate: 500, bulletSpeed: 1000, spreadAngle: 0.2, bulletsPerShot: 5, heatPerShot: null, overheatThreshold: null, maxAmmo: 60, ammoPickupAmount: 15 },
    pistol:     { name: 'Pistol',      damage: 18, fireRate: 250, bulletSpeed: 1100, spreadAngle: 0, bulletsPerShot: 1, heatPerShot: null, overheatThreshold: null, maxAmmo: 120, ammoPickupAmount: 20 },
});

const ENEMY_DEFAULTS = Object.freeze({
    warrior:     { name: 'Warrior',       maxHealth: 34,  speed: 98,  contactDamage: 15, attackCooldownMs: 750, aggroRange: 640,  flankStrength: 0.52 },
    drone:       { name: 'Drone',         maxHealth: 44,  speed: 120, contactDamage: 18, attackCooldownMs: 560, aggroRange: 520,  flankStrength: 0.16, doorDamage: 2 },
    facehugger:  { name: 'Facehugger',    maxHealth: 24,  speed: 100, contactDamage: 7,  attackCooldownMs: 310, aggroRange: 900,  flankStrength: 0.3,  leapMinRange: 70, leapMaxRange: 210, leapSpeed: 540, leapCooldownMs: 1900, latchDurationMs: 900, latchDamage: 5 },
    queenLesser: { name: 'Lesser Queen',  maxHealth: 82,  speed: 120, contactDamage: 30, attackCooldownMs: 620, aggroRange: 1200, flankStrength: 0.22, doorDamage: 2 },
    queen:       { name: 'Alien Queen',   maxHealth: 132, speed: 125, contactDamage: 38, attackCooldownMs: 690, aggroRange: 1200, flankStrength: 0.18, doorDamage: 3, canBreachAnyDoor: true },
});

function gcField(id, label, value, placeholder, opts = {}) {
    const step = opts.step || (opts.isFloat ? '0.01' : '1');
    const min = opts.min != null ? ` min="${opts.min}"` : '';
    const max = opts.max != null ? ` max="${opts.max}"` : '';
    const displayVal = value != null ? value : '';
    return `
        <label class="small">${escapeHtml(label)}
            <input type="number" id="${id}" value="${displayVal}" placeholder="${placeholder}" step="${step}"${min}${max} style="width:100%">
        </label>`;
}

function renderGameConfigTab() {
    // Ensure state.gameConfig exists
    if (!state.gameConfig || typeof state.gameConfig !== 'object') {
        state.gameConfig = defaultGameConfig();
    }
    const gc = state.gameConfig;
    if (!gc.weapons || typeof gc.weapons !== 'object') gc.weapons = {};
    if (!gc.enemies || typeof gc.enemies !== 'object') gc.enemies = {};
    if (!gc.squad || typeof gc.squad !== 'object') gc.squad = defaultGameConfig().squad;
    if (!gc.global || typeof gc.global !== 'object') gc.global = defaultGameConfig().global;

    // ── Section A: Squad Configuration ──
    const squadHtml = `
        <details class="collapsible-section" open>
            <summary>Squad Configuration</summary>
            <div class="collapsible-section-body">
                <div class="row-3">
                    ${gcField('gc_squad_size', 'Squad Size', gc.squad.size, '4', { min: 2, max: 6 })}
                    ${gcField('gc_squad_leaderHealth', 'Leader Health', gc.squad.leaderHealth, '100', { min: 1 })}
                    ${gcField('gc_squad_leaderSpeed', 'Leader Speed', gc.squad.leaderSpeed, '180', { min: 1 })}
                </div>
                <div class="row-3">
                    ${gcField('gc_squad_followerHealth', 'Follower Health', gc.squad.followerHealth, '100', { min: 1 })}
                    ${gcField('gc_squad_followerSpeed', 'Follower Speed', gc.squad.followerSpeed, '220', { min: 1 })}
                    ${gcField('gc_squad_reactionDelayMs', 'Reaction Delay (ms)', gc.squad.reactionDelayMs, '90', { min: 0 })}
                </div>
            </div>
        </details>`;

    // ── Section B: Weapons ──
    const weaponCards = Object.keys(WEAPON_DEFAULTS).map((wKey) => {
        const def = WEAPON_DEFAULTS[wKey];
        const ov = gc.weapons[wKey] || {};
        const v = (field) => ov[field] != null ? ov[field] : '';
        const p = (field) => def[field] != null ? String(def[field]) : '';

        let fields = `
            <div class="row-3">
                ${gcField(`gc_w_${wKey}_damage`, 'Damage', v('damage'), p('damage'))}
                ${gcField(`gc_w_${wKey}_fireRate`, 'Fire Rate (ms)', v('fireRate'), p('fireRate'))}
                ${gcField(`gc_w_${wKey}_bulletSpeed`, 'Bullet Speed', v('bulletSpeed'), p('bulletSpeed'))}
            </div>
            <div class="row-3">
                ${gcField(`gc_w_${wKey}_spreadAngle`, 'Spread Angle', v('spreadAngle'), p('spreadAngle'), { isFloat: true })}
                ${gcField(`gc_w_${wKey}_bulletsPerShot`, 'Bullets Per Shot', v('bulletsPerShot'), p('bulletsPerShot'), { min: 1 })}
                <span></span>
            </div>`;

        if (def.heatPerShot != null) {
            fields += `
            <div class="row-3">
                ${gcField(`gc_w_${wKey}_heatPerShot`, 'Heat Per Shot', v('heatPerShot'), p('heatPerShot'))}
                ${gcField(`gc_w_${wKey}_overheatThreshold`, 'Overheat Threshold', v('overheatThreshold'), p('overheatThreshold'))}
                <span></span>
            </div>`;
        }
        if (def.maxAmmo != null) {
            fields += `
            <div class="row-3">
                ${gcField(`gc_w_${wKey}_maxAmmo`, 'Max Ammo', v('maxAmmo'), p('maxAmmo'), { min: 1 })}
                ${gcField(`gc_w_${wKey}_ammoPickupAmount`, 'Ammo Pickup', v('ammoPickupAmount'), p('ammoPickupAmount'), { min: 1 })}
                <span></span>
            </div>`;
        }

        return `
        <details class="collapsible-section">
            <summary>${escapeHtml(def.name)} <span class="small">(${wKey})</span></summary>
            <div class="collapsible-section-body">
                ${fields}
                <button class="small" data-gc-reset-weapon="${wKey}">Reset to Default</button>
            </div>
        </details>`;
    }).join('');

    const weaponsHtml = `
        <details class="collapsible-section" open>
            <summary>Weapons</summary>
            <div class="collapsible-section-body">${weaponCards}</div>
        </details>`;

    // ── Section C: Enemy Types ──
    const enemyCards = Object.keys(ENEMY_DEFAULTS).map((eKey) => {
        const def = ENEMY_DEFAULTS[eKey];
        const ov = gc.enemies[eKey] || {};
        const v = (field) => ov[field] != null ? ov[field] : '';
        const p = (field) => def[field] != null ? String(def[field]) : '';

        let fields = `
            <div class="row-3">
                ${gcField(`gc_e_${eKey}_maxHealth`, 'Max Health', v('maxHealth'), p('maxHealth'), { min: 1 })}
                ${gcField(`gc_e_${eKey}_speed`, 'Speed', v('speed'), p('speed'), { min: 1 })}
                ${gcField(`gc_e_${eKey}_contactDamage`, 'Contact Damage', v('contactDamage'), p('contactDamage'), { min: 0 })}
            </div>
            <div class="row-3">
                ${gcField(`gc_e_${eKey}_attackCooldownMs`, 'Attack Cooldown (ms)', v('attackCooldownMs'), p('attackCooldownMs'), { min: 50 })}
                ${gcField(`gc_e_${eKey}_aggroRange`, 'Aggro Range', v('aggroRange'), p('aggroRange'), { min: 0 })}
                ${gcField(`gc_e_${eKey}_flankStrength`, 'Flank Strength', v('flankStrength'), p('flankStrength'), { isFloat: true })}
            </div>`;

        // Type-specific fields
        if (def.leapMinRange != null) {
            fields += `
            <div class="row-3">
                ${gcField(`gc_e_${eKey}_leapMinRange`, 'Leap Min Range', v('leapMinRange'), p('leapMinRange'))}
                ${gcField(`gc_e_${eKey}_leapMaxRange`, 'Leap Max Range', v('leapMaxRange'), p('leapMaxRange'))}
                ${gcField(`gc_e_${eKey}_leapSpeed`, 'Leap Speed', v('leapSpeed'), p('leapSpeed'))}
            </div>
            <div class="row-3">
                ${gcField(`gc_e_${eKey}_leapCooldownMs`, 'Leap Cooldown (ms)', v('leapCooldownMs'), p('leapCooldownMs'))}
                ${gcField(`gc_e_${eKey}_latchDurationMs`, 'Latch Duration (ms)', v('latchDurationMs'), p('latchDurationMs'))}
                ${gcField(`gc_e_${eKey}_latchDamage`, 'Latch Damage', v('latchDamage'), p('latchDamage'))}
            </div>`;
        }
        if (def.doorDamage != null) {
            fields += `
            <div class="row-3">
                ${gcField(`gc_e_${eKey}_doorDamage`, 'Door Damage', v('doorDamage'), p('doorDamage'), { min: 0 })}
                <span></span>
                <span></span>
            </div>`;
        }
        if (def.canBreachAnyDoor != null) {
            const checked = (ov.canBreachAnyDoor != null ? ov.canBreachAnyDoor : def.canBreachAnyDoor) ? 'checked' : '';
            fields += `
            <div class="row">
                <label class="small"><input type="checkbox" id="gc_e_${eKey}_canBreachAnyDoor" ${checked}> Can Breach Any Door</label>
            </div>`;
        }

        return `
        <details class="collapsible-section">
            <summary>${escapeHtml(def.name)} <span class="small">(${eKey})</span></summary>
            <div class="collapsible-section-body">
                ${fields}
                <button class="small" data-gc-reset-enemy="${eKey}">Reset to Default</button>
            </div>
        </details>`;
    }).join('');

    const enemiesHtml = `
        <details class="collapsible-section" open>
            <summary>Enemy Types</summary>
            <div class="collapsible-section-body">${enemyCards}</div>
        </details>`;

    // ── Section D: Global Settings ──
    const globalHtml = `
        <details class="collapsible-section" open>
            <summary>Global Settings</summary>
            <div class="collapsible-section-body">
                <div class="row-3">
                    ${gcField('gc_global_torchRange', 'Torch Range', gc.global.torchRange, '470')}
                    ${gcField('gc_global_torchConeHalfAngle', 'Torch Cone Half Angle', gc.global.torchConeHalfAngle, '0.65', { isFloat: true })}
                    ${gcField('gc_global_motionTrackerRange', 'Motion Tracker Range', gc.global.motionTrackerRange, '420')}
                </div>
                <div class="row-3">
                    ${gcField('gc_global_doorHackDuration', 'Door Hack (ms)', gc.global.doorHackDuration, '3000')}
                    ${gcField('gc_global_doorLockDuration', 'Door Lock (ms)', gc.global.doorLockDuration, '3000')}
                    <span></span>
                </div>
                <div class="row-3">
                    ${gcField('gc_global_doorWeldDuration', 'Door Weld (ms)', gc.global.doorWeldDuration, '4000')}
                    ${gcField('gc_global_doorUnweldDuration', 'Door Unweld (ms)', gc.global.doorUnweldDuration, '3000')}
                    <span></span>
                </div>
            </div>
        </details>`;

    // ── Assemble ──
    panels.gameconfig.innerHTML = `
        <div class="controls">
            <h2>Game Config</h2>
            <p class="small">Override weapon stats, enemy stats, squad parameters, and global settings. Empty fields use defaults.</p>
            <button id="gc_applyBtn">Apply Config</button>
            <button id="gc_resetAllBtn">Reset All to Defaults</button>
            ${squadHtml}
            ${weaponsHtml}
            ${enemiesHtml}
            ${globalHtml}
        </div>`;

    // ── Bind events ──
    document.getElementById('gc_applyBtn').addEventListener('click', () => {
        applyGameConfigFromInputs();
    });
    document.getElementById('gc_resetAllBtn').addEventListener('click', () => {
        state.gameConfig = defaultGameConfig();
        saveState('Game config reset to defaults');
        renderGameConfigTab();
    });
    document.querySelectorAll('[data-gc-reset-weapon]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.gcResetWeapon;
            delete state.gameConfig.weapons[key];
            saveState(`Weapon ${key} reset to default`);
            renderGameConfigTab();
        });
    });
    document.querySelectorAll('[data-gc-reset-enemy]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.gcResetEnemy;
            delete state.gameConfig.enemies[key];
            saveState(`Enemy ${key} reset to default`);
            renderGameConfigTab();
        });
    });
}

function applyGameConfigFromInputs() {
    const gc = state.gameConfig;

    // Squad
    const squadFields = ['size', 'leaderHealth', 'followerHealth', 'leaderSpeed', 'followerSpeed', 'reactionDelayMs'];
    for (const f of squadFields) {
        const el = document.getElementById(`gc_squad_${f}`);
        if (el && el.value !== '') gc.squad[f] = Number(el.value);
    }

    // Weapons
    const weaponFields = ['damage', 'fireRate', 'bulletSpeed', 'spreadAngle', 'bulletsPerShot', 'heatPerShot', 'overheatThreshold', 'maxAmmo', 'ammoPickupAmount'];
    for (const wKey of Object.keys(WEAPON_DEFAULTS)) {
        const overrides = {};
        let hasOverride = false;
        for (const f of weaponFields) {
            const el = document.getElementById(`gc_w_${wKey}_${f}`);
            if (el && el.value !== '') {
                overrides[f] = Number(el.value);
                hasOverride = true;
            }
        }
        if (hasOverride) {
            gc.weapons[wKey] = { ...(gc.weapons[wKey] || {}), ...overrides };
        }
    }

    // Enemies
    const enemyFields = ['maxHealth', 'speed', 'contactDamage', 'attackCooldownMs', 'aggroRange', 'flankStrength',
        'leapMinRange', 'leapMaxRange', 'leapSpeed', 'leapCooldownMs', 'latchDurationMs', 'latchDamage', 'doorDamage'];
    for (const eKey of Object.keys(ENEMY_DEFAULTS)) {
        const overrides = {};
        let hasOverride = false;
        for (const f of enemyFields) {
            const el = document.getElementById(`gc_e_${eKey}_${f}`);
            if (el && el.value !== '') {
                overrides[f] = Number(el.value);
                hasOverride = true;
            }
        }
        // Checkbox fields
        const breachEl = document.getElementById(`gc_e_${eKey}_canBreachAnyDoor`);
        if (breachEl) {
            overrides.canBreachAnyDoor = breachEl.checked;
            hasOverride = true;
        }
        if (hasOverride) {
            gc.enemies[eKey] = { ...(gc.enemies[eKey] || {}), ...overrides };
        }
    }

    // Global
    const globalFields = ['torchRange', 'torchConeHalfAngle', 'motionTrackerRange', 'doorHackDuration', 'doorLockDuration', 'doorWeldDuration', 'doorUnweldDuration'];
    for (const f of globalFields) {
        const el = document.getElementById(`gc_global_${f}`);
        if (el && el.value !== '') gc.global[f] = Number(el.value);
    }

    saveState('Game config updated');
    renderGameConfigTab();
}

function refreshPackageValidationSummary() {
    if (!validationEl) return;
    const missionPkg = buildPackageWithHud();
    const payload = JSON.stringify(missionPkg);
    const errors = validateMissionPackageShape(missionPkg);
    const quality = analyzeMissionPackageQuality(missionPkg);
    const publishedLine = 'Published: (managed by server)';

    if (!errors.length) {
        validationEl.classList.remove('err');
        validationEl.classList.add('ok');
        const qualityText = quality.warnings.length
            ? `\nQuality: ${quality.score}/100 (${quality.warnings.length} warning${quality.warnings.length === 1 ? '' : 's'})\n- ${quality.warnings.join('\n- ')}`
            : `\nQuality: ${quality.score}/100 (no warnings)`;
        const strictCfg = getStrictPublishConfig();
        const strictLine = strictCfg.enabled
            ? `\nStrict publish: ON (threshold ${strictCfg.threshold})`
            : '\nStrict publish: OFF';

        validationEl.innerHTML = `
            <div class="topbar-summary">✔ PKG: OK | Msn: ${missionPkg.missions.length} | Q: ${quality.score}</div>
            <div class="topbar-details">
                Maps: ${missionPkg.maps.length} | Events: ${(missionPkg.directorEvents || []).length} | Cues: ${(missionPkg.audioCues || []).length}${qualityText}${strictLine}
                <hr class="action-divider">
                ${publishedLine}
            </div>`;
        return;
    }
    validationEl.classList.remove('ok');
    validationEl.classList.add('err');
    validationEl.innerHTML = `
        <div class="topbar-summary">✖ PKG: ${errors.length} ISSUE(S)</div>
        <div class="topbar-details">
            - ${errors.join('\n- ')}
            <hr class="action-divider">
            ${publishedLine}
        </div>`;
}

function loadPackageHistory() {
    try {
        const raw = localStorage.getItem(PACKAGE_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function savePackageHistory(entries) {
    const compact = (Array.isArray(entries) ? entries : [])
        .filter((e) => e && typeof e === 'object' && typeof e.payload === 'string')
        .slice(0, PACKAGE_HISTORY_MAX);
    localStorage.setItem(PACKAGE_HISTORY_KEY, JSON.stringify(compact));
}

function pushPackageHistory(payload, source = 'publish') {
    const entries = loadPackageHistory();
    entries.unshift({
        source: String(source || 'publish'),
        ts: Date.now(),
        sizeBytes: payload.length,
        checksum: checksumString(payload),
        payload,
    });
    savePackageHistory(entries);
}

function publishPackagePayload(payload, source = 'publish') {
    writePackageSnapshot(payload, { source, recordHistory: true });
}

function renderPackageHistory() {
    if (!packageHistoryEl) return;
    const entries = loadPackageHistory();
    if (entries.length === 0) {
        packageHistoryEl.innerHTML = '<div class="topbar-summary">History: none</div>';
        return;
    }
    const top = entries.slice(0, 8);
    packageHistoryEl.innerHTML = `
        <div class="topbar-summary">History: ${entries.length} versions</div>
        <div class="topbar-details">
            ${top.map((e, i) => {
                const when = new Date(Number(e.ts) || Date.now()).toLocaleString();
                const src = String(e.source || 'publish').toUpperCase();
                const size = Number(e.sizeBytes) || 0;
                return `
                    <div class="history-row">
                        <span>${i + 1}. ${src} ${size}B @ ${when}</span>
                        <div style="display:flex;gap:4px">
                            <button data-hist-load="${i}">Load</button>
                            <button data-hist-pub="${i}">Publish</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    packageHistoryEl.querySelectorAll('[data-hist-load]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.histLoad);
            const item = top[idx];
            if (!item || typeof item.payload !== 'string') return;
            try {
                const parsed = JSON.parse(item.payload);
                applyMissionPackageToState(parsed);
                saveState('Loaded package history snapshot');
                renderAll();
                setStatus('Loaded package snapshot into editor');
            } catch {
                setStatus('History load failed: invalid snapshot');
            }
        });
    });
    packageHistoryEl.querySelectorAll('[data-hist-pub]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.histPub);
            const item = top[idx];
            if (!item || typeof item.payload !== 'string') return;
            publishPackagePayload(item.payload, 'republish');
            refreshPackageValidationSummary();
            renderPackageDiffPreview();
            renderPackageHistory();
            setStatus('Published package snapshot to game storage');
        });
    });
}

document.getElementById('saveAllBtn').addEventListener('click', () => saveState('Saved all sections', {
    packageSource: 'save',
    recordPackageHistory: true,
}));
document.getElementById('validatePackageBtn').addEventListener('click', () => {
    refreshPackageValidationSummary();
    if (validationEl?.classList.contains('ok')) {
        setStatus('Mission package validation passed');
    } else {
        setStatus('Mission package validation failed');
    }
});
document.getElementById('clearPackageHistoryBtn').addEventListener('click', () => {
    localStorage.removeItem(PACKAGE_HISTORY_KEY);
    renderPackageHistory();
    setStatus('Cleared package history');
});
document.getElementById('publishPackageBtn').addEventListener('click', () => {
    const missionPkg = buildPackageWithHud();
    const errors = validateMissionPackageShape(missionPkg);

    // Topology Validation
    const topoWarnings = [];
    for (const map of state.tilemaps) {
        const topo = validateMapTopology(map);
        if (topo.errors.length > 0) {
            const message = `Publish blocked: Map "${map.id}" has topology errors (${topo.errors[0]})`;
            setStatus(message);
            showFeedbackPopup(message, 'error');
            return;
        }
        topoWarnings.push(...topo.warnings.map(w => `[${map.id}] ${w}`));
    }

    if (errors.length) {
        const message = `Publish blocked: ${errors[0]}`;
        setStatus(message);
        showFeedbackPopup(message, 'error');
        refreshPackageValidationSummary();
        return;
    }
    const quality = analyzeMissionPackageQuality(missionPkg);
    const strictCfg = getStrictPublishConfig();
    if (strictCfg.enabled && quality.score < strictCfg.threshold) {
        const message = `Publish blocked: quality ${quality.score} < threshold ${strictCfg.threshold}`;
        setStatus(message);
        showFeedbackPopup(message, 'error');
        refreshPackageValidationSummary();
        return;
    }
    const payload = JSON.stringify(missionPkg);
    publishPackagePayload(payload, 'publish');
    const totalWarnings = quality.warnings.length + topoWarnings.length;
    if (totalWarnings > 0) {
        setStatus(`Mission package published with ${totalWarnings} warning(s)`);
        showFeedbackPopup(`Published with ${totalWarnings} warning(s)`, 'success');
        console.warn('Topology Warnings:', topoWarnings);
    } else {
        setStatus('Mission package published to game storage');
        showFeedbackPopup('Mission package published successfully', 'success');
    }
    refreshPackageValidationSummary();
    renderPackageHistory();
    renderPackageDiffPreview();
});

document.getElementById('autoTunePackageBtn').addEventListener('click', () => {
    try {
        const missionPkg = buildPackageWithHud();
        const tuned = autoTuneMissionPackage(missionPkg);
        const errors = validateMissionPackageShape(tuned.pkg);
        if (errors.length) {
            setStatus(`Auto-tune blocked: ${errors[0]}`);
            refreshPackageValidationSummary();
            return;
        }
        applyMissionPackageToState(tuned.pkg);
        saveState(`Auto-tuned package (+${tuned.added.audioCues} cues, +${tuned.added.directorEvents} events)`);
        renderAll();
        setStatus(`Auto-tuned package (+${tuned.added.audioCues} cues, +${tuned.added.directorEvents} events)`);
    } catch (err) {
        const detail = err && err.message ? err.message : 'auto tune failed';
        setStatus(`Auto-tune failed: ${detail}`);
    }
});

function applyQualityProfilePreset(profileName) {
    try {
        const missionPkg = buildPackageWithHud();
        const profiled = applyQualityProfile(missionPkg, profileName);
        const errors = validateMissionPackageShape(profiled);
        if (errors.length) {
            setStatus(`Profile apply blocked: ${errors[0]}`);
            refreshPackageValidationSummary();
            return;
        }
        applyMissionPackageToState(profiled);
        saveState(`Applied ${profileName} quality profile`);
        renderAll();
        setStatus(`Applied ${profileName} quality profile`);
    } catch (err) {
        const detail = err && err.message ? err.message : 'profile apply failed';
        setStatus(`Profile apply failed: ${detail}`);
    }
}

function getStrictPublishConfig() {
    const enabled = !!(strictQualityToggleEl && strictQualityToggleEl.checked);
    const threshold = strictQualityThresholdEl
        ? clamp(Math.round(Number(strictQualityThresholdEl.value) || 72), 0, 100)
        : 72;
    return { enabled, threshold };
}

function loadStrictPublishConfig() {
    try {
        const raw = localStorage.getItem(STRICT_QUALITY_STORAGE_KEY);
        if (!raw) return { enabled: false, threshold: 72 };
        const parsed = JSON.parse(raw);
        return {
            enabled: parsed && parsed.enabled === true,
            threshold: clamp(Math.round(Number(parsed?.threshold) || 72), 0, 100),
        };
    } catch {
        return { enabled: false, threshold: 72 };
    }
}

function saveStrictPublishConfig() {
    const cfg = getStrictPublishConfig();
    try {
        localStorage.setItem(STRICT_QUALITY_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
        // Ignore storage failures.
    }
}

if (strictQualityToggleEl && strictQualityThresholdEl) {
    const cfg = loadStrictPublishConfig();
    strictQualityToggleEl.checked = cfg.enabled;
    strictQualityThresholdEl.value = String(cfg.threshold);
    strictQualityToggleEl.addEventListener('change', () => {
        saveStrictPublishConfig();
        refreshPackageValidationSummary();
    });
    strictQualityThresholdEl.addEventListener('input', () => {
        saveStrictPublishConfig();
        refreshPackageValidationSummary();
    });
}

function checksumString(s) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}

document.getElementById('exportBtn').addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aliens-editor-data.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported JSON snapshot');
});

document.getElementById('exportPackageBtn').addEventListener('click', () => {
    const missionPkg = buildPackageWithHud();
    const errors = validateMissionPackageShape(missionPkg);
    if (errors.length) {
        setStatus(`Package export blocked: ${errors[0]}`);
        return;
    }
    const data = JSON.stringify(missionPkg, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aliens-mission-package-v1.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported mission package');
});

document.getElementById('importFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const merged = mergeWithDefaults(parsed);
        Object.assign(state, merged);
        saveState('Imported JSON');
        renderAll();
    } catch {
        setStatus('Import failed: invalid JSON');
    }
});

document.getElementById('importPackageFile').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        applyMissionPackageToState(parsed);
        saveState('Imported mission package');
        pushPackageHistory(JSON.stringify(buildPackageWithHud()), 'import');
        renderAll();
        renderPackageHistory();
    } catch (err) {
        const detail = err && err.message ? err.message : 'invalid package';
        setStatus(`Mission package import failed: ${detail}`);
    }
});

// ============================================================
// Sound Tab
// ============================================================

const SOUND_CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'sfx', label: 'SFX' },
    { id: 'speech', label: 'Speech' },
    { id: 'music', label: 'Music' },
    { id: 'ambient', label: 'Ambient' },
];

// Built-in game audio assets — shown automatically so the editor isn't empty on first open.
// These use server paths (url) instead of dataUrl; WaveSurfer loads them directly.
const BUILTIN_SOUNDS = [
    { id: '_b_pulse_rifle_short',   name: 'Pulse Rifle (Short)',    category: 'sfx',     url: '/src/audio/pulse_rifle_short.ogg' },
    { id: '_b_pulse_rifle_long',    name: 'Pulse Rifle (Long)',     category: 'sfx',     url: '/src/audio/pulse_rifle_long.ogg' },
    { id: '_b_alien_hiss',          name: 'Alien Hiss',             category: 'sfx',     url: '/src/audio/alien_hiss.mp3' },
    { id: '_b_alien_screech',       name: 'Alien Screech',          category: 'sfx',     url: '/src/audio/alien_screech.mp3' },
    { id: '_b_facehugger_crawl',    name: 'Facehugger Crawl',       category: 'sfx',     url: '/src/audio/facehugger_crawl.mp3' },
    { id: '_b_queen_hiss',          name: 'Queen Hiss',             category: 'sfx',     url: '/src/audio/queen_hiss.wav' },
    { id: '_b_door_open_close',     name: 'Door Open/Close',        category: 'sfx',     url: '/src/audio/door_open_close.mp3' },
    { id: '_b_door_weld',           name: 'Door Weld',              category: 'sfx',     url: '/src/audio/door_weld.mp3' },
    { id: '_b_motion_tracker_beep', name: 'Motion Tracker Beep',    category: 'sfx',     url: '/src/audio/motion_tracker_beep.ogg' },
    { id: '_b_steam_hiss',          name: 'Steam Hiss',             category: 'ambient', url: '/src/audio/steam_hiss.mp3' },
    { id: '_b_colony_music',        name: 'Colony (Music)',          category: 'music',   url: '/src/music/Colony.mp3' },
    { id: '_b_motion_radar',        name: 'Motion Radar Theme',     category: 'music',   url: '/aliens-motion-radar.mp3' },
];

function _soundFmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function _generateImpulseResponse(audioCtx, amount) {
    const dur = 0.5 + amount * 3.5;
    const rate = audioCtx.sampleRate;
    const len = Math.floor(rate * dur);
    const ir = audioCtx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2 + amount * 3);
        }
    }
    return ir;
}

function _audioBufferToWavBlob(buffer) {
    const { numberOfChannels, sampleRate, length } = buffer;
    const pcm = new Int16Array(length * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
            pcm[i * numberOfChannels + c] = Math.max(-32768, Math.min(32767, Math.round(ch[i] * 32767)));
        }
    }
    const dataLen = pcm.byteLength;
    const wavBuf = new ArrayBuffer(44 + dataLen);
    const v = new DataView(wavBuf);
    const enc = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
    enc(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); enc(8, 'WAVE');
    enc(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, numberOfChannels, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * numberOfChannels * 2, true);
    v.setUint16(32, numberOfChannels * 2, true); v.setUint16(34, 16, true);
    enc(36, 'data'); v.setUint32(40, dataLen, true);
    new Int16Array(wavBuf, 44).set(pcm);
    return new Blob([wavBuf], { type: 'audio/wav' });
}

async function _renderSoundWithEffects(dataUrl, fx) {
    const resp = await fetch(dataUrl);
    const ab = await resp.arrayBuffer();
    const decodeCtx = new AudioContext();
    let audioBuffer;
    try {
        audioBuffer = await decodeCtx.decodeAudioData(ab);
    } finally {
        decodeCtx.close();
    }
    const { numberOfChannels, sampleRate, duration } = audioBuffer;
    const tailSecs = Math.max(fx.reverbAmount * 4, fx.echoTime * 4, 0.5);
    const totalLen = Math.ceil((duration + tailSecs) * sampleRate);
    const offline = new OfflineAudioContext(numberOfChannels, totalLen, sampleRate);

    const src = offline.createBufferSource();
    src.buffer = audioBuffer;

    const fadeGain = offline.createGain();
    const fi = Math.max(fx.fadeIn || 0, 0.001);
    const fo = fx.fadeOut || 0;
    fadeGain.gain.setValueAtTime(0, 0);
    fadeGain.gain.linearRampToValueAtTime(1, fi);
    if (fo > 0.01) {
        const outStart = Math.max(fi, duration - fo);
        if (outStart < duration) {
            fadeGain.gain.setValueAtTime(1, outStart);
            fadeGain.gain.linearRampToValueAtTime(0, duration);
        }
    }

    src.connect(fadeGain);
    fadeGain.connect(offline.destination);

    if (fx.reverbAmount > 0.01) {
        const convolver = offline.createConvolver();
        convolver.buffer = _generateImpulseResponse(offline, fx.reverbAmount);
        const reverbGain = offline.createGain();
        reverbGain.gain.value = fx.reverbAmount * 0.8;
        fadeGain.connect(convolver);
        convolver.connect(reverbGain);
        reverbGain.connect(offline.destination);
    }

    if (fx.echoTime > 0.01 && fx.echoFeedback > 0.01) {
        const delay = offline.createDelay(2.0);
        delay.delayTime.value = fx.echoTime;
        const fbGain = offline.createGain();
        fbGain.gain.value = fx.echoFeedback;
        const echoOutGain = offline.createGain();
        echoOutGain.gain.value = 0.5;
        fadeGain.connect(delay);
        delay.connect(fbGain);
        fbGain.connect(delay);
        delay.connect(echoOutGain);
        echoOutGain.connect(offline.destination);
    }

    src.start(0);
    return offline.startRendering();
}

function renderSoundTab() {
    const panel = panels.sound;
    if (!panel) return;

    // Destroy previous WaveSurfer before replacing DOM
    if (_soundWaveSurfer) {
        try { _soundWaveSurfer.destroy(); } catch {}
        _soundWaveSurfer = null;
    }

    // Merge user-uploaded sounds with built-in game assets
    const allSounds = [...BUILTIN_SOUNDS, ..._soundList];
    const filtered = _soundCategory === 'all'
        ? allSounds
        : allSounds.filter(s => s.category === _soundCategory);

    const activeSound = allSounds.find(s => s.id === _activeSoundId) || null;

    const catButtonsHtml = SOUND_CATEGORIES.map(c =>
        `<button class="sound-cat-btn${_soundCategory === c.id ? ' active' : ''}" data-sound-cat="${c.id}">${c.label}</button>`
    ).join('');

    const listHtml = filtered.length
        ? filtered.map(s => `
            <div class="sound-list-item${s.id === _activeSoundId ? ' active' : ''}" data-sound-id="${s.id}">
                <span class="sound-item-icon">${s.category === 'music' ? '♪' : s.category === 'speech' ? '💬' : s.category === 'ambient' ? '〜' : '◉'}</span>
                <span class="sound-item-name">${escapeHtml(s.name)}</span>
                <span class="sound-item-cat">${s.category}</span>
            </div>`).join('')
        : `<div class="sound-empty">No sounds${_soundCategory !== 'all' ? ' in this category' : ''}.</div>`;

    const fx = _soundEffects;
    const catOptions = SOUND_CATEGORIES.filter(c => c.id !== 'all')
        .map(c => `<option value="${c.id}"${(activeSound?.category || 'sfx') === c.id ? ' selected' : ''}>${c.label}</option>`)
        .join('');

    panel.innerHTML = `
    <div class="sound-shell">
      <div class="sound-sidebar">
        <div class="sound-cats">${catButtonsHtml}</div>
        <div class="sound-list" id="soundListEl">${listHtml}</div>
        <label class="sound-add-label">
          + Add Sound
          <input type="file" id="soundFileInput" accept=".wav,.mp3,.ogg,audio/*" multiple>
        </label>
      </div>
      <div class="sound-main">
        <div class="sound-header">
          <span class="sound-name-display">${activeSound ? escapeHtml(activeSound.name) : 'No sound selected'}</span>
          ${activeSound ? `
          <select id="soundCatAssign" class="sound-cat-select"${activeSound.id.startsWith('_b_') ? ' disabled title="Built-in sound — category cannot be changed"' : ''}>${catOptions}</select>
          ${!activeSound.id.startsWith('_b_') ? '<button id="soundDeleteBtn" class="sound-btn-danger">Delete</button>' : '<span class="sound-builtin-badge">Built-in</span>'}
          ` : ''}
        </div>
        <div id="sound-waveform" class="sound-waveform-container${!activeSound ? ' sound-waveform-empty' : ''}">
          ${!activeSound ? '<span class="sound-waveform-hint">Select or add a sound to display waveform</span>' : ''}
        </div>
        <div class="sound-transport">
          <button id="soundPlayBtn" class="sound-transport-btn"${!activeSound ? ' disabled' : ''}>▶ Play</button>
          <button id="soundStopBtn" class="sound-transport-btn"${!activeSound ? ' disabled' : ''}>■ Stop</button>
          <span id="soundTimeDisplay" class="sound-time">0:00 / 0:00</span>
        </div>
        <div class="sound-effects-panel">
          <h4 class="sound-effects-title">Effects</h4>
          <div class="sound-effect-row">
            <label class="sound-fx-label">Reverb</label>
            <input type="range" id="fxReverb" class="sound-fx-slider" min="0" max="1" step="0.01" value="${fx.reverbAmount.toFixed(2)}">
            <span class="sound-fx-val" id="fxReverbVal">${fx.reverbAmount.toFixed(2)}</span>
          </div>
          <div class="sound-effect-row">
            <label class="sound-fx-label">Echo Time (s)</label>
            <input type="range" id="fxEchoTime" class="sound-fx-slider" min="0" max="1" step="0.01" value="${fx.echoTime.toFixed(2)}">
            <span class="sound-fx-val" id="fxEchoTimeVal">${fx.echoTime.toFixed(2)}s</span>
          </div>
          <div class="sound-effect-row">
            <label class="sound-fx-label">Echo Feedback</label>
            <input type="range" id="fxEchoFeedback" class="sound-fx-slider" min="0" max="0.9" step="0.01" value="${fx.echoFeedback.toFixed(2)}">
            <span class="sound-fx-val" id="fxEchoFeedbackVal">${fx.echoFeedback.toFixed(2)}</span>
          </div>
          <div class="sound-effect-row">
            <label class="sound-fx-label">Fade In (s)</label>
            <input type="range" id="fxFadeIn" class="sound-fx-slider" min="0" max="5" step="0.1" value="${fx.fadeIn.toFixed(1)}">
            <span class="sound-fx-val" id="fxFadeInVal">${fx.fadeIn.toFixed(1)}s</span>
          </div>
          <div class="sound-effect-row">
            <label class="sound-fx-label">Fade Out (s)</label>
            <input type="range" id="fxFadeOut" class="sound-fx-slider" min="0" max="5" step="0.1" value="${fx.fadeOut.toFixed(1)}">
            <span class="sound-fx-val" id="fxFadeOutVal">${fx.fadeOut.toFixed(1)}s</span>
          </div>
          <div class="sound-export-row">
            <button id="soundExportBtn" class="sound-btn-accent"${!activeSound ? ' disabled' : ''}>Export WAV</button>
            <span id="soundExportStatus" class="sound-export-status"></span>
          </div>
        </div>
      </div>
    </div>`;

    // Init WaveSurfer for active sound
    if (activeSound && typeof WaveSurfer !== 'undefined') {
        try {
            _soundWaveSurfer = WaveSurfer.create({
                container: '#sound-waveform',
                waveColor: '#4aa4d8',
                progressColor: '#7ecfff',
                cursorColor: '#f0f6ff',
                barWidth: 2,
                barRadius: 2,
                height: 80,
                responsive: true,
                backend: 'WebAudio',
            });
            _soundWaveSurfer.load(activeSound.url || activeSound.dataUrl);
            _soundWaveSurfer.on('ready', () => {
                const dur = _soundWaveSurfer.getDuration();
                const el = panel.querySelector('#soundTimeDisplay');
                if (el) el.textContent = `0:00 / ${_soundFmtTime(dur)}`;
            });
            _soundWaveSurfer.on('audioprocess', () => {
                const cur = _soundWaveSurfer.getCurrentTime();
                const dur = _soundWaveSurfer.getDuration();
                const el = panel.querySelector('#soundTimeDisplay');
                if (el) el.textContent = `${_soundFmtTime(cur)} / ${_soundFmtTime(dur)}`;
            });
            _soundWaveSurfer.on('finish', () => {
                const btn = panel.querySelector('#soundPlayBtn');
                if (btn) btn.textContent = '▶ Play';
            });
        } catch (err) {
            console.warn('WaveSurfer init failed:', err);
        }
    }

    // --- Event handlers ---
    panel.querySelector('#soundFileInput')?.addEventListener('change', (ev) => {
        const files = Array.from(ev.target.files || []);
        if (!files.length) return;
        let loaded = 0;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const id = 'snd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                const ext = file.name.split('.').pop().toLowerCase();
                const category = ext === 'mp3' || ext === 'ogg' || ext === 'wav' ? 'sfx' : 'sfx';
                _soundList.push({ id, name: file.name, category, dataUrl: e.target.result });
                _activeSoundId = id;
                _saveSounds();
                loaded++;
                if (loaded === files.length) renderSoundTab();
            };
            reader.readAsDataURL(file);
        });
        ev.target.value = '';
    });

    panel.querySelector('#soundListEl')?.addEventListener('click', (ev) => {
        const item = ev.target.closest('[data-sound-id]');
        if (!item) return;
        _activeSoundId = item.dataset.soundId;
        renderSoundTab();
    });

    panel.querySelectorAll('[data-sound-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            _soundCategory = btn.dataset.soundCat;
            renderSoundTab();
        });
    });

    panel.querySelector('#soundCatAssign')?.addEventListener('change', (ev) => {
        const snd = _soundList.find(s => s.id === _activeSoundId);
        if (snd) { snd.category = ev.target.value; _saveSounds(); }
    });

    panel.querySelector('#soundDeleteBtn')?.addEventListener('click', () => {
        if (!_activeSoundId) return;
        _soundList = _soundList.filter(s => s.id !== _activeSoundId);
        _activeSoundId = _soundList[0]?.id || null;
        _saveSounds();
        renderSoundTab();
    });

    panel.querySelector('#soundPlayBtn')?.addEventListener('click', () => {
        if (!_soundWaveSurfer) return;
        if (_soundWaveSurfer.isPlaying()) {
            _soundWaveSurfer.pause();
            panel.querySelector('#soundPlayBtn').textContent = '▶ Play';
        } else {
            _soundWaveSurfer.play();
            panel.querySelector('#soundPlayBtn').textContent = '⏸ Pause';
        }
    });

    panel.querySelector('#soundStopBtn')?.addEventListener('click', () => {
        if (!_soundWaveSurfer) return;
        _soundWaveSurfer.stop();
        panel.querySelector('#soundPlayBtn').textContent = '▶ Play';
    });

    // Effects sliders
    const fxSliders = [
        { id: 'fxReverb', key: 'reverbAmount', valId: 'fxReverbVal', fmt: v => v.toFixed(2) },
        { id: 'fxEchoTime', key: 'echoTime', valId: 'fxEchoTimeVal', fmt: v => v.toFixed(2) + 's' },
        { id: 'fxEchoFeedback', key: 'echoFeedback', valId: 'fxEchoFeedbackVal', fmt: v => v.toFixed(2) },
        { id: 'fxFadeIn', key: 'fadeIn', valId: 'fxFadeInVal', fmt: v => v.toFixed(1) + 's' },
        { id: 'fxFadeOut', key: 'fadeOut', valId: 'fxFadeOutVal', fmt: v => v.toFixed(1) + 's' },
    ];
    fxSliders.forEach(({ id, key, valId, fmt }) => {
        panel.querySelector(`#${id}`)?.addEventListener('input', (ev) => {
            _soundEffects[key] = parseFloat(ev.target.value);
            const valEl = panel.querySelector(`#${valId}`);
            if (valEl) valEl.textContent = fmt(_soundEffects[key]);
        });
    });

    panel.querySelector('#soundExportBtn')?.addEventListener('click', async () => {
        const snd = _soundList.find(s => s.id === _activeSoundId);
        if (!snd) return;
        const statusEl = panel.querySelector('#soundExportStatus');
        const btn = panel.querySelector('#soundExportBtn');
        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Rendering…';
        try {
            const rendered = await _renderSoundWithEffects(snd.dataUrl, _soundEffects);
            const blob = _audioBufferToWavBlob(rendered);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const baseName = snd.name.replace(/\.[^.]+$/, '');
            a.href = url;
            a.download = `${baseName}_export.wav`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            if (statusEl) statusEl.textContent = 'Exported!';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        } catch (err) {
            if (statusEl) statusEl.textContent = `Error: ${err.message}`;
            console.error('Sound export failed:', err);
        } finally {
            btn.disabled = false;
        }
    });
}

function renderAll() {
    renderSpriteTab();
    renderAnimationTab();
    renderTilemapTab();
    renderMissionsTab();
    renderGameConfigTab();
    renderHudTab();
    // Sound tab is lazy-rendered on first switch, not pre-rendered here
    refreshPackageValidationSummary();
    renderPackageDiffPreview();
    renderPackageHistory();
}

window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement) {
        return;
    }

    const key = ev.key.toLowerCase();
    if (activeTab === 'tilemap' && /^[1-8]$/.test(key)) {
        const preset = TILEMAP_LAYER_PRESETS[Number(key) - 1];
        if (preset) {
            setActiveTilemapLayer(preset.id);
            setStatus(`Tilemap layer: ${preset.label.toUpperCase()}`);
        }
        return;
    }
    if (activeTab === 'tilemap' && selectedObject && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        ev.preventDefault();
        const step = ev.shiftKey ? 5 : 1;
        const delta = key === 'arrowup'
            ? [0, -step]
            : key === 'arrowdown'
                ? [0, step]
                : key === 'arrowleft'
                    ? [-step, 0]
                    : [step, 0];
        if (nudgeSelectedObject(delta[0], delta[1])) {
            saveState(`${selectedObject.kind} nudged${step > 1 ? ` (${step})` : ''}`);
            renderTilemapTab();
        }
        return;
    }
    if (activeTab === 'tilemap' && (ev.ctrlKey || ev.metaKey) && key === 'd' && selectedObject) {
        ev.preventDefault();
        if (duplicateSelectedObject()) {
            saveState(`${selectedObject.kind} duplicated`);
            renderTilemapTab();
        }
        return;
    }
    // Escape to deselect in tilemap select mode
    if (activeTab === 'tilemap' && key === 'escape' && (selectedTile || selectedObject)) {
        selectedTile = null;
        selectedObject = null;
        renderTilemapTab();
        return;
    }
    // Delete to remove selected object in tilemap
    if (activeTab === 'tilemap' && (key === 'delete' || key === 'backspace') && selectedObject) {
        const map = state.tilemaps[activeMapIndex];
        if (selectedObject.kind === 'prop') {
            map.props = (map.props || []).filter(p => p.id !== selectedObject.id);
        } else if (selectedObject.kind === 'light') {
            map.lights = (map.lights || []).filter(l => l.id !== selectedObject.id);
        } else if (selectedObject.kind === 'story') {
            map.storyPoints = (map.storyPoints || []).filter(sp => sp.id !== selectedObject.id);
        } else if (selectedObject.kind === 'marker' && selectedTile) {
            map.markers[selectedTile.y][selectedTile.x] = 0;
        }
        selectedObject = null;
        saveState('Deleted selected object');
        renderTilemapTab();
        return;
    }
    if (activeTab === 'tilemap' && key === 'r') {
        if (rotateSelectedPropOrBrush()) {
            saveState(selectedObject?.kind === 'prop' ? 'Prop rotated' : 'Prop brush rotated');
            renderTilemapTab();
        }
        return;
    }
    if (!['b', 'e', 'f', 's', 'v', 'l', 'x', 'o'].includes(key)) return;

    if (activeTab === 'sprite') {
        if (['b', 'e', 'f'].includes(key)) {
            state.sprite.tool = key === 'b' ? 'pen' : key === 'e' ? 'erase' : 'fill';
            renderSpriteTab();
            setStatus(`Sprite tool: ${state.sprite.tool.toUpperCase()}`);
        }
    }

    if (activeTab === 'tilemap') {
        const toolMap = { b: 'pen', e: 'erase', f: 'fill', s: 'select', v: 'select', l: 'line', x: 'rect', o: 'circle' };
        activeTileTool = toolMap[key] || 'pen';
        if (activeTileTool !== 'select') selectedTile = null;
        shapeStartTile = null;
        shapePreviewTiles = [];
        renderTilemapTab();
        setStatus(`Tilemap tool: ${activeTileTool.toUpperCase()}`);
    }
});

// ── HUD Editor Tab ─────────────────────────────────────────────────────────

const HUD_STORAGE_KEY = 'aliens_hud_config_v1';
const HUD_GAME_WIDTH = 1280;
const HUD_GAME_HEIGHT = 720;

const HUD_CARD_AR = 16 / 9;  // Fixed 16:9 aspect ratio for all cards
const HUD_CARD_BASE_W = 240;
const HUD_CARD_BASE_H = 135; // 240 * 9/16

const HUD_ELEMENT_DEFAULTS = Object.freeze({
    leaderCard: {
        label: 'Leader Card (Rodriguez)',
        x: 10, y: 30, width: 280, height: 155,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.52,
        bgColor: '#020810', bgOpacity: 0.06,
        innerBorderWidth: 1, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0.18,
        scale: 1.0,
    },
    techCard: {
        label: 'Tech Card (Horrowitz)',
        x: 298, y: 30, width: 220, height: 120,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.52,
        bgColor: '#020810', bgOpacity: 0.06,
        innerBorderWidth: 1, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0.18,
        scale: 1.0,
    },
    medicCard: {
        label: 'Medic Card (Sheen)',
        x: 526, y: 30, width: 220, height: 120,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.52,
        bgColor: '#020810', bgOpacity: 0.06,
        innerBorderWidth: 1, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0.18,
        scale: 1.0,
    },
    heavyCard: {
        label: 'Heavy Card (Chang)',
        x: 754, y: 30, width: 220, height: 120,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.52,
        bgColor: '#020810', bgOpacity: 0.06,
        innerBorderWidth: 1, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0.18,
        scale: 1.0,
    },
    motionTracker: {
        label: 'Motion Tracker',
        x: 1064, y: 530, width: 190, height: 130,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.52,
        bgColor: '#020810', bgOpacity: 0.85,
        innerBorderWidth: 0, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0,
        scale: 1.0,
    },
    objectivesPanel: {
        label: 'Objectives Panel',
        x: 1054, y: 10, width: 200, height: 60,
        borderWidth: 1, borderColor: '#4aa4d8', borderOpacity: 0.3,
        bgColor: '#020810', bgOpacity: 0.7,
        innerBorderWidth: 0, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0,
        scale: 1.0,
    },
    missionLog: {
        label: 'Mission Log (Subtitles)',
        x: 340, y: 660, width: 600, height: 40,
        borderWidth: 0, borderColor: '#4aa4d8', borderOpacity: 0,
        bgColor: '#000000', bgOpacity: 0.5,
        innerBorderWidth: 0, innerBorderColor: '#4aa4d8', innerBorderOpacity: 0,
        scale: 1.0,
    },
});

function loadHudConfig() {
    try {
        const raw = localStorage.getItem(HUD_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch { /* ignore */ }
    return {};
}

function saveHudConfig(config) {
    fetch('/api/save-hud-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    }).catch(console.error);
}

function getHudElements() {
    const overrides = loadHudConfig();
    const elements = {};
    for (const [key, def] of Object.entries(HUD_ELEMENT_DEFAULTS)) {
        elements[key] = { ...def, ...(overrides[key] || {}) };
    }
    return elements;
}

// Sub-element defaults keyed by parent element type
// Cards share common sub-elements; leader has extras (weaponName, overheat)
const HUD_CARD_SUB_DEFAULTS = Object.freeze({
    hp:        { label: 'HP Display',     relX: 10, relY: 82, fontSize: 44, color: '#33ff66', opacity: 0.9, fontFamily: 'Share Tech Mono' },
    ammo:      { label: 'Ammo Display',   relX: 150, relY: 8, fontSize: 44, color: '#ff6666', opacity: 0.8, fontFamily: 'Share Tech Mono' },
    ekg:       { label: 'EKG Graph',      relX: 8, relY: 100, width: 224, height: 12, opacity: 0.9, color: '#33ff66', color2: '#ffbb33' },
    name:      { label: 'Marine Name',    relX: 10, relY: 8, fontSize: 28, color: '#e8f0f8', opacity: 1.0, fontFamily: 'Share Tech Mono' },
    actionBar: { label: 'Action Bar',     relX: 8, relY: 114, width: 224, height: 4, color: '#44aaff', opacity: 0.85 },
    button:    { label: 'Button (HEAL)',  relX: 8, relY: 116, width: 224, height: 14, color: '#7ecfff', borderColor: '#45b8ff', bgColor: '#07172a', opacity: 0.92, fontSize: 16, fontFamily: 'Share Tech Mono' },
    video:     { label: 'Video Feed',     relX: 0, relY: 0, width: HUD_CARD_BASE_W, height: HUD_CARD_BASE_H, color: '#2a5a8c', opacity: 0.46, videoAlpha: 1.0 },
});

const HUD_LEADER_EXTRA_SUBS = Object.freeze({
    weaponName: { label: 'Weapon Name',   relX: 150, relY: 52, fontSize: 9, color: '#ff9999', opacity: 1, fontFamily: 'Share Tech Mono' },
    overheat:   { label: 'Overheat Bar',  relX: 150, relY: 66, width: 80, height: 4, color: '#ff6633', opacity: 0.9 },
});

const HUD_TRACKER_SUB_DEFAULTS = Object.freeze({
    radar:     { label: 'Radar Arcs',     relX: 0.5, relY: 0.65, color: '#33aa66', dotColor: '#33ff66', opacity: 0.25 },
    cntLabel:  { label: 'CNT Label',      relX: 16, relY: -8, fontSize: 9, color: '#ff4a3a', opacity: 0.5, fontFamily: 'Share Tech Mono' },
    rngLabel:  { label: 'RNG Label',      relX: 0.5, relY: -8, fontSize: 9, color: '#ff4a3a', opacity: 0.5, fontFamily: 'Share Tech Mono' },
    scanBar:   { label: 'Scan Bar',       relX: 10, relY: -18, width: -20, height: 3, color: '#44aaff', opacity: 0.9 },
});

const HUD_OBJECTIVES_SUB_DEFAULTS = Object.freeze({
    objectiveText: { label: 'Objective Text', relX: 8, relY: 22, fontSize: 11, color: '#7ecfff', opacity: 0.5, fontFamily: 'Share Tech Mono' },
});

const HUD_MISSIONLOG_SUB_DEFAULTS = Object.freeze({
    subtitleText: { label: 'Subtitle Text', relX: 0.5, relY: 0.5, fontSize: 13, color: '#ccddee', opacity: 0.5, fontFamily: 'Share Tech Mono' },
});

function getSubElementDefaults(key) {
    if (key.endsWith('Card')) {
        const { video, ...base } = HUD_CARD_SUB_DEFAULTS;  // Exclude video — locked to card
        if (key === 'leaderCard') {
            return { ...base, ...HUD_LEADER_EXTRA_SUBS };
        }
        return base;
    }
    if (key === 'motionTracker') return { ...HUD_TRACKER_SUB_DEFAULTS };
    if (key === 'objectivesPanel') return { ...HUD_OBJECTIVES_SUB_DEFAULTS };
    if (key === 'missionLog') return { ...HUD_MISSIONLOG_SUB_DEFAULTS };
    return {};
}

function getSubElementConfig(parentKey, subKey) {
    const config = loadHudConfig();
    const parentOverrides = config[parentKey] || {};
    const subs = parentOverrides._subs || {};
    const defaults = getSubElementDefaults(parentKey);
    const def = defaults[subKey] || {};
    return { ...def, ...(subs[subKey] || {}) };
}

function saveSubElementConfig(parentKey, subKey, updates) {
    const config = loadHudConfig();
    // Save to the specified parent
    if (!config[parentKey]) config[parentKey] = {};
    if (!config[parentKey]._subs) config[parentKey]._subs = {};
    config[parentKey]._subs[subKey] = { ...(config[parentKey]._subs[subKey] || {}), ...updates };
    // If editing leader card, propagate shared sub-elements to all follower cards
    if (parentKey === 'leaderCard' && !['weaponName', 'overheat'].includes(subKey)) {
        for (const followerKey of ['techCard', 'medicCard', 'heavyCard']) {
            if (!config[followerKey]) config[followerKey] = {};
            if (!config[followerKey]._subs) config[followerKey]._subs = {};
            config[followerKey]._subs[subKey] = { ...(config[followerKey]._subs[subKey] || {}), ...updates };
        }
    }
    saveHudConfig(config);
}

let _hudSelectedElement = null;
let _hudSelectedSubElement = null;
let _hudSubsExpanded = {};
let _hudDragState = null;
let _hudResizeState = null;
let _hudSubDragState = null;  // { parentKey, subKey, offsetX, offsetY }
let _hudCanvasScale = 1;
let _hudEditingElement = null;

function buildInlinePropsHtml(key, el) {
    const isCardEl = key.endsWith('Card');
    const s = `_${key}`;
    return `
    <div class="hud-inline-props">
        <div class="hud-props-grid">
            <label>X <input type="number" id="hud_prop_x${s}" value="${Math.round(el.x)}" step="10" min="0" max="${HUD_GAME_WIDTH}"></label>
            <label>Y <input type="number" id="hud_prop_y${s}" value="${Math.round(el.y)}" step="10" min="0" max="${HUD_GAME_HEIGHT}"></label>
            <label>Width <input type="number" id="hud_prop_w${s}" value="${Math.round(el.width)}" step="${isCardEl ? 16 : 1}" min="20" max="${HUD_GAME_WIDTH}"></label>
            <label>Height <input type="number" id="hud_prop_h${s}" value="${Math.round(el.height)}" step="1" min="20" max="${HUD_GAME_HEIGHT}" ${isCardEl ? 'disabled' : ''}></label>
        </div>
        <div class="hud-props-grid">
            <label>Scale <input type="number" id="hud_prop_scale${s}" value="${el.scale}" step="0.01" min="0.1" max="3"></label>
        </div>
        <details class="hud-props-section" open>
            <summary>Border</summary>
            <div class="hud-props-grid">
                <label>Width <input type="number" id="hud_prop_borderWidth${s}" value="${el.borderWidth}" step="1" min="0" max="10"></label>
                <label>Color <input type="color" id="hud_prop_borderColor${s}" value="${el.borderColor}"></label>
                <label>Opacity
                    <input type="range" id="hud_prop_borderOpacity${s}" value="${el.borderOpacity}" step="0.01" min="0" max="1">
                    <span id="hud_prop_borderOpacity_val${s}">${el.borderOpacity.toFixed(2)}</span>
                </label>
            </div>
        </details>
        <details class="hud-props-section">
            <summary>Inner Border</summary>
            <div class="hud-props-grid">
                <label>Width <input type="number" id="hud_prop_innerBorderWidth${s}" value="${el.innerBorderWidth}" step="1" min="0" max="10"></label>
                <label>Color <input type="color" id="hud_prop_innerBorderColor${s}" value="${el.innerBorderColor}"></label>
                <label>Opacity
                    <input type="range" id="hud_prop_innerBorderOpacity${s}" value="${el.innerBorderOpacity}" step="0.01" min="0" max="1">
                    <span id="hud_prop_innerBorderOpacity_val${s}">${el.innerBorderOpacity.toFixed(2)}</span>
                </label>
            </div>
        </details>
        <details class="hud-props-section">
            <summary>Background</summary>
            <div class="hud-props-grid">
                <label>Color <input type="color" id="hud_prop_bgColor${s}" value="${el.bgColor}"></label>
                <label>Opacity
                    <input type="range" id="hud_prop_bgOpacity${s}" value="${el.bgOpacity}" step="0.01" min="0" max="1">
                    <span id="hud_prop_bgOpacity_val${s}">${el.bgOpacity.toFixed(2)}</span>
                </label>
            </div>
        </details>
        <div class="hud-inline-actions">
            <button class="hud-save-panel-btn" data-hud-key="${key}">&#x2713; Save Panel</button>
            <button class="hud-cancel-edit-btn" data-hud-key="${key}">Cancel</button>
            <button class="hud-reset-panel-btn" data-hud-key="${key}">Reset</button>
        </div>
    </div>`;
}

function renderHudTab() {
    const elements = getHudElements();

    // Only leader card has editable sub-elements; changes propagate to all cards
    const isFollowerCard = (k) => k === 'techCard' || k === 'medicCard' || k === 'heavyCard';
    const sidebarHtml = Object.entries(elements).map(([key, el]) => {
        const selected = _hudSelectedElement === key;
        const subDefs = isFollowerCard(key) ? {} : getSubElementDefaults(key);
        const subKeys = Object.keys(subDefs);
        const expanded = !!_hudSubsExpanded[key];
        let subsHtml = '';
        if (subKeys.length > 0 && expanded) {
            subsHtml = `<div class="hud-sub-elements">` +
                subKeys.map(sk => {
                    const isSel = _hudSelectedElement === key && _hudSelectedSubElement === sk;
                    const sub = getSubElementConfig(key, sk);
                    return `<div class="hud-sub-item${isSel ? ' selected' : ''}" data-hud-key="${key}" data-sub-key="${sk}">
                        <span class="hud-sub-label">${escapeHtml(sub.label || sk)}</span>
                    </div>`;
                }).join('') + `</div>`;
        }
        const toggleIcon = subKeys.length > 0 ? (expanded ? '▾' : '▸') : '';
        const syncNote = key === 'leaderCard' ? ' <span style="color:#88ccaa;font-size:9px">(edits apply to all marines)</span>' : '';
        const followerNote = isFollowerCard(key) ? ' <span style="color:#667788;font-size:9px">(synced from leader)</span>' : '';
        const isEditing = _hudEditingElement === key;
        return `
        <div class="hud-element-item${selected && !_hudSelectedSubElement ? ' selected' : ''}" data-hud-key="${key}">
            ${toggleIcon ? `<span class="hud-sub-toggle" data-hud-key="${key}">${toggleIcon}</span>` : ''}
            <span class="hud-element-label">${escapeHtml(el.label)}${syncNote}${followerNote}</span>
            <span class="hud-element-pos">${Math.round(el.x)}, ${Math.round(el.y)} — ${Math.round(el.width)}×${Math.round(el.height)}</span>
            <button class="hud-edit-btn${isEditing ? ' active' : ''}" data-hud-key="${key}">${isEditing ? '&#x2715;' : 'Edit'}</button>
        </div>
        ${isEditing ? buildInlinePropsHtml(key, el) : ''}
        ${subsHtml}`;
    }).join('');

    let propsHtml = '';
    if (_hudSelectedElement && _hudSelectedSubElement) {
        // Sub-element property panel
        const sub = getSubElementConfig(_hudSelectedElement, _hudSelectedSubElement);
        const isVideoSub = _hudSelectedSubElement === 'video';
        const isCardParent = _hudSelectedElement && _hudSelectedElement.endsWith('Card');
        const videoLocked = isVideoSub && isCardParent;
        propsHtml = `
        <div class="hud-props-panel hud-sub-props">
            <h3>${escapeHtml(sub.label || _hudSelectedSubElement)}${videoLocked ? ' <span style="color:#ff8844;font-size:11px">(locked to card)</span>' : ''}</h3>
            <div class="hud-props-grid">
                <label>Rel X <input type="number" id="hud_sub_relX" value="${sub.relX != null ? sub.relX : 0}" step="1"${videoLocked ? ' disabled' : ''}></label>
                <label>Rel Y <input type="number" id="hud_sub_relY" value="${sub.relY != null ? sub.relY : 0}" step="1"${videoLocked ? ' disabled' : ''}></label>
            </div>
            ${sub.fontSize != null ? `<div class="hud-props-grid">
                <label>Font Size <input type="number" id="hud_sub_fontSize" value="${sub.fontSize}" step="1" min="4" max="72"></label>
                <label>Font <select id="hud_sub_fontFamily" class="hud-font-select">
                    ${['Share Tech Mono', 'Consolas', 'Courier New', 'monospace', 'VT323', 'Press Start 2P'].map(f =>
                        `<option value="${f}"${(sub.fontFamily || 'Share Tech Mono') === f ? ' selected' : ''}>${f}</option>`
                    ).join('')}
                </select></label>
            </div>` : ''}
            ${sub.width != null ? `<div class="hud-props-grid">
                <label>Width <input type="number" id="hud_sub_width" value="${sub.width}" step="1"${videoLocked ? ' disabled' : ''}></label>
                <label>Height <input type="number" id="hud_sub_height" value="${sub.height != null ? sub.height : 10}" step="1"${videoLocked ? ' disabled' : ''}></label>
            </div>` : ''}
            <div class="hud-props-grid">
                <label>Color <input type="color" id="hud_sub_color" value="${sub.color || '#ffffff'}"></label>
                ${sub.color2 != null ? `<label>Color 2 <input type="color" id="hud_sub_color2" value="${sub.color2}"></label>` : ''}
                ${sub.borderColor != null ? `<label>Border <input type="color" id="hud_sub_borderColor" value="${sub.borderColor}"></label>` : ''}
                ${sub.bgColor != null ? `<label>BG Color <input type="color" id="hud_sub_bgColor" value="${sub.bgColor}"></label>` : ''}
                ${sub.dotColor != null ? `<label>Dot Color <input type="color" id="hud_sub_dotColor" value="${sub.dotColor}"></label>` : ''}
            </div>
            <div class="hud-props-grid">
                <label>${isVideoSub ? 'Tint Opacity' : 'Opacity'} <input type="range" id="hud_sub_opacity" value="${sub.opacity != null ? sub.opacity : 1}" step="0.01" min="0" max="1"><span id="hud_sub_opacity_val">${(sub.opacity != null ? sub.opacity : 1).toFixed(2)}</span></label>
            </div>
            ${isVideoSub ? `<div class="hud-props-grid">
                <label>Video Opacity <input type="range" id="hud_sub_videoAlpha" value="${sub.videoAlpha != null ? sub.videoAlpha : 1}" step="0.01" min="0" max="1"><span id="hud_sub_videoAlpha_val">${(sub.videoAlpha != null ? sub.videoAlpha : 1).toFixed(2)}</span></label>
            </div>` : ''}
            <div class="hud-props-actions">
                <button id="hud_sub_apply">Apply</button>
                <button id="hud_sub_reset">Reset to Default</button>
            </div>
        </div>`;
    }
    // (Parent element props shown inline per-element via the Edit button — see buildInlinePropsHtml)

    panels.hud.innerHTML = `
        <div class="controls hud-sidebar">
            <button id="hud_saveToGame" style="
                width:100%; padding:14px 10px; margin-bottom:12px;
                font-size:16px; font-weight:bold; font-family:'Share Tech Mono',Consolas,monospace;
                color:#0a1a2a; background:linear-gradient(180deg,#5dd8a5 0%,#33bb77 100%);
                border:2px solid #88ffcc; border-radius:4px; cursor:pointer;
                text-transform:uppercase; letter-spacing:2px;
                box-shadow:0 0 12px rgba(88,255,170,0.25), inset 0 1px 0 rgba(255,255,255,0.2);
            ">SAVE TO GAME</button>
            <h2>HUD Editor</h2>
            <p class="small">Click elements to select. Drag sub-elements within cards. Edit properties below.</p>
            <div class="hud-element-list">${sidebarHtml}</div>
            ${propsHtml}
            <div class="hud-bottom-actions">
                <button id="hud_resetAll">Reset All to Defaults</button>
                <button id="hud_exportJson">Export HUD Config</button>
                <button id="hud_importJson">Import HUD Config</button>
                <input type="file" id="hud_importFile" accept="application/json" style="display:none">
            </div>
        </div>
        <div class="hud-canvas-wrap">
            <canvas id="hudCanvas" width="${HUD_GAME_WIDTH}" height="${HUD_GAME_HEIGHT}"></canvas>
        </div>`;

    // SAVE TO GAME — POSTs config to /api/save-hud-config which writes src/data/hudConfig.js
    const saveToGameBtn = document.getElementById('hud_saveToGame');
    if (saveToGameBtn) {
        saveToGameBtn.addEventListener('click', async () => {
            try {
                const hudConfig = loadHudConfig();
                saveHudConfig(hudConfig);  // keep localStorage copy
                const res = await fetch('/api/save-hud-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(hudConfig),
                });
                const result = await res.json();
                if (!result.ok) throw new Error(result.error || 'Server error');
                const size = JSON.stringify(hudConfig).length;
                setStatus(`HUD config saved to game (${(size / 1024).toFixed(1)} KB)`);
                showFeedbackPopup('HUD layout saved — reload game to apply', 'success');
                saveToGameBtn.style.background = 'linear-gradient(180deg,#88ffcc 0%,#55dd99 100%)';
                setTimeout(() => {
                    saveToGameBtn.style.background = 'linear-gradient(180deg,#5dd8a5 0%,#33bb77 100%)';
                }, 600);
            } catch (err) {
                setStatus(`HUD save failed: ${err.message || 'unknown error'}`);
                showFeedbackPopup(`Save failed: ${err.message}`, 'error');
            }
        });
    }

    // Bind sidebar element clicks
    panels.hud.querySelectorAll('.hud-element-item').forEach((item) => {
        item.addEventListener('click', (ev) => {
            if (ev.target.classList.contains('hud-sub-toggle')) return;
            if (ev.target.closest('.hud-edit-btn')) return;
            _hudSelectedElement = item.dataset.hudKey;
            _hudSelectedSubElement = null;
            renderHudTab();
        });
    });

    // Bind sub-element toggle (expand/collapse)
    panels.hud.querySelectorAll('.hud-sub-toggle').forEach((toggle) => {
        toggle.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const key = toggle.dataset.hudKey;
            _hudSubsExpanded[key] = !_hudSubsExpanded[key];
            renderHudTab();
        });
    });

    // Bind sub-element clicks
    panels.hud.querySelectorAll('.hud-sub-item').forEach((item) => {
        item.addEventListener('click', () => {
            _hudSelectedElement = item.dataset.hudKey;
            _hudSelectedSubElement = item.dataset.subKey;
            renderHudTab();
        });
    });

    // Bind sub-element property inputs
    if (_hudSelectedElement && _hudSelectedSubElement) {
        const subApplyBtn = document.getElementById('hud_sub_apply');
        if (subApplyBtn) {
            subApplyBtn.addEventListener('click', () => {
                applySubElementPropsFromInputs();
            });
        }
        const subResetBtn = document.getElementById('hud_sub_reset');
        if (subResetBtn) {
            subResetBtn.addEventListener('click', () => {
                const config = loadHudConfig();
                if (config[_hudSelectedElement] && config[_hudSelectedElement]._subs) {
                    delete config[_hudSelectedElement]._subs[_hudSelectedSubElement];
                    saveHudConfig(config);
                }
                renderHudTab();
                setStatus(`HUD: ${_hudSelectedSubElement} reset to default`);
            });
        }
        // Live opacity display for sub-elements
        const subOpSlider = document.getElementById('hud_sub_opacity');
        const subOpVal = document.getElementById('hud_sub_opacity_val');
        if (subOpSlider && subOpVal) {
            subOpSlider.addEventListener('input', () => {
                subOpVal.textContent = Number(subOpSlider.value).toFixed(2);
            });
        }
        // Live video opacity display
        const subVaSlider = document.getElementById('hud_sub_videoAlpha');
        const subVaVal = document.getElementById('hud_sub_videoAlpha_val');
        if (subVaSlider && subVaVal) {
            subVaSlider.addEventListener('input', () => {
                subVaVal.textContent = Number(subVaSlider.value).toFixed(2);
            });
        }
    }

    // Bind Edit / Save Panel / Cancel / Reset buttons (inline props per element)
    panels.hud.querySelectorAll('.hud-edit-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const k = btn.dataset.hudKey;
            if (_hudEditingElement === k) {
                _hudEditingElement = null;
            } else {
                _hudEditingElement = k;
                _hudSelectedElement = k;
                _hudSelectedSubElement = null;
            }
            renderHudTab();
        });
    });
    panels.hud.querySelectorAll('.hud-save-panel-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            _hudEditingElement = null;  // collapse before re-render inside apply
            applyHudPropsFromInputs(btn.dataset.hudKey);
        });
    });
    panels.hud.querySelectorAll('.hud-cancel-edit-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            _hudEditingElement = null;
            renderHudTab();
        });
    });
    panels.hud.querySelectorAll('.hud-reset-panel-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const k = btn.dataset.hudKey;
            const config = loadHudConfig();
            delete config[k];
            saveHudConfig(config);
            _hudEditingElement = null;
            renderHudTab();
            setStatus(`HUD: ${elements[k] ? elements[k].label : k} reset to default`);
        });
    });
    // Live opacity display for active inline props form
    if (_hudEditingElement) {
        const s = `_${_hudEditingElement}`;
        for (const opKey of ['borderOpacity', 'innerBorderOpacity', 'bgOpacity']) {
            const slider = document.getElementById(`hud_prop_${opKey}${s}`);
            const valSpan = document.getElementById(`hud_prop_${opKey}_val${s}`);
            if (slider && valSpan) {
                slider.addEventListener('input', () => {
                    valSpan.textContent = Number(slider.value).toFixed(2);
                });
            }
        }
    }

    // Reset all button
    const resetAllBtn = document.getElementById('hud_resetAll');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            localStorage.removeItem(HUD_STORAGE_KEY);
            _hudSelectedElement = null;
            renderHudTab();
            setStatus('HUD: All elements reset to defaults');
        });
    }

    // Export
    const exportBtn = document.getElementById('hud_exportJson');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const config = loadHudConfig();
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'hud-config.json';
            a.click();
            URL.revokeObjectURL(url);
            setStatus('HUD config exported');
        });
    }

    // Import
    const importBtn = document.getElementById('hud_importJson');
    const importFile = document.getElementById('hud_importFile');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', async () => {
            const file = importFile.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === 'object') {
                    saveHudConfig(parsed);
                    renderHudTab();
                    setStatus('HUD config imported');
                }
            } catch {
                setStatus('HUD import failed: invalid JSON');
            }
            importFile.value = '';
        });
    }

    // Draw canvas
    drawHudCanvas();

    // Setup canvas interaction
    setupHudCanvasInteraction();
}

function applyHudPropsFromInputs(key) {
    const targetKey = key || _hudSelectedElement;
    if (!targetKey) return;
    const sfx = key ? `_${key}` : '';
    const config = loadHudConfig();
    const current = getHudElements()[targetKey];
    if (!current) return;

    const g = (id) => document.getElementById(id);
    const xEl = g(`hud_prop_x${sfx}`);
    const yEl = g(`hud_prop_y${sfx}`);
    const wEl = g(`hud_prop_w${sfx}`);
    const hEl = g(`hud_prop_h${sfx}`);
    const scaleEl = g(`hud_prop_scale${sfx}`);
    const bwEl = g(`hud_prop_borderWidth${sfx}`);
    const bcEl = g(`hud_prop_borderColor${sfx}`);
    const boEl = g(`hud_prop_borderOpacity${sfx}`);
    const ibwEl = g(`hud_prop_innerBorderWidth${sfx}`);
    const ibcEl = g(`hud_prop_innerBorderColor${sfx}`);
    const iboEl = g(`hud_prop_innerBorderOpacity${sfx}`);
    const bgcEl = g(`hud_prop_bgColor${sfx}`);
    const bgoEl = g(`hud_prop_bgOpacity${sfx}`);

    const isCard = targetKey.endsWith('Card');
    const updates = {};
    if (xEl) updates.x = snapTo10(Number(xEl.value));
    if (yEl) updates.y = snapTo10(Number(yEl.value));
    if (wEl) {
        updates.width = snapTo10(Number(wEl.value));
        if (isCard) updates.height = Math.round(updates.width / HUD_CARD_AR);
    }
    if (hEl && !isCard) updates.height = snapTo10(Number(hEl.value));
    if (scaleEl) updates.scale = Number(scaleEl.value);
    if (bwEl) updates.borderWidth = Number(bwEl.value);
    if (bcEl) updates.borderColor = bcEl.value;
    if (boEl) updates.borderOpacity = Number(boEl.value);
    if (ibwEl) updates.innerBorderWidth = Number(ibwEl.value);
    if (ibcEl) updates.innerBorderColor = ibcEl.value;
    if (iboEl) updates.innerBorderOpacity = Number(iboEl.value);
    if (bgcEl) updates.bgColor = bgcEl.value;
    if (bgoEl) updates.bgOpacity = Number(bgoEl.value);

    config[targetKey] = { ...(config[targetKey] || {}), ...updates };
    saveHudConfig(config);
    renderHudTab();
    setStatus(`HUD: ${current.label} updated`);
}

function applySubElementPropsFromInputs() {
    if (!_hudSelectedElement || !_hudSelectedSubElement) return;
    const updates = {};

    const relXEl = document.getElementById('hud_sub_relX');
    const relYEl = document.getElementById('hud_sub_relY');
    if (relXEl) updates.relX = Number(relXEl.value);
    if (relYEl) updates.relY = Number(relYEl.value);

    const fsEl = document.getElementById('hud_sub_fontSize');
    if (fsEl) updates.fontSize = Number(fsEl.value);

    const ffEl = document.getElementById('hud_sub_fontFamily');
    if (ffEl) updates.fontFamily = ffEl.value;

    const wEl = document.getElementById('hud_sub_width');
    const hEl = document.getElementById('hud_sub_height');
    if (wEl) updates.width = Number(wEl.value);
    if (hEl) updates.height = Number(hEl.value);

    const cEl = document.getElementById('hud_sub_color');
    if (cEl) updates.color = cEl.value;

    const c2El = document.getElementById('hud_sub_color2');
    if (c2El) updates.color2 = c2El.value;

    const bcEl = document.getElementById('hud_sub_borderColor');
    if (bcEl) updates.borderColor = bcEl.value;

    const bgEl = document.getElementById('hud_sub_bgColor');
    if (bgEl) updates.bgColor = bgEl.value;

    const dcEl = document.getElementById('hud_sub_dotColor');
    if (dcEl) updates.dotColor = dcEl.value;

    const opEl = document.getElementById('hud_sub_opacity');
    if (opEl) updates.opacity = Number(opEl.value);

    const vaEl = document.getElementById('hud_sub_videoAlpha');
    if (vaEl) updates.videoAlpha = Number(vaEl.value);

    saveSubElementConfig(_hudSelectedElement, _hudSelectedSubElement, updates);
    renderHudTab();
    setStatus(`HUD: ${_hudSelectedSubElement} updated`);
}

function snapTo10(val) {
    return Math.round(val / 10) * 10;
}

function drawHudCanvas() {
    const canvas = document.getElementById('hudCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const elements = getHudElements();

    // Clear
    ctx.clearRect(0, 0, HUD_GAME_WIDTH, HUD_GAME_HEIGHT);

    // Dark background simulating game viewport
    ctx.fillStyle = '#050a0f';
    ctx.fillRect(0, 0, HUD_GAME_WIDTH, HUD_GAME_HEIGHT);

    // Grid lines — minor every 10px, major every 100px (high contrast)
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.18)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= HUD_GAME_WIDTH; gx += 10) {
        if (gx % 100 === 0) continue;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, HUD_GAME_HEIGHT);
        ctx.stroke();
    }
    for (let gy = 0; gy <= HUD_GAME_HEIGHT; gy += 10) {
        if (gy % 100 === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(HUD_GAME_WIDTH, gy);
        ctx.stroke();
    }
    // Major grid lines (every 100px)
    ctx.strokeStyle = 'rgba(0, 220, 255, 0.45)';
    ctx.lineWidth = 1.5;
    for (let gx = 0; gx <= HUD_GAME_WIDTH; gx += 100) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, HUD_GAME_HEIGHT);
        ctx.stroke();
    }
    for (let gy = 0; gy <= HUD_GAME_HEIGHT; gy += 100) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(HUD_GAME_WIDTH, gy);
        ctx.stroke();
    }

    // Draw elements
    for (const [key, el] of Object.entries(elements)) {
        const isSelected = _hudSelectedElement === key;
        const scaledW = el.width * el.scale;
        const scaledH = el.height * el.scale;

        // Background fill
        ctx.globalAlpha = el.bgOpacity;
        ctx.fillStyle = el.bgColor;
        ctx.fillRect(el.x, el.y, scaledW, scaledH);
        ctx.globalAlpha = 1;

        // Scanline effect (subtle horizontal lines)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        for (let sy = el.y; sy < el.y + scaledH; sy += 3) {
            ctx.beginPath();
            ctx.moveTo(el.x, sy);
            ctx.lineTo(el.x + scaledW, sy);
            ctx.stroke();
        }

        // Outer border
        if (el.borderWidth > 0) {
            ctx.globalAlpha = el.borderOpacity;
            ctx.strokeStyle = el.borderColor;
            ctx.lineWidth = el.borderWidth;
            ctx.strokeRect(el.x + 0.5, el.y + 0.5, scaledW - 1, scaledH - 1);
            ctx.globalAlpha = 1;
        }

        // Inner border
        if (el.innerBorderWidth > 0) {
            ctx.globalAlpha = el.innerBorderOpacity;
            ctx.strokeStyle = el.innerBorderColor;
            ctx.lineWidth = el.innerBorderWidth;
            ctx.strokeRect(el.x + 3.5, el.y + 3.5, scaledW - 7, scaledH - 7);
            ctx.globalAlpha = 1;
        }

        // Label text inside element
        ctx.fillStyle = '#7ecfff';
        ctx.globalAlpha = 0.7;
        ctx.font = `${Math.max(9, Math.min(13, scaledH * 0.1))}px "Share Tech Mono", Consolas, monospace`;
        ctx.textBaseline = 'top';
        ctx.fillText(el.label, el.x + 6, el.y + 6);

        // Simulated content placeholders based on element type
        drawHudElementContent(ctx, key, el, scaledW, scaledH);

        ctx.globalAlpha = 1;

        // Selection highlight
        if (isSelected) {
            ctx.strokeStyle = '#4aa4d8';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(el.x - 2, el.y - 2, scaledW + 4, scaledH + 4);
            ctx.setLineDash([]);

            // Resize handles (8px squares at corners and edge midpoints)
            const handles = getResizeHandles(el.x, el.y, scaledW, scaledH);
            ctx.shadowColor = '#00ffcc';
            ctx.shadowBlur = 4;
            ctx.fillStyle = '#00ffcc';
            for (const h of handles) {
                ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
                ctx.strokeStyle = '#003322';
                ctx.lineWidth = 1;
                ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
            }
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Draw sub-element outlines (faint) and highlight selected sub
            const subBounds = getSubElementBounds(key, el);
            for (const sb of subBounds) {
                const isSel = _hudSelectedSubElement === sb.subKey;
                ctx.strokeStyle = isSel ? '#ffdd44' : 'rgba(74, 164, 216, 0.2)';
                ctx.lineWidth = isSel ? 2 : 1;
                ctx.setLineDash(isSel ? [] : [3, 3]);
                ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
                ctx.setLineDash([]);
                if (isSel) {
                    // Label for selected sub-element
                    ctx.fillStyle = '#ffdd44';
                    ctx.globalAlpha = 0.85;
                    ctx.font = '9px "Share Tech Mono", Consolas, monospace';
                    ctx.fillText(sb.subKey, sb.x, sb.y - 2);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    // Center crosshair
    ctx.strokeStyle = 'rgba(74, 164, 216, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(HUD_GAME_WIDTH / 2, 0);
    ctx.lineTo(HUD_GAME_WIDTH / 2, HUD_GAME_HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, HUD_GAME_HEIGHT / 2);
    ctx.lineTo(HUD_GAME_WIDTH, HUD_GAME_HEIGHT / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── World-Space Reference Samples ──────────────────────────
    // These show what in-game bars look like at actual scale
    const refX = HUD_GAME_WIDTH / 2 - 120;
    const refY = HUD_GAME_HEIGHT - 100;

    // Section label
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#7ecfff';
    ctx.font = '10px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('WORLD-SPACE BAR REFERENCE', refX, refY - 8);

    // Door action bar (80×10px, CRT style — matching ProgressBar.js)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#7ecfff';
    ctx.font = '8px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('Door Weld (80×10)', refX, refY + 3);
    drawCrtBar(ctx, refX, refY + 6, 80, 10, '#44cc44', 0.72, {
        borderColor: '#00aaff', borderAlpha: 0.5,
        scanlineGap: 3, showGlow: true,
        bgColor: '#010508', bgAlpha: 0.92,
    });
    // Weld label
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#88ffaa';
    ctx.font = 'bold 7px "Share Tech Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WELDING', refX + 40, refY + 22);
    ctx.textAlign = 'left';

    // Door hack bar
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#7ecfff';
    ctx.font = '8px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('Door Hack (80×10)', refX + 110, refY + 3);
    drawCrtBar(ctx, refX + 110, refY + 6, 80, 10, '#44cccc', 0.55, {
        borderColor: '#00aaff', borderAlpha: 0.5,
        scanlineGap: 3, showGlow: true,
        bgColor: '#010508', bgAlpha: 0.92,
    });
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#88ffaa';
    ctx.font = 'bold 7px "Share Tech Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HACKING', refX + 150, refY + 22);
    ctx.textAlign = 'left';

    // Enemy HP bar reference
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#7ecfff';
    ctx.font = '8px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('Enemy HP Bar', refX, refY + 38);
    const ehpX = refX;
    const ehpY = refY + 42;
    const ehpW = 60;
    const ehpH = 4;
    // Track line (background)
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#333344';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ehpX, ehpY + ehpH / 2);
    ctx.lineTo(ehpX + ehpW, ehpY + ehpH / 2);
    ctx.stroke();
    // HP fill (red at ~40% health)
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ff8822';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ehpX, ehpY + ehpH / 2);
    ctx.lineTo(ehpX + ehpW * 0.4, ehpY + ehpH / 2);
    ctx.stroke();
    // Label
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ff8822';
    ctx.font = '7px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('40%', ehpX + ehpW + 6, ehpY + ehpH);

    // Full HP bar reference
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#333344';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ehpX + 100, ehpY + ehpH / 2);
    ctx.lineTo(ehpX + 100 + ehpW, ehpY + ehpH / 2);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ehpX + 100, ehpY + ehpH / 2);
    ctx.lineTo(ehpX + 100 + ehpW * 0.85, ehpY + ehpH / 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ff4444';
    ctx.font = '7px "Share Tech Mono", Consolas, monospace';
    ctx.fillText('85%', ehpX + 100 + ehpW + 6, ehpY + ehpH);
}

/**
 * Draw a CRT-style progress bar on a Canvas 2D context.
 * All colors are CSS hex strings (e.g. '#33cc77'). Alpha via ctx.globalAlpha.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x          - Left edge
 * @param {number} y          - Top edge
 * @param {number} width      - Total bar width
 * @param {number} height     - Total bar height
 * @param {string} fillColor  - CSS color for the fill portion
 * @param {number} fillPct    - Fill fraction 0..1
 * @param {object} [opts]     - Optional overrides
 * @param {string} [opts.borderColor='#44aadd']
 * @param {number} [opts.borderAlpha=0.4]
 * @param {number} [opts.scanlineGap=2]   - Pixels between scanlines (0 = none)
 * @param {boolean}[opts.showGlow=true]    - White glow on top edge of fill
 * @param {string} [opts.bgColor='#010508']
 * @param {number} [opts.bgAlpha=0.9]
 * @param {number} [opts.fillAlpha=0.85]
 */
function drawCrtBar(ctx, x, y, width, height, fillColor, fillPct, opts) {
    const o = opts || {};
    const borderColor = o.borderColor || '#44aadd';
    const borderAlpha = o.borderAlpha !== undefined ? o.borderAlpha : 0.4;
    const scanlineGap = o.scanlineGap !== undefined ? o.scanlineGap : 2;
    const showGlow    = o.showGlow !== undefined ? o.showGlow : true;
    const bgColor     = o.bgColor || '#010508';
    const bgAlpha     = o.bgAlpha !== undefined ? o.bgAlpha : 0.9;
    const fillAlpha   = o.fillAlpha !== undefined ? o.fillAlpha : 0.85;

    ctx.save();

    // Background
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);

    // Fill
    const pct = Math.max(0, Math.min(1, fillPct));
    if (pct > 0) {
        const fw = Math.round(width * pct);
        ctx.globalAlpha = fillAlpha;
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, fw, height);

        // Glow highlight on fill top edge
        if (showGlow) {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, fw, 1);
        }
    }

    // Scanlines
    if (scanlineGap > 0) {
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        for (let sy = y; sy < y + height; sy += scanlineGap) {
            ctx.beginPath();
            ctx.moveTo(x, sy + 0.5);
            ctx.lineTo(x + width, sy + 0.5);
            ctx.stroke();
        }
    }

    // Border
    ctx.globalAlpha = borderAlpha;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.restore();
}

/**
 * Draw a dual-trace EKG waveform (cardiac PQRST + SpO2 plethysmograph).
 * Static snapshot for the editor preview — uses a fixed time offset so
 * the waveform looks like a frozen CRT readout.
 */
function drawEkgDualTrace(ctx, x, y, width, height, cardiacColor, plethColor) {
    const step = 2;
    const numPoints = Math.ceil(width / step);
    const midY = y + height / 2;
    const vGap = Math.max(4, height * 0.42);
    const amp = height * 0.8;
    const ekgBeatSpan = 8.5;
    const plethBeatSpan = 7.2;
    const staticTime = 12.7;

    ctx.save();

    // ── Upper trace — cardiac PQRST ──
    ctx.strokeStyle = cardiacColor || '#33ff66';
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
        const px = x + i * step;
        const t = staticTime - (numPoints - i) * 0.15;
        let py = midY - vGap;
        const phase = ((((t % ekgBeatSpan) + ekgBeatSpan) % ekgBeatSpan) / ekgBeatSpan) * 10;
        // P-wave: gentle bump (0.6–1.4)
        if (phase >= 0.6 && phase < 1.4) {
            py -= Math.sin((phase - 0.6) * Math.PI / 0.8) * (amp * 0.12);
        }
        // Q dip (1.8–2.0)
        else if (phase >= 1.8 && phase < 2.0) {
            py += ((phase - 1.8) / 0.2) * (amp * 0.1);
        }
        // R spike up (2.0–2.25)
        else if (phase >= 2.0 && phase < 2.25) {
            const r = (phase - 2.0) / 0.25;
            py -= (r * (amp * 0.85)) - (amp * 0.1 * (1 - r));
        }
        // R spike down + S dip (2.25–2.55)
        else if (phase >= 2.25 && phase < 2.55) {
            const r = (phase - 2.25) / 0.3;
            py -= (1 - r) * (amp * 0.85);
            py += r * (amp * 0.18);
        }
        // S recovery (2.55–2.75)
        else if (phase >= 2.55 && phase < 2.75) {
            py += (1 - (phase - 2.55) / 0.2) * (amp * 0.18);
        }
        // T-wave: broad bump (3.4–4.4)
        else if (phase >= 3.4 && phase < 4.4) {
            py -= Math.sin((phase - 3.4) * Math.PI / 1.0) * (amp * 0.2);
        }
        // baseline flat elsewhere
        if (i === 0) ctx.moveTo(px, Math.round(py));
        else ctx.lineTo(px, Math.round(py));
    }
    ctx.stroke();

    // ── Lower trace — SpO2 plethysmograph ──
    ctx.strokeStyle = plethColor || '#ffbb33';
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
        const px = x + i * step;
        const t = staticTime - (numPoints - i) * 0.15 + 3.5;
        let py = midY + vGap;
        const plethAmp = amp * 0.35;
        const phase = ((((t % plethBeatSpan) + plethBeatSpan) % plethBeatSpan) / plethBeatSpan) * 8;
        // Sharp systolic rise (0.0–0.6)
        if (phase < 0.6) {
            py -= (phase / 0.6) * plethAmp;
        }
        // Dicrotic notch descent (0.6–1.3)
        else if (phase < 1.3) {
            const d = (phase - 0.6) / 0.7;
            py -= (1 - d) * plethAmp;
            if (d > 0.35 && d < 0.65) {
                py -= Math.sin((d - 0.35) * Math.PI / 0.3) * (amp * 0.08);
            }
        }
        // Slow diastolic tail (1.3–3.0)
        else if (phase < 3.0) {
            const d = (phase - 1.3) / 1.7;
            py -= (1 - d) * (amp * 0.04);
        }
        // baseline flat (3.0–8.0)
        if (i === 0) ctx.moveTo(px, Math.round(py));
        else ctx.lineTo(px, Math.round(py));
    }
    ctx.stroke();

    ctx.restore();
}

function drawHudElementContent(ctx, key, el, scaledW, scaledH) {
    const x = el.x;
    const y = el.y;
    const sx = scaledW / HUD_CARD_BASE_W;
    const sy = scaledH / HUD_CARD_BASE_H;
    const sub = (subKey) => getSubElementConfig(key, subKey);

    if (key.endsWith('Card')) {
        // Video feed area
        const videoSub = sub('video');
        const vidAlpha = typeof videoSub.videoAlpha === 'number' ? videoSub.videoAlpha : 1.0;
        ctx.globalAlpha = vidAlpha;
        ctx.fillStyle = '#1a2a3a'; // base video feed tone
        ctx.fillRect(x + videoSub.relX * sx, y + videoSub.relY * sy,
            videoSub.width * sx, videoSub.height * sy);
        ctx.globalAlpha = videoSub.opacity * vidAlpha;
        ctx.fillStyle = videoSub.color;
        ctx.fillRect(x + videoSub.relX * sx, y + videoSub.relY * sy,
            videoSub.width * sx, videoSub.height * sy);

        // Blue tint overlay on video feed (matches HUD_COLORS.videoTint 0x2a5a8c)
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#2a5a8c';
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillRect(x + videoSub.relX * sx, y + videoSub.relY * sy,
            videoSub.width * sx, videoSub.height * sy);
        ctx.globalCompositeOperation = 'source-over';

        // CRT scanlines on video feed
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        const vidTop = y + videoSub.relY * sy;
        const vidBot = vidTop + videoSub.height * sy;
        for (let sl = vidTop; sl < vidBot; sl += 3 * sy) {
            ctx.beginPath();
            ctx.moveTo(x + videoSub.relX * sx, sl);
            ctx.lineTo(x + videoSub.relX * sx + videoSub.width * sx, sl);
            ctx.stroke();
        }

        // Divider line at top of card (header strip)
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#4aa4d8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 14.5 * sy);
        ctx.lineTo(x + scaledW, y + 14.5 * sy);
        ctx.stroke();

        // ── Dual-trace EKG waveform ──
        const ekgSub = sub('ekg');
        const ekgX = x + ekgSub.relX * sx;
        const ekgY = y + ekgSub.relY * sy;
        const ekgW = ekgSub.width * sx;
        const ekgH = ekgSub.height * sy;
        ctx.save();
        ctx.globalAlpha = ekgSub.opacity;
        drawEkgDualTrace(ctx, ekgX, ekgY, ekgW, ekgH, ekgSub.color, ekgSub.color2);
        ctx.restore();

        // ── Action bar below EKG ──
        const abSub = sub('actionBar');
        const abX = x + abSub.relX * sx;
        const abY = y + abSub.relY * sy;
        const abW = abSub.width * sx;
        const abH = Math.max(3, abSub.height * sy);
        drawCrtBar(ctx, abX, abY, abW, abH, abSub.color, 0.65, {
            borderColor: '#44aadd', borderAlpha: 0.4,
            scanlineGap: 2, bgColor: '#010508', bgAlpha: 0.9,
        });
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#aaddff';
        ctx.font = `${Math.max(6, 8 * Math.min(sx, sy))}px "Share Tech Mono", Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('HEALING', abX + abW / 2, abY + abH + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();

        // ── Overheat bar (leader card only) ──
        if (key === 'leaderCard') {
            const ohSub = sub('overheat');
            const ohX = x + ohSub.relX * sx;
            const ohY = y + ohSub.relY * sy;
            const ohW = ohSub.width * sx;
            const ohH = Math.max(3, ohSub.height * sy);
            drawCrtBar(ctx, ohX, ohY, ohW, ohH, ohSub.color, 0.45, {
                borderColor: '#44aadd', borderAlpha: 0.25,
                scanlineGap: 2, bgColor: '#1a0505', bgAlpha: 0.7, fillAlpha: ohSub.opacity,
            });
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#ff6666';
            ctx.font = `${Math.max(5, 7 * Math.min(sx, sy))}px "Share Tech Mono", Consolas, monospace`;
            ctx.textBaseline = 'middle';
            ctx.fillText('HEAT', ohX + ohW + 3 * sx, ohY + ohH / 2);
            ctx.textBaseline = 'alphabetic';
            ctx.restore();
        }

        // HP number
        const hpSub = sub('hp');
        ctx.globalAlpha = hpSub.opacity;
        ctx.fillStyle = hpSub.color;
        ctx.font = `bold ${Math.max(16, hpSub.fontSize * Math.min(sx, sy))}px "${hpSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('99', x + hpSub.relX * sx, y + hpSub.relY * sy);

        // Ammo number — show low-ammo warning state on follower cards
        const ammoSub = sub('ammo');
        const ammoFontSize = Math.max(16, ammoSub.fontSize * Math.min(sx, sy));
        const ammoX = x + ammoSub.relX * sx;
        const ammoY = y + ammoSub.relY * sy;
        if (key !== 'leaderCard') {
            // Low-ammo glow halo
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#ff2222';
            ctx.shadowColor = '#ff2222';
            ctx.shadowBlur = 12;
            ctx.font = `bold ${ammoFontSize}px "${ammoSub.fontFamily}", Consolas, monospace`;
            ctx.fillText('04', ammoX, ammoY);
            ctx.shadowBlur = 0;
            ctx.restore();
            // Ammo count in warning red
            ctx.globalAlpha = ammoSub.opacity;
            ctx.fillStyle = '#ff2222';
            ctx.font = `bold ${ammoFontSize}px "${ammoSub.fontFamily}", Consolas, monospace`;
            ctx.fillText('04', ammoX, ammoY);
            // LOW label
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#ff4444';
            ctx.font = `${Math.max(5, 7 * Math.min(sx, sy))}px "${ammoSub.fontFamily}", Consolas, monospace`;
            ctx.fillText('LOW', ammoX, ammoY + ammoFontSize * 0.6);
        } else {
            ctx.globalAlpha = ammoSub.opacity;
            ctx.fillStyle = ammoSub.color;
            ctx.font = `bold ${ammoFontSize}px "${ammoSub.fontFamily}", Consolas, monospace`;
            ctx.fillText('99', ammoX, ammoY);
        }

        // Magazine count
        const magSub = sub('mag');
        ctx.globalAlpha = magSub.opacity;
        ctx.fillStyle = magSub.color;
        ctx.font = `bold ${Math.max(12, magSub.fontSize * Math.min(sx, sy))}px "${magSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('10', x + magSub.relX * sx, y + magSub.relY * sy);

        // Weapon name (leader only)
        if (key === 'leaderCard') {
            const wnSub = sub('weaponName');
            ctx.globalAlpha = wnSub.opacity;
            ctx.fillStyle = wnSub.color;
            ctx.font = `${Math.max(6, wnSub.fontSize * Math.min(sx, sy))}px "${wnSub.fontFamily}", Consolas, monospace`;
            ctx.fillText('PULSE RIFLE', x + wnSub.relX * sx, y + wnSub.relY * sy);
        }

        // Name text
        const nameSub = sub('name');
        ctx.globalAlpha = nameSub.opacity;
        ctx.fillStyle = nameSub.color;
        ctx.font = `bold ${Math.max(10, nameSub.fontSize * Math.min(sx, sy) * 0.5)}px "${nameSub.fontFamily}", Consolas, monospace`;
        const names = { leaderCard: 'R. RODRIGUEZ', techCard: 'M. HORROWITZ', medicCard: 'L. SHEEN', heavyCard: 'T. CHANG' };
        ctx.fillText(names[key] || '', x + nameSub.relX * sx, y + nameSub.relY * sy);

        // HEAL button
        const btnSub = sub('button');
        ctx.globalAlpha = btnSub.opacity;
        ctx.fillStyle = btnSub.bgColor || '#07172a';
        const btnX = x + btnSub.relX * sx;
        const btnY = y + btnSub.relY * sy;
        const btnW = btnSub.width * sx;
        const btnH = btnSub.height * sy;
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.strokeStyle = btnSub.borderColor || '#45b8ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        ctx.fillStyle = btnSub.color;
        ctx.font = `${Math.max(8, btnSub.fontSize * Math.min(sx, sy))}px "${btnSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('HEAL', btnX + btnW * 0.35, btnY + btnH * 0.7);

        // CRT vignette — gradient edge darkening on all 4 sides
        ctx.save();
        const vigEdge = 8 * Math.min(sx, sy);
        // Top edge
        const vigGradT = ctx.createLinearGradient(x, y, x, y + vigEdge);
        vigGradT.addColorStop(0, 'rgba(0,0,0,0.10)');
        vigGradT.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vigGradT;
        ctx.fillRect(x, y, scaledW, vigEdge);
        // Bottom edge
        const vigGradB = ctx.createLinearGradient(x, y + scaledH - vigEdge, x, y + scaledH);
        vigGradB.addColorStop(0, 'rgba(0,0,0,0)');
        vigGradB.addColorStop(1, 'rgba(0,0,0,0.10)');
        ctx.fillStyle = vigGradB;
        ctx.fillRect(x, y + scaledH - vigEdge, scaledW, vigEdge);
        // Left edge
        const vigGradL = ctx.createLinearGradient(x, y, x + vigEdge, y);
        vigGradL.addColorStop(0, 'rgba(0,0,0,0.10)');
        vigGradL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vigGradL;
        ctx.fillRect(x, y, vigEdge, scaledH);
        // Right edge
        const vigGradR = ctx.createLinearGradient(x + scaledW - vigEdge, y, x + scaledW, y);
        vigGradR.addColorStop(0, 'rgba(0,0,0,0)');
        vigGradR.addColorStop(1, 'rgba(0,0,0,0.10)');
        ctx.fillStyle = vigGradR;
        ctx.fillRect(x + scaledW - vigEdge, y, vigEdge, scaledH);
        ctx.restore();

    } else if (key === 'motionTracker') {
        const radarSub = sub('radar');
        ctx.globalAlpha = radarSub.opacity;
        ctx.strokeStyle = radarSub.color;
        ctx.lineWidth = 1;
        const cx = x + scaledW * radarSub.relX;
        const cy = y + scaledH * radarSub.relY;
        for (let r = 1; r <= 4; r++) {
            ctx.beginPath();
            ctx.arc(cx, cy, scaledW * 0.08 * r, Math.PI, 0);
            ctx.stroke();
        }
        ctx.fillStyle = radarSub.dotColor || '#33ff66';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        const cntSub = sub('cntLabel');
        ctx.globalAlpha = cntSub.opacity;
        ctx.fillStyle = cntSub.color;
        ctx.font = `bold ${cntSub.fontSize}px "${cntSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('CNT 00', x + cntSub.relX, y + scaledH + cntSub.relY);

        const rngSub = sub('rngLabel');
        ctx.globalAlpha = rngSub.opacity;
        ctx.fillStyle = rngSub.color;
        ctx.font = `bold ${rngSub.fontSize}px "${rngSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('RNG ---M', x + scaledW * rngSub.relX + 10, y + scaledH + rngSub.relY);

        // ── Tracker scan bar ──
        const sbSub = sub('scanBar');
        const tbW = scaledW + sbSub.width;
        const tbX = x + sbSub.relX;
        const tbY = y + scaledH + sbSub.relY;
        const tbH = sbSub.height;
        drawCrtBar(ctx, tbX, tbY, tbW, tbH, sbSub.color, 0.70, {
            borderColor: '#44aadd', borderAlpha: 0.3,
            scanlineGap: 0, bgColor: '#07172a', bgAlpha: 0.7, fillAlpha: sbSub.opacity,
        });
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#88ffaa';
        ctx.font = `7px "Share Tech Mono", Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('SCANNING', tbX + tbW / 2, tbY - 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();

    } else if (key === 'objectivesPanel') {
        const objSub = sub('objectiveText');
        ctx.globalAlpha = objSub.opacity;
        ctx.fillStyle = objSub.color;
        ctx.font = `${objSub.fontSize}px "${objSub.fontFamily}", Consolas, monospace`;
        ctx.fillText('[ ] CLEAR WAVES  0/3', x + objSub.relX, y + objSub.relY);
        ctx.fillText('[ ] REACH EXTRACTION', x + objSub.relX, y + objSub.relY + 16);

    } else if (key === 'missionLog') {
        const mlSub = sub('subtitleText');
        ctx.globalAlpha = mlSub.opacity;
        ctx.fillStyle = mlSub.color;
        ctx.font = `${mlSub.fontSize}px "${mlSub.fontFamily}", Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('Mission log subtitle text appears here...', x + scaledW * mlSub.relX, y + scaledH * mlSub.relY + 4);
        ctx.textAlign = 'left';
    }
}

function getResizeHandles(x, y, w, h) {
    return [
        { x: x, y: y, cursor: 'nw-resize', edge: 'nw' },
        { x: x + w / 2, y: y, cursor: 'n-resize', edge: 'n' },
        { x: x + w, y: y, cursor: 'ne-resize', edge: 'ne' },
        { x: x + w, y: y + h / 2, cursor: 'e-resize', edge: 'e' },
        { x: x + w, y: y + h, cursor: 'se-resize', edge: 'se' },
        { x: x + w / 2, y: y + h, cursor: 's-resize', edge: 's' },
        { x: x, y: y + h, cursor: 'sw-resize', edge: 'sw' },
        { x: x, y: y + h / 2, cursor: 'w-resize', edge: 'w' },
    ];
}

/** Compute canvas bounding boxes for all sub-elements of a parent element. */
function getSubElementBounds(parentKey, el) {
    const scaledW = el.width * el.scale;
    const scaledH = el.height * el.scale;
    const sx = scaledW / HUD_CARD_BASE_W;
    const sy = scaledH / HUD_CARD_BASE_H;
    const subDefs = getSubElementDefaults(parentKey);
    const bounds = [];
    for (const subKey of Object.keys(subDefs)) {
        const sub = getSubElementConfig(parentKey, subKey);
        const subW = (sub.width || sub.fontSize || 40) * sx;
        const subH = (sub.height || (sub.fontSize ? sub.fontSize * 1.2 : 20)) * sy;
        const subX = el.x + (sub.relX || 0) * sx;
        const subY = el.y + (sub.relY || 0) * sy;
        bounds.push({ subKey, x: subX, y: subY, w: subW, h: subH, sx, sy });
    }
    return bounds;
}

function setupHudCanvasInteraction() {
    const canvas = document.getElementById('hudCanvas');
    if (!canvas) return;

    // Calculate canvas display scale
    const rect = canvas.getBoundingClientRect();
    _hudCanvasScale = canvas.width / rect.width;

    function canvasCoords(ev) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left) * (canvas.width / r.width),
            y: (ev.clientY - r.top) * (canvas.height / r.height),
        };
    }

    function hitTest(mx, my) {
        const elements = getHudElements();
        // Check selected element's resize handles first
        if (_hudSelectedElement && elements[_hudSelectedElement]) {
            const el = elements[_hudSelectedElement];
            const sw = el.width * el.scale;
            const sh = el.height * el.scale;
            const handles = getResizeHandles(el.x, el.y, sw, sh);
            for (const h of handles) {
                if (Math.abs(mx - h.x) < 6 && Math.abs(my - h.y) < 6) {
                    return { type: 'resize', key: _hudSelectedElement, handle: h };
                }
            }
            // Check sub-elements within the selected parent
            const subBounds = getSubElementBounds(_hudSelectedElement, el);
            // Reverse so topmost (last drawn) is checked first
            for (let i = subBounds.length - 1; i >= 0; i--) {
                const sb = subBounds[i];
                if (mx >= sb.x && mx <= sb.x + sb.w && my >= sb.y && my <= sb.y + sb.h) {
                    return { type: 'sub', key: _hudSelectedElement, subKey: sb.subKey, bounds: sb };
                }
            }
        }
        // Check element body hits (in reverse order for z-ordering)
        const keys = Object.keys(elements).reverse();
        for (const key of keys) {
            const el = elements[key];
            const sw = el.width * el.scale;
            const sh = el.height * el.scale;
            if (mx >= el.x && mx <= el.x + sw && my >= el.y && my <= el.y + sh) {
                return { type: 'move', key };
            }
        }
        return null;
    }

    canvas.addEventListener('mousedown', (ev) => {
        const { x, y } = canvasCoords(ev);
        const hit = hitTest(x, y);

        if (!hit) {
            _hudSelectedElement = null;
            _hudSelectedSubElement = null;
            _hudDragState = null;
            _hudResizeState = null;
            _hudSubDragState = null;
            renderHudTab();
            return;
        }

        const elements = getHudElements();
        const el = elements[hit.key];

        if (hit.type === 'resize') {
            _hudSelectedElement = hit.key;
            _hudResizeState = {
                key: hit.key,
                edge: hit.handle.edge,
                startX: x,
                startY: y,
                origX: el.x,
                origY: el.y,
                origW: el.width,
                origH: el.height,
            };
            renderHudTab();
        } else if (hit.type === 'sub') {
            _hudSelectedElement = hit.key;
            _hudSelectedSubElement = hit.subKey;
            // Expand the parent's sub-elements in sidebar
            _hudSubsExpanded[hit.key] = true;
            // Video sub-element is locked — not draggable
            if (hit.subKey !== 'video') {
                _hudSubDragState = {
                    parentKey: hit.key,
                    subKey: hit.subKey,
                    offsetX: x - hit.bounds.x,
                    offsetY: y - hit.bounds.y,
                    sx: hit.bounds.sx,
                    sy: hit.bounds.sy,
                };
            }
            renderHudTab();
        } else {
            _hudSelectedElement = hit.key;
            _hudSelectedSubElement = null;
            _hudDragState = {
                key: hit.key,
                offsetX: x - el.x,
                offsetY: y - el.y,
            };
            renderHudTab();
        }
    });

    canvas.addEventListener('mousemove', (ev) => {
        const { x, y } = canvasCoords(ev);

        // Sub-element drag
        if (_hudSubDragState) {
            const sd = _hudSubDragState;
            const elements = getHudElements();
            const parent = elements[sd.parentKey];
            if (!parent) return;
            // Convert canvas position back to relX/relY in parent-local coordinates
            const newRelX = snapTo10((x - sd.offsetX - parent.x) / sd.sx);
            const newRelY = snapTo10((y - sd.offsetY - parent.y) / sd.sy);
            saveSubElementConfig(sd.parentKey, sd.subKey, { relX: newRelX, relY: newRelY });
            drawHudCanvas();
            return;
        }

        if (_hudDragState) {
            const config = loadHudConfig();
            const el = getHudElements()[_hudDragState.key];
            const newX = snapTo10(x - _hudDragState.offsetX);
            const newY = snapTo10(y - _hudDragState.offsetY);
            config[_hudDragState.key] = {
                ...(config[_hudDragState.key] || {}),
                x: Math.max(0, Math.min(HUD_GAME_WIDTH - 20, newX)),
                y: Math.max(0, Math.min(HUD_GAME_HEIGHT - 20, newY)),
            };
            saveHudConfig(config);
            drawHudCanvas();
            // Update sidebar position display
            const posSpan = panels.hud.querySelector(`.hud-element-item[data-hud-key="${_hudDragState.key}"] .hud-element-pos`);
            if (posSpan) {
                const updated = getHudElements()[_hudDragState.key];
                posSpan.textContent = `${Math.round(updated.x)}, ${Math.round(updated.y)} — ${Math.round(updated.width)}×${Math.round(updated.height)}`;
            }
            return;
        }

        if (_hudResizeState) {
            const rs = _hudResizeState;
            const dx = snapTo10(x - rs.startX);
            const dy = snapTo10(y - rs.startY);
            const config = loadHudConfig();
            const isCard = rs.key.endsWith('Card');
            let newX = rs.origX, newY = rs.origY, newW = rs.origW, newH = rs.origH;

            if (rs.edge.includes('e')) newW = Math.max(20, rs.origW + dx);
            if (rs.edge.includes('w')) { newW = Math.max(20, rs.origW - dx); newX = rs.origX + dx; }
            if (rs.edge.includes('s')) newH = Math.max(20, rs.origH + dy);
            if (rs.edge.includes('n')) { newH = Math.max(20, rs.origH - dy); newY = rs.origY + dy; }

            // Cards are locked to 16:9 aspect ratio
            if (isCard) {
                if (rs.edge.includes('e') || rs.edge.includes('w')) {
                    newH = Math.round(newW / HUD_CARD_AR);
                } else {
                    newW = Math.round(newH * HUD_CARD_AR);
                }
            }

            config[rs.key] = {
                ...(config[rs.key] || {}),
                x: Math.max(0, snapTo10(newX)),
                y: Math.max(0, snapTo10(newY)),
                width: snapTo10(newW),
                height: isCard ? Math.round(snapTo10(newW) / HUD_CARD_AR) : snapTo10(newH),
            };
            saveHudConfig(config);
            drawHudCanvas();
            return;
        }

        // Hover cursor
        const hit = hitTest(x, y);
        if (hit && hit.type === 'resize') {
            canvas.style.cursor = hit.handle.cursor;
        } else if (hit && hit.type === 'sub') {
            canvas.style.cursor = 'grab';
        } else if (hit && hit.type === 'move') {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (_hudDragState || _hudResizeState || _hudSubDragState) {
            _hudDragState = null;
            _hudResizeState = null;
            _hudSubDragState = null;
            renderHudTab();
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (_hudDragState || _hudResizeState || _hudSubDragState) {
            _hudDragState = null;
            _hudResizeState = null;
            _hudSubDragState = null;
            renderHudTab();
        }
    });
}

renderAll();
switchTab('sprite');
setStatus('Editors loaded');
