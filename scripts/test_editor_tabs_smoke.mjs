#!/usr/bin/env node
/**
 * Smoke test: /editors interface tab behaviour.
 * Uses headless Chromium via Playwright.
 *
 * Tests:
 *   1. /editors loads without JS errors
 *   2. All 7 tabs are visible
 *   3. Sound tab shows 12 built-in sounds
 *   4. Missions tab shows #missionGraphCanvas
 *   5. HUD tab shows SAVE TO GAME button
 *   6. Asset Browser tab shows Marine Reference panel
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:8192';
const EDITORS_URL = `${BASE_URL}/editors`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── result tracking ────────────────────────────────────────────────────────
const results = [];
const consoleErrors = [];

function pass(name) {
    results.push({ name, ok: true });
    console.log(`  ✓  ${name}`);
}

function fail(name, reason) {
    results.push({ name, ok: false, reason });
    console.log(`  ✗  ${name}`);
    console.log(`       → ${reason}`);
}

// ── launch browser ─────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
});

// ── 1. Load /editors ───────────────────────────────────────────────────────
console.log('\n[1] Loading /editors …');
try {
    await page.goto(EDITORS_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    // Wait for JS to initialise (tabs rendered by app.js)
    await page.waitForSelector('#tabs button', { timeout: 8_000 });
    await sleep(600); // let tab init finish
    if (consoleErrors.length === 0) {
        pass('Page loads without JS errors');
    } else {
        fail('Page loads without JS errors', `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 2).join('; ')}`);
    }
} catch (e) {
    fail('Page loads without JS errors', e.message);
    await browser.close();
    process.exit(1);
}

// ── 2. All 7 tabs visible ──────────────────────────────────────────────────
console.log('\n[2] Checking all 7 tabs are visible …');
const EXPECTED_TABS = [
    { label: 'Asset Browser', selector: 'button[data-tab="sprite"]' },
    { label: 'Animation',     selector: 'button[data-tab="animation"]' },
    { label: 'Tilemap',       selector: 'button[data-tab="tilemap"]' },
    { label: 'Missions',      selector: 'button[data-tab="missions"]' },
    { label: 'Game Config',   selector: 'button[data-tab="gameconfig"]' },
    { label: 'HUD',           selector: 'button[data-tab="hud"]' },
    { label: 'Sound',         selector: 'button[data-tab="sound"]' },
];

for (const tab of EXPECTED_TABS) {
    const el = await page.$(tab.selector);
    if (el && await el.isVisible()) {
        pass(`Tab visible: ${tab.label}`);
    } else {
        fail(`Tab visible: ${tab.label}`, `selector "${tab.selector}" not found or not visible`);
    }
}

// ── 3. Sound tab — 12 built-in sounds ─────────────────────────────────────
console.log('\n[3] Sound tab — checking 12 built-in sounds …');
await page.click('button[data-tab="sound"]');
await sleep(400);
try {
    await page.waitForSelector('#soundListEl', { timeout: 5_000 });
    const itemCount = await page.$$eval(
        '#soundListEl .sound-list-item',
        (els) => els.length,
    );
    if (itemCount >= 12) {
        pass(`Sound tab: ${itemCount} sound items visible (≥12 expected)`);
    } else {
        fail('Sound tab: ≥12 sounds visible', `found only ${itemCount} items in #soundListEl`);
    }
} catch (e) {
    fail('Sound tab: #soundListEl present', e.message);
}

// ── 4. Missions tab — canvas element ──────────────────────────────────────
console.log('\n[4] Missions tab — checking for graph canvas …');
await page.click('button[data-tab="missions"]');
await sleep(600); // graph init may be async
try {
    await page.waitForSelector('#missionGraphCanvas', { timeout: 5_000 });
    const visible = await page.isVisible('#missionGraphCanvas');
    if (visible) {
        pass('Missions tab: #missionGraphCanvas is visible');
    } else {
        fail('Missions tab: #missionGraphCanvas is visible', 'element exists but is not visible');
    }
} catch (e) {
    fail('Missions tab: #missionGraphCanvas present', e.message);
}

// ── 5. HUD tab — modular HUD controls ─────────────────────────────────────
console.log('\n[5] HUD tab — checking modular HUD controls …');
await page.click('button[data-tab="hud"]');
await sleep(400);
try {
    await page.waitForSelector('#hud-save', { timeout: 5_000 });
    await page.waitForSelector('#hud-canvas', { timeout: 5_000 });
    const saveText = await page.$eval('#hud-save', (el) => el.textContent.trim());
    const panelLabels = await page.$$eval('#hud-panel-list .hud-panel-item', (items) => items.map((item) => item.textContent.trim()));
    if (saveText === 'Save to Game') pass(`HUD tab: modular save button present (text: "${saveText}")`);
    else fail('HUD tab: modular save button text', `got "${saveText}"`);
    if (panelLabels.some((label) => label.includes('MAP Panel')) && panelLabels.some((label) => label.includes('Subtitles'))) {
        pass('HUD tab: MAP Panel and Subtitles entries present');
    } else {
        fail('HUD tab: MAP/Subtitles entries present', `labels=${JSON.stringify(panelLabels)}`);
    }
} catch (e) {
    fail('HUD tab: modular HUD controls present', e.message);
}

// ── 6. Asset Browser tab — Marine Reference panel ─────────────────────────
console.log('\n[6] Asset Browser tab — checking Marine Reference panel …');
await page.click('button[data-tab="sprite"]');
await sleep(400);
try {
    await page.waitForSelector('.marine-ref-title', { timeout: 5_000 });
    const text = await page.$eval('.marine-ref-title', (el) => el.textContent.trim());
    if (text.includes('Marine Reference')) {
        pass(`Asset Browser tab: Marine Reference panel found (text: "${text}")`);
    } else {
        fail('Asset Browser tab: Marine Reference panel text', `got "${text}"`);
    }
} catch (e) {
    fail('Asset Browser tab: .marine-ref-title present', e.message);
}

// ── summary ────────────────────────────────────────────────────────────────
await browser.close();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log('\n─────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (consoleErrors.length > 0) {
    console.log('\nJS console errors captured during run:');
    for (const e of consoleErrors) console.log(`  • ${e}`);
} else {
    console.log('No JS console errors captured.');
}

if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((r) => !r.ok)) {
        console.log(`  ✗  ${r.name}: ${r.reason}`);
    }
    process.exit(1);
}

console.log('\nAll tests passed.');
process.exit(0);
