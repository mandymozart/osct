# Concept – scenes instead of pages

Status: concept agreed with Tilman, 2026-11-17 (all open questions decided). Epic: #307. Where it fits: `STRATEGY.md` (a white-label core; formats beyond
cover and back; flows between scenes). Codebase analysis of 2026-11-17: summary in "Today" below.

> Tilman: "in the end the index is nothing more but an ordered list of scenes … and I could just reorder them without
> breaking the app, or the editor or the assignments … the overview is a scene overview of an experience. Book is a
> general term … BF and Kévin Bray already requested follow-up experiences beyond the one book – so this concept is
> crucial."

## Terms

| Term | What it is | Today |
|---|---|---|
| **Experience** | The whole thing a reader goes through: an ordered list of scenes. A book is one kind; a wall, a room or an exhibition are others. | book |
| **Scene** | One step of the experience: a stable, invisible id, a title, an order, a layout of surfaces, its targets and AR content, its entries. Reordering scenes never breaks anything. | spread |
| **Surface** | One physical area of a scene: a left page, a right page, a cover, a wall, an object. It has a size (mm), a **label** written exactly as printed (`41`, `ii`, `Cover`, or none), and an optional **reference image**. | page (by number) |
| **Layout** | How a scene's surfaces relate: **fixed** (side by side as a double page – or **three** when a fold-out opens, any number in a row; front/back; stacked) or **free** (each surface on its own anchor – a page and a wall ahead; a **room** with many surfaces; placed in the room later with world tracking, #299). A wall can be a scene by itself or one surface of a room scene. | `format` (spread / cover / back), `matter` |
| **Label** | Free text, never arithmetic. On a surface (`41`), a scene (`Pages 40–41`), a group (`Front matter`). The reader shows the most specific one. | page numbers, derived titles |
| **Group** | Several scenes under one label (`Front matter`, `Back matter`, a chapter, a room): **a stop of the reader's bottom switcher** (today's spread switcher) and **one loading window** – every target of the group is ready. A scene without a group is a stop of its own. The group tool shows the group's label and **how many targets** it holds (against the engine's limits). | – (internal pages −4…−1) |
| **Reference image** | A picture dropped onto a surface (or across a fixed layout): the guide for placing targets and AR content; the scene's thumbnail. Editor only, never shown to readers. | page images (#251), print layout sheets |

## Rules

1. **Order is the scene's position in the list.** Nothing derives order from a number. Moving a scene changes its
   position only.
2. **Everything links by id.** An entry belongs to a scene (and optionally to one of its surfaces); a target lies on a
   surface; links (`/spread/<id>` → `/scene/<id>`), reading progress (`lastSpreadId`), credits and the change log use ids.
3. **Labels are what is printed.** They never renumber. Inserting a scene asks nothing of any other scene.
4. **A scene stays within the engine's limits**: 4 images tracked at a time, at most 10 targets (RULES #3). A group's
   loading window covers the group; the editor warns when a group's total gets too big and splits the window by order.
5. **Content spanning surfaces** only where their relation is known: a fixed layout, or a free one measured in the room
   (#299).
6. **A scene has as many surfaces as it needs** – one (a cover, a wall), two (a double page), three (a fold-out: the
   two-page scene becomes a three-pager), many (a room). Nothing assumes two.
7. **The print import is one source among others.** It creates scenes, surfaces, labels and reference images from the
   layout PDF – nothing in the editor depends on it.

## Today (analysis 2026-11-17, ~30 linking sites in ~20 files)

- *Since schema 2.35 (phase 1):* an entry's optional `scene` decides its spread (`engine/src/content/scenes.ts`
  `sceneIdOf`), the build and the draft write it on every entry, the server's import honours it. Everything below still
  derives from the page – the editor, the API's add/put, renumbering.
- *Since phase 2 (server):* the API keeps scenes – order by position, `entries.spread_id` as the truth, surfaces / labels
  / groups stored, nothing renumbers, print-first books take scenes too. The bullets below describe the state before it
  for the server; the editor's own derivations and the page images remain for phase 3.
- The content ties an entry to its spread **only** through `EntryData.page` (required). The guard
  (`shared/guards/game-config.ts:264`), the engine (`engine/src/content/game-config.ts:312 spreadForPage`, which
  throws on an unmatched page), the content build, the server import, `addEntry`/`putEntry` and MCP `get_spread` all
  derive the spread from the page range. `entries.spread_id` in the database is only a cache of that.
- Inserting or deleting a spread **renumbers** every later spread, entry, `print.page` and page image
  (`Books::renumber`, `Pages::shift`/`drop`), with a change per row.
- Spread **ids are already stable** (never renamed; `s004-005` may hold pages 6–7 after a renumber) and **order is
  already stored apart** (`spreads.position`, the config's array order) – but `Pages::reorder`, the build's entry sort,
  credits, "All by page" and the Library order recompute it from pages.
- Page images are keyed by `(page, facing)`; the print layout (`layout.json`, `sheetForSpread`) and the Python delivery
  scripts match by page; derived titles (`Pages 12–13`) are written into the content.
- No editor or API action moves a spread; print-first books can't add, delete or reformat spreads at all (#238).

## The change

### Content contract (shared/, schema MINOR first, MAJOR later)
- **MINOR (e.g. 2.35)** – only additions an older app can skip (RULES #10):
  - `SpreadData` (the scene): `surfaces?: SurfaceData[]` (`id`, `side`/`role`, `widthMm`, `heightMm`, `label?`),
    `layout?: "fixed" | "free"`, `group?: string`, `label?` (the title stays).
  - `EntryData.scene?: string` (the scene id) and `surface?: string`. **When set, it wins over `page`.**
  - `GroupData[]` at the root (`id`, `label`).
  - The server and the build keep **writing** `page`, `firstPage`, `lastPage` – derived from order and labels – so
    shipped apps still read the book. `print.page` stays carried, unused.
- **MAJOR (later, when no older app matters)**: `page`/`firstPage`/`lastPage` become optional, then go; the guard
  stops requiring them; `OLDEST_READABLE_SCHEMA_MAJOR` moves.

### Engine and reader
- `spreadForPage` → the entry's `scene` (fallback: page for old content). Neighbours, preloading and the loading window
  by order and group.
- The scroller shows scenes and groups by their labels; the entries list's page column shows the surface label; "All"
  sorts by scene order. Links `/scene/<id>` (old `/spread/<id>` still resolves). Progress keeps ids.

### Server and data
- Database: `spreads.position` is the order (no recompute from pages); new tables or JSON for surfaces, labels,
  groups; `entries.scene_id` (set once from today's `spread_id`), `entries.surface`.
- New actions: **add scene** (pick a layout: single, double, cover, wall …; anywhere in the order), **move scene**
  (drag), **delete scene** (impact list, two steps), **change layout** – for print-first and digital-first alike
  (#238's restriction goes: a scene is no page of a print run).
- `renumber`, `Pages::shift`/`drop`, `matter` internal pages: retired. Page images (#251) become **surface reference
  images** (migrated once by page → surface).
- Names by use (#298): `<scene>_<surface-label>.webp` instead of `page-118.webp`.

### Editor

**Layout decided (Tilman, 2026-11-17): the Scenes panel is a filmstrip under the stage** – `agents/design/scenes-filmstrip.html`
(a scene open; a group selected while a scene is dragged). The scene's tree keeps the left column, the Inspector the right;
the strip shows every scene as a thumbnail with its label and target count, groups as bands over their scenes (click a
band = the group in the Inspector: label, switcher stop, targets against the loading window, its scenes, Ungroup);
drag along the strip to reorder, Shift/Ctrl to pick, Ctrl+G / Ctrl+Shift+G; the panel collapses and resizes; a zoom for
long experiences. It is the row of stops the reader's bottom switcher shows. Earlier drafts (options A–E):
`scene-open.html`, `scene-open-2.html`. First draft: `agents/design/scenes-panel.html` (static, the editor's dark tokens; open it in a browser). The scene
organisation lives in a **Scenes panel** of the editor – like SCUTOONS' chapter tree (groups → their slices, grips to
reorder, Shift/Ctrl to pick several, a group's own settings), which SCUTOONS will in turn inherit from here.
**Grouping (Tilman, 2026-11-17)**: a **group icon** in the panel's toolbar groups the picked scenes; **Ctrl+G** groups,
**Ctrl+Shift+G** ungroups (the scenes stay in place, in order).

- **Scene overview** replaces the spreads overview and the Pages view: cards with the reference image (or a
  thumbnail made from the placed targets and content), drag to reorder, groups as headed sections, add/delete/layout
  in the card's menu.
- **Reference image in the scene**: drop an image onto a surface in the Inspector or on the stage; scaled to the
  surface, aligned left / right / across a fixed layout.
- Entry and target forms: a **scene/surface picker** instead of the "access page" number (today editing the page is
  what moves an entry).
- Labels editable per surface, scene and group.

### MCP and scripts
- MCP: `list_scenes`, `add_scene`, `move_scene`, `set_surface` (label, reference image), `add_entry { scene, surface }`;
  page-based tools stay as aliases while old books exist.
- Delivery import and layout scripts write scenes, surfaces, labels and reference images; matching by page stays
  inside the importer only.


**Phase 3c – corrections (Tilman, 2026-11-18)** – done in 1.102.0: the group toggle, the wheel, auto-scaled cards, "self", the group link, "Surface labels"; done in 1.103.0: post-processing / appearance behind the settings, passes per scene, the Spread section out; still open: **the environment per scene** – it needs a content field (a schema MINOR) and a server field; today it stays the book's, in the Environment tab: post-processing and appearance are experience-wide → behind the
experience settings button (gear); environment and passes per scene as a child of the scene's parameters; the "Spread"
section goes (a double page is two surfaces); "Surfaces" → "Surface labels"; group "self" instead of "its own stop", the
group as a link; Group/Ungroup one toggle (folder / folder-minus icons, shortcuts only in the tooltip); the mouse wheel (up/down, no Shift) and
the arrow keys scroll the strip sideways; resizing the panel scales the cards (no zoom buttons), with a minimum height. Details: #307.

## Migration of `osct` (and the demo)
1. Every spread becomes a scene with its id and position; surfaces from `firstPage`/`lastPage` (labels = printed page
   numbers; matter and facing halves: no label or as printed); groups `Front matter` / `Back matter`.
2. Every entry gets `scene` = its `spread_id`, `surface` from its page.
3. Page images (#251) → surface reference images; layout sheets stay as the reference where no image is set.
4. A check: the reader's content before and after has the same entries per scene and the same targets.

## Phases
1. [x] **Contract MINOR + engine/reader read `scene`** (old content keeps working) – the safe base. Done 2026-11-17:
   schema 2.35 (`docs/content.md` "Scenes, surfaces, labels and groups"); `engine/src/content/scenes.ts`; the reader's
   labels; the build and the draft write `scene`. Left for phase 2: writing `surfaces`/`label`/`group`/`groups` anywhere
   (no writer fills them yet – only hand-made content has them), the editor's own page→spread derivations, MCP tools.
2. [x] **Server: scenes, order, surfaces, labels, groups; migration**; stop renumbering. Done 2026-11-17: `Scenes.php`
   (docs/server.md "Scenes"), `books.groups_json`, the routes `…/scenes`, `…/scenes/move`, `…/scenes/migrate`, `…/groups`;
   entries take `scene` / `surface`; print-first books take scenes too; nothing renumbers. Older apps read a scene's stored
   range while the order allows, else one derived from the order (`Scenes::ranges`), every entry's page inside it. MCP
   tools (`list_scenes`, `add_scene`, `move_scenes`, `put_scene`, `group_scenes`, `ungroup`, `migrate_scenes` …) came with
   it. Left: the migration on staging (the orchestrator, after Tilman saw the plan); page images → surface references
   (phase 3).
3. [~] **Editor: scene overview, reference images, pickers**; the Pages view goes. 3a done 2026-11-17: the Scenes panel
   (filmstrip under the stage, `ScenesPanel.svelte` / `SceneCards.svelte` / `scene-strip.ts`), the book page's scene
   cards with groups, drag, group / ungroup, add from presets, remove; the Inspector's group and scene / surfaces
   (docs/editor.md "The Scenes panel"). Left for 3b: reference images, the scene/surface pickers, removing the Pages view.
4. **MCP and importers**.
5. **Groups as loading windows**; free layouts with world tracking after #299.
6. **MAJOR**: drop the page fields when no older app needs them.

## Surfaces: create, edit, place (#314, decided 2026-11-18)

Tilman chose a **Surface mode** and **everything now** – walls and free layouts included, which brings in the scene
coordinate system of #316 (part 2; the per-surface grid of #316 part 1 stays open).

- **Contract 2.36 (done, 1.112.0):** `SurfaceData.place` (`SurfacePlace`: `x`, `y`, `z` mm, `rx`, `ry`, `rz` degrees) in
  the **scene's coordinate system** – one for the whole scene: origin on the table at the middle of the first row of
  surfaces (a double page: the spine), +x right, +y up, +z towards the reader; unrotated a surface lies flat face up, its
  top edge away from the reader; a wall ahead is `rx` 90. `fixed` scenes derive their places (a row, flat) and ignore
  `place`; `free` scenes use it. `PrintPlacement.surfaceId` names a target's surface by id (wins over the side words in
  `print.surface`, which older guards insist on).
- **Server (worker):** reference images per surface – editor-only, never in the content: a `surface_references` table
  (book, scene, surface → url, name, fit), in the scenes overview as `surfaces[].reference`, set / replace / remove by
  `PUT …/scenes/{id}/surfaces/{surface}/reference`, change-logged and revertable (#312); the page images (#251) migrate
  to references (plan → apply, by page → scene / surface, `page_images` kept); `checkSurfaces` takes `place`; asset usage
  and renames (#298) count references; MCP `set_surface_reference` and the migration tool.
- **Stage (worker):** the mock stage draws a scene **from its surfaces**: a fixed row of any length (a fold-out's three),
  covers, each at its own size; free scenes each surface at its `place` (a wall stands); each surface shows its reference
  image (else the layout sheet as today, else paper); the scene's axes at the origin and a scene grid; targets lie on
  their surface (`surfaceId`, else the side); picks, the placement ghost and snapping work per surface.
- **Surface mode (done, worker – in Unreleased):** a Surface tool (S) in the toolbar – the stage outlines the surfaces, a click selects one;
  the Inspector shows it (label, side, size, place and a gizmo in a free scene, reference image, remove); the Tree has a
  Surfaces level with + surface (page / wall / custom); the scene section adds, removes and reorders.

## Open questions (Tilman)
- [x] The word in the UI and the API: **"scene" everywhere** (Tilman, 2026-11-17) – UI, API, MCP, links `/scene/<id>`, code
  and content types (`SceneData`); "spread" survives only as an alias for old links and content, and RULES #2's term
  "spread" changes with it.
- [x] Surface sizes: **per scene** – a scene has a few surfaces, each with its own size (Tilman, 2026-11-17).
- [x] Thumbnails: **the reference image; without one, generated** from the placed targets and content (Tilman, 2026-11-17).
- [x] Groups: **what the reader's bottom switcher (today's spread switcher) steps through** – one stop per group, and its
  loading window (Tilman, 2026-11-17). Flows (`STRATEGY.md`: a goto from scene to scene) link scenes, not groups.
