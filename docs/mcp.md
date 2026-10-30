# MCP server: a Claude session as an editor

`mcp/` is an [MCP](https://modelcontextprotocol.io) server (stdio, Node 22) over the editor's API, so an AI client –
Claude Code in this repository, Claude Desktop – works on a book the way the editor does: it reads the tree and a
spread, places entities on targets, sets components and filters, uploads files, writes plugin sources and publishes a
draft for a check. It is built after SCUTOONS' MCP (`scutoons/tools/mcp`, `agents/MCP.md` there) so the two can be one
in the white-label core later: **the API is the only authority** – every call carries the user's session token and the
API's role checks decide – and **readers are reached only by a person**: a save changes the book's draft and hands back
the editor's link, where the person checks it on the stage; publishing to production is the editor's own button. The
decision: `agents/research/2026-10-30-mcp-server.md`.

```
mcp/
  bin/osct-mcp.mjs     the start: bundles src/ with the shared contract (esbuild, a tenth of a second) and runs it
  src/main.ts          stdio entry – config, the user behind the token, the server
  src/config.ts        OSCT_API_URL, OSCT_EDITOR_TOKEN, OSCT_EDITOR_URL
  src/api.ts           the API over HTTP: JSON calls, uploads, errors as the API's { code, message }
  src/services.ts      roles → services (editor), GET /user, the editor app's links
  src/user.ts          the server for one user: whoami, the sign-in pair, the editor's tools when the role is there
  src/content.ts       books, spreads, entities, targets, entries, assets, draft, publish, the logs
  src/code.ts          the Code tab's plugin sources
  src/model.ts         the content model from shared/, the guard over one entity, what a plugin source registers
  src/prompts.ts       the server's instructions and the prompts (editor, add-target)
  src/resources.ts     osct://rules/content-model, osct://guides/plugins (docs/plugins.md)
  test/                unit tests with a mocked fetch, the end-to-end test against the PHP API (vitest)
```

## Signing in

The server talks to one API (`OSCT_API_URL`, default `http://127.0.0.1:8080/api` – the local dev API) as one user:

- **A token in the environment** – `OSCT_EDITOR_TOKEN`: the editor's session token (the editor app keeps it in
  `localStorage` under `osct-editor-session`; a `POST /auth/verify` or `/auth/password` answers it). With it the editor's
  tools are listed from the start; the API's role checks still decide every call.
- **The sign-in pair** – without a token the server starts with `whoami`, `sign_in_request { email }` and
  `sign_in_verify { requestId, code }`: the API mails a 6-digit code (locally `MAIL_TRANSPORT=log` writes it to the mail
  log), the person gives it to the session, the token is kept for the process and never shown. With the role `editor`
  the tools, prompts and rules appear (the client is told the list changed).

A signed-in user without the editor role gets `whoami`'s hint and no tools: an admin grants the role on the admin page
([admin](admin.md)). `OSCT_EDITOR_URL` names the editor app the links point at (default: the local dev editor
`http://localhost:5175/editor`, or `/editor` next to a deployed API).

## In Claude Code

The repository's `.mcp.json` (project scope) starts the server for every Claude Code session opened here:

```json
{ "mcpServers": { "osct": { "command": "node", "args": ["mcp/bin/osct-mcp.mjs"],
  "env": { "OSCT_API_URL": "${OSCT_API_URL:-http://127.0.0.1:8080/api}", "OSCT_EDITOR_TOKEN": "${OSCT_EDITOR_TOKEN:-}" } } } }
```

Once: `cd mcp && npm ci`. Then start the API (`cd client && npm run dev:api`, [editor, "Try it"](editor.md#try-it-the-morning-test-with-the-demo-scene)) and ask Claude
`whoami`. Against staging: `OSCT_API_URL=https://osct.porschuetz.de/api OSCT_EDITOR_TOKEN=… claude`. In another
checkout or for Claude Desktop: `claude mcp add osct -e OSCT_API_URL=… -e OSCT_EDITOR_TOKEN=… -- node <repo>/mcp/bin/osct-mcp.mjs`.

## The tools

Every result is JSON. Writes answer with `open`, the editor's link to check the draft; errors come back as the API's
`{ error: { status, code, message, …fields, hint } }` (`isError`). Ids are the API's (`[A-Za-z0-9_-]{1,64}`).

| tool | what |
|---|---|
| `whoami` | the user (email, roles), the service open, the API, the editor app. Call it first |
| `sign_in_request` · `sign_in_verify` | the sign-in by mail code (above) |
| `list_books` | the instance's books with their last publish |
| `import_book { book, url \| configuration \| source: "cdn", assetsBase? }` | replaces the book's rows from a game configuration (the reader's dev server serves its own at `/src/game.config.json`) |
| `get_book { book }` | the tree: spreads with entries and targets (entity inline or `{ ref }`), the unassigned entries |
| `get_spread { book, spread \| page }` | one spread, every target's entity resolved (a shared one with its `ref` next to it) |
| `get_entity { book, ref }` · `put_entity { book, ref, entity }` | a shared entity – the whole node tree (`EntityData`) |
| `put_target { book, target, entity? \| ref?, imageSrc?, print? }` | a target's own entity (null removes it), a shared one instead, its printed image, where it is printed |
| `add_entry { book, title, page, category?, body?, id?, target: { imageSrc, print?, entity? } }` · `delete_entry` | a new target on the spread of its page; the entry and target go |
| `add_spread { book, format: spread \| cover \| back, after?, id?, title? }` | a double page after `after` (later pages numbered on by two, `moved` counts the rows), the front or the back cover; the link opens the new spread |
| `put_spread { book, spread, title?, format?, passes? }` | a spread's title, format and its own post-processing (replaces the book's there; `[]` off, `null` the book's again) |
| `delete_spread { book, spread }` | an empty spread goes, later pages numbered back; 409 `spread-not-empty` with the entries, 409 `initial-spread` |
| `put_book_passes { book, passes \| null }` | the book's post-processing – the master chain every spread without its own shows |
| `put_environment { book, environment: { world, onionSky, worldSrc?, skySrc? } \| null }` | the world around the reader and the onion sky |
| `list_assets { book, kind? }` · `upload_asset { book, file, name? }` · `delete_asset { book, asset, force? }` | the library: a local file becomes an asset whose `url` nodes and targets name |
| `list_plugins` · `get_plugin` · `put_plugin { book, plugin, source }` · `delete_plugin` | the Code tab's sources; `put_plugin` names what the source registers and warns about a module the engine would refuse |
| `get_draft { book, part? }` | the draft as the engine loads it: manifest, configuration or files |
| `publish { book, env: local \| staging, note? }` | writes the draft into the content store of `env`; **production is refused** – the person's button in the editor |
| `list_versions` · `list_changes { book, limit? }` | the publish log, the change log |
| `describe_content_model { book? }` | node types and names, placement, filters, components, passes, the environment, printed placement, categories, formats – from `shared/`; with a book also the declared plugins with the components, node types and passes they recorded (with their parameters) and the Code tab's sources with the types read from them |

Before `put_entity`, `put_target` and `add_entry` send an entity, the shared guard (`shared/guards/game-config.ts`) runs over
it: a body that breaks the contract never reaches the API, the problems come back with their path (`entity.params.scale: …`).
When the tree names a type that is not built in, the book's plugins are read first (`model.ts` `knownPluginTypes`): the
declared plugins' recorded specs (content schema 2.14) go into the guard, so a plugin component's or node type's
parameters are checked like a built-in one's; the Code tab's sources give the types read from their text
(`registerComponent`, `registerLayer`, `registerNodeType`, `registerPass`). A node type no plugin of the book registers
is refused – unless a plugin is unknown (a Code tab source, a declared plugin of an older build): then a name like a
plugin's passes with a warning, as the API lets it through. A component type nobody knows passes with a warning – a
plugin must register it, the publish checks (409 `unknown-components`, `unknown-node-types`). `put_spread` and
`put_book_passes` check the passes, `put_environment` the environment against the same contract. Resources: `osct://rules/content-model` (the same as `describe_content_model`) and
`osct://guides/plugins` ([plugins](plugins.md)). Prompts: `editor` (how to work), `add-target { book, page, what }`.

## An example session

"Add a target on spread 30–31 with a tinted video":

1. `whoami` → editor@…, editor; `list_books` → `osct`.
2. `get_spread { book: "osct", page: 31 }` → *Studio B – videos*, pages 30–31, its targets and where they are printed.
3. `describe_content_model { book: "osct" }` → a video node lies flat by default; `rotation: [90, 0, 0]` stands it up;
   the book declares the plugin `tint` (a material layer with `color`, `opacity`, `blend`).
4. `upload_asset { file: "…/shadows.mp4" }` → `url`; `upload_asset { file: "…/shadows-print.jpg" }` → the printed image's `url`.
5. `add_entry { title: "Shadows", page: 31, category: "video", target: { imageSrc, print: { surface: "right", x: 40, y: 60, width: 80 },
   entity: { type: "video", assets: [{ id: "shadows", assetType: "video", src }], params: { rotation: [90, 0, 0], position: [0, 0, 0.3] },
   components: [{ type: "tint", color: "#f3cc94", opacity: 0.35 }] } } }` → `p31-shadows` on `studio-b`, `open: …/editor/osct/studio-b/`.
6. The person opens the link: the stage shows the target with the standing, tinted video; **Save placement** or the gizmo
   fine-tune it; `publish { env: "local" }` for the reader on this machine, production in the editor.

## Tests

`cd mcp && npx tsc --noEmit && npx vitest run`: unit tests with a mocked `fetch` for every tool (`test/*.test.ts`), and
`test/e2e.test.ts` – the real server over stdio against the real API (PHP's built-in server on a free port, a fresh
SQLite, mails to a log, as `server/tests/api-test.php`): sign in through the mail log, import, edit, add a target with an
uploaded file, a plugin source, publish to local. Skipped with a message when `php` is not on the path. CI runs both
(`checks.yml`, job *MCP server*).

## Limits

- The stage cannot be seen: the agent reads the draft, the person looks. A headless render of the mock stage is a
  follow-up (#75's note).
- Entries' texts and the tutorial are imported, not edited here (as in the editor); spreads are added, renamed and
  removed (`add_spread`, `put_spread`, `delete_spread`).
- The server follows the API: a new endpoint is a new tool (`src/content.ts`), nothing else moves. Differences to
  SCUTOONS' server and what an agent still misses: the research note.
