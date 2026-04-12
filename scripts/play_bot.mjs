#!/usr/bin/env node
/**
 * play_bot.mjs — Comprehensive automated playtest bot.
 *
 * Launches Phaser game via Playwright, plays as team leader via direct
 * scene API (window.__ALIENS_DEBUG_SCENE__), and produces a structured
 * issue checklist covering every gameplay facet.
 *
 * Usage:
 *   node scripts/play_bot.mjs [mission|all] [headed]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
/* ── Paths ────────────────────────────────────────────────────── */
const ROOT = new URL('..', import.meta.url).pathname;
const OUT  = path.join(ROOT, 'output');
fs.mkdirSync(OUT, { recursive: true });

/* ── CLI ──────────────────────────────────────────────────────── */
const missionArg = process.argv[2] || 'm1';
const headed     = process.argv.includes('headed');
const missions   = missionArg === 'all' ? ['m1','m2','m3','m4','m5'] : [missionArg];

/* ── Tuning ───────────────────────────────────────────────────── */
const TICK_MS          = 400;
const MAX_GAME_S       = 180;
const STATUS_INTERVAL  = 5000;
const STUCK_MS         = 4000;
const MOVE_INTERVAL    = 1200;
const TRACKER_RETRY_MS = 14000;
const REGROUP_DIST     = 420;
const RETREAT_HP_PCT   = 0.55;
const BASE_URL         = 'http://127.0.0.1:8192';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dist  = (x1,y1,x2,y2) => Math.sqrt((x1-x2)**2 + (y1-y2)**2);

function withTimeout(promise, ms) {
    let t;
    return Promise.race([
        promise,
        new Promise((_,rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); }),
    ]).finally(() => clearTimeout(t));
}

/* ══════════════════════════════════════════════════════════════════
   ISSUE TRACKER — every detected anomaly goes here
   ══════════════════════════════════════════════════════════════════ */
class IssueTracker {
    constructor(mission) {
        this.mission = mission;
        this.issues = [];      // { severity, category, msg, tick, data }
        this.checks = {};      // category → { pass, fail, notes }
    }
    add(severity, category, msg, data = {}) {
        this.issues.push({
            severity, category, msg,
            tick: Date.now(), data,
        });
    }
    /* Categories: spawn, combat, follower, door, hud, physics,
       pathfinding, mode, audio, performance, error */
    setCheck(cat, pass, note = '') {
        if (!this.checks[cat]) this.checks[cat] = { pass: 0, fail: 0, notes: [] };
        if (pass) this.checks[cat].pass++;
        else      this.checks[cat].fail++;
        if (note) this.checks[cat].notes.push(note);
    }
    summary() {
        const bySev = { critical: [], high: [], medium: [], low: [] };
        for (const i of this.issues) (bySev[i.severity] || bySev.low).push(i);
        return { mission: this.mission, issues: this.issues, bySeverity: bySev, checks: this.checks };
    }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN BOT RUNNER
   ══════════════════════════════════════════════════════════════════ */
async function runMission(mission) {
    const tracker = new IssueTracker(mission);
    const log = [];
    const consoleErrors = [];
    const pageErrors = [];
    const healthTimeline = [];
    const combatLog = [];
    const deathAnalysis = [];

    const logFile = path.join(OUT, `bot-${mission}.log`);
    fs.writeFileSync(logFile, '');
    const L = (type, msg) => {
        log.push({ t: Date.now(), type, msg });
        try { fs.appendFileSync(logFile, `[${mission}][${type}] ${msg}\n`); }
        catch {}
    };

    L('INFO', `=== BOT START ${mission} (${headed?'headed':'headless'}) ===`);

    /* ── Launch browser ───────────────────────────────────── */
    const browser = await chromium.launch({
        headless: !headed,
        args: ['--disable-gpu','--no-sandbox','--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }});

    page.on('pageerror', e => {
        const m = (e.message||String(e)).slice(0,300);
        pageErrors.push(m);
        tracker.add('high','error',`Page error: ${m}`);
        L('ERROR', `Page error: ${m}`);
    });
    page.on('console', m => {
        if (m.type() === 'error') {
            const t = m.text().slice(0,300);
            consoleErrors.push(t);
            tracker.add('medium','error',`Console error: ${t}`);
            L('ERROR', `Console: ${t}`);
        }
    });

    /* ── Load game ────────────────────────────────────────── */
    const url = `${BASE_URL}/game?mission=${mission}&renderer=canvas`;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        tracker.add('critical','error',`Failed to load: ${e.message}`);
        await browser.close();
        return makeResult(mission,'load_fail',tracker,log,consoleErrors,pageErrors,healthTimeline,combatLog,deathAnalysis);
    }

    /* ── Wait for boot ────────────────────────────────────── */
    let booted = false;
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        try {
            booted = await withTimeout(
                page.evaluate(() => typeof window.render_game_to_text === 'function'), 3000
            );
            if (booted) break;
        } catch {}
    }
    if (!booted) {
        tracker.add('critical','error','Game failed to boot in 20s');
        await browser.close();
        return makeResult(mission,'boot_fail',tracker,log,consoleErrors,pageErrors,healthTimeline,combatLog,deathAnalysis);
    }
    await sleep(3000);

    /* ── Init: dismiss overlay + read state ────────────────── */
    const init = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return { err: 'no scene' };
        const mapW = s.mapWidthPx || (s.pathGrid?.width*64) || 0;
        const mapH = s.mapHeightPx || (s.pathGrid?.height*64) || 0;
        const missionState = s.lastMissionState || s.missionFlow?.getState?.() || null;
        const buildSceneWanderTargets = () => {
            if (!s.pathGrid) return [];
            const targets = [];
            const seen = new Set();
            const margin = 128;
            const cols = 5;
            const rows = 4;
            const sx = Math.max(200, (mapW - margin * 2) / cols);
            const sy = Math.max(200, (mapH - margin * 2) / rows);
            const pushTarget = (worldX, worldY) => {
                const tile = s.pathGrid.worldToTile(worldX, worldY);
                let best = null;
                if (s.pathGrid.isWalkable(tile.x, tile.y)) {
                    best = tile;
                } else {
                    for (let r = 1; r <= 8 && !best; r++) {
                        for (let oy = -r; oy <= r && !best; oy++) {
                            for (let ox = -r; ox <= r && !best; ox++) {
                                if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
                                const tx = tile.x + ox;
                                const ty = tile.y + oy;
                                if (s.pathGrid.isWalkable(tx, ty)) best = { x: tx, y: ty };
                            }
                        }
                    }
                }
                if (!best) return;
                const key = `${best.x},${best.y}`;
                if (seen.has(key)) return;
                seen.add(key);
                const snappedWorld = s.pathGrid.tileToWorld(best.x, best.y);
                targets.push({ x: snappedWorld.x, y: snappedWorld.y, tx: best.x, ty: best.y });
            };
            for (let r = 0; r < rows; r++) {
                const y = margin + r * sy + sy / 2;
                const fwd = r % 2 === 0;
                for (let c = 0; c < cols; c++) {
                    const col = fwd ? c : (cols - 1 - c);
                    pushTarget(margin + col * sx + sx / 2, y);
                }
            }
            pushTarget(mapW / 2, mapH / 2);
            return targets;
        };
        // Dismiss overlays
        if (s.initOverlayContainer) {
            if (typeof s.clearInitializationOverlay === 'function') {
                s.clearInitializationOverlay();
            } else {
                s.initOverlayContainer.destroy();
                s.initOverlayContainer = null;
            }
        }
        if (s.controlsOverlay?.visible) {
            s.controlsOverlay.setVisible(false);
        }
        if (!s.isPaused && s.physics?.world && s.physics.world.isPaused) {
            s.physics.world.resume();
        }
        const st = typeof window.render_game_to_text==='function' ? window.render_game_to_text() : null;
        return {
            state: st,
            mapW,
            mapH,
            extractX: s.extractionWorldPos?.x || 0,
            extractY: s.extractionWorldPos?.y || 0,
            tileSize: s.pathGrid?.tileSize || 64,
            totalWaves: s.stageFlow?.totalWaves || 0,
            wanderTargets: buildSceneWanderTargets(),
            missionTarget: missionState?.targetWorld
                ? {
                    x: Math.round(Number(missionState.targetWorld.x) || 0),
                    y: Math.round(Number(missionState.targetWorld.y) || 0),
                }
                : null,
            missionPhase: String(missionState?.phaseLabel || ''),
        };
    }, 5000);

    if (!init || init.err || !init.state) {
        tracker.add('critical','error',`Init fail: ${init?.err||'no state'}`);
        await browser.close();
        return makeResult(mission,'no_state',tracker,log,consoleErrors,pageErrors,healthTimeline,combatLog,deathAnalysis);
    }

    const map = {
        w: init.mapW, h: init.mapH,
        exX: init.extractX, exY: init.extractY,
        tile: init.tileSize, waves: init.totalWaves,
    };
    const wanderTargets = Array.isArray(init.wanderTargets) && init.wanderTargets.length > 0
        ? init.wanderTargets
        : buildWanderGrid(map);
    let missionTarget = init.missionTarget && Number.isFinite(init.missionTarget.x) && Number.isFinite(init.missionTarget.y)
        ? init.missionTarget
        : null;
    let missionPhase = String(init.missionPhase || '');
    let state = JSON.parse(init.state);
    L('INFO', `Map ${map.w}x${map.h}, Extract(${map.exX},${map.exY}), Waves=${map.waves}`);
    L('INFO', `Leader(${state.leader.x},${state.leader.y}) HP=${state.leader.health}/${state.leader.maxHealth}`);
    L('INFO', `Squad=${state.squad?.length} Hostiles=${state.hostiles?.length} Mode=${state.mode}`);

    // Check initial state sanity
    if (state.leader.health <= 0) tracker.add('critical','error','Leader starts with 0 HP');
    if (!state.squad || state.squad.length === 0) tracker.add('high','follower','No squad members at start');
    tracker.setCheck('boot', true, 'Game booted and initialized');

    /* ── State tracking vars ──────────────────────────────── */
    let prevLeaderPos  = { x: state.leader.x, y: state.leader.y };
    let lastMoveTime   = Date.now();
    let stuckCount     = 0;
    let killCount      = 0;
    let lastStatusLog  = 0;
    let prevHostileN   = state.hostiles?.length || 0;
    let prevSquadAlive = state.squad?.filter(m=>m.alive).length || 0;
    let prevAliveSquadRoles = new Set((state.squad || []).filter(m => m.alive).map(m => m.role));
    let prevLeaderHP   = state.leader.health;
    let wanderIdx      = 0;
    let lastMoveCmdAt  = 0;
    let lastTrackerCmdAt = -TRACKER_RETRY_MS;
    let startTime      = Date.now();
    let outcome        = 'timeout';
    let evalFails      = 0;
    let prevMode       = state.mode;
    let modeHistory    = [state.mode];
    let maxHostilesSeen = 0;
    let spawnProxIssues = 0;
    let followerDeaths  = [];
    let leaderDamageEvents = [];
    let idleCombatTicks = 0;
    let lastKillTick    = 0;
    let tickN           = 0;
    let trackerAttempts = 0;
    let trackerEverActive = false;
    let trackerSawContacts = false;
    let trackerCooldownObserved = false;

    L('INFO', 'Bot loop started');

    /* ══════════════════════════════════════════════════════
       DECISION LOOP
       ══════════════════════════════════════════════════════ */
    while (true) {
        tickN++;
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_GAME_S * 1000) {
            L('WARN', `Timeout after ${MAX_GAME_S}s`);
            outcome = 'timeout';
            break;
        }

        const hostiles = state.hostiles?.filter(h => h.hp > 0) || [];
        const visibleHostiles = hostiles.filter(h => h.visible === true);
        const trackerContacts = Array.isArray(state.tracker?.contacts) ? state.tracker.contacts : [];
        const near = visibleHostiles.filter(h => dist(state.leader.x, state.leader.y, h.x, h.y) < 500);
        maxHostilesSeen = Math.max(maxHostilesSeen, hostiles.length);
        const aliveSquadState = (state.squad || []).filter(m => m.alive);
        const laggingFollowers = aliveSquadState.filter(m => m.role !== 'leader' && dist(state.leader.x, state.leader.y, m.x, m.y) > REGROUP_DIST);
        const trackerReady = !state.tracker?.active
            && !state.tracker?.riskLocked
            && (Number(state.tracker?.cooldownRemainingMs) || 0) <= 0;
        const overwhelmed = near.length >= 4
            || (visibleHostiles.length >= 6 && state.leader.health <= (state.leader.maxHealth || 100) * RETREAT_HP_PCT);

        /* ── Decide action ──────────────────────────────── */
        let action;

        // STUCK RECOVERY — top priority
        if (stuckCount >= 2) {
            action = { type: 'unstick' };
        }
        // RETREAT — kite away from visible pressure while keeping squad together
        else if (overwhelmed) {
            action = {
                type: 'retreat',
                candidates: near.map(h => ({ x: h.x, y: h.y, hp: h.hp, type: h.type })),
                squad: aliveSquadState,
            };
        }
        // REGROUP — let far followers catch up before pushing deeper
        else if (laggingFollowers.length > 0 && near.length === 0) {
            const regroupTarget = laggingFollowers.reduce((acc, f) => ({ x: acc.x + f.x, y: acc.y + f.y }), { x: state.leader.x, y: state.leader.y });
            const denom = Math.max(1, laggingFollowers.length + 1);
            action = { type: 'regroup', tx: regroupTarget.x / denom, ty: regroupTarget.y / denom };
        }
        // COMBAT — enemies nearby
        else if (near.length > 0) {
            action = {
                type: 'combat',
                candidates: near.map(h => ({ x: h.x, y: h.y, hp: h.hp, type: h.type })),
                leaderX: state.leader.x,
                leaderY: state.leader.y,
            };
        }
        // HUNT — if enemies remain on the map, chase the closest known hostile before resuming objectives
        else if (hostiles.length > 0 && hostiles.length <= 2) {
            const best = hostiles
                .slice()
                .sort((a, b) => dist(state.leader.x, state.leader.y, a.x, a.y) - dist(state.leader.x, state.leader.y, b.x, b.y))[0];
            if (best && Date.now() - lastMoveCmdAt > MOVE_INTERVAL) {
                action = {
                    type: 'move',
                    tx: best.x,
                    ty: best.y,
                    goal: 'hunt',
                };
                lastMoveCmdAt = Date.now();
            } else {
                action = { type: 'idle' };
            }
        }
        // OBJECTIVE — pursue mission flow target when combat pressure is not visible
        else if (missionTarget) {
            if (Date.now() - lastMoveCmdAt > MOVE_INTERVAL) {
                action = {
                    type: 'move',
                    tx: missionTarget.x,
                    ty: missionTarget.y,
                    goal: 'objective',
                    phase: missionPhase,
                };
                lastMoveCmdAt = Date.now();
            } else {
                action = { type: 'idle' };
            }
        }
        // TRACKER — actively scout before wandering blind
        else if (trackerReady && (Date.now() - lastTrackerCmdAt) > TRACKER_RETRY_MS) {
            action = { type: 'tracker' };
            lastTrackerCmdAt = Date.now();
            trackerAttempts++;
        }
        // INVESTIGATE — move toward tracker contacts when nothing is visible
        else if (trackerContacts.length > 0) {
            const best = trackerContacts
                .slice()
                .sort((a, b) => {
                    const da = dist(state.leader.x, state.leader.y, a.x, a.y) - (Number(a.confidence) || 0) * 120;
                    const db = dist(state.leader.x, state.leader.y, b.x, b.y) - (Number(b.confidence) || 0) * 120;
                    return da - db;
                })[0];
            action = { type: 'move', tx: best.x, ty: best.y };
        }
        // EXTRACT — move to extraction
        else if (state.mode === 'extract' && map.exX) {
            if (Date.now() - lastMoveCmdAt > MOVE_INTERVAL) {
                action = { type: 'move', tx: map.exX, ty: map.exY };
                lastMoveCmdAt = Date.now();
            } else {
                action = { type: 'idle' };
            }
        }
        // WANDER — seek enemies
        else {
            let target;
            // Bias toward hostiles if any exist on map
            if (visibleHostiles.length > 0) {
                const avgX = visibleHostiles.reduce((s,h) => s+h.x, 0) / visibleHostiles.length;
                const avgY = visibleHostiles.reduce((s,h) => s+h.y, 0) / visibleHostiles.length;
                target = { x: avgX, y: avgY };
            } else if (trackerContacts.length > 0) {
                const avgX = trackerContacts.reduce((s, c) => s + c.x, 0) / trackerContacts.length;
                const avgY = trackerContacts.reduce((s, c) => s + c.y, 0) / trackerContacts.length;
                target = { x: avgX, y: avgY };
            } else {
                // If stuck for a while, definitely move to next wander target
                if (stuckCount > 0 && (stuckCount % 2 === 0)) {
                    wanderIdx++;
                }
                const wt = wanderTargets[wanderIdx % wanderTargets.length];
                if (dist(state.leader.x, state.leader.y, wt.x, wt.y) < 100) wanderIdx++;
                target = wanderTargets[wanderIdx % wanderTargets.length];
            }
            if (Date.now() - lastMoveCmdAt > MOVE_INTERVAL) {
                action = { type: 'move', tx: target.x, ty: target.y, wanderIdx };
                lastMoveCmdAt = Date.now();
            } else {
                action = { type: 'idle' };
            }
        }

        /* ── Execute via page.evaluate ──────────────────── */
        const tickResult = await safeEval(page, (act) => {
            const scene = window.__ALIENS_DEBUG_SCENE__;
            if (!scene) return { err: 'no scene' };

            // Dismiss overlays
            if (scene.initOverlayContainer) {
                if (typeof scene.clearInitializationOverlay === 'function') {
                    scene.clearInitializationOverlay();
                } else {
                    scene.initOverlayContainer.destroy();
                    scene.initOverlayContainer = null;
                }
            }
            if (scene.controlsOverlay?.visible) {
                scene.controlsOverlay.setVisible(false);
            }
            if (!scene.isPaused && scene.physics?.world && scene.physics.world.isPaused) {
                scene.physics.world.resume();
            }

            const leader = scene.leader;
            if (!leader) return { err: 'no leader' };

            const tryQueueDoorOpenToward = (worldX, worldY, targetTile = null) => {
                if (!scene.doorActionSystem || !scene.doorManager || !Array.isArray(scene.doorManager.doorGroups)) return false;
                if (scene.doorActionSystem.pendingAction || scene.doorActionSystem.pendingSquadSync || scene.doorActionSystem.getActiveTimer?.()) {
                    return true;
                }
                const tileKey = (x, y) => `${x},${y}`;
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
                if (scene.pathGrid && destinationTile && startTile && closedDoorByTile.size > 0) {
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
                }

                const segDx = worldX - leader.x;
                const segDy = worldY - leader.y;
                const segLenSq = segDx * segDx + segDy * segDy;
                const candidates = [];
                for (const group of scene.doorManager.doorGroups) {
                    if (!group || group.state !== 'closed' || typeof group.getCenter !== 'function') continue;
                    if (typeof group.getAvailableActions === 'function') {
                        const canOpen = group.getAvailableActions().some((entry) => entry?.action === 'open');
                        if (!canOpen) continue;
                    }
                    const center = group.getCenter();
                    const distLeader = Math.hypot(center.x - leader.x, center.y - leader.y);
                    const distTarget = Math.hypot(center.x - worldX, center.y - worldY);
                    if (distLeader > 768) continue;
                    let lineDist = 0;
                    if (segLenSq > 0) {
                        const proj = Math.max(0, Math.min(1, (((center.x - leader.x) * segDx) + ((center.y - leader.y) * segDy)) / segLenSq));
                        const px = leader.x + segDx * proj;
                        const py = leader.y + segDy * proj;
                        lineDist = Math.hypot(center.x - px, center.y - py);
                    }
                    if (lineDist > 224 && distTarget > 640) continue;
                    candidates.push({
                        group,
                        score: distLeader * 0.45 + distTarget * 0.2 + lineDist,
                    });
                }
                candidates.sort((a, b) => a.score - b.score);
                for (const candidate of candidates) {
                    try {
                        if (scene.doorActionSystem.queueAction(leader, candidate.group, 'open')) return true;
                    } catch {}
                }
                return false;
            };

            const resolveMoveGoalWorld = (worldX, worldY, radiusTiles = 2, snapToTileCenter = false) => {
                const resolved = typeof scene.findNearestWalkableWorld === 'function'
                    ? scene.findNearestWalkableWorld(worldX, worldY, radiusTiles)
                    : { x: worldX, y: worldY };
                if (!resolved) return { x: worldX, y: worldY };
                if (!snapToTileCenter || !scene.pathGrid?.worldToTile || !scene.pathGrid?.tileToWorld) {
                    return resolved;
                }
                const tile = scene.pathGrid.worldToTile(resolved.x, resolved.y);
                if (scene.pathGrid.isWalkable(tile.x, tile.y)) {
                    return scene.pathGrid.tileToWorld(tile.x, tile.y);
                }
                return resolved;
            };

            const hasActiveGoalNear = (goalWorld, slack = 48) => {
                const path = leader.currentPath;
                if (!Array.isArray(path) || path.length <= 0 || leader.pathIndex >= path.length) return false;
                const lastNode = path[path.length - 1];
                if (!lastNode) return false;
                return Math.hypot((lastNode.x || 0) - goalWorld.x, (lastNode.y || 0) - goalWorld.y) <= slack;
            };

            const assignDirectMoveToward = (worldX, worldY, radiusTiles = 2, force = false) => {
                if (!scene.movementSystem) return false;
                const goalWorld = resolveMoveGoalWorld(worldX, worldY, radiusTiles, false);
                if (!goalWorld) return false;
                if (Math.hypot(goalWorld.x - leader.x, goalWorld.y - leader.y) < 16) {
                    scene.movementSystem.clearPath?.(leader);
                    return true;
                }
                if (!force && hasActiveGoalNear(goalWorld, 52)) {
                    return true;
                }
                scene.movementSystem.assignPath(leader, [goalWorld]);
                scene.setMoveTarget?.(goalWorld.x, goalWorld.y);
                return true;
            };

            const assignStrategicPathToward = (worldX, worldY, radiusTiles = 4, force = false) => {
                if (!scene.pathGrid || !scene.pathPlanner || !scene.movementSystem) return false;
                const goalWorld = resolveMoveGoalWorld(worldX, worldY, radiusTiles, true);
                const startTile = scene.pathGrid.worldToTile(leader.x, leader.y);
                const endTile = scene.pathGrid.worldToTile(goalWorld.x, goalWorld.y);
                const goalKey = `${endTile.x},${endTile.y}`;
                const canReuse = !force
                    && goalKey === scene._botStrategicGoalKey
                    && hasActiveGoalNear(goalWorld, 56)
                    && (!scene._botLastStrategicRepathAt || (now - scene._botLastStrategicRepathAt) < 2200);
                if (canReuse) {
                    return true;
                }
                if (startTile.x === endTile.x && startTile.y === endTile.y) {
                    scene._botStrategicGoalKey = goalKey;
                    scene._botLastStrategicRepathAt = now;
                    scene.movementSystem.clearPath?.(leader);
                    return true;
                }
                if (scene.pathGrid.isWalkable(endTile.x, endTile.y)) {
                    try {
                        const path = scene.pathPlanner.findPath(startTile.x, startTile.y, endTile.x, endTile.y, scene.pathGrid);
                        if (path && path.length > 0) {
                            scene.movementSystem.assignPath(leader, path.map(pt => scene.pathGrid.tileToWorld(pt.x, pt.y)));
                            scene._botStrategicGoalKey = goalKey;
                            scene._botLastStrategicRepathAt = now;
                            scene.setMoveTarget?.(goalWorld.x, goalWorld.y);
                            return true;
                        }
                        const queuedDoor = tryQueueDoorOpenToward(worldX, worldY, endTile);
                        if (!queuedDoor && typeof window.render_game_to_text === 'function') {
                            console.error(`[bot-debug] findPath returned ${path ? 'empty' : 'null'} from (${startTile.x},${startTile.y}) to (${endTile.x},${endTile.y})`);
                        }
                        return queuedDoor;
                    } catch (err) {
                        console.error(`[bot-debug] findPath error: ${err.message}`);
                        return false;
                    }
                }
                const queuedDoor = tryQueueDoorOpenToward(worldX, worldY, endTile);
                if (!queuedDoor) {
                    console.error(`[bot-debug] no walkable tile found near target (${endTile.x},${endTile.y})`);
                }
                return queuedDoor;
            };

            // ─── DEEP STATE SNAPSHOT ───────────────────────
            const enemies = scene.enemyManager?.getActiveEnemies?.() || [];
            const now = scene.time?.now || 0;
            const followers = (scene.squadSystem?.followers || [])
                .map(f => {
                    try {
                        const s = f?.sprite || f;
                        if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
                        const combatState = scene.followerCombatSystem?.followerCombatState?.get(s.roleKey);
                        const ammoState = scene.marineAmmo?.get?.(s.roleKey);
                        const hasTarget = !!(combatState?.targetRef?.active);
                        const nearThreats = enemies.filter((enemy) => {
                            if (!enemy?.active || enemy.isDying) return false;
                            return Math.hypot((enemy.x || 0) - s.x, (enemy.y || 0) - s.y) < 350;
                        });
                        const nearReachableThreats = nearThreats.filter((enemy) => {
                            if (scene.enemyManager?.isClosedDoorBetweenWorldPoints?.(s.x, s.y, enemy.x, enemy.y)) return false;
                            return scene.enemyManager?.hasLineOfSight?.(s.x, s.y, enemy.x, enemy.y, 420) === true;
                        });
                        const trackerBusy = scene.isMarineTrackerBusy?.(s, now) === true;
                        const healBusy = scene.isMarineHealBusy?.(s, now) === true;
                        const actionBusy = scene.doorActionSystem?.isActorBusy?.(s) === true;
                        const lastFiredAt = Number(ammoState?.lastFiredAt) || -100000;
                        const recentlyFired = (now - lastFiredAt) <= 650;
                        const waitingToShoot = !!combatState && (
                            now < (Number(combatState.readyAt) || 0)
                            || now < (Number(combatState.nextFireAt) || 0)
                            || now < (Number(combatState.jamUntil) || 0)
                            || now < (Number(combatState.burstRecoverUntil) || 0)
                        );
                        const isReloading = ammoState?.isReloading === true;
                        const isOverheated = ammoState?.isOverheated === true;
                        const isEngaged = hasTarget || recentlyFired || waitingToShoot || isReloading || isOverheated || trackerBusy || healBusy || actionBusy;
                        return {
                            role: s.roleKey || 'unknown',
                            x: Math.round(s.x||0), y: Math.round(s.y||0),
                            hp: Math.round(s.health||0), maxHp: Math.round(s.maxHealth||0),
                            alive: s.active !== false && (s.health||0) > 0,
                            distToLeader: Math.round(Math.sqrt((s.x-leader.x)**2+(s.y-leader.y)**2)),
                            hasTarget,
                            isFiring: hasTarget,
                            isEngaged,
                            recentlyFired,
                            waitingToShoot,
                            isReloading,
                            isOverheated,
                            trackerBusy,
                            healBusy,
                            actionBusy,
                            nearEnemyCount: nearThreats.length,
                            nearReachableThreatCount: nearReachableThreats.length,
                            blockedThreatCount: Math.max(0, nearThreats.length - nearReachableThreats.length),
                            lastFiredAgoMs: Math.max(0, Math.round(now - lastFiredAt)),
                            target: combatState?.targetRef?.active ? {
                                x: Math.round(combatState.targetRef.x||0),
                                y: Math.round(combatState.targetRef.y||0),
                            } : null,
                            stuckMs: f?.nav?.stuckMs || f?.nav?.warpAccumMs || 0,
                        };
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);

            const enemySnap = enemies.slice(0, 30).map(e => ({
                type: e.enemyType || 'unknown',
                x: Math.round(e.x||0), y: Math.round(e.y||0),
                hp: Math.round(e.health||0),
                maxHp: Math.round(e.maxHealth||0),
                distToLeader: Math.round(Math.sqrt((e.x-leader.x)**2+(e.y-leader.y)**2)),
                spawnTravel: Math.round(Math.sqrt(((e.x||0) - (e.spawnX||e.x||0))**2 + ((e.y||0) - (e.spawnY||e.y||0))**2)),
                intent: e.intent || 'none',
                speed: Math.round(e.stats?.speed||0),
                dmg: Math.round(e.stats?.contactDamage||0),
            }));

            // Spawn proximity — enemy at full HP very close to any marine
            // Only flag if within 1 tile (64px) to focus on actual spawn-inside issues
            // rather than fast-closing enemies
            const marines = [leader, ...(scene.squadSystem?.followers||[]).map(f=>f.sprite||f)].filter(Boolean);
            const spawnProximityAlerts = [];
            for (const e of enemies) {
                if (e.health < e.maxHealth * 0.99) continue; // only pristine HP
                const spawnTravel = Math.sqrt(((e.x||0) - (e.spawnX||e.x||0))**2 + ((e.y||0) - (e.spawnY||e.y||0))**2);
                if (spawnTravel > 96) continue; // ignore fast-closing enemies that already moved well away from spawn
                for (const m of marines) {
                    if (!m.active) continue;
                    const d = Math.sqrt((e.x-m.x)**2 + (e.y-m.y)**2);
                    if (d < 64) { // < 1 tile — actual spawn-proximity problem
                        spawnProximityAlerts.push({
                            enemyType: e.enemyType, dist: Math.round(d),
                            marineRole: m.roleKey || 'leader',
                            spawnTravel: Math.round(spawnTravel),
                            eHP: Math.round(e.health), eMaxHP: Math.round(e.maxHealth),
                        });
                    }
                }
            }

            // Door states
            const doors = (scene.doorManager?.doorGroups || []).map(d => ({
                state: d.state, integrity: d.integrity ?? 100,
                passable: !!d.isPassable,
            }));

            // Combat director
            const combat = {
                state: scene.combatMods?.state || 'manual',
                pressure: +(scene.combatMods?.pressure || 0).toFixed(2),
                wave: scene.stageFlow?.currentWave || 0,
                totalWaves: scene.stageFlow?.totalWaves || 0,
                aliveEnemies: scene.enemyManager?.getAliveCount?.() || enemies.length,
            };

            const tracker = {
                active: scene.isMotionTrackerActive?.(scene.time.now) === true,
                riskLocked: scene.isMotionTrackerRiskLocked?.(scene.time.now) === true,
                cooldownRemainingMs: Math.max(0, Math.round((scene.trackerCooldownUntil || 0) - (scene.time.now || 0))),
                channelRemainingMs: Math.max(0, Math.round((scene.trackerChannelUntil || 0) - (scene.time.now || 0))),
                scanRemainingMs: Math.max(0, Math.round((scene.trackerScanUntil || 0) - (scene.time.now || 0))),
                operatorRole: scene.trackerOperator?.roleKey || (scene.trackerOperator?.actor?.roleKey) || 'leader',
                contacts: (scene.enemyManager?.getMotionContacts?.() || []).slice(0, 16).map(c => ({
                    x: Math.round(c.x || 0),
                    y: Math.round(c.y || 0),
                    confidence: +(Number(c.confidence) || 0).toFixed(2),
                    speed: Math.round(Number(c.speed) || 0),
                    tracked: c.tracked === true,
                    echo: c.isEcho === true,
                    phantom: c.isPhantom === true,
                })),
            };

            // Weapon state
            let weapon = { key: scene?.weaponManager?.currentWeaponKey || 'unknown' };
            const ammoState = scene?.marineAmmo?.get?.('leader');
            if (weapon.key === 'pulseRifle') {
                const pulseAmmo = Math.max(0, Number(scene?.weaponManager?.pulseAmmo) || 0);
                const magSize = Math.max(1, Number(scene?.weaponManager?.pulseMaxAmmo) || 99);
                weapon = {
                    key: weapon.key,
                    ammo: {
                        counter: Math.round(pulseAmmo),
                        magSize,
                        heatPct: +Math.max(0, Math.min(1, 1 - (pulseAmmo / magSize))).toFixed(3),
                        overheated: scene?.weaponManager?.isOverheated === true,
                        emptyDelayMs: Math.max(0, Math.round((Number(scene?.weaponManager?.overheatCooldownUntil) || 0) - now)),
                    },
                };
            } else if (ammoState) {
                weapon = {
                    key: weapon.key,
                    ammo: {
                        mag: ammoState.currentMag,
                        mags: ammoState.magsLeft,
                        magSize: ammoState.magSize,
                        reloading: !!ammoState.isReloading,
                    },
                };
            }

            // Knockback
            const knockback = {
                active: (leader._knockbackUntil || 0) > now,
                vx: leader._knockbackVx || 0,
                vy: leader._knockbackVy || 0,
            };

            // ─── EXECUTE BOT ACTION ────────────────────────
            if (act.type === 'combat') {
                const cands = act.candidates || [];
                let best = null;
                let bestDist = Infinity;
                let bestScore = Infinity;
                for (const c of cands) {
                    const sd = Math.sqrt((leader.x - c.x) ** 2 + (leader.y - c.y) ** 2);
                    let score = sd;
                    if (c.type === 'facehugger') score -= 180;
                    else if (c.type === 'queen' || c.type === 'queenLesser') score -= 120;
                    else if (c.type === 'drone') score -= 24;
                    if (sd < 180) score -= 40;
                    if (score < bestScore) {
                        bestScore = score;
                        bestDist = sd;
                        best = c;
                    }
                }
                if (!best && cands.length > 0) {
                    best = cands.reduce((a,b) =>
                        Math.sqrt((leader.x-a.x)**2+(leader.y-a.y)**2) <
                        Math.sqrt((leader.x-b.x)**2+(leader.y-b.y)**2) ? a : b);
                    bestDist = Math.sqrt((leader.x-best.x)**2+(leader.y-best.y)**2);
                }
                if (best) {
                    if (typeof leader.facePosition === 'function') leader.facePosition(best.x, best.y);
                    if (scene.inputHandler) scene.inputHandler._botFiring = true;
                    const ptr = scene.input?.activePointer;
                    if (ptr) { ptr.worldX = best.x; ptr.worldY = best.y; }
                    // Combat movement stays local: use a direct one-node move instead of a full path solve.
                    const canRepathCombat = !scene._botLastCombatRepathAt || (now - scene._botLastCombatRepathAt) >= 900;
                    if (bestDist < 250 && canRepathCombat) {
                        const dx = leader.x-best.x, dy = leader.y-best.y;
                        const len = Math.sqrt(dx*dx+dy*dy)||1;
                        const mx = leader.x+(dx/len)*200, my = leader.y+(dy/len)*200;
                        if (assignDirectMoveToward(mx, my, 3, true)) {
                            scene._botLastCombatRepathAt = now;
                        }
                    }
                }
            } else if (act.type === 'retreat') {
                const cands = act.candidates || [];
                const squad = Array.isArray(act.squad) ? act.squad : [];
                if (scene.inputHandler) scene.inputHandler._botFiring = cands.length > 0;
                const centroid = cands.length > 0
                    ? cands.reduce((acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }), { x: 0, y: 0 })
                    : { x: leader.x, y: leader.y };
                centroid.x /= Math.max(1, cands.length || 1);
                centroid.y /= Math.max(1, cands.length || 1);
                const squadCenter = squad.length > 0
                    ? squad.reduce((acc, m) => ({ x: acc.x + m.x, y: acc.y + m.y }), { x: 0, y: 0 })
                    : { x: leader.x, y: leader.y };
                squadCenter.x /= Math.max(1, squad.length || 1);
                squadCenter.y /= Math.max(1, squad.length || 1);
                const awayDx = leader.x - centroid.x;
                const awayDy = leader.y - centroid.y;
                const awayLen = Math.sqrt(awayDx * awayDx + awayDy * awayDy) || 1;
                const tx = leader.x + (awayDx / awayLen) * 220 + (squadCenter.x - leader.x) * 0.35;
                const ty = leader.y + (awayDy / awayLen) * 220 + (squadCenter.y - leader.y) * 0.35;
                if (cands[0] && typeof leader.facePosition === 'function') leader.facePosition(cands[0].x, cands[0].y);
                if (!assignDirectMoveToward(tx, ty, 4, true) && leader.body) {
                    const len = Math.hypot(tx - leader.x, ty - leader.y) || 1;
                    leader.body.setVelocity(((tx - leader.x) / len) * 180, ((ty - leader.y) / len) * 180);
                }
            } else if (act.type === 'tracker') {
                const ok = scene.startMotionTrackerScan?.(scene.time.now, 'tech');
                act._trackerStarted = ok === true;
                if (!ok) {
                    const fallback = scene.startMotionTrackerScan?.(scene.time.now, 'leader');
                    act._trackerStarted = fallback === true;
                }
                if (scene.inputHandler) scene.inputHandler._botFiring = false;
            } else if (act.type === 'move' || act.type === 'regroup') {
                if (scene.inputHandler) scene.inputHandler._botFiring = false;
                if (scene.pathGrid && scene.pathPlanner && scene.movementSystem) {
                    const routed = assignStrategicPathToward(act.tx, act.ty);
                    if (!routed && leader.body) {
                        const dx = act.tx-leader.x, dy = act.ty-leader.y;
                        const l = Math.sqrt(dx*dx+dy*dy)||1;
                        leader.body.setVelocity((dx/l)*180,(dy/l)*180);
                    }
                } else if (leader.body) {
                    const dx = act.tx-leader.x, dy = act.ty-leader.y;
                    const l = Math.sqrt(dx*dx+dy*dy)||1;
                    leader.body.setVelocity((dx/l)*180,(dy/l)*180);
                }
            } else if (act.type === 'unstick') {
                if (scene.inputHandler) scene.inputHandler._botFiring = false;
                if (scene.pathGrid && scene.pathPlanner && scene.movementSystem) {
                    for (let a = 0; a < 12; a++) {
                        const ang = Math.random() * Math.PI * 2;
                        const rad = (4 + Math.random()*6) * 64;
                        const tx = leader.x + Math.cos(ang)*rad;
                        const ty = leader.y + Math.sin(ang)*rad;
                        const tile = scene.pathGrid.worldToTile(tx,ty);
                        if (scene.pathGrid.isWalkable(tile.x,tile.y)) {
                            try {
                                const s = scene.pathGrid.worldToTile(leader.x,leader.y);
                                const p = scene.pathPlanner.findPath(s.x,s.y,tile.x,tile.y,scene.pathGrid);
                                if (p && p.length > 0) {
                                    scene.movementSystem.assignPath(leader,
                                        p.map(pt => scene.pathGrid.tileToWorld(pt.x,pt.y)));
                                    break;
                                }
                            } catch {}
                        }
                    }
                } else if (leader.body) {
                    const ang = Math.random()*Math.PI*2;
                    leader.body.setVelocity(Math.cos(ang)*200, Math.sin(ang)*200);
                }
            } else {
                // idle — stop firing
                if (scene.inputHandler) scene.inputHandler._botFiring = false;
            }

            // ─── READ FINAL STATE ──────────────────────────
            let stateJson = null;
            try { stateJson = window.render_game_to_text(); } catch {}
            const missionState = scene.lastMissionState || scene.missionFlow?.getState?.() || null;

            return {
                state: stateJson,
                followers, enemySnap,
                spawnProximityAlerts,
                doors, combat, weapon, knockback, tracker,
                missionTarget: missionState?.targetWorld
                    ? {
                        x: Math.round(Number(missionState.targetWorld.x) || 0),
                        y: Math.round(Number(missionState.targetWorld.y) || 0),
                    }
                    : null,
                missionPhase: String(missionState?.phaseLabel || ''),
                trackerActionStarted: act.type === 'tracker' ? act._trackerStarted === true : false,
            };
        }, 9000, action);

        /* ── Handle eval failure ────────────────────────── */
        if (!tickResult || tickResult.err || !tickResult.state) {
            evalFails++;
            L('WARN', `Eval fail #${evalFails}: ${tickResult?.err||'no state'}`);
            if (evalFails >= 20) {
                tracker.add('critical','error','20 consecutive eval failures');
                outcome = 'state_lost'; break;
            }
            await sleep(1000); continue;
        }
        evalFails = 0;

        /* ── Parse new state ────────────────────────────── */
        state = JSON.parse(tickResult.state);
        missionTarget = tickResult.missionTarget && Number.isFinite(tickResult.missionTarget.x) && Number.isFinite(tickResult.missionTarget.y)
            ? tickResult.missionTarget
            : null;
        missionPhase = String(tickResult.missionPhase || '');
        const leader   = state.leader;
        const hostiles2 = state.hostiles || [];
        const squad    = state.squad || [];
        const aliveSquad = squad.filter(m => m.alive).length;
        const aliveSquadRoles = new Set(squad.filter(m => m.alive).map(m => m.role));
        const activeFollowerSnapshots = (tickResult.followers || []).filter(f => aliveSquadRoles.has(f.role));
        const aliveFollowerCount = squad.filter(m => m.alive && m.role !== 'leader').length;
        const firingFollowerCount = activeFollowerSnapshots.filter(f => f.recentlyFired).length || 0;
        const engagedFollowerCount = activeFollowerSnapshots.filter(f => f.isEngaged).length || 0;

        // ── TRACKER VALIDATION ──────────────────────────
        if (tickResult.trackerActionStarted) {
            tracker.setCheck('tracker', true, 'Tracker activation command accepted');
        }
        if (tickResult.tracker?.active) {
            trackerEverActive = true;
            tracker.setCheck('tracker', true, `Tracker active (${Math.round((tickResult.tracker.scanRemainingMs || 0) / 1000)}s remaining)`);
        }
        if ((tickResult.tracker?.contacts?.length || 0) > 0) {
            trackerSawContacts = true;
            tracker.setCheck('tracker', true, `Tracker reported ${tickResult.tracker.contacts.length} contact(s)`);
        }
        if (!tickResult.tracker?.active && (tickResult.tracker?.cooldownRemainingMs || 0) > 0) {
            trackerCooldownObserved = true;
            tracker.setCheck('tracker', true, `Tracker cooldown observed (${Math.round(tickResult.tracker.cooldownRemainingMs / 1000)}s)`);
        }

        /* ══════════════════════════════════════════════════
           COMPREHENSIVE CHECKS
           ══════════════════════════════════════════════════ */

        // ── 1. SPAWN PROXIMITY ───────────────────────────
        if (tickResult.spawnProximityAlerts?.length > 0) {
            for (const a of tickResult.spawnProximityAlerts) {
                spawnProxIssues++;
                tracker.add('high','spawn',
                    `${a.enemyType} at ${a.dist}px from ${a.marineRole} (HP ${a.eHP}/${a.eMaxHP})`,
                    a);
                L('ISSUE', `SPAWN PROXIMITY: ${a.enemyType} @ ${a.dist}px from ${a.marineRole}`);
            }
        }

        // ── 2. FOLLOWER BEHAVIOR ─────────────────────────
        if (activeFollowerSnapshots.length > 0) {
            for (const f of activeFollowerSnapshots) {
                if (!f.alive) continue;
                if (f.distToLeader > 600) {
                    tracker.add('medium','follower',
                        `${f.role} far from leader (${f.distToLeader}px)`,
                        { role: f.role, dist: f.distToLeader });
                }
                if (f.stuckMs > 3000) {
                    tracker.add('medium','follower',
                        `${f.role} stuck ${(f.stuckMs/1000).toFixed(1)}s`,
                        { role: f.role, stuckMs: f.stuckMs });
                }
                // Not firing when multiple reachable enemies are close.
                const reachableThreats = Number(f.nearReachableThreatCount ?? 0);
                if (reachableThreats >= 2 && !f.isEngaged) {
                    tracker.add('medium','follower',
                        `${f.role} idle with ${reachableThreats} reachable enemies < 350px`,
                        {
                            role: f.role,
                            nearEnemies: reachableThreats,
                            nearbyThreats: f.nearEnemyCount,
                            blockedNearbyThreats: f.blockedThreatCount,
                            hasTarget: f.hasTarget,
                            recentlyFired: f.recentlyFired,
                            waitingToShoot: f.waitingToShoot,
                            isReloading: f.isReloading,
                            isOverheated: f.isOverheated,
                            trackerBusy: f.trackerBusy,
                            healBusy: f.healBusy,
                            actionBusy: f.actionBusy,
                            lastFiredAgoMs: f.lastFiredAgoMs,
                        });
                }
            }
        }

        // ── 3. SQUAD DEATH ───────────────────────────────
        if (aliveSquad < prevSquadAlive) {
            const lost = prevSquadAlive - aliveSquad;
            const deadRoles = [...prevAliveSquadRoles].filter(role => !aliveSquadRoles.has(role));
            const nearE = (tickResult.enemySnap||[]).filter(
                e => e.distToLeader < 500);
            const entry = {
                time: (elapsed/1000).toFixed(1), lost, deadRoles,
                leaderHP: leader.health, nearbyEnemies: nearE.length,
                enemyTypes: nearE.map(e=>e.type),
                pressure: tickResult.combat?.pressure,
            };
            followerDeaths.push(entry);
            L('EVENT', `FOLLOWER DEATH: ${lost} lost (${deadRoles.join(',')}) | ${nearE.length} near | P=${tickResult.combat?.pressure}`);
            if (nearE.length > (aliveSquad + lost) * 3) {
                tracker.add('high','combat',
                    `Squad overwhelmed: ${nearE.length} enemies vs ${aliveSquad+lost} marines`, entry);
            }
        }
        prevSquadAlive = aliveSquad;
            prevAliveSquadRoles = aliveSquadRoles;

        // ── 4. LEADER DAMAGE ─────────────────────────────
        if (leader.health < prevLeaderHP) {
            const dmg = prevLeaderHP - leader.health;
            const nearE = (tickResult.enemySnap||[]).filter(e => e.distToLeader < 200);
            const entry = {
                time: (elapsed/1000).toFixed(1), dmg, hpAfter: leader.health,
                nearbyEnemies: nearE.length,
                closestEnemy: nearE[0] ? { type: nearE[0].type, dist: nearE[0].distToLeader, dmg: nearE[0].dmg } : null,
                knockback: tickResult.knockback,
                followersAlive: aliveFollowerCount,
                followersFiring: firingFollowerCount,
                followersEngaged: engagedFollowerCount,
            };
            leaderDamageEvents.push(entry);
            if (dmg > 25) {
                L('EVENT', `BURST DMG -${dmg}HP → ${leader.health} | ${nearE.length} close | engaging: ${entry.followersEngaged}/${aliveFollowerCount}`);
                tracker.add('high','combat', `Leader burst damage ${dmg}HP`, entry);
            }
            if (aliveFollowerCount > 0 && entry.followersEngaged === 0 && nearE.length > 0) {
                tracker.add('high','follower',
                    `Leader took ${dmg}HP, ${aliveFollowerCount} followers not engaging (${nearE.length} enemies)`, entry);
            }
        }
        prevLeaderHP = leader.health;

        // ── 5. KNOCKBACK CHECK ───────────────────────────
        if (tickResult.knockback?.active) {
            tracker.setCheck('physics', true, 'Knockback active');
        }

        // ── 6. MODE TRANSITIONS ──────────────────────────
        if (state.mode !== prevMode) {
            modeHistory.push(state.mode);
            L('EVENT', `MODE: ${prevMode} → ${state.mode}`);
            tracker.setCheck('mode', true, `${prevMode}→${state.mode}`);
            const valid = { combat:['intermission','extract','defeat'], intermission:['combat','defeat'], extract:['victory','defeat'] };
            if (valid[prevMode] && !valid[prevMode].includes(state.mode))
                tracker.add('high','mode', `Invalid transition: ${prevMode}→${state.mode}`);
            prevMode = state.mode;
        }

        // ── 7. COMBAT STALL ──────────────────────────────
        if (near.length > 0) {
            if (killCount > lastKillTick) { lastKillTick = killCount; idleCombatTicks = 0; }
            else idleCombatTicks++;
            if (idleCombatTicks > 60) {
                tracker.add('medium','combat',
                    `Combat stall: ${idleCombatTicks} ticks (${(idleCombatTicks*TICK_MS/1000).toFixed(0)}s) near enemies without kills`,
                    { ticks: idleCombatTicks, hostiles: near.length });
                idleCombatTicks = 0;
            }
        } else {
            idleCombatTicks = 0;
        }

        // ── 8. DOOR INTEGRITY ────────────────────────────
        if (tickResult.doors) {
            for (const d of tickResult.doors) {
                if (d.integrity < 0) tracker.add('medium','door','Negative door integrity', d);
            }
        }

        // ── 9. END CONDITIONS ────────────────────────────
        if (state.mode === 'victory') {
            L('INFO', `VICTORY at ${(elapsed/1000).toFixed(1)}s`);
            tracker.setCheck('mode', true, 'Victory');
            outcome = 'victory'; break;
        }
        if (state.mode === 'defeat') {
            const nearE = (tickResult.enemySnap||[]).filter(e => e.distToLeader < 300);
            const d = {
                time: (elapsed/1000).toFixed(1),
                nearEnemies: nearE.length,
                enemyTypes: nearE.map(e => `${e.type}(${e.distToLeader}px,${e.hp}hp)`),
                followersAlive: aliveFollowerCount,
                followersFiring: firingFollowerCount,
                followersEngaged: engagedFollowerCount,
                totalKills: killCount, pressure: tickResult.combat?.pressure,
                wave: tickResult.combat?.wave,
                last5damage: leaderDamageEvents.slice(-5),
            };
            deathAnalysis.push(d);

            let fairness = 'fair';
            if (nearE.some(e => e.distToLeader < 100 && e.hp > e.maxHp * 0.9 && (e.spawnTravel || 0) <= 96))
                fairness = 'suspicious — full-HP enemy inside melee range (spawn inside?)';
            if (aliveFollowerCount > 0 && d.followersEngaged === 0)
                fairness = 'unfair — followers alive but not engaging';
            d.fairness = fairness;

            L('DEATH', `DEFEAT ${(elapsed/1000).toFixed(1)}s | ${fairness}`);
            L('DEATH', `Enemies: ${d.enemyTypes.join(', ')}`);
            L('DEATH', `Followers alive=${aliveFollowerCount} engaging=${d.followersEngaged} firing=${d.followersFiring}`);
            tracker.add(fairness === 'fair' ? 'low' : 'high', 'combat', `Death: ${fairness}`, d);
            outcome = 'defeat'; break;
        }

        // ── 10. KILLS ────────────────────────────────────
        const curHostN = hostiles2.length;
        if (curHostN < prevHostileN && prevHostileN > 0) {
            const killed = prevHostileN - curHostN;
            killCount += killed;
            combatLog.push({ t: elapsed, kills: killed, total: killCount });
        }
        prevHostileN = curHostN;

        // ── 11. STUCK ────────────────────────────────────
        const md = dist(leader.x, leader.y, prevLeaderPos.x, prevLeaderPos.y);
        const closeThreat = (tickResult.enemySnap || []).some(e => e.distToLeader < 220);
        const combatAnchored = action?.type === 'combat'
            || action?.type === 'retreat'
            || action?.goal === 'hunt'
            || (tickResult.weapon?.ammo?.overheated === true && closeThreat);
        if (md > 5) {
            prevLeaderPos = { x: leader.x, y: leader.y };
            lastMoveTime = Date.now();
            stuckCount = 0;
        } else if (Date.now() - lastMoveTime > STUCK_MS) {
            stuckCount++;
            if (!combatAnchored && stuckCount <= 3) {
                const screenshotPath = path.join(OUT, `bot-${mission}-stuck-${stuckCount}.png`);
                await page.screenshot({ path: screenshotPath });
                L('WARN', `STUCK (${leader.x},${leader.y}) ${((Date.now()-lastMoveTime)/1000).toFixed(1)}s - screenshot: ${screenshotPath}`);
                tracker.add('medium','pathfinding', `Stuck at (${leader.x},${leader.y})`,
                    { x: leader.x, y: leader.y, count: stuckCount, screenshot: screenshotPath });
            }
        }

        // ── 12. STATUS LOG ───────────────────────────────
        if (Date.now() - lastStatusLog > STATUS_INTERVAL) {
            lastStatusLog = Date.now();
            healthTimeline.push({
                t: elapsed, hp: leader.health, squad: aliveSquad,
                hostiles: curHostN, kills: killCount,
                mode: state.mode, pressure: tickResult.combat?.pressure,
                wave: tickResult.combat?.wave,
            });
            L('STATUS', `${(elapsed/1000).toFixed(0)}s | HP:${leader.health}/${leader.maxHealth} | Sq:${aliveSquad}/${squad.length} | H:${curHostN} | K:${killCount} | ${state.mode} P=${tickResult.combat?.pressure} W=${tickResult.combat?.wave}`);
        }

        await sleep(TICK_MS);
    }

    /* ── Final diagnostics ────────────────────────────────── */
    const finalInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        return {
            state: window.render_game_to_text?.() || null,
            navDiags: s?.squadNavDiagnostics?.slice(-30) || [],
        };
    }, 5000);

    let finalState = null;
    try { finalState = finalInfo?.state ? JSON.parse(finalInfo.state) : null; } catch {}
    const navDiags = (finalInfo?.navDiags || []).filter(d => (d.stuckMs||0) > 1500 || d.type==='warp');

    tracker.setCheck('spawn', spawnProxIssues === 0,
        spawnProxIssues > 0 ? `${spawnProxIssues} proximity violations` : 'Clean');
    tracker.setCheck('completion', outcome === 'victory', `Outcome: ${outcome}`);
    if (trackerAttempts > 0 && !trackerEverActive) {
        tracker.add('high', 'tracker', 'Tracker never became active after bot activation attempts', { attempts: trackerAttempts });
    }
    if (trackerEverActive && !trackerCooldownObserved) {
        tracker.add('medium', 'tracker', 'Tracker activated but cooldown was not observed before mission end', { attempts: trackerAttempts });
    }
    if (trackerEverActive && !trackerSawContacts && maxHostilesSeen > 0) {
        tracker.add('medium', 'tracker', 'Tracker activated but never reported contacts during hostile activity', { maxHostilesSeen, attempts: trackerAttempts });
    }
    if (navDiags.length > 0) tracker.add('medium','pathfinding',`${navDiags.length} follower nav events`);

    L('INFO', '════════════════════════════════════');
    L('INFO', `${mission} DONE: ${outcome} | ${((Date.now()-startTime)/1000).toFixed(1)}s`);
    L('INFO', `HP:${finalState?.leader?.health||0}/${finalState?.leader?.maxHealth||0} Sq:${finalState?.squad?.filter(m=>m.alive).length||0}/${finalState?.squad?.length||0} K:${killCount}`);
    L('INFO', `Issues: ${tracker.issues.length} | Modes: ${modeHistory.join('→')}`);

    await browser.close();

    return {
        mission, outcome,
        durationS: ((Date.now()-startTime)/1000).toFixed(1),
        finalHP: finalState?.leader?.health || 0,
        maxHP: finalState?.leader?.maxHealth || 0,
        squadAlive: finalState?.squad?.filter(m=>m.alive).length || 0,
        squadTotal: finalState?.squad?.length || 0,
        kills: killCount, maxHostiles: maxHostilesSeen,
        damageTaken: Math.max(0, (state.leader?.maxHealth||100) - (finalState?.leader?.health||0)),
        modeHistory, consoleErrors, pageErrors,
        healthTimeline, combatLog,
        followerDeaths, deathAnalysis,
        leaderDamageEvents: leaderDamageEvents.slice(-20),
        navDiags,
        issueTracker: tracker.summary(),
    };
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */
async function safeEval(page, fn, ms = 5000, arg) {
    try {
        const r = arg !== undefined
            ? await withTimeout(page.evaluate(fn, arg), ms)
            : await withTimeout(page.evaluate(fn), ms);
        return r;
    } catch (e) {
        return { err: e.message || String(e) };
    }
}

function buildWanderGrid(map) {
    const targets = [];
    const margin = 128;
    const cols = 5, rows = 4;
    const sx = Math.max(200, (map.w - margin*2) / cols);
    const sy = Math.max(200, (map.h - margin*2) / rows);
    for (let r = 0; r < rows; r++) {
        const y = margin + r*sy + sy/2;
        const fwd = r % 2 === 0;
        for (let c = 0; c < cols; c++) {
            const col = fwd ? c : (cols-1-c);
            targets.push({ x: margin + col*sx + sx/2, y });
        }
    }
    targets.push({ x: map.w/2, y: map.h/2 });
    return targets;
}

function makeResult(mission, outcome, tracker, log, ce, pe, ht, cl, da) {
    return {
        mission, outcome, durationS: '0',
        finalHP: 0, maxHP: 0, squadAlive: 0, squadTotal: 0,
        kills: 0, maxHostiles: 0, damageTaken: 0,
        modeHistory: [], consoleErrors: ce, pageErrors: pe,
        healthTimeline: ht, combatLog: cl,
        followerDeaths: [], deathAnalysis: da,
        leaderDamageEvents: [], navDiags: [],
        issueTracker: tracker.summary(),
    };
}

/* ══════════════════════════════════════════════════════════════════
   REPORT GENERATOR
   ══════════════════════════════════════════════════════════════════ */
function printReport(results) {
    const W = 70;
    const hr = c => c.repeat(W);
    const out = [];
    const p = s => { out.push(s); console.log(s); };

    p('\n' + hr('═'));
    p('  ALIENS PLAYTEST BOT — COMPREHENSIVE REPORT');
    p(hr('═'));

    for (const r of results) {
        p(`\n${hr('─')}`);
        p(`  MISSION: ${r.mission}  |  OUTCOME: ${r.outcome}  |  ${r.durationS}s`);
        p(hr('─'));
        p(`  HP: ${r.finalHP}/${r.maxHP}  Squad: ${r.squadAlive}/${r.squadTotal}  Kills: ${r.kills}  MaxHostiles: ${r.maxHostiles}`);
        p(`  Modes: ${r.modeHistory?.join(' → ') || 'n/a'}`);

        const iss = r.issueTracker;
        if (iss) {
            const sev = iss.bySeverity;
            p(`\n  ISSUES (${iss.issues.length}):`);
            for (const s of ['critical','high','medium','low']) {
                if (!sev[s]?.length) continue;
                p(`    [${s.toUpperCase()}] (${sev[s].length}):`);
                const shown = new Set();
                for (const i of sev[s]) {
                    const key = `${i.category}:${i.msg}`;
                    if (shown.has(key)) continue;
                    shown.add(key);
                    p(`      [${i.category}] ${i.msg}`);
                }
            }
            p('\n  CHECKS:');
            for (const [cat, c] of Object.entries(iss.checks)) {
                const mark = c.fail > 0 ? '✗' : '✓';
                p(`    ${mark} ${cat}: ${c.fail > 0 ? 'FAIL' : 'PASS'} (${c.pass}/${c.pass+c.fail})`);
                for (const n of c.notes.slice(0,3)) p(`        ${n}`);
            }
        }

        if (r.deathAnalysis?.length > 0) {
            p('\n  DEATH ANALYSIS:');
            for (const d of r.deathAnalysis) {
                p(`    ${d.time}s | Fairness: ${d.fairness}`);
                p(`    Enemies: ${d.enemyTypes?.join(', ') || 'none'}`);
                p(`    Followers: alive=${d.followersAlive} engaging=${d.followersEngaged ?? d.followersFiring} firing=${d.followersFiring}`);
                p(`    P=${d.pressure} W=${d.wave} K=${d.totalKills}`);
            }
        }

        if (r.followerDeaths?.length > 0) {
            p('\n  FOLLOWER DEATHS:');
            for (const f of r.followerDeaths)
                p(`    ${f.time}s: ${f.lost} (${f.deadRoles?.join(',')}) | ${f.nearbyEnemies} enemies | P=${f.pressure}`);
        }

        const bursts = (r.leaderDamageEvents||[]).filter(d => d.dmg > 15);
        if (bursts.length > 0) {
            p('\n  BURST DAMAGE:');
            for (const d of bursts.slice(0,5))
                p(`    ${d.time}s: -${d.dmg}HP→${d.hpAfter} | ${d.closestEnemy?.type||'?'}@${d.closestEnemy?.dist||'?'}px | engaging:${d.followersEngaged ?? d.followersFiring}/${d.followersAlive}`);
        }

        if (r.consoleErrors?.length > 0) {
            p(`\n  CONSOLE ERRORS (${r.consoleErrors.length}):`);
            for (const e of [...new Set(r.consoleErrors)].slice(0,5)) p(`    - ${e.slice(0,100)}`);
        }
        if (r.pageErrors?.length > 0) {
            p(`\n  PAGE ERRORS (${r.pageErrors.length}):`);
            for (const e of r.pageErrors.slice(0,5)) p(`    - ${e.slice(0,100)}`);
        }
    }

    p(`\n${hr('═')}`);
    p('  OVERALL');
    p(hr('─'));
    const ti = results.reduce((s,r) => s+(r.issueTracker?.issues?.length||0), 0);
    const cr = results.reduce((s,r) => s+(r.issueTracker?.bySeverity?.critical?.length||0), 0);
    const hi = results.reduce((s,r) => s+(r.issueTracker?.bySeverity?.high?.length||0), 0);
    const vic = results.filter(r => r.outcome==='victory').length;
    const def = results.filter(r => r.outcome==='defeat').length;
    p(`  ${results.length} missions | ${vic} victory | ${def} defeat`);
    p(`  ${ti} issues (${cr} critical, ${hi} high)`);
    p(`  ${cr > 0 ? 'CRITICAL' : hi > 0 ? 'ISSUES FOUND' : ti > 0 ? 'MINOR' : 'ALL CLEAR'}`);
    p(hr('═'));

    return out.join('\n');
}

/* ══════════════════════════════════════════════════════════════════
   ENTRY POINT
   ══════════════════════════════════════════════════════════════════ */
const results = [];
for (const m of missions) {
    try {
        results.push(await runMission(m));
    } catch (e) {
        console.error(`[${m}] Fatal: ${e.message}`);
        const t = new IssueTracker(m);
        t.add('critical','error',`Fatal: ${e.message}`);
        results.push({
            mission: m, outcome: 'crash', durationS: '0',
            finalHP: 0, maxHP: 0, squadAlive: 0, squadTotal: 0,
            kills: 0, maxHostiles: 0, damageTaken: 0,
            modeHistory: [], consoleErrors: [], pageErrors: [e.message],
            healthTimeline: [], combatLog: [],
            followerDeaths: [], deathAnalysis: [],
            leaderDamageEvents: [], navDiags: [],
            issueTracker: t.summary(),
        });
    }
}

const report = printReport(results);
fs.writeFileSync(path.join(OUT, 'bot-playtest-results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(OUT, 'bot-report.txt'), report);
console.log(`\nResults: ${path.join(OUT, 'bot-playtest-results.json')}`);
console.log(`Report:  ${path.join(OUT, 'bot-report.txt')}`);

const hasCritical = results.some(r => (r.issueTracker?.bySeverity?.critical?.length||0) > 0);
process.exit(hasCritical ? 2 : results.some(r => r.outcome==='crash') ? 1 : 0);
