# Content on the CDN (bunny.net)

The built content – `game.config.json`, target images, entry images, 3D models, videos – is hosted on a bunny.net
CDN and loaded by the app at runtime. **Content and app are deployed separately**: the app deploy ships the app
shell and the API; the content goes to the CDN with the osct CLI whenever you decide to.

## Where the content lives

One storage zone (`osct`, replicated to Frankfurt, Singapore and New York), one folder per environment, and in it
**one immutable folder per content version**, served through the pull zone `buildingfictions.b-cdn.net` (later
`cdn.buildingfictions.com`). Layout and types: `shared/types/content-manifest.ts`.

```
osct/<env>/latest.json                  the current version – the only file that is ever overwritten
osct/<env>/versions.json                every version on the storage and when it was current (for purge)
osct/<env>/<build>/game.config.json     the game configuration of that version
osct/<env>/<build>/files.json           size and checksum of every content file (whole-book download)
osct/<env>/<build>/assets/content/…     the content files, same paths as in the app's public folder
```

`<env>` is `staging` or `production`. `<build>` is the first 12 hex digits of the content build checksum: the same
content is the same folder, whatever app version built it. A content file on the CDN never changes, so no edge
cache, browser cache or service worker can serve a stale copy of it – only `latest.json` moves.

## Versions

- **Content version** = the content build checksum (`version.hash` in `game.config.json`): content files, build
  logic and the contract in `shared/`. The app version is not part of it – an app release does not make new
  content.
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
npm run osct -- content build                          # content folder → client/src/game.config.json + assets
npm run osct -- content status --env staging           # versions on the storage, what the CDN serves
npm run osct -- content sync --env staging             # upload the build as a version, make it current
npm run osct -- content purge --env staging --dry-run  # which old versions would go, and why the others stay
```

- **build** reads the content source `OSCT_CONTENT_DIR` (absolute, or relative to the repository; default: a
  local `content/` folder). It stops when there is no `book.yaml` – there is no fallback to the fixture.
- **sync** uploads the build into `<env>/<build>/` – skipped when that version is already complete on the storage
  (its `game.config.json`, written last, exists) – then records it in `versions.json` and points `latest.json` at it.
  Syncing an older content build again only moves `latest.json` back: that is the rollback. It refuses when the
  build lacks videos the current version has while their entries stay (a checkout without the git-ignored videos);
  `--without-videos` overrides. `--dry-run` shows the plan, `--force` uploads the version again. It refuses a
  build of the test fixture (`fixtures/content`, marked by `FIXTURE.md`).
- **purge** deletes old version folders, strictly. A version stays when it is
  - the current one (`latest.json` on the storage),
  - the one the CDN's `latest.json` names (checked through the CDN – an edge may still hand out an old pointer),
  - among the newest retired ones kept for rollback (`--keep`, default 1),
  - retired less than `--min-age` days ago (default 30 – the CDN cache time; an edge may still serve a
    `latest.json` that points at it).
  It refuses to purge anything when `latest.json` or `versions.json` is missing or unreadable, when they disagree,
  when the current version's folder is missing, or when the CDN's `latest.json` cannot be read. Folders and files
  that are not versions on record stay unless `--unknown` is given. Deleted files can stay at CDN edges until their
  cache time ends – readers on an old version do not break at once.

| Variable | Meaning |
|---|---|
| `OSCT_CONTENT_DIR` | the content source to build (absolute or relative to the repository; `fixtures/content` for the test fixture) |
| `OSCT_CONTENT_ENV` | environment when `--env` is not given: `staging` or `production` |
| `BUNNY_STORAGE_ZONE` | storage zone name (`osct`) |
| `BUNNY_STORAGE_ZONE_ENDPOINT` | Storage API host (`storage.bunnycdn.com`) |
| `BUNNY_STORAGE_PASSWORD` | the zone's access key – read/write for sync and purge, read-only is enough for status and `--dry-run`; never in the repository |
| `CONTENT_BASE_URL` | the environment's CDN URL – sync checks what the CDN serves afterwards; purge requires it |

The CLI reads them from the environment or from `scripts/.env` (untracked; also read by `npm run content` in
client/). **sync** runs where the content source is – by hand on that machine; where it is triggered in the long
run (a content repository's workflow?) is open. The workflow "Content" (`.github/workflows/content.yml`, Actions →
Content → Run workflow: environment, status / purge, dry run on by default) takes the variables and the secret from
the GitHub environment; it has no sync, because a checkout of this repository has no content. Nothing runs on a
push.

## Loading in the app

The app build gets the environment's CDN URL as `VITE_CONTENT_BASE_URL` (the GitHub environment variable
`CONTENT_BASE_URL`, e.g. `https://buildingfictions.b-cdn.net/staging`). Such a build reads no content: `prebuild`
skips the content build (`client/content-prebuild.mjs`), the bundled configuration module is empty, `dist/` has no
`assets/content/`, and only the splash and the home-screen name take the book data from the CDN's current version
at build time (fallback: a local content build, then none).

At startup, before anything else (`main.ts` → `utils/game-config.ts` `loadGameConfiguration()`):

1. `GET <base>/latest.json?t=<current minute>` (revalidated) → the current `<build>`.
2. `GET <base>/<build>/game.config.json` and `files.json` → checked against the contract (`shared/guards`) and the
   content schema (above).
3. Every content path in the configuration (`/assets/content/…`) becomes `<base>/<build>/assets/content/…`. The rest
   of the app (tracker, AR scene, entries, preloader) only sees URLs.

Without `VITE_CONTENT_BASE_URL` the app uses the configuration bundled with the build (`client/src/game.config.json`)
and the content from its own `assets/content/` – the dev server, the tests and hosts without the CDN.

The service worker keeps one content cache in CDN builds. `latest.json` is fetched network-first and kept, so the
installed app starts offline with the last content it saw; when it names another version, the cached files of the
other versions are dropped.

### Pull zone settings the app depends on

Checked against `buildingfictions.b-cdn.net` on 2026-10-27 and 2026-10-28 (bunny.net dashboard, Tilman's team seat):

- **CORS for every file type.** The app's origin differs from the CDN. On 2026-10-28 JSON and JPEG sent
  `Access-Control-Allow-Origin: *` (models and videos not checked). If a type lacks it, add it to the "CORS headers"
  extension list or add an edge rule "Set response header `Access-Control-Allow-Origin: *`" for the whole zone.
- **`latest.json` must not stay cached at the edge.** The zone caches every file for 30 days
  (`cache-control: public, max-age=2592000`), ignores query strings (checked 2026-10-28), and the CLI cannot purge
  the edge (no account API key). Add an edge rule for `*/latest.json`: "Override Cache Time" → 0 (or a minute) – or
  turn on "Vary cache → URL query string", then the app's `?t=<minute>` does the same. Until then a reader whose
  edge cached the old `latest.json` keeps the previous version for up to 30 days (it stays complete on the storage,
  nothing breaks – which is also why purge waits 30 days by default). The version folders are immutable, so their
  30 days are right.

## Content out of git

The content leaves the repository, history included: [content out of git](content-out-of-git.md) – the steps, the
`git filter-repo` command and what it was tried on. CI and the tests build the test fixture (`fixtures/content`).

## Local checks

```bash
cd scripts && npm run build && npm run osct -- content build && npm run osct -- content status --env staging
```

With `OSCT_CONTENT_DIR` in `scripts/.env` pointing at the content source.

To run the app against the staging CDN locally, put `VITE_CONTENT_BASE_URL=https://buildingfictions.b-cdn.net/staging`
into `client/.env.local` and start `npm run dev`. The console line `[game-config] Content … from …` names the content
version and where it came from.
