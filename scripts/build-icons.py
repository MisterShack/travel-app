#!/usr/bin/env python3
"""Generates the PWA icons referenced by app/vite.config.ts's manifest.

Pure stdlib (zlib + struct) so there is no image-library dependency for three
flat-colour marks. Run: python3 scripts/build-icons.py
"""
import math, pathlib, struct, zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

BG = (0x12, 0x13, 0x1A)
FG = (0x7D, 0x9B, 0xFF)


def png(path, size, safe):
    """A rising flight path: a thick diagonal with a disc at its head.

    `safe` shrinks the mark into the middle so a maskable icon survives being
    cropped to a circle by the launcher.
    """
    cx, cy = size / 2, size / 2
    span = size * safe

    # Line runs lower-left to upper-right through the centre.
    x0, y0 = cx - span / 2, cy + span / 2
    x1, y1 = cx + span / 2 * 0.72, cy - span / 2 * 0.72
    half = size * 0.055           # half the stroke width
    head_r = size * 0.135         # disc at the head of the path

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0 for this scanline
        for x in range(size):
            px, py = x + 0.5, y + 0.5

            # Distance from the point to the line segment.
            dx, dy = x1 - x0, y1 - y0
            t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)))
            lx, ly = x0 + t * dx, y0 + t * dy
            on_line = math.hypot(px - lx, py - ly) <= half

            on_head = math.hypot(px - x1, py - y1) <= head_r

            rows.extend(FG if (on_line or on_head) else BG)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)  # 8-bit truecolour
    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))
    path.write_bytes(blob)
    return len(blob)


for name, size, safe in [
    ('icon-192.png', 192, 0.72),
    ('icon-512.png', 512, 0.72),
    # Maskable icons get cropped to a circle by some launchers, so the mark sits
    # inside the middle 60% and the background bleeds to the edge.
    ('icon-maskable-512.png', 512, 0.52),
]:
    n = png(OUT / name, size, safe)
    print(f'  {name}  {size}x{size}  {n/1024:.1f} KB')
