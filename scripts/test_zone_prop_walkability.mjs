#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const GAME_URL = `${BASE}/game?mission=m1&package=local`;

function buildGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

function buildPackagePayload() {
    const width = 12;
    const height = 12;
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
    markers[10][10] = 2;

    return {
        version: '1.0',
        maps: [
            {
                id: 'pkg_zone_walkability_map',
                name: 'Zone Walkability Test',
                width,
                height,
                terrain,
                doors: buildGrid(width, height, 0),
                markers,
                terrainTextures: buildGrid(width, height, null),
                floorTextureKey: 'tile_floor_grill_import',
                wallTextureKey: 'tile_wall_corridor_import',
                props: [
                    { tileX: 4, tileY: 4, type: 'zone_hive', imageKey: 'zone_hive', radius: 128 },
                    { tileX: 6, tileY: 4, type: 'barrel', imageKey: 'prop_barrel', radius: 12 },
                ],
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
                mapId: 'pkg_zone_walkability_map',
                difficulty: 'normal',
                enemyBudget: 0,
                requiredCards: 0,
                requiredTerminals: 0,
                objective: 'Zone walkability test',
                notes: '',
                director: {},
            },
        ],
        directorEvents: [],
        audioCues: [],
    };
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const errors = [];

    await context.route('**/api/mission-package', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, package: buildPackagePayload() }),
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
        return !!(scene && scene.pathGrid && scene.roomProps);
    }, { timeout: 15000 });

    const result = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        const roomProps = Array.isArray(scene?.roomProps) ? scene.roomProps : [];
        const zoneProp = roomProps.find((prop) => prop?.kind === 'zone_hive');
        const barrelProp = roomProps.find((prop) => prop?.kind === 'barrel');
        return {
            sceneFound: !!scene,
            tilemapSource: scene?.tilemapSourceLabel,
            zoneTileWalkable: scene?.pathGrid?.isWalkable?.(4, 4) === true,
            barrelTileWalkable: scene?.pathGrid?.isWalkable?.(6, 4) === true,
            zoneProp: zoneProp
                ? {
                    blocksPath: zoneProp.blocksPath !== false ? true : false,
                    blocksLight: zoneProp.blocksLight === true,
                }
                : null,
            barrelProp: barrelProp
                ? {
                    blocksPath: barrelProp.blocksPath !== false ? true : false,
                    blocksLight: barrelProp.blocksLight === true,
                }
                : null,
        };
    });

    let pass = true;
    if (!result.sceneFound || result.tilemapSource !== 'PACKAGE') {
        console.error('[test] FAIL: runtime did not load PACKAGE override');
        pass = false;
    }
    if (!result.zoneProp || result.zoneProp.blocksPath !== false || result.zoneProp.blocksLight !== false) {
        console.error(`[test] FAIL: expected zone prop to be non-blocking, got ${JSON.stringify(result.zoneProp)}`);
        pass = false;
    }
    if (!result.barrelProp || result.barrelProp.blocksPath !== true || result.barrelProp.blocksLight !== true) {
        console.error(`[test] FAIL: expected barrel prop to remain blocking, got ${JSON.stringify(result.barrelProp)}`);
        pass = false;
    }
    if (!result.zoneTileWalkable) {
        console.error('[test] FAIL: expected zone prop tile to remain walkable');
        pass = false;
    }
    if (result.barrelTileWalkable) {
        console.error('[test] FAIL: expected barrel prop tile to be blocked');
        pass = false;
    }

    console.log('[test] Runtime:', JSON.stringify(result, null, 2));
    if (errors.length > 0) {
        console.log('[test] Browser errors:');
        errors.forEach((error) => console.log('  ', error));
    }

    await browser.close();
    process.exit(pass ? 0 : 1);
})();