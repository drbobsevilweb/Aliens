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
        ? src.directorEvents.filter((e) => e && typeof e === 'object' && e.id)
        : [];

    const audioCues = Array.isArray(src.audioCues)
        ? src.audioCues.filter((c) => c && typeof c === 'object' && c.id)
        : [];

    return { version, maps, missions, directorEvents, audioCues };
}

export function validateMissionPackageShape(pkg) {
    const errors = [];
    if (!pkg || typeof pkg !== 'object') errors.push('Payload must be an object.');
    if (!Array.isArray(pkg?.maps) || pkg.maps.length === 0) errors.push('At least one map is required.');
    if (!Array.isArray(pkg?.missions) || pkg.missions.length === 0) errors.push('At least one mission is required.');

    const mapIds = new Set((pkg?.maps || []).map((m) => m.id));
    for (const m of pkg?.missions || []) {
        if (!mapIds.has(m.mapId)) errors.push(`Mission ${m.id} references unknown mapId ${m.mapId}.`);
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
