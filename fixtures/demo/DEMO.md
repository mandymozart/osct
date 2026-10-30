# The demo book – a sandbox, not the book

`fixtures/demo/` is the **demo book** (`demo`): every node type, placement, filter and component the content model has,
eight plugins that use every part of the plugin API (node types of their own among them, `sparkle` and `aquarium`), and a
narrative across its spreads – a key tapped on one page opens a door on another, a lamp lights when the door opened, a tally counts the pages found, a tap switches a scene.

**The behaviour** (#88): the key and the door carry `behaviour` rules – no code. The key's rule (*on tap*) plays the
model's clip `rattle`, sets `hasKey` in the book scope and emits `keyRattled`; the door's rules show its `hint` child
when the page is found and, found with `hasKey`, hide it and emit `openDoor` – which the `door` component of
`plugins/narrative` hears to lift and turn the door (what a rule cannot do). The Entity panel edits the rules, the Stage
panel's timeline marks each rule that ran.

**The aquarium** (page 2, *The key*'s right page, above the tally – #188): the entry `aquarium` with a target of its own
(`entries/aquarium/target.jpg`, drawn for the demo), whose AR content is a group holding the plugin node `aquarium` – a
glass tank with a sandy floor, water and five fish (`plugins/aquarium`, `registerNodeType`). The tank carries the
plugin's material `water` (`registerMaterial`: a ShaderMaterial with waves on its surface and a tint that deepens with
the angle), its floor shows the procedural texture `caustics` (`registerTexture`). In the editor the Entity panel shows
*node type · aquarium* and *material · water* with their rows; **make it code** on any node writes a node type of its own
into the Code tab.

**The zero plane** (#189): every model stands on its page – its lowest point at the target's `z = 0`. The beacon's model
has its origin in its middle (lifted by its lower half, `position: [0, 0, 0.9973]`), the door's floor sat 0.0188 above
its origin (`z -0.0103`), the standing videos (lamp, screen) are lifted by half their plane's height, the sparkle's ball
rests on the page. The content build warns when a model floats or sinks; a test keeps the demo free of such warnings.
Build it with `OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor (docs/editor.md "Try it"), read it in
docs/plugins.md and `agents/research/2026-10-30-demo-book.md`. Most assets are the test fixture's small stand-ins (a
"door" that is a stack of boxes): the demo shows mechanics, not art. The **key** is its own: a 7 KB brass key with one
animation clip, `rattle`, which its behaviour plays on a tap (the `animation` component says how: once) – written by `editor/tools/key-model.mjs`
(`node editor/tools/key-model.mjs` regenerates `entries/key/key.glb`; an editor test checks the file is the script's).

In the editor, the Stage panel's *vars and events* drives the narrative by hand: **tap** taps a found target without
aiming at it (the key rattles and is taken, the switch changes its scene), the variables are editable and **set** adds
one through the plugin API (`hasKey` true in the book scope, then the door's page switched off and on, opens the door
without the key's page), and the timeline lists every event with the time since the spread opened.

Next to it, `fixtures/content/` stays the **test fixture** – the tests and CI build that one. The demo is free to
change with every idea.

This file marks the demo: the content build copies it into the build output, and `osct content sync` uploads a build
with it only to the environment `demo` (never `staging` or `production`, whose current version is the book's).
