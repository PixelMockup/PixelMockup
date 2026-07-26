#!/usr/bin/env python3
"""Render the Pixel Mockup "Pm" monogram into the favicon / app icon PNGs."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "src" / "assets" / "PixeloidMono-nAOpP.ttf"
PUBLIC = ROOT / "public"

TEXT = "Pm"
INK = (27, 36, 48, 255)
PAPER = (255, 255, 255, 255)

# size, background — all icons are black Pm on white
TARGETS = [
    ("favicon.png", 32, PAPER),
    ("app-icon-192.png", 192, PAPER),
    ("app-icon-512.png", 512, PAPER),
    ("app-icon-1024.png", 1024, PAPER),
]

# Fraction of the canvas the monogram should span edge to edge.
COVERAGE = 0.78


def fit_font(size: int) -> tuple[ImageFont.FreeTypeFont, tuple[int, int, int, int]]:
    """Largest pixel-grid font size whose "Pm" fits the coverage box."""
    target = size * COVERAGE
    chosen = None
    # PixeloidMono is a bitmap-style face: step by whole pixels to stay crisp.
    for px in range(4, size * 2):
        font = ImageFont.truetype(str(FONT_PATH), px)
        box = font.getbbox(TEXT)
        if box[2] - box[0] > target or box[3] - box[1] > target:
            break
        chosen = (font, box)
    if chosen is None:
        font = ImageFont.truetype(str(FONT_PATH), max(4, size // 2))
        chosen = (font, font.getbbox(TEXT))
    return chosen


def render(name: str, size: int, background: tuple[int, int, int, int] | None) -> None:
    image = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    font, box = fit_font(size)
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = round((size - width) / 2) - box[0]
    y = round((size - height) / 2) - box[1]
    draw.text((x, y), TEXT, font=font, fill=INK)
    image.save(PUBLIC / name)
    print(f"{name}: {size}x{size} font={font.size}px")


def main() -> None:
    if not FONT_PATH.exists():
        raise SystemExit(f"Missing font: {FONT_PATH}")
    for name, size, background in TARGETS:
        render(name, size, background)


if __name__ == "__main__":
    main()
