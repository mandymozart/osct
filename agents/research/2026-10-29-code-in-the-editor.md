# Code in the editor: how a script enters, the plugin API 1.0, what runs where (#66, decided 2026-10-29)

Tilman, testing the editor on staging: "wo kann ich meine eigenen JS-Skripte im Editor ansetzen, also Shader
hinzufügen? … wie hatte das Niantic Studio gemacht? Das war mega. Wichtig für Spezialeffekte für Kévin und für
erweiterte Game-Logik." The concept (`2026-10-28-entity-components.md`, "Plugins" and "Code in the editor, not
only clicks") is settled; this note decides the first version. Phase 15 steps 3–4 of `PLAN.md`.

## How a script enters

**A plugin is a folder in the content source, compiled by the content build – that is the way to readers.**
`<content>/plugins/<id>/index.ts` (more files next to it are bundled in) exports `register(api)`. `osct content
build` type-checks every plugin against the plugin API (`tsc`, the engine's `plugins.ts` – errors go to the author
like every other content error), bundles it with esbuild into `plugins/<id>/plugin.js` in the build output (the
immutable version folder, cached and rolled back with the content), runs the compiled module once with a recording
API to learn the components and layers it registers – so the build checks the nodes that use them, as it checks
`animation` – and declares it in `game.config.json`: `plugins: [{ id, src }]` (content schema 2.3, an optional
field). The engine loads the declared plugins before it builds the first spread and calls `register(api)`; a book
without plugins downloads nothing. The import into the editor keeps the list as imported, so a publish carries the
same compiled plugins the content build made.

**The editor's Code tab is the sandbox, not a second way to readers.** Its sources live in the instance's database
(`plugins` table: book, id, source, who, when; the change log is the history) and are edited in the Code tab.
*Run* transpiles in the browser (sucrase – types erased, no type check: that is the build's half), imports the
module from a blob URL and installs it in the stage's registry under the plugin's id, replacing what that id
registered before; the spread is built again so the effect shows at once. *Save* stores the source. Nothing of it
reaches a publish: the configuration's `plugins` list has one writer, the content build. A plugin written in the
editor reaches readers by landing in the content source (the tab's *Download*), a build and a review – Git stays
the review channel, as the concept wanted. "The build compiles it on publish" (a build job behind the API) is the
follow-up, not this version.

## The plugin API 1.0 (`engine/src/scene/plugins.ts`, `PLUGIN_API_VERSION = "1.0"`)

- `api.three` – the app's three.js module. Plugins never import three themselves (one instance, no version clash).
- `api.registerComponent(type, spec, apply)` – `spec` is the `ComponentSpec` of `shared/types/components.ts`
  (parameters with kind, default, range, description; the node types it applies to), the same definition the
  built-in `animation` uses. `apply({ node, params, object, placed, target, three })` runs when the node is built
  and returns the component's hooks: `update(delta)`, `onFound`, `onLost`, `onTap`, `onPause`, `dispose`,
  `tune(params)` (new values in place; false = build the node anew). The engine applies registered components to
  every node that carries them, after the node's own object exists.
- `api.registerLayer(type, spec, layer)` – a **material layer**: a piece of GLSL composed into the node's material
  after its own shading (a plain video or image plane, a text, a chroma-keyed video alike). The spec's parameters
  become uniforms the engine passes as function arguments; `layer.glsl` is the body of
  `vec4 layer(vec4 rgba, vec2 uv, float time, <the parameters>)`. A layer is used like a component –
  `components: [{ type: tint, color: "#f3cc94", opacity: 0.3 }]` – so the panel, the build and the guard treat it
  as one; GLSL never travels in content. The fixture's `plugins/tint` is the template.
- Registered specs join the shared registry (`componentSpec`, `componentTypes`): the Entity panel shows a plugin's
  component with its rows and *+ type* without panel code, the build and the guard check its parameters.
- Not in 1.0: `registerNodeType` (a new node type is a schema enum value – when a work needs one), events beyond
  the node's own (found / lost / tap / pause), variables and scopes, `api.progress`. The registry is the API
  surface; it grows with a work's need, versioned like the content schema.

## Unchecked code runs only on the editor's stage

The reader runs what the content build compiled, type-checked and the reviewer merged – nothing else can put a
`src` into the configuration's `plugins` list. The editor's Run is the one place code runs unchecked: inside the
author's own session, on the mock stage, installed per plugin id so a second Run replaces the first; a transpile
error or an exception in `register` shows inline under the editor and leaves the stage with the previous
registration. The guard accepts a component type it does not know only when the configuration declares plugins
(the plugin registers it at load; a node with a type nobody registered renders without it and logs) – and in the
editor, whose stage is the sandbox (`unknownComponentTypes: "allow"`); a publish whose nodes use a type no declared
plugin can provide is refused (409), so the sandbox's types never reach a reader's guard. A plugin runs
with the page's full power – it is the book's own code, in the book's repository, reviewed like the core
(STRATEGY: the contracted model).

## Smallness

The Code tab is a textarea with a line gutter, not CodeMirror (it would be the largest piece of the editor;
completion from the API's types is a later step by use). Transpile: sucrase (~0.3 MB, loaded with the Code tab),
not esbuild-wasm (~10 MB). The content build's type check reuses the engine's own `plugins.ts` with `@types/three`
in `scripts/` – no second copy of the API's types.
