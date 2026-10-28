# Content on the CDN (bunny.net)

The built content – `game.config.json`, target images, entry images, 3D models, videos – is hosted on a bunny.net
CDN and loaded by the app at runtime. **Content and app are deployed separately**: the app deploy ships the app
shell and the API; the content is synced to the CDN with the osct CLI whenever you decide to.

## Where the content lives

One storage zone (`osct`, replicated to Frankfurt, Singapore and New York) with **one folder per environment**,
served through the pull zone `buildingfictions.b-cdn.net` (later `cdn.buildingfictions.com`):

```
osct/<env>/game.config.json      the game configuration of the current content
osct/<env>/files.json            every content file: size in bytes and a short checksum (v)
osct/<env>/assets/content/…      the content files, same paths as in the app's public folder
```

`<env>` is `staging` or `production`. There are no version folders: a sync overwrites changed files in place and
deletes what the content no longer has, so the folder always mirrors one content build and the storage never
grows with old versions.

## Versions

- **Content version** = the content build checksum (`version.hash` in `game.config.json`): content files, build
  logic and the contract in `shared/`. Every sync of a changed build is a new content version. The app version is
  not part of it – an app release does not make new content.
- **App version** a content build was made with (`version.version`): information only.
- **Content schema** `MAJOR.MINOR` (`version.schema`, `CONTENT_SCHEMA_VERSION` in `shared/types/game-config.ts`):
  the only compatibility rule (RULES #10). The app refuses content of another MAJOR at startup – newer content:
  "update the app", older content: "the content needs a newer build". Any MINOR of the same MAJOR loads.
  - MAJOR: a change older apps cannot read – a new required field, a renamed or removed field, a changed type, a
    new enum value (entity type, asset type, category, step action).
  - MINOR: an addition older apps ignore – a new optional field (the guard ignores unknown fields).
  - Every change in `shared/` needs a bump: `shared/content-schema.json` locks the checksum of `shared/` to the
    schema. After the bump, run `npm run schema:lock` in `scripts/`; `scripts/test/schema.test.ts` fails until
    then, and the lock command refuses a changed contract under the old number.

## The osct CLI

```bash
cd scripts && npm run build
npm run osct -- content build                     # content folder → client/src/game.config.json + assets
npm run osct -- content status --env staging      # what a sync would change (reads the storage only)
npm run osct -- content sync --env staging        # mirror the build into staging/
```

`content build` reads `OSCT_CONTENT_DIR` (default: `content/` in the repository – the content moves out of git, see
below). `content sync` compares every file's SHA-256 with the checksum the storage reports, uploads new and
changed files, then `files.json`, then `game.config.json` (from here on the app loads the new content), and only
then deletes files and folders the content no longer has – readers still on the previous configuration keep their
files until the switch. `--dry-run` shows the plan, `--force` uploads every file again.

| Variable | Meaning |
|---|---|
| `OSCT_CONTENT_DIR` | the content folder to build (default `content/`) |
| `OSCT_CONTENT_ENV` | environment when `--env` is not given: `staging` or `production` |
| `BUNNY_STORAGE_ZONE` | storage zone name (`osct`) |
| `BUNNY_STORAGE_ZONE_ENDPOINT` | Storage API host (`storage.bunnycdn.com`) |
| `BUNNY_STORAGE_PASSWORD` | the zone's access key – read/write for sync, read-only is enough for status; never in the repository |
| `CONTENT_BASE_URL` | optional: the environment's CDN URL – the sync then checks what the CDN serves and warns about CORS or a stale edge |

The CLI reads them from the environment or from `scripts/.env` (untracked). Where the sync is triggered is not
fixed yet: by hand on a machine, or the workflow "Content sync" (`.github/workflows/content.yml`, Actions → Content
sync → Run workflow: environment, status or sync), which takes the variables and the secret from the GitHub
environment. Nothing syncs on a push.

## Loading in the app

The app build gets the environment's CDN URL as `VITE_CONTENT_BASE_URL` (the GitHub environment variable
`CONTENT_BASE_URL`, e.g. `https://buildingfictions.b-cdn.net/staging`). Such a build reads no content: `prebuild`
skips the content build (`client/content-prebuild.mjs`), the bundled configuration module is empty, `dist/` has no
`assets/content/`, and only the splash and the home-screen name take the book data from the CDN's
`game.config.json` at build time (fallback: a local content build, then none).

At startup, before anything else (`main.ts` → `utils/game-config.ts` `loadGameConfiguration()`):

1. `GET <base>/game.config.json` and `GET <base>/files.json`, both with `?t=<current minute>` and revalidated.
2. The configuration is checked against the contract (`shared/guards`) and the content schema (above).
3. Every content path in the configuration (`/assets/content/…`) becomes `<base>/assets/content/…?v=<checksum>`
   (from `files.json`): files are overwritten in place, so the URL changes with the file and no cache – browser,
   service worker or CDN edge – serves an old copy. Without `files.json` the URLs have no `?v=`.

Without `VITE_CONTENT_BASE_URL` the app uses the configuration bundled with the build (`client/src/game.config.json`)
and the content from its own `assets/content/` – the dev server, the tests and hosts without the CDN.

The service worker keeps one content cache in CDN builds: storing a new version of a file (`?v=`) drops the older
ones. The configuration and the file list are fetched network-first and kept, so the installed app starts offline
with the last content it saw. The whole-book download takes the sizes from `files.json`.

### Pull zone settings the app depends on

Checked against `buildingfictions.b-cdn.net` on 2026-10-27 (bunny.net dashboard, Tilman's team seat):

- **CORS for every file type.** The app's origin differs from the CDN, so every content file needs
  `Access-Control-Allow-Origin`. bunny.net's "CORS headers" option only covers a list of extensions – `mp4` had the
  header, `json`, `jpg`, `glb`, `gz` did not. Add the content types to that list (json, jpg, jpeg, png, webp, gif,
  glb, gz, mp4, webm, mp3, ogg, wav) or add an edge rule "Set response header `Access-Control-Allow-Origin: *`" for
  the whole zone. Without it the browser shows "The book content could not be loaded".
- **Vary the cache by query string.** The zone caches every file for 30 days
  (`cache-control: public, max-age=2592000`) and ignores query strings, and the sync cannot purge (no account API
  key). Turn on "Vary cache → URL query string": then `?v=` gives every file version its own edge entry and
  `?t=<minute>` makes an edge ask the storage for the configuration at most once a minute. Until it is on, an edge
  can keep an overwritten file for up to 30 days (a manual purge in the dashboard helps).

## Content out of git (next step)

The content is meant to leave the repository entirely. The order matters:

1. This split (done): the app can be built without content, the content is synced on its own.
2. The deploy (Kamal session) builds the app image with `VITE_CONTENT_BASE_URL`.
3. `content/` moves to a folder or repository outside; `OSCT_CONTENT_DIR` points the CLI at it. CI and the client
   tests switch to a small fixture configuration, the `Dockerfile` drops `COPY content`, the checks workflow drops
   the content build.

Doing 3 before 2 breaks the deploy, which still builds the content into the image.

## Local checks

```bash
cd scripts && npm run build && npm run osct -- content build && npm run osct -- content status --env staging
```

To run the app against the staging CDN locally, put `VITE_CONTENT_BASE_URL=https://buildingfictions.b-cdn.net/staging`
into `client/.env.local` and start `npm run dev`. The console line `[game-config] Content … from …` names the
content hash and where it came from.
