# MCP server: an AI agent as an editor

`mcp/` is an [MCP](https://modelcontextprotocol.io) server (stdio, Node 22) over the editor's API, so an AI agent – any
MCP client: Claude Code in this repository, Claude Desktop, Codex CLI, OpenCode, Cursor … – works on an experience the way the
editor does: it reads the tree and a
scene, places entities on targets, sets components and filters, uploads files, writes plugin sources and publishes a
draft for a check. It is built after SCUTOONS' MCP (`scutoons/tools/mcp`, `agents/MCP.md` there) so the two can be one
in the white-label core later: **the API is the only authority** – every call carries the user's session token and the
API's role checks decide – and **readers are reached only by a person**: a save changes the experience's draft and hands back
the editor's link, where the person checks it on the stage; publishing to production is the editor's own button. The
decision: `agents/research/2026-10-30-mcp-server.md`.

```
mcp/
  bin/osct-mcp.mjs     the start: bundles src/ with the shared contract (esbuild, a tenth of a second) and runs it
  src/main.ts          stdio entry – config, the user behind the token, the server
  src/config.ts        OSCT_API_URL, OSCT_EDITOR_TOKEN, OSCT_EDITOR_URL
  src/api.ts           the API over HTTP: JSON calls, uploads, errors as the API's { code, message } (shared/api/errors.ts)
  src/services.ts      roles → services (editor), GET /user, the editor app's links
  src/user.ts          the server for one user: whoami, the sign-in pair, the editor's tools when the role is there
  src/content.ts       experiences, scenes and groups, entities, targets, entries, assets, draft, publish, the logs
  src/code.ts          the Code tab's plugin sources
  src/render.ts        render_scene's picture: the editor's render view in the computer's Chrome or Edge, headless (#89)
  src/render-tool.ts   the render_scene tool
  src/model.ts         the content model from shared/, the guard over one entity, what an experience's plugins register
  src/prompts.ts       the server's instructions and the prompts (editor, add-target)
  src/resources.ts     osct://rules/content-model, osct://guides/plugins (docs/plugins.md)
  test/                unit tests with a mocked fetch, the end-to-end test against the PHP API, the PHP rules (vitest)
```

The API's answers are typed once for this server and the editor (`shared/api/editor.ts`), with the API's rules both
use – ids, environment names, the Library's file kinds, the plugin-type scanner (`shared/api/rules.ts`) – and its error
shape and two-step confirmations (`shared/api/errors.ts`).

## Signing in

The server talks to one API (`OSCT_API_URL`, default `http://127.0.0.1:8080/api` – the local dev API) as one user:

- **An AI connection's token** – the usual way: on the editor's experiences page, *AI connections* → a name → **Create
  token** ([editor](editor.md#ai-connections)) – best named after the agent and the machine ("Codex on my laptop"); the
  token `osct_…` is shown once, and the setup snippets beside it have it filled in. Set it as `OSCT_EDITOR_TOKEN`: the server skips the mail sign-in, lists the editor's tools from the start,
  and `whoami` answers `signedIn: { with: "token", token: { name, prefix, expiresAt, lastUsedAt } }`. The token is the
  person with their roles, but the API refuses it every publish (any environment), the tokens, the password and any
  change of the account – its update options (consent), its language, its deletion; no tool offers one (403 `not-for-ai` – the tool's error hints to hand it to the person); every save names it in the change log
  (`list_changes` → `token`). It expires after 182 days unless renewed on the experiences page (401 `token-expired` – renewed,
  the same token works again); revoked there it stops at once (401 `token-revoked`). [Server, "AI
  connections"](server.md#ai-connections).
- **A session token** – `OSCT_EDITOR_TOKEN` may also be an editor's session token: a `POST /auth/verify` or
  `/auth/password` without `"session": "cookie"` answers it (a non-browser sign-in – [server, "Sessions, cookies and
  CSRF"](server.md#sessions-cookies-and-csrf)). The editor app has none to copy any more: its session is an HttpOnly
  cookie (#207). The person's full rights, publish to the instance's own environment (local / staging) included;
  `whoami` says `signedIn: { with: "session" }`.
- **The sign-in pair** – for people without a token: without one the server starts with `whoami`, `sign_in_request { email }` and
  `sign_in_verify { requestId, code }`: the API mails a 6-digit code (locally `MAIL_TRANSPORT=log` writes it to the mail
  log), the person gives it to the session, the token is kept for the process and never shown – a non-browser sign-in:
  `sign_in_verify` sends no `"session": "cookie"`, so the API answers the session token for `Authorization: Bearer`
  rather than set a cookie, and the server needs no CSRF token. With the role `editor`
  the tools, prompts and rules appear (the client is told the list changed).

A signed-in user without the editor role gets `whoami`'s hint and no tools: an admin grants the role on the admin page
([admin](admin.md)). `OSCT_EDITOR_URL` names the editor app the links point at (default: the local dev editor
`http://localhost:5175/editor`, or `/editor` next to a deployed API).

## Connecting an agent

The server is **one file every instance serves**: `/mcp/osct-mcp.mjs` next to the app
(`https://osct.porschuetz.de/mcp/osct-mcp.mjs`, #272) – `scripts/bundle.mjs` bundles `src/` with its dependencies, the
shared contract and `docs/plugins.md` into it, so it needs Node 22 and nothing else; the Docker image and the FTPS
staging deploy build it, the editor's dev server bundles it on request (`npm ci` in `mcp/` first), and it is always the
instance's deployed version (download it again after a deploy). Or from a checkout of the repository: once
`cd mcp && npm ci` (Node 22), then `mcp/bin/osct-mcp.mjs`, which bundles the checkout's current code at every start. Any MCP client that starts a
stdio server needs four things – the editor's experiences page shows them under *Connect an AI agent*
([editor](editor.md#ai-connections)) with the instance's values, a token just made and the path the person typed once:

| | what |
|---|---|
| name | `osct-<env>` after the instance's environment (`GET /health` → `env`, the API's `ENV` setting – [server](server.md#configuration)): `osct-local`, `osct-staging`, `osct-production`. One name per instance, so several sit side by side, and none is `osct` – the repository's own `.mcp.json` (below) has that name, and in Claude Code a project's server hides a user server of the same name |
| command | `node <file>` – where the person saved the downloaded `osct-mcp.mjs`, or `<checkout>/mcp/bin/osct-mcp.mjs` (the editor cannot know it: the guide's field takes it once, the browser keeps it, a folder gets `mcp/bin/osct-mcp.mjs` appended) |
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

Start the API (`cd client && npm run dev:api`, [editor, "Try it"](editor.md#try-it-the-demo-experience-or-the-fixtures-studio-scenes))
and ask `whoami`. Against staging for one session: `OSCT_API_URL=https://osct.porschuetz.de/api
OSCT_EDITOR_TOKEN=osct_… claude`; for good, the `osct-staging` server above.

## The tools

Every result is JSON. Writes answer with `open`, the editor's link to check the draft; errors come back as the API's
`{ error: { status, code, message, …fields, hint } }` (`isError`). Ids are the API's (`[A-Za-z0-9_-]{1,64}`).

| tool | what |
|---|---|
| `whoami` | the user (email, roles), how the server is signed in (`signedIn`: an AI connection's token with its name, a session, or null), the service open, the API, the editor app. Call it first |
| `sign_in_request` · `sign_in_verify` | the sign-in by mail code, for people without a token (above) |
| `list_experiences` | the instance's experiences with their last publish and where they are live, and `environments` – what each environment serves (or that its store cannot be read) |
| `preview_import { url \| configuration \| source: "cdn", assetsBase?, experience? }` | read-only: what an import would bring in, nothing imported (the API's [import preview](server.md#import-preview)) – with `source: "cdn"` the store of `experience` (default the instance's own) on the instance's CDN (#87); the content base and its `latest.json`, `incoming` (the one experience's id and title, the build, its date, app and schema version), `counts`, and `existing`: the draft of that id it would replace (null: a new experience) – with `next`, what to tell the person and the `import_experience` call that follows |
| `import_experience { experience, url \| configuration \| source: "cdn", assetsBase?, confirm? }` | replaces the experience's rows from a game configuration (the reader's dev server serves its own at `/src/game.config.json`). **Over an experience that exists, two steps** (the API's, [server](server.md#import-with-a-version-comparison)): the first call imports nothing and answers `{ imported: false, comparison, confirmation, next }` – the incoming build (id, date, app and schema version) against what the draft is based on and its edits since that import; the agent shows it to the person and asks, and only with their yes calls again with the same arguments and `confirm: confirmation.id` (10 minutes, one use; a change meanwhile answers `void` with a new comparison). A new experience is imported at once. `experience` is the configuration's own `experience.id` (`preview_import`'s `incoming.experience`); another id is refused (400 `invalid-configuration`) |
| `preview_delivery { experience, plan \| file, overwrite? }` | read-only: what a publisher's delivery would do to the draft ([Deliveries](#a-publishers-delivery-preview_delivery-import_delivery-322)) – `summary` (the comparison as the person reads it), `counts`, the `items` that are not `same`, `problems`, `warnings` and a `confirmation` (none while there are problems) – with `next`, the `import_delivery` call that follows the person's yes |
| `import_delivery { experience, plan \| file, overwrite?, confirm? }` | writes the delivery – **two steps**: without `confirm` nothing is written and the comparison comes back as from `preview_delivery`; with `confirm: confirmation.id` the comparison is made again and written only when it is still the one the person saw (else `void` and the new one). `overwrite: true` writes the conflicts too – only when the person asked |
| `list_deliveries { experience, limit? }` | the applied deliveries, newest first (the API's `GET …/deliveries`): name, source, counts, who, when, how many changes name it |
| `get_experience { experience }` | the tree (content schema 4.0): the experience (its `experience` data, the printed book in `experience.book`), the scenes in order with their surfaces, each with its entries (`scene`, `surface`) and targets (`place`, entity inline or `{ ref }`), the groups; `counts` scenes, entries, targets |
| `get_scene { experience, scene }` | one scene (label, group, surfaces with size and place, passes), every target's entity resolved (a shared one with its `ref` next to it); an unknown id answers the scenes there are |
| `get_entity { experience, ref }` · `put_entity { experience, ref, entity }` | a shared entity – the whole node tree (`EntityData`). An entity's own looks are its root node's components `reveal`, `found`, `lost` – `{ type: reveal, look: printLift, duration: 900 }` (#268; `describe_content_model` → `components.moments`) |
| `put_target { experience, target, entity? \| ref?, imageSrc?, place?, enabled? }` | a target's own entity (null removes it), a shared one instead, its printed image, where it lies – `place: { surface?, x, y, width, height? }` in mm from the top left corner of a surface of its entry's scene (`surface` by id, required when the scene has several; null removes it) –, switched on or off |
| `add_entry { experience, title, scene, surface?, category?, body?, caption?, id?, target?: { id?, imageSrc, place?, entity?, enabled? } }` | a new entry on its `scene` (and `surface` – needed when the scene has several) with its target, or without one: an entry read only in the list; the answer names its `scene`, the link opens it |
| `get_entries { experience, category?, search? }` | every entry in the experience's order with its fields as written (scene, surface, body, author, image, caption, media, tags) and its target's id and image; the link opens the experience |
| `update_entry { experience, entry, title?, category?, scene?, surface?, body?, author?, tags?, image?, caption?, media? }` | an entry's fields – only those sent change, `null` removes author, image, caption (the line under the picture, #289), media or the `surface` ([server](server.md#texts)); `scene` moves the entry (the answer names `scene` and `previousScene`). The body is Markdown with the experience's variables ([content](content.md#the-text-markdown-and-variables)): one whose braces do not parse (a brace not closed, a list, a function) is refused before it is sent (`invalid-entry-text`, with the problems), a stray `}` comes back as a warning; a link that is not http(s) is refused too |
| `update_experience { experience, title?, book? }` | the experience's title (the splash, the home page) and its printed book, `book: { author?, publisher? }` – the fields that change (`publisher: null` removes it); `book: null` removes the printed book (an experience without one – a wall, a room; only with the person's yes), a new one needs `author` (#320) |
| `delete_entry { experience, entry, confirm?, deleteFiles? }` | the entry with its target, the entity used only there and – only if asked – the Library files used only there. **Two steps** (the API's, [server](server.md)): the first call removes nothing and answers `{ deleted: false, impact, confirmation, next }`; the agent shows the impact to the person and asks, and only with their yes calls again with the same arguments and `confirm: confirmation.id` (`deleteFiles: true` only when the person asked for the files used only there; files used elsewhere are never deleted). A change meanwhile answers `void` with a fresh impact |
| `list_scenes { experience }` | the scenes in order ([server](server.md#scenes)) – position, label, group, passes, the surfaces (id, label, size, `place`, `reference` – the editor-only reference image), how many entries and targets lie on each – and the groups with their scenes |
| `add_scene { experience, preset?, after? \| before? \| position?, id?, label?, group?, surfaces? }` | a scene anywhere: `double` (default – one surface 460 × 320 mm), `single` (230 × 320 – a cover is a single scene first in the order) or `wall` (2000 × 1500 standing ahead, `rx` 90) give its surface unless `surfaces` names them; surfaces without a `place` are laid in a row by the server |
| `put_scene { experience, scene, label?, group?, surfaces?, passes?, apply? }` | a scene's label, group (`null`: out of it), surfaces (the whole list, at least one: `{ id, label?, widthMm, heightMm, place? }`, `place` `{ x, y, z, rx?, ry?, rz? }` – mm and degrees in the scene's coordinate system, rotations default 0, left out: laid in a row) and its own post-processing (replaces the experience's there; `[]` off, `null` the experience's again). Surfaces that entries or targets lie on go only with `apply: true`: the first call answers 409 `surfaces-in-use` (`entries`, `targets`) – shown to the person; with their yes `apply: true`, the entries stay on the scene without a surface, the targets lose their place (`cleared`) |
| `put_surface { experience, scene, surface, remove?, label?, preset?, widthMm?, heightMm?, place?, position?, apply? }` | **one** surface of a scene without sending the whole list (#314, `mcp/src/surfaces.ts`): an id the scene does not have **adds** it (size from `preset` – `double` 460 × 320, `single` 230 × 320, `wall` 2000 × 1500 mm – or `widthMm` / `heightMm`; no `place`: laid in a row by the server), a known one **changes** the fields sent (`label` – `null`: none –, `preset` or a size, `place`), `position` **moves** it (index, 0 = first), `remove: true` **removes** it (never the last; no other field with it). Reads the scene's list (`GET …/scenes`, the editor-only `reference` left out) and writes it with the one change (`PUT …/scenes/{id}`) – no route of its own. `done`: `added` · `changed` · `removed` · `unchanged` (nothing written). A surface in use goes only with `apply: true`, as with `put_scene`. Targets keep their place in mm when a surface gets smaller |
| `move_scenes { experience, scenes, after? \| before? \| position?, group?, apply? }` | one or several scenes as a block, to a place or into / out of a group (`group: null`) – **two steps**: the plan (`order`, `moved`, `groups`; nothing written), then the same call with `apply: true` after the person's yes |
| `delete_scene { experience, scene, confirm?, deleteFiles? }` | the scene with everything on it – entries, targets, the entities used only there – in the same two steps as `delete_entry` (the impact names the scene and the shared entities kept); 409 `initial-scene` for the scene the experience opens on |
| `group_scenes { experience, label, scenes, id?, apply? }` · `rename_group { experience, group, label }` · `ungroup { experience, group }` | groups – a label over several scenes, one stop of the reader's switcher: `group_scenes` brings the picked scenes together where the first is (plan, then `apply: true`); `ungroup` keeps the scenes in place and in order |
| `set_surface_reference { experience, scene, surface, url?, fit?, name? }` | a surface's reference image (#314, [server](server.md#surface-reference-images)) – what the editor's stage shows on the surface, never content: `url` an image of the Library (or an imported `/assets/content/…` path) sets or replaces it, `null` removes it; `fit` `cover` (default) · `contain` · `stretch`; `fit` / `name` alone change the present one. `list_scenes` shows each surface's `reference`. A change in the log, revertable |
| `put_experience_passes { experience, passes \| null }` | the experience's post-processing – the master chain every scene without its own shows |
| `put_experience_landing { experience, scene?, target?, remove? }` | the desktop landing's hero (#355, schema 6.1): a scene and one of its targets with AR content (a model, a video, a component) – the tool reads the draft, its files.json and the import's print layout, extracts the hero with the editor's extractor (`shared/api/landing-draft.ts`) and saves it with the pick (`PUT /editor/experiences/{id} { landing }`); a pick that cannot be the hero is refused before anything is sent (`invalid-landing`); `remove: true` removes it |
| `put_experience_appearance { experience, appearance \| null }` | how the experience's entities appear (#265): a look `{ type, …parameters }` for `reveal` (the first find), `found` (every later find) and `lost` (the target is lost) – the whole appearance is replaced; `null` removes it, the default look plays everywhere |
| `put_environment { experience, environment: { world, onionSky, worldSrc?, skySrc? } \| null }` | the world around the reader and the onion sky |
| `list_assets { experience, kind? }` · `upload_asset { experience, file, name?, fit?, entry?, scene?, surface? }` · `set_asset_credits { experience, items: [{ url, credits }] }` · `rename_asset { experience, asset, name }` (#330 – one file's name by hand, an upload or an imported `import-…`; the URL stays) · `delete_asset { experience, asset, force? }` | the library: a local file becomes an asset whose `url` nodes and targets name – a picture (jpg, png, webp) under **the image rule** (#298, [content](content.md) "The image rule"): stored as WebP named `<name>.webp`, upright, metadata dropped, at most 2048 px, or 1200 px with `fit: "target"` (a target's printed image; `fit: "reference"` for a surface's reference image, 2048 px), `converted` in the answer says so – a shader (glsl, frag, vert, wgsl; kind `shader`, #186) one a plugin loads by its `url` (`api.loadText`). A video's subtitles (vtt; kind `subtitles`, #257) belong to the video by their name – `speak.en.vtt` for `speak.mp4` – and no node names them. `kind` is the API's: `glb`, `gltf`, `video`, `image`, `audio`, `shader`, `subtitles`; the list also holds the content import's files (`imported`, read-only) |
| `plan_asset_names { experience }` · `apply_asset_names { experience }` | the Library's files **named by their use** (#298, [server](server.md#files-named-by-use)): `plan_asset_names` is read-only – the renames (`from → to`, the first use, `more`), shown to the person first; `apply_asset_names` makes the plan again and writes it. The name only, every URL stays; an imported file gets a listed name. `upload_asset` takes `entry` (with `fit: target` / `entryImage` → `<entry>_target.webp`, `<entry>_image.webp`) or `scene` + `surface` (with `fit: reference` → `<scene>_<surface>.webp`) to name a new upload so at once |
| `list_plugins` · `get_plugin` · `put_plugin { experience, plugin, files \| source }` · `upload_plugin { experience, file, plugin?, replace? }` · `plugin_usages { experience, plugin }` · `delete_plugin { experience, plugin, force? }` | the Code tab's plugins (the Library's scripts) – a plugin is a folder of files (#352): `get_plugin` answers `files` [{ name, text }] (and `list_plugins` `fileCount`, `origin` when linked), `put_plugin` takes every file (`files`; one left out is deleted) or `source` for a plugin of one `index.ts`, names what the files register and warns about an import the engine would refuse; `upload_plugin` makes a local `.ts` / `.js` file a source (its id from the file's name, `replace: true` for an existing one); `delete_plugin` is refused while the draft uses what it registers (409 `plugin-in-use`) unless `force` |
| `get_draft { experience, part? }` | the draft as the engine loads it: manifest, configuration or files |
| `publish { experience, env?, note? }` | writes the draft into the experience's own store in the instance's own environment (the default; `GET /editor/environments` names it – #87: a publish never touches another experience) – an instance publishes nowhere else, another `env` is the API's 403 `other-environment`. The answer's `store` is `cdn` or `server`; with `server` it carries the `warning` (no CDN connected) for the person. **production is refused** – the person's button in the editor; with an AI connection's token every environment is refused (403 `not-for-ai`). The description names every refusal of the API's publish – 409 `unknown-components`, `unknown-node-types`, `unknown-materials`, `unknown-passes`, `unknown-appearances`; 400 `invalid-env`, `invalid-note`; 404 `not-found`; 502 `content-store-failed`, 500 `content-store-unconfigured`, 409 `publish-running` – and each answers with a `hint` (`result.ts` `PUBLISH_REFUSALS`, a test checks both). A publish is a job on the server (#345): the tool follows it up to 90 s and answers the outcome with `job`; when it still runs, `job` (phase, done / total, `live`) and `next` |
| `publish_status { experience, job? }` | how a publish goes: its job (without `job` the experience's newest) – status, phase, done / total, `live`, the outcome when done, the error when failed; follows it up to 90 s while it runs (each poll writes the next part on a host where nothing runs on by itself) |
| `activate_version { experience, build }` | **make live** (#348, [server](server.md#make-a-version-live-again)): an older build of the publish log in this instance's own environment is what readers get again (versions.json, latest.json, a publish log row); the draft stays. Ask the person first, naming the version's time and the environment. An AI connection's token is refused (403 `not-for-ai`) – the person does it in the editor (the experiences page → the book's Versions); 404 `unknown-build`, 409 `already-live` / `publish-running` / `build-missing` / `unreadable-schema` |
| `list_versions` · `list_changes { experience, limit? }` | the publish log, the change log (`notRevertable`: why a change cannot be taken back, null when it can) |
| `revert_change { experience, change, apply? }` | takes one saved change back – its `before` written again as a new change, the later changes of the same thing with it (#312, [server](server.md#reverting-saved-changes)); the plan first (revert / conflict / not revertable, later edits, other people), then `apply: true`; the draft only |
| `revert_to { experience, after, apply? }` | back to the state right after a change: every change after it, by anyone, reverted newest first as one change set – the same two steps |
| `render_scene { experience, scene, view?, width?, height? }` | **a picture of the scene** (PNG) as the editor's stage shows the draft – the desk, the surfaces with their reference images, the printed images, the entities as the reader sees them – so the agent checks its own placement ([Seeing a scene](#seeing-a-scene-render_scene-89)). `view`: the stage's camera presets `reader` (default – 35 cm away, tilted 30°), `top` (straight down), `low` (75°, from the side), `far` (70 cm, the whole scene); `width` 320–2560 (1280), `height` 240–1600 (800). The answer is the image itself and `{ file, view, size, open }` – the PNG saved under the system's temp folder (`osct-renders/`) |
| `describe_content_model { experience? }` | node types and names, placement, filters, components, passes, the looks (`appearance`: the moments, the built-in looks with their parameters), the environment, the scenes (`scene`: scenes, surfaces with their `place`, groups, the presets), an entry (`scene`, `surface`), a target's `place`, categories, an entry's text (`entryText`: the Markdown and the variables, with an example), the experience, and that the onboarding is the app's (no tool edits it) – from `shared/`; with an experience also the declared plugins with the components, node types and passes they recorded (with their parameters), the looks they recorded, and the Code tab's sources with the types read from them |

Before `put_entity`, `put_target` and `add_entry` send an entity, the shared guard (`shared/guards/game-config.ts`) runs over
it: a body that breaks the contract never reaches the API, the problems come back with their path (`entity.params.scale: …`).
When the tree names a type that is not built in, the experience's plugins are read first (`model.ts` `knownPluginTypes`): the
declared plugins' recorded specs (content schema 2.14) go into the guard, so a plugin component's or node type's
parameters are checked like a built-in one's; the Code tab's sources give the types read from their text
(`registerComponent`, `registerLayer`, `registerNodeType`, `registerPass`, `registerMaterial`, `registerTexture`,
`registerAppearance`). A node's
`material` (schema 2.17) is checked against the recorded materials (its values like a component's); one no plugin of the
experience registers is refused when every plugin is known, else it passes with a warning. A node type no plugin of the experience registers
is refused – unless a plugin is unknown (a Code tab source, a declared plugin of an older build): then a name like a
plugin's passes with a warning, as the API lets it through. A component type nobody knows passes with a warning – a
plugin must register it, the publish checks (409 `unknown-components`, `unknown-node-types`, `unknown-materials`). `put_scene` and
`put_experience_passes` check the passes – a pass the experience's plugins recorded (content schema 2.21, #216) against its spec,
one a Code tab source registers with a warning (the publish refuses it: 409 `unknown-passes`), any other is refused –
and `put_environment` the environment against the same contract; `describe_content_model { experience }` lists the plugins'
passes (`passes.plugins`, `passes.known`). `put_experience_appearance` checks each moment's look the same way (#265): a built-in
look's or a recorded plugin look's parameters against its spec, a Code tab source's look with a warning (409
`unknown-appearances` at the publish), any other refused; a moment the contract does not have is refused by the tool's
schema; `describe_content_model { experience }` lists them (`appearance.plugins`, `appearance.known`). Resources: `osct://rules/content-model` (the same as `describe_content_model`) and
`osct://guides/plugins` ([plugins](plugins.md)). Prompts: `editor` (how to work), `add-target { experience, scene, what }`.

The tools say *experience* since #320 (content schema 4.0, plugin API 3.0): `list_books`, `get_book`, `update_book`, `import_book`,
`put_book_passes`, `put_book_appearance` are `list_experiences`, `get_experience`, `update_experience`, `import_experience`,
`put_experience_passes`, `put_experience_appearance`, and every tool's `book` parameter is `experience` – no alias is left;
an MCP client sees the new names after the server restarts.

No 2.x tool is left (content schema 3.0, #319 – nothing of 2.x was shipped): no spreads (`get_spread`, `add_spread`,
`put_spread`, `delete_spread`), no pages or page images (`list_pages`, `set_page_images`), no matter (`add_matter`), no
`migrate_scenes` / `migrate_surface_references`, no `migrate_3` (every experience is migrated), no `page`, `print`, `side`, `format`, `layout`
or `title` of a scene anywhere. Scene links are `…/editor/<experience>/<scene>/`.

## A publisher's delivery: preview_delivery, import_delivery (#322)

A delivery – new pages with their printed images and videos – comes in as a **plan** (`shared/api/deliveries.ts`
`DeliveryPlan`: `name`, `source?`, `scenes?`, `entries` with their targets), the API's [Deliveries](server.md#deliveries)
(`mcp/src/deliveries.ts`). The files are Library files named by the asset's id or URL: they are uploaded first
(`upload_asset`, or the CLI, which converts them) – these tools never upload or convert. The plan is given inline
(`plan`, checked by the tool's schema) or as a JSON file on the computer the server runs on (`file`, as the CLI writes it –
checked the same way before anything is sent, `invalid-plan`; its own `apply` / `overwrite` are ignored).

The two steps are import_experience's: the agent shows the comparison and writes only with the person's yes. The API
keeps no confirmation for a delivery (a comparison writes nothing, the plan is sent again with `apply: true`), so the
MCP server makes one: `confirmation.id` is a digest of the experience, the plan, `overwrite` and the comparison's items and
problems. `import_delivery` with `confirm` compares again and writes only when the digest is the same – a draft edited
meanwhile or another plan answers `void` with the new comparison to show. A problem the API meets on the write (409
`delivery-problems`) comes back the same way, nothing written. A plan with problems gets no confirmation.

The `summary` for the person (shortened):

```
Delivery “2026-11-final” into osct – nothing written yet: 3 new, 1 changed, 12 same, 1 conflict.

New:
- scene s186-187
- entry p186-1 (scene s186-187)
- target p186-1

Changed (the fields that follow the delivery):
- entry racoon (scene s1) – image

Conflicts – edited in the editor since the last delivery (left as they are unless overwrite):
- target racoon – imageSrc – imageSrc was edited in the editor since the last delivery

Warnings:
- …
```

Each status lists at most 40 rows (`… and N more`); the `same` rows are only counted. After the write the summary says
how many changes were written under which delivery – each a change of the log naming it, revertable like any save
(`revert_change`, the editor's history). `list_deliveries` names the deliveries written.

## Seeing a scene: render_scene (#89)

An agent that placed an entity used to read the draft back and ask the person to look. `render_scene` lets it look
itself: the answer is the picture (an MCP image content block, which the agent sees) and the PNG's path.

- **What it shows** – the editor's own stage, nothing drawn a second time (RULES #32): the editor has a **render view** of
  a scene, `/editor/<experience>/<scene>/?render=<view>` (`editor/src/lib/render-view.ts`) – the workspace with the stage
  alone: no top bar, no panels, no toolbar, no notices; the view preset is set as the toolbar's would be. It is the same
  page behind the same sign-in gate on the same draft, so the picture is what the person sees on the stage at that
  moment (the live stage – an animation at some frame, a video where it plays; the floor grid and the axis as the
  editor's defaults draw them, a fresh browser's view settings). The page tells how far it got on `<html
  data-osct-render="loading | ready | error">` (the error's words on `data-osct-render-error` – no draft, no scene, the
  token refused, no editor role); `ready` means the stage runs on the draft.
- **How it is taken** (`mcp/src/render.ts`) – the computer's own **Chrome or Edge**, started headless in a throwaway
  profile (deleted afterwards), driven over the DevTools protocol with Node's own WebSocket: no browser download, no
  dependency, so the one-file `osct-mcp.mjs` stays as it was. `OSCT_BROWSER` names another Chromium browser's executable;
  without any the tool says so. It opens the render view at the size asked for, waits for `ready` (60 s at most), then
  for the network to be quiet for a second – the models, textures, reference images and the sky have arrived (the stage
  frame's requests count too; a video's or a sound's stream does not), 20 s at most, else the answer's `note` says
  something may still be missing – and takes the picture. 5–10 s on a scene of the book.
- **Signing in without a cookie** – the editor's session is an HttpOnly cookie; the render view gets none. Instead the
  browser adds the server's `Authorization: Bearer` (the AI connection's token) to the page's **GET** requests to **this
  instance's API** – the API takes a Bearer token before the cookie and needs no CSRF token for it – and **refuses every
  write** there (`requestAction`: the render view reads, it never saves; the answer counts a refused write as
  `blockedWrites`, which should never happen). The token is never in a URL, a file or an answer, and goes nowhere else:
  not to the CDN, not to another origin a plugin asks. Every plugin runs in the render view, also code someone else saved last – it writes nothing (#340, Tilman 2026-11-22). The editor must be served
  next to the API (one origin – a deployed instance, `OSCT_EDITOR_URL` left at its default) or both local (the dev
  editor passes its `/api` to the local API); an editor on another host is refused (`tokenScope`). No server change.
- **Where it works** – any instance whose editor has the render view (deployed with #89), staging included, with no local
  dev server: the server opens `https://osct.porschuetz.de/editor/…?render`. Against an older editor the tool answers
  that the editor has no render view. Locally: the editor's dev server (`npm run dev` in `editor/`, the API proxied as
  usual – `OSCT_API_PROXY` points it at another instance's API, e.g. staging, with `OSCT_API_URL` set to the dev
  editor's `/api` so both are local).

## An example session

"Add a target on the double page 30–31 with a tinted video":

1. `whoami` → editor@…, editor; `list_experiences` → `osct`.
2. `get_experience { experience: "osct" }` → the scene labelled *30–31* is `studio-b`; `get_scene { experience: "osct", scene: "studio-b" }` →
   its one surface `surface` (460 × 320 mm), its targets and where they lie.
3. `describe_content_model { experience: "osct" }` → a video node lies flat by default; `rotation: [90, 0, 0]` stands it up;
   the experience declares the plugin `tint` (a material layer with `color`, `opacity`, `blend`).
4. `upload_asset { file: "…/shadows.mp4" }` → `url`; `upload_asset { file: "…/shadows-print.jpg", fit: "target" }` → the printed image's `url`.
5. `add_entry { title: "Shadows", scene: "studio-b", surface: "surface", category: "video", target: { imageSrc, place: { surface: "surface", x: 270, y: 60, width: 80 },
   entity: { type: "video", assets: [{ id: "shadows", assetType: "video", src }], params: { rotation: [90, 0, 0], position: [0, 0, 0.3] },
   components: [{ type: "tint", color: "#f3cc94", opacity: 0.35 }] } } }` → the entry on `studio-b`, `open: …/editor/osct/studio-b/`.
6. `render_scene { experience: "osct", scene: "studio-b", view: "top" }` → the picture: the video stands where it should, or
   the agent moves it with `put_target` and looks again.
7. The person opens the link: the stage shows the target with the standing, tinted video; **Save placement** or the gizmo
   fine-tune it; `publish` (the local API's own environment, `local`) for the reader on this machine, production in the
   editor.

## Tests

`cd mcp && npx tsc --noEmit && npx vitest run`: unit tests with a mocked `fetch` for every tool (`test/*.test.ts`), and
`test/e2e.test.ts` – the real server over stdio against the real API (PHP's built-in server on a free port, a fresh
SQLite, mails to a log, as `server/tests/api-test.php`): sign in through the mail log, import a 3.0 configuration (a 2.x
one is refused), re-import in two steps (the comparison, then the confirmation), edit, add a target with an uploaded file,
a plugin source, publish to local (staging refused: 403 `other-environment`), remove an entry in two steps (the impact,
then the confirmation), add scenes from presets, place surfaces, let a surface in use go with `apply`, move and group
scenes and remove them in two steps – the draft passing the shipped guard; then a second server started with an AI connection's token made over
the API (whoami names it, a save names it in the change log, a removal takes the same two steps and names it too, publish is refused, a revoked token is 401). Skipped with a message when `php` is not on the path. CI runs both
(`checks.yml`, job *MCP server*).

`test/php-rules.test.ts` pins the PHP API's copies of `shared/` rules: PHP loads the API's classes and prints their
constants – `Editor::ENTITY_TYPES`, `COMPONENT_TYPES`, `PLUGIN_NODE_TYPE`, `MATERIAL_TYPE`, `ENTRY_CATEGORIES`,
`MAX_NODE_DEPTH`, `ID`, `CONTENT_SCHEMA`; `Experiences::PASS_TYPES`, `WORLDS` and the world and sky extensions; `Scenes::PRESETS`, `PAGE_MM`, `WALL_MM`, `SURFACES_MAX`;
`ContentStore::ENV` and `BUILD`; `Plugins::ID` and `REGISTERS`; `Assets::KINDS` – and the test compares each with
`shared/` (`shared/api/rules.ts` for the API's own rules); `Plugins::registers` and `pluginTypes` read the same sample
sources alike. A difference fails; skipped without `php`, like the end-to-end test.

## Limits

- `render_scene` shows the stage, it does not play it: no taps, no scrubbing to a moment of an animation, no free camera
  (the four presets only), the browser's default view settings (shading *rendered*, the floor grid on). It needs Chrome
  or Edge on the computer the server runs on.
- The onboarding is the reader app's own UI (#236): no tool reads or edits it. Every experience adds, moves, changes and
  removes its scenes (#307 – `add_scene`, `move_scenes`, `put_scene`, `delete_scene`); there is no source of truth
  any more (#320, #322). Removing an experience's printed book (`update_experience` `book: null`) stays the person's decision.
- The server follows the API: a new endpoint is a new tool (`src/content.ts`), nothing else moves. Differences to
  SCUTOONS' server and what an agent still misses: the research note.
