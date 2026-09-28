# OSCT documentation

OSCT is the web AR companion app for Kévin Bray's book *Onion Skin & Crocodile Tears*
(buildingfictions). It runs in the browser, with no app install and no data tracking – progress is
stored on the reader's device, and in their account if they register one (email only, no password).

Staging: [osct.netlify.app](https://osct.netlify.app) (built from `main`) [![Netlify Status](https://api.netlify.com/api/v1/badges/98de0d7b-4e71-4848-b987-6caa89675835/deploy-status)](https://app.netlify.com/sites/osct/deploys)

## Contents

| | |
|---|---|
| **Content** | [Content guide](content.md) – how `content/` is organised (for artists, designers, editors) and how `scripts/` builds it |
| **Server** | [User API](server.md) – accounts by email, progress in the account, opt-in updates; PHP + MySQL, deploy to osct.porschuetz.de |
| **App** | [Languages (i18n)](i18n.md) · [Game store](game-store.md) · [Base store](base-store.md) · [Managers](managers.md) · [Pages](pages.md) · [Error page](error-page.md) · [Components](components.md) |

Quick start: the repository [README](../README.md).

## How the app works

1. **Onboarding** – first visit: splash, intro, camera access (can be skipped; restart from Info).
   Returning readers see the splash only, then scan mode opens on their last spread.
2. **Scan mode** – the reader picks a spread (two pages) in the bottom menu and points the camera at
   the book. A found image target shows AR content (video, 3D model, image) or unlocks its entry.
3. **Consultation mode** – the unlocked entries by category: Glossary, Videos, Texts, Links.

## Repository

| Folder | What |
|---|---|
| `client/` | The app |
| `content/` | Book content as YAML + media – see [Content guide](content.md) |
| `scripts/` | Content build: `content/` → `client/src/game.config.json` – see [Content build](content.md#content-build) |
| `server/` | User API (PHP + MySQL) – see [Server](server.md) |
| `shared/` | Game configuration contract (types + runtime guards), used by app and build |
| `docs/` | This documentation |
| `agents/` | Plan, rules, decisions and design reference for work on the code |

## Development

Node 22 (as in CI). Setup and dev server: see the [README](../README.md).

- After changing `content/`, `shared/` or `scripts/src`, run `npm run build:content` in `scripts/`
  (`build:content:force` rebuilds even when nothing changed). Commit the regenerated
  `client/src/game.config.json` and `client/public/assets/content`; CI fails when they don't match.
- After changing `scripts/src`, run `npm run build` in `scripts/` first (type-check + bundle the tool).
- The camera needs HTTPS (or `localhost`): `npm run dev` serves https with a self-signed certificate –
  on the phone open `https://<your-ip>:5173` and accept the certificate once. `npm run dev:http` = plain http.
- Debug overlay (version, AR status, tracked targets, QR generator): always on with `npm run dev`; in a
  build only with `VITE_DEBUG=true` – set it in the Netlify site's environment variables (staging: on,
  production: off), locally in `client/.env.local`. `client/.env` lists the flags but sets none.

### Checks

```bash
cd client && npx tsc --noEmit && npx vitest run
cd scripts && npm run build
```

"Checks" (`.github/workflows/checks.yml`) runs these on every push and checks the committed game configuration.

### Build and deploy

```bash
cd client && npm run build                      # → client/dist, static SPA
```

Netlify builds `main`; an FTP production deploy follows later. Both need every path answered with
`index.html` for the links (`/entry/<id>` …): `client/public/_redirects` (Netlify) and
`client/public/.htaccess` (Apache) are copied into the build – see [Pages → Links](pages.md#links).

### Version

One semver for app and content build (`client/package.json` = `scripts/package.json`, checked by
tests and CI). Rebuild the content after a version bump. Every bump has an entry in the
[Changelog](CHANGELOG.md).

## Technical stack

- **Build**: [Vite](https://vitejs.dev/), tests with [Vitest](https://vitest.dev/) (happy-dom)
- **AR**: [three.js](https://threejs.org/) + the [8th Wall engine](https://github.com/8thwall/8thwall) (MIT,
  image targets, npm `@8thwall/engine`, served from `assets/xr8/`), loaded lazily with the first scan
- **State**: [Immer](https://immerjs.github.io/immer/) – `BaseStore` + `GameStore` with managers
- **UI**: vanilla custom elements with shadow DOM; shared design styles in `client/src/styles`

## Architecture

```
client/src
├── store/          GameStore (BaseStore + Immer) and its managers:
│                   Spread, Target, History, Router, Camera
├── pages/          one page open at a time (home, tutorial, spreads, entries, entry, about, …)
├── components/     header (Mark the Page, counter), scan (spread menu, found indicator),
│                   ar-bridges (AR scene), consultation, tutorial, dev-tools, …
├── services/       GameStoreService (singleton), PreloaderService, ProgressStorage
├── utils/          game-config (the only reader of game.config.json), progress-record, …
└── types/          app types; the configuration contract is re-exported from shared/
```
