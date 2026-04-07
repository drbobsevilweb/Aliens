import { normalizeMissionPackage } from './normalizeMissionPackage.js';

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
