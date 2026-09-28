# Project Rules – OSCT

Replaces `.windsurfrules` (deleted). Relevant parts carried over.
Extend as we go: add a rule when a decision should hold for all future work.

## Stack (do not swap)
- Build: vite · Tests: vitest (happy-dom)
- 3D: three.js (A-Frame removed 2026-09-26, Phase 9) · Image tracking: the **8th Wall engine** (`@8thwall/engine`,
  MIT, image targets; served from `assets/xr8/` with its LICENSE) behind `IImageTracker` (`ar/tracker-types.ts`).
  MindAR removed in 1.3.0 (Tilman, 2026-09-28: 8th Wall jitters less and switches spreads by itself) – no
  `.mind` files, no compiling; image targets are made from the target images in the app.
- State: custom monolithic game store (`IGame`, `BaseStore`) with immer drafts, split into managers
- UI: vanilla custom web components (shadow DOM), no framework
- Page/view management is self-made (`pages-router`, `RouterManager`). No routing or animation
  libraries. Transitions stay simple CSS.
- ~~jsQR~~ – in-app QR scanning is removed. The **dev overlay QR generator stays**
  (`dev-tools/qr-generator.ts` + `public/assets/deps/qrcode.js`): it opens the dev server on a phone.

## Working rules
1. **Ask before removing any feature, page, component or manager.** We are restructuring,
   not deleting. Agreed removals: QR scanning; MindAR (1.3.0, Tilman 2026-09-28 – 8th Wall instead).
2. Naming: page group = **spread** (not chapter), opened entry = **consulted** (not visited).
   Use these terms in code, content and UI.
   Modes: `IDLE`, `SCAN`, `CONSULTATION` (UI context). "About" and "Info" are the same page (`about`).
   Set the mode only through routes (`RouterManager.navigate`), never with `draft.mode = …` in components.
   The scene state is derived from mode + route (`components/ar-bridges/utils/scene-state.ts`), never set directly;
   overlay routes (no mode) pause the scene.
3. Max **10 image targets per spread** (Tilman, 2026-09-28; was 5 for MindAR's `maxTrack`) – the engine tracks
   4 at the same moment. One constant (`MAX_TARGETS_PER_SPREAD`, scripts/src/config.ts); the content build
   enforces it.
4. Preloading target images and content = browser cache only (`PreloaderService`; in production the
   service worker stores what it fetches in its content cache – `client/sw/service-worker.ts`). The
   whole-book download (Info) goes through the same `preload()` – no second download path. Never modify the AR
   scene before a spread is actually activated. No second scene / WebGL context – except the engine's own
   camera canvas under the three.js canvas. The tracker keeps the neighbouring spreads' image targets loaded
   (`prepareTargets()`, ±1 by default – `utils/prepared-spreads.ts`); that is the engine's state, not the
   scene's. The AR code (three.js, the 8th Wall engine) is only imported lazily (`ar-bridges/lazy-ar-scene.ts`) – nothing on the startup path may
   import `ar-bridges/ar/` statically; the scene is built on the first scan (RUNNING).
5. Content is placeholder until final content arrives. Keep texts/colors/media swappable
   (config / CSS variables), never hardcoded in components.
6. Match existing code style: custom element per file, `styles`/`template` getters,
   `GameStoreService.getInstance()`, subscribe via `subscribeToProperty` and clean up
   in `disconnectedCallback`.
7. Taxonomy: **entries are top level**; target optional per entry; AR entity optional per
   target. Never assume an entity is video-only – keep entity types extensible.
8. Content lives in `content/` (YAML) → built by `scripts/` into `client/src/game.config.json`
   and `client/public/assets/content`. **The output is not in git** (Tilman, 2026-09-28): `npm run build` in
   `client/` builds the content first (prebuild → `npm run content`), so CI, the deploys and Netlify (base
   `client/`, `npm run build`) always build the content of their commit. Commit `content/` only.
9. Before ticking a plan item: `npx tsc --noEmit` and `npx vitest run` in `client/` must pass.
   Add or adapt tests in `__tests__/` next to the code you change (store, managers, content config).
   Tests of removed features are not wanted – test behaviour that stays.
10. **One version** (semver) for the app, the content build and the server: `client/package.json`,
    `scripts/package.json` and `server/api/src/Version.php` always carry the same version (checked by tests
    + CI); the source is `client/package.json`. Game configuration: PATCH/MINOR must just work, MAJOR = rebuild the content
    (no config migrations). Progress storage: a new MAJOR reads the old format and tells the user
    (add a reader in `utils/progress-record.ts`; a test fails without one). The first storage
    format is 1 – nothing from before 1.1.x is converted.
    The content *data* is identified by the build checksum (`version.hash`), not by the version.
    Links (2026-09-26, Tilman): plain URLs `/<route>/<value>?osct=<version>` (`services/LinkService.ts`);
    no content hash in links; only a newer link version needs an action (reload).
    **No backwards compatibility below 1.1.0 – for any feature** (Tilman, 2026-09-26): no old link
    formats (`?code=`), no storage, content or config formats from before 1.1.x, no shims for old
    behaviour – nothing was deployed publicly before. (Browser/device fallbacks are not affected.) (Changed 2026-09-25; before:
    app and content versions were kept separate.)
11. Windows: stop the dev/preview server before any git command that rewrites the working tree
    (`stash`, `checkout`, `reset`, `switch`) – vite holds file locks and the operation half-fails.
    **Branches (Tilman, 2026-09-26):** all work goes to `develop` first (or a feature branch merged into
    `develop`) – `develop` deploys to staging (osct-staging.netlify.app, Netlify env `VITE_DEBUG=true`:
    debug bar on). `main` = production (osct.netlify.app, no debug bar); merge `develop` into `main` only
    when Tilman says so. Build flags (`VITE_*`) are set per Netlify site, never committed in `client/.env`.
12. AR: only `components/ar-bridges/ar/` touches three.js / the 8th Wall engine, behind `IArScene`
    (`types/scene.ts`). `<ar-bridge>` is the only glue to the store. `ArScene` keeps **one** renderer
    (`ar/view.ts`) and one camera stream and swaps a spread's targets, assets and entities in place.
    Tracking: `ar/tracker.ts` + `ar/xr8.ts` (engine loader, image targets, anchor math – re-check the anchor
    convention and the engine's `imageTargetData` diffing on an engine upgrade). A spread switch changes only
    which targets are reported; a neighbour's page held in view switches the spread (`spreadSeen`). Assets:
    `ar/assets.ts` (loaded per id, disposed when released – free GPU memory). Entity registry
    `ar/entities.ts` (add entity types with `registerEntity`, no logic in content; entities dispose what
    they create). Camera only in scan mode.
13. Type naming: game-configuration (JSON) types `*Data` (defined once in top-level `shared/types/`,
    used by the client and `scripts/`), app-internal objects plain names (`Spread`, `Target`, `Entry`, `Step`), services and
    controllers `I*` interfaces, runtime state `*State`. No second copy of a type in another package.
14. Only `client/src/utils/game-config.ts` imports `game.config.json` (type guard, then map). Everything
    else asks `utils/game-config.ts`. Vocabulary: *content* = authored input (`content/`),
    *game configuration* = build output (`game.config.json`).
15. Unused types, methods, functions etc. are removed unless a planning document (`PLAN.md`, open
    items in `MEMORY.md`) still needs them (future phase or unfinished item). Before removing, check
    for duplicates – the code may have become redundant rather than unused, so keep one version.
    Removing features/pages/managers still needs the user's okay (rule 1).
16. Errors: build time reports every problem to the author (collected, exit 1). At runtime the app uses
    `ErrorCode` + `ErrorInfo` (`types/errors.ts`); shared/low-level code throws typed errors and the app
    boundary maps them to an `ErrorCode`. The app never hangs silently on a startup error.
17. Where code lives:
    - **Store managers** (`store/managers`): app state.
    - **AR context** (`components/ar-bridges`): the bridge connects the AR scene to the game state;
      everything three.js/8th Wall specific lives in `ar/` (scene, view, tracker, assets, entity registry)
      and `utils/chroma-key.ts`; `utils/` also holds the three-free helpers (scene state policy, emitter).
    - **Services** (`services/`): singletons giving app-wide access (`GameStoreService`: the store;
      later the game configuration and the generated API). Naming: class and file `*Service`
      (`GameStoreService`, `PreloaderService`) – Tilman, 2026-09-25. (`SceneService` was removed in Phase 6.)
    - **`utils/`**: only helpers used across several of these layers. Logic used in one place goes
      next to its owner. `utils/game-config.ts` is a primitive service (module singleton) → moves to
      `services/` with the data access work (see PLAN Phase 2 versioning).

18. **Design styles** (2026-09-25, Tilman: "no CSS mess"): values come from `agents/DESIGN.md` (measured
    from the PDF). Colors, gradients, shadows, sizes only as tokens in `client/src/main.css`; controls and
    text effects only through the shared primitives in `client/src/styles/design-styles.ts`
    (`adoptDesignStyles(shadowRoot)`: `.design`, `.gold`, `.muted`, `.button`, `.pill`, `.icon-button`,
    `.rule-table`, `.section-title`). Components keep layout only – no literal colors.
    - `.gold` replaces the element's background (it is `background-clip: text`): put it on the label
      (`<button class="pill"><span class="gold">…`), never on an element that needs its own background.
      On a `.gold` element don't set `background` in the component (a more specific selector wipes the
      gradient – the text turns invisible); use `background-color` if needed.
    - Glass: `--glass-background` (alpha 0.001, never 0 – else no backdrop blur) + `--glass-blur` +
      a drop shadow: pills and "i" get the light bronze glow of the category pill (`--shadow-bronze`,
      Tilman 2026-09-26 – the dark shadow disappeared on black); onboarding buttons `--shadow-glow`.
    - Animated gold art: `<gold-illustration src="…svg">` (files stay in `public/`).
    - Primary actions get `.primary` (shining label + border sweep); everything else stays secondary.
    - **Sizes in rem, never px** (Tilman, 2026-09-26 – accessibility): the root font size is `100%`, so the
      reader's text size setting scales the whole app; media queries in `em`. 1rem = 16 px at the default
      size (DESIGN.md values: px ÷ 16). Every size and distance (widths, heights, gaps, paddings, offsets,
      radii) is rem – Tilman repeated it on 2026-09-27: "really stick to rem" (scalability for accessibility).
      Only where the value is relative to the screen or the parent by nature: viewport units (`vh`/`dvh`/`vw`)
      and percentages (e.g. `100%`, `50%` for a circle). Measurements from the design frames are converted
      to rem, never written as px.
    - On / off options are `<gold-switch>` elements (`@/components/buttons`, 2026-09-27): text left, switch
      far right, native checkbox `role="switch"` inside; listen for `change`, read `.checked`.
    - Design buttons are written with `goldButton()` (`@/components/buttons`, 2026-09-25): native
      `<button>` + shape class + gold label, never hand-written markup. Component styles that must beat
      the adopted design sheet need more specificity (`:host .pill`) – the sheet comes after `<style>`.

19. **Imports** (2026-09-25, Tilman): every folder has an `index.ts` barrel.
    - Across folders import the barrel: `@/types`, `@/utils`, `@/services`, `@/styles`, `@/pages`,
      `@/components/<group>` – never a file inside another folder, never `@/types/<file>`.
    - Inside a folder (or a component group, e.g. `ar-bridges/ar` → `../utils`) import relative files;
      never the own barrel (`types/*.ts` import their siblings, not `@/types`).
    - A component group's barrel registers its elements – pages import the group, not single files.
    - Exceptions: `@/utils/game-config` (not in the `@/utils` barrel – it loads and checks the config on
      import, RULES #14); `store/` imports `@/services/ProgressStorage` by file (the barrel would cycle
      GameStoreService → GameStore → managers). Tests may import their subject as `../file`.
    - An import used only for types is dropped when compiled: keep a separate side-effect import
      (`import "@/pages"`) where registration matters.

20. **UI texts** (Tilman, 2026-09-26): never hard-coded – every text shown to readers (incl. aria labels
    and notices) comes from i18next directly (`import { t } from "i18next"`, then `t("namespace:key")`; en default, fr, nl, de; one
    namespace per page/area; **informal** in every language). Translations are **JSON** (i18next JSON v4) in
    `src/i18n/locales/<lang>/<ns>.json`, maintained with **i18next-cli** (`npm run i18n`; the build runs it
    and warns – never fails – about missing translations, which fall back to English).
    Book content (titles, entries, steps) is not UI text. The language is stored by the i18next language
    detector (`osct-language`), not in the progress. Dev tools may stay English.

21. **PWA** (2026-09-26): the service worker (`client/sw/`, own tsconfig: `npx tsc -p sw`) serves pages
    network-first and content from a cache named after the content build hash. New public files that
    belong to the app shell must match its precache globs (`vite.config.js` → `pwa()`); content stays under
    `assets/content/`. Never make the worker serve pages cache-first (deploys would not show).

21. **Server** (Tilman, 2026-09-27): the accounts API is plain **PHP 8.1+ with PDO/MySQL** in `server/api/`
    (no framework, no Composer), deployed as `/api` next to the app. Secrets never in the repository: locally
    `server/.env` / `server/api/config.local.php` (ignored), in CI GitHub environment secrets. Queries must run
    on MySQL and SQLite (tests); schema changes go into `api/db/schema.*.sql` (idempotent). The app talks to it
    only through `ApiService` (`VITE_API_URL`); `php server/tests/api-test.php` must pass.
    Naming: the signed-in person is the **user** in code, API and database; "Account" is only the UI label.
    Update options are **opt-in** – never on by default (Tilman, 2026-09-27).
    **A deploy never resets data** (Tilman, 2026-09-27): the schema files only add (`CREATE TABLE IF NOT EXISTS`;
    later changes as additive `ALTER TABLE … ADD`), no `DROP` / `TRUNCATE` / `DELETE` – the API test enforces it
    and checks that users, sessions and progress survive a second migration. The upload deletes nothing.

## Git
- No `Co-Authored-By` or other agent/tool attribution lines in commit messages or PR descriptions
  (Tilman, 2026-09-25). This overrides any tool default.

## CI
- `.github/workflows/checks.yml` ("Checks") runs on every push/PR: scripts type-check + build + tests, the
  content build (fails on any content problem), client content build + `tsc` + `vitest`.

22. **Code comments** (Tilman, 2026-09-28): describe what a unit is responsible for, its business rules and
    contract (events, state, attributes), and non-obvious *why* – in neutral, present-tense English. No
    names, dates, design page/frame numbers, PLAN phases, quotes or history; decisions go to `MEMORY.md`,
    measured values to `DESIGN.md`, invariants here. CSS: no comments unless a rule would otherwise be
    "fixed" wrongly (one short line). Keep the `/* html */` / `/* css */` template markers.

23. **Versions and changelog** (Tilman, 2026-09-28): the version (RULES #10) only goes up, and every shipped
    change is in `docs/CHANGELOG.md`. Check before pushing: `.github/scripts/check-version.sh --strict`
    (also run by Checks – strict on `develop`, `main` and PRs into them).
    - **What bumps:** PATCH = fixes, refactors, comments, styling, tooling; MINOR = new features compatible
      with existing content and progress; MAJOR = content rebuild or progress format change. Changes only
      in `agents/`, `docs/` or `*.md` need no bump.
    - **How:** `client/package.json` + lock, `scripts/package.json` + lock, `server/api/src/Version.php`
      (`npm version X.Y.Z --no-git-tag-version` in client/ and scripts/), then
      `npm run content` in client/ (the regenerated `game.config.json` is not committed).
      Add `## X.Y.Z – <date>` at the top of `docs/CHANGELOG.md` (Added / Changed / Fixed / Removed), written
      for people, not agents.
    - **One bump per piece of work**, made when it lands on `develop` – not per commit. On a branch, bump
      last: first merge `origin/develop` into the branch, then pick the next version **above `develop`'s**
      (and above the newest `v*` tag), never the version the branch started from.
    - **Merge conflicts in version files:** never pick either side – take the next version above both.
      `game.config.json` is not in git (nothing to merge). `CHANGELOG.md`: keep every section; merged work
      without its own shipped version goes into the new section. A version must never go down.
    - **Releases** deploy production, not merges: merge to `main` → `tag-version.yml` tags `vX.Y.Z` (never
      push tags yourself – agent sessions cannot) → publish a GitHub release on that tag → `release.yml`
      (tag must equal the version and have a CHANGELOG section; docs/server.md "Releases").

## Deployment (from old rules)
- Staging: `develop` → osct.porschuetz.de (`deploy-staging.yml`) · Production: published release → `release.yml`
  (production server over FTPS + Netlify via CLI; Netlify's own builds of `main` are stopped)
- Build: `npm run build`, publish `dist`, SPA
