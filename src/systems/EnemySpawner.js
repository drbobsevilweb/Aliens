import { CONFIG } from '../config.js';
import {
    ENEMIES,
    ENEMY_VENT_POINTS,
    EGG_CLUSTERS,
    EGG_TRIGGER_RANGE,
    EGG_OPEN_DURATION_MS,
    tileToWorld
} from '../data/enemyData.js';
import { AlienEnemy } from '../entities/AlienEnemy.js';
import { AlienEgg } from '../entities/AlienEgg.js';

function normalizeAuthoredSpawnEnemyType(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const key = raw.toLowerCase();
    if (key === 'auto' || key === 'random' || key === 'mixed') return null;
    if (key === 'warrior') return 'warrior';
    if (key === 'drone') return 'drone';
    if (key === 'facehugger') return 'facehugger';
    if (key === 'queenlesser' || key === 'queen_lesser' || key === 'lesserqueen' || key === 'lesser_queen') return 'queenLesser';
    if (key === 'queen') return 'queen';
    return null;
}

export class EnemySpawner {
    constructor(manager) {
        this.manager = manager;
        this.scene = manager.scene;
    }

    createEggClusters() {
        // Prefer editor-authored egg markers from tilemap, fallback to hardcoded
        const layoutEggs = this.scene.missionLayout?.eggClusters;
        const clusters = (Array.isArray(layoutEggs) && layoutEggs.length > 0)
            ? layoutEggs
            : EGG_CLUSTERS;

        const placedTileKeys = new Set();
        const placeEggAtTile = (tileX, tileY) => {
            const key = `${tileX},${tileY}`;
            if (placedTileKeys.has(key)) return false;
            const p = tileToWorld(tileX, tileY);
            const spawn = this.resolveEggSpawnWorld(p.x, p.y, 6);
            if (!spawn) return false;
            const egg = new AlienEgg(this.scene, spawn.x, spawn.y);
            this.manager.eggs.push(egg);
            this.manager.eggGroup.add(egg);
            placedTileKeys.add(key);
            return true;
        };

        for (const cluster of clusters) {
            for (const eggTile of cluster) {
                placeEggAtTile(eggTile.tileX, eggTile.tileY);
            }
            // Room grouping boost: each authored cluster receives nearby bonus eggs.
            if (!cluster || cluster.length <= 0) continue;
            const cx = Math.round(cluster.reduce((sum, t) => sum + (Number(t.tileX) || 0), 0) / cluster.length);
            const cy = Math.round(cluster.reduce((sum, t) => sum + (Number(t.tileY) || 0), 0) / cluster.length);
            const extras = Phaser.Math.Between(1, 3);
            let attempts = 0;
            let created = 0;
            while (created < extras && attempts < 16) {
                attempts++;
                const ox = Phaser.Math.Between(-2, 2);
                const oy = Phaser.Math.Between(-2, 2);
                if (Math.abs(ox) + Math.abs(oy) < 2) continue;
                if (placeEggAtTile(cx + ox, cy + oy)) created++;
            }
        }
    }

    spawnWave(spawns, waveNumber = 1) {
        if (!spawns || spawns.length === 0) return 0;
        const difficulty = Math.max(1, 1 + (waveNumber - 1) * 0.22);

        let spawned = 0;
        for (const spawn of spawns) {
            if (this.scene && this.scene.forceWarriorOnly && spawn.type !== 'warrior') continue;
            const p = tileToWorld(spawn.tileX, spawn.tileY);
            if (this.spawnEnemyAtWorld(spawn.type, p.x, p.y, difficulty)) spawned++;
        }

        return spawned;
    }

    /**
     * Spawn aliens from editor-authored spawn points.
     * Each spawnPoint has {tileX, tileY, count: 2|4|6|8} and we spawn that many at that location.
     * Mix of types based on waveNumber and mission difficulty.
     * @param {Array} spawnPoints - Array of {tileX, tileY, count}
     * @param {number} waveNumber - Wave number for difficulty scaling
     * @param {number} missionDifficulty - Mission difficulty multiplier (1 = normal, 1.5 = hard)
     * @returns {number} Count of aliens spawned
     */
    spawnFromAuthoredPoints(spawnPoints, waveNumber = 1, missionDifficulty = 1) {
        if (!Array.isArray(spawnPoints) || spawnPoints.length === 0) return 0;
        const difficulty = Math.max(1, 1 + (waveNumber - 1) * 0.22) * missionDifficulty;

        let spawned = 0;
        for (const point of spawnPoints) {
            if (!point || !Number.isFinite(point.tileX) || !Number.isFinite(point.tileY)) continue;
            const count = Math.max(1, Math.round(Number(point.count) || 1));
            const explicitType = normalizeAuthoredSpawnEnemyType(point.enemyType ?? point.spawnType);

            for (let i = 0; i < count; i++) {
                const type = explicitType || this._selectTypeForAuthoredSpawn(waveNumber);
                const p = tileToWorld(point.tileX, point.tileY);
                if (this.spawnEnemyAtWorld(type, p.x, p.y, difficulty)) spawned++;
            }
        }

        return spawned;
    }

    /**
     * Select enemy type for authored spawn based on wave and mission progression.
     * Uses weighted composition logic similar to buildWaveTypePlan.
     * @private
     */
    _selectTypeForAuthoredSpawn(waveNumber) {
        const missionId = this.scene?.missionLayout?.mission?.id || 'm1';
        const warriorOnly = this.scene && this.scene.forceWarriorOnly;

        if (warriorOnly) return 'warrior';

        // Composition by mission — majority warriors, some drones, some facehuggers
        let composition = [];
        if (missionId === 'm1') {
            composition = [{ type: 'warrior', w: 0.75 }, { type: 'drone', w: 0.16 }, { type: 'facehugger', w: 0.09 }];
        } else if (missionId === 'm2') {
            composition = [{ type: 'warrior', w: 0.66 }, { type: 'drone', w: 0.22 }, { type: 'facehugger', w: 0.12 }];
        } else if (missionId === 'm3') {
            composition = [{ type: 'warrior', w: 0.56 }, { type: 'drone', w: 0.30 }, { type: 'facehugger', w: 0.14 }];
        } else if (missionId === 'm4') {
            composition = [{ type: 'warrior', w: 0.56 }, { type: 'drone', w: 0.26 }, { type: 'facehugger', w: 0.18 }];
        } else if (missionId === 'm5') {
            composition = [{ type: 'warrior', w: 0.64 }, { type: 'drone', w: 0.28 }, { type: 'facehugger', w: 0.08 }];
        } else {
            composition = [{ type: 'warrior', w: 0.7 }, { type: 'drone', w: 0.2 }, { type: 'facehugger', w: 0.1 }];
        }

        // Random selection using weights
        const rand = Math.random();
        let cumulative = 0;
        for (const comp of composition) {
            cumulative += comp.w;
            if (rand <= cumulative) return comp.type;
        }
        return 'warrior'; // Fallback
    }

    spawnEnemyAtWorld(type, worldX, worldY, difficulty = 1) {
        if (this.scene?.areAllEnemySpawnsSuppressed?.()) return null;
        if (this.scene && this.scene.forceWarriorOnly && type !== 'warrior') {
            type = 'warrior';
        }
        const def = ENEMIES[type];
        if (!def) return null;
        const spawn = this.resolveSpawnWorldWithRules(worldX, worldY, 8);
        if (!spawn) return null;
        const enemy = new AlienEnemy(this.scene, spawn.x, spawn.y, def);
        this.manager.enemies.push(enemy);
        this.manager.enemyGroup.add(enemy);
        this.manager.aliveCount++;
        
        const typeTuning = (this.manager.settings.types && this.manager.settings.types[type]) || {};
        const hpMul = Number(typeTuning.healthMultiplier) || 1;
        const speedMul = Number(typeTuning.speedMultiplier) || 1;
        const dmgMul = Number(typeTuning.damageMultiplier) || 1;
        const tensionDurabilityMulByType = {
            warrior: 1.18,
            drone: 1.14,
            facehugger: 1.1,
            queenLesser: 1.12,
            queen: 1.08,
        };
        const durabilityMul = tensionDurabilityMulByType[type] || 1.12;

        const globalHpBuff = 2.85;
        const globalSpeedBuff = 1.72;
        enemy.maxHealth = Math.ceil(enemy.maxHealth * difficulty * this.manager.enemyHealthScale * hpMul * durabilityMul * globalHpBuff);
        enemy.health = enemy.maxHealth;
        enemy.stats.speed *= difficulty * this.manager.enemySpeedScale * speedMul * globalSpeedBuff;
        const marineBaselineSpeed = Math.max(
            1,
            Number(this.scene?.leader?.moveSpeed)
            || Number(this.scene?.runtimeSettings?.player?.leaderSpeed)
            || 120
        );
        const minAlienSpeed = marineBaselineSpeed * 1.48;
        // Cap max alien speed to prevent drones/facehuggers from being unkitable
        const maxAlienSpeed = marineBaselineSpeed * 2.1;
        enemy.stats.speed = Phaser.Math.Clamp(enemy.stats.speed, minAlienSpeed, maxAlienSpeed);
        enemy.animStrideSpeed = enemy.stats.speed;
        enemy.stats.contactDamage = Math.ceil(enemy.stats.contactDamage * difficulty * this.manager.enemyDamageScale * dmgMul);
        enemy.stats.doorAttackCooldownMs = Math.max(220, Math.floor(enemy.stats.doorAttackCooldownMs / difficulty));

        const label = this.scene.add.text(0, 0, def.name.toUpperCase(), {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#111111',
            padding: { left: 3, right: 3, top: 1, bottom: 1 },
        });
        label.setDepth(CONFIG.DETECTION_LABEL_DEPTH);
        label.setVisible(false);
        this.manager.labels.set(enemy, label);

        // Colliders are handled at group level in EnemyManager constructor —
        // no per-enemy collider registration needed.
        
        // Initialize runtime state
        enemy.fullVisibleUntil = 0;
        enemy.revealCharge = 0;
        enemy.lastRevealTickAt = this.scene.time.now || 0;
        enemy.intent = 'assault';
        enemy.engagingDoor = false;
        enemy.nextIntentAt = 0;
        enemy.retreatStartedAt = null;
        enemy.detected = false;
        enemy.investigatePoint = null;
        enemy.investigateUntil = 0;
        enemy.feintPhase = Math.random() * Math.PI * 2;
        enemy.feintDir = Math.random() < 0.5 ? -1 : 1;
        enemy.nextFeintFlipAt = this.scene.time.now + Phaser.Math.Between(180, 520);
        enemy.nextDodgeAt = this.scene.time.now + Phaser.Math.Between(280, 1200);
        enemy.dodgeUntil = 0;
        enemy.dodgeAngle = 0;
        enemy.dodgeForwardMul = 0.5;
        enemy.nextLungeAt = this.scene.time.now + Phaser.Math.Between(520, 1800);
        enemy.lungeUntil = 0;
        enemy.lungeAngle = 0;
        enemy.lungeSpeedMul = 1;
        enemy.nextRushAt = this.scene.time.now + Phaser.Math.Between(620, 1600);
        enemy.rushUntil = 0;
        enemy.rushAngle = 0;
        enemy.rushSpeedMul = 1;
        enemy.lastSpottedTargetRef = null;
        enemy._hasSpotPaused = false;
        enemy.spotPauseUntil = 0;
        enemy.pounceUntil = 0;
        enemy.pounceAngle = 0;
        enemy.nextDoorPounceAt = this.scene.time.now + Phaser.Math.Between(220, 680);
        enemy.nextSpotPauseAt = 0;
        enemy.screamUntil = 0;
        enemy.nextScreamAt = 0;
        enemy.evadeUntil = 0;
        enemy.evadeAngle = 0;
        enemy.navLastSampleAt = this.scene.time.now || 0;
        enemy.navLastSampleX = spawn.x;
        enemy.navLastSampleY = spawn.y;
        enemy.navStuckMs = 0;
        enemy.navLastUnstuckAt = -10000;
        enemy.navUnstuckBurstCount = 0;
        enemy.navUnstuckBurstResetAt = 0;
        enemy.navRecoverUntil = 0;
        enemy.navRecoverTargetX = spawn.x;
        enemy.navRecoverTargetY = spawn.y;
        enemy.nextPathHintAt = 0;
        enemy.pathHintUntil = 0;
        enemy.pathHintX = spawn.x;
        enemy.pathHintY = spawn.y;
        enemy.nextHardResolveAt = 0;
        enemy.senseHasContact = false;
        enemy.nextSenseAt = 0;
        enemy.regroupUntil = 0;
        enemy.regroupAnchorX = spawn.x;
        enemy.regroupAnchorY = spawn.y;
        enemy.regroupReengageAt = 0;
        enemy.prevVx = 0;
        enemy.prevVy = 0;
        enemy.setAlpha(0); // Always spawn invisible; EnemyDetection handles all reveal
        enemy.spawnX = spawn.x;
        enemy.spawnY = spawn.y;
        const now = Number(this.scene?.time?.now) || 0;
        enemy.spawnPauseUntil = now + Phaser.Math.Between(320, 620);
        enemy.spawnAssignedTarget = null;
        enemy.spawnAssignedUntil = 0;
        enemy.spawnRushPrimed = false;

        this.scene?.eventBus?.emit('alienSpawned', { enemy, type, x: enemy.x, y: enemy.y });
        return enemy;
    }

    getLiveMarines() {
        if (this.scene?.squadSystem?.getAllMarines) {
            const mar = this.scene.squadSystem.getAllMarines();
            if (Array.isArray(mar) && mar.length > 0) return mar;
        }
        if (this.scene?.leader) return [this.scene.leader];
        return [];
    }

    isSpawnBeamVisible(worldX, worldY, marines) {
        const sources = this.manager.getLightSources().filter((s) => s && s.kind === 'torch');
        if (!Array.isArray(sources) || sources.length <= 0) return false;
        const point = { x: worldX, y: worldY };
        for (const src of sources) {
            const dist = Phaser.Math.Distance.Between(src.x, src.y, worldX, worldY);
            if (dist > (Number(src.range) || 0)) continue;
            if (!this.manager.isInLightCone(src, point)) continue;
            if (this.manager.isClosedDoorBetweenWorldPoints(src.x, src.y, worldX, worldY)) continue;
            if (!this.manager.hasLineOfSight(src.x, src.y, worldX, worldY, (Number(src.range) || dist) + 8)) continue;
            return true;
        }
        return false;
    }

    isSpawnVisibleToMarines(worldX, worldY, marines) {
        const live = (Array.isArray(marines) ? marines : []).filter((m) => m && m.active !== false && m.alive !== false);
        if (live.length <= 0) return false;
        for (const m of live) {
            const dist = Phaser.Math.Distance.Between(worldX, worldY, m.x, m.y);
            if (dist > CONFIG.TILE_SIZE * 12) continue;
            if (this.manager.isClosedDoorBetweenWorldPoints(m.x, m.y, worldX, worldY)) continue;
            if (!this.manager.hasLineOfSight(m.x, m.y, worldX, worldY, dist + 16)) continue;
            return true;
        }
        return false;
    }

    isSpawnValidByMarineProximity(worldX, worldY, marines) {
        let live = (Array.isArray(marines) ? marines : []).filter((m) => m && m.active !== false && m.alive !== false);
        // Fallback: if no marines found yet, use leader position directly
        if (live.length <= 0 && this.scene?.leader) {
            live = [this.scene.leader];
        }
        if (live.length <= 0) return true;
        const stagingActive = this.scene?.isStagingSafeActive?.(this.scene?.time?.now) === true;
        const sessionAgeMs = Math.max(0, (Number(this.scene?.time?.now) || 0) - (Number(this.scene?.sessionStartTime) || 0));
        const earlySessionPadTiles = !stagingActive && sessionAgeMs > 0 && sessionAgeMs < 35000 ? 1.5 : 0;
        const minDistPx = CONFIG.TILE_SIZE * ((stagingActive ? 13 : 9) + earlySessionPadTiles);
        if (this.scene?.isWorldInsideStagingSafeArea?.(worldX, worldY, CONFIG.TILE_SIZE * 1.2)) {
            return false;
        }
        if (this.isSpawnVisibleToMarines(worldX, worldY, live)) {
            return false;
        }
        let nearest = Infinity;
        for (const m of live) {
            const d = Phaser.Math.Distance.Between(worldX, worldY, m.x, m.y);
            if (d < nearest) nearest = d;
        }
        return nearest >= minDistPx;
    }

    resolveSpawnWorldWithRules(worldX, worldY, radiusTiles = 8) {
        const base = this.manager.resolveWalkableWorld(worldX, worldY, radiusTiles);
        if (!base) return null;
        const marines = this.getLiveMarines();
        if (this.isSpawnValidByMarineProximity(base.x, base.y, marines)) return base;
        const grid = this.scene?.pathGrid;
        if (!grid) return null;
        const roomProps = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        const blockedByProp = (x, y) => roomProps.some((p) => {
            if (p?.blocksPath === false) return false;
            const s = p?.sprite;
            if (!s?.active) return false;
            const d = Phaser.Math.Distance.Between(x, y, s.x, s.y);
            return d <= (p.radius || 18);
        });
        const start = grid.worldToTile(worldX, worldY);
        let best = null;
        let bestMarineDist = -Infinity;
        let bestOriginDist = Infinity;
        for (let r = 1; r <= Math.max(16, radiusTiles + 10); r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tx = start.x + dx;
                    const ty = start.y + dy;
                    if (!grid.isWalkable(tx, ty)) continue;
                    const w = grid.tileToWorld(tx, ty);
                    if (blockedByProp(w.x, w.y)) continue;
                    if (!this.isSpawnValidByMarineProximity(w.x, w.y, marines)) continue;
                    let nearestMarine = Infinity;
                    for (const m of marines) {
                        const d = Phaser.Math.Distance.Between(w.x, w.y, m.x, m.y);
                        if (d < nearestMarine) nearestMarine = d;
                    }
                    const originDist = (w.x - worldX) * (w.x - worldX) + (w.y - worldY) * (w.y - worldY);
                    if (nearestMarine > bestMarineDist + 0.001
                        || (Math.abs(nearestMarine - bestMarineDist) <= 0.001 && originDist < bestOriginDist)) {
                        bestMarineDist = nearestMarine;
                        bestOriginDist = originDist;
                        best = w;
                    }
                }
            }
            if (best) break;
        }
        return best;
    }

    updateEggs(time, marines) {
        let openCount = 0;
        for (const egg of this.manager.eggs) {
            if (!egg.active) continue;
            if (egg.state === 'spent') continue;
            if (egg.state === 'open' && time >= egg.openUntil) egg.setSpent();
            if (egg.state === 'open') openCount++;
        }

        for (const egg of this.manager.eggs) {
            if (!egg.active) continue;
            if (egg.state === 'spent' || egg.hasReleased) continue;
            if (openCount >= this.manager.maxOpenEggs) break;
            if (egg.state !== 'closed' || time < egg.nextReadyAt) continue;

            let inRange = false;
            for (const m of marines) {
                if (Phaser.Math.Distance.Between(egg.x, egg.y, m.x, m.y) <= EGG_TRIGGER_RANGE) {
                    inRange = true;
                    break;
                }
            }
            if (!inRange) continue;

            egg.open(time + EGG_OPEN_DURATION_MS);
            openCount++;
            const a = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            const sx = egg.x + Math.cos(a) * 18;
            const sy = egg.y + Math.sin(a) * 18;
            const eggSpawnType = this.scene && this.scene.forceWarriorOnly ? 'warrior' : 'facehugger';
            const spawned = this.spawnEnemyAtWorld(eggSpawnType, sx, sy, 1);
            if (spawned) {
                spawned.alertUntil = Math.max(spawned.alertUntil, time + this.manager.visualAlertMs);
                spawned.nextLeapAt = time + 180;
                egg.setSpent();
            }
        }
    }

    triggerVentBreakout(nearX, nearY, time) {
        const breakoutRange = 800;
        const marines = this.getLiveMarines();
        const minDistPx = CONFIG.TILE_SIZE * 7;
        const validVents = this.manager.ventPoints.filter(v => {
            const dNear = Phaser.Math.Distance.Between(v.x, v.y, nearX, nearY);
            if (dNear >= breakoutRange || dNear <= 200) return false;
            for (const m of marines) {
                if (Phaser.Math.Distance.Between(v.x, v.y, m.x, m.y) < minDistPx) return false;
            }
            return true;
        });
        
        if (validVents.length > 0) {
            const vent = Phaser.Utils.Array.GetRandom(validVents);
            const count = Phaser.Math.Between(1, 3);
            for (let i = 0; i < count; i++) {
                // Use spawnEnemyAtWorld which enforces marine proximity via resolveSpawnWorldWithRules
                const type = Math.random() < 0.8 ? 'warrior' : 'drone';
                this.spawnEnemyAtWorld(type, vent.x, vent.y);
                
                if (this.scene?.showFloatingText) {
                    this.scene.showFloatingText(vent.x, vent.y - 20, 'BREAKOUT!', '#ff3333');
                }
            }
            this.manager.nextBreakoutAt = time + this.manager.breakoutCooldownMs;
        }
    }

    /**
     * Spawn aliens dynamically based on CombatDirector tension.
     * Picks random walkable positions far from marines.
     */
    spawnDynamic(count, marines, difficulty = 1) {
        if (count <= 0) return 0;
        const live = (Array.isArray(marines) ? marines : []).filter(m => m && m.active !== false && m.alive !== false);
        if (live.length === 0) return 0;
        const reinforcementSystem = this.scene?.reinforcementSystem;
        const totalSlots = reinforcementSystem?.getAvailableReinforcementSlots?.() ?? count;
        const aliveNow = this.manager?.getAliveCount?.() || 0;
        const softCap = this.scene?.getDynamicAliveSoftCap?.(live) ?? Infinity;
        const capRoom = Math.max(0, softCap - aliveNow);
        const spawnBudget = Math.min(count, totalSlots, capRoom);
        if (spawnBudget <= 0) return 0;

        // Pick spawn positions far from marines
        const grid = this.scene?.pathGrid;
        if (!grid) return 0;

        let spawned = 0;
        const mapW = grid.width || 20;
        const mapH = grid.height || 20;
        const minDistTiles = 10;

        for (let i = 0; i < spawnBudget; i++) {
            let bestTile = null;
            let bestDist = 0;
            // Try 20 random positions, pick the farthest from all marines
            for (let attempt = 0; attempt < 20; attempt++) {
                const tx = Phaser.Math.Between(1, mapW - 2);
                const ty = Phaser.Math.Between(1, mapH - 2);
                if (!grid.isWalkable(tx, ty)) continue;
                const w = grid.tileToWorld(tx, ty);
                let minDist = Infinity;
                for (const m of live) {
                    const d = Phaser.Math.Distance.Between(w.x, w.y, m.x, m.y);
                    if (d < minDist) minDist = d;
                }
                if (minDist < CONFIG.TILE_SIZE * minDistTiles) continue;
                if (minDist > bestDist) {
                    bestDist = minDist;
                    bestTile = { x: tx, y: ty };
                }
            }
            if (!bestTile) {
                // Fallback: 10 attempts at 6-tile minimum
                for (let attempt = 0; attempt < 10; attempt++) {
                    const tx = Phaser.Math.Between(1, mapW - 2);
                    const ty = Phaser.Math.Between(1, mapH - 2);
                    if (!grid.isWalkable(tx, ty)) continue;
                    const w = grid.tileToWorld(tx, ty);
                    let minDist = Infinity;
                    for (const m of live) {
                        const d = Phaser.Math.Distance.Between(w.x, w.y, m.x, m.y);
                        if (d < minDist) minDist = d;
                    }
                    if (minDist >= CONFIG.TILE_SIZE * 6 && minDist > bestDist) {
                        bestDist = minDist;
                        bestTile = { x: tx, y: ty };
                    }
                }
            }
            if (!bestTile) continue;
            const wp = grid.tileToWorld(bestTile.x, bestTile.y);
            // Mix of types: mostly warriors with occasional drones
            const type = Math.random() < 0.75 ? 'warrior' : 'drone';
            const enemy = this.spawnEnemyAtWorld(type, wp.x, wp.y, difficulty);
            if (!enemy) continue;
            enemy.dynamicReinforcement = true;
            enemy.reinforcementSource = 'director';
            spawned++;
        }
        return spawned;
    }

    resolveEggSpawnWorld(worldX, worldY, radiusTiles = 4) {
        const pathGrid = this.scene?.pathGrid;
        if (!pathGrid) return { x: worldX, y: worldY };
        const roomProps = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        const blockedByProp = (x, y) => roomProps.some((p) => {
            if (p?.blocksPath === false) return false;
            const s = p?.sprite;
            if (!s?.active) return false;
            const d = Phaser.Math.Distance.Between(x, y, s.x, s.y);
            return d <= (p.radius || 18);
        });

        const origin = pathGrid.worldToTile(worldX, worldY);
        let best = null;
        let bestDist = Infinity;
        for (let r = 0; r <= radiusTiles; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = origin.x + dx;
                    const ty = origin.y + dy;
                    if (!pathGrid.isWalkable(tx, ty)) continue;
                    const w = pathGrid.tileToWorld(tx, ty);
                    if (blockedByProp(w.x, w.y)) continue;
                    const d2 = (w.x - worldX) * (w.x - worldX) + (w.y - worldY) * (w.y - worldY);
                    if (d2 < bestDist) {
                        bestDist = d2;
                        best = w;
                    }
                }
            }
            if (best) break;
        }
        return best;
    }
}
