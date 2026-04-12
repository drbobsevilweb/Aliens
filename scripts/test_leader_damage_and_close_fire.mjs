#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE_URL = process.env.ALIENS_BASE_URL || 'http://127.0.0.1:8192';
const TEST_URL = `${BASE_URL}/game?mission=m1&renderer=canvas&noaliens`;

async function waitForScene(page) {
    await page.waitForFunction(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        return !!(scene && scene.enemyManager && scene.weaponManager && scene.leader);
    }, { timeout: 20000 });
}

function recordConsole(page, consoleErrors, pageErrors) {
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
}

async function prepareScene(page) {
    await page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return;
        if (scene.initOverlayContainer) {
            if (typeof scene.clearInitializationOverlay === 'function') scene.clearInitializationOverlay();
            else {
                scene.initOverlayContainer.destroy?.();
                scene.initOverlayContainer = null;
            }
        }
        if (scene.controlsOverlay?.visible) scene.controlsOverlay.setVisible(false);
        if (!scene.isPaused && scene.physics?.world?.isPaused) scene.physics.world.resume();
    });
}

async function evaluateLeaderDamage(page) {
    return page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };

        const leader = scene.leader;
        leader.alive = true;
        leader.health = leader.maxHealth;
        leader.morale = 0;
        if (leader.body) leader.body.enable = true;
        if (leader.shadowSprite) leader.shadowSprite.setVisible(true);

        const healthBefore = Number(leader.health) || 0;
        const moraleBefore = Number(leader.morale) || 0;
        scene.enemyManager.targeting.applyMarineDamage(leader, 12, null);

        const healthAfterHit = Number(leader.health) || 0;
        const moraleAfterHit = Number(leader.morale) || 0;

        leader.takeDamage((Number(leader.maxHealth) || 0) + 5);

        return {
            healthBefore,
            healthAfterHit,
            moraleBefore,
            moraleAfterHit,
            healthAfterDeath: Number(leader.health) || 0,
            aliveAfterDeath: leader.alive === true,
            bodyEnabledAfterDeath: leader.body ? leader.body.enable === true : null,
        };
    });
}

async function evaluateLeaderFireOrigin(page) {
    return page.evaluate(() => {
        const scene = window.__ALIENS_DEBUG_SCENE__;
        if (!scene) return { err: 'no scene' };

        const leader = scene.leader;
        const weaponKey = 'pulseRifle';
        const fireAngle = 0;

        scene.weaponManager.currentWeapon = weaponKey;
        const ammoState = scene.marineAmmo?.get('leader');
        if (ammoState) {
            ammoState.isReloading = false;
            ammoState.reloadUntil = 0;
        }
        leader.desiredRotation = fireAngle;
        leader._logicalRot = fireAngle;
        leader.rotation = fireAngle + (Number(leader._spriteAngleOffset) || 0);

        const muzzle = scene.resolveMuzzleWorldPos(leader, fireAngle, weaponKey);
        const originalInputUpdate = scene.inputHandler.update;
        const originalIsFiring = scene.inputHandler.isFiring;
        const originalHitChance = scene.computeMarineHitChance;
        const originalFire = scene.weaponManager.fire.bind(scene.weaponManager);
        let captured = null;

        scene.inputHandler.update = () => {};
        scene.inputHandler.isFiring = true;
        scene.computeMarineHitChance = () => 1;
        scene.weaponManager.fire = (x, y, angle, time, options) => {
            captured = { x, y, angle, time, ownerRoleKey: options?.ownerRoleKey || null };
            return originalFire(x, y, angle, time, options);
        };

        const now = (Number(scene.time?.now) || 0) + 16;
        scene.update(now, 16);

        scene.weaponManager.fire = originalFire;
        scene.computeMarineHitChance = originalHitChance;
        scene.inputHandler.isFiring = originalIsFiring;
        scene.inputHandler.update = originalInputUpdate;

        return {
            leader: { x: leader.x, y: leader.y },
            muzzle,
            resolvedFromCaptured: captured
                ? scene.resolveMuzzleWorldPos(leader, captured.angle, weaponKey)
                : null,
            captured,
        };
    });
}

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const failures = [];

    try {
        {
            const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            recordConsole(page, consoleErrors, pageErrors);

            await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForScene(page);
            await prepareScene(page);
            const result = await evaluateLeaderDamage(page);
            console.log('[leader-damage]', JSON.stringify(result, null, 2));

            if (result.err) failures.push(`leader-damage: ${result.err}`);
            if (!(result.healthAfterHit < result.healthBefore)) failures.push(`leader-damage: expected health to drop, got ${result.healthBefore} -> ${result.healthAfterHit}`);
            if (!(result.moraleAfterHit < result.moraleBefore)) failures.push(`leader-damage: expected melee damage to trigger morale shock, got ${result.moraleBefore} -> ${result.moraleAfterHit}`);
            if (result.healthAfterDeath !== 0) failures.push(`leader-damage: expected lethal damage to clamp health at 0, got ${result.healthAfterDeath}`);
            if (result.aliveAfterDeath !== false) failures.push('leader-damage: expected leader.alive to be false after lethal damage');
            if (result.bodyEnabledAfterDeath !== false) failures.push('leader-damage: expected leader body to be disabled after lethal damage');
            if (consoleErrors.length) failures.push(`leader-damage console errors: ${consoleErrors.join(' | ')}`);
            if (pageErrors.length) failures.push(`leader-damage page errors: ${pageErrors.join(' | ')}`);

            await context.close();
        }

        {
            const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            recordConsole(page, consoleErrors, pageErrors);

            await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForScene(page);
            await prepareScene(page);
            const result = await evaluateLeaderFireOrigin(page);
            console.log('[leader-fire-origin]', JSON.stringify(result, null, 2));

            if (result.err) failures.push(`leader-fire-origin: ${result.err}`);
            if (!result.captured) {
                failures.push('leader-fire-origin: expected the leader fire path to call weaponManager.fire');
            } else {
                const resolved = result.resolvedFromCaptured || result.muzzle;
                const muzzleDelta = Math.hypot(result.captured.x - resolved.x, result.captured.y - resolved.y);
                const centerDelta = Math.hypot(result.captured.x - result.leader.x, result.captured.y - result.leader.y);
                if (muzzleDelta > 1.5) failures.push(`leader-fire-origin: expected muzzle-origin shot, got ${muzzleDelta.toFixed(2)}px from muzzle`);
                if (centerDelta < 6) failures.push(`leader-fire-origin: shot still starts too close to the leader center (${centerDelta.toFixed(2)}px)`);
                if (result.captured.ownerRoleKey !== 'leader') failures.push(`leader-fire-origin: expected ownerRoleKey=leader, got ${result.captured.ownerRoleKey}`);
            }
            if (consoleErrors.length) failures.push(`leader-fire-origin console errors: ${consoleErrors.join(' | ')}`);
            if (pageErrors.length) failures.push(`leader-fire-origin page errors: ${pageErrors.join(' | ')}`);

            await context.close();
        }
    } finally {
        await browser.close();
    }

    if (failures.length) {
        console.error('\nFAILURES');
        for (const failure of failures) console.error(`- ${failure}`);
        process.exit(1);
    }

    console.log('\nPASS: leader damage feedback/state and leader muzzle-origin firing checks');
})();