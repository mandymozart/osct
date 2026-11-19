"""
Carries the printed book layout into the 3.0 content through the editor API (#321): every target's `place` and every
surface's reference image, from the `layout/` folder that extract-layout.py wrote from the designed PDFs (1.10.0) and
the 3.0 refactor stopped reading (docs/content.md "Placing the targets from the layout"). Python 3 with Pillow;
PyMuPDF only for the optional --pdf.

    python scripts/layout/place-targets.py --layout "$OSCT_CONTENT_DIR/layout" --api https://osct.porschuetz.de/api \
        --book osct --out <report folder>                      # dry run: report + contact sheets + reference images
    python scripts/layout/place-targets.py ... --apply         # writes through the editor API

Reads
  - <layout>/layout.json: `page` (one page in mm), `sheets` (in book order: id, kind, pages, image, imageSharp, widthMm,
    heightMm) and `targets` by entry id: { page, surface: left | right | front | back, x, y, width, height, sheet } in mm
    from the top left corner of the PAGE,
  - the book's draft from the editor API (GET only): `…/draft/latest.json`, `…/draft/<build>/game.config.json` (scenes,
    entries, targets) and `…/scenes` (the surfaces' reference images).
Maps every sheet to a scene: a numbered sheet to the scene whose label names the same pages (`4–5`), the unnumbered
sheets (covers, front and back matter) between two numbered ones to the unnumbered scenes there, in order, when the
counts and sizes agree. A target's place lies on its scene's surface (`TargetPlace`, shared/types/game-config.ts): mm
from the surface's top left corner; a right page's target moves by the left page's width on a double-page surface.
Reports what it cannot map, and why. Each surface's reference is its sheet's image (the sharp one where there is one),
cut to the surface when the surface is one half of the sheet, written as WebP (at most --reference-max-side px, the
API's own limit for a reference).

Dry run by default: writes <out>/report.md, report.json, references/*.webp and contact-sheets/*.png and changes nothing.
--apply writes every computed place (PUT …/targets/{id} { place }) and every reference (POST …/assets?fit=reference,
then PUT …/scenes/{id}/surfaces/{sid}/reference { url }), as the editor does. A target that already has a different
place and a surface that already has a reference are skipped and reported, unless --replace-places /
--replace-references. Auth: Bearer $OSCT_EDITOR_TOKEN, or --token-from-mcp <server> (the env of that MCP server in
~/.claude.json). The token is never printed.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is missing: pip install pillow")

EPS = 0.6  # mm: sizes that agree within this are the same
LABEL_PAGES = re.compile(r"^\s*(\d{1,4})(?:\s*[–—-]\s*(\d{1,4}))?\s*$")
SIDE_OFFSET = {"left": 0, "front": 0, "back": 0, "whole": 0}


# --- the editor API -------------------------------------------------------------------------------------------------

class Api:
    def __init__(self, base: str, token: str | None):
        self.base = base.rstrip("/")
        self.token = token

    def call(self, method: str, path: str, body=None, raw: bytes | None = None, headers: dict | None = None):
        data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
        h = {"Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                text = response.read().decode("utf-8")
                return response.status, (json.loads(text) if text else None)
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", "replace")
            try:
                return error.code, json.loads(text)
            except json.JSONDecodeError:
                return error.code, {"error": {"message": text[:300]}}

    def get(self, path: str):
        status, data = self.call("GET", path)
        if status != 200:
            sys.exit(f"GET {path} → {status}: {json.dumps(data)[:300]}")
        return data


def token_from(args) -> str | None:
    if args.token_from_mcp:
        config = json.load(open(os.path.expanduser("~/.claude.json"), encoding="utf-8"))
        server = (config.get("mcpServers") or {}).get(args.token_from_mcp)
        if not server:
            sys.exit(f"No MCP server \"{args.token_from_mcp}\" in ~/.claude.json")
        token = (server.get("env") or {}).get("OSCT_EDITOR_TOKEN")
        if not token:
            sys.exit(f"The MCP server \"{args.token_from_mcp}\" has no OSCT_EDITOR_TOKEN")
        return token
    return os.environ.get("OSCT_EDITOR_TOKEN")


# --- mapping sheets to scenes ---------------------------------------------------------------------------------------

def label_pages(label: str) -> tuple[int, ...] | None:
    """The page numbers a scene's label names (`4–5` → (4, 5), `1` → (1,)), None for any other label"""
    match = LABEL_PAGES.match(label or "")
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2))) if match.group(2) else (int(match.group(1)),)


def close(a: float, b: float) -> bool:
    return abs(a - b) <= EPS


def map_sheets(sheets: list[dict], scenes: list[dict]) -> tuple[dict, list[dict]]:
    """sheet id → { scene, how }; and the notes for sheets / scenes left out"""
    notes: list[dict] = []
    by_pages = {}
    for index, scene in enumerate(scenes):
        pages = label_pages(scene.get("label", ""))
        if pages:
            by_pages.setdefault(pages, []).append(index)
    mapping: dict[str, dict] = {}
    anchors: list[tuple[int, int]] = []  # (sheet index, scene index)
    for i, sheet in enumerate(sheets):
        pages = tuple(sheet.get("pages") or ())
        if not pages:
            continue
        found = by_pages.get(pages, [])
        if len(found) == 1:
            mapping[sheet["id"]] = {"scene": scenes[found[0]]["id"], "how": "pages"}
            anchors.append((i, found[0]))
        else:
            notes.append({"sheet": sheet["id"], "why": f"pages {list(pages)}: {len(found)} scenes with that label"})
    # The unnumbered runs between two anchors (and before the first / after the last), paired in order
    bounds = [(-1, -1)] + anchors + [(len(sheets), len(scenes))]
    used_scenes = {a[1] for a in anchors}
    for (s0, c0), (s1, c1) in zip(bounds, bounds[1:]):
        run_sheets = [i for i in range(s0 + 1, s1) if not sheets[i].get("pages")]
        run_scenes = [j for j in range(c0 + 1, c1) if j not in used_scenes and not label_pages(scenes[j].get("label", ""))]
        if not run_sheets and not run_scenes:
            continue
        if len(run_sheets) != len(run_scenes):
            for i in run_sheets:
                notes.append({"sheet": sheets[i]["id"], "why": f"{len(run_sheets)} unnumbered sheets against {len(run_scenes)} unnumbered scenes here"})
            continue
        for i, j in zip(run_sheets, run_scenes):
            mapping[sheets[i]["id"]] = {"scene": scenes[j]["id"], "how": "order"}
    mapped_scenes = {m["scene"] for m in mapping.values()}
    for scene in scenes:
        if scene["id"] not in mapped_scenes:
            notes.append({"scene": scene["id"], "why": "no sheet of the layout"})
    return mapping, notes


def surface_crop(sheet: dict, surface: dict, page_width: float) -> tuple[float | None, str]:
    """Where the surface lies on its sheet: the x (mm) of its left edge, or None and why not"""
    sw, sh = sheet["widthMm"], sheet["heightMm"]
    if not close(surface["heightMm"], sh):
        return None, f"surface {surface['widthMm']} × {surface['heightMm']} mm against sheet {sw} × {sh} mm"
    if close(surface["widthMm"], sw):
        return 0.0, "whole"
    if close(surface["widthMm"] * 2, sw):
        pages = sheet.get("pages") or []
        if len(pages) == 1:  # one printed page on a double sheet: odd right, even left
            return (page_width if pages[0] % 2 else 0.0), ("right half" if pages[0] % 2 else "left half")
        return None, "the surface is half the sheet, and which half is not known"
    return None, f"surface {surface['widthMm']} mm wide against sheet {sw} mm"


def side_offset(sheet: dict, side: str, page_width: float) -> float | None:
    """x (mm) of the page a layout target lies on, from the sheet's left edge"""
    if side == "right":
        return page_width if sheet["widthMm"] > page_width * 1.5 else 0.0
    return 0.0 if side in SIDE_OFFSET else None


# --- the plan -------------------------------------------------------------------------------------------------------

def plan(layout: dict, config: dict, scene_list: dict | None, args) -> dict:
    page_width = float(layout.get("page", {}).get("width", 230))
    sheets = layout["sheets"]
    sheet_by_id = {s["id"]: s for s in sheets}
    scenes = config["scenes"]
    scene_by_id = {s["id"]: s for s in scenes}
    mapping, map_notes = map_sheets(sheets, scenes)
    sheet_of_scene = {m["scene"]: sid for sid, m in mapping.items()}

    references_now: dict[tuple[str, str], dict] = {}
    for scene in (scene_list or {}).get("scenes", []):
        for surface in scene.get("surfaces", []):
            if surface.get("reference"):
                references_now[(scene["id"], surface["id"])] = surface["reference"]

    places, problems = [], []
    seen = set()
    for entry in config["entries"]:
        target = entry.get("target")
        if not target:
            continue
        tid = target["id"]
        seen.add(tid)
        enabled = target.get("enabled") is not False
        base = {"target": tid, "entry": entry["id"], "scene": entry["scene"], "enabled": enabled}
        printed = layout["targets"].get(tid) or layout["targets"].get(entry["id"])
        if not printed:
            problems.append({**base, "why": "not in layout.json"})
            continue
        sheet = sheet_by_id.get(printed.get("sheet") or "")
        if not sheet:
            problems.append({**base, "why": f"layout sheet {printed.get('sheet')!r} unknown"})
            continue
        printed_scene = mapping.get(sheet["id"], {}).get("scene")
        if printed_scene != entry["scene"]:
            problems.append({**base, "why": f"printed on sheet {sheet['id']} (scene {printed_scene}), the entry is in scene {entry['scene']}", "sheet": sheet["id"]})
            continue
        scene = scene_by_id[entry["scene"]]
        surfaces = scene["surfaces"]
        if len(surfaces) != 1:
            problems.append({**base, "why": f"the scene has {len(surfaces)} surfaces; this tool places on single-surface scenes only"})
            continue
        surface = surfaces[0]
        crop, how = surface_crop(sheet, surface, page_width)
        offset = side_offset(sheet, printed.get("surface", ""), page_width)
        if crop is None or offset is None:
            problems.append({**base, "why": how if crop is None else f"layout surface {printed.get('surface')!r} unknown"})
            continue
        x = round(printed["x"] + offset - crop, 1)
        y = round(printed["y"], 1)
        w, h = round(printed["width"], 1), round(printed["height"], 1)
        place = {"x": x, "y": y, "width": w, "height": h}
        flags = []
        if x < -EPS or y < -EPS or x + w > surface["widthMm"] + EPS or y + h > surface["heightMm"] + EPS:
            flags.append("outside the surface")
        if not (crop <= printed["x"] + offset + w / 2 <= crop + surface["widthMm"]):
            flags.append("on the other half of the sheet")
        if printed.get("page") not in (sheet.get("pages") or [printed.get("page")]):
            flags.append(f"page {printed.get('page')} not on sheet {sheet['id']}")
        current = target.get("place")
        if current and all(close(float(current.get(k, -1e9)), place[k]) for k in place) and current.get("surface") in (None, surface["id"]):
            action = "same"
        elif current:
            action = "replace" if args.replace_places else "skip (has a place)"
        else:
            action = "set"
        if len(surfaces) > 1:
            place = {"surface": surface["id"], **place}
        places.append({**base, "sheet": sheet["id"], "side": printed.get("surface"), "page": printed.get("page"),
                       "place": place, "cropMm": crop, "current": current, "action": action, "flags": flags})
    for tid in sorted(set(layout["targets"]) - seen):
        problems.append({"target": tid, "why": "in layout.json, but no target of the draft"})

    references = []
    for scene in scenes:
        sid = sheet_of_scene.get(scene["id"])
        for surface in scene["surfaces"]:
            base = {"scene": scene["id"], "surface": surface["id"], "sheet": sid}
            if not sid:
                references.append({**base, "action": "none", "why": "no sheet"})
                continue
            sheet = sheet_by_id[sid]
            crop, how = surface_crop(sheet, surface, page_width)
            if crop is None:
                references.append({**base, "action": "none", "why": how})
                continue
            existing = references_now.get((scene["id"], surface["id"]))
            action = ("replace" if args.replace_references else "skip (has one)") if existing else "set"
            references.append({**base, "cropMm": [crop, crop + surface["widthMm"]], "crop": how, "existing": existing, "action": action,
                               "source": "imageSharp" if sheet.get("imageSharp") else "image"})
    return {"mapping": mapping, "mapNotes": map_notes, "places": places, "problems": problems, "references": references,
            "pageWidth": page_width}


# --- images ---------------------------------------------------------------------------------------------------------

def sheet_image(layout_dir: str, sheet: dict, pdf, pdf_index: int | None, max_side: int) -> tuple[Image.Image, str]:
    """The sharpest image of a sheet there is: imageSharp, else the PDF page (--pdf), else image"""
    if sheet.get("imageSharp"):
        return Image.open(os.path.join(layout_dir, sheet["imageSharp"])).convert("RGB"), "imageSharp"
    if pdf is not None and pdf_index is not None and 0 <= pdf_index < len(pdf):
        page = pdf[pdf_index]
        zoom = max_side / max(page.rect.width, page.rect.height)
        import pymupdf  # noqa: PLC0415 – only with --pdf
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples), f"pdf page {pdf_index + 1}"
    return Image.open(os.path.join(layout_dir, sheet["image"])).convert("RGB"), "image (1200 px)"


def crop_to(image: Image.Image, sheet: dict, crop_mm: list[float]) -> Image.Image:
    if crop_mm[0] <= 0 and crop_mm[1] >= sheet["widthMm"] - EPS:
        return image
    k = image.width / sheet["widthMm"]
    return image.crop((round(crop_mm[0] * k), 0, round(crop_mm[1] * k), image.height))


def fit(image: Image.Image, max_side: int) -> Image.Image:
    scale = max_side / max(image.size)
    if scale >= 1:
        return image
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


def font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def contact_sheet(layout_dir: str, sheet: dict, scene: dict, places: list[dict], crop_mm: float, page_width: float, path: str):
    """The sheet image with every computed place drawn on it (green enabled, orange switched off)"""
    image = sheet_image(layout_dir, sheet, None, None, 0)[0]
    image = fit(image, 2000)
    k = image.width / sheet["widthMm"]
    draw = ImageDraw.Draw(image, "RGBA")
    label_font = font(max(12, round(image.width / 110)))
    if sheet["widthMm"] > page_width * 1.5:
        draw.line([(page_width * k, 0), (page_width * k, image.height)], fill=(0, 120, 255, 140), width=2)
    for p in places:
        x, y, w, h = (p["place"][key] for key in ("x", "y", "width", "height"))
        box = [(x + crop_mm) * k, y * k, (x + crop_mm + w) * k, (y + h) * k]
        colour = (0, 170, 60) if p["enabled"] else (235, 120, 0)
        draw.rectangle(box, outline=colour + (255,), width=3, fill=colour + (40,))
        text = p["target"]
        tx, ty = box[0] + 2, max(0, box[1] - label_font.size - 4)
        bbox = draw.textbbox((tx, ty), text, font=label_font)
        draw.rectangle([bbox[0] - 2, bbox[1] - 1, bbox[2] + 2, bbox[3] + 1], fill=(255, 255, 255, 220))
        draw.text((tx, ty), text, fill=colour + (255,), font=label_font)
    head = f"{scene['id']} ← {sheet['id']} · {len(places)} targets ({sum(p['enabled'] for p in places)} enabled, green; switched off orange)"
    canvas = Image.new("RGB", (image.width, image.height + 40), "white")
    canvas.paste(image, (0, 40))
    ImageDraw.Draw(canvas).text((10, 10), head, fill=(20, 20, 20), font=font(20))
    canvas.save(path)


# --- PDF cross-check (optional, --pdf) ------------------------------------------------------------------------------

def cross_check(pdf, sheets: list[dict], places: list[dict]) -> dict:
    """Whether the PDF page of each target's sheet has an image box at the target's place (within 1.5 mm)"""
    pt = 25.4 / 72
    index = {s["id"]: i for i, s in enumerate(sheets)}
    boxes: dict[int, list] = {}
    found, missing = 0, []
    for p in places:
        i = index[p["sheet"]]
        if i >= len(pdf):
            missing.append(p["target"])
            continue
        if i not in boxes:
            boxes[i] = [[v * pt for v in info["bbox"]] for info in pdf[i].get_image_info()]
        x = p["place"]["x"] + p["cropMm"]
        box = [x, p["place"]["y"], x + p["place"]["width"], p["place"]["y"] + p["place"]["height"]]
        if any(all(abs(a - b) <= 1.5 for a, b in zip(box, other)) for other in boxes[i]):
            found += 1
        else:
            missing.append(p["target"])
    return {"pdfPages": len(pdf), "sheets": len(sheets), "withImageBox": found, "withoutImageBox": missing}


# --- apply ----------------------------------------------------------------------------------------------------------

def apply(api: Api, book: str, result: dict, out: str) -> dict:
    log = {"places": [], "references": [], "failed": 0}
    q = urllib.parse.quote
    for p in result["places"]:
        if p["action"] not in ("set", "replace"):
            continue
        status, data = api.call("PUT", f"/editor/books/{q(book)}/targets/{q(p['target'])}", {"place": p["place"]})
        ok = status == 200
        log["places"].append({"target": p["target"], "status": status, **({} if ok else {"error": data})})
        log["failed"] += 0 if ok else 1
    for r in result["references"]:
        if r["action"] not in ("set", "replace") or not r.get("file"):
            continue
        raw = open(r["file"], "rb").read()
        name = f"{r['scene']}_{r['surface']}.webp"
        query = urllib.parse.urlencode({"fit": "reference", "scene": r["scene"], "surface": r["surface"]})
        status, data = api.call("POST", f"/editor/books/{q(book)}/assets?{query}", raw=raw,
                                headers={"Content-Type": "image/webp", "X-File-Name": q(name)})
        if status not in (200, 201):
            log["references"].append({"scene": r["scene"], "surface": r["surface"], "step": "upload", "status": status, "error": data})
            log["failed"] += 1
            continue
        url = data["asset"]["url"]
        status, data = api.call("PUT", f"/editor/books/{q(book)}/scenes/{q(r['scene'])}/surfaces/{q(r['surface'])}/reference", {"url": url})
        ok = status == 200
        log["references"].append({"scene": r["scene"], "surface": r["surface"], "url": url, "status": status, **({} if ok else {"error": data})})
        log["failed"] += 0 if ok else 1
    json.dump(log, open(os.path.join(out, "apply-log.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return log


# --- report ---------------------------------------------------------------------------------------------------------

def write_report(out: str, result: dict, meta: dict) -> None:
    places, problems, refs = result["places"], result["problems"], result["references"]
    count = lambda items, **kw: sum(1 for i in items if all(i.get(k) == v for k, v in kw.items()))  # noqa: E731
    totals = {
        "targets": len(places) + count(problems) - sum(1 for p in problems if "entry" not in p),
        "placed": len(places), "placedEnabled": count(places, enabled=True), "placedDisabled": count(places, enabled=False),
        "notMappable": sum(1 for p in problems if "entry" in p), "layoutOnly": sum(1 for p in problems if "entry" not in p),
        "flagged": sum(1 for p in places if p["flags"]),
        "placeActions": {a: count(places, action=a) for a in sorted({p["action"] for p in places})},
        "referenceActions": {a: count(refs, action=a) for a in sorted({r["action"] for r in refs})},
        "sheetsMapped": len(result["mapping"]),
    }
    json.dump({"meta": meta, "totals": totals, **result}, open(os.path.join(out, "report.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    lines = [f"# Target places and surface references from the layout ({meta['book']})", "",
             f"{meta['when']} · {'APPLY' if meta['apply'] else 'dry run'} · API {meta['api']} · draft {meta['build']} (schema {meta['schema']}) · layout {meta['layout']}", "",
             f"Layout made from: {json.dumps(meta.get('layoutSource'), ensure_ascii=False)}", "",
             "## Totals", "", "| | |", "|---|---|"]
    lines += [f"| {k} | {json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else v} |" for k, v in totals.items()]
    if meta.get("crossCheck"):
        cc = meta["crossCheck"]
        lines += ["", f"PDF cross-check ({meta['pdf']}): {cc['withImageBox']} of {len(places)} places have an image box of the PDF within 1.5 mm (a PDF other than the layout's own source differs where the layout changed); "
                  f"without: {len(cc['withoutImageBox'])} {cc['withoutImageBox'][:40]}"]
    lines += ["", "## Sheet → scene", "", "| sheet | kind | pages | scene | how |", "|---|---|---|---|---|"]
    for sheet in meta["sheets"]:
        m = result["mapping"].get(sheet["id"], {})
        lines.append(f"| {sheet['id']} | {sheet['kind']} | {sheet.get('pages') or ''} | {m.get('scene', '–')} | {m.get('how', 'not mapped')} |")
    if result["mapNotes"]:
        lines += ["", "Not mapped:", ""] + [f"- {json.dumps(n, ensure_ascii=False)}" for n in result["mapNotes"]]
    lines += ["", "## Targets not mappable", ""]
    lines += [f"- `{p['target']}` ({'enabled' if p.get('enabled') else 'switched off' if 'enabled' in p else '–'}, scene {p.get('scene', '–')}): {p['why']}" for p in problems] or ["None."]
    flagged = [p for p in places if p["flags"]]
    lines += ["", "## Placed, but flagged", ""]
    lines += [f"- `{p['target']}` on {p['scene']}: {', '.join(p['flags'])} – {p['place']}" for p in flagged] or ["None."]
    lines += ["", "## Surface references", "", "| scene | surface | sheet | crop | source | action | existing |", "|---|---|---|---|---|---|---|"]
    for r in refs:
        lines.append(f"| {r['scene']} | {r['surface']} | {r.get('sheet') or '–'} | {r.get('crop', r.get('why', ''))} | {r.get('source', '')}"
                     f"{' → ' + r['size'] if r.get('size') else ''} | {r['action']} | {(r.get('existing') or {}).get('name', '')} |")
    lines += ["", "## Places per scene", ""]
    by_scene: dict[str, list] = {}
    for p in places:
        by_scene.setdefault(p["scene"], []).append(p)
    for scene_id, items in by_scene.items():
        enabled = [p for p in items if p["enabled"]]
        disabled = [p for p in items if not p["enabled"]]
        lines.append(f"### {scene_id} ({items[0]['sheet']}) – {len(enabled)} enabled, {len(disabled)} switched off")
        lines.append("")
        for title, group in (("enabled", enabled), ("switched off", disabled)):
            if group:
                lines.append(f"- {title}: " + "; ".join(
                    f"`{p['target']}` {p['side']} → x {p['place']['x']}, y {p['place']['y']}, {p['place']['width']} × {p['place']['height']} ({p['action']})" for p in group))
        lines.append("")
    if meta.get("applyLog"):
        log = meta["applyLog"]
        lines += ["## Apply", "", f"{len(log['places'])} places and {len(log['references'])} references sent, {log['failed']} failed (apply-log.json)."]
    open(os.path.join(out, "report.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--layout", required=True, help="the content's layout/ folder (layout.json, sheets/)")
    parser.add_argument("--api", required=True, help="the API's base, e.g. https://osct.porschuetz.de/api")
    parser.add_argument("--book", default="osct")
    parser.add_argument("--out", required=True, help="the report folder")
    parser.add_argument("--token-from-mcp", help="read OSCT_EDITOR_TOKEN from this MCP server's env in ~/.claude.json")
    parser.add_argument("--apply", action="store_true", help="write the places and references through the API")
    parser.add_argument("--replace-places", action="store_true", help="also replace places that differ")
    parser.add_argument("--replace-references", action="store_true", help="also replace existing surface references")
    parser.add_argument("--no-references", action="store_true", help="targets only")
    parser.add_argument("--no-places", action="store_true", help="references only")
    parser.add_argument("--reference-max-side", type=int, default=2048, help="px (the API stores a reference at most 2048 px)")
    parser.add_argument("--webp-quality", type=int, default=85)
    parser.add_argument("--contact-sheets", default="auto", help="scene ids, comma separated, or auto (6 scenes) or none")
    parser.add_argument("--pdf", help="optional: the book's PDF (one page per sheet, in order) – a cross-check of the places, "
                                      "and the image of sheets without a sharp one")
    args = parser.parse_args(argv)

    layout = json.load(open(os.path.join(args.layout, "layout.json"), encoding="utf-8"))
    api = Api(args.api, token_from(args))
    book = urllib.parse.quote(args.book)
    latest = api.get(f"/editor/books/{book}/draft/latest.json")
    config = api.get(f"/editor/books/{book}/draft/{latest['build']}/game.config.json")
    scene_list = api.get(f"/editor/books/{book}/scenes")
    os.makedirs(args.out, exist_ok=True)

    result = plan(layout, config, scene_list, args)
    if args.no_places:
        result["places"] = []
    if args.no_references:
        result["references"] = []

    pdf = None
    if args.pdf:
        import pymupdf  # noqa: PLC0415
        pdf = pymupdf.open(args.pdf)
    sheet_by_id = {s["id"]: s for s in layout["sheets"]}
    sheet_index = {s["id"]: i for i, s in enumerate(layout["sheets"])}

    ref_dir = os.path.join(args.out, "references")
    os.makedirs(ref_dir, exist_ok=True)
    for r in result["references"]:
        if r["action"] == "none":
            continue
        sheet = sheet_by_id[r["sheet"]]
        image, source = sheet_image(args.layout, sheet, pdf, sheet_index[r["sheet"]], args.reference_max_side)
        image = fit(crop_to(image, sheet, r["cropMm"]), args.reference_max_side)
        path = os.path.join(ref_dir, f"{r['scene']}_{r['surface']}.webp")
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=args.webp_quality, method=4)
        open(path, "wb").write(buffer.getvalue())
        r.update(file=path, source=source, size=f"{image.width} × {image.height}", bytes=len(buffer.getvalue()),
                 sha256=hashlib.sha256(buffer.getvalue()).hexdigest()[:16])

    sheet_dir = os.path.join(args.out, "contact-sheets")
    os.makedirs(sheet_dir, exist_ok=True)
    by_scene: dict[str, list] = {}
    for p in result["places"]:
        by_scene.setdefault(p["scene"], []).append(p)
    if args.contact_sheets == "auto":
        ranked = sorted(by_scene, key=lambda s: -len(by_scene[s]))
        most_enabled = sorted(by_scene, key=lambda s: -sum(p["enabled"] for p in by_scene[s]))
        picks = [s for s in [next(iter(by_scene), None), ranked[0] if ranked else None, most_enabled[0] if most_enabled else None,
                             "s086-087", "s146-147", list(by_scene)[-1] if by_scene else None] if s in by_scene]
        picks = list(dict.fromkeys(picks))[:6]
    elif args.contact_sheets == "none":
        picks = []
    else:
        picks = [s for s in args.contact_sheets.split(",") if s in by_scene]
    scene_by_id = {s["id"]: s for s in config["scenes"]}
    for scene_id in picks:
        items = by_scene[scene_id]
        sheet = sheet_by_id[items[0]["sheet"]]
        crop = surface_crop(sheet, scene_by_id[scene_id]["surfaces"][0], result["pageWidth"])[0] or 0.0
        contact_sheet(args.layout, sheet, scene_by_id[scene_id], items, crop, result["pageWidth"], os.path.join(sheet_dir, f"{scene_id}.png"))

    meta = {"book": args.book, "api": args.api, "build": latest["build"], "schema": latest.get("schema"), "layout": args.layout,
            "when": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "apply": args.apply, "pdf": args.pdf,
            "sheets": [{"id": s["id"], "kind": s["kind"], "pages": s.get("pages")} for s in layout["sheets"]],
            "contactSheets": picks, "layoutSource": layout.get("source")}
    if pdf is not None:
        meta["crossCheck"] = cross_check(pdf, layout["sheets"], result["places"])
    if args.apply:
        meta["applyLog"] = apply(api, args.book, result, args.out)
    write_report(args.out, result, meta)

    t = json.load(open(os.path.join(args.out, "report.json"), encoding="utf-8"))["totals"]
    print(json.dumps(t, ensure_ascii=False))
    print(f"report: {os.path.join(args.out, 'report.md')}")
    if args.apply:
        print(f"applied: {len(meta['applyLog']['places'])} places, {len(meta['applyLog']['references'])} references, {meta['applyLog']['failed']} failed")
        return 1 if meta["applyLog"]["failed"] else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
