#!/usr/bin/env python3
"""Detect screen apertures in device_library SVGs and inject clipPath metadata.

For each SVG (Figma-style PNG wrapper):
1. Extract the embedded PNG
2. Find the largest transparent aperture (expanded through low-alpha fringe)
3. Inject <rect id="screen"> + <clipPath id="screen-clip"> into <defs>
4. Write src/assets/deviceScreens.json keyed by catalog path

Usage:
  python3 scripts/inject_device_screen_clips.py
  python3 scripts/inject_device_screen_clips.py --dry-run
  python3 scripts/inject_device_screen_clips.py --limit 5
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "src" / "assets" / "device_library"
OUT_JSON = ROOT / "src" / "assets" / "deviceScreens.json"

DATA_URI_RE = re.compile(
    r'xlink:href="(data:image/png;base64,[^"]+)"',
    re.IGNORECASE,
)
DEFS_RE = re.compile(r"(<defs\b[^>]*>)", re.IGNORECASE)
SCREEN_BLOCK_RE = re.compile(
    r"\n?\s*<!-- pixel-mockup:screen -->.*?<!-- /pixel-mockup:screen -->\n?",
    re.DOTALL,
)

ALPHA_THR = 8
LOW_ALPHA = 64
EXPAND_RATIO = 0.85
MIN_AREA_RATIO = 0.05


@dataclass
class ScreenRect:
    x: int
    y: int
    width: int
    height: int
    rx: float


@dataclass
class ProcessResult:
    path: Path
    status: str  # injected | skipped | error
    detail: str
    screen: ScreenRect | None = None


def extract_png(svg_text: str) -> Image.Image:
    m = DATA_URI_RE.search(svg_text)
    if not m:
        raise ValueError("no embedded PNG data URI found")
    b64 = m.group(1).split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


def rect_score(rect_w: int, rect_h: int) -> float:
    """Prefer large apertures; heavily penalize strap-gap skinny rectangles."""
    if rect_w <= 0 or rect_h <= 0:
        return 0.0
    area = float(rect_w * rect_h)
    aspect = min(rect_w, rect_h) / max(rect_w, rect_h)
    if aspect < 0.28:
        return 0.0
    return area * (0.35 + 0.65 * aspect)


def largest_transparent_rect(
    im: Image.Image,
    alpha_thr: int = ALPHA_THR,
) -> tuple[int, int, int, int] | None:
    """Best transparent rectangle (area × aspect), via histogram stack."""
    w, h = im.size
    px = im.load()
    heights = [0] * w
    best = None
    best_s = 0.0

    for y in range(h):
        for x in range(w):
            heights[x] = heights[x] + 1 if px[x, y][3] <= alpha_thr else 0
        stack: list[int] = []
        for x in range(w + 1):
            ht = heights[x] if x < w else 0
            while stack and heights[stack[-1]] >= ht:
                top = stack.pop()
                rect_h = heights[top]
                left = stack[-1] + 1 if stack else 0
                rect_w = x - left
                s = rect_score(rect_w, rect_h)
                if s > best_s:
                    best_s = s
                    best = (left, y - rect_h + 1, rect_w, rect_h)
            stack.append(x)
    return best


def expand_low_alpha(
    im: Image.Image,
    rect: tuple[int, int, int, int],
    alpha_max: int = LOW_ALPHA,
) -> tuple[int, int, int, int]:
    """Grow rect through low-alpha AA fringe; stop at opaque chassis."""
    w, h = im.size
    px = im.load()
    x, y, rw, rh = rect

    def strip_ok(x0: int, y0: int, x1: int, y1: int) -> bool:
        total = ok = 0
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                total += 1
                if px[xx, yy][3] <= alpha_max:
                    ok += 1
        return total > 0 and ok / total >= EXPAND_RATIO

    changed = True
    guard = max(w, h) + 8
    while changed and guard > 0:
        guard -= 1
        changed = False
        if x > 0 and strip_ok(x - 1, y, x, y + rh):
            x -= 1
            rw += 1
            changed = True
        if x + rw < w and strip_ok(x + rw, y, x + rw + 1, y + rh):
            rw += 1
            changed = True
        if y > 0 and strip_ok(x, y - 1, x + rw, y):
            y -= 1
            rh += 1
            changed = True
        if y + rh < h and strip_ok(x, y + rh, x + rw, y + rh + 1):
            rh += 1
            changed = True
    return (x, y, max(1, rw), max(1, rh))


def estimate_rx(
    im: Image.Image,
    rect: tuple[int, int, int, int],
    category: str,
) -> float:
    """Optical corner radius for phones/tablets/watches; 0 for sharp displays."""
    _ = im  # geometry-only estimate; PNG chassis already masks AA
    _, _, rw, rh = rect
    m = min(rw, rh)
    if category in {"phones", "tablets"}:
        return round(m * 0.055, 2)
    if category == "watches":
        # Watch faces are nearly circular / heavily rounded squares.
        aspect = m / max(rw, rh)
        if aspect >= 0.85:
            return round(m * 0.42, 2)
        return round(m * 0.12, 2)
    return 0.0


def detect_screen(im: Image.Image, category: str) -> ScreenRect | None:
    hole = largest_transparent_rect(im)
    if hole is None:
        return None
    x, y, rw, rh = expand_low_alpha(im, hole)
    area = rw * rh
    if area < im.width * im.height * MIN_AREA_RATIO:
        return None
    rx = estimate_rx(im, (x, y, rw, rh), category)
    return ScreenRect(x=x, y=y, width=rw, height=rh, rx=rx)


def inject_clip(svg_text: str, screen: ScreenRect) -> str:
    """Insert/replace screen rect + clipPath markers inside <defs>."""
    cleaned = SCREEN_BLOCK_RE.sub("", svg_text)
    block = (
        "\n  <!-- pixel-mockup:screen -->\n"
        f'  <rect id="screen" x="{screen.x}" y="{screen.y}" '
        f'width="{screen.width}" height="{screen.height}" '
        f'rx="{screen.rx}"/>\n'
        '  <clipPath id="screen-clip">\n'
        '    <use href="#screen"/>\n'
        "  </clipPath>\n"
        "  <!-- /pixel-mockup:screen -->"
    )
    m = DEFS_RE.search(cleaned)
    if not m:
        raise ValueError("no <defs> found")
    insert_at = m.end()
    return cleaned[:insert_at] + block + cleaned[insert_at:]


def catalog_key(path: Path) -> str:
    return path.relative_to(LIBRARY).as_posix()


def process_one(path: Path, dry_run: bool) -> ProcessResult:
    try:
        text = path.read_text(encoding="utf-8")
        im = extract_png(text)
        category = path.parent.name
        screen = detect_screen(im, category)
        if screen is None:
            return ProcessResult(path, "skipped", "no transparent aperture")
        if dry_run:
            return ProcessResult(
                path,
                "injected",
                f"dry-run {screen.width}x{screen.height} rx={screen.rx}",
                screen,
            )
        new_text = inject_clip(text, screen)
        path.write_text(new_text, encoding="utf-8")
        return ProcessResult(
            path,
            "injected",
            f"{screen.width}x{screen.height} rx={screen.rx}",
            screen,
        )
    except Exception as e:  # noqa: BLE001 — batch job continues
        return ProcessResult(path, "error", str(e))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    svgs = sorted(LIBRARY.rglob("*.svg"))
    if args.limit > 0:
        svgs = svgs[: args.limit]

    results: list[ProcessResult] = []
    screens: dict[str, dict] = {}
    for i, path in enumerate(svgs, 1):
        r = process_one(path, args.dry_run)
        results.append(r)
        key = catalog_key(path)
        print(f"[{i}/{len(svgs)}] {r.status:8} {key} — {r.detail}")
        if r.screen is not None:
            screens[key] = asdict(r.screen)

    if not args.dry_run:
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(
            json.dumps(screens, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"\nWrote {OUT_JSON} ({len(screens)} entries)")

    counts = {"injected": 0, "skipped": 0, "error": 0}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
    print(
        f"done: injected={counts['injected']} "
        f"skipped={counts['skipped']} error={counts['error']}"
    )
    return 1 if counts["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
