#!/usr/bin/env python3
"""Trim opaque white (or transparent) padding from device_library SVG assets.

Every library file is a Figma-style SVG wrapping a full-frame PNG. Padding is
usually opaque white, so alpha-only crop misses it. This script:

1. Extracts the embedded PNG
2. Finds the content bbox (non-near-white / non-transparent pixels)
3. Crops flush (0px pad) and rewrites the SVG in place

Usage:
  python3 scripts/trim_device_library.py              # all assets
  python3 scripts/trim_device_library.py --dry-run
  python3 scripts/trim_device_library.py --limit 5
"""

from __future__ import annotations

import argparse
import base64
import io
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "src" / "assets" / "device_library"

DATA_URI_RE = re.compile(
    r'xlink:href="(data:image/png;base64,[^"]+)"',
    re.IGNORECASE,
)

WHITE_THR = 248
ALPHA_THR = 8
PAD_PX = 0  # flush top / sides / feet


@dataclass
class TrimResult:
    path: Path
    status: str  # trimmed | skipped | error
    detail: str
    before: tuple[int, int] | None = None
    after: tuple[int, int] | None = None


def content_bbox(im: Image.Image, white_thr: int = WHITE_THR, alpha_thr: int = ALPHA_THR):
    """BBox of pixels that are not transparent and not near-white."""
    rgba = im.convert("RGBA")
    r, g, b, a = rgba.split()
    # Near-white → 0; darker → 255
    rt = r.point(lambda p, t=white_thr: 255 if p < t else 0)
    gt = g.point(lambda p, t=white_thr: 255 if p < t else 0)
    bt = b.point(lambda p, t=white_thr: 255 if p < t else 0)
    at = a.point(lambda p, t=alpha_thr: 255 if p > t else 0)
    rgb_content = ImageChops.lighter(ImageChops.lighter(rt, gt), bt)
    content = ImageChops.multiply(rgb_content, at)
    return content.getbbox()


def extract_png(svg_text: str) -> Image.Image:
    m = DATA_URI_RE.search(svg_text)
    if not m:
        raise ValueError("no embedded PNG data URI found")
    uri = m.group(1)
    b64 = uri.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


def encode_png(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True, compress_level=6)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def write_svg(width: int, height: int, png_b64: str) -> str:
    sx = 1.0 / width
    sy = 1.0 / height
    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'fill="none" xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink">\n'
        f'<rect width="{width}" height="{height}" fill="url(#pattern0)"/>\n'
        f"<defs>\n"
        f'<pattern id="pattern0" patternContentUnits="objectBoundingBox" '
        f'width="1" height="1">\n'
        f'<use xlink:href="#image0" transform="scale({sx:.12g} {sy:.12g})"/>\n'
        f"</pattern>\n"
        f'<image id="image0" width="{width}" height="{height}" '
        f'preserveAspectRatio="none" xlink:href="data:image/png;base64,{png_b64}"/>\n'
        f"</defs>\n"
        f"</svg>\n"
    )


def trim_file(path: Path, *, dry_run: bool = False) -> TrimResult:
    try:
        text = path.read_text(encoding="utf-8")
        im = extract_png(text)
    except Exception as e:  # noqa: BLE001 — report per-file and continue
        return TrimResult(path, "error", str(e))

    w, h = im.size
    bbox = content_bbox(im)
    if not bbox:
        return TrimResult(path, "skipped", "no content pixels", (w, h), (w, h))

    left, top, right, bottom = bbox
    left = max(0, left - PAD_PX)
    top = max(0, top - PAD_PX)
    right = min(w, right + PAD_PX)
    bottom = min(h, bottom + PAD_PX)
    nw, nh = right - left, bottom - top

    # Skip only when already flush (bbox equals full canvas).
    if left == 0 and top == 0 and right == w and bottom == h:
        return TrimResult(path, "skipped", "already flush", (w, h), (w, h))

    if dry_run:
        saved = 100 * (1 - (nw * nh) / (w * h)) if w * h else 0
        return TrimResult(
            path,
            "trimmed",
            f"dry-run would crop to {nw}x{nh} (−{saved:.1f}% area)",
            (w, h),
            (nw, nh),
        )

    cropped = im.crop((left, top, right, bottom))
    svg = write_svg(nw, nh, encode_png(cropped))
    path.write_text(svg, encoding="utf-8")
    saved = 100 * (1 - (nw * nh) / (w * h)) if w * h else 0
    return TrimResult(
        path,
        "trimmed",
        f"cropped to {nw}x{nh} (−{saved:.1f}% area)",
        (w, h),
        (nw, nh),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report trims without writing files",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N files (0 = all)",
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=None,
        help="Single file or subdirectory under device_library",
    )
    args = parser.parse_args()

    if args.path:
        target = args.path if args.path.is_absolute() else ROOT / args.path
        if target.is_file():
            files = [target]
        else:
            files = sorted(target.rglob("*.svg"))
    else:
        files = sorted(LIBRARY.rglob("*.svg"))

    if args.limit > 0:
        files = files[: args.limit]

    if not files:
        print("No SVG files found.", file=sys.stderr)
        return 1

    counts = {"trimmed": 0, "skipped": 0, "error": 0}
    for i, path in enumerate(files, 1):
        result = trim_file(path, dry_run=args.dry_run)
        counts[result.status] += 1
        rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
        prefix = {
            "trimmed": "TRIM",
            "skipped": "SKIP",
            "error": "ERR ",
        }[result.status]
        size = ""
        if result.before and result.after:
            size = f" {result.before[0]}x{result.before[1]} → {result.after[0]}x{result.after[1]}"
        print(f"[{i}/{len(files)}] {prefix}{size}  {rel}  ({result.detail})")

    print(
        f"\nDone: {counts['trimmed']} trimmed, {counts['skipped']} skipped, "
        f"{counts['error']} errors"
        + (" (dry-run)" if args.dry_run else "")
    )
    return 1 if counts["error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
