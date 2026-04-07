/**
 * Shared action definitions for the node-based action system.
 * Used by both the editor (property panels) and runtime (ActionDispatcher).
 */

export const ACTION_DEFS = {
    // ── Visual / FX ──
    screen_shake: {
        label: 'Screen Shake',
        category: 'fx',
        params: [
            { key: 'duration', label: 'Duration (ms)', type: 'number', default: 200 },
            { key: 'intensity', label: 'Intensity', type: 'number', default: 0.01 },
        ],
    },
    screen_flash: {
        label: 'Screen Flash',
        category: 'fx',
        params: [
            { key: 'duration', label: 'Duration (ms)', type: 'number', default: 200 },
            { key: 'color', label: 'Color (hex)', type: 'text', default: '0xffffff' },
        ],
    },
    camera_zoom: {
        label: 'Camera Zoom',
        category: 'fx',
        params: [
            { key: 'zoom', label: 'Zoom level', type: 'number', default: 1.0 },
            { key: 'duration', label: 'Duration (ms)', type: 'number', default: 500 },
        ],
    },
    show_text: {
        label: 'Show Floating Text',
        category: 'fx',
        params: [
            { key: 'text', label: 'Text', type: 'text', default: '' },
            { key: 'color', label: 'Color', type: 'text', default: '#ffffff' },
        ],
    },
    show_floating_text: {
        label: 'Show Text at Position',
        category: 'fx',
        params: [
            { key: 'text', label: 'Text', type: 'text', default: '' },
            { key: 'color', label: 'Color', type: 'text', default: '#ffffff' },
            { key: 'x', label: 'X (0=event pos)', type: 'number', default: 0 },
            { key: 'y', label: 'Y (0=event pos)', type: 'number', default: 0 },
        ],
    },
    spawn_decal: {
        label: 'Spawn Floor Decal',
        category: 'fx',
        params: [
            { key: 'type', label: 'Type (acid/scorch)', type: 'text', default: 'acid' },
        ],
    },

    // ── Lighting ──
    set_lighting: {
        label: 'Set Lighting',
        category: 'lighting',
        params: [
            { key: 'ambient', label: 'Ambient (0-1)', type: 'number', default: 0.5 },
            { key: 'tintR', label: 'Tint R (0-1)', type: 'number', default: 1.0 },
            { key: 'tintG', label: 'Tint G (0-1)', type: 'number', default: 1.0 },
            { key: 'tintB', label: 'Tint B (0-1)', type: 'number', default: 1.0 },
        ],
    },
    set_ambient_darkness: {
        label: 'Set Ambient Darkness',
        category: 'lighting',
        params: [
            { key: 'value', label: 'Darkness (0-1)', type: 'number', default: 0.5 },
        ],
    },
    emergency_lighting: {
        label: 'Emergency Lighting',
        category: 'lighting',
        params: [
            { key: 'enabled', label: 'Enabled (1/0)', type: 'number', default: 1 },
        ],
    },

    // ── Audio ──
    play_sound: {
        label: 'Play Sound',
        category: 'audio',
        params: [
            { key: 'key', label: 'Sound key', type: 'text', default: '' },
        ],
    },

    // ── Spawn / Entity ──
    spawn_pack: {
        label: 'Spawn Pack',
        category: 'spawn',
        params: [
            { key: 'size', label: 'Count', type: 'number', default: 3 },
            { key: 'type', label: 'Enemy type', type: 'text', default: 'warrior' },
            { key: 'dir', label: 'Direction (N/S/E/W)', type: 'text', default: '' },
        ],
    },
    spawn_alien: {
        label: 'Spawn Alien',
        category: 'spawn',
        params: [
            { key: 'type', label: 'Type', type: 'text', default: 'warrior' },
            { key: 'count', label: 'Count', type: 'number', default: 1 },
        ],
    },
    spawn_queen: {
        label: 'Spawn Queen',
        category: 'spawn',
        params: [
            { key: 'sector', label: 'Sector', type: 'text', default: '' },
        ],
    },
    kill_all_aliens: {
        label: 'Kill All Aliens',
        category: 'spawn',
        params: [],
    },
    heal_leader: {
        label: 'Heal Leader',
        category: 'entity',
        params: [
            { key: 'amount', label: 'Amount', type: 'number', default: 20 },
        ],
    },
    damage_leader: {
        label: 'Damage Leader',
        category: 'entity',
        params: [
            { key: 'amount', label: 'Amount', type: 'number', default: 10 },
        ],
    },

    // ── Door ──
    door_action: {
        label: 'Door Action',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
            { key: 'action', label: 'Action (open/close/lock/weld)', type: 'text', default: 'open' },
        ],
    },
    open_door: {
        label: 'Open Door',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
        ],
    },
    close_door: {
        label: 'Close Door',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
        ],
    },
    lock_door: {
        label: 'Lock Door',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
        ],
    },
    weld_door: {
        label: 'Weld Door',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
        ],
    },
    breach_door: {
        label: 'Breach Door',
        category: 'door',
        params: [
            { key: 'doorId', label: 'Door ID', type: 'text', default: '' },
        ],
    },

    // ── Combat Director ──
    set_pressure: {
        label: 'Set Pressure',
        category: 'director',
        params: [
            { key: 'value', label: 'Pressure (0-1)', type: 'number', default: 0.5 },
        ],
    },
    set_combat_mods: {
        label: 'Set Combat Mods',
        category: 'director',
        params: [
            { key: 'speedMult', label: 'Speed multiplier', type: 'number', default: 1.0 },
            { key: 'damageMult', label: 'Damage multiplier', type: 'number', default: 1.0 },
        ],
    },
    force_stage: {
        label: 'Force Stage',
        category: 'director',
        params: [
            { key: 'stage', label: 'Stage (combat/intermission/extract)', type: 'text', default: 'combat' },
        ],
    },

    // ── Squad / HUD ──
    follower_callout: {
        label: 'Follower Callout',
        category: 'squad',
        params: [
            { key: 'text', label: 'Callout text', type: 'text', default: 'Contact!' },
        ],
    },
    show_objective: {
        label: 'Show Objective',
        category: 'hud',
        params: [
            { key: 'text', label: 'Objective text', type: 'text', default: '' },
        ],
    },
    show_mission_text: {
        label: 'Show Mission Text',
        category: 'hud',
        params: [
            { key: 'text', label: 'Text', type: 'text', default: '' },
            { key: 'duration', label: 'Duration (ms)', type: 'number', default: 3000 },
        ],
    },
};

/** Ordered list of action type keys */
export const ACTION_TYPE_LIST = Object.keys(ACTION_DEFS);

/** Get param definitions for an action type */
export function getActionParamDefs(actionType) {
    return ACTION_DEFS[actionType]?.params || [];
}

/** Get default values for an action type */
export function getActionDefaults(actionType) {
    const defs = getActionParamDefs(actionType);
    const out = {};
    for (const d of defs) out[d.key] = d.default;
    return out;
}
