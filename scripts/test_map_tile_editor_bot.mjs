#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';
const EDITOR_URL = `${BASE}/editors`;
const GAME_URL = `${BASE}/game?mission=m1&noaliens&package=local`;
const CELL = 24;

function tilePosition(tileX, tileY) {
    return {
        x: (tileX * CELL) + (CELL * 0.5),
        y: (tileY * CELL) + (CELL * 0.5),
    };
}

async function pause(page, ms = 120) {
    await page.waitForTimeout(ms);
}

async function ensureTilemapTab(page) {
    await page.click('button[data-tab="tilemap"]');
    await page.waitForSelector('#tilemapCanvas');
    await pause(page, 400);
}

async function expandTilemapDetails(page) {
    await page.evaluate(() => {
        document.querySelectorAll('#tab-tilemap details').forEach((detail) => {
            detail.open = true;
        });
    });
    await pause(page, 120);
}

async function selectLayerHotkey(page, digit) {
    await page.keyboard.press(String(digit));
    await pause(page, 140);
}

async function selectToolHotkey(page, key) {
    await page.keyboard.press(String(key).toUpperCase());
    await pause(page, 120);
}

async function clickTile(page, tileX, tileY) {
    const canvas = page.locator('#tilemapCanvas');
    await canvas.scrollIntoViewIfNeeded();
    await canvas.click({ position: tilePosition(tileX, tileY) });
}

async function dragTile(page, fromX, fromY, toX, toY) {
    const canvas = page.locator('#tilemapCanvas');
    await canvas.scrollIntoViewIfNeeded();
    const from = tilePosition(fromX, fromY);
    const to = tilePosition(toX, toY);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Tilemap canvas missing');
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
    await pause(page, 180);
}

async function getEditorData(page) {
    return page.evaluate(async () => {
        const parse = async (url, key) => {
            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return data?.[key] && typeof data[key] === 'object' ? data[key] : null;
            } catch {
                return null;
            }
        };
        return {
            editor: await parse('/api/editor-state', 'state'),
            pkg: await parse('/api/mission-package', 'package'),
        };
    });
}

async function computePlan(page) {
    return page.evaluate(async () => {
        let parsed = null;
        try {
            const res = await fetch('/api/editor-state');
            if (res.ok) {
                const data = await res.json();
                parsed = data?.state && typeof data.state === 'object' ? data.state : null;
            }
        } catch {}
        const map = parsed?.tilemaps?.[0];
        if (!map) return null;

        const occupied = new Set();
        for (const prop of (map.props || [])) occupied.add(`${prop.tileX},${prop.tileY}`);
        for (const light of (map.lights || [])) occupied.add(`${light.tileX},${light.tileY}`);
        for (const story of (map.storyPoints || [])) occupied.add(`${story.tileX},${story.tileY}`);

        const widthLimit = Math.min(map.width - 3, 28);
        const heightLimit = Math.min(map.height - 3, 18);
        const picks = [];

        const isClearFloor = (x, y) => {
            if (x < 2 || y < 2 || x >= map.width - 2 || y >= map.height - 2) return false;
            if (x > widthLimit || y > heightLimit) return false;
            if (occupied.has(`${x},${y}`)) return false;
            if ((map.terrain?.[y]?.[x] | 0) !== 0) return false;
            if ((map.doors?.[y]?.[x] | 0) !== 0) return false;
            if ((map.markers?.[y]?.[x] | 0) !== 0) return false;
            const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
            return neighbors.every(([dx, dy]) => (map.terrain?.[y + dy]?.[x + dx] | 0) === 0);
        };

        const farEnough = (x, y) => picks.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) >= 3);

        for (let y = 4; y <= heightLimit; y++) {
            for (let x = 4; x <= widthLimit; x++) {
                if (isClearFloor(x, y) && farEnough(x, y)) picks.push({ x, y });
                if (picks.length >= 12) break;
            }
            if (picks.length >= 12) break;
        }

        const verticalDoor = (() => {
            for (let y = 4; y < heightLimit; y++) {
                for (let x = 4; x <= widthLimit; x++) {
                    if (isClearFloor(x, y) && isClearFloor(x, y + 1) && farEnough(x, y) && farEnough(x, y + 1)) {
                        return [{ x, y }, { x, y: y + 1 }];
                    }
                }
            }
            return null;
        })();

        if (picks.length < 10 || !verticalDoor) {
            return { ok: false, reason: 'Could not find enough clear floor cells for editor bot plan' };
        }

        return {
            ok: true,
            mapId: String(map.id || ''),
            wallPaint: picks[0],
            wallErase: picks[1],
            doorA: verticalDoor[0],
            doorB: verticalDoor[1],
            spawn: picks[2],
            extract: picks[3],
            terminal: picks[4],
            alienSpawn: picks[5],
            vent: picks[6],
            egg: picks[7],
            propPlaced: picks[8],
            propMoved: { x: picks[8].x + 1, y: picks[8].y },
            propDuplicateFinal: { x: picks[8].x + 7, y: picks[8].y + 5 },
            light: picks[9],
            texture: picks[10],
            story: picks[11],
        };
    });
}

function fail(message, details = null) {
    if (details) {
        console.error(`[editor-bot] FAIL: ${message}`);
        console.error(JSON.stringify(details, null, 2));
    } else {
        console.error(`[editor-bot] FAIL: ${message}`);
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1480, height: 980 } });
    const page = await context.newPage();
    const errors = [];
    const dialogs = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('dialog', async (dialog) => {
        const next = dialogs.shift();
        if (dialog.type() === 'prompt') {
            await dialog.accept(typeof next === 'string' ? next : 'editor_bot_map');
            return;
        }
        if (next === false) {
            await dialog.dismiss();
            return;
        }
        await dialog.accept();
    });

    let pass = true;

    try {
        console.log('[editor-bot] Opening editor');
        await page.goto(EDITOR_URL, { waitUntil: 'networkidle', timeout: 20000 });
        await ensureTilemapTab(page);
        await expandTilemapDetails(page);

        console.log('[editor-bot] Exercising map management on a throwaway clone');
        dialogs.push(`m1_editor_bot_clone_${Date.now()}`);
        await page.click('#cloneMapBtn');
        await pause(page, 300);
        await expandTilemapDetails(page);
        await page.fill('#expandAmount', '2');
        await page.click('#expandRightBtn');
        await pause(page, 120);
        await expandTilemapDetails(page);
        await page.click('#expandBottomBtn');
        await pause(page, 120);
        await expandTilemapDetails(page);
        await page.click('#mirrorMapBtn');
        await pause(page, 120);
        await expandTilemapDetails(page);
        await page.click('#mirrorMapYBtn');
        await pause(page, 180);
        await expandTilemapDetails(page);

        let stateSnapshot = await getEditorData(page);
        const clonedMap = stateSnapshot.editor?.tilemaps?.[stateSnapshot.editor.tilemaps.length - 1];
        if (!clonedMap || clonedMap.width < 2 || clonedMap.height < 2) {
            pass = false;
            fail('Clone/expand flow did not leave a usable map');
        }

        dialogs.push(true);
        await page.click('#deleteMapBtn');
        await pause(page, 280);
        await expandTilemapDetails(page);

        console.log('[editor-bot] Switching back to mission map and computing deterministic test tiles');
        await page.selectOption('#toolbarMapSelect', '0');
        await pause(page, 220);
        await expandTilemapDetails(page);

        const plan = await computePlan(page);
        if (!plan?.ok) {
            throw new Error(plan?.reason || 'Failed to build test plan');
        }
        console.log('[editor-bot] Plan:', JSON.stringify(plan));

        console.log('[editor-bot] Terrain pen/erase and door painting');
        await selectLayerHotkey(page, 2);
        await selectToolHotkey(page, 'b');
        await clickTile(page, plan.wallPaint.x, plan.wallPaint.y);
        await clickTile(page, plan.wallErase.x, plan.wallErase.y);
        await selectToolHotkey(page, 'e');
        await clickTile(page, plan.wallErase.x, plan.wallErase.y);

        await selectLayerHotkey(page, 3);
        await page.click('button[data-door-value="2"]');
        await pause(page, 80);
        await selectToolHotkey(page, 'b');
        await clickTile(page, plan.doorA.x, plan.doorA.y);
        await clickTile(page, plan.doorB.x, plan.doorB.y);

        console.log('[editor-bot] Marker coverage');
        await page.selectOption('#layerSelect', 'markers');
        await pause(page, 120);
        for (const [value, point] of [
            ['1', plan.spawn],
            ['2', plan.extract],
            ['3', plan.terminal],
            ['5', plan.alienSpawn],
            ['7', plan.vent],
            ['8', plan.egg],
        ]) {
            await page.selectOption('#tileValueSelect', value);
            await pause(page, 40);
            await clickTile(page, point.x, point.y);
        }

        console.log('[editor-bot] Props with select/drag/duplicate/rotate/nudge flow');
        await selectLayerHotkey(page, 5);
        await page.click('button[data-prop-key="prop_lamp"]');
        await pause(page, 80);
        await selectToolHotkey(page, 'b');
        await clickTile(page, plan.propPlaced.x, plan.propPlaced.y);
        await selectToolHotkey(page, 's');
        await dragTile(page, plan.propPlaced.x, plan.propPlaced.y, plan.propMoved.x, plan.propMoved.y);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+D' : 'Control+D');
        await pause(page, 160);
        await page.keyboard.press('R');
        await pause(page, 120);
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowDown');
        await pause(page, 180);

        console.log('[editor-bot] Light, texture, and story layers');
        await selectLayerHotkey(page, 6);
        await selectToolHotkey(page, 'b');
        await page.click('button[data-light-idx="2"]');
        await page.fill('#lightRadiusInput', '280');
        await page.dispatchEvent('#lightRadiusInput', 'input');
        await page.fill('#lightBrightnessInput', '1.15');
        await page.dispatchEvent('#lightBrightnessInput', 'input');
        await clickTile(page, plan.light.x, plan.light.y);

        await selectLayerHotkey(page, 8);
        await selectToolHotkey(page, 'b');
        await page.click('[data-tex-key="tile_floor_hadleys_a_gen"]');
        await pause(page, 80);
        await clickTile(page, plan.texture.x, plan.texture.y);

        await selectLayerHotkey(page, 7);
        await selectToolHotkey(page, 'b');
        await page.fill('#storyTitleInput', 'Editor Bot Beat');
        await page.selectOption('#storyKindSelect', 'warning');
        await page.selectOption('#storyMissionSelect', 'm1');
        await clickTile(page, plan.story.x, plan.story.y);

        await page.screenshot({ path: 'output/editor-map-bot-editor-pass.png' });

        console.log('[editor-bot] Saving and validating local package state');
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
        await pause(page, 900);

        stateSnapshot = await getEditorData(page);
        const editorMap = stateSnapshot.editor?.tilemaps?.[0];
        const packageMap = stateSnapshot.pkg?.maps?.find((m) => String(m.id) === plan.mapId) || stateSnapshot.pkg?.maps?.[0];
        const packageMission = stateSnapshot.pkg?.missions?.find((m) => String(m.id) === 'm1');
        const propEntries = editorMap?.props || [];
        const storyEntries = editorMap?.storyPoints || [];

        const editorChecks = {
            wallPainted: editorMap?.terrain?.[plan.wallPaint.y]?.[plan.wallPaint.x] === 1,
            wallErased: editorMap?.terrain?.[plan.wallErase.y]?.[plan.wallErase.x] === 0,
            doorsPainted: editorMap?.doors?.[plan.doorA.y]?.[plan.doorA.x] === 2 && editorMap?.doors?.[plan.doorB.y]?.[plan.doorB.x] === 2,
            markersPlaced: [
                editorMap?.markers?.[plan.spawn.y]?.[plan.spawn.x] === 1,
                editorMap?.markers?.[plan.extract.y]?.[plan.extract.x] === 2,
                editorMap?.markers?.[plan.terminal.y]?.[plan.terminal.x] === 3,
                editorMap?.markers?.[plan.alienSpawn.y]?.[plan.alienSpawn.x] === 5,
                editorMap?.markers?.[plan.vent.y]?.[plan.vent.x] === 7,
                editorMap?.markers?.[plan.egg.y]?.[plan.egg.x] === 8,
            ].every(Boolean),
            propMoved: propEntries.some((p) => p.tileX === plan.propMoved.x && p.tileY === plan.propMoved.y && p.imageKey === 'prop_lamp'),
            propDuplicated: propEntries.some((p) => p.tileX === plan.propDuplicateFinal.x && p.tileY === plan.propDuplicateFinal.y && p.imageKey === 'prop_lamp' && (Number(p.rotation) || 0) === 90),
            lightPlaced: (editorMap?.lights || []).some((l) => l.tileX === plan.light.x && l.tileY === plan.light.y && Number(l.radius) === 280),
            texturePlaced: editorMap?.terrainTextures?.[plan.texture.y]?.[plan.texture.x] === 'tile_floor_hadleys_a_gen',
            storyPlaced: storyEntries.some((sp) => sp.tileX === plan.story.x && sp.tileY === plan.story.y && sp.title === 'Editor Bot Beat' && sp.missionId === 'm1'),
            missionMapStillM1: String(packageMission?.mapId || '') === plan.mapId,
        };

        console.log('[editor-bot] Editor checks:', JSON.stringify(editorChecks, null, 2));
        if (!Object.values(editorChecks).every(Boolean)) {
            pass = false;
            fail('Editor/package assertions failed', editorChecks);
        }

        if (packageMap) {
            const packageChecks = {
                wallPainted: packageMap.terrain?.[plan.wallPaint.y]?.[plan.wallPaint.x] === 1,
                wallErased: packageMap.terrain?.[plan.wallErase.y]?.[plan.wallErase.x] === 0,
                doorsPainted: packageMap.doors?.[plan.doorA.y]?.[plan.doorA.x] === 2 && packageMap.doors?.[plan.doorB.y]?.[plan.doorB.x] === 2,
                texturePlaced: packageMap.terrainTextures?.[plan.texture.y]?.[plan.texture.x] === 'tile_floor_hadleys_a_gen',
                propCountAtTargets: (packageMap.props || []).filter((p) => p.imageKey === 'prop_lamp' && (
                    (p.tileX === plan.propMoved.x && p.tileY === plan.propMoved.y)
                    || (p.tileX === plan.propDuplicateFinal.x && p.tileY === plan.propDuplicateFinal.y)
                )).length === 2,
                lightPlaced: (packageMap.lights || []).some((l) => l.tileX === plan.light.x && l.tileY === plan.light.y),
                storyPlaced: (packageMap.storyPoints || []).some((sp) => sp.tileX === plan.story.x && sp.tileY === plan.story.y && sp.title === 'Editor Bot Beat'),
            };
            console.log('[editor-bot] Package checks:', JSON.stringify(packageChecks, null, 2));
            if (!Object.values(packageChecks).every(Boolean)) {
                pass = false;
                fail('Published package assertions failed', packageChecks);
            }
        } else {
            pass = false;
            fail('Could not locate published package map for runtime checks');
        }

        console.log('[editor-bot] Opening game for runtime consistency checks');
        await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: 25000 });
        await pause(page, 5000);
        await page.screenshot({ path: 'output/editor-map-bot-runtime-pass.png' });

        const runtimeChecks = await page.evaluate((planData) => {
            const scene = window.__ALIENS_DEBUG_SCENE__;
            if (!scene) return { sceneFound: false };
            const near = (a, b, eps = 8) => Math.abs(Number(a) - Number(b)) <= eps;
            const worldX = (tx) => (tx + 0.5) * 64;
            const worldY = (ty) => (ty + 0.5) * 64;
            const staticLights = Array.isArray(scene.lightingOverlay?.staticLights) ? scene.lightingOverlay.staticLights : [];
            const roomProps = Array.isArray(scene.roomProps) ? scene.roomProps : [];
            const storyPoints = Array.isArray(scene.missionStoryPoints) ? scene.missionStoryPoints : [];
            const propMovedOk = roomProps.some((p) => p.tileX === planData.propMoved.x && p.tileY === planData.propMoved.y && p.sprite?.texture?.key === 'prop_lamp');
            const propDupOk = roomProps.some((p) => p.tileX === planData.propDuplicateFinal.x && p.tileY === planData.propDuplicateFinal.y && p.sprite?.texture?.key === 'prop_lamp');
            const lightOk = staticLights.some((l) => near(l.x, worldX(planData.light.x)) && near(l.y, worldY(planData.light.y)) && Math.round(Number(l.radius) || 0) === 280);
            const leaderNearSpawn = near(scene.leader?.x, worldX(planData.spawn.x), 80) && near(scene.leader?.y, worldY(planData.spawn.y), 80);
            return {
                sceneFound: true,
                tilemapSource: scene.tilemapSourceLabel,
                terrainWall: scene.missionLayout?.tilemap?.terrain?.[planData.wallPaint.y]?.[planData.wallPaint.x] === 1,
                terrainErased: scene.missionLayout?.tilemap?.terrain?.[planData.wallErase.y]?.[planData.wallErase.x] === 0,
                doorsPainted: scene.missionLayout?.tilemap?.doors?.[planData.doorA.y]?.[planData.doorA.x] === 2
                    && scene.missionLayout?.tilemap?.doors?.[planData.doorB.y]?.[planData.doorB.x] === 2,
                markersPlaced: scene.missionLayout?.tilemap?.markers?.[planData.spawn.y]?.[planData.spawn.x] === 1
                    && scene.missionLayout?.tilemap?.markers?.[planData.extract.y]?.[planData.extract.x] === 2
                    && scene.missionLayout?.tilemap?.markers?.[planData.terminal.y]?.[planData.terminal.x] === 3
                    && scene.missionLayout?.tilemap?.markers?.[planData.alienSpawn.y]?.[planData.alienSpawn.x] === 5
                    && scene.missionLayout?.tilemap?.markers?.[planData.vent.y]?.[planData.vent.x] === 7
                    && scene.missionLayout?.tilemap?.markers?.[planData.egg.y]?.[planData.egg.x] === 8,
                texturePlaced: scene.missionLayout?.tilemap?.terrainTextures?.[planData.texture.y]?.[planData.texture.x] === 'tile_floor_hadleys_a_gen',
                propMovedOk,
                propDupOk,
                lightOk,
                storyPointOk: storyPoints.some((sp) => sp.tileX === planData.story.x && sp.tileY === planData.story.y && sp.title === 'Editor Bot Beat'),
                leaderNearSpawn,
                roomPropCount: roomProps.length,
                staticLightCount: staticLights.length,
            };
        }, plan);

        console.log('[editor-bot] Runtime checks:', JSON.stringify(runtimeChecks, null, 2));
        if (!runtimeChecks.sceneFound || runtimeChecks.tilemapSource !== 'PACKAGE') {
            pass = false;
            fail('Game did not load package-backed map', runtimeChecks);
        }
        for (const key of ['terrainWall', 'terrainErased', 'doorsPainted', 'markersPlaced', 'texturePlaced', 'propMovedOk', 'propDupOk', 'lightOk', 'storyPointOk', 'leaderNearSpawn']) {
            if (!runtimeChecks[key]) {
                pass = false;
                fail(`Runtime assertion failed: ${key}`, runtimeChecks);
                break;
            }
        }

        if (errors.length > 0) {
            console.log('[editor-bot] Browser errors:');
            errors.forEach((error) => console.log(`  ${error}`));
        }
    } finally {
        await browser.close();
    }

    if (!pass) process.exit(1);
    console.log('[editor-bot] PASS: map tile editor workflows and runtime consistency look healthy');
}

main().catch((err) => {
    console.error('[editor-bot] Unhandled failure:', err);
    process.exit(1);
});
