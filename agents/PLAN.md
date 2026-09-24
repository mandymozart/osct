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
- [ ] Set it explicitly in `client/src/components/aframe-bridges/utils/templates.ts`
      (currently `maxTrack: ${targets.length}`) from one shared constant (also used by the build check).

---

## Phase 1 – Cleanup + taxonomy  `[~]`

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
- [ ] Rename chapter → spread. Touches: `ChapterManager`, `switchChapter`, `currentChapter`, `chapters` state,
  `ChapterData`, `chapter-page`, `chapters-page`, `chapter-item`, `chapter-list`,
  `static/chapter*.ts`, content folders `content/chapters/*`, build script, route slugs.

Entries vs targets – **decided** (2026-09-24):
- [x] **Entries are top level** (own content type, e.g. `content/entries/<id>/`).
- [x] An entry *may* have a target (on a page group). The target is optional.
- [x] A target *may* have an AR entity projected in A-Frame. Today that is only **video**.
      Later possibly **3D models / other A-Frame entities** (to discuss with Kévin) →
      keep the entity type open/extensible, don't hardcode "video only".
- [x] Found target **without** AR entity → shows the image-with-drop-shadow indicator (Phase 4).
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

### 1d. Content pipeline  `[ ]` (after 1c)
- Extend `content/*` YAML + `scripts/src` build with the new taxonomy.
- Keep the existing `hideFromIndex` flag (as an entry flag).
- Extend `utils/__tests__/content-config.test.ts` to the new taxonomy.
- Build fails if a group has > 5 targets.
- Keep `client/public/assets/content` in sync as today.

---

## Phase 2 – State  `[ ]` (after 1c)

- **HistoryManager rethink.** Today history is keyed by `chapterId + targetIndex` (fragile if
  groups are re-cut). Key by stable ID (entry/target, depending on 1c).
- [x] "Consulted" = "visited": the same thing (entry opened → marked in history).
  Use **consulted** everywhere.
- Persist the last selected category (for "Entries" button → back to list with latest
  category, p.21) and last active page group (resume). Names follow 1c.
- Rename `switchChapter` → `switchSpread` (with the 1c rename).
- **Modes vs views** `[x]` proposal confirmed 2026-09-24.

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
    | `/tutorial` (step) | IDLE | = onboarding, Phase 3 |
    | `/about` | CONSULTATION | **= Info** (keep the name `about`, no rename) (frames 32–34): opened via the "i" button, info text + colophon, "Entries" back to the list |
    | `/spread` (was `/chapter`) | SCAN | HUD: Mark, counter, spread menu |
    | `/spreads` (was `/chapters`) | SCAN | **dev view** for now (list of all spreads/targets for testing) |
    | `/entries` (was `/index`, param `category`) | CONSULTATION | index page restructured |
    | `/entry` (new, param `entryId`) | CONSULTATION | entry detail as its own view (today entries expand inline in `target-item`) |
        | `/error`, `/not-found` | – (keep) | overlay |
  - Fix `isSameRoute` param comparison (key + value). Test exists as `it.fails` in
    `RouterManager.test.ts` – remove `.fails` when fixed.
  - Unknown slugs throw in `RouteResolver.createRoute` → `/not-found` is unreachable. Route them to
    `/not-found` instead (update the test that documents the throw).
- **Versioning: app version vs content version**  `[ ]` – owner: **Tilman** (agents: don't build, keep in sync)
  Two independent versions. Keep them apart in code, storage and QR codes.

  | | App version | Content version |
  |---|---|---|
  | What | the client code | spreads, targets, entries, media |
  | Source today | `client/package.json` → `__VITE_APP_VERSION__` → `game.version.version` | `scripts/package.json` → `npm_package_version` in `scripts/src/index.ts` → `game.config.json` `version` |
  | Used by | dev QR generator (`osct=`) | `HistoryManager` storage check (`ar-game-config-version`) |

  Current state / issues:
  - The content version comes from the **scripts package version**, not from the content itself →
    content changes don't bump it. Should be versioned **by the content builder** (e.g. explicit
    version in `content/`, or a hash of the bundle).
  - `game.config.json` is **imported at build time** → content is baked into the app build. A future
    **CDN upload** from the content builder needs the config (+ assets) to be fetched at runtime,
    with the content version in the path/manifest, and a check which app versions can read it.
  - Saved progress should be keyed/migrated against the **content version** (ties into the
    HistoryManager rethink above).
- **Deep links from printed QR codes**  `[ ]` – owner: **Tilman**
  Printed QR codes (book) are scanned with the phone's native camera and open the app URL, e.g.
  `/?code=c-<chapter>&osct=<version>`. Today **nothing reads these params on load** (`getUrlParam` in
  `utils/url-params.ts` is unused; the old parser `parseQRCodeURL` was deleted with the in-app scanner
  in 1a – see commit `f18618b:client/src/utils/qr.ts` for its logic).
  - Read `code` + version on startup, open the spread (later maybe an entry) via
    `RouterManager.navigate` (sets SCAN mode – RULES #2), handle unknown code / version mismatch.
  - Decide the prefix after the rename: `c-` (chapter) → `s-` (spread), `e-` (entry)? Keep `c-`
    working if codes are already printed.
  - Decide which version `osct` carries (app or content) – see versioning above.
  - Dev QR generator (`dev-tools/qr-generator.ts`) produces these URLs for testing
    ("Valid" / "Wrong App Version").
- `.mind` preloading via a **Preloader utility**: fetch into the browser cache only.
  Do **not** touch the A-Frame scene before the group is actually activated.
  Keeping two scene contexts alive is a later topic – not now.

---

## Phase 3 – Onboarding = Tutorial  `[ ]`

Adopt the tutorial flow and pages to the design (p.1–5). The tutorial stays; its steps become:
1. Splash: Mark + "Onion Skin & Crocodile Tears"
2. Title + "Kévin Bray" + "Building Fictions" – **fade-in 1s**
3. Intro text + **Continue** – no fade, next frame appears directly
4. Camera text + **Grant access** (hooks into existing `camera.requestPermission` / `camera-permission`)
5. "Thank you!" + **Access scan** → scan mode

- Content is placeholder; final texts follow.
- Home / about stay and get restyled.

---

## Phase 4 – Scan mode  `[ ]`

- **Mark the Page** – own component (e.g. `<mark-the-page mode="scan|consultation">`).
  - Placeholder for now: `reference/images/mark/` (scan + consultation state, large version)
    wrapped/traced as SVG.
  - Later: WebM animation, portrait, 480p/720p; 320p/240p variants if memory is tight.
    One state per mode. Tap toggles scan ↔ consultation (p.6, p.15, p.35).
- **Counter "12 / 150"** – [x] decided: header shows **consulted entries / total entries**.
- **Page menu** ("Pages activated", p.6–7): horizontal looped scroll at the bottom, lists
  **only spreads with content**, glass highlight on the active one, haptic on snap
  (`navigator.vibrate` – Android only, iOS Safari has none). Selecting = activate group
  (debounce while scrolling; guard against stale loads in `StaticSceneBridge`).
- **Found-target indicator** (p.9–14) – [x] decided:
  - The image with drop shadow indicates a **found target that has no AR entity** projected in A-Frame.
  - **Scan mode:** it appears; tap/click opens the entry in consultation mode.
    "New entry unlocked" + small rotation only if the entry was not consulted yet,
    otherwise jump straight to the entry.
  - **Consultation mode:** should eventually be hidden (it blocks the view). For now leave it
    visible for simplicity and check how it looks. → [ ] review visibility in consultation.
- **AR videos** (p.37–40): **autoplay** when the target is found. No "zoom out" hint needed:
  MindAR only plays once the target is fully in view.
- Deliverable for designers: the proper video must render correctly → also a consultation
  version (see Phase 5).

---

## Phase 5 – Consultation mode (formerly Index)  `[ ]`

- Entries list (p.17–29): category dropdown (Glossary / Videos / Texts / Links), count per
  category "consulted / total", alphabetical headers for glossary.
- Unconsulted entries: **hidden** eventually (more game-like). During dev: show them **locked**
  like the current index, to check that everything is listed. → make it a flag (dev/config).
- Entry detail (p.15, 20, 25, 30–31): meta table (name, access page, category, author for texts),
  then per category:
  - Glossary – text + image
  - Texts – long text
  - Videos – preview player in consultation (to check rendering); later maybe just a note
    "close consultation to view and find the video" + access page
  - Links – embedded player (YouTube etc.). If a page blocks embedding → "open in new tab".
    We have the rights to host linked pieces ourselves.
- "Entries" button → back to list with latest category (p.21).
- Info (p.32–34) = the existing **About page**, restyled: info text + colophon, opened via the
  "i" button in consultation mode.

---

## Phase 6 – Polish  `[ ]`

- Mark the Page WebM integration (alpha: WebM for Android, HEVC for iOS if needed), size variants.
- Device tests: iOS Safari + Android Chrome – memory when switching groups, video autoplay.
- Haptics fallback check.

---

## Design tokens

- Font: Arial, extra tracking 20 → `letter-spacing: 0.02em`.
- Accent: **gold** for now (the PDF note says to use a flashy placeholder such as R100%; final color TBD). Keep it one CSS variable.
- Scan chrome on camera; consultation dark (black/dark grey), outlined pill buttons, glass highlight.

---

## Suggested order

1a → 1c (decision) → 1d → 2 → 4 → 5 → 3 → 6.
Phase 3 can run in parallel at any point; it mostly restyles existing tutorial pages.

## Open decisions (summary)

| # | Topic | Phase |
|---|---|---|
| 1 | ~~Name for page group~~ → `spread` | 1c ✓ |
| 2 | ~~Entry ↔ target relation~~ → entries top level, optional target, optional entity | 1c ✓ |
| 3 | ~~Consulted = visited?~~ → yes, term: consulted | 2 ✓ |
| 4 | ~~Modes vs views split~~ → mode declared per route, set by `navigate()`; IDLE / SCAN / CONSULTATION | 2 ✓ |
| 5 | ~~Header counter~~ → consulted / total entries | 4 ✓ |
| 6 | ~~Found-target indicator~~ → scan: shown, tap opens entry; consultation: visible for now | 4 ✓ |
| 7 | ~~`maxTrack`~~ → = max targets per spread (5), reduce after usability test | 0 ✓ |
| 8 | ~~Entry ↔ target cardinality~~ → 1:1 for now | 1c ✓ |
| 9 | ~~Design PDF in repo?~~ → yes, plus extracted images in `reference/` | ✓ |
| 10 | ~~Role of `/spreads`~~ → dev view for now | 2 ✓ |
| 11 | Content versioning via content builder (+ CDN) vs app version – Tilman | 2 |
| 12 | Deep link code prefix (`c-` / `s-` / `e-`) and which version `osct` carries – Tilman | 2 |
