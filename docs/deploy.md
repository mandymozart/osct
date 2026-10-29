# Deploy – Kamal on an SSH server

The site – the app and the [user API](server.md) – runs as **one Docker container** on a server reached over SSH,
deployed with [Kamal](https://kamal-deploy.org). Kamal builds the image from the commit, pushes it to the GitHub
container registry (ghcr.io), starts it on the server behind **kamal-proxy** (TLS from Let's Encrypt, zero-downtime
switch) and keeps **MariaDB** next to it as an accessory. Nothing is uploaded file by file any more.

| | Branch | Site | Kamal destination | GitHub environment |
|---|---|---|---|---|
| **Staging** | `develop` | https://osct.porschuetz.de (debug bar on) – a staging VM on the production server | `staging` | `staging` |
| **Production** | `main` | https://osct.buildingfictions.com | `production` | `production` |

A push to `develop` runs `.github/workflows/deploy-staging.yml`, a push to `main` `deploy-production.yml`; both
call `deploy.yml` (API tests → `kamal deploy -d <destination>` → `/api/health`). `main` only changes when Tilman
says so (`agents/RULES.md` #11). `tag-version.yml` still tags every version on `main`.

**Transition:** while a GitHub environment has no `SSH_HOST`, its Kamal deploy is skipped with a warning. Staging
runs on the all-inkl shared host (no Docker) until the staging VM exists – `deploy-staging-ftps.yml` keeps
uploading `develop` there over FTPS in the meantime (the old way: `server/deploy/write-config.php` writes
`config.local.php`). Once the VM is live and DNS points at it, delete that workflow and the script.

## What is in the image

`Dockerfile` (two stages):

1. **Build** (Node 22): `npm ci` in `client/` and `scripts/`, then `npm run build` in `client/` – the translation
   check, Vite, the type checks, and the content build of this commit unless the content comes from the CDN. Build
   flags: `VITE_API_URL=/api` always, `VITE_DEBUG=true` only for staging (`config/deploy.staging.yml` →
   `builder.args`), `VITE_CONTENT_BASE_URL` = the environment's `CONTENT_BASE_URL` (`config/deploy.yml`): the app
   then loads the current content version from the CDN at startup and the image holds no content
   ([content-cdn](content-cdn.md)). Without it the commit's content is built into the image – only while `content/`
   is still in git ([content-out-of-git](content-out-of-git.md)).
2. **Serve** (PHP 8.3 + Apache): `client/dist` at the document root, `server/api` as `/api`. The two `.htaccess`
   files do what they do on a shared host (SPA fallback, API routing); `server/docker/apache.conf` adds the cache
   headers (`assets/app/*` immutable, `index.html` / service worker / manifest `no-cache`), the MIME types the
   PWA needs, gzip for text, and takes the client IP from kamal-proxy's `X-Forwarded-For` (the API rate-limits
   per IP). API errors go to the container log.

At every start `server/docker/entrypoint.sh` runs `server/deploy/migrate.php` – the same additive migration as
`POST /api/admin/migrate` (missing tables and columns only; a deploy never resets data) – waits for the database
if it is still starting, then hands over to Apache. A failing migration fails the start, and kamal-proxy keeps the
previous container.

Local check of the image, without a MariaDB (the API falls back to SQLite):

```bash
docker build -t osct --build-arg VITE_DEBUG=true --build-arg VITE_CONTENT_BASE_URL=https://buildingfictions.b-cdn.net/staging .
docker run --rm -p 8080:80 -e OSCT_DB_SQLITE_PATH=/data/osct.sqlite -e OSCT_SECRET=$(openssl rand -hex 32) osct
```

Then http://localhost:8080 and http://localhost:8080/api/health; sign-in mails land in the container's temp folder
(`MAIL_TRANSPORT` defaults to `log` without the Kamal settings). In Git Bash on Windows prefix the command with
`MSYS_NO_PATHCONV=1`, or the `/data/…` path is rewritten.

## Configuration

`config/deploy.yml` is the shared Kamal configuration, `config/deploy.staging.yml` and
`config/deploy.production.yml` the two destinations (service name `osct-staging` / `osct`, the server, the domain,
`OSCT_APP_URL`, `OSCT_ALLOWED_ORIGINS`, `OSCT_DB_HOST`). The API reads every setting from `OSCT_*` environment
variables (`server/api/src/Config.php`); there is no `config.local.php` in the container.

The files are ERB: the server and the mail settings come from environment variables, the secrets through
`.kamal/secrets` (committed – it only references variables, never holds values).

| Where | Name | Meaning |
|---|---|---|
| variable | `SSH_HOST` | the server (host name or IP) – both destinations may use the same server |
| variable | `SSH_USER` | SSH user with Docker access, default `root` |
| variable | `SSH_KNOWN_HOSTS` | the server's host key as a `known_hosts` line (`<SSH_HOST> ssh-ed25519 AAAA…`) – the deploy refuses to run without it, and SSH refuses a server that answers with another key |
| variable | `CONTENT_BASE_URL` | the environment's content CDN (`https://buildingfictions.b-cdn.net/staging` / `…/production`, [content-cdn](content-cdn.md)); the same variable feeds `content.yml`. Empty: the commit's content is built into the image |
| variable | `ALLOWED_ORIGINS` | other origins allowed to call the API (comma separated; staging default `https://localhost:5173`) |
| variable | `MAIL_TRANSPORT` | `smtp` (default) or `log` – the container has no `mail()`; with `smtp` the workflow refuses to deploy while `SMTP_USER` / `SMTP_PASS` are missing |
| variable | `MAIL_FROM` | sender of the sign-in mails, default `no-reply@buildingfictions.com` – any address at the domain verified in SES ([Mail](#mail-aws-ses)) |
| variable | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (tls) | default: the SES endpoint `email-smtp.eu-west-1.amazonaws.com`, STARTTLS on 587 – nothing to set for SES |
| variable | `SMTP_USER` | the SES SMTP user name (an IAM access key ID) |
| variable | `EDITORS` | e-mail addresses (comma-separated) that get the role `editor` when they sign in – the instance's first editors; more on the admin page ([admin](admin.md), [server, "Roles"](server.md#roles)) |
| variable | `ADMINS` | e-mail addresses (comma-separated) that get the role `admin` when they sign in – the instance's first admin, who then grants roles at `/editor/admin`; set it on `staging` and `production` |
| variable | `CONTENT_STORE` | where the editor's publishes and uploaded assets go ([server, "Editor data"](server.md#editor-data), ["Assets"](server.md#assets)): `bunny` (the content CDN's storage zone, the same the osct CLI syncs to) or `local` (the container's own directory, served at `/api/content/{env}/…`). Default: `bunny` as soon as `BUNNY_STORAGE_PASSWORD` is set, else `local` |
| variable | `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ENDPOINT` (or `BUNNY_STORAGE_ZONE_ENDPOINT`) | the storage zone (`osct`) and its endpoint host (default `storage.bunnycdn.com`) – only read with the bunny store |
| secret | `SSH_PRIVATE_KEY` | a deploy key whose public key is in the server user's `authorized_keys` |
| secret | `DB_PASS` | the API's database password (also the MariaDB user `osct`) |
| secret | `DB_ROOT_PASS` | MariaDB root password |
| secret | `SECRET` | 32+ random characters (`openssl rand -hex 32`) – hashes codes and IPs |
| secret | `SMTP_PASS` | the SES SMTP password (derived from the IAM secret key – not the key itself) |
| secret | `BUNNY_STORAGE_PASSWORD` | the storage zone's access key (read/write), with `CONTENT_STORE=bunny` – the key `scripts/.env` holds for `osct content sync` |
| secret | `KAMAL_REGISTRY_PASSWORD` | ghcr.io: `GITHUB_TOKEN` in the workflow; locally a personal access token with `write:packages` |

In GitHub: Settings → Environments → `staging` / `production`. Locally: `server/.env` (not committed) with the same
names, loaded with `set -a; . server/.env; set +a` before a `kamal` command, plus `KAMAL_REGISTRY_USERNAME` /
`KAMAL_REGISTRY_PASSWORD` (a token with `read:packages` + `write:packages`). The image on ghcr.io is private
(it contains the content).

## Mail (AWS SES)

The sign-in mails (link + code, `server/api/src/LoginMail.php`) leave through **Amazon SES** in **eu-west-1**
(Ireland) over its SMTP interface – the same account that sends the mails of Building Fictions' other apps
(asgerb, 2026-10-27). The whole domain is verified there, so the sender may be any address at that domain;
`MAIL_FROM` defaults to `no-reply@buildingfictions.com`. The API's own SMTP client (`Smtp.php`: STARTTLS,
`AUTH LOGIN`) talks to SES without a library; `SMTP_HOST`, `SMTP_PORT` and `SMTP_SECURE` default to the SES
endpoint, so an environment only needs `SMTP_USER` and `SMTP_PASS`.

**Credentials** come from whoever administers the AWS account (Building Fictions / asgerb) – one pair per GitHub
environment is best, so staging can be revoked without touching production:

1. An IAM user (e.g. `osct-mailer`) with a policy that allows `ses:SendRawEmail` only – ideally limited to the
   verified identity (`"Resource": "arn:aws:ses:eu-west-1:<account>:identity/<domain>"`) and, with a condition on
   `ses:FromAddress`, to the `MAIL_FROM` address.
2. **SMTP credentials** for that user: SES console → *SMTP settings* → *Create SMTP credentials* gives a user name
   and a password – they go into `SMTP_USER` (variable) and `SMTP_PASS` (secret). The SMTP password is **not** the
   IAM secret key: SES derives it from the key per region. When only an access key ID + secret are handed over,
   `php server/deploy/ses-smtp-password.php` (region `eu-west-1`) prints the matching SMTP password; the user name is
   the access key ID.
3. The account must be **out of the SES sandbox** in eu-west-1 (production access): in the sandbox SES delivers only
   to verified addresses, which would break every reader's sign-in. Ask, and test with an address outside the team.

The mail from SES carries the domain's DKIM signature (set up with the domain verification); nothing in the image
signs anything. SES overwrites the `Message-ID` the API writes – that is fine.

**Check** after the credentials are in – one mail through the deployed container's settings, with the SMTP error word
for word when it fails:

```bash
kamal app exec -d production --reuse 'php /opt/osct/mail-test.php you@example.com'
```

`php server/deploy/mail-test.php you@example.com` does the same locally with `server/api/config.local.php` or `OSCT_*`
variables (`OSCT_MAIL_TRANSPORT=smtp OSCT_SMTP_USER=… OSCT_SMTP_PASS=… php …`) – the way to try the SES credentials from a
laptop before they go into GitHub. Typical replies: `535 Authentication Credentials Invalid` = wrong SMTP user/password
(or the IAM secret key used as the password); `554 Message rejected: Email address is not verified` = `MAIL_FROM` is
not at the verified domain, or the recipient is not verified while the account is still in the sandbox;
`454 Throttling failure` = the account's sending limit. The API logs the same errors (`kamal app logs`) when a reader's
request fails – readers see "Something went wrong" (HTTP 502 `mail-failed`).

Staging without credentials: `MAIL_TRANSPORT=log` writes the mails to a file inside the container (read it with
`kamal app exec -d staging --reuse 'cat /tmp/osct-mail.log'`); nobody can sign in on a phone then.

## Setting up a server

Once per server – Debian or Ubuntu with Docker (Kamal installs Docker itself when it is missing):

1. DNS: an `A` record for the domain (`osct.porschuetz.de`, `osct.buildingfictions.com`) to the server;
   ports 80 and 443 open (kamal-proxy answers both, Let's Encrypt needs 80).
2. SSH: the deploy key's public part in `~/.ssh/authorized_keys` of `SSH_USER`.
3. The internal Docker networks of the two destinations ([A shared server](#a-shared-server)):
   `docker network create --internal osct` and `docker network create --internal osct-staging`.
4. The GitHub environment's variables and secrets (table above). `SSH_KNOWN_HOSTS` comes from the server itself, so it
   cannot be faked on the way: `ssh-keyscan -t ed25519 localhost` there, with `localhost` replaced by `SSH_HOST`.
5. The first deploy from a laptop (it boots the proxy and the database, then the app):
   ```bash
   gem install kamal
   set -a; . server/.env; set +a
   kamal setup -d staging        # or -d production
   ```
   Every later deploy is a push to the branch – or `kamal deploy -d staging` by hand.

### A shared server

Staging, production and other apps may share one server: the service names differ (`osct-staging`, `osct`), so the
containers, the database accessories (`osct-staging-db`, `osct-db`) and their data folders are separate; kamal-proxy
routes by domain.

Every Kamal app on a server is on the network `kamal` (kamal-proxy reaches the apps through it), so anything on it
could reach a database there. The databases are therefore only on an internal network of their destination – `osct`
or `osct-staging` (`config/deploy.<destination>.yml`), created once per server (above) – which the app joins next to
`kamal`. Staging and production cannot reach each other's database, other apps cannot reach either, and the
databases have no way out to the internet. The containers have fixed limits (production 1 GB / 1 CPU and 1 GB for the
database, staging half of that), so one app cannot starve the others. A database already running keeps its network
until `kamal accessory reboot db -d <destination>`.

## Day to day

```bash
kamal deploy -d staging                        # what the workflow does
kamal app logs -d staging -f                   # Apache access log + API errors
kamal rollback -d production <git sha>         # back to an earlier image still on the server
kamal app exec -d staging --reuse 'php /opt/osct/migrate.php'   # migrate by hand (also POST /api/admin/migrate)
kamal app exec -d production --reuse 'php /opt/osct/mail-test.php you@example.com'   # one mail through SES (Mail above)
kamal accessory exec -d staging db --reuse 'mariadb -uosct -p"$MARIADB_PASSWORD" osct'   # SQL shell
kamal accessory exec -d production db --reuse 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" osct' > backup.sql
kamal details -d production                    # proxy, app and accessory containers
```

The database files live on the server in `<service>-db/data` (the SSH user's home) and survive deploys, restarts and
`kamal app remove`. `kamal accessory remove db` deletes the container, **not** the folder; delete the folder only on
purpose. To bring the data from the old shared host: dump it there (phpMyAdmin or `mysqldump`), then
`kamal accessory exec -d staging db --reuse -i 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" osct' < dump.sql` –
the migration on the next start adds whatever columns the dump lacks.

Releases: GitHub releases are optional now (notes only – nothing deploys from them); the version on `main` is tagged
by `tag-version.yml` as before.

## Board

After each successful deploy, `board-status.yml` (`.github/scripts/board-status.js`) moves the issues it shipped on
the board **OSCT** (#11): every `Fixes #N` in the deployed commits goes to **Review on staging** (staging deploy, Kamal
or the temporary FTPS upload) or **Deployed** (production), with a comment naming the version and the deploy run.

- Deployed commits = since the previous successful run of the same deploy workflow on that branch. A Kamal run that
  skipped its Deploy step (no `SSH_HOST`) does not count.
- Only forward: an issue that is already Deployed or Done stays. `Refs #N` (a step) moves nothing. Done is Tilman's.
- **Repo secret `PROJECT_TOKEN`** (Settings → Secrets → Actions): a classic personal access token with the scope
  `project` – the workflow token cannot write to a user-owned project. Without it the run notes that and stays green.
- GitHub starts `workflow_run` workflows only from the default branch: it runs once `board-status.yml` is on `main`.
- The board's built-in workflow "Item closed" stays **off** (or set to Deployed): a `Fixes #N` merged into `main` closes
  the issue at once, and "→ Done" would skip Deployed.
