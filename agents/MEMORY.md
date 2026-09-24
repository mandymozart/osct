# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

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

## 2026-09-24 – `utils/config.ts` renamed to `utils/content.ts`

- [x] (user) The client module only reads built content, it configures nothing → `utils/content.ts`
      (test: `utils/__tests__/content.test.ts`). `scripts/src/config.ts` stays: it is real build config.
- [ ] Later, with runtime/CDN content loading (Tilman's versioning work), this becomes an async
      `ContentService` (`load()` + the same getters), like `SceneService` / `GameStoreService`.
- [ ] Rename `game.config.json` → `content.json`? Open, Tilman's call (touches versioning).

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
- [ ] Target listeners use the number in the target **id** as "index" (`target-003` → 3), not the
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
- [ ] 1d: the build should **fail** (not skip) on a missing target image, and ideally run the same
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
- [ ] Browser smoke run (in-app browser, camera blocked there): home, tutorial, scan HUD, index open
      without console errors; nav bar now only shows INDEX. AR tracking needs a real device.
- [ ] `hideFromIndex` (target-008 "Edge") is an existing content flag that hides a target from the
      index. Keep an equivalent on entries in 1c/1d – don't drop it in the rename.
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
