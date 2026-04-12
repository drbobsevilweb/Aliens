#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveMissionLayout } from '../src/map/missionLayout.js';
import { MissionFlow } from '../src/systems/MissionFlow.js';
import {
    initRuntimeOverrides,
    getMissionDirectorEventsForMission,
    getMissionTilemapOverrideForMission,
} from '../src/settings/missionPackageRuntime.js';

/**
 * Regression spec for missionLayout and wave composition.
 */

async function withRuntimeApiMock(payloads, fn, options = {}) {
    const prevWindow = globalThis.window;
    const prevPhaser = globalThis.Phaser;
    const prevFetch = globalThis.fetch;
    const search = typeof options.search === 'string' ? options.search : '';
    globalThis.window = {
        location: { search },
    };
    globalThis.fetch = async (url) => {
        if (String(url).includes('/api/mission-package')) {
            return {
                ok: true,
                async json() {
                    return { ok: true, package: payloads?.package ?? null };
                },
            };
        }
        if (String(url).includes('/api/editor-state')) {
            return {
                ok: true,
                async json() {
                    return { ok: true, state: payloads?.state ?? null };
                },
            };
        }
        throw new Error(`Unexpected fetch url: ${url}`);
    };
    globalThis.Phaser = {
        Math: {
            Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
            Between: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),
            FloatBetween: (min, max) => Math.random() * (max - min) + min,
            Distance: {
                Between: (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2)
            }
        }
    };
    try {
        await initRuntimeOverrides();
        return await fn();
    } finally {
        globalThis.window = prevWindow;
        globalThis.Phaser = prevPhaser;
        globalThis.fetch = prevFetch;
    }
}

function withSettingsMock(settings, fn) {
    const RUNTIME_SETTINGS_KEY = 'aliens_runtime_settings_v1';
    const prevWindow = globalThis.window;
    globalThis.window = {
        ...(prevWindow || {}),
        localStorage: {
            getItem: (key) => key === RUNTIME_SETTINGS_KEY ? JSON.stringify(settings) : null,
            setItem: () => {},
            removeItem: () => {},
        },
    };
    try {
        return fn();
    } finally {
        globalThis.window = prevWindow;
    }
}

function hasReachablePath(tilemap, startTile, endTile, allowDoors = true) {
    const terrain = tilemap?.terrain;
    const doors = tilemap?.doors;
    const width = Math.max(0, tilemap?.width || terrain?.[0]?.length || 0);
    const height = Math.max(0, tilemap?.height || terrain?.length || 0);
    if (!Array.isArray(terrain) || !startTile || !endTile || width <= 0 || height <= 0) return false;
    const key = (x, y) => `${x},${y}`;
    const queue = [[startTile.x, startTile.y]];
    const visited = new Set([key(startTile.x, startTile.y)]);
    let head = 0;
    while (head < queue.length) {
        const [x, y] = queue[head++];
        if (x === endTile.x && y === endTile.y) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (terrain[ny]?.[nx] !== 0) continue;
            if (!allowDoors && (doors?.[ny]?.[nx] || 0) > 0) continue;
            const nextKey = key(nx, ny);
            if (visited.has(nextKey)) continue;
            visited.add(nextKey);
            queue.push([nx, ny]);
        }
    }
    return false;
}

function testForceWarriorOnly() {
    console.log('[test-mission-layout] Testing forceWarriorOnly effect on waves...');
    
    // Test with warriorOnly = 1
    const layoutWarrior = withSettingsMock({ enemies: { warriorOnly: 1 } }, () => {
        return resolveMissionLayout('m1');
    });
    
    assert.equal(layoutWarrior.forceWarriorOnly, true, 'forceWarriorOnly should be true in layout');
    
    // Check all spawns in all waves are warriors
    for (const wave of layoutWarrior.missionWaves) {
        for (const spawn of wave) {
            assert.equal(spawn.type, 'warrior', `Spawn type should be warrior, got ${spawn.type}`);
        }
    }
    
    // Test with warriorOnly = 0 (mixed)
    // Note: m1 by default might have mixed or warrior only depending on mission data,
    // but building with warriorOnly=0 should at least respect the mission data.
    const layoutMixed = withSettingsMock({ enemies: { warriorOnly: 0 } }, () => {
        return resolveMissionLayout('m1');
    });
    assert.equal(layoutMixed.forceWarriorOnly, false, 'forceWarriorOnly should be false in layout');

    console.log('[test-mission-layout] forceWarriorOnly assertions passed.');
}

async function testPackageOverridePreservesWarningStrobes() {
    console.log('[test-mission-layout] Testing package marker 6 preservation...');
    const pkg = {
        version: '1.0',
        maps: [{
            id: 'lv1_colony_hub',
            name: 'Level 1: Colony Hub',
            width: 8,
            height: 8,
            terrain: Array.from({ length: 8 }, () => Array(8).fill(0)),
            doors: Array.from({ length: 8 }, () => Array(8).fill(0)),
            markers: Array.from({ length: 8 }, (_, y) =>
                Array.from({ length: 8 }, (_, x) => (x === 3 && y === 4 ? 6 : 0))
            ),
            terrainTextures: Array.from({ length: 8 }, () => Array(8).fill(null)),
            props: [],
            lights: [],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'lv1_colony_hub',
            difficulty: 'normal',
            enemyBudget: 0,
            requiredCards: 0,
            requiredTerminals: 0,
            objective: '',
            notes: '',
            director: {},
        }],
        directorEvents: [],
        audioCues: [],
    };

    const layout = await withRuntimeApiMock(
        { package: pkg },
        () => resolveMissionLayout('m1'),
        { search: '?package=local' }
    );

    assert.equal(layout.tilemapSource, 'PACKAGE', 'package override should be active');
    assert.equal(layout.tilemap.markers[4][3], 6, 'warning strobe marker should survive package normalization');
    console.log('[test-mission-layout] package marker preservation assertions passed.');
}

async function testPackageOverridePreservesVentEggMarkersAndSpawnCounts() {
    console.log('[test-mission-layout] Testing package markers 7/8 and counted spawn slots...');
    const size = 20;
    const emptyGrid = () => Array.from({ length: size }, () => Array(size).fill(0));
    const pkg = {
        version: '1.0',
        maps: [{
            id: 'lv1_colony_hub',
            name: 'Level 1: Colony Hub',
            width: size,
            height: size,
            terrain: emptyGrid(),
            doors: emptyGrid(),
            markers: Array.from({ length: size }, (_, y) =>
                Array.from({ length: size }, (_, x) => {
                    if (x === 1 && y === 1) return 1;
                    if (x === 18 && y === 18) return 2;
                    if (x === 12 && y === 12) return 7;
                    if (x === 14 && y === 14) return 8;
                    return 0;
                })
            ),
            terrainTextures: Array.from({ length: size }, () => Array(size).fill(null)),
            props: [
                { type: 'alien_spawn', tileX: 16, tileY: 16, count: 4 },
            ],
            lights: [],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'lv1_colony_hub',
            difficulty: 'normal',
            enemyBudget: 4,
            requiredCards: 0,
            requiredTerminals: 0,
            objective: '',
            notes: '',
            director: {},
        }],
        directorEvents: [],
        audioCues: [],
    };

    const layout = await withRuntimeApiMock(
        { package: pkg },
        () => resolveMissionLayout('m1'),
        { search: '?package=local' }
    );

    assert.equal(layout.tilemap.markers[12][12], 7, 'vent marker should survive package normalization');
    assert.equal(layout.tilemap.markers[14][14], 8, 'egg marker should survive package normalization');
    assert.equal(layout.ventPoints.length, 1, 'vent point should be collected from package markers');
    assert.equal(layout.eggClusters.length, 1, 'egg cluster should be collected from package markers');

    const authoredSpawnEntries = layout.missionWaves.reduce((sum, wave) => {
        return sum + wave.filter((spawn) => spawn.tileX === 16 && spawn.tileY === 16).length;
    }, 0);
    assert.ok(authoredSpawnEntries >= 4, 'counted authored spawn should preserve at least four authored spawn slots');
    console.log('[test-mission-layout] package marker 7/8 and counted spawn assertions passed.');
}

async function testPackageMapSelectionDoesNotFallBackToFirstMap() {
    console.log('[test-mission-layout] Testing package map selection does not hijack unrelated missions...');
    const pkg = {
        version: '1.0',
        maps: [
            {
                id: 'custom_map_a',
                name: 'Custom A',
                width: 8,
                height: 8,
                terrain: Array.from({ length: 8 }, () => Array(8).fill(0)),
                doors: Array.from({ length: 8 }, () => Array(8).fill(0)),
                markers: Array.from({ length: 8 }, () => Array(8).fill(0)),
                terrainTextures: Array.from({ length: 8 }, () => Array(8).fill(null)),
                props: [],
                lights: [],
            },
            {
                id: 'custom_map_b',
                name: 'Custom B',
                width: 8,
                height: 8,
                terrain: Array.from({ length: 8 }, () => Array(8).fill(0)),
                doors: Array.from({ length: 8 }, () => Array(8).fill(0)),
                markers: Array.from({ length: 8 }, () => Array(8).fill(0)),
                terrainTextures: Array.from({ length: 8 }, () => Array(8).fill(null)),
                props: [],
                lights: [],
            }
        ],
        missions: [
            { id: 'm1', name: 'Mission 1', mapId: 'custom_map_a', difficulty: 'normal', enemyBudget: 0, requiredCards: 0, requiredTerminals: 0, objective: '', notes: '', director: {} },
            { id: 'm2', name: 'Mission 2', mapId: 'missing_map', difficulty: 'normal', enemyBudget: 0, requiredCards: 0, requiredTerminals: 0, objective: '', notes: '', director: {} }
        ],
        directorEvents: [],
        audioCues: [],
    };

    const override = await withRuntimeApiMock(
        { package: pkg },
        () => getMissionTilemapOverrideForMission('m2', ''),
        { search: '?package=local' }
    );

    assert.equal(override, null, 'mission with unresolved mapId should not silently fall back to the first package map');
    console.log('[test-mission-layout] package map-selection assertions passed.');
}

async function testDirectorEventFieldsSurviveRuntimeProjection() {
    console.log('[test-mission-layout] Testing director event control-field projection...');
    const pkg = {
        version: '1.0',
        maps: [],
        missions: [],
        directorEvents: [
            {
                id: 'evt_1',
                missionId: 'm1',
                trigger: 'time:10',
                action: 'text_cue',
                enabled: false,
                chance: 25,
                cooldownMs: 1500,
                repeatMs: 3000,
                maxFires: 2,
                params: { text: 'test' },
            }
        ],
        audioCues: [],
    };

    const events = await withRuntimeApiMock(
        { package: pkg },
        () => getMissionDirectorEventsForMission('m1'),
        { search: '?package=local' }
    );

    assert.equal(events.length, 1, 'scoped mission event should survive runtime projection');
    assert.equal(events[0].enabled, false, 'enabled flag should survive runtime projection');
    assert.equal(events[0].chance, 25, 'chance should survive runtime projection');
    assert.equal(events[0].cooldownMs, 1500, 'cooldownMs should survive runtime projection');
    assert.equal(events[0].repeatMs, 3000, 'repeatMs should survive runtime projection');
    assert.equal(events[0].maxFires, 2, 'maxFires should survive runtime projection');
    console.log('[test-mission-layout] director event projection assertions passed.');
}

async function testZeroAuthoredSpawnPointsProduceNoAliens() {
    console.log('[test-mission-layout] Testing zero authored spawn points disable alien fallback...');
    const size = 20;
    const emptyGrid = () => Array.from({ length: size }, () => Array(size).fill(0));
    const pkg = {
        version: '1.0',
        maps: [{
            id: 'lv1_colony_hub',
            name: 'Level 1: Colony Hub',
            width: size,
            height: size,
            terrain: emptyGrid(),
            doors: emptyGrid(),
            markers: Array.from({ length: size }, (_, y) =>
                Array.from({ length: size }, (_, x) => {
                    if (x === 1 && y === 1) return 1;
                    if (x === 18 && y === 18) return 2;
                    return 0;
                })
            ),
            terrainTextures: Array.from({ length: size }, () => Array(size).fill(null)),
            props: [],
            lights: [],
            spawnPoints: [],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'lv1_colony_hub',
            difficulty: 'normal',
            enemyBudget: 24,
            requiredCards: 0,
            requiredTerminals: 0,
            objective: '',
            notes: '',
            director: {},
        }],
        directorEvents: [],
        audioCues: [],
    };

    const layout = await withRuntimeApiMock(
        { package: pkg },
        () => resolveMissionLayout('m1'),
        { search: '?package=local' }
    );

    assert.equal(layout.spawnPoints.length, 0, 'map should report zero canonical spawn points');
    assert.equal(layout.missionWaves.length, 0, 'mission should not synthesize fallback alien waves');
    console.log('[test-mission-layout] zero-authored-spawn assertions passed.');
}

function testBuiltInMissionOneRequiresAuthoredAlienSpawns() {
    console.log('[test-mission-layout] Testing built-in m1 preserves authored timed alien spawns...');
    const layout = resolveMissionLayout('m1');
    assert.equal(layout.mission.requireAuthoredAlienSpawns, true, 'm1 should explicitly require authored alien spawns');
    assert.equal(layout.spawnPoints.length, 3, 'built-in m1 should expose the three authored alien spawn points from the Tiled map');
    assert.ok(layout.spawnPoints.every((point) => point.enemyType === 'warrior'), 'built-in m1 should preserve authored enemy types');
    assert.ok(layout.spawnPoints.every((point) => point.spawnTimeSec === 2.5), 'built-in m1 should preserve authored timed spawn delay');
    assert.equal(layout.missionWaves.length, 0, 'built-in m1 should not synthesize an opening wave when all authored spawns are delayed');
    console.log('[test-mission-layout] built-in m1 authored timed-spawn assertions passed.');
}

function testBuiltInCampaignUsesAuthoredSpawnPointsOnly() {
    console.log('[test-mission-layout] Testing built-in authored-spawn-only wave projection...');
    const missionIds = ['m2', 'm3', 'm4', 'm5'];
    for (const missionId of missionIds) {
        const layout = resolveMissionLayout(missionId);
        const immediateSpawnCount = layout.spawnPoints
            .filter((point) => (Number(point.spawnTimeSec) || 0) <= 0)
            .reduce((sum, point) => sum + Math.max(1, Math.round(Number(point.count) || 1)), 0);
        const waveSpawnCount = layout.missionWaves.reduce((sum, wave) => sum + wave.length, 0);
        assert.equal(layout.requireAuthoredAlienSpawns, true, `${missionId} should use authored alien spawns only`);
        assert.equal(layout.missionWaves.length, immediateSpawnCount > 0 ? 1 : 0, `${missionId} should only project one opening authored-spawn wave`);
        assert.equal(waveSpawnCount, immediateSpawnCount, `${missionId} opening wave should match immediate authored spawn count`);
    }
    console.log('[test-mission-layout] built-in authored-spawn-only assertions passed.');
}

async function testTimedAndTypedSpawnPointsSurviveLayoutProjection() {
    console.log('[test-mission-layout] Testing typed/timed authored spawn point projection...');
    const size = 20;
    const emptyGrid = () => Array.from({ length: size }, () => Array(size).fill(0));
    const pkg = {
        version: '1.0',
        maps: [{
            id: 'lv1_colony_hub',
            name: 'Level 1: Colony Hub',
            width: size,
            height: size,
            terrain: emptyGrid(),
            doors: emptyGrid(),
            markers: Array.from({ length: size }, (_, y) =>
                Array.from({ length: size }, (_, x) => {
                    if (x === 1 && y === 1) return 1;
                    if (x === 18 && y === 18) return 2;
                    return 0;
                })
            ),
            terrainTextures: Array.from({ length: size }, () => Array(size).fill(null)),
            props: [],
            lights: [],
            spawnPoints: [
                { tileX: 12, tileY: 12, count: 2, enemyType: 'drone', spawnTimeSec: 0 },
                { tileX: 14, tileY: 14, count: 1, enemyType: 'queenLesser', spawnTimeSec: 6 },
            ],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'lv1_colony_hub',
            difficulty: 'normal',
            enemyBudget: 0,
            requiredCards: 0,
            requiredTerminals: 0,
            objective: '',
            notes: '',
            director: {},
        }],
        directorEvents: [],
        audioCues: [],
    };

    const layout = await withRuntimeApiMock(
        { package: pkg },
        () => resolveMissionLayout('m1'),
        { search: '?package=local' }
    );

    assert.deepEqual(layout.spawnPoints, [
        { tileX: 12, tileY: 12, count: 2, enemyType: 'drone', spawnTimeSec: 0 },
        { tileX: 14, tileY: 14, count: 1, enemyType: 'queenLesser', spawnTimeSec: 6 },
    ], 'layout should preserve canonical typed/timed spawn point fields');
    assert.equal(layout.missionWaves.length, 1, 'package tilemap overrides should only build the opening immediate authored-spawn wave');
    assert.equal(layout.missionWaves[0].length, 2, 'only immediate authored spawns should appear in opening wave');
    assert.ok(layout.missionWaves[0].every((spawn) => spawn.type === 'drone'), 'explicit enemyType should be used for immediate authored spawns');
    console.log('[test-mission-layout] typed/timed spawn projection assertions passed.');
}

function testFallbackObjectiveTargetsStayReachable() {
    console.log('[test-mission-layout] Testing fallback objective targets stay reachable from spawn...');
    const layout = resolveMissionLayout('m1');
    const flow = new MissionFlow(layout.mission, layout.tilemap, { warriorOnly: layout.warriorOnly === true });
    assert.ok(flow.cardTargets.length >= 1, 'm1 should produce at least one card target');
    assert.equal(
        hasReachablePath(layout.tilemap, layout.spawnTile, flow.cardTargets[0], true),
        true,
        `fallback card target should be reachable from spawn, got (${flow.cardTargets[0].x},${flow.cardTargets[0].y})`
    );
    console.log('[test-mission-layout] fallback objective reachability assertions passed.');
}

async function main() {
    try {
        testForceWarriorOnly();
        await testPackageOverridePreservesWarningStrobes();
        await testPackageOverridePreservesVentEggMarkersAndSpawnCounts();
        await testPackageMapSelectionDoesNotFallBackToFirstMap();
        await testDirectorEventFieldsSurviveRuntimeProjection();
        await testZeroAuthoredSpawnPointsProduceNoAliens();
        testBuiltInMissionOneRequiresAuthoredAlienSpawns();
        testBuiltInCampaignUsesAuthoredSpawnPointsOnly();
        await testTimedAndTypedSpawnPointsSurviveLayoutProjection();
        testFallbackObjectiveTargetsStayReachable();
        console.log('missionLayout.spec: ok');
    } catch (e) {
        console.error('missionLayout.spec FAILED:', e);
        process.exit(1);
    }
}

await main();
