/**
 * Node-Based Action Editor (upgraded from Story tab)
 * Visual Event-Condition-Action graph editor for codeless game behavior authoring.
 * Graphs are saved to mission package nodeGraphs[] and executed by GraphRunner at runtime.
 */

import { ACTION_DEFS, ACTION_TYPE_LIST, getActionParamDefs, getActionDefaults } from '../../src/events/actionDefs.js';
import { TILED_MAP_TEMPLATES } from '../../src/data/tiledMaps.generated.js';

const API = window.editorAPI;

// ── State ──────────────────────────────────────────────────────────────────
let canvas = null, ctx = null;
let graphs = [];          // array of graph objects
let currentGraph = null;  // the graph being edited
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

// Sound list for audio pickers
let soundList = [];
let doorIdOptions = [];

// Right-side props panel
let propsEl = null;

// ── Node geometry constants ─────────────────────────────────────────────────
const NODE_W = 220, NODE_H = 72, NODE_TITLE = 22, PORT_R = 7;

// ── Event names available in the system ─────────────────────────────────────
const EVENT_NAMES = [
    // Combat - bullets & acid
    'bulletHitWall', 'bulletHitAlien', 'bulletHitDoor', 'bulletHitEgg',
    'acidHitLeader', 'acidHitFollower',
    'alienHitLeader', 'alienHitFollower',
    // Player & squad
    'playerFired', 'followerFired', 'marineCallout',
    'leaderDamaged', 'leaderHealed',
    'followerDamaged', 'followerDied', 'followerHealed',
    // Weapons
    'weaponSwitched', 'weaponOverheat',
    // Enemies
    'alienDamaged', 'alienDied', 'alienSpawned',
    'facehuggerLeaped', 'facehuggerLatched',
    // Waves & stages
    'waveStarted', 'waveCleared', 'stageChanged', 'extractionStarted',
    // Director
    'directorStateChanged',
    // Doors
    'doorOpened', 'doorClosed', 'doorWelded', 'doorBreached',
    // Mission & objectives
    'objectiveCompleted', 'missionComplete', 'storyPointTriggered', 'missionStoryPointTriggered',
    // Atmosphere
    'atmosphereIncident',
];

// ── Action types from shared definitions ────────────────────────────────────
const ACTION_TYPES = ACTION_TYPE_LIST;

const ACTION_PARAM_DEFS = {};
for (const [key, def] of Object.entries(ACTION_DEFS)) {
    ACTION_PARAM_DEFS[key] = def.params;
}

// ── Condition operators ─────────────────────────────────────────────────────
const COND_OPS = ['>=', '<=', '>', '<', '==', '!=', 'contains'];

const GETTER_SOURCES = [
    'leader.health', 'leader.healthPct', 'leader.x', 'leader.y',
    'aliveEnemies', 'currentWave', 'totalWaves',
    'pressure', 'directorState', 'totalKills',
    'stageState', 'followerCount', 'activeFollowerCount',
];

// ── Node type config ────────────────────────────────────────────────────────
const NODE_TYPES = {
    event:     { label: 'EVENT',     color: '#1d6e3a', headerColor: '#28a05a', portColor: '#28a05a' },
    condition: { label: 'CONDITION', color: '#7a4110', headerColor: '#c06820', portColor: '#c06820' },
    action:    { label: 'ACTION',    color: '#6e1a1a', headerColor: '#b02828', portColor: '#b02828' },
    delay:     { label: 'DELAY',     color: '#1a3d6e', headerColor: '#2563a8', portColor: '#2563a8' },
    getter:    { label: 'GETTER',    color: '#1a5a6e', headerColor: '#268a9e', portColor: '#268a9e' },
};

// ── Utility ─────────────────────────────────────────────────────────────────
function uid() { return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
function graphUid() { return 'graph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function connId(from, to) { return `${from}\u2192${to}`; }

function defaultData(type) {
    switch (type) {
        case 'event':     return { eventName: EVENT_NAMES[0] };
        case 'condition': return { check: 'damage', operator: '>=', value: 0 };
        case 'action':    return { actionType: ACTION_TYPES[0], ...getActionDefaults(ACTION_TYPES[0]) };
        case 'delay':     return { delayMs: 1000 };
        case 'getter':    return { source: GETTER_SOURCES[0] };
        default:          return {};
    }
}

function makeNode(type, x, y) {
    return { id: uid(), type, x, y, data: defaultData(type) };
}

// ── Canvas ↔ world transforms ───────────────────────────────────────────────
function worldToScreen(wx, wy) {
    return { sx: wx * zoom + panX, sy: wy * zoom + panY };
}
function screenToWorld(sx, sy) {
    return { wx: (sx - panX) / zoom, wy: (sy - panY) / zoom };
}

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
function inPortPos(n)  { return { x: n.x,          y: n.y + NODE_H / 2 }; }
function outPortPosTrue(n)  { return { x: n.x + NODE_W, y: n.y + NODE_H * 0.33 }; }
function outPortPosFalse(n) { return { x: n.x + NODE_W, y: n.y + NODE_H * 0.67 }; }

function portHit(wx, wy) {
    if (!currentGraph) return null;
    for (const n of currentGraph.nodes) {
        // Output port(s)
        if (n.type === 'condition') {
            const tp = outPortPosTrue(n);
            if (Math.hypot(wx - tp.x, wy - tp.y) <= PORT_R + 4) return { nodeId: n.id, port: 'out_true' };
            const fp = outPortPosFalse(n);
            if (Math.hypot(wx - fp.x, wy - fp.y) <= PORT_R + 4) return { nodeId: n.id, port: 'out_false' };
        } else {
            const op = outPortPos(n);
            if (Math.hypot(wx - op.x, wy - op.y) <= PORT_R + 4) return { nodeId: n.id, port: 'out' };
        }
        // Input port (not on event or getter nodes — they are entry/data sources)
        if (n.type !== 'event' && n.type !== 'getter') {
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
        const to   = currentGraph.nodes.find(n => n.id === c.toNode);
        if (!from || !to) continue;
        let p0;
        if (from.type === 'condition') {
            if (c.fromPort === 'false') p0 = outPortPosFalse(from);
            else if (c.fromPort === 'true') p0 = outPortPosTrue(from);
            else p0 = outPortPos(from);
        } else {
            p0 = outPortPos(from);
        }
        const p3 = inPortPos(to);
        const cpx = (p0.x + p3.x) / 2;
        for (let t = 0; t <= 1; t += 0.05) {
            const bx = Math.pow(1-t,3)*p0.x + 3*Math.pow(1-t,2)*t*cpx + 3*(1-t)*t*t*cpx + t*t*t*p3.x;
            const by = Math.pow(1-t,3)*p0.y + 3*Math.pow(1-t,2)*t*p0.y + 3*(1-t)*t*t*p3.y + t*t*t*p3.y;
            if (Math.hypot(wx - bx, wy - by) < 6 / zoom) return c.id;
        }
    }
    return null;
}

// ── Render ───────────────────────────────────────────────────────────────────
function draw() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const gs = 40 * zoom;
    const ox = ((panX % gs) + gs) % gs;
    const oy = ((panY % gs) + gs) % gs;
    for (let x = ox; x < canvas.width;  x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
    for (let y = oy; y < canvas.height; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    ctx.restore();

    if (!currentGraph) {
        ctx.fillStyle = '#555';
        ctx.font = '14px "Share Tech Mono",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Select or create a graph from the list', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
        return;
    }

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw connections
    for (const c of currentGraph.connections) {
        const from = currentGraph.nodes.find(n => n.id === c.fromNode);
        const to   = currentGraph.nodes.find(n => n.id === c.toNode);
        if (!from || !to) continue;
        drawConnection(from, to, selectedConnId === c.id, c);
    }

    // In-progress drag
    if (portDrag) {
        const fromNode = currentGraph.nodes.find(n => n.id === portDrag.nodeId);
        if (fromNode) {
            let p0;
            if (portDrag.fromPort === 'true') p0 = outPortPosTrue(fromNode);
            else if (portDrag.fromPort === 'false') p0 = outPortPosFalse(fromNode);
            else p0 = outPortPos(fromNode);
            drawBezier(p0.x, p0.y, portDrag.curX, portDrag.curY, 'rgba(74,164,216,0.6)', false);
        }
    }

    // Draw nodes
    for (const n of currentGraph.nodes) drawNode(n);

    ctx.restore();
}

function drawConnection(from, to, selected, conn) {
    let p0;
    if (from.type === 'condition' && conn) {
        if (conn.fromPort === 'false') p0 = outPortPosFalse(from);
        else if (conn.fromPort === 'true') p0 = outPortPosTrue(from);
        else p0 = outPortPos(from);
    } else {
        p0 = outPortPos(from);
    }
    const p3 = inPortPos(to);
    const fromCfg = NODE_TYPES[from.type] || NODE_TYPES.action;
    const color = selected ? '#4fa4d8'
        : (conn && conn.fromPort === 'false' ? '#b0282888' : (fromCfg.portColor + '88'));
    drawBezier(p0.x, p0.y, p3.x, p3.y, color, selected);
}

function drawBezier(x0, y0, x3, y3, color, thick) {
    const cpx = (x0 + x3) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cpx, y0, cpx, y3, x3, y3);
    ctx.strokeStyle = color;
    ctx.lineWidth = (thick ? 3 : 2) / zoom;
    ctx.stroke();
}

function drawNode(n) {
    const cfg = NODE_TYPES[n.type] || NODE_TYPES.action;
    const selected = selectedNodeIds.has(n.id);

    if (selected) { ctx.shadowColor = '#4fa4d8'; ctx.shadowBlur = 12 / zoom; }

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
    ctx.strokeStyle = selected ? '#4fa4d8' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = (selected ? 2 : 1) / zoom;
    roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 6 / zoom);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${11 / zoom}px "Share Tech Mono",monospace`;
    ctx.fillText(cfg.label, n.x + 8 / zoom, n.y + (NODE_TITLE - 6) / zoom);

    // Summary
    ctx.font = `${10 / zoom}px "Share Tech Mono",monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const summary = nodeSummary(n);
    const maxW = (NODE_W - 16) / zoom;
    ctx.fillText(truncate(ctx, summary, maxW), n.x + 8 / zoom, n.y + (NODE_TITLE + 16) / zoom);

    // Second summary line
    const summary2 = nodeSummary2(n);
    if (summary2) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText(truncate(ctx, summary2, maxW), n.x + 8 / zoom, n.y + (NODE_TITLE + 30) / zoom);
    }

    // Output port(s)
    const hp = hoveredPort;
    if (n.type === 'condition') {
        // True port (upper-right, green)
        const tp = outPortPosTrue(n);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'out_true') ? '#4fa4d8' : '#28a05a';
        ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1 / zoom; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${8 / zoom}px "Share Tech Mono",monospace`;
        ctx.textAlign = 'right';
        ctx.fillText('T', tp.x - PORT_R / zoom - 2 / zoom, tp.y + 3 / zoom);
        ctx.textAlign = 'left';
        // False port (lower-right, red)
        const fp = outPortPosFalse(n);
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'out_false') ? '#4fa4d8' : '#b02828';
        ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1 / zoom; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${8 / zoom}px "Share Tech Mono",monospace`;
        ctx.textAlign = 'right';
        ctx.fillText('F', fp.x - PORT_R / zoom - 2 / zoom, fp.y + 3 / zoom);
        ctx.textAlign = 'left';
    } else {
        const op = outPortPos(n);
        ctx.beginPath();
        ctx.arc(op.x, op.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'out') ? '#4fa4d8' : cfg.portColor;
        ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    }

    // Input port (not on event or getter nodes)
    if (n.type !== 'event' && n.type !== 'getter') {
        const ip = inPortPos(n);
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, PORT_R / zoom, 0, Math.PI * 2);
        ctx.fillStyle = (hp && hp.nodeId === n.id && hp.port === 'in') ? '#4fa4d8' : cfg.portColor;
        ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1 / zoom; ctx.stroke();
    }
}

function nodeSummary(n) {
    switch (n.type) {
        case 'event':     return n.data.eventName || '\u2014';
        case 'condition': return `${n.data.check} ${n.data.operator} ${n.data.value}`;
        case 'action':    return n.data.actionType || '\u2014';
        case 'delay':     return `wait ${n.data.delayMs || 1000}ms`;
        case 'getter':    return n.data.source || '\u2014';
        default:          return '';
    }
}

function nodeSummary2(n) {
    if (n.type === 'action') {
        const defs = ACTION_PARAM_DEFS[n.data.actionType];
        if (!defs || defs.length === 0) return '';
        return defs.map(d => `${d.key}=${n.data[d.key] ?? d.default}`).join(', ');
    }
    return '';
}

function truncate(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    while (text.length > 0 && c.measureText(text + '\u2026').width > maxW) text = text.slice(0, -1);
    return text + '\u2026';
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

    const ph = portHit(wx, wy);
    if (ph && ph.port.startsWith('out')) {
        let fromPort;
        if (ph.port === 'out_true') fromPort = 'true';
        else if (ph.port === 'out_false') fromPort = 'false';
        portDrag = { nodeId: ph.nodeId, port: ph.port, curX: wx, curY: wy, fromPort };
        needRedraw = true;
        return;
    }

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
            const existing = currentGraph.connections.find(c => c.fromNode === portDrag.nodeId && c.toNode === ph.nodeId && c.fromPort === (portDrag.fromPort || undefined));
            if (!existing) {
                const conn = {
                    id: connId(portDrag.nodeId, ph.nodeId) + (portDrag.fromPort ? '_' + portDrag.fromPort : ''),
                    fromNode: portDrag.nodeId,
                    toNode: ph.nodeId,
                };
                if (portDrag.fromPort) conn.fromPort = portDrag.fromPort;
                currentGraph.connections.push(conn);
                dirty = true; API.setDirty(true);
            }
        }
        portDrag = null;
        hoveredPort = null;
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
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveGraphs(); }
}

// ── Context menu ─────────────────────────────────────────────────────────────
function showContextMenu(e, wx, wy) {
    e.preventDefault();
    removeContextMenu();
    const menu = document.createElement('div');
    menu.id = 'story-ctx-menu';
    menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;
        background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);font-family:"Share Tech Mono",monospace;font-size:12px;min-width:160px;overflow:hidden;`;

    // Categories
    const cats = [
        { label: '\u25cf EVENT',     type: 'event',     color: '#28a05a' },
        { label: '\u25c6 CONDITION', type: 'condition', color: '#c06820' },
        { label: '\u26a1 ACTION',    type: 'action',    color: '#b02828' },
        { label: '\u23f1 DELAY',     type: 'delay',     color: '#2563a8' },
        { label: '\ud83d\udcca GETTER',    type: 'getter',    color: '#268a9e' },
    ];

    for (const cat of cats) {
        const item = document.createElement('div');
        item.textContent = cat.label;
        item.style.cssText = `padding:7px 14px;cursor:pointer;color:${cat.color};font-weight:bold;`;
        item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-secondary)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => {
            addNode(cat.type, wx, wy);
            removeContextMenu();
        });
        menu.appendChild(item);
    }

    document.body.appendChild(menu);
    const dismiss = () => { removeContextMenu(); document.removeEventListener('click', dismiss); };
    setTimeout(() => document.addEventListener('click', dismiss), 10);
}

function removeContextMenu() {
    document.getElementById('story-ctx-menu')?.remove();
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
            Right-click canvas to add nodes.<br>Drag from port to connect.<br>Delete key removes selection.
        </div>`;
        return;
    }

    if (selectedConnId) {
        const c = currentGraph.connections.find(x => x.id === selectedConnId);
        propsEl.innerHTML = `<div style="font-size:11px;padding:6px;">
            <b>Connection</b><br>
            <span style="color:var(--text-muted);">From:</span> ${c?.fromNode || '\u2014'}<br>
            <span style="color:var(--text-muted);">To:</span> ${c?.toNode || '\u2014'}<br>
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
        case 'event':
            fields = `
                <div class="pf"><label>Event</label>
                <select data-field="eventName">${EVENT_NAMES.map(e => `<option ${n.data.eventName===e?'selected':''}>${e}</option>`).join('')}</select></div>`;
            break;
        case 'condition':
            fields = `
                <div class="pf"><label>Check (dot-path into event payload)</label>
                <input type="text" data-field="check" value="${esc(n.data.check)}" placeholder="damage, enemy.type, etc."></div>
                <div class="pf"><label>Operator</label>
                <select data-field="operator">${COND_OPS.map(o => `<option ${n.data.operator===o?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="pf"><label>Value</label>
                <input type="text" data-field="value" value="${esc(String(n.data.value))}"></div>`;
            break;
        case 'action': {
            const actionSelect = `<div class="pf"><label>Action Type</label>
                <select data-field="actionType" id="action-type-select">${ACTION_TYPES.map(a => `<option ${n.data.actionType===a?'selected':''}>${a}</option>`).join('')}</select></div>`;
            const paramFields = buildActionParamFields(n);
            fields = actionSelect + paramFields;
            break;
        }
        case 'delay':
            fields = `
                <div class="pf"><label>Delay (ms)</label>
                <input type="number" data-field="delayMs" value="${n.data.delayMs}" min="0" step="100"></div>`;
            break;
        case 'getter':
            fields = `
                <div class="pf"><label>Source (game state to read)</label>
                <select data-field="source">${GETTER_SOURCES.map(s => `<option ${n.data.source===s?'selected':''}>${s}</option>`).join('')}</select></div>
                <div style="font-size:10px;color:var(--text-muted);padding:4px 0;">
                    Connect output to a Condition node's input.<br>
                    The condition will check against this live value.
                </div>`;
            break;
    }

    propsEl.innerHTML = `
        <div style="padding:6px;">
            <div style="font-weight:600;color:${cfg.headerColor};font-size:12px;margin-bottom:8px;
                        border-bottom:1px solid var(--border);padding-bottom:6px;">${cfg.label} NODE</div>
            <style>.pf{margin-bottom:8px;}.pf label{display:block;font-size:10px;color:var(--text-muted);
                margin-bottom:3px;text-transform:uppercase;letter-spacing:.5px;}
                .pf input,.pf select,.pf textarea{width:100%;font-size:11px;background:var(--bg-secondary);
                color:var(--text);border:1px solid var(--border);border-radius:3px;padding:4px 6px;box-sizing:border-box;}</style>
            ${fields}
            <button class="btn btn-sm btn-danger" id="del-node-btn" style="width:100%;margin-top:4px;">Delete Node</button>
        </div>`;

    // Wire change handlers
    propsEl.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('input', () => applyField(n, el));
        el.addEventListener('change', () => applyField(n, el));
    });

    // Action type change rebuilds params
    const ats = document.getElementById('action-type-select');
    if (ats) {
        ats.addEventListener('change', () => {
            const newType = ats.value;
            n.data.actionType = newType;
            const defaults = getActionDefaults(newType);
            Object.assign(n.data, defaults);
            dirty = true; API.setDirty(true);
            needRedraw = true;
            renderProps(); // re-render with new params
        });
    }

    document.getElementById('del-node-btn')?.addEventListener('click', () => {
        selectedNodeIds.clear(); selectedNodeIds.add(n.id);
        deleteSelectedNodes();
    });
}

function buildActionParamFields(n) {
    const defs = ACTION_PARAM_DEFS[n.data.actionType] || [];
    return defs.map(d => {
        const val = n.data[d.key] ?? d.default;
        if (d.editor === 'sound-select') {
            const options = buildRuntimeSoundKeyOptions(String(val ?? ''));
            return buildSelectField(d.label, d.key, String(val ?? ''), [
                { value: '', label: options.length ? 'Select runtime sound...' : 'No runtime sounds loaded' },
                ...options,
            ]);
        }
        if (d.optionsSource === 'doorIds') {
            const options = buildRuntimeDoorIdOptions(String(val ?? ''));
            return buildSelectField(d.label, d.key, String(val ?? ''), [
                { value: '', label: options.length ? 'Select runtime door...' : 'No runtime doors found' },
                ...options,
            ]);
        }
        if (Array.isArray(d.options) && d.options.length > 0) {
            const options = buildStaticSelectOptions(d.options, val);
            return buildSelectField(d.label, d.key, String(val ?? ''), options);
        }
        const inputType = d.type === 'number' ? 'number' : 'text';
        return `<div class="pf"><label>${esc(d.label)}</label>
            <input type="${inputType}" data-field="${d.key}" value="${esc(String(val))}"></div>`;
    }).join('');
}

function buildStaticSelectOptions(options, selectedValue) {
    const selected = String(selectedValue ?? '');
    const normalized = [];
    const seen = new Set();
    for (const option of options) {
        const value = String(option?.value ?? option ?? '');
        if (seen.has(value)) continue;
        seen.add(value);
        normalized.push({
            value,
            label: String(option?.label ?? value),
        });
    }
    if (selected && !seen.has(selected)) {
        normalized.push({ value: selected, label: `${selected} (custom)` });
    }
    return normalized;
}

function buildSelectField(label, key, value, options) {
    return `<div class="pf"><label>${esc(label)}</label>
        <select data-field="${esc(key)}">${options.map((option) => {
            const optionValue = String(option.value ?? '');
            const optionLabel = String(option.label ?? optionValue);
            return `<option value="${esc(optionValue)}" ${String(value) === optionValue ? 'selected' : ''}>${esc(optionLabel)}</option>`;
        }).join('')}</select></div>`;
}

function buildRuntimeSoundKeyOptions(selectedValue = '') {
    const optionMap = new Map();
    for (const sound of soundList) {
        const key = getRuntimeSoundKey(sound);
        if (!key || optionMap.has(key)) continue;
        optionMap.set(key, { value: key, label: key });
    }
    if (selectedValue && !optionMap.has(selectedValue)) {
        optionMap.set(selectedValue, { value: selectedValue, label: `${selectedValue} (custom)` });
    }
    return [...optionMap.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function buildRuntimeDoorIdOptions(selectedValue = '') {
    const optionMap = new Map();
    for (const option of doorIdOptions) {
        const value = String(option?.value || '');
        if (!value || optionMap.has(value)) continue;
        optionMap.set(value, { value, label: String(option?.label || value) });
    }
    if (selectedValue && !optionMap.has(selectedValue)) {
        optionMap.set(selectedValue, { value: selectedValue, label: `${selectedValue} (custom)` });
    }
    return [...optionMap.values()].sort(compareRuntimeDoorIds);
}

function compareRuntimeDoorIds(a, b) {
    const aValue = String(a?.value || '');
    const bValue = String(b?.value || '');
    const aMatch = aValue.match(/^auto_door_(\d+)$/);
    const bMatch = bValue.match(/^auto_door_(\d+)$/);
    if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
    if (aMatch) return -1;
    if (bMatch) return 1;
    return aValue.localeCompare(bValue);
}

function collectRuntimeDoorIdsFromState(state) {
    const tilemaps = Array.isArray(state?.tilemaps) && state.tilemaps.length
        ? state.tilemaps
        : (Array.isArray(TILED_MAP_TEMPLATES) ? TILED_MAP_TEMPLATES : []);
    const ids = new Map();
    for (const tilemap of tilemaps) {
        const components = collectDoorComponents(tilemap?.doors);
        let index = 0;
        for (const component of components) {
            if (!getDoorOrientation(component.tiles)) continue;
            const value = `auto_door_${index + 1}`;
            if (!ids.has(value)) ids.set(value, { value, label: value });
            index += 1;
        }
    }
    return [...ids.values()].sort(compareRuntimeDoorIds);
}

function collectDoorComponents(doorGrid) {
    if (!Array.isArray(doorGrid) || !doorGrid.length || !Array.isArray(doorGrid[0])) return [];
    const h = doorGrid.length;
    const w = doorGrid[0].length;
    const visited = Array.from({ length: h }, () => Array(w).fill(false));
    const groups = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const value = Number(doorGrid[y]?.[x]) || 0;
            if (value <= 0 || visited[y][x]) continue;
            const queue = [{ x, y }];
            const tiles = [];
            visited[y][x] = true;
            while (queue.length) {
                const current = queue.shift();
                tiles.push(current);
                const neighbors = [
                    { x: current.x + 1, y: current.y },
                    { x: current.x - 1, y: current.y },
                    { x: current.x, y: current.y + 1 },
                    { x: current.x, y: current.y - 1 },
                ];
                for (const neighbor of neighbors) {
                    if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= w || neighbor.y >= h) continue;
                    if (visited[neighbor.y][neighbor.x]) continue;
                    if ((Number(doorGrid[neighbor.y]?.[neighbor.x]) || 0) !== value) continue;
                    visited[neighbor.y][neighbor.x] = true;
                    queue.push(neighbor);
                }
            }
            tiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            groups.push({ value, tiles });
        }
    }
    return groups;
}

function getDoorOrientation(tiles) {
    if (!Array.isArray(tiles) || tiles.length !== 2) return '';
    const [a, b] = tiles;
    if (a.x === b.x && Math.abs(a.y - b.y) === 1) return 'vertical';
    if (a.y === b.y && Math.abs(a.x - b.x) === 1) return 'horizontal';
    return '';
}

function getRuntimeSoundKey(sound) {
    const path = String(sound?.path || '');
    if (!path.startsWith('/src/audio/')) return '';
    return String(sound?.name || '').replace(/\.(wav|ogg|mp3|flac|webm)$/i, '');
}

function applyField(n, el) {
    const f = el.dataset.field;
    if (el.type === 'checkbox') n.data[f] = el.checked;
    else if (el.type === 'number') n.data[f] = parseFloat(el.value) || 0;
    else n.data[f] = el.value;
    dirty = true; API.setDirty(true); needRedraw = true;
}

function esc(v) { return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Graph list management ────────────────────────────────────────────────────
async function loadGraphList() {
    try {
        const r = await API.apiFetch('/api/editor-state');
        const d = await r.json();
        const state = d?.state || d;
        graphs = Array.isArray(state?.nodeGraphs) ? state.nodeGraphs : [];
    } catch { graphs = []; }
    renderGraphList();
}

function renderGraphList() {
    const el = document.getElementById('story-list');
    if (!el) return;
    if (!graphs.length) {
        el.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted);">No graphs yet. Click + New.</div>';
        return;
    }
    el.innerHTML = graphs.map(g => `
        <div class="story-list-item ${currentGraph?.id === g.id ? 'active' : ''}" data-id="${g.id}"
             style="padding:7px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12px;
                    display:flex;align-items:center;justify-content:space-between;
                    ${currentGraph?.id === g.id ? 'background:rgba(74,164,216,0.15);color:var(--accent);' : ''}">
            <span style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" data-enable="${g.id}" ${g.enabled !== false ? 'checked' : ''} title="Enable/disable">
                <span>${esc(g.name)}</span>
                <span style="font-size:10px;color:var(--text-muted);">(${g.nodes?.length || 0})</span>
            </span>
            <button class="btn btn-sm" data-del="${g.id}" title="Delete" style="padding:0 4px;font-size:10px;color:#e05555;">\u2715</button>
        </div>`).join('');

    el.querySelectorAll('.story-list-item').forEach(item => {
        item.addEventListener('click', e => {
            if (e.target.dataset.del || e.target.dataset.enable) return;
            selectGraph(item.dataset.id);
        });
    });
    el.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => deleteGraph(btn.dataset.del));
    });
    el.querySelectorAll('[data-enable]').forEach(cb => {
        cb.addEventListener('change', () => {
            const g = graphs.find(x => x.id === cb.dataset.enable);
            if (g) { g.enabled = cb.checked; dirty = true; API.setDirty(true); }
        });
    });
}

function selectGraph(id) {
    currentGraph = graphs.find(g => g.id === id) || null;
    selectedNodeIds.clear(); selectedConnId = null;
    panX = canvas ? canvas.width / 2 - NODE_W : 0; panY = 80; zoom = 1;
    renderGraphList();
    renderProps();
    needRedraw = true;
}

function deleteGraph(id) {
    if (!confirm('Delete this graph?')) return;
    graphs = graphs.filter(g => g.id !== id);
    if (currentGraph?.id === id) { currentGraph = null; renderProps(); }
    dirty = true; API.setDirty(true);
    renderGraphList();
    needRedraw = true;
}

function showNewGraphDialog() {
    const { body, footer, close } = API.showModal('New Action Graph');
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">
            <label style="font-size:12px;">Name:</label>
            <input type="text" class="input" id="ng-name" placeholder="Queen Death FX" style="width:100%;">
        </div>`;
    footer.innerHTML = `<button class="btn btn-secondary btn-sm" id="ng-cancel">Cancel</button>
                        <button class="btn btn-primary btn-sm" id="ng-create">Create</button>`;
    document.getElementById('ng-cancel').onclick = close;
    document.getElementById('ng-create').onclick = () => {
        const name = document.getElementById('ng-name').value.trim();
        if (!name) { API.toast('Name required', 'warning'); return; }
        const graph = { id: graphUid(), name, enabled: true, nodes: [], connections: [] };
        // Seed with an Event node
        const eventNode = makeNode('event', 60, 120);
        graph.nodes.push(eventNode);
        graphs.push(graph);
        close();
        currentGraph = graph;
        dirty = true; API.setDirty(true);
        renderGraphList();
        renderProps();
        needRedraw = true;
    };
}

async function saveGraphs() {
    try {
        // Read current editor state, merge nodeGraphs, save back
        const r = await API.apiFetch('/api/editor-state');
        const d = await r.json();
        const state = d?.state || d || {};
        state.nodeGraphs = graphs;
        await API.apiFetch('/api/editor-state', {
            method: 'POST',
            body: JSON.stringify({ state }),
        });
        dirty = false; API.setDirty(false);
        API.recordSave();
        API.toast('Graphs saved', 'success');
    } catch (err) { API.toast('Save failed: ' + err.message, 'error'); }
}

function validateGraph() {
    if (!currentGraph) return;
    const errors = [];
    const nodeIds = new Set(currentGraph.nodes.map(n => n.id));
    const eventNodes = currentGraph.nodes.filter(n => n.type === 'event');
    if (eventNodes.length === 0) errors.push('No event nodes (graph has no entry point)');
    for (const n of currentGraph.nodes) {
        const hasIncoming = currentGraph.connections.some(c => c.toNode === n.id);
        const hasOutgoing = currentGraph.connections.some(c => c.fromNode === n.id);
        if (n.type !== 'event' && !hasIncoming) errors.push(`${NODE_TYPES[n.type]?.label || n.type} node "${n.id}" has no incoming connection`);
        if (n.type === 'action' && !n.data.actionType) errors.push(`Action node "${n.id}" has no action type`);
        if (n.type === 'event' && !n.data.eventName) errors.push(`Event node "${n.id}" has no event selected`);
    }
    for (const c of currentGraph.connections) {
        if (!nodeIds.has(c.fromNode)) errors.push(`Dead connection from ${c.fromNode}`);
        if (!nodeIds.has(c.toNode)) errors.push(`Dead connection to ${c.toNode}`);
    }
    if (errors.length === 0) API.toast('Graph is valid', 'success');
    else { const { body } = API.showModal('Validation Issues'); body.innerHTML = '<ul style="font-size:12px;">' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>'; }
}

async function loadSoundList() {
    try {
        const r = await API.apiFetch('/api/sounds');
        const d = await r.json();
        soundList = d.ok ? d.sounds : [];
        const nodeId = [...selectedNodeIds][0];
        const selectedNode = currentGraph?.nodes?.find((node) => node.id === nodeId);
        if (selectedNode?.type === 'action' && selectedNode.data?.actionType === 'play_sound') {
            renderProps();
        }
    } catch { soundList = []; }
}

async function loadDoorIdList() {
    try {
        const r = await API.apiFetch('/api/editor-state');
        const d = await r.json();
        doorIdOptions = collectRuntimeDoorIdsFromState(d?.state || d);
        const nodeId = [...selectedNodeIds][0];
        const selectedNode = currentGraph?.nodes?.find((node) => node.id === nodeId);
        if (selectedNode?.type === 'action') {
            const defs = ACTION_PARAM_DEFS[selectedNode.data?.actionType] || [];
            if (defs.some((def) => def.optionsSource === 'doorIds')) renderProps();
        }
    } catch { doorIdOptions = []; }
}

async function refreshReferenceData() {
    await Promise.all([loadGraphList(), loadSoundList(), loadDoorIdList()]);
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
                            <button class="btn btn-sm btn-primary" id="story-new-btn">+ New</button>
                            <button class="btn btn-sm btn-secondary" id="story-refresh-btn">\u21bb</button>
                        </div>
                    </div>
                    <div class="panel-body" style="flex:1;overflow-y:auto;padding:0;" id="story-list"></div>
                </div>
            </aside>

            <!-- Center: canvas graph -->
            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                <div class="toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="story-fit-btn" title="Fit graph to view">Fit</button>
                        <button class="btn btn-sm btn-secondary" id="story-validate-btn" title="Validate graph">Validate</button>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <span style="font-size:11px;color:var(--text-muted);" id="story-hint">Right-click to add nodes \u2022 Drag port to connect \u2022 Del removes \u2022 Ctrl+S saves</span>
                    </div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-primary" id="story-save-btn">Save</button>
                    </div>
                </div>
                <div style="flex:1;overflow:hidden;position:relative;" id="story-canvas-wrap">
                    <canvas id="story-canvas" style="display:block;width:100%;height:100%;"></canvas>
                </div>
            </div>

            <!-- Right: properties -->
            <aside style="width:260px;min-width:200px;overflow-y:auto;border-left:1px solid var(--border);">
                <div class="panel-header" style="padding:6px 8px;">Properties</div>
                <div id="story-props"></div>
            </aside>
        </div>`;

    canvas = document.getElementById('story-canvas');
    ctx = canvas.getContext('2d');
    propsEl = document.getElementById('story-props');

    const wrap = document.getElementById('story-canvas-wrap');
    const ro = new ResizeObserver(() => {
        canvas.width  = wrap.clientWidth;
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

    document.getElementById('story-new-btn').addEventListener('click', showNewGraphDialog);
    document.getElementById('story-refresh-btn').addEventListener('click', refreshReferenceData);
    document.getElementById('story-save-btn').addEventListener('click', saveGraphs);
    document.getElementById('story-validate-btn').addEventListener('click', validateGraph);
    document.getElementById('story-fit-btn').addEventListener('click', () => {
        if (!currentGraph || !currentGraph.nodes.length) return;
        const xs = currentGraph.nodes.map(n => n.x);
        const ys = currentGraph.nodes.map(n => n.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
        const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
        const pad = 40;
        const scaleX = (canvas.width  - pad * 2) / (maxX - minX || 1);
        const scaleY = (canvas.height - pad * 2) / (maxY - minY || 1);
        zoom = Math.min(scaleX, scaleY, 2);
        panX = pad - minX * zoom;
        panY = pad - minY * zoom;
        needRedraw = true;
    });
}

// ── Module exports ────────────────────────────────────────────────────────────
async function init() {
    await refreshReferenceData();
    renderProps();
    if (rafId) cancelAnimationFrame(rafId);
    rafLoop();
}

function cleanup() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener('keydown', onKeyDown);
}

export default { render: buildUI, onShow: init, onHide: cleanup, async save() { if (dirty) await saveGraphs(); } };
