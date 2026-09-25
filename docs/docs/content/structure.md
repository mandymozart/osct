# Content structure

All book content lives in `content/` as YAML files plus media. **The folder name is the id.** The
[content build](/docs/content/configuration) validates everything and writes the app's
`game.config.json`.

```
content/
├── book.yaml                     # the book
├── spreads/<id>/                 # one per spread (two pages) = one MindAR target group
│   ├── spread.yaml
│   └── <id>.mind                 # compiled MindAR targets of this spread
├── entries/<id>/                 # one per entry (glossary, video, text, link)
│   ├── entry.yaml
│   └── images, videos, models    # referenced by relative path
├── entities/<id>/                # AR content shared by several entries (optional)
│   ├── entity.yaml
│   └── assets
└── steps/<id>/step.yaml          # onboarding / tutorial steps
```

## book.yaml

```yaml
id: osct
title: Onion Skin & Crocodile Tears
author: Kévin Bray
```

## spreads/&lt;id&gt;/spread.yaml

```yaml
title: The Beginning
order: 0            # position in the spread menu
firstPage: 1
lastPage: 2
mind: spread1.mind  # compiled targets, see "Compiling .mind files"
```

Max **5 image targets per spread** – the build fails above that.

## entries/&lt;id&gt;/entry.yaml

Every entry belongs to the spread that contains its `page` (the access page).

| Field | Required | |
|---|---|---|
| `category` | yes | `glossary`, `video`, `text` or `link` (singular – the list shows "Videos", …) |
| `title` | yes | |
| `page` | yes | access page in the book |
| `body` | no | text; blank lines separate paragraphs |
| `author` | no | shown for texts |
| `image` | no | image file in the entry folder (glossary) |
| `media` | no | URL for links (YouTube / Vimeo play embedded, other pages in a frame) |
| `tags` | no | list |
| `target` | no | the image in the book that unlocks the entry and shows AR content |

Entries without a `target` have no image to scan (e.g. glossary terms that only exist in
consultation).

```yaml
category: video
title: Video Example
page: 4
body: A demonstration of video content in AR.
target:
  image: images-007.jpg     # the tracked image (file in the entry folder)
  order: 3                  # order among targets on the same page (default 0)
  entity:                   # AR content shown on the image – inline …
    type: video
    src: bunny.mp4
```

```yaml
target:
  image: images-022.jpg
  entity:
    ref: castle             # … or a shared entity from content/entities/castle
```

`target.id` defaults to the entry id.

### Entity types

| `type` | Content |
|---|---|
| `model` | glTF / GLB (embedded textures; the first animation loops) |
| `video` | MP4 / WebM; autoplays while the image is tracked |
| `image` | JPG / PNG / WebP |

Transparent AR video: give a video entity a key color that becomes transparent (no alpha channel
needed in the file). Neon green is the safest key.

```yaml
entity:
  type: video
  src: clip.mp4
  params:
    chromaKey: { color: "#00ff00", similarity: 0.3, smoothness: 0.08, spill: 0.1 }  # only color required
```

## entities/&lt;id&gt;/entity.yaml

```yaml
type: model
assets:
  - src: castle.glb
params: {}                  # optional, passed to the entity
```

## steps/&lt;id&gt;/step.yaml

Onboarding steps, ordered by `index`. All fields but `index` are optional.

```yaml
index: 3
description: |-
  To scan the book and display interactive content, this application requires access to your camera.
button: Grant access
action: camera              # next (default) | camera | scan
illustration: /assets/illustrations/tutorial-step-2.svg
# title, footer, fadeIn (ms), advance (ms – advance automatically)
```

## Compiling .mind files

MindAR finds targets by their index in the compiled `.mind` file, so the order matters:

1. Run the content build. It copies each spread's target images to
   `mind-ar/<spread>/<index>-<file>` in the order the app expects (page → `target.order` → id).
2. Compile the images of one spread **in that order** with the
   [MindAR image target compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile).
3. Save the result as `content/spreads/<id>/<mind>` and run the content build again.

Adding, removing or reordering targets of a spread means recompiling its `.mind` file.
