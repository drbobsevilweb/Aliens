import { CONFIG } from '../config.js';

export class EnemyDetection {
    constructor(manager) {
        this.manager = manager;
        this.scene = manager.scene;
        // Phantom blip state for "build" tension
        this._phantomNextAt = 0;
    }

    updateDetection(time, delta, marines, camera, trackerActive, trackerDoorOccluded, lightSourcesOverride = null) {
        const view = camera ? camera.worldView : null;
        const lightSources = lightSourcesOverride || this.manager.getLightSources();
        const observers = (marines || []).filter((m) => m && m.active && m.alive !== false).map((m) => ({ x: m.x, y: m.y }));

        this.manager.motionContacts = [];
        const refreshedContacts = new Set();

        // Expanded camera rect for off-screen reset (128px padding)
        const expandedView = view
            ? new Phaser.Geom.Rectangle(view.x - 128, view.y - 128, view.width + 256, view.height + 256)
            : null;
        // Facehugger inner-viewport rect — built once here so we don't allocate inside the enemy loop.
        const edgePad = CONFIG.TILE_SIZE * 2;
        const facehuggerInnerView = view
            ? new Phaser.Geom.Rectangle(view.x + edgePad, view.y + edgePad, view.width - edgePad * 2, view.height - edgePad * 2)
            : null;

        // Proximity reveal zone: 2/3 of the primary torch range.
        // Aliens fade from 0→1 opacity as they close from this distance to 0.
        // Uses nearest light source distance (omnidirectional — not cone-filtered).
        const torchRangeBase = lightSources[0]?.range || CONFIG.TORCH_RANGE;
        const PROXIMITY_ZONE = torchRangeBase * (2 / 3);

        // Beam reveal ramp: how fast revealCharge climbs when the beam is on the alien.
        // 1.5 units/s -> full reveal in ~660 ms (smooth cinematic fade).
        const BEAM_RAMP_RATE = 1.5;

        for (const enemy of this.manager.enemies) {
            if (!enemy.active) continue;

            // Eggs are always visible
            if (enemy.enemyType === 'egg') {
                enemy.revealCharge = 1;
                enemy.detected = true;
                enemy.setAlpha(1);
                enemy.setVisible(true);
                if (Number.isFinite(enemy.baseScale)) enemy.setScale(enemy.baseScale);
                enemy.setBlendMode(Phaser.BlendModes.NORMAL);
                enemy.currentDisplayTint = enemy.baseTint;
                enemy.setTint(enemy.baseTint);
                if (typeof enemy.setGhostBlur === 'function') enemy.setGhostBlur(0, enemy.baseTint);
                const label = this.manager.labels.get(enemy);
                if (label) label.setVisible(true);
                continue;
            }

            const inView = expandedView && Phaser.Geom.Rectangle.Contains(expandedView, enemy.x, enemy.y);

            // Facehuggers reset as soon as they near the screen edge (~2 tiles inside viewport).
            // All reveal state and follower targeting clears immediately so they can vanish and reappear.
            if (enemy.enemyType === 'facehugger' && facehuggerInnerView) {
                if (!Phaser.Geom.Rectangle.Contains(facehuggerInnerView, enemy.x, enemy.y)) {
                    enemy.hitRevealed = false;
                    enemy.revealCharge = 0;
                    enemy.detected = false;
                    enemy.setAlpha(0);
                    enemy.setVisible(false);
                    const label = this.manager.labels.get(enemy);
                    if (label) label.setVisible(false);
                    continue;
                }
            }
            // Drones using vents are fully hidden visually but feed weak high-speed signals into tracker.
            // They "disappear into the ceiling" — movie-accurate ceiling traversal.
            if (enemy._ventTravelUntil && time < enemy._ventTravelUntil) {
                enemy.detected = false;
                enemy.setAlpha(0);
                enemy.setVisible(false);
                const label = this.manager.labels.get(enemy);
                if (label) label.setVisible(false);

                if (enemy.body && enemy.body.speed > 5) {
                    this.manager.motionContacts.push(enemy);
                    refreshedContacts.add(enemy);
                    this.manager.motionEchoes.set(enemy, {
                        x: enemy.x,
                        y: enemy.y,
                        confidence: 0.4,
                        speed: enemy.body.speed,
                        expiresAt: time + 760,
                        vent: true
                    });
                }
                continue;
            }
            const occluded = this.isOccludedFromObservers(enemy, observers);

            // ── Proximity reveal ──────────────────────────────────────────────────
            // Compute proximity alpha from nearest light source (no cone check —
            // this is a "sense of presence" effect as the alien closes in).
            let nearestLightDist = Infinity;
            for (const source of lightSources) {
                const d = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
                if (d < nearestLightDist) nearestLightDist = d;
            }
            // 0 at PROXIMITY_ZONE, rises linearly to 1 at distance 0.
            const proximityLos = this.hasObserverLineOfSight(enemy, observers, PROXIMITY_ZONE + CONFIG.TILE_SIZE);
            const proximityAlpha = (occluded || !proximityLos) ? 0
                : Phaser.Math.Clamp(1.0 - (nearestLightDist / PROXIMITY_ZONE), 0, 1.0);

            // ── Beam contact ──────────────────────────────────────────────────────
            let litNow = false;
            for (const source of lightSources) {
                if (this.isClosedDoorBetweenWorldPoints(source.x, source.y, enemy.x, enemy.y)) continue;
                const dist = Phaser.Math.Distance.Between(source.x, source.y, enemy.x, enemy.y);
                if (dist > source.range) continue;
                if (!this.manager.isInLightCone(source, enemy)) continue;
                if (!this.hasLineOfSight(source.x, source.y, enemy.x, enemy.y, source.range)) continue;
                litNow = true;
                break;
            }

            if (litNow) {
                // Fast ramp toward 1 — noticeable fade-in, not a snap.
                enemy.revealCharge = Math.min(1.0, enemy.revealCharge + (delta / 1000) * BEAM_RAMP_RATE);
                enemy.hitRevealed = true;
                enemy.lastSeenAt = time;
            } else {
                // Decay when beam leaves — fade out over ~3 seconds.
                if (enemy.revealCharge > 0) {
                    enemy.revealCharge = Math.max(0, enemy.revealCharge - (delta / 1000) * 0.35);
                    if (enemy.revealCharge <= 0) enemy.hitRevealed = false;
                }
                // Off-screen: snap clear.
                if (!inView) {
                    enemy.hitRevealed = false;
                    enemy.revealCharge = 0;
                }
            }

            // Door occlusion: force hidden but preserve hitRevealed flag
            if (occluded) {
                enemy.detected = false;
                enemy.setAlpha(0);
                enemy.setVisible(false);
                if (typeof enemy.setGhostBlur === 'function') enemy.setGhostBlur(0, enemy.baseTint);
                const label = this.manager.labels.get(enemy);
                if (label) label.setVisible(false);
                const speed = Number(enemy.body?.speed) || 0;
                if (speed > 2 || enemy.hitRevealed) {
                    this.manager.motionContacts.push({
                        type: enemy.enemyType, x: enemy.x, y: enemy.y,
                        tracked: false, confidence: 0.4, speed, ageMs: 0,
                    });
                    refreshedContacts.add(enemy);
                }
                continue;
            }

            // ── Spawn fade-in ramp ──────────────────────────────────────────────
            // Newly spawned aliens cannot instantly appear at full proximity alpha.
            // They ramp from 0 to 1 over ~1.5 seconds after entering any reveal zone.
            if (proximityAlpha > 0.01 || enemy.revealCharge > 0.01) {
                if (!enemy._revealStartedAt) enemy._revealStartedAt = time;
                const revealAge = time - enemy._revealStartedAt;
                const spawnRamp = Phaser.Math.Clamp(revealAge / 1500, 0, 1);
                // Don't let the ramp reduce an already-high revealCharge (e.g. hit-revealed)
                if (spawnRamp < 1 && !enemy.hitRevealed) {
                    enemy.revealCharge = Math.min(enemy.revealCharge, spawnRamp);
                }
            } else {
                // Reset ramp when alien goes fully dark again
                enemy._revealStartedAt = 0;
            }

            // ── Final alpha ───────────────────────────────────────────────────────
            // Proximity provides ambient fade-in; beam revealCharge can push to full.
            // No binary gate — smooth gradient from 0 to 1.
            // Apply spawn ramp to proximity alpha for gradual appearance.
            const spawnRampFactor = enemy._revealStartedAt
                ? Phaser.Math.Clamp((time - enemy._revealStartedAt) / 1500, 0, 1)
                : 1;
            const rampedProximity = enemy.hitRevealed ? proximityAlpha : (proximityAlpha * spawnRampFactor);
            let displayAlpha = Math.max(rampedProximity, enemy.revealCharge);
            const visible = displayAlpha > 0.01;

            // Edge-of-visibility shimmer — unsettling flicker at detection boundaries
            // Only applies to partially visible aliens (0.05–0.75 alpha range)
            if (visible && displayAlpha > 0.05 && displayAlpha < 0.75) {
                const shimmerTime = time * 0.008;
                const shimmerPhase = (enemy.patternSeed || 0) * 2.7;
                displayAlpha *= 0.85 + 0.15 * Math.sin(shimmerTime + shimmerPhase);
                displayAlpha = Phaser.Math.Clamp(displayAlpha, 0.01, 1.0);
            }

            enemy.detected = displayAlpha > 0.30; // "confirmed detected" threshold for HUD etc.
            enemy.setAlpha(displayAlpha);
            enemy.setVisible(visible);

            // Facehuggers fade out when overlapping non-walkable tiles (walls/doors)
            if (enemy.enemyType === 'facehugger' && visible) {
                const pg = this.scene?.pathGrid;
                if (pg) {
                    const ft = pg.worldToTile(enemy.x, enemy.y);
                    if (!pg.isWalkable(ft.x, ft.y)) {
                        // Smoothly fade toward 0 while on wall tiles
                        enemy._fhWallFade = Math.max(0, (enemy._fhWallFade ?? 1) - delta * 0.004);
                    } else {
                        // Smoothly fade back in on walkable tiles
                        enemy._fhWallFade = Math.min(1, (enemy._fhWallFade ?? 1) + delta * 0.006);
                    }
                    const wallAlpha = enemy._fhWallFade ?? 1;
                    enemy.setAlpha(displayAlpha * wallAlpha);
                    if (wallAlpha < 0.02) enemy.setVisible(false);
                }
            }

            // Add ghost shimmer when not fully revealed (0.01 to 0.8)
            const shimmerStrength = visible ? Phaser.Math.Clamp(1.0 - displayAlpha, 0, 0.6) : 0;
            if (typeof enemy.setGhostBlur === 'function') {
                enemy.setGhostBlur(shimmerStrength, enemy.baseTint);
            }

            if (visible) {
                const tint = this.manager.getVisibilityTintColor(enemy, displayAlpha, true);
                if (tint !== enemy.currentDisplayTint) {
                    enemy.currentDisplayTint = tint;
                    enemy.setTint(tint);
                }

                const label = this.manager.labels.get(enemy);
                if (label) {
                    label.setVisible(enemy.detected);
                    label.setAlpha(Phaser.Math.Clamp((displayAlpha - 0.3) / 0.7, 0, 1));
                }

                const speed = Number(enemy.body?.speed) || 0;
                const leader = this.scene.leader;
                const trackerReveal = trackerActive && !trackerDoorOccluded && leader
                    && Phaser.Math.Distance.Between(leader.x, leader.y, enemy.x, enemy.y) <= CONFIG.MOTION_TRACKER_RANGE;
                this.manager.motionContacts.push({
                    type: enemy.enemyType, x: enemy.x, y: enemy.y,
                    tracked: trackerReveal, confidence: displayAlpha, speed, ageMs: 0,
                });
                refreshedContacts.add(enemy);
            } else {
                const label = this.manager.labels.get(enemy);
                if (label) label.setVisible(false);

                // Invisible aliens still show on motion tracker if moving
                const speed = Number(enemy.body?.speed) || 0;
                const leader = this.scene.leader;
                const trackerReveal = trackerActive && !trackerDoorOccluded && leader
                    && Phaser.Math.Distance.Between(leader.x, leader.y, enemy.x, enemy.y) <= CONFIG.MOTION_TRACKER_RANGE;
                if (trackerReveal && speed > 2) {
                    this.manager.motionContacts.push({
                        type: enemy.enemyType, x: enemy.x, y: enemy.y,
                        tracked: true,
                        confidence: Phaser.Math.Clamp((speed / 120) * 0.8, 0.1, 0.8),
                        speed, ageMs: 0,
                    });
                    refreshedContacts.add(enemy);
                }
            }
        }

        // Handle echoes
        const motionEchoes = this.manager.motionEchoes;
        for (const [enemy, echo] of motionEchoes.entries()) {
            if (!echo) {
                motionEchoes.delete(enemy);
                continue;
            }
            if (refreshedContacts.has(enemy)) continue;
            if (time >= echo.expiresAt) {
                motionEchoes.delete(enemy);
                continue;
            }

            const life = echo.expiresAt - time;
            const fade = Phaser.Math.Clamp(life / 760, 0, 1);
            this.manager.motionContacts.push({
                type: enemy.enemyType,
                x: echo.x,
                y: echo.y,
                isEcho: true,
                confidence: (Number(echo.confidence) || 0.5) * fade,
                speed: (Number(echo.speed) || 0) * fade,
                ageMs: Math.max(0, 760 - life),
            });
        }

        // ── Phantom blips during CombatDirector "build" state ───────────────
        // Brief false contacts near marines — "they're in the walls" tension.
        this._injectPhantomBlips(time, marines);
    }

    _injectPhantomBlips(time, marines) {
        const director = this.scene.combatDirector;
        if (!director || director.state !== 'build') return;
        if (time < this._phantomNextAt) return;

        // Pick a random anchor marine (leader or follower)
        const alive = (marines || []).filter(m => m && m.active && m.alive !== false);
        if (alive.length === 0) return;
        const anchor = alive[Math.floor(Math.random() * alive.length)];

        // 1-2 phantom contacts at random bearing, 200-500px away
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 300;
            this.manager.motionContacts.push({
                type: 'phantom',
                x: anchor.x + Math.cos(angle) * dist,
                y: anchor.y + Math.sin(angle) * dist,
                tracked: true,
                confidence: 0.3 + Math.random() * 0.2,
                speed: 30 + Math.random() * 60,
                ageMs: 0,
                isPhantom: true,
            });
        }

        // Schedule next phantom: 3-8 seconds from now
        this._phantomNextAt = time + 3000 + Math.random() * 5000;
    }

    getEnemySenseState(enemy, marines, time = 0) {
        if (!enemy?.active) return false;
        if (time < (enemy.nextSenseAt || 0)) {
            return enemy.senseHasContact === true;
        }
        const hasContact = this.hasDirectMarineSense(enemy, marines);
        enemy.senseHasContact = hasContact;
        let nearest = Infinity;
        for (const m of marines || []) {
            if (!m || !m.active || m.alive === false) continue;
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
            if (d < nearest) nearest = d;
        }
        const close = nearest <= CONFIG.TILE_SIZE * 5;
        const interval = hasContact ? (close ? 80 : 130) : (close ? 110 : 180);
        enemy.nextSenseAt = time + interval;
        return hasContact;
    }

    hasDirectMarineSense(enemy, marines) {
        if (!enemy || !marines || marines.length === 0) return false;
        const senseRange = (enemy.stats.aggroRange || 220) * 1.05;
        for (const m of marines) {
            if (!m || !m.active || m.alive === false) continue;
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
            if (dist > senseRange) continue;
            if (this.hasLineOfSight(enemy.x, enemy.y, m.x, m.y, senseRange + 8)) return true;
        }
        return false;
    }

    hasLineOfSight(x1, y1, x2, y2, maxRange) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= 0.0001) return true;

        const dirX = dx / len;
        const dirY = dy / len;
        const segments = this.scene.lightBlockerGrid.getSegmentsNear(x1, y1, maxRange + CONFIG.TILE_SIZE);

        for (const seg of segments) {
            const hit = this.scene.raycaster.raySegmentIntersection(
                x1, y1, dirX, dirY,
                seg.x1, seg.y1, seg.x2, seg.y2
            );
            if (hit && hit.dist < len) {
                return false;
            }
        }

        const pathGrid = this.scene?.pathGrid;
        const steps = Math.max(2, Math.ceil(len / Math.max(8, CONFIG.TILE_SIZE * 0.25)));
        for (let step = 1; step < steps; step++) {
            const t = step / steps;
            const sx = x1 + dx * t;
            const sy = y1 + dy * t;
            const tx = Math.floor(sx / CONFIG.TILE_SIZE);
            const ty = Math.floor(sy / CONFIG.TILE_SIZE);
            const blocked = this.scene.lightBlockerGrid?.isBlocking(tx, ty)
                || (pathGrid && !pathGrid.isWalkable(tx, ty));
            if (blocked) return false;
        }
        return true;
    }

    isClosedDoorBetweenWorldPoints(x1, y1, x2, y2) {
        const mgr = this.scene?.doorManager;
        if (!mgr || typeof mgr.hasClosedDoorBetweenWorldPoints !== 'function') return false;
        return mgr.hasClosedDoorBetweenWorldPoints(x1, y1, x2, y2);
    }

    isOccludedFromObservers(enemy, observers) {
        if (!enemy || !Array.isArray(observers) || observers.length === 0) return false;
        for (const src of observers) {
            if (!src || !Number.isFinite(src.x) || !Number.isFinite(src.y)) continue;
            if (!this.isClosedDoorBetweenWorldPoints(src.x, src.y, enemy.x, enemy.y)) {
                return false;
            }
        }
        return true;
    }

    hasObserverLineOfSight(enemy, observers, maxRange = Infinity) {
        if (!enemy || !Array.isArray(observers) || observers.length === 0) return false;
        for (const src of observers) {
            if (!src || !Number.isFinite(src.x) || !Number.isFinite(src.y)) continue;
            const dist = Phaser.Math.Distance.Between(src.x, src.y, enemy.x, enemy.y);
            if (dist > maxRange) continue;
            if (this.hasLineOfSight(src.x, src.y, enemy.x, enemy.y, Math.max(dist + CONFIG.TILE_SIZE, CONFIG.TILE_SIZE))) {
                return true;
            }
        }
        return false;
    }

    rebuildEnemyDensityCache() {
        if (!this.manager.enemyDensityGrid) this.manager.enemyDensityGrid = new Map();
        this.manager.enemyDensityGrid.clear();
        const cellSize = Math.max(8, Number(this.manager.enemyDensityCellSize) || CONFIG.TILE_SIZE);
        for (const enemy of this.manager.enemies) {
            if (!enemy || !enemy.active) continue;
            const cx = Math.floor(enemy.x / cellSize);
            const cy = Math.floor(enemy.y / cellSize);
            const key = `${cx},${cy}`;
            let bucket = this.manager.enemyDensityGrid.get(key);
            if (!bucket) {
                bucket = [];
                this.manager.enemyDensityGrid.set(key, bucket);
            }
            bucket.push(enemy);
        }
    }

    getEnemyDensityCount(worldX, worldY, radius, ignore = null) {
        if (!this.manager.enemyDensityGrid) return 0;
        const cellSize = Math.max(8, Number(this.manager.enemyDensityCellSize) || CONFIG.TILE_SIZE);
        const r2 = radius * radius;
        const minCx = Math.floor((worldX - radius) / cellSize);
        const maxCx = Math.floor((worldX + radius) / cellSize);
        const minCy = Math.floor((worldY - radius) / cellSize);
        const maxCy = Math.floor((worldY + radius) / cellSize);
        let count = 0;
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const key = `${cx},${cy}`;
                const bucket = this.manager.enemyDensityGrid.get(key);
                if (!bucket || bucket.length <= 0) continue;
                for (const other of bucket) {
                    if (!other || !other.active || other === ignore) continue;
                    const dx = worldX - other.x;
                    const dy = worldY - other.y;
                    if ((dx * dx + dy * dy) <= r2) count++;
                }
            }
        }
        return count;
    }

    getOnScreenHostileCount(camera) {
        if (!camera || !camera.worldView) return 0;
        const view = camera.worldView;
        let count = 0;
        for (const enemy of this.manager.enemies) {
            if (!enemy?.active) continue;
            if (!Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y)) continue;
            const visibleAlpha = Number(enemy.alpha);
            if (enemy.detected !== true && !(Number.isFinite(visibleAlpha) && visibleAlpha > 0.08)) continue;
            count++;
        }
        return count;
    }

    getBestLightStimulus(enemy, time) {
        if (!enemy || !this.manager.lightStimuli || this.manager.lightStimuli.length === 0) return null;
        let best = null;
        let bestScore = 0;
        const maxAge = Math.max(1, this.manager.lightStimulusMemoryMs);
        for (const s of this.manager.lightStimuli) {
            const age = time - s.time;
            if (age < 0 || age > maxAge) continue;
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y);
            if (dist > (enemy.stats.aggroRange || 220) * 1.5) continue;
            const score = (s.power * (1 - age / maxAge)) / Math.max(1, dist / 64);
            if (score > bestScore) {
                bestScore = score;
                best = s;
            }
        }
        return best;
    }

    pruneLightStimuli(time) {
        const maxAge = this.manager.lightStimulusMemoryMs;
        for (let i = this.manager.lightStimuli.length - 1; i >= 0; i--) {
            if ((time - this.manager.lightStimuli[i].time) > maxAge) {
                this.manager.lightStimuli.splice(i, 1);
            }
        }
    }

    registerLightStimulus(x, y, time, power = 1) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(time)) return;
        const p = Phaser.Math.Clamp(Number(power) || 1, 0.2, 2.5);
        if (this.manager.lightStimuli.length >= 120) this.manager.lightStimuli.shift();
        this.manager.lightStimuli.push({ x, y, time, power: p });
    }
}
