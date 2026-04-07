#!/usr/bin/env node
/**
 * ALIENS Game Server — Node.js/Express
 * Complete replacement for dev_server.py.
 * Serves the game, editors, settings, all API endpoints.
 * All saves write directly to disk (no localStorage).
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const app = express();
const PORT = process.env.PORT || 8192;
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Raw body parser for binary uploads (audio-upload legacy endpoint)
app.use('/api/audio-upload', express.raw({ type: '*/*', limit: '50mb' }));

// No-cache headers — prevent stale modules/assets during development
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    next();
});

// ── Path security helper ───────────────────────────────────────────────────
function safePath(userPath, ...allowedRoots) {
    const resolved = path.resolve(ROOT, userPath);
    const ok = allowedRoots.some(root => {
        const absRoot = path.resolve(ROOT, root);
        return resolved.startsWith(absRoot + path.sep) || resolved === absRoot;
    });
    if (!ok || userPath.includes('..')) return null;
    return resolved;
}

const RASTER_EXT_RE = /\.(png|jpg|jpeg|gif|webp)$/i;
const SVG_EXT_RE = /\.svg$/i;
const SPRITE_REGISTRY_FILE = path.join(ROOT, 'data/sprite_registry.json');
const SVG_CATEGORIES = ['corpse', 'acid', 'debris', 'particles'];
const DEFAULT_MARINE_REFERENCE = {
    path: '/assets/sprites/scaled/marine/marine_topdown.png',
    width: 122,
    height: 118,
};

function walkFiles(relativeDir, { recursive = false, extensionPattern = RASTER_EXT_RE } = {}) {
    const absDir = path.join(ROOT, relativeDir);
    if (!fs.existsSync(absDir)) return [];

    const entries = [];
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const childRelative = path.posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
        if (entry.isDirectory()) {
            if (recursive) entries.push(...walkFiles(childRelative, { recursive, extensionPattern }));
            continue;
        }
        if (!extensionPattern.test(entry.name)) continue;
        entries.push({
            dir: relativeDir.replace(/\\/g, '/'),
            file: entry.name,
            path: `/${childRelative.replace(/\\/g, '/')}`,
        });
    }
    return entries;
}

function deriveSpriteCategory(relativeDir, file) {
    const normalizedDir = relativeDir.replace(/\\/g, '/').toLowerCase();
    const lowerFile = file.toLowerCase();

    if (normalizedDir.startsWith('assets/floor')) return 'floor';
    if (normalizedDir.startsWith('assets/wall')) return 'wall';
    if (normalizedDir.startsWith('assets/door')) return 'door';
    if (normalizedDir.startsWith('assets/objects')) return 'prop';
    if (/marine|leader|follower/.test(lowerFile) || normalizedDir.includes('/marine')) return 'marine';
    if (/alien|facehugger|egg|queen|drone|spitter|runner/.test(lowerFile) || normalizedDir.includes('/alien')) return 'alien';
    if (/tile_|floor_|wall_|corridor_|bluesteel/.test(lowerFile)) return 'tile';
    if (/prop_/.test(lowerFile)) return 'prop';
    return normalizedDir.startsWith('assets/sprites') ? 'sprite' : 'other';
}

function readSpriteRegistry() {
    if (!fs.existsSync(SPRITE_REGISTRY_FILE)) {
        return { version: 2, referenceSprite: null, characters: {}, assignments: {}, svgAssets: {} };
    }

    try {
        const raw = JSON.parse(fs.readFileSync(SPRITE_REGISTRY_FILE, 'utf-8'));
        return {
            version: Number(raw.version) || 2,
            referenceSprite: raw.referenceSprite && typeof raw.referenceSprite === 'object' ? raw.referenceSprite : null,
            characters: raw.characters && typeof raw.characters === 'object' ? raw.characters : {},
            assignments: raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {},
            svgAssets: raw.svgAssets && typeof raw.svgAssets === 'object' ? raw.svgAssets : {},
            updatedAt: raw.updatedAt || null,
        };
    } catch {
        return { version: 2, referenceSprite: null, characters: {}, assignments: {}, svgAssets: {} };
    }
}

function writeSpriteRegistry(registry) {
    fs.mkdirSync(path.dirname(SPRITE_REGISTRY_FILE), { recursive: true });
    fs.writeFileSync(SPRITE_REGISTRY_FILE, JSON.stringify({
        ...registry,
        version: Number(registry.version) || 2,
        characters: registry.characters && typeof registry.characters === 'object' ? registry.characters : {},
        assignments: registry.assignments && typeof registry.assignments === 'object' ? registry.assignments : {},
        svgAssets: registry.svgAssets && typeof registry.svgAssets === 'object' ? registry.svgAssets : {},
        updatedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
}

function normalizeSvgCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return SVG_CATEGORIES.includes(normalized) ? normalized : null;
}

function normalizeSvgFilename(value) {
    const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
    if (!cleaned) return null;
    return cleaned.toLowerCase().endsWith('.svg') ? cleaned : `${cleaned}.svg`;
}

function decodePngDataUrl(dataUrl) {
    const matches = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/);
    if (!matches) return null;
    return Buffer.from(matches[1], 'base64');
}

// ── Static file serving ────────────────────────────────────────────────────
// Root redirect to /game (preserving query params)
app.get('/', (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `/game${qs}`);
});

// Game routes
app.use('/game', express.static(path.join(ROOT, 'game')));
app.use('/editors', express.static(path.join(ROOT, 'editors')));
app.use('/settings', express.static(path.join(ROOT, 'settings')));
app.use('/gameplan', express.static(path.join(ROOT, 'gameplan')));
app.use('/sound', express.static(path.join(ROOT, 'sound')));
app.use('/plan', express.static(path.join(ROOT, 'plan')));
app.use('/hud-editor', express.static(path.join(ROOT, 'hud-editor')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));

// Source/asset directories
app.use('/src', express.static(path.join(ROOT, 'src')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/maps', express.static(path.join(ROOT, 'maps')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use('/data', express.static(path.join(ROOT, 'data')));
app.use('/docs', express.static(path.join(ROOT, 'docs')));
app.use('/videos', express.static(path.join(ROOT, 'videos')));
app.use('/Videos', express.static(path.join(ROOT, 'Videos')));

// Serve scripts for test access
app.use('/scripts', express.static(path.join(ROOT, 'scripts')));

// node_modules for wavesurfer.js etc
app.use('/node_modules', express.static(path.join(ROOT, 'node_modules')));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ═══════════════════════════════════════════════════════════════════════════
//  API: SPRITE EDITOR
// ═══════════════════════════════════════════════════════════════════════════

// List all sprites in src/graphics/
app.get('/api/sprites', (req, res) => {
    const dirs = [
        { dir: 'src/graphics', recursive: false },
        { dir: 'src/graphics/generated', recursive: false },
        { dir: 'src/graphics/imported', recursive: false },
        { dir: 'assets/floor', recursive: false },
        { dir: 'assets/wall', recursive: false },
        { dir: 'assets/door', recursive: false },
        { dir: 'assets/objects', recursive: false },
        { dir: 'assets/sprites/reference', recursive: true },
        { dir: 'assets/sprites/scaled', recursive: true },
    ];
    const sprites = dirs.flatMap(({ dir, recursive }) => walkFiles(dir, { recursive, extensionPattern: RASTER_EXT_RE }))
        .map((entry) => ({
            name: path.parse(entry.file).name,
            path: entry.path,
            dir: entry.dir,
            category: deriveSpriteCategory(entry.dir, entry.file),
        }))
        .sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));

    res.json({ ok: true, sprites });
});

// Get marine reference sprite info
app.get('/api/sprites/marine-reference', (req, res) => {
    const registry = readSpriteRegistry();
    const ref = registry.referenceSprite && typeof registry.referenceSprite === 'object'
        ? registry.referenceSprite
        : DEFAULT_MARINE_REFERENCE;
    const relativePath = String(ref.path || DEFAULT_MARINE_REFERENCE.path);
    const diskPath = safePath(relativePath.replace(/^\//, ''), 'assets', 'src');
    if (!diskPath || !fs.existsSync(diskPath)) {
        return res.json({ ok: false, error: 'Marine sprite not found' });
    }

    const srcW = Number(ref.width) || DEFAULT_MARINE_REFERENCE.width;
    const srcH = Number(ref.height) || DEFAULT_MARINE_REFERENCE.height;
    res.json({
        ok: true,
        path: relativePath,
        frameWidth: srcW,
        frameHeight: srcH,
        frameCount: 1,
        sheetWidth: srcW,
        sheetHeight: srcH,
        gameDisplayWidth: srcW,
        gameDisplayHeight: srcH,
    });
});

// Upload/save a sprite
const spriteUpload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/sprites/save', spriteUpload.single('sprite'), (req, res) => {
    const targetDir = req.body.dir || 'src/graphics';
    let filename = req.body.filename;
    if (filename && !/\.[a-z0-9]+$/i.test(filename)) filename += '.png';
    if (!filename || /[^a-zA-Z0-9_\-.]/.test(filename)) {
        return res.status(400).json({ ok: false, error: 'Invalid filename' });
    }
    const dest = safePath(path.join(targetDir, filename), 'src/graphics', 'assets');
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid path' });

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (req.file) {
        fs.writeFileSync(dest, req.file.buffer);
    } else if (req.body.dataUrl) {
        // Handle base64 data URL
        const matches = req.body.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!matches) return res.status(400).json({ ok: false, error: 'Invalid data URL' });
        fs.writeFileSync(dest, Buffer.from(matches[1], 'base64'));
    } else {
        return res.status(400).json({ ok: false, error: 'No image data provided' });
    }
    res.json({ ok: true, path: `/${targetDir}/${filename}` });
});

// Delete a sprite
app.delete('/api/sprites/:dir/:filename', (req, res) => {
    const filePath = safePath(
        path.join(req.params.dir, req.params.filename),
        'src/graphics', 'assets'
    );
    if (!filePath) return res.status(400).json({ ok: false, error: 'Invalid path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'Not found' });
    fs.unlinkSync(filePath);
    res.json({ ok: true });
});

app.get('/api/svg-assets', (req, res) => {
    const requestedCategory = req.query.category ? normalizeSvgCategory(req.query.category) : null;
    if (req.query.category && !requestedCategory) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG category' });
    }

    const registry = readSpriteRegistry();
    const categories = requestedCategory ? [requestedCategory] : SVG_CATEGORIES;
    const assets = categories.flatMap((category) => {
        const dir = `assets/svg/${category}`;
        return walkFiles(dir, { recursive: false, extensionPattern: SVG_EXT_RE }).map((entry) => {
            const baseName = path.parse(entry.file).name;
            const meta = registry.svgAssets?.[category]?.[baseName] || {};
            return {
                category,
                name: baseName,
                filename: entry.file,
                sourcePath: entry.path,
                rasterPath: meta.rasterPath || null,
                width: Number(meta.width) || null,
                height: Number(meta.height) || null,
                viewBox: meta.viewBox || null,
                brightness: Number(meta.brightness) || 0,
                contrast: Number(meta.contrast) || 0,
                overlayColor: meta.overlayColor || '#4aa4d8',
                overlayAlpha: Number(meta.overlayAlpha) || 0,
                usage: meta.usage || null,
                target: meta.target || null,
                notes: meta.notes || '',
                updatedAt: meta.updatedAt || null,
            };
        });
    }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    res.json({ ok: true, assets });
});

app.get('/api/svg-assets/content', (req, res) => {
    const category = normalizeSvgCategory(req.query.category);
    const filename = normalizeSvgFilename(req.query.filename);
    if (!category || !filename) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG asset path' });
    }

    const sourceRelative = `assets/svg/${category}/${filename}`;
    const sourcePath = safePath(sourceRelative, 'assets/svg');
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        return res.status(404).json({ ok: false, error: 'SVG asset not found' });
    }

    const registry = readSpriteRegistry();
    const baseName = path.parse(filename).name;
    const meta = registry.svgAssets?.[category]?.[baseName] || {};

    res.json({
        ok: true,
        asset: {
            category,
            name: baseName,
            filename,
            sourcePath: `/${sourceRelative}`,
            rasterPath: meta.rasterPath || null,
            width: Number(meta.width) || null,
            height: Number(meta.height) || null,
            viewBox: meta.viewBox || null,
            brightness: Number(meta.brightness) || 0,
            contrast: Number(meta.contrast) || 0,
            overlayColor: meta.overlayColor || '#4aa4d8',
            overlayAlpha: Number(meta.overlayAlpha) || 0,
            usage: meta.usage || null,
            target: meta.target || null,
            notes: meta.notes || '',
            updatedAt: meta.updatedAt || null,
        },
        svgText: fs.readFileSync(sourcePath, 'utf-8'),
    });
});

app.post('/api/svg-assets/save', (req, res) => {
    const category = normalizeSvgCategory(req.body.category);
    const filename = normalizeSvgFilename(req.body.filename);
    const svgText = String(req.body.svgText || '').trim();
    if (!category || !filename || !svgText) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG save payload' });
    }

    const baseName = path.parse(filename).name;
    const sourceRelative = `assets/svg/${category}/${filename}`;
    const rasterRelative = `assets/sprites/scaled/svg/${category}/${baseName}.png`;
    const sourcePath = safePath(sourceRelative, 'assets/svg');
    const rasterPath = safePath(rasterRelative, 'assets/sprites');
    if (!sourcePath || !rasterPath) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG asset destination' });
    }

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, svgText, 'utf-8');

    if (req.body.pngDataUrl) {
        const pngBuffer = decodePngDataUrl(req.body.pngDataUrl);
        if (!pngBuffer) {
            return res.status(400).json({ ok: false, error: 'Invalid PNG export payload' });
        }
        fs.mkdirSync(path.dirname(rasterPath), { recursive: true });
        fs.writeFileSync(rasterPath, pngBuffer);
    }

    const registry = readSpriteRegistry();
    if (!registry.svgAssets[category]) registry.svgAssets[category] = {};
    registry.svgAssets[category][baseName] = {
        sourcePath: `/${sourceRelative}`,
        rasterPath: fs.existsSync(rasterPath) ? `/${rasterRelative}` : null,
        width: Number(req.body.width) || null,
        height: Number(req.body.height) || null,
        viewBox: String(req.body.viewBox || '').trim() || null,
        brightness: Number(req.body.brightness) || 0,
        contrast: Number(req.body.contrast) || 0,
        overlayColor: String(req.body.overlayColor || '#4aa4d8'),
        overlayAlpha: Number(req.body.overlayAlpha) || 0,
        usage: String(req.body.usage || '').trim() || null,
        target: String(req.body.target || '').trim() || null,
        notes: String(req.body.notes || '').trim(),
        updatedAt: new Date().toISOString(),
    };
    writeSpriteRegistry(registry);

    res.json({
        ok: true,
        asset: {
            category,
            name: baseName,
            filename,
            sourcePath: `/${sourceRelative}`,
            rasterPath: fs.existsSync(rasterPath) ? `/${rasterRelative}` : null,
            usage: registry.svgAssets[category][baseName].usage,
            target: registry.svgAssets[category][baseName].target,
            notes: registry.svgAssets[category][baseName].notes,
        },
    });
});

app.delete('/api/svg-assets/:category/:filename', (req, res) => {
    const category = normalizeSvgCategory(req.params.category);
    const filename = normalizeSvgFilename(req.params.filename);
    if (!category || !filename) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG asset path' });
    }

    const baseName = path.parse(filename).name;
    const sourcePath = safePath(`assets/svg/${category}/${filename}`, 'assets/svg');
    const rasterPath = safePath(`assets/sprites/scaled/svg/${category}/${baseName}.png`, 'assets/sprites');
    if (!sourcePath) {
        return res.status(400).json({ ok: false, error: 'Invalid SVG asset path' });
    }
    if (sourcePath && fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
    if (rasterPath && fs.existsSync(rasterPath)) fs.unlinkSync(rasterPath);

    const registry = readSpriteRegistry();
    if (registry.svgAssets?.[category]?.[baseName]) {
        delete registry.svgAssets[category][baseName];
        if (!Object.keys(registry.svgAssets[category]).length) delete registry.svgAssets[category];
        writeSpriteRegistry(registry);
    }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: TILE MAP EDITOR
// ═══════════════════════════════════════════════════════════════════════════

// List all maps
app.get('/api/maps', (req, res) => {
    const mapsDir = path.join(ROOT, 'maps');
    const maps = [];
    for (const file of fs.readdirSync(mapsDir)) {
        if (file.endsWith('.json') && !file.endsWith('.template.json')) {
            maps.push({
                name: file.replace('.json', ''),
                path: `/maps/${file}`,
            });
        }
    }
    res.json({ ok: true, maps });
});

// Get a specific map
app.get('/api/maps/:name', (req, res) => {
    const mapFile = safePath(`maps/${req.params.name}.json`, 'maps');
    if (!mapFile) return res.status(400).json({ ok: false, error: 'Invalid map name' });
    if (!fs.existsSync(mapFile)) return res.status(404).json({ ok: false, error: 'Map not found' });
    const data = JSON.parse(fs.readFileSync(mapFile, 'utf-8'));
    res.json({ ok: true, map: data });
});

// Save a map
app.post('/api/maps/:name', (req, res) => {
    const name = req.params.name;
    if (!name || /[^a-zA-Z0-9_\-]/.test(name)) {
        return res.status(400).json({ ok: false, error: 'Invalid map name' });
    }
    const mapFile = path.join(ROOT, 'maps', `${name}.json`);
    fs.writeFileSync(mapFile, JSON.stringify(req.body, null, 2), 'utf-8');

    // Regenerate tiledMaps.generated.js
    try {
        execSync('npm run build:tiled-maps', { cwd: ROOT, timeout: 15000 });
    } catch (e) {
        console.warn('Tiled rebuild warning:', e.message);
    }
    res.json({ ok: true, path: `/maps/${name}.json` });
});

// Get tileset image
app.get('/api/maps/tileset', (req, res) => {
    res.sendFile(path.join(ROOT, 'maps/aliens_tileset.png'));
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: SOUND EDITOR
// ═══════════════════════════════════════════════════════════════════════════

// ── Sound manifest generator ───────────────────────────────────────────────
const AUDIO_EXT_RE = /\.(wav|ogg|mp3|flac|webm)$/i;
const FORMAT_PRIORITY = { wav: 1, ogg: 2, mp3: 3, flac: 4, webm: 5 };

function generateSoundManifest() {
    const dirs = [
        { abs: path.join(ROOT, 'src/audio'), url: '/src/audio' },
    ];
    const entries = new Map(); // stem → { key, path, priority }
    for (const { abs: dir, url: urlPrefix } of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) continue;
            const m = entry.name.match(AUDIO_EXT_RE);
            if (!m) continue;
            const ext = m[1].toLowerCase();
            const stem = entry.name.replace(AUDIO_EXT_RE, '');
            const priority = FORMAT_PRIORITY[ext] || 99;
            const mapKey = `${urlPrefix}/${stem}`;
            const existing = entries.get(mapKey);
            if (!existing || priority < existing.priority) {
                entries.set(mapKey, {
                    key: stem,
                    path: `${urlPrefix}/${entry.name}`,
                    priority,
                });
            }
        }
    }
    const manifest = [...entries.values()]
        .map(({ key, path: p }) => ({ key, path: p }))
        .sort((a, b) => a.key.localeCompare(b.key));
    const js = `// Auto-generated by server — do not edit manually\nexport const soundManifest = ${JSON.stringify(manifest, null, 2)};\n`;
    fs.writeFileSync(path.join(ROOT, 'src/data/soundManifest.generated.js'), js);
    return manifest;
}

/** Remove other audio-format duplicates sharing the same stem in the same directory. */
function cleanupDuplicateFormats(savedFilePath) {
    const dir = path.dirname(savedFilePath);
    const stem = path.basename(savedFilePath).replace(AUDIO_EXT_RE, '');
    const savedName = path.basename(savedFilePath);
    try {
        for (const f of fs.readdirSync(dir)) {
            if (f === savedName) continue;
            if (!AUDIO_EXT_RE.test(f)) continue;
            if (f.replace(AUDIO_EXT_RE, '') === stem) {
                fs.unlinkSync(path.join(dir, f));
            }
        }
    } catch { /* ignore cleanup errors */ }
}

// Generate manifest on startup
try { generateSoundManifest(); } catch (e) { console.error('Sound manifest generation failed:', e.message); }

// List all audio files
app.get('/api/sounds', (req, res) => {
    const audioDirs = ['src/audio', 'src/music', 'assets'];
    const sounds = [];
    for (const dir of audioDirs) {
        const absDir = path.join(ROOT, dir);
        if (!fs.existsSync(absDir)) continue;
        const walk = (d, rel) => {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    walk(path.join(d, entry.name), `${rel}/${entry.name}`);
                } else if (/\.(wav|ogg|mp3|flac|webm)$/i.test(entry.name)) {
                    sounds.push({
                        name: entry.name,
                        path: `${rel}/${entry.name}`,
                        dir: rel,
                    });
                }
            }
        };
        walk(absDir, `/${dir}`);
    }
    res.json({ ok: true, sounds });
});

// Save audio file (base64)
app.post('/api/sounds/save', (req, res) => {
    const { filePath: savePath, data } = req.body;
    if (!savePath || !data) {
        return res.status(400).json({ ok: false, error: 'Missing path or data' });
    }
    const dest = safePath(savePath.replace(/^\//, ''), 'src/audio', 'src/music', 'assets');
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid path' });

    const buffer = Buffer.from(data, 'base64');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
    cleanupDuplicateFormats(dest);
    try { generateSoundManifest(); } catch { /* non-fatal */ }
    res.json({ ok: true, path: savePath, size: buffer.length });
});

// Upload audio file (multipart)
const audioUpload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });
app.post('/api/sounds/upload', audioUpload.single('audio'), (req, res) => {
    const targetPath = req.body.path;
    if (!targetPath) return res.status(400).json({ ok: false, error: 'Missing target path' });
    const dest = safePath(targetPath.replace(/^\//, ''), 'src/audio', 'src/music', 'assets');
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid path' });

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, req.file.buffer);
    try { generateSoundManifest(); } catch { /* non-fatal */ }
    res.json({ ok: true, path: targetPath, size: req.file.size });
});

// Delete audio file
app.delete('/api/sounds', (req, res) => {
    const { filePath: delPath } = req.body;
    if (!delPath) return res.status(400).json({ ok: false, error: 'Missing path' });
    const dest = safePath(delPath.replace(/^\//, ''), 'src/audio', 'src/music', 'assets');
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid path' });
    if (!fs.existsSync(dest)) return res.status(404).json({ ok: false, error: 'Not found' });
    fs.unlinkSync(dest);
    try { generateSoundManifest(); } catch { /* non-fatal */ }
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: HUD EDITOR
// ═══════════════════════════════════════════════════════════════════════════

// Get current HUD config
app.get('/api/hud-config', (req, res) => {
    const configPath = path.join(ROOT, 'src/data/hudConfig.js');
    if (!fs.existsSync(configPath)) {
        return res.json({ ok: true, config: {} });
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    // Extract JSON from the JS module
    const match = content.match(/export const HUD_CONFIG\s*=\s*(\{[\s\S]*\});/);
    if (!match) return res.json({ ok: true, config: {} });
    try {
        const config = JSON.parse(match[1]);
        res.json({ ok: true, config });
    } catch {
        res.json({ ok: true, config: {} });
    }
});

// Save HUD config — writes directly to src/data/hudConfig.js
app.post('/api/hud-config', (req, res) => {
    const config = req.body;
    if (!config || typeof config !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid config' });
    }
    const configPath = path.join(ROOT, 'src/data/hudConfig.js');
    const js = `// Auto-generated by HUD Editor — do not edit manually\nexport const HUD_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, js, 'utf-8');
    res.json({ ok: true, path: 'src/data/hudConfig.js' });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: STORY EDITOR  (spec: story-mission-editor.md)
//  Stories stored as JSON in data/stories/{id}.json
//  marker_type in map markers must match story.id (Start node trigger)
// ═══════════════════════════════════════════════════════════════════════════

const STORIES_DIR = path.join(ROOT, 'data/stories');
fs.mkdirSync(STORIES_DIR, { recursive: true });

// List all stories
app.get('/api/stories', (req, res) => {
    const stories = [];
    for (const file of fs.readdirSync(STORIES_DIR)) {
        if (!file.endsWith('.json')) continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(STORIES_DIR, file), 'utf-8'));
            stories.push({ id: data.id, name: data.name || file.replace('.json', '') });
        } catch { /* skip corrupt files */ }
    }
    res.json({ ok: true, stories });
});

// Get one story
app.get('/api/stories/:id', (req, res) => {
    const id = req.params.id;
    if (!id || /[^a-zA-Z0-9_-]/.test(id)) return res.status(400).json({ ok: false, error: 'Invalid story ID' });
    const file = path.join(STORIES_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Story not found' });
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({ ok: true, story: data });
});

// Save a story
app.post('/api/stories/:id', (req, res) => {
    const id = req.params.id;
    if (!id || /[^a-zA-Z0-9_-]/.test(id)) return res.status(400).json({ ok: false, error: 'Invalid story ID' });
    const story = req.body;
    if (!story || typeof story !== 'object') return res.status(400).json({ ok: false, error: 'Invalid story data' });
    const file = path.join(STORIES_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(story, null, 2), 'utf-8');
    res.json({ ok: true, path: `data/stories/${id}.json` });
});

// Delete a story
app.delete('/api/stories/:id', (req, res) => {
    const id = req.params.id;
    if (!id || /[^a-zA-Z0-9_-]/.test(id)) return res.status(400).json({ ok: false, error: 'Invalid story ID' });
    const file = path.join(STORIES_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Story not found' });
    fs.unlinkSync(file);
    res.json({ ok: true });
});

// Sprite registry project data
app.get('/api/sprites/registry', (req, res) => {
    try {
        res.json({ ok: true, registry: readSpriteRegistry() });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/sprites/registry', (req, res) => {
    const registry = req.body;
    if (!registry || typeof registry !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid registry data' });
    }

    const existing = readSpriteRegistry();
    const payload = {
        ...existing,
        ...registry,
        version: Number(registry.version) || existing.version || 2,
        referenceSprite: registry.referenceSprite && typeof registry.referenceSprite === 'object'
            ? registry.referenceSprite
            : existing.referenceSprite,
        characters: registry.characters && typeof registry.characters === 'object'
            ? registry.characters
            : existing.characters,
        assignments: registry.assignments && typeof registry.assignments === 'object'
            ? registry.assignments
            : existing.assignments,
        svgAssets: registry.svgAssets && typeof registry.svgAssets === 'object'
            ? registry.svgAssets
            : existing.svgAssets,
    };

    writeSpriteRegistry(payload);
    res.json({ ok: true, path: 'data/sprite_registry.json' });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: EDITOR STATE (legacy compat)
// ═══════════════════════════════════════════════════════════════════════════

function unwrapEditorStatePayload(payload) {
    let current = payload && typeof payload === 'object' ? payload : {};
    while (
        current &&
        typeof current === 'object' &&
        current.state &&
        typeof current.state === 'object' &&
        Object.keys(current).every((key) => key === 'state' || key === 'ok')
    ) {
        current = current.state;
    }
    return current && typeof current === 'object' ? current : {};
}

app.get('/api/editor-state', (req, res) => {
    const statePath = path.join(ROOT, 'data/editor_state.json');
    if (!fs.existsSync(statePath)) return res.json({ ok: true, state: {} });
    const data = unwrapEditorStatePayload(JSON.parse(fs.readFileSync(statePath, 'utf-8')));
    res.json({ ok: true, state: data });
});

app.post('/api/editor-state', (req, res) => {
    const statePath = path.join(ROOT, 'data/editor_state.json');
    const data = unwrapEditorStatePayload(req.body);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: MISSION PACKAGE
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/mission-package', (req, res) => {
    const pkgPath = path.join(ROOT, 'data/mission_package.json');
    if (!fs.existsSync(pkgPath)) return res.json({ ok: true, package: {} });
    const data = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    res.json({ ok: true, package: data });
});

app.post('/api/mission-package', (req, res) => {
    const pkgPath = path.join(ROOT, 'data/mission_package.json');
    fs.mkdirSync(path.dirname(pkgPath), { recursive: true });
    fs.writeFileSync(pkgPath, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: TILED BUILD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/tiled-build', (req, res) => {
    exec('npm run build:tiled-maps', { cwd: ROOT, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).json({
                ok: false,
                error: err.message.slice(0, 2000),
                stdout: (stdout || '').slice(-4000),
                stderr: (stderr || '').slice(-2000),
            });
        }
        res.json({
            ok: true,
            stdout: (stdout || '').slice(-4000),
            stderr: (stderr || '').slice(-2000),
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: ERROR NOTES (NDJSON log — used by dev tools)
// ═══════════════════════════════════════════════════════════════════════════

const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error-notes.ndjson');

app.get('/api/error-notes', (req, res) => {
    if (!fs.existsSync(LOG_FILE)) return res.json({ ok: true, entries: [] });
    const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
        try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    res.json({ ok: true, entries: entries.slice(-200) });
});

app.post('/api/error-notes', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    }
    const title = String(data.title || '').trim().slice(0, 160);
    const body = String(data.body || '').trim().slice(0, 20000);
    const url = String(data.url || '').trim().slice(0, 500);
    const sourceTime = String(data.time || '').trim().slice(0, 120);

    if (!body) return res.status(400).json({ ok: false, error: 'Empty body' });

    const record = {
        server_time_utc: new Date().toISOString(),
        title: title || 'Untitled',
        body,
        url,
        source_time: sourceTime,
        remote_addr: req.ip || '',
    };

    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n', 'utf-8');
    res.json({ ok: true, saved_to: 'logs/error-notes.ndjson' });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: ATS (gameplan text file)
// ═══════════════════════════════════════════════════════════════════════════

const ATS_FILE = path.join(ROOT, 'ATS.txt');

app.get('/api/ats', (req, res) => {
    if (!fs.existsSync(ATS_FILE)) return res.json({ ok: true, content: '' });
    const content = fs.readFileSync(ATS_FILE, 'utf-8');
    res.json({ ok: true, content });
});

app.post('/api/ats', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || !('content' in data)) {
        return res.status(400).json({ ok: false, error: 'Expected JSON with "content" field' });
    }
    const content = String(data.content);
    fs.writeFileSync(ATS_FILE, content, 'utf-8');
    res.json({ ok: true, size: content.length });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: LEGACY ENDPOINTS (compat with sound/index.html, old editors)
// ═══════════════════════════════════════════════════════════════════════════

// Legacy audio upload — raw binary POST with ?target= query param
// Used by sound/index.html
app.post('/api/audio-upload', (req, res) => {
    const target = req.query.target;
    const allowedPrefixes = ['src/audio/', 'src/music/'];

    if (!target || target.includes('..') || target.startsWith('/')) {
        return res.status(400).json({ ok: false, error: 'Invalid path' });
    }
    if (!allowedPrefixes.some(p => target.startsWith(p))) {
        return res.status(400).json({ ok: false, error: 'Path must be in src/audio/ or src/music/' });
    }

    const data = req.body;
    if (!data || !data.length) {
        return res.status(400).json({ ok: false, error: 'File too large or empty (max 50 MB)' });
    }

    const targetPath = path.resolve(ROOT, target);
    if (!targetPath.startsWith(ROOT + path.sep)) {
        return res.status(403).json({ ok: false, error: 'Path escape detected' });
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, data);
    res.json({ ok: true, path: target, size: data.length });
});

// Legacy save-sound — base64 JSON body with {path, data}
// Used by sound/index.html
app.post('/api/save-sound', (req, res) => {
    const savePath = req.body.path;
    const dataB64 = req.body.data;

    if (!savePath || typeof savePath !== 'string' || savePath.includes('..')) {
        return res.status(400).json({ ok: false, error: 'Invalid or disallowed path' });
    }
    const normalizedPath = savePath.startsWith('/') ? savePath.slice(1) : savePath;
    const allowedPrefixes = ['src/audio/', 'src/music/', 'assets/'];
    const allowedExtensions = ['.wav', '.ogg'];
    if (!allowedPrefixes.some(p => normalizedPath.startsWith(p))) {
        return res.status(400).json({ ok: false, error: 'Invalid or disallowed path' });
    }
    if (!allowedExtensions.some(ext => normalizedPath.endsWith(ext))) {
        return res.status(400).json({ ok: false, error: 'Invalid or disallowed path' });
    }

    if (!dataB64 || typeof dataB64 !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing data field' });
    }

    let wavBytes;
    try {
        wavBytes = Buffer.from(dataB64, 'base64');
    } catch {
        return res.status(400).json({ ok: false, error: 'Invalid base64 data' });
    }

    const targetPath = path.resolve(ROOT, normalizedPath);
    if (!targetPath.startsWith(ROOT + path.sep)) {
        return res.status(403).json({ ok: false, error: 'Path escape detected' });
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, wavBytes);
    res.json({ ok: true, path: normalizedPath, size: wavBytes.length });
});

// Legacy save-hud-config — used by old editors/app.js and test scripts
app.post('/api/save-hud-config', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ ok: false, error: 'Expected JSON object' });
    }
    const configPath = path.join(ROOT, 'src/data/hudConfig.js');
    const js = `// Auto-generated by HUD Editor — do not edit manually\nexport const HUD_CONFIG = ${JSON.stringify(data, null, 2)};\n`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, js, 'utf-8');
    res.json({ ok: true, path: 'src/data/hudConfig.js' });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API: FILE BROWSER (generic read for editors)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ ok: false, error: 'Missing path' });
    const resolved = safePath(filePath.replace(/^\//, ''), 'src', 'assets', 'maps', 'data');
    if (!resolved) return res.status(400).json({ ok: false, error: 'Access denied' });
    if (!fs.existsSync(resolved)) return res.status(404).json({ ok: false, error: 'Not found' });
    res.sendFile(resolved);
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ ok: false, error: 'Internal server error' });
});

// ── Tiled watcher auto-launch ──────────────────────────────────────────────
let tiledWatcher = null;
function startTiledWatcher() {
    const watcherScript = path.join(ROOT, 'scripts/watchTiled.mjs');
    if (!fs.existsSync(watcherScript)) {
        console.log(`  WARNING: ${watcherScript} not found — Tiled watcher not started.`);
        return;
    }
    try {
        tiledWatcher = spawn('node', [watcherScript], {
            cwd: ROOT,
            stdio: 'inherit',
        });
        console.log(`  Tiled watcher started (pid=${tiledWatcher.pid}) — watching maps/*.json`);
        tiledWatcher.on('exit', (code) => {
            console.log(`  Tiled watcher exited (code=${code})`);
            tiledWatcher = null;
        });
    } catch (err) {
        console.log(`  WARNING: Could not start Tiled watcher: ${err.message}`);
    }
}

// ── Start ──────────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
    console.log(`\n  ALIENS Game Server running on http://${HOST}:${PORT}`);
    console.log(`  Game:     http://localhost:${PORT}/game`);
    console.log(`  Editors:  http://localhost:${PORT}/editors`);
    console.log(`  Settings: http://localhost:${PORT}/settings`);
    console.log(`  Gameplan: http://localhost:${PORT}/gameplan`);
    console.log(`  Sound:    http://localhost:${PORT}/sound`);
    console.log(`  Error log: http://localhost:${PORT}/api/error-notes\n`);

    if (!process.env.NO_TILED_WATCH) {
        startTiledWatcher();
    }
});

// Graceful shutdown
function shutdown() {
    console.log('\nShutting down...');
    if (tiledWatcher) tiledWatcher.kill();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
