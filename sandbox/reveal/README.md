# Reveal sandbox

A dev-only page to tune how an AR entity appears and disappears – the engine's own animation and a set of other
concepts – on a real model, under the reader's conditions. No part of the reader's or the editor's build (#261).

## Run

From the repository root (after `npm ci` in `client/`):

```bash
node client/node_modules/vite/bin/vite.js --config sandbox/reveal/vite.config.mjs
```

Then open http://localhost:5180. On a phone in the same Wi-Fi: the "Network" address vite prints (or
`adb reverse tcp:5180 tcp:5180` and `localhost:5180`) – the stage fills the screen, **Controls** opens the panel.

Models are not in git (RULES #8): put `.glb` files into `sandbox/reveal/models/` (ignored; another folder with
`OSCT_SANDBOX_MODELS=<path>`), or drop a `.glb` on the page.

## What is the reader's, what is simulated

| The same as in the reader | Simulated |
|---|---|
| three.js (the client's install) and the engine's sources (`@engine`) | No camera, no tracker: the page's pose comes from an orbit (drag turns and tilts, wheel / pinch changes the distance, **Hand shake** moves it like a hand) |
| `ArView`: the renderer (antialias, alpha, pixel ratio ≤ 2), the lights, the gold bloom added over the picture | The camera picture: a background colour and a paper sheet with a stand-in print (the backdrop layer) |
| The asset store's loader and the `model` entity builder (clone, animation mixer) | The field of view: fixed (60° by default, as the editor's stage) instead of the phone camera's own |
| Placement by `params` (`placeEntity`) on an anchor group whose matrix is the target's pose, camera at the origin | |
| **As shipped**: the engine's `celebrate` – `found` and `lost` – handed the look the panel holds | |

A new model is placed once by the sandbox: standing on the page (the engine's default rotation, or none for a model
authored in the page's axes – whichever puts its base on the page), one target width large. **Placement** shows the
values as the content would carry them; **Engine default** is `rotation: [90, 0, 0]`, `scale: 0.5`.

## Concepts

**As shipped** plays the engine's code with a look as a book names it (`shared/types/appearance.ts`): *Look* picks a
built-in one – `inflateDissolve` (the default), `printLift`, `fade` – and takes its values, the controls change them,
and **Values** shows the look as it goes into a book's `appearance`. *Look* also offers `softFade`, a plugin's look
(`src/demo-plugin.ts`, registered through the engine's plugin API): its code plays in the built-in look's place, with
the panel's two durations. Every other concept is a starting point of the sandbox's own animation
(`src/reveal.ts`) – one shader injection with three parts, each with its own share of the time and easing:

- **Shape** (per vertex): the height along an axis from *Height from* to 1 – 0 = flat on the page, the *inflate* –,
  scale, spin, lift; *Stagger* delays it per vertex by a pattern, so it becomes a wave.
- **Mask** (per fragment): a front moves through a pattern – noise, rising from the page, from the centre, across the
  page, or a screen dither – with a glowing edge and a glow behind it.
- **Surface**: a tint that fades away, an opacity fade.
- Sparks and bloom on top.

| Concept | What it is |
|---|---|
| Inflate | Flat on the page → its height (the page normal 0 → 1) |
| Inflate, overshoot | The same, a little too tall before it settles |
| Inflate wave | Inflates from the centre outwards |
| Print lifts off | A pale print on the paper lifts off and takes its colours |
| Inflate + dissolve | Flat and small on the page, it rises, grows and turns half around under the noise dissolve with a gold edge and sparks – the engine's default look (#262) |
| Rising line | A glowing line climbs from the page |
| From the centre | Scenes from the middle of the page |
| Dissolve | The shipped reveal's look with every value open |
| Dither fade | A fade without transparency |
| Fade | Fades in, fades out |
| Pop | Scale with an overshoot and a fade |
| Gold inflate | A first-find candidate: line, sparks and bloom over the inflate |

## Tuning

- **Found** / **Lost** play the appear and the disappear animation (Space toggles); the disappear is the appear rewound,
  then the entity hides, as in the reader. **Loop** alternates them.
- The **scrubber** holds a frame: values then change that frame live. Without scrubbing, a change plays the animation
  again (**Replay on change**).
- Speed 1× – 0.1×. As in the engine, a step is at most one 30 fps frame.
- Colours: a picker plus the reader's gold palette (`--gold-1` … `--gold-4`), white and black.
- **Values**: the concept's values as JSON – **Copy** to hand them back, paste and **Apply pasted** to take some.
  Everything is kept in this browser (`localStorage`), per concept; **Reset concept** returns to the starting values.

## Limits

- The shape is applied before skinning: a skinned model inflates in its bind pose. Fine for a look; the engine needs
  the scale on the entity's object instead.
- Normals are not corrected while the mesh is flat – a lit model shades as if it had its height (an unlit one, like the
  Blender characters, is not affected).
- The engine's sparks size themselves by the window's height: in the phone-shaped viewport they are a little larger
  than on a phone.
- A fade is real transparency: a model shows through itself a little while it fades (the dither fade does not).

## From the sandbox into the engine

A built-in look names and measures its values as the sandbox does, so a concept's values are a look's parameters as
they are – for the parts the engine has: the shape (height, scale, spin; from its base along the page normal, no
stagger), the `noise` mask with edge and glow, tint, fade, sparks, bloom. `inflateDissolve`, `printLift` and `fade`
came this way (#262); a book sets a look per moment in its `appearance` (#264, docs/content.md). A concept that needs more (another pattern, a stagger, an overshoot) is a follow-up issue: that
part of `src/reveal.ts` moves into `engine/src/scene/celebration.ts`, with tests there.
