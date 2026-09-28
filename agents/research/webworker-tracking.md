# Exploration: web worker tracking / a faster, more precise image tracker

Branch `claude/laughing-wright-hrt8zy` (exploration "webworker tracking", 2026-09-28). Research only – no app
code changed. Question (Tilman): can the tracking move into a web worker, and can a tracker based on MindAR be made
much faster and more precise (like Artivive and other C++ trackers)? Would we lose MindAR's advantages
(many image targets, speed, open source)? Is a rebuild worth it compared with the industry leaders?

## Short answer

- **A web worker alone makes the app smoother, not the tracking more precise.** It takes the tracking off the
  main thread (UI and three.js stop competing with it), but the pose is exactly as good (or as jittery) as before.
- **Most of MindAR's lack of precision is in its algorithm and in our target images, not in "JS vs C++"** (details
  below): it tracks each page with a **128-pixel** template, **10–41 points**, whole-pixel search, and hides the
  jitter with a One-Euro filter (which adds lag). Our current target images are only 146–462 px.
- **Rebuilding a C++/WASM tracker ourselves is months of specialist work** (feature detection, matching, optical
  flow, pose, sensor fusion, device testing), with uncertain results.
- **8th Wall's engine is now open source (MIT), including Image Targets** – the C++ engine that was one of the
  web leaders. **Evaluating it is a much better bet than a rebuild.** It is a 0.1.0 pre-release with no company
  behind it anymore, 5× larger than MindAR, and it wants to own the camera and the canvas. Recommended next
  step: a **side-by-side spike** behind a build flag, compared on the S22 and an iPhone (plan at the end).
- **Target count is not a problem for either option**: we use ≤ 5 targets per spread (RULES #3); 8th Wall tracks up
  to 4 images at once and searches for one more each frame.

## 1. How MindAR works in this app (read from the vendored 1.2.5 build)

`client/src/vendor/mind-ar/controller-mGt1s8dJ.js`, `Controller.processVideo()`: one loop per animation frame
on the **main thread**:

| Step | Where | Notes |
|---|---|---|
| Video → grayscale tensor | main thread, TF.js WebGL (its **own** WebGL context, next to three.js) | |
| Detection (when fewer than `maxTrack` are tracked) | main thread, TF.js shaders | Only a **256×256 crop** of a 640×480 frame, moving over **9 positions** (`detectMoving`) – a page at the edge can take up to 9 frames to be seen |
| Matching against the targets | **web worker** (already) | Descriptor matching, Hough, RANSAC, homography. The main loop `await`s the answer |
| Tracking each found target | main thread, TF.js shaders | Template matching (NCC) on the target's **second tracking keyframe = 128 px short side** (`trackingKeyframeList.push(e[l][1])`), 13×13 templates, ±10 px search in **whole pixels**, threshold 0.8; **two synchronous GPU readbacks** (`arraySync()`) per target per frame, which stall the GPU pipeline |
| Pose refinement | **web worker** (ICP), awaited per target per frame | One `postMessage` round trip per tracked target per frame |
| Smoothing | main thread | One-Euro filter (`filterMinCF` 0.001, `filterBeta` 1000), warm-up 5 frames, miss tolerance 5 frames |

So MindAR is already partly in a worker (matching + pose); the GPU parts (detection, tracking) are on the main
thread, and every frame waits for the worker.

**Our targets** (decoded from the `.mind` files, `spread1–3`):

| Spread | Target image sizes (px) | Points used for tracking (128 px keyframe) | Matching points (largest keyframe) |
|---|---|---|---|
| spread1 | 254×650, 244×193, 173×233, 462×567 | 41, 24, 25, 15 | 143, 181, 131, 500 |
| spread2 | 210×297, 250×358, 203×304, 146×219 | 23, 17, 23, 29 | 232, 353, 334, 104 |
| spread3 | 2059×1796, 332×332 | 31, 10 | 485, 62 |

A pose from 10–40 points on a 128-pixel template is bound to jitter. Most source images are smaller than the
256-px tracking keyframe MindAR builds (they are upscaled). **This is the cheapest improvement: final target
images at ≥ 1000 px, with texture and contrast** – it helps every tracker, 8th Wall included.

## 2. What a web worker gives

- **Gains:** the main thread only renders and runs the UI → steadier frame rate, no hitching when a target is
  found, smoother UI in scan mode. Detection and tracking can run in parallel with rendering.
- **No gain:** tracking precision and detection speed (same algorithm, same GPU).
- **Feasible now:** TF.js runs in a worker on an `OffscreenCanvas` WebGL context: iOS/Safari **17+** and
  Chrome. Camera frames reach the worker as `VideoFrame`/`ImageBitmap` (transferable; about one copy per frame), or
  on Safari 18+ the camera track itself can be transferred (`MediaStreamTrackProcessor` in a worker; Chrome only
  has it on the window).
- **Cost:** MindAR's `Controller` is not built for this. We would fork the vendored build (the loop, input
  loader and worker protocol), give up the "copied unchanged" rule in `vendor/mind-ar/README.md`, and every
  MindAR upgrade becomes a merge. Estimate: 1–2 weeks incl. device testing. Worth it only if the device tests
  show main-thread stutter.

## 3. What makes the industry leaders better

- **Native C++ + SIMD** (fast feature detection, many more points), **subpixel optical flow** between frames
  instead of whole-pixel template search, **no GPU readback stalls**.
- **Sensor fusion (IMU / VIO):** ARKit, ARCore and Vuforia combine the image pose with the gyroscope and
  accelerometer. That is where the "stuck to the page" feeling comes from, and why content does not lag when
  you move fast. MindAR uses no sensors at all.
- **Artivive:** the engine is not public. Its site describes a native app plus a WebAR solution with image
  "fingerprints". The app most likely uses native tracking (ARKit/ARCore or a commercial SDK) – unverified.
  The native app gets full VIO; our PWA does not (no WebXR image tracking on iOS; Chrome's is behind a flag).
- **Zappar** (Universal AR): commercial, WASM tracking in a dedicated web worker, 30 fps image/face/world
  tracking in the browser (licence, closed source).
- **8th Wall** (Niantic): C++ engine compiled to WASM, feature detection in WebGL shaders ("gr8"), ORB descriptors,
  LSH/tree matching, PnP pose. **Open source since 2026** (see 4.D).

### Native tracking from the web? (Tilman, 2026-09-28: "Artivive also runs in the browser")

A web page cannot call ARKit / ARCore directly. The only bridges:

- **WebXR image tracking** (`trackedImages`, ARCore underneath): Chrome on Android, **behind a flag** since 2020 –
  draft spec, not usable for readers. The WebXR AR session also takes over the camera.
- **iOS Safari has no WebXR AR at all.** What looks like "native in the browser" on iOS is one of:
  - **App Clip**: a small native app (≤ 15 MB, ARKit) launched instantly from a link, QR code or NFC tag, no
    install. Needle's "Needle Go" App Clip does this: it adds WebXR on top of ARKit, so the same web scene runs
    with native image tracking. Our own App Clip needs an Apple developer account, App Store review, and a native
    shell (Swift or a WebView + ARKit bridge). Progress in the PWA and in the clip would be separate unless synced
    through the account API.
  - **AR Quick Look** (USDZ/Reality files, image anchors): the system viewer; no custom logic, no app UI.
- **Android**: Google Play Instant (the App Clip counterpart) is reportedly being phased out (not verified) – not a path to plan on.

So a **browser** WebAR (Artivive's WebAR, 8th Wall, Zappar) is always a JS/WASM tracker without native VIO.
Artivive's browser tracker is not public; it is a WASM/JS engine like the others (licensed or its own).

## 4. Options

| | A. Tune MindAR | B. MindAR in a worker | C. Own C++/WASM tracker | D. 8th Wall open engine |
|---|---|---|---|---|
| Precision | + (better images, filter, 256-px keyframe) | same as A | potentially ++ | ++ (proven product) – to be measured |
| Smoothness (main thread) | same | ++ | ++ if in a worker | runs on the main thread (WASM + GL) |
| Target count | ≤ 5 per spread, fine | same | own design | 4 tracked at once, 1 searched per frame – fine |
| Download (gz) | 290 KB | 290 KB | ? | **~1.57 MB** (`xr.js` 340 KB + `xr-tracking.js` 1.23 MB) |
| Target files | `.mind` (compiled, ~1 MB each, 0.7 MB gz) | same | own | plain JSON + images (luminance 480×640), features extracted on the device; flat, cylinder and cone targets |
| Effort | days | 1–2 weeks | **months**, specialist | spike 3–5 days; adoption 1–2 weeks |
| Risk | low | medium (fork) | high | medium: 0.1.0 pre-release, community-maintained, API may change |
| Licence | MIT | MIT | own | MIT (engine incl. Image Targets); SLAM only as a binary with a limited-use licence |
| Architecture | no change | `ar/tracker.ts` + vendor fork | new `ar/tracker.ts` | XR8 owns the camera + render loop (`XR8.run({canvas})`, three.js pipeline module) → `ar/tracker.ts` and parts of `ar/view.ts` change; RULES stack line "Image tracking: MindAR" needs Tilman's okay |

### A. Tune MindAR (cheap, do first regardless)
1. Final target images at ≥ 1000 px, rich texture, no large flat areas (content, with the artist).
2. Tune `filterMinCF` / `filterBeta` per device test (less jitter vs. less lag); expose them in the debug bar.
3. Try tracking on the 256-px keyframe (`trackingKeyframeList.push(e[l][0])` in the vendored chunk – a
   one-character patch; more points, more GPU per frame). Measure on the S22 and an iPhone.
4. Gyroscope smoothing between tracking frames (3DoF), which also serves Phase 10 "pinning".

### B. MindAR in a worker
See section 2. Improves smoothness, not precision. Only if device tests show main-thread stutter.

### C. Own tracker
Not recommended: a competitive tracker needs FAST/ORB (or similar) with SIMD, a matching index, KLT optical flow
with subpixel refinement, a robust PnP, a Kalman/IMU filter, a WASM build pipeline and months of device tuning.
Open starting points exist (WebARKit – ARToolKit NFT/FREAK + ORB in WASM and Rust, experimental; AlvaAR – SLAM in
WASM, **GPL-3.0**), but none is ahead of 8th Wall's engine, which is now MIT.

### D. 8th Wall open engine
- Repo `github.com/8thwall/8thwall` (MIT); image tracking in C++ under `reality/engine/imagedetection` and
  `reality/engine/features` (GPU feature shaders `gr8-*.frag`, ORB, LSH index, PnP). npm `@8thwall/engine@0.1.0`
  (pre-release). Its `XrController` contains **Image Targets only** (no SLAM). SLAM would come from the separate
  `@8thwall/engine-binary` with a limited-use licence – not needed for pages.
- `detection-image-tracker.cc`: `MAX_NUM_TRACKED_IMAGES = 4`, `MAX_GLOBALLY_TRACKED_PER_FRAME = 1` (round robin
  over the untracked targets), a target counts as lost after 20 frames. With 5 targets per spread, 4 are tracked
  at once – enough for a book spread. Our shared constant (RULES #3) would need `maxTrack ≤ 4` with this engine.
- Targets: `npx @8thwall/image-target-cli` → JSON + cropped/luminance images, loaded with
  `XR8.XrController.configure({ imageTargetData: [...] })`. That replaces the `.mind` compile in `scripts/`.
  It also opens curved targets (cylinder/cone), which MindAR cannot do.
- Concerns: download 5× MindAR (lazy-loaded like MindAR today, so startup is unaffected, but the first scan waits
  longer on a slow network); the engine owns camera + canvas and has its own event model (`imagefound`,
  `imageupdated`, `imagelost`) – our `IArScene` boundary (RULES #12) keeps that contained in `ar/`; no company
  support, a 0.1.0 API; iOS/Android device behaviour to be verified.

## 5. Recommendation

1. **Now (content):** final target images in high resolution – the biggest precision gain for any tracker.
2. **Spike D (3–5 days):** `ar/tracker-8thwall.ts` behind a build flag (e.g. `VITE_AR_TRACKER=mindar|8thwall`,
   like the former `VITE_AR_STRATEGY`), same `IArScene` interface, the spread-1 targets through the image-target CLI.
   Compare on the S22 and an iPhone: time to first detection, jitter (still phone), lag (fast motion), tracking
   at steep angles and distance, frame rate, battery/heat, first-scan load time.
3. Meanwhile **A.2/A.3** as a baseline (filter + 256-px keyframe) so the comparison is fair.
4. Decide after the spike: switch to 8th Wall (RULES stack change, content build change) or stay on tuned
   MindAR. **B** (worker) only if MindAR stays and the devices show stutter; **C** not at all.

## 6. Spike built (2026-09-28)

The app can now run on either engine – same scene, entities, unlock flow:

- **Switch:** debug bar → "Tracking: MindAR – Use 8th Wall (reload)" (per device), or build flag
  `VITE_AR_TRACKER=8thwall`. Collapsed debug line starts with `MA` or `8W`.
- **Code:** `client/src/components/ar-bridges/ar/tracker-8thwall.ts`, `xr8.ts` (loader, target data, anchor
  math), `create-tracker.ts`, `tracker-types.ts`; `vite.config.js` → `xr8Engine()` serves the engine files.
- **Targets:** made in the browser from the target images (no `.mind`, no content build change): the whole
  image fitted into the engine's 3:4 frame (rest filled with the image's edge colour), grey, 480×640. The
  image-target CLI's centred 3:4 crop lost too much of tall pages – `shadows` (254×650, 52 % kept) was never
  found on the S22; whole-image targets find it. If the engine wins, the content build makes the same targets.
- **Checked headless** (Chromium, fake camera clip of a target image, software GL – no speed numbers): target
  found ~2 s after start, entity placed like MindAR places it, spread switch with the camera kept, production build.
- **S22 (Chrome, 2026-09-28), first look on 8th Wall:** camera picture under the three.js canvas ok, targets
  found and placed like MindAR, ~34 fps page frame rate while tracking; many WebGL readback performance
  warnings from the engine. `shadows` needed the whole-image targets (above).
- **Spread switches (S22):** targets are extracted on the device, so the neighbouring spreads' targets are kept
  loaded in the engine (`prepareTargets()`, the counterpart of the `.mind` preloading): first spread ~1.15 s,
  switch to a neighbour 0–1 ms, to another spread ~0.6 s. The encode uses `toDataURL` – `toBlob` waited ~4 s
  per image for idle time while the engine ran.
- **Automatic spread switch (8th Wall only):** the loaded neighbour targets also tell when the reader turned
  the page – held 400 ms with nothing of the current spread in view, the app switches like the spread menu.
  S22: works, ~0.4 s. MindAR cannot do this (one `.mind` at a time). Open: how many targets the engine keeps
  loaded before detection or frame rate suffers.
- **Still open – on the phones:** the comparison itself (section 5.2), iOS motion permission prompt, pause/resume.

## Sources

- MindAR 1.2.5 vendored build (`client/src/vendor/mind-ar/`), `.mind` files in `client/public/assets/content/spreads/`
- [8th Wall repository (MIT; SLAM binary-only)](https://github.com/8thwall/8thwall) – `README.md`,
  `packages/engine/README.md`, `reality/engine/imagedetection/detection-image-tracker.cc`,
  `apps/image-target-cli/README.md`; npm `@8thwall/engine` 0.1.0, `@8thwall/engine-binary` 1.0.0
- [8th Wall: Goodbye 8thwall.com, hello 8thwall.org](https://www.8thwall.com/blog/post/208587408737/8th-wall-open-source),
  [Engine distribution and open source plans](https://www.8thwall.com/blog/post/202888018234/8th-wall-update-engine-distribution-and-open-source-plans)
- [MindAR tracking config](https://hiukim.github.io/mind-ar-js-doc/quick-start/tracking-config/),
  [MindAR issue #556 – unstable content](https://github.com/hiukim/mind-ar-js/issues/556),
  [#146 – jitter](https://github.com/hiukim/mind-ar-js/issues/146)
- [Zappar Universal AR](https://zap.works/universal-ar/), [zappar-threejs](https://github.com/zappar-xr/zappar-threejs)
- [Artivive](https://www.artivive.com/), [Artivive: how to create AR](https://www.artivive.com/resources/create-art)
- [WebARKit 0.9.0](https://github.com/webarkit/WebARKitLib/releases/tag/0.9.0),
  [WebARKitLib-rs planar tracker](https://github.com/webarkit/WebARKitLib-rs/issues/244),
  [AlvaAR (GPL-3.0)](https://github.com/alanross/AlvaAR)
- [WebKit: Safari 17.0 (OffscreenCanvas WebGL in workers)](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/),
  [MediaStreamTrackProcessor / VideoTrackGenerator status](https://blog.mozilla.org/webrtc/unbundling-mediastreamtrackprocessor-and-videotrackgenerator/),
  [WebAssembly threads (cross-origin isolation)](https://web.dev/articles/webassembly-threads)
