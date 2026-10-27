# Content on the CDN (bunny.net)

The built content – `game.config.json`, target images, entry images, 3D models, videos – is hosted on a
bunny.net CDN and loaded by the app at runtime. The app build only ships the app shell; a content change
reaches readers with the next content upload, without a new app build in between (the two still happen
together today, because content and code live in the same repository).

## Where the content lives

One storage zone (`osct`, replicated to Frankfurt, Singapore and New York) with one folder per environment,
served through the pull zone `buildingfictions.b-cdn.net` (later `cdn.buildingfictions.com`):

```
osct/<env>/latest.json                       which bundle is current (overwritten by every upload)
osct/<env>/<build>/game.config.json          the game configuration of the bundle (immutable)
osct/<env>/<build>/files.json                content file sizes in bytes (whole-book download)
osct/<env>/<build>/assets/content/…          the content files, same paths as in the app's public folder
```

`<env>` is `staging` (from `develop`) or `production` (from `main`). `<build>` is `<version>-<hash>`: the app
version the bundle was built with and the first 12 digits of the content build checksum (`version.hash`), so
every content build has its own folder and nothing in a folder ever changes. `latest.json` is the only moving
part (`shared/types/content-manifest.ts`):

```json
{ "build": "1.7.2-3f2a9c1b7d4e", "version": "1.7.2", "schema": 1, "hash": "3f2a9c…", "uploadedAt": "2026-10-27T12:00:00.000Z" }
```

## Upload

`npm run upload:content` in `scripts/` (after `npm run build` and `npm run build:content`) pushes the bundle
with bunny.net's Storage API (`PUT https://storage.bunnycdn.com/osct/<env>/…`, header `AccessKey`). A bundle
that is already on the storage (its `game.config.json` exists) is skipped; `latest.json` is written in any case.
Options: `--env <env>` (or `OSCT_CONTENT_ENV`), `--force` (upload again), `--dry-run` (list only).

| Variable | Meaning |
|---|---|
| `OSCT_CONTENT_ENV` | `staging` or `production` – the folder in the storage zone |
| `BUNNY_STORAGE_ZONE` | storage zone name (`osct`) |
| `BUNNY_STORAGE_ZONE_ENDPOINT` | Storage API host (`storage.bunnycdn.com`) |
| `BUNNY_STORAGE_PASSWORD` | the zone's read/write access key (never in the repository) |
| `CONTENT_BASE_URL` | optional: the CDN URL of the environment – the upload then checks that the CDN serves the new `latest.json` and the bundle, and warns when the CDN sends no CORS header |

The workflow `.github/workflows/content.yml` ("Content upload") runs it with the GitHub environment's
variables and secrets: on every push to `develop` (staging) and `main` (production) that touches the content
build inputs, and by hand (Actions → Content upload → Run workflow, pick the environment). Pushes to `main`
upload before the release workflow deploys the app, so the app never points at content that is not there.

## Loading in the app

The app build gets the environment's CDN URL as `VITE_CONTENT_BASE_URL` (the GitHub environment variable
`CONTENT_BASE_URL`, e.g. `https://buildingfictions.b-cdn.net/staging`). At startup, before anything else
(`main.ts` → `utils/game-config.ts` `loadGameConfiguration()`):

1. `GET <base>/latest.json` (always revalidated) → the current `<build>`.
2. `GET <base>/<build>/game.config.json` → checked against the contract (`shared/guards`), then the
   compatibility check below.
3. Every content path in the configuration (`/assets/content/…`) becomes `<base>/<build>/assets/content/…`.
   The rest of the app (tracker, AR scene, entries, preloader) only sees URLs.

Without `VITE_CONTENT_BASE_URL` the app loads the configuration bundled with the build (`client/src/game.config.json`)
and the content from its own `assets/content/` – the dev server, the tests and hosts without the CDN. With it,
the build drops `assets/content/` from `dist/` (the server serves app shell and API only).

The service worker caches CDN content like it cached same-origin content before (one cache per content build),
and keeps the last `latest.json` so the installed app starts offline. The whole-book download reads the
bundle's `files.json` for the sizes.

### Pull zone settings the app depends on

Checked against `buildingfictions.b-cdn.net` on 2026-10-27 (bunny.net dashboard, Tilman's team seat):

- **CORS for every file type.** The app's origin differs from the CDN, so every content file needs
  `Access-Control-Allow-Origin`. bunny.net's "CORS headers" option only covers a list of extensions – `mp4` had
  the header, `json`, `jpg`, `glb`, `gz` did not. Add the content types to that list (json, jpg, jpeg, png, webp,
  gif, glb, gz, mp4, webm, mp3, ogg, wav) or add an edge rule "Set response header
  `Access-Control-Allow-Origin: *`" for the whole zone. The upload's CDN check warns while `latest.json` has
  no CORS header; the browser then shows "The book content could not be loaded".
- **`latest.json` must not stay cached at the edge.** The zone caches every file for 30 days
  (`cache-control: public, max-age=2592000`), ignores query strings, and an upload does not purge the edge
  copies (seen: a rewritten `latest.json` stayed stale at the Vienna edge while a US edge served the new one).
  Add an edge rule for `*/latest.json`: "Override Cache Time" → 0 (or a minute). Without it, readers whose edge
  has the old manifest keep the previous bundle (it stays on the storage, nothing breaks) until the edge
  drops it. The bundle folders are immutable, so their 30 days are right.
- Browser side: the app fetches `latest.json` with `cache: "no-cache"` (revalidated on every start) and the
  bundle files with the default cache mode.

### Startup compatibility check

Content loaded at runtime may be newer than the installed app. The bundle carries the **content schema**
version it was built with (`version.schema`, `CONTENT_SCHEMA_VERSION` in `shared/types/game-config.ts`; a
bundle without it counts as 1). The app refuses a bundle with a newer schema (critical screen "The book
content is newer than this app", `ErrorCode.NOT_SUPPORTED`) – update the app. Then the one-version rule
applies as before: another MAJOR version = the content has to be rebuilt. Bump `CONTENT_SCHEMA_VERSION` when
the contract changes in a way older apps cannot ignore (a new entity type, a renamed field); additive fields
do not bump it.

A load failure (CDN unreachable, no manifest) shows the "content could not be loaded" screen
(`ErrorCode.NETWORK_ERROR`); the app never starts without content.

## Local checks

```bash
cd scripts && npm run build && npm run build:content && npm run upload:content -- --env staging --dry-run
```

To run the app against the staging CDN locally, put `VITE_CONTENT_BASE_URL=https://buildingfictions.b-cdn.net/staging`
into `client/.env.local` and start `npm run dev`. The debug overlay's console line
`[game-config] Content bundle … from …` names the bundle.

Looking at the storage: `curl -H "AccessKey: <read-only key>" https://storage.bunnycdn.com/osct/staging/`
lists the folder (JSON). Old bundles are not deleted automatically – prune them in the dashboard when the
zone grows.
