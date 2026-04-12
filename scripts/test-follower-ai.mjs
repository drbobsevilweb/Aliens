#!/usr/bin/env node
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FollowerCombatSystem } from '../src/systems/FollowerCombatSystem.js';

function installPhaserMock() {
    const prevPhaser = globalThis.Phaser;
    globalThis.Phaser = {
        Math: {
            Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
            Between: (min, max) => min,
            FloatBetween: (min, max) => min,
            Linear: (a, b, t) => a + ((b - a) * t),
            Angle: {
                Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
                Wrap: (angle) => {
                    let out = angle;
                    while (out <= -Math.PI) out += Math.PI * 2;
                    while (out > Math.PI) out -= Math.PI * 2;
                    return out;
                },
            },
            Distance: {
                Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
            },
        },
    };
    return () => {
        if (typeof prevPhaser === 'undefined') delete globalThis.Phaser;
        else globalThis.Phaser = prevPhaser;
    };
}

function makeFollower(roleKey, x = 0, y = 0) {
    return {
        roleKey,
        x,
        y,
        active: true,
        alive: true,
        health: 100,
        maxHealth: 100,
        morale: 0,
        rotation: 0,
        facingAngle: 0,
        setDesiredRotation(angle) {
            this.desiredRotation = angle;
            this.facingAngle = angle;
            this.rotation = angle;
        },
        updateRotation() {},
    };
}

function makeBaseScene() {
    const heavyProfile = {
        reactionMs: 0,
        damageMul: 1.25,
        fireRateMul: 0.86,
        heatPerShot: 10,
        coolRate: 26,
        jamSensitivity: 0.7,
        burstMin: 1,
        burstMax: 1,
        burstPauseMinMs: 0,
        burstPauseMaxMs: 0,
        suppressChance: 0,
    };
    const defaultProfile = {
        reactionMs: 0,
        damageMul: 1,
        fireRateMul: 1,
        heatPerShot: 9,
        coolRate: 25,
        jamSensitivity: 0.95,
        burstMin: 1,
        burstMax: 1,
        burstPauseMinMs: 0,
        burstPauseMaxMs: 0,
        suppressChance: 0,
    };
    return {
        leader: { x: 0, y: 0 },
        totalKills: 0,
        runtimeSettings: {
            marines: {},
            lighting: { torchRange: CONFIG.TORCH_RANGE, torchConeHalfAngle: Math.PI },
        },
        combatMods: {
            marineAccuracyMul: 1,
            marineJamMul: 1,
            marineReactionMul: 1,
            pressure: 0.3,
        },
        marineAmmo: new Map(),
        parseCommanderLaneDirective: () => ({ mode: 'none' }),
        getCommanderTacticalProfile() {
            return {
                mode: 'none',
                laneReactionMul: 1,
                offLaneReactionMul: 1,
                laneHitMul: 1,
                offLaneHitMul: 1,
                suppressWindowMul: 1,
            };
        },
        getFollowerCombatProfile(roleKey) {
            return roleKey === 'heavy' ? heavyProfile : defaultProfile;
        },
        getRoleAssignedLane() {
            return null;
        },
        getDirectionBucket() {
            return 'N';
        },
        computeMarineHitChance() {
            return 1;
        },
        getMissAngleOffset() {
            return 0;
        },
        noteGunfireEvent() {},
        emitWeaponFlashAndStimulus() {},
        isMarineTrackerBusy() {
            return false;
        },
        isMarineHealBusy() {
            return false;
        },
        doorActionSystem: { isActorBusy: () => false },
        bulletPool: {
            shots: [],
            fire(x, y, angle, time, def) {
                this.shots.push({ x, y, angle, time, def });
                return true;
            },
        },
        weaponManager: {
            pulseMaxAmmo: 99,
            pulseUnlockAt: 24,
            getRuntimeWeaponDef() {
                return { key: 'pulseRifle', fireRate: 110, damage: 13 };
            },
            getAdjustedFireRate(def, options = {}) {
                const mul = Number(options.fireRateMul) || 1;
                return Math.max(20, Math.floor(def.fireRate * mul));
            },
        },
        hud: { refreshNow() {} },
        enemyManager: {
            getDetectedEnemies() {
                return [];
            },
            getAliveEnemies() {
                return [];
            },
            isClosedDoorBetweenWorldPoints() {
                return false;
            },
            hasLineOfSight() {
                return true;
            },
        },
    };
}

function testBusyFollowersClearReservations() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        const system = new FollowerCombatSystem(scene);
        const follower = makeFollower('heavy');
        const target = { active: true };
        const state = system.getFollowerCombatState('heavy');
        state.targetRef = target;
        state.burstShotsLeft = 3;
        scene.doorActionSystem.isActorBusy = () => true;
        scene.enemyManager.getDetectedEnemies = () => [target];
        scene.enemyManager.getAliveEnemies = () => [target];
        scene.marineAmmo.set('heavy', { currentMag: 5, displayedAmmo: 99, magsLeft: 3, magSize: 99, isReloading: false, isOverheated: false, pulseHeat: 0 });

        system.update(1000, 16, [follower]);

        assert.equal(state.targetRef, null);
        assert.equal(state.burstShotsLeft, 0);
    } finally {
        restore();
    }
}

function testEvadeUsesRealDistanceNotScoredThreat() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        const system = new FollowerCombatSystem(scene);
        const follower = makeFollower('tech', 0, 0);
        const farFacehugger = { active: true, isDying: false, enemyType: 'facehugger', x: CONFIG.TILE_SIZE * 4, y: 0 };
        scene.enemyManager.getDetectedEnemies = () => [farFacehugger];
        scene.enemyManager.getAliveEnemies = () => [farFacehugger];
        scene.marineAmmo.set('tech', {
            currentMag: 5,
            displayedAmmo: 99,
            magsLeft: 3,
            magSize: 99,
            isReloading: false,
            isOverheated: true,
            pulseHeat: 0,
        });

        system.update(1000, 16, [follower]);

        assert.ok(!Number.isFinite(follower._evadeHintUntil) || follower._evadeHintUntil <= 1000);
    } finally {
        restore();
    }
}

function testRoleProfilesAffectCadenceAndHeat() {
    const restore = installPhaserMock();
    const prevRandom = Math.random;
    Math.random = () => 0.99;
    try {
        const scene = makeBaseScene();
        const system = new FollowerCombatSystem(scene);
        const target = { active: true, isDying: false, enemyType: 'drone', x: CONFIG.TILE_SIZE, y: 0 };
        const heavy = makeFollower('heavy', 0, 0);
        const medic = makeFollower('medic', 0, CONFIG.TILE_SIZE);
        const heavyState = system.getFollowerCombatState('heavy');
        const medicState = system.getFollowerCombatState('medic');
        heavyState.targetRef = target;
        medicState.targetRef = target;
        scene.enemyManager.getDetectedEnemies = () => [target];
        scene.enemyManager.getAliveEnemies = () => [target];
        scene.marineAmmo.set('heavy', { currentMag: 5, displayedAmmo: 99, magsLeft: 3, magSize: 99, isReloading: false, isOverheated: false, pulseHeat: 0 });
        scene.marineAmmo.set('medic', { currentMag: 5, displayedAmmo: 99, magsLeft: 3, magSize: 99, isReloading: false, isOverheated: false, pulseHeat: 0 });

        system.update(1000, 16, [heavy, medic]);

        assert.equal(scene.marineAmmo.get('heavy').pulseHeat, 10);
        assert.equal(scene.marineAmmo.get('medic').pulseHeat, 9);
        assert.equal(heavyState.nextFireAt, 1094);
        assert.equal(medicState.nextFireAt, 1110);
        assert.equal(scene.bulletPool.shots.length, 2);
    } finally {
        Math.random = prevRandom;
        restore();
    }
}

function testCloseUndetectedThreatsTriggerReactiveScan() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        const system = new FollowerCombatSystem(scene);
        const follower = makeFollower('heavy', 0, 0);
        const closeThreat = {
            active: true,
            isDying: false,
            enemyType: 'warrior',
            x: -CONFIG.TILE_SIZE * 3,
            y: 0,
        };
        scene.enemyManager.getDetectedEnemies = () => [];
        scene.enemyManager.getAliveEnemies = () => [closeThreat];
        scene.marineAmmo.set('heavy', {
            currentMag: 5,
            displayedAmmo: 99,
            magsLeft: 3,
            magSize: 99,
            isReloading: false,
            isOverheated: false,
            pulseHeat: 0,
        });

        system.update(1000, 16, [follower]);

        const state = system.getFollowerCombatState('heavy');
        assert.equal(state.targetRef, closeThreat);
        assert.equal(scene.bulletPool.shots.length, 1);
    } finally {
        restore();
    }
}

function testFollowerOverheatUnlocksAtLeaderEquivalentHeat() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        const system = new FollowerCombatSystem(scene);
        const heavy = makeFollower('heavy', 0, 0);
        scene.marineAmmo.set('heavy', {
            currentMag: 12,
            displayedAmmo: 12,
            magsLeft: 3,
            magSize: 99,
            isReloading: false,
            isOverheated: true,
            pulseHeat: 80,
            overheatCooldownUntil: 0,
        });

        system.update(1000, 200, [heavy]);

        assert.equal(scene.marineAmmo.get('heavy').isOverheated, false);
        assert.ok(scene.marineAmmo.get('heavy').pulseHeat < 80);
    } finally {
        restore();
    }
}

function testSupportSuppressWindowUsesRuntimeSetting() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        scene.runtimeSettings.marines.supportSuppressWindowMs = 900;
        const system = new FollowerCombatSystem(scene);
        const follower = makeFollower('heavy', 0, 0);
        const target = { active: true, isDying: false, enemyType: 'warrior', x: CONFIG.TILE_SIZE, y: 0 };
        const state = system.getFollowerCombatState('heavy');
        state.targetRef = target;
        state.nextThinkAt = 2000;
        scene.enemyManager.getDetectedEnemies = () => [];
        scene.enemyManager.getAliveEnemies = () => [target];
        scene.enemyManager.hasLineOfSight = () => false;
        scene.marineAmmo.set('heavy', {
            currentMag: 5,
            displayedAmmo: 99,
            magsLeft: 3,
            magSize: 99,
            isReloading: false,
            isOverheated: false,
            pulseHeat: 0,
        });

        system.update(1000, 16, [follower]);

        assert.equal(state.suppressionUntil, 1900);
        assert.equal(state.targetRef, null);
    } finally {
        restore();
    }
}

function testDirectiveLaneComplianceSpeedsReaction() {
    const restore = installPhaserMock();
    try {
        const scene = makeBaseScene();
        scene.currentCommanderDirective = 'HOLD FORMATION E';
        scene.parseCommanderLaneDirective = () => ({ mode: 'hold', primary: 'E', secondary: null });
        scene.getRoleAssignedLane = (roleKey, directive) => roleKey === 'heavy' ? directive.primary : null;
        scene.getCommanderTacticalProfile = () => ({
            mode: 'hold',
            laneReactionMul: 0.8,
            offLaneReactionMul: 1.1,
            laneHitMul: 1.06,
            offLaneHitMul: 0.96,
            suppressWindowMul: 1.18,
        });
        scene.getDirectionBucket = () => 'E';
        scene.getFollowerCombatProfile = () => ({
            reactionMs: 100,
            damageMul: 1,
            fireRateMul: 1,
            heatPerShot: 9,
            coolRate: 25,
            jamSensitivity: 0.95,
            burstMin: 1,
            burstMax: 1,
            burstPauseMinMs: 0,
            burstPauseMaxMs: 0,
            suppressChance: 0,
        });

        const system = new FollowerCombatSystem(scene);
        const follower = makeFollower('heavy', 0, 0);
        const target = { active: true, isDying: false, enemyType: 'drone', x: CONFIG.TILE_SIZE, y: 0 };
        scene.enemyManager.getDetectedEnemies = () => [target];
        scene.enemyManager.getAliveEnemies = () => [target];
        scene.marineAmmo.set('heavy', {
            currentMag: 5,
            displayedAmmo: 99,
            magsLeft: 3,
            magSize: 99,
            isReloading: false,
            isOverheated: false,
            pulseHeat: 0,
        });

        system.update(1000, 16, [follower]);

        const state = system.getFollowerCombatState('heavy');
        assert.equal(state.readyAt, 1080);
        assert.equal(scene.bulletPool.shots.length, 0);
    } finally {
        restore();
    }
}

function main() {
    testBusyFollowersClearReservations();
    testEvadeUsesRealDistanceNotScoredThreat();
    testRoleProfilesAffectCadenceAndHeat();
    testCloseUndetectedThreatsTriggerReactiveScan();
    testFollowerOverheatUnlocksAtLeaderEquivalentHeat();
    testSupportSuppressWindowUsesRuntimeSetting();
    testDirectiveLaneComplianceSpeedsReaction();
    console.log('followerAI.spec: ok');
}

main();
