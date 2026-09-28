# Look-around: scene around the book + onion sky

Two optional effects in scan mode, **off by default** – readers turn them on in Info → Settings (Graphics):

- **Scene around the book** – once a page is found, a world surrounds the reader. It is placed where the book was
  seen and turns with the phone (gyroscope). The book and the table stay visible; the world is open above.
- **Onion sky** – looking up, sky-like parts of the camera picture show the world's sky; buildings, trees and people
  stay real.

Today the world is a **placeholder** (an alien café drawn in the shader). The real world comes with the content
(PLAN Phase 10 / 14).

## How it works

- **Rotation only (3DoF).** The 8th Wall engine the app uses (MIT) tracks images, not the room. The phone's
  gyroscope tells which way the camera points; walking does not move through the world.
- **The book anchors the world.** While a page is tracked, its direction in the world sets the world's front and a
  soft window around the book. Every new find corrects the gyroscope's drift. 45 s without a page and the world fades.
- **One full-screen pass** under the AR scene: per pixel the view direction is computed, the world's colour is
  looked up for it, and an alpha decides how much of the camera picture it covers (window, floor, open roof, sky).
  No 3D scene, no render target, no assets.
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
| `shader.ts` | The pass: `SKY_KEY`, `PLACEHOLDER_WORLD` (`worldColour(dir)`), `COMPOSITE` |

Wiring: `ArScene` creates it and hands it to `ArView` as the `underlay` (drawn before the scene while `active`);
`ImageTracker.cameraVideo` is the engine's camera video. Options: `services/GraphicsService.ts`, section
`components/settings/settings-graphics.ts`.

**Replacing the placeholder:** swap the `PLACEHOLDER_WORLD` block for a `worldColour(dir)` that samples the content's
world – e.g. an equirectangular image by `dir` (one texture lookup). `dir` is in the world's frame: y up, −z towards
the book, reader at the origin.

## Trying it

- On the phone: turn both on in Info → Settings. Tuning without a rebuild over USB debugging:
  `window.osctLookAround` (e.g. `worldOpacity`, `skyStrength`, `forgetAfter`, `windowMargin`, `floorClear`).
- Desktop (dev build, no gyroscope or book): `osctLookAroundDebug.seeBook()` places a book ahead and below,
  `osctLookAroundDebug.look(alpha, beta, gamma)` tilts the view (degrees, as the phone reports them).

## Limits

- No walking through the world (no world tracking – see MEMORY 2026-09-28 for the engines compared).
- The gyroscope drifts slowly; it is corrected only when a page is found again.
- The sky test is colour-based: white walls or ceilings may count as sky when looking up; skies at dusk may not.
