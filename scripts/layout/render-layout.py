"""
A book layout rendered from the content itself, for a book without designed PDFs – the demo book (docs/editor.md,
docs/content.md "Importing the book layout"). The sibling of extract-layout.py: the same `layout/` folder and
`layout.json`, so the editor's spread list, the books page and the mock stage show real pages instead of blank ones.
Python 3 with Pillow (`pip install pillow`).

    python scripts/layout/render-layout.py --content fixtures/demo

Reads book.yaml (title, author), every spread (title, firstPage, lastPage, format) and every entry (title, page,
body, target.print) and draws one sheet per spread in the printed book's look (agents/DESIGN.md): white paper, the
spread's title in the gold gradient, the entries' text below the printed targets, page numbers; the covers as single
pages with the title and the author. The targets themselves are **not** drawn: the stage and the spread cards lay
each target's print over the sheet from its `print`, so a print moved in the editor never leaves a stale copy on the
page. Writes <content>/layout/sheets/*.jpg (+ `@sharp` for the stage's close-up) and <content>/layout/layout.json.
The output is deterministic: run it again whenever the spreads or the texts change.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is missing: pip install pillow")

# agents/DESIGN.md §1: the one gold gradient (left → right), the muted grey, the rules
GOLD_STOPS = [(0.0, "#f5e7c8"), (0.038, "#f5e7c8"), (0.315, "#7f6032"), (0.57, "#d2ae5a"), (0.736, "#f3cc94"), (1.0, "#f3cc94")]
INK = (30, 30, 30)
BODY = (88, 88, 88)
MUTED = (139, 141, 140)
DOTS = (236, 236, 236)

FONT_CANDIDATES = {
    "regular": ["arial.ttf", "Arial.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Helvetica.ttc"],
    "bold": ["arialbd.ttf", "Arial Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"],
}


# --- reading the content (the simple YAML of the content source – no library needed) -------------------------------

def scalar(text: str, key: str, indent: str = "") -> str | None:
    """A `key: value` line at the given indent; double-quoted values are unescaped like JSON."""
    match = re.search(rf"^{indent}{key}:[ \t]*(.+?)[ \t]*$", text, re.M)
    if not match:
        return None
    value = match.group(1)
    if value.startswith('"') and value.endswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return re.sub(r"\s+#.*$", "", value)


def block(text: str, key: str, indent: str) -> str | None:
    """The lines nested under `key:` at the given indent (e.g. a target's `print:`)."""
    match = re.search(rf"^{indent}{key}:[ \t]*\n((?:{indent}[ \t]+.*\n?)+)", text, re.M)
    return match.group(1) if match else None


def read_content(content_dir: str):
    book_text = open(os.path.join(content_dir, "book.yaml"), encoding="utf-8").read()
    book = {key: scalar(book_text, key) or "" for key in ("title", "author", "publisher")}

    spreads = []
    for spread_id in sorted(os.listdir(os.path.join(content_dir, "spreads"))):
        file = os.path.join(content_dir, "spreads", spread_id, "spread.yaml")
        if not os.path.isfile(file):
            continue
        text = open(file, encoding="utf-8").read()
        spreads.append({
            "id": spread_id, "title": scalar(text, "title") or spread_id, "order": float(scalar(text, "order") or 0),
            "firstPage": int(scalar(text, "firstPage") or 0), "lastPage": int(scalar(text, "lastPage") or 0),
            "format": scalar(text, "format") or "spread",
        })
    spreads.sort(key=lambda s: (s["order"], s["firstPage"]))

    entries = []
    entries_dir = os.path.join(content_dir, "entries")
    for entry_id in sorted(os.listdir(entries_dir)):
        file = os.path.join(entries_dir, entry_id, "entry.yaml")
        if not os.path.isfile(file):
            continue
        text = open(file, encoding="utf-8").read()
        page = scalar(text, "page")
        if page is None:
            continue
        entry = {"id": entry_id, "title": scalar(text, "title") or entry_id, "page": int(page), "body": scalar(text, "body") or "", "print": None}
        target = block(text, "target", "")
        printed = block(target, "print", "  ") if target else None
        if printed:
            image = scalar(target, "image", "  ")
            place = {key: scalar(printed, key, "    ") for key in ("surface", "x", "y", "width", "height")}
            width = float(place["width"] or 0)
            height = float(place["height"]) if place["height"] else None
            if height is None and image and os.path.isfile(os.path.join(entries_dir, entry_id, image)):
                with Image.open(os.path.join(entries_dir, entry_id, image)) as picture:
                    height = width * picture.height / picture.width
            entry["print"] = {"surface": place["surface"], "x": float(place["x"] or 0), "y": float(place["y"] or 0),
                              "width": width, "height": height if height is not None else width * 0.75}
        entries.append(entry)
    return book, spreads, entries


# --- drawing --------------------------------------------------------------------------------------------------------

def find_font(kind: str, wanted: str | None) -> str:
    for candidate in ([wanted] if wanted else []) + FONT_CANDIDATES[kind]:
        try:
            ImageFont.truetype(candidate, 10)
            return candidate
        except OSError:
            continue
    sys.exit(f"No {kind} font found: pass --font{'-bold' if kind == 'bold' else ''} <file.ttf>")


def hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def gold_strip(width: int) -> Image.Image:
    """One row of the gold gradient, `width` px wide (DESIGN.md: it spans the text's own box)."""
    strip = Image.new("RGB", (max(1, width), 1))
    stops = [(at, hex_rgb(color)) for at, color in GOLD_STOPS]
    for x in range(strip.width):
        t = x / max(1, strip.width - 1)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= t <= b:
                f = 0 if b == a else (t - a) / (b - a)
                strip.putpixel((x, 0), tuple(round(ca[i] + (cb[i] - ca[i]) * f) for i in range(3)))
                break
    return strip


class Sheet:
    """One sheet at `scale` px per mm; every coordinate below is in mm from the sheet's top left corner."""

    def __init__(self, width_mm: float, height_mm: float, scale: float, fonts: dict[str, str]):
        self.scale = scale
        self.image = Image.new("RGB", (round(width_mm * scale), round(height_mm * scale)), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.fonts = fonts

    def px(self, mm: float) -> int:
        return round(mm * self.scale)

    def font(self, kind: str, size_mm: float) -> ImageFont.FreeTypeFont:
        return ImageFont.truetype(self.fonts[kind], max(1, self.px(size_mm)))

    def dots(self, left: float, width: float, height: float, step: float = 2.2, radius: float = 0.32):
        """The covers' faint halftone, as on the printed cover"""
        y = step / 2
        row = 0
        while y < height:
            x = left + (step / 2 if row % 2 else 0) + step / 4
            while x < left + width:
                r = self.px(radius)
                cx, cy = self.px(x), self.px(y)
                self.draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=DOTS)
                x += step
            y += step * 0.866
            row += 1

    def text(self, x: float, y: float, text: str, size: float, kind: str = "regular", fill=INK, anchor: str = "la"):
        self.draw.text((self.px(x), self.px(y)), text, font=self.font(kind, size), fill=fill, anchor=anchor)

    def gold(self, x: float, y: float, text: str, size: float, align: str = "left") -> float:
        """Gold gradient text (DESIGN.md §5 option A: the gradient clipped by the text); returns its width in mm"""
        font = self.font("regular", size)
        left, top, right, bottom = font.getbbox(text)
        width, height = right - left, bottom - top
        mask = Image.new("L", (width, height), 0)
        ImageDraw.Draw(mask).text((-left, -top), text, font=font, fill=255)
        fill = gold_strip(width).resize((width, height))
        origin_x = self.px(x) - (width // 2 if align == "center" else 0)
        self.image.paste(fill, (origin_x, self.px(y) + top), mask)
        return width / self.scale

    def paragraph(self, x: float, y: float, width: float, text: str, size: float, bottom: float, kind: str = "regular",
                  fill=BODY, leading: float = 1.45) -> float:
        """Wrapped text from y down to at most `bottom`; returns where it ends (mm). Cut with … when it does not fit."""
        font = self.font(kind, size)
        words, lines, line = text.split(), [], ""
        for word in words:
            trial = f"{line} {word}".strip()
            if font.getlength(trial) <= self.px(width) or not line:
                line = trial
            else:
                lines.append(line)
                line = word
        if line:
            lines.append(line)
        step = size * leading
        fit = max(0, int((bottom - y) // step))
        if len(lines) > fit:
            lines = lines[:fit]
            if lines:
                lines[-1] = lines[-1].rstrip(".,;:") + " …"
        for i, line in enumerate(lines):
            self.draw.text((self.px(x), self.px(y + i * step)), line, font=font, fill=fill)
        return y + len(lines) * step

    def save(self, path: str, width_px: int):
        out = self.image if self.image.width == width_px else self.image.resize((width_px, round(self.image.height * width_px / self.image.width)), Image.LANCZOS)
        out.save(path, "JPEG", quality=82, optimize=True, progressive=True)
        return out.size


def plain(text: str, book: dict) -> str:
    """Body text as printed: the content's templates filled in, inline code marks dropped"""
    text = re.sub(r"\{\{\s*book\.(\w+)\s*\}\}", lambda m: str(book.get(m.group(1), "")), text)
    return re.sub(r"[`*_]", "", text)


def draw_page_text(sheet: Sheet, left: float, page: dict, entries: list[dict], boxes: list[dict], book: dict, margin: float, top: float):
    """The entries of one page: under the lowest printed target, or from `top` when the page has none"""
    lowest = max((box["y"] + box["height"] for box in boxes), default=top - 12)
    y = max(top, lowest + 12)
    bottom = page["height"] - 24
    for entry in entries:
        if y > bottom - 8:
            break
        sheet.text(left + margin, y, entry["title"], 4.0, "bold", INK)
        y = sheet.paragraph(left + margin, y + 6.5, page["width"] - 2 * margin, plain(entry["body"], book), 3.1, bottom) + 5


def render(content_dir: str, out_dir: str, page: dict, width_px: int, sharp_px: int, fonts: dict[str, str]):
    book, spreads, entries = read_content(content_dir)
    sheets_dir = os.path.join(out_dir, "sheets")
    os.makedirs(sheets_dir, exist_ok=True)
    for old in os.listdir(sheets_dir):
        if old.endswith(".jpg"):
            os.remove(os.path.join(sheets_dir, old))

    margin = 25.0
    sheets = []
    for spread in spreads:
        cover = spread["format"] in ("cover", "back")
        width_mm = page["width"] if cover else page["width"] * 2
        # Draw once at the sharp resolution, save both sizes from it
        scale = sharp_px * (1 if cover else 2) / width_mm
        sheet = Sheet(width_mm, page["height"], scale, fonts)
        on = lambda number: [e for e in entries if e["page"] == number]
        if spread["format"] == "cover":
            kind, name, pages, surfaces = "cover-front", "cover-front", [], ["front"]
            sheet.dots(0, width_mm, page["height"])
            sheet.gold(width_mm / 2, 34, book["title"], 17, align="center")
            sheet.gold(width_mm / 2, 286, book["author"], 12, align="center")
        elif spread["format"] == "back":
            kind, name, pages, surfaces = "cover-back", "cover-back", [], ["back"]
            sheet.dots(0, width_mm, page["height"])
            sheet.gold(width_mm / 2, 30, book["title"], 8, align="center")
            boxes = [e["print"] for e in on(spread["firstPage"]) if e["print"] and e["print"]["surface"] == "back"]
            draw_page_text(sheet, 0, page, on(spread["firstPage"]), boxes, book, margin, 60)
            if book["publisher"]:
                sheet.text(width_mm / 2, 304, book["publisher"], 3.4, "regular", MUTED, anchor="ms")
        else:
            first, last = spread["firstPage"], spread["lastPage"]
            kind, name, pages, surfaces = "spread", f"pp-{first:03d}-{last:03d}", sorted({first, last}), ["left", "right"]
            sheet.text(margin, 20, book["title"], 3.2, "regular", MUTED)
            sheet.gold(margin, 27, spread["title"], 13)
            for side, number in (("left", first), ("right", last)):
                if side == "right" and last == first:
                    break
                left = 0 if side == "left" else page["width"]
                boxes = [e["print"] for e in on(number) if e["print"] and e["print"]["surface"] == side]
                draw_page_text(sheet, left, page, [e for e in on(number)], boxes, book, margin, 60 if side == "left" else 40)
                sheet.text(left + page["width"] / 2, page["height"] - 9, str(number), 3.0, "regular", INK, anchor="ms")
            # The gutter: a hair of shade at the spine
            spine = sheet.px(page["width"])
            for i, shade in enumerate((244, 248, 251)):
                sheet.draw.line((spine - i, 0, spine - i, sheet.image.height), fill=(shade,) * 3)
                sheet.draw.line((spine + i, 0, spine + i, sheet.image.height), fill=(shade,) * 3)
        file, sharp_file = f"sheets/{name}.jpg", f"sheets/{name}@sharp.jpg"
        w, h = sheet.save(os.path.join(out_dir, file), width_px * (1 if cover else 2))
        sheet.save(os.path.join(out_dir, sharp_file), sharp_px * (1 if cover else 2))
        sheets.append({"id": name, "kind": kind, "pages": pages, "image": file, "imageSharp": sharp_file,
                       "widthMm": width_mm, "heightMm": page["height"], "widthPx": w, "heightPx": h, "surfaces": surfaces})
        print(f"  {file}  {spread['id']}")

    layout = {
        "page": page,
        "sheets": sheets,
        # Every target here has its own `print`, which the stage reads first: the layout repeats none of them
        "targets": {},
        "source": {"rendered": "scripts/layout/render-layout.py"},
    }
    with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"{len(sheets)} sheets: {os.path.join(out_dir, 'layout.json')}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--content", required=True, help="the content source (book.yaml, spreads/, entries/)")
    parser.add_argument("--page", default="230x320", help="one page in mm, WxH (the stage's BOOK_PAGE_MM)")
    parser.add_argument("--width", type=int, default=600, help="px of one page in the sheet image")
    parser.add_argument("--sharp-width", type=int, default=1400, help="px of one page in the sharp image")
    parser.add_argument("--font", help="a regular sans-serif .ttf (default: Arial, Liberation Sans, DejaVu Sans)")
    parser.add_argument("--font-bold", help="its bold cut")
    args = parser.parse_args()
    width, height = (float(v) for v in args.page.lower().split("x"))
    fonts = {"regular": find_font("regular", args.font), "bold": find_font("bold", args.font_bold)}
    render(args.content, os.path.join(args.content, "layout"), {"width": width, "height": height}, args.width, args.sharp_width, fonts)


if __name__ == "__main__":
    main()
