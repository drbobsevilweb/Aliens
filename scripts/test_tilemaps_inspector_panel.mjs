#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const EDITOR_URL = `${BASE}/editors`;

function fail(message) {
    console.error(`[tilemaps-inspector] FAIL: ${message}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(err.message));

let pass = true;

try {
    await page.goto(EDITOR_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.click('button[data-tab="tilemap"]');
    await page.waitForSelector('#tm-canvas', { timeout: 10000 });
    await page.waitForSelector('#tm-inspector', { timeout: 10000 });

    const firstMap = page.locator('#tm-map-list .tm-map-item').first();
    await firstMap.click();
    await page.waitForTimeout(600);

    await page.click('[data-layer="props"]');
    await page.waitForTimeout(200);
    const assetThumbCount = await page.locator('#tm-inspector [data-asset-preset]').count();
    if (assetThumbCount < 3) {
        throw new Error(`Expected thumbnail asset browser entries in inspector, got ${assetThumbCount}`);
    }
    await page.fill('#tm-inspector #tm-asset-search', 'barrel');
    await page.waitForTimeout(120);
    const filteredThumbCount = await page.locator('#tm-inspector [data-asset-preset]:visible').count();
    if (filteredThumbCount < 1 || filteredThumbCount >= assetThumbCount) {
        throw new Error(`Expected asset filter to narrow the visible thumbnail list, got ${filteredThumbCount} from ${assetThumbCount}`);
    }
    await page.click('[data-preset="lamp"]');
    await page.waitForTimeout(150);

    const canvas = page.locator('#tm-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Map canvas not found');
    const target = { x: box.x + box.width * 0.52, y: box.y + box.height * 0.48 };

    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(150);

    await page.click('button[data-tool="select"]');
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(250);

    const nameInput = page.locator('#tm-obj-name');
    if (!(await nameInput.count())) {
        throw new Error('Object inspector did not open after selecting a placed prop');
    }

    const initialName = await nameInput.inputValue();
    if (!initialName) {
        throw new Error('Inspector object name is empty');
    }

    await page.click('#tm-inspector [data-asset-preset="barrel"]');
    await page.waitForTimeout(150);
    await page.fill('#tm-inspector #tm-asset-search', '');
    await page.waitForTimeout(120);

    await page.click('#tm-obj-apply');
    await page.waitForTimeout(150);

    const imageKey = await page.locator('#tm-obj-image').inputValue();
    if (imageKey !== 'prop_barrel') {
        throw new Error(`Expected image key to switch to prop_barrel from thumbnail browser, got ${imageKey}`);
    }
    await page.waitForTimeout(150);

    const beforeTileX = Number(await page.locator('#tm-obj-tilex').inputValue());
    await page.fill('#tm-obj-tilex', String(beforeTileX + 1));
    await page.click('#tm-obj-apply');
    await page.waitForTimeout(150);
    const afterTileX = Number(await page.locator('#tm-obj-tilex').inputValue());
    if (afterTileX !== beforeTileX + 1) {
        throw new Error(`Expected tileX to update from ${beforeTileX} to ${beforeTileX + 1}, got ${afterTileX}`);
    }

    await page.fill('#tm-inspector #tm-asset-search', 'hive');
    await page.waitForTimeout(120);
    await page.click('#tm-inspector [data-asset-preset="zone_hive"]');
    await page.waitForTimeout(150);
    await page.click('button[data-tool="paint"]');
    await page.waitForTimeout(100);

    const zoneTarget = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.34 };
    await page.mouse.click(zoneTarget.x, zoneTarget.y);
    await page.waitForTimeout(150);

    await page.click('button[data-tool="select"]');
    await page.waitForTimeout(100);
    await page.mouse.click(zoneTarget.x, zoneTarget.y);
    await page.waitForTimeout(250);

    const zoneKind = await page.locator('#tm-obj-kind').inputValue();
    const zoneRadius = Number(await page.locator('#tm-obj-radius').inputValue());
    const zoneImage = await page.locator('#tm-obj-image').inputValue();
    if (zoneKind !== 'zone_hive' || zoneRadius !== 128 || zoneImage !== 'zone_hive') {
        throw new Error(`Expected zone_hive placement defaults to use radius 128 and image key zone_hive, got kind=${zoneKind} radius=${zoneRadius} image=${zoneImage}`);
    }

    await page.click('[data-layer="doors"]');
    await page.waitForTimeout(150);
    await page.click('button[data-tool="paint"]');
    await page.waitForTimeout(100);

    const doorTarget = { x: box.x + box.width * 0.32, y: box.y + box.height * 0.62 };
    await page.mouse.click(doorTarget.x, doorTarget.y);
    await page.waitForTimeout(150);

    await page.click('button[data-tool="select"]');
    await page.waitForTimeout(100);
    await page.mouse.click(doorTarget.x, doorTarget.y);
    await page.waitForTimeout(250);

    const rotationSelect = page.locator('#tm-obj-rotation');
    if (!(await rotationSelect.count())) {
        throw new Error('Door inspector did not expose a rotation field');
    }

    const initialDoorWidth = Number(await page.locator('#tm-obj-w').inputValue());
    const initialDoorHeight = Number(await page.locator('#tm-obj-h').inputValue());
    const initialDoorIsFixed = (initialDoorWidth === 128 && initialDoorHeight === 64)
        || (initialDoorWidth === 64 && initialDoorHeight === 128);
    if (!initialDoorIsFixed) {
        throw new Error(`Expected door footprint to stay fixed at 128x64 or 64x128, got ${initialDoorWidth}x${initialDoorHeight}`);
    }

    await rotationSelect.selectOption('90');
    await page.waitForTimeout(100);
    await page.click('#tm-obj-apply');
    await page.waitForTimeout(150);

    const rotatedDoorWidth = Number(await page.locator('#tm-obj-w').inputValue());
    const rotatedDoorHeight = Number(await page.locator('#tm-obj-h').inputValue());
    const rotatedDoorRotation = await rotationSelect.inputValue();
    if (rotatedDoorWidth !== 64 || rotatedDoorHeight !== 128 || rotatedDoorRotation !== '90') {
        throw new Error(`Expected rotated door to resolve to 64x128 at 90°, got ${rotatedDoorWidth}x${rotatedDoorHeight} at ${rotatedDoorRotation}`);
    }

    console.log('[tilemaps-inspector] PASS: right-side inspector supports thumbnail asset picking, zone profile placement, numeric reposition, and fixed door rotation');
} catch (err) {
    pass = false;
    fail(err?.message || String(err));
}

if (errors.length) {
    console.log('[tilemaps-inspector] Browser errors:');
    errors.slice(0, 10).forEach((entry) => console.log('  ', entry));
}

await browser.close();
process.exit(pass ? 0 : 1);
