#!/usr/bin/env python3
"""Generates Waypoint's app icons from the chart-waypoint mark.

Pure stdlib (zlib + struct): three flat-colour marks do not justify an image
dependency. Run: python3 scripts/build-icons.py

The mark is BRAND.md §9 — an aeronautical waypoint triangle with the point at
its centroid, in accent on ink.
"""
import math, pathlib, struct, zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

BG = (0x10, 0x12, 0x16)      # --paper, dark
FG = (0xF0, 0xA0, 0x3C)      # --accent, dark


def inside_triangle(px, py, pts):
    def sign(a, b, c):
        return (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1])
    d1, d2, d3 = (sign((px, py), pts[i], pts[(i + 1) % 3]) for i in range(3))
    has_neg = min(d1, d2, d3) < 0
    has_pos = max(d1, d2, d3) > 0
    return not (has_neg and has_pos)


def png(path, size, safe):
    """`safe` shrinks the mark so a maskable icon survives a circular crop."""
    cx = cy = size / 2
    r = size * safe / 2
    # Equilateral triangle, flat side down, centred.
    outer = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
             for a in (-90, 30, 150)]
    stroke = size * 0.085
    inner_r = r - stroke * 1.9
    inner = [(cx + inner_r * math.cos(math.radians(a)), cy + inner_r * math.sin(math.radians(a)))
             for a in (-90, 30, 150)]
    # The point itself. Sized and placed so it stays clear of the inner edge of
    # the base stroke — at the first attempt it overlapped, and the mark read as
    # a filled blob rather than a triangle containing a point.
    dot_y = cy + size * 0.018
    dot_r = size * 0.058

    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            on_ring = inside_triangle(px, py, outer) and not inside_triangle(px, py, inner)
            on_dot = math.hypot(px - cx, py - dot_y) <= dot_r
            rows.extend(FG if (on_ring or on_dot) else BG)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))
    path.write_bytes(blob)
    return len(blob)


for name, size, safe in [
    ('icon-192.png', 192, 0.74),
    ('icon-512.png', 512, 0.74),
    ('icon-maskable-512.png', 512, 0.54),
]:
    n = png(OUT / name, size, safe)
    print(f'  {name}  {size}x{size}  {n / 1024:.1f} KB')
