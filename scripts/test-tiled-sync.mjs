#!/usr/bin/env node

import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tiledToTemplate, validateTemplate } from './tiledImport.mjs';
import { TILED_MAP_TEMPLATES } from '../src/data/tiledMaps.generated.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAPS_DIR = path.join(ROOT, 'maps');
const GENERATED_FILE = path.join(ROOT, 'src/data/tiledMaps.generated.js');
const TILESET_FILE = path.join(ROOT, 'maps/aliens_tileset.png');

function listMapFiles() {
    return readdirSync(MAPS_DIR)
        .filter((name) => name.endsWith('.json') && !name.endsWith('.template.json'))
        .sort();
}

function normalizeTemplates(templates) {
    return [...templates]
        .map((entry) => ({
            id: String(entry.id),
            data: JSON.stringify(entry),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
    if (!existsSync(GENERATED_FILE)) {
        throw new Error('Missing src/data/tiledMaps.generated.js. Run `npm run build:tiled-maps`.');
    }
    if (!existsSync(TILESET_FILE)) {
        throw new Error('Missing maps/aliens_tileset.png. Run `npm run build:tiled-tileset`.');
    }

    const files = listMapFiles();
    const fromMaps = [];

    for (const file of files) {
        const raw = JSON.parse(readFileSync(path.join(MAPS_DIR, file), 'utf8'));
        const template = tiledToTemplate(raw);
        const validation = validateTemplate(template);
        if (!validation.valid) {
            throw new Error(`Invalid Tiled map ${file}: ${validation.warnings.join('; ')}`);
        }
        fromMaps.push(template);
    }

    const actual = normalizeTemplates(TILED_MAP_TEMPLATES);
    const expected = normalizeTemplates(fromMaps);

    if (actual.length !== expected.length) {
        throw new Error(`Generated Tiled module is out of sync: expected ${expected.length} map(s), found ${actual.length}. Run \`npm run build:tiled-maps\`.`);
    }

    for (let i = 0; i < expected.length; i++) {
        if (expected[i].id !== actual[i].id || expected[i].data !== actual[i].data) {
            throw new Error(`Generated Tiled module is stale for map ${expected[i].id}. Run \`npm run build:tiled-maps\`.`);
        }
    }

    console.log(`[test-tiled-sync] ok (${expected.length} map(s) in sync)`);
}

main();
