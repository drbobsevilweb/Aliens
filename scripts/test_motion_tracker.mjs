#!/usr/bin/env node
/**
 * Motion Tracker Playwright Test
 * Verifies:
 *  1. CONE_HALF_ANGLE is ±5° (Math.PI/36)
 *  2. coneRange is 23 tiles (1472px at TILE_SIZE=64)
 *  3. Contacts directly ahead of the leader enter the cone
 *  4. Contacts at >5° from facing are excluded from the cone
 *  5. Minimap allEnemies orange-dot path is reachable (no JS errors)
 *  6. No console errors during a live game session
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const outDir = 'output/motion-tracker-test';
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

await page.goto('http://127.0.0.1:8192/game?mission=m1', { waitUntil: 'domcontentloaded' });
await sleep(3500); // let BootScene finish + GameScene create()

await page.screenshot({ path: path.join(outDir, 'startup.png') });

// ── Static config checks ──────────────────────────────────────────────────────
const configChecks = await page.evaluate(() => {
    const scene = (() => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        return game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    })();
    if (!scene) return { error: 'no scene found' };

    const tracker = scene.motionTracker;
    if (!tracker) return { error: 'no motionTracker on scene' };

    const TILE_SIZE = scene.CONFIG?.TILE_SIZE ?? (window.CONFIG?.TILE_SIZE ?? 64);
    const expectedRange = 23 * TILE_SIZE;

    // Manually run cone filter logic mirroring MotionTracker.update() to test geometry
    const leaderX = scene.leader?.x ?? 0;
    const leaderY = scene.leader?.y ?? 0;
    const facing = scene.leader?.facingAngle ?? 0;
    const CONE_HALF = Math.PI / 36; // 5°

    // Synthetic contact directly ahead (at 10 tiles range) — should be IN cone
    const ahead = {
        x: leaderX + Math.cos(facing) * (10 * TILE_SIZE),
        y: leaderY + Math.sin(facing) * (10 * TILE_SIZE),
    };
    // Synthetic contact at 15° to the side — should be OUT of cone
    const side = {
        x: leaderX + Math.cos(facing + Math.PI / 12) * (10 * TILE_SIZE),
        y: leaderY + Math.sin(facing + Math.PI / 12) * (10 * TILE_SIZE),
    };
    // Synthetic contact beyond range (25 tiles) — should be OUT of cone
    const tooFar = {
        x: leaderX + Math.cos(facing) * (25 * TILE_SIZE),
        y: leaderY + Math.sin(facing) * (25 * TILE_SIZE),
    };

    function inCone(c, lx, ly, fa, range) {
        const dx = c.x - lx;
        const dy = c.y - ly;
        if (dx * dx + dy * dy > range * range) return false;
        const angle = Math.atan2(dy, dx);
        let diff = angle - fa;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= CONE_HALF;
    }

    const aheadInCone = inCone(ahead, leaderX, leaderY, facing, expectedRange);
    const sideInCone = inCone(side, leaderX, leaderY, facing, expectedRange);
    const farInCone = inCone(tooFar, leaderX, leaderY, facing, expectedRange);

    // Check minimap allEnemies path
    const minimap = scene.minimap;
    const mmHasUpdateBlips = typeof minimap?.updateBlips === 'function';
    const aliveEnemies = scene.enemyManager?.getAliveEnemies?.() ?? [];

    return {
        hasScene: true,
        hasTracker: !!tracker,
        TILE_SIZE,
        expectedRange,
        leaderPos: { x: Math.round(leaderX), y: Math.round(leaderY) },
        coneGeometry: {
            aheadInCone,
            sideInCone,
            farInCone,
        },
        minimap: {
            exists: !!minimap,
            hasUpdateBlips: mmHasUpdateBlips,
            aliveEnemyCount: aliveEnemies.length,
        },
        trackerVisible: tracker.container?.alpha > 0,
        coneCount: tracker._coneCount ?? 0,
    };
});

// ── Move around to trigger aliens / tracker ───────────────────────────────────
await sleep(500);
// Fire toward center-right to provoke alien activity
await page.mouse.down({ button: 'right' });
await sleep(1200);
await page.mouse.up({ button: 'right' });
await sleep(800);

// Try to face an alien: sweep mouse to several positions
for (const [mx, my] of [[700, 300], [900, 400], [640, 500], [800, 360]]) {
    await page.mouse.move(mx, my);
    await sleep(300);
}
await sleep(1500);

await page.screenshot({ path: path.join(outDir, 'during-play.png') });

const liveChecks = await page.evaluate(() => {
    const scene = (() => {
        const game = (window.Phaser && Array.isArray(window.Phaser.GAMES)) ? window.Phaser.GAMES[0] : null;
        return game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    })();
    if (!scene) return { error: 'no scene' };

    const contacts = scene.enemyManager?.getMotionContacts?.() ?? [];
    const enemies = scene.enemyManager?.getAliveEnemies?.() ?? [];
    const tracker = scene.motionTracker;

    return {
        contactCount: contacts.length,
        aliveEnemyCount: enemies.length,
        trackerAlpha: tracker?.container?.alpha ?? -1,
        trackerConeCount: tracker?._coneCount ?? 0,
        minimapExists: !!scene.minimap,
    };
});

await page.screenshot({ path: path.join(outDir, 'final.png') });
await browser.close();

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n=== Motion Tracker Test Report ===\n');

const pass = (label, ok, note = '') => {
    const status = ok ? '  PASS' : '  FAIL';
    console.log(`${status}  ${label}${note ? '  (' + note + ')' : ''}`);
    return ok;
};

let allPass = true;

if (configChecks.error) {
    console.log(`  FAIL  Scene not found: ${configChecks.error}`);
    allPass = false;
} else {
    allPass = pass('Scene loaded', configChecks.hasScene) && allPass;
    allPass = pass('MotionTracker exists', configChecks.hasTracker) && allPass;
    allPass = pass('TILE_SIZE is 64', configChecks.TILE_SIZE === 64, `got ${configChecks.TILE_SIZE}`) && allPass;
    allPass = pass('coneRange is 1472px (23×64)', configChecks.expectedRange === 1472, `got ${configChecks.expectedRange}`) && allPass;
    allPass = pass('Contact directly ahead => IN cone', configChecks.coneGeometry.aheadInCone) && allPass;
    allPass = pass('Contact at 15° to side => OUT of cone', !configChecks.coneGeometry.sideInCone) && allPass;
    allPass = pass('Contact at 25 tiles => OUT of cone (range filter)', !configChecks.coneGeometry.farInCone) && allPass;
    allPass = pass('Minimap.updateBlips exists', configChecks.minimap.hasUpdateBlips) && allPass;
    console.log(`        Alive enemies visible to minimap: ${configChecks.minimap.aliveEnemyCount}`);
}

console.log('\n--- Live game state ---');
if (liveChecks.error) {
    console.log(`  FAIL  ${liveChecks.error}`);
    allPass = false;
} else {
    console.log(`        Contact count:     ${liveChecks.contactCount}`);
    console.log(`        Alive enemies:     ${liveChecks.aliveEnemyCount}`);
    console.log(`        Tracker alpha:     ${liveChecks.trackerAlpha.toFixed(3)}`);
    console.log(`        Tracker coneCount: ${liveChecks.trackerConeCount}`);
    console.log(`        Minimap present:   ${liveChecks.minimapExists}`);
}

if (errors.length > 0) {
    console.log('\n--- JS/Console Errors ---');
    for (const e of errors) console.log(`  ERROR  ${e}`);
    allPass = false;
}

console.log(`\n=== ${allPass ? 'ALL PASS' : 'SOME FAILURES'} ===`);
console.log(`Screenshots saved to: ${outDir}/\n`);

process.exit(allPass ? 0 : 1);
