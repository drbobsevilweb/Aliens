import { normalizeMissionPackage } from '../editors/backend/js/normalizeMissionPackage.js';

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

const samplePackage = {
    maps: [
        {
            id: 'map-alpha',
            name: 'Alpha Maze',
            width: 40,
            height: 26,
            storyPoints: [
                { tileX: 2, tileY: 3, title: 'Intro', note: '  first beat  ', kind: 'story', missionId: 'all' },
            ],
        },
    ],
    missions: [
        {
            id: 'mission-a',
            name: 'Mission Alpha',
            mapId: 'map-alpha',
            objective: 'Clear the maze',
            director: {
                idlePressureBaseMs: 1500,
            },
        },
    ],
    directorEvents: [
        {
            id: 'event-spawn',
            trigger: 'time:30',
            action: 'spawn_pack',
            label: '  Critical Spawn  ',
            category: '  spawn  ',
            notes: '  push players to edges  ',
            missionId: 'mission-a',
            missionIds: ['mission-a', 'mission-b', 'mission-a', ''],
            chance: 250,
            cooldownMs: '2200',
            repeatMs: 0,
            maxFires: '3',
            enabled: false,
            params: {
                spawnCount: 4,
            },
        },
    ],
    audioCues: [
        {
            id: 'cue-alert',
            textCue: 'Watch the vents',
            priority: 12,
            missionId: 'mission-a',
        },
    ],
};

const normalized = normalizeMissionPackage(samplePackage);

assert(Array.isArray(normalized.maps) && normalized.maps.length === 1, 'Map normalization failed');
assert(Array.isArray(normalized.missions) && normalized.missions.length === 1, 'Mission normalization failed');
assert(Array.isArray(normalized.directorEvents) && normalized.directorEvents.length === 1, 'Director events normalized incorrectly');
assert(Array.isArray(normalized.audioCues) && normalized.audioCues.length === 1, 'Audio cue normalization failed');

const [event] = normalized.directorEvents;
assert(event.id === 'event-spawn', 'Event id mismatch');
assert(event.label === 'Critical Spawn', 'Event label should trim whitespace');
assert(event.category === 'spawn', 'Event category should trim whitespace');
assert(event.notes === 'push players to edges', 'Event notes should trim whitespace');
assert(event.enabled === false, 'Event enabled flag should survive normalization');
assert(event.chance === 100, 'Event chance should be clamped (0-100)');
assert(event.cooldownMs === 2200, 'Event cooldown should parse numbers');
assert(event.maxFires === 3, 'Event maxFires should parse and store as number');
assert(event.repeatMs === undefined, 'Zero repeatMs should not leak back into normalized payload');
assert(Array.isArray(event.missionIds) && event.missionIds.length === 2, 'Mission IDs should dedupe');
assert(event.missionIds[0] === 'mission-a' && event.missionIds[1] === 'mission-b', 'Mission IDs ordering wrong');
assert(event.missionId === 'mission-a', 'Mission scope should preserve missionId');
assert(event.params?.spawnCount === 4, 'Custom params should be preserved');

const [cue] = normalized.audioCues;
assert(cue.priority === 10, 'Audio cue priority should clamp between 0 and 10');
assert(cue.textCue === 'Watch the vents', 'Audio cue text should survive normalization');

const [storyMap] = normalized.maps;
assert(storyMap.storyPoints?.length === 1, 'Story points should survive normalization');
assert(storyMap.storyPoints[0].note === '  first beat  ', 'Story note should persist verbatim');

console.log('mission event normalization smoke test passed');
