/**
 * Sprites Tab — Viewer, uploader, and marine-reference comparison tool.
 * All operations save directly to the server via /api/sprites/*.
 */

import { loadImage, readFileAsDataUrl, sanitizeAssetFilename } from './shared/assetUtils.js';
import { createSvgEditor } from './shared/svgEditor.js';

const API = window.editorAPI;
const svgEditor = createSvgEditor(API);

// ── Active sprites — derived dynamically from registry assignments ───────────
let ACTIVE_SPRITES = ['marine_topdown', 'alien_warrior_idle']; // fallback until registry loads

function refreshActiveSprites() {
    const names = new Set();
    for (const path of Object.values(spriteAssignments)) {
        if (typeof path === 'string') {
            // Extract filename stem from path e.g. '/assets/sprites/scaled/alien_warrior/alien_warrior_idle.png' → 'alien_warrior_idle'
            const stem = path.split('/').pop().replace(/\.[^.]+$/, '');
            if (stem) names.add(stem);
        }
    }
    ACTIVE_SPRITES = [...names];
}

// ── Character animation registry ──────────────────────────────────────────
const CHARACTER_REGISTRY = [
    { group: 'Marines', chars: [
        { id: 'marine_team_leader', label: 'Team Leader',       anims: ['idle','walk','hurt','attack','die'] },
        { id: 'marine_tech',        label: 'Tech Marine',        anims: ['idle','walk','hurt','attack','die'] },
        { id: 'marine_medic',       label: 'Medic Marine',       anims: ['idle','walk','hurt','attack','die'] },
        { id: 'marine_smartgun',    label: 'Smart Gun Operator', anims: ['idle','walk','hurt','attack','die'] },
    ]},
    { group: 'Colonists', chars: [
        { id: 'colonist_civilian', label: 'Civilian Colonist',  anims: ['idle','walk','panic'] },
        { id: 'colonist_alive',    label: 'Colonist (Alive)',   anims: ['idle','walk','panic'] },
        { id: 'colonist_cocooned', label: 'Cocooned Colonist',  anims: ['idle','struggle','die'] },
    ]},
    { group: 'Aliens', chars: [
        { id: 'alien_facehugger',   label: 'Facehugger',         anims: ['idle','crawl','jump','attach'] },
        { id: 'alien_chestburster', label: 'Chestburster',        anims: ['crawl','idle','attack'] },
        { id: 'alien_drone',        label: 'Alien Drone',         anims: ['idle','walk','attack','die'] },
        { id: 'alien_warrior',      label: 'Alien Warrior',       anims: ['idle','walk','attack','hurt','die'] },
        { id: 'alien_pre_queen',    label: 'Alien Pre-Queen',     anims: ['idle','evolve'] },
        { id: 'alien_queen',        label: 'Alien Queen',         anims: ['idle','attack','spawn','die'] },
    ]},
    { group: 'Eggs', chars: [
        { id: 'egg', label: 'Egg', anims: ['idle','open','spawn'] },
    ]},
    { group: 'Environmental', chars: [
        { id: 'env_door',    label: 'Door',               anims: ['closed','open','locked','destroyed'] },
        { id: 'env_console', label: 'Console / Terminal', anims: ['idle','active','damaged'] },
    ]},
];

// Fallback chain: if an animation is missing, use its fallback instead
const FALLBACK_RULES = { attack: 'idle', hurt: 'idle', walk: 'idle', open: 'closed', active: 'idle' };

let container = null;
let spriteList = [];
let marineRef = null;
let selectedSprite = null;
let compareCanvas = null;
let compareCtx = null;
let gamePreviewCanvas = null;
let gamePreviewCtx = null;
let scaleSlider = null;
let marineImg = null;
let spriteImg = null;
let uploadInput = null;
let gridSize = 32; // Configurable reference grid (8–1024px)

// ── Registry state ─────────────────────────────────────────────────────────
let currentView = 'sprites';
const DEFAULT_SPRITE_ASSIGNMENTS = {
    'marine_team_leader:idle': '/src/graphics/generated/marine_topdown_256.png',
    'marine_team_leader:walk': '/src/graphics/generated/marine_topdown_256.png',
    'alien_warrior:idle':      '/assets/sprites/scaled/alien_warrior/alien_warrior_idle.png',
};
let spriteAssignments = { ...DEFAULT_SPRITE_ASSIGNMENTS };

async function loadAssignments() {
    spriteAssignments = { ...DEFAULT_SPRITE_ASSIGNMENTS };
    try {
        const resp = await API.apiFetch('/api/sprites/registry');
        const data = await resp.json();
        if (data.ok && data.registry && typeof data.registry === 'object') {
            Object.assign(spriteAssignments, data.registry.assignments || {});
            try {
                localStorage.setItem('aliens_sprite_registry_v1', JSON.stringify(spriteAssignments));
            } catch {}
            refreshActiveSprites();
            return;
        }
    } catch {}

    try {
        const s = localStorage.getItem('aliens_sprite_registry_v1');
        if (s) Object.assign(spriteAssignments, JSON.parse(s));
    } catch {}
    refreshActiveSprites();
}

async function saveAssignments() {
    try {
        const resp = await API.apiFetch('/api/sprites/registry', {
            method: 'POST',
            body: JSON.stringify({
                version: 1,
                assignments: spriteAssignments,
            }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'Registry save failed');
    } catch (err) {
        try { localStorage.setItem('aliens_sprite_registry_v1', JSON.stringify(spriteAssignments)); } catch {}
        throw err;
    }

    try { localStorage.setItem('aliens_sprite_registry_v1', JSON.stringify(spriteAssignments)); } catch {}
}

function buildUI(root) {
    container = root;
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <aside class="sidebar" style="width:280px; min-width:220px; display:flex; flex-direction:column;">
                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header" style="gap:4px;">
                        <button class="btn btn-sm btn-primary" id="spr-view-sprites" style="padding:1px 8px;">Sprites</button>
                        <button class="btn btn-sm btn-secondary" id="spr-view-chars" style="padding:1px 8px;">Characters</button>
                        <button class="btn btn-sm btn-secondary" id="spr-view-svg" style="padding:1px 8px;">SVG</button>
                        <div style="flex:1;"></div>
                        <button class="btn btn-sm btn-primary" id="spr-upload-btn" title="Upload sprite">+ Upload</button>
                        <button class="btn btn-sm btn-secondary" id="spr-refresh-btn" title="Refresh list">↻</button>
                    </div>
                    <div id="spr-sprites-panel" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
                        <div style="padding:4px 8px;">
                            <select id="spr-category" class="input-sm" style="width:100%;margin-bottom:4px;">
                                <option value="active" selected>Active Sprites</option>
                                <option value="marine">Marines</option>
                                <option value="alien">Aliens</option>
                                <option value="floor">Floor Tiles</option>
                                <option value="wall">Wall Tiles</option>
                                <option value="prop">Props</option>
                                <optgroup label="── Assets ──">
                                    <option value="assets-door">Door Sprites</option>
                                    <option value="assets-objects">Objects/Props</option>
                                    <option value="assets-sprites">Character Sprites</option>
                                </optgroup>
                                <option value="all">All Files</option>
                            </select>
                        </div>
                        <div class="panel-body" style="flex:1; overflow-y:auto; padding:0;">
                            <div id="spr-list"></div>
                        </div>
                    </div>
                    <div id="spr-chars-panel" style="display:none;flex-direction:column;flex:1;overflow-y:auto;">
                        <div id="spr-char-registry"></div>
                    </div>
                    <div id="spr-svg-panel" style="display:none;flex-direction:column;flex:1;overflow:hidden;"></div>
                </div>
            </aside>

            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div id="spr-main-view" style="display:flex; flex:1; flex-direction:column; overflow:hidden;">
                    <div class="toolbar" id="spr-toolbar">
                        <div class="toolbar-group">
                            <label class="toolbar-label">Scale:</label>
                            <input type="range" id="spr-scale" min="0.1" max="1" step="0.1" value="1" style="width:140px;">
                            <span id="spr-scale-lbl" class="toolbar-label" style="min-width:45px;">1.0x</span>
                        </div>
                        <div class="toolbar-group">
                            <span class="toolbar-label" style="color:var(--text-muted);">Downscale only</span>
                        </div>
                        <div class="toolbar-group">
                            <label class="toolbar-label">Background:</label>
                            <select id="spr-bg" class="input-sm">
                                <option value="#1a1a2e">Dark</option>
                                <option value="#333">Gray</option>
                                <option value="#0a0a0a">Black</option>
                                <option value="checker">Checker</option>
                            </select>
                        </div>
                        <div class="toolbar-group">
                            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                                <input type="checkbox" id="spr-show-marine" checked> Marine Ref
                            </label>
                        </div>
                        <div class="toolbar-group" style="align-items:center;gap:4px;">
                            <label class="toolbar-label">Grid:</label>
                            <select id="spr-grid-size" class="input-sm" style="width:70px;">
                                <option value="0">Off</option>
                                <option value="8">8px</option>
                                <option value="16">16px</option>
                                <option value="32" selected>32px</option>
                                <option value="64">64px</option>
                                <option value="128">128px</option>
                                <option value="256">256px</option>
                                <option value="512">512px</option>
                                <option value="1024">1024px</option>
                            </select>
                        </div>
                        <div class="toolbar-group" style="margin-left:auto;">
                            <button class="btn btn-sm btn-primary" id="spr-save-btn" disabled>Save Scaled</button>
                            <button class="btn btn-sm btn-danger" id="spr-del-btn" disabled>Delete</button>
                        </div>
                    </div>

                    <div style="flex:1; display:grid; grid-template-columns:minmax(0,1fr) 260px; gap:12px; padding:0 12px 12px 12px; overflow:hidden;">
                        <div class="canvas-wrap" id="spr-canvas-wrap" style="overflow:auto; display:flex; align-items:center; justify-content:center; min-width:0;">
                            <canvas id="spr-canvas" width="512" height="512"></canvas>
                        </div>
                        <div class="panel" style="display:flex; flex-direction:column; overflow:hidden;">
                            <div class="panel-header">Marine In-Game Size</div>
                            <div class="panel-body" style="display:flex; flex-direction:column; gap:8px; padding:10px;">
                                <canvas id="spr-game-preview" width="320" height="180" style="width:100%; aspect-ratio:16 / 9; border:1px solid var(--border); border-radius:4px; background:#0a0d12;"></canvas>
                                <div id="spr-game-preview-info" style="font-size:11px; color:var(--text-muted); line-height:1.45;">
                                    Select the Marine sprite to preview how it reads in the 720p game frame.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="panel" style="max-height:100px;">
                        <div class="panel-body" style="display:flex; gap:20px; padding:6px 12px; font-size:12px;">
                            <div>
                                <div style="color:var(--accent);font-weight:600;">Marine Reference</div>
                                <div id="spr-marine-info" style="color:var(--text-muted);">Loading…</div>
                            </div>
                            <div style="border-left:1px solid var(--border);"></div>
                            <div>
                                <div style="color:var(--accent);font-weight:600;">Selected Sprite</div>
                                <div id="spr-selected-info" style="color:var(--text-muted);">None selected</div>
                            </div>
                            <div style="border-left:1px solid var(--border);"></div>
                            <div>
                                <div style="color:var(--accent);font-weight:600;">Comparison</div>
                                <div id="spr-compare-info" style="color:var(--text-muted);">—</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="spr-svg-main" style="display:none; flex:1; overflow:hidden;"></div>
            </div>
        </div>
        <input type="file" id="spr-upload-input" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
    `;

    compareCanvas = document.getElementById('spr-canvas');
    compareCtx = compareCanvas.getContext('2d');
    gamePreviewCanvas = document.getElementById('spr-game-preview');
    gamePreviewCtx = gamePreviewCanvas?.getContext('2d') || null;
    scaleSlider = document.getElementById('spr-scale');
    uploadInput = document.getElementById('spr-upload-input');

    scaleSlider.addEventListener('input', () => {
        if (parseFloat(scaleSlider.value) > 1) scaleSlider.value = '1';
        document.getElementById('spr-scale-lbl').textContent = `${parseFloat(scaleSlider.value).toFixed(1)}x`;
        drawCompare();
    });
    document.getElementById('spr-bg').addEventListener('change', drawCompare);
    document.getElementById('spr-show-marine').addEventListener('change', drawCompare);
    document.getElementById('spr-grid-size').addEventListener('change', (e) => { gridSize = parseInt(e.target.value) || 0; drawCompare(); });
    document.getElementById('spr-upload-btn').addEventListener('click', () => uploadInput.click());
    document.getElementById('spr-refresh-btn').addEventListener('click', loadSpriteList);
    document.getElementById('spr-save-btn').addEventListener('click', saveScaledSprite);
    document.getElementById('spr-del-btn').addEventListener('click', deleteSprite);
    document.getElementById('spr-category').addEventListener('change', renderList);
    uploadInput.addEventListener('change', handleUpload);
    document.getElementById('spr-view-sprites').addEventListener('click', () => setView('sprites'));
    document.getElementById('spr-view-chars').addEventListener('click', () => setView('chars'));
    document.getElementById('spr-view-svg').addEventListener('click', () => setView('svg'));

    // Add "Edit in Piskel" button to toolbar
    const toolbarGroup = document.querySelector('.toolbar-group');
    if (toolbarGroup) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-secondary';
        editBtn.textContent = '✎ Edit in Piskel';
        editBtn.id = 'spr-edit-piskel-btn';
        editBtn.disabled = true;
        editBtn.title = 'Open selected sprite in Piskel editor';
        toolbarGroup.parentNode.querySelector('.toolbar-group:last-child').insertBefore(editBtn, toolbarGroup.parentNode.querySelector('.toolbar-group:last-child').firstChild);
        editBtn.addEventListener('click', openPiskelEditor);
    }

    const wrap = document.getElementById('spr-canvas-wrap');
    const ro = new ResizeObserver(() => {
        compareCanvas.width = Math.max(400, wrap.clientWidth - 32);
        compareCanvas.height = Math.max(300, wrap.clientHeight - 16);
        drawCompare();
        drawGameScalePreview();
    });
    ro.observe(wrap);

    svgEditor.mount(document.getElementById('spr-svg-panel'), document.getElementById('spr-svg-main'));
}

function isMarineSelection() {
    const name = String(selectedSprite?.name || '').toLowerCase();
    const category = String(selectedSprite?.category || '').toLowerCase();
    return category === 'marine' || name.includes('marine');
}

function drawGameScalePreview() {
    if (!gamePreviewCanvas || !gamePreviewCtx) return;

    const ctx = gamePreviewCtx;
    const canvasW = gamePreviewCanvas.width;
    const canvasH = gamePreviewCanvas.height;
    const info = document.getElementById('spr-game-preview-info');
    const logicalGameW = 1280;
    const logicalGameH = 720;
    const scaleX = canvasW / logicalGameW;
    const scaleY = canvasH / logicalGameH;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.strokeStyle = 'rgba(74,164,216,0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= logicalGameW; x += 160) {
        const px = Math.round(x * scaleX) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvasH);
        ctx.stroke();
    }
    for (let y = 0; y <= logicalGameH; y += 90) {
        const py = Math.round(y * scaleY) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvasW, py);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, canvasH - 28, canvasW, 28);

    if (!isMarineSelection() || !marineImg || !marineRef) {
        if (info) info.textContent = 'Select the Marine sprite to preview how it reads in the 1280×720 game frame.';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.fillText('720p frame preview', 10, 18);
        return;
    }

    const displayW = Number(marineRef.gameDisplayWidth) || Number(marineRef.frameWidth) || marineImg.naturalWidth;
    const displayH = Number(marineRef.gameDisplayHeight) || Number(marineRef.frameHeight) || marineImg.naturalHeight;
    const drawW = displayW * scaleX;
    const drawH = displayH * scaleY;
    const drawX = (canvasW - drawW) * 0.5;
    const drawY = canvasH - 20 - drawH;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(marineImg, 0, 0, marineRef.frameWidth, marineRef.frameHeight, drawX, drawY, drawW, drawH);
    ctx.imageSmoothingEnabled = false;

    ctx.strokeStyle = 'rgba(51,255,102,0.55)';
    ctx.strokeRect(drawX - 0.5, drawY - 0.5, drawW + 1, drawH + 1);
    ctx.fillStyle = '#33ff66';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillText('720p frame preview', 10, 18);
    ctx.fillText(`${displayW}×${displayH}px in-game`, 10, 34);

    if (info) {
        info.textContent = `Marine displayed at ${displayW}×${displayH}px inside a logical 1280×720 frame. This preview is resolution-independent and reflects in-game size, not editor zoom.`;
    }
}

async function loadMarineRef() {
    try {
        const resp = await API.apiFetch('/api/sprites/marine-reference');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        marineRef = data;
        const img = await loadImage(data.path);
        if (img.complete && img.naturalWidth > 0) marineImg = img;
        const gdw = data.gameDisplayWidth || data.frameWidth;
        const gdh = data.gameDisplayHeight || data.frameHeight;
        document.getElementById('spr-marine-info').textContent =
            `${data.frameWidth}×${data.frameHeight}px source | In-game: ${gdw}×${gdh}px | ${data.frameCount} frames`;
        drawGameScalePreview();
    } catch (err) {
        marineImg = null; marineRef = null;
        const el = document.getElementById('spr-marine-info');
        if (el) el.textContent = 'Marine reference not found';
        drawGameScalePreview();
    }
}

async function loadSpriteList() {
    try {
        const resp = await API.apiFetch('/api/sprites');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        spriteList = data.sprites;
        renderList();
    } catch (err) {
        API.toast('Failed to load sprites: ' + err.message, 'error');
    }
}

function renderList() {
    const el = document.getElementById('spr-list');
    const cat = document.getElementById('spr-category')?.value || 'active';
    let filtered = spriteList;
    if (cat === 'active') {
        filtered = spriteList.filter(s => ACTIVE_SPRITES.includes(s.name));
    } else if (cat === 'game') {
        filtered = spriteList.filter(s => s.category === 'marine' || s.category === 'alien');
    } else if (cat.startsWith('assets-')) {
        const assetSub = cat.slice('assets-'.length); // e.g. 'floor', 'wall'
        filtered = spriteList.filter(s => s.dir && s.dir.replace(/\\/g, '/').includes(`assets/${assetSub}`));
    } else if (cat !== 'all') {
        filtered = spriteList.filter(s => s.category === cat);
    }
    if (!filtered.length) { el.innerHTML = '<div style="padding:12px;color:var(--text-muted);">No sprites in this category</div>'; return; }
    el.innerHTML = filtered.map((s) => {
        const idx = spriteList.indexOf(s);
        return `
        <div class="sprite-item ${selectedSprite?.path === s.path ? 'active' : ''}" data-idx="${idx}"
             style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);">
            <img src="${s.path}" alt="" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;">
            <div style="overflow:hidden;">
                <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
                <div style="font-size:10px;color:var(--text-muted);">${s.dir}</div>
            </div>
        </div>
    `;
    }).join('');
    el.querySelectorAll('.sprite-item').forEach(item => {
        item.addEventListener('click', () => selectSprite(spriteList[parseInt(item.dataset.idx)]));
    });
}

async function selectSprite(sprite) {
    selectedSprite = sprite;
    renderList();
    document.getElementById('spr-save-btn').disabled = false;
    document.getElementById('spr-del-btn').disabled = false;
    document.getElementById('spr-edit-piskel-btn').disabled = false;

    spriteImg = await loadImage(sprite.path + '?t=' + Date.now());
    document.getElementById('spr-selected-info').textContent = `${spriteImg.naturalWidth}×${spriteImg.naturalHeight}px | ${sprite.name}`;
    drawCompare();
    drawGameScalePreview();
}

function drawCompare() {
    if (!compareCanvas || !compareCtx) return;
    const ctx = compareCtx;
    const cw = compareCanvas.width;
    const ch = compareCanvas.height;
    const bg = document.getElementById('spr-bg')?.value ?? 'checker';
    const showMarine = document.getElementById('spr-show-marine')?.checked;

    // Background
    if (bg === 'checker') {
        for (let y = 0; y < ch; y += 16) for (let x = 0; x < cw; x += 16) {
            ctx.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#1a1a2e' : '#16162a';
            ctx.fillRect(x, y, 16, 16);
        }
    } else { ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch); }

    const scale = parseFloat(scaleSlider.value);
    const cx = cw / 2, cy = ch / 2;

    // Configurable reference grid
    if (gridSize > 0) {
        ctx.strokeStyle = 'rgba(74,164,216,0.15)'; ctx.lineWidth = 1;
        for (let x = cx % gridSize; x < cw; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
        for (let y = cy % gridSize; y < ch; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
        // Label grid size
        ctx.fillStyle = 'rgba(74,164,216,0.35)'; ctx.font = '9px "Share Tech Mono",monospace';
        ctx.fillText(`${gridSize}px grid`, 4, 12);
    }

    // Baseline
    let baselineY = cy;

    // Marine ref — draw at in-game display size, not raw pixel size
    if (showMarine && marineImg && marineRef) {
        const mw = marineRef.gameDisplayWidth || marineRef.frameWidth;
        const mh = marineRef.gameDisplayHeight || marineRef.frameHeight;
        const mx = cx - mw - 30;
        const my = cy - mh / 2;
        baselineY = my + mh;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(marineImg, 0, 0, marineRef.frameWidth, marineRef.frameHeight, mx, my, mw, mh);
        ctx.fillStyle = '#33ff66'; ctx.font = '11px "Share Tech Mono",monospace';
        ctx.fillText(`Marine in-game (${mw}×${mh})`, mx, my - 6);
        ctx.strokeStyle = 'rgba(51,255,102,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(mx - .5, my - .5, mw + 1, mh + 1);
    }

    // Selected sprite
    if (spriteImg) {
        const sw = spriteImg.naturalWidth * scale, sh = spriteImg.naturalHeight * scale;
        const sx = showMarine ? cx + 30 : cx - sw / 2;
        const sy = (showMarine && marineRef) ? baselineY - sh : cy - sh / 2;
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.drawImage(spriteImg, sx, sy, sw, sh);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#7ecfff'; ctx.font = '11px "Share Tech Mono",monospace';
        ctx.fillText(`${selectedSprite?.name || 'Sprite'} (${Math.round(sw)}×${Math.round(sh)}) @ ${scale.toFixed(1)}x`, sx, sy - 6);
        ctx.strokeStyle = 'rgba(126,207,255,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(sx - .5, sy - .5, sw + 1, sh + 1);

        // Baseline comparison line
        if (showMarine && marineRef) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(0, baselineY); ctx.lineTo(cw, baselineY); ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Update info
    const info = document.getElementById('spr-compare-info');
    if (!info) return;
    if (spriteImg && marineRef) {
        const sw = Math.round(spriteImg.naturalWidth * scale), sh = Math.round(spriteImg.naturalHeight * scale);
        const gmw = marineRef.gameDisplayWidth || marineRef.frameWidth;
        const gmh = marineRef.gameDisplayHeight || marineRef.frameHeight;
        info.textContent = `Scaled: ${sw}×${sh}px | vs Marine in-game (${gmw}×${gmh}): ${(sw / gmw).toFixed(2)}x W, ${(sh / gmh).toFixed(2)}x H`;
    } else { info.textContent = '—'; }

    drawGameScalePreview();
}

async function handleUpload() {
    const file = uploadInput.files[0];
    if (!file) return;
    const { body, footer, close } = API.showModal('Upload Sprite');
    body.innerHTML = `
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Filename:</label>
            <input type="text" id="up-fname" class="input" value="${file.name.replace(/[^a-zA-Z0-9_\-. ]/g, '')}" style="width:100%;">
        </div>
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Directory:</label>
            <select id="up-dir" class="input" style="width:100%;">
                <optgroup label="── Assets (Map Editor) ──">
                    <option value="assets/floor">assets/floor — Floor Tiles</option>
                    <option value="assets/wall">assets/wall — Wall Tiles</option>
                    <option value="assets/door">assets/door — Door Sprites</option>
                    <option value="assets/objects">assets/objects — Objects/Props</option>
                    <option value="assets/sprites">assets/sprites — Character Sprites</option>
                </optgroup>
                <optgroup label="── Game Engine ──">
                    <option value="src/graphics">src/graphics</option>
                    <option value="src/graphics/generated">src/graphics/generated</option>
                    <option value="src/graphics/imported">src/graphics/imported</option>
                </optgroup>
            </select>
        </div>
        <canvas id="up-preview" style="max-width:200px;max-height:200px;border:1px solid var(--border);image-rendering:pixelated;"></canvas>
    `;
    footer.innerHTML = `<button class="btn btn-secondary" id="up-cancel">Cancel</button> <button class="btn btn-primary" id="up-ok">Upload</button>`;
    const prev = document.getElementById('up-preview');
    const pCtx = prev.getContext('2d');
    const img = new Image();
    img.onload = () => { prev.width = img.naturalWidth; prev.height = img.naturalHeight; pCtx.imageSmoothingEnabled = false; pCtx.drawImage(img, 0, 0); };
    img.src = URL.createObjectURL(file);
    document.getElementById('up-cancel').onclick = close;
    document.getElementById('up-ok').onclick = async () => {
        const fname = sanitizeAssetFilename(document.getElementById('up-fname').value, 'sprite');
        const dir = document.getElementById('up-dir').value;
        if (!fname) { API.toast('Invalid filename', 'error'); return; }
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const resp = await API.apiFetch('/api/sprites/save', { method: 'POST', body: JSON.stringify({ filename: fname, dir, dataUrl }) });
            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);
            API.toast(`Uploaded: ${fname}`, 'success'); API.recordSave(); close(); await loadSpriteList();
        } catch (err) { API.toast('Upload failed: ' + err.message, 'error'); }
    };
    uploadInput.value = '';
}

async function saveScaledSprite() {
    if (!selectedSprite || !spriteImg) return;
    const scale = parseFloat(scaleSlider.value);
    if (scale === 1) { API.toast('Scale is 1.0x — no change to save', 'info'); return; }
    if (scale > 1) { API.toast('Upscaling is disabled. The sprite editor only rescales down.', 'error'); return; }
    const nw = Math.round(spriteImg.naturalWidth * scale), nh = Math.round(spriteImg.naturalHeight * scale);
    const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh;
    const octx = oc.getContext('2d'); octx.imageSmoothingEnabled = scale < 1;
    octx.drawImage(spriteImg, 0, 0, nw, nh);
    try {
        // Save to the original location (which should be /assets/sprites/scaled/)
        const resp = await API.apiFetch('/api/sprites/save', {
            method: 'POST',
            body: JSON.stringify({ filename: selectedSprite.name, dir: selectedSprite.dir, dataUrl: oc.toDataURL('image/png') }),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);

        // Update sprite registry with new dimensions
        await updateSpriteRegistry(selectedSprite, nw, nh);

        API.toast(`Saved ${selectedSprite.name} at ${scale}x (${nw}×${nh}px)`, 'success'); API.recordSave();
        scaleSlider.value = 1; document.getElementById('spr-scale-lbl').textContent = '1.0x';
        // Reload marine reference if we just scaled the marine
        if (isMarineSelection()) await loadMarineRef();
        await selectSprite(selectedSprite);
    } catch (err) { API.toast('Save failed: ' + err.message, 'error'); }
}

async function updateSpriteRegistry(sprite, width, height) {
    try {
        // Read current registry
        const resp = await API.apiFetch('/api/sprites/registry');
        const data = await resp.json();
        const registry = (data.ok && data.registry) ? data.registry : { version: 2, characters: {}, assignments: {} };

        // Detect character from sprite path or name
        const pathParts = sprite.path.split('/');
        const isScaledPipeline = sprite.path.includes('/assets/sprites/scaled/');
        const character = isScaledPipeline ? pathParts[pathParts.length - 2] : null;

        if (character) {
            if (!registry.characters) registry.characters = {};
            if (!registry.characters[character]) registry.characters[character] = {};
            // Use filename without extension as animation key
            const animKey = sprite.name.replace(/^.*_/, '') || 'idle';
            registry.characters[character][animKey] = {
                ref: sprite.name + '.png',
                scaled: sprite.name + '.png',
                width,
                height,
            };

            // Update reference sprite if this is the marine
            if (character === 'marine') {
                registry.referenceSprite = {
                    character: 'marine',
                    animation: animKey,
                    path: sprite.path,
                    width,
                    height,
                };
            }

            // Update assignments
            if (!registry.assignments) registry.assignments = {};
            registry.assignments[`${character}:${animKey}`] = sprite.path;
        }

        registry.version = 2;

        // Save registry
        await API.apiFetch('/api/sprites/registry', {
            method: 'POST',
            body: JSON.stringify(registry),
        });
    } catch (err) {
        console.warn('Failed to update sprite registry:', err);
    }
}

async function deleteSprite() {
    if (!selectedSprite) return;
    if (!confirm(`Delete ${selectedSprite.name}?`)) return;
    try {
        const resp = await API.apiFetch(`/api/sprites/${encodeURIComponent(selectedSprite.dir)}/${encodeURIComponent(selectedSprite.name)}`, { method: 'DELETE' });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        API.toast(`Deleted ${selectedSprite.name}`, 'success');
        selectedSprite = null; spriteImg = null;
        document.getElementById('spr-save-btn').disabled = true;
        document.getElementById('spr-del-btn').disabled = true;
        drawCompare(); await loadSpriteList();
    } catch (err) { API.toast('Delete failed: ' + err.message, 'error'); }
}

// ── Piskel.js Integration ─────────────────────────────────────────────────
let piskelWindow = null;
let piskelEditorState = null;  // Track Piskel state during edit session

async function openPiskelEditor() {
    if (!selectedSprite || !spriteImg) {
        API.toast('No sprite selected', 'error');
        return;
    }

    // Convert sprite image to canvas imagedata
    const cv = document.createElement('canvas');
    cv.width = spriteImg.naturalWidth;
    cv.height = spriteImg.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(spriteImg, 0, 0);
    const imageData = ctx.getImageData(0, 0, cv.width, cv.height);

    // Create enhanced modal with Piskel iframe
    const modal = API.showModal(`Edit Sprite: ${selectedSprite.name}`, { width: '95vw' });
    const { body, footer } = modal;
    let closeModal = modal.close;
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 380px;gap:12px;height:620px;overflow:hidden;">
            <!-- Piskel editor on left -->
            <div style="position:relative;border:1px solid var(--border);background:#0a0a0a;border-radius:4px;overflow:hidden;">
                <iframe id="piskel-iframe"
                        src="https://www.piskelapp.com/?embed"
                        style="width:100%;height:100%;border:none;background:#0a0a0a;"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms">
                </iframe>
            </div>

            <!-- Right panel: instructions + preview -->
            <div style="display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
                <div style="padding:8px;background:var(--bg-secondary);border-radius:4px;border-left:3px solid var(--accent);">
                    <div style="font-weight:600;margin-bottom:4px;color:var(--accent);">📋 Workflow</div>
                    <div style="font-size:11px;line-height:1.6;color:var(--text-muted);">
                        1. Edit your sprite in Piskel<br/>
                        2. Click File → Export as PNG<br/>
                        3. Upload or drag-drop below<br/>
                        4. Preview will show<br/>
                        5. Click Save to commit
                    </div>
                </div>

                <!-- Drop zone -->
                <div id="piskel-dropzone"
                     style="flex:1;border:2px dashed var(--border);border-radius:4px;padding:8px;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(74,164,216,0.05);cursor:pointer;transition:all 0.2s;">
                    <div style="font-size:12px;color:var(--text-muted);">
                        📁 Drop PNG here<br/><br/>
                        <strong style="color:var(--text);">or</strong><br/><br/>
                        <button class="btn btn-sm btn-secondary" id="piskel-upload-btn" style="margin-top:4px;">Choose File</button>
                    </div>
                </div>

                <!-- Preview -->
                <div id="piskel-preview-container" style="display:none;border:1px solid var(--border);border-radius:4px;padding:4px;background:var(--bg-secondary);overflow:hidden;">
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:600;">Preview</div>
                    <canvas id="piskel-preview-canvas" style="max-width:100%;height:auto;image-rendering:pixelated;display:block;margin:0 auto;"></canvas>
                    <div id="piskel-preview-info" style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:center;"></div>
                </div>

                <!-- Keyboard hints -->
                <div style="padding:6px;background:rgba(255,255,255,0.03);border-radius:3px;font-size:10px;color:var(--text-muted);">
                    <strong>⌨️ Shortcuts:</strong><br/>
                    Enter = Save | Esc = Cancel
                </div>
            </div>
        </div>
        <input type="file" id="piskel-import-input" accept="image/png" style="display:none;">
    `;
    footer.innerHTML = `
        <button class="btn btn-secondary" id="piskel-cancel">Cancel</button>
        <button class="btn btn-primary" id="piskel-save" disabled style="margin-left:auto;">💾 Save Changes</button>
    `;

    const importInput = document.getElementById('piskel-import-input');
    const uploadBtn = document.getElementById('piskel-upload-btn');
    const dropzone = document.getElementById('piskel-dropzone');
    const previewContainer = document.getElementById('piskel-preview-container');
    const previewCanvas = document.getElementById('piskel-preview-canvas');
    const previewInfo = document.getElementById('piskel-preview-info');
    const saveBtn = document.getElementById('piskel-save');
    const cancelBtn = document.getElementById('piskel-cancel');

    // File input handlers
    uploadBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => handlePiskelFileImport(e.target.files[0]));

    // Drag-drop handlers
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--accent)';
        dropzone.style.background = 'rgba(74,164,216,0.15)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--border)';
        dropzone.style.background = 'rgba(74,164,216,0.05)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        dropzone.style.background = 'rgba(74,164,216,0.05)';
        const files = e.dataTransfer.files;
        if (files.length > 0) handlePiskelFileImport(files[0]);
    });

    // Preview and save handlers
    async function handlePiskelFileImport(file) {
        if (!file) return;

        try {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                throw new Error('Please select an image file (PNG recommended)');
            }

            const dataUrl = await new Promise((res, rej) => {
                readFileAsDataUrl(file).then(res).catch(rej);
            });

            // Load and preview
            const img = await loadImage(dataUrl);

            // Draw preview
            previewCanvas.width = Math.min(img.naturalWidth, 340);
            previewCanvas.height = Math.min(img.naturalHeight, 200);
            const pCtx = previewCanvas.getContext('2d');
            pCtx.imageSmoothingEnabled = false;
            pCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);

            previewInfo.textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
            previewContainer.style.display = 'block';

            // Store for saving
            piskelEditorState = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
            saveBtn.disabled = false;

            API.toast(`Loaded ${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`, 'success');
        } catch (err) {
            API.toast('Failed to load image: ' + err.message, 'error');
            piskelEditorState = null;
            saveBtn.disabled = true;
        }
    }

    // Save handler
    saveBtn.addEventListener('click', savePiskelChanges);

    async function savePiskelChanges() {
        if (!piskelEditorState) return;

        try {
            // Save the edited sprite
            const resp = await API.apiFetch('/api/sprites/save', {
                method: 'POST',
                body: JSON.stringify({
                    filename: selectedSprite.name,
                    dir: selectedSprite.dir,
                    dataUrl: piskelEditorState.dataUrl,
                }),
            });

            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);

            API.toast(`✓ Saved ${selectedSprite.name} (${piskelEditorState.width}×${piskelEditorState.height}px)`, 'success');
            API.recordSave();
            closeModal();

            // Reload sprite
            await selectSprite(selectedSprite);
            piskelEditorState = null;
        } catch (err) {
            API.toast('Save failed: ' + err.message, 'error');
        }
    }

    // Cancel handler
    cancelBtn.addEventListener('click', () => {
        piskelEditorState = null;
        closeModal();
    });

    // Keyboard shortcuts
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !saveBtn.disabled) {
            e.preventDefault();
            savePiskelChanges();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelBtn.click();
        }
    };

    document.addEventListener('keydown', handleKeyDown, { once: false });

    // Cleanup on close
    const originalClose = closeModal;
    closeModal = () => {
        document.removeEventListener('keydown', handleKeyDown);
        originalClose();
    };

    // Try to load sprite data into Piskel (future enhancement)
    const iframe = document.getElementById('piskel-iframe');
    if (iframe && iframe.contentWindow) {
        // Note: Direct image load to Piskel is complex due to CORS/sandbox restrictions
        // For now, user exports from Piskel and uploads
        API.setStatus('Loading Piskel editor... You can import the image via "File" → "Import" in Piskel if needed');
    }
}

// ── Registry view ─────────────────────────────────────────────────────────
window._sprAssign = function(charId, anim) { openAssignModal(charId, anim); };

function setView(v) {
    currentView = v;
    const sp = document.getElementById('spr-sprites-panel');
    const cp = document.getElementById('spr-chars-panel');
    const svp = document.getElementById('spr-svg-panel');
    const sm = document.getElementById('spr-main-view');
    const svm = document.getElementById('spr-svg-main');
    const bs = document.getElementById('spr-view-sprites');
    const bc = document.getElementById('spr-view-chars');
    const bv = document.getElementById('spr-view-svg');
    const uploadBtn = document.getElementById('spr-upload-btn');
    const refreshBtn = document.getElementById('spr-refresh-btn');
    if (sp) sp.style.display = v === 'sprites' ? 'flex' : 'none';
    if (cp) cp.style.display = v === 'chars' ? 'flex' : 'none';
    if (svp) svp.style.display = v === 'svg' ? 'flex' : 'none';
    if (sm) sm.style.display = v === 'svg' ? 'none' : 'flex';
    if (svm) svm.style.display = v === 'svg' ? 'flex' : 'none';
    if (bs) { bs.classList.toggle('btn-primary', v === 'sprites'); bs.classList.toggle('btn-secondary', v !== 'sprites'); }
    if (bc) { bc.classList.toggle('btn-primary', v === 'chars'); bc.classList.toggle('btn-secondary', v !== 'chars'); }
    if (bv) { bv.classList.toggle('btn-primary', v === 'svg'); bv.classList.toggle('btn-secondary', v !== 'svg'); }
    if (uploadBtn) uploadBtn.style.display = v === 'svg' ? 'none' : '';
    if (refreshBtn) refreshBtn.style.display = v === 'svg' ? 'none' : '';
    if (v === 'chars') renderCharacterRegistry();
    if (v === 'svg') svgEditor.onShow();
}

function renderCharacterRegistry() {
    const el = document.getElementById('spr-char-registry');
    if (!el) return;
    let html = '';
    for (const group of CHARACTER_REGISTRY) {
        html += `<div style="padding:3px 8px;background:var(--bg-secondary);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);border-top:1px solid var(--border);">${group.group}</div>`;
        for (const char of group.chars) {
            html += `<div style="border-bottom:1px solid var(--border);"><div style="padding:5px 8px;font-size:11px;font-weight:600;color:var(--text);background:rgba(255,255,255,0.03);">${char.label}</div>`;
            for (const anim of char.anims) {
                const key = `${char.id}:${anim}`;
                const assigned = spriteAssignments[key];
                const fbKey = FALLBACK_RULES[anim];
                const hasFallback = !assigned && fbKey && spriteAssignments[`${char.id}:${fbKey}`];
                const status = assigned ? 'ok' : (hasFallback ? 'fallback' : 'missing');
                const dot = status === 'ok' ? '●' : (status === 'fallback' ? '◑' : '○');
                const dotColor = status === 'ok' ? '#33ff66' : (status === 'fallback' ? '#ffcc44' : '#ff5555');
                const info = assigned ? assigned.split('/').pop() : (hasFallback ? `→ ${fbKey}` : '—');
                html += `<div style="display:flex;align-items:center;gap:5px;padding:2px 8px 2px 16px;font-size:10px;border-top:1px solid rgba(255,255,255,0.03);">
                    <span style="color:${dotColor};font-size:9px;flex-shrink:0;" title="${status}">${dot}</span>
                    <span style="width:56px;color:var(--text-muted);flex-shrink:0;">${anim}</span>
                    ${assigned ? `<img src="${assigned}" style="width:18px;height:18px;object-fit:contain;image-rendering:pixelated;background:#111;flex-shrink:0;">` : '<span style="width:18px;flex-shrink:0;"></span>'}
                    <span style="flex:1;color:${status==='missing'?'#ff6666':status==='fallback'?'#ffcc44':'var(--text-muted)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${info}</span>
                    <button class="btn btn-sm btn-secondary" onclick="window._sprAssign('${char.id}','${anim}')" style="padding:0 5px;font-size:9px;line-height:16px;height:16px;flex-shrink:0;">Assign</button>
                </div>`;
            }
            html += `</div>`;
        }
    }
    el.innerHTML = html;
}

function openAssignModal(charId, anim) {
    const char = CHARACTER_REGISTRY.flatMap(g => g.chars).find(c => c.id === charId);
    const { body, footer, close } = API.showModal(char ? `${char.label} — ${anim}` : `${charId}:${anim}`);
    const key = `${charId}:${anim}`;
    const current = spriteAssignments[key];
    const candidates = spriteList.filter(s =>
        ACTIVE_SPRITES.includes(s.name) || s.category === 'marine' || s.category === 'alien' ||
        (s.dir || '').replace(/\\/g, '/').includes('assets/sprites')
    );
    body.innerHTML = `
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">Current: <b style="color:var(--text);">${current ? current.split('/').pop() : 'None'}</b></div>
        <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:3px;margin-bottom:8px;" id="assign-list">
            ${candidates.map(s => `<div class="sprite-item ${current===s.path?'active':''}" data-path="${s.path}"
                style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-bottom:1px solid var(--border);">
                <img src="${s.path}" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;">
                <span style="font-size:11px;">${s.name}</span></div>`).join('')}
        </div>
        <label style="font-size:11px;color:var(--text-muted);">Upload new PNG:
            <input type="file" id="assign-file" accept="image/png" style="font-size:11px;margin-left:4px;">
        </label>`;
    footer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="assign-cancel">Cancel</button>
        <button class="btn btn-danger btn-sm" id="assign-clear" ${current ? '' : 'disabled'}>Clear</button>
        <button class="btn btn-primary btn-sm" id="assign-ok" disabled>Assign</button>`;
    let picked = null;
    body.querySelectorAll('.sprite-item').forEach(item => {
        item.addEventListener('click', () => {
            body.querySelectorAll('.sprite-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            picked = item.dataset.path;
            document.getElementById('assign-ok').disabled = false;
        });
    });
    document.getElementById('assign-file').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const dataUrl = await readFileAsDataUrl(f);
        try {
            const stem = sanitizeAssetFilename(f.name.replace(/\.[^.]+$/, ''), 'sprite');
            const filename = `${stem}.png`;
            const dir = `assets/sprites/scaled/${charId}`;
            const res = await API.apiFetch('/api/sprites/save', { method: 'POST', body: JSON.stringify({ filename, dir, dataUrl }) });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            picked = data.path;
            document.getElementById('assign-ok').disabled = false;
            API.toast(`Uploaded ${filename}`, 'success');
            await loadSpriteList();
        } catch (err) { API.toast('Upload failed: ' + err.message, 'error'); }
    });
    document.getElementById('assign-cancel').addEventListener('click', close);
    document.getElementById('assign-clear').addEventListener('click', async () => {
        delete spriteAssignments[key];
        try {
            await saveAssignments();
            API.recordSave();
        } catch (err) {
            API.toast('Registry save failed: ' + err.message, 'error');
            return;
        }
        API.toast(`Cleared ${charId}:${anim}`, 'info'); renderCharacterRegistry(); close();
    });
    document.getElementById('assign-ok').addEventListener('click', async () => {
        if (!picked) return;
        spriteAssignments[key] = picked;
        try {
            await saveAssignments();
            API.recordSave();
        } catch (err) {
            API.toast('Registry save failed: ' + err.message, 'error');
            return;
        }
        API.toast(`Assigned to ${charId}:${anim}`, 'success'); renderCharacterRegistry(); close();
    });
}

export default {
    render(root) { buildUI(root); },
    async onShow() {
        await Promise.all([loadAssignments(), loadMarineRef(), loadSpriteList()]);
        if (currentView === 'chars') renderCharacterRegistry();
        if (currentView === 'svg') await svgEditor.onShow();
        drawCompare();
    },
    onHide() { piskelEditorState = null; svgEditor.onHide(); },
    async save() {
        if (currentView === 'svg') {
            await svgEditor.save();
        }
    },
};
