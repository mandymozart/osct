# Concept: mock stage – the AR scene over a simulated camera picture (#59)

2026-10-28, for Tilman's decision. Research only – no app code changed. Question (Tilman, #59): tuning an
entity or a filter today means holding the phone over the printed page while moving the tune panel's sliders.
A **preview** should run the same `ArScene` without camera and tracking: something stands in for the camera
picture, the target counts as found, the real entity (model, video, image, chroma key) appears over it,
unlock / reveal / outro and bloom included – on the desktop and on the phone (staging).

## Short answer

- **The seam holds.** `IImageTracker` (`ar/tracker-types.ts`) is all `ArScene` knows about the camera: a
  `MockTracker` that resolves `startCamera()` at once, remembers the spread's targets in `loadTargets()`, calls
  `onUpdate(targetId, matrix)` every frame and sets a field of view in `fit(camera)` needs **no change in
  `ArScene`, the entities, the animations or the tune panel**. Found / lost / unlock all happen as today,
  because the scene only sees matrices arriving and stopping.
- **The stage is the matrix.** In AR the three.js camera stays at the origin and every anchor's matrix is the
  page's pose relative to the camera (1 unit = target width, origin in the target's centre, `xr8.ts`). The mock
  tracker owns exactly that pose – "the page lies 35 cm in front of the camera, tilted 30°" – and reports it. The
  stage geometry (page plane with the target image, table top) gets the **same** matrix, so moving the view is
  changing one pose, and entity and page can never drift apart. Nothing new in the projection math.
- **Recommendation: sketch A (geometry stage) now, sketch B's photo as an optional backdrop later, sketch C
  (the real engine on a rendered picture – the 8th Wall simulator's way) not for #59.** A is a day of work, fully
  testable without a GPU (the matrices), and it answers the question that is asked: where does the entity sit,
  how big, how does the filter look, how do the animations read. B adds realism for the filters at the price of a
  per-photo fit; C tests tracking, which is not the question.

## What 8th Wall offered for desktop testing

8th Wall's **Simulator** (Cloud Editor / Studio, 2023; back in the open-source Desktop app of 2026) is not a
background picture behind the scene but **the real engine run on a canned camera**: about twenty pre-recorded video
sequences with embedded tracking metadata (places, people, hands, image targets, several camera moves per place),
plus the live webcam for fine adjustments. Image targets could only be tested with 8th Wall's own jellyfish
targets – "custom Image Targets cannot be simulated" (blog; forum 2024: "we don't have the ability to upload a
custom image target"); users asked for uploading their own stills or footage until 2025. Outside the simulator, the
documented way was the one we use: print the target or show it on a second monitor and point the webcam at it. The
two things worth taking: **(1) the scene code must not know it is being simulated** – the simulator fed the real
pipeline, our mock tracker feeds the real `ArScene`; **(2) a few canned camera moves beat free flight** – the
sequences were "panning", "walking around", "looking down", not a joystick. Hence the presets below. What we do
not take: feeding the engine (sketch C) – the engine is the part we want to leave out at the desk.

Sources: 8thwall.com/blog "Accelerate WebAR development with the all-new 8th Wall Simulator";
forum.8thwall.com/t/simulator-image-targets/648; 8thwall.org/docs/open-source; github.com/8thwall/8thwall.

## How it plugs in (all sketches)

```
 debug overlay ──[preview]──▶ <preview-panel> (bottom sheet, like tune / camera / trial)
                                  │ localStorage osct-preview (on/off, view preset, backdrop, wobble …)
                                  ▼
 ArScene.ensureView()  ──▶  tracker = previewOn ? new MockTracker(container, opts) : new ImageTracker(…)
                                  │ onUpdate(id, matrix) per frame · fit(camera): fov 60°, aspect
                                  ▼
 anchors ▸ entities ▸ celebration ▸ bloom ▸ tap → unchanged
 stage (page plane + table) = extra objects in the same scene, same matrix as the anchor, preview only
```

- The switch is read once when the view is built (a change restarts the scene: preview ⇄ camera, like the
  look-around options). Only `VITE_DEBUG` / dev builds read it; a production build never constructs the mock.
- `MockTracker` lives in `ar/mock-tracker.ts`, the stage in `ar/mock-stage.ts` (three.js stays in `ar/`, RULES #12);
  the flag and the panel's settings in a three-free `utils/preview.ts` (like `prepared-spreads.ts`), so the overlay
  and the panel never import the AR chunk (RULES #4).
- `cameraVideo` is `null` → the look-around's sky sample and the camera panel show nothing (fine for a preview;
  the camera panel says "preview – no camera").
- Found / lost: `onUpdate(id, matrix)` starts reporting → reveal (or unlock on the first find, the bridge decides
  by the progress) · `onUpdate(id, null)` → outro. So the panel's **found** toggle per target shows all three
  animations; "unlock again" = the overlay's reset progress for that target (one button in the panel).
- Several targets on a spread: the mock lays them out in a row on the page plane (gaps of half a target width,
  left to right in the spread's order) – we do not know the printed positions, and the row is enough to tune each
  entity. Each has its own found toggle; the tune panel's target select picks which one the sliders drive, as today.
- Jitter: an optional **wobble** (0 = still; 1 = the S22's typical hand shake: ±2 mm, ±0.5°, 1–3 Hz, smoothed) on
  top of the pose, deterministic from a seed in the tests – to see whether a filter edge or a thin model flickers.
- Phone: everything is touch (drag = orbit, pinch = zoom), the presets are buttons – the panel is a bottom sheet
  like the others. The desktop adds the wheel and keyboard arrows.

## Sketch A – geometry stage ("the table")

```
   ┌───────────────────────────────────────────────┐  ◀ transparent #scene canvas (unchanged)
   │ ░░░░░░░░░░░░░░ table top (wood/grey) ░░░░░░░░ │
   │ ░░░░░░┌────────────────┬────────────────┐░░░░ │  ◀ open book: two page planes, light paper
   │ ░░░░░░│                │   ┌────────┐   │░░░░ │
   │ ░░░░░░│  ┌─────────┐   │   │ target │   │░░░░ │  ◀ target images as textures, true aspect,
   │ ░░░░░░│  │ target  │╲  │   │   #2   │   │░░░░ │    1 unit = target width → the entity sits on
   │ ░░░░░░│  │   #1    │ ◆ │   └────────┘   │░░░░ │    it exactly as in AR (◆ = the entity)
   │ ░░░░░░│  └─────────┘   │                │░░░░ │
   │ ░░░░░░└────────────────┴────────────────┘░░░░ │
   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
   ├───────────────────────────────────────────────┤
   │ preview ▸ view: [reader] [top] [low] [far]    │  ◀ <preview-panel> (bottom sheet)
   │ found: ◉ p07-1  ○ p07-2     wobble ─●──── 0.4 │
   │ backdrop: [table] [paper] [photo…]  [unlock ↺]│
   └───────────────────────────────────────────────┘
   drag = orbit around the page · wheel / pinch = distance · arrows = pan · double tap = reader's view
```

- **Geometry**: a table plane (6 × 4 target widths, flat grey or a wood texture from `public/assets/dev/`), the
  open book as two paper planes (A4-ish proportions, the target's spread side marked), the target image on its
  page (`MeshBasicMaterial`, no lighting – a print is matte), a soft shadow under the book (a dark gradient
  plane). The scene's lights stay (the models were authored for them).
- **View presets** (the pose the mock reports; distance in target widths from the measured print – a 10 cm
  trigger at 35 cm = 3.5 widths): **reader** (35 cm, tilted 30° towards the reader, the default), **top** (straight
  down, 30 cm), **low** (15° above the table – shows how flat a video plane really is), **far** (70 cm – the
  entity as seen when the reader leans back). Drag orbits around the target's centre, wheel changes the
  distance, double tap returns to "reader". The current view is stored (`osct-preview`), so a reload keeps it.
- **Field of view**: 60° vertical (what the engine reports on the S22 at 960 × 720, within a few degrees) –
  one constant; the panel may later offer the iPhone's.
- **Tap**: a tap that does not drag hits the entity as today (`onTap` is unchanged) and opens its entry; a drag
  over more than 8 px is an orbit and no tap. `focusAtTap()` finds no camera track and does nothing.
- Pros: no photo to take, works for every target of every spread today, deterministic (tests), one pose for stage
  and entity, moving the view shows the parallax that decides whether a model "stands" on the page.
- Cons: the light is synthetic – a chroma key's fringe or a video's brightness on a real page is not what the
  table shows (sketch B covers that), and the stage adds a few hundred triangles (nothing).

## Sketch B – background photo ("the backdrop")

```
   ┌───────────────────────────────────────────────┐
   │  photo of the open book on Tilman's desk      │  ◀ CSS background of #scene-container, under the
   │        (one per spread, or one generic)       │    transparent canvas – zero three.js cost, the
   │              ┌──────────────┐                 │    8th Wall way "picture behind the scene"
   │              │  the printed │                 │
   │              │  target in   │ ◆               │  ◀ entity placed by a fitted matrix
   │              │  the photo   │                 │
   │              └──────────────┘                 │
   │   ┌ fit ┐  drag the 4 corners of the target   │  ◀ a one-time fit per photo + target: 4 corners →
   │   └─────┘  onto the print, then "lock"        │    pose (homography → rotation + translation)
   ├───────────────────────────────────────────────┤
   │ preview ▸ photo: [choose…] fit: [corners] [✓] │
   └───────────────────────────────────────────────┘
```

- The mock tracker reports a **fixed** matrix per target, fitted once: the user drags four corners onto the print
  in the photo; from the four points and the known target aspect the pose follows (a planar homography
  decomposed into rotation and translation – ~60 lines, no library; the camera's field of view has to be guessed
  or read from the photo's EXIF focal length). Stored per photo + target in `localStorage`.
- Pros: real paper, real light, real desk – the honest test for chroma keys, video brightness and the bloom over
  texture; and it is what Tilman remembered.
- Cons: a photo per spread (or a generic one where the target is pasted in – then the light is fake again), a fit
  per target (121 targets), no camera movement (one pose per photo – the parallax question stays unanswered), the
  fit's quality decides everything, and on the phone dragging corners precisely is fiddly. Three times the work
  of A for the fit alone.
- As an **add-on to A** it is cheap: a photo as the backdrop *behind* the geometry stage (the table plane hidden,
  the page plane kept so the entity still has its paper under it), without any fit – the entity floats over the
  photo at the preset pose. That gives most of the "real light" impression for a video or a chroma key at no
  cost, and is the version of B worth having.

## Sketch C – the real engine on a rendered picture (what the simulator did)

```
   geometry stage ──render──▶ offscreen canvas ──captureStream()──▶ getUserMedia (camera-request.ts
   (as in A, but as the          (2D canvas with the                already rewrites every request)
    "world")                      page drawn in perspective)                 │
                                                                     8th Wall engine tracks the drawn page
                                                                     → real found / lost / jitter / projection
```

- `camera-request.ts` already intercepts the engine's `getUserMedia`; handing it a `canvas.captureStream(30)`
  instead of a camera is a dozen lines. The hard part is the picture: it must be drawn by something other than
  the one WebGL renderer (RULES #4 – no second context), i.e. a 2D canvas, which has no perspective transform –
  the page would have to be drawn as an affine (sheared) image, or the three.js renderer renders the stage to a
  render target and copies it out every frame (a readback per frame – the thing we avoid on the phone).
- Pros: the engine's real behaviour (found delay, jitter, loss at steep angles, its projection); a trigger could be
  "tested" without printing.
- Cons: it answers a different question (tracking, #14 / #38), costs the engine's CPU on the desktop, and the
  trial content's real problems (print size, paper, light, focus) are exactly what a rendered page does not have –
  a target that tracks on a rendered picture may still fail on paper. Not for #59; if ever, as a load-test option.

## Comparison

| | A geometry stage | B photo backdrop | C engine on a rendered picture |
|---|---|---|---|
| Entity placement, size, animations | ✔ exact, movable view | ✔ one fixed view per photo | ✔ (as tracked) |
| Filters / chroma key against real light | ○ synthetic | ✔ | ○ synthetic |
| Works for every target today | ✔ | ✘ photo + fit per target | ✔ |
| Camera movement (parallax) | ✔ orbit, presets | ✘ | ✔ (by moving the stage) |
| Phone (staging) | ✔ touch | ○ fit is fiddly | ○ engine load |
| Tests without GPU | ✔ matrices, layout, wobble | ○ the fit math | ✘ |
| Effort | ~1 day | ~2–3 days (fit) | ~2 days, open questions |
| Changes outside `ar/` + dev-tools | none | none | camera-request.ts |

## Recommendation

Build **A**, with B's photo as a **fit-free backdrop option** in the same panel (a photo behind the stage, no
corner fit). C stays an idea in this note. Concretely for #59:

1. `ar/mock-tracker.ts` – `IImageTracker` without camera or engine: pose per target from the view (preset +
   orbit) and the row layout, wobble, found toggles, `fit()` with the fixed field of view; `onUpdate` per
   animation frame. Unit tests: the anchor convention (1 unit = width, centre, z out of the page), the presets'
   distances, the row layout for 1–3 targets, found → matrix / lost → null, deterministic wobble, `stop()` reports
   nothing more.
2. `ar/mock-stage.ts` – table, book, page planes with the target textures, shadow; follows the mock's pose;
   disposes its textures; drawn only in preview.
3. `utils/preview.ts` (three-free) – the flag and settings, `subscribePreview()`; `ArScene.ensureView()` picks the
   tracker; a change of the flag restarts the scene.
4. `dev-tools/preview-panel.ts` – bottom sheet: on/off, view presets, found per target, wobble, backdrop
   (table / paper / photo file), unlock again; the overlay gets a `preview` button next to `tune`, and the debug
   line shows `P` while the preview runs (the status dot would otherwise lie: "running" without a camera).
5. Docs: a section "Preview without a camera" in `docs/tracking.md`; `docs/CHANGELOG.md` MINOR bump; MEMORY note.

## Naming

**Preview** in the UI and the docs (the overlay button, the panel title "Preview – no camera", the `P` in the
debug line): it says what it is for. **Mock stage** in the code and the issue (`MockTracker`, `mock-stage.ts`):
it says what it is. Not "soundstage" (a film term nobody searches for) and not "simulator" (that is 8th Wall's
engine-on-video, sketch C).

## Open for Tilman

- A, A + backdrop, or B with the corner fit?
- The reader's view numbers: 35 cm and 30° are my guess at how the phone is held over the book – measure once?
- Should the preview be reachable on staging for the designers (it is, with the debug bar) or stay a desk tool?
