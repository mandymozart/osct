# Refactor #319 – the code speaks scenes (plan, step 1)

Status: **plan, for Tilman's answers** (2026-11-18). No code is changed until the questions at the end are answered.
Base: local `develop` at 24cd2918 (2.0.0, content schema 3.0). Branch `feature/319-internal-names`.

Content schema 3.0 made the **contract** scenes + surfaces (`agents/SCENES.md` "Schema 3.0", "Editor API 3.0"); the
server routes, the MCP tools, the editor's routes and storage keys already speak scenes. What is left is the code's
**own** names, which still speak the 2.x page / spread model, plus the dead code the 3.0 cut left. This is a pure
refactor: no behaviour changes except where a question below decides one (plugin API, behaviour scope, DB names).

## 1. Inventory (grep 2026-11-18, `node_modules`/`dist`/CHANGELOG/agents excluded)

"spread" (any case) – lines / files – the bulk of the work:

| Area | Lines | Files (tests) | Main identifiers (count of tokens) |
|---|---|---|---|
| engine | 524 | 47 (28) | `spread` 291, `spreadId` 154, `spreads` 94, `Spread` 28 (the app model type), `getSpreads` 18, `onSpreadSeen` 13, `currentSpreadId` 13, `TrackedSpread` 13, `spreadChanged` 12, `getSpread` 10, `cyclePreparedSpreadRange` 10, `wantedSpread` 9, `spreadById`, `spreadsByDistance`, `prepared-spreads` (file), `spreadTargets`, `setSpreadSource`, `spreadsAccessor`, `getPreparedSpreadRange`, `changeSpread`, `PluginSpread`, `SpreadTargets`, `spreadOf`, `spreadEntries`, `getInitialSpreadId`, `heldSpreads`, `allSpreads`, `prepareSpread`, `EngineSpread`, `SpreadCredits`, `SpreadContent`, `spreadSeen`, `startSpread`, `SPREAD_SEEN_MS`, `getNeighbourSpreads`, `preloadSpreads` |
| client (reader) | 626 (137 of them in `public/docs/tutorials/index.html`) | 72 (28) | `spread` 312, `spreads` 140, `spreadId` 111, `currentSpread` 59, `getSpreads` 48, `switchSpread` 24, `getSpread` 22, `Pages.SPREAD`, `SpreadManager` / `ISpreadManager` / `SpreadManagerState` (`store/managers/SpreadManager.ts`, `types/spreads.ts`), `spread-menu` / `spread-menu-loop` / `SpreadMenu`, `spread-page` / `SpreadPage`, `getInitialSpreadId`, `preloadSpreads` / `preloadSpread`, `cyclePreparedSpreadRange`, `getMenuSpreads`, `getSpreadContent`, `getSpreadCompletionPercentage`, `isSpreadComplete`, `spreadWithTargets`, `scrollToSpread`, `renderSpreadInfo`, `generateSpreadSummary`, `spreadTitle`, `newSpreadId`, `data-spread`, `no-such-spread` / `unknown-spread` (test ids), `demo-spreads` / `tools-spreads` (tutorial anchors and `02-spreads.webp`, `06-spreads.webp`) |
| editor | 703 | 86 (30) | `spread` 510, `spreadId` 173, `spreads` 81, `Spread` 14, `spreadImpact` / `SpreadImpact`, `addingSpread`, `openNewSpread`, `canAddSpread`, `spreadCreated`, `atLastSpread`, `spreadsOnBooks`, `selectSpread`, `spreadToStage` (snap.ts), `SearchSpread` / `spreadWhere` (book-search.ts), `onaddspread`, `TrackedSpread`, `bySpread`, `SpreadView.svelte`, `spreadChanged`, `heldSpreads`, `spreadOpenedAt`, `spreadLabel`, `spreadOn`, `PluginSpread`, `spreadMenu`, `selection.spread`, tree row kind `"spread"` (`tree-rows.ts`), `PassesSource "spread"`, `content.spreads` / `content.spread()`, frame protocol `spreadId`, `.spread` crumb class (TopBar), `plugin-api.d.ts` (generated) |
| server + DB | 106 | 14 | table `spreads` (+ FK `spreads_book_fk`), `entries.spread_id` (+ index `entries_spread`), `books.initial_spread_id`; ~35 SQL statements in `Books`, `Scenes`, `Reverts`, `AssetNames`, `ContentVersion`, `SurfaceReferences`, `Plugins`, `Removal`, `Migration3`; `api-test.php` 25 lines (`$draftSpreads`, `lastSpreadId` in a progress record, `Books::deleteSpread` in a doc comment) |
| scripts | 106 | 8 (2) | `convert-content-3.ts` 72 (`OldSpread`, `readOldSpreads`, `spreadPages`, `spreadOfPage` – the one-time 2.x→3.0 converter), `layout/render-layout.py` 32, `prepare-delivery.py` 7, `extract-layout.py` 1, `import-delivery.ts` 3, `import/2026-11-final.yaml` 2 |
| shared | 18 | 8 | **contract values**: behaviour scope `"spread"` (`BEHAVIOUR_SCOPES`), core event `"spreadChanged"` (`BEHAVIOUR_CORE_EVENTS`); comments in `plugins.ts`, `passes.ts`, `game-config.ts`, `api/errors.ts`, `api/rules.ts`, `text/entry-text.ts` (scope order `spread, stage, session, book`), `environment.ts` |
| mcp | 7 | 4 (3) | only tests and two comments – the tools are scene-named already |
| sandbox | 7 | 4 | `sandbox/reveal` (comments, one `spreadId`) |
| docs | 212 | 15 | `editor.md` 93, `tracking.md` 59, `content.md` 45, `plugins.md` 23 (`api.spread`, scope `spread`, `spreadChanged`, `content/spreads/the-twins/spread.yaml`), `pages.md` 14, `managers.md` 9, `game-store.md` 8, `server.md` 8, `mcp.md` 6, `components.md` 5, … ; `README.md` 1; `agents/RULES.md` #2 ("page group = **spread**"), #3 (`MAX_TARGETS_PER_SPREAD` – the constant is `MAX_TARGETS_PER_SCENE` already), #12 |
| fixtures | 93 | 72 | scene ids `spread1` … `spread14` (folder names in `fixtures/content/scenes/`, `scene: spreadN` in 28 entries), `fixtures/demo/plugins/tally` (`api.progress.counts(… target.spreadId …)`, choice `"spread"`, `spreadChanged`), `fixtures/demo/plugins/scenes` (var scope `"spread"`, emits its **own** event `sceneChanged`), `demo/layout/layout.json` (`"kind": "spread"` – a print sheet's kind, see below), `DEMO.md`, `FIXTURE.md` |

Total ≈ 2,100 code lines in ~240 files (≈ 110 of them tests), plus ≈ 350 lines of docs. (The ticket's "~440 sites" counted
identifiers in the reader only.)

**Page / print / matter / format / side in the old sense** – much smaller, most of it legit:

| Where | Old-sense names (rename) | Legit, stays |
|---|---|---|
| editor stage | `PrintBox` (placement.ts, 17), `printCentre`, `printedHeight`, `printStageBox`, `MIN_PRINT_WIDTH`, `DEFAULT_PRINT_MM`, `printBoxes`, `printedBoxes`, `printedPlanes`; `pageHit` / `PageHit` / `pageAt` (a hit on a surface), `pageLines` (snap.ts), `PAGE_MARGIN_MM` (mock-tracker), `PAGE_COLOR` / `PAGE_EDGE_COLOR` (mock-stage – paper), local `page` = the first surface's size in `mock-tracker.ts`; `EntityPanel` `printOpen` / `printPending` / `printEdits` (the placement section) | SvelteKit's `page` store, `frame-protocol`'s "page" (the parent web page), `printLift` (an appearance – the printed picture lifts off), "printed image" (`imageSrc`) |
| editor cards | `PAGE_MM` alias (surface-edit.ts) used as the **default card / cover aspect** in `SceneCards.svelte`, `ScenesPanel.svelte`, `(app)/+page.svelte`; `pageRatio` (scene-strip.ts `gridColumns`, `gridSpan`) | `SCENE_PAGE_MM` / `Scenes::PAGE_MM` / `BOOK_PAGE_MM` – the size of a printed page the `double` / `single` presets are made of: a real page |
| server + DB | `spreads.first_page`, `spreads.last_page`, `entries.page` (written as 0, read only by `Migration3`), table `page_images` (read only by `Migration3`), `spreads.title` (a copy of the label), `ContentVersion` skipping a `page` key, `Reverts` refusing `page` / `print` in a change | `Scenes::PAGE_MM` (the preset page), `sourceOfTruth: print` (#238: print first) |
| client | – (`pages/`, `PageRoute`, `pages-router`, `*-page` elements are the router's pages – web pages; `mark-the-page` is the design's name of the header button) | |
| engine | comments only ("the reader turned the page", "a neighbouring spread's page is in view") | `pageFps` (load test – the web page's frame rate), `pageUp` (card flight – the card's up vector) |
| scripts | `convert-content-3.ts` (dead after the conversion), `render-layout.py` (reads the 2.x source – open item in MEMORY) | the delivery import and `extract-layout.py` / `prepare-delivery.py`: Kévin's delivery **is** printed pages (`P<page>_Print_NN`, the mapping's pages) – their `page` / `firstPage` / `lastPage` are real print pages, mapped to scenes once |
| matter | server `Migration3` only (`MATTER_GROUPS`, `$matter`) | groups `front-matter` / `back-matter` are group ids, fine |
| format / side | none left outside `Migration3` (the 3.0 cut removed them) | `progress.format` (storage format), three.js `side: DoubleSide` |

**Names in the AR sense of "scene"** (the collision to settle before `Spread` becomes `Scene`): engine `ArScene`, `IArScene`,
`ArSceneEvents`, `SceneState` (idle / loading / ready / running – engine 17, client 42), `sceneState` (a plugin core event
and the editor's stage), `SCENE_STATES`, `SceneStateName`; client `scene-state.ts`, `getSceneState`, `applySceneState`,
`SCENE_STATE_BY_MODE`, CSS `scene-active`, `scene-container`, `LazyArScene`; plugin var scope `stage` = "while the AR scene
exists"; RULES #2/#12 say "the scene" for the AR scene. The `post/chain.ts` files and some tests import three.js `Scene`.

**Stored and external names** (renames that touch something outside the code):
- Browser storage: reader `osct-ar-prepared-spreads` (dev switch, `engine/src/utils/prepared-spreads.ts` `RANGE_KEY`); the
  editor's keys are scene-named already (`osct-editor-last-scene`, `osct-editor-scenes`, `osct-editor-surface-grids:<book>`).
  The progress record already writes `lastScene`. Unrelated compat keys seen on the way: editor `LEGACY_TOKEN_KEY`
  (`osct-editor-session`), `LEGACY_DESKS` (preview.ts).
- URLs: reader `/scene/<id>` and editor `/editor/<book>/<scene>/` are done; only the reader's route **param name**
  `spreadId` (router.ts, internal) is left.
- Messages: the editor ↔ stage frame protocol's `spreadId` (same build on both ends – internal).
- i18n: no key says spread; the **text** of `scan:scrollToActivate` does (en "Scroll to spread to activate content", de
  *Doppelseite*, fr *double page*, nl *dubbele pagina*). Other reader copy speaks of the printed book's pages – that is the
  book, not the model.
- Plugin authors: `api.spread` (`current`, `get`), `PluginSpread`, `target.spreadId` / `entry.spreadId`, core event
  `spreadChanged { spreadId, previous }`, var scope `"spread"`, `api.progress.completion(spreadId?)` / `counts(spreadId?)`
  (docs/plugins.md, the generated `editor/src/lib/plugins/plugin-api.d.ts`, `PLUGIN_API_VERSION` 1.8).
- Content contract: behaviour rules' `scope: "spread"` (the default) and `on: "spreadChanged"` (shared/types/behaviour.ts).
- Stored server data: the DB names above; `changes.kind = 'spread'` rows from before part B (History / revert); entities'
  and targets' behaviour rules in `data_json` with `scope: "spread"` / `on: "spreadChanged"`; plugin sources (`plugins`
  table) that use the plugin API names.

## 2. Naming map (old → new)

Terms (SCENES.md, MEMORY 2026-11-17/18, CHANGELOG 1.105.0): **scene** everywhere in code, API and content; **surface**,
**place** (a target's place on a surface; the reader's column word), **group**, **label**; **experience** is the UI word for
a book (editor UI only – the code, API, DB and content keep `book`, see Q6).

**Rule for the AR sense** (proposed, Q1): bare *scene* = the content's scene; the rendering side always carries `Ar`
(`ArScene`, `ArState`) – so `SceneState` → `ArState` and friends; the plugin-facing "stage" stays.

### engine + shared
| Old | New |
|---|---|
| type `Spread` (types/content.ts), `EngineSpread`, `SpreadContent`, `SpreadTargets` | `Scene`, `EngineScene`, `SceneContent`, `SceneTargets` (three.js `Scene` imported as `Scene as ThreeScene` where both meet) |
| `Entry.spreadId`, `Target.spreadId` | `sceneId` |
| `getSpreads`, `getSpread`, `getInitialSpreadId`, `getNeighbourSpreads`, `spreads`, `spreadById`, `spreadEntries`, `SpreadCredits { spread }` | `getScenes`, `getScene`, `getInitialSceneId`, `getNeighbourScenes`, `scenes`, `sceneById`, `sceneEntries`, `SceneCredits { scene }` |
| `TrackedSpread`, `onSpreadSeen`, `spreadSeen` (ArSceneEvents), `SPREAD_SEEN_MS`, `currentSpreadId`, `wantedSpread`, `heldSpreads`, `spreadsByDistance`, `prepareSpread`, `startSpread`, `changeSpread`, `spreadOf`, `IArScene.spreadId` / `load(spreadId)` | `TrackedScene`, `onSceneSeen`, `sceneSeen`, `SCENE_SEEN_MS`, `currentSceneId`, `wantedScene`, `heldScenes`, `scenesByDistance`, `prepareScene`, `startScene`, `changeScene`, `sceneOf`, `sceneId` / `load(sceneId)` |
| `utils/prepared-spreads.ts`, `getPreparedSpreadRange`, `cyclePreparedSpreadRange`, key `ar-prepared-spreads` | `utils/prepared-scenes.ts`, `getPreparedSceneRange`, `cyclePreparedSceneRange`, key `ar-prepared-scenes` (old key dropped, Q4) |
| `SceneState` / `SCENE_STATES` / `SceneStateName` (AR lifecycle) | `ArState` / `AR_STATES` / `ArStateName` (Q1) |
| plugin runtime: `PluginSpread`, `api.spread`, `setSpreadSource`, `spreadsAccessor`, `allSpreads`, `spreadChanged()` | `PluginScene`, `api.scene`, `setSceneSource`, `scenesAccessor`, `allScenes`, `sceneChanged()` (Q2) |
| core event `spreadChanged { spreadId, previous }`, var scope `"spread"`, `progress.completion(spreadId?)`, `counts(spreadId?)` | `sceneChanged { sceneId, previous }`, `"scene"`, `(sceneId?)` (Q2, Q3; plugin core event `sceneState` → `arState`? – Q1) |
| `BEHAVIOUR_SCOPES` `"spread"`, `BEHAVIOUR_CORE_EVENTS` `"spreadChanged"`, entry-text's scope order | `"scene"`, `"sceneChanged"` (Q3) |

### client (reader)
| Old | New |
|---|---|
| `SpreadManager`, `ISpreadManager`, `SpreadManagerState`, `types/spreads.ts`, `game.spreads`, `switchSpread`, `state.currentSpread` | `SceneManager`, `ISceneManager`, `SceneManagerState`, `types/scenes.ts`, `game.scenes`, `switchScene`, `state.currentScene` |
| `Pages.SPREAD = "spread"`, route param `spreadId`, `<spread-page>` / `SpreadPage` / `pages/spread-page.ts` | `Pages.SCENE = "scene"`, `sceneId`, `<scene-page>` / `ScenePage` / `pages/scene-page.ts` |
| `<spread-menu>` / `SpreadMenu` / `spread-menu.ts` / `spread-menu-loop.ts`, `getMenuSpreads`, `scrollToSpread`, `data-spread` | `<scene-switcher>` / `SceneSwitcher` / `scene-switcher.ts` / `scene-switcher-loop.ts` (SCENES.md calls it the switcher), `getSwitcherScenes`, `scrollToScene`, `data-scene` |
| `formatPages` (an alias of `sceneLabel`) | removed – `sceneLabel` |
| HistoryManager `getSpreadCompletionPercentage`, `isSpreadComplete`; PreloaderService `preloadSpreads`, `preloadSpread`, `spreadWithTargets`, `getSpreadContent` | `getSceneCompletionPercentage`, `isSceneComplete`; `preloadScenes`, `preloadScene`, `sceneWithTargets`, `getSceneContent` |
| dev tools: `renderSpreadInfo`, `generateSpreadSummary`, `spreadTitle`, `.spread` class (camera panel), `newSpreadId` | `renderSceneInfo`, `generateSceneSummary`, `sceneTitle`, `.scene`, `newSceneId` |
| client `SceneState`, `scene-state.ts`, `getSceneState`, `applySceneState`, `SCENE_STATE_BY_MODE`, CSS `scene-active`, `scene-container` (AR sense) | `ArState`, `ar-state.ts`, `getArState`, `applyArState`, `AR_STATE_BY_MODE`, `ar-active`, `ar-container` (Q1) |
| tutorials page anchors `#demo-spreads`, `#tools-spreads`, `02-spreads.webp`, `06-spreads.webp` | `#demo-scenes`, `#tools-scenes`, `02-scenes.webp`, `06-scenes.webp` |
| `scan:scrollToActivate` text | Q5 (copy, not a name) |

### editor
| Old | New |
|---|---|
| `spreadId` (route page, stage, panels), `content.spreads`, `content.spread(id)` | `sceneId`, `content.scenes`, `content.scene(id)` |
| `selection.spread`, `selectSpread`, tree row kind `"spread"`, `TreeItem "spread"` | `selection.scene`, `selectScene`, `"scene"` |
| `panels/SpreadView.svelte` | `panels/SceneView.svelte` |
| `addingSpread`, `openNewSpread`, `canAddSpread`, `spreadCreated`, `atLastSpread`, `onaddspread` | `addingScene`, `openNewScene`, `canAddScene`, `sceneCreated`, `atLastScene`, `onaddscene` |
| `SpreadImpact` / `spreadImpact` (removal), `SearchSpread` / `spreadWhere` (alias of `sceneLabel` – removed), `bySpread`, `spreadsOnBooks`, `PassesSource "spread"`, `heldSpreads`, `spreadOpenedAt`, `spreadLabel`, `spreadOn`, `spreadMenu` | `SceneImpact`, `SearchScene` / `sceneLabel`, `byScene`, `scenesOnBook`, `"scene"`, `heldScenes`, `sceneOpenedAt`, `sceneLabel`, `sceneOn`, `sceneMenu` |
| frame protocol state `spreadId` | `sceneId` |
| TopBar `.crumb.spread` | `.crumb.scene` |
| `spreadToStage` (snap.ts – a point of the scene's frame in mm to the stage) | `frameToStage` (by meaning; `surfaces.ts` has its own `sceneToStage`) |
| `PrintBox`, `printCentre`, `printedHeight`, `printStageBox`, `MIN_PRINT_WIDTH`, `DEFAULT_PRINT_MM`, `printBoxes`, `printedBoxes`, `printedPlanes` | `PlaceBox`, `placeCentre`, `placeHeight`, `placeStageBox`, `MIN_PLACE_WIDTH`, `DEFAULT_PLACE_MM`, `placeBoxes`, `placedBoxes`, `targetPlanes` |
| `pageHit` / `PageHit` / `pageAt`, `pageLines`, `PAGE_MARGIN_MM`, `PAGE_COLOR` / `PAGE_EDGE_COLOR`, `page` (first surface's size) | `surfaceHit` / `SurfaceHit` / `surfaceAt`, `surfaceLines`, `SURFACE_MARGIN_MM`, `PAPER_COLOR` / `PAPER_EDGE_COLOR`, `surface` |
| `EntityPanel` `printOpen` / `printPending` / `printEdits` | `placementOpen` / `placementPending` / `placementEdits` |
| `PAGE_MM` alias for the card / cover aspect, `pageRatio` | `SCENE_PAGE_MM` (the preset page, imported as is) via `CARD_RATIO`; `cardRatio` |

### server + DB (Q7)
| Old | New |
|---|---|
| table `spreads`, FK `spreads_book_fk` | `scenes`, `scenes_book_fk` |
| `entries.spread_id`, index `entries_spread` | `entries.scene_id`, `entries_scene` |
| `books.initial_spread_id` | `books.initial_scene` (the content's name) |
| `spreads.title` (copy of the label) | `scenes.label` |
| `spreads.first_page`, `spreads.last_page`, `entries.page`, table `page_images` | dropped – after `migrate-3` ran on staging (Migration3 reads them) |
| `changes.kind = 'spread'` (old rows) | `'scene'` (one `UPDATE`) |
| stored behaviour rules `scope: "spread"`, `on: "spreadChanged"` in `entities` / `targets` / `scenes` `data_json` | `"scene"`, `"sceneChanged"` (a data step with Q3) |
| `$draftSpreads` (api-test), comments naming `Books::deleteSpread` | `$draftScenes`, `Books::deleteScene` |

### scripts, mcp, fixtures, docs
- Fixture scene ids `spread1` … `spread14` → `scene1` … `scene14` (folders, entries' `scene:`, client/scripts tests) – Q8.
- Demo plugins: `tally` (`"spread"` choice → `"scene"`, `target.sceneId`, `sceneChanged`), `scenes` – its **own** event
  `sceneChanged` collides with the new core event → renamed `stepChanged`, its var scope → `"scene"`.
- `demo/layout/layout.json` `"kind": "spread"` and `render-layout.py`: the print layout's sheet kind – stays until part C
  of the layout work replaces the sheets by surface references (MEMORY open item); not a model name.
- MCP: tests and comments only. Sandbox `reveal`: comments.
- Docs: every `docs/*.md` spread / page-in-the-model sentence, `client/public/docs/tutorials/index.html`, `README.md`,
  `agents/RULES.md` #2 ("page group = **spread**" → "a step of the experience = **scene**, scenes under one label =
  **group**"), #3 (`MAX_TARGETS_PER_SCENE`), #12.
  `agents/SCENES.md` "Today" stays as history. CHANGELOG / MEMORY history stay as written.

## 3. Dead code the 3.0 cut left

| What | Evidence | When |
|---|---|---|
| `client/.../spread-menu-loop.ts` `formatPages` | `= sceneLabel(spread)`, a one-line alias, 3 callers | with the rename |
| `editor/src/lib/book-search.ts` `spreadWhere` | `= sceneLabel(spread)`, alias | with the rename |
| `engine/src/content/game-config.ts` `getSurfaces` | only `__tests__/scenes.test.ts` calls it | with the rename (test goes with it) |
| `server/api/src/Migration3.php`, route `POST …/migrate-3`, 409 `migrate-first` checks in `Books` / `Editor` / `Reverts` / `SurfaceReferences`, MCP `migrate_3` (content.ts, model.ts, prompts.ts, result.ts), `shared/api/editor.ts` Migration3 types (~l. 440–520), docs/server.md "The migration to schema 3.0" | one-time 2.x → 3.0 step | **after** it ran on staging (osct + demo) and Tilman confirmed – Q9 |
| `spreads.first_page` / `last_page`, `entries.page`, table `page_images` | written as 0 (`Books.php:107,115,505`, `Scenes.php:182`), read only by `Migration3.php` | with Migration3 |
| `ContentVersion.php:112` skips a `page` key | 3.0 entry data carries none after the migration | with Migration3 |
| `Reverts.php:100` refuses a change holding `page` / `print` | guards reverts of 2.x change rows | stays while 2.x change rows exist (Q9: keep the guard, or purge the 2.x history) |
| `scripts/src/convert-content-3.ts`, its test, `npm run convert:3`, `BOOK_PAGE_MM` use there | the fixture and the demo are converted | once the real content folder (`OSCT_CONTENT_DIR`) is converted – Q10 |
| `scripts/layout/render-layout.py` | reads the 2.x source (MEMORY 2026-11-18 open item) | not in this refactor – it is the layout work's |
| `client/src/utils/onboarding.ts` comment on the content's `tutorial` | the field is gone in 3.0 | comment fix |
| editor `LEGACY_TOKEN_KEY`, `LEGACY_DESKS` | stored-key compat from before 3.0, unrelated to scenes | optional, Q4 ("no compatibility anywhere") |

Not dead: `getNeighbourSpreads` (PreloaderService), `getEntryPlaceLabel`, the delivery import's page mapping.

## 4. Order of work, reviewability, checks

**How**: symbol renames with a small ts-morph script (renames declarations and every reference, across engine →
client / editor / mcp, so nothing is renamed by text that should not be); file moves with `git mv` (history kept);
comments, strings, Svelte markup, PHP and SQL by hand with a grep list, reviewed per hunk. Mechanical renames and logic
changes never share a commit. Every commit builds and passes its area's checks; one search at the end
(`rg -i spread` must hit only the allowed list: English "spreads" in prose like the bloom pass, CHANGELOG, MEMORY,
SCENES.md history, layout sheets' `kind`).

Commits (each `(#319)`, on `feature/319-internal-names`):
1. **engine content model** – `Spread` → `Scene`, `spreadId` → `sceneId`, the `game-config` accessors, `SceneCredits`;
   consumers in client / editor / mcp follow in the same commit (mechanical). Dead `getSurfaces` in its own commit.
2. **engine AR + tracker** – `TrackedScene`, `sceneSeen`, `prepared-scenes.ts`, storage key; client bridges, editor
   mock tracker (mechanical). Then, by Q1, `SceneState` → `ArState` in engine + client (mechanical, own commit).
3. **reader** – `SceneManager`, `scene-page`, `scene-switcher`, router `Pages.SCENE`, History / Preloader / dev tools,
   tests; `formatPages` removed (own commit); tutorials page anchors and image names.
4. **editor** – `sceneId`, `content.scenes`, `selection.scene`, tree kind `"scene"`, `SceneView.svelte`, frame protocol,
   removal / search / passes names; `spreadWhere` removed (own commit). Then a second commit: the stage's page / print
   names (`PlaceBox`, `surfaceHit`, …) – by meaning, reviewed by hand.
5. **plugin API + behaviour contract** (logic: a versioned change) – `api.scene`, `sceneChanged`, scope `"scene"`,
   `target.sceneId`; `PLUGIN_API_VERSION` per Q2, schema per Q3 (`npm run schema:lock`, docs/content.md row),
   `plugin-api.d.ts` regenerated (`npm run plugin-api` in editor/), demo plugins, editor's behaviour / passes / entry-form
   scope lists, docs/plugins.md.
6. **server + DB** – `Db::migrate` learns two idempotent forms (`ALTER TABLE a RENAME TO b`, skipped when `a` is gone;
   `ALTER TABLE t RENAME COLUMN a TO b`, skipped when `a` is gone) – own commit with its api-test; then the schema files
   (MySQL + SQLite: the renames **at the top**, before the `CREATE TABLE IF NOT EXISTS` of the new names, so a fresh DB
   creates `scenes` and an old one renames `spreads`), every SQL statement, `UPDATE changes SET kind = 'scene' …`, the
   behaviour rule rewrite in `data_json` (Q3), api-test. MariaDB 10.11 / 11.4 and SQLite ≥ 3.25 have both RENAME forms.
   Migration3 keeps working (it reads the renamed table; it still needs the page columns).
7. **scripts, mcp tests, sandbox, fixtures ids** (Q8).
8. **dead code after the migration** (Q9, Q10) – Migration3 and the migrate-3 route / MCP tool / shared types, the page
   columns and `page_images` (`ALTER TABLE … DROP COLUMN`, `DROP TABLE IF EXISTS page_images`), `ContentVersion`'s skip;
   `convert-content-3`. Can be a later branch if staging has not migrated by then.
9. **docs** – docs/*.md, README, RULES #2 / #3 / #12, MEMORY entry, CHANGELOG `## Unreleased` (internal refactor;
   the plugin API / schema / DB changes listed as *Changed*, the dead code as *Removed*).

**Checks** (once at the end, plus the affected package's `tsc` after each commit):
- from `client/`: `OSCT_CONTENT_DIR=../fixtures/content npm --prefix ../scripts start` (fixture build), `npx tsc --noEmit`,
  `npx vitest run`
- `scripts/`: `npx vitest run`
- `editor/`: `npx svelte-check`, `npx vitest run --testTimeout=30000`
- `mcp/`: `npx tsc --noEmit`, `npx vitest run`
- server: `OSCT_TEST_PHP_ARGS="-d extension=gd" php -d extension=gd server/tests/api-test.php` (SQLite), plus the rename
  migration run once against a copy of a 2.0.0 SQLite DB (old names → new, data kept) and – if possible – a local
  MariaDB in Docker (`docker-compose.yml`)
- smoke: the reader's scan view with the switcher (390 × 844, headless Edge with the fake camera) and the editor's
  workspace loading a scene; screenshots to the orchestrator.

**Size**: ≈ 2,100 code lines / ~240 files mechanical, ≈ 350 doc lines, ≈ 200 lines of logic (Db::migrate forms, data
step, plugin API / schema bump, dead code removal ≈ −1,000 lines with Migration3). Estimate 120–180 turns; splittable
into two workers: A = commits 1–5, 7 (TypeScript), B = 6, 8 (server, after A's commit 5 for the behaviour names).

## 5. Open questions for Tilman

1. **"Scene" in the AR sense.** Today "scene" also means the rendered AR scene (`ArScene`, `SceneState` idle / loading /
   ready / running, CSS `scene-active`, the plugin event `sceneState`). Proposal: bare *scene* = the content's scene;
   the rendering side always says `Ar…` (`SceneState` → `ArState`, ~70 sites), the plugin event `sceneState` →
   `arState`. Or keep `SceneState` as is and live with the double meaning?
2. **Plugin API**: `api.spread` → `api.scene`, `spreadChanged` → `sceneChanged`, `target.spreadId` → `sceneId`, scope
   `"spread"` → `"scene"` **with no alias** – a MAJOR, `PLUGIN_API_VERSION` 1.8 → 2.0. A plugin recorded against 1.x is
   then not loaded until rebuilt / re-saved in the editor (the demo's are rebuilt by the content build; staging's stored
   plugins need a re-save – I list which use the old names, read-only, before). OK?
3. **Behaviour rules in the content** (`scope: "spread"`, `on: "spreadChanged"` – a contract enum): rename to
   `"scene"` / `"sceneChanged"`. As schema **3.0 amended in place** (2.0.0 is not pushed yet, nothing outside the repo
   has 3.0 content – if that is still true when this lands), or as **3.1** with the old values refused? The server's
   stored rules are rewritten in the DB step either way.
4. **Stored browser keys**: rename `osct-ar-prepared-spreads` → `osct-ar-prepared-scenes` and simply drop the old value
   (a dev switch, default ±2)? And while at it remove the editor's `LEGACY_TOKEN_KEY` / `LEGACY_DESKS` compat (not
   scene-related, but "no compatibility anywhere")?
5. **Reader copy**: `scan:scrollToActivate` still says "Scroll to spread to activate content" (de *Doppelseite*, fr
   *double page*, nl *dubbele pagina*). Change the words (e.g. "Scroll to the scene …") or leave the design's copy alone
   (it is Kévin's book: double pages are right there)? Other copy about the printed book's pages stays.
6. **"Experience" in code**: the editor UI says *Experiences*; I propose the code, API (`/editor/books`, `book_id`), MCP
   (`get_book`) and the content (`book`, `BookData`) **keep `book`** – renaming them is a second, bigger refactor with no
   gain inside. Agreed, or should "experience" go into the code too?
7. **DB names**: rename `spreads` → `scenes`, `spread_id` → `scene_id`, `initial_spread_id` → `initial_scene`,
   `title` → `label` on staging (MariaDB) and locally (SQLite) by an idempotent step in the schema files – or keep the
   table / column names and only rename the code (less risk on staging, but the DB keeps saying spread)?
8. **Fixture ids** `spread1` … `spread14` → `scene1` … `scene14` (pure test data, ~100 lines)? Ids are invisible to
   readers, but the fixture is what new people read first.
9. **Migration3**: has `migrate-3` run (or will it run) on staging's osct and the demo before this lands? Only then
   can `Migration3`, the `migrate-3` route / MCP tool, the page columns and `page_images` go. If not yet, commit 8 waits
   for a later branch. And the 2.x rows in the change log: keep them (and the revert guard), or purge them with the
   migration?
10. **The real content folder** (`OSCT_CONTENT_DIR`, Kévin's book source): converted to 3.0 already (`npm run convert:3`)?
    Then `convert-content-3.ts` goes.
