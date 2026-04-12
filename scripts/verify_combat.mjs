#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Deterministic Combat Regression Harness
 * Asserts:
 * 1. Door integrity decreases on bullet hit.
 * 2. Doors become 'destroyed' (breached) when integrity reaches zero.
 * 3. Aliens can damage/breach doors.
 * 4. Occlusion: Targets behind walls do not take damage.
 * 5. Mission wave count matches layout.
 * 6. Alien spawns originate from valid distances (not on top of marines).
 */

const outDir = process.argv[2] || 'output/verify-combat';
const url = process.argv[3] || 'http://127.0.0.1:8192/game/?renderer=canvas&mission=m1';

fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    console.log(`[verify-combat] Starting harness on ${url}...`);
    const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
    page.on('console', (m) => {
        const text = m.text();
        if (m.type() === 'error') errors.push(`console:${text}`);
        else console.log(`[browser] ${text}`);
    });
    
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for GameScene to be ready
        await page.waitForFunction(() => {
            const game = (window.Phaser && Array.isArray(window.Phaser.GAMES)) ? window.Phaser.GAMES[0] : null;
            const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
            return !!scene && !!scene.doorManager && !!scene.enemyManager && !!scene.leader;
        }, null, { timeout: 20000 });

        console.log('[verify-combat] Scene ready. Running probes...');

        const results = await page.evaluate(async () => {
            const game = (window.Phaser && Array.isArray(window.Phaser.GAMES)) ? window.Phaser.GAMES[0] : null;
            const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__;
            if (!scene) throw new Error('GameScene not found');
            
            const setPos = (obj, tx, ty) => {
                const ts = 64;
                const x = tx * ts + ts / 2;
                const y = ty * ts + ts / 2;
                obj.x = x;
                obj.y = y;
                if (obj.body) obj.body.reset(x, y);
            };

            const report = {
                doorBulletDamage: false,
                doorBreach: false,
                alienDoorDamage: false,
                occlusionCheck: false,
                waveCountMatch: false,
                spawnValidity: false,
                details: {}
            };

            const withProbeSpawnsEnabled = (fn) => {
                const prevBlockAll = scene.blockAllEnemySpawns;
                const prevAmbient = scene.suppressAmbientEnemySpawns;
                scene.blockAllEnemySpawns = false;
                scene.suppressAmbientEnemySpawns = false;
                try {
                    return fn();
                } finally {
                    scene.blockAllEnemySpawns = prevBlockAll;
                    scene.suppressAmbientEnemySpawns = prevAmbient;
                }
            };

            const ensureProbeEnemy = () => {
                let activeEnemy = scene.enemyManager.enemies.find((e) => e.active);
                if (activeEnemy) return activeEnemy;
                const probeWorld = scene.findNearestWalkableWorld(scene.leader.x + (6 * 64), scene.leader.y, 8)
                    || scene.findNearestWalkableWorld(scene.leader.x, scene.leader.y + (6 * 64), 8);
                if (!probeWorld) return null;
                activeEnemy = withProbeSpawnsEnabled(() => scene.enemyManager.spawnEnemyAtWorld('warrior', probeWorld.x, probeWorld.y, 1));
                return activeEnemy || null;
            };

            // --- 1. Door Bullet Damage ---
            const doorGroup = scene.doorManager.doorGroups.find(g => g.state === 'closed' && g.doors.length > 0);
            if (doorGroup) {
                const door = doorGroup.doors[0];
                const startIntegrity = doorGroup.integrity;
                
                // Position leader to face door
                setPos(scene.leader, door.tileX - 1, door.tileY);
                const angle = 0; // East
                const muzzle = scene.resolveMuzzleWorldPos(scene.leader, angle, 'pulseRifle');
                
                // Fire pulse rifle
                scene.weaponManager.currentWeaponKey = 'pulseRifle';
                scene.weaponManager.fire(muzzle.x, muzzle.y, angle, scene.time.now, {
                    ownerRoleKey: 'leader', fireRateMul: 1, jamChance: 0, angleJitter: 0, stability: 2
                });

                // Wait a few frames for physics
                await new Promise(r => setTimeout(r, 500));
                
                report.details.doorStartIntegrity = startIntegrity;
                report.details.doorEndIntegrity = doorGroup.integrity;
                report.doorBulletDamage = doorGroup.integrity < startIntegrity;

                // --- 2. Door Breach (Fast Forward) ---
                doorGroup.integrity = 1; 
                doorGroup.applyBulletDamage(10, scene.pathGrid, scene.doorManager.physicsGroup, scene.lightBlockerGrid, scene.wallLayer);
                report.doorBreach = (doorGroup.state === 'destroyed');
                report.details.doorFinalState = doorGroup.state;
            }

            // --- 3. Alien Door Damage ---
            const door2 = scene.doorManager.doorGroups.find(g => g.state === 'closed' && g.doors.length > 0);
            const enemy = ensureProbeEnemy();
            if (door2 && enemy) {
                door2.integrity = 100;
                setPos(enemy, door2.doors[0].tileX, door2.doors[0].tileY); // Put alien ON door
                const startIntegrity = door2.integrity;
                
                // Manually trigger enemy damage logic
                enemy.intent = 'breach';
                const marines = scene.squadSystem ? scene.squadSystem.getAllMarines() : [scene.leader];
                scene.enemyManager.update(scene.time.now, 16, marines); // Force update
                
                // We use the direct method to be deterministic in test
                door2.applyEnemyDamage(10, scene.pathGrid, scene.doorManager.physicsGroup, scene.lightBlockerGrid, scene.wallLayer);
                
                report.alienDoorDamage = door2.integrity < startIntegrity;
                report.details.alienDamage = startIntegrity - door2.integrity;
            }

            // --- 4. Occlusion Check ---
            let wallX = -1, wallY = -1;
            for(let y=5; y<scene.pathGrid.height-5; y++) {
                for(let x=5; x<scene.pathGrid.width-5; x++) {
                    if(!scene.pathGrid.isWalkable(x, y)) {
                        wallX = x; wallY = y; break;
                    }
                }
                if(wallX !== -1) break;
            }

            if(wallX !== -1 && enemy) {
                setPos(scene.leader, wallX - 1, wallY);
                setPos(enemy, wallX + 1, wallY);
                enemy.health = 1000;
                const startHealth = enemy.health;
                
                const angle = 0; // East, through wall
                const muzzle = scene.resolveMuzzleWorldPos(scene.leader, angle, 'pulseRifle');
                
                // Fire multiple shots
                for(let i=0; i<5; i++) {
                    scene.weaponManager.fire(muzzle.x, muzzle.y, angle, scene.time.now + i*100, {
                        ownerRoleKey: 'leader', fireRateMul: 1, jamChance: 0, angleJitter: 0, stability: 10
                    });
                }
                
                await new Promise(r => setTimeout(r, 200));
                report.occlusionCheck = (enemy.health === startHealth);
                report.details.occlusionStartHealth = startHealth;
                report.details.occlusionEndHealth = enemy.health;
            }

            // --- 5. Enemy Count vs Budget Match ---
            const expectedTotal = Array.isArray(scene.missionLayout?.spawnPoints)
                ? scene.missionLayout.spawnPoints
                    .filter((point) => (Number(point?.spawnTimeSec) || 0) <= 0)
                    .reduce((sum, point) => sum + Math.max(1, Math.round(Number(point?.count) || 1)), 0)
                : 0;
            let actualTotal = 0;
            if (Array.isArray(scene.activeMissionWaves)) {
                for (const wave of scene.activeMissionWaves) {
                    if (Array.isArray(wave)) actualTotal += wave.length;
                }
            }
            report.waveCountMatch = (actualTotal === expectedTotal);
            report.details.expectedTotal = expectedTotal;
            report.details.actualTotal = actualTotal;

            // --- 6. Spawn Validity ---
            // Check if ANY enemy in the mission waves is too close to the marine spawn
            const spawnTile = scene.missionLayout?.spawnTile;
            if (spawnTile) {
                const sx = spawnTile.x;
                const sy = spawnTile.y;
                let invalidSpawnFound = false;
                let minFoundDist = 999;
                let closestEnemyCoord = null;
                
                if (Array.isArray(scene.activeMissionWaves)) {
                    for (const wave of scene.activeMissionWaves) {
                        for (const s of wave) {
                            const dx = s.tileX - sx;
                            const dy = s.tileY - sy;
                            const dist = Math.hypot(dx, dy);
                            if (dist < minFoundDist) {
                                minFoundDist = dist;
                                closestEnemyCoord = { x: s.tileX, y: s.tileY };
                            }
                            if (dist < 8) { // 8 tiles minimum distance
                                invalidSpawnFound = true;
                            }
                        }
                    }
                }
                report.spawnValidity = !invalidSpawnFound;
                report.details.spawnTile = { x: sx, y: sy };
                report.details.minSpawnDist = minFoundDist;
                report.details.closestEnemyCoord = closestEnemyCoord;
            }

            // --- 7. Walkable Spawns ---
            let invalidTerrainFound = false;
            let firstInvalidCoord = null;
            if (Array.isArray(scene.activeMissionWaves)) {
                for (const wave of scene.activeMissionWaves) {
                    for (const s of wave) {
                        if (!scene.pathGrid || !scene.pathGrid.isWalkable(s.tileX, s.tileY)) {
                            invalidTerrainFound = true;
                            firstInvalidCoord = { x: s.tileX, y: s.tileY };
                            break;
                        }
                    }
                    if (invalidTerrainFound) break;
                }
            }
            report.walkableSpawns = !invalidTerrainFound;
            if (firstInvalidCoord) {
                report.details.firstInvalidSpawn = firstInvalidCoord;
            }

            return report;
        });

        console.log('[verify-combat] Results:', JSON.stringify(results, null, 2));
        
        const summary = {
            ok: results.doorBulletDamage && 
                results.doorBreach && 
                results.alienDoorDamage && 
                results.occlusionCheck &&
                results.waveCountMatch &&
                results.spawnValidity &&
                results.walkableSpawns,
            results,
            errors
        };

        fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(summary, null, 2));
        
        if (!summary.ok) {
            console.error('[verify-combat] FAILED assertions');
            process.exit(1);
        }
        console.log('[verify-combat] PASSED all assertions');

    } catch (e) {
        console.error('[verify-combat] Runtime Error:', e);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

run();
