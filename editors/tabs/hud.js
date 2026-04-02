/**
 * HUD Tab — Visual grid-based layout editor for existing HUD panels.
 * Panels can be repositioned, resized, and locked. Edit/Save per-panel.
 * Saves directly to server → src/data/hudConfig.js.
 */

const API = window.editorAPI;

// ── HUD panel definitions (mirrors HUD.js) ─────────────────────────────────
const PANEL_DEFS = [
    { key: 'leaderCard', label: 'Leader Card',    defaultX: 10,  defaultY: 30,  defaultW: 210, defaultH: 116, color: '#33ff66' },
    { key: 'techCard',   label: 'Tech Card',      defaultX: 228, defaultY: 30,  defaultW: 165, defaultH: 90,  color: '#7ecfff' },
    { key: 'medicCard',  label: 'Medic Card',     defaultX: 401, defaultY: 30,  defaultW: 165, defaultH: 90,  color: '#ff9966' },
    { key: 'heavyCard',  label: 'Heavy Card',     defaultX: 574, defaultY: 30,  defaultW: 165, defaultH: 90,  color: '#ff6666' },
    { key: 'objectivesPanel', label: 'Objectives', defaultX: 1060, defaultY: 40, defaultW: 200, defaultH: 50,  color: '#c47ae8' },
];

let config = {};
let panels = [];
let canvas = null;
let ctx = null;
let selectedPanel = null;
let editingPanel = null;  // Panel currently being sub-edited
let dragState = null;     // { panel, offsetX, offsetY, type: 'move'|'resize' }
let dirty = false;

// Grid settings
let gridSize = 10;
let snapToGrid = true;
let showGrid = true;
let gameWidth = 1280;
let gameHeight = 720;

function buildUI(root) {
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <!-- Left: panel list + settings -->
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

                <!-- Panel properties (when selected) -->
                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header">Properties</div>
                    <div class="panel-body" style="flex:1;padding:8px;overflow-y:auto;" id="hud-props">
                        <div style="color:var(--text-muted);font-size:12px;">Select a panel to edit its properties</div>
                    </div>
                </div>
            </aside>

            <!-- Main: toolbar + visual canvas -->
            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="hud-reset" title="Reset to defaults">Reset All</button>
                        <button class="btn btn-sm btn-secondary" id="hud-reload" title="Reload from server">↻ Reload</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <span id="hud-info" style="font-size:11px;color:var(--text-muted);">Click and drag panels to reposition</span>
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

    // Events
    document.getElementById('hud-grid-size').addEventListener('change', (e) => { gridSize = parseInt(e.target.value) || 10; draw(); });
    document.getElementById('hud-snap').addEventListener('change', (e) => { snapToGrid = e.target.checked; });
    document.getElementById('hud-show-grid').addEventListener('change', (e) => { showGrid = e.target.checked; draw(); });
    document.getElementById('hud-game-w').addEventListener('change', (e) => { gameWidth = parseInt(e.target.value) || 1280; resizeCanvas(); });
    document.getElementById('hud-game-h').addEventListener('change', (e) => { gameHeight = parseInt(e.target.value) || 720; resizeCanvas(); });
    document.getElementById('hud-save').addEventListener('click', saveConfig);
    document.getElementById('hud-reset').addEventListener('click', resetToDefaults);
    document.getElementById('hud-reload').addEventListener('click', loadConfig);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    resizeCanvas();
}

function resizeCanvas() {
    // Scale canvas to fit while maintaining aspect ratio
    const wrap = document.getElementById('hud-canvas-wrap');
    if (!wrap) return;
    const maxW = wrap.clientWidth - 40;
    const maxH = wrap.clientHeight - 40;
    const scale = Math.min(maxW / gameWidth, maxH / gameHeight, 1);
    canvas.width = Math.round(gameWidth * scale);
    canvas.height = Math.round(gameHeight * scale);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    canvas._scale = scale;
    draw();
}

// ── Config load/save ───────────────────────────────────────────────────────
async function loadConfig() {
    try {
        const resp = await API.apiFetch('/api/hud-config');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        config = data.config || {};
        buildPanels();
        renderPanelList();
        draw();
        API.setStatus('HUD config loaded');
    } catch (err) {
        API.toast('Failed to load HUD config: ' + err.message, 'error');
        config = {};
        buildPanels();
    }
}

function buildPanels() {
    panels = PANEL_DEFS.map(def => {
        const cfg = config[def.key] || {};
        return {
            key: def.key,
            label: def.label,
            color: cfg._color ?? def.color,  // Load custom color from config
            x: cfg.x ?? def.defaultX,
            y: cfg.y ?? def.defaultY,
            width: cfg.width ?? def.defaultW,
            height: cfg.height ?? def.defaultH,
            subs: cfg._subs || {},
            locked: false,
        };
    });
}

function panelsToConfig() {
    const out = {};
    for (const p of panels) {
        out[p.key] = {
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: Math.round(p.width),
            height: Math.round(p.height),
        };
        // Save custom color if it's different from default
        const def = PANEL_DEFS.find(d => d.key === p.key);
        if (p.color !== def?.color) {
            out[p.key]._color = p.color;
        }
        if (Object.keys(p.subs).length > 0) {
            out[p.key]._subs = p.subs;
        }
    }
    return out;
}

async function saveConfig() {
    const cfg = panelsToConfig();
    try {
        const resp = await API.apiFetch('/api/hud-config', {
            method: 'POST',
            body: JSON.stringify(cfg),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        config = cfg;
        dirty = false;
        API.recordSave();
        API.toast('HUD config saved to game', 'success');
    } catch (err) {
        API.toast('Save failed: ' + err.message, 'error');
    }
}

function resetToDefaults() {
    if (!confirm('Reset all panels to default positions?')) return;
    config = {};
    buildPanels();
    renderPanelList();
    draw();
    dirty = true;
    API.setDirty(true);
}

// ── Panel list ─────────────────────────────────────────────────────────────
function renderPanelList() {
    const el = document.getElementById('hud-panel-list');
    el.innerHTML = panels.map(p => `
        <div class="hud-panel-item" data-key="${p.key}"
             style="display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);
                    ${selectedPanel?.key === p.key ? 'background:rgba(74,164,216,0.15);' : ''}">
            <div style="width:12px;height:12px;border-radius:2px;background:${p.color};flex-shrink:0;"></div>
            <span style="flex:1;font-size:12px;">${p.label}</span>
            <button class="btn btn-sm btn-icon hud-edit-btn" data-key="${p.key}"
                    title="${editingPanel?.key === p.key ? 'Save sub-elements' : 'Edit sub-elements'}"
                    style="font-size:10px;padding:2px 6px;
                           ${editingPanel?.key === p.key ? 'background:var(--accent);color:#fff;' : ''}">
                ${editingPanel?.key === p.key ? '✓ Save' : '✎ Edit'}
            </button>
            <button class="btn btn-sm btn-icon hud-lock-btn" data-key="${p.key}"
                    title="${p.locked ? 'Unlock' : 'Lock'}" style="font-size:10px;padding:2px 4px;">
                ${p.locked ? '🔒' : '🔓'}
            </button>
        </div>
    `).join('');

    el.querySelectorAll('.hud-panel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.hud-edit-btn') || e.target.closest('.hud-lock-btn')) return;
            selectPanel(panels.find(p => p.key === item.dataset.key));
        });
    });

    el.querySelectorAll('.hud-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = panels.find(p => p.key === btn.dataset.key);
            if (editingPanel?.key === panel.key) {
                editingPanel = null;  // Save/exit edit mode
            } else {
                editingPanel = panel;
            }
            renderPanelList();
            draw();
        });
    });

    el.querySelectorAll('.hud-lock-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = panels.find(p => p.key === btn.dataset.key);
            panel.locked = !panel.locked;
            renderPanelList();
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
    if (!selectedPanel) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Select a panel</div>';
        return;
    }
    const p = selectedPanel;
    el.innerHTML = `
        <div style="margin-bottom:8px;font-weight:600;color:${p.color};">${p.label}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
            <label>X:</label><input type="number" class="input input-sm" id="hp-x" value="${Math.round(p.x)}" style="width:80px;">
            <label>Y:</label><input type="number" class="input input-sm" id="hp-y" value="${Math.round(p.y)}" style="width:80px;">
            <label>Width:</label><input type="number" class="input input-sm" id="hp-w" value="${Math.round(p.width)}" style="width:80px;">
            <label>Height:</label><input type="number" class="input input-sm" id="hp-h" value="${Math.round(p.height)}" style="width:80px;">
            <label>Color:</label><input type="color" class="input input-sm" id="hp-color" value="${p.color}" style="width:80px;height:28px;cursor:pointer;">
        </div>
        ${Object.keys(p.subs).length > 0 ? `
            <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Sub-elements:</div>
            ${Object.entries(p.subs).map(([name, sub]) => `
                <div style="margin-top:4px;padding:4px;border:1px solid var(--border);border-radius:3px;">
                    <div style="font-size:11px;font-weight:500;margin-bottom:2px;">${name}</div>
                    <div style="display:flex;gap:4px;font-size:11px;">
                        <label>relX:</label><input type="number" class="input input-sm sub-input" data-sub="${name}" data-prop="relX" value="${sub.relX || 0}" style="width:50px;">
                        <label>relY:</label><input type="number" class="input input-sm sub-input" data-sub="${name}" data-prop="relY" value="${sub.relY || 0}" style="width:50px;">
                    </div>
                </div>
            `).join('')}
        ` : ''}
        <button class="btn btn-sm btn-secondary" id="hp-apply" style="margin-top:8px;">Apply</button>
    `;

    document.getElementById('hp-apply')?.addEventListener('click', () => {
        p.x = parseInt(document.getElementById('hp-x').value) || p.x;
        p.y = parseInt(document.getElementById('hp-y').value) || p.y;
        p.width = parseInt(document.getElementById('hp-w').value) || p.width;
        p.height = parseInt(document.getElementById('hp-h').value) || p.height;
        p.color = document.getElementById('hp-color').value || p.color;

        document.querySelectorAll('.sub-input').forEach(inp => {
            const sub = inp.dataset.sub;
            const prop = inp.dataset.prop;
            if (p.subs[sub]) p.subs[sub][prop] = parseInt(inp.value) || 0;
        });

        dirty = true; API.setDirty(true);
        draw();
        API.toast(`Updated ${p.label}`, 'info');
    });
}

// ── Drawing ────────────────────────────────────────────────────────────────
function draw() {
    if (!ctx || !canvas) return;
    const scale = canvas._scale || 1;
    const cw = canvas.width, ch = canvas.height;

    // Dark game background
    ctx.fillStyle = '#020810';
    ctx.fillRect(0, 0, cw, ch);

    // Grid
    if (showGrid) {
        ctx.strokeStyle = 'rgba(74,164,216,0.08)';
        ctx.lineWidth = 1;
        const gs = gridSize * scale;
        for (let x = 0; x < cw; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
        for (let y = 0; y < ch; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
    }

    // Game area border
    ctx.strokeStyle = 'rgba(74,164,216,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, cw, ch);

    // Safe area indicators
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const margin = 10 * scale;
    ctx.strokeRect(margin, margin, cw - margin * 2, ch - margin * 2);
    ctx.setLineDash([]);

    // Draw panels
    for (const p of panels) {
        const px = p.x * scale, py = p.y * scale;
        const pw = p.width * scale, ph = p.height * scale;
        const isSelected = selectedPanel?.key === p.key;
        const isEditing = editingPanel?.key === p.key;

        // Panel fill
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = p.color;
        ctx.fillRect(px, py, pw, ph);
        ctx.globalAlpha = 1;

        // Panel border
        ctx.strokeStyle = p.color;
        ctx.lineWidth = isSelected ? 2 : 1;
        if (isEditing) {
            ctx.setLineDash([6, 3]);
        }
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = p.color;
        ctx.font = `${Math.max(9, 11 * scale)}px "Share Tech Mono", monospace`;
        ctx.fillText(p.label, px + 4, py + 12 * scale);
        ctx.font = `${Math.max(7, 9 * scale)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.width)}×${Math.round(p.height)}`, px + 4, py + 22 * scale);

        // Locked indicator
        if (p.locked) {
            ctx.fillStyle = 'rgba(255,100,100,0.6)';
            ctx.font = `${12 * scale}px sans-serif`;
            ctx.fillText('🔒', px + pw - 16 * scale, py + 14 * scale);
        }

        // Resize handle (bottom-right)
        if (isSelected && !p.locked) {
            ctx.fillStyle = p.color;
            ctx.fillRect(px + pw - 8, py + ph - 8, 8, 8);
        }

        // Draw sub-elements if editing
        if (isEditing && p.subs) {
            for (const [name, sub] of Object.entries(p.subs)) {
                const sx = (p.x + (sub.relX || 0)) * scale;
                const sy = (p.y + (sub.relY || 0)) * scale;
                ctx.strokeStyle = 'rgba(255,255,0,0.6)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx, sy, 30 * scale, 16 * scale);
                ctx.fillStyle = 'rgba(255,255,0,0.7)';
                ctx.font = `${8 * scale}px monospace`;
                ctx.fillText(name, sx + 2, sy + 10 * scale);
            }
        }
    }
}

// ── Mouse interaction ──────────────────────────────────────────────────────
function canvasToGame(cx, cy) {
    const scale = canvas._scale || 1;
    return { x: cx / scale, y: cy / scale };
}

function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const { x, y } = canvasToGame(cx, cy);
    const scale = canvas._scale || 1;

    // Check resize handle first (for selected panel)
    if (selectedPanel && !selectedPanel.locked) {
        const p = selectedPanel;
        const hx = p.x + p.width, hy = p.y + p.height;
        if (Math.abs(x - hx) < 10 / scale && Math.abs(y - hy) < 10 / scale) {
            dragState = { panel: p, offsetX: x - p.width, offsetY: y - p.height, type: 'resize' };
            canvas.style.cursor = 'nwse-resize';
            return;
        }
    }

    // Check panel hit
    for (let i = panels.length - 1; i >= 0; i--) {
        const p = panels[i];
        if (x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height) {
            selectPanel(p);
            if (!p.locked) {
                dragState = { panel: p, offsetX: x - p.x, offsetY: y - p.y, type: 'move' };
                canvas.style.cursor = 'grabbing';
            }
            return;
        }
    }

    selectPanel(null);
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const { x, y } = canvasToGame(cx, cy);

    if (!dragState) {
        // Cursor hints
        if (selectedPanel && !selectedPanel.locked) {
            const p = selectedPanel;
            const scale = canvas._scale || 1;
            const hx = p.x + p.width, hy = p.y + p.height;
            if (Math.abs(x - hx) < 10 / scale && Math.abs(y - hy) < 10 / scale) {
                canvas.style.cursor = 'nwse-resize';
                return;
            }
        }
        canvas.style.cursor = 'default';
        return;
    }

    const p = dragState.panel;
    if (dragState.type === 'move') {
        let nx = x - dragState.offsetX;
        let ny = y - dragState.offsetY;
        if (snapToGrid) { nx = Math.round(nx / gridSize) * gridSize; ny = Math.round(ny / gridSize) * gridSize; }
        p.x = Math.max(0, Math.min(gameWidth - p.width, nx));
        p.y = Math.max(0, Math.min(gameHeight - p.height, ny));
    } else if (dragState.type === 'resize') {
        let nw = x - dragState.offsetX;
        let nh = y - dragState.offsetY;
        if (snapToGrid) { nw = Math.round(nw / gridSize) * gridSize; nh = Math.round(nh / gridSize) * gridSize; }
        p.width = Math.max(40, Math.min(gameWidth - p.x, nw));
        p.height = Math.max(20, Math.min(gameHeight - p.y, nh));
    }

    dirty = true;
    API.setDirty(true);
    renderProps();
    draw();

    document.getElementById('hud-info').textContent = `${p.label}: ${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.width)}×${Math.round(p.height)}`;
}

function onMouseUp() {
    if (dragState) {
        canvas.style.cursor = 'default';
        dragState = null;
    }
}

// ── Exports ────────────────────────────────────────────────────────────────
export default {
    render(root) { buildUI(root); },
    async onShow() {
        await loadConfig();
        // Re-observe for resizes
        const wrap = document.getElementById('hud-canvas-wrap');
        if (wrap) {
            const ro = new ResizeObserver(() => resizeCanvas());
            ro.observe(wrap);
        }
    },
    onHide() {},
    async save() { if (dirty) await saveConfig(); },
};
