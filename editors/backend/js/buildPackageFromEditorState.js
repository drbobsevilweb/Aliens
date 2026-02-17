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
        }))
        : [];

    const missions = Array.isArray(s.missions)
        ? s.missions.map((m) => ({
            id: String(m.id || ''),
            name: String(m.name || m.id || ''),
            mapId: String(m.mapId || ''),
            difficulty: String(m.difficulty || 'normal'),
            enemyBudget: Number(m.enemyBudget) || 0,
            objective: String(m.objective || ''),
            notes: String(m.notes || ''),
            director: m.director && typeof m.director === 'object' ? { ...m.director } : {},
        }))
        : [];

    const directorEvents = Array.isArray(s.directorEvents)
        ? s.directorEvents.filter((e) => e && typeof e === 'object' && e.id)
        : [];

    const audioCues = Array.isArray(s.audioCues)
        ? s.audioCues.filter((c) => c && typeof c === 'object' && c.id)
        : [];

    return normalizeMissionPackage({
        version: '1.0',
        maps,
        missions,
        directorEvents,
        audioCues,
    });
}
