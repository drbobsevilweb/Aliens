#!/usr/bin/env node
/**
 * graphics_bot.mjs — Automated graphics & shader validation bot.
 *
 * Launches the game via Playwright (WebGL mode), inspects shader pipelines,
 * lighting system, texture generation, FPS stability, and visual rendering.
 * Produces a structured report of issues found.
 *
 * Usage:
 *   node scripts/graphics_bot.mjs [mission|all] [headed]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT  = path.join(ROOT, 'output');
fs.mkdirSync(OUT, { recursive: true });

const missionArg = process.argv[2] || 'm1';
const headed     = process.argv.includes('headed');
const missions   = missionArg === 'all' ? ['m1','m2','m3','m4','m5'] : [missionArg];

const BASE_URL    = 'http://127.0.0.1:8192';
const TICK_MS     = 500;
const MAX_GAME_S  = 60;   // 60s per mission for graphics testing
const sleep = ms => new Promise(r => setTimeout(r, ms));

function withTimeout(promise, ms) {
    let t;
    return Promise.race([
        promise,
        new Promise((_,rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); }),
    ]).finally(() => clearTimeout(t));
}

class GraphicsIssueTracker {
    constructor(mission) {
        this.mission = mission;
        this.issues = [];
        this.checks = {};
        this.fpsHistory = [];
        this.memHistory = [];
    }
    add(severity, category, msg, data = {}) {
        this.issues.push({ severity, category, msg, tick: Date.now(), data });
    }
    setCheck(cat, pass, note = '') {
        if (!this.checks[cat]) this.checks[cat] = { pass: 0, fail: 0, notes: [] };
        if (pass) this.checks[cat].pass++; else this.checks[cat].fail++;
        if (note) this.checks[cat].notes.push(note);
    }
    summary() {
        const bySev = { critical: [], high: [], medium: [], low: [] };
        for (const i of this.issues) (bySev[i.severity] || bySev.low).push(i);
        return { mission: this.mission, issues: this.issues, bySeverity: bySev, checks: this.checks,
                 fpsHistory: this.fpsHistory, memHistory: this.memHistory };
    }
}

async function safeEval(page, fn, timeout = 6000) {
    try { return await withTimeout(page.evaluate(fn), timeout); }
    catch { return null; }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN GRAPHICS TEST RUNNER
   ═══════════════════════════════════════════════════════════════ */
async function runMission(mission) {
    const tracker = new GraphicsIssueTracker(mission);
    const logFile = path.join(OUT, `graphics-bot-${mission}.log`);
    fs.writeFileSync(logFile, '');
    const L = (type, msg) => {
        try { fs.appendFileSync(logFile, `[${mission}][${type}] ${msg}\n`); } catch {}
    };

    L('INFO', `=== GRAPHICS BOT START ${mission} ===`);

    const browser = await chromium.launch({
        headless: !headed,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    // WebGL mode (no &renderer=canvas) for shader testing
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const glErrors = [];
    const pageErrors = [];

    page.on('pageerror', e => {
        const m = (e.message || String(e)).slice(0, 400);
        pageErrors.push(m);
        if (m.toLowerCase().includes('shader') || m.toLowerCase().includes('webgl') || m.toLowerCase().includes('pipeline')) {
            tracker.add('critical', 'shader', `Page error (shader-related): ${m}`);
        } else {
            tracker.add('medium', 'error', `Page error: ${m}`);
        }
        L('ERROR', m);
    });
    page.on('console', m => {
        const text = m.text().slice(0, 400);
        if (m.type() === 'error') {
            if (text.toLowerCase().includes('shader') || text.toLowerCase().includes('webgl') ||
                text.toLowerCase().includes('compile') || text.toLowerCase().includes('link')) {
                tracker.add('critical', 'shader', `Console shader error: ${text}`);
                glErrors.push(text);
            }
            L('ERROR', text);
        } else if (m.type() === 'warning' && text.toLowerCase().includes('webgl')) {
            tracker.add('low', 'webgl', `WebGL warning: ${text}`);
            L('WARN', text);
        }
    });

    /* ── Load game in WebGL mode ── */
    const url = `${BASE_URL}/game?mission=${mission}`;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        tracker.add('critical', 'error', `Failed to load: ${e.message}`);
        await browser.close();
        return tracker.summary();
    }

    /* ── Wait for boot ── */
    let booted = false;
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        try {
            booted = await withTimeout(
                page.evaluate(() => typeof window.render_game_to_text === 'function'), 3000
            );
            if (booted) break;
        } catch {}
    }
    if (!booted) {
        tracker.add('critical', 'error', 'Game failed to boot in 20s');
        await browser.close();
        return tracker.summary();
    }
    await sleep(3000);
    tracker.setCheck('boot', true, 'Game booted in WebGL mode');

    /* ── Dismiss overlay ── */
    await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (s?.controlsOverlay?.visible) {
            s.controlsOverlay.setVisible(false);
            if (!s.isPaused && s.physics?.world) s.physics.world.resume();
        }
    });

    /* ═══════════════════════════════════════════════════════
       TEST 1: RENDERER & WEBGL CONTEXT
       ═══════════════════════════════════════════════════════ */
    const rendererInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.game?.renderer) return null;
        const r = s.game.renderer;
        const gl = r.gl;
        const result = {
            type: r.type,                    // Phaser.WEBGL = 2, CANVAS = 1
            width: r.width,
            height: r.height,
            hasGL: !!gl,
            glVersion: gl ? gl.getParameter(gl.VERSION) : null,
            glVendor: gl ? gl.getParameter(gl.VENDOR) : null,
            glRenderer: gl ? gl.getParameter(gl.RENDERER) : null,
            maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : null,
            maxTextureUnits: gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : null,
            lostContext: false,
        };
        // Check for context loss
        if (gl && gl.isContextLost && gl.isContextLost()) {
            result.lostContext = true;
        }
        return result;
    });

    if (rendererInfo) {
        L('INFO', `Renderer: type=${rendererInfo.type} GL=${rendererInfo.glVersion} ${rendererInfo.glRenderer}`);
        L('INFO', `MaxTexSize=${rendererInfo.maxTextureSize} MaxTexUnits=${rendererInfo.maxTextureUnits}`);
        tracker.setCheck('webgl_context', rendererInfo.hasGL, rendererInfo.hasGL ? 'WebGL context active' : 'No WebGL context');
        if (rendererInfo.type !== 2) {
            tracker.add('high', 'webgl', 'Running in Canvas mode instead of WebGL — shaders not active');
        }
        if (rendererInfo.lostContext) {
            tracker.add('critical', 'webgl', 'WebGL context lost!');
        }
    } else {
        tracker.add('critical', 'error', 'Could not read renderer info');
    }

    /* ═══════════════════════════════════════════════════════
       TEST 2: SHADER PIPELINE REGISTRATION
       ═══════════════════════════════════════════════════════ */
    const pipelineInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.game?.renderer?.pipelines) return null;
        const pm = s.game.renderer.pipelines;
        const names = {
            'AlienTone': 'AlienTonePipeline',
            'Scanline': 'ScanlinePipeline',
            'TiltShift': 'TiltShiftPipeline',
            'DoorRipple': 'DoorRipplePipeline',
        };
        const result = {};
        for (const [regName, className] of Object.entries(names)) {
            const name = regName;
            const pipeline = pm.get(regName) || pm.getPostPipeline(regName) || pm.get(className) || pm.getPostPipeline(className);
            result[className] = {
                exists: !!pipeline,
                type: pipeline ? pipeline.constructor.name : null,
            };
        }
        // Check camera post-pipelines
        const cam = s.cameras?.main;
        if (cam) {
            result.cameraPostPipelines = cam.postPipelines?.length || 0;
            result.cameraPostNames = (cam.postPipelines || []).map(p => p.constructor.name);
        }
        return result;
    });

    if (pipelineInfo) {
        const required = ['AlienTonePipeline', 'ScanlinePipeline', 'TiltShiftPipeline', 'DoorRipplePipeline'];
        for (const name of required) {
            const info = pipelineInfo[name];
            if (info?.exists) {
                tracker.setCheck('pipeline_' + name, true, `${name} registered`);
                L('INFO', `Pipeline ${name}: OK (type=${info.type})`);
            } else {
                tracker.add('high', 'shader', `Pipeline ${name} not registered`);
                tracker.setCheck('pipeline_' + name, false, `${name} missing`);
                L('ERROR', `Pipeline ${name}: MISSING`);
            }
        }
        L('INFO', `Camera post-pipelines: ${pipelineInfo.cameraPostPipelines} — [${pipelineInfo.cameraPostNames?.join(', ')}]`);
        if ((pipelineInfo.cameraPostPipelines || 0) === 0) {
            tracker.add('medium', 'shader', 'No post-pipelines applied to camera');
        }
    }

    /* ═══════════════════════════════════════════════════════
       TEST 3: TEXTURE VALIDATION
       ═══════════════════════════════════════════════════════ */
    const textureInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.textures) return null;
        const tm = s.textures;
        const requiredTextures = [
            'tileset', 'marine_leader', 'marine_team_leader', 'bullet',
            'torch_hotspot', 'torch_beam_tip', 'fx_flare', 'fx_dot', 'fx_smoke'
        ];
        const result = { found: [], missing: [], totalTextures: 0 };
        // Check required textures
        for (const key of requiredTextures) {
            if (tm.exists(key)) {
                const tex = tm.get(key);
                const frame = tex.getSourceImage();
                result.found.push({
                    key,
                    width: frame?.width || tex.source?.[0]?.width || 0,
                    height: frame?.height || tex.source?.[0]?.height || 0,
                });
            } else {
                result.missing.push(key);
            }
        }
        // Count total textures
        result.totalTextures = Object.keys(tm.list || {}).length;
        return result;
    });

    if (textureInfo) {
        L('INFO', `Textures: ${textureInfo.found.length} found, ${textureInfo.missing.length} missing, ${textureInfo.totalTextures} total`);
        for (const t of textureInfo.found) {
            tracker.setCheck('texture', true, `${t.key} (${t.width}x${t.height})`);
        }
        for (const key of textureInfo.missing) {
            tracker.add('medium', 'texture', `Missing texture: ${key}`);
            tracker.setCheck('texture', false, `${key} missing`);
        }
    }

    /* ═══════════════════════════════════════════════════════
       TEST 4: LIGHTING SYSTEM VALIDATION
       ═══════════════════════════════════════════════════════ */
    const lightingInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return null;
        const result = {
            hasLightingOverlay: !!s.lightingOverlay,
            hasRaycaster: !!s.raycaster,
            hasLightBlockerGrid: !!s.lightBlockerGrid,
            lightSources: 0,
            staticLights: 0,
            blockerSegments: 0,
            renderTexture: null,
            qualityTier: null,
        };
        if (s.lightingOverlay) {
            const lo = s.lightingOverlay;
            result.lightSources = lo.lightSources?.length || 0;
            result.staticLights = lo.staticLights?.length || 0;
            result.qualityTier = lo.qualityTier ?? lo.currentQualityTier ?? null;
            if (lo.rt) {
                result.renderTexture = {
                    exists: true,
                    width: lo.rt.width || 0,
                    height: lo.rt.height || 0,
                };
            }
        }
        if (s.lightBlockerGrid) {
            // Count segments in a sample area
            try {
                const segs = s.lightBlockerGrid.getSegmentsNear(
                    s.leader?.x || 400, s.leader?.y || 400, 400
                );
                result.blockerSegments = segs?.length || 0;
            } catch {}
        }
        return result;
    });

    if (lightingInfo) {
        L('INFO', `Lighting: overlay=${lightingInfo.hasLightingOverlay} raycaster=${lightingInfo.hasRaycaster} blockers=${lightingInfo.hasLightBlockerGrid}`);
        L('INFO', `  Sources: ${lightingInfo.lightSources} torch, ${lightingInfo.staticLights} static, ${lightingInfo.blockerSegments} segments nearby`);
        tracker.setCheck('lighting_overlay', lightingInfo.hasLightingOverlay, lightingInfo.hasLightingOverlay ? 'LightingOverlay active' : 'Missing');
        tracker.setCheck('lighting_raycaster', lightingInfo.hasRaycaster, lightingInfo.hasRaycaster ? 'Raycaster active' : 'Missing');
        tracker.setCheck('lighting_blockers', lightingInfo.hasLightBlockerGrid, lightingInfo.hasLightBlockerGrid ? 'LightBlockerGrid active' : 'Missing');
        if (!lightingInfo.hasLightingOverlay) tracker.add('critical', 'lighting', 'LightingOverlay not initialized');
        if (!lightingInfo.hasRaycaster) tracker.add('critical', 'lighting', 'Raycaster not initialized');
        if (lightingInfo.lightSources === 0) tracker.add('high', 'lighting', 'No light sources active');
        if (lightingInfo.renderTexture) {
            L('INFO', `  RenderTexture: ${lightingInfo.renderTexture.width}x${lightingInfo.renderTexture.height}`);
        }
    }

    /* ═══════════════════════════════════════════════════════
       TEST 5: DEPTH SORTING VALIDATION
       ═══════════════════════════════════════════════════════ */
    const depthInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return null;
        const result = { entities: [], depthIssues: [] };
        // Check leader depth
        if (s.leader) {
            result.entities.push({ name: 'leader', depth: s.leader.depth, y: s.leader.y });
        }
        // Check followers
        const followers = s.squadSystem?.followers || [];
        for (const f of followers) {
            if (!f?.active) continue;
            result.entities.push({ name: f.roleKey || 'follower', depth: f.depth, y: f.y });
        }
        // Check enemies
        const enemies = s.enemyManager?.enemies || [];
        for (const e of enemies.slice(0, 10)) {
            if (!e?.active) continue;
            result.entities.push({ name: e.enemyType || 'alien', depth: e.depth, y: e.y });
        }
        // Check for depth conflicts — entities at same Y should have similar depth
        for (let i = 0; i < result.entities.length; i++) {
            for (let j = i + 1; j < result.entities.length; j++) {
                const a = result.entities[i];
                const b = result.entities[j];
                if (Math.abs(a.y - b.y) < 8) {
                    // Same Y-level, depth should be similar
                    const depthDiff = Math.abs(a.depth - b.depth);
                    if (depthDiff > 5 && depthDiff < 195) {
                        result.depthIssues.push(`${a.name}@y${Math.round(a.y)}(d=${a.depth.toFixed(1)}) vs ${b.name}@y${Math.round(b.y)}(d=${b.depth.toFixed(1)})`);
                    }
                }
            }
        }
        return result;
    });

    if (depthInfo) {
        L('INFO', `Depth entities: ${depthInfo.entities.length}, issues: ${depthInfo.depthIssues.length}`);
        for (const issue of depthInfo.depthIssues) {
            tracker.add('low', 'depth', `Depth sorting conflict: ${issue}`);
        }
        if (depthInfo.depthIssues.length === 0) {
            tracker.setCheck('depth_sorting', true, 'No depth conflicts detected');
        }
    }

    /* ═══════════════════════════════════════════════════════
       TEST 6: SHADER UNIFORM VALIDATION
       ═══════════════════════════════════════════════════════ */
    const uniformInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.game?.renderer?.pipelines) return null;
        const result = {};
        const cam = s.cameras?.main;
        if (!cam?.postPipelines) return result;
        for (const pipeline of cam.postPipelines) {
            const name = pipeline.constructor.name;
            const uniforms = {};
            // Read uniform values if available
            if (pipeline.set1f) {
                // Try reading known uniforms per pipeline type
                const gl = pipeline.gl;
                const program = pipeline.program;
                if (gl && program) {
                    const activeUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
                    for (let i = 0; i < activeUniforms; i++) {
                        const info = gl.getActiveUniform(program, i);
                        if (info) {
                            const loc = gl.getUniformLocation(program, info.name);
                            const val = loc ? gl.getUniform(program, loc) : null;
                            uniforms[info.name] = {
                                type: info.type,
                                size: info.size,
                                value: val instanceof Float32Array ? Array.from(val) :
                                       val instanceof Int32Array ? Array.from(val) : val,
                            };
                        }
                    }
                }
            }
            result[name] = { uniformCount: Object.keys(uniforms).length, uniforms };
        }
        return result;
    });

    if (uniformInfo) {
        for (const [name, info] of Object.entries(uniformInfo)) {
            L('INFO', `Shader ${name}: ${info.uniformCount} uniforms`);
            if (info.uniformCount === 0) {
                tracker.add('medium', 'shader', `${name} has no detected uniforms`);
            }
            // Check for NaN/Infinity in uniform values
            for (const [uName, uVal] of Object.entries(info.uniforms || {})) {
                const v = uVal.value;
                if (v === null || v === undefined) continue;
                const vals = Array.isArray(v) ? v : [v];
                for (const num of vals) {
                    if (typeof num === 'number' && (!Number.isFinite(num))) {
                        tracker.add('high', 'shader', `${name}.${uName} has non-finite value: ${num}`);
                    }
                }
            }
            tracker.setCheck('shader_uniforms_' + name, true, `${info.uniformCount} uniforms validated`);
        }
    }

    /* ═══════════════════════════════════════════════════════
       TEST 7: FPS & PERFORMANCE OVER TIME
       ═══════════════════════════════════════════════════════ */
    L('INFO', 'Starting FPS sampling (60s)...');
    const startTime = Date.now();
    let minFps = Infinity, maxFps = 0, fpsSum = 0, fpsSamples = 0;
    let memPeak = 0;

    while ((Date.now() - startTime) < MAX_GAME_S * 1000) {
        await sleep(TICK_MS);

        const perfSnap = await safeEval(page, () => {
            const s = window.__ALIENS_DEBUG_SCENE__;
            if (!s?.game) return null;
            const fps = s.game.loop?.actualFps || 0;
            const enemyCount = s.enemyManager?.enemies?.filter(e => e?.active)?.length || 0;
            const tier = s.lightingOverlay?.currentQualityTier ?? -1;
            let memMB = 0;
            if (performance.memory) {
                memMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
            }
            // Check for WebGL errors
            const gl = s.game.renderer?.gl;
            let glError = 0;
            if (gl) glError = gl.getError();
            return { fps: Math.round(fps), enemyCount, tier, memMB, glError };
        }, 3000);

        if (!perfSnap) continue;

        tracker.fpsHistory.push({
            t: Math.round((Date.now() - startTime) / 1000),
            fps: perfSnap.fps,
            enemies: perfSnap.enemyCount,
            tier: perfSnap.tier,
        });

        if (perfSnap.fps > 0) {
            minFps = Math.min(minFps, perfSnap.fps);
            maxFps = Math.max(maxFps, perfSnap.fps);
            fpsSum += perfSnap.fps;
            fpsSamples++;
        }

        if (perfSnap.memMB > memPeak) memPeak = perfSnap.memMB;
        tracker.memHistory.push({ t: Math.round((Date.now() - startTime) / 1000), mb: perfSnap.memMB });

        if (perfSnap.glError && perfSnap.glError !== 0) {
            tracker.add('high', 'webgl', `WebGL error code: 0x${perfSnap.glError.toString(16)}`);
        }

        if (perfSnap.fps < 15 && perfSnap.fps > 0) {
            tracker.add('high', 'performance', `FPS critically low: ${perfSnap.fps} (enemies=${perfSnap.enemyCount}, tier=${perfSnap.tier})`);
        } else if (perfSnap.fps < 30 && perfSnap.fps > 0) {
            tracker.add('medium', 'performance', `FPS below 30: ${perfSnap.fps} (enemies=${perfSnap.enemyCount})`);
        }

        // Move the player randomly to test different lighting scenarios
        if (Math.random() < 0.3) {
            await safeEval(page, () => {
                const s = window.__ALIENS_DEBUG_SCENE__;
                if (!s?.leader || !s.pathGrid) return;
                const tx = s.leader.x + (Math.random() - 0.5) * 400;
                const ty = s.leader.y + (Math.random() - 0.5) * 400;
                if (s.movementSystem?.moveToPoint) {
                    s.movementSystem.moveToPoint(tx, ty);
                }
            }, 2000);
        }
    }

    const avgFps = fpsSamples > 0 ? Math.round(fpsSum / fpsSamples) : 0;
    L('INFO', `FPS: min=${minFps} max=${maxFps} avg=${avgFps} samples=${fpsSamples}`);
    L('INFO', `Memory peak: ${memPeak}MB`);

    tracker.setCheck('fps_stability', avgFps >= 30, `avg=${avgFps} min=${minFps} max=${maxFps}`);
    if (avgFps < 30 && avgFps > 0) {
        tracker.add('high', 'performance', `Average FPS below 30: ${avgFps}`);
    }
    if (minFps < 10 && minFps < Infinity) {
        tracker.add('high', 'performance', `FPS dropped below 10: ${minFps}`);
    }

    /* ═══════════════════════════════════════════════════════
       TEST 8: PARTICLE SYSTEM & FX VALIDATION
       ═══════════════════════════════════════════════════════ */
    const fxInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return null;
        const result = {
            hasAtmosphere: !!s.atmosphereSystem,
            hasBulletPool: !!s.bulletPool,
            hasAcidSystem: !!(s.acidSplatter || s.acidPoolManager),
            fxPoolCount: 0,
            activeFxSprites: 0,
        };
        // Count FX pool sprites
        if (s._fxPools) {
            for (const [key, pool] of Object.entries(s._fxPools)) {
                result.fxPoolCount++;
                if (pool?.getLength) result.activeFxSprites += pool.getLength();
            }
        }
        return result;
    });

    if (fxInfo) {
        L('INFO', `FX: atmosphere=${fxInfo.hasAtmosphere} bulletPool=${fxInfo.hasBulletPool} acid=${fxInfo.hasAcidSystem} fxPools=${fxInfo.fxPoolCount}`);
        tracker.setCheck('fx_systems', fxInfo.hasBulletPool, fxInfo.hasBulletPool ? 'BulletPool active' : 'BulletPool missing');
        if (fxInfo.hasAtmosphere) tracker.setCheck('atmosphere', true, 'AtmosphereSystem active');
    }

    /* ═══════════════════════════════════════════════════════
       TEST 9: HUD RENDERING VALIDATION
       ═══════════════════════════════════════════════════════ */
    const hudInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s?.hud) return null;
        const hud = s.hud;
        return {
            exists: true,
            visible: hud.container?.visible ?? true,
            depth: hud.container?.depth ?? 0,
            hasMotionTracker: !!s.motionTracker,
            trackerActive: s.motionTracker?.isActive ?? false,
            hasObjectivesPanel: !!s.objectivesPanel,
            hasMissionLog: !!s.missionLog,
        };
    });

    if (hudInfo) {
        L('INFO', `HUD: visible=${hudInfo.visible} depth=${hudInfo.depth} tracker=${hudInfo.hasMotionTracker} objectives=${hudInfo.hasObjectivesPanel}`);
        tracker.setCheck('hud', hudInfo.exists, 'HUD initialized');
        tracker.setCheck('motion_tracker', hudInfo.hasMotionTracker, hudInfo.hasMotionTracker ? 'Motion tracker present' : 'Missing');
    }

    /* ═══════════════════════════════════════════════════════
       TEST 10: ALIEN TAIL & DEBRIS SYSTEMS
       ═══════════════════════════════════════════════════════ */
    const entityFxInfo = await safeEval(page, () => {
        const s = window.__ALIENS_DEBUG_SCENE__;
        if (!s) return null;
        const enemies = s.enemyManager?.enemies || [];
        let tailCount = 0;
        let tailErrors = [];
        for (const e of enemies) {
            if (!e?.active) continue;
            if (e.tailComponent) {
                tailCount++;
                // Validate tail points aren't NaN
                const pts = e.tailComponent.points || [];
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y))) {
                        tailErrors.push(`Tail point ${i} on ${e.enemyType} is NaN/Inf`);
                    }
                }
            }
        }
        const dyingEnemies = s.enemyManager?._dyingEnemies?.length || 0;
        return { tailCount, tailErrors, dyingEnemies, activeEnemies: enemies.filter(e => e?.active).length };
    });

    if (entityFxInfo) {
        L('INFO', `Entity FX: tails=${entityFxInfo.tailCount} dying=${entityFxInfo.dyingEnemies} active=${entityFxInfo.activeEnemies}`);
        for (const err of (entityFxInfo.tailErrors || [])) {
            tracker.add('medium', 'tail', err);
        }
        if (entityFxInfo.tailCount > 0) tracker.setCheck('tail_physics', true, `${entityFxInfo.tailCount} tails active`);
    }

    await browser.close();
    L('INFO', `=== GRAPHICS BOT COMPLETE ${mission} ===`);
    return tracker.summary();
}

/* ═══════════════════════════════════════════════════════════════
   REPORT GENERATION
   ═══════════════════════════════════════════════════════════════ */
function formatReport(results) {
    const lines = [];
    lines.push('══════════════════════════════════════════════════════════════════════');
    lines.push('  ALIENS GRAPHICS BOT — COMPREHENSIVE REPORT');
    lines.push('══════════════════════════════════════════════════════════════════════');

    let totalIssues = 0;
    let totalCritical = 0;
    let totalHigh = 0;

    for (const r of results) {
        lines.push('');
        lines.push('──────────────────────────────────────────────────────────────────────');
        lines.push(`  MISSION: ${r.mission}`);
        lines.push('──────────────────────────────────────────────────────────────────────');
        
        const issueCount = r.issues.length;
        totalIssues += issueCount;
        const critCount = r.bySeverity.critical.length;
        const highCount = r.bySeverity.high.length;
        const medCount = r.bySeverity.medium.length;
        const lowCount = r.bySeverity.low.length;
        totalCritical += critCount;
        totalHigh += highCount;

        lines.push(`  Issues: ${issueCount} (${critCount} critical, ${highCount} high, ${medCount} medium, ${lowCount} low)`);

        // FPS summary
        if (r.fpsHistory.length > 0) {
            const fps = r.fpsHistory.map(f => f.fps).filter(f => f > 0);
            if (fps.length > 0) {
                lines.push(`  FPS: min=${Math.min(...fps)} max=${Math.max(...fps)} avg=${Math.round(fps.reduce((a,b) => a+b, 0) / fps.length)}`);
            }
        }

        if (issueCount > 0) {
            lines.push('');
            lines.push('  ISSUES:');
            for (const sev of ['critical', 'high', 'medium', 'low']) {
                const sevIssues = r.bySeverity[sev];
                if (sevIssues.length === 0) continue;
                lines.push(`    [${sev.toUpperCase()}] (${sevIssues.length}):`);
                for (const i of sevIssues) {
                    lines.push(`      [${i.category}] ${i.msg}`);
                }
            }
        }

        if (Object.keys(r.checks).length > 0) {
            lines.push('');
            lines.push('  CHECKS:');
            for (const [cat, check] of Object.entries(r.checks)) {
                const status = check.fail === 0 ? '✓' : '✗';
                lines.push(`    ${status} ${cat}: ${check.fail === 0 ? 'PASS' : 'FAIL'} (${check.pass}/${check.pass + check.fail})`);
                for (const note of check.notes) {
                    lines.push(`        ${note}`);
                }
            }
        }
    }

    lines.push('');
    lines.push('══════════════════════════════════════════════════════════════════════');
    lines.push('  OVERALL');
    lines.push('──────────────────────────────────────────────────────────────────────');
    lines.push(`  ${results.length} missions | ${totalIssues} issues (${totalCritical} critical, ${totalHigh} high)`);
    lines.push(`  ${totalCritical + totalHigh === 0 ? 'ALL CLEAR' : 'ISSUES FOUND'}`);
    lines.push('══════════════════════════════════════════════════════════════════════');
    return lines.join('\n');
}

/* ── Main ── */
(async () => {
    const results = [];
    for (const m of missions) {
        const r = await runMission(m);
        results.push(r);
    }
    const report = formatReport(results);
    console.log(report);

    const reportPath = path.join(OUT, 'graphics-bot-report.txt');
    fs.writeFileSync(reportPath, report);
    const jsonPath = path.join(OUT, 'graphics-bot-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults: ${jsonPath}`);
    console.log(`Report:  ${reportPath}`);
    process.exit(results.some(r => r.bySeverity.critical.length > 0) ? 2 : 0);
})();
