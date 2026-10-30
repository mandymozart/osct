# Content guide

How the book's content is organised for the app – for artists, designers and editors.
Everything the app shows comes from the content folder (`content/` below): small text files (YAML) plus the media
next to them. No code is involved. The book's content folder is not in the app repository – it lives in a folder
of its own that `OSCT_CONTENT_DIR` names ([content on the CDN](content-cdn.md)); the repository has a small test
fixture with the same layout (`fixtures/content/`).

## The idea in five words

| Word | Meaning |
|---|---|
| **Spread** | Two facing pages of the book. The reader picks the spread in the menu at the bottom of the app; turning to the next or previous spread switches by itself. |
| **Target** | An image printed in the book that the camera recognises. Max **10 targets per spread** (the camera follows up to 4 at the same moment). |
| **Entry** | A piece of content the reader unlocks and can read later: a glossary term, a video, a text or a link. |
| **AR content** | What appears *on top of* a target in the camera view: a video, a 3D model or an image. Optional. |
| **Access page** | The page of the book where an entry is found (shown as "Access page" in the app). |

A reader points the phone at the book → the app recognises a **target** → shows its **AR content**
(if any) and unlocks the **entry** → the entry appears in the list (consultation mode) under its
category.

## Folders

**The folder name is the id** – lowercase, no spaces (`old-castle`, `sleeping-dragon`). Don't rename
folders after release: reading progress is stored by id.

```
content/
├── book.yaml                     the book (title, author, publisher)
├── spreads/
│   └── spread1/
│       └── spread.yaml           title and pages of the spread
├── entries/
│   └── old-castle/
│       ├── entry.yaml            the entry's text and settings
│       ├── images-022.jpg        the target image (the picture as printed)
│       └── castle-video.mp4      AR content, entry images …
├── entities/                     AR content used by several entries (optional)
│   └── castle/
│       ├── entity.yaml
│       └── castle.glb
└── steps/                        onboarding screens
    └── step-1/step.yaml
```

## Writing YAML

YAML files are plain text: `name: value`, one per line. Indent with **spaces** (2 per level), never
tabs. Put text in quotes when it contains a colon (`title: "Chapter 1: Home"`). For longer text use
`|` and indent the paragraphs – an empty line starts a new paragraph:

```yaml
body: |
  First paragraph of the entry.

  Second paragraph.
```

Lines starting with `#` are comments and are ignored.

## Entries

`content/entries/<id>/entry.yaml`

| Field | Required | What |
|---|---|---|
| `category` | yes | `glossary`, `video`, `text` or `link` – always singular here; the app shows "Glossary", "Videos", "Texts", "Links" |
| `title` | yes | name of the entry |
| `page` | yes | access page in the book (decides which spread the entry belongs to) |
| `body` | no | the text |
| `author` | no | for texts – shown in the list as *'Title', Author* |
| `image` | no | an image shown in the entry (glossary), file in the entry folder |
| `media` | no | for links: the web address (YouTube / Vimeo play inside the app, other pages are embedded) |
| `tags` | no | list of keywords, e.g. `tags: [forest, animal]` |
| `target` | no | the printed image that unlocks the entry – see below |

What each category shows in the app:

- **Glossary** – text and image. Grouped by first letter in the list.
- **Video** – "Go to access page … in scan mode to see the video", the text and a preview of the
  video. The video itself plays in AR on the page.
- **Text** – longer text with author.
- **Link** – text, the embedded web page or video, and "Open in a new tab".

An entry **without** `target` has nothing to scan – e.g. a glossary term that is only read in the
list.

### Recipes

**A glossary term unlocked by an image on page 3:**

```yaml
category: glossary
title: Old Castle
page: 3
body: An ancient castle filled with secrets.
image: castle-drawing.jpg        # optional picture in the entry
target:
  image: images-022.jpg          # the printed image the camera recognises
```

**A video that plays on top of a printed image (AR):**

```yaml
category: video
title: Death Jam & Living Juice
page: 4
body: Documentation of the performance.
target:
  image: images-007.jpg
  entity:
    type: video
    src: death-jam.mp4
```

**A video with transparent areas** – film or render on a single key color (neon green is safest, pure
black works too); the `chromaKey` filter makes that color transparent. The video fills the width of the
target image, its height follows the video's proportions.

```yaml
target:
  image: images-007.jpg
  entity:
    type: video
    src: clip.mp4
    filters:
      - type: chromaKey
        color: "#00ff00"
```

Video filters are a list, applied in order; each has a `type` and optional parameters (missing ones use
the defaults). Today there is one filter type:

| `chromaKey` parameter | Values | Default | What it does |
|---|---|---|---|
| `color` | `"#rrggbb"` | `"#00ff00"` | Key color that becomes transparent |
| `mode` | `auto`, `chroma`, `luma` | `auto` | `chroma` compares the color tone (green, purple, …), `luma` the brightness (black, white); `auto` picks `luma` for black/grey/white |
| `threshold` | 0–1 | 0.3 (luma 0.06) | How close to the key color disappears – higher removes more |
| `softness` | 0.001–1 | 0.08 (luma 0.1) | Width of the soft edge – higher is softer |
| `spill` | 0.001–1 | 0.1 | Removes the key color's tint on edges (chroma only) |
| `opacity` | 0–1 | 1 | Opacity of the whole video after keying |

Tips: raise `threshold` in small steps (0.02) until the background is gone; if edges look hard, raise
`softness`. A black key also makes very dark parts of the picture see-through – keep the subject lighter
than the background. The content build checks every value and names the file and parameter if one is off.
Example with all parameters: `fixtures/content/entries/edge/entry.yaml`.

**A 3D model on a printed image:**

```yaml
target:
  image: images-102.jpg
  entity:
    type: model
    src: tree.glb
```

**Placing AR content on the page** (`params`, optional – every entity type): a model stands on the page
by default (its up points out of the page, its front towards the bottom edge, where the reader is), at
half the image's width; videos and images lie flat on the image, as wide as it.

```yaml
  entity:
    type: model
    src: racoon.glb
    params:
      rotation: [90, 180, 0]   # degrees – here: standing, turned around to face the top edge
      position: [0, 0.1, 0]    # moved a little towards the top of the page
      scale: 0.8               # one number, or [x, y, z]
```

| Value | Default (model / video, image) | Meaning |
|---|---|---|
| `rotation` | `[90, 0, 0]` / `[0, 0, 0]` | Degrees `[x, y, z]`. First number: tips the model up (`90` = standing on the page, `0` = lying on its back, top towards the top edge). Second: turns it around **its own vertical axis** (`90` = facing right, `180` = facing the top edge, `270` = facing left). Third: tilts it around its own front axis (leaning sideways). |
| `position` | `[0, 0, 0]` | Offset in image widths – x → right, y → top of the page, z → out of the page. |
| `scale` | `0.5` / `1` | Size relative to the image's width. |

Each value you leave out keeps its default, so `rotation` alone is enough to turn a model.

**Tuning placement and filters:** the [editor](editor.md) (`/editor`) shows the spread on a simulated page and has a
field for every placement value and every filter parameter – the names are three.js's (`position.x`, `rotation.y`,
`scale`; rotation in degrees). Changes show on the stage at once; **Save** writes them to the instance's database and
**Publish** makes a content version of the draft. The content source in git is imported into the editor, not written
by it: carry a saved value back into `entry.yaml` (or the shared `entity.yaml`) when the source should keep it.

**Unlock and consult:** finding a target for the first time unlocks its entry – "New entry unlocked"
appears, AR content (model, video, image) pops, turns once and sparkles on the page. Tapping the found
image or the AR content opens the entry – from then on it counts as consulted.

**A text without a target:**

```yaml
category: text
title: On Building Fictions
page: 4
author: Catherine Guiral
body: |
  First paragraph …
```

**A link:**

```yaml
category: link
title: Shadows
page: 1
body: Light plays a role in architecture.
media: https://www.youtube.com/watch?v=…
```

**Components** (content schema 2.2, the first piece of the plugin API): a node may carry
`components: [{ type, ...parameters }]`, each applied to it by the engine; every type is defined once in
`shared/types/components.ts` with its parameters, so the editor's panel, the build and the guard read one
definition. The first type is **`animation`** on a model: which glTF clip plays (`clip`, empty = the first), when it
starts (`playOn: found | tap | never`), when it stops (`stopOn: lost | never`), whether it loops (`loop`) and its
`speed`. Without the component every clip of the model plays in a loop, as before.

```yaml
target:
  image: images-040.jpg
  entity:
    type: model
    src: fox.glb
    components:
      - type: animation
        clip: Run
        playOn: tap        # the reader taps the fox and it runs
        loop: false
```

**Plugins – the book's own code** (content schema 2.4, `agents/research/2026-10-29-code-in-the-editor.md`): a
folder `content/plugins/<id>/` with an `index.ts` that exports `register(api)`. The content build type-checks it
against the plugin API, bundles it into `plugins/<id>/plugin.js` (a plugin imports nothing but types – three.js is
`api.three`), runs it once to learn what it registers, and declares it in the configuration (`plugins: [{ id, src,
api }]`); the reader loads it with the AR scene. What a plugin registers is used in the content like `animation`:

- `api.registerComponent(type, spec, apply)` – code on a node. `spec` = `{ description, nodeTypes?, params }` with
  every parameter's `kind` (`number` with `min` / `max`, `color`, `choice` with `options`, `boolean`, `string`),
  `default` and `description` – the editor's Entity panel shows the rows from it. `apply({ node, params, object,
  placed, target, three })` runs when the node is built and returns hooks: `update(delta)` every frame, `onFound`,
  `onLost`, `onTap`, `onPause`, `dispose`, `tune(params)` (new values in place; `false` = build the node anew).
- `api.registerLayer(type, spec, { glsl })` – a **material layer**: GLSL on every pixel of a video, image or text
  plane (or a model's materials) after its own shading, in linear RGB. `glsl` is the body of a function
  `vec4 (vec4 rgba, vec2 uv, float time, <the parameters>)` – `rgba` the pixel so far, the parameters as arguments
  in the spec's order (`number` / `boolean` → `float`, `color` → `vec3`, `choice` → `int`, the index in its options).
- `api.registerNodeType(type, spec, build)` (plugin API 1.2) – a **node type** of the plugin's own. `spec` = `{
  description, src?, params }`: `src` the file it takes (`glb`, `video`, `image`, or `none`, the default), `params` as a
  component's (never `position`, `rotation`, `scale`). `build({ node, params, asset, target, three })` returns `{
  object, …hooks }` – the node's three.js object, which the engine places like every node (children, components and
  layers included); `asset` is the loaded `src`, shared – clone what you change. Used as the node's `type` (above).
- **Across nodes and pages** (plugin API 1.1): `api.events` (the engine's core events `targetFound`, `targetLost`,
  `targetUnlocked`, `targetTapped`, `spreadChanged`, `sceneState`, `varChanged` to listen to; scene events of the
  book's own to emit and hear), `api.vars` (variables in the scopes `spread`, `stage`, `session`, `book` – the last
  persisted with the reader's progress), `api.progress` (read-only: `unlocked`, `consulted`, `completion`, `counts`),
  `api.spread` (the current spread); the component context's `children` and the hook `onUnlocked`. The reader hands
  the engine its progress through `ArSceneOptions.progress`, the editor its simulation.
- The editor's **Code** tab ([editor](editor.md)) runs a plugin on its stage without a build; readers get only what
  the build compiled. The fixture's `plugins/tint` is the template; [plugins](plugins.md) is the guide for writing
  one, the **demo book** `fixtures/demo/` (built with `OSCT_CONTENT_DIR=fixtures/demo`) the sandbox that uses all of
  it. The build warns about a node with more than three layers (every layer runs on every pixel) and a bundle
  above 256 KB.

```yaml
# content/plugins/tint/index.ts registers the layer "tint" (color, opacity, blend) – used like a component:
target:
  image: images-031.jpg
  entity:
    type: video
    src: screen.mp4
    components:
      - type: tint
        color: "#f3cc94"
        opacity: 0.35
```

**The covers** (content schema 2.3): a spread has a **format** – `spread` (a double page, the default), `cover`
(the front cover) or `back` (the back cover). The covers have no page number: the cover spread is **page 0**, the
back spread the page after the last printed one; an entry on that page belongs to it. Its targets are printed on the
surface `front` or `back` (see `print` below). The editor shows the closed book for them; the reader treats them like
any spread. More formats (a museum wall, an object) come with the layout templates of issue #60.

**Environment** (content schema 2.8): `book.yaml` may set `environment: { world: cafe, onionSky: true }` – the world
around the reader while scanning and the onion sky (docs/look-around.md). Book-level only; without it the café with
the onion sky applies. The reader's Graphics switches still apply on top, so the content never turns on what the reader
has off. Since 2.10 the world and the sky can be files: `worldSrc` a glTF model (`.glb` / `.gltf` – the scenery around
the reader: its origin the floor under the reader, +y up, −z towards the book, the eye 1.6 m above the origin) and
`skySrc` an equirectangular image (`.jpg` / `.png` / `.webp`, 2:1 – its centre towards the book, its top edge straight
up). In `book.yaml` they are paths below the content folder (`environment/sky.jpg` – the build checks the file and writes
`/assets/content/environment/sky.jpg`); the editor writes the absolute URL of a library asset. The sky replaces the café's
sky, the model the café's scenery; the café stays the fallback while they load or when one fails. The editor edits
all of it on the stage, in the workspace's **Environment** tab (`PUT /editor/books/{id}/environment`).

**Post-processing** (content schema 2.5): a spread may carry `passes: [{ type, ...parameters }]` – effects over the
whole rendered AR image, run in order before it lies over the camera picture. The book (`book.yaml`) may carry
`passes` too: they apply to every spread without a list of its own (`passes: []` on a spread turns them off there).
Every built-in type is defined once in `shared/types/passes.ts` with its parameters, so the editor's Stage panel,
the build and the guard read one definition; missing parameters take the defaults. A spread without passes costs
nothing – the scene renders straight to the canvas as before.

| Type | What it does | Parameters |
|---|---|---|
| `bloom` | Bright parts glow: the part of the image above `threshold` is blurred and added back as light – over the camera picture too. | `strength` 0–3 (1), `radius` 0–1 (0.4), `threshold` 0–1 (0.85; 1 = only brighter than white) |
| `vignette` | The edges fade to a colour – the AR layer and the camera picture alike. | `strength` 0–1 (0.6), `radius` 0–1.5 (0.6, 1 = the sides), `softness` (0.6), `color` (#000000) |
| `grade` | Colour grading. `reach: ar` grades the AR layer alone (the camera picture keeps its colours); `reach: all` (schema 2.9) the whole picture – on the phone the camera picture too, in the editor the desk. | `reach` `ar` \| `all` (`ar`), `exposure` −2…2 EV (0), `contrast` 0–2 (1), `saturation` 0–2 (1), `tint` (#ffffff = none) |

**How a grade reaches the camera picture** (`reach: all`): on the phone the camera picture is not part of the
three.js image – the 8th Wall engine draws it into a canvas of its own (a second WebGL context) under the AR canvas,
so no pass of the chain can read it. The engine's camera renderer (`GlTextureRenderer`) takes a fragment shader of
its own, though: the scene gives the tracker one that decodes the picture to linear, applies the same exposure ×
tint, contrast and saturation as the AR layer's grade and encodes it again (`cameraGradeShader`,
`engine/src/scene/post/grade.ts`). So the camera picture is graded *before* the AR layer lies over it, and the passes
before a grade (a vignette, a bloom) are not graded on the camera picture the way they are on the AR layer; a grade
also does not reach the look-around world (drawn under the chain). Several `all` grades apply in order. The guard
ignores a pass parameter it does not know (since 2.9), the build and the API refuse it – a 2.8 app refuses `reach`.

```yaml
# content/spreads/studio-b/spread.yaml
title: Studio B – videos
firstPage: 30
lastPage: 31
passes:
  - type: bloom
    strength: 0.8
    threshold: 0.7
```

A pass of the book's own – a shader Kévin writes – registers with the engine's pass registry
(`registerPass(type, spec, factory)`, `engine/src/scene/post/registry.ts`): the factory gets the resolved parameters,
three.js and `ShaderPass`, and returns a three `Pass` over the composer's buffers. The buffer holds the AR layer as
premultiplied colour over alpha, in linear RGB, nothing of the camera picture: a pass keeps a texel's alpha unless it
means to shade the camera picture too. The plugin API of the code editor ([editor](editor.md)) exposes the registry
as `api.registerPass(type, spec, factory)`: the plugin's pass runs in the engine and leaves with the plugin. The content
build and the guard still accept only the built-in pass types, so a spread cannot name a plugin's pass yet (#97).

```yaml
# content/spreads/cover/spread.yaml
title: Cover
order: -1
firstPage: 0
lastPage: 0
format: cover
```

**Where a target is printed** (`print`, optional, content schema 2.1): targets made in the editor carry their
printed place – `surface: left | right` (the pages of a double page) or `front | back` (the covers), `x`, `y`, `width` in mm from the
surface's top left corner, optional `height` and `page` – so the editor's stage lays them out without the book's
layout. The content build does not need it.

**Several targets on the same page:** one entry each – there is no order to keep and nothing to
compile (max 10 targets per spread). An older `order:` under `target` is ignored.

**An entity is a tree of nodes** (content schema 2.0): the node under `entity:` is the **root**, it sits on the
target (1 unit = the target's width); every node may hold `children`, each placed by its own `params` **relative
to its parent**, as deep as you like (8 levels at most). Node types: `model`, `video`, `image` (a file, `src`),
`text` (a line, `text`, optional `color`; `{{entry.title}}` and `{{book.title}}` are replaced), `light` (a light,
below) and `group` (nothing of its own, it only holds children – move or scale the whole tree by its params). One
node, as above, is the default; the editor's tree shows and edits the whole tree (+ node, remove node, drag to
reparent). Any node may carry a `name` (content schema 2.12, optional) – the editor's tree shows it instead of the
type, so a tree of several groups and videos stays readable; the reader ignores it.

**A plugin's node type** (content schema 2.13): a plugin of the book may register a node type of its own
(`api.registerNodeType`, [plugins](plugins.md)) – a sparkle of points, a sprite, a line. Such a node is written like
any other, `type` the plugin's name for it; its parameters go into `params` next to the placement, and it takes a
`src` only when its plugin says which kind (a model, a video or an image). The content build checks both once it has
run the plugin; a type no plugin of the book registers is an error.

```yaml
- type: sparkle            # the demo book's plugins/sparkle
  params:
    position: [0, 0.1, 0.25]
    count: 120             # the plugin's parameters
    color: "#ffe2a8"
```

**A light** (`type: light`, content schema 2.6) lights the entity it belongs to – under a group or a model it moves
with it; the scene's own ambient light and sun stay. Its values are under `light:` (every one optional):

| `light` value | Values | Default | What it does |
|---|---|---|---|
| `kind` | `point`, `spot`, `directional` | `point` | A point light shines in every direction from the node; a spot in a cone, a directional light as parallel rays (the sun) – both along the node's own **−z**, so turn the node (`rotation`) to aim them. By default a light sits half a unit along its parent's +z (`position: [0, 0, 0.5]`: above the page for a root or a group, in front of a model, whose +z points towards the reader), pointing back at it |
| `color` | `#rrggbb` | `#ffffff` | The light's colour |
| `intensity` | 0 … 10 | `0.25` | How bright, in the node's units – whatever the target's printed size (the engine scales it to the world): a point or spot light of 1 lights a surface one target width away fully (a white page turns white; more clips, the reader has no tone mapping), half as far away four times as much; a directional light of 1 lights every surface fully |
| `distance` | 0 … 5 target widths | `0` | How far a point or spot light reaches; 0 = no limit |
| `decay` | 0 … 4 | `2` | How fast a point or spot light dims with the distance (2 = physical) |
| `angle` | 1 … 90° | `30` | The spot's cone: half the opening angle |
| `penumbra` | 0 … 1 | `0.1` | The spot's soft edge: 0 = hard, 1 = the whole cone fades |

Lights cast no shadows. They appear and disappear with the entity (the reveal and the outro fade them). The editor
draws a small helper for every light (a bulb, the cone or the rays – Blender's); the reader shows only the light.

```yaml
target:
  image: images-029.jpg
  entity:
    type: group
    params:
      position: [0, 0.1, 0]       # the whole tree, a little towards the top
    children:
      - type: model
        src: tree.glb
        params:
          rotation: [90, 45, 0]
          position: [0, 0, 0.1]  # relative to the group
          scale: 0.7
      - type: text
        text: "{{entry.title}}"
        color: "#f3cc94"
        params:
          position: [0, -0.45, 0.01]
          scale: 0.8
      - type: light                # an orange spot from the right, aimed at the tree (−z turned 45° about y)
        light:
          kind: spot
          color: "#ff9a3c"
          intensity: 0.3
          angle: 35
        params:
          position: [0.4, 0, 0.6]
          rotation: [0, 45, 0]
```

**AR content used by several entries:** put it in `content/entities/<id>/entity.yaml` (the root node; its
`children` as above, files next to it) and refer to it with `ref`:

```yaml
# content/entities/castle/entity.yaml
type: model
assets:
  - src: castle.glb
```

```yaml
# in an entry
target:
  image: images-022.jpg
  entity:
    ref: castle
```

## Spreads

`content/spreads/<id>/spread.yaml`

```yaml
title: The Beginning      # shown in the spread menu
order: 0                  # position in the menu
firstPage: 1
lastPage: 2
```

Spreads may not overlap. Every entry's `page` must fall inside a spread.

## Recognition

Nothing to prepare: the app makes the recognition data from the target images itself when a spread is
opened (8th Wall engine). A new or replaced target image works as soon as the content is built. The
spreads next to the open one are kept ready too, so turning a page switches the spread at once.

## Onboarding screens

`content/steps/<id>/step.yaml` – the screens a first-time reader sees, in `index` order.

```yaml
index: 3
description: |-
  To scan the book and display interactive content, this application requires access to your camera.
button: Grant access
action: camera              # next (default) | camera = ask for the camera | scan = start scanning
illustration: /assets/illustrations/tutorial-step-2.svg
# optional: title, footer, advance (ms – go on by itself),
#   fadeIn (ms – how long each part fades in, default 600), stagger (ms – delay between the parts:
#   Mark, illustration, title, text, footer, button; default 250 – with stagger set, Mark fades in first)
```

Step texts (`title`, `description`, `footer`) can use the book's fields: `{{title}}`, `{{author}}`,
`{{publisher}}` – e.g. `footer: "{{publisher}}"` shows the publisher from `book.yaml`. The build reports
unknown names and fields the book doesn't have.

## Media

Recommendations – final numbers follow the device tests.

| Media | Format | Tips |
|---|---|---|
| **Target images** | JPG, the picture **as printed**, cropped to its edges | Recognition needs detail and contrast: textured, asymmetric images work best; large flat areas, repeating patterns and very dark images work poorly. ~1000 px on the long side is plenty. |
| **AR video** | MP4 (H.264) | Portrait or the target's aspect ratio, 720p is enough, short loops. It starts muted; keep files small – readers load them over mobile data. |
| **3D models** | GLB with embedded textures | All animations loop. Keep polygons modest (phones). The content build optimises every `.glb` automatically: textures down to max. 1024 px (opaque ones as JPEG), geometry compressed (meshopt) – your file in `content/` stays untouched. |
| **Entry images** | JPG / PNG / WebP | ~1200 px wide is enough. |

Allowed file types: `.jpg .jpeg .png .webp` (images), `.mp4 .webm .mov` (video), `.glb .gltf`
(models), `.mp3 .wav .ogg` (audio).

## App sounds

The app plays short sounds (and vibrates on Android) – they are app files, not book content, in
`client/public/assets/sounds/`:

| File | When |
|---|---|
| `tick.wav` | Each notch of the "Pages activated" slider – plays often, keep it tiny (~20 ms) |
| `tap.wav` | A button is tapped |
| `found.wav` | A page is recognised again (at most every 4 s per page) |
| `unlock.wav` | A page is recognised for the first time – a new entry is unlocked |

To change a sound, replace the file with one of the same name (WAV, mono is enough, short and without
silence at the start). The current ones are generated placeholders (`npm run sounds` in `scripts/`).
Readers can turn sounds and vibration off in Info → Settings.

## Checking your work

Run the content build (or ask a developer to). It checks every file and stops with a clear
message when something is wrong, e.g.:

```
entries/old-castle: file "images-022.jpg" not found in content/entries/old-castle/
entries/ancient-tree: Field 'category' in entry must be one of: glossary, video, text, link
spreads/spread1 has 11 targets, max is 10.
```

Then look at the result in the app – see the quick start in the [README](../README.md).

## Schema and app versions

The content schema (`CONTENT_SCHEMA_VERSION`, `shared/types/game-config.ts`) and the app version are separate
(`agents/RULES.md` #10): the schema says what an app can read, the app version says what was released. An app reads
every MINOR of its schema MAJOR; a content file of another MAJOR is refused at startup. This table names, per schema,
the app version that first ships it. The last row is the current schema (a test checks that it matches
`CONTENT_SCHEMA_VERSION`, so a new schema needs its row).

| Schema | First app version | Status | What the schema adds |
|---|---|---|---|
| 1.1 | 1.7.6 | released | content on the CDN |
| 1.2 | 1.7.10 | released | see `docs/CHANGELOG.md` 1.7.10 |
| 2.0 | 1.10.0 | unreleased | the entity as a tree of nodes |
| 2.1 | 1.10.0 | unreleased | print placement of targets (`print`) |
| 2.2 | 1.10.0 | unreleased | components (animation) |
| 2.3 | 1.10.0 | unreleased | spread formats (cover, back) and the plugins list |
| 2.4 | 1.11.0 | in develop | plugins – the book's own code, compiled by the content build (plugin API 1.0) |
| 2.5 | 1.12.0 | in develop | post-processing passes |
| 2.6 | 1.13.0 | in develop | light nodes: point, spot and directional lights as a node type |
| 2.7 | 1.15.0 | in develop | plugin API 1.1 (events, variables, progress, the spread – the version a declared plugin carries) |
| 2.8 | 1.17.0 | in develop | the book's environment: the world and the onion sky |
| 2.9 | 1.20.7 | in develop | the grade's `reach` (`ar` / `all`); the guard ignores a pass parameter it does not know |
| 2.10 | 1.21.0 | in develop | the environment's world model and sky image as asset references (`worldSrc`, `skySrc`) |
| 2.11 | 1.22.0 | in develop | the content manifest names its book (`latest.json` / `versions.json` `book`) |
| 2.12 | 1.27.0 | in develop | a node's optional `name` (the editor's tree shows it; the reader ignores it) |
| 2.13 | next | in develop | a plugin's node type (`registerNodeType`, plugin API 1.2): its parameters in the node's `params` |

Several unreleased schema bumps may share one app version (1.10.0 has been open since the editor was started). Each
bump gets its own row when it merges, and a rebase that meets another bump takes the next free number.

## Content build

`scripts/` checks the content source (`OSCT_CONTENT_DIR`) and turns it into the files the app loads.

### Quick start

```bash
cd scripts
npm install     # once
npm start       # build the tool, then the content
```

The output (below) is not in git: every app build runs the content build first (`npm run build` in `client/`),
unless the build reads the content from the CDN ([content on the CDN](content-cdn.md)).

### Commands

Run in `scripts/`:

| Command | What it does |
|---|---|
| `npm run build:content` | Check the content and write the app files (skips when nothing changed) |
| `npm run build:content:force` | The same, even when nothing changed |
| `npm test` | Run the tests |
| `npm run build` | Rebuild the tool after changing `scripts/src/` |
| `npm run sounds` | Generate the placeholder app sounds |
| `npm run import -- <delivery folder> import/<name>.yaml` | Import a publisher's delivery into `content/` (below) |
| `npm run protocol -- import/<name>.yaml` | Write the printed-image details for the trigger trial panel (below) |

### Importing a delivery

A publisher's delivery (folders of printed images, entry images and videos) goes into `content/` through a
**mapping file** in `scripts/import/` – one per delivery, e.g. `import/2110.yaml` for the trial content of
October 2026. The mapping says, per entry id, what the entry is and which delivered file is what:

```yaml
entries:
  p038-1:
    category: glossary
    title: "p. 38 · 1"                # placeholder until the texts arrive
    page: 38
    target: glossary/P38_Print_01.jpg   # the image as printed → target.jpg
    image: glossary/P38_Online_01.jpg   # the entry image → image.jpg
    video: documentation/P38.mov        # AR video on the target → video.mp4 (optional)
    printed: { width: 44, height: 26, position: top left }   # mm – only for the protocol
    note: "anything the editors should know"
```

```bash
cd scripts
npm run import -- "C:/path/to/delivery" import/2110.yaml
```

What it does: every image becomes a JPEG (targets ≤ 1600 px, entry images ≤ 1600 px, transparency flattened
on white), every video is re-encoded with ffmpeg (H.264 MP4, long side ≤ 1280 px, ~2 Mbit/s, AAC – ffmpeg
has to be installed), `entry.yaml` is written with placeholder texts and the note as a comment, and a spread
is created for every pair of facing pages that has an entry (`s038-039`, title "38–39"). Media is rewritten
when the delivered file is newer; **`entry.yaml` and `spread.yaml` are never overwritten** – edit them
freely and run the import again when the next delivery comes. Problems (a file missing, ffmpeg failing, a
video without a target) are listed at the end.

The mapping of a delivery is made by hand or with a script – for 2110 the printed images were matched
against the trigger layout PDF (`All_Triggers.pdf`) by page and appearance, the link screenshots have no
page in their file names. Files the delivery contains but the book does not place are listed in a comment at
the top of the mapping.

`fixtures/content/` is the placeholder content from before the first delivery, slimmed down to a test fixture
(every entity type, chroma key and alpha video, shared entities; small images, two-second videos, one stand-in
model): build it with `OSCT_CONTENT_DIR=fixtures/content npm run build:content:force`. CI and the tests build it,
and `osct content sync` refuses it (`FIXTURE.md` marks it). The full-size placeholder content is kept next to the
book content source (`content-demo/` there).

### Importing the book layout

The editor's stage ([Editor](editor.md)) shows the book as laid out when the content carries the **layout**: every
sheet of the book as an image and every printed target's position and size. It comes from the designed PDFs –
the preview of the whole book (every sheet, covers as single pages) and the trigger layout (one page per double
page, each printed trigger as an image where it is printed):

```bash
cd scripts
npm run layout -- --triggers "C:/path/All_Triggers.pdf" --preview "C:/path/OSCT_preview.pdf" --content ../content
```

`scripts/layout/extract-layout.py` (Python 3 with PyMuPDF – an external tool like ffmpeg) renders every sheet
to `<content>/layout/sheets/*.jpg` (1200 px wide) and, next to each, a much sharper `<sheet>@sharp.jpg` (`--sharp-width`, 4096 px for a double page, 0 = none; the editor fetches it only when the camera is close to the page) and writes `<content>/layout/layout.json`: the page format in mm,
the sheets (kind `spread`, `cover-front`, `cover-back`, front and back matter; their book pages read from the page
numbers printed at the foot), and per target its page, surface (`left` / `right`), `x`, `y`, `width`, `height` in
mm from the page's top left corner. Trigger images are matched to the targets of their page (the entry's `page`)
by the aspect ratio of the target image, then by reading order; pages where the counts differ are listed (the
trial delivery has ten targets that are not on the printout). The content build copies `layout/` with the rest of
the content; the folder is generated and git-ignored. Run it again when the PDFs change, and rebuild the content
with `--force` (the layout is not part of the build hash).

### Videos are not in git

The imported entry videos (`content/entries/<id>/video.mp4`) are git-ignored – they are large and come to the servers
through the CDN sync: `osct content sync` uploads whatever the local content build holds, videos included
([content on the CDN](content-cdn.md); #15). Keep them in the local `content/` folder: the local build uses them. A build on a machine without them (CI, a deploy, a fresh clone) prints a warning per missing video and builds
those targets without their AR video.

### Trigger test protocol

The checklist for a test with the printed book (or the trigger printout) is in the app: debug overlay → **trial**
(dev server and staging; *trial* again or × closes it). A strip flush with the bottom of the screen shows every
target as a thumbnail in a fixed order – the order of the printout, with its running number (the same numbers as the
tester printouts of trial 2; targets not on the printout are dimmed, "not printed"). Nothing moves: a found one gets
a green frame and a ✓, the one in view a yellow frame, the current spread's a white frame, and the strip scrolls smoothly to
the current spread when it changes. While the trial is open the engine holds the current spread and its neighbours
(±1, no growing window), so scanning the next image on the sheet switches the spread by itself; closing restores
the window setting. Tap a thumbnail to go to its spread, ‹ › step through the spreads, drag the strip's top bar to
make it taller or lower. A camera line under the bar shows the lens, resolution, focus and zoom the trial runs with –
feedback only, the trial uses the app's camera defaults; the md report records it (the test switches are in the
debug overlay's camera panel, `docs/tracking.md` "Camera"). The bar counts the targets not found yet. "Found" comes from the progress, so reset the progress
(debug overlay → progress) to start a trial over. **md** downloads the report – the targets not found with their
printed image, then the found ones – to forward to the designers.

The runs so far, with their results per device, are in [trigger-tests/](trigger-tests/README.md).

The printed-image details come from the delivery mapping:

```bash
cd scripts
npm run protocol -- import/2110.yaml       # → client/public/trigger-protocol.json
```

Run it after an import (the file is committed and served at `/trigger-protocol.json`); the panel works without
it, then without file names and sizes.

### What it writes

| Where | What |
|---|---|
| `client/src/game.config.json` | Everything the app needs to know about the book (not in git) |
| `client/public/assets/content/` | The content media, optimised, and every plugin's compiled `plugin.js` next to its source (not in git) |

### Folders

```
scripts/
├── src/            everything in TypeScript, bundled into dist/ by `npm run build`
│   ├── index.ts            the content build: start
│   ├── config.ts           all folders and limits
│   ├── build/              content build parts: book, spreads, entities, entries, targets, tutorial, plugins
│   ├── lib/                shared helpers: reading content, files, hash, checks, media, storage, sync
│   ├── cli.ts              the osct CLI: content build | status | sync | purge (content-cdn.md)
│   ├── import-delivery.ts  `npm run import` – a publisher delivery into the content (mapping in import/)
│   ├── protocol.ts         `npm run protocol` – printed-image details for the trigger trial panel
│   ├── schema-lock.ts      `npm run schema:lock` – locks shared/ to the content schema
│   └── sounds.ts           placeholder app sounds
├── import/                 one mapping file per delivery
└── test/                   tests (npm test)
```

The shape of `game.config.json` is defined in `shared/types/game-config.ts`.
