Status 2026-11-20: research (#255, under #44 / #48 / #53), no code changed. Read from OSCT `develop` at d0fd6b92 (3.8.1,
content schema 4.0) and SCUTOONS `main` at ffe68b78 (read only). It updates and replaces, for OSCT's side, SCUTOONS'
`agents/research/XR-SHARED-CORE.md` (2026-11-10, read at OSCT 1.64.6, schema 2.x). §5 holds the decisions for Tilman.

# One shared XR core out of OSCT – with SCUTOONS as the second title, and world tracking in it

The question (Tilman, 2026-11-10 and 2026-11-20): what does it take to make **one** XR core out of OSCT that SCUTOONS
uses as its second title – the engine, the reader's XR part **and the editor** shared – and how does world tracking
(SLAM plus image targets, #299, Kévin's show in France in summer 2027) fit into that core? Decided today and assumed
here: several experiences on one installation (#87, with #50: `<title>/<env>/<experience>/…`), the database is the
only truth (#322).

## 0 · The answers in short

1. **The biggest blocker of 2026-11-10 is gone.** SCUTOONS' note named one real conflict: surfaces without pages.
   Schema 3.0 / 4.0 (#307, #319, #320) removed pages entirely: an experience is an ordered list of scenes. Each scene
   has free surfaces with a size in mm and a `place` in the scene's coordinate system. Entries name their scene, and
   targets name their surface. The book is an optional `experience.book`. SCUTOONS' Experience types (Book, Concert
   reading, Exhibition, Poster) are now **presets of OSCT's contract**, not a fork of it.
2. **Nothing has been copied into SCUTOONS yet.** There is no OSCT code in `scutoons/viewer`, `creator` or `shared`,
   and the branch `wip/482-xr-experiences-7f10f7` holds concepts only. The build may start around 2026-11-25
   (decisions/xr.md 2026-11-11). Posters must go to print in December (scutoons#674). So the "drift" is conceptual:
   SCUTOONS' plan was written against schema 2.x. **Now is the cheapest moment to share instead of copy.**
3. **The engine and the contract are nearly a core already.** RULES #32 holds in the code. The engine imports only
   `three` and `@shared/*`, it knows no `import.meta.env`, routes or i18n, and everything a host differs in arrives
   through `ArSceneOptions` and the loader's options. What is left is small and named in §1.
4. **The editor is the expensive part, and it got more expensive.** 68 files reach `editor/src/lib/api.ts`
   directly; there were 41 on 2026-11-10. The stage, panels and stores call OSCT's PHP API with no seam. A shared
   editor needs **one backend interface** in place of `api.ts`. This step is worth doing in OSCT for testability alone.
5. **Recommended architecture:** packages inside the OSCT repository (`engine`, `shared`, later `reader-core` and
   `editor-kit`). SCUTOONS consumes them **read-only at a pinned tag**, never as edited copies. The editor ships as an
   **embeddable Svelte library** behind that backend interface, mounted by each host's SvelteKit app; it is not a
   second app. The repository splits off later (#47), when both titles run on the packages. Phases in §2 keep OSCT's
   reader untouched until after Tokyo (Feb 2027).
6. **World tracking has a licence problem before it has a technical one.** The MIT engine OSCT ships
   (`@8thwall/engine` 0.1.0) **contains no SLAM**: its README says the `XrController` holds image targets only, and the
   chunk is called `slam` for legacy reasons. Turning `disableWorldTracking` off at `engine/src/scene/tracker.ts:188`
   therefore gives nothing. SLAM comes only from `@8thwall/engine-binary` (`xr-slam.js`), which runs under Niantic
   Spatial's **limited-use, revocable** licence: no modification, no fee-based product whose value derives mainly
   from it, no competing product, attribution required, and termination on five days' notice. That cuts against
   STRATEGY's data-sovereignty promise and could cut against the core's business model. So the core must put world
   tracking **behind its own interface with several providers** (§4): 8th Wall's binary, WebXR on Android, and the
   existing 3DoF look-around as the fallback. Tilman must decide on the licence first (§5, D1).

## 1 · Today

### 1.1 What each part holds (non-test lines, 2026-11-20)

| Part | Lines | Generic XR method | OSCT's own | Coupling points |
|---|---|---|---|---|
| `engine/src` | 10.2k | `ArScene` (one renderer, one camera stream), entities and node trees, behaviour, passes, materials, plugins (`plugin-runtime.ts`, `plugins.ts`), the look-around (3DoF, device orientation, `look-around/`), the content loader (`content/game-config.ts`, `content/scenes.ts`), trackers behind `IImageTracker` (`scene/tracker-types.ts`) | the GLSL names `osctTime`, `osctUv`, `osctL<i>_*`, `osctLayer<i>` (`utils/layers.ts:23-104`, part of the plugin API); `OWNED_MATERIAL = "osctOwned"` (`materials.ts:69`); debug handles `window.osctLookAround*`; the 8th Wall pipeline name `osct-image-tracker` (`tracker.ts:598`); `environment.world: "cafe"` kept as a token after the café went (#310, `look-around.ts:16-24`) | imports: only `three` (55) and `@shared/*` (≈45); host input through `ArSceneOptions` (`ar-scene.ts:44-65`: `createTracker`, `graphics`, `progress`, `debug`, `subtitleLanguage`, `sound`, `environment`, `orientation`), `setDeviceStorage`, the loader's `baseUrl` / `bundled` / `fetch`; the real tracker only through `scene/xr8-tracker.ts` (only the reader imports it) |
| `shared/` | 4.7k | the content contract `CONTENT_SCHEMA_VERSION = "4.0"` (`types/game-config.ts:75`): `ExperienceData`, `SceneData`, `SurfaceData` + `SurfacePlace`, `GroupData`, `EntryData`, `TargetData` + `TargetPlace`, entities, components, behaviour, passes, plugins, expressions (copied from SCUTOONS), the guards, `content-schema.json`; `shared/api/` holds the editor API's types | `BookData` (author, publisher: optional, `experience.book`); `EntryCategory` = glossary / video / text / link (`types/entry.ts:7`); the entry as a reader's "found thing" | no imports outside itself. Consumed by engine, client, editor, mcp and scripts through `@shared` aliases (`editor/vite.config.ts:63-66`, `client/vite.config.js:270-273`). The PHP server mirrors ≈25 contract rules by hand |
| `client/src` | 14.0k | the bridge to the engine (`components/ar-bridges/`: `ar-bridge.ts`, `lazy-ar-scene.ts`), the managers (`store/managers/`: Camera, History, Scene, Target, router), progress (`services/ProgressStorage.ts`) and the preloader (`PreloaderService.ts`): together ≈1.1k lines of logic | everything else: custom elements on the `GameStore` singleton (`store/GameStore.ts`), i18next with four languages, the branded tokens (`styles/design-styles.ts`), pages (splash, tutorial, about, credits, account), the PWA manifest and texts naming the book and imprint; 27 storage keys `osct-*` (`osct-user`, `osct-graphics`, `osct-camera-lens`, `osct-ar-prepared-scenes`, …) | 16 engine modules imported (`@engine/content/scenes` ×6, `utils/tracker-debug` ×5, `scene/xr8-tracker`, …); RULES (stack, "do not swap"): vanilla custom elements, no framework |
| `editor/src` | 29.3k | the stage core with the plugin sandbox (`lib/stage/stage-core.svelte.ts`, `frame-host.svelte.ts`, `frame-protocol.ts`, the `stage-frame` route), the mock tracker and stage (`mock-tracker.ts`, `mock-stage.ts`, `surfaces.ts`, `surface-gizmo.ts`, snapping, picking), panels (`lib/panels/`, 23), controls (`lib/components/`, 25: `ScrubNumber`, `Section`, `Segmented`, `Toggle`, …), the Scenes filmstrip (`ScenesPanel.svelte`, `scene-strip.ts`), history / undo, the code tab (Monaco) | the experiences page, import with comparison (`ImportForm`, `import-*.ts`), publish (`PublishButton`, `publish-target.ts`), sign-in / AI connections / admin (`SignIn`, `AiConnections`, `routes/(app)/admin`), desk materials (`oak.ts`, `plywood.ts`, `linoleum.ts`); texts hard-coded in English | **`lib/api.ts` (649 lines, 89 exports) is reached by 68 files**: 22 stores and helpers (`content`, `entries`, `scenes`, `library*`, `plugins`, `session`, `autosave`, `history`, …), 25 panels and components, and 4 routes. SvelteKit `$app/*` in routes and stage. Three token variants (RULES #32): the editor's own lives in `editor/src/app.css` |
| `server/api/src` | 8.3k | the editor API: experiences, scenes and surfaces (`Scenes.php` 736, `SurfaceReferences.php`), entities, targets, passes, environment, plugins, assets with versions and names by use (`Assets.php`, `AssetNames.php`), the change log and reverts (`Reverts.php`), removal, draft and publish (`ContentStore.php`: directory or bunny), progress, accounts, roles, tokens | `Config.php` (`OSCT_*` env), `Auth::COOKIE = 'osct_session'`, `ApiTokens::PREFIX = 'osct_'`, `LoginMail.php` (book, imprint, gold), newsletter options | `Experiences.php` (1.5k) still mixes generic editing with experience-level rules. **One experience per environment**: the store is `<env>/latest.json` + `<env>/<build>/` (`ContentStore.php:6-12`); #87 changes that |
| `scripts/` | 3.9k | content build and validate, the CDN layout with sync, purge and activate | delivery import (`P<page>_Print/Online`), Python layout scripts | after #322 the importer becomes a delivery → API tool; the folder becomes an export |
| `mcp/src` | 2.5k | 48 tools, each a thin client of the editor API (RULES #32) | the server name `osct`, `osct://` resources, `OSCT_API_URL` / `OSCT_EDITOR_TOKEN` | the API is the only authority, so the MCP follows whatever the backend interface becomes |

Versions: three `^0.174.0` (client and editor); `@8thwall/engine` 0.1.0 (client); editor on SvelteKit 3.1, Svelte 5.57,
TypeScript 6.0 and Vite 8; reader on TypeScript 5.8 and Vite 8. There is no root workspace: each folder has its own
`package.json`, and engine/shared are reached through path aliases, not packages.

### 1.2 What the reader's page must give the engine

These are the engine's host assumptions. They matter for any host other than OSCT's reader.

- The camera canvas lies behind the container at `zIndex: -2` (`tracker.ts:170-173`), so the host's XR route must be
  transparent.
- `window.XR8` comes from a classic script at a base URL the host passes: `xr8.ts:116-137` loads `xr.js`, then
  `XR8.loadChunk({ name: "slam", url: …/xr-tracking.js })`. The files are served from `assets/xr8/` with their
  LICENSE (`client/vite.config.js:212-218`).
- One loaded configuration and one plugin registry exist per page.
- Taps are taken from the container, except on UI marked as the app's.

A SvelteKit host can meet all of this on a lazily loaded route.

### 1.3 SCUTOONS: what was copied, and how far it has drifted

**Code copied: none.** The only matches for `XR8` / `ArScene` / `IImageTracker` in SCUTOONS are inside built chunks
(`viewer/build`, `creator/build`), and those are false positives. Its worktree for #482 holds documents only.

**What is planned there and has drifted from OSCT since 2026-11-10:**

| SCUTOONS' plan (XR.md, XR-SHARED-CORE.md, decisions/xr.md) | OSCT today | Drift |
|---|---|---|
| Shape A: OSCT's configuration kept as is inside SCUTOONS' experience document, SCUTOONS' fields beside it (2026-11-11) | the configuration is schema 4.0 | the plan's tree "surface › entry › target › scene" is schema 2.x; in 4.0 it is experience › scenes › surfaces, with entries → scene/surface and targets → surface. Shape A still holds; only the shape it keeps has changed |
| "Surfaces without pages" as the real conflict; "a number stands in for the page" as the workaround | solved in 3.0: `SurfaceData { id, label?, widthMm, heightMm, place }` | the workaround must **not** be built |
| Experience types Book / Concert reading / Exhibition / Poster, with surfaces per type | `experience.book?` only; scenes and surfaces are free | the types are presets (which scenes and surfaces a new experience starts with, which stage set) plus a SCUTOONS field beside the configuration, or later an `experience.kind` MINOR in OSCT (§3) |
| Copy the engine "unchanged with the commit recorded", Svelte views over a controller, the editor behind a backend interface (XR-SHARED-CORE §5) | still right | the recorded commit would now be ≥ d0fd6b92, not ebbadf3b |
| One three version, 0.186 (decisions/xr.md 2026-11-20, scutoons#674); creator `three 0.186.1` | 0.174 | SCUTOONS goes up when it copies; OSCT is held by nothing but caution (the 8th Wall binary does not depend on three) |
| SvelteKit 2.55, TypeScript 5.9 in the creator and viewer | editor on Kit 3.1, TS 6.0 | an editor package must build on both, or SCUTOONS moves to Kit 3 |
| "Panels / tabs follow OSCT's rules, no sharing across the projects" (SCUTOONS ffe68b78, #631) | – | a fresh statement against sharing UI across projects. It concerns SCUTOONS' own panels, but it bears on how much of the editor's shell the core can carry: decision D3 |
| Posters printed in December, rolled out in January (scutoons#674) | a poster = one scene, one surface, one or more targets | fits schema 4.0 with no change; this is SCUTOONS' first XR deliverable |

## 2 · Target architecture options

### 2.1 Where the core lives

| | Option | Effort | Risks | What it means for SCUTOONS' copies |
|---|---|---|---|---|
| **A** | **Packages inside the OSCT repo.** An npm workspace at the root: `packages/engine` (today's `engine/`), `packages/contract` (today's `shared/`), later `packages/reader-core` and `packages/editor-kit`; the OSCT apps (`client/`, `editor/`, `server/`, `mcp/`) consume them like any title. SCUTOONS consumes a tagged build (git dependency `github:mandymozart/osct#core-v0.x` with a `prepare` build, or a tarball published as a GitHub release / GitHub Packages). | S for the workspace and `package.json`s (paths stay; aliases become package names); M per extracted package | low for the running app: no feature changes, CI covers it. A tag discipline is needed (RULES #23 versions the app; the core gets its own semver) | **no copy at all**: SCUTOONS pins a tag; anything it needs changed goes as an OSCT issue or PR. Merge cost later: zero |
| B | **A separate core repo now** (`scutoons-animus-ar`, #47) | M: CI, release, both apps re-pointed; history split (`git filter-repo` of engine/ and shared/) | medium to high **before Tokyo**: two repos to keep green while the reader ships; every engine fix becomes a cross-repo change in the busiest months | none, like A, but OSCT pays the split cost now |
| C | **git subtree / vendored folder in SCUTOONS** with a sync script (`git subtree pull --prefix vendor/osct-core …`) | S | drift by edits inside the vendored folder; subtree merges are fragile on Windows and with the history rewrite of 2026-10-29 | a copy, but one with a known origin and a mechanical update; edits must stay as named patches (XR-SHARED-CORE §5.2) |
| D | **Status quo: copy now, generalise "with the next XR project"** (decisions/deck.md [xr], 2026-11-10) | none now; L later | the editor copy repeats OSCT's `api.ts` tangle in SCUTOONS; schema 4.0 and SCUTOONS' adaptations diverge within weeks (OSCT moved 2.x → 4.0 in ten days) | two forks to merge later, the expensive case |

**Recommendation: A**, with C as the fallback only if SCUTOONS must ship posters before A's first tag exists (the
tag needs about a week of S work). B becomes the natural step after Tokyo, once both titles run on A (#47: "split
when Scutoons runs").

### 2.2 How the editor is shared

| | Option | Fits | Against |
|---|---|---|---|
| E1 | **An embeddable Svelte component library** (`editor-kit`): stage (core, frame, mock tracker, stage sets), panels, controls, the Scenes filmstrip, history. The host passes in a `Backend` (the interface replacing `api.ts`), routing callbacks instead of `goto`, texts, theme tokens, and a stage set per experience type. Each host keeps its own shell (sign-in, experiences page, admin, AI connections) | SCUTOONS' creator is SvelteKit + Svelte 5 already; SCUTOONS decided "the editor integrated into the creator" (decisions/deck.md [xr] 2026-11-10); RULES #32 "a control is built once" | needs the backend interface (S–M) and texts out of the components (M); Kit 3 vs 2.55 (`$app/*` imports must stay in the host, not the kit) |
| E2 | **The editor as an app** served by the OSCT image at `/editor`, pointed at another API (SCUTOONS' documents through an adapter server) or embedded by iframe | no refactor of the editor | two sign-ins, two Library UIs and two design dogmas in one product; SCUTOONS' "integrated into the creator" is lost; the API adapter would have to translate OSCT's PHP routes onto SCUTOONS' document model, so it is the backend interface again, only over HTTP |

**Recommendation: E1.** The stage-frame page (`routes/stage-frame`) moves as a page the host serves; its CSP is a meta
tag, so it moves unchanged.

### 2.3 The phased path (it does not stall Tokyo, Feb 2027)

Sizes: S = days, M = weeks of agent work with Tilman's review.

| Phase | When | Step | Size | Risk for OSCT's reader |
|---|---|---|---|---|
| 0 | now – Dec 2026 | **0.1** Root npm workspace; `engine/` and `shared/` get their own `package.json` (`@animus/engine`, `@animus/contract`, three as a peer dependency); aliases kept as package names | S | none (build-only) |
| | | **0.2** The editor's **backend interface**: `Backend` type in the editor, `api.ts` becomes `OsctBackend`, the 68 call sites take it from context | M | none (editor only; testable without a server) |
| | | **0.3** Core-level names: `osct*` debug handles and pipeline name behind a prefix option; GLSL `osct*` names **kept** (plugin API) with neutral aliases added (`coreTime` → same uniform); `world: "cafe"` token renamed in the next MAJOR | S | low |
| | | **0.4** First tag `core-v0.1` = engine + contract at a 4.x commit; SCUTOONS' posters (scutoons#674) run on it in its viewer through a Svelte view over the engine | S (OSCT) | none |
| 1 | Dec 2026 – Feb 2027 (Tokyo freeze for the reader) | **1.1** #87 + #50: store layout `<title>/<env>/<experience>/` (already decided; needed by OSCT itself) | M | medium – planned anyway |
| | | **1.2** `editor-kit` package out of `editor/src/lib` (stage, panels, controls); texts through a message function; OSCT's editor app becomes a thin host | M | none for readers |
| | | **1.3** World tracking research #299 in `sandbox/world-tracking/` only (provider spike, §4) | M | none (sandbox) |
| 2 | after Tokyo, Mar – May 2027 | **2.1** `reader-core`: the controller out of `client/` (ar-bridges, managers, progress, preloader, ≈1.1k lines) with the store and router passed in; OSCT's custom elements stay over it | M | medium – after release |
| | | **2.2** Instance configuration + storage keys per title (STRATEGY phase A, #51/#52) | M | medium (stored progress moves) |
| | | **2.3** World tracking in the core (§4), for the show in summer 2027 | M–L | medium – a new tracker mode behind a flag |
| | | **2.4** Optional: split into the core repo (#47) | S–M | process |

What OSCT can do alone: everything in phase 0 except 0.4's SCUTOONS side, plus 1.1, 1.2 and 2.1. What needs SCUTOONS:
the experience-type presets and the stage sets for Exhibition / Concert reading (§3), its `Backend` implementation, and
its Svelte reader views.

## 3 · The contract between core and title

| Surface | Already generic | OSCT-specific / to do |
|---|---|---|
| **Content schema** (`shared/types/game-config.ts`, 4.0) | experience → ordered scenes → surfaces (mm, `place`) → targets (`TargetPlace` on a surface) → entities; groups as loading windows; entries by `scene` / `surface`; plugins, behaviour, passes, appearance, environment, subtitles; the guards and `content-schema.json`; the rule "MAJOR.MINOR is the only compatibility" (RULES #10; no backward compatibility before Tokyo) | `EntryCategory` is a closed enum of OSCT's four (glossary / video / text / link). SCUTOONS wants an entry to give an item, a 3D view, a video or a jump: an open category or a title-owned `extra` field (MINOR). `experience.book` is fine as optional print data. An experience **kind** (book / exhibition / concert reading / poster) is not in the contract; it can stay title-side (the editor's presets) or become `experience.kind?` (MINOR). Texts per language: OSCT's content is one language; SCUTOONS needs overlays (a title-side translation file laid over the configuration, or `i18n` maps in a MINOR). A **goto** behaviour action with an address the host resolves (STRATEGY "Flows", SCUTOONS' jumps) |
| **Plugin API** (`engine/src/scene/plugin-runtime.ts`, `plugins.ts`, `utils/layers.ts`) | registration of node types, components, materials, passes; `api.three` | the three version is part of it, so both titles need one (0.186 decided in SCUTOONS); the GLSL names `osct*` are a public API, so keep them and alias; plugins uninstall only through the editor's mirror (one experience per page load in the reader) |
| **Tracker interface** (`scene/tracker-types.ts`) | `IImageTracker` with `startCamera`, `loadTargets`, `prepareTargets`, `growTargets`, `pause` / `resume`, `fit`, `gradeCamera?`; implementations: `ImageTracker` (8th Wall, reader) and the editor's mock tracker over its stage | image-only by design: anchors are reported per target as a `Matrix4` relative to a camera **fixed at the origin** (`onUpdate(targetId, matrix)`). World tracking needs a second, optional capability (§4.3) |
| **Theme** | three token variants (RULES #32) with a host `data-theme`; the unlock effect takes its colours as parameters now (`celebration.ts:56-70`), so the gold palette of 2026-11-10 is gone from the engine | the branded variant lives in `client/src/styles/design-styles.ts` (OSCT's gold); the editor's neutral variant in `editor/src/app.css`. The core needs neutral defaults plus a title theme file (STRATEGY "Theme") |
| **Auth / API** | the editor API's shape (`shared/api/editor.ts`, SCENES "Editor API 3.0"); the MCP as an API client; draft = live state, publish = a person's click; tokens refused on account routes (RULES #32, #33) | the PHP server is OSCT's, and SCUTOONS has its own PHP server (`scutoons/server/src/Http/CurrentSession.php`) and document model. So **the core's seam is the editor's `Backend` interface, not the HTTP API**: OSCT implements it over `/api/editor/*`, SCUTOONS over its documents and assets. Cookie name, token prefix and mail branding are instance configuration |
| **Content delivery** | the loader takes any `baseUrl` / `fetch` / `bundled`; immutable builds + `latest.json` | `<env>/latest.json` holds one experience per environment until #87 lands. SCUTOONS can feed the engine a configuration it assembles itself (Shape A: one function document → `GameConfiguration`) |

**#48 (how SCUTOONS feeds the contract), answered by #322 and Shape A:** SCUTOONS does not go through OSCT's content
CLI or importer. Its database (the experience document) is its truth, and it **produces the contract itself**,
validated with the contract package's guards. The CLI stays OSCT's tooling, and after #322 it is only an export and
delivery tool anyway.

## 4 · World tracking in the core

### 4.1 What 8th Wall offers today (checked 2026-11-20)

- **`@8thwall/engine` 0.1.0, MIT, Niantic Spatial 2026** (what OSCT ships): core, image targets, face effects, sky
  effects. Its README says it plainly: "The `XrController` module in this package does not contain SLAM (World
  Tracking), only Image Targets. However, for backwards compatibility, the chunk name is still `slam`." So OSCT's
  `loadChunk({ name: "slam", url: …xr-tracking.js })` (`xr8.ts:137`) loads image tracking only, and
  `disableWorldTracking: true` (`tracker.ts:188`) switches off something that is not there. **#299's assumption
  ("turning world tracking on may be one setting") is wrong for the MIT build.**
- **SLAM** is in `@8thwall/engine-binary` (`xr-slam.js`), loaded into the open engine with the same chunk name and the
  same `XrController` API (`data-preload-chunks="slam: …/xr-slam.js"` or `loadChunk`). Its licence (github.com/8thwall/engine
  LICENSE) is limited-use: distribute in original form inside your product; no modification or reverse engineering; not
  in a fee-based product "whose value derives, entirely or substantially, from the functionality of the Software"; not
  to "build a competitive product"; attribution in materials; revocable with five days' notice. Niantic's FAQ: existing
  self-hosted projects keep working "until February 28, 2027" (platform timing). The licence text does not mention
  telemetry; **that has to be checked on the device** (network log) before it can stand next to STRATEGY's "no call to
  Niantic".
- **Not distributed at all:** VPS, Lightship Maps, hand tracking.

The upshot: technically the 8th Wall binary is the shortest way to SLAM plus image targets in one session on iOS and
Android, because it is the same `XrController`. But it is the one dependency in the core under a revocable licence,
and the white-label core is a product whose value is partly AR. That needs Tilman's decision (D1) and perhaps a
lawyer's read. The show in summer 2027 alone (Kévin's, a commissioned production) is the case the licence fits best.

### 4.2 Other providers

| Provider | iOS Safari | Android Chrome | Image targets in the same session | Notes |
|---|---|---|---|---|
| 8th Wall binary SLAM | yes | yes | yes (same `XrController`) | licence above |
| WebXR `immersive-ar` (ARCore): hit-test, anchors, plane detection | **no** (no WebXR AR in Safari) | yes | image tracking only behind Chrome's incubation flag | open standard, no third party; owns the camera (the camera grade `gradeCamera` and the 8th Wall canvas do not apply) |
| Open-source web SLAM (e.g. AlvaAR, WASM ORB-SLAM ports) | in principle | in principle | combined with our image tracker on the same frame | licences and quality not checked; a research item, not a plan |
| **The look-around** (exists: `engine/src/scene/look-around/`, 3DoF from device orientation anchored at the found surface, `surface-anchor.ts`) | yes | yes | yes, it is anchored by the target | no translation: content can stand "around" the reader, not on a measured floor. The fallback on every device |

### 4.3 What the core must provide so both titles get it

1. **A world capability beside `IImageTracker`, not instead of it.** It is optional, so the editor's mock tracker
   and image-only devices keep working:
   ```
   interface IWorldTracker {            // provided by a tracker that can (8th Wall SLAM, WebXR)
     readonly worldTracking: boolean;   // false → the look-around fallback
     onCameraPose(pose: Matrix4): void; // the camera moves in a fixed world (SLAM) …
     onTargetInWorld(id, pose): void;   // … and image targets get a world pose, not a camera-relative one
     hitTest(x, y): Matrix4 | null;     // floor / plane under a screen point
   }
   ```
   `createTracker` (`ArSceneOptions`) stays the one factory; the host picks the provider.
2. **One anchor model in the scene.** The scene's coordinate system already exists (schema 3.0 `SurfacePlace`: origin
   on the table at the first row of surfaces, +y up, mm). Today a found target gives the pose of its entity; with
   world tracking, **a found target gives the pose of its surface, hence of the scene origin in the world**. Every
   surface, including a wall or a floor area of a free scene, is then placed by its `place`. The page-to-floor
   handover of #299 is then a node moving between two surfaces of one scene. Image-only mode stays as it is: the
   camera at the origin, anchored per target.
3. **The content side (sketch, a MINOR later):** a surface can be *measured* (placed in the room by a target or the
   floor) or *virtual*; an entity can be anchored to `target` (today), `surface`, or `floor`; a scene can say
   `tracking: "image" | "world"` so image-only scenes never load SLAM (download and fps on the S22, #40).
4. **Editor:** the mock stage already draws free scenes and walls at their places (SCENES "Stage", 1.114.0) and has a
   floor grid at y = 0 (schema 3.0 editor plan). So room content can be authored without new stage work; a simulated
   camera walk replaces "target found".
5. **Loading:** the SLAM chunk is loaded lazily, only for scenes that need it, and served from the instance's own
   origin (as `assets/xr8/` today) with its licence and attribution.

So both titles get world tracking from the same engine, through the same contract, with the provider chosen per
instance or device. SCUTOONS' exhibitions (walls, rooms) are the same free scenes the show needs.

## 5 · Decisions for Tilman

| # | Decision | Recommendation | Answers |
|---|---|---|---|
| D1 | **World tracking provider and licence**: use 8th Wall's limited-use SLAM binary (shortest way, revocable, attribution, possibly at odds with data sovereignty and a "competitive product"), or build on WebXR (Android only) + the look-around fallback, or research open-source SLAM | spike all three in `sandbox/world-tracking/` (#299); use the binary **only per production** (Kévin's show) behind the core's world interface, never as a core dependency; a lawyer's read before a fee-based instance uses it | #299, STRATEGY "data sovereignty" |
| D2 | **Where the core lives**: packages in the OSCT repo now (A), a separate repo now (B), a subtree in SCUTOONS (C) or copy now (D) | **A** now; split to `scutoons-animus-ar` after Tokyo when both titles run on it | **#47** |
| D3 | **What of the editor is shared**: the editor kit (stage, panels, controls, filmstrip) behind a `Backend` interface, each host with its own shell; or only the engine (SCUTOONS' 2026-11-20 note "no sharing across the projects" for panels) | share the **kit** (the owner's condition of 2026-11-10: the editor must be shared); each title keeps its shell, so SCUTOONS' own panel rules stay its own | #255's condition, #53 |
| D4 | **Do phase 0 in OSCT now** (workspace, backend interface, first core tag) before SCUTOONS starts copying (~2026-11-25, posters December) | yes: about two weeks of S/M work, no reader change; it turns SCUTOONS' copy into a pinned dependency | #53, scutoons#482 / #674 |
| D5 | **How SCUTOONS feeds the contract** | SCUTOONS produces `GameConfiguration` from its own document (Shape A) and validates with the contract package; no route through OSCT's CLI. The database is each title's truth (#322) | **#48** |
| D6 | **Instance configuration at build or run time** | build time per instance (as STRATEGY suggests). For SCUTOONS, which carries XR inside its own app, the "instance" is SCUTOONS itself: the core reads the title's configuration at runtime from the experience, and the brand at build time | **#46** |
| D7 | **What "inside our own app" means** | SCUTOONS' app with several experiences (its catalog) is the first "own app"; OSCT stays a one-brand instance with several experiences (#87). A neutral core shell is not needed until a third title | **#49** |
| D8 | **One three version for both titles** | OSCT goes to 0.186 in phase 1 (editor first, reader after a check on the S22); nothing in the 8th Wall engine pins three | SCUTOONS decisions/xr.md 2026-11-20 |
| D9 | **Contract additions for SCUTOONS** (an open entry kind or a title field, a `goto` action, translations, `experience.kind`) as MINORs in OSCT's contract, not in a SCUTOONS fork | yes, each as its own issue when SCUTOONS needs it; posters need none | #53 |
| – | Providers for provisioning | not touched by this research | #45 |

## 6 · Not checked

- Nothing was built or run. Whether the engine runs on three 0.186, and whether an editor kit builds under SvelteKit
  2.55 and TypeScript 5.9, are read from versions and imports only.
- The 8th Wall binary's network behaviour (any call home) and its exact use in the browser were not tried. The licence
  summary is a plain reading, not legal advice.
- WebXR image tracking's current state in Chrome and the open-source SLAM candidates were not tested.
- The line counts are `wc -l` over non-test `.ts`, `.svelte`, `.php` and `.js` files and include comments.
