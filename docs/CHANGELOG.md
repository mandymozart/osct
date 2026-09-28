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
