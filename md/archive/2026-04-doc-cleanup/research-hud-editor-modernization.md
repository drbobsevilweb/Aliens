# HUD Layout Editor Modernization Research
**Date:** 2026-04-02  
**Scope:** Upgrade `/editors/tabs/hud.js` with visual styling controls (color, font, alignment, responsiveness)  
**Timeline Goal:** 3-4 hours to production-ready implementation  

---

## Executive Summary

The current HUD editor (`hud.js`) is **canvas-based positioning-only** — it handles x/y/width/height but lacks visual styling controls. After evaluating 5 major approaches, **Canvas + Custom UI (Approach #3)** emerges as the best 3-4 hour solution because it:

1. **Leverages existing code** — Requires no new framework; builds on your established canvas + property panel pattern
2. **Fastest integration** — No build tools, dependencies, or learning curve
3. **Full control** — Styling export format stays under your ownership; no lock-in
4. **Matches your project** — Mirrors the existing tilemap/sprite editor architecture
5. **Easy responsiveness** — Multi-breakpoint support (1280×720, 1920×1080, etc.) via config objects

**Estimated effort:** 180-240 minutes (3-4 hours)  
**Risk:** Low; incremental additions to existing canvas draw loop

---

## Approach Evaluation Matrix

### Approach #1: Figma Embed (REST API / MCP Server)

**What:** Embed lightweight Figma editor via Figma's REST API or new MCP server integration (Feb 2026)

**Pros:**
- Industry-standard; familiar to designers
- Real-time collaboration out-of-the-box
- Figma's color picker, typography, constraints are battle-tested
- MCP server can call Figma SDK directly (execute JS on canvas)

**Cons:**
- **Requires Figma Team account** (~$12/mo minimum) or OAuth setup
- Embed API is read-only; editing requires premium plugin
- Overkill for single-panel HUD config; adds ~2MB vendor bundle
- Learning curve for Figma plugin architecture
- External dependency; requires API key management
- Export to JSON requires custom serialization layer

**Integration effort:** 6-8 hours  
**Best for:** Multi-designer collaboration; full design-system work  

**Not recommended** for this scope — cost, complexity, and friction exceed benefit.

---

### Approach #2: Framer (Design-to-Code / Headless CMS API)

**What:** Use Framer's developer API to generate code from visual designs; or reverse-engineer design as Framer component

**Pros:**
- AI-assisted code generation (2026 feature)
- Can copy from Figma directly into Framer
- Responsive breakpoints built-in (mobile/tablet/desktop)
- Reduces design-to-code time by ~60%

**Cons:**
- **Framer is primarily a no-code site builder**, not an embeddable editor
- API is for creating custom components on Framer's platform, not embedding in your app
- Headless CMS integration is for content, not visual layout editing
- No direct "embed editor in my web app" pattern
- Output is Framer React code, not your JSON format
- Steep learning curve for Framer overrides/API

**Integration effort:** 8-12 hours (if possible at all)  
**Best for:** Building the game site in Framer itself (separate project)

**Not recommended** — designed for a different use case; wrong abstraction level.

---

### Approach #3: Canvas + Custom UI (HTML/CSS/DOM + Canvas Rendering)

**What:** Extend your existing canvas-based editor with property panels for color picker, font selector, alignment tools. Render previews on canvas.

**Pros:**
- **Minimal dependencies** — Use native `<input type="color">`, `<select>`, drag libraries already available
- **Incremental development** — Slot into existing property panel system
- **Pure JavaScript** — No build step; instant refresh
- **Full data ownership** — JSON export format remains yours
- **Responsive support** — Easy to add breakpoint tabs (1280×720, 1920×1080, etc.)
- **Color picker + font controls built-in** — HTML5 color input + system fonts via CSS
- **Alignment tools** — Snap to grid, distribute, align buttons (canvas button rendering)
- **3-4 hour timeframe realistic** — Proven by your tilemap editor patterns

**Cons:**
- **Manual alignment UX** — No AI-assisted snapping (like Figma)
- **No collaboration** — Single-user only
- **Text rendering edge cases** — Canvas text metrics tricky on some fonts
- **Manual undo/redo** — Must implement history stack yourself

**Integration effort:** 3-4 hours (incremental)  
**Best for:** Tight deadline; internal-use editor; designer+dev workflow

**Strongly recommended** — Matches your project constraints perfectly.

---

### Approach #4: Web Component Design System (Vaadin / Custom Elements)

**What:** Use Web Components + CSS custom properties to define a HUD design system; authoring via property panel

**Pros:**
- Framework-agnostic; CSS vars mean reusability
- No vendor lock-in
- Aligns with modern standards
- Can generate design tokens (color scales, typography scales)

**Cons:**
- **Overkill for single HUD** — Design systems shine when you have 50+ components
- Extra abstraction layer; slower iteration
- Requires Web Components understanding (custom `<custom-hud-panel>` elements)
- Still need visual editor on top; Web Components define structure, not editing UI
- Learning curve for CSS custom properties + component lifecycle

**Integration effort:** 5-7 hours  
**Best for:** Large design system (10+ components); long-term maintainability

**Not recommended** for 3-4 hour timeline; saves effort on next 5 projects, not this one.

---

### Approach #5: CSS-in-JS Visual Builder (Webstudio / Pinegrow / Bootstrap Studio)

**What:** Use open-source visual builder (Webstudio, Silex, ContentBuilder.js) to define HUD layout visually

**Pros:**
- Full CSS control visually (Webstudio, Pinegrow)
- Responsive breakpoints included
- Can export CSS + JSON
- Some tools (Silex, Webstudio) are open-source

**Cons:**
- **These are full website builders**, not embeddable HUD editors
- Requires hosting separate instance or embedding via iframe (heavy)
- No real-time sync back to your game config
- Export format (CSS/HTML/React) doesn't match your JSON structure
- Overkill; adds 500KB+ bundle size

**Integration effort:** 4-6 hours (via iframe) or 12+ hours (native integration)  
**Best for:** Building landing pages; not in-game HUD editing

**Not recommended** — Wrong use case; adds bloat.

---

## Recommended Solution: Canvas + Custom UI (3-4 hour implementation)

### Architecture

```
editors/tabs/hud.js (EXISTING)
├─ Canvas rendering (positioning only)
└─ Property panel (x, y, width, height)

↓ UPGRADE TO:

editors/tabs/hud.js (ENHANCED)
├─ Canvas rendering (positioning + styling preview)
├─ Property panel (x, y, width, height)
└─ STYLING PANEL (NEW)
    ├─ Color Picker (for panelFill, borderColor, textColor)
    ├─ Font Controls (family, size, weight)
    ├─ Alignment Tools (snap to grid, distribute, align)
    ├─ Breakpoints (1280×720, 1920×1080, tablet variants)
    └─ Advanced (opacity, shadow, glow)
```

### Feature Set (Deliverables)

#### 1. Color Picker Integration
```javascript
// In Properties panel: new "Colors" section
<input type="color" id="panel-bg-color" value="#020810">
<input type="color" id="panel-border-color" value="#4aa4d8">
<input type="color" id="text-color" value="#e8f0f8">

// On change: update config, redraw canvas
canvas redraw with new colors
```

**Data storage:**
```json
{
  "leaderCard": {
    "x": 60, "y": 50, "width": 210, "height": 110,
    "_style": {
      "bgColor": "#020810",
      "borderColor": "#4aa4d8",
      "textColor": "#e8f0f8",
      "borderWidth": 1.5,
      "opacity": 1
    }
  }
}
```

#### 2. Font Controls
```javascript
// Font family dropdown (system fonts only)
<select id="font-family">
  <option>"Share Tech Mono", monospace</option>
  <option>"IBM Plex Mono", monospace</option>
  <option>Georgia, serif</option>
  <option>sans-serif</option>
</select>

// Font size (label + value size separately)
<input type="number" id="label-font-size" min="8" max="20" value="11">
<input type="number" id="value-font-size" min="12" max="32" value="14">

// Font weight
<select id="font-weight">
  <option value="400">Normal</option>
  <option value="500">Medium</option>
  <option value="600">Bold</option>
</select>
```

#### 3. Alignment / Distribution Tools
```javascript
// Snap-to-grid (already exists)
// Add: distribute horizontally / vertically
<button id="align-left">⬅ Left</button>
<button id="align-center">↔ Center</button>
<button id="align-right">➡ Right</button>
<button id="distribute-h">≡ Distribute H</button>
<button id="distribute-v">≡ Distribute V</button>

// Snap distance
<input type="number" id="snap-size" min="1" max="50" value="10">
```

#### 4. Responsiveness / Breakpoints
```javascript
// Breakpoint tabs above canvas
<div class="breakpoint-tabs">
  <button class="bp-btn active" data-bp="1280x720">
    1280×720
  </button>
  <button class="bp-btn" data-bp="1920x1080">
    1920×1080
  </button>
  <button class="bp-btn" data-bp="tablet">
    1024×768
  </button>
  <button class="bp-btn" data-bp="mobile">
    375×667
  </button>
</div>

// Each breakpoint has independent position/size config
// Canvas scales to fit each breakpoint
// On switch: reload canvas with breakpoint dimensions
```

**Data storage:**
```json
{
  "leaderCard": {
    "breakpoints": {
      "1280x720": {
        "x": 60, "y": 50, "width": 210, "height": 110,
        "_style": { ... }
      },
      "1920x1080": {
        "x": 90, "y": 80, "width": 280, "height": 140,
        "_style": { ... }
      }
    }
  }
}
```

#### 5. Export Format

Current:
```json
{
  "leaderCard": { "x": 60, "y": 50, "width": 210, "height": 110 }
}
```

Enhanced:
```json
{
  "leaderCard": {
    "breakpoints": {
      "1280x720": {
        "x": 60, "y": 50, "width": 210, "height": 110,
        "_style": {
          "bgColor": "#020810",
          "borderColor": "#4aa4d8",
          "borderWidth": 1.5,
          "textColor": "#e8f0f8",
          "fontFamily": "'Share Tech Mono', monospace",
          "labelFontSize": 11,
          "valueFontSize": 14,
          "fontWeight": 600,
          "opacity": 1,
          "glowColor": "#4aa4d8",
          "glowBlur": 8
        }
      }
    }
  }
}
```

Then in `src/ui/HUD.js`, read this config:
```javascript
const style = hudConfig.leaderCard._style || {};
const bgColor = style.bgColor ? parseInt(style.bgColor.replace('#', ''), 16) : HUD_COLORS.panelFill;
const borderColor = style.borderColor ? parseInt(style.borderColor.replace('#', ''), 16) : 0x4aa4d8;
// Apply to card creation
```

---

## Implementation Roadmap (180-240 minutes)

### Phase 1: Foundation (45 min)
- [ ] Add `breakpoints` object to HUD_CONFIG structure
- [ ] Add breakpoint tab UI above canvas (vanilla HTML)
- [ ] Switch canvas rendering between breakpoints
- [ ] Update `resizeCanvas()` to read breakpoint dimensions

### Phase 2: Styling Controls (90 min)
- [ ] Build "Colors" section in property panel
  - [ ] bgColor, borderColor, textColor pickers
  - [ ] Preview on canvas immediately
- [ ] Build "Typography" section
  - [ ] Font family dropdown
  - [ ] Font size sliders (label + value)
  - [ ] Font weight selector
  - [ ] Preview on canvas
- [ ] Build "Effects" section
  - [ ] Opacity slider
  - [ ] Border width slider
  - [ ] Glow blur slider
  - [ ] Glow color picker

### Phase 3: Alignment Tools (45 min)
- [ ] Add alignment buttons (left/center/right/distribute)
- [ ] Implement canvas-based distribute logic
  - [ ] Horizontal: equal spacing between panel centers
  - [ ] Vertical: equal spacing between panel centers
- [ ] Add snap-size config to grid settings

### Phase 4: Data & Export (30 min)
- [ ] Update `panelsToConfig()` to serialize `_style` object
- [ ] Update `buildPanels()` to deserialize styles
- [ ] Update canvas `draw()` to render with custom colors/fonts
- [ ] Test save/load round-trip

### Phase 5: Testing & Polish (30 min)
- [ ] Test color picker changes persist across breakpoints
- [ ] Verify canvas preview updates in real-time
- [ ] Test export to game (HUD.js reads `_style`)
- [ ] Undo/redo (basic: reload from server)

---

## Effort Breakdown by Task

| Task | Time | Dependency |
|------|------|-----------|
| Breakpoint UI + switching | 40 min | None |
| Color picker section | 25 min | Breakpoint UI |
| Typography controls | 35 min | Breakpoint UI |
| Effects controls | 20 min | Color picker |
| Alignment tool buttons | 20 min | None |
| Canvas color/font rendering | 30 min | Color/Typography |
| Data serialization (_style) | 25 min | Canvas rendering |
| HUD.js consumer code | 20 min | Serialization |
| Testing + edge cases | 25 min | Consumer code |
| **Total** | **240 min** | — |

---

## Code Integration Points

### 1. In `editors/tabs/hud.js`

**Add to PANEL_DEFS:**
```javascript
const PANEL_DEFS = [
    { 
        key: 'leaderCard', 
        label: 'Leader Card',    
        defaultX: 10, defaultY: 30, defaultW: 210, defaultH: 116, 
        color: '#33ff66',
        // NEW:
        defaultStyle: {
            bgColor: '#020810',
            borderColor: '#4aa4d8',
            textColor: '#e8f0f8',
            fontFamily: '"Share Tech Mono", monospace',
            labelFontSize: 11,
            valueFontSize: 14,
            fontWeight: 600
        }
    },
    // ... others
];
```

**Add breakpoint management:**
```javascript
let activeBreakpoint = '1280x720';
const breakpoints = {
    '1280x720': { w: 1280, h: 720, label: '1280×720' },
    '1920x1080': { w: 1920, h: 1080, label: '1920×1080' },
    'tablet': { w: 1024, h: 768, label: 'Tablet' },
};

function switchBreakpoint(bpKey) {
    activeBreakpoint = bpKey;
    const bp = breakpoints[bpKey];
    gameWidth = bp.w;
    gameHeight = bp.h;
    resizeCanvas();
    // Load/create panel positions for this breakpoint
    for (const p of panels) {
        if (!p.breakpoints) p.breakpoints = {};
        if (!p.breakpoints[bpKey]) {
            p.breakpoints[bpKey] = { x: p.x, y: p.y, width: p.width, height: p.height };
        }
        // Swap active position to this breakpoint
        p.x = p.breakpoints[bpKey].x;
        p.y = p.breakpoints[bpKey].y;
        p.width = p.breakpoints[bpKey].width;
        p.height = p.breakpoints[bpKey].height;
    }
    renderPanelList();
    renderProps();
    draw();
}
```

**Enhance canvas rendering in `draw()`:**
```javascript
function draw() {
    // ... existing grid + border ...
    
    for (const p of panels) {
        const style = p._style || {};
        const bgColor = style.bgColor || '#020810';
        const borderColor = style.borderColor || '#4aa4d8';
        const textColor = style.textColor || '#e8f0f8';
        const opacity = style.opacity ?? 1;
        
        ctx.globalAlpha = opacity;
        ctx.fillStyle = bgColor;
        ctx.fillRect(px, py, pw, ph);
        
        ctx.globalAlpha = 1;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = style.borderWidth || 1;
        ctx.strokeRect(px, py, pw, ph);
        
        // Render label with custom font
        const fontFamily = style.fontFamily || 'monospace';
        const fontSize = (style.labelFontSize || 11) * scale;
        ctx.fillStyle = textColor;
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillText(p.label, px + 4, py + 12 * scale);
    }
}
```

**Update properties panel:**
```javascript
function renderProps() {
    const el = document.getElementById('hud-props');
    if (!selectedPanel) return;
    const p = selectedPanel;
    const style = p._style || {};
    
    el.innerHTML = `
        <div style="margin-bottom:8px;font-weight:600;color:${p.color};">${p.label}</div>
        
        <!-- Positioning -->
        <div style="margin-bottom:8px;">
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:2px;">Position & Size</label>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:12px;">
                <label>X:</label><input type="number" class="input input-sm" id="hp-x" value="${Math.round(p.x)}">
                <label>Y:</label><input type="number" class="input input-sm" id="hp-y" value="${Math.round(p.y)}">
                <label>Width:</label><input type="number" class="input input-sm" id="hp-w" value="${Math.round(p.width)}">
                <label>Height:</label><input type="number" class="input input-sm" id="hp-h" value="${Math.round(p.height)}">
            </div>
        </div>
        
        <!-- Colors -->
        <div style="margin-bottom:8px;">
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:2px;">Colors</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;">
                    BG:
                    <input type="color" class="input input-sm style-input" data-style="bgColor" value="${style.bgColor || '#020810'}" style="width:40px;height:24px;">
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;">
                    Border:
                    <input type="color" class="input input-sm style-input" data-style="borderColor" value="${style.borderColor || '#4aa4d8'}" style="width:40px;height:24px;">
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;">
                    Text:
                    <input type="color" class="input input-sm style-input" data-style="textColor" value="${style.textColor || '#e8f0f8'}" style="width:40px;height:24px;">
                </label>
            </div>
        </div>
        
        <!-- Typography -->
        <div style="margin-bottom:8px;">
            <label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:2px;">Typography</label>
            <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
                <label style="display:flex;gap:4px;">
                    Font:
                    <select class="input input-sm style-input" data-style="fontFamily" style="flex:1;">
                        <option value="'Share Tech Mono', monospace">Share Tech Mono</option>
                        <option value="'IBM Plex Mono', monospace">IBM Plex Mono</option>
                        <option value="Georgia, serif">Georgia</option>
                    </select>
                </label>
                <label style="display:flex;gap:4px;align-items:center;">
                    Label Size:
                    <input type="number" class="input input-sm style-input" data-style="labelFontSize" value="${style.labelFontSize || 11}" min="8" max="20" style="width:60px;">
                </label>
                <label style="display:flex;gap:4px;align-items:center;">
                    Value Size:
                    <input type="number" class="input input-sm style-input" data-style="valueFontSize" value="${style.valueFontSize || 14}" min="12" max="32" style="width:60px;">
                </label>
            </div>
        </div>
        
        <button class="btn btn-sm btn-primary" id="hp-apply" style="margin-top:8px;">Apply</button>
    `;
    
    // Event delegation for all style inputs
    document.querySelectorAll('.style-input').forEach(inp => {
        inp.addEventListener('change', () => {
            if (!p._style) p._style = {};
            const styleKey = inp.dataset.style;
            p._style[styleKey] = inp.value;
            dirty = true;
            API.setDirty(true);
            draw();
        });
    });
    
    document.getElementById('hp-apply')?.addEventListener('click', () => {
        // ... existing position/size apply code ...
    });
}
```

### 2. In `src/ui/HUD.js`

**Read from new config:**
```javascript
_getCardConfig(roleKey) {
    const configKeys = { leader: 'leaderCard', tech: 'techCard', medic: 'medicCard', heavy: 'heavyCard' };
    const key = configKeys[roleKey];
    return (key && this._hudConfig[key] && typeof this._hudConfig[key] === 'object') ? this._hudConfig[key] : null;
}

// In createSquadCards():
const cardCfg = this._getCardConfig(def.roleKey);
const style = cardCfg._style || {};

// Apply custom colors
const bgColor = style.bgColor ? parseInt(style.bgColor.replace('#', ''), 16) : HUD_COLORS.panelFill;
const borderColor = style.borderColor ? parseInt(style.borderColor.replace('#', ''), 16) : 0x4aa4d8;
const textColor = style.textColor ? style.textColor : HUD_COLORS.nameWhite;

// Apply to panel creation
panelFill.setFillStyle(bgColor, 0.06);
chrome.lineStyle(1.5, borderColor, 0.75);
// ... update text creation with textColor
```

---

## Validation & Testing Checklist

- [ ] Color picker changes persist on save
- [ ] Font size changes render on canvas immediately
- [ ] Breakpoint switch preserves styling per breakpoint
- [ ] Export JSON has `_style` object
- [ ] HUD.js reads and applies styles without crashing
- [ ] Undo/redo works (reset button tests this)
- [ ] Panel alignment distribute spreads them evenly
- [ ] Canvas scales correctly when game width/height change
- [ ] No performance regression (draw() still <16ms)

---

## Known Gotchas

1. **Canvas font rendering** — `ctx.font` property requires both size and family together; fonts must be preloaded or system fonts
2. **Hex color parsing** — `#rrggbb` ↔ `0xrrggbb` conversion needed; use `parseInt(color.replace('#', ''), 16)`
3. **Breakpoint persistence** — Each panel must track positions separately per breakpoint; use nested object structure
4. **Opacity blending** — `ctx.globalAlpha` affects ALL subsequent draws; reset to 1 after panel fills
5. **Scale factor** — Canvas is rendered at fractional scale (fit-to-container); multiply grid sizes by `canvas._scale`

---

## Why Not the Others?

| Approach | Why Rejected |
|----------|--------------|
| Figma Embed | Requires account; premium features; overkill; 6-8h setup |
| Framer | Wrong use case; can't embed editor; headless API is for content, not layout |
| Web Components | Over-engineered for single HUD; 5-7h for 3-4h problem |
| CSS-in-JS Builders | Full website builders (Webstudio/Pinegrow); 500KB+ bloat; iframe sync complexity |

**Canvas + Custom UI** uniquely satisfies:
- **Tight timeline** (3-4h)
- **No dependencies** (native HTML5 inputs)
- **Full data ownership** (JSON format)
- **Matches project patterns** (canvas + property panels already proven)
- **Incremental delivery** (each phase is shippable)

---

## Success Criteria

1. **Timeline:** Complete within 240 minutes
2. **Feature parity:** Color picker, font controls, alignment, responsiveness working
3. **Data integrity:** Export format backward-compatible; existing configs load
4. **Performance:** Canvas redraw <16ms; no lag on color input changes
5. **HUD.js integration:** Game reads custom colors/fonts without modification to renderer logic
6. **Zero regressions:** Existing positioning/resizing still works

---

## References

- [Figma AI Bridge & MCP Server](https://www.francescatabor.com/articles/2026/3/31/building-a-figma-driven-mcp-production-pipeline)
- [Figma Developer Docs](https://developers.figma.com/)
- [Puck Editor (Open-source React visual editor)](https://puckeditor.com/docs)
- [interact.js (Drag & resize library)](https://interactjs.io/)
- [Konva (Canvas 2D library)](https://konvajs.org/)
- [Webstudio (Open-source visual builder)](https://webstudio.is/)
- [Pinegrow Web Editor](https://pinegrow.com/)
- [Framer Developers](https://www.framer.com/developers/)
- [Responsive Design Breakpoints](https://www.browserstack.com/guide/responsive-design-breakpoints)

---

## Next Steps

1. **Approve approach** — Confirm Canvas + Custom UI is desired direction
2. **Reserve 4-hour block** — Uninterrupted implementation window
3. **Prepare breakpoints.json** — Define tablet/mobile dimensions upfront
4. **Set up test mission** — Use `/game?mission=m1` to verify HUD applies styles
5. **Schedule code review** — SHADER or GRAPHICS agent to validate canvas rendering

---

**Recommendation:** Proceed with **Approach #3 (Canvas + Custom UI)** immediately. It's the pragmatic choice for your constraints and project maturity.
