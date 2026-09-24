# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

## 2026-09-24 – Code placement (RULES #17)

- [x] (user) `getSceneState` / `isOverlayRoute` / `SCENE_STATE_BY_MODE` moved from `utils/scene-state.ts`
      into `SceneService` (scene logic, not store state, creates no DOM). Test:
      `services/__tests__/SceneService.test.ts`.
- [x] `utils/game-config.ts` stays in `utils/` – used across components, pages, managers and bridges.
- [x] (user) Empty `components/slotted-page/` removed (untracked, empty). `components/three-bridges/` is
      empty too – [ ] ask whether to remove. Old `.mind` files in `client/src/targets/` → Tilman's cleanup.

## 2026-09-24 – Mode vs scene state, overlays pause the scene

- [x] (user) Question: what separates SCAN, VR and CONSULTATION if consultation is an overlay? → Two
      dimensions were mixed. Mode = UI context (design); scene state = derived from mode + route.
      VR removed (user okay): never set, A-Frame VR UI disabled everywhere; enum value, 2 error codes,
      `exitVR()` calls gone.
- [x] (user asked to check) Should overlays stop the scene? Checked: the design's consultation is dark and
      slightly transparent (the scan view shows through faintly, frames 15/17) → a frozen frame looks the
      same. Measured: consultation and overlays only paused A-Frame, **MindAR kept tracking** underneath.
      Decision: overlays pause the scene (resources + no targets firing behind a page).
- [x] MindAR emits `arReady` and starts tracking itself right after → the bridge applies the scene
      state on the next tick, otherwise the pause is overridden (seen in the browser, fixed).
- [x] Verified in the browser (fake camera): tracking only in scan without overlay; paused in home,
      consultation, error/not-found overlays and after a spread switch while consulting; one live stream.

## 2026-09-24 – Phase 2: modes vs views implemented, git over SSH

- [x] Modes/routes as planned (see PLAN Phase 2). `GameMode.DEFAULT` is now `SCAN`; `CONSULTATION` is new
      (index, about → scene paused). Close / START / resume / last tutorial step all reach scan mode
      through the route, not by setting the mode.
- [ ] The scene is still *playing* in IDLE (home) – MindAR `autoStart` starts the camera on load.
      Covered by "camera only in scan mode" (Phase 5 "Grant access" / Phase 6 `autoStart: false`).
- [ ] TF.js warns "High memory usage in GPU" after several scene switches (1.17 MB in the pane) →
      check on devices in Phase 7 ("memory when switching groups").
- [x] (user) `origin` switched to SSH (`git@github.com:mandymozart/osct.git`); the user's SSH key
      authenticates, so agents can push. HTTPS had no credential helper configured.

## 2026-09-24 – Game configuration errors: build time vs runtime

- [x] Two layers, both kept (user agreed): `GameConfigurationError` (shared guard) = developer detail,
      every problem with its path; used by the **build** (collects them, exit 1) and logged by the app.
      `ErrorCode` + `ErrorInfo` = the **app's** error contract (code, message, type, details).
      `shared/` must not depend on app types; an assertion function has to throw to narrow.
- [x] Mapping at the app boundary: `utils/game-config.ts` catches the guard error, logs the problems,
      keeps `ErrorInfo { code: ErrorCode.GAME_CONFIGURATION_INVALID, type: "critical", details }` and
      falls back to an empty model so modules can load. `main.ts` checks `getConfigurationError()`
      first and renders a critical error screen instead of the app (no scene/camera), hides the loader;
      problem list shown in dev only. Before: the app hung on "Loading book" with the error only in the console.
- [x] The "page is part of a spread" rule moved into the shared guard (the app model maps entries to
      spreads by page; a config that passes the guard can always be mapped).
- [ ] Phase 2: the startup compatibility checks (app ↔ content ↔ storage) use the same path, e.g.
      content ahead of app → `ErrorCode.NOT_SUPPORTED`.

## 2026-09-24 – Unused types audit (cleanup by Tilman, see RULES #15)

Scanned `client/src`, `shared/`, `scripts/src` (exported types + enum members). Not counted as unused:
custom element classes (used by tag name), `.d.ts` declaration merging (`HTMLElementTagNameMap`,
`ImportMeta`, MindAR `Components`/`Systems`), `I*` component interfaces used by their own `implements`.

**Keep – part of a phase (use or drop there):**
- Phase 2: `LoadOptions`, `LoadResult` (`types/loader.ts`, early asset loader → `.mind` preloader);
  `ErrorCode.NAVIGATION_FAILED` (unreachable not-found route); `ErrorCode.NOT_SUPPORTED`,
  `NETWORK_ERROR` (versioning: content ahead of app, later CDN).
- Phase 3: `ErrorCode.SPREAD_LOAD_FAILED`, `SPREAD_NOT_READY`, `IMAGE_TARGET_NOT_FOUND` (spread menu);
  `ErrorCode.ENTITY_LOAD_FAILED`, `ASSET_NOT_FOUND`, `ASSET_TYPE_INVALID`, `ASSET_LOAD_FAILED`,
  `ASSET_NOT_READY` (video autoplay / entity loading); `Pages.NOTIFICATION` (no page yet – resume offers
  reuse the error page; candidate for "New entry unlocked" / notifications).
- Phase 5: `ErrorCode.CAMERA_PERMISSION_DENIED` (onboarding "Grant access").
- Phase 6: `EntityEvents` augmentation (`asset-loaded`, `asset-failed`, never emitted – entity registry);
  `scene-bridge.ts` (`SceneBridge`, not registered – artefact, decided to keep until Phase 6).
- VR (left untouched by the plan): `ErrorCode.FAILED_TO_ENTER_VR`, `FAILED_TO_EXIT_VR`.

**Removal candidates (no plan item) – check for duplicates/redundancy first (RULES #15):**
- [ ] `IPageRouter` (`types/router.ts`, `navigate()`/`close()`) – looks superseded by `IRouterManager`.
- [ ] `ILoadingPage` (`pages/loading-page.ts`) – declared, not implemented by `LoadingPage`.
- [ ] `ErrorCode.UNKNOWN_ERROR`, `INITIALIZATION_FAILED`, `NOT_READY`, `SPREADS_LOAD_FAILED`,
      `SOME_ASSETS_NOT_FOUND`, `ENTITY_NOT_FOUND` – generic or overlapping with the codes above.

**`page` on entries is not legacy** (checked 2026-09-24): the design shows "Access page 186" in every
entry detail ("Go to access page 186 in scan mode to see the video"); the spread menu shows the spread
range ("Pages activated: 24–25"). `page` stays the single source: the spread is derived from it
(an explicit `spread` field would be redundant and could contradict the page). The legacy field was
the per-target `bookId`.

## 2026-09-24 – Phase 1e done (content model + types)

- [x] Content migrated with `git mv` (history kept): targets nested into entries, media next to the
      entry, `castle` became a shared entity (`content/entities/castle`, `ref: castle`) to exercise refs.
      Removed: `content/targets/`, `*.asset.yaml`, per-target `.mind`, `relatedTargets`, `relatedSpread`,
      `hideFromIndex`, per-target `bookId`, `scripts/src/types/*`, `client/src/types/{assets,entities,content}.ts`.
- [x] Target ids are now entry ids (`target-003` → `old-castle`). Scene element id = target id; the
      listener gets the MindAR index from the configuration (no more number parsing). `trackedTargets`
      = target ids.
- [x] History stays numeric (decision b) but the number is now the **MindAR index** (before: the number
      parsed from the target id, e.g. 3/4/6/7 for spread2 – which also made completion % wrong).
      Saved dev history from before 1e may point at different targets. Proper rekey: Phase 2.
- [x] `link` entity has no asset any more: it renders the entry's title/body; the URL is the entry's `media`.
- [x] Fixed on the way: video asset markup had `playsinlinecrossorigin` (one word) → neither attribute was set.
- [x] Edge is now listed in the index (hideFromIndex dropped); index rows show the page instead of `bookId`.

## 2026-09-24 – Content model + type naming (→ Phase 1e)

- [x] (user) Bundle types keep the **`*Data`** suffix ("loaded from JSON", DTO). App-internal objects use plain
      names (`Spread`, `Target`, `Entry`, `Step`); services/controllers `I*`; runtime state `*State`.
      `EntityData` = description of an A-Frame entity.
- [x] (user) The game-configuration contract (`*Data` + guards) lives in a top-level `shared/` folder used by
      client and build; all other types stay in `client/src/types`.
- [x] (user) Single source of truth: only `utils/game-config.ts` reads `game.config.json` (type guard → map).
- [x] (user) Vocabulary: content = authored input; game configuration = build output (`game.config.json`
      keeps its name, root type `GameConfiguration`); `*Data` = its parts. `utils/content.ts` was renamed
      to `utils/game-config.ts` (test `game-config.test.ts`) – a third rename, now following this vocabulary.
- [x] (user) Drop `hideFromIndex` in 1e; `TutorialStepData` → `StepData`.
- [x] (user) The future data access is **an API generated by a tool** with several services
      (e.g. `UserService`, `NotificationService`) – not a hand-written `GameConfigService`/`ContentService`.
      `utils/game-config.ts` is the interim loader that this API will replace or feed.
- [x] (user) Nest the target in the entry; target id defaults to the entry id (no conflict with the MindAR
      index, which is positional). Entities inline **or** `ref` to `content/entities/<id>`; no logic in content.
- [x] (user) `book.yaml` with `id: osct`; drop `relatedTargets`; keep `tags` (not in the design – only the four
      categories – but useful for a future content manager / frontend filters).
- [x] (user) History stays numeric until Phase 2 (option b).
- [x] Agent proposal: no `*Source` interfaces – YAML is parsed (`unknown` → validated → `*Data`); the schema
      holds the authoring rules. Bundle mirrors the source nesting; no reverse references in the JSON
      (indexes are built in memory – all content is loaded at startup anyway).

## 2026-09-24 – Content build checksum

- [x] (user) Build computes a sha256 over `content/`, `scripts/src/` (build logic) and the package version
      (text line endings normalised). Same hash as in `game.config.json` + public copy present →
      exit early, nothing rewritten, timestamp unchanged. `--force` rebuilds. Tested: first build,
      unchanged rerun (file untouched), content change, undo (hash back to the original), `--force`,
      missing public copy.
- [x] No more manual revert of timestamp-only `game.config.json` changes.

## 2026-09-24 – Phases renumbered to execution order

- [x] (user) Phase numbers now follow the order of work: 2 State · 3 Scan (was 4) · 4 Consultation
      (was 5) · 5 Onboarding (was 3) · 6 A-Frame bridges · 7 Polish. References in agents/*.md and code
      comments were updated; **commit messages before this date use the old numbers**.
- [x] Reference scenes renamed `static/spread{1,2,3}.ref.ts` (+ `static/README.md`); still not imported.

## 2026-09-24 – A-Frame bridges: Phase 6, keep the static bridge until then

- [x] (user) Clean A-Frame bridge API (`ArScene` + one `<ar-bridge>`) becomes **Phase 6**; Polish moves
      to **Phase 7**. Phases 2–5 keep working on the current bridge; fix issues as we go.
- [x] The DOM-replacement approach (`static-scene-bridge` injects scene HTML via `innerHTML`) is
      **deliberate**: injecting entities / resetting targets dynamically caused issues before; replacing
      the DOM lets the browser handle it and target listeners reconnect correctly.
      `scene-bridge.ts` is an artefact of that earlier attempt.
- [x] Clarified: the live scene HTML is generated from `game.config.json` by `utils/templates.ts`
      (content-driven). `static/spread{1,2,3}.ts` (now `.ref.ts`) and the commented scene in `index.html` are not
      imported – kept as reference until Phase 6.

## 2026-09-24 – `utils/config.ts` renamed to `utils/content.ts` (later → `utils/game-config.ts`)

- [x] (user) The client module only reads built content, it configures nothing → `utils/content.ts`
      (test: `utils/__tests__/content.test.ts`). `scripts/src/config.ts` stays: it is real build config.
- [x] ~~Later an async `ContentService`~~ → superseded: a tool-generated API (see the 1e entry above).
- [x] ~~Rename `game.config.json` → `content.json`?~~ → no, it keeps its name (user).

## 2026-09-24 – Spread switch reload loop fixed

- [x] Reported by user: switching spreads caused a reload loop. Cause: `StaticSceneBridge.activate()`
      called MindAR `unpause()` before the `.mind` targets were loaded (`controller` exists early,
      `markerDimensions` is set later) → throws → the catch re-ran `setupScene()` (rebuilds the scene and
      duplicates store listeners) → same race again. Fix: activate only after the scene's `arReady`
      event; no re-init in the catch. Pre-existing, not caused by the maxTrack change.
- [x] Fast switching raced (older load finished last → wrong scene, leaked camera streams). Scene loads
      are now queued; each step loads the spread wanted at that moment (stale ones are skipped).
      This was the Phase 3 "guard against stale loads" item. Debounce for the scroll menu still Phase 3.
- [x] Verified in the browser pane with a fake camera (canvas `captureStream`, one fresh stream per
      `getUserMedia` call – reusing one stream breaks MindAR restarts because `stop()` ends its tracks):
      5 sequential + 4 rapid switches → right `.mind`, 1 scene, 1 live camera stream, no errors.
      User tested the changes on 2026-09-24 ("tested everything") – no issues reported.
- [~] (fixed in 1e, section E) Target listeners use the number in the target **id** as "index" (`target-003` → 3), not the
      MindAR index; history is keyed by it. Works but fragile → Phase 2 history rekey.

## 2026-09-24 – Phase 1d done (entries) + Phase 0 constant

Agent decisions (reversible, flagged for review):
- [x] Entry → target link lives on the **entry** (`target: target-000`), since an entry may have a target.
- [x] The 6 demo 3D-model targets became **glossary** entries (categories are fixed; 3D models are demo
      leftovers). The 3 demo videos → videos, Shadows → links.
- [x] Shadows keeps its target entity type `link` (client scene code unchanged) **and** the entry has the
      URL as `media`. The duplication goes away when entities are reworked (Phase 3: target without AR
      entity → found indicator).
- [x] Two scene builders set `maxTrack`: `templates.ts` (used by `static-scene-bridge`) and
      `createScene.ts` (used by `scene-bridge`). Both used `targets.length`; both use the constant now
      (verified in the browser: `maxTrack: 5`). Two parallel scene bridges → worth a look in Phase 3.
- [ ] Build validation stops at the first blocking error per entry (e.g. duplicate target), so later
      checks for that entry show up on the next run.

## 2026-09-24 – Phase 1c rename done (chapter → spread)

- [x] Demo spreads now cover pages **1–2, 3–4, 5–6** (like the final book). Only page ranges changed;
      target assignment and `.mind` files unchanged.
- [x] `target-000` "Shadows" restored (user found the missing image `images-000.jpg`, 254×650 = the
      size compiled into `spread1.mind`). It had been silently dropped by the build while still being
      image 0 in `spread1.mind` → spread1 targets were off by one in AR. Now 10 targets, spread1 =
      Shadows (link), Racoon, Ancient Tree, Sleeping Dragon, matching the original `.mind`. (A short-lived
      removal in `6ad6d8e` was rolled back.) New test: each spread `.mind` must contain exactly its
      targets' images in `mindarTargetIndex` order. The "files exist" test skips external link URLs.
- [x] Unreferenced `target-000/images-010.jpg` deleted (user), incl. its copy in `client/public`.
- [x] ~~Build never removes stale files in `client/public`~~ – wrong: `copyContentToPublic` already
      deletes the folder before copying. The stale file only lingered because the build hadn't run yet.
- [x] 1d: the build should **fail** (not skip) on a missing target image (done in 1d), and ideally run the same
      `.mind` ↔ targets check.
- [x] ~~Dead code: `static/spread{1,2,3}.ts` + commented scene in `index.html`~~ → kept as reference
      (user), renamed to `*.ref.ts`. See the Phase 6 decision above.

- [x] Rename done in code, content, build script, routes, tests (see PLAN 1c). QR prefix `c-` kept.
- [x] Saved history from before the rename (`chapterId` entries, or spreads that no longer exist) is
      dropped on load instead of offering a broken resume (`HistoryManager.loadTargetHistory`, tested).
      Proper migration → Phase 2 (stable IDs + content version).
- [ ] `docs/` (Docusaurus) still uses chapter terminology throughout – update or retire later.
- [ ] `client/public/assets/targets/chapter{1,2,3}.mind` are unreferenced legacy files. Ask before removing.
- [ ] Pre-existing bug (not from the rename, verified on the pre-rename commit): switching spreads
      while MindAR never started (camera denied) throws `Cannot read properties of undefined (reading
      'stopProcessVideo')` from MindAR during scene teardown (`static-scene-bridge.ts`). Guard in
      the scene bridge, relevant for Phase 3 spread menu switching.
- [x] Lesson: on Windows the running vite dev server locks files. **Stop the preview server before
      `git stash` / `git checkout` / `git reset`** – a stash with the server running half-reset the tree
      (recovered fully from the stash, verified identical).

## 2026-09-24 – Phase 1a done (QR removed)

- [x] QR scanning removed completely (components, manager, types, utils, deps `jsqr`,
      `qrcode(.min).js`, `GameMode.QR`, QR error codes).
- [x] The client had **no test files**. Added a basic suite (27 tests, `client/src/**/__tests__/`):
      `BaseStore` (change detection, cleanup, immutability), `RouteResolver`/`RouterManager`,
      `HistoryManager` + `TargetManager` (seen/persist/resume/corrupt storage), and a
      **content-config** check on the built `game.config.json` (≤ 5 targets per group, MindAR indices
      0..n-1, unique ids, referenced files exist in `public/`). These guard Phase 1c/1d/2.
- [ ] Found by the tests: `RouterManager.navigate()` with an unknown slug **throws** in
      `RouteResolver.createRoute`, so the `/not-found` branch is unreachable. Documented in a test;
      fix in Phase 2 together with `isSameRoute` (that one is an `it.fails` test – drop `.fails` when fixed).
- [x] Browser smoke run (in-app browser, camera blocked there): home, tutorial, scan HUD, index open
      without console errors; nav bar now only shows INDEX. AR tracking needs a real device.
- [x] ~~Keep `hideFromIndex` as an entry flag~~ → dropped in 1e (user; the design's hidden-unconsulted flag covers it).
- [x] **Dev overlay QR generator is kept** (user, 2026-09-24): needed to open the dev server on a
      phone for testing. It was removed in 1a by mistake and restored (`qr-generator.ts`,
      `types/qr/qrcode.ts`, `qrcode.js`, `window.QRCode` type). Only in-app QR *scanning* is gone.
      Options trimmed to **Valid** + **Wrong App Version** (invalid code / wrong chapter / plain text removed).
- [x] Versions: **app version** = `game.version.version` (`__VITE_APP_VERSION__` ← `client/package.json`);
      **content version** = `game.config.json` `version` (← `scripts/package.json`, used by
      `HistoryManager` for storage versioning). The QR `osct=` param is the app version. Fixed
      `osct=undefined` (read a non-existent `import.meta.env.VITE_APP_VERSION`); removed the phantom
      `VITE_*` entries from `ImportMetaEnv` so this can't happen silently again.
- [x] **Printed QR codes are a real entry point** (user): scanned with the phone camera, they open
      `/?code=…&osct=…`. The app does not read these params on load yet → planned in PLAN Phase 2
      "Deep links from printed QR codes". **Owner: Tilman** (agents don't build it).
- [x] **App version ≠ content version** – very important, keep them apart. Content should be versioned
      by the content builder (possibly uploading to a CDN later). PLAN Phase 2 "Versioning".
      **Owner: Tilman.**
- [x] `beta/` (old prototype sandbox) removed on request (2026-09-24). Docs (`docs/docs/*`) cleaned
      of QR; the 2025 blog post stays as history.
- [ ] Chapter → spread rename changes persisted history (`chapterId` in localStorage). Existing
      sessions only get the "configuration changed" warning; Phase 2 re-keys history anyway.

## 2026-09-24 – Naming, cardinality, maxTrack

- [x] Page group is called **spread** (chapter → spread rename pending).
- [x] One target ↔ one entry for now.
- [x] Consulted = visited. Term: **consulted**.
- [x] `maxTrack` = max targets per spread (5); reduce after the usability test.
- [x] `/spreads` list page becomes a **dev view** for now (bottom spread menu is the user-facing selector).
- [x] Info (design frames 32–34) = the existing **About page**, restyled, in consultation mode.
      About and Info mean the same; keep the name `about`, no rename.
- [x] Entry detail becomes its own view (`/entry`); today entries expand inline in `target-item`.
- [x] Modes vs views confirmed: modes `IDLE` / `SCAN` (replaces `DEFAULT`) / `CONSULTATION`;
      each route declares its mode, `RouterManager.navigate` sets route + mode in one update.

## 2026-09-24 – Taxonomy, header, indicator

- [x] **Entries are top level.** An entry may have a target; a target may have an AR entity.
      AR entities are only videos today; 3D / other A-Frame entities may follow (to discuss
      with Kévin) → keep entity types extensible.
- [x] Header counter = consulted entries / total entries.
- [x] Image with drop shadow = found target without AR entity. Scan mode: shown, tap opens
      the entry in consultation. Consultation mode: eventually hidden, visible for now to test.
- [x] `.windsurfrules` deleted; `RULES.md` replaces it.
- [x] Folder renamed `agent/` → `agents/`.
- [x] Design PDF stays in the repo. All useful images were extracted to `reference/images/`
      (Mark, book pages, entry examples) and every page was rendered to `reference/frames/`.
      Index: `reference/README.md`.

## 2026-09-24 – Design 260804 kickoff

### Decisions
- [x] Design PDF from the designers (Virginie Gauthier, Rudy Guedj) for Kévin Bray's book
      *Onion Skin & Crocodile Tears*: `reference/design-260804.pdf`. Plan: `PLAN.md`.
- [x] Keep current libraries, work around the MindAR target limit:
      **max 5 targets per `.mind` group**. Designers keep spreads under that.
- [x] Page groups are currently spreads (2 pages). User selects the spread in a bottom scroll menu.
- [x] QR mode removed from the design → remove QR code and deps. Everything else stays and is
      restructured (home, tutorial, about, index, chapters, resume session).
- [x] "Index" mode is now called **consultation mode**.
- [x] Tutorial = onboarding flow (p.1–5), adopted not replaced.
- [x] Mark the Page = animated avatar / home button by Kévin, own component.
      Placeholder: `reference/images/mark/`.
      Final: WebM, portrait, 480p/720p (+320p/240p if memory is tight).
- [x] Videos category = AR overlays on pages. External videos are Links.
- [x] AR videos autoplay. No zoom-out hint (MindAR plays only when the target is fully visible).
      Also a video preview in consultation mode to check rendering.
- [x] Unconsulted entries: hidden in the final app, shown locked during dev (flag).
- [x] Links: embed when possible, otherwise "open in new tab". We have the rights to host linked pieces.
- [x] Accent color: gold for now, final TBD.
- [x] `.mind` preloading = browser cache only via a Preloader utility; no second scene context yet.
- [x] Plan / rules / memory live in `agents/` and are part of the repo.

### Open
- [x] Naming → spread
- [x] Entry ↔ target taxonomy → see 2026-09-24 taxonomy block
- [x] Entry ↔ target cardinality → 1:1
- [x] Consulted = visited
- [x] Modes vs views split → confirmed
- [x] `/spreads` (was `/chapters`) → dev view for now
- [x] Header counter → consulted / total entries
- [x] Found-target indicator behaviour → see taxonomy block
- [ ] Indicator visibility in consultation mode (review after trying)
- [ ] Note on PDF p.37–39 (sentence was cut off)
- [x] `maxTrack` → 5 (= max per spread)
- [x] `.windsurfrules` → deleted
- [x] Design PDF stays in the repo
- [ ] Final content → on-site session in Amsterdam, fall 2026
