# Import and export as one feature: the experience package, quick starts, the Start page

Concept, 2026-11-22 (#346). Design drafts: `agents/design/import-export.html` (open it in a
browser; `#start`, `#pdf`, `#images`, `#package`, `#export`, `#public`, `#public-preview`; the head switches day/night).

Tilman, 2026-11-22: *"make it a real import/export feature (we should have all the basics). zip file is the goal. self
containing. can be used to transfer content between installations. like the cdn import of connected instances. import
can also have a basic pdf import or image import with drag and drop for quick starters. […] part of the New experience
or start experience section. […] a page that is eventually publically available so we can use it for marketing and
quick start."*

## 1. What exists (develop 4.8.1)

| Piece | Where | What it does |
|---|---|---|
| Import form | `editor/src/lib/ImportForm.svelte` beside the experiences | a game configuration from the instance's CDN, a URL (file or content base) or a `game.config.json` file; preview (`POST /editor/import/preview`), then the version comparison and confirmation over an existing id (`POST …/import`, 409 `confirm-import`) |
| Export read | `GET /editor/experiences/{id}/export[?build=]` (`Export.php`) | configuration (draft or build), every file with URL/content path/size/sha256, plugin sources, credits, layout |
| `osct content export` | `scripts/src/lib/content-export.ts` | writes the content source folder (YAML, `EXPORT.md`, `export.json`) and downloads the media |
| Export archive | `ExportArchive.php` | on every publish the same folder **without media** into the store (`exports/<build>/`) |
| Deliveries | `Deliveries.php`, `osct delivery import`, MCP `preview_delivery`/`import_delivery` | a plan of scenes/entries/targets from a publisher's delivery, compared and applied as one change |
| Assets API | `POST …/assets` | upload with sha256 dedupe, browser WebP (`browser-webp.ts`) |
| Page → scene rule | `scripts/src/lib/delivery-plan.ts` | facing pages as one scene, page 1 and the last alone |

What is missing: a **file** that carries an experience with its media from one installation to another, and a way to
start from nothing but a PDF or a few pictures. Today a transfer needs the source's CDN to be reachable (URL / content
base) and the media stay on the source's CDN (the import keeps the paths, RULES #36) – the target installation depends
on the source living on.

## 2. The experience package (zip)

### Contents

```
<experience-id>-<build|draft>.zip
  package.json            the manifest (below) – read first, the only file the import needs before it decides
  game.config.json        the built configuration, its files as /assets/content/… paths (RULES #36)
  assets/content/…        every file the configuration names, at its content path (a Library upload gets one too)
  plugins/<id>/index.ts   the Code tab's sources
  source/                 the content source folder exactly as `osct content export` writes it (experience.yaml,
                          scenes/, entries/, entities/, groups.yaml, credits.yaml, EXPORT.md, export.json) – readable,
                          diffable, the input of `osct content build`; its files point into ../assets/content/
  cover.webp              the cover the import shows before it opens anything else
```

`package.json`:

```json
{
  "format": "xr-experience-package", "formatVersion": 1,
  "schema": "5.1", "app": "4.9.0",
  "experience": { "id": "osct", "title": "Onion Skin & Crocodile Tears", "book": { "author": "Kévin Bray" } },
  "content": { "from": "draft" | "build", "build": "53099b9d32d8", "exportedAt": "2026-11-22T10:00:00Z" },
  "source": { "instance": "https://osct.porschuetz.de" },
  "counts": { "scenes": 92, "entries": 210, "targets": 188, "entities": 14, "plugins": 14, "files": 1240 },
  "files": [{ "path": "assets/content/entries/12/target.webp", "size": 81234, "sha256": "…", "type": "image/webp" }],
  "hashes": { "configuration": "sha256 of game.config.json", "source": "sha256 over source/ (sorted)" }
}
```

- **Self-contained**: nothing in it points to the source installation; `source.instance` is information only. No
  person, no account, no token, no history (RULES #33/#34: an export names no one – like the archive).
- **Both forms in one zip**: `game.config.json` is what the import endpoint takes today (fast, no build in the browser);
  `source/` is the readable form (the same as the export archive and `osct content export`). If `source/`'s hash no
  longer matches the manifest (someone edited the YAML by hand), the editor says so and imports the configuration; the
  CLI (`osct package import`) builds the source instead. Decision 1.
- Media stored, not compressed again (zip *store*): images, video and glb are compressed already; the zip stays fast to
  write in a browser and can be streamed.
- Name neutral for the white label: `xr-experience-package`, a plain `.zip` (decision 2).

### Export (the basics)

Where: the experience's menu (top bar) → **Export…**, and on the Start page's experience cards (… → Export).

- Choose **what**: the draft, or a published build (list of builds with environment and date – from the publish log).
- Shows what goes in: scenes, entries, targets, plugins, files with their total size, files that could not be found
  (`unknown` in the export read – listed, the export still runs, the manifest records them as missing).
- **Download** writes the zip in the browser from `GET …/export` (files fetched one after another, streamed into the zip –
  no zipping on the shared host, its time limit and 64 MB request limit stay out of it). Progress bar with files and MB,
  Cancel. On a browser that has the File System Access API the zip streams straight to disk (videos make a book ~1–2 GB);
  elsewhere it is assembled from a Blob of parts.
- CLI twin: `osct package export --experience osct [--build …] [--out …]` (the content export + the zip).
- MCP: none for now – a person downloads (decision 5).

### Import (the basics)

Where: the Start page's drop zone (drop anything) and **Import a package** in it.

1. **Read the manifest** in the browser (only `package.json` and `cover.webp` are unpacked). Checks before anything is sent:
   format and format version, schema (older → migrated on import as the server already does for older imports; newer
   than this installation → refused: "made with a newer version – update this installation first"), files listed vs. in
   the zip, sizes.
2. **Where it goes** (decision 3):
   - **As a new experience** – the default when the id is free; when it is taken, the default is a new id
     (`osct-2`, editable) and title ("… (copy)"). A transfer of a template between installations is this case.
   - **Replace the draft of `<id>`** – the existing comparison step (`confirm-import`): what comes in against what the draft
     is based on, edits since, confirm.
3. **Upload the files** through the Assets API, deduplicated by sha256 (a second run uploads nothing; an interrupted import
   continues). Progress per file, Cancel. Videos larger than the instance's `ASSET_MAX_BYTES` are listed before the upload
   starts, not after 400 MB of others.
4. **Import the configuration** (`POST …/import` with the configuration and the uploaded files' URLs as its `files` map –
   the import endpoint already takes `files`), one change in the history ("Imported package …"), revertable like any.
5. Done: open the experience; the stage shows the first scene (RULES #36's check: a scene's targets show their images).

"Like the CDN import of connected instances": the **From another installation** tab keeps today's URL/content-base and CDN
modes beside the package, and gets one more button – *Fetch as package* – which downloads the other installation's
published build into a package on the server side of the browser (the files come from its CDN, the result is the same as
a dropped zip, so the new installation no longer depends on the old CDN). Decision 4.

### Server changes

- `POST …/import` learns **import as** (`{ as: { id, title } }`): the configuration's experience id and its store paths are
  rewritten to the new id. Today an import always takes the configuration's id.
- `files` map on import: a package's file → the uploaded asset's URL (exists for single files, check that it covers all of
  the configuration's paths; else the configuration's paths are rewritten in the browser before sending – RULES #36 says
  imports keep content paths, so the server variant is preferred).
- `GET …/export` gains `builds` (the publish log's builds of the experience) for the export dialog's list.
- No zip on the server (the shared host). A Kamal host could zip later – not needed.

## 3. Quick starts: PDF and images

Both run **in the browser** and end in the same thing: a **delivery plan** (`Deliveries.php`'s plan – scenes, entries,
targets, uploaded files) sent to a **new** experience. One server path for the CLI's deliveries and the quick starts.

### From a PDF

- Drop a PDF (or choose one). pdf.js renders every page in the browser (a worker; pdf.js is a new dependency of the
  editor – decision 6).
- **Page format** from the PDF's page box (mm) → the experience's book format (#60's geometry, the surfaces' size).
- **Pages → scenes** with the delivery's page → scene rule (facing pages as one scene, page 1 and the last alone), or
  *one page per scene* (posters, flyers), or *all pages in one scene* (≤ 10 targets).
- Per page: its render as the **surface reference** (the stage shows the printed page) and – switched on by default – as
  an **image target** (the reader recognises the page). Pages with little detail (a white page, mostly text) are marked
  *weak target* by the existing recognition check and left off.
- The preview shows the scenes as a strip of spreads; a page can be switched off before creating.
- Title from the PDF's metadata or the file name; editable.
- Limits: 200 pages, 100 MB (decision 7); pages rendered at 1600 px on the long side, WebP by the shared image rule.

### From images

- Drop images (JPEG, PNG, WebP; a folder works in Chromium). Each image becomes an **image target** with an empty entry.
- **Arrange**: *each image its own scene* (default – a poster series, an exhibition) or *together* (filled into scenes of at
  most 10 targets, `MAX_TARGETS_PER_SCENE`). Order by file name, drag to reorder.
- Recognition quality per image (the existing check) shown on the tile; weak ones are switched off, not dropped.

### Blank and template

- **Blank**: the coming *new experience* (id, title, format) – the Start page's first card.
- **From a template**: the demo package (`fixtures/demo` exported as a package, shipped with the editor or read from the
  CDN). The same import path as any package – a template is just a package (decision 8).

## 4. The Start page

### In the editor (signed in)

The editor's start (`routes/(app)/+page.svelte`) becomes two parts:
- **Start an experience** – one row of cards: *Blank* · *From a PDF* · *From images* · *Import a package* · *From another
  installation*, plus *Template* when one is there. The whole page is a drop target: a PDF goes to the PDF start, images
  to the images start, a zip to the package import. Choosing a card opens its flow in the right column (where the import
  form sits today), not a new route.
- **Experiences** – the covers as today, each with a … menu (Open · Export… · Duplicate (= export + import as new, in the
  browser) · later Delete).
- The AI connections stay below the experiences.

### Public (white label, later)

A route outside the editor's sign-in, e.g. `/start/` (decision 9), with the instance's own name and look (the white-label
theme, #52):
- One headline, one drop zone ("Drop a PDF or images – see your print come alive"), three steps, examples.
- Dropping a file runs the **same quick start in the browser**, without an account: pdf.js renders, the plan and the
  preview of the scenes are built locally; **nothing leaves the device** until the visitor signs in ("Keep it" → sign-in
  by mail, then the files upload and the experience is created in their new account). A first AR look without an account:
  the preview shows a QR code / link that opens the reader on a phone with the plan held in the page (a session-only
  preview, the visitor's own phone; decision 10 – may come later than the page).
- Accounts on a public instance: today accounts are made by an admin. A public Start page needs **self sign-up** (an
  account with one experience and quotas: files, MB, publish off until confirmed). That is a decision of its own for the
  white label (#53) – the page can ship first as the editor's Start page and become public once sign-up exists.

## 5. Decisions for Tilman (recommendation first)

1. **Package contents**: configuration + media + the readable source folder in one zip (recommended) · only configuration +
   media (smaller to build, but a second format next to the export) · only the source folder (one format, but the editor
   would need the content build in the browser).
2. **Format name and file name**: neutral `xr-experience-package`, `<id>-<build>.zip` (recommended, white label) · `.osct`
   extension.
3. **An import whose id is taken**: default *as a new experience* with a new id, *replace* only by choice with the comparison
   (recommended) · default *replace*.
4. **"From another installation"**: keep URL / CDN import and add *fetch as package* (recommended) · replace the URL import by
   packages only.
5. **MCP**: no package tools for now (recommended – a person downloads and drops) · `export_package` / `import_package`.
6. **pdf.js in the editor** (Mozilla, Apache-2.0, ~1 MB, loaded only on the PDF start) – yes (recommended) · PDF quick start
   only in the CLI (PyMuPDF, as `prepare-delivery`).
7. **Quick start limits**: 200 pages / 100 MB PDF, 60 images (recommended for a start).
8. **Templates**: the demo as a package, shipped as a file on the CDN (recommended) · no templates yet.
9. **The public page's path**: `/start/` on each instance (recommended) · a separate marketing site that embeds it.
10. **Phone preview without an account**: later, after the page (recommended) · part of the first public version.

## 6. Tickets (after the decisions)

| # | Ticket | Size | Depends on |
|---|---|---|---|
| P1 | Package format: `shared/api/package.ts` (manifest type, checks), `osct package export/import` (CLI), round-trip test (export → import into the test DB → export, same hashes) | M | – |
| P2 | Server: import *as* a new id; `files` map for every path; `builds` in the export read; API tests | M | – |
| P3 | Editor: Export dialog (draft/build, contents, streaming zip, progress, cancel) | M | P1 |
| P4 | Editor: package import (manifest preview, checks, as new / replace with comparison, uploads with dedupe and resume) | L | P1, P2 |
| P5 | Editor: Start page – cards, the page as a drop target, flows in the right column, experience … menu (Export, Duplicate); *Blank* joins with the new-experience ticket | M | P3, P4 |
| P6 | Quick start from images → delivery plan → new experience | M | P5 |
| P7 | Quick start from a PDF (pdf.js worker, format from the page box, page → scene rule moved to `shared/`, surface references and targets) | L | P6 |
| P8 | Template: the demo as a package on the CDN, the *Template* card | S | P4 |
| P9 | *Fetch as package* from another installation | S | P4 |
| P10 | Docs: `docs/editor.md` (Start, import, export), the docs site's tutorials (#336), `docs/content.md` (package format) | S | P3–P7 |
| P11 | Public `/start/` (white label): route without sign-in, local quick start, *Keep it* → sign-in → create; needs self sign-up (#53) | L | P7, decision 9, sign-up |
