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
