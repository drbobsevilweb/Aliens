/**
 * SVG Action Graph Editor
 * Visual node-based editor for defining SVG spawn behavior and environment reactions.
 * Built on the same canvas graph pattern as story.js.
 *
 * Data contract:
 *   Each "action graph" defines a complete SVG FX pipeline:
 *   Trigger → Source → Spawn → Motion/Environment → Visual → Cleanup
 *
 *   Graphs persist to /api/svg-actions (data/svg_actions/*.json).
 *   Game runtime reads them to drive particle/debris/acid FX.
 */

const API = window.editorAPI;

// ── State ──────────────────────────────────────────────────────────────────
let canvas = null, ctx = null;
let graphs = [];
let currentGraph = null;
let dirty = false;

// View
let panX = 0, panY = 0, zoom = 1;
let isPanning = false, panStart = null;
let rafId = null;

// Interaction
let selectedNodeIds = new Set();
let selectedConnId = null;
let draggingNode = null, dragOffX = 0, dragOffY = 0;
let portDrag = null;
let hoveredPort = null;
let needRedraw = true;

// Sidebar
let propsEl = null;
let svgFileList = [];    // populated from /api/svg-assets
let soundList = [];

// ── Node geometry ───────────────────────────────────────────────────────────
const NODE_W = 220, NODE_H = 80, NODE_TITLE = 24, PORT_R = 7;

// ── Node type registry ──────────────────────────────────────────────────────
const NODE_TYPES = {
    // Triggers — when does this FX fire?
    trigger: {
        label: 'TRIGGER',
        color: '#1d6e3a',
        headerColor: '#28a05a',
        ports: { in: false, out: true },
        icon: '⚡',
    },
    // Source — what SVG asset to use
    source: {
        label: 'SVG SOURCE',
        color: '#1a3d6e',
        headerColor: '#2563a8',
        ports: { in: true, out: true },
        icon: '◈',
    },
    // Spawn — where and how many to create
    spawn: {
        label: 'SPAWN',
        color: '#4a1d8c',
        headerColor: '#6b2fcf',
        ports: { in: true, out: true },
        icon: '✦',
    },
    // Motion — how the SVG moves over time
    motion: {
        label: 'MOTION',
        color: '#7a4110',
        headerColor: '#c06820',
        ports: { in: true, out: true },
        icon: '→',
    },
    // Environment — reactions to game world
    environment: {
        label: 'ENVIRONMENT',
        color: '#2a5a5a',
        headerColor: '#3a8888',
        ports: { in: true, out: true },
        icon: '◉',
    },
    // Visual — appearance changes over lifetime
    visual: {
        label: 'VISUAL',
        color: '#6e1a5a',
        headerColor: '#a82878',
        ports: { in: true, out: true },
        icon: '◐',
    },
    // Cleanup — end-of-life behavior
    cleanup: {
        label: 'CLEANUP',
        color: '#2a2a2a',
        headerColor: '#555555',
        ports: { in: true, out: false },
        icon: '✖',
    },
};

// ── Trigger conditions ──────────────────────────────────────────────────────
const TRIGGER_EVENTS = [
    'alien_death', 'alien_damage', 'facehugger_death', 'drone_death',
    'queen_death', 'egg_death', 'bullet_hit_wall', 'bullet_hit_alien',
    'acid_splash', 'door_breach', 'explosion', 'marine_damage', 'custom',
];

// ── Spawn modes ─────────────────────────────────────────────────────────────
const SPAWN_MODES = ['at_entity', 'at_position', 'burst', 'ring', 'cone', 'line', 'random_area'];

// ── Motion types ────────────────────────────────────────────────────────────
const MOTION_TYPES = ['gravity', 'drift', 'float_up', 'orbit', 'bounce', 'follow_path', 'scatter', 'static'];

// ── Environment reactions ───────────────────────────────────────────────────
const ENV_REACTIONS = ['stick_floor', 'slide_wall', 'pool_ground', 'react_lighting', 'avoid_walls', 'follow_surface', 'depth_sort'];

// ── Visual effects ──────────────────────────────────────────────────────────
const VISUAL_EFFECTS = ['fade_in', 'fade_out', 'scale_grow', 'scale_shrink', 'rotate_spin', 'color_shift', 'pulse', 'flicker'];

// ── Cleanup modes ───────────────────────────────────────────────────────────
const CLEANUP_MODES = ['after_time', 'off_screen', 'on_collision', 'on_fade', 'after_distance'];

// ── Utility ─────────────────────────────────────────────────────────────────
function uid() { return 'sa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function connId(from, to) { return `${from}→${to}`; }
function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function defaultData(type) {
    switch (type) {
        case 'trigger':
            return { event: 'alien_death', entityType: 'warrior', customEvent: '', description: '' };
        case 'source':
            return {
                sourceType: 'svg_file',  // svg_file | procedural | texture
                svgFile: '', category: 'corpse',
                proceduralShape: 'star', proceduralSize: 24,
                tint: '#98c322', tintEnabled: false,
                scaleMin: 0.8, scaleMax: 1.2,
            };
        case 'spawn':
            return {
                mode: 'burst', count: 5, countMax: 8,
                spreadRadius: 32, angle: 0, arc: 360,
                offsetX: 0, offsetY: 0,
                velocityMin: 50, velocityMax: 150,
                inheritVelocity: false, inheritAngle: true,
            };
        case 'motion':
            return {
                type: 'gravity', gravity: 200,
                driftX: 0, driftY: -30,
                orbitRadius: 40, orbitSpeed: 2,
                bounceDecay: 0.6, friction: 0.98,
                maxSpeed: 300,
            };
        case 'environment':
            return {
                reaction: 'stick_floor', stickDelay: 500,
                floorDepth: 2.5, wallBounce: 0.5,
                lightReactive: false, lightIntensity: 0.5,
                depthOffset: 0,
            };
        case 'visual':
            return {
                effect: 'fade_out', duration: 1000,
                startAlpha: 1.0, endAlpha: 0.0,
                startScale: 1.0, endScale: 0.5,
                rotationSpeed: 0, rotationRandomize: true,
                colorFrom: '#98c322', colorTo: '#445500',
                easing: 'linear', // linear | quad_in | quad_out | sine
                blendMode: 'NORMAL',
            };
        case 'cleanup':
            return {
                mode: 'after_time', lifetime: 3000,
                fadeBeforeCleanup: true, fadeDuration: 500,
                maxDistance: 400,
            };
        default:
            return {};
    }
}

function makeNode(type, x, y) {
    return { id: uid(), type, x, y, data: defaultData(type) };
}

// ── Serialise ────────────────────────────────────────────────────────────────
function graphToJSON() {
    return JSON.parse(JSON.stringify(currentGraph));
}

// ── Canvas transforms ────────────────────────────────────────────────────────
function worldToScreen(wx, wy) { return { sx: wx * zoom + panX, sy: wy * zoom + panY }; }
function screenToWorld(sx, sy) { return { wx: (sx - panX) / zoom, wy: (sy - panY) / zoom }; }

// ── Hit testing ──────────────────────────────────────────────────────────────
function nodeAt(wx, wy) {
    if (!currentGraph) return null;
    for (let i = currentGraph.nodes.length - 1; i >= 0; i--) {
        const n = currentGraph.nodes[i];
        if (wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H) return n;
    }
    return null;
}

function outPortPos(n) { return { x: n.x + NODE_W, y: n.y + NODE_H / 2 }; }
function inPortPos(n) { return { x: n.x, y: n.y + NODE_H / 2 }; }

function portHit(wx, wy) {
    if (!currentGraph) return null;
    for (const n of currentGraph.nodes) {
        const cfg = NODE_TYPES[n.type];
        if (cfg.ports.out) {
            const op = outPortPos(n);
            if (Math.hypot(wx - op.x, wy - op.y) <= PORT_R + 4) return { nodeId: n.id, port: 'out' };
        }
        if (cfg.ports.in) {
            const ip = inPortPos(n);
            if (Math.hypot(wx - ip.x, wy - ip.y) <= PORT_R + 4) return { nodeId: n.id, port: 'in' };
        }
    }
    return null;
}

function connAt(wx, wy) {
    if (!currentGraph) return null;
    for (const c of currentGraph.connections) {
        const from = currentGraph.nodes.find(n => n.id === c.fromNode);
        const to = currentGraph.nodes.find(n => n.id === c.toNode);
        if (!from || !to) continue;
        const p0 = outPortPos(from), p3 = inPortPos(to);
        const cpx = (p0.x + p3.x) / 2;
        for (let t = 0; t <= 1; t += 0.05) {
            const bx = Math.pow(1 - t, 3) * p0.x + 3 * Math.pow(1 - t, 2) * t * cpx + 3 * (1 - t) * t * t * cpx + t * t * t * p3.x;
            const by = Math.pow(1 - t, 3) * p0.y + 3 * Math.pow(1 - t, 2) * t * p0.y + 3 * (1 - t) * t * t * p3.y + t * t * t * p3.y;
            if (Math.hypot(wx - bx, wy - by) < 6 / zoom) return c.id;
        }
    }
    return null;
}

// ── Render ────────────────────────────────────────────────────────────────────
function draw() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    const gs = 40 * zoom;
    const ox = ((panX % gs) + gs) % gs;
    const oy = ((panY % gs) + gs) % gs;
    for (let x = ox; x < canvas.width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = oy; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.restore();

    if (!currentGraph) {
        ctx.fillStyle = '#555';
        ctx.font = '14px "Share Tech Mono",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Select or create an action graph from the list', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
        return;
    }

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Connections
    for (const c of currentGraph.connections) {
        const from = currentGraph.nodes.find(n => n.id === c.fromNode);
        const to = currentGraph.nodes.find(n => n.id === c.toNode);
        if (!from || !to) continue;
        drawConnection(from, to, selectedConnId === c.id);
    }

    // In-progress drag
    if (portDrag) {
        const fromNode = currentGraph.nodes.find(n => n.id === portDrag.nodeId);
        if (fromNode) {
            const p0 = outPortPos(fromNode);
            drawBezier(p0.x, p0.y, portDrag.curX, portDrag.curY, 'rgba(152,195,34,0.6)', false);
        }
    }

    // Nodes
    for (const n of currentGraph.nodes) drawNode(n);

    ctx.restore();
}

function drawConnection(from, to, selected) {
    const p0 = outPortPos(from), p3 = inPortPos(to);
    const fromCfg = NODE_TYPES[from.type];
    const toCfg = NODE_TYPES[to.type];
    const color = selected ? '#98c322' : blendColors(fromCfg.headerColor, toCfg.headerColor, 0.5, 0.5);
    drawBezier(p0.x, p0.y, p3.x, p3.y, color, selected);
}

function blendColors(c1, c2, a1, a2) {
    // Simple average — returns rgba string at reduced alpha
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round((r1 + r2) / 2), g = Math.round((g1 + g2) / 2), b = Math.round((b1 + b2) / 2);
    return `rgba(${r},${g},${b},0.55)`;
}

function drawBezier(x0, y0, x3, y3, color, thick) {
    const cpx = (x0 + x3) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cpx, y0, cpx, y3, x3, y3);
    ctx.strokeStyle = color;
    ctx.lineWidth = (thick ? 3 : 2) / zoom;
    ctx.stroke();

    // Arrow head at destination
    const t = 0.96;
    const bx = Math.pow(1 - t, 3) * x0 + 3 * Math.pow(1 - t, 2) * t * cpx + 3 * (1 - t) * t * t * cpx + t * t * t * x3;
    const by = Math.pow(1 - t, 3) * y0 + 3 * Math.pow(1 - t, 2) * t * y0 + 3 * (1 - t) * t * t * y3 + t * t * t * y3;
    const angle = Math.atan2(y3 - by, x3 - bx);
    const arrowLen = 8 / zoom;
    ctx.beginPath();
    ctx.moveTo(x3, y3);
    ctx.lineTo(x3 - arrowLen * Math.cos(angle - 0.4), y3 - arrowLen * Math.sin(angle - 0.4));
    ctx.moveTo(x3, y3);
    ctx.lineTo(x3 - arrowLen * Math.cos(angle + 0.4), y3 - arrowLen * Math.sin(angle + 0.4));
    ctx.stroke();
}

function drawNode(n) {
    const cfg = NODE_TYPES[n.type];
    const selected = selectedNodeIds.has(n.id);

    if (selected) { ctx.shadowColor = '#98c322'; ctx.shadowBlur = 12 / zoom; }

    // Body
    ctx.fillStyle = cfg.color;
    roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 6 / zoom);
    ctx.fill();

    // Header
    ctx.fillStyle = cfg.headerColor;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, n.x, n.y, NODE_W, NODE_TITLE, 6 / zoom, true, false);
    ctx.fill();
    ctx.restore();

    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = selected ? '#98c322' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = (selected ? 2 : 1) / zoom;
    roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 6 / zoom);
    ctx.stroke();

    // Icon + title
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${11 / zoom}px "Share Tech Mono",monospace`;
    ctx.fillText(`${cfg.icon} ${cfg.label}`, n.x + 8 / zoom, n.y + (NODE_TITLE - 7) / zoom);

    // Summary lines
    ctx.font = `${10 / zoom}px "Share Tech Mono",monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const lines = nodeSummary(n);
    const maxW = (NODE_W - 16) / zoom;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        ctx.fillText(truncate(ctx, lines[i], maxW), n.x + 8 / zoom, n.y + (NODE_TITLE + 14 + i * 14) / zoom);
    }

    // Output port
    if (cfg.ports.out) {
        const op = outPortPos(n);
        const hp = hoveredPort;
        ctx.beginPath();
        ctx.arc(op.x, op.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'out') ? '#98c322' : '#3a6e3a';
        ctx.fill();
        ctx.strokeStyle = '#8cc88c'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    }

    // Input port
    if (cfg.ports.in) {
        const ip = inPortPos(n);
        const hp = hoveredPort;
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'in') ? '#98c322' : '#3a6e3a';
        ctx.fill();
        ctx.strokeStyle = '#8cc88c'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    }
}

function nodeSummary(n) {
    switch (n.type) {
        case 'trigger':
            return [
                `event: ${n.data.event}`,
                n.data.event !== 'custom' ? `target: ${n.data.entityType}` : `key: ${n.data.customEvent || '—'}`,
            ];
        case 'source':
            if (n.data.sourceType === 'svg_file') return [`file: ${n.data.svgFile || '(none)'}`, `cat: ${n.data.category}`];
            if (n.data.sourceType === 'procedural') return [`shape: ${n.data.proceduralShape}`, `size: ${n.data.proceduralSize}px`];
            return [`type: ${n.data.sourceType}`];
        case 'spawn':
            return [`mode: ${n.data.mode}`, `count: ${n.data.count}–${n.data.countMax}`, `spread: ${n.data.spreadRadius}px`];
        case 'motion':
            return [`type: ${n.data.type}`, n.data.type === 'gravity' ? `g: ${n.data.gravity}` : `drift: ${n.data.driftX},${n.data.driftY}`];
        case 'environment':
            return [`reaction: ${n.data.reaction}`, n.data.lightReactive ? 'light-reactive' : ''];
        case 'visual':
            return [`effect: ${n.data.effect}`, `duration: ${n.data.duration}ms`, `easing: ${n.data.easing}`];
        case 'cleanup':
            return [`mode: ${n.data.mode}`, n.data.mode === 'after_time' ? `${n.data.lifetime}ms` : `dist: ${n.data.maxDistance}px`];
        default:
            return [''];
    }
}

function truncate(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    while (text.length > 0 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    roundRectPath(c, x, y, w, h, r, true, true);
}

function roundRectPath(c, x, y, w, h, r, topRound, bottomRound) {
    const tr = topRound ? r : 0, br = bottomRound ? r : 0;
    c.moveTo(x + tr, y);
    c.lineTo(x + w - tr, y);
    if (topRound) c.arcTo(x + w, y, x + w, y + r, r); else c.lineTo(x + w, y);
    c.lineTo(x + w, y + h - br);
    if (bottomRound) c.arcTo(x + w, y + h, x + w - r, y + h, r); else c.lineTo(x + w, y + h);
    c.lineTo(x + br, y + h);
    if (bottomRound) c.arcTo(x, y + h, x, y + h - r, r); else c.lineTo(x, y + h);
    c.lineTo(x, y + tr);
    if (topRound) c.arcTo(x, y, x + r, y, r); else c.lineTo(x, y);
    c.closePath();
}

// ── Mouse handlers ───────────────────────────────────────────────────────────
function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning = true;
        panStart = { sx, sy, px: panX, py: panY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button === 2) { showContextMenu(e, wx, wy); return; }

    // Port hit
    const ph = portHit(wx, wy);
    if (ph && ph.port === 'out') {
        portDrag = { nodeId: ph.nodeId, port: 'out', curX: wx, curY: wy };
        needRedraw = true;
        return;
    }

    // Node hit
    const n = nodeAt(wx, wy);
    if (n) {
        if (!selectedNodeIds.has(n.id)) {
            selectedNodeIds.clear();
            selectedNodeIds.add(n.id);
            selectedConnId = null;
        }
        draggingNode = n;
        dragOffX = wx - n.x;
        dragOffY = wy - n.y;
        renderProps();
        needRedraw = true;
        return;
    }

    // Connection hit
    const cid = connAt(wx, wy);
    if (cid) {
        selectedConnId = cid;
        selectedNodeIds.clear();
        renderProps();
        needRedraw = true;
        return;
    }

    selectedNodeIds.clear();
    selectedConnId = null;
    renderProps();
    needRedraw = true;
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const { wx, wy } = screenToWorld(sx, sy);

    if (isPanning && panStart) {
        panX = panStart.px + (sx - panStart.sx);
        panY = panStart.py + (sy - panStart.sy);
        needRedraw = true;
        return;
    }

    if (portDrag) {
        portDrag.curX = wx; portDrag.curY = wy;
        hoveredPort = portHit(wx, wy);
        needRedraw = true;
        return;
    }

    if (draggingNode) {
        draggingNode.x = wx - dragOffX;
        draggingNode.y = wy - dragOffY;
        dirty = true; API.setDirty(true);
        needRedraw = true;
        return;
    }

    const ph = portHit(wx, wy);
    if (ph !== hoveredPort) { hoveredPort = ph; needRedraw = true; }
}

function onMouseUp(e) {
    canvas.style.cursor = 'default';
    if (isPanning) { isPanning = false; panStart = null; return; }

    if (portDrag) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const { wx, wy } = screenToWorld(sx, sy);
        const ph = portHit(wx, wy);
        if (ph && ph.port === 'in' && ph.nodeId !== portDrag.nodeId) {
            const existing = currentGraph.connections.find(
                c => c.fromNode === portDrag.nodeId && c.toNode === ph.nodeId
            );
            if (!existing) {
                currentGraph.connections.push({
                    id: connId(portDrag.nodeId, ph.nodeId),
                    fromNode: portDrag.nodeId, fromPort: 'out',
                    toNode: ph.nodeId, toPort: 'in',
                });
                dirty = true; API.setDirty(true);
            }
        }
        portDrag = null; hoveredPort = null;
        needRedraw = true;
    }

    draggingNode = null;
}

function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.15, Math.min(4, zoom * factor));
    panX = sx - (sx - panX) * (newZoom / zoom);
    panY = sy - (sy - panY) * (newZoom / zoom);
    zoom = newZoom;
    needRedraw = true;
}

function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.size > 0) deleteSelectedNodes();
        else if (selectedConnId) deleteConnection(selectedConnId);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveGraph(); }
}

// ── Context menu ─────────────────────────────────────────────────────────────
function showContextMenu(e, wx, wy) {
    e.preventDefault();
    removeContextMenu();
    const menu = document.createElement('div');
    menu.id = 'svga-ctx-menu';
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;
        background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);font-family:"Share Tech Mono",monospace;font-size:12px;min-width:180px;overflow:hidden;`;

    // Group header helper
    const addHeader = (text) => {
        const h = document.createElement('div');
        h.textContent = text;
        h.style.cssText = 'padding:5px 14px 2px;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;';
        menu.appendChild(h);
    };

    const addItem = (icon, label, type) => {
        const cfg = NODE_TYPES[type];
        const item = document.createElement('div');
        item.textContent = `${icon} ${label}`;
        item.style.cssText = `padding:6px 14px;cursor:pointer;color:${cfg.headerColor};`;
        item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-secondary)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => { addNode(type, wx, wy); removeContextMenu(); });
        menu.appendChild(item);
    };

    addHeader('Input');
    addItem('⚡', 'Trigger', 'trigger');
    addItem('◈', 'SVG Source', 'source');

    addHeader('Transform');
    addItem('✦', 'Spawn', 'spawn');
    addItem('→', 'Motion', 'motion');

    addHeader('Behavior');
    addItem('◉', 'Environment', 'environment');
    addItem('◐', 'Visual', 'visual');

    addHeader('Output');
    addItem('✖', 'Cleanup', 'cleanup');

    document.body.appendChild(menu);
    const dismiss = () => { removeContextMenu(); document.removeEventListener('click', dismiss); };
    setTimeout(() => document.addEventListener('click', dismiss), 10);
}

function removeContextMenu() {
    document.getElementById('svga-ctx-menu')?.remove();
}

// ── Graph operations ─────────────────────────────────────────────────────────
function addNode(type, wx, wy) {
    if (!currentGraph) return;
    const n = makeNode(type, wx - NODE_W / 2, wy - NODE_H / 2);
    currentGraph.nodes.push(n);
    selectedNodeIds.clear(); selectedNodeIds.add(n.id);
    dirty = true; API.setDirty(true);
    renderProps();
    needRedraw = true;
}

function deleteSelectedNodes() {
    if (!currentGraph) return;
    currentGraph.nodes = currentGraph.nodes.filter(n => !selectedNodeIds.has(n.id));
    currentGraph.connections = currentGraph.connections.filter(
        c => !selectedNodeIds.has(c.fromNode) && !selectedNodeIds.has(c.toNode)
    );
    selectedNodeIds.clear();
    dirty = true; API.setDirty(true);
    renderProps();
    needRedraw = true;
}

function deleteConnection(cid) {
    if (!currentGraph) return;
    currentGraph.connections = currentGraph.connections.filter(c => c.id !== cid);
    selectedConnId = null;
    dirty = true; API.setDirty(true);
    needRedraw = true;
}

// ── Properties panel ──────────────────────────────────────────────────────────
function renderProps() {
    if (!propsEl) return;
    if (selectedNodeIds.size === 0 && !selectedConnId) {
        propsEl.innerHTML = `<div style="color:var(--text-muted);font-size:11px;padding:8px;">
            Right-click canvas to add nodes.<br>
            Drag from ▶ port to connect.<br>
            Delete key removes selection.<br><br>
            <b>Pipeline:</b><br>
            Trigger → Source → Spawn → Motion → Environment → Visual → Cleanup
        </div>`;
        return;
    }

    if (selectedConnId) {
        const c = currentGraph.connections.find(x => x.id === selectedConnId);
        propsEl.innerHTML = `<div style="font-size:11px;padding:6px;">
            <b>Connection</b><br>
            <span style="color:var(--text-muted);">From:</span> ${c?.fromNode || '—'}<br>
            <span style="color:var(--text-muted);">To:</span> ${c?.toNode || '—'}<br>
            <button class="btn btn-sm btn-danger" id="del-conn-btn" style="margin-top:8px;width:100%;">Delete Connection</button>
        </div>`;
        document.getElementById('del-conn-btn')?.addEventListener('click', () => deleteConnection(selectedConnId));
        return;
    }

    const nodeId = [...selectedNodeIds][0];
    const n = currentGraph.nodes.find(x => x.id === nodeId);
    if (!n) return;

    const cfg = NODE_TYPES[n.type];
    let fields = '';

    switch (n.type) {
        case 'trigger':
            fields = `
                <div class="pf"><label>Event</label>
                <select data-field="event">${TRIGGER_EVENTS.map(e => `<option ${n.data.event === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
                <div class="pf"><label>Entity Type</label>
                <select data-field="entityType">
                    ${['warrior', 'drone', 'facehugger', 'queenLesser', 'queen', 'egg', 'any'].map(t => `<option ${n.data.entityType === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select></div>
                ${n.data.event === 'custom' ? `<div class="pf"><label>Custom Event Key</label><input type="text" data-field="customEvent" value="${esc(n.data.customEvent)}"></div>` : ''}
                <div class="pf"><label>Description</label><textarea data-field="description" rows="2">${esc(n.data.description)}</textarea></div>`;
            break;

        case 'source':
            fields = `
                <div class="pf"><label>Source Type</label>
                <select data-field="sourceType">
                    <option value="svg_file" ${n.data.sourceType === 'svg_file' ? 'selected' : ''}>SVG File</option>
                    <option value="procedural" ${n.data.sourceType === 'procedural' ? 'selected' : ''}>Procedural Shape</option>
                    <option value="texture" ${n.data.sourceType === 'texture' ? 'selected' : ''}>Texture Key</option>
                </select></div>
                <div class="pf"><label>Category</label>
                <select data-field="category">${['corpse', 'acid', 'debris', 'particles'].map(c => `<option ${n.data.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
                ${n.data.sourceType === 'svg_file' ? `
                    <div class="pf"><label>SVG File</label>
                    <select data-field="svgFile">
                        <option value="">— select —</option>
                        ${svgFileList.map(f => `<option value="${esc(f.path)}" ${n.data.svgFile === f.path ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
                    </select></div>
                ` : ''}
                ${n.data.sourceType === 'procedural' ? `
                    <div class="pf"><label>Shape</label>
                    <select data-field="proceduralShape">
                        ${['star', 'circle', 'triangle', 'shard', 'cross', 'blob', 'tendril'].map(s => `<option ${n.data.proceduralShape === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select></div>
                    <div class="pf"><label>Size (px)</label><input type="number" data-field="proceduralSize" value="${n.data.proceduralSize}" min="4" max="128"></div>
                ` : ''}
                <div class="pf"><label><input type="checkbox" data-field="tintEnabled" ${n.data.tintEnabled ? 'checked' : ''}> Enable Tint</label></div>
                ${n.data.tintEnabled ? `<div class="pf"><label>Tint Color</label><input type="color" data-field="tint" value="${n.data.tint}"></div>` : ''}
                <div class="pf"><label>Scale Range</label>
                <div style="display:flex;gap:4px;">
                    <input type="number" data-field="scaleMin" value="${n.data.scaleMin}" min="0.1" max="5" step="0.1" style="width:50%;">
                    <input type="number" data-field="scaleMax" value="${n.data.scaleMax}" min="0.1" max="5" step="0.1" style="width:50%;">
                </div></div>`;
            break;

        case 'spawn':
            fields = `
                <div class="pf"><label>Spawn Mode</label>
                <select data-field="mode">${SPAWN_MODES.map(m => `<option ${n.data.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
                <div class="pf"><label>Count (min–max)</label>
                <div style="display:flex;gap:4px;">
                    <input type="number" data-field="count" value="${n.data.count}" min="1" max="50" style="width:50%;">
                    <input type="number" data-field="countMax" value="${n.data.countMax}" min="1" max="50" style="width:50%;">
                </div></div>
                <div class="pf"><label>Spread Radius (px)</label><input type="number" data-field="spreadRadius" value="${n.data.spreadRadius}" min="0" max="200"></div>
                <div class="pf"><label>Angle (°)</label><input type="number" data-field="angle" value="${n.data.angle}" min="0" max="360"></div>
                <div class="pf"><label>Arc (°)</label><input type="number" data-field="arc" value="${n.data.arc}" min="0" max="360"></div>
                <div class="pf"><label>Offset X/Y</label>
                <div style="display:flex;gap:4px;">
                    <input type="number" data-field="offsetX" value="${n.data.offsetX}" style="width:50%;">
                    <input type="number" data-field="offsetY" value="${n.data.offsetY}" style="width:50%;">
                </div></div>
                <div class="pf"><label>Velocity (min–max)</label>
                <div style="display:flex;gap:4px;">
                    <input type="number" data-field="velocityMin" value="${n.data.velocityMin}" min="0" max="500" style="width:50%;">
                    <input type="number" data-field="velocityMax" value="${n.data.velocityMax}" min="0" max="500" style="width:50%;">
                </div></div>
                <div class="pf"><label><input type="checkbox" data-field="inheritVelocity" ${n.data.inheritVelocity ? 'checked' : ''}> Inherit Entity Velocity</label></div>
                <div class="pf"><label><input type="checkbox" data-field="inheritAngle" ${n.data.inheritAngle ? 'checked' : ''}> Inherit Entity Angle</label></div>`;
            break;

        case 'motion':
            fields = `
                <div class="pf"><label>Motion Type</label>
                <select data-field="type">${MOTION_TYPES.map(m => `<option ${n.data.type === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
                ${n.data.type === 'gravity' ? `<div class="pf"><label>Gravity</label><input type="number" data-field="gravity" value="${n.data.gravity}" min="0" max="1000"></div>` : ''}
                ${n.data.type === 'drift' || n.data.type === 'float_up' ? `
                    <div class="pf"><label>Drift X/Y</label>
                    <div style="display:flex;gap:4px;">
                        <input type="number" data-field="driftX" value="${n.data.driftX}" style="width:50%;">
                        <input type="number" data-field="driftY" value="${n.data.driftY}" style="width:50%;">
                    </div></div>` : ''}
                ${n.data.type === 'orbit' ? `
                    <div class="pf"><label>Orbit Radius</label><input type="number" data-field="orbitRadius" value="${n.data.orbitRadius}" min="5" max="200"></div>
                    <div class="pf"><label>Orbit Speed</label><input type="number" data-field="orbitSpeed" value="${n.data.orbitSpeed}" min="0.1" max="20" step="0.1"></div>` : ''}
                ${n.data.type === 'bounce' ? `
                    <div class="pf"><label>Bounce Decay</label><input type="number" data-field="bounceDecay" value="${n.data.bounceDecay}" min="0" max="1" step="0.05"></div>` : ''}
                <div class="pf"><label>Friction</label><input type="number" data-field="friction" value="${n.data.friction}" min="0.5" max="1" step="0.01"></div>
                <div class="pf"><label>Max Speed</label><input type="number" data-field="maxSpeed" value="${n.data.maxSpeed}" min="10" max="1000"></div>`;
            break;

        case 'environment':
            fields = `
                <div class="pf"><label>Reaction</label>
                <select data-field="reaction">${ENV_REACTIONS.map(r => `<option ${n.data.reaction === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
                ${n.data.reaction === 'stick_floor' ? `<div class="pf"><label>Stick Delay (ms)</label><input type="number" data-field="stickDelay" value="${n.data.stickDelay}" min="0" max="5000"></div>` : ''}
                ${n.data.reaction === 'stick_floor' || n.data.reaction === 'pool_ground' ? `<div class="pf"><label>Floor Depth Layer</label><input type="number" data-field="floorDepth" value="${n.data.floorDepth}" min="1" max="10" step="0.5"></div>` : ''}
                ${n.data.reaction === 'slide_wall' ? `<div class="pf"><label>Wall Bounce</label><input type="number" data-field="wallBounce" value="${n.data.wallBounce}" min="0" max="1" step="0.1"></div>` : ''}
                <div class="pf"><label><input type="checkbox" data-field="lightReactive" ${n.data.lightReactive ? 'checked' : ''}> React to Lighting</label></div>
                ${n.data.lightReactive ? `<div class="pf"><label>Light Intensity</label><input type="number" data-field="lightIntensity" value="${n.data.lightIntensity}" min="0" max="2" step="0.1"></div>` : ''}
                <div class="pf"><label>Depth Offset</label><input type="number" data-field="depthOffset" value="${n.data.depthOffset}" min="-10" max="10" step="0.5"></div>`;
            break;

        case 'visual':
            fields = `
                <div class="pf"><label>Effect</label>
                <select data-field="effect">${VISUAL_EFFECTS.map(v => `<option ${n.data.effect === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
                <div class="pf"><label>Duration (ms)</label><input type="number" data-field="duration" value="${n.data.duration}" min="50" max="30000"></div>
                ${n.data.effect.startsWith('fade') ? `
                    <div class="pf"><label>Alpha (start–end)</label>
                    <div style="display:flex;gap:4px;">
                        <input type="number" data-field="startAlpha" value="${n.data.startAlpha}" min="0" max="1" step="0.05" style="width:50%;">
                        <input type="number" data-field="endAlpha" value="${n.data.endAlpha}" min="0" max="1" step="0.05" style="width:50%;">
                    </div></div>` : ''}
                ${n.data.effect.startsWith('scale') ? `
                    <div class="pf"><label>Scale (start–end)</label>
                    <div style="display:flex;gap:4px;">
                        <input type="number" data-field="startScale" value="${n.data.startScale}" min="0" max="5" step="0.1" style="width:50%;">
                        <input type="number" data-field="endScale" value="${n.data.endScale}" min="0" max="5" step="0.1" style="width:50%;">
                    </div></div>` : ''}
                ${n.data.effect === 'rotate_spin' ? `
                    <div class="pf"><label>Rotation Speed (deg/s)</label><input type="number" data-field="rotationSpeed" value="${n.data.rotationSpeed}" min="-720" max="720"></div>
                    <div class="pf"><label><input type="checkbox" data-field="rotationRandomize" ${n.data.rotationRandomize ? 'checked' : ''}> Randomize Direction</label></div>` : ''}
                ${n.data.effect === 'color_shift' ? `
                    <div class="pf"><label>Color From</label><input type="color" data-field="colorFrom" value="${n.data.colorFrom}"></div>
                    <div class="pf"><label>Color To</label><input type="color" data-field="colorTo" value="${n.data.colorTo}"></div>` : ''}
                <div class="pf"><label>Easing</label>
                <select data-field="easing">${['linear', 'quad_in', 'quad_out', 'sine'].map(e => `<option ${n.data.easing === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
                <div class="pf"><label>Blend Mode</label>
                <select data-field="blendMode">${['NORMAL', 'ADD', 'MULTIPLY', 'SCREEN'].map(b => `<option ${n.data.blendMode === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>`;
            break;

        case 'cleanup':
            fields = `
                <div class="pf"><label>Cleanup Mode</label>
                <select data-field="mode">${CLEANUP_MODES.map(m => `<option ${n.data.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
                ${n.data.mode === 'after_time' ? `<div class="pf"><label>Lifetime (ms)</label><input type="number" data-field="lifetime" value="${n.data.lifetime}" min="100" max="60000"></div>` : ''}
                ${n.data.mode === 'after_distance' ? `<div class="pf"><label>Max Distance (px)</label><input type="number" data-field="maxDistance" value="${n.data.maxDistance}" min="10" max="2000"></div>` : ''}
                <div class="pf"><label><input type="checkbox" data-field="fadeBeforeCleanup" ${n.data.fadeBeforeCleanup ? 'checked' : ''}> Fade Before Cleanup</label></div>
                ${n.data.fadeBeforeCleanup ? `<div class="pf"><label>Fade Duration (ms)</label><input type="number" data-field="fadeDuration" value="${n.data.fadeDuration}" min="50" max="5000"></div>` : ''}`;
            break;
    }

    propsEl.innerHTML = `
        <div style="padding:6px;">
            <div style="font-weight:600;color:${cfg.headerColor};font-size:12px;margin-bottom:8px;
                        border-bottom:1px solid var(--border);padding-bottom:6px;">${cfg.icon} ${cfg.label} NODE</div>
            <style>.pf{margin-bottom:8px;}.pf label{display:block;font-size:10px;color:var(--text-muted);
                margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px;}
                .pf input,.pf select,.pf textarea{width:100%;font-size:11px;background:var(--bg-secondary);
                color:var(--text);border:1px solid var(--border);border-radius:3px;padding:4px 6px;box-sizing:border-box;}
                .pf input[type="color"]{height:28px;padding:2px;}
                .pf input[type="checkbox"]{width:auto;margin-right:4px;}
                .pf textarea{resize:vertical;min-height:44px;}</style>
            ${fields}
            <button class="btn btn-sm btn-danger" id="del-node-btn" style="width:100%;margin-top:4px;">Delete Node</button>
        </div>`;

    // Wire change listeners — re-render props on select/checkbox to toggle conditional fields
    propsEl.querySelectorAll('[data-field]').forEach(el => {
        const needsRerender = el.tagName === 'SELECT' || el.type === 'checkbox';
        el.addEventListener('input', () => {
            applyField(n, el);
            if (needsRerender) renderProps();
        });
        el.addEventListener('change', () => {
            applyField(n, el);
            if (needsRerender) renderProps();
        });
    });
    document.getElementById('del-node-btn')?.addEventListener('click', () => {
        selectedNodeIds.clear(); selectedNodeIds.add(n.id);
        deleteSelectedNodes();
    });
}

function applyField(n, el) {
    const f = el.dataset.field;
    if (el.type === 'checkbox') n.data[f] = el.checked;
    else if (el.type === 'number') n.data[f] = parseFloat(el.value) || 0;
    else n.data[f] = el.value;
    dirty = true; API.setDirty(true); needRedraw = true;
}

// ── Graph list  ───────────────────────────────────────────────────────────────
async function loadGraphList() {
    try {
        const r = await API.apiFetch('/api/svg-actions');
        const d = await r.json();
        graphs = d.ok ? d.graphs : [];
    } catch { graphs = []; }
    renderGraphList();
}

function renderGraphList() {
    const el = document.getElementById('svga-list');
    if (!el) return;
    if (!graphs.length) {
        el.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted);">No action graphs yet.</div>';
        return;
    }
    el.innerHTML = graphs.map(g => `
        <div class="svga-list-item ${currentGraph?.id === g.id ? 'active' : ''}" data-id="${g.id}"
             style="padding:7px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;
                    display:flex;align-items:center;justify-content:space-between;
                    ${currentGraph?.id === g.id ? 'background:rgba(152,195,34,0.15);color:#98c322;' : ''}">
            <span>${esc(g.name)}</span>
            <button class="btn btn-sm" data-del="${g.id}" title="Delete" style="padding:0 4px;font-size:10px;color:#e05555;">✕</button>
        </div>`).join('');
    el.querySelectorAll('.svga-list-item').forEach(item => {
        item.addEventListener('click', e => {
            if (e.target.dataset.del) return;
            loadGraph(item.dataset.id);
        });
    });
    el.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => deleteGraph(btn.dataset.del));
    });
}

async function loadGraph(id) {
    try {
        const r = await API.apiFetch(`/api/svg-actions/${encodeURIComponent(id)}`);
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        currentGraph = d.graph;
        dirty = false; API.setDirty(false);
        selectedNodeIds.clear(); selectedConnId = null;
        panX = canvas ? canvas.width / 2 - NODE_W : 0; panY = 80; zoom = 1;
        renderGraphList();
        renderProps();
        needRedraw = true;
        API.setStatus(`Loaded: ${currentGraph.name}`);
    } catch (err) { API.toast('Load failed: ' + err.message, 'error'); }
}

async function saveGraph() {
    if (!currentGraph) return;
    try {
        const r = await API.apiFetch(`/api/svg-actions/${encodeURIComponent(currentGraph.id)}`, {
            method: 'POST', body: JSON.stringify(currentGraph),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        API.recordSave();
        API.toast(`Saved: ${currentGraph.name}`, 'success');
        await loadGraphList();
    } catch (err) { API.toast('Save failed: ' + err.message, 'error'); }
}

async function deleteGraph(id) {
    if (!confirm('Delete this action graph? This cannot be undone.')) return;
    try {
        const r = await API.apiFetch(`/api/svg-actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        if (currentGraph?.id === id) { currentGraph = null; needRedraw = true; renderProps(); }
        await loadGraphList();
        API.toast('Deleted', 'info');
    } catch (err) { API.toast('Delete failed: ' + err.message, 'error'); }
}

function showNewGraphDialog() {
    const { body, footer, close } = API.showModal('New SVG Action Graph');
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">
            <label style="font-size:12px;">ID:</label>
            <input type="text" class="input" id="ng-id" placeholder="alien_warrior_death_fx" style="width:100%;">
            <label style="font-size:12px;">Name:</label>
            <input type="text" class="input" id="ng-name" placeholder="Warrior Death FX" style="width:100%;">
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">
            The ID is referenced by the game runtime to activate this FX pipeline.<br>
            Use snake_case (e.g. <code>acid_splash_floor</code>).
        </p>`;
    footer.innerHTML = `<button class="btn btn-secondary btn-sm" id="ng-cancel">Cancel</button>
                        <button class="btn btn-primary btn-sm" id="ng-create">Create</button>`;
    document.getElementById('ng-cancel').onclick = close;
    document.getElementById('ng-create').onclick = async () => {
        const id = document.getElementById('ng-id').value.trim();
        const name = document.getElementById('ng-name').value.trim();
        if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) { API.toast('ID must be alphanumeric/underscore/dash', 'warning'); return; }
        if (!name) { API.toast('Name required', 'warning'); return; }
        const graph = { id, name, description: '', nodes: [], connections: [] };
        // Seed with a trigger + cleanup node
        const triggerNode = makeNode('trigger', 80, 120);
        const cleanupNode = makeNode('cleanup', 600, 120);
        graph.nodes.push(triggerNode, cleanupNode);
        close();
        currentGraph = graph;
        await saveGraph();
        panX = 0; panY = 0; zoom = 1;
        selectedNodeIds.clear();
        renderProps();
        needRedraw = true;
    };
}

async function loadSvgFileList() {
    try {
        const r = await API.apiFetch('/api/svg-assets/list');
        const d = await r.json();
        if (d.ok && Array.isArray(d.assets)) {
            svgFileList = d.assets.map(a => ({ name: a.filename, path: `${a.category}/${a.filename}` }));
        } else {
            svgFileList = [];
        }
    } catch { svgFileList = []; }
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateGraph() {
    if (!currentGraph) return;
    const errors = [];
    const warnings = [];

    const hasTrigger = currentGraph.nodes.some(n => n.type === 'trigger');
    const hasSource = currentGraph.nodes.some(n => n.type === 'source');
    const hasSpawn = currentGraph.nodes.some(n => n.type === 'spawn');
    const hasCleanup = currentGraph.nodes.some(n => n.type === 'cleanup');

    if (!hasTrigger) errors.push('No Trigger node — FX will never fire');
    if (!hasSource) errors.push('No Source node — no SVG/shape to spawn');
    if (!hasSpawn) warnings.push('No Spawn node — using default burst spawn');
    if (!hasCleanup) warnings.push('No Cleanup node — particles may persist forever');

    // Check for disconnected nodes
    const connected = new Set();
    for (const c of currentGraph.connections) {
        connected.add(c.fromNode);
        connected.add(c.toNode);
    }
    for (const n of currentGraph.nodes) {
        if (!connected.has(n.id) && currentGraph.nodes.length > 1) {
            warnings.push(`${NODE_TYPES[n.type]?.label || n.type} node "${n.id}" is not connected`);
        }
    }

    // Dead connections
    for (const c of currentGraph.connections) {
        if (!currentGraph.nodes.find(n => n.id === c.fromNode)) errors.push(`Dead connection from ${c.fromNode}`);
        if (!currentGraph.nodes.find(n => n.id === c.toNode)) errors.push(`Dead connection to ${c.toNode}`);
    }

    if (errors.length === 0 && warnings.length === 0) {
        API.toast('Action graph valid ✓', 'success');
    } else {
        const { body } = API.showModal('Validation Results');
        let html = '';
        if (errors.length) html += '<h4 style="color:#e05555;font-size:12px;">Errors</h4><ul style="font-size:12px;">' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
        if (warnings.length) html += '<h4 style="color:#d4a520;font-size:12px;">Warnings</h4><ul style="font-size:12px;">' + warnings.map(w => `<li>${w}</li>`).join('') + '</ul>';
        body.innerHTML = html;
    }
}

// ── Scaffold preset graphs ───────────────────────────────────────────────────
function showPresetDialog() {
    const { body, footer, close } = API.showModal('Create from Preset');
    const presets = [
        { id: 'alien_death_gibs', name: 'Alien Death Gibs', desc: 'Body part debris on death with gravity + floor stick' },
        { id: 'acid_blood_splat', name: 'Acid Blood Splatter', desc: 'Green blood droplets with acid pool ground effect' },
        { id: 'bullet_spark', name: 'Bullet Wall Sparks', desc: 'Metallic spark burst when bullets hit walls' },
        { id: 'queen_death_burst', name: 'Queen Death Burst', desc: 'Massive acid geyser + particle storm' },
        { id: 'acid_floor_pool', name: 'Acid Floor Pool', desc: 'Spreading acid puddle with steam and fade' },
    ];
    body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;">
            ${presets.map(p => `
                <div class="preset-item" data-preset="${p.id}"
                     style="padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border);
                            border-radius:4px;cursor:pointer;transition:border-color .15s;">
                    <div style="font-weight:600;font-size:12px;color:var(--text);">${p.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${p.desc}</div>
                </div>
            `).join('')}
        </div>`;
    footer.innerHTML = `<button class="btn btn-secondary btn-sm" id="preset-cancel">Cancel</button>`;
    document.getElementById('preset-cancel').onclick = close;
    body.querySelectorAll('.preset-item').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.borderColor = '#98c322');
        el.addEventListener('mouseleave', () => el.style.borderColor = 'var(--border)');
        el.addEventListener('click', () => {
            createPresetGraph(el.dataset.preset);
            close();
        });
    });
}

async function createPresetGraph(presetId) {
    const graph = { id: presetId, name: presetId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), description: `Auto-generated from ${presetId} preset`, nodes: [], connections: [] };

    // All presets get: Trigger → Source → Spawn → Visual → Cleanup
    const spacing = 260;
    const baseNodes = {
        alien_death_gibs: [
            { type: 'trigger', x: 0, data: { event: 'alien_death', entityType: 'warrior' } },
            { type: 'source', x: spacing, data: { sourceType: 'procedural', proceduralShape: 'shard', proceduralSize: 18, category: 'corpse' } },
            { type: 'spawn', x: spacing * 2, data: { mode: 'burst', count: 4, countMax: 7, spreadRadius: 16, velocityMin: 60, velocityMax: 180, inheritAngle: true } },
            { type: 'motion', x: spacing * 3, data: { type: 'gravity', gravity: 280, friction: 0.96 } },
            { type: 'environment', x: spacing * 4, data: { reaction: 'stick_floor', stickDelay: 400, floorDepth: 4.5 } },
            { type: 'visual', x: spacing * 5, data: { effect: 'fade_out', duration: 8000, startAlpha: 1, endAlpha: 0, easing: 'quad_in' } },
            { type: 'cleanup', x: spacing * 6, data: { mode: 'after_time', lifetime: 8000, fadeBeforeCleanup: true, fadeDuration: 2000 } },
        ],
        acid_blood_splat: [
            { type: 'trigger', x: 0, data: { event: 'bullet_hit_alien', entityType: 'any' } },
            { type: 'source', x: spacing, data: { sourceType: 'procedural', proceduralShape: 'blob', proceduralSize: 12, tintEnabled: true, tint: '#c8d828', category: 'acid' } },
            { type: 'spawn', x: spacing * 2, data: { mode: 'cone', count: 3, countMax: 7, spreadRadius: 8, arc: 90, velocityMin: 80, velocityMax: 200, inheritAngle: true } },
            { type: 'motion', x: spacing * 3, data: { type: 'gravity', gravity: 150, friction: 0.94 } },
            { type: 'environment', x: spacing * 4, data: { reaction: 'pool_ground', floorDepth: 2.5 } },
            { type: 'visual', x: spacing * 5, data: { effect: 'fade_out', duration: 4000, startAlpha: 0.9, endAlpha: 0, easing: 'quad_out' } },
            { type: 'cleanup', x: spacing * 6, data: { mode: 'after_time', lifetime: 5000, fadeBeforeCleanup: true, fadeDuration: 1000 } },
        ],
        bullet_spark: [
            { type: 'trigger', x: 0, data: { event: 'bullet_hit_wall', entityType: 'any' } },
            { type: 'source', x: spacing, data: { sourceType: 'procedural', proceduralShape: 'star', proceduralSize: 6, tintEnabled: true, tint: '#ffcc44', category: 'particles' } },
            { type: 'spawn', x: spacing * 2, data: { mode: 'burst', count: 8, countMax: 14, spreadRadius: 4, velocityMin: 120, velocityMax: 300 } },
            { type: 'motion', x: spacing * 3, data: { type: 'gravity', gravity: 400, friction: 0.92 } },
            { type: 'visual', x: spacing * 4, data: { effect: 'fade_out', duration: 300, startAlpha: 1, endAlpha: 0, easing: 'linear', blendMode: 'ADD' } },
            { type: 'cleanup', x: spacing * 5, data: { mode: 'after_time', lifetime: 400 } },
        ],
        queen_death_burst: [
            { type: 'trigger', x: 0, data: { event: 'queen_death', entityType: 'queen' } },
            { type: 'source', x: spacing, data: { sourceType: 'procedural', proceduralShape: 'blob', proceduralSize: 32, tintEnabled: true, tint: '#88dd22', category: 'acid' } },
            { type: 'spawn', x: spacing * 2, data: { mode: 'ring', count: 20, countMax: 30, spreadRadius: 24, velocityMin: 100, velocityMax: 350, arc: 360 } },
            { type: 'motion', x: spacing * 3, data: { type: 'gravity', gravity: 120, friction: 0.97 } },
            { type: 'environment', x: spacing * 4, data: { reaction: 'pool_ground', floorDepth: 2, lightReactive: true, lightIntensity: 1.5 } },
            { type: 'visual', x: spacing * 5, data: { effect: 'scale_shrink', duration: 6000, startScale: 1.5, endScale: 0.3, easing: 'quad_in', blendMode: 'ADD' } },
            { type: 'cleanup', x: spacing * 6, data: { mode: 'after_time', lifetime: 8000, fadeBeforeCleanup: true, fadeDuration: 3000 } },
        ],
        acid_floor_pool: [
            { type: 'trigger', x: 0, data: { event: 'acid_splash', entityType: 'any' } },
            { type: 'source', x: spacing, data: { sourceType: 'procedural', proceduralShape: 'blob', proceduralSize: 24, tintEnabled: true, tint: '#98c322', category: 'acid' } },
            { type: 'spawn', x: spacing * 2, data: { mode: 'at_entity', count: 1, countMax: 2, spreadRadius: 8,velocityMin: 0, velocityMax: 10 } },
            { type: 'environment', x: spacing * 3, data: { reaction: 'pool_ground', floorDepth: 2.5, lightReactive: true, lightIntensity: 0.4 } },
            { type: 'visual', x: spacing * 4, data: { effect: 'scale_grow', duration: 2000, startScale: 0.3, endScale: 1.2, easing: 'quad_out' } },
            { type: 'cleanup', x: spacing * 5, data: { mode: 'after_time', lifetime: 12000, fadeBeforeCleanup: true, fadeDuration: 4000 } },
        ],
    };

    const nodeDefs = baseNodes[presetId] || baseNodes.alien_death_gibs;
    for (const def of nodeDefs) {
        const n = makeNode(def.type, def.x, 120);
        Object.assign(n.data, def.data);
        graph.nodes.push(n);
    }
    // Chain all nodes linearly
    for (let i = 0; i < graph.nodes.length - 1; i++) {
        graph.connections.push({
            id: connId(graph.nodes[i].id, graph.nodes[i + 1].id),
            fromNode: graph.nodes[i].id, fromPort: 'out',
            toNode: graph.nodes[i + 1].id, toPort: 'in',
        });
    }

    currentGraph = graph;
    await saveGraph();
    panX = 40; panY = 40; zoom = 0.85;
    selectedNodeIds.clear();
    renderProps();
    needRedraw = true;
}

// ── Animation loop ────────────────────────────────────────────────────────────
function rafLoop() {
    if (needRedraw) { draw(); needRedraw = false; }
    rafId = requestAnimationFrame(rafLoop);
}

// ── Build UI ──────────────────────────────────────────────────────────────────
function buildUI(root) {
    root.innerHTML = `
        <div class="layout-split" style="height:100%;display:flex;">

            <!-- Left: graph list -->
            <aside class="sidebar" style="width:220px;min-width:180px;display:flex;flex-direction:column;">
                <div class="panel" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                    <div class="panel-header">
                        <span>Action Graphs</span>
                        <div style="display:flex;gap:4px;">
                            <button class="btn btn-sm btn-primary" id="svga-new-btn">+ New</button>
                            <button class="btn btn-sm btn-secondary" id="svga-preset-btn" title="Create from preset template">⚙ Preset</button>
                            <button class="btn btn-sm btn-secondary" id="svga-refresh-btn">↻</button>
                        </div>
                    </div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:0;" id="svga-list"></div>
                </div>
                <!-- SVG info panel -->
                <div class="panel" style="max-height:200px;overflow-y:auto;border-top:1px solid var(--border);">
                    <div class="panel-header"><span>SVG Assets</span></div>
                    <div style="padding:6px;font-size:10px;color:var(--text-muted);" id="svga-asset-info">
                        Loading SVG assets…
                    </div>
                </div>
            </aside>

            <!-- Center: canvas graph -->
            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="svga-fit-btn" title="Fit graph to view">Fit</button>
                        <button class="btn btn-sm btn-secondary" id="svga-validate-btn" title="Validate graph">Validate</button>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <span style="font-size:11px;color:var(--text-muted);" id="svga-hint">Right-click → add nodes • Drag ports to connect • Pipeline: Trigger → Source → Spawn → Motion → Env → Visual → Cleanup</span>
                    </div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-primary" id="svga-save-btn">Save</button>
                    </div>
                </div>
                <div style="flex:1;overflow:hidden;position:relative;" id="svga-canvas-wrap">
                    <canvas id="svga-canvas" style="display:block;width:100%;height:100%;"></canvas>
                </div>
            </div>

            <!-- Right: properties -->
            <aside style="width:280px;min-width:220px;overflow-y:auto;border-left:1px solid var(--border);" id="svga-props-root">
                <div class="panel-header" style="padding:6px 8px;">Properties</div>
                <div id="svga-props"></div>
            </aside>
        </div>`;

    canvas = document.getElementById('svga-canvas');
    ctx = canvas.getContext('2d');
    propsEl = document.getElementById('svga-props');

    const wrap = document.getElementById('svga-canvas-wrap');
    const ro = new ResizeObserver(() => {
        canvas.width = wrap.clientWidth;
        canvas.height = wrap.clientHeight;
        needRedraw = true;
    });
    ro.observe(wrap);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', onKeyDown);

    document.getElementById('svga-new-btn').addEventListener('click', showNewGraphDialog);
    document.getElementById('svga-preset-btn').addEventListener('click', showPresetDialog);
    document.getElementById('svga-refresh-btn').addEventListener('click', loadGraphList);
    document.getElementById('svga-save-btn').addEventListener('click', saveGraph);
    document.getElementById('svga-validate-btn').addEventListener('click', validateGraph);
    document.getElementById('svga-fit-btn').addEventListener('click', () => {
        if (!currentGraph || !currentGraph.nodes.length) return;
        const xs = currentGraph.nodes.map(n => n.x);
        const ys = currentGraph.nodes.map(n => n.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
        const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
        const pad = 40;
        const scaleX = (canvas.width - pad * 2) / (maxX - minX || 1);
        const scaleY = (canvas.height - pad * 2) / (maxY - minY || 1);
        zoom = Math.min(scaleX, scaleY, 2);
        panX = pad - minX * zoom;
        panY = pad - minY * zoom;
        needRedraw = true;
    });
}

function renderAssetInfo() {
    const el = document.getElementById('svga-asset-info');
    if (!el) return;
    if (!svgFileList.length) {
        el.innerHTML = 'No SVG assets found.<br>Create them in the Image tab → SVG Editor.';
        return;
    }
    el.innerHTML = svgFileList.map(f =>
        `<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);">◈ ${esc(f.path)}</div>`
    ).join('');
}

// ── Module exports ────────────────────────────────────────────────────────────
async function init() {
    await Promise.all([loadGraphList(), loadSvgFileList()]);
    renderProps();
    renderAssetInfo();
    if (rafId) cancelAnimationFrame(rafId);
    rafLoop();
}

function cleanup() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener('keydown', onKeyDown);
}

export default {
    render: buildUI,
    onShow: init,
    onHide: cleanup,
    async save() { if (dirty) await saveGraph(); },
};
