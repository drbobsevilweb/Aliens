#!/usr/bin/env node
/**
 * Aseprite Import Script
 *
 * Reads Aseprite JSON+PNG exports and converts them into the game's
 * spritesheet format, then generates a loader snippet for BootScene.
 *
 * Usage:
 *   node scripts/asepriteImport.mjs <aseprite-json> [--out <dir>] [--key <texture-key>]
 *
 * Aseprite export settings:
 *   File → Export Sprite Sheet
 *   - Layout: Horizontal Strip (or Sheet - packed)
 *   - Output File: spritesheet.png
 *   - JSON Data: spritesheet.json  (Array format)
 *   - Meta → Frame Tags: include if using animations
 *
 * Output:
 *   - Copies PNG to src/graphics/imported/<key>.png
 *   - Generates src/graphics/imported/<key>.meta.json (frame data)
 *   - Prints BootScene.preload() snippet to paste
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_OUT = join(ROOT, 'src', 'graphics', 'imported');

function parseArgs() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Aseprite Import Script

Usage:
  node scripts/asepriteImport.mjs <aseprite-json> [options]

Options:
  --out <dir>    Output directory (default: src/graphics/imported/)
  --key <name>   Texture key in Phaser (default: filename without extension)
  --anim         Generate animation definitions (default: auto-detect from frame tags)

Aseprite Export Setup:
  1. Open your .aseprite file
  2. File → Export Sprite Sheet
  3. Sheet Type: Horizontal Strip (recommended) or Packed
  4. Check "JSON Data" and select "Array" format
  5. Enable Frame Tags if you have named animations
  6. Export both .png and .json files
  7. Run this script on the .json file

Example:
  node scripts/asepriteImport.mjs ~/sprites/alien_boss.json --key alien_boss
`);
        process.exit(0);
    }

    const jsonPath = resolve(args[0]);
    let outDir = DEFAULT_OUT;
    let textureKey = '';
    let wantAnim = false;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--out' && args[i + 1]) { outDir = resolve(args[++i]); }
        else if (args[i] === '--key' && args[i + 1]) { textureKey = args[++i]; }
        else if (args[i] === '--anim') { wantAnim = true; }
    }

    if (!textureKey) {
        textureKey = basename(jsonPath, '.json').replace(/[^a-zA-Z0-9_]/g, '_');
    }

    return { jsonPath, outDir, textureKey, wantAnim };
}

function loadAsepriteJSON(path) {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw);
}

function extractFrameData(data) {
    // Aseprite exports frames as either an object or array
    let frames;
    if (Array.isArray(data.frames)) {
        frames = data.frames;
    } else if (data.frames && typeof data.frames === 'object') {
        // Object format: keys are filenames, values are frame data
        frames = Object.entries(data.frames).map(([filename, frame]) => ({
            filename,
            ...frame,
        }));
    } else {
        throw new Error('No frames found in Aseprite JSON');
    }

    return frames.map((f, i) => ({
        index: i,
        filename: f.filename || `frame_${i}`,
        x: f.frame.x,
        y: f.frame.y,
        w: f.frame.w,
        h: f.frame.h,
        sourceW: f.sourceSize?.w || f.frame.w,
        sourceH: f.sourceSize?.h || f.frame.h,
        duration: f.duration || 100,
        trimmed: f.trimmed || false,
        spriteSourceX: f.spriteSourceSize?.x || 0,
        spriteSourceY: f.spriteSourceSize?.y || 0,
    }));
}

function extractAnimations(data) {
    const meta = data.meta || {};
    const tags = meta.frameTags || [];
    return tags.map(tag => ({
        name: tag.name,
        from: tag.from,
        to: tag.to,
        direction: tag.direction || 'forward',
    }));
}

function resolveImagePath(jsonPath, data) {
    const meta = data.meta || {};
    const imageName = meta.image || basename(jsonPath, '.json') + '.png';
    // Try relative to JSON file first
    const candidate = join(dirname(jsonPath), imageName);
    if (existsSync(candidate)) return candidate;
    // Try same name as JSON but .png
    const fallback = jsonPath.replace(/\.json$/, '.png');
    if (existsSync(fallback)) return fallback;
    throw new Error(`Cannot find spritesheet PNG. Tried:\n  ${candidate}\n  ${fallback}`);
}

function generateBootSnippet(key, relPath, frameW, frameH, frameCount, animations) {
    const lines = [];
    lines.push(`// ── Aseprite import: ${key} ──`);

    if (frameCount > 1) {
        lines.push(`this.load.spritesheet('${key}', '${relPath}', {`);
        lines.push(`    frameWidth: ${frameW},`);
        lines.push(`    frameHeight: ${frameH},`);
        lines.push(`});`);
    } else {
        lines.push(`this.load.image('${key}', '${relPath}');`);
    }

    if (animations.length > 0) {
        lines.push('');
        lines.push(`// Animation definitions for ${key} (add to BootScene.create or GameScene):`);
        for (const anim of animations) {
            const frameRange = anim.from === anim.to
                ? `{ start: ${anim.from}, end: ${anim.to} }`
                : `{ start: ${anim.from}, end: ${anim.to} }`;
            lines.push(`this.anims.create({`);
            lines.push(`    key: '${key}_${anim.name}',`);
            lines.push(`    frames: this.anims.generateFrameNumbers('${key}', ${frameRange}),`);
            lines.push(`    frameRate: 10,`);
            lines.push(`    repeat: ${anim.direction === 'pingpong' ? '-1' : '-1'},`);
            lines.push(`});`);
        }
    }

    return lines.join('\n');
}

function main() {
    const { jsonPath, outDir, textureKey, wantAnim } = parseArgs();

    if (!existsSync(jsonPath)) {
        console.error(`Error: File not found: ${jsonPath}`);
        process.exit(1);
    }

    const data = loadAsepriteJSON(jsonPath);
    const frames = extractFrameData(data);
    const animations = extractAnimations(data);
    const imagePath = resolveImagePath(jsonPath, data);

    if (frames.length === 0) {
        console.error('Error: No frames found in export');
        process.exit(1);
    }

    // All frames should be same size for Phaser spritesheets
    const frameW = frames[0].w;
    const frameH = frames[0].h;
    const mixedSizes = frames.some(f => f.w !== frameW || f.h !== frameH);
    if (mixedSizes) {
        console.warn('Warning: Mixed frame sizes detected. Phaser spritesheets require uniform frames.');
        console.warn('Re-export from Aseprite with "Trim" disabled or use atlas format.');
    }

    // Ensure output directory exists
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    // Copy PNG
    const destPng = join(outDir, `${textureKey}.png`);
    copyFileSync(imagePath, destPng);

    // Write meta JSON (useful for tools, not loaded by game directly)
    const meta = {
        textureKey,
        frameWidth: frameW,
        frameHeight: frameH,
        frameCount: frames.length,
        frames,
        animations,
        source: basename(jsonPath),
        importedAt: new Date().toISOString(),
    };
    const destMeta = join(outDir, `${textureKey}.meta.json`);
    writeFileSync(destMeta, JSON.stringify(meta, null, 2));

    // Generate path relative to project root for the loader
    const relPath = '/' + destPng.slice(ROOT.length + 1);

    const snippet = generateBootSnippet(textureKey, relPath, frameW, frameH, frames.length, animations);

    console.log(`\n✓ Imported ${frames.length} frame(s) from ${basename(imagePath)}`);
    console.log(`  PNG  → ${destPng}`);
    console.log(`  Meta → ${destMeta}`);
    console.log(`  Size → ${frameW}×${frameH} per frame`);
    if (animations.length > 0) {
        console.log(`  Animations → ${animations.map(a => a.name).join(', ')}`);
    }
    console.log(`\n── Add to BootScene.preload() ──────────────────────────\n`);
    console.log(snippet);
    console.log(`\n────────────────────────────────────────────────────────\n`);
}

main();
