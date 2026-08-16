#!/usr/bin/env python3
"""Checks BRAND.md's palette against WCAG contrast minimums, in both themes.

A palette that has to be exempted to pass is the wrong palette (BRAND.md §10),
so this runs as a gate rather than a report. Exits non-zero on any failure.

Usage: python3 scripts/check-contrast.py
"""
import sys

LIGHT = {
    "ink": "#16181d", "ink-soft": "#5a6473", "paper": "#faf9f7",
    "surface": "#ffffff", "surface-sunk": "#f1efec", "rule": "#dcd8d2",
    "field": "#8f887c",
    "kind-flight": "#2c5c8a", "kind-lodging": "#2f6b4f", "kind-activity": "#6b4a8a",
    "accent": "#b45309", "accent-ink": "#ffffff",
    "warn": "#a8500a", "alert": "#a4232c", "focus": "#b45309",
}
DARK = {
    "ink": "#eceef2", "ink-soft": "#98a2b3", "paper": "#101216",
    "surface": "#191c22", "surface-sunk": "#22262e", "rule": "#2c313a",
    "field": "#6b7280",
    "kind-flight": "#7fb3e0", "kind-lodging": "#7fc9a3", "kind-activity": "#bda1e0",
    "accent": "#f0a03c", "accent-ink": "#1a1204",
    "warn": "#f5b25e", "alert": "#ff8a8a", "focus": "#f0a03c",
}

# (foreground, background, minimum, what it is)
PAIRS = [
    ("ink", "paper", 4.5, "body text on the page"),
    ("ink", "surface", 4.5, "body text on a card"),
    ("ink-soft", "paper", 4.5, "secondary text on the page"),
    ("ink-soft", "surface", 4.5, "secondary text on a card"),
    ("ink-soft", "surface-sunk", 4.5, "badge text"),
    ("accent", "paper", 4.5, "link on the page"),
    ("accent", "surface", 4.5, "link on a card"),
    ("accent-ink", "accent", 4.5, "text on the primary button"),
    ("warn", "surface", 4.5, "warning text"),
    ("alert", "surface", 4.5, "error text"),
    # `--rule` is decorative: a card is already distinguished from the page by
    # its surface colour, so the border is not the only indicator of anything
    # and WCAG 1.4.11 does not apply to it. `--field` is the border of an input,
    # which IS the only thing showing where the control begins and ends, so it
    # is held to 3:1. One token was doing both jobs; that was the bug, and
    # darkening every hairline to satisfy a rule that does not apply would have
    # made a calm layout look heavy for nothing.
    ("field", "surface", 3.0, "input border on a card"),
    ("field", "paper", 3.0, "input border on the page"),
    ("focus", "paper", 3.0, "focus ring on the page"),
    ("focus", "surface", 3.0, "focus ring on a card"),
    ("accent", "surface-sunk", 3.0, "accent on an inset area"),
    # Kind hues mark small non-text elements, so 3:1 is the bar that applies.
    ("kind-flight", "surface", 3.0, "flight marker"),
    ("kind-lodging", "surface", 3.0, "stay marker"),
    ("kind-activity", "surface", 3.0, "activity marker"),
]


def luminance(hex_colour):
    r, g, b = (int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    def channel(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = channel(r), channel(g), channel(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


failed = 0
for theme_name, theme in (("light", LIGHT), ("dark", DARK)):
    print(f"\n{theme_name}")
    for fg, bg, need, label in PAIRS:
        got = ratio(theme[fg], theme[bg])
        ok = got >= need
        if not ok:
            failed += 1
        print(f"  {'ok  ' if ok else 'FAIL'}  {got:5.2f}:1  (needs {need})  {label}"
              f"  [{fg} on {bg}]")

print()
if failed:
    print(f"{failed} pair(s) below the minimum — fix the token, do not exempt the check.")
    sys.exit(1)
print("All pairs pass in both themes.")
