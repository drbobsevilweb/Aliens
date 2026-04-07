#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    getHudConfig,
    getMissionTilemapOverrideForMission,
    initRuntimeOverrides,
} from '../src/settings/missionPackageRuntime.js';

async function withApiMock({ pkg = null, state = null } = {}, fn, search = '') {
    const prevWindow = globalThis.window;
    const prevFetch = globalThis.fetch;
    globalThis.window = {
        location: { search },
    };
    globalThis.fetch = async (url) => {
        if (String(url).includes('/api/mission-package')) {
            return {
                ok: true,
                async json() {
                    return { ok: true, package: pkg };
                },
            };
        }
        if (String(url).includes('/api/editor-state')) {
            return {
                ok: true,
                async json() {
                    return { ok: true, state };
                },
            };
        }
        throw new Error(`Unexpected fetch url: ${url}`);
    };
    try {
        await initRuntimeOverrides();
        return await fn();
    } finally {
        globalThis.window = prevWindow;
        globalThis.fetch = prevFetch;
    }
}

function makePackage() {
    return {
        version: '1.0',
        hudConfig: { cards: [{ key: 'leader', x: 10, y: 20 }] },
        maps: [{
            id: 'pkg_map',
            name: 'Package Map',
            width: 8,
            height: 8,
            terrain: Array.from({ length: 8 }, () => Array(8).fill(0)),
            doors: Array.from({ length: 8 }, () => Array(8).fill(0)),
            markers: Array.from({ length: 8 }, () => Array(8).fill(0)),
            terrainTextures: Array.from({ length: 8 }, () => Array(8).fill(null)),
            props: [],
            lights: [],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'pkg_map',
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
}

async function testDefaultModeIgnoresPackageMapOverridesByDefault() {
    const result = await withApiMock({ pkg: makePackage() }, () => ({
        hud: getHudConfig(),
        map: getMissionTilemapOverrideForMission('m1', ''),
    }));

    assert.ok(result.hud && typeof result.hud === 'object', 'file-backed HUD config should remain available by default');
    assert.equal(result.map, null);
}

async function testHudLocalStillDoesNotEnablePackageMapOverrides() {
    const pkg = makePackage();
    const result = await withApiMock({ pkg }, () => ({
        hud: getHudConfig(),
        map: getMissionTilemapOverrideForMission('m1', ''),
    }), '?hud=local');

    assert.ok(result.hud && typeof result.hud === 'object', 'file-backed HUD config should stay available');
    assert.equal(result.map, null);
}

async function testPackageLocalEnablesPackageOverridePath() {
    const pkg = makePackage();
    const result = await withApiMock({ pkg }, () => ({
        hud: getHudConfig(),
        map: getMissionTilemapOverrideForMission('m1', ''),
    }), '?package=local');

    assert.ok(result.hud && typeof result.hud === 'object', 'HUD config remains file-backed');
    assert.equal(result.map?.id, 'pkg_map');
}

async function main() {
    await testDefaultModeIgnoresPackageMapOverridesByDefault();
    await testHudLocalStillDoesNotEnablePackageMapOverrides();
    await testPackageLocalEnablesPackageOverridePath();
    console.log('runtimeOverrideModes.spec: ok');
}

await main();
