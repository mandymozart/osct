# Editor: the authors' tool at /editor

The editor is a SvelteKit app of its own (`editor/`, served at `/editor` next to the reader) for the people who make
the book's content: it runs the **engine** – the same AR scene the reader renders – over a **simulated page** instead
of a camera picture, so an entity (model, video, image, chroma key) can be placed and tuned at the desk, on the desktop
or on a phone, saved to the instance's database and published as a content version. The reader carries nothing of it
(RULES #32); the three parts are described in `agents/research/2026-10-29-editor-architecture.md`.

```
engine/   the base: content runtime + AR scene (three.js), no routes, no accounts, no UI
client/   the reader: the engine with the 8th Wall tracker
editor/   the editor: the engine with the mock tracker and its stage, the panels, saving, publishing
server/   the instance's API: /api/editor/* (docs/server.md "Editor data")
```

## Who may use it

An **instance user** of the accounts API with the role `editor` (the instance is Building Fictions; the reader's
accounts are the same table). An admin gives the role:

```bash
curl -X POST -H "X-Admin-Secret: $OSCT_SECRET" -H "Content-Type: application/json" -d '{"email":"name@example.com"}' https://osct.porschuetz.de/api/admin/editors
```

The editor signs in like the reader (a code by email, or a password the account set) and refuses everyone without the
role.

## Try it (the morning test with the demo scene)

The fixture's **studio spreads** (`fixtures/content/FIXTURE.md`, pages 28–31: every entity type, placement and filter)
are the demo scene. Locally, with SQLite and the local content store:

1. `server/api/config.local.php` (not committed, copy of `config.local.php.example`): `DB_SQLITE_PATH`, a `SECRET`,
   `MAIL_TRANSPORT => 'log'` with `MAIL_LOG_PATH`, `CONTENT_STORE => 'local'`, and the dev servers in
   `ALLOWED_ORIGINS` (`http://localhost:5175, http://localhost:5174`).
2. The reader with the fixture: `cd client && OSCT_CONTENT_DIR=fixtures/content npm run content && npm run dev:http -- --port 5174`.
3. The API: `cd client && npm run dev:api` (127.0.0.1:8080). Make yourself an editor with the curl above against
   `http://127.0.0.1:8080/api/admin/editors`.
4. The editor: `cd editor && npm install && npm run dev` → http://localhost:5175/editor/ (its `/api` is proxied to
   the dev API). Sign in: the code is in the mail log.
5. **Import a book…** → *URL* `http://localhost:5174/src/game.config.json` (the reader's dev server serves its bundled
   configuration), *assets at* `http://localhost:5174` → Import. The book appears with its spreads.
6. Open *Studio A – models*: the stage shows the spread's targets with their entities. Move the tree in the **Entity**
   tab (type a scale, or press and slide), **Save**, then **Publish** to `local`.
7. The reader reads the published version when it is started with
   `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` (`latest.json` names the new build).

On staging the same flow runs against the CDN: `CONTENT_STORE=bunny` with the storage zone's credentials in the
`staging` GitHub environment ([deploy](deploy.md)); *Import a book… → the CDN* takes the current version, publishing
writes a new one, and the staging reader sees it on its next start.

## What is on the stage

The **mock stage** (`editor/src/lib/stage/mock-stage.ts`) draws, in the same three.js scene as the entities: a table,
the open book as an object – two blocks of paper on a dark cover board that overhangs the pages by 3 mm, the block's
thickness an approximation from the number of spreads (0.15 mm a sheet, half on each side, 3–40 mm) – and the current
spread's printed images. Every plane lies a hair (0.5 mm) under the one above it: the entities sit at the target's
own plane (z = 0, as the tracker reports it), the printed image one layer below, the sheet's image below that, so
nothing flickers. The printed images:

- with the **book's layout** (`content/layout/`, imported from the designed PDFs – [content guide](content.md),
  "Importing the book layout"): the spread's sheet as laid out is the page's texture, and every target lies exactly
  where it is printed, in its printed size, on its own page (left or right). Leafing with ‹ › shows the next sheet.
  The covers are in the layout too (`cover-front`, `cover-back`) for works that place targets there;
- without the layout but with the **trigger protocol** (`/trigger-protocol.json`, `npm run protocol`): blank pages
  in the book's page format (230 × 320 mm, a constant), each image in its printed size in the region its `position`
  names (`top left` …) on the right page, several in one region stacked;
- without either (the fixture): the images in a row across the middle of the right page, 60 mm wide.

Every target lies flat on the page and counts as **found**: the **mock tracker** (`stage/mock-tracker.ts`) implements
the engine's `IImageTracker` and reports each pose every frame exactly as the 8th Wall engine would (1 unit = the
printed width, origin in the image's centre, the image in the x/y plane), so `ArScene`, the entities, the animations
(reveal, unlock, outro), the bloom and the tap on an entity run unchanged. The three.js camera stays at the origin;
moving the view moves the stage and the anchors together, which is why entity and page can never drift apart.

The editor simulates the game around the scene (`stage/stage.svelte.ts`): which spread is open, which targets the
"camera" sees, which were found for the first time (the unlock animation plays once per target, *replay* plays it
again). Nothing of the reader's store, progress or routes is involved.

## The app

- **Books** (`/editor/`): the instance's books, *Import a book…* (the CDN's current version, a `game.config.json` by
  URL or file; *assets at* = where its `/assets/content/…` paths resolve – every draft and publish points there, no
  media is copied).
- **Spreads** (`/editor/<book>/`): the spreads as cards with the sheet of each as its preview (from the book's layout
  at *assets at*; without a layout the cards are text), their entries, targets and AR count; **Publish** with the
  environment (`local`, `staging`, `production` – production asks).
- **Workspace** (`/editor/<book>/<spread>/`): the **tree** at the left, the stage, and one panel at the right on a
  desktop; on a phone the stage fills the screen and the panel is a sheet at the bottom whose head is the tab row
  (closed = the row only) with the tree as its first tab. The bar: × back to the spreads, ‹ › (also ← →) through the
  spreads, the spread's title, the tabs.
  - **Tree** – the spread in the style of Blender's outliner: a chevron column, a type icon before every name (book,
    entry, target, group / model / video / image / text), guide lines per depth, zebra rows, and the **eye** in a
    column at the right (shown = found; off = reported lost, as the Stage panel's chips). Rows: the spread, its
    entries in page order, each entry's target ("in view" while the camera sees it) and the target's entity as its
    **node tree** – the root node (● while the stage shows it with other values than the draft's; the shared ref) and
    its children, as deep as the content nests them. A tap on a node selects it and opens the Entity panel; a tap on
    the stage selects the root. ↑ ↓ walk the targets, ← → fold and unfold, Enter selects. Entries and nodes fold;
    the column collapses to its bar (‹ ›, kept on the device).
  - **The gizmo** – on the stage, three.js `TransformControls` on the selected node (the tree's or the stage's
    selection): **move / rotate / scale** by the toolbar at the top left or **W / E / R**, handles in the node's own
    space, so a drag changes the node's placement **relative to its parent** – the Entity panel's rows follow live,
    Save writes them. **Ctrl** snaps (0.05 target widths, 15°, 0.1). **Hover** draws a thin box around the entity
    under the pointer and shows the pointer cursor; a tap selects it (a click that ends a drag does not). The
    tracker lets the gizmo's gestures through (`MockTracker.ignorePointer`); the engine opens the running scene to
    such tools with `IArScene.inspect()` (scene, camera, canvas, frame hook, a node's object by its path, the tap's
    hit test) – the reader never calls it.
  - **Stage** – the simulated camera: **view** *reader* (35 cm above the page, tilted 30°), *top*, *low* (75° – shows
    how flat a video plane is), *far*; on the stage **drag** orbits, **Shift + drag**, the **middle button** or **two fingers** pan (the looked-at
    point moves in the page plane), **wheel / pinch** change the distance, **double tap** returns to the reader's view (a free orbit is shown next to the presets and kept on the device). **found**:
    one pressed chip per target (◉ = in view) – off reports it lost (outro), on found again (reveal); the replay arrow
    plays the first find again. **shake**: 0 = still, 1 = a hand holding a phone. **backdrop**: *table*, *paper*,
    *photo* of your own desk (the camera button; long side 1600 px, stored on the device).
  - **Entity** – the target and the selected **node** of its entity (the head says `node · root › 1 › 0 · model`),
    **+ node** (type, and for model / video / image a file from the book's assets – appended as a child of the
    selected node, or as the root of a target without AR content), **remove node** / **remove entity**; then every
    placement value (relative to the parent node), a text node's text and colour, and every filter parameter of the
    node as rows of one control height: position, rotation and scale with X, Y, Z side
    by side as in Blender (the chain icon at the end of the scale row links the axes: pressed = one `scale` field, as
    Blender's lock), choices as a segmented group, colours as a
    swatch + hex whose swatch opens the editor's **colour popover** (after Scutoons': a palette of the usual keys and
    the book's gold, this browser's recent colours, a saturation / brightness area with a hue slider, the hex, and
    the eyedropper that **picks from the stage** – the colour under the pointer in a chip, a tap takes it, Esc
    cancels; the sampled pixel is the rendered one, lit and tone-mapped), a reset arrow while a value differs from the type's default, ● on rows that differ from the draft.
    Changes show live on the stage; **Save** writes the entity to the API – the shared entity when the target refers
    to one (the head says `shared: <ref> (n×)`), else the target's own – and the stage rebuilds from the draft;
    **Back to the draft** drops them. Save writes the **whole tree**. Rows come from the content contract's
    definitions (`PLACEMENT_PARAMS`, `FILTERS`): a new filter or parameter needs no panel code.
- Settings (view, orbit, backdrop, photo, shake, the open tab, the tree open or collapsed) are stored per device; the
  session token too.

### UI rules

The editor follows the Scutoons UI dogma (`scutoons/agents/DESIGN.md`) in its own CSS (`editor/src/app.css`), not
the reader's design tokens: a design tool's default palette – day (white, light greys, near-black text) and night
(dark greys, white text), following the system, forced with `data-scheme` on `<html>` – and **no colour** but the
danger red; one control height (`--control-height`, 1.75rem), square corners, compact system type; rows with a label
column; numbers as `ScrubNumber` (the whole field is the gesture: press and slide, Shift ×10, Alt ×0.1, tap to type,
↑ ↓, Enter, Escape, the reset arrow inside the field – no native sliders, no native colour picker: the colour popover
in the top layer); small enums as segmented pressed pills;
on / off per item as a pressed chip; Feather icons only where a word makes no sense (step, replay, photo, close, the
chain that links the scale axes) – and in the tree, where type icons and the eye are every outliner's convention
(Blender, Unity, Figma); each with a name and a tooltip; the sheet closes to its head row. Brand UI (gold, serif) stays in the reader – the stage
itself renders the reader's content unchanged. Texts are English (RULES #20).

## Where the code lives

| Piece | Where | Notes |
|---|---|---|
| The engine | `engine/src/` | `content/` (loader, accessors, `contentUrl`), `scene/` (`ArScene`, entities, trackers), `types/`, `utils/`; compiled by the app that imports it (`@engine/*`) |
| The reader's scene | `client/src/components/ar-bridges/ar/index.ts` | `createReaderScene()`: the engine with the 8th Wall tracker (`engine/src/scene/xr8-tracker.ts`) and the reader's graphics options |
| The editor's stage | `editor/src/lib/stage/` | `stage.svelte.ts` (the simulation, owns the gizmo), `gizmo.ts` (TransformControls, hover), `mock-tracker.ts`, `mock-stage.ts`, `preview.ts` (view, orbit, pan, backdrop, hidden targets), `stage-layout.ts` |
| Draft and session | `editor/src/lib/content.svelte.ts`, `session.svelte.ts`, `api.ts` | the draft through the engine's loader (`baseUrl` = the draft endpoint, `assetsBase` = the import's), the token for its requests |
| Panels and controls | `editor/src/lib/panels/`, `components/`, `values.ts` | Tree, Stage, Entity; `ScrubNumber`, `Segmented`, `Icon`; the rows from the contract |
| Routes | `editor/src/routes/` | `+page` (sign-in, books, import), `[book]/`, `[book]/[spread]/` |
| The API | `server/api/src/Books.php`, `ContentVersion.php`, `ContentStore.php`, `Editor.php` | [server](server.md) "Editor data" |
| Book layout import | `scripts/layout/extract-layout.py` | sheets and printed geometry from the designed PDFs |

Tests: the engine's next to its code (`engine/src/**/__tests__`, run by the reader's vitest), the editor's stage tests
(`editor/src/lib/stage/__tests__`, `npm test` in editor/), the API test (`server/tests/api-test.php`, the editor flow
included). CI builds and checks the editor (`checks.yml`, job *Editor*); the image builds it next to the reader
(`Dockerfile`), Apache sends `/editor/*` to its `index.html` (`client/public/.htaccess`).

## Limits of this step

- Entities only (as node trees – new nodes take files the book already has): texts, entries, targets and new media
  are edited in the content source and imported again (the import keeps the logs). Uploading media and transcoding
  stay with the content build. Components and the book's own code (plugins) are phase 15 steps 3–4.
- One page format and the `book` layout template; the templates of the concept (`sheet`, `cover`, `sleeve`, `wall`)
  come with the content (issues #60, #61).
- The plugin API (content schema 2.0, code in the editor) is phase 15 steps 3–4 (`agents/PLAN.md`).
- The phone layout of the workspace (the sheet) is built but was checked on the desktop only; the bunny store against
  the real zone and MariaDB against the new tables are untested (SQLite and a storage double in the API test).
