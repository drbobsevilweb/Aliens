#!/usr/bin/env node
/**
 * tiledExport.mjs — Convert tilemapTemplates.js levels to Tiled JSON format.
 *
 * Usage:
 *   node scripts/tiledExport.mjs                 # export all levels
 *   node scripts/tiledExport.mjs lv1_colony_hub  # export a specific level by id
 *   node scripts/tiledExport.mjs --outdir maps/  # custom output directory
 *
 * Output: one .json file per level, loadable in Tiled (https://www.mapeditor.org/)
 *         and directly by Phaser 3 via this.load.tilemapTiledJSON().
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Constants — must match tilemapTemplates.js and missionLayout.js
// ---------------------------------------------------------------------------

const TILE_SIZE = 64;

// Terrain tile indices (0-indexed in source, 1-indexed in Tiled GID)
const TERRAIN_NAMES = { 0: 'floor', 1: 'wall', 2: 'hazard_floor', 3: 'grating_floor' };
const TERRAIN_COUNT = Object.keys(TERRAIN_NAMES).length;

// Door grid values → types and initial states
const DOOR_VALUE_MAP = {
    1: { type: 'standard',   initialState: 'closed' },
    2: { type: 'electronic', initialState: 'closed' },
    3: { type: 'electronic', initialState: 'locked' },
    4: { type: 'standard',   initialState: 'welded' },
};

// Marker grid values → object types
const MARKER_VALUE_MAP = {
    1: 'spawn',
    2: 'extraction',
    3: 'terminal',
    4: 'security_card',
    5: 'alien_spawn',
    6: 'warning_strobe',
    7: 'vent_point',
    8: 'egg_cluster',
};

// ---------------------------------------------------------------------------
// Dynamically import the templates (ES module with export)
// ---------------------------------------------------------------------------

async function loadTemplates() {
    // We can't directly import the game module (it references CONFIG which
    // imports browser-only Phaser). Instead, evaluate just the template file
    // after stripping the import/export and inlining the constants it needs.
    const src = readFileSync(join(ROOT, 'src/data/tilemapTemplates.js'), 'utf-8');

    // Strip ES module syntax and provide the constants inline
    const patched = src
        .replace(/^export\s+const\s+/m, 'const ')
        .replace(/Object\.freeze\(\[/, '[')
        .replace(/\]\);?\s*$/, '];');

    // Wrap in a function that returns TILEMAP_TEMPLATES
    // WIDTH and HEIGHT are already declared in the source file
    const wrapped = `
        ${patched}
        return TILEMAP_TEMPLATES;
    `;

    const fn = new Function(wrapped);
    return fn();
}

// ---------------------------------------------------------------------------
// Flood-fill connected door components (mirrors missionLayout.js logic)
// ---------------------------------------------------------------------------

function collectDoorComponents(doorGrid) {
    const h = doorGrid.length;
    const w = (doorGrid[0] || []).length;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const groups = [];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const value = doorGrid[y][x];
            if (value <= 0 || visited[y][x]) continue;

            const queue = [{ x, y }];
            visited[y][x] = true;
            const tiles = [];

            while (queue.length > 0) {
                const cur = queue.shift();
                tiles.push({ x: cur.x, y: cur.y });
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nx = cur.x + dx, ny = cur.y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    if (visited[ny][nx]) continue;
                    if (doorGrid[ny][nx] !== value) continue;
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }

            tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            groups.push({ value, tiles });
        }
    }
    return groups;
}

// ---------------------------------------------------------------------------
// Convert a single template to Tiled JSON
// ---------------------------------------------------------------------------

function templateToTiled(template) {
    const { id, name, width, height, terrain, doors, markers } = template;
    const floorTextureKey = typeof template.floorTextureKey === 'string' ? template.floorTextureKey : 'tile_floor_grill_import';
    const wallTextureKey = typeof template.wallTextureKey === 'string' ? template.wallTextureKey : 'tile_wall_corridor_import';
    const terrainTextures = Array.isArray(template.terrainTextures) ? template.terrainTextures : [];
    const props = Array.isArray(template.props) ? template.props : [];
    const lights = Array.isArray(template.lights) ? template.lights : [];

    // --- Terrain tile layer (1-indexed GIDs) ---
    const terrainData = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = (terrain[y] && terrain[y][x]) || 0;
            terrainData.push(cell + 1); // Tiled GIDs are 1-based
        }
    }

    // --- Door object layer ---
    const doorObjects = [];
    if (Array.isArray(doors) && doors.length > 0) {
        const components = collectDoorComponents(doors);
        components.forEach((group, i) => {
            const def = DOOR_VALUE_MAP[group.value] || { type: 'standard', initialState: 'closed' };
            const minX = Math.min(...group.tiles.map(t => t.x));
            const minY = Math.min(...group.tiles.map(t => t.y));
            const maxX = Math.max(...group.tiles.map(t => t.x));
            const maxY = Math.max(...group.tiles.map(t => t.y));
            const isHorizontal = (maxX - minX) >= (maxY - minY);

            doorObjects.push({
                id: i + 1,
                name: `door_${i + 1}`,
                type: 'door',
                x: minX * TILE_SIZE,
                y: minY * TILE_SIZE,
                width: (maxX - minX + 1) * TILE_SIZE,
                height: (maxY - minY + 1) * TILE_SIZE,
                rotation: 0,
                visible: true,
                properties: [
                    { name: 'doorType', type: 'string', value: def.type },
                    { name: 'initialState', type: 'string', value: def.initialState },
                    { name: 'orientation', type: 'string', value: isHorizontal ? 'horizontal' : 'vertical' },
                    { name: 'doorValue', type: 'int', value: group.value },
                ],
            });
        });
    }

    // --- Marker object layer ---
    const markerObjects = [];
    let markerId = doorObjects.length + 1;
    if (Array.isArray(markers)) {
        for (let y = 0; y < markers.length; y++) {
            const row = markers[y];
            if (!Array.isArray(row)) continue;
            for (let x = 0; x < row.length; x++) {
                const val = row[x];
                if (val <= 0) continue;
                const markerType = MARKER_VALUE_MAP[val] || `marker_${val}`;
                markerObjects.push({
                    id: markerId++,
                    name: markerType,
                    type: markerType,
                    x: x * TILE_SIZE,
                    y: y * TILE_SIZE,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    rotation: 0,
                    visible: true,
                    properties: [
                        { name: 'markerValue', type: 'int', value: val },
                    ],
                });
            }
        }
    }

    // --- Per-tile texture override object layer ---
    const textureObjects = [];
    for (let y = 0; y < height; y++) {
        const row = terrainTextures[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < width; x++) {
            const imageKey = typeof row[x] === 'string' ? row[x].trim() : '';
            if (!imageKey) continue;
            textureObjects.push({
                id: markerId++,
                name: `tex_${x}_${y}`,
                type: 'terrain_texture',
                x: x * TILE_SIZE,
                y: y * TILE_SIZE,
                width: TILE_SIZE,
                height: TILE_SIZE,
                rotation: 0,
                visible: true,
                properties: [
                    { name: 'imageKey', type: 'string', value: imageKey },
                ],
            });
        }
    }

    // --- Authored props object layer ---
    const propObjects = [];
    for (const prop of props) {
        const tileX = Math.round(Number(prop?.tileX));
        const tileY = Math.round(Number(prop?.tileY));
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
        const imageKey = String(prop?.imageKey || '').trim();
        if (!imageKey) continue;
        const radius = Math.max(0, Number(prop?.radius) || 18);
        propObjects.push({
            id: markerId++,
            name: String(prop?.id || `prop_${tileX}_${tileY}`),
            type: 'prop',
            x: tileX * TILE_SIZE,
            y: tileY * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            rotation: 0,
            visible: true,
            properties: [
                { name: 'imageKey', type: 'string', value: imageKey },
                { name: 'propType', type: 'string', value: String(prop?.type || 'prop') },
                { name: 'radius', type: 'float', value: radius },
            ],
        });
    }

    // --- Lights object layer ---
    const lightObjects = [];
    for (const light of lights) {
        const tileX = Math.round(Number(light?.tileX));
        const tileY = Math.round(Number(light?.tileY));
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
        const lightType = String(light?.type || 'spot');
        const radius = Math.max(0, Number(light?.radius) || 240);
        const brightness = Math.max(0, Math.min(2, Number(light?.brightness) || 0.5));
        const color = String(light?.color || '#ffffff');
        lightObjects.push({
            id: markerId++,
            name: String(light?.id || `light_${tileX}_${tileY}`),
            type: 'light',
            x: tileX * TILE_SIZE,
            y: tileY * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            rotation: 0,
            visible: true,
            properties: [
                { name: 'lightType', type: 'string', value: lightType },
                { name: 'radius', type: 'float', value: radius },
                { name: 'brightness', type: 'float', value: brightness },
                { name: 'color', type: 'string', value: color },
                { name: 'flickering', type: 'bool', value: !!light?.flickering },
                { name: 'pulsing', type: 'bool', value: !!light?.pulsing },
            ],
        });
    }

    // --- Tileset definition ---
    const tileset = {
        firstgid: 1,
        name: 'aliens_tiles',
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: TERRAIN_COUNT,
        columns: TERRAIN_COUNT,
        image: 'aliens_tileset.png',
        imagewidth: TERRAIN_COUNT * TILE_SIZE,
        imageheight: TILE_SIZE,
        margin: 0,
        spacing: 0,
        tiles: Object.entries(TERRAIN_NAMES).map(([idx, tileName]) => ({
            id: Number(idx),
            type: tileName,
            properties: [
                { name: 'solid', type: 'bool', value: tileName === 'wall' },
            ],
        })),
    };

    // --- Assemble Tiled JSON ---
    return {
        compressionlevel: -1,
        height,
        width,
        infinite: false,
        orientation: 'orthogonal',
        renderorder: 'right-down',
        tiledversion: '1.11',
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        type: 'map',
        version: '1.10',
        layers: [
            {
                id: 1,
                name: 'terrain',
                type: 'tilelayer',
                data: terrainData,
                width,
                height,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
            },
            {
                id: 2,
                name: 'doors',
                type: 'objectgroup',
                objects: doorObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 3,
                name: 'markers',
                type: 'objectgroup',
                objects: markerObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 4,
                name: 'texture_overrides',
                type: 'objectgroup',
                objects: textureObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 5,
                name: 'props',
                type: 'objectgroup',
                objects: propObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
            {
                id: 6,
                name: 'lights',
                type: 'objectgroup',
                objects: lightObjects,
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                draworder: 'topdown',
            },
        ],
        tilesets: [tileset],
        properties: [
            { name: 'templateId', type: 'string', value: id },
            { name: 'templateName', type: 'string', value: name },
            { name: 'floorTextureKey', type: 'string', value: floorTextureKey },
            { name: 'wallTextureKey', type: 'string', value: wallTextureKey },
        ],
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const args = process.argv.slice(2);
    let outDir = join(ROOT, 'maps');
    let filterId = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--outdir' && args[i + 1]) {
            outDir = resolve(args[++i]);
        } else if (!args[i].startsWith('-')) {
            filterId = args[i];
        }
    }

    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const templates = await loadTemplates();
    let exported = 0;

    for (const tmpl of templates) {
        if (filterId && tmpl.id !== filterId) continue;

        const tiledMap = templateToTiled(tmpl);
        const filename = `${tmpl.id}.json`;
        const outPath = join(outDir, filename);
        writeFileSync(outPath, JSON.stringify(tiledMap, null, 2));
        console.log(`Exported: ${outPath}  (${tmpl.name})`);
        exported++;
    }

    if (exported === 0) {
        console.error(filterId
            ? `No template found with id "${filterId}"`
            : 'No templates found');
        process.exit(1);
    }

    console.log(`\n${exported} map(s) exported to ${outDir}/`);
    console.log('Open in Tiled: File → Open → select the .json file');
    console.log('Note: Create aliens_tileset.png (4 tiles × 64px) in the maps/ folder for visual editing');
}

main().catch(err => { console.error(err); process.exit(1); });
