/**
 * HUD Tab — Visual grid-based layout editor for HUD panels.
 * Saves directly to the server-backed src/data/hudConfig.js file.
 */

const API = window.editorAPI;

const PANEL_DEFS = [
    { key: 'leaderCard', label: 'Leader Card', defaultX: 10, defaultY: 30, defaultW: 210, defaultH: 116, color: '#33ff66' },
    { key: 'techCard', label: 'Tech Card', defaultX: 228, defaultY: 30, defaultW: 165, defaultH: 90, color: '#7ecfff' },
    { key: 'medicCard', label: 'Medic Card', defaultX: 401, defaultY: 30, defaultW: 165, defaultH: 90, color: '#ff9966' },
    { key: 'heavyCard', label: 'Heavy Card', defaultX: 574, defaultY: 30, defaultW: 165, defaultH: 90, color: '#ff6666' },
    { key: 'objectivesPanel', label: 'Objectives', defaultX: 1054, defaultY: 10, defaultW: 200, defaultH: 60, color: '#c47ae8' },
    { key: 'mapPanel', label: 'MAP Panel', defaultX: 1064, defaultY: 530, defaultW: 190, defaultH: 130, color: '#4aa4d8' },
    { key: 'missionLog', label: 'Subtitles', defaultX: 340, defaultY: 660, defaultW: 600, defaultH: 40, color: '#9be8ff' },
];

const FONT_FAMILIES = ['Share Tech Mono', 'IBM Plex Mono', 'monospace'];

const CARD_SUB_DEFAULTS = Object.freeze({
    video: { label: 'Video Feed', relX: 0, relY: 0, width: 210, height: 116, color: '#2a5a8c', opacity: 0.46 },
    hp: { label: 'HP Display', relX: 8, relY: 6, fontSize: 44, color: '#33ff66', opacity: 0.9, fontFamily: 'Share Tech Mono' },
    ammo: { label: 'Ammo Display', relX: 154, relY: 80, fontSize: 36, color: '#ff6666', opacity: 0.8, fontFamily: 'Share Tech Mono' },
    ekg: { label: 'EKG Graph', relX: 8, relY: 46, width: 194, height: 24, color: '#33ff66', color2: '#ffbb33', opacity: 0.9 },
    name: { label: 'Marine Name', relX: 8, relY: 94, fontSize: 14, color: '#e8f0f8', opacity: 1, fontFamily: 'Share Tech Mono' },
    actionBar: { label: 'Action Bar', relX: 8, relY: 72, width: 194, height: 4, color: '#44aaff', opacity: 0.85 },
    button: { label: 'HEAL Button', relX: 0, relY: 120, width: 210, height: 16, color: '#7ecfff', borderColor: '#45b8ff', bgColor: '#07172a', opacity: 0.92, fontSize: 14, fontFamily: 'Share Tech Mono' },
});

const LEADER_EXTRA_SUB_DEFAULTS = Object.freeze({
    weaponName: { label: 'Weapon Name', relX: 150, relY: 52, fontSize: 9, color: '#ff9999', opacity: 1, fontFamily: 'Share Tech Mono' },
    overheat: { label: 'Overheat Bar', relX: 150, relY: 98, width: 52, height: 4, color: '#ff6633', opacity: 0.9 },
});

const OBJECTIVES_SUB_DEFAULTS = Object.freeze({
    objectiveText: { label: 'Objective Text', relX: 8, relY: 22, fontSize: 11, color: '#7ecfff', opacity: 0.5, fontFamily: 'Share Tech Mono' },
});

const MAP_SUB_DEFAULTS = Object.freeze({
    title: { label: 'MAP Label', relX: 4, relY: 9, fontSize: 7, color: '#4aa4d8', opacity: 0.6, fontFamily: 'Share Tech Mono' },
    mapButton: { label: 'MAP Button', relX: 51, relY: 134, width: 88, height: 18, color: '#4aa4d8', borderColor: '#4aa4d8', bgColor: '#07172a', opacity: 0.92, fontSize: 9, fontFamily: 'Share Tech Mono' },
});

const MISSION_LOG_SUB_DEFAULTS = Object.freeze({
    subtitleText: { label: 'Subtitle Text', relX: 300, relY: 20, fontSize: 22, color: '#9be8ff', opacity: 1, fontFamily: 'Share Tech Mono' },
});

const EDITOR_CANVAS_W = 760;
const EDITOR_CANVAS_H = 420;

let config = {};
let panels = [];
let canvas = null;
let ctx = null;
let selectedPanel = null;
let dragState = null;
let dirty = false;
let resizeObserver = null;
let activePanelEditor = null;

let gridSize = 10;
let snapToGrid = true;
let showGrid = true;
let gameWidth = 1280;
let gameHeight = 720;

// ── Undo / Redo ──
const MAX_UNDO = 80;
let undoStack = [];
let redoStack = [];

function pushUndo(label) {
    undoStack.push({ label, state: snapshotState() });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
}

function snapshotState() {
    return JSON.stringify(panels.map((p) => ({
        key: p.key, label: p.label, color: p.color,
        x: p.x, y: p.y, width: p.width, height: p.height,
        subs: deepClone(p.subs), locked: p.locked,
    })));
}

function restoreState(json) {
    const data = JSON.parse(json);
    panels = data.map((d) => ({ ...d }));
    selectedPanel = selectedPanel ? panels.find((p) => p.key === selectedPanel.key) || null : null;
    renderPanelList();
    renderProps();
    draw();
    dirty = true;
    API.setDirty(true);
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({ label: 'redo', state: snapshotState() });
    const entry = undoStack.pop();
    restoreState(entry.state);
    updateUndoButtons();
    API.toast('Undo: ' + entry.label, 'info');
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({ label: 'undo', state: snapshotState() });
    const entry = redoStack.pop();
    restoreState(entry.state);
    updateUndoButtons();
    API.toast('Redo', 'info');
}

function updateUndoButtons() {
    const undoBtn = document.getElementById('hud-undo');
    const redoBtn = document.getElementById('hud-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getPanelDef(key) {
    return PANEL_DEFS.find((def) => def.key === key) || null;
}

function getSubElementDefaults(panelKey) {
    if (panelKey.endsWith('Card')) {
        return panelKey === 'leaderCard'
            ? { ...CARD_SUB_DEFAULTS, ...LEADER_EXTRA_SUB_DEFAULTS }
            : { ...CARD_SUB_DEFAULTS };
    }
    if (panelKey === 'objectivesPanel') return { ...OBJECTIVES_SUB_DEFAULTS };
    if (panelKey === 'mapPanel') return { ...MAP_SUB_DEFAULTS };
    if (panelKey === 'missionLog') return { ...MISSION_LOG_SUB_DEFAULTS };
    return {};
}

function panelHasSubEditor(panelKey) {
    return Object.keys(getSubElementDefaults(panelKey)).length > 0;
}

function mergeSubConfig(panelKey, savedSubs = {}) {
    const defaults = getSubElementDefaults(panelKey);
    const merged = {};
    for (const [subKey, subDef] of Object.entries(defaults)) {
        merged[subKey] = { ...subDef, ...(savedSubs[subKey] || {}) };
    }
    return merged;
}

function buildUI(root) {
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <aside class="sidebar" style="width:260px; display:flex; flex-direction:column; gap:4px;">
                <div class="panel" style="flex:0 0 auto;">
                    <div class="panel-header">HUD Panels</div>
                    <div class="panel-body" style="padding:0;" id="hud-panel-list"></div>
                </div>

                <div class="panel" style="flex:0 0 auto;">
                    <div class="panel-header">Grid Settings</div>
                    <div class="panel-body" style="padding:8px;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <label style="font-size:11px;min-width:60px;">Grid Size:</label>
                            <input type="number" class="input input-sm" id="hud-grid-size" value="${gridSize}" min="1" max="100" style="width:60px;">
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
                                <input type="checkbox" id="hud-snap" ${snapToGrid ? 'checked' : ''}> Snap to Grid
                            </label>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
                                <input type="checkbox" id="hud-show-grid" ${showGrid ? 'checked' : ''}> Show Grid
                            </label>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <label style="font-size:11px;min-width:60px;">Game W:</label>
                            <input type="number" class="input input-sm" id="hud-game-w" value="${gameWidth}" min="640" max="3840" style="width:70px;">
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <label style="font-size:11px;min-width:60px;">Game H:</label>
                            <input type="number" class="input input-sm" id="hud-game-h" value="${gameHeight}" min="480" max="2160" style="width:70px;">
                        </div>
                    </div>
                </div>

                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header">Properties</div>
                    <div class="panel-body" style="flex:1;padding:8px;overflow-y:auto;" id="hud-props">
                        <div style="color:var(--text-muted);font-size:12px;">Select a panel to edit its properties</div>
                    </div>
                </div>
            </aside>

            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="hud-undo" title="Undo (Ctrl+Z)" disabled>Undo</button>
                        <button class="btn btn-sm btn-secondary" id="hud-redo" title="Redo (Ctrl+Shift+Z)" disabled>Redo</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="hud-reset" title="Reset to defaults">Reset All</button>
                        <button class="btn btn-sm btn-secondary" id="hud-reload" title="Reload from server">Reload</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <span id="hud-info" style="font-size:11px;color:var(--text-muted);">Drag HUD panels to reposition them</span>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <button class="btn btn-sm btn-primary" id="hud-save">Save to Game</button>
                    </div>
                </div>

                <div class="canvas-wrap" id="hud-canvas-wrap" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#0a0a0a;">
                    <canvas id="hud-canvas"></canvas>
                </div>
            </div>
        </div>
    `;

    canvas = document.getElementById('hud-canvas');
    ctx = canvas.getContext('2d');

    document.getElementById('hud-grid-size').addEventListener('change', (e) => { gridSize = parseInt(e.target.value, 10) || 10; draw(); });
    document.getElementById('hud-snap').addEventListener('change', (e) => { snapToGrid = e.target.checked; });
    document.getElementById('hud-show-grid').addEventListener('change', (e) => { showGrid = e.target.checked; draw(); });
    document.getElementById('hud-game-w').addEventListener('change', (e) => { gameWidth = parseInt(e.target.value, 10) || 1280; resizeCanvas(); });
    document.getElementById('hud-game-h').addEventListener('change', (e) => { gameHeight = parseInt(e.target.value, 10) || 720; resizeCanvas(); });
    document.getElementById('hud-save').addEventListener('click', saveConfig);
    document.getElementById('hud-reset').addEventListener('click', resetToDefaults);
    document.getElementById('hud-reload').addEventListener('click', loadConfig);
    document.getElementById('hud-undo').addEventListener('click', undo);
    document.getElementById('hud-redo').addEventListener('click', redo);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    document.addEventListener('keydown', onGlobalKeyDown);

    resizeCanvas();
}

function onGlobalKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
        e.preventDefault();
        redo();
    }
}

function resizeCanvas() {
    const wrap = document.getElementById('hud-canvas-wrap');
    if (!wrap || !canvas) return;
    const maxW = wrap.clientWidth - 40;
    const maxH = wrap.clientHeight - 40;
    const scale = Math.min(maxW / gameWidth, maxH / gameHeight, 1);
    canvas.width = Math.round(gameWidth * scale);
    canvas.height = Math.round(gameHeight * scale);
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    canvas._scale = scale;
    draw();
}

async function loadConfig() {
    try {
        const resp = await API.apiFetch('/api/hud-config');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        config = data.config || {};
        buildPanels();
        undoStack.length = 0;
        redoStack.length = 0;
        updateUndoButtons();
        renderPanelList();
        renderProps();
        draw();
        API.setStatus('HUD config loaded');
    } catch (err) {
        API.toast(`Failed to load HUD config: ${err.message}`, 'error');
        config = {};
        buildPanels();
        renderPanelList();
        renderProps();
        draw();
    }
}

function buildPanels() {
    panels = PANEL_DEFS.map((def) => {
        const cfg = config[def.key] || {};
        return {
            key: def.key,
            label: def.label,
            color: cfg._color ?? def.color,
            x: cfg.x ?? def.defaultX,
            y: cfg.y ?? def.defaultY,
            width: cfg.width ?? def.defaultW,
            height: cfg.height ?? def.defaultH,
            subs: mergeSubConfig(def.key, cfg._subs || {}),
            locked: false,
        };
    });
}

function panelsToConfig() {
    const out = {};
    for (const panel of panels) {
        const def = getPanelDef(panel.key);
        out[panel.key] = {
            x: Math.round(panel.x),
            y: Math.round(panel.y),
            width: Math.round(panel.width),
            height: Math.round(panel.height),
        };
        if (panel.color !== def?.color) out[panel.key]._color = panel.color;
        if (panelHasSubEditor(panel.key)) out[panel.key]._subs = deepClone(panel.subs);
    }
    return out;
}

async function saveConfig() {
    const nextConfig = panelsToConfig();
    try {
        const resp = await API.apiFetch('/api/hud-config', {
            method: 'POST',
            body: JSON.stringify(nextConfig),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        config = nextConfig;
        dirty = false;
        API.recordSave();
        API.toast('HUD config saved to game', 'success');
    } catch (err) {
        API.toast(`Save failed: ${err.message}`, 'error');
    }
}

function resetToDefaults() {
    if (!confirm('Reset all HUD panels to their defaults?')) return;
    pushUndo('Reset all panels');
    config = {};
    buildPanels();
    renderPanelList();
    renderProps();
    draw();
    dirty = true;
    API.setDirty(true);
}

function renderPanelList() {
    const el = document.getElementById('hud-panel-list');
    if (!el) return;
    el.innerHTML = panels.map((panel) => {
        const supportsSubEditor = panelHasSubEditor(panel.key);
        return `
            <div class="hud-panel-item" data-key="${panel.key}" style="display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);${selectedPanel?.key === panel.key ? 'background:rgba(74,164,216,0.15);' : ''}">
                <div style="width:12px;height:12px;border-radius:2px;background:${panel.color};flex-shrink:0;"></div>
                <span style="flex:1;font-size:12px;">${panel.label}</span>
                ${supportsSubEditor ? `<button class="btn btn-sm btn-icon hud-edit-btn" data-key="${panel.key}" title="Edit panel elements" style="font-size:10px;padding:2px 6px;">Edit Elements</button>` : ''}
                <button class="btn btn-sm btn-icon hud-lock-btn" data-key="${panel.key}" title="${panel.locked ? 'Unlock' : 'Lock'}" style="font-size:10px;padding:2px 4px;">${panel.locked ? 'L' : 'U'}</button>
            </div>
        `;
    }).join('');

    el.querySelectorAll('.hud-panel-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.hud-edit-btn') || e.target.closest('.hud-lock-btn')) return;
            selectPanel(panels.find((panel) => panel.key === item.dataset.key) || null);
        });
    });

    el.querySelectorAll('.hud-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const panel = panels.find((entry) => entry.key === btn.dataset.key);
            if (panel) openPanelEditor(panel);
        });
    });

    el.querySelectorAll('.hud-lock-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const panel = panels.find((entry) => entry.key === btn.dataset.key);
            if (!panel) return;
            panel.locked = !panel.locked;
            renderPanelList();
            draw();
        });
    });
}

function selectPanel(panel) {
    selectedPanel = panel;
    renderPanelList();
    renderProps();
    draw();
}

function renderProps() {
    const el = document.getElementById('hud-props');
    if (!el) return;
    if (!selectedPanel) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Select a panel</div>';
        return;
    }

    const panel = selectedPanel;
    const supportsSubEditor = panelHasSubEditor(panel.key);
    el.innerHTML = `
        <div style="margin-bottom:8px;font-weight:600;color:${panel.color};">${panel.label}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
            <label>X:</label><input type="number" class="input input-sm" id="hp-x" value="${Math.round(panel.x)}" style="width:80px;">
            <label>Y:</label><input type="number" class="input input-sm" id="hp-y" value="${Math.round(panel.y)}" style="width:80px;">
            <label>Width:</label><input type="number" class="input input-sm" id="hp-w" value="${Math.round(panel.width)}" style="width:80px;">
            <label>Height:</label><input type="number" class="input input-sm" id="hp-h" value="${Math.round(panel.height)}" style="width:80px;">
            <label>Color:</label><input type="color" class="input input-sm" id="hp-color" value="${panel.color}" style="width:80px;height:28px;cursor:pointer;">
        </div>
        ${supportsSubEditor ? `
            <div style="margin-top:10px;padding:8px;border:1px solid var(--border);border-radius:4px;background:rgba(0,0,0,0.18);">
                <div style="font-size:12px;font-weight:600;margin-bottom:4px;">Panel Elements</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Open the element editor to move text, bars, and buttons inside this HUD panel.</div>
                <button class="btn btn-sm btn-secondary" id="hp-open-editor">Edit ${panel.label} Elements</button>
            </div>
        ` : ''}
        <button class="btn btn-sm btn-secondary" id="hp-apply" style="margin-top:8px;">Apply</button>
    `;

    document.getElementById('hp-open-editor')?.addEventListener('click', () => openPanelEditor(panel));
    document.getElementById('hp-apply')?.addEventListener('click', () => {
        pushUndo('Move/resize ' + panel.label);
        panel.x = parseInt(document.getElementById('hp-x').value, 10) || panel.x;
        panel.y = parseInt(document.getElementById('hp-y').value, 10) || panel.y;
        panel.width = parseInt(document.getElementById('hp-w').value, 10) || panel.width;
        panel.height = parseInt(document.getElementById('hp-h').value, 10) || panel.height;
        panel.color = document.getElementById('hp-color').value || panel.color;
        dirty = true;
        API.setDirty(true);
        renderPanelList();
        draw();
        API.toast(`Updated ${panel.label}`, 'info');
    });
}

function draw() {
    if (!ctx || !canvas) return;
    const scale = canvas._scale || 1;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = '#020810';
    ctx.fillRect(0, 0, cw, ch);

    if (showGrid) {
        ctx.strokeStyle = 'rgba(74,164,216,0.08)';
        ctx.lineWidth = 1;
        const scaledGrid = gridSize * scale;
        for (let x = 0; x < cw; x += scaledGrid) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ch);
            ctx.stroke();
        }
        for (let y = 0; y < ch; y += scaledGrid) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(cw, y);
            ctx.stroke();
        }
    }

    ctx.strokeStyle = 'rgba(74,164,216,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, cw, ch);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const margin = 10 * scale;
    ctx.strokeRect(margin, margin, cw - margin * 2, ch - margin * 2);
    ctx.setLineDash([]);

    for (const panel of panels) {
        const px = panel.x * scale;
        const py = panel.y * scale;
        const pw = panel.width * scale;
        const ph = panel.height * scale;
        const isSelected = selectedPanel?.key === panel.key;

        ctx.globalAlpha = 0.18;
        ctx.fillStyle = panel.color;
        ctx.fillRect(px, py, pw, ph);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = panel.color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(px, py, pw, ph);

        ctx.fillStyle = panel.color;
        ctx.font = `${Math.max(9, 11 * scale)}px "Share Tech Mono", monospace`;
        ctx.fillText(panel.label, px + 4, py + 12 * scale);
        ctx.font = `${Math.max(7, 9 * scale)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(`${Math.round(panel.x)},${Math.round(panel.y)} ${Math.round(panel.width)}x${Math.round(panel.height)}`, px + 4, py + 22 * scale);

        if (panelHasSubEditor(panel.key)) {
            const subCount = Object.keys(panel.subs).length;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = `${Math.max(7, 8 * scale)}px "Share Tech Mono", monospace`;
            ctx.fillText(`${subCount} elements`, px + 4, py + ph - 8);
        }

        if (panel.locked) {
            ctx.fillStyle = 'rgba(255,100,100,0.65)';
            ctx.font = `${12 * scale}px monospace`;
            ctx.fillText('[L]', px + pw - 24 * scale, py + 14 * scale);
        }

        if (isSelected && !panel.locked) {
            ctx.fillStyle = panel.color;
            ctx.fillRect(px + pw - 8, py + ph - 8, 8, 8);
        }
    }
}

function canvasToGame(cx, cy) {
    const scale = canvas._scale || 1;
    return { x: cx / scale, y: cy / scale };
}

function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const { x, y } = canvasToGame(cx, cy);

    if (selectedPanel && !selectedPanel.locked) {
        const hx = selectedPanel.x + selectedPanel.width;
        const hy = selectedPanel.y + selectedPanel.height;
        if (Math.abs(x - hx) < 10 && Math.abs(y - hy) < 10) {
            pushUndo('Resize ' + selectedPanel.label);
            dragState = { panel: selectedPanel, type: 'resize', offsetX: x - selectedPanel.width, offsetY: y - selectedPanel.height };
            canvas.style.cursor = 'nwse-resize';
            return;
        }
    }

    for (let i = panels.length - 1; i >= 0; i -= 1) {
        const panel = panels[i];
        if (x < panel.x || x > panel.x + panel.width || y < panel.y || y > panel.y + panel.height) continue;
        selectPanel(panel);
        if (!panel.locked) {
            pushUndo('Move ' + panel.label);
            dragState = { panel, type: 'move', offsetX: x - panel.x, offsetY: y - panel.y };
            canvas.style.cursor = 'grabbing';
        }
        return;
    }

    selectPanel(null);
}

function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const { x, y } = canvasToGame(cx, cy);

    if (!dragState) {
        if (selectedPanel && !selectedPanel.locked) {
            const hx = selectedPanel.x + selectedPanel.width;
            const hy = selectedPanel.y + selectedPanel.height;
            if (Math.abs(x - hx) < 10 && Math.abs(y - hy) < 10) {
                canvas.style.cursor = 'nwse-resize';
                return;
            }
        }
        canvas.style.cursor = 'default';
        return;
    }

    const panel = dragState.panel;
    if (dragState.type === 'move') {
        let nx = x - dragState.offsetX;
        let ny = y - dragState.offsetY;
        if (snapToGrid) {
            nx = Math.round(nx / gridSize) * gridSize;
            ny = Math.round(ny / gridSize) * gridSize;
        }
        panel.x = Math.max(0, Math.min(gameWidth - panel.width, nx));
        panel.y = Math.max(0, Math.min(gameHeight - panel.height, ny));
    } else {
        let nw = x - dragState.offsetX;
        let nh = y - dragState.offsetY;
        if (snapToGrid) {
            nw = Math.round(nw / gridSize) * gridSize;
            nh = Math.round(nh / gridSize) * gridSize;
        }
        panel.width = Math.max(40, Math.min(gameWidth - panel.x, nw));
        panel.height = Math.max(20, Math.min(gameHeight - panel.y, nh));
    }

    dirty = true;
    API.setDirty(true);
    renderProps();
    draw();
    document.getElementById('hud-info').textContent = `${panel.label}: ${Math.round(panel.x)},${Math.round(panel.y)} ${Math.round(panel.width)}x${Math.round(panel.height)}`;
}

function onMouseUp() {
    if (!dragState || !canvas) return;
    canvas.style.cursor = 'default';
    dragState = null;
}

function getEditorMetrics(panel) {
    const innerW = EDITOR_CANVAS_W - 100;
    const innerH = EDITOR_CANVAS_H - 100;
    const scale = Math.max(0.5, Math.min(innerW / Math.max(1, panel.width), innerH / Math.max(1, panel.height)));
    const offsetX = Math.round((EDITOR_CANVAS_W - panel.width * scale) / 2);
    const offsetY = Math.round((EDITOR_CANVAS_H - panel.height * scale) / 2);
    return { scale, offsetX, offsetY };
}

function getSubBounds(panel, subKey, sub, metrics) {
    const { scale, offsetX, offsetY } = metrics;
    const relX = Number(sub.relX) || 0;
    const relY = Number(sub.relY) || 0;
    const width = Math.max(14, Number(sub.width) || Math.max(40, (Number(sub.fontSize) || 12) * 3.6));
    const height = Math.max(12, Number(sub.height) || Math.max(18, (Number(sub.fontSize) || 12) * 1.4));
    let x = offsetX + relX * scale;
    let y = offsetY + relY * scale;

    if (subKey === 'subtitleText') {
        x -= (width * scale) / 2;
        y -= (height * scale) / 2;
    }

    return {
        x,
        y,
        w: Math.max(12, width * scale),
        h: Math.max(12, height * scale),
    };
}

function drawSubPreview(editor) {
    const { canvas: editorCanvas, ctx: editorCtx, panel, workingSubs, selectedSubKey } = editor;
    const metrics = getEditorMetrics(panel);
    editor.metrics = metrics;

    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.fillStyle = '#050910';
    editorCtx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

    // Grid lines
    editorCtx.strokeStyle = 'rgba(74,164,216,0.12)';
    editorCtx.lineWidth = 0.5;
    const subGridStep = Math.max(5, snapToGrid ? gridSize : 10);
    const scaledSubGrid = subGridStep * metrics.scale;
    for (let gx = metrics.offsetX; gx < metrics.offsetX + panel.width * metrics.scale; gx += scaledSubGrid) {
        editorCtx.beginPath();
        editorCtx.moveTo(gx, metrics.offsetY);
        editorCtx.lineTo(gx, metrics.offsetY + panel.height * metrics.scale);
        editorCtx.stroke();
    }
    for (let gy = metrics.offsetY; gy < metrics.offsetY + panel.height * metrics.scale; gy += scaledSubGrid) {
        editorCtx.beginPath();
        editorCtx.moveTo(metrics.offsetX, gy);
        editorCtx.lineTo(metrics.offsetX + panel.width * metrics.scale, gy);
        editorCtx.stroke();
    }

    const px = metrics.offsetX;
    const py = metrics.offsetY;
    const pw = panel.width * metrics.scale;
    const ph = panel.height * metrics.scale;

    editorCtx.fillStyle = 'rgba(2,8,16,0.9)';
    editorCtx.fillRect(px, py, pw, ph);
    editorCtx.strokeStyle = panel.color;
    editorCtx.lineWidth = 2;
    editorCtx.strokeRect(px, py, pw, ph);

    editorCtx.fillStyle = panel.color;
    editorCtx.font = '12px "Share Tech Mono", monospace';
    editorCtx.textAlign = 'left';
    editorCtx.fillText(panel.label, px + 8, py - 10);

    // Panel dimensions label
    editorCtx.fillStyle = 'rgba(255,255,255,0.4)';
    editorCtx.font = '10px monospace';
    editorCtx.fillText(`${Math.round(panel.width)} x ${Math.round(panel.height)}`, px + pw - 70, py - 10);

    Object.entries(workingSubs).forEach(([subKey, sub]) => {
        const bounds = getSubBounds(panel, subKey, sub, metrics);
        const color = sub.color || '#9be8ff';
        editorCtx.save();
        editorCtx.globalAlpha = Math.max(0.18, Number(sub.opacity) || 0.75);
        editorCtx.fillStyle = color;
        editorCtx.strokeStyle = selectedSubKey === subKey ? '#ffffff' : color;

        if (subKey === 'video') {
            // Video feed: translucent rectangle
            editorCtx.globalAlpha = 0.2;
            editorCtx.fillStyle = color;
            editorCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
            editorCtx.globalAlpha = 0.6;
            editorCtx.strokeStyle = selectedSubKey === subKey ? '#ffffff' : color;
            editorCtx.setLineDash([3, 3]);
            editorCtx.lineWidth = selectedSubKey === subKey ? 2 : 1;
            editorCtx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
            editorCtx.setLineDash([]);
            editorCtx.globalAlpha = 0.5;
            editorCtx.fillStyle = color;
            editorCtx.font = `${Math.max(9, 10 * metrics.scale)}px "Share Tech Mono", monospace`;
            editorCtx.textAlign = 'center';
            editorCtx.textBaseline = 'middle';
            editorCtx.fillText('VIDEO', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
        } else if (subKey === 'ekg' || subKey === 'actionBar' || subKey === 'overheat') {
            editorCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        } else if (subKey === 'button' || subKey === 'mapButton') {
            editorCtx.fillStyle = sub.bgColor || '#07172a';
            editorCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
            editorCtx.strokeStyle = sub.borderColor || color;
            editorCtx.lineWidth = selectedSubKey === subKey ? 2 : 1;
            editorCtx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
            editorCtx.fillStyle = color;
            editorCtx.font = `${Math.max(8, (Number(sub.fontSize) || 12) * metrics.scale * 0.8)}px "${sub.fontFamily || 'Share Tech Mono'}", monospace`;
            editorCtx.textAlign = 'center';
            editorCtx.textBaseline = 'middle';
            editorCtx.fillText(subKey === 'mapButton' ? 'MAP' : 'HEAL', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
        } else {
            editorCtx.fillStyle = color;
            editorCtx.font = `${Math.max(9, (Number(sub.fontSize) || 12) * metrics.scale * 0.8)}px "${sub.fontFamily || 'Share Tech Mono'}", monospace`;
            editorCtx.textAlign = subKey === 'subtitleText' ? 'center' : 'left';
            editorCtx.textBaseline = 'top';
            const sample = ({
                hp: '99',
                ammo: '42',
                name: 'R. RODRIGUEZ',
                weaponName: 'PULSE RIFLE',
                objectiveText: '[ ] CLEAR WAVES 0/3',
                title: 'MAP',
                subtitleText: 'Motion tracker picking up movement...',
            })[subKey] || sub.label || subKey;
            const textX = subKey === 'subtitleText' ? bounds.x + bounds.w / 2 : bounds.x;
            editorCtx.fillText(sample, textX, bounds.y);
        }

        // Selection / hover outline (skip video, it drew its own)
        if (subKey !== 'video') {
            editorCtx.strokeStyle = selectedSubKey === subKey ? '#ffffff' : color;
            editorCtx.lineWidth = selectedSubKey === subKey ? 2 : 1;
            editorCtx.setLineDash(selectedSubKey === subKey ? [6, 4] : []);
            editorCtx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
            editorCtx.setLineDash([]);
        }

        // Label below selected element
        if (selectedSubKey === subKey) {
            editorCtx.globalAlpha = 0.85;
            editorCtx.fillStyle = '#ffffff';
            editorCtx.font = '9px monospace';
            editorCtx.textAlign = 'left';
            editorCtx.textBaseline = 'top';
            editorCtx.fillText(`${sub.label || subKey}  (${Math.round(Number(sub.relX) || 0)}, ${Math.round(Number(sub.relY) || 0)})`, bounds.x, bounds.y + bounds.h + 3);
        }

        editorCtx.restore();
    });

    // Coordinate readout while dragging
    if (editor.drag) {
        const dragSub = workingSubs[editor.drag.subKey];
        if (dragSub) {
            editorCtx.save();
            editorCtx.fillStyle = 'rgba(0,0,0,0.7)';
            editorCtx.fillRect(4, editorCanvas.height - 22, 200, 18);
            editorCtx.fillStyle = '#9be8ff';
            editorCtx.font = '11px "Share Tech Mono", monospace';
            editorCtx.textAlign = 'left';
            editorCtx.textBaseline = 'middle';
            editorCtx.fillText(`${dragSub.label || editor.drag.subKey}: relX=${Math.round(Number(dragSub.relX) || 0)}  relY=${Math.round(Number(dragSub.relY) || 0)}`, 8, editorCanvas.height - 13);
            editorCtx.restore();
        }
    }
}

function renderPanelEditorList(editor) {
    const list = editor.list;
    list.innerHTML = Object.entries(editor.workingSubs).map(([subKey, sub]) => `
        <button type="button" class="btn btn-sm ${editor.selectedSubKey === subKey ? 'btn-primary' : 'btn-secondary'} hud-sub-item" data-sub="${subKey}" style="justify-content:flex-start;width:100%;margin-bottom:4px;text-align:left;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${sub.color || '#9be8ff'};margin-right:6px;flex-shrink:0;"></span>
            ${sub.label || subKey}
        </button>
    `).join('');

    list.querySelectorAll('.hud-sub-item').forEach((button) => {
        button.addEventListener('click', () => {
            editor.selectedSubKey = button.dataset.sub;
            renderPanelEditor(editor);
        });
    });
}

function renderPanelEditorForm(editor) {
    const sub = editor.workingSubs[editor.selectedSubKey];
    if (!sub) {
        editor.form.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Select an element.</div>';
        return;
    }

    const rows = [
        `<label>relX</label><input type="number" class="input input-sm hud-sub-field" data-field="relX" value="${Math.round(Number(sub.relX) || 0)}">`,
        `<label>relY</label><input type="number" class="input input-sm hud-sub-field" data-field="relY" value="${Math.round(Number(sub.relY) || 0)}">`,
    ];
    if ('width' in sub) rows.push(`<label>Width</label><input type="number" class="input input-sm hud-sub-field" data-field="width" value="${Math.round(Number(sub.width) || 0)}">`);
    if ('height' in sub) rows.push(`<label>Height</label><input type="number" class="input input-sm hud-sub-field" data-field="height" value="${Math.round(Number(sub.height) || 0)}">`);
    if ('fontSize' in sub) rows.push(`<label>Font Size</label><input type="number" class="input input-sm hud-sub-field" data-field="fontSize" value="${Math.round(Number(sub.fontSize) || 0)}">`);
    if ('opacity' in sub) rows.push(`<label>Opacity</label><input type="range" min="0" max="1" step="0.05" class="hud-sub-field" data-field="opacity" value="${Number(sub.opacity ?? 1)}" style="width:100%;"><span style="font-size:10px;color:var(--text-muted);">${Number(sub.opacity ?? 1).toFixed(2)}</span>`);
    if ('color' in sub && String(sub.color).startsWith('#')) rows.push(`<label>Color</label><input type="color" class="input input-sm hud-sub-field" data-field="color" value="${sub.color}" style="height:24px;cursor:pointer;">`);
    if ('color2' in sub && String(sub.color2).startsWith('#')) rows.push(`<label>Color 2</label><input type="color" class="input input-sm hud-sub-field" data-field="color2" value="${sub.color2}" style="height:24px;cursor:pointer;">`);
    if ('bgColor' in sub && String(sub.bgColor).startsWith('#')) rows.push(`<label>BG Color</label><input type="color" class="input input-sm hud-sub-field" data-field="bgColor" value="${sub.bgColor}" style="height:24px;cursor:pointer;">`);
    if ('borderColor' in sub && String(sub.borderColor).startsWith('#')) rows.push(`<label>Border</label><input type="color" class="input input-sm hud-sub-field" data-field="borderColor" value="${sub.borderColor}" style="height:24px;cursor:pointer;">`);

    // fontFamily dropdown
    if ('fontFamily' in sub) {
        const options = FONT_FAMILIES.map((f) => `<option value="${f}" ${sub.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('');
        rows.push(`<label>Font</label><select class="input input-sm hud-sub-field" data-field="fontFamily" style="width:100%;">${options}</select>`);
    }

    editor.form.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:${sub.color || '#9be8ff'};">${sub.label || editor.selectedSubKey}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-size:11px;">
            ${rows.join('')}
        </div>
        <div style="margin-top:8px;">
            <button class="btn btn-sm btn-secondary hud-sub-reset" style="font-size:10px;">Reset to Default</button>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-muted);">Drag on canvas or edit values. Grid snap: ${snapToGrid ? gridSize + 'px' : 'off'}</div>
    `;

    editor.form.querySelectorAll('.hud-sub-field').forEach((input) => {
        const eventType = input.type === 'range' ? 'input' : 'input';
        input.addEventListener(eventType, () => {
            const field = input.dataset.field;
            if (!field) return;
            if (field === 'color' || field === 'color2' || field === 'bgColor' || field === 'borderColor' || field === 'fontFamily') {
                sub[field] = input.value;
            } else if (field === 'opacity') {
                sub[field] = Math.max(0, Math.min(1, Number(input.value) || 0));
            } else {
                sub[field] = Number(input.value) || 0;
            }
            renderPanelEditor(editor);
        });
    });

    editor.form.querySelector('.hud-sub-reset')?.addEventListener('click', () => {
        const defaults = getSubElementDefaults(editor.panel.key);
        const defaultSub = defaults[editor.selectedSubKey];
        if (defaultSub) {
            editor.subUndoStack.push({ label: 'Reset ' + (sub.label || editor.selectedSubKey), state: JSON.stringify(editor.workingSubs) });
            editor.subRedoStack.length = 0;
            editor.workingSubs[editor.selectedSubKey] = deepClone(defaultSub);
            renderPanelEditor(editor);
        }
    });
}

function renderPanelEditor(editor) {
    renderPanelEditorList(editor);
    renderPanelEditorForm(editor);
    drawSubPreview(editor);
    updateSubUndoButtons(editor);
}

function updateSubUndoButtons(editor) {
    const undoBtn = editor.modal.footer.querySelector('#hud-sub-undo');
    const redoBtn = editor.modal.footer.querySelector('#hud-sub-redo');
    if (undoBtn) undoBtn.disabled = editor.subUndoStack.length === 0;
    if (redoBtn) redoBtn.disabled = editor.subRedoStack.length === 0;
}

function subUndo(editor) {
    if (editor.subUndoStack.length === 0) return;
    editor.subRedoStack.push({ label: 'redo', state: JSON.stringify(editor.workingSubs) });
    const entry = editor.subUndoStack.pop();
    editor.workingSubs = JSON.parse(entry.state);
    renderPanelEditor(editor);
}

function subRedo(editor) {
    if (editor.subRedoStack.length === 0) return;
    editor.subUndoStack.push({ label: 'undo', state: JSON.stringify(editor.workingSubs) });
    const entry = editor.subRedoStack.pop();
    editor.workingSubs = JSON.parse(entry.state);
    renderPanelEditor(editor);
}

function pushSubUndo(editor, label) {
    editor.subUndoStack.push({ label, state: JSON.stringify(editor.workingSubs) });
    if (editor.subUndoStack.length > MAX_UNDO) editor.subUndoStack.shift();
    editor.subRedoStack.length = 0;
}

function openPanelEditor(panel) {
    if (!panelHasSubEditor(panel.key)) return;
    const modal = API.showModal(`${panel.label} Element Editor`, { width: '1160px' });
    modal.body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;min-height:460px;">
            <div style="display:flex;flex-direction:column;gap:8px;">
                <div style="font-size:12px;color:var(--text-muted);">Drag elements inside the panel preview. Grid snap applies when enabled in the main editor. Save applies the updated element layout.</div>
                <canvas id="hud-sub-canvas" width="${EDITOR_CANVAS_W}" height="${EDITOR_CANVAS_H}" style="width:100%;max-width:${EDITOR_CANVAS_W}px;background:#050910;border:1px solid var(--border);border-radius:6px;cursor:crosshair;"></canvas>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;overflow-y:auto;max-height:460px;">
                <div>
                    <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Elements</div>
                    <div id="hud-sub-list" style="max-height:220px;overflow-y:auto;"></div>
                </div>
                <div style="padding:10px;border:1px solid var(--border);border-radius:6px;background:rgba(0,0,0,0.16);overflow-y:auto;" id="hud-sub-form"></div>
            </div>
        </div>
    `;
    modal.footer.innerHTML = `
        <button class="btn btn-sm btn-secondary" id="hud-sub-undo" disabled title="Undo (Ctrl+Z)">Undo</button>
        <button class="btn btn-sm btn-secondary" id="hud-sub-redo" disabled title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span style="flex:1;"></span>
        <button class="btn btn-sm btn-secondary" id="hud-sub-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="hud-sub-save">Save Elements</button>
    `;

    const editor = {
        panel,
        workingSubs: deepClone(panel.subs),
        selectedSubKey: Object.keys(panel.subs)[0] || null,
        canvas: modal.body.querySelector('#hud-sub-canvas'),
        ctx: modal.body.querySelector('#hud-sub-canvas').getContext('2d'),
        list: modal.body.querySelector('#hud-sub-list'),
        form: modal.body.querySelector('#hud-sub-form'),
        modal,
        drag: null,
        metrics: null,
        subUndoStack: [],
        subRedoStack: [],
    };

    const handlePointerDown = (event) => {
        const rect = editor.canvas.getBoundingClientRect();
        const scaleX = editor.canvas.width / rect.width;
        const scaleY = editor.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const metrics = editor.metrics || getEditorMetrics(panel);

        const entries = Object.entries(editor.workingSubs);
        for (let i = entries.length - 1; i >= 0; i -= 1) {
            const [subKey, sub] = entries[i];
            const bounds = getSubBounds(panel, subKey, sub, metrics);
            if (x < bounds.x || x > bounds.x + bounds.w || y < bounds.y || y > bounds.y + bounds.h) continue;
            editor.selectedSubKey = subKey;
            pushSubUndo(editor, 'Drag ' + (sub.label || subKey));
            editor.drag = { subKey, offsetX: x - bounds.x, offsetY: y - bounds.y };
            renderPanelEditor(editor);
            return;
        }
    };

    const handlePointerMove = (event) => {
        if (!editor.drag) return;
        const rect = editor.canvas.getBoundingClientRect();
        const scaleX = editor.canvas.width / rect.width;
        const scaleY = editor.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const metrics = editor.metrics || getEditorMetrics(panel);
        const sub = editor.workingSubs[editor.drag.subKey];
        if (!sub) return;

        let nextX = (x - editor.drag.offsetX - metrics.offsetX) / metrics.scale;
        let nextY = (y - editor.drag.offsetY - metrics.offsetY) / metrics.scale;

        // Grid snap for sub-element dragging
        if (snapToGrid) {
            nextX = Math.round(nextX / gridSize) * gridSize;
            nextY = Math.round(nextY / gridSize) * gridSize;
        }

        // Compute sub-element dimensions for clamping
        const subW = Number(sub.width) || Math.max(40, (Number(sub.fontSize) || 12) * 3.6);
        const subH = Number(sub.height) || Math.max(18, (Number(sub.fontSize) || 12) * 1.4);

        if (editor.drag.subKey === 'subtitleText') {
            // Centered text: relX/relY is center point
            const halfW = subW / 2;
            const halfH = subH / 2;
            const centerX = nextX + halfW;
            const centerY = nextY + halfH;
            sub.relX = Math.round(Math.max(halfW, Math.min(panel.width - halfW, centerX)));
            sub.relY = Math.round(Math.max(halfH, Math.min(panel.height - halfH, centerY)));
        } else {
            // Constrain to panel bounds
            sub.relX = Math.round(Math.max(0, Math.min(panel.width - subW, nextX)));
            sub.relY = Math.round(Math.max(0, Math.min(panel.height - subH, nextY)));
        }
        renderPanelEditor(editor);
    };

    const stopDrag = () => {
        editor.drag = null;
        // Redraw to clear coordinate readout
        drawSubPreview(editor);
    };

    // Keyboard handler for sub-element undo in modal
    const modalKeyHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            subUndo(editor);
        } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
            e.preventDefault();
            e.stopPropagation();
            subRedo(editor);
        }
    };

    editor.canvas.addEventListener('mousedown', handlePointerDown);
    editor.canvas.addEventListener('mousemove', handlePointerMove);
    editor.canvas.addEventListener('mouseup', stopDrag);
    editor.canvas.addEventListener('mouseleave', stopDrag);
    document.addEventListener('keydown', modalKeyHandler, true);

    modal.footer.querySelector('#hud-sub-undo').addEventListener('click', () => subUndo(editor));
    modal.footer.querySelector('#hud-sub-redo').addEventListener('click', () => subRedo(editor));

    modal.footer.querySelector('#hud-sub-cancel').addEventListener('click', () => {
        document.removeEventListener('keydown', modalKeyHandler, true);
        activePanelEditor = null;
        modal.close();
    });
    modal.footer.querySelector('#hud-sub-save').addEventListener('click', () => {
        pushUndo('Edit ' + panel.label + ' elements');
        panel.subs = deepClone(editor.workingSubs);
        dirty = true;
        API.setDirty(true);
        renderProps();
        draw();
        document.removeEventListener('keydown', modalKeyHandler, true);
        activePanelEditor = null;
        modal.close();
        API.toast(`Saved ${panel.label} element layout`, 'success');
    });

    activePanelEditor = editor;
    renderPanelEditor(editor);
}

export default {
    render(root) {
        buildUI(root);
    },
    async onShow() {
        await loadConfig();
        const wrap = document.getElementById('hud-canvas-wrap');
        if (resizeObserver) resizeObserver.disconnect();
        if (wrap) {
            resizeObserver = new ResizeObserver(() => resizeCanvas());
            resizeObserver.observe(wrap);
        }
    },
    onHide() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (activePanelEditor) {
            API.closeModal();
            activePanelEditor = null;
        }
    },
    async save() {
        if (dirty) await saveConfig();
    },
};
