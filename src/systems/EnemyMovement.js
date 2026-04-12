import { CONFIG } from '../config.js';

export class EnemyMovement {
    constructor(manager) {
        this.manager = manager;
        this.scene = manager.scene;
        this._pathBudgetPerFrame = 4;
        this._pathsThisFrame = 0;
    }

    computeAggroVelocity(enemy, target, marines) {
        if (!enemy || !target) return { vx: 0, vy: 0 };
        const finalAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        const speed = enemy.stats.speed;
        // Strong separation keeps swarms from stacking while preserving direct pursuit.
        let sepX = 0;
        let sepY = 0;
        const separationRadius = enemy.stats.separationRadius || 48;
        const sepR2 = separationRadius * separationRadius;
        const activeEnemies = this.manager.getActiveEnemies();
        for (const other of activeEnemies) {
            if (other === enemy) continue;
            const dx = enemy.x - other.x;
            const dy = enemy.y - other.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= 0.0001 || d2 > sepR2) continue;
            const d = Math.sqrt(d2);
            const overlap = separationRadius - d;
            const force = overlap * 16.5;
            sepX += (dx / d) * force;
            sepY += (dy / d) * force;
        }

        // Let melee behavior control close-range spacing. Constant repulsion here
        // makes warriors and drones stutter instead of pressing the attack.
        let meleeRepX = 0;
        let meleeRepY = 0;
        const tDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const meleeRepRadius = CONFIG.TILE_SIZE * 0.75;
        if (enemy.enemyType === 'facehugger' && tDist < meleeRepRadius && tDist > 0.0001) {
            const awayX = (enemy.x - target.x) / tDist;
            const awayY = (enemy.y - target.y) / tDist;
            const overlap = meleeRepRadius - tDist;
            const repForce = overlap * 14.0;
            meleeRepX = awayX * repForce;
            meleeRepY = awayY * repForce;
        }

        const propAvoid = this.computePropAvoidance(enemy, 54);
        // Facehuggers slip under walls — no wall avoidance steering
        const wallAvoid = enemy.enemyType === 'facehugger'
            ? { vx: 0, vy: 0 }
            : this.computeWallClearanceAvoidance(enemy, 2);
        const corpseAvoid = this.computeCorpseAvoidance(enemy, 72);

        // Snake-like pursuit: lighter lateral weave and slightly higher forward
        // drive so aliens feel fast and fluid rather than side-slipping.
        let snakeX = 0;
        let snakeY = 0;
        if (enemy._snakePhase == null) {
            enemy._snakePhase = Math.random() * Math.PI * 2;
            enemy._snakeFreq = 1.8 + Math.random() * 1.0;
        }
        const meleeRange = CONFIG.TILE_SIZE * 2;
        if (tDist > meleeRange) {
            const now = this.scene?.time?.now || 0;
            const farBlend = Phaser.Math.Clamp((tDist - meleeRange) / (CONFIG.TILE_SIZE * 4.5), 0, 1);
            const amplitude = Phaser.Math.Linear(12, 28, farBlend);
            const perpAngle = finalAngle + Math.PI * 0.5;
            const wave = Math.sin(now * 0.001 * enemy._snakeFreq * Math.PI * 2 + enemy._snakePhase) * amplitude;
            snakeX = Math.cos(perpAngle) * wave;
            snakeY = Math.sin(perpAngle) * wave;
        }

        const forwardMul = tDist > meleeRange ? 1.08 : 1.0;
        return {
            vx: Math.cos(finalAngle) * speed * forwardMul + sepX + meleeRepX + propAvoid.vx + wallAvoid.vx + corpseAvoid.vx + snakeX,
            vy: Math.sin(finalAngle) * speed * forwardMul + sepY + meleeRepY + propAvoid.vy + wallAvoid.vy + corpseAvoid.vy + snakeY,
        };
    }

    computePatrolVelocity(enemy) {
        const now = this.scene.time.now;
        if (!enemy.patrolTarget || Phaser.Math.Distance.Between(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y) <= 12) {
            enemy.patrolTarget = this.manager.pickPatrolTarget(enemy);
            if (!enemy.patrolTarget) return { vx: 0, vy: 0 };
        }
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y);
        const wobble = Math.sin(now * 0.003 + (enemy.patternSeed || 0) * 5.6) * 0.18;
        const driftAngle = angle + wobble;
        const propAvoid = this.computePropAvoidance(enemy, 56);
        const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
        const corpseAvoid = this.computeCorpseAvoidance(enemy, 72);
        const patrolMul = enemy.enemyType === 'warrior' ? 0.95 : 0.72;
        return {
            vx: Math.cos(driftAngle) * enemy.stats.speed * patrolMul + propAvoid.vx + wallAvoid.vx + corpseAvoid.vx,
            vy: Math.sin(driftAngle) * enemy.stats.speed * patrolMul + propAvoid.vy + wallAvoid.vy + corpseAvoid.vy,
        };
    }

    computeInvestigateVelocity(enemy, point, time) {
        const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, point.x, point.y);
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, point.x, point.y);
        if (dist <= 24) {
            const orbitDir = enemy.swarmSide || 1;
            const wobble = Math.sin(time * 0.009 + enemy.patternSeed) * 0.35;
            const searchA = a + orbitDir * (Math.PI * 0.5 + wobble);
            const s = enemy.stats.speed * (enemy.enemyType === 'warrior' ? 0.84 : 0.62);
            const propAvoid = this.computePropAvoidance(enemy, 52);
            const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
            const corpseAvoid = this.computeCorpseAvoidance(enemy, 72);
            return {
                vx: Math.cos(searchA) * s + propAvoid.vx + wallAvoid.vx + corpseAvoid.vx,
                vy: Math.sin(searchA) * s + propAvoid.vy + wallAvoid.vy + corpseAvoid.vy,
            };
        }
        const s = enemy.stats.speed * (enemy.enemyType === 'warrior' ? 1.04 : 0.9);
        const propAvoid = this.computePropAvoidance(enemy, 52);
        const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
        const corpseAvoid = this.computeCorpseAvoidance(enemy, 72);
        return {
            vx: Math.cos(a) * s + propAvoid.vx + wallAvoid.vx + corpseAvoid.vx,
            vy: Math.sin(a) * s + propAvoid.vy + wallAvoid.vy + corpseAvoid.vy,
        };
    }

    computePropAvoidance(enemy, radius = 56) {
        if (!enemy) return { vx: 0, vy: 0 };
        // Cache for ~4 frames (67ms at 60fps) to avoid per-frame prop iteration.
        const now = this.scene?.time?.now || 0;
        if (enemy._propAvoidAt && now < enemy._propAvoidAt && enemy._propAvoidCache) {
            return enemy._propAvoidCache;
        }
        const props = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        if (props.length <= 0) {
            enemy._propAvoidAt = now + 67;
            enemy._propAvoidCache = { vx: 0, vy: 0 };
            return enemy._propAvoidCache;
        }
        const r = Math.max(24, Number(radius) || 56);
        const r2 = r * r;
        let vx = 0;
        let vy = 0;
        let n = 0;
        const targetX = Number(enemy.navRecoverTargetX) || enemy.x;
        const targetY = Number(enemy.navRecoverTargetY) || enemy.y;
        const toTargetA = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
        const orbitSide = Number(enemy.swarmSide) || (Math.random() < 0.5 ? -1 : 1);
        for (const p of props) {
            if (p?.blocksPath === false) continue;
            const s = p?.sprite;
            if (!s || s.active === false) continue;
            const propRadius = Math.max(12, Number(p?.radius) || 18);
            const dx = enemy.x - s.x;
            const dy = enemy.y - s.y;
            const d2 = dx * dx + dy * dy;
            const softR = r + propRadius;
            const softR2 = softR * softR;
            if (d2 <= 0.0001 || d2 > softR2) continue;
            const d = Math.sqrt(d2);
            const near = Phaser.Math.Clamp((softR - d) / softR, 0, 1);
            let strength = near * near * 136;
            const overlapBand = propRadius + Math.max(12, enemy.body?.halfWidth || 10);
            if (d < overlapBand) {
                // Strong eject force when body is overlapping a prop to prevent lock-ups.
                strength *= 2.2;
            }
            vx += (dx / d) * strength;
            vy += (dy / d) * strength;
            // Tangential steering helps units slide around props instead of pinning against them.
            const propAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, s.x, s.y);
            const headingToProp = Math.abs(Phaser.Math.Angle.Wrap(propAngle - toTargetA));
            if (headingToProp < Phaser.Math.DegToRad(48)) {
                const tangentA = propAngle + orbitSide * Math.PI * 0.5;
                const tangentBoost = near * near * 82;
                vx += Math.cos(tangentA) * tangentBoost;
                vy += Math.sin(tangentA) * tangentBoost;
            }
            n++;
        }
        let result;
        if (n <= 0) {
            result = { vx: 0, vy: 0 };
        } else {
            // Sum forces (not average) so multiple nearby props push harder.
            // Cap total magnitude to prevent jitter when surrounded.
            const mag = Math.sqrt(vx * vx + vy * vy);
            const maxForce = 280;
            if (mag > maxForce) {
                vx = (vx / mag) * maxForce;
                vy = (vy / mag) * maxForce;
            }
            result = { vx, vy };
        }
        enemy._propAvoidAt = now + 67;
        enemy._propAvoidCache = result;
        return result;
    }

    computeWallClearanceAvoidance(enemy, radiusTiles = 2) {
        if (!enemy || !this.scene?.pathGrid) return { vx: 0, vy: 0 };
        // Cache result per enemy for ~5 frames to avoid per-frame grid sampling.
        const now = this.scene.time?.now || 0;
        if (enemy._wallAvoidAt && now < enemy._wallAvoidAt && enemy._wallAvoidCache) {
            return enemy._wallAvoidCache;
        }
        const grid = this.scene.pathGrid;
        const center = grid.worldToTile(enemy.x, enemy.y);
        const maxR = Math.max(1, Number(radiusTiles) || 2);
        const maxDist = (maxR + 0.5) * CONFIG.TILE_SIZE;
        const maxDist2 = maxDist * maxDist;
        let vx = 0;
        let vy = 0;
        let n = 0;
        for (let dy = -maxR; dy <= maxR; dy++) {
            for (let dx = -maxR; dx <= maxR; dx++) {
                if (dx === 0 && dy === 0) continue;
                const tx = center.x + dx;
                const ty = center.y + dy;
                if (grid.isWalkable(tx, ty)) continue;
                const blockWorld = grid.tileToWorld(tx, ty);
                const ax = enemy.x - blockWorld.x;
                const ay = enemy.y - blockWorld.y;
                const d2 = ax * ax + ay * ay;
                if (d2 <= 0.0001 || d2 >= maxDist2) continue;
                const d = Math.sqrt(d2);
                const near = Phaser.Math.Clamp((maxDist - d) / maxDist, 0, 1);
                const strength = near * near * (enemy.enemyType === 'warrior' ? 190 : 150);
                vx += (ax / d) * strength;
                vy += (ay / d) * strength;
                n++;
            }
        }
        let result;
        if (n <= 0) {
            result = { vx: 0, vy: 0 };
        } else {
            // Sum forces (not average) so corners push harder than single walls.
            // Cap total magnitude to prevent vibration.
            const mag = Math.sqrt(vx * vx + vy * vy);
            const maxForce = 340;
            if (mag > maxForce) {
                vx = (vx / mag) * maxForce;
                vy = (vy / mag) * maxForce;
            }
            result = { vx, vy };
        }
        // Cache for ~5 frames (83ms at 60fps).
        enemy._wallAvoidAt = now + 83;
        enemy._wallAvoidCache = result;
        return result;
    }

    computeCorpseAvoidance(enemy, radius = 72) {
        if (!enemy) return { vx: 0, vy: 0 };
        const now = this.scene?.time?.now || 0;
        if (enemy._corpseAvoidAt && now < enemy._corpseAvoidAt && enemy._corpseAvoidCache) {
            return enemy._corpseAvoidCache;
        }
        const dyingEnemies = this.manager._dyingEnemies;
        if (!dyingEnemies || dyingEnemies.length === 0) {
            const zero = { vx: 0, vy: 0 };
            enemy._corpseAvoidAt = now + 200;
            enemy._corpseAvoidCache = zero;
            return zero;
        }
        const r2 = radius * radius;
        let vx = 0;
        let vy = 0;
        for (const corpse of dyingEnemies) {
            if (!corpse) continue;
            const dx = enemy.x - corpse.x;
            const dy = enemy.y - corpse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= 0.0001 || d2 > r2) continue;
            const d = Math.sqrt(d2);
            const near = (radius - d) / radius;
            const strength = near * near * 60;
            vx += (dx / d) * strength;
            vy += (dy / d) * strength;
        }
        const result = { vx, vy };
        enemy._corpseAvoidAt = now + 200;
        enemy._corpseAvoidCache = result;
        return result;
    }

    updateWarriorIntent(enemy, target, time, pressure = 0.3, focusCount = 1) {
        if (enemy.enemyType !== 'warrior' || !target) return;
        if (time < enemy.nextIntentAt) return;
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const targetHpPct = Phaser.Math.Clamp((Number(target.health) || 0) / Math.max(1, Number(target.maxHealth) || 100), 0, 1);
        const enemyHpPct = Phaser.Math.Clamp((Number(enemy.health) || 0) / Math.max(1, Number(enemy.maxHealth) || 100), 0, 1);
        const _diff2 = String(this.scene.activeMission?.difficulty || 'normal').toLowerCase();
        const rushCap = (_diff2 === 'normal') ? 2 : 3;
        const cachedActive = this.manager.getActiveEnemies();

        // Enable damage-based retreat and distant probing
        const meleeRange = CONFIG.TILE_SIZE * 1.6;
        const aggroRange = enemy.stats?.aggroRange || (CONFIG.TILE_SIZE * 10);
        let intent = 'assault';

        // Count nearby allies for coordinated behavior
        let nearbyAllies = 0;
        for (const e of cachedActive) {
            if (e !== enemy && e.enemyType === 'warrior' && e.intent === 'assault' &&
                Phaser.Math.Distance.Between(e.x, e.y, enemy.x, enemy.y) < CONFIG.TILE_SIZE * 6) nearbyAllies++;
        }

        if (enemyHpPct < 0.25) {
            // Low health — retreat briefly, then force back to assault after cap expires
            if (nearbyAllies >= 2) {
                intent = 'assault';
            } else if (enemy.retreatStartedAt && (time - enemy.retreatStartedAt) > Phaser.Math.Between(3500, 5500)) {
                // Retreat timed out — wounded alien re-engages
                intent = 'assault';
                enemy.retreatStartedAt = null;
            } else {
                intent = 'retreat';
                if (!enemy.retreatStartedAt) enemy.retreatStartedAt = time;
            }
        } else if (dist > aggroRange * 0.85 && focusCount <= 1) {
            // Far away with low attention — probe cautiously
            intent = 'probe';
        } else if (dist < meleeRange * 2.5 || focusCount >= 2 || pressure > 0.65) {
            intent = 'assault';
        } else if (dist > CONFIG.TILE_SIZE * 5.8) {
            intent = 'flank';
        } else if (focusCount >= rushCap && dist > meleeRange) {
            intent = 'flank';
        } else {
            // Pack coordination: if allies are flanking, assault; if allies assault, flank
            let alliesAssaulting = 0;
            for (const e of cachedActive) {
                if (e !== enemy && e.enemyType === 'warrior' && e.intent === 'assault' &&
                    Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y) < CONFIG.TILE_SIZE * 5) alliesAssaulting++;
            }
            if (alliesAssaulting >= 2) {
                intent = 'flank'; // Diversify attack angles when pack is pushing
            } else {
                const flankChance = 0.36 + (1 - pressure) * 0.3;
                intent = Math.random() < flankChance ? 'flank' : 'assault';
            }
        }

        enemy.intent = intent;
        enemy.nextIntentAt = time + Phaser.Math.Between(650, 1250);
        // Clear retreat timer when no longer retreating
        if (intent !== 'retreat') enemy.retreatStartedAt = null;
    }

    applyWarriorIntent(enemy, target, desired, _mods, _focusCount = 1) {
        if (enemy.enemyType !== 'warrior' || !target || !desired) return desired;

        if (enemy.intent === 'flank') {
            const directAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
            // Adaptive flanking: choose the side with fewer marines covering
            let side = enemy.swarmSide || 1;
            const marines = this.scene?.squadSystem?.getAllMarines?.() || [];
            if (marines.length > 1) {
                // Count marines on each side relative to the alien's approach vector
                let leftCount = 0, rightCount = 0;
                for (const m of marines) {
                    if (!m?.active || m.alive === false) continue;
                    const mAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, m.x, m.y);
                    const diff = Phaser.Math.Angle.Wrap(mAngle - directAngle);
                    if (diff > 0) rightCount++; else leftCount++;
                }
                // Flank toward the less-defended side
                side = leftCount <= rightCount ? -1 : 1;
            }
            // Offset 60-90 degrees to create a curved flanking arc
            const offsetDeg = 60 + (enemy.patternSeed || 0) / (Math.PI * 2) * 30; // 60-90 range
            const offsetRad = Phaser.Math.DegToRad(offsetDeg) * side;
            // Blend from full offset at range to zero offset at melee distance
            const blendFar = Phaser.Math.Clamp((dist - CONFIG.TILE_SIZE * 1.6) / (CONFIG.TILE_SIZE * 4), 0, 1);
            const flankAngle = directAngle + offsetRad * blendFar;
            const speed = enemy.stats.speed * 1.05; // slightly faster on flanks
            const propAvoid = this.computePropAvoidance(enemy, 54);
            const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
            const raw = {
                vx: Math.cos(flankAngle) * speed + propAvoid.vx + wallAvoid.vx,
                vy: Math.sin(flankAngle) * speed + propAvoid.vy + wallAvoid.vy,
            };
            const blend = 0.78;
            const prevVx = enemy.prevVx || raw.vx;
            const prevVy = enemy.prevVy || raw.vy;
            return {
                vx: prevVx + (raw.vx - prevVx) * blend,
                vy: prevVy + (raw.vy - prevVy) * blend,
            };
        }

        // Probe: cautious approach — orbit at distance
        if (enemy.intent === 'probe') {
            return this.computeProbeVelocity(enemy, target);
        }

        // Retreat: disengage when low health
        if (enemy.intent === 'retreat') {
            const retreatPressure = Number(_mods?.pressure) || 0;
            return this.computeRetreatVelocity(enemy, target, retreatPressure);
        }

        // Assault: direct aggressive rush toward target with obstacle avoidance.
        // 'breach' (written by EnemyManager during door siege) uses the same movement
        // so it receives velocity smoothing instead of falling through to `return desired`.
        if (enemy.intent === 'assault' || enemy.intent === 'breach' || !enemy.intent) {
            const directAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            // Apply assault lane offset to spread attack vectors across the pack
            const laneOffset = enemy.assaultLaneAngle || 0;
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
            const laneBlend = Phaser.Math.Clamp((dist - CONFIG.TILE_SIZE * 1.5) / (CONFIG.TILE_SIZE * 4), 0, 1);
            const assaultAngle = directAngle + laneOffset * laneBlend;
            const speed = enemy.stats.speed * 1.1; // slightly faster when assaulting
            const propAvoid = this.computePropAvoidance(enemy, 54);
            const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
            const raw = {
                vx: Math.cos(assaultAngle) * speed + propAvoid.vx + wallAvoid.vx,
                vy: Math.sin(assaultAngle) * speed + propAvoid.vy + wallAvoid.vy,
            };
            // Smooth velocity transitions to prevent jittery direction changes
            const blend = 0.82;
            const prevVx = enemy.prevVx || raw.vx;
            const prevVy = enemy.prevVy || raw.vy;
            return {
                vx: prevVx + (raw.vx - prevVx) * blend,
                vy: prevVy + (raw.vy - prevVy) * blend,
            };
        }

        return desired;
    }

    computeProbeVelocity(enemy, probePoint) {
        if (!enemy || !probePoint) return { vx: 0, vy: 0 };
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, probePoint.x, probePoint.y);
        const directAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, probePoint.x, probePoint.y);
        const side = enemy.swarmSide || 1;
        const now = this.scene?.time?.now || 0;
        // Circle at 2-3 tile distance — orbit perpendicular to target with wobble
        const orbitAngle = directAngle + side * (Math.PI * 0.5) + Math.sin(now * 0.004 + (enemy.patternSeed || 0)) * 0.3;
        const idealDist = CONFIG.TILE_SIZE * 2.5;
        // Radial correction: push out if too close, pull in if too far
        const radialCorrection = (dist - idealDist) / idealDist;
        const radialWeight = Phaser.Math.Clamp(Math.abs(radialCorrection) * 0.6, 0, 0.5);
        const moveAngle = radialCorrection > 0
            ? Phaser.Math.Linear(orbitAngle, directAngle, radialWeight) // too far — drift inward
            : Phaser.Math.Linear(orbitAngle, directAngle + Math.PI, radialWeight); // too close — drift outward
        const speed = enemy.stats.speed * 0.68;
        const propAvoid = this.computePropAvoidance(enemy, 54);
        const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
        return {
            vx: Math.cos(moveAngle) * speed + propAvoid.vx + wallAvoid.vx,
            vy: Math.sin(moveAngle) * speed + propAvoid.vy + wallAvoid.vy,
        };
    }

    computeRetreatVelocity(enemy, target, pressure = 0) {
        if (!enemy || !target) return { vx: 0, vy: 0 };
        const awayAngle = Phaser.Math.Angle.Between(target.x, target.y, enemy.x, enemy.y);
        // Regroup: retreat toward nearest healthy ally if one exists within 8 tiles
        const allies = this.manager.getActiveEnemies().filter(e =>
            e !== enemy && e.enemyType === 'warrior' && !e.isDying &&
            (e.health / Math.max(1, e.maxHealth)) > 0.4
        );
        let retreatAngle = awayAngle;
        if (allies.length > 0) {
            let bestAlly = null, bestDist = Infinity;
            for (const ally of allies) {
                const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, ally.x, ally.y);
                if (d < bestDist && d < CONFIG.TILE_SIZE * 8 && d > CONFIG.TILE_SIZE * 1.5) {
                    bestDist = d; bestAlly = ally;
                }
            }
            if (bestAlly) {
                const allyAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, bestAlly.x, bestAlly.y);
                // Pressure-sensitive retreat: higher pressure → more away, less regroup
                const awayWeight = Phaser.Math.Linear(0.55, 0.88, Phaser.Math.Clamp(pressure, 0, 1));
                // Use angular interpolation to avoid ±π wrap artefacts
                const angleDiff = Phaser.Math.Angle.Wrap(allyAngle - awayAngle);
                retreatAngle = awayAngle + angleDiff * (1 - awayWeight);
            }
        }
        // Add slight lateral drift so retreat isn't a straight line
        const side = enemy.swarmSide || 1;
        const drift = side * 0.25;
        retreatAngle += drift;
        const speed = enemy.stats.speed * 0.78;
        const propAvoid = this.computePropAvoidance(enemy, 58);
        const wallAvoid = this.computeWallClearanceAvoidance(enemy, 2);
        return {
            vx: Math.cos(retreatAngle) * speed + propAvoid.vx + wallAvoid.vx,
            vy: Math.sin(retreatAngle) * speed + propAvoid.vy + wallAvoid.vy,
        };
    }

    applyMeleeSpacing(enemy, target, desired, time, pressure = 0.3) {
        if (!enemy || !target || !desired) return { desired, nearDoor: false, doorDist: Infinity, doorGroup: null };
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const nearDoor = this.manager.findNearbyBlockingDoor(enemy.x, enemy.y, CONFIG.TILE_SIZE * 1.4);
        const isBypassing = nearDoor && !nearDoor.group.isPassable;

        // ── Attack leap for non-facehugger melee enemies ─────────────────────
        // A short committed jump keeps them aggressive and prevents the old
        // walk-stop-walk rhythm while closing.
        if (enemy.enemyType !== 'facehugger' && enemy.enemyType !== 'egg' && !isBypassing) {
            const leapMinDist = CONFIG.TILE_SIZE * 1.8;
            const leapMaxDist = CONFIG.TILE_SIZE * 5.4;
            const leapChance = enemy.enemyType === 'warrior'
                ? 0.18
                : (enemy.enemyType === 'drone' ? 0.16 : 0.12);

            if (enemy._attackLeapUntil && time < enemy._attackLeapUntil) {
                const s = enemy.stats.speed * 2.15;
                desired = {
                    vx: Math.cos(enemy._attackLeapAngle) * s,
                    vy: Math.sin(enemy._attackLeapAngle) * s,
                };
                if (dist <= CONFIG.TILE_SIZE * 1.5) {
                    enemy._attackLeapUntil = 0;
                    enemy._swipeState = 'bounce';
                    enemy._swipeNextAt = time + Phaser.Math.Between(100, 180);
                }
                return { desired, nearDoor: !!nearDoor, doorDist: nearDoor ? nearDoor.dist : Infinity, doorGroup: nearDoor ? nearDoor.group : null };
            }

            if (dist >= leapMinDist && dist <= leapMaxDist
                && time >= (enemy._nextAttackLeap || 0)
                && !enemy._attackLeapUntil
                && Math.random() < leapChance) {
                enemy._attackLeapAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
                enemy._attackLeapUntil = time + Phaser.Math.Between(180, 280);
                enemy._nextAttackLeap = time + Phaser.Math.Between(1500, 3200);
                const s = enemy.stats.speed * 2.15;
                desired = {
                    vx: Math.cos(enemy._attackLeapAngle) * s,
                    vy: Math.sin(enemy._attackLeapAngle) * s,
                };
                return { desired, nearDoor: !!nearDoor, doorDist: nearDoor ? nearDoor.dist : Infinity, doorGroup: nearDoor ? nearDoor.group : null };
            }
        }

        const meleeStrikeRange = CONFIG.TILE_SIZE * 1.22;
        const meleeHoldRange = CONFIG.TILE_SIZE * 1.6;
        const meleeEngageRange = CONFIG.TILE_SIZE * 2.2;
        const inMeleeZone = dist <= meleeEngageRange && !isBypassing;

        if (inMeleeZone) {
            const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);

            if (!enemy._swipeState) {
                enemy._swipeState = 'lunge';
                enemy._swipeNextAt = 0;
            }

            if (enemy._swipeState === 'lunge') {
                const lungeSpeed = enemy.stats.speed * (dist <= meleeHoldRange ? 0.92 : 1.28);
                desired = {
                    vx: Math.cos(angle) * lungeSpeed,
                    vy: Math.sin(angle) * lungeSpeed,
                };
                if (dist <= meleeStrikeRange) {
                    enemy._swipeState = 'bounce';
                    enemy._swipeNextAt = time + Phaser.Math.Between(110, 180);
                    const side = enemy.swarmSide || 1;
                    enemy._swipeRetreatAngle = angle + Math.PI + side * Phaser.Math.FloatBetween(0.22, 0.44);
                }
            } else if (enemy._swipeState === 'bounce') {
                const bounceAngle = enemy._swipeRetreatAngle || (angle + Math.PI);
                const bounceSpeed = enemy.stats.speed * 0.78;
                const lateralAngle = bounceAngle + (enemy.swarmSide || 1) * Phaser.Math.FloatBetween(0.12, 0.22);
                desired = {
                    vx: Math.cos(bounceAngle) * bounceSpeed + Math.cos(lateralAngle) * enemy.stats.speed * 0.22,
                    vy: Math.sin(bounceAngle) * bounceSpeed + Math.sin(lateralAngle) * enemy.stats.speed * 0.22,
                };
                if (time >= enemy._swipeNextAt) {
                    enemy._swipeState = 'lunge';
                    enemy._swipeNextAt = 0;
                }
            }
        } else {
            enemy._swipeState = null;
        }

        return {
            desired,
            nearDoor: !!nearDoor,
            doorDist: nearDoor ? nearDoor.dist : Infinity,
            doorGroup: nearDoor ? nearDoor.group : null,
        };
    }

    updateFacehugger(enemy, target, time, dt) {
        if (!enemy || !target || enemy.enemyType !== 'facehugger') return false;
        enemy.latchTarget = null;

        // Cache live target so sub-state helpers can use it after it goes out of scope.
        if (target && target.active) enemy._flankTarget = target;

        // ── Flank state machine (flee off-screen → wait → teleport-flank) ──
        if (enemy.flankState === 'flee')  return this._fhFlee(enemy, time);
        if (enemy.flankState === 'wait')  return this._fhWait(enemy, time);

        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        const leapRange = CONFIG.TILE_SIZE * 2.2; // ~2 tiles — leap from close range

        // ── Normal short retreat (chaotic flee) ─────────────────────────────
        if (time < (enemy.retreatUntil || 0)) {
            const tx = Number.isFinite(enemy.retreatTargetX) ? enemy.retreatTargetX : (enemy.x + Math.cos(enemy.retreatAngle || 0) * CONFIG.TILE_SIZE * 2);
            const ty = Number.isFinite(enemy.retreatTargetY) ? enemy.retreatTargetY : (enemy.y + Math.sin(enemy.retreatAngle || 0) * CONFIG.TILE_SIZE * 2);
            const retreatA = Phaser.Math.Angle.Between(enemy.x, enemy.y, tx, ty);
            const retreatDist = Phaser.Math.Distance.Between(enemy.x, enemy.y, tx, ty);
            // Flee as fast as possible with erratic jitter
            const retreatSpeed = enemy.stats.speed * 2.4;
            const jitter = Phaser.Math.FloatBetween(-0.4, 0.4);
            const fleeA = retreatA + jitter;
            this._fhApplyDrift(enemy, fleeA, retreatSpeed, dt);
            if (retreatDist <= 16) {
                enemy.retreatUntil = time;
                enemy.nextLeapAt = Math.max(enemy.nextLeapAt || 0, time + Phaser.Math.Between(400, 700));
            }
            return true;
        }

        // ── Pre-leap telegraph (windup before leap) ──────────────────────────
        if (enemy._preLeapUntil && time < enemy._preLeapUntil) {
            // Slow to 20% speed and crouch during telegraph
            const slowA = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            const slowSpeed = enemy.stats.speed * 0.2;
            enemy.body.setVelocity(Math.cos(slowA) * slowSpeed, Math.sin(slowA) * slowSpeed);
            enemy.setRotation(slowA);
            enemy.setScale(enemy.baseScale * 0.85);
            return true;
        }
        // Telegraph finished — execute the committed leap
        if (enemy._preLeapUntil && time >= enemy._preLeapUntil) {
            enemy._preLeapUntil = 0;
            if (Number.isFinite(enemy.baseScale)) enemy.setScale(enemy.baseScale);
            enemy.leapAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            enemy.leapUntil = time + 420;
            enemy.nextLeapAt = time + Phaser.Math.Between(1400, 2200);
            this.scene?.eventBus?.emit('facehuggerLeaped', { enemy, x: enemy.x, y: enemy.y, targetX: target.x, targetY: target.y });
        }

        // ── Leap decision ─────────────────────────────────────────────────────
        if (dist <= leapRange && time >= enemy.nextLeapAt && !enemy.leapUntil && !enemy._preLeapUntil) {
            if (Math.random() < 0.7) {
                // Enter pre-leap telegraph instead of leaping immediately
                enemy._preLeapUntil = time + Phaser.Math.Between(300, 400);
            } else {
                enemy.nextLeapAt = time + Phaser.Math.Between(420, 860);
            }
        }

        // ── Leap execution ────────────────────────────────────────────────────
        if (enemy.leapUntil) {
            if (time < enemy.leapUntil) {
                const s = enemy.stats.speed * 2.2;
                enemy.body.setVelocity(Math.cos(enemy.leapAngle) * s, Math.sin(enemy.leapAngle) * s);
                enemy.setRotation(enemy.leapAngle);

                if (dist <= 24) {
                    const targetHp    = Math.max(0, Number(target?.health) || 0);
                    const targetMaxHp = Math.max(1, Number(target?.maxHealth) || 100);
                    const targetHpPct = Phaser.Math.Clamp(targetHp / targetMaxHp, 0, 1);

                    if (targetHpPct <= 0.31) {
                        // Latch kill
                        this.scene?.eventBus?.emit('facehuggerLatched', { enemy, target, x: enemy.x, y: enemy.y });
                        if (typeof target.takeDamage === 'function') {
                            target.takeDamage(targetHp + targetMaxHp, enemy);
                        } else {
                            this.manager.targeting.applyMarineDamage(target, targetHp + targetMaxHp, enemy);
                        }
                        if (this.scene?.showFloatingText) this.scene.showFloatingText(target.x, target.y - 30, 'FACEHUG KILL!', '#ff8f8f');
                    } else {
                        if (this.scene?.showFloatingText) this.scene.showFloatingText(target.x, target.y - 30, 'BOUNCED OFF!', '#a7dfff');
                    }

                    // Cascading egg trigger — nearby eggs open when a facehugger strikes
                    this._triggerNearbyEggs(enemy, time);

                    enemy.leapUntil = 0;
                    const awayA = Phaser.Math.Angle.Between(target.x, target.y, enemy.x, enemy.y)
                        + Phaser.Math.FloatBetween(-0.24, 0.24);

                    // 55% chance: disengage off-screen and re-flank from a new angle.
                    if (Math.random() < 0.55) {
                        enemy.retreatAngle = awayA;
                        enemy.flankState   = 'flee';
                        enemy.nextLeapAt   = time + 99999; // suspended until flank completes
                    } else {
                        // Standard short retreat.
                        const retreatDist = Phaser.Math.Between(
                            Math.round(CONFIG.TILE_SIZE * 2.4),
                            Math.round(CONFIG.TILE_SIZE * 4.8)
                        );
                        const rawX = enemy.x + Math.cos(awayA) * retreatDist;
                        const rawY = enemy.y + Math.sin(awayA) * retreatDist;
                        const retreat = this.manager.resolveWalkableWorld(rawX, rawY, 3);
                        enemy.retreatTargetX = retreat.x;
                        enemy.retreatTargetY = retreat.y;
                        enemy.retreatAngle   = awayA;
                        enemy.retreatUntil   = time + Phaser.Math.Between(840, 1500);
                        enemy.nextLeapAt     = time + Phaser.Math.Between(940, 1700);
                    }
                }
            } else {
                enemy.leapUntil = 0;
                // Sync drift heading to leap direction for smooth transition
                enemy._fhHeading = enemy.leapAngle;
                enemy._fhAngularVel = 0;
            }
            return true;
        }

        // ── Chaotic kite while leap is on cooldown ────────────────────────────
        if (dist <= CONFIG.TILE_SIZE * 2.5 && time < (enemy.nextLeapAt || 0)) {
            const awayA = Phaser.Math.Angle.Between(target.x, target.y, enemy.x, enemy.y);
            const side = enemy.swarmSide || 1;
            // Erratic darting: rapid direction changes
            const now = this.scene?.time?.now || time;
            const erratic = Math.sin(now * 0.012 + (enemy.patternSeed || 0) * 7) * 0.8
                + Math.sin(now * 0.031 + (enemy.patternSeed || 0) * 3.1) * 0.5; // second frequency for chaos
            const kiteA = awayA + side * Math.PI * 0.4 + erratic;
            const kiteSpeed = enemy.stats.speed * (1.3 + Math.abs(Math.sin(now * 0.008)) * 0.5); // varying speed 1.3-1.8x
            this._fhApplyDrift(enemy, kiteA, kiteSpeed, dt);
            // Randomly flip swarm side for unpredictability
            if (Math.random() < 0.03) enemy.swarmSide = -enemy.swarmSide;
            return true;
        }

        // ── Drift approach when aggro ─────────────────────────────────────────
        if (time < (enemy.alertUntil || 0)) {
            const approachA = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
            this._fhApplyDrift(enemy, approachA, enemy.stats.speed * 1.1, dt);
            return true;
        }
        return false;
    }

    /**
     * When a facehugger's leap connects, nearby closed eggs open and release
     * more facehuggers — cascading panic effect.
     */
    _triggerNearbyEggs(enemy, time) {
        const eggs = this.manager.eggs;
        if (!eggs || eggs.length === 0) return;
        const triggerRadius = CONFIG.TILE_SIZE * 4;
        const maxTrigger = 3;
        let triggered = 0;
        for (const egg of eggs) {
            if (triggered >= maxTrigger) break;
            if (!egg.active || egg.state !== 'closed' || egg.hasReleased) continue;
            if (time < egg.nextReadyAt) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, egg.x, egg.y);
            if (d > triggerRadius) continue;
            egg.open(time + 4000);
            triggered++;
            const a = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
            const sx = egg.x + Math.cos(a) * 18;
            const sy = egg.y + Math.sin(a) * 18;
            const spawnType = this.scene?.forceWarriorOnly ? 'warrior' : 'facehugger';
            const spawned = this.manager.spawner.spawnEnemyAtWorld(spawnType, sx, sy, 1);
            if (spawned) {
                spawned.alertUntil = Math.max(spawned.alertUntil, time + (this.manager.visualAlertMs || 5000));
                spawned.nextLeapAt = time + 180;
                egg.setSpent();
            }
        }
    }

    // ── Facehugger flank sub-states ───────────────────────────────────────────

    /** Phase 1 — sprint off-screen in retreat direction. */
    _fhFlee(enemy, time) {
        const cam  = this.scene?.cameras?.main;
        const view = cam?.worldView;
        const margin = 96;

        const offScreen = !view || (
            enemy.x < view.x   - margin ||
            enemy.x > view.right  + margin ||
            enemy.y < view.y   - margin ||
            enemy.y > view.bottom + margin
        );

        if (offScreen) {
            enemy.flankState    = 'wait';
            enemy.flankWaitUntil = time + Phaser.Math.Between(1500, 3000);
            enemy.body.setVelocity(0, 0);
            return true;
        }

        // Sprint at 2.2× speed — same as leap but in retreat direction.
        const a = enemy.retreatAngle || 0;
        const s = enemy.stats.speed * 2.2;
        enemy.body.setVelocity(Math.cos(a) * s, Math.sin(a) * s);
        enemy.setRotation(a);
        return true;
    }

    /** Phase 2 — freeze off-screen, then teleport to a flanking entry point. */
    _fhWait(enemy, time) {
        enemy.body.setVelocity(0, 0);
        if (time < (enemy.flankWaitUntil || 0)) return true;

        // ── Teleport to flanking position ──────────────────────────────────────
        const target = enemy._flankTarget;
        if (!target || !target.active) {
            // Target gone — clear state and let normal AI resume.
            enemy.flankState = null;
            return false;
        }

        const cam  = this.scene?.cameras?.main;
        const view = cam?.worldView;

        // Flanking angle: 90° or 270° from the retreat direction so the facehugger
        // comes in from a different side of the screen each time.
        const retreatA = enemy.retreatAngle || 0;
        const sideSign = Math.random() < 0.5 ? 1 : -1;
        const flankA   = retreatA + sideSign * Math.PI * 0.5;

        // Project from the marine outward in the flank direction until we reach
        // the far edge of the camera rectangle, then step just past it (+80px).
        let newX, newY;
        if (view) {
            const hw = view.width  * 0.5 + 80;
            const hh = view.height * 0.5 + 80;
            const cx = view.centerX;
            const cy = view.centerY;
            // Scale factor so the ray exits the camera rect.
            const cosA = Math.cos(flankA);
            const sinA = Math.sin(flankA);
            const tX = cosA !== 0 ? hw / Math.abs(cosA) : Infinity;
            const tY = sinA !== 0 ? hh / Math.abs(sinA) : Infinity;
            const tEdge = Math.min(tX, tY);
            newX = cx + cosA * tEdge;
            newY = cy + sinA * tEdge;
        } else {
            // No camera info — fall back to a fixed offset.
            newX = target.x + Math.cos(flankA) * 480;
            newY = target.y + Math.sin(flankA) * 480;
        }

        // Snap to walkable tile (search up to 10 tiles out if needed).
        const pos = this.manager.resolveWalkableWorld(newX, newY, 10);
        enemy.body.reset(pos.x, pos.y);
        enemy._propAvoidAt = 0;
        enemy._wallAvoidAt = 0;
        // Reset drift heading after teleport so steering starts fresh
        enemy._fhHeading = null;
        enemy._fhAngularVel = 0;

        // Reset visibility so the proximity reveal fades them in naturally.
        enemy.revealCharge = 0;
        enemy.hitRevealed  = false;

        // Clear flank state — back to normal hunt.
        enemy.flankState   = null;
        enemy.retreatUntil = 0;
        enemy.nextLeapAt   = time + Phaser.Math.Between(700, 1300);
        return true;
    }

    /**
     * Spring-damper steering for facehugger drift physics.
     * Under-damped system produces "slippery race-car" inertia with
     * oversteer on sharp turns — heading lags behind desired angle
     * and overshoots before settling.
     */
    _fhApplyDrift(enemy, desiredAngle, speed, dt) {
        if (enemy._fhHeading == null) enemy._fhHeading = desiredAngle;
        if (enemy._fhAngularVel == null) enemy._fhAngularVel = 0;

        const dtSec = Phaser.Math.Clamp(dt / 1000, 0.001, 0.05);

        // Shortest-path angle error
        const angleDiff = Phaser.Math.Angle.Wrap(desiredAngle - enemy._fhHeading);

        // Under-damped spring: ζ = damping / (2√stiffness) ≈ 0.42
        // Low damping ratio = overshoot on direction changes = drift
        const stiffness = 11.0;
        const damping = 2.8;

        enemy._fhAngularVel += (angleDiff * stiffness - enemy._fhAngularVel * damping) * dtSec;
        enemy._fhAngularVel = Phaser.Math.Clamp(enemy._fhAngularVel, -14, 14);

        enemy._fhHeading = Phaser.Math.Angle.Wrap(enemy._fhHeading + enemy._fhAngularVel * dtSec);

        // Velocity follows actual heading, not desired — this IS the drift
        enemy.body.setVelocity(
            Math.cos(enemy._fhHeading) * speed,
            Math.sin(enemy._fhHeading) * speed
        );
        enemy.setRotation(enemy._fhHeading);
    }

    tryDroneVentAmbush(enemy, target, marines, time) {
        if (enemy.enemyType !== 'drone' || time < (enemy.nextVentAmbushAt || 0)) return;
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
        if (dist < CONFIG.TILE_SIZE * 6 || dist > CONFIG.TILE_SIZE * 15) return;
        const vent = this.manager.findNearbyVent(target.x, target.y, CONFIG.TILE_SIZE * 4);
        if (vent) {
            const myVent = this.manager.findNearbyVent(enemy.x, enemy.y, CONFIG.TILE_SIZE * 6);
            if (myVent) {
                // Don't teleport into the player's torch beam — breaks immersion
                if (this.manager.spawner.isSpawnBeamVisible(vent.x, vent.y, marines)) {
                    enemy.nextVentAmbushAt = time + Phaser.Math.Between(3000, 6000);
                    return;
                }
                enemy.body.reset(vent.x, vent.y);
                enemy._propAvoidAt = 0;
                enemy._wallAvoidAt = 0;
                // Suppress motion tracker briefly — drone is "in the vents"
                enemy._ventTravelUntil = time + Phaser.Math.Between(800, 1500);
                enemy.nextVentAmbushAt = time + Phaser.Math.Between(8000, 15000);
                if (this.scene?.showFloatingText) this.scene.showFloatingText(vent.x, vent.y - 20, 'VENT AMBUSH!', '#ff3333');
            }
        }
    }

    getSuppressionSpeedMul(enemy, time) {
        if (!enemy) return 1;
        const isWarrior = enemy.enemyType === 'warrior';
        const until = Number(enemy.suppressUntil) || 0;
        const slow = Phaser.Math.Clamp(Number(enemy.suppressSlow) || 0, 0, isWarrior ? 0.34 : 0.72);
        const floorMul = isWarrior ? 0.72 : 0.28;
        if (slow <= 0.001) return 1;
        if (time < until) return Phaser.Math.Clamp(1 - slow, floorMul, 1);
        const fadeMs = 420;
        const age = time - until;
        if (age <= 0 || age > fadeMs) {
            enemy.suppressSlow = 0;
            return 1;
        }
        const t = Phaser.Math.Clamp(age / fadeMs, 0, 1);
        return Phaser.Math.Clamp(1 - slow * (1 - t), floorMul, 1);
    }

    updateEnemyNavigationHealth(enemy, targetX, targetY, desired, time, pressure = 0.3) {
        if (!enemy?.active) return;
        const dt = time - (enemy.navLastSampleAt || time);
        if (dt < 140) return;
        const moved = Phaser.Math.Distance.Between(enemy.x, enemy.y, enemy.navLastSampleX || enemy.x, enemy.navLastSampleY || enemy.y);
        const expected = (enemy.stats.speed * 0.45 * dt) / 1000;
        const isStuck = moved < expected * 0.18;
        if (isStuck) {
            enemy.navStuckMs = (enemy.navStuckMs || 0) + dt;
        } else {
            enemy.navStuckMs = Math.max(0, (enemy.navStuckMs || 0) - dt * 2);
        }
        enemy.navLastSampleAt = time;
        enemy.navLastSampleX = enemy.x;
        enemy.navLastSampleY = enemy.y;
        const stuckThreshold = Number(this.manager.stuckTriggerMs) || 820;
        if (enemy.navStuckMs >= stuckThreshold && time >= (enemy.navLastUnstuckAt || 0) + (Number(this.manager.unstuckCooldownMs) || 520)) {
            this.attemptEnemyUnstuck(enemy, targetX, targetY, time, pressure);
        }
    }

    attemptEnemyUnstuck(enemy, targetX, targetY, time, pressure = 0.3) {
        enemy.navLastUnstuckAt = time;
        enemy.navStuckMs = 0;
        if (time >= enemy.navUnstuckBurstResetAt) {
            enemy.navUnstuckBurstCount = 0;
            enemy.navUnstuckBurstResetAt = time + 2000;
        }
        enemy.navUnstuckBurstCount++;
        const orbitSide = enemy.swarmSide || (Math.random() < 0.5 ? -1 : 1);
        const angleToTarget = Phaser.Math.Angle.Between(enemy.x, enemy.y, targetX, targetY);
        const escapeAngle = angleToTarget + orbitSide * (Math.PI * 0.5 + Phaser.Math.FloatBetween(-0.4, 0.4));
        const escapeDist = CONFIG.TILE_SIZE * Phaser.Math.FloatBetween(1.2, 2.4);
        const recoverRawX = enemy.x + Math.cos(escapeAngle) * escapeDist;
        const recoverRawY = enemy.y + Math.sin(escapeAngle) * escapeDist;
        const recoverSnap = this.resolveClearRecoverTarget(enemy, recoverRawX, recoverRawY, 3);
        enemy.navRecoverTargetX = recoverSnap.x;
        enemy.navRecoverTargetY = recoverSnap.y;
        enemy.navRecoverUntil = time + Phaser.Math.Between(340, 620);
        if (enemy.navUnstuckBurstCount >= 3) {
            const hardA = angleToTarget + Math.PI + Phaser.Math.FloatBetween(-0.6, 0.6);
            const hardRawX = enemy.x + Math.cos(hardA) * (CONFIG.TILE_SIZE * 3);
            const hardRawY = enemy.y + Math.sin(hardA) * (CONFIG.TILE_SIZE * 3);
            const hardSnap = this.resolveClearRecoverTarget(enemy, hardRawX, hardRawY, 4);
            enemy.navRecoverTargetX = hardSnap.x;
            enemy.navRecoverTargetY = hardSnap.y;
            enemy.navRecoverUntil = time + 760;
            enemy.navUnstuckBurstCount = 0;
        }
        enemy.prevVx = 0;
        enemy.prevVy = 0;
    }

    resolveClearRecoverTarget(enemy, worldX, worldY, radiusTiles = 4) {
        const snap = this.manager.resolveWalkableWorld(worldX, worldY, radiusTiles);
        const pathGrid = this.scene?.pathGrid;
        const props = Array.isArray(this.scene?.roomProps) ? this.scene.roomProps : [];
        if (!pathGrid || props.length <= 0) return snap;
        const blockedByProp = (x, y) => {
            for (const p of props) {
                if (p?.blocksPath === false) continue;
                const s = p?.sprite;
                if (!s || s.active === false) continue;
                const pr = Math.max(12, Number(p?.radius) || 18);
                const bodyPad = Math.max(8, Number(enemy?.body?.halfWidth) || 8);
                if (Phaser.Math.Distance.Between(x, y, s.x, s.y) <= (pr + bodyPad)) return true;
            }
            return false;
        };
        if (!blockedByProp(snap.x, snap.y)) return snap;
        const origin = pathGrid.worldToTile(snap.x, snap.y);
        let best = snap;
        let bestD2 = Infinity;
        const maxR = Math.max(2, Number(radiusTiles) || 4);
        for (let r = 1; r <= maxR; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const tx = origin.x + dx;
                    const ty = origin.y + dy;
                    if (!pathGrid.isWalkable(tx, ty)) continue;
                    const w = pathGrid.tileToWorld(tx, ty);
                    if (blockedByProp(w.x, w.y)) continue;
                    const d2 = (w.x - worldX) * (w.x - worldX) + (w.y - worldY) * (w.y - worldY);
                    if (d2 < bestD2) {
                        bestD2 = d2;
                        best = w;
                    }
                }
            }
            if (bestD2 < Infinity) break;
        }
        return best;
    }

    /**
     * Per-frame random velocity jitter for organic, insect-like movement.
     * Warriors ±4%, facehuggers ±10%, others ±6%.
     * Skipped during leap attacks and other special movement states.
     */
    applyMovementJitter(enemy, desired) {
        if (!enemy || !desired) return desired;
        // Skip jitter during special movement states
        if (enemy.leaping || enemy.leapUntil || enemy._preLeapUntil) return desired;
        if (enemy._attackLeapUntil) return desired;
        if (enemy.flankState === 'flee' || enemy.flankState === 'wait') return desired;

        let jitterRange;
        switch (enemy.enemyType) {
            case 'warrior':    jitterRange = 0.08; break;  // ±4%
            case 'facehugger': jitterRange = 0.20; break;  // ±10%
            default:           jitterRange = 0.12; break;  // ±6%
        }
        const factor = 1.0 + (Math.random() - 0.5) * jitterRange;
        return {
            vx: desired.vx * factor,
            vy: desired.vy * factor,
        };
    }

    getEnemyPathHint(enemy, tx, ty, time, isAggro) {
        if (!enemy || time < (enemy.nextPathHintAt || 0)) return null;
        if (time < (enemy.pathHintUntil || 0)) return { x: enemy.pathHintX, y: enemy.pathHintY };
        if (this._pathsThisFrame >= this._pathBudgetPerFrame) return null;
        const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, tx, ty);
        if (d < CONFIG.TILE_SIZE * 1.5) return null;
        const grid = this.scene.pathGrid;
        const start = grid.worldToTile(enemy.x, enemy.y);
        const end = grid.worldToTile(tx, ty);
        this._pathsThisFrame++;
        const path = this.scene.pathPlanner?.findPath(start.x, start.y, end.x, end.y, grid);
        if (path && path.length > 2) {
            const hintIdx = Math.min(path.length - 1, isAggro ? 2 : 1);
            const hintTile = path[hintIdx];
            const hint = grid.tileToWorld(hintTile.x, hintTile.y);
            enemy.pathHintX = hint.x;
            enemy.pathHintY = hint.y;
            enemy.pathHintUntil = time + (isAggro ? 280 : 560);
            enemy.nextPathHintAt = time + (isAggro ? 120 : 240);
            return hint;
        }
        enemy.nextPathHintAt = time + 420;
        return null;
    }
}
