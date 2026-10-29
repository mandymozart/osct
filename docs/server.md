# Server – user API (PHP + MySQL)

The code lives in [`server/`](../server). Naming: *user* in code, API and database; *account* only as the UI
label (Info → Account).

Sign-in by email for the app, plus an optional password. The reader enters an email and can opt in to updates (all off
until the reader turns them on):

- **updates on Onion Skin & Crocodile Tears**
- **updates from Kévin Bray**
- **updates from Building Fictions**

The progress is always kept in the account (restored on other devices); the reader can reset it.

The server sends an email with a **link** and a **6-digit code**. Opening the link or typing the code
confirms the address and signs in the device. The first confirmation creates the account (double opt-in).
The code is needed where the link opens a different browser than the app, e.g. the home-screen app on iOS.

Afterwards the reader may set a **password** (Info → Account) and sign in with email + password instead of
waiting for an email; the email sign-in keeps working, and it is also the way back in when the password is
forgotten (sign in with the link, then set a new password).

Plain PHP 8.1+ with PDO and no Composer; it follows the same style as qr.scutoons.com. Everything lives in
`server/api/`, which the site's Docker image serves as `/api` next to the app ([Deploy](deploy.md)).

```
server/api/
  index.php               front controller – the list of endpoints
  .htaccess               everything → index.php, nothing else is served
  config.local.php        settings for local development (not committed) – from config.local.php.example; the
                          container has none, it gets OSCT_* environment variables
  src/                    Version, Config, Db, Http, Auth, Passwords, Users, Progress, Mailer, Smtp, LoginMail (mail texts en/fr/nl/de);
                          the editor: Editor (access, admin endpoint, checks), Books (import, tree, entities, targets, publish, logs),
                          ContentVersion (rows → a content version), ContentStore (local directory / bunny.net storage)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS, later columns as ALTER TABLE … ADD COLUMN – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests
  db/content/             the local content store (not committed; CONTENT_STORE_DIR)
server/deploy/migrate.php        deploy: the migration from the command line (the container's entrypoint runs it)
server/deploy/mail-test.php      one test mail with the current mail settings (in the image as /opt/osct/mail-test.php)
server/deploy/ses-smtp-password.php   SES SMTP password from an IAM secret key (docs/deploy.md "Mail")
server/docker/                   Apache configuration and entrypoint of the image (docs/deploy.md)
server/tests/api-test.php        the whole flow against php -S + SQLite, SMTP against tests/fake-smtp.php, the editor's
                                 publish to bunny against tests/fake-storage.php
```

## Endpoints

| | | |
|---|---|---|
| `POST /auth/request` | `{ email, language?, options? }` | 202 `{ requestId, expiresAt }` – sends the email |
| `POST /auth/verify` | `{ token }` or `{ requestId, code }` | `{ session, user, created }` |
| `POST /auth/password` | `{ email, password }` | `{ session, user, created: false }`; 401 `invalid-credentials` (also for unknown addresses and users without a password) |
| `POST /auth/logout` | | 204 – this device only |
| `GET /user` | | `{ user }` – with `role`: `reader` (default) or `editor` |
| `PATCH /user` | `{ options?, language? }` | `{ user }` |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `PUT /user/password` | `{ password, currentPassword? }` | `{ user }` – sets or changes the password (`user.hasPassword`) |
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10) |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` | creates missing tables and columns (the container does this at every start) |
| `POST /admin/editors` | header `X-Admin-Secret: SECRET`, `{ email }` | `{ user, created }` – gives the user the role `editor`, creating the user (confirmed, `en`, no options) when the address is new |

The editor's endpoints ([Editor data](#editor-data)) need a signed-in user with role `editor` – 401 without a
token, 403 `forbidden` for a reader. `{id}` is the book, ids and refs are `[A-Za-z0-9_-]{1,64}`:

| | | |
|---|---|---|
| `GET /editor/books` | | `{ books: [{ id, title, author, book, initialSpreadId, schema, assetsBase, importedHash, spreads, createdAt, updatedAt, lastPublish }] }` – `lastPublish` `{ env, build, at }` or null |
| `POST /editor/books/{id}/import` | `{ configuration, files?, assetsBase? }` or `{ source: "cdn" }` | `{ book, counts, draft: { build, hash } }` – replaces the book's rows from a game configuration (one transaction; the logs stay). `files` = its `files.json`, `assetsBase` = where its `/assets/content/…` paths resolve (the CDN's `<base>/<build>`); `source: "cdn"` fetches the current version of `CONTENT_BASE_URL`. 400 `invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id`, `no-content-base`; 413 `body-too-large` (`EDITOR_MAX_BYTES`); 502 `content-fetch-failed` |
| `GET /editor/books/{id}` | | `{ book, spreads: [{ …SpreadData, entries: [{ id, category, title, page, target }] }], unassigned }` – the tree; `target` = the entry's TargetData (id, imageSrc, entity inline or `{ ref }`) or null; `unassigned` = entries whose page is in no spread |
| `GET /editor/books/{id}/entities` | | `{ entities: { ref: EntityData } }` – the shared entities |
| `PUT /editor/books/{id}/entities/{ref}` | `EntityData` | `{ ref, entity }` – saves (or adds) a shared entity; records a change. 400 `invalid-entity`: no object, `type` not one of the contract's entity types, no `assets` list |
| `PUT /editor/books/{id}/targets/{targetId}` | `{ entity }` or `{ ref }` | `{ target }` – the target's entity: inline (`entity`, null removes it) or a shared one (`ref`, 400 `unknown-entity` when there is none); records a change. 404 for an unknown target |
| `GET /editor/books/{id}/draft/latest.json` · `…/draft/{build}/game.config.json` · `…/draft/{build}/files.json` | | the draft as a content version, assembled from the rows on every call (`Cache-Control: no-store`); the engine's loader reads it like the CDN with the token in its `fetchFn`. The build in the path is not checked against the current draft – an edit between the two requests is no error |
| `POST /editor/books/{id}/publish` | `{ env, note? }` | `{ env, build, hash, publishedAt }` – writes the assembled version to the content store of `env` (`local`, `staging`, `production`): `<env>/<build>/game.config.json` and `files.json` (unless that build is there already – a version folder is never overwritten), then `versions.json` (the previous current version retired), then `latest.json`; a row in the publish log. 400 `invalid-env`; 502 `content-store-failed` |
| `GET /editor/books/{id}/versions` | | `{ versions: [{ id, env, build, hash, publishedBy, publishedAt, note }] }` – the publish log, newest first |
| `GET /editor/books/{id}/changes?limit=` | | `{ changes: [{ id, kind, ref, before, after, user, createdAt }] }` – newest first; `kind` `entity` (ref = the entity) or `target` (ref = the target id, before/after = the whole target); `limit` default 50, at most 500 |
| `GET /content/{env}/{path}` | | the **local** content store, public like the CDN: `latest.json`, `versions.json` (`no-cache`) and `<build>/game.config.json` / `files.json` (immutable) – nothing else, no other path |

Signed-in calls send `Authorization: Bearer <session>`. Errors: `{ "error": { "code", "message" } }`. The
app translates the codes (`account:errors.*`).

Security notes:
- The link token, the code and the session tokens are stored only as hashes.
- A request allows 5 code attempts and is valid for 30 minutes.
- Per hour, at most 5 emails per address and 30 per IP (the IP is stored hashed).
- Links point to the calling app's origin only if it is in `ALLOWED_ORIGINS`, otherwise to `APP_URL`.
- The same `ALLOWED_ORIGINS` list controls CORS.
- Passwords: stored only as `password_hash()` bcrypt hashes (cost 12, salted; re-hashed on sign-in when the
  settings change). At least 8 characters (`PASSWORD_MIN_LENGTH`), at most 72 bytes – bcrypt would ignore the
  rest, so longer ones are refused. Per hour at most 10 failed sign-ins per address and 30 per IP
  (`PASSWORD_MAX_FAILS_PER_*`); unknown address, no password and wrong password answer the same.
- Changing an existing password needs the current one, unless the device signed in by email in the last
  15 minutes (`PASSWORD_RESET_MINUTES`) – the "forgot password" path. A password can be changed, not removed.

## Configuration

`src/Config.php` lists every key and its default. An environment variable `OSCT_<KEY>` wins, then
`server/api/config.local.php`. Mail sending is set with `MAIL_TRANSPORT`:
- `log` writes mails to a file (development).
- `mail` uses PHP `mail()` (testing).
- `smtp` sends through the `SMTP_*` account (production). It uses its own small client, so no library is needed.

The editor's keys:
- `EDITOR_MAX_BYTES` (8 MB): the largest request body of the editor endpoints – the import of a game configuration.
- `CONTENT_STORE` (`local`): where a publish to `staging` or `production` goes – `local` = the directory below, `bunny`
  = the storage zone. The environment `local` always stays in the directory.
- `CONTENT_STORE_DIR` (`api/db/content`): the local store, served by `GET /content/{env}/…`; a relative path counts
  from the api folder. The container's entrypoint creates it and makes it writable for Apache.
- `CONTENT_BASE_URL` (empty): this instance's content CDN – what `{ "source": "cdn" }` imports (the same value as
  the reader's build flag `VITE_CONTENT_BASE_URL`, [content-cdn](content-cdn.md)).
- `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_STORAGE_PASSWORD` (the zone's access
  key – a secret): the storage zone the osct CLI syncs to (`scripts/.env` has the same values). The endpoint is a
  host name; a full `http://host:port` origin is for a local test double only.

## Editor data

The editor (`editor/`, the SvelteKit app at `/editor` – `agents/RULES.md` #32) keeps its drafts in the same
database, under `/api/editor/*`. A user needs the role `editor` (`users.role`, default `reader`):
`POST /admin/editors { email }` with the `X-Admin-Secret` gives it – `curl -X POST -H "X-Admin-Secret: $OSCT_SECRET"
-H "Content-Type: application/json" -d '{"email":"…"}' https://…/api/admin/editors`. The editor itself signs in like
the reader (email code) and checks `GET /user` for `role: "editor"`.

**Tables** (both schema files, additive): `books` (the book row: `BookData` as `book_json`, the tutorial, the initial
spread, the imported `files.json`, the content schema, the imported hash, `assets_base`), `spreads`, `entries`,
`targets`, `entities` (keys `(book_id, id)` / `(book_id, ref)`, deleted with the book), `book_versions` (the publish
log) and `changes` (the change log). Every content row keeps the object exactly as it was imported in its
`data_json` column – unknown fields included – and `position` keeps the imported order; the typed columns (title,
page, category, image, entity ref, …) only index the rows for the tree and the queries. An entry's `data_json` is the
entry without its target; the target row holds the target with its entity, inline or `{ ref }`. An entry belongs to
the first spread whose pages include its `page`; one whose page is in no spread is kept (and exported) without a
spread.

**Import → draft → publish.** `POST …/import` replaces the book's rows from a game configuration in one transaction
(the editor offers the running reader's `game.config.json`, or `{ "source": "cdn" }` takes the CDN's current version);
the change and publish logs stay. The **draft** is assembled from the rows on every request (`ContentVersion`):
`version = { version: the server's app version, timestamp: now, hash, schema: the imported schema }`, then `book`,
`initialSpreadId`, `spreads`, `entries` with their targets, `entities`, `tutorial` – the same keys in the same order
as the content build writes them, so import → draft reproduces the configuration unchanged (the API test checks
it). The hash is the sha256 of that JSON without `timestamp` and `hash`; the build name is its first 12 hex digits,
so the same rows are the same version. With an `assets_base`, every `/assets/content/…` under `src`, `imageSrc`,
`image` and `illustration`, and every key of `files.json`, becomes a URL below it: a published version points at the
imported build's media on the CDN and copies nothing. `PUT …/entities/{ref}` and `PUT …/targets/{id}` change one
entity and record before and after with the user in `changes`. **Publish** writes the same assembly to the content
store as a version of the environment (`local`, `staging`, `production`) with the osct CLI's bookkeeping
(`versions.json`, `latest.json` last – [content-cdn](content-cdn.md)), so the reader of that environment sees it at
its next start and `osct content purge` understands what the editor wrote.

**The content store** (`ContentStore`): `CONTENT_STORE=local` keeps the versions in `CONTENT_STORE_DIR` and
`GET /api/content/{env}/{path}` serves their json files (version folders immutable, `latest.json` revalidated) – for
development, and for a host without the CDN. `CONTENT_STORE=bunny` sends `staging` and `production` to the storage
zone over the Storage API (`PUT https://{endpoint}/{zone}/{env}/{path}` with the `AccessKey` header and the sha256
checksum – what `scripts/src/lib/storage.ts` does), reads `versions.json` from there, and answers 502
`content-store-failed` when the zone refuses. The environment `local` always stays in the directory, so a staging
host can preview a publish on itself (`VITE_CONTENT_BASE_URL=https://<host>/api/content/local`).

Locally: `OSCT_CONTENT_STORE=local` (the default) with `npm run dev:api`, publish to `local`, and start the reader
with `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` to see what the editor published (its origin
must be in `ALLOWED_ORIGINS`, as for any other call).

## Assets

The files an editor uploads (`Assets.php`, after Scutoons' asset layer – `scutoons/agents/ASSETS.md` – sized for
OSCT): models (glb, gltf), videos (mp4, webm, mov), images (jpg, png, webp) and sounds (mp3, m4a, ogg, wav), at most
`ASSET_MAX_BYTES` (64 MB). They live in the content store under the pseudo environment `assets`:
`assets/<book>/<asset id>/v<n>.<ext>` – in `CONTENT_STORE_DIR` for the local store, served by
`GET /content/assets/…` with the file's type, a year's cache and `Access-Control-Allow-Origin: *` (the reader's
engine loads them cross-origin), or in the CDN's storage zone (`CONTENT_STORE=bunny`, reached at
`CONTENT_BASE_URL/assets/…`). `ASSET_BASE_URL` overrides where their URLs point.

A node's `src` and a target's `imageSrc` hold the asset's **absolute URL** – the publish leaves absolute URLs as
they are, so draft and every version point at the same file. Tables: `assets` (one per file: name, kind, mime,
size, sha256, width / height, the current version's path and URL) and `asset_versions` (one per upload). The same
bytes uploaded twice are one asset.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/books/{id}/assets[?kind=]` | | `{ assets: [{ id, name, kind, mime, size, width, height, version, url, usages, createdAt, updatedAt }] }` – `usages` = rows of the book naming the URL |
| `POST /editor/books/{id}/assets` | the file; `X-File-Name: name.ext` | 201 `{ asset }`, or 200 with the asset that already holds these bytes. 400 `invalid-file` (no name, unsupported type, empty), 413 `body-too-large` |
| `PUT /editor/books/{id}/assets/{aid}/file` | the file (`X-File-Name` optional, the kind must stay) | `{ asset, relinked }` – a new version at a new path (`v2.ext`: nothing to purge on a CDN); every target, entity and entry naming the old URL now names the new one (a change each) |
| `GET /editor/books/{id}/assets/{aid}/usages` | | `{ usages: [{ kind: target | entity | entry, ref }] }` |
| `DELETE /editor/books/{id}/assets/{aid}[?force=1]` | | 204; 409 `asset-in-use` with `usages` unless forced (the files of every version go) |

Renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build (PLAN 2b).

### Targets and entries made in the editor

`PUT /editor/books/{id}/targets/{tid}` also takes `{ imageSrc }` (the printed image – an asset's URL) and
`{ print }` (`PrintPlacement`, content schema 2.1: `surface` left / right, `x`, `y`, `width` in mm from the surface's
top left corner, optional `height` and `page`) – the editor's stage lays the target there; `null` removes it. 400
`invalid-target`. `POST /editor/books/{id}/entries` `{ title, page, category?, body?, target: { id?, imageSrc, print?,
entity? } }` → 201 `{ entry, spreadId }` makes an entry (id from title and page, `p102-shadows`, or the given one;
409 `duplicate-id`) with its target on the spread its page belongs to; `DELETE /editor/books/{id}/entries/{eid}` →
204 removes entry and target (changes recorded). The image's tracking data for the real reader comes with the
content build – in the editor it is the stage's printed image.

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `LOG_PATH` – locally
`server/api/db/error.log` (`db/` is never served over HTTP), in the container `/dev/stderr` = `kamal app logs`. Readers
only see "Something went wrong".

## Local development

```bash
cp server/api/config.local.php.example server/api/config.local.php   # set DB_SQLITE_PATH, MAIL_TRANSPORT=log, SECRET
cd client && npm run dev:api     # PHP on 127.0.0.1:8080
cd client && npm run dev         # vite passes /api on to it
php server/tests/api-test.php    # API tests (CI runs them too)
```

The mails (with link and code) land in `MAIL_LOG_PATH`.

## Deploy

The API ships inside the site's Docker image (`server/api` as `/api`, next to the app) and is deployed with Kamal –
`develop` → staging https://osct.porschuetz.de, `main` → production https://osct.buildingfictions.com:
[Deploy](deploy.md). Every setting comes from `OSCT_*` environment variables (`config/deploy.yml` and the
destination files; secrets through `.kamal/secrets` from the GitHub environment). The container runs the migration
(`server/deploy/migrate.php`, the same as `POST /admin/migrate`) before Apache starts, and the workflow checks
`/api/health` afterwards.

The container has no `mail()`: `MAIL_TRANSPORT` is `smtp` (or `log` for a test – the file is inside the container,
`kamal app logs` does not show it). The SMTP account is **Amazon SES** (eu-west-1; `SMTP_HOST` defaults to its
endpoint, `SMTP_USER` / `SMTP_PASS` are SES SMTP credentials, `MAIL_FROM` at the verified domain) – [Deploy, "Mail"](deploy.md#mail-aws-ses).
`php server/deploy/mail-test.php <address>` sends one test mail with the current settings (in the container:
`kamal app exec … 'php /opt/osct/mail-test.php <address>'`). Errors go to the container log (`OSCT_LOG_PATH=/dev/stderr`), read with
`kamal app logs -d staging`.
