import { buildPackageFromEditorState } from '../backend/js/buildPackageFromEditorState.js';
import { validateMissionPackageShape } from '../backend/js/normalizeMissionPackage.js';
import { analyzeMissionPackageQuality } from '../backend/js/missionPackageQuality.js';
import { MISSION_SET } from '../../src/data/missionData.js';
import { TILED_MAP_TEMPLATES } from '../../src/data/tiledMaps.generated.js';

const API = window.editorAPI;

let rootEl = null;
let editorState = null;
let dirty = false;
let availableTilemaps = [];
let showEventsJson = false;
let showCuesJson = false;

/* ── Constants ── */

const DIRECTOR_FIELDS = [
    ['idlePressureBaseMs', 'Idle Ms'],
    ['gunfireReinforceBaseMs', 'Gunfire Ms'],
    ['reinforceCap', 'Cap'],
    ['inactivityAmbushMs', 'Ambush Ms'],
    ['inactivityAmbushCooldownMs', 'Ambush CD'],
];

const EVENT_ACTIONS = [
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
];

const EVENT_TRIGGER_TYPES = [
    { value: 'always', label: 'Always' },
    { value: 'time', label: 'Time (seconds)' },
    { value: 'wave', label: 'Wave number' },
    { value: 'pressure', label: 'Pressure (0-1)' },
    { value: 'kills', label: 'Kill count' },
    { value: 'objective', label: 'Objective index' },
    { value: 'stage', label: 'Stage' },
];

const STAGE_VALUES = ['combat', 'intermission', 'extract', 'victory', 'defeat'];

const DIRECTION_OPTIONS = [
    { value: '', label: 'Auto / Random' },
    { value: 'N', label: 'North' },
    { value: 'S', label: 'South' },
    { value: 'E', label: 'East' },
    { value: 'W', label: 'West' },
];

const DOOR_ACTION_OPTIONS = [
    { value: 'open', label: 'Open' },
    { value: 'close', label: 'Close' },
    { value: 'lock', label: 'Lock' },
    { value: 'weld', label: 'Weld' },
];

const DOOR_STATE_OPTIONS = [
    { value: 'open', label: 'Open' },
    { value: 'close', label: 'Close' },
    { value: 'lock', label: 'Lock' },
    { value: 'weld', label: 'Weld' },
];

const BOSS_TYPE_OPTIONS = [
    { value: 'queen', label: 'Queen' },
    { value: 'queenLesser', label: 'Lesser Queen' },
];

const KNOWN_SOUND_KEYS = [
    'pulse_rifle_short', 'pulse_rifle_long', 'motion_tracker_beep',
    'alien_screech', 'alien_hiss', 'door_open', 'door_close',
    'door_weld', 'explosion', 'acid_splash', 'radio_static',
    'vent_hiss', 'distant_thump', 'pipe_groan', 'alert_klaxon',
];

/* ── Helpers ── */

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function uid() {
    return 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/** Parse trigger string like "wave:3" into { type: 'wave', value: '3' } */
function parseTrigger(trigger) {
    if (!trigger || trigger === 'always') return { type: 'always', value: '' };
    const colon = trigger.indexOf(':');
    if (colon === -1) return { type: trigger, value: '' };
    return { type: trigger.slice(0, colon), value: trigger.slice(colon + 1) };
}

/** Build trigger string from type + value */
function buildTrigger(type, value) {
    if (type === 'always') return 'always';
    return `${type}:${value}`;
}

/** Validate a trigger string against the schema pattern */
function validateTrigger(trigger) {
    const pattern = /^(always|time:[0-9]+(\.[0-9]+)?|wave:[0-9]+|pressure:(0(\.[0-9]+)?|1(\.0+)?)|kills:[0-9]+|objective:[0-9]+|stage:(combat|intermission|extract|victory|defeat))$/;
    return pattern.test(trigger);
}

/* ── Param definitions per action type ── */

const ACTION_PARAM_DEFS = {
    spawn_pack: [
        { key: 'count', label: 'Count', type: 'number', default: 3 },
        { key: 'types', label: 'Enemy types (comma-sep)', type: 'text', default: 'warrior' },
        { key: 'sector', label: 'Sector (N/S/E/W)', type: 'text', default: '', options: DIRECTION_OPTIONS },
    ],
    text_cue: [
        { key: 'text', label: 'Text', type: 'text', default: '' },
        { key: 'duration', label: 'Duration (ms)', type: 'number', default: 3000 },
    ],
    cue_text: [
        { key: 'text', label: 'Text', type: 'text', default: '' },
        { key: 'duration', label: 'Duration (ms)', type: 'number', default: 3000 },
    ],
    show_text: [
        { key: 'text', label: 'Text', type: 'text', default: '' },
        { key: 'duration', label: 'Duration (ms)', type: 'number', default: 3000 },
    ],
    set_lighting: [
        { key: 'ambientDarkness', label: 'Ambient (0-1)', type: 'number', default: 0.72 },
        { key: 'torchRange', label: 'Torch Range', type: 'number', default: 560 },
        { key: 'torchConeHalfAngle', label: 'Torch Cone', type: 'number', default: 0.28 },
        { key: 'softRadius', label: 'Soft Radius', type: 'number', default: 220 },
        { key: 'coreAlpha', label: 'Core Alpha', type: 'number', default: 0.9 },
        { key: 'featherLayers', label: 'Feather Layers', type: 'number', default: 14 },
        { key: 'featherSpread', label: 'Feather Spread', type: 'number', default: 1.2 },
        { key: 'featherDecay', label: 'Feather Decay', type: 'number', default: 0.68 },
        { key: 'glowStrength', label: 'Glow Strength', type: 'number', default: 1.15 },
    ],
    set_pressure_grace: [
        { key: 'graceMs', label: 'Grace (ms)', type: 'number', default: 5000 },
    ],
    set_reinforce_caps: [
        { key: 'idle', label: 'Idle cap', type: 'number', default: 4 },
        { key: 'gunfire', label: 'Gunfire cap', type: 'number', default: 6 },
    ],
    set_reinforcement_caps: [
        { key: 'idle', label: 'Idle cap', type: 'number', default: 4 },
        { key: 'gunfire', label: 'Gunfire cap', type: 'number', default: 6 },
    ],
    set_combat_mods: [
        { key: 'speedMult', label: 'Speed mult', type: 'number', default: 1.0 },
        { key: 'damageMult', label: 'Damage mult', type: 'number', default: 1.0 },
    ],
    morale_delta: [
        { key: 'delta', label: 'Delta', type: 'number', default: -10 },
    ],
    panic_delta: [
        { key: 'delta', label: 'Delta', type: 'number', default: 10 },
    ],
    door_thump: [
        { key: 'intensity', label: 'Intensity (0-1)', type: 'number', default: 0.5 },
    ],
    thump: [
        { key: 'intensity', label: 'Intensity (0-1)', type: 'number', default: 0.5 },
    ],
    door_action: [
        { key: 'doorId', label: 'Door ID', type: 'text', default: '', optionsSource: 'doorIds' },
        { key: 'action', label: 'Action', type: 'text', default: 'open', options: DOOR_ACTION_OPTIONS },
    ],
    door_state: [
        { key: 'doorId', label: 'Door ID', type: 'text', default: '', optionsSource: 'doorIds' },
        { key: 'state', label: 'State', type: 'text', default: 'open', options: DOOR_STATE_OPTIONS },
    ],
    edge_cue: [
        { key: 'dir', label: 'Direction', type: 'text', default: 'N', options: DIRECTION_OPTIONS },
        { key: 'text', label: 'Text', type: 'text', default: '' },
    ],
    trigger_tracker: [],
    start_tracker: [],
    spawn_queen: [
        { key: 'sector', label: 'Sector', type: 'text', default: '', options: DIRECTION_OPTIONS },
    ],
    spawn_boss: [
        { key: 'type', label: 'Boss type', type: 'text', default: 'queen', options: BOSS_TYPE_OPTIONS },
        { key: 'sector', label: 'Sector', type: 'text', default: '', options: DIRECTION_OPTIONS },
    ],
};

/* ── State management ── */

function defaultMissionState() {
    const tilemaps = clone(Array.isArray(TILED_MAP_TEMPLATES) ? TILED_MAP_TEMPLATES : []);
    const tilemapIds = new Set(tilemaps.map((map) => String(map?.id || '')).filter(Boolean));
    const fallbackMapId = tilemaps[0]?.id || '';
    const missions = MISSION_SET
        .filter((mission) => /^m\d+$/i.test(String(mission?.id || '')))
        .map((mission) => ({
            id: String(mission.id),
            name: String(mission.name || mission.id),
            mapId: tilemapIds.has(String(mission.tilemapId || '')) ? String(mission.tilemapId) : fallbackMapId,
            objective: String(mission.objective || ''),
            difficulty: String(mission.difficulty || 'normal'),
            enemyBudget: Number(mission.enemyBudget) || 0,
            requiredCards: Number(mission.requiredCards) || 0,
            requiredTerminals: Number(mission.requiredTerminals) || 0,
            notes: '',
            director: {},
        }));
    return {
        tilemaps,
        missions,
        directorEvents: [],
        audioCues: [],
        nodeGraphs: [],
        missionGraph: { nodes: [], edges: [] },
    };
}

async function loadAvailableTilemaps() {
    const fallback = clone(Array.isArray(TILED_MAP_TEMPLATES) ? TILED_MAP_TEMPLATES : []);
    try {
        const resp = await API.apiFetch('/api/maps');
        const data = await resp.json();
        if (!data?.ok || !Array.isArray(data.maps)) return fallback;
        const templateById = new Map(fallback.map((map) => [String(map?.id || map?.name || ''), map]));
        return data.maps.map((entry) => {
            const id = String(entry?.name || '').trim();
            const template = templateById.get(id) || {};
            return {
                ...template,
                id,
                name: String(template?.name || id),
            };
        });
    } catch {
        return fallback;
    }
}

function normalizeState(raw) {
    const base = defaultMissionState();
    const src = raw && typeof raw === 'object' ? raw : {};
    const tilemaps = Array.isArray(availableTilemaps) && availableTilemaps.length ? availableTilemaps : base.tilemaps;
    const tilemapIds = new Set(tilemaps.map((map) => String(map?.id || '')).filter(Boolean));
    const defaultMissionMapIds = new Map(base.missions.map((mission) => [String(mission.id), String(mission.mapId || '')]));
    const fallbackMapId = tilemaps[0]?.id || base.tilemaps[0]?.id || '';
    const missions = Array.isArray(src.missions) && src.missions.length ? src.missions : base.missions;
    return {
        ...base,
        ...src,
        tilemaps,
        missions: missions.map((mission, index) => {
            const baseMission = base.missions[index] || {};
            const missionId = String(mission?.id || baseMission.id || `m${index + 1}`);
            const requestedMapId = String(mission?.mapId || '').trim();
            const normalizedMapId = tilemapIds.has(requestedMapId)
                ? requestedMapId
                : (defaultMissionMapIds.get(missionId) && tilemapIds.has(defaultMissionMapIds.get(missionId))
                    ? defaultMissionMapIds.get(missionId)
                    : fallbackMapId);
            return {
                ...baseMission,
                ...mission,
                id: missionId,
                mapId: normalizedMapId,
            };
        }),
        directorEvents: Array.isArray(src.directorEvents) ? src.directorEvents : base.directorEvents,
        audioCues: Array.isArray(src.audioCues) ? src.audioCues : base.audioCues,
        nodeGraphs: Array.isArray(src.nodeGraphs) ? src.nodeGraphs : base.nodeGraphs,
        missionGraph: src.missionGraph && typeof src.missionGraph === 'object' ? src.missionGraph : base.missionGraph,
    };
}

async function loadEditorState() {
    availableTilemaps = await loadAvailableTilemaps();
    const resp = await API.apiFetch('/api/editor-state');
    const data = await resp.json();
    editorState = normalizeState(data?.state);
    dirty = false;
    API.setDirty(false);
}

/* ── Collect state from DOM ── */

function collectMissionRows() {
    const rows = [...rootEl.querySelectorAll('[data-mission-row]')];
    return rows.map((row, index) => {
        const mission = editorState.missions[index] || {};
        const next = {
            ...mission,
            id: row.dataset.missionId || mission.id || `m${index + 1}`,
            name: row.querySelector('[data-field="name"]').value.trim(),
            mapId: row.querySelector('[data-field="mapId"]').value,
            objective: row.querySelector('[data-field="objective"]').value.trim(),
            difficulty: row.querySelector('[data-field="difficulty"]').value,
            enemyBudget: Number(row.querySelector('[data-field="enemyBudget"]').value) || 0,
            requiredCards: Number(row.querySelector('[data-field="requiredCards"]').value) || 0,
            requiredTerminals: Number(row.querySelector('[data-field="requiredTerminals"]').value) || 0,
            notes: row.querySelector('[data-field="notes"]').value.trim(),
            director: { ...(mission.director || {}) },
        };
        for (const [key] of DIRECTOR_FIELDS) {
            const value = row.querySelector(`[data-field="${key}"]`).value;
            if (value === '') delete next.director[key];
            else next.director[key] = Number(value);
        }
        return next;
    });
}

function collectDirectorEventsFromCards() {
    const cards = rootEl.querySelectorAll('[data-event-card]');
    const events = [];
    for (const card of cards) {
        const triggerType = card.querySelector('[data-evt="triggerType"]')?.value || 'always';
        const triggerValue = card.querySelector('[data-evt="triggerValue"]')?.value || '';
        const trigger = buildTrigger(triggerType, triggerValue);
        const action = card.querySelector('[data-evt="action"]')?.value || 'text_cue';
        const enabled = card.querySelector('[data-evt="enabled"]')?.checked ?? true;
        const cooldownMs = Number(card.querySelector('[data-evt="cooldownMs"]')?.value) || 0;
        const repeatMs = Number(card.querySelector('[data-evt="repeatMs"]')?.value) || 0;
        const maxFires = Number(card.querySelector('[data-evt="maxFires"]')?.value) || 0;
        const chance = Number(card.querySelector('[data-evt="chance"]')?.value);
        const id = card.dataset.eventId || uid();

        // Collect params
        const params = {};
        const paramInputs = card.querySelectorAll('[data-param]');
        for (const input of paramInputs) {
            const key = input.dataset.param;
            if (input.type === 'number') {
                const v = input.value.trim();
                if (v !== '') params[key] = Number(v);
            } else {
                const v = input.value.trim();
                if (v !== '') params[key] = v;
            }
        }

        events.push({
            id,
            trigger,
            action,
            enabled,
            cooldownMs,
            repeatMs,
            maxFires,
            chance: Number.isFinite(chance) ? chance : 100,
            params: Object.keys(params).length ? params : {},
        });
    }
    return events;
}

function collectAudioCuesFromCards() {
    const cards = rootEl.querySelectorAll('[data-cue-card]');
    const cues = [];
    for (const card of cards) {
        const id = card.dataset.cueId || uid();
        const textCue = card.querySelector('[data-cue="textCue"]')?.value?.trim() || '';
        const priority = Number(card.querySelector('[data-cue="priority"]')?.value) || 0;

        cues.push({ id, textCue, priority });
    }
    return cues;
}

function collectEditorStateFromDom() {
    return {
        ...editorState,
        missions: collectMissionRows(),
        directorEvents: collectDirectorEventsFromCards(),
        audioCues: collectAudioCuesFromCards(),
    };
}

async function collectFreshEditorStateFromDom() {
    let latest = editorState;
    try {
        const resp = await API.apiFetch('/api/editor-state');
        const data = await resp.json();
        latest = normalizeState(data?.state || data || {});
    } catch {
        latest = editorState;
    }

    return {
        ...latest,
        missions: collectMissionRows(),
        directorEvents: collectDirectorEventsFromCards(),
        audioCues: collectAudioCuesFromCards(),
    };
}

/* ── Metrics / validation ── */

function buildMetrics(state) {
    const pkg = buildPackageFromEditorState(state);
    const errors = validateMissionPackageShape(pkg);
    const quality = analyzeMissionPackageQuality(pkg);
    return { pkg, errors, quality };
}

/* ── Card validation helpers ── */

function getEventWarnings(evt) {
    const warnings = [];
    if (!evt.id) warnings.push('Missing event ID');
    if (!EVENT_ACTIONS.includes(evt.action)) warnings.push(`Unknown action: ${evt.action}`);
    if (!validateTrigger(evt.trigger)) warnings.push(`Invalid trigger: ${evt.trigger}`);
    return warnings;
}

function getCueWarnings(cue) {
    const warnings = [];
    if (!cue.id) warnings.push('Missing cue ID');
    if (!cue.textCue) warnings.push('Missing text cue');
    return warnings;
}

/* ── Drag reorder ── */

let dragSrcEl = null;
let dragListType = null;

function setupDragHandlers(container, listType) {
    const cards = container.querySelectorAll(`[data-${listType}-card]`);
    for (const card of cards) {
        const handle = card.querySelector('.drag-handle');
        if (!handle) continue;

        handle.addEventListener('mousedown', () => {
            card.setAttribute('draggable', 'true');
        });
        handle.addEventListener('mouseup', () => {
            card.removeAttribute('draggable');
        });

        card.addEventListener('dragstart', (e) => {
            dragSrcEl = card;
            dragListType = listType;
            card.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });

        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
            card.removeAttribute('draggable');
            dragSrcEl = null;
            dragListType = null;
            // Remove all drag-over highlights
            for (const c of container.querySelectorAll(`[data-${listType}-card]`)) {
                c.style.borderTopColor = '';
            }
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragListType !== listType) return;
            // Highlight drop position
            for (const c of container.querySelectorAll(`[data-${listType}-card]`)) {
                c.style.borderTopColor = '';
            }
            card.style.borderTopColor = 'var(--accent)';
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dragSrcEl || dragSrcEl === card || dragListType !== listType) return;

            // Determine order
            const parent = card.parentNode;
            const allCards = [...parent.querySelectorAll(`[data-${listType}-card]`)];
            const srcIdx = allCards.indexOf(dragSrcEl);
            const dstIdx = allCards.indexOf(card);

            if (srcIdx < dstIdx) {
                parent.insertBefore(dragSrcEl, card.nextSibling);
            } else {
                parent.insertBefore(dragSrcEl, card);
            }

            card.style.borderTopColor = '';
            markDirty();
        });
    }
}

function markDirty() {
    dirty = true;
    API.setDirty(true);
}

/* ── Render helpers ── */

function renderTriggerInputs(triggerStr) {
    const { type, value } = parseTrigger(triggerStr);
    const typeSelect = `<select data-evt="triggerType" style="width:120px;">
        ${EVENT_TRIGGER_TYPES.map((t) =>
            `<option value="${t.value}" ${t.value === type ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
        ).join('')}
    </select>`;

    let valueInput = '';
    if (type === 'always') {
        valueInput = '<input type="hidden" data-evt="triggerValue" value="">';
    } else if (type === 'stage') {
        valueInput = `<select data-evt="triggerValue" style="width:110px;">
            ${STAGE_VALUES.map((s) => `<option value="${s}" ${s === value ? 'selected' : ''}>${s}</option>`).join('')}
        </select>`;
    } else {
        const step = type === 'pressure' ? '0.01' : '1';
        valueInput = `<input type="number" data-evt="triggerValue" value="${escapeHtml(value)}" step="${step}" style="width:70px;" placeholder="value">`;
    }

    return `<div class="field-row gap-4">${typeSelect}${valueInput}</div>`;
}

function renderParamsSection(action, params) {
    const defs = ACTION_PARAM_DEFS[action] || [];
    if (defs.length === 0) {
        return '<div class="field-hint">No parameters for this action.</div>';
    }
    return defs.map((def) => {
        const val = params?.[def.key] ?? def.default ?? '';
        return `<div class="field-row gap-4" style="margin-bottom:4px;">
            <label style="width:130px;flex-shrink:0;">${escapeHtml(def.label)}</label>
            ${renderParamInput(def, val)}
        </div>`;
    }).join('');
}

function renderParamInput(def, value) {
    if (def.optionsSource === 'doorIds') {
        const options = buildDoorIdOptions(value);
        return renderSelectInput(def.key, value, [
            { value: '', label: options.length ? 'Select runtime door...' : 'No runtime doors found' },
            ...options,
        ]);
    }
    if (Array.isArray(def.options) && def.options.length) {
        return renderSelectInput(def.key, value, normalizeSelectOptions(def.options, value));
    }
    const inputType = def.type === 'number' ? 'number' : 'text';
    return `<input type="${inputType}" data-param="${escapeHtml(def.key)}" value="${escapeHtml(String(value))}" style="flex:1;min-width:60px;">`;
}

function renderSelectInput(key, value, options) {
    return `<select data-param="${escapeHtml(key)}" style="flex:1;min-width:60px;">${options.map((option) => {
        const optionValue = String(option?.value ?? '');
        const optionLabel = String(option?.label ?? optionValue);
        return `<option value="${escapeHtml(optionValue)}" ${String(value ?? '') === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
    }).join('')}</select>`;
}

function normalizeSelectOptions(options, selectedValue) {
    const normalized = [];
    const seen = new Set();
    for (const option of options) {
        const value = String(option?.value ?? option ?? '');
        if (seen.has(value)) continue;
        seen.add(value);
        normalized.push({ value, label: String(option?.label ?? value) });
    }
    const selected = String(selectedValue ?? '');
    if (selected && !seen.has(selected)) {
        normalized.push({ value: selected, label: `${selected} (custom)` });
    }
    return normalized;
}

function buildDoorIdOptions(selectedValue = '') {
    return normalizeSelectOptions(collectRuntimeDoorIdOptions(editorState), selectedValue).sort(compareRuntimeDoorIds);
}

function collectRuntimeDoorIdOptions(state) {
    const tilemaps = Array.isArray(state?.tilemaps) ? state.tilemaps : [];
    const ids = new Map();
    for (const tilemap of tilemaps) {
        const components = collectDoorComponents(tilemap?.doors);
        let index = 0;
        for (const component of components) {
            if (!getDoorOrientation(component.tiles)) continue;
            const value = `auto_door_${index + 1}`;
            if (!ids.has(value)) ids.set(value, { value, label: value });
            index += 1;
        }
    }
    return [...ids.values()];
}

function compareRuntimeDoorIds(a, b) {
    const aValue = String(a?.value ?? a ?? '');
    const bValue = String(b?.value ?? b ?? '');
    const aMatch = aValue.match(/^auto_door_(\d+)$/);
    const bMatch = bValue.match(/^auto_door_(\d+)$/);
    if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
    if (aMatch) return -1;
    if (bMatch) return 1;
    return aValue.localeCompare(bValue);
}

function collectDoorComponents(doorGrid) {
    if (!Array.isArray(doorGrid) || !doorGrid.length || !Array.isArray(doorGrid[0])) return [];
    const h = doorGrid.length;
    const w = doorGrid[0].length;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const groups = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const value = Number(doorGrid[y]?.[x]) || 0;
            if (value <= 0 || visited[y][x]) continue;
            const queue = [{ x, y }];
            const tiles = [];
            visited[y][x] = true;
            while (queue.length) {
                const current = queue.shift();
                tiles.push(current);
                const neighbors = [
                    { x: current.x + 1, y: current.y },
                    { x: current.x - 1, y: current.y },
                    { x: current.x, y: current.y + 1 },
                    { x: current.x, y: current.y - 1 },
                ];
                for (const neighbor of neighbors) {
                    if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= w || neighbor.y >= h) continue;
                    if (visited[neighbor.y][neighbor.x]) continue;
                    if ((Number(doorGrid[neighbor.y]?.[neighbor.x]) || 0) !== value) continue;
                    visited[neighbor.y][neighbor.x] = true;
                    queue.push(neighbor);
                }
            }
            tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            groups.push({ value, tiles });
        }
    }
    return groups;
}

function getDoorOrientation(tiles) {
    if (!Array.isArray(tiles) || tiles.length !== 2) return '';
    const [a, b] = tiles;
    if (a.x === b.x && Math.abs(a.y - b.y) === 1) return 'vertical';
    if (a.y === b.y && Math.abs(a.x - b.x) === 1) return 'horizontal';
    return '';
}

function renderEventCard(evt, index) {
    const { type: trigType } = parseTrigger(evt.trigger || 'always');
    const warnings = getEventWarnings(evt);
    const warningHtml = warnings.length
        ? `<div style="margin-top:6px;">${warnings.map((w) => `<div class="small" style="color:var(--yellow);">${escapeHtml(w)}</div>`).join('')}</div>`
        : '';
    const enabled = evt.enabled !== false;

    return `
    <div class="card" data-event-card data-event-id="${escapeHtml(evt.id || '')}" style="margin-bottom:8px;border-top:2px solid transparent;${!enabled ? 'opacity:0.55;' : ''}">
        <div class="flex-between" style="margin-bottom:8px;">
            <div class="flex-row gap-4">
                <span class="drag-handle" style="cursor:grab;color:var(--text-dim);font-size:14px;user-select:none;" title="Drag to reorder">\u2261</span>
                <span class="badge">#${index + 1}</span>
                <span class="kbd" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(evt.id || 'unnamed')}</span>
            </div>
            <div class="flex-row gap-4">
                <label style="font-size:11px;"><input type="checkbox" data-evt="enabled" ${enabled ? 'checked' : ''}> On</label>
                <button class="btn btn-ghost btn-sm" data-action="duplicate-event" title="Duplicate">+</button>
                <button class="btn btn-ghost btn-sm" data-action="delete-event" style="color:var(--red);" title="Delete">\u00d7</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="field">
                <span class="field-label">Action</span>
                <select data-evt="action">
                    ${EVENT_ACTIONS.map((a) => `<option value="${a}" ${a === evt.action ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
                </select>
            </div>
            <div class="field">
                <span class="field-label">Trigger</span>
                ${renderTriggerInputs(evt.trigger || 'always')}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px;">
            <div class="field">
                <span class="field-label">Cooldown ms</span>
                <input type="number" data-evt="cooldownMs" value="${evt.cooldownMs || 0}" min="0" step="100">
            </div>
            <div class="field">
                <span class="field-label">Repeat ms</span>
                <input type="number" data-evt="repeatMs" value="${evt.repeatMs || 0}" min="0" step="100">
            </div>
            <div class="field">
                <span class="field-label">Max fires</span>
                <input type="number" data-evt="maxFires" value="${evt.maxFires || 0}" min="0">
            </div>
            <div class="field">
                <span class="field-label">Chance %</span>
                <input type="number" data-evt="chance" value="${Number.isFinite(evt.chance) ? evt.chance : 100}" min="0" max="100">
            </div>
        </div>

        <div class="field" style="margin-bottom:4px;">
            <span class="field-label">Parameters</span>
            <div data-params-container>${renderParamsSection(evt.action, evt.params)}</div>
        </div>
        ${warningHtml}
    </div>`;
}

function renderCueCard(cue, index) {
    const warnings = getCueWarnings(cue);
    const warningHtml = warnings.length
        ? `<div style="margin-top:6px;">${warnings.map((w) => `<div class="small" style="color:var(--yellow);">${escapeHtml(w)}</div>`).join('')}</div>`
        : '';

    return `
    <div class="card" data-cue-card data-cue-id="${escapeHtml(cue.id || '')}" style="margin-bottom:8px;border-top:2px solid transparent;">
        <div class="flex-between" style="margin-bottom:8px;">
            <div class="flex-row gap-4">
                <span class="drag-handle" style="cursor:grab;color:var(--text-dim);font-size:14px;user-select:none;" title="Drag to reorder">\u2261</span>
                <span class="badge">#${index + 1}</span>
                <span class="kbd" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(cue.id || 'unnamed')}</span>
            </div>
            <div class="flex-row gap-4">
                <button class="btn btn-ghost btn-sm" data-action="duplicate-cue" title="Duplicate">+</button>
                <button class="btn btn-ghost btn-sm" data-action="delete-cue" style="color:var(--red);" title="Delete">\u00d7</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div class="field">
                <span class="field-label">Text Cue</span>
                <input type="text" data-cue="textCue" value="${escapeHtml(cue.textCue || '')}" placeholder="e.g. CONTACT NORTH">
            </div>
            <div class="field">
                <span class="field-label">Priority (0-10)</span>
                <input type="number" data-cue="priority" value="${cue.priority || 0}" min="0" max="10">
            </div>
        </div>
        ${warningHtml}
    </div>`;
}

/* ── Summary panel ── */

function renderSummary(state) {
    const { pkg, errors, quality } = buildMetrics(state);
    const qualityTone = errors.length ? 'badge-red' : (quality.warnings.length ? 'badge-yellow' : 'badge-green');
    const warningList = quality.warnings.length
        ? quality.warnings.map((warning) => `<div class="small" style="margin-top:4px">${escapeHtml(warning)}</div>`).join('')
        : '<div class="small">No quality warnings.</div>';
    const errorList = errors.length
        ? errors.map((error) => `<div class="small" style="margin-top:4px;color:var(--red)">${escapeHtml(error)}</div>`).join('')
        : '<div class="small">Package shape is valid.</div>';

    return `
        <div class="panel" style="margin-bottom:12px;">
            <div class="panel-header">Package Status</div>
            <div class="panel-body">
                <div class="flex-between" style="margin-bottom:8px;">
                    <span class="badge ${qualityTone}">Quality ${quality.score}</span>
                    <span class="small">${pkg.missions.length} missions | ${pkg.maps.length} maps</span>
                </div>
                <div class="small">Events: ${(pkg.directorEvents || []).length}</div>
                <div class="small">Cues: ${(pkg.audioCues || []).length}</div>
                <hr class="divider">
                <div class="field-label">Validation</div>
                ${errorList}
                <hr class="divider">
                <div class="field-label">Quality</div>
                ${warningList}
            </div>
        </div>
    `;
}

/* ── Main render ── */

function render() {
    if (!rootEl || !editorState) return;
    const missionRows = editorState.missions.map((mission) => `
        <tr data-mission-row data-mission-id="${escapeHtml(mission.id)}">
            <td><span class="kbd">${escapeHtml(mission.id)}</span></td>
            <td><input type="text" data-field="name" value="${escapeHtml(mission.name || '')}"></td>
            <td>
                <select data-field="mapId">
                    ${editorState.tilemaps.map((map) => {
                        const id = String(map?.id || '');
                        const name = String(map?.name || id);
                        const selected = id === String(mission.mapId || '') ? 'selected' : '';
                        return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(name)}</option>`;
                    }).join('')}
                </select>
            </td>
            <td><input type="text" data-field="objective" value="${escapeHtml(mission.objective || '')}"></td>
            <td>
                <select data-field="difficulty">
                    ${['normal', 'hard', 'extreme'].map((value) => `<option value="${value}" ${value === mission.difficulty ? 'selected' : ''}>${value}</option>`).join('')}
                </select>
            </td>
            <td><input type="number" min="0" data-field="enemyBudget" value="${Number(mission.enemyBudget) || 0}"></td>
            <td><input type="number" min="0" max="8" data-field="requiredCards" value="${Number(mission.requiredCards) || 0}"></td>
            <td><input type="number" min="0" max="8" data-field="requiredTerminals" value="${Number(mission.requiredTerminals) || 0}"></td>
            ${DIRECTOR_FIELDS.map(([key]) => `<td><input type="number" min="0" data-field="${key}" value="${mission.director?.[key] ?? ''}"></td>`).join('')}
            <td><input type="text" data-field="notes" value="${escapeHtml(mission.notes || '')}"></td>
        </tr>
    `).join('');

    const eventsArr = editorState.directorEvents || [];
    const cuesArr = editorState.audioCues || [];

    const eventsCards = eventsArr.length
        ? eventsArr.map((evt, i) => renderEventCard(evt, i)).join('')
        : '<div class="empty-state"><div class="empty-state-icon">&#x26A1;</div>No director events. Click "Add Event" to create one.</div>';

    const cuesCards = cuesArr.length
        ? cuesArr.map((cue, i) => renderCueCard(cue, i)).join('')
        : '<div class="empty-state"><div class="empty-state-icon">&#x1F50A;</div>No audio cues. Click "Add Cue" to create one.</div>';

    const eventsJsonPanel = showEventsJson
        ? `<div class="panel" style="margin-top:8px;">
            <div class="panel-header">Director Events JSON (read-only)</div>
            <div class="panel-body">
                <textarea readonly rows="12" spellcheck="false" style="width:100%;opacity:0.8;">${escapeHtml(JSON.stringify(eventsArr, null, 2))}</textarea>
            </div>
        </div>`
        : '';

    const cuesJsonPanel = showCuesJson
        ? `<div class="panel" style="margin-top:8px;">
            <div class="panel-header">Audio Cues JSON (read-only)</div>
            <div class="panel-body">
                <textarea readonly rows="10" spellcheck="false" style="width:100%;opacity:0.8;">${escapeHtml(JSON.stringify(cuesArr, null, 2))}</textarea>
            </div>
        </div>`
        : '';

    rootEl.innerHTML = `
        <div class="layout-three" style="height:100%;">
            <aside class="sidebar p-12">
                ${renderSummary(editorState)}
                <div class="panel">
                    <div class="panel-header">Actions</div>
                    <div class="panel-body flex-col">
                        <button class="btn btn-primary" id="missions-save-state">Save Editor State</button>
                        <button class="btn btn-secondary" id="missions-validate">Validate Package</button>
                        <button class="btn btn-secondary" id="missions-publish">Publish Package</button>
                        <button class="btn btn-ghost" id="missions-reload">Reload From Disk</button>
                        <hr class="divider">
                        <button class="btn btn-secondary" id="missions-open-actions">Open Actions Tab</button>
                        <button class="btn btn-ghost" id="missions-open-legacy">Open Legacy Graph Editor</button>
                        <div class="small">Use the live Actions tab for node graph editing in the modular editor. The legacy workspace remains available only for older flows that still need it.</div>
                    </div>
                </div>
            </aside>

            <section class="content-pane">
                <div class="panel" style="margin:12px 12px 0;">
                    <div class="panel-header">Campaign Missions</div>
                    <div class="panel-body" style="overflow:auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Map</th>
                                    <th>Objective</th>
                                    <th>Diff</th>
                                    <th>Budget</th>
                                    <th>Cards</th>
                                    <th>Terms</th>
                                    ${DIRECTOR_FIELDS.map(([, label]) => `<th>${label}</th>`).join('')}
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>${missionRows}</tbody>
                        </table>
                    </div>
                </div>
            </section>

            <aside class="sidebar sidebar-right p-12" style="overflow-y:auto;">
                <div class="panel" style="margin-bottom:12px;">
                    <div class="panel-header">
                        <span>Director Events</span>
                        <div class="flex-row gap-4">
                            <button class="btn btn-ghost btn-sm" id="toggle-events-json" title="Toggle JSON view">{}</button>
                            <button class="btn btn-secondary btn-sm" id="add-event">+ Add Event</button>
                        </div>
                    </div>
                    <div class="panel-body" id="events-card-list">
                        ${eventsCards}
                    </div>
                    ${eventsJsonPanel}
                </div>
                <div class="panel">
                    <div class="panel-header">
                        <span>Audio Cues</span>
                        <div class="flex-row gap-4">
                            <button class="btn btn-ghost btn-sm" id="toggle-cues-json" title="Toggle JSON view">{}</button>
                            <button class="btn btn-secondary btn-sm" id="add-cue">+ Add Cue</button>
                        </div>
                    </div>
                    <div class="panel-body" id="cues-card-list">
                        ${cuesCards}
                    </div>
                    ${cuesJsonPanel}
                </div>
            </aside>
        </div>
    `;

    // Fix mapId selects
    for (const row of rootEl.querySelectorAll('[data-mission-row]')) {
        const mission = editorState.missions.find((entry) => String(entry.id) === row.dataset.missionId);
        if (!mission) continue;
        row.querySelector('[data-field="mapId"]').value = String(mission.mapId || '');
    }

    bindEvents();
    bindCardEvents();
}

/* ── Event binding ── */

function bindEvents() {
    // Mark dirty on any input change (mission table)
    rootEl.querySelectorAll('[data-mission-row] input, [data-mission-row] select').forEach((el) => {
        el.addEventListener('input', () => markDirty());
    });

    rootEl.querySelector('#missions-reload')?.addEventListener('click', async () => {
        await safeAction(async () => {
            await loadEditorState();
            render();
            API.toast('Mission editor reloaded', 'success');
        });
    });

    rootEl.querySelector('#missions-validate')?.addEventListener('click', async () => {
        await safeAction(async () => {
            const next = await collectFreshEditorStateFromDom();
            const { errors, quality } = buildMetrics(next);
            editorState = next;
            render();
            if (errors.length) {
                API.toast(`Validation failed: ${errors[0]}`, 'error', 4500);
            } else if (quality.warnings.length) {
                API.toast(`Valid package, ${quality.warnings.length} quality warning(s)`, 'warning', 4500);
            } else {
                API.toast('Package is valid with no quality warnings', 'success');
            }
        });
    });

    rootEl.querySelector('#missions-save-state')?.addEventListener('click', async () => {
        await safeAction(async () => {
            const next = await collectFreshEditorStateFromDom();
            await API.apiFetch('/api/editor-state', {
                method: 'POST',
                body: JSON.stringify(next),
            });
            editorState = normalizeState(next);
            dirty = false;
            API.recordSave();
            render();
            API.toast('Mission editor state saved', 'success');
        });
    });

    rootEl.querySelector('#missions-publish')?.addEventListener('click', async () => {
        await safeAction(async () => {
            const next = await collectFreshEditorStateFromDom();
            const { pkg, errors, quality } = buildMetrics(next);
            if (errors.length) throw new Error(errors[0]);
            await API.apiFetch('/api/editor-state', {
                method: 'POST',
                body: JSON.stringify(next),
            });
            await API.apiFetch('/api/mission-package', {
                method: 'POST',
                body: JSON.stringify(pkg),
            });
            editorState = normalizeState(next);
            dirty = false;
            API.recordSave();
            render();
            const suffix = quality.warnings.length ? ` with ${quality.warnings.length} quality warning(s)` : '';
            API.toast(`Mission package published${suffix}`, quality.warnings.length ? 'warning' : 'success', 4500);
        });
    });

    rootEl.querySelector('#missions-open-actions')?.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') {
            window.switchTab('story');
        } else {
            API.toast('Actions tab switch is unavailable in this shell', 'error');
        }
    });

    rootEl.querySelector('#missions-open-legacy')?.addEventListener('click', () => {
        window.open('/editors/index.html.old', 'aliens_legacy_editor');
    });

    // Add Event button
    rootEl.querySelector('#add-event')?.addEventListener('click', () => {
        editorState.directorEvents = collectDirectorEventsFromCards();
        editorState.directorEvents.push({
            id: uid(),
            trigger: 'always',
            action: 'text_cue',
            enabled: true,
            cooldownMs: 0,
            repeatMs: 0,
            maxFires: 1,
            chance: 100,
            params: {},
        });
        markDirty();
        render();
        // Scroll to bottom of events list
        const list = rootEl.querySelector('#events-card-list');
        if (list) list.scrollTop = list.scrollHeight;
    });

    // Add Cue button
    rootEl.querySelector('#add-cue')?.addEventListener('click', () => {
        editorState.audioCues = collectAudioCuesFromCards();
        editorState.audioCues.push({
            id: uid(),
            textCue: '',
            priority: 0,
        });
        markDirty();
        render();
        const list = rootEl.querySelector('#cues-card-list');
        if (list) list.scrollTop = list.scrollHeight;
    });

    // Toggle JSON views
    rootEl.querySelector('#toggle-events-json')?.addEventListener('click', () => {
        editorState.directorEvents = collectDirectorEventsFromCards();
        editorState.audioCues = collectAudioCuesFromCards();
        showEventsJson = !showEventsJson;
        render();
    });

    rootEl.querySelector('#toggle-cues-json')?.addEventListener('click', () => {
        editorState.directorEvents = collectDirectorEventsFromCards();
        editorState.audioCues = collectAudioCuesFromCards();
        showCuesJson = !showCuesJson;
        render();
    });
}

function bindCardEvents() {
    const eventsContainer = rootEl.querySelector('#events-card-list');
    const cuesContainer = rootEl.querySelector('#cues-card-list');

    if (eventsContainer) {
        setupDragHandlers(eventsContainer, 'event');

        // Event card interactions
        for (const card of eventsContainer.querySelectorAll('[data-event-card]')) {
            // Mark dirty on any input change in card
            card.querySelectorAll('input, select').forEach((el) => {
                el.addEventListener('input', () => markDirty());
            });

            // Action change -> update params section
            const actionSelect = card.querySelector('[data-evt="action"]');
            if (actionSelect) {
                actionSelect.addEventListener('change', () => {
                    const paramsContainer = card.querySelector('[data-params-container]');
                    if (paramsContainer) {
                        paramsContainer.innerHTML = renderParamsSection(actionSelect.value, {});
                        // Bind dirty on new inputs
                        paramsContainer.querySelectorAll('input, select').forEach((el) => {
                            el.addEventListener('input', () => markDirty());
                        });
                    }
                    markDirty();
                });
            }

            // Trigger type change -> update value input
            const triggerTypeSelect = card.querySelector('[data-evt="triggerType"]');
            if (triggerTypeSelect) {
                triggerTypeSelect.addEventListener('change', () => {
                    const type = triggerTypeSelect.value;
                    const row = triggerTypeSelect.closest('.field-row');
                    // Remove existing value input
                    const existingValue = row.querySelector('[data-evt="triggerValue"]');
                    if (existingValue) existingValue.remove();
                    // Add new one
                    let newInput;
                    if (type === 'always') {
                        newInput = document.createElement('input');
                        newInput.type = 'hidden';
                        newInput.dataset.evt = 'triggerValue';
                        newInput.value = '';
                    } else if (type === 'stage') {
                        newInput = document.createElement('select');
                        newInput.dataset.evt = 'triggerValue';
                        newInput.style.width = '110px';
                        newInput.innerHTML = STAGE_VALUES.map((s) => `<option value="${s}">${s}</option>`).join('');
                    } else {
                        newInput = document.createElement('input');
                        newInput.type = 'number';
                        newInput.dataset.evt = 'triggerValue';
                        newInput.style.width = '70px';
                        newInput.placeholder = 'value';
                        if (type === 'pressure') newInput.step = '0.01';
                        else newInput.step = '1';
                    }
                    newInput.addEventListener('input', () => markDirty());
                    row.appendChild(newInput);
                    markDirty();
                });
            }

            // Delete event
            card.querySelector('[data-action="delete-event"]')?.addEventListener('click', () => {
                editorState.directorEvents = collectDirectorEventsFromCards();
                const evtId = card.dataset.eventId;
                editorState.directorEvents = editorState.directorEvents.filter((e) => e.id !== evtId);
                markDirty();
                render();
            });

            // Duplicate event
            card.querySelector('[data-action="duplicate-event"]')?.addEventListener('click', () => {
                editorState.directorEvents = collectDirectorEventsFromCards();
                const evtId = card.dataset.eventId;
                const src = editorState.directorEvents.find((e) => e.id === evtId);
                if (src) {
                    const dup = clone(src);
                    dup.id = uid();
                    const idx = editorState.directorEvents.indexOf(src);
                    editorState.directorEvents.splice(idx + 1, 0, dup);
                }
                markDirty();
                render();
            });
        }
    }

    if (cuesContainer) {
        setupDragHandlers(cuesContainer, 'cue');

        for (const card of cuesContainer.querySelectorAll('[data-cue-card]')) {
            card.querySelectorAll('input, select').forEach((el) => {
                el.addEventListener('input', () => markDirty());
            });

            // Delete cue
            card.querySelector('[data-action="delete-cue"]')?.addEventListener('click', () => {
                editorState.audioCues = collectAudioCuesFromCards();
                const cueId = card.dataset.cueId;
                editorState.audioCues = editorState.audioCues.filter((c) => c.id !== cueId);
                markDirty();
                render();
            });

            // Duplicate cue
            card.querySelector('[data-action="duplicate-cue"]')?.addEventListener('click', () => {
                editorState.audioCues = collectAudioCuesFromCards();
                const cueId = card.dataset.cueId;
                const src = editorState.audioCues.find((c) => c.id === cueId);
                if (src) {
                    const dup = clone(src);
                    dup.id = uid();
                    const idx = editorState.audioCues.indexOf(src);
                    editorState.audioCues.splice(idx + 1, 0, dup);
                }
                markDirty();
                render();
            });
        }
    }
}

/* ── Safe action wrapper ── */

async function safeAction(fn) {
    try {
        await fn();
    } catch (err) {
        const message = err?.message || 'Operation failed';
        API.setStatus(message, 5000);
        API.toast(message, 'error', 5000);
    }
}

/* ── Module export ── */

export default {
    async render(root) {
        rootEl = root;
        rootEl.innerHTML = `
            <div class="tab-loading">
                <div class="loading-spinner"></div>
                <span>Loading mission editor\u2026</span>
            </div>
        `;
        await safeAction(async () => {
            await loadEditorState();
            render();
        });
    },
    async save() {
        if (!dirty || !rootEl) return;
        const next = collectEditorStateFromDom();
        await API.apiFetch('/api/editor-state', {
            method: 'POST',
            body: JSON.stringify(next),
        });
        editorState = normalizeState(next);
        dirty = false;
        API.setDirty(false);
    },
};
