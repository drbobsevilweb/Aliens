#!/usr/bin/env node
/**
 * test_door_collision.mjs — Verify door physics, pathfinding feathering,
 * and marine auto-move to door.
 *
 * Runs in headless Chromium against a live server on port 8192.
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:8192';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
let failed = 0;

function ok(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
    } else {
        console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

async function bootGame(page, mission = 'm1') {
    await page.goto(`${BASE_URL}/game?mission=${mission}&noaliens&renderer=canvas`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
    });
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        const booted = await page.evaluate(() => typeof window.render_game_to_text === 'function');
        if (booted) break;
    }
    await sleep(2000);
    // Wait for init typing and dismiss
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        const ready = await page.evaluate(() => {
            const s = window.__ALIENS_DEBUG_SCENE__;
            return s?._initWaitingForKey === true;
        });
        if (ready) break;
    }
    await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (s && !s._initDismissing) {
            s._initDismissing = true;
            s._playInitDismissFlash();
        }
    });
    await sleep(2500);
    // Dismiss controls overlay
    await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (s?.controlsOverlay?.visible) s.controlsOverlay.setVisible(false);
    });
    await sleep(500);
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
    });

    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.message?.slice(0, 200)));

    console.log('Booting game (m1, noaliens)...');
    await bootGame(page, 'm1');

    // ─── Test 1: Door physics bodies cover full tile ─────────────────
    console.log('\n[Door Physics Body Coverage]');
    const doorBodyCheck = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.doorManager) return { error: 'no doorManager' };
        const TILE = 64;
        const results = [];
        for (const group of s.doorManager.doorGroups) {
            for (const door of group.doors) {
                const body = door.body;
                if (!body || !body.enable) continue;
                results.push({
                    id: group.id,
                    orientation: group.orientation,
                    tileX: door.tileX,
                    tileY: door.tileY,
                    bodyW: body.width,
                    bodyH: body.height,
                    fullTile: body.width >= TILE && body.height >= TILE,
                    displayW: door.displayWidth,
                    displayH: door.displayHeight,
                });
            }
        }
        return results;
    });

    if (doorBodyCheck.error) {
        ok('Door manager exists', false, doorBodyCheck.error);
    } else if (doorBodyCheck.length === 0) {
        ok('Doors found', false, 'no closed doors with enabled bodies found');
    } else {
        const allFullTile = doorBodyCheck.every(d => d.fullTile);
        ok(`All ${doorBodyCheck.length} door bodies cover full tile (64×64)`, allFullTile,
            allFullTile ? '' : JSON.stringify(doorBodyCheck.filter(d => !d.fullTile)));

        const vertDoors = doorBodyCheck.filter(d => d.orientation === 'vertical');
        const horzDoors = doorBodyCheck.filter(d => d.orientation === 'horizontal');
        ok(`Vertical doors found: ${vertDoors.length}`, vertDoors.length > 0 || horzDoors.length > 0);
        if (vertDoors.length > 0) {
            const vertOK = vertDoors.every(d => d.bodyW >= 64);
            ok('Vertical door bodies are ≥64px wide (not 32px)', vertOK,
                vertOK ? '' : `widths: ${vertDoors.map(d => d.bodyW)}`);
        }
    }

    // ─── Test 2: Door isPassable state matches body enable ───────────
    console.log('\n[Door State Consistency]');
    const stateCheck = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.doorManager) return { error: 'no doorManager' };
        const issues = [];
        for (const group of s.doorManager.doorGroups) {
            for (const door of group.doors) {
                const shouldBlock = !group.isPassable;
                if (shouldBlock && !door.body.enable) {
                    issues.push({ id: group.id, state: group.state, bodyEnable: false });
                }
                if (!shouldBlock && door.body.enable) {
                    issues.push({ id: group.id, state: group.state, bodyEnable: true });
                }
            }
        }
        return { total: s.doorManager.doorGroups.length, issues };
    });

    ok('Door groups found', stateCheck.total > 0, `found ${stateCheck.total}`);
    ok('All door body.enable matches isPassable', stateCheck.issues?.length === 0,
        stateCheck.issues?.length > 0 ? JSON.stringify(stateCheck.issues) : '');

    // ─── Test 3: Wall feathering callback registered for marines ─────
    console.log('\n[Marine Wall Feathering]');
    const featherCheck = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.leader?.body) return { error: 'no leader' };
        // Check that leader has colliders — the physics world tracks them
        const colliders = s.physics.world.colliders?.getActive() || [];
        let leaderWallCollider = null;
        for (const c of colliders) {
            const obj1 = c.object1;
            const obj2 = c.object2;
            const isLeader = obj1 === s.leader || obj2 === s.leader;
            const isWall = (obj1?.layer !== undefined) || (obj2?.layer !== undefined);
            if (isLeader && isWall) {
                leaderWallCollider = c;
                break;
            }
        }
        return {
            hasCollider: !!leaderWallCollider,
            hasProcessCallback: !!(leaderWallCollider?.processCallback),
        };
    });

    ok('Leader has wall collider', featherCheck.hasCollider);
    ok('Leader wall collider has process callback (feathering)', featherCheck.hasProcessCallback);

    // ─── Test 4: Pathfinding works from leader position ──────────────
    console.log('\n[Pathfinding From Leader]');
    const pathCheck = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.pathGrid || !s?.pathPlanner || !s?.leader) return { error: 'missing components' };
        const grid = s.pathGrid;
        const leader = s.leader;
        const leaderTile = grid.worldToTile(leader.x, leader.y);
        const walkable = grid.isWalkable(leaderTile.x, leaderTile.y);

        // Try pathfinding to a nearby walkable tile (3 tiles east and west)
        let pathFound = false;
        const offsets = [
            { dx: 3, dy: 0 }, { dx: -3, dy: 0 },
            { dx: 0, dy: 3 }, { dx: 0, dy: -3 },
        ];
        for (const off of offsets) {
            const tx = leaderTile.x + off.dx;
            const ty = leaderTile.y + off.dy;
            if (!grid.isWalkable(tx, ty)) continue;
            const startX = walkable ? leaderTile.x : leaderTile.x;
            const path = s.pathPlanner.findPath(startX, leaderTile.y, tx, ty, grid);
            if (path) { pathFound = true; break; }
        }
        return { leaderTile, walkable, pathFound };
    });

    ok('Leader tile is walkable', pathCheck.walkable);
    ok('Pathfinding from leader succeeds', pathCheck.pathFound);

    // ─── Test 5: DoorActionSystem can find adjacent tiles ────────────
    console.log('\n[Door Auto-Move Pathfinding]');
    const doorAutoMove = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.doorActionSystem || !s?.doorManager) return { error: 'missing systems' };
        const das = s.doorActionSystem;
        const results = [];
        for (const group of s.doorManager.doorGroups) {
            const leader = s.leader;
            const actorTile = s.pathGrid.worldToTile(leader.x, leader.y);
            const targetInfo = das.findBestAdjacentTile(actorTile, group, { requiredSide: null });
            results.push({
                id: group.id,
                state: group.state,
                hasAdjacentTile: !!targetInfo,
                hasPath: !!(targetInfo?.path),
            });
        }
        return results;
    });

    if (doorAutoMove.error) {
        ok('DoorActionSystem exists', false, doorAutoMove.error);
    } else {
        const reachable = doorAutoMove.filter(d => d.hasAdjacentTile);
        ok(`${reachable.length}/${doorAutoMove.length} doors have reachable adjacent tiles`, reachable.length > 0);
    }

    // ─── Test 6: Enemy wall forgiveness is 14px ──────────────────────
    console.log('\n[Enemy Wall Forgiveness]');
    const enemyForgiveness = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.enemyManager) return { error: 'no enemyManager' };
        return { px: s.enemyManager.wallEdgeForgivenessPx };
    });

    ok('Enemy wall forgiveness is 14px', enemyForgiveness.px === 14, `got ${enemyForgiveness.px}px`);

    // ─── Test 7: _snapToNearestWalkable works ────────────────────────
    console.log('\n[Snap-to-Walkable Helper]');
    const snapCheck = await page.evaluate(() => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.doorActionSystem || !s?.pathGrid) return { error: 'missing' };
        const grid = s.pathGrid;
        // Find a wall tile adjacent to a walkable tile
        let wallTile = null;
        let adjacentWalkable = null;
        outer:
        for (let y = 2; y < grid.height - 2; y++) {
            for (let x = 2; x < grid.width - 2; x++) {
                if (grid.isWalkable(x, y)) continue;
                for (const d of [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }]) {
                    if (grid.isWalkable(x + d.dx, y + d.dy)) {
                        wallTile = { x, y };
                        adjacentWalkable = { x: x + d.dx, y: y + d.dy };
                        break outer;
                    }
                }
            }
        }
        if (!wallTile) return { skipped: true };
        const worldX = wallTile.x * 64 + 32;
        const worldY = wallTile.y * 64 + 32;
        const snapped = s.doorActionSystem._snapToNearestWalkable(worldX, worldY, wallTile);
        return {
            wallTile,
            snappedTo: snapped,
            snappedIsWalkable: grid.isWalkable(snapped.x, snapped.y),
        };
    });

    if (snapCheck.skipped) {
        ok('Snap-to-walkable (skipped — no wall tiles found)', true);
    } else {
        ok('Snap finds walkable tile from wall tile', snapCheck.snappedIsWalkable,
            `wall ${JSON.stringify(snapCheck.wallTile)} → ${JSON.stringify(snapCheck.snappedTo)}`);
    }

    // ─── Summary ─────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (errors.length > 0) {
        console.log(`Page errors captured: ${errors.length}`);
        errors.forEach(e => console.log(`  ⚠ ${e}`));
    }
    console.log('═'.repeat(50));

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
