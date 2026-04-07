/**
 * Playwright tests for Sound tab and Missions graph editor.
 * Run: node scripts/test-editor-sound-missions.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:8192';
const EDITORS_URL = `${BASE}/editors`;

const ALL_TABS = ['sprite', 'animation', 'tilemap', 'missions', 'gameconfig', 'hud', 'sound', 'missions'];

let passed = 0;
let failed = 0;
const errors = [];

function pass(name) {
    console.log(`  ✓ PASS  ${name}`);
    passed++;
}

function fail(name, reason) {
    console.log(`  ✗ FAIL  ${name}: ${reason}`);
    failed++;
    errors.push({ test: name, reason });
}

function assert(name, condition, reason = '') {
    if (condition) pass(name);
    else fail(name, reason || 'assertion failed');
}

/**
 * Returns an array that accumulates JS console errors.
 * Call snapshot() to get the current length — pass that to newErrors()
 * to retrieve only errors added after a specific point.
 */
function collectConsoleErrors(page) {
    const errs = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errs.push(msg.text());
    });
    page.on('pageerror', err => errs.push(`pageerror: ${err.message}`));
    errs.snapshot = () => errs.length;
    errs.newSince = (mark) => errs.slice(mark);
    return errs;
}

// ── TEST 1: Sound Tab ────────────────────────────────────────────────────────

async function testSoundTab(browser) {
    console.log('\n=== Test 1: Sound Tab ===');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrors = collectConsoleErrors(page);

    try {
        await page.goto(EDITORS_URL, { waitUntil: 'networkidle' });
        const errMark = consoleErrors.snapshot();

        // Click Sound tab
        const soundTabBtn = page.locator('button[data-tab="sound"]');
        assert('Sound tab button exists', await soundTabBtn.count() > 0, 'button[data-tab="sound"] not found');
        await soundTabBtn.click();

        // Wait for panel to become active
        const soundPanel = page.locator('#tab-sound');
        await soundPanel.waitFor({ state: 'visible', timeout: 3000 });
        assert('Sound panel visible', await soundPanel.isVisible(), '#tab-sound not visible');

        // Wait for renderSoundTab() to populate the innerHTML
        await page.waitForSelector('.sound-sidebar', { timeout: 3000 });
        assert('Sound sidebar exists', await page.locator('.sound-sidebar').count() > 0, '.sound-sidebar not found');

        // Category buttons: all, sfx, speech, music, ambient
        const expectedCats = ['all', 'sfx', 'speech', 'music', 'ambient'];
        for (const cat of expectedCats) {
            const btn = page.locator(`button[data-sound-cat="${cat}"]`);
            assert(`Category button "${cat}" exists`, await btn.count() > 0, `button[data-sound-cat="${cat}"] missing`);
        }

        // No NEW JS console errors after clicking the sound tab
        const newErrs = consoleErrors.newSince(errMark);
        assert('No JS console errors on Sound tab', newErrs.length === 0,
            newErrs.join(' | '));

        // Screenshot
        await page.screenshot({ path: '/home/drevilbob/Aliens/output/sound-tab-check/sound-tab.png', fullPage: false });
        console.log('  📷 Screenshot saved: output/sound-tab-check/sound-tab.png');

    } catch (e) {
        fail('Sound tab test (unexpected error)', e.message);
    } finally {
        await ctx.close();
    }
}

// ── TEST 2: Missions Graph Editor ────────────────────────────────────────────

async function testMissionsGraph(browser) {
    console.log('\n=== Test 2: Missions Graph Editor ===');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrors = collectConsoleErrors(page);

    try {
        await page.goto(EDITORS_URL, { waitUntil: 'networkidle' });
        const errMark = consoleErrors.snapshot();

        // Click Missions tab
        const missionsBtn = page.locator('button[data-tab="missions"]');
        assert('Missions tab button exists', await missionsBtn.count() > 0, 'button[data-tab="missions"] not found');
        await missionsBtn.click();

        // Wait for panel
        await page.waitForSelector('#tab-missions.active', { timeout: 3000 });
        const missionsPanel = page.locator('#tab-missions');
        assert('Missions panel visible', await missionsPanel.isVisible(), '#tab-missions not visible');

        // Canvas inside missions panel
        const canvas = page.locator('#missionGraphCanvas');
        await canvas.waitFor({ state: 'visible', timeout: 4000 });
        assert('missionGraphCanvas exists', await canvas.count() > 0, '#missionGraphCanvas not found');

        // No NEW JS console errors after clicking missions tab
        let newErrs = consoleErrors.newSince(errMark);
        assert('No JS console errors on Missions tab load', newErrs.length === 0,
            newErrs.join(' | '));

        const preDblMark = consoleErrors.snapshot();
        // Double-click canvas to trigger type picker
        await canvas.dblclick({ position: { x: 200, y: 200 } });

        // Check type picker appears
        const picker = page.locator('.graph-type-picker');
        await picker.waitFor({ state: 'visible', timeout: 2000 });
        assert('.graph-type-picker visible after dblclick', await picker.isVisible(), '.graph-type-picker not visible');

        // No new errors after double-click
        newErrs = consoleErrors.newSince(preDblMark);
        assert('No JS errors after dblclick', newErrs.length === 0,
            newErrs.join(' | '));

        // Screenshot
        await page.screenshot({ path: '/home/drevilbob/Aliens/output/missions-graph-check/graph-editor.png', fullPage: false });
        console.log('  📷 Screenshot saved: output/missions-graph-check/graph-editor.png');

    } catch (e) {
        fail('Missions graph test (unexpected error)', e.message);
    } finally {
        await ctx.close();
    }
}

// ── TEST 3: Tab Switching Stability ─────────────────────────────────────────

async function testTabSwitching(browser) {
    console.log('\n=== Test 3: Tab Switching Stability ===');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErrors = collectConsoleErrors(page);

    try {
        await page.goto(EDITORS_URL, { waitUntil: 'networkidle' });
        const errMark = consoleErrors.snapshot();

        for (const tab of ALL_TABS) {
            const btn = page.locator(`button[data-tab="${tab}"]`);
            if (await btn.count() === 0) {
                fail(`Tab button "${tab}" exists`, `button[data-tab="${tab}"] not found`);
                continue;
            }
            await btn.click();
            // Short settle — enough for RAF loop to start/stop
            await page.waitForTimeout(120);
        }

        // After all switches, verify missions panel is active (last tab clicked)
        const missionsPanel = page.locator('#tab-missions');
        assert('Missions panel active after final switch', await missionsPanel.isVisible());

        // Canvas should still be present (loop restarted cleanly)
        const canvas = page.locator('#missionGraphCanvas');
        assert('missionGraphCanvas still present after rapid switching',
            await canvas.count() > 0, '#missionGraphCanvas missing');

        // No NEW console errors from tab switching (pre-existing page-load 404s excluded)
        const newErrs = consoleErrors.newSince(errMark);
        assert('No JS errors during rapid tab switching', newErrs.length === 0,
            newErrs.slice(0, 5).join(' | '));

    } catch (e) {
        fail('Tab switching test (unexpected error)', e.message);
    } finally {
        await ctx.close();
    }
}

// ── RUNNER ───────────────────────────────────────────────────────────────────

(async () => {
    const browser = await chromium.launch({ headless: true });

    try {
        await testSoundTab(browser);
        await testMissionsGraph(browser);
        await testTabSwitching(browser);
    } finally {
        await browser.close();
    }

    console.log('\n' + '─'.repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (errors.length) {
        console.log('\nFailed tests:');
        for (const e of errors) console.log(`  - ${e.test}: ${e.reason}`);
    }
    console.log('─'.repeat(50));
    process.exit(failed > 0 ? 1 : 0);
})();
