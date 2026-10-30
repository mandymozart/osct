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

`register` runs once when the plugin loads. Seven things you can do with `api` – and, for a book's logic across
nodes and pages, four more ("Across nodes and pages" below):

- **`api.registerLayer(type, spec, { glsl })`** – a **material layer**: a few lines of GLSL that run on every
  pixel of a video or image plane after its own shading. Tint, dissolve, scan lines, a pulse.
- **`api.registerComponent(type, spec, apply)`** – a **component**: code on a node. Spin it, bob it, react to
  found / lost / tap, change it every frame.
- **`api.registerNodeType(type, spec, build)`** – a **node type** of your own: you build the three.js object (Points,
  a Sprite, a Line, a mesh with its own material), the engine places it like every node ("A node type" below).
- **`api.registerMaterial(type, spec, build)`** (API 1.4) – a whole **material**: you build a three.js material (a
  `ShaderMaterial` with your GLSL, a `MeshStandardMaterial` with a texture), and any node with meshes carries it as
  `material: { type, params }` – it replaces the node's own; its layers still add on top ("An aquarium" below).
- **`api.registerTexture(type, spec, draw)`** (API 1.4) – a **procedural texture**: a canvas or a data texture your code
  draws, animated or not, that every `texture` parameter can take.
- **`api.three`** – the app's three.js, for whatever a component builds or changes. Never `import "three"` yourself:
  the app has one three.js and a plugin that brings another is refused by the build.
- **`api.loadText(url)`** (API 1.5) – a **text file** by its URL: a shader you uploaded to the editor's Library ("A
  shader file" below).

A `spec` describes the parameters the author sets in the editor: every one with a `kind` (`number` with `min`
and `max`, `color`, `choice` with `options`, `boolean`, `string`, and since API 1.4 `texture` – a picture: a Library
image or video, or a procedural texture; your code gets a three.js `Texture` or `null`, a layer's GLSL a `sampler2D`), a `default`, a `description` (the row's help in the
editor's Info view) and, if you like, a `label` (API 1.3, 1–24 characters): the few words the row shows –
`degreesPerSecond` with `label: "speed"` reads *speed*; without a label the row shows the name split into words
(*degrees per second*). Add `nodeTypes` when the spec only makes sense on some nodes. The Entity panel builds its rows
from it – no other code needed.

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
    degreesPerSecond: { kind: "number", default: 30, min: -360, max: 360, unit: "°/s", label: "speed", description: "Speed." },
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
`api.three` and add it to `placed` – but when the thing *is* the node, a node type says so better.

## A node type: sparkle (API 1.2)

A node type is what a `model` or a `video` is to the engine – a builder that makes the node's own object – written
by the book. You build the object; the engine puts it into the node's placement group, so the author places it,
scales it, gives it children, components and layers like any node. `fixtures/demo/plugins/sparkle/index.ts`,
shortened:

```ts
api.registerNodeType("sparkle", {
  description: "A sparkle of points that twinkle around the node.",
  src: "none",
  params: {
    count: { kind: "number", default: 80, min: 1, max: 500, step: 1, description: "How many points." },
    color: { kind: "color", default: "#f3cc94", description: "Their colour." },
  },
}, ({ params, three }) => {
  const positions = new Float32Array(Number(params.count) * 3).map(() => (Math.random() - 0.5) * 0.6);
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
  const material = new three.PointsMaterial({ color: String(params.color), size: 0.02, transparent: true });
  const points = new three.Points(geometry, material);
  return {
    object: points,
    update: delta => { points.rotation.z += delta * 0.2; },
    tune: next => { if (Number(next.count) !== Number(params.count)) return false; material.color.set(String(next.color)); return true; },
    dispose: () => { geometry.dispose(); material.dispose(); },
  };
});
```

The spec says only what the editor and the build must know: the **parameters** (the kinds of a component's – the
Entity panel shows their rows under *node type · sparkle*; never `position`, `rotation` or `scale`, which are the
placement's) and **`src`**, the file the node takes: `glb` (a model, also `.gltf`), `video`, `image`, or `none` (the
default). The content writes the type and puts the parameters into `params`, next to the placement:

```yaml
- type: sparkle
  params:
    position: [0, 0.1, 0.25]
    count: 120
    color: "#ffe2a8"
```

`build` gets `{ node, params, asset, target, three }` – `params` resolved with the defaults, `asset` the node's file
loaded (a model's `scene` and `animations`, a video's `element` and `texture`, an image's `texture`). The asset is
shared by every node that uses the same file: clone what you change (`asset.scene.clone()`) and never dispose it. It
returns `{ object, …hooks }` – the hooks a component has (`update`, `onFound`, `onLost`, `onUnlocked`, `onTap`,
`onPause`, `dispose`), and `tune(params)` for the editor's live edit. A `build` that throws or returns no object is
logged; the node then renders nothing and keeps its children. In the editor, **+ node** lists the book's node types
under *plugins* once the plugins are loaded (or Run) – at once for a compiled plugin whose specs the build recorded; the content build refuses a type no plugin of the book
registers, and a node's parameters or file that do not fit its spec.

## Where a plugin can go

Code reaches the engine at the places the big engines open – here is the comparison the variant was chosen from (#188):

| | behaviour | geometry / object | material / shader | texture | post | "turn a built-in into code" |
|---|---|---|---|---|---|---|
| **Unreal** | Blueprint / C++ components | Actor classes, procedural mesh | Material graph + **Custom (HLSL) node** | material functions, render targets | post-process materials | **Create Blueprint class from a component / actor**, then edit |
| **8th Wall (A-Frame / ECS)** | `registerComponent`, systems | `registerPrimitive`, `registerGeometry` | **`registerShader`** | (three.js textures in a shader) | three.js passes | – (copy the component's source) |
| **OSCT (API 1.4)** | `registerComponent` | `registerNodeType` | `registerLayer` (GLSL on top of a node's material), **`registerMaterial`** (the whole material) | **`registerTexture`**, the parameter kind `texture` | `registerPass` | **make it code** (the Entity panel): a node becomes a `registerNodeType`, its look a `registerMaterial` |

So: what a node **does** is a component, what it **is** a node type, how it **looks** a material (or a layer over its
own), what it **shows** a texture, what the **picture** around it does a pass. Every one has a spec the editor shows as
rows and the content build records, and every one is used in the content by its type.

## An aquarium, step by step (API 1.4)

The demo book's page 2 has a glass tank with water, fish and light dancing on its sandy floor
(`fixtures/demo/plugins/aquarium/index.ts`, the entry `entries/aquarium/`). It uses the three new places at once.

**1 · A procedural texture: the caustics.** A texture your code draws – here once, a tileable pattern of bright lines
in a `DataTexture`; `update` moves its offset every frame, so it drifts without redrawing anything:

```ts
api.registerTexture("caustics", {
  description: "Light dancing on a floor under water.",
  params: { cells: { kind: "number", default: 3, min: 1, max: 8, step: 1, description: "Cells of light across a tile." } },
}, ({ params, three }) => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  // … fill data with the pattern (whole multiples of 2π across the tile: no seam)
  const texture = new three.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = three.RepeatWrapping;
  texture.needsUpdate = true;
  return { texture, update: delta => texture.offset.x += delta * 0.04 };
});
```

`draw({ params, three })` returns a texture, or `{ texture, update, dispose }`. Wherever a spec has a `texture`
parameter – a material's, a layer's, a component's, a node type's – the author can now pick *caustics* from the row's
list (under *procedural*, next to the Library's pictures and videos). In the content the value is the texture's type
(`floor: caustics`), `{ type: caustics, cells: 5 }` with values of its own, a file next to the node (`floor: sand.jpg` –
the build makes it a content path) or a Library file's URL. The engine draws a procedural texture per use and disposes
it with the node; a file texture is shared by every use of the same file – set its wrap once, never dispose it.

**2 · A material: the water.** `build({ node, params, time, map, target, three })` returns a three.js material, or
`{ material, update, tune, dispose }`. `time` is a uniform the engine advances – put it straight into your uniforms;
`map` is the picture of the material it replaces (an image's, a video's), so a material can keep the node's own:

```ts
api.registerMaterial("water", {
  description: "Water: waves on the top faces, a tint that deepens with the angle.",
  params: {
    deep: { kind: "color", default: "#0b4f6c", description: "Its colour at a grazing angle." },
    waveHeight: { kind: "number", default: 0.012, min: 0, max: 0.05, step: 0.001, label: "wave height", description: "How high the waves rise." },
    ripples: { kind: "texture", default: "", description: "A picture that shimmers over the water." },
  },
}, ({ params, time, three }) => {
  const uniforms = { time, deep: { value: new three.Color(String(params.deep)) }, waveHeight: { value: Number(params.waveHeight) } };
  const material = new three.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `…  p.y += step(0.5, normal.y) * wave * waveHeight;  …`,
    fragmentShader: `…  varying vec2 vUv; …  gl_FragColor = vec4(colour, alpha);  #include <colorspace_fragment>  }`,
  });
  return { material, tune: next => { uniforms.deep.value.set(String(next.deep)); uniforms.waveHeight.value = Number(next.waveHeight); return true; } };
});
```

A node carries it next to its other fields, and the Entity panel shows it as **material · water** with its rows:

```yaml
- type: aquarium
  params:
    rotation: [90, 0, 0]
  material:
    type: water
    params:
      waveHeight: 0.02
```

The material goes on every mesh of the node's own object – a model's, an image's or video's plane, a plugin node's. A
node type keeps a mesh out of it with `mesh.userData.keepMaterial = true` (the aquarium's glass, floor and fish keep
theirs; only the water takes the node's material). The node's **layers still add on top**: they are written into your
`ShaderMaterial` before `#include <colorspace_fragment>` and read `vUv` – end your fragment shader with that include and
declare `varying vec2 vUv`, and a `tint` or a `pulse` works on your water as on any picture. The spec may name the
node types it fits (`nodeTypes`); the panel's *material* row offers only those.

**3 · A node type: the tank.** The glass box, the floor (its own small shader sampling the caustics twice, drifting
against each other) and the fish, built like a glTF model – y up, the floor at `y = 0` – so `rotation: [90, 0, 0]`
stands it on the page and its lowest point is the page (#189). Its parameter `floor` is a texture with the default
`caustics`: the build gets the texture, not its name.

```ts
api.registerNodeType("aquarium", {
  description: "A glass tank with a sandy floor, water and fish.",
  params: {
    fish: { kind: "number", default: 5, min: 0, max: 12, step: 1, description: "How many fish swim." },
    floor: { kind: "texture", default: "caustics", label: "floor light", description: "The light on the floor." },
  },
}, ({ params, three }) => {
  const tank = new three.Group();
  const water = new three.Mesh(new three.BoxGeometry(0.69, 0.38, 0.39, 32, 1, 18), new three.MeshStandardMaterial({ transparent: true, opacity: 0.35 }));
  const glass = new three.Mesh(new three.BoxGeometry(0.7, 0.45, 0.4), glassMaterial);
  glass.userData.keepMaterial = true; // the node's material is for the water
  // … the floor with params.floor, the fish, their swimming in update
  return { object: tank, update: swim, dispose };
});
```

It stays light on a phone: a few hundred triangles of fish and some 2 500 of water surface, 14 draw calls, the caustics
drawn once into 128² pixels and no render target. On the editor's stage (desktop, 1280 × 800) the found aquarium adds
about 0.2 ms of main-thread work per frame (1.2 ms against 1.0 ms with its target lost) and the stage stays at 60 fps.

**4 · Make it code.** Any node can become a node type of the book's own – Unreal's *Create Blueprint class from a
component*. Select a node, Entity panel, **make it code** (in the node's head): the editor writes a Code tab plugin whose
`registerNodeType` reproduces the node – its type's builder as a readable starting point (a model's copied scene and
clips, an image's or video's plane, a text's canvas, a light, a group; a plugin type's own `build`), its values as the
spec's parameters with the node's values as their defaults – saves it, runs it and switches the node to it, placed where
it was. The type is named after the node (`oldDoorCode` for a node named "Old door", `myModelCode` for an unnamed model).
From then on it is your code: change the build, Run, Save. **make code** beside the *material* row does the same for
the node's look: a `registerMaterial` that draws what the type's material drew (a plane's picture as a
`ShaderMaterial` with colour, opacity and another picture; a model's as a `MeshStandardMaterial`), and the node carries
it. Nothing is saved to the draft until you press **Save**; the plugin is in the Code tab (and reaches readers through
the content source, as every Code tab plugin until #78).

## A shader file (API 1.5)

GLSL that grows past a few lines reads better as a file of its own. Upload it to the editor's **Library** – the
**Upload** button or a drop: `.glsl`, `.frag`, `.vert` or `.wgsl`, at most 256 KB – and it is listed under *code* as a
**shader** with a read-only preview. **Copy URL** gives the address a plugin loads it from:

```ts
const FRAGMENT = "https://…/assets/<book>/<id>/v1.frag"; // the Library's Copy URL

api.registerMaterial("pulse", {
  description: "A plane that pulses – its fragment shader is a Library file.",
  params: { speed: { kind: "number", default: 1, min: 0, max: 5, description: "How fast it pulses." } },
}, ({ params, time, three }) => {
  const material = new three.ShaderMaterial({
    uniforms: { time, speed: { value: Number(params.speed) } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "void main() { gl_FragColor = vec4(0.0); }", // until the file is there
    transparent: true,
  });
  api.loadText(FRAGMENT).then(glsl => {
    material.fragmentShader = glsl;
    material.needsUpdate = true;
  }).catch(error => api.log("the shader did not load", error));
  return material;
});
```

`api.loadText(url)` returns a promise of the file's text; it asks for each URL once, however many nodes use it, and
rejects when the file is not there. It takes a Library URL or a content path (`/assets/content/…`). Use it where a build
runs – a material's `build`, a pass's factory (`shaderPass(…)` with a placeholder, then the pass's `material`), a node
type's `build` – and set the shader when the text arrives. A **layer's** `glsl` is a string the engine needs at
`register` time, so a layer keeps its GLSL inline.

The Library knows which plugin sources name the file: its *uses* count them, **Delete** is refused while one does, and
**Replace…** uploads a new version at a new URL and rewrites the URL in those sources (a change each – press Run to see
it). That is why a plugin loads a shader by its URL, not its name: the URL is the one thing the reader – which has no
Library – can fetch, and the editor keeps it right. Your plugin's own `.ts` / `.js` files go the same way into the
Library – they become plugin sources, the ones the Code tab lists ([editor](editor.md) "Library").

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

A key remembered in the book, as a component (the demo's key does the same without code – its `behaviour`, below):

```ts
export const register = (api: PluginApi): void => {
  // The key: its first find is remembered in the book (it survives the session)
  api.registerComponent("key", { description: "Finding this node gives the reader the key.", params: {} }, () => ({
    onUnlocked: () => api.vars.set("hasKey", true, "book"),
  }));
};
```

The door and the lamp of the demo, shortened (`fixtures/demo/plugins/narrative/index.ts`). The door's `behaviour`
decides when it opens and emits `openDoor`; the plugin does what a rule cannot – it moves the door over time:

```ts
export const register = (api: PluginApi): void => {
  // The door: opens when the door's rules emit openDoor for its target, and tells the stage
  api.registerComponent("door", { description: "Opens on openDoor.", nodeTypes: ["group"], params: {} }, ({ children, target }) => {
    const [door] = children;
    let opening = false;
    const off = api.events.on("openDoor", payload => {
      if ((payload as { targetId?: string })?.targetId !== target.id || opening) return;
      opening = true;
      api.vars.set("doorOpen", true, "stage");
      api.events.emit("doorOpened", { by: "key" });
    });
    return {
      update: delta => { if (opening && door) door.rotation.z = Math.min(Math.PI / 2, door.rotation.z + delta); },
      dispose: off,
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

Try it in the editor: tap the key (its rule sets `hasKey` – the Stage panel's *vars and events* lists it, book
scope, a boolean), walk to the door's spread with › – the door's rules emit `openDoor`, the door opens, the timeline
shows `openDoor` and `doorOpened` with the time since the spread opened; the tree's eye switches a target off and on (lost, found again). **reset** starts a new game.
To test a branch without playing up to it, change a variable in the panel or **set** one (name, scope, type, value):
it is written through `api.vars.set`, so your `api.vars.on` listeners and `varChanged` fire as for a plugin's write.
**tap** taps a found target as a reader would – your component's `onTap` and `targetTapped` – without aiming at it
([editor](editor.md) "Stage").

## Behaviour and plugins

Not every narrative needs code. The built-in **`behaviour`** component (content schema 2.19, [content](content.md)
"Behaviour") is a list of rules an author makes in the editor's Entity panel: *on* an event (the node's `found`,
`lost`, `tap`, `unlocked`, or any event of the bus), *when* variables have values, *do* actions – play, pause or stop a
clip, show or hide a node, set a variable, emit an event. It is no second system: the engine runs it on the same
runtime as your code (`engine/src/scene/behaviour.ts` on `plugin-runtime.ts`). A rule's `set` is `api.vars.set` – your
`api.vars.on` and `varChanged` fire; its `emit` is `api.events.emit` with `{ targetId, node }` as the payload – your
`api.events.on` hears it; a rule's `on` hears your scene events and the core events like a listener of yours; its
`when` reads like `api.vars.get` (the innermost scope). So the split is: the **rules decide** (which event, which
state, what follows), **a plugin does** what a rule cannot – move or animate a node over time, draw, compute, count the
progress – and the two meet on the bus with named events. The demo shows it: the key is only a rule now (a tap plays
its clip, sets `hasKey`, emits `keyRattled`), the door's rules emit `openDoor` and the `door` plugin lifts the door.

Reach for a rule first; write a component when a rule would need a verb it does not have. The editor's timeline
marks every rule that ran with a `behaviour` line – it is the log's own (your listeners never hear it).

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
registers (so the nodes that use it are checked), and declares it in the configuration together with what it
registered: the specs of its components, layers, node types and passes (`registered`, content schema 2.14), and its
materials and textures (2.17). So the
reader's check, the editor's API and the MCP server know your types and parameters without running your code – a typo
in a node's type or a parameter out of range is caught at save time – and the editor's Entity panel shows the rows of
your component or node type before anyone presses Run. From there it travels to
the CDN with the content version and the reader loads it with the AR scene. A plugin that does not compile fails
the build with the file and line, like a missing image. The build behind the publish is #78 (decided: it runs on
the server); until it lands, only the plugins in the content source (`content/plugins/<id>/index.ts`, built with
`npm run build:content` in `scripts/`) are compiled, and a publish whose nodes use a component or a node type no
such plugin provides is refused.

Rules of the road: one `index.ts` per plugin (more files next to it are bundled in), no imports but
`import type`, `camelCase` type names (`tint`, `spin`, `sparkle`, `water`, `caustics` – a node type at most 32
characters), keep it small
– the build warns above 256 KB, and everything a plugin registers runs on the reader's phone. A listener you subscribe in a component: unsubscribe it in
`dispose` (a listener subscribed in `register` lives as long as the plugin). Never emit a core event – the engine does.

## The demo book: everything at once

`fixtures/demo/` is a sandbox book that uses every node type, placement, filter and component, and eight plugins that
together use every part of the API – a narrative across its spreads (the key and the door with their `behaviour` rules,
the door's opening and the lamp as plugin code, a tally of the pages found, a tap that switches a scene, a sparkle of its
own node type) and the aquarium with its material and texture. Build it with
`OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor ([editor](editor.md) "Try it"); the plugins are the examples to copy from. What it shows per spread, and what the
model still lacks: `agents/research/2026-10-30-demo-book.md`.
