# HUD Editor Modernization Research — Complete Analysis

> **Historical research note:** this 2026-04-02 bundle is retained for background only. The active HUD planning surface now lives in `prompts/hud-editor.md`, and shipped status belongs in `md/progress.md` / `md/handoff.md`.

**Research Date:** 2026-04-02  
**Status:** Complete  
**Recommendation:** Canvas + Custom UI (3-4 hours to ship)

---

## Documents

### 1. Executive Summary (START HERE)
**File:** `hud-editor-recommendation-summary.txt`

Quick reference for decision-makers. Covers:
- Problem statement and scope
- Why Canvas + Custom UI wins
- Effort breakdown (240 minutes)
- Why other approaches were rejected
- Implementation checklist
- Risk assessment

**Read time:** 10 minutes

---

### 2. Detailed Technical Research
**File:** `research-hud-editor-modernization.md`

Comprehensive deep-dive. Includes:
- Evaluation of 5 major approaches
- Pros/cons matrix for each
- Feature set detailed breakdown
- Code integration examples
- Data structure evolution
- Validation checklist
- Full implementation roadmap

**Read time:** 30 minutes  
**For:** Engineers implementing the upgrade

---

### 3. Quick Reference Comparison
**File:** `hud-editor-approach-comparison.md`

Side-by-side matrix. Includes:
- Feature evaluation table (10 features × 5 approaches)
- Decision tree logic
- Effort breakdown by phase
- Config structure examples
- Why alternatives don't fit

**Read time:** 15 minutes  
**For:** Quick lookups during implementation

---

## Key Findings Summary

### The Problem
Current HUD editor (`/editors/tabs/hud.js`) handles **positioning only** (x/y/width/height). Missing:
- Color picker for panel styling
- Font size/weight/family controls
- Alignment/distribution tools
- Responsive breakpoint support (1280×720, 1920×1080, tablet, mobile)

### The Solution
**Canvas + Custom UI approach** (Approach #3 from research):
- Extend existing canvas-based editor pattern
- Add property panel sections for styling
- Use native HTML5 color picker, font dropdowns
- Render preview on canvas in real-time
- Export to backward-compatible JSON

### Why This Wins
1. **Realistic timeline** — 240 minutes (3-4 hours exactly)
2. **Zero dependencies** — Native HTML5, no frameworks or accounts
3. **Full control** — JSON format remains yours; no vendor lock-in
4. **Proven pattern** — Matches your tilemap editor architecture
5. **Incremental shipping** — Each phase independently deployable

### Why Other Approaches Failed Evaluation

| Approach | Timeline | Why Rejected |
|----------|----------|--------------|
| **Figma Embed** | 6-8h | Requires account; premium for editor; 2MB vendor bundle; overkill |
| **Framer** | 8-12h | Website builder, not editor; output doesn't match JSON format |
| **Web Components** | 5-7h | Over-engineered for 5 panels; doesn't save time |
| **CSS Builders** | 4-6h (iframe) / 12h+ (native) | Full website builders; not embeddable; 500KB+ bloat |

---

## Implementation Roadmap

### 5 Phases (240 minutes total)

**Phase 1: Foundation (45 min)**
- Breakpoint tabs + switching
- Canvas resizing per breakpoint
- Load/save breakpoint state

**Phase 2: Styling Controls (90 min)**
- Color pickers (bgColor, borderColor, textColor)
- Typography (font family, size, weight)
- Effects (opacity, border width, glow)
- Real-time canvas preview

**Phase 3: Alignment Tools (45 min)**
- Alignment buttons (left/center/right)
- Distribute tools (horizontal/vertical)
- Snap configuration

**Phase 4: Data & Integration (30 min)**
- Serialize `_style` to JSON
- HUD.js consumer code
- Backward compatibility

**Phase 5: Testing (30 min)**
- Persistence across breakpoints
- Canvas performance (<16ms)
- Game integration verification

---

## Data Structure

### Current (v1)
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

### Enhanced (v2, backward-compatible)
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

**Backward compatibility:** Old code reads x/y/width/height at root; new code checks breakpoints first.

---

## Integration Points

### In `editors/tabs/hud.js`
- Add breakpoint management functions
- Extend property panel with styling controls
- Update canvas draw() to render colors/fonts
- Serialize/deserialize _style in config

### In `src/ui/HUD.js`
- Read custom colors from _style
- Read custom font properties from _style
- Apply to card rendering without changing core logic

---

## Success Criteria

✅ Timeline: Complete within 240 minutes  
✅ Features: All 5 approach requirements working  
✅ Data: Backward-compatible JSON export  
✅ Performance: Canvas redraw <16ms  
✅ Integration: HUD.js applies styles in-game  
✅ Zero regressions: Existing features unchanged  

---

## Next Steps

1. **Review recommendation** — Confirm Canvas + Custom UI is desired approach
2. **Schedule implementation block** — Reserve 4 uninterrupted hours
3. **Prepare environment** — Define final breakpoint list; test HUD.js color parsing
4. **Implement incrementally** — Use phase checklist; commit after each phase
5. **Validate end-to-end** — Test in `/game` with custom styles applied

---

## References

**Research sources:**
- [Figma AI Bridge & MCP Server (March 2026)](https://www.francescatabor.com/articles/2026/3/31/building-a-figma-driven-mcp-production-pipeline)
- [Puck Editor: Open-source React visual editor](https://puckeditor.com/docs)
- [interact.js: Drag and drop library](https://interactjs.io/)
- [Konva: Canvas 2D library](https://konvajs.org/)
- [Framer Developers API](https://www.framer.com/developers/)
- [Responsive Design Breakpoints](https://www.browserstack.com/guide/responsive-design-breakpoints)
- [Webstudio: Open-source visual builder](https://webstudio.is/)
- [Pinegrow Web Editor](https://pinegrow.com/)

---

## Questions?

All research documents live in `/md/`:
- `hud-editor-recommendation-summary.txt` — Quick reference
- `research-hud-editor-modernization.md` — Full technical details
- `hud-editor-approach-comparison.md` — Side-by-side matrix
