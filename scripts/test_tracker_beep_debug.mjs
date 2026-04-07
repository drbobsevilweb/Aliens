#!/usr/bin/env node
/**
 * Debug test: instruments tracker beep audio calls to identify duplicates.
 * Logs every playTrackerPing and playTrackerCarrierHiss call with timestamps.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = 'output/tracker-beep-debug';
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
});

await page.goto('http://127.0.0.1:8192/game?mission=m1', { waitUntil: 'domcontentloaded' });

// Wait for GameScene to be ready (up to 20s)
console.log('Waiting for GameScene...');
for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        return !!(s && s.leader && s.sfx);
    });
    if (ready) break;
    await sleep(500);
}
await sleep(2000); // let enemies start spawning

// Dismiss any overlays
await page.evaluate(() => {
    const s = window.__ALIENS_DEBUG_SCENE__;
    if (!s) return;
    if (s.initOverlayContainer) {
        if (typeof s.clearInitializationOverlay === 'function') s.clearInitializationOverlay();
    }
    if (s.controlsOverlay?.visible) s.controlsOverlay.setVisible(false);
    if (s.isPaused) s.togglePause?.();
});

// Instrument the SfxEngine methods to log every call
await page.evaluate(() => {
    const scene = window.__ALIENS_DEBUG_SCENE__;
    if (!scene || !scene.sfx) { window.__BEEP_LOG__ = [{ error: 'no scene/sfx' }]; return; }

    window.__BEEP_LOG__ = [];
    const sfx = scene.sfx;
    
    const origPing = sfx.playTrackerPing.bind(sfx);
    sfx.playTrackerPing = function(opts) {
        window.__BEEP_LOG__.push({
            fn: 'playTrackerPing',
            t: performance.now(),
            strong: opts?.strong,
            proximity: opts?.proximity,
        });
        return origPing(opts);
    };

    const origHiss = sfx.playTrackerCarrierHiss.bind(sfx);
    sfx.playTrackerCarrierHiss = function() {
        window.__BEEP_LOG__.push({
            fn: 'playTrackerCarrierHiss',
            t: performance.now(),
        });
        return origHiss();
    };

    // Also instrument the ReinforcementSystem calls if they exist
    if (scene.reinforcementSystem) {
        window.__BEEP_LOG__.push({ note: 'ReinforcementSystem exists' });
    }
    
    // Log the tracker state
    const tracker = scene.motionTracker;
    window.__BEEP_LOG__.push({
        note: 'initial_state',
        trackerAlpha: tracker?.container?.alpha,
        coneCount: tracker?._coneCount,
        nextTrackerBeepAt: scene.nextTrackerBeepAt,
        nextAmbientBeepAt: scene.nextAmbientBeepAt,
    });
});

// Click the game area first to activate input, then sweep mouse
console.log('Clicking to activate...');
await page.mouse.click(640, 360);
await sleep(500);

// Fire to provoke aliens first
await page.mouse.down({ button: 'right' });
await sleep(1500);
await page.mouse.up({ button: 'right' });
await sleep(1000);

// Aim toward the nearest enemy by reading their position from the scene
const aimResult = await page.evaluate(() => {
    const s = window.__ALIENS_DEBUG_SCENE__;
    if (!s || !s.enemyManager || !s.leader) return { error: 'no scene' };
    const enemies = s.enemyManager.getAliveEnemies?.() || [];
    if (enemies.length === 0) return { error: 'no enemies' };
    // Sort by distance to leader
    const sorted = enemies
        .map(e => ({ x: e.x, y: e.y, dist: Math.hypot(e.x - s.leader.x, e.y - s.leader.y) }))
        .sort((a, b) => a.dist - b.dist);
    const cam = s.cameras.main;
    // Convert nearest enemy world pos to screen pos
    const nearest = sorted[0];
    const screenX = nearest.x - cam.scrollX;
    const screenY = nearest.y - cam.scrollY;
    return {
        leaderPos: { x: Math.round(s.leader.x), y: Math.round(s.leader.y) },
        nearestEnemy: nearest,
        screenPos: { x: Math.round(screenX), y: Math.round(screenY) },
        enemyCount: enemies.length,
    };
});
console.log('Aim result:', JSON.stringify(aimResult));

// Move mouse toward nearest enemy to aim at it
if (aimResult.screenPos) {
    const sx = Math.max(0, Math.min(1279, aimResult.screenPos.x));
    const sy = Math.max(0, Math.min(719, aimResult.screenPos.y));
    console.log(`Aiming mouse at screen (${sx}, ${sy}) toward nearest enemy...`);
    await page.mouse.move(sx, sy);
    await sleep(500);
}

console.log('Sweeping mouse near aimed direction...');
for (let i = 0; i < 5; i++) {
    if (aimResult.screenPos) {
        const bx = aimResult.screenPos.x;
        const by = aimResult.screenPos.y;
        // Small wobble around the enemy direction
        for (const off of [[-20, -20], [20, 20], [0, 0], [-10, 10], [10, -10]]) {
            await page.mouse.move(
                Math.max(0, Math.min(1279, bx + off[0])),
                Math.max(0, Math.min(719, by + off[1]))
            );
            await sleep(100);
        }
    } else {
        for (const [mx, my] of [[640, 360], [800, 300], [900, 400], [500, 500], [700, 200], [400, 300]]) {
            await page.mouse.move(mx, my);
            await sleep(150);
        }
    }
}

// Let it run for 8 seconds to collect beep data with enemies at various ranges
console.log('Collecting beep data for 10 seconds (will move toward enemies)...');

// Move leader toward enemies by clicking near them
for (let i = 0; i < 5; i++) {
    if (aimResult.screenPos) {
        await page.mouse.click(
            Math.max(0, Math.min(1279, aimResult.screenPos.x)),
            Math.max(0, Math.min(719, aimResult.screenPos.y))
        );
    }
    await sleep(2000);
    
    // Re-aim at nearest enemy (it may have moved)
    const newAim = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s || !s.enemyManager || !s.leader) return null;
        const enemies = s.enemyManager.getAliveEnemies?.() || [];
        if (enemies.length === 0) return null;
        const sorted = enemies
            .map(e => ({ x: e.x, y: e.y, dist: Math.hypot(e.x - s.leader.x, e.y - s.leader.y) }))
            .sort((a, b) => a.dist - b.dist);
        const cam = s.cameras.main;
        return {
            dist: Math.round(sorted[0].dist),
            screenX: Math.round(sorted[0].x - cam.scrollX),
            screenY: Math.round(sorted[0].y - cam.scrollY),
        };
    });
    if (newAim) {
        console.log(`  Nearest enemy at ${newAim.dist}px, screen (${newAim.screenX}, ${newAim.screenY})`);
        await page.mouse.move(
            Math.max(0, Math.min(1279, newAim.screenX)),
            Math.max(0, Math.min(719, newAim.screenY))
        );
    }
}

await page.screenshot({ path: `${outDir}/during-play.png` });

// Collect results
const results = await page.evaluate(() => {
    const scene = window.__ALIENS_DEBUG_SCENE__;
    
    const tracker = scene?.motionTracker;
    const contacts = scene?.enemyManager?.getMotionContacts?.() ?? [];
    const aliveEnemies = scene?.enemyManager?.getAliveEnemies?.() ?? [];
    
    return {
        beepLog: window.__BEEP_LOG__ || [],
        trackerState: {
            alpha: tracker?.container?.alpha,
            coneCount: tracker?._coneCount,
            flashOn: tracker?._flashOn,
        },
        contactCount: contacts.length,
        aliveEnemyCount: aliveEnemies.length,
        nextTrackerBeepAt: scene?.nextTrackerBeepAt,
        nextAmbientBeepAt: scene?.nextAmbientBeepAt,
    };
});

await browser.close();

// Analysis
console.log('\n=== Tracker Beep Debug Report ===\n');
console.log(`Alive enemies: ${results.aliveEnemyCount}`);
console.log(`Motion contacts: ${results.contactCount}`);
console.log(`Tracker alpha: ${results.trackerState.alpha}`);
console.log(`Tracker cone count: ${results.trackerState.coneCount}`);
console.log(`Total beep log entries: ${results.beepLog.length}`);

const pings = results.beepLog.filter(e => e.fn === 'playTrackerPing');
const hisses = results.beepLog.filter(e => e.fn === 'playTrackerCarrierHiss');
const notes = results.beepLog.filter(e => e.note);

console.log(`\nplayTrackerPing calls: ${pings.length}`);
console.log(`playTrackerCarrierHiss calls: ${hisses.length}`);
console.log(`Notes: ${notes.map(n => JSON.stringify(n)).join('\n  ')}`);

if (pings.length > 0) {
    console.log('\n--- Ping timeline ---');
    const t0 = pings[0].t;
    for (const p of pings) {
        const delta = Math.round(p.t - t0);
        console.log(`  +${delta}ms  strong=${p.strong} proximity=${p.proximity?.toFixed(3)}`);
    }
    
    // Show intervals between consecutive pings
    console.log('\n--- Ping intervals ---');
    for (let i = 1; i < pings.length; i++) {
        const gap = Math.round(pings[i].t - pings[i-1].t);
        console.log(`  ${gap}ms  (prox=${pings[i].proximity?.toFixed(3)})`);
    }
}

// Check for simultaneous ping+hiss pairs
console.log('\n--- Simultaneous sound events ---');
let simultaneousCount = 0;
for (const p of pings) {
    const matchingHiss = hisses.find(h => Math.abs(h.t - p.t) < 20);
    if (matchingHiss) simultaneousCount++;
}
console.log(`Ping+Hiss fired together: ${simultaneousCount}/${pings.length} pings`);

if (errors.length > 0) {
    console.log('\n--- JS Errors ---');
    errors.forEach(e => console.log(`  ${e}`));
}

// Save full log
fs.writeFileSync(`${outDir}/beep-log.json`, JSON.stringify(results, null, 2));
console.log(`\nFull log saved to ${outDir}/beep-log.json`);
