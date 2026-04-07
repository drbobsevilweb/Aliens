#!/usr/bin/env python3
"""
Process marine.png sprite sheet for the Aliens game.

Input:  marine.png  — 1024×1024, 2×2 grid of 4 directional frames, RGB white background
Output: src/graphics/marine_sheet.png — 256×64 horizontal Phaser spritesheet, RGBA
        src/graphics/marine_frame_N.png — individual 64×64 frames for inspection

The script:
  1. Splits the 2×2 grid into 4 frames (512×512 each)
  2. Removes the white background (with soft anti-alias feathering at edges)
  3. Detects the pixel-art upscale factor so we know the true art resolution
  4. Tight-crops each frame to its sprite content
  5. Resizes to 64×64 (TARGET) preserving aspect ratio, centred on transparent canvas
  6. Saves individual PNGs + a combined horizontal spritesheet

Frame grid layout (row-major):
  [0,0] top-left     → frame 0 — South       (front-facing, toward viewer)
  [0,1] top-right    → frame 1 — South-East   (turned right)
  [1,0] bottom-left  → frame 2 — West         (gun pointing left)
  [1,1] bottom-right → frame 3 — East         (gun pointing right)
"""

import sys
from pathlib import Path
from PIL import Image
import numpy as np

TARGET = 64          # game sprite size in pixels (matches TILE_SIZE)
BG_THRESHOLD = 228   # pixels with mean brightness > this are treated as background

src = Path(__file__).parent / 'marine.png'
dst_dir = Path(__file__).parent / 'src' / 'graphics'
dst_dir.mkdir(parents=True, exist_ok=True)

print(f'Loading {src} ...')
img = Image.open(src).convert('RGBA')
W, H = img.size
print(f'  source size:  {W}×{H}')

COLS, ROWS = 2, 2
fw, fh = W // COLS, H // ROWS
print(f'  frame size:   {fw}×{fh}  ({COLS}×{ROWS} grid)')


# ── Estimate pixel-art upscale factor ────────────────────────────────────────
# Sample the first frame and look for the smallest repeating block size along
# the X axis among non-background pixel runs. This tells us how many source
# pixels correspond to 1 art pixel.
def estimate_pixel_size(frame_rgba, threshold=BG_THRESHOLD):
    arr = np.array(frame_rgba)
    # Collapse to a 1-D row profile: 1 = foreground, 0 = background
    fg = (arr[:, :, :3].mean(axis=2) < threshold).astype(int)  # (H, W)
    # For each row find run-lengths of consecutive foreground pixels
    run_lengths = []
    for row in fg:
        in_run = False
        run = 0
        for v in row:
            if v:
                run += 1
                in_run = True
            else:
                if in_run and run > 0:
                    run_lengths.append(run)
                run = 0
                in_run = False
        if in_run and run > 0:
            run_lengths.append(run)
    if not run_lengths:
        return 1
    # The minimum run length that appears reasonably often is likely 1 art-pixel
    from collections import Counter
    counts = Counter(run_lengths)
    # Find the GCD of the most common run lengths as the pixel size
    from math import gcd
    from functools import reduce
    common = sorted(counts.keys())[:20]  # take the smallest 20 unique lengths
    g = reduce(gcd, common) if common else 1
    return max(1, g)

first_frame_raw = img.crop((0, 0, fw, fh))
pixel_size = estimate_pixel_size(first_frame_raw)
print(f'  detected pixel-art upscale: {pixel_size}× '
      f'(art resolution ≈ {fw//pixel_size}×{fh//pixel_size} per frame)')


# ── Background removal ────────────────────────────────────────────────────────
def remove_white_bg(frame_rgba):
    """
    Convert near-white pixels to transparent.
    Uses a soft gradient for anti-aliased edge pixels to avoid jagged halos.
    """
    arr = np.array(frame_rgba, dtype=np.float32)
    brightness = arr[:, :, :3].mean(axis=2)          # (H, W) mean of RGB
    # Pixels brighter than SOFT_LO get increasing transparency
    HARD = float(BG_THRESHOLD)
    SOFT_LO = HARD - 80.0                             # start fading at -80
    alpha = np.where(
        brightness >= HARD,
        0.0,
        np.where(
            brightness <= SOFT_LO,
            255.0,
            255.0 * (HARD - brightness) / (HARD - SOFT_LO)
        )
    )
    result = arr.copy()
    result[:, :, 3] = alpha
    return Image.fromarray(result.clip(0, 255).astype(np.uint8), 'RGBA')


# ── Per-frame processing ──────────────────────────────────────────────────────
def process_frame(row, col):
    idx = row * COLS + col
    x0, y0 = col * fw, row * fh
    frame = img.crop((x0, y0, x0 + fw, y0 + fh))
    frame = remove_white_bg(frame)

    bbox = frame.getbbox()
    if bbox is None:
        print(f'  WARNING: frame {idx} [{row},{col}] is entirely transparent — using blank')
        return Image.new('RGBA', (TARGET, TARGET), (0, 0, 0, 0))

    # Tight crop
    cropped = frame.crop(bbox)
    cw, ch = cropped.size
    print(f'  frame {idx} [{row},{col}]: bbox={bbox}  content={cw}×{ch}')

    # Scale to fit within TARGET×TARGET preserving aspect ratio
    scale = min(TARGET / cw, TARGET / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))

    # Use NEAREST for pixel art (keeps crisp edges); LANCZOS otherwise
    resample = Image.NEAREST if pixel_size > 1 else Image.LANCZOS
    scaled = cropped.resize((new_w, new_h), resample)
    print(f'    scaled to {new_w}×{new_h} (factor={scale:.3f}, filter='
          f'{"NEAREST" if pixel_size > 1 else "LANCZOS"})')

    # Centre on TARGET×TARGET transparent canvas
    out = Image.new('RGBA', (TARGET, TARGET), (0, 0, 0, 0))
    ox = (TARGET - new_w) // 2
    oy = (TARGET - new_h) // 2
    out.paste(scaled, (ox, oy), scaled)

    outpath = dst_dir / f'marine_frame_{idx}.png'
    out.save(outpath)
    print(f'    saved → {outpath}')
    return out


frames = []
for r in range(ROWS):
    for c in range(COLS):
        frames.append(process_frame(r, c))


# ── Combined horizontal spritesheet ──────────────────────────────────────────
sheet_w = TARGET * len(frames)
sheet = Image.new('RGBA', (sheet_w, TARGET), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(f, (i * TARGET, 0), f)

sheet_path = dst_dir / 'marine_sheet.png'
sheet.save(sheet_path)
print(f'\nSaved spritesheet ({sheet_w}×{TARGET}) → {sheet_path}')
print()
print('Frame order in sheet (left→right):')
print('  0 = South      (front-facing, toward viewer)')
print('  1 = South-East (turned right-forward)')
print('  2 = West       (gun pointing left)')
print('  3 = East       (gun pointing right)')
print()
print('Wire into BootScene with:')
print(f'  this.load.spritesheet("marine_leader", "src/graphics/marine_sheet.png", ')
print(f'    {{ frameWidth: {TARGET}, frameHeight: {TARGET} }})')
