#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    DEFAULT_RUNTIME_SETTINGS,
    loadRuntimeSettings,
    saveRuntimeSettings,
    resetRuntimeSettings,
    mergeRuntimeSettings,
} from '../src/settings/runtimeSettings.js';

function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function walkNumericPaths(obj, path = [], out = []) {
    for (const [k, v] of Object.entries(obj)) {
        const next = [...path, k];
        if (isObject(v)) walkNumericPaths(v, next, out);
        else if (typeof v === 'number') out.push(next);
    }
    return out;
}

function getAt(obj, path) {
    return path.reduce((acc, key) => acc?.[key], obj);
}

function setAt(obj, path, value) {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!isObject(cur[key])) cur[key] = {};
        cur = cur[key];
    }
    cur[path[path.length - 1]] = value;
}

function withWindowMock(windowLike, fn) {
    const hasWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
    const prevWindow = globalThis.window;
    globalThis.window = windowLike;
    try {
        return fn();
    } finally {
        if (hasWindow) globalThis.window = prevWindow;
        else delete globalThis.window;
    }
}

function testFallbacksMatchDefaults() {
    const numericPaths = walkNumericPaths(DEFAULT_RUNTIME_SETTINGS);
    const mismatches = [];
    for (const path of numericPaths) {
        const patch = {};
        setAt(patch, path, '__invalid__');
        const sanitized = saveRuntimeSettings(patch);
        const expected = getAt(DEFAULT_RUNTIME_SETTINGS, path);
        const actual = getAt(sanitized, path);
        if (expected !== actual) {
            mismatches.push(`${path.join('.')} expected ${expected} got ${actual}`);
        }
    }
    assert.equal(
        mismatches.length,
        0,
        `sanitize fallback drift detected:\n${mismatches.join('\n')}`
    );
}

function testStorageFailuresAreNonFatal() {
    const badStorage = {
        getItem() {
            throw new Error('getItem blocked');
        },
        setItem() {
            throw new Error('setItem blocked');
        },
    };
    withWindowMock({ localStorage: badStorage }, () => {
        assert.doesNotThrow(() => loadRuntimeSettings());
        assert.doesNotThrow(() => saveRuntimeSettings({ player: { leaderSpeed: 222 } }));
        assert.doesNotThrow(() => resetRuntimeSettings());
        assert.doesNotThrow(() => mergeRuntimeSettings({ player: { leaderSpeed: 199 } }));

        const saved = saveRuntimeSettings({ player: { leaderSpeed: 222 } });
        assert.equal(saved.player.leaderSpeed, 222);
        const reset = resetRuntimeSettings();
        assert.equal(reset.player.leaderSpeed, DEFAULT_RUNTIME_SETTINGS.player.leaderSpeed);
    });
}

function main() {
    testFallbacksMatchDefaults();
    testStorageFailuresAreNonFatal();
    console.log('runtimeSettings.spec: ok');
}

main();
