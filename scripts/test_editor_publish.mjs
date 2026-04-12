#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const EDITOR_URL = `${BASE}/editors`;
const GAME_URL = `${BASE}/game?mission=m1&noaliens&package=local`;

async function readJson(page, url, key) {
    return page.evaluate(async ({ nextUrl, nextKey }) => {
        const res = await fetch(nextUrl);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.[nextKey] && typeof data[nextKey] === 'object' ? data[nextKey] : null;
    }, { nextUrl: url, nextKey: key });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(EDITOR_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.click('button[data-tab="missions"]');
    await page.waitForSelector('[data-mission-row]');

    const stamp = `publish-${Date.now()}`;
    const firstRow = page.locator('[data-mission-row]').first();
    await firstRow.locator('[data-field="notes"]').fill(stamp);

    await page.click('#missions-save-state');
    await page.waitForTimeout(500);
    await page.click('#missions-publish');
    await page.waitForTimeout(1000);

    const editorState = await readJson(page, '/api/editor-state', 'state');
    const missionPackage = await readJson(page, '/api/mission-package', 'package');

    const editorMission = editorState?.missions?.find((mission) => String(mission?.id || '') === 'm1') || null;
    const packageMission = missionPackage?.missions?.find((mission) => String(mission?.id || '') === 'm1') || null;

    let pass = true;
    if (editorMission?.notes !== stamp) {
        console.error(`[test] FAIL: editor-state mission note mismatch (${editorMission?.notes || 'missing'})`);
        pass = false;
    }
    if (packageMission?.notes !== stamp) {
        console.error(`[test] FAIL: mission-package mission note mismatch (${packageMission?.notes || 'missing'})`);
        pass = false;
    }

    const editorGameHref = await page.getAttribute('nav.dev-nav a[href^="/game"]', 'href');
    if (editorGameHref !== '/game?package=local') {
        console.error(`[test] FAIL: editor Game nav should point at /game?package=local, got ${editorGameHref || 'missing'}`);
        pass = false;
    }

    await page.click('nav.dev-nav a[href^="/game"]');
    await page.waitForURL(/\/game\/?.*package=local/, { timeout: 20000 });
    await page.waitForTimeout(5000);
    const navRuntime = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { sceneFound: false };
        return {
            sceneFound: true,
            tilemapSource: scene.tilemapSourceLabel,
        };
    });

    if (!navRuntime.sceneFound || navRuntime.tilemapSource !== 'PACKAGE') {
        console.error(`[test] FAIL: editor Game nav did not load PACKAGE (${JSON.stringify(navRuntime)})`);
        pass = false;
    }

    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(5000);
    const runtime = await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { sceneFound: false };
        return {
            sceneFound: true,
            tilemapSource: scene.tilemapSourceLabel,
            enemyCount: scene.enemyManager?.getAliveCount?.() || 0,
        };
    });

    if (!runtime.sceneFound || runtime.tilemapSource !== 'PACKAGE') {
        console.error(`[test] FAIL: runtime did not load PACKAGE (${JSON.stringify(runtime)})`);
        pass = false;
    }
    if (runtime.enemyCount !== 0) {
        console.error(`[test] FAIL: expected no enemies in noAliens mode, got ${runtime.enemyCount}`);
        pass = false;
    }

    if (errors.length) {
        console.log('[test] Browser errors:');
        errors.forEach((err) => console.log('  ', err));
    }

    await browser.close();
    if (pass) {
        console.log('[test] PASS: missions tab save/publish persisted to server-backed editor/package state and runtime loaded PACKAGE');
        process.exit(0);
    }
    process.exit(1);
})();
