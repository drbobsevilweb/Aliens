/**
 * Tile Maps Tab — Browser-based Tiled-compatible map editor.
 * 5 layers: Floor, Wall, Objects, Sprites, Lighting.
 * Reads/writes Tiled JSON via /api/maps/*.
 */

const API = window.editorAPI;

// ── State ──────────────────────────────────────────────────────────────────
let mapList = [];
let currentMap = null;
let currentMapName = '';
let canvas = null;
let ctx = null;
let tilesetImg = null;

// View state
let viewX = 0, viewY = 0, zoom = 1;
let isDragging = false, dragStartX = 0, dragStartY = 0, viewStartX = 0, viewStartY = 0;

// Editing state
const LAYERS = ['terrain', 'doors', 'markers', 'props', 'lights'];
const LAYER_LABELS = { terrain: 'Floor', doors: 'Wall/Doors', markers: 'Objects', props: 'Sprites', lights: 'Lighting' };
const LAYER_COLORS = {
    terrain: 'rgba(47,63,76,0.6)',
    doors: 'rgba(163,80,78,0.7)',
    markers: 'rgba(79,219,142,0.7)',
    props: 'rgba(110,184,255,0.5)',
    lights: 'rgba(255,238,187,0.5)',
};

let activeLayer = 'terrain';
let activeTool = 'paint';   // paint, erase, select, pan
let activeBrush = 1;        // tile value for paint
let showGrid = true;
let layerVisibility = { terrain: true, doors: true, markers: true, props: true, lights: true };
let dirty = false;

// Selection state
let selectedTiles = [];      // [{x, y, layer}, ...]
let selectedObjects = [];    // [obj_id, ...]
let isRectSelecting = false;
let selectionStart = null;   // {x, y} in screen coords
let selectionEnd = null;     // {x, y} in screen coords

// Undo/redo
const MAX_UNDO = 50;
let undoStack = [];
let redoStack = [];
let currentStroke = null;

// Brush size
let brushSize = 1;

// Hover tile for brush preview
let hoverTile = null;

// Tile texture images
const tileImages = {};
let tileImagesLoaded = false;

// Tile palettes for each tile-layer
const TILE_VALUES = {
    terrain: [
        { value: 0, label: 'Empty', color: '#000000' },
        { value: 1, label: 'Floor', color: '#2f3f4c' },
        { value: 2, label: 'Wall',  color: '#8093a3' },
    ],
    doors: [
        { value: 0, label: 'None',       color: 'transparent' },
        { value: 1, label: 'Standard',   color: '#a3504e' },
        { value: 2, label: 'Electronic', color: '#45739f' },
        { value: 3, label: 'Locked',     color: '#af8f4a' },
        { value: 4, label: 'Welded',     color: '#8ca2b3' },
    ],
    markers: [
        { value: 0, label: 'None',          color: 'transparent' },
        { value: 1, label: 'Spawn',         color: '#4fdb8e' },
        { value: 2, label: 'Extract',       color: '#6eb8ff' },
        { value: 3, label: 'Terminal',       color: '#c47ae8' },
        { value: 4, label: 'Security Card', color: '#d5da62' },
        { value: 5, label: 'Alien Spawn',   color: '#ff4400' },
        { value: 6, label: 'Warning Strobe', color: '#ff6688' },
        { value: 7, label: 'Vent Point',    color: '#88ffdd' },
        { value: 8, label: 'Egg Cluster',   color: '#cc66ff' },
    ],
};

function buildUI(root) {
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <!-- Left: Map list + layer panel -->
            <aside class="sidebar" style="width:240px; display:flex; flex-direction:column; gap:4px;">
                <div class="panel" style="max-height:200px; display:flex; flex-direction:column;">
                    <div class="panel-header">
                        <span>Maps</span>
                        <button class="btn btn-sm btn-secondary" id="tm-refresh" title="Refresh">↻</button>
                    </div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:0;" id="tm-map-list"></div>
                </div>
                <div class="panel" style="flex:0 0 auto;">
                    <div class="panel-header">Layers</div>
                    <div class="panel-body" style="padding:4px;" id="tm-layers"></div>
                </div>
                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header">Tile Palette</div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:4px;" id="tm-palette"></div>
                </div>
                <div class="panel" style="flex:0 0 auto;">
                    <div class="panel-header">Properties</div>
                    <div class="panel-body" style="padding:6px;font-size:11px;" id="tm-props">
                        <div style="color:var(--text-muted);">Select a map to begin editing</div>
                    </div>
                </div>
            </aside>

            <!-- Main: toolbar + canvas -->
            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div class="toolbar" id="tm-toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-icon tm-tool active" data-tool="paint" title="Paint (P)">🖌</button>
                        <button class="btn btn-sm btn-icon tm-tool" data-tool="erase" title="Erase (E)">⌫</button>
                        <button class="btn btn-sm btn-icon tm-tool" data-tool="select" title="Select (S)">⬚</button>
                        <button class="btn btn-sm btn-icon tm-tool" data-tool="fill" title="Fill (F)">◉</button>
                        <button class="btn btn-sm btn-icon tm-tool" data-tool="pan" title="Pan (Space+drag)">✋</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-icon" id="tm-undo" title="Undo (Ctrl+Z)" disabled>↩</button>
                        <button class="btn btn-sm btn-icon" id="tm-redo" title="Redo (Ctrl+Shift+Z)" disabled>↪</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group" style="align-items:center;gap:4px;">
                        <span style="font-size:11px;">Brush:</span>
                        <select id="tm-brush-size" style="font-size:11px;padding:2px 4px;background:var(--bg-secondary);color:var(--text);border:1px solid var(--border);border-radius:3px;">
                            <option value="1">1×1</option>
                            <option value="2">2×2</option>
                            <option value="3">3×3</option>
                            <option value="5">5×5</option>
                        </select>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">
                            <input type="checkbox" id="tm-grid" checked> Grid
                        </label>
                    </div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="tm-zoom-in" title="Zoom in">+</button>
                        <span id="tm-zoom-label" style="font-size:11px;min-width:40px;text-align:center;">100%</span>
                        <button class="btn btn-sm btn-secondary" id="tm-zoom-out" title="Zoom out">−</button>
                        <button class="btn btn-sm btn-secondary" id="tm-zoom-fit" title="Fit map">Fit</button>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <span id="tm-cursor-info" style="font-size:11px;color:var(--text-muted);min-width:120px;"></span>
                    </div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="tm-new-map">New Map</button>
                        <button class="btn btn-sm btn-primary" id="tm-save" disabled>Save Map</button>
                        <button class="btn btn-sm btn-secondary" id="tm-rebuild">Rebuild Tiled</button>
                    </div>
                </div>
                <div class="canvas-wrap" id="tm-canvas-wrap" style="flex:1;overflow:hidden;position:relative;">
                    <canvas id="tm-canvas"></canvas>
                </div>
            </div>
        </div>
    `;

    canvas = document.getElementById('tm-canvas');
    ctx = canvas.getContext('2d');

    // Tool buttons
    document.querySelectorAll('.tm-tool').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    document.getElementById('tm-grid').addEventListener('change', (e) => { showGrid = e.target.checked; draw(); });
    document.getElementById('tm-zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
    document.getElementById('tm-zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
    document.getElementById('tm-zoom-fit').addEventListener('click', fitMap);
    document.getElementById('tm-save').addEventListener('click', saveMap);
    document.getElementById('tm-rebuild').addEventListener('click', rebuildTiled);
    document.getElementById('tm-refresh').addEventListener('click', loadMapList);
    document.getElementById('tm-undo').addEventListener('click', undo);
    document.getElementById('tm-redo').addEventListener('click', redo);
    document.getElementById('tm-brush-size').addEventListener('change', (e) => { brushSize = parseInt(e.target.value); draw(); });
    document.getElementById('tm-new-map').addEventListener('click', showNewMapDialog);

    // Canvas interaction
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.addEventListener('mouseleave', onCanvasMouseUp);
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Keyboard shortcuts
    document.addEventListener('keydown', onKeyDown);

    // Resize
    const wrap = document.getElementById('tm-canvas-wrap');
    const ro = new ResizeObserver(() => {
        canvas.width = wrap.clientWidth;
        canvas.height = wrap.clientHeight;
        draw();
    });
    ro.observe(wrap);
    loadTileTextures();
}

function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tm-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    canvas.style.cursor = tool === 'pan' ? 'grab' : (tool === 'paint' || tool === 'erase' || tool === 'fill') ? 'crosshair' : 'default';
}

function setZoom(z) {
    zoom = Math.max(0.1, Math.min(8, z));
    document.getElementById('tm-zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    draw();
}

function fitMap() {
    if (!currentMap) return;
    const wrap = document.getElementById('tm-canvas-wrap');
    const mapPxW = currentMap.width * currentMap.tilewidth;
    const mapPxH = currentMap.height * currentMap.tileheight;
    zoom = Math.min(wrap.clientWidth / mapPxW, wrap.clientHeight / mapPxH) * 0.9;
    viewX = (wrap.clientWidth - mapPxW * zoom) / 2;
    viewY = (wrap.clientHeight - mapPxH * zoom) / 2;
    setZoom(zoom);
}

// ── Layer panel ────────────────────────────────────────────────────────────
function renderLayers() {
    const el = document.getElementById('tm-layers');
    el.innerHTML = LAYERS.map(lay => `
        <div class="tm-layer-row ${activeLayer === lay ? 'active' : ''}" data-layer="${lay}"
             style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:4px;
                    border-left:3px solid ${LAYER_COLORS[lay]};margin-bottom:2px;
                    ${activeLayer === lay ? 'background:rgba(74,164,216,0.15);' : ''}">
            <input type="checkbox" ${layerVisibility[lay] ? 'checked' : ''} data-vis="${lay}" title="Toggle visibility"
                   style="cursor:pointer;">
            <span style="flex:1;font-size:12px;">${LAYER_LABELS[lay]}</span>
        </div>
    `).join('');

    el.querySelectorAll('.tm-layer-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            activeLayer = row.dataset.layer;
            renderLayers();
            renderPalette();
            draw();
        });
    });
    el.querySelectorAll('[data-vis]').forEach(cb => {
        cb.addEventListener('change', () => {
            layerVisibility[cb.dataset.vis] = cb.checked;
            draw();
        });
    });
}

// ── Palette panel ──────────────────────────────────────────────────────────
function renderPalette() {
    const el = document.getElementById('tm-palette');
    const layer = currentMap?.layers.find(l => l.name === activeLayer);
    const isObjectLayer = layer ? layer.type === 'objectgroup' : (activeLayer !== 'terrain');
    const hasTileValues = TILE_VALUES[activeLayer] && TILE_VALUES[activeLayer].length > 0;

    if (isObjectLayer && hasTileValues) {
        // Object layer with known types (doors, markers) — show type palette
        const tiles = TILE_VALUES[activeLayer];
        if (activeBrush === 0) activeBrush = tiles.find(t => t.value > 0)?.value || 1;
        el.innerHTML = `
            <div style="padding:4px;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
                Select type, then click canvas to place.<br>Right-click objects to edit/delete.
            </div>
        ` + tiles.filter(t => t.value > 0).map(t => `
            <div class="tm-palette-item ${activeBrush === t.value ? 'active' : ''}" data-value="${t.value}"
                 style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:3px;margin-bottom:2px;
                        ${activeBrush === t.value ? 'background:rgba(74,164,216,0.2);outline:1px solid var(--accent);' : ''}">
                <div style="width:18px;height:18px;border-radius:2px;border:1px solid #555;background:${t.color};"></div>
                <span style="font-size:11px;">${t.label}</span>
            </div>
        `).join('');
        el.querySelectorAll('.tm-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                activeBrush = parseInt(item.dataset.value);
                renderPalette();
            });
        });
        return;
    }

    if (isObjectLayer) {
        el.innerHTML = `
            <div style="padding:4px;font-size:11px;color:var(--text-muted);">
                Object layers use click-to-place. Right-click to edit/delete objects.
            </div>
            <button class="btn btn-sm btn-primary" id="tm-add-object" style="margin:4px;">+ Add Object</button>
        `;
        document.getElementById('tm-add-object')?.addEventListener('click', addObjectAtCenter);
        return;
    }

    const tiles = TILE_VALUES[activeLayer] || [];
    el.innerHTML = tiles.map(t => `
        <div class="tm-palette-item ${activeBrush === t.value ? 'active' : ''}" data-value="${t.value}"
             style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:3px;margin-bottom:2px;
                    ${activeBrush === t.value ? 'background:rgba(74,164,216,0.2);outline:1px solid var(--accent);' : ''}">
            <div style="width:18px;height:18px;border-radius:2px;border:1px solid #555;
                        background:${t.color === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50%/8px 8px' : t.color};">
            </div>
            <span style="font-size:11px;">${t.label}</span>
        </div>
    `).join('');

    el.querySelectorAll('.tm-palette-item').forEach(item => {
        item.addEventListener('click', () => {
            activeBrush = parseInt(item.dataset.value);
            renderPalette();
        });
    });
}

// ── Map list ───────────────────────────────────────────────────────────────
async function loadMapList() {
    try {
        const resp = await API.apiFetch('/api/maps');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        mapList = data.maps;
        renderMapList();
    } catch (err) {
        API.toast('Failed to load maps: ' + err.message, 'error');
    }
}

function renderMapList() {
    const el = document.getElementById('tm-map-list');
    el.innerHTML = mapList.map(m => `
        <div class="tm-map-item ${currentMapName === m.name ? 'active' : ''}" data-name="${m.name}"
             style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;
                    ${currentMapName === m.name ? 'background:rgba(74,164,216,0.15);color:var(--accent);' : ''}">
            ${m.name}
        </div>
    `).join('');
    el.querySelectorAll('.tm-map-item').forEach(item => {
        item.addEventListener('click', () => loadMap(item.dataset.name));
    });
}

async function loadMap(name) {
    try {
        const resp = await API.apiFetch(`/api/maps/${encodeURIComponent(name)}`);
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        currentMap = data.map;
        currentMapName = name;
        dirty = false;
        undoStack = [];
        redoStack = [];
        updateUndoButtons();

        // Ensure all 5 layers exist
        for (const layerName of LAYERS) {
            if (!currentMap.layers.find(l => l.name === layerName)) {
                if (layerName === 'terrain') {
                    // terrain is always a tilelayer
                    currentMap.layers.push({
                        id: currentMap.layers.length + 1,
                        name: layerName,
                        type: 'tilelayer',
                        data: new Array(currentMap.width * currentMap.height).fill(0),
                        width: currentMap.width,
                        height: currentMap.height,
                        visible: true,
                        opacity: 1, x: 0, y: 0,
                    });
                } else {
                    // doors, markers, props, lights are objectgroups in Tiled format
                    currentMap.layers.push({
                        id: currentMap.layers.length + 1,
                        name: layerName,
                        type: 'objectgroup',
                        objects: [],
                        visible: true,
                        opacity: 1, x: 0, y: 0,
                    });
                }
            }
        }

        document.getElementById('tm-save').disabled = false;
        renderMapList();
        renderLayers();
        renderPalette();
        updateProps();
        fitMap();
        API.setStatus(`Loaded map: ${name}`);
    } catch (err) {
        API.toast('Failed to load map: ' + err.message, 'error');
    }
}

function updateProps() {
    const el = document.getElementById('tm-props');
    if (!currentMap) {
        el.innerHTML = '<div style="color:var(--text-muted);">No map loaded</div>';
        return;
    }
    el.innerHTML = `
        <div><b>Map:</b> ${currentMapName}</div>
        <div><b>Size:</b> ${currentMap.width}×${currentMap.height} tiles</div>
        <div><b>Tile:</b> ${currentMap.tilewidth}×${currentMap.tileheight}px</div>
        <div><b>Layers:</b> ${currentMap.layers.length}</div>
        <div><b>Tiled v:</b> ${currentMap.tiledversion || '—'}</div>
    `;
}

// ── Drawing ────────────────────────────────────────────────────────────────
function draw() {
    if (!canvas || !ctx) return;
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    if (!currentMap) {
        ctx.fillStyle = '#555';
        ctx.font = '14px "Share Tech Mono",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Select a map from the list to begin editing', cw / 2, ch / 2);
        ctx.textAlign = 'left';
        return;
    }

    const tw = currentMap.tilewidth;
    const th = currentMap.tileheight;
    const mw = currentMap.width;
    const mh = currentMap.height;

    ctx.save();
    ctx.translate(viewX, viewY);
    ctx.scale(zoom, zoom);

    // Draw all visible layers based on their type
    for (const layerName of LAYERS) {
        if (!layerVisibility[layerName]) continue;
        const layer = currentMap.layers.find(l => l.name === layerName);
        if (!layer) continue;

        if (layer.type === 'tilelayer') {
            const palette = TILE_VALUES[layerName] || [];
            for (let y = 0; y < mh; y++) {
                for (let x = 0; x < mw; x++) {
                    const idx = y * mw + x;
                    const val = layer.data[idx];
                    if (val === 0 && layerName !== 'terrain') continue;

                    const tileDef = palette.find(t => t.value === val);
                    if (tileDef && tileDef.color !== 'transparent') {
                        const tileKey = layerName === 'terrain' ? (val === 1 ? 'floor' : val === 2 ? 'wall' : null) : null;
                        if (tileKey && tileImages[tileKey]) {
                            ctx.drawImage(tileImages[tileKey], x * tw, y * th, tw, th);
                        } else {
                            ctx.fillStyle = tileDef.color;
                            ctx.fillRect(x * tw, y * th, tw, th);
                        }
                    }

                    // For non-terrain layers, draw value label
                    if (layerName !== 'terrain' && val > 0 && zoom > 0.3) {
                        ctx.fillStyle = '#fff';
                        ctx.font = `${Math.max(8, Math.min(12, tw * 0.3))}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.fillText(tileDef?.label || String(val), x * tw + tw / 2, y * th + th / 2 + 4);
                        ctx.textAlign = 'left';
                    }
                }
            }
        } else if (layer.type === 'objectgroup') {
            const defaultColors = { doors: '#a3504e', markers: '#4fdb8e', props: '#6eb8ff', lights: '#ffeebb' };
            const baseColor = defaultColors[layerName] || '#6eb8ff';

            for (const obj of layer.objects || []) {
                const ox = obj.x, oy = obj.y;
                const ow = obj.width || tw;
                const oh = obj.height || th;

                // Use type-specific color from object properties if available
                let color = baseColor;
                if (obj.properties && TILE_VALUES[layerName]) {
                    const valueProp = obj.properties.find(p => p.name === 'doorValue' || p.name === 'markerValue');
                    if (valueProp) {
                        const tileDef = TILE_VALUES[layerName].find(t => t.value === valueProp.value);
                        if (tileDef && tileDef.color && tileDef.color !== 'transparent') {
                            color = tileDef.color;
                        }
                    }
                }

                ctx.strokeStyle = color;
                ctx.lineWidth = 2 / zoom;
                ctx.strokeRect(ox, oy, ow, oh);
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = color;
                ctx.fillRect(ox, oy, ow, oh);
                ctx.globalAlpha = 1;

                if (zoom > 0.25) {
                    ctx.fillStyle = color;
                    ctx.font = `${Math.max(8, Math.min(11, tw * 0.25))}px monospace`;
                    ctx.fillText(obj.name || obj.type || layerName, ox + 2, oy + 12);
                }
            }
        }
    }

    // Grid
    if (showGrid && zoom > 0.15) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 / zoom;
        for (let x = 0; x <= mw; x++) {
            ctx.beginPath(); ctx.moveTo(x * tw, 0); ctx.lineTo(x * tw, mh * th); ctx.stroke();
        }
        for (let y = 0; y <= mh; y++) {
            ctx.beginPath(); ctx.moveTo(0, y * th); ctx.lineTo(mw * tw, y * th); ctx.stroke();
        }
    }

    // Map border
    ctx.strokeStyle = 'rgba(74,164,216,0.4)';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, mw * tw, mh * th);

    // Brush size preview on hover
    if (hoverTile && currentMap && (activeTool === 'paint' || activeTool === 'erase' || activeTool === 'fill')) {
        const previewSize = activeTool === 'fill' ? 1 : brushSize;
        const previewHalf = activeTool === 'fill' ? 0 : Math.floor((brushSize - 1) / 2);
        ctx.strokeStyle = activeTool === 'erase' ? 'rgba(255,80,80,0.7)' : 'rgba(74,164,216,0.7)';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeRect(
            (hoverTile.tx - previewHalf) * tw,
            (hoverTile.ty - previewHalf) * th,
            previewSize * tw,
            previewSize * th
        );
        ctx.setLineDash([]);
    }

    // Render selected tiles (cyan highlight)
    if (selectedTiles.length > 0) {
        ctx.fillStyle = 'rgba(79, 219, 142, 0.25)';
        ctx.strokeStyle = 'rgba(79, 219, 142, 0.8)';
        ctx.lineWidth = 1 / zoom;
        for (const sel of selectedTiles) {
            ctx.fillRect(sel.x * tw, sel.y * th, tw, th);
            ctx.strokeRect(sel.x * tw, sel.y * th, tw, th);
        }
    }

    // Render selected objects (blue outline)
    if (selectedObjects.length > 0) {
        const layer = currentMap.layers.find(l => l.name === activeLayer);
        if (layer && layer.type === 'objectgroup') {
            ctx.strokeStyle = 'rgba(74, 164, 216, 0.8)';
            ctx.lineWidth = 2 / zoom;
            for (const objId of selectedObjects) {
                const obj = layer.objects.find(o => o.id === objId);
                if (obj) {
                    ctx.strokeRect(obj.x, obj.y, obj.width || tw, obj.height || th);
                }
            }
        }
    }

    ctx.restore();

    // Draw rect selection box (in screen coords, not world)
    if (isRectSelecting && selectionStart && selectionEnd) {
        const minX = Math.min(selectionStart.x, selectionEnd.x);
        const maxX = Math.max(selectionStart.x, selectionEnd.x);
        const minY = Math.min(selectionStart.y, selectionEnd.y);
        const maxY = Math.max(selectionStart.y, selectionEnd.y);

        ctx.fillStyle = 'rgba(74, 164, 216, 0.1)';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeStyle = 'rgba(74, 164, 216, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
    }
}

// ── Input handlers ─────────────────────────────────────────────────────────
function screenToTile(sx, sy) {
    if (!currentMap) return null;
    const mx = (sx - viewX) / zoom;
    const my = (sy - viewY) / zoom;
    const tx = Math.floor(mx / currentMap.tilewidth);
    const ty = Math.floor(my / currentMap.tileheight);
    if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return null;
    return { tx, ty, mx, my };
}

function finishRectSelection() {
    if (!currentMap) return;
    selectedTiles = [];
    selectedObjects = [];

    // Get selection bounds in tile coordinates
    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    const startTile = screenToTile(minX, minY);
    const endTile = screenToTile(maxX, maxY);

    if (!startTile || !endTile) return;

    const minTx = Math.min(startTile.tx, endTile.tx);
    const maxTx = Math.max(startTile.tx, endTile.tx);
    const minTy = Math.min(startTile.ty, endTile.ty);
    const maxTy = Math.max(startTile.ty, endTile.ty);

    // Collect tiles in selection bounds
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer) return;

    if (layer.type === 'tilelayer') {
        // Collect terrain tiles
        for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
                selectedTiles.push({ x: tx, y: ty, layer: activeLayer });
            }
        }
        API.toast(`Selected ${selectedTiles.length} tiles`, 'info');
    } else if (layer.type === 'objectgroup') {
        // Collect objects in selection bounds
        const tw = currentMap.tilewidth, th = currentMap.tileheight;
        const selMinPx = minTx * tw, selMaxPx = (maxTx + 1) * tw;
        const selMinPy = minTy * th, selMaxPy = (maxTy + 1) * th;

        for (const obj of layer.objects) {
            const oMaxX = obj.x + (obj.width || tw);
            const oMaxY = obj.y + (obj.height || th);
            if (obj.x < selMaxPx && oMaxX > selMinPx && obj.y < selMaxPy && oMaxY > selMinPy) {
                selectedObjects.push(obj.id);
            }
        }
        API.toast(`Selected ${selectedObjects.length} objects`, 'info');
    }
}

function paintTile(tx, ty) {
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer) return;

    if (layer.type === 'objectgroup') {
        if (activeTool === 'erase') {
            const tw2 = currentMap.tilewidth, th2 = currentMap.tileheight;
            const tileL = tx * tw2, tileT = ty * th2;
            const tileR = tileL + tw2, tileB = tileT + th2;
            const idx = layer.objects.findIndex(o => {
                const oR = o.x + (o.width || tw2), oB = o.y + (o.height || th2);
                return tileL < oR && tileR > o.x && tileT < oB && tileB > o.y;
            });
            if (idx >= 0) {
                const removed = layer.objects.splice(idx, 1)[0];
                pushUndo({ type: 'objectRemove', layerName: activeLayer, object: JSON.parse(JSON.stringify(removed)), objectIndex: idx });
                dirty = true; API.setDirty(true); draw();
            }
        } else if (activeTool === 'paint') {
            placeObjectAtTile(tx, ty, layer);
        }
        return;
    }

    if (layer.type !== 'tilelayer') return;

    const val = activeTool === 'erase' ? 0 : activeBrush;
    const half = Math.floor((brushSize - 1) / 2);
    const tiles = [];
    for (let dy = -half; dy < -half + brushSize; dy++) {
        for (let dx = -half; dx < -half + brushSize; dx++) {
            const bx = tx + dx, by = ty + dy;
            if (bx < 0 || bx >= currentMap.width || by < 0 || by >= currentMap.height) continue;
            const idx = by * currentMap.width + bx;
            if (layer.data[idx] !== val) {
                tiles.push({ idx, oldVal: layer.data[idx], newVal: val });
                layer.data[idx] = val;
            }
        }
    }
    if (tiles.length > 0) {
        if (currentStroke) {
            currentStroke.changes.push(...tiles);
        } else {
            pushUndo({ type: 'tiles', layerName: activeLayer, changes: tiles });
        }
        dirty = true;
        API.setDirty(true);
        draw();
    }
}

function placeObjectAtTile(tx, ty, layer) {
    const tw = currentMap.tilewidth, th = currentMap.tileheight;
    const x = tx * tw, y = ty * th;

    // Don't place if overlapping an existing object
    const existing = layer.objects.find(o => {
        const oR = o.x + (o.width || tw), oB = o.y + (o.height || th);
        return x < oR && (x + tw) > o.x && y < oB && (y + th) > o.y;
    });
    if (existing) return;

    let obj;
    if (activeLayer === 'doors') {
        const doorTypes = { 1: 'standard', 2: 'electronic', 3: 'locked', 4: 'welded' };
        const dtype = doorTypes[activeBrush] || 'standard';
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: `door_${layer.objects.length + 1}`,
            type: 'door',
            x, y,
            width: tw * 2, height: th,
            rotation: 0, visible: true,
            properties: [
                { name: 'doorType', type: 'string', value: dtype },
                { name: 'initialState', type: 'string', value: 'closed' },
                { name: 'orientation', type: 'string', value: 'horizontal' },
                { name: 'doorValue', type: 'int', value: activeBrush },
            ],
        };
    } else if (activeLayer === 'markers') {
        const markerTypes = { 1:'spawn', 2:'extract', 3:'terminal', 4:'security_card',
            5:'alien_spawn', 6:'warning_strobe', 7:'vent_point', 8:'egg_cluster' };
        const mtype = markerTypes[activeBrush] || 'spawn';
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: mtype, type: mtype,
            x, y, width: tw, height: th,
            rotation: 0, visible: true,
            properties: [{ name: 'markerValue', type: 'int', value: activeBrush }],
        };
    } else {
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: activeLayer === 'lights' ? 'Light' : 'Prop',
            type: activeLayer === 'lights' ? 'spot' : 'prop',
            x, y, width: tw, height: th,
            properties: [],
        };
    }

    layer.objects.push(obj);
    pushUndo({ type: 'objectAdd', layerName: activeLayer, object: JSON.parse(JSON.stringify(obj)) });
    dirty = true; API.setDirty(true); draw();
}

let isPainting = false;
function onCanvasMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    // Rect selection with Shift+drag
    if (e.shiftKey && e.button === 0 && !isDragging) {
        isRectSelecting = true;
        selectionStart = { x: sx, y: sy };
        selectionEnd = { x: sx, y: sy };
        canvas.style.cursor = 'crosshair';
        return;
    }

    if (activeTool === 'pan' || e.button === 1) {
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        viewStartX = viewX; viewStartY = viewY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (!currentMap) return;
    const tile = screenToTile(sx, sy);
    if (!tile) return;

    if (e.button === 2) {
        // Right-click: object context menu for object layers
        const rlayer = currentMap.layers.find(l => l.name === activeLayer);
        if (rlayer && rlayer.type === 'objectgroup') {
            showObjectContextMenu(e, tile);
        }
        return;
    }

    if (activeTool === 'fill') {
        floodFill(tile.tx, tile.ty);
        return;
    }

    if (activeTool === 'paint' || activeTool === 'erase') {
        isPainting = true;
        currentStroke = { type: 'tiles', layerName: activeLayer, changes: [] };
        paintTile(tile.tx, tile.ty);
    }
}

function onCanvasMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    // Track rect selection
    if (isRectSelecting && selectionStart) {
        selectionEnd = { x: sx, y: sy };
        draw();
        return;
    }

    if (isDragging) {
        viewX = viewStartX + (e.clientX - dragStartX);
        viewY = viewStartY + (e.clientY - dragStartY);
        draw();
        return;
    }

    if (!currentMap) return;
    const tile = screenToTile(sx, sy);
    const infoEl = document.getElementById('tm-cursor-info');
    const prevHover = hoverTile;
    hoverTile = tile;
    if (tile) {
        infoEl.textContent = `Tile: ${tile.tx},${tile.ty} | Px: ${Math.round(tile.mx)},${Math.round(tile.my)}`;
        if (isPainting && (activeTool === 'paint' || activeTool === 'erase')) {
            paintTile(tile.tx, tile.ty);
        }
    } else {
        infoEl.textContent = '';
    }
    if (hoverTile?.tx !== prevHover?.tx || hoverTile?.ty !== prevHover?.ty) draw();
}

function onCanvasMouseUp() {
    // Finish rect selection
    if (isRectSelecting && selectionStart && selectionEnd) {
        finishRectSelection();
        isRectSelecting = false;
        selectionStart = null;
        selectionEnd = null;
        canvas.style.cursor = 'default';
        draw();
        return;
    }

    isDragging = false;
    if (isPainting && currentStroke && currentStroke.changes.length > 0) {
        pushUndo(currentStroke);
    }
    currentStroke = null;
    isPainting = false;
    if (activeTool === 'pan') canvas.style.cursor = 'grab';
}

function onCanvasWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const oldZoom = zoom;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.1, Math.min(8, zoom * factor));

    // Zoom toward mouse pointer
    viewX = mx - (mx - viewX) * (newZoom / oldZoom);
    viewY = my - (my - viewY) * (newZoom / oldZoom);
    setZoom(newZoom);
}

function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    // Undo/redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
    }
    switch (e.key.toLowerCase()) {
        case 'p': setTool('paint'); break;
        case 'e': setTool('erase'); break;
        case 'f': setTool('fill'); break;
        case 's': if (!e.ctrlKey && !e.metaKey) setTool('select'); break;
        case 'g': showGrid = !showGrid; document.getElementById('tm-grid').checked = showGrid; draw(); break;
    }
}

// ── Object layers ──────────────────────────────────────────────────────────
function addObjectAtCenter() {
    if (!currentMap) return;
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup') return;

    const cx = (canvas.width / 2 - viewX) / zoom;
    const cy = (canvas.height / 2 - viewY) / zoom;
    const obj = {
        id: Date.now(),
        name: activeLayer === 'lights' ? 'Light' : 'Prop',
        type: activeLayer === 'lights' ? 'spot' : 'prop',
        x: Math.round(cx),
        y: Math.round(cy),
        width: currentMap.tilewidth,
        height: currentMap.tileheight,
        properties: [],
    };
    layer.objects.push(obj);
    pushUndo({ type: 'objectAdd', layerName: activeLayer, object: JSON.parse(JSON.stringify(obj)) });
    dirty = true;
    API.setDirty(true);
    draw();
    API.toast(`Added ${obj.name} at (${obj.x}, ${obj.y})`, 'info');
}

function showObjectContextMenu(e, tile) {
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup') return;

    // Find object at position
    const obj = layer.objects.find(o =>
        tile.mx >= o.x && tile.mx <= o.x + (o.width || 64) &&
        tile.my >= o.y && tile.my <= o.y + (o.height || 64)
    );
    if (!obj) return;

    const { body, footer, close } = API.showModal(`Edit Object: ${obj.name}`);
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label style="font-size:12px;">Name: <input type="text" class="input" id="obj-name" value="${obj.name || ''}" style="width:100%;"></label>
            <label style="font-size:12px;">Type: <input type="text" class="input" id="obj-type" value="${obj.type || ''}" style="width:100%;"></label>
            <label style="font-size:12px;">X: <input type="number" class="input" id="obj-x" value="${obj.x}" style="width:100%;"></label>
            <label style="font-size:12px;">Y: <input type="number" class="input" id="obj-y" value="${obj.y}" style="width:100%;"></label>
            <label style="font-size:12px;">Width: <input type="number" class="input" id="obj-w" value="${obj.width || 64}" style="width:100%;"></label>
            <label style="font-size:12px;">Height: <input type="number" class="input" id="obj-h" value="${obj.height || 64}" style="width:100%;"></label>
        </div>
    `;
    footer.innerHTML = `
        <button class="btn btn-danger btn-sm" id="obj-delete">Delete</button>
        <button class="btn btn-secondary btn-sm" id="obj-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="obj-save">Apply</button>
    `;
    document.getElementById('obj-cancel').onclick = close;
    document.getElementById('obj-delete').onclick = () => {
        const idx = layer.objects.indexOf(obj);
        if (idx >= 0) {
            layer.objects.splice(idx, 1);
            pushUndo({ type: 'objectRemove', layerName: activeLayer, object: JSON.parse(JSON.stringify(obj)), objectIndex: idx });
        }
        dirty = true; API.setDirty(true); draw(); close();
    };
    document.getElementById('obj-save').onclick = () => {
        obj.name = document.getElementById('obj-name').value;
        obj.type = document.getElementById('obj-type').value;
        obj.x = parseInt(document.getElementById('obj-x').value) || 0;
        obj.y = parseInt(document.getElementById('obj-y').value) || 0;
        obj.width = parseInt(document.getElementById('obj-w').value) || 64;
        obj.height = parseInt(document.getElementById('obj-h').value) || 64;
        dirty = true; API.setDirty(true); draw(); close();
    };
}

// ── Save / Rebuild ─────────────────────────────────────────────────────────
async function saveMap() {
    if (!currentMap || !currentMapName) return;
    try {
        const resp = await API.apiFetch(`/api/maps/${encodeURIComponent(currentMapName)}`, {
            method: 'POST',
            body: JSON.stringify(currentMap),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        dirty = false;
        API.recordSave();
        API.toast(`Map saved: ${currentMapName}`, 'success');
    } catch (err) {
        API.toast('Save failed: ' + err.message, 'error');
    }
}

async function rebuildTiled() {
    try {
        API.setStatus('Rebuilding Tiled maps…', 0);
        const resp = await API.apiFetch('/api/tiled-build', { method: 'POST' });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error || 'Build failed');
        API.toast('Tiled maps rebuilt successfully', 'success');
        API.setStatus('Tiled rebuild complete');
    } catch (err) {
        API.toast('Rebuild failed: ' + err.message, 'error');
        API.setStatus('Rebuild error');
    }
}

// ── Undo/Redo ──────────────────────────────────────────────────────────────
function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack.pop();
    applyUndoEntry(entry, true);
    redoStack.push(entry);
    updateUndoButtons();
    dirty = true; API.setDirty(true); draw();
}

function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop();
    applyUndoEntry(entry, false);
    undoStack.push(entry);
    updateUndoButtons();
    dirty = true; API.setDirty(true); draw();
}

function applyUndoEntry(entry, isUndo) {
    const layer = currentMap?.layers.find(l => l.name === entry.layerName);
    if (!layer) return;
    if (entry.type === 'tiles') {
        for (const ch of entry.changes) {
            layer.data[ch.idx] = isUndo ? ch.oldVal : ch.newVal;
        }
    } else if (entry.type === 'objectAdd') {
        if (isUndo) {
            const idx = layer.objects.findIndex(o => o.id === entry.object.id);
            if (idx >= 0) layer.objects.splice(idx, 1);
        } else {
            layer.objects.push(JSON.parse(JSON.stringify(entry.object)));
        }
    } else if (entry.type === 'objectRemove') {
        if (isUndo) {
            layer.objects.splice(entry.objectIndex, 0, JSON.parse(JSON.stringify(entry.object)));
        } else {
            const idx = layer.objects.findIndex(o => o.id === entry.object.id);
            if (idx >= 0) layer.objects.splice(idx, 1);
        }
    }
}

function updateUndoButtons() {
    const undoBtn = document.getElementById('tm-undo');
    const redoBtn = document.getElementById('tm-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ── Flood Fill ─────────────────────────────────────────────────────────────
function floodFill(tx, ty) {
    if (!currentMap) return;
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer || layer.type !== 'tilelayer') {
        API.toast('Fill only works on tile layers', 'warning');
        return;
    }
    const mw = currentMap.width, mh = currentMap.height;
    const targetVal = layer.data[ty * mw + tx];
    const fillVal = activeBrush;
    if (targetVal === fillVal) return;

    const visited = new Uint8Array(mw * mh);
    const stack = [{ x: tx, y: ty }];
    const changes = [];

    while (stack.length > 0) {
        const { x, y } = stack.pop();
        if (x < 0 || x >= mw || y < 0 || y >= mh) continue;
        const idx = y * mw + x;
        if (visited[idx]) continue;
        if (layer.data[idx] !== targetVal) continue;
        visited[idx] = 1;
        changes.push({ idx, oldVal: targetVal, newVal: fillVal });
        layer.data[idx] = fillVal;
        stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }

    if (changes.length > 0) {
        pushUndo({ type: 'tiles', layerName: activeLayer, changes });
        dirty = true; API.setDirty(true); draw();
    }
}

// ── Tile Textures ──────────────────────────────────────────────────────────
function loadTileTextures() {
    const texturePaths = {
        floor: '/src/graphics/imported/floor_grill_bluesteel_64_sharp.png',
        wall: '/src/graphics/imported/wall_corridor_bluesteel_64_sharp.png',
    };
    let loaded = 0;
    const total = Object.keys(texturePaths).length;
    for (const [key, path] of Object.entries(texturePaths)) {
        const img = new Image();
        img.onload = () => {
            tileImages[key] = img;
            loaded++;
            if (loaded >= total) { tileImagesLoaded = true; draw(); }
        };
        img.onerror = () => {
            console.warn(`Failed to load tile texture: ${path}`);
            loaded++;
            if (loaded >= total) { tileImagesLoaded = true; draw(); }
        };
        img.src = path;
    }
}

// ── New Map ────────────────────────────────────────────────────────────────
function showNewMapDialog() {
    const { body, footer, close } = API.showModal('New Map');
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">
            <label style="font-size:12px;">Name:</label>
            <input type="text" class="input" id="nm-name" placeholder="my_map" style="width:100%;">
            <label style="font-size:12px;">Width (tiles):</label>
            <input type="number" class="input" id="nm-width" value="104" min="10" max="500" style="width:100%;">
            <label style="font-size:12px;">Height (tiles):</label>
            <input type="number" class="input" id="nm-height" value="70" min="10" max="500" style="width:100%;">
        </div>
    `;
    footer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="nm-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="nm-create">Create</button>
    `;
    document.getElementById('nm-cancel').onclick = close;
    document.getElementById('nm-create').onclick = async () => {
        const name = document.getElementById('nm-name').value.trim();
        const w = parseInt(document.getElementById('nm-width').value) || 104;
        const h = parseInt(document.getElementById('nm-height').value) || 70;
        if (!name) { API.toast('Map name is required', 'warning'); return; }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) { API.toast('Name must be alphanumeric (a-z, 0-9, _, -)', 'warning'); return; }

        const newMap = {
            compressionlevel: -1,
            height: h,
            width: w,
            infinite: false,
            orientation: 'orthogonal',
            renderorder: 'right-down',
            tilewidth: 64,
            tileheight: 64,
            tiledversion: '1.10.2',
            type: 'map',
            version: '1.10',
            nextlayerid: 6,
            nextobjectid: 1,
            layers: [
                { id: 1, name: 'terrain', type: 'tilelayer', data: new Array(w * h).fill(2), width: w, height: h, visible: true, opacity: 1, x: 0, y: 0 },
                { id: 2, name: 'doors', type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 3, name: 'markers', type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 4, name: 'props', type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 5, name: 'lights', type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
            ],
            tilesets: [],
        };

        try {
            const resp = await API.apiFetch(`/api/maps/${encodeURIComponent(name)}`, {
                method: 'POST',
                body: JSON.stringify(newMap),
            });
            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);
            close();
            API.toast(`Map created: ${name}`, 'success');
            await loadMapList();
            await loadMap(name);
        } catch (err) {
            API.toast('Create failed: ' + err.message, 'error');
        }
    };
}

// ── Exports ────────────────────────────────────────────────────────────────
export default {
    render(root) { buildUI(root); },
    async onShow() {
        await loadMapList();
        renderLayers();
        renderPalette();
        draw();
    },
    onHide() {},
    async save() { if (dirty && currentMap) await saveMap(); },
};
