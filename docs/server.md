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
  src/                    Version, Config, Db, Http, Auth, Passwords, Users, Progress, Mailer, Smtp, LoginMail (mail texts en/fr/nl/de)
  db/schema.mysql.sql     tables (CREATE TABLE IF NOT EXISTS, later columns as ALTER TABLE … ADD COLUMN – POST /admin/migrate runs it)
  db/schema.sqlite.sql    the same for local development / tests
server/deploy/migrate.php        deploy: the migration from the command line (the container's entrypoint runs it)
server/deploy/mail-test.php      one test mail with the current mail settings (in the image as /opt/osct/mail-test.php)
server/deploy/ses-smtp-password.php   SES SMTP password from an IAM secret key (docs/deploy.md "Mail")
server/docker/                   Apache configuration and entrypoint of the image (docs/deploy.md)
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
| `GET /progress/{bookId}` | | `{ record, updatedAt }` (both null if nothing is stored) |
| `PUT /progress/{bookId}` | `{ record, baseUpdatedAt }` | `{ updatedAt }`; 409 `conflict` + stored record when another device saved in between |
| `GET /health` | | `{ status, version, db }` – `version` = `src/Version.php`, the same number as the app (RULES #10) |
| `POST /admin/migrate` | header `X-Admin-Secret: SECRET` | creates missing tables and columns (the container does this at every start) |

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
