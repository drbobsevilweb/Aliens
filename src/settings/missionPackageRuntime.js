import { HUD_CONFIG } from '../data/hudConfig.js';

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
    'inactivityAmbushMs',
    'inactivityAmbushCooldownMs',
]);

let cachedMissionPackage = null;
let cachedPackageMeta = null;

function normalizeSpawnEnemyType(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'auto';
    const key = raw.toLowerCase();
    if (key === 'auto' || key === 'random' || key === 'mixed') return 'auto';
    if (key === 'warrior') return 'warrior';
    if (key === 'drone') return 'drone';
    if (key === 'facehugger') return 'facehugger';
    if (key === 'queenlesser' || key === 'queen_lesser' || key === 'lesserqueen' || key === 'lesser_queen') return 'queenLesser';
    if (key === 'queen') return 'queen';
    return 'auto';
}

function normalizeSpawnPoint(point) {
    if (!point || typeof point !== 'object') return null;
    const tileX = Math.round(Number(point.tileX));
    const tileY = Math.round(Number(point.tileY));
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return null;
    return {
        tileX,
        tileY,
        count: Math.max(1, Math.round(Number(point.count) || 1)),
        enemyType: normalizeSpawnEnemyType(point.enemyType ?? point.spawnType),
        spawnTimeSec: Math.max(0, Number(point.spawnTimeSec ?? point.timer ?? point.spawnTimerSec) || 0),
    };
}

function unwrapApiObjectPayload(payload, key) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload[key] && typeof payload[key] === 'object') return payload[key];
    return payload;
}

export async function initRuntimeOverrides() {
    if (typeof window === 'undefined') return;

    try {
        const pkgRes = await fetch('/api/mission-package');
        if (pkgRes.ok) {
            const raw = await pkgRes.json();
            const unwrapped = unwrapApiObjectPayload(raw, 'package');
            if (unwrapped && typeof unwrapped === 'object' && Array.isArray(unwrapped.maps)) {
                cachedMissionPackage = unwrapped;
            }
        }
    } catch {
        // Fall through
    }

    if (!cachedMissionPackage) {
        try {
            const editorRes = await fetch('/api/editor-state');
            if (editorRes.ok) {
                const rawEditorState = await editorRes.json();
                const editorState = unwrapApiObjectPayload(rawEditorState, 'state');
                if (editorState && typeof editorState === 'object') {
                    const builder = window.buildPackageFromEditorState;
                    if (typeof builder === 'function') {
                        cachedMissionPackage = builder(editorState);
                    } else {
                        const maps = Array.isArray(editorState.tilemaps)
                            ? editorState.tilemaps.map((m) => ({
                                id: String(m?.id || ''),
                                name: String(m?.name || m?.id || ''),
                                width: Number(m?.width) || 40,
                                height: Number(m?.height) || 26,
                                terrain: Array.isArray(m?.terrain) ? m.terrain : [],
                                doors: Array.isArray(m?.doors) ? m.doors : [],
                                markers: Array.isArray(m?.markers) ? m.markers : [],
                                floorTextureKey: typeof m?.floorTextureKey === 'string' ? m.floorTextureKey : 'tile_floor_grill_import',
                                wallTextureKey: typeof m?.wallTextureKey === 'string' ? m.wallTextureKey : 'tile_wall_corridor_import',
                                terrainTextures: Array.isArray(m?.terrainTextures) ? m.terrainTextures : [],
                                props: Array.isArray(m?.props) ? m.props : [],
                                lights: Array.isArray(m?.lights) ? m.lights : [],
                                storyPoints: Array.isArray(m?.storyPoints) ? m.storyPoints : [],
                                spawnPoints: Array.isArray(m?.spawnPoints) ? m.spawnPoints : [],
                                atmosphere: m?.atmosphere && typeof m.atmosphere === 'object' ? { ...m.atmosphere } : {},
                                largeTextures: Array.isArray(m?.largeTextures) ? m.largeTextures : [],
                            }))
                            : [];

                        const knownMapIds = new Set(maps.map((m) => m.id));
                        const missions = Array.isArray(editorState.missions)
                            ? editorState.missions.map((m) => ({
                                id: String(m?.id || ''),
                                name: String(m?.name || m?.id || ''),
                                mapId: knownMapIds.has(String(m?.mapId || '')) ? String(m.mapId) : (maps[0]?.id || ''),
                                difficulty: String(m?.difficulty || 'normal'),
                                enemyBudget: Number(m?.enemyBudget) || 0,
                                requiredCards: Math.max(0, Math.floor(Number(m?.requiredCards) || 0)),
                                requiredTerminals: Math.max(0, Math.floor(Number(m?.requiredTerminals) || 0)),
                                objective: String(m?.objective || ''),
                                notes: String(m?.notes || ''),
                                director: m?.director && typeof m.director === 'object' ? { ...m.director } : {},
                            }))
                            : [];
                        const directorEvents = Array.isArray(editorState.directorEvents)
                            ? editorState.directorEvents.filter((e) => e && typeof e === 'object' && e.id)
                            : [];
                        const audioCues = Array.isArray(editorState.audioCues)
                            ? editorState.audioCues.filter((c) => c && typeof c === 'object' && c.id)
                            : [];
                        cachedMissionPackage = { version: '1.0', maps, missions, directorEvents, audioCues };
                    }
                }
            }
        } catch {
            // Fall through
        }
    }
}

function readMissionPackage() {
    return cachedMissionPackage;
}

function shouldUseLocalRuntimeOverrides() {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location?.search || '');
        return params.get('package') === 'local' || params.get('hud') === 'local';
    } catch {
        return false;
    }
}

function shouldUseLocalPackageOverrides() {
    if (typeof window === 'undefined') return false;
    try {
        const params = new URLSearchParams(window.location?.search || '');
        return params.get('package') === 'local';
    } catch {
        return false;
    }
}

function normalizeGrid(grid, width, height, fallbackValue = 0, normalizeCell = (v) => v) {
    const out = Array.from({ length: height }, () => Array(width).fill(fallbackValue));
    if (!Array.isArray(grid)) return out;
    for (let y = 0; y < height; y++) {
        const row = Array.isArray(grid[y]) ? grid[y] : null;
        for (let x = 0; x < width; x++) {
            const raw = row ? row[x] : fallbackValue;
            out[y][x] = normalizeCell(raw);
        }
    }
    return out;
}

function normalizePackageMapShape(map) {
    if (!map || typeof map !== 'object') return null;
    const width = Math.max(8, Math.min(256, Math.floor(Number(map.width) || 0)));
    const height = Math.max(8, Math.min(256, Math.floor(Number(map.height) || 0)));
    if (!width || !height) return null;
    const terrain = normalizeGrid(
        map.terrain,
        width,
        height,
        1,
        (v) => ((Number(v) | 0) === 0 ? 0 : 1)
    );
    const doors = normalizeGrid(
        map.doors,
        width,
        height,
        0,
        (v) => {
            const n = Number(v) | 0;
            return n >= 1 && n <= 4 ? n : 0;
        }
    );
    const markers = normalizeGrid(
        map.markers,
        width,
        height,
        0,
        (v) => {
            const n = Number(v) | 0;
            return n >= 1 && n <= 8 ? n : 0;
        }
    );
    const terrainTextures = normalizeGrid(
        map.terrainTextures,
        width,
        height,
        null,
        (v) => (typeof v === 'string' ? v : null)
    );
    return {
        id: String(map.id || '').trim() || 'pkg_map',
        name: String(map.name || map.id || 'Package Map').trim(),
        width,
        height,
        terrain,
        doors,
        markers,
        terrainTextures,
        floorTextureKey: typeof map.floorTextureKey === 'string' ? map.floorTextureKey : 'tile_floor_grill_import',
        wallTextureKey: typeof map.wallTextureKey === 'string' ? map.wallTextureKey : 'tile_wall_corridor_import',
        props: Array.isArray(map.props) ? map.props : [],
        lights: Array.isArray(map.lights) ? map.lights : [],
        storyPoints: Array.isArray(map.storyPoints)
            ? map.storyPoints.filter((point) => point && typeof point === 'object'
                && Number.isFinite(Number(point.tileX))
                && Number.isFinite(Number(point.tileY)))
            : [],
        spawnPoints: Array.isArray(map.spawnPoints)
            ? map.spawnPoints.filter((point) => point && typeof point === 'object'
                && Number.isFinite(Number(point.tileX))
                && Number.isFinite(Number(point.tileY))
                && Number.isFinite(Number(point.count)) && point.count >= 1)
                .map((point) => normalizeSpawnPoint(point))
                .filter(Boolean)
            : [],
        atmosphere: map.atmosphere && typeof map.atmosphere === 'object' ? { ...map.atmosphere } : {},
        largeTextures: Array.isArray(map.largeTextures) ? map.largeTextures : [],
    };
}

export function getMissionTilemapOverrideForMission(missionId = '', fallbackTilemapId = '') {
    if (!shouldUseLocalPackageOverrides()) return null;
    const pkg = readMissionPackage();
    if (!pkg) return null;
    const maps = Array.isArray(pkg.maps) ? pkg.maps : [];
    if (maps.length === 0) return null;

    let selectedMapId = '';
    if (missionId) {
        const missions = Array.isArray(pkg.missions) ? pkg.missions : [];
        const pkgMission = missions.find((m) => m && String(m.id) === String(missionId));
        if (pkgMission && String(pkgMission.mapId || '').trim()) {
            selectedMapId = String(pkgMission.mapId).trim();
        }
    }
    if (!selectedMapId && fallbackTilemapId) selectedMapId = String(fallbackTilemapId);

    let rawMap = null;
    if (selectedMapId) {
        rawMap = maps.find((m) => m && String(m.id) === selectedMapId) || null;
        return normalizePackageMapShape(rawMap);
    }
    if (maps.length === 1) return normalizePackageMapShape(maps[0]);
    return null;
}

export function getMissionDirectorOverridesForMission(missionId = '') {
    if (!shouldUseLocalPackageOverrides()) return null;
    if (!missionId) return null;
    const parsed = readMissionPackage();
    if (!parsed) return null;
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
    if (!shouldUseLocalPackageOverrides()) return [];
    const parsed = readMissionPackage();
    if (!parsed) return [];
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
            enabled: e.enabled !== false,
            chance: Number.isFinite(Number(e.chance)) ? Number(e.chance) : 100,
            cooldownMs: Number.isFinite(Number(e.cooldownMs)) ? Number(e.cooldownMs) : 0,
            repeatMs: Number.isFinite(Number(e.repeatMs)) ? Number(e.repeatMs) : 0,
            maxFires: Number.isFinite(Number(e.maxFires)) ? Number(e.maxFires) : 0,
            params: (e.params && typeof e.params === 'object') ? { ...e.params } : {},
        });
    }
    return out;
}

export function getMissionAudioCuesForMission(missionId = '') {
    if (!shouldUseLocalPackageOverrides()) return [];
    const parsed = readMissionPackage();
    if (!parsed) return [];
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
}

export function getMissionStoryPointsForMission(missionId = '', fallbackTilemapId = '') {
    if (!shouldUseLocalPackageOverrides()) return [];
    const map = getMissionTilemapOverrideForMission(missionId, fallbackTilemapId);
    if (!map) return [];
    const out = [];
    for (const point of (Array.isArray(map.storyPoints) ? map.storyPoints : [])) {
        if (!point || typeof point !== 'object') continue;
        const id = String(point.id || '').trim();
        if (!id) continue;
        const rawTileX = Number(point.tileX);
        const rawTileY = Number(point.tileY);
        if (!Number.isFinite(rawTileX) || !Number.isFinite(rawTileY)) continue;
        const tileX = Math.round(rawTileX);
        const tileY = Math.round(rawTileY);
        const title = String(point.title || 'Story Beat').trim() || 'Story Beat';
        const note = String(point.note || '').trim();
        const kind = String(point.kind || 'story').trim() || 'story';
        const scopedMission = String(point.missionId || 'all').trim() || 'all';
        if (missionId && scopedMission !== 'all' && scopedMission !== String(missionId)) continue;
        out.push({
            id,
            tileX,
            tileY,
            title,
            note,
            kind,
            missionId: scopedMission,
        });
    }
    return out;
}

export function getMissionPackageMeta() {
    return cachedPackageMeta;
}

export function getMissionNodeGraphs() {
    const parsed = readMissionPackage();
    if (!parsed) return [];
    const graphs = parsed.nodeGraphs;
    if (!Array.isArray(graphs)) return [];
    return graphs.filter(g => g && typeof g === 'object' && Array.isArray(g.nodes));
}

export function getHudConfig() {
    // HUD_CONFIG is written directly to src/data/hudConfig.js by the HUD editor.
    // Always return it when non-empty — no URL gate needed for file-based config.
    if (HUD_CONFIG && Object.keys(HUD_CONFIG).length > 0) {
        return HUD_CONFIG;
    }

    // Fallback: try mission package when explicitly enabled via URL param.
    if (!shouldUseLocalRuntimeOverrides()) return null;
    const parsed = readMissionPackage();
    if (!parsed || !parsed.hudConfig || typeof parsed.hudConfig !== 'object') return null;
    return parsed.hudConfig;
}

export function getMissionPackageSummary() {
    const parsed = readMissionPackage();
    if (!parsed) return null;
    const maps = Array.isArray(parsed?.maps) ? parsed.maps.length : 0;
    const missions = Array.isArray(parsed?.missions) ? parsed.missions.length : 0;
    const directorEvents = Array.isArray(parsed?.directorEvents) ? parsed.directorEvents.length : 0;
    const audioCues = Array.isArray(parsed?.audioCues) ? parsed.audioCues.length : 0;
    const storyPoints = Array.isArray(parsed?.maps)
        ? parsed.maps.reduce((sum, map) => sum + (Array.isArray(map?.storyPoints) ? map.storyPoints.length : 0), 0)
        : 0;
    return { maps, missions, directorEvents, audioCues, storyPoints };
}

export function isMissionPackageMetaStale() {
    return false; // Can't easily check localStorage drift anymore
}
