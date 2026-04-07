#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.argv[2] || 'output/headed-polish-check';
const url = process.argv[3] || 'http://127.0.0.1:8192/game?renderer=canvas&mission=m5';

fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
    headless: false,
    args: ['--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console:${m.text()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(2400);

// Light move + fire + door interaction pattern to force representative FX.
await page.mouse.click(980, 460, { button: 'right' });
await sleep(1000);
await page.mouse.down({ button: 'left' });
await sleep(850);
await page.mouse.up({ button: 'left' });
await sleep(600);
await page.mouse.click(830, 500, { button: 'right' });
await sleep(1000);
await page.keyboard.press('2');
await sleep(200);
await page.mouse.down({ button: 'left' });
await sleep(900);
await page.mouse.up({ button: 'left' });
await sleep(900);

await page.screenshot({ path: path.join(outDir, 'shot-0.png') });

await page.mouse.click(1160, 360, { button: 'right' });
await sleep(900);
await page.keyboard.press('3');
await sleep(200);
await page.mouse.down({ button: 'left' });
await sleep(1100);
await page.mouse.up({ button: 'left' });
await sleep(1000);
await page.screenshot({ path: path.join(outDir, 'shot-1.png') });

const state = await page.evaluate(() => {
    const render = typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : null;
    let parsed = null;
    if (render) {
        try { parsed = JSON.parse(render); } catch { parsed = null; }
    }
    const scene = (() => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        return game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    })();
    const doors = Array.isArray(scene?.doorManager?.doorGroups) ? scene.doorManager.doorGroups : [];
    const hazards = Array.isArray(scene?.acidHazards) ? scene.acidHazards : [];
    return {
        hasRenderBridge: typeof window.render_game_to_text === 'function',
        hasScene: !!scene,
        parsed,
        acidHazards: hazards.length,
        acidWithSubHoles: hazards.filter((h) => Array.isArray(h?.subHoles) && h.subHoles.length > 0).length,
        doors: {
            total: doors.length,
            closed: doors.filter((d) => d.state === 'closed').length,
            welded: doors.filter((d) => d.state === 'welded').length,
            destroyed: doors.filter((d) => d.state === 'destroyed').length,
        },
    };
});

fs.writeFileSync(path.join(outDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
if (errors.length > 0) fs.writeFileSync(path.join(outDir, 'errors.json'), `${JSON.stringify(errors, null, 2)}\n`);

await browser.close();

console.log(JSON.stringify({
    outDir,
    stateSummary: {
        hasScene: state.hasScene,
        acidHazards: state.acidHazards,
        acidWithSubHoles: state.acidWithSubHoles,
        doors: state.doors,
    },
    errors: errors.length,
}, null, 2));
