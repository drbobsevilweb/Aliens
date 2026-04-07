/**
 * Playwright test for the Actions (Story) tab node editor in /editors.
 * Run with: node test-actions-tab.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8192';
const TIMEOUT = 10000;

let browser, page;
let passed = 0, failed = 0;
const results = [];
const consoleErrors = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
        results.push({ name, status: 'PASS' });
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed++;
        results.push({ name, status: 'FAIL', error: err.message });
        console.log(`  FAIL  ${name}`);
        console.log(`        ${err.message}`);
    }
}

async function run() {
    console.log('\n=== Actions (Story) Tab — Playwright Tests ===\n');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    page = await context.newPage();

    // Collect JS console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });
    page.on('pageerror', err => {
        consoleErrors.push(err.message);
    });

    // ── 1. Navigate to /editors ──
    await test('1. Navigate to /editors', async () => {
        const resp = await page.goto(`${BASE}/editors`, { waitUntil: 'networkidle', timeout: TIMEOUT });
        if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`);
    });

    // ── 2. Click the Actions tab ──
    await test('2. Click the Actions tab', async () => {
        const btn = page.locator('button.tab-btn[data-tab="story"]');
        await btn.waitFor({ state: 'visible', timeout: TIMEOUT });
        await btn.click();
        // Wait for the story tab to render its UI
        await page.waitForSelector('#story-canvas', { timeout: TIMEOUT });
    });

    // ── 3. Verify story canvas exists ──
    await test('3. Verify #story-canvas exists', async () => {
        const el = await page.$('#story-canvas');
        if (!el) throw new Error('#story-canvas not found');
        const tag = await el.evaluate(e => e.tagName.toLowerCase());
        if (tag !== 'canvas') throw new Error(`Expected canvas, got ${tag}`);
    });

    // ── 4. Verify graph list exists ──
    await test('4. Verify #story-list exists', async () => {
        const el = await page.$('#story-list');
        if (!el) throw new Error('#story-list not found');
    });

    // ── 5. Verify properties panel exists ──
    await test('5. Verify #story-props exists', async () => {
        const el = await page.$('#story-props');
        if (!el) throw new Error('#story-props not found');
    });

    // ── 6. Click "+ New" button ──
    await test('6. Click "+ New" button to open dialog', async () => {
        const btn = page.locator('#story-new-btn');
        await btn.waitFor({ state: 'visible', timeout: TIMEOUT });
        await btn.click();
        // The modal should appear with ng-name input
        await page.waitForSelector('#ng-name', { timeout: TIMEOUT });
    });

    // ── 7. Type graph name and click Create ──
    const graphName = 'TestGraph_' + Date.now();
    await test('7. Type graph name and click Create', async () => {
        await page.fill('#ng-name', graphName);
        await page.click('#ng-create');
        // Modal overlay becomes hidden (not detached — the close() sets hidden=true)
        await page.waitForSelector('#modal-overlay[hidden]', { timeout: TIMEOUT });
    });

    // ── 8. Verify graph appears in list ──
    await test('8. Verify graph appears in #story-list', async () => {
        const listItem = page.locator('#story-list .story-list-item', { hasText: graphName });
        await listItem.waitFor({ state: 'visible', timeout: TIMEOUT });
        const text = await listItem.textContent();
        if (!text.includes(graphName)) throw new Error(`Graph name "${graphName}" not found in list`);
    });

    // ── 9. Right-click on canvas to open context menu ──
    await test('9. Right-click canvas to open context menu', async () => {
        const canvasBox = await page.locator('#story-canvas').boundingBox();
        if (!canvasBox) throw new Error('Canvas has no bounding box');
        // Right-click near the center of the canvas
        await page.mouse.click(
            canvasBox.x + canvasBox.width / 2,
            canvasBox.y + canvasBox.height / 2,
            { button: 'right' }
        );
        // Context menu should appear
        await page.waitForSelector('#story-ctx-menu', { timeout: TIMEOUT });
    });

    // ── 10. Verify context menu shows all 5 node types ──
    await test('10. Verify context menu shows EVENT, CONDITION, ACTION, DELAY, GETTER', async () => {
        const menu = page.locator('#story-ctx-menu');
        const items = await menu.locator('div').allTextContents();
        const joined = items.join(' ');
        const expected = ['EVENT', 'CONDITION', 'ACTION', 'DELAY', 'GETTER'];
        for (const label of expected) {
            if (!joined.includes(label)) {
                throw new Error(`Context menu missing "${label}". Got: ${joined}`);
            }
        }
    });

    // ── 11. Click GETTER to add a getter node ──
    await test('11. Click GETTER in context menu to add node', async () => {
        const getterItem = page.locator('#story-ctx-menu div', { hasText: 'GETTER' });
        await getterItem.click();
        // Context menu should dismiss
        await page.waitForSelector('#story-ctx-menu', { state: 'detached', timeout: 5000 }).catch(() => {});
    });

    // ── 12. Verify node appears on canvas ──
    await test('12. Verify getter node was added to graph', async () => {
        // The graph was seeded with 1 event node, now we added a getter => 2 nodes
        const nodeCount = await page.evaluate(() => {
            const listItems = document.querySelectorAll('#story-list .story-list-item');
            for (const item of listItems) {
                if (item.classList.contains('active') || item.style.background.includes('rgba')) {
                    const countText = item.textContent;
                    const match = countText.match(/\((\d+)\)/);
                    return match ? parseInt(match[1]) : -1;
                }
            }
            return -1;
        });
        if (nodeCount < 2) throw new Error(`Expected >=2 nodes, got ${nodeCount}`);
    });

    // ── 13. Verify properties panel shows getter Source dropdown ──
    await test('13. Verify getter properties show Source dropdown', async () => {
        const propsPanel = page.locator('#story-props');
        const headerText = await propsPanel.textContent();
        if (!headerText.includes('GETTER NODE')) {
            throw new Error('Properties panel does not show GETTER NODE header');
        }
        const sourceSelect = propsPanel.locator('select[data-field="source"]');
        await sourceSelect.waitFor({ state: 'visible', timeout: TIMEOUT });
        const options = await sourceSelect.locator('option').allTextContents();
        const expectedSources = ['leader.health', 'aliveEnemies', 'currentWave', 'totalKills'];
        for (const src of expectedSources) {
            if (!options.includes(src)) {
                throw new Error(`Source dropdown missing "${src}". Options: ${options.join(', ')}`);
            }
        }
    });

    // ── 14. Add a CONDITION node via context menu ──
    await test('14. Add a CONDITION node via context menu', async () => {
        const canvasBox = await page.locator('#story-canvas').boundingBox();
        await page.mouse.click(
            canvasBox.x + canvasBox.width * 0.3,
            canvasBox.y + canvasBox.height * 0.6,
            { button: 'right' }
        );
        await page.waitForSelector('#story-ctx-menu', { timeout: TIMEOUT });
        const condItem = page.locator('#story-ctx-menu div', { hasText: 'CONDITION' });
        await condItem.click();
        await page.waitForSelector('#story-ctx-menu', { state: 'detached', timeout: 5000 }).catch(() => {});
        const nodeCount = await page.evaluate(() => {
            const listItems = document.querySelectorAll('#story-list .story-list-item');
            for (const item of listItems) {
                if (item.classList.contains('active') || item.style.background.includes('rgba')) {
                    const match = item.textContent.match(/\((\d+)\)/);
                    return match ? parseInt(match[1]) : -1;
                }
            }
            return -1;
        });
        if (nodeCount < 3) throw new Error(`Expected >=3 nodes after adding condition, got ${nodeCount}`);
    });

    // ── 15. Verify condition node properties show Check, Operator, Value ──
    await test('15. Verify condition properties show Check, Operator, Value', async () => {
        const propsPanel = page.locator('#story-props');
        const headerText = await propsPanel.textContent();
        if (!headerText.includes('CONDITION NODE')) {
            throw new Error('Properties panel does not show CONDITION NODE header');
        }
        const checkInput = propsPanel.locator('input[data-field="check"]');
        await checkInput.waitFor({ state: 'visible', timeout: TIMEOUT });
        const checkVal = await checkInput.inputValue();
        if (checkVal !== 'damage') throw new Error(`Check default expected "damage", got "${checkVal}"`);

        const opSelect = propsPanel.locator('select[data-field="operator"]');
        await opSelect.waitFor({ state: 'visible', timeout: TIMEOUT });
        const opOptions = await opSelect.locator('option').allTextContents();
        const expectedOps = ['>=', '<=', '>', '<', '==', '!=', 'contains'];
        for (const op of expectedOps) {
            if (!opOptions.includes(op)) throw new Error(`Operator dropdown missing "${op}"`);
        }

        const valueInput = propsPanel.locator('input[data-field="value"]');
        await valueInput.waitFor({ state: 'visible', timeout: TIMEOUT });
    });

    // ── 16. Test Save button ──
    await test('16. Test Save button (#story-save-btn)', async () => {
        const saveBtn = page.locator('#story-save-btn');
        await saveBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
        await saveBtn.click();
        await page.waitForTimeout(1500);
        const toasts = await page.locator('.toast').allTextContents();
        const hasError = toasts.some(t => t.toLowerCase().includes('fail'));
        if (hasError) throw new Error(`Save produced error toast: ${toasts.join('; ')}`);
    });

    // ── 17. Test Validate button ──
    await test('17. Test Validate button (#story-validate-btn)', async () => {
        const valBtn = page.locator('#story-validate-btn');
        await valBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
        await valBtn.click();
        await page.waitForTimeout(500);
        const modalVisible = await page.locator('#modal-overlay:not([hidden])').isVisible().catch(() => false);
        const toasts = await page.locator('.toast').allTextContents();
        const hasValidationResult = modalVisible || toasts.some(t =>
            t.toLowerCase().includes('valid') || t.toLowerCase().includes('issue')
        );
        if (!hasValidationResult) {
            throw new Error('Validate button produced no visible feedback (no modal or toast)');
        }
        if (modalVisible) {
            await page.click('#modal-close');
        }
    });

    // ── 18. Verify no JS console errors ──
    await test('18. Verify no JS console errors', async () => {
        const real = consoleErrors.filter(e => {
            if (e.includes('favicon')) return false;
            if (e.includes('404')) return false;
            if (e.includes('net::ERR')) return false;
            if (e.includes('Failed to load resource')) return false;
            return true;
        });
        if (real.length > 0) {
            throw new Error(`${real.length} JS console error(s):\n  - ${real.join('\n  - ')}`);
        }
    });

    // ── Summary ──
    await browser.close();

    console.log('\n=== Results ===\n');
    for (const r of results) {
        const mark = r.status === 'PASS' ? 'PASS' : 'FAIL';
        console.log(`  [${mark}] ${r.name}`);
    }
    console.log(`\n  Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Fatal error:', err);
    if (browser) browser.close();
    process.exit(1);
});
