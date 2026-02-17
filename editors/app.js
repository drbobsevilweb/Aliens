import { buildPackageFromEditorState } from './backend/js/buildPackageFromEditorState.js';
import { normalizeMissionPackage, validateMissionPackageShape } from './backend/js/normalizeMissionPackage.js';

const STORAGE_KEY = 'aliens_dev_editors_v1';
const PACKAGE_STORAGE_KEY = 'aliens_mission_package_v1';
const PACKAGE_META_STORAGE_KEY = 'aliens_mission_package_meta_v1';
const PACKAGE_HISTORY_KEY = 'aliens_mission_package_history_v1';
const PACKAGE_HISTORY_MAX = 16;

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
        { value: 3, label: 'vent', color: '#c47ae8' },
        { value: 4, label: 'egg', color: '#d5da62' },
    ],
};

function createGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

function carveRect(grid, x1, y1, x2, y2, fillValue = 0) {
    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
            if (grid[y] && typeof grid[y][x] !== 'undefined') grid[y][x] = fillValue;
        }
    }
}

function createBaseTerrain(width, height) {
    const g = createGrid(width, height, 1);

    carveRect(g, 2, 2, 10, 9, 0);
    carveRect(g, 16, 2, 24, 9, 0);
    carveRect(g, 30, 2, 38, 9, 0);
    carveRect(g, 2, 15, 10, 23, 0);
    carveRect(g, 16, 15, 24, 23, 0);
    carveRect(g, 30, 15, 38, 23, 0);

    carveRect(g, 12, 5, 14, 6, 0);
    carveRect(g, 26, 5, 28, 6, 0);
    carveRect(g, 12, 18, 14, 19, 0);
    carveRect(g, 26, 18, 28, 19, 0);
    carveRect(g, 20, 11, 21, 13, 0);
    carveRect(g, 5, 11, 6, 13, 0);

    return g;
}

function createDefaultTilemaps() {
    const width = 40;
    const height = 26;

    const map1 = {
        id: 'lv1_colony_hub',
        name: 'Level 1: Colony Hub',
        width,
        height,
        terrain: createBaseTerrain(width, height),
        doors: createGrid(width, height, 0),
        markers: createGrid(width, height, 0),
    };

    const doorCells = [
        [11, 5, 1], [11, 6, 1], [15, 5, 2], [15, 6, 2],
        [25, 5, 1], [25, 6, 1], [29, 5, 2], [29, 6, 2],
        [11, 18, 1], [11, 19, 1], [15, 18, 2], [15, 19, 2],
        [25, 18, 1], [25, 19, 1], [29, 18, 2], [29, 19, 2],
        [20, 10, 2], [21, 10, 2], [20, 14, 1], [21, 14, 1],
        [5, 10, 2], [6, 10, 2], [5, 14, 1], [6, 14, 1],
    ];
    for (const [x, y, v] of doorCells) map1.doors[y][x] = v;
    map1.markers[5][5] = 1;
    map1.markers[19][34] = 2;

    const map2 = {
        id: 'lv2_reactor_spine',
        name: 'Level 2: Reactor Spine',
        width,
        height,
        terrain: createGrid(width, height, 1),
        doors: createGrid(width, height, 0),
        markers: createGrid(width, height, 0),
    };
    carveRect(map2.terrain, 2, 2, 15, 8, 0);
    carveRect(map2.terrain, 18, 2, 37, 8, 0);
    carveRect(map2.terrain, 2, 11, 13, 24, 0);
    carveRect(map2.terrain, 16, 11, 25, 24, 0);
    carveRect(map2.terrain, 28, 11, 37, 24, 0);
    carveRect(map2.terrain, 14, 5, 17, 6, 0);
    carveRect(map2.terrain, 7, 9, 8, 10, 0);
    carveRect(map2.terrain, 20, 9, 21, 10, 0);
    carveRect(map2.terrain, 30, 9, 31, 10, 0);
    map2.markers[5][6] = 1;
    map2.markers[20][33] = 2;

    const map3 = {
        id: 'lv3_hive_core',
        name: 'Level 3: Hive Core',
        width,
        height,
        terrain: createGrid(width, height, 1),
        doors: createGrid(width, height, 0),
        markers: createGrid(width, height, 0),
    };
    carveRect(map3.terrain, 3, 3, 12, 12, 0);
    carveRect(map3.terrain, 15, 3, 24, 12, 0);
    carveRect(map3.terrain, 27, 3, 36, 12, 0);
    carveRect(map3.terrain, 3, 15, 12, 23, 0);
    carveRect(map3.terrain, 15, 15, 24, 23, 0);
    carveRect(map3.terrain, 27, 15, 36, 23, 0);
    carveRect(map3.terrain, 13, 7, 14, 8, 0);
    carveRect(map3.terrain, 25, 7, 26, 8, 0);
    carveRect(map3.terrain, 13, 18, 14, 19, 0);
    carveRect(map3.terrain, 25, 18, 26, 19, 0);
    carveRect(map3.terrain, 19, 13, 20, 14, 0);
    map3.markers[6][5] = 1;
    map3.markers[18][31] = 2;
    map3.markers[4][33] = 3;
    map3.markers[20][18] = 4;

    const map4 = {
        id: 'lv4_operations_block',
        name: 'Level 4: Operations Block',
        width,
        height,
        terrain: createGrid(width, height, 1),
        doors: createGrid(width, height, 0),
        markers: createGrid(width, height, 0),
    };
    carveRect(map4.terrain, 2, 3, 13, 12, 0);
    carveRect(map4.terrain, 16, 3, 26, 10, 0);
    carveRect(map4.terrain, 29, 3, 38, 12, 0);
    carveRect(map4.terrain, 4, 15, 14, 24, 0);
    carveRect(map4.terrain, 17, 17, 23, 24, 0);
    carveRect(map4.terrain, 27, 15, 38, 24, 0);
    carveRect(map4.terrain, 14, 6, 15, 7, 0);
    carveRect(map4.terrain, 27, 6, 28, 7, 0);
    carveRect(map4.terrain, 8, 13, 9, 14, 0);
    carveRect(map4.terrain, 19, 11, 20, 16, 0);
    carveRect(map4.terrain, 30, 13, 31, 14, 0);
    map4.markers[6][6] = 1;
    map4.markers[20][34] = 2;
    map4.markers[6][20] = 3;
    map4.markers[18][20] = 3;

    const map5 = {
        id: 'lv5_queen_cathedral',
        name: 'Level 5: Queen Cathedral',
        width,
        height,
        terrain: createGrid(width, height, 1),
        doors: createGrid(width, height, 0),
        markers: createGrid(width, height, 0),
    };
    carveRect(map5.terrain, 3, 3, 12, 10, 0);
    carveRect(map5.terrain, 15, 3, 24, 10, 0);
    carveRect(map5.terrain, 27, 3, 36, 10, 0);
    carveRect(map5.terrain, 8, 12, 31, 17, 0);
    carveRect(map5.terrain, 3, 19, 12, 24, 0);
    carveRect(map5.terrain, 15, 19, 24, 24, 0);
    carveRect(map5.terrain, 27, 19, 36, 24, 0);
    carveRect(map5.terrain, 13, 11, 14, 18, 0);
    carveRect(map5.terrain, 25, 11, 26, 18, 0);
    map5.doors[6][13] = 1; map5.doors[7][13] = 1;
    map5.doors[6][25] = 2; map5.doors[7][25] = 2;
    map5.doors[11][13] = 4; map5.doors[11][14] = 4;
    map5.doors[11][25] = 3; map5.doors[11][26] = 3;
    map5.doors[18][13] = 2; map5.doors[18][14] = 2;
    map5.doors[18][25] = 2; map5.doors[18][26] = 2;
    map5.markers[6][6] = 1;
    map5.markers[22][34] = 2;
    map5.markers[14][20] = 3;
    map5.markers[14][19] = 4;

    return [map1, map2, map3, map4, map5];
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
                id: 'm1', name: 'Mission 1: Sweep & Secure', mapId: 'lv1_colony_hub', objective: 'Clear hostiles and extract',
                difficulty: 'normal', enemyBudget: 20, notes: 'Intro mission with basic doors',
                director: {
                    idlePressureBaseMs: 7600,
                    gunfireReinforceBaseMs: 5000,
                    reinforceCap: 14,
                    inactivityAmbushMs: 11000,
                    inactivityAmbushCooldownMs: 15000,
                },
            },
            {
                id: 'm2', name: 'Mission 2: Data Retrieval', mapId: 'lv1_colony_hub', objective: 'Reach terminal room and hold',
                difficulty: 'normal', enemyBudget: 24, notes: 'Adds pressure events',
                director: {
                    idlePressureBaseMs: 6900,
                    gunfireReinforceBaseMs: 4600,
                    reinforceCap: 16,
                    inactivityAmbushMs: 10000,
                    inactivityAmbushCooldownMs: 14200,
                },
            },
            {
                id: 'm3', name: 'Mission 3: Reactor Access', mapId: 'lv2_reactor_spine', objective: 'Secure 2 reactor valves',
                difficulty: 'hard', enemyBudget: 30, notes: 'Long corridors and flanks',
                director: {
                    idlePressureBaseMs: 6200,
                    gunfireReinforceBaseMs: 4200,
                    reinforceCap: 20,
                    inactivityAmbushMs: 9000,
                    inactivityAmbushCooldownMs: 13000,
                },
            },
            {
                id: 'm4', name: 'Mission 4: Purge Nest', mapId: 'lv4_operations_block', objective: 'Destroy egg clusters',
                difficulty: 'hard', enemyBudget: 36, notes: 'Vertical ambush pressure',
                director: {
                    idlePressureBaseMs: 5600,
                    gunfireReinforceBaseMs: 3800,
                    reinforceCap: 24,
                    inactivityAmbushMs: 8200,
                    inactivityAmbushCooldownMs: 11800,
                },
            },
            {
                id: 'm5', name: 'Mission 5: Queen Hunt', mapId: 'lv5_queen_cathedral', objective: 'Kill queen and survive extraction',
                difficulty: 'extreme', enemyBudget: 44, notes: 'Finale with breach threats',
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

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return mergeWithDefaults(parsed);
    } catch {
        return defaultState();
    }
}

function mergeWithDefaults(loaded) {
    const d = defaultState();
    return {
        sprite: { ...d.sprite, ...(loaded.sprite || {}) },
        animations: Array.isArray(loaded.animations) && loaded.animations.length ? loaded.animations : d.animations,
        tilemaps: Array.isArray(loaded.tilemaps) && loaded.tilemaps.length === 3 ? loaded.tilemaps : d.tilemaps,
        missions: Array.isArray(loaded.missions) && loaded.missions.length === 5 ? loaded.missions : d.missions,
        directorEvents: Array.isArray(loaded.directorEvents) ? loaded.directorEvents : d.directorEvents,
        audioCues: Array.isArray(loaded.audioCues) ? loaded.audioCues : d.audioCues,
    };
}

function applyMissionPackageToState(pkg) {
    const d = defaultState();
    const normalized = normalizeMissionPackage(pkg);
    const shapeErrors = validateMissionPackageShape(normalized);
    if (shapeErrors.length) {
        throw new Error(shapeErrors[0]);
    }

    const maps = normalized.maps.slice(0, 3).map(normalizeTilemapShape);
    while (maps.length < 3) {
        maps.push(clone(d.tilemaps[maps.length]));
    }

    const missions = normalized.missions.slice(0, 5).map((m, idx) => ({
        id: m.id || d.missions[idx]?.id || `m${idx + 1}`,
        name: m.name || d.missions[idx]?.name || `Mission ${idx + 1}`,
        mapId: maps.some((tm) => tm.id === m.mapId) ? m.mapId : maps[0].id,
        objective: m.objective || '',
        difficulty: ['normal', 'hard', 'extreme'].includes(m.difficulty) ? m.difficulty : 'normal',
        enemyBudget: clamp(Number(m.enemyBudget) || 0, 0, 999),
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
    state.directorEvents = Array.isArray(normalized.directorEvents) ? normalized.directorEvents : [];
    state.audioCues = Array.isArray(normalized.audioCues) ? normalized.audioCues : [];
}

function normalizeTilemapShape(mapLike) {
    const width = clamp(Math.round(Number(mapLike.width) || 40), 8, 256);
    const height = clamp(Math.round(Number(mapLike.height) || 26), 8, 256);
    const terrainFill = 1;
    const doorsFill = 0;
    const markersFill = 0;
    return {
        id: String(mapLike.id || `map_${Date.now()}`),
        name: String(mapLike.name || mapLike.id || 'Map'),
        width,
        height,
        terrain: coerceLayerGrid(mapLike.terrain, width, height, terrainFill),
        doors: coerceLayerGrid(mapLike.doors, width, height, doorsFill),
        markers: coerceLayerGrid(mapLike.markers, width, height, markersFill),
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

const state = loadState();

const statusEl = document.getElementById('status');
const validationEl = document.getElementById('packageValidation');
const packageHistoryEl = document.getElementById('packageHistory');
const tabRoot = document.getElementById('tabs');
const panels = {
    sprite: document.getElementById('tab-sprite'),
    animation: document.getElementById('tab-animation'),
    tilemap: document.getElementById('tab-tilemap'),
    missions: document.getElementById('tab-missions'),
};

let spriteCtx;
let previewCtx;
let tilemapCtx;
let animationTimer = null;
let animationPreviewIndex = 0;
let activeAnimationId = state.animations[0]?.id || null;
let activeMapIndex = 0;
let activeLayer = 'terrain';
let activeTileTool = 'pen';
let activeTileValue = 1;
let activeTab = 'sprite';

function setStatus(text) {
    statusEl.textContent = text;
}

function saveState(reason = 'Saved') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus(`${reason} @ ${new Date().toLocaleTimeString()}`);
    refreshPackageValidationSummary();
}

function switchTab(name) {
    activeTab = name;
    for (const [key, panel] of Object.entries(panels)) {
        panel.classList.toggle('active', key === name);
    }
    for (const btn of tabRoot.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.tab === name);
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
    panels.sprite.innerHTML = `
        <div class="controls">
            <h2>Sprite Editor</h2>
            <div class="row">
                <label>Width <input id="spriteWidth" type="number" min="8" max="64" value="${state.sprite.width}"></label>
                <label>Height <input id="spriteHeight" type="number" min="8" max="64" value="${state.sprite.height}"></label>
            </div>
            <button id="resizeSpriteBtn">Resize Sprite Grid</button>
            <h3>Tool</h3>
            <div class="row-3">
                <button data-sprite-tool="pen" class="${state.sprite.tool === 'pen' ? 'active' : ''}">Pen</button>
                <button data-sprite-tool="erase" class="${state.sprite.tool === 'erase' ? 'active' : ''}">Eraser</button>
                <button data-sprite-tool="fill" class="${state.sprite.tool === 'fill' ? 'active' : ''}">Fill</button>
            </div>
            <label><input id="spriteOnionToggle" type="checkbox" ${state.sprite.onionSkin ? 'checked' : ''}> Onion skin</label>
            <div class="row">
                <label>Origin X <input id="originX" type="number" min="0" max="${state.sprite.width - 1}" value="${state.sprite.originX}"></label>
                <label>Origin Y <input id="originY" type="number" min="0" max="${state.sprite.height - 1}" value="${state.sprite.originY}"></label>
            </div>
            <h3>Palette</h3>
            <div id="palette" class="palette"></div>
            <div class="row">
                <input id="newColorInput" type="color" value="#ffffff">
                <button id="addColorBtn">Add Color</button>
            </div>
            <h3>Frames</h3>
            <div class="frame-strip" id="frameStrip"></div>
            <div class="row">
                <button id="addFrameBtn">New Frame</button>
                <button id="dupFrameBtn">Duplicate</button>
            </div>
            <button id="deleteFrameBtn">Delete Frame</button>
        </div>
        <div class="workspace">
            <h2>Canvas</h2>
            <canvas id="spriteCanvas" class="pixel-canvas"></canvas>
            <h3>Preview</h3>
            <canvas id="spritePreview" class="preview-canvas" width="128" height="128"></canvas>
            <div class="small">Use draw tools like GameMaker-style pixel blocking and frame iteration.</div>
        </div>
    `;

    spriteCtx = document.getElementById('spriteCanvas').getContext('2d');
    previewCtx = document.getElementById('spritePreview').getContext('2d');

    bindSpriteControls();
    redrawSpriteCanvas();
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
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!drawing) return;
        paintAt(event);
    });
    window.addEventListener('pointerup', () => {
        if (drawing) saveState('Sprite edited');
        drawing = false;
    });
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

function renderTilemapTab() {
    const mapButtons = state.tilemaps.map((m, idx) => `
        <button data-map-idx="${idx}" class="map-btn ${idx === activeMapIndex ? 'active' : ''}">${m.name}</button>
    `).join('');

    const layerOptions = ['terrain', 'doors', 'markers']
        .map((layer) => `<option value="${layer}" ${layer === activeLayer ? 'selected' : ''}>${layer}</option>`)
        .join('');

    const valueOptions = TILE_VALUES[activeLayer]
        .map((v) => `<option value="${v.value}" ${v.value === activeTileValue ? 'selected' : ''}>${v.value}: ${v.label}</option>`)
        .join('');

    panels.tilemap.innerHTML = `
        <div class="controls">
            <h2>Tilemap Editor</h2>
            <div class="frame-strip">${mapButtons}</div>
            <h3>Layer</h3>
            <select id="layerSelect">${layerOptions}</select>
            <h3>Tool</h3>
            <div class="row-3">
                <button data-map-tool="pen" class="${activeTileTool === 'pen' ? 'active' : ''}">Pen</button>
                <button data-map-tool="erase" class="${activeTileTool === 'erase' ? 'active' : ''}">Eraser</button>
                <button data-map-tool="fill" class="${activeTileTool === 'fill' ? 'active' : ''}">Fill</button>
            </div>
            <label>Brush value
                <select id="tileValueSelect">${valueOptions}</select>
            </label>
            <div class="row">
                <button id="clearLayerBtn">Clear Layer</button>
                <button id="mirrorMapBtn">Mirror X</button>
            </div>
            <h3>Legend</h3>
            <div id="layerLegend" class="frame-strip"></div>
            <div class="small">Three map slots cover all five missions.</div>
        </div>
        <div class="workspace">
            <h2>${state.tilemaps[activeMapIndex].name}</h2>
            <canvas id="tilemapCanvas" class="tile-canvas"></canvas>
            <div class="small">Layers: terrain base, door states, mission markers. Use fill for fast blocking.</div>
        </div>
    `;

    document.querySelectorAll('[data-map-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activeMapIndex = Number(btn.dataset.mapIdx);
            renderTilemapTab();
        });
    });

    document.querySelectorAll('[data-map-tool]').forEach((btn) => {
        btn.addEventListener('click', () => {
            activeTileTool = btn.dataset.mapTool;
            renderTilemapTab();
        });
    });

    document.getElementById('layerSelect').addEventListener('change', (ev) => {
        activeLayer = ev.target.value;
        activeTileValue = TILE_VALUES[activeLayer][0].value;
        renderTilemapTab();
    });

    document.getElementById('tileValueSelect').addEventListener('change', (ev) => {
        activeTileValue = Number(ev.target.value);
    });

    document.getElementById('clearLayerBtn').addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        const fill = activeLayer === 'terrain' ? 1 : 0;
        map[activeLayer] = createGrid(map.width, map.height, fill);
        saveState(`${activeLayer} cleared`);
        renderTilemapTab();
    });

    document.getElementById('mirrorMapBtn').addEventListener('click', () => {
        const map = state.tilemaps[activeMapIndex];
        for (const layerName of ['terrain', 'doors', 'markers']) {
            map[layerName] = map[layerName].map((row) => [...row].reverse());
        }
        saveState('Map mirrored');
        renderTilemapTab();
    });

    const legend = document.getElementById('layerLegend');
    legend.innerHTML = '';
    for (const item of TILE_VALUES[activeLayer]) {
        const d = document.createElement('div');
        d.className = 'small';
        d.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${item.color};border:1px solid #618198;margin-right:6px"></span>${item.value}: ${item.label}`;
        legend.appendChild(d);
    }

    tilemapCtx = document.getElementById('tilemapCanvas').getContext('2d');
    bindTilemapInput();
    redrawTilemapCanvas();
}

function bindTilemapInput() {
    const canvas = document.getElementById('tilemapCanvas');
    const map = state.tilemaps[activeMapIndex];
    const cellSize = 24;
    let drawing = false;

    const applyAt = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / cellSize);
        const y = Math.floor((event.clientY - rect.top) / cellSize);
        if (!map[activeLayer][y] || typeof map[activeLayer][y][x] === 'undefined') return;

        if (activeTileTool === 'fill') {
            floodFill(map[activeLayer], x, y, activeTileValue);
            redrawTilemapCanvas();
            saveState(`Filled ${activeLayer}`);
            return;
        }

        map[activeLayer][y][x] = activeTileTool === 'erase' ? 0 : activeTileValue;
        redrawTilemapCanvas();
    };

    canvas.addEventListener('pointerdown', (ev) => {
        drawing = true;
        applyAt(ev);
    });
    canvas.addEventListener('pointermove', (ev) => {
        if (!drawing) return;
        applyAt(ev);
    });
    window.addEventListener('pointerup', () => {
        if (drawing) saveState(`${activeLayer} painted`);
        drawing = false;
    });
}

function redrawTilemapCanvas() {
    if (!tilemapCtx) return;
    const map = state.tilemaps[activeMapIndex];
    const cell = 24;
    const c = tilemapCtx.canvas;
    c.width = map.width * cell;
    c.height = map.height * cell;

    tilemapCtx.clearRect(0, 0, c.width, c.height);

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const terrainVal = map.terrain[y][x];
            tilemapCtx.fillStyle = TILE_VALUES.terrain.find((v) => v.value === terrainVal)?.color || '#111';
            tilemapCtx.fillRect(x * cell, y * cell, cell, cell);

            const doorVal = map.doors[y][x];
            if (doorVal > 0) {
                tilemapCtx.globalAlpha = 0.8;
                tilemapCtx.fillStyle = TILE_VALUES.doors.find((v) => v.value === doorVal)?.color || '#ff00ff';
                tilemapCtx.fillRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
                tilemapCtx.globalAlpha = 1;
            }

            const markerVal = map.markers[y][x];
            if (markerVal > 0) {
                tilemapCtx.fillStyle = TILE_VALUES.markers.find((v) => v.value === markerVal)?.color || '#fff';
                tilemapCtx.beginPath();
                tilemapCtx.arc(x * cell + cell / 2, y * cell + cell / 2, 4, 0, Math.PI * 2);
                tilemapCtx.fill();
            }

            tilemapCtx.strokeStyle = '#1f3340';
            tilemapCtx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
        }
    }

    if (activeLayer !== 'terrain') {
        tilemapCtx.strokeStyle = '#8ce0b7';
        tilemapCtx.lineWidth = 2;
        tilemapCtx.strokeRect(1, 1, c.width - 2, c.height - 2);
        tilemapCtx.lineWidth = 1;
    }
}

function renderMissionsTab() {
    const rows = state.missions.map((m, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><input data-mission="name" data-i="${i}" value="${escapeHtml(m.name)}"></td>
            <td>
                <select data-mission="mapId" data-i="${i}">
                    ${state.tilemaps.map((tm) => `<option value="${tm.id}" ${tm.id === m.mapId ? 'selected' : ''}>${tm.name}</option>`).join('')}
                </select>
            </td>
            <td><input data-mission="objective" data-i="${i}" value="${escapeHtml(m.objective)}"></td>
            <td>
                <select data-mission="difficulty" data-i="${i}">
                    ${['normal', 'hard', 'extreme'].map((d) => `<option value="${d}" ${d === m.difficulty ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
            </td>
            <td><input data-mission="enemyBudget" data-i="${i}" type="number" min="1" value="${m.enemyBudget}"></td>
            <td><input data-missiondir="idlePressureBaseMs" data-i="${i}" type="number" min="500" value="${m.director?.idlePressureBaseMs ?? ''}"></td>
            <td><input data-missiondir="gunfireReinforceBaseMs" data-i="${i}" type="number" min="500" value="${m.director?.gunfireReinforceBaseMs ?? ''}"></td>
            <td><input data-missiondir="reinforceCap" data-i="${i}" type="number" min="0" value="${m.director?.reinforceCap ?? ''}"></td>
            <td><input data-missiondir="inactivityAmbushMs" data-i="${i}" type="number" min="1000" value="${m.director?.inactivityAmbushMs ?? ''}"></td>
            <td><input data-missiondir="inactivityAmbushCooldownMs" data-i="${i}" type="number" min="500" value="${m.director?.inactivityAmbushCooldownMs ?? ''}"></td>
            <td><input data-mission="notes" data-i="${i}" value="${escapeHtml(m.notes)}"></td>
        </tr>
    `).join('');

    panels.missions.innerHTML = `
        <div class="controls">
            <h2>Mission Planner</h2>
            <p class="small">Five missions mapped across five base tilemaps.</p>
            <button id="applyMissionChanges">Apply Mission Changes</button>
            <button id="resetMissionsBtn">Reset Missions</button>
            <h3>Director Events (JSON array)</h3>
            <div class="tool-row">
                <button id="snippetSpawnPackBtn">+ Spawn Pack</button>
                <button id="snippetDoorThumpBtn">+ Door Thump</button>
                <button id="snippetTrackerBtn">+ Tracker Action</button>
                <button id="snippetLightingBtn">+ Lighting Shift</button>
                <button id="snippetCombatModsBtn">+ Combat Mods</button>
            </div>
            <textarea id="directorEventsJson" rows="9">${escapeHtml(JSON.stringify(state.directorEvents || [], null, 2))}</textarea>
            <p class="small">Trigger format: always | time:20 | wave:2 | pressure:0.72 | kills:25 | objective:1 | stage:extract. Actions: spawn_pack, door_action, door_thump, edge_cue, set_lighting, set_pressure_grace, set_reinforce_caps, set_combat_mods, trigger_tracker, morale_delta, spawn_queen, text_cue. Optional params: cueId, dir(N/S/E/W), repeatMs, retryMs, maxFires.</p>
            <h3>Audio Cues (JSON array)</h3>
            <textarea id="audioCuesJson" rows="9">${escapeHtml(JSON.stringify(state.audioCues || [], null, 2))}</textarea>
            <p class="small">Cue IDs used in gameplay text: cue_motion_near, cue_tracker_active, cue_swarm_close, cue_door_thump, cue_door_breach.</p>
        </div>
        <div class="workspace">
            <h2>Campaign Table</h2>
            <table class="table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Tilemap</th>
                        <th>Objective</th>
                        <th>Difficulty</th>
                        <th>Enemy Budget</th>
                        <th>Idle Ms</th>
                        <th>Gunfire Ms</th>
                        <th>Reinforce Cap</th>
                        <th>Ambush Ms</th>
                        <th>Ambush CD Ms</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    document.getElementById('applyMissionChanges').addEventListener('click', () => {
        try {
            const next = clone(state);
            document.querySelectorAll('[data-mission]').forEach((input) => {
                const idx = Number(input.dataset.i);
                const key = input.dataset.mission;
                const value = key === 'enemyBudget' ? Number(input.value) : input.value;
                next.missions[idx][key] = value;
            });
            document.querySelectorAll('[data-missiondir]').forEach((input) => {
                const idx = Number(input.dataset.i);
                const key = input.dataset.missiondir;
                if (!next.missions[idx].director || typeof next.missions[idx].director !== 'object') {
                    next.missions[idx].director = {};
                }
                next.missions[idx].director[key] = Number(input.value);
            });
            const directorEventsParsed = parseJsonArrayInput(document.getElementById('directorEventsJson').value, 'directorEvents');
            const audioCuesParsed = parseJsonArrayInput(document.getElementById('audioCuesJson').value, 'audioCues');
            next.directorEvents = directorEventsParsed;
            next.audioCues = audioCuesParsed;
            const pkgPreview = buildPackageFromEditorState(next);
            const errors = validateMissionPackageShape(pkgPreview);
            if (errors.length) throw new Error(errors[0]);
            Object.assign(state, next);
            saveState('Mission table updated');
            renderMissionsTab();
        } catch (err) {
            const detail = err && err.message ? err.message : 'invalid mission planner JSON';
            setStatus(`Apply failed: ${detail}`);
        }
    });

    const appendDirectorEventSnippet = (kind) => {
        try {
            const area = document.getElementById('directorEventsJson');
            const arr = parseJsonArrayInput(area.value, 'directorEvents');
            const maxSuffix = arr.reduce((best, e) => {
                const m = String(e?.id || '').match(/evt_snippet_(\d+)/);
                if (!m) return best;
                return Math.max(best, Number(m[1]) || 0);
            }, 0);
            const id = `evt_snippet_${maxSuffix + 1}`;
            let event = { id, trigger: 'time:20', action: 'text_cue', params: { textCue: 'EVENT READY' } };
            if (kind === 'spawn_pack') {
                event = { id, trigger: 'time:20', action: 'spawn_pack', params: { size: 3, source: 'idle', dir: 'N' } };
            } else if (kind === 'door_thump') {
                event = { id, trigger: 'pressure:0.7', action: 'door_thump', params: { word: 'THUMP!!', dir: 'E' } };
            } else if (kind === 'trigger_tracker') {
                event = { id, trigger: 'time:30', action: 'trigger_tracker', params: { role: 'tech' } };
            } else if (kind === 'set_lighting') {
                event = { id, trigger: 'pressure:0.75', action: 'set_lighting', params: { ambientDarkness: 0.62, torchRange: 290 } };
            } else if (kind === 'set_combat_mods') {
                event = {
                    id,
                    trigger: 'wave:2',
                    action: 'set_combat_mods',
                    params: { marineAccuracyMul: 1.1, marineJamMul: 0.82, enemyAggressionMul: 1.08, ms: 7000 },
                };
            }
            arr.push(event);
            area.value = JSON.stringify(arr, null, 2);
            setStatus(`Snippet added: ${event.action}`);
        } catch (err) {
            const detail = err && err.message ? err.message : 'snippet add failed';
            setStatus(`Snippet failed: ${detail}`);
        }
    };

    document.getElementById('snippetSpawnPackBtn').addEventListener('click', () => appendDirectorEventSnippet('spawn_pack'));
    document.getElementById('snippetDoorThumpBtn').addEventListener('click', () => appendDirectorEventSnippet('door_thump'));
    document.getElementById('snippetTrackerBtn').addEventListener('click', () => appendDirectorEventSnippet('trigger_tracker'));
    document.getElementById('snippetLightingBtn').addEventListener('click', () => appendDirectorEventSnippet('set_lighting'));
    document.getElementById('snippetCombatModsBtn').addEventListener('click', () => appendDirectorEventSnippet('set_combat_mods'));

    document.getElementById('resetMissionsBtn').addEventListener('click', () => {
        state.missions = defaultState().missions;
        state.directorEvents = defaultState().directorEvents;
        state.audioCues = defaultState().audioCues;
        saveState('Missions reset');
        renderMissionsTab();
    });
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

function refreshPackageValidationSummary() {
    if (!validationEl) return;
    const missionPkg = buildPackageFromEditorState(state);
    const payload = JSON.stringify(missionPkg);
    const currentChecksum = checksumString(payload);
    const errors = validateMissionPackageShape(missionPkg);
    let publishedLine = 'Published: no';
    try {
        const rawMeta = localStorage.getItem(PACKAGE_META_STORAGE_KEY);
        if (rawMeta) {
            const meta = JSON.parse(rawMeta);
            if (meta && meta.publishedAt) {
                const stamp = new Date(meta.publishedAt).toLocaleString();
                const bytes = Number(meta.sizeBytes) || 0;
                const stale = Number(meta.checksum) !== currentChecksum;
                publishedLine = `Published: yes (${stamp}, ${bytes} bytes)${stale ? ' [STALE]' : ' [CURRENT]'}`;
            }
        }
    } catch {
        // Ignore malformed publish metadata.
    }
    if (!errors.length) {
        validationEl.classList.remove('err');
        validationEl.classList.add('ok');
        validationEl.textContent = `Mission Package: OK\nMaps: ${missionPkg.maps.length} | Missions: ${missionPkg.missions.length} | Events: ${(missionPkg.directorEvents || []).length} | Cues: ${(missionPkg.audioCues || []).length}\n${publishedLine}`;
        return;
    }
    validationEl.classList.remove('ok');
    validationEl.classList.add('err');
    validationEl.textContent = `Mission Package: ${errors.length} issue(s)\n- ${errors.join('\n- ')}\n${publishedLine}`;
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
    localStorage.setItem(PACKAGE_STORAGE_KEY, payload);
    localStorage.setItem(PACKAGE_META_STORAGE_KEY, JSON.stringify({
        publishedAt: Date.now(),
        sizeBytes: payload.length,
        checksum: checksumString(payload),
    }));
    pushPackageHistory(payload, source);
}

function renderPackageHistory() {
    if (!packageHistoryEl) return;
    const entries = loadPackageHistory();
    if (entries.length === 0) {
        packageHistoryEl.textContent = 'Package History: none';
        return;
    }
    const top = entries.slice(0, 8);
    packageHistoryEl.innerHTML = `
        <div>Package History (${entries.length})</div>
        ${top.map((e, i) => {
            const when = new Date(Number(e.ts) || Date.now()).toLocaleString();
            const src = String(e.source || 'publish').toUpperCase();
            const size = Number(e.sizeBytes) || 0;
            return `
                <div class="history-row">
                    <span>${i + 1}. ${src} ${size}B @ ${when}</span>
                    <button data-hist-load="${i}">Load</button>
                    <button data-hist-pub="${i}">Publish</button>
                </div>
            `;
        }).join('')}
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
            renderPackageHistory();
            setStatus('Published package snapshot to game storage');
        });
    });
}

document.getElementById('saveAllBtn').addEventListener('click', () => saveState('Saved all sections'));
document.getElementById('validatePackageBtn').addEventListener('click', () => {
    refreshPackageValidationSummary();
    if (validationEl?.classList.contains('ok')) {
        setStatus('Mission package validation passed');
    } else {
        setStatus('Mission package validation failed');
    }
});
document.getElementById('publishPackageBtn').addEventListener('click', () => {
    const missionPkg = buildPackageFromEditorState(state);
    const errors = validateMissionPackageShape(missionPkg);
    if (errors.length) {
        setStatus(`Publish blocked: ${errors[0]}`);
        refreshPackageValidationSummary();
        return;
    }
    const payload = JSON.stringify(missionPkg);
    publishPackagePayload(payload, 'publish');
    setStatus('Mission package published to game storage');
    refreshPackageValidationSummary();
    renderPackageHistory();
});

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
    const missionPkg = buildPackageFromEditorState(state);
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
        pushPackageHistory(JSON.stringify(buildPackageFromEditorState(state)), 'import');
        renderAll();
        renderPackageHistory();
    } catch (err) {
        const detail = err && err.message ? err.message : 'invalid package';
        setStatus(`Mission package import failed: ${detail}`);
    }
});

function renderAll() {
    renderSpriteTab();
    renderAnimationTab();
    renderTilemapTab();
    renderMissionsTab();
    refreshPackageValidationSummary();
    renderPackageHistory();
}

window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement) {
        return;
    }

    const key = ev.key.toLowerCase();
    if (!['b', 'e', 'f'].includes(key)) return;

    if (activeTab === 'sprite') {
        state.sprite.tool = key === 'b' ? 'pen' : key === 'e' ? 'erase' : 'fill';
        renderSpriteTab();
        setStatus(`Sprite tool: ${state.sprite.tool.toUpperCase()}`);
    }

    if (activeTab === 'tilemap') {
        activeTileTool = key === 'b' ? 'pen' : key === 'e' ? 'erase' : 'fill';
        renderTilemapTab();
        setStatus(`Tilemap tool: ${activeTileTool.toUpperCase()}`);
    }
});

renderAll();
switchTab('sprite');
setStatus('Editors loaded');
