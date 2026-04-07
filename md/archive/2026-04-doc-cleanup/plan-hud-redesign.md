# HUD Redesign Plan

> **Historical note:** this root-level plan is superseded by the live HUD work tracked in `md/progress.md`, `md/handoff.md`, and `prompts/hud-editor.md`.

## Objective
Redesign the HUD to match the reference image (/home/drevilbob/Aliens/images/hud.png) pixel-perfectly, including:
1. Moving HEAL buttons to appear below the head video panel.
2. Enhancing the scanline shader to cover the entire UI, including video elements.

## Execution Steps

### 1. Layout Adjustment
- Modify `HUD.js` to redefine the layout of squad cards.
- Update the `HEAL` button coordinates to ensure they are positioned directly below the video feed panel within each card's container.
- Ensure the `dataPanel` (the dark section for text below the video) is adjusted if necessary to accommodate the buttons.

### 2. Scanline Effect Implementation
- The current `scanlines` implementation uses a Graphics object with `lineBetween`. This is applied per-card.
- To achieve a uniform "screen-wide" scanline effect over everything (including videos), I will:
    - Create a screen-sized Graphics object in `CRTFrame.js` that sits on top of all HUD elements.
    - Set its blend mode to `MULTIPLY` or `OVERLAY` with a low opacity to create the scanning effect.
    - Alternatively, if performance is an issue, optimize the existing `scanlines` per-container approach to be more consistent across the UI.

### 3. Verification
- Use the provided reference image (hud.png) as an overlay in a local test browser to check visual alignment.
- Run the game and ensure that HEAL buttons function correctly in their new positions.
