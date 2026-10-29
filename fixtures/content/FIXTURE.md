# Test fixture – not the book

A slim copy of the placeholder content (every entity type, chroma key and alpha video, all spreads) with small
images, short low-resolution videos and one stand-in model. CI and the tests build it
(`OSCT_CONTENT_DIR=fixtures/content`). The book content is not in this repository (docs/content-cdn.md).

Two **studio spreads** are the showcase for the editor and the tests – everything the content model has today on
two double pages: `studio-a` (pages 28–29: models rotated, scaled and lifted off the page – *Studio: tall tree* with
a point light under the model that moves with it (schema 3.0) – an image entity with a non-uniform scale, a shared
entity with its own placement, and *Studio: tree of nodes* – a group with a model, a text and an orange spot light
aimed at the tree as children, content schema 2.0 / 3.0); the spread `cover` (format `cover`, page 0) with *Cover:
seal*, a target on the front cover with its printed place (schema 2.3) and `studio-b` (pages 30–31: a luma key, a
chroma key with every parameter set, an alpha video, a video standing upright **tinted by the fixture's plugin**
(schema 2.4), the shared entity again). Open them in the editor: `/editor/studio-a`, `/editor/studio-b`. A third
studio – events and variables between entities – is written as the acceptance scenario for content schema 2.0
(`agents/research/2026-10-28-entity-components.md`, "Studio C").

The fixture has one **plugin**, `plugins/tint/index.ts` – the template for a book's own code (docs/content.md
"Plugins"): a material layer the content build type-checks and bundles, used by *Studio: standing video* as
`components: [{ type: tint, … }]`.

This file marks the fixture: the content build copies it into the build output, and `osct content sync` refuses a
build that contains it, so the fixture never reaches the CDN.
