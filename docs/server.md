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
                          Roles (reader / editor / admin, the tables roles + user_roles), Admin (the admin endpoints, who may call them);
                          the editor: Editor (access, checks), Books (import, tree, entities, targets, publish, logs),
                          ContentVersion (rows → a content version), ContentStore (local directory / bunny.net storage)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS, later columns as ALTER TABLE … ADD COLUMN – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests
  db/content/             the local content store (not committed; CONTENT_STORE_DIR)
server/deploy/migrate.php        deploy: the migration from the command line (the container's entrypoint runs it)
server/deploy/mail-test.php      one test mail with the current mail settings (in the image as /opt/osct/mail-test.php)
server/deploy/ses-smtp-password.php   SES SMTP password from an IAM secret key (docs/deploy.md "Mail")
server/docker/                   Apache configuration and entrypoint of the image (docs/deploy.md)
server/tests/api-test.php        the whole flow against php -S + SQLite (or MariaDB: OSCT_TEST_DB=mysql), SMTP against
                                 tests/fake-smtp.php, the editor's publish to bunny against tests/fake-storage.php
docker-compose.yml               (repository root) the local MariaDB – [Local development](#local-development)
scripts/db/pull-staging.sh       staging's database into the local MariaDB – [Staging's data](#stagings-data)
server/db-dumps/                 the dumps it keeps (not committed)
```

## Endpoints

| | | |
|---|---|---|
| `POST /auth/request` | `{ email, language?, options? }` | 202 `{ requestId, expiresAt }` – sends the email |
| `POST /auth/verify` | `{ token }` or `{ requestId, code }` | `{ session, user, created }` |
| `POST /auth/password` | `{ email, password }` | `{ session, user, created: false }`; 401 `invalid-credentials` (also for unknown addresses and users without a password) |
| `POST /auth/logout` | | 204 – this device only |
| `GET /user` | | `{ user }` – `{ email, language, options, hasPassword, roles, role, createdAt }`; `roles` holds `reader` for everyone, `editor`, `admin` ([Roles](#roles)) |
| `PATCH /user` | `{ options?, language? }` | `{ user }` |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `PUT /user/password` | `{ password, currentPassword? }` | `{ user }` – sets or changes the password (`user.hasPassword`) |
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10) |
| `/admin/*` | | the [Admin API](#admin-api): roles, users, the newsletter CSV, migrate |

The editor's endpoints ([Editor data](#editor-data)) need a signed-in user with the role `editor` ([Roles](#roles)) – 401
without a token, 403 `forbidden` for a reader. `{id}` is the book, ids and refs are `[A-Za-z0-9_-]{1,64}`:

| | | |
|---|---|---|
| `GET /editor/books` | | `{ books: [{ id, title, author, book, initialSpreadId, schema, assetsBase, importedHash, spreads, createdAt, updatedAt, lastPublish, live }], environments }` – `lastPublish` `{ env, build, at }` or null; `live` = the environments serving the book `[{ env, build, since }]` (empty: draft only, the tree's `book` has it too); `environments` = what each environment serves `[{ env, book, build, since }]` (`book` null when it cannot be told), `{ env, error }` when its store cannot be read – only environments that serve something |
| `POST /editor/books/{id}/import` | `{ configuration, files?, assetsBase? }` or `{ source: "cdn" }` | `{ book, counts, draft: { build, hash } }` – replaces the book's rows from a game configuration (one transaction; the logs stay). `files` = its `files.json`, `assetsBase` = where its `/assets/content/…` paths resolve (the CDN's `<base>/<build>`); `source: "cdn"` fetches the current version of `CONTENT_BASE_URL`. 400 `invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id`, `no-content-base`; 413 `body-too-large` (`EDITOR_MAX_BYTES`); 502 `content-fetch-failed` |
| `GET /editor/books/{id}` | | `{ book, spreads: [{ …SpreadData, entries: [{ id, category, title, page, target }] }], unassigned }` – the tree; `target` = the entry's TargetData (id, imageSrc, entity inline or `{ ref }`) or null; `unassigned` = entries whose page is in no spread |
| `GET /editor/books/{id}/entities` | | `{ entities: { ref: EntityData } }` – the shared entities |
| `PUT /editor/books/{id}/entities/{ref}` | `EntityData` | `{ ref, entity }` – saves (or adds) a shared entity; records a change. 400 `invalid-entity`: no object, `type` not one of the contract's entity types, no `assets` list |
| `PUT /editor/books/{id}/targets/{targetId}` | `{ entity }` or `{ ref }` | `{ target }` – the target's entity: inline (`entity`, null removes it) or a shared one (`ref`, 400 `unknown-entity` when there is none); records a change. 404 for an unknown target |
| `GET /editor/books/{id}/draft/latest.json` · `…/draft/{build}/game.config.json` · `…/draft/{build}/files.json` | | the draft as a content version, assembled from the rows on every call (`Cache-Control: no-store`); the engine's loader reads it like the CDN with the token in its `fetchFn`. The build in the path is not checked against the current draft – an edit between the two requests is no error |
| `POST /editor/books/{id}/publish` | `{ env, note?, replace? }` | `{ env, build, hash, publishedAt, replaced }` – writes the assembled version to the content store of `env` (`local`, `staging`, `production`): `<env>/<build>/game.config.json` and `files.json` (unless that build is there already – a version folder is never overwritten), then `versions.json` (the previous current version retired), then `latest.json` (both name the book); a row in the publish log. An environment serves one book: when it serves another (or one that cannot be told) the publish needs `replace: true`, else 409 `other-book` with `current` `{ env, book, title, build, since }`; `replaced` `{ book, build }` names the book replaced, null when none. 400 `invalid-env`, `invalid-replace`; 502 `content-store-failed` |
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

## Roles

After SCUTOONS' roles (`scutoons/agents/ITEMS.md` "Roles", `Domain\Roles\Roles`) so the two can be unified in the
white-label core (`agents/STRATEGY.md`): the tables **`roles`** (`id`, `name`, `description` – fixed ids, seeded by the
schema) and **`user_roles`** (`user_id`, `role_id`, `granted_at` UTC, `granted_by`). `Roles.php` grants, revokes and
checks; `Roles::require($user, $role)` is the route guard (401 without a session from `Auth::user()`, 403 `forbidden`
`{ role }` without the role) – SCUTOONS' `RequireRole` middleware as a static call.

| role | id | who | grants |
|---|---|---|---|
| `reader` | 1 | every account (SCUTOONS' `member`) | at sign-up (`granted_by` `signup`); the schema's backfill for existing users (`migration`) |
| `editor` | 2 | may use `/editor` and `/api/editor/*` | the admin page, `POST /admin/editors`, or the config list `EDITORS` at sign-in (`config`) |
| `admin` | 3 | may use `/editor/admin` and `/api/admin/*` | the admin page, or the config list `ADMINS` at sign-in (`config`) – the instance's first admin |

`granted_by` is `signup`, `migration`, `config`, `secret` (a grant with `X-Admin-Secret`) or the granting admin's
user id (the admin API resolves it to the address). `reader` cannot be revoked (400 `invalid-role`); the last admin
keeps the role (409 `last-admin`). `GET /user` answers `roles: ["reader", …]`; the older field `role` stays and is
`editor` when the roles hold it, else `reader`. The column `users.role` mirrors the editor role for that field and
the backfill – checks go through the tables.

**Differences to SCUTOONS**, kept to what OSCT needs: the role names (`reader` / `editor` / `admin` for `member` /
`creator` / `admin`; no `developer` – migrations run from the deploy), no `/me` object (the user is `GET /user`, the
roles a field of it), no CLI (`php scripts/roles.php`) – the admin page and the secret cover it; `granted_by` holds the
admin's user id, not `admin:<email>`; `editor` does not include `admin` (SCUTOONS' `CONTENT_EDITORS` lets admins
edit content – here an admin who edits is also made an editor); the admin API answers `{ changed, user }` without
SCUTOONS' `status: "success"` envelope and has no paging (a search, up to 200 rows). The config lists `EDITORS` /
`ADMINS` have no SCUTOONS counterpart (their first admin was made with a CLI).

## Admin API

The endpoints under `/admin/*` need a **signed-in admin** (Bearer token, the role `admin`) **or** the admin secret
in `X-Admin-Secret` – the break-glass path for the deploy and the shell (`Admin::actor()`). Neither → 401; a wrong
secret or a session without the role → 403 `forbidden`. `POST /admin/migrate` takes the secret only. The admin page
([admin](admin.md)) is their UI.

| | | |
|---|---|---|
| `GET /admin/roles` | | `{ roles: [{ id, name, description }] }` |
| `GET /admin/users?q=&role=&newsletter=1&limit=` | | `{ users: [{ …user, id, grants: [{ role, grantedAt, grantedBy, grantedByEmail }], lastSeenAt }], total }` – newest first, 50 (at most 200); `q` = a part of the e-mail address, `role` = only users with that role, `newsletter=1` = only users with an update option on. `user` is the shape of `GET /user` (email, language, options, hasPassword, roles, createdAt) |
| `GET /admin/users.csv?newsletter=1&option=` | | the same users as CSV (`email, language, bookUpdates, artistUpdates, publisherUpdates, createdAt`), `Content-Disposition: attachment` – the newsletter list for the mailing tool; `option=bookUpdates` narrows to one option |
| `PUT /admin/users/{id}/roles/{role}` | | `{ changed, user }` – grants the role (`changed: false` when the user had it); 404 `not-found` / `unknown-role`, 400 `invalid-role` for `reader` |
| `DELETE /admin/users/{id}/roles/{role}` | | `{ changed, user }` – revokes it; 409 `last-admin` when the last admin would go |
| `POST /admin/editors` | `{ email }` | `{ user, created, changed }` – gives the user the role `editor`, creating the user (confirmed, `en`, no options) when the address is new |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` only | `{ statements }` – creates missing tables and columns (the container does this at every start) |

## Configuration

`src/Config.php` lists every key and its default. An environment variable `OSCT_<KEY>` wins, then
`server/api/config.local.php`. Mail sending is set with `MAIL_TRANSPORT`:
- `log` writes mails to a file (development).
- `mail` uses PHP `mail()` (testing).
- `smtp` sends through the `SMTP_*` account (production). It uses its own small client, so no library is needed.

The roles' keys ([Roles](#roles)): `EDITORS` and `ADMINS` – comma-separated e-mail addresses that get the role `editor` /
`admin` when they sign in (the GitHub environment variables of the same names, written into the config by the deploys).

The editor's keys:
- `EDITOR_MAX_BYTES` (8 MB): the largest request body of the editor endpoints – the import of a game configuration.
- `LOGIN_MAX_PER_EMAIL_HOUR` (5), `LOGIN_MAX_PER_IP_HOUR` (30): sign-in emails per hour; over the limit
  `POST /auth/request` answers 429 `too-many-requests` with `retryAfter` (seconds until the window opens again, also
  the `Retry-After` header) and the minutes in its message – the reader and the editor show them. **A limit of -1 is
  no limit** (`Config::limit`; 0 allows nothing), for local testing (`config.local.php.example`) – the same for
  `LOGIN_MAX_ATTEMPTS` (5 wrong codes) and `PASSWORD_MAX_FAILS_PER_EMAIL_HOUR` / `PASSWORD_MAX_FAILS_PER_IP_HOUR`
  (10 / 30). Tilman: "-1 ist besser als Limit für aus" (#83).
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
database, under `/api/editor/*`. A user needs the role `editor` ([Roles](#roles)): an admin grants it on the admin page
([admin](admin.md)), `POST /admin/editors { email }` with the `X-Admin-Secret` gives it from the shell – `curl -X POST
-H "X-Admin-Secret: $OSCT_SECRET" -H "Content-Type: application/json" -d '{"email":"…"}' https://…/api/admin/editors`
– or the setting `EDITORS` gives it when a listed address signs in, the instance's first editors. The editor itself
signs in like the reader (email code) and checks `GET /user` for `editor` in `roles`.

**Tables** (both schema files, additive): `books` (the book row: `BookData` as `book_json`, the tutorial, the initial
spread, the imported `files.json`, the content schema, the imported hash, `assets_base`), `spreads`, `entries`,
`targets`, `entities` (keys `(book_id, id)` / `(book_id, ref)`, deleted with the book), `book_versions` (the publish
log), `changes` (the change log) and `plugins` (the Code tab's sources, below). Every content row keeps the object exactly as it was imported in its
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
its next start and `osct content purge` understands what the editor wrote. `latest.json` and the `versions.json` entry
name the book (`book`), so the API can tell which book an environment serves (`ContentStore::live`); a manifest
written before that is read through its version's `game.config.json` (`book.id`). Publishing over another book needs
`replace: true` ([editor](editor.md) "One book per environment").

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
size, sha256, width / height, `duration_ms`, the current version's path and URL) and `asset_versions` (one per upload). The same
bytes uploaded twice are one asset.

An upload or a replace reads the file's own numbers: an image's width and height (its header), a video's width, height
and duration (`VideoInfo.php`, plain PHP, no ffmpeg): mp4 / mov from `moov › mvhd` (duration, timescale) and the video
track's `trak › tkhd` (its size, turned when the track's matrix turns it a quarter – a phone's portrait video), webm / mkv
from the EBML `Segment › Info` (`Duration`, `TimecodeScale`) and `Tracks › the video TrackEntry › Video` (`PixelWidth`,
`PixelHeight`). Only the headers are read; a file that does not tell answers `null`, never an error. Rows uploaded before
the column existed stay `null` until their file is replaced.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/books/{id}/assets[?kind=]` | | `{ assets: [{ id, name, kind, mime, size, width, height, durationMs, version, url, usages, imported, createdAt, updatedAt }] }` – `width` / `height` in pixels (images, videos), `durationMs` (videos), null when unknown; `usages` = rows of the book naming the URL; the uploads first, then the files of the import's `files.json` (`imported: true`, id `import-<hash>`, read-only: no replace, usages or delete; `url` below the assets base, `usages` counted with the content path `/assets/content/…` the rows name) |
| `POST /editor/books/{id}/assets` | the file; `X-File-Name: name.ext` | 201 `{ asset }`, or 200 with the asset that already holds these bytes. 400 `invalid-file` (no name, unsupported type, empty), 413 `body-too-large` |
| `PUT /editor/books/{id}/assets/{aid}/file` | the file (`X-File-Name` optional, the kind must stay) | `{ asset, relinked }` – a new version at a new path (`v2.ext`: nothing to purge on a CDN); every target, entity and entry naming the old URL now names the new one, and the book's environment (`worldSrc`, `skySrc`) (a change each) |
| `GET /editor/books/{id}/assets/{aid}/usages` | | `{ usages: [{ kind: environment | target | entity | entry, ref }], asset }` (`environment`: the book's world model or sky, `ref` = the book; `asset` as the list has it) |
| `DELETE /editor/books/{id}/assets/{aid}[?force=1]` | | 204; 409 `asset-in-use` with `usages` unless forced (the files of every version go) |

Renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build (PLAN 2b).

## Plugin sources

The editor's **Code** tab ([editor](editor.md)) keeps the TypeScript of a book's plugins in the `plugins` table
(`Plugins.php`): one row per plugin id (`book_id`, `id`, `source`, who, when), at most 256 KB each, every save a
change (`kind: plugin`, the source before and after). They are the editor's sandbox: the editor transpiles and runs
them on its own stage, and nothing of them reaches a publish. The compiled plugins a book has come in with the
import – the configuration's `plugins` list (content schema 2.4: `{ id, src, api }`, written by the content build
only) is kept in `books.plugins_json` and assembled back after `tutorial`, its `src` below the assets base like
every other content path. A publish whose nodes use a component type that is neither built in
(`Editor::COMPONENT_TYPES`) nor possibly a declared plugin's (no `plugins` at all) answers 409 `unknown-components`
with the types – the reader would refuse such content as a whole.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/books/{id}/plugins` | | `{ plugins: [{ id, size, updatedAt, updatedBy }] }` |
| `GET /editor/books/{id}/plugins/{pid}` | | `{ plugin: { id, source, size, updatedAt, updatedBy } }`; 404 |
| `PUT /editor/books/{id}/plugins/{pid}` | `{ source }` | `{ plugin }` – new or changed; 400 `invalid-plugin` (the id is 1–40 lower-case letters, digits or `-`; the source a string), 413 above 256 KB |
| `DELETE /editor/books/{id}/plugins/{pid}` | | 204 |

### Targets and entries made in the editor

`PUT /editor/books/{id}/targets/{tid}` also takes `{ imageSrc }` (the printed image – an asset's URL) and
`{ print }` (`PrintPlacement`, content schema 2.1: `surface` left / right, `x`, `y`, `width` in mm from the surface's
top left corner, optional `height` and `page`) – the editor's stage lays the target there; `null` removes it. 400
`invalid-target`. `POST /editor/books/{id}/entries` `{ title, page, category?, body?, target: { id?, imageSrc, print?,
entity? } }` → 201 `{ entry, spreadId }` makes an entry (id from title and page, `p102-shadows`, or the given one;
409 `duplicate-id`) with its target on the spread its page belongs to; `DELETE /editor/books/{id}/entries/{eid}` →
204 removes entry and target (changes recorded). The reader tracks such a target after a publish: the 8th Wall
engine makes the image-target data from `imageSrc` at runtime (`engine/src/scene/xr8.ts`).

### Spreads made in the editor

A spread's pages decide which entries are on it: an entry belongs to the first spread whose `firstPage`–`lastPage`
include its `page` (the `spread_id` column records it), and a target's optional `print.page` names its page. Adding
or removing a double page therefore **renumbers the pages after it** – every spread starting later, every entry on a
later page and every later `print.page` move by the same amount, data and typed columns alike, so each entry keeps
its spread and the contract stays as the content build writes it. Every moved row is a change in the log.

| Endpoint | Body | Answer |
|---|---|---|
| `POST /editor/books/{id}/spreads` | `{ format: "spread", after?, id?, title? }` | 201 `{ spread, moved: { spreads, entries, targets } }` – a double page right after the spread `after` (default: the last one before the back cover; a book without one starts on page 1). Its pages are the two after that spread's `lastPage`, its position the next; every later page is numbered on by two. `id` defaults to the first free `spread-<n>`, `title` to *New spread*. 400 `unknown-spread` (no such `after`), `invalid-spread` (after the back cover, an unknown format), `invalid-id`; 409 `duplicate-id` |
| `POST /editor/books/{id}/spreads` | `{ format: "cover" \| "back", title? }` | 201 `{ spread, moved }` – the front cover (page 0, first) or the back cover (the page after the last, last); nothing moves. 400 `invalid-spread` with an `after`; 409 `duplicate-id` when the book has one |
| `PUT /editor/books/{id}/spreads/{sid}` | `{ title?, format?, passes? }` | `{ spread }` – title, format (`cover` only on page 0) and post-processing; the pages stay |
| `DELETE /editor/books/{id}/spreads/{sid}` | | 204 – the spread goes; a double page's later pages are numbered back by its pages (the reverse of adding it), a cover moves nothing. 409 `initial-spread` for the spread the book opens on; 409 `spread-not-empty` with `entries` (their ids) while entries are on it – they are deleted one by one, never with their spread; 404 |

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `LOG_PATH` – locally
`server/api/db/error.log` (`db/` is never served over HTTP), in the container `/dev/stderr` = `kamal app logs`. Readers
only see "Something went wrong".

## Local development

**Against MariaDB – the recommended setup.** Staging and production run MariaDB / MySQL, and some queries that SQLite
accepts fail there (#161: a named parameter used twice; `LIKE … ESCAPE` with a backslash, which opens an escape inside
a MySQL string literal – `Db::contains` builds the pattern with `!`). `docker-compose.yml` in the repository root runs
MariaDB 10.11, the version of staging's host (`OSCT_MARIADB_VERSION=11.4` for the version of the Kamal accessory in
`config/deploy.yml`). Its first start creates the database `osct` from `schema.mysql.sql`; the data stays in the
Docker volume `osct_db` until `docker compose down -v`.

```bash
docker compose up -d --wait db                                        # MariaDB on 127.0.0.1:3306
cp server/api/config.local.php.example server/api/config.local.php   # its DB_* are the compose database; set SECRET, MAIL_TRANSPORT=log
cd client && npm run dev:api     # PHP on 127.0.0.1:8080
cd client && npm run dev         # vite passes /api on to it
```

The compose database: host `127.0.0.1` (TCP – `localhost` would make PDO look for a socket), port `3306`
(`OSCT_DB_PORT` moves it, for the compose file and the API alike), database `osct`, user `osct`, password `osct`, root
password `osct-root`. These are for this machine only; the port listens on 127.0.0.1. A schema change in a checkout
reaches an existing database with `php server/deploy/migrate.php` (or `POST /admin/migrate`), as on a deploy.

**SQLite for quick tests** – nothing to install: set `DB_SQLITE_PATH` instead (the file is created with the schema on
first use and wins over `DB_*`).

The mails (with link and code) land in `MAIL_LOG_PATH`.

### Tests

```bash
php server/tests/api-test.php                       # SQLite (temporary files)
OSCT_TEST_DB=mysql php server/tests/api-test.php    # MariaDB of docker-compose.yml
```

With `OSCT_TEST_DB=mysql` every API the test starts gets a new database `osct_test_<random>_<name>`, made from
`schema.mysql.sql` (the older-database case from a cut copy of it), and the test drops them at the end. It signs in
with `OSCT_TEST_DB_HOST` (`127.0.0.1`), `OSCT_TEST_DB_PORT` (`3306`), `OSCT_TEST_DB_USER` (`root`) and
`OSCT_TEST_DB_PASS` (`osct-root`) – an account that may create and drop databases, never staging's. CI runs both:
"Accounts API" on SQLite, "Accounts API (MariaDB)" against a `mariadb:10.11` service container
(`.github/workflows/checks.yml`). Both also scan the API's source for the two MySQL traps above.

### Staging's data

`scripts/db/pull-staging.sh` (bash; Git Bash on Windows) dumps staging's database and loads it as the local database
`osct` – the local one is **replaced**. Staging's credentials go into `server/.env` (git-ignored, RULES #25) or the
environment, never into a committed file:

```bash
STAGING_DB_HOST=…        # the database host as seen from where the dump runs
STAGING_DB_PORT=3306
STAGING_DB_NAME=…
STAGING_DB_USER=…        # read access is enough (SELECT, SHOW VIEW, LOCK TABLES)
STAGING_DB_PASS=…
STAGING_SSH=user@host    # optional: run the dump on that host over SSH, for a database that only accepts its own machine
STAGING_DUMP_COMMAND=…   # optional, with STAGING_SSH: the dump program there (mysqldump)
KEEP_EMAILS=you@example.com   # optional: addresses that stay as they are (to sign in as yourself)
```

Without `STAGING_SSH` the dump runs in the local MariaDB container (its `mariadb-dump`, no client to install), so
staging's database must accept connections from this machine. Once staging runs on the Kamal VM, its database is the
accessory container `osct-staging-db`: `STAGING_SSH=<the server>`, `STAGING_DB_HOST=127.0.0.1` and
`STAGING_DUMP_COMMAND="docker exec -i -e MYSQL_PWD osct-staging-db mariadb-dump"`. After the load the script
migrates the database to this checkout's schema. `--keep` keeps the dump, `--load FILE` loads a kept one again,
`--real` skips the pseudonymisation; `--help` lists it all.

**Personal data.** Staging holds real readers: e-mail addresses, password hashes, sign-in requests and sessions
(token and IP hashes), reading progress. So the script, unless `--real`:
- replaces every address by `user-<id>@example.invalid` and removes its password – except `KEEP_EMAILS`;
- deletes the sessions, the sign-in requests and the failed sign-ins;
- keeps ids, roles, update options, progress and the editor's rows, so the data behaves like staging's;
- deletes the dump once it is loaded. A dump kept with `--keep` lands in `server/db-dumps/` (git-ignored, outside the
  Docker build context, readable by you only) with the real data – delete it when you are done.

Never commit a dump, attach it to an issue or send it anywhere; `--real` only to debug one account, and pull again
without it afterwards. The local MariaDB is reachable from this machine only (127.0.0.1); `docker compose down -v`
removes it with its data.

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
