# Changelog

Every versioned change is listed here, newest first. Versions follow [semver](https://semver.org/) and
are the same for the app, the content build, the server and the MCP server. What bumps which part is
`agents/RULES.md` #23 (content compatibility is the content schema, #10 – docs/content.md "Schema and app versions").

Sections per version: *Added*, *Changed*, *Fixed*, *Removed* (only those that apply). Versions before
1.1.2 are in the git history.

## 4.8.1 – 2026-11-21

### Added
- **A documentation site at `/docs/`** (Tilman, 2026-11-21, #336) for the people who use the editor, in three parts, each
  page brief and illustrated with screenshots of the editor:
  - **Editor guide** – the editor at a glance (the words, the three pages, saving and publishing), experiences with
    import, publish and AI connections, the workspace and its panels, the stage, scenes and surfaces, the Inspector, the
    Library and the Environment tab, the Logic panel, the Code tab.
  - **Tutorials** – for editors (a first look with the demo, a new target with AR content, an entry's text, a rule, a
    new scene, post-processing and looks, publishing and taking a change back, connecting an AI agent) and for admins
    (getting in, inviting an editor, roles, a QR code for print, reading the arrivals, the newsletter list, bringing an
    experience onto a new installation). The long page at `/docs/tutorials/` stays, linked as the content and demo
    walkthrough.
  - **API** – which API for what, the logic system (rules, events, actions, variables, expressions, addresses), the
    plugin API 3.1 (what a plugin registers, specs and parameters, hooks, events and variables, files, the sandbox,
    shipping) and the MCP server (connecting, what a token may do, the tools by area, the two-step confirmations).
- The editor's account menu has **Documentation**, which opens the site in a new tab.

### Changed
- The reader's dev and preview servers answer a folder under `/docs/` with its `index.html`, as the web server does
  (`client/vite.config.js`), so the site and the long walkthrough open locally at `http://localhost:5174/docs/`.

## 4.8.0 – 2026-11-21

### Added
- The Logic view's add menu lists **every type** from the empty canvas (Tilman, 2026-11-21, #334): grouped by family
  (Events, Conditions, Actions, Not added here), each row the thing chosen with its type on the right in the legend's
  pin and colour; an action or a condition chosen with no rule selected makes a new rule on the place's first event
  (`found` for a node, `sceneChanged` for the scene or the experience). Only a node, a plugin, a scene or a group stay grey.
- A wire dragged from a port and let go on the empty canvas opens the same menu, filtered to what can be made and wired
  to that port (typed like the strict connect); the new rule, variable or event is pinned where the wire was let go.
- A selection box: a drag on the empty Logic canvas selects the boxes and wires it touches (Shift adds), for Group /
  Ctrl+G and Delete; panning is the middle button, Space + drag and the wheel.

### Changed
- The add menu's head is just *Add* / *Add event* (no "– on the experience"); rows name the event, action or condition,
  not "rule on …".
- Delete in the Logic view removes everything selected (wires, then rules) in one go instead of refusing more than one.
- A plugin's bus ports on the Logic canvas are read-only (from its code's uses): outline pins, never lit while a wire is
  dragged; a click or a drop on one opens the plugin in the Code tab instead of a red refusal.

### Fixed
- A new rule on a scene that had no rules yet was refused ("There is no scene …").

## 4.7.0 – 2026-11-21

### Changed
- The Logic panel's problems sit in an **issues bar** under the graph, like the SCUTOONS deck's, more minimal (#334,
  Tilman 2026-11-21): one line – a mark, *1 error · 2 warnings* and the first issue – that opens a compact list on a
  click (remembered per session). A row is the box's name and short words (*keyRattled · emitted, nothing hears it*); a
  click marks the box and, for a scene's problem at a wider level, opens the scene's level. Errors (a missing node or
  scene, a refused type) keep the error colour; warnings (nothing hears, sets or emits it) are grey with a hollow mark,
  and their box's border is dashed instead of red (RULES #38).

## 4.6.5 – 2026-11-21

### Fixed
- The Logic view's hover is gentler and never hides the box under the pointer: a hovered box with no wire dims nothing (it
  dimmed itself with everything else), the hovered box is never dimmed and shows its border and its open / fold chevrons
  at full strength, and the unconnected boxes and wires dim to 55 % / 45 % (were 30 % / 25 %).

## 4.6.4 – 2026-11-21

### Changed
- The Logic view's zoom controls are one row of icon buttons in a square-cornered frame – zoom in, zoom out, show
  everything (Tilman, 2026-11-21) – in place of xyflow's vertical stack.

## 4.6.3 – 2026-11-21

### Changed
- The demo lives in the staging database like in SCUTOONS (#322 decision (b)): `fixtures/demo` is now its committed
  export (`osct content export --experience demo --from draft`) – *The Demo Book* with print data, nine scenes (the Cat
  Pope poster SCUTOONS test and *Mark the Page* among them) and twenty plugins. `DEMO.md`, carried over by the export,
  says what each part shows now that the YAML has no comments.
- `.github/workflows/demo.yml` only builds `fixtures/demo` as a check; it no longer syncs it to staging, where it competed
  with the editor's Publish (docs/content-cdn.md, docs/editor.md). The CLI still refuses a demo build for production.
- The content build's zero-plane check (#189) reads the bounds of models the build optimised: positions stored as
  normalized integers (KHR_mesh_quantization, as gltfpack writes them with meshopt) are dequantized instead of read as
  metres; the demo's test names the models that still float or sink in the exported content.

## 4.6.2 – 2026-11-21

### Fixed
- The editor's draft no longer carries the specs an older build recorded for a plugin that has a saved source: the API's
  draft leaves out such a declaration's `registered` (the saved source registers its own, #269), so the editor page
  loads the Demo Book again ("entries[4]…of: expected one of book, spread, got experience" – 4.4.2 fixed the stage
  only). A publish still declares what it carries.
- The Scenes strip's **+** is a card high and level with the cards' pictures (it stretched over the whole strip).

## 4.6.1 – 2026-11-21

### Removed
- The Logic canvas's signal table no longer carries the deck's `clock` (and its `--signal-clock` tokens): OSCT has no
  clock (Tilman, 2026-11-21).

## 4.6.0 – 2026-11-21

### Added
- The editor's Logic canvas in the SCUTOONS deck's look (#334 L-T7 / L-T8, docs/editor.md "The deck's canvas"): boxes are
  the deck's cards (a head tinted in the kind's colour with its icon, name, kind and a fold chevron; one row per port),
  pins shaped and coloured by signal, wires hanging in their signal's colour – one table of signals
  (`editor/src/lib/logic/signals.ts`, theme tokens `--signal-*` for day and night, the mapping in agents/DESIGN.md §10).
  This is the one exception to the monochrome editor (RULES #38).
- Free placement: a box dragged by its head stays where it is let go, on the 1rem grid; **Tidy** lays the level out again.
- Groups as in the deck: **Group** or Ctrl+G frames the selected boxes in one of six colours; the frame's head folds it to
  one pill (its wires end on it), its swatch takes the next colour, its name is renamed in place (empty removes it), and
  dragging the head moves the whole group. A box folds to its head. Every canvas change is a step in History.
- Content schema 5.2: a logic canvas may carry `positions` (box id → `{ x, y }`) and a group `colour` and `folded` –
  authoring data only, never in a reader's configuration (the TypeScript guard and the server check them).

### Changed
- The Logic canvas no longer shows a signal by dashes; the legend lists the signals by pin and colour.

## 4.5.0 – 2026-11-21

### Added
- The export archive (#322, docs/content-cdn.md "The export archive", docs/content.md "Export archive"): every publish
  writes the export of the published build into the experience's content store, `<title>/<env>/<experience>/exports/<build>/`
  (the directory store of an instance without CDN alike) – once per build, never rewritten. It holds what `osct content
  export` writes (YAML, plugin sources, EXPORT.md, export.json) without the media: export.json names each file by its
  immutable URL and lists the content builds they lie in. The publish answer has `export: { path, written, error? }`.
  `osct content export --archive --env <env> --experience <id>` writes one for the build live there.
- `osct content purge` keeps every build the newest export archive of the experience (in any environment) names, and
  never deletes `exports/` (`--unknown` included).

## 4.4.2 – 2026-11-21

### Fixed
- The editor's stage no longer refuses a value that a plugin's saved source takes because the draft's declaration still
  carries the specs an older build recorded ("components[0].of: expected one of book, spread, got experience" in the Demo
  Book): for a plugin with a saved source the stage drops the declaration's recorded specs – the saved source registers
  its own (#269).
- The staging deploy over FTPS no longer runs for a push that changes only `agents/`, `docs/` or Markdown files: its
  upload is not atomic, and the API answered 500 while it ran.

## 4.4.1 – 2026-11-21

### Fixed
- The editor's stage no longer refuses a plugin whose declaration was built against an older plugin API when the Code
  tab has a saved source of it ("[plugins] aquarium was built against plugin API 1.6 … not loaded" in the Demo Book
  after 4.x): the saved source wins on the stage (#269), so the declared compiled module is neither checked nor loaded –
  every frame is given the saved ids when it starts (`FrameInit.saved`).

## 4.4.0 – 2026-11-21

### Added
- `osct delivery import <mapping.yaml | folder> --experience <id> [--files <dir>] [--layout <layout.json>] [--name <name>]
  [--apply] [--overwrite] [--all] [--cache <dir>]` (#322 T6, docs/content.md "Importing a delivery"): a publisher's
  delivery into the experience's draft through the editor API, replacing `npm run import`. The mapping's pages become
  scenes (the rule of the folder's import, now `scripts/src/lib/delivery-plan.ts`), pictures WebP under the image rule
  and videos H.264 (ffmpeg, only when the mapping names a video), cached by the delivered file's sha256; each file is
  uploaded to the Library unless it holds those bytes already; the API's comparison is printed per scene, entry and
  target (new, changed, conflict, same) and written only with `--apply` (one transaction, revertable per delivery). The
  content folder is neither read nor written. A mapping's `printed` and `note` are read and ignored.
- `GET /editor/experiences/{id}/assets` names each upload's `sha256` (null for an imported file) – what the delivery
  import deduplicates by.

### Changed
- `npm run import` (`import-delivery.ts`, the content folder's delivery import) is superseded by `osct delivery import`;
  it stays until the new one has run one real delivery (#322 T9) and shares its page → scene and video rules.

## 4.3.0 – 2026-11-21

### Added
- `osct content export --experience <id> [--from draft|live|<build>] [--out <dir>] [--force] [--assets-base <url>]` (#322
  T2, docs/content.md "Export"): the editor's database → the content source folder – one YAML writer per source file (the
  inverse of the content build, logic with its canvas), plugin sources, `layout/`, every file downloaded next to its YAML
  (resumed by sha256 from the previous `export.json`), `EXPORT.md` and `export.json`; written into a temp folder and
  swapped in as a whole, a folder without `EXPORT.md` only with `--force`. The round trip fixture → build → export →
  build gives the same configuration (`scripts/test/content-export.test.ts`).
- The content build reads what an export writes from the database: `groups.yaml` and a scene's `group`, `credits.yaml`
  (the configuration's `credits` of the files it names), a target's `recognition: { image, width, height }`. `EXPORT.md`
  and `export.json` do not count for the content hash.

## 4.2.0 – 2026-11-21

### Changed
- **Several experiences on one installation** (#87, with #50): every experience has a content store of its own in each
  environment – `<title>/<env>/<experience>/latest.json` and `…/<experience>/<build>/` on the CDN's storage zone. The
  title is the instance's setting `OSCT_TITLE` (default `osct`), so one zone can hold several white-label titles.
  `OSCT_CONTENT_BASE_URL` / `VITE_CONTENT_BASE_URL` now name the environment (`…/osct/staging`); the experience is added.
- The reader opens the instance's default experience (`VITE_EXPERIENCE` / `OSCT_EXPERIENCE`) at `/` – every link of
  today stays as it is – and any other experience below `/x/<experience>/` (`/x/demo/scene/…`). Progress stays per
  experience, as before.
- The editor's Publish: any experience can publish to staging and production; a publish only replaces that
  experience's previous build there. The question before replacing another experience is gone, and so is the API's
  `replace` (409 `other-experience`, 400 `invalid-replace`).
- The osct CLI works per experience: `sync` writes the build's experience, `status` checks every experience of an
  environment (or `--experience`), `purge` takes `--experience` (or `OSCT_EXPERIENCE`).
- The editor API's local content store and its route: `/api/content/<env>/<experience>/…`. `{ "source": "cdn" }` reads
  the experience's store; the import preview takes `experience` (default the instance's `OSCT_EXPERIENCE`).
- The demo is an experience on staging (`osct/staging/demo/`, opened at `/x/demo/`) instead of an environment of its
  own; the CLI refuses a demo build only for production.
### Fixed
- The header's entries counter: leftover merge markers inside its CSS (since 1.84.0) dropped its muted colour; the
  label is muted again.

### Added
- `osct content move --from <old folder> --env <env> [--experience <id>] [--dry-run] [--delete-old]` (also in the
  workflow *Content*): the one-off copy of the old environment folders into the store per experience – nothing is
  deleted unless asked, and only once every file arrived (docs/content-cdn.md "Moving to the store per experience").

## 4.1.0 – 2026-11-21

**Content schema 5.1 – a MINOR, plugin API 3.1** (#334 L-T6, research §5.9 "ports from the code"): a 5.0 app ignores what
is new.

### Added
- **Typed spec builders** for plugins: `api.p.number({ min, max, slider? })`, `p.integer`, `p.boolean`, `p.string`,
  `p.choice([…])`, `p.color`, `p.texture`, `p.model`, `p.file(kind)` write the same parameter objects as before – a
  hand-written spec keeps working – and the register functions infer a handler's `params` from the spec: `params.volume`
  is a number, a choice the union of its options. No JSDoc needed.
- **Hard and soft limits**: a number's `min` / `max` stay hard (the guard and the editor refuse a value outside, the engine
  keeps the value it had with a warning); `slider` is the soft range the editor's control moves in; `integer` takes whole
  numbers only.
- **Actions, events and bus use in the spec**: `actions` (the rule verbs it answers – a rule's `play: lamp` reaches the
  component's `onAction("play")`), `events` (sent with the context's typed `emit`; an undeclared one is a type error),
  `uses` (`hears`, `emits`, `reads`, `sets`). The content build records them in `registered`, the guard checks them.
- **The Logic view draws ports from the specs**: a node's box shows its file (a new *media* signal), its parameters (typed
  value inlets), the verbs it answers (action inlets) and the events it emits – for the built-in video, image, text, model
  and light too. Unused ports are hidden; a box's **+** shows them, *Hide unused ports* (Ctrl+H) hides them again – kept
  in the canvas (`exposed`). Connecting is strictly typed: the inlets that take a dragged wire light up, a refused one
  says why (*volume takes a number 0–1, not a text*). A rule's action into a node's verb writes that verb; a node's event
  into a rule's on makes it hear that event.
- The entity level of the Logic view shows every node of the subtree that has something of its own; an image node's box
  shows its picture.

### Changed
- The Logic view takes a plugin's bus use from what its specs declare; it reads the plugin's source only for one that
  declares nothing.

## 4.0.0 – 2026-11-20

**Content schema 5.0 – a MAJOR** (#334 L-T5, `agents/research/2026-11-20-logic-nodes-shared-concept.md` §5.4): a 4.x app
refuses 5.0 content and a 5.0 app refuses 4.x (`OLDEST_READABLE_SCHEMA_MAJOR` 5). Content migrates: a content folder with
`npm run convert:5` (done for `fixtures/content` and `fixtures/demo`), the server's rows by `Migration5` on the deploy
(dry run first: `php server/deploy/migrate.php --plan-5`); every published experience is published again afterwards.

### Changed
- **A rule's condition is an expression**: `when: hasKey && tries > 2` – the language of the entries' `{…}` texts
  (`shared/text/expressions.ts`, SCUTOONS' / ink's), now also as one expression without braces (`parseExpression`,
  `evaluateExpression`, `expressionVariables`, `expressionLiteral`). The engine evaluates it over `api.vars`; a condition
  that does not parse never runs (logged once). The guard, the content build, the MCP server's content model and the PHP
  API (the shapes) follow.
- **The engine's rules runtime** (`engine/src/scene/behaviour.ts`): one runner for a node's behaviour and the new scene and
  experience logic.

### Added
- **A scene's and the experience's logic** (`SceneData.logic`, `ExperienceData.logic`: `{ rules, canvas? }`, `shared/types/logic.ts`):
  rules in the behaviour's grammar that hear the bus (scene events and core events – no node event) and name nodes by
  address (`target:<targetId>/<node name>`). A scene's rules live while it is open; the experience's live for the whole
  session, across scene switches; both hear `sceneChanged` once the new scene's nodes are built. The editor API stores them:
  `PUT …/scenes/{sid}` `{ logic }`, `PUT …/logic` (change kind `logic`); the import checks them; MCP `put_scene` takes `logic`.
- **`goto`** in every rule: `{ goto: "scene:<id>" }` – the engine asks the host (`ArSceneOptions.navigate`); the reader opens
  the scene as a link to `/scene/<id>` does, an unknown address only logs. The guard and the content build check the scene
  exists. Addresses: `shared/types/address.ts` (`parseAddress`, `formatAddress`; SCUTOONS' grammar, room for `toon:`,
  `chapter:` and a later `via`).
- **The canvas** (`LogicCanvas`: `groups`, `notes`, `folds`): the Logic view's authoring data beside a scene's or the
  experience's rules – in the database, the draft and the export, never in a reader's configuration (the content build and
  a publish strip it).
- **`Migration5.php`**: every stored condition to an expression, idempotent, with a dry run (`migrate.php --plan-5`:
  rows per table, conditions converted, approximate *not set* tests, the ones it cannot convert and why).
- **A `set` value is an expression** (B2): `set: { tries: "tries + 1" }` – a counter without a special node; a text value is
  the literal `"calm"` (YAML `'"calm"'`), a number or true / false may stand bare. 4.x text values are quoted by the
  migration.
- **Typed variables** (B7, `shared/types/variables.ts`): `experience.variables` (`{ name: { type, scope?, default? } }`,
  type number / integer / boolean / string) or the type of a variable's first set; expressions typed with the parser's
  tree (`expressionType`). A set or a comparison of another type and a `when` that is not true / false are problems (guard,
  content build); the engine refuses a wrongly typed value – a plugin's too – and keeps the old one; a declared variable
  reads as its default. `PUT …/variables` (change kind `variables`). Migration5 declares an old experience's variables
  from its sets and reports the conflicts.
- **`npm run convert:5`** (`scripts/`): a content folder's conditions to expressions and set texts to literals, once.
- The fixture: a node rule with an expression and a `goto`, a scene rule and two experience rules (one a `goto`), a canvas
  the build leaves out.
- **Editor on 5.0** (#334 L-T5b):
  - **Conditions and set values as expressions** in the Inspector: one monospace field each, checked as you type – a parse
    error, a type error (against the variable's declared or inferred type) or a condition that is no true / false shows
    under the field and is **not saved** (B8); the next text that checks out is. A set's scope is optional (*declared* /
    *scene (default)* / a scope). The rule's type problems show under it.
  - **A scene's and the experience's rules** in the Inspector – the scene's under the scene, the experience's under the
    experience (⚙) – reusing the rule list: they hear the bus only, name a node of the scene's targets (the experience's:
    any scene's) by address `target:<id>/<name>`, and save themselves with `PUT …/scenes/{sid}` `{ logic }` and
    `PUT …/logic` (History lists them, Undo takes them back; the draft's canvas is kept). **goto** is an action everywhere:
    pick a scene.
  - **Variables** beside the experience's rules: name, type, scope, default per declaration (`PUT …/variables`), the
    inferred ones shown as inferred with *declare*; a bad name or a default of another type is refused with the reason.
  - **The Logic panel**: scene rule boxes on the scene level, experience rule boxes on the experience level, both editable
    there (the group level stays read-only, the experience level edits its own rules only). goto: a stub at the scene
    level (*→ Epilogue · goto*, dash-dot), derived scene → scene edges on the group and experience levels, an experience
    rule's goto as a wire into the scene box – connect a rule's do into a scene box to add one, disconnect it to remove it.
    `when` wires come from the condition's variables; wiring a variable in appends `name` (true / false) or
    `name == <its default or a typed placeholder>` with `&&` and says so; cutting one takes its terms out of a top-level
    `&&` / `||` chain, anything deeper is refused with *edit the condition in the Inspector*. A set's wire shows its
    expression (`set = taps + 1`). The problem list adds the rules' type problems, the experience rules' missing nodes and
    gotos to scenes that are not there.
  - **The stage and goto**: the stage stays on its scene; the timeline logs a goto with a link that opens the scene.
  - History names the change kinds `logic` (*Experience rules*) and `variables`.

### Removed
- The object form of a condition (`{ hasKey: true }`, `{ any: … }`, `{ not: … }`) and its types (`BehaviourCondition`,
  `BehaviourTest`) – `BehaviourRule.when` is the expression's text.

## 3.21.2 – 2026-11-20

### Fixed
- **Local MariaDB** (`docker-compose.yml`): a new database volume no longer fails to start. Docker's init step ran
  `schema.mysql.sql` raw and stopped at its first rename for older databases (`spreads` → `scenes`). The first start
  now creates the empty database, and `php server/deploy/migrate.php` (Db::migrate) creates the tables, as
  `scripts/db/pull-staging.sh` already does.

## 3.21.1 – 2026-11-20

### Changed
- **Editor – cutting a rule's *on*** (#334): Delete on a rule's *on* wire, or on a by-name event stub whose listening side is
  here (*keyRattled ← emitted in Cover*), no longer refuses. The rule's *on* is left empty; it hears nothing, and the Logic
  panel lists it as a problem (*Door · rule 3 hears nothing – wire an event to its on*) until an event is wired to it
  again. The reader no longer subscribes to an empty event name.

## 3.21.0 – 2026-11-20

### Added
- **Editor – editing the logic in the graph** (#334 L-T4): on a scene's and a target's level of the Logic panel the rules
  of the open scene's nodes are edited on the canvas. Dragging from a port to a port connects them as the rule grammar
  allows – an event into a rule's *on* makes the rule hear it (by name, as the bus does), a variable into *when* adds a
  condition, a rule's **+** outlet into a node, a variable or an event adds a show, set or emit action, an action's own
  outlet re-aims it; only the inlets that would take the wire light up. Delete on a selected wire removes the condition or
  the action it stands for (a wire that only joins by name removes the name from the listening rules here, and says so),
  on a selected rule removes the rule. A **right click** opens a menu: on the empty canvas (or with the panel's **+**)
  what can be added here – a rule on the selected node, an action or a condition for the selected rule – with a filter
  field on top (typing `emit doorOpened`, `set hasKey`, `when hasKey` or `rule on bellRang` adds a new name); on a box or a
  wire its actions. Every edit is shown in words for a moment under the panel's bar, and an edit the grammar does not
  allow is refused with the reason. Edits go the Inspector's way: live on the stage at once, saved by themselves, a step
  in History that undo takes back. The experience and group levels stay read-only. Delete and Backspace in the panel no
  longer reach the workspace (they never remove the selected tree node).
- **Editor – nodes in the Library** (#334 L-T4): the Library's kind **Nodes** lists the logic's node types (the core's
  events, rules, variables and verbs, and any a plugin registers, with their owner); dragging one onto the Logic canvas
  opens the same add menu there with that type's choices. A file dragged onto the Logic canvas is refused with a hint
  (file nodes come later).

## 3.20.0 – 2026-11-20

### Added
- **Editor – navigating the logic** (#334 L-T3): the Logic panel shows the experience's logic one level at a time – the
  experience, a group, a scene, a target's entity. A double-click, Enter or a box's arrow opens a level, the breadcrumb and
  ↑ / Backspace go back up, a stub at the level's border goes to its far end, and a search finds any box of the experience
  and its scenes. The stage follows (entering a scene opens it, entering an entity selects its node) and, with *Follow* on,
  the view follows a selection made elsewhere. The level is kept in the URL as `?logic=` (`experience`, `group:<id>`,
  `scene:<id>`, `entity:<scene>:<target>[:<path>]`, replaced in place – no history entry per step), so a reload or a
  link lands on it. The graph is drawn with `@xyflow/svelte` as the rendering layer only (pan, zoom, fit; loaded on first
  use), ports and wires distinguished by shape and dash. An event between two scenes is drawn as *never fires*: the engine
  builds only the open scene's rules.

## 3.19.1 – 2026-11-20

### Changed
- **Editor – the logic model** (#334 L-T1, L-T2): the Logic panel's graph now comes from one pure module,
  `editor/src/lib/logic/` – the types of the shared logic model (ports, signals, edges that name the document place they
  come from, stubs, levels), a node type registry with the core's families and verbs, and `project(content, context)`,
  which computes the view of the experience, a group, a scene or one target's entity tree, with stubs for what crosses
  the level and derived edges between scenes for variables and events. The panel still shows the scene level as before;
  navigating the levels comes next.

## 3.19.0 – 2026-11-20

### Added
- **MCP – deliveries** (#322 T8): `preview_delivery` shows what a publisher's delivery plan (`DeliveryPlan`, inline or a
  JSON file) would do to the draft – a summary for the person (new / changed / same / conflict, problems, warnings) and a
  confirmation; `import_delivery` writes it in two steps as `import_experience` – only with `confirm`, and only when the
  comparison is still the one the person saw; `list_deliveries` lists the applied deliveries. docs/mcp.md "A publisher's
  delivery".
- **Server – the list of deliveries** (#322 T8): `GET /editor/experiences/{id}/deliveries?limit=` – the applied
  deliveries newest first, with their counts and the number of changes naming each (`DeliveryRecord` in
  `shared/api/deliveries.ts`).

## 3.18.0 – 2026-11-20

### Added
- **Server – deliveries through the API** (#322 T5): `POST /editor/experiences/{id}/deliveries` takes a publisher's
  delivery as a plan (scenes, entries with their targets, Library files by id or URL – `shared/api/deliveries.ts`) and
  answers the comparison per scene, entry and target (new / changed / same / conflict – a conflict is a field edited in
  the editor since the last delivery, from the change log); with `apply: true` it writes everything in one transaction.
  Each write is a change naming the delivery (`changes.delivery_id`, `delivery` in `GET …/changes`), the delivery a row of
  the new table `deliveries`; existing entries keep their texts. At most 10 targets switched on per scene
  (`MAX_TARGETS_PER_SCENE` in `shared/api/rules.ts`, RULES #3) – the API checks it on a delivery. docs/server.md
  "Deliveries".

### Changed
- **Server – reverting a delivery** (#322): the revert takes a delivery's new scenes, entries and targets back by removing
  them (a target first, an entry without a target, a scene nothing lies on) – other creations stay not revertable.

## 3.17.0 – 2026-11-20

### Added
- **The export read endpoint** (#322 T1): `GET /editor/experiences/{id}/export[?build=]` answers everything an export of
  the experience needs in one read – the draft's configuration (the same assembly as the draft and Publish) or a published
  version's from the content store, every file it names with URL, content path, size and checksum where known (a Library
  upload's full sha256, an imported file's size and `v`; the rest marked `unknown`), the print layout (`layout/layout.json`
  and its sheets), the Code tab's sources and the Library's credit lines. Editors only, like the draft. Typed as
  `ExperienceExport` in `shared/api/editor.ts`; docs/server.md "Export". The CLI that writes the content folder from it
  is T2.

## 3.16.4 – 2026-11-20

### Removed
- **Legacy content tools** (#322, approved by Tilman): the 2.x → 3.0 converter (`scripts/src/convert-content-3.ts`, its
  test, `npm run convert:3`) – every source and database is converted – and `scripts/layout/render-layout.py`, which
  read the 2.x source. The demo's rendered sheets (`fixtures/demo/layout/`) stay: the reader's card back reads its cover.

## 3.16.3 – 2026-11-20

### Fixed
- **Editor – History and Logic did not show** (#318): a panel that starts closed (History, Logic) and had no place
  stored yet kept its default `closed` in the layout, so opening it (the toolbar's History button, the panels menu)
  drew nothing. A tab panel is open while it holds tabs; its default `closed` no longer reaches the layout.

## 3.16.2 – 2026-11-20

### Changed
- **Workflows read only the `OSCT_` names** (#33): the GitHub environments carry `OSCT_BUNNY_STORAGE_ZONE`,
  `OSCT_BUNNY_STORAGE_ENDPOINT`, `OSCT_BUNNY_STORAGE_PASSWORD` and `OSCT_CONTENT_BASE_URL`; the fallbacks to the old
  names are gone from `content.yml`, `demo.yml`, `deploy.yml` and `deploy-staging-ftps.yml`.

## 3.16.1 – 2026-11-20

### Changed
- **Media quality switches at once** (#331): a change of *Picture and video quality* swaps the scene's loaded media
  right away – a playing video or sound goes on at the same spot in the new quality (playing if it played, the same
  element, so the entity and its texture stay), a picture swaps its file in place. Before, the choice only applied to
  what loaded next.

## 3.16.0 – 2026-11-20

### Added
- **Pictures, videos and sounds in quality levels** (#331 step 3, content schema 4.3): an entity's image, video or audio
  file can name `levels` – a picture by its longest side (512 / 1024 / 2048 px), a video by its height (480p / 720p /
  1080p), a sound by its bitrate (64 / 128 / 192 kbps) – and an entry's picture `imageLevels`. The reader loads the level
  its new **media quality** chooses (Info → Settings → *Picture and video quality*: Automatic, Low, Medium, High –
  Automatic goes by the screen, the phone's memory and the connection), falling back to the nearest level: the AR scene's
  pictures, videos and sounds, the entry's picture, the card flip and the preloader. An app before 4.3 loads the medium's
  own file, as before. Content build: `levels:` / `imageLevels:` as level → file; API and MCP (`put_entity`,
  `put_target`, `update_entry imageLevels`) check the levels per kind.
- **Editor – media levels** (#331): a picture, video or sound node has a *levels* section – a chip per level, a missing
  one a slot to upload into or pick from the Library; pictures compute their smaller levels in the browser (WebP), videos
  and sounds are uploaded per level (never encoded in the browser). The entry form has the same row under the picture.
  The Library shows a node's levels as a stack (`▤ 2/3`).

## 3.15.0 – 2026-11-20

### Added
- **Move a target to another surface** (#314): in the Tree, a surface row unfolds to the targets placed on it; drag one
  onto another surface's row, or use its menu's *Move to …*. The target keeps its place in millimetres where it fits on
  the new surface, else it is centred there (made smaller first when it is too big). The target Inspector's *surface*
  choice follows the same rule.
- **A surface's format** (#314): the Inspector's surface has a *format* row – double page, single page, wall or custom –
  next to the free size in mm, and names the targets that lie outside the surface at its size.
- **`put_surface`** (#314, MCP): changes, adds, moves or removes one surface of a scene without sending the whole list;
  a surface in use still goes only with `apply: true`.
- **A surface's own grid, complete** (#316 in #314): besides its spacing, each surface can have **subdivisions** (finer
  lines a print snaps to), be **shown** or hidden, and **snap** on or off – each the toolbar's until set. It stays a
  setting of this browser, not content: a grid is an editing aid and changes nothing a reader sees.

### Changed
- **The origin gizmo** (#316 in #314): the scene's axes at its origin now have arrowheads and a small ring on the
  table, and show with the axis switch alone – no grid has to be on.

## 3.14.0 – 2026-11-20

### Added
- **The Library's leftovers** (#330): **rename a file** – *Rename* in the details drawer, *Rename…* in a tile's menu or
  **F2** on the selected file open its name field (the name before the stored extension; Enter or leaving the field
  saves, Esc keeps the old one) – the name only, the URL and every use stay; an imported file's name is kept by its URL.
  API `PUT /editor/experiences/{id}/assets/{assetId} { name }` (400 `invalid-name`), MCP `rename_asset`. **Drag a tile
  onto a tree row** (a mouse moves, a finger on the iPad holds first): a node takes the file the way the Inspector's *Use*
  does (model → glb, image node → picture, video node → video, a plugin's node type its declared file), a target row a
  picture as its printed image; a label at the pointer says what the drop does, or why it does not fit (cursor *no-drop*,
  the row dashed) – a refused drop changes nothing. The Library only starts the drag; the drop is the tree's
  (`library-drag.ts`, `library-drag.svelte.ts`). **Ctrl+L** (⌘L) opens the Library and focuses its search; again in the
  search, back to the Inspector.

## 3.13.0 – 2026-11-20

### Added
- **Universal panel tabs** (#318): every content of the workspace's panels – Tree, Inspector, Environment, Library,
  Code, Scenes, Info, History, Logic – is a tab that can live in any panel. Drag a tab into another panel's head and it
  lands before or after the tab under the pointer (a line marks where); drag it out onto the stage and it becomes a
  panel of its own there. A panel whose last tab leaves closes; the panel holding the Inspector never closes. The
  arrangement is remembered per workspace in this browser with the layout (a layout stored before is migrated: places,
  closed panels and the Inspector's tab stay); the panels menu lists the tabs and Reset layout resets it. Pointer events,
  so a pen or a finger on the iPad drags tabs too.

### Changed
- A **double-click on a panel's head** (not on a tab) folds and opens the panel, Enter on its focused handle too; the
  chevron button in the head is gone.

## 3.12.0 – 2026-11-20

### Added
- **Original or prepared recognition, switched per experience** (#306, content schema 4.2): the experience's
  `recognition` – *Original* (the default: the reader makes every target's recognition frame from its printed image on
  the phone, the path tested with every target) or *Prepared* (a target's frame made ahead, where it has one) – in the
  editor's experience settings, `update_experience` and the API. A target's *original only* (`recognitionOff`) keeps it
  on its printed image either way. The reader's debug overlay has a Recognition switch (Experience / Original /
  Prepared) that overrides the setting on that phone, and the engine load test's report names the path it ran with.
- **The editor makes the recognition frames by itself**: when a target gets a printed image or is placed on a surface
  and has no frame yet, the browser makes it with the same builder as `osct targets prepare`, stores it in the Library
  and names it on the target – never in the way of the target's change, never touching the printed image. The target's
  inspector shows the frame as a thumbnail with *make frame* / *remake*.

### Changed
- Targets' recognition frames made ahead are no longer used unless the experience (or the phone's debug switch) says
  Prepared – before, the reader used any it found.

## 3.11.1 – 2026-11-20

### Removed
- The one-off rename of zero-padded ids (#63): it ran on staging on 2026-11-20 (50 scenes, 524 entries, 522 targets now without leading zeros), so the admin page's section, `POST /api/admin/rename-ids`, `server/deploy/rename-ids.php` and `IdRename` are gone. The import keeps writing ids without zeros.

## 3.11.0 – 2026-11-20

### Added
- **Recognition data made ahead** (#306, content schema 4.1): `osct targets prepare --experience <id> [--dry-run] [--force] [--all]`
  makes every target's grey 480 × 640 recognition frame – the one the reader makes on the phone when a scene opens
  (S22: 150–260 ms per image) – from its printed image on an instance (editor API, `OSCT_API_URL` / `OSCT_EDITOR_TOKEN`),
  stores it as a Library file and names it on the target (`recognition` { imageSrc, width, height }). The reader hands
  that frame to the engine as it is and preloads it instead of the printed image; targets without it work as before. The
  engine still extracts the features on the phone (it takes no precompiled ones) – recognition stays the same, only
  the preparing goes. The API drops `recognition` whenever a target's image changes (a new `imageSrc`, a replaced image
  file) and refuses a frame of an image the target no longer has (409 `stale-image`). Format of 8th Wall's image-target
  CLI (flat); the CLI itself is not used – interactive only, and its default crop loses a tall page's top and bottom
  (docs/content.md "Recognition").

## 3.10.0 – 2026-11-20

### Changed

- **Ids without leading zeros** (#63): the delivery import (`npm run import`, `prepare-delivery.py`) writes scenes
  `s4-5` / `s4` and entries `p4-1` instead of `s004-005` / `p004-1`; a mapping written with zeros is imported without
  them. The mappings in `scripts/import/` are renamed. The database's existing ids are renamed once with the new
  command `php server/deploy/rename-ids.php --dry-run | --apply [--experience ID]` – by hand, never on deploy; it
  renames scenes, entries, targets, entities and every reference to them (links `/scene/<id>`, the change log), leaves
  file paths, published versions and plugin code alone and refuses an experience with a collision (docs/server.md
  "Ids without leading zeros"). **Readers' progress starts over** once it has run: progress is keyed by the ids
  (RULES #10) – on staging only, no reader in production yet.
- **Admin page: Ids without leading zeros (#63)** – a Dry run button and an Apply button (only after a dry run without
  collisions, with a confirm) for the same rename on a host without a shell, through the new admin-only route
  `POST /api/admin/rename-ids { apply, experience? }`.

## 3.9.0 – 2026-11-20

### Added

- **Editor: the Logic panel – a scene's logic as a graph** (#239, the `nodes` icon): a floating panel of the scene
  workspace that shows, read-only, how the scene's events, `behaviour` rules, variables, the nodes they act on and the
  plugins on its nodes connect – laid out left to right in a small SVG layout of its own (no dependency). What a plugin's
  code hears, emits, reads and sets is read from its source. A click on a box selects that node in the tree and the
  Inspector (a plugin: the Code tab); problems across the experience (a variable nothing sets, an event nothing emits or
  hears, a node an action names that is not there) are listed under it. Built by the pure, tested `scene-logic.ts`
  (docs/editor.md "The Logic panel").

## 3.8.1 – 2026-11-20

### Changed

- **Trigger trial: where a target is printed comes from the configuration** (#32): the trial strip and its md report
  read each target's `place` (its surface, size and box in mm – carried in from the book layout, #321) instead of the
  old protocol file. The report's *Printed image* column names the image file, the surface, the size, the third of the
  surface it lies in and the box's corner; a target without a place shows "not placed". The editor's stage lays
  targets without a place in a row as before.
- **The API is always `/api`** (#33): reader and editor call it on their own origin; no build flag any more.
- **Content CDN settings with the `OSCT_` prefix** (#33): the osct CLI, the workflows and Kamal read
  `OSCT_BUNNY_STORAGE_ZONE`, `OSCT_BUNNY_STORAGE_ENDPOINT`, `OSCT_BUNNY_STORAGE_PASSWORD` and `OSCT_CONTENT_BASE_URL`
  (the server's own names) – `scripts/.env` needs renaming; the workflows fall back to the old GitHub names until the
  environments are renamed (docs/deploy.md).
- **The CDN check's CORS origin from configuration** (#33): `osct content status` / `sync` ask the CDN with the origin of
  `OSCT_APP_URL` (the site the reader runs on) instead of a hardcoded production address; unset, CORS is not checked.
- **`OSCT_CONTENT_DIR` is required** (#33): the content build, the delivery import and the converters stop with a
  message when it is not set – no fallback to a `content/` folder (the content is not in git).
- docs/server.md documents `OSCT_CONFIG_FILE` (another settings file in place of `config.local.php`).

### Removed

- `client/public/trigger-protocol.json` and `npm run protocol` (`scripts/src/protocol.ts`) – stale since the places
  are in the configuration (#32); with them the engine's protocol reader and the stage frame's policy entry for it.
- The build flag `VITE_API_URL` and the unused Docker build argument `VITE_SHOW_LOCKED_ENTRIES` (#33).

## 3.8.0 – 2026-11-20

### Added

- **MCP: `render_scene` – an agent sees a scene** (#89): a picture (PNG) of a scene of the draft as the editor's stage
  shows it, at one of the stage's view presets (reader, top, low, far) – the answer is the image itself and the file's
  path. The MCP server opens the editor's new **render view** (`/editor/<experience>/<scene>/?render=<view>`: the stage
  alone, its state on `<html data-osct-render>`) in the computer's own Chrome or Edge, headless, over the DevTools
  protocol – no browser download, no new dependency; the page's API reads carry the server's token, its writes are
  refused. Works against staging once deployed, without a local dev server (docs/mcp.md "Seeing a scene").

## 3.7.0 – 2026-11-20

### Added

- **Editor: a map's smaller levels computed in the browser** (#331 step 2): a model's *textures* get **Compute 1024 ·
  512** (the sizes a set lacks below its largest map) and **One file → levels…** (one picture uploaded, every smaller
  size made from it) – WebP, drawn here in the browser, uploaded and put in the set. A missing level in the Library
  points there.

### Fixed

- **A 4096 px map keeps its size**: the image rule has a `texture` fit (4096 px) for a model's maps – the editor
  uploaded them with the default and cut them to 2048 (API, editor, docs/content.md).
- The Library's level table names a level's pixels only where they are not its size.

## 3.6.0 – 2026-11-19

### Added

- **Editor Library: stacks and frames** (#331, step 1): a model's map in several sizes is one tile with its levels
  behind it (`▤ 3`, dashed while one is missing); ▤ opens the levels, each replaced alone (every link stays); a missing
  level shows the model node, where the Inspector's *textures* add it. A model's mesh and its maps, a video and its
  subtitles stand in a frame. A model file shows what it carries inside (`◧ map`, `◧ 2 clips`, read from the file's
  start). The Library only shows what the draft links – it makes none. The browser can show every level alone.

## 3.5.1 – 2026-11-19

### Fixed

- **Server tests on MariaDB**: the test schema loader skips a column drop whose table does not exist yet, as
  `Db::migrate` does (#325's drops come before the tables are created).

## 3.5.0 – 2026-11-19

### Changed

- **Accounts: one update option – news from Building Fictions** (#325): sign-up and Info → Account show one switch
  instead of three (experience, artist, publisher); the API key is `buildingfictions` (`POST /auth/request`,
  `PATCH /user`, `GET /user`), the column `buildingfictions_updates`. The deploy migrates every account: on wherever
  any of the three was on. The sign-in mail, the admin's *updates* column and the Newsletter CSV
  (`email, language, buildingfictions, createdAt`; `option=buildingfictions`) follow.
- **Editor Library: a tile's hover actions are icons** – Use, Replace and ⋯ with a native tooltip; the words got cut
  on small tiles.

## 3.4.1 – 2026-11-19

### Fixed

- Library: an imported file's details no longer say *Jan 1, 1970* – it has no date of its own (#330).

## 3.4.0 – 2026-11-19

### Changed

- **Editor: the Library, a real browser with better tiles** (#330): a **scope** on top – *This scene* (the open scene's
  files: its surfaces' reference images, its targets' printed images, the files its nodes use, its entries' pictures; the
  default), *All* (the open scene's files pinned on top, then *Unused*, then a folded group per scene), *Unused* – with
  counts; the kinds as chips counted within the scope (targets, surfaces, images, video, 3D, audio, code); sort (name,
  recently added, size, uses), tile size, tiles or list, and ⋯ (origin, *Name by use…*). Square tiles – the kind and the
  use count on the picture (a dashed 0: unused), a video's duration, the name and one line under it; hover *Use · Replace
  · ⋯*, a click selects, a double click uses, a right click opens every action. The selected file's **details** at the
  panel's bottom: preview, facts, where it is used (a click shows that target, entry or surface), credits and every
  action, *Download* new. **⤢ opens the Library as a browser** over the stage: places with counts (the scopes, recently
  added, missing credits, the kinds, every scene, the origin), the grid grouped by scene, kind or none, the details on
  the right, several files at once (Shift / Ctrl) for download, one credits line and delete. A file field's *Library…*
  shows only the files that fit.

## 3.3.1 – 2026-11-19

### Fixed

- The pages (the app's and the editor's `index.html`) are asked for again on every load (`Cache-Control: no-cache`,
  `client/public/.htaccess`): after a deploy a cached one still named the older build's chunks – the editor ran a build
  behind until a hard reload.
- Admin, *A new code*: its fields lie under each other again (a page-wide `.fields` grid squeezed them into one row).

## 3.3.0 – 2026-11-19

### Added

- **Admin: a QR code for any page** (#326): *A new code* chooses where the code leads – the start, Info, a scene, an entry
  list or an entry – and draws the address with its source as an SVG QR code to download for print (docs/admin.md).
- **Editor: the HDRI can be switched off** (#327): a switch next to the HDRI in the view menu – no sky, the scene's own
  lights; remembered per browser.

### Changed

- **Editor: a resized panel makes room** (#329): the panels in its way move on and, at the wall, shrink to their least
  size; the resized panel stops where they can give no more. Laid out once per animation frame, stored when let go.

### Fixed

- A vertical toolbar turns back into a row (#328): its button did nothing while the toolbar was a column.

## 3.2.0 – 2026-11-19

### Added

- **Arrivals by source** (#324): an address with `?s=<source>` – the book's QR code is `?s=bk1` – counts as an
  arrival from that source; the app reports it once and takes `s` out of the address (`POST /api/arrivals`, no cookie).
  Counts only, per source, day and device class, plus first arrivals – no IP, no user (docs/server.md "Arrivals").
- **Admin: QR codes and links** (#324): the arrivals by source on top of the admin page – per source the window (7 /
  30 / 90 days, a year) and all, first arrivals, phone · tablet · desktop, first and last day, a bar per day; a new code's
  address to copy (docs/admin.md).

### Changed

- **The desktop landing page, redesigned** (#324, on the book's and the app's design): the title as on the book's title
  page in the gold gradient, the book's images scattered around it, the Mark and the app in a tilted phone; a QR code that
  opens the app on the phone (`?s=lp1`, counted in the admin), the address and install; how it works in three steps; the
  shop; a footer – with far more room around everything.

## 3.1.0 – 2026-11-19

### Added

- **Target marks** (#323): a stage helper in the toolbar's *grid & snap* – every target's printed place framed on its
  surface with its id, green and solid for a target in the experience, orange and dashed for a switched-off one
  (docs/editor.md). Off by default, remembered per browser.

## 3.0.1 – 2026-11-19

### Added

- `scripts/layout/place-targets.py` (#321): every target's `place` and every surface's reference image from the
  content's `layout/` (the designed PDFs, 1.10.0), through the editor API (`/editor/experiences/…`, `--experience`) – a dry run with a report and contact sheets
  by default, `--apply` to write (docs/content.md "Placing the targets from the layout").

### Fixed

- Switching a panel's switchable section on opens it (`Section`): switching **Printed book** on showed only the
  "author is empty" error, with the author field folded away.

## 3.0.0 – 2026-11-19

### Changed

- **The experience is the top level – content schema 4.0, plugin API 3.0** (#320, `agents/REFACTOR-EXPERIENCE.md`,
  part A: contract, engine, reader, content build). The configuration's `experience` (was `book`: `id`, `title`,
  `passes`, `environment`, `appearance`); the printed book is its optional `book` (`author`, `publisher` – they were on
  the top level). An experience without `book` is not a book – the demo is now one ("The Demo"). The behaviour and plugin
  variable scope `experience` (was `book`), text nodes' `{{experience.title}}`, `latest.json` / `versions.json` name the
  `experience`. The content source's `experience.yaml` (was `book.yaml`); `npm run convert:4` in scripts/ converts a
  3.x source once. The reader's progress record says `experienceId` (format 3 from app 3.0.0 – a stored record keeps its
  progress, without a notice), the account option `experienceUpdates`; the splash, onboarding, about and landing read
  the author and the publisher from the printed book and leave them out without one. Inside: `<reader-app>` (was
  `<book-game>`), the look-around's `SurfaceAnchor`, `ExperienceDownload`. Reader wording unchanged.
- **The server and the database speak experience** (#320 part B1): the editor API's routes `/editor/experiences/…` (was
  `/editor/books/…`, no alias), `PUT /editor/experiences/{id} { title?, book?: { author?, publisher? } | null }` (the
  printed book removed with `null`), the list's and tree's `experience` (no top-level `author`), errors
  `invalid-experience` / `other-experience`, change and usage kind `experience`, `/progress/{experienceId}`, the account
  option `experienceUpdates` (the admin CSV too). The tables `experiences` and `experience_versions`, the columns
  `experience_id`, `experience_json` and `experience_updates`, the `author` column gone – renamed in place on the next
  deploy, with a data step (`Migration4`) that moves the print data into `book`, drops `sourceOfTruth` and rewrites the
  scope and `{{experience.title}}` in the stored rows and the change log (docs/server.md). `shared/api`:
  `ExperienceSummary`, `ExperienceList`, `ExperienceTree`, `ExperienceSaved`, `ExperienceUpdate`,
  `ExperiencePassesSaved`, `ExperienceAppearanceSaved`, `OtherExperience`.
- **The editor speaks experience** (#320 part C). The experience settings (⚙ after its crumb) hold its **texts** (the
  title) and a **Printed book** section with a switch: on, the book's author and publisher; off, the experience is no
  book – switching a saved book off asks first and removes author and publisher (`book: null`), *Undo edits* brings them
  back. The editor calls `/editor/experiences/…` (was `/editor/books/…`); the Experiences page and the covers show the
  author only for an experience with a printed book; the import button reads *Import 1 experience: …*. Inside: the route
  `[experience]` (URLs unchanged), `ExperiencePanel`, `ExperienceTexts`, `ExperienceSearch`, `ExperienceCover`,
  `StageScene`, the Inspector's section ids `experience.texts`, `experience.book`, `experience.passes` (those sections
  open at their default once), the change log's kind `experience`. The tutorials' images `01-experiences.webp`,
  `07-post-experience.webp`.
- **The MCP server says experience** (#320, part B2, docs/mcp.md): `list_books`, `get_book`, `update_book`,
  `import_book`, `put_book_passes`, `put_book_appearance` are `list_experiences`, `get_experience`, `update_experience`,
  `import_experience`, `put_experience_passes`, `put_experience_appearance`; every tool's `book` parameter is
  `experience`, the routes `/editor/experiences/…`, the error `other-experience`, the change kind `experience`.
  `update_experience { experience, title?, book? }` takes the printed book as `{ author?, publisher? }`, `book: null`
  removes it. `describe_content_model` describes `experience` (with `book`) and the behaviour scope `experience`. MCP
  clients see the new names after the server restarts.

### Removed

- **The source of truth** (`sourceOfTruth`, print first / digital first, #238): every experience adds and removes its
  scenes. Content with the field is refused by the build, the guard and the editor API's import; `convert:4` drops it,
  the database migration too. The error `print-first` is gone.
  scenes. Content with the field is refused by the build and the guard; `convert:4` drops it.
  The editor's source-of-truth control goes with it: scenes are added (the + tile, + after the last scene, the tree's
  scene menu) and removed in every experience.
  scenes. Content with the field is refused by the build and the guard; `convert:4` drops it. The MCP server's
  `update_experience` takes no `sourceOfTruth`, and its `print-first` hint is gone.

## 2.1.0 – 2026-11-19

### Changed

- **The code speaks scenes** (#319, `agents/REFACTOR-319.md`): the 2.x page / spread names inside the engine, the reader,
  the editor, the server, the MCP server, the scripts and the fixtures follow the 3.0 contract – `Scene` (was `Spread`),
  `sceneId`, `getScenes` / `getScene`, `SceneManager`, `<scene-page>`, `<scene-switcher>`, `selection.scene`, the tree's
  `scene` row, `SceneView.svelte`, `prepared-scenes.ts`, the stage's `PlaceBox` / `surfaceHit` (was `PrintBox` / `pageHit`);
  the rendered AR scene's state is `ArState` (was `SceneState`), the body class `ar-active`. The fixture's scenes are
  `scene1` … `scene14`. The reader's words are unchanged.
- **Plugin API 2.0** (no alias – a plugin built against 1.x is not loaded until it is built again; docs/plugins.md):
  `api.scene` (was `api.spread`), the core event `sceneChanged { sceneId, previous }` (was `spreadChanged`), the variable
  scope `scene` (was `spread`), a target's and an entry's `sceneId`, `progress.completion(sceneId?)` / `counts(sceneId?)`,
  the AR scene's state event `arState` (was `sceneState`). The demo's `scenes` plugin emits `stepChanged`.
- **Content schema 3.0, amended in place** (not shipped): a behaviour rule's `set` scope `scene` (was `spread`) and the
  core events `sceneChanged` / `arState` in `on`.
- **The database speaks scenes**: `spreads` → `scenes` (its `title` → `label`), `entries.spread_id` → `scene_id`,
  `books.initial_spread_id` → `initial_scene` – renamed in place by the schema files (`Db::migrate` skips a rename whose
  old name is gone); the 2.x page columns (`first_page`, `last_page`, `entries.page`) dropped; the change log's kind
  `spread` → `scene`; stored behaviour rules rewritten to `scene` / `sceneChanged`.

### Removed

- The migration to schema 3.0 (`POST …/migrate-3`, `Migration3.php`, MCP `migrate_3`, its shared types) – every stored
  book is migrated; its change rows stay readable, not revertable. A 2.x book left in a database answers 409 `old-schema`.
- The editor's exchange of a session token stored before the cookie (`osct-editor-session`, #207 – the API's
  `POST /auth/cookie` stays) and the desk names stored before #226; the reader's old `osct-ar-prepared-spreads` value is
  no longer read.
- Dead helpers the 3.0 cut left: `formatPages`, `spreadWhere` (both `sceneLabel`), `getSurfaces`.

## 2.0.3 – 2026-11-19

### Fixed

- **A missing build file is a 404** (`client/public/.htaccess`): a hashed chunk under `_app/` or `assets/` that is not
  there (mid-deploy, or from an older build) was answered with the app's `index.html` – served as HTML, the module failed
  and the editor stayed black, and the browser kept the wrong answer after the deploy.

## 2.0.2 – 2026-11-19

### Fixed

- **Reference images on the stage with the Scenes panel closed** (#314, #319): the scene workspace reads the book's scenes
  itself – only the Scenes panel did, so a scene opened from a fresh page showed its surfaces without their reference images.

## 2.0.1 – 2026-11-19

### Fixed

- **The reader's progress record at app 2.0** (#319): the storage format follows the app MAJOR, and 2.0.0 had no reader for
  format 2 – a stored progress was reset at every start. Formats 1 and 2 share one reader (`lastSpreadId` is dropped).

## 2.0.0 – 2026-11-18

### Added

- **Remove a scene** (#319): *remove scene…* in the Inspector's scene section and *Remove scene…* in a scene card's menu
  (right click / long press) – first the Inspector shows what goes with its warnings (entries, targets, AR content, what
  other scenes still use, the files only it uses), nothing is removed before the confirmation; the opening scene cannot
  be removed. The open scene gives way to its neighbour.
- **The editor's grids** (#316, #319 part C): the scene's **floor grid** – a transparent net on the table (y = 0) through
  the origin, every tenth line stronger, on by default, its spacing the snap step of the surface gizmo – and an optional
  **vertical grid** (a plane at a chosen z, for wall setups), both in the toolbar's *grid & snap*; a surface's **own
  grid spacing** for the targets on it (the Inspector's surface, *grid* – kept in this browser per experience and surface,
  `osct-editor-surface-grids:<book>`), drawn on every surface in its own plane, a wall's on the wall.
- **Arrange in a row** (#319 part C): the scene's surfaces flat on the table, side by side in their order, touching, the
  row centred on the origin – written to their places (the Inspector's scene section and selected surface, the Tree's
  scene row and surface menus).

- **The migration of a stored book to schema 3.0** (#319 part B): `POST /editor/books/{id}/migrate-3 { apply? }` – the
  plan first, then one transaction, every row a change of the log; idempotent (MCP `migrate_3`, two steps). Per scene
  one surface per printed double page (the 2.x halves merged, a cover one page wide, placed in a row), the label it
  showed (its own, a cover's or the matter's title, else its pages), the front and back matter into their groups;
  entries keep their scene and lose their page; a target's `print` becomes its `place` (a right page's `x` grows by the
  left page's width); the page images and the 2.x surfaces' references of a double page's halves are put together into
  ONE reference image (GD, a new Library file `<scene>_<surface>.webp`), a single one is the reference as it is. The plan
  lists per scene the surfaces before and after, the targets moved, the references combined and what cannot be mapped,
  with the reason (docs/server.md "The migration to schema 3.0"). Until migrated, a 2.x book's editing routes answer
  409 `migrate-first`.

### Changed

- **The editor on content schema 3.0 and the editor API 3.0** (#319 part C): no page numbers, sides, formats, matter or
  layouts anywhere. The Tree, the Scenes panel's cards (a scene's surfaces side by side, each with its reference image
  and the prints on it), the Inspector's scene (label, group, surfaces, arrange in a row) and surface (label, size, place
  and gizmo in every scene, grid, reference image), the new-scene step (presets double / single / wall, label, after),
  the new-target and new-entry forms and an entry's form (its scene and, in a scene of several surfaces, its surface –
  `place.surface` / `surface` only then), the placement rows, the search (scenes by label), the History (kind `scene`),
  the Library (grouped by scene; a reference upload named `<scene>_<surface>`), removal (*Removes scene “4–5” …*), the
  import preview (scenes), the books' covers (the first scene's first surface with its reference) and the route
  `/editor/<book>/<scene>/`.
- **The stage draws a scene as plain boards** at their `place` (a wall stands) with their reference images, else paper;
  targets lie on `place.surface`, else on the scene's first surface; the surface gizmo works in every scene and snaps to
  the floor grid's spacing; the origin's centre is the scene's origin. The view reaches 4 m (walls).

- **The server and the MCP server speak content schema 3.0** (#319 part B, `agents/SCENES.md` "Editor API 3.0"): the
  import takes 3.x configurations only, the draft and every publish are 3.0 (`scenes`, `initialScene`, entries with
  `scene` / `surface`, targets with `place`). The tree is `{ book, scenes, groups }`, the scenes overview `SceneData` +
  `position`, surfaces with their reference, entry and target counts; `POST …/scenes` takes the presets `double`,
  `single`, `wall` (surfaces without a place lie in a row); `PUT …/scenes/{id}` `{ label, group, surfaces, passes }`
  clears the entries and targets on surfaces that go (`cleared { entries, targets }`); entries take `{ scene, surface }`,
  targets `place`; the removal's impact names the scene (`initial-scene`). The book summary has `initialScene` and
  `scenes`; the change log's kind is `scene`; the Library places files by scene (`place { scene, order, more }`) and
  names a reference image `<scene>_<surface>` (`?fit=reference&scene=&surface=`). MCP: `get_scene`, `add_scene`,
  `put_scene`, `delete_scene`, entries with `scene`, `put_target { place }`; docs/server.md, docs/mcp.md.

- **Content schema 3.0 – one clean model of scenes, nothing of 2.x kept** (#319 part A, `agents/SCENES.md`
  "Schema 3.0"; a MAJOR: no reader of 2.x was shipped, `OLDEST_READABLE_SCHEMA_MAJOR` is 3, 2.x content is refused).
  The configuration has `scenes` and `initialScene`; a scene is `id`, `label`, `group?`, `surfaces` (at least one, each
  with its size and a required `place` in the scene's coordinate system) and `passes?`; an entry names its `scene` (and
  a `surface` when the scene has several); a target's `place { surface?, x, y, width, height? }` replaces `print`.
  `SceneData` is the type (`SpreadData` is gone).
- **The reader shows scene labels where it showed page numbers**: the switcher at the bottom, the entries list's
  *Place* column (All sorted by scene order, then title), the entry's *Place* row and its video hint, the image credits'
  headings, the dev tools (camera and trigger trial panels, the trial report). Links are `/scene/<id>`; the progress
  remembers `lastScene` (a stored `lastSpreadId` is dropped). The words: *Place* / *Ort* / *Lieu* / *Plek*.
- **The content build writes 3.0** from `content/scenes/<id>/scene.yaml` (`label`, `order`, `surfaces` – unplaced
  surfaces in a row centred on the origin – `passes`) and an entry's `scene` / `surface` and its target's `place`;
  the configuration's onboarding for 2.24 apps (`tutorial`, `shared/compat/tutorial.ts`) is gone. The delivery import
  maps the mapping's pages to scenes once (one surface per double page, twice the page's width; a cover or a single
  page one page wide) and writes `scene.yaml`; `extract-layout.py` and `prepare-delivery.py` read the targets' pages
  from the delivery mapping.
- The test fixture and the demo book are converted (`npm run convert:3`, `scripts/src/convert-content-3.ts` – the
  rules part B's server migration follows).

### Removed

- From the editor (#319 part C, no backward compatibility): the page images UI and code (`page-images.svelte.ts`), the
  layout sheets on the stage and the cards (`stage-layout.ts`, `sheet-preview.ts`, `SheetPreview.svelte`, the sharper
  sheet image), the spread grid and page names (`spread-grid.ts`, `spread-view.ts`, `spread-edit.ts`), the open and the
  closed book on the stage (cover board, block of paper, fold), a scene's layout (fixed / free, *make free*, *back into
  the row*), a surface's side, `NewSpreadForm` (now `NewSceneForm`).

- From the content schema: `page`, `firstPage`, `lastPage`, a spread's `title`, `format`, `matter` and `layout`, a
  surface's `side`, a target's `print`, the configuration's `tutorial` and the constants `SPREAD_FORMATS`, `MATTERS`,
  `SURFACE_SIDES`, `SCENE_LAYOUTS`, `PRINT_SURFACES`, `STEP_ACTIONS`. The editor still reads them – part C of #319.
- From the editor API (#319 part B, no compat – nothing was shipped): every `…/spreads` route, `GET …/pages`,
  `PUT …/page-images`, `POST …/matter`, `POST …/scenes/migrate`, `POST …/scenes/references/migrate`, the presets
  `cover`, `back`, `foldout`, the pages older apps read (`Scenes::ranges`, an entry's `page`), derived spread titles,
  the compat onboarding, `initialSpreadId`, `unassigned`, `pagesBack` / `moved`, the upload use `?fit=page`
  (`Pages.php`, `shared/api/page-names.ts`, `shared/api/spread-titles.ts`); the `page_images` table is read only by the
  migration. MCP: `get_spread`, `add_spread`, `put_spread`, `delete_spread`, `list_pages`, `set_page_images`,
  `add_matter`, `migrate_scenes`, `migrate_surface_references`.

## 1.116.0 – 2026-11-18

### Added

- **The Surface mode** (#314): a **Surface** tool (S) in the toolbar's tool group – the stage outlines the open scene's
  surfaces, the hovered one lighter, a click selects a surface (no target, no node), Esc deselects. The selection has a
  surface level; the Inspector shows the selected surface (`SurfaceView`): label, side, size, its order, in a free scene
  its place (x y z mm, rx ry rz °) with a **gizmo** on the stage that moves or turns it (saved when the drag ends), its
  **reference image** (Library… / Upload…, fit cover / contain / stretch, remove – editor-only) and *remove surface* with
  a confirmation naming the targets and entries on it. The Tree has a **Surfaces** level under the spread row (a tap
  selects, + adds a page / wall / custom one, Alt ↑ ↓ reorders). Every field saves itself.
- The placement rows and the new-target form offer the scene's own surfaces by id (a fold-out's middle, a wall) and
  write `surfaceId` with a side older apps read.
- The History names a reference image's change (*Reference image · scene · surface*, *image replaced*) and files it
  under its scene; the Library's usage line says *reference image of …*.

### Changed

- The Inspector's scene section: *surface labels* became **surfaces** (`SurfaceList`) – add a page, a wall (a fixed
  scene becomes free) or a custom surface, reorder, remove, select; the same edits as the Tree and the selected surface.
- The stage's surface outlines are monochrome (RULES #38): grey, the selected one white with a black line inside (was
  blue and orange).
- A change of the scenes lays the open scene out again from the new draft (`Stage.relayout` sends the draft first), so
  an added or moved surface shows at once; the reference images come from `scenes.references`.

## 1.115.0 – 2026-11-18

### Fixed

- **The toolbar as a column** (#315): every group stacks – undo / redo / history and Live were still side by side, so the
  column was three buttons wide and its buttons off centre; now it is one button wide, centred. A group's menu opens
  beside its button in a column (right of it, left where the screen ends) instead of below it over the next buttons
  (`menuPlace`).

## 1.114.0 – 2026-11-18

### Added
- Editor stage (#314): the mock stage draws the open scene from its surfaces – a fixed row of any length, each surface
  at its own size (a fold-out's three pages with a fold over each seam), the covers as before; a free scene puts each
  surface at its place in the scene's coordinate system (a wall stands, `rx` 90). Content without surfaces keeps the
  book exactly. Each surface shows its reference image (a new stage input, `surfaceReferences`: scene → surface →
  url + fit cover / contain / stretch), else the page image, else the layout sheet, else paper.
- The scene's coordinate system on the stage: with the grid, a faint grid on the table and (with the axis switch) the
  scene's axes at the origin – x red, y green, z blue. The page grid and the snapping count on the surfaces lying on
  the table, each at its size; a print on a wall snaps to the wall's edges and prints.
- Targets lie on their surface: `print.surfaceId` wins, else the side. Picks, the placement ghost and its handles work
  per surface (walls and a fold-out's middle page included); a placement made on a scene's own surface writes
  `surfaceId` and a side older apps know.
- For the coming Surface mode: the stage outlines / highlights surfaces by id (`surfaceMarks`), reports the surface a
  tap hit (`surfacePick` event) and lists the open scene's surfaces in its layout snapshot.
- The workspace hands each surface's reference image (the scenes list's `surfaces[].reference`, 1.113.0) to the stage,
  read again whenever the scenes change (#314).

## 1.113.0 – 2026-11-18

### Added

- **Surface reference images** (#314, server): a surface of a scene can carry a reference image of the book's Library –
  what the editor's stage will show on it (a scanned page, a photo of the wall); editor-only, never in the content.
  Table `surface_references`, shown in `GET …/scenes` as `surfaces[].reference` { url, name, fit }, set / replaced /
  removed by `PUT …/scenes/{id}/surfaces/{surfaceId}/reference` (fit cover · contain · stretch), change-logged and
  revertable both ways (#312), gone with its surface or scene, counted, relinked and deleted with its Library file
  (#298). `POST …/scenes/references/migrate` turns the page images (#251) into references – plan, then apply,
  idempotent, the page images stay. MCP `set_surface_reference` and `migrate_surface_references`; the editor's API
  client `listScenes`, `putSurfaceReference`, `migrateSurfaceReferences` (the UI follows).

### Changed

- `PUT …/scenes/{id}` (and MCP `put_scene`) takes a surface's `place` (schema 2.36); a target's `print.surfaceId` now
  survives `PUT …/targets/{id}` and `POST …/entries` (it was dropped there) and MCP `put_target` passes it (#314).

### Fixed

- The MCP test's content schema expectation and the editor's generated `plugin-api.d.ts` (`SurfacePlace`) caught up
  with schema 2.36.

## 1.112.0 – 2026-11-18

### Added

- **Content schema 2.36 – surfaces placed in the scene** (#314): a surface's optional `place` (`x`, `y`, `z` in mm,
  `rx`, `ry`, `rz` in degrees) in the scene's coordinate system – one for the whole scene, its origin on the table at
  the middle of the first row, +x right, +y up, +z towards the reader; used by `free` scenes (a wall, a room) – and a
  target's optional `print.surfaceId` (the surface it is printed on, by id). Older apps ignore both; the reader does not
  use them yet. The editor's surface mode and the stage's drawing of surfaces follow.

## 1.111.0 – 2026-11-18

### Added

- **Undo, redo and a History of saved changes** (#312): the stage toolbar has ↶ ↷ (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y –
  not in a text field or the code editor) over the person's own saved changes of this session, newest first – one step
  is a save, an autosaved burst of one thing or a revert's set – and a clock that opens the new **History** panel
  (floating, closed at first): every saved change of the experience with when, who, what and before → after, filtered by
  scene, kind and person; *Revert* writes a change's before back as a new change, *Jump back to here* reverts every
  later change, newest first, as one change set. Both always ask first (`RevertPrompt`): what goes back, later edits of
  the same things that go with it, other people's changes, conflicts that stay. A plain undo of one's own edit runs at
  once. The draft only – never a publish.
- **The API reverts changes** (#312, docs/server.md "Reverting saved changes"): `POST …/changes/{cid}/revert`,
  `…/changes/revert { ids }` and `…/changes/revert-to { after }` – the plan, then `apply: true`; a revert is a new change
  (`changes.change_set`, `changes.reverts`, two additive columns); a thing that no longer holds what a change wrote is a
  conflict, listed and never overwritten; creations, removals, moved entries, plugin sources and deleted files are not
  revertable (`notRevertable` in `GET …/changes`). Scene moves are in the log (`order`) and revert.
- **MCP:** `revert_change` and `revert_to`, two steps each (#312).

## 1.110.0 – 2026-11-18

### Removed

- **The editor's phone layout** (#317): the scene workspace's bottom sheet (its drag, snap and stored height), the tree as
  a tab, ‹ › and + and the toolbar over the stage are gone – the floating panels are the editor's only layout (desktop
  and iPad). With them went the old column widths store (`widths.svelte.ts`; `wordTabs` moved to `panel-tabs.ts`) and
  the stage frame's `sampleBottom` (and the engine's `sampleRow`), which only painted the room the sheet uncovered.

## 1.109.0 – 2026-11-18

### Added

- **An eye on every node of the editor's tree** (#311): models, videos, images, texts, lights, groups – every node of an
  entity, not only the targets, has the visibility eye at the right. Off, the stage stops drawing that node with its
  children (and a click on the stage passes through them), to look into a complex tree; the content and the draft never
  change. The hidden nodes are the stage's preview state by target and path (`nodeKey`, `preview.ts`), cross to the stage
  frame with the preview (checked there: node keys only, at most 50), hold through every rebuild of the entity, and are
  forgotten when the editor page closes – not stored. The stage takes them off the camera's layers
  (`stage/node-hiding.ts`), so the engine's own `visible` (a behaviour's show and hide, a lost target) stays untouched.

## 1.108.0 – 2026-11-18

### Added

- **The Scenes panel as a grid** (#315): beside the filmstrip (the default), a grid – page-wide columns that wrap and
  scroll down, a double page spanning two, a fold-out three. As many columns as the panel's width holds (one when
  narrow, each 88–168 px), fewer and narrower when the panel is short so a whole row shows; the cards scale by
  themselves. The head's film / grid buttons switch it, remembered in this browser.
- **The toolbar as a column** (#315): its button turns it between one row and one column (remembered in this browser);
  as a column every group is one button and its menu.

### Changed

- **The toolbar no longer folds** (#315): its fold button is gone (a fold stored earlier is ignored).
- **The editor is monochrome** (#315, RULES #38): no gold – the open scene, the groups' bands and the toggles that are on
  in the text's colour, a pick in grey; only an error has a colour (a group above its loading window too). The
  experience card's fallback title is plain text.

## 1.107.0 – 2026-11-18

### Removed

- **The world model of the look-around** (#310): after the built-in café (1.104.0), the world model (`worldSrc`) is no
  longer loaded or drawn, in the reader or on the stage – only the sky image and the onion sky remain. The Environment
  tab loses its world row (sky and onion sky only), the HDRI picker's note names only the sky. Content with `worldSrc`
  stays valid and is ignored.

## 1.106.0 – 2026-11-18

### Added
- **Floating panels in the scene workspace** (#308, after the SCUTOONS deck editor): on a desktop and an iPad the stage
  is the whole window and the Tree, the Inspector (with its tabs), the Scenes filmstrip, Info and the stage's Tools float
  over it – each moves by its head (snapping to walls and other panels, never on another), resizes by its edges, folds to
  its head and, unless essential (Inspector, Tools), closes. The top bar's panels menu brings closed panels back and
  resets the layout; the layout is remembered per workspace in this browser. The phone keeps its sheet.
- **The select tool** (Q, a plain pointer – no gizmo until move / rotate / scale is chosen) and the **select filters**
  entities, targets, models, nodes: toggles saying what a click may pick, none on = anything (#308).

### Changed
- The stage toolbar's pick modes became the select filters; **render quality** (wire / solid / textured / rendered) is
  one button with its menu instead of four buttons (#308).

## 1.105.1 – 2026-11-18

### Fixed
- **Environment tab**: world and sky are each a block with a line between them, and a file field's name keeps room
  ("none" instead of "n…") – the sky's picture no longer reads as the world's (#310).

## 1.105.0 – 2026-11-18

### Changed
- **Experiences, not books** (#313, Tilman): the editor's top bar, start page and settings say *Experiences* /
  *experience*; *Import an experience*.
- **No overview page** (#313): an experience's address opens the scene last open in this browser, else the first – the
  Scenes panel under the stage has the scenes, their order and groups. An experience without scenes offers its first.

### Removed
- **The book page and its Pages view** (agreed by Tilman, 2026-11-18). Page images stay on the stage; editing them moves
  to the scenes' reference images (#307 phase 3b) – until then through the MCP (`set_page_images`).

## 1.104.1 – 2026-11-18

### Changed
- **The tree** (#311, Tilman): a target no longer shows "in view"; a target switched off (not in the reader's
  book) shows a slash icon instead of the word "off".

## 1.104.0 – 2026-11-18

### Removed
- **The built-in world café** of the look-around (#310, Tilman): no alien sky and open-air café around the book any
  more. An experience's own world model and sky image are still drawn while scanning; without them nothing is. The
  editor's Environment tab says "none" for an empty world or sky. No content change: `world: "cafe"` stays readable.

## 1.103.3 – 2026-11-18

### Changed
- In the experience settings the sections read just "appearance" and "post-processing" – no level in their heads
  (Tilman, #307).

## 1.103.2 – 2026-11-18

### Changed
- The Scenes panel's "+ Scene…" is a file-plus icon (#307, Tilman).

## 1.103.1 – 2026-11-18

### Changed
- The appearance section's head reads "appearance · the experience" (was "· the whole book") (#307).

## 1.103.0 – 2026-11-18

### Changed
- **The experience's looks behind its settings** (#307 phase 3c, Tilman): the experience's post-processing and its
  appearance are edited behind the experience settings ⚙ (the top bar, beside the book's name) – every scene without its
  own shows them. A scene's Inspector shows its **own** post-processing as a child of the scene (an override – "own for
  this scene" / "back to the experience's").
- **The "Spread" section is gone** from the scene's Inspector: its title, pages and format are the scene and its surfaces
  (a double page is two surfaces); the environment is edited in the Environment tab.

## 1.102.0 – 2026-11-18

### Changed
- **Scenes panel** (#307 phase 3c, Tilman): Group / Ungroup are one toggle – a folder icon groups, folder-minus
  ungroups (Ctrl+G / Ctrl+Shift+G in the tooltip); the mouse wheel scrolls the strip sideways (up/down, no Shift) as the
  arrow keys do; the cards scale with the panel's height – the zoom buttons are gone – and the panel keeps a minimum
  height.
- **Scene Inspector**: a scene without a group reads **self**; a grouped scene has a link icon to its group; the
  surfaces' section is called **Surface labels**.

## 1.101.2 – 2026-11-18

### Changed
- **Editor top bar**: Admin, the e-mail and Sign out moved into an account menu (☰) at the right, beside Publish – the
  e-mail is the menu's head (#309, Tilman).

## 1.101.1 – 2026-11-18

### Changed
- ‹ › (previous / next scene) moved from the Inspector's head to the right end of the Scenes panel's head, beside the
  zoom (#307, Tilman). ← → still step through the scenes; on a phone they stay at the stage's corners.

## 1.101.0 – 2026-11-18

### Added
- Editor: the **Scenes panel** (#307 phase 3a) – a filmstrip at the bottom of the workspace's stage column: every scene
  as a card (its picture, name and target count; the open scene framed gold), groups as bands with their scene and
  target counts and a warning above the loading window; a click opens a scene, Shift / Ctrl pick several, ← → and Enter;
  drag cards or a whole band to reorder (a gold line shows where they land, over a band they join the group); Ctrl+G /
  Ctrl+Shift+G group and ungroup; + Scene… with the layout presets; collapse, resize and zoom.
- Editor Inspector: a **group** (a band clicked) – its label, scenes, switcher stop, targets against the loading window,
  Ungroup; the open **scene**'s label, layout, group and its **surfaces** (side, size, label) above the spread's sections.

### Changed
- Editor book page: the spreads grid became the **scenes** – the same cards, groups as headed sections, drag, group,
  + Scene… with the presets, a card's menu with *Add a scene after…* and *Remove* – for print-first books too.

### Fixed
- Editor Info view: a focused control removed while the page renders no longer throws (`state_unsafe_mutation`).

## 1.100.0 – 2026-11-17

### Changed
- **The marginalia card starts by itself** (#285, Tilman: *"maybe just target trigger, so it immediately starts – its
  confusing otherwise"*): a glossary target found in scan mode flies its card at once, every time it is found anew,
  and the entry opens when the card has landed – no tap. "New marginalia unlocked" shows on the first find only. Once
  the card opened its entry it flies again only after the page has left the camera, so coming back to the scan with
  the page in view does not open the entry again. A tap on the found page still opens the entry directly; it takes no
  taps while the card flies.

## 1.99.0 – 2026-11-17

### Added

- **Scenes on the server** (#307 phase 2, `agents/SCENES.md`, docs/server.md "Scenes"): a book is an ordered list of
  scenes – the order is `spreads.position` only, an entry's scene is `entries.spread_id` (its own truth, never recomputed
  from a page), its surface in the entry; groups in `books.groups_json` (migration: `ALTER TABLE books ADD COLUMN
  groups_json`). New routes: `GET …/scenes`, `POST …/scenes` (a scene anywhere from a preset: single, double, cover, back,
  fold-out of three, wall), `POST …/scenes/move` (one or several, to a place or into / out of a group – plan, then
  `apply`), `PUT …/scenes/{id}` (surfaces, layout, label, group), `DELETE …/scenes/{id}`, `POST …/groups` (from picked
  scenes – plan, then `apply`), `PUT …/groups/{gid}` (rename), `DELETE …/groups/{gid}` (ungroup, the scenes stay in place),
  `POST …/scenes/migrate` (a book's spreads get surfaces labelled with the printed numbers, the front / back matter
  their groups, every entry its surface – plan, then `apply`; idempotent). `POST …/entries` and `PUT …/entries/{id}`
  take `scene` / `surface`; a `page` alone still finds its scene (older clients).
- MCP: `list_scenes`, `add_scene`, `move_scenes`, `put_scene`, `delete_scene`, `group_scenes`, `rename_group`,
  `ungroup`, `migrate_scenes`; `add_entry` / `update_entry` take `scene` / `surface` (docs/mcp.md).

### Changed

- **Nothing renumbers any more** (#307): adding, moving or removing a scene changes no other row's pages, no entry's
  page, no `print.page` and no page image (`Books::renumber`, `Pages::shift` / `drop` and `Pages::reorder` are gone;
  the matter's new spreads take their places in the order – `Pages::placeMatter`). `moved` is always zero, `pagesBack` 0.
- **The pages older apps read** (RULES #10): the draft writes a scene's stored range while the ranges stay in order and
  apart, else a range derived from the order, and every entry's `page` inside its scene's (`Scenes::ranges` /
  `pageOf`); the editor's tree and the entries list show the same. Apps before schema 2.35 show those numbers as pages
  after a scene moved out of its printed place – documented, accepted.
- **Print-first books take new scenes and lose them like digital-first ones** (#238's restriction goes): `POST
  …/spreads` and `DELETE …/spreads/{id}` no longer answer 409 `print-first`; a cover or back cover may be any one-page
  scene.

## 1.98.0 – 2026-11-17

### Added

- **Scenes in the content contract – schema 2.35** (#307 phase 1, `agents/SCENES.md`): a spread (the scene – the type is
  also named `SceneData`) may carry `surfaces` (`id`, `side`, `widthMm`, `heightMm`, `label` as printed), `layout`
  (`fixed` | `free`), `group` and `label`; the configuration `groups` (`id`, `label`); an entry `scene` and `surface`.
  **An entry's `scene` decides its spread, not its `page`** – the engine reads it (`sceneIdOf`, `engine/src/content/scenes.ts`),
  with `getGroups()`, `getSurfaces()` and `getEntryPlaceLabel()`. The guard checks that a scene names a group that exists,
  an entry a spread that exists and a surface of that scene. Old content reads as before; an older app ignores the fields
  and places entries by `page`, which stays required and written.
- **The reader shows labels as printed**: the entries list's page column, the entry's *Page* row and its "go to page"
  note show the entry's surface label when it has one; the page scroller and the image credits show a scene's `label`,
  else its surfaces' labels (`40–41`, *Pages 40–41*). Without labels nothing changes.
- **Writers carry `scene`**: the content build writes it on every entry from the spread its page lies in; the editor's
  draft (`ContentVersion::assemble`) from `entries.spread_id`, right after `page`, dropping a `surface` the entry's
  scene does not have. An import places an entry on its `scene` when it names a spread of the configuration. The MCP
  content model describes the new fields.

## 1.97.3 – 2026-11-17

### Fixed

- **The Library's count and the delete check agree – one list of a file's uses** (#298 phase 2): `AssetNames::usesOf`
  is now the only place that finds a file's uses; the Library's count and place, the usages endpoint, the delete check,
  a removal's files and the names plan all read it. It now also counts **page images** in the Library (they were
  only in the delete check), a **spread's own files** (its environment, passes or appearance naming a file), the
  **book's other settings** (appearance, passes with a texture or model) and the **print layout's sheets**
  (`layout/sheets/*.jpg`, `*@sharp.jpg` – the stage reads them through `layout.json`; used whenever the book has
  `layout/layout.json`). The 264 sheets staging listed as unused now count as used. New usage kinds `spread`, `book`,
  `layout`; usages come in page order. A file only a spread, a book setting or the layout uses keeps its name.

## 1.97.2 – 2026-11-17

### Changed

- **Page 1 and the last printed page show their facing half** (#251): a single printed page whose unnumbered half
  exists – a page image of its own (*next to 1*, *next to 256*) or the other half of the layout's double sheet – is a
  double page card on the book page, the half on its side of the gutter (page 1's left, page 256's right). Its targets
  stay on the printed page; without the half the card stays the single page, the covers stay single pages. On the stage
  a one-page layout sheet of such a page now lies on its printed half instead of across the spine.

## 1.97.1 – 2026-11-17

### Changed
- **Name by use** keeps an uploaded model's or texture's own name after its place instead of its asset id:
  `fight_2_remesh_4096.jpg` → `p010-3_fight-2-remesh-4096.jpg`, not `p010-3_p010-3-18f8e17a-4096.jpg` (#298, Tilman).

## 1.97.0 – 2026-11-17

### Added
- The editor converts pictures to WebP in the browser before uploading (#298, like SCUTOONS' asset manager;
  `editor/src/lib/browser-webp.ts`): every upload and replace (Library, file fields, Pages view single and *Upload many*,
  new target and entry forms) turns a JPEG, PNG or WebP upright by its EXIF orientation, scales it down to the use's
  longest side (target 1200 px, the rest 2048 – never up) and writes WebP at quality 82 with its transparency (lossy – a
  canvas has no lossless WebP), named `<name>.webp`. SVG, GIF, animated PNG / WebP, a WebP within the size, pictures
  above 50 MP and anything the browser cannot decode or encode go as they came; the API's conversion stays the fallback
  (MCP, scripts, a server without GD converts nothing – staging's shared host). The Library's notice line reports the
  browser's conversion as it reports the API's.

## 1.96.0 – 2026-11-17

### Added
- Clear spread titles (#298, phase 3; `shared/api/spread-titles.ts` = `Pages::withTitles`): a spread without a title of
  its own shows the one its pages give – `Pages 118–119`, `Page 256`, `Cover`, `Back cover`, `Front matter 1`,
  `Back matter 2` – in the editor, the MCP and the content the server assembles (the reader's page scroller). A stored
  title that only repeats the pages (`118–119`, `256`, `New spread`) counts as none, so inserting or removing pages never
  leaves a stale title; a title of its own is kept. `PUT …/spreads/{id} { title: "" }` (or null) goes back to the pages'.
  Ids never change.
- Library files named by use (`AssetNames.php`): `POST /editor/books/{id}/assets/names { apply? }` proposes the names
  every used file takes by its first use in page order (`p118-1_target.webp`, `p118-1_image.webp`, `page-118.webp`,
  `page-cover.webp`, `page-front-1-left.webp`, `<entity>_<asset>.glb`, `environment_sky.webp`) and writes them with
  `apply: true` – the name only, every URL stays. Imported files get a listed name (`asset_names`, by URL – a new table).
  Uploads name their use at once: `?fit=target&entry=<id>`, `?fit=entryImage&entry=<id>`, `?fit=page&page=<n>` (400
  `invalid-use` for no page of the book).
- The Library groups its files by spread (a header per spread in book order, then *Not in a spread*, then *Unused*),
  says *+N more* for a file used in several places, and has **Name by use…** (the plan, then *Rename N*). The editor
  names an entry's picture, a target's printed image and page images by their use when it uploads them.
- MCP: `plan_asset_names` (read-only) and `apply_asset_names`; `upload_asset` takes `entry`, `page`, `facing`;
  `set_page_images` names its uploads by their page.

### Changed
- A double page added without a title has none of its own (was *New spread*): it shows `Pages 12–13`.
- `GET …/assets` lists each file's first use (`place`: spread, page, order, more) and an imported file's `named`.

## 1.95.0 – 2026-11-17

### Added
- One image rule for every picture (#298, phase 1; `shared/api/images.ts`, docs/content.md "The image rule"): at most
  2,048 px on the longest side for page images, an entry's colour picture and every other Library picture, 1,200 px for a
  target's printed image; WebP at quality 82, lossless with transparency; never scaled up; EXIF orientation applied,
  metadata dropped; above 50 MP refused (413 `image-too-large`).
- The API converts every uploaded or replaced jpg / png / webp to WebP at upload (`Images.php`, GD): stored as
  `<name>.webp`, `converted` in the answer; `?fit=target` (and `page`, `entryImage`) names the use – 400 `invalid-fit`
  for another. Without GD, for an unreadable or animated picture and for a WebP within the rule the file is stored as it
  came. Duplicates go by the stored (converted) bytes. The Docker image has GD with WebP, JPEG and PNG.
- The editor names the use where it knows it (a target's image field and the target picker's upload: `target`; the
  Pages view: `page`; an entry's picture: `entryImage`) and the Library says what a conversion made of a file
  (`Photo.jpg (6.2 MB) is stored as Photo.webp – 2048×1536, 412 kB`).
- MCP: `upload_asset` takes `fit` (`"target"` for a target's printed image), `set_page_images` uploads as page images;
  the rule is in `upload_asset`'s description and the content model (`images`).
- The content build writes WebP behind `OSCT_IMAGE_FORMAT=webp` (libwebp as WebAssembly – `@jsquash/webp`): every image
  the configuration names, at the rule's sizes, renamed in the configuration. The default stays JPEG until the image
  targets are checked with WebP on a phone.

## 1.94.0 – 2026-11-17

### Changed
- Buttons have no fill and never a border, only a drop shadow – the primary too (#297): the onboarding buttons are
  transparent glass with their white glow, the primary loses its border sweep (the label still shines), the scroller's
  active spread is a transparent pill with the gold glow. The gold glow marks the active item (the selected list's
  pill, Videos while shown, the current settings option, now without its gold ring); every other pill and the "i" have
  the grey shadow.
- The header shows the crocodile eye of the onboarding in scan and consultation instead of the Mark, at the onboarding
  size (#297); the coach mark cuts an ellipse round it. The old Mark files stay in `public/`.
- The Info colophon follows the design's lines (p. 61): "Publisher: Building Fictions, Amsterdam", "ISBN: …" (#297).
- The pick-up: "New marginalia unlocked" (was "New entry unlocked", gold, shimmering) and its sound, with the card
  flight as the one animation – the label also shows while the card flies (#297).
- The Marginalia pill has the design's inner padding on both sides (1.1rem), so the ≡ sits as far from the left edge
  as the label from the right (#297).

### Removed
- The slanted target picture beside the header icon in consultation (#283, a misreading – #297).
- The header's dark backdrop in consultation (#283): the header is transparent again, the pages scroll under it (#297).
- The Building Fictions logo in the Info colophon (#297; `bf.svg` stays in `public/`).
- The found indicator's picture, its shadow, the unlock rotation, the sparkles and the label's glow and dark backdrop
  (#297); a transparent tap area where the picture was keeps opening the entry (and starts the card flight).

## 1.93.0 – 2026-11-17

### Added
- Editor: a **Pages** view on the book page – every page in order (the covers, the front and back matter, the
  unnumbered halves next to page 1 and the last page) with its own image. A page image is uploaded or picked from the
  Library on its own and wins over the print layout's sheet for that page on the stage and the spread cards; replace,
  move, rename and remove it, or drop many pictures at once – they are matched to pages by their names (`P012…`,
  `F1`, `start-1` …) and shown as a list to correct before anything is applied. The reader never shows page images
  (#251).
- Editor and MCP: the front and back matter a book is missing are added in one step (the Pages view's *Add the missing
  pages*, `add_matter`) – also on a print-first book; the last printed page gets its own spread and the back cover moves
  after the back matter (#251).
- MCP: `list_pages`, `set_page_images` (by page, label or file name, uploading local files) and `add_matter` (#251).

### Fixed
- Editor: a single left-hand page's card (the last printed page) shows the left half of its sheet, the half with the
  page (#251).

## 1.92.2 – 2026-11-17

### Fixed
- The coach marks stop following the page scroller once they are taken out of the page – a frame that fired after a
  test's window was gone failed the client checks in CI (#282).

## 1.92.1 – 2026-11-17

### Fixed
- The "i" in the header has the grey shadow of an inactive button, like Videos while a Marginalia category is shown;
  the gold glow marks only the active item (#283, #286).

## 1.92.0 – 2026-11-17

### Added
- Desktop landing page (#293, design p. 59 "web only"): a visitor on a computer (mouse or trackpad, no phone or tablet
  browser, a window at least 900 px wide; never in the installed app) first sees what the app is – the companion to the
  book – and how to get it: the address to open on the phone, or install (the Info page's install section). Beside it
  the app in a phone frame, below it the book and the T-shirt with links to the Building Fictions shop. "Open the app
  here" starts the app as before (remembered for the browser tab); nothing starts behind the page. Phones and tablets
  are unchanged. Shop URLs, preview and pictures are configuration (`components/desktop-landing/landing-config.ts`,
  `public/assets/ui/landing/`); the shop URLs and pictures are placeholders.
- `goldButton({ href })` renders a link in the design-button look (new tab).

## 1.91.1 – 2026-11-17

### Fixed
- A link straight to the image credits (`/credits`, #292) or to the entries list's All view (`/entries/all`, #286)
  showed "This page doesn't exist" – both open now.

## 1.91.0 – 2026-11-17

### Changed
- Scan: the page scroller in the new design (#284, design p. 17–22, 44–52). The hint above it reads "Scroll to spread
  to activate content" (was "Pages activated:"; `scan:scrollToActivate` in all four languages, wraps in the longer
  ones); the active spread is a whitish pill with gold text and a gold glow (`--scroller-pill-background`,
  `--shadow-gold`) instead of the bronze glass pill, so it reads on the white page and over the camera picture alike.
  When a spread is activated is unchanged.

## 1.90.0 – 2026-11-17

### Added
- AR video: a tap on a video pauses it, the next tap plays it on (design p. 46–52, #290). A video entity's tap is the
  video's – it no longer opens the target's entry (`targetTapped` tells the app whether the entity used the tap); a
  tap on any other entity still opens its entry, a glossary picture still flies its card. The subtitles follow the
  video's time, so a pause holds them in step.
- AR video sound within the browser's rules (#290): the reader's Sounds switch decides whether videos play with sound
  (off: muted, subtitles still show). A video the browser starts muted (no user gesture yet, e.g. iOS) gets its sound
  with the next tap on the scan view; a tap on that video itself gives the sound and does not pause it.

### Changed
- AR video position (#290): a lost video stops where it is and goes on from there when found again; switching to
  another spread and back (or rebuilding the scene) now resumes it where it stopped instead of from the start.

## 1.89.0 – 2026-11-17

### Added
- Scan: coach marks over the first scan (#282, design p. 15–16). After the onboarding a dark veil walks the reader
  through two steps, each with a hole that shows the control the text talks about: the page scroller at the bottom
  (arrows at its ends nudge left and right – it scrolls; they stand still with reduced motion), then the icon at the top. "Continue",
  then "Ok, I get it". An overlay only – the mode, the route and the AR scene stay as they are. Texts in all four
  languages (`tutorial:coach`).
- Progress record: `coached` (additive within format 1 – an older app drops it, a record without it shows the coach
  marks once). Ending the onboarding clears it, so a replay from Info shows the coach marks again; account sync keeps
  it if either side has it.

## 1.88.0 – 2026-11-17

### Added
- Image caption (#289, content schema 2.34): an entry's optional `caption` – the line under its picture ("Image:
  anatomical illustration by …"), plain text in Small, muted. Written in the editor's entry form (under the picture),
  with the MCP tools `add_entry` / `update_entry` (`get_entries` reads it), `PUT` / `POST …/entries` of the API, or
  `caption:` in the entry's YAML (and the delivery import's mapping). An older app ignores the field. It is the entry's
  own text, not the Library's credit line (`credits`, #292).

### Changed
- Entry page (#289, design p. 23–25, 32–33, 38–39): the meta table reads Name / Page / Category, a text's Title /
  Page / Category / Author (before: Entry name / Access page); the body is set in Medium; a link's video player runs
  across the screen's full width (the consultation pages' side gutter is the token `--content-gutter`).

## 1.87.0 – 2026-11-16

### Added
- Onboarding: a new step after the intro – "In the context of this publication, these entries are called
  'marginalia'." (#281, design p. 9). The onboarding now has five steps (splash, intro, marginalia, camera, done).
- Splash and onboarding: the design's green eye (a placeholder until the final icon) in row 1 of the grid instead of
  the Mark – `public/assets/ui/onboarding/icon.png`, swappable without code changes (#281). The header keeps the Mark.

### Changed
- Splash: the icon and the book title show at once, then the author and the publisher fade in together (after 1 s,
  over 1 s) – in the static splash too (#281, design p. 5–7).
- Onboarding steps: no fade-in any more – the button shows the next step at once (#281).
- Onboarding texts (en, de, fr, nl): the intro names the entries, the camera step is shorter, the denied notice reads
  "Please, allow the camera access for this site in your settings, then reload the page." (#281). The non-English
  texts are first drafts for the translation review (#224).
- Camera notice during onboarding: on the grid of the steps (icon, text from row 3, buttons from row 5, #281).

### Removed
- The gold camera drawing on the camera step and the camera notice (#281, agreed in the design review). The file
  `tutorial-step-2.svg` stays in `public/` for now.

## 1.86.0 – 2026-11-16

### Added
- Gold shimmer (#280): a slow light band sweeps through gold text – the shared `.gold.shimmer` modifier with the
  tokens `--gold-shimmer` and `--shimmer-duration` (4 s, a sweep then a pause; CSS `background-position` only). On
  the book title of the splash (also in the static splash of `index.html`) and on "New marginalia unlocked"; the
  primary buttons' shine uses the same band (`--shine-duration`, 1.8 s). Off with reduced motion.
- Vertical grid (#295): the page area (the screen without the safe areas) in six equal rows, tokens `--grid-row`,
  `--grid-rows`, `--grid-top`, `--grid-bottom`, rows at least 6 rem (`--grid-row-min`, short and landscape screens
  scroll). Dev tools: a "Grid" switch draws the rows over every screen (`<html data-row-grid>`).

### Changed
- The splash and onboarding sit on the vertical grid (#295): the Mark centred in row 1, the illustration in row 2,
  title and text from the top of row 3, the button or the footer (publisher) from the top of row 5 – before: the
  Mark at 11 % of the screen and the button at 58 %. A longer text still pushes the button down.

## 1.85.0 – 2026-11-16

### Changed
- **Consultation list** (#286, design review): on the left a burger dropdown (≡) – the **Marginalia menu** with
  Marginalia, Texts, Links and the new **All** – the selected choice gold and on top, the others white, one radio
  group; on the right a separate **Videos** button. The button of the list shown is gold and glows, the other white.
  On the Videos and on an entry the left button reads **"Marginalia"** (it goes back to the list). Under the menu a
  counter per category – "32 / 60 Marginalia consulted", "1 / 1 Texts consulted", "2 / 35 Links consulted" – counted
  like the header's (only entries in the content); none for All and the Videos. The glossary is labelled
  **"Marginalia"** in the reader (and named so in the editor and the MCP description); its key stays `glossary`.
- **List rows** (#287): a "Name | Page" head ("Title | Page" for texts), the page right-aligned. **Every entry is listed
  from the start** – consulted ones open, the others are greyed and cannot be opened (until now production hid them;
  `VITE_SHOW_LOCKED_ENTRIES` is gone). All lists every entry but the videos by page, without letters. Works (texts,
  videos, links) show the title in italics without quotes – *Fake For Real*, Catherine Guiral. A name too long for its
  line ends in "…" and after 2 s scrolls once to its end and back (not with reduced motion).
- **Videos list** (#288): "Go to page in scan mode to play the video." above a white Name | Page list whose rows cannot
  be opened – a video is found by scanning its page; tapping it there still opens its entry.

## 1.84.0 – 2026-11-16

### Added
- The reader is set in ABC Areal (Dinamo), loaded from the CDN font folder (`@font-face` written into `index.html`
  at build time, `VITE_FONT_BASE_URL`, Arial as the fallback) and kept by the service worker for offline use (#278).

### Changed
- Typography: two type sizes – Medium 1 rem for titles, body text and buttons (was 15 px), Small 0.75 rem for
  captions, the consulted counter and hints (was 13 px); tracking 0.04 em (was 0.02), line height 1.375 (was 1.25),
  onboarding and camera texts 1.5625 (#279).

## 1.83.0 – 2026-11-16

### Changed
- **Header** (#283, design review): scan mode shows the icon only – the counter is gone there. In consultation the
  picture of the current target sits beside the icon as a slanted card (on an entry its own target, elsewhere the
  current spread's target found last); a tap still goes back to scan mode with the tap sound. The counter sits close
  under the icon, small and gold, and reads **"Marginalia consulted"** (all four languages). The "i" is white at the
  Medium size; the × on Info and the image credits stays gold. A dark backdrop that fades out below the header lets the
  pages' text scroll under the icon instead of through it.

## 1.82.0 – 2026-11-16

### Added
- **Image credits page** (#292): Info links to a page that lists the credit lines of the pictures in the book's
  margins, grouped by spread (*Pages 2–3*, by page). The lines are the ones written per file in the editor's Library
  (#277): the editor's API puts the lines of the files the book uses into the configuration (content schema 2.33,
  `credits`), so an edited line is in the draft at once and reaches readers with the next publish. The MCP server's
  content model explains it.

### Changed
- **Info page** (#291): the design's order – the info text with the link to the image credits, install as app,
  Account, Settings (sounds and vibration, language, then graphics and the download), colophon with the new lines
  (app development, design and editing, glossary editing, font, publisher, ISBN, ©). A gold × in the header takes the
  place of the "i" on Info and the image credits: it closes Info to the entries list and the credits back to Info; the
  "Entries" button on Info is gone.

## 1.81.0 – 2026-11-16

### Added
- **The marginalia card** (#285): tapping a glossary picture whose entry is not consulted yet peels the printed
  picture off the page like a sheet of paper – it slides up the page, curls its top edge up and, while it rises,
  turns into a convex bow with a slight twist. It spins about its vertical axis (the back is the book's cover from the
  print layout, a gold-framed pattern without one), stiffens into a card and smashes against the screen dead centre,
  where it becomes the entry's own picture in full resolution; it bounces, shakes and the phone vibrates. Then the
  entry opens. All of it is fluid, only the smash is hard; it takes 0.8 s from a close page up to 1.2 s from a far
  one. The card follows the page every frame and goes on from its last pose when the page is lost.
  Already-consulted entries, Texts, Links, Videos and reduced motion open the entry at once as before. A sandbox
  (`sandbox/card-flight/`) shows the flight on a simulated page.

## 1.80.0 – 2026-11-16

### Added
- The six pages before page 1 and the six after page 256 – the cover, the front matter, the back matter and the back
  cover – are spreads of their own, so AR can be placed on them in the editor (#296). A double page without printed
  numbers is marked as front or back matter (content schema 2.32); the editor's stage shows its sheet from the print
  layout, the reader's page scroller and an entry's page show its title instead of a number.
- The delivery import writes a spread for every sheet of the print layout that has none: the covers, the front and
  back matter, and numbered pages without an entry (page 256).

## 1.79.0 – 2026-11-16

### Added
- **Credits in the Inspector** (#277, Tilman: "the credits field works for 3d items as well. any content"): every file
  field of the Inspector – a target's printed image, a node's model, video, image or sound, the environment's files –
  shows the file's credits line under it and edits it there. One field for it (`CreditsField`): the Library opens the
  same one with its new *Credits…* action beside *Replace…* and *Delete*; the line belongs to the file, so every use of
  it shows the same credits.

## 1.78.0 – 2026-11-16

### Added
- **Picture credits in the Library** (#277): every file of a book's Library – the uploaded ones and the imported ones,
  the target images among them – has one free text credits line, written as the book prints its credits (`Book Golem
  by TER-JAN / DeviantArt`, `Gene Kelly dancing, 1944. Gjon Mili The LIFE Picture Collection/Shutterstock`). The
  Library shows it under each file (*add credits* opens the field; Enter or leaving it saves, Esc keeps the old one), and
  its search finds files by their credits. The API keeps the line per file URL (`asset_credits`, `PUT
  /editor/books/{id}/assets/credits` with up to 500 files at once), `GET …/assets` lists it as `credits`; the MCP server
  sets it with `set_asset_credits`. Credits are no content: no publish, no change in the book's log.

## 1.77.1 – 2026-11-16

### Fixed
- **Pausing the editor's stage stops videos too** (#275, Tilman: "Videos and such should not play when the editor stage
  is in pause mode"): with *Live* off, every video and sound of the spread stops where it is – a video node's (picture,
  sound and its subtitle line) and a video a plugin shows as a texture – and a page found meanwhile does not start its
  video. The plugins' GPU simulations, such as the demo's ink painting, stand still on their last frame. *Live* again,
  everything goes on from where it stood. The reader is unchanged.

## 1.77.0 – 2026-11-16

### Added
- **Subtitles for a speaking video** (#257, Tilman: "we will use only a video on a animated paper mesh for our
  narration. so the only thing we need to streamline is the subtitles"): a video that carries its own sound can show
  what it says as a line of text in the reader's language. Put a WebVTT file per language beside the video, named
  like it – `speak.mp4` → `speak.en.vtt`, `speak.fr.vtt` – and nothing else: the content build and the editor's API
  pair the files by their names (content schema 2.31, the configuration's `subtitles`), and the pairing holds wherever
  the video is used. The line follows the video's own time, so it cannot drift from the sound.
  - **Reader:** the line shows over the scan view, above the spread menu, in the app's language (else English, else
    the first there is). *Info → Settings → Subtitles* switches it off; it is on by default, because a video plays
    muted where the browser blocks sound. Subtitle files are preloaded with their spread and the whole-book download.
  - **Editor:** `.vtt` files upload to the Library (the kind `subtitles`, listed with the videos) and belong to every
    video of their name, uploaded or imported. The stage shows the English line while the video plays.
  - **Content build:** a `.vtt` whose name fits no video beside it is reported and left out; one that is no WebVTT
    stops the build. `docs/content.md` "Subtitles of a video".
  - **Demo book:** the screen on page 6 speaks four lines and has subtitles in English, German, French and Dutch
    (`fixtures/demo/entries/screen/`, written by `editor/tools/narration-video.mjs` with a synthetic voice).

## 1.76.1 – 2026-11-15

### Fixed
- **Back to the spreads from the editor** (#274, Tilman: "i can not find the link to get back to the index"): in a
  spread the book's title in the top bar now always leads back to the book's spreads overview. The book's texts and
  settings, which a click on the title used to open, are the ⚙ right after it. When the bar runs short of room, the
  search and *Books* give way before the book's title and the spread.

### Changed
- **A lighter top bar** (#274): Publish is an icon (a cloud with an arrow; borderless on a phone), and the label of
  where it publishes (`local · this server`, `staging · CDN`) is gone from the bar – the button's tooltip and the
  publish step still name it.

## 1.76.0 – 2026-11-15

### Changed
- **Connect an AI agent: two tabs and one prompt** (#273, Tilman: the guide was all too detailed – "make it one prompt
  someone has to copy, including the newly created token"): the AI connections on the books page are two tabs,
  *Connect an AI agent* and *Existing connections*. The first is three steps – pick the agent, copy the prompt, let
  the agent set itself up: the prompt has the agent check Node, download this instance's `osct-mcp.mjs`, add its
  client's entry with a token in it, ask for a restart and call `whoami`. With no token yet one is made at once
  ("Claude Code on Windows"); else **Create token & copy prompt** makes it and copies the prompt in one click. The
  server file, the snippet and the four values fold under *Set it up by hand*. The second tab is the list with Renew
  and Revoke and a named **Create token**.

## 1.75.0 – 2026-11-15

### Added
- **The MCP server as one file, served by every instance** (#272, Tilman: the editor gave no valid link to the
  server file): `/mcp/osct-mcp.mjs` next to the app – the server bundled with its dependencies, the content contract
  and the plugin guide, so it needs Node 22 and no checkout. The editor's *Connect an AI agent* guide links the
  download and asks where it was saved; a checkout's `mcp/bin/osct-mcp.mjs` keeps working. Built by
  `mcp/scripts/bundle.mjs` (`npm run bundle` in `mcp/`) in the Docker image and the FTPS staging deploy; the editor's
  dev server bundles it on request.

### Fixed
- The image's `.dockerignore` let in neither `editor/` nor `engine/`, which the Dockerfile copies – a Kamal build
  failed on them; they are in, with `mcp/` and `docs/plugins.md`.

## 1.74.0 – 2026-11-15

### Added
- Code on the editor's stage can tell the viewport shading: `userData.shading` on the three.js scene (wireframe,
  solid, textured, rendered; no value in the reader = rendered). An effect of the rendered picture – the books' contact
  shadow – stays out of Wire, Solid and Textured (docs/plugins.md "The stage's shading", #271).

## 1.73.1 – 2026-11-15

### Changed
- **The reader holds two spreads on either side (±2) by default** (#38, Tilman: *"lets load at least +2 for now"*):
  the tracker keeps the targets of the next two and the previous two spreads loaded (it was ±1) and the content of
  those spreads is preloaded, so scanning a page two spreads ahead switches by itself. An interim default while the
  content is coming in; the performance tuning and the progressive preload (#13) follow once it is complete. A device
  that chose a window in the debug overlay keeps its choice.

### Fixed
- **A spread without targets no longer breaks the window** (#38): the window counted every spread, so a spread whose
  targets are all switched off (or that has none yet) used up a place and the page beyond it was not held – from
  pages 4–5 the reader did not find 8–9 because 6–7 has no active targets. The window now counts only spreads with
  targets and orders them nearest first among those (`getPreparedWindow()`); the load test's budget skips them too.

## 1.73.0 – 2026-11-15

### Added
- Code on an entity can follow its reveal, find and loss: every look – built in or a plugin's – writes how much of
  the entity is there (`userData.shown`, 0…1) on the object it animates, every frame, and takes it away at the end.
  A component multiplies the values up from its node (docs/plugins.md "Code that comes and goes with its entity"). The
  books' contact shadow fades in with the entity's dissolve instead of guessing (#270).

### Fixed
- Light nodes now fade with a plugin's look (`revealCode`, `printLiftCode`, `fadeCode`) as they do with a built-in
  one; before, they stayed at full strength while the entity dissolved in (#270).

## 1.72.0 – 2026-11-15

### Added
- **The book's code runs on the live stage by itself** (#269, Tilman: *"can you do an auto run like we have auto save
  in the editor?"* – *"check box play in edit view … check out how scutoons did it"*): the editor's stage already plays
  the book live; now the Code tab's saved sources are part of it. Every stage frame that starts loads them by itself
  and **Save** runs them, so their looks, components and node types are known without a Run on every visit – **Run**
  stays for trying unsaved edits. The Code tab says per plugin what runs on the stage (the saved version, edits not
  saved, failed with the error – what ran before stays – or not loaded); a picker whose look no plugin registers says
  why (*loading the book's code…*, *not loaded – reveal failed*) instead of *(unknown)*. A source that hangs the stage
  (no answer in 10 s) stops the loading and is skipped at the next open, named (docs/editor.md "Code").
- **Live** and **Restart** in the stage toolbar (docs/editor.md "The stage toolbar"): Live off holds the entities' clock
  (`ArScene.holdClock`) – the scene stands still for placing while found things still appear; Restart is a new game,
  every reveal plays again.

## 1.71.1 – 2026-11-15

### Added
- **The other two built-in looks as code, examples** (#267, Tilman: *"Yes"* to `printLift` and `fade` as plugin code too): the
  demo book's `plugins/lifts` writes `printLift` and `fade` as plugin looks (`printLiftCode`, `fadeCode`) next to
  `plugins/reveal` – opacity and tint on copies of the materials, a lift carried into the parent's space so it works on
  any node. The demo book counts fourteen plugins.

## 1.71.0 – 2026-11-15

### Added
- **An entity's own looks** (#268, Tilman: *"I wanted those three to be plugin components so I can have more flexibility
  and edit them via MCP or in the code editor or through the exposed parameters"* – *"build the per entity node
  overwrite … on any node"*): the built-in components `reveal`, `found` and `lost` on a node say how *that* entity –
  or that node's subtree, on any node – appears, in place of the book's `appearance` – `{ type: reveal, look: printLift, duration: 900 }`: a built-in look or
  a plugin's, with its parameters (content schema 2.30, docs/content.md "An entity's own looks"). Per moment the
  entity's own component wins, then its `found`, then the book's moment, the book's `found`, the default look.
- **In the Inspector**, *add component* on any node offers them; the component shows a *look* row and the rows of the
  look it names – a plugin's look with its own rows –, saved like every component. `put_entity`, the YAML and the Code
  tab write the same values; `describe_content_model` explains them (`components.moments`).
- The publish refuses a look no compiled plugin provides in an entity's component too (409 `unknown-appearances`).

### Changed
- The found indicator's "New entry unlocked" label stays as long as the entity's own reveal look takes.

## 1.70.1 – 2026-11-15

### Added
- **The built-in reveal as code, an example** (#267, Tilman: *"put the reveal animation into code as a copy of the current
  reveal as an example"*): the demo book's `plugins/reveal` writes the engine's `inflateDissolve` as a plugin's look –
  the shape, the noise dissolve with its glowing edge, the sparks – with the built-in look's parameters under the same
  names. Pick `revealCode` for a moment (the Code tab lists the plugin) and it plays the same animation, ready to change.

### Fixed
- **The appearance panel shows the parameters** (#267, Tilman: *"The parameters are not in the UI"*): a moment without a
  look of its own – every moment of a book that names none – showed only its look picker. Its rows are those of the look
  it plays now (its own, else found's, else the default), at their values; the first change makes the moment its own,
  a copy of the look that played with the change.

## 1.70.0 – 2026-11-14

### Added
- **Plugins from the Code tab reach readers** (#78): the editor's Publish carries every saved plugin source of the book,
  transpiled in the browser as Run transpiles it, and the server puts it into the published version – readers load it
  from the CDN like a compiled plugin. Works on every server, PHP alone included. Not type-checked: fix what the Code tab
  underlines before publishing (a server-side build is decided later, #266). A source that does not compile stops the
  publish with its line.

## 1.69.0 – 2026-11-14

### Added
- **The book's looks in the editor** (#265): a spread's Inspector has an *appearance* section under the
  post-processing – a look per moment (**reveal**, **found**, **lost**) picked from the built-in looks and the looks of
  the book's plugins, its values in rows like a pass's. A change plays on the stage at once, **play** in a moment's head
  shows it on the page's targets, and it saves itself like every edit (docs/editor.md "Appearance").
- **An API route for it**: `PUT /editor/books/{id}/appearance` saves the book's `appearance` and records the change; a
  publish refuses a look no compiled plugin provides (409 `unknown-appearances`), and a Code tab plugin whose look the
  book names counts as in use (docs/server.md).
- **An MCP tool for it**: `put_book_appearance` sets the looks from an AI connection, checked against the contract
  first; `describe_content_model` describes the moments and every look's parameters (docs/mcp.md).

## 1.68.0 – 2026-11-14

### Added
- **A look per moment** (#264, Tilman: *"i want a built in and an overwrite via plugin for the reveal, found and
  lost"*): a book says in its `appearance` how an entity appears on **reveal** (the first find of a target), on
  **found** (every later find) and how it goes when the page is **lost** – each a look with its values, like a pass
  (content schema 2.29, docs/content.md "How entities appear"). A moment without a look takes `found`'s; `lost` plays
  its look rewound.
- **Three built-in looks**: `inflateDissolve` – flat and small on the page, the entity rises, grows and turns half
  around under a noise dissolve with a dim gold edge and sparks (the default, tuned by Tilman in the sandbox, #262) –,
  `printLift` – a pale print lifts off the page and takes its colours – and `fade`. Every value can be set per book.
- **A plugin's own look** (plugin API 1.8): `api.registerAppearance(type, spec, factory)` – code that says what the
  entity looks like while it appears and disappears; the book names it in a built-in look's place
  (docs/plugins.md "A look"). A look that fails leaves the moment to the default look.
- **The reveal sandbox** (#261): a page for developers to tune these animations on a real model under the reader's
  conditions, with concepts to compare, live controls and the values to copy (`sandbox/reveal/README.md`). Not part of
  the reader or the editor.

### Changed
- Every find plays the book's look – the first one too (its sound and label stay) –, and the entity leaves the same way
  back. Without an `appearance` that is `inflateDissolve`: 3.5 s to appear, 0.6 s to go, in place of the gold-bloom
  unlock and the quick plain dissolve (#262).
- The appear animation covers an entity's whole node tree: child nodes dissolve and inflate with their parent.
- "New entry unlocked" stays as long as the book's look for the reveal takes.

### Fixed
- The dissolve's noise has the same scale on an entity from every camera angle (it grew coarser the more the page was
  tilted).

## 1.67.0 – 2026-11-14

### Added
- **A plugin can take a model from the Library** (#263): a parameter of the new kind `model` shows in the Inspector as a
  list of the book's models; the plugin loads the picked file with `api.loadModel`. A new shape for a plugin is an
  upload, never a change of its code. Content schema 2.28, plugin API 1.7 – an older reader skips such a parameter
  with its update hint and runs the rest of the plugin.
- **Paper** in the demo book: the `paper` component shows a video or an image on a slightly bent sheet of paper – the
  sheet is a model the author picks in its one row. *The screen* (page 6) stands on a stand-in sheet.

## 1.66.0 – 2026-11-14

### Added
- **A model loads its mesh once and its surface by quality** (#260, Tilman: *"import the mesh once and load the texture
  separately … load resolution depending on user quality settings"*). A model can bring its colour map in four sizes –
  512, 1024, 2048 and 4096 px. The model file carries the smallest one, so the model shows at once; the app then
  loads the size that fits and puts it in place. *face against face*: the mesh is 125 KB, the maps 48 KB, 156 KB,
  536 KB and 1.8 MB – instead of one 12 MB file for everybody.
- **Reader – Info page, Settings: *Model detail***: Automatic (by the phone's memory and connection: Low on a
  data-saving or slow connection, Medium on phones with up to 4 GB, else High), or Low, Medium, High, Best. The scan
  view follows at once, and downloading a spread fetches only the size chosen.
- **Editor – Inspector, a model node: *textures***: the sizes the model has, each with its file's weight; **Library…**
  and **Upload…** add maps, several at once – the size is read from each picture (square, one of the four sizes; any
  other picture is named and left out). A model with a map per material takes a set for each.
- **Editor – stage, view menu: *textures***: show the stage at one quality (auto, 512 to 4096 px) to see what readers
  on that setting see.
- **Content**: `textures` on a model node in the YAML – `512: face_512.jpg` and so on, or a list of
  `{ material, sizes }`. The content build checks the files and leaves them exactly as made (no shrinking). Content
  schema 2.27 – an older app shows the model with the map in its file.
- **MCP**: `describe_content_model` explains the texture sets; `put_entity` checks them.

## 1.65.0 – 2026-11-14

### Added
- **The editor saves by itself** (#259, Tilman: *"autosave – it is confusing to save after adding uploads for
  example"*): every edit in the Inspector reaches the draft a moment after the last change – a node's values, a file
  picked or uploaded for a node, the tree's moves and removals, a gizmo drag, a target's placement, the
  post-processing, the environment, an entry, the book's texts. A drag or a word being typed is not saved half-way;
  switching the tab, the selection or the spread loses nothing, and hiding or closing the browser tab writes what
  still waits.
- **The top bar says where the draft stands**: *Saving…*, *Saved*, or *Not saved* with the reason – a failed save with
  **Retry** (a failure of the server or the network is tried again by itself), or what keeps it back, such as a
  behaviour rule that is not complete or an entry without a title.
- **Undo edits** in each panel takes its subject back to how the draft had it before its first edit since the page was
  opened – the way back from a slipped drag or a removed node.

### Changed
- The Inspector has no **Save** button any more, and no *Save placement*; *Back to the draft* is *Undo edits*. The Code
  tab keeps Save (Ctrl+S) and Run. Readers still get nothing before Publish.
- A save no longer builds the stage again: clips, videos and the view go on while a value is changed. The stage is
  built again only for a target's placement, an entry's title or page, and an entity several targets share.
- An entry's and the book's fields keep exactly what was typed; a save's answer no longer rewrites them.
- The stage accepts a gizmo's placement only for the node selected in the page.

## 1.64.7 – 2026-11-14

### Fixed
- **A file uploaded and picked for a node did not show on the stage until the draft was saved** (#258, found uploading a
  model on staging): on a CDN instance the stage frame's policy admitted only the Library folders the saved draft
  already names, so the request for a fresh upload was blocked and the stage kept the node's previous file. The book
  now names the folder of its uploads (`libraryBase`), and the frame admits it from the start – for files and requests,
  never for scripts.
- **The same file uploaded under another name kept the old name** (#258): the Library answers with the file it already
  holds, and showed it under the name of the first upload – as if the new upload had not been taken. The file now takes
  the name it was uploaded with last (its URL, version and uses stay), the Library says so, and the file just uploaded
  is marked and shown whatever the filters said.

## 1.64.6 – 2026-11-09

### Fixed
- **Files uploaded to the Library on a CDN instance reached neither the stage nor the reader** (#254, found trying Kévin's
  Mark on staging's demo book, #253): the API answered `<root>/<env>/assets/…` for a file the storage zone keeps at
  `<root>/assets/…` (404), and the stage frame's policy admitted no CDN folder for uploads. The URL now names the zone's
  `assets` folder next to the environment, and the frame admits the Library folders the draft names, for files and
  requests but never for scripts.

## 1.64.5 – 2026-11-05

### Fixed
- **The editor's stage showed no target images after a re-import** (#252, Tilman: *"there is some cors error. we need to
  fix this now"*): the stage frame's policy admitted images only from the book's current assets base, while the draft's
  rows named files of an earlier content build. The frame now admits images and media (never scripts or requests) from
  every content build the draft names. Staging's draft is back on content paths of the current build.
- The stage frame's version check no longer fails its CORS preflight (`_app/version.json` asked with `cache-control` and
  `pragma`; the `.htaccess` allows them).

## 1.64.4 – 2026-11-05

### Fixed
- **The editor's page has one white** (#250, Tilman: *"it has a different white"*): the stage tinted the spread's page
  image with its paper colour, while the printed targets on it stayed untinted – with the final content's many targets
  per spread their white showed as patches. The page image is drawn as it is; the paper colour stays for a page without
  one.
- **The tree's eye hides the target in the scene** (#250, Tilman: *"clicking the eye does not show the right info text
  and it does not hide it in the scene"*): it only made the stage lose the target, so its AR content went and its
  printed image stayed. Hidden now means neither, and the eye's Info text says what it does (and that the reader's book
  is the Inspector's *In the book* switch).

### Changed
- **A fold of the editor's own** (#250): the stage draws the paper's curve into the spine over every open double page;
  the page previews are the flat pages. `prepare-delivery --sheets <pdf>` takes the page previews from another PDF
  than the targets (the print PDF – a preview export bakes a fold shadow into every spread), `--sheets-only` draws
  them again without cutting the targets.

### Removed
- The × in the panel's bar (#250, Tilman: *"the x can also go. its irritating"*) – back to the spreads is the top
  bar's book crumb.

## 1.64.3 – 2026-11-05

### Added
- **`prepare-delivery` cuts from a high-resolution export of the sheets** (#248): `--print` also takes a PDF of the
  same sheets as the trigger PDFs (`OSCT_FULL_preview_spreads_HIGHRES.pdf`, exported without downsampling) – targets
  and page previews are cut by sheet. With it the active targets reach a median 1,200 px (the print PDF's 300 ppi gave
  440). `--last-page` when the preview's highest page number is not the book's last page.

## 1.64.2 – 2026-11-05

### Fixed
- **The production deploy finds its SSH key** (#6): the server's deploy keys were handed over as the repository
  secrets `SSH_PRIVATE_KEY_PRODUCTION` / `SSH_PRIVATE_KEY_STAGING`, while the deploy only read `SSH_PRIVATE_KEY` and
  stopped with an empty key. It now takes the environment's `SSH_PRIVATE_KEY`, else the repository key of its
  destination.

### Changed
- **Staging stays on the FTPS host for now**: the Kamal staging deploy no longer runs on every push to `develop` (by
  hand only) – with the server's address set for the whole repository, each push had started a Kamal deploy to it.
  `deploy-staging-ftps.yml` keeps uploading `develop` to osct.porschuetz.de.

## 1.64.1 – 2026-11-05

### Added
- **The final print PDFs as a delivery** (#248): `npm run prepare-delivery` (`scripts/layout/prepare-delivery.py`)
  reads the trigger PDFs of the finished book – one per kind: active, inactive, Kévin's artworks – and cuts every
  trigger from the print PDF at the resolution printed there. A trigger showing a current target's image keeps the
  target's id (its image is replaced, its entry kept); every other one becomes a new entry. It writes the mapping for
  `npm run import`, the page previews rendered from the print PDF and every target's printed box (`layout/`), and a
  report of resolutions and matches. Covers and the sheets without page numbers are left out.
- The delivery mapping takes `enabled: false` (the target switched off, #249) and `tags` (e.g. `artwork`).

## 1.64.0 – 2026-11-05

### Added
- **Targets can be switched off** (#249, content schema 2.26, Tilman: *"the active inactive toggle in the editor. as we
  will incrementally activate them later on"*): a target's `enabled: false` takes it out of the reader's book – no image
  target, its entry not in the list and not counted – while the content keeps the target and its entry with all their
  values. The editor's Inspector has an *In the book* switch in the target's head, the tree marks a target that is off,
  and the stage still shows and edits it. The API (`PUT …/targets/{id}` and a new entry's target), the content build
  (`entry.yaml` `target.enabled`) and the MCP server (`put_target`, `add_entry`) take it. Targets that are off do not
  count towards the 10 per spread. A 2.25 app ignores the field and shows them.
- `isTargetEnabled` and `isEntryInBook` in `shared/types/game-config.ts`; the engine's `loadGameConfiguration` takes
  `keepSwitchedOffTargets` (the editor).

## 1.63.0 – 2026-11-01

### Added
- **The Library filters by origin** (#245, Tilman: *"i thought we solved imported content to show up and be filterable
  in the library"*): a second filter, *from* – all · uploaded · imported –, next to the kind filter, in the Library and
  when it is opened as the picker. The editor's uploads (replaced and deleted in the Library) are told apart from the
  files of the content import (`files.json`, read-only until the next import), which the card's *imported* mark alone
  showed so far (#111). `matchesOrigin` in `library-pick.ts`.

### Fixed
- **A book imported from a URL or a file had no imported files in the Library** (#244): staging's demo book listed no
  files at all, although the stage shows its models and images from the CDN build. Only the CDN import fetched
  `files.json`; the editor's URL and file modes and the MCP's `import_book` with `url` sent the configuration and the
  assets base alone, so `books.files_json` stayed empty. An import (and its preview) without `files` now reads
  `<assetsBase>/files.json` – optional, as for the reader: a base without one (the reader's dev server) imports with
  none, as before. A book imported that way before lists its files after a re-import.

## 1.62.1 – 2026-11-01

### Fixed
- **The editor's switch is a real switch** (#243, Tilman: *"Ich will so einen Toggle."*): `Toggle` was still a pill that
  read *on* / *off* – the button look #241 meant to replace. It is now a track with a knob that slides right and fills the
  track while on (`role="switch"`, `aria-checked`; Space and Enter flip it once per press; dimmed when disabled; the focus
  ring round the track), in the editor's colours, so it inverts at night. The row's word stays its label and the *on* /
  *off* text is gone – a boolean variable keeps its *false* / *true* as a quiet value after the track. Every user is
  unchanged: section heads (post-processing passes), *grid & snap*, *vars and events*, *uniform*, the removal's *delete
  the files*, the admin page's roles. The reader's dev-tools `debugSwitch` takes the same shape in its green.
  Screenshots: `docs/screenshots/243/`.

## 1.62.0 – 2026-11-01

### Changed
- **Every on/off in the editor is a switch** (#241, Tilman: *"Ich will so einen Toggle. An manchen Stellen sind keine
  Toggles, sondern Buttons."*): the on / off pill `Toggle` (since #233 in a pass's head) replaces the remaining on/off
  buttons and on/off segmented pairs – grid, vertical axis and snap in the *grid & snap* panel, and one switch per snap
  target (*snap to grid*, *axes*, *objects*, *outlines*) instead of four pressed pills; the onion sky in the Environment
  tab; a boolean variable in *vars and events* (it reads *true* / *false*); the *uniform* switch under the scale row
  instead of the chain icon; *Also delete the files used only here* in the removal confirmation; and each role per user
  on the admin page. `Toggle` takes an Info-view `help`, `disabled` (while a request runs) and its own `words`.
- **The reader's dev tools have switches too** (#241): *ask zoom* in the camera panel and *QR* in the debug overlay's
  spread tab are a track with a knob in the debug green (`debugSwitch`, `SWITCH_CSS` in `dev-tools/debug-sheet.ts`). The
  reader's settings already were switches (`<gold-switch>`). Screenshots: `docs/screenshots/241/`.

## 1.61.1 – 2026-10-31

### Fixed
- **The editor's stage reads the trigger infos again** (#240): since the stage runs in a sandboxed frame (1.58.0) its
  requests come from an opaque origin, and `/trigger-protocol.json` had no `Access-Control-Allow-Origin` – the browser
  blocked it. It is now a public file like the editor's and the content's.

## 1.61.0 – 2026-10-30

### Added
- **A search in the editor's top bar** (#237): it finds entries (title and text), spreads (title or a page number),
  targets and named nodes in the whole book, accents and case ignored, grouped by kind with their spread and page. A pick
  goes to that spread and selects it – an entry opens its form in the Inspector. **/** or **Ctrl+K** focuses it, ↑ ↓ and
  Enter choose, Esc closes; on a phone a magnifier in the top bar opens it over the bar.
- **The book in the Inspector** (#237): a tap on the book's name in the top bar selects the book – its title, author and
  publisher are edited there, with where its files come from and a link back to all spreads.
- **+ entry** in the tree, next to *+ target* (#237): a new entry without a printed image on the spread.
- **Print first or digital first** (#238): a book says where its spreads come from – the printed layout (print first,
  every imported book to start with) or the editor (digital first, the demo book). Editors switch it in the book's
  Inspector. Only a digital-first book's spreads are added and removed: its book page ends with a tile the size of a
  double page with a large **+**, which opens a creation step in the page – the format (double page, cover, back cover –
  the ones the book can still take), the title and the place; the same step opens from **+** after the last spread in the
  workspace, from a card's and the tree's *Add a double page after*. A print-first book shows none of it, and the API and
  the MCP tools refuse to add or remove its spreads. In the content it is the book's optional `sourceOfTruth` (schema
  2.25 – an older app ignores it).

### Changed
- **The book page shows the spreads only** (#237): its head is the book's title and author; the asset address and the
  environment line are gone (the Inspector and the Environment tab have them). Old `?view=` links show the spreads.
- **The onboarding is the app's own** (#236): the splash and the steps a first-time reader goes through are part of the
  reader – their texts are translated with the app in all four languages (English, French, Dutch, German), the book's
  title, author and publisher filled in. They are the same for every book and no longer come from the book's content.
- **Content schema 2.25**: the configuration's `tutorial` is optional. The content build and the editor's publish still
  write the app's English steps there, so older apps keep their onboarding until the next major schema.

### Removed
- The book page's *entries* view (#237) – the search finds the entries, the tree adds them.
- The editor's *onboarding* view, the API's `GET`/`PUT /editor/books/{id}/tutorial`, the MCP tools `get_tutorial` and
  `update_tutorial`, the content source's `steps/` folder (the build warns while one is left) and the database column
  that held the steps (`books.tutorial_json`, removed by the migration).

## 1.60.1 – 2026-10-30

### Changed
- The editor's **Inspector** tab shows a frame with its handles, the **Tree** tab rows hanging off a branch (the
  three-line list icon read like any list); a *nodes* icon (one node over two) is ready for the node tree's own places.

## 1.60.0 – 2026-10-30

### Changed
- **Content schema 2.24 – nothing new in the content** (#214): the shared content contract was tidied up. The check for
  "is this a JSON object" and the rule for camelCase names (a component's, a pass's, a material's type, a variable's
  name) are written once, the unused `isComponentType` and `PlacementData` are gone, and comments name the engine's
  files where they still named the reader's. A book of 2.24 reads exactly like one of 2.23 in an older app.
- **Documentation: one owner per topic** (#218): the plugin API's reference is in the plugin guide, the trigger trial in
  the tracking guide; the editor's guide is ordered by page and panel, each told once; the CDN guide points to the
  version rule instead of repeating it and keeps the edge-cache repair as a titled runbook; the BaseStore page covers
  what the reader uses.

## 1.59.1 – 2026-10-30

### Added
- **The demo book has scan lines to discover** (#216): a second post-processing pass of the book's own, `scanLines`
  (`fixtures/demo/plugins/scanlines`) – dark lines across the picture like an old screen, with line spacing, strength,
  scroll speed and reach (the whole picture or the AR layer alone). It sits on *The switch* switched off: the spread's
  post-processing section shows it closed with its rows, and the toggle in its head turns it on. The demo now has
  eleven plugins.

## 1.59.0 – 2026-10-30

### Added
- **Texts are edited in the editor** (#223). Selecting an entry in the tree shows its **form** in the Inspector: title,
  category, access page, author, tags, the text with a **live preview**, a picture from the Library and a link's address.
  The preview is the reader's own renderer and fills in the book's variables with their values on the stage. A new access
  page moves the entry to its spread.
- **The Entries page**: next to the spreads on the book's page, every entry in one list – filtered by category, searched,
  the glossary grouped by letter as in the reader. Each opens the same form; **+ entry** makes an entry without a
  target, such as a glossary term read only in the list.
- **The book's title, author and publisher** are edited on the book's page, and the **onboarding's steps** in a view of
  their own: an ordered list of steps with their texts, illustration, button, action and timing.
- **Markdown and variables in an entry's text** (content schema 2.23): paragraphs, *emphasis*, **strong** and links,
  and the book's variables in braces the way SCUTOONS' message boxes write them – `{hasKey}`, `{hasKey: The door
  opens.|It is locked.}`. The reader shows them in the entry; nothing else is markup and no HTML passes through. Plain
  texts read as before; an older app shows the signs as they are written.
- **The API** saves an entry's fields (`PUT …/entries/{id}`), the book's texts (`PUT /editor/books/{id}`) and the
  onboarding (`GET`/`PUT …/tutorial`), lists every entry with its fields (`GET …/entries`) and makes an entry without a
  target. Every save is in the change log; an AI connection may write texts like its person, never publish.
- **MCP**: `get_entries`, `update_entry`, `update_book`, `get_tutorial` and `update_tutorial`; `add_entry` makes an entry
  without a target too; the content model explains the Markdown and the variables.

### Changed
- The reader's entry view renders the text with the shared renderer (Markdown and variables) instead of plain paragraphs.

## 1.58.0 – 2026-10-30

### Security
- **A book's code can no longer act as the person who has the book open in the editor** (#234). The editor's stage – and
  with it every plugin of the book and every **Run** in the Code tab – now runs in a sandbox of its own: a frame without
  the editor's session, its cookie or its storage, that cannot reach into the editor's page and may load only the book's
  content and the Library's files. Before, a plugin written by any editor of a book could send requests with the session
  of whoever had the book open – an admin's included. Saving and publishing stay a click in the editor itself.
  The reader still runs a published book's plugins in its own page.

### Changed
- The Code tab shows the plugins' **log** under the editor: their `api.log` lines and their errors on the stage, newest
  last, cleared with every Run.
- In the editor a plugin can no longer fetch from other hosts – files come from the book's content and the Library
  (`api.loadText`), as the plugin guide says. The reader is unchanged.
- The site serves the editor's files and the content it bundles to any origin (`Access-Control-Allow-Origin: *`), which
  the sandboxed stage needs to load them.

## 1.57.1 – 2026-10-30

### Fixed
- On a phone, the toolbar's *View* panel closed again right after a tap: it focused its first field (the hand shake),
  the phone's keyboard came up and the window's resize closed the panel. A tap now opens a panel with the panel
  itself focused, and only a change of width closes it (the keyboard and the address bar only change the height).

## 1.57.0 – 2026-10-30

### Added
- **Switch a post-processing pass off without losing it** (#233): in the editor's post-processing section every pass is
  now a section of its own. Closed, it shows its type and its values in one line (*bloom · strength 0.35*); an
  **on / off** switch in its head turns the pass off or on without opening it, next to the arrows and *remove*. A pass
  that is off keeps its place and its values, and the stage and the reader skip it – it costs nothing on the phone. In the
  content it is `enabled: false` on the pass (content schema 2.22); the content build, the editor's API and the MCP server
  accept it. An app of schema 2.21 ignores the field and still shows the pass.

### Changed
- **The Code tab marks only what matters** (#232): the plugin list shows each plugin by its name alone – no more
  *in the content · not stored* –, and a plugin with unsaved edits with an asterisk after its name (*aquarium\**). The
  Library's code list marks the script the same way. Whether readers have the saved plugins is what the top bar already
  says (*draft only*, *live on …*).
- The editor's on / off buttons are one control now, the same in a row and in a section's head.

### Fixed
- Unsaved edits in the Code tab are no longer lost when another tab is opened: the source stays until it is saved or
  discarded, and a reload for a new version still warns about it (#232).
- Opening a plugin that only the content declares no longer counts as an unsaved edit (#232).

## 1.56.0 – 2026-10-30

### Added
- **The trigger trial names the phone** (#235): two iPhone reports of the second trial could not be told apart,
  because Safari 26 freezes its user agent and Chrome on Android reduces it. The trial strip now asks for the phone
  model – typed, or picked from a short list of current iPhones, Galaxy S and Pixel phones – and **md** only saves
  the report once it is filled in. Where the browser can tell, the field is prefilled: Chrome on Android gives the
  model code (*Galaxy S22 (SM-S901B)*) and the real Android version; on an iPhone the screen size narrows the list
  to the models with that screen, shown as a guess for the tester to confirm. Optional initials go next to it; both
  are remembered on the phone. The report's header gains *Device* (the model as entered and where the prefill came
  from), *Screen*, *OS* (with a note where the browser freezes or reduces it), *Language* and *Tester*.

## 1.55.0 – 2026-10-30

### Changed
- **A newer book never breaks the app** (#220): until now, a book built with a newer content schema MINOR was refused
  when the app's check did not know one of its features – a behaviour, a pass of the book's own code, a new parameter.
  From this version on the app loads such a book and leaves out only what it does not know: a component, a filter, a
  pass, a material, a behaviour action or field, a parameter. A broken book and one of a newer schema MAJOR are still
  refused. When
  something was left out, the reader says so once per book version, at a calm moment like the new-version notice
  (never during AR): *This book uses features this app version doesn't know yet – update the app to see everything* –
  in English, French, Dutch and German, with *Reload* when a new version is ready. The editor shows what its stage
  leaves out in the top bar ("N unknown features"). Books of this app's own or an older schema are checked as strictly
  as before.

## 1.54.3 – 2026-10-30

### Fixed
- **The reader notices a new version too** (#231): an open reader – a browser tab, or the app left open on a phone –
  never asked for a deploy and kept the old code. It now looks for a new version whenever it comes back into view and
  every 15 minutes, and when one has taken over it shows a short notice at the foot of the screen: *A new version of
  the app is ready* with *Reload* and a cross for *Later* – in English, French, Dutch and German. Never while the camera
  or AR runs: the notice waits until the reader leaves the scan (the entries, an entry, Info). It never reloads by
  itself, and a page opened after the deploy does not show it. A part of the app that fails to load after a deploy – the
  AR code above all – shows the same notice instead of a dead camera view.

## 1.54.2 – 2026-10-30

### Fixed
- **The editor notices a new version under an open tab** (#230): a tab opened before a deploy kept the old code –
  Tilman's spread page behaved like 1.51.1 while staging ran 1.51.2. The editor now asks every 5 minutes, and when the
  tab gets the focus or becomes visible, whether a new version is deployed, and then shows a quiet bar: *A new version of
  the editor is ready – Reload*. It never reloads by itself. With unsaved edits the bar says a reload drops them and
  offers *Reload after saving*, which reloads as soon as nothing is left unsaved. A code file that fails to load after a
  deploy shows the same bar instead of reloading the page on its own.

## 1.54.1 – 2026-10-30

### Changed
- Code comments name no versions any more: the "(content schema 2.x)", "(plugin API 1.x)" and "since …" tags are gone
  from the app, the engine, the editor, the content build, the MCP server and the API (the schema's history stays in
  the `shared/` type docs and in this changelog); a bare `(#N)` still points to the issue behind the code (#219).

## 1.54.0 – 2026-10-30

### Added
- **Plugin passes in post-processing** (#216, Tilman: "Can I also ask to be able to add plugins to the post-processing
  pass?"): the book and a spread name a pass a plugin of the book registers (`api.registerPass`) in their `passes`, in
  any place among the built-in bloom, vignette and grade – its parameters checked against the spec the content build
  recorded, like a built-in pass's. The engine builds it from the plugin's factory, on the book's chain and on a spread's
  own; a pass whose factory throws (or returns no pass) is logged and skipped, one whose `render` throws is switched off –
  the rest of the chain runs. Its `texture` parameters arrive as textures, a feedback buffer its factory makes steps while
  the pass runs and goes with it.
- **The editor's post-processing section** offers the plugins' passes under *add pass*, a row per plugin with its name –
  a compiled plugin's as soon as the book is open, a plugin run in the Code tab at once. A plugin's pass shows its spec's
  rows (labels, help, ranges, on / off, a `texture` row with the Library's pictures), and every pass now moves earlier or
  later in the chain with the arrows. The stage previews it under *rendered*.
- **The phone budget** (#86): a list of more than three passes, or more than one bloom, is a warning in the content build
  and in the editor's section – a plugin's pass counts like a built-in one.
- **The demo's film grain**: the plugin `grain` with the pass `filmGrain` over *The twins* (pages 7–8) – every pixel a
  little lighter or darker, changing 24 times a second, the camera picture included; strength, size, speed, reach and a
  pattern picture are its rows. The tutorial shows its rows.

### Changed
- Content schema **2.21**: a `passes` entry may name a plugin's pass. **A 2.20 app refuses a book that names one.**
- The editor's API takes a plugin's pass the declared plugins recorded (any camelCase name while the book has Code tab
  sources); **the publish refuses a pass no compiled plugin provides** (409 `unknown-passes`, with a hint in the MCP
  server). The MCP server's `put_spread` and `put_book_passes` check a plugin's pass against its recorded spec, and
  `describe_content_model { book }` lists the plugins' passes.
- The content build refuses a plugin pass with a built-in pass's name, or one two plugins register.

## 1.53.0 – 2026-10-30

### Added
- **Plugin API 1.6: GPU feedback buffers** (#225): `api.feedback({ width, height, fragment, uniforms, channels, type })`
  gives a plugin a fragment shader the engine runs once per frame into a render target of its own, before the scene
  renders – its own last frame as `iChannel0` (two targets, swapped every frame), another buffer or a texture as further
  channels, and `iTime`, `iTimeDelta`, `iFrame`, `iResolution` set. The handle's `texture` (and `uniform`, which follows
  every swap) is the current frame. Half-float targets by default, float on request, 8 bits with a warning where the
  device renders into neither. A buffer made while a node builds pauses while the node is hidden or its page is not in
  view and is disposed with the node – in the reader and on the editor's stage alike. The plugin never gets the renderer.
- **`api.shadertoy(source)`**: a Shadertoy pass (`mainImage`) as a feedback buffer's fragment, unchanged – the adapter
  adds the `main`. `docs/plugins.md` has the helper and a "from Shadertoy" recipe.
- **The demo's ink painting** (page 6): the plugin `fluid` with the node type `inkPainting` – a framed canvas standing on
  the page whose ink keeps flowing, the Shadertoy fluid *XlsBDf* by trapcode (CC BY-NC-SA 3.0) on two feedback buffers. A
  tap stirs the ink where it lands; *resolution* (256 / 512), *pen speed* and *ink dissipation* are its rows. About
  0.02 ms of GPU time per frame at 256² and 0.05 ms at 512² on a desktop GPU. Credits in the plugin and in `DEMO.md`; the
  tutorial shows it.

### Changed
- Content schema **2.20** (nothing new in the content: a plugin built against API 1.6 says so; the content build's
  recording run hands out a dummy buffer and records nothing of it).

## 1.52.0 – 2026-10-30

### Changed
- **Editor: no Stage tab** (#229, Tilman: *"These are the same. I'd like to remove Stage from the right side."*): the
  panel's tabs are **Inspector**, Environment, Library and Code (and the tree on a phone – the sheet's head has one
  icon less). The Inspector – the Entity tab renamed, since it shows whatever is selected – shows the **spread** when
  the spread is selected, with the Stage tab's sections moved there: *spread* (title, pages, format, passes,
  environment with *edit*), *post-processing* and *vars and events*. A tab stored before (Stage or Entity) opens the
  Inspector.
- **Nothing else selected is the spread**: a workspace opens with the spread selected and shown in the Inspector, and so
  does another spread (‹ ›) and a click on the stage that picks nothing – no target stands in any more, no *Nothing
  selected*.
- **The preview settings are the toolbar's view group**: shake, origin, the desk's top and the sky moved from the Stage
  tab to a new group after *grid & snap* – the gear, a panel like grid & snap's (keyboard, 44 px with a finger), stored
  in this browser as before; its tooltip names them all (*Eiermann · plywood · origin top left · no shake · sky Wooden
  Studio 17*). The stage menu's *Stage settings…* is *View settings…* and opens it.
- `docs/editor.md`, the tutorial (with fresh shots of the door after the key, the desk's top, the book's bloom, the
  vars and events and the phone) and the help texts name the Inspector and the view group.

### Fixed
- **Selecting the spread clears the stage's selection** (#229): its row is highlighted and the outline and the gizmo
  go, also when the click lands on the row's book icon or an empty cell – a tap anywhere on a tree row selects it now.
- Opening the Inspector from the stage menu (*Add node…*, *Placement on the page…*) or after a new target no longer closes the panel when the Inspector was already open.

## 1.51.3 – 2026-10-30

### Added
- The demo's aquarium has real water where the browser has WebGPU: Splash, Masaya Matsuoka's particle fluid (MIT),
  simulated and drawn on the GPU from the scene's camera and shown inside the tank's glass; the toy fish dips in and
  pushes the water aside, a tap pushes it deeper. Without WebGPU, or with the new *WebGPU* switch off, the rings of the
  simulated surface stay. The Entity panel says which runs (*WebGPU ok* / *no WebGPU*) and has rows for the particles
  (10k, 20k, 40k), the render scale and the fluid's colour (#228).

## 1.51.2 – 2026-10-30

### Fixed
- **Every row of the editor's tree selects** (#227): a tap on the spread row (the book icon) selects the spread – the
  row is highlighted, the Stage tab opens at its *spread* section and nothing stays selected on the stage; a tap on an
  entry row selects the entry itself, also an entry without a target (no more disabled rows) – the Entity panel shows
  it read-only (category, title, access page, author, tags, the text in the reader's paragraphs, the image, a link's
  URL, and its target with *select the target*), and an entry with a target has that target outlined on the stage. On
  a phone the sheet opens the matching tab.
- **The tree's keys reach every row** (#227): ↑ ↓ walk over the spread and the entry rows too, ← steps up a level from
  any row that does not fold (node → entity → target → entry → spread), Enter opens the row's panel. **Delete on an
  entry row** removes nothing at once: it opens the entry's removal confirmation (#198), as the entry row's new menu
  (*Select the target*, *Remove entry*) does.
- **The tree's help says what a tap does** (#227): every row's help in the Info view names the result of its tap, the
  tree's own help starts "A tap selects the spread, an entry, a target, its entity or a node"; the spread row's
  chevron, which looked like a fold button and did nothing, is gone.

### Changed
- The Stage panel's *spread* section shows the whole spread (#227): its title and pages, the format, the
  post-processing in effect (the whole book's passes or the spread's own, and which) and the book's environment with
  *edit* to the Environment tab; closed, its head names the title and the format.

## 1.51.1 – 2026-10-30

### Changed
- **One desk on the editor's stage, with two tops** (#226, Tilman: "only one type of table – the Eiermann, with two
  types of plates … Just the top, linoleum on oak, and switching the preview switches only the plate"): the stage's
  desk is always Egon Eiermann's steel frame, and the Stage panel's *desk* row is now **top**: *plywood* (the
  screen-printed board, as before, the default) or *linoleum* – blue-grey linoleum on an oak-faced 18 mm plywood
  board, its edges showing the same 13 plies per 18 mm tinted to oak, the oak veneer underneath. Both tops have the
  same size and surface height, so the book, the targets, the grid and the camera stay put when the top changes; one
  model holds the frame and both tops (256 triangles), loaded once. The *stage* section's head names the top:
  *Eiermann · linoleum · grid off*. A stage stored with Schöpfer's desk opens on the linoleum top, one stored with the
  Eiermann on the plywood top.
- The tutorial's *Environment and sky* section explains the top, with a new shot of the linoleum top.

### Removed
- **Schöpfer's desk** (#226, Tilman's decision: its drawers hung open beside the frame and its top floated on them):
  its model, its entry in the Stage panel and its build in the desk script. Its linoleum and oak live on as the second
  top.

## 1.51.0 – 2026-10-30

### Changed
- **Signing in keeps the session in a cookie** (#207): in the reader and the editor, the sign-in is now an HttpOnly
  cookie of the API that no script on the page can read – nothing about it stays in the browser's storage. The reader
  and the editor share it: signing in or out in one does the same in the other. Everyone already signed in stays
  signed in – the first start after the update moves the stored sign-in into the cookie. AI connections (the MCP
  server) sign in as before.

### Security
- **The session can no longer be read and carried off by code on the page** (#207): a book's plugin running in the
  editor could read the session token from `localStorage`; it is now an HttpOnly, SameSite=Strict, Secure cookie on
  `/api`, and every write that comes with it needs a CSRF token (403 `csrf` without it, also for a request another
  site sends). AI connections' tokens stay `Authorization: Bearer` only and never become a cookie. Plugin code on the
  page can still act while the page is open – a sandbox for it is a separate step.

## 1.50.8 – 2026-10-30

### Changed
- The editor's package stays private at version 0.0.0 while the editor ships inside the one release; the version
  check enforces it, and it now also compares the MCP server's version with the others (#222).

## 1.50.7 – 2026-10-30

### Changed
- **One vocabulary for behaviours and plugins** (#213): the plugin runtime's variable scopes, core events, name pattern
  and value type are the behaviour grammar's (`shared/types/behaviour.ts`) – no second list to keep equal; the editor's
  rule editor finds a name's node with the engine's own `namedPaths`. No content schema change.
- **The engine takes what differs from the app** (#213): where the 8th Wall engine's files are served and whether this
  is a development build come from the reader (and the editor), the scene reports `scanning` and the reader shows its
  own scanning indicator, and the debug switches stored on the device (lens, resolution, ask zoom, spreads kept ready)
  go through a storage the app hands the engine – the same `osct-…` keys, so stored switches stay. Nothing changes
  for readers.
- **AR errors are codes** (#213): a camera without picture, a failed start, a failed AR load and any other scene
  failure reach the reader as `camera-not-responding`, `ar-start-failed`, `ar-load-failed` and `ar-failed` instead of
  a message it searched for words; the reactions are the same. Every error the app shows carries a code of the one
  list (`progress-converted` and `progress-reset` joined it); the 16 codes nothing raised are gone.

## 1.50.6 – 2026-10-30

### Changed
- **The API's answers are typed once** (#210): the editor and the MCP server read the editor API's answers – the
  books and their tree, entries, targets, spreads, assets, plugin sources, environments, the import's preview and
  comparison, a removal's impact, a publish – from one module, `shared/api/editor.ts`, checked field by field against
  the PHP. Where the old types said otherwise they follow the PHP now: a book always has its `book`, `initialSpreadId`,
  `assetsBase` ("" when none), `live` and `lastPublish`; the book list always names `environments`, the tree its
  `unassigned` entries and an entry's `target` null when it has none; a publish always says its `store` and
  `replaced`; an import answers `counts` and `draft`; a plugin source carries no `usages` (only the list does); a
  removal's impact is the spread's or the entry's. `shared/api/` is outside the content schema lock: no schema bump.
- **The editor's API layer** (#210): every call goes through one request – the session's 401, the API's errors with
  their details (the users' CSV download dropped them), the two-step confirmations of an import and a removal read by
  one helper, one error line for the pages. A book's tree is read once for the stage, the environment and the top
  bar (three reads per spread before) and read again after any save to the book; the book page reads it fresh. The
  settings in localStorage go through one helper – the same keys, so stored settings stay.
- **The Library's *Use* follows the node types** (#210): a plugin node type that takes a file now lists the Library's
  files of its kind as usable, like a built-in one. The default page size and a file's name from its URL are each
  written once.
- **The MCP server's hints cover every publish refusal** (#217): `unknown-materials`, `other-book`, `invalid-env`,
  `invalid-note`, `invalid-replace`, `content-store-failed`, `content-store-unconfigured` and `not-found` now answer
  with a hint, and the `publish` tool's description names every refusal. `list_books` hands on `environments` as its
  description says; `list_assets` filters by the API's kinds (`glb`, `gltf`, … – `model` matched nothing).
- **The PHP API's copies of `shared/` rules are pinned** (#217): a test in `mcp/` lets PHP print the API's constants –
  node types, components, entry categories, the node depth, print surfaces, spread formats, passes, the environment's
  worlds and files, ids, plugin ids, builds, environment names, the Library's kinds, the plugin-type scanner – and fails
  when one differs from `shared/`. No difference found. The environment-name rule, the Library's kinds and the
  plugin-type scanner live in `shared/api/rules.ts` for the CLI, the editor and the MCP server.

## 1.50.5 – 2026-10-30

### Changed
- **The editor no longer carries paths for an older API** (#211): editor and API ship in one image, so the book page's
  "New spreads come in with an import for now", the removals that would have taken a spread or a target at once
  without the confirmation step, and the AI connections' server name taken from the host when `/health` named no
  environment are gone. The server name reads `osct-…` until `/health` answers.
- **The tree's menu is the editor's one context menu** (#212): a right click, a long press with a finger or the menu
  key on the tree opens it for a row – with icons, each move's key at the right, and a disabled move saying why – as
  on the spread cards and the stage. The same actions as before. While a context menu is open, its keys no longer
  reach the stage's shortcuts (← → in the stage's menu stepped to another spread).
- **The admin page's filter is the editor's segmented control** (#212), as in the panels.
- **One number parser in the editor** (#212): a number field and a behaviour rule's value both take `1,5` as 1.5; an
  exponent such as `1e3` is not taken as a number by either (a number field refuses it, a rule's value keeps it as
  text). Before, the rule values read `1,5` as text and the number fields took `1e3`.
- The editor's stylesheets keep a comment only where a rule would otherwise be changed wrongly (#212).

## 1.50.4 – 2026-10-30

### Fixed
- **Stored file URLs no longer come from the request's host headers** (#209): on staging and production the URLs of
  files the server stores itself (uploads without a CDN) are built from `APP_URL`, never from the client's `Host` /
  `X-Forwarded-Host`; an instance without `APP_URL` refuses the upload instead of storing a guessed URL. A local
  development instance still takes the request's host.
- **Admin role changes cannot race** (#209): two admins revoking each other at the same moment can no longer leave the
  instance without an admin, adding an editor by address creates the user and its roles together or not at all, and a
  role granted twice at once answers "already granted" instead of a server error.
- **Library files and their rows stay together** (#209): an upload or a replace whose database rows fail removes its
  file again, two replaces at once get two version numbers, and deleting a file – forced or not – is recorded in the
  book's change log.
- **An AI connection cannot change the account** (#203): `PATCH /api/user` – the update options (newsletter consent)
  and the language – refuses an AI connection's token with 403 `not-for-ai`, as the password and the account deletion
  already did; only the person's own sign-in changes them. No admin route writes them either.
- **Parallel saves no longer overwrite each other** (#209): saving a target, a spread, the book's environment or its
  post-processing reads and writes the row in one locked transaction.

## 1.50.3 – 2026-10-30

### Fixed
- **An import refuses a configuration of another book** (#204): `POST /api/editor/books/{id}/import` answers 400
  `invalid-configuration` naming both ids when the configuration's `book.id` is not `{id}`, and a `book.id` that is no
  id is refused by the import as by its preview (400 `invalid-id`). Before, the rows went under one id while the
  configuration kept the other, and a publish named one book in `latest.json` and another in `game.config.json`. The
  editor's import form already sends the configuration's own id.
- **The uploads of every book are served without a CDN** (#205): the local content store served the files of book ids
  in lower-case letters, digits and `-` only, so a book like `My_Book` got 404s for its uploads.
- **The admin page's CSV button follows the Newsletter filter only** (#206): under *Editors* or *Admins* it said
  "Newsletter CSV" and downloaded the newsletter list; now there is no CSV button there (*All* keeps *Users CSV*).
- **The editor goes back to sign-in when the session ends** (#208): a call answered 401 for the stored token clears
  it and shows the sign-in form with *Your session ended – sign in again.* instead of raw error text in a panel. A
  draft that cannot be loaded shows the error with *Retry* instead of *Building the stage…* forever, and a failed
  removal, target image or environment read shows its error in the page instead of failing silently.
- **Content build and CLI** (#215): editing the CLI's argument parser no longer makes a new content version; a `.glb`
  with a broken JSON chunk no longer stops the build with a raw parse error (its zero-plane check skips it, as any file
  that is no glTF); a thrown string is
  reported as itself instead of "undefined"; the CLI, the API's `ENV` and its publish and content routes share one
  environment-name rule (a letter first, then lower-case letters, digits and `-`, at most 32 – an `ENV` starting with a
  digit now counts as `local`), and the CLI names `demo` when the environment is missing; the build's recording plugin
  API is typed by the engine's `PluginApi`; one SHA-256 helper for the sync and the storage.

## 1.50.2 – 2026-10-30

### Changed
- **A second review of the code base** (#19): unused exports and props removed from the editor and the engine; the
  editor and the content tooling take their types, constants and small helpers from `shared/` or write them once;
  comments explain the code instead of telling its history; the API answers its one hand-made 204 like every other
  and signs confirmations only with a valid secret; the docs and the project rules name the engine's files where the
  AR code moved, the demo's eight plugins, every API class and route, and the right schema rule. Nothing changes for
  readers or editors.

## 1.50.1 – 2026-10-30

### Added
- **The demo aquarium is a water shader study** (#202, demo content only). A plastic toy fish (or a ball) dips into the
  tank's water on a loop and a tap pushes it in once. The tank simulates its surface as a heightfield – a damped wave
  equation on a grid of 32, 64 or 96 cells, on the CPU, written into a half-float texture: the toy pushes the water
  aside by its volume as it plunges and gives it back as it rises, so rings run outward, bounce off the glass and settle.
  The `water` material reads the heightfield – the surface moves with it, its slopes drive a relief, a refraction-like
  tint, a fresnel highlight and a glint – and the floor's caustics gather under the rings. Without the simulation the
  water keeps its static waves. New rows in the Entity panel: dipping toy, loop period, dip depth, simulation, grid,
  damping, splash. About 0.04 ms of work per frame at 64 cells on a desktop. docs/plugins.md "A shader study", the
  tutorial's aquarium shot is new.

## 1.50.0 – 2026-10-30

### Added
- **The behaviour component: rules without code** (#88, content schema 2.19). Any node can carry a `behaviour` – a list
  of rules: *on* an event (the page found or lost, a tap, the first find, or a named event of the stage), *when*
  variables have values (all or any, equal or not, `null` for not set), *do* actions in order – play, pause or stop a
  model's clip, show or hide a node of the subtree by its name, set a variable in a scope, emit a scene event. The
  engine runs the rules on the same event bus and variables as the plugins' code, so rules and plugins hear each other.
  The content build, the reader's check, the MCP server's content model and the API's publish know the component.
- **Editor: the rule editor** in the Entity panel – **+ behaviour** on any node, then per rule its event as pills,
  conditions and actions as rows of pickers: the clips read from the node's model, the subtree's node names, the book's
  variables and events offered. Changes run on the stage at once; an incomplete rule is listed and keeps Save off. The
  Stage panel's timeline marks every rule that ran (`behaviour`, with the target, the rule, its event and what it did).

### Changed
- **The demo book uses behaviours**: a tap on the key plays its clip `rattle`, sets `hasKey` and emits `keyRattled`
  (the plugin component `key` is gone – the rule does its job); the door's rules show its hint and, with the key, hide
  it and emit `openDoor`, which the `door` plugin hears to lift the door. The key is now taken with a tap, not on the
  first find.

## 1.49.2 – 2026-10-30

### Fixed
- **CDN: staging's `versions.json` seemed not to list the build `latest.json` names** (#175). The storage was right –
  the CLI and the API write `versions.json` before `latest.json`, read through the Storage API – but the pull zone
  caches `versions.json` for 30 days, and its edge still served the copy of 2026-10-28 (the demo's too).
  `docs/content-cdn.md` has the edge rule and the purge a person with the account API key runs. `osct content status`
  now checks that `latest.json` and `versions.json` agree – on the storage (exit code 1 when not) and as the CDN serves
  them (a warning) – and `osct content sync` of the current build repairs a `versions.json` that does not record it as
  current instead of reporting "up to date".

## 1.49.1 – 2026-10-30

### Fixed
- **Editor: Make it code on a plugin's node type keeps what its build closes over** (#199): the demo's aquarium turned
  empty after *Make it code* because only its build was copied, without `FISH_COLOURS` from the plugin's `register`.
  The made plugin now carries the plugin's whole source and runs it with an api that registers the copied type under
  the new name and leaves everything else (the water, the caustics) to the original plugin. A source whose register
  export cannot be found is refused with a message saying how to export it.
- **Editor: a made node type that does not build** (#199) keeps the node as it was on the stage; the build's error is the
  Run's error in the Code tab (which opens that plugin, and the Entity panel links there), and the node switches as soon
  as a Run builds it. A Run that leaves one of the plugin's node types failing on the stage now says so in the Code tab
  instead of reporting success, and a Run builds a node whose type failed before anew.
- **Editor on a phone: dragging the sheet down no longer uncovers a black row** (#200): while the sheet is dragged the
  stage keeps its size (one resize on release, #155), and the row it uncovers now continues the stage's bottom edge –
  its colours sampled once when the drag starts.
- **Editor on a phone: no Android tap highlight** (#201): links and buttons no longer flash the browser's blue box; a
  pressed pill, icon button or text link shows the editor's own pressed colour, hover stays mouse-only (#178).

## 1.49.0 – 2026-10-30

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
