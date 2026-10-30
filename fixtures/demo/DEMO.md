# The demo book – a sandbox, not the book

`fixtures/demo/` is the **demo book** (`demo`): every node type, placement, filter and component the content model has,
seven plugins that use every part of the plugin API (a node type of their own among them, `sparkle`), and a narrative
across its spreads – a key found on one page opens a door on another, a lamp lights when the door opened, a tally counts the pages found, a tap switches a scene.
Build it with `OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor (docs/editor.md "Try it"), read it in
docs/plugins.md and `agents/research/2026-10-30-demo-book.md`. The assets are the test fixture's small stand-ins (a
"key" that is a dragon, a "door" that is a stack of boxes): the demo shows mechanics, not art.

Next to it, `fixtures/content/` stays the **test fixture** – the tests and CI build that one. The demo is free to
change with every idea.

This file marks the demo: the content build copies it into the build output, and `osct content sync` uploads a build
with it only to the environment `demo` (never `staging` or `production`, whose current version is the book's).
