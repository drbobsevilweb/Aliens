#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const GAME_URL = `${BASE}/game?mission=m1&noaliens&package=local`;

function buildGrid(width, height, fill = 0) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

function buildPackagePayload() {
    const width = 12;
    const height = 12;
    const terrain = buildGrid(width, height, 0);
    const markers = buildGrid(width, height, 0);
    const terrainTextures = buildGrid(width, height, null);
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
    terrainTextures[2][2] = 'prop_barrel';

    return {
        version: '1.0',
        maps: [
            {
                id: 'pkg_test_map',
                name: 'Package Fidelity Test',
                width,
                height,
                terrain,
                doors: buildGrid(width, height, 0),
                markers,
                terrainTextures,
                floorTextureKey: 'tile_floor_grill_import',
                wallTextureKey: 'tile_wall_corridor_import',
                props: [
                    { id: 'prop_1', tileX: 3, tileY: 3, type: 'lamp', imageKey: 'prop_lamp', radius: 8 },
                ],
                lights: [],
                atmosphere: {
                    ambientDarkness: 0.77,
                    torchRange: 333,
                },
                largeTextures: [
                    { id: 'lt_1', imageKey: 'prop_container', tileX: 5, tileY: 5, widthTiles: 2, heightTiles: 2, depth: 1.25, opacity: 0.7 },
                ],
            },
        ],
        missions: [
            {
                id: 'm1',
                name: 'Mission 1',
                mapId: 'pkg_test_map',
                difficulty: 'normal',
                enemyBudget: 0,
                requiredCards: 0,
                requiredTerminals: 0,
                objective: 'Test runtime fidelity',
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
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'output/game-runtime-fidelity.png' });

    const result = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { sceneFound: false };
        const near = (a, b, eps = 2) => Math.abs(Number(a) - Number(b)) <= eps;
        const children = Array.isArray(scene.children?.list) ? scene.children.list : [];
        const hasTerrainOverride = children.some((obj) =>
            obj?.texture?.key === 'prop_barrel'
            && near(obj.x, (2.5 * 64))
            && near(obj.y, (2.5 * 64))
            && near(obj.displayWidth, 64)
            && near(obj.displayHeight, 64)
        );
        const hasLargeTexture = children.some((obj) =>
            obj?.texture?.key === 'prop_container'
            && near(obj.x, (6 * 64))
            && near(obj.y, (6 * 64))
            && near(obj.displayWidth, 128)
            && near(obj.displayHeight, 128)
        );
        const authoredProp = Array.isArray(scene.roomProps)
            ? scene.roomProps.find((prop) => prop?.tileX === 3 && prop?.tileY === 3 && prop?.sprite?.texture?.key === 'prop_lamp')
            : null;
        return {
            sceneFound: true,
            tilemapSource: scene.tilemapSourceLabel,
            roomPropCount: Array.isArray(scene.roomProps) ? scene.roomProps.length : 0,
            authoredPropFound: !!authoredProp,
            hasTerrainOverride,
            hasLargeTexture,
            torchRange: Number(scene.atmosphereSystem?.atmosphereConfig?.torchRange) || 0,
            ambientDarkness: Number(scene.atmosphereSystem?.atmosphereConfig?.ambientDarkness) || 0,
        };
    });

    console.log('[test] Runtime fidelity:', JSON.stringify(result, null, 2));
    let pass = true;
    if (!result.sceneFound) {
        console.error('[test] FAIL: scene not found');
        pass = false;
    }
    if (result.tilemapSource !== 'PACKAGE') {
        console.error(`[test] FAIL: expected PACKAGE tilemap source, got ${result.tilemapSource}`);
        pass = false;
    }
    if (!result.authoredPropFound) {
        console.error('[test] FAIL: authored prop missing from roomProps');
        pass = false;
    }
    if (!result.hasTerrainOverride) {
        console.error('[test] FAIL: terrain texture override did not render');
        pass = false;
    }
    if (!result.hasLargeTexture) {
        console.error('[test] FAIL: large texture did not render');
        pass = false;
    }
    if (result.roomPropCount !== 1) {
        console.error(`[test] FAIL: expected 1 authored room prop and no procedural props, got ${result.roomPropCount}`);
        pass = false;
    }
    if (result.torchRange !== 333 || Math.abs(result.ambientDarkness - 0.77) > 0.001) {
        console.error('[test] FAIL: atmosphere overrides were not preserved from the package');
        pass = false;
    }
    if (errors.length > 0) {
        console.log('[test] Browser errors:');
        errors.forEach((e) => console.log('  ', e));
    }

    await browser.close();
    process.exit(pass ? 0 : 1);
})();
