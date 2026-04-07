import {
    clamp,
    colorToCss,
    ensureExtension,
    hexToRgba,
    loadImage,
    readFileAsText,
    sanitizeAssetFilename,
} from './assetUtils.js';

const SVG_CATEGORIES = ['corpse', 'acid', 'debris', 'particles'];
const DEFAULT_GRID_SIZE = 32;
const ELLIPSE_KAPPA = 0.5522847498;
const SVG_USAGE_OPTIONS = [
    { value: 'generic-corpse', label: 'Generic Gibs', category: 'corpse', target: 'generic' },
    { value: 'alien-warrior-death', label: 'Alien Warrior Death', category: 'corpse', target: 'alien_warrior' },
    { value: 'alien-warrior-damage', label: 'Alien Warrior Damage', category: 'particles', target: 'alien_warrior' },
    { value: 'facehugger-death', label: 'Facehugger Death', category: 'corpse', target: 'facehugger' },
    { value: 'facehugger-damage', label: 'Facehugger Damage', category: 'particles', target: 'facehugger' },
    { value: 'egg-death', label: 'Egg Death', category: 'corpse', target: 'egg' },
    { value: 'egg-damage', label: 'Egg Damage', category: 'particles', target: 'egg' },
    { value: 'drone-death', label: 'Drone Death', category: 'corpse', target: 'drone' },
    { value: 'drone-damage', label: 'Drone Damage', category: 'particles', target: 'drone' },
    { value: 'queen-death', label: 'Queen Death', category: 'corpse', target: 'queen' },
    { value: 'queen-damage', label: 'Queen Damage', category: 'particles', target: 'queen' },
    { value: 'acid-floor-damage', label: 'Acid Damage To Floor', category: 'acid', target: 'floor' },
    { value: 'acid-splash', label: 'Acid Splashes', category: 'acid', target: 'generic' },
];

function getUsageOption(value) {
    return SVG_USAGE_OPTIONS.find((option) => option.value === value) || SVG_USAGE_OPTIONS[0];
}

function createDefaultMetadata(category) {
    const option = SVG_USAGE_OPTIONS.find((entry) => entry.category === category) || SVG_USAGE_OPTIONS[0];
    return {
        usage: option.value,
        target: option.target,
        notes: '',
    };
}

function uid(prefix = 'svg') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function roundCoord(value) {
    return Math.round(value * 100) / 100;
}

function pointToString(point) {
    return `${roundCoord(point.x)} ${roundCoord(point.y)}`;
}

function clonePoint(point) {
    return {
        x: Number(point.x) || 0,
        y: Number(point.y) || 0,
        handleIn: point.handleIn ? { x: Number(point.handleIn.x) || 0, y: Number(point.handleIn.y) || 0 } : null,
        handleOut: point.handleOut ? { x: Number(point.handleOut.x) || 0, y: Number(point.handleOut.y) || 0 } : null,
    };
}

function cloneShape(shape) {
    return {
        ...shape,
        id: uid('shape'),
        points: Array.isArray(shape.points) ? shape.points.map(clonePoint) : [],
    };
}

function createBlankShape(name = 'Shape 1') {
    return {
        id: uid('shape'),
        name,
        fill: '#48d89a',
        stroke: '#d0dce8',
        strokeWidth: 2,
        opacity: 1,
        closed: true,
        points: [],
    };
}

function createEmptyDocument(category, marineRef) {
    const baseWidth = Math.max(256, Number(marineRef?.frameWidth) || 0, Number(marineRef?.frameHeight) || 0);
    return {
        filename: 'new_shape.svg',
        category,
        width: baseWidth,
        height: baseWidth,
        shapes: [],
        adjustments: {
            brightness: 0,
            contrast: 0,
            overlayColor: '#4aa4d8',
            overlayAlpha: 0,
        },
        metadata: createDefaultMetadata(category),
    };
}

function getShapeById(doc, shapeId) {
    return doc.shapes.find((shape) => shape.id === shapeId) || null;
}

function computeShapeBounds(shape) {
    const values = [];
    for (const point of shape.points || []) {
        values.push([point.x, point.y]);
        if (point.handleIn) values.push([point.handleIn.x, point.handleIn.y]);
        if (point.handleOut) values.push([point.handleOut.x, point.handleOut.y]);
    }
    if (!values.length) return null;
    const xs = values.map(([x]) => x);
    const ys = values.map(([, y]) => y);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

function computeDocumentBounds(doc) {
    const bounds = doc.shapes.map(computeShapeBounds).filter(Boolean);
    if (!bounds.length) return null;
    return {
        minX: Math.min(...bounds.map((entry) => entry.minX)),
        maxX: Math.max(...bounds.map((entry) => entry.maxX)),
        minY: Math.min(...bounds.map((entry) => entry.minY)),
        maxY: Math.max(...bounds.map((entry) => entry.maxY)),
    };
}

function serializeShape(shape, isSelected) {
    const pathData = shapeToPathData(shape);
    if (!pathData) return '';
    const classes = ['svg-stage-path'];
    if (isSelected) classes.push('is-selected');
    return `<path class="${classes.join(' ')}" data-shape-id="${shape.id}" d="${pathData}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}"></path>`;
}

function shapeToPathData(shape) {
    const points = Array.isArray(shape.points) ? shape.points : [];
    if (!points.length) return '';

    let pathData = `M ${pointToString(points[0])}`;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous.handleOut || current.handleIn) {
            pathData += ` C ${pointToString(previous.handleOut || previous)} ${pointToString(current.handleIn || current)} ${pointToString(current)}`;
        } else {
            pathData += ` L ${pointToString(current)}`;
        }
    }

    if (shape.closed && points.length > 1) {
        const last = points[points.length - 1];
        const first = points[0];
        if (last.handleOut || first.handleIn) {
            pathData += ` C ${pointToString(last.handleOut || last)} ${pointToString(first.handleIn || first)} ${pointToString(first)}`;
        }
        pathData += ' Z';
    }

    return pathData;
}

function svgDocumentToText(doc) {
    const width = Math.max(1, Math.round(doc.width));
    const height = Math.max(1, Math.round(doc.height));
    const paths = doc.shapes.map((shape) => {
        const d = shapeToPathData(shape);
        if (!d) return '';
        const lineCap = shape.closed ? 'round' : 'round';
        return `  <path d="${d}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" stroke-linejoin="round" stroke-linecap="${lineCap}" opacity="${shape.opacity}"/>`;
    }).filter(Boolean).join('\n');

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
        paths,
        '</svg>',
    ].join('\n');
}

function parseNumericList(value) {
    return String(value || '')
        .trim()
        .split(/[\s,]+/)
        .map((token) => Number(token))
        .filter((token) => Number.isFinite(token));
}

function shapeFromPolygonPoints(points, options = {}) {
    const shape = createBlankShape(options.name);
    shape.points = points.map(([x, y]) => ({ x, y, handleIn: null, handleOut: null }));
    shape.fill = options.fill || shape.fill;
    shape.stroke = options.stroke || shape.stroke;
    shape.strokeWidth = Number(options.strokeWidth) || shape.strokeWidth;
    shape.opacity = Number.isFinite(options.opacity) ? options.opacity : shape.opacity;
    shape.closed = options.closed !== false;
    return shape;
}

function shapeFromRect(element, style) {
    const x = Number(element.getAttribute('x') || 0);
    const y = Number(element.getAttribute('y') || 0);
    const width = Number(element.getAttribute('width') || 0);
    const height = Number(element.getAttribute('height') || 0);
    return shapeFromPolygonPoints([
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ], style);
}

function shapeFromLine(element, style) {
    const x1 = Number(element.getAttribute('x1') || 0);
    const y1 = Number(element.getAttribute('y1') || 0);
    const x2 = Number(element.getAttribute('x2') || 0);
    const y2 = Number(element.getAttribute('y2') || 0);
    return shapeFromPolygonPoints([
        [x1, y1],
        [x2, y2],
    ], { ...style, closed: false });
}

function shapeFromEllipse(cx, cy, rx, ry, style) {
    const shape = createBlankShape(style.name);
    shape.fill = style.fill || shape.fill;
    shape.stroke = style.stroke || shape.stroke;
    shape.strokeWidth = Number(style.strokeWidth) || shape.strokeWidth;
    shape.opacity = Number.isFinite(style.opacity) ? style.opacity : shape.opacity;
    shape.closed = true;
    shape.points = [
        {
            x: cx,
            y: cy - ry,
            handleIn: { x: cx - (rx * ELLIPSE_KAPPA), y: cy - ry },
            handleOut: { x: cx + (rx * ELLIPSE_KAPPA), y: cy - ry },
        },
        {
            x: cx + rx,
            y: cy,
            handleIn: { x: cx + rx, y: cy - (ry * ELLIPSE_KAPPA) },
            handleOut: { x: cx + rx, y: cy + (ry * ELLIPSE_KAPPA) },
        },
        {
            x: cx,
            y: cy + ry,
            handleIn: { x: cx + (rx * ELLIPSE_KAPPA), y: cy + ry },
            handleOut: { x: cx - (rx * ELLIPSE_KAPPA), y: cy + ry },
        },
        {
            x: cx - rx,
            y: cy,
            handleIn: { x: cx - rx, y: cy + (ry * ELLIPSE_KAPPA) },
            handleOut: { x: cx - rx, y: cy - (ry * ELLIPSE_KAPPA) },
        },
    ];
    return shape;
}

function readShapeStyle(element, fallbackName) {
    return {
        name: fallbackName,
        fill: element.getAttribute('fill') || '#48d89a',
        stroke: element.getAttribute('stroke') || '#d0dce8',
        strokeWidth: Number(element.getAttribute('stroke-width') || 2),
        opacity: Number(element.getAttribute('opacity') || 1),
    };
}

function parsePathData(pathData) {
    if (/[QqSsTtAa]/.test(pathData)) {
        throw new Error('Unsupported SVG path commands. Use move, line, horizontal, vertical, cubic, and close commands only.');
    }

    const tokens = String(pathData || '').match(/[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const points = [];
    let index = 0;
    let command = 'M';
    let current = { x: 0, y: 0 };
    let startPoint = null;
    let closed = false;

    function nextNumber() {
        const token = tokens[index += 1];
        return Number(token);
    }

    while (index < tokens.length) {
        const token = tokens[index];
        if (/^[A-Za-z]$/.test(token)) {
            command = token;
            index += 1;
        }

        switch (command) {
        case 'M':
        case 'm': {
            const relative = command === 'm';
            const x = Number(tokens[index]);
            const y = Number(tokens[index + 1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) break;
            const point = {
                x: relative ? current.x + x : x,
                y: relative ? current.y + y : y,
                handleIn: null,
                handleOut: null,
            };
            points.push(point);
            current = { x: point.x, y: point.y };
            startPoint = startPoint || point;
            index += 2;
            command = command === 'm' ? 'l' : 'L';
            break;
        }
        case 'L':
        case 'l': {
            const relative = command === 'l';
            const x = Number(tokens[index]);
            const y = Number(tokens[index + 1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) break;
            const point = {
                x: relative ? current.x + x : x,
                y: relative ? current.y + y : y,
                handleIn: null,
                handleOut: null,
            };
            points.push(point);
            current = { x: point.x, y: point.y };
            index += 2;
            break;
        }
        case 'H':
        case 'h': {
            const relative = command === 'h';
            const x = Number(tokens[index]);
            if (!Number.isFinite(x)) break;
            const point = {
                x: relative ? current.x + x : x,
                y: current.y,
                handleIn: null,
                handleOut: null,
            };
            points.push(point);
            current = { x: point.x, y: point.y };
            index += 1;
            break;
        }
        case 'V':
        case 'v': {
            const relative = command === 'v';
            const y = Number(tokens[index]);
            if (!Number.isFinite(y)) break;
            const point = {
                x: current.x,
                y: relative ? current.y + y : y,
                handleIn: null,
                handleOut: null,
            };
            points.push(point);
            current = { x: point.x, y: point.y };
            index += 1;
            break;
        }
        case 'C':
        case 'c': {
            const relative = command === 'c';
            const control1 = { x: Number(tokens[index]), y: Number(tokens[index + 1]) };
            const control2 = { x: Number(tokens[index + 2]), y: Number(tokens[index + 3]) };
            const target = { x: Number(tokens[index + 4]), y: Number(tokens[index + 5]) };
            if (![control1.x, control1.y, control2.x, control2.y, target.x, target.y].every(Number.isFinite)) break;
            const previous = points[points.length - 1];
            if (!previous) break;
            previous.handleOut = {
                x: relative ? current.x + control1.x : control1.x,
                y: relative ? current.y + control1.y : control1.y,
            };
            const point = {
                x: relative ? current.x + target.x : target.x,
                y: relative ? current.y + target.y : target.y,
                handleIn: {
                    x: relative ? current.x + control2.x : control2.x,
                    y: relative ? current.y + control2.y : control2.y,
                },
                handleOut: null,
            };
            points.push(point);
            current = { x: point.x, y: point.y };
            index += 6;
            break;
        }
        case 'Z':
        case 'z':
            closed = true;
            current = startPoint ? { x: startPoint.x, y: startPoint.y } : current;
            break;
        default:
            index += 1;
            break;
        }
    }

    return { points, closed };
}

function importSvgDocument(svgText, fallbackFilename, fallbackCategory) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') {
        throw new Error('Invalid SVG document');
    }

    const viewBoxAttr = svg.getAttribute('viewBox');
    const viewBox = parseNumericList(viewBoxAttr);
    const width = Math.max(1, Number(viewBox[2]) || Number(svg.getAttribute('width')) || 256);
    const height = Math.max(1, Number(viewBox[3]) || Number(svg.getAttribute('height')) || width);
    const shapes = [];

    const elements = [...svg.querySelectorAll('path,polygon,polyline,rect,circle,ellipse,line')];
    elements.forEach((element, index) => {
        const style = readShapeStyle(element, `Shape ${index + 1}`);
        let shape = null;
        switch (element.nodeName.toLowerCase()) {
        case 'path': {
            const parsed = parsePathData(element.getAttribute('d') || '');
            shape = createBlankShape(style.name);
            shape.fill = style.fill;
            shape.stroke = style.stroke;
            shape.strokeWidth = style.strokeWidth;
            shape.opacity = style.opacity;
            shape.closed = parsed.closed;
            shape.points = parsed.points;
            break;
        }
        case 'polygon':
        case 'polyline': {
            const coords = parseNumericList(element.getAttribute('points'));
            const points = [];
            for (let coordIndex = 0; coordIndex < coords.length; coordIndex += 2) {
                points.push([coords[coordIndex], coords[coordIndex + 1]]);
            }
            shape = shapeFromPolygonPoints(points, { ...style, closed: element.nodeName.toLowerCase() === 'polygon' });
            break;
        }
        case 'rect':
            shape = shapeFromRect(element, style);
            break;
        case 'line':
            shape = shapeFromLine(element, style);
            break;
        case 'circle':
            shape = shapeFromEllipse(
                Number(element.getAttribute('cx') || 0),
                Number(element.getAttribute('cy') || 0),
                Number(element.getAttribute('r') || 0),
                Number(element.getAttribute('r') || 0),
                style,
            );
            break;
        case 'ellipse':
            shape = shapeFromEllipse(
                Number(element.getAttribute('cx') || 0),
                Number(element.getAttribute('cy') || 0),
                Number(element.getAttribute('rx') || 0),
                Number(element.getAttribute('ry') || 0),
                style,
            );
            break;
        default:
            break;
        }
        if (shape && shape.points.length) shapes.push(shape);
    });

    return {
        filename: ensureExtension(sanitizeAssetFilename(pathSafeBasename(fallbackFilename), 'imported_shape'), 'svg'),
        category: fallbackCategory,
        width,
        height,
        shapes,
        adjustments: {
            brightness: 0,
            contrast: 0,
            overlayColor: '#4aa4d8',
            overlayAlpha: 0,
        },
        metadata: createDefaultMetadata(fallbackCategory),
    };
}

function pathSafeBasename(filename) {
    return String(filename || '').replace(/\.svg$/i, '');
}

function buildGridMarkup(width, height, gridSize) {
    if (!gridSize) return '';
    const lines = [];
    for (let x = 0; x <= width; x += gridSize) {
        lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" />`);
    }
    for (let y = 0; y <= height; y += gridSize) {
        lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" />`);
    }
    return `<g class="svg-grid-layer">${lines.join('')}</g>`;
}

function createSvgEditor(API) {
    const state = {
        assets: [],
        category: 'corpse',
        doc: createEmptyDocument('corpse'),
        selectedAssetName: null,
        selectedShapeId: null,
        selectedPointIndex: -1,
        selectedHandle: null,
        mode: 'select',
        drawingPoints: [],
        drag: null,
        showMarine: true,
        marineOpacity: 0.22,
        showGrid: true,
        gridSize: DEFAULT_GRID_SIZE,
        scaleFactor: 1,
        dirty: false,
    };

    const refs = {
        sidebarRoot: null,
        mainRoot: null,
        stageSvg: null,
        stageWrap: null,
        tintOverlay: null,
        assetList: null,
        categoryList: null,
        layersList: null,
        stageInfo: null,
        docMeta: null,
        shapeControls: null,
    };

    let marineRef = null;
    let windowEventsBound = false;

    async function ensureMarineReference() {
        if (marineRef) return marineRef;
        const response = await API.apiFetch('/api/sprites/marine-reference');
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'Marine reference not available');
        marineRef = data;
        state.doc = createEmptyDocument(state.category, marineRef);
        return marineRef;
    }

    async function loadAssets() {
        const response = await API.apiFetch('/api/svg-assets');
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'Failed to load SVG assets');
        state.assets = data.assets || [];
        renderSidebar();
    }

    function getVisibleAssets() {
        return state.assets.filter((asset) => asset.category === state.category);
    }

    function syncDocCategoryFromUsage(force = false) {
        const option = getUsageOption(state.doc?.metadata?.usage);
        if (!option) return;
        if (force || !state.doc.category || state.doc.category !== option.category) {
            state.doc.category = option.category;
            state.category = option.category;
        }
        if (!state.doc.metadata.target) state.doc.metadata.target = option.target;
    }

    function markDirty(dirty = true) {
        state.dirty = dirty;
        API.setDirty(dirty);
    }

    function setCategory(category) {
        state.category = category;
        if (state.doc) state.doc.category = category;
        renderSidebar();
    }

    function resetDocument(filename = 'new_shape.svg') {
        state.doc = createEmptyDocument(state.category, marineRef);
        state.doc.filename = ensureExtension(sanitizeAssetFilename(filename.replace(/\.svg$/i, ''), 'new_shape'), 'svg');
        state.selectedShapeId = null;
        state.selectedPointIndex = -1;
        state.selectedHandle = null;
        state.drawingPoints = [];
        state.mode = 'select';
        markDirty(false);
        renderAll();
    }

    function renderSidebar() {
        if (!refs.sidebarRoot) return;
        refs.sidebarRoot.innerHTML = `
            <div class="svg-browser-shell">
                <div class="svg-category-list" id="svg-category-list">
                    ${SVG_CATEGORIES.map((category) => `
                        <button class="btn btn-sm ${state.category === category ? 'btn-primary' : 'btn-secondary'} svg-category-btn" data-category="${category}">${category}</button>
                    `).join('')}
                </div>
                <div class="svg-browser-actions">
                    <button class="btn btn-sm btn-primary" id="svg-new-doc-btn">+ New SVG</button>
                    <button class="btn btn-sm btn-secondary" id="svg-import-btn">Upload SVG</button>
                    <button class="btn btn-sm btn-secondary" id="svg-refresh-btn">↻ Refresh</button>
                    <input type="file" id="svg-import-input" accept=".svg,image/svg+xml" style="display:none;">
                </div>
                <div class="svg-browser-hint">Source SVGs save to /assets/svg/${state.category}/. PNG exports save to /assets/sprites/scaled/svg/${state.category}/.</div>
                <div class="svg-asset-list" id="svg-asset-list">
                    ${getVisibleAssets().length ? getVisibleAssets().map((asset) => `
                        <button class="svg-asset-item ${state.selectedAssetName === asset.name ? 'is-active' : ''}" data-asset-name="${asset.name}">
                            <span class="svg-asset-title">${asset.name}</span>
                            <span class="svg-asset-meta">${asset.width || '?'}×${asset.height || '?'}${asset.rasterPath ? ' • PNG' : ''}${asset.usage ? ` • ${getUsageOption(asset.usage).label}` : ''}</span>
                        </button>
                    `).join('') : '<div class="empty-state"><div class="empty-state-icon">◌</div><div>No SVG assets in this category yet</div></div>'}
                </div>
            </div>
        `;

        refs.categoryList = refs.sidebarRoot.querySelector('#svg-category-list');
        refs.assetList = refs.sidebarRoot.querySelector('#svg-asset-list');

        refs.sidebarRoot.querySelectorAll('.svg-category-btn').forEach((button) => {
            button.addEventListener('click', () => setCategory(button.dataset.category));
        });
        refs.sidebarRoot.querySelector('#svg-new-doc-btn')?.addEventListener('click', () => resetDocument(`${state.category}_shape.svg`));
        refs.sidebarRoot.querySelector('#svg-refresh-btn')?.addEventListener('click', async () => {
            try {
                await loadAssets();
                API.setStatus('SVG asset list refreshed');
            } catch (error) {
                API.toast(error.message, 'error');
            }
        });
        const importInput = refs.sidebarRoot.querySelector('#svg-import-input');
        refs.sidebarRoot.querySelector('#svg-import-btn')?.addEventListener('click', () => importInput?.click());
        importInput?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                const svgText = await readFileAsText(file);
                state.doc = importSvgDocument(svgText, file.name, state.category);
                state.selectedAssetName = null;
                markDirty(true);
                renderAll();
                API.setStatus(`Imported ${file.name}`);
            } catch (error) {
                API.toast(error.message, 'error');
            }
            event.target.value = '';
        });
        refs.sidebarRoot.querySelectorAll('.svg-asset-item').forEach((button) => {
            button.addEventListener('click', () => loadAsset(button.dataset.assetName));
        });
    }

    function renderMain() {
        if (!refs.mainRoot) return;
        refs.mainRoot.innerHTML = `
            <div class="svg-editor-shell">
                <div class="toolbar svg-toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm ${state.mode === 'select' ? 'btn-primary' : 'btn-secondary'}" id="svg-mode-select">Select</button>
                        <button class="btn btn-sm ${state.mode === 'draw' ? 'btn-primary' : 'btn-secondary'}" id="svg-mode-draw">Polygon</button>
                        <button class="btn btn-sm btn-secondary" id="svg-finish-shape" ${state.mode === 'draw' && state.drawingPoints.length >= 3 ? '' : 'disabled'}>Finish</button>
                        <button class="btn btn-sm btn-secondary" id="svg-cancel-draw" ${state.mode === 'draw' && state.drawingPoints.length ? '' : 'disabled'}>Cancel</button>
                    </div>
                    <div class="toolbar-group">
                        <label><input type="checkbox" id="svg-toggle-marine" ${state.showMarine ? 'checked' : ''}> Marine Ref</label>
                        <label><input type="checkbox" id="svg-toggle-grid" ${state.showGrid ? 'checked' : ''}> Grid</label>
                    </div>
                    <div class="toolbar-group">
                        <label class="toolbar-label">Grid</label>
                        <select id="svg-grid-size" class="input-sm">
                            ${[8, 16, 32, 64, 128, 256, 512, 1024].map((size) => `<option value="${size}" ${state.gridSize === size ? 'selected' : ''}>${size}px</option>`).join('')}
                        </select>
                    </div>
                    <div class="toolbar-group">
                        <label class="toolbar-label">Scale</label>
                        <input type="range" id="svg-scale-range" min="0.25" max="4" step="0.05" value="${state.scaleFactor}">
                        <span class="toolbar-label" id="svg-scale-label">${state.scaleFactor.toFixed(2)}x</span>
                        <button class="btn btn-sm btn-secondary" id="svg-apply-scale">Apply</button>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <button class="btn btn-sm btn-primary" id="svg-save-btn">Save SVG + PNG</button>
                        <button class="btn btn-sm btn-secondary" id="svg-export-btn">Export PNG</button>
                        <button class="btn btn-sm btn-danger" id="svg-delete-btn" ${state.selectedAssetName ? '' : 'disabled'}>Delete Asset</button>
                    </div>
                </div>
                <div class="svg-editor-layout">
                    <div class="panel svg-stage-panel">
                        <div class="panel-header">SVG Canvas</div>
                        <div class="panel-body svg-stage-body">
                            <div class="svg-stage-wrap" id="svg-stage-wrap">
                                <svg id="svg-stage" class="svg-stage" viewBox="0 0 ${state.doc.width} ${state.doc.height}" xmlns="http://www.w3.org/2000/svg"></svg>
                                <div class="svg-stage-tint" id="svg-stage-tint"></div>
                            </div>
                        </div>
                        <div class="panel-footer svg-stage-footer" id="svg-stage-info"></div>
                    </div>
                    <aside class="panel svg-props-panel">
                        <div class="panel-header">Properties</div>
                        <div class="panel-body svg-props-body">
                            <div class="svg-section">
                                <div class="section-heading">Document</div>
                                <div class="field">
                                    <label class="field-label" for="svg-filename">Filename</label>
                                    <input type="text" id="svg-filename" value="${state.doc.filename}">
                                </div>
                                <div class="field">
                                    <label class="field-label" for="svg-usage">Usage Preset</label>
                                    <select id="svg-usage">
                                        ${SVG_USAGE_OPTIONS.map((option) => `<option value="${option.value}" ${state.doc.metadata?.usage === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="field-row">
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-target">Target</label>
                                        <input type="text" id="svg-target" value="${state.doc.metadata?.target || ''}" placeholder="alien_warrior, facehugger, egg, floor">
                                    </div>
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-doc-category">Folder</label>
                                        <select id="svg-doc-category">
                                            ${SVG_CATEGORIES.map((category) => `<option value="${category}" ${state.doc.category === category ? 'selected' : ''}>${category}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                                <div class="field">
                                    <label class="field-label" for="svg-notes">Notes</label>
                                    <input type="text" id="svg-notes" value="${state.doc.metadata?.notes || ''}" placeholder="Optional runtime note">
                                </div>
                                <div class="field-row">
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-width">Width</label>
                                        <input type="number" id="svg-width" min="32" max="2048" step="1" value="${state.doc.width}">
                                    </div>
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-height">Height</label>
                                        <input type="number" id="svg-height" min="32" max="2048" step="1" value="${state.doc.height}">
                                    </div>
                                </div>
                                <div class="svg-doc-meta" id="svg-doc-meta"></div>
                            </div>
                            <div class="svg-section">
                                <div class="section-heading">Layers</div>
                                <div class="svg-layer-actions">
                                    <button class="btn btn-sm btn-secondary" id="svg-add-shape">+ Add Empty</button>
                                    <button class="btn btn-sm btn-secondary" id="svg-duplicate-shape" ${state.selectedShapeId ? '' : 'disabled'}>Duplicate</button>
                                </div>
                                <div class="svg-layer-list" id="svg-layers-list"></div>
                            </div>
                            <div class="svg-section">
                                <div class="section-heading">Shape</div>
                                <div id="svg-shape-controls"></div>
                            </div>
                            <div class="svg-section">
                                <div class="section-heading">Raster Adjustments</div>
                                <div class="field">
                                    <label class="field-label" for="svg-brightness">Brightness</label>
                                    <input type="range" id="svg-brightness" min="-100" max="100" step="1" value="${state.doc.adjustments.brightness}">
                                </div>
                                <div class="field">
                                    <label class="field-label" for="svg-contrast">Contrast</label>
                                    <input type="range" id="svg-contrast" min="-100" max="100" step="1" value="${state.doc.adjustments.contrast}">
                                </div>
                                <div class="field-row">
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-overlay-color">Overlay</label>
                                        <input type="color" id="svg-overlay-color" value="${state.doc.adjustments.overlayColor}">
                                    </div>
                                    <div class="field flex-1">
                                        <label class="field-label" for="svg-overlay-alpha">Overlay Alpha</label>
                                        <input type="range" id="svg-overlay-alpha" min="0" max="100" step="1" value="${state.doc.adjustments.overlayAlpha}">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        `;

        refs.stageSvg = refs.mainRoot.querySelector('#svg-stage');
        refs.stageWrap = refs.mainRoot.querySelector('#svg-stage-wrap');
        refs.tintOverlay = refs.mainRoot.querySelector('#svg-stage-tint');
        refs.layersList = refs.mainRoot.querySelector('#svg-layers-list');
        refs.stageInfo = refs.mainRoot.querySelector('#svg-stage-info');
        refs.docMeta = refs.mainRoot.querySelector('#svg-doc-meta');
        refs.shapeControls = refs.mainRoot.querySelector('#svg-shape-controls');

        refs.mainRoot.querySelector('#svg-mode-select')?.addEventListener('click', () => { state.mode = 'select'; state.drawingPoints = []; renderAll(); });
        refs.mainRoot.querySelector('#svg-mode-draw')?.addEventListener('click', () => { state.mode = 'draw'; state.drawingPoints = []; renderAll(); });
        refs.mainRoot.querySelector('#svg-finish-shape')?.addEventListener('click', finishDrawingShape);
        refs.mainRoot.querySelector('#svg-cancel-draw')?.addEventListener('click', () => { state.drawingPoints = []; renderAll(); });
        refs.mainRoot.querySelector('#svg-toggle-marine')?.addEventListener('change', (event) => { state.showMarine = event.target.checked; renderStage(); });
        refs.mainRoot.querySelector('#svg-toggle-grid')?.addEventListener('change', (event) => { state.showGrid = event.target.checked; renderStage(); });
        refs.mainRoot.querySelector('#svg-grid-size')?.addEventListener('change', (event) => { state.gridSize = Number(event.target.value) || DEFAULT_GRID_SIZE; renderStage(); });
        refs.mainRoot.querySelector('#svg-scale-range')?.addEventListener('input', (event) => {
            state.scaleFactor = Number(event.target.value) || 1;
            const scaleLabel = refs.mainRoot.querySelector('#svg-scale-label');
            if (scaleLabel) scaleLabel.textContent = `${state.scaleFactor.toFixed(2)}x`;
        });
        refs.mainRoot.querySelector('#svg-apply-scale')?.addEventListener('click', applyScaleFactor);
        refs.mainRoot.querySelector('#svg-save-btn')?.addEventListener('click', () => saveDocument(false));
        refs.mainRoot.querySelector('#svg-export-btn')?.addEventListener('click', exportPng);
        refs.mainRoot.querySelector('#svg-delete-btn')?.addEventListener('click', deleteSelectedAsset);
        refs.mainRoot.querySelector('#svg-filename')?.addEventListener('input', (event) => {
            state.doc.filename = ensureExtension(sanitizeAssetFilename(event.target.value || 'shape', 'shape'), 'svg');
            markDirty(true);
        });
        refs.mainRoot.querySelector('#svg-usage')?.addEventListener('change', (event) => {
            const option = getUsageOption(event.target.value);
            state.doc.metadata.usage = option.value;
            state.doc.metadata.target = option.target;
            state.doc.category = option.category;
            state.category = option.category;
            markDirty(true);
            renderAll();
        });
        refs.mainRoot.querySelector('#svg-target')?.addEventListener('input', (event) => {
            state.doc.metadata.target = String(event.target.value || '').trim();
            markDirty(true);
        });
        refs.mainRoot.querySelector('#svg-doc-category')?.addEventListener('change', (event) => {
            state.doc.category = event.target.value;
            state.category = state.doc.category;
            markDirty(true);
            renderAll();
        });
        refs.mainRoot.querySelector('#svg-notes')?.addEventListener('input', (event) => {
            state.doc.metadata.notes = event.target.value || '';
            markDirty(true);
        });
        refs.mainRoot.querySelector('#svg-width')?.addEventListener('change', (event) => {
            state.doc.width = clamp(Number(event.target.value) || state.doc.width, 32, 2048);
            markDirty(true);
            renderAll();
        });
        refs.mainRoot.querySelector('#svg-height')?.addEventListener('change', (event) => {
            state.doc.height = clamp(Number(event.target.value) || state.doc.height, 32, 2048);
            markDirty(true);
            renderAll();
        });
        refs.mainRoot.querySelector('#svg-add-shape')?.addEventListener('click', () => {
            const shape = createBlankShape(`Shape ${state.doc.shapes.length + 1}`);
            shape.points = [
                { x: state.doc.width * 0.35, y: state.doc.height * 0.35, handleIn: null, handleOut: null },
                { x: state.doc.width * 0.65, y: state.doc.height * 0.35, handleIn: null, handleOut: null },
                { x: state.doc.width * 0.65, y: state.doc.height * 0.65, handleIn: null, handleOut: null },
                { x: state.doc.width * 0.35, y: state.doc.height * 0.65, handleIn: null, handleOut: null },
            ];
            state.doc.shapes.push(shape);
            state.selectedShapeId = shape.id;
            state.selectedPointIndex = 0;
            markDirty(true);
            renderAll();
        });
        refs.mainRoot.querySelector('#svg-duplicate-shape')?.addEventListener('click', duplicateSelectedShape);
        refs.mainRoot.querySelector('#svg-brightness')?.addEventListener('input', (event) => {
            state.doc.adjustments.brightness = Number(event.target.value) || 0;
            markDirty(true);
            renderStage();
        });
        refs.mainRoot.querySelector('#svg-contrast')?.addEventListener('input', (event) => {
            state.doc.adjustments.contrast = Number(event.target.value) || 0;
            markDirty(true);
            renderStage();
        });
        refs.mainRoot.querySelector('#svg-overlay-color')?.addEventListener('input', (event) => {
            state.doc.adjustments.overlayColor = event.target.value;
            markDirty(true);
            renderStage();
        });
        refs.mainRoot.querySelector('#svg-overlay-alpha')?.addEventListener('input', (event) => {
            state.doc.adjustments.overlayAlpha = Number(event.target.value) || 0;
            markDirty(true);
            renderStage();
        });

        refs.stageSvg?.addEventListener('pointerdown', handleStagePointerDown);
        refs.stageSvg?.addEventListener('click', handleStageClick);
        if (!windowEventsBound) {
            window.addEventListener('pointermove', handleWindowPointerMove);
            window.addEventListener('pointerup', handleWindowPointerUp);
            windowEventsBound = true;
        }

        renderLayers();
        renderShapeControls();
        renderStage();
    }

    function renderLayers() {
        if (!refs.layersList) return;
        refs.layersList.innerHTML = state.doc.shapes.length ? state.doc.shapes.map((shape, index) => `
            <div class="svg-layer-item ${state.selectedShapeId === shape.id ? 'is-active' : ''}" data-shape-id="${shape.id}">
                <button class="svg-layer-select" data-shape-id="${shape.id}">${shape.name}</button>
                <div class="svg-layer-controls">
                    <button class="btn btn-sm btn-secondary" data-layer-action="up" data-shape-id="${shape.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button class="btn btn-sm btn-secondary" data-layer-action="down" data-shape-id="${shape.id}" ${index === state.doc.shapes.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="btn btn-sm btn-danger" data-layer-action="delete" data-shape-id="${shape.id}">×</button>
                </div>
            </div>
        `).join('') : '<div class="field-hint">No shapes yet. Draw a polygon or add an empty shape.</div>';

        refs.layersList.querySelectorAll('.svg-layer-select').forEach((button) => {
            button.addEventListener('click', () => {
                state.selectedShapeId = button.dataset.shapeId;
                state.selectedPointIndex = 0;
                state.selectedHandle = null;
                renderAll();
            });
        });
        refs.layersList.querySelectorAll('[data-layer-action]').forEach((button) => {
            button.addEventListener('click', () => handleLayerAction(button.dataset.layerAction, button.dataset.shapeId));
        });
    }

    function renderShapeControls() {
        if (!refs.shapeControls) return;
        const shape = getShapeById(state.doc, state.selectedShapeId);
        if (!shape) {
            refs.shapeControls.innerHTML = '<div class="field-hint">Select a layer or draw a new polygon to edit points and styles.</div>';
            return;
        }

        const point = shape.points[state.selectedPointIndex] || null;
        refs.shapeControls.innerHTML = `
            <div class="field">
                <label class="field-label" for="svg-shape-name">Layer Name</label>
                <input type="text" id="svg-shape-name" value="${shape.name}">
            </div>
            <div class="field-row">
                <div class="field flex-1">
                    <label class="field-label" for="svg-fill">Fill</label>
                    <input type="color" id="svg-fill" value="${shape.fill}">
                </div>
                <div class="field flex-1">
                    <label class="field-label" for="svg-stroke">Stroke</label>
                    <input type="color" id="svg-stroke" value="${shape.stroke}">
                </div>
            </div>
            <div class="field-row">
                <div class="field flex-1">
                    <label class="field-label" for="svg-stroke-width">Stroke Width</label>
                    <input type="number" id="svg-stroke-width" min="0" max="64" step="0.5" value="${shape.strokeWidth}">
                </div>
                <div class="field flex-1">
                    <label class="field-label" for="svg-opacity">Opacity</label>
                    <input type="range" id="svg-opacity" min="0" max="1" step="0.01" value="${shape.opacity}">
                </div>
            </div>
            <div class="field-row">
                <button class="btn btn-sm btn-secondary" id="svg-toggle-node-curve" ${point ? '' : 'disabled'}>${point?.handleIn || point?.handleOut ? 'Linear Node' : 'Curve Node'}</button>
                <button class="btn btn-sm btn-secondary" id="svg-delete-node" ${shape.points.length > 3 && point ? '' : 'disabled'}>Delete Node</button>
            </div>
            <div class="svg-node-meta">${point ? `Point ${state.selectedPointIndex + 1}: ${Math.round(point.x)}, ${Math.round(point.y)}` : 'Select a node to edit its curve handles.'}</div>
        `;

        refs.shapeControls.querySelector('#svg-shape-name')?.addEventListener('input', (event) => {
            shape.name = event.target.value || shape.name;
            markDirty(true);
            renderLayers();
        });
        refs.shapeControls.querySelector('#svg-fill')?.addEventListener('input', (event) => { shape.fill = event.target.value; markDirty(true); renderStage(); });
        refs.shapeControls.querySelector('#svg-stroke')?.addEventListener('input', (event) => { shape.stroke = event.target.value; markDirty(true); renderStage(); });
        refs.shapeControls.querySelector('#svg-stroke-width')?.addEventListener('input', (event) => { shape.strokeWidth = clamp(Number(event.target.value) || shape.strokeWidth, 0, 64); markDirty(true); renderStage(); });
        refs.shapeControls.querySelector('#svg-opacity')?.addEventListener('input', (event) => { shape.opacity = clamp(Number(event.target.value) || shape.opacity, 0, 1); markDirty(true); renderStage(); });
        refs.shapeControls.querySelector('#svg-toggle-node-curve')?.addEventListener('click', toggleSelectedPointCurve);
        refs.shapeControls.querySelector('#svg-delete-node')?.addEventListener('click', deleteSelectedNode);
    }

    function renderStage() {
        if (!refs.stageSvg) return;
        const width = Math.max(32, Number(state.doc.width) || 256);
        const height = Math.max(32, Number(state.doc.height) || 256);
        refs.stageSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        refs.stageSvg.style.filter = `brightness(${100 + state.doc.adjustments.brightness}%) contrast(${100 + state.doc.adjustments.contrast}%)`;

        const marineWidth = Number(marineRef?.frameWidth) || 0;
        const marineHeight = Number(marineRef?.frameHeight) || 0;
        const marineX = Math.max(0, (width - marineWidth) / 2);
        const marineY = Math.max(0, (height - marineHeight) / 2);
        const artMarkup = state.doc.shapes.map((shape) => serializeShape(shape, state.selectedShapeId === shape.id)).join('');
        const previewMarkup = state.mode === 'draw' && state.drawingPoints.length
            ? `<polyline class="svg-drawing-preview" points="${state.drawingPoints.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none"></polyline>`
            : '';

        refs.stageSvg.innerHTML = `
            <rect x="0" y="0" width="${width}" height="${height}" fill="#0a0f15"></rect>
            ${state.showGrid ? buildGridMarkup(width, height, state.gridSize) : ''}
            ${state.showMarine && marineRef?.path ? `<image href="${marineRef.path}" x="${marineX}" y="${marineY}" width="${marineWidth}" height="${marineHeight}" opacity="${state.marineOpacity}"></image>` : ''}
            <g class="svg-art-layer">${artMarkup}</g>
            <g class="svg-overlay-layer">${previewMarkup}${buildOverlayMarkup()}</g>
        `;

        if (refs.tintOverlay) {
            refs.tintOverlay.style.background = state.doc.adjustments.overlayColor;
            refs.tintOverlay.style.opacity = `${state.doc.adjustments.overlayAlpha / 100}`;
        }

        const bounds = computeDocumentBounds(state.doc);
        const usageLabel = getUsageOption(state.doc.metadata?.usage).label;
        refs.docMeta.textContent = bounds
            ? `${usageLabel} • Content bounds ${Math.round(bounds.maxX - bounds.minX)}×${Math.round(bounds.maxY - bounds.minY)} within ${width}×${height} viewBox`
            : `${usageLabel} • ViewBox ${width}×${height}`;
        refs.stageInfo.textContent = marineRef
            ? `Marine reference: ${marineWidth}×${marineHeight}px. ${state.mode === 'draw' ? 'Click to place polygon points, then Finish to commit.' : 'Drag nodes and handles directly in the SVG canvas.'}`
            : 'SVG canvas ready';
    }

    function buildOverlayMarkup() {
        const shape = getShapeById(state.doc, state.selectedShapeId);
        if (!shape) return '';

        const lines = [];
        const handles = [];
        shape.points.forEach((point, index) => {
            if (point.handleIn) {
                lines.push(`<line class="svg-handle-line" x1="${point.x}" y1="${point.y}" x2="${point.handleIn.x}" y2="${point.handleIn.y}"></line>`);
                handles.push(`<circle class="svg-handle-point" data-handle-kind="in" data-point-index="${index}" cx="${point.handleIn.x}" cy="${point.handleIn.y}" r="4"></circle>`);
            }
            if (point.handleOut) {
                lines.push(`<line class="svg-handle-line" x1="${point.x}" y1="${point.y}" x2="${point.handleOut.x}" y2="${point.handleOut.y}"></line>`);
                handles.push(`<circle class="svg-handle-point" data-handle-kind="out" data-point-index="${index}" cx="${point.handleOut.x}" cy="${point.handleOut.y}" r="4"></circle>`);
            }
            handles.push(`<circle class="svg-anchor-point ${state.selectedPointIndex === index ? 'is-active' : ''}" data-point-index="${index}" cx="${point.x}" cy="${point.y}" r="5"></circle>`);
        });

        return `${lines.join('')}${handles.join('')}`;
    }

    function renderAll() {
        renderSidebar();
        renderMain();
    }

    function stageCoordsFromEvent(event) {
        const rect = refs.stageSvg.getBoundingClientRect();
        return {
            x: clamp(((event.clientX - rect.left) / rect.width) * state.doc.width, 0, state.doc.width),
            y: clamp(((event.clientY - rect.top) / rect.height) * state.doc.height, 0, state.doc.height),
        };
    }

    function handleStagePointerDown(event) {
        const pointIndex = event.target.dataset.pointIndex;
        const handleKind = event.target.dataset.handleKind;
        const shapeId = event.target.dataset.shapeId;
        if (pointIndex != null) {
            state.selectedPointIndex = Number(pointIndex);
            state.selectedHandle = handleKind || null;
            state.drag = {
                type: handleKind ? 'handle' : 'anchor',
                pointIndex: Number(pointIndex),
                handleKind: handleKind || null,
            };
            renderShapeControls();
            renderStage();
            event.preventDefault();
            return;
        }
        if (shapeId) {
            state.selectedShapeId = shapeId;
            state.selectedPointIndex = 0;
            state.selectedHandle = null;
            renderLayers();
            renderShapeControls();
            renderStage();
        }
    }

    function handleWindowPointerMove(event) {
        if (!state.drag || !state.selectedShapeId) return;
        const shape = getShapeById(state.doc, state.selectedShapeId);
        const point = shape?.points?.[state.drag.pointIndex];
        if (!shape || !point) return;
        const coords = stageCoordsFromEvent(event);
        if (state.drag.type === 'anchor') {
            const dx = coords.x - point.x;
            const dy = coords.y - point.y;
            point.x = coords.x;
            point.y = coords.y;
            if (point.handleIn) {
                point.handleIn.x += dx;
                point.handleIn.y += dy;
            }
            if (point.handleOut) {
                point.handleOut.x += dx;
                point.handleOut.y += dy;
            }
        } else if (state.drag.handleKind === 'in') {
            point.handleIn = { x: coords.x, y: coords.y };
        } else if (state.drag.handleKind === 'out') {
            point.handleOut = { x: coords.x, y: coords.y };
        }
        markDirty(true);
        renderStage();
        renderShapeControls();
    }

    function handleWindowPointerUp() {
        state.drag = null;
    }

    function handleStageClick(event) {
        if (state.drag) return;
        if (state.mode !== 'draw') return;
        if (event.target.dataset.pointIndex != null || event.target.dataset.shapeId) return;
        const coords = stageCoordsFromEvent(event);
        if (state.drawingPoints.length >= 3) {
            const first = state.drawingPoints[0];
            const distance = Math.hypot(coords.x - first.x, coords.y - first.y);
            if (distance <= 10) {
                finishDrawingShape();
                return;
            }
        }
        state.drawingPoints.push({ x: roundCoord(coords.x), y: roundCoord(coords.y) });
        renderMain();
        renderStage();
    }

    function finishDrawingShape() {
        if (state.drawingPoints.length < 3) return;
        const shape = shapeFromPolygonPoints(state.drawingPoints.map((point) => [point.x, point.y]), {
            name: `Shape ${state.doc.shapes.length + 1}`,
            fill: '#48d89a',
            stroke: '#d0dce8',
            strokeWidth: 2,
            opacity: 1,
            closed: true,
        });
        state.doc.shapes.push(shape);
        state.selectedShapeId = shape.id;
        state.selectedPointIndex = 0;
        state.drawingPoints = [];
        state.mode = 'select';
        markDirty(true);
        renderAll();
    }

    function handleLayerAction(action, shapeId) {
        const index = state.doc.shapes.findIndex((shape) => shape.id === shapeId);
        if (index < 0) return;
        if (action === 'delete') {
            state.doc.shapes.splice(index, 1);
            if (state.selectedShapeId === shapeId) {
                state.selectedShapeId = state.doc.shapes[index]?.id || state.doc.shapes[index - 1]?.id || null;
                state.selectedPointIndex = 0;
            }
        } else if (action === 'up' && index > 0) {
            const [shape] = state.doc.shapes.splice(index, 1);
            state.doc.shapes.splice(index - 1, 0, shape);
        } else if (action === 'down' && index < state.doc.shapes.length - 1) {
            const [shape] = state.doc.shapes.splice(index, 1);
            state.doc.shapes.splice(index + 1, 0, shape);
        }
        markDirty(true);
        renderAll();
    }

    function duplicateSelectedShape() {
        const shape = getShapeById(state.doc, state.selectedShapeId);
        if (!shape) return;
        const duplicate = cloneShape(shape);
        duplicate.name = `${shape.name} Copy`;
        state.doc.shapes.push(duplicate);
        state.selectedShapeId = duplicate.id;
        state.selectedPointIndex = 0;
        markDirty(true);
        renderAll();
    }

    function deleteSelectedNode() {
        const shape = getShapeById(state.doc, state.selectedShapeId);
        if (!shape || shape.points.length <= 3 || state.selectedPointIndex < 0) return;
        shape.points.splice(state.selectedPointIndex, 1);
        state.selectedPointIndex = clamp(state.selectedPointIndex, 0, shape.points.length - 1);
        markDirty(true);
        renderAll();
    }

    function toggleSelectedPointCurve() {
        const shape = getShapeById(state.doc, state.selectedShapeId);
        const point = shape?.points?.[state.selectedPointIndex];
        if (!point) return;
        if (point.handleIn || point.handleOut) {
            point.handleIn = null;
            point.handleOut = null;
        } else {
            point.handleIn = { x: point.x - 18, y: point.y };
            point.handleOut = { x: point.x + 18, y: point.y };
        }
        markDirty(true);
        renderAll();
    }

    function applyScaleFactor() {
        const factor = Number(state.scaleFactor) || 1;
        if (factor === 1) return;
        const centerX = state.doc.width / 2;
        const centerY = state.doc.height / 2;
        state.doc.shapes.forEach((shape) => {
            shape.points.forEach((point) => {
                point.x = centerX + ((point.x - centerX) * factor);
                point.y = centerY + ((point.y - centerY) * factor);
                if (point.handleIn) {
                    point.handleIn.x = centerX + ((point.handleIn.x - centerX) * factor);
                    point.handleIn.y = centerY + ((point.handleIn.y - centerY) * factor);
                }
                if (point.handleOut) {
                    point.handleOut.x = centerX + ((point.handleOut.x - centerX) * factor);
                    point.handleOut.y = centerY + ((point.handleOut.y - centerY) * factor);
                }
            });
        });
        state.scaleFactor = 1;
        markDirty(true);
        renderAll();
    }

    async function rasterizeCurrentDocument() {
        const svgText = svgDocumentToText(state.doc);
        const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        try {
            const image = await loadImage(objectUrl, { crossOrigin: null });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(state.doc.width));
            canvas.height = Math.max(1, Math.round(state.doc.height));
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.filter = `brightness(${100 + state.doc.adjustments.brightness}%) contrast(${100 + state.doc.adjustments.contrast}%)`;
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            ctx.filter = 'none';
            if (state.doc.adjustments.overlayAlpha > 0) {
                const overlay = hexToRgba(state.doc.adjustments.overlayColor);
                ctx.fillStyle = colorToCss({ ...overlay, a: Math.round((state.doc.adjustments.overlayAlpha / 100) * 255) });
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            return canvas.toDataURL('image/png');
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    async function saveDocument(isExportOnly) {
        try {
            const filename = ensureExtension(sanitizeAssetFilename(pathSafeBasename(state.doc.filename), 'shape'), 'svg');
            state.doc.filename = filename;
            const svgText = svgDocumentToText(state.doc);
            const pngDataUrl = await rasterizeCurrentDocument();

            if (!isExportOnly) {
                const response = await API.apiFetch('/api/svg-assets/save', {
                    method: 'POST',
                    body: JSON.stringify({
                        category: state.doc.category,
                        filename,
                        svgText,
                        pngDataUrl,
                        width: state.doc.width,
                        height: state.doc.height,
                        viewBox: `0 0 ${state.doc.width} ${state.doc.height}`,
                        brightness: state.doc.adjustments.brightness,
                        contrast: state.doc.adjustments.contrast,
                        overlayColor: state.doc.adjustments.overlayColor,
                        overlayAlpha: state.doc.adjustments.overlayAlpha,
                        usage: state.doc.metadata?.usage,
                        target: state.doc.metadata?.target,
                        notes: state.doc.metadata?.notes,
                    }),
                });
                const data = await response.json();
                if (!data.ok) throw new Error(data.error || 'Failed to save SVG asset');
                state.selectedAssetName = data.asset.name;
                state.category = data.asset.category;
                await loadAssets();
                markDirty(false);
                renderAll();
                API.recordSave();
                API.toast(`Saved ${filename}`, 'success');
            }

            return { filename, pngDataUrl };
        } catch (error) {
            API.toast(error.message, 'error');
            throw error;
        }
    }

    async function exportPng() {
        const { filename, pngDataUrl } = await saveDocument(true);
        const link = document.createElement('a');
        link.href = pngDataUrl;
        link.download = filename.replace(/\.svg$/i, '.png');
        link.click();
        API.toast(`Exported ${link.download}`, 'success');
    }

    async function loadAsset(assetName) {
        try {
            const response = await API.apiFetch(`/api/svg-assets/content?category=${encodeURIComponent(state.category)}&filename=${encodeURIComponent(`${assetName}.svg`)}`);
            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'Failed to load SVG asset');
            state.doc = importSvgDocument(data.svgText, data.asset.filename, state.category);
            state.doc.adjustments = {
                brightness: Number(data.asset.brightness) || 0,
                contrast: Number(data.asset.contrast) || 0,
                overlayColor: data.asset.overlayColor || '#4aa4d8',
                overlayAlpha: Number(data.asset.overlayAlpha) || 0,
            };
            state.doc.metadata = {
                usage: data.asset.usage || createDefaultMetadata(data.asset.category).usage,
                target: data.asset.target || createDefaultMetadata(data.asset.category).target,
                notes: data.asset.notes || '',
            };
            state.selectedAssetName = data.asset.name;
            state.category = data.asset.category;
            state.selectedShapeId = state.doc.shapes[0]?.id || null;
            state.selectedPointIndex = 0;
            markDirty(false);
            renderAll();
        } catch (error) {
            API.toast(error.message, 'error');
        }
    }

    async function deleteSelectedAsset() {
        if (!state.selectedAssetName) return;
        if (!confirm(`Delete ${state.selectedAssetName}.svg and its PNG export?`)) return;
        try {
            const response = await API.apiFetch(`/api/svg-assets/${encodeURIComponent(state.category)}/${encodeURIComponent(`${state.selectedAssetName}.svg`)}`, { method: 'DELETE' });
            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'Failed to delete SVG asset');
            state.selectedAssetName = null;
            await loadAssets();
            resetDocument(`${state.category}_shape.svg`);
            API.toast('SVG asset deleted', 'success');
        } catch (error) {
            API.toast(error.message, 'error');
        }
    }

    return {
        mount(sidebarRoot, mainRoot) {
            refs.sidebarRoot = sidebarRoot;
            refs.mainRoot = mainRoot;
            syncDocCategoryFromUsage(true);
            renderAll();
        },
        async onShow() {
            await ensureMarineReference();
            await loadAssets();
            if (!refs.mainRoot || !refs.sidebarRoot) return;
            renderAll();
        },
        onHide() {
            state.drag = null;
        },
        async save() {
            if (!refs.mainRoot || !refs.sidebarRoot) return;
            if (state.dirty) await saveDocument(false);
        },
    };
}

export { createSvgEditor };