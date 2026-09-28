# MindAR (vendored)

MindAR by HiuKim Yuen – https://github.com/hiukim/mind-ar-js – MIT licensed (`LICENSE`, copied from the
npm package). Credited in the app's Info page (colophon).

`mind-ar@1.2.5`, files copied unchanged from `https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/`:
`mindar-image.prod.js` (entry: `Controller`, `Compiler`, `UI`) and its chunks `controller-mGt1s8dJ.js`
(tracking + TF.js, the tracking worker is inlined) and `ui-fBadYuor.js`. Types: `mindar-image.prod.d.ts`.

Why vendored and not the npm package: `mind-ar` depends on `canvas`, which has no Node 22 build and broke
`npm ci` in CI (2026-09-26). Why not `mindar-image-three.prod.js`: it imports `sRGBEncoding` (removed in
three r162) and adds a CSS3D renderer; the app's own wrapper (`components/ar-bridges/ar/tracker.ts`) is a
port of MindAR's `src/image-target/three.js` on top of `Controller`.

The app imports it lazily (only the AR scene chunk), so Vite bundles and minifies it into that chunk.
Upgrading: replace the three files (chunk names change), keep the types in sync, re-check `tracker.ts`.

Also used to compile the `.mind` files: `scripts/tools/mind/compile.js` loads `mindar-image.prod.js` from
this folder in a browser and runs MindAR's own `Compiler` (`compileImageTargets`, `exportData`,
`importData`) – no compiler code of our own, so compile and runtime always use the same MindAR version.
