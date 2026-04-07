#!/usr/bin/env node
/**
 * Playwright test — HUD video element alignment check.
 * Launches the game, waits for HUD to render, then inspects
 * every video element's position/size relative to its card container.
 * Takes screenshots at multiple time points to catch interference flashes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.argv[2] || 'output/hud-video-alignment';
const url = process.argv[3] || 'http://127.0.0.1:8192/game?renderer=canvas&mission=m1&noaliens';

fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

console.log('Loading game...');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(4000); // Wait for BootScene + GameScene + HUD boot sequence

console.log('Taking initial screenshot...');
await page.screenshot({ path: path.join(outDir, 'hud-initial.png') });

// Extract HUD video element data from the Phaser scene
const hudData = await page.evaluate(() => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    if (!scene) return { error: 'No GameScene found' };

    const hud = scene.hud;
    if (!hud) return { error: 'No HUD found' };

    const cards = [];
    for (const [key, card] of hud.cards.entries()) {
        const container = card.container;
        const vid = card.vid;
        const vidInter = card.vidInter;

        cards.push({
            key,
            container: {
                x: container?.x,
                y: container?.y,
                scaleX: container?.scaleX,
                scaleY: container?.scaleY,
                visible: container?.visible,
                alpha: container?.alpha,
            },
            vid: vid ? {
                x: vid.x,
                y: vid.y,
                displayWidth: vid.displayWidth,
                displayHeight: vid.displayHeight,
                visible: vid.visible,
                alpha: vid.alpha,
                originX: vid.originX,
                originY: vid.originY,
                textureKey: vid.texture?.key || null,
            } : null,
            vidInter: vidInter ? {
                x: vidInter.x,
                y: vidInter.y,
                displayWidth: vidInter.displayWidth,
                displayHeight: vidInter.displayHeight,
                visible: vidInter.visible,
                alpha: vidInter.alpha,
                originX: vidInter.originX,
                originY: vidInter.originY,
                textureKey: vidInter.texture?.key || null,
            } : null,
            cardWidth: card.cardWidth,
            cardHeight: card.cardHeight,
        });
    }

    // Motion tracker
    const mt = scene.motionTracker;
    const mtData = mt ? {
        containerX: mt.container?.x,
        containerY: mt.container?.y,
        panelW: mt.panelW,
        panelH: mt.panelH,
        interVid: mt._interVid ? {
            x: mt._interVid.x,
            y: mt._interVid.y,
            displayWidth: mt._interVid.displayWidth,
            displayHeight: mt._interVid.displayHeight,
            visible: mt._interVid.visible,
            alpha: mt._interVid.alpha,
        } : null,
    } : null;

    // Objectives panel
    const op = scene.objectivesPanel;
    const opData = op ? {
        containerX: op.container?.x,
        containerY: op.container?.y,
        panelW: op.panelW,
        panelH: op.panelH,
        interVid: op._interVid ? {
            x: op._interVid.x,
            y: op._interVid.y,
            displayWidth: op._interVid.displayWidth,
            displayHeight: op._interVid.displayHeight,
            visible: op._interVid.visible,
            alpha: op._interVid.alpha,
        } : null,
    } : null;

    // Mission log
    const ml = scene.missionLog;
    const mlData = ml ? {
        containerX: ml.container?.x,
        containerY: ml.container?.y,
        interVid: ml._interVid ? {
            x: ml._interVid.x,
            y: ml._interVid.y,
            displayWidth: ml._interVid.displayWidth,
            displayHeight: ml._interVid.displayHeight,
            visible: ml._interVid.visible,
            alpha: ml._interVid.alpha,
        } : null,
    } : null;

    return { cards, motionTracker: mtData, objectivesPanel: opData, missionLog: mlData };
});

console.log('\n=== HUD Video Element Data ===\n');
console.log(JSON.stringify(hudData, null, 2));

// Validate alignment
let issues = 0;

if (hudData.error) {
    console.error(`\nERROR: ${hudData.error}`);
    issues++;
} else {
    for (const card of hudData.cards || []) {
        console.log(`\n--- Card: ${card.key} ---`);

        if (card.vid) {
            const v = card.vid;
            console.log(`  Portrait: pos(${v.x}, ${v.y}) size(${v.displayWidth?.toFixed(1)}×${v.displayHeight?.toFixed(1)}) origin(${v.originX}, ${v.originY}) visible=${v.visible} alpha=${v.alpha?.toFixed(2)}`);
        }

        if (card.vidInter) {
            const vi = card.vidInter;
            console.log(`  Interference: pos(${vi.x}, ${vi.y}) size(${vi.displayWidth?.toFixed(1)}×${vi.displayHeight?.toFixed(1)}) origin(${vi.originX}, ${vi.originY}) visible=${vi.visible} alpha=${vi.alpha?.toFixed(2)}`);

            // Check interference covers full card
            const cw = card.cardWidth || 242;
            const ch = card.cardHeight || 168;
            if (Math.abs(vi.displayWidth - cw) > 2) {
                console.log(`  ⚠ MISALIGN: interference width ${vi.displayWidth?.toFixed(1)} != card width ${cw}`);
                issues++;
            }
            if (Math.abs(vi.displayHeight - ch) > 2) {
                console.log(`  ⚠ MISALIGN: interference height ${vi.displayHeight?.toFixed(1)} != card height ${ch}`);
                issues++;
            }
        }
    }

    if (hudData.motionTracker?.interVid) {
        const mt = hudData.motionTracker;
        const vi = mt.interVid;
        console.log(`\n--- Motion Tracker ---`);
        console.log(`  Panel: ${mt.panelW}×${mt.panelH} at (${mt.containerX}, ${mt.containerY})`);
        console.log(`  Interference: pos(${vi.x}, ${vi.y}) size(${vi.displayWidth?.toFixed(1)}×${vi.displayHeight?.toFixed(1)})`);
        if (Math.abs(vi.displayWidth - mt.panelW) > 2 || Math.abs(vi.displayHeight - mt.panelH) > 2) {
            console.log(`  ⚠ MISALIGN: interference size doesn't match panel`);
            issues++;
        }
    }

    if (hudData.objectivesPanel?.interVid) {
        const op = hudData.objectivesPanel;
        const vi = op.interVid;
        console.log(`\n--- Objectives Panel ---`);
        console.log(`  Panel: ${op.panelW}×${op.panelH} at (${op.containerX}, ${op.containerY})`);
        console.log(`  Interference: pos(${vi.x}, ${vi.y}) size(${vi.displayWidth?.toFixed(1)}×${vi.displayHeight?.toFixed(1)})`);
        if (Math.abs(vi.displayWidth - op.panelW) > 2 || Math.abs(vi.displayHeight - op.panelH) > 2) {
            console.log(`  ⚠ MISALIGN: interference size doesn't match panel`);
            issues++;
        }
    }

    if (hudData.missionLog?.interVid) {
        const ml = hudData.missionLog;
        const vi = ml.interVid;
        console.log(`\n--- Mission Log ---`);
        console.log(`  Interference: pos(${vi.x}, ${vi.y}) size(${vi.displayWidth?.toFixed(1)}×${vi.displayHeight?.toFixed(1)})`);
    }
}

// Wait longer and take more screenshots to catch interference flashes
console.log('\nWaiting for interference flashes...');
for (let i = 1; i <= 4; i++) {
    await sleep(5000);
    await page.screenshot({ path: path.join(outDir, `hud-${i * 5}s.png`) });
    console.log(`  Screenshot at ${i * 5}s`);
}

// Force a glitch on all cards for visual check
console.log('\nForcing interference glitch on all cards...');
await page.evaluate(() => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || null;
    if (!scene?.hud) return;
    const now = scene.time.now;
    for (const [key, timer] of scene.hud._glitchTimers.entries()) {
        timer.nextGlitchAt = now;
        timer.glitchEndAt = 0;
    }
    // Force motion tracker interference
    if (scene.motionTracker) {
        scene.motionTracker._nextInterAt = now;
        scene.motionTracker._interEndAt = 0;
    }
    // Force objectives panel interference
    if (scene.objectivesPanel) {
        scene.objectivesPanel._nextInterAt = now;
        scene.objectivesPanel._interEndAt = 0;
    }
    // Force mission log interference
    if (scene.missionLog) {
        scene.missionLog._nextInterAt = now;
        scene.missionLog._interEndAt = 0;
    }
});
await sleep(300); // Let the fade-in start
await page.screenshot({ path: path.join(outDir, 'hud-forced-glitch.png') });
console.log('  Forced glitch screenshot captured');

await sleep(800); // Mid-glitch
await page.screenshot({ path: path.join(outDir, 'hud-forced-glitch-mid.png') });
console.log('  Mid-glitch screenshot captured');

// Print errors
if (errors.length > 0) {
    console.log(`\n=== Browser Errors (${errors.length}) ===`);
    for (const e of errors) console.log(`  ${e}`);
    issues += errors.length;
}

console.log(`\n=== Result: ${issues === 0 ? 'PASS' : `${issues} issue(s) found`} ===`);
console.log(`Screenshots saved to ${outDir}/`);

await browser.close();
process.exit(issues > 0 ? 1 : 0);
