#!/usr/bin/env node
/**
 * generateTileset.mjs — Create a Tiled-friendly terrain tileset PNG.
 *
 * Produces `maps/aliens_tileset.png` as a 4-tile strip (256×64px):
 *   Tile 0: floor
 *   Tile 1: wall
 *   Tile 2: hazard floor
 *   Tile 3: grating floor
 *
 * The script prefers real in-game textures where they exist and falls back to
 * procedural tiles for any missing sources.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { deflateSync } from 'zlib';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TILE = 64;
const TILES = 4;
const OUT_PATH = path.join(ROOT, 'maps', 'aliens_tileset.png');

const SOURCES = [
    {
        file: 'src/graphics/imported/floor_grill_bluesteel_64_sharp.png',
        fallback: renderFloorTile,
    },
    {
        file: 'src/graphics/imported/wall_corridor_bluesteel_64_sharp.png',
        fallback: renderWallTile,
    },
    {
        file: null,
        fallback: renderHazardTile,
    },
    {
        file: null,
        fallback: renderGratingTile,
    },
];

function rgba(r, g, b, a = 255) {
    return [r, g, b, a];
}

function makeCanvas(fill) {
    const buf = Buffer.alloc(TILE * TILE * 4);
    for (let i = 0; i < TILE * TILE; i++) {
        const o = i * 4;
        buf[o] = fill[0];
        buf[o + 1] = fill[1];
        buf[o + 2] = fill[2];
        buf[o + 3] = fill[3];
    }
    return buf;
}

function fillRect(buf, x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h && y < TILE; y++) {
        if (y < 0) continue;
        for (let x = x0; x < x0 + w && x < TILE; x++) {
            if (x < 0) continue;
            const i = (y * TILE + x) * 4;
            buf[i] = color[0];
            buf[i + 1] = color[1];
            buf[i + 2] = color[2];
            buf[i + 3] = color[3];
        }
    }
}

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePngRgba(pixels, width, height) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const rowLen = width * 4 + 1;
    const raw = Buffer.alloc(rowLen * height);
    for (let y = 0; y < height; y++) {
        raw[y * rowLen] = 0;
        for (let x = 0; x < width * 4; x++) {
            raw[y * rowLen + 1 + x] = pixels[y * width * 4 + x];
        }
    }
    const idat = deflateSync(raw);
    return Buffer.concat([
        sig,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function renderFloorTile() {
    const buf = makeCanvas(rgba(28, 40, 48));
    for (let x = 0; x < TILE; x += 16) fillRect(buf, x, 0, 1, TILE, rgba(22, 34, 42));
    for (let y = 0; y < TILE; y += 16) fillRect(buf, 0, y, TILE, 1, rgba(22, 34, 42));
    return buf;
}

function renderWallTile() {
    const buf = makeCanvas(rgba(58, 62, 72));
    fillRect(buf, 0, 0, TILE, 2, rgba(72, 78, 88));
    fillRect(buf, 0, TILE - 2, TILE, 2, rgba(40, 44, 52));
    for (let x = 8; x < TILE; x += 12) {
        fillRect(buf, x, 4, 2, 2, rgba(80, 90, 100));
        fillRect(buf, x, TILE - 6, 2, 2, rgba(80, 90, 100));
    }
    return buf;
}

function renderHazardTile() {
    const buf = makeCanvas(rgba(50, 45, 30));
    const stripe = rgba(196, 168, 32);
    for (let d = -TILE; d < TILE * 2; d += 12) {
        for (let band = 0; band < 4; band++) {
            for (let y = 0; y < TILE; y++) {
                const x = d + band + y;
                if (x < 0 || x >= TILE) continue;
                const i = (y * TILE + x) * 4;
                buf[i] = stripe[0];
                buf[i + 1] = stripe[1];
                buf[i + 2] = stripe[2];
                buf[i + 3] = stripe[3];
            }
        }
    }
    return buf;
}

function renderGratingTile() {
    const buf = makeCanvas(rgba(35, 48, 55));
    const line = rgba(22, 34, 40);
    for (let x = 0; x < TILE; x += 8) fillRect(buf, x, 0, 1, TILE, line);
    for (let y = 0; y < TILE; y += 8) fillRect(buf, 0, y, TILE, 1, line);
    return buf;
}

async function buildTile(entry) {
    const sharp = await loadSharp();
    const abs = entry.file ? path.join(ROOT, entry.file) : null;
    if (sharp && abs && existsSync(abs)) {
        return sharp(abs)
            .resize(TILE, TILE, { fit: 'cover' })
            .png()
            .toBuffer();
    }
    if (sharp) {
        return sharp(entry.fallback(), {
            raw: { width: TILE, height: TILE, channels: 4 },
        }).png().toBuffer();
    }
    return entry.fallback();
}

let sharpPromise = null;
async function loadSharp() {
    if (sharpPromise) return sharpPromise;
    sharpPromise = import('sharp')
        .then((mod) => mod.default || mod)
        .catch(() => null);
    return sharpPromise;
}

async function main() {
    const sharp = await loadSharp();
    const outDir = path.dirname(OUT_PATH);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    if (sharp) {
        const composites = [];
        for (let i = 0; i < SOURCES.length; i++) {
            const input = await buildTile(SOURCES[i]);
            composites.push({ input, left: i * TILE, top: 0 });
        }

        await sharp({
            create: {
                width: TILE * TILES,
                height: TILE,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .composite(composites)
            .png()
            .toFile(OUT_PATH);
    } else {
        const tiles = SOURCES.map((entry) => entry.fallback());
        const sheet = Buffer.alloc(TILE * TILES * TILE * 4);
        for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
            const tile = tiles[tileIndex];
            for (let y = 0; y < TILE; y++) {
                for (let x = 0; x < TILE; x++) {
                    const src = (y * TILE + x) * 4;
                    const dst = (y * TILE * TILES + tileIndex * TILE + x) * 4;
                    sheet[dst] = tile[src];
                    sheet[dst + 1] = tile[src + 1];
                    sheet[dst + 2] = tile[src + 2];
                    sheet[dst + 3] = tile[src + 3];
                }
            }
        }

        writeFileSync(OUT_PATH, encodePngRgba(sheet, TILE * TILES, TILE));
    }

    console.log(`Generated tileset: ${OUT_PATH} (${TILE * TILES}x${TILE}px, ${TILES} tiles)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
