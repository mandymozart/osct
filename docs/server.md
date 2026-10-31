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
  src/                    Version, Config, Db, Http, Auth, ApiTokens (AI connections), Passwords, Users, Progress, Mailer, Smtp, LoginMail (mail texts en/fr/nl/de);
                          Roles (reader / editor / admin, the tables roles + user_roles), Admin (the admin endpoints, who may call them);
                          the editor: Editor (access, checks), Books (import, tree, entities, targets, publish, logs),
                          ContentVersion (rows → a content version), ContentStore (local directory / bunny.net storage),
                          Confirmation (the second step of an import or a removal), Removal (what a removal takes),
                          Assets (the Library's files), VideoInfo (a video's size and length), Plugins (the Code tab's sources);
                          Paths (where the content store and var/ are, the move out of db/)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS, later columns as ALTER TABLE … ADD COLUMN – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests – db/ holds the schema only
content-store/                   (repository root, not committed) the content store: published content and the Library's
                                 uploads where this server is the backend – [Content store and var](#content-store-and-var)
var/                             (repository root, not committed) db/ (the SQLite file), log/error.log, mail/mail.log
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
| `POST /auth/verify` | `{ token }` or `{ requestId, code }`, `session?` | `{ session, user, created }` – with `"session": "cookie"` (a browser) `{ csrfToken, user, created }` and the session cookie instead ([Sessions](#sessions-cookies-and-csrf)) |
| `POST /auth/password` | `{ email, password, session? }` | `{ session, user, created: false }` – a browser the same as above; 401 `invalid-credentials` (also for unknown addresses and users without a password) |
| `POST /auth/logout` | | 204 – this device only; a cookie session needs its CSRF token like any write, and the cookie is cleared |
| `POST /auth/cookie` | Bearer: a session token | **temporary** (#207): `{ user, csrfToken }` and the cookie – a token a browser kept before the cookie, exchanged once ([Sessions](#sessions-cookies-and-csrf)) |
| `GET /user` | | `{ user }` – `{ email, language, options, hasPassword, roles, role, createdAt }`; `roles` holds `reader` for everyone, `editor`, `admin` ([Roles](#roles)); with the cookie also `csrfToken` |
| `PATCH /user` | `{ options?, language? }` | `{ user }` – the person's own sign-in only (an AI connection's token: 403 `not-for-ai`) |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `PUT /user/password` | `{ password, currentPassword? }` | `{ user }` – sets or changes the password (`user.hasPassword`) |
| `/user/tokens` | | the [AI connections](#ai-connections)' tokens |
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, env, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10); `env` = the instance's environment (`ENV`, [Configuration](#configuration)) |
| `/admin/*` | | the [Admin API](#admin-api): roles, users, the newsletter CSV, migrate |

The editor's endpoints ([Editor data](#editor-data)) need a signed-in user with the role `editor` ([Roles](#roles)) – 401
without a token, 403 `forbidden` for a reader. `{id}` is the book, ids and refs are `[A-Za-z0-9_-]{1,64}`:

| | | |
|---|---|---|
| `GET /editor/books` | | `{ books: [{ id, title, author, book, initialSpreadId, schema, assetsBase, importedHash, spreads, createdAt, updatedAt, lastPublish, live }], environments }` – `lastPublish` `{ env, build, at }` or null; `live` = the environments serving the book `[{ env, build, since }]` (empty: draft only, the tree's `book` has it too); `environments` = what each environment serves `[{ env, book, build, since }]` (`book` null when it cannot be told), `{ env, error }` when its store cannot be read – only environments that serve something |
| `GET /editor/environments` | | `{ env, environments: [{ env, store, publish, url, warning }] }` – this instance's environment (`ENV`, the only one it publishes to) first, then `staging` and `production` (`local` only where `ENV` is local); `store` = `cdn` (the storage zone) or `server` (the directory store this API serves); `publish` true for the own one only; `url` = where readers load it; `warning` = the line the editor shows wherever the directory store is the publish target, else null – [One environment per instance](#one-environment-per-instance) |
| `POST /editor/import/preview` | `{ configuration, files?, assetsBase? }` or `{ source: "cdn" }` (the import's body) | `{ source, contentBase, manifest, incoming, counts, existing }` – what that import would bring in, **nothing imported** ([Import preview](#import-preview)). The import's access (AI connections too); 400 as the import (`invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id` – also for a configuration without `book.id` or with one that is no id, `no-content-base`); it answers for the configuration's own `book.id`, the id the import is then called with; 413 `body-too-large`; 502 `content-fetch-failed` with the failing `url` |
| `POST /editor/books/{id}/import` | `{ configuration, files?, assetsBase?, confirm? }` or `{ source: "cdn", confirm? }` | `{ book, counts, draft: { build, hash }, imported }` – replaces the book's rows from a game configuration (one transaction; the logs stay). `files` = its `files.json`, `assetsBase` = where its `/assets/content/…` paths resolve (the CDN's `<base>/<build>`); `source: "cdn"` fetches the current version of `CONTENT_BASE_URL`; `imported` = what the draft is now based on. **Over a book that exists, two steps** ([Import with a version comparison](#import-with-a-version-comparison)): without `confirm` 409 `confirm-import` with `comparison` and `confirmation` `{ id, expiresAt }`, nothing written; with `confirm` the import; a confirmation that is expired, someone else's or outdated 409 `confirmation-void` (a new comparison with it). The configuration's `book.id` must be `{id}` (the rows go under `{id}`, the configuration keeps its `book`, and a publish names both): another id is 400 `invalid-configuration` naming both (#204). 400 `invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id`, `no-content-base`; 413 `body-too-large` (`EDITOR_MAX_BYTES`); 502 `content-fetch-failed` (with the failing `url`) |
| `GET /editor/books/{id}` | | `{ book, spreads: [{ …SpreadData, entries: [{ id, category, title, page, target }] }], unassigned }` – the tree; `target` = the entry's TargetData (id, imageSrc, entity inline or `{ ref }`) or null; `unassigned` = entries whose page is in no spread |
| `GET /editor/books/{id}/entities` | | `{ entities: { ref: EntityData } }` – the shared entities |
| `PUT /editor/books/{id}/entities/{ref}` | `EntityData` | `{ ref, entity }` – saves (or adds) a shared entity; records a change. 400 `invalid-entity`: no object, `type` not one of the contract's entity types (nor a plugin's, in a book with plugins – "Plugin sources"), no `assets` list |
| `PUT /editor/books/{id}/targets/{targetId}` | `{ entity }` or `{ ref }` | `{ target }` – the target's entity: inline (`entity`, null removes it) or a shared one (`ref`, 400 `unknown-entity` when there is none); records a change. 404 for an unknown target |
| `GET /editor/books/{id}/draft/latest.json` · `…/draft/{build}/game.config.json` · `…/draft/{build}/files.json` | | the draft as a content version, assembled from the rows on every call (`Cache-Control: no-store`); the engine's loader reads it like the CDN, its `fetchFn` sending the session cookie. The build in the path is not checked against the current draft – an edit between the two requests is no error |
| `POST /editor/books/{id}/publish` | `{ env, note?, replace? }` | `{ env, store, build, hash, publishedAt, replaced }` – writes the assembled version to the content store of `env`, which must be this instance's own environment (`ENV`; another one: **403 `other-environment`** with `env`, the own one): `<env>/<build>/game.config.json` and `files.json` (unless that build is there already – a version folder is never overwritten), then `versions.json` (the previous current version retired), then `latest.json` (both name the book); a row in the publish log. An environment serves one book: when it serves another (or one that cannot be told) the publish needs `replace: true`, else 409 `other-book` with `current` `{ env, book, title, build, since }`; `replaced` `{ book, build }` names the book replaced, null when none; `store` = where it went (`cdn` or `server`). 400 `invalid-env` (no environment name), `invalid-replace`; 502 `content-store-failed` |
| `GET /editor/books/{id}/versions` | | `{ versions: [{ id, env, build, hash, publishedBy, publishedAt, note }] }` – the publish log, newest first |
| `GET /editor/books/{id}/changes?limit=` | | `{ changes: [{ id, kind, ref, before, after, user, token, createdAt }] }` – newest first; `kind` `entity` (ref = the entity) or `target` (ref = the target id, before/after = the whole target) – and `entry`, `spread`, `environment`, `passes`, `plugin`, `asset` (a Library file a removal deleted); a removed row has `after: null`; `token` = the name of the AI connection a save came through, null for the editor; `limit` default 50, at most 500 |
| `GET /content/{env}/{path}` | | the **local** content store, public like the CDN: `latest.json`, `versions.json` (`no-cache`) and `<build>/game.config.json` / `files.json` (immutable) – nothing else, no other path |

Signed-in calls from a browser send the session cookie and, with every write, its CSRF token; other clients send
`Authorization: Bearer <session>` – or an AI connection's token `osct_…` ([AI connections](#ai-connections)) –
[Sessions, cookies and CSRF](#sessions-cookies-and-csrf). Errors: `{ "error": { "code", "message" } }`. The app
translates the codes (`account:errors.*`).

### Sessions, cookies and CSRF

Tilman, 2026-10-30 (#207): the browser's session is an **HttpOnly cookie** with a CSRF token, so no script on the page –
a book's plugin in the editor, anything injected – can read the session and carry it off. `Auth.php` holds it all.

- **Browser and non-browser sign-ins.** A sign-in (`POST /auth/verify`, `POST /auth/password`) with
  `"session": "cookie"` in its body is a browser's: the API sets the cookie and answers `csrfToken` – the session token
  is in no answer. The reader and the editor always send it. Without it the answer carries the token as `session`, for
  `Authorization: Bearer` – the MCP server's `sign_in_verify`, scripts, and reader apps from before #207 still cached
  on a phone. The field is explicit rather than guessed from browser headers so those older apps keep working.
- **The cookie** `osct_session`: `HttpOnly`; `SameSite=Strict`; `Path=/api` (the API's base – the app's pages never
  send it); `Secure` on every instance but a local one reached over plain http (`ENV=local` without https); `Max-Age`
  = the session's lifetime (`SESSION_TTL_DAYS`), renewed whenever the session's `last_used_at` is (at most hourly). The
  value is the session token (stored as a hash, like before). Strict, not Lax: everything that needs the session is a
  `fetch` from the site's own pages – the sign-in mail's link opens the reader, which then confirms with a `fetch` – so no
  flow needs the cookie on a navigation from another site.
- **One cookie for the site.** The reader at `/` and the editor at `/editor/` share it – one sign-in per browser:
  signing in or out in one does the same in the other. Separate cookies would isolate nothing (the pages share an
  origin, and a script there could use either) and would need a client marker on every request. A browser that signs in
  again ends the session its cookie held before.
- **CSRF.** Every write (POST, PUT, PATCH, DELETE) that signs in by cookie needs `X-CSRF-Token`: an HMAC of the
  session's id with `SECRET` (`Auth::csrfToken`) – bound to the session, nothing stored. The API hands it out in the
  sign-in's answer, the exchange's and `GET /user`'s; the reader and the editor keep it in memory only (never in
  storage) and send it. Missing or wrong: **403 `csrf`**. A browser that names the request's site (`Sec-Fetch-Site`)
  must name it `same-origin`, else 403 `csrf` too – SameSite counts a sibling subdomain as the same site. Reads need
  no token. A client refused 403 `csrf` reads the token again from `GET /user` and sends the write once more (the
  cookie may have been replaced by a sign-in in the other app).
- **Bearer stays for everything else.** An `Authorization: Bearer` header wins over the cookie and needs no CSRF token
  (no browser sends it by itself). **AI connections' tokens (`osct_…`) are Bearer only**: the cookie is looked up among
  the sessions only, so an AI token sent as a cookie is no session (401); `POST /auth/cookie` refuses one (403
  `not-for-ai`); and `Auth::session()` – the person's own account actions (RULES #33) – still refuses them.
- **Logout** (`POST /auth/logout`) by cookie ends the session and clears the cookie (`Max-Age=0` on the same path); it
  takes the CSRF token like any write. A cookie whose session is gone (expired, signed out elsewhere) is cleared by the
  401 that answers it.
- **The exchange – temporary.** A browser signed in before #207 kept a session token in `localStorage` (the editor:
  `osct-editor-session`, the reader: `session` in `osct-user`). Its first start after the update sends it once to
  `POST /auth/cookie` as Bearer: the API keeps the session row (its sign-in method and time – the password-change rule
  reads them), gives it a new token, sets that as the cookie and answers `{ user, csrfToken }`; the old token stops
  working at once. The client then deletes the stored token; a refused one (401) means signing in as usual; unreachable,
  it waits for the next start. The endpoint goes once those browsers have had their chance (MEMORY open item).
- **What the cookie does not do – and the editor's sandbox does.** The cookie stops the session from being **read and
  carried off**. It does not, by itself, separate code that runs on the site's own pages from the session: such code is
  in the same origin and could make requests that go with the cookie while the page is open – and read the CSRF token
  from `GET /user` like the app does.
  - **The editor** (#234, Tilman 2026-10-31: *"Make editors safe, please. Sandbox."*): book plugins – the draft's and the
    Code tab's Run – run only in the **stage frame**, an iframe sandboxed without `allow-same-origin`
    ([editor](editor.md) "The stage frame"). Its origin is opaque, so for plugin code `document.cookie` and
    `localStorage` throw, the page is another origin, a request to the API is a cross-site request without the
    `SameSite=Strict` cookie (and CORS sends this API no credentials anyway), and the frame's Content Security Policy
    lets it reach the content and the Library's files (`/api/content/…`, public) but no other path of the API. The CSRF
    token never leaves the page; nothing the frame sends makes the page call the API. RULES #35.
  - **The reader** is not sandboxed (Tilman, 2026-10-29: the review before a release is the protection): a published
    book's plugins run in the reader's page, with the reader's session – and since the cookie is one for the site, with
    the session of an editor or admin who opens the reader in the same browser. A published plugin is compiled by the content build from a source an editor stored and reaches readers only
    through a person's publish, but it is code of the same kind. The reader's scene in a frame needs the camera
    delegated into it, the 8th Wall engine's files served for an opaque origin and the service worker's offline content
    (which does not reach a sandboxed frame) – an open decision (`agents/MEMORY.md` 2026-10-31); serving the editor and
    its API from an origin of their own would also keep an editor's cookie out of the reader's pages.
- **Same origin only.** The cookie sessions need the app and `/api` on the same origin (staging and production
  serve them so; locally the dev servers proxy `/api`). CORS (`ALLOWED_ORIGINS`) sends no credentials: another origin
  can call the API with a Bearer token only.

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
keeps the role (409 `last-admin` – the check and the revoke are one transaction with the admins' grants locked, so two
admins revoking each other at the same moment cannot both pass). A grant and its `users.role` mirror are one
transaction; a grant that a parallel one wrote first answers `changed: false`, never a 500. `POST /admin/editors`
makes the user and its roles in one transaction. `GET /user` answers `roles: ["reader", …]`; the older field `role` stays and is
`editor` when the roles hold it, else `reader`. The column `users.role` mirrors the editor role for that field and
the backfill – checks go through the tables.

**Differences to SCUTOONS**, kept to what OSCT needs: the role names (`reader` / `editor` / `admin` for `member` /
`creator` / `admin`; no `developer` – migrations run from the deploy), no `/me` object (the user is `GET /user`, the
roles a field of it), no CLI (`php scripts/roles.php`) – the admin page and the secret cover it; `granted_by` holds the
admin's user id, not `admin:<email>`; `editor` does not include `admin` (SCUTOONS' `CONTENT_EDITORS` lets admins
edit content – here an admin who edits is also made an editor); the admin API answers `{ changed, user }` without
SCUTOONS' `status: "success"` envelope and has no paging (a search, up to 200 rows). The config lists `EDITORS` /
`ADMINS` have no SCUTOONS counterpart (their first admin was made with a CLI).

## AI connections

Personal access tokens for the [MCP server](mcp.md) (`ApiTokens.php`, after SCUTOONS' `api_tokens` –
`scutoons/agents/MCP.md` §3): an editor or admin makes one on the editor's books page ([editor](editor.md#ai-connections))
with the browser session they have, and hands it to an AI agent (any MCP client) as `OSCT_EDITOR_TOKEN` – no sign-in mail involved.
`Authorization: Bearer osct_…` is that user with their **current** roles: every role check decides as for a session.

- Table `api_tokens` (both schema files): `id`, `user_id`, `name`, `token_hash` (SHA-256, like sessions), `token_prefix`
  (its first 9 characters, for the list), `created_at`, `last_used_at` (written at most once a minute), `expires_at`,
  `revoked_at`. The prefix `osct_` tells a token from a session (sessions have none). The token itself is answered once.
- A token expires **182 days** after it was made or renewed; renewing moves the same token on. Revoked or expired: 401
  `token-revoked` / `token-expired`; an account that has neither the editor nor the admin role any more: 401
  `no-editor-role`.
- **What a token never does – 403 `not-for-ai`:** make, list, renew or revoke tokens, and **change the account** in
  any way – the update options (the person's consent), the language (`PATCH /user`), the password
  (`PUT /user/password`), the deletion (`DELETE /user`) – those take the person's own session (`Auth::session()`;
  consent and update options are user-centric data that no admin route writes either, `agents/RULES.md` #33) – and **publish**, to any environment (`Auth::refuseToken()` in `Books::publish`): readers are
  reached only by a person. Reading and saving drafts, assets and plugin sources – uploading shaders and script files
  included – work as for the person; removing a
  spread or an entry too, but only in the two steps of a [confirmation](#confirmations) – the impact first, then the
  same request with its id.
- A save through a token records the token's name in the change log (`changes.token_name`, the `token` of
  `GET …/changes`), so the log tells which AI made it. `GET /user` with a token answers `token` beside `user` (the list
  shape below) – the MCP server's `whoami` shows it.

| | | |
|---|---|---|
| `GET /user/tokens` | | `{ tokens: [{ id, name, prefix, createdAt, lastUsedAt, expiresAt, expired }] }` – the person's tokens that are not revoked, newest first; `prefix` = `osct_AbCd…` |
| `POST /user/tokens` | `{ name }` | 201 `{ token, apiToken }` – `token` (`osct_…`) only in this answer; always for the signed-in person (nothing in the body names another user); 403 `forbidden` without the editor or admin role, 400 `invalid-name` (1–80 characters) |
| `POST /user/tokens/{id}/renew` | | `{ apiToken }` – expires 182 days from now; 404 for another user's or a revoked token |
| `DELETE /user/tokens/{id}` | | 204 – revoked at once (the row stays for the record); 404 for another user's token |

The rule: `agents/RULES.md` #32 (the MCP server is a client of the API; readers are reached only by a person).

## Admin API

The endpoints under `/admin/*` need a **signed-in admin** (a session, never an AI connection's token – 403 `not-for-ai`; the role `admin`) **or** the admin secret
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

`ENV` (`local`): which environment this instance is – `staging` and `production` in their Kamal destinations
(`config/deploy.<destination>.yml`). `GET /health` names it; the editor publishes to it and to no other environment
([One environment per instance](#one-environment-per-instance)); the editor's guide to connect an AI agent names the MCP
server after it (`osct-staging`, [mcp](mcp.md#connecting-an-agent)). An environment name – a letter first, then lower-case
letters, digits and hyphens, at most 32 (`ContentStore::ENV`, the osct CLI's rule too); anything else counts as `local`.

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
- `CONTENT_STORE` (`local`): where the publishes and uploads go – `local` = the content store's folder (the directory
  store), `bunny` = the storage zone. A connected CDN has priority: with `bunny` every environment goes there except
  `local`, which always stays in the folder.
- `CONTENT_STORE_DIR` (as an environment variable `OSCT_CONTENT_STORE_DIR`; empty = `content-store/` at the top level of a
  development checkout, `api/content-store` in a deployed layout): the content store, served by `GET /content/{env}/…`;
  a relative path counts from the api folder. The image sets `/var/lib/osct/content-store`, a Kamal volume
  ([Content store and var](#content-store-and-var)).
- `CONTENT_BASE_URL` (empty): this instance's content CDN – what `{ "source": "cdn" }` imports (the same value as
  the reader's build flag `VITE_CONTENT_BASE_URL`, [content-cdn](content-cdn.md)).
- `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_STORAGE_PASSWORD` (the zone's access
  key – a secret): the storage zone the osct CLI syncs to (`scripts/.env` holds the same values, the endpoint there as
  `BUNNY_STORAGE_ZONE_ENDPOINT`). The endpoint is a
  host name; a full `http://host:port` origin is for a local test double only.

## Content store and var

What the API keeps besides the database is not code, so it lives outside `server/api/` (`Paths.php`):

- **The content store** – the directory store's folder: published versions (`<env>/<build>/…`, `latest.json`,
  `versions.json`) and the Library's uploads (`assets/<book>/…`) wherever this server is the backend: the environment
  `local`, and every environment of an instance without a CDN. For such an instance it *is* the published content –
  back it up with the database ([deploy, "Backup"](deploy.md#backup)). `CONTENT_STORE_DIR` / `OSCT_CONTENT_STORE_DIR`.
- **var/** – `var/db/` (the SQLite file, when `DB_SQLITE_PATH` is used), `var/log/error.log` (`LOG_PATH`),
  `var/mail/mail.log` (`MAIL_LOG_PATH`). Each setting can name another place.

In a development checkout both sit at the top level (`content-store/`, `var/`, git-ignored). In a deployed layout – the
API at `<docroot>/api`, the FTPS staging – in the API's own folder (`api/content-store`, `api/var`), where every request
goes through `index.php` (`var/` also gets a "deny all" `.htaccess`); the upload never contains them and deletes
nothing, so they survive every deploy. The container sets the content store to `/var/lib/osct/content-store` (a Kamal
volume), the error log to its log and the mail log to its temp folder ([deploy](deploy.md)).

`server/api/db/` holds the schema only. **The move:** on every request (a few `stat` calls) the API checks the places
that used to be in `server/api/db/`: the content store `db/content`, `db/error.log`, and a `DB_SQLITE_PATH` or
`MAIL_LOG_PATH` that still points into `db/` (an older `config.local.php`: `__DIR__ . '/db/local.sqlite'`) – such a
setting is read as the same file name in `var/db/` or `var/mail/`. When the old one exists and the new place is empty
(absent, or an empty folder), it is moved there once and the move is logged. When the new place holds something, both
stay and the new one is used – move the rest by hand. When the move fails, the old place keeps being used (and the
failure is logged on every request), so nothing is lost. A setting that points anywhere else is used as it is and
nothing moves into it.

## Editor data

The editor (`editor/`, the SvelteKit app at `/editor` – `agents/RULES.md` #32) keeps its drafts in the same
database, under `/api/editor/*`. A user needs the role `editor` ([Roles](#roles)): an admin grants it on the admin page
([admin](admin.md)), `POST /admin/editors { email }` with the `X-Admin-Secret` gives it from the shell – `curl -X POST
-H "X-Admin-Secret: $OSCT_SECRET" -H "Content-Type: application/json" -d '{"email":"…"}' https://…/api/admin/editors`
– or the setting `EDITORS` gives it when a listed address signs in, the instance's first editors. The editor itself
signs in like the reader (email code) and checks `GET /user` for `editor` in `roles`.

The answers of `/api/editor/*` are typed for the editor and the MCP server in `shared/api/editor.ts` – what the PHP
sends, field by field; change both together. The PHP's copies of `shared/` rules (`Editor`, `Books`, `ContentStore`,
`Plugins`, `Assets` constants) are pinned by `mcp/test/php-rules.test.ts` ([mcp](mcp.md#tests)).

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
entity and record before and after with the user in `changes`. Every save that changes a row from its current value
(`PUT …/targets/{id}`, `…/spreads/{id}`, `…/environment`, `…/passes`, `…/entities/{ref}`, an asset's replace) reads,
changes and writes it in one transaction with the row locked (`SELECT … FOR UPDATE` on MySQL, `BEGIN IMMEDIATE` on
SQLite – `Db::transaction`, `Db::forUpdate`), so two saves at the same moment never lose one's change. **Publish** writes the same assembly to the content
store as a version of the environment (`local`, `staging`, `production`) with the osct CLI's bookkeeping
(`versions.json`, `latest.json` last – [content-cdn](content-cdn.md)), so the reader of that environment sees it at
its next start and `osct content purge` understands what the editor wrote. `latest.json` and the `versions.json` entry
name the book (`book`), so the API can tell which book an environment serves (`ContentStore::live`); a manifest
written before that is read through its version's `game.config.json` (`book.id`). Publishing over another book needs
`replace: true` ([editor](editor.md) "One book per environment").

**The content store** (`ContentStore`): `CONTENT_STORE=local` keeps the versions in the content store's folder
([Content store and var](#content-store-and-var)) and `GET /api/content/{env}/{path}` serves their json files (version
folders immutable, `latest.json` revalidated) – for development, and for a host without the CDN. `CONTENT_STORE=bunny`
sends every environment but `local` to the storage
zone over the Storage API (`PUT https://{endpoint}/{zone}/{env}/{path}` with the `AccessKey` header and the sha256
checksum – what `scripts/src/lib/storage.ts` does), reads `versions.json` from there, and answers 502
`content-store-failed` when the zone refuses. The environment `local` always stays in the directory – it exists only
on a developer's machine.

### One environment per instance

An instance publishes to **its own environment only** (`ENV`, #183): a local development API to `local`, staging to
`staging`, production to `production`. The CDN keeps separate root folders per environment, and staging is for testing –
so no editor publishes into another environment; the API refuses it (403 `other-environment`). Importing *from* any
environment stays allowed (below). `GET /editor/environments` names the own environment and, per environment, its
backend: **a connected CDN has priority** (`CONTENT_STORE=bunny`: `staging · CDN`); without one the directory store is
the backend (`staging · this server`). Wherever the directory store is the publish target – `local`, or any environment
of an instance without a CDN – the answer carries the warning the editor shows next to Publish and in its confirmation
step: *"No CDN connected – the published content is stored and served by this server only. Readers load from here
without edge caching; heavy media goes through this server. Back up the content store."* (`ContentStore::SERVER_WARNING`).
`local` appears only where `ENV` is local; the book list reads what is live on the instance's environments the same way.

### Import preview

Before anything is imported, the editor and the MCP server ask what an import would bring in:
`POST /editor/import/preview` takes the import's body – a configuration (with `files`, `assetsBase`) or
`{ source: "cdn" }` – checks it as the import does (the same 400s) and writes nothing. For the CDN it reads the
instance's content base (`CONTENT_BASE_URL`), its `latest.json` and the current build's `game.config.json`, as the
import will. The answer:

- `source` – `cdn` or `configuration`; `contentBase` and `manifest` `{ url, build, activatedAt }` – the content base and
  what its `latest.json` says (null for a configuration: a form that read a content base itself fills them in);
- `incoming` – as in the comparison below (`book`, `title`, `build`, `hash`, `date`, `appVersion`, `schema`, `source`,
  `from`); the book's id comes from the configuration (`book.id`), so the CDN needs no id from the person;
- `counts` `{ spreads, entries, targets, entities }`;
- `existing` – the comparison the import would answer for the draft of that id (below, without a confirmation), null
  for a new book.

A content base that cannot be read, or whose `latest.json` names no build, answers 502 `content-fetch-failed` with the
`url` that failed. The import itself does not depend on a preview: it reads the source again, and over a book that
exists its own comparison and confirmation decide.

### Import with a version comparison

An import replaces the book's draft. Over a book that exists it takes **two steps**, for the editor and the MCP server
alike (the shared [confirmation](#confirmations), as a removal's):

1. **Compare.** The import without `confirm` writes nothing and answers 409 `confirm-import` with `comparison` –
   `book` `{ id, title }`; `incoming` `{ book, title, build, hash, date, appVersion, schema, source, from }` (the build is
   the content checksum's first 12 digits, `date` and `appVersion` the configuration's `version.timestamp` /
   `version.version`); `draft` `{ basedOn, build, edits, editsSince, recentEdits, live }` – what the draft is based on
   (the same fields plus `importedAt`, `importedBy`; recorded in `books.imported_json` by every import, null for a book
   imported before that column existed), its edits since that import (the change log after it: their number and the newest ten `{ kind, ref, user,
   token, at }`), its build now and where it is live (`current` = that environment serves the draft as it is); `same` =
   the same build comes in – and `confirmation` `{ id, expiresAt }`.
2. **Confirm.** The same import with `confirm: <id>` replaces the draft. The id lasts 10 minutes and is bound to the
   person (and the AI connection), the incoming content and the draft as it was compared (its import, its last change,
   its rows' state): anything that changed meanwhile, another person, or an expired id answer 409 `confirmation-void`
   with a new comparison and id. An import changes what the draft is based on, so an id works once.

A book that does not exist yet is imported at once.

### Confirmations

A request that replaces or removes content – an import over a book that exists, removing a spread or an entry –
takes two steps, the same for the editor and an AI connection (`Confirmation.php`, one implementation): the first
call writes nothing and answers 409 with what would happen and `confirmation` `{ id, expiresAt }`; the same call with
`confirm: <id>` does it. The id is `<expires>.<hmac>` – stateless, signed with `SECRET` over the purpose (what and
where), the person, the AI connection and a digest of the state the first answer described – and lasts 10 minutes.
Another person or token, an expired id, or anything that changed in that state answers 409 `confirmation-void` with a
fresh description and id. Doing it changes the state, so an id works once.

Locally: `OSCT_CONTENT_STORE=local` (the default) with `npm run dev:api`, publish to `local`, and start the reader
with `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` to see what the editor published (its origin
must be in `ALLOWED_ORIGINS`, as for any other call).

## Assets

The files an editor uploads (`Assets.php`, after Scutoons' asset layer – `scutoons/agents/ASSETS.md` – sized for
OSCT): models (glb, gltf), videos (mp4, webm, mov), images (jpg, png, webp) and sounds (mp3, m4a, ogg, wav), at most
`ASSET_MAX_BYTES` (64 MB), and **shaders** (glsl, frag, vert, wgsl – the kind `shader`, #186), at most 256 KB
(`Assets::TEXT_MAX_BYTES`). A shader is a source file: the upload checks it is text – sent as `text/*`, as a type that
says nothing (`application/octet-stream`, none) or as JavaScript / TypeScript, UTF-8 without NUL bytes – else 400
`invalid-file` (a picture renamed `.glsl` stops there); it is served as `text/x-glsl` / `text/wgsl`. A plugin loads it
by its URL (`api.loadText`, [plugins](plugins.md) "A shader file"). A script (`.ts`, `.js`) is no asset: it is a
plugin source ("Plugin sources" – the 400 says so). They live in the content store under the pseudo environment `assets`:
`assets/<book>/<asset id>/v<n>.<ext>` – in the content store's folder for the local store, served (for every book id the
editor accepts, capitals and `_` included) by `GET /content/assets/…` with the file's type, a year's cache and `Access-Control-Allow-Origin: *` (the reader's
engine loads them cross-origin), or in the CDN's storage zone (`CONTENT_STORE=bunny`, reached at
`CONTENT_BASE_URL/assets/…`). `ASSET_BASE_URL` overrides where their URLs point. The local store's URLs are this API's
own (`Http::apiUrl()`): on a deployed instance (`ENV` not `local`) the host of `APP_URL` – the API is served as `/api`
next to the app – and never the request's `Host` / `X-Forwarded-Host`, which the client chooses and which would end up
in the content; without `APP_URL` such an instance refuses the upload (500 `not-configured`). A local instance takes
the request's host (there `APP_URL` names an app's dev server, and the API answers on its own port). The same host is
in `GET /editor/environments`' `url` for the server store.

A node's `src` and a target's `imageSrc` hold the asset's **absolute URL** – the publish leaves absolute URLs as
they are, so draft and every version point at the same file. Tables: `assets` (one per file: name, kind, mime,
size, sha256, width / height, `duration_ms`, the current version's path and URL) and `asset_versions` (one per upload). The same
bytes uploaded twice are one asset. An upload or a replace writes the file first and then its rows in one transaction;
rows that cannot be written take the file with them (no file without its row). A replace locks the asset's row from
reading its version to the new version's rows, so two replaces at once take two version numbers. A delete removes the
rows in one transaction with a change in the book's log (kind `asset`, `before` = the asset with its versions – as a
[removal](#removing-a-spread-or-an-entry) records the files it takes), so a forced delete is in the history; the files
go after the commit.

An upload or a replace reads the file's own numbers: an image's width and height (its header), a video's width, height
and duration (`VideoInfo.php`, plain PHP, no ffmpeg): mp4 / mov from `moov › mvhd` (duration, timescale) and the video
track's `trak › tkhd` (its size, turned when the track's matrix turns it a quarter – a phone's portrait video), webm / mkv
from the EBML `Segment › Info` (`Duration`, `TimecodeScale`) and `Tracks › the video TrackEntry › Video` (`PixelWidth`,
`PixelHeight`). Only the headers are read; a file that does not tell answers `null`, never an error. Rows uploaded before
the column existed stay `null` until their file is replaced.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/books/{id}/assets[?kind=]` | | `{ assets: [{ id, name, kind, mime, size, width, height, durationMs, version, url, usages, imported, createdAt, updatedAt }] }` – `width` / `height` in pixels (images, videos), `durationMs` (videos), null when unknown; `usages` = rows of the book naming the URL; the uploads first, then the files of the import's `files.json` (`imported: true`, id `import-<hash>`, read-only: no replace, usages or delete; `url` below the assets base, `usages` counted with the content path `/assets/content/…` the rows name) |
| `POST /editor/books/{id}/assets` | the file; `X-File-Name: name.ext` | 201 `{ asset }`, or 200 with the asset that already holds these bytes. 400 `invalid-file` (no name, unsupported type, empty, a shader that is no text), 413 `body-too-large` (a shader above 256 KB) |
| `PUT /editor/books/{id}/assets/{aid}/file` | the file (`X-File-Name` optional, the kind must stay) | `{ asset, relinked }` – a new version at a new path (`v2.ext`: nothing to purge on a CDN); every target, entity and entry naming the old URL now names the new one, and the book's environment (`worldSrc`, `skySrc`), and every plugin source that names it (a shader it loads – the URL replaced in its text) (a change each) |
| `GET /editor/books/{id}/assets/{aid}/usages` | | `{ usages: [{ kind: environment | target | entity | entry | plugin, ref }], asset }` (`environment`: the book's world model or sky, `ref` = the book; `plugin`: a plugin source naming the URL, `ref` = its id; `asset` as the list has it) |
| `DELETE /editor/books/{id}/assets/{aid}[?force=1]` | | 204; 409 `asset-in-use` with `usages` unless forced (the files of every version go; a change `asset` in the log) |

Renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build (PLAN 2b).

## Plugin sources

The editor's **Code** tab ([editor](editor.md)) keeps the TypeScript of a book's plugins in the `plugins` table
(`Plugins.php`): one row per plugin id (`book_id`, `id`, `source`, who, when), at most 256 KB each, every save a
change (`kind: plugin`, the source before and after). They are the editor's sandbox: the editor transpiles and runs
them on its own stage, and nothing of them reaches a publish. The compiled plugins a book has come in with the
import – the configuration's `plugins` list (content schema 2.4: `{ id, src, api }`, 2.14: `registered`, what each
plugin registered – written by the content build only) is kept in `books.plugins_json` and assembled back after
`tutorial`, its `src` below the assets base like every other content path. What the compiled plugins register is
known when every one of them recorded it (`Editor::recorded`; no plugins: nothing). Then a publish whose nodes use a
component type that is neither built in (`Editor::COMPONENT_TYPES`) nor recorded answers 409 `unknown-components` with
the types – the reader would refuse such content as a whole; a plugin of an older build (nothing recorded) may register
anything, so nothing is refused. The same for a plugin's **node type** (content schema 2.13): an entity body (a save,
the import) may name a type outside `Editor::ENTITY_TYPES` when a plugin of the book registers it
(`Editor::pluginNodeTypes`): the declared plugins' recorded node types – any other name is a typo, 400
`invalid-entity` naming them; while a plugin of the book is unknown until it runs – a source in the Code tab (never
built here, so nothing is recorded) or a declared plugin of an older build – any name like one passes
(`Editor::PLUGIN_NODE_TYPE`: camelCase, at most 32 characters; the stage and the content build run the code); without
plugins it is 400 `invalid-entity`. A publish whose nodes have types no declared plugin recorded answers 409
`unknown-node-types` with `nodeTypes`. A node's **material** (content schema 2.17) is always a plugin's: `{ type, params? }`
with a camelCase type (`Editor::MATERIAL_TYPE`), checked against the declared plugins' recorded materials the same way
(`Editor::pluginMaterials` – a typo is 400 `invalid-entity` naming them, any name passes while a plugin is unknown, none
without plugins); a publish whose nodes use a material no declared plugin recorded answers 409 `unknown-materials` with
`materials`. A plugin's `registered` may hold `materials` and `textures` next to the other kinds. A **pass** of the
book's or a spread's `passes` (content schema 2.21, #216) is a built-in one (`Books::PASS_TYPES`) or one the declared
plugins recorded the same way (`Editor::pluginTypesOfBook($bookId, 'passes')` – a typo is 400 naming them, any camelCase
name passes while a plugin is unknown, `Books::PLUGIN_PASS_TYPE`; none without plugins); a publish whose passes name one no
declared plugin recorded answers 409 `unknown-passes` with `passes`.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/books/{id}/plugins` | | `{ plugins: [{ id, size, usages, updatedAt, updatedBy }] }` – `usages`: the draft's rows that use what it registers (below) |
| `GET /editor/books/{id}/plugins/{pid}` | | `{ plugin: { id, source, size, updatedAt, updatedBy } }`; 404 |
| `PUT /editor/books/{id}/plugins/{pid}` | `{ source }` | `{ plugin }` – new or changed; 400 `invalid-plugin` (the id is 1–40 lower-case letters, digits or `-`; the source a string), 413 above 256 KB |
| `POST /editor/books/{id}/plugins[?id=]` | a script file; `X-File-Name: name.ts` or `.js` | 201 `{ plugin }` – a new source, its id `?id=` or the file's name (`Wobble Effect.ts` → `wobble-effect`), a byte order mark dropped. 400 `invalid-file` (not .ts / .js – a shader points to the assets –, empty, no text: checked like a shader), 400 `invalid-plugin` (the name gives no id), 409 `plugin-exists` (`plugin`: the id), 413 above 256 KB |
| `PUT /editor/books/{id}/plugins/{pid}/file` | a script file (`X-File-Name` optional) | `{ plugin }` – its new source (a change recorded); 404, 400 / 413 as above |
| `GET /editor/books/{id}/plugins/{pid}/usages` | | `{ usages: [{ kind: book | spread | target | entity | entry, ref }], registers: { components, layers, nodeTypes, passes, materials, textures } }` |
| `DELETE /editor/books/{id}/plugins/{pid}[?force=1]` | | 204; 409 `plugin-in-use` with `usages` unless forced |

**The Library's scripts** (#186) are these rows: the editor's Library lists them beside the shader assets and uploads a
script file with `POST …/plugins`. A source is **used** where the draft names a type it registers – the types read from
its text as the MCP server reads them (`api.registerComponent("spin", …)` and the five other functions; the content build
is what knows for sure): a row of the book (its master passes), a spread, a target, a shared entity or an entry whose
JSON holds `"type":"<type>"` (a component, layer, node type, pass or material) or a procedural texture's type as a value.

### Targets and entries made in the editor

`PUT /editor/books/{id}/targets/{tid}` also takes `{ imageSrc }` (the printed image – an asset's URL) and
`{ print }` (`PrintPlacement`, content schema 2.1: `surface` left / right, `x`, `y`, `width` in mm from the surface's
top left corner, optional `height` and `page`) – the editor's stage lays the target there; `null` removes it. 400
`invalid-target`. `POST /editor/books/{id}/entries` `{ title, page, category?, body?, target: { id?, imageSrc, print?,
entity? } }` → 201 `{ entry, spreadId }` makes an entry (id from title and page, `p102-shadows`, or the given one;
409 `duplicate-id`) with its target on the spread its page belongs to; `DELETE /editor/books/{id}/entries/{eid}`
removes the entry with its target and the entity used only there, in two steps ([Removing a spread or an
entry](#removing-a-spread-or-an-entry)). The reader tracks such a target after a publish: the 8th Wall
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
| `PUT /editor/books/{id}/spreads/{sid}` | `{ title?, format?, passes? }` | `{ spread }` – title, format (`cover` only on page 0) and the spread's own post-processing (an override of the book's: `null` removes it so the book's apply, `[]` turns them off there); the pages stay |
| `PUT /editor/books/{id}/environment` | `{ environment: { world, onionSky, worldSrc?, skySrc? } \| null }` | `{ environment }` – the book's world and onion sky (`book.environment`, content schema 2.8; the world model and the sky image as references 2.10); `null` removes it – the default applies. A change `environment` in the log. 400 `invalid-environment`; 404 |
| `PUT /editor/books/{id}/passes` | `{ passes: [{ type, …parameters }] \| null }` | `{ passes }` – the book's post-processing (`book.passes`, content schema 2.5), the master every spread without a list of its own shows; `null` removes it. Checked as a spread's list (a built-in `type` or a plugin's pass – schema 2.21, scalar parameters); a change `passes` in the log. 400 `invalid-passes`; 404 |
| `DELETE /editor/books/{id}/spreads/{sid}` | `{ confirm?, deleteFiles? }` | the spread with everything on it, in two steps ([below](#removing-a-spread-or-an-entry)): 409 `confirm-delete` with `impact` and `confirmation`, then with `confirm` 200 `{ deleted, moved }` – a double page's later pages are numbered back by its pages (the reverse of adding it), a cover moves nothing. 409 `initial-spread` for the spread the book opens on (it never goes); 404 |

### Removing a spread or an entry

`DELETE /editor/books/{id}/spreads/{sid}` and `DELETE /editor/books/{id}/entries/{eid}` remove with everything on it, in
the two steps of a [confirmation](#confirmations) – for the editor and an AI connection alike (a token removes like its
person, only this way; the change log names it). `Removal.php` works out what goes:

1. **Impact.** Without `confirm` nothing is written: 409 `confirm-delete` with `impact` and `confirmation`. `impact` =
   `kind` (`spread` / `entry`), `spread` `{ id, title, firstPage, lastPage, format }` or `entry` `{ id, title, page,
   category, spread }`, `pagesBack` (by how many pages the later pages move back – 0 for a cover, an entry, or nothing
   after it), `entries` `[{ id, title, page, category }]`, `targets` `[{ id, entry, imageSrc }]`, `entities` – the ones
   that go: a shared entity no other target uses `{ ref, type, shared: true, targets }` and each target's own
   `{ ref: null, type, shared: false, targets }` –, `keptEntities` – shared entities other targets still use
   `[{ ref, type, targets, usedBy }]`, kept –, `files` `{ onlyHere, elsewhere }` – the Library files (uploaded assets,
   [Assets](#assets)) the removed rows name: `[{ id, name, kind, size, url }]`, those used elsewhere with `usedBy`
   (`Assets::usagesOf` beyond the removed rows; the environment counts) – and `counts` `{ entries, targets, entities,
   keptEntities, filesOnlyHere, filesElsewhere }`. The import's files (`files.json`) are the content build's and never
   part of it.
2. **Confirm.** The same request with `confirm: <id>` removes exactly what the impact listed, in one transaction:
   targets, the entities used only there, entries, the spread – the later pages move back as when a double page is
   removed ([above](#spreads-made-in-the-editor)) – and with `deleteFiles: true` also the Library files used only
   there (off by default; a file used elsewhere is never deleted; the store's files go after the commit). Every removed
   row is a change with its `before` and `after: null` (kinds `target`, `entity`, `entry`, `spread`, `asset`). 200
   `{ deleted: { spread, entries, targets, entities, files }, moved: { spreads, entries, targets } }`. The id is bound
   to every row that goes, the kept entities' users, the files and their uses, and the book's change log and last
   change: anything that changed in the book answers 409 `confirmation-void` with a fresh impact and id.

400 `invalid-delete` when `deleteFiles` is not true or false.

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `LOG_PATH` – locally
`var/log/error.log` (never served over HTTP), in the container `/dev/stderr` = `kamal app logs`. Readers
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

The mails (with link and code) land in `MAIL_LOG_PATH` – `var/mail/mail.log` unless it says otherwise.

### Tests

```bash
php server/tests/api-test.php                       # SQLite (temporary files)
OSCT_TEST_DB=mysql php server/tests/api-test.php    # MariaDB of docker-compose.yml
```

With `OSCT_TEST_DB=mysql` every API the test starts gets a new database `osct_test_<random>_<name>`, made from
`schema.mysql.sql` (the older-database case from a cut copy of it), and the test drops them at the end. It signs in
with `OSCT_TEST_DB_HOST` (`127.0.0.1`), `OSCT_TEST_DB_PORT` (`3306`), `OSCT_TEST_DB_USER` (`root`) and
`OSCT_TEST_DB_PASS` (`osct-root`) – an account that may create and drop databases (and, for a moment, a trigger:
the removal's rollback test, #198), never staging's. CI runs both:
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
