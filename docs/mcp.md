# MCP server: an AI agent as an editor

`mcp/` is an [MCP](https://modelcontextprotocol.io) server (stdio, Node 22) over the editor's API, so an AI agent – any
MCP client: Claude Code in this repository, Claude Desktop, Codex CLI, OpenCode, Cursor … – works on a book the way the
editor does: it reads the tree and a
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

- **An AI connection's token** – the usual way: on the editor's books page, *AI connections* → a name → **Create
  token** ([editor](editor.md#ai-connections)) – best named after the agent and the machine ("Codex on my laptop"); the
  token `osct_…` is shown once, and the setup snippets beside it have it filled in. Set it as `OSCT_EDITOR_TOKEN`: the server skips the mail sign-in, lists the editor's tools from the start,
  and `whoami` answers `signedIn: { with: "token", token: { name, prefix, expiresAt, lastUsedAt } }`. The token is the
  person with their roles, but the API refuses it every publish (any environment), the tokens, the password and the
  account (403 `not-for-ai` – the tool's error hints to hand it to the person); every save names it in the change log
  (`list_changes` → `token`). It expires after 182 days unless renewed on the books page (401 `token-expired` – renewed,
  the same token works again); revoked there it stops at once (401 `token-revoked`). [Server, "AI
  connections"](server.md#ai-connections).
- **A session token** – `OSCT_EDITOR_TOKEN` may also be an editor's session token (the editor app keeps it in
  `localStorage` under `osct-editor-session`; a `POST /auth/verify` or `/auth/password` answers it): the person's full
  rights, publish to the instance's own environment (local / staging) included; `whoami` says `signedIn: { with: "session" }`.
- **The sign-in pair** – for people without a token: without one the server starts with `whoami`, `sign_in_request { email }` and
  `sign_in_verify { requestId, code }`: the API mails a 6-digit code (locally `MAIL_TRANSPORT=log` writes it to the mail
  log), the person gives it to the session, the token is kept for the process and never shown. With the role `editor`
  the tools, prompts and rules appear (the client is told the list changed).

A signed-in user without the editor role gets `whoami`'s hint and no tools: an admin grants the role on the admin page
([admin](admin.md)). `OSCT_EDITOR_URL` names the editor app the links point at (default: the local dev editor
`http://localhost:5175/editor`, or `/editor` next to a deployed API).

## Connecting an agent

The server runs from a checkout of the repository: once `cd mcp && npm ci` (Node 22). Any MCP client that starts a
stdio server needs four things – the editor's books page shows them under *Connect an AI agent*
([editor](editor.md#ai-connections)) with the instance's values, a token just made and the path the person typed once:

| | what |
|---|---|
| name | `osct-<env>` after the instance's environment (`GET /health` → `env`, the API's `ENV` setting – [server](server.md#configuration)): `osct-local`, `osct-staging`, `osct-production`. One name per instance, so several sit side by side, and none is `osct` – the repository's own `.mcp.json` (below) has that name, and in Claude Code a project's server hides a user server of the same name |
| command | `node <checkout>/mcp/bin/osct-mcp.mjs` – the path to the file in the person's osct checkout (the editor cannot know it: the guide's field takes it once, the browser keeps it, a folder gets `mcp/bin/osct-mcp.mjs` appended) |
| `OSCT_API_URL` | the instance's API, absolute: `https://osct.porschuetz.de/api` |
| `OSCT_EDITOR_TOKEN` | an AI connection's token `osct_…` ([above](#signing-in)) |

Each client's own format, as the guide writes it (`editor/src/lib/mcp-setup.ts`, checked against each client's docs):

- **Claude Code** – one command for every project of the computer
  ([docs](https://code.claude.com/docs/en/mcp)); the name comes before the options – right after `-e` the CLI would
  read it as another variable:
  ```sh
  claude mcp add osct-staging --scope user -e OSCT_API_URL=https://osct.porschuetz.de/api -e OSCT_EDITOR_TOKEN=osct_… -- node /path/to/osct/mcp/bin/osct-mcp.mjs
  ```
- **Claude Desktop** – the `mcpServers` entry of `claude_desktop_config.json` (Settings → Developer → Edit Config),
  then restart ([docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers)):
  ```json
  { "mcpServers": { "osct-staging": { "command": "node", "args": ["/path/to/osct/mcp/bin/osct-mcp.mjs"],
    "env": { "OSCT_API_URL": "https://osct.porschuetz.de/api", "OSCT_EDITOR_TOKEN": "osct_…" } } } }
  ```
- **Codex CLI** – a table in `~/.codex/config.toml` ([docs](https://developers.openai.com/codex/mcp)):
  ```toml
  [mcp_servers.osct-staging]
  command = "node"
  args = ["/path/to/osct/mcp/bin/osct-mcp.mjs"]

  [mcp_servers.osct-staging.env]
  OSCT_API_URL = "https://osct.porschuetz.de/api"
  OSCT_EDITOR_TOKEN = "osct_…"
  ```
- **OpenCode** – a local server under `mcp` in `~/.config/opencode/opencode.json` (every project) or a project's
  `opencode.json`; the command is one array, the variables are `environment`
  ([docs](https://opencode.ai/docs/mcp-servers/)):
  ```json
  { "$schema": "https://opencode.ai/config.json", "mcp": { "osct-staging": { "type": "local",
    "command": ["node", "/path/to/osct/mcp/bin/osct-mcp.mjs"], "enabled": true,
    "environment": { "OSCT_API_URL": "https://osct.porschuetz.de/api", "OSCT_EDITOR_TOKEN": "osct_…" } } } }
  ```
- **Cursor** – the `mcpServers` entry of `~/.cursor/mcp.json` (every project) or a project's `.cursor/mcp.json`
  ([docs](https://cursor.com/docs/context/mcp)):
  ```json
  { "mcpServers": { "osct-staging": { "type": "stdio", "command": "node", "args": ["/path/to/osct/mcp/bin/osct-mcp.mjs"],
    "env": { "OSCT_API_URL": "https://osct.porschuetz.de/api", "OSCT_EDITOR_TOKEN": "osct_…" } } } }
  ```

A Windows path goes in as it is: the JSON and TOML snippets escape its backslashes, the command quotes it when it holds
a space. Then ask the agent `whoami` – it names the person and the token – and `describe_content_model` before the first
change.

### In this repository (development)

The repository's `.mcp.json` (project scope) starts the server as `osct` for every Claude Code session opened here,
against the local dev API:

```json
{ "mcpServers": { "osct": { "command": "node", "args": ["mcp/bin/osct-mcp.mjs"],
  "env": { "OSCT_API_URL": "${OSCT_API_URL:-http://127.0.0.1:8080/api}", "OSCT_EDITOR_TOKEN": "${OSCT_EDITOR_TOKEN:-}" } } } }
```

Start the API (`cd client && npm run dev:api`, [editor, "Try it"](editor.md#try-it-the-demo-book-or-the-fixtures-studio-spreads))
and ask `whoami`. Against staging for one session: `OSCT_API_URL=https://osct.porschuetz.de/api
OSCT_EDITOR_TOKEN=osct_… claude`; for good, the `osct-staging` server above.

## The tools

Every result is JSON. Writes answer with `open`, the editor's link to check the draft; errors come back as the API's
`{ error: { status, code, message, …fields, hint } }` (`isError`). Ids are the API's (`[A-Za-z0-9_-]{1,64}`).

| tool | what |
|---|---|
| `whoami` | the user (email, roles), how the server is signed in (`signedIn`: an AI connection's token with its name, a session, or null), the service open, the API, the editor app. Call it first |
| `sign_in_request` · `sign_in_verify` | the sign-in by mail code, for people without a token (above) |
| `list_books` | the instance's books with their last publish |
| `preview_import { url \| configuration \| source: "cdn", assetsBase? }` | read-only: what an import would bring in, nothing imported (the API's [import preview](server.md#import-preview)) – the content base and its `latest.json`, `incoming` (the one book's id and title, the build, its date, app and schema version), `counts`, and `existing`: the draft of that id it would replace (null: a new book) – with `next`, what to tell the person and the `import_book` call that follows |
| `import_book { book, url \| configuration \| source: "cdn", assetsBase?, confirm? }` | replaces the book's rows from a game configuration (the reader's dev server serves its own at `/src/game.config.json`). **Over a book that exists, two steps** (the API's, [server](server.md#import-with-a-version-comparison)): the first call imports nothing and answers `{ imported: false, comparison, confirmation, next }` – the incoming build (id, date, app and schema version) against what the draft is based on and its edits since that import; the agent shows it to the person and asks, and only with their yes calls again with the same arguments and `confirm: confirmation.id` (10 minutes, one use; a change meanwhile answers `void` with a new comparison). A new book is imported at once. `book` is the configuration's own `book.id` (`preview_import`'s `incoming.book`); another id is refused (400 `invalid-configuration`) |
| `get_book { book }` | the tree: spreads with entries and targets (entity inline or `{ ref }`), the unassigned entries |
| `get_spread { book, spread \| page }` | one spread, every target's entity resolved (a shared one with its `ref` next to it) |
| `get_entity { book, ref }` · `put_entity { book, ref, entity }` | a shared entity – the whole node tree (`EntityData`) |
| `put_target { book, target, entity? \| ref?, imageSrc?, print? }` | a target's own entity (null removes it), a shared one instead, its printed image, where it is printed |
| `add_entry { book, title, page, category?, body?, id?, target: { imageSrc, print?, entity? } }` | a new target on the spread of its page |
| `delete_entry { book, entry, confirm?, deleteFiles? }` | the entry with its target, the entity used only there and – only if asked – the Library files used only there. **Two steps** (the API's, [server](server.md#removing-a-spread-or-an-entry)): the first call removes nothing and answers `{ deleted: false, impact, confirmation, next }`; the agent shows the impact to the person and asks, and only with their yes calls again with the same arguments and `confirm: confirmation.id` (`deleteFiles: true` only when the person asked for the files used only there; files used elsewhere are never deleted). A change meanwhile answers `void` with a fresh impact |
| `add_spread { book, format: spread \| cover \| back, after?, id?, title? }` | a double page after `after` (later pages numbered on by two, `moved` counts the rows), the front or the back cover; the link opens the new spread |
| `put_spread { book, spread, title?, format?, passes? }` | a spread's title, format and its own post-processing (replaces the book's there; `[]` off, `null` the book's again) |
| `delete_spread { book, spread, confirm?, deleteFiles? }` | the spread with everything on it – entries, targets, the entities used only there, later pages numbered back – in the same two steps as `delete_entry` (the impact also names the spread, `pagesBack` and the shared entities kept); 409 `initial-spread` for the spread the book opens on |
| `put_book_passes { book, passes \| null }` | the book's post-processing – the master chain every spread without its own shows |
| `put_environment { book, environment: { world, onionSky, worldSrc?, skySrc? } \| null }` | the world around the reader and the onion sky |
| `list_assets { book, kind? }` · `upload_asset { book, file, name? }` · `delete_asset { book, asset, force? }` | the library: a local file becomes an asset whose `url` nodes and targets name – a shader (glsl, frag, vert, wgsl; kind `shader`, #186) one a plugin loads by its `url` (`api.loadText`) |
| `list_plugins` · `get_plugin` · `put_plugin { book, plugin, source }` · `upload_plugin { book, file, plugin?, replace? }` · `plugin_usages { book, plugin }` · `delete_plugin { book, plugin, force? }` | the Code tab's sources (the Library's scripts); `put_plugin` names what the source registers and warns about a module the engine would refuse; `upload_plugin` makes a local `.ts` / `.js` file a source (its id from the file's name, `replace: true` for an existing one); `delete_plugin` is refused while the draft uses what it registers (409 `plugin-in-use`) unless `force` |
| `get_draft { book, part? }` | the draft as the engine loads it: manifest, configuration or files |
| `publish { book, env?, note? }` | writes the draft into the content store of the instance's own environment (the default; `GET /editor/environments` names it) – an instance publishes nowhere else, another `env` is the API's 403 `other-environment`. The answer's `store` is `cdn` or `server`; with `server` it carries the `warning` (no CDN connected) for the person. **production is refused** – the person's button in the editor; with an AI connection's token every environment is refused (403 `not-for-ai`) |
| `list_versions` · `list_changes { book, limit? }` | the publish log, the change log |
| `describe_content_model { book? }` | node types and names, placement, filters, components, passes, the environment, printed placement, categories, formats – from `shared/`; with a book also the declared plugins with the components, node types and passes they recorded (with their parameters) and the Code tab's sources with the types read from them |

Before `put_entity`, `put_target` and `add_entry` send an entity, the shared guard (`shared/guards/game-config.ts`) runs over
it: a body that breaks the contract never reaches the API, the problems come back with their path (`entity.params.scale: …`).
When the tree names a type that is not built in, the book's plugins are read first (`model.ts` `knownPluginTypes`): the
declared plugins' recorded specs (content schema 2.14) go into the guard, so a plugin component's or node type's
parameters are checked like a built-in one's; the Code tab's sources give the types read from their text
(`registerComponent`, `registerLayer`, `registerNodeType`, `registerPass`, `registerMaterial`, `registerTexture`). A node's
`material` (schema 2.17) is checked against the recorded materials (its values like a component's); one no plugin of the
book registers is refused when every plugin is known, else it passes with a warning. A node type no plugin of the book registers
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
   fine-tune it; `publish` (the local API's own environment, `local`) for the reader on this machine, production in the
   editor.

## Tests

`cd mcp && npx tsc --noEmit && npx vitest run`: unit tests with a mocked `fetch` for every tool (`test/*.test.ts`), and
`test/e2e.test.ts` – the real server over stdio against the real API (PHP's built-in server on a free port, a fresh
SQLite, mails to a log, as `server/tests/api-test.php`): sign in through the mail log, import, re-import in two steps
(the comparison, then the confirmation), edit, add a target with an uploaded file, a plugin source, publish to local
(staging refused: 403 `other-environment`), remove an entry and spreads in two steps (the impact, then the
confirmation); then a second server started with an AI connection's token made over
the API (whoami names it, a save names it in the change log, a removal takes the same two steps and names it too, publish is refused, a revoked token is 401). Skipped with a message when `php` is not on the path. CI runs both
(`checks.yml`, job *MCP server*).

## Limits

- The stage cannot be seen: the agent reads the draft, the person looks. A headless render of the mock stage is a
  follow-up (#75's note).
- Entries' texts and the tutorial are imported, not edited here (as in the editor); spreads are added, renamed and
  removed (`add_spread`, `put_spread`, `delete_spread`).
- The server follows the API: a new endpoint is a new tool (`src/content.ts`), nothing else moves. Differences to
  SCUTOONS' server and what an agent still misses: the research note.
