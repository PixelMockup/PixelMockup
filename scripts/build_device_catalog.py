#!/usr/bin/env python3
"""Normalize device_library filenames and build mm width×height catalog."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "src" / "assets" / "device_library"
DATA_DIR = ROOT / "src" / "data"
MD_OUT = ROOT / "DEVICE_DIMENSIONS.md"
DIMS_OUT = DATA_DIR / "device_dimensions.json"

# Chassis body width × height in mm (portrait / closed-case orientation).
# Keys are model_key values produced by model_key_for().
DIMENSIONS: dict[str, dict] = {
    # --- Phones ---
    "apple-iphone-11": {"width_mm": 75.7, "height_mm": 150.9, "source": "Apple specs"},
    "apple-iphone-11-pro": {"width_mm": 71.4, "height_mm": 144.0, "source": "Apple specs"},
    "apple-iphone-11-pro-max": {"width_mm": 77.8, "height_mm": 158.0, "source": "Apple specs"},
    "apple-iphone-5c": {"width_mm": 59.2, "height_mm": 124.4, "source": "Apple specs"},
    "apple-iphone-5s": {"width_mm": 58.6, "height_mm": 123.8, "source": "Apple specs"},
    "apple-iphone-6s": {"width_mm": 67.1, "height_mm": 138.3, "source": "Apple specs"},
    "apple-iphone-6s-plus": {"width_mm": 77.9, "height_mm": 158.2, "source": "Apple specs"},
    "apple-iphone-7": {"width_mm": 67.1, "height_mm": 138.3, "source": "Apple specs"},
    "apple-iphone-7-plus": {"width_mm": 77.9, "height_mm": 158.2, "source": "Apple specs"},
    "apple-iphone-8": {"width_mm": 67.3, "height_mm": 138.4, "source": "Apple specs"},
    "apple-iphone-8-plus": {"width_mm": 78.1, "height_mm": 158.4, "source": "Apple specs"},
    "apple-iphone-se": {
        "width_mm": 58.6,
        "height_mm": 123.8,
        "source": "Apple specs",
        "notes": "1st-generation iPhone SE (2016)",
    },
    "apple-iphone-x": {"width_mm": 70.9, "height_mm": 143.6, "source": "Apple specs"},
    "apple-iphone-xr": {"width_mm": 75.7, "height_mm": 150.9, "source": "Apple specs"},
    "apple-iphone-xs": {"width_mm": 70.9, "height_mm": 143.6, "source": "Apple specs"},
    "apple-iphone-xs-max": {"width_mm": 77.4, "height_mm": 157.5, "source": "Apple specs"},
    "google-pixel-3": {"width_mm": 68.2, "height_mm": 145.6, "source": "Google specs"},
    "google-pixel-3-xl": {"width_mm": 76.7, "height_mm": 158.0, "source": "Google specs"},
    "htc-one-a9": {"width_mm": 70.8, "height_mm": 145.8, "source": "HTC / GSMArena"},
    "htc-one-m8": {"width_mm": 70.6, "height_mm": 146.4, "source": "HTC / GSMArena"},
    "huawei-p8": {"width_mm": 72.1, "height_mm": 144.9, "source": "Huawei / GSMArena"},
    "microsoft-lumia-950": {"width_mm": 73.2, "height_mm": 145.0, "source": "Microsoft / GSMArena"},
    "motorola-moto-e": {
        "width_mm": 64.8,
        "height_mm": 124.8,
        "source": "Motorola / GSMArena",
        "notes": "1st-gen Moto E (2014)",
    },
    "motorola-moto-g": {
        "width_mm": 65.9,
        "height_mm": 129.9,
        "source": "Motorola / GSMArena",
        "notes": "1st-gen Moto G (2013)",
    },
    "nexus-4": {"width_mm": 68.7, "height_mm": 133.9, "source": "Google / LG specs"},
    "nexus-5x": {"width_mm": 72.6, "height_mm": 147.0, "source": "Google / LG specs"},
    "nexus-6p": {"width_mm": 77.8, "height_mm": 159.3, "source": "Google / Huawei specs"},
    "samsung-galaxy-grand-prime": {
        "width_mm": 72.1,
        "height_mm": 144.8,
        "source": "Samsung / GSMArena",
    },
    "samsung-galaxy-note-5": {"width_mm": 76.1, "height_mm": 153.2, "source": "Samsung specs"},
    "samsung-galaxy-s-duos": {
        "width_mm": 61.0,
        "height_mm": 121.0,
        "source": "Samsung / GSMArena",
        "notes": "Galaxy S Duos (S7562)",
    },
    "samsung-galaxy-s3": {"width_mm": 70.6, "height_mm": 136.6, "source": "Samsung specs"},
    "samsung-galaxy-s5": {"width_mm": 72.5, "height_mm": 142.0, "source": "Samsung specs"},
    "samsung-galaxy-s7": {"width_mm": 69.6, "height_mm": 142.4, "source": "Samsung specs"},
    "samsung-galaxy-s8": {"width_mm": 68.1, "height_mm": 148.9, "source": "Samsung specs"},
    "samsung-galaxy-s9": {"width_mm": 68.7, "height_mm": 147.7, "source": "Samsung specs"},
    # --- Tablets ---
    "apple-ipad": {
        "width_mm": 185.7,
        "height_mm": 241.2,
        "source": "assumed Apple iPad (5th/6th gen)",
        "notes": "Generic 'Apple iPad' asset; assumed 9.7-inch iPad (5th/6th gen)",
    },
    "apple-ipad-air": {
        "width_mm": 169.5,
        "height_mm": 240.0,
        "source": "assumed Apple iPad Air 2",
        "notes": "Generic 'iPad Air' asset; assumed iPad Air 2",
    },
    "apple-ipad-mini": {
        "width_mm": 134.8,
        "height_mm": 200.0,
        "source": "assumed Apple iPad mini 4",
        "notes": "Generic 'iPad Mini' asset; assumed iPad mini 4",
    },
    "apple-ipad-pro-11-inch": {
        "width_mm": 178.5,
        "height_mm": 247.6,
        "source": "Apple specs",
        "notes": "iPad Pro 11-inch (1st gen class); portrait body size",
    },
    "apple-ipad-pro-13-inch": {
        "width_mm": 214.9,
        "height_mm": 280.6,
        "source": "assumed Apple iPad Pro 12.9-inch",
        "notes": "Filename says 13-inch; body size assumed 12.9-inch iPad Pro (3rd gen class)",
    },
    "microsoft-surface-pro-3": {
        "width_mm": 292.1,
        "height_mm": 201.3,
        "source": "Microsoft specs",
        "notes": "Landscape-oriented body (tablet used flat)",
    },
    "microsoft-surface-pro-4": {
        "width_mm": 292.1,
        "height_mm": 201.4,
        "source": "Microsoft specs",
        "notes": "Landscape-oriented body",
    },
    "nexus-9": {"width_mm": 153.7, "height_mm": 228.3, "source": "Google / HTC specs"},
    # --- Watches (case size; Open/Closed share same case) ---
    "apple-watch-38mm": {
        "width_mm": 33.3,
        "height_mm": 38.6,
        "source": "Apple specs",
        "notes": "38mm case",
    },
    "apple-watch-40mm": {
        "width_mm": 34.0,
        "height_mm": 40.0,
        "source": "Apple specs",
        "notes": "40mm case",
    },
    "apple-watch-42mm": {
        "width_mm": 36.4,
        "height_mm": 42.5,
        "source": "Apple specs",
        "notes": "42mm case",
    },
    "apple-watch-44mm": {
        "width_mm": 38.0,
        "height_mm": 44.0,
        "source": "Apple specs",
        "notes": "44mm case",
    },
    "motorola-moto-360-men": {
        "width_mm": 46.0,
        "height_mm": 46.0,
        "source": "Motorola / GSMArena",
        "notes": "1st-gen Moto 360 (46mm men)",
    },
    "motorola-moto-360-women": {
        "width_mm": 42.0,
        "height_mm": 42.0,
        "source": "Motorola / GSMArena",
        "notes": "Moto 360 women 42mm",
    },
    "sony-smartwatch-3": {
        "width_mm": 36.0,
        "height_mm": 51.0,
        "source": "Sony / GSMArena",
        "notes": "Approximate case footprint",
    },
    # --- Computers ---
    "apple-imac": {
        "width_mm": 528.0,
        "height_mm": 450.0,
        "source": "assumed Apple iMac 21.5-inch",
        "notes": "Generic iMac asset; assumed 21.5-inch overall W×H",
    },
    "apple-imac-pro": {
        "width_mm": 650.0,
        "height_mm": 516.0,
        "source": "Apple specs",
        "notes": "27-inch iMac Pro overall",
    },
    "apple-imac-retina": {
        "width_mm": 650.0,
        "height_mm": 516.0,
        "source": "assumed Apple iMac 27-inch Retina",
        "notes": "Assumed 27-inch Retina iMac overall",
    },
    "apple-macbook": {
        "width_mm": 280.5,
        "height_mm": 196.5,
        "source": "Apple specs",
        "notes": "12-inch MacBook (Early 2015+) closed footprint W×D as W×H",
    },
    "apple-macbook-air-13-inch": {
        "width_mm": 304.1,
        "height_mm": 212.4,
        "source": "Apple specs",
        "notes": "13-inch MacBook Air closed footprint W×D as W×H",
    },
    "apple-macbook-pro-13-inch": {
        "width_mm": 304.1,
        "height_mm": 212.4,
        "source": "Apple specs",
        "notes": "13-inch MacBook Pro closed footprint W×D as W×H",
    },
    "apple-macbook-pro-15-inch": {
        "width_mm": 349.3,
        "height_mm": 240.7,
        "source": "Apple specs",
        "notes": "15-inch MacBook Pro closed footprint W×D as W×H",
    },
    "dell-xps-13-inch": {
        "width_mm": 302.0,
        "height_mm": 199.0,
        "source": "Dell specs",
        "notes": "XPS 13 closed footprint (approx)",
    },
    "dell-xps-15-inch": {
        "width_mm": 357.0,
        "height_mm": 235.0,
        "source": "Dell specs",
        "notes": "XPS 15 closed footprint (approx)",
    },
    "microsoft-surface-book": {
        "width_mm": 312.3,
        "height_mm": 232.1,
        "source": "Microsoft specs",
        "notes": "Surface Book closed footprint",
    },
    # --- Displays ---
    "apple-pro-display-xdr": {
        "width_mm": 718.0,
        "height_mm": 411.0,
        "source": "Apple specs",
        "notes": "Display only (without Pro Stand)",
    },
    "apple-thunderbolt-display": {
        "width_mm": 650.0,
        "height_mm": 490.0,
        "source": "Apple specs",
        "notes": "27-inch Thunderbolt Display overall",
    },
    "dell-ultrasharp-24-inch": {
        "width_mm": 539.0,
        "height_mm": 360.0,
        "source": "Dell specs",
        "notes": "Approx 24-inch UltraSharp overall; 90deg uses same body mm",
    },
    "dell-ultrasharp-27-inch": {
        "width_mm": 611.0,
        "height_mm": 406.0,
        "source": "Dell specs",
        "notes": "Approx 27-inch UltraSharp overall; 90deg uses same body mm",
    },
    "dell-ultrasharp-5k-monitor-27-inch": {
        "width_mm": 611.0,
        "height_mm": 444.0,
        "source": "Dell specs",
        "notes": "UP2715K / 5K class overall (approx)",
    },
    "sony-w850c": {
        "width_mm": 1235.0,
        "height_mm": 718.0,
        "source": "Sony specs",
        "notes": "55-inch Bravia W850C class overall (approx without stand)",
    },
}


def normalize_stem(stem: str) -> str:
    """Apply filename normalization rules to a stem (no .svg)."""
    name = stem

    # Preserve trailing -1 / -2 / -3 variant markers
    variant = ""
    m = re.search(r"(-\d+)$", name)
    if m:
        variant = m.group(1)
        name = name[: -len(variant)]

    # Specific typo / duplicate fixes before general rules
    # Distinct asset wrongly named Snony; real Sony W850C.svg already exists
    if name == "Snony W850C":
        name = "Sony W850C"
        if not variant:
            variant = "-1"

    # Hyphenated MacBook → spaces
    if name.startswith("Apple-Macbook") or name.startswith("Apple-MacBook"):
        name = name.replace("-", " ")
        name = re.sub(r"\s+", " ", name).strip()

    # Macbook → MacBook
    name = name.replace("Macbook", "MacBook")

    # Inch underscore: "13_" / "27_" → "13-inch" / "27-inch"
    name = re.sub(r"(\d+)_(\s|$)", r"\1-inch\2", name)
    name = re.sub(r"(\d+)_$", r"\1-inch", name)

    name = re.sub(r"\s+", " ", name).strip()
    return name + variant


def model_key_for(category: str, stem: str) -> str:
    """Derive a chassis key shared across colors / -N / Open-Closed."""
    name = stem
    # Only strip -1/-2/-3 style alt suffixes, not model numbers like C3-00
    name = re.sub(r"-[1-9]$", "", name)

    # Strip orientation / band state
    name = re.sub(r"\s*-\s*(Landscape|Portrait)(?:-\d+)?$", "", name, flags=re.I)
    name = re.sub(r"\s+(Open|Closed)$", "", name, flags=re.I)
    name = re.sub(r"\s+90deg$", "", name, flags=re.I)

    # Strip common color / finish / band tokens for phones/tablets/computers
    color_tokens = [
        "Arctic Silver",
        "Coral Blue",
        "Maple Gold",
        "Midnight Black",
        "Orchid Gray",
        "Burgundy Red",
        "Lilac Purple",
        "Sunrise Gold",
        "Titanium Gray",
        "Silver Titanium",
        "Jet Black",
        "Matte Black",
        "Rose Gold",
        "Space Grey",
        "Space Gray",
        "Midnight Green",
        "Clearly White",
        "Just Black",
        "Not Pink",
        "Product Red",
    ]
    # Longer phrases first already ordered
    for tok in color_tokens:
        name = re.sub(rf"\s*-\s*{re.escape(tok)}$", "", name, flags=re.I)
        name = re.sub(rf"\s+{re.escape(tok)}$", "", name, flags=re.I)

    simple_colors = [
        "Black",
        "White",
        "Gold",
        "Silver",
        "Blue",
        "Green",
        "Red",
        "Yellow",
        "Purple",
        "Coral",
        "Pink",
    ]
    for tok in simple_colors:
        name = re.sub(rf"\s+{tok}$", "", name, flags=re.I)

    # Watches: collapse to size / brand family
    aw = re.match(r"Apple Watch (38|40|42|44)mm\b", name, re.I)
    if aw:
        return f"apple-watch-{aw.group(1)}mm"

    if re.match(r"Motorola Moto 360 Men\b", name, re.I):
        return "motorola-moto-360-men"
    if re.match(r"Motorola Moto 360 Women\b", name, re.I):
        return "motorola-moto-360-women"
    if re.match(r"Sony SmartWatch 3\b", name, re.I):
        return "sony-smartwatch-3"

    # Computers / displays already mostly model-only after color strip
    if re.match(r"Apple MacBook Air 13-inch", name, re.I):
        return "apple-macbook-air-13-inch"
    if re.match(r"Apple MacBook Pro 13-inch", name, re.I):
        return "apple-macbook-pro-13-inch"
    if re.match(r"Apple MacBook Pro 15-inch", name, re.I):
        return "apple-macbook-pro-15-inch"
    if re.match(r"Apple MacBook$", name, re.I):
        return "apple-macbook"
    if re.match(r"Dell XPS 13-inch", name, re.I):
        return "dell-xps-13-inch"
    if re.match(r"Dell XPS 15-inch", name, re.I):
        return "dell-xps-15-inch"
    if re.match(r"Dell UltraSharp 5K Monitor 27-inch", name, re.I):
        return "dell-ultrasharp-5k-monitor-27-inch"
    if re.match(r"Dell UltraSharp 24-inch", name, re.I):
        return "dell-ultrasharp-24-inch"
    if re.match(r"Dell UltraSharp 27-inch", name, re.I):
        return "dell-ultrasharp-27-inch"
    if re.match(r"Apple iPad Pro 11-inch", name, re.I):
        return "apple-ipad-pro-11-inch"
    if re.match(r"Apple iPad Pro 13-inch", name, re.I):
        return "apple-ipad-pro-13-inch"
    if re.match(r"Apple iPad Mini", name, re.I):
        return "apple-ipad-mini"
    if re.match(r"Apple iPad Air", name, re.I):
        return "apple-ipad-air"
    if re.match(r"Apple iPad$", name, re.I):
        return "apple-ipad"

    # Phones: strip remaining finishes like "Pro Max" stays
    key = name.lower()
    key = key.replace(" + ", " ")
    key = re.sub(r"[^a-z0-9]+", "-", key)
    key = re.sub(r"-+", "-", key).strip("-")
    return key


def rename_all(dry_run: bool = False) -> list[dict]:
    renames: list[dict] = []
    planned: dict[Path, Path] = {}

    for cat_dir in sorted(p for p in LIBRARY.iterdir() if p.is_dir()):
        for src in sorted(cat_dir.glob("*.svg")):
            new_stem = normalize_stem(src.stem)
            dst = src.with_name(new_stem + ".svg")
            if dst.name == src.name:
                continue
            planned[src] = dst
            renames.append(
                {
                    "from": f"{cat_dir.name}/{src.name}",
                    "to": f"{cat_dir.name}/{dst.name}",
                }
            )

    # Collision check
    targets = list(planned.values())
    if len(targets) != len(set(targets)):
        raise SystemExit("Rename collision detected among planned destinations")

    existing = {p for p in LIBRARY.rglob("*.svg")}
    for src, dst in planned.items():
        if dst in existing and dst not in planned:
            raise SystemExit(f"Destination already exists: {dst}")

    if dry_run:
        return renames

    # Two-phase rename to avoid clobber
    tmp_map: dict[Path, Path] = {}
    for i, (src, dst) in enumerate(planned.items()):
        tmp = src.with_name(f".__rename_tmp_{i}__{src.name}")
        src.rename(tmp)
        tmp_map[tmp] = dst
    for tmp, dst in tmp_map.items():
        tmp.rename(dst)

    return renames


def build_catalog() -> dict:
    devices = []
    missing_keys: set[str] = set()

    for cat_dir in sorted(p for p in LIBRARY.iterdir() if p.is_dir()):
        for path in sorted(cat_dir.glob("*.svg")):
            stem = path.stem
            key = model_key_for(cat_dir.name, stem)
            dim = DIMENSIONS.get(key)
            if not dim:
                missing_keys.add(key)
                dim = {
                    "width_mm": None,
                    "height_mm": None,
                    "source": "missing",
                    "notes": "No dimension entry for this model_key",
                }
            entry = {
                "file": f"{cat_dir.name}/{path.name}",
                "category": cat_dir.name,
                "name": stem,
                "model_key": key,
                "width_mm": dim["width_mm"],
                "height_mm": dim["height_mm"],
                "source": dim.get("source", ""),
                "notes": dim.get("notes", ""),
            }
            # Orientation notes for tablets
            if "Landscape" in stem and not entry["notes"]:
                entry["notes"] = "Landscape asset; body mm is portrait chassis size"
            elif "Portrait" in stem and "portrait" not in entry["notes"].lower():
                if entry["notes"]:
                    entry["notes"] += "; portrait asset"
                else:
                    entry["notes"] = "Portrait asset"
            if "90deg" in stem:
                note = "Rotated 90deg asset; same body mm"
                entry["notes"] = f"{entry['notes']}; {note}" if entry["notes"] else note
            devices.append(entry)

    if missing_keys:
        print("WARNING: missing model_key dimensions:")
        for k in sorted(missing_keys):
            print(" ", k)

    return {
        "unit": "mm",
        "fields": ["width_mm", "height_mm"],
        "device_count": len(devices),
        "devices": devices,
    }


def write_markdown(catalog: dict) -> None:
    lines = [
        "# Device dimensions",
        "",
        "Real-world body **width × height** in **millimeters** for every asset in `src/assets/device_library/`.",
        "",
        f"- Unit: `{catalog['unit']}` only",
        f"- Devices: **{catalog['device_count']}**",
        f"- Machine-readable: [`src/data/device_dimensions.json`](src/data/device_dimensions.json)",
        "",
        "Color / `-1` / Open-Closed variants share a `model_key` and the same chassis size.",
        "",
    ]

    by_cat: dict[str, list] = defaultdict(list)
    for d in catalog["devices"]:
        by_cat[d["category"]].append(d)

    for cat in ["phones", "tablets", "watches", "computers", "displays"]:
        rows = by_cat.get(cat, [])
        lines.append(f"## {cat.title()} ({len(rows)})")
        lines.append("")
        lines.append("| File name | Device name | Width (mm) | Height (mm) | Notes |")
        lines.append("| --- | --- | ---: | ---: | --- |")
        for d in rows:
            w = d["width_mm"] if d["width_mm"] is not None else "—"
            h = d["height_mm"] if d["height_mm"] is not None else "—"
            notes = (d.get("notes") or "").replace("|", "/")
            fname = Path(d["file"]).name
            lines.append(
                f"| `{fname}` | {d['name']} | {w} | {h} | {notes} |"
            )
        lines.append("")

    MD_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    import sys

    skip_rename = "--catalog-only" in sys.argv

    if not skip_rename:
        print("Renaming files…")
        renames = rename_all(dry_run=False)
        print(f"  {len(renames)} renames applied")
    else:
        print("Skipping renames (--catalog-only)")

    print("Building catalog…")
    catalog = build_catalog()
    DIMS_OUT.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    write_markdown(catalog)
    print(f"  {catalog['device_count']} devices → {DIMS_OUT.relative_to(ROOT)}")
    print(f"  Markdown → {MD_OUT.relative_to(ROOT)}")

    missing = [d for d in catalog["devices"] if d["width_mm"] is None]
    if missing:
        keys = sorted({d["model_key"] for d in missing})
        raise SystemExit(f"Incomplete: {len(keys)} model keys still missing dimensions: {keys}")


if __name__ == "__main__":
    main()
