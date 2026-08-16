#!/usr/bin/env python3
"""Generates Waypoint's app icons. Run: python3 scripts/build-icons.py

Waypoint has no pictorial mark (BRAND.md §9). The previous one — an outlined
triangle with a dot at the centroid, which is how a named waypoint is drawn on
an aeronautical chart — read at a glance as a **hazard sign**, because an amber
outlined triangle with something in the middle is the most over-learned warning
shape there is. Provenance does not survive the 200ms a person gives a home
screen.

So the icon is the letter, drawn as a stroked polyline: five points, four
segments, round caps and joins. A letter cannot be mistaken for a symbol, which
is the entire point of choosing one. It is a placeholder with a clear
conscience, not a design.

Pure stdlib (zlib + struct): one flat-colour glyph does not justify an image
dependency. Anti-aliased by supersampling, because a diagonal stroke without it
is a staircase at 192px.
"""
import pathlib, struct, zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

BG = (0x10, 0x12, 0x16)      # --paper, dark
FG = (0xF0, 0xA0, 0x3C)      # --accent, dark

SS = 3                        # supersampling factor per axis

# The W in a unit box, y downward. The middle vertex stops short of the baseline
# so the letter reads as a W rather than as two adjacent Vs.
POINTS = [(0.00, 0.00), (0.27, 1.00), (0.50, 0.40), (0.73, 1.00), (1.00, 0.00)]
STROKE = 0.165                # of the box width
ASPECT = 0.80                 # box height as a fraction of its width


def distance_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def png(path, size, safe):
    """`safe` is the fraction of the canvas the glyph may occupy.

    Maskable icons are cropped to a circle by some launchers, so they get a much
    smaller value — the glyph has to survive losing its corners.
    """
    box_w = size * safe
    box_h = box_w * ASPECT
    ox = (size - box_w) / 2
    oy = (size - box_h) / 2
    half = STROKE * box_w / 2
    # Scaled into canvas coordinates once, rather than per pixel.
    pts = [(ox + x * box_w, oy + y * box_h) for x, y in POINTS]
    segments = list(zip(pts, pts[1:]))

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter byte: none
        for x in range(size):
            hits = 0
            for sy in range(SS):
                py = y + (sy + 0.5) / SS
                for sx in range(SS):
                    px = x + (sx + 0.5) / SS
                    for (ax, ay), (bx, by) in segments:
                        if distance_to_segment(px, py, ax, ay, bx, by) <= half:
                            hits += 1
                            break
            a = hits / (SS * SS)
            rows.extend(round(bg + (fg - bg) * a) for bg, fg in zip(BG, FG))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))
    path.write_bytes(blob)
    return len(blob)


for name, size, safe in [
    ('icon-192.png', 192, 0.62),
    ('icon-512.png', 512, 0.62),
    ('icon-maskable-512.png', 512, 0.44),
]:
    n = png(OUT / name, size, safe)
    print(f'  {name}  {size}x{size}  {n / 1024:.1f} KB')
