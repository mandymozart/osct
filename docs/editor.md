# Editor: the authors' tool at /editor

The editor is a SvelteKit app of its own (`editor/`, served at `/editor` next to the reader) for the people who make
the experience's content: it runs the **engine** – the same AR scene the reader renders – over a **simulated page** instead
of a camera picture, so an entity (model, video, image, chroma key) can be placed and tuned at the desk, on the desktop
or on a phone, saved to the instance's database and published as a content version. The reader carries nothing of it
(RULES #32); the three parts are described in `agents/research/2026-10-29-editor-architecture.md`.

```
engine/   the base: content runtime + AR scene (three.js), no routes, no accounts, no UI
client/   the reader: the engine with the 8th Wall tracker
editor/   the editor: the engine with the mock tracker and its stage, the panels, saving, publishing
server/   the instance's API: /api/editor/* (docs/server.md "Editor data")
```

The pages: **Experiences** (`/editor/` – the experiences, import, AI connections), a **experience** (`/editor/<experience>/` – its scenes and publishing) and the **workspace** of a scene (`/editor/<experience>/<scene>/` – the tree, the stage
and the panels). The admin page is [admin](admin.md).

## Who may use it

An **instance user** of the accounts API with the role `editor` (the instance is Building Fictions; the reader's
accounts are the same table – [server, "Roles"](server.md#roles)). An admin gives the role on the **admin page**
`/editor/admin` ([admin](admin.md)), or from the shell with the admin secret:

```bash
curl -X POST -H "X-Admin-Secret: $OSCT_SECRET" -H "Content-Type: application/json" -d '{"email":"name@example.com"}' https://osct.porschuetz.de/api/admin/editors
```

The editor signs in like the reader (a code by email, or a password the account set) and refuses everyone without the
role. The **first editors and admins** of an instance need no secret: the addresses in the API's `EDITORS` / `ADMINS`
settings (GitHub environment variables of the same names, comma-separated, written into the server's config by the
deploys) get the role when they sign in.

**The session is a cookie** (#207, [server, "Sessions, cookies and CSRF"](server.md#sessions-cookies-and-csrf)): the
sign-in sets the API's HttpOnly cookie `osct_session`, which no script on the page can read – the editor keeps nothing
about the session in `localStorage`, only the session's CSRF token in memory, sent as `X-CSRF-Token` with every write
(`request` in `editor/src/lib/api.ts`; uploads, the CSV download and the engine's draft fetch take the same path). At
startup the editor asks `GET /user` whether the browser is signed in. The cookie is the site's one sign-in: signing in or
out in the reader at `/` does the same for the editor, and the other way round. A write refused 403 `csrf` (the cookie
was replaced meanwhile, e.g. by a sign-in in the reader) renews the CSRF token from `GET /user` and is sent once more;
when the cookie now belongs to another person, the editor's session ends.

A session that ends while the editor is open – it expired, the person signed out elsewhere, the account lost its role –
goes back to the sign-in form with *Your session ended – sign in again.* (#208): any API call answered 401 while signed
in ends it (`editor/src/lib/api.ts`, `session.svelte.ts`). The route stays, so signing in again returns to the same
page. The sign-in calls themselves (a wrong code or password), the sign-out and the startup check answer 401 without
that note.

## Try it (the demo experience, or the fixture's studio scenes)

The **demo experience** (`fixtures/demo/`, `DEMO.md`): six scenes that use every node type, placement, filter and
component, fourteen plugins, and a narrative across its pages – the key on page 1 opens the door on page 3, the lamp
lights when the door opened, a tally counts the pages found, a tap switches a scene ([plugins](plugins.md) "The demo
experience", the note `agents/research/2026-10-30-demo-book.md`). The fixture's **studio scenes**
(`fixtures/content/FIXTURE.md`, pages 28–31) are the smaller scene of every entity type, placement and filter. Locally,
with SQLite and the local content store:

1. `server/api/config.local.php` (not committed, copy of `config.local.php.example`): `DB_SQLITE_PATH` (in `var/db/`), a
   `SECRET`, `MAIL_TRANSPORT => 'log'` (the mails land in `var/mail/mail.log`), `CONTENT_STORE => 'local'` (published
   content goes to `content-store/` – [server, "Content store and var"](server.md#content-store-and-var)), and the dev
   servers in `ALLOWED_ORIGINS` (`http://localhost:5175, http://localhost:5174`).
2. The reader with the demo: `cd client && OSCT_CONTENT_DIR=fixtures/demo npm run content && npm run dev:http -- --port 5174`
   (the fixture: `OSCT_CONTENT_DIR=fixtures/content`).
3. The API: `cd client && npm run dev:api` (127.0.0.1:8080). Make yourself an editor with the curl above against
   `http://127.0.0.1:8080/api/admin/editors`.
4. The editor: `cd editor && npm install && npm run dev` → http://localhost:5175/editor/ (its `/api` is proxied to
   the dev API). Sign in: the code is in the mail log.
5. **Import an experience…** → *URL* `http://localhost:5174/src/game.config.json` (the reader's dev server serves its bundled
   configuration), *assets at* `http://localhost:5174` → Import. The experience appears with its scenes.
6. Open *The key*: the stage shows the scene's targets with their entities, the key is found and unlocked – the
   **Inspector** shows the scene (selected when the workspace opens), and its *vars and events* has the timeline of
   the finds. *tap* → *The key* takes it: its **behaviour** rule (#88, select the key to see it in the Inspector) plays
   the model's clip `rattle`, sets `hasKey` (experience, boolean, true) and emits `keyRattled` – in the timeline (newest
   first) the rule's `behaviour` line sits under the events it caused. Walk with › to *The door*: its rules hide the
   hint and emit `openDoor`, the `door` plugin lifts and turns the door, `stage · doorOpen = true`, the lamp on the right
   page shows. Switch a target off and on with the tree's eye (lost, found again), *Replay the first find* in the
   stage's right-click menu plays it again, *reset* in the scene's *vars and events* starts a new game – on *The door*
   the hint shows then; *set* `hasKey` (experience, true), switch the door off and on, and it opens without a visit to the
   key's page. Open *The switch* and click the entity on the stage: the next scene shows; its *post-processing* holds
   *scanLines* switched off – the toggle in the pass's head turns the lines on. The **Code** tab lists the fourteen
   plugins (compiled by the content build, their sources next to them): change one, **Run**, and the stage shows it.
   Move a node in the **Inspector** (type a scale, or press and slide) – the top bar says *Saved* a moment later –,
   then **Publish** – it goes to
   `local · this server`, the local API's own environment. With the fixture: open *Studio A – models* the same way.
7. The reader reads the published version when it is started with
   `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` (`latest.json` names the new build).

The one-page version of this flow for editors, with the diagram, ships with the app at `/docs/tutorials/`
(`client/public/docs/tutorials/index.html` – a static page, served by the site's `.htaccess` like any file). Its other
chapters bring an experience in (the CDN, a URL or a file, the assets base, what is on the CDN – #95), walk through the demo
experience (#148) and tour the editor's tools, with screenshots of the editor (`client/public/docs/tutorials/import/`,
`demo/`, `tools/`).

On staging the same flow runs against the CDN: `CONTENT_STORE=bunny` with the storage zone's credentials in the
`staging` GitHub environment ([deploy](deploy.md)); *Import an experience… → the CDN* takes the current version, publishing
(to `staging · CDN`) writes a new one, and the staging reader sees it on its next start.

**The demo experience on staging**: the workflow *Demo experience* (`.github/workflows/demo.yml`, by hand or on a push to
`develop` that touches the demo) builds `fixtures/demo` and syncs it to the environment **`demo`** of the storage zone
– `https://buildingfictions.b-cdn.net/demo/`. In the staging editor: *Import an experience… → URL* with that base URL (the
form takes the current version and its folder as *assets at*), then open its scenes. Publishing it there makes it *the*
experience of staging (the store is per environment, not per experience – "One experience per environment" below), so the editor's
publish step says so first. On a phone, the staging reader opens it with
`https://osct.porschuetz.de/?content=https://buildingfictions.b-cdn.net/demo` ([content on the CDN](content-cdn.md)).

## Experiences, import and publish

### The Experiences page

`/editor/`: the instance's experiences – under each, where it is live (below) – and *Import an experience…*: the CDN's current
version, a `game.config.json` by URL or file, or a **content base URL** – a CDN folder with `latest.json`, e.g. `…/demo` –
whose current version is taken; *assets at* = where its `/assets/content/…` paths resolve (for a content base the
version's folder) – every draft and publish points there, no media is copied. Under the experiences: **AI connections** and
the MCP guide ([below](#ai-connections)).

### Import: what comes in

Before the comparison, the form shows what an import would bring in (#182, `POST /api/editor/import/preview` –
[server](server.md#import-preview)): *From* (the content base), the build with when it was built and became current on
the CDN, the app and content schema version, the **one experience** in it (title · id) and what it holds (scenes, entries,
targets, shared entities), and where its media resolve (*Assets at*). The button says it: *Import 1 experience: The Demo
(build 7457f0c…)*. *The CDN* reads it at once (the server knows the content base), a URL once typing pauses (the browser
reads the content base's `latest.json` or the `game.config.json`, the server checks it), a file when it is chosen; the
import then sends exactly what was previewed. The experience's id is the configuration's `experience.id` – no id field and no
browser prompt (a configuration without one is refused by the import anyway). When a draft with that id is here, the
form says so first – *A draft of “The Demo Experience” (demo) is already here – importing replaces it.*, how many of its
edits since its import are lost (unpublished, unless the draft as it is now is live) and where it is live; the
comparison below follows on the button. A source that cannot be read – the CDN offline, no `latest.json`, one that
names no build – shows the error with the URL and *Try again*.

### Import: the version comparison

Importing replaces an experience's draft, so over an experience that exists the form shows a **comparison** first and imports only
when the person confirms there (#183): the incoming build against the build the draft is based on – its id, when it was
built, the app and the content schema version that built it (differences in bold) –, who imported the draft's base and
when, the draft's **edits since that import** (their number, the newest five from the change log – who, what, when; an
AI connection's edits name it) and whether the draft as it is now is live anywhere. **Replace the draft** (or *Import
again* when the same build comes in and nothing was edited) imports; *Cancel* goes back to the form. The comparison is
the API's first step (409 `confirm-import`), the button sends its confirmation – when the draft changed meanwhile, the
form shows the new comparison and says so. Importing from any environment stays open.

### Publish: the instance's own environment

An instance publishes to **its own environment only** (#183): a developer's machine to `local`, staging to `staging`,
production to `production` – the CDN keeps a root folder per environment, and staging is for testing. There is no
choice of environment: next to **Publish** (the experience page's bar) the target is named with its backend – `staging · CDN`
(a connected CDN has priority) or `local · this server` / `staging · this server` (the directory store of an instance
without a CDN, [server, "One environment per instance"](server.md#one-environment-per-instance)) – and where the experience
is live (*live on staging, production* or *draft only*). Wherever this server is the target, a short *No CDN connected*
stands next to it (its help in the Info view has the whole line). **Publish** opens a step in the page – no browser
dialog – that names the experience, its build now, the target and what it replaces there (*Replaces build … of “Test Experience” on
staging*, or another experience, below), says on production that every reader gets it, and where this server is the target:
*No CDN connected – the published content is stored and served by this server only. Readers load from here without
edge caching; heavy media goes through this server. Back up the content store.* Its button publishes; *Cancel* or
Escape closes it. Another environment is published from its own editor (the API refuses it, 403 `other-environment`).

### One experience per environment

Each environment's content store (`<env>/latest.json`, `<env>/<build>/` – [content on the CDN](content-cdn.md)) serves
exactly one experience: the last one published there. Until the store has a folder per experience (#87) the editor makes that
visible and safe (#143):

- **Where an experience is live.** The Experiences overview shows under each experience *live on staging · build … · since …* (one line per
  environment that serves it) or *draft only*; next to Publish the experience page shows the same in short. An environment
  serving an experience that is not imported here, or whose store cannot be read, gets a line under the list.
- **Publishing over another experience asks.** The publish step names both when the environment serves another experience
  (*Staging serves “Onion Skin & Crocodile Tears”. Publish “Demo” instead? …*); production says it more strictly (every
  reader of the app gets the other experience). Only its *Replace on staging* sends `replace: true` – the API refuses the
  publish without it (409 `other-experience`; when that happens because the environment changed meanwhile, the step opens
  again with what it serves now).
- **Switching back** is publishing the real experience again (with the same question): when its draft is unchanged, its last
  version is still on the store and only `latest.json` moves back – nothing is uploaded again.
- The MCP server never replaces an experience: its publish gets the 409 and leaves the decision to a person in the editor.

## AI connections

Connecting an AI agent is a first step of working here, so it sits on the experiences page under the covers (#142, #194,
#273, `lib/AiConnections.svelte`, `lib/mcp-setup.ts`) as two tabs:

- **Connect an AI agent** – one line on what an agent does here (works as you, saves drafts, never publishes), then three
  steps: **1** *Which agent?* – segmented pills **Claude Code** / **Claude Desktop** / **Codex CLI** / **OpenCode** /
  **Cursor** (kept in this browser under `osct-editor-mcp-client`); **2** the prompt to paste into it (`agentPrompt`):
  check Node 22, download this instance's `/mcp/osct-mcp.mjs` into `~/.osct/` (or use the file typed by hand), add the
  client's entry – `claude mcp add …`, `claude_desktop_config.json`, `~/.codex/config.toml`, `opencode.json`,
  `~/.cursor/mcp.json` – with the server's name `osct-<env>` after `GET /health`, `OSCT_API_URL` and the token, ask for a
  restart, then `whoami` and `describe_content_model`; it tells the agent to keep the token secret and, if it cannot run
  commands, to show the steps instead. With no token yet one is made as the tab opens, named after the agent and the
  machine the browser reports ("Claude Code on Windows"); with tokens, **Create token & copy prompt** makes one and copies
  the prompt (a token is shown only once, so every agent gets its own). The token stays on the page until it is left,
  never stored. **3** the agent sets itself up. *Set it up by hand* (closed) holds the download link, the field for
  where the file was saved (`osct-editor-mcp-file`; a checkout's folder gets `mcp/bin/osct-mcp.mjs` appended), the
  client's snippet with **Copy** and the four values any MCP client takes ([mcp, "Connecting an agent"](mcp.md#connecting-an-agent)).
- **Existing connections** (with their count) – a name and **Create token** (the token shows once in a framed box with
  **Copy**; the prompt has it too). The list: each token's name and prefix, *last used* (never, 5 min ago, yesterday …)
  and *expires* (red in its last 14 days and once expired), **Renew** (182 days from today – the same token works on)
  and **Revoke** (asks first; it stops at once). Every call is the person's own session – the API refuses them to a
  token ([server, "AI connections"](server.md#ai-connections)).

## The experience page

> **Since 1.105.0 (Tilman, 2026-11-18):** the experience page and its Pages view are gone. An experience's address opens the scene
> last open in this browser, else the first; the Scenes panel under the stage has the scenes, their order and groups. An
> experience without scenes offers its first one. The editor says **Experiences** where it said Books.

`/editor/<experience>/` opens the scene last open in this browser, else the first (`osct-editor-last-scene:<experience>`). The
experience's texts and settings are the Inspector's ([Inspector: the experience](#inspector-the-experience)), its entries are found with the
[experience search](#the-experience-search) and edited in their scene; the environment is its tab in the workspace. **Publish** with
its target and where the experience is live is in the top bar ([above](#publish-the-instances-own-environment)).

### Scenes (schema 3.0, #319)

An experience is an ordered list of **scenes** (`agents/SCENES.md` "Schema 3.0") – no page numbers anywhere: a scene has
its `label` (what the reader's switcher and lists show – `186–187`, `Cover`, `Studio wall`; empty: its id), an optional
group and its **surfaces**, each with its size and its `place` in the scene's coordinate system. **A double page is one
surface** (twice the page's width); a cover is a single scene first in the order; a wall is a surface standing ahead.
The [Scenes panel](#the-scenes-panel) under the stage shows them as cards (`SceneCards.svelte`, the model
`scene-strip.ts`, the data and actions `scenes.svelte.ts`): a card is the scene's **surfaces side by side**, each with its
reference image (#314, fitted as it says) and the prints of the targets lying on it (`surface-preview.ts`,
`SurfacesPreview.svelte`), with the scene's label and its target count.

- **Open, pick, drag** in the Scenes panel: a click opens the scene's stage, Shift+click picks a range, Ctrl+click one
  more; the picked cards – or a group's band – are dragged to a new place, over a group's scene they join the group. The
  drop is written at once (`POST …/scenes/move`) – nothing renumbers, the order is the scenes' only order.
- **+ Scene…** and the dashed **+** tile add a scene from a **preset** (`POST …/scenes`, `SCENE_PRESETS`): **double page**
  (one surface of 2 × the page's width), **single page**, **wall** (2000 × 1500 mm standing ahead, `rx` 90). The
  workspace's creation step (`NewSceneForm.svelte`: preset, label, after which scene) opens from
  **+** in the Inspector's head at the last scene and from the tree's scene row menu (*Add a scene after*).
- **Removing a scene** (`deleteScene`, `DELETE …/scenes/{id}`) takes the two steps of a removal (#198,
  `RemovalConfirm.svelte`, words in `removal.ts` – *Removes scene “4–5” with …*); the scene the experience opens on
  (`initialScene`) cannot go.
- **Gone with schema 3.0** (no backward compatibility – Tilman, 2026-11-18): the page images and the Pages view (#251 –
  a surface's reference image is the editor's picture of it), the matter scenes (#296), the titles pages gave (#298's
  scene titles), the scene grid and the layout sheets as the cards' and the stage's pictures, the formats and the
  fixed / free layouts. The book's layout (`content/layout/`) is no longer read by the editor: its sheets become surface
  references (the server's migration, part B of #319).

### Texts: entries and the experience

The reading side of the experience (#223): the API's routes are `docs/server.md` "Texts", what a body means is
`docs/content.md` "The text: Markdown and variables". The onboarding is no part of it: it is the reader's own UI,
translated with the app (#236, `docs/content.md` "Onboarding screens").

- **An entry's form** (`EntryForm.svelte`, the logic in `entry-edit.ts`) – in the Inspector's place when the tree
  selects an entry, in the order the view had: title, category (segmented), access page (`ScrubNumber`; a page on another
  scene moves the entry there with its save – the form stays, its head names the scene), author, tags (one line, commas), the
  **text** in a textarea with its **live preview**, the picture (a `FileField`: *Library…* opens the Library as its picker
  in the Inspector's place – the form stays mounted underneath, its edits kept –, *Upload…* uploads; *remove the
  picture*), a link's URL (*open* only over http(s)) and the target with *select the target*. The fields come from
  `GET …/entries` as the content holds them (`entries.svelte.ts` – an imported picture's path unresolved, shown below the
  experience's assets base); the form [saves itself](#autosave): only the fields that changed (`PUT …/entries/{id}`, an
  emptied author, picture or link removes it), the draft is read again, and the stage is built again only for what it
  shows of an entry – a changed title (its `{{entry.title}}` text nodes) or page. The form keeps what was typed: a
  save's answer never writes over it. *Undo edits* takes the entry back. What keeps the save back is listed under the
  form (the API's checks before it is asked) and named in the top bar.
- **The preview** is the reader's renderer (`shared/text/entry-text.ts` `renderEntryText`) – the same Markdown, the same
  escaping. On the stage the variables have their current values: the page's mirror of the stage frame's `vars` (#234 –
  data from the frame, never code), read innermost scope first like `api.vars.get`. Under the preview the variables the
  text reads are listed with their value and scope (or *not set*), and every construct that does not parse is named
  (`exprMessage`).
- **+ entry** in the tree (beside *+ target*, #237) makes an entry without a printed image on the scene – read in the
  reader's list only, like a glossary term: title, category and access page (one of the scene's pages, `NewEntryForm`,
  `POST …/entries` without `target`); its form opens in the Inspector. On the stage the variables have their values; an
  entry found with the [experience search](#the-experience-search) opens the same way.
- **The experience's texts** (`ExperienceTexts.svelte`) – in the Inspector while the experience is selected (the top bar's experience crumb,
  [Inspector: the experience](#inspector-the-experience)): title, author, publisher; saved by themselves → `PUT /editor/experiences/{id}`.
- Every text field is one value today; a language variant (#224) becomes a draft of the same shape per language, so a
  language switch can be added to these forms without reshaping them.

## The workspace

`/editor/<experience>/<scene>/`: on a desktop and an iPad the **stage** is the whole window and the panels **float** over
it ([Floating panels](#floating-panels), #308) – the **Tree**, the **Inspector** with its tabs, the **Scenes** filmstrip,
**Info** and the stage's **Tools**. The editor is for desktop and iPad only (Tilman, 2026-11-18): the phone's layout –
a sheet at the bottom with the tree as a tab, ‹ › over the stage – is gone (#317). The Inspector's tabs (#229, `lib/panel-tabs.ts`): **Inspector** (what is selected), **Environment**,
**Library**, **Code** – no Stage tab: the scene is the Inspector's, the preview settings are the stage toolbar's; a tab
stored before (`stage`, `entity`) opens the Inspector, as does a first visit.

The Inspector's head: its grip and icon (the handle), the tabs – as words, or as icons in a panel too narrow for them
(under 24rem, 28rem with a finger), so the head stays one line (#172) – and, on the last scene,
a **+** that opens the creation step of a new scene (#238). ‹ › live in the Scenes panel's head (#307; ← → still
step); back to the scenes is the top bar's experience crumb (#250).

When the draft cannot be loaded (the API is down, the experience is not there) the stage area says why with **Retry** instead
of *Building the stage…*; an action that fails (a removal, a target image, the reload after a change) shows its error
over the stage until dismissed (#208).

### Floating panels

On a desktop and an iPad (#308, after the SCUTOONS deck editor's floats – `deck/kit/src/editor/floats.rs`) every panel
of the workspace floats over the stage: `components/FloatingPanel.svelte` draws one (built once, RULES #32), its
placement is pure in `components/floats.ts` (tested in `lib/__tests__/floats.test.ts`) and one workspace's set is a
`Floats` (`components/floats.svelte.ts`). Each panel is declared once in the workspace's spec list (`SCENE_PANELS` in
the page): id, name, icon, what it is for (its head's help in the Info view), its default place by a **corner and an
offset**, its size (rem, `fill` – all the room the others leave – or `content`, the toolbar), its least size, folded or
closed by default, **essential** (it folds but never closes) and **inline** (a toolbar).

| Panel | Default place | |
|---|---|---|
| Tree | top left, the full height | |
| Inspector | right, the full height (36rem wide while the Code tab shows, until it is resized) | essential |
| Scenes | bottom, between the Tree and the Inspector | |
| Info | bottom left, folded | |
| Tools | top left over the stage, beside the Tree | inline, essential |

- **Move** by the head (its grip, icon and name; ← ↑ → ↓ on the focused handle, Shift for larger steps): the panel
  follows the pointer over the others; let go, its edges **snap** to a wall, to the gap beside another panel or in line
  with another panel's edge (12 px), and a panel let go on another one goes to the nearest free place – none ever
  overlaps another, every panel keeps a gap of .5rem.
- **Resize** by its edges and corners (wider grips with a finger). The resize **makes room** (#329, `evade` in
  `floats.ts`): the panels in its way move on, away from the moving edge (one pushes the next), and at the wall they
  shrink – the one nearest the wall first – down to their least size; the resized panel stops where they can give no
  more. Panels not in the way stay. Let go, that arrangement is the stored layout (a panel that shrank keeps its new
  size). A double-click on an edge gives the panel back its own size.
- **Fast**: a drag is laid out once per animation frame (the pointer events between coalesce); during a resize only the
  pushed panels' boxes change (`left`/`top`/`width`/`height` – their content is not drawn again) and nothing is stored
  until the pointer is let go.
- **Fold** to its head (the chevron) – the pill: grip, icon, name; the inline toolbar folds to its icon, which a click
  opens again. **Close** (×, not on essential panels); the top bar's **panels menu** lists the panels that close – ✓
  shown, a click closes or brings one back – and **Reset layout**.
- **The order of growth**: each panel first gets its least size where its place is, then grows from its corner towards
  the size it asks for; an earlier panel leaves a later one the room that one asks for, a `fill` panel takes what is
  left. So the Tree and the Inspector stand the full height beside the Scenes strip, and an Info opened at the bottom
  left takes its room from the Tree.
- **The place is kept by the nearest corner** (the distances to its walls), so a panel comes back where it was after the
  window changes size; the panel touched last lies in front. Where every panel lies, folded or closed and the size it was
  resized to is remembered **per workspace in this browser** (`osct-editor-panels`, `lib/storage.ts`); Reset layout
  removes that workspace's layout.
- The Scenes panel and the Info view in a float have no fold and no sash of their own – the float's head folds them,
  its edges resize them; the Scenes cards scale with the panel's height.

### The Scenes panel

Under the stage, on a desktop, the stage column ends in the **Scenes panel** (#307 phase 3a, `ScenesPanel.svelte`; the
design `agents/design/scenes-filmstrip.html`): the experience's scenes as a **filmstrip** – the row of stops the reader's
bottom switcher shows. The tree keeps the left column and the Inspector the right.

- **The head**: ▾ collapses the panel to its head (▴ opens it), the experience's name, how many scenes and groups and how many
  are picked; **+ Scene…** adds a scene from a layout preset after the open one (a front cover goes first, a back cover
  last) and opens it; one **group toggle** – a folder icon groups the picked scenes (Ctrl+G), folder-minus ungroups (Ctrl+Shift+G); ‹ › the
  previous / next scene. The mouse wheel scrolls the strip sideways (up/down, no Shift), as the arrow keys do. The **sash** above it
  is dragged (or ↑ ↓ when focused) to make the panel taller – the cards scale with it, down to a minimum height; a double-click restores the default. Open and height
  are remembered in this browser (`osct-editor-scenes`).
- **The cards** (`SceneCards.svelte`, the same as the experience page's): the scene's picture, its name and target count; the
  **open scene is framed gold**, the **picked** ones blue. A **click** opens a scene (and picks it alone), **Shift+click**
  picks the range from the last one, **Ctrl+click** adds or removes one. With the focus on a card ← → move the pick
  (Shift: extend it), **Enter** opens. The **+** at the strip's end adds a scene at the end.
- **Groups are bands** over their scenes: the label, the scene count and the target count – in the warning colour with ⚠
  above the **loading window** (`GROUP_WINDOW_TARGETS` in `shared/api/editor.ts`, a first guess of 20 until #300
  measures the window on the phone). A **click on a band** selects the group: the Inspector shows it
  ([Inspector: a group](#inspector-a-group)).
- **Drag** a card – the picked ones go together, as a block in their order – or a **band** (the whole group) along the
  strip: a ghost follows the pointer, a **gold line** shows where they land and the band they join lights up; near the
  strip's ends it scrolls. Over a group's scene a dropped scene **joins the group**, over a scene of no group it leaves its
  group; a band keeps its group and lands between groups only. Esc ends a drag without a change. The drop is the
  confirmation: `POST …/scenes/move` with `apply: true` in one go – nothing renumbers, the draft follows (‹ › and the
  stage keep the new order).
- **Ctrl+G** makes a group of the picked scenes (`POST …/groups`, label *Group n*; they come together where the first
  is) and selects it, so its label can be typed at once. **Ctrl+Shift+G**: the picked scenes leave their group in place
  – a group all of whose scenes are picked goes as a whole (`DELETE …/groups/{id}`) –, or, with a group selected and no
  grouped scene picked, that group goes. Both keys work anywhere on the page but in a field.
- The pure logic – runs and bands, counts, picking, the arrow keys, where a drop lands, the order and the move request it
  makes, the gold line – is `editor/src/lib/scene-strip.ts`, tested in `lib/__tests__/scene-strip.test.ts`.

### Autosave

Every edit shows live on the stage and **reaches the draft by itself** (#259) – the Inspector's entity (its rows, a
file picked or uploaded for a node, the tree's moves and removals, a gizmo drag), a target's placement, the
post-processing, the environment, an entry's form, the experience's texts. There is no Save button in the Inspector. Only the
Code tab keeps **Save** (Ctrl+S): half-typed code does not belong in the draft. Readers get nothing before Publish.

- **When**: a subject (a target's tree, a scene's passes, an entry, …) is saved once it was left alone for 0.8 s – a
  drag or a word being typed is not saved half-way – and a newer edit replaces the save still waiting. Saves run one
  after another, in the order they became due. A save carries what it writes, so it runs after its panel closed, the
  selection moved or the scene changed. Hiding or closing the tab starts what waits at once; while something is
  unsaved the browser asks before the page closes (`autosave.svelte.ts`, tested).
- **The top bar** says where the draft stands (`SaveStatus.svelte`): *Saving…*, *Saved*, or *Not saved* with what keeps
  it back – a failed save (**Retry**; a failure of the server or the network is tried again by itself after 8 s, a
  refusal waits for the next edit) or a subject that cannot be saved as it stands (a behaviour rule that is not
  complete, an entry without a title). In the tree a ● after a target's name marks a tree not saved yet.
- **Quiet**: a target's tree and the passes are not built again by their save – the stage shows them already, the
  draft only takes them over (`Stage.adopt`), so clips, videos and the view go on. The stage is built again only where
  it shows the draft's own data: a target's placement, an entry's title or page, an entity several targets share.
- **Undo edits** (in each panel's foot) takes its subject back to how the draft had it
  before its first edit since the page was opened (`baselines.ts`) – the way back from a slipped drag or a removed
  node. It is saved like any edit. Step-by-step undo is the toolbar's (next section).
- **In the code**: a panel queues its save with every edit (`autosave.queue(key, save)`); a target's tree is saved by
  the workspace, not by a panel – every live tree of the stage (`stage.overrides`) is an edit the draft does not hold
  yet (`tree-autosave.ts`). A new kind of edit queues its own save the same way; it never adds a Save button.

### Undo, redo and the History (#312)

Every save is a row of the change log (docs/server.md "Reverting saved changes"), and the way back goes through it:

- **↶ ↷** in the stage toolbar (a group of its own, `UndoRedo.svelte`) and **Ctrl+Z**, **Ctrl+Shift+Z** / **Ctrl+Y**
  (not while a text field, a select or the code editor has the focus – they keep their own undo). Undo takes back the
  newest **step** of the person's own saved changes since the page opened: one save's rows, an autosaved burst of one
  thing (saves of it less than 8 s apart) or a revert's change set (`history.ts` `newestStep`). What waits to be saved
  is saved first. The server writes their `before` again as new changes; redo reverts that revert, until something new
  is edited. A plain undo runs at once; with a conflict, a change that cannot be reverted, later edits of the same
  thing or other people's changes it asks first.
- **The History panel** (the clock in the toolbar or the panels menu; closed at first): the experience's saved changes,
  newest first – when, who (you, an e-mail's name, an AI connection), what (the kind and its scene, entry or target)
  and before → after. Filters: scene (a scene's own changes, its entries', targets' and entities'), kind, person. A
  click on a row opens *Revert* (the change and the later edits of the same thing) and *Jump back to here* (every
  change after it, by anyone, as one change set); a change the log cannot take back says why.
- **The prompt** (`RevertPrompt.svelte`) lists what goes back, names later edits that will be lost and other people's
  changes, and the conflicts that stay. A revert reloads the draft, the stage and the panels. It changes the draft
  only – readers see it with the next publish.

### The experience search

The top bar's search (#237, `ExperienceSearch.svelte`, the logic in `experience-search.ts`) finds in the whole experience while an experience is
open – on the experience page too, where it reads the draft on the first focus: **entries** (title and text), **scenes**
(title, format, or a page number – its scene), **targets** (id, or the entry's title) and **named nodes** (a node's
`name`). Accents and case do not matter, every word must be found. The hits drop down grouped by kind (at most six each,
*· n more*), each with its scene and page (an entry's text hit with the words around it), ranked: a label that starts
with the query, then one with a word that does, then one that holds it, then a hit only in the text; equal ranks keep
the experience's order.

A pick goes to that scene and selects the item there – an entry (its form in the Inspector; with a printed target the
stage outlines it, without one the form opens all the same), a scene, a target or a node – and opens the Inspector
(`selection.show`; on another scene `selection.requestOn`, taken by the workspace's `enter` when that scene opens).
Keys: **/** (outside a field) or **Ctrl+K** focuses it, ↑ ↓ walk the hits (they wrap), Enter picks (the first hit when
none is chosen), Esc empties the field, then closes it. On a phone the bar shows a search icon; a tap lays the field
over the whole top bar with a × to close it, the hits below at the screen's width.

### Panel sizes

- The columns and their dragged edges (#144) became the [floating panels](#floating-panels) (#308): the Tree and the
  Inspector are resized by their own edges; the Inspector's rows of position, rotation and scale still put their label
  above the X / Y / Z fields in a narrow panel (`@container panel`, #172). The phone's sheet (#155) is gone (#317).

### The tree

The scene in the style of Blender's outliner: a chevron column, a type icon before every name (experience, entry, target,
group / model / video / image / text / light), guide lines per depth, zebra rows, and the **eye** in a column at the
right (shown = found; off = reported lost → outro, on found again → reveal). Rows: the scene, its entries in page order,
each entry's target ("in view" while the camera sees it) and the target's entity as its **node tree** – the root node (●
while the stage shows it with other values than the draft's; the shared ref) and its children, as deep as the content
nests them. Every node row shows the node's **name** (content schema 2.12, the Inspector's *name* row) and its type as
the icon; without a name the type. **Every row selects** (#227 – [Selection](#selection)); a tap anywhere on the row
counts, its icon and its empty cells too (the chevron and the eye keep their own); every row's help in the Info view
says what its tap does. Entries and nodes fold; the column collapses to its bar (‹ ›, kept on the device; until it is
toggled there, it starts collapsed in a window under 64rem – a tablet in portrait gives the panel its 25rem and the
stage the rest, #172). With a finger the rows are the touch control height, the chevrons and the eye as tall as the row
(#171). Under the scene row the **Surfaces** level (#314): the scene's surfaces (label · side), a tap selects one
(the Inspector shows it, the stage highlights it), its **+** adds a page, a wall or a custom one, Alt ↑ ↓ and a row's menu
reorder.

- **+ target** at the end of the tree opens the form for a new target on the scene: title, page, the printed image
  (*Library…* or *Upload…*), **what appears on the page** (none, model, video, image, text, group or light, with its file
  or line), the **entry category** (where the reader's consultation menu lists it – it follows what appears, a video
  makes a Videos entry, until set by hand; #165), and where it is printed (surface, x / y, width in mm) – the API makes
  entry and target, the stage shows it at once (and the reader tracks it after a publish: the engine makes the
  image-target data from the image at runtime). The stage shows a translucent ghost of its image ([Picking](#picking-hover-and-the-stages-menu)).
- **A row's menu** (#212) – a **right click**, a **long press** (the row lightens while the finger is held), or the
  **menu key / Shift+F10** on the tree for its selected row, each item with its icon: on a target row **Remove target** –
  the entry with its target, its entity and (only with the option) the Library files used only there go, after the same
  confirmation as a scene's, shown in the panel; on an entry row *Select the target* (with a printed target) and
  **Remove entry**, the same removal and confirmation – an entry without a target too; on the scene row *Add a scene
  after* (the creation step in the panel, #238 – every experience adds scenes since #320); on a
  node row *Move up / down*, *Into the node above*, *Out of its parent* and *Remove node* / *Remove entity*, each with
  its key at the right (not with a finger; a move that cannot be made is disabled with its reason).
- **Delete** (or Backspace) removes the selected node – its children with it, the root leaves the target without AR
  content; on an entry row it removes nothing silently but opens the entry's removal confirmation (#198); on the scene
  or a target row it does nothing. Removing is live on the stage and [saved by itself](#autosave); the Inspector's
  *Undo edits* brings the node back.
- **Hierarchy** (#163, `editor/src/lib/tree.ts`) – a node row is **dragged** onto another row of the same entity (it
  becomes that node's last child; the row shows a frame) or between two rows (a sibling there, the order set; a line
  shows where) – a mouse drags the whole row, a finger the row's type icon. **Alt + ↑ ↓** move the selected node among
  its siblings, **Tab / Shift + Tab** indent it (into the node above) and outdent it (right after its parent). A node
  placed next to the root wraps the root in a new group, so both are siblings under the target. Only parent and order
  change: a moved node keeps its placement values, now relative to its new parent. Live on the stage, saved by itself.

### Selection

One selection for the tree, the stage and the Inspector (#162, `editor/src/lib/selection.svelte.ts`, the rules in
`selection.ts`, the tree's rows in `tree-rows.ts`): the **experience** (the top bar's experience crumb, #237 – nothing on the stage,
no row in the tree), the **scene** (no target, no node), an **entry** (its own
selection, with or without a target), a **target** (a tap on its row, a pick of its printed image), its **entity** (the
root node) or a **node**; selecting in one selects in the others (#227). **Nothing else selected is the scene** (#229,
`settledSelection`): a workspace opens with it, another scene (‹ ›) starts with itself, and a click on the stage that
picks nothing selects it.

What each shows: the tree highlights the selected row over its whole width (its own grey and a bar at its start), the
rows above a selected node lighter, the hovered row lighter still. The scene drops the target's outline and the node's
gizmo from the stage and the Inspector shows its sections; an entry shows its form in the Inspector's place and, with a
printed target, outlines that target's print on the stage; a target is outlined on the stage; an entity or node gets the
gizmo; the Inspector opens at that level ([The panels](#the-panels)). A tap on the stage selects the root.

Keys in the tree: ↑ ↓ walk every row – the scene, the entries, the targets and the nodes –, ← → fold and unfold (← on a
folded or childless row steps up a level: node → parent → entity → target → entry → scene), Enter opens the Inspector.

### The Info view

A floating panel of the workspace, folded at the bottom left to start with,
after Ableton's Info View: the name and
description of the control under the pointer or in focus; collapsible, the state kept on the device. The panels carry
no explanatory text of their own – it is the controls' help (`editor/src/lib/help.svelte.ts`): an element with
`data-help="…"` (named by `data-help-name`, else its `aria-label` or its row's label), or its `title`; the innermost one
wins. New explanations go there, never as a hint line in a panel. On a phone (no tree column, no pointer) there is no
Info view.

## The stage

The **mock stage** (`editor/src/lib/stage/mock-stage.ts`) draws the scene at the desk in the same three.js scene as the
entities; the **mock tracker** reports its targets as found, and the editor simulates the game around the scene. It runs
in a sandboxed frame ([The stage frame](#the-stage-frame-plugins-in-a-sandbox-234)).

### The desk, the scene and the printed images

- **The sky and light** – one of six studio HDRIs from Poly Haven (`editor/static/hdri/`, CC0; Wooden Studio 17 by
  default, the [view settings](#camera-and-view-settings)' *sky*), shown while the shading is rendered: the
  equirectangular image on a sphere around the stage and as `scene.environment`, turned with the stage every frame so
  the room stays put while the camera orbits. **An experience with an environment replaces it** ([Environment](#environment), #185).
- **The desk** – the tool is for designers, who should feel at home: a steel tube frame after Egon Eiermann's table
  frame (1953), 72 cm high, with one of two tops of the same 1.8 × 0.8 m and the same surface height (the view settings'
  *top*, #226): **plywood**, the default – a screen-printed plywood board (18 mm; Poly Haven's plywood texture tinted to
  the phenolic brown on the faces) whose edges show cut plywood – 13 plies of birch per 18 mm board, as the trade's 18 mm
  birch plywood, alternating long grain and darker cross grain, parted by glue lines, drawn in code once (`plywood.ts`, a
  512 × 128 data texture, no image file) –, or **linoleum** – blue-grey linoleum (2 mm, its edge a thin line of its own)
  on an oak-faced 18 mm plywood board whose edges show the same 13 plies tinted to oak, the oak veneer underneath; the
  linoleum and the oak are drawn in code too (`linoleum.ts`, `oak.ts`). One low-poly model of our own
  (`editor/static/models/desk-eiermann.glb`, 256 triangles, the frame and both tops as meshes of their own, built by
  `editor/tools/desk-eiermann.py` in Blender – `editor/static/models/README.md`), loaded once, the top not chosen hidden,
  with the origin at the tops' surface, so the scene lies on it.
- **The scene's surfaces** (#319): each a plain board (1.5 mm) at its `place` – a double page flat on the table, a wall
  standing – its face paper, with its **reference image** fitted onto it (else paper). No book around them: no fold, no
  cover board, no block of paper, no layout sheet. The desk's top lies under the boards (the scene's y = 0).
- **Layers**: every plane lies a hair (0.5 mm) under the one above it: the entities sit at the target's own plane (z = 0,
  as the tracker reports it), the printed image one layer below, the reference image below that, the board's face below
  that, so nothing flickers.

The printed images: a target with a `place` lies exactly there, in its printed size, on its surface (`place.surface`,
else the scene's first – a scene of one surface names none). Without places: the images in a row across the middle of
the first surface, 60 mm wide (next to placed ones: across its lower half). The trigger protocol file that used to stand
in for missing places went with #32 – the places are in the configuration since #321.

### The mock tracker and the simulated game

Every target lies flat on the page and counts as **found**: the **mock tracker** (`stage/mock-tracker.ts`) implements
the engine's `IImageTracker` and reports each pose every frame exactly as the 8th Wall engine would (1 unit = the
printed width, origin in the image's centre, the image in the x/y plane), so `ArScene`, the entities, the animations
(reveal, unlock, outro), the bloom and the tap on an entity run unchanged. The three.js camera stays at the origin;
moving the view moves the stage and the anchors together, which is why entity and page can never drift apart.

The editor simulates the game around the scene (`stage/stage-core.svelte.ts`): which scene is open, which targets the
"camera" sees (the tree's eyes), which were found for the first time (the unlock animation plays once per target,
*Replay the first find* in the stage's right-click menu plays it again), and the reader's progress for the experience's
plugins (`stage/progress.ts` – the engine's `api.progress` and the `experience` scope of its variables, alive while the
workspace is open). Nothing of the reader's store, progress or routes is involved. The scene's *vars and events*
drive and show the narrative ([Vars and events](#vars-and-events)).

### The stage toolbar

The **Tools** panel (#180, #308 – an inline [floating panel](#floating-panels) at the stage's top left: it moves,
resizes like the others, a row or – its button, #315 – a column, and never folds; `components/ToolGroup.svelte`,
`lib/tool-groups.ts`), icons only (its menus add the names), every button's label its tooltip:

- **the tool** – **select** (a plain pointer, **Q**: a click picks what the filters allow, the selection is outlined, no
  gizmo; the tool a workspace starts with), the [gizmo](#the-gizmo)'s **move / rotate / scale** (**W / E / R**) or
  **surface** (**S**, #314 – the Surface mode: [Surfaces on the stage](#surfaces-on-the-stage-314)) –,
  the **select filters** – **entities, targets, models, nodes**, in this order, each a toggle saying what a click may
  pick, for every tool; with none on a click picks anything ([Picking](#picking-hover-and-the-stages-menu)); the
  collapsed group's menu has checkbox items and stays open while they are switched – and **render quality** (wire /
  solid / textured / rendered – [Outlines, shading and lights](#outlines-shading-and-lights)), always one button with
  its menu. Each group is one button showing its active option's icon (a small corner mark says it opens more); a tap
  opens its options in a menu attached to it – icon, name and shortcut, each with its name as tooltip and label – and a
  choice closes it. Where the toolbar has room the tool and the filters stay **expanded**, their options side by side:
  decided by the toolbar's own room (on a desktop the room between the Tree and the Inspector, or the width the Tools
  panel was resized to), never by the device – from the first group on, each
  expands while the toolbar still fits one row. The menu is a WAI-ARIA menu: ↑ ↓ (← →), Home / End, Enter or Space choose, Esc closes and returns the focus to
  the button, ↓ on the button opens it; a tap outside closes it and picks nothing on the stage. With a finger its items
  are the touch height (44 px).
- **grid & snap** (#190, `components/GridSnapMenu.svelte`) – always one button, the grid's icon with a dot in its corner
  while snapping is on, opening a small panel attached to it: *grid* (on / off and its step in mm), *vertical axis* (on
  / off), *snap* (on / off), *snap to grid*, *axes*, *objects*, *outlines* (one switch each, any combination) and the
  precision per gizmo mode: *move* (mm, the step while the grid is no snap target), *rotate* (degrees) and *scale*
  ([Grid, origin and snapping](#grid-origin-and-snapping)).
- **view** (#229, `components/ViewMenu.svelte` – the Stage tab's *stage* section until then) – one button the same way,
  the gear: *shake*, *origin*, *top* and *sky* ([Camera and view settings](#camera-and-view-settings)). Its tooltip names
  them all (`viewSummary`: *Eiermann · plywood · origin top left · no shake · sky Wooden Studio 17*); the stage menu's
  *View settings…* opens it.
- **live** and **restart** (#269) – the stage plays the experience live, as a reader sees it, all the time: there is no play
  mode to enter (the SCUTOONS deck editor's way, and Unreal's *Realtime* viewport). **Live** (pause / play icon) holds
  the entities' clock while it is off (`ArScene.holdClock`): components, clips, materials, textures and the experience's code
  get no time, so the scene stands still for placing – what is found still appears (the moments' looks play on), and the
  code loads either way. Videos and sounds stop where they are and a page found meanwhile does not start its video
  (`engine/src/scene/media.ts`, #275); the plugins' GPU feedback buffers (the ink painting) keep their last frame. Live
  again, everything goes on from where it stood. A plugin's own timers, and a video its code plays itself, keep theirs.
  Not stored: every workspace starts live.
  **Restart** is a new game (`resetNarrative`): nothing found, every variable cleared, the timeline empty – the scene's
  targets are found anew and play their reveal.

The two one-button groups are `components/ToolMenu.svelte` (the button, the panel, the keys), and the toolbar's room
counts them (`TOOL_SHAPES`). In their panels ↓ on the button opens it on its first control, ↑ ↓ / Home / End move
between its buttons (a number field or a select keeps its own keys), Esc closes it and returns the focus to the button,
Tab out of it or a tap outside closes it; every control has the touch height with a finger and its help in the Info
view. All of it are preview settings, stored in this browser (`stage/preview.ts`), never in the content; the Info view
shows each button's tooltip.

### Camera and view settings

The camera is moved on the stage itself: **drag** orbits, **Shift + drag**, the **middle button** or **two fingers**
pan (the looked-at point moves in the page plane), **wheel / pinch** change the distance, **double tap** returns to the
reader's view (35 cm above the page, tilted 30°; the free orbit is kept on the device). The panel's former view presets
and found chips doubled these and are gone.

The toolbar's **view** group – how the editor shows the scene, stored on the device: **shake**: 0 = still, 1 = a hand
holding a phone. **origin**: the 3 × 3 alignment square ([below](#grid-origin-and-snapping)). **top**: the Eiermann
desk's top, *plywood* (the default) or *linoleum* (#226; switching it changes only the top – the experience, the targets, the
grid and the camera stay; a desk stored before, `desk: "eiermann"` or `"schoepfer"`, becomes *plywood* or *linoleum*).
**sky**: one of six Poly Haven studios (the HDRI – sky and light while the shading is rendered), and a switch that turns
the HDRI **off** (#327: no sky and no HDRI light – the scene's own lights, remembered per browser); with the experience's
environment the row names its world (*the environment's (world café)*), the HDRI picker waits below it for an experience
without one, and the group's tooltip ends *· the environment's sky*.

**The render view** (#89, `lib/render-view.ts`): `…/editor/<experience>/<scene>/?render` – or `?render=top` / `low` /
`far` – shows the stage alone (no top bar, panels, toolbar or notices) at that view preset (`reader` by default; set
like the toolbar's, so it is stored on the device), and says how far it got on `<html data-osct-render="loading | ready
| error">`. It is for the MCP server's `render_scene`, which opens it headless and takes a picture
([mcp](mcp.md#seeing-a-scene-render_scene-89)); a person may open it too.

### Surfaces on the stage (#314, #319)

The mock stage draws the open scene **from its surfaces** (`stage/surfaces.ts`, `agents/SCENES.md` "Schema 3.0"). The
scene's coordinate system (`SurfacePlace`): mm, the origin on the table at the middle of the first row (a double page's
spine), +x right, +y up, +z towards the reader; the stage frame is the same origin with y away from the reader and z up
(a scene point (x, y, z) is the stage's (x, −z, y)). Every surface lies at its `place` (`rx`, `ry`, `rz` degrees, three.js
Euler `XYZ`; unturned flat, face up, top edge away from the reader; a wall `rx` 90) – there is no fixed row and no side
any more. **Arrange in a row** (`arrangeInRow` in `surface-edit.ts`; the Inspector's scene section, its selected surface
and the Tree's scene row and surface menus) writes a row: every surface flat on the table, side by side in the list's
order, touching, the row centred on the origin – off while the surfaces lie so already.

Each surface shows its **reference image** (the frame's `surfaceReferences` input, by scene id and surface id:
`{ url, fit }` with `cover`, `contain` or `stretch` – `fitImage`), else paper. `pageHit` finds the nearest surface a ray
meets inside its edges (else the one whose edge is nearest, so a drag past an edge stays on it); the ghost, its handles
and the snapping work on it, and a placement writes the surface's id into `place.surface` only while the scene has
several surfaces (`placeOnChoice`). The 2D snapping counts on the surfaces lying flat on the table, each at its size; a
print on a wall or a turned surface snaps in that surface's own plane, to its edges and the prints on it (no guides).

For the Surface mode: `Stage.setSurfaceMarks(outlined, highlighted)` outlines surfaces by id (grey; the highlighted one
white with a black line just inside, monochrome – RULES #38), the `surfacePick` event names the surface a tap hit (mm
from its top left corner, or null; `Stage.onSurfacePick`), and the layout snapshot lists the open scene's surfaces
(`Stage.surfaces()`: id, size, `flat`).

**The Surface mode** (#314): the toolbar's tool group has a **Surface** tool (S, after Q / W / E / R). With it the
stage outlines the open scene's surfaces, the one under the mouse a lighter grey; a click selects a surface – no target,
no node (the frame sends no `pick` in this mode) – and Esc deselects (the scene again). A surface selected in the Tree or
the Inspector stays highlighted in the other tools too. The selected surface carries its own gizmo
(`stage/surface-gizmo.ts`): `TransformControls` on a stand-in in the scene's coordinate system (a root turned +90° about x
into the stage frame, so position and Euler XYZ are the content's `place`), move or rotate as the Inspector's *gizmo* row
says, snapped to the **floor grid's spacing** and 15° while snapping is on. The stand-in and its white outline move at
once; when the drag ends the frame sends `surfacePlace` and the page saves the place with the scene's list (one autosave
subject per scene) – the board follows once the draft has it. A change of the scenes (`scenes.version`) loads the draft
and lays the open scene out again (`Stage.relayout` sends the newest draft first).

### Grids, origin and snapping

The toolbar's *grid & snap* group (`GridSnapMenu.svelte`, the settings in `stage/preview.ts`, drawn by `MockStage.setGrid`)
has three grids (#316, #319):

- **The surface grid** – the targets' grid on each surface (on / off, its spacing in mm; its lines run through the
  origin, which is red). A surface may have **its own spacing** (#316 part 1: the Inspector's surface, *grid*), kept in
  this browser per experience and surface (`surface-grids.svelte.ts`, `osct-editor-surface-grids:<experience>` →
  `<scene>/<surface>`) – not in the content; the open scene's spacings reach the stage with the preview
  (`surfaceGrids`). It is drawn on every surface in its own plane, a wall's on the wall; a print dragged on a surface
  steps by that surface's spacing.
- **The floor grid** – the scene's transparent net on the table (the scene's y = 0) through the origin, every *floor*
  mm (50 by default), every tenth line stronger, 1.5 m around the origin (a very fine spacing steps up to at most 400
  lines), under the boards. It is the **snap grid of the surfaces' places**: the surface gizmo steps by its spacing. On
  by default.
- **The vertical grid** – for wall setups: the same net standing at the scene's z = *Z* mm (−500 by default; + towards
  the reader, a wall ahead is at a negative z), from the table 2.5 m up, the floor grid's spacing. Off by default.
- **The target marks** (#323) – a helper for checking the places against the print: every target's printed place framed
  on its surface with its id on a label at the frame's top left, **green and solid** for a target in the experience,
  **orange and dashed** for a switched-off one (colour and line both; an explicit exception to the monochrome editor,
  as the #321 contact sheets). Drawn through everything, they follow a print that moves. Off by default, remembered per
  browser.

The *view* group sets the **origin** (`stage/origin.ts`): one of the nine points of an alignment square – a corner or an
edge's centre of the surface a position lies on, or the centre (the scene's origin, a double page's spine; a standing
surface's middle). The x / y rows of a target's placement and of a new target are shown and entered from that origin
(x to the right, y downwards, so values left of or above it are negative); what is saved stays mm from the surface's top
left corner. With the axis switch, a thin green **vertical axis** (#190) rises 150 mm out of the surface from each zero,
and the **scene's axes** show at its origin (x red, y up green, z towards the reader blue, 100 mm).

**Snapping** (#190, `stage/snap.ts` – the math, pure and tested –, `stage/snap-scene.ts` – the scene's side) works
for the gizmo and the placement handles; everything is counted in the stage's frame in mm (the scene's origin, x right,
y away from the reader, z up):

- **Move** (the gizmo's move, a print dragged by its placement handles) snaps per axis: the moving thing's anchors –
  its pivot and its box's edges and centre (a print: its edges and centre) – go to the nearest line within 8 screen
  pixels (turned into mm by the camera's distance): an **axis** (the origin's zero lines, the surface for the height),
  another **object** (its box's edges and centre, its pivot; a node's own parents count with their pivots only, its
  children not at all) or an **outline** (the other printed targets' edges and centres, the surfaces' edges). With no
  line near, the pivot (a print: its top left corner) rounds to the **grid** – every step of its surface's grid from the
  origin's zero – when the grid is a snap target, else to the **move step**. Only the axes a handle may change snap. The
  lines it snapped to are drawn as magenta **guides** while the drag lasts.
- **Rotate** snaps the angle turned since the drag started to whole steps of the rotate step (15° by default), about
  the drag's own axis; **scale** snaps each factor to whole steps of the scale step (0.1), never below one step.
- **On / off**: the toolbar's switch (stored per browser, off at first); holding **Shift or Ctrl** while dragging turns
  it around for that drag. A finger has no Shift – the switch is the way there.

### The gizmo

Three.js `TransformControls` on the selected node (the tree's or the stage's selection): **move / rotate / scale** by
the toolbar or **W / E / R** (the **select** tool, **Q**, hides the handles and keeps the selection's outline – #308), handles in the node's own space, so a drag changes the node's placement **relative to its
parent** – the Inspector's rows follow live, the drag is [saved by itself](#autosave) once it ends. It snaps as *grid & snap* says ([above](#grid-origin-and-snapping)).
A click that ends a drag selects nothing. The tracker lets the gizmo's gestures through (`MockTracker.ignorePointer`);
the engine opens the running scene to such tools with `IArScene.inspect()` (scene, camera, canvas, frame hook, a node's
object by its path, the tap's hit test) – the reader never calls it.

### Picking, hover and the stage's menu

A click on the stage selects what lies under the pointer by the **select filters** in the toolbar (#308; before them
Blender's strict select modes, #192), in this order: *entities* (a parcel – an entity, its root, from any of its nodes),
*targets* (the crosshair – a printed image, through an entity standing on it), *models* (the model node a hit belongs
to – itself or the nearest model above it) and *nodes* (a point on the graph – the node under the pointer, as deep as
the tree goes). Each is a toggle; **with none on a click picks anything** – the nearest hit at its finest (the node, or
the print). With several on, the nearest hit any of them takes is picked, at the finest level that is on (nodes before
models before entities). The filters hold for every tool – select, move, rotate, scale. A click where nothing the
filters take lies **selects the scene** (#229) – the tree, the stage and the Inspector
alike: no outline, no gizmo, the scene's sections in the Inspector; a workspace opens so too (no target stands in any
more). Particles and lines count only where they are drawn (8 px around the pointer), the editor's own outlines and a
light's rays never; a light is picked by its bulb. The pure filter is `editor/src/lib/stage/pick.ts`.

**Hover** (a mouse on a device that hovers): what a click would pick wears a light grey outline (a particle cloud its
bounds) and the pointer cursor; with a finger there is no hover – a tap selects at once and shows the orange outline.

A **right click** on the stage opens the menu for what lies there – the filters' pick, else the printed image under the
pointer: on a target *Add node… / Add AR content…*, *Remove node / entity*, *Placement on the page…*, *Library…*,
*Remove target*; on the page or the table *+ target…*, *Replay the first find* and *View settings…* (the toolbar's
*view* group). It is the editor's one context menu (`ContextMenu.svelte` – the keys as on the experience page's cards); while
it is open no key reaches the stage's shortcuts.

**A target's placement on the page**: while it is edited (the Inspector's rows) **the target itself lies at the edited
place** – its printed image, its outline and its AR content move together, so it never shows twice (#191) – with
**handles**: drag the image to move it (across the spine it changes the page), drag the small square at its bottom right
corner to set the printed width – the fields follow, and the placement is [saved by itself](#autosave). The new-target form shows a translucent **ghost** of the image with the same handles. The placement opens
at the place the stage shows (its own, the book's layout's, or the stage's fallback). The print is as wide as its place
says and as high as its image's aspect makes it; the stage anchors the AR content at the image's centre, as the
reader's tracker does – the placement math is `editor/src/lib/stage/placement.ts`.

### Outlines, shading and lights

The selected node wears Blender's orange **outline** (the edges of its meshes, drawn through everything, in the
object's own space – a video plane outlines as a plane), a selected target the same orange around its printed image (it
follows the image as loaded and a move), and what a click would pick a light grey one. The toolbar's **shading**, after
Blender's: *wire* (the entities as lines), *solid* (one grey under the scene's lights), *textured* (the content's
materials, no sky) and *rendered* (the HDRI's sky and light, the default – or the experience's environment as the sky, its
tooltip then says so); stored on the device. The post-processing passes show under *rendered* only. The stage and the
gizmo keep their own look.

**Light nodes** (content schema 2.6) have no mesh: the stage draws a **helper** for each, after Blender's – a small bulb
at the node's origin and lines for what the light does (short rays for a point light, the cone of a spot, parallel rays
for a directional light), in the node's own space so the gizmo moves and turns it (−z is where a spot or the sun
points); dark grey, orange while selected, drawn through everything, never in the reader
(`editor/src/lib/stage/light-helper.ts`). A click on the bulb picks the light. The HDRI dims only the scene's own
lights; a light node keeps the author's intensity in every shading.

### The stage frame: plugins in a sandbox (#234)

An experience's plugins are code any editor of the experience can write, and the stage runs it – the draft's plugins and the Code
tab's **Run**. So the stage does not run in the editor's page: it runs in an **iframe sandboxed with `allow-scripts`
only** – no `allow-same-origin` – at the editor's own route `/editor/stage-frame/` (`editor/src/routes/stage-frame/`,
outside the `(app)` routes with their sign-in gate). Its origin is **opaque**: plugin code there has no cookie and no
storage of the editor's (`document.cookie`, `localStorage` throw), cannot reach into the page (`parent.document` is
another origin's), and a request to the API carries no session – an opaque origin is another site, so the browser
withholds the `SameSite=Strict` cookie, and CORS refuses a credentialed read. The CSRF token and every API call stay in
the page.

- **The page's side** (`stage/stage.svelte.ts`, `Stage`): puts the frame first into the stage's container, under the
  toolbar and the notices, and keeps the API the panels used before – the overrides (`overrides`, `treeOf`, `editTree`,
  `removeNode`: the page's own), the selection, the gizmo's and the pick's modes, the environment, the ghost, the
  narrative (`setVar`, `tap`, `replayUnlock`, `resetNarrative`), the eyedropper (`sampleColor`) – sent to the frame;
  what reads the frame (`sampleColor`, `setVar`, `tap`) answers a promise. It mirrors what the frame
  reports: the state, the variables and the timeline, the layout of the targets (`pageFormat`, `placeOf`,
  `printedPlace`), the model nodes' timelines (`timeline`), and the **plugin registry as specs** – the engine's
  `pluginRegistrySnapshot` in the frame, `mirrorPluginRegistry` here, so the Inspector, *add pass*, the texture rows and
  *make it code* read the engine's registries as before while no plugin code runs in the page.
- **The frame's side** (`stage/frame-host.svelte.ts` with `stage/stage-core.svelte.ts`, the stage itself): reads the
  draft from the text the page sends (the page fetched it with its session; the frame never asks the API), loads the
  draft's plugins and runs the Code tab's modules (`stage/plugin-run.ts`), and answers the page's requests. It
  accepts requests only from its parent at the editor's origin and posts its events only there.
- **The protocol** (`stage/frame-protocol.ts`): requests with an id and their replies, events with a name and their
  data. The page acts only on events whose shape it checked (`readFrameEvent`). Since edits save themselves (#259),
  **two events reach the draft**, both numbers only, both for what the person has open in the page: a gizmo drag's
  placement (three vectors) – taken only for the node the page itself selected, the one the gizmo sits on – which the
  page writes into its own live tree, and a placement handle's move (surface, x, y, width) while the selected target's
  placement rows are open. Nothing else does: a pick selects, a key the frame forwards is one of the page's shortcuts
  (`FORWARDED_KEYS`: Shift, Ctrl, ← →, W E R, Delete, Escape – Delete removes the node the page selected, which is
  saved like every edit). Publish stays the person's click in the page.
- **The frame's policy**: before the draft and its plugins load, the frame takes a Content Security Policy
  (`frameCsp`, as a `<meta>` – it names the experience's content bases, which only the draft knows, so no static header can
  say it): its own scripts and the editor's static files under `/editor/`, the Library's files under
  `/api/content/`, the experience's content under `<content base>/assets/content/`,
  `blob:` (the Code tab's module) and `data:` – every source with its path, never `'self'`, so no request reaches the
  rest of the API. On a CDN instance the uploads lie in no content base: the frame admits **the experience's own Library
  folder** (`…/assets/<experience>/`, the experience's `libraryBase` – a file uploaded and picked for a node shows at once, before
  any saved row names it, #258) and the folders of other experiences' uploads the draft names, for files and requests, never
  for scripts; other content builds the draft still names only for images and media. Nothing may be framed, posted or
  opened; no worker. A draft whose files move to another base gets a new frame (a policy cannot widen).
- **Serving it**: the opaque frame loads the editor's module scripts and static files with `Origin: null`, so they are
  served with `Access-Control-Allow-Origin: *` – `client/public/.htaccess` for `/editor/` and `/assets/content/`, the
  editor's and the reader's dev servers allow `null` (`server.cors`). The Library's media already allow any origin
  (`ContentStore::serve`); the content CDN answers CORS for the reader anyway.
- **What it costs**: on a desktop (headless Edge, 1280 × 800) the stage renders at the same 60 fps with the same
  main-thread time per frame as in the page (≈ 1.25 ms on *The switch*, ≈ 1.5 ms on *The key*).
- **What it does not do**: plugin code can still send what it sees – the draft, which its author can read anyway –
  away by navigating its own frame, and it can post stage events (a placement, a pick, a forwarded key): with them it
  can move the node the person has selected, or the target whose placement is open, in this experience's draft – visible on
  the stage, taken back with *Undo edits* – and nothing more; it cannot publish, write anything else or read anything
  of the session. In the editor a plugin
  reaches only the content and the Library (`api.loadText`), no other origin. **The reader runs plugins in its own
  page** – not sandboxed yet ([server](server.md#sessions-cookies-and-csrf) "What the cookie does not do").

## The panels

Long panels are collapsible sections (`editor/src/lib/sections.svelte.ts`, `components/Section.svelte`), each with a
header, the open state kept per section on the device; a closed header carries a short summary where it helps, so closed
hides nothing that matters. The first section of any panel draws no divider under the tab row (`.section:first-child`
in `app.css`). Every row is the panel's label / control grid (`.row` in `app.css`).

### Inspector: a target, an entity or a node

`panels/EntityPanel.svelte` (the *Entity* tab until #229) opens at the selected level (#162): its head is the
**breadcrumb** *target › entity › group › node* (a crumb selects that level, ▾ after the target picks another target of
the scene). A selected scene shows [its sections](#inspector-the-scene), a selected entry
[its form](#texts-entries-and-the-experience).

**A target**: its printed image (thumbnail and name; **Replace image…** uploads another) and, behind *placement*, where
it is printed – surface, x / y and width in mm (`print`, content schema 2.1; an edit is saved by itself; until one a
target made in the editor lies where its form put it, an imported one where the book's layout says –
[the handles on the stage](#picking-hover-and-the-stages-menu)), and its AR content as a link one level down.

**An entity or a node**: its **name** (empty = the tree shows the type), its **file** (the file field: **Library…** – the
Library as the picker, with the filter set – or **Upload…**), then:

- **+ node** – type: group, model, video, image, text or light, and under *plugins* the node types the experience's plugins
  registered once they are loaded or Run; for model / video / image, or a plugin type with a `src`, a file chosen in the
  Library as the picker. It is the root of a target without AR content, else placed by **add as**: *next to it* (the same
  parent, right after the selected node – the default for a model, video or image) or *inside it* (its last child). A
  video whose size the Library knows starts scaled so a portrait file stays within one target width – the plane itself
  always takes the file's proportions.
- **make it code** (#188 – Unreal's *Create Blueprint from component*): a Code tab plugin whose `registerNodeType`
  reproduces the node, its type's builder as the starting point and its values as parameters, saved, run, and the node
  switched to it ([plugins](plugins.md) "An aquarium, step by step"). **remove node** / **remove entity**.
- **The rows**: every placement value (relative to the parent node), a text node's text and colour, a light node's
  **light** rows (kind as a segmented group, colour, intensity, distance and decay for a point or spot, cone angle and
  soft edge for a spot), a plugin node type's parameters (*node type · sparkle*, from its spec), for a node with meshes
  its **material** (#188: *its own*, or a material the experience's plugins register – then *material · water* with its rows
  and *remove*; **make code** beside it turns the node's own look into a `registerMaterial` in the Code tab), a `texture`
  parameter as a list of *none*, the plugins' procedural textures and the Library's pictures and videos
  (`TextureField.svelte`), a `model` parameter as a list of *none* and the Library's models (`ModelField.svelte`, #263 –
  the demo's *paper* takes its sheet that way), and every filter parameter of the node. Each row is one control height and labelled in words
  (#173): its spec's `label` (*plays on*, *key color*), else its name split into words (`degreesPerSecond` → *degrees per
  second*); the Info view names it with the content's name too (*speed · degreesPerSecond*). Position, rotation and scale
  have X, Y, Z side by side as in Blender (the *uniform* switch under the scale row links the axes: on = one
  `scale` field, as Blender's lock); every on / off is the `Toggle` switch (a track with a knob, #241, #243); choices are a segmented group; colours a swatch + hex whose swatch opens the
  editor's **colour popover** (after Scutoons': a palette of the usual keys and the experience's gold, this browser's recent
  colours, a saturation / brightness area with a hue slider, the hex, and the eyedropper that **picks from the stage** –
  the colour under the pointer in a chip, a tap takes it, Esc cancels; the sampled pixel is the rendered one, lit and
  tone-mapped). A reset arrow shows while a value differs from the type's default, ● on rows that differ from the draft.
- **Components** (schema 2.2), each with its rows and *remove*: **+ animation** on a model – the animation component
  shows the model's **timeline** (its clips, play / pause, the time in the clip as a slider) and drives the same clip
  the reader plays (`playOn` found / tap / never, `stopOn`, loop, speed). **+ behaviour** (any node, #88 –
  [content](content.md) "Behaviour") adds the rule editor (`BehaviourRules.svelte`, its logic in `behaviour-edit.ts`)
  instead of rows: per rule its event as pressed pills (*found*, *lost*, *tap*, *unlocked*, or *event* with a name field
  offering the experience's scene events and the core events), **+ condition** (a row per test: the variable – the experience's
  variables offered: its behaviours' and the ones live on the stage –, *=* or *≠*, the value typed as `true`, `false`, a
  number or a text, empty = not set; *and* / *or* between them, *all* / *any* from two on) and **+ action…** (a row per
  action, in order: the verb and what it takes – *play* a clip of the node's model, the clips read from the model on the
  stage, and the node by name; *pause*, *stop*, *show*, *hide* a node, *this node* or one of its subtree by name; *set* a
  variable, its value and scope; *emit* an event), × removes a rule, a test or an action. Every change runs on the stage
  at once (the engine takes new rules in place); what is not complete yet (an empty name, an event not chosen) is
  listed under the rows in red and keeps the tree's save back (the top bar says so). A save writes the rules in the content's shortest form. A component
  or material layer a **plugin** registers shows like a built-in one, with **+ type** after a Run in the Code tab.

Rows come from the content contract's definitions (`PLACEMENT_PARAMS`, `FILTERS`, `componentSpec`, `LIGHT_PARAMS`): a
new filter, component, light parameter or parameter needs no panel code (one snippet draws a parameter of any kind).
Changes show live on the stage and are [saved by themselves](#autosave): the **whole tree** of the entity goes to the
API – the shared entity when the target refers to one (the head says `shared: <ref> (n×)`), else the target's own;
**Undo edits** takes the tree back to how the draft had it before its first edit in this page.

**A model's textures** (#260). A model node with a file has a *textures* section: its colour map in several sizes,
which the reader's texture quality chooses from – the mesh loads once (`docs/content.md`, "A model's map by texture
quality"). Each size is a chip with the file's weight and a × to remove it; **Library…** picks a map among the
pictures, **Upload…** takes several files at once. The size is never typed: it is read from the picture, which must be
square and 512, 1024, 2048 or 4096 px wide – any other picture is named below the row and left out. *+ a set for
another material* starts a second set for a model with a map per material; its *material* field names the glTF
material (empty: every material). Choosing another model file drops the sets – they belong to the file. The stage's
view menu has *textures*: auto, or one size, to see the stage as readers on that quality see it
(`lib/model-textures.ts`, `components/ModelTextures.svelte`, the preview setting `textureQuality`).

**Levels computed in the browser** (#331 step 2). Under a set, **Compute 1024 · 512** makes the sizes it lacks below
its largest map, and **One file → levels…** takes one picture, uploads it at its size and makes every smaller one from
it: drawn on a canvas here in the browser, WebP at the image rule's quality, named `<map>-<size>.webp`, uploaded and
put in the set (`lib/texture-levels.ts`). Maps upload with the image rule's `texture` fit and keep up to 4096 px. Only
pictures: video levels are made beforehand, never encoded in the browser (Tilman, 2026-11-19).

### Inspector: the experience

A plain click on the experience's crumb in the top bar selects the experience (#237, `panels/ExperiencePanel.svelte`; Ctrl- or ⌘-click
still opens the experience page): its head *experience*, the experience's texts (`ExperienceTexts.svelte`, saved by
themselves → `PUT /editor/experiences/{id}`, *Undo edits*) – **texts** (its title, a section open at first) and
**printed book** (#320, decision 8 – a section with a switch in its head): on, the experience accompanies a printed book
and the section holds its **author** and **publisher** (`{ book: { author, publisher } }`; a book switched on waits for
its author before it is saved); off, it is no book – a wall, a room, an exhibition – and the reader shows no author or
publisher. Switching a saved book off takes a second step in the section (*Remove the printed book* / *Keep it*): it
sends `{ book: null }`, which removes author and publisher from the draft; *Undo edits* brings them back. Then the
experience's post-processing and appearance (in a scene's workspace) and where its content files are read from
(*assets*, the import's base; empty: the draft's origin). There is no source of truth any more (#320, #322): every
experience adds and removes scenes. The crumb stays underlined while the experience is selected. A tap in
the tree or on the stage selects something else again.

### Inspector: a group

A band of the Scenes panel clicked (#307 phase 3a, `panels/GroupView.svelte`, `selection.group`): the group's **label**
(saved by itself, `PUT …/groups/{id}`), its **scenes** (the first and the last), its **switcher** stop (one stop, its
label), its **targets** against the loading window with a meter (warning colour above it, with a note), the **window** –
*whole group* while it fits, else *by order* – shown only: the content has no field for it yet (`GroupData` is id and
label), and **the scenes in the group** with their targets, each a link that opens it, and **Ungroup** (the group goes,
its scenes stay in place).

### Inspector: a surface (#314, #319)

A surface selected (the Surface tool's click, the Tree's Surfaces level, an id in the scene's surfaces – the selection's
`surface` level, scene and surface id) shows `SurfaceView.svelte`: the crumb *scene › surface*; its **label** as printed,
its **size** (W × H mm) and its place in the scene's order (↑ ↓); *place* – **position** (x y z mm) and **rotation**
(x y z °, Euler XYZ), the *gizmo* row (move / rotate, for the Surface tool's gizmo) and *arrange the scene in a row*;
*grid* – the surface's **own grid spacing** for the targets on it (#316 part 1: kept in this browser per experience and
surface, *reset* takes the toolbar's again); the **reference image** (editor-only, never in the content – Library… with
the Library as a picker, Upload…, the fit cover / contain / stretch, remove; `PUT …/scenes/{id}/surfaces/{surface}/reference`
through `scenes.putReference`, which reads the references again – `scenes.references`, the stage's source too); *remove
surface* with the same confirmation as the list. Every field saves itself with the scene's whole list. The History
calls a reference's change *Reference image · scene · surface* (*image replaced*, a fit changed, removed) and files it
under its scene; the Library's usage line says *reference image of scene · surface*.

The placement rows of a target and the new-target form offer the scene's surfaces by id (their label, else their id)
while the scene has several, and write `place.surface` then (`surfaceChoices`, `placeOnChoice`); a scene of one surface
names none. An entry's form and the new-entry form offer the scene (a select of the experience's scenes – another one
moves the entry) and, in a scene of several surfaces, its surface (`EntryData.surface`, none = the scene as a whole).

### Inspector: the scene

With the scene selected the Inspector shows `SceneView.svelte` (#227, #229 – the Stage tab's sections, moved there):

- *scene* and *surfaces* (#307 phase 3a, `SceneSection.svelte`): the scene's **label** (what the reader's switcher and
  lists show; empty: its id), its **group** (or *self*), its targets of 10 and **arrange in a row**; then the
  **surfaces** (#314, `SurfaceList.svelte`): each with its **label** as printed, its id (a click selects the surface –
  the Inspector above), its size; ↑ ↓ reorder, ✕ removes after a confirmation that names the targets and entries lying
  on it (they fall back to the scene's first surface; its reference image goes too), *+ surface* adds a **double** page
  (460 × 320 mm, one surface) or a **single** page (230 × 320 mm) flat right beside the others, a **wall** (2000 × 1500 mm,
  standing ahead behind the flat surfaces, `rx` 90) or a **custom** one (300 × 300 mm) and selects it. Each field saves
  itself (`PUT …/scenes/{id}` – the whole list, places included). The Tree's Surfaces level and the selected surface run
  the same edits (`surface-actions.ts`, rules in `surface-edit.ts`).
- *post-processing* (the scene's own, `PUT …/scenes/{id}` with `passes`), *appearance* and *vars and events* – closed on
  a first visit (#193), below.

#### Post-processing

The scene's *post-processing* section (content schema 2.5, [content guide](content.md) "Post-processing",
`PassesPanel.svelte`). **The experience's passes are the master**: edited once, every scene without a list of its own shows
them. The section's header names the level in words (#181): **post-processing · the whole experience** while the scene on
the stage uses the experience's list (the default; editing it changes it for every such scene), **post-processing · only
this scene** while it has its own – an override for this scene alone, starting as a copy of the experience's (removing
every pass turns post-processing off there: *· off*; an experience without passes reads *· none*). The line under the header
says what editing changes – *changes all N scenes that use the experience's* (N counted from the draft's scenes without a
list of their own, this one as the panel holds it) with **own for this scene**, or *overrides the experience's for this
scene* with **back to the experience's**, which drops the override.

- **Each pass is a collapsible section of its own** (#233, agents/DESIGN.md §9): closed, its head names the type and the
  values set away from the default (*bloom · strength 0.35*, at most two – else its first parameter); its head's **on /
  off** toggle switches the pass without opening it (off writes `enabled: false`: the pass keeps its place and values,
  the stage and the reader skip it, the phone budget does not count it; a list whose passes are all off reads *· all
  off*), next to the arrows and *remove*. A pass added opens; open, it has a row per parameter from the pass's spec. The
  arrows move a pass earlier or later in the chain, *remove* drops one, changes show live on the stage.
- **add pass** offers **+ bloom / + vignette / + grade** and, in a row per plugin under its id, **the passes of the
  experience's plugins** (content schema 2.21, #216 – a compiled plugin's from its recorded spec as soon as the experience is open, a
  plugin **Run** in the Code tab at once, no reload). A plugin's pass shows its type with its plugin's id next to the
  arrows (*filmGrain* … *grain*) and its spec's rows – labels, help, ranges, on / off, a `texture` row with the Library's
  pictures and the plugins' procedural textures.
- A list beyond the phone budget (three passes, one bloom – #86) says so under the passes
  (`editor/src/lib/plugin-passes.ts`).
- An edit is [saved by itself](#autosave) – what changed: the experience's list (`PUT /editor/experiences/{id}/passes`, an empty
  one removes it) and / or the scene's (`PUT …/scenes/{id} { passes }`, `null` = back to the experience's); the level line
  says which it is before the edit is made. *Undo edits* takes both lists back (`editor/src/lib/passes-edit.ts`).
- **On the stage** the passes show under **rendered** only (like the HDRI's sky): the mock stage's table, boards, printed
  images and sky lie on the engine's **backdrop layer** and stand in for the camera picture: bloom and vignette run over
  them as they run over the camera picture in the reader; the grade's **reach** row (*AR layer / whole picture*) keeps it
  on the AR layer (it gets the layer's coverage as a mask) or grades the desk too, as the reader grades the camera
  picture. The **environment** (the look-around world and its sky – the stage's sky once the experience has one, and while the
  Environment tab is open) goes through the same passes, as it does in the reader.

#### Appearance

How the experience's AR entities appear and disappear (#265, content schema 2.29, [content guide](content.md) "How entities
appear", `AppearancePanel.svelte`): **appearance · the whole experience** – every scene plays it (*· default* while the experience
names no look). A collapsible section per moment, each closed on a first visit:

- **reveal** – the first find of a target (the entry is unlocked with it), **found** – every later find, **lost** – the
  page is lost (its look plays rewound, in the look's *disappear* time). Closed, a moment's head names its look and up to
  two values set away from the default (*found · printLift · appear 900 ms*), or where its look comes from (*reveal · as
  found · printLift*, *lost · default · inflateDissolve*).
- **look** picks the moment's look: the built-in **inflateDissolve**, **printLift** and **fade**, then the looks of the
  experience's plugins under each plugin's id (a compiled plugin's from its recorded spec as soon as the experience is open, a plugin
  **Run** in the Code tab at once). The first choice gives the moment no look of its own: **as found** for reveal and
  lost (they play found's), **default (inflateDissolve)** for found. Another look starts at its own defaults. The rows
  below are those of the look the moment **plays** – its own, else found's, else the default – at its values, so the
  default look can be tuned without picking it first; the first change makes the moment its own, a copy of the look that
  played with the change (#267). A look's rows come from its spec – the built-in looks share one set (appear / disappear time, the noise mask with its edge and
  glow, the shape, fade, tint, sparks, bloom; `shared/types/appearance.ts`), a plugin's are its own.
- **play** in a moment's head plays its look on the stage's shown targets: reveal replays the first find (as the
  stage menu's *Replay the first find*), found loses and finds them again, lost loses them and finds them again once the
  look has played out. A change plays at once – the stage's next animations take the panel's looks (`overrideAppearance`).
- An edit is [saved by itself](#autosave) (`PUT /editor/experiences/{id}/appearance`, the whole appearance; an experience whose
  moments all play another's look saves `null`). *Undo edits* takes it back (`editor/src/lib/appearance-edit.ts`, the
  looks offered `plugin-appearances.ts`).
- **A node's own looks** (#268, content schema 2.30): select a node of the entity in the tree – the root or any child – and *add
  component* → **reveal**, **found** or **lost**. The component has a **look**
  row – *as the experience*, the built-in looks, the looks of the experience's plugins – and, under it, the rows of the look it
  names, the same as in the experience's appearance above; another look starts with its own defaults. On the root it wins over the
  experience's look for the entity (its `found` also stands in for a moment it has no look of its own for, before the experience's);
  on a child node that node's subtree animates with it, apart from the rest.
  The stage plays it at once; the rows are written like any component's (`components.N.look`, `components.N.duration`),
  so `put_entity`, the YAML and the Code tab set the same values.

#### Vars and events

The scene's last section: the narrative of an experience like the demo ([plugins](plugins.md) "Across nodes and pages"),
driven from the tree's eyes and from here (#88; `stage/event-log.ts`, `stage/narrative.ts`):

- **tap** – a button per printed target of the scene (its entry's title): the reader's tap without aiming at the
  entity – the entity's `onTap` (a plugin component's, the `animation` component's `playOn: tap`, a `behaviour`'s tap
  rules) and the event `targetTapped`, through the engine's own tap path (`SceneInspection.tap`). Only a found target
  with AR content takes a tap; the others are greyed out.
- **vars** – the plugins' variables, a row each: the name, its scope and type (`experience · boolean`), and the value as the
  type's control – *false / true*, a ScrubNumber (committed when you let go or press Enter), a text field – and × to
  delete it. **set** below sets one by hand: a name, the scope (scene, stage, session, experience – the plugin API's four),
  the type and the value. Both write through the plugin API (`api.vars.set` with the panel as the plugin), so the
  plugins hear `varChanged` as from a plugin and a branch can be tested without playing up to it; the API's refusal (a
  name that is not camelCase) shows next to *reset*. **reset** starts a new game (every variable cleared, nothing
  unlocked, the timeline emptied, the scene found anew).
- **events** – the timeline, newest first: the time since the scene opened (`4.25 s`, `1:05.3`; a *reset* starts it
  again), the event (found, lost, unlocked, tapped, sceneChanged, varChanged, arState once per change, the plugins'
  own) and its payload; the last 100 are kept. A **behaviour** line is a rule of a `behaviour` component that ran
  (#88): the target, the node's name, the rule's number, its event and what it did (`play rattle · set hasKey = true
  (experience) · emit keyRattled`) – the log's own line, not an event of the stage (plugins never hear it); the events its
  actions caused follow above it. **clear** empties it.

### Environment

The experience's world around the reader and its sky (content schema 2.8 / 2.10, [content guide](content.md) "Environment",
[look-around](look-around.md); `EnvironmentPanel.svelte`). Two collapsible sections: *environment* (world, sky, onion
sky – open on a first visit) and *preview* (look up – closed, its header naming the angle).

While the tab is open the stage shows the **engine's own look-around pass** with the values being edited – the world
anchored to the experience, the window around it and the clear floor – under the desk and the experience (the studio's HDRI steps
aside, sky and light), turned by the view as a phone's gyroscope would turn it (`MockTracker.worldOrientation`,
`ArScene.previewEnvironment` – an editor-only method, not part of `IArScene`). **look up** raises the camera from the
experience towards the horizon and the sky (the targets stay found, as the reader's world stays for 45 s). Rows: **world** –
the built-in *café*, or a glTF model; **sky** – *the world's*, or an equirectangular image; each with *Library…* (the
Library as the picker), *Upload* (into the Library and taken at once) and *remove* (back to the built-in part); **onion
sky** on / off (it needs a camera picture, so only the reader shows it). Changes show at once and are [saved by themselves](#autosave)
(`PUT /editor/experiences/{id}/environment`); *Undo edits* takes the environment back, *Use the default* removes it.

**The environment replaces the HDRI sky box** (#185): once the experience has an environment – the draft's, or edits that
start one – the stage shows its world as the sky in every tab while the shading is rendered (the same pass, *look up*
stays the tab's), so the author sees the world the reader will see, not a studio behind it. The HDRI then no longer
lights: the reader lights the AR content with the engine's own ambient and sun (and the content's light nodes) – its
world is a pass under the scene and lights nothing –, so the stage does too. Where the reader shows its camera picture
– the window around the experience, the open roof – the world's pass leaves the frame transparent; the stage fills it with the
HDRI, drawn behind the world (destination-alpha blending, `behindWorld` in `mock-stage.ts`) as a background only – the
camera picture's stand-in, like the desk. An experience without one keeps the HDRI as sky and light. The decision is one pure
function, `editor/src/lib/stage/sky.ts` (`experienceEnvironment`, `showsWorld`, `stageLook` – which sky, which light).

### Library

The experience's uploaded files and the files of the import ([server](server.md) "Assets"; `LibraryPanel.svelte`, the
scope, groups and sort in `library-scope.ts`, #330). From the top:

- **Scope** – three-way: **This scene · <label>** (the open scene's files: its surfaces' reference images, its targets'
  printed images, every file its targets' nodes name – a model, a video, a texture map –, its entries' pictures; found in
  the draft, plus the scene of a file's first use the API names – the default while a scene is open), **All** and
  **Unused** (used nowhere: no scene, entry, environment or plugin – the API's count is 0), each with its count. Under
  *This scene* two links lead to *Unused* and *All files*.
- **Search** (name, place, collection, credits – `p015 target`) and **Upload** (the button, or files dropped on the
  panel – the file just uploaded is marked *just uploaded*, selected and shown whatever the scope and the filters said;
  bytes the Library holds already stay one file, which takes the upload's name and says so, #258).
- **Kinds** as chips counted within the scope: *All kinds*, **Targets** (a target's printed image in the draft, or the
  import's `target.*`), **Surfaces** (a surface's reference image), **Images** (the other pictures), **Video** (with the
  subtitle files), **3D** (glb, gltf), **Audio**, **Code** (its own list, below); a chip shows when it holds a file.
- **Sort** (name – numbers as numbers –, recently added, size, uses), the **tile size** and **tiles / list** (all three
  remembered per browser), and **⋯**: the origin (**from**: all · uploaded · imported – the editor's uploads apart from the
  files of the content import, #245) and *Name by use…*.

**Tiles** (`AssetTile.svelte`): a square preview only – an image or a video's first frame contained on the tile's light
background (a video plays muted while hovered), the type's icon else –, the kind in the top left corner (a target image
with the target glyph, *surface*, *3D* …), the **use count** in the top right (a dashed *0*: unused), a video's duration
at the bottom right; under it the name (one line – an imported file under its own name says its place, `p015-1 ·
target`) and one line: the pixels, the size, a version above 1, *+N more* uses. No buttons on the tile: hovered or
focused it shows **Use · Replace · ⋯** as icons (the native tooltip names each); **⋯** and a right click (or the menu key) open every action. A click selects the
file, a **double click** (or Enter) uses it. The **list** shows name, place, kind, size and uses per row; a click
selects, a double click uses.

**Stacks and frames** (#331): what the draft links stands together. A model's **map in several sizes** (its node's
*textures*, 512 … 4096 px) is one tile – the largest level, two sheets offset behind it and a badge with the levels
(`▤ 3`; dashed `▤ 2/3` while a level below the largest is missing). Hovered, **▤** opens the levels in a row under it:
each level a tile of its own (⇄ replaces only that file – a new version, every link stays), a missing level a dashed
slot, the next size up a dotted *optional* one; a click on a slot shows the model node, whose *textures* in the
Inspector add the level. The details of a level list the whole stack (size, pixels, weight; show, replace, download).
A model's mesh and its map stacks stand in a **frame** (its name, parts, files, weight; a click folds it), a video and
its subtitles too (by language – `speak.en.vtt` belongs to `speak.mp4`). A model file shows what it carries inside, dotted
– `◧ map`, `◧ 2 clips` – read from the start of the file. **The Library makes no link** (Tilman, 2026-11-19): files no
node names stay single tiles; levels and parts are linked where the content is edited. The browser's **levels:
stacked / single** shows every file alone; the list shows every file.

**Groups**: *This scene* is one framed group (*open scene*); in *All* the open scene's files are pinned on top in that
frame, then **Unused**, then a group per other scene in the scenes' order (each file under the scene of its **first
use**, `groupByScene` in `library-place.ts`) and **Not in a scene** (the experience-wide uses: the environment's world
and sky, a plugin's source, a shared entity no target shows) – those folded until opened; a search unfolds every group.

**The details** (`AssetDetails.svelte`) – a drawer at the panel's bottom for the selected file: the preview (a video
plays), the name, kind · pixels · duration · size · format, uploaded or imported and when, **used in** (the API's uses –
an imported file's from the draft, the API lists none for it; a click on a target, an entry, a surface's reference image
or a scene shows it in the Inspector, opening its scene first when it is another), the **credits** line (*Credits…*
edits it, #277) and every action: **Use for the selection** (the selected node takes the file, when its type fits),
**Set as target image** (an image becomes the selected target's printed image), **Replace…** (a new version, every use
relinked, the stage rebuilt), **Download** and **Delete** (refused while used – *Delete anyway* forces it); an imported
file is read-only. A file has no rename of its own – *Name by use…* names them. Nodes name a file by its absolute URL, so
draft and every publish point at the same file.

**The browser** (⤢ at the Library's top): the same Library as a large window over the stage – Esc or ✕ closes it. On the
left the **places** with their counts (counted on the search): *This scene*, *All files*, *Recently added* (the last 7
days), *Unused*, *Missing credits* (media without a credits line), the kinds, every scene that uses a file, *Uploaded* /
*Imported*. In the middle the grid (or the list) **grouped by scene, kind or none**, every group open; on the right the
selected file's details with the same actions. **Several files at once**: Ctrl / ⌘-click adds or takes one, Shift-click
the run from the last one – a bar offers **Download** (one after the other), **Credits…** (one line for all of them, one
request) and **Delete** (the imported ones are skipped; the used ones are named – *Delete anyway* forces those). A
use of a file closes the browser.

**Pictures become WebP in the browser** (#298, [content](content.md) "The image rule"; `editor/src/lib/browser-webp.ts`):
every upload and replace of the editor – the Library, a file field, the Pages view (one page and *Upload many*), the new
target and entry forms – goes through `library.upload` / `library.replace`, which converts a JPEG, PNG or WebP before the
request: `createImageBitmap(file, { imageOrientation: "from-image" })` (EXIF orientation applied), scaled down to the
longest side of the use's `?fit=` (a target 1200 px, the rest 2048 – never up), written by a canvas (`OffscreenCanvas`
where there is one) as WebP at quality 82, named `<name>.webp`. A canvas cannot write **lossless** WebP: a transparent
picture keeps its alpha but is lossy here (the server writes it lossless). Kept as they come: other files, SVG, GIF, an
animated PNG or WebP, a WebP already within the size, a picture above 50 MP (the API refuses it with its message), and
anything the browser cannot decode or encode as WebP – then the API's conversion is the fallback ([server](server.md)
"The image rule at upload"). The converted file is a WebP within the size, so the API stores it unchanged. Either way the
Library's notice line says what became of the file: *Photo.jpg (6.2 MB) is stored as Photo.webp – 2048×1536, 412 kB*.

**Name by use…** (#298 phase 3, in ⋯) names the files by where they are used: an entry's printed image
`p118-1_target.webp`, its colour picture `p118-1_image.webp`, another file of the entry or its own entity
`p118-1_<asset id>.glb` (a model's texture maps add their size), a surface's reference image `<scene>_<surface>.webp`, a shared entity's file `<entity>_<asset id>.ext`,
the environment's `environment_world.glb` / `environment_sky.webp`. An uploaded model or texture keeps its own name after
the place (`fight_2_remesh_4096.jpg` → `p010-3_fight-2-remesh-4096.jpg`). A file used in several places takes its first use;
unused files and files only a plugin's source names keep their names; two files that would take one name get `-2`,
`-3`. The first click shows the plan (*from → to*, the first twelve), **Rename N** applies it, *cancel* leaves it. The
**name only** changes – every URL and every use stays. An imported file (read-only) gets a listed name and shows it
instead of its place. New uploads whose use is known are named so at once: an entry's picture and a target's printed
image by their entry, a surface's reference image by its scene and surface ([server](server.md) "Files named by
use").

**Code files** (#186): the experience's **scripts** and **shaders** in a list of their own under the media (the filter
**code** shows it alone; `CodeFiles.svelte`, `library-code.ts`) – name, kind (*script* / *shader*), size, uses. A script
**is** a plugin source of the Code tab (the same rows, no second copy – its uses are the draft's rows that name a type it
registers; one with unsaved edits in the Code tab reads *name.ts\**, as the Code tab marks it – #232); a shader is an
asset of the kind `shader` (`.glsl`, `.frag`, `.vert`, `.wgsl` – its uses are the plugin sources that name its URL).

**Subtitles** (#257): a video's subtitle files (`.vtt`, the kind `subtitles`) are listed with the videos. A file named
`<video name>.<language>.vtt` belongs to the video of that name – no field names it – and while that video plays on
the stage, its English line (else the first language there is) shows at the stage's lower edge
([content](content.md) "Subtitles of a video").
**Upload** and drop take both: a `.ts` / `.js` becomes a plugin source named after the file (`Wobble Effect.ts` →
`wobble-effect`; a taken id is refused – *Replace…* that plugin instead), a shader file a shader asset; a code file is
at most 256 KB, and the API checks extension, content type and text. A click on a row opens it: where it is used, a
**read-only preview** (Monaco, loaded with the first preview – GLSL highlighted as C, WGSL as itself; `CodePreview`) and
its actions – **Open in Code** (a script: the Code tab opens with it), **Copy URL** (a shader: what a plugin loads with
`api.loadText(url)`), **Download**, **Replace…** (a file of the same kind: a script's new source; a shader's new version
at a new URL, the plugin sources that name it relinked) and **Delete** (refused while used – *Delete anyway* forces it).
How a plugin loads a shader: [plugins](plugins.md) "A shader file".

**The Library as the picker** (#164): every file field – a target's printed image, a node's file, a new node's file, the
new target's files, the environment's world and sky, an entry's picture – shows the file (a picture as a preview, every
file by its place) with **Library…** and **Upload…** (`FileField`). *Library…* opens the Library in place of the panel
as a picker (`LibraryPanel` with `pick`, `editor/src/lib/library-pick.ts`): only the files that fit the field, the scope
*All* (the open scene's files on top), the kind being picked first (a surface's reference image: all kinds); a click on
a file (or its **Pick**) picks it for that one field and returns, an upload that fits is picked at once, *cancel* or Esc
returns without one; the panel underneath keeps its values. ⤢ picks in the browser the same way. Selecting another
target or node closes it.

### Code

The experience's own code ([the decision](../agents/research/2026-10-29-code-in-the-editor.md), `panels/CodePanel.svelte`;
writing a plugin: [plugins](plugins.md)): the plugins stored for the experience and the ones the content declares (compiled by
the content build – opening one reads its `index.ts` next to the compiled module; Save keeps a copy). The picker names
each by its name alone, the one with unsaved edits with an asterisk (*aquarium\**, #232: unchanged needs no mark, and
whether readers have the stored sources is the top bar's *draft only* / *live on …*); the open source is kept while
another tab shows (`plugins.code`), so a tab switch loses no edit.

- **The editor** is **Monaco** (loaded with the tab only – the reader and the other tabs carry nothing of it):
  TypeScript with the content build's compiler options against `plugin-api.d.ts` (the module `osct-plugin-api`) and
  three's own types, so completion, hover documentation and type errors inline are the build's; Tab indents,
  Ctrl+Enter runs, Ctrl+S saves; the colours follow the editor's day / night tokens. **Download** gives the plugin's
  folder as a zip (`index.ts`, `plugin-api.d.ts`, a `tsconfig.json`).
- **The saved sources are part of the live stage** (#269): every frame that starts – the workspace opens, the frame
  loads again – gets each stored source by itself (`plugins.autoLoad`): the text last run in this page if there is one,
  else the saved one, transpiled and installed one after the other, then the scene built once – as soon as the frame
  answers, so a scene that does not build keeps no code from loading. A source stored under the id of a plugin the
  content declares wins over its compiled module (`keepPlugin`: the engine does not install that module over it).
  **Save** runs the saved text too. So the looks, components and node types of the experience's code are known to the pickers and the
  Inspector without a Run, on every visit. A line under the picker says what of the open plugin runs on the stage:
  *the saved version*, *edits not saved* (a Run), *failed* with the error – what ran before stays registered – or *not
  loaded*; another stored source that is not on the stage is named below it. A picker whose value no plugin registers
  says why instead of *unknown*: *loading the experience's code…*, *not loaded – reveal failed*, or *unknown – no plugin
  registers it*. **The way out of a hang**: a source the frame does not answer for within 10 s stops the auto-load
  (the rest wait), and its mark stays in this browser (`osct-code-autoload:<experience>`), so the next open skips it and
  says so – fix it, then Run it by hand.
- **Run** tries the open text, saved or not: it transpiles the TypeScript in the browser (sucrase, types erased – no type check, that is the build's half);
  the stage frame imports the module and installs it in the stage's registry under the plugin's id (a second Run
  replaces the first) – the code runs there, never in the editor's page ([The stage frame](#the-stage-frame-plugins-in-a-sandbox-234)) –,
  then builds the scene again: a material layer tints the video at once, a component shows under *add component* in
  the Inspector, a pass under *add pass*. Errors show under the editor and as a marker on their line (a transpile
  error, a plugin that imports a module – plugins import nothing, three.js is `api.three` – an invalid spec, an
  exception in `register`); the previous registration stays. The **log** under the editor has the plugins' lines from
  the stage, newest last: their `api.log` and their errors there (a build that failed, an error nothing caught); every
  Run starts it anew.
- **Save** stores the source (`/api/editor/experiences/{id}/plugins/{pid}`, a change recorded), **Delete** removes it –
  refused while the draft uses a type it registers (*used by entity castle – Delete anyway*). The Library lists the
  stored sources as its scripts and opens one here (**Open in Code**); a script file uploaded there is a source here.
- **A Run reaches no reader; Publish does**: the publish carries every saved source, transpiled in the browser as a
  Run transpiles it, and the API puts it into the version (#78, [plugins](plugins.md) "Shipping it"). Unsaved edits stay
  behind; a source that does not transpile stops the publish with its line; type errors are not checked there (#266). A
  node whose component, node type, material, pass or look neither a compiled plugin nor a saved source provides is
  refused (409 `unknown-components`, `unknown-node-types`, `unknown-materials`, `unknown-passes`, `unknown-appearances`).

## Settings and new versions

- Settings (view, orbit, sky, desk, shake, origin, grid and snap, shading, the open tab, the widths, the sheet's height,
  the tree open or collapsed, the open sections) are stored per device. The session is not: it is the API's HttpOnly
  cookie ([who may use it](#who-may-use-it)).
- **A new version under an open tab** (#230): a deploy replaces the editor's code, but an open tab keeps running the old
  one until it reloads. The editor asks for `/editor/_app/version.json` every 5 minutes (SvelteKit's
  `version.pollInterval`, `editor/vite.config.ts`) and whenever the tab gets the focus or becomes visible; when the
  deployed version differs, a quiet bar says *A new version of the editor is ready* with **Reload** – at the foot of the
  window (it covers no tool), under the top bar on a phone, its buttons at the touch height. It **never reloads by
  itself**. With unsaved edits – a save still waiting, running, failed or held back, or the Code tab's source – it says *reloading now drops your unsaved edits* and offers **Reload after
  saving** (the page reloads as soon as nothing is left unsaved) and **Reload now**.
  The cross (*Later*) hides it; the next reload loads the new version anyway. A code file that fails to load – a lazy
  chunk such as Monaco after a deploy renamed it, or one a deploy still uploading has not delivered yet (#160) – shows the
  same bar, and the panel says what it could not load (until #230 the editor reloaded once on its own). The decision is
  `editor/src/lib/new-version.ts` (tested), the unsaved edits are collected by `unsaved.ts` (the autosaver and the Code
  tab register theirs), the failed loads by `stale-chunks.ts`, the bar is `NewVersionBar.svelte` in the layout. Locally the dev
  server never reports a new version (`updated` is off in dev); `vite preview` of a build does.

## UI rules

The rules are RULES #32 (the Scutoons dogma – `scutoons/agents/DESIGN.md` –, one control height, rows labelled in words, `<scrub-number>`, segmented
pills, icons, the sheet, the editor's token variant, help in the Info view, collapsible sections with a toggle) and
`agents/DESIGN.md` §9 (sections and toggles). What is the editor's own, in `editor/src/app.css` (not the reader's
design tokens):

- **Palette**: day (white, light greys, near-black text) and night (dark greys, white text), following the system,
  forced with `data-scheme` on `<html>`; no colour but the danger red; muted text at least 4.5:1 against its background.
- **Sizes**: `--control-height` 1.75rem with a mouse, 2.75rem (44 px) with a finger (`pointer: coarse`, #171; the top bar
  grows with it), square corners (`--control-radius: 0`), compact system type.
- **Focus**: one focus ring for every control (2px in the text colour – a field marks its focus by its border).
- **Numbers** are `ScrubNumber`: the whole field is the gesture – press and slide, **up or right raises, down or left
  lowers** the value, the two directions add up (the quadrant rule; Scutoons' fields should follow) – Shift ×10, Alt
  ×0.1, tap to type, ↑ ↓, Enter, Escape, the reset arrow inside the field. A comma or a dot is the decimal point (`1,5` is
  1.5), no exponent (`1e3` is refused) and no thousands separators; a behaviour rule's value is read the same way
  (`parseNumber` in `values.ts`). No native sliders and no native colour picker – the colour popover, in the top layer.
- **Choices and switches**: small enums as segmented pressed pills; every on / off – a row, a section's head, several
  items one below the other (*snap to*) – is the `Toggle` switch (`Toggle.svelte`, #241, #243): a track with a knob that
  slides right and fills the track while on, `role="switch"` with `aria-checked`, Space or Enter flips it, `disabled`
  dims it. The row's word is its label; it carries no *on* / *off* text (`words` adds a quiet value after the track where
  the value has words of its own, a variable's *false* / *true*). Measurements: `agents/DESIGN.md` §9.
- **Disabled** controls look it at a glance – dimmed, a not-allowed cursor, a select without its arrow – and say why in
  their help, never in a hint beside them.
- **Hover** styles only under `@media (hover: hover)`, so a finger's tap leaves no hover grey that looks pressed (#178;
  pressed and focus states stay unconditional, a test checks every stylesheet).
- **Icons** (Feather, `Icon.svelte`) only where a word makes no sense – step, replay, photo, close, the chain that links
  the scale axes – and in the tree, where type icons and the eye are every outliner's convention (Blender, Unity,
  Figma); each with a name and a tooltip.
- Brand UI (gold, serif) stays in the reader – the stage itself renders the reader's content unchanged. Texts are English
  (RULES #20).

## Where the code lives

| Piece | Where | Notes |
|---|---|---|
| The engine | `engine/src/` | `content/` (loader, accessors, `contentUrl`), `scene/` (`ArScene`, entities, trackers), `types/`, `utils/`; compiled by the app that imports it (`@engine/*`) |
| The reader's scene | `client/src/components/ar-bridges/ar/index.ts` | `createReaderScene()`: the engine with the 8th Wall tracker (`engine/src/scene/xr8-tracker.ts`), where its files are served, the dev flag and the reader's graphics options ([tracking](tracking.md) "What the app gives the engine") |
| The editor's stage | `editor/src/lib/stage/` | `stage.svelte.ts` (the page's side of the stage frame, #234), `frame-host.svelte.ts` and `frame-protocol.ts` (the frame's side and the messages, the frame's policy), `plugin-run.ts` (Run's half in the frame), `stage-core.svelte.ts` (the stage in the frame: the simulation, owns the gizmo; gives the engine the dev flag and the device storage like the reader), `gizmo.ts` (TransformControls, hover), `mock-tracker.ts`, `mock-stage.ts` (+ `plywood.ts`, `linoleum.ts`, `oak.ts`, the desk tops' drawn looks), `preview.ts` (view, orbit, pan, sky, the desk's top, shake, origin, grid and snap, hidden targets; `viewSummary`), `stage-layout.ts`, `progress.ts` (the simulated progress), `event-log.ts` and `narrative.ts` (the scene's timeline, variables and tap buttons in the Inspector) |
| The demo's key model | `editor/tools/key-model.mjs` | the demo experience's animated key (`fixtures/demo/entries/key/key.glb`, 7 KB, one clip `rattle`) written as glTF binary by a Node script – no Blender; `node editor/tools/key-model.mjs` regenerates it, a test checks the committed file is the script's |
| Draft and session | `editor/src/lib/content.svelte.ts`, `session.svelte.ts`, `api.ts` | the draft through the engine's loader (`baseUrl` = the draft endpoint, `assetsBase` = the import's), the token for its requests |
| The API layer | `editor/src/lib/api.ts`, `storage.ts`; `shared/api/` | every call through one `request` (the session cookie and the CSRF token on writes – #207, a 401 that ends the session, the API's errors as `ApiError` with their details); the answers typed once with the MCP server (`shared/api/editor.ts`); `getExperience` reads an experience's tree once for the stage, the environment and the top bar and reads it again after any write to the experience (`fresh` for the experience page); `errorText` the one error line; the two-step confirmations through `confirmationStep` (`shared/api/errors.ts`); the settings in localStorage through `storage.ts` (`osct-…` keys, blocked storage tolerated) |
| Panels and controls | `editor/src/lib/panels/`, `components/`, `values.ts` | Tree, the Inspector (`EntityPanel` with `SceneView` and `EntryForm`; the tabs in `panel-tabs.ts`), Library, Code, Environment, Passes; `ScrubNumber`, `Segmented`, `Toggle`, `Section`, `Icon`, `FileField`, the toolbar's `ToolGroup` and `ToolMenu` (`GridSnapMenu`, `ViewMenu`); the floating panels `FloatingPanel` with `floats.ts` (placement, pure) and `floats.svelte.ts` (a workspace's set, the panels menu) (#308); the rows from the contract; the behaviour's rule editor `BehaviourRules.svelte` with its logic in `behaviour-edit.ts`; the Library's filters and picks in `library-pick.ts`, its scope, groups and sort in `library-scope.ts` (`AssetTile`, `AssetDetails`, #330), its code files in `library-code.ts` (`CodeFiles`, `CodePreview`), the new target's choices in `new-target.ts`; the tree's rows and their selection in `tree-rows.ts`, a selected entry's form in `EntryForm.svelte` (its logic in `entry-edit.ts`, its words outside the form in `entry-view.ts`), the scene section's in `scene-view.ts` (#227) |
| The experience's texts and search | `editor/src/lib/ExperienceSearch.svelte`, `experience-search.ts`, `ExperienceTexts.svelte`, `experience-texts.ts`, `panels/ExperiencePanel.svelte`, `panels/NewEntryForm.svelte`, `entries.svelte.ts` | [Texts](#texts-entries-and-the-experience), [The experience search](#the-experience-search), [Inspector: the experience](#inspector-the-experience) |
| The Code tab's plugins | `editor/src/lib/plugins.svelte.ts`, `plugins/compile.ts`, `stage/plugin-run.ts` | the stored sources, Run (transpile with sucrase in the page; import and `installPlugin` in the stage frame, rebuild), the plugins' log |
| The Code tab's editor | `editor/src/lib/plugins/monaco.ts`, `code-editor.ts`, `plugin-api.d.ts`; `editor/tools/plugin-api/` | Monaco (a lazy chunk, its workers bundled by Vite), the keys, theme and download; `plugin-api.d.ts` generated from `engine/src/scene/plugins.ts` by `npm run plugin-api` (the build runs it; Checks fails when the checked-in file differs) |
| Routes | `editor/src/routes/` | `(app)/` – the editor behind its sign-in gate (`+layout.svelte`): `+page` (sign-in, experiences, import), `[experience]/`, `[experience]/[scene]/`, `admin/`; `stage-frame/` – the stage frame's document, outside the gate |
| The API | `server/api/src/Experiences.php`, `ContentVersion.php`, `ContentStore.php`, `Editor.php`, `Plugins.php`, `ExperienceTexts.php` | [server](server.md) "Editor data", "Plugin sources", "Texts" |
| Book layout import | `scripts/layout/extract-layout.py` | sheets and printed geometry from the designed PDFs |

Stack (#157): **SvelteKit 3** with adapter-static 4 (a single-page app, `index.html` the fallback, base path
`/editor`), Svelte 5, Vite 8, TypeScript 6, Vitest 5; Node 22.17 or later. SvelteKit's configuration is in
`editor/vite.config.ts` (`sveltekit({...})` – there is no `svelte.config.js`). `src/lib` is imported as `#lib/…` with
the file's extension (`#lib/api.js`, `#lib/TopBar.svelte` – `imports` in `editor/package.json`); `@engine/…` and
`@shared/…` are Vite aliases plus `paths` in `editor/tsconfig.json` (which extends `$app/tsconfig`), because the
engine's own files import `@shared/…` too. Links and static files go through `resolve()` and `asset()` of
`$app/paths`, never a hand-built base path.

Tests: the engine's next to its code (`engine/src/**/__tests__`, run by the reader's vitest), the editor's tests
(`editor/src/**/__tests__`, `npm test` in editor/), the API test (`server/tests/api-test.php`, the editor flow
included). CI builds and checks the editor (`checks.yml`, job *Editor*); the image builds it next to the reader
(`Dockerfile`), Apache sends `/editor/*` to its `index.html` (`client/public/.htaccess`).

## Limits of this step

- Entities as node trees, files from the library (uploaded in the editor) or the content, targets with their printed
  image and placement, the entries' texts and the experience's. Renditions and transcoding stay with the
  content build. A target made in the editor tracks in the reader after a publish: the 8th Wall engine makes its
  image-target data from the printed image at runtime (`engine/src/scene/xr8.ts`), nothing has to be compiled. Events
  between nodes and pages are the plugin API's (`api.events`, since 1.1) and the `behaviour` component's; the experience's own
  code is the Code tab.
- One page format and the `book` layout template; the templates of the concept (`sheet`, `cover`, `sleeve`, `wall`)
  come with the content (issues #60, #61).
- The plugin API ([plugins](plugins.md)) has components, material layers, materials, procedural textures, passes, node
  types, parameter labels, text files, feedback buffers, events, variables in scopes, the progress and the scene, and
  rules without code are the `behaviour` component (#88); declared variables (with a type, a default and a write list)
  and bubbling event scopes come when a work needs them. The content build compiles the content source's plugins
  locally or in CI; the Code tab's go with the publish as the browser transpiled them – no type check (#78, #266).
- What the stage cannot simulate of a reader's game: consulted entries (no entry view), a reader's stored progress
  (the stage's progress lives while the workspace is open – leaving to the scene list starts a new game), two
  scenes on one stage (the mock tracker reports the current scene's targets only; a `stage` variable survives the
  switch, a `scene` variable does not), the reader's UI around the scene.
- The pass registry (`engine/src/scene/post/`) is what `api.registerPass` calls: `registerPass` with the plugin as
  owner, and `unregisterPassesOf` on uninstall. The content names the built-in passes and, since schema 2.21, a pass
  a plugin of the experience recorded (#216); a pass of a Code tab source goes with the publish, which carries the source
  (#78). *Make it code* for a built-in
  pass is not built.
- The bunny store against the real zone and MariaDB against the new tables are
  untested (SQLite and a storage double in the API test).
