# Book geometry from the designed PDF: page format and printed target positions in the content

2026-10-28, proposal (Tilman asked for the concept while deciding #59). Meant as a GitHub issue in Proposals (label `decide`); kept here until it is filed.

Tilman, 2026-10-28 (while deciding #59): "das Buch kann ich vorab vom designten PDF einlesen. Dafür brauchen wir ein Konzept, wie das ins Content-Repo mit reinkommt." The mock stage (#59) lays the current spread's targets on a page of the book's format; today it only knows each target's printed size and a coarse position (`printed: { width, height, position: top left }` from the delivery mapping, `trigger-protocol.json`). The designed PDF knows everything exactly.

## What the PDF holds

`All_Triggers.pdf` (delivery 2110, `osct-incoming-content/extracted/2110/`): 129 pages, each one **spread of the book, 460 × 320 mm** (page 230 × 320 mm), page numbers at the foot, every trigger as an image at its **printed position and size**. Read with a PDF library (image bounding boxes per page): e.g. book page 4 has one image 30.9 × 23.3 mm at 38.7 / 9.5 mm from the spread's top left corner, one 49.0 × 17.7 mm at 155.5 / 287.0 mm. The page numbers on each PDF page give the book pages; the mapping (`scripts/import/2110.yaml`) already knows which delivered file is which target and its printed size, so images can be matched to targets by page and size.

## Where it goes in the content (proposal)

1. **Book format** in `book.yaml` (new optional field, content schema MINOR): `format: { page: [230, 320] }` in mm. The default when missing stays the mock stage's constant.
2. **Printed geometry per target** in `entry.yaml` under `target` (optional): `printed: { x: 38.7, y: 9.5, width: 30.9, height: 23.3 }` in mm from the **page's** top left corner (not the spread's, so a target does not care whether its page is left or right; the spread knows its pages). Replaces the coarse `position` word of the mapping; the mapping's `printed` moves into the content where it belongs, and `trigger-protocol.json` is generated from the content instead of the mapping.
3. **Import step** in the osct CLI: `osct import layout <All_Triggers.pdf>` reads the image boxes per page (pdfjs-dist or a Python helper like the trial reports use), matches them to the entries of that page (one image → the page's only target; several → by printed size from the mapping, else in reading order), writes `printed` into each `entry.yaml`, and reports pages whose images it could not match. Re-run on a new delivery, like the delivery import (RULES #8: never by hand).
4. **Who reads it**: the mock stage (#59) places targets exactly; the trial panel's protocol and reports get exact positions; later the spread page / editor can show a page map.

## Open (decide)

- Content or mapping? The proposal says content (the printed layout is a fact about the book, not about one delivery). Alternative: keep it in `scripts/import/<delivery>.yaml` and the generated protocol only – no schema change, but the app never sees it.
- mm from the page's corner (proposal) or from the spread's?
- Do this before or after the final content arrives (Amsterdam, Phase 14)? The PDF will change with the final layout; the import is made to re-run.

Related: #59 (mock stage uses the data when present), #14 (trigger trial, printed sizes), the content editor research (`agents/research/content-editor.md`, page map).
