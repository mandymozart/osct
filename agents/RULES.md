# Project Rules – OSCT

Replaces `.windsurfrules` (deleted). Relevant parts carried over.
Extend as we go: add a rule when a decision should hold for all future work.

## Stack (do not swap)
- Build: vite · Tests: vitest (happy-dom)
- 3D: A-Frame · Image tracking: MindAR
- State: custom monolithic game store (`IGame`, `BaseStore`) with immer drafts, split into managers
- UI: vanilla custom web components (shadow DOM), no framework
- Page/view management is self-made (`pages-router`, `RouterManager`). No routing or animation
  libraries. Transitions stay simple CSS.
- ~~jsQR~~ – in-app QR scanning is removed. The **dev overlay QR generator stays**
  (`dev-tools/qr-generator.ts` + `public/assets/deps/qrcode.js`): it opens the dev server on a phone.

## Working rules
1. **Ask before removing any feature, page, component or manager.** We are restructuring,
   not deleting. The only agreed removal is QR scanning.
2. Naming: page group = **spread** (not chapter), opened entry = **consulted** (not visited).
   Use these terms in code, content and UI.
   Modes: `IDLE`, `SCAN`, `CONSULTATION` (UI context). "About" and "Info" are the same page (`about`).
   Set the mode only through routes (`RouterManager.navigate`), never with `draft.mode = …` in components.
   The scene state is derived from mode + route (`components/aframe-bridges/utils/scene-state.ts`), never set directly;
   overlay routes (no mode) pause the scene.
3. Max **5 image targets per spread** (`.mind` group); `maxTrack` uses the same value.
   Keep it one shared constant; the content build must enforce it.
4. Preloading `.mind` files = browser cache only. Never modify the A-Frame scene
   before a group is actually activated. No second scene context for now.
5. Content is placeholder until final content arrives. Keep texts/colors/media swappable
   (config / CSS variables), never hardcoded in components.
6. Match existing code style: custom element per file, `styles`/`template` getters,
   `GameStoreService.getInstance()`, subscribe via `subscribeToProperty` and clean up
   in `disconnectedCallback`.
7. Taxonomy: **entries are top level**; target optional per entry; AR entity optional per
   target. Never assume an entity is video-only – keep entity types extensible.
8. Content lives in `content/` (YAML) → built by `scripts/` into `client/src/game.config.json`
   and `client/public/assets/content`.
9. Before ticking a plan item: `npx tsc --noEmit` and `npx vitest run` in `client/` must pass.
   Add or adapt tests in `__tests__/` next to the code you change (store, managers, content config).
   Tests of removed features are not wanted – test behaviour that stays.
10. **One version** (semver) for the app and the content build: `client/package.json` and
    `scripts/package.json` always carry the same version (checked by tests + CI); the source is
    `client/package.json`. Game configuration: PATCH/MINOR must just work, MAJOR = rebuild the content
    (no config migrations). Progress storage: a new MAJOR reads the old format and tells the user
    (add a reader in `utils/progress-record.ts`; a test fails without one). The first storage
    format is 1 – nothing from before 1.1.x is converted.
    The content *data* is identified by the build checksum (`version.hash`), not by the version.
    QR deep links are owned by Tilman – don't implement them unasked. (Changed 2026-09-25; before:
    app and content versions were kept separate.)
11. Windows: stop the dev/preview server before any git command that rewrites the working tree
    (`stash`, `checkout`, `reset`, `switch`) – vite holds file locks and the operation half-fails.
12. AR (Phase 6): only `components/aframe-bridges/ar/` touches A-Frame / MindAR, behind `IArScene`
    (`types/scene.ts`). `<ar-bridge>` is the only glue to the store. The strategy is chosen in
    `ar/index.ts` (`AR_SCENE_STRATEGY`: "rebuild" = new scene per spread, "persistent" = one scene;
    per build with `VITE_AR_STRATEGY` / `npm run build:ar-*`);
    both share the entity registry (`ar/entities.ts` – add entity types with `registerEntity`, no logic in
    content) and the MindAR helpers (`ar/mindar.ts`). Camera only in scan mode (`autoStart: false`).
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
    - **A-Frame context** (`components/aframe-bridges`): bridges create DOM and connect it to the game
      state; everything A-Frame/MindAR specific (MindAR is an A-Frame plugin) lives here, incl. its
      helpers (`ar/`: scene strategies, entity registry, MindAR helpers; `utils/`: scene state policy,
      chroma key).
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
      a drop shadow (`--shadow-dark` on camera / consultation, `--shadow-glow` on black).
    - Animated gold art: `<gold-illustration src="…svg">` (files stay in `public/`).
    - Primary actions get `.primary` (shining label + border sweep); everything else stays secondary.
    - Design buttons are written with `goldButton()` (`@/components/buttons`, 2026-09-25): native
      `<button>` + shape class + gold label, never hand-written markup. Component styles that must beat
      the adopted design sheet need more specificity (`:host .pill`) – the sheet comes after `<style>`.

## Git
- No `Co-Authored-By` or other agent/tool attribution lines in commit messages or PR descriptions
  (Tilman, 2026-09-25). This overrides any tool default.

## CI
- `.github/workflows/ci.yml` runs on every push/PR: scripts type-check + build, committed
  `game.config.json` must match the content (rebuild + commit after content/version changes),
  client `tsc` + `vitest`.

## Deployment (from old rules)
- Staging: Netlify · Production: FTP GitHub action to remote server
- Build: `npm run build`, publish `dist`, SPA
