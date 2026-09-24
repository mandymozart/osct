# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

## 2026-09-24 – Phase 1a done (QR removed)

- [x] QR scanning removed completely (components, manager, types, utils, deps `jsqr`,
      `qrcode(.min).js`, `GameMode.QR`, QR error codes).
- [x] The client had **no test files**. Added a basic suite (27 tests, `client/src/**/__tests__/`):
      `BaseStore` (change detection, cleanup, immutability), `RouteResolver`/`RouterManager`,
      `HistoryManager` + `TargetManager` (seen/persist/resume/corrupt storage), and a
      **content-config** check on the built `game.config.json` (≤ 5 targets per group, MindAR indices
      0..n-1, unique ids, referenced files exist in `public/`). These guard Phase 1c/1d/2.
- [ ] Found by the tests: `RouterManager.navigate()` with an unknown slug **throws** in
      `RouteResolver.createRoute`, so the `/not-found` branch is unreachable. Documented in a test;
      fix in Phase 2 together with `isSameRoute` (that one is an `it.fails` test – drop `.fails` when fixed).
- [ ] Browser smoke run (in-app browser, camera blocked there): home, tutorial, scan HUD, index open
      without console errors; nav bar now only shows INDEX. AR tracking needs a real device.
- [ ] `hideFromIndex` (target-008 "Edge") is an existing content flag that hides a target from the
      index. Keep an equivalent on entries in 1c/1d – don't drop it in the rename.
- [x] **Dev overlay QR generator is kept** (user, 2026-09-24): needed to open the dev server on a
      phone for testing. It was removed in 1a by mistake and restored (`qr-generator.ts`,
      `types/qr/qrcode.ts`, `qrcode.js`, `window.QRCode` type). Only in-app QR *scanning* is gone.
      Options trimmed to **Valid** + **Wrong App Version** (invalid code / wrong chapter / plain text removed).
- [x] Versions: **app version** = `game.version.version` (`__VITE_APP_VERSION__` ← `client/package.json`);
      **content version** = `game.config.json` `version` (← `scripts/package.json`, used by
      `HistoryManager` for storage versioning). The QR `osct=` param is the app version. Fixed
      `osct=undefined` (read a non-existent `import.meta.env.VITE_APP_VERSION`); removed the phantom
      `VITE_*` entries from `ImportMetaEnv` so this can't happen silently again.
- [ ] Nothing reads `?code=` / `?osct=` on page load since the scanner is gone, so "Wrong App Version"
      has no visible effect yet. Hook it into the planned versioned storage / resume check when that lands.
- [x] `beta/` (old prototype sandbox) removed on request (2026-09-24). Docs (`docs/docs/*`) cleaned
      of QR; the 2025 blog post stays as history.
- [ ] Chapter → spread rename changes persisted history (`chapterId` in localStorage). Existing
      sessions only get the "configuration changed" warning; Phase 2 re-keys history anyway.

## 2026-09-24 – Naming, cardinality, maxTrack

- [x] Page group is called **spread** (chapter → spread rename pending).
- [x] One target ↔ one entry for now.
- [x] Consulted = visited. Term: **consulted**.
- [x] `maxTrack` = max targets per spread (5); reduce after the usability test.
- [x] `/spreads` list page becomes a **dev view** for now (bottom spread menu is the user-facing selector).
- [x] Info (design frames 32–34) = the existing **About page**, restyled, in consultation mode.
      About and Info mean the same; keep the name `about`, no rename.
- [x] Entry detail becomes its own view (`/entry`); today entries expand inline in `target-item`.
- [x] Modes vs views confirmed: modes `IDLE` / `SCAN` (replaces `DEFAULT`) / `CONSULTATION`;
      each route declares its mode, `RouterManager.navigate` sets route + mode in one update.

## 2026-09-24 – Taxonomy, header, indicator

- [x] **Entries are top level.** An entry may have a target; a target may have an AR entity.
      AR entities are only videos today; 3D / other A-Frame entities may follow (to discuss
      with Kévin) → keep entity types extensible.
- [x] Header counter = consulted entries / total entries.
- [x] Image with drop shadow = found target without AR entity. Scan mode: shown, tap opens
      the entry in consultation. Consultation mode: eventually hidden, visible for now to test.
- [x] `.windsurfrules` deleted; `RULES.md` replaces it.
- [x] Folder renamed `agent/` → `agents/`.
- [x] Design PDF stays in the repo. All useful images were extracted to `reference/images/`
      (Mark, book pages, entry examples) and every page was rendered to `reference/frames/`.
      Index: `reference/README.md`.

## 2026-09-24 – Design 260804 kickoff

### Decisions
- [x] Design PDF from the designers (Virginie Gauthier, Rudy Guedj) for Kévin Bray's book
      *Onion Skin & Crocodile Tears*: `reference/design-260804.pdf`. Plan: `PLAN.md`.
- [x] Keep current libraries, work around the MindAR target limit:
      **max 5 targets per `.mind` group**. Designers keep spreads under that.
- [x] Page groups are currently spreads (2 pages). User selects the spread in a bottom scroll menu.
- [x] QR mode removed from the design → remove QR code and deps. Everything else stays and is
      restructured (home, tutorial, about, index, chapters, resume session).
- [x] "Index" mode is now called **consultation mode**.
- [x] Tutorial = onboarding flow (p.1–5), adopted not replaced.
- [x] Mark the Page = animated avatar / home button by Kévin, own component.
      Placeholder: `reference/images/mark/`.
      Final: WebM, portrait, 480p/720p (+320p/240p if memory is tight).
- [x] Videos category = AR overlays on pages. External videos are Links.
- [x] AR videos autoplay. No zoom-out hint (MindAR plays only when the target is fully visible).
      Also a video preview in consultation mode to check rendering.
- [x] Unconsulted entries: hidden in the final app, shown locked during dev (flag).
- [x] Links: embed when possible, otherwise "open in new tab". We have the rights to host linked pieces.
- [x] Accent color: gold for now, final TBD.
- [x] `.mind` preloading = browser cache only via a Preloader utility; no second scene context yet.
- [x] Plan / rules / memory live in `agents/` and are part of the repo.

### Open
- [x] Naming → spread
- [x] Entry ↔ target taxonomy → see 2026-09-24 taxonomy block
- [x] Entry ↔ target cardinality → 1:1
- [x] Consulted = visited
- [x] Modes vs views split → confirmed
- [x] `/spreads` (was `/chapters`) → dev view for now
- [x] Header counter → consulted / total entries
- [x] Found-target indicator behaviour → see taxonomy block
- [ ] Indicator visibility in consultation mode (review after trying)
- [ ] Note on PDF p.37–39 (sentence was cut off)
- [x] `maxTrack` → 5 (= max per spread)
- [x] `.windsurfrules` → deleted
- [x] Design PDF stays in the repo
- [ ] Final content → on-site session in Amsterdam, fall 2026
