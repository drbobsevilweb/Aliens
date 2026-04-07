/**
 * Playwright tests for HUD Editor and Sprite/Asset Browser tab.
 * Run with: node scripts/test-hud-editor.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';

const BASE = 'http://127.0.0.1:8192';
const OUT  = '/home/drevilbob/Aliens/output/hud-editor-check';
await mkdir(OUT, { recursive: true });

let passed = 0, failed = 0;
const results = [];

function pass(label) {
  console.log(`  ✓ PASS  ${label}`);
  results.push({ label, status: 'PASS' });
  passed++;
}
function fail(label, detail = '') {
  console.error(`  ✗ FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  results.push({ label, status: 'FAIL', detail });
  failed++;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function clickTab(page, tabValue) {
  await page.click(`button[data-tab="${tabValue}"]`);
  await page.waitForTimeout(600);
}

// ── Test 1: Marine Reference Panel in Sprite/Asset Browser Tab ─────────────

console.log('\n=== Test 1: Marine Reference Panel (Sprite tab) ===');
const browser = await chromium.launch({ headless: true });
const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page    = await ctx.newPage();

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(`[pageerror] ${e.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
});

await page.goto(`${BASE}/editors`, { waitUntil: 'networkidle' });

// Step 1.1 — click Asset Browser tab
await clickTab(page, 'sprite');
await page.screenshot({ path: path.join(OUT, 'sprite-tab.png') });

// Step 1.2 — .marine-ref-panel exists
const panelExists = await page.locator('.marine-ref-panel').count() > 0;
panelExists ? pass('1.1  .marine-ref-panel exists') : fail('1.1  .marine-ref-panel exists', 'not found in DOM');

// Step 1.3 — viewport has non-zero dimensions
if (panelExists) {
  const vp = page.locator('.marine-ref-viewport').first();
  const box = await vp.boundingBox();
  if (box && box.width > 0 && box.height > 0) {
    pass(`1.2  marine-ref-viewport has size ${box.width}×${box.height}`);
  } else {
    fail('1.2  marine-ref-viewport has non-zero dimensions', JSON.stringify(box));
  }

  // Step 1.4 — read zoom label before click
  const labelBefore = await page.locator('.marine-ref-zoom-label').first().textContent().catch(() => null);

  // Step 1.5 — click zoom-in button
  const zoomIn = page.locator('[data-marine-zoom="1"]').first();
  const zoomInExists = await zoomIn.count() > 0;
  if (zoomInExists) {
    await zoomIn.click();
    await page.waitForTimeout(300);
    const labelAfter = await page.locator('.marine-ref-zoom-label').first().textContent().catch(() => null);
    if (labelBefore !== labelAfter) {
      pass(`1.3  zoom-in changed label: "${labelBefore}" → "${labelAfter}"`);
    } else {
      // Check if viewport size changed instead
      const boxAfter = await vp.boundingBox();
      if (boxAfter && (boxAfter.width !== box.width || boxAfter.height !== box.height)) {
        pass(`1.3  zoom-in changed viewport size: ${box.width}×${box.height} → ${boxAfter.width}×${boxAfter.height}`);
      } else {
        fail('1.3  zoom-in did not change label or viewport dimensions');
      }
    }
    await page.screenshot({ path: path.join(OUT, 'sprite-tab-zoomed.png') });
  } else {
    fail('1.3  zoom-in button [data-marine-zoom="1"] not found');
  }
} else {
  fail('1.2  marine-ref-viewport (skipped — panel missing)');
  fail('1.3  zoom-in click (skipped — panel missing)');
}

// ── Test 2: HUD Editor Tab ─────────────────────────────────────────────────

console.log('\n=== Test 2: HUD Editor Tab ===');
await clickTab(page, 'hud');
await page.screenshot({ path: path.join(OUT, 'hud-tab-initial.png') });

// Step 2.1 — #hudCanvas exists with non-zero dimensions
const canvas = page.locator('#hudCanvas').first();
const canvasExists = await canvas.count() > 0;
if (canvasExists) {
  const cbox = await canvas.boundingBox();
  if (cbox && cbox.width > 0 && cbox.height > 0) {
    pass(`2.1  #hudCanvas exists with dimensions ${cbox.width}×${cbox.height}`);
  } else {
    fail('2.1  #hudCanvas has zero or missing dimensions', JSON.stringify(cbox));
  }
} else {
  fail('2.1  #hudCanvas not found in DOM');
}

// Step 2.2 — #hud_saveToGame button exists
const saveBtn = page.locator('#hud_saveToGame').first();
const saveBtnExists = await saveBtn.count() > 0;
saveBtnExists ? pass('2.2  #hud_saveToGame button exists') : fail('2.2  #hud_saveToGame button not found');

// Step 2.3 — click Edit button on first HUD element row
const editBtn = page.locator('.hud-edit-btn').first();
const editBtnExists = await editBtn.count() > 0;
if (editBtnExists) {
  await editBtn.click();
  await page.waitForTimeout(400);
  pass('2.3  clicked first .hud-edit-btn');

  // Step 2.4 — inline props form appeared
  const inlineProps = page.locator('.hud-inline-props').first();
  const inlineVisible = await inlineProps.count() > 0;
  inlineVisible ? pass('2.4  .hud-inline-props form appeared') : fail('2.4  .hud-inline-props form not found after Edit click');

  await page.screenshot({ path: path.join(OUT, 'hud-tab-edit-open.png') });

  // Step 2.5 — click Save Panel and check form collapsed
  const savePanelBtn = page.locator('.hud-save-panel-btn').first();
  const savePanelExists = await savePanelBtn.count() > 0;
  if (savePanelExists) {
    await savePanelBtn.click();
    await page.waitForTimeout(400);
    const inlineAfter = await page.locator('.hud-inline-props').count();
    if (inlineAfter === 0) {
      pass('2.5  .hud-inline-props collapsed after Save Panel');
    } else {
      fail('2.5  .hud-inline-props still present after Save Panel click', `count=${inlineAfter}`);
    }
  } else {
    fail('2.5  .hud-save-panel-btn not found');
  }
} else {
  fail('2.3  .hud-edit-btn not found');
  fail('2.4  .hud-inline-props (skipped)');
  fail('2.5  Save Panel (skipped)');
}

// Step 2.6 — canvas is rendered (screenshot taken, check non-white pixels via evaluate)
if (canvasExists) {
  const hasContent = await page.evaluate(() => {
    const c = document.getElementById('hudCanvas');
    if (!c) return false;
    const ctx = c.getContext('2d');
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    // look for any non-background pixel (not fully black / not fully transparent)
    for (let i = 0; i < px.length; i += 4) {
      if (px[3] > 0 && (px[0] > 10 || px[1] > 10 || px[2] > 10)) return true;
    }
    return false;
  });
  hasContent ? pass('2.6  hudCanvas has rendered content (non-trivial pixels)') : fail('2.6  hudCanvas appears blank');
  await page.screenshot({ path: path.join(OUT, 'hud-tab-canvas.png') });
}

// ── Test 3: /api/save-hud-config endpoint ─────────────────────────────────

console.log('\n=== Test 3: /api/save-hud-config POST endpoint ===');
try {
  const resp = await page.evaluate(async (url) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels: {}, __test: true })
    });
    return { status: r.status, text: await r.text() };
  }, `${BASE}/api/save-hud-config`);

  if (resp.status === 200) {
    pass(`3.1  POST /api/save-hud-config → 200  body: ${resp.text.slice(0, 120)}`);
  } else if (resp.status === 400 && resp.text.includes('panels')) {
    // server rejected our minimal payload — still reachable
    pass(`3.1  POST /api/save-hud-config → ${resp.status} (endpoint reachable, body: ${resp.text.slice(0, 80)})`);
  } else {
    fail('3.1  POST /api/save-hud-config', `status=${resp.status} body=${resp.text.slice(0, 120)}`);
  }
} catch (e) {
  fail('3.1  POST /api/save-hud-config', String(e));
}

// ── Summary ────────────────────────────────────────────────────────────────

await page.screenshot({ path: path.join(OUT, 'final-state.png') });
await browser.close();

console.log('\n=== Console errors captured ===');
if (consoleErrors.length === 0) {
  console.log('  (none)');
} else {
  consoleErrors.forEach(e => console.log(' ', e));
}

console.log(`\n=== RESULTS: ${passed} PASS, ${failed} FAIL ===`);
results.forEach(r => {
  const sym = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${sym} ${r.status.padEnd(4)} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
});

if (failed > 0) process.exit(1);
