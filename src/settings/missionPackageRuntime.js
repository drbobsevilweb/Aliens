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

export function getMissionDirectorEventsForMission(missionId = '') {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(MISSION_PACKAGE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const events = Array.isArray(parsed?.directorEvents) ? parsed.directorEvents : [];
        const out = [];
        for (const e of events) {
            if (!e || typeof e !== 'object') continue;
            const id = String(e.id || '').trim();
            const trigger = String(e.trigger || '').trim();
            const action = String(e.action || '').trim();
            if (!id || !trigger || !action) continue;
            const scopedMission = e.missionId || e.mission || null;
            const scopedList = Array.isArray(e.missionIds) ? e.missionIds.map((v) => String(v)) : null;
            const include = !missionId
                || (!scopedMission && !scopedList)
                || (scopedMission && String(scopedMission) === String(missionId))
                || (scopedList && scopedList.includes(String(missionId)));
            if (!include) continue;
            out.push({
                id,
                trigger,
                action,
                params: (e.params && typeof e.params === 'object') ? { ...e.params } : {},
            });
        }
        return out;
    } catch {
        return [];
    }
}

export function getMissionAudioCuesForMission(missionId = '') {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(MISSION_PACKAGE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const cues = Array.isArray(parsed?.audioCues) ? parsed.audioCues : [];
        const out = [];
        for (const c of cues) {
            if (!c || typeof c !== 'object') continue;
            const id = String(c.id || '').trim();
            const textCue = String(c.textCue || '').trim();
            if (!id || !textCue) continue;
            const scopedMission = c.missionId || c.mission || null;
            const scopedList = Array.isArray(c.missionIds) ? c.missionIds.map((v) => String(v)) : null;
            const include = !missionId
                || (!scopedMission && !scopedList)
                || (scopedMission && String(scopedMission) === String(missionId))
                || (scopedList && scopedList.includes(String(missionId)));
            if (!include) continue;
            out.push({
                id,
                textCue,
                priority: Number.isFinite(Number(c.priority)) ? Number(c.priority) : 0,
            });
        }
        out.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return out;
    } catch {
        return [];
    }
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

export function getMissionPackageSummary() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem(MISSION_PACKAGE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const maps = Array.isArray(parsed?.maps) ? parsed.maps.length : 0;
        const missions = Array.isArray(parsed?.missions) ? parsed.missions.length : 0;
        const directorEvents = Array.isArray(parsed?.directorEvents) ? parsed.directorEvents.length : 0;
        const audioCues = Array.isArray(parsed?.audioCues) ? parsed.audioCues.length : 0;
        return { maps, missions, directorEvents, audioCues };
    } catch {
        return null;
    }
}

export function isMissionPackageMetaStale() {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
        const rawPkg = window.localStorage.getItem(MISSION_PACKAGE_STORAGE_KEY);
        const rawMeta = window.localStorage.getItem(MISSION_PACKAGE_META_STORAGE_KEY);
        if (!rawPkg || !rawMeta) return false;
        const meta = JSON.parse(rawMeta);
        const expected = Number(meta?.checksum);
        if (!Number.isFinite(expected)) return false;
        return checksumString(rawPkg) !== expected;
    } catch {
        return false;
    }
}

function checksumString(s) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
}
