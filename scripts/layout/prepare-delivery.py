"""
A print-first delivery from the book's final PDFs → the delivery folder, its mapping and the book layout (docs/content.md
"Importing the final print PDFs"). Python 3 with PyMuPDF and Pillow (`pip install pymupdf pillow`).

    python scripts/layout/prepare-delivery.py --print OSCT_INSIDE_256p.pdf --preview OSCT_FULL_preview_spreads.pdf \
        --triggers active=OSCT_TRIGGERS_ACTIVE.pdf --triggers inactive=OSCT_TRIGGERS_INACTIVE.pdf \
        --triggers artwork=OSCT_TRIGGERS_KevinWORKS.pdf --content <OSCT_CONTENT_DIR> \
        --delivery <folder> --mapping scripts/import/<name>.yaml

Reads
  - the trigger PDFs: one sheet per double page (the covers single), every printed trigger as an image at its place.
    Their kind says what a trigger becomes: `active` = a target in the book, `inactive` = a target switched off (#249),
    `artwork` = a target switched off whose entry is tagged `artwork` (#248). They carry no page numbers: the preview
    PDF of the same sheets gives them. Covers and the sheets without page numbers (end papers, title) are left out –
    the book keeps its own;
  - the print PDF: one page per book page with bleed – its trim box is the page. Every trigger's image is cut from its
    page at the resolution of the picture printed there (no upscaling; at most --max-size px) – the target is what
    the camera sees on paper;
  - the content: a trigger that shows a current target's image (a perceptual hash, on the same double page; else the
    printed box overlapping the layout's) keeps the target's id, so the import replaces its image and keeps its entry.
    Every other trigger gets the next free id of its page, `p<page>-<n>`.
Writes
  - <delivery>/P<page>_<kind>_<n>.jpg and the mapping for `npm run import` (scripts/src/import-delivery.ts);
  - <content>/layout/: the page previews from the print PDF (a double page per sheet, `sheets/pp-…jpg` and a sharper
    `@sharp`), the covers' and other sheets as the layout had them, and every target's printed box by id (layout.json);
  - <report>: per trigger its id, kind, page, box, the printed picture's resolution and the cut's pixels; matched,
    new and gone targets.
Run it again whenever the PDFs change; the import keeps edited entry.yaml files.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    import pymupdf
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("PyMuPDF and Pillow are needed: pip install pymupdf pillow")

PT_TO_MM = 25.4 / 72
KINDS = {"active": {}, "inactive": {"enabled": False}, "artwork": {"enabled": False, "tags": ["artwork"]}}
NUMBER = re.compile(r"^\d{1,3}$")
MATCH_DISTANCE = 12  # bits of 64: a trigger shows a current target's image


def mm(points: float) -> float:
    return round(points * PT_TO_MM, 1)


def scalar(text: str, key: str, indent: str = "") -> str | None:
    match = re.search(rf"^{indent}{key}:[ \t]*(.+?)[ \t]*$", text, re.M)
    if not match:
        return None
    value = match.group(1)
    return value[1:-1] if value[:1] in "'\"" and value[-1:] == value[:1] else value


def dhash(image: Image.Image) -> int:
    small = image.convert("L").resize((9, 8), Image.LANCZOS)
    pixels = list(small.tobytes())
    return sum(1 << i for i in range(64) if pixels[(i // 8) * 9 + i % 8] > pixels[(i // 8) * 9 + i % 8 + 1])


def distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def overlap(a: dict, b: dict) -> float:
    w = max(0.0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]))
    h = max(0.0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    inter = w * h
    return inter / (a["width"] * a["height"] + b["width"] * b["height"] - inter) if inter else 0.0


def spread_of(page: int) -> int:
    """The first page of the double page a page is on (page 1 stands alone)"""
    return 1 if page <= 1 else page - page % 2


def page_numbers(page) -> dict:
    """The page numbers printed at the foot of a sheet: which on the left half, which on the right"""
    numbers = {}
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        if NUMBER.match(word) and y0 > page.rect.height * 0.8:
            numbers.setdefault("left" if x0 < page.rect.width / 2 else "right", int(word))
    return numbers


def sheet_pages(preview, last_page: int) -> list[list[int]]:
    """
    Each sheet's book pages, [] for a sheet that is no page of the book (covers, end papers, title). Counted from page
    1's sheet (the first with a 1 on its right half) up to the print PDF's last page – the numbers printed on a sheet
    only check it, as a picture's caption can read like one.
    """
    numbered = [page_numbers(page) for page in preview]
    start = next((i for i, n in enumerate(numbered) if n.get("right") == 1), None)
    if start is None:
        sys.exit("the preview PDF has no sheet with page 1 on its right half")
    sheets = []
    for index, numbers in enumerate(numbered):
        k = index - start
        first = 2 * k
        pages = [] if k < 0 else [1] if k == 0 else [first, first + 1] if first + 1 <= last_page else [first] if first <= last_page else []
        if pages and numbers and sorted(numbers.values()) != pages:
            print(f"  ! preview sheet {index + 1}: page numbers {sorted(numbers.values())}, counted {pages}")
        sheets.append(pages)
    return sheets


def read_content(content_dir: str) -> tuple[dict, set[str]]:
    """The current entries with a target (page, category, title, target image for its hash), and every entry's id"""
    entries, ids = {}, set()
    root = os.path.join(content_dir, "entries")
    for entry_id in sorted(os.listdir(root)):
        file = os.path.join(root, entry_id, "entry.yaml")
        if not os.path.isfile(file):
            continue
        ids.add(entry_id)
        text = open(file, encoding="utf-8").read()
        page, image = scalar(text, "page"), scalar(text, "image", "  ")
        if page is None or image is None or not re.search(r"^target:\s*$", text, re.M):
            continue
        path = os.path.join(root, entry_id, image)
        entries[entry_id] = {
            "page": int(page), "category": scalar(text, "category") or "glossary", "title": scalar(text, "title") or entry_id,
            "target": scalar(text, "id", "  ") or entry_id,
            "hash": dhash(Image.open(path)) if os.path.isfile(path) else None,
        }
    return entries, ids


def read_triggers(specs: list[str], sheets: list[list[int]]) -> list[dict]:
    triggers = []
    for spec in specs:
        kind, _, file = spec.partition("=")
        if kind not in KINDS:
            sys.exit(f"--triggers {spec}: the kind is one of {', '.join(KINDS)}")
        doc = pymupdf.open(file)
        if len(doc) != len(sheets):
            sys.exit(f"{file}: {len(doc)} sheets, the preview has {len(sheets)}")
        for index, page in enumerate(doc):
            pages = sheets[index]
            if not pages:
                continue
            half = page.rect.width / 2
            for info in page.get_image_info(xrefs=True):
                x0, y0, x1, y1 = info["bbox"]
                if x1 - x0 < 2 or y1 - y0 < 2:
                    continue
                surface = "left" if (x0 + x1) / 2 < half else "right"
                number = pages[0] if len(pages) == 1 else pages[0] if surface == "left" else pages[1]
                if len(pages) == 1 and ((number == 1) != (surface == "right")):
                    continue  # the blank half of a single page
                left = 0 if surface == "left" else half
                image = None
                if info.get("xref"):
                    try:
                        pix = pymupdf.Pixmap(doc, info["xref"])
                        if pix.n - pix.alpha >= 4:
                            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                        image = Image.open(io.BytesIO(pix.tobytes("png")))
                    except Exception:  # noqa: BLE001 – a picture PyMuPDF cannot read is matched by its box alone
                        image = None
                triggers.append({
                    "kind": kind, "sheet": index + 1, "page": number, "surface": surface,
                    "x": mm(x0 - left), "y": mm(y0), "width": round(mm(x1) - mm(x0), 1), "height": round(mm(y1) - mm(y0), 1),
                    "hash": dhash(image) if image else None,
                })
    return triggers


def assign_ids(triggers: list[dict], entries: dict, all_ids: set[str], layout_targets: dict,
               retired: set[str] = frozenset()) -> tuple[dict, list[str]]:
    """
    Trigger → entry id: a current target's when the trigger shows its image (same double page), else the next id of its
    page that no entry has – entries without a target (a video read in the list) and retired ones included. A retired
    entry (`--retire`, to be deleted) is never matched: its trigger becomes a new entry
    """
    taken: set[str] = set()
    pairs = []
    for i, t in enumerate(triggers):
        for entry_id, e in entries.items():
            if entry_id in retired or spread_of(e["page"]) != spread_of(t["page"]):
                continue
            d = distance(t["hash"], e["hash"]) if t["hash"] is not None and e["hash"] is not None else 64
            box = layout_targets.get(e["target"])
            o = overlap(t, box) if box and box["page"] == t["page"] else 0.0
            if d <= MATCH_DISTANCE or o > 0.3:
                # The image decides first, the printed box breaks ties; an active trigger before a switched-off one
                pairs.append((min(d, MATCH_DISTANCE + 1), -o, t["kind"] != "active", i, entry_id))
    ids: dict[int, str] = {}
    for _, _, _, i, entry_id in sorted(pairs):
        if i in ids or entry_id in taken:
            continue
        ids[i] = entry_id
        taken.add(entry_id)
    counters: dict[int, int] = {}
    for entry_id in all_ids:
        match = re.match(r"^p(\d+)-(\d+)$", entry_id)
        if match:
            counters[int(match.group(1))] = max(counters.get(int(match.group(1)), 0), int(match.group(2)))
    for i, t in sorted(enumerate(triggers), key=lambda item: (item[1]["page"], round(item[1]["y"] / 10), item[1]["x"])):
        if i in ids:
            continue
        counters[t["page"]] = counters.get(t["page"], 0) + 1
        ids[i] = f"p{t['page']:03d}-{counters[t['page']]}"
    gone = [entry_id for entry_id in entries if entry_id not in taken and entry_id not in retired]
    return ids, gone


def printed_dpi(page, clip) -> float | None:
    """The resolution of the picture printed under the clip (px per inch), None when there is none"""
    best, best_area = None, 0.0
    for info in page.get_image_info():
        r = pymupdf.Rect(info["bbox"]) & clip
        if r.is_empty or info["bbox"][2] <= info["bbox"][0]:
            continue
        area = r.width * r.height
        if area > best_area:
            best_area = area
            best = info["width"] / ((info["bbox"][2] - info["bbox"][0]) / 72)
    return best if best_area > 0.25 * clip.width * clip.height else None


def cut(print_doc, t: dict, path: str, max_size: int, min_dpi: int, by_sheet: bool = False) -> dict:
    """The trigger's box cut from its page – or, from a PDF of the same sheets as the trigger PDFs, from its sheet"""
    if by_sheet:
        page = print_doc[t["sheet"] - 1]
        double = page.rect.width > page.rect.height
        left = page.rect.width / 2 if double and t["surface"] == "right" else 0
        origin = pymupdf.Point(page.rect.x0 + left, page.rect.y0)
    else:
        page = print_doc[t["page"] - 1]
        origin = page.trimbox.tl
    clip = pymupdf.Rect(origin.x + t["x"] / PT_TO_MM, origin.y + t["y"] / PT_TO_MM,
                        origin.x + (t["x"] + t["width"]) / PT_TO_MM, origin.y + (t["y"] + t["height"]) / PT_TO_MM)
    native = printed_dpi(page, clip)
    dpi = max(min_dpi, native or min_dpi)
    longest = max(clip.width, clip.height) / 72 * dpi
    if longest > max_size:
        dpi = dpi * max_size / longest
    pix = page.get_pixmap(matrix=pymupdf.Matrix(dpi / 72, dpi / 72), clip=clip, alpha=False)
    pix.save(path, jpg_quality=90)
    return {"printedDpi": round(native) if native else None, "px": [pix.width, pix.height]}


def render_sheet(print_doc, pages: list[int], width_px: int, sheet: int | None = None) -> Image.Image:
    """
    A double page: the sheet itself from a PDF of sheets (`sheet`, 0-based), else composed of the print PDF's trimmed
    pages – page 1 on the right, a last single page on the left
    """
    if sheet is not None:
        page = print_doc[sheet]
        zoom = width_px / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    half = width_px // 2
    first = print_doc[0]
    height = round(half * first.trimbox.height / first.trimbox.width)
    sheet = Image.new("RGB", (half * 2, height), "white")
    for number in pages:
        page = print_doc[number - 1]
        zoom = half / page.trimbox.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=page.trimbox, alpha=False)
        image = Image.open(io.BytesIO(pix.tobytes("png"))).resize((half, height))
        sheet.paste(image, (half if number % 2 == 1 else 0, 0))
    return sheet


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--print", dest="print_pdf", required=True,
                        help="the images' source: the print PDF (one page per book page, with bleed) or a PDF of the same "
                             "sheets as the trigger PDFs (a high-resolution export of the preview)")
    parser.add_argument("--sheets", help="the page previews' source, when not --print: the print PDF draws the flat pages "
                        "(a preview export may bake a fold shadow into every spread)")
    parser.add_argument("--sheets-only", action="store_true", help="only draw the page previews again: the layout's "
                        "target boxes stay, nothing is cut and no mapping is written")
    parser.add_argument("--last-page", type=int, help="the book's last page (default: the print PDF's page count; for a "
                        "PDF of sheets the highest page number printed on the preview)")
    parser.add_argument("--preview", required=True, help="the preview PDF of the same sheets as the trigger PDFs (page numbers)")
    parser.add_argument("--triggers", action="append", default=[], help="<kind>=<pdf>, kind: " + ", ".join(KINDS))
    parser.add_argument("--content", required=True, help="the content source folder (OSCT_CONTENT_DIR)")
    parser.add_argument("--delivery", help="the folder the cut target images go to")
    parser.add_argument("--mapping", help="the mapping file to write (scripts/import/<name>.yaml)")
    parser.add_argument("--report", help="a JSON report (default: <delivery>/report.json)")
    parser.add_argument("--max-size", type=int, default=1600, help="long side of a cut target at most (px)")
    parser.add_argument("--min-dpi", type=int, default=300, help="cut at least at this resolution (vector art, text)")
    parser.add_argument("--width", type=int, default=1200, help="pixel width of a page preview (double page)")
    parser.add_argument("--sharp-width", type=int, default=4096, help="pixel width of the sharper page preview (0 = none)")
    parser.add_argument("--no-sheets", action="store_true", help="keep the layout's page previews (targets only)")
    parser.add_argument("--retire", default="", help="current entry ids to be deleted, comma-separated: never matched, "
                        "their triggers become new entries; delete their folders before the import")
    args = parser.parse_args()
    if not args.sheets_only and not (args.triggers and args.delivery and args.mapping):
        parser.error("--triggers, --delivery and --mapping are needed (or --sheets-only)")

    preview = pymupdf.open(args.preview)
    print_doc = pymupdf.open(args.print_pdf)
    sheets_doc = pymupdf.open(args.sheets) if args.sheets else print_doc

    # A PDF of the preview's sheets (double pages, no bleed) is used by sheet; a print PDF by book page
    def by_sheet_of(doc) -> bool:
        return len(doc) == len(preview) and any(p.rect.width > p.rect.height for p in doc)

    by_sheet = by_sheet_of(print_doc)
    last_page = args.last_page or (max(n for p in preview for n in page_numbers(p).values()) if by_sheet else len(print_doc))
    sheets = sheet_pages(preview, last_page)
    print(f"images from {os.path.basename(args.print_pdf)}: {'by sheet' if by_sheet else 'by page'}, pages 1–{last_page}")
    layout_file = os.path.join(args.content, "layout", "layout.json")
    old_layout = json.load(open(layout_file, encoding="utf-8")) if os.path.isfile(layout_file) else {"sheets": [], "targets": {}}
    page_sheets = sorted({tuple(p) for p in sheets if p}, key=lambda p: p[0])

    if args.sheets_only:
        targets = old_layout["targets"]
    else:
        targets = cut_delivery(args, print_doc, by_sheet, sheets, page_sheets, old_layout)

    # The layout: the page previews, the other sheets as they were, every target's box by id
    sheets_dir = os.path.join(args.content, "layout", "sheets")
    os.makedirs(sheets_dir, exist_ok=True)
    layout_sheets = [s for s in old_layout["sheets"] if not s.get("pages")]
    first = print_doc[0].trimbox
    page_mm = {"width": mm(first.width), "height": mm(first.height)}  # a sheet PDF's first sheet is the single front cover
    sheet_index = {tuple(p): i for i, p in enumerate(sheets) if p}
    sheets_by_sheet = by_sheet_of(sheets_doc)
    for pages in page_sheets:
        name = "pp-" + "-".join(f"{n:03d}" for n in pages)
        entry = {"id": name, "kind": "spread", "pages": list(pages), "image": f"sheets/{name}.jpg",
                 "widthMm": page_mm["width"] * 2, "heightMm": page_mm["height"], "surfaces": ["left", "right"]}
        if not args.no_sheets:
            sharp = render_sheet(sheets_doc, list(pages), args.sharp_width or args.width, sheet_index[pages] if sheets_by_sheet else None)
            normal = sharp.resize((args.width, round(args.width * sharp.height / sharp.width)), Image.LANCZOS)
            normal.save(os.path.join(sheets_dir, f"{name}.jpg"), quality=78)
            entry.update({"widthPx": normal.width, "heightPx": normal.height})
            if args.sharp_width:
                sharp.save(os.path.join(sheets_dir, f"{name}@sharp.jpg"), quality=82)
                entry.update({"imageSharp": f"sheets/{name}@sharp.jpg", "widthPxSharp": sharp.width, "heightPxSharp": sharp.height})
        else:
            old = next((s for s in old_layout["sheets"] if s.get("id") == name), None)
            if old:
                entry = old
        layout_sheets.append(entry)
    order = {"cover-front": 0, "front-matter": 1, "spread": 2, "sheet": 2, "back-matter": 3, "cover-back": 4}
    layout_sheets.sort(key=lambda s: (order.get(s["kind"], 2), s.get("pages", [0])[0] if s.get("pages") else s.get("pdfPage", 0)))
    source = dict(old_layout.get("source") or {}) if args.sheets_only else {
        "print": os.path.basename(args.print_pdf), "preview": os.path.basename(args.preview),
        "triggers": [os.path.basename(s.partition("=")[2]) for s in args.triggers]}
    if not args.no_sheets:
        source["sheets"] = os.path.basename(args.sheets or args.print_pdf)
    source["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(layout_file, "w", encoding="utf-8") as f:
        json.dump({"page": page_mm, "sheets": layout_sheets, "targets": targets, "source": source}, f, indent=1, ensure_ascii=False)
    print(f"layout: {len(page_sheets)} page previews{'' if args.no_sheets else ' from ' + os.path.basename(args.sheets or args.print_pdf)}, "
          f"{len(targets)} target boxes -> {layout_file}")
    return 0


def cut_delivery(args, print_doc, by_sheet: bool, sheets: list[list[int]], page_sheets: list[tuple], old_layout: dict) -> dict:
    """The targets: matched and new ids, the cut images, the mapping and the report – the layout's target boxes back"""
    entries, all_ids = read_content(args.content)
    triggers = read_triggers(args.triggers, sheets)
    retired = {i.strip() for i in args.retire.split(",") if i.strip()}
    unknown = retired - all_ids
    if unknown:
        sys.exit(f"--retire: no entry {', '.join(sorted(unknown))} in the content")
    ids, gone = assign_ids(triggers, entries, all_ids, old_layout["targets"], retired)
    os.makedirs(args.delivery, exist_ok=True)

    lines = [f"# Made by scripts/layout/prepare-delivery.py from {os.path.basename(args.print_pdf)} and the trigger PDFs "
             f"({', '.join(os.path.basename(s.partition('=')[2]) for s in args.triggers)}).",
             "book: osct", "entries:"]
    report = []
    for i, t in sorted(enumerate(triggers), key=lambda item: ids[item[0]]):
        entry_id = ids[i]
        file = f"P{t['page']}_{t['kind']}_{entry_id.split('-')[-1]}.jpg"
        cutting = cut(print_doc, t, os.path.join(args.delivery, file), args.max_size, args.min_dpi, by_sheet)
        current = entries.get(entry_id)
        title = current["title"] if current else f"p. {t['page']} · {entry_id.split('-')[-1]}"
        category = current["category"] if current else "glossary"
        lines += [f"  {entry_id}:", f"    category: {category}", f"    title: {json.dumps(title, ensure_ascii=False)}",
                  f"    page: {current['page'] if current else t['page']}", f"    target: {file}",
                  f"    printed: {{ width: {t['width']}, height: {t['height']}, position: \"{t['surface']} {t['x']} / {t['y']}\" }}"]
        for key, value in KINDS[t["kind"]].items():
            lines.append(f"    {key}: {json.dumps(value).lower() if isinstance(value, bool) else json.dumps(value)}")
        report.append({"id": entry_id, "kind": t["kind"], "matched": bool(current), **{k: t[k] for k in ("page", "surface", "x", "y", "width", "height")}, **cutting})
    with open(args.mapping, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    targets = {k: v for k, v in old_layout["targets"].items() if k in entries and k not in ids.values() and k not in retired}
    for i, t in enumerate(triggers):
        sheet = next(("pp-" + "-".join(f"{n:03d}" for n in p) for p in page_sheets if t["page"] in p), None)
        targets[entries[ids[i]]["target"] if ids[i] in entries else ids[i]] = {
            **{k: t[k] for k in ("page", "surface", "x", "y", "width", "height")}, "sheet": sheet}

    report_file = args.report or os.path.join(args.delivery, "report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({"triggers": report, "gone": gone, "retired": sorted(retired),
                   "skippedSheets": [i + 1 for i, p in enumerate(sheets) if not p]}, f, indent=1)
    kinds = {k: sum(1 for t in triggers if t["kind"] == k) for k in KINDS}
    matched = sum(1 for r in report if r["matched"])
    print(f"delivery: {len(triggers)} triggers ({', '.join(f'{n} {k}' for k, n in kinds.items())}), {matched} keep a current "
          f"target's id, {len(triggers) - matched} new; {len(gone)} current targets without a trigger: {', '.join(gone) or '–'}")
    print(f"mapping -> {args.mapping}, report -> {report_file}")
    return targets


if __name__ == "__main__":
    sys.exit(main())
