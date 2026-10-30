<p align="center">
  <img src="docs/assets/mark.png" alt="Mark the Page" width="220">
</p>

# Onion Skin & Crocodile Tears

Web AR companion app for Kévin Bray's book (buildingfictions). Scan the pages, unlock the entries.
Staging: https://osct.porschuetz.de (`develop`) · Production: https://osct.buildingfictions.com (`main`).

## Quick start

Node 22.

```bash
cd client && npm install
npm run content      # builds the content into the app (once, and after content changes)
npm run dev
```

`npm run content` builds the content source named by `OSCT_CONTENT_DIR` (environment or `scripts/.env`). Without
the book content, use the test fixture: `OSCT_CONTENT_DIR=fixtures/content`.

Open https://localhost:5173 (on a phone: `https://<your-ip>:5173`, accept the self-signed certificate once –
the camera only works over https). The accounts API runs locally with `npm run dev:api` ([server](docs/server.md)).

## Repository

| Folder | What |
|---|---|
| `engine/` | The base of reader and editor: the content runtime and the AR scene (three.js, trackers behind one interface) – a source folder both apps compile (`@engine/*`) |
| `client/` | The reader: TypeScript, Vite, vanilla web components; the engine with the 8th Wall tracker |
| `editor/` | The authors' editor: a SvelteKit app at `/editor` – the engine over the mock stage, saving and publishing through the API |
| `scripts/` | Content build and the `osct` CLI (content sync to the CDN), delivery import |
| `server/` | Accounts API (plain PHP 8, PDO) and the Docker image's Apache config |
| `mcp/` | The MCP server: an AI agent (any MCP client) works on a book as a signed-in editor over the API (stdio, Node 22) |
| `shared/` | The content contract: game-configuration types and guards used by app and build |
| `fixtures/content/` | Test fixture with the content layout – CI and the tests build it |
| `fixtures/demo/` | The demo book: a sandbox that uses everything the editor and the engine can do – [plugins](docs/plugins.md) "The demo book" |
| `docs/` | Documentation (below) · `agents/` – plan, rules and memory for agent sessions ([CLAUDE.md](CLAUDE.md)) |

The book's content is not in the repository: its source lives in a folder of its own, the built content is served
from a CDN. The content build turns the source into the app's configuration (`client/src/game.config.json`) and an
optimised copy of the media (`client/public/assets/content/`); neither is in git.

## Documentation

- [Content guide](docs/content.md) – writing content (spreads, entries, entities, tutorial), the content build,
  importing a delivery
- [Content on the CDN](docs/content-cdn.md) – versions, the `osct` CLI (status, sync, purge), loading in the app
- [Content out of git](docs/content-out-of-git.md) – the one-time removal of the content from the repository
- [Game store](docs/game-store.md) · [Managers](docs/managers.md) · [BaseStore](docs/base-store.md) – app state
- [Pages](docs/pages.md) · [Components](docs/components.md) · [Error page](docs/error-page.md) – the UI
- [Tracking](docs/tracking.md) · [Look-around](docs/look-around.md) – the AR scene
- [Editor](docs/editor.md) – the authors' tool at `/editor`: engine, mock stage, saving to the database, publishing
- [Tutorials](client/public/docs/tutorials/index.html) – the content workflow on one page (sync, import, save, publish), bringing a book into the editor (the CDN, a URL, a file, the assets base, what is on the CDN), a walk through the demo book and a tour of the editor's tools, with screenshots, shipped at `/docs/tutorials/`
- [Plugins](docs/plugins.md) – writing the book's own code: a layer, a component, the Code tab, the content build
- [Admin](docs/admin.md) – the instance's users and roles at `/editor/admin`, the newsletter CSV
- [MCP server](docs/mcp.md) – an AI agent as an editor over the API (`mcp/`): signing in, connecting each client, the tools, an example
- [Languages](docs/i18n.md) – UI texts and translations
- [Server](docs/server.md) – the accounts API
- [Deploy](docs/deploy.md) – Kamal, staging and production, the board
- [Changelog](docs/CHANGELOG.md)

Rules for the code (naming, imports, versions, comments) are in [agents/RULES.md](agents/RULES.md).

## Tests

One approach per layer; all of them run in CI (`.github/workflows/checks.yml`) on every push.

| Layer | Where | Run |
|---|---|---|
| App: store, managers, services, utils, components – and the engine | `client/src/**/__tests__/*.test.ts`, `engine/src/**/__tests__/*.test.ts` (vitest, happy-dom – the engine's run with the client's) | `cd client && npx tsc --noEmit && npx vitest run` |
| Editor: panels, stage, plugins, the plugin API stubs | `editor/src/**/__tests__/*.test.ts` (vitest, happy-dom) | `cd editor && npm run check && npm test && npm run plugin-api -- --check` |
| Content build, CDN sync and purge planning, delivery import | `scripts/test/*.test.ts` (vitest, node) | `cd scripts && npm test` |
| Accounts API | `server/tests/api-test.php` (end to end: PHP built-in server + SQLite, or MariaDB – docs/server.md "Tests") | `php server/tests/api-test.php` · `OSCT_TEST_DB=mysql php server/tests/api-test.php` (after `docker compose up -d db`) |
| MCP server | `mcp/test/*.test.ts` (vitest: a mocked fetch per tool; end to end over stdio against the PHP API) | `cd mcp && npx tsc --noEmit && npm test` |

The client tests need a built game configuration (`npm run content`, the fixture is enough). Test content is
always the fixture, never the book (RULES #8).

## Image tracking

The app recognises the book's pages with the open source image tracking engine of
[8th Wall](https://github.com/8thwall/8thwall) by Niantic Spatial – the former commercial 8th Wall platform,
discontinued and released under the MIT licence (npm `@8thwall/engine`). Its licence ships with the app
next to the engine files (`assets/xr8/LICENSE`).
