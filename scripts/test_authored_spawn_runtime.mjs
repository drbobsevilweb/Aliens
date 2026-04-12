#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const GAME_URL = `${BASE}/game?mission=m1&package=local`;

function buildGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

function buildPackagePayload() {
    const width = 30;
    const height = 30;
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
    markers[28][28] = 2;

    return {
        version: '1.0',
        maps: [
            {
                id: 'pkg_spawn_runtime_map',
                name: 'Authored Spawn Runtime Test',
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
                spawnPoints: [
                    { tileX: 24, tileY: 24, count: 1, enemyType: 'queenLesser', spawnTimeSec: 1.5 },
                ],
                atmosphere: {},
                largeTextures: [],
            },
        ],
        missions: [
            {
                id: 'm1',
                name: 'Mission 1',
                mapId: 'pkg_spawn_runtime_map',
                difficulty: 'normal',
                enemyBudget: 0,
                requiredCards: 0,
                requiredTerminals: 0,
                objective: 'Authored spawn runtime test',
                notes: '',
                director: {},
            },
        ],
        directorEvents: [],
        audioCues: [],
    };
}

(async () => {
    const pkg = buildPackagePayload();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const errors = [];

    await context.route('**/api/mission-package', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, package: pkg }),
        });
    });
    await context.route('**/api/editor-state', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, state: {} }),
        });
    });

    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        return !!(scene && scene.enemyManager && scene.stageFlow && scene.sessionStartTime >= 0);
    }, { timeout: 15000 });

    const initial = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { sceneFound: false };
        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') {
                scene.clearInitializationOverlay();
            } else {
                scene.initOverlayContainer.destroy?.();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.combatDirector) scene.combatDirector.getDynamicSpawnCount = () => 0;
        return {
            sceneFound: true,
            tilemapSource: scene.tilemapSourceLabel,
            blocking: scene.isInitializationBlockingActive?.(scene.time.now) === true,
            pendingSchedule: scene.getPendingAuthoredSpawnScheduleCount?.() || 0,
            aliveCount: scene.enemyManager?.getAliveCount?.() || 0,
            stageWave: scene.stageFlow?.currentWave || 0,
            schedule: Array.isArray(scene.authoredSpawnSchedule)
                ? scene.authoredSpawnSchedule.map((point) => ({
                    tileX: point.tileX,
                    tileY: point.tileY,
                    count: point.count,
                    enemyType: point.enemyType,
                    spawnTimeSec: point.spawnTimeSec,
                    dispatched: point.dispatched === true,
                }))
                : [],
        };
    });

    await page.waitForTimeout(2800);

    const delayed = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { sceneFound: false };
        const enemies = scene.enemyManager?.getActiveEnemies?.() || [];
        return {
            sceneFound: true,
            pendingSchedule: scene.getPendingAuthoredSpawnScheduleCount?.() || 0,
            aliveCount: scene.enemyManager?.getAliveCount?.() || 0,
            activeEnemyTypes: enemies.map((enemy) => enemy?.enemyType || enemy?.type || 'unknown').sort(),
            hasAuthoredEnemyType: enemies.some((enemy) => (enemy?.enemyType || enemy?.type) === 'queenLesser'),
            dispatchedCount: Array.isArray(scene.authoredSpawnSchedule)
                ? scene.authoredSpawnSchedule.filter((point) => point?.dispatched === true).length
                : 0,
        };
    });

    let pass = true;
    if (!initial.sceneFound || initial.tilemapSource !== 'PACKAGE') {
        console.error('[test] FAIL: runtime did not load PACKAGE override');
        pass = false;
    }
    if (initial.blocking) {
        console.error('[test] FAIL: initialization overlay remained blocking after dismissal');
        pass = false;
    }
    if (initial.pendingSchedule !== 1) {
        console.error(`[test] FAIL: expected 1 pending authored spawn, got ${initial.pendingSchedule}`);
        pass = false;
    }
    if (delayed.pendingSchedule !== 0) {
        console.error(`[test] FAIL: expected scheduled authored spawn to dispatch, pending=${delayed.pendingSchedule}`);
        pass = false;
    }
    if (delayed.aliveCount < 1) {
        console.error(`[test] FAIL: expected at least one delayed authored enemy, got ${delayed.aliveCount}`);
        pass = false;
    }
    if (!delayed.hasAuthoredEnemyType) {
        console.error(`[test] FAIL: expected delayed authored enemy type to be preserved, got ${JSON.stringify(delayed.activeEnemyTypes)}`);
        pass = false;
    }
    if (delayed.dispatchedCount !== 1) {
        console.error(`[test] FAIL: expected authored spawn schedule entry to be marked dispatched, got ${delayed.dispatchedCount}`);
        pass = false;
    }

    console.log('[test] Initial:', JSON.stringify(initial, null, 2));
    console.log('[test] Delayed:', JSON.stringify(delayed, null, 2));
    if (errors.length > 0) {
        console.log('[test] Browser errors:');
        errors.forEach((error) => console.log('  ', error));
    }

    await browser.close();
    process.exit(pass ? 0 : 1);
})();