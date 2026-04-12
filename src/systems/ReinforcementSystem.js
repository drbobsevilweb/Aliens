import { CONFIG } from '../config.js';

/**
 * Manages idle pressure spawns, gunfire reinforcement, and inactivity ambush logic.
 * Extracted from GameScene to improve maintainability.
 *
 * State is kept on this.scene so all existing GameScene property accesses
 * (e.g. this.nextIdlePressureAt) continue to work without change.
 */
export class ReinforcementSystem {
    constructor(scene) {
        this.scene = scene;
    }

    // -------------------------------------------------------------------------
    // Init — called from GameScene during mission setup
    // -------------------------------------------------------------------------

    init(script, missionId) {
        const s = this.scene;
        const missionPressureScale = this.getMissionSpawnPressureScale(missionId);
        const idleBaseMs = Number(script.idlePressureBaseMs) || 16000;
        const idleMinMs = Number(script.idlePressureMinMs) || 8000;
        const gunfireBaseMs = Number(script.gunfireReinforceBaseMs) || 4500;
        const gunfireMinMs = Number(script.gunfireReinforceMinMs) || 2200;

        s.idlePressureIntervalMs = Math.max(idleMinMs, Math.round(idleBaseMs * missionPressureScale));
        s.lastActionAt = s.time.now;
        s.nextIdlePressureAt = s.time.now + s.idlePressureIntervalMs;
        s.nextReinforcementSpawnAt = s.time.now + 600;
        s.inactivityAmbushDelayMs = Math.max(4000, Number(script.inactivityAmbushMs) || 10000);
        s.inactivityAmbushCooldownMs = Math.max(2500, Number(script.inactivityAmbushCooldownMs) || 14000);
        s.nextInactivityAmbushAt = s.time.now + s.inactivityAmbushDelayMs;
        s.gunfireReinforceCooldownMs = Math.max(gunfireMinMs, Math.round(gunfireBaseMs * missionPressureScale));
        s.nextGunfireReinforceAt = s.time.now + 2000;
        s.reinforceCap = Math.max(0, Math.floor(Number(script.reinforceCap) || 6));
        s.reinforceCapIdle = Math.max(0, Math.floor(Number(script.reinforceCapIdle) || 3));
        s.reinforceCapGunfire = Math.max(0, Math.floor(Number(script.reinforceCapGunfire) || 0));
        s.doorNoiseMemoryMs = Number(script.doorNoiseMemoryMs) || 16000;
        s.doorNoiseHistory = [];
        s.gunfireEventWindowMs = 2400;
        s.gunfireBurstThreshold = 9999;
        s.gunfireBurstDurationMs = 8000;
        s.gunfireBurstCooldownMs = 9000;
        s.gunfireBurstBonusPack = 0;
        s.gunfireBurstCooldownMul = 1.0;
        s.gunfireEvents = [];
        s.gunfireBurstUntil = 0;
        s.nextBurstEligibleAt = s.time.now + 2000;
        s.recentIdleSpawnPoints = [];
        s.idleSpawnMemoryMs = Math.max(2000, Number(script.idleSpawnMemoryMs) || 9000);
        s.lastReinforcementSpawnTypeAt = {};

        this.applyMissionReinforcementCaps(missionId);
    }

    // -------------------------------------------------------------------------
    // Per-frame update entry points
    // -------------------------------------------------------------------------

    update(time, marines) {
        if (this.scene?.stageFlow?.state === 'extract' || this.scene?.stageFlow?.isEnded?.()) return;
        this.updateCombatBurstState(time);
        this.updateIdlePressureSpawns(time, marines);
        this.updateInactivityAmbush(time, marines);
    }

    // -------------------------------------------------------------------------
    // Combat burst / gunfire tracking
    // -------------------------------------------------------------------------

    noteGunfireEvent(time = this.scene.time.now) {
        this.scene.gunfireEvents.push(time);
        this.pruneGunfireEvents(time);
    }

    pruneGunfireEvents(time = this.scene.time.now) {
        const s = this.scene;
        const windowMs = Math.max(400, s.gunfireEventWindowMs || 2400);
        s.gunfireEvents = (s.gunfireEvents || []).filter((t) => (time - t) <= windowMs);
    }

    isGunfireBurstActive(time = this.scene.time.now) {
        return time < (this.scene.gunfireBurstUntil || 0);
    }

    updateCombatBurstState(time = this.scene.time.now) {
        const s = this.scene;
        this.pruneGunfireEvents(time);
        const active = this.isGunfireBurstActive(time);
        if (active) {
            if (s.enemyManager && typeof s.enemyManager.notifySustainedGunfire === 'function') {
                const activityNorm = Phaser.Math.Clamp(
                    (s.gunfireEvents?.length || 0) / Math.max(1, s.gunfireBurstThreshold || 1),
                    0.5, 1.8
                );
                s.enemyManager.notifySustainedGunfire(time, activityNorm);
            }
            return;
        }
        if (time < s.nextBurstEligibleAt) return;
        if ((s.gunfireEvents || []).length < s.gunfireBurstThreshold) return;
        s.gunfireBurstUntil = time + s.gunfireBurstDurationMs;
        s.nextBurstEligibleAt = s.gunfireBurstUntil + s.gunfireBurstCooldownMs;
        if (s.enemyManager && typeof s.enemyManager.notifySustainedGunfire === 'function') {
            s.enemyManager.notifySustainedGunfire(time, 1.4);
        }
        s.showFloatingText(s.leader.x, s.leader.y - 40, 'SWARM RESPONSE INTENSIFYING', '#ffb3b3');
    }

    // -------------------------------------------------------------------------
    // Combat action tracking (idle pressure reset)
    // -------------------------------------------------------------------------

    markCombatAction(time = this.scene.time.now) {
        const s = this.scene;
        s.lastActionAt = time;
        s.nextIdlePressureAt = Math.max(s.nextIdlePressureAt, time + this.getAdaptiveIdleIntervalMs());
        s.nextInactivityAmbushAt = Math.max(
            s.nextInactivityAmbushAt || 0,
            time + Math.max(1200, s.inactivityAmbushDelayMs || 10000)
        );
    }

    getAdaptiveIdleIntervalMs() {
        const s = this.scene;
        const pressure = s.getCombatPressure();
        const state = s.getDirectorState();
        const minFloor = Math.max(1000, Math.floor(s.idlePressureIntervalMs * 0.45));
        const pressureScale = Phaser.Math.Linear(1.22, 0.72, pressure);
        const stateMul = state === 'release' ? 1.2 : (state === 'peak' ? 0.82 : 1);
        return Math.max(minFloor, Math.floor(s.idlePressureIntervalMs * pressureScale * stateMul));
    }

    // -------------------------------------------------------------------------
    // Reinforcement caps
    // -------------------------------------------------------------------------

    getMissionSpawnPressureScale(missionId = '') {
        if (missionId === 'm5') return 0.64;
        if (missionId === 'm4') return 0.72;
        if (missionId === 'm3') return 0.8;
        if (missionId === 'm2') return 0.88;
        return 0.95;
    }

    getMissionReinforcementCapScale(missionId = '') {
        if (missionId === 'm5') return 1.36;
        if (missionId === 'm4') return 1.24;
        if (missionId === 'm3') return 1.12;
        if (missionId === 'm2') return 1.0;
        return 0.9;
    }

    applyMissionReinforcementCaps(missionId = '') {
        const s = this.scene;
        const scale = this.getMissionReinforcementCapScale(missionId);
        s.reinforceCapEffective = Math.max(0, Math.round(s.reinforceCap * scale));
        s.reinforceCapIdleEffective = Math.max(0, Math.round(s.reinforceCapIdle * scale));
        s.reinforceCapGunfireEffective = Math.max(0, Math.round(s.reinforceCapGunfire * scale));
    }

    countActiveReinforcements(source = null) {
        const s = this.scene;
        if (!s.enemyManager || !Array.isArray(s.enemyManager.enemies)) return 0;
        let n = 0;
        for (const e of s.enemyManager.enemies) {
            if (!e || !e.active) continue;
            if (e.dynamicReinforcement !== true) continue;
            if (source && e.reinforcementSource !== source) continue;
            n++;
        }
        return n;
    }

    getAvailableReinforcementSlots(source = null) {
        const s = this.scene;
        const totalCap = Number.isFinite(s.reinforceCapEffective) ? s.reinforceCapEffective : s.reinforceCap;
        if (!Number.isFinite(totalCap) || totalCap <= 0) return 0;
        const totalSlots = Math.max(0, totalCap - this.countActiveReinforcements());
        if (source === 'idle') {
            const sourceCap = Number.isFinite(s.reinforceCapIdleEffective) ? s.reinforceCapIdleEffective : s.reinforceCapIdle;
            return Math.max(0, Math.min(totalSlots, sourceCap - this.countActiveReinforcements('idle')));
        }
        if (source === 'gunfire') {
            const sourceCap = Number.isFinite(s.reinforceCapGunfireEffective) ? s.reinforceCapGunfireEffective : s.reinforceCapGunfire;
            return Math.max(0, Math.min(totalSlots, sourceCap - this.countActiveReinforcements('gunfire')));
        }
        return totalSlots;
    }

    noteReinforcementSpawn(time = this.scene.time.now, source = 'idle', spawned = 1) {
        if (spawned <= 0) return;
        const s = this.scene;
        const pressure = s.getCombatPressure();
        const state = s.getDirectorState();
        const baseGap = source === 'gunfire' ? 620 : 900;
        const pressureMul = Phaser.Math.Linear(1.24, 0.72, pressure);
        const stateMul = state === 'peak' ? 0.8 : (state === 'release' ? 1.08 : 1);
        const burstMul = (source === 'gunfire' && this.isGunfireBurstActive(time)) ? 0.86 : 1;
        const sizeMul = Phaser.Math.Clamp(1 + (spawned - 1) * 0.12, 1, 1.6);
        const gap = Math.max(340, Math.floor(baseGap * pressureMul * stateMul * burstMul * sizeMul));
        s.nextReinforcementSpawnAt = Math.max(s.nextReinforcementSpawnAt || 0, time + gap);
    }

    // -------------------------------------------------------------------------
    // Door noise / direction tracking
    // -------------------------------------------------------------------------

    getDirectionBucket(worldX, worldY) {
        const s = this.scene;
        const dx = worldX - s.leader.x;
        const dy = worldY - s.leader.y;
        if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
        return dy >= 0 ? 'S' : 'N';
    }

    pruneDoorNoiseHistory(time = this.scene.time.now) {
        const s = this.scene;
        const memory = Math.max(1000, s.doorNoiseMemoryMs || 16000);
        s.doorNoiseHistory = (s.doorNoiseHistory || []).filter((e) => (time - e.time) <= memory);
    }

    getDoorNoisePenalty(dir, time = this.scene.time.now) {
        this.pruneDoorNoiseHistory(time);
        const s = this.scene;
        const memory = Math.max(1000, s.doorNoiseMemoryMs || 16000);
        let newest = null;
        for (const entry of s.doorNoiseHistory) {
            if (!entry || entry.dir !== dir) continue;
            if (!newest || entry.time > newest.time) newest = entry;
        }
        if (!newest) return 0;
        const age = Math.max(0, time - newest.time);
        const t = Phaser.Math.Clamp(age / memory, 0, 1);
        return Phaser.Math.Linear(2600, 0, t);
    }

    noteDoorNoiseDirection(dir, doorId = '', time = this.scene.time.now) {
        if (!dir) return;
        const s = this.scene;
        if (!s.doorNoiseHistory) s.doorNoiseHistory = [];
        s.doorNoiseHistory.push({ dir, doorId, time });
        this.pruneDoorNoiseHistory(time);
    }

    getDoorRepeatPenalty(doorId = '', time = this.scene.time.now) {
        if (!doorId) return 0;
        this.pruneDoorNoiseHistory(time);
        const s = this.scene;
        const memory = Math.max(1000, s.doorNoiseMemoryMs || 16000);
        let newest = null;
        for (const entry of s.doorNoiseHistory) {
            if (!entry || entry.doorId !== doorId) continue;
            if (!newest || entry.time > newest.time) newest = entry;
        }
        if (!newest) return 0;
        const age = Math.max(0, time - newest.time);
        const t = Phaser.Math.Clamp(age / memory, 0, 1);
        return Phaser.Math.Linear(3200, 0, t);
    }

    getDoorGroupCenter(doorGroup) {
        let sx = 0;
        let sy = 0;
        for (const d of doorGroup.doors) {
            sx += d.x;
            sy += d.y;
        }
        return {
            x: sx / doorGroup.doors.length,
            y: sy / doorGroup.doors.length,
        };
    }

    // -------------------------------------------------------------------------
    // Idle spawn history (avoids spawn repeat in same area)
    // -------------------------------------------------------------------------

    pruneIdleSpawnHistory(time = this.scene.time.now) {
        const s = this.scene;
        const memory = Math.max(2000, s.idleSpawnMemoryMs || 9000);
        s.recentIdleSpawnPoints = (s.recentIdleSpawnPoints || []).filter((p) => (time - p.time) <= memory);
    }

    noteIdleSpawnPoint(world, time = this.scene.time.now) {
        if (!world) return;
        const s = this.scene;
        if (!s.recentIdleSpawnPoints) s.recentIdleSpawnPoints = [];
        s.recentIdleSpawnPoints.push({ x: world.x, y: world.y, time });
        this.pruneIdleSpawnHistory(time);
    }

    getIdleSpawnRepeatPenalty(world, time = this.scene.time.now) {
        if (!world) return 0;
        this.pruneIdleSpawnHistory(time);
        const s = this.scene;
        const memory = Math.max(2000, s.idleSpawnMemoryMs || 9000);
        let penalty = 0;
        for (const p of s.recentIdleSpawnPoints || []) {
            const dist = Phaser.Math.Distance.Between(world.x, world.y, p.x, p.y);
            if (dist > CONFIG.TILE_SIZE * 7) continue;
            const age = Math.max(0, time - p.time);
            const t = Phaser.Math.Clamp(age / memory, 0, 1);
            penalty += Phaser.Math.Linear(1100, 0, t);
        }
        return penalty;
    }

    // -------------------------------------------------------------------------
    // Reinforcement type tracking
    // -------------------------------------------------------------------------

    pickReinforcementType(source = 'idle', index = 0, time = this.scene.time.now) {
        if (this.scene.forceWarriorOnly) return 'warrior';
        return this.scene.getWeightedSpawnType();
    }

    noteReinforcementTypeSpawn(type, time = this.scene.time.now) {
        if (!type) return;
        const s = this.scene;
        if (!s.lastReinforcementSpawnTypeAt) s.lastReinforcementSpawnTypeAt = {};
        s.lastReinforcementSpawnTypeAt[type] = time;
    }

    isReinforcementTypeReady(type, time = this.scene.time.now, cooldownMs = 3000) {
        const lastAt = Number(this.scene.lastReinforcementSpawnTypeAt?.[type]) || -100000;
        return (time - lastAt) >= cooldownMs;
    }

    // -------------------------------------------------------------------------
    // Gunfire reinforcement
    // -------------------------------------------------------------------------

    tryGunfireReinforcement(time, sourceX, sourceY, marines) {
        const s = this.scene;
        if (s.areAmbientEnemySpawnsSuppressed?.()) return;
        if (!s.enemyManager || !s.doorManager || s.stageFlow.isEnded()) return;
        if (time < s.nextGunfireReinforceAt) return;
        if (time < (s.nextReinforcementSpawnAt || 0)) return;
        if (time < s.pressureGraceUntil) return;
        if (s.stageFlow.state === 'intermission') return;
        const stateNow = s.getDirectorState();
        if (stateNow === 'release') {
            const onScreen = s.enemyManager.getOnScreenHostileCount(s.cameras.main);
            if (onScreen > 0) {
                s.nextGunfireReinforceAt = time + Phaser.Math.Between(700, 1200);
                return;
            }
        }
        const aliveNow = s.enemyManager.getAliveCount();
        const softCap = s.getDynamicAliveSoftCap(marines);
        if (aliveNow >= softCap) {
            s.nextGunfireReinforceAt = time + Phaser.Math.Between(900, 1500);
            return;
        }
        if (s.shouldApplySurvivalRelief(marines)) {
            s.nextGunfireReinforceAt = time + Math.max(900, Math.floor(s.gunfireReinforceCooldownMs * 1.5));
            return;
        }
        const spawned = this.spawnGunfireDoorPack(time, sourceX, sourceY, marines);
        const burstMul = this.isGunfireBurstActive(time) ? s.gunfireBurstCooldownMul : 1;
        const pressure = s.getCombatPressure();
        const state = s.getDirectorState();
        const pressureMul = Phaser.Math.Linear(1.2, 0.68, pressure);
        const stateMul = state === 'release' ? 1.15 : (state === 'peak' ? 0.82 : 1);
        const effectiveCd = Math.max(380, Math.floor(s.gunfireReinforceCooldownMs * burstMul * pressureMul * stateMul));
        s.nextGunfireReinforceAt = spawned > 0
            ? (time + effectiveCd)
            : (time + Math.min(1200, Math.max(450, Math.floor(effectiveCd * 0.35))));
        if (spawned > 0) {
            this.noteReinforcementSpawn(time, 'gunfire', spawned);
            s.showFloatingText(s.leader.x, s.leader.y - 34, 'ALIENS STIRRING BEHIND DOORS', '#99bbff');
        }
    }

    spawnGunfireDoorPack(time, sourceX, sourceY, marines) {
        const s = this.scene;
        if (s.areAmbientEnemySpawnsSuppressed?.()) return 0;
        if (s.stageFlow?.state === 'extract' || s.stageFlow?.isEnded?.()) return 0;
        const slots = this.getAvailableReinforcementSlots('gunfire');
        if (slots <= 0) return 0;
        const aliveNow = s.enemyManager?.getAliveCount?.() || 0;
        const softCap = s.getDynamicAliveSoftCap(marines);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) return 0;
        const basePack = s.activeMission?.difficulty === 'extreme' ? 3 : (s.activeMission?.difficulty === 'hard' ? 2 : 1);
        const pressure = s.getCombatPressure();
        const state = s.getDirectorState();
        const pressureBonus = pressure > 0.85 ? 1 : 0;
        const stateBonus = state === 'release' ? -1 : 0;
        const desiredPack = basePack
            + pressureBonus
            + stateBonus
            + (this.isGunfireBurstActive(time) ? s.gunfireBurstBonusPack : 0);
        const packSize = Math.min(desiredPack, slots, capRoom);
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : [s.leader];
        const view = s.cameras.main ? s.cameras.main.worldView : null;
        this.pruneDoorNoiseHistory(time);
        const hasSource = Number.isFinite(sourceX) && Number.isFinite(sourceY);
        const candidates = [];
        for (const group of s.doorManager.doorGroups || []) {
            if (!group || group.isPassable) continue;
            const center = this.getDoorGroupCenter(group);
            const nearestDist = marList.reduce((best, m) => {
                const d = Phaser.Math.Distance.Between(m.x, m.y, center.x, center.y);
                return Math.min(best, d);
            }, Infinity);
            if (nearestDist < CONFIG.TILE_SIZE * 5) continue;
            if (view && Phaser.Geom.Rectangle.Contains(view, center.x, center.y)) continue;
            const dir = this.getDirectionBucket(center.x, center.y);
            const repeatPenalty = this.getDoorRepeatPenalty(group.id, time);
            let sourceScore = 0;
            if (hasSource) {
                const sourceDist = Phaser.Math.Distance.Between(sourceX, sourceY, center.x, center.y);
                const sourceNorm = Phaser.Math.Clamp(sourceDist / (CONFIG.TILE_SIZE * 18), 0, 1);
                sourceScore = Phaser.Math.Linear(1000, -300, sourceNorm);
            }
            const score = nearestDist - this.getDoorNoisePenalty(dir, time) - repeatPenalty + sourceScore + Phaser.Math.Between(0, 120);
            candidates.push({ group, center, nearestDist, dir, score, repeatPenalty });
        }
        if (candidates.length === 0) return 0;
        candidates.sort((a, b) => b.score - a.score);
        const selected = [];
        const usedDirs = new Set();
        for (const c of candidates) {
            if (selected.length >= packSize) break;
            if (usedDirs.has(c.dir)) continue;
            selected.push(c);
            usedDirs.add(c.dir);
        }
        if (selected.length < packSize) {
            for (const c of candidates) {
                if (selected.length >= packSize) break;
                if (selected.includes(c)) continue;
                selected.push(c);
            }
        }
        let spawned = 0;
        for (let i = 0; i < selected.length; i++) {
            const c = selected[i];
            const spawnWorld = this.pickIdlePressureSpawnWorld(view, marList, time, c.dir, c.center)
                || this.pickSpawnBehindDoor(c.group, c.center, marList);
            if (!spawnWorld) continue;
            const type = this.pickReinforcementType('gunfire', i + 1, time);
            const enemy = s.enemyManager.spawnEnemyAtWorld(type, spawnWorld.x, spawnWorld.y, s.stageFlow.currentWave || 1);
            if (!enemy) continue;
            this.noteReinforcementTypeSpawn(type, time);
            enemy.dynamicReinforcement = true;
            enemy.reinforcementSource = 'gunfire';
            enemy.alertUntil = Math.max(enemy.alertUntil, time + 4200);
            enemy.investigatePoint = { x: c.center.x, y: c.center.y, power: 1.1 };
            enemy.investigateUntil = time + 3600;
            this.noteDoorNoiseDirection(c.dir, c.group.id, time);
            s.reportDoorThump(c.center.x, c.center.y, time + i * 90, false, true);
            this.scene.sfx?.reportDoorThump?.();
            spawned++;
        }
        if (spawned > 0 && this.scene?.sfx) {
            this.scene.sfx.playTrackerPing({ strong: true, proximity: 0.5 });
        }
        return spawned;
    }

    pickSpawnBehindDoor(doorGroup, center, marines) {
        const s = this.scene;
        if (!doorGroup || !center || !s.pathGrid) return null;
        const spawner = s.enemyManager?.spawner;
        const vertical = doorGroup.doors.length < 2 || doorGroup.doors[0].tileX === doorGroup.doors[1].tileX;
        let nearest = marines[0] || s.leader;
        let nearestDist = Infinity;
        for (const m of marines) {
            const d = Phaser.Math.Distance.Between(m.x, m.y, center.x, center.y);
            if (d < nearestDist) {
                nearest = m;
                nearestDist = d;
            }
        }
        const marineSide = vertical
            ? (nearest.x < center.x ? -1 : 1)
            : (nearest.y < center.y ? -1 : 1);
        const spawnSide = -marineSide;
        const lateral = [-1, 0, 1];
        for (const step of [1.4, 1.9, 2.4]) {
            for (const lat of Phaser.Utils.Array.Shuffle([...lateral])) {
                let wx = center.x;
                let wy = center.y;
                if (vertical) {
                    wx += spawnSide * CONFIG.TILE_SIZE * step;
                    wy += lat * CONFIG.TILE_SIZE * 0.9;
                } else {
                    wy += spawnSide * CONFIG.TILE_SIZE * step;
                    wx += lat * CONFIG.TILE_SIZE * 0.9;
                }
                const t = s.pathGrid.worldToTile(wx, wy);
                if (!s.pathGrid.isWalkable(t.x, t.y)) continue;
                const world = s.pathGrid.tileToWorld(t.x, t.y);
                if (s.isWorldInsideStagingSafeArea(world.x, world.y, CONFIG.TILE_SIZE * 0.7)) continue;
                if (spawner && !spawner.isSpawnValidByMarineProximity(world.x, world.y, marines)) continue;
                return world;
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Idle pressure spawns
    // -------------------------------------------------------------------------

    updateIdlePressureSpawns(time, marines) {
        const s = this.scene;
        if (s.areAmbientEnemySpawnsSuppressed?.()) return;
        if (s.isStagingSafeActive(time)) return;
        if (!s.enemyManager || s.stageFlow.isEnded()) return;
        if (this.getAvailableReinforcementSlots('idle') <= 0) return;
        if (time < s.nextIdlePressureAt) return;
        if (time < (s.nextReinforcementSpawnAt || 0)) return;
        if (time < s.pressureGraceUntil) return;
        if (s.getDirectorState() === 'release') {
            s.nextIdlePressureAt = time + Phaser.Math.Between(900, 1500);
            return;
        }
        const aliveNow = s.enemyManager.getAliveCount();
        const softCap = s.getDynamicAliveSoftCap(marines);
        if (aliveNow >= softCap) {
            s.nextIdlePressureAt = time + Phaser.Math.Between(900, 1700);
            return;
        }
        const adaptiveIdleMs = this.getAdaptiveIdleIntervalMs();
        if ((time - s.lastActionAt) < adaptiveIdleMs) return;
        if (s.stageFlow.state === 'intermission') return;
        if (s.shouldApplySurvivalRelief(marines)) {
            s.nextIdlePressureAt = time + Math.max(1200, Math.floor(adaptiveIdleMs * 1.4));
            return;
        }
        const onScreen = s.enemyManager.getOnScreenHostileCount(s.cameras.main);
        if (onScreen >= 3) return;
        const spawned = this.spawnIdlePressureWave(time, marines);
        s.nextIdlePressureAt = time + adaptiveIdleMs;
        if (spawned > 0) {
            this.markCombatAction(time);
            this.noteReinforcementSpawn(time, 'idle', spawned);
            s.showFloatingText(s.leader.x, s.leader.y - 28, 'CONTACT: NEW HOSTILES', '#99ddff');
        }
    }

    spawnIdlePressureWave(_time, marines) {
        const s = this.scene;
        if (s.areAmbientEnemySpawnsSuppressed?.()) return 0;
        if (s.isStagingSafeActive(_time)) return 0;
        const leader = s.leader;
        if (!leader || !s.pathGrid) return 0;
        const slots = this.getAvailableReinforcementSlots('idle');
        if (slots <= 0) return 0;
        const aliveNow = s.enemyManager?.getAliveCount?.() || 0;
        const softCap = s.getDynamicAliveSoftCap(marines);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) return 0;
        const view = s.cameras.main ? s.cameras.main.worldView : null;
        const difficulty = s.activeMission?.difficulty || 'normal';
        const desiredPack = difficulty === 'extreme' ? 3 : (difficulty === 'hard' ? 2 : 1);
        const pressure = s.getCombatPressure();
        const state = s.getDirectorState();
        const pressureBonus = pressure > 0.85 ? 1 : 0;
        const stateBonus = state === 'release' ? -1 : 0;
        const packSize = Math.min(slots, capRoom, Math.max(1, desiredPack + pressureBonus + stateBonus));
        let spawned = 0;
        for (let i = 0; i < packSize; i++) {
            const world = this.pickIdlePressureSpawnWorld(view, marines, _time);
            if (!world) continue;
            const type = this.pickReinforcementType('idle', i, _time);
            const enemy = s.enemyManager.spawnEnemyAtWorld(type, world.x, world.y, s.stageFlow.currentWave || 1);
            if (enemy) {
                this.noteReinforcementTypeSpawn(type, _time);
                enemy.dynamicReinforcement = true;
                enemy.reinforcementSource = 'idle';
                const marList = Array.isArray(marines) && marines.length > 0 ? marines : [leader];
                const target = marList[Math.floor(Math.random() * marList.length)] || leader;
                enemy.alertUntil = Math.max(enemy.alertUntil, s.time.now + 3800);
                enemy.investigatePoint = { x: target.x, y: target.y, power: 1 };
                enemy.investigateUntil = s.time.now + 3200;
                this.noteIdleSpawnPoint(world, _time);
                spawned++;
            }
        }
        if (spawned > 0 && this.scene?.sfx) {
            this.scene.sfx.playTrackerPing({ strong: true, proximity: 0.5 });
        }
        return spawned;
    }

    pickIdlePressureSpawnWorld(view, marines, time = this.scene.time.now, preferredDir = '', _anchorWorld = null) {
        const s = this.scene;
        const leader = s.leader;
        const spawner = s.enemyManager?.spawner;
        const maxAttempts = 96;
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : [leader];
        const lighting = s.runtimeSettings?.lighting || {};
        const beamHalf = (lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE) * 0.38;
        const beamRange = (lighting.torchRange ?? CONFIG.TORCH_RANGE) * 0.78;
        const ringMin = Math.max(CONFIG.TILE_SIZE * 5, beamRange * 0.9);
        const ringMax = Math.max(ringMin + 8, beamRange * 1.12);
        let best = null;
        let bestScore = -Infinity;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const marine = marList[Phaser.Math.Between(0, marList.length - 1)] || leader;
            if (!marine) continue;
            const facing = (marine.facingAngle ?? marine.rotation) || 0;
            const a = facing + Phaser.Math.FloatBetween(-beamHalf * 0.94, beamHalf * 0.94);
            const d = Phaser.Math.FloatBetween(ringMin, ringMax);
            const probeX = marine.x + Math.cos(a) * d;
            const probeY = marine.y + Math.sin(a) * d;
            const world = s.findNearestWalkableWorld(probeX, probeY, 4);
            if (!world) continue;
            if (s.isWorldInsideStagingSafeArea(world.x, world.y, CONFIG.TILE_SIZE * 0.9)) continue;
            if (spawner && !spawner.isSpawnValidByMarineProximity(world.x, world.y, marList)) continue;
            let nearest = Infinity;
            for (const m of marList) {
                const dist = Phaser.Math.Distance.Between(m.x, m.y, world.x, world.y);
                if (dist < nearest) nearest = dist;
            }
            if (nearest < ringMin * 0.82 || nearest > ringMax * 1.3) continue;
            const onScreen = view && Phaser.Geom.Rectangle.Contains(view, world.x, world.y);
            const offscreenBonus = onScreen ? -280 : 220;
            const repeatPenalty = this.getIdleSpawnRepeatPenalty(world, time);
            const dir = this.getDirectionBucket(world.x, world.y);
            const dirBonus = preferredDir && preferredDir === dir ? 420 : 0;
            const edgeBias = -Math.abs(nearest - beamRange) * 1.3;
            const score = offscreenBonus - repeatPenalty + dirBonus + edgeBias + Phaser.Math.Between(0, 90);
            if (score > bestScore) {
                best = world;
                bestScore = score;
            }
        }
        return best;
    }

    // -------------------------------------------------------------------------
    // Inactivity ambush
    // -------------------------------------------------------------------------

    updateInactivityAmbush(time, marines) {
        const s = this.scene;
        if (s.areAmbientEnemySpawnsSuppressed?.()) return;
        if (s.isStagingSafeActive(time)) return;
        if (!s.enemyManager || s.stageFlow.isEnded()) return;
        if (s.stageFlow.state === 'intermission') return;
        if (time < (s.nextInactivityAmbushAt || 0)) return;
        if ((time - s.lastActionAt) < (s.inactivityAmbushDelayMs || 10000)) return;
        if (time < (s.nextReinforcementSpawnAt || 0)) return;
        if (time < s.pressureGraceUntil) return;
        if (s.getDirectorState() === 'release') {
            s.nextInactivityAmbushAt = time + Phaser.Math.Between(1200, 2200);
            return;
        }
        if (s.shouldApplySurvivalRelief(marines)) {
            s.nextInactivityAmbushAt = time + Math.max(1800, Math.floor((s.inactivityAmbushCooldownMs || 14000) * 0.55));
            return;
        }
        const aliveNow = s.enemyManager.getAliveCount();
        const softCap = s.getDynamicAliveSoftCap(marines);
        if (aliveNow >= softCap) {
            s.nextInactivityAmbushAt = time + 1400;
            return;
        }
        const onScreen = s.enemyManager.getOnScreenHostileCount(s.cameras.main);
        if (onScreen >= 4) {
            s.nextInactivityAmbushAt = time + 1200;
            return;
        }
        const pressure = s.getCombatPressure();
        const source = pressure >= 0.66 ? 'gunfire' : 'idle';
        if (this.getAvailableReinforcementSlots(source) <= 0) {
            s.nextInactivityAmbushAt = time + 1400;
            return;
        }
        const dirs = ['N', 'E', 'S', 'W'];
        const bestDir = dirs.reduce((best, dir) => {
            const score = this.getDoorNoisePenalty(dir, time) + Phaser.Math.Between(0, 140);
            if (!best || score < best.score) return { dir, score };
            return best;
        }, null);
        const dir = (bestDir && bestDir.dir) || Phaser.Utils.Array.GetRandom(dirs);
        const size = Math.max(1, Math.min(6, Math.round(2 + pressure * 3.1)));
        const spawned = s.spawnDirectorPack({ size, source, dir }, time, marines);
        if (spawned > 0) {
            const cue = s.buildMissionCueWorldFromDir(dir);
            s.showEdgeWordCue(s.getMissionAudioCueText('cue_motion_near', 'MOVEMENT'), cue.x, cue.y, '#9fc6ff');
            s.showFloatingText(s.leader.x, s.leader.y - 34, `SILENCE BROKEN: ${source.toUpperCase()} CONTACT ${dir}`, '#a9d8ff');
            this.markCombatAction(time);
            const cdMul = Phaser.Math.Linear(1.08, 0.76, pressure);
            s.nextInactivityAmbushAt = time + Math.max(
                2600,
                Math.floor((s.inactivityAmbushCooldownMs || 14000) * cdMul)
            );
            return;
        }
        s.nextInactivityAmbushAt = time + 1200;
    }
}
