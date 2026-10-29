# The editor's architecture – engine, reader, editor, API (#61, decided 2026-10-29 evening)

Tilman, on the boundary: "Das ist die Frage des Routings – wer für was verantwortlich ist." "Der Editor hat eine
Sonderstellung: er braucht die Engine nur für ein Preview, der Rest ist simuliert. Daher muss da eine Grenze her."
"Aber wieso muss Stage dann im Reader sein – das ist doch ein Editor. Die Basis, dort was passieren kann."
"Ich möchte eine klare Trennung. Und wenn das heißt, Tune ist raus, dann bitte. Es geht im Debug-Overlay nicht um
Einstellungen. Das ist Legacy." Then: "So weit wie möglich selbstständig … ich möchte die Demo-Szene am Morgen
ausprobieren zu bearbeiten." This note is the design the night builds; the Svelte note
(`2026-10-29-editor-svelte.md`) holds the road here, the data-model note (`2026-10-28-editor-data-model.md`) the
tables it refines.

## The three parts

```
engine/        the base: content runtime + AR scene (three.js), no routes, no accounts, no UI
client/        the reader: uses the engine with the real tracker (8th Wall); no editor trace
editor/        the editor: a SvelteKit app at /editor; uses the engine with the mock tracker; owns the stage
server/api     the instance's API: accounts, progress – and now the editor's data, drafts, publish
shared/        the content contract (unchanged role)
scripts/       the content build + osct CLI (unchanged role; the publish compiles from the database instead)
```

| | engine | reader (client) | editor |
|---|---|---|---|
| Owns | `ArScene`, entities, animations, trackers behind `IImageTracker`, the content runtime (`loadGameConfiguration`, accessors, `contentUrl`), the engine's debug channel | routes `/`, `/spread`, `/entry`, …, the game store, pages, debug overlay (debugging only) | routes `/editor/*`, sign-in, books, spreads, the stage (mock tracker + mock stage + preview), panels, saving, publishing |
| Knows | the content it is given (`baseUrl` or bundled) | its user, progress, the published content | the instance user, drafts, the API |
| Imports | three, @shared; `scene/xr8-tracker.ts` also @8thwall/engine | engine (`@engine/*`) | engine (`@engine/*`), never the reader |
| Build | compiled by whoever imports it (path alias, like `shared/`) | Vite, as today | SvelteKit static (`paths.base=/editor`), in the same image |

Nothing of the editor in the reader: no `/editor` route, no lazy editor chunk, no preview flag, no mock tracker,
no tune panel, no stage protocol. `tune` leaves the debug overlay (legacy, Tilman); `TUNE_ENTITY_EVENT` becomes the
engine's `scene.overrideEntity(targetId, entity | null)`, called by the editor. The reader's `CameraManager.setSimulated`
and `HistoryManager.forgetTarget` go with the preview (nothing else used them).

## The engine (`engine/src/`)

```
content/game-config.ts   from client/src/utils/game-config.ts: loadGameConfiguration(options), accessors, contentUrl
content/compressed.ts    .gz copies
types/                   game-config (re-export of shared), targets, spreads, entries, tutorial, errors, scene, graphics
scene/                   ar-scene, assets, celebration, entities, look-around/, tracker-types, ui, view, load-test
scene/xr8-tracker.ts     ImageTracker + prefetchXr8 (tracker.ts, xr8.ts) – only the reader imports it
utils/                   camera-request, camera-debug, chroma-key, emitter, prepared-spreads, tracker-debug
```

- No `import.meta.env`, no i18next, no virtual modules, no store: the app passes what differs.
  `loadGameConfiguration({ baseUrl, bundled: () => Promise<unknown>, fetchFn, texts: { contentNewer, contentOlder } })`.
- `new ArScene(container, { createTracker: (container, options) => IImageTracker, graphics?: GraphicsSource, stage?: StageView })`:
  the reader passes the 8th Wall tracker, the editor its mock tracker and its mock stage. `GraphicsSource`
  (`getSettings()`, `subscribe()`) is what `LookAround` needs; the reader's `GraphicsService` implements it.
- Tests stay next to the code (`engine/src/**/__tests__/`), run by the reader's vitest (`include` covers them).
- The reader keeps thin re-export shims (`client/src/utils/game-config.ts`, `client/src/types/*`,
  `ar-bridges/utils/index.ts`) so its own imports do not change.

## The editor app (`editor/`)

- SvelteKit 2 + Svelte 5, `@sveltejs/adapter-static` with `fallback: index.html` (SPA; the API is PHP),
  `paths.base = "/editor"`, TypeScript, Vite. Dev server on 5175 (`npm run dev`), proxying `/api` to the PHP dev API
  (`npm run dev:api` in client/, 127.0.0.1:8080) – or `VITE_API_URL` for another one.
- Routes: `/editor/` (sign-in, then the books), `/editor/[book]` (the spreads), `/editor/[book]/[spread]` (the
  workspace: stage + panels). Sign-in = the accounts API's email code (`/auth/request` → `/auth/verify`), the token
  in `localStorage`; `/user` must say `role: "editor"`.
- The stage: `ArScene` from the engine with `MockTracker` + `MockStage` (moved from the reader, with `preview.ts`,
  `stage-layout.ts`, `trigger-protocol.ts`), the content from the draft endpoint (`loadGameConfiguration({ baseUrl:
  <api>/editor/books/<id>/draft, fetchFn: withToken })`). The editor simulates the game: current spread, found
  targets, unlock replay – its own state, not the reader's store.
- Panels (RULES #32 UI dogma, the editor token variant day/night, no brand UI): **Stage** (view presets, found
  switches + replay, shake, backdrop + photo) and **Entity** (placement X/Y/Z rows, uniform scale, filters, colour),
  edits go live through `scene.overrideEntity()`, **Save** writes the entity to the API, **Publish** makes a version.
  On a phone the panels are a sheet at the bottom, on the desktop a column at the right.
- The reader's vanilla sheet (`client/src/editor/`), `editor-page`, `scrub-number`'s editor use go; `<scrub-number>`
  is rebuilt as a Svelte component (the dogma's ScrubNumber).

## The API (`/api/editor/*`, accounts API, PHP)

Who: a signed-in user with `role = editor` (new column `users.role`, default `reader`; `POST /admin/editors { email }`
with `X-Admin-Secret` makes or marks one). Everything else 403.

Tables (schema.mysql.sql + schema.sqlite.sql, additive): `books` (id slug PK, title, author, book_json, tutorial_json,
initial_spread_id, assets_base, files_json, schema, imported_hash, created_at, updated_at), `spreads` (book_id, id,
position, title, first_page, last_page, data_json) PK (book_id, id), `entries` (book_id, id, spread_id, position,
category, title, page, data_json), `targets` (book_id, id, entry_id, image_src, entity_ref NULL, data_json – an inline
entity lives in data_json), `entities` (book_id, ref, type, data_json), `book_versions` (id, book_id, env, build, hash,
published_by, published_at, note), `changes` (id, book_id, user_id, kind, ref, before_json, after_json, created_at).

| Endpoint | Does |
|---|---|
| `GET /editor/books` | the books: id, title, author, spreads count, updatedAt, last publish (env, build, at) |
| `POST /editor/books/{id}/import` `{ configuration, files?, assetsBase? }` or `{ source: "cdn" }` | replaces the book's rows from a game configuration (transaction); `assetsBase` = where its `/assets/content/…` paths resolve (the CDN's `<base>/<build>`); `source: "cdn"` fetches `OSCT_CONTENT_BASE_URL`'s current version |
| `GET /editor/books/{id}` | the tree: book, spreads with entries, each entry's target (id, imageSrc, entity ref or inline entity) |
| `GET /editor/books/{id}/entities` · `PUT …/entities/{ref}` (body `EntityData`) | the shared entities; a PUT records a change |
| `PUT /editor/books/{id}/targets/{targetId}` `{ entity }` | an inline entity (or `{ ref }`); records a change |
| `GET /editor/books/{id}/draft/latest.json` · `…/draft/{build}/game.config.json` · `…/draft/{build}/files.json` | the draft as a content version: assembled from the rows, `build` = first 12 hex of the sha256 of the configuration; the engine's loader reads it like the CDN (Bearer token via `fetchFn`) |
| `POST /editor/books/{id}/publish` `{ env, note? }` | writes the assembled version to the content store: `<env>/<build>/game.config.json`, `files.json`, `versions.json`, `latest.json` – the reader of that environment sees it on its next start |
| `GET /editor/books/{id}/versions` | the publish log |
| `GET /editor/books/{id}/changes?limit=` | the change log |
| `GET /content/{env}/{path}` | serves the **local** content store (development, a host without the CDN): json only |

- **Assembly** (draft and publish are the same function): `version = { version: Version::APP, timestamp, schema:
  book.schema, hash }`, `book`, `initialSpreadId`, `spreads` by position, `entries` by spread + position with their
  targets, `entities`, `tutorial`. Every `src` / `imageSrc` / `image` / `illustration` that starts with
  `/assets/content/` becomes `assets_base + path` when `assets_base` is set – a published version points at the
  imported build's files, so no media is copied. `files.json` is the imported one with the same rewrite of its keys.
  Import → assemble must round-trip the configuration unchanged (the API test checks it).
- **Content store**: `OSCT_CONTENT_STORE = local | bunny`. `local`: files under `OSCT_CONTENT_STORE_DIR` (default
  `api/db/content/`), served by `GET /api/content/{env}/…`. `bunny`: PUT to
  `https://{OSCT_BUNNY_STORAGE_ENDPOINT}/{OSCT_BUNNY_STORAGE_ZONE}/{env}/…` with the `AccessKey` header
  (`OSCT_BUNNY_STORAGE_PASSWORD`), the same layout `scripts/src/lib/content-sync.ts` writes; `versions.json` is read,
  extended, written back. Kamal: the three bunny values as env / secret, `OSCT_CONTENT_STORE=bunny` on staging.
- Local dev: `OSCT_CONTENT_STORE=local`, the reader with `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local`
  shows what the editor published.

## Delivery

- Dockerfile: a third build (`editor/`), copied to `/var/www/html/editor`; root `.htaccess` sends `/editor/*` that is
  not a file to `/editor/index.html` before the reader's fallback; Apache caches `/editor/_app/immutable` for a year.
- CI (`checks.yml`): an `editor` job (npm ci, `svelte-check`, build). The staging deploy ships both on push to
  `develop` (the PR into develop is the delivery; merging is Tilman's).

## Morning test (the demo scene)

1. `cd client && npm run content` with `OSCT_CONTENT_DIR=fixtures/content` (the studio spreads), `npm run dev:api`
   with `OSCT_DB_SQLITE_PATH` and `OSCT_CONTENT_STORE=local`, `npm run dev` (5174); `cd editor && npm run dev` (5175).
2. Make yourself an editor: `curl -X POST -H "X-Admin-Secret: $OSCT_SECRET" -d '{"email":"…"}' …/api/admin/editors`.
3. Open https://localhost:5175/editor/, sign in with the email code (the mail lands in the dev API's mail log),
   import the fixture (the editor offers "Import from the reader at https://localhost:5174" → it fetches
   `game.config.json` there and posts it with `assetsBase = https://localhost:5174`), open *Studio A*, move the tree,
   save, publish to `local`, open the reader with `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local`.
