# Orchestration and night shifts – OSCT's specifics

The general rules are workspace-wide: **`C:\Development\ORCHESTRATION.md`** (roles, resources, coordination between
projects, cloud sessions, the worker brief, merging, what needs Tilman, screenshots in the chat, lessons). Read it first.
This file adds what is special to OSCT. Written after the first night shift, 2026-10-29/30 (1.26.4 → 1.36.x).

## Branches, merging, versions
- No PRs: workers push a branch, the orchestrator merges into `develop` with `--no-ff` after green CI (Tilman,
  2026-10-29). `develop` deploys to staging (osct.porschuetz.de); `main` is production and needs Tilman.
- Branch prefixes: `feature/`, `bug/`, `hotfix/` only (RULES #26).
- Bump (RULES #23): features and content schema changes MINOR, fixes, chores and shipped docs (`client/public/`)
  PATCH; changes only in `agents/`, `docs/` or `*.md` need none. The version lives in `client/`, `scripts/` and `mcp/`
  `package.json` (and lines 3 and 9 of their locks), `server/api/src/Version.php` and `VERSION` in `mcp/src/user.ts`;
  `bash .github/scripts/check-version.sh --strict`.
- A worker's new content schema row in `docs/content.md` has `next` as its app version; the orchestrator fills it.
- Board: the OSCT project (`gh project … 5 --owner mandymozart`), lanes Backlog → In progress → Review on staging.
  Closing an issue on `develop` needs a comment (develop is not the default branch, `Fixes #N` doesn't close it).
- After the deploy: `https://osct.porschuetz.de/api/health` shows the version; both "Deploy staging" runs are green.

## Contracts a worker must know
- Content schema: any change in `shared/` bumps the schema MINOR (RULES #10), `npm run schema:lock`.
- SQL: every named parameter once per query (MySQL refuses repeats, #161); LIKE through `Db::contains` +
  `ESCAPE '!'`. CI runs the API test on SQLite and MariaDB (#168); locally `docker compose up -d db`.
- The editor runs on SvelteKit 3 since 1.35.2: imports `#lib/…` with extension, links through `resolve()`.
- `verbatimModuleSyntax` is on everywhere since 1.36.1: type-only imports as `import type`.
- Install with `npm ci`; a new dependency with `npx npm@latest install` (local npm 11.4.2 crashes on peer deps).
- PHP: `/c/php/php-8.3.24/php`.

## Checks per area (one at a time)
- editor: `npm run check`, `npx vitest run` (and `npm run build` for config changes)
- client / engine: from `client/`, `OSCT_CONTENT_DIR=fixtures/content npm --prefix ../scripts start`, then
  `npx tsc --noEmit` and `npx vitest run`
- scripts: tsc, vitest · mcp: tsc, vitest (PHP on PATH for the e2e test) · server: `php server/tests/api-test.php`
- plugin API stubs: `npm run plugin-api -- --check` in `editor/`

## Running the editor for screenshots (workers that need a look)
- PHP API from the main checkout `C:\Development\osct\osct` (its local SQLite holds the demo book `demo` and the test
  account): `php -S 127.0.0.1:8080 -t server server/api/index.php`.
- The reader's dev server serves the demo's media and plugins: from the main checkout's `client/`,
  `npx vite --mode http --port 5174 --strictPort --host 127.0.0.1`.
- The worker's own editor: `npx vite dev --port <518x> --strictPort --host 127.0.0.1` in its worktree's `editor/`.
- Sign in with the local test account `editor@osct.test`: `POST /api/auth/request`, the code from the newest mail in
  `server/api/db/mail.log` (the subject starts with it), `POST /api/auth/verify`; localStorage key
  `osct-editor-session`. Never commit the code or token; sign out at the end.
- Headless Edge over CDP (`--headless=new --remote-debugging-port=<93xx> --user-data-dir=<temp>`) and a small Node 22
  script: `Page.addScriptToEvaluateOnNewDocument` for the token, `Emulation.setDeviceMetricsOverride` (and touch) per
  width (360 / 768 / 1280).
- Don't save edits to the demo draft; undo with *Back to the draft*. Re-importing book `demo` from
  `https://buildingfictions.b-cdn.net/demo` is allowed (local test data).
- The S22: `adb` (PowerShell), `adb forward tcp:9444 localabstract:chrome_devtools_remote` (Chrome or Brave), CDP
  `Input.dispatchTouchEvent` for gestures; the local editor reaches it through `adb reverse` (the editor dev server
  listens on IPv6 only – forward 127.0.0.1 to `[::1]`).

## Ports in use when OSCT runs at night
8080 API · 5174 reader · 5175–5199 editors · 9333–9399 headless Edge · 9444 the phone's DevTools. Tell the other
project's orchestrator before taking others.
