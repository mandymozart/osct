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

`register` runs once when the plugin loads. Three things you can do with `api`:

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

## Trying it: the Code tab

Open a spread in the editor, **Code**, **+** for a new plugin (it starts with the two examples above) or pick one
of the book's. **Run** (Ctrl+Enter) shows it on the stage at once – a layer tints the video, a component appears
under *add component* in the Entity panel. Errors show under the editor with their line. **Save** (Ctrl+S) keeps
the source in the editor's database for the next session.

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
everything a plugin registers runs on the reader's phone.
