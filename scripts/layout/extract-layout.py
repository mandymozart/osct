"""
Book layout from the designed PDFs, for the editor's mock stage (docs/editor.md, docs/content.md "Importing the
book layout"). An external tool like ffmpeg for the videos: Python 3 with PyMuPDF (`pip install pymupdf`).

    python scripts/layout/extract-layout.py --triggers All_Triggers.pdf --preview OSCT_preview.pdf --content content

Reads
  - the preview PDF (every sheet of the book as laid out: covers as single pages, the rest as double pages)
    → one JPEG per sheet in <content>/layout/sheets/ (--width px wide) and a sharper `<sheet>@sharp.jpg` (--sharp-width),
  - the trigger PDF (one page per double page, every printed trigger as an image at its printed position and size)
    → the printed geometry of every target in mm from the top left corner of its page,
and matches both to the content: sheets by the page numbers printed on them, trigger images to the targets of that
page (the entry's `page`) by the aspect ratio of the target image, then by reading order. Writes
<content>/layout/layout.json. The content build copies layout/ with the rest of the content; layout/ is generated
and stays out of git. Run again whenever the PDFs change.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    import pymupdf
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF is missing: pip install pymupdf")

PT_TO_MM = 25.4 / 72
NUMBER = re.compile(r"^\d{1,3}$")


def mm(points: float) -> float:
    return round(points * PT_TO_MM, 1)


def read_yaml_scalar(text: str, key: str, indent: str = "") -> str | None:
    """A top-level (or indented) `key: value` line of the simple content YAML – no library needed."""
    match = re.search(rf"^{indent}{key}:\s*(.+?)\s*$", text, re.M)
    if not match:
        return None
    value = match.group(1).strip()
    if value.startswith(("'", '"')) and value.endswith(value[0]):
        value = value[1:-1]
    return value


def read_content(content_dir: str):
    spreads = []
    for spread_id in sorted(os.listdir(os.path.join(content_dir, "spreads"))):
        file = os.path.join(content_dir, "spreads", spread_id, "spread.yaml")
        if not os.path.isfile(file):
            continue
        text = open(file, encoding="utf-8").read()
        first = read_yaml_scalar(text, "firstPage")
        last = read_yaml_scalar(text, "lastPage")
        spreads.append({"id": spread_id, "firstPage": int(first) if first else None, "lastPage": int(last) if last else None})
    targets = []
    for entry_id in sorted(os.listdir(os.path.join(content_dir, "entries"))):
        file = os.path.join(content_dir, "entries", entry_id, "entry.yaml")
        if not os.path.isfile(file):
            continue
        text = open(file, encoding="utf-8").read()
        page = read_yaml_scalar(text, "page")
        image = read_yaml_scalar(text, "image", indent="  ")
        if page is None or not re.search(r"^target:\s*$", text, re.M) or image is None:
            continue
        target_id = read_yaml_scalar(text, "id", indent="  ") or entry_id
        path = os.path.join(content_dir, "entries", entry_id, image)
        aspect = None
        if os.path.isfile(path):
            pix = pymupdf.Pixmap(path)
            aspect = pix.height / pix.width if pix.width else None
        targets.append({"id": target_id, "entryId": entry_id, "page": int(page), "aspect": aspect})
    return spreads, targets


def page_numbers(page) -> dict:
    """The page numbers printed at the foot: which number on the left half, which on the right (mm)."""
    numbers = {}
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        if NUMBER.match(word) and mm(y0) > page.rect.height * PT_TO_MM * 0.8:
            side = "left" if mm(x0) < page.rect.width * PT_TO_MM / 2 else "right"
            numbers.setdefault(side, int(word))
    return numbers


def render(page, path: str, width_px: int, quality: int = 78) -> tuple[int, int]:
    zoom = width_px / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    pix.save(path, jpg_quality=quality)
    return pix.width, pix.height


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--triggers", required=True, help="the trigger layout PDF (All_Triggers.pdf)")
    parser.add_argument("--preview", required=True, help="the book preview PDF (every sheet)")
    parser.add_argument("--content", required=True, help="the content source folder (OSCT_CONTENT_DIR)")
    parser.add_argument("--width", type=int, default=1200, help="pixel width of a rendered double page")
    parser.add_argument("--sharp-width", type=int, default=4096,
                        help="pixel width of the sharper image of a double page (0 = none); the editor fetches it only "
                             "when the camera is close to the page. Kept at 4096 so every GPU can hold it")
    args = parser.parse_args()

    spreads, targets = read_content(args.content)
    out_dir = os.path.join(args.content, "layout")
    sheets_dir = os.path.join(out_dir, "sheets")
    os.makedirs(sheets_dir, exist_ok=True)

    preview = pymupdf.open(args.preview)
    page_mm = None
    sheets = []
    singles = [i for i, p in enumerate(preview) if p.rect.width < p.rect.height]
    for index, page in enumerate(preview):
        width_mm, height_mm = mm(page.rect.width), mm(page.rect.height)
        single = page.rect.width < page.rect.height
        numbers = page_numbers(page)
        pages = sorted(n for n in numbers.values())
        if single:
            kind = "cover-front" if index == singles[0] else "cover-back" if index == singles[-1] else "sheet"
            name = kind if kind != "sheet" else f"sheet-{index + 1:03d}"
        elif pages:
            kind = "spread"
            name = "pp-" + "-".join(f"{n:03d}" for n in pages)
            page_mm = page_mm or {"width": round(width_mm / 2, 1), "height": height_mm}
        else:
            kind = "front-matter" if index < len(preview) / 2 else "back-matter"
            name = f"{kind}-{index + 1:03d}"
        file = f"sheets/{name}.jpg"
        width_px, height_px = render(page, os.path.join(out_dir, file), args.width if not single else args.width // 2)
        sharp = {}
        if args.sharp_width:
            sharp_file = f"sheets/{name}@sharp.jpg"
            sharp_px, sharp_height = render(page, os.path.join(out_dir, sharp_file), args.sharp_width if not single else args.sharp_width // 2, 82)
            sharp = {"imageSharp": sharp_file, "widthPxSharp": sharp_px, "heightPxSharp": sharp_height}
        sheets.append({
            "id": name, "kind": kind, "pages": pages, "image": file, **sharp,
            "widthMm": width_mm, "heightMm": height_mm, "widthPx": width_px, "heightPx": height_px,
            "surfaces": ["front"] if kind == "cover-front" else ["back"] if kind == "cover-back" else ["left", "right"],
            "pdfPage": index + 1,
        })
    page_mm = page_mm or {"width": 230, "height": 320}

    triggers = pymupdf.open(args.triggers)
    placed = {}
    problems = []
    by_page: dict[int, list] = {}
    for target in targets:
        by_page.setdefault(target["page"], []).append(target)
    for index, page in enumerate(triggers):
        numbers = page_numbers(page)
        half = page.rect.width * PT_TO_MM / 2
        boxes = []
        for info in page.get_image_info():
            x0, y0, x1, y1 = info["bbox"]
            left = mm(x0) < half
            number = numbers.get("left" if left else "right")
            if number is None:
                problems.append(f"trigger PDF page {index + 1}: an image on the {'left' if left else 'right'} page, but no page number there")
                continue
            boxes.append({
                "page": number, "surface": "left" if left else "right",
                "x": round(mm(x0) - (0 if left else half), 1), "y": mm(y0),
                "width": round(mm(x1) - mm(x0), 1), "height": round(mm(y1) - mm(y0), 1),
                "aspect": (y1 - y0) / (x1 - x0) if x1 > x0 else None,
            })
        for number in sorted({box["page"] for box in boxes}):
            page_boxes = sorted((b for b in boxes if b["page"] == number), key=lambda b: (round(b["y"] / 30), b["x"]))
            candidates = [t for t in by_page.get(number, []) if t["id"] not in placed]
            if len(page_boxes) != len(candidates):
                problems.append(f"page {number}: {len(page_boxes)} printed images, {len(candidates)} targets in the content")
            # Best aspect match first, the rest in reading order
            remaining = list(candidates)
            for box in page_boxes:
                if not remaining:
                    break
                scored = sorted(remaining, key=lambda t: abs((t["aspect"] or 0) - (box["aspect"] or 0)) if t["aspect"] and box["aspect"] else 9)
                best = scored[0]
                if best["aspect"] and box["aspect"] and abs(best["aspect"] - box["aspect"]) > 0.15:
                    problems.append(f"{best['id']}: printed aspect {box['aspect']:.2f} vs image {best['aspect']:.2f} – check the match")
                remaining.remove(best)
                placed[best["id"]] = {k: box[k] for k in ("page", "surface", "x", "y", "width", "height")}
                placed[best["id"]]["sheet"] = next((s["id"] for s in sheets if number in s["pages"]), None)

    layout = {
        "page": page_mm,
        "sheets": sheets,
        "targets": placed,
        "source": {
            "triggers": os.path.basename(args.triggers), "preview": os.path.basename(args.preview),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
    }
    with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=1, ensure_ascii=False)

    spread_pages = {p for s in spreads for p in (s["firstPage"], s["lastPage"]) if p}
    covered = sum(1 for s in sheets if any(p in spread_pages for p in s["pages"]))
    print(f"layout: {len(sheets)} sheets ({covered} of the content's {len(spreads)} spreads have one), "
          f"{len(placed)} of {len(targets)} targets placed -> {out_dir}")
    for problem in problems:
        print("  ! " + problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
