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
                          the editor: Editor (access, checks), Experiences (import, tree, entities, targets, publish, logs),
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
| `POST /auth/request` | `{ email, language?, options?, experience? }` | 202 `{ requestId, expiresAt }` – sends the email; `options` = `{ buildingfictions: bool }`, the one update option (news from Building Fictions, #325; opt-in, off when missing) | `experience` (#343): the email's link opens `/<experience>/about?login=…` – the experience the reader asked from (one of the site's own paths or no id: left out, the default's `/about`).
| `POST /auth/verify` | `{ token }` or `{ requestId, code }`, `session?` | `{ session, user, created }` – with `"session": "cookie"` (a browser) `{ csrfToken, user, created }` and the session cookie instead ([Sessions](#sessions-cookies-and-csrf)) |
| `POST /auth/password` | `{ email, password, session? }` | `{ session, user, created: false }` – a browser the same as above; 401 `invalid-credentials` (also for unknown addresses and users without a password) |
| `POST /auth/logout` | | 204 – this device only; a cookie session needs its CSRF token like any write, and the cookie is cleared |
| `POST /auth/cookie` | Bearer: a session token | **temporary** (#207): `{ user, csrfToken }` and the cookie – a token a browser kept before the cookie, exchanged once ([Sessions](#sessions-cookies-and-csrf)) |
| `GET /user` | | `{ user }` – `{ email, language, options, hasPassword, roles, role, createdAt }`; `roles` holds `reader` for everyone, `editor`, `admin` ([Roles](#roles)); with the cookie also `csrfToken` |
| `PATCH /user` | `{ options?, language? }` | `{ user }` – the person's own sign-in only (an AI connection's token: 403 `not-for-ai`) |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `PUT /user/password` | `{ password, currentPassword? }` | `{ user }` – sets or changes the password (`user.hasPassword`) |
| `/user/tokens` | | the [AI connections](#ai-connections)' tokens |
| `GET /progress/{experienceId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{experienceId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /experiences/{id}/manifest.webmanifest` | | the web app manifest of the experience at `/{id}/` in the reader (#343, `ReaderManifest.php`, no sign-in): `id`, `start_url` and `scope` `/{id}/`, the build's colours and icons; `name` and `description` from the experience once it has been published (a draft's title is not given away – the id stands in); 404 for one of the site's own paths. The reader links it for every experience but the build's default ([content-cdn](content-cdn.md#the-installed-app-pwa)) |
| `GET /health` | | `{ status, version, env, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10); `env` = the instance's environment (`ENV`, [Configuration](#configuration)) |
| `/admin/*` | | the [Admin API](#admin-api): roles, users, the newsletter CSV, migrate |

The editor's endpoints ([Editor data](#editor-data)) need a signed-in user with the role `editor` ([Roles](#roles)) – 401
without a token, 403 `forbidden` for a reader. `{id}` is the experience, ids and refs are `[A-Za-z0-9_-]{1,64}`:

| | | |
|---|---|---|
| `POST /editor/experiences` | `{ id, title }` | 201 `{ experience }` (the list's fields) – **a new, empty experience** (#343, [New experiences](#new-experiences)): a draft with one scene (a double page), nothing on it. 400 `invalid-slug`, `reserved-slug` (one of the site's own paths), `invalid-title` (1–200 characters); 409 `duplicate-id` |
| `GET /editor/experiences` | | `{ experiences: [{ id, title, experience, initialScene, schema, assetsBase, libraryBase, importedHash, scenes, createdAt, updatedAt, lastPublish, live }], environments }` – `libraryBase` = the public folder of the experience's uploads (`…/assets/<id>/`, every Library file's URL lies below it; "" where the instance has no public URL for stored files); `lastPublish` `{ env, build, at }` or null; `live` = the environments serving the experience `[{ env, build, since }]` (empty: draft only, the tree's `experience` has it too); `environments` = what each environment serves `[{ env, experience, build, since }]` (`experience` null when it cannot be told), `{ env, error }` when its store cannot be read – only environments that serve something |
| `GET /editor/environments` | | `{ env, environments: [{ env, store, publish, url, warning }] }` – this instance's environment (`ENV`, the only one it publishes to) first, then `staging` and `production` (`local` only where `ENV` is local); `store` = `cdn` (the storage zone) or `server` (the directory store this API serves); `publish` true for the own one only; `url` = where readers load it; `warning` = the line the editor shows wherever the directory store is the publish target, else null – [One environment per instance](#one-environment-per-instance) |
| `POST /editor/import/preview` | `{ configuration, files?, assetsBase?, sources? }` or `{ source: "cdn", experience? }` (the import's body), either with `into?` | `{ source, contentBase, manifest, incoming, counts, existing }` – what that import would bring in, **nothing imported** ([Import preview](#import-preview)). The import's access (AI connections too); 400 as the import (`invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id` – also for a configuration without `experience.id` or with one that is no id, `no-content-base`); it answers for the configuration's own `experience.id`, the id the import is then called with – or for `into` (#348: the import goes there with `rename`); 413 `body-too-large`; 502 `content-fetch-failed` with the failing `url` |
| `POST /editor/experiences/{id}/import` | `{ configuration, files?, assetsBase?, sources?, confirm? }` or `{ source: "cdn", experience?, confirm? }`, either with `rename?`, `title?`, `create?` (#348) | `{ experience, counts, draft: { build, hash }, imported }` – replaces the experience's rows from a game configuration (one transaction; the logs stay). `files` = its `files.json` – without it `<assetsBase>/files.json` is fetched (optional: a base without one, the reader's dev server, leaves no imported files in the Library; #244), `assetsBase` = where its `/assets/content/…` paths resolve (the CDN's `<base>/<build>`); `source: "cdn"` fetches the current version of `experience` (default `{id}`) in its store below `CONTENT_BASE_URL`; `sources` = the Code tab's plugins `[{ id, files: [{ name, text }] }]` (an [export file](#export-file) carries them; `{ id, source }` is a plugin of one `index.ts`) saved with the rows, each a change; `rename: true` = the configuration becomes `{id}`'s (its `experience.id` is set to `{id}` – another experience's export or published version); `title` (1–200) replaces its title; `create: true` = a new experience only, checked as `POST /editor/experiences` (400 `invalid-slug` / `reserved-slug`, 409 `duplicate-id`); `imported` = what the draft is now based on. **Over an experience that exists, two steps** ([Import with a version comparison](#import-with-a-version-comparison)): without `confirm` 409 `confirm-import` with `comparison` and `confirmation` `{ id, expiresAt }`, nothing written; with `confirm` the import; a confirmation that is expired, someone else's or outdated 409 `confirmation-void` (a new comparison with it). The configuration's `experience.id` must be `{id}` (the rows go under `{id}`, the configuration keeps its `experience`, and a publish names both): another id is 400 `invalid-configuration` naming both (#204) – unless `rename`. 400 `invalid-configuration`, `invalid-entity`, `unknown-entity`, `invalid-id`, `no-content-base`; 413 `body-too-large` (`EDITOR_MAX_BYTES`); 502 `content-fetch-failed` (with the failing `url`) |
| `GET /editor/experiences/{id}` | | `{ experience, scenes: [{ …SceneData, entries: [{ id, category, title, scene, surface?, target }] }], groups }` – the tree ([Scenes](#scenes)); `target` = the entry's TargetData (id, imageSrc, place, entity inline or `{ ref }`) or null. An experience of content schema 2.x answers 409 `old-schema` |
| `GET /editor/experiences/{id}/entities` | | `{ entities: { ref: EntityData } }` – the shared entities |
| `PUT /editor/experiences/{id}/entities/{ref}` | `EntityData` | `{ ref, entity }` – saves (or adds) a shared entity; records a change. 400 `invalid-entity`: no object, `type` not one of the contract's entity types (nor a plugin's, in an experience with plugins – "Plugin sources"), no `assets` list |
| `PUT /editor/experiences/{id}/targets/{targetId}` | `{ entity }` or `{ ref }` | `{ target }` – the target's entity: inline (`entity`, null removes it) or a shared one (`ref`, 400 `unknown-entity` when there is none); records a change. 404 for an unknown target |
| `GET /editor/experiences/{id}/draft/latest.json` · `…/draft/{build}/game.config.json` · `…/draft/{build}/files.json` | | the draft as a content version, assembled from the rows on every call (`Cache-Control: no-store`); the engine's loader reads it like the CDN, its `fetchFn` sending the session cookie. The build in the path is not checked against the current draft – an edit between the two requests is no error |
| `POST /editor/experiences/{id}/publish` | `{ env, note?, plugins? }` – `plugins` = the Code tab's saved sources as the editor transpiled them, `[{ id, code, api, registered? }]` (#78: each id a saved source of the experience, else 400 `invalid-plugins`; written into the version as `assets/content/plugins/<id>/plugin-<hash>.js` and declared; `registered` kept only when it names the types the source registers) | `{ env, store, build, hash, publishedAt, export }` – writes the assembled version to the experience's own store in `env` (#87: `<title>/<env>/<id>/` on the zone, `<env>/<id>/` in the directory store – a publish never touches another experience), which must be this instance's own environment (`ENV`; another one: **403 `other-environment`** with `env`, the own one): `<build>/game.config.json` and `files.json` (unless that build is there already – a version folder is never overwritten), then `versions.json` (the previous current version retired), then `latest.json` (both name the experience); a row in the publish log; then the build's **export archive** `exports/<build>/` in the same store unless it is there (`export` = `{ path, written, error? }` – a failure is reported here and in the error log, the publish stands; [Export](#export)). `store` = where it went (`cdn` or `server`). The writing is a **job** ([Publish jobs](#publish-jobs), #345): when it ends within `PUBLISH_STEP_SECONDS` the answer is 200 with the outcome and `job`; else **202 `{ job }`** and the job runs on. 400 `invalid-env` (no environment name); 409 `publish-running` (a publish of the experience runs – its `job`); 502 `content-store-failed` (with `job`) |
| `GET /editor/experiences/{id}/publish/{job}` | | `{ job }` – the job's `status` (`running` / `done` / `failed`), `phase` (`version` → `switch` → `archive` → `done`), `build`, `hash`, `live` (latest.json names the build), `done` / `total` files, `skipped` (on the store already), `parts` `{ build, archive }` (the files of the version folder and of the export archive: `total` = build + 2 for the switch + archive – the editor counts the archive with it), `startedAt`, `updatedAt`, `result` (done: the publish's answer) or `error` `{ code, message, status }` (failed; `abandoned`: no one continued it). A running job first runs on for `PUBLISH_STEP_SECONDS` unless another request runs it. 404 `unknown-job` (not a job of this experience) |
| `GET /editor/experiences/{id}/publish` | | `{ job }` – the experience's newest job (null: none kept – ended jobs are kept 14 days); a running one runs on like a poll. Where the editor finds a publish whose start answer a gateway swallowed |
| `GET /editor/experiences/{id}/versions` | | `{ versions: [{ id, env, build, hash, publishedBy, publishedAt, note }] }` – the publish log, newest first |
| `POST /editor/experiences/{id}/versions/{build}/activate` | | `{ env, build, hash, activatedAt, previous, version }` – **make live** (#348, [Make a version live again](#make-a-version-live-again)): an older build of this instance's environment is current again; 403 `not-for-ai`, 404 `unknown-build`, 409 `already-live` / `publish-running` / `build-missing` / `unreadable-schema` |
| `GET /editor/experiences/{id}/export/file[?build=]` | | the draft (or a published build) as one JSON file to download (#348, [Export file](#export-file)) – an import body as it is |
| `GET /editor/recent?limit=` | | `{ changes: [{ experience, experienceTitle, kind, ref, scene, sceneLabel, entry, user, token, at }] }` – the newest changes across the instance's experiences (#348, [Recent places](#recent-places)); default 40, at most 200 |
| `GET /editor/experiences/{id}/export[?build=]` | | `{ experience, source, build, hash, schema, appVersion, exportedAt, configuration, files, unknown, layout, plugins, credits }` – everything an export of the experience needs: the draft, or with `build` a published version from the content store ([Export](#export)). 400 `invalid-build`, 404 `unknown-build` (not in this experience's publish log), 404 `build-missing` (logged, but the store has no readable configuration) |
| `GET /editor/experiences/{id}/changes?limit=` | | `{ changes: [{ id, kind, ref, before, after, user, token, createdAt, set, reverts, delivery, notRevertable }] }` – newest first; `kind` `entity` (ref = the entity) or `target` (ref = the target id, before/after = the whole target) – and `entry`, `scene`, `order`, `groups`, `reference`, `environment`, `passes`, `appearance`, `experience`, `plugin`, `asset` (a Library file a removal deleted), `migration` (#319); a removed row has `after: null`; `token` = the name of the AI connection a save came through, null for the editor; `set` / `reverts` for a revert's changes, `delivery` the delivery that wrote it ([Deliveries](#deliveries)) and `notRevertable` – [Reverting saved changes](#reverting-saved-changes); `limit` default 50, at most 500 |
| `GET /editor/experiences/{id}/deliveries?limit=` | | `{ deliveries: [{ id, name, source, counts, user, token, createdAt, changes }] }` – the applied deliveries, newest first (a comparison leaves no row); `changes` = how many changes of the log name it, `token` the AI connection it came through; `limit` default 50, at most 500 – [Deliveries](#deliveries) |
| `POST /editor/experiences/{id}/deliveries` | `{ name, source?, scenes?, entries, apply?, overwrite? }` – a delivery plan, its files Library files by id or URL | `{ delivery: { id, name, source }, applied, items, counts, problems, warnings, written }` – a publisher's delivery compared with the draft per scene, entry and target (`new` / `changed` / `same` / `conflict`); with `apply: true` written in one transaction, each write a change naming the delivery – [Deliveries](#deliveries). 400 `invalid-delivery`; 409 `delivery-problems` with `comparison` |
| `GET /content/{env}/{experience}/{path}` | | an experience's store in the **local** content store, public like the CDN: `latest.json`, `versions.json` (`no-cache`) and `<build>/game.config.json` / `files.json` and a published plugin (immutable) – nothing else, no other path; `/content/assets/{experience}/…` the Library's files ("Assets") |

Signed-in calls from a browser send the session cookie and, with every write, its CSRF token; other clients send
`Authorization: Bearer <session>` – or an AI connection's token `osct_…` ([AI connections](#ai-connections)) –
[Sessions, cookies and CSRF](#sessions-cookies-and-csrf). Errors: `{ "error": { "code", "message" } }`. The app
translates the codes (`account:errors.*`).

### Sessions, cookies and CSRF

Tilman, 2026-10-30 (#207): the browser's session is an **HttpOnly cookie** with a CSRF token, so no script on the page –
an experience's plugin in the editor, anything injected – can read the session and carry it off. `Auth.php` holds it all.

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
- **What the cookie does not do.** The cookie stops the session from being **read and
  carried off**. It does not, by itself, separate code that runs on the site's own pages from the session: such code is
  in the same origin and could make requests that go with the cookie while the page is open – and read the CSRF token
  from `GET /user` like the app does.
  - **The editor** (5.0, #340, Tilman 2026-11-21: *"we can drop the sandbox. since we trust the user, thats why we gave
    them access to the api. … it is a huge security risk but only to the user who is logged in and their scope."*):
    experience plugins – the draft's and the Code tab's – run in the editor's own page, with the signed-in editor's
    session; they can read and write what that person may. The stage frame of #234 (an iframe sandboxed without
    `allow-same-origin`, 1.58.0 to 4.x) is gone. What stays is a **guard**: plugin code someone other than the signed-in
    editor saved last runs only after a prompt that names who saved it, kept per experience and source version
    ([editor](editor.md) "The plugin guard"). RULES #35.
  - **The reader** runs plugins in its page too (Tilman, 2026-10-29: the review before a release is the protection): a published
    experience's plugins run in the reader's page, with the reader's session – and since the cookie is one for the site, with
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
`scutoons/agents/MCP.md` §3): an editor or admin makes one on the editor's experiences page ([editor](editor.md#ai-connections))
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
  consent and update options are user-centric data that no admin route writes either, `agents/RULES.md` #33) – and **publish**, to any environment (`Auth::refuseToken()` in `Experiences::publish`): readers are
  reached only by a person. Reading and saving drafts, assets and plugin sources – uploading shaders and script files
  included – work as for the person; removing a
  scene or an entry too, but only in the two steps of a [confirmation](#confirmations) – the impact first, then the
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
| `GET /admin/users.csv?newsletter=1&option=` | | the same users as CSV (`email, language, buildingfictions, createdAt`), `Content-Disposition: attachment` – the newsletter list for the mailing tool; `option=buildingfictions` narrows to that option |
| `PUT /admin/users/{id}/roles/{role}` | | `{ changed, user }` – grants the role (`changed: false` when the user had it); 404 `not-found` / `unknown-role`, 400 `invalid-role` for `reader` |
| `DELETE /admin/users/{id}/roles/{role}` | | `{ changed, user }` – revokes it; 409 `last-admin` when the last admin would go |
| `POST /admin/editors` | `{ email }` | `{ user, created, changed }` – gives the user the role `editor`, creating the user (confirmed, `en`, no options) when the address is new |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` only | `{ statements }` – creates missing tables and columns (the container does this at every start) |
| `GET /admin/arrivals?days=30` | | `{ days, from, to, sources: [{ source, arrivals, firstArrivals, devices: { phone, tablet, desktop }, firstDay, lastDay, recent: [{ day, arrivals }] }] }` – the arrivals by source ([Arrivals](#arrivals)): every source ever counted, most arrivals first; the totals over all time, `recent` the last `days` days (1–366, days without arrivals left out) |

### Arrivals

How many people come to the app from each printed QR code or link (#324, `Arrivals.php`): an address with
**`?s=<source>`** – a short code of a–z, 0–9 and dashes – counts as an arrival from that source. The book's QR code
(last page) is **`?s=bk1`**, the desktop landing page's own code `?s=lp1`; any other code counts as soon as it is used,
so a new flyer or poster needs only its own source in its address.

Every experience is at its own path in the reader (#343): a new code names it – `https://<instance>/<experience>/…?s=fl1`
(the admin's *A new code*). A code without one (printed before) opens the experience its source maps to – `bk1` → `osct`
(forever, RULES #39), `d1` → `demo`, any other the instance's default (`SOURCE_EXPERIENCES`,
`shared/api/experience-paths.ts`; the reader moves the address before it counts – [pages](pages.md#links)). The count
is the same either way: the source, once.

- The reader (`client/src/services/ArrivalService.ts`) reads `s` at startup, takes it out of the address (a reload or a
  shared link does not count again) and sends **`POST /arrivals { source, device, first }`** → 204, without the cookie
  (`credentials: "omit"`, so no CSRF and no session): `device` is `phone`, `tablet` or `desktop` from the user agent,
  `first` whether this browser had never reported an arrival (`localStorage` `osct-arrived`). A malformed source → 400
  `invalid-source`; more than 50 sources never seen before on one day → 429 `too-many-sources`.
- The table `arrivals` keeps **counts only**: per source, UTC day and device, the arrivals and the first arrivals. No
  IP, no user, no cookie, no user agent (data sovereignty, `agents/STRATEGY.md`).
- The admin page shows them ([admin](admin.md), *QR codes and links*; `GET /admin/arrivals`).

## Configuration

`src/Config.php` lists every key and its default. An environment variable `OSCT_<KEY>` wins, then
`server/api/config.local.php`. `OSCT_CONFIG_FILE` (environment only) names another settings file in place of
`config.local.php` – a PHP file that returns an array of keys, like the example; a path that does not exist means no
file (the API test sets `/nonexistent`, so a developer's `config.local.php` never leaks into it; `scripts/db/pull-staging.sh`
and the demo video's API do the same or point it at their own file). Mail sending is set with `MAIL_TRANSPORT`:
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
- `PUBLISH_STEP_SECONDS` (`15`): how long a publish writes in its POST and in each poll before it answers ([Publish
  jobs](#publish-jobs)) – keep it well below the gateway's timeout and PHP's `max_execution_time`; `0` = one slice per
  request (the API test).
- `CONTENT_STORE` (`local`): where the publishes and uploads go – `local` = the content store's folder (the directory
  store), `bunny` = the storage zone. A connected CDN has priority: with `bunny` every environment goes there except
  `local`, which always stays in the folder.
- `CONTENT_STORE_DIR` (as an environment variable `OSCT_CONTENT_STORE_DIR`; empty = `content-store/` at the top level of a
  development checkout, `api/content-store` in a deployed layout): the content store, served by `GET /content/{env}/{experience}/…`;
  a relative path counts from the api folder. The image sets `/var/lib/osct/content-store`, a Kamal volume
  ([Content store and var](#content-store-and-var)).
- `CONTENT_BASE_URL` (empty): this instance's content CDN, the environment's URL `<pull zone>/<title>/<env>` – an
  experience's store is `<base>/<experience>/`; `{ "source": "cdn" }` imports from there (the same value as the reader's
  build flag `VITE_CONTENT_BASE_URL`, [content-cdn](content-cdn.md)).
- `TITLE` (`osct`): the title – the first segment of every path on the storage zone, `<title>/<env>/<experience>/…`
  (#50, #87; the osct CLI reads the same `OSCT_TITLE`). Not used by the directory store (one instance, one title).
- `EXPERIENCE` (empty): the instance's default experience – what `POST /editor/import/preview { source: "cdn" }` reads
  when the request names none (the reader build's `VITE_EXPERIENCE` is the same value, `OSCT_EXPERIENCE`).
- `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ENDPOINT` (`storage.bunnycdn.com`), `BUNNY_STORAGE_PASSWORD` (the zone's access
  key – a secret): the storage zone the osct CLI syncs to (`scripts/.env` holds the same values under the same
  environment names, `OSCT_BUNNY_STORAGE_*` and `OSCT_CONTENT_BASE_URL`, #33). The endpoint is a
  host name; a full `http://host:port` origin is for a local test double only.

## Content store and var

What the API keeps besides the database is not code, so it lives outside `server/api/` (`Paths.php`):

- **The content store** – the directory store's folder: published versions (`<env>/<experience>/<build>/…`,
  `<env>/<experience>/latest.json`, `versions.json` – #87) and the Library's uploads (`assets/<experience>/…`) wherever this server is the backend: the environment
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
sends, field by field; change both together. The PHP's copies of `shared/` rules (`Editor`, `Experiences`, `ContentStore`,
`Plugins`, `Assets` constants) are pinned by `mcp/test/php-rules.test.ts` ([mcp](mcp.md#tests)).

**Tables** (both schema files, additive – the one exception is a removed feature's column, removed by name: the
onboarding's `experiences.tutorial_json`, #236): `experiences` (the experience row: `ExperienceData` as `experience_json`, the initial scene, the imported `files.json`, the content schema, the imported hash, `assets_base`), `scenes`, `entries`,
`targets`, `entities` (keys `(experience_id, id)` / `(experience_id, ref)`, deleted with the experience), `experience_versions` (the publish
log), `changes` (the change log) and `plugins` (the Code tab's sources, below). Every content row keeps the object exactly as it was imported in its
`data_json` column – unknown fields included – and `position` keeps the imported order; the typed columns (title,
category, image, entity ref, …) only index the rows for the tree and the queries (the page columns of `scenes` and
`entries` are not used since the content schema 3.0 – 0). An entry's `data_json` is the entry without its target and
its scene; the target row holds the target with its entity, inline or `{ ref }`. An entry's scene is
`entries.scene_id` – every entry has one ([Scenes](#scenes)).

**Import → draft → publish.** `POST …/import` replaces the experience's rows from a game configuration in one transaction
(the editor offers the running reader's `game.config.json`, or `{ "source": "cdn" }` takes the CDN's current version);
the change and publish logs stay. The **draft** is assembled from the rows on every request (`ContentVersion`):
`version = { version: the server's app version, timestamp: now, hash, schema: the experience's schema }`, then `experience`,
`initialScene`, `scenes`, `groups` (when there are any), `entries` with their targets, `entities` – content schema 3.0,
the same keys in the same order as the content build writes them, so import → draft reproduces the configuration
unchanged (the API test checks it). An import takes a configuration of content schema 3.x only (`Editor::CONTENT_SCHEMA`;
2.x → 400 `invalid-configuration`; every stored experience was migrated to 3.0
on staging, #319 – a 2.x experience left in a database answers 409 `old-schema`). The hash is the sha256 of that JSON without `timestamp` and `hash`; the build name is its first 12 hex digits,
so the same rows are the same version. With an `assets_base`, every `/assets/content/…` under `src`, `imageSrc` and
`image`, and every key of `files.json`, becomes a URL below it: a published version points at the
imported build's media on the CDN and copies nothing. `PUT …/entities/{ref}` and `PUT …/targets/{id}` change one
entity and record before and after with the user in `changes`. Every save that changes a row from its current value
(`PUT …/targets/{id}`, `…/scenes/{id}`, `…/environment`, `…/passes`, `…/appearance`, `…/entities/{ref}`, an asset's replace) reads,
changes and writes it in one transaction with the row locked (`SELECT … FOR UPDATE` on MySQL, `BEGIN IMMEDIATE` on
SQLite – `Db::transaction`, `Db::forUpdate`), so two saves at the same moment never lose one's change. **Publish** writes the same assembly to the content
store as a version of the experience in the environment (`local`, `staging`, `production`) – into the experience's own
store there (#87), with the osct CLI's bookkeeping (`versions.json`, `latest.json` last – [content-cdn](content-cdn.md)),
so the reader of that environment sees it at its next start and `osct content purge` understands what the editor
wrote. Each experience has its own store, so a publish never replaces another experience; any experience can publish
to staging and production. `latest.json` and the `versions.json` entry name the experience (`experience`); where an
experience is live is read from its stores (`ContentStore::live`).

**The content store** (`ContentStore::for(env, experience)`): `CONTENT_STORE=local` keeps the versions in the content
store's folder ([Content store and var](#content-store-and-var)), `<env>/<experience>/…`, and
`GET /api/content/{env}/{experience}/{path}` serves their json files (version folders immutable, `latest.json`
revalidated) – for development, and for a host without the CDN; a reader of such an instance is built with
`VITE_CONTENT_BASE_URL=<site>/api/content/<env>`. `CONTENT_STORE=bunny` sends every environment but `local` to the
storage zone over the Storage API (`PUT https://{endpoint}/{zone}/{title}/{env}/{experience}/{path}` with the `AccessKey` header and the sha256
checksum – what `scripts/src/lib/storage.ts` does), reads `versions.json` from there, and answers 502
`content-store-failed` when the zone refuses. The environment `local` always stays in the directory – it exists only
on a developer's machine.

### Export

**The export archive** (#322, `ExportArchive`): after every publish the API writes the export of the published build into
the experience's store, `exports/<build>/` (docs/content-cdn.md "The export archive", docs/content.md "Export archive") –
the answer below for that version (`Export::ofPublish`, without `publishedBy`), turned into the content source's YAML
the way `osct content export` does, with `export.json` naming the media by URL instead of copying them.

`GET /editor/experiences/{id}/export[?build=<build>]` (#322, `Export`) is the one read an export of the experience needs –
the input of `osct content export`, which writes the content source folder from the database
(agents/research/2026-11-20-importer-export-plan.md, section 3). Nothing is zipped or copied on the host: the answer names
the files, the CLI downloads them. Rights: those of the draft (an editor). Typed as `ExperienceExport` in `shared/api/editor.ts`.

- `configuration` – without `build` the draft, from the same assembly as the draft endpoints and Publish
  (`ContentVersion::assemble`); with `build` the published version as the content store holds it (`<env>/<build>/game.config.json`
  of the environment the publish log names for that build of this experience). `source` says which:
  `{ kind: "draft" }` or `{ kind: "published", env, publishedAt, publishedBy }`; `build`, `hash`, `schema` are the version's.
- `files` – every file the configuration names, once each, in the order it names them, then the print layout's:
  `{ url, path, origin, size, sha256, v }`. `url` is the value as the configuration holds it (below the assets base, a
  Library URL, or a content path without one); `path` the content path (`/assets/content/…`, null for a Library upload).
  `origin`: `upload` – a Library file, size and the full `sha256` from its asset row (any of its versions);
  `import` – a file of the imported build, size and `v` (the first 12 hex digits of its sha256) from the import's
  `files.json`, `sha256` null – it is not recorded; `version` – a Code tab plugin a publish put into the version's own
  folder (#78), its URL in that environment, nothing else known; `unknown` – a value that looks like a file (a URL or
  content path with a media, json, js or vtt extension) and is none of these. `unknown` counts those. A link (`media` of
  a link entry) is no file.
- `layout` – the print layout, `{ file, files }` (the URLs of `layout/layout.json` and every file of `layout/`, all in
  `files` too) when the import's `files.json` holds `layout/layout.json`, else null. The reader's card back reads its
  `cover-front` sheet (`client/src/utils/book-cover.ts`), so the export writes `layout/`.
- `plugins` – the Code tab's sources (`PluginSource`: id, source, size, updatedAt, updatedBy) – always the current ones,
  also for a published build: the database keeps no source per version.
- `credits` – every credit line of the Library by file URL (#277); the configuration's own `credits` carries only those of
  the files it uses.

### Export file

`GET /editor/experiences/{id}/export/file[?build=]` (#348, `Export::file`, the editor sheet's *Export*) answers the experience
as one JSON file to download (`Content-Disposition: attachment; filename="<id>-<build>.osct.json"`): `{ format: "osct-export",
formatVersion: 2, experience, title, build, appVersion, exportedAt, source, configuration, files, assetsBase?, sources }` – the
draft (`ContentVersion::assemble`, its paths below the assets base as the draft endpoints give them) or a published build
(`data`, with its version folder as `assetsBase`: its plugins' modules are content paths there), its `files.json` and the Code
tab's plugins `[{ id, files: [{ name, text }] }]` (formatVersion 2, #352 – the editor's Import reads a file of format 1,
`{ id, source }`, as a plugin of one `index.ts`). **It is an import body as it is**: `POST …/import` (and the editor's Import → File) takes
`configuration`, `files`, `assetsBase` and `sources` from it – with `rename` under another id, so an export becomes a new
experience or replaces another's draft. The media are not in it: the configuration names them by URL, so the file stays small
and the import points at the same files (a file deleted from the CDN since is gone for the import too). Typed as `ExportDownload`
in `shared/api/editor.ts`. The round trip (export, import as another id: the same configuration but its id, the sources) is
in the API test.

### Make a version live again

`POST /editor/experiences/{id}/versions/{build}/activate` (#348, `Versions::activate`, the sheet's *make live*, the MCP's
`activate_version`): `{build}` – a build the publish log names for this experience in **this instance's environment** (`ENV`) –
is what readers get again, on their next start. Builds are immutable and stay in the store (a publish never deletes one; only
`osct content purge` does, by hand), so the switch is the publish's own: `versions.json` (`ContentStore::activate` – the
previous current version retired, this build current again from now), then `latest.json`, and a row in the publish log with
the note `Made live again – the version of <its first publish>` and who did it. The draft is not touched. 404 `unknown-build`
(not in this environment's publish log); 409 `already-live`, `publish-running` (a publish of the experience is writing – its
`job`), `build-missing` (the store no longer has its `game.config.json` – purged; nothing switched), `unreadable-schema` (a
content schema MAJOR today's reader cannot read); 403 `not-for-ai` – readers are reached only by a person, as with Publish.

### Recent places

`GET /editor/recent?limit=` (#348, `Versions::recent`, the experiences page's *Last worked on*): the newest rows of the change
log across the instance's experiences, newest first, each with `experienceTitle` and the **scene** it is on – a scene's own
change (and its reference images', ref `<scene>/<surface>`), an entry's, a target's entry's – with `sceneLabel` and, for an
entry or a target, the entry's title (`entry`); null for what is no scene's (the experience's settings, a plugin, a file, a
shared entity) and for a scene deleted since. `user`, `token` (an AI connection's name) and `at` as in the change log. The
editor keeps one row per experience and scene.

### Publish jobs

A publish of a big experience writes for minutes (the osct book: 1529 files, mostly its export archive – [Content and
CDN](content-cdn.md) "How a publish writes"); no gateway waits that long, and an answer that never comes (504) must not
stand for a publish that runs on (#345, Tilman 2026-11-22). So `POST …/publish` checks the draft as before (every 4xx
stays an answer of the POST), then writes what it will write into a row of **`publish_jobs`** (`plan_json`: the version
folder's files, the export archive's files; emptied when the job ends) and runs it for at most **`PUBLISH_STEP_SECONDS`**
(15) – done in that time, it answers 200 with the outcome as before (a small experience, the tests); else 202 `{ job }`.
What runs the rest depends on the host, and both are plain PHP – no queue, no daemon, no cron:

- **PHP-FPM** (staging's FTPS host): `fastcgi_finish_request()` sends the 202, the same request writes on with
  `ignore_user_abort(true)` and no time limit. The gateway has its answer within the step.
- **Apache mod_php** (the Docker image), the built-in server: nothing runs after an answer, so every **poll**
  (`GET …/publish/{job}`) writes the next `PUBLISH_STEP_SECONDS` and answers the progress; the editor polls every 1.5 s.

One runner at a time: a run takes a lease (`lease_until`, 90 s, renewed after every slice of 32 files) and a poll that
finds it taken only reads. A runner that dies (an FPM worker killed by `request_terminate_timeout`, a closed editor on
mod_php) leaves the lease to run out; the next poll goes on from the last saved slice. Each step is safe to repeat: a
file written twice is the same file, the switch writes the same `latest.json`. A job no one moved for 2 minutes gives way
to the next publish of the experience (`failed`, `abandoned`); that publish writes what it left (the archive's listing
skips what is there). Failures: in the version folder or the switch the job fails with the store's error (502
`content-store-failed` – nothing went live, or the switch is repeated by the next publish); in the archive the publish
stands and `export.error` says why (as before). The editor (`editor/src/lib/publish-job.ts`) shows the phase and done /
total, the real outcome, and after a gateway error on the POST it looks for the experience's new job
(`GET …/publish`) instead of reporting a failure; the MCP's `publish` waits up to 90 s, then `publish_status` follows.

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
`local` appears only where `ENV` is local; the experience list reads what is live on the instance's environments the same way.

### New experiences

`POST /editor/experiences { id, title }` (#343, the editor's *New experience*, the MCP's `create_experience`) makes an
empty experience: its draft holds one scene (`scene-1`, the *double* preset, `New scene`) and nothing on it, no import
record. **The id is its slug** – one identifier for its reader address `https://<instance>/<id>/`, its content store's
folder (`<title>/<env>/<id>/`) and the editor's `/editor/<id>/`: lower-case letters, digits and dashes, a letter or digit
first, at most 64 (`Experiences::SLUG`, `shared/api/experience-paths.ts` `EXPERIENCE_SLUG`). It is chosen once – there is
no rename: once the experience is published, printed QR codes and shared links depend on it.

The site's own top-level paths are never an experience's id (`Experiences::RESERVED` = `RESERVED_PATHS` in
`shared/api/experience-paths.ts`, compared lower-case; `mcp/test/php-rules.test.ts` pins the copy): the reader's routes
(`scene`, `entry`, `entries`, `tutorial`, `about`, `info`, `credits`, …), `x` (the old prefix), `editor`, `admin`, `api`,
`docs`, `mcp`, `assets`, the service worker and manifest files, the dev server's paths and a few kept free. A new
experience by import is checked the same way (400 `reserved-slug`); an import keeps the wider id rule otherwise
(capitals, `_` – experiences imported before #343).

### Import preview

Before anything is imported, the editor and the MCP server ask what an import would bring in:
`POST /editor/import/preview` takes the import's body – a configuration (with `files`, `assetsBase`) or
`{ source: "cdn", experience? }` – checks it as the import does (the same 400s) and writes nothing. For the CDN it
reads the experience's store below the instance's content base (`CONTENT_BASE_URL/<experience>`; `experience` defaults
to the instance's `EXPERIENCE` – none of either: 400 `invalid-experience`), its `latest.json` and the current build's
`game.config.json`, as the import will (the import of `{id}` with `source: "cdn"` reads `{id}`'s store). The answer:

- `source` – `cdn` or `configuration`; `contentBase` and `manifest` `{ url, build, activatedAt }` – the content base and
  what its `latest.json` says (null for a configuration: a form that read a content base itself fills them in);
- `incoming` – as in the comparison below (`experience`, `title`, `build`, `hash`, `date`, `appVersion`, `schema`, `source`,
  `from`); the experience's id comes from the configuration (`experience.id`), so the CDN needs no id from the person;
- `counts` `{ scenes, entries, targets, entities, plugins? }` (`plugins`: the Code tab sources the body carries);
- `existing` – the comparison the import would answer for the draft of that id (below, without a confirmation), null
  for a new experience.

A content base that cannot be read, or whose `latest.json` names no build, answers 502 `content-fetch-failed` with the
`url` that failed; anything else that goes wrong while reading the CDN answers 502 `content-fetch-failed` with what failed
(the error log has where) – never the bare `server-error` (#348). The import itself does not depend on a preview: it reads the source again, and over an experience that
exists its own comparison and confirmation decide.

### Import with a version comparison

An import replaces the experience's draft. Over an experience that exists it takes **two steps**, for the editor and the MCP server
alike (the shared [confirmation](#confirmations), as a removal's):

1. **Compare.** The import without `confirm` writes nothing and answers 409 `confirm-import` with `comparison` –
   `experience` `{ id, title }`; `incoming` `{ experience, title, build, hash, date, appVersion, schema, source, from }` (the build is
   the content checksum's first 12 digits, `date` and `appVersion` the configuration's `version.timestamp` /
   `version.version`); `draft` `{ basedOn, build, edits, editsSince, recentEdits, live }` – what the draft is based on
   (the same fields plus `importedAt`, `importedBy`; recorded in `experiences.imported_json` by every import, null for an experience
   imported before that column existed), its edits since that import (the change log after it: their number and the newest ten `{ kind, ref, user,
   token, at }`), its build now and where it is live (`current` = that environment serves the draft as it is); `same` =
   the same build comes in; `counts` `{ incoming, draft, sourcesReplaced }` (#348) – scenes, entries, targets, shared entities
   and Code tab sources each side (the incoming side's sources: the draft's after the import – it keeps its own and adds or
   replaces those the body carries) and the ids whose code the import replaces – and `confirmation` `{ id, expiresAt }`.
2. **Confirm.** The same import with `confirm: <id>` replaces the draft. The id lasts 10 minutes and is bound to the
   person (and the AI connection), the incoming content and the draft as it was compared (its import, its last change,
   its rows' state): anything that changed meanwhile, another person, or an expired id answer 409 `confirmation-void`
   with a new comparison and id. An import changes what the draft is based on, so an id works once.

An experience that does not exist yet is imported at once.

### Confirmations

A request that replaces or removes content – an import over an experience that exists, removing a scene or an entry –
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
by its URL (`api.loadText`, [plugins](plugins.md) "A shader file"). **Subtitles** (vtt – the kind `subtitles`, #257) are
text too, checked and limited like a shader and served as `text/vtt`: a file named `<video name>.<language>.vtt` belongs
to every video of that name in the experience, uploaded or imported, and the draft and a publish list it in the
configuration's `subtitles` (`Subtitles`, [content](content.md) "Subtitles of a video"). A script (`.ts`, `.js`) is no asset: it is a
plugin source ("Plugin sources" – the 400 says so). They live in the content store under the pseudo environment `assets`:
`assets/<experience>/<asset id>/v<n>.<ext>` – in the content store's folder for the local store, served (for every experience id the
editor accepts, capitals and `_` included) by `GET /content/assets/…` with the file's type, a year's cache and `Access-Control-Allow-Origin: *` (the reader's
engine loads them cross-origin), or in the CDN's storage zone (`CONTENT_STORE=bunny`, reached at
`<root>/assets/…`, at the zone root – `CONTENT_BASE_URL` = `<root>/<title>/<env>`; the uploads are no title's and no
environment's, #87). `ASSET_BASE_URL` overrides where their URLs point. The local store's URLs are this API's
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
reading its version to the new version's rows, so two replaces at once take two version numbers.

**Credits** (#277): every file the Library lists – uploaded or imported – may carry one free text line of picture
credits, as the book prints them. `asset_credits` keeps it per experience and file **URL** (an imported file has no `assets`
row), `GET …/assets` lists it as `credits` (null: none), `PUT /editor/experiences/{id}/assets/credits { items: [{ url,
credits }] }` sets up to `CREDITS_BATCH_MAX` (500) at once – white space folded, at most `CREDITS_MAX` (1000)
characters, empty or null removes the line; a URL the Library does not list refuses the whole request (400
`invalid-credits`). A replace leaves the line on the old URL (the new version may be another picture). Saving credits
writes no change in the experience's log; an AI connection's token may set them. The experience's configuration carries the lines
of the files it uses (`credits`, content schema 2.33, #292 – `ContentVersion::credits`), so an edited line is in the
draft at once and reaches readers with the next publish. A delete removes the
rows in one transaction with a change in the experience's log (kind `asset`, `before` = the asset with its versions – as a
[removal](#removing-a-scene-or-an-entry) records the files it takes), so a forced delete is in the history; the files
go after the commit.

### What counts as a use

One function lists every use of every Library file (#298 phase 2, `AssetNames::usesOf`): the Library's count
(`usages`) and its `place`, the usages endpoint, the delete check (409 `asset-in-use`), a removal's files
(`Removal`) and the names plan all read it, so they can never disagree. It reads every table once (an experience has ~2,000
files). A row's JSON uses a file when one of its strings **is** the file's URL – or, for an imported file, its content
path `/assets/content/…`; a plugin source when its text **contains** it. The kinds (`{ kind, ref }`):

| kind | ref | the use |
|---|---|---|
| `target` | the target's id | its printed image (`imageSrc`), a file of its own inline entity |
| `entry` | the entry's id | its colour picture (`image`), any other file it names |
| `entity` | the shared entity's ref | a file of the shared entity |
| `scene` | the scene's id | a scene's own data – its passes naming a file (placed on the scene) |
| `reference` | `<scene>/<surface>` | a surface's reference image (#314) – only while its scene has that surface; placed on the scene |
| `environment` | the experience | the experience's environment: its world model or sky |
| `experience` | the experience | any other setting of the experience – appearance, passes with a texture or model parameter … |
| `plugin` | the source's id | a plugin source naming the URL as text (a shader it loads) |
| `layout` | `layout.json` | a file of the print layout's folder (`layout/sheets/*.jpg`, `*@sharp.jpg`): the editor's stage and cards read them through `layout/layout.json`, never through a row – each file below `/assets/content/layout/` counts as used whenever the experience's files (`files.json`) hold `layout/layout.json` (it is not read: the sheets it lists are the folder's) |

A file's uses come in the scenes' order (per scene: target, entry, entity, scene, reference), the experience-wide ones last
(environment, experience, plugin, layout). Only `target`, `entry`, `entity`, `reference`, `environment` and `plugin` give a
name ("Files named by use"); a file only a scene, an experience setting or the layout uses counts as used and keeps its name. A replaced file's references follow its new version (a change each); a forced delete takes them.
An imported file is read-only (no delete); its count tells the Library it is in use.

### Files named by use

A Library file's **name** follows where it is used (#298 phase 3, `AssetNames.php`) – the name only: its URL never
changes, so no use breaks and nothing needs relinking (`Assets::replace`'s relinking is not needed: no row names a file
by its name).

- **By use**: an entry's target image `<entry>_target.<ext>`, its colour picture `<entry>_image.<ext>`, another file of
  the entry or of its target's own entity `<entry>_<asset id>.<ext>` (a model's texture map adds its size:
  `key_model-1024.webp`); a surface's reference image (#314) `<scene>_<surface>` (`s118-119_surface`); a shared
  entity's file `<ref>_<asset id>.<ext>`; the environment's `environment_world` / `environment_sky`. The extension is
  the stored file's. An **upload** among the entry's, entity's or shared entity's files keeps **its own name** after the
  place instead of the asset id (Tilman, 2026-11-17): `fight_2_remesh_4096.jpg` → `p010-3_fight-2-remesh-4096.jpg`
  (lower case, words joined by `-`, a place prefix it already has is not doubled – a second plan changes nothing).
- **First use**: a file used in several places takes its first use in the scenes' order (per scene the target before
  the entry, the entity, the reference); a shared entity sits on the scene of its first target; uses without a scene
  (the environment, plugins, an entity no target shows) come last. Files only a plugin's source names, and unused files,
  keep their names. Two files that would take one name get `-2`, `-3` in that order.
- `GET …/assets` lists each file's **`place`**: `{ scene, order, more }` of its first use (`scene` null: experience-wide,
  `order` −1, else the scene's position; `more` = its further uses) or null when unused – the Library groups by it.

| Endpoint | Body | Answer |
|---|---|---|
| `POST /editor/experiences/{id}/assets/names` | `{ apply? }` | `{ plan: { renames, files, used, unused }, applied }` – two steps: without `apply: true` nothing is written; `renames` lists every file whose name changes, `{ id, url, imported, from, to, use: { kind, ref, scene }, more }`. With it the plan is made again and written in one transaction |
| `PUT /editor/experiences/{id}/assets/{assetId}` | `{ name }` | `{ asset: { id, url, name, imported }, changed }` – one file's name by hand (#330, the Library's rename): an upload (uuid) or an imported file (`import-…`, kept in `asset_names`). White space folded; no slash, backslash or control character; not empty; at most 255 characters; the stored file's extension stays (added when the name lacks it – `castle` → `castle.glb`; typed in any case it stays as typed) – else 400 `invalid-name`. The URL and every use stay (`AssetNames::rename`, `cleanName`) |

**Imported files** (#244: no `assets` row, read-only – their URL is the content build's): their **listed** name is
kept in `asset_names` (experience, URL → name, like `asset_credits`), so the Library is consistent; the list marks such a
file `named: true`. The stored file and its URL stay the build's. Names are no content: no change in the experience's log, no
publish needed; an AI connection's token may apply them.

**New uploads** whose use is known take its name at once (`AssetNames::uploadStem`): `POST …/assets?fit=target&entry=<id>`
→ `<id>_target.webp`, `?fit=entryImage&entry=<id>` → `<id>_image.webp`, `?fit=reference&scene=<id>&surface=<id>` →
`<scene>_<surface>.webp` (a surface the experience does not have is 400 `invalid-use`). A replace takes the same parameters.
The editor sends them from an entry's picture, a target's printed image and a surface's reference image; the MCP server
from `upload_asset` (`entry`, `scene` + `surface`).

### The image rule at upload

Every picture takes one way into the experience (#298, [content](content.md) "The image rule"): an uploaded or replaced
**jpg, png or webp** is decoded, turned upright by its EXIF orientation, scaled down to the longest side of its use and
encoded as **WebP** (`Images.php`, the numbers `Assets::IMAGE_*` = `shared/api/images.ts`, pinned by
`mcp/test/php-rules.test.ts`): quality 82, lossless when the picture has transparency (an icon, a cut-out), never
scaled up; re-encoding drops every piece of metadata (EXIF, XMP, ICC). The stored file is `v<n>.webp` with
`image/webp`, its width, height, size and sha256 those of the result; its Library name is the upload's with `.webp`
(`Dot.png` → `Dot.webp`, `Assets::storedName`) – or, where the upload names its use, the use's name ("Files named by use"
above). The original is not kept.

- **The use** (`?fit=`): the upload does not know what a picture is for, so it keeps at most 2048 px
  (`default`). Where the use is known, the caller names it: `?fit=target` (a target's printed image, 1200 px – the
  editor's target image field and the target picker's upload, the MCP server's `upload_asset fit: "target"`),
  `?fit=reference` (a surface's reference image, 2048 px), `?fit=entryImage` (an entry's picture,
  2048 px). An unknown fit is 400 `invalid-fit`. A replace takes the same `?fit=`.
- **Duplicates** go by the stored bytes – the result: the same picture uploaded twice for the same use converts to the
  same WebP and is one asset (GD's encoder is deterministic). The same picture for another use (a target at 1200 px, a
  picture at 2048 px) is another file, so another asset. Files stored before the rule keep their sha256, so a new upload
  of such an original is a new, converted asset (phase 2 re-encodes the old ones).
- **Limits**: `ASSET_MAX_BYTES` (64 MB) as for every file, and a picture above `IMAGE_MAX_PIXELS` (50 MP) is refused
  from its header before anything decodes it – 413 `image-too-large` (a conversion may take up to 768 MB of memory
  for a 50 MP picture; the API raises `memory_limit` for it). TIFF and PDF are no Library files: the import scripts
  convert them locally first (Pillow / PyMuPDF).
- **Stored as it came** (`converted: false` in the answer, never an error): an instance whose PHP has no GD with WebP,
  a file GD cannot read, an animated PNG or WebP (GD would keep its first frame only), and a WebP that already keeps the
  rule (no scaling, no orientation – a second lossy pass would only cost quality).
- **Where the rule runs**: the editor converts in the browser before it uploads ([editor](editor.md) "Library",
  `browser-webp.ts`), so its uploads arrive as a WebP within the size and pass here unchanged – also on an instance
  without GD (the shared FTPS host of staging). This conversion is the **fallback**: the MCP server, scripts, and a
  browser that cannot decode or encode the picture send the file as it is, and it is converted here where GD allows.

**GD with WebP** is in the image (Dockerfile: `libwebp-dev libjpeg62-turbo-dev libpng-dev`, `docker-php-ext-configure
gd --with-webp --with-jpeg`, `docker-php-ext-install gd`). A local PHP for Windows ships `php_gd.dll`; enable it in
php.ini (`extension=gd`) for the conversion. The API test checks the conversion only where its API's PHP has GD with
WebP, and says so otherwise: `OSCT_TEST_PHP_ARGS="-d extension=gd" php server/tests/api-test.php` loads it for the
test's API without changing php.ini.

An upload or a replace reads the file's own numbers: an image's width and height (its header), a video's width, height
and duration (`VideoInfo.php`, plain PHP, no ffmpeg): mp4 / mov from `moov › mvhd` (duration, timescale) and the video
track's `trak › tkhd` (its size, turned when the track's matrix turns it a quarter – a phone's portrait video), webm / mkv
from the EBML `Segment › Info` (`Duration`, `TimecodeScale`) and `Tracks › the video TrackEntry › Video` (`PixelWidth`,
`PixelHeight`). Only the headers are read; a file that does not tell answers `null`, never an error. Rows uploaded before
the column existed stay `null` until their file is replaced.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/experiences/{id}/assets[?kind=]` | | `{ assets: [{ id, name, kind, mime, size, width, height, durationMs, version, url, usages, imported, sha256, createdAt, updatedAt }] }` – `sha256` = the stored file's (what an upload is deduplicated by; null for an imported file); `width` / `height` in pixels (images, videos), `durationMs` (videos), null when unknown; `usages` = the file's uses ("What counts as a use"); the uploads first, then the files of the import's `files.json` (`imported: true`, id `import-<hash>`, read-only: no replace, usages or delete; `url` below the assets base, the rows name it by its content path `/assets/content/…`, the uses know both) |
| `POST /editor/experiences/{id}/assets[?fit=]` | the file; `X-File-Name: name.ext` | 201 `{ asset, converted }`, or 200 with the asset that already holds these bytes – it takes this upload's name; its file, URL, version and uses stay. A picture is stored under the image rule (`converted: true` – WebP, `<name>.webp`; [The image rule at upload](#the-image-rule-at-upload)). 400 `invalid-file` (no name, unsupported type, empty, a shader that is no text), 400 `invalid-fit`, 413 `body-too-large` (a shader above 256 KB), 413 `image-too-large` (above 50 MP) |
| `PUT /editor/experiences/{id}/assets/{aid}/file[?fit=]` | the file (`X-File-Name` optional, the kind must stay) | `{ asset, relinked, converted }` – a picture under the image rule as at upload; a new version at a new path (`v2.ext`: nothing to purge on a CDN); every target, entity and entry naming the old URL now names the new one, and the experience's environment (`worldSrc`, `skySrc`), and every plugin source that names it (a shader it loads – the URL replaced in its text) (a change each) |
| `GET /editor/experiences/{id}/assets/{aid}/usages` | | `{ usages: [{ kind: target | entry | entity | scene | reference | environment | experience | plugin, ref }], asset }` in the scenes' order ("What counts as a use"; `asset` as the list has it) |
| `DELETE /editor/experiences/{id}/assets/{aid}[?force=1]` | | 204; 409 `asset-in-use` with `usages` unless forced (the files of every version go; a change `asset` in the log) |

Renditions (1x / 2x / 3x, 480p / 720p / 1080p) and transcoding stay with the content build (PLAN 2b).

## Plugin sources

The editor's **Code** tab ([editor](editor.md)) keeps the code of an experience's plugins in the `plugins` table
(`Plugins.php`): one row per plugin id (`experience_id`, `id`, `source` – its `index.ts` –, `files_json` – its other files
`[{ name, text }]` –, `origin_json` – the folder a push linked it to –, who, when). A plugin is a **folder of files** (#352):
the API answers them together as `files`, the entry first; at most 256 KB a file, 1 MB together, 32 files, names of
letters, digits, `.`, `_`, `-` ending in `.ts`, `.frag`, `.vert`, `.glsl` or `.wgsl` (`Plugins::checkFiles`, the same rule
as `shared/types/plugins.ts` `pluginFilesProblems`). Every save is a change (`kind: plugin`, the files before and after).
What a plugin registers and which Library URLs it names is read from all its files (`Plugins::texts`). The editor transpiles and runs them on its own stage (in its page,
with the person's session – `updatedBy`, who saved a source last, is what the editor's plugin guard asks about, #340). The compiled plugins an experience has come in with the
import – the configuration's `plugins` list (content schema 2.4: `{ id, src, api }`, 2.14: `registered`, what each
plugin registered – written by the content build only) is kept in `experiences.plugins_json` and assembled back after
`tutorial`, its `src` below the assets base like every other content path. What the compiled plugins register is
known when every one of them recorded it (`Editor::recorded`; no plugins: nothing). Then a publish whose nodes use a
component type that is neither built in (`Editor::COMPONENT_TYPES`) nor recorded answers 409 `unknown-components` with
the types – the reader would refuse such content as a whole; a plugin of an older build (nothing recorded) may register
anything, so nothing is refused. The same for a plugin's **node type** (content schema 2.13): an entity body (a save,
the import) may name a type outside `Editor::ENTITY_TYPES` when a plugin of the experience registers it
(`Editor::pluginNodeTypes`): the declared plugins' recorded node types – any other name is a typo, 400
`invalid-entity` naming them; while a plugin of the experience is unknown until it runs – a source in the Code tab (never
built here, so nothing is recorded) or a declared plugin of an older build – any name like one passes
(`Editor::PLUGIN_NODE_TYPE`: camelCase, at most 32 characters; the stage and the content build run the code); without
plugins it is 400 `invalid-entity`. A publish whose nodes have types no declared plugin recorded answers 409
`unknown-node-types` with `nodeTypes`. A node's **material** (content schema 2.17) is always a plugin's: `{ type, params? }`
with a camelCase type (`Editor::MATERIAL_TYPE`), checked against the declared plugins' recorded materials the same way
(`Editor::pluginMaterials` – a typo is 400 `invalid-entity` naming them, any name passes while a plugin is unknown, none
without plugins); a publish whose nodes use a material no declared plugin recorded answers 409 `unknown-materials` with
`materials`. A plugin's `registered` may hold `materials` and `textures` next to the other kinds. A **pass** of the
experience's or a scene's `passes` (content schema 2.21, #216) is a built-in one (`Experiences::PASS_TYPES`) or one the declared
plugins recorded the same way (`Editor::pluginTypesOfExperience($experienceId, 'passes')` – a typo is 400 naming them, any camelCase
name passes while a plugin is unknown, `Experiences::PLUGIN_PASS_TYPE`; none without plugins); a publish whose passes name one no
declared plugin recorded answers 409 `unknown-passes` with `passes`. A **look** of the experience's `appearance` (content schema
2.29, #265) is checked the same way: a built-in one (`Experiences::APPEARANCE_TYPES`) or one the declared plugins recorded
(`registered.appearances`, `Editor::pluginTypesOfExperience($experienceId, 'appearances')`), any camelCase name while a plugin is
unknown; a publish whose appearance names a look no declared plugin recorded answers 409 `unknown-appearances` with
`appearances`. A Code tab source's `registerAppearance` is read from its text like the other kinds, so a source whose look
the experience names is in use. The **card look** `appearance.card` (content schema 6.3, #361) the same way against its own
lists: a built-in one (`Experiences::CARD_LOOK_TYPES`) or one the declared plugins recorded (`registered.cardLooks`,
`registerCardLook` in a source); a publish whose card look no declared plugin recorded answers 409 `unknown-card-looks` with
`cardLooks`.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/experiences/{id}/plugins` | | `{ plugins: [{ id, size, fileCount, origin, usages, updatedAt, updatedBy }] }` – `size` the files' bytes together; `origin` `{ folder, by, at }` when linked, else null; `usages`: the draft's rows that use what it registers (below) |
| `GET /editor/experiences/{id}/plugins/{pid}` | | `{ plugin: { id, files: [{ name, text }], size, updatedAt, updatedBy, origin } }`; 404 |
| `PUT /editor/experiences/{id}/plugins/{pid}` | `{ files }` or `{ source }`, `origin?` | `{ plugin }` – new or changed: `files` every file (one left out is gone), `source` a plugin of one file (`index.ts`); `origin` `{ folder }` links it (`osct plugin push` – the folder's name is kept, who and when are this save's), `null` unlinks, absent keeps the link. 400 `invalid-plugin` (the id is 1–40 lower-case letters, digits or `-`; no `index.ts`, a bad or doubled name, more than 32 files, a text that is no string), 413 `body-too-large` (a file above 256 KB, the files above 1 MB) |
| `POST /editor/experiences/{id}/plugins[?id=]` | a script file; `X-File-Name: name.ts` or `.js` | 201 `{ plugin }` – a new plugin of one file (its `index.ts`), its id `?id=` or the file's name (`Wobble Effect.ts` → `wobble-effect`), a byte order mark dropped. 400 `invalid-file` (not .ts / .js – a shader points to the assets –, empty, no text: checked like a shader), 400 `invalid-plugin` (the name gives no id), 409 `plugin-exists` (`plugin`: the id), 413 above 256 KB |
| `PUT /editor/experiences/{id}/plugins/{pid}/file` | a script file (`X-File-Name` optional) | `{ plugin }` – its new source (a change recorded); 404, 400 / 413 as above |
| `GET /editor/experiences/{id}/plugins/{pid}/usages` | | `{ usages: [{ kind: experience | scene | target | entity | entry, ref }], registers: { components, layers, nodeTypes, passes, materials, textures } }` |
| `DELETE /editor/experiences/{id}/plugins/{pid}[?force=1]` | | 204; 409 `plugin-in-use` with `usages` unless forced |

**The Library's scripts** (#186) are these rows: the editor's Library lists them beside the shader assets and uploads a
script file with `POST …/plugins`. A source is **used** where the draft names a type it registers – the types read from
its text as the MCP server reads them (`api.registerComponent("spin", …)` and the five other functions; the content build
is what knows for sure): a row of the experience (its master passes), a scene, a target, a shared entity or an entry whose
JSON holds `"type":"<type>"` (a component, layer, node type, pass or material) or a procedural texture's type as a value.

### Targets and entries made in the editor

`PUT /editor/experiences/{id}/targets/{tid}` also takes `{ imageSrc }` (the printed image – an asset's URL), `{ place }`
(`TargetPlace`, content schema 3.0: `{ surface?, x, y, width, height? }` in mm from the top left corner of a surface of
its entry's scene – `surface` by id, required when the scene has several; `null` removes it – the editor's stage lays
the target there) and `{ enabled }` (#249: `false` switches the target off, the reader leaves it and its entry out;
`true` removes the field, on is the default) and `{ recognition }` (#306: `{ imageSrc, width, height }` – the grey recognition
frame made ahead, [content](content.md) "Recognition"; `null` removes it; with `madeFrom` – the image it was made from – 409
`stale-image` when the target has another image by now) and `{ recognitionOff }` (#306, schema 4.2: `true` – the target always
uses its printed image, even when the experience says prepared; `false` removes the field). A new `imageSrc` drops `recognition` unless the same body sets it,
and so does a replace of the image's Library file (the relink). 400 `invalid-target` (a 2.x `print` too). `POST /editor/experiences/{id}/entries`
`{ title, scene, surface?, category?, body?, caption?, target?: { id?, imageSrc, place?, entity?, enabled? } }` → 201
`{ entry, scene }` makes an entry (id from its scene and title, `s102-103-shadows`, or the given one; 409
`duplicate-id`) on its scene (and surface) with its target – or without one (no `target`): an entry read only in the
list, a glossary term or a text ([Texts](#texts)). 400 `invalid-entry` (no scene, a surface the scene does not have, a
place without its surface on a scene of several), `unknown-scene`. `DELETE /editor/experiences/{id}/entries/{eid}` removes the
entry with its target and the entity used only there, in two steps ([Removing a scene or an entry](#removing-a-scene-or-an-entry)).
The reader tracks such a target after a publish: the 8th Wall engine makes the image-target data from `imageSrc` at
runtime (`engine/src/scene/xr8.ts`).

### Texts

The reading side of an experience (#223, `ExperienceTexts.php`): an entry's fields and the experience's texts. Every write reads the row,
changes it and writes it back in one transaction with the row locked (`Db::forUpdate()`, #209), touches the experience and
records a change with the row before and after (`kind` `entry`, `experience`). The onboarding is no part of it – it is the
reader's own (#236). An AI connection's
token writes here like its person – these are the experience's texts, not the account (RULES #33 is about the account);
publishing stays the person's. The checks are the content build's: the categories, a title and a scene, a link that is
http(s) – and a picture of the experience's Library.

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/experiences/{id}/entries` | | `{ entries: [{ …EntryData without its target (its `scene`, its `surface`), target: { id, imageSrc } \| null }] }` – every entry in the experience's order, each field as written (an imported picture's `/assets/content/…` path unresolved) |
| `PUT /editor/experiences/{id}/entries/{eid}` | `{ title?, body?, author?, image?, caption?, media?, tags?, category?, scene?, surface? }` | `{ entry, scene, previousScene }` – the fields sent change; `null` removes `author`, `image`, `caption`, `media` or `surface`. `title`, `author` and `caption` (the line under the picture, #289) are trimmed (`title` not empty, at most 500 characters), `body` is Markdown kept as written (at most 100 000 characters – `docs/content.md` "The text: Markdown and variables"; the API does not judge its braces), `tags` a list of words (trimmed, each once, the empty ones left out; at most 32 of 64 characters), `category` one of the contract's, `media` an http(s) URL with a host, `image` the URL of an uploaded image or a file of the import (its path or its URL below the assets base) – or the value the entry has. `scene` moves the entry to that scene (never `null` – an entry always has one; 400 `unknown-scene`), `surface` puts it on one of its scene's surfaces (400 for a surface the scene does not have); a surface kept from before goes when the new scene has none of that id. Its target stays as it is (the draft leaves out a place whose surface the scene does not have). 400 `invalid-entry` (an unknown field too – `page` among them), 404 |
| `PUT /editor/experiences/{id}` | `{ title?, book?: { author?, publisher? } \| null, recognition?: "original" \| "prepared" \| null, landing?: { scene?, target?, hero?, cover?, texts?, shop? } \| null }` | `{ experience }` – the experience after the change (the list's and tree's `title` follow): `title` not empty; `book` changes the printed book's fields sent (`author` not empty, `publisher: null` or `""` removes it), `book: null` removes the printed book, a new one needs its `author` (#320); `recognition` (#306, schema 4.2): how the reader gets its targets' recognition frames – only `"prepared"` is stored, `"original"` or `null` is the default (none); `landing` (#355, schema 6.1): the desktop landing's hero – a scene and one of its targets with AR content (a model, a video, a component), with the `hero` and `cover` the editor or the MCP extracted (`Landing::check`: the ids, the AR content, the hero's shape, at most 256 KB – 400 `invalid-landing`); `null` removes it. Since schema 6.4 (#365) also the page's own `texts` (by language: `intro` ≤ 600, `getApp` ≤ 120, `openOnPhone` ≤ 300, `shop` ≤ 120 characters – blank ones left out) and `shop` (≤ 4 items `{ label, url (http/https), image? \| cover: true }`, `[]` = no shop), with or without a pick (a hero or cover without one is refused); a file below the experience's assets base becomes its content path (RULES #36), a landing that holds nothing is removed. A publish writes the version's `landing.json` from the stored landing (`Landing::file` – the version's title, images, plugins and looks, the texts and `shopItems`, every content path below the assets base; no `hero` without a pick with a hero – the reader derives it; no file when the landing holds nothing) and leaves a landing without a pick out of the readers' `game.config.json` (`Landing::forReaders` – an app of 6.3 refuses one). No `author`, `publisher` or `sourceOfTruth` on the top level. 400 `invalid-experience`, recorded as an `experience` change |

The limits are `shared/api/rules.ts`' too (`TEXT_MAX_LENGTH`, `BODY_MAX_LENGTH`, `ENTRY_TAGS`, `isLinkUrl`) –
`mcp/test/php-rules.test.ts` compares them with the PHP.

### Scenes

An experience is an **ordered list of scenes** (content schema 3.0, #319 – `agents/SCENES.md` "Schema 3.0", `Scenes.php`). A
scene is a `scenes` row: its **order is `scenes.position`** and nothing else, its `data_json` the content's `SceneData`
`{ id, label, group?, surfaces, passes? }` (`title` holds a copy of the label; the page columns are not used – 0), the
experience's groups `experiences.groups_json` (the content's root `groups`). A surface is `{ id, label?, widthMm, heightMm, place }`
– a double page is ONE surface twice the page's width (460 × 320 mm), a cover one page, a wall 2000 × 1500 mm standing
(`rx` 90); `place` `{ x, y, z, rx, ry, rz }` in mm and degrees in the scene's coordinate system. An entry's scene is
`entries.scene_id`, its surface the entry's `surface`; a target's `place` names its surface. **Nothing renumbers** –
there are no pages. Every experience adds, moves and removes its scenes – there is no source of truth (`sourceOfTruth`
and the print-first mode are gone, #320 / #322; a configuration that still has it is a 400 `invalid-configuration`).

**Surfaces sent** (`POST …/scenes { surfaces }`, `PUT …/scenes/{sid} { surfaces }`, an import) are checked as the
content guard does: at least one, at most 32, ids unique, sizes > 0 mm, a label trimmed (left out when empty), no other
field (a 2.x `side` is a 400). `place` needs `x`, `y`, `z`; `rx`, `ry`, `rz` default to 0. Every surface **without a
place lies in a row** – side by side, touching, flat, the row centred on the origin (`Scenes::rowPlaces` = the content
build's `rowPlaces`).

| Endpoint | Body | Answer |
|---|---|---|
| `GET /editor/experiences/{id}` | | `{ experience, scenes: [{ …SceneData, entries: [{ id, category, title, scene, surface?, target }] }], groups }` – the tree: the scenes in order with their entries; `target` = the entry's `TargetData` (`place`, the entity inline or `{ ref }`) or `null`. `experience` = the experience's summary (`initialScene`, `scenes` = how many) |
| `GET /editor/experiences/{id}/scenes` | | `{ scenes: [{ …SceneData, position, surfaces: [{ …SurfaceData, reference }], entries, targets }], groups: [{ id, label, scenes }] }` – in order; `entries` / `targets` how many lie on it; every surface with its `reference` `{ url, name, fit }` or `null` ([below](#surface-reference-images)) |
| `POST /editor/experiences/{id}/scenes` | `{ preset?, after? \| before? \| position?, id?, label?, group?, surfaces? }` | 201 `{ scene, position }` – a scene anywhere: `preset` (default `double`) `double` (one surface 460 × 320 mm), `single` (230 × 320 – a cover is a single scene first in the order), `wall` (2000 × 1500, standing: `y` 750, `rx` 90) gives its surfaces unless `surfaces` names them. After / before a scene or at `position` (0 = first); none = last. `label` defaults to *New scene*, `id` to `scene-<n>`. A change `scene`. 400 `invalid-scene`, `unknown-scene`, `unknown-group`, `reserved-id` (`landing` in any case – the editor's landing workspace, #356); 409 `duplicate-id` |
| `PUT /editor/experiences/{id}/scenes/{sid}` | `{ label?, group?, surfaces?, passes?, logic?, apply? }` | `{ scene, cleared: { entries, targets } }` – `label` (non-empty text), `group` (a group of the experience / `null`; the scene stays in place), `surfaces` (the whole list, places included – above; a surface that goes takes its reference image, a change each), `passes` (the scene's own post-processing: `null` removes it so the experience's apply, `[]` turns them off there), `logic` (the scene's rules `{ rules, canvas? }`, content schema 5.0 – shapes checked by `Logic::check`; `null` removes them). Entries or targets on a surface that goes: without `apply: true` 409 `surfaces-in-use` with `entries` and `targets`, nothing written; with it the entries keep the scene without a surface and the targets lose their `place` (`cleared`, a change each). A target placed without a surface on a scene of one surface names that surface when more come. A change `scene`. 400 `invalid-scene`, `unknown-group`; 404 |
| `POST /editor/experiences/{id}/scenes/move` | `{ scenes: [ids], after? \| before? \| position?, group?, apply? }` | `{ plan: { order, moved, groups }, applied }` – one or several scenes as a block (in their order): after / before a scene, to `position` (among the scenes that stay), into `group` (after its last scene unless placed) or out of their group (`group: null` – in place, unless inside the group: then right after it). Without `apply: true` nothing is written; with it the order (a change `order`, before / after the ids) and the scenes' groups (a change `scene` each), in one transaction. 400 `invalid-move`, `unknown-scene`, `unknown-group` |
| `DELETE /editor/experiences/{id}/scenes/{sid}` | `{ confirm?, deleteFiles? }` | the scene with everything on it, in two steps ([below](#removing-a-scene-or-an-entry)): 409 `confirm-delete` with `impact` and `confirmation`, then with `confirm` 200 `{ deleted }`. 409 `initial-scene` for the scene the experience opens on (it never goes); 404 |
| `POST /editor/experiences/{id}/groups` | `{ label, scenes: [ids], id?, apply? }` | `{ plan: { group, order, moved, groups }, applied }` – a group of the picked scenes: they come together where the first of them is (a scene of another group leaves it). `id` defaults to the label as a slug (`chapter-one`), else `group-<n>`. Without `apply: true` nothing is written; with it the groups (a change `groups`), the order and the scenes. 400 `invalid-group`, `unknown-scene`; 409 `duplicate-id` |
| `PUT /editor/experiences/{id}/groups/{gid}` | `{ label }` | `{ group }` – renamed (a change `groups`). 400 `invalid-group`; 404 |
| `DELETE /editor/experiences/{id}/groups/{gid}` | | `{ ungrouped, scenes }` – ungroup: the group goes, its scenes stay in place and in order, without a group. 404 |
| `PUT /editor/experiences/{id}/scenes/{sid}/surfaces/{surfaceId}/reference` | `{ url?: string \| null, fit?, name? }` | `{ scene, surface, reference, changed }` – [a surface's reference image](#surface-reference-images) |
| `PUT /editor/experiences/{id}/environment` | `{ environment: { world, onionSky, worldSrc?, skySrc? } \| null }` | `{ environment }` – the experience's world and onion sky (`experience.environment`, content schema 2.8; the world model and the sky image as references 2.10); `null` removes it – the default applies. A change `environment` in the log. 400 `invalid-environment`; 404 |
| `PUT /editor/experiences/{id}/passes` | `{ passes: [{ type, …parameters }] \| null }` | `{ passes }` – the experience's post-processing (`experience.passes`), the master every scene without a list of its own shows; `null` removes it. Checked as a scene's list (a built-in `type` or a plugin's pass, scalar parameters); a change `passes` in the log. 400 `invalid-passes`; 404 |
| `PUT /editor/experiences/{id}/logic` | `{ logic: { rules, canvas? } \| null }` | `{ logic }` – the experience's rules (`experience.logic`, content schema 5.0, #334): rules in the behaviour's grammar that listen to the bus (no node event), name nodes by address `target:<targetId>/<node name>` and go to `scene:<id>`; `canvas` (`{ groups?, notes?, folds? }`) is the Logic view's authoring data – the draft and the export carry it, a publish leaves it out. `Logic::check` checks the shapes: a rule `{ on, when?, do }` with a text `on` (empty allowed – the Logic view lists it), a text `when` (the object form of 4.x is refused; the expression's syntax is the TypeScript guard's), one known verb per action. A node's behaviour (`PUT …/entities/{ref}`, `…/targets/{id}`) is checked the same way. `null` removes the field. A change `logic`, revertable like the other experience-wide kinds. 400 `invalid-logic`; 404 |
| `PUT /editor/experiences/{id}/variables` | `{ variables: { name: { type, scope?, default? } } \| null }` | `{ variables }` – the rules' typed variables (`experience.variables`, content schema 5.0, #334 B7): `type` number / integer / boolean / string, `scope` one of the variable scopes, `default` of the type (an integer for a number is fine). Whether the rules fit them is the TypeScript guard's and the editor's to say. `null` removes the field. A change `variables`, revertable. 400 `invalid-variables`; 404 |
| `PUT /editor/experiences/{id}/appearance` | `{ appearance: { reveal?, found?, lost?, card? } \| null }` | `{ appearance }` – how the experience's entities appear (`experience.appearance`, content schema 2.29, #265): a look `{ type, …parameters }` per moment (`Experiences::MOMENTS`), a built-in `type` or a plugin's look, and `card` (schema 6.3, #361) the card look – `cardFlight` or a plugin's card look, scalar parameters (their ranges are the guard's). The whole appearance is replaced; `null`, or one without a moment, removes the field – the default look plays everywhere. A change `appearance` in the log. 400 `invalid-appearance`; 404 |

Gone with 3.0 (404): `…/spreads` (every route), `…/pages`, `…/page-images`, `…/matter`, `…/scenes/migrate`,
`…/scenes/references/migrate`. The draft (`ContentVersion::assemble`) writes `initialScene`, `scenes`, `groups` (when
the experience has any), every entry with its `scene` right after its `title` (and its `surface`), every target with its
`place` – it leaves out a `surface` or a `place` its scene does not have, so the guard never refuses it.

#### The migration to schema 3.0 (done)

Every stored experience (staging's osct and the demo) was migrated once with `POST …/migrate-3` (2.0.0, #319); the
route, `Migration3.php` and the MCP tool `migrate_3` are gone since (the rules it followed were
`scripts/src/convert-content-3.ts`', removed in 3.16.4). Its change rows (kind `migration`) and the 2.x rows before it stay in the log,
readable, not revertable. The database names followed (`spreads` → `scenes`, `entries.spread_id` → `scene_id`,
`books.initial_spread_id` → `initial_scene`, the scene's `title` → `label`; the page columns dropped; the unread table
`page_images` stays – RULES #25) by the idempotent renames at the top of the schema files (`Db::migrate`).

**Content schema 4.0 (#320): the book became the experience**, in place on the next deploy (`Db::migrate`, no route):
the renames at the top of the schema files – `books` → `experiences`, `book_versions` → `experience_versions`, `book_id`
→ `experience_id` in every table (`page_images` too), `book_json` → `experience_json`, `users` / `login_requests`
`book_updates` → `experience_updates` (every person's choice kept) – each skipped when its table or its old name is
gone; at the end the change log's kind `book` → `experience` and the `author` column dropped (SQLite also renames its
indexes; a migrated MariaDB keeps the old index and foreign key names, which no code names). Then the data step
`Migration4.php` (JSON, which one SQL statement cannot rewrite for both dialects; each part only where the old shape is
left, so a second run changes nothing): the experience's top-level `author` / `publisher` move into its `book`,
`sourceOfTruth` goes, a 3.x experience's `content_schema` becomes 4.0; the behaviour rules' scope `book` →
`experience` and text nodes' `{{book.title}}` → `{{experience.title}}` in the rows of entities, targets, entries and
scenes and in the change log's before / after (so a revert never writes the old shape back). Progress records and plugin
sources are not rewritten – the reader reads an old record and writes the new one; `server/deploy/migrate.php` names
each plugin source that still says `"book"`, for its author to re-save with `"experience"`. Routes: `/editor/books/…` →
`/editor/experiences/…`, no alias; errors `invalid-experience`, `other-experience`; `print-first` is gone.

**Content schema 5.0 (#334): every condition an expression**, in place on the next deploy (`Db::migrate` runs
`Migration5.php` after `Migration4`, so the container's entrypoint – `server/deploy/migrate.php` – and `POST
/admin/migrate` apply it). Any JSON object with a text `on` and an object `when` is a rule: in `experiences.experience_json`,
the `data_json` of entities, targets, entries and scenes (the JSON is walked – a behaviour anywhere in a node tree) and the
change log's before / after of the experience-wide and row kinds. Each test `name: value` → `name == value`, `{ not: value }`
→ `!=`, the plain form joined with `&&`, `any:` with `||`, a text quoted (`"…"`, `\"` and `\\` escaped); `name: null` → `!name`
and `{ not: null }` → `name` (approximate: the language has no *not set* – listed); a test it cannot write (a variable named
`and` / `or` / `not` / `mod` / `true` / `false`, a value that is no scalar) leaves the condition as it is – listed with the
reason, the editor then shows the rule's problem. A 4.x experience's `content_schema` becomes 5.0 (the editor reads 5.x
only). The rules are `scripts/src/convert-content-5.ts`' (the content folders' conversion, `npm run convert:5`); a test in
`mcp/test/php-rules.test.ts` compares both on the same cases. Idempotent – a text `when` is never touched, a second run
changes nothing. In an experience still of 4.x its rules' `set` text values become the language's text literals (B2:
`calm` → `"calm"`; only then, so a second run never quotes again – `Migration4` takes a 3.x experience to 4.0 for this),
and the variables its rules set are declared in `experience_json.variables` from the values' types (true / false boolean,
a whole number integer, a fraction number – both together number –, a text string; the scope when every set names the same
one, none named = scene); a variable set with two types is a conflict, not declared and reported. **Dry run**: `php server/deploy/migrate.php --plan-5` (with the API's `OSCT_*` settings, in the container
`php /opt/osct/migrate.php --plan-5`) prints what it would change as JSON – `rows` per table, `schema` (experiences going
to 5.0), `rules` (conditions converted), `sets` (set texts quoted), `variables` (experience → name → type declared),
`conflicts` (`experience: name – types`), `approximate` (`where: variable`) and `unconvertible` (`where`, `when`, `reason`) –
and writes nothing, no schema statement runs. After a migration `migrate.php` prints one line with the counts. Published
versions in the content store are not rewritten: a 5.0 app refuses a 4.x version, so every experience is published again
after the deploy.

**Content schema 6.0 (#341, plugin API 4.0): listen, not hear**, on the next deploy (`Db::migrate` runs `Migration6.php`
after `Migration5`). A 5.x experience's `content_schema` becomes 6.0 (a 4.x one becomes 6.0 in `Migration5` already); in
`experiences.plugins_json` (the declared plugins) and `imported_json` every recorded `uses: { hears }` becomes
`uses: { listens }` (the JSON is walked). Idempotent. The Code tab's sources (`plugins.source`) are **not** rewritten here:
`osct plugins listen --all --dry-run` (scripts/, `OSCT_API_URL`, `OSCT_EDITOR_TOKEN`) prints per experience and plugin the
lines it would change, and without `--dry-run` stores them back through the editor API (a change each in History) – after
the deploy, since a 5.x editor's guard does not know `uses.listens`. **Dry run**: `php server/deploy/migrate.php --plan-6`
prints `schema` (experiences going to 6.0), `uses` (experience → specs renamed) and `sources` (`experience/plugin` whose
source still says "hear"). Declared modules were built against plugin API 3.x – a 6.0 app does not load them – and a 6.0
app refuses a 5.x version: every experience is published again after the migration.

#### Ids without leading zeros (#63)

The delivery import wrote zero-padded ids (`s004-005`, `p004-1`); since #63 it writes `s4-5`, `s4`, `p4-1`. The
database's ids were renamed once (3.10.0, a by-hand tool with a dry run, applied on staging 2026-11-20 – 50 scenes,
524 entries, 522 targets) and the tool was removed afterwards (3.11.1). File paths, plugin code and published
versions were not rewritten; readers' progress started over.

**One update option (#325)**, in place on the next deploy: `Db::mergeUpdateOptions` turns `publisher_updates` on
wherever any of the three old options was on (`book_updates` / `experience_updates`, `artist_updates`), then the schema
renames `publisher_updates` → `buildingfictions_updates` in `users` and `login_requests` and drops the other two. The API
key is `buildingfictions` (news from Building Fictions); a second run finds no old column and changes nothing.

#### Surface reference images

A surface's **reference image** (#314, `SurfaceReferences.php`, `agents/SCENES.md` "Surfaces: create, edit, place") is
one image of the experience's Library the editor's stage shows on that surface – a scanned double page, a photo of a wall. It
is **editor-only**: no content – the draft, its publish and the reader never carry it. Kept in `surface_references`
(`experience_id`, `scene_id`, `surface_id` – the key –, `url`, `name`, `fit`, `updated_by`, `updated_at`; both schema files,
created by the migration like every table). `fit` = how it fills the surface: `cover` (default, cut to cover it),
`contain` (fits inside), `stretch`.

- **Read** in the scenes overview (`GET …/scenes`): each surface's `reference` `{ url, name, fit }`, `null` without one.
- **Set, replace, remove**: `PUT …/scenes/{sid}/surfaces/{surfaceId}/reference` – `{ url }` (an image of the experience's
  Library by its URL, or an imported one by its content path `/assets/content/…`) sets or replaces it (`name` defaults
  to the Library's, a replace keeps its `fit` unless one is sent), `{ url: null }` removes it, `{ fit }` / `{ name }`
  alone change the present one (404 without one). The same values again answer `changed: false` and record nothing.
  400 `invalid-reference` (no Library image, an unknown fit, an empty name, nothing sent); 404 for a scene or surface the
  experience does not have.
- **Change log**: every set, replace and remove is a change (kind `reference`, ref `<scene>/<surface>`, `before` /
  `after` the reference or `null`) and **revertable both ways** ([below](#reverting-saved-changes)) – a set reverts to
  none, a removal brings it back – while the scene still has the surface (else a conflict).
- **Goes with its surface**: a surface removed from its scene (`PUT …/scenes/{sid} { surfaces }`) and a deleted scene
  take their references (a change each). A reference whose surface goes otherwise (a re-import, a reverted surfaces
  list) stays in the table and is shown and counted nowhere – the surface coming back brings it back.
- **A use of its file** (kind `reference`, [above](#what-counts-as-a-use)): the Library counts it, the delete check
  refuses the file while it is one, a replace relinks it (a change), a forced delete removes it (a change). It names the
  file `<scene>_<surface>` (#298); an upload with `?fit=reference&scene=<id>&surface=<id>` is named so at once.

### Deleting an experience

`DELETE /editor/experiences/{id}` (#348) deletes a whole experience from the editor, in the two steps of a
[confirmation](#confirmations): without `confirm` 409 `confirm-delete` with `impact` – `{ experience, kind: "experience",
title, counts: { scenes, entries, plugins, files, versions, changes }, live: [{ env, build }] }` – and `confirmation`; with
`confirm` its rows go in one transaction → 200 `{ deleted: { experience } }`: the draft (scenes, entries, targets,
entities, plugin sources), the change history, the publish log, the Library's records, the deliveries and publish jobs.
Nothing undoes it. What the **content store** holds stays: the published builds (readers of an environment where it is
live keep getting that build) and the uploaded files (a live build may load them) – and readers' progress. An experience
of an older content schema can be deleted. The id is bound to the experience's last change, its counts and where it is
live. The editor asks for the experience's id to be typed before it sends `confirm` (the sheet's *Delete experience…*,
[editor](editor.md#the-experiences-page)).

### Removing a scene or an entry

`DELETE /editor/experiences/{id}/scenes/{sid}` and `DELETE /editor/experiences/{id}/entries/{eid}` remove with everything on it, in
the two steps of a [confirmation](#confirmations) – for the editor and an AI connection alike (a token removes like its
person, only this way; the change log names it). `Removal.php` works out what goes:

1. **Impact.** Without `confirm` nothing is written: 409 `confirm-delete` with `impact` and `confirmation`. `impact` =
   `kind` (`scene` / `entry`), `scene` `{ id, label }` or `entry` `{ id, title, category, scene }`, `entries`
   `[{ id, title, scene, category }]`, `targets` `[{ id, entry, imageSrc }]`, `entities` – the ones
   that go: a shared entity no other target uses `{ ref, type, shared: true, targets }` and each target's own
   `{ ref: null, type, shared: false, targets }` –, `keptEntities` – shared entities other targets still use
   `[{ ref, type, targets, usedBy }]`, kept –, `files` `{ onlyHere, elsewhere }` – the Library files (uploaded assets,
   [Assets](#assets)) the removed rows name: `[{ id, name, kind, size, url }]`, those used elsewhere with `usedBy`
   (`Assets::usagesOf` beyond the removed rows; the environment counts) – and `counts` `{ entries, targets, entities,
   keptEntities, filesOnlyHere, filesElsewhere }`. The import's files (`files.json`) are the content build's and never
   part of it.
2. **Confirm.** The same request with `confirm: <id>` removes exactly what the impact listed, in one transaction:
   targets, the entities used only there, entries, the scene and its surfaces' reference images – and with
   `deleteFiles: true` also the Library files used only
   there (off by default; a file used elsewhere is never deleted; the store's files go after the commit). Every removed
   row is a change with its `before` and `after: null` (kinds `target`, `entity`, `entry`, `scene`, `reference`,
   `asset`). 200 `{ deleted: { scene, entries, targets, entities, files } }`. The id is bound
   to every row that goes, the kept entities' users, the files and their uses, and the experience's change log and last
   change: anything that changed in the experience answers 409 `confirmation-void` with a fresh impact and id.

400 `invalid-delete` when `deleteFiles` is not true or false.

### Reverting saved changes

The change log (`changes`, one row per saved draft change with `kind`, `ref`, `before_json`, `after_json`, the user and
the time) is also the way back (#312, `Reverts.php`). A revert writes a change's `before` again as a **new** change – nothing is
erased, and a revert can be reverted. The changes one revert writes share a change set (`changes.change_set`, `set` in
`GET …/changes`), each names the change it took back (`changes.reverts`, `reverts`). Two steps, as the matter: without
`apply: true` the plan, nothing written; with it the plan is made again and written in one transaction. A revert
changes the draft only – readers see it with the next publish.

| Endpoint | Body | Answer |
|---|---|---|
| `POST /editor/experiences/{id}/changes/{cid}/revert` | `{ apply? }` | one change, with every **later change of the same thing** – the same entity, target, entry or scene row; for the experience's JSON (`environment`, `passes`, `appearance`, `experience`) the same fields – reverted first (their edits would be lost otherwise) |
| `POST /editor/experiences/{id}/changes/revert` | `{ ids, apply? }` (1–2000) | these changes, later ones of the same things too – the editor's undo and redo |
| `POST /editor/experiences/{id}/changes/revert-to` | `{ after, apply? }` | every change saved after `after`, by anyone, newest first – back to the state right after it. 400 `nothing-to-revert` |

Each answers `{ plan: { changes, chosen, counts: { revert, conflict, notRevertable }, later, others }, applied, set,
written }`: `changes` newest first, each `{ id, kind, ref, user, token, createdAt, later, other, status, reason? }`;
`others` the e-mail addresses of other people among them; `written` the new changes' ids. The changes are walked newest
first: one whose thing still holds what it wrote (`after`, compared with the keys sorted; the experience's JSON only in the
fields it changed) gets its `before` back (`status: revert`); one whose thing holds something else is a **conflict** –
listed, never overwritten, and the older changes of that thing are skipped as well. **Not revertable** (`status:
not-revertable`, and `notRevertable` in `GET …/changes`): a creation (`before` null – remove it instead; a delivery's new row is the exception, [Deliveries](#deliveries)), a removal
(`after` null), an entry moved to another surface (its scene is `entries.scene_id`, not in the log), a new order whose
scenes changed, a deleted file, a change saved before the content schema 3.0 (its rows held pages or a print) and the
migration itself (`migration`). A **plugin** (#352, 6.11.0) reverts every way – a save, a push, a file deleted in the Code
tab, its creation (it goes again) and its deletion (it comes back with all its files): `before` / `after` are its files
(a change before 6.11.0 holds one source: its `index.ts`) or null (`Plugins::filesOfValue`, `Plugins::restore`); its link
(`origin`) stays as it is. Scene moves are
in the log (`order`, the ids before and after) and revert. Picture credits and Library file names are no
draft content and not in the log (they are not revertable); a surface's reference image (#314) is no content either but
is in the log and reverts both ways – set, replaced, removed – while its scene has the surface. Changes of one request get strictly increasing times, so
their order stays readable. 404 `not-found` for a change not in the experience's log; 400 `invalid-revert`, `too-many`.

### Deliveries

A publisher's delivery reaches the draft through the API (#322, `Deliveries.php`; the content folder's import
`npm run import` before it). The files go first, through the [Assets](#assets) API (`osct delivery import` converts them – WebP, H.264 –
and uploads each once: a file whose sha256 the Library's list names is not sent again); then `POST /editor/experiences/{id}/deliveries` sends the **plan**
(`shared/api/deliveries.ts` `DeliveryPlan`), JSON without files:

```json
{
  "name": "2026-11-final",
  "source": "delivery folder 2026-11-final, mapping import/2026-11-final.yaml",
  "scenes": [{ "id": "s186-187", "label": "186–187", "preset": "double" }],
  "entries": [
    { "id": "p186-1", "scene": "s186-187", "category": "video", "title": "Placeholder",
      "image": "<asset id or URL>", "target": { "imageSrc": "<asset URL>", "video": "<asset URL>", "enabled": true } }
  ]
}
```

- `scenes` (optional, in the book's order): `{ id, label?, preset? | surfaces? }`. A scene that exists is kept as it is; a
  new one gets the preset's surfaces (`double` by default) or its own, and goes after the plan's scene before it (else
  before the one after it, else last).
- `entries`: `{ id, scene, surface?, category, title, author?, body?, caption?, media?, tags?, image?, target? }`, the
  target `{ imageSrc, enabled?, video? }`. A **new** entry gets these texts and its target (id = the entry's; `enabled:
  false` switches it off; `video` becomes its inline video entity, asset id `<target>-media`). An entry that **exists**
  keeps its texts, category and scene; only its `image` and its target's `imageSrc` and video follow the delivery – a new
  file is another URL (the Library keeps one file per content). A new `imageSrc` drops the target's recognition data.
  An existing target keeps its switch (a warning when the delivery switches it off). Any other field is a 400 – the
  mapping's `note` is not stored.
- Files are named by the asset's id or URL and must be pictures (`image`, `imageSrc`) or videos (`video`) of the
  experience's Library.

Without `apply: true` nothing is written; the answer is the comparison: `items` per scene, entry and target, each `{ kind,
id, status, fields?, reason?, scene?, entry? }` – `new`, `changed` (`fields`: `image`, `imageSrc`, `video`), `same`
or `conflict`, `counts` per status, `problems` and `warnings`. A **conflict** is a row whose changed fields were edited
outside a delivery since the last delivery that wrote that row (none: since the experience's import) – read from the
change log; a target that shows another entity than a video gets no video (a conflict too). A conflict is left as it is
unless the body sends `overwrite: true`. **Problems** stop the delivery: a scene neither in the experience nor in the
plan, a surface the scene does not have, a file outside the Library, a target id another entry uses, and more than
`MAX_TARGETS_PER_SCENE` (10, RULES #3, `shared/api/rules.ts`) targets switched on in a scene the delivery adds targets
to.

With `apply: true` the comparison is made again and written in one transaction (409 `delivery-problems` with
`comparison` when it has problems – nothing written). Each write is a change of its row's own kind (`scene`, `entry`,
`target`) with `changes.delivery_id` set (`delivery` in `GET …/changes`), and the delivery is a row of `deliveries`
(name, source, the plan as sent, the counts, who, when); the answer names its `id` and `written`, the changes' ids. The
same delivery sent again compares as all `same`.

`GET …/deliveries` lists the applied deliveries, newest first – name, source, counts, who, when, and how many changes name
each (the plan as sent stays in the table). The MCP's `preview_delivery` / `import_delivery` / `list_deliveries` use these
routes ([mcp](mcp.md#a-publishers-delivery-preview_delivery-import_delivery-322)).

**Taking a delivery back**: `POST …/changes/revert { ids }` with its changes' ids ([Reverting saved
changes](#reverting-saved-changes)). The later changes of the same rows are reverted first, as for any save; the
delivery's new rows are removed again – a target, then its entry once it has no target, then a scene once nothing lies on
it and the experience does not open on it (a conflict otherwise). The removal a revert writes is not revertable itself.

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `LOG_PATH` – locally
`var/log/error.log` (never served over HTTP), in the container `/dev/stderr` = `kamal app logs`. Readers
only see "Something went wrong".

## Local development

**Against MariaDB – the recommended setup.** Staging and production run MariaDB / MySQL, and some queries that SQLite
accepts fail there (#161: a named parameter used twice; `LIKE … ESCAPE` with a backslash, which opens an escape inside
a MySQL string literal – `Db::contains` builds the pattern with `!`). `docker-compose.yml` in the repository root runs
MariaDB 10.11, the version of staging's host (`OSCT_MARIADB_VERSION=11.4` for the version of the Kamal accessory in
`config/deploy.yml`). Its first start creates the empty database `osct`; `php server/deploy/migrate.php` (Db::migrate) creates the tables –
the schema file is not run as Docker's init script, because its renames for older databases stop a raw run on a new one
(3.21.2). The data stays in the Docker volume `osct_db` until `docker compose down -v`.

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
