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

- Libraries stay: three.js (A-Frame until Phase 9) + the 8th Wall engine (MindAR until 1.3.0, Phase 13) +
  immer + vanilla custom elements + vite/vitest.
- **Max 10 image targets per spread** (was 5 with MindAR) – the engine tracks 4 at the same moment.
- A spread = two pages. The user picks the active spread in the bottom scroll menu; turning to a
  neighbouring spread switches by itself (its targets are kept loaded, Phase 13).
- Self-made page/view management stays. Transitions are simple (CSS), no router/animation lib.
- Content (texts, videos, Mark animations) arrives later (on site in Amsterdam, fall 2026).
  Build everything against placeholder content.

---

## Done phases (0–6, 12)

Moved verbatim to `archive/PLAN-done.md` (#31): Phase 0 Target limit, Phase 1 Cleanup + taxonomy (QR removed, taxonomy, content pipeline, content model), Phase 2 State, Phase 3 Scan mode, Phase 4 Consultation mode, Phase 5 Onboarding = Tutorial, Phase 6 A-Frame bridges, Phase 12 `.mind` compilation (superseded by Phase 13).

### Open items of the built phases

Verbatim from the archived phases; tick them here.

From Phase 2 – State:
  - [ ] Device check (Phase 7): preloaded videos vs. the `<video>` element's range requests (iOS Safari).
From Phase 3 – Scan mode:
  - [ ] **Loading overlay concept review** (Tilman, 2026-09-25): today every spread switch shows the
    full-screen `loading-page` (`game.startLoading()` in `static-scene-bridge.ts`), which covers the
    scan chrome incl. the spread menu until the new `.mind` is ready – the reader can't keep scrolling.
    Review: which loads block the app (startup, invalid content) vs. which only need an inline state
    (spread switch: e.g. a quiet indicator on the menu / under Mark, scene fades in on `arReady`);
    one loading concept for startup, spread switch, entity/asset loading (`ErrorCode.*_NOT_READY`)
    and the Phase 6 `arStatus`. Preloaded neighbours (Preloader) make most switches fast already.
From Phase 4 – Consultation mode (formerly Index):
- [ ] Entries **without a target** (e.g. Metafiction, the placeholder text) can never be consulted by
  scanning – with unconsulted entries hidden they would never appear. Decide: count them as consulted
  from the start, unlock them with their access page's spread, or require a target for every entry.
From Phase 5 – Onboarding = Tutorial:
- [ ] Final onboarding / home texts (placeholder) – with Kévin Bray and the designers.
From Phase 6 – A-Frame bridges:
- [ ] Memory on devices when switching (TF.js "High memory usage in GPU" seen with A earlier).
From Phase 12 – `.mind` compilation in the content builder:
- [ ] Production server: check the `.gz` copies again – see Phase 9b "Production host".

---

## Phase 7 – Polish  `[ ]` (paused 2026-09-25 – Tilman does extensive device testing first; don't start unasked)

- Mark the Page WebM integration (alpha: WebM for Android, HEVC for iOS if needed), size variants.
- Device tests: iOS Safari + Android Chrome – memory when switching groups, video autoplay.

## Phase 8 – Sound design and haptic feedback  `[ ]` (added 2026-09-26 – after the designers' feedback, during or after the content phase)

**Sound design as a system: epic #373** (2026-11-25, Tilman) – samarecordings' engine as a modular sound engine: events →
slots (experience: the 2D app; target: in place, stereo or 3D/HRTF) → base engine + synth plugins (`registerSynth`), one
mixer with video and voice, presets and samples in the Library. Concept `agents/research/2026-11-25-sound-design.md`,
drafts `agents/design/sound-design.html`; decisions D1–D13 open.

Built as a first step (2026-09-26, `FeedbackService`, see MEMORY): events tick (spread slider), tap
(buttons), found, unlock; generated chiptune placeholder sounds (a calm second take was reverted 2026-09-26); Info → Settings "Sound & vibration".

- [ ] Sound design: final sounds for `client/public/assets/sounds/` (tick, tap, found, unlock) – Tilman /
  designers; more events if the design asks for them (e.g. entry opened, spread switched).
- [ ] Haptics on Android: test with the phone **not** on silent (Chrome ignores `navigator.vibrate` in
  silent mode – that was the "no vibration" on the S22, 2026-09-26); tune the pulse lengths (8–10 ms may
  be too weak for some motors – try 10 / 20 / 35 / 60 ms over USB debugging).
- [ ] Haptics on iOS: check the iOS 18 switch trick (taps; slider while scrolling probably not).
- [ ] Sounds vs. silent mode: web pages can't detect it (sounds play as media) – decide if that is fine.
- [ ] Review with the designers: which moments get feedback, volume, defaults (on/off).

## Phase 9 – Performance  `[~]` (built 2026-09-26 on branch `performance`, tested on the S22; open: iPhone, model textures)

Lighthouse (mobile, 2026-09-26): performance 56, FCP 6.0 s, LCP 17.2 s, TTI 6.3 s. Causes: three
render-blocking scripts in `<head>` (A-Frame, aframe-extras, MindAR – 3.9 MB raw / 817 KB gz), A-Frame boot
(1.9 s of 2.8 s main thread), the AR scene built at startup (spread 1 models – racoon.glb 1.9 MB – load
while the splash waits behind `loading-page`), `aframe-extras` (750 KB) only for `animation-mixer`,
uncompressed `.glb` responses, no cache headers.

Decided (Tilman, 2026-09-26): drop A-Frame, render with plain three.js and MindAR's three.js build
(`mindar-image-three.prod.js`, MindAR 1.2.5, `three` external); splash in the static HTML, faded out when
the app is ready. PWA later (→ Phase 9b, built 2026-09-26).

- [x] **three.js AR layer**: MindAR's `mindar-image-three.prod.js` was not usable as is (imports
  `sRGBEncoding`, removed in three r162; adds a CSS3D renderer) → vendored MindAR 1.2.5 `Controller` build
  (`client/src/vendor/mind-ar/`, not the npm package – its `canvas` dependency broke CI) + own port of
  `MindARThree` (`ar/tracker.ts`): no internals any more, a spread switch replaces only the controller
  (camera kept). `ar/view.ts` renderer + loop, `ar/assets.ts` load/dispose per asset id,
  folder `aframe-bridges/` → `ar-bridges/`.
- [x] Entities on three: video plane (`VideoTexture`), chroma key as `ShaderMaterial` (same GLSL), glTF
  model with `AnimationMixer` (replaces aframe-extras), image plane; A-Frame's default lights; entities and
  assets dispose their GPU resources on every swap.
- [x] **Lazy AR** (`LazyArScene`): three (154 KB gz) + MindAR/TF.js (302 KB gz) are their own chunks,
  imported on the first RUNNING wish or warmed up in idle time 1.5 s after startup (plus the current
  spread's `.mind` + content into the HTTP cache). The scene / WebGL context is built on the first scan.
  Startup no longer waits for the AR scene: `main.ts` ends the loading state when the app is ready.
- [x] Removed A-Frame, aframe-extras, the A-Frame MindAR build, unused `deps/three.module.js`,
  `@types/aframe`, A-Frame type files; RULES stack / #4 / #12 / #17 rewritten.
- [x] **Static splash** in `index.html` (Vite plugin writes the first onboarding step from the game
  configuration, `utils/static-splash-html.ts`), fades out (`utils/static-splash.ts`) when the app is
  ready: a link at once, else after the step's `advance` time counted from first paint (tap skips). The
  app starts underneath with the next step (onboarding step 1 / scan mode). `#initial-loader` removed.
- [x] Netlify `_headers`: built files in `assets/app/` (hashed) cached immutable for a year; `robots.txt`;
  meta description, theme color, charset.
- [x] **Models, automated in the content build** (`scripts/src/utils/optimize-models.ts`, Tilman
  2026-09-26: automate it so it works for the final content): every `.glb` in the client copy gets
  textures ≤ 1024 px (opaque → JPEG 85), meshopt geometry, dedup/prune; kept when not smaller; `content/`
  stays as authored. Pure JS/WASM (pngjs, jpeg-js, meshoptimizer – no sharp calls): deterministic, CI
  compares the output. Demo models 2.3 MB → 312 KB (racoon 1854 → 114 KB: a 2048² PNG texture). Checked:
  all models load with the client's Meshopt decoder, render, animations kept.
- [x] Device check S22 Chrome (2026-09-26): tracking, spread switch with the camera kept, all demo targets
  displayed and played (Tilman), splash → scan flow.
- [ ] Device check iPhone Safari: tracking, video textures, camera start, memory on spread switches.
- [ ] Device check of the optimised models on the phone (loaded + rendered in the desktop browser only).
- [x] Lighthouse on staging (2026-09-26, mobile, same settings): **99** (was 56) – FCP 1.3 s (6.0), LCP 1.5 s
  (17.2), TTI 1.5 s (6.3), TBT 70 ms, no render-blocking resources.
- [x] Round 2 (2026-09-26): the content build (`scripts/src/utils/optimize-media.ts`, was optimize-models.ts)
  also scales images to ≤ 1200 px (JPEG when opaque; re-encoded only when scaled or ≥ 25 % smaller – edge
  777 → 266 KB), writes a gzip copy `<spread>.mind.gz` (fflate, deterministic; −45 %, spread1 1282 → 706 KB;
  hosts serve `.mind` uncompressed) – the client unpacks it (`utils/mind.ts`, DecompressionStream; the
  `.mind` as fallback), preloader and tracker use the same URL – and reports videos > 4 MB with export
  advice (not re-encoded: ffmpeg is native). Render loop: frames only while an entity is visible or
  animating (+ one clearing frame). `node-fetch` (TF.js, Node only) aliased to a stub – no dev-server error.
- [x] Round 3 (2026-09-26, Lighthouse on staging): build minified with terser instead of esbuild (main.js
  67 → 62 KB gz, MindAR 302 → 290 KB gz; the "111 KB" Lighthouse estimate for the MindAR chunk is its
  heuristic – ~1,300 TF.js shader strings and the inlined worker, a stronger minifier gains ~4 %). `.glb`
  also get a gzip copy (models 312 → 224 KB; Netlify serves .glb uncompressed) – `utils/compressed.ts` loads
  `.mind` and `.glb` from the `.gz` (unpacks it, or takes it as is when the server already decoded it).
- [ ] Videos of the final content: 720p H.264 ~2 Mbit/s (demo: bunny 10.9 MB, edge 5.8 MB) – with the artist.
- [x] Device check of round 2 on the S22 (staging, 2026-09-26): `.mind.gz` loaded + unpacked (cache hit for
  the tracker after the preload, neighbour preloaded), model renders while tracked, gone at once when lost.

**After the first staging test (Tilman, 2026-09-26):**
- [x] **Placement in the content**: `entity.params` `position` / `rotation` / `scale` (shared/types/placement.ts,
  checked by the content build + config guard, docs/content.md). Models stand on the page by default
  (`rotation: [90, 0, 0]`, scale 0.5) – they stood upright facing the top of the page before.
- [x] **Unlock = first find, tap = open the entry (= consulted)** (Tilman 2026-09-26, simple version until
  the designers / artist give the direction): the first find plays the unlock – "New entry unlocked" + the
  image's rotation (found indicator), for AR entities the discovery animation in WebGL (pop, one turn
  around the page normal, gold sparkles, ring – `ar/celebration.ts`) + the `unlock` jingle. A tap on the
  found image or on the AR entity (on-screen bounds + 24 px, taps on app UI ignored) opens the entry.
- [x] Nothing stays in space: a pause (entry opened) reports all targets lost and hides them – MindAR
  restarts its tracking state on resume and never reported them lost ("stuck in space"). Pinning: Phase 10.
- [x] Sounds per moment (Tilman 2026-09-26): **found** (every find after the unlock, "pew pew pew",
  `sounds/found.wav`, once per target every 4 s) · **unlock** (first find, jingle) · consult = tap (tap blip).
- [ ] Review the reveal / unlock / consult moments with the designers and the artist (animation, sounds).
- [~] Unlock animation "more spectacular" (Tilman 2026-09-26, branch `unlock-experience`): reverse emissive
  dissolve (Codrops) + gold bloom for every entity type; plain dissolve as reveal on later finds, rewound
  as outro when a target is lost – built, tune on the phone. Sounds: calm second take reverted (chiptune
  kept); runtime Web Audio synthesis proposed (no sound files).
- [x] Device check of placement + tap to unlock on the S22 (Tilman, 2026-09-26): works, animations "a good
  starting point".
- [?] **Pinning objects in space** → moved to Phase 10 (concept first).

## Phase 9b – PWA  `[~]` (built 2026-09-26 on `develop` – Tilman: "do the PWA now"; open: phone checks, final icon)

Installable app (home screen, standalone, splash) + offline start. Details: MEMORY 2026-09-26 "PWA".

- [x] Manifest (vite-plugin-pwa, `vite.config.js` → `dist/manifest.webmanifest`): name from `book.title`,
  short name "Onion Skin", black, portrait, standalone; iOS meta tags + `apple-touch-icon` in `index.html`.
- [x] Placeholder icons from Mark the Page (`public/assets/icons/`: 180, 192, 512, maskable 512).
- [x] Service worker `client/sw/service-worker.ts` (injectManifest, own tsconfig `sw/`, checked in CI):
  app shell precached (21 files, 2.7 MB incl. three + MindAR), pages network-first (offline: cached
  shell), content cached on first use per content build, video range requests from the cache.
- [x] Registered in production builds only, after the app is ready (`services/ServiceWorkerService.ts`).
- [x] Checked headless (Edge, production preview): worker controls the page, preloaded spread in the
  content cache, range request 206 from the cache, offline start of `/` and `/entries`, no
  installability errors.
- [ ] Phone checks: install on Android (Chrome prompt) and iOS (Share → Add to Home Screen); camera in
  standalone mode (iOS may ask for camera permission more often); progress in Safari vs. installed app.
- [x] Icons transparent where the platform allows (Tilman 2026-09-27): `icon-192/512` Mark only; maskable
  (Android home screen) and apple-touch-icon stay on black – both platforms fill transparency anyway.
  Favicon = Mark the Page with a dark outline (was the crocodile): `favicon.ico` 16/32/48 + `icons/favicon-32.png`.
- [ ] Final app icon (designers / Kévin) – replace the placeholders, same file names.
- [x] Home-screen name = the book title "Onion Skin & Crocodile Tears" (Tilman 2026-09-27; manifest
  `name` + `short_name` and the iOS title from `book.title` – phones may cut it short).
- [x] "Add to Home Screen" on the Info page (Tilman 2026-09-27: Info, not the onboarding – for now):
  section `settings-install` + `InstallService` – the browser's install dialog where there is one
  (Chrome, Edge, Samsung), Safari's Share → "Add to Home Screen" explained on iOS, "installed" when the
  app runs from the home screen. en/fr/nl/de.
- [x] **Whole-book download on the Info page** (Tilman 2026-09-27: keep "download as you read", add a
  full download in Info with a progress bar and the total size; no "clear" – removing the app is enough):
  section `settings-download` + `PreloaderService.downloadBook()` (all spreads' `.mind`, entity assets,
  entry images; 3 at a time, progress in bytes, runs on when Info closes, asks for persistent storage).
  Sizes from the build (`virtual:osct-content-sizes`, vite.config.js). Demo: 20.2 MB, ~40 s at 4 Mbit/s
  (headless). The service worker stores it (content cache); Info shows "on this device" afterwards.
- [ ] Test on the phones how long the whole download takes with real content; then decide whether it
  should also start by itself (e.g. after install, on Wi-Fi) – Tilman.
- [x] **Production host – when production is set up** (Tilman 2026-09-27: note it, handle it then). Done 2026-10-27 with
  the Docker image: `server/docker/apache.conf` sets the types and cache headers, `.htaccess` the SPA fallback,
  kamal-proxy https (docs/deploy.md). Was: `public/_headers` does not apply there. Needed: `.webmanifest` served as
  `application/manifest+json`; `service-worker.js` + `manifest.webmanifest` with `Cache-Control: no-cache`;
  `assets/app/*` cached immutable; SPA fallback to `index.html` (`_redirects`); https. E.g. an `.htaccess`
  on Apache.
  - [x] **Check the gzip copies again** (Tilman 2026-09-28). 2026-10-27, the image: `.gz` files are served as
    `application/x-gzip` without `Content-Encoding` (like Netlify – the app unpacks), `mod_deflate` compresses text only. Decided: the content build keeps writing
    `.mind.gz` / `.glb.gz` – it does all media optimisation, whatever the host. On the production server
    check: does it compress `.mind` / `.glb` itself (`mod_deflate`)? Does it send `.gz` files with or
    without `Content-Encoding: gzip`? (`utils/compressed.ts` handles both.) Keep the originals: fallback for
    browsers without `DecompressionStream` (iOS Safari < 16.4). Cost to weigh: ~1.8 MB git history per
    recompiled spread in `client/public/assets/content/` – gone once the content leaves the repo.

## Phase 10 – Spatial experience  `[ ]` (added 2026-09-26 – later; concept first, Tilman)

Objects that leave the page and live in the room: pinning a found object in space, floor / surface
tracking, a "connected space". Research: MEMORY 2026-09-26 "Pinning".

- [ ] **Concept: tap vs. pin** (Tilman is working it out first – see the concept notes of 2026-09-26 in
  MEMORY): what a tap does (unlock only / open the entry), what keeps an object in space, how it ends.
- [ ] Pinning with the gyroscope (3DoF, works with the 8th Wall engine, Android + iOS) – if the concept keeps it.
- [ ] Floor / surface tracking (6DoF): WebXR `immersive-ar` (hit test, anchors) – Android Chrome only,
  the WebXR session takes over the camera (the image tracking stops while it runs); iOS Safari has no WebXR AR.
  Alternatives: a commercial web SDK with world tracking (licence), or a native app later.
  8th Wall's engine binary has SLAM + image targets + Sky Effects together, but its licence (no paid products
  whose value comes substantially from it, no changes, credit, 5-day termination) rules it out; the MIT engine
  has neither SLAM nor sky segmentation (MEMORY 2026-09-28).
- [~] **Look-around: scene around the book + onion sky** (Tilman 2026-09-28, branch `spatialisation`, 1.5.0) –
  prototype built, **parked until the content discussion with Kévin**. Both are reader options in Info → Settings →
  Graphics, **off by default**. How it works, code, tuning and limits: `docs/look-around.md`; history: MEMORY 2026-09-28.
  - Built: world anchored to the book + gyroscope (3DoF), book and table stay clear, open roof, fades 45 s after the
    last page; onion sky = sky test on a small camera copy; one full-screen pass, placeholder café in the shader.
  - [x] S22 check (2026-09-28): orientation right, world stays with the book, book + table clear, ~27 fps (dev server).
  - [x] Merge `spatialisation` into `develop` – done: the look-around world is `engine/src/scene/look-around/`, the
    book's environment (schema 2.8, 2.10) is built on it.
  - **To decide with Kévin (content):**
    - [ ] What the world is: one for the book or one per spread? A still panorama (equirectangular image), a video,
          or 3D (heavier – then the pass needs a render target again)?
    - [ ] What the onion sky shows – the world's sky or its own image/animation; only outdoors or also through windows?
    - [ ] When it appears and ends: right after the first find (now), only after an unlock, only on some spreads?
    - [ ] Sound for the world? Interaction (tap objects in the world → entries)?
    - [ ] Default on or off for readers once the real content is in.
  - **Then build:** the content format (e.g. `world:` in `book.yaml` / `spread.yaml` with an image, schema + build +
    guard, RULES #5/#8), a `worldColour(dir)` that samples it (replaces `PLACEHOLDER_WORLD` in `shader.ts`), loading
    and caching with the spread (PreloaderService, service worker).
  - [ ] Checks: sky test outdoors (blue, overcast, dusk), iPhone (motion permission on the first tap, the engine's
        hidden camera video readable as a picture), frame rate with the page scenes on older phones.
  - Level 2 (own world tracking from the MIT engine's feature code) not planned – months, specialist.
- [ ] Decide per content which objects may leave the page (a flag in `entity.params`?).

---

## Phase 11 – Accounts  `[~]` (built 2026-09-27 on `database`, merged into develop + main in 1.1.1; open: SMTP, final texts, phone test)

Sign-in by email: link + 6-digit code; PHP API + MySQL in `server/` (docs/server.md). Optional password since 1.4.0.
- [x] API: request / verify (link or code) / logout, account (options, delete), progress per book with a
      version check (409 → merge). Hashes only, attempt and hourly limits, CORS by origin list. Tests: `server/tests/api-test.php`.
- [x] Mail: log / mail() / SMTP (own client), texts en/fr/nl/de, lists the chosen options for a new account.
- [x] App: `ApiService`, `AccountService` (sign-in state, progress sync: merge on sign-in, replace at startup
      when this device has no unsent changes, offline queue), `<settings-account>` on the Info page, `.field` primitive.
- [x] Options = three update switches (`<gold-switch>`: book, Kévin Bray, Building Fictions), **opt-in (off)**, under
      the email in the sign-up form; progress always saved, "Reset progress" resets it (also in the account).
- [x] Sounds / vibration as `<gold-switch>` too.
- [x] Info page groups: Info · Account (+ Reset progress) · Settings · colophon; Tutorial section removed (Tilman).
- [x] Staging server osct.porschuetz.de (app + API): `.github/workflows/deploy-staging.yml` (GitHub environment `staging`).
- [~] Production: the client's server (final hosting) – own workflow + GitHub environment `production`; the Netlify
      sites are dropped then. 2026-10-27: Kamal (`deploy-production.yml`, osct.buildingfictions.com, docs/deploy.md);
      open: server access + credentials (GitHub issues, milestone Release Japan). Netlify removed from the workflows.
- [x] Naming: **user** in code / API / database, "Account" in the UI (Tilman).
- [x] GitHub environment `staging` set, API deployed to osct.porschuetz.de from `develop`.
- [ ] Test on a phone (link on the iOS home-screen app → code).
- [~] SMTP account for production = **Amazon SES eu-west-1** (asgerb, 2026-10-27; docs/deploy.md "Mail"): deploy defaults to the
      SES endpoint, `mail-test.php` in the image, `ses-smtp-password.php`; open: SES SMTP credentials from asgerb / Building Fictions
      into the GitHub environments, sandbox check (GitHub issue, milestone Release Japan). Final mail + UI texts; privacy note for the update options.
- [x] Optional password (1.4.0, Tilman 2026-09-28): first sign-in by email, then set / change a password (no removal – 1.4.1);
      sign-in with email + password; bcrypt hashes; fields for password managers. Wording: one form for new and
      returning readers ("Send sign-in link").
- [ ] Phone test of the password flow (Chrome on the S22: save prompt; iOS: keychain in the home-screen app).
- [ ] Sending the updates (newsletter) – not built; the options are only stored.
- [x] ~~Netlify staging: `VITE_API_URL` to the dev API~~ – obsolete, Netlify dropped 2026-10-27 (the API is in the same image).

### Review 2026-09-27 (Tilman, phone test of staging + production)  `[x]`
- [x] Mark: the visible Mark exactly 1rem from the top on every page – the header pulls it up by the image's
      transparent margin (`--mark-inset-top` = 14 of 125 px of scan.png ≈ .67rem).
- [x] The dev debug line lies over the page and moves nothing (header, "i", consultation pages, tutorial "Skip").
- [x] Info: "Entries" pill in the page where the entries list has its category pill (10.75rem), the text where
      the list starts (≈16.56rem); the header's "Entries" only on the entry view.
- [x] Account text: "Register your copy now to save your progress and receive updates in your inbox." (en/fr/nl/de)
- [x] No double rule: the last section of a group has no bottom rule (the next title brings its own).
- [x] Options (`<gold-switch>`, one component for updates and sound/vibration): at least 4rem per row, .5rem above
      and below, labels wrap (no ellipsis).
- [x] Install: "Install as app on this device" stays until the app is installed (browsers offer their dialog only
      once); without a dialog a tap shows the steps; installed from the tab → "open it from your home screen".
- [x] Download: "Download all content" – explained as loading everything in advance (performance, offline).
- [x] Download only where it lasts (`InstallService.keepsDownloads`): with the service worker – browser tabs too
      (Android / desktop share the storage with the installed app); on iOS only in the home-screen app (Safari tabs
      keep their own storage and clear it after 7 days unused). Progress bar always shown: "x of y MB on this device".
- [x] Sections not available here (account without API, download in iOS Safari) remove themselves – no double rule.
- [x] The first line of every group 1rem below its title (Info, Account, Settings, Colophon): the first section has
      no top padding; in Sound & vibration the first switch row's text (not its 4rem box) starts there.
- Review done 2026-09-27 – develop merged into main.
- [x] Progress text without an accounts API doesn't point to the (hidden) account section.
- [x] *(obsolete – Netlify dropped 2026-10-27, production is the Kamal deploy)* Production (osct.netlify.app, `main`) used the dev API (Tilman): `VITE_API_URL=https://osct.porschuetz.de/api`
      on the production Netlify site + https://osct.netlify.app in ALLOWED_ORIGINS (GitHub environment `staging`).
- [x] Update switches before sign-up stay **off** (opt-in) – confirmed by Tilman.
- [x] Entry view like Info (Tilman): "Entries" in the page at the category pill's height, content where the list starts –
      one shared toolbar in `ConsultationPage` (`entriesToolbar()`); the header has no "Entries" any more.

## Design tokens

**Measured spec: `agents/DESIGN.md`** (colors, gold gradient, sizes, buttons/glass, gold text options,
style architecture, questions for the designers) – extracted from the PDF's vector data on 2026-09-25.
The notes below are the earlier, rougher summary.

- Font: Arial, extra tracking 20 → `letter-spacing: 0.02em`.
- Accent: **gold** for now (the PDF note says to use a flashy placeholder such as R100%; final color TBD). Keep it one CSS variable.
- Scan chrome on camera; consultation dark (black/dark grey), outlined pill buttons, glass highlight.

## Phase 13 – 8th Wall image tracking  `[~]` (1.3.0, 2026-09-28 – exploration "webworker tracking", Tilman: "move to 8th Wall entirely")

Research and phone results: `research/webworker-tracking.md`, `MEMORY.md` 2026-09-28.
- [x] 8th Wall engine (`@8thwall/engine`, MIT) behind `IImageTracker`; image targets made in the app from the
      target images (whole image fitted into the engine's 3:4 frame), `xr8.ts`.
- [x] Neighbouring spreads' targets kept loaded (`prepareTargets()`, ±1 default, debug overlay ±0/±1/±2/all);
      a switch to a neighbour starts at once (S22: 0–5 ms).
- [x] Automatic spread switch: a neighbour's page held 400 ms → `spreadSeen` → `switchSpread()` (scan mode).
- [x] Demo spreads 4–14 from the layout PDF (29 → 25 targets after duplicates), load test with all loaded.
- [x] MindAR removed: vendored build, tracker, `.mind` files, `compile:mind` tooling, `mindSrc` /
      `maxTargetsPerSpread` in the game configuration, `.mindar/`. Max targets per spread 10.
- [x] Engine files precached with the app shell (offline AR), LICENSE served next to them; credited in the
      project README, not on the Info page (Tilman).
- [x] S22 check of the 8th Wall-only build (2026-09-28): 11 automatic switches across the book (pages 1–27), next spread ready in
      0–3 ms, photo spreads 20–23 found, models and videos load.
- [x] Cleanup (1.3.2): targets keyed by id – `index` (MindAR's target number) and the target `order` removed
      from content, schema, shared types, build and client; the `.mindar/` files committed by mistake removed.
- [ ] iPhone Safari → Phase 14 (Tilman: tested with the content, in Amsterdam).
- [x] Debug overlay shows what the engine holds (current spread ◉, held spreads with target counts, ready /
      extracting, preparing; `E<ready>/<held>` in the summary) – 1.7.0.
- [x] Engine load test (debug overlay → *load*, `ar/load-test.ts`, `docs/tracking.md`), in the running app: the
      window gets a target budget of 0, 5, 10, 20, 40, 80, all other targets (nearest first), pages switch, content
      preload follows; prepare / extract time, engine and page fps, stutter, found share, lost, re-find after a lens
      cover; Markdown report – 1.7.0.
- [x] Window nearest first; content preload follows the tracker's window (was always ±1) – 1.7.0.
- [ ] Progressive preload towards the whole book (Tilman): targets → content → higher resolutions (issue #13), cached
      (service worker, browser, Bunny CDN) – after the load test numbers.
- [~] Measure all targets loaded vs ±1 (time to first find, frame rate) – the default stays ±1. Tool is there; run it
      on the S22 (and iPhone, slowest target phone) with the trial printout, small and large target pages.
- [x] Preload flow decided from the first load test (Tilman, 2026-10-27): **grow** – hold the current spread, add the
      nearest spreads in idle time (3 targets per batch) until the whole book is held; default since 1.7.0, fixed
      windows stay selectable.
- [ ] Still open (from `docs/tracking.md`'s options list, #218): one configure per switch (a switch configures twice –
      current, then the new window – and the second cancels and re-queues what the first had not extracted), image
      targets at build time, Tilman's regrouping of spreads (a few spreads or a chapter as one tracked group: fewer
      switches, the budget decides how many groups are held), a switch that does not wait for the new spread's models
      and videos (`changeSpread()` waits, so a large video delays it), a budget/eviction only if a slower phone needs
      it. The window itself is #38, preloading in steps #13.
- [ ] Build-time image targets (grey 480×640 per target in the content build) instead of making them on the
      device (~150–260 ms per image on the S22) – if first-scan time matters.

## Phase 14 – Content and refinement  `[ ]` (Amsterdam, with Kévin Bray – fall 2026 or afterwards; Tilman 2026-09-28)

The final content goes in and the app is tuned on it, on the devices readers will use.
- [ ] iPhone Safari with 8th Wall: motion permission prompt, pause/resume (entry opened and back), camera
      orientation, tracking quality, automatic spread switch.
- [ ] Final target images: ≥ 1000 px, textured, cropped as printed; very small printed images (e.g. the
      layout PDF's thumbnails) are found late or flicker – decide per page with the artist.
- [x] Replace the demo spreads 4–14 (`demo-p*` entries, from the layout PDF) with the real content – done 2026-10-27
      with the **trial delivery 2110** (1.6.0): `content/` holds the delivered content (138 entries, 131 targets, 87
      spreads), the placeholder content moved to `content-demo/`. Import through `scripts/import/2110.yaml` +
      `npm run import` (docs/content.md "Importing a delivery"); MEMORY 2026-10-27 "Trial content".
- [x] **Final content after the printer submission** (#248, 2026-11-05): the final PDFs (print, preview, trigger PDFs
      active / inactive / Kévin's artworks) → `npm run prepare-delivery` + `npm run import`; active triggers in the book,
      inactive and artwork ones switched off (#249, `artwork` tag); covers kept. Imported into staging 2026-11-05 (build
      53099b9d32d8, images from Rudy's high-res export; MEMORY 2026-11-05).
- [ ] **Trigger trial** (Tilman, printout of `All_Triggers.pdf` from a print shop): go through the protocol
      (debug overlay → trial, Markdown report) on the S22 and an iPhone; the report to the designers and into the issue; then decide
      per failing trigger with Kévin (bigger print, other crop, other image).
- [ ] Texts, titles, link URLs for every entry (all placeholders now); which image triggers the videos on pages
      99, 103, 106, 116, 127, 130, 132, 146, 148, 191, 218, 255 (see the notes in `import/2110.yaml`).
- [ ] Spreads kept loaded (±1 now): measure all vs ±1 with the real target count, then decide the default.
- [x] Videos of the final content: 720p H.264 ~2 Mbit/s (Phase 9) – the delivery import re-encodes them (ffmpeg, long
      side ≤ 1280 px, crf 23, maxrate 2 Mbit/s, AAC 96 kbit/s); the 16 documentation videos of 2110 went from 860 MB
      to the sizes in `content/entries/*/video.mp4`.
- [x] Tune panel for the content session (1.5.1, 2026-10-03 – Tilman): debug overlay → tune; every placement value
      and filter parameter as slider + number field (three.js names), live on the page, "Copy YAML" (only non-defaults,
      with the file path) to paste into the content / a Claude session – no USB tunnel needed on staging.
  - [x] *(obsolete – the tune panel was removed in 1.10.0, RULES #32; the editor took its place)* Phone check on staging
    (S22, iPhone): sliders and fields with the on-screen keyboard, copy to the Claude app.
  - [x] *(obsolete – the panel is gone; the book's environment is edited in the editor)* Later: look-around values
    (`window.osctLookAround`) as a section of the panel (copy → code defaults).

---

## Phase 15 – Editor  `[~]` (1.10.0, 2026-10-29 – Tilman, #61: "ich möchte 59 skippen und direkt in diesen Editor reingehen")

The authors' tool for Amsterdam: the app's own scene over a simulated page, then forms and saving to the database,
then the plugin API and code in the editor. Concept notes: `agents/research/2026-10-28-editor-data-model.md`,
`2026-10-28-entity-components.md`; issues #61 (editor), #60 (book geometry from the PDF); #59 (mock stage) folded in.
1. [x] `/editor` route with the mock tracker and the mock stage, the preview panel and the tune panel, lazily loaded
       (1.10.0). Open: an editor-only progress (the preview unlocks targets in the device's progress); the layout
       from the trigger protocol is coarse until #60 imports the PDF.
1b. [~] Where the editor lives – decided (evening, `agents/research/2026-10-29-editor-architecture.md`): the
       engine (content runtime + AR scene) becomes `engine/`, the reader uses it with the real tracker and loses every
       editor trace (route, chunk, preview, mock tracker, tune panel), the editor is a SvelteKit app `editor/` at
       `/editor` with the engine + mock tracker in process; an OSCT instance user (Building Fictions) signs in,
       independent of Scutoons. Done (1.10.0): [x] engine package, [x] reader stripped, [x] editor app (sign-in, books,
       import, stage, Stage / Entity panels, save, publish), [x] image + CI; staging = the PR into develop.
2b. [~] **Asset upload** (Tilman 2026-10-29): [x] the asset layer after Scutoons' in OSCT size – registry (assets,
       versions, usages computed), the content store as storage (local + bunny), upload, replace with relink, guarded
       delete, the editor's Library, a node's file, a target's image; [x] the Library and the picker also list the
       imported files of `files.json`, read-only (1.16.2, #111); [x] the Library as the picker of every file – the filter
       preselected, a target-image filter, it fills only the field it was opened for (#164); the new target's two
       choices labelled, the category following what appears (#165); [x] the Library filters by origin – uploaded / imported (#245, 1.63.0); [x] targets made in the editor (`print`
       placement, `POST /entries`, `DELETE /entries/{id}`, "+ target" in the tree); [ ] renditions (1x / 2x / 3x,
       480p / 720p / 1080p) and transcoding – the content build or a job; [x] a target made in the editor tracks in
       the reader: the 8th Wall engine makes the image-target data from the image at runtime (`xr8.ts`), nothing to
       compile; [ ] the media standard's density suffixes.
2d. [~] **A minimal admin UI** at `/editor/admin` in the editor app (Tilman 2026-10-29: "wir werden ein kleines Admin-UI
       brauchen … Newsletter-Listen … wichtig, dass wir nicht zu viel von Scutoons kopieren; eventuell wird das alles
       dieselbe White-Label-Software, gewisse Dinge sind Feature-Sets"): [x] roles after SCUTOONS' model (`roles` +
       `user_roles`, reader / editor / admin, `GET /user` roles, `Roles::require`), [x] the admin API (admin by session
       or the secret, users by e-mail with options and language, grant / revoke, `POST /admin/editors`), [x] the page
       (search, role toggles with their grant, editors / admins filters, invite an editor), [x] the newsletter list as
       CSV, [x] `ADMINS` next to `EDITORS` in both deploys (#65, 1.10.0 – docs/admin.md); [ ] later other instance
       settings (content store, assets) as they stop being environment variables. Small and own – a feature set of the
       white-label core (STRATEGY.md), not a copy of Scutoons' admin.
2c. [ ] **Asked on 2026-10-29, for steps 3–4** (Tilman): nodes without a target on the spread (scenery, listeners on
       events – an anchor for the spread's scene, scope `spread`), a **timeline** for a model's animation clips with
       start / stop on found / lost / tap (the `animation` component and `behaviour` of the concept), and the
       **script part** (code in the editor, step 4). Studio C is the acceptance scenario.
2. [x] Saving (1.10.0): books, spreads, entries, targets, entities in the database (`/api/editor/*`, import from a
       game configuration, entity edits with a change log), the draft as a content version the engine loads
       (`…/draft/latest.json`), publish = the version assembled from the rows into the content store (local dir or
       bunny) – the "compile" of this step. Open: `CONTENT_STORE=bunny` + the zone's credentials in the staging
       environment; texts, entries, targets and media still come from the content source (import again).
3. [~] Plugin API: [x] content schema 2.0 – the node tree (`children`, `group`, `text`, recursive engine, build,
       guard, API, editor's tree with + node / remove node; the app reads 1.x as one-node trees – 2026-10-29);
       [x] components with specs (schema 2.2, `shared/types/components.ts`): the first is `animation` on a model
       (clip, playOn found / tap / never, stopOn, loop, speed) with the editor's timeline; the entity instance got
       `onTap` and a `NodeTimeline`; [x] the **plugin API 1.0** (#66, 1.11.0, `agents/research/2026-10-29-code-in-the-
       editor.md`): `registerComponent` and `registerLayer` (material layers – GLSL composed into a node's material)
       with the shared specs as a registry, `api.three`, the component context and hooks; plugins compiled by the
       content build (`plugins/<id>/index.ts` → type check, esbuild, recorded, declared – schema 2.4), loaded by the
       engine with the first spread; [x] post-processing passes (schema 2.5, #72): the engine's pass registry
       (`scene/post/`, built-ins bloom / vignette / grade), `passes` per spread or book, the chain over the one
       renderer with the AR layer's alpha kept, the editor's Stage panel rows – `api.registerPass` is the plugin
       API's one-line hook into it (S22 budget still to measure); [x] the node type `light` (schema 2.6, #71: point /
       spot / directional with the editor's rows, tree icon and stage helper; an unknown node type passes the guard
       from 2.6 on, so the next type is MINOR); [x] **events and variables between entities** (#80, 1.15.0, plugin API 1.1,
       `agents/research/2026-10-30-demo-book.md`): `api.events` (core events read-only, scene events free), `api.vars`
       (scopes spread / stage / session / book – `book` in the reader's progress record), `api.progress`, `api.spread`,
       the context's `children`, `onUnlocked` – Studio C made real as the **demo book** `fixtures/demo/` (six spreads,
       six plugins, the key / door / lamp narrative, the tally, a tap that switches scenes; synced to the environment
       `demo` by `demo.yml`, `?content=` in the staging reader); [ ] more built-in components (`behaviour` with
       actions – the concept's events → actions without code, `audio`), declared variables, ~~the node-type registry~~
       (`registerNodeType`, #77 – done, step 4 below), nodes without a target on the spread (scope `spread`), bubbling scopes (#88); the
       content store per book (#87).
4b. [x] **The books page and page previews** (#153, 1.25.0): the books as covers beside the import; sheets rendered from
       the content for a book without PDFs (`scripts/layout/render-layout.py`, the demo's `fixtures/demo/layout/`);
       prints laid over the spread cards.
4. [x] Code in the editor (#66, 1.11.0): the **Code** tab – plugin sources stored through the API (`plugins` table),
       a plain code editor, Run = browser transpile (sucrase) into the stage's registry, Save, Download; the editor's
       stage is the only place unchecked code runs, a publish refuses component types no declared plugin provides.
       Open: [ ] the content build in the image, run by the API on publish (#78, Tilman: option 2), [x] the API's type stubs with
       completion and type errors in the Code tab (#76, Monaco – 1.24.0), [x] `registerNodeType` (#77 – plugin API 1.2,
       schema 2.13: a plugin builds the object, the engine places it; the demo's `sparkle`), [x] an MCP server
       over the editor's API for building with Claude in Amsterdam (#75, 1.16.0: `mcp/` after SCUTOONS' model – whoami,
       the sign-in pair, the book's tree / spreads / entities / targets / entries / assets / plugin sources / draft /
       publish to local and staging / logs, `describe_content_model`, the shared guard before every write; the stage
       itself stays unseen – `agents/research/2026-10-30-mcp-server.md`), [x] the plugins' specs recorded in the
       configuration (#90, schema 2.14: `plugins[].registered` – the guard, the API, the MCP server and the Entity panel
       know a plugin's components, node types and passes without running it), [x] the MCP tools for spreads, the book's
       passes and the environment (#174: `add_spread`, `put_spread`, `delete_spread`, `put_book_passes`,
       `put_environment`), [x] plugins everywhere (#188, plugin API 1.4, schema 2.17: `registerMaterial` – a node's
       `material` –, `registerTexture` and the parameter kind `texture`, recorded and checked like node types; the Entity
       panel's material row and **make it code**; the demo's aquarium), [x] the demo's zero plane (#189: every model
       on its page, the content build warns when one floats or sinks), [x] plugins of several files (#352, 6.11.0 –
       file tabs, bundling and a type check at Publish in the browser, `osct plugin link / push / pull`).
5. [~] Spread **formats** (Tilman 2026-10-29: "Format als assignable ins Modell … default Spread, special Front und
       Back, Bonus Museumswand") and the geometry import (#60): [x] the import from the designed PDFs (`npm run
       layout`, 1.10.0); [x] `format` on a spread (schema 2.3): `spread`, `cover`, `back` – the covers as spreads of
       their own (page 0, the page after the last), the closed book on the stage, surfaces `front` / `back`, + cover /
       + back cover and the format select in the editor; [ ] `wall` (a museum wall: targets on one surface of any
       size, the stage draws a wall), `object` / `sleeve` later; [ ] the printed geometry in the content schema for
       every target (today `print` only for editor-made targets, the layout for the rest).

## Suggested order

0 → 1 (incl. 1e) → 2 → 3 → 4 → 5 → 6 → 9 → 9b → 11 → 13 (built) → 14 (content, with the designers) → 7 → 8 → 10.
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
| 7 | ~~`maxTrack`~~ → max targets per spread, now 10 (RULES #3) | 0 ✓ |
| 8 | ~~Entry ↔ target cardinality~~ → 1:1 for now | 1c ✓ |
| 9 | ~~Design PDF in repo?~~ → yes, plus extracted images in `reference/` | ✓ |
| 10 | ~~Role of `/spreads`~~ → dev view for now | 2 ✓ |
| 11 | ~~Content versioning via content builder (+ CDN) vs app version~~ → content schema MAJOR.MINOR + immutable CDN versions (#5, RULES #10, #24) | 2 ✓ |
| 12 | ~~Deep link code prefix~~ → plain URLs `/spread/<id>?osct=<version>`, no old `?code=` links | 2 ✓ |
| 13 | ~~AR bridge~~ → one bridge + `ArScene`, spread switching by held neighbours, camera only in scan mode | 6 ✓ |
| 14 | ~~Content model + type naming~~ → nested target, inline/ref entities, `*Data` game-configuration contract in top-level `shared/`, app model plain names, single entry point | 1e ✓ |
| 15 | **Review:** loading overlay concept – full-screen loader on every spread switch covers the menu (see Phase 3 page menu) – Tilman | 3 |
| 16 | ~~**Review:** found indicator in consultation mode~~ → **hidden** (checked against frames 15, 17, 21, 33: no indicator in any consultation frame) – matches the build | 3 ✓ |
