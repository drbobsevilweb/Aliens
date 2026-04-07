import { CONFIG } from '../config.js';

/**
 * Handles AI combat logic for squad followers.
 */
export class FollowerCombatSystem {
    constructor(scene) {
        this.scene = scene;
        this.followerCombatState = new Map();
        this.sharedMarineContact = null;
        this.lastMoraleKillCount = 0;
        /** Focus-fire: tracks which enemies are being targeted by how many followers */
        this._focusFireMap = new Map(); // enemyId → { count, enemy }
        /** Dominant threat direction for idle scan bias (angle or null) */
        this.dominantThreatAngle = null;
    }

    getFollowerCombatState(roleKey) {
        let state = this.followerCombatState.get(roleKey);
        if (state) return state;
        
        const MARINE_SWEEP_ANCHORS = {
            tech: Math.PI / 2,       // South — matches GameScene constant
            medic: Math.PI,          // West
            heavy: -Math.PI / 4,     // North East
        };

        const anchor = MARINE_SWEEP_ANCHORS[roleKey] ?? 0;
        state = {
            nextFireAt: 0,
            jamUntil: 0,
            targetRef: null,
            lastKnownX: null,
            lastKnownY: null,
            lastKnownAt: -10000,
            readyAt: 0,
            nextThinkAt: 0,
            moraleRecoverMs: Phaser.Math.Between(30000, 60000),
            lastMoraleShockAt: -10000,
            lastSelfShockAt: -10000,
            lastThreatPulseAt: -10000,
            sweepAnchor: anchor,
            sweepPhase: Math.random() * Math.PI * 2,
            assistNoticedAt: 0,
            burstShotsLeft: 0,
            burstRecoverUntil: 0,
            suppressionUntil: 0,
            nextSuppressAt: 0,
        };
        this.followerCombatState.set(roleKey, state);
        return state;
    }

    update(time, delta, marines) {
        if (!marines || marines.length === 0 || !this.scene.enemyManager) return;
        const dtSec = Math.max(0.001, delta / 1000);

        // Follower overheat cooling.
        for (const [key, ammo] of (this.scene.marineAmmo || new Map())) {
            if (key === 'leader') continue;
            const profile = this.scene.getFollowerCombatProfile ? this.scene.getFollowerCombatProfile(key) : null;
            const coolRate = Math.max(1, Number(profile?.coolRate) || 25);
            if (ammo.isOverheated) {
                if (time >= ammo.overheatCooldownUntil) {
                    ammo.pulseHeat = Math.max(0, ammo.pulseHeat - coolRate * dtSec);
                    if (ammo.pulseHeat <= 0) { ammo.pulseHeat = 0; ammo.isOverheated = false; }
                }
            } else if (ammo.pulseHeat > 0) {
                ammo.pulseHeat = Math.max(0, ammo.pulseHeat - coolRate * dtSec);
            }
        }

        const thinkIntervalMs = 70; // Faster threat assessment for quicker reaction
        const marineTuning = this.scene.runtimeSettings?.marines || {};
        const calmPerSec = Phaser.Math.Clamp(Number(marineTuning.panicCalmPerSec) || 7, 0.5, 40);
        const lowHealthPerSec = Phaser.Math.Clamp(Number(marineTuning.panicLowHealthPerSec) || 9, 0, 40);
        const swarmPerSec = Phaser.Math.Clamp(Number(marineTuning.panicSwarmPerSec) || 6, 0, 40);
        const selfHitLoss = Phaser.Math.Clamp(Number(marineTuning.panicSelfHitLoss) || 10, 0, 60);
        const allyHitLoss = Phaser.Math.Clamp(Number(marineTuning.panicAllyHitLoss) || 3, 0, 30);
        const suppressWindowMs = 500;
        const combatMods = this.scene.combatMods || {
            marineAccuracyMul: 1,
            marineJamMul: 1,
            marineReactionMul: 1,
            pressure: 0.3,
        };
        
        const laneDirective = this.scene.parseCommanderLaneDirective ? this.scene.parseCommanderLaneDirective(this.scene.currentCommanderDirective || '') : { mode: 'none' };
        
        if (this.scene.totalKills > this.lastMoraleKillCount) {
            const gain = (this.scene.totalKills - this.lastMoraleKillCount) * 5;
            for (const marine of marines) {
                if (!marine.roleKey || marine.roleKey === 'leader' || marine.alive === false || marine.active === false) continue;
                marine.morale = Phaser.Math.Clamp((marine.morale || 0) + gain, -100, 100);
            }
            this.lastMoraleKillCount = this.scene.totalKills;
        }

        // Rebuild focus-fire map for this frame
        this._focusFireMap.clear();
        for (const [roleKey, st] of this.followerCombatState) {
            if (st.targetRef && st.targetRef.active) {
                this._focusFireMap.set(st.targetRef, (this._focusFireMap.get(st.targetRef) || 0) + 1);
            }
        }

        const enemies = this.scene.enemyManager.getDetectedEnemies() || [];
        const allEnemies = this.scene.enemyManager.getAliveEnemies() || [];
        const lighting = this.scene.runtimeSettings?.lighting || {};
        const halfAngle = lighting.torchConeHalfAngle ?? CONFIG.TORCH_CONE_HALF_ANGLE;
        const range = (lighting.torchRange ?? CONFIG.TORCH_RANGE) * 1.1; // Slightly extended for followers
        
        const isWithinFiringCone = (marine, tx, ty, coneHalfAngle = 1.22) => { // ~70 deg half-angle — wider awareness
            const angleToTarget = Phaser.Math.Angle.Between(marine.x, marine.y, tx, ty);
            const currentAngle = (marine.facingAngle ?? marine.rotation) || 0;
            let diff = Math.abs(Phaser.Math.Angle.Wrap(angleToTarget - currentAngle));
            return diff <= coneHalfAngle;
        };

        const canAcquire = (marine, enemy, allowAllAround = false) => {
            if (!enemy || !enemy.active || enemy.isDying) return false;
            const dist = Phaser.Math.Distance.Between(marine.x, marine.y, enemy.x, enemy.y);
            if (dist > range) return false;

            // Close-range emergency — always detect enemies within 1.5 tiles regardless of cone
            const emergencyRange = CONFIG.TILE_SIZE * 1.5;
            if (!allowAllAround && dist > emergencyRange && !isWithinFiringCone(marine, enemy.x, enemy.y)) return false;
            
            // LOS and Door check
            if (this.scene.enemyManager.isClosedDoorBetweenWorldPoints(marine.x, marine.y, enemy.x, enemy.y)) return false;
            return this.scene.enemyManager.hasLineOfSight(marine.x, marine.y, enemy.x, enemy.y, range);
        };

        const canFireAt = (marine, tx, ty) => {
            // Line-of-Fire: don't shoot if target is out of cone or behind wall/door
            // Emergency: if multiple enemies < 2 tiles, allow wider cone
            const distToTarget = Phaser.Math.Distance.Between(marine.x, marine.y, tx, ty);
            const emergencyClose = distToTarget < CONFIG.TILE_SIZE * 2;
            const firingCone = emergencyClose ? 1.22 : 0.92; // wider 53° standard, full 70° when close
            if (!isWithinFiringCone(marine, tx, ty, firingCone)) return false;
            if (this.scene.enemyManager.isClosedDoorBetweenWorldPoints(marine.x, marine.y, tx, ty)) return false;
            return this.scene.enemyManager.hasLineOfSight(marine.x, marine.y, tx, ty, range);
        };

        const now = time;
        if (this.sharedMarineContact && (now - this.sharedMarineContact.at > 3000)) {
            this.sharedMarineContact = null;
        }

        let teammateRecentlyAttacked = false;
        let threatenedAlly = null;
        let threatenedAt = -100000;
        let lowestHpAlly = null;
        let lowestHpPct = 1;
        for (const m of marines) {
            const mMax = Math.max(1, Number(m.maxHealth) || 100);
            const mPct = Phaser.Math.Clamp((Number(m.health) || 0) / mMax, 0, 1);
            if (mPct < lowestHpPct) {
                lowestHpPct = mPct;
                lowestHpAlly = m;
            }
            if (!Number.isFinite(m.lastDamagedAt)) continue;
            if ((time - m.lastDamagedAt) <= 1400) {
                teammateRecentlyAttacked = true;
            }
            if ((time - m.lastDamagedAt) <= 1800 && m.lastDamagedAt > threatenedAt) {
                threatenedAt = m.lastDamagedAt;
                threatenedAlly = m;
            }
        }

        for (const follower of marines) {
            if (!follower.roleKey || follower.roleKey === 'leader' || follower.alive === false || follower.active === false) continue;

            const state = this.getFollowerCombatState(follower.roleKey);

            // Skip if busy with other actions and drop stale reservations.
            if (this.scene.doorActionSystem && this.scene.doorActionSystem.isActorBusy(follower)) {
                state.targetRef = null;
                state.burstShotsLeft = 0;
                continue;
            }
            if (this.scene.isMarineTrackerBusy(follower, time)) {
                state.targetRef = null;
                state.burstShotsLeft = 0;
                continue;
            }
            if (this.scene.isMarineHealBusy(follower, time)) {
                state.targetRef = null;
                state.burstShotsLeft = 0;
                continue;
            }

            const profile = this.scene.getFollowerCombatProfile(follower.roleKey);
            const assignedLane = this.scene.getRoleAssignedLane(follower.roleKey, laneDirective);
            const selfRecentlyAttacked = Number.isFinite(follower.lastDamagedAt) && (time - follower.lastDamagedAt <= 1500);
            const maxHp = Math.max(1, Number(follower.maxHealth) || 100);
            const hpPct = Phaser.Math.Clamp((Number(follower.health) || 0) / maxHp, 0, 1);

            const allyRecentlyAttacked = teammateRecentlyAttacked
                && (!Number.isFinite(follower.lastDamagedAt) || (time - follower.lastDamagedAt) > 1500);
            
            let morale = Phaser.Math.Clamp(follower.morale || 0, -100, 100);
            if (morale > 0) morale = Math.max(0, morale - calmPerSec * dtSec);
            else if (morale < 0) morale = Math.min(0, morale + calmPerSec * dtSec);

            if (selfRecentlyAttacked && (time - state.lastSelfShockAt) > 700) {
                morale -= selfHitLoss;
                state.lastSelfShockAt = time;
            }
            if (allyRecentlyAttacked && (time - state.lastMoraleShockAt) > 1100) {
                morale -= allyHitLoss;
                state.lastMoraleShockAt = time;
            }
            if ((time - state.lastThreatPulseAt) > 260) {
                let fearPulse = 0;
                if (hpPct < 0.55) {
                    const lowHpNorm = Phaser.Math.Clamp((0.55 - hpPct) / 0.55, 0, 1);
                    fearPulse += lowHealthPerSec * lowHpNorm * 0.26;
                }
                const swarmNorm = Phaser.Math.Clamp((enemies.length - 2) / 7, 0, 1);
                fearPulse += swarmPerSec * swarmNorm * 0.26;
                if (fearPulse > 0) morale -= fearPulse;
                state.lastThreatPulseAt = time;
            }
            follower.morale = Phaser.Math.Clamp(morale, -100, 100);
            const moralePenalty = Phaser.Math.Clamp((-follower.morale) / 100, 0, 1);
            const moraleBoost = Phaser.Math.Clamp((follower.morale) / 100, 0, 1);
            
            const followerHitChance = this.scene.computeMarineHitChance(follower.roleKey || 'marine', follower, {
                hpPct,
                moralePenalty,
                moraleBoost,
            });
            
            const ammoState = this.scene.marineAmmo.get(follower.roleKey);
            const canFireFollower = () => !!(ammoState && ammoState.currentMag > 0 && !ammoState.isReloading && !ammoState.isOverheated);
            const pulseDefBase = this.scene.weaponManager.getRuntimeWeaponDef('pulseRifle');
            const pulseDef = pulseDefBase ? {
                ...pulseDefBase,
                damage: Math.max(1, Math.round((Number(pulseDefBase.damage) || 1) * (Number(profile.damageMul) || 1))),
            } : null;
            const effectiveFireRate = pulseDefBase
                ? this.scene.weaponManager.getAdjustedFireRate(pulseDefBase, { fireRateMul: profile.fireRateMul })
                : 110;
            let best = state.targetRef && state.targetRef.active ? state.targetRef : null;
            let bestDist = best ? Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y) : Infinity;
            let bestScore = bestDist;
            let bestActualDist = bestDist;

            if (time >= state.nextThinkAt) {
                // Adaptive think speed: faster when threats are nearby
                const nearestEnemyDist = best ? Phaser.Math.Distance.Between(follower.x, follower.y, best.x, best.y) : Infinity;
                const adaptiveThink = nearestEnemyDist < CONFIG.TILE_SIZE * 2 ? 35 : // Emergency: 35ms when very close
                                      nearestEnemyDist < CONFIG.TILE_SIZE * 5 ? 55 : // Alert: 55ms when medium range
                                      thinkIntervalMs; // Standard: 70ms
                state.nextThinkAt = time + adaptiveThink;
                best = null;
                bestDist = Infinity;
                bestScore = Infinity;
                
                const scoreEnemyForRole = (enemy, d) => {
                    let score = d;
                    // Facehuggers are the highest immediate threat — heavily prioritize
                    if (enemy.enemyType === 'facehugger') score -= 300;
                    // Close-range enemies (within 2 tiles) get emergency priority
                    if (d < CONFIG.TILE_SIZE * 2) score -= 150;
                    const dLeader = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.scene.leader.x, this.scene.leader.y);
                    if (assignedLane) {
                        const enemyLane = this.scene.getDirectionBucket(enemy.x, enemy.y);
                        if (enemyLane === assignedLane) score -= follower.roleKey === 'heavy' ? 48 : 34;
                        else score += follower.roleKey === 'heavy' ? 24 : 16;
                    }
                    if (follower.roleKey === 'heavy') {
                        score += dLeader * 0.28;
                        if (enemy.enemyType === 'queen' || enemy.enemyType === 'queenLesser') score -= 64;
                        if (dLeader <= CONFIG.TILE_SIZE * 2.1) score -= 34;
                    } else if (follower.roleKey === 'tech') {
                        if (enemy.engagingDoor === true) score -= 56;
                        if (enemy.enemyType === 'drone') score -= 16;
                    } else if (follower.roleKey === 'medic') {
                        const wounded = lowestHpAlly && lowestHpPct < 0.72 ? lowestHpAlly : null;
                        if (wounded) {
                            const dWounded = Phaser.Math.Distance.Between(enemy.x, enemy.y, wounded.x, wounded.y);
                            score += dWounded * 0.22;
                            if (dWounded <= CONFIG.TILE_SIZE * 2.2) score -= 42;
                        } else {
                            score += 18;
                        }
                        if (d > range * 0.62) score += 24;
                    }
                    if (threatenedAlly && threatenedAlly !== follower) {
                        const dThreatened = Phaser.Math.Distance.Between(enemy.x, enemy.y, threatenedAlly.x, threatenedAlly.y);
                        score += dThreatened * 0.18;
                    }
                    return score;
                };

                // If any marine was recently attacked, allow 360-degree scanning and include undetected enemies
                const reactiveMode = selfRecentlyAttacked || teammateRecentlyAttacked;
                const scanPool = reactiveMode ? allEnemies : enemies;
                for (const enemy of scanPool) {
                    if (!canAcquire(follower, enemy, reactiveMode)) continue;
                    const d = Phaser.Math.Distance.Between(follower.x, follower.y, enemy.x, enemy.y);
                    const scored = scoreEnemyForRole(enemy, d);
                    if (scored < bestScore) {
                        bestScore = scored;
                        best = enemy;
                        bestDist = d;
                        bestActualDist = d;
                    }
                }

                // Focus-fire avoidance: if 2+ followers already target this enemy, try second-best
                if (best) {
                    const focusCount = this._focusFireMap.get(best) || 0;
                    if (focusCount >= 2 && enemies.length > 1) {
                        // Already saturated — skip this target unless it's a facehugger
                        if (best.enemyType !== 'facehugger' && best.enemyType !== 'queen') {
                            // Try to find another viable target
                            let altBest = null;
                            let altBestScore = Infinity;
                            let altBestDist = Infinity;
                            for (const enemy of scanPool) {
                                if (enemy === best) continue;
                                if (!canAcquire(follower, enemy, reactiveMode)) continue;
                                const altFocus = this._focusFireMap.get(enemy) || 0;
                                if (altFocus >= 2) continue;
                                const d = Phaser.Math.Distance.Between(follower.x, follower.y, enemy.x, enemy.y);
                                const scored = scoreEnemyForRole(enemy, d);
                                if (scored < altBestScore) {
                                    altBestScore = scored;
                                    altBest = enemy;
                                    altBestDist = d;
                                }
                            }
                            if (altBest) {
                                best = altBest;
                                bestDist = altBestDist;
                                bestActualDist = altBestDist;
                            }
                        }
                    }
                }
            } else if (best && !canAcquire(follower, best, true)) {
                state.lastKnownX = best.x;
                state.lastKnownY = best.y;
                state.lastKnownAt = time;
                state.suppressionUntil = time + suppressWindowMs;
                best = null;
                state.targetRef = null;
                state.burstShotsLeft = 0;
            }

            if (!best) {
                const hasLastKnown = Number.isFinite(state.lastKnownAt) && (time - state.lastKnownAt) <= suppressWindowMs;
                if (hasLastKnown && Number.isFinite(state.lastKnownX) && Number.isFinite(state.lastKnownY)) {
                    const aimLast = Phaser.Math.Angle.Between(follower.x, follower.y, state.lastKnownX, state.lastKnownY);
                    follower.setDesiredRotation(aimLast);
                    follower.updateRotation(delta, time, { patrol: false });
                    
                    const canSuppress = time <= (state.suppressionUntil || 0);
                    const lastKnownDist = Phaser.Math.Distance.Between(follower.x, follower.y, state.lastKnownX, state.lastKnownY);
                    const closeSuppress = lastKnownDist < CONFIG.TILE_SIZE * 2; // deterministic at close range
                    if (canSuppress && canFireFollower() && time >= state.readyAt && time >= state.nextFireAt && time >= state.jamUntil && (time >= (state.nextSuppressAt || 0))) {
                        // Suppressive fire also checks Line-of-Fire
                        if (canFireAt(follower, state.lastKnownX, state.lastKnownY)) {
                            if (pulseDef) {
                                let shotAngle = aimLast;
                                if (Math.random() > followerHitChance && typeof this.scene.getMissAngleOffset === 'function') {
                                    shotAngle += this.scene.getMissAngleOffset(follower.roleKey || 'marine', followerHitChance);
                                }
                                const fired = this.scene.bulletPool.fire(follower.x, follower.y, shotAngle, time, { ...pulseDef, ownerRoleKey: follower.roleKey });
                                if (fired) {
                                    ammoState.currentMag--;
                                    if (ammoState.displayedAmmo > 15) {
                                        ammoState.displayedAmmo = Math.max(15, ammoState.displayedAmmo - 5);
                                    } else {
                                        ammoState.displayedAmmo = Math.max(0, ammoState.displayedAmmo - Phaser.Math.Between(1, 8));
                                    }
                                    ammoState.lastFiredAt = time;
                                    ammoState.pulseHeat = Math.min(99, (ammoState.pulseHeat || 0) + (Number(profile.heatPerShot) || 9));
                                    if (ammoState.pulseHeat >= 99) {
                                        ammoState.isOverheated = true;
                                        ammoState.overheatCooldownUntil = time + 2000;
                                    }
                                    this.scene.noteGunfireEvent(time);
                                    this.scene.emitWeaponFlashAndStimulus(follower.x, follower.y, aimLast, time, 'pulseRifle', { marine: follower });
                                    state.nextFireAt = time + effectiveFireRate;
                                    state.nextSuppressAt = time + (closeSuppress ? effectiveFireRate : effectiveFireRate * 2.5);
                                    this.scene.hud.refreshNow();
                                }
                            }
                        }
                    }
                    continue;
                }
                state.targetRef = null;
                state.burstShotsLeft = 0;
                const leaderFacing = this.scene.leader?.facingAngle ?? this.scene.leader?.rotation ?? 0;
                const sweepAngle = leaderFacing + state.sweepAnchor + Math.sin(now * 0.0024 + state.sweepPhase) * 0.34;
                follower.setDesiredRotation(sweepAngle);
                follower.updateRotation(delta, time, { patrol: false });
                continue;
            }

            const aim = Phaser.Math.Angle.Between(follower.x, follower.y, best.x, best.y);
            follower.setDesiredRotation(aim);
            // Faster turn speed when enemies are close
            let nearbyThreatCount = 0;
            const threatDistSq = (CONFIG.TILE_SIZE * 3) * (CONFIG.TILE_SIZE * 3);
            for (let ei = 0; ei < allEnemies.length; ei++) {
                const e = allEnemies[ei];
                if (!e?.active || e.isDying) continue;
                const edx = follower.x - e.x, edy = follower.y - e.y;
                if (edx * edx + edy * edy < threatDistSq) nearbyThreatCount++;
            }
            const turnBoost = nearbyThreatCount >= 3 ? { turnSpeedMul: 1.6 } : {};
            follower.updateRotation(delta, time, { patrol: false, ...turnBoost });

            // Reaction delay — apply when acquiring a NEW target
            const isNewTarget = best !== state.targetRef;
            if (isNewTarget) {
                state.readyAt = time + profile.reactionMs * (combatMods.marineReactionMul || 1);
                state.burstShotsLeft = 0; // Reset burst for new engagement
                // Emit callout for new contact
                this._emitCallout(follower, best, time);
            }
            state.targetRef = best;
            state.lastKnownX = best.x;
            state.lastKnownY = best.y;
            state.lastKnownAt = now;

            // Close-range evasion: signal follower to backstep when alien is within 1 tile
            if (best && bestActualDist < CONFIG.TILE_SIZE * 1.2 && follower.active) {
                const evadeAngle = Phaser.Math.Angle.Between(best.x, best.y, follower.x, follower.y);
                follower._evadeHintAngle = evadeAngle;
                follower._evadeHintUntil = time + 300;
            }

            if (time < state.readyAt || time < state.nextFireAt || time < state.jamUntil || time < (state.burstRecoverUntil || 0)) continue;

            // Tactical reload — delay if enemies within 2 tiles, force after 1.8s dry
            const magEmpty = ammoState && ammoState.currentMag <= 0;
            if (magEmpty && !ammoState.isReloading && ammoState.magsLeft > 0) {
                let nearestThreatDist = Infinity;
                for (const e of allEnemies) {
                    if (!e || !e.active || e.isDying) continue;
                    const d = Phaser.Math.Distance.Between(follower.x, follower.y, e.x, e.y);
                    if (d < nearestThreatDist) nearestThreatDist = d;
                }
                const emergencyReload = (time - (ammoState.lastFiredAt || 0)) > 1800;
                if (nearestThreatDist > CONFIG.TILE_SIZE * 3 || emergencyReload) {
                    ammoState.isReloading = true;
                    ammoState.reloadUntil = time + 2400;
                    ammoState.displayedAmmo = 0;
                    this.scene.hud.refreshNow();
                    continue;
                }
            }

            if (!canFireFollower()) continue;

            // FINAL STRICT CHECK BEFORE FIRING
            if (canFireAt(follower, best.x, best.y)) {
                // Initialize burst if not active
                if (state.burstShotsLeft <= 0) {
                    state.burstShotsLeft = Phaser.Math.Between(profile.burstMin, profile.burstMax);
                }

                let shotAngle = aim;
                if (Math.random() > followerHitChance && typeof this.scene.getMissAngleOffset === 'function') {
                    shotAngle += this.scene.getMissAngleOffset(follower.roleKey || 'marine', followerHitChance);
                }
                const fired = pulseDef
                    ? this.scene.bulletPool.fire(follower.x, follower.y, shotAngle, time, { ...pulseDef, ownerRoleKey: follower.roleKey })
                    : false;
                if (fired) {
                    ammoState.currentMag--;
                    if (ammoState.displayedAmmo > 15) {
                        ammoState.displayedAmmo = Math.max(15, ammoState.displayedAmmo - 5);
                    } else {
                        ammoState.displayedAmmo = Math.max(0, ammoState.displayedAmmo - Phaser.Math.Between(1, 8));
                    }
                    ammoState.lastFiredAt = time;
                    ammoState.pulseHeat = Math.min(99, (ammoState.pulseHeat || 0) + (Number(profile.heatPerShot) || 9));
                    if (ammoState.pulseHeat >= 99) {
                        ammoState.isOverheated = true;
                        ammoState.overheatCooldownUntil = time + 2000;
                    }
                    this.scene.noteGunfireEvent(time);
                    this.scene.emitWeaponFlashAndStimulus(follower.x, follower.y, aim, time, 'pulseRifle', { marine: follower });
                    state.nextFireAt = time + effectiveFireRate;
                    this.scene.hud.refreshNow();
                    this.scene?.eventBus?.emit('followerFired', { roleKey: follower.roleKey, x: follower.x, y: follower.y, targetType: best?.enemyType });

                    // Burst tracking — pause between bursts for tactical rhythm
                    state.burstShotsLeft--;
                    if (state.burstShotsLeft <= 0) {
                        state.burstRecoverUntil = time + Phaser.Math.Between(profile.burstPauseMinMs, profile.burstPauseMaxMs);
                    }

                    const jamChance = Phaser.Math.Clamp(
                        (moralePenalty * 0.25 + (selfRecentlyAttacked ? 0.15 : 0)) * (Number(profile.jamSensitivity) || 1) * combatMods.marineJamMul,
                        0, 0.5
                    );
                    if (Math.random() < jamChance) {
                        state.jamUntil = time + Phaser.Math.Between(1000, 2000);
                        follower.morale -= 5;
                    }
                }
            }
        }
    }

    /**
     * Emit a squad callout event when a follower spots a new threat.
     * Provides direction-based text callouts for movie-accurate feel.
     */
    _emitCallout(follower, enemy, time) {
        if (!follower || !enemy || !this.scene) return;
        // Throttle callouts — max one per 2.5s across all followers
        if ((time - (this._lastCalloutAt || 0)) < 2500) return;
        this._lastCalloutAt = time;

        const leader = this.scene.leader;
        if (!leader) return;
        const angleToEnemy = Phaser.Math.Angle.Between(leader.x, leader.y, enemy.x, enemy.y);
        const leaderFacing = leader.facingAngle ?? leader.rotation ?? 0;
        const relAngle = Phaser.Math.Angle.Wrap(angleToEnemy - leaderFacing);

        let direction;
        if (Math.abs(relAngle) < Math.PI * 0.375) direction = 'ahead';
        else if (Math.abs(relAngle) > Math.PI * 0.625) direction = 'behind';
        else if (relAngle > 0) direction = 'right';
        else direction = 'left';

        let callType = 'contact';
        if (enemy.enemyType === 'facehugger') callType = 'facehugger';
        else if (enemy.enemyType === 'queen' || enemy.enemyType === 'queenLesser') callType = 'queen';

        const dist = Phaser.Math.Distance.Between(follower.x, follower.y, enemy.x, enemy.y);
        const close = dist < CONFIG.TILE_SIZE * 3;

        if (typeof this.scene.onMarineCallout === 'function') {
            this.scene.onMarineCallout({
                roleKey: follower.roleKey,
                callType,
                direction,
                close,
                enemyType: enemy.enemyType,
                time,
            });
        }
        this.scene?.eventBus?.emit('marineCallout', {
            roleKey: follower.roleKey,
            callType,
            direction,
            close,
            enemyType: enemy.enemyType,
            time,
        });
    }
}
