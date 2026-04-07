#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = 'output/visual-verify-headless';
const url = 'http://127.0.0.1:8192/game?renderer=canvas&mission=m5';

fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console:${m.text()}`);
});

console.log(`Loading ${url}...`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(5000); // Give it time to load assets

// Perform some actions to trigger lighting/firing
console.log("Simulating firing...");
await page.mouse.click(980, 460, { button: 'right' }); // Aim
await sleep(500);
await page.mouse.down({ button: 'left' }); // Fire
await sleep(1000);
await page.mouse.up({ button: 'left' });
await sleep(500);

await page.screenshot({ path: path.join(outDir, 'firing.png') });
console.log(`Screenshot saved to ${outDir}/firing.png`);

await browser.close();
console.log("Visual verify complete.");
