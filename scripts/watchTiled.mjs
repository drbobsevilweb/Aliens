#!/usr/bin/env node
/**
 * Tiled File Watcher
 *
 * Watches maps/*.json for changes and auto-rebuilds tiledMaps.generated.js.
 * Run alongside Tiled for a live edit→save→refresh workflow.
 *
 * Usage:
 *   node scripts/watchTiled.mjs
 *
 * Workflow:
 *   1. Open your map in Tiled (maps/lv1_colony_hub.json etc.)
 *   2. Run this watcher in a terminal
 *   3. Save in Tiled → watcher rebuilds → refresh browser
 */

import { watch, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const MAPS_DIR = resolve(ROOT, 'maps');
const DEBOUNCE_MS = 500;

let rebuildTimer = null;
let lastBuild = 0;

function rebuild(changedFile) {
    const now = Date.now();
    if (now - lastBuild < DEBOUNCE_MS) return;
    lastBuild = now;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n[${timestamp}] Change detected: ${changedFile}`);
    console.log('  Rebuilding tiledMaps.generated.js...');

    try {
        execSync('npm run build:tiled-maps', {
            cwd: ROOT,
            stdio: 'pipe',
            timeout: 15000,
        });
        console.log('  ✓ Build complete. Refresh browser to see changes.');
    } catch (err) {
        console.error('  ✗ Build failed:');
        if (err.stderr) console.error('   ', err.stderr.toString().trim());
        else console.error('   ', err.message);
    }
}

if (!existsSync(MAPS_DIR)) {
    console.error(`Error: maps/ directory not found at ${MAPS_DIR}`);
    process.exit(1);
}

console.log('Tiled File Watcher');
console.log('==================');
console.log(`Watching: ${MAPS_DIR}/*.json`);
console.log('Press Ctrl+C to stop.\n');

// Initial build
rebuild('(startup)');

watch(MAPS_DIR, { persistent: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return;
    // Ignore tileset files
    if (filename.includes('tileset')) return;

    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuild(filename), DEBOUNCE_MS);
});

// Keep alive
process.on('SIGINT', () => {
    console.log('\nWatcher stopped.');
    process.exit(0);
});
