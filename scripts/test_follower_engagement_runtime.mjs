#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE_URL = process.env.ALIENS_BASE_URL || 'http://127.0.0.1:8192';
const GAME_URL = `${BASE_URL}/game?mission=m1&renderer=canvas`;
const TICK_MS = 350;
const MAX_RUNTIME_MS = 35000;
const MOVE_REPATH_MS = 900;
const FOLLOWER_IDLE_TICKS_FAIL = 4;
const REQUIRED_ENGAGED_THREAT_SNAPSHOTS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

function pass(message) {
    console.log(`PASS: ${message}`);
}

function fail(message, details = null) {
    console.error(`FAIL: ${message}`);
    if (details != null) {
        console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
    }
    process.exit(1);
}

function withTimeout(promise, ms) {
    let timer = null;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

async function safeEval(page, fn, ms = 5000, arg) {
    try {
        const result = arg !== undefined
            ? await withTimeout(page.evaluate(fn, arg), ms)
            : await withTimeout(page.evaluate(fn), ms);
        return result;
    } catch (error) {
        return { err: error.message || String(error) };
    }
}

function summarizeFollowerIdleStreaks(streaks) {
    return [...streaks.entries()].map(([role, info]) => ({ role, ...info }));
}

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});

try {
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

    let booted = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(500);
        const ready = await safeEval(page, () => typeof window.render_game_to_text === 'function', 3000);
        if (ready === true) {
            booted = true;
            break;
        }
    }
    if (!booted) fail('Game failed to boot for follower engagement runtime test', { consoleErrors, pageErrors });

    await sleep(2500);

    const init = await safeEval(page, () => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };
        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
            else {
                scene.initOverlayContainer.destroy();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
        if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();
        scene.noAliens = true;
        scene.authoredSpawnSchedule = [];
        if (Array.isArray(scene.activeMissionWaves) && scene.activeMissionWaves.length > 1) {
            scene.activeMissionWaves = scene.activeMissionWaves.slice(0, 1);
        }
        if (scene.stageFlow) {
            scene.stageFlow.totalWaves = 1;
            scene.stageFlow.currentWave = 1;
        }
        return {
            state: window.render_game_to_text?.() || null,
            extractX: scene.extractionWorldPos?.x || 0,
            extractY: scene.extractionWorldPos?.y || 0,
        };
    }, 6000);
    if (!init || init.err || !init.state) fail('Failed to initialize focused follower runtime test', init);

    let state = JSON.parse(init.state);
    let lastMoveAt = 0;
    const startTime = Date.now();
    const followerIdleStreaks = new Map();
    const idleFindings = [];
    let lastHostileDiagnostics = [];
    let engagedThreatSnapshots = 0;
    const engagedThreatSamples = [];

    while ((Date.now() - startTime) < MAX_RUNTIME_MS) {
        const hostiles = (state.hostiles || []).filter((hostile) => hostile.hp > 0);
        const nearestHostile = hostiles.slice().sort((a, b) => dist(state.leader.x, state.leader.y, a.x, a.y) - dist(state.leader.x, state.leader.y, b.x, b.y))[0] || null;
        let action = { type: 'idle' };
        if (nearestHostile) {
            const nearestDist = dist(state.leader.x, state.leader.y, nearestHostile.x, nearestHostile.y);
            if (!nearestHostile.visible || nearestDist > 360) {
                if ((Date.now() - lastMoveAt) >= MOVE_REPATH_MS) {
                    action = { type: 'move', tx: nearestHostile.x, ty: nearestHostile.y, faceTarget: nearestHostile.visible === true };
                    lastMoveAt = Date.now();
                }
            } else if (nearestDist < 180 && nearestHostile.visible) {
                action = { type: 'retreat', target: nearestHostile };
            } else if ((Date.now() - lastMoveAt) >= MOVE_REPATH_MS) {
                action = { type: 'engage', target: nearestHostile, moveToward: nearestDist > 220 };
                lastMoveAt = Date.now();
            } else {
                action = { type: 'engage', target: nearestHostile, moveToward: false };
            }
        }

        const tick = await safeEval(page, (act) => {
            const scene = window.__ALIENS_DEBUG_SCENE__;
            if (!scene) return { err: 'no scene' };

            if (scene.initOverlayContainer) {
                if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
                else {
                    scene.initOverlayContainer.destroy();
                    scene.initOverlayContainer = null;
                }
            }
            if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
            if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();
            scene.noAliens = true;
            scene.authoredSpawnSchedule = [];
            if (scene.stageFlow) scene.stageFlow.totalWaves = 1;

            const leader = scene.leader;
            if (!leader) return { err: 'no leader' };

            const tileKey = (x, y) => `${x},${y}`;
            const tryQueueDoorOpenToward = (worldX, worldY, targetTile = null) => {
                if (!scene.doorActionSystem || !scene.doorManager || !Array.isArray(scene.doorManager.doorGroups)) return false;
                if (scene.doorActionSystem.pendingAction || scene.doorActionSystem.pendingSquadSync || scene.doorActionSystem.getActiveTimer?.()) {
                    return true;
                }
                const closedDoorByTile = new Map();
                for (const group of scene.doorManager.doorGroups) {
                    if (!group || group.state !== 'closed' || !Array.isArray(group.doors)) continue;
                    if (typeof group.getAvailableActions === 'function') {
                        const canOpen = group.getAvailableActions().some((entry) => entry?.action === 'open');
                        if (!canOpen) continue;
                    }
                    for (const door of group.doors) {
                        if (!door) continue;
                        closedDoorByTile.set(tileKey(door.tileX, door.tileY), group);
                    }
                }
                const destinationTile = targetTile || scene.pathGrid?.worldToTile?.(worldX, worldY);
                const startTile = scene.pathGrid?.worldToTile?.(leader.x, leader.y);
                if (!scene.pathGrid || !destinationTile || !startTile || closedDoorByTile.size <= 0) return false;
                const queue = [[startTile.x, startTile.y]];
                const prev = new Map([[tileKey(startTile.x, startTile.y), null]]);
                let head = 0;
                const canStep = (tx, ty) => {
                    if (tx < 0 || ty < 0 || tx >= scene.pathGrid.width || ty >= scene.pathGrid.height) return false;
                    if (scene.pathGrid.isWalkable(tx, ty)) return true;
                    return closedDoorByTile.has(tileKey(tx, ty));
                };
                while (head < queue.length) {
                    const [cx, cy] = queue[head++];
                    if (cx === destinationTile.x && cy === destinationTile.y) {
                        const route = [];
                        let cur = tileKey(cx, cy);
                        while (cur) {
                            route.push(cur);
                            cur = prev.get(cur);
                        }
                        route.reverse();
                        for (const stepKey of route) {
                            const group = closedDoorByTile.get(stepKey);
                            if (!group) continue;
                            try {
                                if (scene.doorActionSystem.queueAction(leader, group, 'open')) return true;
                            } catch {}
                        }
                        break;
                    }
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (!canStep(nx, ny)) continue;
                        const nextKey = tileKey(nx, ny);
                        if (prev.has(nextKey)) continue;
                        prev.set(nextKey, tileKey(cx, cy));
                        queue.push([nx, ny]);
                    }
                }
                return false;
            };

            const assignPathToward = (worldX, worldY) => {
                if (!scene.pathGrid || !scene.pathPlanner || !scene.movementSystem) return false;
                const startTile = scene.pathGrid.worldToTile(leader.x, leader.y);
                let endTile = scene.pathGrid.worldToTile(worldX, worldY);
                if (!scene.pathGrid.isWalkable(endTile.x, endTile.y)) {
                    let found = false;
                    for (let radius = 1; radius < 5 && !found; radius++) {
                        for (let dy = -radius; dy <= radius && !found; dy++) {
                            for (let dx = -radius; dx <= radius && !found; dx++) {
                                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                                if (scene.pathGrid.isWalkable(endTile.x + dx, endTile.y + dy)) {
                                    endTile = { x: endTile.x + dx, y: endTile.y + dy };
                                    found = true;
                                }
                            }
                        }
                    }
                }
                if (!scene.pathGrid.isWalkable(endTile.x, endTile.y)) {
                    return tryQueueDoorOpenToward(worldX, worldY, endTile);
                }
                try {
                    const path = scene.pathPlanner.findPath(startTile.x, startTile.y, endTile.x, endTile.y, scene.pathGrid);
                    if (path && path.length > 0) {
                        scene.movementSystem.assignPath(leader, path.map((point) => scene.pathGrid.tileToWorld(point.x, point.y)));
                        return true;
                    }
                } catch {}
                return tryQueueDoorOpenToward(worldX, worldY, endTile);
            };

            const now = scene.time?.now || 0;
            if (act.type === 'engage' && act.target) {
                if (typeof leader.facePosition === 'function') leader.facePosition(act.target.x, act.target.y);
                if (scene.inputHandler) scene.inputHandler._botFiring = true;
                const ptr = scene.input?.activePointer;
                if (ptr) {
                    ptr.worldX = act.target.x;
                    ptr.worldY = act.target.y;
                }
                if (act.moveToward) assignPathToward(act.target.x, act.target.y);
            } else if (act.type === 'retreat' && act.target) {
                if (scene.inputHandler) scene.inputHandler._botFiring = true;
                if (typeof leader.facePosition === 'function') leader.facePosition(act.target.x, act.target.y);
                const dx = leader.x - act.target.x;
                const dy = leader.y - act.target.y;
                const len = Math.hypot(dx, dy) || 1;
                assignPathToward(leader.x + (dx / len) * 220, leader.y + (dy / len) * 220);
            } else if (act.type === 'move') {
                if (scene.inputHandler) scene.inputHandler._botFiring = false;
                if (act.faceTarget && typeof leader.facePosition === 'function') leader.facePosition(act.tx, act.ty);
                assignPathToward(act.tx, act.ty);
            } else if (scene.inputHandler) {
                scene.inputHandler._botFiring = false;
            }

            const enemies = scene.enemyManager?.getActiveEnemies?.() || [];
            const followers = (scene.squadSystem?.followers || []).map((entry) => {
                const follower = entry.sprite || entry;
                const combatState = scene.followerCombatSystem?.followerCombatState?.get(follower.roleKey) || null;
                const ammoState = scene.marineAmmo?.get?.(follower.roleKey) || null;
                const hasTarget = !!(combatState?.targetRef?.active);
                const lastFiredAt = Number(ammoState?.lastFiredAt) || -100000;
                const recentlyFired = (now - lastFiredAt) <= 650;
                const waitingToShoot = !!combatState && (
                    now < (Number(combatState.readyAt) || 0)
                    || now < (Number(combatState.nextFireAt) || 0)
                    || now < (Number(combatState.jamUntil) || 0)
                    || now < (Number(combatState.burstRecoverUntil) || 0)
                );
                const nearEnemyCount = enemies.filter((enemy) => enemy?.active && !enemy.isDying && Math.hypot((enemy.x || 0) - follower.x, (enemy.y || 0) - follower.y) < 350).length;
                return {
                    role: follower.roleKey || 'unknown',
                    alive: follower.active !== false && (follower.health || 0) > 0,
                    x: Math.round(follower.x || 0),
                    y: Math.round(follower.y || 0),
                    hp: Math.round(follower.health || 0),
                    nearEnemyCount,
                    isEngaged: hasTarget || recentlyFired || waitingToShoot || ammoState?.isReloading === true || ammoState?.isOverheated === true,
                    hasTarget,
                    targetType: combatState?.targetRef?.enemyType || null,
                    recentlyFired,
                    waitingToShoot,
                    readyInMs: Math.max(0, Math.round((Number(combatState?.readyAt) || 0) - now)),
                    nextFireInMs: Math.max(0, Math.round((Number(combatState?.nextFireAt) || 0) - now)),
                    jamInMs: Math.max(0, Math.round((Number(combatState?.jamUntil) || 0) - now)),
                    burstRecoverInMs: Math.max(0, Math.round((Number(combatState?.burstRecoverUntil) || 0) - now)),
                    isReloading: ammoState?.isReloading === true,
                    isOverheated: ammoState?.isOverheated === true,
                };
            });

            const roomPropTileMap = new Map();
            for (const prop of scene.roomProps || []) {
                if (prop?.blocksPath !== true) continue;
                roomPropTileMap.set(tileKey(prop.tileX, prop.tileY), {
                    tileX: prop.tileX,
                    tileY: prop.tileY,
                    type: prop.type || prop.sprite?._propType || 'prop',
                });
            }

            const leaderTile = scene.pathGrid?.worldToTile?.(leader.x, leader.y) || null;
            const lastHostileDetails = enemies.slice(0, 4).map((enemy) => {
                const enemyTile = scene.pathGrid?.worldToTile?.(enemy.x, enemy.y) || null;
                let targetTileWalkable = false;
                let nearestWalkableTile = null;
                let pathExists = false;
                if (scene.pathGrid && enemyTile) {
                    targetTileWalkable = scene.pathGrid.isWalkable(enemyTile.x, enemyTile.y);
                    if (targetTileWalkable) {
                        nearestWalkableTile = { x: enemyTile.x, y: enemyTile.y };
                    } else {
                        for (let radius = 1; radius <= 3 && !nearestWalkableTile; radius++) {
                            for (let dy = -radius; dy <= radius && !nearestWalkableTile; dy++) {
                                for (let dx = -radius; dx <= radius && !nearestWalkableTile; dx++) {
                                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                                    const tx = enemyTile.x + dx;
                                    const ty = enemyTile.y + dy;
                                    if (scene.pathGrid.isWalkable(tx, ty)) nearestWalkableTile = { x: tx, y: ty };
                                }
                            }
                        }
                    }
                    if (scene.pathPlanner && leaderTile && nearestWalkableTile) {
                        try {
                            const path = scene.pathPlanner.findPath(leaderTile.x, leaderTile.y, nearestWalkableTile.x, nearestWalkableTile.y, scene.pathGrid);
                            pathExists = Array.isArray(path) && path.length > 0;
                        } catch {
                            pathExists = false;
                        }
                    }
                }

                const nearbyClosedDoors = (scene.doorManager?.doorGroups || [])
                    .filter((group) => group?.state === 'closed' && typeof group.getCenter === 'function')
                    .map((group) => {
                        const center = group.getCenter();
                        return {
                            state: group.state,
                            dist: Math.round(Math.hypot((center.x || 0) - enemy.x, (center.y || 0) - enemy.y)),
                        };
                    })
                    .filter((entry) => entry.dist <= 220);

                return {
                    type: enemy.enemyType || 'unknown',
                    x: Math.round(enemy.x || 0),
                    y: Math.round(enemy.y || 0),
                    hp: Math.round(enemy.health || 0),
                    detected: enemy.detected === true,
                    active: enemy.active !== false,
                    isDying: enemy.isDying === true,
                    intent: enemy.intent || 'none',
                    tile: enemyTile,
                    targetTileWalkable,
                    nearestWalkableTile,
                    pathExists,
                    pathBlockedByGrid: !!(enemyTile && scene.pathGrid && !scene.pathGrid.isWalkable(enemyTile.x, enemyTile.y)),
                    pathBlockedByRoomProp: !!(enemyTile && roomPropTileMap.has(tileKey(enemyTile.x, enemyTile.y))),
                    nearbyClosedDoors,
                    navStuckMs: Math.round(Number(enemy.navStuckMs) || 0),
                    navRecoverInMs: Math.max(0, Math.round((Number(enemy.navRecoverUntil) || 0) - now)),
                    navRecoverTarget: Number.isFinite(enemy.navRecoverTargetX) && Number.isFinite(enemy.navRecoverTargetY)
                        ? { x: Math.round(enemy.navRecoverTargetX), y: Math.round(enemy.navRecoverTargetY) }
                        : null,
                };
            });

            return {
                state: window.render_game_to_text?.() || null,
                followers,
                combat: {
                    wave: scene.stageFlow?.currentWave || 0,
                    totalWaves: scene.stageFlow?.totalWaves || 0,
                    aliveEnemies: scene.enemyManager?.getAliveCount?.() || enemies.length,
                    stage: scene.stageFlow?.state || 'unknown',
                },
                lastHostileDetails,
            };
        }, 7000, action);

        if (!tick || tick.err || !tick.state) fail('Focused follower runtime tick failed', tick);
        state = JSON.parse(tick.state);

        for (const follower of tick.followers || []) {
            if (!follower.alive || follower.role === 'leader') continue;
            const current = followerIdleStreaks.get(follower.role) || { ticks: 0, maxNearEnemyCount: 0, lastSnapshot: null };
            if (follower.nearEnemyCount >= 2 && !follower.isEngaged) {
                current.ticks += 1;
                current.maxNearEnemyCount = Math.max(current.maxNearEnemyCount, follower.nearEnemyCount);
                current.lastSnapshot = follower;
                followerIdleStreaks.set(follower.role, current);
                if (current.ticks === FOLLOWER_IDLE_TICKS_FAIL) {
                    idleFindings.push({ role: follower.role, snapshot: follower });
                }
            } else {
                current.ticks = 0;
                current.lastSnapshot = follower;
                followerIdleStreaks.set(follower.role, current);
            }

            if (follower.nearEnemyCount >= 2 && follower.isEngaged) {
                engagedThreatSnapshots += 1;
                if (engagedThreatSamples.length < REQUIRED_ENGAGED_THREAT_SNAPSHOTS) {
                    engagedThreatSamples.push(follower);
                }
            }
        }

        if (idleFindings.length > 0) {
            fail('Follower remained unengaged with multiple nearby hostiles for too long', {
                idleFindings,
                consoleErrors,
                pageErrors,
            });
        }

        if ((state.hostiles || []).length <= 2) {
            lastHostileDiagnostics = tick.lastHostileDetails || [];
        }

        if (engagedThreatSnapshots >= REQUIRED_ENGAGED_THREAT_SNAPSHOTS) {
            pass('Followers stayed engaged while multiple local threats were active');
            console.log('Engaged threat samples:');
            console.log(JSON.stringify(engagedThreatSamples, null, 2));
            console.log('Follower idle streaks:');
            console.log(JSON.stringify(summarizeFollowerIdleStreaks(followerIdleStreaks), null, 2));
            process.exit(0);
        }

        await sleep(TICK_MS);
    }

    fail('Focused follower runtime bot timed out', {
        finalState: state,
        lastHostileDiagnostics,
        engagedThreatSnapshots,
        engagedThreatSamples,
        followerIdleStreaks: summarizeFollowerIdleStreaks(followerIdleStreaks),
        consoleErrors,
        pageErrors,
    });
} finally {
    await browser.close();
}