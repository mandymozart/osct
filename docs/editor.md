# Editor: the AR scene without a camera

The editor (`/editor`) is the authors' tool: the app's own AR scene over a **simulated page** instead of the camera
picture, so an entity (model, video, image, chroma key) can be placed and tuned at the desk – on the desktop or on
a phone – and the same scene code renders it that readers see. It is the first piece of the editor planned in
issue #61 (next: saving to the database, the plugin API, a code panel); the concept notes are in
`agents/research/2026-10-28-editor-data-model.md` and `2026-10-28-entity-components.md`.

## Opening it

- Address: `/editor` or `/editor/<spreadId>` (any build, also staging and production – the chunk loads only when the
  page opens; readers never download it). The debug overlay's `editor` button toggles between the editor and the
  reader's scan view.
- The camera is not asked for: while the editor is open the camera permission counts as granted
  (`CameraManager.setSimulated`), the scene starts with the **mock tracker** instead of the 8th Wall engine, and the
  debug line shows `P`.
- **exit** in the bar (or the Mark → consultation → Mark) returns to the reader's scan view with the real camera.
  Opening an entry from the editor (a tap on an entity) keeps the preview; the start page and the tutorial end it.

## What is on the stage

The **mock stage** (`client/src/components/ar-bridges/ar/mock-stage.ts`) draws, in the same three.js scene as the
entities: a table, the open book, and the current spread's printed images:

- with the **book's layout** (`content/layout/`, imported from the designed PDFs – [content guide](content.md),
  "Importing the book layout"): the spread's sheet as laid out is the page's texture, and every target lies exactly
  where it is printed, in its printed size, on its own page (left or right). Leafing with ‹ › shows the next sheet.
  The covers are in the layout too (`cover-front`, `cover-back`) for works that place targets there; a spread
  without pages that shows them comes with the layout templates of the concept (#60, #61).
- without the layout but with the **trigger protocol** (`/trigger-protocol.json`, `npm run protocol`): blank pages
  in the book's page format (230 × 320 mm, a constant), each image in its printed size in the region its `position`
  names (`top left` …) on the right page, several in one region stacked;
- without either: the images in a row across the middle of the right page, 60 mm wide (narrower when many).

Every target lies flat on the page and counts as **found**: the **mock tracker** (`ar/mock-tracker.ts`) reports its
pose every frame exactly as the engine would (1 unit = the printed width, origin in the image's centre, the image
in the x/y plane), so `ArScene`, the entities, the animations (reveal, unlock, outro), the bloom and the tap to open
an entry run unchanged. The three.js camera stays at the origin; moving the view moves the stage and the anchors
together, which is why entity and page can never drift apart.

## The bar and the preview panel

- **‹ ›** step through the spreads (the stage follows; `/editor/<spreadId>` in the address bar).
- **preview** – the panel:
  - **view**: *reader* (35 cm above the page, tilted 30° towards the reader), *top* (straight down, 30 cm), *low*
    (75° from the vertical – shows how flat a video plane is), *far* (70 cm). On the stage: **drag** orbits around
    the first target, **wheel / pinch** change the distance, **double tap** returns to the reader's view. A free
    orbit is shown in the panel and kept on the device.
  - **found**: one switch per target – off reports the target lost (outro), on found again (reveal). **unlock ↺**
    forgets every shown target's unlock in the progress and finds it anew: the unlock animation and the "New entry
    unlocked" label play again. (This writes the progress of the device the editor runs on – an editor-only progress
    comes with the accounts step of #61.)
  - **wobble**: 0 = still, 1 = a hand holding a phone (±2 mm, ±0.5°) – to see whether a filter edge flickers.
  - **backdrop**: *table*, *paper*, or *photo* – **photo…** takes a picture of your own desk (long side 1600 px,
    stored on the device); the table disappears, the book stays so the entity keeps its paper.
- **tune** – the tune panel (`docs/content.md`): every placement value and filter
  parameter of the spread's entities as slider and field, live on the stage, **Copy YAML** unchanged.

Settings (view, orbit, backdrop, photo, wobble) are stored per device under `osct-preview`.

## Where the code lives

| Piece | File | Notes |
|---|---|---|
| Preview flag and settings | `components/ar-bridges/utils/preview.ts` | three-free, main chunk; `setPreviewActive()` by the editor page |
| Mock tracker | `components/ar-bridges/ar/mock-tracker.ts` | implements `IImageTracker`; layout, camera orbit, wobble, input |
| Mock stage | `components/ar-bridges/ar/mock-stage.ts` | table, the sheet as laid out or blank pages, printed images; the photo backdrop |
| Book layout | `components/ar-bridges/utils/stage-layout.ts`, `scripts/layout/extract-layout.py` | sheets and printed geometry from the designed PDFs |
| Tracker choice | `components/ar-bridges/ar/ar-scene.ts` `ensureTracker()` | mock while the preview is active, engine otherwise; a change rebuilds the scene |
| Camera simulated | `store/managers/CameraManager.ts` | set by `<ar-bridge>` from the preview flag |
| Route and page | `router.ts`, `pages/editor-page.ts` | `/editor`, scan mode; the page loads the editor chunk |
| Editor chunk | `src/editor/` | the bar, the preview panel; defines the tune panel in every build |
| Trigger protocol | `components/ar-bridges/utils/trigger-protocol.ts` | shared with the trial panel |

Tests: `ar/__tests__/mock-tracker.test.ts` (layout, geometry, found / lost, pause, presets, the stage contract),
`utils/__tests__/preview.test.ts`, the camera manager, history and link tests.

## Limits of this step

- One page format and the `book` layout template (the sheets of the layout are its instances); the templates of the
  concept (`sheet`, `cover`, `sleeve`, `wall`) as spreads of their own and per-spread formats come with the content
  (issue #60, #61).
- Nothing is saved: the tune panel's YAML is copied by hand as before. Saving to the database is the next step.
- The editor's texts are English, like the dev tools (it is an authors' tool, not a reader's view – RULES #20).
- On the desktop the look-around world does not show (no device orientation); on a phone it does, placed by the
  simulated anchors.
