Status 2026-11-20: research (#334, under #255), no code changed. Read from OSCT `feature/322-t8-mcp-deliveries` at 280da8c2
(3.18.0, content schema 4.3) and SCUTOONS `develop` at f2b30e2b, both read-only. §6 holds the experience-wide navigation
(Tilman's addition of 2026-11-20), §8 the decisions for Tilman.

# Logic nodes: one concept for OSCT and SCUTOONS

The question (Tilman, 2026-11-20, #334): OSCT's Logic panel (#239) draws a scene's logic as a read-only graph.
SCUTOONS' deck editor already edits node graphs, and SCUTOONS' reader runs logic for its flow. What would one shared
concept look like (a data model for nodes, ports and edges, plus editing and runtime), with the deck editor as the model
to learn from? The addition: how do we show logic that spans the whole experience, so that we can dive into the network
and move through it from the Logic view, with the stage following wherever we land?

## 0 · The answers in short

1. **SCUTOONS has three logic models, not one, and none of them stores a free graph.** Each graph is a **projection
   of documents**. The deck editor's rig graph is computed from a rig, its instruments and presets
   (`deck/space/src/rig/wiring.rs`). Each cable carries its `home`, the one document field that holds it. An edit is a typed
   `Op` that rewrites that one home (`rig/edit.rs`), and the core's validation runs after every op. The Show node view
   is computed from a show row (`deck/show/src/nodes.rs`). Only its wires and canvas (groups, notes, folds) are stored
   in the row. The reader's flow is a list of VN events per group, run by a program counter
   (`viewer/src/lib/visual-novel/script-runner.ts`). Its Flow graphs are read-only views computed per level
   (`shared/content/src/flow.ts`).
2. **That is exactly what OSCT already does.** `editor/src/lib/scene-logic.ts` projects behaviour rules, the event bus,
   variables and plugins into a graph. What OSCT lacks is the deck editor's other three pieces:
   - **typed ports** (the deck's `Signal` table);
   - **levels with stubs** (`Played::wire_view(context)`: rig › track › node, with each cable that crosses the level's edge
     shown as a stub named by its far end);
   - **edit ops** that write back into the home document, checked after each op.
3. **Proposal: one shared logic package (TypeScript) in the OSCT core.** It holds:
   - the view model (nodes, typed ports, edges with a `home`, levels, stubs, groups);
   - a node type registry (core types plus types the title and plugins add);
   - validation as problems at a node or edge;
   - layout;
   - the edit-op grammar.

   The **documents stay the truth**: behaviour components today, plus scene-level and experience-level rules. The graph
   is never a second store. Evaluation stays where it runs today, in the engine (`behaviour.ts`, `plugin-runtime.ts`),
   which is already part of the core of #255. The package lives under option A of #255 (packages inside the OSCT repo).
   SCUTOONS' web code (creator Flow, the XR viewer) can consume it at a pinned tag. The Rust deck keeps its own
   implementation of the same grammar, kept in step by shared JSON fixtures, the way SCUTOONS already keeps its TS and PHP
   expression engines in step.
4. **Experience-wide logic is a level, not a second panel.** The view goes experience › group › scene › target (entity)
   › node. A scene box opens that scene's graph and switches the editor's route. An entity box selects the entity on the
   stage. A stub follows its edge into the other scene. The level follows the selection, as the creator's Flow panel
   already does. Almost all the data is already in the editor's memory (`content.scenes` holds every scene's entity trees,
   and `scenes.tree` holds the groups and entries). What is missing is content: rules that belong to a scene or to the
   experience, and a **goto** between scenes.
5. **Schema:** no backward compatibility before Tokyo, so the clean cut is a MAJOR. It brings `logic` (rules) on
   `SceneData` and `ExperienceData`, the same rule grammar as the `behaviour` component, a `goto` action, and a canvas
   (groups, notes, folds) beside the rules. Entity behaviour stays where it is, on its node.

## 1 · SCUTOONS' deck editor: node model, types, editing, persistence

The deck editor is the **native Rust editor** (`deck/editor`, #444, winit + wgpu, SCUTOONS' own UI toolkit `deck/kit`).
It has two node graphs, and both are worth learning from.

### 1.1 The rig and instrument graph (sound, events, values)

| Aspect | Facts |
|---|---|
| Runtime graph | `deck/space/src/graph.rs`: nodes with typed ports, `PortType` = Video, Audio, Control, Event (#430: event cables are "many to many, one block late between modules, so it orders nothing"). It is checked and ordered **once at load**. Each kind runs in one domain (video per frame, audio per block, control on the frame thread). `Kind` is a closed Rust enum ("a new kind = a variant here + its name + its ports + its block … + its line in that table"). Modules (wasm, `module:<id>`) add kinds through a descriptor (`modreg.rs`, deck-catalog). |
| Documents | `deck/space/src/rig/mod.rs`. An **instrument** is a patch of nodes plus links plus exposed parameters. A **preset** is values, re-routes (`link` / `unlink`) and a parent (lineage). A **rig** is tracks (instrument + preset), `route`s between tracks and to the being, and per-persona / per-mood variants. JSON (entity documents) and TOML (the deck image's core sets) read the same serde forms, and unknown fields are refused. |
| Flattening | `rig/flatten.rs` turns a rig into one playable `Scene` (node ids prefixed `<track>_<node>`, mixers summed, routes as links). The graph the editor draws is this flattened graph. |
| Addresses | `rig/address.rs` is "the one parser of the core": `address := ["/"] { place "/" } leaf` with `place = kind:id` (`scene:nave`, `character:catpope`) and leaf `<track>:<node>.<port>`, `being:<input>`, `policy:<port>`, `@<member>`. Relative inside a document, absolute on a **world node**. `Reach` (local vs far) is one function, so widening the reach changes no document (owner 2026-11-08). |
| The view | `rig/wiring.rs`. `Wiring` is the whole graph with nodes (id, kind, track, domain, depth, typed in/out ports) and links resolved to ports, plus `problems` at their cable or node. `Played::wire_view(context)` (W5, #433) gives **one level**: `""` (rig: tracks, policy and being as boxes), `<track>` (the instrument's nodes), `<track>:<node>` (its ports). Each cable crossing the level's edge becomes a **stub** named by its far end, and `levels` lists the levels above "so a GUI can step up". Every cable knows its `Home` (`Route { index }`, an instrument link, `Compiled`, `Bound`) and whether a gesture may change it. |
| Edit ops | `rig/edit.rs` (#434): `Op` = `Connect { from, to, scale, offset }`, `Disconnect { to, from? }`, `SetValue`, `SetTrack`, `AddNode`, `RemoveNode`, `AddTrack`, `RemoveTrack`, `SetAddress` (serde-tagged JSON). "One op rewrites the one home of a cable or node, in the document's own words." Removing a node takes its cables and its `expose` along. `used_by` warns before an edit of a shared instrument. Nothing in `edit.rs` checks the whole result: the editor runs `rig/validate.rs` after each op ("the Compile for data"). |
| Text view | `Doc::to_toml` / `from_toml`: the same document as TOML, identifiably the same ids as the graph (owner 2026-11-08). |
| Editing UX | `deck/editor/src/wires.rs` (#431, "Wiring on the being"): drag a cable from a port. The ports a dragged cable may reach are the core's answer (each one is tried). A refused gesture shows the core's sentence. Owner rules ([rigs], 2026-11-08 and 11-09): hand rewiring is **native only**; event inputs without a cable hear nothing (no by-name fallback); the world (MIDI, generators, carrier bag, VN state, other decks) enters through **world nodes** with an image of their origin. |
| Undo | `deck/editor/src/main.rs:723`: `undo: Vec<Bundle>`, whole-document snapshots pushed before each change, Ctrl+Z pops. |
| Persistence | `autosave.rs` / `saving.rs`: a burst of edits is one save, sent after `IDLE` = 2 s, on leaving a view, or on Ctrl+S. The save goes through an on-disk outbox until a 2xx. A newer version by someone else keeps yours local. The server stores the rigs in the catalog (`PUT /catalog/<kind>/<id>`) and validates writes through the same Rust core (`deck/build POST /validate`; the creator asks the same check as wasm, `space-web rig_problems`). |

### 1.2 The Show node view (events, rows, cells): the closest relative of OSCT's rules

| Aspect | Facts |
|---|---|
| Document | `deck/show/src/document.rs`. A `Show` has outlets and `rows`. A `Row` has a `fire` (`event?` = a story event id, `how` auto / suggest / hand, `hold_ms`, `moment` now / beat / bar), `cells` per outlet (`Play { piece, values, send, shot }`, `Values`, `Keep`, `Mirror`, `Black`, `Go { row }`, `Free`, `Ask`), `addresses` (what it sends, `character:yellowmouse > dance:samba`), `where` (a filter per column), `wires: Vec<CellWire>` and `nodes: Canvas`. Stored as `show:<id>` in `entity_versions` (server/docs/API.md "Live: shows and sessions"), with `version` stamped by the server. |
| Graph | `deck/show/src/nodes.rs` `row_graph`: far nodes `reader` (the story events as event outlets) and `clock` (beat, bar), the `row` node (inlets `on event`, `on <moment>`), a node per cell, and `sends`. The graph is **computed**. Only cell-to-cell wires (`wiring.rs` `CellWire { from, out, to, in }`) and the canvas are stored. |
| Ports | `deck/kit/src/base/signal.rs`: **one typed grammar** for every view. `Signal` = Event, Control, Clock, Audio, Picture, Address, Vote, Scene, Far. Each has a shape (event = triangle, control / clock / vote = dot, media / scene = square, address = diamond, far = ring) and a colour. Owner 2026-11-17 [design]: "unification and ui sharing or dogma sharing intended": the rows band, node view and 3D tubes draw from that table. |
| Canvas | `deck/show/src/canvas.rs`: `groups` (label, colour, node ids, folded), `notes` (author, text, beside a node), `folded` per node. Edits are `Edit::{Fold, Group, GroupLabel, GroupColour, Note, NoteText}`, each returning the new document and "what happened, in words". |
| Layout | `deck/kit/src/base/graph.rs`: a layered layout, left→right or top→bottom (a workspace setting, owner 2026-11-16), on a 1 rem grid. A layer keeps a group's nodes together. `Graph::fold` collapses members into a pill with one pin per signal. `Activity` (Idle / Stream / Pulse) animates wires at runtime. |
| UX | `deck/editor/src/show/nodes.rs`, `wiring.rs`, `author.rs`. Wheel zoom around the pointer, middle drag or Space+drag to pan, F to frame, click to select (Shift adds), Tab moves focus, box select by drag, Ctrl+G to group, click a wire to pin its value. In the rows band, drag from an outlet to an inlet to wire, and drag a wired inlet to lift its wire. Busy rows bundle wires with a count. One condition control for row and cell filters (`show/condition.rs`). |
| Levels | The conductors **tree**: a seat enters its sub conductor, and the toolbar's path (breadcrumb) leads back (`author.rs`, `subtree.rs`). A sub conductor is shown, not run, when entered. |
| Validation | `deck/show/src/validate.rs`: problems listed in a Problems sheet. The tree is pinned to exact versions for a flash. |

### 1.3 What to take from it

- **Projection plus home plus op.** The graph is computed from the documents. Each edge knows which document field
  holds it. An edit is an op on that field, and a full check follows.
- **One typed signal table** for ports and wires, shared by every view.
- **Levels with stubs and a list of the levels above**, so a GUI can step in and out without losing the edges that
  leave the level.
- **World / far nodes** for what comes from outside the level (another scene, the reader, MIDI), drawn quieter.
- **Canvas data stored beside the logic, not inside it**: groups, notes, folds.
- **A text view of the same document**: TOML in the deck, YAML in OSCT's content folder.

## 2 · SCUTOONS' reader: how the flow runs

| Aspect | Facts |
|---|---|
| Data | Flow is not a graph document. A chapter (`shared/content/src/content.ts:528`) holds `groups`, and each group has `events?: VNEvent[]` (its script), `continues?` (linked groups on one page) and `end?: { target, auto? }`. Slices carry events with a `trigger` (intersect, click, hover; repeat; rect), and placed items carry tap events. Event kinds are in `shared/content/src/visual-novel.ts:180-442`: label, divert, setVariable (set / add), giveItem, takeItem, showMessage, addChoice, showChoices, hideMessage, joinScene, leaveScene, showTextBox, fx, unlockLocation, migrate, setAvatarLocation, askText, jumpTo. Each event has an optional `id` and `if` (`{variable, op, value}` or `{expr}`). `JumpToTarget` = `{ type: chapter / season / toon / product / xr, value, toon?, label?, anyOf? }` (`content.ts:159`). |
| Evaluation | `viewer/src/lib/visual-novel/script-runner.ts` `runEvents`: a **program counter** over the list. An event whose `if` fails is skipped. `divert` jumps to a label in the same script. `jumpTo` navigates and ends the run (`navigated`). The run waits on reader taps, choices, text answers and fx durations. `LOOP_LIMIT = 200` diverts without a reader wait, then it throws. There is no call stack. Every event that passes is `fired` to the session (`reader-story.ts`). With `?live=` it goes to the relay as a `story` message, and that is how the show's rows fire on it (§1.2). |
| Variables | One save game for all of SCUTOONS (`viewer/src/lib/contexts/world.svelte.ts`). The names are `x` (this toon), `global.x` and `toptoy.x` (`shared/content/src/variables.ts`). Read-only namespaces include `reader.`, `inventory.`, `map.`, `now.`. There is **no node, group or chapter scope**. Expressions are ink's inline syntax, in `shared/content/src/expr/` (parse, evaluate, analyse, registry) with a PHP twin checked against the same golden fixtures. OSCT's `shared/text/expressions.ts` is a trimmed copy of it. |
| Levels | No subflows. Levels are containers: the Flow views are computed per level, `sliceFlow`, `groupFlow`, `chapterFlow`, `toonFlow`, `universeFlow` (`flow.ts:1-18`). `FlowNodeKind` and `FlowEdgeKind` are closed unions (`flow.ts:38`, `:182`), with a status of reach / never / loop / stuck (`reach.ts`). |
| Creator view | `creator/src/lib/components/flow/` (Svelte Flow `@xyflow/svelte` ^1.7 + `@dagrejs/dagre`, loaded lazily). It is **read-only**. Its level **follows the editor's selection** (a group → group level, a slice → slice level), a small level switch goes back up, and a click on a box opens that place ("it navigates only when a box is clicked", `flow-dock.svelte`). One dock instance stays mounted across toon › season › chapter and keeps its zoom. |
| Server | `GET /api/creator/flow-index` (FlowIndex.php: toons, cross edges jump / choice / end, dead things, variables). MCP `read_flow` (per level: nodes, edges, exits, stuck points) and `story_variables`. FlowCheck.php mirrors the client checks and returns 422 `invalid_content`. |

The reader's flow is the model for OSCT's **goto** (STRATEGY "Flows": "a goto between scenes and spreads, direct or
through an on-screen instruction") and for the experience-level view. Its event list is not a model for OSCT's runtime:
OSCT's rules are reactive (event → condition → actions), not a script that waits.

## 3 · OSCT today

| Part | Facts |
|---|---|
| Content grammar | `shared/types/behaviour.ts` (schema 2.19, #88). The built-in `behaviour` component on any entity node holds `rules: { on, when?, do }[]`. `on` is either a node event (`found`, `lost`, `tap`, `unlocked`) or any camelCase bus event (scene events and core events `targetFound`, `targetLost`, `targetUnlocked`, `targetTapped`, `sceneChanged`, `arState`, `varChanged`). `when` holds equality tests (`{ hasKey: true }`, `{ any: … }`, `{ not: v }`, `null` = unset). `do` holds `play` / `pause` / `stop` / `show` / `hide` (a node by name in the subtree, `""` = the node itself), `set: { name: value }` with `scope` (scene, stage, session, experience) and `emit`. `behaviourProblems` (the guard), `behaviourRules` (read) and `behaviourData` (shortest form to write) are one grammar for build, guard, engine, editor and MCP. |
| Runtime | `engine/src/scene/behaviour.ts` `applyBehaviour`: per entity node, the node's events come from its hooks and bus events through `api.events.on`. For one event, all conditions are read first, then the matched rules' actions run in order. `MAX_DEPTH = 8` nested events, after which the chain is cut and logged. A failing action is logged and the next one runs. `tune(node)` swaps the rules live (the editor). Each firing goes to the editor's log only (`noteBehaviour`). |
| Bus and variables | `engine/src/scene/plugin-runtime.ts`: **one flat bus**. Core events are emitted only by the engine, and scene events by anyone. Variables have four scopes: `scene` (cleared on `sceneChanged`), `stage`, `session`, `experience` (persisted through the app's `ProgressReader`). A read without a scope looks outward, innermost first. Every write emits `varChanged`. `api.progress` is read-only (unlocked, consulted, completion). Listeners are kept per plugin id and dropped on uninstall. |
| Plugins | Experience code (`content/plugins/<id>/index.ts`) registers components, node types, materials, passes and looks. The build records them in `PluginData.registered`. What a plugin hears, emits, reads or sets is **not recorded**: the Logic panel reads it from the source with regexes (`pluginCodeUses`). |
| Logic panel | `editor/src/lib/panels/LogicPanel.svelte` + `scene-logic.ts` + `logic-layout.ts`. It covers **one scene**, read-only. Node kinds: event, rule, variable, node, plugin. Edges carry words (`on`, `when`, `set = true`, `emit`, `show`, a plugin's type, `hears`, `emits`, `reads`, `sets`). There are **no ports**. Problems are checked across the experience: a variable read but never set, an event heard but never emitted (or the reverse), and a node name not in the subtree. Layout: an own layered layout with no dependency (DFS back edges, longest-path columns, barycentre sweeps, back edges looping below). A click picks a node (`selection.selectNode`) or a plugin (Code tab). Hover lights the neighbours. |
| Rule editing | Only in the Inspector: `panels/BehaviourRules.svelte` + `behaviour-edit.ts` (rules, conditions and actions as forms, with pickers for subtree names, variables and events). Saves go through the tree autosave (`tree-autosave.ts` → `putEntity` / `putTargetEntity`). Undo / redo goes through the server's change log (`history.ts`, #312). |
| Where data lives | The rules sit inside entity trees (targets' or library entities'), stored by the editor API in the database (#322: the database is the only truth). The editor loads the **whole draft of the experience** (`content.svelte.ts` `loadGameConfiguration`: every scene with its targets and entity trees) and the experience tree (`scenes.svelte.ts`: scenes in order, groups, entries). |
| What does not exist | No scene-level or experience-level rules (a rule always sits on an entity node). No goto / scene change from content. No typed ports. No editing in the graph. No levels. |

## 4 · Comparison

| Concept | OSCT | SCUTOONS deck (rig / show) | SCUTOONS reader flow | Mapping |
|---|---|---|---|---|
| Graph as a projection of documents | yes (`sceneLogic`) | yes (`wiring.rs`, `row_graph`) | yes (`flow.ts`) | **1:1**: the shared principle |
| Typed ports | no (labelled edges) | `Signal` table, shapes and colours | no | OSCT adopts the deck's grammar |
| Edge knows its home | implicit (a rule index) | `Home` per cable | no | OSCT adds `home` |
| Edit ops on the home document | Inspector forms only | `Op` (connect, disconnect, add / remove node …) + check | event-list forms | OSCT adds ops |
| Levels / drill-down | no | `wire_view` rig › track › node with stubs; the conductors tree with breadcrumb | slice › group › chapter › toon › universe, following the selection | **1:1 in spirit**: OSCT gets experience › group › scene › entity › node |
| Event → condition → actions | the rule | the row (`fire` → `where` → cells / addresses) | an event with `if` in a script | **1:1** for the rule and the row; the script differs (sequential, waits) |
| Events | flat bus, core vs scene events | event cables (explicit only), far / world nodes, story events | fired VN events → story events | differ: OSCT by name on a bus, the deck by explicit cable. OSCT's bus stays, and the graph draws by-name joins as edges |
| Variables and scopes | scene ⊂ stage ⊂ session ⊂ experience | values on control ports; VN state through world nodes | toon / global / namespaced; no node or group scope | differ; the shared model needs a scope list per title |
| Conditions | equality tests | facts in filters (`protocol::Filter`) | `{variable, op, value}` or `{expr}` | close; expressions are already shared code (OSCT copied SCUTOONS' parser) |
| Navigation (goto) | none | `Go { row }`, addresses | `jumpTo`, `divert`, `end` | **only SCUTOONS has it**: OSCT adds `goto` |
| Loops and depth guard | `MAX_DEPTH = 8` | zero-delay loops refused (deck-events), hop limit | `LOOP_LIMIT = 200` | same idea, different numbers |
| Canvas (groups, notes, folds) | no | stored in the row | no | OSCT adopts it |
| Node type registry | closed lists + plugin registrations | closed `Kind` enum + module descriptors | closed unions | the same pattern: core kinds + registered kinds |
| Plugins / modules as nodes | plugin node, uses read from source | module node with a descriptor (declared ports) | none | OSCT should let a plugin **declare** what it hears / emits / reads / sets |
| Live activity on wires | log only (`noteBehaviour`) | `Activity` pulses / streams | none | OSCT can pulse edges from `observeEvents` |
| Text view | YAML content (the export) | TOML view | JSON | same idea |
| Implementation language | TypeScript / Svelte 5 | Rust (own UI toolkit) | TypeScript / Svelte | no shared code with the deck: shared grammar plus fixtures |

## 5 · The proposed shared concept

### 5.1 Principle

**The documents are the logic, the graph is a view of them, and an edit is an op on one document.** No graph document
is stored next to the rules. The only stored graph data is the canvas (groups, notes, folds, and optionally pinned
positions), and it is stored beside the rules it frames. This matches all three SCUTOONS models and OSCT's own panel.
Because the view is computed, it can never drift from what the engine runs.

### 5.2 The common data model (package `logic`)

```ts
type Signal = "event" | "value" | "node" | "scene" | "address" | "far";   // a subset of deck-kit's Signal, same shapes

interface PortSpec   { id: string; label: string; signal: Signal; dir: "in" | "out"; many?: boolean }
interface NodeType   { kind: string; family: "event" | "rule" | "action" | "variable" | "entity" | "scene" | "plugin" | "far";
                       ports(params): PortSpec[]; owner: "core" | string /* title or plugin id */ }
interface GraphNode  { id: string; kind: string; label: string; detail: string; ports: PortSpec[];
                       pick: Pick | null; enter?: Context; problem?: string; far?: boolean; group?: string }
interface GraphEdge  { id: string; from: [node: string, port: string]; to: [node: string, port: string];
                       signal: Signal; label: string; home: Home | null /* null = derived (by-name bus join) */ }
interface Stub       { edge: GraphEdge; side: "in" | "out"; far: Context; label: string }   // an edge leaving this level
interface View       { context: Context; levels: Context[] /* root first */; nodes: GraphNode[];
                       edges: GraphEdge[]; stubs: Stub[]; problems: Problem[]; canvas: Canvas }

type Context = { level: "experience" } | { level: "group"; group: string } | { level: "scene"; scene: string }
             | { level: "entity"; scene: string; target: string; path: number[] };
type Home    = { doc: "entity"; target: string; path: number[]; component: number; rule: number; part: "on" | "when" | "do"; index?: number }
             | { doc: "scene"; scene: string; rule: number; part: …; index?: number }
             | { doc: "experience"; rule: number; part: …; index?: number };
type Op      = { op: "addRule"; at: Home } | { op: "connect"; from; to } | { op: "disconnect"; edge: string }
             | { op: "setCondition"; home; tests } | { op: "addAction"; home; action } | { op: "removeAction"; home }
             | { op: "removeRule"; home } | { op: "canvas"; edit: CanvasEdit };   // CanvasEdit = the deck's Edit set
```

- **Versioning.** The package follows the content contract's MAJOR.MINOR (RULES #10). A node type carries no version of its
  own. A title's or plugin's types are checked against what the build recorded, as plugin passes and components are
  today.
- **Registry.** The core registers the families and OSCT's verbs (play, pause, stop, show, hide, set, emit, goto). A title
  can register more: SCUTOONS' `giveItem`, `jumpTo` with `JumpToTarget`, choices. A plugin **declares** its bus use in
  `registered` (hears, emits, reads, sets: a MINOR), which replaces the regex reading. `pluginCodeUses` stays as the
  fallback while a plugin declares nothing.
- **Ports from the grammar, not drawn by hand.** A rule has an `on` inlet (event), a `when` inlet (value, many) and a `do`
  outlet per action. An action has inlets and outlets by verb (`set` → a value outlet to the variable; `emit` → an event
  outlet; `show` → a node outlet; `goto` → a scene outlet). An event source has an event outlet. A variable has a value
  inlet (who sets it) and a value outlet (who reads it).
- **By-name joins are edges with `home: null`.** OSCT's bus joins by name (`emit doorOpened` → `on doorOpened`). The view
  draws that join as an edge whose `home` is null. Drawing it changes nothing. Connecting two ports by hand is an op that
  writes the name into both homes, for example sets the rule's `on` to the emitted event's name. This keeps OSCT's bus
  semantics and gives the deck's "every cable visible" feel. The deck's rule "an event input with no cable hears nothing"
  is **not** adopted. It would change OSCT's runtime and plugin API (decision L6).

### 5.3 What is shared and what stays app-specific

| In the shared `logic` package (TypeScript, pure, no DOM) | Stays in the app |
|---|---|
| The types above; `Signal` table (names, shapes; colours as theme tokens) | The Svelte panel, gestures, theme |
| `project(content, context)` → `View` (today's `sceneLogic`, generalised to every level, with stubs) | Reading plugin sources from the API (`getPlugin`) |
| Node type registry with core types; `register(type)` for title and plugin types | OSCT's verbs' engine side (`behaviour.ts`), SCUTOONS' VN runner |
| `apply(op, docs)` → new documents + words; `problems(docs)` | Saving (autosave, change log), undo |
| Layout (today's `logic-layout.ts`, plus groups, folded pills, direction, a grid) | Navigation (routes, selection store) |
| Canvas edits (fold, group, label, colour, note) | |
| Conformance fixtures (`fixtures/logic/*.json`: documents → expected view) | |

**Evaluation is not in the package.** OSCT's evaluation is the engine's behaviour runtime and bus, which is already
core (#255 §1.1, `engine/src`). SCUTOONS' VN runner is a different machine, a sequential script that waits. Merging the
two runtimes would gain nothing. The shared part is the **grammar of conditions and values**: `passes` (equality tests)
and the expression engine that both already have.

### 5.4 OSCT's behaviour, events and variables in this model (the MAJOR)

1. **Entity rules stay where they are**: the `behaviour` component on a node, the node-level home. Their actions
   still name nodes in the subtree.
2. **Scene rules (new):** `SceneData.logic?: { rules: BehaviourRule[]; canvas?: Canvas }`. Same grammar. `on` hears bus
   events and core events (`sceneChanged`, `targetUnlocked` with a payload filter later). Actions name targets' nodes by
   address (`target:<id>/<name>`, borrowing the deck's address shape) instead of a subtree name.
3. **Experience rules (new):** `ExperienceData.logic?`, the same again. For example "all targets of the group unlocked →
   set `chapterDone` (experience) and goto `scene:epilogue`".
4. **`goto` action (new):** `{ goto: "scene:<id>" }`, later `{ goto: …, via: "instruction" }` for STRATEGY's on-screen
   prompt ("turn the page", "go to the wall"). The engine emits a request through a new `ArSceneOptions.navigate(address)`.
   The host resolves it (the reader's router; the editor's stage switches scenes or only logs it). This is the `goto` that
   #255 §3 and D9 list as a contract addition. Its address grammar should be SCUTOONS' (`scene:` place, later `toon:` /
   `chapter:` for SCUTOONS' own targets), so one parser serves both.
5. **Canvas** next to each rules list (entity behaviour: a `canvas` field on the component, or one per scene for all of the
   scene's nodes; see decision L4).
6. **Migration:** none needed for existing rules, because entity behaviour keeps its form. The MAJOR exists only to
   reshape `when` if L5 picks expressions (`when: "hasKey and tries > 2"`). The content in the database is migrated by a
   server migration (the `Migration4.php` precedent), the fixture and demo by the content build. Reader, editor, MCP and
   the PHP guard move together (RULES #10, no compatibility before Tokyo).

### 5.5 Editing in the OSCT editor, following the deck editor

- **Gestures → ops → documents → view.** A drag from a typed outlet to an inlet is `connect`. The candidate inlets
  light up only where `apply` would accept the op (the deck's "each is tried"). Delete on a selected edge or node gives
  `disconnect` / `removeRule` / `removeAction`. A typeahead on the empty canvas adds a node: a rule, an action (on the
  selected rule), a variable reference or an event. A refused op shows the package's sentence.
- **After each op:** `problems` runs (the deck's "Compile for data"), the home document goes through the existing save
  path (tree autosave → `putEntity`, and a new `putScene` / experience field for scene and experience rules), and the
  engine's `tune()` swaps the rules live on the stage.
- **Undo** stays OSCT's: the server change log (#312) plus the session's undo steps. A burst of graph gestures is one
  step (`BURST_MS`), as the deck's 2 s autosave burst is.
- **The Inspector's rule editor stays** as the form view of the selected rule (as the deck keeps forms beside the
  graph). The graph and the Inspector show the same rule, and selecting in one selects in the other.
- **Canvas UX from the deck:** groups (Ctrl+G), notes, folding, box select, F to frame, wheel zoom, Space+drag to pan, the
  direction setting, hover lighting (OSCT has it already), and edge pulses from `observeEvents` while the stage runs
  (the deck's `Activity`).
- **Graph widget:** OSCT's own SVG layout today; SCUTOONS' creator uses `@xyflow/svelte` + dagre. For editing (connect,
  drag, minimap), xyflow saves real work, and SCUTOONS' creator already ships it on Svelte 5. That would align the two web
  editors. Decision L7: **decided (Tilman, 2026-11-20): xyflow, as the rendering layer only.** The package computes the
  view and the layout. xyflow draws it and reports the gestures. Those gestures become ops, so xyflow never owns the
  data.

### 5.7 Free nodes on the canvas (Tilman's question, 2026-11-20)

Tilman: *"can we add free nodes to this canvas? … a whole other world of how to manage generative content … a more
creative tool."*

Yes. Free nodes extend L1 rather than break it: **every node still lives in a document**. A free node's document is the
canvas, not a rule. The canvas then holds three kinds of thing:

| Kind | Stored where | Who runs it | Examples |
|---|---|---|---|
| **Computed nodes** (today's) | nowhere: projected from rules, entities, variables, plugins | the engine, in the reader | a rule, an action, an event source, a variable |
| **Free nodes, editor only** | the canvas (`canvas.nodes`) | nobody: they frame and inform | a note, a sketch, a reference image, a link, a mood board, a "todo" |
| **Free nodes that make something** (generative) | the canvas, as a small graph of their own (`canvas.nodes` + `canvas.wires`) | the editor or the server, **while authoring**, never the reader | prompt → generator → variants → pick → asset, then an entity placed in the scene |

The key split is **authoring time vs reading time**:

- **Authoring-time graphs (recommended first).** A generative chain runs in the editor or on the server. Its *result* is
  ordinary content: an asset in the asset store, an entity in the scene, a text in an entry. The reader stays unchanged
  and never sees the graph. Its output nodes have outlets to computed nodes ("place as entity on target X", "use as this
  entity's texture"). Running the chain is an op whose result goes through the normal save, change log and revert.
  Every generated asset records its origin (graph, node, prompt, seed, model), like the `origin` in the #322 export.
  Then a re-run, an export and credits can follow it.
- **Reading-time free nodes (later, if ever).** A free node that the reader evaluates (a random pick per reader, a
  generator call on the phone, a value computed from time or place) is runtime logic. It needs the engine, the contract
  and the guard, which is the same cut as L-T5. Keep it out until a concrete case asks for it.

Why this fits: the canvas is already stored (L4) and edited through ops (`{ op: "canvas"; edit }`). Free nodes add
`CanvasEdit`s (`addNode`, `moveNode`, `setParams`, `wire`, `unwire`, `run`). The node type registry (§5.2) takes free
node types in the same way, with `family: "free"`, ports from their params, and an `owner` (core, title or plugin). So a
generator can come as a plugin or a server integration without touching the core. xyflow (L7) draws computed and free
nodes on one canvas. Only the colour and the shape differ: computed nodes are fixed in place by their documents, free
nodes move freely.

Ties to look at, not checked here: SCUTOONS already has generations with an approval step (its MCP has
`start_generation`, `check_generation`, `approve_generation`, `list_generators`). A generator node could call those, or
a RunPod endpoint, and land its result as a draft that a person approves. That matches the rule that an AI never
publishes. #322's delivery endpoint is the existing door for content that comes from outside.

Open questions (L11–L13 in §8): whether the canvas stays editor data (L4) once it holds generative graphs worth
exporting, where generation runs and who pays, and what a free node may reach. **Decided 2026-11-20, see §5.8.**

### 5.8 Built-in and custom nodes: a module per node (Tilman, 2026-11-20)

Tilman: *"L11 of course. L12 of course. L13 for now that makes sense. Also inside osct the generator nodes are not yet
intended. we will do most there from importing files. But wiring them up. Important. Each node can host a module as a
script so we can get access to the api. So eventually we will have nodes that got built in logic and our custom ones."*

**What this means for OSCT:**

- **There are no generator nodes in OSCT for now.** In OSCT, content comes in by importing files: the #322 deliveries,
  the asset upload and the import YAMLs. The canvas's first job is **to wire those files up**. A file node, or a
  delivery node that has one outlet per file, gets cables to targets, entities and texture slots. The explicit apply
  (L13) then writes them. For a delivery node, that apply is the delivery endpoint itself (`POST …/deliveries`, preview
  first and then `apply`). That puts the existing door for content from outside onto the canvas.
- **Two families of node.**
  1. *Built-in nodes:* the core registry's types (§5.2): rules, actions, events, variables, scenes, entities, files.
  2. *Custom nodes:* a **module** (a script) that declares its ports and params and can use the API.

  Both are drawn and wired the same way. They differ only in `owner`: core, the experience, or a plugin.
- **A custom node is a plugin capability, not a new format.** OSCT already has the machinery. A plugin is a module that
  the experience stores and versions; it has usages, a Code tab with **Run**, and a sandbox (#234). A plugin already
  registers components, entity node types, looks and passes, and records them in `registered`. So a custom logic node
  is one more registration: `registerLogicNode({ kind, ports(params), params, run })`, recorded in
  `registered.logicNodes`. That is an API MINOR. Upload, versions, export (#322 `plugins`) and the guard stay as they
  are.
- **The API access, the way the stage frame already does it.** In the stage frame, plugin code runs at an opaque origin
  with no cookie and no session, and every API call stays in the page (`docs/editor.md`, "The stage frame"). A node
  module gets an `api` object, and each call on it is a **request to the page**. The page checks the call against a
  list and makes it with the person's session and the person's rights; the API decides, as with the MCP. Under L13:
  - **Reading is free:** the experience, its scenes and entries, the assets, the deliveries' previews.
  - **Writing only through the apply op:** a module's `run` returns ops or a delivery, and the person applies them. They
    then go through save, the change log and revert.
  - **No token ever reaches a module.**
- **When a module runs.** First at authoring time only, in the editor, in a sandboxed frame or worker like the stage's.
  A module that runs in the reader (a custom rule node, evaluated live) is the reading-time case of §5.7. It belongs
  with the L-T5 cut and, later, with the engine's behaviour runtime. A module may declare both sides; the reader loads
  only its reading-time half.
- **The same for SCUTOONS.** The node registry with `owner` and the module contract (`ports`, `params`, `run` returning
  ops) are part of the shared `logic` package. Each app supplies its own `api` bridge.

Steps this adds (after L-T4): **L-T12** file and delivery nodes with wiring and apply (uses #322 T5/T8);
**L-T13** `registerLogicNode` in the plugin API with the `api` bridge through the page (sandbox, allow-list, apply-only
writes); **L-T14** (later) reading-time custom nodes in the engine with L-T5.

### 5.6 Where the shared code lives (#255)

Following #255's recommendation **A**: `packages/logic` (name e.g. `@animus/logic`) in the OSCT repo's root workspace.
It goes beside `@animus/contract` (today's `shared/`, where the rule grammar stays) and `@animus/engine` (where the runtime
stays). It depends only on the contract. Its consumers:

- OSCT's editor (the Logic panel), and OSCT's MCP (`mcp/` is TypeScript, so a `logic_view(context)` / `logic_ops` tool can
  import it directly, with no PHP mirror for the view).
- Later, `editor-kit` (#255 phase 1.2), when the Logic panel moves into the kit.
- SCUTOONS' creator and viewer at a pinned tag, **if** SCUTOONS adopts it (its own views keep working without it).

The **deck (Rust) shares no code**. The `Signal` names and shapes, the op names, the canvas edits and the address grammar
are kept equal by JSON fixtures that both test suites read. SCUTOONS does this already between TS and PHP for
expressions (`shared/content/test/fixtures/expr`).

## 6 · Experience-wide logic: levels, navigation, the stage following

### 6.1 Scopes and how they nest

| Level | What it shows | Its boxes you can enter | What crosses its edge (stubs) |
|---|---|---|---|
| **Experience** | Scenes in order (groups as frames, the deck's groups); experience rules; plugins (they act on every scene); `experience`- and `session`-scope variables; core events | a group, a scene, a plugin (opens the Code tab) | nothing (the top) |
| **Group** | its scenes and their cross edges (a loading window, SCENES.md) | a scene | edges to scenes outside the group |
| **Scene** | today's panel: targets' entities as boxes; scene rules; `scene` / `stage` variables; the scene's bus events; plugins on its nodes | an entity (a target's tree) | goto in / out (from / to which scene), variables set elsewhere and read here, events emitted elsewhere |
| **Entity** | one target's tree: its behaviour rules with their actions and the nodes they act on | a node (selects it; a node is the leaf) | events, variables and goto edges leaving the entity |

Cross-scene edges at the experience level are derived:

- **goto**: a rule in A goes to B.
- **variable**: set in A (scope `experience` or `session`), read in B's rules, B's texts (`{hasKey}` in entries,
  `shared/text/expressions.ts`) or a plugin.
- **event**: emitted in A, heard in B.

One edge is drawn per kind and pair, with a count, as the deck bundles busy wires.

One open semantic point: the bus is per stage, and behaviour instances exist only for entities that are built. So
whether an event emitted in scene A reaches a rule in scene B depends on B being loaded (groups are loading windows). The
view should mark such an edge as "only while loaded". This was **not verified** in the engine's loader for this note
(ticket L-T3 checks it).

### 6.2 Navigating in the Logic view

- **Enter:** double-click (or Enter) on a box with `enter` opens its level. A single click selects, as today. This
  follows SCUTOONS' creator Flow, which "navigates only when a box is clicked".
- **Breadcrumb:** `View.levels` (root first), e.g. *Experience › Chapter 2 › 186–187 › door*. Backspace or Alt+↑ goes
  one level up. This reuses the selection's own `up()` / `parentSelection`, which the tree's ← already uses.
- **Follow an edge:** a stub sits at the level's border, named by its far end ("→ scene Epilogue · goto", "hasKey ← set
  in Cover"). Clicking it enters the far end's level and selects the far node, the deck's stub rule.
- **Search:** a typeahead over every node of the experience projection: events, variables, rules (by owner), plugins,
  scenes. A hit enters the hit's level and selects it. This reuses `ExperienceSearch.svelte`'s pattern (`selection.requestOn`
  + the route).
- **Level follows the selection** unless the author picked one, as in the creator's Flow panel (`flow-panel.svelte`:
  "the level the author picked (null: follow the selection) – a new selection follows again").

### 6.3 The stage follows, and the reverse

| Logic view action | Editor does (existing mechanisms) |
|---|---|
| Enter a scene box (or a stub into another scene) | `openScene(id)` in `routes/(app)/[experience]/[scene]/+page.svelte` (loads the draft if needed, `goto(resolve(...))`); the stage opens it (`stage.open(sceneId)`); the selection to land on goes through `selection.requestOn(sceneId, state)` and is applied in `selection.enter(sceneId)` |
| Enter or select an entity / node box | `selection.selectNode(target, path)` (today's `onpick`); the stage outlines it, the tree and the Inspector follow |
| Select a scene-rule or experience-rule box | `selection.selectScene()` / `selectExperience()`: the Inspector shows the rules list (new rows there) |
| Select a group | `selection.selectGroup(id)` |
| Select a plugin | the Code tab on it (exists) |
| **Reverse:** a selection on the stage, tree, Scenes panel or search | the Logic view moves to the deepest level the selection allows (scene → scene level, a node → its entity level) and highlights the box; a route change to another scene moves the view to that scene unless the author pinned the experience level |

The Logic view's place (its `Context`) belongs in the panel's state plus the URL query (`?logic=experience`, `?logic=entity`),
so a reload or a shared link lands on the same level. The route already carries the scene. Decision L8.

### 6.4 Data the experience graph needs

| Needed | Already in the editor | Missing |
|---|---|---|
| Every scene's targets and entity trees with behaviour | `content.scenes` (the whole draft through `loadGameConfiguration`); LogicPanel already passes `experience: trees` for problems | – |
| Scene order, groups, entries (texts that read variables) | `scenes.tree` (`GET /editor/experiences/{id}`: scenes in order, groups, entries) | the entries' texts for variable reads: check whether the tree carries them, else the `entries` store |
| Plugins and what they use | `getPlugins()` + `getPlugin` sources (read per experience) | a **declared** bus use per plugin (§5.2), so the view does not depend on regexes |
| Scene and experience rules, goto | – | content (the MAJOR, §5.4), editor API fields (`PUT` scene / experience logic), the PHP guard mirroring them |
| Canvas | – | content field (§5.4) |
| For the MCP / agents | – | `logic_view` tool computed in `mcp/` with the package from the draft export (#322 T1 `export` endpoint), no new PHP |

No new read endpoint is needed for the editor: the experience projection is computed client-side from what is
already loaded. That is the cheap part.

## 7 · Steps (tickets)

| # | Ticket | Size | Depends on |
|---|---|---|---|
| L-T1 | `packages/logic` (or `editor/src/lib/logic/` until #255 0.1 lands): the types of §5.2; move `sceneLogic`, `logic-layout` and `pluginCodeUses` in; ports from the rule grammar; `home` per edge; tests carried over | S | – |
| L-T2 | Levels: `project(content, context)` for experience / group / scene / entity with stubs and `levels`; derived cross-scene edges (variables, events; goto after L-T5) | M | L-T1 |
| L-T3 | Logic panel navigation: enter, breadcrumb, stubs, search, level follows selection, `?logic=` in the URL; stage and Inspector follow (§6.3); check and mark the "only while loaded" event semantics | M | L-T2 |
| L-T4 | Edit ops: `apply(op)` on entity behaviour (`behaviourData`), `problems` after each op; gestures in the panel (drag to connect, delete, typeahead add); save through the tree autosave; `tune()` live; undo through #312 | M | L-T1 |
| L-T5 | Contract MAJOR: `logic` on scene and experience, `goto` action with a `scene:<id>` address, `canvas`; engine runtime for scene / experience rules; `ArSceneOptions.navigate`; reader router resolves it; editor stage logs or follows; PHP guard, MCP, docs/content.md, migration | L | decisions L2–L5 |
| L-T6 | Plugins declare their bus use (`registered.events` / `vars`: hears, emits, reads, sets): plugin API + build + guard (MINOR); the view prefers it over the regex | S | – |
| L-T7 | Canvas: groups, notes, folds, direction setting, grid, folded pills in the layout; edge pulses from `observeEvents` while the stage runs | M | L-T4, L-T5 (field) |
| L-T8 | Signal grammar as theme tokens: OSCT's port shapes and colours from one table (DESIGN.md), named like deck-kit's `Signal` | S | L-T1 |
| L-T9 | MCP: `logic_view(context)` and `logic_ops` tools over the package | S | L-T2, L-T4 |
| L-T10 | Conformance fixtures `fixtures/logic/` (documents → views, ops → documents) for SCUTOONS (TS creator, Rust deck) to test against | S | L-T2, L-T4 |
| L-T11 | (SCUTOONS, its own issue, if L9 says yes) creator Flow views and `read_flow` typed by the shared `View` / `Signal`; the XR viewer runs OSCT's engine and its behaviour | M | the core tag (#255 0.4) |
| L-T12 | File and delivery nodes on the canvas: one outlet per file, cables to targets, entities and texture slots; apply = the delivery endpoint (preview, then apply) or ops (§5.8) | M | L-T4, #322 T5/T8 |
| L-T13 | Custom nodes: `registerLogicNode` in the plugin API (MINOR, `registered.logicNodes`); runs at authoring time in a sandbox; `api` bridge through the page (allow-list, reads free, writes only as ops to apply) | M | L-T4, L-T12 |
| L-T14 | (later) Reading-time custom nodes evaluated by the engine | M | L-T5, L-T13 |

Order: L-T1 → L-T2 → L-T3 delivers Tilman's navigation on today's content, with no schema change. L-T4 adds editing
of entity rules. L-T5 is the schema cut and is best done as one MAJOR together with any other planned cut before Tokyo.

Scope note (workspace rule "Scope creep"): this is not on the Tokyo path of PLAN.md. L-T1–L-T3 are editor-only and do
not touch the reader. L-T5 changes the reader and the contract.

## 8 · Open decisions for Tilman

| # | Decision | Recommendation |
|---|---|---|
| L1 | **Logic stored as documents with a computed graph** (the deck's and the reader's way), or as a stored graph document (nodes + edges) | documents + projection + ops; only the canvas is stored as graph data |
| L2 | **Rules beyond entities:** add scene-level and experience-level `logic` (same grammar) | yes, in one MAJOR with `goto` |
| L3 | **`goto` and its address:** `scene:<id>` with the deck's / SCUTOONS' address grammar, resolved by the host through `ArSceneOptions.navigate`; on-screen instructions ("turn the page") as a later `via` | yes; STRATEGY said "Not for OSCT" for flows (2026-10-31): confirm that OSCT itself may use goto, or keep it core-only for SCUTOONS and the show |
| L4 | **Where the canvas lives:** per behaviour component, per scene for all of its nodes, or editor-only (not in the contract) | per scene (`SceneData.logic.canvas`) plus experience; it is editor data, so the reader ignores it |
| L5 | **Conditions:** keep equality tests, or move `when` to expressions (`shared/text/expressions.ts`, SCUTOONS' language) | expressions in the MAJOR (one language for texts and rules, SCUTOONS-compatible), with the tests form read in once by the migration |
| L6 | **Events by name (bus) or by explicit cable** (the deck's rule) | keep the bus by name and draw joins as derived edges; explicit-only would break the plugin API |
| L7 | **Graph widget:** keep OSCT's own SVG, or adopt `@xyflow/svelte` (SCUTOONS' creator already uses it) for editing | **decided 2026-11-20: xyflow as the rendering layer** (package computes view and layout; gestures become ops); still check the build and RULES' stack list |
| L8 | **The Logic view's place in the URL** (`?logic=`) or only in the panel's state | URL query |
| L9 | **SCUTOONS adoption:** does SCUTOONS' web side consume `@animus/logic` (its 2026-11-20 note "no sharing across the projects" for panels), and does the deck test against the fixtures | share the package and the fixtures, not panels; SCUTOONS decides in its own issue |
| L10 | **Priority:** L-T1–L-T3 (navigation, read-only) now, editing and the MAJOR after the #255 phase 0 or after Tokyo | L-T1–L-T3 now (editor-only); L-T4–L-T5 when Tilman sets it against the Tokyo plan |
| L11–L13 | **Decided 2026-11-20 (Tilman): yes to all three as recommended.** No generator nodes in OSCT for now; imported files get wired up instead. A node can host a module (§5.8) | – |
| L11 | **Free nodes (§5.7):** editor-only and authoring-time generative nodes on the canvas; reading-time free nodes not now | yes; this moves the canvas from "editor data the reader ignores" to "authoring data the export carries" (L4 then: canvas in the DB per scene and experience, in the #322 export, still not in the reader build) |
| L12 | **Where generation runs:** in the editor (browser calls a service), on OSCT's server (queue, keys on the server), or through SCUTOONS' generations | the server, with the keys there and a draft to approve; first generator through an interface a plugin can fill |
| L13 | **What a free node may reach:** only the canvas and its own outputs, or also writes into the scene (place entity, set texture) | outputs become content only through an explicit "apply" op that goes through save, change log and revert |

## 9 · Not checked

- Nothing was built or run. The SCUTOONS facts were read from code and docs at f2b30e2b. The deck editor's gestures
  were read from `wires.rs`, `show/nodes.rs` and `show/wiring.rs` headers, not tried.
- Whether a scene event reaches rules of a scene outside the current loading window (§6.1) was not traced in the
  engine's loader.
- Whether `@xyflow/svelte` 1.x builds under OSCT's SvelteKit 3.1 / TypeScript 6 was not tried.
- Whether the experience tree from `GET /editor/experiences/{id}` carries the entries' texts (for variable reads) was
  not checked.
