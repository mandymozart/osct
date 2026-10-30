# Changelog

Every versioned change is listed here, newest first. Versions follow [semver](https://semver.org/) and
are the same for app, content build and server (`agents/RULES.md` #10, #23):

- **PATCH** – fixes, refactors, comments, styling tweaks, tooling; nothing a reader or editor has to act on.
  Changes only to `agents/`, `docs/` or Markdown need no version.
- **MINOR** – new features or content-build options that work with existing content and progress.
- **MAJOR** – content must be rebuilt, or the progress storage format changes (needs a reader in
  `utils/progress-record.ts`).

Sections per version: *Added*, *Changed*, *Fixed*, *Removed* (only those that apply). Versions before
1.1.2 are in the git history.

## Unreleased

### Added
- **Editor: code files in the Library** (#186, Tilman: "the Library needs a file view for scripts and shaders"): the
  book's scripts and shaders in a list of their own under the media – the new filter **code** shows it alone – with
  name, kind, size and where each is used. A click opens a file: where it is used, a read-only preview (Monaco – GLSL
  highlighted as C, WGSL as itself) and **Open in Code** (a script), **Copy URL** (a shader), **Download**,
  **Replace…** and **Delete** (refused while used – *Delete anyway* forces it).
- **Editor: upload scripts and shaders in the Library** (#186), with the button or by dropping them on the panel (a drop
  hint shows while dragging): a `.ts` / `.js` file becomes one of the book's plugin sources – the ones the Code tab
  lists, named after the file –, a `.glsl` / `.frag` / `.vert` / `.wgsl` file a **shader** in the asset store, with
  versions like every other file. A code file is at most 256 KB.
- **Plugin API 1.5: `api.loadText(url)`** (#186, content schema 2.18 – nothing new in the content): a text file – a
  shader of the Library – by its URL, one request per URL, for a material's or a pass's build ([plugins](plugins.md)
  "A shader file").
- **API** (#186): the asset kind `shader` (`POST …/assets` checks a shader is text: a text content type, UTF-8 without
  binary bytes); `POST …/plugins` (a script file as a new plugin source), `PUT …/plugins/{pid}/file` (a file as its new
  source), `GET …/plugins/{pid}/usages`, and the plugins list's `usages`. **MCP**: `upload_plugin` and `plugin_usages`,
  `delete_plugin` takes `force`, `list_assets` / `upload_asset` know shaders.

### Changed
- **A plugin source's delete is refused while the draft uses what it registers** (#186: 409 `plugin-in-use` with the
  usages; `?force=1`, the editor's *Delete anyway* and the MCP's `force: true` delete it anyway) – in the Code tab and
  the Library alike.
- **An asset's uses include the plugin sources that name its URL** (#186): delete refuses while a plugin loads the
  file, and a replace rewrites the URL in those sources (a change each), as it relinks targets, entities and entries.

## 1.48.0 – 2026-10-30

### Changed
- **The environment replaces the HDRI sky box** (#185): once a book has an environment (the draft's, or edits that start
  one), the editor's stage shows its look-around world as the sky in every tab while the shading is *rendered* – the
  author sees the world the reader will see, not a studio behind it. The stage is then lit as the reader lights the AR
  content – the engine's own ambient and sun, no HDRI light (the reader's world lights nothing). Where the reader shows
  its camera picture – the window around the book and the open roof – the stage shows the HDRI as a stand-in, drawn
  behind the world as a background only, so there is no black hole beyond the desk. Post-processing still shades the
  world. A book without an environment keeps the HDRI as before. The Stage panel's *sky* row names the
  environment's (*the environment's (world café)*), the HDRI picker stays below it for books without one, the closed
  *stage* head adds *· the environment's sky*, and the *rendered* button's tooltip says so. The Environment tab's
  preview now also takes the HDRI's light away and fills the camera window with it while rendered (before, the window
  was black).

## 1.47.0 – 2026-10-30

### Added
- **Editor: a vertical axis on the stage** (#190, Tilman: "Unser Grid braucht noch eine vertikale Achse"): with the
  grid, a thin green line for the height rises out of the page from the origin – at the book's centre, or at each
  page's corner for a corner origin – next to the grid's red x / y lines. It is switched on and off on its own.
- **Editor: snapping** (#190) for the gizmo and the placement handles. A **move** snaps to the **grid** (its step,
  counted from the origin), the **axes** (the origin's lines, the page for the height), **other objects** (their
  boxes' edges and centres, their pivots) and **outlines** (the printed targets' edges and centres, the pages' edges
  and the spine) – the nearest within a few pixels wins, its line shows as a magenta guide while dragging; with nothing
  near it steps by the grid, or by the move step when the grid is no snap target. Only the axes of the handle being
  dragged snap. A **rotation** turns in whole steps of degrees (15° at first), a **scale** in whole steps (0.1, never
  below one step). **Shift** (or Ctrl, as before) held while dragging turns snapping around for that drag.
- **Editor: a *grid & snap* group in the stage toolbar** (#190): one button (a dot in its corner while snapping is on)
  opening a panel with the grid on / off and its step in mm, the vertical axis on / off, snap on / off, what a move
  snaps to (grid, axes, objects, outlines) and the precision per mode (move in mm, rotate in degrees, scale). Stored in
  this browser like the other stage settings; the Stage panel's closed *stage* head says *· snap on*. Keyboard (↓ opens
  it, ↑ ↓ move, Esc closes) and touch (44 px controls) like the other groups.
- The tutorial's demo chapter has a paragraph on grid and snap with a shot of the open panel.

### Changed
- **The gizmo's Ctrl snap** (0.05 target widths, 15°, 0.1) became the snapping above: with snapping off, Ctrl or
  Shift snaps to the grid, axes, objects and outlines at the toolbar's precision instead of fixed steps.

## 1.46.0 – 2026-10-30

### Added
- **The import says what it imports** (#182): before anything is imported, *Import a book…* shows what comes in –
  where from (the content base), the current build from its `latest.json` (id, when it was built and became current,
  the app and content schema version) and the one book in it: title, id, spreads, entries, targets. The button names it:
  *Import 1 book: The Demo Book (build 7457f0c…)*. *The CDN* no longer asks for a book id – it comes from the
  configuration. A URL (a content base or a `game.config.json`) and a file get the same preview.
- When a draft with that id is already here, the form says so before importing: that the import replaces it, and how
  many of its edits since its import are lost (unpublished, unless the draft as it is now is live). The version
  comparison and its confirmation in the page follow as before.
- When the CDN or the URL cannot be read, or its `latest.json` names no build, the form says so with the URL, and
  *Try again*.
- `POST /api/editor/import/preview` (the import's body, nothing imported): the content base and its `latest.json`, the
  incoming book and build, what it holds, and the draft of that id it would replace (the import's comparison). The MCP
  server's new read-only tool `preview_import` answers the same, so an agent can tell the person what an import would
  bring in.

### Changed
- `502 content-fetch-failed` of the import names the failing address in `url` as well as in the message.

## 1.45.0 – 2026-10-30

### Changed
- **Post-processing names its level** (#181): the section's head reads *post-processing · the whole book* or
  *post-processing · only this spread* instead of a small muted label at the right. A line under it says what editing
  changes – *changes all 5 spreads that use the book's* (counted) or *overrides the book's for this spread* – and ends
  in the switch, *own for this spread* or *back to the book's* (it replaces the *uses* pill pair). Save says what it
  saves: *Save for the whole book*, *Save for this spread*, or both. The book's list stays in the Stage tab.
- **Sections start closed** (#193): on a first visit the Stage tab's *spread*, *stage*, *post-processing* and *vars and
  events* are closed, the Environment tab's *preview* too (its *environment* stays open). A closed head shows what
  matters – *stage · Eiermann · grid off*, *preview · look up 0°*, the post-processing level. Sections someone has
  opened or closed in this browser keep their state.
- The tutorial's post-processing section and its shots show the new wording; its paragraph on removing a spread
  describes the card's menu and the confirmation with the impact.

### Fixed
- **No divider above the first section** (#193): the first section of a panel no longer draws a line right under the
  tab row, in every tab, on a phone and a desktop.

## 1.44.0 – 2026-10-30

### Added
- **Remove a spread with everything on it** (#198): the book page's *Remove* is no longer disabled for spreads with
  entries. It shows, in the card, what goes – "Removes spread 4–5 with 3 entries, 3 targets, 2 entities." – which later
  pages move back, which shared entities are kept because other targets use them, and that the Library files are kept;
  an option, off at first, also deletes the files used only there (named), while the files used elsewhere are listed as
  kept. Nothing is removed before *Remove* in that confirmation. The spread the book opens on still cannot go.
- **Removing an entry** in the tree or on the stage uses the same confirmation, in the panel – no browser dialog.

### Changed
- `DELETE /api/editor/books/{id}/spreads/{sid}` and `…/entries/{eid}` take two steps, for people and AI connections
  alike: the first answers 409 `confirm-delete` with the `impact` (entries, targets, entities, kept shared entities,
  Library files used only here and elsewhere) and a short-lived confirmation id, and removes nothing; the same request
  with `confirm` removes exactly that in one transaction (`deleteFiles: true` also the files used only there), every
  removed row in the change log with its `before`. A confirmation that no longer fits answers 409 `confirmation-void`
  with a fresh impact. The import's confirmation and these share one implementation (`Confirmation.php`).
- The MCP server's `delete_spread` and `delete_entry` return the impact and the confirmation id; their descriptions
  tell the agent to show the impact to the person and ask before calling again with the id. An AI connection removes
  like its person, only through these two steps, and the change log names it.

### Fixed
- The tree's *Remove target* did nothing: the menu closed before it read which target it was for.

## 1.43.0 – 2026-10-30

### Added
- **Import with a version comparison before it overwrites** (#183, Tilman: "Wichtig hier ein Versionsabgleich, wenn
  es überschreibt."): importing over a book that exists shows, in the page, the incoming build against the build the
  draft is based on – id, build date, app and schema version – with who imported it, the draft's edits since that
  import (from the change log) and whether the draft as it is now is live anywhere. *Replace the draft* imports; nothing
  is written before. The API answers the first import with that comparison and a short-lived confirmation
  (409 `confirm-import`), the second with `confirm` imports (`books.imported_json` records what each import brought).
  The MCP server's `import_book` takes the same two steps and tells the agent to show the comparison to the person
  first. *The CDN* asks for the book id in the form, not in a browser prompt.
- `GET /api/editor/environments`: this instance's environment and, per environment, whether the CDN or this server is
  its backend, with the warning wherever this server is the publish target.

### Changed
- **An instance publishes only to its own environment** (#183, Tilman: "Bitte nicht auf andere Environments pushen
  lassen."): the editor has no environment select any more – Publish goes to the instance's environment, named next to
  the button with its backend (`staging · CDN`, `local · this server`; a connected CDN has priority), and `local` exists
  only on a developer's machine. The API refuses another environment (403 `other-environment`); the MCP server's
  `publish` defaults to the own environment.
- **Publish asks in the page, not in a browser dialog**: a step names the book, its build, the target and what it
  replaces there (another book: *Replace on staging*). Wherever this server is the target, it and the bar warn: *No CDN
  connected – the published content is stored and served by this server only. Readers load from here without edge
  caching; heavy media goes through this server. Back up the content store.*
- **Published content and uploads out of the API's code folder** (#197): the content store is `content-store/` at the
  top level of a checkout (`OSCT_CONTENT_STORE_DIR`; the API's `CONTENT_STORE_DIR` still works), the SQLite file and the
  logs are in `var/` (`var/db/`, `var/log/error.log`, `var/mail/mail.log`); `server/api/db/` keeps the schema only. On
  its first start the API moves the old `api/db/content`, `error.log`, and a `local.sqlite` / `mail.log` an older
  `config.local.php` names there, once and logged – nothing is overwritten. On the FTPS staging they move to
  `api/content-store` and `api/var`, outside the uploaded code. The image keeps the content store in
  `/var/lib/osct/content-store`, a Kamal volume on staging and production, so a redeploy cannot lose it; backup =
  the database plus the content store (docs/deploy.md).
- The tutorial (`/docs/tutorials/`) says where Publish goes, that an import compares first, and how to read the demo
  without publishing it over the book on staging.

## 1.42.1 – 2026-10-30

### Added
- **The editor's demo video, re-recordable** (#195, Tilman: "Kein Text."): `editor/tools/demo-video/` records the
  editor with the demo book in headless Edge over CDP (`Page.startScreencast`, scripted mouse and touch with eased
  moves, a dot only during drags) and cuts it with ffmpeg into a ~30 s 9:16 (1080 × 1920, the phone layout) and 16:9
  (1920 × 1080) H.264 file without text or audio, each under 16 MB. `prepare.mjs` signs in on a local API copy and
  imports a CDN build with its files; the outputs stay outside the repository (README in the folder). Tooling only.

## 1.42.0 – 2026-10-30

### Changed
- **Editor: a spread card's actions are in its menu, not over its sheet** (#196): the book page's cards carry no
  buttons any more – the sheet is the content. A right click, a long press with a finger (half a second, with a light
  cue while held; a tap still opens the spread, a scroll cancels the press) or the menu key / Shift+F10 opens a small
  menu: *Open*, *Add a double page after* and *Remove*, each with an icon. A disabled item says why under its word
  (the spread has entries, the book opens on it, nothing follows the back cover). The menu works with the keys (arrows,
  Home / End, a first letter, Enter, Esc – the focus goes back to the card) and its items have the touch height on a
  phone. Removing asks in the card (*Remove* / *keep*) instead of a browser dialog; *+ double page* above the cards
  stays.
- **The stage's right-click menu is the same menu** (`ContextMenu.svelte`): it stays on the screen, takes the focus
  and works with the keys too.

## 1.41.2 – 2026-10-30

### Changed
- **The stage's default sky is Wooden Studio 17** (Tilman: "Standard-Licht auf 17 wechseln"): Ferndale Studio 04's yellow
  overhead light tinted the desks (Schöpfer's linoleum looked olive). A sky chosen in the Stage panel stays chosen (stored
  per browser); only a first visit or a reset starts on 17.

## 1.41.1 – 2026-10-30

### Changed
- **Schöpfer's desk as it really is** (#187, Tilman: "Das ist kein Plywood … Und Material echt heißt"; "Die Fächer sind
  besonders wichtig, dass die zu erkennen sind. Und die Platte nicht massiv erscheint"): remodelled after the
  manufacturer's catalogue. The top is a thin sandwich panel (24 mm, still 1800 × 800): a blue-grey **linoleum** layer
  over the whole top – its edge a thin line of its own – on an **oak** edge band all round, the aluminium core showing
  from below. Three **open oak drawers** hang under the front edge (bottoms 80 mm under the surface, the catalogue's
  8 cm), pulled out towards the sitter by different amounts, so their walls, bottom and **dark inside** read from the
  front and the side. The **frame** is black powder-coated steel, matt with a slight sheen: a flat rim under the top
  and at each end two square legs splayed outward in a narrow A, each with a strut up to the end of the rim (a Y seen
  from the front) – the proportions from the catalogue's side view, the height now its 75 cm (the Eiermann stays at
  72). 256 triangles. No plywood plies on Schöpfer's edges any more (#107 stays on the Eiermann).
- **Oak and linoleum drawn in code** (`editor/src/lib/stage/oak.ts`, `linoleum.ts`, like the plies – no image file, no
  download): a light oak with fine, slightly wavy grain lines and the dashes of its pores, running along the edge band
  and along every drawer wall; linoleum with a faint mottle and speckle. The stage puts them on Schöpfer's materials
  `oak` and `linoleum`; the Eiermann's look is unchanged.
- **The desk-model test** checks Schöpfer's materials (no `top` / `edge`), the sandwich top's layers, the three drawers
  as open boxes with a dark inside under the top's front edge, the splayed legs and struts, and the frame's black, matt
  coat (both frames: powder coat, not a mirror).

## 1.41.0 – 2026-10-30

### Added
- **Plugins: a whole material, a procedural texture, textures as parameters** (#188, plugin API 1.4, content schema
  2.17): `api.registerMaterial(type, spec, build)` builds a three.js material (a `ShaderMaterial` with its own GLSL, a
  `MeshStandardMaterial` …); any node with meshes – a model, an image, a video, a text, a plugin's node – carries it as
  `material: { type, params }` and it replaces the node's own (a mesh with `userData.keepMaterial` keeps its own), the
  node's material layers still add on top. `build` gets the values, a `time` uniform the engine advances and the
  picture of the material it replaces. `api.registerTexture(type, spec, draw)` draws a texture in code (a canvas or a
  data texture, animated or not). The new parameter kind `texture` takes a Library picture or video, a file next to the
  node in the YAML, or a procedural texture – in a material, a layer (a `sampler2D`), a component or a node type, whose
  code gets a three.js texture.
- **Recorded and checked like node types**: the content build records a plugin's materials and textures
  (`registered.materials` / `.textures`) and checks every node's material and every texture value; the guard checks a
  node's material against the recorded specs; the API refuses a material no plugin of the book registers (400) and a
  publish whose nodes use one no compiled plugin provides (409 `unknown-materials`); the MCP server checks it before a
  save and lists the materials and textures in `describe_content_model`.
- **Editor: the material row and make it code** (#188): the Entity panel shows a node's material – *its own* or one of
  the book's plugins, then its rows (labels as #173) –, texture rows as a list of procedural textures and Library files,
  and **make it code** on any node (Unreal's *Create Blueprint from component*): a Code tab plugin whose
  `registerNodeType` reproduces the node – its type's builder as a readable starting point, its values as parameters –
  saved, run and the node switched to it. **make code** beside the material does it for the node's look
  (`registerMaterial`).
- **The demo book's aquarium** (#188): on page 2 a glass tank with water, a sandy floor and fish – a plugin's node type
  (`aquarium`) carrying a plugin's material (`water`: waves, a tint by angle and depth), its floor lit by a procedural
  texture (`caustics`). About 0.2 ms of main-thread work per frame on the editor's stage, 14 draw calls.
- **Docs**: *Where a plugin can go* (Unreal, 8th Wall and OSCT compared) and *An aquarium, step by step* in
  docs/plugins.md; the tutorial's chapter 4 gets *Code everywhere* and *The page is the zero plane*.

### Fixed
- **The demo book: every model stands on the page** (#189): the beacon (its origin in its middle) sank to its crown,
  the door floated, the standing videos sat a little high or low – each now has its lowest point on the paper. The
  content build warns when a model floats or sinks (its bounding box from the glTF through the placements above it),
  with the position that stands it on the page.

## 1.40.0 – 2026-10-30

### Changed
- **Connect an AI agent, not only Claude** (#194): the guide beside the AI connections on the editor's books page is
  for any agent. It first shows what every MCP client needs – the server's name, the command `node <file>`,
  `OSCT_API_URL` and `OSCT_EDITOR_TOKEN`, each with a copy button – then a ready snippet for Claude Code, Claude
  Desktop, Codex CLI, OpenCode and Cursor, with the new token filled in. The path to `mcp/bin/osct-mcp.mjs` in your
  osct checkout is a field you fill once (this browser remembers it) instead of a placeholder hidden in the snippet.
  The server is named after the instance (`osct-staging` on staging, `osct-production` on production), so several
  instances sit side by side and none takes the repository's own `osct`. The token name suggests the agent and the
  machine ("Codex on my laptop").
- **API: `/api/health` names the environment** (`env`: `local`, `staging`, `production` – the new setting `ENV`,
  set in the Kamal destinations).

## 1.39.1 – 2026-10-30

### Fixed
- **Editor: placing a target moves it instead of showing it twice** (#191): while a target's placement is edited (the
  handles on the stage, the inspector's surface, x / y and width), the target itself now lies at the edited place –
  its printed image, its orange outline and its AR content move together – instead of a translucent copy next to the
  original that stayed put until the save. Hiding the placement without saving puts it back. A new target (the
  *+ target* form) still shows its translucent preview.
- **Editor: the selected target's outline sits exactly around its printed image** (#191): it was drawn at the size the
  print had before its image loaded (a 4:3 guess), so after a spread change or a save it was too short for any image
  that is not 4:3. It now follows the image and a move.
- **Editor: AR content sits on the centre of its printed image, as in the reader** (#191): the stage anchored it at the
  centre of a 4:3 box, so above the middle of a portrait image (28 mm on the demo's twins) and below that of a wide
  one; the reader's tracker anchors at the image's real centre, and the stage now does too.
- **Editor: the placement shows where the target lies** (#191): opening the placement of a target without a place of
  its own (not in the book's layout either) showed fixed default numbers – or the previous target's – while the image
  lay elsewhere; it now starts from where the stage shows it. Dragging the corner on the left page counts the width
  with the book's page width instead of a fixed 230 mm.
- **Editor: the pick modes filter strictly** (#192): *Entities* picks only an entity, *Nodes* only the node under the
  pointer, *Targets* only a printed image; a click where nothing of the mode's kind lies clears the selection (tree,
  stage and Entity panel alike – the panel says *Nothing selected* instead of showing some other target). Before, a
  click next to an entity in entity mode selected the printed target under it; particles and lines caught clicks far
  around them (three.js's world-sized ray threshold – the demo's sparkles took clicks a whole target width away), and
  so did a selected entity's own outline. A node picked on another target than the one in the Entity panel is now
  selected at once (it fell back to the root). The right click's menu still opens on the printed target when the mode
  finds nothing there.

### Added
- **Editor: hover shows what a click would pick** (#192): on a desktop with a mouse, the entity, node or printed image
  that a click would pick in the current pick mode wears a light grey outline and the pointer cursor (a particle cloud
  its bounds); with a finger there is no hover – a tap selects at once and shows the selection's orange outline.

## 1.39.0 – 2026-10-30

### Added
- **AI connections on the editor's books page** (#142): an editor or admin makes a personal access token for Claude
  with a name ("Claude on my laptop") – shown once with a copy button and the warning that it is not shown again – and
  sees each token's last use and expiry, renews it (182 days from today, the same token works on) or revokes it. Beside
  it a short guide: what the MCP server does, this instance's API, a copyable setup for Claude Code or Claude Desktop
  with the new token filled in, and the first steps (`whoami`, `describe_content_model`). No sign-in mail is needed.
- **API: personal access tokens** (`/user/tokens`, docs/server.md "AI connections"): stored as SHA-256 hashes with the
  prefix `osct_`; `Authorization: Bearer osct_…` acts as the person with their roles. A token can never publish (any
  environment), manage tokens, set the password or delete the account (403 `not-for-ai`); expired or revoked tokens
  get 401. Saves made through a token name it in the change log (`token`).
- **MCP server: signing in with a token**: `OSCT_EDITOR_TOKEN=osct_…` skips the mail sign-in; `whoami` says it is
  signed in with a token and names it, and the errors of an expired or revoked token say what to do. The mail sign-in
  stays for people without a token.

## 1.38.1 – 2026-10-30

### Fixed
- **The Eiermann desk's frame no longer disappears, on a phone above all** (#184): the steel tubes were a dark mirror
  that showed only what they reflected – before the dark parts of the studio, and in *textured* shading (no studio
  light at all), whole tubes went as dark as the room behind them, and the one strut that caught a bright reflection
  stood out alone like a stray bar. The frame is now satin graphite powder-coated steel, which the scene's lights show
  from every side; the model's shape is unchanged. A new test checks both desk models: their meshes, that every face
  points outward, no duplicate or overlapping faces, and a frame material that does not depend on reflections.

## 1.38.0 – 2026-10-30

### Changed
- **Editor: the stage toolbar groups its tools** (#180): transform (move / rotate / scale), pick (entities / nodes /
  targets) and shading (wire / solid / textured / rendered) are one button each, showing the active mode's icon; a tap
  opens the group's options in a small menu (icon, name, shortcut), a choice closes it. Where the toolbar has room –
  decided by its own width, not the device – the groups stay expanded as before (a desktop shows all three). The menu
  works with the keyboard (↑ ↓, Home / End, Enter, Esc returns to the button), closes on a tap outside and has the
  touch height with a finger; W / E / R and the Info view's help keep working.
- **Phone: the toolbar is one row next to ‹ › at every sheet height** (#180): the groups collapse to three buttons, so
  #177's sideways-scrolling toolbar is gone; ‹ › still move from the stage's lower corners to its top right when the
  sheet is almost full.

## 1.37.1 – 2026-10-30

### Changed
- **The desks' plywood edges have 13 plies per 18 mm** (follow-up to #107): Tilman asked for more layers – the trade's 18 mm
  birch plywood (phenolic-faced like the Eiermann top) is 13-ply. The Eiermann board shows one stack of 13, Schöpfer's
  60 mm top three (39 plies of about 1.5 mm).

## 1.37.0 – 2026-10-30

### Changed
- **The stage's desks show cut plywood on their edges** (#107): both the Eiermann board and Schöpfer's thick white top
  show the plies of birch plywood along their cut sides – light long-grain veneers and slightly darker cross-grain ones
  in turn, with thin glue lines between them. The plies are drawn by the editor itself (no image to download), and the
  faces of both desks look as before. The desk models' edges got their own UVs so the plies lie parallel to the faces.

### Fixed
- **The Eiermann desk showed a flat brown top until the desk was switched** (#107): the default desk now gets its
  plywood look right away.

## 1.36.3 – 2026-10-30

### Fixed
- **Phone: ‹ › no longer cover the stage's toolbar** (#177): with the sheet almost full the stage is too short for the
  spread buttons below the toolbar, so they move to its top right and the toolbar keeps to one row beside them, which
  scrolls sideways – every tool stays reachable at every sheet height. At a third or half nothing changes.
- **Editor on touch: a tapped button no longer looks pressed** (#178): every hover style (pills, icon buttons, tree
  rows, menus, crumbs, the Library's rows and cards, the column edges, the sheet's grip …) applies only where a
  pointer can hover, so a finger leaves no grey behind. Pressed and focus states are unchanged; a test checks every
  stylesheet of the editor.
- **Demo book: the printed sheet of pages 1–2 describes the animated key** (#179): rendered again from the demo's
  texts – it still spoke of the fixture's dragon stand-in. The other sheets had not changed.

## 1.36.2 – 2026-10-30

### Added
- **The tutorial shows the Stage panel's tap, variables and timeline** (#148, #88): chapter 4 of `/docs/tutorials/` has a
  section *Tap, variables and the timeline* with a new screenshot – a target tapped from the panel, a variable set by
  hand, the timeline with its times.

### Changed
- **The tutorial's key shots show the brass key** (#148): the key spread on the desktop, the phone and the tablet, and the
  door after the walk from the key, re-shot with the demo's animated key instead of the dragon; the post-processing shots
  show the panel as it is now. Captions and alt texts follow.

### Fixed
- **Selecting a model with an animation clip broke the Entity panel** (#148): the timeline's first look inside its
  effect read and wrote the same state, so selecting the demo's key ended in Svelte's *maximum update depth exceeded*
  and the error page. The timeline is now kept as a raw value and looked up untracked.
- **The Stage panel's timeline vanished in a short panel** (#148): in the phone's sheet the list of events was squeezed
  to no height under *events*; it keeps its height now and scrolls in itself.
- **Wrapping rows in *vars and events* keep their label on the first line** (#148): *tap*, a variable and *set* no longer
  centre the label across two or three lines of controls, and the timeline's times line up with the label column.
- **Pass rows keep their words with the changed dot** (#148): the post-processing rows are indented less, so
  *● saturation* and *● threshold* are no longer cut off.

## 1.36.1 – 2026-10-30

### Changed
- **Type-only imports, `verbatimModuleSyntax` on** (#176): every import that brings in only types says so
  (`import type`, or `type` on the name) in `engine/`, `shared/`, `client/`, `editor/` and `scripts/` – also
  the classes and enums a file uses only as types, so the bundles import exactly what they imported before. The flag
  is on in every TypeScript config (the reader's and its service worker's, the engine's, the editor's and its plugin
  API's, `scripts/`, `mcp/`); the editor's override is gone, and with it SvelteKit 3's `tsconfig_invalid` warning.
  Content schema 2.16 (the change touches `shared/`, RULES #10): nothing new in the content. No runtime change.

## 1.36.0 – 2026-10-30

### Added
- **The Stage panel taps, sets and keeps time** (#88): *vars and events* has a **tap** button per printed target – the
  reader's tap without aiming at the entity (its `onTap`, the `animation` component's `playOn: tap`, the event
  `targetTapped`), for a found target with AR content. The plugins' **variables** are editable in place, each with its
  scope and type (*false / true*, a number, a text) and × to delete it, and **set** adds one by name, scope, type and
  value – both written through the plugin API, so the plugins hear `varChanged` as from a plugin and a branch can be
  tested by hand. The events became a **timeline**: the time since the spread opened, the event and its payload, the
  last 100 kept, with **clear**. *reset* also empties the timeline and starts its clock again.
- **The demo book's key is a key** (#88): a 7 KB brass key with one animation clip, `rattle`, which the `animation`
  component plays on a tap – written as glTF by `editor/tools/key-model.mjs` (no Blender; a test checks the committed
  file is the script's). It replaces the dragon that stood in for it.
- The engine taps a target directly for editor tools: `SceneInspection.tap(targetId)`, the same path as the reader's
  tap after its hit test (no content schema or plugin API change).

## 1.35.2 – 2026-10-30

### Changed
- **The editor on SvelteKit 3** (#157, Dependabot 195 and 196): SvelteKit 3.1 with adapter-static 4, TypeScript 6,
  Svelte 5.57 and Vite 8.3; building the editor needs Node 22.17 or later (CI and the Docker image use the latest
  Node 22). SvelteKit's configuration moved from `svelte.config.js` into `editor/vite.config.ts`, `$lib` became `#lib`
  (package.json `imports`), links and static files go through `resolve()` / `asset()` instead of `base`, and
  `editor/tsconfig.json` extends `$app/tsconfig`. The `cookie` override is gone – SvelteKit 3 brings cookie 2. The
  editor works as before: same routes under `/editor/`, same `index.html` fallback, no version polling.

## 1.35.1 – 2026-10-30

### Added
- **The tutorial page brings a book in** (#95): `/docs/tutorials/` has a new chapter, *Bringing a book in* – the empty
  instance, the three ways in (the CDN with its book id, a URL – a `game.config.json` or a content base like `…/demo` –
  and a file), what the assets base is, how to see what is on the CDN (`latest.json`, `versions.json`,
  `<build>/game.config.json`, `osct content status`; staging's out-of-date `versions.json`) and what to do when the media
  is missing. Four screenshots of the import form.
- **The tutorial page tours the editor's tools**: a chapter *The editor's tools* with a screenshot each – one selection
  across tree, stage and inspector with the breadcrumb (#162), dragging nodes, *add as* and names (#163), the Library as
  the picker (#164), the new target's two choices (#165), adding and removing spreads (#166), the book's post-processing
  and a spread's own (#149), words as parameter labels (#173), the editor on a phone – the sheet's drag, the icon tabs,
  ‹ › on the stage (#155, #171) – and on a tablet (#172).

### Changed
- **The demo book's screenshots are new** (#148): all ten shots of the chapter (now chapter 3) show the editor of 1.35 –
  square corners, the breadcrumb, words as labels, the phone's sheet head – and no longer a local test target. Captions
  and texts follow (the dot on an unsaved row, the phone's ‹ › on the stage, seven plugins).
- **The editor's empty Books page says how to import** (#95): *No book yet. Import one with Import a book: the CDN, a URL
  or a file.* with a link to the tutorial's chapter.

## 1.35.0 – 2026-10-30

### Added
- **Words as labels in the Entity panel** (#173, content schema 2.15, plugin API 1.3): a parameter spec may carry a
  `label` – the few words its row shows (1–24 characters). The built-in component (*plays on*, *stops on* …), the chroma
  key (*key color*, *compare by*, *soft edge* …) and the light (*cone angle*, *soft edge* …) have them; a parameter
  without one shows its name split into words (`degreesPerSecond` → *degrees per second*), also in the Stage panel's
  passes. The Info view names a row by its words and the content's name (*speed · degreesPerSecond*). The demo's
  `spin` plugin labels its speed. In the content a label only appears in a plugin's recorded specs (`registered`),
  which a 2.14 app ignores; a plugin built against 1.3 loads in any 1.x app.

### Changed
- **Touch control height** (#171): with a finger (`pointer: coarse`) every control of the editor is 2.75rem (44 px –
  the Scutoons dogma's touch height) instead of 1.75rem, and the top bar grows with it; the tree's rows, chevrons and
  eyes, the Library's actions, the video's play button and the target switch too; the origin square's points are
  finger-sized cells. On a phone the sheet's head is the six tab icons alone, sharing its width: ‹ › moved to the
  stage's lower corners, and the top bar's book link leads back to the spreads (no × in the sheet). The stage's
  toolbar wraps as whole groups (gizmo, pick, shading).
- **Tablet in portrait** (#172): below 64rem (1024 px) the tree starts collapsed until it is opened on the device, so
  at 768 px the panel keeps its 25rem and the stage over 20rem. A panel too narrow for the tab words (24rem, 28rem
  with a finger) shows the tabs as icons, so its head stays one line; in a narrow panel the position, rotation and
  scale rows put their label above the X / Y / Z fields, so `-180°` shows beside the reset arrow.

## 1.34.0 – 2026-10-30

### Added
- **The plugins' specs in the configuration** (#90, content schema 2.14): the content build writes what each plugin
  registered – its components and layers, node types and passes with their parameters – into the configuration's
  plugin list (`registered`, optional; the engine ignores it). The reader's check now checks a plugin component's or
  node type's parameters like a built-in one's and refuses a type no plugin of the book registers; the editor's Entity
  panel shows a plugin component's or node type's rows, and **+ node** its node types, before the plugin ran.
- **MCP tools for spreads, the book's passes and the environment** (#174): `add_spread` (a double page, the front or
  the back cover), `put_spread` (title, format, the spread's own passes), `delete_spread` (an empty spread),
  `put_book_passes` and `put_environment` – each checked against the content contract and answering with the editor's
  link. `describe_content_model` lists the passes, the environment and node names, and with a book the components, node
  types and passes its plugins recorded, with their parameters.

### Changed
- **The editor's API tells a typo from a plugin's node type** (#90): in a book whose plugins recorded what they
  register, a save or an import with a node type none of them registers is refused (400, naming the plugins' node
  types), and a publish with a component or node type none of them registers is refused too (409). While a plugin of the
  book is unknown – a source in the Code tab, or a plugin of an older build – any name like a plugin's passes, as before.
- **The MCP server accepts a plugin's node type** (#90): one the book's plugins recorded or a Code tab source registers
  (`registerNodeType`), its parameters checked; a name no known plugin registers passes with a warning while a plugin of
  the book is unknown, and is refused once every plugin is known.

## 1.33.0 – 2026-10-30

### Added
- **Post-processing for the whole book** (#149): the editor edits the book's passes – the master every spread shows –
  in the Stage panel's *post-processing* section. A spread *uses the book's* by default; *own* gives it an override
  that starts as a copy of the book's, choosing *the book's* again removes it, and the panel says which one is in
  effect. Save writes the book's list (new `PUT /editor/books/{id}/passes`) and / or the spread's. No content schema
  change: `book.passes` has been part of the contract since 2.5.

### Changed
- **The look-around world and its sky go through the passes** (#149): while passes run, the world around the reader,
  its sky and the onion sky are drawn into the post chain's image under the AR layer, so bloom, vignette and a grade
  with `reach: all` reach them – on the phone and on the editor's stage; a grade with `reach: ar` stays on the AR layer.
  Without passes nothing changes (the world is drawn straight onto the screen, no extra cost), and the AR layer's mask
  is only drawn while a pass uses it.

## 1.32.0 – 2026-10-30

### Added
- **A plugin's own node type** (#77, plugin API 1.2, content schema 2.13): `api.registerNodeType(type, spec, build)` –
  the plugin builds the node's three.js object with `api.three` (points, a sprite, a line, a mesh of its own), the engine
  places it like every node, with its children, components and layers. The spec names the parameters (rows in the
  Entity panel, values in the node's `params` next to the placement) and the file its `src` takes (`glb`, `video`,
  `image` or none). The content build checks the nodes of a registered type (parameters, file) and refuses a type no
  plugin registers; the guard checks a registered type's parameters and lets one pass quietly while plugins are
  declared; the editor's API accepts such a type in a book with plugins and a publish without compiled plugins refuses
  it (409 `unknown-node-types`). In the editor, **+ node** lists the book's node types under *plugins* once they are
  loaded or Run, with their Library file and parameter rows; the tree shows them with the code icon. The type stubs
  (`plugin-api.d.ts`) and `docs/plugins.md` cover it; the demo book's new `sparkle` plugin puts a twinkling sparkle of
  points into the twins' shared entity.

## 1.31.0 – 2026-10-30

### Added
- **A video's size and duration are recorded on upload** (#91): the editor's API reads an mp4 / mov's or webm / mkv's
  header – no ffmpeg, only the few bytes that hold them – and keeps the picture's width and height and the duration
  with the asset, as it already did for an image's size. The asset list and an asset's usages answer them
  (`durationMs`); files uploaded before stay without until they are replaced.
- **The Library shows a video's duration** on its card, and **+ node** starts a portrait video scaled so it stays
  within the target's width.
- **The MCP server's** asset tools tell an agent about the new numbers, so it can size a video plane and time an
  animation without opening the file.

## 1.30.0 – 2026-10-30

### Fixed
- **The editor's UI review** (#170, every page at 360, 768 and 1280 px against RULES #32): square corners
  (`--control-radius: 0`); muted text readable (5.3:1 on white, was 3.9:1); one focus ring in the text colour for every
  control instead of the browser's; the panel's tab row on one line at 1280 px (default panel width 25rem); rows in the
  phone's sheet no longer squeezed (the origin square overlapped the desk row); three-digit values beside the reset
  arrow in the X / Y / Z fields (`180°` showed as `1`); words instead of a plus icon for *add* (node) and *new*
  (plugin); section heads `component · spin` / `filter 1 · chroma` instead of `components[0] spin`; the Library
  picker names *the root node*; explanations moved from panel text to help (new target's placement, the Code tab's
  notice); the books page shows two covers a row on a phone and square badges; the admin page labels each value on a
  phone and its filter is a segmented group; a disabled tree menu item has the not-allowed cursor. Larger findings:
  #171 (phone tap targets), #172 (768 px tablet layout), #173 (words as parameter labels).

## 1.29.1 – 2026-10-30

### Fixed
- **The page router no longer leaks a store listener** (#28): it subscribed with one function and unsubscribed with
  another, so every disconnect left a whole-store listener behind. It now follows the route only, and a route set
  before it connected is shown at once.
- **`osct content` refuses options it does not know**: a misspelt `--dry-run` (`--dryrun`) was ignored, so a purge or
  sync ran for real. An option that needs a value and has none (`--keep`, `--env` at the end) is an error too, and so is
  an empty number (`--keep ""` meant keep 0).
- **The delivery import**: an entry whose `page` is not a number made every spread id `s008-NaN`; it is reported and
  left out now. A title that YAML reads as a number (`title: 2026`) no longer crashes the import.
- **The dev overlay's QR generator** no longer throws on the first spread when its QR library is not loaded.

### Changed
- **Data from outside is checked, not assumed** (#28): the account API's answers (`ApiService.requestAs`; a wrong shape
  is a `server-error`), the stored session, pending sign-in and sync state, the trigger protocol file, the CDN storage
  listing, the delivery mapping, the schema lock and the game configuration the sync uploads. The content build reads
  YAML as `unknown` and types each file from the authoring schema (no `any`); a `List` field must hold texts. Non-null
  assertions and `as unknown as` gave way to checks in the AR scene, the tracker, the tutorial and the router. The
  fixture and demo books build the same configuration as before.

### Added
- **Tests** (#29): `GameStore`, `SpreadManager`, `ApiService` (offline, 204, error codes, unreadable bodies),
  `pages-router`, more of `error-page`, `GraphicsService`, the trigger protocol reader; in `scripts/` the
  `StorageClient` (retry on 5xx and lost connections, never on 4xx), the CLI arguments, the content validator, the
  mapping reader, the schema lock, and the sync and purge against a storage zone in memory. The scripts tests remove
  their temp folders.

## 1.29.0 – 2026-10-30

### Added
- **Add and remove spreads in the editor** (#166): the book page has **+ double page** (after the last one, before the
  back cover) and, on each card, **+ after** and **remove**. A new double page takes the two pages after the spread
  before it and numbers every later page on by two – the later spreads, the entries on those pages and their targets'
  printed page move with them. Removing an empty spread numbers the later pages back; a spread with entries, or the
  one the book opens on, is not removed (the button is disabled and says why). The API: `POST …/spreads { format:
  "spread", after? }` and `DELETE …/spreads/{id}` (docs/server.md "Spreads made in the editor").

### Changed
- **Disabled controls look disabled** in the whole editor: dimmed, a not-allowed cursor, a select without its arrow –
  the spread format select on a double page no longer looks broken. The reason stays in the Info view.

## 1.28.0 – 2026-10-30

### Added
- **The Library is the picker of every file** (#164): a target's printed image, a node's file (video, image, model),
  a new node's file, the new-target form's files and the environment's world and sky each have *Library…* next to
  *Upload…*. It opens the Library in place as a picker: the filter starts at the kind being picked, a click on a card
  (or *Pick*) takes the file for that one field and returns, an upload that fits is taken at once, *cancel* or Esc
  return without one. The panel underneath keeps its values (a half-filled new target, the selected node).
- **A "target image" filter** next to images: the pictures printed in the book (a target's image in the draft, or the
  import's `target.*` of an entry); "image" lists the other images.

### Changed
- **The new target form tells its two choices apart** (#165): *What appears on the page* (none, model, video, image,
  text, group, light – pills, so the 3D model is in sight) with its file, then the *Entry category* (where the reader's
  consultation menu lists the entry). The category follows what appears – a video makes a Videos entry, everything
  else a glossary term – until it is set by hand.
- The file fields show the file by where it belongs (`p015-1 · target`), pictures with a preview; the dropdowns of
  file names ("Target Image, Target Image, …") are gone from the new-target form and the Entity panel's *+ node*.
- File uploads offer only the kinds the field takes (a model: `.glb`, `.gltf` and their media types).

### Fixed
- **The Library opened from a node changed the target's image** (#164): it fills only the field it was opened for.
- The Library tab's *Use* reached no node: the Entity panel was closed while the Library showed. It opens first now.

## 1.27.1 – 2026-10-30

### Added
- **A local MariaDB for the API** (#168): `docker compose up -d db` starts MariaDB 10.11 (the version of staging's host)
  with the schema; `config.local.php.example` carries its settings. This is now the recommended local setup – SQLite
  stays for quick tests (docs/server.md "Local development").
- **Staging's data locally**: `scripts/db/pull-staging.sh` dumps staging's database (credentials in the git-ignored
  `server/.env`, directly or over SSH), loads it into the local MariaDB, replaces the readers' addresses with
  placeholders, removes passwords and sessions, and migrates it to the checkout's schema. The dump is deleted unless
  kept with `--keep` (then in the git-ignored `server/db-dumps/`).
- **The API test runs against MariaDB too**: `OSCT_TEST_DB=mysql php server/tests/api-test.php` gives every API of the
  test a new database and drops them at the end; CI runs it as "Accounts API (MariaDB)" next to the SQLite run.

### Fixed
- **The admin page's user search works on staging**: the search wrote `LIKE … ESCAPE '\'`, which MySQL reads as an
  unterminated string (a 500 on every search with text). The same pattern broke an asset's usages in the editor (the
  usage list, deleting and replacing an asset). Both now escape with `!`, which works on MySQL and SQLite; the first
  MariaDB run of the API test found it, and the test now also scans for it.

## 1.27.0 – 2026-10-30

### Added
- **One selection in the editor, at its level** (#162): a target, its entity or a node, shared by the tree, the stage
  and the Entity panel. The tree's selected row has its own grey and a bar at its start, the rows above a selected
  node are marked, the hovered row is lighter; a selected target is outlined on the stage (the orange of a selected
  node, around its printed image). The Entity panel opens at the selected level – a target shows its target fields,
  an entity or node that node – and its head is a breadcrumb (*target › entity › group › node*) that steps up.
- **The tree's hierarchy can be changed** (#163): drag a node onto a row (its child) or between two rows (its
  sibling, the order set); with a finger by its icon. Keys: Alt + ↑ ↓ move, Tab / Shift + Tab indent / outdent; the
  row's menu has the same. **+ node** places the new node *next to* the selected one (the default for a model, video
  or image) or *inside* it; next to the root both go into a new group.
- **Nodes have names** (content schema 2.12, optional `name`): the Entity panel's *name* row, the tree shows the name
  and keeps the type as its icon. The content build, the guard and the editor API accept it; old content stays valid.

### Changed
- The tree's ↑ ↓ walk every row (targets and nodes), not only the targets; ← on a node steps up a level.

## 1.26.8 – 2026-10-30

### Added
- **The tutorial page walks through the demo book** (#148): `/docs/tutorials/` has a second chapter, *The demo book*,
  with ten screenshots from the editor (WebP, under `/docs/tutorials/demo/`, 433 KB together). It covers getting the
  demo in (import by URL, the staging reader with `?content=`, publishing only to `local`), the six spreads with
  their node types and components, the story across the pages played in the editor (*Replay the first find*, the
  variables and events), how a component's `params` become Entity panel rows (the `door` component in the Code
  tab, Run vs Save), a pitfall (`lamp` on the door, *Back to the draft*), post-processing, the environment and sky,
  the shading modes and the editor on a phone. A table of contents at the top links both chapters.

### Fixed
- **The tutorial page no longer scrolls sideways on a phone**: long URLs in code and table cells wrap.

## 1.26.7 – 2026-10-30

### Fixed
- **Create target works on staging** (#161): the API found the page's spread with one named SQL parameter used twice.
  MySQL with native prepares refuses that (a 500 on every new target); SQLite, locally and in the API test, allows it.
  Each parameter is used once now, and the API test checks every query for a repeated name.
- **The import form no longer suggests `https://<instance>:5174/src/game.config.json`**: that is the reader's dev
  server, so it is prefilled only on localhost. On an instance the fields start empty and "the CDN" is selected.

## 1.26.6 – 2026-10-30

### Fixed
- **The editor survives a deploy under an open tab** (#160): a code file that fails to load (Vite's `vite:preloadError`,
  e.g. Monaco for the Code tab) reloads the page once – at most once every 10 s, so a deploy still uploading shows its
  error instead of a reload loop. Tilman saw "the package could not be loaded" right after the 1.26.5 deploy.
- **The FTPS upload sends the HTML pages and the service worker last**: lftp uploaded in parallel and in no order, so
  a new page could name code files that were not on the server yet.

## 1.26.5 – 2026-10-30

### Fixed
- **The panel sheet can be dragged with a finger at all** (follow-up to #155): a touch is captured by the element it
  starts on (the grip, a tab). When the drag took the capture for the head, that element lost it, and its
  `lostpointercapture` bubbled up to the head, where it ended the drag – after its first step, so a touch drag never
  moved the sheet (a mouse has no such capture, so it worked on a desktop and in the tests). The head now ignores a
  lost capture of its children. Checked on the S22 over the DevTools protocol: the sheet follows the finger, the stage
  stays put, and on release the sheet snaps and the stage resizes once.

## 1.26.4 – 2026-10-30

### Fixed
- **The panel sheet on a phone drags smoothly** (follow-up to #155): while it is dragged, the stage keeps its size and
  the sheet slides over it; the 3D stage resizes once, on release. The grip is finger-sized (1.5rem), so a drag that
  starts just above the tab row no longer lands on the stage and orbits the camera at the same time.
- **No blank frame when the stage resizes**: the engine draws right after a resize, also while its loop runs – the
  browser clears a resized canvas, and the next paint showed it empty (the flicker while a panel or the window was
  resized; the reader on rotation too).
- **A spread change no longer makes the stage jump** (#105): the editor's camera looks at the spread's root (the
  spine's middle, the cover's middle) plus the author's pan, never at the first target – which differed per spread and
  was missing until the targets arrived, so the camera jumped twice.

### Changed
- **The sheet's tabs are icons on a phone**, on one line (Tilman: "Mobile bitte die tabs auch mit icons statt text"):
  tree, stage, entity, environment, library, code; the name is the label and the tooltip. A desktop keeps the words.

## 1.26.3 – 2026-10-30

### Changed
- **The editor's Library and book page follow the width, from a phone up** (#159): the Library's list turns into stacked
  rows when its panel is narrow (name and kind on one line, place, size and uses below, a tap opens the actions), and it
  answers the panel's own width, so this also holds when the panel is dragged small on a desktop. On the book page the
  spreads grid adds or drops a pair of pages as the window widens instead of jumping between fixed column counts; a
  double page never splits. The cards' captions wrap (the title up to two lines, the whole of it in its tooltip), and
  the page leaves room below the last row for the Info dock.
- The panels on the spread page answer their own width: section heads wrap their controls, and the Entity tab's target
  picker takes the whole line in a narrow panel.

## 1.26.2 – 2026-10-30

### Fixed
- **The editor's Code tab no longer ships a DOMPurify with critical XSS advisories** (#158): Monaco carries its own copy
  of DOMPurify 3.4.15 and imports it by a relative path. An npm override lifts the package to 3.4.17, and a Vite alias
  sends Monaco's import to that package, so the fixed version is what lands in the editor build (checked in the built
  chunks). `npm audit` in `editor/` has no critical or high left.

## 1.26.1 – 2026-10-30

### Fixed
- **Dependabot: `cookie` 0.7 in the editor** (#156): an npm `overrides` entry lifts SvelteKit's `cookie` from 0.6.0 to
  0.7.2 (out-of-bounds characters in cookie name, path and domain). Build tooling only – the editor is a static SPA
  and ships no SvelteKit server code. SvelteKit 3.0 (the fix for the two SvelteKit alerts) needs a migration of its
  own: the config moves out of `svelte.config.js`, `base` leaves `$app/paths`, TypeScript 6 and Node 22.17. deepmerge
  (editor via vite-plugin-svelte, client via vite-plugin-pwa → workbox-build) has no fixed version and stays.

## 1.26.0 – 2026-10-30

### Added
- **The editor's panel sheet is dragged on a phone** (#155): drag the tab row (or the grip above it) up or down to make
  the panel any height, from the tab row alone to almost the full screen; let go, it snaps to closed, a third, half or
  almost full, and a flick carries it on. The stage resizes with it. A tap on a tab still opens or closes the panel.
  The height is remembered in this browser; a double tap on the grip restores half. The grip also moves with ↑ ↓.

### Changed
- **The columns on a tablet**: with a finger the edges between the columns are easier to catch, and the panel can be
  narrower (16rem instead of 18rem) while the stage keeps at least 16rem – a 768 px tablet in portrait still shows a
  usable stage next to the tree and the panel.
- **The panel's tab row wraps** instead of running off the side on a narrow screen.

## 1.25.1 – 2026-10-30

### Changed
- **Ready for the shared Building Fictions server** (#6): each destination's database is only on its own internal
  network (`osct`, `osct-staging`), which the app joins next to `kamal` – staging, production and the server's other
  apps cannot reach each other's databases. The app and database containers have fixed memory and CPU limits.
  The networks are created once per server (docs/deploy.md "Setting up a server").
- **The deploy checks the server's host key**: the GitHub environment variable `SSH_KNOWN_HOSTS` holds it, and the
  deploy stops without it – instead of trusting whatever key the server answers with at deploy time.

## 1.25.0 – 2026-10-30

### Added
- **The demo book has pages** (#153): `scripts/layout/render-layout.py` draws a book's sheets from its content – white
  paper, the spread's title in the gold gradient, the entries' text, page numbers, the covers with title and author –
  for a book without designed PDFs. The demo's sheets are in `fixtures/demo/layout/`, so its spread cards and the stage
  show real pages instead of blank ones.

### Changed
- **The editor's books page is split in two** (#153): the books on the left as their covers, large; the import form
  always open on the right, its explanations in the Info view. A book shows its title, author and where it is live –
  no more build ids and dates. A book without a layout gets a typographic cover.
- **Spread cards show each target where it is printed**: a target's own `print` is laid over the sheet, so a print
  moved in the editor shows on the book page at once.

## 1.24.2 – 2026-10-30

### Fixed
- **The reader's service worker never shows its own page at `/editor`** (follow-up to #122): on a slow mobile network a
  page load that timed out fell through to the worker's offline fallback, the reader's app shell – under `/editor` an
  empty dark page (Tilman's phone on LTE). Editor pages are now excluded from the worker's page route, and its offline
  fallback answers an editor page with the network's own response instead of the reader's shell.

## 1.24.1 – 2026-10-30

### Added
- **`/admin` is the short address of the admin page**: the site's `.htaccess` redirects it to `/editor/admin/` (302).
  Carried over from the unmerged branch `feature/65-admin-roles` (1.10.0) before the branch cleanup after the history
  rewrite (#5, #30).

## 1.24.0 – 2026-10-30

### Added
- **The Code tab is a real code editor** (#76): Monaco, with syntax highlighting, completion as you type and type
  errors underlined – checked against the plugin API and three.js the way the content build checks a plugin. A hover
  shows a member's documentation; the colours follow the editor's day and night. It loads with the Code tab only.
- **Download** in the Code tab: the plugin's folder as a zip – `index.ts`, `plugin-api.d.ts` and a `tsconfig.json` – so
  a plugin type-checks the same way in any other editor (`import type { PluginApi } from "osct-plugin-api"`).
- `plugin-api.d.ts` is generated from the engine's plugin API by the editor build (`npm run plugin-api` in `editor/`);
  Checks fails when the checked-in file no longer matches the engine.

### Changed
- A Run's error is also marked on its line in the editor; Tab, Ctrl+Enter (Run) and Ctrl+S (Save) work as before.
- A new plugin starts typed (`import type { PluginApi } from "osct-plugin-api"`), so it passes the build's type check
  as it is.

## 1.23.0 – 2026-10-30

### Added
- **The workspace's columns can be resized** (#144): drag the edge between the stage and the panel, or between the tree
  and the stage, to make the column wider or narrower (the panel from 18rem to 70% of the window, the tree from 10rem
  to 40%; the stage always keeps room). The stage follows live. Each width is remembered in this browser; the Code tab
  has its own, wider width. A double-click on an edge restores the default; a focused edge also moves with ← →. The
  phone layout is unchanged.

### Changed
- The stage's view follows its container's size, not only the window's.

## 1.22.0 – 2026-10-30

### Added
- **Which book is live where** (#143): each environment (local, staging, production) serves exactly one book – the
  last one published there. The Books overview now shows under each book *live on staging · build … · since …* or
  *draft only*, and the book page shows it next to Publish.
- **Publishing over another book asks first**: publishing a book to an environment that serves another one names
  both and asks (production more strictly); the API refuses it without an explicit `replace: true`. Publishing the
  book an environment already serves stays one click. Switching back is publishing the real book again – its last
  version is re-activated without a new upload when the draft is unchanged.
- `latest.json` and `versions.json` name their book (`book`, content schema 2.11) – written by the editor's publish
  and by `osct content sync`; older manifests are read through their version's configuration.

## 1.21.0 – 2026-10-30

### Added
- **The environment is edited on the stage** (#79): the workspace has an **Environment** tab next to Stage and Entity.
  While it is open the stage shows the reader's own look-around pass – the world around the book, the window around it
  and the clear floor – under the desk and the book, turned by the view as a phone would turn it; *look up* raises the
  camera from the book to the horizon and the sky. Changes show at once; **Save** writes them to the draft.
- **The world and the sky are assets** (content schema 2.10): a glTF model (`worldSrc` – the scenery around the reader)
  and an equirectangular image (`skySrc` – the sky), picked in the Library (its new *World* / *Sky* buttons while the tab
  picks) or uploaded from the tab; the built-in café stays a choice and the fallback. In `book.yaml` they are paths below
  the content folder – the content build checks the file. The reader loads them only when a Graphics switch is on and
  draws them in the same single pass (the model is rendered once into a cube from the reader's eye).
- The Library counts a file the environment uses, refuses to delete it while it is used and relinks it on *Replace*.

### Changed
- The book page shows the environment as one line with a link to the stage instead of its own form.
- The reader's content check lets environment fields of later schema versions pass (the build and the editor's API stay
  strict), so the next additions load in this app.

### Fixed
- The world around the reader faded only on a pause: turning both Graphics switches off while scanning left it drawn.

## 1.20.8 – 2026-10-30

### Added
- **Info view in the editor** (#133): a collapsible box at the bottom of the tree column (on the book page at the
  bottom left), like Ableton's Info View – it shows the name and description of the control under the pointer or in
  focus, and remembers whether it is open. The explanations that filled the panels moved into it: the passes'
  descriptions, the stage's navigation (point at the stage), shake, grid, origin, desk and sky, the vars and events
  notes, the plugin editor's Run / Save note and the id rule, the placement note, the library's upload hint, the
  environment's note. Every control's tooltip shows there too.

### Changed
- **The Stage panel in collapsible sections** (#102): *spread*, *stage* (shake, grid, origin, desk, sky),
  *post-processing* and *vars and events* (closed by default) each have a header that opens and closes them; each
  section's state is remembered. The settings sit in one label / control grid, so the rows line up.
- **The spread's format** (spread, cover, back) is chosen in the Stage panel's *spread* section instead of the
  workspace's top bar (#133).
- **Nine origins** (#133): the origin is chosen with a 3 × 3 alignment square, like a design tool's anchor picker,
  instead of a row of five buttons – the four corners, the four edge centres and the centre (the book's centre on the
  open book, the page's centre on a cover). Positions and the grid count from all nine; the Info view says what the
  chosen point is.

### Fixed
- **Stage panel layout** (#133): the shake hint no longer overlaps the grid row, and the origin's choices no longer
  wrap over the desk row.
- **A new format shows at once** (#133): switching a spread between spread, cover and back left the book in its old
  shape on the stage until a reload. The stage now lays the book out again right away (`MockTracker.relayout`), and
  unplaced targets on a cover lie on the cover instead of a right page that is not there.
- **The events list** logs a scene state once per change instead of repeating `sceneState: "running"`, and long
  events wrap instead of scrolling sideways.

## 1.20.7 – 2026-10-30

### Added
- **The grade reaches the whole picture** (#136, content schema 2.9): the built-in `grade` pass has a parameter
  `reach` – `ar` (the default, as before: the AR layer alone) or `all`: in the editor the desk is graded too, on the
  phone the camera picture. The camera picture lies in the 8th Wall engine's own canvas under the AR canvas, so the
  engine's camera renderer draws it with a shader of the same grade (`cameraGradeShader`). The editor's pass rows
  show a choice parameter as a segmented control (*AR layer / whole picture*). The guard ignores a pass parameter it
  does not know from now on (a newer MINOR's); the build and the API still refuse it.

## 1.20.6 – 2026-10-30

### Fixed
- **The editor's panels no longer move the stage** (#131): clicks, drags and the mouse wheel in the top bar, the right panel
  (Stage, Entity, Library, Code), the spread list on the left, the stage's toolbar and its menus orbited or zoomed the
  3D stage. A drag or wheel now moves the stage only when it starts on the stage itself; a drag that starts there keeps
  orbiting when the pointer leaves it. The reader is unchanged.

## 1.20.5 – 2026-10-30

### Fixed
- **Wireframe and solid shading reach the stage's book and desk** (#137): the viewport's modes only changed the
  spread's entities, so the book and the desk stayed textured. They now switch too (not the ghost, the grid or the sky),
  everything the stage builds later gets the current mode, and the sheet and print images that arrive meanwhile go into
  the meshes' own materials (`ownMaterial`), never into the shared grey or wire one.

## 1.20.1 – 2026-10-30

### Changed
- **One top bar across the editor** (#129): the books list, a book's spreads, the spread view and the admin page
  share one bar – a breadcrumb `Books › book › spread` to move between them, the environment and Publish while a
  book is open, Admin, the e-mail and Sign out. In the spread view Publish moved from the foot of the panel into it,
  and the spread's name (`p. 12–13`, `Cover`) is shown there in full instead of squeezed between the panel's buttons.
- **A book's spreads use the full width** (#129): the grid fills the window instead of a centred column – one spread
  per row on a phone, up to six at 1920 px; the environment box above it has the same width.

## 1.19.4 – 2026-10-30

### Fixed
- **The board moves deployed issues again** (`board-status.yml`): the first run on `main` failed with
  `getOctokit is not defined` – `actions/github-script@v7` does not provide it. The project client is now built from the
  action's own Octokit class with `PROJECT_TOKEN`.

## 1.19.3 – 2026-10-30

### Fixed
- **The cover lines up with the spreads** (#115): with a column gap a double page was wider than two single pages, so
  the cover's sheet came out shorter. The gap is now half a gap of padding on each side of a card and none on a single
  page's gutter side – every sheet has the same height. On hover the page image's border is highlighted instead of the
  card's background.

## 1.19.2 – 2026-10-30

### Removed
- **The book content is no longer in the repository's tree** (#5, step 3 of `docs/content-out-of-git.md`): `content/` is
  untracked and ignored, the image no longer copies it (`Dockerfile`, `.dockerignore`), and CI no longer builds it (the
  test fixture stays). Every build needs `VITE_CONTENT_BASE_URL` (the environment's `CONTENT_BASE_URL`); the content source
  is `OSCT_CONTENT_DIR`. Prepares the history rewrite that removes the content and the old Claude attribution (#30).

## 1.19.1 – 2026-10-30

### Fixed
- **The spread cards keep a thin border around the page image** (#115): 1.17.4 removed it with the card's border;
  the card stays borderless, the image is framed again, and the grid's gap is 1rem in both directions.

## 1.19.0 – 2026-10-30

### Added
- **The Library tells its files apart** (#121): the import names every file `image.jpg`, `target.jpg` or `video.mp4`
  in a folder per entry, so a card now reads where the file belongs – `p015-1 · target` (`library-place.ts`) – and the
  search matches the entry, the role and the collection (`p015 target`). Videos show their first frame instead of the
  film icon and play muted and inline while hovered, or after a click on ▷ (a second click stops); they only load once
  they scroll into view. Every preview shows an animated skeleton until it has loaded (a still one with reduced motion).
- **A list view in the Library** (#121): *view* switches between the cards and a plain list – name, place, kind, size,
  uses; a click on a row opens its actions. The choice is remembered per browser.

### Fixed
- **Imported files no longer show 0 uses** (#121): below an assets base the list names a file by its CDN URL, but the
  book's rows name the content path (`/assets/content/…`) – `Assets::imported` now counts with that path.

## 1.18.2 – 2026-10-30

### Fixed
- **Editor images from the CDN** (#122): the reader's service worker (scope `/`) also handled the requests of the
  editor's pages at `/editor`, and its CDN rule broke some Library thumbnails in Firefox ("A ServiceWorker intercepted
  the request and encountered an unexpected error", "Image corrupt or truncated"). The worker now leaves editor pages
  and every request they make to the browser (`client/sw/editor-clients.ts`); a page it has not seen yet (after the
  browser restarted the worker) is looked up and its request goes straight to the network, uncached. The reader's
  offline behaviour is unchanged: its CDN rule still stores only complete `200` responses (no opaque or `206`).

## 1.18.1 – 2026-10-30

### Fixed
- **The admin page shows a granted role** (#99): a role that is on (and the active filter) never looked pressed –
  `.pill.framed` came after `.pill.on` in the editor's stylesheet and won with the same specificity, so a grant
  seemed to do nothing. A framed toggle that is on now shows pressed (`.pill.framed.on`, `.icon-button.framed.on`).
  The notice reports *Granted* / *Revoked* only when the role really changed (the API's `changed`), else that the
  user had the role already.
- **The update options on the admin page are plain text** (#99): the ones the user opted into (book, artist,
  publisher, else `–`) instead of `●` / `○` marks that looked like radio buttons.

## 1.18.0 – 2026-10-30

### Added
- **The editor's stage: sharp sheets, a grid and a settable origin** (#113): the designed pages were too soft close up.
  - `npm run layout` now also renders every sheet a second time, much sharper (`sheets/<sheet>@sharp.jpg`, 4096 px for a
    double page, `--sharp-width`, 0 = none). The stage shows the normal image at once and fetches the sharp one only when
    the camera comes within 50 cm of the page – a far view, the spread cards and spreads never looked at cost nothing.
    Run the layout import again to get the sharp images; without them nothing changes.
  - **Grid** (Stage panel): a grid over the page that is switched on and off, with its spacing in mm. Its lines run
    through the origin, which is drawn in red.
  - **Origin** (Stage panel): positions are read and entered from a corner of the base format (the page's top left, top
    right, bottom left or bottom right – per page) or from the book's centre (the spine's middle). It applies to the grid
    and to the x / y rows of a target's placement and of a new target; the axes keep running right and down, so a value
    left of or above the origin is negative. Saved positions stay as before (mm from the page's top left corner).

## 1.17.5 – 2026-10-30

### Fixed
- **The post-processing in the editor shows on the stage** (#114): changing a grade, a bloom or a vignette in the
  spread's panel changed nothing. The grade's and the vignette's live edit wrote to values the pass no longer drew with
  (three.js copies a shader's values when it builds a pass), and the bloom and vignette never reached the stage's desk,
  table and book. Now every pass shows at once: bloom and vignette run over the whole picture, the desk counting as
  the camera picture, and the grade stays on the AR layer (the desk keeps its colours, as the camera picture does).

## 1.17.4 – 2026-10-30

### Changed
- **The editor's spread cards** (#115): no border, and the page uses the full width instead of a centred column. One
  grid cell is one printed page: the cover is a single right-hand page (no taller or wider than one page of a spread)
  and the first cell of the first row stays empty, so 2–3, 4–5 … line up as spreads. The caption is one line (pages and
  title, the cover's name no longer shows twice), the counts are small icons with the numbers (entries, targets, with
  AR; titles for screen readers), and the format shows as a small label only when it is not a double page.

## 1.17.3 – 2026-10-30

### Fixed
- **The Library no longer fails with "Something went wrong on the server"** (#116): since 1.17.1 the asset list also
  lists the files of the CDN import, and it counted each file's uses with three queries over targets, entities and
  entries – a build with hundreds of files ran over a thousand queries. The rows are now read once per request
  (`Assets::usageRows`, `countUsages`), and a `files.json` entry that is not an object no longer breaks the list.

## 1.17.2 – 2026-10-30

### Changed
- **The stage's desks are 180 × 80 cm** (#109, Tilman): both the Eiermann and the Schöpfer desk have a 1800 × 800 mm top
  (they were 1.4 × 1.0 m). The models are regenerated by `editor/tools/desk-eiermann.py`. The Eiermann frame keeps its
  measured size, so its ends now sit well inside the longer top; the Schöpfer legs keep their place.

## 1.17.1 – 2026-10-30

### Fixed
- **The Library and the picker list the imported files** (#111, split from #95): the Library showed only the book's
  uploads, so the images, videos, models and sounds that came from the CDN import (`files.json`) were invisible there
  and in the asset picker (a node's file, a new target's content), although the stage uses them. `GET
  /editor/books/{id}/assets` now lists the imported files after the uploads (`imported: true`, id `import-<hash>`,
  their size from `files.json`, the number of uses; the `kind` filter applies to both). They are read-only: the Library
  card shows *imported* instead of Replace / Delete.

## 1.17.0 – 2026-10-30

### Added
- **The book's environment – content schema 2.8** (#79, Tilman: "Wir hatten im Reader das Environment und diese Himmel-Effekte.
  Dafür brauchen wir eine eigene UI"): `book.yaml` takes an optional `environment: { world, onionSky }` – the world around
  the reader while scanning (`cafe`, the only one) and the onion sky on or off. The engine reads it (`LookAround`); the
  reader's Graphics switches still apply on top, so the content cannot turn on what the reader has off. A book without
  it keeps today's look. The config guard and the build check it (`environmentProblems`), the server refuses an unknown
  world (`PUT /editor/books/{id}/environment`; `null` removes it), and the book page has an *Environment* block to set it.
  Not in this step: world assets, per-spread overrides, tuning values in the editor.

### Changed
- The schema lock is at 2.8 (a MINOR step over the plugin API 1.1's 2.7): older apps ignore the new field.

## 1.16.2 – 2026-10-29

### Fixed
- **Placement starts where the target is printed** (#101): opening "placement" on a target without a saved place moved the
  ghost to a fixed default (right page, x 40, y 60, 80 mm wide). It now starts at the target's place in the book's layout
  (`content/layout/`, the designed PDFs). Without a place in the layout the ghost stays where it is until the first
  change. The label says where the place comes from: the book's layout, or "not in the book's layout" when there is none.

## Editor 1.10.1 – 2026-10-29

### Changed
- **The mock stage's book cover is 1 mm thick and ends where the page block ends** (#106): the cover board was 2 mm with a
  3 mm overhang that framed the pages; now `COVER_THICKNESS` is 1 mm and `COVER_OVERHANG` 0, so the board lies flush under
  the block.
- **The cover's edge carries a paper texture** (#106): the board's four sides show fine paper fibre lines, drawn in code
  (`coverEdgeTexture()`, a seeded sequence) – no image file, so no licence to check. The page-edge geometry stays a separate change.

## 1.16.1 – 2026-10-30

### Fixed
- **The plugin API's `registerPass` is wired** (#97): a plugin registers its own post-processing pass with
  `api.registerPass(type, spec, factory)`, as the editor's docs and 1.12.0 already said. The pass belongs to the plugin
  and leaves the pass registry when the plugin is uninstalled; a type another plugin or the engine holds is refused.
  Not yet: the content build and the reader's guard accept only the built-in pass types, so a spread cannot name a
  plugin's pass until that is decided (#97).
## 1.16.0 – 2026-10-30

### Added
- **An MCP server over the editor's API** (#75, `mcp/`, [docs/mcp.md](mcp.md); Tilman: "wir brauchen eine MCP-Schnittstelle,
  dass wir dann beim Bauen in Amsterdam genügend schnell auch mit Claude Sachen bauen können" – "do it like in scutoons,
  important this will one day merge"). A Claude session works on a book as a signed-in editor: `whoami`, a sign-in by
  mail code (`sign_in_request` / `sign_in_verify`, or `OSCT_EDITOR_TOKEN` in the environment), the book's tree and a
  spread with every target's entity resolved, shared entities and targets (entity, image, printed place), new entries
  with their target, the library (upload a local file, list, delete), the Code tab's plugin sources, the draft, publish to
  `local` or `staging`, the publish and change logs, and `describe_content_model` – the content contract plus a book's
  declared plugins and Code tab sources. Built after SCUTOONS' MCP: the API is the only authority (over HTTP with the
  editor's token, the tools listed for the role `editor`), every entity goes through the shared guard before it is sent,
  every write answers with the editor's link where the person checks the draft on the stage, and **publishing to
  production stays with a person** – the tool refuses it. Claude Code sessions in this repository get the server from
  the root `.mcp.json`; resources `osct://rules/content-model` and `osct://guides/plugins`, prompts `editor` and
  `add-target`. Tests: a mocked fetch per tool and the server over stdio against the PHP API end to end; CI job *MCP
  server*. The version check covers `mcp/package.json` (RULES #10, #23).

## 1.15.0 – 2026-10-30

### Added
- **The demo book** (#80, Tilman: "ein Beispiel, das einmal versucht, alle Möglichkeiten, die der Editor gerade kann,
  zu simulieren – auch mit diversen Game-Narrativen und Interaktionen, mit der Buch-API … call it demo"): a sandbox
  book `fixtures/demo/` next to the test fixture, built with `OSCT_CONTENT_DIR=fixtures/demo` – six spreads with every
  node type, placement, filter and component, the covers, a shared entity, `print` on every target, entries of every
  category, and six plugins that together use every part of the plugin API: `tint` and `pulse` (layers), `spin`,
  `scenes` (a tap shows the next child), `narrative` (the key found on page 1 opens the door on page 3, the lamp
  lights when the door opened) and `tally` (a text the book writes from the progress). The assets are the fixture's
  stand-ins. `DEMO.md` marks a demo build: `osct content sync` uploads it to the environment `demo` only, and the
  workflow *Demo book* (`demo.yml`) builds and syncs it from `develop`. The decision and the gaps the demo found:
  `agents/research/2026-10-30-demo-book.md`; the guide: docs/plugins.md "The demo book".
- **Plugin API 1.1 – across nodes and pages**: `api.events` (the engine's core events `targetFound`, `targetLost`,
  `targetUnlocked`, `targetTapped`, `spreadChanged`, `sceneState`, `varChanged` to listen to; scene events of the book's
  own to emit and hear – one bus, a plugin's listeners go with it), `api.vars` (variables in the scopes `spread`,
  `stage`, `session`, `book` with the concept's outward lookup; `book` persisted with the reader's progress),
  `api.progress` (read-only: `unlocked`, `consulted`, `completion`, `counts` – the reader passes an adapter over its
  history through `ArSceneOptions.progress`, the editor its simulation), `api.spread` (the current spread), the
  component context's `children` and the hook `onUnlocked` (`engine/src/scene/plugin-runtime.ts`). The progress
  record keeps the book variables (`variables`, additive within format 1; merged with this device's values winning).
  Content schema **2.7** (the API version a declared plugin carries; 2.5 are the passes, 2.6 the light nodes).
- **The editor**: the Stage panel's **vars** and **events** rows (the plugins' variables with their scopes, the last
  events of the stage) and **reset** (a new game); *Import a book… → URL* takes a **content base URL** (a CDN folder
  with `latest.json`, e.g. `…/demo`) and imports its current version; the Entity panel's rows follow the plugins the
  engine loads with a spread (before, a declared plugin's component showed its rows only after a Run).
- **The reader on a debug build** takes `?content=<base url>` and keeps it for the tab: the staging reader opens the
  demo with `?content=https://buildingfictions.b-cdn.net/demo`; production builds ignore it (docs/content-cdn.md).
## 1.13.0 – 2026-10-29

### Added
- **Light nodes – content schema 2.6** (#71, Tilman: "one entity type is missing in the editor – lights"): the node
  type `light` – a point, spot or directional light an author places like any node (own `params`, children allowed;
  under a group or a model it moves with it), its values under `light:` (`kind`, `color`, `intensity`, `distance`,
  `decay`, the spot's `angle` and `penumbra`), defined once in `shared/types/lights.ts`; spot and sun aim along the
  node's −z, by default a light sits half a unit along its parent's +z pointing back at it. Intensity and distance
  are in the node's units, whatever the target's printed size (the engine scales them to the world every frame).
  The engine builds and disposes it (no shadows), the reveal and the outro fade it with the entity. In the editor **+ node** offers `light`,
  the Entity panel shows its rows from the definition (no panel code per field), the tree shows a light icon and the
  kind, the gizmo moves it and the stage draws a Blender-style helper (bulb, cone or rays; orange while selected;
  never in the reader). The content build, the guard and the editor's API check the values; the fixture's Studio A
  has a spot aimed at the tree of nodes and a point light under the tall tree. **Schema 2.6** (a MINOR step, as the
  editor session asked): a 2.5 app's guard refuses a node type it does not know, so it shows "invalid configuration"
  on a book with a light where "update the app" would be right – no deployed reader is on 2.x. From 2.6 on the guard
  lets an unknown node type pass (the engine renders nothing for it, keeps its children), so every later node type is
  a MINOR step too; the app reads every older MAJOR as it is (`OLDEST_READABLE_SCHEMA_MAJOR`).

## 1.12.0 – 2026-10-29

### Added
- **Post-processing passes** (#72, Tilman: "post processing, which we could just delegate to code editor"): content
  schema 2.5 – a spread (or the book, as the default for every spread) names `passes: [{ type, …parameters }]` over
  the rendered AR image: the built-in **bloom**, **vignette** and **grade**, each defined once with its parameters
  (`shared/types/passes.ts`), checked by the build and the guard. The engine runs them in one chain over its single
  renderer (the scene into a buffer, the passes, the result over the camera picture with its alpha kept – a bloom adds
  light to the camera picture, a vignette darkens it, a grade touches the AR layer only), built only while a spread
  names passes, disposed on a spread switch, nothing rendered twice without one. A pass of the book's own registers
  with the engine's pass registry (`registerPass(type, spec, factory)`, `engine/src/scene/post/`), the hook the
  code editor's plugin API (#66) exposes as `api.registerPass`. The editor's Stage panel lists the spread's passes
  with their rows, live on the stage under *rendered* (the mock stage's table, book and sky lie on a backdrop layer
  under the passes, as the camera picture does), Save writes them (`PUT …/spreads/{id} { passes }`). The fixture's
  Studio B carries a bloom.

## 1.11.0 – 2026-10-29

### Added
- **Code in the editor – the book's own code as plugins** (#66, Tilman: "wo kann ich meine eigenen JS-Skripte im
  Editor ansetzen, also Shader hinzufügen? … wie hatte das Niantic Studio gemacht? Das war mega"; the decision:
  `agents/research/2026-10-29-code-in-the-editor.md`). A plugin is a folder `plugins/<id>/index.ts` of the content
  source that exports `register(api)`: the **content build** type-checks it against the plugin API (the engine's own
  types), bundles it with esbuild into `plugin.js` next to its source, runs it once to learn the components and
  layers it registers (so the nodes that use them are checked like `animation`) and declares it in the configuration
  (`plugins: [{ id, src, api }]`, **content schema 2.4**); the reader loads the declared plugins with the first spread.
  The **plugin API 1.0** (`engine/src/scene/plugins.ts`): `api.three` (the app's three.js), `registerComponent(type,
  spec, apply)` – code on a node with the context `{ node, params, object, placed, target, three }` and the hooks
  update / onFound / onLost / onTap / onPause / dispose / tune – and `registerLayer(type, spec, { glsl })` – a
  **material layer**, GLSL composed into the node's material after its own shading (plain planes through
  `onBeforeCompile`, the chroma key's shader patched; a model's materials as patched clones; kept under the unlock
  animation's dissolve). Both use the component specs of `shared/types/components.ts`, which became a registry
  (`componentSpec`, `componentTypes`): a plugin's component or layer shows in the Entity panel with its rows and
  **+ type** without panel code, and is used in the content like a component. The **Code** tab of the editor (the 5th
  tab): the plugins stored for the book (`plugins` table, `GET / PUT / DELETE /editor/books/{id}/plugins/{pid}`) and
  the ones the content declares (opening one reads its `index.ts` next to the compiled module), a plain code editor
  with a line gutter (Tab indents, Ctrl+Enter runs, Ctrl+S saves), **Run** transpiles in the browser (sucrase) and
  installs the module in the stage's registry so the effect shows at once, **Save** stores the source, errors
  inline with their line. Nothing run in the editor reaches readers: the configuration's `plugins` list has one
  writer (the content build), the import keeps it, and a publish whose nodes use a component no compiled plugin
  can provide is refused (409 `unknown-components`) – the build behind the publish is #78. The content build warns
  about a node with more than three layers. The fixture's `plugins/tint` (a tint layer with colour, opacity and
  blend on Studio B's standing video) is the template; [plugins](plugins.md) is the guide for writing one.

## 1.10.0 – 2026-10-29

### Added
- **Tutorial: the content workflow** (#61, Tilman: "eine Visualisierung, wie der Workflow Speichern, Sync, Publish ist,
  zum schnelleren Einstieg – auf einer Seite unter /docs/tutorials"): a static page shipped with the app at
  `/docs/tutorials/` – the three places (content folder, CDN, editor database) and the arrows between them (sync,
  import, save, publish, the reader), the seven steps to bring a book onto an instance, and the things to know
  (import replaces the draft, sync and publish both make versions).
- **Roles and the admin page** (#65, Tilman: "wir werden ein kleines Admin-UI brauchen", modelled on SCUTOONS' roles for the
  white-label core): the tables `roles` (reader / editor / admin, fixed ids) and `user_roles` (granted when, by whom);
  every account has `reader`, existing editors keep `editor` (the schema backfills on the next deploy), `GET /user`
  answers `roles`. The admin API (`/api/admin/*` – a signed-in admin, or the admin secret as the break-glass path):
  the users searched by e-mail with their roles, options and language, grant / revoke a role (`PUT` / `DELETE
  /admin/users/{id}/roles/{role}`), the newsletter list as CSV (`/admin/users.csv?newsletter=1` – the users with an
  update option on). The **admin page** at `/editor/admin` (docs/admin.md): search, the roles as toggles with their
  grant on hover, the editors and admins as filters, the Newsletter CSV button, an editor invited by e-mail. The
  first admins come from the deployment's `ADMINS` list (GitHub environment variable, both deploys), like `EDITORS`.
- **Content schema 2.0 – the entity as a tree of nodes** (#61, Tilman: "es können tiefere Hierarchien entstehen, das
  ist die ganze Idee; bei default erstmal eins"): an entity's node may hold `children`, each placed by its own
  `params` relative to its parent (8 levels at most); new node types `group` (holds children) and `text` (a line
  drawn on a plane, `text` + `color`, `{{entry.title}}` / `{{book.title}}` replaced); optional `id` per node. The
  engine builds the tree recursively (found / lost / pause / update / dispose and the live edit's `tune` reach every
  node; a type without a builder renders nothing but keeps its children), the content build reads `children` in
  `entry.yaml` and `entity.yaml` (`npm run schema:lock` → 2.0), the guard and the API check nodes recursively. The app
  reads schema **1.x content as it is** (a tree of one node), so nothing has to be rebuilt; the fixture's Studio A
  gained *Studio: tree of nodes*. In the editor the tree shows every node, the Entity panel edits the selected node,
  **+ node** adds a child (or a target's first node) from the book's files, **remove node** drops one. Components
  and plugins (the registries, code in the editor) stay phase 15 steps 3–4.
- **Sky, light and desk of the editor's stage** (#61, Tilman: "HDRI and sky sphere … as default"): six studio HDRIs
  from Poly Haven (CC0, 1k, `editor/static/hdri/`) as the stage's sky and environment light (the Stage panel's
  *sky*; turned with the stage every frame), the desk a screen-printed plywood board (Poly Haven's
  plywood texture, tinted), the cover a white 2 mm hardcover board.
- **Stage panel trimmed** (Tilman: "this whole section is doable in our current interface, but not needed – we have
  more intuitive options"): the view presets and the found chips are gone – orbit, pan, wheel and double tap move the
  camera, the tree's eye finds and loses a target; **Replay the first find** moved to the stage's right-click menu.
- **The sign-in limit says when** (Tilman: "das Stundenfenster aufheben – lokal sollte das nicht sein, und sonst
  muss der Cooldown in der UI stehen"): over the hourly limit the API answers with `retryAfter` and the minutes, the
  reader's account page and the editor's sign-in show "try again in N minutes" instead of "in an hour";
  a limit of -1 turns it off (`LOGIN_MAX_PER_*_HOUR`, `LOGIN_MAX_ATTEMPTS`, `PASSWORD_MAX_FAILS_PER_*` – the local
  example config; 0 allows nothing, #83).
- **The stage's toolbar as icons** (#61, Tilman: "replace the top editor bar with the icons for each, and for the
  four view types we can just use Blender's circles"): the pick modes are a parcel (entity), a point on the graph
  (node) and the crosshair (target); viewport shading is Blender's four spheres – wire, solid, textured, rendered –
  side by side; every button keeps its label as the tooltip.
- **Covers as spreads, the spread's format** (#61, #60, Tilman: "wie gehen wir mit Cover und Rückseite um? … es ist
  eh ein Spread, nur in einem anderen Format"): content schema 2.3 – a spread has a `format` (`spread`, `cover`,
  `back`; the covers are page 0 and the page after the last), a target's `print` takes the surfaces `front` / `back`,
  `print` is read from `entry.yaml`. The editor's stage draws the closed book for a cover spread (the layout's cover
  sheet on top, the block under it); the overview adds **+ cover** / **+ back cover**, the workspace bar sets a
  one-page spread's format; the new-target form and the placement rows offer the cover's surface; the reader's
  spread menu names the covers by their title. API: `POST …/spreads { format }`, `PUT …/spreads/{id} { title?,
  format? }`. Fixture: the spread `cover` with *Cover: seal*.
- **The stage's desk: an Eiermann table or Schöpfer's desk** (#68, Tilman: "the table should be an Eiermann … create a
  low-poly version we can use", both as options "like the HDRI picker" – the tool is for designers, they should feel
  at home): the Stage panel's *desk* chooses between a 1.4 × 1.0 m screen-printed plywood top, 18 mm thick with the
  plies showing on its cut edges, on a steel tube frame after Egon Eiermann's table frame (two end frames, cross
  tubes, two crossed diagonal struts; the default) and Philipp Camille Schöpfer's white desk (a thick top with three
  drawer cutouts in its front edge on four slender legs splayed outward), both 72 cm high – our own low-poly models
  (`editor/static/models/`, 236 and 124 triangles, no textures in the files) built from primitives by
  `editor/tools/desk-eiermann.py` in Blender, the Eiermann frame measured from a model Tilman supplied. The book, the
  printed images, the ghost and the page hits lie on the top as before; the desk keeps its own look under every
  shading mode. The backdrops *table*, *paper* and *photo* of the first editor build went with this (Tilman:
  "overhead, we won't need anymore – we got the HDRI and we got the table as default").
- **A live edit with a new file** (the library's *Use*, *+ node* with an uploaded model): the scene loads the files
  the spread's content does not have before it builds the node (before, such a node stayed invisible until Save).
- **Selection outline and viewport shading** (#61, Tilman: "selected targets aren't visible … something like in
  Blender"): the selected node wears an orange outline of its meshes' edges in its own space (a plane outlines as a
  plane – the axis-aligned box of before tilted), hover a white one; the toolbar's shading modes *wire / solid /
  textured / rendered* after Blender's, applied to the entities (the stage, gizmo and outlines keep their own
  materials), the HDRI's sky and light only while rendered.
- **Components and the timeline** (#61, phase 15 step 3, Tilman: "glb import should also show somehow a simple
  timeline, we do have start stop etc events"): content schema 2.2 – a node carries `components: [{ type, … }]`,
  defined once in `shared/types/components.ts` (specs with kind, default, range, the node types they apply to; the
  guard, the build and the editor read them). The first component is **`animation`** on a model: the clip, `playOn`
  found / tap / never, `stopOn` lost / never, loop, speed; without it every clip loops as before. The engine's entity
  instances gained `onTap` (the tap reaches the entity) and a `NodeTimeline` per model node (`IArScene.inspect()
  .nodeTimeline`); the Entity panel shows the component's rows, **+ animation**, and the **timeline** (clips, play /
  pause, a time slider that scrubs the model). The FTPS staging deploy ships the editor at `/editor`; both deploys
  use the CDN store as soon as the zone's key is set.
- **Assets, the library and new targets** (#61, Tilman: "Asset-Upload nach dem Scutoons-Modell … in the tree I want to
  be able to add a target"): uploaded files in the content store (`assets/<book>/<asset>/v<n>.<ext>`, local or bunny)
  with a registry (`assets`, `asset_versions`), `GET / POST /editor/books/{id}/assets`, replace with a new version and
  every use relinked, delete guarded by the usages, the same bytes once; the editor's **Library** tab (upload, drop,
  use for the selected node, as a target's image, replace, delete), the node's **file** row, the target's **image**
  and **print placement** (content schema 2.1 `print`: surface, x, y, width in mm – the stage lays a target there
  before the book's layout), **+ target** in the tree (an entry with its printed image and place –
  `POST /editor/books/{id}/entries`, `DELETE …/entries/{id}`), *Remove target* in the tree's menu; the new-target
  form takes the AR content too (a node of a type with its file, or a text). **Picking** on the stage by a pick mode
  (entity / node / printed target – Blender's select mode) with a right-click menu (add node, remove, placement,
  library, remove target; + target on the page), and a translucent **ghost** of the image while a placement is edited,
  with handles (drag to move, the corner for the width). **ScrubNumber follows the quadrant rule** (Tilman: up or
  right raises, down or left lowers, the directions add up); the panel is 22rem wide and the three axes of a placement
  row stay on one line.
  The sky of the stage is a sphere inside the stage group (three's background rotation mirrored axes).
- **Removing nodes** (#61, Tilman: "Wie lösche ich Knoten?"): Delete / Backspace on the selected node (tree or
  workspace), a right-click menu on the tree's node rows, *remove node* / *remove entity* in the Entity panel – all
  through the stage, so tree, panel and stage show one state; a removed root marks the target as without AR content
  until Save.
- **The gizmo** (#61, Tilman: "das Anklicken von Items auf der Bühne, wir brauchen dann die Achsen"): three.js
  `TransformControls` on the selected node of the editor's stage – move / rotate / scale (toolbar, W / E / R), handles
  in the node's own space so a drag edits the placement relative to the parent, Ctrl snaps (0.05 widths, 15°, 0.1),
  the Entity panel's rows follow live; hover draws a box around the entity under the pointer. The engine opens the
  running scene to editor tools with `IArScene.inspect()` (scene, camera, canvas, frame hook, a node's object by its
  path, the tap's hit test); the entity builder records every node's placement group by its path.
- **Editor API** (#61): the accounts API carries the editor's data under `/api/editor/*` for users with the new role
  `editor` (`POST /admin/editors { email }` with the admin secret gives it; `GET /user` shows it). A game configuration is
  imported into rows (books, spreads, entries, targets, entities – every field kept), read as a tree, edited entity by
  entity with a change log, served as a draft the engine loads like the CDN (`…/draft/latest.json`), and published as a
  content version – to the container's own content store (`GET /api/content/{env}/…`, environment `local`) or to the
  CDN's storage zone with the osct CLI's bookkeeping (`OSCT_CONTENT_STORE=bunny`), with a publish log. `docs/server.md`
  "Editor data".
- **The editor** (#61, the mock stage of #59): a SvelteKit app of its own at `/editor` (`editor/`, built into the image
  next to the reader) for an instance user with the role `editor`. It runs the engine over a simulated page instead of
  the camera – a table, the open book as an object (paper blocks whose thickness follows the number of spreads on a
  cover board with an overhang; every plane a hair under the one above it, so nothing flickers), the current spread's
  printed images where they are printed (the book's layout), by the trigger protocol or in a row – and every target
  counts as found, so models, videos and
  filters show with their reveal, unlock and outro exactly as in AR, on the desktop and on a phone, without a camera.
  Books are imported from a game configuration (the CDN's current version, a URL or a file); the spreads list shows
  each spread's sheet as its preview; the workspace has the
  **tree** of the spread at the left in the style of Blender's outliner (entries → targets → entities with type icons,
  guide lines, the eye column for found, keyboard navigation, a tap selects; collapsible, a tab on a phone), the **Stage** panel (view presets *reader / top / low / far*, drag to orbit, Shift-drag, middle button or two fingers
  to pan, wheel or pinch for the distance, found chips per target, replay of the first find, hand shake) and the **Entity** panel (placement with X, Y, Z in one row as in Blender, the chain icon
  linking the scale axes, filters, colours through the editor's colour popover – palette, recent colours, area + hue,
  hex, and an eyedropper that picks the colour under the pointer from the stage (`IArScene.sampleColor()`) – live on
  the stage, **Save** to the database, **Back to the draft**), and
  **Publish** makes a content version. Docs: `docs/editor.md`.
- **The engine as a package** (`engine/`): the content runtime (`loadGameConfiguration`, the accessors, `contentUrl`)
  and the AR scene (`ArScene`, entities, animations, trackers behind `IImageTracker`) moved out of the reader into a
  source folder both apps compile (`@engine/*`). The app passes what differs: its tracker (the reader the 8th Wall
  engine, the editor its mock tracker), the graphics options, the bundled content, the startup texts; the scene gained
  `overrideEntity()` (the editor's live edit) and `refresh()` (rebuild the spread after a save).
- **The book as laid out on the stage**: `npm run layout` (scripts, Python with PyMuPDF) reads the designed PDFs – the
  book preview and the trigger layout – and writes the content's `layout/` folder: every sheet as an image (covers
  included) and every printed target's page, side, position and size in mm. With it the editor's stage shows the
  spread's real page under the entities and every target exactly where it is printed; leafing shows the next sheet.
  Without it: blank pages, targets by the trigger protocol or in a row (`docs/content.md`, "Importing the book layout").
- **Studio spreads in the test fixture** (`fixtures/content`, pages 28–31): every entity type, placement and filter of
  the content model on two double pages, for the editor and the tests (`FIXTURE.md`).

### Changed
- The reader carries nothing of the editor (RULES #32): no `/editor` route or page, no preview flag, no mock
  tracker, no simulated camera permission, no forgetting of an unlock. The trial panel reads the trigger protocol
  through the engine's `fetchTriggerInfos()`.
- The image serves the editor at `/editor` (`.htaccess` fallback to its `index.html`, a year's cache for its hashed
  files); CI checks, tests and builds it (`checks.yml`, job *Editor*).

### Removed
- The debug overlay's **tune** panel, `<tune-inspector>`, `tune-values.ts` and `<scrub-number>` (Tilman: "es geht im
  Debug-Overlay nicht um Einstellungen – das ist Legacy"): the overlay debugs, the editor edits. The `editor` button
  and the `P` marker of the debug line went with the preview.

## 1.9.6 – 2026-10-28

### Changed
- The AR entity's animations are shorter (#57): the unlock (first find) takes 3 s instead of 4.2 s and the reveal
  (every later find) 0.6 s instead of 1 s, so a video or a 3D object is readable before the reader drifts off the
  page. The "New entry unlocked" label follows the unlock. The outro stays 0.7 s.

## 1.9.5 – 2026-10-28

### Changed
- The trial strip looks like the debug bar at the top, turned upside down (#14): .25rem in from the left and right
  edges, .5rem rounded top corners, flat on the bottom edge; no green line on top (the grab bar marks the edge).
- The strip scrolls smoothly to the current spread when it changes, so the reader sees it move (instantly with
  reduced motion); a re-render mid-scroll continues the scroll, touching the strip stops it.
- The strip's camera row is a feedback line only – lens, resolution, focus and zoom, no AF / ◎ / zoom buttons: the
  trial runs with the app's camera defaults (#37). The md report records the camera, also when the camera is already
  off when md is tapped (the last one seen).
- **One bottom sheet for all debug panels** (#14): trial, camera, load test and tune share `dev-tools/debug-sheet.ts`
  – the debug bar at the top turned upside down, a top bar with the grab handle that sets the height by dragging
  (stored per panel on the device), a scrolling body. Before, each panel drew its own frame (three different ones)
  and only the trial could be resized.
- **The collapsed debug line is one line again**: the status dot, `T<targets on the spread>`, `E<ready>/<held>`.
  The spread id, `F[…]` (found counts), `S[…]` (what the engine sees), `↪` and the camera summary are gone from it –
  what the engine sees and the last auto switch are in the expanded view, the camera in its panel.
## 1.9.4 – 2026-10-28

### Added
- **Tap to focus for every reader** (#37): a tap on the camera picture that is not on app UI and hits no AR entity
  (those still open their entry) starts one focus run, then the camera goes back to continuous focus after 1.5 s. Where
  the browser supports focus points (`pointsOfInterest`) it focuses on the tapped spot; Chrome on the Galaxy S22 does
  not, so there the whole picture is refocused. Browsers without focus controls (Safari) ignore the tap. Continuous
  focus at camera start stays; no zoom. The debug camera panel keeps its own **◎** test switch
  (`ar-bridges/utils/camera-request.ts` → `focusAtTap()`, called from the AR scene's tap handling).

## 1.9.2 – 2026-10-28

### Fixed
- **Dependabot alerts resolved** (#55): all 13 open alerts were in the development tooling (nothing in the app
  bundle or the server). `client/`: vite 8.3.1 → 8.3.5 (launch-editor command injection, `server.fs` bypasses,
  cross-origin script execution), vitest 5.0.2 → 5.0.5 (`@vitest/mocker` code injection and path traversal),
  source-map-js 1.2.2, fast-uri and serialize-javascript refreshed, happy-dom 20 → 21.0.4 (host code execution
  through an unsanitized import alias). `scripts/`: vitest 3.2 → 4.1.12 (no patched 3.x release – also replaces
  the vulnerable tinypool), vite 6.3 → 6.4.5, sharp 0.35.5, source-map-js 1.2.2. The remaining `npm audit` note
  in `client/` (deepmerge, low, through vite-plugin-pwa → workbox-build) has no fix upstream and is not a
  Dependabot alert.

## 1.9.1 – 2026-10-28

### Changed
- **Trial strip in a fixed order** (#14): the strip shows every target in the order of the printout, with its running
  number (the same numbers as the tester printouts of trial 2) and its page – nothing reorders or disappears any more
  (before, it showed the current spread's targets and then only the ones not found yet, from the current spread on,
  so tiles jumped and vanished). Found ones get a green frame and a ✓, the one in view a yellow frame, the current
  spread's a white frame; the strip scrolls to the current spread when it changes. Targets not on the printout are
  dimmed and labelled "not printed".
- **The trial holds ±1** instead of ±0: the next and previous spreads are loaded, so scanning the sheet in order
  switches to the next page by itself; ‹ › stay.
- The strip sits flush with the bottom edge of the screen, full width, square corners.

## 1.9.0 – 2026-10-28

### Fixed
- **Android scans with the main lens again** (#37): the 8th Wall engine chooses Samsung's main back lens by the label
  `camera2 0, facing back`; Chromium now names the lenses `camera 0, facing back` (Chrome 156, Brave 155), so the
  engine asked for "the back camera" and the S22 opened its **ultra-wide lens** – fixed focus, small triggers held
  close stay blurry and look even smaller. The app now changes the engine's camera request on the way and asks for
  camera 0 by its device id (`ar-bridges/utils/camera-request.ts`; old and new label; only on Android – elsewhere the
  request stays). On the S22, 23 of the 25 triggers the first trigger test missed are now found, without zoom; the
  two left are flat logos (`docs/trigger-tests/2026-10-28-camera.md`).
- **The dev server runs on Safari 15** (iPhone 7): its TypeScript transform turned static class fields into
  `static {}` blocks, which Safari before 16.4 cannot parse – the app stopped on the splash screen. The dev server now
  lowers them for Safari 15 (`vite.config.js`), as the build already did.

### Added
- **Notice for browsers that cannot scan** (#37): the engine's tracking WebAssembly needs WebAssembly SIMD – Safari
  from iOS 16.4. Without it the camera overlay says so instead of the generic AR error: on an iPhone, update to
  iOS 16.4 or newer if the phone can (iPhone 7, 6s and SE 1st generation cannot); elsewhere, update the browser
  (`CameraPermissionStatus.UNSUPPORTED`, checked before any camera request). A SIMD-free engine build is proposal #39.
- **Continuous focus at camera start** where the camera offers it and does not use it already
  (`applyCameraDefaults()`).
- **Debug camera panel** (overlay → *camera*, a strip at the bottom like the trial): the camera readout and switches
  moved out of the overlay into it. It lists the current spread's targets (yellow in view, ✓ found since opened), a
  retest list (`?retest=<ids>` link or `osct-camera-retest`), and next to AF / ◎ / zoom: **lens** (main or the
  browser's choice), **res** (engine 960 × 720, 1280 × 960, 1920 × 1440) and **ask zoom**, each on the next start.
  It shows why AR could not start (also after "AR: error" in the overlay) – the console is out of reach on a phone.
  While open the tracker holds the current spread only, as in the trial.

### Changed
- **Debug overlay**: tabs `spread · progress · camera · trial · load · tune` and a **×** that closes it (the expanded
  overlay could not be closed on a phone); the spread's QR code is behind a **QR** button.
- The camera resolution stays the engine's 960 × 720: 1920 × 1440 found the smallest trigger later and held it less
  steadily on the S22, 1280 × 960 brought nothing.

## 1.8.2 – 2026-10-28

### Changed
- **The tracker holds the neighbouring spreads again, not the whole book** (#38): by default the engine keeps the
  current spread and the next and previous one loaded (±1, as before 1.7.0), so turning a page still switches by
  itself. The growing window (the whole book, added in the background) stays selectable in the debug overlay; with
  it, pages of a printout were no longer found once every target was held. Until that is solved it is not the
  default.

## 1.8.1 – 2026-10-28

### Changed
- **Trial tiles show clearly what was found** (#36): a found image gets a thick green frame and a green square with a
  ✓ in its top right corner, and stays fully visible (it was dimmed before); the image in view is framed yellow.
  Square tiles, no rounded corners. Testers just move on when an image is not found – there is no "did not work"
  button.

## 1.8.0 – 2026-10-28

### Added
- **Camera readout and focus / zoom tests** in the debug overlay (#14): the trigger test of 28 October missed small
  printed triggers and the camera seemed not to focus, while neither the app nor the 8th Wall engine sets a focus
  mode or zoom. The overlay's new *Camera* section shows the lens the engine opened (its label), the resolution and
  frame rate, the focus mode, focus distance and range, the zoom and its range – and test switches: **AF continuous**,
  **Tap to focus** (the next tap on the camera picture focuses there), the zoom steps 1× / 1.5× / 2× / 3× the lens
  offers, and **Ask for zoom** (the next camera start requests zoom too – Chrome may only offer zoom with the
  camera's pan-tilt-zoom permission). The collapsed line ends with `C<lens> <resolution> <focus> <distance> <zoom>`.
  The trial panel has a camera row with **AF**, **◎** (tap to focus) and the zoom step, and its `md` report records
  the camera. The tracker hands the engine's camera track over on its "hasStream" status
  (`ar-bridges/utils/camera-debug.ts`); nothing in the app depends on it. Zoom changes the field of view the engine
  assumes: finding works, the AR overlay may sit slightly off while zoomed.

## 1.7.10 – 2026-10-28

### Changed
- Code base review (#19): comments explain the code, not its history – names, dates, test references, design frame
  numbers and libraries the app no longer uses (A-Frame, MindAR, Netlify, FTP) are gone from code comments,
  workflows and `.gitignore`; the two TODOs without an issue are removed.
- `.editorconfig` and `.gitattributes` fix line endings (LF) and indentation for every editor.
- The content build no longer treats edits to the delivery import or the trigger protocol tool as a new content
  version (`import-delivery.ts` and `protocol.ts` are left out of the content hash like the other commands). The
  content schema is 1.2 (comments in `shared/` changed; nothing older apps cannot read).
- Documentation: the root `README.md` is the index of `docs/` (with the repository layout and the three test
  layers); `agents/RULES.md` has stable rule numbers (the second "21" is #25, Git #26, CI #27, Deployment #28,
  Issues #29, session start #30, docs ownership #31) and a rule that a TODO needs an issue; outdated statements in
  the docs (target limit, namespaces, settings and dev tools, scripts folders) corrected.

### Removed
- Dead members: `Pages.NOTIFICATION`, `IGame.setLoadingState`, `ISpreadManager.getCurrentSpread`,
  `StorageClient.listTree`, an unused Mark image; duplicate helpers in `scripts/` (`isMain`, `listFiles`,
  `isObject`); `docs/README.md` (its two URLs are in the root README).

### Fixed
- `scripts/test/` is type-checked, and the build test builds the test fixture instead of the book content
  (RULES #8). The API schema split no longer relies on a literal line break inside a regex.

## 1.7.9 – 2026-10-28

### Changed
- The deploys build the app against the environment's content CDN: `CONTENT_BASE_URL` of the GitHub environment
  reaches the Docker build (`config/deploy.yml` → `builder.args` → `Dockerfile` `VITE_CONTENT_BASE_URL`) and the
  temporary FTPS staging build. Such an image holds no content; the app loads the current version from the CDN at
  startup ([content-cdn](content-cdn.md)). Without the variable the commit's content is still bundled (#6, #5).

## 1.7.8 – 2026-10-28

### Changed
- **The trigger trial holds the current spread only** (#14): while the trial panel is open the tracker's window is
  ±0 – no growing window, no other spread prepared, no content preloaded for neighbours – so a trigger that is not
  found is down to the engine and the printout, not to work in the background. Step through the book with ‹ ›.
  Closing the panel restores the setting chosen in the debug overlay (the override is not stored); the overlay shows
  "±0 while trial is open (then …)".

## 1.7.7 – 2026-10-28

### Fixed
- The error page unsubscribes from the store when it leaves the DOM (#20): it subscribed to the whole store on every
  connect and "unsubscribed" a different function, so each reconnect left a listener behind. It now subscribes to
  `currentError` only (typed `ErrorInfo | null`) and keeps the cleanup it gets back, like the other pages.

## 1.7.6 – 2026-10-28

### Added
- **Content deployment apart from the app** (#5): the **osct CLI** in `scripts/` (`npm run osct -- content build |
  status | sync | purge --env staging|production`). `sync` uploads the content build as a new version – its own
  folder on the bunny.net CDN, never overwritten – and points `latest.json` at it; syncing an older build again is
  the rollback. `purge` deletes old versions strictly: never the current one, the one the CDN still serves, the
  newest retired one or anything retired within the CDN cache time (30 days), and nothing at all when the
  bookkeeping is inconsistent. Nothing runs on a push; the workflow "Content" is a manual button (dry run by
  default). The app loads the current version at startup when it is built with `VITE_CONTENT_BASE_URL`; such a
  build reads no content at all. Without the flag the content stays bundled (dev server, tests). The installed app
  still works offline. How it works: `docs/content-cdn.md`.
- **Test fixture** `fixtures/content/` (#5): the placeholder content, slimmed to under 1 MB (every entity type,
  chroma key and alpha video). CI and the tests build it – the book content is leaving the repository, history
  included (`docs/content-out-of-git.md`). `osct content sync` refuses a build of it.
- **Content schema `MAJOR.MINOR`** (`version.schema`, `shared/types/game-config.ts`, now 1.1): the only
  compatibility rule between content and app. Another MAJOR is refused at startup ("The book content is newer than
  this app" / "… older than this app", en/fr/nl/de); any MINOR loads. A test fails when `shared/` changes without a
  schema bump (`shared/content-schema.json`, `npm run schema:lock` in `scripts/`).

### Changed
- The content build reads only the content source named by `OSCT_CONTENT_DIR` (environment or `scripts/.env`,
  relative to the repository) and stops when there is none – no fallback. `content-demo/` became the fixture; its
  full-size copy lives next to the content source. The workflow "Content" offers status and purge – sync runs where
  the content source is.
- The content's version is its build checksum and no longer includes the app version – an app release does not make
  new content. The app version a content build was made with is information only (the startup check no longer
  compares it).
- The game configuration is loaded before the app element starts (`loadGameConfiguration()`), no longer imported at
  build time. The whole-book download takes the file sizes from `files.json` of the loaded version.

## 1.7.5 – 2026-10-28

### Fixed
- The debug overlay's QR code on staging pointed at the build machine (#22): the build no longer bakes in a dev
  server address, so in a build the code leads to the address the page was opened on (staging, production). On
  the dev server it still shows the Wi-Fi address for phones. The stale environment list (Netlify) is gone.

## 1.7.4 – 2026-10-28

### Fixed
- The debug overlay removed its click listener with a freshly bound function, so nothing was removed: after a disconnect and reconnect one tap toggled it twice (#21). Add and remove now use the same function.

## 1.7.2 – 2026-10-28

### Fixed
- The first push of the Kamal deploy: the staging and production workflows now grant `packages: write` to the
  deploy they call (the repository's token is read-only by default, so the called workflow could not ask for it
  and the run failed at startup).
- 1.7.1 had bumped only the app's version; the content build and the API said 1.7.0, which the API test caught
  (the FTPS staging deploy failed). All three are 1.7.2.

## 1.7.1 – 2026-10-27

### Added
- **Deploys move issues on the board** (#11): after a successful deploy, `board-status.yml` sets every `Fixes #N` in the
  deployed commits to *Review on staging* (staging) or *Deployed* (production) on the board OSCT and comments the
  version – only forward, `Refs #N` moves nothing. Needs the repo secret `PROJECT_TOKEN` and runs once it is on `main`
  ([deploy](deploy.md) "Board").
- **Every session starts with its issue** (`agents/RULES.md`, `CLAUDE.md`): find or create the issue, pick its lane,
  start the session title with `#N`.

## 1.7.0 – 2026-10-27

### Added
- **Growing window** (new default, debug overlay *Spreads held: grow*): the tracker holds the current spread, then adds
  the nearest spreads in idle time – three targets at a time, each batch after the previous one is extracted – until
  the whole book is held. Nothing is dropped on a switch, so every page visited or grown into switches by itself
  afterwards. Based on the first load test: holding all 131 targets cost no frame rate, tracking stability or detection
  speed, only ~0.35 s of main-thread work per new target. Content is still preloaded for ±1. The fixed windows (±0,
  ±1, ±2, all) stay selectable for comparison. The overlay shows how many spreads are left to add.
- **What the engine sees** (debug overlay): `S[…]` on the collapsed line lists every target the engine finds right now,
  of any held spread – the current spread's in green, others in orange – and `↪<spread>` the last automatic switch for
  10 s; expanded, *Engine sees* and *Last auto switch* (via which target, how long ago). The window setting's
  **Change** button now applies at once instead of at the next switch. To tell a crowded printout from too many held
  targets when a page is not found ([tracking](tracking.md)).
- **Engine view in the debug overlay**: which spreads the image tracker holds right now – the current one (◉) and the
  ones kept loaded next to it, with their target counts – how many targets are extracted (can be found), whether the
  engine is still extracting, and which spreads are being prepared. The summary line shows `E<ready>/<held>`.
- **Engine load test** (debug overlay → *load*, dev server and staging), run in the app as it is used: the window of
  spreads kept ready next to the scanned one gets a growing target budget (0, 5, 10, 20, 40, 80, all – nearest spreads
  first); the tracker holds it, the preloader fetches its content, pages switch as usual. Per step it measures preparing
  and extracting the window's new targets, engine and page frame rate, stutter, how steadily the scanned page stays
  found, and – when the tester covers and uncovers the lens – how fast it is found again. Download .md / Copy give the
  table ([tracking](tracking.md)).

### Changed
- **Entry videos stay out of git** (`content/entries/*/video.mp4` in `.gitignore`): the trial's 16 videos (117 MB) are
  not committed; they reach the servers through a CDN sync later. A content build without a video (CI, deploys) warns
  and builds that target without its AR video instead of failing.
- **Trigger trial panel** is a small strip at the bottom: drag its top bar to make it taller or lower (remembered on
  the device). It shows the current spread's targets (found ones dimmed with ✓, the one in view outlined), then every
  target not found yet from the next pages on – tap one to go to its spread; ‹ › step through the spreads. The bar only
  counts the targets not found yet; **md** downloads the report of those. The slow / flicker / no buttons and notes are
  gone (found comes from the progress; reset the progress to start a trial over).
- **Content preload follows the tracker's window**: the spreads whose targets the engine holds (±n, nearest first) also
  get their content preloaded – before, content was always ±1 while the targets could be ±2 or all. Target images
  first, then one spread at a time, nearest first; a moved window stops the older run.

## 1.6.0 – 2026-10-27

### Added
- **Trial content** from the publisher's delivery of 21 October (`scripts/import/2110.yaml`): 138 entries on 87 spreads –
  84 glossary images, 41 link screenshots, 16 documentation videos (13 as AR videos on their page's trigger) – with
  placeholder titles and texts. 121 of the 131 targets are on the trial printout (`All_Triggers.pdf`).
- **Delivery import** (`npm run import -- <delivery folder> import/<name>.yaml` in `scripts/`): a mapping file names,
  per entry, the delivered printed image, entry image and video; the import writes resized JPEGs, re-encodes videos
  with ffmpeg (H.264, ≤ 1280 px, ~2 Mbit/s), creates `entry.yaml` with placeholders and the spreads, and never
  overwrites an edited `entry.yaml` (`docs/content.md` "Importing a delivery").
- **Trigger trial panel** (debug overlay → *trial*, dev server and staging): the checklist for a test with the printed
  book. It lists the targets of the current spread or the whole book with thumbnail, delivered file, printed size and
  position (`npm run protocol -- import/2110.yaml` → `trigger-protocol.json`), marks what the scanner found, takes
  *slow* / *flicker* / *no* and a note per target, and downloads (or copies) a Markdown report – problems first – for
  the designers. The progress tab's **Copy** button gives the raw list of unlocked targets with times.

### Changed
- The placeholder content (demo spreads, castle, racoon, edge …) moved from `content/` to `content-demo/`; build it with
  `OSCT_CONTENT_DIR=../content-demo`. `content/` now holds the book's content only.

### Fixed
- The debug overlay's QR code (opens the dev server on a phone) named a virtual adapter's address (WSL, Hyper-V, Docker)
  and always port 5173; it now uses the Wi-Fi address of a physical adapter and the port and protocol of the server
  the page came from.

## 1.5.3 – 2026-10-27

### Added
- The sign-in mails go out through Amazon SES (eu-west-1): the deploy configuration defaults to its SMTP endpoint,
  an environment only needs the SES SMTP user name and password (`docs/deploy.md` "Mail"). The deploy stops before
  Kamal when mail is set to SMTP but the credentials are missing.
- `php /opt/osct/mail-test.php <address>` in the container (`server/deploy/mail-test.php` locally) sends one test mail
  with the current settings and prints the SMTP error when it fails; `server/deploy/ses-smtp-password.php` turns an
  IAM secret key into the SES SMTP password.

### Changed
- Deployment: the site – app and user API – ships as one Docker image, deployed with Kamal over SSH:
  `develop` → staging https://osct.porschuetz.de, `main` → production https://osct.buildingfictions.com
  (`docs/deploy.md`). The container creates missing tables and columns at every start; the API reads its settings
  from `OSCT_*` environment variables, there is no `config.local.php` on a server any more.
- Cache headers, MIME types, gzip and the SPA fallback are part of the image (`server/docker/apache.conf`,
  `.htaccess`), not a hosting provider's settings.

### Removed
- The Netlify deploys (`_headers`, `_redirects`) and the release workflow: production deploys from `main`; GitHub
  releases are optional notes. The FTPS upload to the shared host stays as a temporary workflow until the staging
  VM exists.

## 1.5.2 – 2026-10-20

### Changed
- The content build output (`client/src/game.config.json`, `client/public/assets/content/`) is no longer in
  git: `npm run build` in `client/` builds the content first, so every deploy (staging, release, Netlify)
  builds the content of its commit. After a content change, run `npm run content` in `client/` locally and
  commit only `content/`.
- The checks build the content instead of comparing a committed copy.

### Fixed
- A fresh checkout tells you to run `npm run content` instead of failing on a missing file; the broken
  `build:config` script is gone.

## 1.5.1 – 2026-10-03

### Added
- **Tune panel** (debug builds: dev server and staging): debug overlay → "tune" opens a panel at the bottom of the
  screen for the AR content of a page – every placement value (`position.x`, `rotation.y`, `scale` … – the three.js
  names) and every parameter of its filters (chroma key: color, mode, threshold, softness, spill, opacity), each
  with a slider and a field for an exact value (a comma works as the decimal point). It opens with the values in the
  content and shows changes live on the page; filters can be added and removed. "Copy YAML" copies the `params` /
  `filters` block with the file it belongs in – only values that differ from the defaults. The content itself is
  not changed: paste the block into the entry (or into a Claude session). How to use it: `docs/content.md`.

## 1.5.0 – 2026-09-28

### Added
- **Scene around the book** (prototype, scan mode): once a page has been found, a world surrounds the reader. It
  is tied to where the book was seen and turns with the phone (gyroscope, rotation only – walking does not move
  through it). The book and the table stay visible (a soft window around the book, clear when looking down);
  every new find sets the world back in place. It fades away 45 s after the last page was seen. For now a basic
  placeholder café drawn in one pass – sky gradient, stars, a moon, a ringed planet, a grid floor, floating tables,
  glowing orbs and turning cubes as simple shapes in the shader; the real world comes with the content.
- **Onion sky**: looking up, sky-coloured parts of the camera picture (blue, or bright grey and smooth) show the
  world's sky – buildings, trees and people stay real (light, warm façades are not taken for an overcast sky). It
  reads a small copy of the camera picture (160 px wide, every other frame), not the full video.
- **Graphics** options on the Info page (Settings): "Onion sky" and "Scene around the book", **off by default**,
  stored on this device (en/fr/nl/de) – for phones that need the power for the page scenes. With both off nothing
  extra is drawn and the gyroscope is not read.
- Documentation: `docs/look-around.md`.
- Tuning on the device: `window.osctLookAround` (opacity, sky strength, fade time, window and floor angles). On
  iPhone the first tap asks for motion access.

## 1.4.2 – 2026-09-28

### Changed
- Debug overlay top line shortened to `◉ spread1 T4 F[…]`: the dot's color is the AR status (no "S"), then the
  spread, its number of targets and the found targets. The asset count and the book's unlocked / consulted
  counts are gone from the line (the progress panel lists them in full).

## 1.4.1 – 2026-09-28

### Removed
- Removing the account password: once set, it can be changed but not removed ("Remove password" button and
  `DELETE /user/password` are gone). The sign-in link keeps working either way.
- Debug overlay: the spread status ("Initial") and the spread dot next to the scene dot – no code ever changed
  it. The unused per-spread loading state is gone from the store; the current spread stays.

## 1.4.0 – 2026-09-28

### Added
- Optional password for accounts. The first sign-in is still by email (it confirms the address); afterwards
  readers can set a password under Info → Account and sign in with email + password, or keep using the
  sign-in link. The password can be changed or removed again. Forgot it? Sign in with the link and set a new one.
- Server: `POST /auth/password`, `PUT /user/password`, `DELETE /user/password`. Passwords are stored as bcrypt
  hashes (cost 12) only; failed sign-ins are limited per address and per IP. The deploy's migration adds the
  new column and table to the existing database – no data is touched.
- Password managers can fill and save the account fields (email as the username, `current-password` /
  `new-password`); Chrome also offers to save the password after signing in or setting it.

### Changed
- Account wording: one form for new and returning readers – "Send sign-in link" instead of "Register
  account", and the text tells readers who registered on another device to use the same email. Switching to
  the password form is a text link next to the button ("Sign in with password" / "Sign in with link"), not a
  second button.

## 1.3.2 – 2026-09-28

### Changed
- Targets are known by their id only: the tracker and the AR scene no longer number them. `index` is gone from
  the game configuration and the target `order` from the content (`order:` under `target` is ignored if
  left in). Entries on the same page are listed by title.

### Removed
- Leftovers of MindAR: the `.mindar/` folder that was committed by mistake with 1.3.0 (it is ignored again,
  so old local copies stay out of git).

## 1.3.1 – 2026-09-28

### Fixed
- Automatic tagging on `main` no longer aborts when a changelog version never had a commit of its own on
  `main` (1.2.3 reached `main` inside 1.3.0): commits without a readable version are skipped, and such a
  version is noted instead of searched for through the whole history. This had kept `v1.3.0` from being tagged.

## 1.3.0 – 2026-09-28

Existing content keeps building (a leftover `mind:` in `spread.yaml` is ignored – delete it when convenient);
the game configuration no longer has `mindSrc` or `maxTargetsPerSpread`. Progress is unchanged.

### Changed
- Image tracking with the **8th Wall engine** (`@8thwall/engine`, MIT) instead of MindAR: steadier content
  (less jitter). The engine's files are served from `assets/xr8/` with its licence and precached by the service
  worker, so AR works offline. It is credited in the project README (not on the Info page).
- The app makes the recognition data from the target images itself – nothing to compile. The whole target
  image is used (fitted into the engine's portrait frame).
- Up to **10 targets per spread** (was 5); the camera follows 4 of them at the same moment.
- The preloader and the whole-book download fetch the target images where they fetched `.mind` files.
- Saved progress of an older format will only be reported as "converted" when reading it changed something
  (for the next progress format change).

### Added
- The neighbouring spreads' targets are kept ready, so switching to them is instant; turning to a
  neighbouring spread **switches by itself** (the page held in view for 0.4 s, in scan mode). The spread menu
  stays.
- Debug overlay: "Spreads loaded ahead" (±0, ±1 – the default –, ±2, all).
- Demo spreads 4–14 (pages 7–27) from the layout PDF – placeholder targets for testing, no AR content.

### Removed
- MindAR: the vendored build (with TF.js), its tracker, all `.mind` files, `npm run compile:mind`,
  `mind:benchmark`, `mind:history`, `mind:restore`, the `.mindar/` folder and `playwright-core`.

## 1.2.3 – 2026-09-28

### Changed
- Info page: more space between the "Settings" title and the first switch, like the gap between the rows.
- Camera denied screen: one short hint (allow the camera in the browser settings, then reload) and a
  "Reload page" button instead of step lists per browser.

### Fixed
- Camera denied screen in scan mode no longer overlaps the counter or the "Pages activated" menu.
- The screen no longer shows Firefox instructions in Chrome (the browser guess was wrong).

### Removed
- Browser detection (`utils/browser.ts`) and the per-browser camera steps in all languages.

## 1.2.2 – 2026-09-28

### Fixed
- Automatic tagging no longer fails when an older version's commit has different workflow files (GitHub
  does not let the repository token tag it); that tag is reported with the command to create it by hand.

## 1.2.1 – 2026-09-28

### Changed
- Comment cleanup: the Info page's MindAR note no longer ends up in the page's HTML; the staging deploy
  workflow's comments follow the comment rules.

## 1.2.0 – 2026-09-28

### Added
- `npm run compile:mind` (in `scripts/`) compiles the recognition data (`.mind`) on your own computer, in
  Chrome or Edge on the graphics card, with MindAR's own compiler. It compiles only the spreads whose
  target images changed, keeps every image in a cache, and shows each step with live progress, the
  graphics card in use and a summary of the times.
- `npm run mind:benchmark` measures how fast your computer compiles and picks how many images to compile at
  a time; `compile:mind` then uses that.
- `npm run mind:history` and `npm run mind:restore <spread> previous` keep earlier `.mind` versions on your
  computer and put one back, so a compile can be tested on the phone before it is committed.
- The content build stops with "… is stale" when a spread's `.mind` no longer matches its target images.
- Tests for the content build and the `.mind` tools (`npm test` in `scripts/`), also run by the GitHub checks.
- The Info page credits MindAR (image tracking by HiuKim), and MindAR's licence ships with the app's copy.

### Changed
- `scripts/` is all TypeScript and sorted by task: `src/build/` (content build), `src/lib/` (shared
  helpers), `src/mind/` (`.mind` commands); `npm run build` bundles one file per command.
- Everything about `.mind` files that stays on your computer lives in `.mindar/` at the root (target
  images, earlier versions, cache, browser profile); older folders are moved there on the first build.
- The content build documentation is part of `docs/content.md`, as a short quick start.
- `.gitignore` tidied up.

## 1.1.5 – 2026-09-28

### Added
- Version check in Checks (`.github/scripts/check-version.sh`): version sources agree, a changelog section
  exists, the version never goes below the newest tag, and code changes on `develop`/`main` come with a bump.

### Changed
- Versioning rules for parallel branches: one bump per piece of work, above `develop`'s version; version
  conflicts resolve to the next version above both sides.

## 1.1.4 – 2026-09-28

### Added
- Versions are tagged automatically on `main` (`tag-version.yml`): every changelog version without a tag
  gets `vX.Y.Z`. Publishing a release on that tag deploys production.

## 1.1.3 – 2026-09-28

### Added
- Production deploys from GitHub releases (`release.yml`): the tag must match the version and have a
  changelog section; empty release notes are filled from this file. Deploys the production server (once
  configured) and the Netlify site.

### Changed
- Pushes to `main` no longer deploy (Netlify builds to be stopped in the Netlify UI).

## 1.1.2 – 2026-09-28

### Changed
- UI texts use i18next's named `t` export (`import { t } from "i18next"`) instead of `i18next.t`.
- Code comments across client, server and scripts rewritten to describe responsibilities and business
  rules; most CSS comments removed. Values that lived only in comments moved to `agents/DESIGN.md`.
- New project rules: comment style (RULES #22), version bump and changelog entry per change (RULES #23).
