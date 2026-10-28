# Changelog

Every versioned change is listed here, newest first. Versions follow [semver](https://semver.org/) and
are the same for app, content build and server (`agents/RULES.md` #10, #23):

- **PATCH** – fixes, refactors, comments, styling tweaks, tooling; nothing a reader or editor has to act on.
  Changes only to `agents/`, `docs/` or Markdown need no version.
- **MINOR** – new features or content-build options that work with existing content and progress.
- **MAJOR** – content must be rebuilt, or the progress storage format changes (needs a reader in
  `utils/progress-record.ts`).

Sections per version: *Added*, *Changed*, *Fixed*, *Removed* (only those that apply). Versions before
1.1.2 are in the git history.

## 1.9.4 – 2026-10-28

### Added
- **Tap to focus for every reader** (#37): a tap on the camera picture that is not on app UI and hits no AR entity
  (those still open their entry) starts one focus run, then the camera goes back to continuous focus after 1.5 s. Where
  the browser supports focus points (`pointsOfInterest`) it focuses on the tapped spot; Chrome on the Galaxy S22 does
  not, so there the whole picture is refocused. Browsers without focus controls (Safari) ignore the tap. Continuous
  focus at camera start stays; no zoom. The debug camera panel keeps its own **◎** test switch
  (`ar-bridges/utils/camera-request.ts` → `focusAtTap()`, called from the AR scene's tap handling).

## 1.9.2 – 2026-10-28

### Fixed
- **Dependabot alerts resolved** (#55): all 13 open alerts were in the development tooling (nothing in the app
  bundle or the server). `client/`: vite 8.3.1 → 8.3.5 (launch-editor command injection, `server.fs` bypasses,
  cross-origin script execution), vitest 5.0.2 → 5.0.5 (`@vitest/mocker` code injection and path traversal),
  source-map-js 1.2.2, fast-uri and serialize-javascript refreshed, happy-dom 20 → 21.0.4 (host code execution
  through an unsanitized import alias). `scripts/`: vitest 3.2 → 4.1.12 (no patched 3.x release – also replaces
  the vulnerable tinypool), vite 6.3 → 6.4.5, sharp 0.35.5, source-map-js 1.2.2. The remaining `npm audit` note
  in `client/` (deepmerge, low, through vite-plugin-pwa → workbox-build) has no fix upstream and is not a
  Dependabot alert.

## 1.9.1 – 2026-10-28

### Changed
- **Trial strip in a fixed order** (#14): the strip shows every target in the order of the printout, with its running
  number (the same numbers as the tester printouts of trial 2) and its page – nothing reorders or disappears any more
  (before, it showed the current spread's targets and then only the ones not found yet, from the current spread on,
  so tiles jumped and vanished). Found ones get a green frame and a ✓, the one in view a yellow frame, the current
  spread's a white frame; the strip scrolls to the current spread when it changes. Targets not on the printout are
  dimmed and labelled "not printed".
- **The trial holds ±1** instead of ±0: the next and previous spreads are loaded, so scanning the sheet in order
  switches to the next page by itself; ‹ › stay.
- The strip sits flush with the bottom edge of the screen, full width, square corners.

## 1.9.0 – 2026-10-28

### Fixed
- **Android scans with the main lens again** (#37): the 8th Wall engine chooses Samsung's main back lens by the label
  `camera2 0, facing back`; Chromium now names the lenses `camera 0, facing back` (Chrome 156, Brave 155), so the
  engine asked for "the back camera" and the S22 opened its **ultra-wide lens** – fixed focus, small triggers held
  close stay blurry and look even smaller. The app now changes the engine's camera request on the way and asks for
  camera 0 by its device id (`ar-bridges/utils/camera-request.ts`; old and new label; only on Android – elsewhere the
  request stays). On the S22, 23 of the 25 triggers the first trigger test missed are now found, without zoom; the
  two left are flat logos (`docs/trigger-tests/2026-10-28-camera.md`).
- **The dev server runs on Safari 15** (iPhone 7): its TypeScript transform turned static class fields into
  `static {}` blocks, which Safari before 16.4 cannot parse – the app stopped on the splash screen. The dev server now
  lowers them for Safari 15 (`vite.config.js`), as the build already did.

### Added
- **Notice for browsers that cannot scan** (#37): the engine's tracking WebAssembly needs WebAssembly SIMD – Safari
  from iOS 16.4. Without it the camera overlay says so instead of the generic AR error: on an iPhone, update to
  iOS 16.4 or newer if the phone can (iPhone 7, 6s and SE 1st generation cannot); elsewhere, update the browser
  (`CameraPermissionStatus.UNSUPPORTED`, checked before any camera request). A SIMD-free engine build is proposal #39.
- **Continuous focus at camera start** where the camera offers it and does not use it already
  (`applyCameraDefaults()`).
- **Debug camera panel** (overlay → *camera*, a strip at the bottom like the trial): the camera readout and switches
  moved out of the overlay into it. It lists the current spread's targets (yellow in view, ✓ found since opened), a
  retest list (`?retest=<ids>` link or `osct-camera-retest`), and next to AF / ◎ / zoom: **lens** (main or the
  browser's choice), **res** (engine 960 × 720, 1280 × 960, 1920 × 1440) and **ask zoom**, each on the next start.
  It shows why AR could not start (also after "AR: error" in the overlay) – the console is out of reach on a phone.
  While open the tracker holds the current spread only, as in the trial.

### Changed
- **Debug overlay**: tabs `spread · progress · camera · trial · load · tune` and a **×** that closes it (the expanded
  overlay could not be closed on a phone); the spread's QR code is behind a **QR** button.
- The camera resolution stays the engine's 960 × 720: 1920 × 1440 found the smallest trigger later and held it less
  steadily on the S22, 1280 × 960 brought nothing.

## 1.8.2 – 2026-10-28

### Changed
- **The tracker holds the neighbouring spreads again, not the whole book** (#38): by default the engine keeps the
  current spread and the next and previous one loaded (±1, as before 1.7.0), so turning a page still switches by
  itself. The growing window (the whole book, added in the background) stays selectable in the debug overlay; with
  it, pages of a printout were no longer found once every target was held. Until that is solved it is not the
  default.

## 1.8.1 – 2026-10-28

### Changed
- **Trial tiles show clearly what was found** (#36): a found image gets a thick green frame and a green square with a
  ✓ in its top right corner, and stays fully visible (it was dimmed before); the image in view is framed yellow.
  Square tiles, no rounded corners. Testers just move on when an image is not found – there is no "did not work"
  button.

## 1.8.0 – 2026-10-28

### Added
- **Camera readout and focus / zoom tests** in the debug overlay (#14): the trigger test of 28 October missed small
  printed triggers and the camera seemed not to focus, while neither the app nor the 8th Wall engine sets a focus
  mode or zoom. The overlay's new *Camera* section shows the lens the engine opened (its label), the resolution and
  frame rate, the focus mode, focus distance and range, the zoom and its range – and test switches: **AF continuous**,
  **Tap to focus** (the next tap on the camera picture focuses there), the zoom steps 1× / 1.5× / 2× / 3× the lens
  offers, and **Ask for zoom** (the next camera start requests zoom too – Chrome may only offer zoom with the
  camera's pan-tilt-zoom permission). The collapsed line ends with `C<lens> <resolution> <focus> <distance> <zoom>`.
  The trial panel has a camera row with **AF**, **◎** (tap to focus) and the zoom step, and its `md` report records
  the camera. The tracker hands the engine's camera track over on its "hasStream" status
  (`ar-bridges/utils/camera-debug.ts`); nothing in the app depends on it. Zoom changes the field of view the engine
  assumes: finding works, the AR overlay may sit slightly off while zoomed.

## 1.7.10 – 2026-10-28

### Changed
- Code base review (#19): comments explain the code, not its history – names, dates, test references, design frame
  numbers and libraries the app no longer uses (A-Frame, MindAR, Netlify, FTP) are gone from code comments,
  workflows and `.gitignore`; the two TODOs without an issue are removed.
- `.editorconfig` and `.gitattributes` fix line endings (LF) and indentation for every editor.
- The content build no longer treats edits to the delivery import or the trigger protocol tool as a new content
  version (`import-delivery.ts` and `protocol.ts` are left out of the content hash like the other commands). The
  content schema is 1.2 (comments in `shared/` changed; nothing older apps cannot read).
- Documentation: the root `README.md` is the index of `docs/` (with the repository layout and the three test
  layers); `agents/RULES.md` has stable rule numbers (the second "21" is #25, Git #26, CI #27, Deployment #28,
  Issues #29, session start #30, docs ownership #31) and a rule that a TODO needs an issue; outdated statements in
  the docs (target limit, namespaces, settings and dev tools, scripts folders) corrected.

### Removed
- Dead members: `Pages.NOTIFICATION`, `IGame.setLoadingState`, `ISpreadManager.getCurrentSpread`,
  `StorageClient.listTree`, an unused Mark image; duplicate helpers in `scripts/` (`isMain`, `listFiles`,
  `isObject`); `docs/README.md` (its two URLs are in the root README).

### Fixed
- `scripts/test/` is type-checked, and the build test builds the test fixture instead of the book content
  (RULES #8). The API schema split no longer relies on a literal line break inside a regex.

## 1.7.9 – 2026-10-28

### Changed
- The deploys build the app against the environment's content CDN: `CONTENT_BASE_URL` of the GitHub environment
  reaches the Docker build (`config/deploy.yml` → `builder.args` → `Dockerfile` `VITE_CONTENT_BASE_URL`) and the
  temporary FTPS staging build. Such an image holds no content; the app loads the current version from the CDN at
  startup ([content-cdn](content-cdn.md)). Without the variable the commit's content is still bundled (#6, #5).

## 1.7.8 – 2026-10-28

### Changed
- **The trigger trial holds the current spread only** (#14): while the trial panel is open the tracker's window is
  ±0 – no growing window, no other spread prepared, no content preloaded for neighbours – so a trigger that is not
  found is down to the engine and the printout, not to work in the background. Step through the book with ‹ ›.
  Closing the panel restores the setting chosen in the debug overlay (the override is not stored); the overlay shows
  "±0 while trial is open (then …)".

## 1.7.7 – 2026-10-28

### Fixed
- The error page unsubscribes from the store when it leaves the DOM (#20): it subscribed to the whole store on every
  connect and "unsubscribed" a different function, so each reconnect left a listener behind. It now subscribes to
  `currentError` only (typed `ErrorInfo | null`) and keeps the cleanup it gets back, like the other pages.

## 1.7.6 – 2026-10-28

### Added
- **Content deployment apart from the app** (#5): the **osct CLI** in `scripts/` (`npm run osct -- content build |
  status | sync | purge --env staging|production`). `sync` uploads the content build as a new version – its own
  folder on the bunny.net CDN, never overwritten – and points `latest.json` at it; syncing an older build again is
  the rollback. `purge` deletes old versions strictly: never the current one, the one the CDN still serves, the
  newest retired one or anything retired within the CDN cache time (30 days), and nothing at all when the
  bookkeeping is inconsistent. Nothing runs on a push; the workflow "Content" is a manual button (dry run by
  default). The app loads the current version at startup when it is built with `VITE_CONTENT_BASE_URL`; such a
  build reads no content at all. Without the flag the content stays bundled (dev server, tests). The installed app
  still works offline. How it works: `docs/content-cdn.md`.
- **Test fixture** `fixtures/content/` (#5): the placeholder content, slimmed to under 1 MB (every entity type,
  chroma key and alpha video). CI and the tests build it – the book content is leaving the repository, history
  included (`docs/content-out-of-git.md`). `osct content sync` refuses a build of it.
- **Content schema `MAJOR.MINOR`** (`version.schema`, `shared/types/game-config.ts`, now 1.1): the only
  compatibility rule between content and app. Another MAJOR is refused at startup ("The book content is newer than
  this app" / "… older than this app", en/fr/nl/de); any MINOR loads. A test fails when `shared/` changes without a
  schema bump (`shared/content-schema.json`, `npm run schema:lock` in `scripts/`).

### Changed
- The content build reads only the content source named by `OSCT_CONTENT_DIR` (environment or `scripts/.env`,
  relative to the repository) and stops when there is none – no fallback. `content-demo/` became the fixture; its
  full-size copy lives next to the content source. The workflow "Content" offers status and purge – sync runs where
  the content source is.
- The content's version is its build checksum and no longer includes the app version – an app release does not make
  new content. The app version a content build was made with is information only (the startup check no longer
  compares it).
- The game configuration is loaded before the app element starts (`loadGameConfiguration()`), no longer imported at
  build time. The whole-book download takes the file sizes from `files.json` of the loaded version.

## 1.7.5 – 2026-10-28

### Fixed
- The debug overlay's QR code on staging pointed at the build machine (#22): the build no longer bakes in a dev
  server address, so in a build the code leads to the address the page was opened on (staging, production). On
  the dev server it still shows the Wi-Fi address for phones. The stale environment list (Netlify) is gone.

## 1.7.4 – 2026-10-28

### Fixed
- The debug overlay removed its click listener with a freshly bound function, so nothing was removed: after a disconnect and reconnect one tap toggled it twice (#21). Add and remove now use the same function.

## 1.7.2 – 2026-10-28

### Fixed
- The first push of the Kamal deploy: the staging and production workflows now grant `packages: write` to the
  deploy they call (the repository's token is read-only by default, so the called workflow could not ask for it
  and the run failed at startup).
- 1.7.1 had bumped only the app's version; the content build and the API said 1.7.0, which the API test caught
  (the FTPS staging deploy failed). All three are 1.7.2.

## 1.7.1 – 2026-10-27

### Added
- **Deploys move issues on the board** (#11): after a successful deploy, `board-status.yml` sets every `Fixes #N` in the
  deployed commits to *Review on staging* (staging) or *Deployed* (production) on the board OSCT and comments the
  version – only forward, `Refs #N` moves nothing. Needs the repo secret `PROJECT_TOKEN` and runs once it is on `main`
  ([deploy](deploy.md) "Board").
- **Every session starts with its issue** (`agents/RULES.md`, `CLAUDE.md`): find or create the issue, pick its lane,
  start the session title with `#N`.

## 1.7.0 – 2026-10-27

### Added
- **Growing window** (new default, debug overlay *Spreads held: grow*): the tracker holds the current spread, then adds
  the nearest spreads in idle time – three targets at a time, each batch after the previous one is extracted – until
  the whole book is held. Nothing is dropped on a switch, so every page visited or grown into switches by itself
  afterwards. Based on the first load test: holding all 131 targets cost no frame rate, tracking stability or detection
  speed, only ~0.35 s of main-thread work per new target. Content is still preloaded for ±1. The fixed windows (±0,
  ±1, ±2, all) stay selectable for comparison. The overlay shows how many spreads are left to add.
- **What the engine sees** (debug overlay): `S[…]` on the collapsed line lists every target the engine finds right now,
  of any held spread – the current spread's in green, others in orange – and `↪<spread>` the last automatic switch for
  10 s; expanded, *Engine sees* and *Last auto switch* (via which target, how long ago). The window setting's
  **Change** button now applies at once instead of at the next switch. To tell a crowded printout from too many held
  targets when a page is not found ([tracking](tracking.md)).
- **Engine view in the debug overlay**: which spreads the image tracker holds right now – the current one (◉) and the
  ones kept loaded next to it, with their target counts – how many targets are extracted (can be found), whether the
  engine is still extracting, and which spreads are being prepared. The summary line shows `E<ready>/<held>`.
- **Engine load test** (debug overlay → *load*, dev server and staging), run in the app as it is used: the window of
  spreads kept ready next to the scanned one gets a growing target budget (0, 5, 10, 20, 40, 80, all – nearest spreads
  first); the tracker holds it, the preloader fetches its content, pages switch as usual. Per step it measures preparing
  and extracting the window's new targets, engine and page frame rate, stutter, how steadily the scanned page stays
  found, and – when the tester covers and uncovers the lens – how fast it is found again. Download .md / Copy give the
  table ([tracking](tracking.md)).

### Changed
- **Entry videos stay out of git** (`content/entries/*/video.mp4` in `.gitignore`): the trial's 16 videos (117 MB) are
  not committed; they reach the servers through a CDN sync later. A content build without a video (CI, deploys) warns
  and builds that target without its AR video instead of failing.
- **Trigger trial panel** is a small strip at the bottom: drag its top bar to make it taller or lower (remembered on
  the device). It shows the current spread's targets (found ones dimmed with ✓, the one in view outlined), then every
  target not found yet from the next pages on – tap one to go to its spread; ‹ › step through the spreads. The bar only
  counts the targets not found yet; **md** downloads the report of those. The slow / flicker / no buttons and notes are
  gone (found comes from the progress; reset the progress to start a trial over).
- **Content preload follows the tracker's window**: the spreads whose targets the engine holds (±n, nearest first) also
  get their content preloaded – before, content was always ±1 while the targets could be ±2 or all. Target images
  first, then one spread at a time, nearest first; a moved window stops the older run.

## 1.6.0 – 2026-10-27

### Added
- **Trial content** from the publisher's delivery of 21 October (`scripts/import/2110.yaml`): 138 entries on 87 spreads –
  84 glossary images, 41 link screenshots, 16 documentation videos (13 as AR videos on their page's trigger) – with
  placeholder titles and texts. 121 of the 131 targets are on the trial printout (`All_Triggers.pdf`).
- **Delivery import** (`npm run import -- <delivery folder> import/<name>.yaml` in `scripts/`): a mapping file names,
  per entry, the delivered printed image, entry image and video; the import writes resized JPEGs, re-encodes videos
  with ffmpeg (H.264, ≤ 1280 px, ~2 Mbit/s), creates `entry.yaml` with placeholders and the spreads, and never
  overwrites an edited `entry.yaml` (`docs/content.md` "Importing a delivery").
- **Trigger trial panel** (debug overlay → *trial*, dev server and staging): the checklist for a test with the printed
  book. It lists the targets of the current spread or the whole book with thumbnail, delivered file, printed size and
  position (`npm run protocol -- import/2110.yaml` → `trigger-protocol.json`), marks what the scanner found, takes
  *slow* / *flicker* / *no* and a note per target, and downloads (or copies) a Markdown report – problems first – for
  the designers. The progress tab's **Copy** button gives the raw list of unlocked targets with times.

### Changed
- The placeholder content (demo spreads, castle, racoon, edge …) moved from `content/` to `content-demo/`; build it with
  `OSCT_CONTENT_DIR=../content-demo`. `content/` now holds the book's content only.

### Fixed
- The debug overlay's QR code (opens the dev server on a phone) named a virtual adapter's address (WSL, Hyper-V, Docker)
  and always port 5173; it now uses the Wi-Fi address of a physical adapter and the port and protocol of the server
  the page came from.

## 1.5.3 – 2026-10-27

### Added
- The sign-in mails go out through Amazon SES (eu-west-1): the deploy configuration defaults to its SMTP endpoint,
  an environment only needs the SES SMTP user name and password (`docs/deploy.md` "Mail"). The deploy stops before
  Kamal when mail is set to SMTP but the credentials are missing.
- `php /opt/osct/mail-test.php <address>` in the container (`server/deploy/mail-test.php` locally) sends one test mail
  with the current settings and prints the SMTP error when it fails; `server/deploy/ses-smtp-password.php` turns an
  IAM secret key into the SES SMTP password.

### Changed
- Deployment: the site – app and user API – ships as one Docker image, deployed with Kamal over SSH:
  `develop` → staging https://osct.porschuetz.de, `main` → production https://osct.buildingfictions.com
  (`docs/deploy.md`). The container creates missing tables and columns at every start; the API reads its settings
  from `OSCT_*` environment variables, there is no `config.local.php` on a server any more.
- Cache headers, MIME types, gzip and the SPA fallback are part of the image (`server/docker/apache.conf`,
  `.htaccess`), not a hosting provider's settings.

### Removed
- The Netlify deploys (`_headers`, `_redirects`) and the release workflow: production deploys from `main`; GitHub
  releases are optional notes. The FTPS upload to the shared host stays as a temporary workflow until the staging
  VM exists.

## 1.5.2 – 2026-10-20

### Changed
- The content build output (`client/src/game.config.json`, `client/public/assets/content/`) is no longer in
  git: `npm run build` in `client/` builds the content first, so every deploy (staging, release, Netlify)
  builds the content of its commit. After a content change, run `npm run content` in `client/` locally and
  commit only `content/`.
- The checks build the content instead of comparing a committed copy.

### Fixed
- A fresh checkout tells you to run `npm run content` instead of failing on a missing file; the broken
  `build:config` script is gone.

## 1.5.1 – 2026-10-03

### Added
- **Tune panel** (debug builds: dev server and staging): debug overlay → "tune" opens a panel at the bottom of the
  screen for the AR content of a page – every placement value (`position.x`, `rotation.y`, `scale` … – the three.js
  names) and every parameter of its filters (chroma key: color, mode, threshold, softness, spill, opacity), each
  with a slider and a field for an exact value (a comma works as the decimal point). It opens with the values in the
  content and shows changes live on the page; filters can be added and removed. "Copy YAML" copies the `params` /
  `filters` block with the file it belongs in – only values that differ from the defaults. The content itself is
  not changed: paste the block into the entry (or into a Claude session). How to use it: `docs/content.md`.

## 1.5.0 – 2026-09-28

### Added
- **Scene around the book** (prototype, scan mode): once a page has been found, a world surrounds the reader. It
  is tied to where the book was seen and turns with the phone (gyroscope, rotation only – walking does not move
  through it). The book and the table stay visible (a soft window around the book, clear when looking down);
  every new find sets the world back in place. It fades away 45 s after the last page was seen. For now a basic
  placeholder café drawn in one pass – sky gradient, stars, a moon, a ringed planet, a grid floor, floating tables,
  glowing orbs and turning cubes as simple shapes in the shader; the real world comes with the content.
- **Onion sky**: looking up, sky-coloured parts of the camera picture (blue, or bright grey and smooth) show the
  world's sky – buildings, trees and people stay real (light, warm façades are not taken for an overcast sky). It
  reads a small copy of the camera picture (160 px wide, every other frame), not the full video.
- **Graphics** options on the Info page (Settings): "Onion sky" and "Scene around the book", **off by default**,
  stored on this device (en/fr/nl/de) – for phones that need the power for the page scenes. With both off nothing
  extra is drawn and the gyroscope is not read.
- Documentation: `docs/look-around.md`.
- Tuning on the device: `window.osctLookAround` (opacity, sky strength, fade time, window and floor angles). On
  iPhone the first tap asks for motion access.

## 1.4.2 – 2026-09-28

### Changed
- Debug overlay top line shortened to `◉ spread1 T4 F[…]`: the dot's color is the AR status (no "S"), then the
  spread, its number of targets and the found targets. The asset count and the book's unlocked / consulted
  counts are gone from the line (the progress panel lists them in full).

## 1.4.1 – 2026-09-28

### Removed
- Removing the account password: once set, it can be changed but not removed ("Remove password" button and
  `DELETE /user/password` are gone). The sign-in link keeps working either way.
- Debug overlay: the spread status ("Initial") and the spread dot next to the scene dot – no code ever changed
  it. The unused per-spread loading state is gone from the store; the current spread stays.

## 1.4.0 – 2026-09-28

### Added
- Optional password for accounts. The first sign-in is still by email (it confirms the address); afterwards
  readers can set a password under Info → Account and sign in with email + password, or keep using the
  sign-in link. The password can be changed or removed again. Forgot it? Sign in with the link and set a new one.
- Server: `POST /auth/password`, `PUT /user/password`, `DELETE /user/password`. Passwords are stored as bcrypt
  hashes (cost 12) only; failed sign-ins are limited per address and per IP. The deploy's migration adds the
  new column and table to the existing database – no data is touched.
- Password managers can fill and save the account fields (email as the username, `current-password` /
  `new-password`); Chrome also offers to save the password after signing in or setting it.

### Changed
- Account wording: one form for new and returning readers – "Send sign-in link" instead of "Register
  account", and the text tells readers who registered on another device to use the same email. Switching to
  the password form is a text link next to the button ("Sign in with password" / "Sign in with link"), not a
  second button.

## 1.3.2 – 2026-09-28

### Changed
- Targets are known by their id only: the tracker and the AR scene no longer number them. `index` is gone from
  the game configuration and the target `order` from the content (`order:` under `target` is ignored if
  left in). Entries on the same page are listed by title.

### Removed
- Leftovers of MindAR: the `.mindar/` folder that was committed by mistake with 1.3.0 (it is ignored again,
  so old local copies stay out of git).

## 1.3.1 – 2026-09-28

### Fixed
- Automatic tagging on `main` no longer aborts when a changelog version never had a commit of its own on
  `main` (1.2.3 reached `main` inside 1.3.0): commits without a readable version are skipped, and such a
  version is noted instead of searched for through the whole history. This had kept `v1.3.0` from being tagged.

## 1.3.0 – 2026-09-28

Existing content keeps building (a leftover `mind:` in `spread.yaml` is ignored – delete it when convenient);
the game configuration no longer has `mindSrc` or `maxTargetsPerSpread`. Progress is unchanged.

### Changed
- Image tracking with the **8th Wall engine** (`@8thwall/engine`, MIT) instead of MindAR: steadier content
  (less jitter). The engine's files are served from `assets/xr8/` with its licence and precached by the service
  worker, so AR works offline. It is credited in the project README (not on the Info page).
- The app makes the recognition data from the target images itself – nothing to compile. The whole target
  image is used (fitted into the engine's portrait frame).
- Up to **10 targets per spread** (was 5); the camera follows 4 of them at the same moment.
- The preloader and the whole-book download fetch the target images where they fetched `.mind` files.
- Saved progress of an older format will only be reported as "converted" when reading it changed something
  (for the next progress format change).

### Added
- The neighbouring spreads' targets are kept ready, so switching to them is instant; turning to a
  neighbouring spread **switches by itself** (the page held in view for 0.4 s, in scan mode). The spread menu
  stays.
- Debug overlay: "Spreads loaded ahead" (±0, ±1 – the default –, ±2, all).
- Demo spreads 4–14 (pages 7–27) from the layout PDF – placeholder targets for testing, no AR content.

### Removed
- MindAR: the vendored build (with TF.js), its tracker, all `.mind` files, `npm run compile:mind`,
  `mind:benchmark`, `mind:history`, `mind:restore`, the `.mindar/` folder and `playwright-core`.

## 1.2.3 – 2026-09-28

### Changed
- Info page: more space between the "Settings" title and the first switch, like the gap between the rows.
- Camera denied screen: one short hint (allow the camera in the browser settings, then reload) and a
  "Reload page" button instead of step lists per browser.

### Fixed
- Camera denied screen in scan mode no longer overlaps the counter or the "Pages activated" menu.
- The screen no longer shows Firefox instructions in Chrome (the browser guess was wrong).

### Removed
- Browser detection (`utils/browser.ts`) and the per-browser camera steps in all languages.

## 1.2.2 – 2026-09-28

### Fixed
- Automatic tagging no longer fails when an older version's commit has different workflow files (GitHub
  does not let the repository token tag it); that tag is reported with the command to create it by hand.

## 1.2.1 – 2026-09-28

### Changed
- Comment cleanup: the Info page's MindAR note no longer ends up in the page's HTML; the staging deploy
  workflow's comments follow the comment rules.

## 1.2.0 – 2026-09-28

### Added
- `npm run compile:mind` (in `scripts/`) compiles the recognition data (`.mind`) on your own computer, in
  Chrome or Edge on the graphics card, with MindAR's own compiler. It compiles only the spreads whose
  target images changed, keeps every image in a cache, and shows each step with live progress, the
  graphics card in use and a summary of the times.
- `npm run mind:benchmark` measures how fast your computer compiles and picks how many images to compile at
  a time; `compile:mind` then uses that.
- `npm run mind:history` and `npm run mind:restore <spread> previous` keep earlier `.mind` versions on your
  computer and put one back, so a compile can be tested on the phone before it is committed.
- The content build stops with "… is stale" when a spread's `.mind` no longer matches its target images.
- Tests for the content build and the `.mind` tools (`npm test` in `scripts/`), also run by the GitHub checks.
- The Info page credits MindAR (image tracking by HiuKim), and MindAR's licence ships with the app's copy.

### Changed
- `scripts/` is all TypeScript and sorted by task: `src/build/` (content build), `src/lib/` (shared
  helpers), `src/mind/` (`.mind` commands); `npm run build` bundles one file per command.
- Everything about `.mind` files that stays on your computer lives in `.mindar/` at the root (target
  images, earlier versions, cache, browser profile); older folders are moved there on the first build.
- The content build documentation is part of `docs/content.md`, as a short quick start.
- `.gitignore` tidied up.

## 1.1.5 – 2026-09-28

### Added
- Version check in Checks (`.github/scripts/check-version.sh`): version sources agree, a changelog section
  exists, the version never goes below the newest tag, and code changes on `develop`/`main` come with a bump.

### Changed
- Versioning rules for parallel branches: one bump per piece of work, above `develop`'s version; version
  conflicts resolve to the next version above both sides.

## 1.1.4 – 2026-09-28

### Added
- Versions are tagged automatically on `main` (`tag-version.yml`): every changelog version without a tag
  gets `vX.Y.Z`. Publishing a release on that tag deploys production.

## 1.1.3 – 2026-09-28

### Added
- Production deploys from GitHub releases (`release.yml`): the tag must match the version and have a
  changelog section; empty release notes are filled from this file. Deploys the production server (once
  configured) and the Netlify site.

### Changed
- Pushes to `main` no longer deploy (Netlify builds to be stopped in the Netlify UI).

## 1.1.2 – 2026-09-28

### Changed
- UI texts use i18next's named `t` export (`import { t } from "i18next"`) instead of `i18next.t`.
- Code comments across client, server and scripts rewritten to describe responsibilities and business
  rules; most CSS comments removed. Values that lived only in comments moved to `agents/DESIGN.md`.
- New project rules: comment style (RULES #22), version bump and changelog entry per change (RULES #23).
