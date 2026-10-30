# The demo book – a sandbox, not the book

`fixtures/demo/` is the **demo book** (`demo`): every node type, placement, filter and component the content model has,
seven plugins that use every part of the plugin API (a node type of their own among them, `sparkle`), and a narrative
across its spreads – a key found on one page opens a door on another, a lamp lights when the door opened, a tally counts the pages found, a tap switches a scene, a tap rattles the key.
Build it with `OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor (docs/editor.md "Try it"), read it in
docs/plugins.md and `agents/research/2026-10-30-demo-book.md`. Most assets are the test fixture's small stand-ins (a
"door" that is a stack of boxes): the demo shows mechanics, not art. The **key** is its own: a 7 KB brass key with one
animation clip, `rattle`, which the `animation` component plays on a tap – written by `editor/tools/key-model.mjs`
(`node editor/tools/key-model.mjs` regenerates `entries/key/key.glb`; an editor test checks the file is the script's).

In the editor, the Stage panel's *vars and events* drives the narrative by hand: **tap** taps a found target without
aiming at it (the key rattles, the switch changes its scene), the variables are editable and **set** adds one through
the plugin API (`hasKey` true in the book scope opens the door without the key's page), and the timeline lists every
event with the time since the spread opened.

Next to it, `fixtures/content/` stays the **test fixture** – the tests and CI build that one. The demo is free to
change with every idea.

This file marks the demo: the content build copies it into the build output, and `osct content sync` uploads a build
with it only to the environment `demo` (never `staging` or `production`, whose current version is the book's).
