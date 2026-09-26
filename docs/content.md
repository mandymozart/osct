# Content guide

How the book's content is organised for the app – for artists, designers and editors.
Everything the app shows comes from the `content/` folder: small text files (YAML) plus the media
next to them. No code is involved.

## The idea in five words

| Word | Meaning |
|---|---|
| **Spread** | Two facing pages of the book. The reader picks the spread they are looking at in the menu at the bottom of the app. |
| **Target** | An image printed in the book that the camera recognises. Max **5 targets per spread**. |
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
│       ├── spread.yaml           title and pages of the spread
│       └── spread1.mind          recognition data of the spread's targets (generated, see below)
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
Example with all parameters: `content/entries/edge/entry.yaml`.

**A 3D model on a printed image:**

```yaml
target:
  image: images-102.jpg
  entity:
    type: model
    src: tree.glb
```

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

**Several targets on the same page:** add `order` to the targets (0, 1, 2 …) to fix their order.
It only matters for the recognition data (see "Recognition data" below).

**AR content used by several entries:** put it in `content/entities/<id>/entity.yaml` and refer to
it with `ref`:

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
mind: spread1.mind        # recognition data, see below
```

Spreads may not overlap. Every entry's `page` must fall inside a spread.

## Recognition data (.mind files)

The camera recognises targets with a `.mind` file per spread, made from the spread's target images
with the free [MindAR compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile). **The order
of the images matters.**

1. Run the content build (see [Content build](content-build.md)). It puts each spread's target
   images into `mind-ar/<spread>/`, numbered in the right order (`0-…`, `1-…`, …).
2. Open the MindAR compiler, add the images of one spread **in that numbered order**, compile and
   download.
3. Save the file as `content/spreads/<spread>/<name>.mind` (the name in `mind:`) and run the build
   again.

Whenever a target is added, removed, replaced or reordered on a spread, recompile that spread.

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
| **3D models** | GLB with embedded textures | The first animation loops. Keep polygons and textures modest (phones). |
| **Entry images** | JPG / PNG / WebP | ~1200 px wide is enough. |

Allowed file types: `.jpg .jpeg .png .webp` (images), `.mp4 .webm .mov` (video), `.glb .gltf`
(models), `.mp3 .wav .ogg` (audio).

## Checking your work

Run the content build (or ask a developer to). It checks every file and stops with a clear
message when something is wrong, e.g.:

```
entries/old-castle: file "images-022.jpg" not found in content/entries/old-castle/
entries/ancient-tree: Field 'category' in entry must be one of: glossary, video, text, link
spreads/spread1 has 6 targets, max is 5.
```

Then look at the result in the app – see the quick start in the [README](../README.md).
