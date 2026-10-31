# Content on the CDN (bunny.net)

The built content – `game.config.json`, target images, entry images, 3D models, videos – is hosted on a bunny.net
CDN and loaded by the app at runtime. **Content and app are deployed separately**: the app deploy ships the app
shell and the API; the content goes to the CDN with the osct CLI whenever you decide to.

## Where the content lives

One storage zone (`osct`, replicated to Frankfurt, Singapore and New York), one folder per environment, and in it
**one immutable folder per content version**, served through the pull zone `buildingfictions.b-cdn.net` (later
`cdn.buildingfictions.com`). Layout and types: `shared/types/content-manifest.ts`.

```
osct/<env>/latest.json                  the current version – overwritten by every switch
osct/<env>/versions.json                every version on the storage and when it was current (for purge) – written before latest.json
osct/<env>/<build>/game.config.json     the game configuration of that version
osct/<env>/<build>/files.json           size and checksum of every content file (whole-book download)
osct/<env>/<build>/assets/content/…     the content files, same paths as in the app's public folder
```

`<env>` is `staging` or `production` – or `demo`, the demo book's own (`fixtures/demo`, never the book's). **An environment serves one book** – the last one published or synced there:
`latest.json` and each `versions.json` entry name it (`book`, the configuration's `book.id`; content schema 2.11). A
manifest without `book` is older – its version's `game.config.json` tells the book. Publishing another book to an
environment replaces the book for its readers: the editor asks first and the API refuses it without `replace: true`
([editor](editor.md) "One book per environment"). `osct content sync` writes the book too, and does not ask – it syncs
the content source it is given. A store per book is #87. `<build>` is the first 12 hex digits of the content build checksum: the same
content is the same folder, whatever app version built it. A content file on the CDN never changes, so no edge
cache, browser cache or service worker can serve a stale copy of it – only `latest.json` and `versions.json` change.

## Versions

- **Content version** = the content build checksum (`version.hash` in `game.config.json`): content files, build
  logic and the contract in `shared/`. The app version is not part of it – an app release does not make new
  content.
- **App version** a content build was made with (`version.version`): information only.
- **Content schema** `MAJOR.MINOR` (`version.schema`, `CONTENT_SCHEMA_VERSION` in `shared/types/game-config.ts`):
  the only compatibility rule between content and app. What a MAJOR and a MINOR may change and how `shared/` is locked
  to the schema is `agents/RULES.md` #10; what an app does with content of another schema – refused at startup ("update
  the app", "the content needs a newer build"), or loaded without what it does not know – and what each MINOR added is
  [Content](content.md) "Schema and app versions". After a bump, `npm run schema:lock` in `scripts/`
  (`scripts/test/schema.test.ts` fails until then; the lock command refuses a changed contract under the old number).

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
- **status** lists the versions on the storage and checks that `latest.json` and `versions.json` agree there:
  `versions.json` lists the build `latest.json` names, as its only current entry (`retiredAt` null). When they
  disagree it names the problem and exits with 1. With `CONTENT_BASE_URL` it also reads both files through the CDN,
  as a reader gets them, and warns when the edge's `versions.json` disagrees with its `latest.json` – a cached copy
  (see the pull zone settings below), not a storage problem.
- **sync** uploads the build into `<env>/<build>/` – skipped when that version is already complete on the storage
  (its `game.config.json`, written last, exists) – then records it in `versions.json` and points `latest.json` at it.
  Syncing an older content build again only moves `latest.json` back: that is the rollback. Syncing the current build
  again rewrites `versions.json` when it does not record that build as current – `latest.json` stays (#175); that is
  the repair when `status` finds the storage's two files disagreeing. Both
  files are read through the Storage API right before the write, never through the pull zone. It refuses when the
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
| `OSCT_CONTENT_ENV` | environment when `--env` is not given: `staging`, `production` or `demo` (an environment name: a letter first, then lower-case letters, digits and `-`, at most 32 – the API's `ENV` rule) |
| `BUNNY_STORAGE_ZONE` | storage zone name (`osct`) |
| `BUNNY_STORAGE_ZONE_ENDPOINT` | Storage API host (`storage.bunnycdn.com`) |
| `BUNNY_STORAGE_PASSWORD` | the zone's access key – read/write for sync and purge, read-only is enough for status and `--dry-run`; never in the repository |
| `CONTENT_BASE_URL` | the environment's CDN URL – sync checks what the CDN serves afterwards; purge requires it |

The CLI reads them from the environment or from `scripts/.env` (untracked; also read by `npm run content` in
client/). **sync** runs where the content source is – by hand on that machine; where it is triggered in the long
run (a content repository's workflow?) is open. The workflow "Content" (`.github/workflows/content.yml`, Actions →
Content → Run workflow: environment, status / purge, dry run on by default) takes the variables and the secret from
the GitHub environment; it has no sync, because a checkout of this repository has no content. The one sync on a push is the demo book's
(`.github/workflows/demo.yml`: a push to `develop` that touches the demo or what builds it, to the environment `demo`).

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
other versions are dropped. The editor's pages (`/editor`, inside the worker's scope `/`) are left alone: their CDN
requests go to the network as without a worker and never touch the reader's cache (#122).

### Pull zone settings the app depends on

The pull zone `buildingfictions.b-cdn.net` caches every file for 30 days (`cache-control: public, max-age=2592000`) and
ignores query strings, and the CLI cannot purge its edges (it has no account API key). So the app depends on three
settings, made in the bunny.net dashboard:

- **CORS for every file type.** The app's origin differs from the CDN, so every file needs
  `Access-Control-Allow-Origin: *`. A type that lacks it goes into the "CORS headers" extension list, or an edge rule
  "Set response header `Access-Control-Allow-Origin: *`" covers the whole zone.
- **`latest.json` is not cached at the edge**: an edge rule for `*/latest.json`, "Override Cache Time" → 0 (or a
  minute) – or "Vary cache → URL query string", then the app's `?t=<minute>` does the same. Without it a reader whose
  edge cached the old `latest.json` keeps the previous version for up to 30 days (it stays complete on the storage,
  nothing breaks – which is also why purge waits 30 days by default). The version folders are immutable, so their 30
  days are right. With the rule, `latest.json` answers `cache-control: public, max-age=0` and `cdn-cache: BYPASS`.
- **`versions.json` is not cached at the edge either** (#175). No code reads it through the pull zone – the CLI and the
  API read and write it through the Storage API – but a person checking the CDN does, and so does `osct content
  status`. Without a rule an edge keeps an old copy for 30 days, while `latest.json` already names a newer build; the
  storage's copy is right (an uncached URL form such as `…/staging//versions.json` reads it, `cdn-cache: MISS`).
  `?t=…` does not help, as the zone ignores query strings. The rule and the purge: the runbook below.

What the checks found and when (CORS per file type, the rules in place, the stale copies of #175): `agents/MEMORY.md`
2026-10-28 and 2026-10-30.

### Runbook: repairing a stale `versions.json` at the edge (#175)

A temporary runbook: it is run once, by a person with the bunny.net account, and goes when #175 is closed. It needs the
**account API key** (dashboard → Account settings → API key), not the storage zone's password, so neither the CLI nor
a workflow can do it.

1. Edge rule on the pull zone `buildingfictions` (Edge rules): add `*/versions.json` to the conditions of the
   `latest.json` rule (Request URL, match any), or a second rule with the same action "Override Cache Time" → 0.
2. Purge the copies the edges hold:

   ```bash
   for env in staging demo production; do
     curl -fsS -X POST -H "AccessKey: $BUNNY_API_KEY" \
       "https://api.bunny.net/purge?url=https%3A%2F%2Fbuildingfictions.b-cdn.net%2F$env%2Fversions.json&async=false"
   done
   ```

   (or in the dashboard: Pull zone → Purge cache → the three URLs).
3. Check: `npm run osct -- content status --env staging` (from `scripts/`, with the storage variables and
   `CONTENT_BASE_URL`) prints "latest.json and versions.json agree on the storage" and "CDN versions.json: agrees with
   latest.json"; or `curl -s https://buildingfictions.b-cdn.net/staging/versions.json` lists the build `latest.json`
   names with `"retiredAt": null`.

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

**Another book in a debug build** (the dev server, staging): `?content=<base url>` on the address opens the content
of that base (`latest.json` and its version folders) instead of the build's – `https://osct.porschuetz.de/?content=https://buildingfictions.b-cdn.net/demo`
shows the demo book ([plugins](plugins.md) "The demo book") in the staging reader. The tab keeps it
(`sessionStorage`) across routes and reloads; `?content=` (empty) goes back to the build's content. Progress is kept
per book id, so the demo's does not touch the book's. Production builds ignore the parameter.
