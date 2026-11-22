# Content on the CDN (bunny.net)

The built content – `game.config.json`, target images, entry images, 3D models, videos – is hosted on a bunny.net
CDN and loaded by the app at runtime. **Content and app are deployed separately**: the app deploy ships the app
shell and the API; the content goes to the CDN with the osct CLI whenever you decide to.

## Where the content lives

One storage zone (`osct`, replicated to Frankfurt, Singapore and New York) holds **titles** (white-label instances),
each title its **environments**, each environment its **experiences** – every experience has a **store of its own**,
and in it **one immutable folder per content version**, served through the pull zone `buildingfictions.b-cdn.net`
(later `cdn.buildingfictions.com`). Layout: `shared/api/content-store.ts` (#87, #50); types:
`shared/types/content-manifest.ts`.

```
<zone>/<title>/<env>/<experience>/latest.json               the current version – overwritten by every switch
<zone>/<title>/<env>/<experience>/versions.json             every version on the storage and when it was current (for purge) – written before latest.json
<zone>/<title>/<env>/<experience>/<build>/game.config.json  the game configuration of that version
<zone>/<title>/<env>/<experience>/<build>/files.json        size and checksum of every content file (whole-experience download)
<zone>/<title>/<env>/<experience>/<build>/assets/content/…  the content files, same paths as in the app's public folder
<zone>/<title>/<env>/<experience>/exports/<build>/…         the export archive of a published build (below) – never purged
<zone>/assets/<experience>/…                                the editor Library's uploads (docs/server.md "Assets") – no title, no environment
<zone>/fonts/abc-areal/…                                     the design font (below)
```

- `<title>` is a **setting of the instance**, not of the content: `OSCT_TITLE` (default `osct` – the API's
  `Config::title()` and the osct CLI read the same variable). One title per installation; a second white-label
  instance on the same zone sets its own. It has the rule of an environment's name.
- `<env>` is `staging` or `production` (a local development API has `local`, in its directory store only).
- `<experience>` is the configuration's `experience.id`: OSCT's book is `osct` (`osct/staging/osct/…`), the demo
  (`fixtures/demo`) is `demo` – an experience on staging like any other (`osct/staging/demo/…`), never on production
  (the CLI refuses a demo build there). Since #322 decision (b) the staging editor's Publish writes it, like the book's;
  `fixtures/demo` is its committed export.

**Several experiences per environment** (Tilman, 2026-11-20 – needed for Kévin's further works): a publish or sync
writes only its experience's store, so it never replaces another experience for its readers; the editor's Publish
asks nothing about other experiences any more. `latest.json` and each `versions.json` entry still name the experience
(`experience`). `<build>` is the first 12 hex digits of the content build checksum: the same content is the same
folder, whatever app version built it. A content file on the CDN never changes, so no edge cache, browser cache or
service worker can serve a stale copy of it – only `latest.json` and `versions.json` change.

**The environment's URL** – `OSCT_CONTENT_BASE_URL` (GitHub environment variable, the server's setting, the CLI's) and
the reader build's `VITE_CONTENT_BASE_URL` – is `<pull zone>/<title>/<env>`, e.g.
`https://buildingfictions.b-cdn.net/osct/staging`. Everything that reads an experience adds the experience:
`<base>/<experience>/latest.json`. The instance's **default experience** is `OSCT_EXPERIENCE` (the reader build's
`VITE_EXPERIENCE`).

### The export archive (#322)

Every publish of an experience writes the **export of the build it published** into the same store:
`<title>/<env>/<experience>/exports/<build>/` (`<env>/<experience>/exports/<build>/` in the directory store of an instance
without CDN) – Tilman, 2026-11-21: the archive follows the CDN's rules. One folder per published build, **immutable**: a
folder whose `export.json` is there is never written again (a publish of a build that has its archive writes nothing;
`export.json` is written last, so a folder without it is incomplete and the next publish of that build writes it). It
holds what `osct content export` writes – `experience.yaml`, `scenes/`, `entries/`, `entities/`, `groups.yaml`,
`credits.yaml`, `plugins/<id>/index.ts`, `EXPORT.md`, `export.json` – **but no media**: `export.json` names every file the
YAML names by its path in the folder and the immutable URL it is read from (the build's content files below
`<title>/<env>/<experience>/<build>/assets/content/…`, the Library's uploads below `assets/<experience>/…`), and lists the
content builds those URLs lie in (`builds`, the archived build included). The format, the restore and the manual run are
[Content](content.md) "Export archive". The archive is readable through the pull zone like the versions: it names no
person. The directory store does not serve it (`GET /content/…` serves the versions' json files and plugins only).

### How a publish writes (#345)

A publish writes few files to make a version live and many for its archive: the osct book's build b49f09610206 (Tilman,
2026-11-22) was 3 plugin modules, `files.json` (430 KB) and `game.config.json` (793 KB) – on the zone within a second –
then `versions.json` and `latest.json`, and then **1522 archive files** (1376 `entries/<id>/entry.yaml`, 135 scenes, 6
plugins, 5 at the top, 1.2 MB together), written one PUT after another over a new TLS connection each: ~0.43 s a file,
11 minutes. The request outlived the gateway (504 in the editor) while it wrote on; the retry wrote the same archive a
second time. Since then (`PublishJob`, docs/server.md "Publish jobs"):

- **Nothing the store has is written again.** A version folder is one check (its `game.config.json` – never
  overwritten); an archive with its `export.json` is one check; an archive without it (a publish that was cut off) is
  one **listing per folder** – the Storage API's listing carries each file's sha256 (`Checksum`) – and only the missing or
  different files are written. Media are never part of a publish (they are on the zone already, content-addressed).
- **Parallel uploads**: 16 at a time over one curl multi handle whose connections stay open (`ContentStore::putMany`);
  one after another where PHP has no curl. A file the zone refuses is tried once more on its own.
- **The order stays**: the version folder's `game.config.json` after its other files, `latest.json` only after the whole
  folder is there, the archive after the switch, its `export.json` after every other file of it. Readers get the new
  build as soon as `latest.json` is written (`job.live`) – the archive may still be on its way.

### The font folder

`osct/fonts/abc-areal/` at the zone root holds the reader's design font, ABC Areal by Dinamo (WOFF2 as delivered, never
in git – the repository is public; licence: Dinamo's permission for this release). It sits outside the environment
folders, so staging and production share it and `osct content purge` never touches it (it is no experience's store).
The app build writes the `@font-face` rules for it into `index.html` (`client/src/utils/font-face-html.ts`; the
reader loads `ABCArealVariable.woff2` and `ABCAreal-RegularItalic.woff2`), the service worker keeps the files in a
cache of its own for offline use. `VITE_FONT_BASE_URL` points a build elsewhere; empty = no web font (Arial). The pull
zone must answer with `access-control-allow-origin` (fonts are CORS requests). A replaced file gets a new name, or
installed apps keep the old one.

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
npm run osct -- content build                                          # content folder → client/src/game.config.json + assets
npm run osct -- content status --env staging                           # every experience on staging: versions, what the CDN serves
npm run osct -- content status --env staging --experience osct         # one experience
npm run osct -- content sync --env staging                             # upload the build as a version of its experience, make it current
npm run osct -- content purge --env staging --experience osct --dry-run  # which old versions would go, and why the others stay
npm run osct -- content move --from staging --env staging --dry-run    # one-off: the layout before #87 (below)
npm run osct -- targets prepare --experience osct --dry-run  # targets' recognition data made ahead (#306, content.md "Recognition")
```

Every command works on one experience's store, `<OSCT_TITLE>/<env>/<experience>/`: **sync** takes the experience of
the build (`experience.id`; `--experience` may name it and must agree), **purge** and **move** take `--experience` or
`OSCT_EXPERIENCE`, **status** checks every experience of the environment when none is named.

- **build** reads the content source `OSCT_CONTENT_DIR` (absolute, or relative to the repository; required – no
  default since #33). It stops when it is not set or has no `experience.yaml` – there is no fallback to the fixture.
- **status** lists the versions of each experience's store and checks that `latest.json` and `versions.json` agree there:
  `versions.json` lists the build `latest.json` names, as its only current entry (`retiredAt` null). When they
  disagree it names the problem and exits with 1. With `OSCT_CONTENT_BASE_URL` it also reads both files through the CDN,
  as a reader gets them, and warns when the edge's `versions.json` disagrees with its `latest.json` – a cached copy
  (see the pull zone settings below), not a storage problem.
- **sync** uploads the build into `<title>/<env>/<experience>/<build>/` – skipped when that version is already complete on the storage
  (its `game.config.json`, written last, exists) – then records it in `versions.json` and points `latest.json` at it.
  Syncing an older content build again only moves `latest.json` back: that is the rollback. Syncing the current build
  again rewrites `versions.json` when it does not record that build as current – `latest.json` stays (#175); that is
  the repair when `status` finds the storage's two files disagreeing. Both
  files are read through the Storage API right before the write, never through the pull zone. It refuses when the
  build lacks videos the current version has while their entries stay (a checkout without the git-ignored videos);
  `--without-videos` overrides. `--dry-run` shows the plan, `--force` uploads the version again. It refuses a
  build of the test fixture (`fixtures/content`, marked by `FIXTURE.md`), and a build of the demo (`DEMO.md`) for
  production.
- **purge** deletes old version folders of one experience, strictly. A version stays when it is
  - the current one (`latest.json` on the storage),
  - the one the CDN's `latest.json` names (checked through the CDN – an edge may still hand out an old pointer),
  - among the newest retired ones kept for rollback (`--keep`, default 1),
  - retired less than `--min-age` days ago (default 30 – the CDN cache time; an edge may still serve a
    `latest.json` that points at it).
  - named by the **newest export archive** of the experience in any environment of the title (its `export.json`
    `builds`, #322 – an archive's media are the builds' own files, so the newest archive per environment keeps them;
    older archives may name builds that are gone).
  It refuses to purge anything when `latest.json` or `versions.json` is missing or unreadable, when they disagree,
  when the current version's folder is missing, when the CDN's `latest.json` cannot be read, or when an archive's
  `export.json` cannot be read. Folders and files that are not versions on record stay unless `--unknown` is given –
  `exports/` (the archives) always stays, `--unknown` included. Deleted files can stay at CDN edges until their
  cache time ends – readers on an old version do not break at once.

| Variable | Meaning |
|---|---|
| `OSCT_CONTENT_DIR` | the content source to build (absolute or relative to the repository; `fixtures/content` for the test fixture) – required, no default (#33) |
| `OSCT_CONTENT_ENV` | environment when `--env` is not given: `staging` or `production` (an environment name: a letter first, then lower-case letters, digits and `-`, at most 32 – the API's `ENV` rule) |
| `OSCT_TITLE` | the title – the first segment of every store path (default `osct`; the server's setting of the same name) |
| `OSCT_EXPERIENCE` | the experience when `--experience` is not given (purge, move; status names every one without it) |
| `OSCT_BUNNY_STORAGE_ZONE` | storage zone name (`osct`) |
| `OSCT_BUNNY_STORAGE_ENDPOINT` | Storage API host (`storage.bunnycdn.com`) |
| `OSCT_BUNNY_STORAGE_PASSWORD` | the zone's access key – read/write for sync and purge, read-only is enough for status and `--dry-run`; never in the repository |
| `OSCT_CONTENT_BASE_URL` | the environment's CDN URL, `<pull zone>/<title>/<env>` (the experience is added) – sync checks what the CDN serves afterwards; purge requires it |
| `OSCT_APP_URL` | optional: the site the reader runs on (`https://osct.porschuetz.de`) – the CDN check asks with its origin and warns when the CDN sends no CORS header; unset, CORS is not checked |

The names are the server's (`docs/server.md` "Configuration") – one `OSCT_` prefix for every setting (#33; until 3.7
they were `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ZONE_ENDPOINT`, `BUNNY_STORAGE_PASSWORD` and `CONTENT_BASE_URL`).

The CLI reads them from the environment or from `scripts/.env` (untracked; also read by `npm run content` in
client/). **sync** runs where the content source is – by hand on that machine; where it is triggered in the long
run (a content repository's workflow?) is open. The workflow "Content" (`.github/workflows/content.yml`, Actions →
Content → Run workflow: environment, status / purge, dry run on by default) takes the variables and the secret from
the GitHub environment; it has no sync, because a checkout of this repository has no content. It also runs the one-off
**move** (below). No workflow syncs on a push: the demo's (`.github/workflows/demo.yml`, a push to `develop` that touches
the demo or what builds it) only builds `fixtures/demo` as a check since #322 decision (b) – the demo lives in the staging
database and its store is written by the editor's Publish; a sync from CI would overwrite that.

## Loading in the app

The app build gets the environment's CDN URL as `VITE_CONTENT_BASE_URL` (the GitHub environment variable
`OSCT_CONTENT_BASE_URL`, e.g. `https://buildingfictions.b-cdn.net/osct/staging`) and the instance's default experience
as `VITE_EXPERIENCE` (`OSCT_EXPERIENCE`, default `osct` in the deploy; the build stops when the base is set and the
experience is not). Such a build reads no content: `prebuild` skips the content build (`client/content-prebuild.mjs`),
the bundled configuration module is empty, `dist/` has no `assets/content/`, and only the splash and the home-screen
name take the experience data from the default experience's current version at build time (fallback: a local content
build, then none).

**Which experience the reader opens** (`client/src/utils/experience-path.ts`, #87): the address names it.

```
https://osct.porschuetz.de/                     the default experience (VITE_EXPERIENCE)
https://osct.porschuetz.de/scene/s1             … every link of today stays as it is
https://osct.porschuetz.de/x/demo/              another experience: the same routes below /x/<experience>
https://osct.porschuetz.de/x/demo/scene/s1
```

A path prefix, not a query parameter: the app writes the prefix into every link while it runs (`LinkService`), so a
shared link, a bookmark and a reload open the same experience, and the server answers every path with `index.html`
already. A `?x=` would be dropped by every link the app writes (`?osct=<version>`) unless each carried it as well.
`/x/<default>/…` opens the default too (the app writes it without the prefix). The installed app (PWA) starts at `/`,
the default experience. Progress is kept per experience id (`osct-progress:<experience>`), so experiences never share
it – the storage format is unchanged (RULES #10: no progress MAJOR).

At startup, before anything else (`main.ts` → `utils/game-config.ts` `loadGameConfiguration()`), with
`<base>` = `VITE_CONTENT_BASE_URL/<experience>`:

1. `GET <base>/latest.json?t=<current minute>` (revalidated) → the current `<build>`.
2. `GET <base>/<build>/game.config.json` and `files.json` → checked against the contract (`shared/guards`) and the
   content schema (above).
3. Every content path in the configuration (`/assets/content/…`) becomes `<base>/<build>/assets/content/…`. The rest
   of the app (tracker, AR scene, entries, preloader) only sees URLs.

Without `VITE_CONTENT_BASE_URL` the app uses the configuration bundled with the build (`client/src/game.config.json`)
and the content from its own `assets/content/` – the dev server, the tests and hosts without the CDN.

The service worker keeps one content cache in CDN builds. Each experience's `latest.json` is fetched network-first
and kept, so the installed app starts offline with the last content it saw; when it names another version, the cached
files of that experience's other versions are dropped (another experience's stay). The editor's pages (`/editor`, inside the worker's scope `/`) are left alone: their CDN
requests go to the network as without a worker and never touch the reader's cache (#122).

### Pull zone settings the app depends on

The pull zone `buildingfictions.b-cdn.net` caches every file for 30 days (`cache-control: public, max-age=2592000`) and
ignores query strings, and the CLI cannot purge its edges (it has no account API key). So the app depends on three
settings, made in the bunny.net dashboard:

- **CORS for every file type.** The app's origin differs from the CDN, so every file needs
  `Access-Control-Allow-Origin: *`. A type that lacks it goes into the "CORS headers" extension list, or an edge rule
  "Set response header `Access-Control-Allow-Origin: *`" covers the whole zone. The zone sends the header by file
  extension, so a new kind of file needs its extension there before the app can read it: **`vtt`** for a video's
  subtitles (#257 – the app fetches them; without the header the video plays without its subtitle line). To check a
  type, ask for any path with that extension, also one that does not exist – a listed extension answers with the header
  even on a 404: `curl -sI -H "Origin: https://osct.porschuetz.de" https://buildingfictions.b-cdn.net/x.vtt`.
- **`latest.json` is not cached at the edge**: an edge rule for `*/latest.json` (it matches every store's,
  `osct/staging/<experience>/latest.json` as well – the wildcard spans folders), "Override Cache Time" → 0 (or a
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
   for store in osct/staging/osct osct/staging/demo osct/production/osct; do
     curl -fsS -X POST -H "AccessKey: $BUNNY_API_KEY" \
       "https://api.bunny.net/purge?url=https%3A%2F%2Fbuildingfictions.b-cdn.net%2F${store//\//%2F}%2Fversions.json&async=false"
   done
   ```

   (or in the dashboard: Pull zone → Purge cache → the URLs).
3. Check: `npm run osct -- content status --env staging` (from `scripts/`, with the storage variables and
   `OSCT_CONTENT_BASE_URL`) prints "latest.json and versions.json agree on the storage" and "CDN versions.json: agrees with
   latest.json" for every experience; or `curl -s https://buildingfictions.b-cdn.net/osct/staging/osct/versions.json`
   lists the build `latest.json` names with `"retiredAt": null`.

## Moving to the store per experience (#87, one-off)

Until #87 the zone had one folder per environment at its root – `staging/`, `demo/` (the demo's environment) and,
once used, `production/` – each holding one experience. The new layout does not read them. The move copies each into
its experience's store; nothing is deleted unless asked for, and it runs **only after Tilman's approval** (the
orchestrator runs it, by hand: Actions → Content → `move`, or `osct content move` where `scripts/.env` has the zone's
read/write key).

`osct content move --from <old folder> --env <env> [--experience <id>] [--dry-run] [--delete-old]`
(`scripts/src/lib/content-move.ts`):

- copies only what the old bookkeeping knows – the version folders `versions.json` and `latest.json` name – then
  `versions.json`, then **`latest.json` last** (each version's `game.config.json` last within it, as a sync does), so
  the new store never names a version whose files are not there yet. Other entries of the old folder are listed and
  left alone. The Storage API has no copy: every file is downloaded and uploaded again with its checksum (verified by
  the Storage API).
- skips a file already in the target with the same checksum, so a move that broke off is simply run again;
- refuses when the old folder has no readable `latest.json`, or when the target already serves another build (a sync
  or publish of the new layout came first – the move would roll it back);
- afterwards compares every moved file with the target (checksum, else size) and stops with exit code 1 if one differs;
- **`--delete-old`** deletes the old folder's moved entries – its `latest.json` first, then its version folders and
  `versions.json` – only when that comparison found every file; never an entry it did not copy. Without the flag the
  old folder stays and keeps serving readers of an older build.
- The experience is the old `latest.json`'s `experience` (else its current version's configuration) unless named.

**The plan** (each step a dry run first, then for real; all with the `staging` GitHub environment unless noted):

| # | step | command |
|---|---|---|
| 1 | see what would move | `content move --from staging --env staging --dry-run` → `osct/staging/osct/` |
| 2 | copy the book | `content move --from staging --env staging` |
| 3 | copy the demo – it becomes an experience on staging | `content move --from demo --env staging --experience demo` → `osct/staging/demo/` |
| 4 | point the environment variables at the new layout | GitHub environments `staging` and `production`: `OSCT_CONTENT_BASE_URL` = `https://buildingfictions.b-cdn.net/osct/staging` / `…/osct/production`; `OSCT_EXPERIENCE` = `osct` (the default when unset); `OSCT_TITLE` only for another title |
| 5 | deploy staging, check | `content status --env staging` (both experiences agree), the reader at `/` and `/x/demo/`, the editor's Publish |
| 6 | production, when it has content | `content move --from production --env production` (production environment) |
| 7 | after the 30 days of edge cache | `content move … --delete-old` per old folder – readers of the old app keep loading the old folder until then |

Steps 2, 3 and 6 write to the zone; step 7 deletes. A deploy of this change before step 4 makes the staging reader
look for `<old base>/osct/latest.json` (not there – it shows the startup error). (The demo workflow synced into
`osct/staging/demo/` then; since #322 it only builds the demo, the editor's Publish writes its store.)

## Content out of git

The content leaves the repository, history included: [content out of git](content-out-of-git.md) – the steps, the
`git filter-repo` command and what it was tried on. CI and the tests build the test fixture (`fixtures/content`).

## Local checks

```bash
cd scripts && npm run build && npm run osct -- content build && npm run osct -- content status --env staging
```

With `OSCT_CONTENT_DIR` in `scripts/.env` pointing at the content source.

To run the app against the staging CDN locally, put `VITE_CONTENT_BASE_URL=https://buildingfictions.b-cdn.net/osct/staging`
and `VITE_EXPERIENCE=osct` into `client/.env.local` and start `npm run dev`; `/x/demo/` opens the demo. The console line
`[game-config] Content … from …` names the content version and where it came from.

**Another experience** in any build with the CDN: `/x/<experience>/` (above) – `https://osct.porschuetz.de/x/demo/`
shows the demo ([plugins](plugins.md) "The demo") in the staging reader. **Any content store in a debug build** (the
dev server, staging): `?content=<base url>` opens the content of that experience's store (`latest.json` and its
version folders) instead of the build's – `?content=https://buildingfictions.b-cdn.net/osct/staging/demo`. The tab keeps
it (`sessionStorage`) across routes and reloads; `?content=` (empty) goes back to the build's content. Progress is kept
per experience id, so the demo's does not touch the real one's. Production builds ignore the parameter.
