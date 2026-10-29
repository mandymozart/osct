# Writing a plugin: the book's own code

A plugin adds something to the engine that the content alone cannot say: a shader on a video, code that moves a
node, a reaction to a tap. It is a small TypeScript file in the book's content folder, and the editor's **Code**
tab is where you try it. This is the short way in; the contract behind it is in [content](content.md) "Plugins",
the editor's tab in [editor](editor.md), the decision in `agents/research/2026-10-29-code-in-the-editor.md`.

## The shape

```ts
import type { PluginApi } from "osct-plugin-api";

export const register = (api: PluginApi): void => {
  // what this plugin adds goes here
};
```

`register` runs once when the plugin loads. Three things you can do with `api` – and, for a book's logic across
nodes and pages, four more ("Across nodes and pages" below):

- **`api.registerLayer(type, spec, { glsl })`** – a **material layer**: a few lines of GLSL that run on every
  pixel of a video or image plane after its own shading. Tint, dissolve, scan lines, a pulse.
- **`api.registerComponent(type, spec, apply)`** – a **component**: code on a node. Spin it, bob it, react to
  found / lost / tap, change it every frame.
- **`api.three`** – the app's three.js, for whatever a component builds or changes. Never `import "three"` yourself:
  the app has one three.js and a plugin that brings another is refused by the build.

A `spec` describes the parameters the author sets in the editor: every one with a `kind` (`number` with `min`
and `max`, `color`, `choice` with `options`, `boolean`, `string`), a `default` and a `description`, and `nodeTypes`
when it only makes sense on some nodes. The Entity panel builds its rows from it – no other code needed.

## A layer: tint (the fixture's template)

`fixtures/content/plugins/tint/index.ts` – copy the folder as `content/plugins/<id>/`:

```ts
api.registerLayer("tint", {
  description: "Tints the pixels towards one colour.",
  nodeTypes: ["video", "image"],
  params: {
    color: { kind: "color", default: "#f3cc94", description: "The tint." },
    opacity: { kind: "number", default: 0.3, min: 0, max: 1, description: "How much of the tint." },
    blend: { kind: "choice", options: ["mix", "multiply"], default: "mix", description: "mix blends, multiply darkens." },
  },
}, {
  glsl: `
    vec3 tinted = blend == 1 ? rgba.rgb * color : color;
    return vec4(mix(rgba.rgb, tinted, opacity * rgba.a), rgba.a);
  `,
});
```

The GLSL is the body of a function. It gets `rgba` (the pixel so far, linear RGB), `uv` (0–1 across the plane),
`time` (seconds since the node was built) and then the parameters **in the order of the spec**: a `number` or
`boolean` as `float`, a `color` as `vec3`, a `choice` as `int` (the index in its options). It returns the new
`vec4`. Used in the content, or added in the Entity panel, like any component:

```yaml
components:
  - type: tint
    color: "#f3cc94"
    opacity: 0.35
```

Layers run in the material's own pass – a layer costs one small step per pixel, not a second render. Stack them
freely for a few; the content build warns when a node carries more than three. An effect that never changes
(a fixed tint, a vignette baked into the frames) is cheaper as part of the video itself.

## A component: spin

```ts
api.registerComponent("spin", {
  description: "Turns the node around its own y axis.",
  params: {
    degreesPerSecond: { kind: "number", default: 30, min: -360, max: 360, description: "Speed." },
  },
}, ({ object, params }) => {
  let speed = Number(params.degreesPerSecond);
  return {
    update: delta => { object.rotation.y += (speed * Math.PI / 180) * delta; },
    tune: next => { speed = Number(next.degreesPerSecond); return true; },
  };
});
```

`apply` gets `{ node, params, object, placed, target, three }`: `object` is the node's own three.js object (a
model's scene, a video's plane), `placed` the group that carries its placement, `params` the values with the
defaults filled in. It returns the hooks it needs: `update(delta)` every frame, `onFound`, `onLost`, `onTap`,
`onPause`, `dispose`, and `tune(params)` for the editor's live edit (return `true` when you applied the new values
in place, `false` to have the node built anew). A component on a `group` node may build anything with
`api.three` and add it to `placed` – particles, lines, a sprite.

## Across nodes and pages: events, variables, the progress (API 1.1)

A component knows its own node. A **narrative** needs more: a key found on one page opens a door on another, a lamp
lights when the door opened, a text counts the pages found. Four parts of `api` carry that (the concept behind them:
`agents/research/2026-10-28-entity-components.md`, the decision `2026-10-30-demo-book.md`; the demo book
`fixtures/demo/` uses every one):

- **`api.events`** – one bus for the stage. *Core events* belong to the engine, you only listen: `targetFound`,
  `targetLost`, `targetUnlocked` (the first find – progress is the app's), `targetTapped`, `spreadChanged`,
  `sceneState` (running / paused / stopped), `varChanged`. *Scene events* are yours: `api.events.emit("doorOpened",
  { by: "key" })` – any camelCase name that is not a core event – and every plugin hears it with
  `api.events.on("doorOpened", payload => …)`. `on` returns the unsubscribe; when a plugin is replaced (Run) or
  unloaded, its listeners go with it.
- **`api.vars`** – variables in **scopes**: `spread` (while the spread is the current one – cleared when it changes),
  `stage` (while the scene exists), `session` (this app start), `book` (persisted with the reader's progress). `set(name,
  value, scope)` with `spread` as the default scope, `get(name, scope?)` – without a scope the innermost definition
  wins (spread → stage → session → book) – `on(name, (value, previous, scope) => …)` and `all(scope)`. Values are
  strings, numbers or booleans; `null` deletes.
- **`api.progress`** – read-only, from the app: `unlocked(targetId)`, `consulted(entryId)`, `completion(spreadId?)`
  (0–1, the whole book without an id), `counts(spreadId?)` → `{ unlocked, targets }`. On the editor's stage the
  progress is the stage's own (what was found since the workspace opened); the reader passes its history.
- **`api.spread`** – `current` (id, title, pages, format, targets) and `get(id)`.

And two more things in a component: the context's **`children`** – the placement groups of the node's children, in
content order, so a component on a `group` can show, hide or move them – and the hook **`onUnlocked`**, the first
find of the target (`onFound` is every find).

The key, the door and the lamp of the demo, shortened (`fixtures/demo/plugins/narrative/index.ts`):

```ts
export const register = (api: PluginApi): void => {
  // The key: its first find is remembered in the book (it survives the session)
  api.registerComponent("key", { description: "Finding this node gives the reader the key.", params: {} }, () => ({
    onUnlocked: () => api.vars.set("hasKey", true, "book"),
  }));

  // The door: on another page. With the key it opens and tells the stage; without it the hint shows
  api.registerComponent("door", { description: "Opens when the reader has the key.", nodeTypes: ["group"], params: {} }, ({ children }) => {
    const [door, hint] = children;
    return {
      onFound: () => {
        const hasKey = api.vars.get("hasKey") === true;
        if (hint) hint.visible = !hasKey;
        if (hasKey) {
          api.vars.set("doorOpen", true, "stage");
          api.events.emit("doorOpened", { by: "key" });
        }
      },
    };
  });

  // The lamp: dark until the door opened – on this stage, now or earlier
  api.registerComponent("lamp", { description: "Lights when the door opened.", params: {} }, ({ object }) => {
    object.visible = api.vars.get("doorOpen") === true;
    const off = api.vars.on("doorOpen", value => { object.visible = value === true; });
    return { dispose: off };
  });
};
```

Try it in the editor: find the key (the first find sets `hasKey` – the Stage panel's **vars** row shows `book ·
hasKey = true`), walk to the door's spread with › – the door opens, the **events** row shows `doorOpened`; the tree's
eye switches a target off and on (lost, found again). **reset** starts a new game.

## Trying it: the Code tab

Open a spread in the editor, **Code**, **+** for a new plugin (it starts with the two examples above) or pick one
of the book's. The editor is Monaco with the plugin API's types: completion as you type (Ctrl+Space for the list;
`api.` and `api.three.` know every member), type errors underlined as the content build would report them, a hover
shows a member's documentation. **Run** (Ctrl+Enter) shows it on the stage at once – a layer tints the video, a
component appears under *add component* in the Entity panel. A Run's errors show under the editor and on their line.
**Save** (Ctrl+S) keeps the source in the editor's database for the next session.

**Download** gives a zip with the plugin's folder: `index.ts`, `plugin-api.d.ts` (the module `osct-plugin-api`) and a
`tsconfig.json` that joins them – open the folder in any TypeScript editor and it type-checks the same way
(`npm install --save-dev @types/three typescript` there for three's types and `npx tsc`). `plugin-api.d.ts` is
generated from the engine (`editor/src/lib/plugins/plugin-api.d.ts`, `npm run plugin-api` in `editor/`).

## Shipping it: the content build

What runs in the Code tab stays in the editor until a **publish** compiles it: the content build – the same one
that builds the book from its source – type-checks every plugin, bundles it, runs it once to learn what it
registers (so the nodes that use it are checked), and declares it in the configuration. From there it travels to
the CDN with the content version and the reader loads it with the AR scene. A plugin that does not compile fails
the build with the file and line, like a missing image. The build behind the publish is #78 (decided: it runs on
the server); until it lands, only the plugins in the content source (`content/plugins/<id>/index.ts`, built with
`npm run build:content` in `scripts/`) are compiled, and a publish whose nodes use a component no such plugin
provides is refused.

Rules of the road: one `index.ts` per plugin (more files next to it are bundled in), no imports but
`import type`, `camelCase` type names (`tint`, `spin`), keep it small – the build warns above 256 KB, and
everything a plugin registers runs on the reader's phone. A listener you subscribe in a component: unsubscribe it in
`dispose` (a listener subscribed in `register` lives as long as the plugin). Never emit a core event – the engine does.

## The demo book: everything at once

`fixtures/demo/` is a sandbox book that uses every node type, placement, filter and component, and six plugins that
together use every part of the API – a narrative across its spreads (the key, the door, the lamp, a tally of the
pages found, a tap that switches a scene). Build it with `OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor
([editor](editor.md) "Try it"); the plugins are the examples to copy from. What it shows per spread, and what the
model still lacks: `agents/research/2026-10-30-demo-book.md`.
