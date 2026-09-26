# OSCT user API (PHP + MySQL)

Naming (Tilman 2026-09-27): *user* in code, API and database; *account* only as the UI label (Info → Account).

Sign-in by email for the app – no password (built on the branch `database`, merged into develop 2026-09-27). The reader enters an email and
can opt in to updates (both off until the reader turns them on):

- **updates on Onion Skin & Crocodile Tears**
- **updates from Kévin Bray**
- **updates from Building Fictions**

The progress is always kept in the account (restored on other devices); the reader can reset it.

The server sends an email with a **link** and a **6-digit code**. Opening the link or typing the code
confirms the address and signs in the device. The first confirmation creates the account (double opt-in).
The code is needed where the link opens a different browser than the app, e.g. the home-screen app on iOS.

Plain PHP 8.1+ with PDO and no Composer; it follows the same style as qr.scutoons.com. Everything lives in
`api/`, which is deployed as the `/api` folder next to the app.

```
api/
  index.php               front controller – the list of endpoints
  .htaccess               everything → index.php, nothing else is served
  config.local.php        settings (not committed) – from config.local.php.example / the deploy
  src/                    Config, Db, Http, Auth, Users, Progress, Mailer, Smtp, LoginMail (mail texts en/fr/nl/de)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests
deploy/write-config.php   deploy: config.local.php from OSCT_* environment variables
tests/api-test.php        the whole flow against php -S + SQLite, SMTP against tests/fake-smtp.php
```

## Endpoints

| | | |
|---|---|---|
| `POST /auth/request` | `{ email, language?, options? }` | 202 `{ requestId, expiresAt }` – sends the email |
| `POST /auth/verify` | `{ token }` or `{ requestId, code }` | `{ session, user, created }` |
| `POST /auth/logout` | | 204 – this device only |
| `GET /user` | | `{ user }` |
| `PATCH /user` | `{ options?, language? }` | `{ user }` |
| `DELETE /user` | | 204 – user, sessions, progress, open requests |
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10) |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` | creates missing tables |

Signed-in calls send `Authorization: Bearer <session>`. Errors: `{ "error": { "code", "message" } }`. The
app translates the codes (`account:errors.*`).

Security notes:
- The link token, the code and the session tokens are stored only as hashes.
- A request allows 5 code attempts and is valid for 30 minutes.
- Per hour, at most 5 emails per address and 30 per IP (the IP is stored hashed).
- Links point to the calling app's origin only if it is in `ALLOWED_ORIGINS`, otherwise to `APP_URL`.
- The same `ALLOWED_ORIGINS` list controls CORS.

## Configuration

`src/Config.php` lists every key and its default. An environment variable `OSCT_<KEY>` wins, then
`api/config.local.php`. Mail sending is set with `MAIL_TRANSPORT`:
- `log` writes mails to a file (development).
- `mail` uses PHP `mail()` (testing).
- `smtp` sends through the `SMTP_*` account (production). It uses its own small client, so no library is needed.

## Logs

The API writes its errors (with the reason, e.g. a failed mail or a database error) to `api/db/error.log`
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

`.github/workflows/deploy-staging.yml` runs on every push to `develop` (staging):
1. Run the API tests.
2. Build the app with `VITE_API_URL=/api`.
3. Write `config.local.php` from the GitHub environment **staging** (secrets and variables are listed in the workflow).
4. Upload the app and `api/` over FTPS to osct.porschuetz.de.
5. Call `/api/admin/migrate`, then `/api/health`.

Local credentials for that server live in `server/.env`, which is not committed.

Staging on Netlify has no PHP. There, set `VITE_API_URL` to the full API URL; without it the account section
is hidden.
