import { normalizeMissionPackage } from './normalizeMissionPackage.js';

const AUTHORED_SPAWN_ENEMY_TYPES = new Set(['warrior', 'drone', 'facehugger', 'queenLesser', 'queen']);

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

function normalizeSpawnTimeSec(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
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
        spawnTimeSec: normalizeSpawnTimeSec(point.spawnTimeSec ?? point.timer ?? point.spawnTimerSec),
    };
}

function getObjectProperty(obj, name) {
    if (!Array.isArray(obj?.properties)) return undefined;
    for (let i = obj.properties.length - 1; i >= 0; i--) {
        const prop = obj.properties[i];
        if (prop?.name === name) return prop.value;
    }
    return undefined;
}

/**
 * Derive canonical spawnPoints from a tilemap's markers grid and alien_spawn props.
 * Marker value 5 → count defaults to 4 unless an alien_spawn prop at the same tile
 * provides an explicit count.
 * @param {object} m - tilemap shape with .markers grid and .props array
 * @returns {Array<{tileX:number, tileY:number, count:number}>}
 */
function deriveSpawnPointsFromMap(m) {
    // If the tilemap already carries explicit spawnPoints (e.g. from Tiled import), use them.
    if (Array.isArray(m.spawnPoints) && m.spawnPoints.length > 0) {
        return m.spawnPoints
            .map((p) => normalizeSpawnPoint(p))
            .filter(Boolean);
    }

    // Tiled/object-layer editor maps store spawn marker properties on the markers layer.
    const markerLayer = Array.isArray(m.layers)
        ? m.layers.find((layer) => layer?.name === 'markers' && layer?.type === 'objectgroup')
        : null;
    if (Array.isArray(markerLayer?.objects) && markerLayer.objects.length > 0) {
        const tileSize = Math.max(1, Number(m.tilewidth) || Number(m.tileWidth) || 64);
        const spawnPoints = [];
        for (const obj of markerLayer.objects) {
            const markerValue = Number(getObjectProperty(obj, 'markerValue')) || 0;
            const markerType = String(obj?.type || obj?.name || '').trim().toLowerCase();
            if (markerValue !== 5 && markerType !== 'alien_spawn') continue;
            const normalized = normalizeSpawnPoint({
                tileX: Math.round(Number(obj?.x) / tileSize),
                tileY: Math.round(Number(obj?.y) / tileSize),
                count: getObjectProperty(obj, 'count') ?? 4,
                enemyType: getObjectProperty(obj, 'enemyType'),
                spawnTimeSec: getObjectProperty(obj, 'spawnTimeSec') ?? getObjectProperty(obj, 'timer'),
            });
            if (normalized) spawnPoints.push(normalized);
        }
        if (spawnPoints.length > 0) return spawnPoints;
    }
    const out = [];
    // Build a lookup of alien_spawn props by tile position (explicit counts win over defaults).
    const propDataByTile = new Map();
    if (Array.isArray(m.props)) {
        for (const p of m.props) {
            if (p && (p.type === 'alien_spawn' || p.type === 'spawn')) {
                const key = `${Math.round(Number(p.tileX) || 0)},${Math.round(Number(p.tileY) || 0)}`;
                const normalized = normalizeSpawnPoint(p);
                if (normalized) propDataByTile.set(key, normalized);
            }
        }
    }
    // Collect positions from the markers grid (value 5).
    if (Array.isArray(m.markers)) {
        for (let y = 0; y < m.markers.length; y++) {
            const row = m.markers[y];
            if (!Array.isArray(row)) continue;
            for (let x = 0; x < row.length; x++) {
                if ((row[x] | 0) === 5) {
                    const key = `${x},${y}`;
                    const normalized = propDataByTile.get(key)
                        || normalizeSpawnPoint({ tileX: x, tileY: y, count: 4 });
                    if (normalized) out.push(normalized);
                    propDataByTile.delete(key); // avoid duplicate
                }
            }
        }
    }
    // Any alien_spawn props not already covered by a marker grid cell.
    if (Array.isArray(m.props)) {
        for (const p of m.props) {
            if (p && (p.type === 'alien_spawn' || p.type === 'spawn')) {
                const tileX = Math.round(Number(p.tileX) || 0);
                const tileY = Math.round(Number(p.tileY) || 0);
                const key = `${tileX},${tileY}`;
                if (propDataByTile.has(key)) {
                    out.push(propDataByTile.get(key));
                    propDataByTile.delete(key);
                }
            }
        }
    }
    return out;
}

export function buildPackageFromEditorState(editorState) {
    const s = editorState && typeof editorState === 'object' ? editorState : {};
    const maps = Array.isArray(s.tilemaps)
        ? s.tilemaps.map((m) => ({
            id: String(m.id || ''),
            name: String(m.name || m.id || ''),
            width: Number(m.width) || 40,
            height: Number(m.height) || 26,
            terrain: Array.isArray(m.terrain) ? m.terrain : [],
            doors: Array.isArray(m.doors) ? m.doors : [],
            markers: Array.isArray(m.markers) ? m.markers : [],
            floorTextureKey: typeof m.floorTextureKey === 'string' ? m.floorTextureKey : 'tile_floor_grill_import',
            wallTextureKey: typeof m.wallTextureKey === 'string' ? m.wallTextureKey : 'tile_wall_corridor_import',
            terrainTextures: Array.isArray(m.terrainTextures) ? m.terrainTextures : [],
            props: Array.isArray(m.props) ? m.props : [],
            lights: Array.isArray(m.lights) ? m.lights : [],
            storyPoints: Array.isArray(m.storyPoints) ? m.storyPoints : [],
            spawnPoints: deriveSpawnPointsFromMap(m),
            atmosphere: m.atmosphere && typeof m.atmosphere === 'object' ? { ...m.atmosphere } : {},
            largeTextures: Array.isArray(m.largeTextures) ? m.largeTextures : [],
        }))
        : [];

    const missions = Array.isArray(s.missions)
        ? s.missions.map((m) => ({
            id: String(m.id || ''),
            name: String(m.name || m.id || ''),
            mapId: String(m.mapId || ''),
            difficulty: String(m.difficulty || 'normal'),
            enemyBudget: Number(m.enemyBudget) || 0,
            requiredCards: Math.max(0, Math.floor(Number(m.requiredCards) || 0)),
            requiredTerminals: Math.max(0, Math.floor(Number(m.requiredTerminals) || 0)),
            objective: String(m.objective || ''),
            notes: String(m.notes || ''),
            director: m.director && typeof m.director === 'object' ? { ...m.director } : {},
        }))
        : [];

    // Start with flat arrays, then merge/override with any graph nodes (graph is canonical
    // when present — _graphSave() writes to state.missionGraph but not to the flat arrays).
    const flatEvents = Array.isArray(s.directorEvents)
        ? s.directorEvents.filter((e) => e && typeof e === 'object' && e.id)
        : [];
    const flatCues = Array.isArray(s.audioCues)
        ? s.audioCues.filter((c) => c && typeof c === 'object' && c.id)
        : [];

    const graphNodes = s.missionGraph?.nodes;
    const nodeGraphs = buildNodeGraphsForPackage(s);
    let directorEvents = flatEvents;
    let audioCues = flatCues;

    if (Array.isArray(graphNodes) && graphNodes.length > 0) {
        // Extract event nodes → directorEvents entries
        const graphEvents = graphNodes
            .filter((n) => n && n.type === 'event' && n.id && n.data?.trigger && n.data?.action)
            .map((n) => ({
                id: String(n.id),
                trigger: String(n.data?.trigger || ''),
                action: String(n.data?.action || ''),
                ...(n.label ? { label: String(n.label) } : {}),
                ...(n.data?.missionId && n.data.missionId !== 'all' ? { missionId: String(n.data.missionId) } : {}),
                params: n.data?.params && typeof n.data.params === 'object' ? { ...n.data.params } : {},
            }));

        // Extract audioCue nodes → audioCues entries
        const graphCues = graphNodes
            .filter((n) => n && n.type === 'audioCue' && n.id)
            .map((n) => ({
                id: String(n.id),
                textCue: String(n.data?.textCue || ''),
                ...(Number.isFinite(Number(n.data?.priority)) ? { priority: Math.max(0, Math.min(10, Math.floor(Number(n.data.priority)))) } : {}),
                ...(n.data?.missionId && n.data.missionId !== 'all' ? { missionId: String(n.data.missionId) } : {}),
            }));

        // Merge: graph entries win over same-id flat entries
        const graphEventIds = new Set(graphEvents.map((e) => e.id));
        const graphCueIds = new Set(graphCues.map((c) => c.id));
        directorEvents = [...flatEvents.filter((e) => !graphEventIds.has(e.id)), ...graphEvents];
        audioCues = [...flatCues.filter((c) => !graphCueIds.has(c.id)), ...graphCues];
    }

    const gameConfig = s.gameConfig && typeof s.gameConfig === 'object' ? s.gameConfig : {};
    const hudConfig = s.hudConfig && typeof s.hudConfig === 'object' ? s.hudConfig : undefined;

    return normalizeMissionPackage({
        version: '1.0',
        maps,
        missions,
        directorEvents,
        audioCues,
        ...(nodeGraphs.length ? { nodeGraphs } : {}),
        gameConfig,
        ...(hudConfig ? { hudConfig } : {}),
    });
}

function buildNodeGraphsForPackage(state) {
    if (Array.isArray(state?.nodeGraphs)) {
        return state.nodeGraphs
            .filter((graph) => graph && typeof graph === 'object' && Array.isArray(graph.nodes))
            .map((graph) => ({
                ...graph,
                nodes: graph.nodes.map((node) => ({
                    ...node,
                    data: node?.data && typeof node.data === 'object' ? { ...node.data } : {},
                })),
                connections: Array.isArray(graph.connections)
                    ? graph.connections
                        .map((connection, index) => normalizeConnection(connection, index))
                        .filter(Boolean)
                    : [],
            }));
    }

    const legacyGraph = state?.missionGraph;
    if (!legacyGraph || typeof legacyGraph !== 'object' || !Array.isArray(legacyGraph.nodes) || legacyGraph.nodes.length === 0) {
        return [];
    }

    const looksExecutable = legacyGraph.nodes.some((node) => {
        if (!node || typeof node !== 'object') return false;
        if (node.type === 'event' && node.data?.eventName) return true;
        if (node.type === 'action' && node.data?.actionType) return true;
        return node.type === 'condition' || node.type === 'delay' || node.type === 'getter';
    });
    if (!looksExecutable) return [];

    const connectionsSource = Array.isArray(legacyGraph.connections)
        ? legacyGraph.connections
        : (Array.isArray(legacyGraph.edges) ? legacyGraph.edges : []);

    return [{
        id: String(legacyGraph.id || 'legacy-mission-graph'),
        name: String(legacyGraph.name || 'Legacy Mission Graph'),
        enabled: legacyGraph.enabled !== false,
        nodes: legacyGraph.nodes.map((node) => ({
            ...node,
            data: node?.data && typeof node.data === 'object' ? { ...node.data } : {},
        })),
        connections: connectionsSource
            .map((connection, index) => normalizeConnection(connection, index))
            .filter(Boolean),
    }];
}

function normalizeConnection(connection, index) {
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
