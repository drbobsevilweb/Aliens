export function normalizeMissionPackage(input) {
    const src = input && typeof input === 'object' ? input : {};
    const version = src.version === '1.0' ? '1.0' : '1.0';

    const maps = Array.isArray(src.maps)
        ? src.maps
            .filter((m) => m && typeof m === 'object' && m.id)
            .map((m) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                width: clampInt(m.width, 8, 256, 40),
                height: clampInt(m.height, 8, 256, 26),
                terrain: Array.isArray(m.terrain) ? m.terrain : [],
                doors: Array.isArray(m.doors) ? m.doors : [],
                markers: Array.isArray(m.markers) ? m.markers : [],
            }))
        : [];

    const knownMapIds = new Set(maps.map((m) => m.id));

    const missions = Array.isArray(src.missions)
        ? src.missions
            .filter((m) => m && typeof m === 'object' && m.id)
            .map((m) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                mapId: knownMapIds.has(String(m.mapId)) ? String(m.mapId) : (maps[0]?.id || ''),
                difficulty: normalizeDifficulty(m.difficulty),
                enemyBudget: clampInt(m.enemyBudget, 0, 999, 0),
                objective: String(m.objective || ''),
                notes: String(m.notes || ''),
                director: m.director && typeof m.director === 'object' ? { ...m.director } : {},
            }))
        : [];

    const directorEvents = Array.isArray(src.directorEvents)
        ? src.directorEvents
            .filter((e) => e && typeof e === 'object' && e.id)
            .map((e) => ({
                id: String(e.id),
                trigger: String(e.trigger || ''),
                action: String(e.action || ''),
                params: e.params && typeof e.params === 'object' ? { ...e.params } : {},
                ...(e.missionId ? { missionId: String(e.missionId) } : {}),
                ...(Array.isArray(e.missionIds) ? { missionIds: e.missionIds.map((v) => String(v)) } : {}),
            }))
        : [];

    const audioCues = Array.isArray(src.audioCues)
        ? src.audioCues
            .filter((c) => c && typeof c === 'object' && c.id)
            .map((c) => ({
                id: String(c.id),
                textCue: String(c.textCue || ''),
                ...(Number.isFinite(Number(c.priority)) ? { priority: Math.max(0, Math.min(10, Math.floor(Number(c.priority)))) } : {}),
            }))
        : [];

    return { version, maps, missions, directorEvents, audioCues };
}

export function validateMissionPackageShape(pkg) {
    const errors = [];
    if (!pkg || typeof pkg !== 'object') errors.push('Payload must be an object.');
    if (!Array.isArray(pkg?.maps) || pkg.maps.length === 0) errors.push('At least one map is required.');
    if (!Array.isArray(pkg?.missions) || pkg.missions.length === 0) errors.push('At least one mission is required.');

    const mapIds = new Set((pkg?.maps || []).map((m) => m.id));
    const uniqueCheck = (items, label) => {
        const seen = new Set();
        for (const item of items || []) {
            const id = item && item.id ? String(item.id) : '';
            if (!id) continue;
            if (seen.has(id)) errors.push(`Duplicate ${label} id: ${id}`);
            seen.add(id);
        }
    };
    uniqueCheck(pkg?.maps, 'map');
    uniqueCheck(pkg?.missions, 'mission');
    uniqueCheck(pkg?.directorEvents, 'directorEvent');
    uniqueCheck(pkg?.audioCues, 'audioCue');

    for (const m of pkg?.missions || []) {
        if (!mapIds.has(m.mapId)) errors.push(`Mission ${m.id} references unknown mapId ${m.mapId}.`);
        if (m?.director && typeof m.director === 'object') {
            for (const [k, v] of Object.entries(m.director)) {
                if (!Number.isFinite(Number(v))) errors.push(`Mission ${m.id} director.${k} must be numeric.`);
            }
        }
    }

    const allowedTriggers = new Set(['time', 'wave', 'pressure', 'kills', 'stage', 'objective', 'always']);
    const allowedActions = new Set([
        'spawn_pack',
        'text_cue',
        'cue_text',
        'show_text',
        'door_thump',
        'thump',
        'set_pressure_grace',
        'door_action',
        'door_state',
        'set_reinforce_caps',
        'set_reinforcement_caps',
        'morale_delta',
        'panic_delta',
        'trigger_tracker',
        'start_tracker',
        'spawn_queen',
        'spawn_boss',
    ]);
    const allowedStages = new Set(['combat', 'intermission', 'extract', 'victory', 'defeat']);

    for (const e of pkg?.directorEvents || []) {
        if (!e || typeof e !== 'object') continue;
        if (!String(e.id || '').trim()) errors.push('directorEvent id is required.');
        const trigger = String(e.trigger || '').trim().toLowerCase();
        const action = String(e.action || '').trim().toLowerCase();
        if (!trigger) errors.push(`directorEvent ${e.id} trigger is required.`);
        if (!action) errors.push(`directorEvent ${e.id} action is required.`);
        if (trigger) {
            const [kindRaw, valueRaw = ''] = trigger.split(':', 2);
            const kind = String(kindRaw || '').trim();
            const value = String(valueRaw || '').trim();
            if (!allowedTriggers.has(kind)) errors.push(`directorEvent ${e.id} trigger kind "${kind}" is unsupported.`);
            if (kind === 'time' || kind === 'wave' || kind === 'kills' || kind === 'objective') {
                if (!Number.isFinite(Number(value))) errors.push(`directorEvent ${e.id} trigger value must be numeric.`);
            }
            if (kind === 'pressure') {
                const p = Number(value);
                if (!Number.isFinite(p) || p < 0 || p > 1) errors.push(`directorEvent ${e.id} pressure trigger must be between 0 and 1.`);
            }
            if (kind === 'stage' && !allowedStages.has(value)) {
                errors.push(`directorEvent ${e.id} stage trigger "${value}" is invalid.`);
            }
        }
        if (action && !allowedActions.has(action)) errors.push(`directorEvent ${e.id} action "${action}" is unsupported.`);
        if (e.params && typeof e.params !== 'object') errors.push(`directorEvent ${e.id} params must be an object.`);
        if (action === 'spawn_pack') {
            const size = Number(e?.params?.size);
            if (Number.isFinite(size) && (size < 1 || size > 16)) errors.push(`directorEvent ${e.id} params.size must be 1-16.`);
        }
        if (action === 'set_pressure_grace') {
            const ms = Number(e?.params?.ms);
            if (!Number.isFinite(ms)) errors.push(`directorEvent ${e.id} params.ms must be numeric.`);
        }
        if (action === 'set_reinforce_caps' || action === 'set_reinforcement_caps') {
            const total = e?.params?.total;
            const idle = e?.params?.idle;
            const gunfire = e?.params?.gunfire;
            const hasAny = total !== undefined || idle !== undefined || gunfire !== undefined;
            if (!hasAny) errors.push(`directorEvent ${e.id} set_reinforce_caps requires params.total/idle/gunfire.`);
            if (total !== undefined && !Number.isFinite(Number(total))) errors.push(`directorEvent ${e.id} params.total must be numeric.`);
            if (idle !== undefined && !Number.isFinite(Number(idle))) errors.push(`directorEvent ${e.id} params.idle must be numeric.`);
            if (gunfire !== undefined && !Number.isFinite(Number(gunfire))) errors.push(`directorEvent ${e.id} params.gunfire must be numeric.`);
        }
        if (action === 'morale_delta' || action === 'panic_delta') {
            const amount = Number(e?.params?.amount);
            if (!Number.isFinite(amount)) errors.push(`directorEvent ${e.id} params.amount must be numeric.`);
        }
        if (action === 'trigger_tracker' || action === 'start_tracker') {
            const role = String(e?.params?.role || 'tech').toLowerCase();
            if (!['tech', 'medic', 'heavy', 'leader'].includes(role)) {
                errors.push(`directorEvent ${e.id} params.role must be tech/medic/heavy/leader.`);
            }
            if (e?.params?.force !== undefined && !Number.isFinite(Number(e.params.force))) {
                errors.push(`directorEvent ${e.id} params.force must be numeric (0/1).`);
            }
        }
        if (action === 'door_action' || action === 'door_state') {
            const op = String(e?.params?.op || e?.params?.state || e?.params?.action || '').toLowerCase().trim();
            const validOps = new Set(['open', 'close', 'lock', 'hack', 'weld', 'unweld']);
            if (!validOps.has(op)) errors.push(`directorEvent ${e.id} door action params.op must be open/close/lock/hack/weld/unweld.`);
        }
    }

    for (const c of pkg?.audioCues || []) {
        if (!c || typeof c !== 'object') continue;
        if (!String(c.id || '').trim()) errors.push('audioCue id is required.');
        if (!String(c.textCue || '').trim()) errors.push(`audioCue ${c.id} textCue is required.`);
        if (c.priority !== undefined) {
            const p = Number(c.priority);
            if (!Number.isFinite(p) || p < 0 || p > 10) errors.push(`audioCue ${c.id} priority must be 0-10.`);
        }
    }
    return errors;
}

function normalizeDifficulty(v) {
    if (v === 'hard' || v === 'extreme') return v;
    return 'normal';
}

function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}
