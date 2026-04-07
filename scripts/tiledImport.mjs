#!/usr/bin/env node
/**
 * tiledImport.mjs — Convert a Tiled JSON map back to the project's native
 *                   tilemapTemplates.js format.
 *
 * Usage:
 *   node scripts/tiledImport.mjs maps/lv1_colony_hub.json
 *   node scripts/tiledImport.mjs maps/lv1_colony_hub.json --id lv1_colony_hub
 *   node scripts/tiledImport.mjs maps/lv1_colony_hub.json --stdout
 *   node scripts/tiledImport.mjs maps/lv1_colony_hub.json --outfile output/level.json
 *
 * Output: A JSON object with { id, name, width, height, terrain, doors, markers }
 *         matching the shape expected by missionLayout.js and the browser editor.
 *
 * The terrain, doors, and markers arrays are 2D [y][x] grids identical to
 * the format used in tilemapTemplates.js.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Constants — mirrors tiledExport.mjs
// ---------------------------------------------------------------------------

const TILE_SIZE = 64;

// Reverse lookup: door type+state → door grid value
const DOOR_REVERSE = {
    'standard|closed':   1,
    'electronic|closed': 2,
    'electronic|locked': 3,
    'standard|welded':   4,
};

// Reverse lookup: marker type → marker grid value
const MARKER_REVERSE = {
    'spawn':          1,
    'extraction':     2,
    'terminal':       3,
    'objective':      3,
    'security_card':  4,
    'queen_marker':   4,
    'alien_spawn':    5,
    'warning_strobe': 6,
    'vent_point':     7,
    'egg_cluster':    8,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProperty(obj, name) {
    if (!Array.isArray(obj?.properties)) return undefined;
    for (let i = obj.properties.length - 1; i >= 0; i--) {
        const prop = obj.properties[i];
        if (prop?.name === name) return prop.value;
    }
    return undefined;
}

function makeGrid(width, height, fill) {
    return Array.from({ length: height }, () => Array(width).fill(fill));
}

// ---------------------------------------------------------------------------
// Convert Tiled JSON → native template format
// ---------------------------------------------------------------------------

export function tiledToTemplate(tiledMap, overrideId) {
    const width = tiledMap.width;
    const height = tiledMap.height;
    const id = overrideId || getProperty(tiledMap, 'templateId') || 'imported_map';
    const name = getProperty(tiledMap, 'templateName') || id;
    const floorTextureKey = String(getProperty(tiledMap, 'floorTextureKey') || 'tile_floor_grill_import');
    const wallTextureKey = String(getProperty(tiledMap, 'wallTextureKey') || 'tile_wall_corridor_import');

    // --- Parse terrain tile layer ---
    const terrain = makeGrid(width, height, 1); // default to wall
    const terrainLayer = tiledMap.layers.find(l => l.name === 'terrain' && l.type === 'tilelayer');
    if (terrainLayer && Array.isArray(terrainLayer.data)) {
        for (let i = 0; i < terrainLayer.data.length; i++) {
            const gid = terrainLayer.data[i];
            const x = i % width;
            const y = Math.floor(i / width);
            if (y < height && x < width) {
                terrain[y][x] = Math.max(0, gid - 1); // Tiled GIDs are 1-based
            }
        }
    }

    // --- Parse door object layer ---
    const doors = makeGrid(width, height, 0);
    const doorLayer = tiledMap.layers.find(l => l.name === 'doors' && l.type === 'objectgroup');
    if (doorLayer && Array.isArray(doorLayer.objects)) {
        for (const obj of doorLayer.objects) {
            // First try the stored doorValue (exact round-trip)
            let doorValue = getProperty(obj, 'doorValue');

            if (doorValue == null) {
                // Reconstruct from type+state
                const doorType = getProperty(obj, 'doorType') || 'standard';
                const initialState = getProperty(obj, 'initialState') || 'closed';
                const key = `${doorType}|${initialState}`;
                doorValue = DOOR_REVERSE[key] || 1;
            }

            // Fill all tiles covered by this door object
            const startTileX = Math.round(obj.x / TILE_SIZE);
            const startTileY = Math.round(obj.y / TILE_SIZE);
            const orientation = String(getProperty(obj, 'orientation') || '').toLowerCase();
            const rotation = ((Math.round((Number(obj.rotation) || 0) / 90) * 90) % 360 + 360) % 360;
            const longAxisTiles = Math.max(1, Math.round(Math.max(Number(obj.width) || 0, Number(obj.height) || 0) / TILE_SIZE));
            const isVertical = orientation === 'vertical'
                || rotation === 90
                || rotation === 270
                || (Number(obj.height) || 0) > (Number(obj.width) || 0);
            const tilesW = isVertical ? 1 : Math.max(1, Math.round(obj.width / TILE_SIZE) || longAxisTiles);
            const tilesH = isVertical ? longAxisTiles : 1;

            for (let dy = 0; dy < tilesH; dy++) {
                for (let dx = 0; dx < tilesW; dx++) {
                    const tx = startTileX + dx;
                    const ty = startTileY + dy;
                    if (ty >= 0 && ty < height && tx >= 0 && tx < width) {
                        doors[ty][tx] = doorValue;
                    }
                }
            }
        }
    }

    // --- Parse marker object layer ---
    const markers = makeGrid(width, height, 0);
    const markerLayer = tiledMap.layers.find(l => l.name === 'markers' && l.type === 'objectgroup');
    if (markerLayer && Array.isArray(markerLayer.objects)) {
        for (const obj of markerLayer.objects) {
            // First try stored markerValue (exact round-trip)
            let markerValue = getProperty(obj, 'markerValue');

            if (markerValue == null) {
                // Reconstruct from type name
                const markerType = (obj.type || obj.name || '').toLowerCase();
                markerValue = MARKER_REVERSE[markerType] || 0;
            }

            if (markerValue <= 0) continue;

            const tileX = Math.round(obj.x / TILE_SIZE);
            const tileY = Math.round(obj.y / TILE_SIZE);
            if (tileY >= 0 && tileY < height && tileX >= 0 && tileX < width) {
                markers[tileY][tileX] = markerValue;
            }
        }
    }

    // --- Parse per-tile texture override object layer ---
    const terrainTextures = makeGrid(width, height, null);
    const textureLayer = tiledMap.layers.find(l => l.name === 'texture_overrides' && l.type === 'objectgroup');
    if (textureLayer && Array.isArray(textureLayer.objects)) {
        for (const obj of textureLayer.objects) {
            const imageKey = String(getProperty(obj, 'imageKey') || '').trim();
            if (!imageKey) continue;
            const tileX = Math.round(obj.x / TILE_SIZE);
            const tileY = Math.round(obj.y / TILE_SIZE);
            if (tileY >= 0 && tileY < height && tileX >= 0 && tileX < width) {
                terrainTextures[tileY][tileX] = imageKey;
            }
        }
    }

    // --- Parse authored props object layer ---
    const props = [];
    const propLayer = tiledMap.layers.find(l => l.name === 'props' && l.type === 'objectgroup');
    if (propLayer && Array.isArray(propLayer.objects)) {
        for (const obj of propLayer.objects) {
            const tileX = Math.round(obj.x / TILE_SIZE);
            const tileY = Math.round(obj.y / TILE_SIZE);
            if (tileY < 0 || tileY >= height || tileX < 0 || tileX >= width) continue;
            const imageKey = String(getProperty(obj, 'imageKey') || '').trim();
            if (!imageKey) continue;
            props.push({
                id: String(obj.name || obj.id || `prop_${tileX}_${tileY}`),
                tileX,
                tileY,
                type: String(getProperty(obj, 'propType') || obj.type || 'prop'),
                imageKey,
                radius: Math.max(0, Number(getProperty(obj, 'radius')) || 18),
            });
        }
    }

    // --- Parse lights object layer ---
    const lights = [];
    const lightLayer = tiledMap.layers.find(l => l.name === 'lights' && l.type === 'objectgroup');
    if (lightLayer && Array.isArray(lightLayer.objects)) {
        for (const obj of lightLayer.objects) {
            const tileX = Math.round(obj.x / TILE_SIZE);
            const tileY = Math.round(obj.y / TILE_SIZE);
            if (tileY < 0 || tileY >= height || tileX < 0 || tileX >= width) continue;
            lights.push({
                id: String(obj.name || obj.id || `light_${tileX}_${tileY}`),
                tileX,
                tileY,
                type: String(getProperty(obj, 'lightType') || 'spot'),
                radius: Math.max(0, Number(getProperty(obj, 'radius')) || 240),
                brightness: Math.max(0, Number(getProperty(obj, 'brightness') || getProperty(obj, 'intensity')) || 0.5),
                color: String(getProperty(obj, 'color') || '#ffffff'),
                flickering: !!getProperty(obj, 'flickering'),
                pulsing: !!getProperty(obj, 'pulsing'),
            });
        }
    }

    return { id, name, width, height, terrain, doors, markers, terrainTextures, floorTextureKey, wallTextureKey, props, lights };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateTemplate(template) {
    const warnings = [];
    const { terrain, doors, markers, width, height } = template;

    // Check spawn exists
    let hasSpawn = false, hasExtraction = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (markers[y][x] === 1) hasSpawn = true;
            if (markers[y][x] === 2) hasExtraction = true;
        }
    }
    if (!hasSpawn) warnings.push('No spawn marker (value 1) found');
    if (!hasExtraction) warnings.push('No extraction marker (value 2) found');

    // Check doors are on valid tiles
    let doorCount = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (doors[y][x] > 0) {
                doorCount++;
                // Doors should be on floor or wall-edge tiles
                // (the game handles this, but flag if on interior wall)
            }
        }
    }

    // Count floor tiles
    let floorCount = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (terrain[y][x] === 0) floorCount++;
        }
    }

    return {
        valid: warnings.length === 0,
        warnings,
        stats: {
            width,
            height,
            floorTiles: floorCount,
            wallTiles: width * height - floorCount,
            doors: doorCount,
            floorPercent: ((floorCount / (width * height)) * 100).toFixed(1),
        },
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2);
    let inputFile = null;
    let outFile = null;
    let overrideId = null;
    let toStdout = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--outfile' && args[i + 1]) {
            outFile = resolve(args[++i]);
        } else if (args[i] === '--id' && args[i + 1]) {
            overrideId = args[++i];
        } else if (args[i] === '--stdout') {
            toStdout = true;
        } else if (!args[i].startsWith('-')) {
            inputFile = resolve(args[i]);
        }
    }

    if (!inputFile) {
        console.error('Usage: node scripts/tiledImport.mjs <tiled-map.json> [--id ID] [--stdout] [--outfile path]');
        process.exit(1);
    }

    const raw = readFileSync(inputFile, 'utf-8');
    let tiledMap;
    try {
        tiledMap = JSON.parse(raw);
    } catch (err) {
        console.error(`Failed to parse JSON: ${err.message}`);
        process.exit(1);
    }

    // Basic Tiled format validation
    if (!tiledMap.layers || !Array.isArray(tiledMap.layers)) {
        console.error('Invalid Tiled JSON: missing layers array');
        process.exit(1);
    }
    if (!tiledMap.width || !tiledMap.height) {
        console.error('Invalid Tiled JSON: missing width/height');
        process.exit(1);
    }

    const template = tiledToTemplate(tiledMap, overrideId);
    const validation = validateTemplate(template);

    if (toStdout) {
        process.stdout.write(JSON.stringify(template, null, 2) + '\n');
    } else {
        const dest = outFile || inputFile.replace(/\.json$/, '.template.json');
        writeFileSync(dest, JSON.stringify(template, null, 2));
        console.log(`Imported: ${dest}`);
    }

    // Print validation report
    console.error(`\nMap: ${template.name} (${template.id})`);
    console.error(`Size: ${validation.stats.width}×${validation.stats.height} tiles`);
    console.error(`Floor: ${validation.stats.floorTiles} tiles (${validation.stats.floorPercent}%)`);
    console.error(`Doors: ${validation.stats.doors} tiles`);

    if (validation.warnings.length > 0) {
        console.error('\nWarnings:');
        for (const w of validation.warnings) console.error(`  - ${w}`);
    } else {
        console.error('\nValidation: OK');
    }
}

const isEntrypoint = process.argv[1]
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
    main();
}
