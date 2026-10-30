# Project Rules – OSCT

Rules that hold for all future work. Add one when a decision should bind every later session; the reason and
the date of a decision go to `MEMORY.md`, measured values to `DESIGN.md`. Numbers are stable: code, docs and
issues cite them (`RULES #10`), so a new rule gets the next free number and a removed one leaves a gap.

## Stack (do not swap)
- Build: vite · Tests: vitest (happy-dom)
- 3D: three.js · Image tracking: the **8th Wall engine** (`@8thwall/engine`, MIT, image targets; served from
  `assets/xr8/` with its LICENSE) behind `IImageTracker` (`ar/tracker-types.ts`). Image targets are made from the
  target images in the app – nothing precompiled.
- State: custom monolithic game store (`IGame`, `BaseStore`) with immer drafts, split into managers
- UI: vanilla custom web components (shadow DOM), no framework
- Page/view management is self-made (`pages-router`, `RouterManager`). No routing or animation
  libraries. Transitions stay simple CSS.
- No in-app QR scanning. The **dev overlay QR generator stays** (`dev-tools/qr-generator.ts` +
  `public/assets/deps/qrcode.js`): it opens the app on a phone.

## Working rules
1. **Ask before removing any feature, page, component or manager.** We are restructuring,
   not deleting. Agreed removals so far: QR scanning; MindAR; A-Frame.
2. Naming: page group = **spread** (not chapter), opened entry = **consulted** (not visited).
   Use these terms in code, content and UI.
   Modes: `IDLE`, `SCAN`, `CONSULTATION` (UI context). "About" and "Info" are the same page (`about`).
   Set the mode only through routes (`RouterManager.navigate`), never with `draft.mode = …` in components.
   The scene state is derived from mode + route (`components/ar-bridges/utils/scene-state.ts`), never set directly;
   overlay routes (no mode) pause the scene.
3. Max **10 image targets per spread** – the engine tracks 4 at the same moment. One constant
   (`MAX_TARGETS_PER_SPREAD`, scripts/src/config.ts); the content build enforces it.
4. Preloading target images and content = browser cache only (`PreloaderService`; in production the
   service worker stores what it fetches in its content cache – `client/sw/service-worker.ts`). The
   whole-book download (Info) goes through the same `preload()` – no second download path. Never modify the AR
   scene before a spread is actually activated. No second scene / WebGL context – except the engine's own
   camera canvas under the three.js canvas. (The look-around world is one full-screen pass of the same renderer
   under the AR scene, `ar/look-around/` – no scene of its own; a book's world model is rendered once into a cube
   when it loads, `look-around/environment-assets.ts`, never per frame.) The tracker keeps the neighbouring spreads'
   image targets loaded (`prepareTargets()`, ±1 by default – `components/ar-bridges/utils/prepared-spreads.ts`);
   that is the engine's state, not the scene's. The AR code (three.js, the 8th Wall engine) is only imported
   lazily (`ar-bridges/lazy-ar-scene.ts`) – nothing on the startup path may import `ar-bridges/ar/` statically;
   the scene is built on the first scan (RUNNING).
5. Content is placeholder until final content arrives. Keep texts/colors/media swappable
   (config / CSS variables), never hardcoded in components.
6. Match existing code style: custom element per file, `styles`/`template` getters,
   `GameStoreService.getInstance()`, subscribe via `subscribeToProperty`, keep the unsubscribe function it
   returns and call it in `disconnectedCallback`. Event listeners are added and removed with the **same
   function reference** (a class field or one bound once) – a fresh `.bind(this)` on removal removes nothing.
7. Taxonomy: **entries are top level**; target optional per entry; AR entity optional per
   target. Never assume an entity is video-only – keep entity types extensible.
8. Content (YAML + media) → built by `scripts/` into `client/src/game.config.json`
   and `client/public/assets/content`. **The output is not in git.** **The book content is not in git either**
   (history included – `docs/content-out-of-git.md`): its source is a folder of its own named by
   `OSCT_CONTENT_DIR` (scripts/.env). Until `content/` has left the repository the build still falls back to it;
   that fallback goes with #5 – never add another. The repository keeps only the test fixture `fixtures/content/`
   (marked by `FIXTURE.md`, refused by `osct content sync`): CI and the tests build it – never write tests that
   need the book's own entries. Never add book content, its media or a build of it to the repository.
   **Deliveries** from the publisher are never copied into the content by hand – a mapping file
   `scripts/import/<delivery>.yaml` + `npm run import` does it (docs/content.md "Importing a delivery"), so the next
   delivery lands the same way. `npm run protocol` writes the printed-image details for the trigger trial panel.
9. Before ticking a plan item: `npx tsc --noEmit` and `npx vitest run` in `client/` must pass.
   Add or adapt tests in `__tests__/` next to the code you change (store, managers, content config).
   Tests of removed features are not wanted – test behaviour that stays. Test layers: README "Tests".
10. **One version** (semver) for the app, the content tooling (`scripts/`), the server and the MCP server (`mcp/`):
    `client/package.json`, `scripts/package.json`, `server/api/src/Version.php` and `mcp/package.json` (+ `VERSION` in
    `mcp/src/user.ts`) always carry the same version (checked by tests + CI); the source is `client/package.json`.
    **Content compatibility = the content schema `MAJOR.MINOR`, nothing else**: `CONTENT_SCHEMA_VERSION`
    (`shared/types/game-config.ts`) versions the contract in `shared/`. MAJOR = older apps cannot read it (new
    required field, renamed or removed field, changed type, new enum value) – the app refuses content of a newer
    MAJOR at startup and reads every older MAJOR down to `OLDEST_READABLE_SCHEMA_MAJOR` as it is (raise it when a
    MAJOR removes or renames something). MINOR = additions older apps ignore (new optional field, and since 2.6 a
    new **node type**: the guard lets an unknown one pass, the engine renders nothing for it and keeps its children;
    the content build and the editor's API still refuse it, unless a plugin of the book registers it – 2.13,
    `registerNodeType`) – any MINOR of the same MAJOR loads.
    Every change in `shared/` needs a bump, comments included: `shared/content-schema.json` locks the checksum of
    `shared/` to the schema (`npm run schema:lock` in `scripts/`; a test fails otherwise). The app version recorded
    in the content (`version.version`) is information only. No config migrations. Progress storage: a new MAJOR
    reads the old format and tells the user (add a reader in `utils/progress-record.ts`; a test fails without
    one). The first storage format is 1 – nothing from before 1.1.x is converted.
    The content *data* is identified by the build checksum (`version.hash`), not by the version.
    Links: plain URLs `/<route>/<value>?osct=<version>` (`services/LinkService.ts`); no content hash in links;
    only a newer link version needs an action (reload).
    **No backwards compatibility below 1.1.0 – for any feature**: no old link formats (`?code=`), no storage,
    content or config formats from before 1.1.x, no shims for old behaviour – nothing was deployed publicly
    before. (Browser/device fallbacks are not affected.)
11. Windows: stop the dev/preview server before any git command that rewrites the working tree
    (`stash`, `checkout`, `reset`, `switch`) – vite holds file locks and the operation half-fails.
    **Branches:** all work goes to `develop` first (or a feature branch merged into `develop`) – `develop`
    deploys to staging (https://osct.porschuetz.de, debug bar on). `main` = production
    (https://osct.buildingfictions.com, no debug bar); merge `develop` into `main` only when Tilman says so – the
    push deploys (docs/deploy.md). Build flags (`VITE_*`) are set per Kamal destination
    (`config/deploy.<destination>.yml` → `builder.args`), never committed in `client/.env`.
12. AR: only `components/ar-bridges/ar/` touches three.js / the 8th Wall engine, behind `IArScene`
    (`types/scene.ts`). `<ar-bridge>` is the only glue to the store. `ArScene` keeps **one** renderer
    (`ar/view.ts`) and one camera stream and swaps a spread's targets, assets and entities in place.
    Tracking: `ar/tracker.ts` + `ar/xr8.ts` (engine loader, image targets, anchor math – re-check the anchor
    convention and the engine's `imageTargetData` diffing on an engine upgrade). A spread switch changes only
    which targets are reported; a neighbour's page held in view switches the spread (`spreadSeen`). Assets:
    `ar/assets.ts` (loaded per id, disposed when released – free GPU memory). Entity registry
    `ar/entities.ts` (add entity types with `registerEntity`, a book's own with `registerNodeType`; no logic in
    content; entities dispose what they create). Camera only in scan mode.
13. Type naming: the per-entity game-configuration (JSON) types are `*Data` (`SpreadData`, `EntityData`, …,
    defined once in top-level `shared/types/`, used by the client and `scripts/`); the two root documents keep
    their names (`GameConfiguration`, `ContentManifest`). App-internal objects have plain names (`Spread`,
    `Target`, `Entry`, `Step`), services and controllers `I*` interfaces, runtime state `*State`. No second copy
    of a type in another package.
14. Only `client/src/utils/game-config.ts` imports `game.config.json` (type guard, then map). Everything
    else asks `utils/game-config.ts`. Vocabulary: *content* = authored input (the content source),
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
      the generated API, feedback, preloading). Naming: class and file `*Service` (`GameStoreService`,
      `PreloaderService`).
    - **`utils/`**: only helpers used across several of these layers. Logic used in one place goes
      next to its owner. `utils/game-config.ts` is a primitive service (module singleton).
    - File names: `services/`, `store/` and its managers are PascalCase after the one class they export;
      everything else (components, pages, utils, types) is kebab-case.

18. **Design styles** ("no CSS mess"): values come from `agents/DESIGN.md` (measured from the PDF). Colors,
    gradients, shadows, sizes only as tokens in `client/src/main.css`; controls and text effects only through
    the shared primitives in `client/src/styles/design-styles.ts` (`adoptDesignStyles(shadowRoot)`: `.design`,
    `.gold`, `.muted`, `.button`, `.pill`, `.icon-button`, `.text-link`, `.rule-table`, `.section-title`).
    Components keep layout only – no literal colors.
    - `.gold` replaces the element's background (it is `background-clip: text`): put it on the label
      (`<button class="pill"><span class="gold">…`), never on an element that needs its own background.
      On a `.gold` element don't set `background` in the component (a more specific selector wipes the
      gradient – the text turns invisible); use `background-color` if needed.
    - Glass: `--glass-background` (alpha 0.001, never 0 – else no backdrop blur) + `--glass-blur` +
      a drop shadow: pills and "i" get the light bronze glow of the category pill (`--shadow-bronze`; a dark
      shadow disappears on black); onboarding buttons `--shadow-glow`.
    - Animated gold art: `<gold-illustration src="…svg">` (files stay in `public/`).
    - Primary actions get `.primary` (shining label + border sweep); everything else stays secondary.
    - **Sizes in rem, never px** (accessibility): the root font size is `100%`, so the reader's text size
      setting scales the whole app; media queries in `em`. 1rem = 16 px at the default size (DESIGN.md values:
      px ÷ 16). Every size and distance (widths, heights, gaps, paddings, offsets, radii) is rem. Only where the
      value is relative to the screen or the parent by nature: viewport units (`vh`/`dvh`/`vw`) and percentages
      (e.g. `100%`, `50%` for a circle). Measurements from the design frames are converted to rem, never written
      as px.
    - On / off options are `<gold-switch>` elements (`@/components/buttons`): text left, switch far right, native
      checkbox `role="switch"` inside; listen for `change`, read `.checked`.
    - Design buttons are written with `goldButton()` (`@/components/buttons`): native `<button>` + shape class +
      gold label, never hand-written markup. Component styles that must beat the adopted design sheet need more
      specificity (`:host .pill`) – the sheet comes after `<style>`.

19. **Imports**: every folder has an `index.ts` barrel.
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

20. **UI texts**: never hard-coded – every text shown to readers (incl. aria labels and notices) comes from
    i18next directly (`import { t } from "i18next"`, then `t("namespace:key")`; en default, fr, nl, de; one
    namespace per page/area; **informal** in every language). Translations are **JSON** (i18next JSON v4) in
    `src/i18n/locales/<lang>/<ns>.json`, maintained with **i18next-cli** (`npm run i18n`; the build runs it
    and warns – never fails – about missing translations, which fall back to English).
    Book content (titles, entries, steps) is not UI text. The language is stored by the i18next language
    detector (`osct-language`), not in the progress. Dev tools and the **editor** (`/editor`, an authors' tool, not a
    reader's view) stay English.

21. **PWA**: the service worker (`client/sw/`, own tsconfig: `npx tsc -p sw`) serves pages
    network-first and content from a cache named after the content build hash. New public files that
    belong to the app shell must match its precache globs (`vite.config.js` → `pwa()`); content stays under
    `assets/content/`. Never make the worker serve pages cache-first (deploys would not show).

22. **Code comments**: describe what a unit is responsible for, its business rules and contract (events, state,
    attributes), and non-obvious *why* – in neutral, present-tense English. No names, dates, design page/frame
    numbers, PLAN phases, quotes or history, and no libraries or hosts the project no longer uses; decisions go
    to `MEMORY.md`, measured values to `DESIGN.md`, invariants here. CSS: no comments unless a rule would
    otherwise be "fixed" wrongly (one short line). Keep the `/* html */` / `/* css */` template markers.
    **Follow-up work in code is `TODO: … (#N)` with an issue that exists** (Proposals or Backlog); a TODO
    without an issue, or any FIXME/HACK/XXX, is removed or turned into an issue.

23. **Versions and changelog**: the version (RULES #10) only goes up, and every shipped
    change is in `docs/CHANGELOG.md`. Check before pushing: `.github/scripts/check-version.sh --strict`
    (also run by Checks – strict on `develop`, `main` and PRs into them).
    - **What bumps:** PATCH = fixes, refactors, comments, styling, tooling; MINOR = new features compatible
      with existing content and progress; MAJOR = progress format change (content compatibility is the content
      schema, RULES #10). Changes only in `agents/`, `docs/` or `*.md` need no bump.
    - **How:** `client/package.json` + lock, `scripts/package.json` + lock, `mcp/package.json` + lock (+ `VERSION` in
      `mcp/src/user.ts`), `server/api/src/Version.php` (`npm version X.Y.Z --no-git-tag-version` in client/, scripts/ and
      mcp/), then
      `npm run content` in client/ (the regenerated `game.config.json` is not committed).
      Add `## X.Y.Z – <date>` at the top of `docs/CHANGELOG.md` (Added / Changed / Fixed / Removed), written
      for people, not agents.
    - **One bump per piece of work**, made when it lands on `develop` – not per commit. On a branch, bump
      last: first merge `origin/develop` into the branch, then pick the next version **above `develop`'s**
      (and above the newest `v*` tag and every open PR's), never the version the branch started from.
    - **Merge conflicts in version files:** never pick either side – take the next version above both.
      `game.config.json` is not in git (nothing to merge). `CHANGELOG.md`: keep every section; merged work
      without its own shipped version goes into the new section. A version must never go down.
    - **Production deploys from `main`**: merge `develop` into `main` when Tilman says so →
      `deploy-production.yml` deploys, `tag-version.yml` tags `vX.Y.Z` (never push tags yourself – agent sessions
      cannot). GitHub releases are optional notes; nothing deploys from them (docs/deploy.md).

24. **Content deployment is apart from the app deployment** (`docs/content-cdn.md`).
    Content goes to the CDN with the osct CLI (`osct content sync --env <env>`, `scripts/src/cli.ts`): every content
    version is its own immutable folder `<env>/<build>/` on the bunny.net storage zone `osct` (`<build>` = content
    checksum, without the app version); `<env>/latest.json` names the current one and is the only file ever
    overwritten; `<env>/versions.json` records when each version was current. Never overwrite a file inside a
    version folder. Old versions go only through `osct content purge`, which deletes nothing that is current, served
    by the CDN, kept for rollback or retired within the CDN cache time, and refuses on inconsistent bookkeeping.
    Where the sync is triggered (by hand in `content.yml`, a local run, later a content repository) is not fixed –
    keep the CLI the one way. An app build with `VITE_CONTENT_BASE_URL` must never read content (no content build,
    no `game.config.json`, no `assets/content/`). Every content path stays `/assets/content/…` in the
    configuration; only `utils/game-config.ts` turns it into a URL (`contentUrl`). Never hardcode a CDN URL or a
    site's origin in code. The zone's access key only in GitHub environments or an untracked `scripts/.env`.

25. **Server**: the accounts API is plain **PHP 8.1+ with PDO/MySQL** in `server/api/` (no framework, no
    Composer), served as `/api` next to the app from the site's Docker image (docs/deploy.md).
    Secrets never in the repository: locally `server/.env` / `server/api/config.local.php` (ignored), in CI GitHub
    environment secrets – the container gets them as `OSCT_*` environment variables. Queries must run
    on MySQL and SQLite (tests – the API test runs on both, locally against the MariaDB of `docker-compose.yml`:
    no named parameter twice, `LIKE` patterns through `Db::contains`); schema changes go into `api/db/schema.*.sql` (idempotent). The app talks to it
    only through `ApiService` (`VITE_API_URL`); `php server/tests/api-test.php` must pass.
    Naming: the signed-in person is the **user** in code, API and database; "Account" is only the UI label.
    Update options are **opt-in** – never on by default.
    **A deploy never resets data**: the schema files only add (`CREATE TABLE IF NOT EXISTS`; later changes as
    additive `ALTER TABLE … ADD`), no `DROP` / `TRUNCATE` / `DELETE` – the API test enforces it and checks that
    users, sessions and progress survive a second migration. The upload deletes nothing.

26. **Git**: commit subjects `<version>: <subject>`, the body ends with `Refs #N` (a step) or `Fixes #N` (the
    commit that finishes the issue); `#N` never starts a line. No `Co-Authored-By` or other agent/tool
    attribution lines in commit messages or PR descriptions – this overrides any tool default. The same for
    **branch names** (Tilman, 2026-10-28): `feature/`, `bug/` or `hotfix/`, then the issue number and the topic –
    `feature/42-actions-minutes`, `bug/20-error-page-unsubscribe`, `hotfix/health-check` (a hotfix has no issue). No
    other prefix – not `issue/` (the number says it), never a tool name (`claude/…`), a generated word pair or a
    random suffix. The app's branch prefix for worktree sessions (Settings → Claude Code; it cannot be empty) is
    `feature`; rename a generated branch before its first push (`git branch -m bug/20-error-page-unsubscribe`).
    Generated files stay out of git (build output, content, `scripts/dist/`); the i18n type files are the
    one tracked exception (the type check needs them).

27. **CI**: `.github/workflows/checks.yml` ("Checks") runs on every push/PR: the version check (strict into
    `develop`/`main`), scripts type-check + build + tests + fixture build (+ the book content while it is in
    git), the Accounts API test (PHP 8.3, SQLite and MariaDB), client fixture build + `tsc` (app and service worker) +
    translations status + `vitest`, the editor, the MCP server (`mcp/`: `tsc` + vitest with the end-to-end test against
    the PHP API). All jobs must be green before a merge.
    **Actions minutes** (Tilman, 2026-10-28, #42): every push starts runners. Runs on this public repository are
    free today, but the account's included compute is nearly used up by the private repositories, and OSCT may
    become private. So **push bundled** – at the end of a round or when a stage is done, never after every commit;
    doc-only commits ride along with the next code push (a branch with a PR runs Checks twice per push: `push` +
    `pull_request`). Agents watch their own runs (`gh run watch`, `gh pr checks <n>`, `gh run list --branch <b>`)
    and read a failed one (`gh run view <id> --log-failed`) – Tilman gets no Actions mails (account setting), so a
    red run nobody looks at stays red. No self-hosted runner while the repository is public (pull requests from
    forks would run code on the PC); trimming the workflows and a local runner for `develop` are decided in #42.

28. **Deployment** (Kamal – docs/deploy.md, owned by #6): one Docker image (`Dockerfile`: content build + app +
    `server/api` as `/api`, Apache + PHP) deployed with Kamal over SSH behind kamal-proxy; MariaDB as a Kamal
    accessory per destination. Staging: `develop` → https://osct.porschuetz.de (`deploy-staging.yml`) ·
    Production: `main` → https://osct.buildingfictions.com (`deploy-production.yml`); both call `deploy.yml`.
    The FTPS upload (`deploy-staging-ftps.yml`) stays only until the staging VM exists (#10).
    Settings are `OSCT_*` environment variables (`config/deploy.yml` + `config/deploy.<destination>.yml`), secrets
    through `.kamal/secrets` from the GitHub environments `staging` / `production` – never values in git.
    Server-side HTTP behaviour (cache headers, MIME types, SPA fallback, client IP) lives in
    `server/docker/apache.conf` and the two `.htaccess` files – not at a hosting provider.

29. **Issues and board**: work is tracked as GitHub issues on the project board **OSCT**
    (github.com/users/mandymozart/projects/5: Backlog · Proposals · In progress · Review on staging · Deployed ·
    Done). Labels: one type (`bug` / `feature` / `chore`) + one `area:*`, plus `owner` (only Tilman or a colleague
    can do it) / `decide` (needs Tilman's decision: options and a recommendation in the body). Milestones are
    dated targets (`Release Japan`). Several sessions may create issues at once: search first
    (`gh issue list --search …`), never a second issue for the same thing.

30. **Every session starts with its issue**, before the first edit:
    1. Tilman names it (`#N`), or search for one: `gh issue list -s all --search "<words>"`. Read it with
       `gh issue view N --comments`.
    2. None exists → `gh issue create` (labels and body as in #29), then decide which lane it enters and say so:
       **In progress** – this session works on it now · **Backlog** – Tilman wants it, but not in this session ·
       **Proposals** – an idea, something found in passing, or it needs Tilman's decision first (label `decide`).
       Only Tilman moves an issue into Backlog or reorders it, unless he asked for it in this session.
    3. Rename the session so its title **starts with the issue number**: `#N <short title>` (several: `#N #M …`).
    4. Set your issue to **In progress** (`gh project item-edit`, ids from `gh project field-list 5 --owner @me`).
    Commits reference it (RULES #26). The deploys then move a `Fixes #N` issue to **Review on staging**
    (develop) and **Deployed** (main) – `board-status.yml`. Anything outside the issue becomes its own issue
    (Proposals), not part of this session.

31. **Documentation has one owner per topic**: the root `README.md` is the entry point and index of `docs/`;
    each `docs/*.md` owns one topic (how it works, how to use it) and the rule that governs it lives here, with a
    pointer each way – never the same paragraph in both. `agents/` is for agents only (plan, rules, memory,
    design measurements, research); readers' and developers' documentation goes to `docs/`. Remove a section
    when the code it describes is gone; a temporary runbook says so in its first line.

32. **Engine, reader, editor** (Tilman, 2026-10-29, #61 – `agents/research/2026-10-29-editor-architecture.md`):
    a clear separation. **`engine/`** is the base – the content runtime (`loadGameConfiguration`, the accessors,
    `contentUrl`) and the AR scene (`ArScene`, entities, animations, trackers behind `IImageTracker`); it knows no
    routes, accounts, stores, `import.meta.env` or i18n – the app passes what differs (tracker factory, graphics
    source, bundled content, texts). **The reader** (`client/`) uses the engine with the real tracker and carries
    **no editor trace**: no editor route or chunk, no preview flag, no mock tracker, no tune panel ("es geht im
    Debug-Overlay nicht um Einstellungen" – the overlay debugs, it never edits). **The editor** (`editor/`, a SvelteKit
    app at `/editor`, same image) uses the same engine with the mock tracker and the mock stage in process, simulates
    the game (spread, found targets, replay) in its own state, and owns the stage, the panels, saving (`/api/editor/*`)
    and publishing. Never a second renderer or scene model: what the author sees is the engine the reader runs,
    built from the same commit. The editor never imports the reader; the reader never imports the editor.
    **The MCP server** (`mcp/`, #75, docs/mcp.md) is a client of the editor's API like the editor app – over HTTP with the
    editor's token, never a second path into the database – built after SCUTOONS' MCP (Tilman, 2026-10-29: "do it like in
    scutoons … this will one day merge"): the API is the only authority, a save is the draft with the editor's link, and
    readers are reached only by a person (no publish to production from an agent). A new endpoint is a new tool there.
    **UI** (Tilman, 2026-10-29: "check for reference the scutoons UI dogma … reuse components as much as possible,
    save real estate"): the editor's controls follow the Scutoons dogma (`scutoons/agents/DESIGN.md`) built from
    OSCT's own primitives – one control height, rows with a label column, numbers as `<scrub-number>` (never a native
    slider or checkbox), small enums as segmented pressed pills, icons (Feather, `editor/icons.ts`, with a name and a
    tooltip) only where a word makes no sense – and the sheet's tabs on a phone (Tilman, 2026-10-30: "Mobile bitte
    die tabs auch mit icons statt text"), so its head stays one line –, the drawn close cross, one sheet whose head is the tab row and whose
    closed state is that row alone. A control the editor needs is built once in `components/common/` or
    `components/dev-tools/` and used by both the editor and the dev tools (`<tune-inspector>`), never twice.
    **Three token variants** (Tilman, 2026-10-29: "debugging looks like debugging, the editor neutral like Figma,
    brand UI only in reader-facing elements"): **branded** = the reader's UI (the tokens of `main.css`, the default),
    **editor** = a neutral tool in a design tool's default colours, day and night, no colour at all (Tilman: "Blau gar
    nicht"), square corners, compact system type, **debug** = the dev
    tools' green terminal. The variants live once in `styles/design-styles.ts`; a host sets `data-theme` on itself and
    every primitive inside follows. Components carry structure only – never a colour that belongs to one variant.
    **Explanations are help, not panel text** (Tilman, 2026-10-30, #133): what a control does is its help in the
    **Info view** (`data-help` / `data-help-name`, or its `title` – `editor/src/lib/help.svelte.ts`), never a hint line
    in a panel; panels show values, states and errors only. Long panels are collapsible sections (`Section.svelte`,
    open state per section).
