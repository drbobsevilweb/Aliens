/**
 * texture.js — Texture/Pixel Editor Tab
 * Pixel-perfect PNG editor for game assets: floor, wall, door, objects, sprites.
 * Outputs PNG files to /assets/<category>/ via POST /api/sprites/save.
 */

import { colorToCss, hexToRgba, loadImage, readFileAsDataUrl } from './shared/assetUtils.js';

const API = window.editorAPI;

// ── Constants ──────────────────────────────────────────────────────────────

const SIZES = [32, 64, 128, 256];
const ZOOM_LEVELS = [1, 2, 4, 8, 16];
const MAX_UNDO = 30;

const CAT_DIR = {
    'Floor':   'assets/floor',
    'Wall':    'assets/wall',
    'Door':    'assets/door',
    'Objects': 'assets/objects',
    'Sprites': 'assets/sprites',
};

/** 32-color CRT/Aliens palette */
const PALETTE = [
    '#000000', '#0a0e14', '#111820', '#1a2a3a',
    '#2f3f4c', '#4a6478', '#607888', '#8093a3',
    '#1a3a5a', '#2a5a8c', '#3a7ab8', '#4aa4d8',
    '#0a2a1a', '#1a5a3a', '#33aa66', '#48d89a',
    '#3a0a0a', '#7a1a1a', '#c03030', '#e05858',
    '#2a1a00', '#5a3a00', '#b07020', '#d8b848',
    '#1a0a2a', '#3a1a5a', '#7a3aa8', '#c47ae8',
    '#b0c0d0', '#d0dce8', '#e8f0f8', '#ffffff',
];

// ── Module-level state ─────────────────────────────────────────────────────

let offscreen      = null;   // HTMLCanvasElement at actual pixel dimensions
let offCtx         = null;   // 2D context for offscreen
let displayCanvas  = null;   // HTMLCanvasElement for display (zoomed)
let displayCtx     = null;   // 2D context for display

let pixelSize      = 32;
let zoomIndex      = 3;      // ZOOM_LEVELS[3] = 8
let currentTool    = 'pencil';
let currentColor   = { r: 200, g: 210, b: 220, a: 255 };
let isDrawing      = false;
let lastPixel      = null;   // { x, y } last drawn pixel for line interpolation
let showGrid       = true;
let tabActive      = false;
let activeCategory = 'Floor';
let undoStack      = [];
let redoStack      = [];
let assetList      = [];

let checkerPattern     = null;
let checkerPatternZoom = -1;

// Global handler refs for cleanup
let globalMoveHandler = null;
let globalUpHandler   = null;
let keyDownHandler    = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function getZoom() { return ZOOM_LEVELS[zoomIndex]; }

function rgbaToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function getPixelCoords(e) {
    const zoom = getZoom();
    const rect = displayCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);
    return {
        x: Math.max(0, Math.min(pixelSize - 1, x)),
        y: Math.max(0, Math.min(pixelSize - 1, y)),
    };
}

// ── Undo / Redo ────────────────────────────────────────────────────────────

function pushUndo() {
    undoStack.push(offCtx.getImageData(0, 0, pixelSize, pixelSize));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    syncUndoButtons();
}

function undo() {
    if (!undoStack.length) return;
    redoStack.push(offCtx.getImageData(0, 0, pixelSize, pixelSize));
    offCtx.putImageData(undoStack.pop(), 0, 0);
    renderDisplay();
    syncUndoButtons();
    API.setDirty(true);
}

function redo() {
    if (!redoStack.length) return;
    undoStack.push(offCtx.getImageData(0, 0, pixelSize, pixelSize));
    offCtx.putImageData(redoStack.pop(), 0, 0);
    renderDisplay();
    syncUndoButtons();
    API.setDirty(true);
}

function syncUndoButtons() {
    const undoBtn = document.getElementById('tex-undo');
    const redoBtn = document.getElementById('tex-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ── Canvas Setup ───────────────────────────────────────────────────────────

function initCanvas(size) {
    pixelSize = size;
    undoStack = [];
    redoStack = [];
    offscreen = document.createElement('canvas');
    offscreen.width  = size;
    offscreen.height = size;
    offCtx = offscreen.getContext('2d');
    offCtx.imageSmoothingEnabled = false;
    renderDisplay();
    syncUndoButtons();
    syncSizeButtons();
}

// ── Rendering ─────────────────────────────────────────────────────────────

function getCheckerPattern(ctx, zoom) {
    if (checkerPatternZoom === zoom && checkerPattern) return checkerPattern;
    const sq = Math.max(4, Math.min(zoom, 16));
    const pc = document.createElement('canvas');
    pc.width = sq * 2;
    pc.height = sq * 2;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = '#282828';
    pctx.fillRect(0, 0, sq * 2, sq * 2);
    pctx.fillStyle = '#3c3c3c';
    pctx.fillRect(0, 0, sq, sq);
    pctx.fillRect(sq, sq, sq, sq);
    checkerPattern     = ctx.createPattern(pc, 'repeat');
    checkerPatternZoom = zoom;
    return checkerPattern;
}

function renderDisplay() {
    if (!displayCanvas || !offscreen) return;
    const zoom = getZoom();
    const W = pixelSize * zoom;
    const H = pixelSize * zoom;

    if (displayCanvas.width !== W || displayCanvas.height !== H) {
        displayCanvas.width  = W;
        displayCanvas.height = H;
    }

    // Checker background (transparency indicator)
    displayCtx.fillStyle = getCheckerPattern(displayCtx, zoom);
    displayCtx.fillRect(0, 0, W, H);

    // Scaled pixel content
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.drawImage(offscreen, 0, 0, W, H);

    // Grid overlay (only at zoom >= 4)
    if (showGrid && zoom >= 4) {
        displayCtx.strokeStyle = 'rgba(74,164,216,0.18)';
        displayCtx.lineWidth   = 0.5;
        displayCtx.beginPath();
        for (let x = 0; x <= W; x += zoom) {
            displayCtx.moveTo(x + 0.5, 0);
            displayCtx.lineTo(x + 0.5, H);
        }
        for (let y = 0; y <= H; y += zoom) {
            displayCtx.moveTo(0, y + 0.5);
            displayCtx.lineTo(W, y + 0.5);
        }
        displayCtx.stroke();
    }
}

// ── Drawing Tools ──────────────────────────────────────────────────────────

function putPixel(x, y) {
    if (x < 0 || x >= pixelSize || y < 0 || y >= pixelSize) return;
    if (currentTool === 'eraser') {
        offCtx.clearRect(x, y, 1, 1);
    } else {
        offCtx.fillStyle = colorToCss(currentColor);
        offCtx.fillRect(x, y, 1, 1);
    }
}

/** Bresenham's line to fill gaps when mouse moves fast */
function drawLine(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
        putPixel(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

function floodFill(startX, startY) {
    const imgData = offCtx.getImageData(0, 0, pixelSize, pixelSize);
    const d       = imgData.data;
    const base    = (startY * pixelSize + startX) * 4;
    const tR = d[base], tG = d[base + 1], tB = d[base + 2], tA = d[base + 3];
    const fR = currentColor.r, fG = currentColor.g, fB = currentColor.b, fA = currentColor.a;

    if (tR === fR && tG === fG && tB === fB && tA === fA) return;

    const visited = new Uint8Array(pixelSize * pixelSize);
    const stack   = [[startX, startY]];

    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= pixelSize || y < 0 || y >= pixelSize) continue;
        const vi = y * pixelSize + x;
        if (visited[vi]) continue;
        visited[vi] = 1;
        const i = vi * 4;
        if (d[i] !== tR || d[i + 1] !== tG || d[i + 2] !== tB || d[i + 3] !== tA) continue;
        d[i] = fR; d[i + 1] = fG; d[i + 2] = fB; d[i + 3] = fA;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    offCtx.putImageData(imgData, 0, 0);
}

function pickColor(x, y) {
    if (x < 0 || x >= pixelSize || y < 0 || y >= pixelSize) return;
    const id = offCtx.getImageData(x, y, 1, 1).data;
    currentColor = { r: id[0], g: id[1], b: id[2], a: id[3] };
    syncColorUI();
    setTool('pencil');
}

// ── Color UI ──────────────────────────────────────────────────────────────

function syncColorUI() {
    const hex      = rgbaToHex(currentColor.r, currentColor.g, currentColor.b);
    const hexInput = document.getElementById('tex-color-hex');
    const alphaEl  = document.getElementById('tex-alpha');
    const preview  = document.getElementById('tex-color-preview');
    if (hexInput) hexInput.value = hex;
    if (alphaEl)  alphaEl.value  = currentColor.a;
    if (preview)  preview.style.background = colorToCss(currentColor);
    syncAlphaLabel();
}

function syncAlphaLabel() {
    const alphaEl  = document.getElementById('tex-alpha');
    const alphaLbl = document.getElementById('tex-alpha-lbl');
    if (alphaEl && alphaLbl) {
        alphaLbl.textContent = Math.round((parseInt(alphaEl.value) / 255) * 100) + '%';
    }
}

// ── Tool selection ─────────────────────────────────────────────────────────

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tex-tool-btn').forEach(btn => {
        const active = btn.dataset.tool === tool;
        btn.classList.toggle('active', active);
        btn.style.borderColor = active ? 'var(--accent)' : '';
        btn.style.color = active ? 'var(--accent)' : '';
    });
    if (displayCanvas) {
        displayCanvas.style.cursor = (tool === 'fill') ? 'cell' : 'crosshair';
    }
}

// ── Mouse Handlers ─────────────────────────────────────────────────────────

function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y } = getPixelCoords(e);

    if (currentTool === 'eyedropper') {
        pickColor(x, y);
        return;
    }
    if (currentTool === 'fill') {
        pushUndo();
        floodFill(x, y);
        renderDisplay();
        API.setDirty(true);
        return;
    }
    // pencil / eraser
    pushUndo();
    isDrawing = true;
    lastPixel = { x, y };
    putPixel(x, y);
    renderDisplay();
    updateStatusPixel(x, y);
}

function onMouseMove(e) {
    if (!displayCanvas) return;
    const { x, y } = getPixelCoords(e);
    updateStatusPixel(x, y);

    if (!isDrawing) return;
    if (currentTool === 'pencil' || currentTool === 'eraser') {
        if (lastPixel) {
            drawLine(lastPixel.x, lastPixel.y, x, y);
        } else {
            putPixel(x, y);
        }
        lastPixel = { x, y };
        renderDisplay();
    }
}

function onMouseUp(e) {
    if (e.button !== 0) return;
    isDrawing = false;
    lastPixel = null;
}

function onMouseLeave() {
    const el = document.getElementById('tex-pixel-status');
    if (el) el.textContent = '';
}

function updateStatusPixel(x, y) {
    const el = document.getElementById('tex-pixel-status');
    if (!el || !offCtx) return;
    const id = offCtx.getImageData(x, y, 1, 1).data;
    el.textContent = `x:${x}  y:${y}  rgba(${id[0]},${id[1]},${id[2]},${id[3]})`;
}

// ── Size ───────────────────────────────────────────────────────────────────

function syncSizeButtons() {
    document.querySelectorAll('.tex-size-btn').forEach(btn => {
        const active = parseInt(btn.dataset.size) === pixelSize;
        btn.classList.toggle('active', active);
        btn.style.borderColor = active ? 'var(--accent)' : '';
    });
}

function changeSize(newSize) {
    if (newSize === pixelSize) return;
    // Scale existing content into the new size
    const next  = document.createElement('canvas');
    next.width  = newSize;
    next.height = newSize;
    const nctx  = next.getContext('2d');
    nctx.imageSmoothingEnabled = false;
    nctx.drawImage(offscreen, 0, 0, newSize, newSize);
    pixelSize = newSize;
    offscreen = next;
    offCtx    = nctx;
    undoStack = [];
    redoStack = [];
    checkerPattern     = null;  // invalidate checker cache
    checkerPatternZoom = -1;
    renderDisplay();
    syncUndoButtons();
    syncSizeButtons();
}

// ── Zoom ───────────────────────────────────────────────────────────────────

function syncZoomButtons() {
    const zoom = getZoom();
    document.querySelectorAll('.tex-zoom-btn').forEach(btn => {
        const active = parseInt(btn.dataset.zoom) === zoom;
        btn.classList.toggle('active', active);
        btn.style.borderColor = active ? 'var(--accent)' : '';
    });
    const lbl = document.getElementById('tex-zoom-lbl');
    if (lbl) lbl.textContent = `${zoom}x`;
}

function setZoom(z) {
    const idx = ZOOM_LEVELS.indexOf(z);
    if (idx < 0) return;
    zoomIndex = idx;
    checkerPattern     = null;
    checkerPatternZoom = -1;
    renderDisplay();
    syncZoomButtons();
}

// ── Grid ───────────────────────────────────────────────────────────────────

function toggleGrid() {
    showGrid = !showGrid;
    const btn = document.getElementById('tex-grid-toggle');
    if (btn) {
        btn.classList.toggle('active', showGrid);
        btn.style.borderColor = showGrid ? 'var(--accent)' : '';
        btn.style.color = showGrid ? 'var(--accent)' : '';
    }
    renderDisplay();
}

// ── New / Import / Save ────────────────────────────────────────────────────

function newTexture() {
    pushUndo();
    offCtx.clearRect(0, 0, pixelSize, pixelSize);
    renderDisplay();
    API.setDirty(true);
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    pushUndo();
    readFileAsDataUrl(file)
        .then((dataUrl) => loadImage(dataUrl))
        .then((img) => {
            offCtx.clearRect(0, 0, pixelSize, pixelSize);
            offCtx.imageSmoothingEnabled = false;
            offCtx.drawImage(img, 0, 0, pixelSize, pixelSize);
            renderDisplay();
            API.setDirty(true);
        })
        .catch(() => API.toast('Failed to decode image', 'error'));
    e.target.value = '';
}

async function saveTexture() {
    const filenameEl = document.getElementById('tex-filename');
    const filename   = filenameEl ? filenameEl.value.trim() : '';
    if (!/^[a-zA-Z0-9_-]+\.png$/.test(filename)) {
        API.toast('Invalid filename — use letters/numbers/_ - and .png extension', 'error');
        return;
    }
    const dir     = CAT_DIR[activeCategory];
    const dataUrl = offscreen.toDataURL('image/png');
    try {
        const resp = await API.apiFetch('/api/sprites/save', {
            method:  'POST',
            body:    JSON.stringify({ dir, filename, dataUrl }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'Server error');
        API.toast(`Saved ${filename} → ${dir}/`, 'success');
        API.recordSave();
        loadAssetList();
    } catch (err) {
        API.toast('Save failed: ' + err.message, 'error');
    }
}

// ── Asset List ─────────────────────────────────────────────────────────────

async function loadAssetList() {
    try {
        const resp = await API.apiFetch('/api/sprites');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        assetList = data.sprites || [];
        renderAssetList();
    } catch (err) {
        const el = document.getElementById('tex-asset-list');
        if (el) el.innerHTML = `<div style="padding:8px;color:var(--red,#e05858);font-size:11px;">Error: ${err.message}</div>`;
    }
}

function renderAssetList() {
    const el = document.getElementById('tex-asset-list');
    if (!el) return;
    const dir      = CAT_DIR[activeCategory];
    const filtered = assetList.filter(s => s.dir && s.dir.replace(/\\/g, '/').includes(dir));
    if (!filtered.length) {
        el.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:11px;">No assets in this category</div>';
        return;
    }
    el.innerHTML = filtered.map((s, i) => `
        <div class="tex-asset-item" data-idx="${i}" data-path="${s.path}"
             style="display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;border-bottom:1px solid var(--border-subtle,#152030);">
            <img src="${s.path}" alt=""
                 style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;background:#1a1a1a;flex-shrink:0;border:1px solid var(--border);">
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);">${s.name}</span>
        </div>
    `).join('');
    el.querySelectorAll('.tex-asset-item').forEach(item => {
        item.addEventListener('click', () => {
            loadAssetIntoEditor(item.dataset.path, item.dataset.path.split('/').pop());
        });
    });
}

function loadAssetIntoEditor(src, name) {
    pushUndo();
    loadImage(src)
        .then((img) => {
        offCtx.clearRect(0, 0, pixelSize, pixelSize);
        offCtx.imageSmoothingEnabled = false;
        offCtx.drawImage(img, 0, 0, pixelSize, pixelSize);
        renderDisplay();
        })
        .catch(() => API.toast('Failed to load image', 'error'));
    // Pre-fill filename
    if (name) {
        const filenameEl = document.getElementById('tex-filename');
        if (filenameEl) filenameEl.value = name;
    }
}

// ── Keyboard ──────────────────────────────────────────────────────────────

function makeKeyHandler() {
    return function onKey(e) {
        if (!tabActive) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault(); undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault(); redo();
        } else if (!e.ctrlKey && !e.metaKey) {
            if      (e.key === 'p') setTool('pencil');
            else if (e.key === 'e') setTool('eraser');
            else if (e.key === 'f') setTool('fill');
            else if (e.key === 'i') setTool('eyedropper');
            else if (e.key === 'g') toggleGrid();
        }
    };
}

// ── Build UI ───────────────────────────────────────────────────────────────

function buildUI(root) {
    root.innerHTML = `
<div class="layout-split" style="height:100%">

    <!-- ── Sidebar ── -->
    <aside class="sidebar" style="width:240px;min-width:180px;display:flex;flex-direction:column;overflow-y:auto;gap:0;border-right:1px solid var(--border);">

        <!-- Tools -->
        <div class="panel" style="flex-shrink:0;border-bottom:1px solid var(--border);">
            <div class="panel-header" style="padding:4px 10px;font-size:11px;letter-spacing:.08em;">TOOLS</div>
            <div class="panel-body" style="padding:8px;">
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px;">
                    <button class="btn btn-sm btn-secondary tex-tool-btn" data-tool="pencil"
                            title="Pencil [P] — draw pixel" style="font-size:14px;padding:4px 0;">✏</button>
                    <button class="btn btn-sm btn-secondary tex-tool-btn" data-tool="eraser"
                            title="Eraser [E] — erase to transparent" style="font-size:14px;padding:4px 0;">⌫</button>
                    <button class="btn btn-sm btn-secondary tex-tool-btn" data-tool="fill"
                            title="Fill [F] — flood fill" style="font-size:14px;padding:4px 0;">▣</button>
                    <button class="btn btn-sm btn-secondary tex-tool-btn" data-tool="eyedropper"
                            title="Eyedropper [I] — pick color from canvas" style="font-size:14px;padding:4px 0;">⊕</button>
                </div>
                <div style="font-size:10px;color:var(--text-muted);text-align:center;">P · E · F · I  shortcuts</div>
            </div>
        </div>

        <!-- Color -->
        <div class="panel" style="flex-shrink:0;border-bottom:1px solid var(--border);">
            <div class="panel-header" style="padding:4px 10px;font-size:11px;letter-spacing:.08em;">COLOR</div>
            <div class="panel-body" style="padding:8px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div id="tex-color-preview"
                         style="width:38px;height:38px;flex-shrink:0;border:1px solid var(--border);image-rendering:pixelated;background:rgba(200,210,220,1);"></div>
                    <input type="color" id="tex-color-hex" value="#c8d2dc"
                           style="flex:1;height:28px;cursor:pointer;border:1px solid var(--border);background:var(--bg-surface,#111820);border-radius:3px;">
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;width:30px;">Alpha</span>
                    <input type="range" id="tex-alpha" min="0" max="255" value="255" style="flex:1;height:4px;">
                    <span id="tex-alpha-lbl" style="font-size:10px;color:var(--text-muted);width:28px;text-align:right;">100%</span>
                </div>
                <div id="tex-palette" style="display:grid;grid-template-columns:repeat(8,1fr);gap:2px;"></div>
            </div>
        </div>

        <!-- File -->
        <div class="panel" style="flex-shrink:0;border-bottom:1px solid var(--border);">
            <div class="panel-header" style="padding:4px 10px;font-size:11px;letter-spacing:.08em;">FILE</div>
            <div class="panel-body" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
                <select id="tex-category" style="width:100%;background:var(--bg-inset,#080b10);color:var(--text);border:1px solid var(--border);padding:4px 6px;font-size:12px;border-radius:3px;">
                    <option value="Floor">Floor</option>
                    <option value="Wall">Wall</option>
                    <option value="Door">Door</option>
                    <option value="Objects">Objects</option>
                    <option value="Sprites">Sprites</option>
                </select>
                <input type="text" id="tex-filename" placeholder="my_tile.png" spellcheck="false"
                       style="width:100%;background:var(--bg-inset,#080b10);color:var(--text);border:1px solid var(--border);padding:4px 6px;font-size:12px;font-family:var(--mono-font);border-radius:3px;">
                <button class="btn btn-sm btn-primary" id="tex-save-btn" style="width:100%;">⬇ Save PNG</button>
            </div>
        </div>

        <!-- Asset list -->
        <div class="panel" style="flex:1;min-height:100px;display:flex;flex-direction:column;">
            <div class="panel-header" style="padding:4px 10px;font-size:11px;letter-spacing:.08em;display:flex;align-items:center;justify-content:space-between;">
                <span>ASSETS</span>
                <button class="btn btn-sm btn-secondary" id="tex-refresh-btn" title="Refresh asset list" style="padding:1px 6px;font-size:11px;">↻</button>
            </div>
            <div id="tex-asset-list" class="panel-body" style="flex:1;overflow-y:auto;padding:0;"></div>
        </div>
    </aside>

    <!-- ── Main ── -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">

        <!-- Toolbar -->
        <div class="toolbar" style="flex-shrink:0;flex-wrap:wrap;">
            <div class="toolbar-group">
                <span class="toolbar-label" style="font-size:10px;">SIZE:</span>
                ${SIZES.map(s => `<button class="btn btn-sm btn-secondary tex-size-btn" data-size="${s}" style="min-width:36px;">${s}</button>`).join('')}
            </div>
            <div class="toolbar-group">
                <span class="toolbar-label" style="font-size:10px;">ZOOM:</span>
                ${ZOOM_LEVELS.map(z => `<button class="btn btn-sm btn-secondary tex-zoom-btn" data-zoom="${z}" style="min-width:32px;">${z}x</button>`).join('')}
            </div>
            <div class="toolbar-group">
                <button class="btn btn-sm btn-secondary" id="tex-grid-toggle" title="Toggle grid [G]" style="border-color:var(--accent);color:var(--accent);">⊞ Grid</button>
            </div>
            <div class="toolbar-group" style="margin-left:auto;">
                <button class="btn btn-sm btn-secondary" id="tex-undo" disabled title="Undo [Ctrl+Z]">↩ Undo</button>
                <button class="btn btn-sm btn-secondary" id="tex-redo" disabled title="Redo [Ctrl+Y]">↪ Redo</button>
                <button class="btn btn-sm btn-secondary" id="tex-import-btn" title="Import image file">⬆ Import</button>
                <button class="btn btn-sm btn-secondary" id="tex-new-btn" title="New / clear canvas">+ New</button>
            </div>
        </div>

        <!-- Canvas area -->
        <div id="tex-canvas-wrap"
             style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:flex-start;padding:16px;background:var(--bg-inset,#080b10);">
            <canvas id="tex-display-canvas"
                    style="display:block;image-rendering:pixelated;image-rendering:crisp-edges;cursor:crosshair;"></canvas>
        </div>

        <!-- Pixel status -->
        <div style="flex-shrink:0;height:22px;display:flex;align-items:center;padding:0 12px;border-top:1px solid var(--border);background:var(--bg-raised,#0d1219);">
            <span id="tex-pixel-status" style="font-size:11px;font-family:var(--mono-font);color:var(--text-muted);"></span>
        </div>
    </div>
</div>
<input type="file" id="tex-import-input" accept="image/png,image/jpeg,image/webp" style="display:none;">
    `;

    // Canvas refs
    displayCanvas = document.getElementById('tex-display-canvas');
    displayCtx    = displayCanvas.getContext('2d');
    displayCtx.imageSmoothingEnabled = false;

    // Build palette swatches
    const paletteEl = document.getElementById('tex-palette');
    PALETTE.forEach(hex => {
        const sw = document.createElement('div');
        sw.style.cssText = `aspect-ratio:1;background:${hex};cursor:pointer;border:1px solid #0a0e14;border-radius:1px;`;
        sw.title = hex;
        sw.addEventListener('click', () => {
            const c        = hexToRgba(hex);
            const alphaEl  = document.getElementById('tex-alpha');
            currentColor   = { r: c.r, g: c.g, b: c.b, a: alphaEl ? parseInt(alphaEl.value) : 255 };
            syncColorUI();
        });
        paletteEl.appendChild(sw);
    });

    // Tool buttons
    document.querySelectorAll('.tex-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Size buttons
    document.querySelectorAll('.tex-size-btn').forEach(btn => {
        btn.addEventListener('click', () => changeSize(parseInt(btn.dataset.size)));
    });

    // Zoom buttons
    document.querySelectorAll('.tex-zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => setZoom(parseInt(btn.dataset.zoom)));
    });

    // Grid toggle
    document.getElementById('tex-grid-toggle').addEventListener('click', toggleGrid);

    // Undo / Redo
    document.getElementById('tex-undo').addEventListener('click', undo);
    document.getElementById('tex-redo').addEventListener('click', redo);

    // New / Import
    document.getElementById('tex-new-btn').addEventListener('click', newTexture);
    document.getElementById('tex-import-btn').addEventListener('click', () => {
        document.getElementById('tex-import-input').click();
    });
    document.getElementById('tex-import-input').addEventListener('change', handleImport);

    // Save
    document.getElementById('tex-save-btn').addEventListener('click', saveTexture);

    // Color: hex picker
    document.getElementById('tex-color-hex').addEventListener('input', (e) => {
        const hex = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            const c      = hexToRgba(hex);
            const alphaEl = document.getElementById('tex-alpha');
            currentColor = { r: c.r, g: c.g, b: c.b, a: alphaEl ? parseInt(alphaEl.value) : 255 };
            const preview = document.getElementById('tex-color-preview');
            if (preview) preview.style.background = colorToCss(currentColor);
        }
    });

    // Color: alpha slider
    document.getElementById('tex-alpha').addEventListener('input', (e) => {
        currentColor.a = parseInt(e.target.value);
        const preview = document.getElementById('tex-color-preview');
        if (preview) preview.style.background = colorToCss(currentColor);
        syncAlphaLabel();
    });

    // Category
    document.getElementById('tex-category').addEventListener('change', (e) => {
        activeCategory = e.target.value;
        renderAssetList();
    });

    // Refresh assets
    document.getElementById('tex-refresh-btn').addEventListener('click', loadAssetList);

    // Drawing events on display canvas
    displayCanvas.addEventListener('mousedown',  onMouseDown);
    displayCanvas.addEventListener('mousemove',  onMouseMove);
    displayCanvas.addEventListener('mouseup',    onMouseUp);
    displayCanvas.addEventListener('mouseleave', onMouseLeave);

    // Global handlers to continue drawing when cursor leaves the canvas
    globalMoveHandler = (e) => { if (isDrawing) onMouseMove(e); };
    globalUpHandler   = (e) => { if (e.button === 0) { isDrawing = false; lastPixel = null; } };
    window.addEventListener('mousemove', globalMoveHandler);
    window.addEventListener('mouseup',   globalUpHandler);

    // Keyboard shortcuts
    keyDownHandler = makeKeyHandler();
    document.addEventListener('keydown', keyDownHandler);

    // Init offscreen canvas + display
    initCanvas(pixelSize);
    setTool('pencil');
    syncColorUI();
    syncZoomButtons();
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

function cleanup() {
    tabActive = false;
    if (globalMoveHandler) { window.removeEventListener('mousemove', globalMoveHandler); globalMoveHandler = null; }
    if (globalUpHandler)   { window.removeEventListener('mouseup',   globalUpHandler);   globalUpHandler   = null; }
    if (keyDownHandler)    { document.removeEventListener('keydown', keyDownHandler);     keyDownHandler    = null; }
    isDrawing = false;
    lastPixel = null;
}

// ── Export ─────────────────────────────────────────────────────────────────

export default {
    render(root) {
        cleanup();
        buildUI(root);
    },
    async onShow() {
        tabActive = true;
        if (displayCanvas) renderDisplay();
        await loadAssetList();
    },
    onHide() {
        tabActive  = false;
        isDrawing  = false;
        lastPixel  = null;
    },
    async save() {
        await saveTexture();
    },
};
