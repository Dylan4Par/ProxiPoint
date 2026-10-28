#!/usr/bin/env python3
"""
Builds src/lib/hashtagList.ts (the app's list of allowed #tags) from data/hashtag-taxonomy.xlsx.

Run from proxipoint-mobile/ after editing the spreadsheet:
    python scripts/build_hashtags.py
(needs: pip install openpyxl)

Spreadsheet: sheet "Taxonomy", header row with these columns (any order, extra columns ignored):
    Tag ID | Hashtag | Category | Description / Scope | Suggested Icon | Default Radius Sensitivity
- Hashtag: "#LiveMusic" (letters, numbers, _). Unique ignoring case.
- Category: one of the categories below (add a new one to CATEGORIES first).
- Suggested Icon: an Ionicons-style name ("musical-notes") or a lucide name ("Music"); see ICONS.
  Unknown names fall back to the category's icon (with a warning).
- Default Radius Sensitivity: "Neighborhood (1-3 mi)", "Local (3-5 mi)" or "Metro (5-15 mi)".
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "hashtag-taxonomy.xlsx"
OUT = ROOT / "src" / "lib" / "hashtagList.ts"

# Category label in the sheet -> id, tint (CategoryBadge colors), default icon.
CATEGORIES = {
    "Music & Nightlife": ("music-nightlife", "pink", "Music"),
    "Food & Dining": ("food-dining", "amber", "Utensils"),
    "Sports & Fitness": ("sports-fitness", "green", "Trophy"),
    "Social & Hobbies": ("social-hobbies", "violet", "Users"),
    "Arts & Culture": ("arts-culture", "violet", "Palette"),
    "Outdoors & Recreation": ("outdoors-recreation", "green", "Trees"),
    "Tech & Professional": ("tech-professional", "blue", "Terminal"),
    "Community & Civic": ("community-civic", "cyan", "HandHeart"),
    "Family & Kids": ("family-kids", "amber", "Users"),
    "Wellness & Mind": ("wellness-mind", "cyan", "Leaf"),
}

# Sheet icon names -> lucide-react-native components (only ones that exist in lucide 1.x).
# Lucide names written directly in the sheet ("Music") are accepted too if listed in LUCIDE.
ICONS = {
    "musical-notes": "Music", "beer": "Beer", "wine": "Wine", "mic": "Mic", "headset": "Headphones",
    "happy": "PartyPopper", "flash": "Zap", "fast-food": "Truck", "basket": "ShoppingBasket",
    "cafe": "Coffee", "restaurant": "Utensils", "leaf": "Leaf", "bonfire": "Flame",
    "pie-chart": "CakeSlice", "tennisball": "Trophy", "walk": "Footprints", "body": "PersonStanding",
    "bicycle": "Bike", "trail-sign": "Signpost", "baseball": "Trophy", "basketball": "Trophy",
    "football": "Trophy", "fitness": "Mountain", "barbell": "Dumbbell", "dice": "Dices",
    "book": "BookOpen", "color-palette": "Palette", "paw": "PawPrint", "game-controller": "Gamepad2",
    "heart": "Heart", "cut": "Scissors", "chatbubbles": "MessagesSquare", "car": "Car", "film": "Film",
    "camera": "Camera", "color-fill": "PaintBucket", "images": "Images", "library": "Landmark",
    "boat": "Sailboat", "fish": "Fish", "star": "Star", "binoculars": "Binoculars", "snow": "Snowflake",
    "code": "Code", "laptop": "Laptop", "rocket": "Rocket", "business": "Briefcase",
    "hardware-chip": "Cpu", "link": "Link", "briefcase": "Briefcase", "hand-right": "HandHeart",
    "podium": "Landmark", "megaphone": "Megaphone", "trash": "Trash2", "cash": "Banknote",
    "water": "Droplet", "eye": "Eye", "people": "Users", "flask": "FlaskConical", "wind": "Wind",
    "medkit": "Stethoscope", "tent": "Tent", "drama": "Drama",
}
LUCIDE = sorted(set(ICONS.values()) | {c[2] for c in CATEGORIES.values()} | {"Terminal", "Trees"})

# A better icon than the sheet's for a few tags.
ICON_OVERRIDES = {"Theater": "Drama", "PuppetShow": "Drama", "Improv": "Drama", "Camping": "Tent"}

RADIUS = {"neighborhood": "neighborhood", "local": "local", "metro": "metro"}


def main() -> None:
    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    ws = wb["Taxonomy"]
    header = None
    rows = []
    for raw in ws.iter_rows(values_only=True):
        cells = [str(v).strip() if v is not None else "" for v in raw]
        if header is None:
            if "Hashtag" in cells and "Category" in cells:
                header = {name: i for i, name in enumerate(cells) if name}
            continue
        if not any(cells):
            continue
        rows.append(cells)
    if header is None:
        sys.exit("No header row with 'Hashtag' and 'Category' found.")

    def col(cells, name):
        i = header.get(name)
        return cells[i] if i is not None and i < len(cells) else ""

    seen = set()
    tags = []
    problems = []
    for cells in rows:
        tag = col(cells, "Hashtag").lstrip("#").strip()
        if not tag:
            continue
        if not re.fullmatch(r"[A-Za-z0-9_]+", tag):
            problems.append(f"#{tag}: only letters, numbers and _ are allowed")
            continue
        if tag.lower() in seen:
            problems.append(f"#{tag}: listed twice")
            continue
        seen.add(tag.lower())
        label = col(cells, "Category")
        if label not in CATEGORIES:
            problems.append(f"#{tag}: unknown category {label!r} (add it to CATEGORIES)")
            continue
        cat_id, _, cat_icon = CATEGORIES[label]
        sheet_icon = col(cells, "Suggested Icon")
        icon = ICON_OVERRIDES.get(tag) or ICONS.get(sheet_icon) or (sheet_icon if sheet_icon in LUCIDE else None)
        if not icon:
            print(f"warning: #{tag}: icon {sheet_icon!r} not mapped, using {cat_icon}", file=sys.stderr)
            icon = cat_icon
        radius_raw = col(cells, "Default Radius Sensitivity").split(" ")[0].lower()
        tags.append({
            "id": col(cells, "Tag ID") or re.sub(r"(?<!^)(?=[A-Z])", "-", tag).lower(),
            "tag": f"#{tag}",
            "category": cat_id,
            "description": col(cells, "Description / Scope"),
            "icon": icon,
            "radius": RADIUS.get(radius_raw, "local"),
        })
    if problems:
        sys.exit("Fix these rows in the spreadsheet:\n  " + "\n  ".join(problems))

    cats = [
        {"id": cid, "label": label, "tint": tint, "icon": icon}
        for label, (cid, tint, icon) in CATEGORIES.items()
    ]
    icons_used = sorted({t["icon"] for t in tags} | {c["icon"] for c in cats})
    body = [
        "// GENERATED by scripts/build_hashtags.py from data/hashtag-taxonomy.xlsx. Don't edit by hand:",
        "// change the spreadsheet and run `python scripts/build_hashtags.py`.",
        "",
        "export type HashtagCategoryId =",
        *[f"  | '{c['id']}'" for c in cats],
        "  ;",
        "export type HashtagTint = 'cyan' | 'amber' | 'blue' | 'green' | 'violet' | 'pink';",
        "export type HashtagRadius = 'neighborhood' | 'local' | 'metro';",
        f"export type HashtagIcon = {' | '.join(repr(i) for i in icons_used)};",
        "",
        "export interface HashtagCategory {",
        "  id: HashtagCategoryId;",
        "  label: string;",
        "  tint: HashtagTint;",
        "  icon: HashtagIcon;",
        "}",
        "",
        "export interface HashtagEntry {",
        "  /** Stable id from the sheet (\"live-music\"). */",
        "  id: string;",
        "  /** As shown, with # (\"#LiveMusic\"). */",
        "  tag: string;",
        "  category: HashtagCategoryId;",
        "  description: string;",
        "  icon: HashtagIcon;",
        "  /** Default Radius Sensitivity: neighborhood 1-3 mi, local 3-5 mi, metro 5-15 mi. */",
        "  radius: HashtagRadius;",
        "}",
        "",
        f"export const HASHTAG_CATEGORIES: HashtagCategory[] = {json.dumps(cats, indent=2)};",
        "",
        f"export const HASHTAG_LIST: HashtagEntry[] = {json.dumps(tags, indent=2, ensure_ascii=False)};",
        "",
    ]
    text = "\n".join(body)
    # Single quotes, like the rest of the codebase.
    text = re.sub(r'"((?:[^"\\]|\\.)*)"', lambda m: "'" + m.group(1).replace("'", "\\'") + "'", text)
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {len(tags)} tags in {len(cats)} categories to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
