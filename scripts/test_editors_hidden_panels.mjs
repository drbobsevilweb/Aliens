#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE_URL = process.env.ALIENS_BASE_URL || 'http://127.0.0.1:8192';
const EDITORS_URL = `${BASE_URL}/editors`;
const SETTINGS_URL = `${BASE_URL}/settings`;

const results = [];
const consoleErrors = [];
const requestFailures = [];

function pass(name) {
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
}

function fail(name, reason) {
    results.push({ name, ok: false, reason });
    console.log(`  ✗ ${name}`);
    console.log(`    ${reason}`);
}

async function checkVisible(page, selector, name, timeout = 8000) {
    try {
        await page.waitForSelector(selector, { state: 'visible', timeout });
        pass(name);
        return true;
    } catch (error) {
        fail(name, error.message);
        return false;
    }
}

async function clickTab(page, selector, markerSelector, label) {
    try {
        await page.locator(selector).click();
        await page.waitForTimeout(250);
        await page.waitForSelector(markerSelector, { state: 'visible', timeout: 8000 });
        pass(`${label} tab loads`);
    } catch (error) {
        fail(`${label} tab loads`, error.message);
    }
}

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
});
page.on('response', async (response) => {
    if (response.status() >= 400) {
        requestFailures.push(`${response.status()} ${response.url()}`);
    }
});

try {
    console.log('\n[editors] loading');
    await page.goto(EDITORS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await checkVisible(page, 'button[data-tab="sprites"]', 'Editors shell renders');

    console.log('\n[editors] image subviews');
    await clickTab(page, 'button[data-tab="sprites"]', '#spr-view-sprites', 'Image');
    await page.locator('#spr-view-chars').click();
    await checkVisible(page, '#spr-char-registry', 'Image character registry opens');
    await page.locator('#spr-view-svg').click();
    await checkVisible(page, '#spr-svg-panel', 'Image SVG view opens');
    await page.locator('#spr-view-sprites').click();
    await checkVisible(page, '#spr-list', 'Image sprite list restores');

    console.log('\n[editors] tile maps');
    await clickTab(page, 'button[data-tab-target="tilemaps"]', '#tm-canvas', 'Tile Maps');
    await checkVisible(page, '#tm-map-list .tm-map-item', 'Tile map list populated');
    await page.locator('#tm-layers .tm-layer-row[data-layer="story"]').click();
    await checkVisible(page, '#tm-palette', 'Tile map story layer palette visible');
    await page.locator('#tm-toolbars, #tm-toolbar').evaluate(() => true).catch(() => {});
    await page.locator('#tm-zoom-fit').click();
    pass('Tile map fit control responds');

    console.log('\n[editors] missions');
    await clickTab(page, 'button[data-tab="missions"]', '#missions-save-state', 'Missions');
    await page.locator('#toggle-events-json').click();
    await checkVisible(page, 'textarea[readonly][rows="12"]', 'Mission events JSON panel toggles');
    await page.locator('#toggle-cues-json').click();
    await checkVisible(page, 'textarea[readonly][rows="10"]', 'Mission cues JSON panel toggles');
    await page.locator('#add-event').click();
    await checkVisible(page, '#events-card-list [data-event-card]', 'Mission event card can be added');

    console.log('\n[editors] sound');
    await clickTab(page, 'button[data-tab="sound"]', '#snd-list', 'Sound');
    await checkVisible(page, '#snd-toolbar', 'Sound toolbar visible');
    await checkVisible(page, '#snd-spectrum', 'Sound spectrum canvas visible');

    console.log('\n[editors] HUD');
    await clickTab(page, 'button[data-tab="hud"]', '#hud-panel-list', 'HUD');
    await checkVisible(page, '#hud-panel-list .hud-panel-item, #hud-panel-list button, #hud-panel-list div', 'HUD panel list populated');
    await checkVisible(page, '#hud-canvas', 'HUD canvas visible');

    console.log('\n[editors] texture');
    await clickTab(page, 'button[data-tab="texture"]', '#tex-display-canvas', 'Texture');
    await checkVisible(page, '#tex-asset-list', 'Texture asset list visible');
    await checkVisible(page, '#tex-palette', 'Texture palette visible');

    console.log('\n[editors] story');
    await clickTab(page, 'button[data-tab="story"]', '#story-canvas', 'Story');
    await checkVisible(page, '#story-list', 'Story list visible');
    await checkVisible(page, '#story-props', 'Story props panel visible');

    console.log('\n[settings] tabs');
    await page.goto(SETTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await checkVisible(page, '#tabs button[data-tab="marines"]', 'Settings shell renders');

    const settingsTabs = [
        ['marines', '#panel_marines'],
        ['enemies', '#panel_enemies'],
        ['objects', '#panel_objects'],
        ['walls', '#panel_walls'],
        ['other', '#panel_other'],
        ['game', '#panel_game'],
        ['map_tiles', '#panel_map_tiles'],
        ['scripting', '#panel_scripting'],
        ['sprite_animate', '#panel_sprite_animate'],
    ];

    for (const [tabId, panelSelector] of settingsTabs) {
        try {
            await page.locator(`#tabs button[data-tab="${tabId}"]`).click();
            await page.waitForTimeout(120);
            await page.waitForSelector(panelSelector, { state: 'visible', timeout: 6000 });
            pass(`Settings tab ${tabId} loads`);
            if (tabId === 'game') {
                await checkVisible(page, '#f_lighting_coreAlpha_range', 'Settings core alpha range control visible');
                await checkVisible(page, '#f_lighting_coreAlpha_number', 'Settings core alpha number control visible');
                await page.locator('#f_lighting_coreAlpha_number').fill('0.61');
                await page.waitForTimeout(80);
                const syncedValue = await page.locator('#f_lighting_coreAlpha_range').inputValue();
                if (syncedValue === '0.61') {
                    pass('Settings core alpha controls stay synchronized');
                } else {
                    fail('Settings core alpha controls stay synchronized', `expected 0.61, got ${syncedValue}`);
                }
            }
        } catch (error) {
            fail(`Settings tab ${tabId} loads`, error.message);
        }
    }
} finally {
    await browser.close();
}

const uniqueConsoleErrors = [...new Set(consoleErrors)];
const uniqueRequestFailures = [...new Set(requestFailures)].filter((entry) => !entry.includes('/favicon.ico'));
const failed = results.filter((result) => !result.ok).length;

console.log('\nSummary');
console.log(`  ${results.length - failed} passed`);
console.log(`  ${failed} failed`);

if (uniqueConsoleErrors.length) {
    console.log('\nConsole errors');
    for (const error of uniqueConsoleErrors) console.log(`  ${error}`);
}

if (uniqueRequestFailures.length) {
    console.log('\nRequest failures');
    for (const failure of uniqueRequestFailures) console.log(`  ${failure}`);
}

if (failed || uniqueConsoleErrors.length || uniqueRequestFailures.length) {
    process.exit(1);
}