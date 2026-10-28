# Entities as a tree: node types, components, shaders in the content (research for #61)

2026-10-28. Question (Tilman, while deciding the editor #61): entities are recursive in the end, and anything
three.js can do should fit into the configuration – we need a small concept for how new entity types or
shaders are assigned to the config, "like 8th Wall or others". References he named: 8th Wall, the Artificial
Museum editor, Spline. Read: 8th Wall Studio's open source ECS (`github.com/8thwall/8thwall`, `c8/ecs/src`),
8th Wall's Studio docs, Spline's docs, PlayCanvas' and Needle Engine's docs, what is public about the Artificial
Museum. No app code changed.

## Short answer

- **Yes, recursive – but as data, not as code.** An entity becomes a **node tree**: typed nodes (what is seen: model,
  video, image, text, group, …) with a placement each, and **components** on a node (what modifies it: material
  layers, animation, audio, behaviour on found / lost / tap). Content describes the tree; the app's registries
  (`registerNodeType`, `registerComponent`) turn it into three.js objects – as `ar/entities.ts` does today for one
  node.
- **"Anything three.js can do" = anything a registered node type, component or layer does** – built into the
  core, or brought by the book as a **plugin**. The registry is the API surface. Tilman (2026-10-28, second round):
  8th Wall's per-project component code was the smart part – a project extends the engine without drilling into
  the framework, an agent can extend it the same way, and the reader stays small. So: a book's content may carry
  **code, compiled by the content build into one plugin chunk** that the app loads lazily with the AR chunk
  (section "Plugins" below). What never happens: code typed into the editor by anyone and run unreviewed – plugins
  live in the content repository, go through the build's type check and a review, like the core.
- **Specs drive everything** – the editor's inspector, the build's checks, the app's config guard, and the tune
  panel are one thing: a parameter spec per type (`kind`, `default`, `min`/`max`/`step`, `options`, `unit`,
  `description`, `group`, `condition`). `FILTERS` and `PLACEMENT_PARAMS` in `shared/types/` are already exactly
  this; the concept extends the pattern to every node type and component. This is what made 8th Wall feel good:
  a component declares its schema once and the editor renders it.
- **Shaders are material layers**, registered in the app by name with a uniform spec (today's `chromaKey` is the
  first), stackable like Spline's layers. Content picks layers and sets their uniforms; GLSL never travels in
  content. A later "shader asset" (GLSL + spec as content) is possible but should wait – every shader needs
  testing on real phones, and a bad one costs the frame rate of the whole page.
- **Schema cost**: `children`, `components` and new node types are new enum values → content schema **2.0**, with
  an up-conversion of 1.x content by the build (one node, `filters` → one material component). Do it together with
  the editor, not before.

## What the references do

### 8th Wall Studio (open source ECS, `c8/ecs`)

- **Model**: World → Spaces → Entities (an `eid`, a transform) → Components. Entities form a hierarchy
  (`parent`), spaces are loaded as units, prefabs are reusable subtrees (`SceneHandle.graphIdToPrefab`).
- **Schemas are flat and typed**: a component's schema maps field names to one of `eid | f32 | f64 | i32 | ui8 |
  ui32 | string | boolean` (`shared/schema.ts`), with `schemaDefaults`. No vectors – a colour is `r`, `g`, `b` as
  three `ui8`, a texture is a `string` URL. Built-in attributes read like three.js materials spelled out:
  `material` (r g b, textureSrc, roughness, metalness, opacity, normalMap, emissive*, blending, repeat/offset, wrap,
  depthTest, wireframe …), `unlit-material`, `video-material`, `shadow-material`, `hider-material`; `gltf-model`
  (url, animationClip, loop, paused, time, timeScale, repetitions, crossFadeDuration); `video-controls`;
  `image-target` (name); geometry, light, camera, audio, ui, splat, face, shadow, hidden, persistent.
- **Presentation is a second schema** (`SchemaPresentation`): per field a `mode` (`enum | attribute | property |
  asset | color | multiline`), `enumValues`, `min`/`max`, `assetKind`, `required`, `label`, a `condition`
  (show the field only when another has a value), and `group` / `section` (collapsible) – from this the Studio
  inspector is generated. Custom components (`ecs.registerComponent({ name, schema, schemaDefaults, data, add,
  tick, remove })`) are TypeScript files in the project; the editor parses them (`parse-component-ast.ts`) and shows
  their schema fields like built-in ones.
- **Shaders**: no shader component – custom shaders are code (`THREE.ShaderMaterial` in a custom component, the
  "animated shaders" sample). Materials are data, shaders are code.
- **Take**: flat typed schema + presentation metadata + a registry = an editor that needs no UI code per type.
  Also the split *data that the editor sets* (`schema`) vs. *runtime data* (`data`).

### A-Frame (the engine 8th Wall grew up with)

Entity-component on top of the DOM: `<a-entity position="…" material="color: red; shader: flat">`. A component
declares `schema: { color: { type: 'color', default: '#FFF' }, speed: { type: 'number', default: 1 } }` with
property types `number | int | string | boolean | vec2 | vec3 | vec4 | color | selector | asset | array | map`;
primitives (`<a-box>`) are sugar over components. The inspector is generated from schemas. Take: the vector and
colour types we want instead of 8th Wall's `r g b`; `selector` = a reference to another node.

### Spline

A design tool, not an engine: objects in a hierarchy, each with a **material = a stack of layers** (Color,
Lighting, Image, Video, Gradient, Noise, Pattern, Fresnel, Matcap, Glass, Toon, Depth, Outline, Displace,
Normal, Rainbow …), every layer with `opacity` and `blending`, masks between layers; **states** (property
sets per object), **events** (start, mouse down, hover, scroll, …) → **actions** (transition to a state, play
animation, open link, …). Exported as a runtime document (`.splinecode`) the viewer plays. Take: designers think
in **layers and states**, not shaders and scripts – a material layer stack with a few blend modes covers most of
what an artist wants from "a shader"; found / lost / tap as events with a short list of actions covers most
"behaviour" without any code.

### Artificial Museum (Vienna)

Web-based, GPS-anchored "artifacts" in public space; the lab (workshops) teaches creating artifacts; a public
"Glitch sandbox" lets authors customise an artifact in code before uploading it to the site, and the framework
is rented out (SystemKunst KG). Little is documented publicly about the editor's data model. Take: for an
artist, a **sandbox that shows the artifact as it will appear** is the product; code-level freedom is offered
to the few who want it. Our mock stage is that sandbox for the book.

### PlayCanvas, Needle Engine (for completeness)

PlayCanvas: entity hierarchy + components, script attributes declared with a typed schema (`number | string |
boolean | vec3 | rgb | asset | entity | json | curve`) → inspector; the scene is one JSON per scene. Needle:
Unity or Blender *are* the editor, components are serialised into the glTF (`NEEDLE_components`), fields marked
`@serializable(Type)`. Take: a scene can live as one JSON document (PlayCanvas) – no table per node; glTF as the
container for "model + its components" is attractive later, not now (our content is YAML and media, not glTF
scenes).

## The concept for OSCT

### Today

```yaml
entity:
  type: video
  src: clip.mp4
  params: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: 1 }
  filters: [{ type: chromaKey, color: "#00ff00", similarity: 0.4 }]
```

One node per target, a registry per type (`registerEntity`), placement and filters with specs
(`PLACEMENT_PARAMS`, `FILTERS`) that the tune panel renders. Everything below generalises this; nothing is thrown
away.

### Tomorrow (content schema 2.0)

```yaml
entity:                                  # the root node sits on the target (1 unit = target width)
  type: group
  children:
    - type: video
      src: clip.mp4
      params: { scale: 1.2 }
      components:
        - type: material                 # a layer stack on the video plane
          layers:
            - { type: chromaKey, color: "#00ff00", similarity: 0.4 }
            - { type: tint, color: "#f3cc94", opacity: 0.2, blend: multiply }
        - { type: behaviour, on: tap, do: openEntry }
    - type: model
      src: racoon.glb
      params: { position: [0.6, 0, 0], rotation: [90, 180, 0], scale: 0.4 }
      components:
        - { type: animation, clip: Idle, loop: true }
        - { type: spin, axis: y, degreesPerSecond: 20 }
        - { type: behaviour, on: found, do: play, delay: 600 }
    - type: text
      text: "{{entry.title}}"
      params: { position: [0, -0.45, 0] }
      components: [{ type: material, layers: [{ type: color, color: "#ffffff" }] }]
```

- **Node** = `{ id?, type, params (placement), <type's own fields>, children?, components? }`. Node types (the
  registry, each with a spec and a builder): `group`, `model`, `video`, `image`, `text`, `plane`, `light`,
  `particles`, later `sound`. A node's own fields come from its spec (`src`, `text`, `font`, …).
- **Component** = `{ type, <spec fields> }`, applied to its node by the registry: `material` (layer stack),
  `animation` (glTF clip), `spin` / `float` / `orbit` (procedural motion), `audio` (positional sound with the
  node), `behaviour` (event → action: `on: found | lost | tap | time`, `do: play | pause | show | hide |
  openEntry | openLink | setState`, `delay`), `visibility` (states), later `lookAround` hooks.
- **Material layers** = registered shader pieces with a uniform spec: `color`, `image`, `video` (the base
  layers), `chromaKey`, `tint`, `fresnel`, `dissolve` (the celebration's shader as a layer), `outline`, each with
  `opacity` and `blend` (`normal | multiply | add | screen`) – composed into one three.js material by
  `onBeforeCompile` chunks, as `chroma-key.ts` and `celebration.ts` do today. Content never carries GLSL.
- **Specs** (`shared/types/specs.ts`, generalising `FilterParamSpec`):
  `{ kind: number | integer | boolean | string | color | choice | vector3 | asset | nodeRef; default; min; max;
  step; unit; options; assetKind; description; group; condition }`. One spec per node type, component and layer,
  exported from `shared/` so the build (`scripts/`), the app's guard (`shared/guards/`), the editor's inspector and
  the tune panel read the same thing – and so that `content-schema.json` locks it (RULES #10).
- **References**: `nodeRef` by `id` within the entity (a behaviour's target, a light's look-at); `asset` by
  asset id (the editor's `assets` table) or by file name in folder content, as today.
- **Variables**: `{{entry.title}}`, `{{book.title}}` in text nodes, as the tutorial steps already do.
- **Shared entities** (`ref`) stay: a whole tree can be shared by several targets.

### How a new capability enters

1. Write the spec and the builder – in the core (`ar/entities.ts` and friends) when every book wants it, or in the
   book's **plugin** when it is this book's thing: `registerNodeType("particles", PARTICLES_SPEC, build)`,
   `registerComponent("spin", SPIN_SPEC, apply)`, `registerLayer("fresnel", FRESNEL_SPEC, chunk)`.
2. Nothing else: the editor shows the new type with its fields, the build accepts and checks it, the tune panel
   gets its sliders, the docs table of types is generated from the specs (`docs/content.md`).
3. Content schema: a new type is a new enum value → MINOR if the app ignores unknown types gracefully (we should
   make it so in 2.0: an unknown node type renders nothing and logs), MAJOR only when a field changes meaning.

### Plugins: the book's own code, compiled by the content build

How 8th Wall actually did it (checked in the open source repository, not assumed): a Studio / Desktop project
has its own `package.json` and is **compiled with webpack** (`ts-loader`, Babel) – `npm run build` for the
published site, `webpack-dev-server` while developing; the project depends on `@8thwall/ecs` and the engine
binary as packages (`apps/desktop/new-project/package.json`). The editor does not run project code to learn
its schema: it **parses the component files' AST** (`c8/ecs/src/shared/parse-component-ast.ts`, `@babel/parser`)
for `registerComponent({ name, schema, schemaDefaults, … })` and shows the fields in the inspector at once, with
errors at their source location. So the "extend without drilling into the framework" came from three things: a
registry API in a versioned package, a per-project compile step, and an editor that reads schemas statically.

The same, adapted to "content on a CDN, app deployed apart":

- **Where**: `plugins/` next to the content (`OSCT_CONTENT_DIR/plugins/*.ts`, later the content repository): small
  TypeScript modules that export `register(api)` and call the same registries the core uses. The `api` object hands
  them the engine: `api.three` (the app's three.js – one instance, no version clash, no second copy), the
  registries, the helpers the core's own types use (material composition, asset loading, the celebration's
  dissolve, chroma key), the spec types. Plugins never `import "three"` themselves.
- **Compile step – yes, in the content build**: `osct content build` bundles `plugins/` with Vite in library mode
  (one ES module, three and the API external, type-checked with `tsc` first – errors go to the author, RULES #16)
  into `plugins-<hash>.js` **inside the content build output**, next to `game.config.json`, so it travels to the CDN
  in the same immutable folder and is cached and rolled back with the content. `game.config.json` declares it
  (`plugins: ["plugins-<hash>.js"]`) plus the **plugin API version** it was built against; the app refuses a plugin
  of a newer API major, as it refuses content of another schema major.
- **Loading**: the app loads the plugin chunk lazily, after the AR chunk, only when the configuration declares one
  (`import(contentUrl(file))` – `utils/game-config.ts` makes the URL, RULES #24), and calls `register(api)` before
  the first spread is built. A reader of a book without plugins downloads nothing extra; the core stays small.
- **Editor and sandbox**: the editor loads the same chunk, so plugin types appear in the inspector with their specs
  (the spec is data the plugin registers – the editor needs no plugin code of its own). Going deeper = editing
  `plugins/*.ts` in the content repository, building, and opening the editor with the draft plus the local plugin
  bundle (`?plugins=<url>` on staging while developing, same-origin or CORS-enabled) – a sandbox like the
  Artificial Museum's, but inside the editor's preview. An agent extends the book the same way: a plugin file, a
  build, the preview, a pull request – without touching the core.
- **Trust**: a plugin runs with the page's full power, so plugins come only from the book's repository through the
  build and a review (STRATEGY: contracted model), never from an upload or an editor text field. The build signs
  nothing today; the immutable CDN folder plus the repository history are the provenance.
- **Alternatives to a compile step**, for the record: (a) plain ES modules in `plugins/*.js`, served from the
  content folder as they are – no TypeScript, no type check, one file per plugin, nothing to install; works today
  with the same `register(api)` contract and could be the first version; (b) transpiling in the browser
  (esbuild-wasm, ~10 MB, editor only) – what a true in-editor sandbox needs later: edit a plugin in the editor,
  see it in the preview without a local build; the published bundle still comes from the content build. The
  recommendation stays (compile in the content build) because the build exists, runs Node and Vite already, and
  is where every other content check lives; (a) is the fallback if we want plugins before the build step is
  written; (b) is the sandbox's future.
- **What the API freezes**: the registries' signatures, the spec shape, `api.three` (the three.js major), a few
  helpers. Everything else inside the app may change without breaking plugins – that is the point of the API.
  Versioned like the content schema (`PLUGIN_API_VERSION` in `shared/`).

### Editor view (the inspector)

Hierarchy panel (the node tree of the selected target's entity, drag to reparent), inspector generated from the
specs (sections: placement, type fields, components, each layer collapsible – 8th Wall's `group` / `section` /
`condition`), the mock stage as viewport, the tune panel's slider/field pair as the number control, assets from
the asset library (upload, "used by"). Gizmo (three.js `TransformControls`) later; sliders first, as decided for
#59.

### Database

One **JSON document per entity** (`entities.scene`, the node tree) – not a row per node: the tree is edited and
versioned as a whole, validated by the specs on save, and joins buy nothing. `entity_assets` is derived from the
document on save (for "used by" and the asset budget). The data model note is updated accordingly.

## Events: book logic apart from scene logic, and the scopes

Tilman (2026-10-28): keep the book's logic and the scenes' internal logic clearly apart; the question is scope –
global (all readers), book, scene; and "scene" needs a definition, because grow loading keeps several targets
active at once and placing things in the room keeps whole worlds standing.

**Two owners of events.** *Core events* belong to the app and describe the book: `targetFound` / `targetLost`,
`targetUnlocked` (first find), `entryConsulted`, `spreadChanged`, `spreadComplete`, `bookComplete`,
`modeChanged`, `entryOpened`, later `signedIn`; `spreadChanged` is the border of the `spread` scope. Plugins and behaviours **subscribe** to them and never emit them –
unlocking, progress, consultation and spread switching stay core, so every book behaves the same and progress
stays compatible. *Scene events* belong to the content: a tap on a node, `videoEnded`, a timer, a state change, and
whatever a plugin registers (`allFoundInChapter`); content and plugins emit and consume them freely.

**Scopes** for events and state:

| Scope | Lives | Holds | Example |
|---|---|---|---|
| `node` | while the entity's tree exists | a node's own state, its behaviours | the racoon's animation state |
| `spread` | while the spread is the current one (`currentSpread`, one at any time – grow loading changes what is *held*, never what is *current*) | the spread's scene: its entities' shared state, variables of this double page | "the second target's video waits until the first one was found" |
| `stage` | while scanning (the AR session) | everything instantiated right now: every active target's entity (of the current spread and, with grow loading, of held neighbours), the look-around world, placed objects | "when target B is found while A is on stage, A turns towards B" |
| `book` | per reader and book, persisted with the progress | variables an author defines (`hasKey`, `chapter`), set by actions, read by conditions | "the door opens only with the key from page 12" |
| `session` | per app start, not persisted | temporary flags | "the hint was shown once" |
| `global` | all readers, on the server | shared state through the API (counts, collective unlocks) | "every 100th reader sees the comet" – later, a privacy decision |

**The scopes are a hierarchy** (Tilman): `node` ⊂ entity ⊂ `spread` ⊂ `stage` ⊂ `session` ⊂ `book` ⊂ `global`.
Two things follow. *Lookup goes outward*: a condition or a variable reference resolves at the node, then the
spread, then the stage, the session, the book, the global scope – the innermost definition wins, like lexical
scope. *Scene events bubble outward*: a node's event is seen by its entity, its spread and the stage unless a
handler stops it; core events are emitted at book level and delivered inward to whoever subscribed. One twist:
the stage is wider than the current spread (held neighbours, the world, placed objects), so it sits above the
spread although both live in the same session.

**A spread is more than a double page** (Tilman): books without double pages exist, and a "spread" may be a
record sleeve (front, back, label), a wall with several targets on it, or the book's front and back cover. So the
definition of the scope is physical, not typographic: **a spread is the set of targets that lie together in the
world and are seen together** – tracked as one group, authored as one scene, with one shared state. Pages are
metadata of a spread, not its definition: `firstPage` / `lastPage` become optional (a wall has none, the cover is
page 0), `order` stays (the reader's path through the work), and the physical format (page size for the mock
stage, #60) gets a per-spread override over the book's default (a wall is not 230 × 320 mm). The word stays
`spread` in OSCT's content and code (RULES #2 – page group = spread; renaming the core's unit to something like
`scene` or `surface` is a decision for the white-label core, #44, not for this concept). The limits stay too:
≤ 10 targets per spread, 4 tracked at once (RULES #3) – a wall with more targets is several spreads, or the
budget grows with the device.

**For the editor this means a layout template per spread** (Tilman: "wichtig, da wir mit Buch als Layout-Vorlage
anfangen"). The mock stage draws the spread's physical shape from a template: `book` (two pages with a spine, the
book's page format, surfaces `left` and `right`), `sheet` (one page), `cover` (front, spine, back), `sleeve`
(a record sleeve: `front`, `back`, `label`), `wall` (one surface of any size), `free` (no surface – targets float
at given distances). A template is a few planes and named **surfaces**; a target's printed geometry (#60) is
given per surface: `surface: right, x, y, width, height` in mm. The editor starts with `book` and the OSCT page
format; the others are small builders added when a work needs them – the same registry idea as for node types.
A spread's template with its dimensions overrides the book's default (`spreads.layout` in the data model).
OSCT itself is a very particular instance of `book` (Tilman: "ganz special in dem Fall hier"): 230 × 320 mm pages,
129 spreads, trigger positions and sizes from the designed PDF (#60), a cover of its own – the template is generic,
the instance is filled from the PDF, never typed in. And the trigger trial's A3 printouts (121 triggers on sheets)
are a second layout of the same targets: a `sheet` template per printout page, so the stage can show the test
sheet as well as the book page.

**Variables are declared, with a scope, a writer and a reader list** (Tilman: like events they sit on a level
of the hierarchy; something like private / public with getters and setters must be definable). Proposal – a
variable is declared where it lives (in the entity's scene, the spread's scene, the book, or by a plugin), not
created by its first write:

```yaml
variables:
  hasKey:        { scope: book,   type: boolean, default: false, write: [actions, plugins] }
  doorOpen:      { scope: spread, type: boolean, default: false, write: [actions] }
  spinSpeed:     { scope: node,   type: number,  default: 20, min: 0, max: 90, write: [plugins] }
  foundHere:     { scope: spread, type: number,  computed: true }          # a plugin's getter, read-only
```

- **scope** = the level it lives on (`node`, `spread`, `stage`, `session`, `book`); lookup from inside outward as
  for everything else. That is the "private / protected / public" of it: a `node` variable is private to the
  entity, a `spread` variable is shared by the spread's entities, `stage` / `book` are public to the work.
- **write** = who may set it: `actions` (the author's behaviours), `plugins` (through the API), `core` (the
  app itself, e.g. `foundCount`); the empty list makes it read-only. **read** needs no list: inner scopes read
  outer ones; a variable can be hidden from the editor's condition pickers with `expose: false`.
- **setter rules** are the declaration's `type`, `min` / `max`, `options` (a write outside them is refused and
  logged, never silently clamped); **getters** are `computed` variables a plugin provides (derived, read-only,
  recalculated when their inputs change). No code-level getters / setters in content – the declaration carries
  what they would.
- **Persistence** follows the scope: only `book` variables go into the progress record (the `variables` map
  above); the others live as long as their scope.
- Readers of a variable: conditions in behaviours (`when: { hasKey: true }`), text nodes (`{{vars.hasKey}}`),
  plugins (`api.vars.get("hasKey")`, with a subscription to changes).

**What a scene is.** Two words for two things, to end the ambiguity: in the **content** a *scene* is the authoring
unit – a spread's entities and, later, its world (`world:` in `spread.yaml`, PLAN Phase 10) – and an entity's
node tree is a sub-scene of it. So the `spread` scope *is* the scene's instance: the spread is the natural unit of
authoring, of state and of events (Tilman: "spread ist definitiv ein Scope, was ja vom Grow auch immer gleich
bleibt") – the tracker may hold neighbours' targets, the app still has one current spread, and a neighbour's page
held in view switches it (`spreadSeen`). At **runtime** there is one **stage**: the set of everything instantiated now –
with grow loading that may be targets of several spreads at once, with spatial placement also objects that stay
in the room after their page is gone. Stage events cross entities; the stage is where "whole worlds stand". Scene
= what the author writes, stage = what the reader sees.

## Code in the editor, not only clicks

Tilman: a click UI is only wanted if the editor also offers code with access to the API; is that a step too far
because of the compiler? No – the compiler splits into two unequal halves:

- **For the preview, in the browser.** The editor transpiles a plugin's TypeScript to an ES module on the fly
  (esbuild-wasm, ~10 MB, loaded only with the code panel; or TypeScript's own `transpileModule`; no type check in
  the browser – that is the expensive half), imports it as a blob URL, calls `register(api)`, re-registers the
  types it replaces and rebuilds the current spread's entities. Errors show in the preview, not in a compiler log.
  Edit → see, no local build. Needs the registries to allow replacing a type by name (small) and the plugin API
  to exist (the real precondition).
- **For publishing, in the content build.** The strict half – `tsc`, bundling, the API version, the immutable
  folder – runs once per publish, as described above. The browser never produces what readers get.
- **Where the source lives.** As content: a `plugins` table (file name, source, `updated_by`, `updated_at`; the
  `changes` log as its history) next to the other rows, published and built like them (`--db`). Git stays the
  export and the review channel, not a precondition for Kévin. A code panel (CodeMirror 6, lazily loaded) with the
  API's type stubs for completion; Monaco would give full TypeScript intelligence at four times the weight – decide
  by use.
- **Order**: route and preview with the mock stage → save to the database → the plugin API and the registry
  refactor → the code panel with browser transpile. Roughly 2–3 days for the last step on top of the barebone. Not
  too far; just not first.

## Recommendation

1. Editor barebone first with **today's** entity model (one node, placement, filters) – the route, the scene, the
   mock stage, the tune panel, save to the database. Kévin can place and tune in Amsterdam with that.
2. In parallel, settle this concept with Tilman and Kévin: which node types and layers the book actually needs
   (the list above is a menu, not a plan). Then content schema 2.0: specs in `shared/`, node tree + components in
   the build and the app, the up-conversion, the editor's hierarchy and inspector.
3. Content-side code only as a compiled plugin (below): a registered type in the book's repository, reviewed and
   type-checked by the build – never code typed into the editor.

## Open (decide)

- Node types for 2.0: `group`, `model`, `video`, `image`, `text`? `plane`, `light`, `particles` later?
- Layers for 2.0: `color`, `image`, `video`, `chromaKey`, `tint`, `dissolve`? `fresnel`, `outline` later?
- Behaviour actions for 2.0: `play`, `pause`, `show`, `hide`, `openEntry`, `openLink`? States (Spline) later?
- Unknown node types tolerated by the app (MINOR for new types) – yes?
- Where the registries' docs live: generated table in `docs/content.md` from the specs (proposal).
- Plugins: the API surface for 1.0 (registries, specs, `api.three`, which helpers). Plugins may register scene
  events and actions (proposal: yes – an agent writes the code once, the author wires it in the editor).
- The core events plugins may subscribe to – proposal (2026-10-28): read-only, a short list – `targetFound`,
  `targetLost`, `targetUnlocked` (first find), `entryOpened`, `entryConsulted`, `spreadChanged` (with the previous
  spread), `spreadComplete`, `bookComplete`, `sceneState` (running / paused / stopped, so plugins stop timers and
  sound). Plus read access: `api.progress` (isUnlocked, isConsulted, completion per spread) and `api.spread.current`.
  Not exposed: the store's writes, the router, camera and tracking internals, the accounts. Per-frame work is the
  component's `tick`, not an event.
- Book-scope variables in the progress – proposal: one `variables` map per book
  (`Record<string, number | string | boolean>`), names chosen by the author, written only by actions (`setVar`,
  `increment`, `toggle`) and by plugins through the API, limits (64 keys, strings ≤ 256 characters), cleared by
  "reset progress", synced with the account like the rest of the record. An optional field added to format 1 –
  older apps ignore it; the reader in `progress-record.ts` keeps it (treat as compatible, not as a format change –
  to confirm against RULES #10/#23). Not for large or per-session state: that is `session` / `stage`.
- `global` scope – proposal: **not in 2.0**. No artistic need named yet, and it is the one scope that costs
  privacy (the selling point is no tracking), an API with abuse control and moderation. Reserve the name; if a
  work needs it later, build it as anonymous aggregated counters only (an increment through the accounts API, no
  per-reader record), opt-in per book, and call it `shared` rather than `global`.
- Spreads without pages (cover, record sleeve, wall): `firstPage` / `lastPage` optional and a per-spread physical
  format – content schema change, together with 2.0; the core's name for the unit (`spread` or a generic word) in #44.

Sources: github.com/8thwall/8thwall (`c8/ecs/src/shared/schema.ts`, `studio-component.ts`,
`runtime/components/*.ts`, `runtime/scene-types.ts`); 8thwall.org/docs/studio (custom components, entities and
components); aframe.io/docs (component schema); docs.spline.design (material layers, states, events and actions,
runtime); developer.playcanvas.com (entities, components, script attributes); engine.needle.tools/docs
(components, serialisation); artificialmuseum.com, Creative Days Vienna 2025 workshop notes, github.com/artificialmuseum.
