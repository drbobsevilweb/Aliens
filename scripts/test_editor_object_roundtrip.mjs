#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const EDITOR_URL = `${BASE}/editors`;

async function readEditorState(page) {
    return page.evaluate(async () => {
        const res = await fetch('/api/editor-state');
        if (!res.ok) return null;
        const data = await res.json();
        return data?.state && typeof data.state === 'object' ? data.state : null;
    });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(EDITOR_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.click('button[data-tab="tilemap"]');
    await page.waitForSelector('#toolbarMissionSelect');
    await page.waitForSelector('#toolbarMapSelect');
    await page.waitForTimeout(1500);

    const initial = await page.evaluate(() => ({
        missionOptions: document.querySelectorAll('#toolbarMissionSelect option').length,
        mapOptions: document.querySelectorAll('#toolbarMapSelect option').length,
        propsText: document.querySelector('#tm-props')?.textContent || '',
    }));

    const editorState = await readEditorState(page);
    const missions = Array.isArray(editorState?.missions) ? editorState.missions : [];
    const targetMission = missions.find((mission) => String(mission?.id || '') !== 'm1' && String(mission?.mapId || '').trim()) || missions[0] || null;
    const targetMapId = String(targetMission?.mapId || '').trim();

    let pass = true;
    if (initial.missionOptions < 2) {
        console.error('[test] FAIL: mission selector did not populate');
        pass = false;
    }
    if (initial.mapOptions < 1 || !initial.propsText.includes('Map:')) {
        console.error('[test] FAIL: tilemap tab did not auto-load a map');
        pass = false;
    }

    if (targetMission) {
        await page.selectOption('#toolbarMissionSelect', String(targetMission.id));
        await page.waitForTimeout(1000);

        const afterJump = await page.evaluate(() => ({
            propsText: document.querySelector('#tm-props')?.textContent || '',
        }));
        if (!afterJump.propsText.includes(targetMapId)) {
            console.error(`[test] FAIL: mission selector did not jump to ${targetMapId}`);
            pass = false;
        }

        const popupPromise = page.waitForEvent('popup');
        await page.click('#tm-test-game');
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(400);

        const storedTestMap = await page.evaluate(async () => {
            const res = await fetch('/api/editor-test-map');
            if (!res.ok) return null;
            const data = await res.json();
            return data?.testMap || null;
        });

        if (String(storedTestMap?.mapName || '').trim() !== targetMapId) {
            console.error(`[test] FAIL: server-backed test map mismatch (${storedTestMap?.mapName || 'missing'})`);
            pass = false;
        }
        await popup.close();
    }

    if (errors.length) {
        console.log('[test] Browser errors:');
        errors.forEach((err) => console.log('  ', err));
    }

    await browser.close();
    if (pass) {
        console.log('[test] PASS: tilemap mission selector loads mission-linked maps and Test in Game stores test maps server-side');
        process.exit(0);
    }
    process.exit(1);
})();
