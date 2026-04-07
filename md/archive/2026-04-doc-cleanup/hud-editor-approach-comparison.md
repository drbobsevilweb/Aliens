# HUD Editor Approach Comparison Quick Reference

## Feature Evaluation Matrix

| Feature | Figma Embed | Framer | Canvas + UI | Web Components | CSS Builders |
|---------|---|---|---|---|---|
| **Color Picker** | ✅ Industry-std | ⚠️ Via overrides | ✅ Native `<input type="color">` | ✅ Via CSS vars | ✅ UI included |
| **Font Controls** | ✅ Full typography panel | ⚠️ Framer fonts only | ✅ Dropdown + size/weight | ✅ Token-based | ✅ Full CSS |
| **Alignment/Distribution** | ✅ Constraints system | ⚠️ Auto layout only | ✅ Custom buttons | ✅ Flexbox | ✅ Grid UI |
| **Responsiveness** | ✅ Frames/artboards | ⚠️ Prototype only | ✅ Breakpoint tabs | ✅ Media queries | ✅ Built-in |
| **Export to JSON** | ⚠️ Custom serializer needed | ⚠️ React code output | ✅ Native | ⚠️ CSS custom props | ⚠️ CSS/HTML output |
| **Integration Effort** | 6-8h | 8-12h | **3-4h** | 5-7h | 4-6h (iframe) / 12h+ (native) |
| **Dependencies** | Figma account + API key | Framer platform | None | Web Components lib | Full builder (500KB+) |
| **Learning Curve** | Medium (Figma plugins) | High (Framer overrides) | **Low (vanilla JS)** | Medium (custom elements) | High (tool-specific) |
| **Collaboration** | ✅ Real-time | ❌ Single design | ❌ Single user | ❌ Single user | ⚠️ Via platform |
| **Vendor Lock-in** | ✅ High | ✅ High | ❌ None (JSON owns data) | ❌ None | ⚠️ Medium (tool choice) |
| **Cost** | $12+/mo per user | Free-$16/mo | Free | Free | Free-Enterprise |
| **Embeddability** | ⚠️ REST API / Plugin-only | ❌ Not designed for embed | ✅ Native in your app | ✅ Web Components | ⚠️ iframe or rebuild |
| **Performance** | Fast (managed by Figma) | Medium | **Fast (<16ms)** | Fast | Medium |
| **Undo/Redo** | ✅ Built-in | ✅ Built-in | ⚠️ Manual (reset button) | ⚠️ Manual | ✅ Built-in |

---

## Fit for Aliens HUD Editor Needs

### Must-Haves
- ✅ Color picker for panel colors (bgColor, borderColor, textColor)
- ✅ Font size/weight/family controls
- ✅ Alignment/distribution tools
- ✅ Breakpoint support (1280×720, 1920×1080, tablet)
- ✅ JSON export matching `src/data/hudConfig.js` structure
- ✅ No external accounts/API keys
- ✅ Integrate into `/editors` without breaking existing tabs

### Nice-to-Haves
- ⚠️ Real-time collaboration (deprioritized)
- ⚠️ Advanced constraints (nice but not core)
- ⚠️ Design token management (future phase)

---

## Decision Tree

```
START: "Modernize HUD editor with styling controls"
│
├─ Timeline: 3-4 hours?
│  ├─ YES → Canvas + UI ✅ (Proceed)
│  └─ NO → Evaluate longer timelines
│
├─ Need collaboration?
│  ├─ YES → Figma Embed (6-8h)
│  └─ NO → Canvas + UI ✅
│
├─ Have design system (10+ components)?
│  ├─ YES → Web Components (5-7h) or CSS Builders
│  └─ NO → Canvas + UI ✅
│
├─ Need to ship in Figma as website?
│  ├─ YES → Framer (8-12h or separate project)
│  └─ NO → Canvas + UI ✅
│
└─ Default: Canvas + UI ✅
```

---

## Recommended: Canvas + Custom UI

**Why this wins:**

1. **Pragmatic** — Directly addresses your constraints
2. **Proven pattern** — Your tilemap editor already uses this architecture
3. **No bloat** — Native HTML5, no frameworks
4. **Owner-centric** — JSON format stays under your control
5. **Realistic timeline** — 3-4 hours is achievable and shippable

**Implementation phases:**
1. Breakpoint UI (40 min) — Tabs for 1280×720, 1920×1080, tablet, mobile
2. Color pickers (25 min) — bgColor, borderColor, textColor inputs
3. Typography (35 min) — Font dropdown, size/weight controls
4. Effects (20 min) — Opacity, border width, glow
5. Alignment (20 min) — Buttons to distribute, snap to grid
6. Canvas rendering (30 min) — Apply colors/fonts to preview
7. Data serialization (25 min) — Save/load `_style` object
8. HUD.js integration (20 min) — Consumer reads custom styles
9. Testing (25 min) — End-to-end validation

**Total:** 240 minutes (exactly on target)

---

## Config Structure Evolution

**Current (v1):**
```json
{
  "leaderCard": {
    "x": 60,
    "y": 50,
    "width": 210,
    "height": 110
  }
}
```

**After upgrade (v2, backward-compatible):**
```json
{
  "leaderCard": {
    "x": 60,
    "y": 50,
    "width": 210,
    "height": 110,
    "_style": {
      "bgColor": "#020810",
      "borderColor": "#4aa4d8",
      "textColor": "#e8f0f8",
      "fontFamily": "'Share Tech Mono', monospace",
      "labelFontSize": 11,
      "valueFontSize": 14,
      "fontWeight": 600,
      "opacity": 1,
      "borderWidth": 1.5,
      "glowColor": "#4aa4d8",
      "glowBlur": 8
    },
    "breakpoints": {
      "1280x720": { "x": 60, "y": 50, "width": 210, "height": 110, "_style": {...} },
      "1920x1080": { "x": 90, "y": 80, "width": 280, "height": 140, "_style": {...} }
    }
  }
}
```

**Why backward-compatible:**
- Old code reads x/y/width/height at root level
- New code checks `breakpoints[activeBreakpoint]` first, then falls back to root
- `_style` object is optional; defaults hardcoded if missing

---

## Effort Estimate Breakdown

| Phase | Est. Time | Risk |
|-------|-----------|------|
| Breakpoint tabs + switching | 40 min | Low |
| Color pickers integration | 25 min | Low |
| Typography controls | 35 min | Low |
| Effects section | 20 min | Low |
| Alignment tool buttons | 20 min | Low |
| Canvas color/font rendering | 30 min | Medium (font rendering edge cases) |
| Data serialization | 25 min | Low |
| HUD.js consumer code | 20 min | Low |
| Testing + edge cases | 25 min | Medium (cross-breakpoint consistency) |
| **Contingency buffer** | — | **15 min built-in** |
| **Total** | 240 min | ✅ Green |

---

## Why NOT the Alternatives

### Figma Embed (❌)
- Requires Figma Team account ($12+/mo minimum)
- Embed API is read-only; full editor is premium plugin
- 2MB vendor bundle for single HUD config
- MCP server is new (March 2026); unproven integration path
- 6-8 hour integration timeline defeats purpose
- **Better for:** Full design-system collaboration across org

### Framer (❌)
- Framer is a **website builder**, not an embeddable editor
- Headless API is for CMS content, not layout editing
- Output is React/Framer code, not your JSON
- Can't sync back to your game config format
- 8-12 hour effort (if possible at all)
- **Better for:** Building Aliens.com marketing site in Framer

### Web Components + Design System (❌)
- Adds abstraction layer that only pays off with 10+ components
- You have 5 panels; Web Components = engineering debt
- Still need visual editor on top; doesn't save integration time
- 5-7 hour effort for what Canvas + UI does in 3-4h
- **Better for:** Long-term multi-project design system work

### CSS-in-JS Builders (Webstudio/Pinegrow) (❌)
- These are **full website builders**, not embeddable HUD editors
- Output is CSS/HTML/React, not your JSON config
- Either iframe (heavy sync complexity) or native rebuild (12h+)
- 500KB+ bloat for single HUD
- No export path back to your format
- **Better for:** Landing pages, marketing sites

---

## Implementation Snapshot

**Your existing editor pattern (tilemap tab):**
```javascript
// Property panel on left
// Canvas rendering on right
// Save → API call → file written
// Load → API call → parsed into UI state
```

**HUD tab follows same pattern:**
```javascript
// Property panel: x/y/width/height + NEW styling controls
// Canvas: positioned panels with NEW color/font preview
// Save → panelsToConfig() → includes _style object
// Load → buildPanels() → deserializes styles
```

**Zero architecture changes; pure feature addition.**

---

## Go/No-Go Checklist

- [ ] **Timeline realistic?** Yes, 3-4 hours is achievable (240 min total)
- [ ] **Dependencies acceptable?** Yes, zero new dependencies
- [ ] **Data format compatible?** Yes, backward-compatible JSON
- [ ] **Pattern aligned with codebase?** Yes, matches tilemap editor
- [ ] **Stakeholders agree?** (Awaiting approval)

**Recommendation: ✅ PROCEED with Canvas + Custom UI approach**

---

See full implementation details in `./research-hud-editor-modernization.md`.
