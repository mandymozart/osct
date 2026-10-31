# Editor: the authors' tool at /editor

The editor is a SvelteKit app of its own (`editor/`, served at `/editor` next to the reader) for the people who make
the book's content: it runs the **engine** – the same AR scene the reader renders – over a **simulated page** instead
of a camera picture, so an entity (model, video, image, chroma key) can be placed and tuned at the desk, on the desktop
or on a phone, saved to the instance's database and published as a content version. The reader carries nothing of it
(RULES #32); the three parts are described in `agents/research/2026-10-29-editor-architecture.md`.

```
engine/   the base: content runtime + AR scene (three.js), no routes, no accounts, no UI
client/   the reader: the engine with the 8th Wall tracker
editor/   the editor: the engine with the mock tracker and its stage, the panels, saving, publishing
server/   the instance's API: /api/editor/* (docs/server.md "Editor data")
```

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
when the cookie now belongs to another person, the editor's session ends. An editor from before the cookie kept the
session token in `localStorage` (`osct-editor-session`): the first start after the update exchanges it for the cookie
(`POST /auth/cookie`) and deletes it, so nobody is signed out by the update.

A session that ends while the editor is open – it expired, the person signed out elsewhere, the account lost its role –
goes back to the sign-in form with *Your session ended – sign in again.* (#208): any API call answered 401 while signed
in ends it (`editor/src/lib/api.ts`, `session.svelte.ts`). The route stays, so signing in again returns to the same
page. The sign-in calls themselves (a wrong code or password), the sign-out and the startup check answer 401 without
that note.

## Try it (the demo book, or the fixture's studio spreads)

The **demo book** (`fixtures/demo/`, `DEMO.md`): six spreads that use every node type, placement, filter and
component, eleven plugins, and a narrative across its pages – the key on page 1 opens the door on page 3, the lamp
lights when the door opened, a tally counts the pages found, a tap switches a scene ([plugins](plugins.md) "The demo
book", the note `agents/research/2026-10-30-demo-book.md`). The fixture's **studio spreads**
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
5. **Import a book…** → *URL* `http://localhost:5174/src/game.config.json` (the reader's dev server serves its bundled
   configuration), *assets at* `http://localhost:5174` → Import. The book appears with its spreads.
6. Open *The key*: the stage shows the spread's targets with their entities, the key is found and unlocked – the
   **Inspector** shows the spread (selected when the workspace opens), and its *vars and events* has the timeline of
   the finds. *tap* → *The key* takes it: its **behaviour** rule
   (#88, select the key to see it in the Inspector) plays the model's clip `rattle`, sets `hasKey` (book,
   boolean, true) and emits `keyRattled` – in the timeline (newest first) the rule's `behaviour` line sits under the events it caused. Walk with › to
   *The door*: its rules hide the hint and emit `openDoor`, the `door` plugin lifts and turns the door,
   `stage · doorOpen = true`, the lamp on the right page shows. Switch a target off and on with the
   tree's eye (lost, found again), *Replay the first find* in the stage's right-click menu plays it again, *reset* in
   the spread's *vars and events* starts a new game – on *The door* the hint shows then; *set* `hasKey` (book, true), switch the door
   off and on, and it opens without a visit to the key's page. Open *The switch*
   and click the entity on the stage: the next scene shows; its *post-processing* holds *scanLines* switched off – the
   toggle in the pass's head turns the lines on. The **Code** tab lists the eleven plugins (compiled by the
   content build, their sources next to them): change one, **Run**, and the stage shows it. Move a node in the
   **Inspector** (type a scale, or press and slide), **Save**, then **Publish** – it goes to `local · this server`,
   the local API's own environment.
   With the fixture: open *Studio A – models* the same way.
7. The reader reads the published version when it is started with
   `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` (`latest.json` names the new build).

The one-page version of this flow for editors, with the diagram, ships with the app at `/docs/tutorials/`
(`client/public/docs/tutorials/index.html` – a static page, served by the site's `.htaccess` like any file). Its other
chapters bring a book in (the CDN, a URL or a file, the assets base, what is on the CDN – #95), walk through the demo
book (#148) and tour the editor's tools, with screenshots of the editor (`client/public/docs/tutorials/import/`,
`demo/`, `tools/`).

On staging the same flow runs against the CDN: `CONTENT_STORE=bunny` with the storage zone's credentials in the
`staging` GitHub environment ([deploy](deploy.md)); *Import a book… → the CDN* takes the current version, publishing
(to `staging · CDN`) writes a new one, and the staging reader sees it on its next start.

**The demo book on staging**: the workflow *Demo book* (`.github/workflows/demo.yml`, by hand or on a push to
`develop` that touches the demo) builds `fixtures/demo` and syncs it to the environment **`demo`** of the storage zone
– `https://buildingfictions.b-cdn.net/demo/`. In the staging editor: *Import a book… → URL* with that base URL (the
form takes the current version and its folder as *assets at*), then open its spreads. Publishing it there makes it *the*
book of staging (the store is per environment, not per book – see "One book per environment" below), so the editor's
publish step says so first. On a phone, the staging reader opens it with
`https://osct.porschuetz.de/?content=https://buildingfictions.b-cdn.net/demo` ([content on the CDN](content-cdn.md)).

### Publish: the instance's own environment

An instance publishes to **its own environment only** (#183): a developer's machine to `local`, staging to `staging`,
production to `production` – the CDN keeps a root folder per environment, and staging is for testing. There is no
choice of environment: next to **Publish** the bar names the target with its backend – `staging · CDN` (a connected CDN
has priority) or `local · this server` / `staging · this server` (the directory store of an instance without a CDN,
[server, "One environment per instance"](server.md#one-environment-per-instance)). Wherever this server is the target,
a short *No CDN connected* stands next to it (its help in the Info view has the whole line). **Publish** opens a step in
the page – no browser dialog – that names the book, its build now, the target and what it replaces there (*Replaces
build … of “Test Book” on staging*, or another book, below), says on production that every reader gets it, and where
this server is the target: *No CDN connected – the published content is stored and served by this server only. Readers
load from here without edge caching; heavy media goes through this server. Back up the content store.* Its button
publishes; *Cancel* or Escape closes it. Another environment is published from its own editor (the API refuses it,
403 `other-environment`). Importing from any environment stays open – with the comparison below.

### Import: the version comparison

Importing replaces a book's draft, so over a book that exists the form shows a **comparison** first and imports only
when the person confirms there (#183): the incoming build against the build the draft is based on – its id, when it was
built, the app and the content schema version that built it (differences in bold) –, who imported the draft's base and
when, the draft's **edits since that import** (their number, the newest five from the change log – who, what, when; an
AI connection's edits name it) and whether the draft as it is now is live anywhere. **Replace the draft** (or *Import
again* when the same build comes in and nothing was edited) imports; *Cancel* goes back to the form. The comparison is
the API's first step (409 `confirm-import`), the button sends its confirmation – when the draft changed meanwhile, the
form shows the new comparison and says so.

### Import: what comes in

Before the comparison, the form shows what an import would bring in (#182, `POST /api/editor/import/preview` –
[server](server.md#import-preview)): *From* (the content base), the build with when it was built and became current on
the CDN, the app and content schema version, the **one book** in it (title · id) and what it holds (spreads, entries,
targets, shared entities), and where its media resolve (*Assets at*). The button says it: *Import 1 book: The Demo Book
(build 7457f0c…)*. *The CDN* reads it at once (the server knows the content base), a URL once typing pauses (the browser
reads the content base's `latest.json` or the `game.config.json`, the server checks it), a file when it is chosen; the
import then sends exactly what was previewed. The book's id is the configuration's `book.id` – no id field and no
browser prompt (a configuration without one is refused by the import anyway). When a draft with that id is here, the
form says so first – *A draft of “The Demo Book” (demo) is already here – importing replaces it.*, how many of its
edits since its import are lost (unpublished, unless the draft as it is now is live) and where it is live; the
comparison above follows on the button. A source that cannot be read – the CDN offline, no `latest.json`, one that
names no build – shows the error with the URL and *Try again*.

### One book per environment

Each environment's content store (`<env>/latest.json`, `<env>/<build>/` – [content on the CDN](content-cdn.md)) serves
exactly one book: the last one published there. Until the store has a folder per book (#87) the editor makes that
visible and safe (#143):

- **Where a book is live.** The Books overview shows under each book *live on staging · build … · since …* (one line per
  environment that serves it) or *draft only*; next to Publish the book page shows the same in short. An environment
  serving a book that is not imported here, or whose store cannot be read, gets a line under the list.
- **Publishing over another book asks.** The publish step names both when the environment serves another book
  (*Staging serves “Onion Skin & Crocodile Tears”. Publish “Demo” instead? …*); production says it more strictly (every
  reader of the app gets the other book). Only its *Replace on staging* sends `replace: true` – the API refuses the
  publish without it (409 `other-book`; when that happens because the environment changed meanwhile, the step opens
  again with what it serves now).
- **Switching back** is publishing the real book again (with the same question): when its draft is unchanged, its last
  version is still on the store and only `latest.json` moves back – nothing is uploaded again.
- The MCP server never replaces a book: its publish gets the 409 and leaves the decision to a person in the editor.

## What is on the stage

The **mock stage** (`editor/src/lib/stage/mock-stage.ts`) draws, in the same three.js scene as the entities: the
**sky and light** – one of six studio HDRIs from Poly Haven (`editor/static/hdri/`, CC0; the toolbar's *view* group's *sky*, Wooden Studio 17 by default,
shown while the shading is rendered), the equirectangular image on a sphere around the stage and as `scene.environment`, turned with the
stage every frame so the room stays put while the camera orbits; **a book with an environment replaces it** (#185, below) –
the **desk** (Tilman: the tool is for designers, they should feel at home) – a steel tube frame after Egon Eiermann's
table frame (1953), 72 cm high, with one of two tops of the same 1.8 × 0.8 m and the same surface height, the
toolbar's *view* group's *top* (#226: switching it changes only the top – the book, the targets, the grid and the camera stay):
**plywood**, the default – a screen-printed plywood board (18 mm; Poly Haven's plywood texture tinted to the phenolic
brown on the faces) whose edges show cut plywood – 13 plies of birch per 18 mm board, as the trade's 18 mm birch
plywood, alternating long grain and darker cross grain, parted by glue lines, drawn in code once (`plywood.ts`, a
512 × 128 data texture, no image file) –, or **linoleum** – blue-grey linoleum (2 mm, its edge a thin line of its own)
on an oak-faced 18 mm plywood board whose edges show the same 13 plies tinted to oak, the oak veneer underneath; the
linoleum and the oak are drawn in code too (`linoleum.ts`, `oak.ts`). One low-poly model of our own
(`editor/static/models/desk-eiermann.glb`, 256 triangles, the frame and both tops as meshes of their own, built by
`editor/tools/desk-eiermann.py` in Blender – `editor/static/models/README.md`), loaded once, the top not chosen
hidden, with the origin at the tops' surface, so the book lies
on it – the open book as an object – two blocks of paper on a white hardcover board (2 mm) that overhangs the pages by 3 mm, the block's
thickness an approximation from the number of spreads (0.15 mm a sheet, half on each side, 3–40 mm) – and the current
spread's printed images. A spread of the format `cover` or `back` shows the **closed book** instead – the printed
cover board on top (the layout's `cover-front` / `cover-back` sheet as its texture), the whole block of paper under
it, centred on the origin, one page wide – and its targets lie on the surface `front` or `back`. Every plane lies a
hair (0.5 mm) under the one above it: the entities sit at the target's
own plane (z = 0, as the tracker reports it), the printed image one layer below, the sheet's image below that, so
nothing flickers. The printed images:

- with the **book's layout** (`content/layout/`, imported from the designed PDFs – [content guide](content.md),
  "Importing the book layout"): the spread's sheet as laid out is the page's texture, and every target lies exactly
  where it is printed, in its printed size, on its own page (left or right). Leafing with ‹ › shows the next sheet.
  The covers are in the layout too (`cover-front`, `cover-back`) for works that place targets there;
- without the layout but with the **trigger protocol** (`/trigger-protocol.json`, `npm run protocol`): blank pages
  in the book's page format (230 × 320 mm, a constant), each image in its printed size in the region its `position`
  names (`top left` …) on the right page, several in one region stacked;
- without either (the fixture): the images in a row across the middle of the right page, 60 mm wide.

The stage's **sheet image is sharpened on demand**: the layout carries a second, much sharper image per sheet
(`imageSharp`, `sheets/<sheet>@sharp.jpg`); the stage fetches it once, when the camera comes within 50 cm of the page.
The toolbar's *grid & snap* group sets a **grid** (on / off, spacing in mm; its lines run through the origin, which is
red), its *view* group the **origin** (`stage/origin.ts`): one of the nine points of an alignment square – a corner or an edge's centre of the base
format (per page), or the centre (the book's centre, the spine's middle, on the open book; the page's centre on a cover). The x / y rows of a
target's placement and of a new target are shown and entered from that origin (x to the right, y downwards, so values
left of or above it are negative); what is saved stays mm from the page's top left corner. With the grid, a thin green
**vertical axis** (#190) rises 150 mm out of the page from each zero of the origin (one at the book's centre, one per
page for a corner) – the height's line next to the red x / y lines; the toolbar's *grid & snap* switches it on and off.

**Snapping** (#190, `stage/snap.ts` – the math, pure and tested –, `stage/snap-scene.ts` – the scene's side) works
for the gizmo and the placement handles; everything is counted in the stage's frame in mm (origin in the middle of
the book, x right, y up the page, z out of it):

- **Move** (the gizmo's move, a print dragged by its placement handles) snaps per axis: the moving thing's anchors –
  its pivot and its box's edges and centre (a print: its edges and centre) – go to the nearest line within 8 screen
  pixels (turned into mm by the camera's distance): an **axis** (the origin's zero lines, the page plane for the
  height), another **object** (its box's edges and centre, its pivot; a node's own parents count with their pivots
  only, its children not at all) or an **outline** (the other printed targets' edges and centres, the pages' edges and
  the spine). With no line near, the pivot (a print: its top left corner) rounds to the **grid** – every grid step from
  the origin's zero of the page it lies on – when the grid is a snap target, else to the **move step**. Only the axes a
  handle may change snap (the X arrow only x; a plane its two; the centre handle the page's x and y; a node turned
  away from the page's axes keeps its turned handles unsnapped). The lines it snapped to are drawn as magenta
  **guides** across the spread while the drag lasts.
- **Rotate** snaps the angle turned since the drag started to whole steps of the rotate step (15° by default), about
  the drag's own axis; **scale** snaps each factor to whole steps of the scale step (0.1), never below one step.
- **On / off**: the toolbar's switch (stored per browser, off at first); holding **Shift or Ctrl** while dragging turns
  it around for that drag. A finger has no Shift – the switch is the way there.

Every target lies flat on the page and counts as **found**: the **mock tracker** (`stage/mock-tracker.ts`) implements
the engine's `IImageTracker` and reports each pose every frame exactly as the 8th Wall engine would (1 unit = the
printed width, origin in the image's centre, the image in the x/y plane), so `ArScene`, the entities, the animations
(reveal, unlock, outro), the bloom and the tap on an entity run unchanged. The three.js camera stays at the origin;
moving the view moves the stage and the anchors together, which is why entity and page can never drift apart.

The editor simulates the game around the scene (`stage/stage-core.svelte.ts`): which spread is open, which targets the
"camera" sees, which were found for the first time (the unlock animation plays once per target, *replay* plays it
again), and the reader's progress for the book's plugins (`stage/progress.ts` – the engine's `api.progress` and the
`book` scope of its variables, alive while the workspace is open). Nothing of the reader's store, progress or routes
is involved.

### The stage frame: plugins in a sandbox (#234)

Tilman, 2026-10-31: *"Make editors safe, please. Sandbox."* A book's plugins are code any editor of the book can write,
and the stage runs it – the draft's plugins and the Code tab's **Run**. So the stage does not run in the editor's page:
it runs in an **iframe sandboxed with `allow-scripts` only** – no `allow-same-origin` – at the editor's own route
`/editor/stage-frame/` (`editor/src/routes/stage-frame/`, outside the `(app)` routes with their sign-in gate). Its
origin is **opaque**: plugin code there has no cookie and no storage of the editor's (`document.cookie`, `localStorage`
throw), cannot reach into the page (`parent.document` is another origin's), and a request to the API carries no
session – an opaque origin is another site, so the browser withholds the `SameSite=Strict` cookie, and CORS refuses
a credentialed read. The CSRF token and every API call stay in the page.

- **The page's side** (`stage/stage.svelte.ts`, `Stage`): puts the frame first into the stage's container, under the
  toolbar and the notices, and keeps the API the panels used before – the overrides (`overrides`, `treeOf`, `editTree`,
  `removeNode`: the page's own), the selection, the gizmo's and the pick's modes, the environment, the ghost, the
  narrative (`setVar`, `tap`, `replayUnlock`, `resetNarrative`), the eyedropper (`sampleColor`) – sent to the frame;
  what reads the frame (`sampleColor`, `sampleBottom`, `setVar`, `tap`) answers a promise. It mirrors what the frame
  reports: the state, the variables and the timeline, the layout of the targets (`pageFormat`, `placeOf`,
  `printedPlace`), the model nodes' timelines (`timeline`), and the **plugin registry as specs** – the engine's
  `pluginRegistrySnapshot` in the frame, `mirrorPluginRegistry` here, so the Inspector, *add pass*, the texture rows and
  *make it code* read the engine's registries as before while no plugin code runs in the page.
- **The frame's side** (`stage/frame-host.svelte.ts` with `stage/stage-core.svelte.ts`, the stage itself): reads the
  draft from the text the page sends (the page fetched it with its session; the frame never asks the API), loads the
  draft's plugins and runs the Code tab's modules (`stage/plugin-run.ts`), and answers the page's requests. It
  accepts requests only from its parent at the editor's origin and posts its events only there.
- **The protocol** (`stage/frame-protocol.ts`): requests with an id and their replies, events with a name and their
  data. The page acts only on events whose shape it checked (`readFrameEvent`), and **no event leads to an API call**:
  a gizmo drag reports the node's new placement and the page writes it into its own override (unsaved, like every
  live edit), a pick selects, a key the frame forwards is one of the page's shortcuts (`FORWARDED_KEYS`: Shift, Ctrl,
  ← →, W E R, Delete, Escape – nothing that saves or publishes). Save and Publish stay the person's click in the page.
- **The frame's policy**: before the draft and its plugins load, the frame takes a Content Security Policy
  (`frameCsp`, as a `<meta>` – it names the book's content bases, which only the draft knows, so no static header can
  say it): its own scripts and the editor's static files under `/editor/`, the Library's files under
  `/api/content/`, the book's content under `<content base>/assets/content/`, the trigger protocol at the site's root,
  `blob:` (the Code tab's module) and `data:` – every source with its path, never `'self'`, so no request reaches the
  rest of the API. Nothing may be framed, posted or opened; no worker. A draft whose files move to another base gets a
  new frame (a policy cannot widen).
- **Serving it**: the opaque frame loads the editor's module scripts and static files with `Origin: null`, so they are
  served with `Access-Control-Allow-Origin: *` – `client/public/.htaccess` for `/editor/` and `/assets/content/`, the
  editor's and the reader's dev servers allow `null` (`server.cors`). The Library's media already allow any origin
  (`ContentStore::serve`); the content CDN answers CORS for the reader anyway.
- **What it costs**: on a desktop (headless Edge, 1280 × 800) the stage renders at the same 60 fps with the same
  main-thread time per frame as in the page (≈ 1.25 ms on *The switch*, ≈ 1.5 ms on *The key*).
- **What it does not do**: plugin code can still send what it sees – the draft, which its author can read anyway –
  away by navigating its own frame, and it can post stage events (a placement, a pick, a forwarded key) that change
  the person's unsaved live state; it cannot save, publish or read anything of the session. In the editor a plugin
  reaches only the content and the Library (`api.loadText`), no other origin. **The reader runs plugins in its own
  page** – not sandboxed yet ([server](server.md#sessions-cookies-and-csrf) "What the cookie does not do").

## The app

- **Books** (`/editor/`): the instance's books, *Import a book…* (the CDN's current version, a `game.config.json` by
  URL or file, or a **content base URL** – a CDN folder with `latest.json`, e.g. `…/demo` – whose current version is
  taken; *assets at* = where its `/assets/content/…` paths resolve – every draft and publish points there, no
  media is copied; for a content base it is the version's folder). Under the books: **AI connections** and the MCP
  guide ([below](#ai-connections)).
- **Spreads** (`/editor/<book>/`): the spreads as cards with the sheet of each as its preview (from the book's layout
  at *assets at*; without a layout the cards are text), their entries, targets and AR count; **+ double page** adds a
  double page after the last one (before the back cover), a card's *Add a double page after* one right after that
  spread – a cover included, the back cover not. **A card's menu** (#196): the card itself carries no buttons – the
  sheet is the content; a **right click** (a mouse), a **long press** (a finger held still for half a second – the card's
  frame darkens and shrinks a little while it is held; moving more than a few pixels is a scroll and cancels it, a
  tap still opens the spread) or the **menu key / Shift+F10** on a focused card opens a small menu with *Open*, *Add a
  double page after* and *Remove*, each with its icon. It is a WAI-ARIA menu: the first item has the focus, ↑ ↓ wrap,
  Home / End, a first letter jumps, Enter or Space chooses, Esc, Tab, a click beside it or scrolling the page away close
  it, and the focus goes back to the card. A disabled item stays in the menu with its reason under its word. The
  long press and the keys are `editor/src/lib/context-menu.ts` (pure, tested) and `menu-trigger.ts`. A new double page is empty (*New spread*, id `spread-<n>`)
  and takes the two pages after the spread before it: **every later page is numbered on by two**, and the entries on
  those pages (their `page`) and their targets' printed page (`print.page`) move with them, so each entry stays on its
  spread. The book's layout does not move – a laid-out sheet is matched by its pages, so after an insertion every card
  from the new spread on shows the sheet of its new page numbers (the new one the sheet the next spread had) until a
  layout with the new pages is imported.
  A card's **Remove** takes out a spread **with everything on it** (#198), after the person saw what goes: the API's
  first step answers the impact (nothing is removed), and the card shows it under its caption
  (`RemovalConfirm.svelte`, words from `removal.ts`) – *Removes spread 4–5 with 3 entries, 3 targets, 2 entities.*,
  the later pages that move back, the shared entities kept because other targets use them, *Library files are kept*,
  and, when files are used only there, the option **Also delete the 2 files used only here** (off at first) with their
  names; the files used elsewhere are listed as kept. *Remove spread 4–5* sends the confirmation (with the option),
  *Keep* or Esc keeps it – no browser dialog. Should the book have changed meanwhile, the card shows the fresh impact to
  confirm again. A double page's later pages are numbered back by its pages, a cover moves nothing; the spread the book
  opens on (`initialSpreadId`) cannot go – the reason is shown under the disabled item. **+ cover** / **+ back
  cover** add the covers as spreads of the format `cover` / `back` (content schema 2.3: page 0, and the page after
  the last) when the book has none; **Publish** to the instance's own environment, named with its backend
  (`staging · CDN`, `local · this server` – [above](#publish-the-instances-own-environment)), through a step in the page,
  and next to it where the book is live (*live on staging, production* or *draft only*). A one-page spread's **format** (spread, cover, back) is chosen in the Inspector's *spread* section (the spread selected); on a double page
  the select is disabled (only a one-page spread can be a cover) – the reason is its help in the Info view.
- **Workspace** (`/editor/<book>/<spread>/`): the **tree** at the left, the stage, and one panel at the right on a
  desktop; on a phone the stage fills the screen and the panel is a sheet at the bottom whose head is the tab row
  (closed = the row only) with the tree as its first tab. The tabs (#229, `lib/panel-tabs.ts`): **Inspector** (what is
  selected), **Environment**, **Library**, **Code** – no Stage tab: the spread is the Inspector's, the preview settings
  are the toolbar's (below); a tab stored before (`stage`, `entity`) opens the Inspector, as does a first visit. The bar: × back to the spreads, ‹ › (also ← →) through the
  spreads, the tabs – as words, or as icons in a panel too narrow for them (under 24rem, 28rem with a finger), so the
  head stays one line (#172). On a phone the head is the five tab icons alone, sharing its width (#171): ‹ › sit at the
  stage's lower corners, and the top bar's book link is the way back to the spreads. On a stage too short for them below
  the toolbar (the sheet almost full) they move to its top right, beside the toolbar (#177) – which is one row and
  always leaves them that room, so every tool stays reachable at every sheet height without scrolling (#180).
  When the draft cannot be loaded (the API is down, the book is not there) the stage area says why with **Retry**
  instead of *Building the stage…*; an action that fails (a removal, a target image, the reload after a change) shows
  its error over the stage until dismissed (#208).
  - **The stage toolbar** (#180, `components/ToolGroup.svelte`, `lib/tool-groups.ts`) – three groups: **transform**
    (move / rotate / scale), **pick** (entities / nodes / targets) and **shading** (wire / solid / textured /
    rendered). Each group is one button showing its active option's icon (a small corner mark says it opens more); a
    tap opens its options in a menu attached to it – icon, name and shortcut, each with its name as tooltip and label –
    and a choice closes it. Where the toolbar has room the groups stay **expanded**, their options side by side:
    decided by the toolbar's own room (the stage's width, on a phone less ‹ ›), never by the device – from the first
    group on, each expands while the toolbar still fits one row. A 1280 px desktop shows all three expanded, a narrow
    stage (a tablet in portrait) collapses the last, a 360 px phone all three. The menu is a WAI-ARIA menu: ↑ ↓ (← →),
    Home / End, Enter or Space choose, Esc closes and returns the focus to the button, ↓ on the button opens it; a tap
    outside closes it and picks nothing on the stage. With a finger its items are the touch height (44 px). **W / E /
    R** still switch the gizmo; the Info view shows each button's tooltip.
    The fourth group, **grid & snap** (#190, `components/GridSnapMenu.svelte`), is always one button – the grid's icon,
    a dot in its corner while snapping is on – opening a small panel attached to it: *grid* (on / off and its step in
    mm), *vertical axis* (on / off), *snap* (on / off), *snap to* (grid, axes,
    objects, outlines – pressed pills, any combination) and the precision per gizmo mode: *move* (mm, the step while
    the grid is no snap target), *rotate* (degrees) and *scale*. All are preview settings, stored in this browser
    (`stage/preview.ts`). ↓ on the button opens it on its first
    control, ↑ ↓ / Home / End move between its buttons (a number field or a select keeps its own keys), Esc closes it and returns
    the focus to the button, Tab out of it or a tap outside closes it; every control has the touch height with a finger
    and its help in the Info view.
    The fifth group, **view** (#229, `components/ViewMenu.svelte` – the Stage tab's *stage* section until then), is one
    button the same way – the gear – with *shake*, *origin* (the 3 × 3 alignment square), *top* (plywood / linoleum) and
    *sky* (the HDRI; with the book's environment the row names its world and the HDRI waits for a book without one):
    how the editor shows the spread, stored in this browser, never in the content. Its tooltip names them all
    (`viewSummary`: *Eiermann · plywood · origin top left · no shake · sky Wooden Studio 17*); the stage menu's *View
    settings…* opens it. Both one-button groups are `components/ToolMenu.svelte` (the button, the panel, the keys), and
    the toolbar's room counts them (`TOOL_SHAPES`).
  - **Tree** – the spread in the style of Blender's outliner: a chevron column, a type icon before every name (book,
    entry, target, group / model / video / image / text / light), guide lines per depth, zebra rows, and the **eye** in a
    column at the right (shown = found; off = reported lost). Rows: the spread, its
    entries in page order, each entry's target ("in view" while the camera sees it) and the target's entity as its
    **node tree** – the root node (● while the stage shows it with other values than the draft's; the shared ref) and
    its children, as deep as the content nests them. **Every row selects** (#227) and a tap always shows it – the row
    highlighted, the Inspector showing it (#229); a tap anywhere on the row counts, its icon and its empty cells too
    (the chevron and the eye keep their own): the **spread** row selects the spread – the Inspector shows its sections
    (below) and the stage drops the target's outline and the node's gizmo; an **entry** row selects the entry itself – with
    or without a target – and the Inspector shows it (below), an entry with a target outlines that target's print on
    the stage as a target selection does; a **target** row selects the target, a **node** row the node, both in the
    Inspector; a tap on the stage selects the root. Every row's help in the Info view says what its tap does.
    **+ target** at the end of the tree opens the form for a new target on the spread:
    title, page, the printed image (*Library…* or *Upload…*), **what appears on the page** (none, model, video, image,
    text, group or light, with its file or line), the **entry category** (where the reader's consultation menu lists
    it – it follows what appears, a video makes a Videos entry, until set by hand; #165), and where it is printed
    (surface, x / y, width in mm) – the API makes entry and target, the stage shows it at once (and the reader tracks it after
    a publish: the engine makes the image-target data from the image at runtime). **A row's menu** (#212) – a **right
    click**, a **long press** (the row lightens while the finger is held), or the **menu key / Shift+F10** on the tree
    for its selected row – is the editor's one context menu (`ContextMenu.svelte`, the keys as on the book page's
    cards), each item with its icon: on a target row **Remove target** – the entry with its target, its entity and
    (only with the option) the Library files used only there go, after the same confirmation as a spread's, shown in
    the panel; on an entry row *Select the target* (with a printed target) and **Remove entry**, the same removal and
    confirmation – an entry without a target too; the spread row has no menu; on a node row *Move up / down*, *Into the node above*, *Out of its parent* and *Remove node* / *Remove
    entity*, each with its key at the right (not with a finger; a move that cannot be made is disabled with its reason). **Delete** (or
    Backspace) removes the selected node – its children with it, the root leaves the target without AR content; on an
    entry row it removes nothing silently but opens the entry's removal confirmation (#198); on the spread or a target
    row it does nothing.
    Removing is live on the stage;
    Save writes it, Back to the draft undoes it. Entries and nodes fold;
    the column collapses to its bar (‹ ›, kept on the device; until it is toggled there, it starts collapsed in a
    window under 64rem – a tablet in portrait gives the panel its 25rem and the stage the rest, #172). With a finger
    the rows are the touch control height, the chevrons and the eye as tall as the row (#171).
  - **Selection** (#162) – one selection for the tree, the stage and the Inspector
    (`editor/src/lib/selection.svelte.ts`, the rules in `selection.ts`, the tree's rows in `tree-rows.ts`): a
    **target** (a tap on its row, a pick of its printed image), its **entity** (the root node) or a **node**;
    selecting in one selects in the others. The tree's top rows select too (#227): the **spread** (no target, no node)
    and an **entry** (its own selection, its target outlined on the stage when it has one). **Nothing else selected is
    the spread** (#229, `settledSelection`): a workspace opens with it, another spread (‹ ›) starts with itself, and a
    click on the stage that picks nothing selects it – its row highlighted, the Inspector showing it. The tree highlights the
    selected row over its whole width (its own grey and a bar at its start), the rows above a selected node lighter,
    the hovered row lighter still; the stage outlines a selected target's print (an entry's target too) and puts the
    gizmo on a selected entity or node; the Inspector opens at that level (below). Keys in the tree: ↑ ↓ walk
    every row – the spread, the entries, the targets and the nodes –, ← → fold and unfold (← on a folded or childless
    row steps up a level: node → parent → entity → target → entry → spread), Enter opens the Inspector.
  - **The spread and an entry in the Inspector** (#227, #229) – the spread is shown like everything else that is
    selected (Tilman, 2026-10-31, on the tree's spread row and the Stage tab: *"These are the same. I'd like to remove
    Stage from the right side."*): the Inspector shows `SpreadView.svelte` – the Stage tab's sections, moved: *spread*
    (title, pages, format – the one control, saved to the draft –, the post-processing in effect – the whole book's
    passes or the spread's own, and which – and the book's environment, or none – the stage's HDRI – with *edit* to the
    Environment tab; open on a first visit), *post-processing* (below) and *vars and events* (below). A selected
    **entry** takes the Inspector's place with its form ([Texts](#texts-entries-the-book-and-the-onboarding)).
  - **Hierarchy** (#163) – a node row is **dragged** onto another row of the same entity (it becomes that node's last
    child; the row shows a frame) or between two rows (a sibling there, the order set; a line shows where) – a mouse
    drags the whole row, a finger the row's type icon. **Alt + ↑ ↓** move the selected node among its siblings,
    **Tab / Shift + Tab** indent it (into the node above) and outdent it (right after its parent). A node placed
    next to the root wraps the root in a new group, so both are siblings under the target. Only parent and order
    change: a moved node keeps its placement values, now relative to its new parent. Live on the stage, Save writes
    it (`editor/src/lib/tree.ts`). Every row shows the node's **name** (content schema 2.12, the Inspector's
    *name* row) and its type as the icon; without a name the type.
  - **Column edges** – the tree's right edge and the panel's left edge are dragged to resize the columns (#144; the
    panel 16rem to 70% of the window – 25rem by default, so its tab row fits one line (#170) –, the tree 10rem to 40%, the stage keeps at least 16rem, so a 768 px tablet in
    portrait still shows a stage with the tree open – the panel's rows of position, rotation and scale then put their
    label above the X / Y / Z fields (`@container panel`, #172); a focused edge also moves with ← →; with a finger (`pointer: coarse`) the edge's hit
    area is wider). The stage's view follows live. The widths are kept on the device (`editor/src/lib/widths.svelte.ts`);
    the Code tab has its own, wider width; a double-click on an edge restores the default.
  - **Sheet height (phone)** – the panel is a sheet at the bottom; its head (a grip and the tab row) is dragged up or
    down to any height, from the tab row alone to 85% of the screen, and snaps when let go to closed, a third, half or
    almost full (a flick carries it on); a movement under 8 px is a tap, so a tab still opens or closes it (#155). The
    height is kept next to the widths (`sheet`, a share of the screen); a double tap on the grip restores half. The
    grip is a separator (↑ ↓ when focused). Only the head takes the drag – the panel's content still scrolls.
  - **Info** – at the bottom of the tree column (on the book page at the bottom left), after Ableton's Info View: the
    name and description of the control under the pointer or in focus; collapsible, the state kept on the device. The
    panels carry no explanatory text of their own – it is the controls' help (`editor/src/lib/help.svelte.ts`): an
    element with `data-help="…"` (named by `data-help-name`, else its `aria-label` or its row's label), or its `title`;
    the innermost one wins. New explanations go there, never as a hint line in a panel. On a phone (no tree column, no
    pointer) there is no Info view.
  - **The spread's sections** (the Inspector with the spread selected; the Stage panel's until #229) – collapsible
    sections, each with a header, the open state kept per section on the device
    (`editor/src/lib/sections.svelte.ts`, `components/Section.svelte`): *spread* (title, pages, the format, the
    post-processing in effect and the environment – open on a first visit), *post-processing* and *vars and events*
    (closed on a first visit, #193); a closed header carries a short summary where it helps – *spread · The door ·
    spread*, *post-processing · the whole book* –, so closed hides nothing that matters. The preview settings the Stage
    panel's *stage* section held (shake, origin, desk, sky) are the toolbar's *view* group (#229), the grid its *grid &
    snap*. The first section of any panel draws no divider under the tab row (`.section:first-child` in `app.css`).
    Every row is the panel's label / control grid (`.row` in `app.css`).
  - **Environment panel** – two collapsible sections: *environment* (world, sky, onion sky – open on a first visit) and
    *preview* (look up – closed, its header naming the angle).
  - **The gizmo** – on the stage, three.js `TransformControls` on the selected node (the tree's or the stage's
    selection): **move / rotate / scale** by the toolbar at the top left or **W / E / R**, handles in the node's own
    space, so a drag changes the node's placement **relative to its parent** – the Inspector's rows follow live,
    Save writes them. It snaps as the toolbar's *grid & snap* says (above, "Snapping"); **Shift** or **Ctrl** held
    turns snapping around for the drag. A click that ends a drag selects nothing. The
    tracker lets the gizmo's gestures through (`MockTracker.ignorePointer`); the engine opens the running scene to
    such tools with `IArScene.inspect()` (scene, camera, canvas, frame hook, a node's object by its path, the tap's
    hit test) – the reader never calls it.
  - **Post-processing** – the spread's *post-processing* section in the Inspector (content schema 2.5, [content guide](content.md)
    "Post-processing"). **The book's passes are the master**: edited once, every spread without a list of its own
    shows them. The section's header names the level in words (#181): **post-processing · the whole book** while the
    spread on the stage uses the book's list (the default; editing it changes it for every such spread), **post-processing
    · only this spread** while it has its own – an override for this spread alone, starting as a copy of the book's
    (removing every pass turns post-processing off there: *· off*; a book without passes reads *· none*). The line under
    the header says what editing changes – *changes all N spreads that use the book's* (N counted from the draft's
    spreads without a list of their own, this one as the panel holds it) with **own for this spread**, or *overrides
    the book's for this spread* with **back to the book's**, which drops the override. **Each pass is a collapsible
    section of its own** (#233): closed, its head names the type and the values set away from the default (*bloom ·
    strength 0.35*, at most two – else its first parameter); its head's **on / off** toggle switches the pass without
    opening it (off writes `enabled: false`: the pass keeps its place and values, the stage and the reader skip it, the
    phone budget does not count it; a list whose passes are all off reads *· all off*), next to the arrows and *remove*.
    A pass added opens; open, it has a row per parameter from the pass's spec. **add pass** offers **+ bloom / + vignette / + grade** and, in a row per plugin under
    its id, **the passes of the book's plugins** (content schema 2.21, #216 – a compiled plugin's from its recorded spec
    as soon as the book is open, a plugin **Run** in the Code tab at once, no reload). A plugin's pass shows its type
    with its plugin's id next to the arrows (*filmGrain* … *grain*) and its spec's rows – labels, help, ranges, on / off, a `texture`
    row with the Library's pictures and the plugins' procedural textures (`TextureField.svelte`, shared with the
    Inspector's rows). The arrows move a pass earlier or later in the chain, *remove* drops one, changes show live on the
    stage; a list beyond the phone budget (three passes, one bloom – #86) says so under the passes
    (`editor/src/lib/plugin-passes.ts`). **Save** says what it saves – *Save for the whole book*, *Save for this spread* or *Save for the
    book and this spread* – and writes what changed: the book's list
    (`PUT /editor/books/{id}/passes`, an empty one removes it) and / or the spread's (`PUT …/spreads/{id} { passes }`,
    `null` = back to the book's) –, *Back to the draft* undoes both (`editor/src/lib/passes-edit.ts`). The stage shows
    the passes under **rendered** only (like the HDRI's sky): the mock stage's table, book, printed images and sky lie
    on the engine's **backdrop layer** and stand in for the camera picture: bloom and vignette run over them as they
    run over the camera picture in the reader; the grade's **reach** row (*AR layer / whole picture*) keeps it on the
    AR layer (it gets the layer's coverage as a mask) or grades the desk too, as the reader grades the camera picture.
    The **environment** (the look-around world and its sky – the stage's sky once the book has one, and while the
    Environment tab is open) goes through the same passes, as it does in the reader.
  - **Selection and shading** – the selected node wears Blender's orange **outline** (the edges of its meshes, drawn
    through everything, in the object's own space – a video plane outlines as a plane), a selected target the same
    orange around its printed image (it follows the image as loaded and a move), and what a click would pick a light
    grey one (below). The toolbar's last group is the viewport's **shading**, after Blender's, as its four spheres side by
    side (or in the group's menu where the toolbar is short of room, #180): *wire* (the entities as lines), *solid* (one grey under the scene's lights), *textured* (the content's
    materials, no sky) and *rendered* (the HDRI's sky and light, the default – or the book's environment as the sky,
    its tooltip then says so); stored on the device. The toolbar is
    icons only (its menus add the names), every button's label is its tooltip. The stage and the gizmo keep their own look.
    **Light nodes** (content schema 2.6) have no mesh: the stage draws a **helper** for each, after Blender's – a
    small bulb at the node's origin and lines for what the light does (short rays for a point light, the cone of a
    spot, parallel rays for a directional light), in the node's own space so the gizmo moves and turns it (−z is where
    a spot or the sun points); dark grey, orange while selected, drawn through everything, never in the reader
    (`editor/src/lib/stage/light-helper.ts`). A click on the bulb picks the light. The HDRI dims only the scene's own
    lights; a light node keeps the author's intensity in every shading.
  - **Picking** – a click on the stage selects what lies under the pointer by the **pick mode** next to the gizmo's
    tools (Blender's select mode, #192), strictly: *entity* (a parcel – only an entity, its root), *node* (a point on
    the graph – only the node under the pointer, as deep as the tree goes) or *target* (the crosshair – only a printed
    image, through an entity standing on it). A click where nothing of the mode's kind lies **selects the spread** (#229) –
    the tree, the stage and the Inspector alike: no outline, no gizmo, the spread's sections in the Inspector; a
    workspace opens so too (no target stands in any more). Particles and lines count only where they are drawn (8 px around the pointer),
    the editor's own outlines and a light's rays never; a light is picked by its bulb. The pure filter is
    `editor/src/lib/stage/pick.ts`. **Hover** (a mouse on a device that hovers): what a click would pick wears a
    light grey outline (a particle cloud its bounds) and the pointer cursor; with a finger there is no hover – a
    tap selects at once and shows the orange outline. A **right click** on the stage opens the menu for what lies
    there – the mode's pick, else the printed image under the pointer: on a target *Add node… / Add AR content…*,
    *Remove node / entity*, *Placement on the page…*, *Library…*, *Remove target*; on the page or the table
    *+ target…*, *Replay the first find* and *View settings…* – it opens the toolbar's *view* group (the editor's one context menu, `ContextMenu.svelte` – the keys as on the book
    page's cards; while it is open no key reaches the stage's shortcuts). While a target's placement is edited (the Inspector's rows) **the target
    itself lies at the edited place** – its printed image, its outline and its AR content move together, so it never
    shows twice (#191) – with **handles**: drag the image to move it (across the spine it changes the page), drag the
    small square at its bottom right corner to set the printed width – the fields follow, Save placement writes them;
    hiding the placement unsaved puts the target back. The new-target form shows a translucent **ghost** of the
    image with the same handles. The placement opens at the place the stage shows (its own, the book's layout's, or
    the stage's fallback). The print is as wide as its place says and as high as its image's aspect makes it; the
    stage anchors the AR content at the image's centre, as the reader's tracker does – the placement math is
    `editor/src/lib/stage/placement.ts`.
  - **Library** – the book's uploaded files and the files of the import ([server](server.md) "Assets"): a grid of
    cards (a preview with an animated skeleton until it has loaded – images, a video's first frame that plays muted
    while hovered or after a click on ▷ –, the type's icon else; where the file belongs – the import names every file
    `image.jpg`, `target.jpg`, `video.mp4` in a folder per entry, so a card reads `p015-1 · target` –, kind, size,
    dimensions, a video's duration, the number of uses) or a plain **list** (name, place, kind, size, uses; a click on a row opens its
    actions) – the **view** is remembered per browser; filter by kind (**target image** – a target's image in the
    draft, or the import's `target.*` – apart from the other images, video, model, audio), search by name and place
    (`p015 target`), **Upload** (the button, or files dropped on the panel); per file **Use** (the selected node takes
    it, when its type fits), **Target image** (an image becomes the selected target's printed image), **Replace…** (a
    new version, every use relinked, the stage rebuilt) and **Delete** (refused while used – *Delete anyway* forces
    it). Nodes name a file by its absolute URL, so draft and every publish point at the same file.
    **Code files** (#186): the book's **scripts** and **shaders** in a list of their own under the media (the filter
    **code** shows it alone; `CodeFiles.svelte`, `library-code.ts`) – name, kind (*script* / *shader*), size, uses. A
    script **is** a plugin source of the Code tab (the same rows, no second copy – its uses are the draft's rows that name
    a type it registers; one with unsaved edits in the Code tab reads *name.ts\**, as the Code tab marks it – #232); a
    shader is an asset of the kind `shader` (`.glsl`, `.frag`, `.vert`, `.wgsl` – its uses are the
    plugin sources that name its URL). **Upload** and drop take both: a `.ts` / `.js` becomes a plugin source named
    after the file (`Wobble Effect.ts` → `wobble-effect`; a taken id is refused – *Replace…* that plugin instead), a
    shader file a shader asset; a code file is at most 256 KB, and the API checks extension, content type and text. A
    click on a row opens it: where it is used, a **read-only preview** (Monaco, loaded with the first preview – GLSL
    highlighted as C, WGSL as itself) and its actions – **Open in Code** (a script: the Code tab opens with it),
    **Copy URL** (a shader: what a plugin loads with `api.loadText(url)`), **Download**, **Replace…** (a file of the
    same kind: a script's new source; a shader's new version at a new URL, the plugin sources that name it relinked) and
    **Delete** (refused while used – *Delete anyway* forces it). How a plugin loads a shader: [plugins](plugins.md)
    "A shader file".
    **The Library as the picker** (#164): every file field – a target's printed image, a node's file, a new node's
    file, the new target's files, the environment's world and sky – shows the file (a picture as a preview, every file
    by its place) with **Library…** and **Upload…**. *Library…* opens the Library in place of the panel as a picker
    (`LibraryPanel` with `pick`, `editor/src/lib/library-pick.ts`): the filter starts at the kind being picked, a
    click on a fitting card picks it for that one field and returns, an upload that fits is picked at once, *cancel* or
    Esc returns without one; the panel underneath keeps its values. Selecting another target or node closes it.
  - **Environment** – the book's world around the reader and its sky (content schema 2.8 / 2.10,
    [content guide](content.md) "Environment", [look-around](look-around.md)). While the tab is open the stage shows the
    **engine's own look-around pass** with the values being edited – the world anchored to the book, the window around
    it and the clear floor – under the desk and the book (the studio's HDRI steps aside, sky and light), turned by
    the view as a phone's gyroscope would turn it (`MockTracker.worldOrientation`, `ArScene.previewEnvironment` – an
    editor-only method, not part of `IArScene`). **look up** raises the camera from the book towards the horizon and the
    sky (the targets stay found, as the reader's world stays for 45 s). Rows: **world** – the built-in *café*, or a glTF
    model; **sky** – *the world's*, or an equirectangular image; each with *Library…* (the Library as the picker, see above),
    *Upload* (into the Library and taken at once) and *remove* (back to the built-in part); **onion sky** on / off (it
    needs a camera picture, so only the reader shows it). Changes show at once; **Save** writes the environment to the
    draft (`PUT /editor/books/{id}/environment`), *Back to the draft* undoes, *Use the default* removes it. The book page
    shows the environment as one line with *Edit on the stage* (the first spread, `?tab=environment`).
    **The environment replaces the HDRI sky box** (#185, Tilman: *"Environment replaces the HDRI sky box."*): once the
    book has an environment – the draft's, or edits that start one – the stage shows its world as the sky in every tab
    while the shading is rendered (the same pass, *look up* stays the tab's), so the author sees the world the reader
    will see, not a studio behind it. The HDRI then no longer lights: the reader lights the AR content with the
    engine's own ambient and sun (and the content's light nodes) – its world is a pass under the scene and lights
    nothing –, so the stage does too. Where the reader shows its camera picture – the window around the book, the open
    roof – the world's pass leaves the frame transparent; the stage fills it with the HDRI, drawn behind the world
    (destination-alpha blending, `behindWorld` in `mock-stage.ts`) as a background only – the camera picture's stand-in,
    like the desk. A book without one keeps the HDRI as sky and light. The decision is one pure function,
    `editor/src/lib/stage/sky.ts` (`bookEnvironment`, `showsWorld`, `stageLook` – which sky, which light); the toolbar's
    *view* group's *sky* row then names the environment's (*the environment's (world café)*), the HDRI picker stays
    below it for books without one, and the group's tooltip ends *· the environment's sky*.
  - **View** (the toolbar's *view* group, #229 – the Stage panel's *stage* section until then) – how the editor shows
    the spread: **shake**: 0 = still, 1 = a hand holding a phone. **origin**: above. **top**: the Eiermann desk's
    top, *plywood* (the default) or *linoleum* (#226; a desk stored before, `desk: "eiermann"` or `"schoepfer"`,
    becomes *plywood* or *linoleum*). **sky**: one of six Poly Haven studios (the HDRI – sky and light while the shading is
    rendered); with the book's environment the row names it and the HDRI waits below for a book without one. All stored
    on the device; the button's tooltip names them: *Eiermann · linoleum · origin top left · no shake · sky Wooden
    Studio 17*. The camera is moved on the stage itself: **drag** orbits, **Shift + drag**,
    the **middle button** or **two fingers** pan (the looked-at point moves in the page plane), **wheel / pinch**
    change the distance, **double tap** returns to the reader's view (35 cm above the page, tilted 30°; the free orbit
    is kept on the device). Found / lost per target is the tree's eye (off reports it lost → outro, on found again →
    reveal); **Replay the first find** is in the stage's right-click menu. (The panel's view presets and found chips
    doubled these and are gone – Tilman, 2026-10-29.)
  - **Vars and events** – the spread's last section in the Inspector (the spread selected): the narrative of a book like the demo
    ([plugins](plugins.md) "Across nodes and pages"), driven from the tree's eyes and from here (#88):
    - **tap** – a button per printed target of the spread (its entry's title): the reader's tap without aiming at the
      entity – the entity's `onTap` (a plugin component's, the `animation` component's `playOn: tap`, a `behaviour`'s tap rules) and the event
      `targetTapped`, through the engine's own tap path (`SceneInspection.tap`). Only a found target with AR content
      takes a tap; the others are greyed out.
    - **vars** – the plugins' variables, a row each: the name, its scope and type (`book · boolean`), and the value as
      the type's control – *false / true*, a ScrubNumber (committed when you let go or press Enter), a text field – and
      × to delete it. **set** below sets one by hand: a name, the scope (spread, stage, session, book – the plugin API's
      four), the type and the value. Both write through the plugin API (`api.vars.set` with the panel as the plugin),
      so the plugins hear `varChanged` as from a plugin and a branch can be tested without playing up to it; the API's
      refusal (a name that is not camelCase) shows next to *reset*. **reset** starts a new game (every variable
      cleared, nothing unlocked, the timeline emptied, the spread found anew).
    - **events** – the timeline, newest first: the time since the spread opened (`4.25 s`, `1:05.3`; a *reset* starts
      it again), the event (found, lost, unlocked, tapped, spreadChanged, varChanged, sceneState once per change, the
      plugins' own) and its payload; the last 100 are kept. A **behaviour** line is a rule of a `behaviour` component
      that ran (#88): the target, the node's name, the rule's number, its event and what it did (`play rattle · set
      hasKey = true (book) · emit keyRattled`) – the log's own line, not an event of the stage (plugins never hear it);
      the events its actions caused follow above it. **clear** empties it.
  - **Inspector** (the *Entity* tab until #229, `panels/EntityPanel.svelte`) – opens at the selected level (#162; a selected entry or the spread: above, #227, #229): its head is the **breadcrumb** *target › entity › group › node*
    (a crumb selects that level, ▾ after the target picks another target of the spread). A selected target shows the
    **target**: its printed image (thumbnail and name; **Replace image…** uploads another)
    and, behind *placement*, where it is printed – surface, x / y and width in mm (`print`, content schema 2.1;
    **Save placement** writes it; until then a target made in the editor lies where its form put it, an imported one
    where the book's layout says), and its AR content as a link one level down. A selected entity or node shows
    that **node**: its **name** (empty = the tree shows the type), its **file** (the file field: **Library…** – the Library as the picker, with the filter set – or **Upload…**),
    **+ node** (type – group, model, video, image, text or light, and under *plugins* the node types the book's plugins
    registered once they are loaded or Run – and for model / video / image, or a plugin type with a `src`, a file chosen in
    the Library as the picker – the root of a target without AR content, else placed by **add as**: *next to it* (the same parent,
    right after the selected node – the default for a model, video or image) or *inside it* (its last child); a video
    whose size the Library knows starts scaled so a portrait file stays within one target width – the plane itself
    always takes the file's proportions),
    **make it code** (#188 – Unreal's *Create Blueprint from component*: a Code tab plugin whose `registerNodeType`
    reproduces the node, its type's builder as the starting point and its values as parameters, saved, run, and the node
    switched to it – [plugins](plugins.md) "An aquarium, step by step"), **remove node** / **remove entity**; then every placement value (relative to the parent node), a text node's
    text and colour, a light node's **light** rows (kind as a segmented group, colour, intensity, distance and decay
    for a point or spot, cone angle and soft edge for a spot), a plugin node type's parameters (*node type · sparkle*, from its
    spec), for a node with meshes its **material** (#188: *its own*, or a material the book's plugins register – then
    *material · water* with its rows and *remove*; **make code** beside it turns the node's own look into a
    `registerMaterial` in the Code tab), a `texture` parameter as a list of *none*, the plugins' procedural textures and
    the Library's pictures and videos, and every filter parameter of the node as rows of one control height – each labelled in words (#173): its
    spec's `label` (*plays on*, *key color*), else its name split into words (`degreesPerSecond` → *degrees per second*);
    the Info view names it with the content's name too (*speed · degreesPerSecond*): position, rotation and scale with X, Y, Z side
    by side as in Blender (the chain icon at the end of the scale row links the axes: pressed = one `scale` field, as
    Blender's lock), choices as a segmented group, colours as a
    swatch + hex whose swatch opens the editor's **colour popover** (after Scutoons': a palette of the usual keys and
    the book's gold, this browser's recent colours, a saturation / brightness area with a hue slider, the hex, and
    the eyedropper that **picks from the stage** – the colour under the pointer in a chip, a tap takes it, Esc
    cancels; the sampled pixel is the rendered one, lit and tone-mapped), a reset arrow while a value differs from the type's default, ● on rows that differ from the draft.
    Changes show live on the stage; **Save** writes the entity to the API – the shared entity when the target refers
    to one (the head says `shared: <ref> (n×)`), else the target's own – and the stage rebuilds from the draft;
    **Back to the draft** drops them. Save writes the **whole tree**. **Components** (schema 2.2) follow:
    each with its rows and *remove*, **+ animation** on a model; the animation component shows the model's
    **timeline** – its clips, play / pause, the time in the clip as a slider – and drives the same clip the reader
    plays (`playOn` found / tap / never, `stopOn`, loop, speed). **+ behaviour** (any node, #88 – [content](content.md)
    "Behaviour") adds the rule editor instead of rows: per rule its event as pressed pills (*found*, *lost*, *tap*,
    *unlocked*, or *event* with a name field offering the book's scene events and the core events), **+ condition**
    (a row per test: the variable – the book's variables offered: its behaviours' and the ones live on the stage –,
    *=* or *≠*, the value typed as `true`, `false`, a number or a text, empty = not set; *and* / *or* between them,
    *all* / *any* from two on) and **+ action…** (a row per action, in order: the verb and what it takes – *play* a clip
    of the node's model, the clips read from the model on the stage, and the node by name; *pause*, *stop*, *show*,
    *hide* a node, *this node* or one of its subtree by name; *set* a variable, its value and scope; *emit* an event),
    × removes a rule, a test or an action. Every change runs on the stage at once (the engine takes new rules in
    place); what is not complete yet (an empty name, an event not chosen) is listed under the rows in red and keeps
    **Save** off. Save writes the rules in the content's shortest form. Rows come from the content contract's definitions
    (`PLACEMENT_PARAMS`, `FILTERS`, `componentSpec`, `LIGHT_PARAMS`): a new filter, component, light parameter or
    parameter needs no panel code (one snippet draws a parameter of any kind) – a component or material layer a
    **plugin** registers shows the same way, with **+ type** after a Run in the Code tab.
  - **Code** – the book's own code ([the decision](../agents/research/2026-10-29-code-in-the-editor.md)): the
    plugins stored for the book and the ones the content declares (compiled by the content build – opening one reads
    its `index.ts` next to the compiled module; Save keeps a copy) – the picker names each by its name alone, the one
    with unsaved edits with an asterisk (*aquarium\**, #232: unchanged needs no mark, and whether readers have the
    stored sources is the top bar's *draft only* / *live on …*); the open source is kept while another tab shows
    (`plugins.code`), so a tab switch loses no edit –, one open in **Monaco** (loaded with the tab only – the
    reader and the other tabs carry nothing of it): TypeScript with the content build's compiler options against
    `plugin-api.d.ts` (the module `osct-plugin-api`) and three's own types, so completion, hover documentation and type
    errors inline are the build's; Tab indents, Ctrl+Enter runs, Ctrl+S saves; the colours follow the editor's day /
    night tokens. **Download** gives the plugin's folder as a zip (`index.ts`, `plugin-api.d.ts`, a `tsconfig.json`). **Run** transpiles the TypeScript in the browser
    (sucrase, types erased – no type check, that is the build's half); the stage frame imports the module and installs
    it in the stage's registry under the plugin's id (a second Run replaces the first) – the code runs there, never in
    the editor's page (#234, "The stage frame" above) –, then builds the spread again: a
    material layer tints the video at once, a component shows under *add component* in the Inspector. Errors
    show under the editor and as a marker on their line (a transpile error, a plugin that imports a module – plugins import
    nothing, three.js is `api.three` – an invalid spec, an exception in `register`); the previous registration stays.
    The **log** under the editor has the plugins' lines from the stage, newest last: their `api.log` and their errors
    there (a build that failed, an error nothing caught); every Run starts it anew.
    **Save** stores the source (`/api/editor/books/{id}/plugins/{pid}`, a change recorded), **Delete** removes it –
    refused while the draft uses a type it registers (*used by entity castle – Delete anyway*). The Library lists the
    stored sources as its scripts and opens one here (**Open in Code**); a script file uploaded there is a source here.
    **Nothing run here reaches readers**: a plugin gets there through the content build – today as a folder
    `plugins/<id>/index.ts` of the content source and the import, soon compiled by the publish itself on the server
    (#78, Tilman 2026-10-29) – and a publish whose nodes use a component no compiled plugin can provide is refused
    (409 `unknown-components`). The plugin API (`api.three`, the `register…` calls, the component
    context) and the guide for authors are [plugins](plugins.md).
- Settings (view, orbit, sky, desk, shake, the open tab, the tree open or collapsed) are stored per device. The
  session is not: it is the API's HttpOnly cookie ([who may use it](#who-may-use-it)).
- **A new version under an open tab** (#230): a deploy replaces the editor's code, but an open tab keeps running the old
  one until it reloads. The editor asks for `/editor/_app/version.json` every 5 minutes (SvelteKit's
  `version.pollInterval`, `editor/vite.config.ts`) and whenever the tab gets the focus or becomes visible; when the
  deployed version differs, a quiet bar says *A new version of the editor is ready* with **Reload** – at the foot of the
  window (it covers no tool), under the top bar on a phone, its buttons at the touch height. It **never reloads by
  itself**. With unsaved edits – a panel with *Back to the draft* and Save (the Inspector's entity, the post-processing,
  the environment) or the Code tab's source – it says *reloading now drops your unsaved edits* and offers **Reload after
  saving** (the page reloads as soon as nothing is left unsaved: saved, or taken back to the draft) and **Reload now**.
  The cross (*Later*) hides it; the next reload loads the new version anyway. A code file that fails to load – a lazy
  chunk such as Monaco after a deploy renamed it, or one a deploy still uploading has not delivered yet (#160) – shows the
  same bar, and the panel says what it could not load (until #230 the editor reloaded once on its own). The decision is
  `editor/src/lib/new-version.ts` (tested), the unsaved edits are collected by `unsaved.ts` (each panel registers its
  dirty state), the failed loads by `stale-chunks.ts`, the bar is `NewVersionBar.svelte` in the layout. Locally the dev
  server never reports a new version (`updated` is off in dev); `vite preview` of a build does.

### UI rules

The editor follows the Scutoons UI dogma (`scutoons/agents/DESIGN.md`) in its own CSS (`editor/src/app.css`), not
the reader's design tokens: a design tool's default palette – day (white, light greys, near-black text) and night
(dark greys, white text), following the system, forced with `data-scheme` on `<html>` – and **no colour** but the
danger red; one control height (`--control-height`, 1.75rem with a mouse, 2.75rem – the dogma's 44 px – with a finger,
`pointer: coarse`, #171; the top bar grows with it), square corners (`--control-radius: 0`), compact system
type, muted text at least 4.5:1 against its background, one focus ring for every control (2px in the text colour – a
field marks its focus by its border); rows with a label
column, labelled in words (a spec's `label`, else the name split into words – #173); numbers as `ScrubNumber` (the whole field is the gesture: press and slide – **up or right raises, down or left
lowers** the value, the two directions add up (the quadrant rule, Tilman 2026-10-29; Scutoons' fields should follow) –
Shift ×10, Alt ×0.1, tap to type – a comma or a dot as the decimal point (`1,5` is 1.5), no exponent (`1e3` is
refused) and no thousands separators; a behaviour rule's value is read the same way (`parseNumber` in `values.ts`) –,
↑ ↓, Enter, Escape, the reset arrow inside the field – no native sliders, no native colour picker: the colour popover
in the top layer); small enums as segmented pressed pills;
on / off per item as a pressed chip; a **disabled** control looks it at a glance – dimmed, a not-allowed cursor, a
select without its arrow (`app.css`) – and says why in its help, never in a hint beside it; hover styles only under
`@media (hover: hover)`, so a finger's tap leaves no hover grey that looks pressed (#178; pressed and focus states
stay unconditional, a test checks every stylesheet); Feather icons only where a word makes no sense (step, replay, photo, close, the
chain that links the scale axes) – and in the tree, where type icons and the eye are every outliner's convention
(Blender, Unity, Figma); each with a name and a tooltip; the sheet closes to its head row. Brand UI (gold, serif) stays in the reader – the stage
itself renders the reader's content unchanged. Texts are English (RULES #20).

## Texts: entries, the book and the onboarding

The reading side of the book (#223): the API's routes are `docs/server.md` "Texts", what a body means is
`docs/content.md` "The text: Markdown and variables".

- **An entry's form** (`EntryForm.svelte`, the logic in `entry-edit.ts`) – in the Inspector's place when the tree
  selects an entry, in the order the view had: title, category (segmented), access page (`ScrubNumber`; a page on another
  spread moves the entry there on Save – the form stays, its head names the spread), author, tags (one line, commas), the
  **text** in a textarea with its **live preview**, the picture (a `FileField`: *Library…* opens the Library as its picker
  in the Inspector's place – the form stays mounted underneath, its edits kept –, *Upload…* uploads; *remove the
  picture*), a link's URL (*open* only over http(s)) and the target with *select the target*. The fields come from
  `GET …/entries` as the content holds them (`entries.svelte.ts` – an imported picture's path unresolved, shown below the
  book's assets base); Save sends only the fields that changed (`PUT …/entries/{id}`, an emptied author, picture or link
  removes it), reloads the draft and refreshes the stage (its `{{entry.title}}` text nodes). *Back to the draft* drops
  the edits; the form registers its dirty state with `unsaved.ts`. What keeps Save off is listed under the form (the
  API's checks before it is asked).
- **The preview** is the reader's renderer (`shared/text/entry-text.ts` `renderEntryText`) – the same Markdown, the same
  escaping. On the stage the variables have their current values: the page's mirror of the stage frame's `vars` (#234 –
  data from the frame, never code), read innermost scope first like `api.vars.get`. Under the preview the variables the
  text reads are listed with their value and scope (or *not set*), and every construct that does not parse is named
  (`exprMessage`). On the Entries page there is no stage: every variable is unset, so the fallbacks show.
- **The Entries page** (`/editor/<book>/?view=entries`, `EntriesPage.svelte`) – the book page's views are *spreads*,
  *entries* and *onboarding* (segmented, in the URL). Every entry in one list: the category filter with counts, a search
  (title, text, author, tags, id – accents and case folded), the glossary grouped by first letter as the reader groups
  it (other filters in the order of the pages); an entry opens its form beside the list (on a phone instead of it, *‹ all
  entries* back). **+ entry** makes one without a target (title, category, access page – `POST …/entries` without
  `target`), then opens it.
- **The book's texts** (`BookTexts.svelte`) – a collapsible section *book* above the views (closed it names title ·
  author · publisher): title, author, publisher; Save → `PUT /editor/books/{id}`.
- **The onboarding** (`/editor/<book>/?view=onboarding`, `OnboardingSteps.svelte`, the logic in `book-texts.ts`) – the
  steps as collapsible sections (agents/DESIGN.md §9; closed: the first words and what moves the step on – its button and
  action, or its time), ↑ ↓ and *remove* in the head, **+ step**; open: id, title, text, footer, illustration (a path of
  the app, the two built-in drawings offered), button, action (next / camera / scan – it goes with a button) and the
  timing (*default* = the app's, *set* gives a value). The whole list is saved at once (`PUT …/tutorial`).
- Every text field is one value today; a language variant (#224) becomes a draft of the same shape per language, so a
  language switch can be added to these forms without reshaping them.

## AI connections

Connecting an AI agent is a first step of working here, so it sits on the books page under the covers (#142, #194,
`lib/AiConnections.svelte`, `lib/mcp-setup.ts`), two columns where the shelf has room, one under the other on a phone:

- **AI connections** – a name and **Create token**; the field suggests the agent and the machine after the client picked
  in the guide ("Codex on my laptop") – the name stands in the change log of every save. The token `osct_…` shows once in a framed
  box with **Copy** and the warning that it is not shown again; **Done** closes it (it is never stored in the browser).
  The list: each token's name and prefix, *last used* (never, 5 min ago, yesterday …) and *expires* (red in its last
  14 days and once expired), **Renew** (182 days from today – the same token works on) and **Revoke** (asks first; it
  stops at once). Every call is the person's own session – the API refuses them to a token ([server, "AI
  connections"](server.md#ai-connections)).
- **Connect an AI agent** – the MCP guide: what the server does (an AI agent – Claude, Codex, OpenCode, Cursor or any
  other MCP client – works in this editor as you, saves drafts, never publishes), then **Any MCP client (stdio)**: a
  field for *the path to `mcp/bin/osct-mcp.mjs` in your osct checkout* (typed once, kept in this browser under
  `osct-editor-mcp-file`; a folder gets the file appended, quotes of a copied path go) and four rows with **Copy** – the
  **name** `osct-<env>` after the environment `GET /health` names (`osct-staging` on staging; `osct-…` until it answers), the **command**
  `node <file>`, **OSCT_API_URL** (the editor's `/api` as an absolute URL) and **OSCT_EDITOR_TOKEN**. Under it the same
  as each client's snippet, segmented pills **Claude Code** (`claude mcp add …`) / **Claude Desktop**
  (`claude_desktop_config.json`) / **Codex CLI** (`~/.codex/config.toml`) / **OpenCode** (`opencode.json`) / **Cursor**
  (`.cursor/mcp.json`) with **Copy** – a token just made is filled in, else `osct_…`; no path typed, `/path/to/osct/…` –
  and the first steps: a checkout with `npm ci` in `mcp/`, where the snippet goes, then `whoami` and
  `describe_content_model` ([mcp, "Connecting an agent"](mcp.md#connecting-an-agent)).

## Where the code lives

| Piece | Where | Notes |
|---|---|---|
| The engine | `engine/src/` | `content/` (loader, accessors, `contentUrl`), `scene/` (`ArScene`, entities, trackers), `types/`, `utils/`; compiled by the app that imports it (`@engine/*`) |
| The reader's scene | `client/src/components/ar-bridges/ar/index.ts` | `createReaderScene()`: the engine with the 8th Wall tracker (`engine/src/scene/xr8-tracker.ts`), where its files are served, the dev flag and the reader's graphics options ([tracking](tracking.md) "What the app gives the engine") |
| The editor's stage | `editor/src/lib/stage/` | `stage.svelte.ts` (the page's side of the stage frame, #234), `frame-host.svelte.ts` and `frame-protocol.ts` (the frame's side and the messages, the frame's policy), `plugin-run.ts` (Run's half in the frame), `stage-core.svelte.ts` (the stage in the frame: the simulation, owns the gizmo; gives the engine the dev flag and the device storage like the reader), `gizmo.ts` (TransformControls, hover), `mock-tracker.ts`, `mock-stage.ts` (+ `plywood.ts`, `linoleum.ts`, `oak.ts`, the desk tops' drawn looks), `preview.ts` (view, orbit, pan, sky, the desk's top, shake, origin, grid and snap, hidden targets; `viewSummary`), `stage-layout.ts`, `progress.ts` (the simulated progress), `event-log.ts` and `narrative.ts` (the spread's timeline, variables and tap buttons in the Inspector) |
| The demo's key model | `editor/tools/key-model.mjs` | the demo book's animated key (`fixtures/demo/entries/key/key.glb`, 7 KB, one clip `rattle`) written as glTF binary by a Node script – no Blender; `node editor/tools/key-model.mjs` regenerates it, a test checks the committed file is the script's |
| Draft and session | `editor/src/lib/content.svelte.ts`, `session.svelte.ts`, `api.ts` | the draft through the engine's loader (`baseUrl` = the draft endpoint, `assetsBase` = the import's), the token for its requests |
| The API layer | `editor/src/lib/api.ts`, `storage.ts`; `shared/api/` | every call through one `request` (the session cookie and the CSRF token on writes – #207, a 401 that ends the session, the API's errors as `ApiError` with their details); the answers typed once with the MCP server (`shared/api/editor.ts`); `getBook` reads a book's tree once for the stage, the environment and the top bar and reads it again after any write to the book (`fresh` for the book page); `errorText` the one error line; the two-step confirmations through `confirmationStep` (`shared/api/errors.ts`); the settings in localStorage through `storage.ts` (`osct-…` keys, blocked storage tolerated) |
| Panels and controls | `editor/src/lib/panels/`, `components/`, `values.ts` | Tree, the Inspector (`EntityPanel` with `SpreadView` and `EntryView`; the tabs in `panel-tabs.ts`), Library, Code, Environment, Passes; `ScrubNumber`, `Segmented`, `Icon`, `FileField`, the toolbar's `ToolGroup` and `ToolMenu` (`GridSnapMenu`, `ViewMenu`); the rows from the contract; the behaviour's rule editor `BehaviourRules.svelte` with its logic in `behaviour-edit.ts`; the Library's filters and picks in `library-pick.ts`, its code files in `library-code.ts` (`CodeFiles`, `CodePreview`), the new target's choices in `new-target.ts`; the tree's rows and their selection in `tree-rows.ts`, a selected entry in `EntryView.svelte` (its words in `entry-view.ts`), the spread section's in `spread-view.ts` (#227) |
| The Code tab's plugins | `editor/src/lib/plugins.svelte.ts`, `plugins/compile.ts`, `stage/plugin-run.ts` | the stored sources, Run (transpile with sucrase in the page; import and `installPlugin` in the stage frame, rebuild), the plugins' log |
| The Code tab's editor | `editor/src/lib/plugins/monaco.ts`, `code-editor.ts`, `plugin-api.d.ts`; `editor/tools/plugin-api/` | Monaco (a lazy chunk, its workers bundled by Vite), the keys, theme and download; `plugin-api.d.ts` generated from `engine/src/scene/plugins.ts` by `npm run plugin-api` (the build runs it; Checks fails when the checked-in file differs) |
| Routes | `editor/src/routes/` | `(app)/` – the editor behind its sign-in gate (`+layout.svelte`): `+page` (sign-in, books, import), `[book]/`, `[book]/[spread]/`, `admin/`; `stage-frame/` – the stage frame's document, outside the gate |
| The API | `server/api/src/Books.php`, `ContentVersion.php`, `ContentStore.php`, `Editor.php`, `Plugins.php` | [server](server.md) "Editor data", "Plugin sources" |
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
  image and placement: texts and the entries' own fields are still edited in the content source and imported again
  (the import keeps the logs). Renditions and transcoding stay with the content build. A target made in the editor
  tracks in the reader after a publish: the 8th Wall engine makes its image-target data from the printed image at
  runtime (`engine/src/scene/xr8.ts`), nothing has to be compiled. Events between nodes and pages are the plugin
  API's (`api.events`, since 1.1) and the `behaviour` component's; the book's own code is the Code tab (above).
- One page format and the `book` layout template; the templates of the concept (`sheet`, `cover`, `sleeve`, `wall`)
  come with the content (issues #60, #61).
- The plugin API 1.5 has components, material layers, materials, procedural textures, passes, node types, parameter
  labels, text files, events, variables in scopes, the progress and the spread ([plugins](plugins.md)), and rules
  without code are the `behaviour` component (#88); declared variables (with a type, a default and a write list) and
  bubbling event scopes come when a work needs them. The plugins' build runs locally or in CI, not yet behind the
  publish (#78).
- What the stage cannot simulate of a reader's game: consulted entries (no entry view), a reader's stored progress
  (the stage's progress lives while the workspace is open – leaving to the spread list starts a new game), two
  spreads on one stage (the mock tracker reports the current spread's targets only; a `stage` variable survives the
  switch, a `spread` variable does not), the reader's UI around the scene.
- The pass registry (`engine/src/scene/post/`) is what `api.registerPass` calls: `registerPass` with the plugin as
  owner, and `unregisterPassesOf` on uninstall. The content names the built-in passes and, since schema 2.21, a pass
  a plugin of the book recorded (#216); a pass that exists only in a Code tab source saves to the draft but is refused
  by the publish (409 `unknown-passes`) until the content build compiles its plugin (#78). A pass has no *off* of its
  own yet – removing it is the off; *make it code* for a built-in pass is not built.
- The phone layout of the workspace (the sheet, its touch heights – #171) was last checked in a desktop browser
  emulating a 360 px touch phone; the bunny store against
  the real zone and MariaDB against the new tables are untested (SQLite and a storage double in the API test).
