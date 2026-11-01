# Image tracking: spreads, preloading, the trigger trial, load test

How the 8th Wall engine (`@8thwall/engine`, `engine/src/scene/tracker.ts` + `xr8.ts`, used by the reader) gets the
targets it can find, how a spread switch works, and how to measure how many targets a phone can hold. Without a camera
and engine – the editor's stage with the mock tracker – see [Editor](editor.md).

## The flow today

1. **Current spread** – `ArScene.changeSpread()` swaps anchors, entities and assets (it waits for the new spread's
   models and videos), then `ImageTracker.loadTargets()` makes the spread's targets the ones reported to the app.
2. **Window** – once the spread is tracked, `ArScene` gives the tracker the other spreads, nearest first
   (`prepared-spreads.ts` – the engine extracts in the order its queue gets them). **Fixed** (±1 by default; ±0 / ±2 / all in the debug overlay, or the load test's target
   budget): `prepareTargets()` holds exactly that window and **slides** with the current spread – spreads that fall
   out of it are unloaded (their files stay in the browser cache). **Grow** (debug overlay; the default from 1.7.0
   to 1.8.1, see issue #38): `growTargets()` adds them in idle time, three targets per batch, each batch after the
   previous one is extracted, until the whole book is held; a switch only re-orders what is still to add, nothing is
   dropped. The bridge preloads the content of the ±n window
   (±1 in grow mode; `PreloaderService.preloadSpreads()`: target images, then one spread at a time).
3. **Preparing** (the app, main thread) – each target image becomes a grey 480×640 frame (`makeImageTarget()`,
   `xr8.ts`): decode, draw, greyscale, JPEG. S22: 150–260 ms per image, cached per session.
4. **Extracting** (the engine, main thread) – `XrController.configure()` unloads what is not listed, keeps what it
   has and extracts the new targets one per animation frame. Every configure **cancels and restarts** the queue of
   targets not yet extracted. `reality.imagescanning` fires when the queue is empty. S22: 0.6–0.75 s for 4 targets,
   ~3 s for 39.
5. **Automatic switch** – a target of a held (not current) spread seen for 400 ms while none of the current
   spread's is found → `spreadSeen` → `switchSpread()` (scan mode only). Only held spreads can switch by themselves;
   any other page needs the spread menu.

Measured on a Samsung S22: switch to a held spread 0–5 ms, to a spread not held ~0.6 s, first spread
~1.15 s. With all 39 demo targets held, far jumps switched by themselves and nothing felt slower – not measured
side by side.

### What the trial content changes

| | |
|---|---|
| Spreads | 87 |
| Targets | 131 |
| Spreads with 0 / 1 / 2 / 3 / 4 targets | 3 / 43 / 36 / 4 / 1 |

With mostly one or two targets per spread, ±1 holds about 3 spreads and 4–5 targets: only the next and the previous
spread can be found without the menu. ±2 holds about 5 spreads and 7–8 targets. "All" holds 131 targets, which
costs about 131 × (prepare + extract) on the main thread at the start – tens of seconds of busy main thread on a
phone, while the reader is already scanning.

## What the app gives the engine

The engine knows no build, page or storage of the app (RULES #32): the app passes them in.

| What | How | The reader | The editor |
|---|---|---|---|
| Where the 8th Wall engine's files are served | `new ImageTracker(container, options, xr8Base)`, `prefetchXr8(xr8Base)` (`xr8.ts`) | `${BASE_URL}assets/xr8/` (`components/ar-bridges/ar/index.ts`) | – (mock tracker) |
| Debug handles on `window` | `ArSceneOptions.debug` (the look-around's `osctLookAroundDebug`) | `import.meta.env.DEV` | `import.meta.env.DEV` |
| The scanning indicator | the scene's `scanning` event: true while tracking runs and no target is found | `<ar-bridge>` toggles `.hidden` on `#osct-scanning` (and hides it when it is removed) | – (no indicator) |
| The switches stored on this device: lens, resolution, ask zoom, spreads kept ready | `setDeviceStorage()` (`engine/src/utils/device-storage.ts`; keys `camera-lens`, `camera-resolution`, `camera-ask-zoom`, `ar-prepared-spreads`); without one they hold while the page lives | `LocalDeviceStorage` (`services/DeviceStorage.ts`): localStorage as `osct-<key>`, set first thing in `main.ts` | `deviceStorage` (`lib/storage.ts`): the same `osct-<key>` on the same origin, set by the stage |
| Why AR failed | the `status` event's `ArError`: `{ code, message }` | below | the stage shows the message |

**AR errors** are codes (`ErrorCode`, `engine/src/types/errors.ts`), never matched in a message: the tracker and the
scene throw `ArSceneError` with its code, and anything else that breaks a start counts as a failed start.

| Code | When | The reader |
|---|---|---|
| `camera-not-responding` | the camera started but sends no picture within 10 s | the camera overlay's *not responding* (reload / restart the browser), cleared once AR runs again |
| `ar-start-failed` | the camera is denied or unavailable, the tracking engine could not be loaded | checks the camera permission again – the overlay shows denied / unavailable |
| `ar-load-failed` | the AR chunk (three.js and the scene) could not be loaded – offline, or a deploy removed it under the open page | the same, and online the new-version notice offers a reload ([Deploy](deploy.md) "Open readers after a deploy"); the next scan tries the chunk again |
| `ar-failed` | anything else the scene could not do (building a spread) | the same |

The message goes to the console and to the debug overlay ("AR: error", the camera panel).

## Seeing what the engine holds

Debug overlay, expanded, under *Spreads loaded ahead*:

```
Engine: 5/5 targets ready in 3 spreads
◉ s010-011 (2) · s012-013 (2) · s008-009 (1)
preparing: s014-015
```

◉ is the current spread. "extracting n s" (orange) while the engine works through new targets. The collapsed line
shows `E<ready>/<held>`.

### A page is not found although its targets are held

The expanded overlay (tap the line) shows under *Engine sees* every target the engine finds right now, of any held
spread, and under *Last auto switch* the spread it switched to by itself, the target that caused it and how long ago
(since 1.9.5 the collapsed line is one line only: the status dot, `T<targets on the spread>`, `E<ready>/<held>`).
With the phone on the page that is not found:

- **Ids of other spreads appear, or a recent auto switch** – the engine finds *other* triggers in view (neighbours on a printout sheet) and may switch
  the spread away. Cover the neighbouring images: if the page is found now, the crowd is the cause, not the count.
- **Engine sees nothing**, neighbours covered – the engine finds nothing. Tap *Change* until ±0 (applies at once, the
  engine then holds only this spread): found now → too many held targets dilute the engine's matching for this
  image. Tap *Change* back to *grow* afterwards (it re-grows in idle time).
- Empty even at ±0 → the target image itself (crop, contrast, size) – the trial's "not found" list.

The trial panel (debug overlay → *trial*) set ±0 itself while open from 1.7.8 to 1.9.0, so during a trial every miss was
already the last case.

## Camera: lens, focus, resolution

The 8th Wall engine opens the camera itself and asks for exactly 960 × 720 first. On Samsung phones (and any Android
browser whose user agent names no maker – Chrome's reduced user agent) it picks the main back lens by the label
`camera2 0, facing back`. Chromium now labels the lenses `camera 0, facing back`, so that choice fails and the browser
picks a back lens itself – on the Galaxy S22 the **ultra-wide**, which has a fixed focus (camera test 2026-10-28,
`docs/trigger-tests/2026-10-28-camera.md`).

What the app sets (`engine/src/utils/camera-request.ts`; the tracker wraps `getUserMedia` while the engine starts):

- **Lens** (Android only): the engine's request for "the back camera" gets the device id of `camera 0, facing back`
  (old or new label) – camera id 0 is Android's main back lens. Labels are listed only once the camera is allowed;
  without them the camera is opened once briefly to list them. On iOS and desktops the request stays as it is.
- **Focus**: continuous focus once the camera runs, where the camera offers it and does not use it already
  (`applyCameraDefaults()`). Chrome reports focus distance 0 while focusing continuously.
- **Tap to focus** (everyone): a tap on the camera picture that is not on app UI and hits no AR entity (the AR scene's
  tap handling decides – an entity still opens its entry) runs `focusAtTap()`: one focus run (`single-shot`), at the
  tapped point where the browser supports `pointsOfInterest`, then continuous focus again after `TAP_FOCUS_MS`
  (1.5 s); a newer tap takes over. Chrome on the S22 has no `pointsOfInterest` – the tap refocuses the whole picture.
  Safari reports no focus controls and ignores the tap.
- **Resolution**: the engine's 960 × 720. On the S22 1920 × 1440 found the smallest trigger later and held it less
  steadily, 1280 × 960 brought nothing – the engine works on its own reduced size.
- **Zoom**: none. The engine assumes the unzoomed field of view; while zoomed the AR overlay sits off.

**Browsers that cannot scan**: the engine's tracking WebAssembly needs WebAssembly SIMD (Safari from iOS 16.4;
iPhone 7, 6s and SE 1st generation end at iOS 15). The camera manager checks it before any camera request and sets
`CameraPermissionStatus.UNSUPPORTED`; the camera overlay asks to update iOS (if the phone can) or the browser.
Safari 15 reports no focus, focus distance or zoom for the camera at all. A SIMD-free engine build: proposal #39.

**Debug camera panel** (overlay → *camera*, `dev-tools/camera-panel.ts`; the readout in
`engine/src/utils/camera-debug.ts`): lens label, resolution and frame rate, focus mode (bold) / distance / range, zoom
and range, and the current spread's targets (yellow in view, ✓ found since the panel opened). While open the tracker
holds the current spread only, as in the trial. Why AR could not start shows here and after "AR: error" in the
overlay. Switches:

- **AF** – continuous focus (lit while it is in use). **◎** – the next tap on the camera picture focuses there once
  (`pointsOfInterest`, single-shot; taps on the debug UI do not count).
- **Zoom** 1× / 1.5× / 2× / 3× within the lens's range.
- On the next start (reload): **lens** `main` / `browser` (the old behaviour, to compare), **res** engine /
  1280 × 960 / 1920 × 1440 (`ideal`, so a camera without that size still opens), **ask zoom** (`zoom: true` – Chrome
  then asks for the pan-tilt-zoom permission).
- **Retest list**: a link `/?retest=p009-1,p013-1,…` (or `osct-camera-retest` in local storage) shows one chip per
  target – tap to go to its spread, ✓ once found.

The trial panel keeps its camera row (AF, ◎, zoom step); its `md` report records the camera.

## The trigger trial

The checklist for a test with the printed book (or the trigger printout) is in the app: debug overlay → **trial**
(dev server and staging; *trial* again or × closes it). A strip flush with the bottom of the screen shows every
target as a thumbnail in a fixed order – the order of the printout, with its running number (the same numbers as the
tester printouts of trial 2; targets not on the printout are dimmed, "not printed"). Nothing moves: a found one gets
a green frame and a ✓, the one in view a yellow frame, the current spread's a white frame, and the strip scrolls smoothly to
the current spread when it changes. While the trial is open the engine holds the current spread and its neighbours
(±1, no growing window), so scanning the next image on the sheet switches the spread by itself; closing restores
the window setting. Tap a thumbnail to go to its spread, ‹ › step through the spreads, drag the strip's top bar to
make it taller or lower. A camera line under the bar shows the lens, resolution, focus and zoom the trial runs with –
feedback only, the trial uses the app's camera defaults; the md report records it (the test switches are in the
debug overlay's camera panel, "Camera" above). The bar counts the targets not found yet. "Found" comes from the progress, so reset the progress
(debug overlay → progress) to start a trial over. **md** downloads the report – the targets not found with their
printed image, then the found ones – to forward to the designers. The runs so far, with their results per device, are in
[trigger-tests/](trigger-tests/README.md).

### The phone model in the report (#235)

Browsers no longer say which phone they run on – Safari 26 freezes its user agent (an
iPhone 12 mini and an iPhone 17 both report `iPhone OS 18_7 … Version/26.6.1`), Chrome on Android reduces it
(`Android 10; K`). So a device row under the bar asks for the phone model, and **md** stays dimmed until it is filled
in (tapping it then jumps to the field). The tester types the model or picks it from the *list* (iPhone 11 to 17
with mini / Plus / Pro / Max, SE, 16e and Air; Galaxy S21 to S25; Pixel 6 to 9); a second field takes optional
initials. Both are remembered on the device (`osct-trial-model`, `osct-trial-tester`). The field is prefilled where
the browser can tell:

- **Chromium (Android)**: `navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"])` gives the
  model code and the real Android version. A known Samsung code gets its name, the code stays
  (`Galaxy S22 (SM-S901B)`); Pixels report their name.
- **iPhone**: there is no model API, so the screen in points and its pixel ratio narrow the list – the matching
  models come first in *list* (375×812 @3 = 12 mini / 13 mini / X / XS / 11 Pro, 390×844 @3 = 12 / 13 / 14 /
  12 Pro / 13 Pro / 16e, 393×852 @3 = 14 Pro / 15 / 15 Pro / 16, 402×874 @3 = 16 Pro / 17 / 17 Pro, 440×956 @3 = 16
  Pro Max / 17 Pro Max …, `client/src/components/dev-tools/trial-device.ts`). The strip says it is a guess; the
  field stays empty until the tester picks or types the model. Display Zoom reports a smaller screen, which gets no
  guess.

The report's header then carries:

```
- Device: iPhone 12 mini (tester) · screen-size guess: iPhone 12 mini / 13 mini / X / XS / 11 Pro
- Screen: 375×812 @3
- OS: iOS 18.7 as Safari reports it – frozen: Safari 26 comes with iOS 26
- Language: fr-FR
- Tester: VB
- User agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) …
```

*Device* is the model as the tester entered it, then where the prefill came from (`from the browser: SM-S901B`, a
`screen-size guess`, or `no prefill`); *OS* is what the browser reports, with the real version where client hints
give it (`Android 14.0.0 (from the browser)`) and a note where Safari freezes it or Chrome reduces it; *Tester* only
when initials were given.

### The printed-image details

They come from the delivery mapping ([content](content.md) "Importing a delivery"):

```bash
cd scripts
npm run protocol -- import/<delivery>.yaml   # → client/public/trigger-protocol.json
```

Run it after an import (the file is committed and served at `/trigger-protocol.json`); the panel works without
it, then without file names and sizes.

## Load test

Debug overlay → **load** (dev server or staging, camera running, scan mode).

1. Hold the phone over a page of the printout that has a trigger; wait until it is found.
2. **Start**. Per step the window next to the scanned spread gets a target budget: 0, 5, 10, 20, 40, 80, then all
   other targets, nearest spreads first (next before previous). The whole app runs as usual: the window's content is
   preloaded, pages switch by themselves or by hand, and the window follows the scanned spread.
3. Per step: the window's new targets are prepared and extracted (timed), the engine settles 1 s, then measures
   (*hold*, 4 / 6 / 10 s) – keep the phone still on a page for comparable numbers.
4. With *covers* 2 or 3 the panel then asks to cover the lens with a hand and uncover it again; it times uncover →
   page found. The picture's brightness tells it when the lens is covered. *covers 0* runs without any tester action
   (no re-find times).
5. **Download .md** / **Copy** for the table. After the test the window is the ±n setting again.

| Column | Meaning |
|---|---|
| Targets held, Spreads | what the engine held at the end of the step (scanned spread + window) |
| Scanned | the spread being scanned at the end of the step |
| Prepare s / Extract s | app making the new image targets / engine extracting them (new targets of that step only) |
| Engine fps | camera frames the engine processed per second |
| Page fps, Stutter frames | page frames per second, frames over 50 ms |
| Found | share of engine frames with the page's target found while held still |
| Lost | times it was lost meanwhile (flicker) |
| Re-find ms | uncovered → found, median / max; Misses: not found within 10 s |
| Heap MB | JS heap (Chrome only; the engine's WebAssembly memory is not in it) |

What to look for: the step where engine fps or *Found* drops, *Lost* or re-find times rise, or *Stutter* appears.
The step before it is the budget a phone can hold. Run it on the slowest phone that has to work, and on a page with a
small target as well as a large one.

## Open decisions

- **How many targets the engine holds** – keep ±1, grow to the whole book, or a sliding target budget from the load
  test: open in #38.
- **Preloading in steps** – targets first, then their content, then higher resolutions (the quality levels): open in
  #13.
- The smaller options – one configure per switch, image targets made by the content build, larger tracked groups than a
  spread, a switch that does not wait for the new spread's videos – are open items in `agents/PLAN.md` (phase 13).
