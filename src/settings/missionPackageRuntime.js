export const MISSION_PACKAGE_STORAGE_KEY = 'aliens_mission_package_v1';
export const MISSION_PACKAGE_META_STORAGE_KEY = 'aliens_mission_package_meta_v1';

const DIRECTOR_KEYS = Object.freeze([
    'idlePressureBaseMs',
    'idlePressureMinMs',
    'gunfireReinforceBaseMs',
    'gunfireReinforceMinMs',
    'reinforceCap',
    'reinforceCapIdle',
    'reinforceCapGunfire',
    'doorNoiseMemoryMs',
    'idleSpawnMemoryMs',
    'waveTransitionGraceMs',
]);

export function getMissionDirectorOverridesForMission(missionId = '') {
    if (!missionId || typeof window === 'undefined' || !window.localStorage) return null;
    let parsed;
    try {
        const raw = window.localStorage.getItem(MISSION_PACKAGE_STORAGE_KEY);
        if (!raw) return null;
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    const missions = Array.isArray(parsed?.missions) ? parsed.missions : [];
    const mission = missions.find((m) => m && String(m.id) === String(missionId));
    if (!mission || !mission.director || typeof mission.director !== 'object') return null;

    const out = {};
    for (const key of DIRECTOR_KEYS) {
        const v = Number(mission.director[key]);
        if (Number.isFinite(v)) out[key] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
}

export function getMissionPackageMeta() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem(MISSION_PACKAGE_META_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const publishedAt = Number(parsed.publishedAt);
        const sizeBytes = Number(parsed.sizeBytes);
        const checksum = Number(parsed.checksum);
        return {
            publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
            sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
            checksum: Number.isFinite(checksum) ? checksum : null,
        };
    } catch {
        return null;
    }
}
