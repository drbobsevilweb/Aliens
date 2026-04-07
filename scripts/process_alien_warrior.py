#!/usr/bin/env python3
"""
Process alienwarrior PNGs into a 128x128 spritesheet for the Aliens game.
Input:  images/alienwarrior/frame_NNNN_inspyrenet.png
Output: src/graphics/generated/alien_warrior_walk_strip_128.png
"""

import sys
from pathlib import Path
from PIL import Image
import glob

TARGET_SIZE = 128
SRC_DIR = Path('images/alienwarrior/walk_resized')
DST_PATH = Path('src/graphics/generated/alien_warrior_walk_strip_128.png')

def process():
    files = sorted(glob.glob(str(SRC_DIR / "frame_*_inspyrenet.png")))
    if not files:
        print(f"No files found in {SRC_DIR}")
        return

    print(f"Found {len(files)} frames.")
    
    # Use all frames for a smoother walk cycle as requested
    selected_files = files
    print(f"Selecting {len(selected_files)} frames.")

    frames = []
    for f in selected_files:
        img = Image.open(f).convert('RGBA')
        
        # Crop to content
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        
        # Scale to fit TARGET_SIZE while preserving aspect ratio
        w, h = img.size
        scale = min(TARGET_SIZE / w, TARGET_SIZE / h)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        
        img = img.resize((new_w, new_h), Image.LANCZOS)
        
        # Center on a 128x128 canvas
        canvas = Image.new('RGBA', (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
        ox = (TARGET_SIZE - new_w) // 2
        oy = (TARGET_SIZE - new_h) // 2
        canvas.paste(img, (ox, oy), img)
        frames.append(canvas)

    # Combine into a horizontal strip
    total_w = TARGET_SIZE * len(frames)
    strip = Image.new('RGBA', (total_w, TARGET_SIZE), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * TARGET_SIZE, 0), frame)

    DST_PATH.parent.mkdir(parents=True, exist_ok=True)
    strip.save(DST_PATH)
    print(f"Saved spritesheet to {DST_PATH} ({total_w}x{TARGET_SIZE})")

if __name__ == "__main__":
    process()
