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
   Modes: `IDLE`, `SCAN`, `CONSULTATION`. "About" and "Info" are the same page (`about`).
   Set the mode only through routes (`RouterManager.navigate`), never with `draft.mode = …` in components.
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
10. Keep **app version** (`client/package.json`, `game.version`) and **content version**
    (content builder → `game.config.json` `version`) separate. Never use one for the other.
    Versioning and QR deep links are owned by Tilman – don't implement them unasked.
11. Windows: stop the dev/preview server before any git command that rewrites the working tree
    (`stash`, `checkout`, `reset`, `switch`) – vite holds file locks and the operation half-fails.
12. Until Phase 6, scenes are built by `static-scene-bridge.ts` from HTML generated in
    `utils/templates.ts` (DOM replacement, deliberate). Extend that path (e.g. Phase 3 video autoplay);
    don't switch to dynamic entity injection or revive `scene-bridge.ts` before Phase 6.
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

## Deployment (from old rules)
- Staging: Netlify · Production: FTP GitHub action to remote server
- Build: `npm run build`, publish `dist`, SPA
