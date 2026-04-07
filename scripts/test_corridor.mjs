#!/usr/bin/env node
/**
 * test_corridor.mjs — Screenshot the corridor test map to verify tiles.
 */
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT  = path.join(ROOT, 'output');
const BASE_URL = 'http://127.0.0.1:8192';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    page.on('pageerror', e => console.error('PAGE ERROR:', e.message?.slice(0, 300)));
    page.on('console', m => {
        if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text().slice(0, 300));
    });

    console.log('Loading corridor test...');
    await page.goto(`${BASE_URL}/game?mission=corridor&noaliens&renderer=canvas`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
    });

    // Wait for boot
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        try {
            const booted = await page.evaluate(() => typeof window.render_game_to_text === 'function');
            if (booted) { console.log(`Game booted after ${(i+1)*500}ms`); break; }
        } catch {}
    }
    await sleep(3000);

    // Wait for typing to complete, then dismiss init overlay via scene API
    console.log('Waiting for init typing to complete...');
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        const ready = await page.evaluate(() => {
            const s = window.__ALIENS_DEBUG_SCENE__;
            return s?._initWaitingForKey === true;
        });
        if (ready) { console.log(`Init typing done after ${(i+1)*500}ms`); break; }
    }

    // Dismiss via scene API
    console.log('Dismissing init overlay...');
    await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (s && !s._initDismissing) {
            s._initDismissing = true;
            s._playInitDismissFlash();
        }
    });

    // Wait for flash animation (1s) + settle
    await sleep(3000);

    // Dismiss controls overlay if visible
    await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return;
        if (s.controlsOverlay?.visible) {
            s.controlsOverlay.setVisible(false);
        }
    });
    await sleep(1000);

    // Gather debug info
    const info = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return 'no scene';

        const textures = s.textures?.getTextureKeys() || [];
        const corridorTextures = textures.filter(k => k.includes('corridor'));

        const layout = s.missionLayout;
        let terrainTextureCount = 0;
        let terrainTextureSample = [];
        if (layout?.terrainTextures) {
            for (let y = 0; y < layout.terrainTextures.length; y++) {
                const row = layout.terrainTextures[y];
                if (!row) continue;
                for (let x = 0; x < row.length; x++) {
                    if (row[x]) {
                        terrainTextureCount++;
                        if (terrainTextureSample.length < 10) {
                            terrainTextureSample.push({ x, y, key: row[x] });
                        }
                    }
                }
            }
        }

        // Check leader position
        const leader = s.leader;
        const leaderPos = leader ? { x: Math.round(leader.x), y: Math.round(leader.y) } : null;

        return {
            corridorTextures,
            terrainTextureCount,
            terrainTextureSample,
            mapSize: layout ? `${layout.tilemap?.width}x${layout.tilemap?.height}` : 'no layout',
            missionId: layout?.mission?.id,
            leaderPos,
            initOverlayUntil: s.initOverlayUntil,
            isPaused: s.isPaused,
            controlsVisible: s.controlsOverlay?.visible,
        };
    });
    console.log('Debug info:', JSON.stringify(info, null, 2));

    // Take screenshot
    const ssPath = path.join(OUT, 'corridor_test.png');
    await page.screenshot({ path: ssPath });
    console.log(`Screenshot saved: ${ssPath}`);

    await browser.close();
    console.log('Done');
})();
