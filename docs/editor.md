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

## Try it (the demo book, or the fixture's studio spreads)

The **demo book** (`fixtures/demo/`, `DEMO.md`): six spreads that use every node type, placement, filter and
component, six plugins, and a narrative across its pages – the key on page 1 opens the door on page 3, the lamp
lights when the door opened, a tally counts the pages found, a tap switches a scene ([plugins](plugins.md) "The demo
book", the note `agents/research/2026-10-30-demo-book.md`). The fixture's **studio spreads**
(`fixtures/content/FIXTURE.md`, pages 28–31) are the smaller scene of every entity type, placement and filter. Locally,
with SQLite and the local content store:

1. `server/api/config.local.php` (not committed, copy of `config.local.php.example`): `DB_SQLITE_PATH`, a `SECRET`,
   `MAIL_TRANSPORT => 'log'` with `MAIL_LOG_PATH`, `CONTENT_STORE => 'local'`, and the dev servers in
   `ALLOWED_ORIGINS` (`http://localhost:5175, http://localhost:5174`).
2. The reader with the demo: `cd client && OSCT_CONTENT_DIR=fixtures/demo npm run content && npm run dev:http -- --port 5174`
   (the fixture: `OSCT_CONTENT_DIR=fixtures/content`).
3. The API: `cd client && npm run dev:api` (127.0.0.1:8080). Make yourself an editor with the curl above against
   `http://127.0.0.1:8080/api/admin/editors`.
4. The editor: `cd editor && npm install && npm run dev` → http://localhost:5175/editor/ (its `/api` is proxied to
   the dev API). Sign in: the code is in the mail log.
5. **Import a book…** → *URL* `http://localhost:5174/src/game.config.json` (the reader's dev server serves its bundled
   configuration), *assets at* `http://localhost:5174` → Import. The book appears with its spreads.
6. Open *The key*: the stage shows the spread's targets with their entities, the key is found and unlocked – the
   **Stage** tab's *vars* row shows `book · hasKey = true`, *events* the finds. Walk with › to *The door*: the door
   lifts and turns, `stage · doorOpen = true`, the lamp on the right page shows. Switch a target off and on with the
   tree's eye (lost, found again), *Replay the first find* in the stage's right-click menu plays it again, *reset* in
   the Stage tab starts a new game. Open *The switch*
   and click the entity on the stage: the next scene shows. The **Code** tab lists the six plugins (compiled by the
   content build, their sources next to them): change one, **Run**, and the stage shows it. Move a node in the
   **Entity** tab (type a scale, or press and slide), **Save**, then **Publish** to `local`.
   With the fixture: open *Studio A – models* the same way.
7. The reader reads the published version when it is started with
   `VITE_CONTENT_BASE_URL=http://127.0.0.1:8080/api/content/local` (`latest.json` names the new build).

The one-page version of this flow for editors, with the diagram, ships with the app at `/docs/tutorials/`
(`client/public/docs/tutorials/index.html` – a static page, served by the site's `.htaccess` like any file).

On staging the same flow runs against the CDN: `CONTENT_STORE=bunny` with the storage zone's credentials in the
`staging` GitHub environment ([deploy](deploy.md)); *Import a book… → the CDN* takes the current version, publishing
writes a new one, and the staging reader sees it on its next start.

**The demo book on staging**: the workflow *Demo book* (`.github/workflows/demo.yml`, by hand or on a push to
`develop` that touches the demo) builds `fixtures/demo` and syncs it to the environment **`demo`** of the storage zone
– `https://buildingfictions.b-cdn.net/demo/`. In the staging editor: *Import a book… → URL* with that base URL (the
form takes the current version and its folder as *assets at*), then open its spreads. Publish it to `local`: a
publish to `staging` or `production` makes it *the* book of that environment (the store is per environment, not per
book – see "One book per environment" below), so the editor asks first. On a phone, the staging reader opens it with
`https://osct.porschuetz.de/?content=https://buildingfictions.b-cdn.net/demo` ([content on the CDN](content-cdn.md)).

### One book per environment

Each environment's content store (`<env>/latest.json`, `<env>/<build>/` – [content on the CDN](content-cdn.md)) serves
exactly one book: the last one published there. Until the store has a folder per book (#87) the editor makes that
visible and safe (#143):

- **Where a book is live.** The Books overview shows under each book *live on staging · build … · since …* (one line per
  environment that serves it) or *draft only*; next to Publish the book page shows the same in short. An environment
  serving a book that is not imported here, or whose store cannot be read, gets a line under the list.
- **Publishing over another book asks.** Publishing a book to an environment that serves another one asks first,
  naming both (*Staging serves “Onion Skin & Crocodile Tears”. Publish “Demo” instead? …*); production says it more
  strictly (every reader of the app gets the other book). Only on *OK* does the editor send `replace: true` – the API
  refuses the publish without it (409 `other-book`). Publishing the book an environment already serves is one click
  (production keeps its usual question).
- **Switching back** is publishing the real book again (with the same question): when its draft is unchanged, its last
  version is still on the store and only `latest.json` moves back – nothing is uploaded again.
- The MCP server never replaces a book: its publish gets the 409 and leaves the decision to a person in the editor.

## What is on the stage

The **mock stage** (`editor/src/lib/stage/mock-stage.ts`) draws, in the same three.js scene as the entities: the
**sky and light** – one of six studio HDRIs from Poly Haven (`editor/static/hdri/`, CC0; the Stage panel's *sky*,
shown while the shading is rendered), the equirectangular image as `scene.background` and `scene.environment`, turned with the
stage every frame so the room stays put while the camera orbits – the **desk**, the Stage panel's choice of two
(Tilman: the tool is for designers, they should feel at home): a 1.8 × 0.8 m screen-printed plywood top (18 mm; Poly
Haven's plywood texture tinted to the phenolic brown on the faces, the plies showing untinted on the cut edges) on a
steel tube frame after Egon Eiermann's table frame (1953, the default), or Philipp Camille Schöpfer's white desk (a
thick top with three drawer cutouts in its front edge on four slender legs splayed outward), both 72 cm high and our
own low-poly models (`editor/static/models/`, 236 and 124 triangles, built by `editor/tools/desk-eiermann.py` in
Blender – `editor/static/models/README.md`), loaded once each with the origin at the top's surface, so the book lies
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
The Stage panel sets a **grid** (on / off, spacing in mm; its lines run through the origin, which is red) and the
**origin** (`stage/origin.ts`): one of the nine points of an alignment square – a corner or an edge's centre of the base
format (per page), or the centre (the book's centre, the spine's middle, on the open book; the page's centre on a cover). The x / y rows of a
target's placement and of a new target are shown and entered from that origin (x to the right, y downwards, so values
left of or above it are negative); what is saved stays mm from the page's top left corner.

Every target lies flat on the page and counts as **found**: the **mock tracker** (`stage/mock-tracker.ts`) implements
the engine's `IImageTracker` and reports each pose every frame exactly as the 8th Wall engine would (1 unit = the
printed width, origin in the image's centre, the image in the x/y plane), so `ArScene`, the entities, the animations
(reveal, unlock, outro), the bloom and the tap on an entity run unchanged. The three.js camera stays at the origin;
moving the view moves the stage and the anchors together, which is why entity and page can never drift apart.

The editor simulates the game around the scene (`stage/stage.svelte.ts`): which spread is open, which targets the
"camera" sees, which were found for the first time (the unlock animation plays once per target, *replay* plays it
again), and the reader's progress for the book's plugins (`stage/progress.ts` – the engine's `api.progress` and the
`book` scope of its variables, alive while the workspace is open). Nothing of the reader's store, progress or routes
is involved.

## The app

- **Books** (`/editor/`): the instance's books, *Import a book…* (the CDN's current version, a `game.config.json` by
  URL or file, or a **content base URL** – a CDN folder with `latest.json`, e.g. `…/demo` – whose current version is
  taken; *assets at* = where its `/assets/content/…` paths resolve – every draft and publish points there, no
  media is copied; for a content base it is the version's folder).
- **Spreads** (`/editor/<book>/`): the spreads as cards with the sheet of each as its preview (from the book's layout
  at *assets at*; without a layout the cards are text), their entries, targets and AR count; **+ cover** / **+ back
  cover** add the covers as spreads of the format `cover` / `back` (content schema 2.3: page 0, and the page after
  the last) when the book has none; **Publish** with the environment (`local`, `staging`, `production` – production
  asks), and next to it where the book is live (*live on staging, production* or *draft only*). A one-page spread's **format** (spread, cover, back) is chosen in the Stage panel's *spread* section.
- **Workspace** (`/editor/<book>/<spread>/`): the **tree** at the left, the stage, and one panel at the right on a
  desktop; on a phone the stage fills the screen and the panel is a sheet at the bottom whose head is the tab row
  (closed = the row only) with the tree as its first tab. The bar: × back to the spreads, ‹ › (also ← →) through the
  spreads, the spread's title, the tabs.
  - **Tree** – the spread in the style of Blender's outliner: a chevron column, a type icon before every name (book,
    entry, target, group / model / video / image / text / light), guide lines per depth, zebra rows, and the **eye** in a
    column at the right (shown = found; off = reported lost, as the Stage panel's chips). Rows: the spread, its
    entries in page order, each entry's target ("in view" while the camera sees it) and the target's entity as its
    **node tree** – the root node (● while the stage shows it with other values than the draft's; the shared ref) and
    its children, as deep as the content nests them. A tap on a node selects it and opens the Entity panel; a tap on
    the stage selects the root. **+ target** at the end of the tree opens the form for a new target on the spread:
    title, page, category, the printed image from the library (or uploaded there), and where it is printed (surface,
    x / y, width in mm) – the API makes entry and target, the stage shows it at once (and the reader tracks it after
    a publish: the engine makes the image-target data from the image at runtime); the target row's right-click
    menu has **Remove target** (entry and target go). ↑ ↓ walk the targets, ← → fold and unfold, Enter selects, **Delete** (or Backspace)
    removes the selected node – its children with it, the root leaves the target without AR content – and a
    **right click** on a node row opens the menu with *Remove node* / *Remove entity*. Removing is live on the stage;
    Save writes it, Back to the draft undoes it. Entries and nodes fold;
    the column collapses to its bar (‹ ›, kept on the device).
  - **Column edges** – the tree's right edge and the panel's left edge are dragged to resize the columns (#144; the
    panel 16rem to 70% of the window, the tree 10rem to 40%, the stage keeps at least 16rem, so a 768 px tablet in
    portrait still shows a stage; a focused edge also moves with ← →; with a finger (`pointer: coarse`) the edge's hit
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
  - **Stage panel** – collapsible sections, each with a header, the open state kept per section on the device
    (`editor/src/lib/sections.svelte.ts`, `components/Section.svelte`): *spread* (the format), *stage* (shake, grid,
    origin – a 3 × 3 alignment square –, desk, sky), *post-processing*
    and *vars and events* (closed by default). Every row is the panel's label / control grid (`.row` in `app.css`).
  - **The gizmo** – on the stage, three.js `TransformControls` on the selected node (the tree's or the stage's
    selection): **move / rotate / scale** by the toolbar at the top left or **W / E / R**, handles in the node's own
    space, so a drag changes the node's placement **relative to its parent** – the Entity panel's rows follow live,
    Save writes them. **Ctrl** snaps (0.05 target widths, 15°, 0.1). **Hover** draws a thin box around the entity
    under the pointer and shows the pointer cursor; a tap selects it (a click that ends a drag does not). The
    tracker lets the gizmo's gestures through (`MockTracker.ignorePointer`); the engine opens the running scene to
    such tools with `IArScene.inspect()` (scene, camera, canvas, frame hook, a node's object by its path, the tap's
    hit test) – the reader never calls it.
  - **Post-processing** – the Stage panel's *post-processing* section lists the spread's `passes` (content schema 2.5,
    [content guide](content.md) "Post-processing") with a row per parameter from the contract's specs; **+ bloom /
    + vignette / + grade** adds one, *remove* drops one, changes show live on the stage, **Save** writes the list to
    the spread (`PUT …/spreads/{id} { passes }`), *Back to the draft* undoes, *Use the book's* drops the spread's own
    list so the book's passes apply. The stage shows the passes under **rendered** only (like the HDRI's sky): the
    mock stage's table, book, printed images and sky lie on the engine's **backdrop layer** and stand in for the
    camera picture: bloom and vignette run over them as they run over the camera picture in the reader; the grade's
    **reach** row (*AR layer / whole picture*) keeps it on the AR layer (it gets the layer's coverage as a mask) or
    grades the desk too, as the reader grades the camera picture.
  - **Selection and shading** – the selected node wears Blender's orange **outline** (the edges of its meshes, drawn
    through everything, in the object's own space – a video plane outlines as a plane), the entity under the pointer
    a white one. The toolbar's last group is the viewport's **shading**, after Blender's, as its four spheres side by
    side: *wire* (the entities as lines), *solid* (one grey under the scene's lights), *textured* (the content's
    materials, no sky) and *rendered* (the HDRI's sky and light, the default); stored on the device. The toolbar is
    icons only, every button's label is its tooltip. The stage and the gizmo keep their own look.
    **Light nodes** (content schema 2.6) have no mesh: the stage draws a **helper** for each, after Blender's – a
    small bulb at the node's origin and lines for what the light does (short rays for a point light, the cone of a
    spot, parallel rays for a directional light), in the node's own space so the gizmo moves and turns it (−z is where
    a spot or the sun points); dark grey, orange while selected, drawn through everything, never in the reader
    (`editor/src/lib/stage/light-helper.ts`). A click on the bulb picks the light. The HDRI dims only the scene's own
    lights; a light node keeps the author's intensity in every shading.
  - **Picking** – a click on the stage selects what lies under the pointer by the **pick mode** next to the gizmo's
    tools (Blender's select mode): *entity* (a parcel – the root of the entity hit), *node* (a point on the graph –
    the node under the pointer, as deep as the tree goes) or *target* (the crosshair – the printed image). A printed image without AR content is always picked as its
    target. A **right click** on the stage opens the menu for what lies there: on a target *Add node… / Add AR
    content…*, *Remove node / entity*, *Placement on the page…*, *Library…*, *Remove target*; on the page or the table
    *+ target…* and *Stage settings…*. While a target's placement is edited (the form, the Entity panel's rows) the
    stage shows a translucent **ghost** of the image where it would be printed, with **handles**: drag the image to
    move it (across the spine it changes the page), drag the small square at its bottom right corner to set the
    printed width – the fields follow, Save placement writes them.
  - **Library** – the book's uploaded files and the files of the import ([server](server.md) "Assets"): a grid of
    cards (a preview with an animated skeleton until it has loaded – images, a video's first frame that plays muted
    while hovered or after a click on ▷ –, the type's icon else; where the file belongs – the import names every file
    `image.jpg`, `target.jpg`, `video.mp4` in a folder per entry, so a card reads `p015-1 · target` –, kind, size,
    dimensions, the number of uses) or a plain **list** (name, place, kind, size, uses; a click on a row opens its
    actions) – the **view** is remembered per browser; filter by kind, search by name and place (`p015 target`), **Upload** (the
    button, or files dropped on the panel); per file **Use** (the selected node takes it, when its type fits),
    **Target image** (an image becomes the selected target's printed image), **Replace…** (a new version, every use
    relinked, the stage rebuilt) and **Delete** (refused while used – *Delete anyway* forces it). Nodes name a file by
    its absolute URL, so draft and every publish point at the same file. While the Environment tab picks a file, a
    fitting card has a **World** (a glTF model) or **Sky** button (a jpg, png or webp) and the kind filter starts there.
  - **Environment** – the book's world around the reader and its sky (content schema 2.8 / 2.10,
    [content guide](content.md) "Environment", [look-around](look-around.md)). While the tab is open the stage shows the
    **engine's own look-around pass** with the values being edited – the world anchored to the book, the window around
    it and the clear floor – under the desk and the book (the studio's HDRI sky steps aside, its light stays), turned by
    the view as a phone's gyroscope would turn it (`MockTracker.worldOrientation`, `ArScene.previewEnvironment` – an
    editor-only method, not part of `IArScene`). **look up** raises the camera from the book towards the horizon and the
    sky (the targets stay found, as the reader's world stays for 45 s). Rows: **world** – the built-in *café*, or a glTF
    model; **sky** – *the world's*, or an equirectangular image; each with *Library…* (the Library picks it, see above),
    *Upload* (into the Library and taken at once) and *remove* (back to the built-in part); **onion sky** on / off (it
    needs a camera picture, so only the reader shows it). Changes show at once; **Save** writes the environment to the
    draft (`PUT /editor/books/{id}/environment`), *Back to the draft* undoes, *Use the default* removes it. The book page
    shows the environment as one line with *Edit on the stage* (the first spread, `?tab=environment`).
  - **Stage** – the stage's settings: **shake**: 0 = still, 1 = a hand holding a phone. **desk**: *Eiermann* (the
    default) or *Schöpfer*. **sky**: one of six Poly Haven studios (the HDRI – sky and light while the shading is
    rendered). All stored on the device. The camera is moved on the stage itself: **drag** orbits, **Shift + drag**,
    the **middle button** or **two fingers** pan (the looked-at point moves in the page plane), **wheel / pinch**
    change the distance, **double tap** returns to the reader's view (35 cm above the page, tilted 30°; the free orbit
    is kept on the device). Found / lost per target is the tree's eye (off reports it lost → outro, on found again →
    reveal); **Replay the first find** is in the stage's right-click menu. (The panel's view presets and found chips
    doubled these and are gone – Tilman, 2026-10-29.) **vars** and **events**: the book's plugins' variables with
    their scopes (`book · hasKey = true`) and the last events of the stage (found, lost, unlocked, spreadChanged, the
    plugins' own), newest first – the narrative of a book like the demo ([plugins](plugins.md) "Across nodes and
    pages") is driven from the tree's eyes and read here; **reset** starts a new game (every variable cleared, nothing
    unlocked, the spread found anew).
  - **Entity** – first the **target**: its printed image (thumbnail and name; **Replace image…** uploads another)
    and, behind *placement*, where it is printed – surface, x / y and width in mm (`print`, content schema 2.1;
    **Save placement** writes it; until then a target made in the editor lies where its form put it, an imported one
    where the book's layout says). Then the selected **node** of its entity (the head says `node · root › 1 › 0 ·
    model`), its **file** (name; **Upload…** or **Library…**),
    **+ node** (type – group, model, video, image, text or light – and for model / video / image a file from the
    book's assets – appended as a child of the selected node, or as the root of a target without AR content),
    **remove node** / **remove entity**; then every placement value (relative to the parent node), a text node's
    text and colour, a light node's **light** rows (kind as a segmented group, colour, intensity, distance and decay
    for a point or spot, angle and penumbra for a spot), and every filter parameter of the
    node as rows of one control height: position, rotation and scale with X, Y, Z side
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
    plays (`playOn` found / tap / never, `stopOn`, loop, speed). Rows come from the content contract's definitions
    (`PLACEMENT_PARAMS`, `FILTERS`, `componentSpec`, `LIGHT_PARAMS`): a new filter, component, light parameter or
    parameter needs no panel code (one snippet draws a parameter of any kind) – a component or material layer a
    **plugin** registers shows the same way, with **+ type** after a Run in the Code tab.
  - **Code** – the book's own code ([the decision](../agents/research/2026-10-29-code-in-the-editor.md)): the
    plugins stored for the book and the ones the content declares (compiled by the content build – opening one reads
    its `index.ts` next to the compiled module; Save keeps a copy), one open in **Monaco** (loaded with the tab only – the
    reader and the other tabs carry nothing of it): TypeScript with the content build's compiler options against
    `plugin-api.d.ts` (the module `osct-plugin-api`) and three's own types, so completion, hover documentation and type
    errors inline are the build's; Tab indents, Ctrl+Enter runs, Ctrl+S saves; the colours follow the editor's day /
    night tokens. **Download** gives the plugin's folder as a zip (`index.ts`, `plugin-api.d.ts`, a `tsconfig.json`). **Run** transpiles the TypeScript in the browser
    (sucrase, types erased – no type check, that is the build's half), imports the module and installs it in the
    stage's registry under the plugin's id (a second Run replaces the first), then builds the spread again: a
    material layer tints the video at once, a component shows under *add component* in the Entity panel. Errors
    show under the editor and as a marker on their line (a transpile error, a plugin that imports a module – plugins import
    nothing, three.js is `api.three` – an invalid spec, an exception in `register`); the previous registration stays.
    **Save** stores the source (`/api/editor/books/{id}/plugins/{pid}`, a change recorded), **Delete** removes it.
    **Nothing run here reaches readers**: a plugin gets there through the content build – today as a folder
    `plugins/<id>/index.ts` of the content source and the import, soon compiled by the publish itself on the server
    (#78, Tilman 2026-10-29) – and a publish whose nodes use a component no compiled plugin can provide is refused
    (409 `unknown-components`). The plugin API (`api.three`, `registerComponent`, `registerLayer`, the component
    context) is described in [content](content.md) "Plugins", the guide for authors is [plugins](plugins.md).
- Settings (view, orbit, sky, desk, shake, the open tab, the tree open or collapsed) are stored per device; the
  session token too.

### UI rules

The editor follows the Scutoons UI dogma (`scutoons/agents/DESIGN.md`) in its own CSS (`editor/src/app.css`), not
the reader's design tokens: a design tool's default palette – day (white, light greys, near-black text) and night
(dark greys, white text), following the system, forced with `data-scheme` on `<html>` – and **no colour** but the
danger red; one control height (`--control-height`, 1.75rem), square corners, compact system type; rows with a label
column; numbers as `ScrubNumber` (the whole field is the gesture: press and slide – **up or right raises, down or left
lowers** the value, the two directions add up (the quadrant rule, Tilman 2026-10-29; Scutoons' fields should follow) –
Shift ×10, Alt ×0.1, tap to type,
↑ ↓, Enter, Escape, the reset arrow inside the field – no native sliders, no native colour picker: the colour popover
in the top layer); small enums as segmented pressed pills;
on / off per item as a pressed chip; Feather icons only where a word makes no sense (step, replay, photo, close, the
chain that links the scale axes) – and in the tree, where type icons and the eye are every outliner's convention
(Blender, Unity, Figma); each with a name and a tooltip; the sheet closes to its head row. Brand UI (gold, serif) stays in the reader – the stage
itself renders the reader's content unchanged. Texts are English (RULES #20).

## Where the code lives

| Piece | Where | Notes |
|---|---|---|
| The engine | `engine/src/` | `content/` (loader, accessors, `contentUrl`), `scene/` (`ArScene`, entities, trackers), `types/`, `utils/`; compiled by the app that imports it (`@engine/*`) |
| The reader's scene | `client/src/components/ar-bridges/ar/index.ts` | `createReaderScene()`: the engine with the 8th Wall tracker (`engine/src/scene/xr8-tracker.ts`) and the reader's graphics options |
| The editor's stage | `editor/src/lib/stage/` | `stage.svelte.ts` (the simulation, owns the gizmo), `gizmo.ts` (TransformControls, hover), `mock-tracker.ts`, `mock-stage.ts`, `preview.ts` (view, orbit, pan, sky, desk, hidden targets), `stage-layout.ts` |
| Draft and session | `editor/src/lib/content.svelte.ts`, `session.svelte.ts`, `api.ts` | the draft through the engine's loader (`baseUrl` = the draft endpoint, `assetsBase` = the import's), the token for its requests |
| Panels and controls | `editor/src/lib/panels/`, `components/`, `values.ts` | Tree, Stage, Entity, Library, Code; `ScrubNumber`, `Segmented`, `Icon`; the rows from the contract |
| The Code tab's plugins | `editor/src/lib/plugins.svelte.ts`, `plugins/compile.ts` | the stored sources, Run (transpile with sucrase, import, `installPlugin` of the engine's registry, rebuild) |
| The Code tab's editor | `editor/src/lib/plugins/monaco.ts`, `code-editor.ts`, `plugin-api.d.ts`; `editor/tools/plugin-api/` | Monaco (a lazy chunk, its workers bundled by Vite), the keys, theme and download; `plugin-api.d.ts` generated from `engine/src/scene/plugins.ts` by `npm run plugin-api` (the build runs it; Checks fails when the checked-in file differs) |
| Routes | `editor/src/routes/` | `+page` (sign-in, books, import), `[book]/`, `[book]/[spread]/` |
| The API | `server/api/src/Books.php`, `ContentVersion.php`, `ContentStore.php`, `Editor.php`, `Plugins.php` | [server](server.md) "Editor data", "Plugin sources" |
| Book layout import | `scripts/layout/extract-layout.py` | sheets and printed geometry from the designed PDFs |

Tests: the engine's next to its code (`engine/src/**/__tests__`, run by the reader's vitest), the editor's stage tests
(`editor/src/lib/stage/__tests__`, `npm test` in editor/), the API test (`server/tests/api-test.php`, the editor flow
included). CI builds and checks the editor (`checks.yml`, job *Editor*); the image builds it next to the reader
(`Dockerfile`), Apache sends `/editor/*` to its `index.html` (`client/public/.htaccess`).

## Limits of this step

- Entities as node trees, files from the library (uploaded in the editor) or the content, targets with their printed
  image and placement: texts and the entries' own fields are still edited in the content source and imported again
  (the import keeps the logs). Renditions and transcoding stay with the content build. A target made in the editor
  tracks in the reader after a publish: the 8th Wall engine makes its image-target data from the printed image at
  runtime (`engine/src/scene/xr8.ts`), nothing has to be compiled. Events between entities and nodes without a
  target are phase 15 step 3; the book's own code is the Code tab (above).
- One page format and the `book` layout template; the templates of the concept (`sheet`, `cover`, `sleeve`, `wall`)
  come with the content (issues #60, #61).
- The plugin API 1.1 has components, material layers, events, variables in scopes, the progress and the spread
  (`registerComponent`, `registerLayer`, `registerPass`, `api.three`, `api.events`, `api.vars`, `api.progress`,
  `api.spread`); node types are #77, declared variables and a `behaviour` component without code come when a work needs them. The Code
  tab has no completion from the API's types and no type check (#76); the build runs locally or in CI, not yet behind
  the publish (#78).
- What the stage cannot simulate of a reader's game: consulted entries (no entry view), a reader's stored progress
  (the stage's progress lives while the workspace is open – leaving to the spread list starts a new game), two
  spreads on one stage (the mock tracker reports the current spread's targets only; a `stage` variable survives the
  switch, a `spread` variable does not), the reader's UI around the scene.
- The pass registry (`engine/src/scene/post/`) is what `api.registerPass` calls: `registerPass` with the plugin as
  owner, and `unregisterPassesOf` on uninstall. The content names the built-in passes (bloom, vignette, grade); the
  build and the guard do not accept a spread naming a plugin's pass yet (#97).
- The phone layout of the workspace (the sheet) is built but was checked on the desktop only; the bunny store against
  the real zone and MariaDB against the new tables are untested (SQLite and a storage double in the API test).
