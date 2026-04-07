#!/usr/bin/env python3
"""
Extract tiles from Alien_Breed_Tileset.png and build a 20-tile atlas strip
compatible with the game's autotile system.

Atlas layout (each tile 64x64, total 1280x64):
  Index 0:  Floor base
  Index 1:  Wall fallback (fully surrounded)
  Index 2:  Floor variant A
  Index 3:  Floor variant B
  Indices 4-19: Wall autotile variants (4-bit NESW bitmask)

NESW bitmask encoding:
  bit 0 (1) = North neighbor is wall
  bit 1 (2) = East neighbor is wall
  bit 2 (4) = South neighbor is wall
  bit 3 (8) = West neighbor is wall
"""

from PIL import Image, ImageDraw
import os

TILE = 32       # Source tile size
OUT_TILE = 64   # Output tile size (2x upscale)
ATLAS_COUNT = 20

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SRC_PATH = os.path.join(PROJECT_DIR, 'src/graphics/imported/Alien_Breed_Tileset.png')
OUT_PATH = os.path.join(PROJECT_DIR, 'src/graphics/imported/alien_breed_atlas_64.png')


def get_tile(img, col, row):
    """Extract a 32x32 tile from the source tileset."""
    return img.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE))


def upscale(tile):
    """Upscale a 32x32 tile to 64x64 using nearest-neighbor."""
    return tile.resize((OUT_TILE, OUT_TILE), Image.NEAREST)


def build_wall_autotile(img, bitmask):
    """
    Build a wall autotile variant for the given NESW bitmask.

    The Alien Breed tileset has wall pieces that show 3/4 perspective:
    - Exposed south edges show a visible front wall face
    - Exposed north/east/west edges show structural edges
    - Connected sides are seamless dark continuation

    We composite edge/corner pieces from the tileset onto a dark base.
    """
    has_n = (bitmask & 1) != 0
    has_e = (bitmask & 2) != 0
    has_s = (bitmask & 4) != 0
    has_w = (bitmask & 8) != 0

    # Start with dark wall interior base, shifted to blue
    # Use tile (1,11) - dark charcoal interior
    base = shift_to_blue(get_tile(img, 1, 11).copy())

    # Now we need to draw wall edges for exposed sides.
    # The Alien Breed tileset wall tiles show the wall structure as grey/beige
    # elements on the tile edges. We'll extract edge strips and corner pieces.

    # For compositing, we'll use the room structure tiles that have clear
    # wall edges. We extract thin strips from these tiles.

    draw = ImageDraw.Draw(base)

    # Wall face colors — blue-steel palette
    wall_light = (128, 152, 176)    # Steel blue highlight
    wall_mid = (80, 104, 120)       # Blue-gray mid tone
    wall_dark = (48, 62, 80)        # Dark blue-gray edge
    wall_shadow = (16, 24, 38)      # Deep blue-black shadow
    wall_highlight = (152, 176, 200)  # Blue-steel highlight

    EDGE_W = 8  # Width of wall edge in pixels (at 32x32)
    FACE_H = 12  # Height of south-facing wall face

    # ── South edge (exposed = no south neighbor) ──
    # This is the main 3/4 view wall face - the most visible feature
    if not has_s:
        y_start = TILE - FACE_H
        # Wall top surface (viewed from above)
        draw.rectangle([0, y_start, TILE-1, y_start + 2], fill=wall_highlight)
        # Wall front face (the 3/4 view visible face)
        draw.rectangle([0, y_start + 3, TILE-1, y_start + 7], fill=wall_mid)
        # Panel lines on face
        draw.line([(0, y_start + 5), (TILE-1, y_start + 5)], fill=wall_dark, width=1)
        # Bottom shadow/lip
        draw.rectangle([0, y_start + 8, TILE-1, TILE-1], fill=wall_shadow)
        draw.line([(0, y_start + 8), (TILE-1, y_start + 8)], fill=wall_dark, width=1)
        # Rivet details
        for x in range(4, TILE-2, 8):
            draw.rectangle([x, y_start + 4, x+1, y_start + 5], fill=wall_light)

    # ── North edge (exposed = no north neighbor) ──
    if not has_n:
        # Flat top edge (looking down at wall top)
        draw.rectangle([0, 0, TILE-1, 1], fill=wall_shadow)
        draw.rectangle([0, 2, TILE-1, EDGE_W-1], fill=wall_dark)
        draw.line([(0, 3), (TILE-1, 3)], fill=wall_mid, width=1)
        # Subtle panel lines
        draw.line([(0, 5), (TILE-1, 5)], fill=(30, 40, 54), width=1)

    # ── West edge (exposed = no west neighbor) ──
    if not has_w:
        draw.rectangle([0, 0, 1, TILE-1], fill=wall_shadow)
        draw.rectangle([2, 0, EDGE_W-1, TILE-1], fill=wall_dark)
        draw.line([(3, 0), (3, TILE-1)], fill=wall_mid, width=1)
        draw.line([(5, 0), (5, TILE-1)], fill=(30, 40, 54), width=1)

    # ── East edge (exposed = no east neighbor) ──
    if not has_e:
        draw.rectangle([TILE-2, 0, TILE-1, TILE-1], fill=wall_shadow)
        draw.rectangle([TILE-EDGE_W, 0, TILE-3, TILE-1], fill=wall_dark)
        draw.line([(TILE-4, 0), (TILE-4, TILE-1)], fill=wall_mid, width=1)
        draw.line([(TILE-6, 0), (TILE-6, TILE-1)], fill=(30, 40, 54), width=1)

    # ── Corner reinforcements ──
    # Outer corners (convex - two exposed sides meet)
    if not has_n and not has_w:
        draw.rectangle([0, 0, EDGE_W, EDGE_W], fill=wall_mid)
        draw.rectangle([0, 0, 2, 2], fill=wall_highlight)
        draw.rectangle([1, 1, EDGE_W-1, EDGE_W-1], fill=wall_dark)
    if not has_n and not has_e:
        draw.rectangle([TILE-EDGE_W-1, 0, TILE-1, EDGE_W], fill=wall_mid)
        draw.rectangle([TILE-3, 0, TILE-1, 2], fill=wall_highlight)
        draw.rectangle([TILE-EDGE_W, 1, TILE-2, EDGE_W-1], fill=wall_dark)
    if not has_s and not has_w:
        y_start = TILE - FACE_H
        draw.rectangle([0, y_start, EDGE_W, TILE-1], fill=wall_mid)
        draw.rectangle([1, y_start+1, EDGE_W-1, TILE-2], fill=wall_dark)
        draw.rectangle([0, y_start, 2, y_start+2], fill=wall_highlight)
    if not has_s and not has_e:
        y_start = TILE - FACE_H
        draw.rectangle([TILE-EDGE_W-1, y_start, TILE-1, TILE-1], fill=wall_mid)
        draw.rectangle([TILE-EDGE_W, y_start+1, TILE-2, TILE-2], fill=wall_dark)
        draw.rectangle([TILE-3, y_start, TILE-1, y_start+2], fill=wall_highlight)

    # Inner corner darkening (concave - two connected sides meet)
    if has_n and has_w:
        draw.rectangle([0, 0, 3, 3], fill=(10, 16, 26))
    if has_n and has_e:
        draw.rectangle([TILE-4, 0, TILE-1, 3], fill=(10, 16, 26))
    if has_s and has_w:
        draw.rectangle([0, TILE-4, 3, TILE-1], fill=(10, 16, 26))
    if has_s and has_e:
        draw.rectangle([TILE-4, TILE-4, TILE-1, TILE-1], fill=(10, 16, 26))

    return base


def shift_to_blue(tile, brighten=0):
    """Shift a tile's warm tones to blue-steel palette.
    brighten: extra luminance offset (0-40) for lighter tiles like floors."""
    pixels = tile.load()
    w, h = tile.size
    b_off = max(0, int(brighten))
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Convert to luminance
            lum = int(0.299 * r + 0.587 * g + 0.114 * b) + b_off
            # Tint towards blue-steel: mix luminance with blue bias
            nr = int(lum * 0.58 + 10)
            ng = int(lum * 0.72 + 16)
            nb = int(lum * 0.86 + 26)
            pixels[x, y] = (min(nr, 255), min(ng, 255), min(nb, 255), a)
    return tile


def build_atlas():
    """Build the 20-tile atlas strip from the Alien Breed tileset."""
    img = Image.open(SRC_PATH).convert('RGBA')

    # Output: 20 tiles in a row, each 64x64
    atlas = Image.new('RGBA', (ATLAS_COUNT * OUT_TILE, OUT_TILE), (0, 0, 0, 255))

    # ── Index 0: Floor base ──
    # Use tile (12,12) - clean floor with grid pattern, shifted to blue
    # Brighten floors so they're clearly distinct from dark wall interiors
    floor_base = shift_to_blue(get_tile(img, 12, 12), brighten=18)
    atlas.paste(upscale(floor_base), (0 * OUT_TILE, 0))

    # ── Index 1: Wall fallback (fully surrounded, bitmask=15) ──
    wall_surrounded = shift_to_blue(get_tile(img, 1, 11))  # Dark interior
    atlas.paste(upscale(wall_surrounded), (1 * OUT_TILE, 0))

    # ── Index 2: Floor variant A ──
    floor_a = shift_to_blue(get_tile(img, 13, 12), brighten=18)
    atlas.paste(upscale(floor_a), (2 * OUT_TILE, 0))

    # ── Index 3: Floor variant B ──
    floor_b = shift_to_blue(get_tile(img, 14, 12), brighten=18)
    atlas.paste(upscale(floor_b), (3 * OUT_TILE, 0))

    # ── Indices 4-19: Wall autotile variants ──
    for bitmask in range(16):
        tile_index = 4 + bitmask
        wall_tile = build_wall_autotile(img, bitmask)
        atlas.paste(upscale(wall_tile), (tile_index * OUT_TILE, 0))

    atlas.save(OUT_PATH)
    print(f"Saved atlas: {OUT_PATH}")
    print(f"  Size: {atlas.size[0]}x{atlas.size[1]}")
    print(f"  Tiles: {ATLAS_COUNT} ({ATLAS_COUNT} x {OUT_TILE}px)")

    # Also save a preview at 2x for easy inspection
    preview = atlas.resize((atlas.width * 2, atlas.height * 2), Image.NEAREST)
    preview_path = os.path.join(PROJECT_DIR, 'tmp/atlas_preview.png')
    os.makedirs(os.path.dirname(preview_path), exist_ok=True)
    preview.save(preview_path)
    print(f"  Preview: {preview_path}")


if __name__ == '__main__':
    build_atlas()
