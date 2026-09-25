# OSCT – Restructuring Plan (Design 260804)

How to use: tick items `[x]` as they land, add new items where they belong, keep
"Open decisions" in sync with `MEMORY.md`.

Source: `reference/design-260804.pdf` (40 frames, "Onion Skin & Crocodile Tears – Application AR").
Extracted frames and images for drafts: `reference/README.md`.
Goal: **restructure** the existing app to adopt the new flow and design. Nothing gets removed
unless explicitly agreed (see `RULES.md`). The only confirmed removal is **QR scanning**.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · `[?]` needs decision

---

## Constraints (fixed)

- Libraries stay: A-Frame + MindAR + immer + vanilla custom elements + vite/vitest.
- **Max 5 image targets per `.mind` group.** Designers keep spreads below that by design.
- One `.mind` group = currently one **spread** (2 pages). The user picks the active spread
  manually (bottom scroll menu); the app does not auto-detect across all targets.
- Self-made page/view management stays. Transitions are simple (CSS), no router/animation lib.
- Content (texts, videos, Mark animations) arrives later (on site in Amsterdam, fall 2026).
  Build everything against placeholder content.

---

## Phase 0 – Target limit  `[x]`

- [x] Limit decided: **5 targets per group**.
- [x] `maxTrack` (AR targets tracked at once) decided: **same as max targets per spread (5)**.
      Scale down after the usability test.
- [x] One shared constant `MAX_TARGETS_PER_SPREAD` in `scripts/src/config.ts`, written into
      `game.config.json` as `maxTargetsPerSpread`. Client `maxTrack` (`createScene.ts`, `templates.ts`)
      and the content tests read it via `getMaxTargetsPerSpread()`. Build fails above it.

---

## Phase 1 – Cleanup + taxonomy  `[x]`

### 1a. Remove QR  `[x]` done 2026-09-24
Confirmed removal. Everything QR-related:
- `client/src/components/qr-scanner/*`
- `client/src/store/managers/QRManager.ts`, `IQRManager` in `types/game.ts`, `game.qr`
- `client/src/components/buttons/qr-button.ts`, `components/icons/qr-icon.ts`, `src/assets/qr-icon.svg`
- `client/src/utils/qr.ts`, `client/src/types/qr/*` (except `qrcode.ts`, used by the dev generator)
- ~~`client/src/components/dev-tools/qr-generator.ts`~~ **keep** – dev overlay QR codes open the
  dev server on a phone for testing (restored 2026-09-24).
- `GameMode.QR` and its uses (`qr-scanner.ts`, `qr-button.ts`, `QRManager.ts`)
- deps: `jsqr` (package.json), `qrcode.min.js` (unused). **Keep** `qrcode.js` (dev generator).
- `<qr-scanner>` in `client/src/main.ts`, `<qr-button>` in `navigation-bar.ts`
- Chapters page currently "activates QR scanner" → only remove the QR trigger, keep the page.
- [x] Removed all of the above, plus the `FAILED_TO_SCAN_QR` / `INVALID_QR_*` error codes
      (client + `scripts/src/types/game.ts`). `tsc` + `vite build` pass. Chapters page had no
      QR trigger in code (only in `PAGES.md`, updated).

### 1b. Keep & restructure (NOT remove)
Home, tutorial, about, index, chapters, chapter pages, `components/index/*`, resume session.
They get restyled / re-mapped in later phases.

### 1c. Taxonomy  `[x]` decided 2026-09-24
Today: `chapter` → `targets[]` → `entity` → `assets[]`. New concept: a page group (spread)
holds targets; targets reveal **entries**; entries have a category.

Naming for "chapter":
- [x] **`spread`** – sticks closely to the app's use case. Keep `firstPage`/`lastPage`.
- [x] Rename chapter → spread (2026-09-24). Touches: `ChapterManager`, `switchChapter`, `currentChapter`, `chapters` state,
  `ChapterData`, `chapter-page`, `chapters-page`, `chapter-item`, `chapter-list`,
  `static/chapter*.ts`, content folders `content/chapters/*`, build script, route slugs.
  Done: all of the above incl. `IChapterManager`→`ISpreadManager`, `game.chapters`→`game.spreads`,
  `initialChapterId`→`initialSpreadId`, `relatedChapter`→`relatedSpread` (YAML), history entries
  `chapterId`→`spreadId`, content ids `chapterN`→`spreadN`, slugs `/spread` + `/spreads`,
  `Pages.SPREAD(S)`, elements `spread-page`, `spreads-page`, `spread-item`, `spread-list`, `spreads-button`.
  Rebuilt content with the renamed build script → identical `game.config.json` (except timestamp).
  **Not renamed:** QR code prefix `c-` (open decision #12), `docs/`, legacy `client/public/assets/targets/chapter*.mind`.

Entries vs targets – **decided** (2026-09-24):
- [x] **Entries are top level** (own content type, e.g. `content/entries/<id>/`).
- [x] An entry *may* have a target (on a page group). The target is optional.
- [x] A target *may* have an AR entity projected in A-Frame. Today that is only **video**.
      Later possibly **3D models / other A-Frame entities** (to discuss with Kévin) →
      keep the entity type open/extensible, don't hardcode "video only".
- [x] Found target **without** AR entity → shows the image-with-drop-shadow indicator (Phase 3).
- [x] **One target ↔ one entry** for now.

```
entry (top level, category)
 └─ target?  (belongs to a page group, max 5 per group)
     └─ entity?  (AR: video now; model / other later)
```
- Categories (from the PDF, fixed):
  - **Glossary** – terms, with text + image (p.15)
  - **Videos** – documentation videos of Kévin's work; all are **AR overlays** on the page (p.20–22)
  - **Texts** – texts written about Kévin's work, with author (p.24–25)
  - **Links** – all other media: YouTube, articles, online/uploaded PDFs (p.29–31).
    An external video is a Link.
- Entry fields seen in the design: name, access page, category, author (texts), body, image,
  media (link/embed or AR video).

### 1d. Content pipeline  `[x]` done 2026-09-24
- Extend `content/*` YAML + `scripts/src` build with the new taxonomy.
- Keep the existing `hideFromIndex` flag (as an entry flag).
- Extend the content tests (now `utils/__tests__/game-config.test.ts`) to the new taxonomy.

Done:
- [x] `content/entries/<id>/entry.yaml` (+ optional image next to it). Fields: `category`
      (glossary / videos / texts / links), `title`, `page` (access page), `author`, `body`, `image`,
      `media` (link URL), `target` (optional, 1:1), `hideFromIndex`. Schema in `scripts/src/utils/schema.ts`
      (validated with the existing `validateContent`).
- [x] Targets keep only tracking data (spread, image, `.mind`, entity, bookId, tags). Title / description /
      `hideFromIndex` moved to the entry; the build copies them onto the target output (+ `entryId`)
      so the current index keeps working until Phase 4.
- [x] Output: `game.config.json` gets `entries[]` (sorted by category, title; with `targetId`, `spreadId`)
      and `maxTargetsPerSpread`. Client types `types/entries.ts`, helpers `getEntries()` / `getEntry()`.
- [x] Build **fails** (exit 1, nothing written) on: missing target image, > 5 targets per spread, target
      with missing/unknown spread, target without entry, entry with unknown/already used target,
      invalid category / required field, access page outside the target's spread, missing entry image.
- [x] Demo: 12 entries – one per target (10) + Metafiction (glossary, no target, designers' example image)
      + a placeholder text (texts, no target). All four categories covered.
- [x] Tests: shared limit, entry ids/categories, 1:1 entry ↔ target, page within spread, entry images exist.
- Build fails if a group has > 5 targets.
- Keep `client/public/assets/content` in sync as today.

---

### 1e. Content model + types  `[x]` done 2026-09-24
Progress: [x] step 1 shared contract + guards · [x] step 2 build + content · [x] step 3 app
Result: 12 entries (10 with target, nested), 1 shared entity (`castle`, via `ref`), `book.yaml`;
build rewritten around the model (validates every file, spread by page, MindAR order page → order →
id reproduces the compiled `.mind` files, `assertGameConfiguration` before writing); app reads only
through `utils/game-config.ts`; 45 tests. Browser: scenes, found/lost by target id, index, tutorial OK.
Why: 1d left redundancy (entry text copied onto targets, references in three directions, two copies
of every type, six files reading `game.config.json` directly, casts without runtime checks).

**A. Source (YAML) – references in one direction only**
- `content/book.yaml`: `id: osct`, title, author → bundle `book` (app reusable for other books; id
  usable in storage keys / QR codes).
- `content/spreads/<id>/spread.yaml`: title, `firstPage`, `lastPage`, `mind`.
- `content/entries/<id>/entry.yaml`: category, title, `page` (**decides the spread**), body, author,
  image, media, `tags` (optional, not in the design yet – kept for a future content manager / filters)
  and an optional **nested** `target`. **`hideFromIndex` is dropped** (one reader, one use – Edge;
  the design's "unconsulted entries hidden" flag covers it):
  ```yaml
  target:
    id: video-example        # optional, defaults to the entry id (override e.g. when the image is re-shot)
    image: images-007.jpg
    order: 0                 # optional tie-breaker for the MindAR order
    entity: { type: video, src: bunny.mp4, params: {...} }   # inline …
    # entity: { ref: castle-scene }                         # … or reference
  ```
- `content/entities/<id>/entity.yaml` for complex / reusable entities: `type`, `assets[]`, `params`.
  **No logic in content**: behaviour is a client entity type (until Phase 6: a case in `templates.ts`,
  RULES #12).
- Dropped: `content/targets/`, `*.asset.yaml`, `relatedSpread`, `relatedTargets`, per-target `bookId`
  (→ page), per-target `.mind` (the `.mind` order test compares with the image dimensions instead).

**B. Bundle (`game.config.json`) – mirrors the source nesting, no redundancy**
`version`, `book`, `maxTargetsPerSpread`, `spreads[]` (no targets inside), `entries[]` (with nested
`target: { id, index, imageSrc, entity }`), `entities{}` (only for `ref`s), `tutorial[]`.
The build adds only what it must decide: target `index` (MindAR order: page → order → id, must match
the `.mind`), absolute paths, defaults. No copied text, no reverse references.

**C. Types and naming – one name per layer, one definition**
Vocabulary: **content** = what authors write (`content/`, content build in `scripts/`) ·
**game configuration** = what the build emits (`game.config.json`, root type `GameConfiguration`,
file name stays) · **`*Data`** = the typed pieces inside it · **app model** = `Spread`, `Entry`, `Target`, `Step`.
| Layer | Where | Naming |
|---|---|---|
| Game configuration contract (DTO, "loaded from JSON") | top-level **`shared/types/`** (+ guards in `shared/guards/`) – imported by the app **and** `scripts/`; only this contract moves out, app types stay in `client/src/types` | `*Data` (`EntryData`, `SpreadData`, `TargetData`, `EntityData`, `BookData`, root type) + type guards |
| App model ("alive" objects, relations resolved) | `client/src/types` | plain names: `Spread`, `Target`, `Entry`, `Step` |
| Services / controllers | `client/src/types` | `I*` interfaces |
| Runtime state | store | `*State` |
- **No `*Source` interfaces**: the build reads YAML as `unknown`, validates it with `scripts/src/utils/schema.ts`
  (authoring rules) and normalises it straight into `*Data`.
- `EntityData` stays the description of an A-Frame entity (a plain `Entity` would clash with A-Frame's
  `Entity`). `EntitySpec = InlineEntity | EntityRef`, `EntityDefinition` for the `entities` table.
- Remove duplicates: `scripts/src/types/game.ts`, `scripts/src/types/content.ts`,
  `client/src/types/content.ts`, `SpreadConfiguration`. Rename `TutorialStepData` → `StepData`.
- `GameConfiguration`: `version`, `book: BookData`, `maxTargetsPerSpread`, `initialSpreadId`,
  `spreads: SpreadData[]`, `entries: EntryData[]` (nested `target?: TargetData`),
  `entities: Record<string, EntityDefinitionData>` (refs only), `tutorial: StepData[]`.
- Wiring: `@shared` alias in the client (vite, tsconfig paths + include), relative import in `scripts/`.
- Type guards (part of 1e): `isEntryCategory`, `isEntityType`, `isEntityRef`, `assertGameConfiguration` – literal
  unions defined once from `as const` arrays. The build runs `assertGameConfiguration` **before writing**; the app
  runs it on load.

**D. Single entry point**
- Only `utils/game-config.ts` imports `game.config.json`: `assertGameConfiguration` → map to `Spread`/`Target`/`Entry`
  → in-memory indexes (entry by id, spread by id, entries/targets by spread, target → entry/spread,
  resolved entity refs). All data is loaded at startup anyway, so indexes cost nothing extra.
- Replace the direct imports in `templates.ts`, `tutorial-content.ts`, `tutorial-navigation.ts`,
  `spread-page.ts`, `tutorial-page.ts`, `GameStore.ts`, `HistoryManager.ts`.
- A test fails if any other file imports `game.config.json`.

**E. App changes**
- Scene element ids = target ids; the target listener reads the MindAR index from
  `mindar-image-target` instead of parsing a number out of the id. `trackedTargets` → target ids (not persisted).
- **History stays numeric (`spreadId` + MindAR index) until Phase 2** (decision (b)).
- Index / debug overlay read from the app model.

**F. Tests**: guards (valid + invalid bundles), content rules (page within a spread, 1:1 entry ↔ target,
index order, refs resolve), `.mind` order vs image dimensions, single-import rule.

## Phase 2 – State  `[~]` (modes vs views, versioning, progress storage, preloader done 2026-09-25; open: deep links (Tilman))

- **HistoryManager rethink.** Today history is keyed by `chapterId + targetIndex` (fragile if
  groups are re-cut). Key by stable ID (entry/target, depending on 1c).
  **After 1e history is still numeric (`spreadId` + MindAR index) – decision (b), fix it here:** key
  by target id (found) / entry id (consulted).
  **Depends on the versioning concept below** (storage schema version + migrations) – the rekey is a
  breaking storage change and must be the first one that goes through it. It also needs a way to tell
  which entries/targets are *unchanged* between two content versions even when the total number
  changed (stable ids + per-item identity/hash, see versioning).
  **Concept decided 2026-09-25 (Tilman):** one progress record per book, keyed by stable ids:
  - **Two stages of discovery:** *unlocked* (target found in scan mode, target id) and *consulted*
    (entry opened, entry id).
  - Per entry also a **bookmark** ("marked") and a **note** (short user comment) – stored now, UI in
    Phase 4.
  - `lastSpreadId`, `lastCategory` (resume, "Entries" button), the app version history, the storage
    format version.
  - Ids that are no longer in the content are kept (debug overlay tab, see versioning).
  - Loaded at startup (not on scene ready); behind a storage adapter.
- [x] "Consulted" = "visited": the same thing (entry opened → marked in history).
  Use **consulted** everywhere.
- Persist the last selected category (for "Entries" button → back to list with latest
  category, p.21) and last active page group (resume). Names follow 1c.
- Rename `switchChapter` → `switchSpread` (with the 1c rename).
- **Modes vs views** `[x]` proposal confirmed 2026-09-24 · **implemented 2026-09-24**:
  `GameMode` = `IDLE` / `SCAN` / `CONSULTATION` / `VR`; every route in `router.ts` declares its mode;
  `RouterManager` applies route + mode (+ `close()` clearing the error) in one update; the direct
  `draft.mode = …` writes are gone; `isSameRoute` compares param key + value; unknown slugs → `/not-found`
  (keeps the mode). Tests cover each route's mode, single update, overlays. Browser flow verified.
  **Refined 2026-09-24 (definitions):**
  - **Mode** = UI context from the design (which chrome, what Mark the Page does): `IDLE` (home,
    onboarding), `SCAN`, `CONSULTATION`. `VR` removed (never set, VR UI disabled in every scene).
  - **Scene state** = derived, never set directly: `getSceneState(mode, route)` in
    `components/aframe-bridges/utils/scene-state.ts` → `RUNNING` (scan) / `PAUSED` (consultation; idle for now) / `STOPPED`
    (idle, once `autoStart` is off – Phase 5/6). PAUSED = MindAR tracking + camera video paused, stream
    kept, last frame frozen behind the (dark, slightly transparent) UI, instant resume.
  - **Overlay** = route without a mode (error, not-found): keeps the mode, **pauses the scene** (saves
    resources and keeps targets from firing behind a page – found indicator, videos with sound).
  - Before: consultation and overlays only paused A-Frame; MindAR kept tracking underneath.
  **Moved to Phase 4** (need their pages): rename `/index` → `/entries` (param `category`) and the new
  `/entry` route (param `entryId`). The mode toggle via Mark the Page is Phase 3.

  **Current code (as reviewed):**
  - `GameMode` (IDLE / DEFAULT / QR / VR) is global store state. Subscribers: the scene bridges
    (run/pause MindAR) and `navigation-bar` (hidden in IDLE).
  - `currentRoute` is global store state too; `pages-router` shows exactly one page and passes
    the route's single `param` as an attribute. Views inside a page (tutorial `step`) are that param.
  - Mode and route are set **independently and ad hoc**: `draft.mode = …` in
    `RouterManager.close()`, `tutorial-navigation`, `HistoryManager` resume, `QRManager`.
    Opening `/index` does not change mode, so the scene keeps running under the index page.
  - "Scan" is actually a route too: `close()` goes to `/chapter` (the minimal HUD page).
  - Bug: `RouteResolver.isSameRoute` compares `param` objects by reference → always "different".

  **Proposal:**
  - **Mode** = global app state in the GameStore: decides whether the scene runs, which chrome
    is shown (Mark state, header counter, spread menu vs. "Entries" button) and which pages are
    reachable. Values: `IDLE` (home, tutorial – no scene), `SCAN` (replaces `DEFAULT`),
    `CONSULTATION` (new; scene paused, camera stream kept). `VR` stays untouched. `QR` goes with 1a.
  - **View** = route → page (+ its param). Stays as it is: one exclusive page, one param.
  - **Coupling:** every route declares its mode in `router.ts` (`mode?: GameMode`).
    `RouterManager.navigate()` sets route **and** mode in one `update()` → no inconsistent
    in-between state for the scene bridge, and all scattered `draft.mode = …` go away.
    Routes without a mode (error, not-found) keep the current mode (overlay).
  - Mark the Page toggles by navigating to the other mode's entry route
    (scan → `/entries` with last category; consultation → `/spread` HUD).
  - Page → mode map (nothing removed):

    | Route / page | Mode | Notes |
    |---|---|---|
    | `/` home | IDLE | restyle |
    | `/tutorial` (step) | IDLE | = onboarding, Phase 5 |
    | `/about` | CONSULTATION | **= Info** (keep the name `about`, no rename) (frames 32–34): opened via the "i" button, info text + colophon, "Entries" back to the list |
    | `/spread` (was `/chapter`) | SCAN | HUD: Mark, counter, spread menu |
    | `/spreads` (was `/chapters`) | SCAN | **dev view** for now (list of all spreads/targets for testing) |
    | `/entries` (was `/index`, param `category`) | CONSULTATION | index page restructured |
    | `/entry` (new, param `entryId`) | CONSULTATION | entry detail as its own view (today entries expand inline in `target-item`) |
        | `/error`, `/not-found` | – (keep) | overlay |
  - [x] Fix `isSameRoute` param comparison (key + value).
  - [x] Unknown slugs → `/not-found` (was unreachable: `RouteResolver.createRoute` threw).
- **Versioning: app version vs content version**  `[~]` – concept by **Tilman**, decided 2026-09-25
  (see "Decided 2026-09-25" below – one version for app and content build); implementation in Phase 2.
  ~~Two independent versions. Keep them apart in code, storage and QR codes.~~ (superseded)

  | | App version | Content version |
  |---|---|---|
  | What | the client code | spreads, targets, entries, media |
  | Source today | `client/package.json` → `__VITE_APP_VERSION__` → `game.version.version` | `scripts/package.json` → `npm_package_version` in `scripts/src/index.ts` → `game.config.json` `version` |
  | Used by | dev QR generator (`osct=`) | `HistoryManager` storage check (`ar-game-config-version`) |

  Current state / issues:
  - [x] (2026-09-24) The content build stores `version.hash` = sha256 of `content/` + `scripts/src/` +
    package version and **skips the build** when it is unchanged (`--force` / `npm run
    build:content:force` to rebuild). `version.timestamp` now means "inputs last changed". The hash
    is a natural candidate for the storage/content version check (HistoryManager still compares
    `version.version`).
  - The content version comes from the **scripts package version**, not from the content itself →
    content changes don't bump it. Should be versioned **by the content builder** (e.g. explicit
    version in `content/`, or a hash of the bundle).
  - `utils/game-config.ts` is a primitive service (module-level singleton) → move it to `services/`
    when the data access is built (runtime/CDN loading, generated API) – RULES #17.
  - `game.config.json` is **imported at build time** → content is baked into the app build. A future
    **CDN upload** from the content builder needs the config (+ assets) to be fetched at runtime,
    with the content version in the path/manifest, and a check which app versions can read it.
  - Saved progress should be keyed/migrated against the **content version** (ties into the
    HistoryManager rethink above).

  **Semver concept – three version axes** (added 2026-09-24, owner Tilman):

  | Axis | Describes | MAJOR | MINOR | PATCH |
  |---|---|---|---|---|
  | **App** (`client/package.json`) | client code, incl. which content schema + storage schema it can read | app can no longer read older content/storage | new features, reads the same formats | fixes |
  | **Content** (content build) | the content bundle: schema (fields/structure) + data (entries, targets, media) | content schema changed → older apps can't read it | additive (new entries/fields old apps can ignore) | text/media fixes |
  | **Storage** (localStorage schema) | shape of saved data: history, last spread/category, settings | saved data unreadable → migrate or discard (tell the user) | additive | – |

  Open work:
  - **Content ahead of app is breaking**: a bundle built for a newer app (e.g. new content schema,
    new entity type) must be detected by an older app. The bundle should declare the content
    *schema* version (or a minimum app version) separately from its data version/hash; the app
    declares which content schema range it supports and refuses/falls back otherwise. Matters as soon
    as content is loaded at runtime (CDN) instead of baked into the app build.
  - **Startup compatibility check** between the three – reuse the startup path built for invalid
    game configurations (`getConfigurationError()` → critical screen in `main.ts`, `ErrorCode`
    mapping in `utils/game-config.ts`): app ↔ storage (can I read saved data?),
    app ↔ content (can I read this bundle?), content ↔ saved progress (do the saved ids still exist?).
  - **Migrations** instead of silent filtering: `migrate(fromStorageVersion)` steps. The pre-rename
    `chapterId` filter in `HistoryManager.loadTargetHistory` (1c) is a stopgap for exactly this.
  - **Item identity across content versions**: stable ids per entry/target, plus a per-item hash in the
    bundle (e.g. entry hash, target image/`.mind` hash) to tell unchanged / changed / removed / new
    items apart even when counts change. A changed target image invalidates "found", a changed entry
    text probably doesn't invalidate "consulted" – rules to define.
  - The bundle `version.hash` (content build checksum) identifies a whole bundle, not single items.

  **Decided 2026-09-25 (Tilman) – supersedes the open work above where it differs:**
  - **One version** (semver) for app and content build: `client/package.json` and `scripts/package.json`
    always have the same version. Single source: both read `client/package.json` directly (not
    `npm_package_version`, which is missing outside `npm run`). Kept in sync by **tests + CI**.
    Anything that breaks shows up as a version offset.
  - **Two data models** carry the version: the **game configuration** (content build output) and the
    **progress storage** (localStorage).
  - **Game configuration:** PATCH and MINOR must just work. MAJOR = the content has to be **rebuilt**,
    **no config migrations** (a DB + API come later; migrations would be overkill for the file-based
    setup). The app refuses a configuration with another MAJOR at startup (critical screen, same path
    as the invalid configuration, `ErrorCode.NOT_SUPPORTED`).
  - **Progress storage:** keyed by stable ids (see HistoryManager rethink). It records the **app version
    history** (which app versions wrote it). On a MAJOR change the app still **reads the old format**
    (one reader per storage format), converts it to the new one and **tells the user** it is updating
    their progress to the new format. No generic migration framework.
  - **Ids no longer in the content** (entry deleted or renamed): kept in storage. A debug overlay tab
    shows the progress state and marks them as missing; what to do with them is decided in trial/beta.
  - Storage behind a small adapter (`load()` / `save()`), so a DB/API store can replace localStorage
    later with the same record shape.

  **Implementation steps (next session starts here):**
  1. [x] (2026-09-25, CI: `.github/workflows/ci.yml`) Done: `APP_VERSION` in `scripts/src/config.ts` and
     `vite.config.js` read `client/package.json`; `checkConfigurationVersion` in `utils/game-config.ts`
     (helpers `utils/version.ts`); tests `utils/__tests__/version.test.ts`. Browser: 1.1.0 starts,
     temporary 2.0.0 shows the critical `not-supported` screen.
     **One version:** `client/vite.config.js` reads the version from `client/package.json`
     (today `process.env.npm_package_version`, missing outside `npm run`); `scripts/src/index.ts` reads
     `client/package.json` too (today `npm_package_version`, `node dist/index.js` stamped `1.0.0`).
     Test: both `package.json` versions equal, `game.config.json` `version.version` equals the app
     version (a version bump without content rebuild fails). Startup check in `utils/game-config.ts`:
     other MAJOR → `ErrorCode.NOT_SUPPORTED`, critical screen ("content needs to be rebuilt"); other
     MINOR/PATCH → console note. **No CI exists yet** (no `.github/workflows/`) – ask Tilman before
     adding a workflow that runs `tsc` + `vitest` for client and scripts.
  2. [x] (2026-09-25) Done: `ProgressRecord` (`types/history.ts`) in `state.progress`, key
     `osct-progress:<book.id>`, adapter `services/ProgressStorage.ts`, format readers
     `store/managers/progress-readers.ts` (format 1 = app 1.x; one reader per format, unknown/newer/corrupt
     → fresh record + notice). `HistoryManager` loads in its constructor, `offerResume()` from `main.ts`.
     Last spread = spread change **or** spread of an unlocked target (the initial spread never "changes").
     Consulted = entry expanded in the index (until `/entry`, Phase 4). **No reader for the pre-versioned
     keys** (Tilman: never deployed publicly) – old `ar-game-*` keys are ignored.
     Original plan: **Progress storage:** record per book (key with `book.id`): storage format (= app MAJOR),
     app version history, `unlocked` (target id → time), `consulted` (entry id → time),
     per entry `marked` + `note`, `lastSpreadId`, `lastCategory`. Adapter (localStorage now).
     Reader for the pre-versioned keys (`ar-game-target-history` = `{ spreadId, targetIndex }` →
     target id via `getTargets(spreadId)[targetIndex]`, `ar-game-config-version`) → convert, remove old
     keys, notify the user (combine with the resume offer – only one `currentError` at a time).
     `HistoryManager` loads at startup (not on scene ready), records `lastSpreadId` on spread change,
     resume uses it. Update consumers (TargetManager, target-item, spread-item, spread/spreads pages).
     Placement per RULES #17 (state in the manager, storage adapter as a service).
  3. [x] (2026-09-25) **Debug overlay tab:** progress state; ids missing from the content marked.
     Expanded overlay has tabs *spread* / *progress*: book, format, app versions, last spread/category,
     unlocked / consulted / marked / notes with times, missing ids in red (`history.getMissingIds()`),
     "Reset progress". Collapsed line shows `U<unlocked> K<consulted>`.
- **Deep links from printed QR codes**  `[ ]` – owner: **Tilman**
  Printed QR codes (book) are scanned with the phone's native camera and open the app URL, e.g.
  `/?code=c-<chapter>&osct=<version>`. Today **nothing reads these params on load** (`getUrlParam` in
  `utils/url-params.ts` is unused; the old parser `parseQRCodeURL` was deleted with the in-app scanner
  in 1a – see commit `f18618b:client/src/utils/qr.ts` for its logic).
  - Read `code` + version on startup, open the spread (later maybe an entry) via
    `RouterManager.navigate` (sets SCAN mode – RULES #2), handle unknown code / version mismatch.
  - Decide the prefix after the rename: `c-` (chapter) → `s-` (spread), `e-` (entry)? Keep `c-`
    working if codes are already printed.
  - ~~Decide which version `osct` carries (app or content)~~ → resolved by "one version": `osct` = the
    one semver. Since 2026-09-25 links also carry `h` = short content build hash (first 12 hex chars of
    `version.hash`): `/?code=c-<spread>&osct=<semver>&h=<hash12>`.
  - [ ] **Handle version conflicts on incoming links** (later phase, with the deep link reader): other
    MAJOR in `osct`, other `h` (content changed since the code was generated – e.g. the spread/entry no
    longer exists), missing `h` (links printed before 2026-09-25).
  - Dev QR generator (`dev-tools/qr-generator.ts`) produces these URLs for testing
    ("Valid" / "Wrong App Version" / "Other Content Build") and shows the URL under the code.
- [x] (2026-09-25) `.mind` preloading via a **Preloader utility**: fetch into the browser cache only.
  Do **not** touch the A-Frame scene before the group is actually activated.
  Keeping two scene contexts alive is a later topic – not now.
  Done: `services/PreloaderService.ts` (dedupes per URL, retries failed, timeout, `priority: low`). On MindAR
  `arReady` of the active spread (`static-scene-bridge.ts`) it preloads the **neighbouring** spreads
  (±1 in book order): their `.mind` first, then (Tilman) their content – entity assets and entry images,
  videos last; external URLs skipped. Browser: MindAR's later `.mind` request came from the cache (4 ms).
  - [ ] Production cache headers (Netlify / FTP server) for `/assets/content/**` – today the dev server and
    Netlify's default revalidate (304), which works but costs a round trip per file.
  - [ ] Device check (Phase 7): preloaded videos vs. the `<video>` element's range requests (iOS Safari).

---


## Phase 3 – Scan mode  `[~]` (built 2026-09-25; open: reviews #15 loading overlay, #16 indicator in consultation; device checks)

Top chrome per mode lives in `components/header/header.ts`: IDLE = name line (→ about), SCAN = Mark +
counter, CONSULTATION = Mark (same image as scan until the WebM states) + counter + "i" (→ about = Info). The navigation bar
(index button) shows in CONSULTATION only (Phase 4: "Entries"). Design tokens in `main.css`
(`--font-design`, `--tracking-design`, `--color-accent` gold, `--glass-*`).

- [x] **Mark the Page** – own component `components/header/mark-the-page.ts` (mode from the store).
  - Placeholder for now: PNGs from `reference/images/mark/` in `public/assets/ui/mark-the-page/`
    (swappable without code changes; not traced as SVG).
  - Later: WebM animation, portrait, 480p/720p; 320p/240p variants if memory is tight.
    One state per mode. Tap toggles scan ↔ consultation (p.6, p.15, p.35): scan → `/index`
    (Phase 4: `/entries` with the last category), consultation → `/spread`.
- [x] **Counter "12 / 150"** – decided: header shows **consulted entries / total entries**
  (`components/header/entries-counter.ts`, `history.getConsultedCount()` – content entries only).
- [x] **Page menu** (`components/scan/spread-menu.ts`, loop maths in `spread-menu-loop.ts`)
  ("Pages activated", p.6–7): horizontal looped scroll at the bottom, lists
  **only spreads with content**, glass highlight on the active one, haptic on snap
  (`navigator.vibrate` – Android only, iOS Safari has none). Selecting = activate group
  (debounce while scrolling; ~~guard against stale loads in `StaticSceneBridge`~~ done 2026-09-24:
  scene loads are queued, stale spreads skipped).
  Built: odd number of copies, re-centered to the middle copy when the scroll settles (140 ms),
  activation 250 ms later; tap on an item scrolls it to the center; store changes (resume, index)
  scroll the menu without activating. Verified in the browser (switch, loop jump, haptic calls).
  - [ ] **Loading overlay concept review** (Tilman, 2026-09-25): today every spread switch shows the
    full-screen `loading-page` (`game.startLoading()` in `static-scene-bridge.ts`), which covers the
    scan chrome incl. the spread menu until the new `.mind` is ready – the reader can't keep scrolling.
    Review: which loads block the app (startup, invalid content) vs. which only need an inline state
    (spread switch: e.g. a quiet indicator on the menu / under Mark, scene fades in on `arReady`);
    one loading concept for startup, spread switch, entity/asset loading (`ErrorCode.*_NOT_READY`)
    and the Phase 6 `arStatus`. Preloaded neighbours (Preloader) make most switches fast already.
- [x] **Found-target indicator** (p.9–14) – decided; built in `components/scan/found-indicator.ts`
  (entry image, fallback target image; opens `/index` with `entryId` = entry opened in the list until
  the Phase 4 `/entry` view). Verified in the browser with a target whose entity was removed in memory.
  - [x] (Tilman, 2026-09-25) Demo content had no target without an AR entity → the `link` entity of
    "Shadows" (spread1, pages 1–2) was dropped; its target stays (same `.mind`). Scanning Shadows now
    shows the indicator (verified through `targets.addTarget`).
  - The image with drop shadow indicates a **found target that has no AR entity** projected in A-Frame.
  - **Scan mode:** it appears; tap/click opens the entry in consultation mode.
    "New entry unlocked" + small rotation only if the entry was not consulted yet,
    otherwise jump straight to the entry.
  - **Consultation mode:** should eventually be hidden (it blocks the view). For now leave it
    visible for simplicity and check how it looks. → [x] reviewed against the design (2026-09-25):
    **hidden** in consultation – no indicator in frames 15/17/21/33.
    Built into the scan page, so it is hidden there already.
- [x] **AR videos** (p.37–40): **autoplay** when the target is found. No "zoom out" hint needed:
  MindAR only plays once the target is fully in view.
  Built (`aframe-bridges/utils/videos.ts`): play on found, pause on lost, all paused when the scene
  pauses (consultation, overlays), tracked targets resume on activate. Blocked unmuted autoplay →
  plays muted. [ ] Device check (Phase 7): sound on iOS / Android after the first tap.
- [x] **Chroma key for AR videos** (Tilman, 2026-09-25): one key color becomes transparent – no
  alpha channel in the video file. A-Frame shader `chroma-key` (`aframe-bridges/utils/chroma-key.ts`,
  OBS / three.js-forum algorithm, chroma distance in YUV). Content, per video entity:
  ```yaml
  entity:
    type: video
    src: clip.mp4
    params:
      chromaKey: { color: "#00ff00", similarity: 0.3, smoothness: 0.08, spill: 0.1 }  # only color required
  ```
  Measured in the browser: neon green removes greens only; purple also removes blues (close in
  chroma) → **neon green is the safer key** unless the artwork has no blues. No demo video uses it yet.
- Deliverable for designers: the proper video must render correctly → also a consultation
  version (see Phase 4).

---

## Phase 4 – Consultation mode (formerly Index)  `[~]` (built 2026-09-25; open: entries without target, final Info texts)

Consultation chrome from the design (frames 15, 17, 21, 33 – checked 2026-09-25):
- Mark top center (the **same Mark as in scan mode** – the thin strip in the frames is a PDF → PNG glitch), **"i"** top right: gold "i" on a dark round glass button.
- **Counter** "12 / 150" + label "Entries consulted" **only on the entries list** (frame 17), not on the
  entry detail (15, 21) or Info (33).
- **"Entries"** gold pill top left on entry detail and Info (back to the list with the last category).
- Dark, slightly transparent background.
- Note: the dark parallelogram next to Mark in the rendered frames is a **PDF → PNG glitch** (Tilman),
  not UI and not the camera image. Only Mark is at the top.

Built 2026-09-25 (pages extend `pages/consultation-page.ts`; pure logic in
`components/consultation/entries-model.ts`, placeholder icons in `components/consultation/icons.ts`):
- [x] Routes `/entries` (param `category`, default = last category) and `/entry` (param `entryId`), mode
  CONSULTATION. `/index` (former index: spreads + targets) **kept as a dev view**, like `/spreads`; both
  are linked from the dev-only bottom bar (`navigation-bar`: index + spreads buttons).
  Mark (scan) → `/entries`; found indicator → `/entry`; "Entries" → `/entries`.
- [x] Entries list (p.17–29, `pages/entries-page.ts`): category dropdown (Glossary / Videos / Texts /
  Links + **Bookmarked**), count per category "consulted / total", glossary grouped by letter (entries
  without a letter first, no header), texts labelled `'Title', Author`.
- [x] Unconsulted entries: **hidden**; listed **locked** when `showLockedEntries()` – dev builds by
  default, `VITE_SHOW_LOCKED_ENTRIES=true|false` overrides.
- [x] Entry view (p.15, 20, 25, 30–31, `pages/entry-page.ts`): meta table (name, access page, category,
  author for texts), then per category:
  - Glossary – text + image
  - Texts – long text
  - Videos – "Go to access page N in scan mode to see the video." + preview player (plain video, no
    chroma key) to check rendering
  - Links – YouTube / Vimeo as player (youtube-nocookie, Vimeo dnt), other URLs as embedded page
    (sandboxed iframe) + always "Open in a new tab" (a page that refuses embedding can't be detected).
  Opening the view marks the entry consulted.
- [x] "Entries" button → back to list with latest category (p.21) – top chrome.
- [x] Info (p.32–34) = the existing **About page**, restyled: "Info" + "Colophon" sections (placeholder
  text, the existing about content in the colophon), opened via "i". Close button dropped ("Entries"
  and Mark lead out). [ ] Final Info / colophon texts → content (`book.yaml`) when they arrive.
- [x] **Bookmark + note** (Tilman, not in the design yet): bookmark toggle + note field on the entry view
  (saved while typing, debounced); list: "Bookmarked" filter, per-row indicators for *bookmarked* and
  *has a note*. **Icons: placeholders** in `icons.ts` until Tilman's arrive.
- Removed with Tilman's okay (2026-09-25): the scan page's spread card (top left, spread info + link
  to `/spreads`) and the header name line "Kevin Bray — Onion Skin and Crocodile Tears" (previous
  design iteration). The tutorial's last step now goes to scan mode (`/spread`) instead of `/spreads`.

Open:
- [ ] Entries **without a target** (e.g. Metafiction, the placeholder text) can never be consulted by
  scanning – with unconsulted entries hidden they would never appear. Decide: count them as consulted
  from the start, unlock them with their access page's spread, or require a target for every entry.
- [x] List text colours: the white/gold mix in frames 17/19/24 is **one gold gradient across the whole list**
  (measured from the PDF, DESIGN.md §1) – built so on 2026-09-25.
- [ ] Removal candidates (need okay): `/index` dev view with `index-page`, `spread-list`, `spread-item`,
  `target-item`, `index-button`; `close-button` if unused after the tutorial restyle.

---
## Phase 5 – Onboarding = Tutorial  `[x]` (built 2026-09-25; open: final texts, camera start – see below)

Adopt the tutorial flow and pages to the design (p.1–5). The tutorial stays; its steps become:
1. [x] Splash: Mark + "Onion Skin & Crocodile Tears" (advances after 2s or on tap)
2. [x] Title + "Kévin Bray" + "Building Fictions" – **fade-in 1s** (advances after 2.5s or on tap)
3. [x] Intro text + **Continue** – no fade, next frame appears directly
4. [x] Camera text + **Grant access** (`camera.requestAccess()`; denied → the camera-permission screen,
   the step stays)
5. [x] "Thank you!" + **Access scan** → scan mode

Built:
- Steps are content (`content/steps/step-1..5`, the old six steps replaced). Step contract extended
  (`shared/types`, guard, build schema): `title` / `description` optional, `footer`, `button`,
  `action` (`next` | `camera` | `scan`), `fadeIn`, `advance`; `*emphasis*` + blank-line paragraphs.
- `tutorial-page` (black vignette, auto-advance, "Skip" → scan), `tutorial-content` (Mark, texts, fade),
  `tutorial-navigation` (pill button with white glow, actions).
- **First visit → onboarding** (Tilman): `main.ts` opens `/tutorial` when `progress.onboarded` is false;
  finishing ("Access scan") or "Skip" sets it (`history.setOnboarded()`, additive field in format 1).
  Returning readers land on home; Info has a "Tutorial" button to start it by hand.
- Home restyled like the splash (Mark, title, author, "Start" + "Tutorial" pills) – Tilman: good.
- Camera-permission screen restyled after the onboarding (no own frame, Tilman): black vignette, gold
  text, camera icon in **gold chrome** (gradient from the new **gold scale** `--gold-100…900` in
  `main.css`, `--color-accent` = `--gold-500`) with a skeleton-loader-style sweep in the SVG (none with
  reduced motion). Separate "waiting for camera access" text while the browser asks; browser hints fixed
  (the lock emoji was mis-encoded).

Open:
- [ ] Final onboarding / home texts (placeholder) – with Kévin Bray and the designers.
- [ ] MindAR `autoStart` still starts the camera when the scene loads, i.e. before "Grant access" on a
  first visit (Phase 6 open question 3 / "camera only in scan mode"). The browser's permission prompt can
  therefore appear during the splash.
- [ ] `public/assets/illustrations/tutorial-step-{1,3,4,5}.svg` no longer referenced (step 2 = the camera
  icon source) – removal candidates.

---

## Phase 6 – A-Frame bridges  `[ ]` (moved from interim 1.1, decided 2026-09-24)

Decision: keep the current DOM-replacement approach (scene HTML generated from content via
`templates.ts`, injected with `innerHTML`) through Phases 2–5 – it was chosen deliberately because
injecting entities / resetting targets caused issues before, and replacing the DOM lets the browser
handle it (target listeners reconnect correctly). Fix issues as we go; do the clean API here.

Goal: remove the static-template workaround and replace the bridges with one clean, dynamic
link between app/game state and A-Frame/MindAR state, behind a small API.

### Current state (analysis 2026-09-24)

| Piece | What it does | Problems |
|---|---|---|
| `static-scene-bridge.ts` (**live**, in `main.ts`) | Replaces the scene DOM with an **HTML string** generated from content (`templates.ts`), subscribes to `mode` + `currentSpread`, starts/pauses MindAR | Deliberate workaround (see decision above). Mode handling, loading, camera, MindAR internals all in one element; fixed sleeps (500/200/150/50 ms) |
| `scene-bridge.ts` (**not used**) | Artefact of the previous attempt: builds the scene with DOM calls (`createScene.ts`) | Entity injection / target reset issues led to the static bridge |
| `target-bridge.ts` (live) | Re-attaches `targetFound/Lost` listeners on every scene change (300 ms delay) | Index = number parsed from the target **id** (`target-003` → 3), not the MindAR index |
| `utils/templates.ts` (**live**) | Generates the scene HTML per spread from `game.config.json` (content-driven, cached) | `getAllTemplates` uses `require()` in ESM (broken, unused); model scale 0.5 |
| `utils/createEntities.ts` | DOM builders, switch on **asset** type | Model scale 0.05 (≠ templates), video without size/loop/playsinline, `link` → blue plane |
| `utils/createAssets.ts`, `createScene.ts`, `connectScene.ts` | DOM helpers for the unused bridge | `connectScene` path obsolete |
| `static/spread{1,2,3}.ref.ts`, commented scene in `index.html` | Hand-written scenes (reference for the template approach) | Not imported anywhere – the live scenes come from `templates.ts`; indices are pre-1d. Keep for now |
| `SceneService` | Holds the scene, `onSceneReady/onSceneChanged` | `HistoryManager` loads history on *scene ready* (unrelated coupling) |
| Store | `mode`, `currentSpread`, `trackedTargets: number[]` | `target-item` compares `trackedTargets` with `mindarTargetIndex` while the bridge pushes id-numbers → mismatch |

MindAR facts that shape the design (verified in the vendored build):
- `autoStart` defaults to **true** → the camera starts when *any* scene renders, i.e. already on the
  home page. The app does not control when the camera is requested.
- Removing the `mindar-image` component calls `system.stop()` → throws if the camera never started
  (the `stopProcessVideo` / `getTracks` errors seen earlier).
- `pause(true)` keeps the camera stream (fits consultation mode); `unpause()` before `arReady` throws.
- One `.mind` per MindAR start; switching spreads = new controller. Today: new scene + new camera.

### Proposal

```
Game store ──(mode, currentSpread)──▶  <ar-bridge>  ──commands──▶  ArScene (API)  ──▶ A-Frame + MindAR
Game store ◀──(targets, arStatus)───  <ar-bridge>  ◀──events────  ArScene
```

1. **`ArScene`** – the only code that touches A-Frame/MindAR. Plain class, no store access.
   ```ts
   type ArStatus = "idle" | "loading" | "ready" | "running" | "paused" | "error";
   interface IArScene {
     readonly status: ArStatus;
     readonly spreadId: string | null;
     load(spread: SpreadData): Promise<void>; // queued, latest wins; builds anchors + entities
     start(): Promise<void>;                  // camera + tracking; waits for arReady
     pause(keepCamera?: boolean): void;       // consultation keeps the stream
     stop(): void;                            // release camera (idle)
     on(e: "targetFound" | "targetLost", cb: (targetId: string) => void): () => void;
     on(e: "status", cb: (s: ArStatus, error?: string) => void): () => void;
   }
   ```
   - `mindar-image="autoStart: false"` → the app decides when the camera starts.
   - Scene built with DOM calls (no HTML strings, no template cache).
   - Target listeners attached by `ArScene` when it builds the anchors (no 300 ms re-scan).
2. **`<ar-bridge>`** – one thin custom element in `main.ts`, the only glue (replaces all three bridges):
   store → AR: `currentSpread` → `load()`, `mode` → `start()/pause()/stop()`;
   AR → store: found/lost → `game.targets`, status → new `arStatus` state (loading page, camera denied,
   debug overlay, Phase 3 UI).
3. **Entity registry** – `registerEntity(type, builder)`; a builder creates the entity and may return
   `onFound/onLost` hooks. Video: sized, `loop`, `muted`, `playsinline`, **autoplay on found, pause on
   lost** (Phase 3 requirement). Model as today. Target without entity → nothing in A-Frame (the found
   indicator is app UI, Phase 3). Extensible for 3D/other types (RULES #7).
4. **Store**: `trackedTargets: string[]` (target ids). History keeps today's key until the Phase 2 rekey.
   `HistoryManager` no longer waits for the scene.
5. **Tests**: `<ar-bridge>` + store mapping against a fake `IArScene` (happy-dom can't run A-Frame);
   `ArScene` verified in the browser pane with the fake camera + on devices.

### Spread switching – two options
- **A (recommended first):** new scene per spread, as today but through the API (proven to work now).
- **B (spike, later):** one persistent scene, keep the camera, swap the MindAR target set
  (`pause(true)` → dispose controller → new anchors → restart AR on the same video). Faster, no camera
  re-request (iOS), less memory churn, but relies on MindAR internals (`_startAR`). The API stays the same.

### Removals (need confirmation – RULES #1)
`static-scene-bridge.ts`, `scene-bridge.ts`, `target-bridge.ts` (merged into `<ar-bridge>`),
`utils/templates.ts`, `utils/connectScene.ts`, `static/spread{1,2,3}.ref.ts`, commented scene in
`index.html`, `SceneService` (replaced by `ArScene`; debug overlay reads from it). `utils/createScene`,
`createEntities`, `createAssets` are folded into `ArScene` + entity registry.

### Until then (Phases 2–5 on the current bridge)
- Phase 3 video autoplay / found indicator: implement in `templates.ts` + `static-scene-bridge.ts`.
- Stale-load guard: already done (queued scene loads, `arReady`).
- Camera only in scan mode / at "Grant access" (Phase 5) needs `autoStart: false` – can be set in
  `templates.ts` if needed earlier.
- `trackedTargets` id mismatch (`target-item`): fix when Phase 4 rebuilds the index.

### Open questions (decide when Phase 6 starts)
1. One bridge (`<ar-bridge>`) instead of scene + target bridge?
2. Option A now, B as a later spike?
3. Camera only when entering scan mode (not on app load)?
4. `trackedTargets` by target id (string)?
5. Confirm the removals above (`static/` + `index.html` scenes stay until then).
6. Drop the AR rendering of `link` targets (links are entries, not AR entities)? – No demo target uses
   `link` any more since 2026-09-25 (Shadows), the entity type itself is still supported.

## Phase 7 – Polish  `[ ]`

- Mark the Page WebM integration (alpha: WebM for Android, HEVC for iOS if needed), size variants.
- Device tests: iOS Safari + Android Chrome – memory when switching groups, video autoplay.
- Haptics fallback check.

---

## Design tokens

**Measured spec: `agents/DESIGN.md`** (colors, gold gradient, sizes, buttons/glass, gold text options,
style architecture, questions for the designers) – extracted from the PDF's vector data on 2026-09-25.
The notes below are the earlier, rougher summary.

- Font: Arial, extra tracking 20 → `letter-spacing: 0.02em`.
- Accent: **gold** for now (the PDF note says to use a flashy placeholder such as R100%; final color TBD). Keep it one CSS variable.
- Scan chrome on camera; consultation dark (black/dark grey), outlined pill buttons, glass highlight.

---

## Suggested order

0 → 1 (incl. 1e) → 2 → 3 → 4 → 5 → 6 → 7 (phases are numbered in execution order since 2026-09-24).
Phase 5 can run in parallel at any point; it mostly restyles existing tutorial pages.

## Open decisions (summary)

| # | Topic | Phase |
|---|---|---|
| 1 | ~~Name for page group~~ → `spread` | 1c ✓ |
| 2 | ~~Entry ↔ target relation~~ → entries top level, optional target, optional entity | 1c ✓ |
| 3 | ~~Consulted = visited?~~ → yes, term: consulted | 2 ✓ |
| 4 | ~~Modes vs views split~~ → mode declared per route, set by `navigate()`; IDLE / SCAN / CONSULTATION | 2 ✓ |
| 5 | ~~Header counter~~ → consulted / total entries | 3 ✓ |
| 6 | ~~Found-target indicator~~ → scan: shown, tap opens entry; consultation: visible for now | 3 ✓ |
| 7 | ~~`maxTrack`~~ → = max targets per spread (5), reduce after usability test | 0 ✓ |
| 8 | ~~Entry ↔ target cardinality~~ → 1:1 for now | 1c ✓ |
| 9 | ~~Design PDF in repo?~~ → yes, plus extracted images in `reference/` | ✓ |
| 10 | ~~Role of `/spreads`~~ → dev view for now | 2 ✓ |
| 11 | Content versioning via content builder (+ CDN) vs app version – Tilman | 2 |
| 12 | Deep link code prefix (`c-` / `s-` / `e-`) and which version `osct` carries – Tilman | 2 |
| 13 | A-Frame bridges: one bridge + `ArScene` API, spread switching A/B, camera start, removals | 6 |
| 14 | ~~Content model + type naming~~ → nested target, inline/ref entities, `*Data` game-configuration contract in top-level `shared/`, app model plain names, single entry point | 1e ✓ |
| 15 | **Review:** loading overlay concept – full-screen loader on every spread switch covers the menu (see Phase 3 page menu) – Tilman | 3 |
| 16 | ~~**Review:** found indicator in consultation mode~~ → **hidden** (checked against frames 15, 17, 21, 33: no indicator in any consultation frame) – matches the build | 3 ✓ |
