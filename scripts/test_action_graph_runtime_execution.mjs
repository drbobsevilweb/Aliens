#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url, attempts = 40) {
    for (let index = 0; index < attempts; index += 1) {
        try {
            const response = await fetch(`${url}/api/health`);
            if (response.ok) return;
        } catch {
            // Server is still starting.
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

async function run() {
    const server = spawn('node', ['server.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, PORT: String(PORT), NO_TILED_WATCH: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let serverOutput = '';
    server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
    server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });

    try {
        await waitForServer(BASE_URL);

        const graphId = 'runtime-play-sound-smoke';
        const graph = {
            id: graphId,
            name: 'Runtime Play Sound Smoke',
            enabled: true,
            nodes: [
                { id: 'event-1', type: 'event', x: 40, y: 40, data: { eventName: 'leaderHealed' } },
                { id: 'action-1', type: 'action', x: 220, y: 40, data: { actionType: 'play_sound', key: 'motion_tracker_beep' } },
            ],
            connections: [
                { id: 'event-1->action-1', fromNode: 'event-1', toNode: 'action-1' },
            ],
        };

        let response = await fetch(`${BASE_URL}/api/svg-actions/${graphId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(graph),
        });
        assert.equal(response.status, 200, 'svg-actions POST should succeed');

        response = await fetch(`${BASE_URL}/api/svg-actions`);
        assert.equal(response.status, 200, 'svg-actions list should succeed');
        const listPayload = await response.json();
        assert.equal(listPayload.ok, true, 'svg-actions list should return ok');
        assert.ok(Array.isArray(listPayload.graphs), 'svg-actions list should return graphs array');
        assert.ok(listPayload.graphs.some((entry) => entry.id === graphId), 'saved graph should appear in list');

        response = await fetch(`${BASE_URL}/api/svg-actions/${graphId}`);
        assert.equal(response.status, 200, 'svg-actions GET should succeed');
        const graphPayload = await response.json();
        assert.equal(graphPayload.ok, true, 'svg-actions GET should return ok');
        assert.equal(graphPayload.graph.id, graphId, 'svg-actions GET should return saved graph');

        const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
        try {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            await context.route('**/api/mission-package', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        package: {
                            maps: [],
                            missions: [],
                            directorEvents: [],
                            audioCues: [],
                            nodeGraphs: [graph],
                        },
                    }),
                });
            });

            const page = await context.newPage();
            const pageErrors = [];
            page.on('pageerror', (error) => pageErrors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') pageErrors.push(message.text());
            });

            await page.goto(`${BASE_URL}/game?mission=m1&package=local`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForFunction(() => !!window.__ALIENS_DEBUG_SCENE__?.graphRunner, { timeout: 20000 });

            const runtimeResult = await page.evaluate(() => {
                const scene = window.__ALIENS_DEBUG_SCENE__;
                if (!scene?.eventBus || !scene?.sfx) return { ok: false, reason: 'Scene or event bus unavailable' };
                const calls = [];
                const original = scene.sfx.playKey?.bind(scene.sfx);
                scene.sfx.playKey = (key, gain) => {
                    calls.push({ key, gain });
                    return true;
                };
                scene.eventBus.emit('leaderHealed', { x: 320, y: 240 });
                scene.sfx.playKey = original;
                return { ok: true, calls };
            });

            assert.equal(runtimeResult.ok, true, runtimeResult.reason || 'runtime graph evaluation should succeed');
            assert.ok(runtimeResult.calls.some((entry) => entry.key === 'motion_tracker_beep'), 'leaderHealed graph should dispatch play_sound with motion_tracker_beep');
            assert.deepEqual(pageErrors, [], `game page should load without JS errors: ${pageErrors.join('; ')}`);

            await page.close();
            await context.close();
        } finally {
            await browser.close();
        }

        response = await fetch(`${BASE_URL}/api/svg-actions/${graphId}`, { method: 'DELETE' });
        assert.equal(response.status, 200, 'svg-actions DELETE should succeed');

        console.log('action graph runtime execution smoke test passed');
    } finally {
        server.kill('SIGTERM');
        await delay(250);
        if (!server.killed) server.kill('SIGKILL');
        if (serverOutput.trim()) {
            // Keep available for debugging if this test fails under automation.
        }
    }
}

run().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
});