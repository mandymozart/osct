# Look-around: scene around the book + onion sky

Two optional effects in scan mode, **off by default** – readers turn them on in Info → Settings (Graphics):

- **Scene around the book** – once a page is found, a world surrounds the reader. It is placed where the book was
  seen and turns with the phone (gyroscope). The book and the table stay visible; the world is open above.
- **Onion sky** – looking up, sky-like parts of the camera picture show the world's sky; buildings, trees and people
  stay real.

The built-in world is an alien café drawn in the shader; a book can bring its own world and sky as files.

**The book's environment** (content schema 2.8, `environment` in `book.yaml`, `shared/types/environment.ts`): `world`
(`cafe` – the only built-in one) and `onionSky` (on/off); since 2.9 `worldSrc` (a glTF model – the scenery) and
`skySrc` (an equirectangular image – the sky), see the [content guide](content.md) "Environment" for their conventions.
The sky image replaces the café's sky, the model the café's scenery; while they load, or when one fails (logged), the
café's part is drawn. The reader's switches apply on top (`effectiveGraphics` in `look-around.ts`): either can turn a
part off, the content cannot turn on what the reader has off – and the files are only fetched once a switch is on. A
book without an `environment` keeps today's look. Not yet in the content: per-spread overrides, tuning values. The
editor edits it on the stage, in the workspace's Environment tab ([editor](editor.md)), which previews this very pass.

## How it works

- **Rotation only (3DoF).** The 8th Wall engine the app uses (MIT) tracks images, not the room. The phone's
  gyroscope tells which way the camera points; walking does not move through the world.
- **The book anchors the world.** While a page is tracked, its direction in the world sets the world's front and a
  soft window around the book. Every new find corrects the gyroscope's drift. 45 s without a page and the world fades.
- **One full-screen pass** under the AR scene: per pixel the view direction is computed, the world's colour is
  looked up for it, and an alpha decides how much of the camera picture it covers (window, floor, open roof, sky).
  No 3D scene per frame: the sky image is sampled by direction, and a world model is rendered **once** when it loads
  into a cube (1024 px a face, from the reader's eye 1.6 m above its origin, lit by a sky light, a sun and the sky
  image) that the pass looks up the same way – the reader stands still in the world (3DoF), so the cube is all of it.
  The model's animations do not play.
- **Sky test** on a 160 px copy of the camera picture (every other frame): clear blue, or bright neutral grey
  (warm façades are excluded), and smooth.

## Code

`client/src/components/ar-bridges/ar/look-around/`

| File | |
|---|---|
| `look-around.ts` | `LookAround` – options, fade, per-frame update, drawing; tuning values `DEFAULT_LOOK_AROUND` |
| `book-anchor.ts` | Where the book is in the world, the world's turn, the window size |
| `orientation.ts` | Gyroscope → camera orientation; iOS motion permission on the first tap |
| `sky-sample.ts` | Small copy of the camera picture for the sky test |
| `shader.ts` | The pass: `SKY_KEY`, `CAFE_WORLD` (`cafeSky`, `cafeScenery`), `WORLD` (`worldColour(dir)`: the sky image or the café's sky, the model's cube or the café's scenery), `COMPOSITE` |
| `environment-assets.ts` | The book's sky image and world model: loaded when something is drawn, the model baked into a cube (`bakeWorld`), a newer environment wins |

Wiring: `ArScene` creates it and hands it to `ArView` as the `underlay` (drawn before the scene while `active`);
`ImageTracker.cameraVideo` is the engine's camera video. Options: `services/GraphicsService.ts`, section
`components/settings/settings-graphics.ts`.

**The world's frame:** `dir` in `worldColour(dir)` is y up, −z towards the book, the reader at the origin. A sky
image's centre lies on −z, its top edge straight up; a world model's origin is the floor under the reader.

## Trying it

- On the phone: turn both on in Info → Settings. Tuning without a rebuild over USB debugging:
  `window.osctLookAround` (e.g. `worldOpacity`, `skyStrength`, `forgetAfter`, `windowMargin`, `floorClear`).
- Desktop (dev build, no gyroscope or book): `osctLookAroundDebug.seeBook()` places a book ahead and below,
  `osctLookAroundDebug.look(alpha, beta, gamma)` tilts the view (degrees, as the phone reports them).

## Limits

- No walking through the world (no world tracking – the engines compared are in `agents/research/`).
- The gyroscope drifts slowly; it is corrected only when a page is found again.
- The sky test is colour-based: white walls or ceilings may count as sky when looking up; skies at dusk may not.
