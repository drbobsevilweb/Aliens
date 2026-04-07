#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveMissionLayout } from '../src/map/missionLayout.js';
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

async function main() {
    try {
        testForceWarriorOnly();
        await testPackageOverridePreservesWarningStrobes();
        await testPackageOverridePreservesVentEggMarkersAndSpawnCounts();
        await testPackageMapSelectionDoesNotFallBackToFirstMap();
        await testDirectorEventFieldsSurviveRuntimeProjection();
        console.log('missionLayout.spec: ok');
    } catch (e) {
        console.error('missionLayout.spec FAILED:', e);
        process.exit(1);
    }
}

await main();
