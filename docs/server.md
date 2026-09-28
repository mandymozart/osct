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
`server/api/`, which is deployed as the `/api` folder next to the app.

```
server/api/
  index.php               front controller – the list of endpoints
  .htaccess               everything → index.php, nothing else is served
  config.local.php        settings (not committed) – from config.local.php.example / the deploy
  src/                    Version, Config, Db, Http, Auth, Passwords, Users, Progress, Mailer, Smtp, LoginMail (mail texts en/fr/nl/de)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS, later columns as ALTER TABLE … ADD COLUMN – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests
server/deploy/write-config.php   deploy: config.local.php from OSCT_* environment variables
server/tests/api-test.php        the whole flow against php -S + SQLite, SMTP against tests/fake-smtp.php
```

## Endpoints

| | | |
|---|---|---|
| `POST /auth/request` | `{ email, language?, options? }` | 202 `{ requestId, expiresAt }` – sends the email |
| `POST /auth/verify` | `{ token }` or `{ requestId, code }` | `{ session, user, created }` |
| `POST /auth/password` | `{ email, password }` | `{ session, user, created: false }`; 401 `invalid-credentials` (also for unknown addresses and users without a password) |
| `POST /auth/logout` | | 204 – this device only |
| `GET /user` | | `{ user }` |
| `PATCH /user` | `{ options?, language? }` | `{ user }` |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `PUT /user/password` | `{ password, currentPassword? }` | `{ user }` – sets or changes the password (`user.hasPassword`) |
| `DELETE /user/password` | | `{ user }` – sign-in by email only again |
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10) |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` | creates missing tables and columns |

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
  15 minutes (`PASSWORD_RESET_MINUTES`) – the "forgot password" path. Removing it needs only the session.

## Configuration

`src/Config.php` lists every key and its default. An environment variable `OSCT_<KEY>` wins, then
`server/api/config.local.php`. Mail sending is set with `MAIL_TRANSPORT`:
- `log` writes mails to a file (development).
- `mail` uses PHP `mail()` (testing).
- `smtp` sends through the `SMTP_*` account (production). It uses its own small client, so no library is needed.

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `server/api/db/error.log` (on the server: `api/db/error.log`)
(`LOG_PATH`). `db/` is never served over HTTP; read the file over FTP. Readers only see "Something went wrong".

## Local development

```bash
cp server/api/config.local.php.example server/api/config.local.php   # set DB_SQLITE_PATH, MAIL_TRANSPORT=log, SECRET
cd client && npm run dev:api     # PHP on 127.0.0.1:8080
cd client && npm run dev         # vite passes /api on to it
php server/tests/api-test.php    # API tests (CI runs them too)
```

The mails (with link and code) land in `MAIL_LOG_PATH`.

## Deploy (development server)

`.github/workflows/deploy-staging.yml` ("Deploy staging server (osct.porschuetz.de)") runs on every push to `develop` –
the whole site, app + API. osct.porschuetz.de is the staging server; the Netlify sites are temporary and call its API.
Production: see [Releases](#releases-production).
1. Run the API tests.
2. Build the app with `VITE_API_URL=/api`.
3. Write `config.local.php` from the GitHub environment **staging** (secrets and variables are listed in the workflow).
4. Upload the app and `server/api/` (as `api/`) over FTPS to osct.porschuetz.de.
5. Call `/api/admin/migrate`, then `/api/health`.

Local credentials for that server live in `server/.env`, which is not committed.

## Releases (production)

Pushes to `main` deploy nothing. Production is deployed by `.github/workflows/release.yml` ("Release
production") when a GitHub release is **published** – or by hand (Actions → Release production → tag).

1. Bump the version and add the `docs/CHANGELOG.md` section on `develop` (RULES #23), merge `develop` into `main`.
   `.github/workflows/tag-version.yml` then tags it: every CHANGELOG version without a tag gets `vX.Y.Z` on
   the last `main` commit carrying it. Nobody pushes tags by hand (agent sessions cannot).
2. GitHub → Releases → *Draft a new release* → choose the existing tag `vX.Y.Z` → *Publish* (leave the notes
   empty to get the CHANGELOG section).
3. The workflow checks that the tag equals every version source, that the CHANGELOG has the section and that
   the commit is on `main`; then it fills empty release notes and deploys:
   - **Production server** (FTPS, app + API) from the GitHub environment **production** – same names as
     staging. Skipped with a warning while `FTP_HOST` is not set.
   - **Netlify** (temporary `osct` site): the tagged build is uploaded with the Netlify CLI. Needs secrets
     `NETLIFY_AUTH_TOKEN` (Netlify → User settings → Applications → Personal access token) and
     `NETLIFY_SITE_ID` (Site configuration → Site details → Site ID), variable `VITE_API_URL` (full API URL).
     In Netlify set Site configuration → Build & deploy → Continuous deployment → **Stop builds**, so pushes
     to `main` no longer deploy; CLI deploys keep working.

Staging on Netlify has no PHP. There, set `VITE_API_URL` to the full API URL; without it the account section
is hidden.
