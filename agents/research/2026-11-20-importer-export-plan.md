# Importer and export after "the database is the only truth" (#322, with #41 and #320 part D)

Research and plan, 2026-11-20. Base: develop at 3.15.0 plus the unmerged `origin/feature/87-store-per-experience`
(store per experience `<title>/<env>/<experience>/…`, `osct content move`) – everything below assumes #87 is merged
first.

Tilman's decisions this plan works from (#322, #332, MEMORY 2026-11-20):
- The editor's database is the only truth. Nothing edits the content folder any more.
- The content folder (`OSCT_CONTENT_DIR`, outside the repository) becomes an **export** written from the database:
  snapshot, backup, CI build input. #320 part D (convert the real folder to schema 4) is not done – it is written fresh.
- The CDN follows from publishing out of the database (the editor's Publish already does this, `ContentStore`).
- The delivery import (`import-delivery.ts`, `scripts/import/<delivery>.yaml`, `scripts/layout/*`) moves behind the API.
- What stays local afterwards is renamed `scripts/` → `cli/` (#41, option A: one CLI, one folder name).

Nothing below removes anything by itself: section 4 is a list of proposals for Tilman (RULES #1/#15).

## 1. Inventory of scripts/

| Entry point | Run as | Reads | Writes | Used by today | With the DB as truth |
|---|---|---|---|---|---|
| `src/index.ts` + `src/build/*` (content build) | `npm run build:content[:force]`, `npm start`, `osct content build`, client `npm run content` via `client/content-prebuild.mjs` | `OSCT_CONTENT_DIR` (YAML + media + `plugins/*/index.ts`) | `client/src/game.config.json`, `client/public/assets/content/` (optimised media, compiled `plugin.js`) | CI `checks.yml` (fixture, twice), `demo.yml` (fixtures/demo), the Dockerfile's client prebuild (skipped when `VITE_CONTENT_BASE_URL` is set – always on deploys), local dev without a CDN | **Stays.** Builds the fixture and the demo, and an export (section 3). No longer the way the book reaches the database or the CDN. |
| `src/cli.ts` `content build` | `npm run osct -- content build` | as above | as above | same as the build | Stays (same build). |
| `src/cli.ts` `content status` | `osct content status --env … [--experience]` | storage zone, CDN | – | `content.yml` (by hand) | **Stays** – the editor's Publish writes the same bookkeeping. |
| `src/cli.ts` `content sync` | `osct content sync --env …` | the local build | `<title>/<env>/<experience>/<build>/…`, `versions.json`, `latest.json` | `demo.yml`; by hand for the book until now | **Shrinks to the demo** (and other repo-held experiences). The book is published from the editor only. Proposal: refuse an experience that exists in the instance's database (`--force` for a repair). |
| `src/cli.ts` `content purge` | `osct content purge …` | storage, CDN | deletes old version folders | `content.yml` | **Stays.** |
| `src/cli.ts` `content move` (#87 branch) | `osct content move --from <old env>` | old layout `<env>/…` | new store | once per old folder, after #87 lands | **One-off** – removal proposal once staging and production are moved. |
| `src/cli.ts` `targets prepare` (#306) | `osct targets prepare --experience …` | editor API (draft targets, images) | `PUT …/targets/{id} { recognition }` | by hand (not on the book's targets before the test run, MEMORY 2026-11-20) | **Stays** – already API-based, the model for the rest. |
| `src/import-delivery.ts` | `npm run import -- <delivery> import/<name>.yaml` | delivery folder, mapping YAML, `layout/layout.json`, existing `entry.yaml`/`scene.yaml` | `OSCT_CONTENT_DIR/entries/<id>/{target,image}.jpg, video.mp4, entry.yaml`, `scenes/<id>/scene.yaml` (only when missing); needs ffmpeg | deliveries 2110 and 2026-11-final (Tilman's machine) | **Rewritten** as `osct delivery import` against the API (section 2). Its media steps (JPEG/WebP, ffmpeg) and the page → scene rule are reused. |
| `import/2110.yaml`, `import/2026-11-final.yaml` | mapping files | – | – | the import | Stay as history (padded ids, MEMORY #63 open item). New mappings are stored with the delivery on the server (section 2). |
| `layout/extract-layout.py` | `npm run layout -- --triggers … --preview … --content …` | trigger and preview PDFs (PyMuPDF), mapping | `<content>/layout/sheets/*.jpg`, `layout.json` | before place-targets | **Stays local** (PyMuPDF), but writes into a work folder, not the content folder: `layout/` in the content is no longer read by anything once the places and references are in the DB (#321, #314). |
| `layout/place-targets.py` (#321) | `python … --api … --experience … [--apply]` | a `layout/` folder | `PUT …/targets/{id} { place }`, `POST …/assets?fit=reference`, `PUT …/surfaces/{sid}/reference` | ran once on staging | **Stays**, folded into `osct delivery layout` (section 2) – it already talks to the API. |
| `layout/prepare-delivery.py` (#248) | `npm run prepare-delivery -- --print … --triggers … --content … --mapping …` | print/preview/trigger PDFs, the **content folder's** current targets and `layout/` | cut target images, mapping, layout, `report.json` | the final print delivery | **Stays local** (PyMuPDF/Pillow) but reads the current targets from the API (draft) instead of the folder. |
| `layout/render-layout.py` | `python … --content fixtures/demo` | `book.yaml`, `spreads/*` (schema 2) | `<content>/layout/` | made `fixtures/demo/layout/` once | **Broken since schema 3/4** (reads `book.yaml` and `spreads/`, both gone). Removal proposal (section 4). |
| `src/convert-content-3.ts` | `npm run convert:3` | a 2.x source | in place | fixtures (done), was planned for the real folder | One-off, done. Removal proposal. |
| `src/convert-content-4.ts` | `npm run convert:4` | a 3.x source | in place | fixtures (done); #320 part D dropped | One-off, done. Removal proposal. |
| `src/schema-lock.ts` | `npm run schema:lock` | `shared/` | `shared/content-schema.json` | every schema bump (RULES #10), `schema.test.ts` | **Stays** (contract tooling, not content). |
| `src/sounds.ts` | `npm run sounds` | – | `client/public/assets/sounds/*` | placeholder sounds, rarely | Stays as `osct sounds` (or proposal: move next to the client once designed sounds arrive). |
| `src/config.ts` | – | `scripts/.env`, environment | – | all entry points | Stays; `OSCT_CONTENT_DIR` becomes "where the export goes / what the build reads". |
| `db/pull-staging.sh` | `scripts/db/pull-staging.sh` | staging MySQL | local MariaDB | server development | Not content tooling – proposal: move to `server/db/` in the rename PR. |

What the old import does that the API does not do yet: (1) the page → scene rule (pairs of facing pages, page 1 and the
last page alone, layout scenes for covers and matter, #296), (2) creating many entries/targets/scenes at once,
(3) media conversion with ffmpeg, (4) "never overwrite a text" on a re-run, (5) a problem list. Everything else
(single entry, target image, place, reference, enabled, tags) already has an endpoint.

What only lives in the folder today: `layout/` (sheets, `layout.json` – carried over by #321 for the places and
references; the sheets themselves are only needed as working input), the mapping notes (`note:` → a comment in
`entry.yaml`), and the delivery's original files (bigger than what the build keeps). None of these needs to be in the
database except the notes (proposal: an entry's `note` as an editors-only field – a schema MINOR, Tilman's call).

## 2. Target: the delivery import behind the API

### Shape

A delivery becomes a **draft change with a preview**, the same two steps as `import_experience`:

1. **Prepare (local, CLI)** – `osct delivery import <folder> <mapping.yaml> --experience osct`:
   - reads the mapping, applies the page → scene rule (moved from `import-delivery.ts` into a pure module, unit-tested),
   - converts media locally: images to WebP by the shared image rule (`shared/api/images.ts` numbers, `@jsquash/webp`
     is already a dependency – the staging host has no GD, so the server must not have to convert), videos with
     ffmpeg (H.264 ≤ 1280 px, AAC, as today),
   - uploads every file through the Assets API (`POST …/assets?fit=target|entryImage`, deduplicated by sha256 – a
     re-run uploads nothing new), so the server only ever sees finished files within `ASSET_MAX_BYTES`,
   - sends the **delivery plan** (JSON, no files): scenes to make, entries to make or update, per target `imageSrc`,
     `enabled`, `tags`, per entry `image`/`video` asset URLs, texts for new entries, the mapping itself and the source.
2. **Compare (server)** – `POST /editor/experiences/{id}/deliveries` without `confirm` writes nothing and answers 409
   `confirm-delivery` with a comparison: per scene/entry `new` / `media changed` / `same` / `conflict` (the field was
   edited in the draft since the last delivery or import – from `changes`), counts, problems, and a `confirmation`
   (`Confirmation.php`, same rules: person, token, state digest, 10 minutes).
3. **Apply (server)** – the same call with `confirm` applies the plan in one transaction: rows written through the
   same code as `POST …/entries` / `PUT …/targets/{id}` / scenes, each change in `changes` with kind `delivery` and the
   delivery's id, so it shows in the history and reverts like any save ("Reverting saved changes"). A table
   `deliveries` (id, experience, mapping JSON, source, by, at, counts) keeps the record – it replaces the mapping files in
   the repository as the history.

Rules carried over: texts of an existing entry are never overwritten (new entries get the placeholder texts);
media of an existing target is replaced when the delivery's file differs (by sha256 instead of file date);
`--retire` ids are never matched; a re-run of the same delivery compares as all `same`. Ids without leading zeros (#63).

### Server vs. CLI

| Step | Where | Why |
|---|---|---|
| Read a local delivery folder, PDFs | CLI | the files are on the designer's/Tilman's machine |
| PDF cuts, layout extraction (PyMuPDF, Pillow) | CLI (Python, as today) | native libraries; no Python on the hosts |
| Video re-encode | CLI (ffmpeg) | the shared FTPS host cannot run ffmpeg; the container could, but one path for both is simpler |
| Image → WebP | CLI (and the browser for editor uploads) | staging has no GD; the server's conversion stays the fallback |
| Upload files | CLI → Assets API | existing endpoint, dedupe, credits, Library |
| Page → scene rule | CLI (shared module in `shared/` or the CLI; the server validates) | the rule needs the mapping; the server must not guess pages (schema 3: no pages) |
| Diff against the draft, conflicts, confirmation | server | only the server knows the draft and its change log |
| Apply, history, revert | server | the database is the truth |
| Targets' places and surface references from the layout | CLI (`osct delivery layout`, today's place-targets.py) → existing endpoints | already done this way (#321) |

"Upload a delivery bundle" (a zip to the server) is **not** recommended as the main path: videos exceed 64 MB together,
the shared host has no ffmpeg and limited time per request. A later editor screen can take a small bundle (images
only, converted in the browser like the Library) and send the same plan – the endpoint is the same.

### The MCP's role

- New tools `preview_delivery` / `import_delivery` mirroring `preview_import` / `import_experience`: they take a plan
  (or a delivery id the CLI left as an unconfirmed draft plan) and show the person the comparison; only with their yes
  they confirm. The MCP never converts media.
- The CLI prints the comparison itself and asks for `--apply`; it can also stop after uploading and hand the
  confirmation to the person in the editor (`deliveries` page later).
- Small changes keep using the existing tools (`upload_asset`, `add_entry`, `put_target`).

### What is left of the content folder in an import

Nothing: the import never reads or writes `OSCT_CONTENT_DIR`. `prepare-delivery.py`'s matching of triggers to current
targets (perceptual hash) downloads the current target images from the draft (`GET …/draft`) instead of reading
`entries/<id>/target.jpg`.

## 3. Export: database → content folder

### Format

**The content source format** (the one `docs/content.md` describes and the content build reads), not a copy of the
built output – so the export is readable, diffable, and `osct content build` turns it into the same configuration:

```
<OSCT_CONTENT_DIR>/
  experience.yaml                 the experience (id, title, book?, passes, environment, appearance, recognition …)
  scenes/<id>/scene.yaml          label, order, surfaces (with reference image → a file next to it), passes
  entries/<id>/entry.yaml         texts, category, scene, surface, tags, credits; target { image, place, enabled, recognition … }
  entries/<id>/<files>            the target image, entry image, video, subtitles – downloaded from their URLs
  entities/<ref>/entity.yaml      shared entities + their assets
  plugins/<id>/index.ts           the Code tab's sources (`plugins` table)
  EXPORT.md                       marker: instance, experience, draft or published build, hash, time, app version – "do not edit, re-export"
  export.json                     machine record: per file its URL, sha256, size (so the next export downloads only what changed)
```

- Written by the CLI: `osct content export --experience osct [--from draft|live|<build>] [--out <dir>]` (default
  `OSCT_CONTENT_DIR`). The server adds one read endpoint, `GET /editor/experiences/{id}/export[?build=]`: the
  configuration (draft or a published version from the content store), the plugin sources, the credits and the list
  of every file URL with sha256 – no zipping on the host. The CLI writes YAML (one writer per source file, the inverse
  of `src/build/*`) and downloads the files (resume by sha256).
- The folder is replaced as a whole (write to a temp folder, swap), so nothing hand-edited survives silently;
  `EXPORT.md` says so. The export refuses to write over a folder without `EXPORT.md` unless `--force` (protects the
  current hand-made folder until Tilman has moved it aside).
- The round trip is the test: fixture → build → import into a test DB → export → build gives the same hash
  (modulo media re-encoding: the build's optimisation must be idempotent on already-optimised files, or the export
  records the built file names – to check in the ticket).

### When it runs

- **On demand** (first): the CLI command, run by Tilman or the orchestrator, e.g. before a schema cut or a release.
- **On publish** (proposal, later): the Publish endpoint already writes the configuration to the store; a
  `workflow_dispatch` "Export" in `content.yml` (or a scheduled one) runs the export against production and keeps an
  archive (not git – the videos are too large; the backup place is Tilman's call: the content store backup,
  a storage zone folder `<title>/exports/`, or his NAS).

### What happens to the content build, the fixture and the demo

- `npm run build:content` / `osct content build` stays: it builds `fixtures/content` in CI, `fixtures/demo`, and an
  export (for a local reader without CDN, or for the round-trip check). The client prebuild keeps calling it only when
  `VITE_CONTENT_BASE_URL` is empty.
- `fixtures/content` stays a hand-written test fixture in the repository (it tests the build and the engine, not the
  book). It is not an export.
- `fixtures/demo` – decision for Tilman: (a) stays a repository source, built and synced by `demo.yml` as now (the
  example of an experience without a book, also the import test); or (b) lives in the staging DB like the book and
  `fixtures/demo` becomes its committed export (re-exported by a PR after edits). Recommendation: (a) for now – the demo
  is an example in the repository, and `demo.yml` keeps working unchanged.
- The book's own folder is written fresh by the first export (#320 part D) and the current hand-made folder is moved
  aside by Tilman (kept as the last pre-DB state).
- `import_experience` from a content build stays (the demo, a new instance, a restore from an export: export → build
  → import is the restore path, with the comparison as today).

## 4. Removal list (proposals – nothing goes without Tilman's yes)

| What | Why it can go | When |
|---|---|---|
| `src/convert-content-3.ts`, `test/convert-content-3.test.ts`, `npm run convert:3` | schema 2 → 3 done for every source and DB; no compat before Tokyo (MEMORY) | now / with the rename |
| `src/convert-content-4.ts`, `test/convert-content-4.test.ts`, `npm run convert:4` | fixtures done; the real folder is exported fresh, not converted | after the first export |
| `src/lib/content-move.ts`, `osct content move`, its test (#87) | one-off move of the old store layout | after staging and production are moved |
| `src/import-delivery.ts` (writes the folder) | replaced by `osct delivery import` | after the new import has run one real delivery |
| `layout/render-layout.py`, `fixtures/demo/layout/` | broken since schema 3 (reads `book.yaml`, `spreads/`); the stage reads places and references from the DB | now (the demo's references could be uploaded once via the API instead) |
| The content build's copying of `layout/` | nothing reads `layout/` from a build any more (#321, #314) | with the export (it never writes `layout/`) |
| `osct content sync` for experiences that live in a DB | the editor publishes them | with the export; sync stays for the demo |
| `MAX_TARGETS_PER_SCENE` in `scripts/src/config.ts` as the only check | the API must check it on writes too (it may already – verify) | with the delivery endpoint |
| `printed:` in mappings | checked, not used since #32 | with the new import (keep reading, ignore) |
| `npm run protocol` / `trigger-protocol.json` | already gone (#32) – nothing to do | – |

## 5. The rename scripts/ → cli/

When: **last, one PR**, after phases 1–4 have landed (so the removals shrink what moves) and when no other branch
touches `scripts/` heavily (#87 merged; check open branches first). No functional change in that PR besides the moves.

Steps:
1. `git mv scripts cli`; `git mv cli/db server/db` (proposal); layout Python under `cli/delivery/` (or keep `cli/layout/`).
2. Package: `osct-scripts` → `osct-cli` (`cli/package.json`, lock file); the `bin` `osct` stays. npm scripts stay as
   thin aliases of `osct` subcommands (#41 option A): `osct content build|status|sync|purge|export`, `osct delivery
   import|layout|prepare`, `osct targets prepare`, `osct schema lock`, `osct sounds`.
3. References to change (found by `grep -rn "scripts/"`, excluding `.github/scripts/` and `mcp/scripts/`, which stay):
   - workflows: `checks.yml` (job `scripts`, `working-directory`, `cache-dependency-path` ×2), `content.yml`,
     `demo.yml` (paths filter, working-directory, cache path), `deploy-staging-ftps.yml` (cache path);
   - `.github/scripts/check-version.sh` (`./scripts/package.json`), RULES #10/#23 version list;
   - `Dockerfile` (COPY ×2, `cd ../scripts`), `docker-compose.yml` comment, `.gitignore` (`scripts/.env`, `scripts/dist`,
     the layout and dumps comments);
   - `client/package.json` `content`, `client/content-prebuild.mjs` comment;
   - code comments pointing at `scripts/src/…`: `engine/src/content/*`, `engine/src/scene/*`, `shared/types/*`,
     `shared/api/images.ts`, `server/api/src/{Experiences,ExperienceTexts,Scenes,Version}.php`,
     `client/src/{services,utils,components}/…`, `mcp/src/resources.ts` (only those naming the content toolchain);
     a `shared/` comment change needs a schema bump (RULES #10) – batch it with the next one or leave those comments;
   - docs: `content.md`, `content-cdn.md`, `server.md`, `deploy.md`, `editor.md`, `mcp.md`, `README.md`, `CHANGELOG.md`
     (new entry only); agents: `RULES.md`, `ORCHESTRATION.md`, `HANDOFF.md`, `CLAUDE.md`, guides that name `scripts/`;
   - local `scripts/.env` files move once (named in the changelog and HANDOFF); the staging MCP worktree unaffected.
4. Version bump (MINOR – tooling path change), changelog, `check-version.sh --strict`, the checks.

## 6. Ticket breakdown

| # | Ticket | Size | Depends on | Notes |
|---|---|---|---|---|
| T0 | Merge #87 (store per experience) | – | – | prerequisite, already its own issue |
| T1 | Export read endpoint `GET …/export[?build=]` (config + plugin sources + credits + file list with sha256) + `shared/api` type + API test | M | T0 | server only; draft and published versions |
| T2 | `osct content export`: YAML writers (inverse of `src/build/*`), downloads by sha256, `EXPORT.md` / `export.json`, temp-folder swap, `--force` guard | L | T1 | the core of #320 part D |
| T3 | Round-trip test: fixture → build → import (test DB) → export → build, same hash; fix build idempotency on optimised media | M | T2 | CI job or `scripts/test` with the PHP test server |
| T4 | First export of the book from staging into a fresh folder; Tilman moves the old folder aside; docs (`content.md` "Content build", "Export") | S | T2, Tilman | needs Tilman (folder on his machine) |
| T5 | Delivery endpoint `POST …/deliveries`: plan validation, comparison (new/changed/same/conflict from `changes`), confirmation, apply in one transaction, `changes` kind `delivery`, `deliveries` table (both schema files), revert | L | T0 | server; plan type in `shared/api/` |
| T6 | `osct delivery import`: page → scene module (from import-delivery.ts, tested), local WebP + ffmpeg, Assets uploads with dedupe, plan, print comparison, `--apply` | L | T5 | replaces `npm run import` |
| T7 | `osct delivery layout` + `prepare-delivery.py` reading current targets from the API; extract-layout writes to a work folder | M | T6 | folds place-targets.py in (or wraps it) |
| T8 | MCP `preview_delivery` / `import_delivery` (two steps, as import_experience) + mcp docs/tests | M | T5 | |
| T9 | Dry run of a real delivery (2026-11-final again → all `same`) on a copy of staging | S | T6, T7 | proves the import before removing the old one |
| T10 | Optional: export on publish / scheduled export workflow, backup place | S | T2, Tilman | decision first |
| T11 | Removals approved by Tilman (section 4) | S | T4, T9, Tilman | one PR |
| T12 | Rename `scripts/` → `cli/` + `osct` subcommands as the single entry (#41 A) | M | T11 | one PR, last |

Parallel tracks: export (T1–T4) and delivery (T5–T9) are independent after T0; T8 can follow T5 directly.

## Open decisions for Tilman

1. The demo: repository source (recommended) or DB + committed export (section 3).
2. Where exports are archived (content store backup, `<title>/exports/` on the zone, NAS) and whether a publish triggers one.
3. An entry's delivery `note` as an editors-only field in the database (schema MINOR) – or dropped.
4. Approval of each removal in section 4.
5. `db/pull-staging.sh` → `server/db/` in the rename.
