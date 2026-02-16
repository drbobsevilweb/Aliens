import { CONFIG } from '../config.js';
import { MISSION_SET } from '../data/missionData.js';
import { TILEMAP_TEMPLATES } from '../data/tilemapTemplates.js';
import { SPAWN_TILE, EXTRACTION_TILE } from './mapData.js';
import { DOOR_DEFINITIONS } from './doorData.js';

const MARKER_SPAWN = 1;
const MARKER_EXTRACTION = 2;
const WARRIOR_ONLY_TESTING = false;

function buildFloorData(width, height) {
    return Array.from({ length: height }, () => Array(width).fill(CONFIG.TILE_FLOOR));
}

function buildWallData(terrain) {
    return terrain.map((row) =>
        row.map((cell) => (cell === 1 ? CONFIG.TILE_WALL : -1))
    );
}

function findMarker(markers, markerValue) {
    for (let y = 0; y < markers.length; y++) {
        for (let x = 0; x < markers[y].length; x++) {
            if (markers[y][x] === markerValue) {
                return { x, y };
            }
        }
    }
    return null;
}

function collectDoorComponents(doorGrid) {
    const h = doorGrid.length;
    const w = doorGrid[0]?.length || 0;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const groups = [];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const value = doorGrid[y][x];
            if (value <= 0 || visited[y][x]) continue;

            const queue = [{ x, y }];
            visited[y][x] = true;
            const tiles = [];

            while (queue.length > 0) {
                const cur = queue.shift();
                tiles.push({ x: cur.x, y: cur.y });

                const neighbors = [
                    { x: cur.x + 1, y: cur.y },
                    { x: cur.x - 1, y: cur.y },
                    { x: cur.x, y: cur.y + 1 },
                    { x: cur.x, y: cur.y - 1 },
                ];
                for (const n of neighbors) {
                    if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h) continue;
                    if (visited[n.y][n.x]) continue;
                    if (doorGrid[n.y][n.x] !== value) continue;
                    visited[n.y][n.x] = true;
                    queue.push(n);
                }
            }

            tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            groups.push({ value, tiles });
        }
    }

    return groups;
}

function doorDefinitionFromValue(value, tiles, index) {
    const type = (value === 1 || value === 4) ? 'standard' : 'electronic';
    const initialState = value === 3 ? 'locked' : value === 4 ? 'welded' : 'closed';
    return {
        id: `auto_door_${index + 1}`,
        type,
        initialState,
        tiles,
    };
}

function buildDoorDefinitions(tilemap) {
    if (!tilemap?.doors || !Array.isArray(tilemap.doors) || tilemap.doors.length === 0) {
        return DOOR_DEFINITIONS;
    }
    const components = collectDoorComponents(tilemap.doors);
    if (components.length === 0) {
        return DOOR_DEFINITIONS;
    }
    return components.map((comp, i) => doorDefinitionFromValue(comp.value, comp.tiles, i));
}

function walkableTiles(tilemap, avoidTile) {
    const out = [];
    for (let y = 0; y < tilemap.height; y++) {
        for (let x = 0; x < tilemap.width; x++) {
            if (tilemap.terrain[y][x] !== 0) continue;
            if (avoidTile) {
                const dx = x - avoidTile.x;
                const dy = y - avoidTile.y;
                if ((dx * dx + dy * dy) < 64) continue;
            }
            out.push({ x, y });
        }
    }
    return out;
}

function buildSpawnZones(openTiles, width, height) {
    const zones = Array.from({ length: 6 }, () => []);
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    for (const t of openTiles) {
        const zx = Math.max(0, Math.min(2, Math.floor((t.x / safeW) * 3)));
        const zy = Math.max(0, Math.min(1, Math.floor((t.y / safeH) * 2)));
        zones[zy * 3 + zx].push(t);
    }
    return zones;
}

function pickSpawnTileFromZones(zones, openTiles, usedPerWave, rnd, preferredZoneIndex) {
    const zCount = zones.length;
    for (let step = 0; step < zCount; step++) {
        const zi = (preferredZoneIndex + step) % zCount;
        const zone = zones[zi];
        if (!zone || zone.length === 0) continue;
        for (let attempt = 0; attempt < 24; attempt++) {
            const pick = zone[Math.floor(rnd() * zone.length)];
            if (!pick) continue;
            const key = `${pick.x},${pick.y}`;
            if (usedPerWave.has(key)) continue;
            usedPerWave.add(key);
            return pick;
        }
    }
    for (let attempt = 0; attempt < 48; attempt++) {
        const pick = openTiles[Math.floor(rnd() * openTiles.length)];
        if (!pick) continue;
        const key = `${pick.x},${pick.y}`;
        if (usedPerWave.has(key)) continue;
        usedPerWave.add(key);
        return pick;
    }
    return openTiles[Math.floor(rnd() * openTiles.length)] || null;
}

function compositionForMission(missionId, waveIndex, waveCount, warriorOnly) {
    if (warriorOnly) return [{ type: 'warrior', w: 1 }];
    if (missionId === 'm1') return [{ type: 'warrior', w: 0.82 }, { type: 'drone', w: 0.18 }];
    if (missionId === 'm2') return [{ type: 'warrior', w: 0.68 }, { type: 'drone', w: 0.2 }, { type: 'facehugger', w: 0.12 }];
    if (missionId === 'm3') return [{ type: 'warrior', w: 0.55 }, { type: 'drone', w: 0.3 }, { type: 'facehugger', w: 0.15 }];
    if (missionId === 'm4') return [{ type: 'warrior', w: 0.5 }, { type: 'drone', w: 0.2 }, { type: 'facehugger', w: 0.3 }];
    if (missionId === 'm5') {
        if (waveIndex === waveCount - 1) return [{ type: 'queen', w: 0.08 }, { type: 'queenLesser', w: 0.16 }, { type: 'warrior', w: 0.54 }, { type: 'drone', w: 0.22 }];
        return [{ type: 'warrior', w: 0.56 }, { type: 'drone', w: 0.28 }, { type: 'facehugger', w: 0.16 }];
    }
    return [{ type: 'warrior', w: 0.7 }, { type: 'drone', w: 0.2 }, { type: 'facehugger', w: 0.1 }];
}

function buildWaveTypePlan(missionId, waveIndex, waveCount, count, warriorOnly, rnd) {
    if (count <= 0) return [];
    if (warriorOnly) return Array.from({ length: count }, () => 'warrior');

    const comp = compositionForMission(missionId, waveIndex, waveCount, warriorOnly);
    const typeCounts = new Map();
    for (const c of comp) {
        typeCounts.set(c.type, Math.max(0, Math.round(c.w * count)));
    }
    const sumCounts = () => Array.from(typeCounts.values()).reduce((a, b) => a + b, 0);
    while (sumCounts() < count) {
        const t = comp[Math.floor(rnd() * comp.length)].type;
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }
    while (sumCounts() > count) {
        const t = comp[Math.floor(rnd() * comp.length)].type;
        const v = typeCounts.get(t) || 0;
        if (v > 0) typeCounts.set(t, v - 1);
    }

    const droneCapByMission = {
        m1: 0.2,
        m2: 0.26,
        m3: 0.32,
        m4: 0.35,
        m5: 0.28,
    };
    const droneCap = Math.max(0, Math.floor((droneCapByMission[missionId] || 0.25) * count));
    const currentDrone = typeCounts.get('drone') || 0;
    if (currentDrone > droneCap) {
        const overflow = currentDrone - droneCap;
        typeCounts.set('drone', droneCap);
        typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + overflow);
    }

    if (missionId !== 'm5' || waveIndex !== (waveCount - 1)) {
        const q = (typeCounts.get('queen') || 0) + (typeCounts.get('queenLesser') || 0);
        if (q > 0) {
            typeCounts.set('queen', 0);
            typeCounts.set('queenLesser', 0);
            typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + q);
        }
    } else {
        const queenCount = 1;
        const lesserCount = Math.max(0, Math.min(2, Math.floor(count * 0.12)));
        const prevQueen = (typeCounts.get('queen') || 0) + (typeCounts.get('queenLesser') || 0);
        typeCounts.set('queen', queenCount);
        typeCounts.set('queenLesser', lesserCount);
        const delta = (queenCount + lesserCount) - prevQueen;
        if (delta > 0) {
            const warriors = Math.max(0, (typeCounts.get('warrior') || 0) - delta);
            typeCounts.set('warrior', warriors);
        } else if (delta < 0) {
            typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + Math.abs(delta));
        }
    }

    const types = [];
    for (const [type, n] of typeCounts.entries()) {
        for (let i = 0; i < Math.max(0, n); i++) types.push(type);
    }
    while (types.length < count) types.push('warrior');
    while (types.length > count) types.pop();
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = types[i];
        types[i] = types[j];
        types[j] = t;
    }
    if (missionId === 'm5' && waveIndex === (waveCount - 1)) {
        const qIdx = types.indexOf('queen');
        if (qIdx >= 0) {
            const mid = Math.floor(types.length * 0.55);
            const t = types[mid];
            types[mid] = 'queen';
            types[qIdx] = t;
        }
    }
    return types;
}

function splitBudget(total, waveCount, rnd) {
    const out = [];
    let remain = Math.max(waveCount, total);
    for (let i = 0; i < waveCount; i++) {
        const wavesLeft = waveCount - i;
        const minForWave = 1;
        const target = Math.round(remain / wavesLeft);
        const jitter = Math.floor(rnd() * 3) - 1;
        const count = Math.max(minForWave, target + jitter);
        out.push(count);
        remain -= count;
    }
    if (remain !== 0) out[out.length - 1] = Math.max(1, out[out.length - 1] + remain);
    return out;
}

function buildMissionWaves(mission, tilemap, spawnTile, warriorOnly) {
    const waveCount = mission.difficulty === 'extreme' ? 3 : mission.difficulty === 'hard' ? 3 : 2;
    const rnd = createSeededRandom(`${mission.id}:${mission.enemyBudget}:${mission.difficulty}`);
    const counts = splitBudget(mission.enemyBudget, waveCount, rnd);
    const openTiles = walkableTiles(tilemap, spawnTile);
    const zones = buildSpawnZones(openTiles, tilemap.width, tilemap.height);
    if (openTiles.length === 0) return [[]];

    const usedPerWave = new Set();
    const waves = [];
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex++) {
        const typePlan = buildWaveTypePlan(
            mission.id,
            waveIndex,
            waveCount,
            counts[waveIndex],
            warriorOnly,
            rnd
        );
        const wave = [];
        usedPerWave.clear();
        const zoneStart = Math.floor(rnd() * Math.max(1, zones.length));
        for (let i = 0; i < typePlan.length; i++) {
            const preferredZone = (zoneStart + i) % Math.max(1, zones.length);
            const pick = pickSpawnTileFromZones(zones, openTiles, usedPerWave, rnd, preferredZone);
            if (!pick) continue;
            const type = typePlan[i] || 'warrior';
            wave.push({ type, tileX: pick.x, tileY: pick.y });
        }
        waves.push(wave);
    }
    return waves;
}

function createSeededRandom(seedText) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedText.length; i++) {
        h ^= seedText.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return function rnd() {
        h += 0x6D2B79F5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function resolveMissionLayout(missionId) {
    const mission = MISSION_SET.find((m) => m.id === missionId) || MISSION_SET[0];
    const tilemap = TILEMAP_TEMPLATES.find((m) => m.id === mission.tilemapId) || TILEMAP_TEMPLATES[0];

    const spawnFromMap = findMarker(tilemap.markers, MARKER_SPAWN);
    const extractionFromMap = findMarker(tilemap.markers, MARKER_EXTRACTION);

    return {
        mission,
        tilemap,
        floorData: buildFloorData(tilemap.width, tilemap.height),
        wallData: buildWallData(tilemap.terrain),
        spawnTile: spawnFromMap || SPAWN_TILE,
        extractionTile: extractionFromMap || EXTRACTION_TILE,
        doorDefinitions: buildDoorDefinitions(tilemap),
        missionWaves: buildMissionWaves(mission, tilemap, spawnFromMap || SPAWN_TILE, WARRIOR_ONLY_TESTING),
        warriorOnlyTesting: WARRIOR_ONLY_TESTING,
    };
}
