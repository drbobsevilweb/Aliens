export function normalizeMissionPackage(input) {
    const src = input && typeof input === 'object' ? input : {};
    const version = '1.0';

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
                floorTextureKey: typeof m.floorTextureKey === 'string' ? m.floorTextureKey : 'tile_floor_grill_import',
                wallTextureKey: typeof m.wallTextureKey === 'string' ? m.wallTextureKey : 'tile_wall_corridor_import',
                terrainTextures: Array.isArray(m.terrainTextures) ? m.terrainTextures : [],
                props: Array.isArray(m.props) ? m.props : [],
                lights: Array.isArray(m.lights) ? m.lights.filter(l => l && typeof l === 'object' && typeof l.tileX === 'number' && typeof l.tileY === 'number') : [],
                storyPoints: Array.isArray(m.storyPoints) ? m.storyPoints.filter(sp => sp && typeof sp === 'object' && typeof sp.tileX === 'number' && typeof sp.tileY === 'number').map(sp => ({
                    id: String(sp.id || ''),
                    tileX: Math.round(Number(sp.tileX) || 0),
                    tileY: Math.round(Number(sp.tileY) || 0),
                    title: String(sp.title || 'Story Beat'),
                    note: String(sp.note || ''),
                    kind: String(sp.kind || 'story'),
                    missionId: String(sp.missionId || 'all'),
                })) : [],
                atmosphere: normalizeAtmosphere(m.atmosphere),
                largeTextures: Array.isArray(m.largeTextures) ? m.largeTextures.filter(lt => lt && typeof lt === 'object' && typeof lt.tileX === 'number').map(lt => ({
                    id: String(lt.id || ''),
                    imageKey: String(lt.imageKey || ''),
                    tileX: Math.round(Number(lt.tileX) || 0),
                    tileY: Math.round(Number(lt.tileY) || 0),
                    widthTiles: Math.max(1, Math.round(Number(lt.widthTiles) || 2)),
                    heightTiles: Math.max(1, Math.round(Number(lt.heightTiles) || 2)),
                    depth: typeof lt.depth === 'number' ? lt.depth : 1,
                    opacity: typeof lt.opacity === 'number' ? Math.max(0, Math.min(1, lt.opacity)) : 1,
                })) : [],
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
                requiredCards: clampInt(m.requiredCards, 0, 8, 0),
                requiredTerminals: clampInt(m.requiredTerminals, 0, 8, 0),
                objective: String(m.objective || ''),
                notes: String(m.notes || ''),
                director: normalizeMissionDirectorOverrides(m.director),
            }))
        : [];

    const directorEvents = Array.isArray(src.directorEvents)
        ? src.directorEvents
            .filter((e) => e && typeof e === 'object' && e.id)
            .map((e) => {
                const scoped = normalizeMissionScopes(e);
                const label = String(e.label || '').trim();
                const category = String(e.category || '').trim();
                const notes = String(e.notes || '').trim();
                const chance = Number.isFinite(Number(e.chance)) ? Math.max(0, Math.min(100, Number(e.chance))) : undefined;
                const cooldownMs = Number.isFinite(Number(e.cooldownMs)) ? Math.max(0, Math.round(Number(e.cooldownMs))) : undefined;
                const repeatMs = Number.isFinite(Number(e.repeatMs)) ? Math.max(0, Math.round(Number(e.repeatMs))) : undefined;
                const maxFires = Number.isFinite(Number(e.maxFires)) ? Math.max(0, Math.round(Number(e.maxFires))) : undefined;
                return {
                    id: String(e.id),
                    trigger: String(e.trigger || ''),
                    action: String(e.action || ''),
                    ...(label ? { label } : {}),
                    ...(category ? { category } : {}),
                    ...(notes ? { notes } : {}),
                    ...(e.enabled === false ? { enabled: false } : {}),
                    ...(chance !== undefined ? { chance } : {}),
                    ...(cooldownMs !== undefined ? { cooldownMs } : {}),
                    ...(repeatMs ? { repeatMs } : {}),
                    ...(maxFires ? { maxFires } : {}),
                    params: e.params && typeof e.params === 'object' ? { ...e.params } : {},
                    ...scoped,
                };
            })
        : [];

    const audioCues = Array.isArray(src.audioCues)
        ? src.audioCues
            .filter((c) => c && typeof c === 'object' && c.id)
            .map((c) => {
                const scoped = normalizeMissionScopes(c);
                return {
                    id: String(c.id),
                    textCue: String(c.textCue || ''),
                    ...(Number.isFinite(Number(c.priority)) ? { priority: Math.max(0, Math.min(10, Math.floor(Number(c.priority)))) } : {}),
                    ...scoped,
                };
            })
        : [];

    const nodeGraphs = Array.isArray(src.nodeGraphs)
        ? src.nodeGraphs
            .filter((graph) => graph && typeof graph === 'object' && Array.isArray(graph.nodes))
            .map((graph) => normalizeNodeGraph(graph))
        : [];

    const gameConfig = src.gameConfig && typeof src.gameConfig === 'object' ? src.gameConfig : undefined;
    const hudConfig = src.hudConfig && typeof src.hudConfig === 'object' ? src.hudConfig : undefined;

    const result = { version, maps, missions, directorEvents, audioCues };
    if (nodeGraphs.length > 0) result.nodeGraphs = nodeGraphs;
    if (gameConfig) result.gameConfig = gameConfig;
    if (hudConfig) result.hudConfig = hudConfig;
    return result;
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
    uniqueCheck(pkg?.nodeGraphs, 'nodeGraph');

    for (const m of pkg?.missions || []) {
        if (!mapIds.has(m.mapId)) errors.push(`Mission ${m.id} references unknown mapId ${m.mapId}.`);
        if (m?.director && typeof m.director === 'object') {
            for (const [k, v] of Object.entries(m.director)) {
                if (!Number.isFinite(Number(v))) errors.push(`Mission ${m.id} director.${k} must be numeric.`);
            }
            const d = m.director;
            const inRange = (key, min, max) => {
                if (d[key] === undefined) return true;
                const n = Number(d[key]);
                return Number.isFinite(n) && n >= min && n <= max;
            };
            if (!inRange('idlePressureBaseMs', 500, 60000)) errors.push(`Mission ${m.id} director.idlePressureBaseMs out of range.`);
            if (!inRange('idlePressureMinMs', 500, 60000)) errors.push(`Mission ${m.id} director.idlePressureMinMs out of range.`);
            if (!inRange('gunfireReinforceBaseMs', 500, 60000)) errors.push(`Mission ${m.id} director.gunfireReinforceBaseMs out of range.`);
            if (!inRange('gunfireReinforceMinMs', 500, 60000)) errors.push(`Mission ${m.id} director.gunfireReinforceMinMs out of range.`);
            if (!inRange('reinforceCap', 0, 200)) errors.push(`Mission ${m.id} director.reinforceCap out of range.`);
            if (!inRange('reinforceCapIdle', 0, 200)) errors.push(`Mission ${m.id} director.reinforceCapIdle out of range.`);
            if (!inRange('reinforceCapGunfire', 0, 200)) errors.push(`Mission ${m.id} director.reinforceCapGunfire out of range.`);
            if (!inRange('doorNoiseMemoryMs', 500, 120000)) errors.push(`Mission ${m.id} director.doorNoiseMemoryMs out of range.`);
            if (!inRange('idleSpawnMemoryMs', 500, 120000)) errors.push(`Mission ${m.id} director.idleSpawnMemoryMs out of range.`);
            if (!inRange('waveTransitionGraceMs', 0, 60000)) errors.push(`Mission ${m.id} director.waveTransitionGraceMs out of range.`);
            if (!inRange('inactivityAmbushMs', 1000, 120000)) errors.push(`Mission ${m.id} director.inactivityAmbushMs out of range.`);
            if (!inRange('inactivityAmbushCooldownMs', 500, 120000)) errors.push(`Mission ${m.id} director.inactivityAmbushCooldownMs out of range.`);
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
        if (e.enabled !== undefined && typeof e.enabled !== 'boolean') errors.push(`directorEvent ${e.id} enabled must be boolean.`);
        if (e.chance !== undefined) {
            const chance = Number(e.chance);
            if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
                errors.push(`directorEvent ${e.id} chance must be between 0 and 100.`);
            }
        }
        if (e.cooldownMs !== undefined && (!Number.isFinite(Number(e.cooldownMs)) || Number(e.cooldownMs) < 0)) {
            errors.push(`directorEvent ${e.id} cooldownMs must be >= 0.`);
        }
        if (e.repeatMs !== undefined && (!Number.isFinite(Number(e.repeatMs)) || Number(e.repeatMs) < 0)) {
            errors.push(`directorEvent ${e.id} repeatMs must be >= 0.`);
        }
        if (e.maxFires !== undefined && (!Number.isFinite(Number(e.maxFires)) || Number(e.maxFires) < 1)) {
            errors.push(`directorEvent ${e.id} maxFires must be >= 1.`);
        }
        if (action === 'spawn_pack') {
            const size = Number(e?.params?.size);
            if (Number.isFinite(size) && (size < 1 || size > 16)) errors.push(`directorEvent ${e.id} params.size must be 1-16.`);
        }
        if (action === 'set_pressure_grace') {
            const ms = Number(e?.params?.ms);
            if (!Number.isFinite(ms)) errors.push(`directorEvent ${e.id} params.ms must be numeric.`);
        }
        if (e?.params?.repeatMs !== undefined && !Number.isFinite(Number(e.params.repeatMs))) {
            errors.push(`directorEvent ${e.id} params.repeatMs must be numeric.`);
        }
        if (e?.params?.retryMs !== undefined && !Number.isFinite(Number(e.params.retryMs))) {
            errors.push(`directorEvent ${e.id} params.retryMs must be numeric.`);
        }
        if (e?.params?.maxFires !== undefined) {
            const maxFires = Number(e.params.maxFires);
            if (!Number.isFinite(maxFires) || maxFires < 1) {
                errors.push(`directorEvent ${e.id} params.maxFires must be >= 1.`);
            }
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
        if (action === 'spawn_pack') {
            const dir = String(e?.params?.dir || '').toUpperCase().trim();
            if (dir && !['N', 'S', 'E', 'W'].includes(dir)) errors.push(`directorEvent ${e.id} params.dir must be N/S/E/W.`);
        }
        if (action === 'set_lighting') {
            const darkness = e?.params?.ambientDarkness ?? e?.params?.ambient;
            const range = e?.params?.torchRange;
            const cone = e?.params?.torchConeHalfAngle;
            const softRadius = e?.params?.softRadius;
            const coreAlpha = e?.params?.coreAlpha;
            const featherLayers = e?.params?.featherLayers;
            const featherSpread = e?.params?.featherSpread;
            const featherDecay = e?.params?.featherDecay;
            const glowStrength = e?.params?.glowStrength;
            const hasAny = darkness !== undefined || range !== undefined || cone !== undefined
                || softRadius !== undefined || coreAlpha !== undefined || featherLayers !== undefined
                || featherSpread !== undefined || featherDecay !== undefined || glowStrength !== undefined;
            if (!hasAny) errors.push(`directorEvent ${e.id} set_lighting requires lighting params.`);
            if (darkness !== undefined && !Number.isFinite(Number(darkness))) errors.push(`directorEvent ${e.id} params.ambientDarkness must be numeric.`);
            if (range !== undefined && !Number.isFinite(Number(range))) errors.push(`directorEvent ${e.id} params.torchRange must be numeric.`);
            if (cone !== undefined && !Number.isFinite(Number(cone))) errors.push(`directorEvent ${e.id} params.torchConeHalfAngle must be numeric.`);
            if (softRadius !== undefined && !Number.isFinite(Number(softRadius))) errors.push(`directorEvent ${e.id} params.softRadius must be numeric.`);
            if (coreAlpha !== undefined && !Number.isFinite(Number(coreAlpha))) errors.push(`directorEvent ${e.id} params.coreAlpha must be numeric.`);
            if (featherLayers !== undefined && !Number.isFinite(Number(featherLayers))) errors.push(`directorEvent ${e.id} params.featherLayers must be numeric.`);
            if (featherSpread !== undefined && !Number.isFinite(Number(featherSpread))) errors.push(`directorEvent ${e.id} params.featherSpread must be numeric.`);
            if (featherDecay !== undefined && !Number.isFinite(Number(featherDecay))) errors.push(`directorEvent ${e.id} params.featherDecay must be numeric.`);
            if (glowStrength !== undefined && !Number.isFinite(Number(glowStrength))) errors.push(`directorEvent ${e.id} params.glowStrength must be numeric.`);
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
            let found = false;
            for (const key of keys) {
                if (e?.params?.[key] === undefined) continue;
                found = true;
                if (!Number.isFinite(Number(e.params[key]))) {
                    errors.push(`directorEvent ${e.id} params.${key} must be numeric.`);
                }
            }
            if (!found) errors.push(`directorEvent ${e.id} set_combat_mods requires at least one modifier key.`);
            if (e?.params?.ms !== undefined && !Number.isFinite(Number(e.params.ms))) {
                errors.push(`directorEvent ${e.id} params.ms must be numeric.`);
            }
        }
        if (action === 'edge_cue') {
            const word = String(e?.params?.word || e?.params?.text || '').trim();
            if (!word) errors.push(`directorEvent ${e.id} edge_cue requires params.word or params.text.`);
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
    const cueIds = new Set((pkg?.audioCues || []).map((c) => String(c?.id || '').trim()).filter(Boolean));
    for (const e of pkg?.directorEvents || []) {
        const cueId = String(e?.params?.cueId || e?.params?.audioCueId || '').trim();
        if (!cueId) continue;
        if (!cueIds.has(cueId)) errors.push(`directorEvent ${e.id} references unknown cueId ${cueId}.`);
    }

    for (const graph of pkg?.nodeGraphs || []) {
        if (!graph || typeof graph !== 'object') continue;
        const graphId = String(graph.id || '').trim() || 'unknown';
        const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
        const connections = Array.isArray(graph.connections) ? graph.connections : [];
        if (nodes.length === 0) errors.push(`nodeGraph ${graphId} must contain at least one node.`);

        const nodeIds = new Set();
        let eventCount = 0;
        for (const node of nodes) {
            if (!node || typeof node !== 'object') continue;
            const nodeId = String(node.id || '').trim();
            if (!nodeId) {
                errors.push(`nodeGraph ${graphId} has a node without an id.`);
                continue;
            }
            if (nodeIds.has(nodeId)) errors.push(`nodeGraph ${graphId} has duplicate node id ${nodeId}.`);
            nodeIds.add(nodeId);

            const nodeType = String(node.type || '').trim();
            const data = node.data && typeof node.data === 'object' ? node.data : {};
            if (nodeType === 'event') {
                eventCount += 1;
                if (!String(data.eventName || '').trim()) errors.push(`nodeGraph ${graphId} event node ${nodeId} is missing data.eventName.`);
            }
            if (nodeType === 'action' && !String(data.actionType || '').trim()) {
                errors.push(`nodeGraph ${graphId} action node ${nodeId} is missing data.actionType.`);
            }
        }
        if (eventCount === 0) errors.push(`nodeGraph ${graphId} must contain at least one event node.`);

        for (const connection of connections) {
            const fromNode = String(connection?.fromNode || '').trim();
            const toNode = String(connection?.toNode || '').trim();
            if (!fromNode || !toNode) {
                errors.push(`nodeGraph ${graphId} has a connection missing fromNode/toNode.`);
                continue;
            }
            if (!nodeIds.has(fromNode) || !nodeIds.has(toNode)) {
                errors.push(`nodeGraph ${graphId} connection ${fromNode} -> ${toNode} references a missing node.`);
            }
        }
    }
    return errors;
}

function normalizeAtmosphere(atmo) {
    if (!atmo || typeof atmo !== 'object') return {};
    const out = {};
    if (typeof atmo.ambientDarkness === 'number' && Number.isFinite(atmo.ambientDarkness)) {
        out.ambientDarkness = Math.max(0.45, Math.min(1.0, atmo.ambientDarkness));
    }
    if (typeof atmo.torchRange === 'number' && Number.isFinite(atmo.torchRange)) {
        out.torchRange = Math.max(80, Math.min(1200, atmo.torchRange));
    }
    if (typeof atmo.softRadius === 'number' && Number.isFinite(atmo.softRadius)) {
        out.softRadius = Math.max(10, Math.min(600, atmo.softRadius));
    }
    if (typeof atmo.coreAlpha === 'number' && Number.isFinite(atmo.coreAlpha)) {
        out.coreAlpha = Math.max(0, Math.min(1, atmo.coreAlpha));
    }
    if (typeof atmo.featherLayers === 'number' && Number.isFinite(atmo.featherLayers)) {
        out.featherLayers = Math.max(4, Math.min(24, Math.round(atmo.featherLayers)));
    }
    if (typeof atmo.featherSpread === 'number' && Number.isFinite(atmo.featherSpread)) {
        out.featherSpread = Math.max(0.4, Math.min(2.5, atmo.featherSpread));
    }
    if (typeof atmo.featherDecay === 'number' && Number.isFinite(atmo.featherDecay)) {
        out.featherDecay = Math.max(0.2, Math.min(0.95, atmo.featherDecay));
    }
    if (typeof atmo.glowStrength === 'number' && Number.isFinite(atmo.glowStrength)) {
        out.glowStrength = Math.max(0.1, Math.min(2, atmo.glowStrength));
    }
    if (typeof atmo.dustDensity === 'number' && Number.isFinite(atmo.dustDensity)) {
        out.dustDensity = Math.max(0, Math.min(1, atmo.dustDensity));
    }
    if (typeof atmo.ventHum === 'boolean') out.ventHum = atmo.ventHum;
    if (typeof atmo.pipeGroans === 'boolean') out.pipeGroans = atmo.pipeGroans;
    if (typeof atmo.distantThumps === 'boolean') out.distantThumps = atmo.distantThumps;
    if (typeof atmo.alienChittering === 'boolean') out.alienChittering = atmo.alienChittering;
    return out;
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

function clampNumber(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(min, Math.min(max, n));
}

function normalizeMissionDirectorOverrides(director) {
    if (!director || typeof director !== 'object') return {};
    const out = {};
    const idleBaseMs = clampNumber(director.idlePressureBaseMs, 500, 60000);
    if (idleBaseMs !== undefined) out.idlePressureBaseMs = idleBaseMs;
    const idleMinMs = clampNumber(director.idlePressureMinMs, 500, 60000);
    if (idleMinMs !== undefined) out.idlePressureMinMs = idleMinMs;
    const gunfireBaseMs = clampNumber(director.gunfireReinforceBaseMs, 500, 60000);
    if (gunfireBaseMs !== undefined) out.gunfireReinforceBaseMs = gunfireBaseMs;
    const gunfireMinMs = clampNumber(director.gunfireReinforceMinMs, 500, 60000);
    if (gunfireMinMs !== undefined) out.gunfireReinforceMinMs = gunfireMinMs;
    const reinforceCap = clampInt(director.reinforceCap, 0, 200, -1);
    if (reinforceCap >= 0) out.reinforceCap = reinforceCap;
    const reinforceCapIdle = clampInt(director.reinforceCapIdle, 0, 200, -1);
    if (reinforceCapIdle >= 0) out.reinforceCapIdle = reinforceCapIdle;
    const reinforceCapGunfire = clampInt(director.reinforceCapGunfire, 0, 200, -1);
    if (reinforceCapGunfire >= 0) out.reinforceCapGunfire = reinforceCapGunfire;
    const doorNoiseMemoryMs = clampNumber(director.doorNoiseMemoryMs, 500, 120000);
    if (doorNoiseMemoryMs !== undefined) out.doorNoiseMemoryMs = doorNoiseMemoryMs;
    const idleSpawnMemoryMs = clampNumber(director.idleSpawnMemoryMs, 500, 120000);
    if (idleSpawnMemoryMs !== undefined) out.idleSpawnMemoryMs = idleSpawnMemoryMs;
    const waveTransitionGraceMs = clampNumber(director.waveTransitionGraceMs, 0, 60000);
    if (waveTransitionGraceMs !== undefined) out.waveTransitionGraceMs = waveTransitionGraceMs;
    const inactivityAmbushMs = clampNumber(director.inactivityAmbushMs, 1000, 120000);
    if (inactivityAmbushMs !== undefined) out.inactivityAmbushMs = inactivityAmbushMs;
    const inactivityAmbushCooldownMs = clampNumber(director.inactivityAmbushCooldownMs, 500, 120000);
    if (inactivityAmbushCooldownMs !== undefined) out.inactivityAmbushCooldownMs = inactivityAmbushCooldownMs;
    return out;
}

function normalizeMissionScopes(entry) {
    const out = {};
    const missionId = String(entry?.missionId || entry?.mission || '').trim();
    if (missionId) out.missionId = missionId;
    if (Array.isArray(entry?.missionIds)) {
        const uniq = [];
        const seen = new Set();
        for (const raw of entry.missionIds) {
            const id = String(raw || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            uniq.push(id);
        }
        if (uniq.length > 0) out.missionIds = uniq;
    }
    return out;
}

function normalizeNodeGraph(graph) {
    return {
        id: String(graph.id || 'graph'),
        name: String(graph.name || graph.id || 'Action Graph'),
        enabled: graph.enabled !== false,
        nodes: Array.isArray(graph.nodes)
            ? graph.nodes
                .filter((node) => node && typeof node === 'object' && node.id)
                .map((node) => ({
                    id: String(node.id),
                    type: String(node.type || 'action'),
                    x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
                    y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
                    data: node.data && typeof node.data === 'object' ? { ...node.data } : {},
                }))
            : [],
        connections: Array.isArray(graph.connections)
            ? graph.connections
                .map((connection, index) => normalizeNodeGraphConnection(connection, index))
                .filter(Boolean)
            : [],
    };
}

function normalizeNodeGraphConnection(connection, index) {
    const fromNode = String(connection?.fromNode || connection?.from || '').trim();
    const toNode = String(connection?.toNode || connection?.to || '').trim();
    if (!fromNode || !toNode) return null;
    return {
        id: String(connection?.id || `${fromNode}->${toNode}-${index}`),
        fromNode,
        toNode,
        ...(connection?.fromPort ? { fromPort: String(connection.fromPort) } : {}),
        ...(connection?.toPort ? { toPort: String(connection.toPort) } : {}),
    };
}
