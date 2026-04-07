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
const LAYERS = ['terrain', 'doors', 'markers', 'props', 'lights', 'story'];
const LAYER_LABELS = { terrain: 'Floor', doors: 'Wall/Doors', markers: 'Objects', props: 'Sprites', lights: 'Lighting', story: 'Story Markers' };
const LAYER_COLORS = {
    terrain: 'rgba(47,63,76,0.6)',
    doors: 'rgba(163,80,78,0.7)',
    markers: 'rgba(79,219,142,0.7)',
    props: 'rgba(110,184,255,0.5)',
    lights: 'rgba(255,238,187,0.5)',
    story: 'rgba(180,100,255,0.7)',
};

let activeLayer = 'terrain';
let activeTool = 'paint';   // paint, erase, select, pan
let activeBrush = 1;        // tile value for paint
let showGrid = true;
let showCollision = false;
let layerVisibility = { terrain: true, doors: true, markers: true, props: true, lights: true, story: true };
let layerLocked = { terrain: false, doors: false, markers: false, props: false, lights: false, story: false };
let dirty = false;
let spaceHeld = false;

// Selection state
let selectedTiles = [];      // [{x, y, layer}, ...]
let selectedObjects = [];    // [obj_id, ...]
let isRectSelecting = false;
let selectionStart = null;   // {x, y} in screen coords
let selectionEnd = null;     // {x, y} in screen coords
let objectDragState = null;  // drag move state for selected objects

// Undo/redo
const MAX_UNDO = 50;
let undoStack = [];
let redoStack = [];
let currentStroke = null;

// Brush size
let brushSize = 1;

// Hover tile for brush preview
let hoverTile = null;
let activeObjectPresetByLayer = { props: 'lamp', lights: 'point' };
let activeObjectRotationByLayer = { doors: 0, props: 0, lights: 0 };
let spriteAssetList = [];
let spriteAssetLoadPromise = null;
let assetSearchByLayer = { props: '', lights: '' };

// Clipboard for copy/paste
let clipboard = null; // { type: 'tiles'|'objects', data: [...] }

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
    story: [
        { value: 0, label: 'None',          color: 'transparent' },
        { value: 1, label: 'Story Trigger', color: '#b464ff' },
        { value: 2, label: 'Objective',     color: '#ff9f40' },
        { value: 3, label: 'Action Zone',   color: '#ff4f8b' },
        { value: 4, label: 'Condition',     color: '#40d9ff' },
    ],
};

const OBJECT_PRESETS = {
    props: [
        { id: 'prop', label: 'Generic Prop', name: 'Prop', type: 'prop', imageKey: '', radius: 18, widthTiles: 1, heightTiles: 1 },
        { id: 'lamp', label: 'Lamp', name: 'Lamp', type: 'lamp', imageKey: 'prop_lamp', radius: 8, widthTiles: 1, heightTiles: 1 },
        { id: 'barrel', label: 'Barrel', name: 'Barrel', type: 'barrel', imageKey: 'prop_barrel', radius: 12, widthTiles: 1, heightTiles: 1 },
        { id: 'container', label: 'Container', name: 'Container', type: 'container', imageKey: 'prop_container', radius: 16, widthTiles: 1, heightTiles: 1 },
        { id: 'zone_colony', label: 'Zone: Colony', name: 'Colony Zone', type: 'zone_colony', imageKey: 'zone_colony', radius: 128, widthTiles: 1, heightTiles: 1, color: '#88ccff' },
        { id: 'zone_damaged', label: 'Zone: Damaged', name: 'Damaged Zone', type: 'zone_damaged', imageKey: 'zone_damaged', radius: 128, widthTiles: 1, heightTiles: 1, color: '#ffaa44' },
        { id: 'zone_hive', label: 'Zone: Hive', name: 'Hive Zone', type: 'zone_hive', imageKey: 'zone_hive', radius: 128, widthTiles: 1, heightTiles: 1, color: '#44ff88' },
    ],
    lights: [
        { id: 'point', label: 'Point Light', name: 'Point Light', type: 'point', color: '#ffeebb', radius: 150, intensity: 1 },
        { id: 'spot', label: 'Spot Light', name: 'Spot Light', type: 'spot', color: '#ffeebb', radius: 180, intensity: 1.15 },
        { id: 'alarm', label: 'Alarm Light', name: 'Alarm Light', type: 'alarm', color: '#ff6688', radius: 140, intensity: 1.2 },
    ],
};

const DOOR_ROTATION_OPTIONS = [
    { value: 0, label: '0° Horizontal' },
    { value: 90, label: '90° Vertical' },
    { value: 180, label: '180° Horizontal' },
    { value: 270, label: '270° Vertical' },
];

const ZONE_PROP_META = Object.freeze({
    zone_colony: { color: '#88ccff', shortLabel: 'COL' },
    zone_damaged: { color: '#ffaa44', shortLabel: 'DMG' },
    zone_hive: { color: '#44ff88', shortLabel: 'HIVE' },
});

function normalizeRightAngleRotation(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const snapped = Math.round(n / 90) * 90;
    return ((snapped % 360) + 360) % 360;
}

function isDoorVerticalRotation(rotation = 0) {
    const next = normalizeRightAngleRotation(rotation, 0);
    return next === 90 || next === 270;
}

function getDoorRotationValue(obj, fallback = 0) {
    const width = Number(obj?.width) || (currentMap?.tilewidth || 64);
    const height = Number(obj?.height) || (currentMap?.tileheight || 64);
    const orientation = String(getObjectProperty(obj, 'orientation', '') || '').toLowerCase();
    const rawRotation = Number(obj?.rotation);
    if (Number.isFinite(rawRotation) && (rawRotation !== 0 || (orientation !== 'vertical' && height <= width))) {
        return normalizeRightAngleRotation(rawRotation, fallback);
    }
    if (orientation === 'vertical' || height > width) return 90;
    return normalizeRightAngleRotation(rawRotation, fallback);
}

function applyDoorRotationGeometry(obj, rotation = null) {
    if (!obj) return;
    const tw = currentMap?.tilewidth || 64;
    const th = currentMap?.tileheight || 64;
    const nextRotation = rotation == null ? getDoorRotationValue(obj, 0) : normalizeRightAngleRotation(rotation, 0);
    const vertical = isDoorVerticalRotation(nextRotation);
    obj.rotation = nextRotation;
    obj.width = vertical ? tw : tw * 2;
    obj.height = vertical ? th * 2 : th;
    setObjectProperty(obj, 'orientation', 'string', vertical ? 'vertical' : 'horizontal');
}

function ensureMapAtmosphere(map) {
    if (!map || typeof map !== 'object') return;
    map.atmosphere = map.atmosphere && typeof map.atmosphere === 'object' ? map.atmosphere : {};
    if (!Number.isFinite(Number(map.atmosphere.ambientDarkness))) map.atmosphere.ambientDarkness = 0.82;
    if (!Number.isFinite(Number(map.atmosphere.torchRange))) map.atmosphere.torchRange = 560;
    if (!Number.isFinite(Number(map.atmosphere.softRadius))) map.atmosphere.softRadius = 220;
    if (!Number.isFinite(Number(map.atmosphere.coreAlpha))) map.atmosphere.coreAlpha = 0.9;
    if (!Number.isFinite(Number(map.atmosphere.featherLayers))) map.atmosphere.featherLayers = 14;
    if (!Number.isFinite(Number(map.atmosphere.featherSpread))) map.atmosphere.featherSpread = 1.2;
    if (!Number.isFinite(Number(map.atmosphere.featherDecay))) map.atmosphere.featherDecay = 0.68;
    if (!Number.isFinite(Number(map.atmosphere.glowStrength))) map.atmosphere.glowStrength = 1.15;
    if (!Number.isFinite(Number(map.atmosphere.dustDensity))) map.atmosphere.dustDensity = 0.5;
    if (typeof map.atmosphere.ventHum !== 'boolean') map.atmosphere.ventHum = true;
    if (typeof map.atmosphere.pipeGroans !== 'boolean') map.atmosphere.pipeGroans = true;
    if (typeof map.atmosphere.distantThumps !== 'boolean') map.atmosphere.distantThumps = true;
    if (typeof map.atmosphere.alienChittering !== 'boolean') map.atmosphere.alienChittering = true;
}

function bindAtmosphereControls(root) {
    if (!root || !currentMap) return;
    ensureMapAtmosphere(currentMap);
    const map = currentMap;
    const markDirty = () => {
        dirty = true;
        API.setDirty(true);
    };
    const sliderConfigs = [
        ['atmosDarknessSlider', 'ambientDarkness', 'Ambient Darkness', (value) => `${Number(value).toFixed(2)}`],
        ['atmosTorchSlider', 'torchRange', 'Torch Range', (value) => `${Math.round(Number(value))}px`],
        ['atmosSoftRadiusSlider', 'softRadius', 'Torch Soft Radius', (value) => `${Math.round(Number(value))}px`],
        ['atmosCoreAlphaSlider', 'coreAlpha', 'Core Alpha', (value) => `${Number(value).toFixed(2)}`],
        ['atmosFeatherLayersSlider', 'featherLayers', 'Feather Layers', (value) => `${Math.round(Number(value))}`],
        ['atmosFeatherSpreadSlider', 'featherSpread', 'Feather Spread', (value) => `${Number(value).toFixed(2)}`],
        ['atmosFeatherDecaySlider', 'featherDecay', 'Feather Decay', (value) => `${Number(value).toFixed(2)}`],
        ['atmosGlowStrengthSlider', 'glowStrength', 'Glow Strength', (value) => `${Number(value).toFixed(2)}`],
        ['atmosDustSlider', 'dustDensity', 'Dust Density', (value) => `${Number(value).toFixed(2)}`],
    ];
    sliderConfigs.forEach(([id, key, label, format]) => {
        const input = root.querySelector(`#${id}`);
        const output = root.querySelector(`[data-atmo-label="${id}"]`);
        if (!input || !output) return;
        input.addEventListener('input', (evt) => {
            const value = Number(evt.target.value);
            map.atmosphere[key] = key === 'featherLayers' ? Math.round(value) : value;
            output.textContent = `${label} (${format(map.atmosphere[key])})`;
            markDirty();
        });
    });
    for (const [id, key] of [['atmosVentHum', 'ventHum'], ['atmosPipeGroans', 'pipeGroans'], ['atmosDistantThumps', 'distantThumps'], ['atmosAlienChitter', 'alienChittering']]) {
        root.querySelector(`#${id}`)?.addEventListener('change', (evt) => {
            map.atmosphere[key] = evt.target.checked;
            markDirty();
        });
    }
}

function isZonePropType(type = '') {
    return Object.prototype.hasOwnProperty.call(ZONE_PROP_META, String(type || ''));
}

function getZonePropMeta(type = '') {
    return ZONE_PROP_META[String(type || '')] || null;
}

function getZoneRadiusValue(obj, fallback = 128) {
    const raw = Number(getObjectProperty(obj, 'radius', obj?.radius ?? fallback));
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.max(32, Math.min(512, raw));
}

function drawZonePropPreviewShape(context, obj, options = {}) {
    if (!context || !obj) return;
    const meta = getZonePropMeta(obj.type || options.type);
    if (!meta) return;
    const x = Number(obj.x) || 0;
    const y = Number(obj.y) || 0;
    const width = Math.max(1, Number(obj.width) || (currentMap?.tilewidth || 64));
    const height = Math.max(1, Number(obj.height) || (currentMap?.tileheight || 64));
    const radius = getZoneRadiusValue(obj, Number(options.radius) || 128);
    const lineWidth = Number(options.lineWidth) > 0 ? Number(options.lineWidth) : 2;
    const fillAlpha = Number.isFinite(Number(options.fillAlpha)) ? Number(options.fillAlpha) : 0.12;
    const centerX = x + width * 0.5;
    const centerY = y + height * 0.5;
    const fontSize = Number(options.fontSize) > 0 ? Number(options.fontSize) : 12;

    context.save();
    if (Array.isArray(options.dash)) context.setLineDash(options.dash);
    context.globalAlpha = fillAlpha;
    context.fillStyle = meta.color;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = Math.min(1, fillAlpha * 3.5);
    context.strokeStyle = meta.color;
    context.lineWidth = lineWidth;
    context.stroke();

    context.globalAlpha = Math.min(1, fillAlpha * 3.2);
    context.strokeRect(x, y, width, height);
    context.fillStyle = '#0d1117';
    context.fillRect(x + lineWidth, y + lineWidth, Math.max(1, width - lineWidth * 2), Math.max(1, height - lineWidth * 2));

    context.globalAlpha = 1;
    context.fillStyle = meta.color;
    context.font = `bold ${fontSize}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(meta.shortLabel, centerX, centerY);
    context.restore();
}

function isDoorObjectVertical(obj) {
    if (!obj) return false;
    const rotation = getDoorRotationValue(obj, 0);
    if (isDoorVerticalRotation(rotation)) return true;
    const orientation = String(getObjectProperty(obj, 'orientation', '') || '').toLowerCase();
    if (orientation === 'vertical') return true;
    const width = Number(obj.width || 0);
    const height = Number(obj.height || 0);
    return height > width;
}

function drawDoorPreviewShape(context, obj, color, options = {}) {
    if (!context || !obj) return;
    const x = Number(obj.x) || 0;
    const y = Number(obj.y) || 0;
    const width = Math.max(1, Number(obj.width) || 1);
    const height = Math.max(1, Number(obj.height) || 1);
    const lineWidth = Number(options.lineWidth) > 0 ? Number(options.lineWidth) : 2;
    const fillAlpha = Number.isFinite(Number(options.fillAlpha)) ? Number(options.fillAlpha) : 0.18;
    const dash = Array.isArray(options.dash) ? options.dash : null;
    const vertical = isDoorObjectVertical(obj);
    const minSide = Math.min(width, height);
    const inset = Math.max(minSide * 0.1, lineWidth * 1.5);
    const capThickness = Math.max(minSide * 0.18, lineWidth * 2.5);
    const seamThickness = Math.max(minSide * 0.05, lineWidth * 0.85);

    context.save();
    if (dash) context.setLineDash(dash);

    context.globalAlpha = fillAlpha;
    context.fillStyle = color;
    context.fillRect(x, y, width, height);

    context.globalAlpha = 0.38;
    context.fillStyle = '#0d1117';
    if (vertical) {
        context.fillRect(x + inset, y, Math.max(1, width - inset * 2), capThickness);
        context.fillRect(x + inset, y + height - capThickness, Math.max(1, width - inset * 2), capThickness);
    } else {
        context.fillRect(x, y + inset, capThickness, Math.max(1, height - inset * 2));
        context.fillRect(x + width - capThickness, y + inset, capThickness, Math.max(1, height - inset * 2));
    }

    context.globalAlpha = 0.14;
    context.fillStyle = '#ffffff';
    if (vertical) {
        context.fillRect(x + inset, y + capThickness, Math.max(1, width - inset * 2), Math.max(1, height - capThickness * 2));
    } else {
        context.fillRect(x + capThickness, y + inset, Math.max(1, width - capThickness * 2), Math.max(1, height - inset * 2));
    }

    context.globalAlpha = 1;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.strokeRect(x, y, width, height);
    context.setLineDash([]);

    context.strokeStyle = 'rgba(255,255,255,0.45)';
    context.lineWidth = Math.max(seamThickness, lineWidth * 0.75);
    context.beginPath();
    if (vertical) {
        const seamY = y + height / 2;
        context.moveTo(x + inset, seamY);
        context.lineTo(x + width - inset, seamY);
    } else {
        const seamX = x + width / 2;
        context.moveTo(seamX, y + inset);
        context.lineTo(seamX, y + height - inset);
    }
    context.stroke();
    context.restore();
}

function buildUI(root) {
    root.innerHTML = `
        <div class="layout-three" style="height:100%">
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
                <div class="panel" style="flex:0 0 auto;min-height:140px;max-height:300px;display:flex;flex-direction:column;overflow:hidden;">
                    <div class="panel-header">Properties</div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:6px;font-size:11px;" id="tm-props">
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
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;">
                            <input type="checkbox" id="tm-collision"> Collision
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

            <aside class="sidebar sidebar-right" style="width:300px;display:flex;flex-direction:column;gap:4px;">
                <div class="panel" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                    <div class="panel-header">Tool / Selection</div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:8px;font-size:11px;" id="tm-inspector">
                        <div style="color:var(--text-muted);">Pick a layer or object to edit it here.</div>
                    </div>
                </div>
            </aside>
        </div>
    `;

    canvas = document.getElementById('tm-canvas');
    ctx = canvas.getContext('2d');

    // Tool buttons
    document.querySelectorAll('.tm-tool').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    document.getElementById('tm-grid').addEventListener('change', (e) => { showGrid = e.target.checked; draw(); });
    document.getElementById('tm-collision').addEventListener('change', (e) => { showCollision = e.target.checked; draw(); });
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
    document.addEventListener('keyup', onKeyUp);

    // Resize
    const wrap = document.getElementById('tm-canvas-wrap');
    const ro = new ResizeObserver(() => {
        canvas.width = wrap.clientWidth;
        canvas.height = wrap.clientHeight;
        draw();
    });
    ro.observe(wrap);
}

function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tm-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    canvas.style.cursor = tool === 'pan' ? 'grab' : (tool === 'paint' || tool === 'erase' || tool === 'fill') ? 'crosshair' : 'default';
    renderInspector();
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
            <span style="flex:1;font-size:12px;${layerLocked[lay] ? 'opacity:0.5;' : ''}">${LAYER_LABELS[lay]}</span>
            <span data-lock="${lay}" title="${layerLocked[lay] ? 'Unlock layer' : 'Lock layer'}"
                  style="cursor:pointer;font-size:13px;opacity:${layerLocked[lay] ? '1' : '0.3'};">${layerLocked[lay] ? '🔒' : '🔓'}</span>
        </div>
    `).join('');

    el.querySelectorAll('.tm-layer-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            activeLayer = row.dataset.layer;
            selectedTiles = [];
            selectedObjects = [];
            renderLayers();
            renderPalette();
            renderInspector();
            setTool(activeTool); // refresh sidebar visibility for new layer
            draw();
        });
    });
    el.querySelectorAll('[data-vis]').forEach(cb => {
        cb.addEventListener('change', () => {
            layerVisibility[cb.dataset.vis] = cb.checked;
            draw();
        });
    });
    el.querySelectorAll('[data-lock]').forEach(lockEl => {
        lockEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const lay = lockEl.dataset.lock;
            layerLocked[lay] = !layerLocked[lay];
            renderLayers();
        });
    });
}

function humanizeAssetLabel(value) {
    return String(value || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferPropPresetFromAsset(asset) {
    const assetName = String(asset?.name || '').trim();
    const lower = assetName.toLowerCase();
    let type = 'prop';
    let radius = 18;
    let label = humanizeAssetLabel(assetName);

    if (lower.includes('lamp')) {
        type = 'lamp';
        radius = 8;
        label = 'Lamp';
    } else if (lower.includes('barrel')) {
        type = 'barrel';
        radius = 12;
        label = 'Barrel';
    } else if (lower.includes('container') || lower.includes('crate')) {
        type = 'container';
        radius = 16;
        label = humanizeAssetLabel(assetName);
    }

    return {
        id: `asset:${assetName}`,
        label,
        name: label,
        type,
        imageKey: assetName,
        radius,
        widthTiles: 1,
        heightTiles: 1,
        color: '#33556d',
        thumbnail: asset?.path || '',
    };
}

async function loadSpriteAssetCatalog() {
    if (spriteAssetLoadPromise) return spriteAssetLoadPromise;
    spriteAssetLoadPromise = API.apiFetch('/api/sprites')
        .then((resp) => resp.json())
        .then((data) => {
            if (!data?.ok) throw new Error(data?.error || 'Failed to load asset catalog');
            spriteAssetList = Array.isArray(data.sprites) ? data.sprites : [];
            renderPalette();
            renderInspector();
            return spriteAssetList;
        })
        .catch((err) => {
            console.warn('[tilemaps] asset catalog load failed:', err?.message || err);
            spriteAssetList = [];
            return [];
        })
        .finally(() => {
            spriteAssetLoadPromise = null;
        });
    return spriteAssetLoadPromise;
}

function getObjectPresetOptions(layerName) {
    const base = [...(OBJECT_PRESETS[layerName] || [])];
    if (layerName !== 'props') return base;

    const dynamic = spriteAssetList
        .filter((asset) => String(asset?.dir || '').replace(/\\/g, '/').includes('assets/objects'))
        .map((asset) => inferPropPresetFromAsset(asset));

    const seen = new Set(base.map((preset) => String(preset.imageKey || preset.id || '')));
    for (const preset of dynamic) {
        const dedupeKey = String(preset.imageKey || preset.id || '');
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        base.push(preset);
    }
    return base;
}

function getFilteredObjectPresetOptions(layerName) {
    const all = getObjectPresetOptions(layerName);
    const query = String(assetSearchByLayer[layerName] || '').trim().toLowerCase();
    if (!query) return all;
    return all.filter((preset) => {
        const hay = `${preset.label || ''} ${preset.name || ''} ${preset.type || ''} ${preset.imageKey || ''}`.toLowerCase();
        return hay.includes(query);
    });
}

function getActiveObjectPreset(layerName) {
    const options = getObjectPresetOptions(layerName);
    if (!options.length) return null;
    const activeId = activeObjectPresetByLayer[layerName];
    return options.find((opt) => opt.id === activeId) || options[0];
}

function getLayerTypeOptions(layerName) {
    if (layerName === 'doors') {
        return [
            { value: 'standard', label: 'Standard Door', brush: 1 },
            { value: 'electronic', label: 'Electronic Door', brush: 2 },
            { value: 'locked', label: 'Locked Door', brush: 3 },
            { value: 'welded', label: 'Welded Door', brush: 4 },
        ];
    }
    if (layerName === 'markers') {
        return [
            { value: 'spawn', label: 'Spawn Marker', brush: 1 },
            { value: 'extract', label: 'Extract Marker', brush: 2 },
            { value: 'terminal', label: 'Terminal', brush: 3 },
            { value: 'security_card', label: 'Security Card', brush: 4 },
            { value: 'alien_spawn', label: 'Alien Spawn', brush: 5 },
            { value: 'warning_strobe', label: 'Warning Strobe', brush: 6 },
            { value: 'vent_point', label: 'Vent Point', brush: 7 },
            { value: 'egg_cluster', label: 'Egg Cluster', brush: 8 },
        ];
    }
    if (layerName === 'story') {
        return [
            { value: 'story_trigger', label: 'Story Trigger', brush: 1 },
            { value: 'objective', label: 'Objective', brush: 2 },
            { value: 'action_zone', label: 'Action Zone', brush: 3 },
            { value: 'condition', label: 'Condition', brush: 4 },
        ];
    }
    return getObjectPresetOptions(layerName).map((preset) => ({ value: preset.type, label: preset.label, presetId: preset.id }));
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
                Select type, then click canvas to place.<br>Use <b>Select</b> or right-click to edit existing objects in the inspector.
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
        const presetOptions = getObjectPresetOptions(activeLayer);
        if (presetOptions.length) {
            const activePreset = getActiveObjectPreset(activeLayer);
            const filteredPresets = getFilteredObjectPresetOptions(activeLayer);
            el.innerHTML = `
                <div style="padding:4px;font-size:11px;color:var(--text-muted);margin-bottom:4px;">
                    Pick a preset, then paint to place it. Use <b>Select</b> to drag or edit existing objects in the right panel.
                </div>
                ${activeLayer === 'props' ? `<input id="tm-palette-search" class="input" placeholder="Search props…" value="${esc(assetSearchByLayer.props || '')}" style="width:100%;margin-bottom:6px;">` : ''}
                ${(filteredPresets.length ? filteredPresets : presetOptions).map((preset) => `
                    <div class="tm-palette-item ${activePreset?.id === preset.id ? 'active' : ''}" data-preset="${preset.id}"
                         style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:3px;margin-bottom:2px;
                                ${activePreset?.id === preset.id ? 'background:rgba(74,164,216,0.2);outline:1px solid var(--accent);' : ''}">
                        ${preset.thumbnail
                            ? `<img src="${preset.thumbnail}" alt="${esc(preset.label)}" style="width:26px;height:26px;object-fit:contain;image-rendering:pixelated;background:#111820;border:1px solid #35566d;border-radius:3px;flex-shrink:0;">`
                            : `<div style="width:18px;height:18px;border-radius:2px;border:1px solid #555;background:${preset.color || '#3a5870'};"></div>`}
                        <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preset.label}</span>
                    </div>
                `).join('')}
                <button class="btn btn-sm btn-primary" id="tm-add-object" style="margin:4px 0 0;">+ Add ${activePreset?.label || 'Object'}</button>
            `;
            el.querySelector('#tm-palette-search')?.addEventListener('input', (evt) => {
                assetSearchByLayer[activeLayer] = evt.target.value || '';
                renderPalette();
            });
            el.querySelectorAll('[data-preset]').forEach((item) => {
                item.addEventListener('click', () => {
                    activeObjectPresetByLayer[activeLayer] = item.dataset.preset;
                    renderPalette();
                    renderInspector();
                });
            });
            document.getElementById('tm-add-object')?.addEventListener('click', addObjectAtCenter);
            return;
        }

        el.innerHTML = `
            <div style="padding:4px;font-size:11px;color:var(--text-muted);">
                Object layers use click-to-place. Use <b>Select</b> to edit or move objects in the right panel.
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
    // Dirty-check before switching
    if (dirty && currentMapName) {
        if (!confirm(`Map "${currentMapName}" has unsaved changes. Discard and load "${name}"?`)) return;
    }
    try {
        const resp = await API.apiFetch(`/api/maps/${encodeURIComponent(name)}`);
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        currentMap = data.map;
        currentMapName = name;
        ensureMapAtmosphere(currentMap);
        dirty = false;
        selectedTiles = [];
        selectedObjects = [];
        objectDragState = null;
        undoStack = [];
        redoStack = [];
        updateUndoButtons();

        // Ensure all layers exist (adds 'story' to pre-existing maps automatically)
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
                    // doors, markers, props, lights, story are objectgroups in Tiled format
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
        renderInspector();
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
    ensureMapAtmosphere(currentMap);
    el.innerHTML = `
        <div><b>Map:</b> ${currentMapName}</div>
        <div><b>Size:</b> ${currentMap.width}×${currentMap.height} tiles</div>
        <div><b>Tile:</b> ${currentMap.tilewidth}×${currentMap.tileheight}px</div>
        <div><b>Layers:</b> ${currentMap.layers.length}</div>
        <div><b>Tiled v:</b> ${currentMap.tiledversion || '—'}</div>
        <div><b>Selection:</b> ${selectedObjects.length || selectedTiles.length || 0}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;">
            <div style="font-weight:600;">Map Lighting</div>
            <div>
                <label data-atmo-label="atmosDarknessSlider" style="display:block">Ambient Darkness (${Number(currentMap.atmosphere?.ambientDarkness ?? 0.82).toFixed(2)})</label>
                <input id="atmosDarknessSlider" type="range" min="0.45" max="1" step="0.01" value="${currentMap.atmosphere?.ambientDarkness ?? 0.82}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosTorchSlider" style="display:block">Torch Range (${Math.round(Number(currentMap.atmosphere?.torchRange ?? 560))}px)</label>
                <input id="atmosTorchSlider" type="range" min="80" max="1200" step="10" value="${currentMap.atmosphere?.torchRange ?? 560}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosSoftRadiusSlider" style="display:block">Torch Soft Radius (${Math.round(Number(currentMap.atmosphere?.softRadius ?? 220))}px)</label>
                <input id="atmosSoftRadiusSlider" type="range" min="10" max="600" step="1" value="${currentMap.atmosphere?.softRadius ?? 220}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosCoreAlphaSlider" style="display:block">Core Alpha (${Number(currentMap.atmosphere?.coreAlpha ?? 0.9).toFixed(2)})</label>
                <input id="atmosCoreAlphaSlider" type="range" min="0" max="1" step="0.01" value="${currentMap.atmosphere?.coreAlpha ?? 0.9}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosFeatherLayersSlider" style="display:block">Feather Layers (${Math.round(Number(currentMap.atmosphere?.featherLayers ?? 14))})</label>
                <input id="atmosFeatherLayersSlider" type="range" min="4" max="24" step="1" value="${currentMap.atmosphere?.featherLayers ?? 14}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosFeatherSpreadSlider" style="display:block">Feather Spread (${Number(currentMap.atmosphere?.featherSpread ?? 1.2).toFixed(2)})</label>
                <input id="atmosFeatherSpreadSlider" type="range" min="0.4" max="2.5" step="0.01" value="${currentMap.atmosphere?.featherSpread ?? 1.2}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosFeatherDecaySlider" style="display:block">Feather Decay (${Number(currentMap.atmosphere?.featherDecay ?? 0.68).toFixed(2)})</label>
                <input id="atmosFeatherDecaySlider" type="range" min="0.2" max="0.95" step="0.01" value="${currentMap.atmosphere?.featherDecay ?? 0.68}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosGlowStrengthSlider" style="display:block">Glow Strength (${Number(currentMap.atmosphere?.glowStrength ?? 1.15).toFixed(2)})</label>
                <input id="atmosGlowStrengthSlider" type="range" min="0.1" max="2" step="0.01" value="${currentMap.atmosphere?.glowStrength ?? 1.15}" style="width:100%">
            </div>
            <div>
                <label data-atmo-label="atmosDustSlider" style="display:block">Dust Density (${Number(currentMap.atmosphere?.dustDensity ?? 0.5).toFixed(2)})</label>
                <input id="atmosDustSlider" type="range" min="0" max="1" step="0.01" value="${currentMap.atmosphere?.dustDensity ?? 0.5}" style="width:100%">
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                <label><input type="checkbox" id="atmosVentHum" ${currentMap.atmosphere?.ventHum !== false ? 'checked' : ''}> Vent Hum</label>
                <label><input type="checkbox" id="atmosPipeGroans" ${currentMap.atmosphere?.pipeGroans !== false ? 'checked' : ''}> Pipe Groans</label>
                <label><input type="checkbox" id="atmosDistantThumps" ${currentMap.atmosphere?.distantThumps !== false ? 'checked' : ''}> Distant Thumps</label>
                <label><input type="checkbox" id="atmosAlienChitter" ${currentMap.atmosphere?.alienChittering !== false ? 'checked' : ''}> Alien Chittering</label>
            </div>
        </div>
    `;
    bindAtmosphereControls(el);
}

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getObjectProperty(obj, name, fallback = '') {
    return obj?.properties?.find((p) => p.name === name)?.value ?? fallback;
}

function setObjectProperty(obj, name, type, value) {
    if (!obj.properties) obj.properties = [];
    const existing = obj.properties.find((p) => p.name === name);
    if (existing) {
        existing.type = type;
        existing.value = value;
    } else {
        obj.properties.push({ name, type, value });
    }
}

function markDirtyAndRefresh() {
    dirty = true;
    API.setDirty(true);
    updateProps();
    renderInspector();
    draw();
}

function getSelectedLayerObjects() {
    const layer = currentMap?.layers.find((entry) => entry.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup') return [];
    return (layer.objects || []).filter((obj) => selectedObjects.includes(obj.id));
}

function applyLayerTypeSelection(obj, nextValue) {
    const options = getLayerTypeOptions(activeLayer);
    const match = options.find((entry) => entry.value === nextValue || String(entry.brush) === String(nextValue) || entry.presetId === nextValue);
    if (!match || !obj) return;

    if (activeLayer === 'doors') {
        obj.type = 'door';
        setObjectProperty(obj, 'doorType', 'string', match.value);
        setObjectProperty(obj, 'doorValue', 'int', Number(match.brush || 1));
        applyDoorRotationGeometry(obj);
        return;
    }
    if (activeLayer === 'markers') {
        obj.type = match.value;
        if (!obj.name || obj.name === 'Prop') obj.name = match.label;
        setObjectProperty(obj, 'markerValue', 'int', Number(match.brush || 1));
        return;
    }
    if (activeLayer === 'story') {
        obj.type = match.value;
        if (!obj.name || obj.name === 'Prop') obj.name = match.label;
        setObjectProperty(obj, 'storyValue', 'int', Number(match.brush || 1));
        return;
    }

    const preset = getObjectPresetOptions(activeLayer).find((entry) => entry.id === match.presetId || entry.type === match.value);
    if (!preset) {
        obj.type = nextValue;
        return;
    }
    obj.type = preset.type;
    if (!obj.name || obj.name === 'Prop' || obj.name === 'Light') obj.name = preset.name;
    if (preset.imageKey !== undefined) setObjectProperty(obj, 'imageKey', 'string', preset.imageKey);
    if (preset.radius !== undefined) setObjectProperty(obj, 'radius', 'float', preset.radius);
    if (preset.color !== undefined) setObjectProperty(obj, 'color', 'string', preset.color);
    if (preset.intensity !== undefined) setObjectProperty(obj, 'intensity', 'float', preset.intensity);
}

function deleteSelectedObjects() {
    if (layerLocked[activeLayer]) { API.toast(`Layer "${LAYER_LABELS[activeLayer]}" is locked`, 'warn'); return; }
    const layer = currentMap?.layers.find((entry) => entry.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup' || selectedObjects.length === 0) return;
    const removedEntries = [];
    selectedObjects.forEach((id) => {
        const idx = layer.objects.findIndex((obj) => obj.id === id);
        if (idx >= 0) {
            removedEntries.push({ object: JSON.parse(JSON.stringify(layer.objects[idx])), objectIndex: idx });
            layer.objects.splice(idx, 1);
        }
    });
    removedEntries.forEach((entry) => pushUndo({ type: 'objectRemove', layerName: activeLayer, ...entry }));
    selectedObjects = [];
    markDirtyAndRefresh();
}

function renderAssetBrowserHtml(layerName, selectedValue = '') {
    if (layerName !== 'props') return '';
    const presets = getFilteredObjectPresetOptions(layerName);
    if (!getObjectPresetOptions(layerName).length) {
        return '<div style="padding:8px;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);">Loading prop thumbnails…</div>';
    }
    return `
        <div style="padding:8px;border:1px solid var(--border);border-radius:4px;">
            <div style="font-weight:600;margin-bottom:6px;">Asset thumbnails</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">Pick an authored prop image directly from the browser.</div>
            <input id="tm-asset-search" class="input" placeholder="Filter thumbnails…" value="${esc(assetSearchByLayer[layerName] || '')}" style="width:100%;margin-bottom:6px;">
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;max-height:210px;overflow-y:auto;">
                ${presets.length ? presets.map((preset) => {
                    const selected = selectedValue && (selectedValue === preset.id || selectedValue === preset.imageKey);
                    const searchText = `${preset.label || ''} ${preset.name || ''} ${preset.type || ''} ${preset.imageKey || ''}`.toLowerCase();
                    return `
                        <button type="button" class="btn btn-sm tm-asset-thumb ${selected ? 'active' : ''}" data-asset-preset="${esc(preset.id)}" data-search-text="${esc(searchText)}"
                                title="${esc(preset.label)}"
                                style="padding:4px;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:flex-start;border:${selected ? '1px solid var(--accent)' : '1px solid var(--border)'};background:${selected ? 'rgba(74,164,216,0.12)' : 'var(--bg-raised)'};min-height:78px;">
                            ${preset.thumbnail
                                ? `<img src="${preset.thumbnail}" alt="${esc(preset.label)}" style="width:100%;height:38px;object-fit:contain;image-rendering:pixelated;background:#111820;border-radius:2px;">`
                                : `<div style="width:100%;height:38px;border-radius:2px;background:${preset.color || '#33556d'};"></div>`}
                            <span style="font-size:10px;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preset.label)}</span>
                        </button>`;
                }).join('') : '<div style="grid-column:1 / -1;color:var(--text-muted);font-size:11px;padding:8px;">No prop thumbnails match this filter.</div>'}
                <div id="tm-asset-empty" style="display:none;grid-column:1 / -1;color:var(--text-muted);font-size:11px;padding:8px;">No prop thumbnails match this filter.</div>
            </div>
        </div>
    `;
}

function bindInspectorAssetPicker(root, onSelect) {
    root.querySelector('#tm-asset-search')?.addEventListener('input', (evt) => {
        const query = String(evt.target.value || '').trim().toLowerCase();
        assetSearchByLayer[activeLayer] = evt.target.value || '';
        let visibleCount = 0;
        root.querySelectorAll('[data-asset-preset]').forEach((button) => {
            const hay = String(button.dataset.searchText || button.title || '').toLowerCase();
            const visible = !query || hay.includes(query);
            button.style.display = visible ? 'flex' : 'none';
            if (visible) visibleCount += 1;
        });
        const empty = root.querySelector('#tm-asset-empty');
        if (empty) empty.style.display = visibleCount === 0 ? 'block' : 'none';
    });
    root.querySelectorAll('[data-asset-preset]').forEach((button) => {
        button.addEventListener('click', () => onSelect(button.dataset.assetPreset));
    });
}

function renderInspector() {
    const el = document.getElementById('tm-inspector');
    if (!el) return;
    if (!currentMap) {
        el.innerHTML = '<div style="color:var(--text-muted);">Load a map to start painting and editing.</div>';
        return;
    }

    const layer = currentMap.layers.find((entry) => entry.name === activeLayer);
    const isObjectLayer = layer?.type === 'objectgroup';
    const selected = getSelectedLayerObjects();
    const layerOptions = getLayerTypeOptions(activeLayer);
    const layerPalette = TILE_VALUES[activeLayer] || [];
    const selectedPreset = getActiveObjectPreset(activeLayer);

    if (!isObjectLayer && selectedTiles.length > 0) {
        // Terrain tile inspector — show details of selected tile(s)
        const isSingle = selectedTiles.length === 1;
        const firstTile = selectedTiles[0];
        const tileIdx = firstTile.y * currentMap.width + firstTile.x;
        const tileVal = layer?.data?.[tileIdx] ?? 0;
        const tileDef = layerPalette.find(t => t.value === tileVal) || { label: 'Unknown', color: '#555' };
        const tileOptions = layerPalette.map(t => `<option value="${t.value}" ${tileVal === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('');

        el.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;">
                <div style="padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-inset);">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">
                        ${isSingle ? 'Selected Tile' : `${selectedTiles.length} Tiles Selected`}
                    </div>
                    ${isSingle ? `
                        <div><b>Position:</b> ${firstTile.x}, ${firstTile.y}</div>
                        <div><b>Type:</b> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${tileDef.color};vertical-align:middle;margin-right:4px;border:1px solid #555;"></span>${esc(tileDef.label)}</div>
                        <div><b>Value:</b> ${tileVal}</div>
                        <div><b>Layer:</b> ${esc(LAYER_LABELS[activeLayer] || activeLayer)}</div>
                    ` : `
                        <div><b>Layer:</b> ${esc(LAYER_LABELS[activeLayer] || activeLayer)}</div>
                        <div style="color:var(--text-muted);margin-top:4px;">Use the dropdown below to change all selected tiles.</div>
                    `}
                </div>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span>${isSingle ? 'Change Tile Type' : 'Set All Selected To'}</span>
                    <select id="tm-tile-change" class="input" style="width:100%;">${tileOptions}</select>
                </label>
                <button class="btn btn-sm btn-primary" id="tm-tile-apply">Apply</button>
            </div>
        `;
        el.querySelector('#tm-tile-apply')?.addEventListener('click', () => {
            const newVal = Number(el.querySelector('#tm-tile-change')?.value ?? tileVal);
            if (!layer?.data) return;
            const changes = [];
            for (const sel of selectedTiles) {
                const idx = sel.y * currentMap.width + sel.x;
                if (layer.data[idx] !== newVal) {
                    changes.push({ idx, oldVal: layer.data[idx], newVal });
                    layer.data[idx] = newVal;
                }
            }
            if (changes.length) {
                pushUndo({ type: 'tiles', layerName: activeLayer, changes });
                dirty = true;
                API.setDirty(true);
                draw();
                renderInspector();
            }
        });
        return;
    }

    if (!isObjectLayer || selected.length === 0) {
        const brushOptions = layerPalette.filter((item) => item.value > 0);
        el.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;">
                <div style="padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-inset);">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">Mode</div>
                    <div><b>Layer:</b> ${esc(LAYER_LABELS[activeLayer] || activeLayer)}</div>
                    <div><b>Tool:</b> ${esc(activeTool)}</div>
                    <div style="margin-top:4px;color:var(--text-muted);">${isObjectLayer ? 'Paint to place objects. Switch to Select to auto-open editing for any existing object.' : 'Choose the brush and paint directly on the map.'}</div>
                </div>
                ${isObjectLayer ? `
                    <div style="padding:8px;border:1px solid var(--border);border-radius:4px;">
                        <div style="font-weight:600;margin-bottom:6px;">Placement preset</div>
                        <div style="margin-bottom:6px;color:var(--text-muted);">Current: ${esc(selectedPreset?.label || 'Default')}</div>
                        ${layerOptions.length ? `<select id="tm-inspector-type" class="input" style="width:100%;"><option value="">Select type…</option>${layerOptions.map((entry) => `<option value="${esc(entry.presetId || entry.value)}" ${(selectedPreset && (entry.presetId === selectedPreset.id || entry.value === selectedPreset.type)) ? 'selected' : ''}>${esc(entry.label)}</option>`).join('')}</select>` : ''}
                        ${activeLayer === 'doors' ? `<select id="tm-inspector-rotation" class="input" style="width:100%;margin-top:6px;">${DOOR_ROTATION_OPTIONS.map((entry) => `<option value="${entry.value}" ${normalizeRightAngleRotation(activeObjectRotationByLayer.doors || 0) === entry.value ? 'selected' : ''}>${entry.label}</option>`).join('')}</select>` : ''}
                    </div>
                    ${renderAssetBrowserHtml(activeLayer, selectedPreset?.id || selectedPreset?.imageKey || '')}
                ` : `
                    <div style="padding:8px;border:1px solid var(--border);border-radius:4px;">
                        <div style="font-weight:600;margin-bottom:6px;">Brush</div>
                        ${brushOptions.length ? `<select id="tm-inspector-brush" class="input" style="width:100%;">${brushOptions.map((entry) => `<option value="${entry.value}" ${activeBrush === entry.value ? 'selected' : ''}>${esc(entry.label)}</option>`).join('')}</select>` : '<div style="color:var(--text-muted);">No brush options for this layer.</div>'}
                    </div>
                `}
            </div>
        `;

        el.querySelector('#tm-inspector-brush')?.addEventListener('change', (evt) => {
            activeBrush = Number(evt.target.value) || activeBrush;
            renderPalette();
            renderInspector();
            draw();
        });
        el.querySelector('#tm-inspector-type')?.addEventListener('change', (evt) => {
            const nextValue = evt.target.value;
            if (nextValue) {
                const match = layerOptions.find((entry) => String(entry.presetId || entry.value) === String(nextValue));
                if (match?.brush) activeBrush = match.brush;
                if (match?.presetId || getObjectPresetOptions(activeLayer).length) {
                    activeObjectPresetByLayer[activeLayer] = String(match?.presetId || nextValue);
                }
                renderPalette();
            }
            renderInspector();
        });
        el.querySelector('#tm-inspector-rotation')?.addEventListener('change', (evt) => {
            activeObjectRotationByLayer.doors = normalizeRightAngleRotation(evt.target.value, 0);
        });
        bindInspectorAssetPicker(el, (presetId) => {
            activeObjectPresetByLayer[activeLayer] = String(presetId || activeObjectPresetByLayer[activeLayer] || '');
            renderPalette();
            renderInspector();
        });
        return;
    }

    if (selected.length > 1) {
        el.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;">
                <div style="padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-inset);">
                    <div style="font-weight:600;">${selected.length} objects selected</div>
                    <div style="color:var(--text-muted);margin-top:4px;">Use drag on the canvas or apply a shared type change below.</div>
                </div>
                ${layerOptions.length ? `<label style="display:flex;flex-direction:column;gap:4px;"><span>Swap selected type</span><select id="tm-bulk-type" class="input">${layerOptions.map((entry) => `<option value="${esc(entry.presetId || entry.value)}">${esc(entry.label)}</option>`).join('')}</select></label>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-secondary" data-nudge="0,-1">↑</button>
                    <button class="btn btn-sm btn-secondary" data-nudge="-1,0">←</button>
                    <button class="btn btn-sm btn-secondary" data-nudge="1,0">→</button>
                    <button class="btn btn-sm btn-secondary" data-nudge="0,1">↓</button>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${layerOptions.length ? '<button class="btn btn-sm btn-primary" id="tm-bulk-apply">Apply Type</button>' : ''}
                    <button class="btn btn-sm btn-danger" id="tm-bulk-delete">Delete Selected</button>
                </div>
            </div>
        `;
        el.querySelectorAll('[data-nudge]').forEach((button) => {
            button.addEventListener('click', () => {
                const [dx, dy] = String(button.dataset.nudge || '0,0').split(',').map((v) => Number(v) || 0);
                const tw = currentMap.tilewidth;
                const th = currentMap.tileheight;
                selected.forEach((obj) => {
                    obj.x += dx * tw;
                    obj.y += dy * th;
                });
                markDirtyAndRefresh();
            });
        });
        el.querySelector('#tm-bulk-apply')?.addEventListener('click', () => {
            const nextValue = el.querySelector('#tm-bulk-type')?.value;
            if (nextValue) {
                selected.forEach((obj) => applyLayerTypeSelection(obj, nextValue));
                markDirtyAndRefresh();
            }
        });
        el.querySelector('#tm-bulk-delete')?.addEventListener('click', deleteSelectedObjects);
        return;
    }

    const obj = selected[0];
    const tileX = Math.round((Number(obj.x) || 0) / currentMap.tilewidth);
    const tileY = Math.round((Number(obj.y) || 0) / currentMap.tileheight);
    const isZoneProp = activeLayer === 'props' && isZonePropType(obj.type);
    const rotationValue = activeLayer === 'doors'
        ? getDoorRotationValue(obj, 0)
        : normalizeRightAngleRotation(obj.rotation || 0, 0);
    const objectTypeValue = activeLayer === 'doors'
        ? String(getObjectProperty(obj, 'doorType', 'standard'))
        : (activeLayer === 'markers'
            ? String(obj.type || 'spawn')
            : (activeLayer === 'story' ? String(obj.type || 'story_trigger') : String(obj.type || 'prop')));

    el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-inset);">
                <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">Selected Object</div>
                <div><b>${esc(obj.name || obj.type || 'Object')}</b></div>
                <div style="color:var(--text-muted);">Layer: ${esc(LAYER_LABELS[activeLayer] || activeLayer)} · ID ${esc(obj.id)}</div>
                <div style="margin-top:4px;color:var(--text-muted);">Drag on the canvas to reposition, or edit fields below.</div>
            </div>
            <label style="display:flex;flex-direction:column;gap:4px;"><span>Name</span><input id="tm-obj-name" class="input" value="${esc(obj.name || '')}"></label>
            ${layerOptions.length ? `<label style="display:flex;flex-direction:column;gap:4px;"><span>Type</span><select id="tm-obj-kind" class="input">${layerOptions.map((entry) => `<option value="${esc(entry.presetId || entry.value)}" ${objectTypeValue === String(entry.value) || getActiveObjectPreset(activeLayer)?.id === entry.presetId && objectTypeValue === String(getActiveObjectPreset(activeLayer)?.type || '') ? 'selected' : ''}>${esc(entry.label)}</option>`).join('')}</select></label>` : `<label style="display:flex;flex-direction:column;gap:4px;"><span>Type</span><input id="tm-obj-type" class="input" value="${esc(obj.type || '')}"></label>`}
            ${activeLayer === 'doors'
                ? `<label style="display:flex;flex-direction:column;gap:4px;"><span>Rotation</span><select id="tm-obj-rotation" class="input">${DOOR_ROTATION_OPTIONS.map((entry) => `<option value="${entry.value}" ${rotationValue === entry.value ? 'selected' : ''}>${entry.label}</option>`).join('')}</select></label>`
                : `<label style="display:flex;flex-direction:column;gap:4px;"><span>Rotation</span><input id="tm-obj-rotation" type="number" step="1" class="input" value="${Number(obj.rotation || 0)}"></label>`}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Tile X</span><input id="tm-obj-tilex" type="number" class="input" value="${tileX}"></label>
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Tile Y</span><input id="tm-obj-tiley" type="number" class="input" value="${tileY}"></label>
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Width</span><input id="tm-obj-w" type="number" class="input" value="${Number(obj.width || currentMap.tilewidth)}" ${activeLayer === 'doors' ? 'readonly' : ''}></label>
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Height</span><input id="tm-obj-h" type="number" class="input" value="${Number(obj.height || currentMap.tileheight)}" ${activeLayer === 'doors' ? 'readonly' : ''}></label>
            </div>
            ${activeLayer === 'props' || activeLayer === 'lights' ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <label style="display:flex;flex-direction:column;gap:4px;"><span>Image Key</span><input id="tm-obj-image" class="input" value="${esc(getObjectProperty(obj, 'imageKey', ''))}"></label>
                    <label style="display:flex;flex-direction:column;gap:4px;"><span>${isZoneProp ? 'Zone Radius' : 'Radius'}</span><input id="tm-obj-radius" type="number" class="input" value="${Number(getObjectProperty(obj, 'radius', activeLayer === 'lights' ? 150 : (isZoneProp ? 128 : 18)))}"></label>
                </div>
            ` : ''}
            ${isZoneProp ? `<div style="padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-inset);color:var(--text-muted);">Zone profiles apply localized darkness and torch softness when the leader enters the painted area.</div>` : ''}
            ${activeLayer === 'props' ? renderAssetBrowserHtml(activeLayer, getObjectProperty(obj, 'imageKey', '')) : ''}
            ${activeLayer === 'lights' ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <label style="display:flex;flex-direction:column;gap:4px;"><span>Color</span><input id="tm-obj-color" class="input" value="${esc(getObjectProperty(obj, 'color', '#ffeebb'))}"></label>
                    <label style="display:flex;flex-direction:column;gap:4px;"><span>Intensity</span><input id="tm-obj-intensity" type="number" step="0.05" class="input" value="${Number(getObjectProperty(obj, 'intensity', 1))}"></label>
                </div>
            ` : ''}
            ${activeLayer === 'markers' || activeLayer === 'story' ? `
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Trigger ID / marker_type</span><input id="tm-obj-marker-type" class="input" value="${esc(getObjectProperty(obj, 'marker_type', ''))}" placeholder="mission_intro"></label>
            ` : ''}
            ${activeLayer === 'markers' && (obj.type === 'alien_spawn' || getObjectProperty(obj, 'markerValue', 0) === 5) ? `
                <label style="display:flex;flex-direction:column;gap:4px;"><span>Spawn Count (2/4/6/8)</span>
                    <select id="tm-obj-spawn-count" class="input" style="width:100%;">
                        <option value="2" ${getObjectProperty(obj, 'count', 4) === 2 ? 'selected' : ''}>2</option>
                        <option value="4" ${getObjectProperty(obj, 'count', 4) === 4 ? 'selected' : ''}>4</option>
                        <option value="6" ${getObjectProperty(obj, 'count', 4) === 6 ? 'selected' : ''}>6</option>
                        <option value="8" ${getObjectProperty(obj, 'count', 4) === 8 ? 'selected' : ''}>8</option>
                    </select>
                </label>
            ` : ''}
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-primary" id="tm-obj-apply">Apply</button>
                <button class="btn btn-sm btn-secondary" id="tm-obj-duplicate">Duplicate</button>
                <button class="btn btn-sm btn-danger" id="tm-obj-delete">Delete</button>
            </div>
        </div>
    `;

    el.querySelector('#tm-obj-kind')?.addEventListener('change', (evt) => {
        const nextValue = evt.target.value;
        const preset = getObjectPresetOptions(activeLayer).find((entry) => entry.id === nextValue || entry.type === nextValue);
        if (!preset) return;
        activeObjectPresetByLayer[activeLayer] = String(preset.id || activeObjectPresetByLayer[activeLayer] || '');
        renderPalette();
        if (el.querySelector('#tm-obj-image') && preset.imageKey !== undefined) el.querySelector('#tm-obj-image').value = preset.imageKey;
        if (el.querySelector('#tm-obj-radius') && preset.radius !== undefined) el.querySelector('#tm-obj-radius').value = String(preset.radius);
        if (el.querySelector('#tm-obj-color') && preset.color !== undefined) el.querySelector('#tm-obj-color').value = preset.color;
        if (el.querySelector('#tm-obj-intensity') && preset.intensity !== undefined) el.querySelector('#tm-obj-intensity').value = String(preset.intensity);
    });
    el.querySelector('#tm-obj-rotation')?.addEventListener('change', (evt) => {
        if (activeLayer !== 'doors') return;
        const vertical = isDoorVerticalRotation(evt.target.value);
        const tw = currentMap?.tilewidth || 64;
        const th = currentMap?.tileheight || 64;
        const widthEl = el.querySelector('#tm-obj-w');
        const heightEl = el.querySelector('#tm-obj-h');
        if (widthEl) widthEl.value = String(vertical ? tw : tw * 2);
        if (heightEl) heightEl.value = String(vertical ? th * 2 : th);
    });
    bindInspectorAssetPicker(el, (presetId) => {
        const preset = getObjectPresetOptions(activeLayer).find((entry) => entry.id === presetId || entry.type === presetId);
        if (!preset) return;
        activeObjectPresetByLayer[activeLayer] = String(preset.id || activeObjectPresetByLayer[activeLayer] || '');
        renderPalette();
        const typeEl = el.querySelector('#tm-obj-kind');
        if (typeEl) {
            typeEl.value = String(preset.id || preset.type || '');
        }
        if (el.querySelector('#tm-obj-image') && preset.imageKey !== undefined) el.querySelector('#tm-obj-image').value = preset.imageKey;
        if (el.querySelector('#tm-obj-radius') && preset.radius !== undefined) el.querySelector('#tm-obj-radius').value = String(preset.radius);
        if (el.querySelector('#tm-obj-color') && preset.color !== undefined) el.querySelector('#tm-obj-color').value = preset.color;
        if (el.querySelector('#tm-obj-intensity') && preset.intensity !== undefined) el.querySelector('#tm-obj-intensity').value = String(preset.intensity);
        if (el.querySelector('#tm-obj-name') && (!el.querySelector('#tm-obj-name').value || el.querySelector('#tm-obj-name').value === obj.name)) {
            el.querySelector('#tm-obj-name').value = preset.name || preset.label || obj.name || '';
        }
    });

    el.querySelector('#tm-obj-apply')?.addEventListener('click', () => {
        obj.name = el.querySelector('#tm-obj-name')?.value?.trim() || obj.name || obj.type || 'Object';
        const nextType = el.querySelector('#tm-obj-kind')?.value;
        if (nextType) applyLayerTypeSelection(obj, nextType);
        const explicitType = el.querySelector('#tm-obj-type')?.value?.trim();
        if (explicitType) obj.type = explicitType;
        const nextTileX = Number(el.querySelector('#tm-obj-tilex')?.value);
        const nextTileY = Number(el.querySelector('#tm-obj-tiley')?.value);
        if (Number.isFinite(nextTileX)) obj.x = Math.round(nextTileX) * currentMap.tilewidth;
        if (Number.isFinite(nextTileY)) obj.y = Math.round(nextTileY) * currentMap.tileheight;
        const nextRotation = Number(el.querySelector('#tm-obj-rotation')?.value);
        if (activeLayer === 'doors') {
            applyDoorRotationGeometry(obj, nextRotation);
            activeObjectRotationByLayer.doors = obj.rotation;
        } else {
            obj.rotation = Number.isFinite(nextRotation) ? nextRotation : (Number(obj.rotation) || 0);
            obj.width = Math.max(1, Number(el.querySelector('#tm-obj-w')?.value) || currentMap.tilewidth);
            obj.height = Math.max(1, Number(el.querySelector('#tm-obj-h')?.value) || currentMap.tileheight);
        }

        if (activeLayer === 'props' || activeLayer === 'lights') {
            setObjectProperty(obj, 'imageKey', 'string', el.querySelector('#tm-obj-image')?.value?.trim() || '');
            const defaultRadius = activeLayer === 'lights' ? 150 : (isZonePropType(obj.type) ? 128 : 18);
            setObjectProperty(obj, 'radius', 'float', Number(el.querySelector('#tm-obj-radius')?.value) || defaultRadius);
        }
        if (activeLayer === 'lights') {
            setObjectProperty(obj, 'color', 'string', el.querySelector('#tm-obj-color')?.value?.trim() || '#ffeebb');
            setObjectProperty(obj, 'intensity', 'float', Number(el.querySelector('#tm-obj-intensity')?.value) || 1);
        }
        if (activeLayer === 'markers' || activeLayer === 'story') {
            setObjectProperty(obj, 'marker_type', 'string', el.querySelector('#tm-obj-marker-type')?.value?.trim() || '');
        }
        if (el.querySelector('#tm-obj-spawn-count')) {
            setObjectProperty(obj, 'count', 'int', Number(el.querySelector('#tm-obj-spawn-count')?.value) || 4);
        }
        markDirtyAndRefresh();
    });
    el.querySelector('#tm-obj-duplicate')?.addEventListener('click', () => {
        const clone = JSON.parse(JSON.stringify(obj));
        clone.id = Date.now() + Math.floor(Math.random() * 1000);
        clone.x += currentMap.tilewidth;
        const objectLayer = currentMap.layers.find((entry) => entry.name === activeLayer);
        objectLayer?.objects?.push(clone);
        selectedObjects = [clone.id];
        pushUndo({ type: 'objectAdd', layerName: activeLayer, object: JSON.parse(JSON.stringify(clone)) });
        markDirtyAndRefresh();
    });
    el.querySelector('#tm-obj-delete')?.addEventListener('click', deleteSelectedObjects);
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
                        ctx.fillStyle = tileDef.color;
                        ctx.fillRect(x * tw, y * th, tw, th);
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

                if (layerName === 'doors' || obj.type === 'door') {
                    drawDoorPreviewShape(ctx, obj, color, { lineWidth: 2 / zoom, fillAlpha: 0.18 });
                } else if (layerName === 'props' && isZonePropType(obj.type)) {
                    drawZonePropPreviewShape(ctx, obj, {
                        lineWidth: 2 / zoom,
                        fillAlpha: 0.14,
                        fontSize: 11 / zoom,
                    });
                } else {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2 / zoom;
                    ctx.strokeRect(ox, oy, ow, oh);
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = color;
                    ctx.fillRect(ox, oy, ow, oh);
                    ctx.globalAlpha = 1;
                }

                if (zoom > 0.25 && !(layerName === 'props' && isZonePropType(obj.type))) {
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

    // Collision/walkability overlay
    if (showCollision) {
        const terrainLayer = currentMap.layers.find(l => l.name === 'terrain');
        const doorsLayer = currentMap.layers.find(l => l.name === 'doors');
        if (terrainLayer?.data) {
            for (let y = 0; y < mh; y++) {
                for (let x = 0; x < mw; x++) {
                    const val = terrainLayer.data[y * mw + x];
                    if (val === 1) {
                        ctx.fillStyle = 'rgba(79, 219, 142, 0.15)';
                    } else {
                        ctx.fillStyle = 'rgba(255, 80, 80, 0.15)';
                    }
                    ctx.fillRect(x * tw, y * th, tw, th);
                }
            }
        }
        if (doorsLayer?.objects) {
            ctx.strokeStyle = 'rgba(255, 170, 0, 0.6)';
            ctx.lineWidth = 2 / zoom;
            for (const obj of doorsLayer.objects) {
                ctx.fillStyle = 'rgba(255, 170, 0, 0.2)';
                ctx.fillRect(obj.x, obj.y, obj.width || tw, obj.height || th);
                ctx.strokeRect(obj.x, obj.y, obj.width || tw, obj.height || th);
            }
        }
    }

    // Map border
    ctx.strokeStyle = 'rgba(74,164,216,0.4)';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, mw * tw, mh * th);

    // Brush size preview on hover
    if (hoverTile && currentMap && (activeTool === 'paint' || activeTool === 'erase' || activeTool === 'fill')) {
        if (activeLayer === 'doors' && activeTool === 'paint') {
            const rotation = normalizeRightAngleRotation(activeObjectRotationByLayer.doors || 0, 0);
            const vertical = isDoorVerticalRotation(rotation);
            const doorDef = (TILE_VALUES.doors || []).find((entry) => entry.value === activeBrush);
            const previewDoor = {
                x: hoverTile.tx * tw,
                y: hoverTile.ty * th,
                width: vertical ? tw : tw * 2,
                height: vertical ? th * 2 : th,
                rotation,
                properties: [
                    { name: 'orientation', type: 'string', value: vertical ? 'vertical' : 'horizontal' },
                ],
            };
            drawDoorPreviewShape(ctx, previewDoor, doorDef?.color || 'rgba(74,164,216,0.85)', {
                lineWidth: 2 / zoom,
                fillAlpha: 0.08,
                dash: [6 / zoom, 4 / zoom],
            });
        } else if (activeLayer === 'props' && activeTool === 'paint' && isZonePropType(getActiveObjectPreset(activeLayer)?.type)) {
            const preset = getActiveObjectPreset(activeLayer);
            const previewZone = {
                x: hoverTile.tx * tw,
                y: hoverTile.ty * th,
                width: tw,
                height: th,
                type: preset?.type,
                properties: [
                    { name: 'radius', type: 'float', value: Number(preset?.radius) || 128 },
                ],
            };
            drawZonePropPreviewShape(ctx, previewZone, {
                lineWidth: 2 / zoom,
                fillAlpha: 0.08,
                dash: [6 / zoom, 4 / zoom],
                fontSize: 11 / zoom,
            });
        } else {
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
                if (!obj) continue;
                if (layer.name === 'props' && isZonePropType(obj.type)) {
                    drawZonePropPreviewShape(ctx, obj, {
                        lineWidth: 2 / zoom,
                        fillAlpha: 0.05,
                        fontSize: 11 / zoom,
                    });
                    continue;
                }
                ctx.strokeRect(obj.x, obj.y, obj.width || tw, obj.height || th);
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
    updateProps();
    renderInspector();
}

function paintTile(tx, ty) {
    if (layerLocked[activeLayer]) { API.toast(`Layer "${LAYER_LABELS[activeLayer]}" is locked`, 'warn'); return; }
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
    const doorRotation = normalizeRightAngleRotation(activeObjectRotationByLayer.doors || 0, 0);
    const doorVertical = isDoorVerticalRotation(doorRotation);
    const placementPreset = getActiveObjectPreset(activeLayer);
    const candidateWidth = activeLayer === 'doors'
        ? (doorVertical ? tw : tw * 2)
        : ((placementPreset?.widthTiles || 1) * tw);
    const candidateHeight = activeLayer === 'doors'
        ? (doorVertical ? th * 2 : th)
        : ((placementPreset?.heightTiles || 1) * th);

    // Don't place if overlapping an existing object
    const existing = layer.objects.find(o => {
        const oR = o.x + (o.width || tw), oB = o.y + (o.height || th);
        return x < oR && (x + candidateWidth) > o.x && y < oB && (y + candidateHeight) > o.y;
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
            width: candidateWidth, height: candidateHeight,
            rotation: doorRotation, visible: true,
            properties: [
                { name: 'doorType', type: 'string', value: dtype },
                { name: 'initialState', type: 'string', value: 'closed' },
                { name: 'orientation', type: 'string', value: doorVertical ? 'vertical' : 'horizontal' },
                { name: 'doorValue', type: 'int', value: activeBrush },
            ],
        };
        applyDoorRotationGeometry(obj, doorRotation);
    } else if (activeLayer === 'markers') {
        const markerTypes = { 1:'spawn', 2:'extract', 3:'terminal', 4:'security_card',
            5:'alien_spawn', 6:'warning_strobe', 7:'vent_point', 8:'egg_cluster' };
        const mtype = markerTypes[activeBrush] || 'spawn';
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: mtype, type: mtype,
            x, y, width: tw, height: th,
            rotation: 0, visible: true,
            // marker_type: story trigger ID — must match a Story editor Start node markerId
            properties: [
                { name: 'markerValue', type: 'int', value: activeBrush },
                { name: 'marker_type', type: 'string', value: '' },
                ...(mtype === 'alien_spawn' ? [{ name: 'count', type: 'int', value: 4 }] : []),
            ],
        };
    } else if (activeLayer === 'story') {
        const storyTypes = { 1: 'story_trigger', 2: 'objective', 3: 'action_zone', 4: 'condition' };
        const stype = storyTypes[activeBrush] || 'story_trigger';
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: stype, type: stype,
            x, y, width: tw, height: th,
            rotation: 0, visible: true,
            properties: [
                { name: 'marker_type', type: 'string', value: '' },
                { name: 'storyValue',  type: 'int', value: activeBrush },
            ],
        };
    } else {
        const preset = getActiveObjectPreset(activeLayer);
        obj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: preset?.name || (activeLayer === 'lights' ? 'Light' : 'Prop'),
            type: preset?.type || (activeLayer === 'lights' ? 'spot' : 'prop'),
            x, y,
            width: candidateWidth,
            height: candidateHeight,
            rotation: 0,
            visible: true,
            properties: [],
        };
        if (preset?.imageKey !== undefined) setObjectProperty(obj, 'imageKey', 'string', preset.imageKey);
        if (preset?.radius !== undefined) setObjectProperty(obj, 'radius', 'float', preset.radius);
        if (preset?.color !== undefined) setObjectProperty(obj, 'color', 'string', preset.color);
        if (preset?.intensity !== undefined) setObjectProperty(obj, 'intensity', 'float', preset.intensity);
    }

    layer.objects.push(obj);
    selectedTiles = [];
    selectedObjects = [obj.id];
    pushUndo({ type: 'objectAdd', layerName: activeLayer, object: JSON.parse(JSON.stringify(obj)) });
    dirty = true; API.setDirty(true); updateProps(); renderInspector(); draw();
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

    if (activeTool === 'pan' || e.button === 1 || spaceHeld) {
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        viewStartX = viewX; viewStartY = viewY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (!currentMap) return;
    const tile = screenToTile(sx, sy);
    if (!tile) return;

    // Alt+click eyedropper: pick tile value or object preset
    if (e.altKey && e.button === 0) {
        eyedropperPickAt(tile);
        return;
    }

    if (e.button === 2) {
        // Right-click: select object for inspector editing on object layers
        const rlayer = currentMap.layers.find(l => l.name === activeLayer);
        if (rlayer && rlayer.type === 'objectgroup') {
            showObjectContextMenu(e, tile);
        }
        return;
    }

    if (activeTool === 'select') {
        const layer = currentMap.layers.find((entry) => entry.name === activeLayer);
        if (layer?.type === 'objectgroup') {
            const hit = findObjectAtWorld(tile.mx, tile.my, layer);
            if (hit) {
                if (e.shiftKey) {
                    if (selectedObjects.includes(hit.id)) selectedObjects = selectedObjects.filter((id) => id !== hit.id);
                    else selectedObjects = [...selectedObjects, hit.id];
                } else {
                    selectedObjects = [hit.id];
                }
                selectedTiles = [];
                objectDragState = {
                    layerName: activeLayer,
                    startMx: tile.mx,
                    startMy: tile.my,
                    before: selectedObjects.map((id) => {
                        const obj = layer.objects.find((entry) => entry.id === id);
                        return obj ? { id: obj.id, x: obj.x, y: obj.y } : null;
                    }).filter(Boolean),
                };
            } else if (!e.shiftKey) {
                selectedObjects = [];
            }
            updateProps();
            renderInspector();
            draw();
            return;
        }
        selectedTiles = [{ x: tile.tx, y: tile.ty, layer: activeLayer }];
        selectedObjects = [];
        updateProps();
        renderInspector();
        draw();
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

    if (objectDragState && currentMap) {
        const tile = screenToTile(sx, sy);
        if (tile) {
            const dx = Math.round((tile.mx - objectDragState.startMx) / currentMap.tilewidth) * currentMap.tilewidth;
            const dy = Math.round((tile.my - objectDragState.startMy) / currentMap.tileheight) * currentMap.tileheight;
            const layer = currentMap.layers.find((entry) => entry.name === objectDragState.layerName);
            for (const before of objectDragState.before) {
                const obj = layer?.objects?.find((entry) => entry.id === before.id);
                if (!obj) continue;
                obj.x = before.x + dx;
                obj.y = before.y + dy;
            }
            updateProps();
            draw();
        }
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
    if (objectDragState) {
        const layer = currentMap?.layers?.find((entry) => entry.name === objectDragState.layerName);
        const after = objectDragState.before.map((before) => {
            const obj = layer?.objects?.find((entry) => entry.id === before.id);
            return obj ? { id: obj.id, x: obj.x, y: obj.y } : before;
        });
        const moved = after.some((entry, index) => entry.x !== objectDragState.before[index]?.x || entry.y !== objectDragState.before[index]?.y);
        if (moved) {
            pushUndo({ type: 'objectMove', layerName: objectDragState.layerName, before: objectDragState.before, after });
            dirty = true;
            API.setDirty(true);
            updateProps();
            renderInspector();
        }
        objectDragState = null;
    }
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

    // Ctrl+S save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveMap();
        return;
    }

    // Ctrl+C copy
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
        return;
    }

    // Ctrl+V paste
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
    }

    // Space for temporary pan
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!spaceHeld) {
            spaceHeld = true;
            canvas.style.cursor = 'grab';
        }
        return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjects.length > 0) {
        e.preventDefault();
        deleteSelectedObjects();
        return;
    }

    if (selectedObjects.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        const tw = currentMap?.tilewidth || 64;
        const th = currentMap?.tileheight || 64;
        const selected = getSelectedLayerObjects();
        selected.forEach((obj) => {
            obj.x += dx * tw;
            obj.y += dy * th;
        });
        markDirtyAndRefresh();
        return;
    }

    if (selectedObjects.length > 0 && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        const selected = getSelectedLayerObjects();
        selected.forEach((obj) => {
            const nextRotation = normalizeRightAngleRotation((Number(obj.rotation) || 0) + 90, 0);
            if (activeLayer === 'doors') {
                applyDoorRotationGeometry(obj, nextRotation);
                activeObjectRotationByLayer.doors = nextRotation;
            } else {
                obj.rotation = nextRotation;
            }
        });
        markDirtyAndRefresh();
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'p': setTool('paint'); break;
        case 'e': setTool('erase'); break;
        case 'f': setTool('fill'); break;
        case 's': if (!e.ctrlKey && !e.metaKey) setTool('select'); break;
        case 'g': showGrid = !showGrid; document.getElementById('tm-grid').checked = showGrid; draw(); break;
        case 'i': eyedropperPick(); break;
    }
}

function onKeyUp(e) {
    if (e.code === 'Space' || e.key === ' ') {
        spaceHeld = false;
        canvas.style.cursor = activeTool === 'pan' ? 'grab' : (activeTool === 'paint' || activeTool === 'erase' || activeTool === 'fill') ? 'crosshair' : 'default';
    }
}

// ── Object layers ──────────────────────────────────────────────────────────
function findObjectAtWorld(mx, my, layer = null) {
    const targetLayer = layer || currentMap?.layers.find((entry) => entry.name === activeLayer);
    if (!targetLayer || targetLayer.type !== 'objectgroup') return null;
    const objects = Array.isArray(targetLayer.objects) ? targetLayer.objects : [];
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        const width = obj.width || currentMap?.tilewidth || 64;
        const height = obj.height || currentMap?.tileheight || 64;
        if (targetLayer.name === 'props' && isZonePropType(obj.type)) {
            const radius = getZoneRadiusValue(obj, 128);
            const centerX = obj.x + width * 0.5;
            const centerY = obj.y + height * 0.5;
            if (Math.hypot(mx - centerX, my - centerY) <= radius) return obj;
            continue;
        }
        if (mx >= obj.x && mx <= obj.x + width && my >= obj.y && my <= obj.y + height) return obj;
    }
    return null;
}

function addObjectAtCenter() {
    if (!currentMap) return;
    const layer = currentMap.layers.find((entry) => entry.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup') return;

    const cx = (canvas.width / 2 - viewX) / zoom;
    const cy = (canvas.height / 2 - viewY) / zoom;
    const tx = Math.max(0, Math.min(currentMap.width - 1, Math.floor(cx / currentMap.tilewidth)));
    const ty = Math.max(0, Math.min(currentMap.height - 1, Math.floor(cy / currentMap.tileheight)));
    placeObjectAtTile(tx, ty, layer);
}

function showObjectContextMenu(e, tile) {
    const layer = currentMap.layers.find((entry) => entry.name === activeLayer);
    if (!layer || layer.type !== 'objectgroup') return;

    const obj = findObjectAtWorld(tile.mx, tile.my, layer);
    if (!obj) return;

    selectedTiles = [];
    selectedObjects = [obj.id];
    setTool('select');
    updateProps();
    renderInspector();
    draw();
    API.toast(`Selected ${obj.name || obj.type || 'object'} for inspector editing`, 'info');
}

// ── Save / Rebuild ─────────────────────────────────────────────────────────
async function saveMap() {
    if (!currentMap || !currentMapName) return;

    // Validation warnings (non-blocking)
    const warnings = validateMap(currentMap);
    if (warnings.length) {
        const proceed = confirm(`Map has ${warnings.length} warning(s):\n\n• ${warnings.join('\n• ')}\n\nSave anyway?`);
        if (!proceed) return;
    }

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
    } else if (entry.type === 'objectMove') {
        const positions = isUndo ? entry.before : entry.after;
        for (const pos of positions || []) {
            const obj = layer.objects.find((o) => o.id === pos.id);
            if (!obj) continue;
            obj.x = pos.x;
            obj.y = pos.y;
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
    if (layerLocked[activeLayer]) { API.toast(`Layer "${LAYER_LABELS[activeLayer]}" is locked`, 'warn'); return; }
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
            nextlayerid: 7,
            nextobjectid: 1,
            layers: [
                { id: 1, name: 'terrain', type: 'tilelayer', data: new Array(w * h).fill(2), width: w, height: h, visible: true, opacity: 1, x: 0, y: 0 },
                { id: 2, name: 'doors',   type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 3, name: 'markers', type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 4, name: 'props',   type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 5, name: 'lights',  type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
                { id: 6, name: 'story',   type: 'objectgroup', objects: [], visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown' },
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

// ── Eyedropper ──────────────────────────────────────────────────────────────
function eyedropperPick() {
    if (!currentMap || !hoverTile) return;
    eyedropperPickAt(hoverTile);
}

function eyedropperPickAt(tile) {
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer) return;

    if (layer.type === 'tilelayer') {
        const idx = tile.ty * currentMap.width + tile.tx;
        const val = layer.data?.[idx] ?? 0;
        activeBrush = val;
        renderPalette();
        renderInspector();
        setTool('paint');
        API.toast(`Picked: ${(TILE_VALUES[activeLayer] || []).find(t => t.value === val)?.label || val}`, 'info');
    } else if (layer.type === 'objectgroup') {
        const hit = findObjectAtWorld(tile.mx, tile.my, layer);
        if (hit) {
            const presets = getObjectPresetOptions(activeLayer);
            const match = presets.find(p => p.type === hit.type || p.id === hit.type);
            if (match) {
                activeObjectPresetByLayer[activeLayer] = String(match.id || match.type);
                renderPalette();
                renderInspector();
            }
            setTool('paint');
            API.toast(`Picked: ${hit.name || hit.type}`, 'info');
        }
    }
}

// ── Copy/Paste ──────────────────────────────────────────────────────────────
function copySelection() {
    if (!currentMap) return;
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer) return;

    if (layer.type === 'tilelayer' && selectedTiles.length > 0) {
        const minX = Math.min(...selectedTiles.map(t => t.x));
        const minY = Math.min(...selectedTiles.map(t => t.y));
        const tiles = selectedTiles.map(t => ({
            dx: t.x - minX,
            dy: t.y - minY,
            value: layer.data[t.y * currentMap.width + t.x] ?? 0,
        }));
        clipboard = { type: 'tiles', layerName: activeLayer, data: tiles };
        API.toast(`Copied ${tiles.length} tile(s)`, 'info');
    } else if (layer.type === 'objectgroup' && selectedObjects.length > 0) {
        const objects = [];
        const allObjs = selectedObjects.map(id => layer.objects.find(o => o.id === id)).filter(Boolean);
        const minX = Math.min(...allObjs.map(o => o.x));
        const minY = Math.min(...allObjs.map(o => o.y));
        for (const obj of allObjs) {
            objects.push({
                ...JSON.parse(JSON.stringify(obj)),
                dx: obj.x - minX,
                dy: obj.y - minY,
            });
        }
        clipboard = { type: 'objects', layerName: activeLayer, data: objects };
        API.toast(`Copied ${objects.length} object(s)`, 'info');
    }
}

function pasteClipboard() {
    if (!currentMap || !clipboard || !clipboard.data.length) return;
    if (layerLocked[activeLayer]) { API.toast(`Layer "${LAYER_LABELS[activeLayer]}" is locked`, 'warn'); return; }
    const layer = currentMap.layers.find(l => l.name === activeLayer);
    if (!layer) return;

    // Paste at center of viewport
    const wrap = document.getElementById('tm-canvas-wrap');
    const centerSx = wrap.clientWidth / 2;
    const centerSy = wrap.clientHeight / 2;
    const centerTile = screenToTile(centerSx, centerSy);
    if (!centerTile) return;

    if (clipboard.type === 'tiles' && layer.type === 'tilelayer') {
        const changes = [];
        for (const t of clipboard.data) {
            const tx = centerTile.tx + t.dx;
            const ty = centerTile.ty + t.dy;
            if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) continue;
            const idx = ty * currentMap.width + tx;
            if (layer.data[idx] !== t.value) {
                changes.push({ idx, oldVal: layer.data[idx], newVal: t.value });
                layer.data[idx] = t.value;
            }
        }
        if (changes.length) {
            pushUndo({ type: 'tiles', layerName: activeLayer, changes });
            dirty = true; API.setDirty(true);
        }
        API.toast(`Pasted ${changes.length} tile(s)`, 'info');
    } else if (clipboard.type === 'objects' && layer.type === 'objectgroup') {
        const tw = currentMap.tilewidth, th = currentMap.tileheight;
        const baseX = centerTile.tx * tw, baseY = centerTile.ty * th;
        selectedObjects = [];
        for (const src of clipboard.data) {
            const newObj = JSON.parse(JSON.stringify(src));
            newObj.id = Date.now() + Math.floor(Math.random() * 10000);
            newObj.x = baseX + (src.dx || 0);
            newObj.y = baseY + (src.dy || 0);
            delete newObj.dx;
            delete newObj.dy;
            layer.objects.push(newObj);
            pushUndo({ type: 'objectAdd', layerName: activeLayer, object: JSON.parse(JSON.stringify(newObj)) });
            selectedObjects.push(newObj.id);
        }
        dirty = true; API.setDirty(true);
        API.toast(`Pasted ${clipboard.data.length} object(s)`, 'info');
    }
    draw();
    renderInspector();
    updateProps();
}

// ── Map Validation ──────────────────────────────────────────────────────────
function validateMap(map) {
    const warnings = [];
    if (!map) return warnings;

    const terrainLayer = map.layers.find(l => l.name === 'terrain');
    const markersLayer = map.layers.find(l => l.name === 'markers');
    const doorsLayer = map.layers.find(l => l.name === 'doors');

    // Check terrain has some floor tiles
    if (terrainLayer?.data) {
        const floorCount = terrainLayer.data.filter(v => v === 1).length;
        if (floorCount === 0) warnings.push('No floor tiles painted — map has no walkable area');
    }

    // Check required markers
    if (markersLayer?.objects) {
        const hasSpawn = markersLayer.objects.some(o => o.type === 'spawn' || getObjectProperty(o, 'markerValue', 0) === 1);
        const hasExtract = markersLayer.objects.some(o => o.type === 'extract' || getObjectProperty(o, 'markerValue', 0) === 2);
        const hasAlienSpawn = markersLayer.objects.some(o => o.type === 'alien_spawn' || getObjectProperty(o, 'markerValue', 0) === 5);
        if (!hasSpawn) warnings.push('No player spawn point — add a Spawn marker');
        if (!hasExtract) warnings.push('No extraction point — add an Extract marker');
        if (!hasAlienSpawn) warnings.push('No alien spawn points — add at least one Alien Spawn marker');
    } else {
        warnings.push('Markers layer missing — no spawn or extraction points');
    }

    // Check objects within bounds
    const mapPxW = map.width * map.tilewidth;
    const mapPxH = map.height * map.tileheight;
    for (const layer of map.layers) {
        if (layer.type !== 'objectgroup') continue;
        for (const obj of layer.objects || []) {
            if (obj.x < 0 || obj.y < 0 || obj.x >= mapPxW || obj.y >= mapPxH) {
                warnings.push(`Object "${obj.name || obj.type}" on ${layer.name} is out of map bounds`);
                break; // One warning per layer is enough
            }
        }
    }

    // Check duplicate object IDs
    for (const layer of map.layers) {
        if (layer.type !== 'objectgroup') continue;
        const ids = new Set();
        for (const obj of layer.objects || []) {
            if (ids.has(obj.id)) {
                warnings.push(`Duplicate object ID ${obj.id} on ${layer.name} layer`);
                break;
            }
            ids.add(obj.id);
        }
    }

    return warnings;
}

// ── Exports ────────────────────────────────────────────────────────────────
export default {
    render(root) { buildUI(root); },
    async onShow() {
        await Promise.all([loadMapList(), loadSpriteAssetCatalog()]);
        renderLayers();
        renderPalette();
        renderInspector();
        draw();
    },
    onHide() {},
    async save() { if (dirty && currentMap) await saveMap(); },
};
