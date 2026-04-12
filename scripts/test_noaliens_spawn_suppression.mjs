#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE_URL = process.env.ALIENS_BASE_URL || 'http://127.0.0.1:8192';
const NO_ALIENS_URL = `${BASE_URL}/game?mission=m1&renderer=canvas&noaliens`;
const STOCK_URL = `${BASE_URL}/game?mission=m1&renderer=canvas`;
const PACKAGE_URL = `${BASE_URL}/game?mission=m1&package=local&renderer=canvas`;

function buildGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

function buildEnemyFreePackage() {
    const width = 18;
    const height = 18;
    const terrain = buildGrid(width, height, 0);
    const markers = buildGrid(width, height, 0);

    for (let x = 0; x < width; x++) {
        terrain[0][x] = 1;
        terrain[height - 1][x] = 1;
    }
    for (let y = 0; y < height; y++) {
        terrain[y][0] = 1;
        terrain[y][width - 1] = 1;
    }

    markers[1][1] = 1;
    markers[16][16] = 2;

    return {
        version: '1.0',
        maps: [
            {
                id: 'pkg_enemy_free_map',
                name: 'Enemy Free Package Map',
                width,
                height,
                terrain,
                doors: buildGrid(width, height, 0),
                markers,
                terrainTextures: buildGrid(width, height, null),
                floorTextureKey: 'tile_floor_grill_import',
                wallTextureKey: 'tile_wall_corridor_import',
                props: [],
                lights: [],
                storyPoints: [],
                spawnPoints: [],
                atmosphere: {},
                largeTextures: [],
            },
        ],
        missions: [
            {
                id: 'm1',
                name: 'Mission 1',
                mapId: 'pkg_enemy_free_map',
                difficulty: 'normal',
                enemyBudget: 24,
                requiredCards: 0,
                requiredTerminals: 0,
                objective: 'Enemy-free package suppression test',
                notes: '',
                director: {},
            },
        ],
        directorEvents: [],
        audioCues: [],
        nodeGraphs: [],
    };
}

async function waitForScene(page) {
    await page.waitForFunction(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        return !!(scene && scene.enemyManager && scene.reinforcementSystem && scene.pathGrid);
    }, { timeout: 20000 });
}

async function evaluateNoAliensScenario(page) {
    return page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };

        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
            else {
                scene.initOverlayContainer.destroy?.();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
        if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();

        const marines = scene.squadSystem?.getAllMarines?.() || [scene.leader];
        const world = scene.findNearestWalkableWorld(scene.leader.x + (8 * 64), scene.leader.y, 8)
            || scene.findNearestWalkableWorld(scene.leader.x, scene.leader.y + (8 * 64), 8);
        const before = scene.enemyManager?.getAliveCount?.() || 0;

        scene.stageFlow.state = 'combat';
        scene.stageFlow._combatEnteredAt = scene.time.now;
        scene.nextVentSwarmAt = 0;
        scene.nextGunfireReinforceAt = 0;
        scene.nextReinforcementSpawnAt = 0;
        scene.pressureGraceUntil = 0;
        scene.lastActionAt = -100000;
        scene.getCombatPressure = () => 1;
        scene.getDirectorState = () => 'peak';
        scene.combatMods = { pressure: 1, state: 'peak' };

        const manual = world
            ? scene.enemyManager.spawnEnemyAtWorld('warrior', world.x, world.y, 1)
            : null;

        scene.updateVentSwarmAmbush(scene.time.now, marines);
        scene.reinforcementSystem.tryGunfireReinforcement(scene.time.now, scene.leader.x, scene.leader.y, marines);
        scene.useMissionPackageDirector = true;
        scene.missionDirectorEvents = [{
            id: 'noaliens_spawn_probe',
            enabled: true,
            trigger: 'always',
            action: 'spawn_pack',
            params: { size: 2, source: 'idle', dir: 'E' },
        }];
        scene.missionDirectorEventState = new Map();
        scene.updateMissionDirectorEvents(scene.time.now, marines);

        const after = scene.enemyManager?.getAliveCount?.() || 0;
        return {
            noAliens: scene.noAliens === true,
            suppressAll: scene.areAllEnemySpawnsSuppressed?.() === true,
            suppressAmbient: scene.areAmbientEnemySpawnsSuppressed?.() === true,
            manualSpawnBlocked: manual == null,
            aliveBefore: before,
            aliveAfter: after,
        };
    });
}

async function evaluatePackageScenario(page) {
    return page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };

        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
            else {
                scene.initOverlayContainer.destroy?.();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
        if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();

        const marines = scene.squadSystem?.getAllMarines?.() || [scene.leader];
        const world = scene.findNearestWalkableWorld(scene.leader.x + (8 * 64), scene.leader.y, 8)
            || scene.findNearestWalkableWorld(scene.leader.x, scene.leader.y + (8 * 64), 8);
        const before = scene.enemyManager?.getAliveCount?.() || 0;

        scene.stageFlow.state = 'combat';
        scene.stageFlow._combatEnteredAt = scene.time.now;
        scene.nextVentSwarmAt = 0;
        scene.nextGunfireReinforceAt = 0;
        scene.nextReinforcementSpawnAt = 0;
        scene.pressureGraceUntil = 0;
        scene.lastActionAt = -100000;
        scene.getCombatPressure = () => 1;
        scene.getDirectorState = () => 'peak';
        scene.combatMods = { pressure: 1, state: 'peak' };
        const cueMessages = [];
        const originalShowFloatingText = scene.showFloatingText?.bind(scene);
        scene.showFloatingText = (x, y, text, color) => {
            cueMessages.push(String(text || ''));
            return originalShowFloatingText ? originalShowFloatingText(x, y, text, color) : undefined;
        };

        const manual = world
            ? scene.enemyManager.spawnEnemyAtWorld('warrior', world.x, world.y, 1)
            : null;

        scene.updateVentSwarmAmbush(scene.time.now, marines);
        scene.reinforcementSystem.tryGunfireReinforcement(scene.time.now, scene.leader.x, scene.leader.y, marines);
        scene.useMissionPackageDirector = true;
        scene.missionDirectorEvents = [{
            id: 'package_spawn_probe',
            enabled: true,
            trigger: 'always',
            action: 'spawn_pack',
            params: { size: 2, source: 'idle', dir: 'E' },
        }, {
            id: 'package_text_probe',
            enabled: true,
            trigger: 'always',
            action: 'text_cue',
            params: { text: 'Director cue live' },
        }];
        scene.missionDirectorEventState = new Map();
        scene.updateMissionDirectorEvents(scene.time.now, marines);
        scene.showFloatingText = originalShowFloatingText;

        const after = scene.enemyManager?.getAliveCount?.() || 0;
        return {
            tilemapSource: scene.tilemapSourceLabel,
            spawnPointCount: Array.isArray(scene.missionLayout?.spawnPoints) ? scene.missionLayout.spawnPoints.length : -1,
            suppressAll: scene.areAllEnemySpawnsSuppressed?.() === true,
            suppressAmbient: scene.areAmbientEnemySpawnsSuppressed?.() === true,
            manualSpawnBlocked: manual == null,
            activeMissionWaveCount: Array.isArray(scene.activeMissionWaves) ? scene.activeMissionWaves.length : -1,
            aliveBefore: before,
            aliveAfter: after,
            cueMessages,
        };
    });
}

async function evaluateStockScenario(page) {
    return page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };

        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
            else {
                scene.initOverlayContainer.destroy?.();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
        if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();

        const marines = scene.squadSystem?.getAllMarines?.() || [scene.leader];
        const world = scene.findNearestWalkableWorld(scene.leader.x + (8 * 64), scene.leader.y, 8)
            || scene.findNearestWalkableWorld(scene.leader.x, scene.leader.y + (8 * 64), 8);
        const before = scene.enemyManager?.getAliveCount?.() || 0;

        scene.stageFlow.state = 'combat';
        scene.stageFlow._combatEnteredAt = scene.time.now;
        scene.nextVentSwarmAt = 0;
        scene.nextGunfireReinforceAt = 0;
        scene.nextReinforcementSpawnAt = 0;
        scene.pressureGraceUntil = 0;
        scene.lastActionAt = -100000;
        scene.getCombatPressure = () => 1;
        scene.getDirectorState = () => 'peak';
        scene.combatMods = { pressure: 1, state: 'peak' };

        const manual = world
            ? scene.enemyManager.spawnEnemyAtWorld('warrior', world.x, world.y, 1)
            : null;

        scene.updateVentSwarmAmbush(scene.time.now, marines);
        scene.reinforcementSystem.tryGunfireReinforcement(scene.time.now, scene.leader.x, scene.leader.y, marines);
        scene.useMissionPackageDirector = true;
        scene.missionDirectorEvents = [{
            id: 'stock_spawn_probe',
            enabled: true,
            trigger: 'always',
            action: 'spawn_pack',
            params: { size: 2, source: 'idle', dir: 'E' },
        }];
        scene.missionDirectorEventState = new Map();
        scene.updateMissionDirectorEvents(scene.time.now, marines);

        const after = scene.enemyManager?.getAliveCount?.() || 0;
        return {
            tilemapSource: scene.tilemapSourceLabel,
            requireAuthoredAlienSpawns: scene.requireAuthoredAlienSpawns === true,
            spawnPointCount: Array.isArray(scene.missionLayout?.spawnPoints) ? scene.missionLayout.spawnPoints.length : -1,
            suppressAll: scene.areAllEnemySpawnsSuppressed?.() === true,
            suppressAmbient: scene.areAmbientEnemySpawnsSuppressed?.() === true,
            manualSpawnBlocked: manual == null,
            activeMissionWaveCount: Array.isArray(scene.activeMissionWaves) ? scene.activeMissionWaves.length : -1,
            aliveBefore: before,
            aliveAfter: after,
        };
    });
}

function recordConsole(page, consoleErrors, pageErrors) {
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
}

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const failures = [];

    try {
        {
            const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            recordConsole(page, consoleErrors, pageErrors);

            await page.goto(NO_ALIENS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForScene(page);
            const result = await evaluateNoAliensScenario(page);
            console.log('[noaliens]', JSON.stringify(result, null, 2));

            if (result.err) failures.push(`noaliens: ${result.err}`);
            if (result.noAliens !== true) failures.push('noaliens: expected scene.noAliens === true');
            if (result.suppressAll !== true) failures.push('noaliens: expected all enemy spawns to be suppressed');
            if (result.suppressAmbient !== true) failures.push('noaliens: expected ambient enemy spawns to be suppressed');
            if (result.manualSpawnBlocked !== true) failures.push('noaliens: direct enemy spawn was not blocked');
            if (result.aliveBefore !== 0 || result.aliveAfter !== 0) failures.push(`noaliens: expected 0 alive enemies before/after probe, got ${result.aliveBefore}/${result.aliveAfter}`);
            if (consoleErrors.length) failures.push(`noaliens console errors: ${consoleErrors.join(' | ')}`);
            if (pageErrors.length) failures.push(`noaliens page errors: ${pageErrors.join(' | ')}`);

            await context.close();
        }

        {
            const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            recordConsole(page, consoleErrors, pageErrors);

            await context.route('**/api/mission-package', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, package: buildEnemyFreePackage() }),
                });
            });
            await context.route('**/api/editor-state', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: {} }),
                });
            });

            await page.goto(PACKAGE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForScene(page);
            const result = await evaluatePackageScenario(page);
            console.log('[package-zero-spawn]', JSON.stringify(result, null, 2));

            if (result.err) failures.push(`package-zero-spawn: ${result.err}`);
            if (result.tilemapSource !== 'PACKAGE') failures.push(`package-zero-spawn: expected PACKAGE tilemap source, got ${result.tilemapSource}`);
            if (result.spawnPointCount !== 0) failures.push(`package-zero-spawn: expected 0 spawn points, got ${result.spawnPointCount}`);
            if (result.suppressAll !== true) failures.push('package-zero-spawn: expected direct enemy spawns to be suppressed for fail-closed m1');
            if (result.suppressAmbient !== true) failures.push('package-zero-spawn: expected ambient enemy spawns to be suppressed');
            if (result.manualSpawnBlocked !== true) failures.push('package-zero-spawn: direct enemy spawn was not blocked');
            if (result.activeMissionWaveCount !== 0) failures.push(`package-zero-spawn: expected 0 opening waves, got ${result.activeMissionWaveCount}`);
            if (result.aliveBefore !== 0 || result.aliveAfter !== 0) failures.push(`package-zero-spawn: expected 0 alive enemies before/after ambient probes, got ${result.aliveBefore}/${result.aliveAfter}`);
            if (!Array.isArray(result.cueMessages) || !result.cueMessages.includes('DIRECTOR CUE LIVE')) {
                failures.push(`package-zero-spawn: expected non-spawn mission director cue to fire under ambient suppression, got ${JSON.stringify(result.cueMessages)}`);
            }
            if (consoleErrors.length) failures.push(`package-zero-spawn console errors: ${consoleErrors.join(' | ')}`);
            if (pageErrors.length) failures.push(`package-zero-spawn page errors: ${pageErrors.join(' | ')}`);

            await context.close();
        }

        {
            const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            recordConsole(page, consoleErrors, pageErrors);

            await page.goto(STOCK_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForScene(page);
            const result = await evaluateStockScenario(page);
            console.log('[stock-m1-zero-spawn]', JSON.stringify(result, null, 2));

            if (result.err) failures.push(`stock-m1-zero-spawn: ${result.err}`);
            if (result.tilemapSource !== 'TILED') failures.push(`stock-m1-zero-spawn: expected TILED tilemap source, got ${result.tilemapSource}`);
            if (result.requireAuthoredAlienSpawns !== true) failures.push('stock-m1-zero-spawn: expected m1 to require authored alien spawns');
            if (result.spawnPointCount !== 0) failures.push(`stock-m1-zero-spawn: expected 0 spawn points, got ${result.spawnPointCount}`);
            if (result.suppressAll !== true) failures.push('stock-m1-zero-spawn: expected direct enemy spawns to be suppressed');
            if (result.suppressAmbient !== true) failures.push('stock-m1-zero-spawn: expected ambient enemy spawns to be suppressed');
            if (result.manualSpawnBlocked !== true) failures.push('stock-m1-zero-spawn: direct enemy spawn was not blocked');
            if (result.activeMissionWaveCount !== 0) failures.push(`stock-m1-zero-spawn: expected 0 opening waves, got ${result.activeMissionWaveCount}`);
            if (result.aliveBefore !== 0 || result.aliveAfter !== 0) failures.push(`stock-m1-zero-spawn: expected 0 alive enemies before/after probes, got ${result.aliveBefore}/${result.aliveAfter}`);
            if (consoleErrors.length) failures.push(`stock-m1-zero-spawn console errors: ${consoleErrors.join(' | ')}`);
            if (pageErrors.length) failures.push(`stock-m1-zero-spawn page errors: ${pageErrors.join(' | ')}`);

            await context.close();
        }
    } finally {
        await browser.close();
    }

    if (failures.length) {
        console.error('\nFAILURES');
        for (const failure of failures) console.error(`- ${failure}`);
        process.exit(1);
    }

    console.log('\nPASS: no-aliens and zero-spawn ambient suppression checks');
})();
