#!/usr/bin/env node
import assert from 'node:assert/strict';

function installPhaserMock() {
    const prevPhaser = globalThis.Phaser;
    globalThis.Phaser = {
        Physics: {
            Arcade: {
                Sprite: class {},
            },
        },
        Math: {
            Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
            Linear: (a, b, t) => a + ((b - a) * t),
            Between: (min, max) => min,
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

async function testDetectionCacheRefreshesSameFrame() {
    const restore = installPhaserMock();
    try {
        const { EnemyManager } = await import('../src/systems/EnemyManager.js');
        const manager = Object.create(EnemyManager.prototype);
        manager.scene = {
            game: { loop: { frame: 7 } },
            cameras: { main: {} },
            marines: [],
        };
        manager.enemies = [{ active: true, detected: false }];
        manager._cachedActiveEnemies = [];
        manager._cachedDetectedEnemies = [];
        manager._cachedActiveFrame = -1;
        manager.detection = {
            updateDetection() {
                manager.enemies[0].detected = true;
            },
        };

        manager._rebuildActiveCache();
        assert.equal(manager.getDetectedEnemies().length, 0);

        manager.updateDetection([], 1000, { marines: [] });

        assert.equal(manager.getDetectedEnemies().length, 1);
    } finally {
        restore();
    }
}

async function testLightSourcesPreferLiveSquadMarines() {
    const restore = installPhaserMock();
    try {
        const { EnemyManager } = await import('../src/systems/EnemyManager.js');
        const liveMarine = { x: 12, y: 34, facingAngle: 0.25, active: true, alive: true };
        const staleMarine = { x: 999, y: 999, facingAngle: 1.5, active: true, alive: true };
        const manager = Object.create(EnemyManager.prototype);
        manager.scene = {
            leader: { x: 0, y: 0, facingAngle: 0 },
            marines: [staleMarine],
            squadSystem: {
                getAllMarines() {
                    return [liveMarine];
                },
            },
            runtimeSettings: {
                lighting: {
                    torchConeHalfAngle: 0.75,
                    torchRange: 420,
                },
            },
        };

        const sources = manager.getLightSources();

        assert.equal(sources.length, 1);
        assert.equal(sources[0].x, 12);
        assert.equal(sources[0].y, 34);
    } finally {
        restore();
    }
}

async function testSpawnBeamVisibilityUsesLiveMarineTorch() {
    const restore = installPhaserMock();
    try {
        const [{ EnemyManager }, { EnemySpawner }] = await Promise.all([
            import('../src/systems/EnemyManager.js'),
            import('../src/systems/EnemySpawner.js'),
        ]);
        const liveMarine = { x: 100, y: 100, facingAngle: 0, active: true, alive: true };
        const manager = Object.create(EnemyManager.prototype);
        manager.scene = {
            leader: { x: 0, y: 0, facingAngle: 0 },
            marines: [{ x: 999, y: 999, facingAngle: 0, active: true, alive: true }],
            squadSystem: {
                getAllMarines() {
                    return [liveMarine];
                },
            },
            runtimeSettings: {
                lighting: {
                    torchConeHalfAngle: Math.PI,
                    torchRange: 420,
                },
            },
        };
        manager.isInLightCone = () => true;
        manager.isClosedDoorBetweenWorldPoints = () => false;
        manager.hasLineOfSight = () => true;
        const spawner = Object.create(EnemySpawner.prototype);
        spawner.manager = manager;
        spawner.scene = manager.scene;

        assert.equal(spawner.isSpawnBeamVisible(140, 100, []), true);
    } finally {
        restore();
    }
}

async function testWoundedTargetBiasPrefersWeakerMarine() {
    const restore = installPhaserMock();
    try {
        const { EnemyTargeting } = await import('../src/systems/EnemyTargeting.js');
        const manager = {
            scene: { time: { now: 0 } },
            isClosedDoorBetweenWorldPoints() {
                return false;
            },
            committedTargetCounts: new Map(),
        };
        const targeting = new EnemyTargeting(manager);
        manager.targeting = targeting;
        const enemy = { x: 0, y: 0, stats: { aggroRange: 400 }, retargetAt: 0, targetRef: null, patternSeed: 0.4 };
        const healthy = { x: 100, y: 0, health: 100, maxHealth: 100, active: true, alive: true, roleKey: 'leader' };
        const wounded = { x: 100, y: 0, health: 25, maxHealth: 100, active: true, alive: true, roleKey: 'leader' };

        const picked = targeting.pickTargetMarine(enemy, [healthy, wounded], new Map(), 0, 0.3, new Map());

        assert.equal(picked, wounded);
        assert.equal(enemy.targetRef, wounded);
    } finally {
        restore();
    }
}

async function main() {
    await testDetectionCacheRefreshesSameFrame();
    await testLightSourcesPreferLiveSquadMarines();
    await testSpawnBeamVisibilityUsesLiveMarineTorch();
    await testWoundedTargetBiasPrefersWeakerMarine();
    console.log('enemyAI.spec: ok');
}

await main();
