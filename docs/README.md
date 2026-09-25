# OSCT documentation

OSCT is the web AR companion app for Kévin Bray's book *Onion Skin & Crocodile Tears*
(buildingfictions). It runs in the browser, with no app install and no data tracking – progress is
stored only on the reader's device.

Staging: [osct.netlify.app](https://osct.netlify.app) (built from `main`) [![Netlify Status](https://api.netlify.com/api/v1/badges/98de0d7b-4e71-4848-b987-6caa89675835/deploy-status)](https://app.netlify.com/sites/osct/deploys)

## Contents

| | |
|---|---|
| **Content** | [Content structure](content.md) – authoring `content/` · [Content build](content-build.md) – `scripts/` |
| **App** | [Game store](game-store.md) · [Base store](base-store.md) · [Managers](managers.md) · [Pages](pages.md) · [Error page](error-page.md) · [Components](components.md) |

Quick start: the repository [README](../README.md).

## How the app works

1. **Onboarding** – first visit: splash, intro, camera access (can be skipped; restart from Info).
2. **Scan mode** – the reader picks a spread (two pages) in the bottom menu and points the camera at
   the book. A found image target shows AR content (video, 3D model, image) or unlocks its entry.
3. **Consultation mode** – unlocked entries by category: Glossary, Videos, Texts, Links, plus
   Bookmarked. Entries can be bookmarked and get a personal note.

## Repository

| Folder | What |
|---|---|
| `client/` | The app |
| `content/` | Book content as YAML + media – see [Content structure](content.md) |
| `scripts/` | Content build: `content/` → `client/src/game.config.json` – see [Content build](content-build.md) |
| `shared/` | Game configuration contract (types + runtime guards), used by app and build |
| `mind-ar/` | Generated: target images per spread in MindAR order, for compiling `.mind` files |
| `docs/` | This documentation |
| `agents/` | Plan, rules, decisions and design reference for work on the code |

## Development

Node 22 (as in CI). Setup and dev server: see the [README](../README.md).

- After changing `content/`, `shared/` or `scripts/src`, run `npm run build:content` in `scripts/`
  (`build:content:force` rebuilds even when nothing changed). Commit the regenerated
  `client/src/game.config.json` and `client/public/assets/content`; CI fails when they don't match.
- After changing `scripts/src`, run `npm run build` in `scripts/` first (type-check + bundle the tool).
- The camera needs HTTPS or `localhost`. On a phone, test the Netlify deploy or use an HTTPS tunnel.
- `client/.env` enables the debug overlay (`VITE_DEBUG=true`): version, AR status and strategy,
  QR generator.

### Checks

```bash
cd client && npx tsc --noEmit && npx vitest run
cd scripts && npm run build
```

CI (`.github/workflows/ci.yml`) runs these on every push and checks the committed game configuration.

### Build and deploy

```bash
cd client && npm run build                      # → client/dist, static SPA
npm run build:ar-rebuild                        # AR strategy "rebuild": one scene per spread (default)
npm run build:ar-persistent                     # AR strategy "persistent": one scene, swaps targets
```

`npm run build` uses the default strategy or `VITE_AR_STRATEGY`. In dev builds
`localStorage["osct-ar-strategy"]` overrides it (reload after changing).
Netlify builds `main`; an FTP production deploy follows later.

### Version

One semver for app and content build (`client/package.json` = `scripts/package.json`, checked by
tests and CI). Rebuild the content after a version bump.

## Technical stack

- **Build**: [Vite](https://vitejs.dev/), tests with [Vitest](https://vitest.dev/) (happy-dom)
- **AR**: [A-Frame](https://aframe.io/) + [MindAR](https://hiukim.github.io/mind-ar-js-doc/) image
  tracking, loaded from `client/public/assets/deps` (not bundled)
- **State**: [Immer](https://immerjs.github.io/immer/) – `BaseStore` + `GameStore` with managers
- **UI**: vanilla custom elements with shadow DOM; shared design styles in `client/src/styles`

## Architecture

```
client/src
├── store/          GameStore (BaseStore + Immer) and its managers:
│                   Spread, Target, History, Router, Camera
├── pages/          one page open at a time (home, tutorial, spreads, entries, entry, about, …)
├── components/     header (Mark the Page, counter), scan (spread menu, found indicator),
│                   aframe-bridges (AR scene), consultation, tutorial, dev-tools, …
├── services/       GameStoreService (singleton), PreloaderService, ProgressStorage
├── utils/          game-config (the only reader of game.config.json), progress-record, …
└── types/          app types; the configuration contract is re-exported from shared/
```
