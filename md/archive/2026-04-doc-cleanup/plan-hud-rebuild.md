# Plan: HUD Rebuild — Video-Background Marine Cards

## Goal

Replace the current mockup.png-based card layout with video-feed-as-background cards. Each marine card uses that marine's portrait video as the full card background at 60% opacity with scanlines, and vitals (ammo, HP, EKG) are drawn on top.

## Current State (from code audit)

- Card width: **320px** — needs to increase to **~500px**
- `mockup.png` (276x200) is loaded as `'hud_mockup'` and stretched to 320x236 as the card base
- Portrait video IS instantiated (`this.scene.add.video()`) at 300x170, alpha 0.7, tinted 0x88aacc, looping
- Video keys: `portrait_video`, `portrait3_video`, `portrait_horrowitz_video`, `interference_video`
- Videos are 300px wide MP4s (49-134KB)
- 7-segment displays for HP (24px), ammo (18px), magazine (12px)
- EKG is smooth polyline (already fixed from blocky dots)
- Scanlines: horizontal lines every 3px, black alpha 0.12 — already present but subtle
- Overlay container at depth 200, scroll-factor 0

## Required Changes

### 1. Remove mockup.png as card background
- Delete the `this.scene.add.image(... 'hud_mockup')` base image from card construction
- mockup.png can remain loaded as a reference but should not render

### 2. Video becomes the card background
- Enlarge video to fill the entire card area (~500px wide, proportional height)
- Set video alpha to **0.60** (down from 0.7)
- Video should be the bottom-most element in the card container
- Keep per-marine video switching via `getPortraitVideoKey()`
- Consider: may need larger source videos if 300px MP4s look blurry at 500px — check visual quality first

### 3. Resize card to ~500px wide
- Update primary panel dimensions: `p.width` from 320 → ~500
- Reposition all overlay elements (HP, ammo, mag, EKG, labels, buttons) for new width
- Roster rows below primary panel also need width adjustment
- Check that the card doesn't overlap the game viewport too much — may need to adjust game camera offset

### 4. Scanlines over the video
- Current scanline overlay: black lines every 3px at alpha 0.12
- Increase intensity slightly for CRT effect (alpha 0.15-0.18) since the video background is now more prominent
- Ensure scanlines render ABOVE the video but BELOW the vitals text/graphics
- Container order: video → scanlines → frame/border → vitals → labels → buttons

### 5. Vitals overlay adjustments
- HP 7-segment: reposition for wider card, keep left-side placement
- Ammo 7-segment: reposition for wider card, keep top-right area
- Magazine count: reposition relative to ammo
- EKG waveform: can be wider (stretch from 250px to ~400px), keep bottom placement
- All text labels (AMMO, MAG, VITAL %) need repositioning
- HEAL/MONITOR buttons: reposition for new width

### 6. Cleanup
- Remove any dead code related to the old mockup-as-background approach
- Remove unused coordinate constants for old 320px layout
- Check if `images/mockup.png` is still referenced anywhere else; if not, it can stay as a design reference but remove the preload

## Risks

- 300px MP4 videos upscaled to 500px may look blurry — may need re-encoded source videos
- 500px card on left edge may eat too much screen real estate on smaller viewports
- Phaser video playback has known quirks on some browsers (autoplay policies)

## Files to Edit

- `src/ui/HUD.js` — primary rewrite of card layout
- `src/scenes/BootScene.js` — adjust preload if video assets change, possibly remove mockup preload

## Acceptance Criteria

- Each marine card shows their portrait video as full-bleed background at 60% opacity
- Scanlines visible over the video
- Ammo, HP, EKG render clearly on top of the video background
- Card is ~500px wide
- Selecting different marines switches the video feed
- No visual artifacts or layout overlap with game viewport
