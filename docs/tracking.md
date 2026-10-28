# Image tracking: spreads, preloading, load test

How the 8th Wall engine (`@8thwall/engine`, `client/src/components/ar-bridges/ar/`) gets the targets it can find,
how a spread switch works, and how to measure how many targets a phone can hold.

## The flow today

1. **Current spread** – `ArScene.changeSpread()` swaps anchors, entities and assets (it waits for the new spread's
   models and videos), then `ImageTracker.loadTargets()` makes the spread's targets the ones reported to the app.
2. **Window** – once the spread is tracked, `ArScene` gives the tracker the other spreads, nearest first
   (`prepared-spreads.ts`). **Grow** (default since 1.7.0): `growTargets()` adds them in idle time, three targets per
   batch, each batch after the previous one is extracted, until the whole book is held; a switch only re-orders what
   is still to add, nothing is dropped. **Fixed** (±0 / ±1 / ±2 / all in the debug overlay, or the load test's target
   budget): `prepareTargets()` holds exactly that window and **slides** with the current spread – spreads that fall
   out of it are unloaded (their files stay in the browser cache). The bridge preloads the content of the ±n window
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

The collapsed overlay line shows `S[…]`: every target the engine finds right now, of any held spread (current
spread green, others orange), and `↪<spread>` for 10 s after an automatic switch. With the phone on the page that is
not found:

- **Orange ids or ↪ appear** – the engine finds *other* triggers in view (neighbours on a printout sheet) and may switch
  the spread away. Cover the neighbouring images: if the page is found now, the crowd is the cause, not the count.
- **`S[]` stays empty**, neighbours covered – the engine finds nothing. Tap *Change* until ±0 (applies at once, the
  engine then holds only this spread): found now → too many held targets dilute the engine's matching for this
  image. Tap *Change* back to *grow* afterwards (it re-grows in idle time).
- Empty even at ±0 → the target image itself (crop, contrast, size) – the trial's "not found" list.

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

## Options for the flow (open, decide after the numbers)

Direction (Tilman, 2026-10-27): preload everything eventually, in steps – targets first, then their content, then
higher resolutions (the 1x/2x/3x and video levels of issue #13). What is fetched stays cached (service worker and browser on the device;
the Bunny CDN's server-side cache in front of the server – to be confirmed), so a spread visited or preloaded once
comes back sharp later.

- **A target budget instead of ±n.** Hold the current spread plus the nearest spreads until a target budget (from the
  load test) is reached. With small spreads that reaches much further than ±1 for the same engine load.
- **Grow instead of slide** (done, 1.7.0 – the default): keep what is extracted and add the next-nearest spreads in
  idle time until the whole book is held. The first load test (2026-10-27) found no cost in frame rate or detection
  for 131 held targets, so there is no budget or eviction; add one if a slower phone needs it.
- **Nearest first** (done, 1.7.0): the window is passed nearest first, so the engine queues the spreads the reader is
  most likely to turn to before the farther ones (the engine extracts in the order its queue gets them).
- **Fewer configures.** A spread switch configures twice (current, then the new window); the second cancels and
  re-queues what the first had not extracted yet. One configure per switch avoids that.
- **Prepare at build time.** The grey 480×640 frames could be written by the content build (they only depend on the
  target image): no main-thread work in the app, smaller downloads than `target.jpg`.
- **Grouping.** Spreads are facing pages today. Larger groups (e.g. a few spreads or a chapter as one tracked group)
  mean fewer switches; the budget then decides how many groups are held.
- **Switch latency.** `changeSpread()` waits for the new spread's models and videos before tracking it; for a
  spread with a large video the switch waits for that download.
