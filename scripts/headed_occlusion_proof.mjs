#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.argv[2] || 'output/headed-occlusion-proof';
const url = process.argv[3] || 'http://127.0.0.1:8192/game/?renderer=canvas&mission=m5';

fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: false, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console:${m.text()}`);
});

await page.goto(url, { waitUntil: 'domcontentloaded' });

await page.waitForFunction(() => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
    return !!scene && !!scene.wallLayer && !!scene.enemyManager && !!scene.leader;
}, null, { timeout: 15000 });

await sleep(1200);

const prep = await page.evaluate(() => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
    if (!scene) return { ok: false, reason: 'no_scene' };

    const setBodyPos = (obj, x, y) => {
        obj.x = x;
        obj.y = y;
        if (obj.body) {
            obj.body.reset(x, y);
            obj.body.setVelocity(0, 0);
        }
    };

    const tileSize = Number(scene.pathGrid?.tileSize) || 64;
    const worldCenter = (tx, ty) => ({ x: tx * tileSize + tileSize * 0.5, y: ty * tileSize + tileSize * 0.5 });

    const leader = scene.leader;
    const enemies = (scene.enemyManager?.enemies || []).filter((e) => e && e.active && e.body);
    if (enemies.length === 0) return { ok: false, reason: 'no_enemy' };

    // 1) Find a wall tile with walkable floor on both left and right for through-wall shot test.
    let wallTest = null;
    const grid = scene.pathGrid;
    const w = Number(grid?.width) || 0;
    const h = Number(grid?.height) || 0;
    for (let ty = 2; ty < h - 2 && !wallTest; ty++) {
        for (let tx = 2; tx < w - 2 && !wallTest; tx++) {
            const wall = !!scene.wallLayer.getTileAt(tx, ty);
            if (!wall) continue;
            if (!grid.isWalkable(tx - 1, ty) || !grid.isWalkable(tx - 2, ty)) continue;
            if (!grid.isWalkable(tx + 1, ty) || !grid.isWalkable(tx + 2, ty)) continue;
            wallTest = { tx, ty };
        }
    }
    if (!wallTest) return { ok: false, reason: 'no_wall_slot' };

    const enemy = enemies[0];
    const probeId = `occlusion_probe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const enemyId = String(enemy.name || enemy.texture?.key || 'enemy0');
    const leftPos = worldCenter(wallTest.tx - 1, wallTest.ty);
    const rightPos = worldCenter(wallTest.tx + 1, wallTest.ty);

    setBodyPos(leader, leftPos.x, leftPos.y);
    setBodyPos(enemy, rightPos.x, rightPos.y);
    // Pin a dedicated probe enemy so post-fire sampling is deterministic.
    enemy._occlusionProbeId = probeId;
    enemy.maxHealth = Math.max(5000, Number(enemy.maxHealth) || 100);
    enemy.health = enemy.maxHealth;
    enemy.hitSlowUntil = 0;
    enemy.navRecoverUntil = 0;
    enemy.investigateUntil = 0;
    if (enemy.body) {
        enemy.body.moves = false;
        enemy.body.immovable = true;
    }

    scene.weaponManager.currentWeaponKey = 'pulseRifle';
    scene.weaponManager.jamUntil = 0;
    scene.weaponManager.recoil.pulseRifle = 0;

    const angleToEnemy = Math.atan2(enemy.y - leader.y, enemy.x - leader.x);
    leader.facingAngle = angleToEnemy;
    leader.rotation = angleToEnemy;

    // 2) Find a closed door and setup for flash-occlusion snapshot.
    const closedDoor = (scene.doorManager?.doorGroups || []).find((g) => g && g.state === 'closed' && Array.isArray(g.doors) && g.doors.length > 0);
    let doorSetup = null;
    if (closedDoor) {
        const d = closedDoor.doors[0];
        const dtx = Number(d.tileX);
        const dty = Number(d.tileY);
        const candidates = [
            { tx: dtx - 1, ty: dty },
            { tx: dtx + 1, ty: dty },
            { tx: dtx, ty: dty - 1 },
            { tx: dtx, ty: dty + 1 },
        ].filter((p) => grid.isWalkable(p.tx, p.ty));
        if (candidates.length > 0) {
            const p = candidates[0];
            const wp = worldCenter(p.tx, p.ty);
            doorSetup = {
                leaderX: wp.x,
                leaderY: wp.y,
                doorX: d.x,
                doorY: d.y,
                doorState: closedDoor.state,
            };
        }
    }

    scene.cameras?.main?.centerOn?.(leader.x, leader.y);

    return {
        ok: true,
        enemyHealthStart: enemy.health,
        enemyId,
        probeId,
        wallTest,
        leader: { x: leader.x, y: leader.y },
        enemy: { x: enemy.x, y: enemy.y },
        angleToEnemy,
        doorSetup,
    };
});

if (!prep?.ok) {
    fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify({ ok: false, prep, errors }, null, 2)}\n`);
    await browser.close();
    process.exit(0);
}

await page.screenshot({ path: path.join(outDir, 'wall-setup.png') });

for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        const scene = game?.scene?.keys?.GameScene;
        if (!scene) return false;
        const leader = scene.leader;
        const enemies = (scene.enemyManager?.enemies || []).filter((e) => e && e.active);
        const enemy = enemies[0];
        if (!leader || !enemy) return false;
        const t = Number(scene.time?.now) || performance.now();
        const angle = Math.atan2(enemy.y - leader.y, enemy.x - leader.x);
        leader.facingAngle = angle;
        leader.rotation = angle;
        const fired = scene.weaponManager.fire(leader.x, leader.y, angle, t, {
            ownerRoleKey: 'leader',
            fireRateMul: 1,
            jamChance: 0,
            angleJitter: 0,
            stability: 1.3,
        });
        if (fired) {
            scene.emitWeaponFlashAndStimulus(leader.x, leader.y, angle, t, scene.weaponManager.currentWeaponKey, { marine: leader });
        }
        return fired;
    });
    await sleep(140);
}

await sleep(700);
await page.screenshot({ path: path.join(outDir, 'wall-fire.png') });

const wallResult = await page.evaluate((prepInfo) => {
    const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
    const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
    const allEnemies = Array.isArray(scene?.enemyManager?.enemies) ? scene.enemyManager.enemies : [];
    let enemy = allEnemies.find((e) => e && String(e._occlusionProbeId || '') === String(prepInfo?.probeId || ''));
    if (!enemy) enemy = allEnemies.find((e) => e && String(e.name || e.texture?.key || '') === String(prepInfo?.enemyId || ''));
    return {
        enemyFound: !!enemy,
        enemyActive: !!enemy?.active,
        enemyHealthEnd: Number(enemy?.health),
        enemyMaxHealth: Number(enemy?.maxHealth),
    };
}, prep);

let doorResult = null;
if (prep.doorSetup) {
    await page.evaluate((ds) => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
        if (!scene || !scene.leader) return;
        const leader = scene.leader;
        leader.x = ds.leaderX;
        leader.y = ds.leaderY;
        if (leader.body) leader.body.reset(ds.leaderX, ds.leaderY);
        const angle = Math.atan2(ds.doorY - leader.y, ds.doorX - leader.x);
        leader.facingAngle = angle;
        leader.rotation = angle;
        scene.cameras?.main?.centerOn?.(leader.x, leader.y);
    }, prep.doorSetup);

    await sleep(350);

    for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
            const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
            const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
            if (!scene?.leader) return false;
            const leader = scene.leader;
            const closedDoor = (scene.doorManager?.doorGroups || []).find((g) => g && g.state === 'closed' && Array.isArray(g.doors) && g.doors.length > 0);
            if (!closedDoor) return false;
            const center = closedDoor.getCenter();
            const angle = Math.atan2(center.y - leader.y, center.x - leader.x);
            leader.facingAngle = angle;
            leader.rotation = angle;
            const t = Number(scene.time?.now) || performance.now();
            const fired = scene.weaponManager.fire(leader.x, leader.y, angle, t, {
                ownerRoleKey: 'leader',
                fireRateMul: 1,
                jamChance: 0,
                angleJitter: 0,
                stability: 1.3,
            });
            if (fired) {
                scene.emitWeaponFlashAndStimulus(leader.x, leader.y, angle, t, scene.weaponManager.currentWeaponKey, { marine: leader });
            }
            return fired;
        });
        await sleep(130);
    }

    await sleep(420);
    await page.screenshot({ path: path.join(outDir, 'door-flash.png') });

    doorResult = await page.evaluate(() => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
        if (!scene?.leader || !scene?.lightingOverlay || !scene?.lightBlockerGrid) return { ok: false };
        const leader = scene.leader;
        const closedDoor = (scene.doorManager?.doorGroups || []).find((g) => g && g.state === 'closed' && Array.isArray(g.doors) && g.doors.length > 0);
        if (!closedDoor) return { ok: false, reason: 'no_closed_door' };
        const center = closedDoor.getCenter();
        const angle = Math.atan2(center.y - leader.y, center.x - leader.x);
        const src = {
            x: leader.x,
            y: leader.y,
            angle,
            range: Number(scene.runtimeSettings?.lighting?.torchRange) || 720,
            halfAngle: Number(scene.runtimeSettings?.lighting?.torchConeHalfAngle) || 0.42,
        };
        const segs = scene.lightBlockerGrid.getSegmentsNear(leader.x, leader.y, src.range);
        const hit = scene.lightingOverlay.findFirstBlockingHit(src, segs);
        return {
            ok: true,
            doorState: closedDoor.state,
            hitDist: Number(hit?.dist) || null,
            range: src.range,
        };
    });
}

const result = {
    ok: true,
    prep,
    wallResult,
    wallNoDamage: Number.isFinite(Number(wallResult?.enemyHealthEnd))
        ? Number(wallResult.enemyHealthEnd) >= Number(prep.enemyHealthStart)
        : false,
    doorResult,
    errors,
};

fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
if (errors.length > 0) fs.writeFileSync(path.join(outDir, 'errors.json'), `${JSON.stringify(errors, null, 2)}\n`);

await browser.close();
console.log(JSON.stringify({ outDir, resultSummary: result }, null, 2));
