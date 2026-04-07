#!/usr/bin/env python3
"""
Auto Pixel Sprite Maker for the Aliens project.
Generates stylized chibi/anime pixel sprites with an Aliens (1986) / Hadley's Hope-inspired palette.

Outputs:
- Marine sheets (leader + squad) in expected Phaser format (64x64, 4 frames: up/down/left/right)
- Core alien sprites (32x32)
- Hadley's Hope prop sprites (lamp, desk)
- Optional floor/wall tile variants (64x64)
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
GFX = ROOT / 'src' / 'graphics'
GEN = GFX / 'generated'
GEN.mkdir(parents=True, exist_ok=True)

MARINE_SCALE = 4  # 16x16 -> 64x64


def rgba(hexv, a=255):
    return ((hexv >> 16) & 255, (hexv >> 8) & 255, hexv & 255, a)


def new_canvas(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def pix(draw, x, y, c):
    draw.point((x, y), fill=c)


def rect(draw, x, y, w, h, c):
    draw.rectangle((x, y, x + w - 1, y + h - 1), fill=c)


def draw_chibi_marine(direction, role='tech', leader=False):
    # Cute anime/chibi marine with Aliens palette influence.
    palettes = {
        'leader': {
            'helm': 0x7bb4ff,
            'helm_dark': 0x456a96,
            'suit': 0x25313d,
            'visor': 0xc9ecff,
            'accent': 0xe9f8ff,
            'weapon': 0x72808d,
        },
        'tech': {
            'helm': 0x64c6ff,
            'helm_dark': 0x2e739a,
            'suit': 0x2a353f,
            'visor': 0xd2f4ff,
            'accent': 0xeefbff,
            'weapon': 0x748290,
        },
        'medic': {
            'helm': 0x72d7a1,
            'helm_dark': 0x3d7d61,
            'suit': 0x2a353c,
            'visor': 0xd9ffe8,
            'accent': 0xf2fff8,
            'weapon': 0x73828a,
        },
        'heavy': {
            'helm': 0xe2b06a,
            'helm_dark': 0x916236,
            'suit': 0x2b353e,
            'visor': 0xffe5bb,
            'accent': 0xfff2de,
            'weapon': 0x7d868f,
        },
    }
    key = 'leader' if leader else role
    p = palettes[key]

    base = new_canvas(16, 16)
    d = ImageDraw.Draw(base)

    # shadow
    rect(d, 5, 14, 6, 1, rgba(0x080b10, 120))

    # legs
    rect(d, 6, 11, 2, 3, rgba(0x1f2832))
    rect(d, 8, 11, 2, 3, rgba(0x23303b))
    rect(d, 6, 14, 2, 1, rgba(0x141a21))
    rect(d, 8, 14, 2, 1, rgba(0x141a21))

    # torso + shoulder bulk
    rect(d, 5, 7, 6, 5, rgba(p['helm_dark']))
    rect(d, 6, 8, 4, 3, rgba(p['helm']))
    rect(d, 4, 8, 1, 2, rgba(p['helm_dark']))
    rect(d, 11, 8, 1, 2, rgba(p['helm_dark']))

    # chest readout strip
    rect(d, 7, 9, 2, 1, rgba(p['accent']))

    # chibi head (big)
    rect(d, 5, 3, 6, 5, rgba(p['helm_dark']))
    rect(d, 6, 4, 4, 3, rgba(p['helm']))

    # visor changes by direction
    if direction == 'up':
        rect(d, 7, 4, 2, 1, rgba(p['visor']))
    elif direction == 'down':
        rect(d, 7, 5, 2, 1, rgba(p['visor']))
        rect(d, 6, 6, 4, 1, rgba(0xd6f2ff, 220))
    elif direction == 'left':
        rect(d, 6, 5, 2, 1, rgba(p['visor']))
        rect(d, 6, 6, 1, 1, rgba(0xeaf9ff, 230))
    else:  # right
        rect(d, 8, 5, 2, 1, rgba(p['visor']))
        rect(d, 9, 6, 1, 1, rgba(0xeaf9ff, 230))

    # backpack
    rect(d, 10, 8, 1, 3, rgba(0x18202a, 210))

    # rifle by direction
    gun = rgba(p['weapon'])
    gun_dark = rgba(0x4f5a64)
    if direction == 'up':
        rect(d, 10, 6, 3, 1, gun)
        rect(d, 12, 6, 1, 1, gun_dark)
    elif direction == 'down':
        rect(d, 10, 10, 3, 1, gun)
        rect(d, 12, 10, 1, 1, gun_dark)
    elif direction == 'left':
        rect(d, 2, 9, 3, 1, gun)
        rect(d, 2, 9, 1, 1, gun_dark)
    else:
        rect(d, 11, 9, 3, 1, gun)
        rect(d, 13, 9, 1, 1, gun_dark)

    # subtle outline accents
    rect(d, 5, 3, 1, 5, rgba(0x0c1116, 180))
    rect(d, 10, 3, 1, 5, rgba(0x0c1116, 180))

    # upscale + slight crisping
    out = base.resize((64, 64), Image.Resampling.NEAREST)
    out = out.filter(ImageFilter.UnsharpMask(radius=0.8, percent=80, threshold=2))
    return out


def save_marine_sheets():
    order = ['up', 'down', 'left', 'right']

    # shared squad sheet (tuned for tech role coloration as base)
    frames = [draw_chibi_marine(d, role='tech', leader=False) for d in order]
    sheet = new_canvas(64 * 4, 64)
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (64 * i, 0))
    sheet.save(GFX / 'marine_dirs_udlr_64_sheet.png')

    # team leader sheet
    tl_frames = [draw_chibi_marine(d, role='leader', leader=True) for d in order]
    tl_sheet = new_canvas(64 * 4, 64)
    for i, f in enumerate(tl_frames):
        tl_sheet.alpha_composite(f, (64 * i, 0))
    tl_sheet.save(GFX / 'tl_dirs_udlr_64_sheet.png')

    # debug exports
    for n, f in zip(order, frames):
        f.save(GFX / f'marine_{n}_64.png')
    for n, f in zip(order, tl_frames):
        f.save(GFX / f'tl_{n}_64.png')


def draw_alien(kind='warrior'):
    c = new_canvas(32, 32)
    d = ImageDraw.Draw(c)

    if kind == 'warrior':
        body = rgba(0x141a22)
        head = rgba(0x1f2731)
        acid = rgba(0x46cc7a, 210)
        rect(d, 8, 12, 10, 10, body)
        rect(d, 16, 8, 10, 5, head)
        rect(d, 6, 13, 2, 2, rgba(0x0f141b))
        rect(d, 6, 18, 3, 2, rgba(0x0f141b))
        rect(d, 18, 21, 4, 2, rgba(0x0e1218))
        rect(d, 23, 21, 3, 1, rgba(0x0e1218))
        rect(d, 23, 10, 2, 1, acid)
    elif kind == 'drone':
        rect(d, 9, 12, 9, 10, rgba(0x131922))
        rect(d, 16, 9, 11, 4, rgba(0x1d2430))
        rect(d, 7, 14, 2, 2, rgba(0x0e1319))
        rect(d, 7, 19, 2, 2, rgba(0x0e1319))
        rect(d, 22, 11, 2, 1, rgba(0x48c37c, 190))
    elif kind == 'facehugger':
        rect(d, 12, 14, 8, 4, rgba(0x2d3742))
        rect(d, 6, 12, 5, 1, rgba(0x1b232e))
        rect(d, 21, 12, 5, 1, rgba(0x1b232e))
        rect(d, 6, 19, 5, 1, rgba(0x1b232e))
        rect(d, 21, 19, 5, 1, rgba(0x1b232e))
        rect(d, 8, 18, 4, 1, rgba(0x1a222b))
    elif kind == 'egg':
        rect(d, 10, 10, 12, 14, rgba(0x4c3f2a))
        rect(d, 13, 8, 6, 3, rgba(0x5a4a32))
        rect(d, 14, 10, 4, 2, rgba(0x3ad269, 170))
    elif kind == 'queen_lesser':
        rect(d, 7, 11, 13, 12, rgba(0x161d27))
        rect(d, 16, 7, 13, 6, rgba(0x212b38))
        rect(d, 17, 5, 2, 2, rgba(0x2d3947))
        rect(d, 21, 5, 2, 2, rgba(0x2d3947))
        rect(d, 24, 9, 2, 1, rgba(0x52d987, 190))
    elif kind == 'queen':
        rect(d, 6, 10, 14, 14, rgba(0x151b23))
        rect(d, 15, 6, 14, 8, rgba(0x222c3b))
        rect(d, 16, 4, 2, 2, rgba(0x314155))
        rect(d, 20, 3, 2, 2, rgba(0x314155))
        rect(d, 24, 4, 2, 2, rgba(0x314155))
        rect(d, 25, 9, 2, 2, rgba(0x63e59e, 210))
    elif kind == 'runner':
        rect(d, 10, 12, 8, 10, rgba(0x121821))
        rect(d, 16, 9, 10, 4, rgba(0x1d2531))
        rect(d, 22, 10, 2, 1, rgba(0x3fbe74, 180))
    elif kind == 'spitter':
        rect(d, 9, 12, 9, 10, rgba(0x15202a))
        rect(d, 16, 8, 11, 5, rgba(0x243042))
        rect(d, 22, 10, 3, 2, rgba(0x59dd8f, 210))
    else:
        rect(d, 9, 12, 10, 10, rgba(0x181f2a))

    # soften with tiny outline and upscale-friendly crisp
    d.rectangle((8, 8, 24, 24), outline=rgba(0x89d6ff, 90))
    return c


def save_aliens():
    keys = ['warrior', 'drone', 'facehugger', 'egg', 'queen_lesser', 'queen', 'runner', 'spitter']
    for k in keys:
        img = draw_alien(k)
        img.save(GEN / f'alien_{k}.png')


def save_props_and_tiles():
    # desk
    desk = new_canvas(128, 64)
    d = ImageDraw.Draw(desk)
    d.rounded_rectangle((3, 8, 124, 56), radius=8, fill=rgba(0x2b333d), outline=rgba(0x5d6c7b, 230), width=2)
    d.rectangle((11, 16, 116, 47), fill=rgba(0x3a4552))
    d.rectangle((20, 21, 107, 24), fill=rgba(0x99bdd2, 90))
    d.rectangle((18, 44, 32, 52), fill=rgba(0x1a2129, 220))
    d.rectangle((95, 44, 109, 52), fill=rgba(0x1a2129, 220))
    desk.save(GEN / 'prop_desk.png')

    # lamp
    lamp = new_canvas(64, 64)
    dl = ImageDraw.Draw(lamp)
    dl.ellipse((4, 4, 60, 60), fill=rgba(0x9fcbef, 16))
    dl.ellipse((12, 12, 52, 52), fill=rgba(0xb7ddff, 28))
    dl.ellipse((20, 20, 44, 44), fill=rgba(0x1d2b38, 235))
    dl.ellipse((24, 24, 40, 40), fill=rgba(0x5f8eb8, 230))
    dl.ellipse((28, 28, 36, 36), fill=rgba(0xd9eeff, 245))
    lamp.save(GEN / 'prop_lamp.png')

    # hadley's hope mood tiles (supplementary)
    floor = new_canvas(64, 64)
    df = ImageDraw.Draw(floor)
    df.rectangle((0, 0, 63, 63), fill=rgba(0x202e3a))
    for y in range(6, 62, 8):
        df.rectangle((0, y, 63, y), fill=rgba(0x111821, 170))
        df.rectangle((0, y + 1, 63, y + 1), fill=rgba(0x75a9d0, 90))
    for x in range(0, 64, 5):
        df.rectangle((x, 0, x, 63), fill=rgba(0x6d7b89, 85))
    floor = floor.filter(ImageFilter.UnsharpMask(radius=1.0, percent=120, threshold=2))
    floor.save(GEN / 'tile_floor_hadleys_64.png')
    floor.save(GEN / 'tile_floor_hadleys_a_64.png')

    floor_b = floor.copy()
    db = ImageDraw.Draw(floor_b)
    for y in range(4, 64, 10):
        db.rectangle((0, y, 63, y), fill=rgba(0x89b6d8, 70))
    floor_b = floor_b.filter(ImageFilter.UnsharpMask(radius=0.9, percent=105, threshold=2))
    floor_b.save(GEN / 'tile_floor_hadleys_b_64.png')

    floor_c = floor.copy()
    dc = ImageDraw.Draw(floor_c)
    for x in range(2, 64, 8):
        dc.rectangle((x, 0, x, 63), fill=rgba(0x5e768c, 95))
    dc.rectangle((0, 0, 63, 63), outline=rgba(0x95bedf, 80))
    floor_c = floor_c.filter(ImageFilter.UnsharpMask(radius=1.1, percent=110, threshold=2))
    floor_c.save(GEN / 'tile_floor_hadleys_c_64.png')

    wall = new_canvas(64, 64)
    dw = ImageDraw.Draw(wall)
    dw.rectangle((0, 0, 63, 63), fill=rgba(0x192330))
    dw.rectangle((8, 7, 56, 57), fill=rgba(0x0e141c))
    dw.rectangle((10, 9, 54, 55), fill=rgba(0x111a24))
    for y in (16, 24, 32, 40, 48):
        dw.rectangle((10, y, 54, y), fill=rgba(0x2a3a49, 70))
    dw.rectangle((3, 56, 60, 58), fill=rgba(0x6f95b1, 155))
    # darkness gradient from top
    grad = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for i in range(64):
        a = int(max(0, 180 - i * 2.6))
        gd.rectangle((0, i, 63, i), fill=(0, 0, 0, a))
    wall.alpha_composite(grad)
    wall = wall.filter(ImageFilter.UnsharpMask(radius=1.0, percent=110, threshold=2))
    wall.save(GEN / 'tile_wall_hadleys_64.png')
    wall.save(GEN / 'tile_wall_hadleys_a_64.png')

    wall_b = wall.copy()
    wb = ImageDraw.Draw(wall_b)
    for y in (14, 22, 30, 38, 46, 54):
        wb.rectangle((9, y, 55, y), fill=rgba(0x4d6780, 65))
    wb.rectangle((2, 55, 61, 58), fill=rgba(0x85a8c0, 145))
    wall_b = wall_b.filter(ImageFilter.UnsharpMask(radius=0.95, percent=102, threshold=2))
    wall_b.save(GEN / 'tile_wall_hadleys_b_64.png')


def main():
    save_marine_sheets()
    save_aliens()
    save_props_and_tiles()
    print('Generated assets:')
    for p in sorted(GEN.glob('*.png')):
        print('-', p.relative_to(ROOT))
    print('- src/graphics/marine_dirs_udlr_64_sheet.png')
    print('- src/graphics/tl_dirs_udlr_64_sheet.png')


if __name__ == '__main__':
    main()
