# Content guide

How an experience's content is organised for the app – for artists, designers and editors.
Everything the app shows comes from the content folder (`content/` below): small text files (YAML) plus the media
next to them. No code is involved. The content folder is not in the app repository – it lives in a folder
of its own that `OSCT_CONTENT_DIR` names ([content on the CDN](content-cdn.md)); the repository has a small test
fixture with the same layout (`fixtures/content/`).

## The idea in five words

| Word | Meaning |
|---|---|
| **Scene** | One step of the experience – a double page, a cover, a wall (content schema 3.0, [Scenes](#scenes)). The reader picks the scene in the switcher at the bottom of the app by its label (`186–187`, `Cover`). |
| **Target** | An image printed in the book that the camera recognises. Max **10 targets per scene** (the camera follows up to 4 at the same moment). |
| **Entry** | A piece of content the reader unlocks and can read later: a glossary term, a video, a text or a link. |
| **AR content** | What appears *on top of* a target in the camera view: a video, a 3D model or an image. Optional. |
| **Place** | Where an entry is found: its scene (shown as the scene's label, "Place" in the app). |

A reader points the phone at the book → the app recognises a **target** → shows its **AR content**
(if any) and unlocks the **entry** → the entry appears in the list (consultation mode) under its
category.

## Folders

**The folder name is the id** – lowercase, no spaces (`old-castle`, `sleeping-dragon`). Don't rename
folders after release: reading progress is stored by id.

```
content/
├── experience.yaml               the experience (id, title; book: the printed book's author, publisher)
├── scenes/
│   └── s2-3/
│       └── scene.yaml            label, order and surfaces of the scene
├── entries/
│   └── old-castle/
│       ├── entry.yaml            the entry's text and settings
│       ├── images-022.jpg        the target image (the picture as printed)
│       └── castle-video.mp4      AR content, entry images …
└── entities/                     AR content used by several entries (optional)
    └── castle/
        ├── entity.yaml
        └── castle.glb
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
| `category` | yes | `glossary`, `video`, `text` or `link` – always singular here; the app shows "Marginalia" (the glossary, #286), "Videos", "Texts", "Links" |
| `title` | yes | name of the entry |
| `scene` | yes | the id of its scene (`scenes/<id>`) – where the reader finds it |
| `surface` | no | the id of one of its scene's surfaces – only when the scene has several |
| `body` | no | the text – Markdown with the experience's variables (below) |
| `author` | no | for texts – shown in the list as *'Title', Author* |
| `image` | no | an image shown in the entry (glossary), file in the entry folder |
| `caption` | no | the line under the image ("Image: anatomical illustration by …"), plain text in Small (schema 2.34, #289) – the entry's own text, not the Library's credit line (`credits`) |
| `media` | no | for links: the web address (YouTube / Vimeo play inside the app, other pages are embedded) |
| `tags` | no | list of keywords, e.g. `tags: [forest, animal]` |
| `target` | no | the printed image that unlocks the entry – see below |

What each category shows in the app:

- **Glossary** – text and image. Grouped by first letter in the list.
- **Video** – "Go to … in scan mode to see the video" (the scene's label), the text and a preview of the
  video. The video itself plays in AR on the page.
- **Text** – longer text with author.
- **Link** – text, the embedded web page or video, and "Open in a new tab".

An entry **without** `target` has nothing to scan – e.g. a glossary term that is only read in the
list.

**Switched off** (content schema 2.26, #249): `enabled: false` under `target` takes the target out of the reader's
book – no image target and no entry in the list or the count – while the content keeps both with all their values. The
editor shows and edits them as before (the Inspector's *In the book* switch, an *off* mark in the tree); switching on
again is `enabled: true` or no `enabled` at all. Targets that are off do not count towards the 10 per scene
(`agents/RULES.md` #3).

### The text: Markdown and variables

An entry's `body` (content schema 2.23, #223) is a small Markdown with the experience's variables. One renderer,
`shared/text/entry-text.ts`, draws it in the reader's entry view and in the editor's preview, so the author sees what
the reader will.

| Write | Shows |
|---|---|
| a blank line | a new paragraph (a single line break stays a line break, as plain text always showed) |
| `*emphasis*` or `_emphasis_` | *emphasis* |
| `**strong**` or `__strong__` | **strong** |
| `[the map](https://example.org/map)` | a link that opens in a new tab – `http`, `https` and `mailto` only; any other link stays text |
| `\*` (a backslash before a sign) | the sign itself |
| `{hasKey}` | the variable's value |
| `{tries > 2: Try the window.}` | the text when the condition holds, else nothing |
| `{hasKey: The door opens.\|It is locked.}` | one text or the other |
| `{name: {name}\|friend}` | the variable, or *friend* when it is not set – the fallback |
| `\{`, `\}`, `\|` | the brace or the bar itself |

Nothing else is markup: no headings, lists, images, code or HTML – HTML shows as text (everything is escaped).

**Variables** use the syntax of SCUTOONS' message boxes – ink's inline syntax, its parser copied into
`shared/text/expressions.ts`: a bare camelCase name is one of the experience's variables, which behaviours set
(`set: { hasKey: true }`) and plugins keep (`api.vars`), read from the innermost scope that has it – scene, stage,
session, experience – like `api.vars.get(name)`. Conditions take numbers, `"texts"`, `true` / `false`, `and` `or` `not`,
`==` `!=` `<` `<=` `>` `>=`, `+` `-` `*` `/` `mod` and parentheses. A variable that is **not set shows as nothing** (and
is false in a condition) – the fallback is a condition with an else part, as above. SCUTOONS' lists (`{a|b}`,
`{&…}`, `{~…}`, `{!…}`) and functions (`clock(t)`) are no part of an experience's text: they render nothing, the editor names
the problem and the MCP server refuses them.

The reader fills in the values as they are when the entry opens: every scope once the scene has run, before that the
experience scope from the reader's progress. The editor's preview takes them from its stage.

An app older than schema 2.23 shows the body as written – `**strong**`, `[the map](https://…)` and `{hasKey}` with
their signs (the table in "Schema and app versions"). Plain text reads the same in both.

### Recipes

**A glossary term unlocked by an image in the scene `s2-3`:**

```yaml
category: glossary
title: Old Castle
scene: s2-3
body: An ancient castle filled with secrets.
image: castle-drawing.jpg        # optional picture in the entry
target:
  image: images-022.jpg          # the printed image the camera recognises
```

**A video that plays on top of a printed image (AR):**

```yaml
category: video
title: Death Jam & Living Juice
scene: s2-3
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
|---|---|---|---|---|
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

**The page is the zero plane** (#189): a model that stands on the page should have its lowest point on the paper
(`z = 0` of its target), not float above it or sink into it. That holds by itself for a model whose origin is its floor
(a glTF made so); a model whose origin is its middle needs `position` z = its lower half × its scale. The content build
reads each model's bounding box from its file, carries it through the placements of the nodes above it and **warns**
when its lowest point is more than 0.005 target widths away from the page – with the position that stands it there. A
model meant to float keeps the warning; nothing is refused. Videos and images standing upright are not checked (the
build does not know a video's height): half the plane's height (the video's height ÷ width × the scale) is its z.

**Tuning placement and filters:** the [editor](editor.md) (`/editor`) shows the scene on a simulated page and has a
field for every placement value and every filter parameter – the names are three.js's (`position.x`, `rotation.y`,
`scale`; rotation in degrees). Changes show on the stage at once; **Save** writes them to the instance's database and
**Publish** makes a content version of the draft. The content source is imported into the editor, not written
by it: carry a saved value back into `entry.yaml` (or the shared `entity.yaml`) when the source should keep it.

**Unlock and consult:** finding a target for the first time unlocks its entry – "New marginalia unlocked"
appears, AR content (model, video, image) pops, turns once and sparkles on the page. Tapping the found
image or the AR content opens the entry – from then on it counts as consulted.

**A text without a target:**

```yaml
category: text
title: On Building Fictions
scene: s2-3
author: Catherine Guiral
body: |
  First paragraph …
```

**A link:**

```yaml
category: link
title: Shadows
scene: s2-3
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

**Behaviour – rules without code** (content schema 2.19, #88): a node of any type may carry one `behaviour`
component, a list of **rules**. Each rule reacts to an event (`on`), may ask for variables (`when`) and runs its
actions (`do`) in order. It runs on the same event bus and variables as a plugin's code (`api.events`, `api.vars` –
[plugins](plugins.md) "Across nodes and pages"), so rules and plugins hear each other.

```yaml
target:
  image: key.jpg
  entity:
    type: model
    src: key.glb
    components:
      - type: animation        # how the clip plays: once, never by itself
        clip: rattle
        playOn: never
        loop: false
      - type: behaviour
        rules:
          - on: tap            # the reader taps the key
            do:
              - play: rattle
              - set: { hasKey: true }
                scope: experience    # kept with the reader's progress
              - emit: keyRattled
```

| Part | Values | What it does |
|---|---|---|
| `on` | `found`, `lost`, `tap`, `unlocked`, or an event's name | The node's own events – its page found, lost, the AR content tapped, the page's first find – or any other camelCase name: an event of the stage, a scene event a plugin or another behaviour emits (`doorOpened`) or a core event (`targetFound`, `varChanged`, …) |
| `when` | an expression: `hasKey && tries > 2` | Optional (content schema 5.0). The language of the entries' `{…}` texts without braces ("The text: Markdown and variables" above): camelCase variable names, numbers, `"texts"`, `true` / `false`, `and or not && \|\| !`, `== != < <= > >=`, `+ - * / mod`, parentheses. The rule runs when the value is true – `0`, `""`, `false` and a variable that is *not set* are false. A variable is read from the innermost scope that has it (scene, stage, session, experience). No functions, no dotted names |
| `play` | a clip's name, `""` | Plays a clip of a model – `""` its own clip (the `animation` component's, else the first). `node: <name>` plays another model of the subtree. The `animation` component still says how (loop, speed) |
| `pause`, `stop` | a node's name, `""` | Pauses the clip, or stops it at its start – `""` the behaviour's own node |
| `show`, `hide` | a node's name, `""` | Shows or hides a node of the subtree by its `name` – `""` the behaviour's own node |
| `set` | `{ name: value }`, `scope` | Sets variables (`null` deletes one) in `scope`: `stage`, `session`, `experience` or `scene` – none given: the variable's declared scope, else `scene`. **A value is an expression** (content schema 5.0): `tries + 1`, `hasKey`, `"calm"` – see "Set values and typed variables" below |
| `emit` | an event's name | Sends a scene event to the stage (`{ targetId, node }` as its payload); never a core event or a node event |
| `goto` | `scene:<id>` | Content schema 5.0: the reader opens that scene, as a link to `/scene/<id>` does ("Addresses" below). The editor's stage only logs it |

`do` takes one action or a list; a plain word runs a verb on the own node: `do: play`, `do: hide`. Nodes are named with
their `name` (schema 2.12) – the door's rules below show and hide its child `hint`. On one event every rule's condition
is read first, then the rules that matched run in their order, so two rules can toggle a variable without the second
undoing the first. A rule that emits an event other rules hear sets them off at once; a chain deeper than 8 events is
cut (logged). An action that cannot run – a node or a clip that is not there – is logged and the next one runs.

```yaml
  entity:
    type: group
    children:
      - { type: model, name: door, src: door.glb }
      - { type: text, name: hint, text: "Tap the key on page 1" }
    components:
      - type: behaviour
        rules:
          - on: found
            do: { show: hint }
          - on: found
            when: hasKey
            do: [{ hide: hint }, { emit: openDoor }]
          - on: tap
            when: doorOpen && visits >= 2
            do: { goto: "scene:epilogue" }
```

A condition is one expression; quote it in YAML when it starts with `!` or holds `: ` (`when: '!doorOpen'`). Before
content schema 5.0 a condition was an object (`{ hasKey: true }`, `{ any: … }`, `{ not: … }`) – `npm run convert:5`
converts a content folder once: each test becomes `name == value` (`!=` for `not`), the tests are joined with `&&`
(`||` for `any`), and a *not set* test (`null`) becomes a truth test (`!name`) – the command lists those to check.

**Set values and typed variables** (content schema 5.0, #334 B2 and B7). A `set` value is an expression of the same
language, so a counter needs nothing special: `set: { tries: "tries + 1" }`. Every set value is an expression – the one
form, so a text value is the language's text literal: `"calm"`, in YAML quoted once more, `set: { mood: '"calm"' }`
(an unquoted `calm` is the variable `calm`). A number or `true` / `false` may stand bare (`set: { tries: 0, hasKey: true
}`); they are their own expressions. An expression that cannot be evaluated (a variable in it not set, a text compared
with `<`) sets nothing and is logged. `npm run convert:5` turns a 4.x set's text values into literals (once – a second
run would quote them again).

Every variable has a **type** – `number`, `integer`, `boolean` or `string`. Declare it in `experience.yaml`, or let the
first `set` of it in the content decide (the experience's rules, then the scenes' in order, then the shared entities',
then the targets'):

```yaml
variables:
  tries: { type: integer, scope: stage, default: 0 }   # a declared variable that is not set reads as its default
  mood: { type: string, default: calm }                 # a default is a plain YAML value, not an expression
```

A `set` of another type, a comparison of two types (`tries == "3"`), a `set` with another `scope` than the declared one and
a `when` that is not true / false (`when: tries`) are problems – the content build and the editor name them. `&&`, `||`
and `!` need true / false; `-`, `*`, `/`, `%`, `<`, `<=`, `>`, `>=` need numbers; `+` adds numbers or joins texts, never a
text and a number. An integer goes where a number is wanted; nothing else is converted. The reader refuses a value of the
wrong type at runtime – also one a plugin sets with `api.vars.set` – keeps the old one and logs it. A plugin's own
variables, which no rule sets and nobody declares, stay untyped. The entries' `{…}` texts keep their loose display rules.

**A scene's and the experience's rules** (content schema 5.0, #334): the same rules on a scene (`logic:` in
`scene.yaml` – live while the scene is open) and on the experience (`logic:` in `experience.yaml` – live for the whole
session, across scene switches). They hear the stage's bus only – a scene event or a core event (`targetFound`,
`targetUnlocked`, `targetTapped`, `sceneChanged`, `varChanged`, …), never a node's own `found` / `lost` / `tap` /
`unlocked` – and they have no node of their own: `show`, `hide`, `pause`, `stop` and `play`'s `node` name a node by
address, and a plain word (`do: hide`) is not allowed. A scene's rules act on its own targets only (only the open scene's
entities are built); `sceneChanged` reaches them once the new scene's nodes are there.

```yaml
# scenes/hall/scene.yaml
logic:
  rules:
    - on: doorOpened                      # a scene event a node's rule or a plugin emits
      when: hasKey
      do:
        - show: "target:door/hint"        # the node named hint in the target door's entity
        - play: creak
          node: "target:door"             # the entity's root
# experience.yaml
logic:
  rules:
    - on: targetUnlocked
      when: unlocks >= 3
      do:
        - set: { chapterDone: true }
          scope: experience
        - goto: "scene:epilogue"
```

**Addresses** (`shared/types/address.ts`): `scene:<sceneId>` – where a `goto` goes; `target:<targetId>` – the root of a
target's entity, `target:<targetId>/<node name>` – the first node of that name in it. The grammar is SCUTOONS' (a
scheme, a colon, a path), so later schemes (`toon:`, `chapter:`) and a goto's `via` (an on-screen instruction) fit in.
The content build checks that a goto's scene and an address's target exist.

**The canvas**: next to `rules`, a `logic` may hold `canvas` – the editor's Logic view's own data (`groups: [{ id,
label, members }]`, `notes: [{ id, text, x, y }]`, `folds: [node ids]`, since schema 5.1 `exposed: { <box id>: [port
ids] }` – the ports an author exposed on a box beyond its wired ones, [editor](editor.md) "Ports from the specs"). It is
authoring data: stored in the editor's database and in its export, never in a reader's configuration – the content build
and a publish leave it out.

The editor's Inspector edits the rules without YAML ([editor](editor.md)), and the scene's *vars and events* there shows
each rule that ran. What a rule cannot do – move a node over time, draw text, count the progress – is a plugin's job;
the demo's `door` plugin hears the rule's `openDoor` and lifts the door ([plugins](plugins.md) "Behaviour and plugins").
Variables are not declared yet: a rule names them, a missing one is *not set* (`null`).

**Plugins – the experience's own code** (content schema 2.4): a folder `content/plugins/<id>/` with an `index.ts` that
exports `register(api)`. The content build compiles it, runs it once to record what it registers and declares it in the
configuration; the reader loads it with the AR scene. What a plugin registers – a component or a material layer, a node
type, a material, a procedural texture, a pass – is used in the content by its type, like a built-in one. How to write
one, the plugin API and what the build records: [plugins](plugins.md) – the fixture's `plugins/tint` is the template,
the demo `fixtures/demo/` (built with `OSCT_CONTENT_DIR=fixtures/demo`) uses all of it; the editor's **Code** tab
([editor](editor.md)) runs a plugin on its stage without a build.

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

**Covers, front and back matter, walls** (content schema 3.0): a scene is what it is by its surfaces and its label – a
cover is a scene of one surface one page wide (`label: Cover`), front matter a double page labelled `Front matter 1`, a
wall a scene whose surface stands (`place: { …, rx: 90 }`). No formats, no internal page numbers. A book laid out for print gets
these scenes from its layout: the delivery import writes a scene for every sheet of `layout/layout.json` that has none
(`cover`, `front-1` …, the numbered ones, `back-1` …, `back`).

**The printed book** (content schema 4.0, #320): `experience.yaml` names the experience (`id`, `title`); when it
accompanies a printed book, `book:` holds the print data – `author` (required there) and `publisher` (optional), which
the reader's splash, about page and landing show. An experience without `book:` is not a book (a wall, a room, an
exhibition – the demo is one); the splash then shows its title only. Every experience adds and removes its scenes in
the editor (the source of truth of 2.25–3.x is gone).

**Environment** (content schema 2.8): `experience.yaml` may set `environment: { world: cafe, onionSky: true }` – the world
around the reader while scanning and the onion sky (docs/look-around.md). Experience-level only; without it the café with
the onion sky applies. The reader's Graphics switches still apply on top, so the content never turns on what the reader
has off. Since 2.10 the world and the sky can be files: `worldSrc` a glTF model (`.glb` / `.gltf` – the scenery around
the reader: its origin the floor under the reader, +y up, −z towards the scene, the eye 1.6 m above the origin) and
`skySrc` an equirectangular image (`.jpg` / `.png` / `.webp`, 2:1 – its centre towards the scene, its top edge straight
up). In `experience.yaml` they are paths below the content folder (`environment/sky.jpg` – the build checks the file and writes
`/assets/content/environment/sky.jpg`); the editor writes the absolute URL of a library asset. The sky replaces the café's
sky, the model the café's scenery; the café stays the fallback while they load or when one fails. The editor edits
all of it on the stage, in the workspace's **Environment** tab (`PUT /editor/experiences/{id}/environment`).

**Post-processing** (content schema 2.5): a scene may carry `passes: [{ type, ...parameters }]` – effects over the
whole rendered AR image, run in order before it lies over the camera picture. The experience (`experience.yaml`) may carry
`passes` too – **the master**: they apply to every scene without a list of its own; a scene's `passes` override
them (`passes: []` on a scene turns them off there). The editor edits both in the Inspector's *post-processing*
section while the scene is selected ([editor](editor.md)): the experience's with `PUT /editor/experiences/{id}/passes`, a scene's own with
`PUT …/scenes/{sid} { passes }`. Every built-in type is defined once in `shared/types/passes.ts` with its parameters,
so the editor's Inspector, the build and the guard read one definition; missing parameters take the defaults. A
scene without passes costs nothing – the scene renders straight to the canvas as before, the look-around world too.
A list may also name **a pass of the experience's plugins** (schema 2.21, below). **The phone budget** (#86): every pass is a
full-screen render, the bloom several – up to three passes and one bloom per list; the build warns beyond (a plugin's
pass counts like a built-in one), the editor's section says so too. The S22 measurement behind the number is still open.

**A pass can be off** (content schema 2.22, #233): `enabled: false` keeps a pass in its list with its values, and the
chain skips it – it renders nothing and costs nothing (the phone budget does not count it); leave `enabled` out (or
`true`) for a pass that runs. A list whose passes are all off renders straight to the canvas, as without passes. The
editor's toggle in each pass's head writes it; the build, the guard, the API and the MCP server accept `true` / `false`
and refuse anything else. An app of schema 2.21 does not know the field: it runs the pass (the 1.55.0 app skips the
field with the update hint).

```yaml
passes:
  - type: bloom
    enabled: false   # off – the values stay for later
    strength: 0.35
  - type: vignette
```

**The look-around world goes through the passes** ([look-around](look-around.md)): while passes run, the world around
the reader and its sky (the onion sky included) are drawn into the chain's image under the AR layer, so a bloom
glows on them, a vignette darkens them and a grade with `reach: all` grades them – on the phone and on the editor's
stage alike; a grade with `reach: ar` stays on the AR layer (it gets the layer's coverage as a mask).

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
before a grade (a vignette, a bloom) are not graded on the camera picture the way they are on the AR layer; the
look-around world is part of the chain's image, so it is graded with the AR layer. Several `all` grades apply in order. The guard
ignores a pass parameter it does not know (since 2.9), the build and the API refuse it – a 2.8 app refuses `reach`.

```yaml
# content/scenes/studio-b/scene.yaml
label: "30–31"
order: 15
surfaces:
  - { id: surface, widthMm: 460, heightMm: 320 }
passes:
  - type: bloom
    strength: 0.8
    threshold: 0.7
```

**A plugin's pass in `passes`** (content schema 2.21, #216): a pass of the experience's own is a plugin's (`api.registerPass`,
[plugins](plugins.md) "A pass: film grain"). The experience and a scene name it like a built-in one –
`- type: filmGrain` with its parameters. The content build records every pass a plugin registers (`registered.passes`)
and checks the list against those specs (a type no plugin of the experience registers, a value out of range or an unknown
parameter is an error, as with a built-in pass; a plugin may not take a built-in pass's name, nor two plugins the same
one); the guard checks it against the recorded spec too and refuses a type no declared plugin recorded – unless a
plugin of an older build recorded nothing. The engine builds it from the plugin's factory in its place in the list:
a pass whose factory throws (or returns no pass) is logged and skipped, one whose `render` throws is logged and switched
off – the rest of the chain runs. Its `texture` parameters arrive as textures, a feedback buffer its factory makes
(`api.feedback`) steps while the pass runs. The editor's API accepts a pass the declared plugins recorded (any
camelCase name while the experience has Code tab sources); **the publish refuses a pass no compiled plugin provides** (409
`unknown-passes`). **A 2.20 app refuses an experience that names one** (its guard knows no plugin pass): such an experience needs a
2.21 app. The demo's scene *The twins* carries one (`fixtures/demo/plugins/grain`).

```yaml
# content/scenes/the-twins/scene.yaml
passes:
  - type: filmGrain
    amount: 0.12
```

```yaml
# content/scenes/cover/scene.yaml
label: Cover
order: -1
surfaces:
  - { id: surface, widthMm: 230, heightMm: 320 }
```

**Where a target is printed** (`place`, optional, content schema 3.0): targets made in the editor carry their
printed place – `x`, `y`, `width` in mm from the top left corner of a surface of the entry's scene, optional `height`,
and `surface` (its id) when the scene has several – so the editor's stage lays them out. On a double page (one surface)
a target on the right page has `x` ≥ the page's width. The reader does not need it.

**Several targets on the same page:** one entry each – there is no order to keep and nothing to
compile (max 10 targets per scene). An older `order:` under `target` is ignored.

**An entity is a tree of nodes** (content schema 2.0): the node under `entity:` is the **root**, it sits on the
target (1 unit = the target's width); every node may hold `children`, each placed by its own `params` **relative
to its parent**, as deep as you like (8 levels at most). Node types: `model`, `video`, `image` (a file, `src`),
`text` (a line, `text`, optional `color`; `{{entry.title}}` and `{{experience.title}}` are replaced), `light` (a light,
below) and `group` (nothing of its own, it only holds children – move or scale the whole tree by its params). One
node, as above, is the default; the editor's tree shows and edits the whole tree (+ node, remove node, drag to
reparent). Any node may carry a `name` (content schema 2.12, optional) – the editor's tree shows it instead of the
type, so a tree of several groups and videos stays readable; the reader ignores it.

**A plugin's node type** (content schema 2.13): a plugin of the experience may register a node type of its own
(`api.registerNodeType`, [plugins](plugins.md)) – a sparkle of points, a sprite, a line. Such a node is written like
any other, `type` the plugin's name for it; its parameters go into `params` next to the placement, and it takes a
`src` only when its plugin says which kind (a model, a video or an image). The content build checks both once it has
run the plugin; a type no plugin of the experience registers is an error.

**A node's material** (content schema 2.17): any node with meshes (a model, an image, a video, a text, a plugin's node)
may carry `material: { type, params }` – a material a plugin of the experience registers (`api.registerMaterial`,
[plugins](plugins.md) "An aquarium, step by step"). It replaces what the node's type draws; the node's material layers
still add on top. A `texture` parameter names a procedural texture of a plugin or a file next to the node.

```yaml
- type: model
  src: tank.glb
  material:
    type: water            # the demo's plugins/aquarium
    params:
      deep: "#0b4f6c"
      ripples: caustics    # a texture parameter: the plugin's procedural texture
```

```yaml
- type: sparkle            # the demo's plugins/sparkle
  params:
    position: [0, 0.1, 0.25]
    count: 120             # the plugin's parameters
    color: "#ffe2a8"
```

**A light** (`type: light`, content schema 2.6) lights the entity it belongs to – under a group or a model it moves
with it; the scene's own ambient light and sun stay. Its values are under `light:` (every one optional):

| `light` value | Values | Default | What it does |
|---|---|---|---|---|
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

## How entities appear: `appearance`

How an AR entity appears and disappears is the experience's (content schema 2.29), in `experience.yaml` – a **look** for each of
three moments:

```yaml
appearance:
  reveal: { type: inflateDissolve }            # the first find of a target – the entry is unlocked with it
  found:  { type: printLift, duration: 900 }   # every later find
  lost:   { type: fade }                       # the page is lost
```

Every moment is optional: one without a look takes `found`'s, and an experience without `appearance` plays
`inflateDissolve` everywhere. `reveal` and `found` play a look forwards in its `duration`; `lost` plays its look
rewound in the look's `outDuration`.

A look is `{ type, ...parameters }`, like a pass. The built-in looks share one set of parameters and differ in what
they set (`shared/types/appearance.ts` has every parameter with its range):

| Look | What it is | What it sets |
|---|---|---|
| `inflateDissolve` | Flat and small on the page, the entity rises, grows and turns half around under a noise dissolve with a gold edge and sparks | 3470 ms in, 600 ms out · `mask: noise` until 0.75, edge 0.06 → 0.015 at intensity 0.6, glow 0.6 · `heightFrom: 0`, `scaleFrom: 0`, `spin: -0.5` until 0.8 · 300 sparks |
| `printLift` | A pale print on the paper lifts off the page and takes its colours | 1100 ms in, 600 ms out · `heightFrom: 0` from 0.2, eased in and out · `fade: 0.15` · `tint: 0.85` gone at 0.7 |
| `fade` | Fades in, fades out | 600 ms in, 400 ms out · `fade: 1` |

The parts: the **shape** (`heightFrom` – 0 lies flat on the page –, `scaleFrom`, `spin`, between `shapeStart` and
`shapeEnd` with `shapeEase`), the **mask** (`mask: noise` with `waves`, between `maskStart` and `maskEnd`; its
`edgeStart` → `edgeEnd` in `edgeColor` × `edgeIntensity`, the `glow` over `glowWidth` in `glowColor`), the
**surface** (`fade`, `tint` in `tintColor` until `tintEnd`), `sparks` (`sparkColor`, `sparkSize`, `sparkDistance`
in target widths) and `bloom`. Starts and ends are shares of the duration (0–1). A look can be tuned by eye in the
reveal sandbox (`sandbox/reveal`, "As shipped"): its **Values** show the look as it is written here.

A look of the experience's own code – a plugin's, `api.registerAppearance` – is named the same way, by its type with its
own parameters ([plugins](plugins.md), "A look"). In the editor a scene's Inspector sets it in its *appearance*
section ([editor](editor.md) "Appearance"), an AI connection with `put_experience_appearance` ([MCP](mcp.md)); both save
the draft's `experience.appearance` (`PUT /editor/experiences/{id}/appearance`). A fade keeps the entity's materials see-through while it runs: a
model shows through itself a little.

**An entity's own looks** (content schema 2.30, #268): the built-in components `reveal`, `found` and `lost` on the
node say how *this* entity – or that node's subtree – appears, in place of the experience's:

```yaml
components:
  - type: reveal
    look: printLift       # a built-in look or a plugin's; "" or none = the experience's
    duration: 900         # the look's own parameters follow – only what differs from its defaults
  - type: lost
    look: fade
```

A component is written, edited and checked like any other (`put_entity`, the YAML, the Code tab, the Inspector's *add
component*), but its parameters are the look's: the Inspector shows a *look* row and then the rows of the look it names.
Another look starts with its own defaults. Per moment the order for the root node is: its own component, else its `found`
(for `reveal` and `lost`), else the experience's moment, the experience's `found`, the default look. **Any node** may carry them:
a node with a look of its own animates its subtree with it, at the same moment but apart – its shape (rising, growing,
turning) around its own footprint – while the rest of the entity plays the root's look; a child's moment without a look of
its own is part of its parent's animation.

## Scenes

`content/scenes/<id>/scene.yaml` – content schema 3.0 (#319, `agents/SCENES.md` "Schema 3.0"). A **scene** is one step
of the experience: a double page, a cover, a wall, a room. The experience is the ordered list of its scenes – nothing
derives an order or a place from a page number.

```yaml
label: "186–187"          # what the reader shows: the switcher at the bottom, the entries list, the image credits
order: 93                 # its position among the scenes (only the order counts – any numbers)
surfaces:                 # its physical areas, at least one
  - id: surface
    widthMm: 460          # a double page is ONE surface, twice the page's width
    heightMm: 320
passes:                   # optional: post-processing over this scene (see above)
  - type: bloom
```

| Where | Field | What it is |
|---|---|---|
| scene | `label` | required – free text as the reader should read it (`186–187`, `Cover`, `Studio wall`). Never arithmetic |
| scene | `order` | its position (default 0; equal orders sort by id) |
| scene | `surfaces` | `[{ id, label?, widthMm, heightMm, place? }]` – unique ids within the scene, sizes in mm. A double page is one surface (460 × 320), a cover one (230 × 320), a wall or a poster one. No left / right, no front / back |
| surface | `place` | where it lies in the scene: `{ x, y, z, rx?, ry?, rz? }` – mm and degrees (Euler XYZ) in the **scene's coordinate system**: origin on the table at the middle of the first row, +x right, +y up, +z towards the reader; unrotated a surface lies flat, face up, its top edge away from the reader; a wall ahead is `rx: 90`. Without `place` the build lays the surfaces in a row, touching, flat, the row centred on the origin – the configuration always carries all six numbers |
| surface | `label` | optional – what is printed on it; the reader shows it as an entry's place when the entry names the surface |
| scene | `group` | the id of one of the configuration's `groups` (`[{ id, label }]` – several scenes under one label) – not written by the content build yet |
| entry | `scene` | required – the id of the entry's scene |
| entry | `surface` | the id of one of its scene's surfaces – only when the scene has several |
| target | `place` | where it is printed: `{ surface?, x, y, width, height? }` in mm from the surface's top left corner – `surface` (its id) is required when the scene has several |

**Labels in the reader.** The switcher steps through the scenes with targets and shows each scene's `label`; the
entries list's *Place* column and the entry's *Place* row show the entry's surface label, else its scene's label; the
All list is sorted by scene order, then by title; the image credits group their lines under the scene's label. Links are
`/scene/<id>`; the reading progress remembers the last scene by id (`lastScene`).

The guard checks: a scene has a label and at least one surface; a surface a size and all six numbers of its place;
surface ids are unique within their scene, group ids within the experience; a scene's `group` names a group; an entry's
`scene` names a scene, its `surface` one of that scene's surfaces; a target's `place.surface` too, and a target in a
scene of several surfaces must name its surface.

**From 2.x**: every source and database was converted to 3.0 (#319); the converter (`convert-content-3.ts`) is gone
since 3.16.4 (#322) – an older source is converted from the git history if one ever turns up.

## Recognition

The image tracker (8th Wall engine) recognises a target by its printed image. Before it can, two things happen on the
phone when a scene's targets are loaded ([tracking](tracking.md) "The flow today"):

1. **The frame** – the printed image becomes a grey 480 × 640 frame, the image whole in a 3:4 portrait frame
   (landscape turned 90° clockwise, the rest filled with its edge colour). S22: 150–260 ms per image, plus the image's
   download.
2. **The features** – the engine extracts them from that frame, one target per frame. This always happens on the
   phone: the engine (`@8thwall/engine` 0.1.0) takes no precompiled features.

**Made ahead** (#306): step 1 can be made ahead and stored with the target – the frame as a Library file
(`<target>_recognition.png`, stored under the image rule like every picture), the target's `recognition`
(`{ imageSrc, width, height }`, content schema 4.1) naming it. With it the reader can give the engine that frame as it
is: no decoding, drawing or encoding on the phone, and a smaller download than a 1200 px printed image. Step 2 – and so
what is recognised – stays the same in principle: the frame is the same picture the reader makes itself (the geometry
and the builder are one module, `engine/src/scene/target-frame.ts`, used by the reader, the editor and the CLI).

**Original stays the default** (Tilman, 2026-11-20): the runtime path is tested with every target, small black-and-white
ones included. Made-ahead frames are used only where the experience says so (content schema 4.2):

| Setting | Where | Effect |
|---|---|---|
| `experience.recognition` | the editor's experience settings (*recognition*: Original / Prepared), `update_experience`, `PUT /editor/experiences/{id} { recognition }`, `recognition:` in `experience.yaml` | `"original"` (none = the default): every frame made from the printed image on the phone. `"prepared"`: a target's `recognition` where it has one |
| `target.recognitionOff: true` | the target's inspector (*original only*), `put_target`, `PUT …/targets/{id} { recognitionOff }`, `recognitionOff:` under `target:` in an entry's YAML | this target always uses its printed image, even when the experience says prepared |
| the device's override | the reader's debug overlay (*Recognition*: Experience / Original / Prepared), stored on that device | overrides the experience's setting on this phone, for a comparison without publishing ([tracking](tracking.md) "Comparing Original and Prepared") |

The rule is one pure function (`engine/src/scene/recognition-mode.ts`): the device's override, else the experience's
setting; a target's frame is used only on the prepared path, only without `recognitionOff`, only when it has one. An
app of schema 4.1 (3.11.x – staging only) knows neither setting and uses a target's `recognition` wherever it is.

**Who makes the frames:**
- **The editor, by itself** – when a target gets a printed image (an upload or a Library pick in the Inspector, the
  Library's *Use as target image*, a new target, a new version of the image file) or is placed on a surface, and has no
  frame for its image yet: in the browser, uploaded as a Library file, stored with the target. It never blocks or fails
  the target's own change and never touches the printed image; an error shows quietly in the target's inspector, whose
  *make frame* / *remake* tries again. The inspector shows the frame as a small thumbnail.
- **`osct targets prepare`** – the batch tool for a whole experience (below).
- The frames are working copies: the release step (#304) may re-encode them like every other asset, as long as the
  tracker can still decode the format. The format they are made as is one constant (`RECOGNITION_FRAME_FILE`,
  `engine/src/scene/target-frame.ts`) for the editor and the CLI.

```bash
cd scripts && npm run build
OSCT_API_URL=http://127.0.0.1:8080/api OSCT_EDITOR_TOKEN=… npm run osct -- targets prepare --experience osct --dry-run
OSCT_EDITOR_TOKEN=… npm run osct -- targets prepare --experience osct      # makes the missing ones
OSCT_EDITOR_TOKEN=… npm run osct -- targets prepare --experience osct --force   # makes every one again
OSCT_EDITOR_TOKEN=… npm run osct -- targets prepare --experience osct --all     # switched-off targets too
```

- Reads the experience through the editor API (`OSCT_API_URL`, default the local dev API; `OSCT_EDITOR_TOKEN` – a token
  from the editor's experiences page, AI connections) and writes its draft: the readers get it with the next publish.
- `--dry-run` lists what it would make and changes nothing (read-only calls).
- The database is the only truth (#322): the API drops a target's `recognition` whenever its image changes – a new
  `imageSrc`, or a new version of the image's Library file – so a stale frame is never used; the next run makes it
  again. A frame made from an image that changed during the run is refused (409 `stale-image`) and skipped.
- Switched-off targets are left out (an experience may hold many – staging: 1,236 of 1,368); `--all` prepares them
  too. A target switched on later gets its data with the next run.
- Not 8th Wall's image-target CLI (`@8thwall/image-target-cli`, MIT) itself: it only asks interactively, one image at a
  time, and its default crop keeps the centred 3:4 part of the image – the top and bottom of a tall page get lost and
  it is not recognised. Its output (a grey 480 × 640 image and the JSON `XrController.configure({ imageTargetData })`
  takes, flat `PLANAR`) is what this makes; cylinder and cone targets are not used.

The scenes next to the open one are kept ready too, so turning a page switches the scene at once.

## Onboarding screens

The onboarding is the app's, not the experience's (#236): the splash (Mark, then the experience's `title` and its printed
book's `author` and `publisher` from `experience.yaml` – none without `book:`), what the app does, the camera permission, then scan mode – the same for every experience. Its
order, illustrations, buttons and timing are in `client/src/utils/onboarding.ts`, its texts in the app's translations
(the `tutorial` namespace, every language – docs/i18n.md), where `{{title}}`, `{{author}}` and `{{publisher}}` are the
book's. A content source has no `steps/` folder: the build does not read one and warns while one is left.

The configuration still carries a `tutorial` – the app's English steps (`shared/compat/tutorial.ts`), written by the
content build and every editor publish – because apps of content schema 2.24 and before require it and show it. The
reader since 2.25 ignores it; it goes with the next schema MAJOR.

## Media

Recommendations – final numbers follow the device tests.

| Media | Format | Tips |
|---|---|---|
| **Target images** | JPG, the picture **as printed**, cropped to its edges | Recognition needs detail and contrast: textured, asymmetric images work best; large flat areas, repeating patterns and very dark images work poorly. ~1000 px on the long side is plenty. |
| **AR video** | MP4 (H.264) | Portrait or the target's aspect ratio, 720p is enough, short loops. It starts muted; keep files small – readers load them over mobile data. |
| **Subtitles** | WebVTT (`.vtt`), one per language | Beside the video, named like it: `speak.mp4` → `speak.en.vtt`, `speak.fr.vtt` ("Subtitles of a video" below). |
| **3D models** | GLB with embedded textures | All animations loop. Keep polygons modest (phones). The content build optimises every `.glb` automatically: textures down to max. 1024 px (opaque ones as JPEG), geometry compressed (meshopt) – your file in `content/` stays untouched. |
| **A model's texture set** | The model file with its smallest map, the same map as JPEG at 512 / 1024 / 2048 / 4096 px | `textures` on the model node ("A model's map by texture quality" below). The mesh loads once; the reader's texture quality chooses the map. These files stay exactly as you made them – the build does not shrink them. |
| **Entry images** | JPG / PNG / WebP | ~1200 px wide is enough. |

### The image rule

Every picture takes the same way into the experience (#298) – an upload in the editor, through the MCP server, a script, and
(behind a switch for now) the content build. The numbers live in one place, `shared/api/images.ts`:

| Use | Longest side | |
|---|---|---|
| A page image (#251) | 2048 px | shown over the whole page |
| An entry's colour picture | 2048 px | the card flip shows it full screen |
| A target's printed image | 1200 px | what the image tracker learns – more detail only costs memory |
| A model's map (its *textures*, #260) | 4096 px | the largest level keeps 4096 – the editor uploads maps with `fit=texture` |
| Every other Library picture | 2048 px | a sky, a picture on a node |

- **WebP**, quality 82; **lossless** when the picture has transparency (an icon, a cut-out).
- **Never scaled up**; a JPEG's **EXIF orientation** is applied; **metadata** (EXIF, XMP, ICC colour profiles) is dropped –
  export pictures in sRGB.
- A picture above **50 MP** is refused before it is decoded. **TIFF and PDF** are no Library files: convert them locally
  (Pillow / PyMuPDF) before uploading.
- **In the editor** the browser applies it before uploading ([editor](editor.md) "Library") – lossy WebP also for a
  transparent picture (a canvas cannot write lossless); the API's conversion is the fallback.
- **At upload** the API applies it ([server](server.md) "The image rule at upload"): the stored file is `<name>.webp`.
  The upload does not know the use, so it keeps 2048 px; where the use is known – the editor's target image field, the
  MCP server's `upload_asset fit: "target"` – a target's image is cut to 1200 px.
- **In the content build** (`scripts/src/lib/optimize-media.ts`) the default stays JPEG at 1200 px. `OSCT_IMAGE_FORMAT=webp`
  writes every image the configuration names as WebP at the sizes above (a target's `imageSrc` 1200 px, the rest
  2048 px) and renames it in the configuration (`target.jpg` → `target.webp`); images nobody names stay as they are.
  The default changes once the image targets (8th Wall) are checked with WebP targets on a phone.

### Subtitles of a video

A video that speaks carries its sound in the file. What it says can show as a line of text in the reader's language:
put a **WebVTT** file per language **beside the video, named like it** – `<video name>.<language>.vtt`:

```
entries/screen/
  screen.mp4
  screen.en.vtt
  screen.de.vtt
  screen.fr.vtt
  screen.nl.vtt
```

Nothing in the YAML names them: the content build pairs the files by their names and writes the list into the
configuration (`subtitles`, content schema 2.31), and the pairing holds wherever the video is used. The language is a
two- or three-letter code, with a region if needed (`pt-BR`). A subtitle file is plain text:

```
WEBVTT

00:00:00.500 --> 00:00:04.500
Hello. I am a video, standing on a sheet of paper.

00:00:04.800 --> 00:00:06.900
My sound is part of the file.
```

Each cue is a start and an end time (hours optional) and the text below it, cues apart by an empty line. The times are
the video's own – the app reads the video's time while it plays, so the line cannot drift from the sound. Positions,
styles and tags inside the text (`<i>`, `<v Mark>`) are left out; a cue over two lines shows as two lines.

The reader shows the line of the app's language over the scan view – without that language, the language's other
variant, then English, then the first there is. *Info → Settings → Subtitles* switches the line off; it is on by
default, since a video plays muted where the browser blocks sound. The build reports a `.vtt` file whose name fits no
video beside it (it is left out) and stops at one that is no WebVTT.

In the editor, upload the `.vtt` files to the Library (they are listed with the videos): a file belongs to every video
of its name, uploaded or imported, and replaces an imported file of the same language. The stage shows the English line
while the video plays. The demo's screen speaks this way (`fixtures/demo/entries/screen/`).

### Picture credits

The pictures in the book's margins are found images; their credit lines (*Book Golem by TER-JAN / DeviantArt*) are kept
**per file in the editor's Library** (#277 – one free text line, `docs/server.md` "Credits"), not in an entry. When the
editor's API assembles the experience (draft and publish) the configuration gets the lines of the files it uses anywhere – a
target image, an entry's picture, an entity's file – as `credits: { "<file path or URL>": "<line>" }` (content schema
2.33, #292); a credited file the experience does not use is left out. The reader lists them per scene (*Pages 2–3*, by page,
each line once per scene; a scene without printed numbers by its title) on its **Image credits** page, reached from
Info ("…in the margins of the book *here*"). An experience built from YAML has no credits – they live on the instance.

### A model's map by texture quality

A model can bring its colour map in several sizes; the reader's texture quality (Info page → Settings → *Model
detail*) chooses which one loads, and the mesh loads once (schema 2.27, #260). Put the model file – with its
**smallest** map inside – and the same map as JPEG at the other sizes next to the entry, and name them on the node:

```yaml
target:
  image: target.jpg
  entity:
    type: model
    src: face_mesh.glb          # the mesh, with the 512 map inside
    textures:
      512: face_512.jpg
      1024: face_1024.jpg
      2048: face_2048.jpg
      4096: face_4096.jpg
    params:
      rotation: [90, 0, 0]
      scale: 0.15
```

- Sizes: 512, 1024, 2048, 4096 – square maps, each size once; not every size has to be there. The app shows the
  largest one that is not above what the quality asks for, else the smallest there is.
- A model with a map per material names the material of each set:
  `textures: [{ material: LOW_left, sizes: { 512: left_512.jpg, … } }, { material: LOW_right, sizes: { … } }]`.
  Without `material` the set is the map of every material of the model.
- The build checks that the files exist and leaves them exactly as you made them. The Blender batch writes this set
  (`docs/characters.md`, "Texture sizes").
- *Automatic* chooses 512 on a data-saving or slow connection, 1024 on a phone with up to 4 GB of memory, else 2048;
  4096 only when the reader chooses *Best*.

### Pictures, videos and sounds in quality levels

A picture, a video or a sound can come in several qualities; the reader's media quality (Info page → Settings →
*Picture and video quality*) chooses which one loads (schema 4.3, #331). Name the levels on the node, next to its file,
and on an entry next to its picture:

```yaml
image: castle.webp            # the picture an older app shows – the middle level is a good choice
imageLevels:
  512: castle_512.webp
  1024: castle.webp
  2048: castle_2048.webp
target:
  image: target.jpg
  entity:
    type: video
    src: film_720.mp4          # what an older app loads
    levels:
      480: film_480.mp4
      720: film_720.mp4
      1080: film_1080.mp4
```

- The level is a number by kind: a **picture's longest side** (512, 1024, 2048 px), a **video's height** (480, 720,
  1080 – `p`), a **sound's bitrate** (64, 128, 192 kbps). Each level once; not every level has to be there. An entity's
  image, video and audio files take `levels` (on `src`, or on an item of `assets`), an entry's picture `imageLevels`.
- The node's own file (`src`, the entry's `image`) stays: it is what an app before 4.3 loads, and a medium without
  levels is one level.
- The app loads the largest level that is not above what the quality asks for, else the smallest there is. *Low*,
  *Medium* and *High* take the smallest, the middle and the largest level. *Automatic* takes the smallest on a
  data-saving or slow (2g / 3g) connection; otherwise a picture covers the screen's longest side in device pixels, a
  video the screen's shorter side (at most 720p on a phone with up to 4 GB), a sound the highest bitrate.
- A change applies at once: the scene's pictures swap in place, and a playing video or sound goes on at the same spot in
  the new quality, playing if it played (`AssetStore.refreshMedia`, 3.16.1).
- **Video levels are made before the upload** (ffmpeg, the release step #304 later) – the editor never encodes video.
  Picture levels can be computed in the editor's browser from the largest one ([editor](editor.md) "Media levels").
- The build checks the files and leaves them exactly as you made them – it does not shrink a picture level.

Allowed file types: `.jpg .jpeg .png .webp` (images), `.mp4 .webm .mov` (video), `.glb .gltf`
(models), `.mp3 .wav .ogg` (audio).

## App sounds

The app plays short sounds (and vibrates on Android) – they are app files, not content, in
`client/public/assets/sounds/`:

| File | When |
|---|---|
| `tick.wav` | Each notch of the page scroller – plays often, keep it tiny (~20 ms) |
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
scenes/scene1 has 11 targets, max is 10.
```

Then look at the result in the app – see the quick start in the [README](../README.md).

## Schema and app versions

The content schema (`CONTENT_SCHEMA_VERSION`, `shared/types/game-config.ts`) and the app version are separate
(`agents/RULES.md` #10): the schema says what an app can read, the app version says what was released. An app reads
every MINOR of its schema MAJOR and every older MAJOR down to `OLDEST_READABLE_SCHEMA_MAJOR` (3 since schema 3.0: no
reader of 2.x content was shipped, #319); content of a newer MAJOR, or of a MAJOR below that, is refused at startup.

**A MINOR never breaks an older app** (#220). An app reading an experience of a newer MINOR loads it without what it does not
know, and lists what it skipped (`getSkippedFeatures()`, `engine/src/content/forward-compatible.ts`):

- **Skipped** (dropped with a warning in the console): a component in a node's `components`, a filter in a video's
  `filters`, a pass in a `passes` list, a node's `material` – of a type that is neither built in nor recorded by a
  plugin of the experience; a behaviour action (a rule left without an action goes with it) and an unknown field of a
  behaviour, a rule or an action; a parameter a known spec does not have (a component's, a pass's, a filter's, a
  light's, a material's, a plugin node type's); a parameter of a plugin's recorded spec whose kind the app does not
  know (and the values set for it).
- **Kept and listed**: a node of a type nobody registered (it renders nothing, its children stay); a plugin built
  against a newer plugin API MINOR (what it uses of that MINOR does not work – a node type whose build calls it renders
  nothing).
- **Still refused**: a broken shape (a list that is not a list, an action with two verbs), a wrong type for a known
  field, a new value of a required field (a category, an asset type, a step action, a scene format) – these are a
  MAJOR's changes – and a newer MAJOR.

The reader then shows a quiet hint at a calm moment, once per experience version: *This book uses features this app version
doesn't know yet – update the app to see everything* (with *Reload* when a new version is ready). The editor shows the
list in its top bar ("N unknown features"). Content of the app's own or an older schema is read without skipping, and
the content build and the editor's API stay strict – an unknown type there is a typo and refused.

So a MINOR may add only what an older app can leave out, and its row says what an older app shows without it (*In an
older app*). Apps before the release of #220 (schema 2.21 and older) did not skip: their guard refused what it did not
know – the rows say where. This table names, per schema, the app version that first ships it. The last row is the
current schema (a test checks that it matches `CONTENT_SCHEMA_VERSION`, so a new schema needs its row).

| Schema | First app version | Status | What the schema adds | In an older app |
|---|---|---|---|---|
| 1.1 | 1.7.6 | released | content on the CDN | – |
| 1.2 | 1.7.10 | released | see `docs/CHANGELOG.md` 1.7.10 | – |
| 2.0 | 1.10.0 | released | the entity as a tree of nodes | refused (a new MAJOR: the node tree) |
| 2.1 | 1.10.0 | released | print placement of targets (`print`) | – |
| 2.2 | 1.10.0 | released | components (animation) | – |
| 2.3 | 1.10.0 | released | scene formats (cover, back) and the plugins list | – |
| 2.4 | 1.11.0 | released | plugins – the experience's own code, compiled by the content build (plugin API 1.0) | – |
| 2.5 | 1.12.0 | released | post-processing passes | – |
| 2.6 | 1.13.0 | released | light nodes: point, spot and directional lights as a node type | a 2.5 app refuses a light node |
| 2.7 | 1.15.0 | released | plugin API 1.1 (events, variables, progress, the scene – the version a declared plugin carries) | – |
| 2.8 | 1.17.0 | released | the experience's environment: the world and the onion sky | – |
| 2.9 | 1.20.7 | in develop | the grade's `reach` (`ar` / `all`); the guard ignores a pass parameter it does not know | a 2.8 app refuses the grade's `reach` |
| 2.10 | 1.21.0 | in develop | the environment's world model and sky image as asset references (`worldSrc`, `skySrc`) | – |
| 2.11 | 1.22.0 | in develop | the content manifest names its book (`latest.json` / `versions.json` `book`) | ignored |
| 2.12 | 1.27.0 | in develop | a node's optional `name` (the editor's tree shows it; the reader ignores it) | ignored |
| 2.13 | 1.32.0 | in develop | a plugin's node type (`registerNodeType`, plugin API 1.2): its parameters in the node's `params` | a 2.12 app renders nothing for the plugin's node and keeps its children |
| 2.14 | 1.34.0 | in develop | a plugin's recorded `registered` (the specs of its components, layers, node types and passes – the guard checks them) | ignored |
| 2.15 | 1.35.0 | in develop | a parameter spec's optional `label` (plugin API 1.3) – the editor's row; in the content only inside a plugin's recorded specs | ignored |
| 2.16 | 1.36.1 | in develop | nothing new in the content – shared/ imports its types type-only (`verbatimModuleSyntax`, #176) | – |
| 2.17 | 1.41.0 | in develop | a node's `material` (a plugin's `registerMaterial`), the parameter kind `texture`, a plugin's recorded `materials` and `textures` (plugin API 1.4, #188) | a 2.16 app refuses a recorded spec with a `texture` parameter |
| 2.18 | 1.49.0 | in develop | nothing new in the content – plugin API 1.5: `api.loadText`, a text file (a Library shader) by its URL (#186) | – |
| 2.19 | 1.50.0 | in develop | the built-in component `behaviour`: rules on events with conditions on variables and actions, no code (#88) | a 2.18 app refuses a node that carries a behaviour |
| 2.20 | 1.53.0 | in develop | nothing new in the content – plugin API 1.6: `api.feedback`, a GPU feedback buffer the engine steps every frame, and `api.shadertoy`, a Shadertoy pass as its fragment (#225) | a 2.19 app's engine has no `api.feedback`: a node type whose build calls it renders nothing |
| 2.21 | 1.54.0 | in develop | a `passes` entry may name a pass a plugin of the experience registers (`registerPass`), its parameters checked against the recorded spec (#216) | a 2.20 app refuses a book whose book or scene passes name a plugin's pass |
| 2.22 | 1.57.0 | in develop | a pass's optional `enabled` – `false` switches it off: it keeps its place and values, the chain skips it (#233) | skipped: a 1.55.0 app drops the unknown field with the update hint, an older one ignores it – either way it runs, and so shows, a pass that is off |
| 2.23 | 1.59.0 | in develop | no new field – an entry's `body` is Markdown (paragraphs, `*emphasis*`, `**strong**`, `[links](https://…)`) with the experience's variables in braces (`{hasKey}`, `{hasKey: …\|…}`, #223); plain text reads as before | the body as written: the stars, brackets and braces show as they are (`**strong**` stays `**strong**`, `{hasKey}` stays `{hasKey}`) – nothing breaks, nothing is skipped |
| 2.24 | 1.60.0 | in develop | nothing new in the content – `shared/` tidied: one `isObject`, one camelCase name pattern, unused `isComponentType` and `PlacementData` removed (#214) | nothing changes |
| 2.25 | 1.61.0 | in develop | the configuration's `tutorial` is optional: the reader's onboarding is its own (steps in code, texts in its translations, #236); the build and a publish still write the app's English steps for older apps (`shared/compat/tutorial.ts`) until the next MAJOR – and the experience's optional `sourceOfTruth` (`print` \| `digital`, #238: whether the editor adds and removes scenes) | nothing changes: it finds the `tutorial` it requires and shows those steps (in English, the experience's fields filled in); `sourceOfTruth` is ignored (the guard reads no unknown field of the book) |
| 2.26 | 1.64.0 | in develop | a target's optional `enabled` – `false` switches it off: the reader leaves the target and its entry out, the content and the editor keep both (#249) | ignored: a 2.25 app shows a switched-off target and its entry (the guard reads no unknown field of a target) |
| 2.27 | 1.66.0 | in develop | a model file's optional `textures` – its colour map in several sizes (512, 1024, 2048, 4096 px), one set for the whole model or one per material: the file carries the smallest map, the app loads the size the reader's texture quality asks for (#260) | ignored: a 2.26 app shows the model with the map in its file (it reads `src` and no unknown field of an asset) |
| 2.28 | 1.67.0 | in develop | the parameter kind `model` in a spec (a component's, a node type's, a material's, a pass's): a model file – a Library model's URL or a content path, a `.glb` / `.gltf` next to the node in the YAML – which the plugin's code loads with `api.loadModel` (plugin API 1.7, #263) | skipped: an app since 1.55.0 drops the parameter and its value with the update hint and runs the rest of the component; an older one refuses the recorded spec |
| 2.29 | 1.68.0 | in develop | the book's optional `appearance`: the look an entity appears with on `reveal` (the first find), `found` (every later find) and `lost` – a built-in look (`inflateDissolve`, `printLift`, `fade`) with its values, or one a plugin of the book registers (`registerAppearance`, plugin API 1.8), recorded in `registered.appearances` (#264) | ignored: an older app reads no `appearance` and plays its own animation at every moment; a plugin that registers a look calls a method an older engine does not have and is not loaded there |
| 2.30 | 1.71.0 | in develop | the built-in components `reveal`, `found` and `lost` on a node: its own look for a moment – `{ type: reveal, look, …the look's parameters }` – in place of the book's `appearance` (#268) | skipped: a 2.29 app drops the components with the update hint (an unknown component) and plays the book's look |
| 2.31 | 1.77.0 | in develop | the configuration's optional `subtitles`: the WebVTT files of a video, one per language – `[{ media, tracks: { en: …, fr: … } }]`, read from the files' names (`<video name>.<language>.vtt`) by the content build and the editor's API (#257) | ignored: an older app reads no `subtitles` and plays the video without a subtitle line |
| 2.32 | 1.80.0 | in develop | a scene's optional `matter` (`front` \| `back`): a double page without printed numbers before page 1 or after the last printed page, its pages internal (front matter below 0, #296) | ignored: an older app shows the scene like any other – in the page scroller with its internal numbers |
| 2.33 | 1.82.0 | in develop | the configuration's optional `credits` (file → credit line, #292): the picture credits of the files the book uses, from the editor's Library | ignored: an older app has no image credits page |
| 2.34 | 1.88.0 | in develop | an entry's optional `caption` (#289): the line under the entry's picture, written in the editor's entry form, `update_entry` / `add_entry` or the entry's YAML | ignored: an older app shows the picture without the line (the guard reads no unknown field of an entry) |
| 2.35 | 1.98.0 | in develop | scenes (#307 phase 1, [Scenes](#scenes-surfaces-labels-and-groups)): a scene's optional `surfaces` (`id`, `side`, `widthMm`, `heightMm`, `label` as printed), `layout` (`fixed` \| `free`), `group` and `label`; the configuration's optional `groups` (`id`, `label`); an entry's optional `scene` (a scene id – **it decides the entry's scene, not `page`**) and `surface`. The content build and the editor's draft write `scene` on every entry; `page` stays required and is still written | ignored: an older app reads none of the fields (its guard reads no unknown field of a scene, an entry or the configuration) and places every entry by its `page`, which writers keep inside the scene's pages; it shows page numbers where a 2.35 app shows surface labels |
| 2.36 | 1.112.0 | in develop | surfaces placed in the scene (#314): a surface's optional `place` (`x`, `y`, `z` in mm, `rx`, `ry`, `rz` in degrees – the scene's coordinate system: origin on the table at the middle of the first row, +x right, +y up, +z towards the reader; used by `free` scenes) and a target's optional `print.surfaceId` (the surface it is printed on, by id – wins over `print.surface`) | ignored: an older app reads neither field (its guard skips unknown fields of a surface and a print placement); the reader does not use them yet |
| 3.0 | 2.0.1 | in develop | **one clean model of scenes – nothing of 2.x kept** (#319, `agents/SCENES.md` "Schema 3.0"): the configuration's `scenes` (was `spreads`) and `initialScene` (was `initialSpreadId`); a scene is `id`, `label`, `group?`, `surfaces` (at least one: `id`, `label?`, `widthMm`, `heightMm`, `place` – all six numbers required), `passes?`; an entry names its `scene` (required) and a `surface` when the scene has several; a target's `place` (`surface?`, `x`, `y`, `width`, `height?`, mm on the surface) replaces `print`. Removed: `page`, `firstPage`, `lastPage`, a spread's `title`, `format`, `matter` and `layout`, a surface's `side`, `print`, the configuration's `tutorial` | refused: no 2.x reader was shipped – every app since reads 3.x only (`OLDEST_READABLE_SCHEMA_MAJOR` 3), and a 2.x app refuses 3.0 content |
| 4.0 | 3.0.0 | in develop | **the experience is the top level** (#320, `agents/REFACTOR-EXPERIENCE.md`): the configuration's `experience` (was `book`: `id`, `title`, `passes?`, `environment?`, `appearance?`); the printed book is its optional `book` (`author`, `publisher?` – they were on the top level), none = an experience that is not a book; `sourceOfTruth` is removed (every experience adds and removes its scenes); the behaviour and plugin variable scope `experience` (was `book`, plugin API 3.0) and the text nodes' `{{experience.title}}` (was `{{book.title}}`); `latest.json` / `versions.json` name the `experience` (was `book`). The content source: `experience.yaml` (was `experience.yaml`), converted once with `npm run convert:4` | refused: no 3.x reader was shipped – every app since reads 4.x only (`OLDEST_READABLE_SCHEMA_MAJOR` 4), and a 3.x app refuses 4.0 content |
| 4.1 | 3.11.0 | in develop | a target's optional `recognition` (#306): `{ imageSrc, width, height }` – its grey recognition frame made ahead with `osct targets prepare` and the printed image's size ("Recognition" above) | ignored: the app makes the frame from the target's image itself, as before |
| 4.2 | 3.12.0 | in develop | the switch between the recognition paths (#306, "Recognition" above): the experience's optional `recognition` (`"original"` – none, the default – or `"prepared"`; any other text reads as original) and a target's optional `recognitionOff` (`true`: always its printed image) | ignored: a 4.1 app (3.11.x) uses a target's `recognition` wherever it has one; an app before 4.1 makes every frame itself |
| 4.3 | 3.16.0 | in develop | media in quality levels (#331, "Pictures, videos and sounds in quality levels" above): an image, video or audio asset's optional `levels` and an entry's optional `imageLevels` – `[{ level, src }]`, a picture by its longest side (512 / 1024 / 2048), a video by its height (480 / 720 / 1080), a sound by kbps (64 / 128 / 192); the reader's media quality chooses | ignored: a 4.2 app loads the medium's own `src` / `image`, as before |
| 5.0 | 4.0.0 | in develop | **logic beyond the nodes** (#334, `agents/research/2026-11-20-logic-nodes-shared-concept.md` §5.4): a rule's `when` is an expression (`hasKey && tries > 2` – the language of the entries' `{…}` texts) – the object form (`{ hasKey: true }`, `{ any: … }`, `{ not: … }`) is removed; a scene's and the experience's optional `logic` (`{ rules, canvas? }`: rules in the behaviour's grammar that hear the bus and name nodes by address `target:<targetId>/<node name>`); the action `goto: scene:<id>` in every rule; a `set` value is an expression (a text value is the literal `"…"`); typed variables – the experience's optional `variables` (`{ name: { type, scope?, default? } }`), else inferred from the first set, a wrong type a problem and refused at runtime. The canvas is authoring data – never in a reader's configuration. A content source is converted once with `npm run convert:5`, the server's rows by `Migration5` (on the deploy's `Db::migrate`; a dry run: `php server/deploy/migrate.php --plan-5`) | refused: an app since 5.0 reads 5.x only (`OLDEST_READABLE_SCHEMA_MAJOR` 5); a 4.x app refuses 5.0 content – published 4.x versions must be published again after the migration |
| 5.1 | next | in develop | **ports from the specs** (#334 L-T6, plugin API 3.1, [plugins](plugins.md) "Typed specs and the Logic view"): a plugin's recorded spec (`registered` – components, node types, passes, materials, textures, looks) may carry `actions` (the rule verbs it answers: `play`, `pause`, `stop`, `show`, `hide`), `events` (the scene events it emits) and `uses` (`{ hears, emits, reads, sets }` of the bus and the variables); a number parameter `slider` (its soft range inside `min … max`) and `integer`; a logic canvas `exposed` (box id → port ids). The editor's Logic view draws a node's ports from the specs and prefers the declared uses over reading a plugin's code | ignored: a 5.0 app reads a recorded spec's kinds and parameters only (a whole-number or slider field is not checked there); a canvas never reaches a reader |

Several schema bumps may share one app version. Each bump gets its own row when it merges, and a rebase that meets
another bump takes the next free number. *released* = on production (`main`), *in develop* = on staging only.

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

### Importing a delivery

A publisher's delivery (folders of printed images, entry images and videos) goes into `content/` through a
**mapping file** in `scripts/import/` – one per delivery, e.g. `import/2110.yaml`. The mapping says, per entry id, what the entry is and which delivered file is what:

```yaml
entries:
  p38-1:
    category: glossary
    title: "p. 38 · 1"                # placeholder until the texts arrive
    page: 38
    target: glossary/P38_Print_01.jpg   # the image as printed → target.jpg
    image: glossary/P38_Online_01.jpg   # the entry image → image.jpg
    video: documentation/P38.mov        # AR video on the target → video.mp4 (optional)
    printed: { width: 44, height: 26, position: top left }   # mm – checked, not used (the places come from the layout)
    enabled: false                      # the target switched off: not in the reader's experience (optional)
    tags: [artwork]                     # the entry's tags (optional)
    note: "anything the editors should know"
```

```bash
cd scripts
npm run import -- "C:/path/to/delivery" import/2110.yaml
```

What it does: every image becomes a JPEG (targets ≤ 1600 px, entry images ≤ 1600 px, transparency flattened
on white), every video is re-encoded with ffmpeg (H.264 MP4, long side ≤ 1280 px, ~2 Mbit/s, AAC – ffmpeg
has to be installed), `entry.yaml` is written with placeholder texts and the note as a comment, and a scene
is created for every pair of facing pages that has an entry (`s38-39`, label "38–39", one surface twice the page's
width – page 1 and a last even page one page wide). The mapping's `page` is mapped to the scene **once, here**: the
entry gets `scene: s38-39`, never a page (content schema 3.0). Ids have no leading zeros (#63): scenes `s38-39`, `s1`,
entries `p38-1` – a mapping key written with them (`p038-1`) is imported without; the order is the scene's `order`, never
its id. The database's existing ids were renamed once (3.10.0, applied on staging 2026-11-20; the tool is gone since 3.11.1). Media is rewritten
when the delivered file is newer; **`entry.yaml` and `scene.yaml` are never overwritten** – edit them
freely and run the import again when the next delivery comes. Problems (a file missing, ffmpeg failing, a
video without a target) are listed at the end.

The mapping of a delivery is made by hand or with a script (matching the delivered images against the trigger
layout PDF by page and appearance). Files the delivery contains but the book does not place are listed in a comment
at the top of the mapping.

`fixtures/content/` is the test fixture – placeholder content slimmed down
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
npm run layout -- --triggers "C:/path/All_Triggers.pdf" --preview "C:/path/OSCT_preview.pdf" --content "$OSCT_CONTENT_DIR" \n  --mapping scripts/import/<delivery>.yaml   # the targets' pages (content schema 3.0 has none)
```

`scripts/layout/extract-layout.py` (Python 3 with PyMuPDF – an external tool like ffmpeg) renders every sheet
to `<content>/layout/sheets/*.jpg` (1200 px wide) and, next to each, a much sharper `<sheet>@sharp.jpg` (`--sharp-width`, 4096 px for a double page, 0 = none; the editor fetches it only when the camera is close to the page) and writes `<content>/layout/layout.json`: the page format in mm,
the sheets (kind `scene`, `cover-front`, `cover-back`, front and back matter; their book pages read from the page
numbers printed at the foot), and per target its page, surface (`left` / `right`), `x`, `y`, `width`, `height` in
mm from the page's top left corner. Trigger images are matched to the targets of their page (the entry's `page`)
by the aspect ratio of the target image, then by reading order; pages where the counts differ are listed. The content build copies `layout/` with the rest of
the content; the folder is generated. Run it again when the PDFs change, then rebuild the content (`layout/` is part of
the content, so new page images make a new build).

### Placing the targets from the layout

Since the content schema 3.0 the stage reads a target's `place` and a surface's reference image (#314) from the book on
the instance, not `layout/`. `scripts/layout/place-targets.py` (#321, Python 3 with Pillow) carries `layout/` over
through the editor API:

```bash
python scripts/layout/place-targets.py --layout "$OSCT_CONTENT_DIR/layout" --api https://osct.porschuetz.de/api \
  --experience osct --token-from-mcp osct-staging --out <report folder>     # dry run: changes nothing
python scripts/layout/place-targets.py … --apply                       # writes the places and the references
```

It maps every sheet to a scene (a numbered sheet to the scene whose label names its pages, `4–5`; the unnumbered
covers and matter between two numbered sheets to the unnumbered scenes there, in order), turns each target's box from
mm on its page into mm on its scene's surface (`TargetPlace`: a right page's target moves by the left page's width on a
double-page surface) and renders each surface's reference from its sheet's sharpest image (cut to the surface where it
is one half of the sheet, WebP, at most 2048 px – the API's own limit for a reference). The dry run writes
`report.md` / `report.json` (the mapping, the places per scene – enabled and switched-off targets apart –, the targets
it cannot map and why, the references), the reference images and contact sheets (the sheet with the computed boxes).
`--apply` sends `PUT …/targets/{id} { place }`, and per surface `POST …/assets?fit=reference&scene=…&surface=…` then
`PUT …/scenes/{id}/surfaces/{sid}/reference { url }` – as the editor does. A target with another place and a surface
with a reference are left alone and reported, unless `--replace-places` / `--replace-references`; a run again finds
everything `same`. `--pdf <book.pdf>` (PyMuPDF) cross-checks the places against the PDF's image boxes and renders the
sheets that have no sharp image. Auth: `OSCT_EDITOR_TOKEN`, or `--token-from-mcp <server>` (that MCP server's env in
`~/.claude.json`); the token is never printed.

### Importing the final print PDFs

When the book has gone to the printer (#248), its final PDFs are the delivery: the **print PDF** (one page per book
page, with bleed), the **preview** of every sheet (as above) and **trigger PDFs** of the same sheets, one per kind of
target – each printed trigger as an image where it is printed:

```bash
cd scripts
npm run prepare-delivery -- --print "C:/path/OSCT_INSIDE_256p.pdf" --preview "C:/path/OSCT_FULL_preview_spreads.pdf" \
  --triggers active="C:/path/OSCT_TRIGGERS_ACTIVE.pdf" --triggers inactive="C:/path/OSCT_TRIGGERS_INACTIVE.pdf" \
  --triggers artwork="C:/path/OSCT_TRIGGERS_KevinWORKS.pdf" --content "$OSCT_CONTENT_DIR" \
  --delivery "C:/path/delivery" --mapping import/<name>.yaml
npm run import -- "C:/path/delivery" import/<name>.yaml
```

`scripts/layout/prepare-delivery.py` (PyMuPDF and Pillow) reads every trigger's page and box from its sheet (the
trigger PDFs carry no page numbers: the sheets are counted from page 1's sheet; covers, end papers and the title
sheet are left out – the book keeps its own) and cuts its image from the print PDF's page, at the resolution of the
picture printed there (at least `--min-dpi`, at most `--max-size` px on the long side) – the target is what the camera
sees on paper. A trigger that shows a current target's image on the same double page (a perceptual hash, else an
overlapping box in the layout) keeps that target's id, so the import replaces its image and keeps its entry; every
other trigger becomes a new entry `p<page>-<n>`. The kind decides the rest: `active` = a target in the book,
`inactive` = a target switched off (`enabled: false`, #249), `artwork` = switched off and its entry tagged `artwork`.
It writes the mapping, the cut images, the layout (the page previews rendered from the print PDF, the other sheets as
they were, every target's box by id) and a report (`report.json` – re-importing the editor's draft over the new build
takes its URLs back to `/assets/content/…` paths first, `agents/RULES.md` #36: per trigger its kind, box, the printed picture's
resolution and the cut's pixels; the current targets no trigger shows). The import then writes the entries as usual –
an existing `entry.yaml` stays as it is. Entries the delivery makes obsolete are named with `--retire p2-1,p30-2`:
they are never matched (their triggers become new entries, their ids stay taken) – delete their folders before the
import.

The page previews follow the image source's resolution, and so do the cuts: a picture printed at 300 ppi gives a 30 mm
target about 350 px. For targets of 1000 px the book's pictures need an export without downsampling (about 1200 ppi
for the smallest printed triggers); the script takes whatever resolution the PDF holds. `--print` takes either the
print PDF (one page per book page, with bleed) or such an export of the preview's sheets
(`OSCT_FULL_preview_spreads_HIGHRES.pdf`: the same sheets as the trigger PDFs, cut by sheet; `--last-page` when the
highest page number printed on the preview is not the book's last page).

### Videos

The imported entry videos (`entries/<id>/video.mp4` in the content source) are large and reach the servers through
the CDN sync: `osct content sync` uploads whatever the local content build holds, videos included
([content on the CDN](content-cdn.md); #15). A build on a machine without them prints a warning per missing video and
builds those targets without their AR video.

### What it writes

| Where | What |
|---|---|
| `client/src/game.config.json` | Everything the app needs to know about the experience (not in git) |
| `client/public/assets/content/` | The content media, optimised, and every plugin's compiled `plugin.js` next to its source (not in git) |

### Folders

```
scripts/
├── src/            everything in TypeScript, bundled into dist/ by `npm run build`
│   ├── index.ts            the content build: start
│   ├── config.ts           all folders and limits
│   ├── build/              content build parts: experience, scenes, entities, entries, targets, plugins
│   ├── lib/                shared helpers: reading content, files, hash, checks, media, storage, sync
│   ├── cli.ts              the osct CLI: content build | status | sync | purge (content-cdn.md)
│   ├── import-delivery.ts  `npm run import` – a publisher delivery into the content (mapping in import/)
│   ├── schema-lock.ts      `npm run schema:lock` – locks shared/ to the content schema
│   └── sounds.ts           placeholder app sounds
├── import/                 one mapping file per delivery
└── test/                   tests (npm test)
```

The shape of `game.config.json` is defined in `shared/types/game-config.ts`.
