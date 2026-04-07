#!/usr/bin/env node
/**
 * Playwright test — boot screen typewriter + press-any-key + interrupt flash.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.argv[2] || 'output/boot-screen';
const url = process.argv[3] || 'http://127.0.0.1:8192/game?renderer=canvas&mission=m1&noaliens';

fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

console.log('Loading game...');
await page.goto(url, { waitUntil: 'domcontentloaded' });

// 1. Capture early boot — typewriter in progress
await sleep(2000);
await page.screenshot({ path: path.join(outDir, 'boot-typing.png') });
console.log('Screenshot: typing in progress');

// 2. Check overlay state
let state = await page.evaluate(() => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    if (!scene) return { error: 'No scene' };
    return {
        hasOverlay: !!scene.initOverlayContainer,
        waitingForKey: !!scene._initWaitingForKey,
        dismissing: !!scene._initDismissing,
        typedLen: scene.initOverlayTypedLen || 0,
        fullLen: (scene.initOverlayFullText || '').length,
        promptAlpha: scene.initOverlayPrompt?.alpha || 0,
        blocking: scene.isInitializationBlockingActive?.(scene.time.now),
    };
});
console.log('State after 2s:', JSON.stringify(state, null, 2));

// 3. Wait for typing to finish
await sleep(14000);
await page.screenshot({ path: path.join(outDir, 'boot-typed.png') });
console.log('Screenshot: typing complete');

state = await page.evaluate(() => {
    const scene = window.__ALIENS_DEBUG_SCENE__;
    if (!scene) return { error: 'No scene' };
    return {
        hasOverlay: !!scene.initOverlayContainer,
        waitingForKey: !!scene._initWaitingForKey,
        dismissing: !!scene._initDismissing,
        typedLen: scene.initOverlayTypedLen || 0,
        fullLen: (scene.initOverlayFullText || '').length,
        promptVisible: (scene.initOverlayPrompt?.alpha || 0) > 0,
        blocking: scene.isInitializationBlockingActive?.(scene.time.now),
    };
});
console.log('State after 8s:', JSON.stringify(state, null, 2));

if (!state.waitingForKey) {
    console.log('WARNING: Not yet waiting for key — may need more time');
}

// 4. Press a key to trigger dismiss
console.log('Pressing space to dismiss...');
await page.keyboard.press('Space');
await sleep(100);
await page.screenshot({ path: path.join(outDir, 'boot-flash.png') });
console.log('Screenshot: interrupt flash');

await sleep(800);
await page.screenshot({ path: path.join(outDir, 'boot-flash-mid.png') });
console.log('Screenshot: flash fading');

await sleep(1200);
await page.screenshot({ path: path.join(outDir, 'boot-revealed.png') });
console.log('Screenshot: game revealed');

state = await page.evaluate(() => {
    const scene = window.__ALIENS_DEBUG_SCENE__;
    if (!scene) return { error: 'No scene' };
    return {
        hasOverlay: !!scene.initOverlayContainer,
        blocking: scene.isInitializationBlockingActive?.(scene.time.now),
    };
});
console.log('Final state:', JSON.stringify(state, null, 2));

if (errors.length > 0) {
    console.log(`\nBrowser errors (${errors.length}):`);
    for (const e of errors) console.log(`  ${e}`);
}

const pass = !state.hasOverlay && !state.blocking;
console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} ===`);

await browser.close();
process.exit(pass ? 0 : 1);
