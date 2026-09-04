#!/usr/bin/env python3
"""Render the TableX ghost to icon.ico (app icon) and TableX/favicon.ico.

    python tools/build_icon.py

The sprite is the SAME 14x14 grid the loader draws in CSS
(`.gh-body` in TableX/css/main.css), transcribed here rather than
screenshotted, so the icon is pixel-exact and regenerating it can never drift
into a blurry resample of a browser capture.

Every emitted size is an exact integer multiple of the 14x14 grid, centred with
transparent padding (16 -> 1px cells + 1px pad, 32 -> 2px + 2px, ...). That
keeps the pixel art crisp at every size instead of nearest-neighbouring 14 into
16 and smearing every edge.

The skirt is frozen in the `flicker1` phase -- the same frame the loader pins
under prefers-reduced-motion -- so the icon matches what a user sees when the
animation is off.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow required: python -m pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MINT = (12, 140, 94, 255)      # --mint  #0c8c5e
FACE = (255, 255, 255, 255)    # --paper #ffffff
CLEAR = (0, 0, 0, 0)

N = 14                          # the grid is 14x14 cells

# Only sizes where size//14 lands on a clean cell size that fills the canvas.
# 24 is deliberately absent: 24//14 == 1, so the sprite would occupy 14 of 24
# pixels (58%) against 87-98% everywhere else, and the icon would visibly
# shrink at that one size. Windows downscales 32 for those slots instead.
SIZES = [16, 32, 48, 64, 128, 256]

# ── body, as (row, col_from, col_to) inclusive 1-based spans ──────────────
# Mirrors grid-template-areas: top0 / top1 / top2 / top3 (rows 4-6) / top4.
BODY = [
    (1,  6,  9),
    (2,  4, 11),
    (3,  3, 12),
    (4,  2, 13), (5, 2, 13), (6, 2, 13),
    (7,  1, 14), (8, 1, 14), (9, 1, 14),
    (10, 1, 14), (11, 1, 14), (12, 1, 14),
]

# ── skirt, flicker1 phase ────────────────────────────────────────────────
# Row 13: st0 st0 an4 st1 an7 st2 an10 an10 st3 an13 st4 an16 st5 st5
#         static st* always filled; an4/an10/an16 are f1 (filled),
#         an7/an13 are f0 (empty in this phase).
# Row 14: an1 an2 an3 an5 an6 an8 an9 an9 an11 an12 an14 an15 an17 an18
#         f1 -> an2 an3 an5 an9 an14 an15 an17 ; the rest f0.
# an14 (row 14, col 11) is f1 by symmetry with an5 (col 4) -- the upstream
# Uiverse component left it in no group at all, which is why its skirt has a
# permanent notch there. See CLAUDE.md.
SKIRT = {
    13: [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14],
    14: [2, 3, 4, 7, 8, 11, 12, 13],
}

# ── face, white, punched over the body ───────────────────────────────────
# From the absolute px in CSS at 10px a cell: pupils 20x20 at (30,50) and
# (90,50); the mouth zigzag alternating between rows 10 and 11.
FACE_CELLS = []
for r in (6, 7):                                   # pupils
    FACE_CELLS += [(r, 4), (r, 5), (r, 10), (r, 11)]
FACE_CELLS += [(11, 2)]                            # mouthstart
FACE_CELLS += [(10, 3), (10, 4)]                   # mouth1
FACE_CELLS += [(11, 5), (11, 6)]                   # mouth2
FACE_CELLS += [(10, 7), (10, 8)]                   # mouth3
FACE_CELLS += [(11, 9), (11, 10)]                  # mouth4
FACE_CELLS += [(10, 11), (10, 12)]                 # mouth5
FACE_CELLS += [(11, 13)]                           # mouthend


def build_grid():
    """14x14 grid of RGBA tuples."""
    g = [[CLEAR] * N for _ in range(N)]
    for row, c0, c1 in BODY:
        for c in range(c0, c1 + 1):
            g[row - 1][c - 1] = MINT
    for row, cols in SKIRT.items():
        for c in cols:
            g[row - 1][c - 1] = MINT
    for row, col in FACE_CELLS:
        if g[row - 1][col - 1] != MINT:
            raise SystemExit('face cell (%d,%d) is not on the body' % (row, col))
        g[row - 1][col - 1] = FACE
    return g


def render(grid, size):
    """Nearest-neighbour at an exact integer cell size, centred."""
    cell = max(1, size // N)
    span = cell * N
    off = (size - span) // 2
    img = Image.new('RGBA', (size, size), CLEAR)
    px = img.load()
    for r in range(N):
        for c in range(N):
            col = grid[r][c]
            if col == CLEAR:
                continue
            for y in range(cell):
                for x in range(cell):
                    px[off + c * cell + x, off + r * cell + y] = col
    return img


def runs(grid):
    """Collapse each row into horizontal runs of one colour -> (r, c0, len, col).
    Emitting one <rect> per cell would be ~120 rects; runs cut that to ~30."""
    out = []
    for r in range(N):
        c = 0
        while c < N:
            col = grid[r][c]
            if col == CLEAR:
                c += 1
                continue
            c1 = c
            while c1 + 1 < N and grid[r][c1 + 1] == col:
                c1 += 1
            out.append((r, c, c1 - c + 1, col))
            c = c1 + 1
    return out


def emit_svg(grid, body_fill, face_fill):
    """Inline-able SVG on a 0 0 14 14 viewBox."""
    parts = []
    for r, c, w, col in runs(grid):
        fill = body_fill if col == MINT else face_fill
        parts.append('<rect x="%d" y="%d" width="%d" height="1" fill="%s"/>'
                     % (c, r, w, fill))
    return ('<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" '
            'shape-rendering="crispEdges">\n  %s\n</svg>\n'
            % '\n  '.join(parts))


def main():
    grid = build_grid()
    frames = [render(grid, s) for s in SIZES]

    # These paths are split ON PURPOSE -- do not "tidy" them into one folder:
    #   repo root -> icon.ico / icon-256.png, where an Electron build expects
    #                them (same convention as Interfex). Moving these breaks
    #                the build, which is why they were moved back on 2026-09-04.
    #   TableX/   -> favicon.ico, which MUST sit under the web root to be served
    #                at all; anything above TableX/ is never reachable by HTTP.
    targets = [
        os.path.join(ROOT, 'icon.ico'),                 # Electron build icon
        os.path.join(ROOT, 'TableX', 'favicon.ico'),    # browser tab
    ]
    for path in targets:
        # append_images is load-bearing. Saving ONLY the 256px frame and
        # listing `sizes` makes Pillow LANCZOS-resample it down to each size,
        # which turns 2 alpha values into ~50 and smears every pixel edge --
        # exactly what rendering each size separately is meant to prevent.
        # Handing it the pre-rendered frames makes it use them verbatim.
        # Save from the LARGEST frame: Pillow's ICO writer skips any requested
        # size bigger than the base image, so basing this on frames[0] (16px)
        # silently emits a one-frame icon.
        frames[-1].save(path, format='ICO',
                        sizes=[(s, s) for s in SIZES],
                        append_images=frames[:-1])
        print('%-42s %6d B' % (path, os.path.getsize(path)))

    preview = os.path.join(ROOT, 'icon-256.png')     # non-Windows build targets
    frames[-1].save(preview)
    print('%-42s %6d B' % (preview, os.path.getsize(preview)))

    # Standalone SVG (fixed colours) + the inline snippet the nav mark uses,
    # which takes currentColor so CSS owns the brand colour in one place.
    svg_dir = os.path.join(ROOT, 'TableX', 'img')
    os.makedirs(svg_dir, exist_ok=True)
    svg_path = os.path.join(svg_dir, 'ghost.svg')
    with open(svg_path, 'w', encoding='utf8') as fh:
        fh.write(emit_svg(grid, '#0c8c5e', '#ffffff'))
    print('%-42s %6d B' % (svg_path, os.path.getsize(svg_path)))

    inline = os.path.join(HERE, '_ghost-inline.svg.txt')
    with open(inline, 'w', encoding='utf8') as fh:
        fh.write(emit_svg(grid, 'currentColor', 'var(--paper)'))
    print('%-42s %6d B  (paste into index.html)' % (inline, os.path.getsize(inline)))
    print('sizes: %s   cells: %s' % (
        ', '.join(str(s) for s in SIZES),
        ', '.join('%dpx' % max(1, s // N) for s in SIZES)))


if __name__ == '__main__':
    main()
