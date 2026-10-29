# An MCP server over the editor's API (#75, decided 2026-10-30)

Tilman, 2026-10-29 (#66, after the plugin API landed): "wir brauchen eine MCP-Schnittstelle, dass wir dann beim Bauen in
Amsterdam genügend schnell auch mit Claude Sachen bauen können." And on this session's start (2026-10-29): "how it is done,
do it like in scutoons. important this will one day merge." So the shape is SCUTOONS' MCP (`scutoons/tools/mcp`,
`scutoons/agents/MCP.md`): the member's own AI with exactly their rights, the API as the only authority, drafts that a
person confirms in the browser – in OSCT size. PLAN phase 15, step 4. Docs for users: `docs/mcp.md`.

## Where it lives

**A package `mcp/` at the repository root** (Node 22, TypeScript, its own `package.json` and vitest like `scripts/`): the
server is a client of the API like the editor app, not a part of the server, so it sits next to `client/`, `editor/`,
`scripts/` – SCUTOONS has it under `tools/mcp` because SCUTOONS has a `tools/` folder; OSCT has none, and `scripts/` is
the content build. **Over HTTP with the editor's session token, never a second path into the database**: the API's role
checks (`Roles::require`, `Editor::user()`), its validation (`Editor::entity`, the publish's 409) and its logs hold for an
agent as for the editor app – and a deployed instance (staging, Amsterdam) needs nothing new on the server.

Like SCUTOONS: the v2 SDK (`@modelcontextprotocol/server`, `zod` 4, `registerTool` with `z.object` schemas and
annotations), the files `main.ts` / `config.ts` / `services.ts` (roles → services, the user behind the token, the app's
links) / `user.ts` (SCUTOONS' `member.ts`: the server for one user, `whoami`) / `prompts.ts` / `resources.ts`, tools
registered per service, results as JSON text, API errors as tool errors with a hint, every write answering with the
app's link. Unlike SCUTOONS: no personal access tokens yet (the session token is the token – a `sct_`-like token table
is a follow-up when a non-developer connects), no one-file build / Desktop extension (Claude Code from the checkout is
the use), vitest instead of `node --test` (OSCT's stack rule), and the start goes through esbuild (`bin/osct-mcp.mjs`
bundles `src/` with `shared/` on every start, a tenth of a second) because `shared/`'s modules import their siblings
without extensions and OSCT has no root `package.json` with `type: module` – Node's own type stripping, which SCUTOONS
uses, resolves neither. (A root `package.json` or `.ts` extensions in `shared/` would remove the bundling step; the
latter changes the contract's checksum and so the schema lock – not for this.)

## Signing in

Both, as the brief asked: **`OSCT_EDITOR_TOKEN`** in the environment (the editor app's session token from
`localStorage`, or a `POST /auth/verify` answer) lists the editor's tools from the start; without it the server starts
with `whoami` and the pair **`sign_in_request { email }` → `sign_in_verify { requestId, code }`** – the API mails the code
(locally to the mail log), the person pastes it into the session, the token stays in the process and is never returned.
A sign-in with the role `editor` registers the tools, prompts and resources on the connected server (the capabilities
are declared at start; the client gets `listChanged`). No password tool: a password in a chat is the wrong place for it.
`OSCT_API_URL` defaults to the local dev API; `OSCT_EDITOR_URL` to the local dev editor, or `/editor` next to a deployed
API. A signed-in reader gets a hint and no tools (SCUTOONS exits for readers; here the sign-in flow needs the server up).

## The tools

`whoami` · `sign_in_request` / `sign_in_verify` · `list_books` · `import_book` (a game.config.json by URL / inline / the
CDN – added to the brief's list: Amsterdam starts from the reader's dev server) · `get_book` (the tree) · `get_spread`
(by id or page, targets' entities resolved, a shared one with its `ref`) · `get_entity` / `put_entity` · `put_target`
(entity | ref, imageSrc, print) · `add_entry` / `delete_entry` · `list_assets` / `upload_asset` (a local file) /
`delete_asset` · `list_plugins` / `get_plugin` / `put_plugin` / `delete_plugin` · `get_draft` · `publish` (local,
staging) · `list_versions` / `list_changes` · `describe_content_model`. One tool per endpoint, a few higher where the API
has none (`get_spread` joins tree and entities; `describe_content_model` joins the contract, the draft's declared plugins
and the Code tab's sources). Every entity goes through the shared guard first (`assertGameConfiguration` over a
one-entity probe configuration – the same checks as the build and the app, paths rewritten to `entity.…`), so a wrong
body never reaches the API; a component type no built-in provides passes with a warning (a plugin's – the publish
decides). Resources `osct://rules/content-model` and `osct://guides/plugins` (docs/plugins.md read at start); prompts
`editor` and `add-target`.

## What stays out

- **The stage cannot be seen.** The agent reads the draft and gives the person the link; the person looks. A headless
  render of the mock stage (the editor's three.js scene without a browser, or a screenshot endpoint of the editor dev
  server) is a follow-up – proposal below.
- **Publishing to production stays with a person**: `publish` refuses `production` with a message and the editor's
  link (SCUTOONS' MCP has no publish tool at all; `local` and `staging` are a check, not readers – Tilman decides whether
  `staging` should go too).
- No admin tools (the admin page is small and a person's), no entries' texts, spreads or tutorial (imported, as in the
  editor), no renditions / transcoding (the content build's).
- No personal access tokens, no one-file build, no Desktop extension (above).

## Tried with Claude Code (2026-10-30)

The fixture imported into a local API (SQLite, mail log, `EDITORS` with a test address), `claude -p` with this
`.mcp.json` and the prompt "add a target on spread 30–31 with a tinted video" – the essence:

- _filled in below after the run_

### What an agent needs that the API does not give yet (proposals)

- _filled in below after the run_
