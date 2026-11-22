# Writing a plugin: the experience's own code

A plugin adds something to the engine that the content alone cannot say: a shader on a video, code that moves a
node, a reaction to a tap. It is a small TypeScript file in the experience's content folder, and the editor's **Code**
tab is where you try it. This is the guide and the reference of the plugin API; how the content names what a plugin
registers is in [content](content.md), the editor's tab in [editor](editor.md) "Code", the decision in
`agents/research/2026-10-29-code-in-the-editor.md`.

**Plugin API 4.0** (content schema 6.0, #341 – Tilman, 2026-11-21: *"you use the word hear for events. i think it is
listen"*): what a spec's code listens to is `uses.listens` (was `uses.hears`). The engine refuses a module built against
another MAJOR ("… was built against plugin API 3.1, this engine runs 4.0 – not loaded"), so every experience is published
again; stored sources are rewritten with `osct plugins listen` (`--dir` a content source, `--experience` / `--all` the
instance's database – [content](content.md) "Schema and app versions").

## The shape

```ts
import type { PluginApi } from "osct-plugin-api";

export const register = (api: PluginApi): void => {
  // what this plugin adds goes here
};
```

`register` runs once when the plugin loads. Twelve things you can do with `api` – and, for an experience's logic across
nodes and pages, four more ("Across nodes and pages" below):

- **`api.registerLayer(type, spec, { glsl })`** – a **material layer**: a few lines of GLSL that run on every
  pixel of a video, image or text plane (or a model's materials) after its own shading, in linear RGB. Tint, dissolve,
  scan lines, a pulse.
- **`api.registerComponent(type, spec, apply)`** – a **component**: code on a node. Spin it, bob it, react to
  found / lost / tap, change it every frame.
- **`api.registerNodeType(type, spec, build)`** – a **node type** of your own: you build the three.js object (Points,
  a Sprite, a Line, a mesh with its own material), the engine places it like every node ("A node type" below).
- **`api.registerMaterial(type, spec, build)`** (API 1.4) – a whole **material**: you build a three.js material (a
  `ShaderMaterial` with your GLSL, a `MeshStandardMaterial` with a texture), and any node with meshes carries it as
  `material: { type, params }` – it replaces the node's own; its layers still add on top ("An aquarium" below). Every
  material is a plugin's: the build and the guard refuse one no plugin of the experience registers.
- **`api.registerTexture(type, spec, draw)`** (API 1.4) – a **procedural texture**: a canvas or a data texture your code
  draws, animated or not, that every `texture` parameter can take.
- **`api.three`** – the app's three.js, for whatever a component builds or changes. Never `import "three"` yourself:
  the app has one three.js and a plugin that brings another is refused by the build.
- **`api.loadText(url)`** (API 1.5) – a **text file** by its URL: a shader you uploaded to the editor's Library ("A
  shader file" below).
- **`api.loadModel(url)`** (API 1.7) – a **model file** (`.glb`, `.gltf`): the one the author picked in a parameter of
  the kind `model` ("A file from the Library" below).
- **`api.feedback({ width, height, fragment, … })`** (API 1.6) – a **feedback buffer**: a fragment shader the engine runs
  every frame into a render target of its own, its last frame as input – a fluid on the GPU ("A feedback buffer" below).
- **`api.shadertoy(source)`** (API 1.6) – a Shadertoy pass (`mainImage`) as a feedback buffer's fragment.
- **`api.registerPass(type, spec, factory)`** – a **post-processing pass** over the rendered picture: a scene or the
  experience names it in `passes` like a built-in pass (content schema 2.21, "A pass: film grain" below).
- **`api.registerAppearance(type, spec, factory)`** (API 1.8) – a **look**: how an entity appears and disappears, in
  code. The experience names it for a moment – `reveal`, `found`, `lost` – in a built-in look's place (content schema 2.29,
  "A look" below).
- **`api.log(…)`** – to the console, prefixed with the plugin's id; in the editor also the Code tab's log.

A `spec` describes the parameters the author sets in the editor: every one with a `kind` (`number` with `min`
and `max`, `color`, `choice` with `options`, `boolean`, `string`, since API 1.4 `texture` – a picture: a Library
image or video, or a procedural texture; your code gets a three.js `Texture` or `null`, a layer's GLSL a `sampler2D` – and
since API 1.7 `model` – a model file of the Library; your code gets its address and loads it with `api.loadModel`), a `default`, a `description` (the row's help in the
editor's Info view) and, if you like, a `label` (API 1.3, 1–24 characters): the few words the row shows –
`degreesPerSecond` with `label: "speed"` reads *speed*; without a label the row shows the name split into words
(*degrees per second*). Add `nodeTypes` when the spec only makes sense on some nodes. The Inspector builds its rows
from it – no other code needed. Since API 3.1 the builders `api.p` write these objects for you and type your handler's
`params` from them; a spec may also say which rule verbs it answers, which events it emits and what it uses of the bus
("Typed specs and the Logic view" below).

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
`vec4`. Used in the content, or added in the Inspector, like any component:

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
const p = api.p;
api.registerComponent("spin", {
  description: "Turns the node around its own y axis.",
  params: {
    degreesPerSecond: p.number({ min: -360, max: 360, default: 30, slider: [-90, 90], unit: "°/s", label: "speed", description: "Speed." }),
  },
  actions: ["play", "pause"],
}, ({ object, params }) => {
  let speed = params.degreesPerSecond;          // a number – typed from the spec
  let running = true;
  return {
    update: delta => { if (running) object.rotation.y += (speed * Math.PI / 180) * delta; },
    tune: next => { speed = next.degreesPerSecond; return true; },
    onAction: action => { running = action === "play"; },   // "play" | "pause"
  };
});
```

`apply` gets `{ node, params, object, placed, target, three, emit }`: `object` is the node's own three.js object (a
model's scene, a video's plane), `placed` the group that carries its placement, `params` the values with the
defaults filled in, `emit` sends one of the spec's `events`. It returns the hooks it needs: `update(delta)` every frame,
`onFound`, `onLost`, `onTap`, `onPause`, `dispose`, `onAction(verb)` for the spec's `actions` (API 3.1), and
`tune(params)` for the editor's live edit (return `true` when you applied the new values in place, `false` to have the
node built anew). A component on a `group` node may build anything with `api.three` and add it to `placed` – but when the
thing *is* the node, a node type says so better.

## Typed specs and the Logic view (API 3.1, content schema 5.1; `uses.listens` since API 4.0)

A spec is written once, as a value, and everything else is read from it: the Inspector's rows, the guard's checks, the
engine's limits, the editor's Logic view – and your handler's types. This is the "schema first" way of zod, TypeBox and
ComfyUI's node schema; TypeScript's types are gone at runtime, so the value is the source and the types are inferred.

**The builders.** `api.p` writes the same parameter objects you would write by hand – a hand-written spec keeps working
unchanged, and you can mix both:

| Builder | Writes | Your handler gets |
| --- | --- | --- |
| `p.number({ min, max, default?, step?, unit?, slider? })` | `{ kind: "number", … }` (default = `min`) | `number` |
| `p.integer({ min, max, default?, step?, unit?, slider? })` | a number with `integer: true`, `step: 1` | `number` (whole) |
| `p.boolean({ default? })` | `{ kind: "boolean" }` (default `false`) | `boolean` |
| `p.string({ default? })` | `{ kind: "string" }` (default `""`) | `string` |
| `p.choice(["loop", "once"], { default? })` | `{ kind: "choice", options }` (default the first) | `"loop" \| "once"` |
| `p.color({ default? })` | `{ kind: "color" }` (default `#ffffff`) | `string` |
| `p.texture({ default? })` | `{ kind: "texture" }` | a three.js `Texture` or `null` |
| `p.model({ default? })` | `{ kind: "model" }` | the file's address (`api.loadModel`) |
| `p.file("image" \| "video" \| "model", { … })` | a `texture` (image, video) or a `model` parameter | as those |

Every builder also takes `description` and an optional `label`. The register functions are generic: write the spec inline
(or `as const`) and `params.volume` is a `number`, a choice is the union of its options. A spec typed only as
`ComponentSpec` gives `Record<string, unknown>`, as before.

**Hard and soft limits.** A number's `min` and `max` are **hard**: the guard refuses content outside them, the editor's
field refuses a typed value outside them (scrubbing stops at them), and the engine – should a value outside them reach it –
keeps the value it had (the default at the first build) and warns in the console. `integer: true` adds "whole numbers
only" to the same three checks. `slider: [lo, hi]` is only the **soft** range: the span the editor's control offers first
(its step follows from it), always inside `min … max`.

**What the schema cannot say, said in the same spec:**

```ts
api.registerComponent("hum", {
  description: "Hums while the page is found.",
  params: { volume: p.number({ min: 0, max: 1, default: 0.6, description: "How loud." }) },
  actions: ["play", "pause"],              // the rule verbs it answers on its node
  events: ["ended"],                       // the scene events it emits
  uses: { listens: ["doorOpened"], sets: ["hummed"] },   // what its code uses of the bus and the variables
}, ({ params, emit }) => ({
  onAction: action => { /* "play" | "pause" – a rule's `play: <this node>` lands here */ },
  onTap: () => emit("ended"),              // emit("endd") is a type error in the Code tab and the build
}));
```

- **`actions`**: the verbs a node already has in a rule – `play`, `pause`, `stop`, `show`, `hide`. A rule's
  `play: lamp` reaches `onAction("play")` of every component (and the node type) of `lamp` whose spec declares `play`,
  beside what the engine does itself (a model's clip, the node's visibility). Any other name is refused: there is no rule
  verb for it yet.
- **`events`**: names your code sends with the context's `emit(event, payload?)` – on the bus, with the target's id, so a
  rule listens to it by name (`on: ended`). An event the spec does not declare is not sent (a warning); a core event or a node's
  own (`found`, `lost`, `tap`, `unlocked`) cannot be declared.
- **`uses`**: what the code listens to, emits, reads and sets (`api.events.on`, `emit`, `api.vars.get`, `set`), by name. The
  Logic view joins the plugin to the rules by it. A plugin that declares nothing in any spec is read the old way – the
  editor looks for `api.events.on("…")` and the like in its source.

The content build records all three in the plugin's `registered` ("Shipping it" below), the guard checks their
shape, and the editor's Logic view draws them as **ports** on the node's box: the parameters as value inlets (typed by
kind, a texture or model as a media inlet), the verbs as action inlets, the events as event outlets ([editor](editor.md)
"Ports from the specs"). The built-in node types have specs of their own for it: a video's and an image's file, a text's
line and colour, a light's parameters, a model's `play` / `pause` / `stop`, `show` / `hide` on every node.

## A node type: sparkle (API 1.2)

A node type is what a `model` or a `video` is to the engine – a builder that makes the node's own object – written
by the experience. You build the object; the engine puts it into the node's placement group, so the author places it,
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
Inspector shows their rows under *node type · sparkle*; never `position`, `rotation` or `scale`, which are the
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
logged; the node then renders nothing and keeps its children. In the editor, **+ node** lists the experience's node types
under *plugins* once the plugins are loaded (or Run) – at once for a compiled plugin whose specs the build recorded; the content build refuses a type no plugin of the experience
registers, and a node's parameters or file that do not fit its spec.

## Where a plugin can go

Code reaches the engine at the places the big engines open – here is the comparison the variant was chosen from (#188):

| | behaviour | geometry / object | material / shader | texture | post | "turn a built-in into code" |
|---|---|---|---|---|---|---|
| **Unreal** | Blueprint / C++ components | Actor classes, procedural mesh | Material graph + **Custom (HLSL) node** | material functions, render targets | post-process materials | **Create Blueprint class from a component / actor**, then edit |
| **8th Wall (A-Frame / ECS)** | `registerComponent`, systems | `registerPrimitive`, `registerGeometry` | **`registerShader`** | (three.js textures in a shader) | three.js passes | – (copy the component's source) |
| **OSCT (API 1.4)** | `registerComponent` | `registerNodeType` | `registerLayer` (GLSL on top of a node's material), **`registerMaterial`** (the whole material) | **`registerTexture`**, the parameter kind `texture` | `registerPass` | **make it code** (the Inspector): a node becomes a `registerNodeType`, its look a `registerMaterial` |

So: what a node **does** is a component, what it **is** a node type, how it **looks** a material (or a layer over its
own), what it **shows** a texture, what the **picture** around it does a pass. Every one has a spec the editor shows as
rows and the content build records, and every one is used in the content by its type.

## An aquarium, step by step (API 1.4)

The demo's page 2 has a glass tank with water, fish and light dancing on its sandy floor
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

A node carries it next to its other fields, and the Inspector shows it as **material · water** with its rows:

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

It stays light on a phone: a few hundred triangles of fish, 21 draw calls with the toy fish (14 without it), the caustics
drawn once into 128² pixels and no render target. The water's top has a vertex per cell of the simulation below (64 × 36
cells: some 4 600 triangles on top, as many on the box's bottom; 2 500 in all with the simulation off). On the editor's
stage (desktop, 1280 × 800) the found aquarium adds about 0.2 ms of main-thread work per frame (1.2 ms against 1.0 ms
with its target lost) and the stage stays at 60 fps.

**4 · Make it code.** Any node can become a node type of the experience's own – Unreal's *Create Blueprint class from a
component*. Select a node, Inspector, **make it code** (in the node's head): the editor writes a Code tab plugin whose
`registerNodeType` reproduces the node – its type's builder as a readable starting point (a model's copied scene and
clips, an image's or video's plane, a text's canvas, a light, a group; a plugin type's own `build`), its values as the
spec's parameters with the node's values as their defaults – saves it, runs it and switches the node to it, placed where
it was. The type is named after the node (`oldDoorCode` for a node named "Old door", `myModelCode` for an unnamed model).
From then on it is your code: change the build, Run, Save. **make code** beside the *material* row does the same for
the node's look: a `registerMaterial` that draws what the type's material drew (a plane's picture as a
`ShaderMaterial` with colour, opacity and another picture; a model's as a `MeshStandardMaterial`), and the node carries
it. Nothing is saved to the draft until you press **Save**; the plugin is in the Code tab and reaches readers with the
next **Publish** ("Shipping it" below).

**5 · A shader study: a toy that displaces the water (#202).** The tank also shows what a node type and a material can
do together. A plastic toy fish – an ellipsoid body, a tail and a dorsal fin of flattened cones, eyes, a glossy
`MeshPhysicalMaterial` with a clear coat – hangs above the water (or a ball: *dipping toy*). It plunges in, rests, rises
slowly and waits on a loop (*loop period*, *dip depth*); a tap (the node type's `onTap`) pushes it in once, deeper.

- **The surface is a heightfield**, simulated on the CPU: a grid of square cells (*grid*: 32, 64 or 96 along the
  longer side – 64 × 36 for the demo's tank), each with a height above the rest level and a vertical speed. One step of
  the damped wave equation pulls every cell towards the mean of its four neighbours and keeps a share of its speed
  (*damping*, per second); the glass reflects (a missing neighbour counts as the cell itself), so the sum of the heights –
  the water's volume – never changes. Steps run at a fixed rate (60 per second at 64 cells, more on a finer grid, so the
  rings run as fast), at most four per frame; nothing is allocated per frame.
- **The toy displaces its volume.** Before each step the tank works out, for every cell under the toy's body (an
  ellipsoid), how much of the body lies below the rest level. What that column grew since the last step is pushed out
  of the cell – the height goes down – and spread evenly over the whole surface; what it shrank flows back. So the
  water's volume stays the same, the surface around the toy is pressed down as it plunges and pulled back as it rises,
  and the wave equation carries the dent outward as rings. *splash* scales the displaced volume (1 is true to size and
  faint at this scale; the demo uses 4).
- **The texture.** After the steps the heights go into a one-channel half-float `DataTexture` (one texel per cell,
  linear filtering). The tank hands it to its water's material every frame through the material's uniforms
  (`heightfield`, `hasHeightfield`, `fieldSize`, `fieldTexel`, `surfaceTop`) – only when that material is the `water`
  shader; another material keeps its own look.
- **The water shader** displaces the top's vertices (and the upper edge of the sides) by the heightfield and takes the
  surface normal from the neighbouring heights. The normal drives a relief (patches tilted towards a light fixed above
  the tank are brighter, those tilted away darker), a refraction-like tint (the view bent by a tilted patch runs a
  longer way through the water – deeper colour), a fresnel highlight at grazing angles and a glint. Without a
  heightfield (*simulation* off, or the material on another node) it draws the static waves of *wave height* and
  *wave speed*, as before.
- **The caustics follow.** The floor samples the same texture: the light shifts with the surface's slope and gathers
  where the surface bulges like a lens (a negative curvature – the sum of the four neighbours minus four times the cell)
  and spreads under a trough. A cheap approximation, not traced light.

On the editor's stage (desktop, headless Edge, 60 fps) the tank's update – toy, simulation steps, the texture upload –
takes 0.008 ms per frame at 32 cells, 0.04 ms at 64 and 0.14 ms at 96 (0.002 ms with the simulation off), against
about 1.2 ms of main-thread work of the whole stage per frame. Its pure step is tested through the real plugin
(`editor/src/lib/plugins/__tests__/aquarium-waves.test.ts`: the built tank's `object.userData.waves`).

**6 · A WebGPU fluid inside a WebGL scene (#228).** Where the browser has WebGPU, the tank's water is a particle fluid:
**Splash** by Masaya Matsuoka (MIT, [github.com/matsuoka-601/Splash](https://github.com/matsuoka-601/Splash)) – an
MLS-MPM simulation in WGSL compute shaders and a screen-space fluid renderer with the narrow-range filter – adapted into
the plugin (its licence and author head that part of `index.ts`). The engine draws with three.js's `WebGLRenderer`; a
plugin cannot change that, and needs no new API for it: the fluid runs on a WebGPU device of its own and meets the scene
in a texture.

- **The domain** is the tank's inside in Splash's units (cells), with three cells of grid around it: the scale makes
  the particle count fill the water to its level once settled (3.9 particles per cell), so 10k, 20k and 40k particles
  fill the same water with finer cells (29, 37 and 46 cells per tank unit for the demo's tank). The inside's walls and
  floor are hard – the grid lets no water out through them, the particles keep 0.3 cells off them – instead of Splash's
  soft walls, so the water fills the tank to the glass and the sand. One step per frame, as in Splash, and the grid keeps
  99.5 % of its motion per step, so the surface settles flat between the toy's dips.
- **The camera hand-off.** The water mesh's `onBeforeRender(renderer, scene, camera)` reads the camera's
  `matrixWorldInverse` and `projectionMatrix` and the tank's `matrixWorld`: Splash's view is camera × tank × (cells →
  tank), scaled back so a unit is a cell again (Splash's filter thresholds and particle size are in cells); its
  projection takes the same scale in its depth term and WebGPU's depth range 0…1. Once per frame – the bloom may draw
  the scene twice – the step and the picture go to the GPU, into an off-DOM canvas at the drawing buffer's size times
  *render scale*.
- **Compositing.** The canvas is a three.js `CanvasTexture`, uploaded in the same draw (no frame behind). The `water`
  material, given the texture by the tank (`fluidMap`, `hasFluid`, `fluidViewport`), samples it at
  `(gl_FragCoord.xy − viewport.xy) / viewport.zw` on the front faces of a box as large as the inside: the fluid shows
  only within the tank's faces, and whatever stands in front of the tank hides it by the depth test. Splash refracts a
  picture behind the fluid; here the scene behind is three.js's, so the fluid is drawn with alpha – how much of what
  lies behind it hides: a light tint where the water is thin, deeper where it is thick, the floor and its caustics
  showing through – premultiplied and gamma-encoded in the 8-bit canvas, and the material divides and decodes it
  (`premultiplyAlpha` keeps the bytes as they are).
- **Water against glass, the free surface from Splash.** Every frame a compute pass finds the water's height over each
  column of cells (the highest particle, averaged over the neighbouring columns). The composite follows each pixel's ray
  through the inside: where it enters through the glass below that height, it draws flat water against the glass, as
  deep as the ray runs under the surface – a straight waterline and square corners. Elsewhere it draws Splash's free
  surface (normal from the narrow-range filtered depth, a fresnel reflection of the room only where the surface meets
  the air, a highlight); a surface the ray meets only beyond the inside is no water in the tank, and the grains of the
  surface standing above the water's height by the glass fade out. Where the free surface is thin – seen edgewise, a
  splash – its edge fades by the blurred thickness, so the outline is soft, not frayed. Where the toy's body stands in
  front of the water, the shader leaves the pixel to it (a ray against its ellipsoid).
- **The toy** is the fluid's solid body: the grid's cells inside it move with it, the particles inside are put back on
  its surface; *splash* scales its push on the way in.
- **Pause.** The fluid steps only in frames that draw the water: a lost target, a hidden node or a paused scene draws
  nothing, and a hidden page has no frames.
- **The fallback.** Without WebGPU (no `navigator.gpu`, no adapter, a device error or a lost device), with *WebGPU* off,
  or with another material on the water, the heightfield of 5 runs as before. The row's label says which: *WebGPU ok* or
  *no WebGPU* (a node type's spec is the object the Inspector reads).

Parameters: *WebGPU* (on), *particles* (10k, 20k, 40k), *render scale* (0.5, 0.75, 1), *fluid colour*; *splash*,
*dipping toy*, *loop period* and *dip depth* apply to both. The adapted part adds 43 KB to the plugin's bundle (28.7 →
72.2 KB, 8.5 → 20.1 KB gzipped). On the editor's stage (desktop, headless Edge on an NVIDIA GPU, 640 × 760 pixels, the
fluid at 0.75) the stage stays at 60 fps with every count; the hand-off costs about 0.2 ms of main-thread work per frame
and the whole stage 1.9 ms, as with the heightfield; the GPU takes 1–1.3 ms per frame (60 frames back to back, 10k to
40k). The pure parts – the choice of the water, the domain, the hand-off – are
tested through the real plugin (`aquarium-fluid.test.ts`: the built tank's `object.userData.splash`); unit tests have
no WebGPU, so they run the fallback.

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

## A file from the Library: a model parameter (API 1.7)

A plugin reaches the experience's files in three ways, and none of them is a path written into its code:

| the file | how the author names it | what your code gets |
|---|---|---|
| the node's own file | the node's `src` (a node type's spec says which kind: `glb`, `video`, `image`) | `asset` in a node type's `build` – a model's scene and clips, a video's element and texture |
| a picture or a video | a parameter of the kind `texture` – the row lists the Library's pictures and the procedural textures | a three.js `Texture` in `params` |
| a model | a parameter of the kind **`model`** – the row lists the Library's models | the file's address in `params`; **`api.loadModel(address)`** loads it |

(A shader is loaded by its URL, `api.loadText` – above.) So a plugin that needs a shape – a sheet of paper to show a video
on, a frame around a picture, a path to walk along – asks for it as a parameter, and the author uploads a `.glb` to the
**Library** and picks it in the row. A new shape is an upload, never a change of the code.

```ts
api.registerComponent("paper", {
  description: "Shows the picture on a bent sheet of paper – a model file from the Library.",
  nodeTypes: ["video", "image"],
  params: {
    sheet: { kind: "model", default: "", description: "The sheet: a model of one bent plane with UVs across it. None keeps the picture flat." },
  },
}, ({ object, params, three }) => {
  const mesh = object as InstanceType<typeof three.Mesh>;
  const plane = mesh.geometry;
  let disposed = false;
  api.loadModel(String(params.sheet)).then(model => {
    if (disposed) return;                       // the node went while the file loaded
    mesh.geometry = sheetGeometry(three, model.scene) ?? plane;
  }).catch(error => api.log("the sheet did not load", error));
  return { dispose: () => { disposed = true; } };
});
```

- **The value** is a string: `""` for none (the spec's `default` – usually that), a Library model's URL, or a content
  path. In the content's YAML a file next to the node is enough – `sheet: sheet.glb` – and the content build makes it
  the file's content path (and refuses a file that is no `.glb` / `.gltf`).
- **`api.loadModel(address)`** returns a promise of `{ scene, animations }`, as three's glTF loader gives them. It asks
  for each file once, however many nodes use it, and rejects when the file is missing or is no model. The model is
  **shared** by everyone who loads the same file: clone what you change (`model.scene.clone()`, a geometry's `clone()`),
  never dispose it.
- **It arrives later.** A build returns before the file is there: start with what the node has, apply the model when the
  promise resolves, and not at all once the node is disposed or the value has changed (`tune`).
- **In the editor** the row is a list: *none*, then the Library's models and the content's own. Upload a `.glb` to the
  Library and it is in the list; a pick shows on the stage at once.
- **An older reader** (before content schema 2.28) skips the parameter with its update hint and runs the rest of the
  component.

**The paper** (`fixtures/demo/plugins/paper`, the demo's *The screen* – #263) is exactly that: a video or an image on a
slightly bent sheet. The component takes the first mesh with UVs from the model, reads the sheet's own axes from its UVs
(where `u` grows is the picture's right, where `v` grows its bottom – so the file may lie, stand or be turned as the
artist left it), scales it to the plane the node shows its picture on (1 wide and 1 high around the centre; the bend in
the same measure as the width, its lowest point on the plane) and puts it in the plane's place. The node stays a video:
it plays, pauses, keys its green and takes layers as before, and the engine still gives it the video's proportions – a
sheet made for another proportion stretches with the picture. For a sheet from Blender: one plane, subdivided where it
bends, UVs 0–1 across it, exported as `.glb` with *Apply Modifiers* on. The demo's own sheet is written by
`editor/tools/paper-sheet.mjs`.

## A feedback buffer: the GPU remembers (API 1.6)

Some pictures need their own last frame: a fluid, a reaction-diffusion, ink that keeps flowing. A plugin never gets the
renderer – the engine owns it, in the reader and on the editor's stage alike – so it asks the engine for a **feedback
buffer**: a fragment shader the engine runs once per frame into a render target of its own, before the scene renders.

```ts
const fluid = api.feedback({
  width: 256, height: 256,      // pixels, 1–2048
  fragment,                     // GLSL with void main() writing gl_FragColor
  uniforms: { speed: { value: 1 } }, // your own, kept by reference – change .value any time
  channels: ["self"],           // iChannel0…3: "self" (the default), another buffer, a three.js texture, null
  type: "float",                // "half" (the default), "float" or "byte"
});
material.uniforms.picture = fluid.uniform; // follows every frame – or read fluid.texture
```

- **Ping-pong.** A buffer that reads itself (the channel `"self"`) has two targets: each frame reads the one and writes the
  other, then they swap – so `texture` is another object after every frame. Put **`uniform`** (`{ value: texture }`) into
  your `ShaderMaterial`'s uniforms and it follows; a pass that does not read itself has one target and a texture that
  stays.
- **The uniforms the engine sets** before each frame: `iTime` (seconds the buffer ran), `iTimeDelta`, `iFrame` (frames
  done, 0 on the first – `if (iFrame < 10)` starts it), `iResolution` (`vec3(width, height, 1)`) and `iChannel0…3`; the
  fragment also reads `varying vec2 vUv` (0–1 across the buffer; `vUv * iResolution.xy` is the pixel's centre). It is
  GLSL ES 3.0 as three.js compiles a `ShaderMaterial` (`texture()`, `int` uniforms, `gl_FragColor`).
- **Order.** The engine steps the buffers in the order they were made: a pass that reads another buffer (`channels:
  [fluid]`) and was made after it sees that buffer's new frame.
- **Precision.** `half` by default, `float` on request; where the device cannot render into it, the next lower – float →
  half → `byte` (8 bits, values clamped to 0–1) – with one warning in the console. `type` on the handle says what it got.
  A simulation whose values are negative, above 1 or change in tiny steps needs `float` (or at least `half`).
- **Pause and ownership.** A buffer made while a node builds – in a node type's or a material's `build`, a component's
  `apply` – belongs to that node: it steps only while the node and every parent are visible in the scene (a lost
  target's page is hidden, another scene's nodes are gone, a hidden page has no frames) and is disposed with the node.
  One made in `register` belongs to the plugin and goes when the plugin does. `paused` stops one by hand, `reset()`
  starts it again at frame 0, `dispose()` frees it at once.
- **The content build** runs your `register` with a recording API: there `api.feedback` checks the options and hands
  out a dummy handle (an empty texture that never steps). A buffer is no registration – nothing of it is recorded.

**From Shadertoy.** `api.shadertoy(source)` turns a Shadertoy pass – its `mainImage(out vec4 fragColor, in vec2
fragCoord)` – into a buffer's fragment: the source stays as it is, the adapter adds a `main` that calls `mainImage` with
Shadertoy's `fragCoord`, and `iTime`, `iFrame`, `iResolution` and `iChannel0…3` are the buffer's. So a two-pass shader
goes in nearly unchanged:

1. Paste each pass into a string (`const BUFFER_A = \`…\``; keep its author's credit and licence with it – Shadertoy's
   default is CC BY-NC-SA 3.0 unless the page says otherwise).
2. *Buffer A* reads itself: `api.feedback({ width, height, fragment: api.shadertoy(BUFFER_A), type: "float" })`.
3. *Image* reads Buffer A: `api.feedback({ width, height, fragment: api.shadertoy(IMAGE), channels: [bufferA], type: "byte" })`
   – one 8-bit target, no ping-pong.
4. Show the Image on a mesh: a `ShaderMaterial` with `uniforms: { picture: image.uniform }`. Shadertoy's colours are the
   screen's, so decode them for the scene: `gl_FragColor = sRGBTransferEOTF(vec4(texture2D(picture, vUv).rgb, 1.0));` and
   end with `#include <colorspace_fragment>` (the node's layers then work on it too).
5. `iMouse` and Shadertoy's other inputs are not there: declare a uniform of your own (`uniform vec4 stir;`), pass it in
   `uniforms` and set it from your hooks.

**The ink painting** (`fixtures/demo/plugins/fluid`, page 6 of the demo, #225) is exactly that: Shadertoy
[XlsBDf](https://www.shadertoy.com/view/XlsBDf) by trapcode (CC BY-NC-SA 3.0; its simplex noise from
[XsX3zB](https://www.shadertoy.com/view/XsX3zB)) – a 2D fluid whose Buffer A advects velocity, density and ink from its
own last frame while a pen moved by noise stirs it, and whose Image colours the velocity's direction by the ink. The node
type `inkPainting` builds a framed canvas standing on the page and shows the Image on it. The changes, marked `demo:` in
the passes: the pen's clock and speed as uniforms (*pen speed*), the ink's dissipation scaled (*ink dissipation*), a
tap's swirl, and a little friction on the velocity – without it the original's momentum builds up over a minute or two
at 60 frames a second until the field saturates and breaks into stripes (a soak test of 400 s with a tap every few
seconds stays calm with it). **A tap stirs where it lands**: the plugin remembers the last pointer press and, on the
node's `onTap`, casts it through the camera the canvas was drawn with (its `onBeforeRender`) onto the canvas; the swirl
draws the velocity towards a gentle whirl there instead of adding to it, so taps in a row stay stable. A tap that does
not aim (the Inspector's *tap*) stirs a random spot. *resolution* (256 or 512) is the phone's lever.

Its cost, measured on the desktop (headless Edge, NVIDIA RTX 2070 SUPER, both passes stepped 300 times back to back and
synchronised): about **0.02 ms of GPU time per frame at 256²**, 0.05 ms at 512² (0.17 ms at 1024²), and 0.01 ms of
main-thread work for the two steps. A phone's GPU is some 20–50 times slower – about 0.5–1 ms at 256² and 1–2.5 ms at
512² by that ratio, not yet measured on one (#225). The plugin is 10 KB. Its build and stepping are tested through the
real plugin with a renderer that records instead of drawing (`editor/src/lib/plugins/__tests__/ink-painting.test.ts`),
the helper itself in `engine/src/scene/__tests__/feedback.test.ts`.

## A pass: film grain (content schema 2.21)

A pass runs over the whole rendered picture, after the scene and before it lies over the camera picture, in the order
the `passes` list names – the built-in bloom, vignette and grade and yours alike. `api.registerPass` puts it into the
engine's pass registry (`engine/src/scene/post/registry.ts`) with the plugin as its owner; it leaves with the plugin. `fixtures/demo/plugins/grain` (the
demo's *The twins*, #216):

```ts
api.registerPass("filmGrain", {
  description: "Film grain over the picture.",
  params: {
    amount: { kind: "number", default: 0.12, min: 0, max: 0.5, step: 0.01, label: "strength", description: "How strong." },
    reach: { kind: "choice", options: ["all", "ar"], default: "all", description: "The whole picture, or the AR layer alone." },
    pattern: { kind: "texture", default: "", description: "A picture as the grain instead of noise." },
  },
}, ({ params, three, shaderPass, pixelRatio }) => {
  const uniforms = { uAmount: { value: Number(params.amount) }, uTime: { value: 0 }, /* … */ };
  const pass = shaderPass(FRAGMENT, uniforms);             // tDiffuse (the picture so far) and vUv are defined
  const render = pass.render.bind(pass);
  pass.render = (renderer, write, read, delta, mask) => {  // the seconds since the last frame: the grain's clock
    uniforms.uTime.value += delta ?? 0;
    render(renderer, write, read, delta, mask);
  };
  return Object.assign(pass, { update: next => { uniforms.uAmount.value = Number(next.amount); } });
});
```

```yaml
# content/scenes/the-twins/scene.yaml
passes:
  - type: filmGrain
    amount: 0.14
```

- **The factory** gets the parameters resolved (a `texture` parameter as a three.js texture or `null`), `three`,
  `ShaderPass`, `shaderPass(fragment, uniforms)`, the canvas `size` and `pixelRatio`, and returns a three.js `Pass`.
  `update(params)` takes new values in place – the editor's live edit; without it the pass is built anew on every change.
- **The picture** in `tDiffuse` is the AR layer as premultiplied colour over alpha, in linear RGB – the camera picture is
  not in it, it lies under the canvas. Keep a texel's alpha unless you mean to shade the camera picture too: the grain
  with `reach: all` fades a pixel towards white or black and raises its alpha by as much (`rgb (1 − v) + K v`,
  `a (1 − v) + v`), as the vignette does, so the specks lie on the camera picture as well.
- **A feedback buffer** (`api.feedback`, API 1.6) made in the factory belongs to the pass: it steps while the pass runs
  (not while the editor's stage shows the scene without passes) and goes with it – trails, a smear that remembers.
- **When it fails**: a factory that throws, or returns no pass, is logged and skipped – the other passes run; a `render`
  that throws is logged and the pass is switched off for the rest of the scene. A type no plugin of the experience registers
  is refused by the content build (and its parameters checked against the spec, like a built-in pass's), and by the
  publish (409 `unknown-passes`); a reader older than content schema 2.21 refuses an experience that names one.
- **The phone**: every pass is at least one full-screen render, yours counted like the built-in ones – up to three passes
  and one bloom per list; the build and the editor's section warn beyond (#86).
- **In the editor** the scene's *post-processing* section offers your pass under *add pass · <plugin>* – a compiled
  plugin's as soon as the experience is open (the build recorded it), a plugin you **Run** in the Code tab at once – shows its
  rows from the spec (labels, help, ranges, a `texture` row with the Library's pictures), moves it up and down, removes
  it, and previews it on the stage under *rendered*.
- **A second example**: `fixtures/demo/plugins/scanlines` – `scanLines`, dark lines across the picture like an old screen
  (line spacing, strength, scroll speed, `reach: all | ar`), on the demo's *The switch* with `enabled: false`: found in
  the section, switched on with the toggle in its head.

## A look: how an entity appears (API 1.8)

A look is named by the experience (`appearance`) and, since content schema 2.30, by an entity itself: the built-in components
`reveal`, `found` and `lost` on a node take the look's type – a plugin's too – and its parameters
([content](content.md), "An entity's own looks"). A plugin's look needs nothing more for that: the picker of the
component offers it next to the built-in ones, with the rows of its spec.

The engine has looks of its own – `inflateDissolve`, `printLift`, `fade`, each a set of values the experience can change
([content](content.md), "How entities appear"). When values are not enough, a plugin brings a look as code. The
demo's `plugins/reveal` is the built-in `inflateDissolve` itself written as a look – the shape, the noise dissolve with
its glowing edge, the sparks, with the built-in look's parameters under the same names – a copy to start from: pick
`revealCode` for a moment and it plays the same animation, now yours to change. A smaller one:

```ts
api.registerAppearance("softFade", {
  description: "Fades in while it grows a little; fades out the same way back.",
  params: { duration: { kind: "number", default: 800, min: 50, max: 10000, step: 10, unit: "ms", description: "How long it takes." } },
}, ({ object, params, materials }) => {
  const surface = materials();        // copies of the entity's materials, for this animation only
  const size = object.scale.clone();  // the entity's placement, as the content has it
  return {
    duration: params.duration as number,
    update: visible => {
      surface.forEach(material => {
        material.transparent = true;
        material.opacity = visible;
      });
      object.scale.copy(size).multiplyScalar(0.8 + 0.2 * visible);
    },
  };
});
```

and the experience names it where it should play, in `experience.yaml`:

```yaml
appearance:
  found: { type: softFade, duration: 500 }   # every find – and the first one, while `reveal` names no other
  lost:  { type: softFade, duration: 300 }
```

- The factory runs **once per animation** and returns `{ duration, update(visible), dispose? }`. The engine calls
  `update` every frame with how much of the entity is there: from 0 to 1 on `reveal` and `found`, from 1 to 0 on
  `lost` – a look that only says what the entity looks like at `visible` covers all three. `context.moment` tells
  which one it is, for a look that wants to differ.
- `object` is the entity on its anchor, its whole node tree; `anchor` is the page (x to the right, y to the top of the
  page, z out of it, 1 unit = the target's width). Whatever the look sets on `object`'s position, rotation and scale is
  put back when the animation ends.
- **Never change a mesh's own material** – a model's materials are shared by every entity of the same file.
  `materials()` hands out copies that sit on the meshes until the animation ends; set opacity, a colour or a shader of
  your own on those. `dispose` is for what the look itself created.
- A look that throws does not break the scene: one that fails to start leaves the moment to the default look, one that
  fails later ends there with the entity as it is.
- The content build records the look's spec (`registered.appearances`), so the build and the reader's guard check the
  experience's `appearance` against it like a built-in look's parameters.

### Code that comes and goes with its entity (1.73.0)

Every look – a built-in one or a plugin's – tells the entity how much of it is there, every frame of a reveal, a find
and a loss (#270):

- **`userData.shown`** (0…1) on the object the look animates: 0 nothing yet, 1 the entity as it is. It is taken away
  when the animation ends – no value means all of it. A node with a look of its own animates apart, inside its parent's,
  so a node's share is the **product** of the values on it and its ancestors.
- The entity's **light nodes** fade with it (`userData.fade` on each light, the same value) – with a plugin's look too.

A built-in look reports what makes the entity visible – the dissolve's front, else the fade, else the shape; a plugin's
look reports the `visible` its `update` gets. A component that should follow – a contact shadow, a glow, a sound –
multiplies the values up from its node:

```ts
const shown = (node: Object3D | null): number => {
  let share = 1;
  for (; node; node = node.parent) if (typeof node.userData.shown === "number") share *= node.userData.shown;
  return share;
};
// in update: material.opacity = strength * shown(placed);
```

An engine before 1.73.0 writes nothing, which reads as all of it. The demo's and OSCT's `contact-shadow` plugin
fades this way.

## Across nodes and pages: events, variables, the progress (API 1.1)

A component knows its own node. A **narrative** needs more: a key found on one page opens a door on another, a lamp
lights when the door opened, a text counts the pages found. Four parts of `api` carry that (the concept behind them:
`agents/research/2026-10-28-entity-components.md`, the decision `2026-10-30-demo-book.md`; the demo
`fixtures/demo/` uses every one):

- **`api.events`** – one bus for the stage. *Core events* belong to the engine, you only listen: `targetFound`,
  `targetLost`, `targetUnlocked` (the first find – progress is the app's), `targetTapped`, `sceneChanged`,
  `arState` (running / paused / stopped), `varChanged`. *Scene events* are yours: `api.events.emit("doorOpened",
  { by: "key" })` – any camelCase name that is not a core event – and every plugin listens to it with
  `api.events.on("doorOpened", payload => …)`. `on` returns the unsubscribe; when a plugin is replaced (Run) or
  unloaded, its listeners go with it.
- **`api.vars`** – variables in **scopes**: `scene` (while the scene is the current one – cleared when it changes),
  `stage` (while the scene exists), `session` (this app start), `experience` (persisted with the reader's progress). `set(name,
  value, scope)` with `scene` as the default scope, `get(name, scope?)` – without a scope the innermost definition
  wins (scene → stage → session → experience) – `on(name, (value, previous, scope) => …)` and `all(scope)`. Values are
  strings, numbers or booleans; `null` deletes.
- **`api.progress`** – read-only, from the app: `unlocked(targetId)`, `consulted(entryId)`, `completion(sceneId?)`
  (0–1, the whole experience without an id), `counts(sceneId?)` → `{ unlocked, targets }`. On the editor's stage the
  progress is the stage's own (what was found since the workspace opened); the reader passes its history
  (`ArSceneOptions.progress`).
- **`api.scene`** – `current` (the current scene: id, label, group, surfaces, passes, targets – content schema 3.0, #319: no title, pages or format) and `get(id)`.

And two more things in a component: the context's **`children`** – the placement groups of the node's children, in
content order, so a component on a `group` can show, hide or move them – and the hook **`onUnlocked`**, the first
find of the target (`onFound` is every find).

A key remembered in the experience, as a component (the demo's key does the same without code – its `behaviour`, below):

```ts
export const register = (api: PluginApi): void => {
  // The key: its first find is remembered in the experience (it survives the session)
  api.registerComponent("key", { description: "Finding this node gives the reader the key.", params: {} }, () => ({
    onUnlocked: () => api.vars.set("hasKey", true, "experience"),
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

Try it in the editor: tap the key (its rule sets `hasKey` – the **Variables** tab lists it, experience
scope, a boolean), walk to the door's scene with › – the door's rules emit `openDoor`, the door opens, the **Log** tab's timeline
shows `openDoor` and `doorOpened` with the time since the scene opened; the tree's eye switches a target off and on (lost, found again). **reset** starts a new game.
To test a branch without playing up to it, change a variable in the Variables tab or **set** one (name, scope, type, value):
it is written through `api.vars.set`, so your `api.vars.on` listeners and `varChanged` fire as for a plugin's write.
the Log tab's **tap** taps a found target as a reader would – your component's `onTap` and `targetTapped` – without aiming at it
([editor](editor.md) "Variables and Log").

## Behaviour and plugins

Not every narrative needs code. The built-in **`behaviour`** component (content schema 2.19, [content](content.md)
"Behaviour") is a list of rules an author makes in the editor's Inspector: *on* an event (the node's `found`,
`lost`, `tap`, `unlocked`, or any event of the bus), *when* variables have values, *do* actions – play, pause or stop a
clip, show or hide a node, set a variable, emit an event. It is no second system: the engine runs it on the same
runtime as your code (`engine/src/scene/behaviour.ts` on `plugin-runtime.ts`). A rule's `set` is `api.vars.set` – your
`api.vars.on` and `varChanged` fire; its `emit` is `api.events.emit` with `{ targetId, node }` as the payload – your
`api.events.on` listens to it; a rule's `on` listens to your scene events and the core events like a listener of yours; its
`when` reads like `api.vars.get` (the innermost scope). So the split is: the **rules decide** (which event, which
state, what follows), **a plugin does** what a rule cannot – move or animate a node over time, draw, compute, count the
progress – and the two meet on the bus with named events. The demo shows it: the key is only a rule now (a tap plays
its clip, sets `hasKey`, emits `keyRattled`), the door's rules emit `openDoor` and the `door` plugin lifts the door.

Reach for a rule first; write a component when a rule would need a verb it does not have. The editor's timeline
marks every rule that ran with a `behaviour` line – it is the log's own (your listeners never listen to it).

## Trying it: the Code tab

Open a scene in the editor, **Code**, **+** for a new plugin (it starts with the two examples above) or pick one
of the experience's. The editor is Monaco with the plugin API's types: completion as you type (Ctrl+Space for the list;
`api.` and `api.three.` know every member), type errors underlined as the content build would report them, a hover
shows a member's documentation. **Run** (Ctrl+Enter) shows it on the stage at once – a layer tints the video, a
component appears under *add component* in the Inspector, a pass under *add pass* in the scene's post-processing. A Run's errors show under the editor and on their line.
**Save** (Ctrl+S) keeps the source in the editor's database and runs it. The saved sources load onto the stage by
themselves whenever it starts (#269) – a Run is only for trying edits before you save them; a source that fails keeps
what ran before, and the line under the picker says why. The list names every plugin by its
name alone; one with unsaved edits has an asterisk after it (*aquarium\**), here and in the Library's code list (#232) –
the edits stay while you look at another tab. Whether readers have the saved sources, the top bar says (*draft only*,
*live on …*).

**Download** gives a zip with the plugin's folder: `index.ts`, `plugin-api.d.ts` (the module `osct-plugin-api`) and a
`tsconfig.json` that joins them – open the folder in any TypeScript editor and it type-checks the same way
(`npm install --save-dev @types/three typescript` there for three's types and `npx tsc`). `plugin-api.d.ts` is
generated from the engine (`editor/src/lib/plugins/plugin-api.d.ts`, `npm run plugin-api` in `editor/`).

## The stage's shading (1.74.0)

The editor's stage has four viewport shadings – **Wire**, **Solid**, **Textured**, **Rendered** – and code on the stage
can read which one is on: `userData.shading` on the three.js scene (`"wireframe"`, `"solid"`, `"textured"`,
`"rendered"`; #271). The reader never sets it – what readers see is the rendered picture – so **no value means
rendered**. An effect of the rendered picture that would get in the way of the working views – a contact shadow, a
glow – checks it and stays away in the others:

```ts
const rendered = (object: Object3D): boolean => {
  let root = object;
  while (root.parent) root = root.parent;
  const shading = root.userData.shading;
  return shading === undefined || shading === "rendered";
};
// in update: shadowPlane.visible = rendered(placed);
```

Wire and Solid swap the entities' materials for the stage's own; Textured keeps them – only this value tells Textured
from Rendered.

## Where it runs: the page, with the session (5.0)

In the editor a plugin runs **in the editor's own page** (#340, Tilman 2026-11-21: *"we can drop the sandbox. since we
trust the user, thats why we gave them access to the api. if we got plugins that need to change db game state, that is
fine. it is a huge security risk but only to the user who is logged in and their scope."*). The sandboxed stage frame of
#234 (1.58.0 to 4.x) is gone, and with it its limits: a plugin may use the page's `fetch` – **with the session of the
editor who has the experience open**:

```ts
// read the experience as the person sees it – or change its data, the game state, whatever they may change
const response = await fetch("/api/user");                   // the cookie goes along: it is the person's session
const { csrfToken } = await response.json();                 // writes need the session's CSRF token
await fetch(`/api/editor/experiences/${id}/…`, { method: "PUT", headers: { "X-CSRF-Token": csrfToken, … }, body });
```

**The risk, plainly**: plugin code runs with the rights of **whoever opens the experience** in the editor. Code one
editor saved runs as another editor – or an admin – when they open the stage: it can read and change what they may (the
draft, other experiences they edit, users if they are an admin), send it elsewhere, and do it without a click. The scope
is the signed-in person's own; nothing more. That is why the editor **asks before it runs code someone else saved
last** ([editor](editor.md) "The plugin guard"): *Run plugin code by ben?* lists the plugins and who saved each, the
answer is kept per experience and source version (a new save by someone else asks again), and *Don't run* leaves those
plugins off the stage – the Code tab and the Log tab say why. The person's own last-saved code runs without asking;
**Run** in the Code tab always runs what is open.

What else follows from running in the page:

- **`api.log`** shows in the Code tab's log and the Log tab (and the console); so do the engine's lines about a plugin
  and an error a plugin's module throws that nobody catches.
- **A plugin that blocks** (an endless loop) blocks the whole editor, not a frame: the auto-load's mark skips that source
  the next time the editor opens ([editor](editor.md) "Code").
- **Other origins**: the editor's page sets no Content Security Policy of its own, so the browser's defaults apply
  (CORS) – but use the experience's content and the Library for files (`api.loadText`, a texture parameter, a model's
  file), so the plugin works the same in the reader.
- **Leaving the workspace** uninstalls every plugin (`resetPlugins`): code that keeps something outside the registries
  alive (a timer, a listener on `window`) should clean it up in its component's or node's `dispose`.
- **The plugin API stays 3.1**: `api` itself did not change. What changed is where the code runs, and the reader had
  the session within reach of a published plugin before (one cookie for the site, #207).

The reader runs the published plugins in its own page – the same API, the same session within reach.

## Shipping it: the content build

A plugin reaches readers one of two ways.

**From the Code tab, with the editor's Publish** (#78): the publish carries every saved source of the experience, transpiled
in the browser exactly as **Run** transpiles it. The API writes each into the published version as
`/assets/content/plugins/<id>/plugin-<hash of its code>.js` – so other code is another version – and declares it in the
configuration (a compiled plugin of the same id gives way); the reader loads it from the CDN with the AR scene like a
compiled one. What the publish checks against the nodes (a component, node type, material or pass no plugin provides →
409) it reads from the saved source's `api.register…("type", …)` calls. A source that ran on the stage in that session
is declared with the specs that run registered (`registered`, below); one that did not, or whose run named other types
than the saved source, is declared without them – its types are known when it loads. **What it does not do**: no type
check (a type error the transpile lets through reaches readers – the Code tab underlines them, fix them first), no
bundling (one file per plugin, as the Code tab has it), and a source that does not transpile stops the publish with its
line. Only saved sources go – the Code tab's unsaved edits do not. Whether the server compiles them instead once a server
of ours can run Node is #266.

**From the content source, with the content build**: the content build – the same one
that builds the experience from its source – type-checks every plugin, bundles it, runs it once to learn what it
registers (so the nodes that use it are checked), and declares it in the configuration together with what it
registered: the specs of its components, layers, node types and passes (`registered`, content schema 2.14), and its
materials and textures (2.17) – `plugins: [{ id, src, api, registered }]`, `src` the compiled module
(`/assets/content/plugins/<id>/plugin.js`), `api` the plugin API it was built against, `registered` a map of type → spec
per kind (`components` – layers included –, `nodeTypes`, `passes`, `materials`, `textures`). So the
reader's check, the editor's API and the MCP server know your types and parameters without running your code – a typo
in a node's type or a parameter out of range is caught at save time – and the editor's Inspector shows the rows of
your component or node type before anyone presses Run. The reader's check refuses a type no declared plugin registers;
a plugin declared without `registered` (an older build) is unknown until it loads, so the check lets its types pass.
Since content schema 5.1 every recorded spec also carries what it declares beyond its parameters – `actions`, `events`,
`uses` ("Typed specs and the Logic view" above) – and a number parameter its `slider` and `integer`; the check refuses a
verb no node answers, a core event or a node's own event among the events, a name that is not camelCase. The builders'
specs are recorded as the plain objects they write. The engine ignores the field and registers from the module. From there it travels to
the CDN with the content version and the reader loads it with the AR scene. A plugin that does not compile fails
the build with the file and line, like a missing image. Those are the plugins in the content source
(`content/plugins/<id>/index.ts`, built with `npm run build:content` in `scripts/`) – an import brings them into the
editor declared and compiled.

Rules of the road: one `index.ts` per plugin (more files next to it are bundled in), no imports but
`import type`, `camelCase` type names (`tint`, `spin`, `sparkle`, `water`, `caustics` – a node type at most 32
characters), keep it small
– the build warns above 256 KB, and everything a plugin registers runs on the reader's phone. A listener you subscribe in a component: unsubscribe it in
`dispose` (a listener subscribed in `register` lives as long as the plugin). Never emit a core event – the engine does.

## The demo: everything at once

`fixtures/demo/` is a sandbox experience – the staging database's demo, exported (#322) – that uses every node type, placement, filter and component, and twenty plugins that
together use every part of the API – a narrative across its scenes (the key and the door with their `behaviour` rules,
the door's opening and the lamp as plugin code, a tally of the pages found, a tap that switches a scene, a sparkle of its
own node type), the aquarium with its material, texture and WebGPU fluid, the ink painting on two feedback buffers, a
video on a bent sheet of paper picked as a model file (`plugins/paper`), and a
film grain pass over *The twins* (`plugins/grain`) and a scan-line pass on *The switch*, switched off to be found
(`plugins/scanlines`), and the built-in looks written as plugins' looks (`plugins/reveal`: the dissolve; `plugins/lifts`: `printLiftCode` and `fadeCode`). Build it with
`OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor ([editor](editor.md) "Try it"); the plugins are the examples to copy from. What it shows per scene, and what the
model still lacks: `agents/research/2026-10-30-demo-book.md`.
