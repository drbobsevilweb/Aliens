import { CONFIG } from '../config.js';
import { MISSION_SET } from '../data/missionData.js';
import { TILEMAP_TEMPLATES } from '../data/tilemapTemplates.js';
import { TILED_MAP_TEMPLATES } from '../data/tiledMaps.generated.js';
import { getMissionTilemapOverrideForMission } from '../settings/missionPackageRuntime.js';
import { loadRuntimeSettings } from '../settings/runtimeSettings.js';
import { SPAWN_TILE, EXTRACTION_TILE } from './mapData.js';
import { DOOR_DEFINITIONS } from './doorData.js';

const MARKER_SPAWN = 1;
const MARKER_EXTRACTION = 2;
const MARKER_ALIEN_SPAWN = 5;
const MARKER_WARNING_STROBE = 6;
const MARKER_VENT_POINT = 7;
const MARKER_EGG_CLUSTER = 8;

function isWarriorOnlyTestingEnabled() {
    try {
        const settings = loadRuntimeSettings();
        return (Number(settings?.enemies?.warriorOnly) || 0) > 0;
    } catch {
        return false;
    }
}

function buildFloorData(width, height) {
    return Array.from({ length: height }, () => Array(width).fill(CONFIG.TILE_FLOOR));
}

function cloneTilemap(tilemap) {
    return {
        ...tilemap,
        terrain: tilemap.terrain.map((row) => row.slice()),
        doors: Array.isArray(tilemap.doors) ? tilemap.doors.map((row) => row.slice()) : [],
        markers: Array.isArray(tilemap.markers) ? tilemap.markers.map((row) => row.slice()) : [],
        terrainTextures: Array.isArray(tilemap.terrainTextures) ? tilemap.terrainTextures.map((row) => row.slice()) : [],
        props: Array.isArray(tilemap.props) ? tilemap.props.map(p => ({...p})) : [],
        lights: Array.isArray(tilemap.lights) ? tilemap.lights.map(l => ({...l})) : [],
        largeTextures: Array.isArray(tilemap.largeTextures) ? tilemap.largeTextures.map(lt => ({...lt})) : [],
        storyPoints: Array.isArray(tilemap.storyPoints) ? tilemap.storyPoints.map(sp => ({...sp})) : [],
    };
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

function collectMarkerTiles(markers, markerValue, props = []) {
    const tiles = [];
    if (Array.isArray(markers)) {
        for (let y = 0; y < markers.length; y++) {
            const row = markers[y];
            if (!Array.isArray(row)) continue;
            for (let x = 0; x < row.length; x++) {
                const v = row[x] | 0;
                if (v === markerValue) {
                    tiles.push({ x, y, count: 1 });
                }
            }
        }
    }
    if (markerValue === MARKER_ALIEN_SPAWN && Array.isArray(props)) {
        for (const p of props) {
            if (p && (p.type === 'alien_spawn' || p.type === 'spawn')) {
                tiles.push({ 
                    x: Math.round(Number(p.tileX) || 0), 
                    y: Math.round(Number(p.tileY) || 0), 
                    count: Math.max(1, Math.round(Number(p.count) || 1)) 
                });
            }
        }
    }
    return tiles;
}

function expandCountedSpawnTiles(tiles) {
    const out = [];
    for (const tile of tiles || []) {
        if (!tile) continue;
        const count = Math.max(1, Math.round(Number(tile.count) || 1));
        for (let slot = 0; slot < count; slot++) {
            out.push({
                x: tile.x,
                y: tile.y,
                count,
                slotKey: `${tile.x},${tile.y}:${slot}`,
            });
        }
    }
    return out;
}

/**
 * Extract warning strobe positions from the markers grid (value 6).
 * Returns array of { tileX, tileY }.
 */
function collectWarningStrobes(markers) {
    const strobes = [];
    if (!Array.isArray(markers)) return strobes;
    for (let y = 0; y < markers.length; y++) {
        const row = markers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) {
            if ((row[x] | 0) === MARKER_WARNING_STROBE) {
                strobes.push({ tileX: x, tileY: y });
            }
        }
    }
    return strobes;
}

/**
 * Extract spawn points from the markers grid (value 5) and props array.
 * Returns array of { tileX, tileY, count: 2|4|6|8 }.
 */
function collectSpawnPoints(markers, props = []) {
    const spawnPoints = [];
    if (!Array.isArray(markers)) return spawnPoints;
    for (let y = 0; y < markers.length; y++) {
        const row = markers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) {
            if ((row[x] | 0) === MARKER_ALIEN_SPAWN) {
                spawnPoints.push({ tileX: x, tileY: y, count: 4 });
            }
        }
    }
    if (Array.isArray(props)) {
        for (const p of props) {
            if (p && (p.type === 'alien_spawn' || p.type === 'spawn')) {
                const count = Math.max(1, Math.round(Number(p.count) || 4));
                spawnPoints.push({
                    tileX: Math.round(Number(p.tileX) || 0),
                    tileY: Math.round(Number(p.tileY) || 0),
                    count,
                });
            }
        }
    }
    return spawnPoints;
}

/**
 * Extract vent points from the markers grid (value 7).
 * Returns array of { tileX, tileY }.
 */
function collectVentPoints(markers) {
    const vents = [];
    if (!Array.isArray(markers)) return vents;
    for (let y = 0; y < markers.length; y++) {
        const row = markers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) {
            if ((row[x] | 0) === MARKER_VENT_POINT) {
                vents.push({ tileX: x, tileY: y });
            }
        }
    }
    return vents;
}

/**
 * Extract egg cluster positions from the markers grid (value 8).
 * Groups adjacent egg tiles into clusters via flood-fill.
 * Returns array of arrays: [ [{ tileX, tileY }, ...], ... ]
 */
function collectEggClusters(markers) {
    const eggTiles = new Set();
    if (!Array.isArray(markers)) return [];
    for (let y = 0; y < markers.length; y++) {
        const row = markers[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) {
            if ((row[x] | 0) === MARKER_EGG_CLUSTER) {
                eggTiles.add(`${x},${y}`);
            }
        }
    }
    if (eggTiles.size === 0) return [];

    // Flood-fill grouping with 8-connectivity (adjacent tiles form one cluster)
    const visited = new Set();
    const clusters = [];
    for (const key of eggTiles) {
        if (visited.has(key)) continue;
        const cluster = [];
        const stack = [key];
        while (stack.length > 0) {
            const cur = stack.pop();
            if (visited.has(cur)) continue;
            visited.add(cur);
            const [cx, cy] = cur.split(',').map(Number);
            cluster.push({ tileX: cx, tileY: cy });
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nk = `${cx + dx},${cy + dy}`;
                    if (eggTiles.has(nk) && !visited.has(nk)) {
                        stack.push(nk);
                    }
                }
            }
        }
        clusters.push(cluster);
    }
    return clusters;
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

function getDoorOrientation(tiles) {
    if (!Array.isArray(tiles) || tiles.length !== 2) return null;
    const [a, b] = tiles;
    if (a.x === b.x && Math.abs(a.y - b.y) === 1) return 'vertical';
    if (a.y === b.y && Math.abs(a.x - b.x) === 1) return 'horizontal';
    return null;
}

function terrainAt(tilemap, x, y) {
    if (!tilemap?.terrain) return 1;
    if (y < 0 || y >= tilemap.height || x < 0 || x >= tilemap.width) return 1;
    return tilemap.terrain[y][x];
}

const DOOR_MIN_SIDE_REACH = 14;

function floodReachableTerrain(tilemap, starts, blockedSet, limit = 128) {
    if (!tilemap?.terrain || !Array.isArray(starts) || starts.length === 0) return 0;
    const q = [];
    const seen = new Set();
    for (const s of starts) {
        if (!s) continue;
        const x = Number(s.x);
        const y = Number(s.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (terrainAt(tilemap, x, y) !== 0) continue;
        const key = `${x},${y}`;
        if (blockedSet?.has(key) || seen.has(key)) continue;
        seen.add(key);
        q.push({ x, y });
    }
    for (let i = 0; i < q.length && seen.size < limit; i++) {
        const c = q[i];
        const n = [
            { x: c.x + 1, y: c.y },
            { x: c.x - 1, y: c.y },
            { x: c.x, y: c.y + 1 },
            { x: c.x, y: c.y - 1 },
        ];
        for (const p of n) {
            if (terrainAt(tilemap, p.x, p.y) !== 0) continue;
            const key = `${p.x},${p.y}`;
            if (blockedSet?.has(key) || seen.has(key)) continue;
            seen.add(key);
            q.push(p);
        }
    }
    return seen.size;
}

function doorSideReachability(tilemap, tiles, orientation) {
    const blocked = new Set((tiles || []).map((t) => `${t.x},${t.y}`));
    const [a, b] = tiles || [];
    if (!a || !b) return { sideA: 0, sideB: 0 };
    let sideA = [];
    let sideB = [];
    if (orientation === 'vertical') {
        sideA = [{ x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }];
        sideB = [{ x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }];
    } else if (orientation === 'horizontal') {
        sideA = [{ x: a.x, y: a.y - 1 }, { x: b.x, y: b.y - 1 }];
        sideB = [{ x: a.x, y: a.y + 1 }, { x: b.x, y: b.y + 1 }];
    } else {
        return { sideA: 0, sideB: 0 };
    }
    const reachA = floodReachableTerrain(tilemap, sideA, blocked, 96);
    const reachB = floodReachableTerrain(tilemap, sideB, blocked, 96);
    return { sideA: reachA, sideB: reachB };
}

function isAnchoredDoorPlacement(tilemap, tiles, orientation) {
    if (!orientation || !Array.isArray(tiles) || tiles.length !== 2) return false;
    const sorted = tiles.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const a = sorted[0];
    const b = sorted[1];
    const doorA = terrainAt(tilemap, a.x, a.y);
    const doorB = terrainAt(tilemap, b.x, b.y);
    if (doorA === 1 && doorB !== 1) return false;
    if (doorB === 1 && doorA !== 1) return false;

    if (orientation === 'vertical') {
        // Door spans Y; must be capped by walls on top/bottom and corridor floor on left/right.
        if (terrainAt(tilemap, a.x, a.y - 1) !== 1) return false;
        if (terrainAt(tilemap, b.x, b.y + 1) !== 1) return false;
        if (terrainAt(tilemap, a.x - 1, a.y) !== 0 || terrainAt(tilemap, a.x + 1, a.y) !== 0) return false;
        if (terrainAt(tilemap, b.x - 1, b.y) !== 0 || terrainAt(tilemap, b.x + 1, b.y) !== 0) return false;
        // Ensure both sides continue outward to avoid dead-end cap doors.
        const leftRun = (terrainAt(tilemap, a.x - 2, a.y) === 0) || (terrainAt(tilemap, b.x - 2, b.y) === 0);
        const rightRun = (terrainAt(tilemap, a.x + 2, a.y) === 0) || (terrainAt(tilemap, b.x + 2, b.y) === 0);
        if (!leftRun || !rightRun) return false;
        const reach = doorSideReachability(tilemap, [a, b], orientation);
        return reach.sideA >= DOOR_MIN_SIDE_REACH && reach.sideB >= DOOR_MIN_SIDE_REACH;
    }

    // Horizontal door: wall anchors on left/right, floor corridor on top/bottom.
    if (terrainAt(tilemap, a.x - 1, a.y) !== 1) return false;
    if (terrainAt(tilemap, b.x + 1, b.y) !== 1) return false;
    if (terrainAt(tilemap, a.x, a.y - 1) !== 0 || terrainAt(tilemap, a.x, a.y + 1) !== 0) return false;
    if (terrainAt(tilemap, b.x, b.y - 1) !== 0 || terrainAt(tilemap, b.x, b.y + 1) !== 0) return false;
    const upRun = (terrainAt(tilemap, a.x, a.y - 2) === 0) || (terrainAt(tilemap, b.x, b.y - 2) === 0);
    const downRun = (terrainAt(tilemap, a.x, a.y + 2) === 0) || (terrainAt(tilemap, b.x, b.y + 2) === 0);
    if (!upRun || !downRun) return false;
    const reach = doorSideReachability(tilemap, [a, b], orientation);
    return reach.sideA >= DOOR_MIN_SIDE_REACH && reach.sideB >= DOOR_MIN_SIDE_REACH;
}

function findNearestAnchoredDoorPlacement(tilemap, orientation, seedTiles, radius = 6, occupied = null) {
    if (!tilemap?.terrain || !Array.isArray(seedTiles) || seedTiles.length !== 2) return null;
    const cx = (seedTiles[0].x + seedTiles[1].x) * 0.5;
    const cy = (seedTiles[0].y + seedTiles[1].y) * 0.5;
    let best = null;
    let bestScore = Infinity;
    for (let y = Math.max(1, Math.floor(cy) - radius); y <= Math.min(tilemap.height - 2, Math.ceil(cy) + radius); y++) {
        for (let x = Math.max(1, Math.floor(cx) - radius); x <= Math.min(tilemap.width - 2, Math.ceil(cx) + radius); x++) {
            const tiles = orientation === 'vertical'
                ? [{ x, y }, { x, y: y + 1 }]
                : [{ x, y }, { x: x + 1, y }];
            if (!isAnchoredDoorPlacement(tilemap, tiles, orientation)) continue;
            if (occupied && tiles.some((t) => occupied.has(`${t.x},${t.y}`))) continue;
            const dcx = (tiles[0].x + tiles[1].x) * 0.5;
            const dcy = (tiles[0].y + tiles[1].y) * 0.5;
            const score = (dcx - cx) * (dcx - cx) + (dcy - cy) * (dcy - cy);
            if (score < bestScore) {
                bestScore = score;
                best = tiles;
            }
        }
    }
    return best;
}

function buildDoorDefinitions(tilemap) {
    if (!tilemap?.doors || !Array.isArray(tilemap.doors) || tilemap.doors.length === 0) {
        return DOOR_DEFINITIONS;
    }
    const components = collectDoorComponents(tilemap.doors);
    if (components.length === 0) {
        return DOOR_DEFINITIONS;
    }
    const out = [];
    let idx = 0;
    const occupied = new Set();
    for (const comp of components) {
        const orientation = getDoorOrientation(comp.tiles);
        if (!orientation) continue;
        let tiles = comp.tiles;
        const overlaps = tiles.some((t) => occupied.has(`${t.x},${t.y}`));
        if (overlaps || !isAnchoredDoorPlacement(tilemap, tiles, orientation)) {
            const snapped = findNearestAnchoredDoorPlacement(tilemap, orientation, comp.tiles, 8, occupied);
            if (!snapped) continue;
            tiles = snapped;
        }
        for (const t of tiles) occupied.add(`${t.x},${t.y}`);
        out.push(doorDefinitionFromValue(comp.value, tiles, idx++));
    }
    // If the template provided a door grid but none are valid, keep it empty rather than
    // injecting legacy static-door defaults into the wrong map layout.
    return out;
}

function walkableTiles(tilemap, avoidTile) {
    const out = [];
    const doorGrid = tilemap.doors || [];
    for (let y = 0; y < tilemap.height; y++) {
        for (let x = 0; x < tilemap.width; x++) {
            if (tilemap.terrain[y][x] !== 0) continue;
            if (doorGrid[y] && (doorGrid[y][x] | 0) > 0) continue;
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
            const key = pick.slotKey || `${pick.x},${pick.y}`;
            if (usedPerWave.has(key)) continue;
            usedPerWave.add(key);
            return pick;
        }
    }
    for (let attempt = 0; attempt < 48; attempt++) {
        const pick = openTiles[Math.floor(rnd() * openTiles.length)];
        if (!pick) continue;
        const key = pick.slotKey || `${pick.x},${pick.y}`;
        if (usedPerWave.has(key)) continue;
        usedPerWave.add(key);
        return pick;
    }
    return openTiles[Math.floor(rnd() * openTiles.length)] || null;
}

function filterTilesByDistanceBand(tiles, originTile, minTiles, maxTiles) {
    if (!Array.isArray(tiles) || !originTile) return Array.isArray(tiles) ? tiles : [];
    const minSq = Math.max(0, Number(minTiles) || 0) ** 2;
    const maxSq = Math.max(minTiles, Number(maxTiles) || minTiles) ** 2;
    const out = [];
    for (const t of tiles) {
        if (!t) continue;
        const dx = t.x - originTile.x;
        const dy = t.y - originTile.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minSq || d2 > maxSq) continue;
        out.push(t);
    }
    return out;
}

function compositionForMission(missionId, waveIndex, waveCount, warriorOnly) {
    if (warriorOnly) return [{ type: 'warrior', w: 1 }];
    // m1: Processing Plant — majority warriors, small drone/facehugger presence
    if (missionId === 'm1') return [{ type: 'warrior', w: 0.75 }, { type: 'drone', w: 0.16 }, { type: 'facehugger', w: 0.09 }];
    // m2: Reactor Spine — introduce drones and first facehuggers
    if (missionId === 'm2') return [{ type: 'warrior', w: 0.66 }, { type: 'drone', w: 0.22 }, { type: 'facehugger', w: 0.12 }];
    // m3: Queen Cathedral — boss level; queen + lesser queens on final wave
    if (missionId === 'm3') {
        if (waveIndex === waveCount - 1) return [{ type: 'queen', w: 0.08 }, { type: 'queenLesser', w: 0.16 }, { type: 'warrior', w: 0.52 }, { type: 'drone', w: 0.24 }];
        return [{ type: 'warrior', w: 0.56 }, { type: 'drone', w: 0.30 }, { type: 'facehugger', w: 0.14 }];
    }
    // m4: Hydroponics Array — heavy facehugger pressure, tactical challenge
    if (missionId === 'm4') return [{ type: 'warrior', w: 0.56 }, { type: 'drone', w: 0.26 }, { type: 'facehugger', w: 0.18 }];
    // m5: Docking Ring — extreme swarm; queenLesser on final wave as mini-boss
    if (missionId === 'm5') {
        if (waveIndex === waveCount - 1) return [{ type: 'queenLesser', w: 0.08 }, { type: 'warrior', w: 0.62 }, { type: 'drone', w: 0.24 }, { type: 'facehugger', w: 0.06 }];
        return [{ type: 'warrior', w: 0.64 }, { type: 'drone', w: 0.28 }, { type: 'facehugger', w: 0.08 }];
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
        m1: 0.18,
        m2: 0.24,
        m3: 0.28,
        m4: 0.28,
        m5: 0.26,
    };
    const droneCap = Math.max(0, Math.floor((droneCapByMission[missionId] || 0.25) * count));
    const currentDrone = typeCounts.get('drone') || 0;
    if (currentDrone > droneCap) {
        const overflow = currentDrone - droneCap;
        typeCounts.set('drone', droneCap);
        typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + overflow);
    }

    // Queen rules: full queen only on m3 final wave; queenLesser only on m3/m5 final wave.
    const isM3Final = missionId === 'm3' && waveIndex === (waveCount - 1);
    const isM5Final = missionId === 'm5' && waveIndex === (waveCount - 1);

    if (isM3Final) {
        // Enforce exactly 1 queen + up to 2 lesser queens
        const queenCount = 1;
        const lesserCount = Math.max(0, Math.min(2, Math.floor(count * 0.12)));
        const prevQueen = (typeCounts.get('queen') || 0) + (typeCounts.get('queenLesser') || 0);
        typeCounts.set('queen', queenCount);
        typeCounts.set('queenLesser', lesserCount);
        const delta = (queenCount + lesserCount) - prevQueen;
        if (delta > 0) {
            typeCounts.set('warrior', Math.max(0, (typeCounts.get('warrior') || 0) - delta));
        } else if (delta < 0) {
            typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + Math.abs(delta));
        }
    } else if (isM5Final) {
        // No full queen on docking ring; strip any that crept in, keep queenLesser
        const queenCount = typeCounts.get('queen') || 0;
        if (queenCount > 0) {
            typeCounts.set('queen', 0);
            typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + queenCount);
        }
    } else {
        // All other waves: strip queens entirely
        const q = (typeCounts.get('queen') || 0) + (typeCounts.get('queenLesser') || 0);
        if (q > 0) {
            typeCounts.set('queen', 0);
            typeCounts.set('queenLesser', 0);
            typeCounts.set('warrior', (typeCounts.get('warrior') || 0) + q);
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
    // Place the queen in the middle of the spawn sequence for m3 final wave (dramatic entrance)
    if (isM3Final) {
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

function buildMissionWaves(mission, tilemap, spawnTile, warriorOnly, authoredSpawnPoints = []) {
    const waveCount = mission.difficulty === 'extreme' ? 3 : mission.difficulty === 'hard' ? 3 : 2;
    const rnd = createSeededRandom(`${mission.id}:${mission.enemyBudget}:${mission.difficulty}`);
    const counts = splitBudget(mission.enemyBudget, waveCount, rnd);

    // If the map has authored alien_spawn markers, use those as the spawn pool so
    // designers control where aliens enter from.  Fall back to all walkable tiles.
    const doorGrid = tilemap.doors || [];
    const alienMarkerTiles = expandCountedSpawnTiles(
        collectMarkerTiles(tilemap.markers, MARKER_ALIEN_SPAWN, tilemap.props)
    )
        .filter((t) => {
            if (tilemap.terrain[t.y]?.[t.x] !== 0) return false;
            if (doorGrid[t.y] && (doorGrid[t.y][t.x] | 0) > 0) return false;
            if (spawnTile) {
                const dx = t.x - spawnTile.x;
                const dy = t.y - spawnTile.y;
                if ((dx * dx + dy * dy) < 64) return false; // too close to marine spawn
            }
            return true;
        });
    const openTiles = alienMarkerTiles.length > 0
        ? alienMarkerTiles
        : walkableTiles(tilemap, spawnTile);
    const zones = buildSpawnZones(openTiles, tilemap.width, tilemap.height);
    if (openTiles.length === 0) return [[]];

    // Build the set of valid authored spawn positions for a fast lookup.
    const validAuthoredPoints = Array.isArray(authoredSpawnPoints)
        ? authoredSpawnPoints.filter((p) => {
            if (!p || !Number.isFinite(Number(p.tileX)) || !Number.isFinite(Number(p.tileY))) return false;
            if (tilemap.terrain[p.tileY]?.[p.tileX] !== 0) return false;
            if (doorGrid[p.tileY] && (doorGrid[p.tileY][p.tileX] | 0) > 0) return false;
            if (spawnTile) {
                const dx = p.tileX - spawnTile.x;
                const dy = p.tileY - spawnTile.y;
                if ((dx * dx + dy * dy) < 64) return false;
            }
            return true;
        })
        : [];

    const usedPerWave = new Set();
    const waves = [];
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex++) {
        // Wave 0: when valid authored spawn points exist, use their exact positions and
        // authored counts so the opening encounter respects designer intent.
        if (waveIndex === 0 && validAuthoredPoints.length > 0) {
            const wave = [];
            const totalAuthoredCount = validAuthoredPoints.reduce((s, p) => s + Math.max(1, Math.round(Number(p.count) || 1)), 0);
            const typePlan = buildWaveTypePlan(mission.id, 0, waveCount, totalAuthoredCount, warriorOnly, rnd);
            let typeIdx = 0;
            for (const point of validAuthoredPoints) {
                const count = Math.max(1, Math.round(Number(point.count) || 1));
                for (let i = 0; i < count; i++) {
                    const type = typePlan[typeIdx] || typePlan[typePlan.length - 1] || 'warrior';
                    typeIdx++;
                    wave.push({ type, tileX: point.tileX, tileY: point.tileY });
                }
            }
            waves.push(wave);
            continue;
        }

        let waveOpenTiles = openTiles;
        if (waveIndex === 0 && spawnTile) {
            const firstWaveBandByMission = {
                m1: { min: 11, max: 18 },
                m2: { min: 14, max: 24 },
                m3: { min: 12, max: 22 },
                m4: { min: 18, max: 30 },
                m5: { min: 12, max: 20 },
            };
            const band = firstWaveBandByMission[mission.id] || { min: 12, max: 20 };
            const firstWaveTiles = filterTilesByDistanceBand(
                openTiles,
                spawnTile,
                band.min,
                band.max
            );
            if (firstWaveTiles.length >= Math.max(6, Math.floor(counts[waveIndex] * 0.65))) {
                waveOpenTiles = firstWaveTiles;
            }
        }
        const waveZones = buildSpawnZones(waveOpenTiles, tilemap.width, tilemap.height);
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
        const zoneStart = Math.floor(rnd() * Math.max(1, waveZones.length));
        for (let i = 0; i < typePlan.length; i++) {
            const preferredZone = (zoneStart + i) % Math.max(1, waveZones.length);
            const pick = pickSpawnTileFromZones(waveZones, waveOpenTiles, usedPerWave, rnd, preferredZone);
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

/* Tactical flow generation removed — map editor is the authority for cover placement. */

export function resolveMissionLayout(missionId) {
    const mission = MISSION_SET.find((m) => m.id === missionId) || MISSION_SET[0];
    // Only use localStorage mission packages when explicitly opted in via ?package=local
    const useLocalPackage = typeof window !== 'undefined'
        && new URLSearchParams(window.location?.search || '').get('package') === 'local';
    const packageTilemap = useLocalPackage
        ? getMissionTilemapOverrideForMission(mission.id, mission.tilemapId)
        : null;
    const tiledTilemap = TILED_MAP_TEMPLATES.find((m) => m.id === mission.tilemapId) || null;
    const tilemapSource = packageTilemap
        ? 'PACKAGE'
        : (tiledTilemap ? 'TILED' : 'TEMPLATE');
    if (tilemapSource === 'TEMPLATE') {
        console.warn(`[missionLayout] No Tiled map found for "${mission.tilemapId}" — falling back to legacy template. Run: npm run build:tiled`);
    }
    const sourceTilemap = packageTilemap
        || tiledTilemap
        || TILEMAP_TEMPLATES.find((m) => m.id === mission.tilemapId)
        || TILEMAP_TEMPLATES[0];

    const spawnFromMap = findMarker(sourceTilemap.markers, MARKER_SPAWN);
    const extractionFromMap = findMarker(sourceTilemap.markers, MARKER_EXTRACTION);
    const spawnTile = spawnFromMap || SPAWN_TILE;
    const extractionTile = extractionFromMap || EXTRACTION_TILE;
    const tilemap = cloneTilemap(sourceTilemap);

    // Prefer explicit spawnPoints from the tilemap (e.g. from Tiled import or package build),
    // fall back to deriving from markers + props so the grid-only path still works.
    const spawnPoints = (Array.isArray(sourceTilemap.spawnPoints) && sourceTilemap.spawnPoints.length > 0)
        ? sourceTilemap.spawnPoints.filter((p) => p && Number.isFinite(Number(p.tileX)) && Number.isFinite(Number(p.tileY)) && Number(p.count) >= 1)
        : collectSpawnPoints(sourceTilemap.markers, sourceTilemap.props);

    return {
        mission,
        tilemap,
        floorData: buildFloorData(tilemap.width, tilemap.height),
        wallData: buildWallData(tilemap.terrain),
        spawnTile,
        extractionTile,
        doorDefinitions: buildDoorDefinitions(tilemap),
        missionWaves: buildMissionWaves(mission, tilemap, spawnTile, isWarriorOnlyTestingEnabled(), spawnPoints),
        forceWarriorOnly: isWarriorOnlyTestingEnabled(),
        tilemapSource,
        floorTextureKey: sourceTilemap.floorTextureKey || 'tile_floor_grill_import',
        wallTextureKey: sourceTilemap.wallTextureKey || 'tile_wall_corridor_import',
        props: Array.isArray(sourceTilemap.props) ? sourceTilemap.props : [],
        terrainTextures: Array.isArray(sourceTilemap.terrainTextures) ? sourceTilemap.terrainTextures : [],
        lights: Array.isArray(sourceTilemap.lights) ? sourceTilemap.lights : [],
        atmosphere: sourceTilemap.atmosphere && typeof sourceTilemap.atmosphere === 'object' ? { ...sourceTilemap.atmosphere } : {},
        largeTextures: Array.isArray(sourceTilemap.largeTextures) ? sourceTilemap.largeTextures : [],
        ventPoints: collectVentPoints(sourceTilemap.markers),
        eggClusters: collectEggClusters(sourceTilemap.markers),
        warningStrobes: collectWarningStrobes(sourceTilemap.markers),
        spawnPoints,
    };
}
