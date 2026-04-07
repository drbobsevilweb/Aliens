# HUD Editor Upgrade — Quick Start Checklist

> **Historical checklist:** this pre-implementation note is retained as background research. For the live HUD surface, use `prompts/hud-editor.md` and `md/progress.md`.

**Timeline Target:** 240 minutes (3-4 hours)  
**Approach:** Canvas + Custom UI  
**Status:** Research Complete ✅

---

## Pre-Implementation (30 minutes before you start)

- [ ] Read `hud-editor-recommendation-summary.txt` (10 min)
- [ ] Review implementation roadmap (Phase 1-5 breakdown)
- [ ] Ensure no existing work in `/editors/tabs/hud.js`
- [ ] Test that `/editors?tab=hud` loads and works
- [ ] Verify `/game` loads current HUD correctly
- [ ] Define final breakpoint list:
  - [ ] 1280×720 (current)
  - [ ] 1920×1080 (proposed)
  - [ ] 1024×768 (tablet, optional)
  - [ ] 375×667 (mobile, optional)
- [ ] Create git branch: `hud-editor-styling`

---

## Phase 1: Foundation (45 minutes)

**Goal:** Add breakpoint tabs and switching logic

### Code Changes

In `editors/tabs/hud.js`:

- [ ] Add breakpoints object definition:
```javascript
const breakpoints = {
    '1280x720': { w: 1280, h: 720, label: '1280×720' },
    '1920x1080': { w: 1920, h: 1080, label: '1920×1080' },
};
let activeBreakpoint = '1280x720';
```

- [ ] Add breakpoint switching function:
```javascript
function switchBreakpoint(bpKey) {
    activeBreakpoint = bpKey;
    const bp = breakpoints[bpKey];
    gameWidth = bp.w;
    gameHeight = bp.h;
    // Load/swap panel positions for this breakpoint
    for (const p of panels) {
        if (!p.breakpoints) p.breakpoints = {};
        if (!p.breakpoints[bpKey]) {
            p.breakpoints[bpKey] = { x: p.x, y: p.y, width: p.width, height: p.height };
        }
        p.x = p.breakpoints[bpKey].x;
        p.y = p.breakpoints[bpKey].y;
        p.width = p.breakpoints[bpKey].width;
        p.height = p.breakpoints[bpKey].height;
    }
    resizeCanvas();
    renderPanelList();
    draw();
}
```

- [ ] Add breakpoint tabs HTML (above canvas element):
```html
<div class="breakpoint-tabs" style="display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--border);">
    <button class="bp-btn active" data-bp="1280x720">1280×720</button>
    <button class="bp-btn" data-bp="1920x1080">1920×1080</button>
</div>
```

- [ ] Wire up breakpoint button events:
```javascript
document.querySelectorAll('.bp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.bp-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchBreakpoint(btn.dataset.bp);
    });
});
```

### Testing
- [ ] Click breakpoint tabs; canvas should resize
- [ ] Move a panel on 1280×720
- [ ] Switch to 1920×1080; panel should stay where it was on first breakpoint
- [ ] Switch back; panel should be at original 1280×720 position

**Commit:** `hud-editor: phase-1-breakpoint-tabs`

---

## Phase 2: Styling Controls (90 minutes)

**Goal:** Add color picker, font controls, effects section

### Code Changes

In `renderProps()` function, add styling section to HTML:

- [ ] Color pickers section:
```html
<div style="margin-bottom:8px;">
    <label style="display:block;font-size:11px;color:var(--text-muted);">Colors</label>
    <label style="display:flex;align-items:center;gap:4px;">
        BG:
        <input type="color" class="style-input" data-style="bgColor" value="#020810" style="width:40px;">
    </label>
    <label style="display:flex;align-items:center;gap:4px;">
        Border:
        <input type="color" class="style-input" data-style="borderColor" value="#4aa4d8" style="width:40px;">
    </label>
    <label style="display:flex;align-items:center;gap:4px;">
        Text:
        <input type="color" class="style-input" data-style="textColor" value="#e8f0f8" style="width:40px;">
    </label>
</div>
```

- [ ] Typography section:
```html
<div style="margin-bottom:8px;">
    <label style="display:block;font-size:11px;color:var(--text-muted);">Typography</label>
    <label style="display:flex;gap:4px;">
        Font:
        <select class="style-input" data-style="fontFamily" style="flex:1;">
            <option value="'Share Tech Mono', monospace">Share Tech Mono</option>
            <option value="'IBM Plex Mono', monospace">IBM Plex Mono</option>
        </select>
    </label>
    <label style="display:flex;gap:4px;align-items:center;">
        Label Size:
        <input type="number" class="style-input" data-style="labelFontSize" value="11" min="8" max="20" style="width:60px;">
    </label>
</div>
```

- [ ] Wire event listeners:
```javascript
document.querySelectorAll('.style-input').forEach(inp => {
    inp.addEventListener('change', () => {
        if (!selectedPanel._style) selectedPanel._style = {};
        selectedPanel._style[inp.dataset.style] = inp.value;
        dirty = true;
        API.setDirty(true);
        draw();
    });
});
```

### Canvas Rendering Updates

In `draw()` function:

- [ ] Read style values from panel:
```javascript
const style = p._style || {};
const bgColor = style.bgColor || '#020810';
const borderColor = style.borderColor || '#4aa4d8';
const textColor = style.textColor || '#e8f0f8';
```

- [ ] Apply to fill and border:
```javascript
ctx.globalAlpha = style.opacity ?? 1;
ctx.fillStyle = bgColor;
ctx.fillRect(px, py, pw, ph);
ctx.globalAlpha = 1;

ctx.strokeStyle = borderColor;
ctx.lineWidth = style.borderWidth || 1.5;
ctx.strokeRect(px, py, pw, ph);
```

- [ ] Apply to text rendering:
```javascript
ctx.fillStyle = textColor;
const fontSize = (style.labelFontSize || 11) * scale;
const fontFamily = style.fontFamily || 'monospace';
ctx.font = `${fontSize}px ${fontFamily}`;
ctx.fillText(p.label, px + 4, py + 12 * scale);
```

### Testing
- [ ] Select leader card
- [ ] Click color picker (bgColor); canvas should update immediately
- [ ] Change font size; preview should update
- [ ] Switch breakpoints; styles should persist per breakpoint
- [ ] Save to game; verify no errors

**Commit:** `hud-editor: phase-2-styling-controls`

---

## Phase 3: Alignment Tools (45 minutes)

**Goal:** Add alignment and distribute buttons

### Code Changes

Add alignment buttons to sidebar:

- [ ] HTML for alignment section:
```html
<div class="panel" style="flex:0 0 auto;">
    <div class="panel-header">Alignment</div>
    <div class="panel-body" style="padding:8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:4px;">
            <button class="btn btn-sm btn-secondary" id="align-left">Left</button>
            <button class="btn btn-sm btn-secondary" id="align-center">Center</button>
            <button class="btn btn-sm btn-secondary" id="align-right">Right</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <button class="btn btn-sm btn-secondary" id="dist-h">Dist H</button>
            <button class="btn btn-sm btn-secondary" id="dist-v">Dist V</button>
        </div>
    </div>
</div>
```

- [ ] Alignment functions:
```javascript
function alignPanels(alignment) {
    const selected = panels.filter(p => selectedPanel?.key === p.key || p._selected);
    if (selected.length < 2) return;
    
    if (alignment === 'left') {
        const minX = Math.min(...selected.map(p => p.x));
        selected.forEach(p => p.x = minX);
    } else if (alignment === 'center') {
        const midX = selected.reduce((sum, p) => sum + p.x, 0) / selected.length;
        selected.forEach(p => p.x = midX);
    } else if (alignment === 'right') {
        const maxX = Math.max(...selected.map(p => p.x + p.width));
        selected.forEach(p => p.x = maxX - p.width);
    }
    
    dirty = true;
    API.setDirty(true);
    draw();
}

function distributePanels(direction) {
    const selected = panels.filter(p => selectedPanel?.key === p.key || p._selected);
    if (selected.length < 3) return;
    
    const sorted = direction === 'h' 
        ? selected.sort((a, b) => a.x - b.x)
        : selected.sort((a, b) => a.y - b.y);
    
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const spacing = direction === 'h'
        ? (last.x - first.x) / (sorted.length - 1)
        : (last.y - first.y) / (sorted.length - 1);
    
    sorted.forEach((p, i) => {
        if (direction === 'h') p.x = first.x + spacing * i;
        else p.y = first.y + spacing * i;
    });
    
    dirty = true;
    API.setDirty(true);
    draw();
}
```

- [ ] Wire buttons:
```javascript
document.getElementById('align-left').addEventListener('click', () => alignPanels('left'));
document.getElementById('align-center').addEventListener('click', () => alignPanels('center'));
document.getElementById('align-right').addEventListener('click', () => alignPanels('right'));
document.getElementById('dist-h').addEventListener('click', () => distributePanels('h'));
document.getElementById('dist-v').addEventListener('click', () => distributePanels('v'));
```

### Testing
- [ ] Select leader card
- [ ] Move tech card to different X position
- [ ] Click "Align Center"; both should align horizontally
- [ ] Click "Dist H"; should spread evenly

**Commit:** `hud-editor: phase-3-alignment-tools`

---

## Phase 4: Data & Integration (30 minutes)

**Goal:** Serialize styles and integrate with HUD.js

### Code Changes

In `panelsToConfig()`:

- [ ] Update to include _style:
```javascript
function panelsToConfig() {
    const out = {};
    for (const p of panels) {
        out[p.key] = {
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: Math.round(p.width),
            height: Math.round(p.height),
        };
        if (p._style && Object.keys(p._style).length > 0) {
            out[p.key]._style = p._style;
        }
        if (p.breakpoints && Object.keys(p.breakpoints).length > 0) {
            out[p.key].breakpoints = p.breakpoints;
        }
    }
    return out;
}
```

In `buildPanels()`:

- [ ] Update to load _style:
```javascript
function buildPanels() {
    panels = PANEL_DEFS.map(def => {
        const cfg = config[def.key] || {};
        return {
            key: def.key,
            label: def.label,
            color: def.color,
            x: cfg.x ?? def.defaultX,
            y: cfg.y ?? def.defaultY,
            width: cfg.width ?? def.defaultW,
            height: cfg.height ?? def.defaultH,
            _style: cfg._style || {},
            breakpoints: cfg.breakpoints || {},
            subs: cfg._subs || {},
            locked: false,
        };
    });
}
```

In `src/ui/HUD.js`:

- [ ] Add style reader in `_getCardConfig()`:
```javascript
const style = cardCfg._style || {};
const bgColor = style.bgColor ? parseInt(style.bgColor.replace('#', ''), 16) : HUD_COLORS.panelFill;
const borderColor = style.borderColor ? parseInt(style.borderColor.replace('#', ''), 16) : 0x4aa4d8;
const textColor = style.textColor || HUD_COLORS.nameWhite;
const fontSize = style.labelFontSize || 11;
const fontFamily = style.fontFamily || HUD_FONT;

// Apply when creating panel:
panelFill.setFillStyle(bgColor, 0.06);
chrome.lineStyle(1.5, borderColor, 0.75);
// ... etc for text rendering
```

### Testing
- [ ] Make styling changes in editor
- [ ] Click "Save to Game"
- [ ] Open `/game?mission=m1`
- [ ] HUD cards should have custom colors/fonts
- [ ] Reload page; should persist

**Commit:** `hud-editor: phase-4-data-integration`

---

## Phase 5: Testing & Polish (30 minutes)

**Goal:** Validate end-to-end, catch regressions

### Regression Testing

- [ ] Load old config without `_style`; should work
- [ ] Positioning/resizing still works
- [ ] Canvas redraw <16ms (DevTools Performance)
- [ ] No console errors

### Feature Testing

- [ ] Color changes save and persist
- [ ] Font size renders correctly on canvas
- [ ] Breakpoints preserve per-panel styling
- [ ] Alignment buttons work with multiple selected
- [ ] Export JSON is valid

### Integration Testing

- [ ] `/editors` tab loads HUD tab
- [ ] `/game` applies custom colors
- [ ] `/settings` doesn't conflict with editor
- [ ] No interaction issues between tabs

### Edge Cases

- [ ] Very small font sizes (floor: 8px)
- [ ] Very large font sizes (ceiling: 32px)
- [ ] Special characters in color values
- [ ] Overlapping panels render correctly

### Performance

- [ ] Canvas redraws on color change within 100ms
- [ ] No memory leaks after 100+ edits
- [ ] Switching breakpoints is instant

**Commit:** `hud-editor: phase-5-testing-validation`

---

## Final Checklist

- [ ] All 5 phases complete
- [ ] No console errors in browser DevTools
- [ ] No regressions in existing features
- [ ] HUD.js successfully applies custom styles
- [ ] Config file is valid JSON
- [ ] Data persists across browser reload
- [ ] Timeline under 240 minutes (including breaks)

---

## Troubleshooting

### Canvas not rendering colors
- Check if _style object is populated
- Verify color format: #rrggbb (6 digits)
- Test: `parseInt('#020810'.replace('#', ''), 16)` in console

### Font not changing
- Check fontFamily is in system fonts list
- Verify ctx.font format: "size weight family"
- Test: `ctx.font = '14px "Share Tech Mono", monospace'`

### Breakpoint switch loses data
- Ensure panel.breakpoints[bpKey] exists before swap
- Check switchBreakpoint() copies current state first

### HUD.js not applying styles
- Verify _style object reaches HUD.js via config
- Add console.log(hudConfig) in HUD.js constructor
- Check color parsing: `parseInt(color.replace('#', ''), 16)`

---

## Commit Messages Template

```
hud-editor: phase-N-feature-description

- Added [feature]
- Updated [file]
- Test: [verification]

Timeline: X min elapsed / 240 min total
```

---

## Success! 🎉

When all phases complete:
- [ ] HUD editor has color picker
- [ ] HUD editor has font controls
- [ ] HUD editor has alignment tools
- [ ] HUD editor has breakpoint support
- [ ] Game renders custom styles
- [ ] All data persists and exports correctly
- [ ] Zero regressions

**Next:** Merge to main, push to remote, update CLAUDE.md backlog status.
