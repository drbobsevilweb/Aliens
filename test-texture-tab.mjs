/**
 * Playwright test for the Texture tab in the Editors page.
 *
 * Tests:
 *  1. Navigate to /editors
 *  2. Click the Texture tab
 *  3. Verify texture editor loads
 *  4. Check asset list is visible
 *  5. Verify palette or color picker is present
 *  6. Test that texture preview canvas exists
 *  7. Verify no JS console errors
 *
 * Exit 0 = all pass, 1 = any fail.
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:8192';
const results = [];
const consoleErrors = [];

function pass(name) { results.push({ name, ok: true }); console.log('  PASS  ' + name); }
function fail(name, reason) { results.push({ name, ok: false, reason }); console.log('  FAIL  ' + name + ' — ' + reason); }

let browser, page;

try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
        consoleErrors.push(err.message);
    });

    // Test 1: Navigate to /editors
    try {
        const resp = await page.goto(BASE + '/editors', { waitUntil: 'networkidle', timeout: 15000 });
        if (resp && resp.ok()) pass('Navigate to /editors');
        else fail('Navigate to /editors', 'HTTP ' + (resp ? resp.status() : 'null'));
    } catch (err) {
        fail('Navigate to /editors', err.message);
    }

    // Test 2: Click the Texture tab
    try {
        const textureBtn = page.locator('button.tab-btn[data-tab="texture"]');
        await textureBtn.waitFor({ state: 'visible', timeout: 5000 });
        await textureBtn.click();
        await page.waitForSelector('#tex-display-canvas', { state: 'visible', timeout: 8000 });
        pass('Click the Texture tab');
    } catch (err) {
        fail('Click the Texture tab', err.message);
    }

    // Test 3: Verify texture editor loads
    try {
        const layoutSplit = page.locator('#tab-content .layout-split');
        await layoutSplit.waitFor({ state: 'visible', timeout: 5000 });
        const toolbarVisible = await page.locator('.toolbar').isVisible();
        const toolsVisible = await page.locator('.panel-header:has-text("TOOLS")').isVisible();
        if (toolbarVisible && toolsVisible) pass('Verify texture editor loads');
        else fail('Verify texture editor loads', 'toolbar=' + toolbarVisible + ', toolsPanel=' + toolsVisible);
    } catch (err) {
        fail('Verify texture editor loads', err.message);
    }

    // Test 4: Check asset list is visible
    try {
        const assetListEl = page.locator('#tex-asset-list');
        await assetListEl.waitFor({ state: 'visible', timeout: 5000 });
        const headerVisible = await page.locator('.panel-header:has-text("ASSETS")').isVisible();
        if (headerVisible) pass('Check asset list is visible');
        else fail('Check asset list is visible', 'ASSETS header not found');
    } catch (err) {
        fail('Check asset list is visible', err.message);
    }

    // Test 5: Verify palette or color picker is present
    try {
        const paletteEl = page.locator('#tex-palette');
        const paletteVisible = await paletteEl.isVisible();
        const swatchCount = await paletteEl.locator('div').count();
        const colorHexVisible = await page.locator('#tex-color-hex').isVisible();
        const previewVisible = await page.locator('#tex-color-preview').isVisible();
        const alphaVisible = await page.locator('#tex-alpha').isVisible();
        if (paletteVisible && swatchCount === 32 && colorHexVisible && previewVisible && alphaVisible) {
            pass('Verify palette or color picker is present');
        } else {
            fail('Verify palette or color picker is present',
                'palette=' + paletteVisible + ', swatches=' + swatchCount + '/32, hex=' + colorHexVisible + ', preview=' + previewVisible + ', alpha=' + alphaVisible);
        }
    } catch (err) {
        fail('Verify palette or color picker is present', err.message);
    }

    // Test 6: Test that texture preview canvas exists
    try {
        const canvas = page.locator('#tex-display-canvas');
        const canvasVisible = await canvas.isVisible();
        const dims = await canvas.evaluate(el => ({
            width: el.width, height: el.height,
            clientWidth: el.clientWidth, clientHeight: el.clientHeight,
        }));
        const hasSize = dims.width > 0 && dims.height > 0;
        if (canvasVisible && hasSize) pass('Verify texture preview canvas exists (' + dims.width + 'x' + dims.height + ')');
        else fail('Verify texture preview canvas exists', 'visible=' + canvasVisible + ', dims=' + JSON.stringify(dims));
    } catch (err) {
        fail('Verify texture preview canvas exists', err.message);
    }

    // Test 7: Verify no JS console errors
    const ignoredPatterns = [/favicon/i, /api\/health/i, /net::ERR/i, /Failed to load resource/i];
    const realErrors = consoleErrors.filter(msg => !ignoredPatterns.some(pat => pat.test(msg)));
    if (realErrors.length === 0) pass('Verify no JS console errors');
    else fail('Verify no JS console errors', realErrors.length + ' error(s): ' + realErrors.join(' | '));

} catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
} finally {
    if (browser) await browser.close();
}

console.log('\n── Summary ──');
const passed = results.filter(r => r.ok).length;
const total = results.length;
console.log(passed + '/' + total + ' tests passed');
if (passed < total) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name + ': ' + r.reason));
    process.exit(1);
} else {
    process.exit(0);
}
