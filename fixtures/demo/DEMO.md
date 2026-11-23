# The demo – a sandbox, not the book

`fixtures/demo/` is the **demo** (`demo`, *The Demo Book*): every node type, placement, filter and component the content model has,
twenty plugins that use every part of the plugin API (node types of their own among them, `sparkle`, `aquarium` and `inkPainting`, and two
post-processing passes, `filmGrain` and `scanLines`), and a
narrative across its scenes – a key tapped on one page opens a door on another, a lamp lights when the door opened, a tally counts the pages found, a tap switches a scene.

**Where it lives** (#322 decision (b), as in SCUTOONS): the demo is the staging database's experience `demo`, edited in
the staging editor and published with its Publish button. This folder is its **export** (`osct content export
--experience demo --from draft`, `EXPORT.md` says from which build) – do not edit the YAML by hand, change the demo in the
editor and export it again. An export writes no YAML comments, so what each part shows is written down here; this file
is carried over by every export. CI only builds the folder (`.github/workflows/demo.yml`), it does not sync it.

**The scenes**: *Cover* (the seal), *1–2 The key* (the key, the aquarium, the tally, about the demo), *3–4 The door*
(the door and the lamp), *5–6 The switch* (the switch, the speaking screen, the ink painting, a link), *7–8 The twins*
(two targets sharing the entity `beacon` with its `sparkle` node), *9–10 Mark the Page* (Kévin's rig: the paper baked
frame by frame from Blender, its clip `speak` playing while the page is found), *11–12* (empty, a page to try things
on), *Back cover* (the colophon), and the *Cat Pope poster (SCUTOONS test)* on an A3 surface – the poster's figures
lift off the print and float in front of it as cut-outs, each with the shadow of its own outline on the paper
(`plugins/cutout-shadow`, the shared entity `catpope-overlay`).

**The plugins added in the editor**: `contact-shadow` (a soft shadow under a node, after drei's ContactShadows),
`cutout-shadow` (`cutout` and `cutoutShadow` for flat pictures floating over their page), `hover` (a node bobs and drifts
like a hoverboard), `toon` (two flat tones and a drawn outline – the Cat Pope test), `my-model-look` and
`my-sparkle-look` (made with *make material code* from a model's and a sparkle's look – the key wears `myModelLook`),
and `lifts` (the looks `fadeCode` and `printLiftCode`, the experience's *found* and *lost* next to `reveal`'s
`revealCode`).

**The behaviour** (#88): the key and the door carry `behaviour` rules – no code. The key's rule (*on tap*) plays the
model's clip `rattle`, sets `hasKey` in the experience scope and emits `keyRattled`; the door's rules show its `hint` child
when the page is found and, found with `hasKey`, hide it and emit `openDoor` – which the `door` component of
`plugins/narrative` listens to lift and turn the door (what a rule cannot do). The Inspector edits the rules, the scene's
timeline in it marks each rule that ran.

**The aquarium** (page 2, *The key*'s right page, above the tally – #188): the entry `aquarium` with a target of its own
(`entries/aquarium/target.jpg`, drawn for the demo), whose AR content is a group holding the plugin node `aquarium` – a
glass tank with a sandy floor, water and five fish (`plugins/aquarium`, `registerNodeType`). The tank carries the
plugin's material `water` (`registerMaterial`: a ShaderMaterial with waves on its surface and a tint that deepens with
the angle), its floor shows the procedural texture `caustics` (`registerTexture`). A shader study (#202): a plastic toy
fish dips into the water on a loop, a tap pushes it in once; the tank simulates its surface as a heightfield (a damped
wave equation on a 64-cell grid, on the CPU), the toy displaces its volume, rings run outward and settle, the water shader
and the floor's caustics follow them (docs/plugins.md "A shader study"). Where the browser has WebGPU (#228) the water is
a particle fluid instead – Splash's MLS-MPM simulation and screen-space renderer, adapted into the plugin, drawn from the
scene's camera into a canvas the water material samples in screen space; the toy pushes the particles aside, and the
heightfield stays as the fallback (docs/plugins.md "A WebGPU fluid inside a WebGL scene"). In the editor the Inspector
shows *node type · aquarium* (the toy, loop, dip, simulation, grid, damping and splash among its rows, then *WebGPU ok* or
*no WebGPU*, particles, render scale and fluid colour) and *material · water* with their rows; **make it code** on any
node writes a node type of its own into the Code tab.

**Splash**, the fluid in `plugins/aquarium/index.ts` (its WGSL shaders and the passes that drive them, adapted: the
tank as the domain, the scene's camera, the toy as a body, alpha over the scene), is by Masaya Matsuoka (matsuoka-601),
https://github.com/matsuoka-601/Splash, under the MIT licence:

> MIT License
>
> Copyright (c) 2025 matsuoka-601
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The adapted part adds 43 KB to the plugin's bundle (72 KB, 20 KB gzipped).

**The speaking screen** (page 6, *The switch* – #257): the screen's video carries its own sound – four spoken lines –
and has subtitles: `screen.en.vtt`, `screen.de.vtt`, `screen.fr.vtt` and `screen.nl.vtt` lie beside `screen.mp4` and
belong to it by their names (`<video name>.<language>.vtt`); nothing in `entry.yaml` names them. While the video plays,
the reader shows the line of its own language over the scan view (Info → Settings switches subtitles off), the editor's
stage the English one. The video and the four files are written by `editor/tools/narration-video.mjs`: Windows' speech
synthesis reads the lines, the picture is a row of bars that follow the loudness, and the cue times are the times the
lines were laid at.

**The ink painting** (page 6, *The switch*'s right page, under the screen – #225): the entry `ink-painting` with a target
of its own (`entries/ink-painting/target.jpg`: a frame of the same simulation in a drawn frame), whose AR content is a
group holding the plugin node `inkPainting` (`plugins/fluid`) – a framed canvas standing on the page whose ink keeps
flowing: a 2D fluid simulated on the GPU every frame by two feedback buffers of plugin API 1.6 (`api.feedback`), the
passes of a Shadertoy shader pasted in nearly unchanged through `api.shadertoy` (docs/plugins.md "A feedback buffer"). A
tap stirs the ink where it lands. The Inspector shows *node type · inkPainting* with *resolution* (256, 512), *pen speed*
and *ink dissipation*.

**The film grain** (pages 7–8, *The twins* – #216): the scene's `passes` name `filmGrain`, a post-processing pass of the
the experience's own (`plugins/grain`, `registerPass`): every pixel a little lighter or darker, changing 24 times a second, over the
whole picture – the camera picture included (`reach: all`). In the editor the scene's *post-processing* section shows it
as *filmGrain* of the plugin *grain* with its rows (strength, size, speed, reach, pattern – a Library picture instead of
the noise), and
offers it under *add pass · grain* on every other scene. *The twins* carries no other effect, so the grain is all there is.

**The scan lines** (pages 5–6, *The switch* – #216, #233): the scene's `passes` name `scanLines`, a second pass of the
the experience's own (`plugins/scanlines`, `registerPass`): dark horizontal lines across the picture like an old screen, scrolling
slowly down. It is there **switched off** (`enabled: false`), to be discovered: the scene's *post-processing* section
shows *scanLines* of the plugin *scanlines*, closed, with its toggle off and its rows inside (line spacing – set to 4 px –,
strength, scroll speed, reach: `all` over the camera picture too, `ar` the AR layer alone); the toggle in its head
switches the lines on, on the stage at once, without opening the section. Off, the stage and the reader skip it and the
phone budget does not count it.

**Credits**: "XlsBDf" by trapcode (https://www.shadertoy.com/view/XlsBDf), CC BY-NC-SA 3.0; simplex noise from
https://www.shadertoy.com/view/XsX3zB. The page names no licence of its own, so Shadertoy's default applies – Creative
Commons Attribution-NonCommercial-ShareAlike 3.0 Unported (https://creativecommons.org/licenses/by-nc-sa/3.0/). The
plugin's adapted shaders (`plugins/fluid/index.ts`, its changes marked `demo:`) and the target picture made from them are
under CC BY-NC-SA 3.0 as well (share-alike): credit trapcode, no commercial use. If the demo or a recording of it is used
for promotion, re-check the NC clause first.

**The zero plane** (#189): every model stands on its page – its lowest point at the target's `z = 0`. The beacon's model
has its origin in its middle (lifted by its lower half, `position: [0, 0, 0.9973]`), the door's floor sat 0.0188 above
its origin (`z -0.0103`), the standing videos (lamp, screen) are lifted by half their plane's height, the sparkle's ball
rests on the page. The content build warns when a model floats or sinks; the demo's test names the models that still do
in the exported content (#322): the Cat Pope figures (they float on purpose), the key (lifted by `z 0.1627`) and the mark
(its baked frames dip just below the page).
Build it with `OSCT_CONTENT_DIR=fixtures/demo`, import it into the editor (docs/editor.md "Try it"), read it in
docs/plugins.md and `agents/research/2026-10-30-demo-book.md`. Most assets are the test fixture's small stand-ins (a
"door" that is a stack of boxes): the demo shows mechanics, not art. The **key** is its own: a 7 KB brass key with one
animation clip, `rattle`, which its behaviour plays on a tap (the `animation` component says how: once) – written by `editor/tools/key-model.mjs`
(`node editor/tools/key-model.mjs` writes it; a changed key is uploaded in the editor and the demo exported again – the export holds it as the build optimised it).

In the editor, the **Log** and **Variables** tabs drive the narrative by hand: the Log's **tap** taps a found target without
aiming at it (the key rattles and is taken, the switch changes its scene), the Variables tab's variables are editable and **set** adds
one through the plugin API (`hasKey` true in the experience scope, then the door's page switched off and on, opens the door
without the key's page), and the Log's timeline lists every event with the time since the scene opened.

Next to it, `fixtures/content/` stays the **test fixture** – the tests and CI build that one. The demo is free to
change with every idea.

This file marks the demo: the content build copies it into the build output, and `osct content sync` refuses a build
with it for production.
