# Content build

`scripts/` turns `content/` into what the app loads:

- `client/src/game.config.json` – the game configuration (book, spreads, targets, entries, tutorial,
  version)
- `client/public/assets/content/` – a copy of the content media
- `mind-ar/<spread>/` – target images in MindAR order, for [compiling `.mind` files](#compiling-mind-files)

```bash
cd scripts
npm install
npm run build                 # type-check + bundle the build tool (after changing scripts/src)
npm run build:content         # build the content
npm run build:content:force   # rebuild even if nothing changed
npm run compile:mind          # compile stale .mind files in a local browser (WebGL), then build
```

(`cd client && npm run build:config` runs `build:content` as well.)

## Compiling .mind files

`npm run compile:mind` (`scripts/tools/compile-mind.mjs`) compiles the recognition data locally, in
Chrome/Edge with WebGL via `playwright-core`. It runs MindAR's own `Compiler` from
`client/src/vendor/mind-ar/` – the same MindAR version as the app and the
[online compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile).

```bash
npm run compile:mind                        # every spread whose target images changed
npm run compile:mind -- spread1 spread3     # these spreads
npm run compile:mind -- --force             # all spreads, nothing from the cache
npm run compile:mind -- --no-cache          # compile every image again (benchmarks)
npm run compile:mind -- --jobs 6            # parallel browser jobs (default: half the CPU cores, max 4)
npm run compile:mind -- --gpu default       # let Chrome pick the GPU (default: the high-performance one)
npm run compile:mind -- --angle d3d11       # WebGL backend: d3d11 | vulkan | gl | metal …
npm run compile:mind -- --headed            # visible browser window, if the headless one has no GPU
npm run compile:mind -- --browser <path>    # a specific Chrome / Chromium / Edge (or env MIND_BROWSER)
npm run compile:mind -- --note "…"          # note stored with the version
```

1. `node dist/index.js --targets` puts each spread's target images into `mind-ar/<spread>/`, numbered
   in MindAR order, with `source.sha256` (fingerprint of those images in order).
2. Each image is compiled on its own (byte-identical to compiling the spread at once) and cached in
   `scripts/.cache/mind/` by image content and MindAR version – a changed spread only compiles its new
   images. Output: GPU in use, progress with MP/s and ETA, GPU detection / CPU tracking time per image,
   a summary (images/min, slowest images, estimate for 100 targets).
3. The images are merged into `content/spreads/<spread>/<name>.mind` (the name in `mind:`) plus
   `<name>.mind.sha256` = the fingerprint; then the content build runs.

The printed WebGL renderer tells which GPU does the work: "SwiftShader" / "llvmpipe" = software (works,
slow). If a laptop with two GPUs prints the integrated one (e.g. "Intel UHD"): Windows Settings →
System → Display → Graphics → Chrome → High performance, or NVIDIA Control Panel → Manage 3D
settings → Chrome → High-performance NVIDIA processor.

**Versions** (`scripts/tools/mind-history.mjs`): every compile stores the new `.mind` and the one it
replaces in `mind-history/<spread>/<version>/` with `meta.json` (date, note, GPU, images, times) –
same bytes once, newest 20 per spread.

```bash
npm run mind:history [-- spread1]                  # list (one spread: with images per version)
npm run mind:restore -- spread1 previous|latest|<number>|<id> [--force]
```

Restore copies the version back and runs the content build. A version compiled from other target images
than the spread has now is refused (it would be stale); `--force` restores it anyway. Test with the dev
server – the built app's service worker keeps a `.mind` it has cached.

**By hand**, without the script: run the content build, add the images of `mind-ar/<spread>/` to the
online compiler in their numbered order, save the download as `content/spreads/<spread>/<name>.mind`
and copy `mind-ar/<spread>/source.sha256` to `content/spreads/<spread>/<name>.mind.sha256`.

## What the build checks

The build stops without writing anything when a file is invalid:

- required fields, types and allowed values (`category`, entity `type`, step `action`)
- spreads don't overlap, every entry page lies in a spread, max 5 targets per spread
- each spread's `.mind` was compiled from its current target images (`<name>.mind.sha256`, see
  [Compiling .mind files](#compiling-mind-files)); a missing fingerprint is only a warning
- referenced files and shared entities exist
- the result matches the game configuration contract (`shared/`) – the app runs the same check on load

## Version and hash

`version.version` is the app version (`client/package.json`, same as `scripts/package.json`).
`version.hash` is a checksum of all inputs – `content/`, `shared/`, `scripts/src` and the version.
When the hash is unchanged the build skips.

Commit the regenerated `game.config.json` and `client/public/assets/content`: CI rebuilds the
content and fails when the committed files differ.

## Contract

The shape of `game.config.json` is defined once in `shared/types/game-config.ts` (entry categories
in `shared/types/entry.ts`), with runtime guards in `shared/guards/`. In the app only
`client/src/utils/game-config.ts` reads the file.
