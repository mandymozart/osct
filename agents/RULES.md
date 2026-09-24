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
- ~~jsQR~~ – QR scanning is being removed.

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

## Deployment (from old rules)
- Staging: Netlify · Production: FTP GitHub action to remote server
- Build: `npm run build`, publish `dist`, SPA
