# Project Memory – OSCT

Decisions and context that are not obvious from the code. Newest first.
Add new entries at the top with a date. Tick `[x]` open items when resolved and note the
outcome in the line (or move it into a dated decision block).

## 2026-11-25 – The camera control and multi-select, Blender style (#369)
- Tilman asked for a perspective/orthographic switch and a view gizmo that snaps to top · bottom · left · right · front ·
  back, *"like blender"*, redesigned together with the camera's Home · Focus · fixed/free. Sketched in the chat, his
  corrections: *"in blender the gizmo is top of the screen. kevin is used to this"* · *"keep the square style of our ui.
  and make it one group"* · *"the gizmo can float"* · *"no hover state for the gismo"*.
- Result: the gizmo floats unframed at the stage's **top right** (no hover state; click an axis = that view, the axis
  already facing you = the opposite, drag = orbit), under it **one square group**: zoom (drag) · pan (drag) · reader's
  view (= Home) · persp/ortho | Focus · fixed/free. The chip at the stage's top left names the view and what the camera
  is fixed to. Axes in red/green/blue (a stage helper, RULES #38's exception), the stage's own axes.
- **Auto ortho** (Blender's Auto Perspective, Tilman: "yes"): a snap switches to ortho, orbiting away back to
  perspective; ortho set by hand stays. Ortho is the editor's only – the reader always sees in perspective (Tilman:
  *"the reader never needs the ortho camera"*). First built as a telephoto trick; Tilman: *"can we not do true ortho? three
  js supports this"* · *"fake the inbetween"* – so true ortho at rest (the editor's tracker takes over the shared camera's
  projection and flags it orthographic; the engine unchanged) and the telephoto dolly zoom only on the way.
- **The lock follows the last click** (Tilman: *"last click makes sense. if nothing is selected the scene"*): the
  active item's surface; nothing selected = the scene (the table's plane). In a view where that plane is edge-on, a pan
  moves along the screen.
- **Multi-select, cloned from Blender** (*"multi selecting. clone blender style"*): stage = viewport rules (click,
  Shift+click add / make active / remove the active, B box (Shift+drag removes), A all, Alt+A none, Ctrl+I invert);
  tree = outliner rules (Ctrl+click toggle, Shift+click range). The last click is the active one: the Inspector shows
  it ("3 selected"), the transform gizmo stays on it, F frames all. Numpad 1/3/7 (Ctrl = opposite), 5 persp/ortho.
- Left out on purpose, follow-up **#370**: circle select (C), Alt+click through overlaps, moving / deleting several.

## 2026-11-23 – A leaner stage toolbar, free panels (6.19.0, #364)
- Tilman (2026-11-23, on a screenshot of the vertical toolbar): *"we are running into a massive amount of options in the
  toolbar. perhapse its time to move some into the menu. and rethink our toolbar"*. Three drafts (A: Edit · View ·
  Camera menus in the top bar · B: each control where it acts · C: one fixed ⋯ Stage menu); he picked parts of B:
  *"putting history into the top bar makes sense"* · *"if we want the camera tools on stage we should also remove the
  snapping of windows. only limit them to not go out of the stage area. we can get rid of the 1 rem padding. the rest can
  stay there"* · asked whether panels may overlap: **overlap allowed**.
- Built: undo · redo · history in the top bar (`TopBar.svelte`, scene workspace only); the camera's Home · Focus ·
  fixed/free a column on the stage, placed by `clearCorner` (`floats.ts`: bottom right, else left past the panels in the
  way, else above the lowest panel); a panel moved or torn out by hand is `Place.free` – lies where dropped, keeps its
  size, takes no part in the layout of the others; the layout's gap is 0 (walls and between panels). `settle` and the
  12 px edge magnet are gone; a resize of a laid-out panel still makes room (#329).
- Open: the rest stays in the toolbar for now (tool, filters, render quality, grid & snap, view, live · restart) – the
  drafts' stage header for render quality / grid / view (B) and a play bar for live · restart were not taken; ask before
  moving more. A free panel can sit over the camera's only free spot on a crowded stage – then the camera takes the corner.
## 2026-11-23 – One type check for plugins: on save, in CI, before publish with Repair, osct plugins check (6.18.0, #366)
- After the 6.17.1 fix (Make it code's wrapper refused by the publish's type check) Tilman asked: *"So what do we need to
  prevent this in the future? And with older plugins as well."* Proposal (one check in more places, CI against API type
  changes, a check command over all experiences, a Repair for the known fault in the publish dialog and the command) –
  decided: *"Yes do all of the type checks too. Makes total sense to not let stuff slip through and to fix if it encounters
  one during publish."*
- Built: `shared/plugins/type-check.ts` – the one definition (options as TypeScript's numbers, the declarations, the
  `file:///check/<plugin>/<name>` layout, `isCheckedThreeType`) and `createPluginTypeChecker(ts, libs, readLib)` that
  mirrors Monaco's worker host (every file and declaration a root, current directory "", syntax + semantic errors of the
  `.ts` files). Monaco (`monaco.ts`) takes the options and `pluginCheckLibs`; the three glob moved to
  `plugins/three-types.ts`. `type-check.test.ts` runs **Monaco's real `TypeScriptWorker` class in Node** (fed fake mirror
  models), Monaco's bundled TypeScript 5.9.3 and the editor's TypeScript 6 on the same sources – identical problems – and
  every fixture plugin (the CI check, in the editor's `npm test`). The CLI uses `scripts/`' TypeScript 5.7
  (`scripts/src/lib/plugin-type-check.ts`); its tests check the fixtures too.
- My calls: **moduleResolution Bundler** (100) in Monaco too (was NodeJs) – TypeScript 6 deprecates node10, and Bundler is
  the content build's and the download tsconfig's; the worker test shows the same verdicts. Tried bumping scripts to
  TypeScript 5.9 (Monaco's) – its `tsc` then fails on Buffer/BodyInit typings in optimize-media, recognition, storage,
  targets-prepare; stayed on 5.7 (a small version gap between the CLI and the browser – open item below). `osct plugin
  push` now checks with the publish's check (was the content build's against the engine's sources). The content build
  keeps its own check (engine sources as `osct-plugin-api`).
- Repairs: `shared/plugins/repairs.ts` – `KnownFault` { fingerprint via `fix` (exact, once), `message`, `gives` (message +
  the line of the fingerprint's call) }, `repairFor`, `verifiedRepair` (re-check: the fault's error gone, no new error in
  the changed files). First entry `made-code-build`: header `Made with "make it code" from the node type "…`, the wrapper's
  `}, build);` → `}, build as never);`. The editor's `plugins.verdicts` / `checkSaved` (300 ms debounce; on the Code tab's
  opening all stored plugins, after Save one) / `repair` (re-reads the stored files, saves only if they are what was
  checked, through `autosave.queue` + `flush`, the open buffer gets the fix too). Publish dialog: `carriedPlugins` returns
  `problems`, `plugins.remember` makes verdicts, *Repair <id>* and *Show in the Code tab*.
- `osct plugins check [--experience] [--repair]` (`scripts/src/lib/plugins-check.ts`), through the existing plugin routes
  (`pluginFilesApi` – no new endpoint, so no new MCP tool). A repaired plugin is then saved by the token's owner, so
  others' plugin guard asks once more (RULES #35).
- Staging's `my-my-video-code-code` is exactly this fault: `osct plugins check --experience <id> --repair` against
  staging, or the publish dialog's / Code tab's Repair, fixes it (not run against staging – Tilman decides).
- The MCP `get_plugin` error on staging (*"Cannot read properties of undefined (reading 'matchAll')"*) is an MCP process
  older than 6.11 (it read `row.source`, which the API no longer answers); the repo's `get_plugin` reads `files` – a test
  of a several-file plugin added. Update the local osct-mcp-develop build.
- [x] osct-mcp-develop updated to 6.18.0 (2026-11-24: its processes stopped, `checkout --detach origin/develop`, `npm ci`
      in `mcp/`): `get_plugin` reads several-file plugins again. An auto-update of that local build is another session's.
- Browser check of 6.18.0 found the repair's second look seeing the old text (Monaco's worker keeps its copy of a model by
  address and version; a model made again at the same address starts at version 1) – each check now lies in a folder of
  its own (`pluginCheckPath(…, run)`). The Experiences and landing workspace tests waited a fixed number of turns – CI's
  Editor job was red from 6.13.1 to 6.18.0; they wait for their page now (30 s timeout for those two files).
- [ ] **Repair stays a button – watch how it goes** (Tilman, 2026-11-24, asked whether Publish should repair known faults
      by itself: *"lets see what will happen. learn us something about ux"*). Staging's `my-my-video-code-code` (last saved
      by Kévin) is the first real case: see who presses Repair, whether the dialog is understood, whether the plugin
      guard's question afterwards (the repairer becomes the saver) confuses Kévin. Then decide: keep the button, or let
      Publish apply a verified known repair itself and say so.
- [ ] The CLI's TypeScript (5.7) differs from Monaco's (5.9.3): bump `scripts/` to 5.9 once its Buffer/BodyInit typings are
  fixed, so the CLI's verdict is the browser's to the version.
- [ ] More known faults go into `KNOWN_FAULTS` only when the editor itself wrote them and a fingerprint is exact.

## 2026-11-23 – The landing's texts and shop, edited per experience (6.17.0, content schema 6.4, #365)
- Concept `agents/design/landing-texts.html`; decided (Tilman, 2026-11-23: *"Yes, as recommended"*): (1) texts per
  language, an EN / DE / FR / NL switch, an empty field is the app's text for that language; (2) editable: intro, Get the
  app, the QR line, the shop heading – the QR alt text, *Scan with your phone*, *Privacy & terms* stay the app's;
  (3) shop: up to 4 items (label, link, picture from the Library or the book's cover), one label for all languages,
  untouched = the app's placeholder items, emptied = no shop section; (4) stored in the experience, published in
  `landing.json`.
- Built: `experience.landing.texts` / `.shop` (`shared/types/landing.ts`: `LANDING_TEXT_KEYS`, limits intro 600, getApp
  120, openOnPhone 300 – the German default is ~150 –, shop 120; ≤ 4 items, label ≤ 120, http(s) url, `image` or
  `cover: true`), **the pick is optional now** (both or neither; hero / cover only with it – `landingPickOf`,
  `landingExtrasOf`). `landing.json` stays format 2, additive: `texts`, `shopItems` (format 2's never-written `shop` of
  item ids is gone), and `hero` may be **absent** = no pick → the reader derives the hero and keeps the file's texts and
  shop (a 6.16 reader rejects such a file and derives everything). Reader: `landingTexts(language, values, own)` →
  `withOwnTexts` (escaped, `{title}`/`{author}` and `{{…}}`, intro line breaks → `<br />`), `shopItemsOf` (none → app's,
  `[]` → no section, cover item → `data-cover`), the static landing in index.html from the content's landing.json (else
  its configuration). Editor: Texts + Shop sections (`LandingTexts.svelte`, `LandingShop.svelte`, pure edits in
  `landing-edit.ts`), the workspace holds the whole landing and saves it as one autosave subject (`saveLanding`: what
  it holds when the save runs, a new pick's hero extracted first; invalid → `autosave.hold`), the stage computes its data
  from draft + local landing (`landingDataOf`) and only `update`s the mounted page for texts/shop/language
  (`LandingView.update` keeps the hero's stage and the QR code), the focused field is outlined on the stage. The Library
  opens in the Inspector as the picker (`{ for: "shop-image" }`). API: `Landing::check` (texts/shop, blank texts dropped,
  assets base → content paths, empty landing → removed), `Landing::file` writes texts / shopItems (no hero without a
  pick), **`Landing::forReaders` drops a pick-less landing from the published game.config.json** (a 6.3 app's guard
  requires scene/target – that keeps the MINOR honest for published content). MCP: `put_experience_landing_texts`;
  `put_experience_landing` keeps texts/shop on pick and remove. Build/export carry them (a shop picture is a file of the
  folder, like the environment's). Fixture: a German intro and one shop item.
- My calls: landing.json's new shop field is `shopItems` (additive for format 2 – a new-shape `shop` would have made a
  6.16 reader refuse the file); a **content build** keeps a pick-less landing in its game.config.json (it is also the
  import's source), so a 6.3 app refuses such a build – documented in the schema table; the editor's stage shows the
  Texts section's language (it was English only).
- [x] The landing workspace's shop items (the open item of Step 3 below) – now editable per experience; the publisher
  stays the experience's book.
- [ ] Clicking a part of the stage to open its section (concept frame 2 of #356) – not built; the focus highlight goes
  the other way (field → page).

## 2026-11-23 – Plugin development with an agent: a tutorial, not a kit (#363)
- Tilman wants artists to develop and fine-tune plugins locally with Claude Code (or another agent), as he tunes looks in
  `sandbox/`. Decided (Tilman, 2026-11-23): no maintained sandbox or starter repository – *"claude or other agents can pick
  their own local framework … as agents evolve the sandbox might get outdated and it is usually super fast built"*, then
  *"we can put this in the docs as a tutorial rather than an entire repo"*, titled *"Plugin Development with Agent"*.
- Built: `docs/plugins.md` "Plugin development with an agent" – connect the MCP server, a folder from the Code tab's
  Download (or `osct plugin link`), an `AGENTS.md` block of rules to copy, the questions to ask the artist and the register
  call each answer leads to, the agent's own throwaway `harness/` (`sandbox/reveal` as the reference for the reader's
  conditions), the hand-off with `put_plugin` / `push --watch` and the stage as the check. Agents get it as
  `osct://guides/plugins`.
- Open: an MCP prompt (`plugin-starter`) that starts this interview from the client's prompt menu, if the tutorial alone
  is not enough; a page of the documentation site (#336).

## 2026-11-23 – The card pick-up is a card look a plugin can replace (6.16.0, schema 6.3, plugin API 4.1, #361)
- Tilman asked whether a plugin can replace the built-in card pick-up (it could not: `CardFlight` was hard-coded in
  `ar-scene.ts` `flyCard`). Decided (Tilman, 2026-11-23): *"yes, do it registerCardLook"* – a register call of its own,
  not `registerAppearance` with a moment `card` (a card look gets the AR scene, the camera, the page and pictures; an entity
  look gets an object and its materials) · *"experience wide for now"* – `appearance.card` only, no per-entry override.
- Built: `shared/types/card-look.ts` (`CARD_LOOKS.cardFlight` with the flight's constants as parameters: near, far, fill,
  lift, spins, impact, rumble – the defaults are the flight as it was), `appearance.card` checked by `appearanceProblems`
  against the card looks (not a `MOMENTS` entry, never falls back to `found`), `registered.cardLooks`, PHP
  `Experiences::CARD_LOOK_TYPES` + 409 `unknown-card-looks`, engine `card-looks.ts` (`playCardLook`: a plugin's look driven
  by `t` over its duration, errors end the flight; an unregistered type plays the built-in), the editor's appearance panel
  *card* section with *play* (`stage.playCard()` flies a shown target's card), MCP schema + model, demo `plugins/card`
  (`cardDrift`, named by the demo's `appearance.card`).
- Open: a per-entry card look (an entry's own override) if a book needs one; the editor's *play* flies without the book's
  cover as the back and without the entry's own picture (the reader's bridge resolves both).

## 2026-11-23 – Step (c): the Experiences page is a workspace on the shell (6.14.0, #356)
- Tilman: *"maybe it is time to rethink the dashboard and make it merely a stage without the 3d scene in the
  background"*; concept `agents/design/workspace-shell.html` frame 1, decision 1 (a workspace of its own, not an overlay).
- Built: `/editor/` on `Workspace.svelte` with `Floats("experiences")`. Stage = the covers grid (+ card, empty state,
  load error, unreadable-environment lines), scrolling inside the stage on the editor's surface – no 3D. Panels:
  **Inspector** (top right, full height, essential) with the tabs **Inspector** (quick access / New flow / the sheet –
  the old column, a region named by `columnLabel`) and **AI connections**; **Info** (bottom left, folded). Manage, New
  and the ☰ menu call `floats.showTab("inspector", true)`. All keys kept (tests: `experiences-workspace.svelte.test.ts`).
- My calls: **no History panel** – there is no cross-experience history except quick access's *Last worked on*
  (`GET /editor/recent`); HistoryPanel is per experience. AI connections is a tab of the Inspector's panel as in the
  concept; its `view`, `fresh` and `freshShown` are bindable and held by the page, so a token shown once survives a tab
  switch. Side effect: with no token yet, the first one is now made when the AI tab first opens, not on page load.
  The books keep clear of a tall panel along a side (`shelfInsets`, pure, tested) unless less than 12rem would be left –
  then they reflow under the panels (iPad upright). Checked locally (editor 5197, API 8097, scratch SQLite): the page,
  New flow, sheet, AI tab, Esc, Panels menu.
- [ ] Screenshots on the docs site: `/docs/img/experiences.webp` (the page), `/docs/img/ai-connections.webp` (now a
  tab in a panel), the tutorials' `tutorials/import/01-empty.webp` and `tutorials/demo/01-experiences.webp`. The
  sheet / New / import-preview / compare / delete crops show the same content in a panel – retake only if the frame
  matters. #356 is complete apart from these.

## 2026-11-23 – Step 3: the editor's landing workspace on the shell; the landing piece moves to `ui/` (6.13.0, #356 #355)
- Tilman: *"the editor shows the final product the landing page draft"* · *"shared ui for the landing page should be
  very little"* · the concept `agents/design/workspace-shell.html` frame 2/3, *"Yes, as recommended"*.
- **The bridge `ui/`** (alias `@ui`, beside `engine/` and `shared/`, RULES #32): `ui/landing/` – mount, markup and CSS,
  hero and scan stage, `LandingData` + `landingDataFromFile`, the shop config, `landingTexts` with the `landing`
  translations (`ui/landing/locales/`, i18next-cli writes them there – `client/i18next.config.ts` output function), the
  QR library's types, the QR/privacy link builders; `ui/brand/` – the brand's tokens (`tokens.css`, `main.css` imports it),
  `design-css.ts`, `gold-button.ts`, `escapeHtml`, the breakpoints, the onboarding icon's path, the font faces. The
  reader keeps `client/src/landing/` (entry, data loading/derive, links, language, decision) and re-exports where many
  files import (constants, strings, ArrivalService, static-splash). The client's vitest runs `ui/**` tests; `ui/tsconfig.json`
  maps `three` to the reader's node_modules (as engine/); the Dockerfile, .dockerignore and the demo workflow carry `ui/`.
- Reader build before/after (fixture): the landing's first files 36 927 → 36 848 bytes (entry 17 423 → 20 123, the
  shared chunk 11 436 → 8 613, renamed `landing-…` → `languages-…`, ArrivalService 5 017 → 5 059; index, contract-base,
  landing-config and the shared/api/landing chunk unchanged), hero 23 470 → 23 418, main 210 556 → 210 471
  (the landing's translations left the app's i18next resources – nothing called `t("landing:…")`), main.css +6 bytes
  (the tokens in their own `:root` rule). The static landing and privacy.html are byte-equal but for the hashes.
- **Workspace** `/editor/<experience>/landing/` (`routes/(app)/[experience]/landing/+page.svelte`, `Floats("landing")`):
  stage = `LandingStage.svelte` (the piece `contained`, the brand's tokens as `styles` on its shadow host, the font faces on
  the document; data = `landingFileOf` on the draft + `draftFileUrl`, `lib/landing-draft.ts`); Inspector =
  `LandingSection` with `choices` (`landingPickScenes`); Scenes = `ScenesPanel` (a card picks the scene's first AR
  target); History, Info. Saves: `saveLandingPick` (one helper for the stage menu and the workspace). Top bar *Scenes ·
  Landing* inside the crumbs; *Landing page* in the ⚙ section and the experience sheet. Checked locally (editor 5193,
  API 8093): the route wins over `[scene]`, the page renders and scrolls, the QR draws, the font is Areal inside, the
  editor's document has no brand token.
- My calls: the hero's plugins go through the plugin guard (RULES #35) – the page mounts at once without its hero, the
  hero after the answer (same render, no flash); `mountLanding` got `styles` (empty for the reader); the mark's path is
  passed by mount to the hero (no tiny extra chunk); `landing` is a reserved scene id (`RESERVED_SCENE_IDS`,
  `Scenes::RESERVED_IDS`, 400 `reserved-id`, MCP `add_scene` – the new-scene form makes `scene-<n>` ids).
- [x] (c) the Experiences page into the shell (#356) – 6.14.0, the entry above.
- [ ] The landing workspace: ~~shop items~~ (done, #365) and publisher editable (concept frame 2), a click on a part of
  the page opening its section, Privacy & terms as a second view.
- [ ] The guard lists every plugin of the experience for the hero (the hero carries them all); a hero that needs none
  could skip them (extractor, #357 or later).

## 2026-11-23 – Step 2: the landing's hero is picked in the editor, publish writes landing.json (6.10.0, schema 6.1, #355)
- Tilman: *"the landing page hero needs only a specific target on a surface on a scene to show of how they work. so that
  data can be extracted in the editor to fill in the data needed to build the landing page."* · *"the landing.json is
  fine, if we can speed up performance"* · on the kinds: *"or video or component. marginalia and links wouldnt work."*
- Built: `experience.landing { scene, target, hero?, cover? }` (content schema **6.1**, `shared/types/landing.ts` – the
  hero's type moved there from `shared/api/landing.ts`, so the stored shape is the contract's). One pure extractor,
  `shared/api/landing-extract.ts` (outside the schema lock: how the hero is made is the instance's), used by the editor
  and the MCP (`landing-draft.ts`: draft + files.json + the import's `layout.json`, stored in content paths), the
  content build (`withLandingHero` after the media renames; `client/src/game.landing.json` beside the configuration,
  synced into the version) and the reader's fallback (`derive.ts`). Pickable = an entity that draws something (any node
  but an empty group or a light, or a node with components); the default without a pick: fallback entries with a model
  → first model → first video. `landing.json` is **format 2**: the hero carries the target's `entity` only (format 1's
  model `asset` is gone – a 6.9.0 reader derives instead).
- Editor: the stage's target menu *Use for the landing page* (disabled with the reason), the Inspector's *landing page*
  section (scene link, target, up to date / out of date → Refresh, Remove) – autosaved, History shows it. No workspace.
- API: `PUT /editor/experiences/{id} { landing }` (`Landing::check`; null removes); publish writes `landing.json` before
  files.json from the stored hero + the version's texts, images, plugins and looks (`Landing::file`); **no pick → no
  file** (PHP does not run the TS extractor; the reader derives). MCP `put_experience_landing` runs the extractor itself.
- The hero renders through the engine's own `buildEntity` + `AssetStore` (the reader's path) instead of `loadGltf`:
  models, videos (keyed, muted on the landing – `setMediaSound(() => false)`), images, texts, plugin node types and
  components after `loadPlugins`. The hero chunk now carries the engine's entity builders (bigger than 6.9.0's).
- My calls: the generated file is `game.landing.json` (a `landing.json` beside `src/landing/` shadowed the barrel `..`);
  a pick also stores the layout's `cover` (PHP cannot read the layout); the export writes only `scene`/`target`.
- [x] Step 3 (6.13.0, above): the editor's landing workspace (#356 b) mounts `mountLanding` with the draft – `extractLanding` +
  `landingFileOf` give it the data without a publish.
- [ ] #357: model and texture sizes for the landing (not touched here).
- [ ] A stored hero goes stale when the entity, prints, looks or layout change after the pick; the Inspector says so,
  publish still writes the stored one (it cannot re-extract in PHP).

## 2026-11-23 – Step 1: a computer gets the landing without the app; Privacy & terms static (6.9.0, #355 #356)
- Tilman: *"the landing page hero needs only a specific target on a surface on a scene to show of how they work. so that
  data can be extracted in the editor to fill in the data needed to build the landing page. that's part one."* ·
  *"shared ui for the landing page should be very little because it basically does not need to load the app at all if
  its on desktop. including debugging and everything. a skeleton script could handle that right?"* · *"the landing.json
  is fine, if we can speed up performance. we can even build a static html and load data with skeleton animations
  progressively."* · *"privacy and terms make it static. we can link to it from the app, so we wont have duplicate
  pages"* · *"the model loading and reveal are modular i suppose so we can lazy load them after the skeleton handling
  the delegation.. since we also have catch legacy qr codes here"* · *"the editor shows the final product the landing
  page draft"* (a later step).
- Built (step 1): index.html's head decides (legacy redirect → manifest → `data-osct-landing="page|skeleton"` → early
  preload of the chosen entry), one loader module imports **either** `src/main.ts` **or** `src/landing/entry.ts`. The
  landing (`client/src/landing/`, was `components/desktop-landing/`; `<desktop-landing>` is gone from the app) is a
  function of `LandingData` + a host (`mountLanding`), imports files never barrels, no i18next (`texts.ts` picks the
  language like the detector), counts `?s=` itself; the hero (`hero.ts`, three.js) and the fallback (`derive.ts`, the
  engine's loader) are lazy chunks. On a computer: 39 kB (15 kB gzip) before the hero instead of the app's
  1.2 MB. Every experience's path gets the landing (another's as skeleton placeholders). `landing.json` shape:
  `shared/api/landing.ts` (outside the schema lock; `format` 1 + the content `schema` it was made from), docs/content.md.
- Privacy & terms: `privacy.html` (Vite input, 4 languages, a tiny language script), served for `/privacy` and
  `/<experience>/privacy` (.htaccess, dev/preview middleware, SW offline copy); `privacy` is a reserved path now. The
  in-app page, its route and the header rule are removed (Tilman asked).
- My calls: the developers' `sessionStorage["osct-desktop-landing-skipped"]` stays (it now loads the app on a computer);
  `shared/api/names.ts` split from `rules.ts` (rules pulled the whole contract into the landing's first code); Vite's
  `codeSplitting` groups `contract` / `contract-base` so the fallback loads without three.js; the landing ignores the
  debug `?content=` override.
- [ ] Step 2: the editor extracts the hero (scene + surface, #355 concept 2) and **publish writes `landing.json`**
  (`LandingFile`) into the version folder – the reader reads it already.
- [x] Step 3 (6.13.0): the editor's landing workspace (#356 b) mounts `mountLanding(host, data, { contained: true })` with the
  draft; the host must provide main.css's tokens and the font.
- [ ] Open: the static privacy page names the default experience's book; another experience's title/author come only
  from its `landing.json` (none before step 2).

## 2026-11-23 – One workspace shell for the editor, after SCUTOONS (#356)
- Tilman: *"maybe it is time to rethink the dashboard and make it merely a stage without the 3d scene in the background.
  this way we can also load the landing page. look at how scutoon is using the panels and the stage now. lets adopt the
  basic concept"*; concept `agents/design/workspace-shell.html`, *"Yes, as recommended"*: the stage is the whole window,
  the address decides what it shows, panels float over it; three workspaces – Experiences (`/editor/`, a page of
  books), scene (3D engine), landing (`/editor/<experience>/landing/`, the reader's landing live; hero scene/surface,
  shop items, publisher in the Inspector, stored in the experience). The Experiences page is a workspace, not an overlay.
- Order: (a) lift the shell out of the scene page (`editor/src/lib/components/Workspace.svelte`, 6.7.1, nothing visible
  changes) · (b) the landing workspace + content fields (#355) · (c) the Experiences page into the shell.
- Tilman: *"try here offline so we can see if this works nicely. and only then push, because they are editing atm"* –
  the work is on `feature/356-workspace-shell` (worktree `../osct-356`), checked locally (editor on 5186, API on 8086)
  before it goes to develop.

## 2026-11-23 – A plugin is a folder of files: file tabs in the Code tab (#352, 6.11.0)
- Built on `feature/352-plugin-files` (worktree `osct-352`), reviewed by Tilman and merged into develop as 6.11.0.
  Content schema 6.2 (the file rules in `shared/`; #355 took 6.1), export file format 2; no MAJOR was needed (correcting
  the line below). Deleting a file is a saved change Undo brings back; plugin changes revert in History. What was decided while building: `agents/research/2026-11-23-plugin-files.md` "Built".
- Tilman: *"folders in the tab … allow us to see what a plugin is made of … download would make them distributable"* ·
  *"no file tree. just file tabs. like shader toy"* · shaders: *"Keep both"* (the plugin's own tabs and the Library's shared
  ones). Option A over B (opaque uploaded bundles): the files are the truth everywhere; esbuild-wasm bundles in the
  browser, Monaco's TS worker type-checks at Publish (half of #266); `osct plugin link/push/pull` from an IDE; no versions
  of our own; 256 KB per file hard, bundle warning at 256 KB, 1 MB per plugin. Export carries `{ id, files }` (schema MAJOR).
  Note: `agents/research/2026-11-23-plugin-files.md`; draft `agents/design/plugin-files.html`.
- [x] Today's trap until it's built: a multi-file plugin from the content build opens as its `index.ts` alone; Save
  makes a stored copy whose sibling import fails at Run and Publish – gone in 6.11.0 (`files.json` next to `plugin.js`).
- [ ] The demo's aquarium as the example of several files (its fluid, its shaders) – content work on staging after the
  merge.

## 2026-11-23 – The desktop landing: a computer never enters; a 3D scan stage in the hero (#354, 6.7.0)
- Tilman: *"the desktop does not allow to enter the experience. you need to switch to phone or tablet. and you cant
  install on desktop either"* – "Open the app here", the install button and its notes are gone (an agreed removal, RULES
  #1). Only developers pass: `sessionStorage["osct-desktop-landing-skipped"] = "1"` (docs/pages.md).
- Also removed on his markup: the kicker, the three steps (*"it should be self explaining"*), the phone mockup, the Mark
  above the title (it sits on the stage's phone screen now).
- The scan stage (`desktop-landing/scan-stage.ts`) was designed live in the preview with Tilman, round by round, instead
  of concept sketches first (he asked to *"experiement with the animation as we go"*). It reads everything from the
  content – the print layout's cover and spreads, the scene and model of `LANDING_CONFIG.scanEntries`, the experience's
  plugins and looks – so it is the first candidate for the landing's slots of #355.
- The phone's screen is a second camera rendered into a texture (not a stencil window): it magnifies, shows the model as
  the reader draws it over the camera picture, and can film the page's own text (a copy on `TEXT_LAYER`).
- [ ] The local content folder (`osct-content/content`) is still in the pre-experience format (no `experience.yaml`):
  `npm run build` fails against it; the build check for #354 ran against `fixtures/content`.
- [ ] The scattered images of the hero overlap the stage in places – Tilman did not ask; left as is.

## 2026-11-23 – The landing per experience: a scene and a surface, nothing else (#355)
- Tilman: *"for the landing page animation, the user just has to choose a scene and a surface. the animation will load
  that as preview. should be enough information without manually setting things"*, *"a light weight solution in the
  editor"* – concept 2 (`agents/design/landing-cms.html`) replaces the slot editor of concept 1: one **Landing page**
  section in the experience's settings (Scene, Surface), `experience.landing: { scene, surface }`, the hero plays that
  surface with the engine. Everything else comes from the experience and the app's texts.
- Left out: picked images / own texts, shop items (stay in `landing-config.ts`), publisher and privacy additions per
  experience (with the white label, #347).
- [ ] Build **after #354** (Tilman: *"Yes, after #354"*) – its branch must merge develop ≥ 6.6.0 first (footer link, `LANDING_FREE_PAGES`).

## 2026-11-23 – Privacy & terms: one page in the reader, under Dutch law (#353, 6.6.0)
- Tilman: *"terms and conditions, privacy and applicable to european law. building fictions is based in Amsterdam"*;
  concept `agents/design/privacy-terms.html`, *"build as sketched"*. Details from buildingfictions.com/About and /Terms:
  Building Fictions, Lauriergracht 116W, 1016 RR Amsterdam, KvK 58614796, info@buildingfictions.com (`PUBLISHER` in
  `client/src/pages/privacy-page.ts`). The text is the app's (`privacy` translations), not the book content's.
- The desktop landing stays away from `/privacy` (`LANDING_FREE_PAGES`, in the inline decision too) – its footer links there.
- [ ] Building Fictions (or a lawyer) checks the wording before release; change `PRIVACY_CHANGED` with every change of meaning.
- [x] The server's host: Hetzner Online GmbH, Germany (Tilman, 2026-11-23; 6.6.1).
- [ ] How long server logs are kept – not known; the page says "only as long as needed". Add the days once decided (#9).
- [ ] White-label instances need their own publisher and text (STRATEGY) – not now.

## 2026-11-23 – Other sites' videos and pages wait for the reader's yes (#351, 6.5.0)
- Tilman: *"a player that embeds the youtube but asks to confirm since this is third party embed which does tracking a
  cookies. like big newspapers do this with a disclaimer that has to be confirmed before loading the iframe"*. Concept
  `agents/design/video-consent.html`; Tilman: *"Yes, build it"* – with the recommendations: *Always for <provider>*
  offered unticked and taken back in Settings; embedded **pages** gated too, one *Always* per host; the entry's own
  `image` as the card's poster (never the provider's thumbnail).
- Consent is per device (`osct-embed-consent` in localStorage), not on the account – RULES #33's consent is the account's
  newsletter options; this one is the browser's own, like the other reader settings.
- [x] The app's privacy page names YouTube / Vimeo as loaded on request and the card links to it (#353, 6.6.0); the card's
      wording is checked together with that page.

## 2026-11-22 – Which PDF is the book: the final preview spreads, not the litho print (#349)
- Tilman's *very final* version is `OSCT_FULL_preview_spreads_HIGHRES.pdf` (Virginie's Dropbox "Higher Res Exports for
  Tilman", 1 114 098 658 bytes – the same file as `osct-incoming-content/final-2026-11-19/`). `OSCT_LAST_LithographyPRINT.pdf`
  (InDesign 2 Nov, single pages with 7.41 mm bleed) is an **older** layout: pictures moved, page 256 still has the paper
  figure, the matter has embossed textures. Never take positions or backgrounds from the litho PDF.
- Checked against the final: 1367 of 1368 targets on staging lie where it prints them (`p188-7` only not recognised by the
  comparison); 133 of 135 backgrounds match. s1 and s256 had older page images (#251) – replaced with the final's pages.
- The cover, the front and back matter and the pages next to 1 and 256 had no targets (the delivery ends at P255):
  78 added on staging from the final's pictures, **all switched off** (Tilman), ids `<scene>-t<N>` (`front-2-t3`,
  `back-cover-t1`), the sponsor logo and the QR code left out. Files and placements: `osct-incoming-content/2026-11-22-final-matter/`.

## Archive (read this first)

Entries from before 2026-11-01 moved verbatim into `agents/archive/MEMORY-<year>-<month>.md` (#31, 2026-11-20);
see `agents/archive/README.md`. Below: the open `[ ]` items still sitting in those entries, then the newer entries.
The index of all archived entries is at the end of this file. Search the archive with `grep -rn "<term>" agents/archive/`.

## Open items in the archive

Verbatim from the archived entries (the entry title and archive file in front of each group). Tick them here when resolved.
**2026-10-31 – every on/off is a switch (#241)** (`MEMORY-2026-10.md`)
- [ ] **Open**: should the tree's eye become a `Toggle` after all (Tilman's call); the *placement* link as a nested
  `Section`.
**2026-10-31 – texts inside the editor: the book search in the top bar, the book in the Inspector (#237)** (`MEMORY-2026-10.md`)
- [ ] The tutorial page's chapter 5 has no new screenshots yet (the search, the book in the Inspector, + entry): taken in
**2026-10-31 – plugin code in a sandbox: the editor's stage in an opaque-origin frame (#234)** (`MEMORY-2026-10.md`) – **superseded 2026-11-21 by #340** (the sandbox dropped)
- [ ] **The reader's plugins and the session** (above): Tilman's "no sandbox in the reader" (2026-10-29) predates the
  one cookie for the site (#207), which puts an editor's or admin's session within reach of a published plugin in the
  reader. Whether that changes it is his call: sandbox the reader's scene (camera delegation, the 8th Wall files for an
  opaque origin, offline content), or serve the editor and its API from an origin of their own so the reader's pages
  never hold an editor's cookie (deploy config).
- [x] **WebGPU in the frame** (the aquarium's fluid): moot – the frame went with #340 (2026-11-21), the stage runs in the page.
- [x] **The frame on the phone** (the S22): moot – no frame since #340.
- [x] **A header policy for the frame**: moot – no frame since #340.
**2026-10-31 – plugin labels mark only unsaved (#232); a toggle per pass and the UI principle (#233)** (`MEMORY-2026-10.md`)
- [ ] **Follow-ups of the principle** (each needs its own issue; most need a content field = a schema MINOR):
**2026-10-31 – plugin passes in post-processing, content schema 2.21 (#216)** (`MEMORY-2026-10.md`)
- [ ] Decide whether a pass gets an on / off of its own (a contract field) or removing it stays the off (#216).
- [ ] Measure a plugin pass (the demo grain) with the built-in chain on the S22 – part of #86.
**2026-10-31 – plugin API 1.6: GPU feedback buffers, the demo's ink painting (#225)** (`MEMORY-2026-10.md`)
- [ ] Measure the ink painting on the S22 at 256 and 512 (#225).
**2026-10-31 – no Stage tab: the spread in the Inspector, the preview settings in the toolbar (#229)** (`MEMORY-2026-10.md`)
- [ ] The demo book in the local SQLite is older than `fixtures/demo` (the key has the `key` component, no behaviour, no
  aquarium): the tutorial's `12-behaviour.webp` (the behaviour line in the timeline) still shows the Stage tab – retake
  it after re-importing the demo. The demo's own texts (entry bodies, the layout image) still say "Entity panel" /
  "Stage panel" – content, changed with the next demo edit.
**2026-10-31 – the demo aquarium's water is Splash in WebGPU, the heightfield its fallback (#228)** (`MEMORY-2026-10.md`)
- [ ] The S22: frame cost of the fluid with WebGPU on Android Chrome, and the canvas upload there (#228's checklist).
**2026-10-30 – the browser session in an HttpOnly cookie, CSRF token on writes (#207)** (`MEMORY-2026-10.md`)
- [ ] Open: **remove the token exchange** (`POST /auth/cookie`, `Auth::exchange`, the editor's `exchangeStoredToken` and
  `LEGACY_TOKEN_KEY`, the reader's `StoredSession.session` / `exchangeStoredToken` and `canSync`'s check) a few releases
  after #207 is on production – once browsers signed in before have started once. Keep the Bearer session answer for
  non-browser sign-ins (MCP).
**2026-10-30 – engine cleanup: one behaviour vocabulary, no reader traces, AR errors as codes (#213)** (`MEMORY-2026-10.md`)
- [x] (Reworded in 5.0, #334 L-T5.) Open: `shared/types/behaviour.ts` still says of `BEHAVIOUR_SCOPES` and `BEHAVIOUR_CORE_EVENTS` that "a test keeps
  them equal" with the runtime's – now they are the runtime's (the test checks identity). Reword with the next schema
  bump that touches `shared/types/` (a comment alone would need one, RULES #10).
**2026-10-30 – the second code review (#19, develop at 1.50.0)** (`MEMORY-2026-10.md`)
- [ ] Legacy kept for older data, to remove once no instance needs it (RULES #1/#15 – ask first): the `users.role`
  mirror and `GET /user`'s `role` field "for older readers" (`Roles.php`, `Users.php`; the column stays, RULES #25);
  `POST /admin/editors` "the older way to make an editor" (still in docs/editor.md); the one-time move out of
  `server/api/db/` (`Paths.php`, `index.php`); a `latest.json` without `book` (`ContentStore::live`); a book imported
  before `imported_json` (`Books::comparison`, `editsSince`); a declared plugin of a build without recorded specs
  (`Editor.php`, `Books::parse`).
- [ ] `editor/package.json` carries 1.10.1 while the app is 1.50.x – RULES #10 does not list the editor (proposed).
**2026-10-30 – Publish to the own environment, import comparison, the content store (#183, #197)** (`MEMORY-2026-10.md`)
- [ ] After the merge, check on the FTPS staging that `api/content-store` and `api/var/log/error.log` exist and
  `api/db/` has only the schema (an FTP listing); else the error log says why the move failed.
**2026-10-30 – The demo video's tooling (#195)** (`MEMORY-2026-10.md`)
- [ ] **Make it code on the aquarium's tank leaves the tank empty on the stage** (found while recording, 1.42.0): the
  plugin's `FISH_COLOURS` lives in `register()` outside the builder (`fixtures/demo/plugins/aquarium/index.ts:146`),
  `make-code.ts` copies only the builder, so the generated `tank-code` throws; *Run* does not bring the tank back, a
  reload does. The generated code also shows TypeScript squiggles. Needs an issue (the worker could not file one); the
  video uses *make it code* on the key's model instead.
- [ ] The phone's sheet dragged **down** shows black under the stage until the canvas resizes on release (headless Edge,
  CDP touch) – worth a look on the S22.
- [ ] Android's default blue tap highlight flashes over tapped links in the editor on a phone (the books page's cover
  link) – `-webkit-tap-highlight-color: transparent` with a visible `:active` state would be calmer.
**2026-10-30 – Touch height, tablet portrait, words as labels (#171, #172, #173)** (`MEMORY-2026-10.md`)
- [ ] The default stage view has a fixed vertical field of view (as the reader's camera intrinsics): on a tall, narrow
  stage (a tablet in portrait, 327 × 984 px) the book fills the height and is cut at the sides until the author zooms
  out. Fitting the view to the stage's width would change what the "reader's view" simulates – a decision for Tilman.
- [ ] A touch tablet in portrait with the tree opened leaves the panel 272 px: its head (× ‹ › and five icons at 44 px)
  scrolls sideways there – the documented fallback.
**2026-10-30 – The plugins' recorded specs (#90) and the MCP tools for the new endpoints (#174)** (`MEMORY-2026-10.md`)
- [ ] Plugin passes: recorded, listed by `describe_content_model`, but the guard, the build and the API still take
  built-in pass types only (#97).
**2026-10-30 – A video's size and duration on upload (#91)** (`MEMORY-2026-10.md`)
- [ ] Image nodes are 1 × 1 planes and the library knows an image's size too – `+ node` could start them at
  `[1, h/w, 1]` the same way; not done here (not asked in #91).
**2026-10-30 – Typed boundaries and test gaps (#28, #29)** (`MEMORY-2026-10.md`)
- [ ] Still open from #28 (`PlacementData` removed in content schema 2.24, #214): `BaseStore`'s
  `propertyListeners` cast. From #29: `loadBuild` still re-implements the pipeline, the server matrix (PHP 8.1, MySQL),
  `service-worker.ts` and the AR scene lifecycle.
**2026-10-30 – The Library as the picker; entry category vs what appears (#164, #165)** (`MEMORY-2026-10.md`)
- [ ] iOS Safari may grey out `.glb` files in a file picker (no system type for glTF); the model upload names the
  media types next to the extensions. Check on an iPhone / iPad.
**2026-10-30 – Local MariaDB in Docker, staging's data, the API test on MariaDB (#168)** (`MEMORY-2026-10.md`)
- [ ] Open: once staging is on the Kamal VM, check the SSH route of `pull-staging.sh` against the accessory
  (`STAGING_DUMP_COMMAND="docker exec -i -e MYSQL_PWD osct-staging-db mariadb-dump"`, docs/server.md "Staging's data").
- [ ] Open: the real staging pull is untested here (no credentials in this session) – the script was checked against
  a second database in the local container, directly and over a stand-in for ssh.
**2026-10-30 – The editor's selection levels and the tree's hierarchy (#162, #163)** (`MEMORY-2026-10.md`)
- [ ] Not checked in a browser or on the S22 (this session ran no dev server): the drag with a mouse and a finger,
  the selected row's contrast in day and night, the target outline on the stage.
- [ ] Open: renaming in the tree itself (double click / F2), moving a node to another target's entity.
**2026-10-30 – An MCP server over the editor's API, after SCUTOONS' model (#75)** (`MEMORY-2026-10.md`)
- [ ] Open: ~~personal access tokens (SCUTOONS' `sct_` tokens, "AI connections" on the account page) when a non-developer
  connects~~ (done: `ApiTokens.php`, #142); a one-file build + Claude Desktop extension; a headless render of the stage for the agent (follow-up issue).
**2026-10-30 – The demo book and the plugin API 1.1 (#80, decided alone – to review)** (`MEMORY-2026-10.md`)
- [ ] Open: #88 (~~an animated GLB for the key, a tap button and editable variables in the Stage panel~~ – done
  2026-10-30, see above; the `behaviour` component and declared variables, bubbling scopes, two spreads on one stage); the Entity panel's rows
  now follow the engine's plugin load (`plugins.version` bumped when the scene runs) – a small fix found by the demo.
**2026-10-29 (night) – Code in the editor: plugins (#66, decided alone from the concept – to review)** (`MEMORY-2026-10.md`)
- [ ] Open: how the content schema version relates to the app's and the editor's versions (today: MAJOR refused,
  MINOR ignored – RULES #10; the editor reads the same engine).
**2026-10-29 – The stage's desk is our own Eiermann model (#68)** (`MEMORY-2026-10.md`)
- [ ] Open: the frames' finishes (dark metallic steel, Schöpfer's white; chrome would be a material change in the
  script) and Schöpfer's leg geometry (four straight splayed legs read from one photograph). – Schöpfer's part done
  in #187 (black powder coat, the catalogue's frame); the Eiermann's graphite stays as #184 left it.
**2026-10-29 (evening) – The boundary: engine, reader, editor (#61, Tilman decided, then "durchziehen")** (`MEMORY-2026-10.md`)
- [ ] Open after the night: staging's `CONTENT_STORE=bunny` + credentials (GitHub environment); MariaDB against the new
  tables; the phone layout of the workspace; entries / texts / media editing (step 2b); the plugin API (steps 3–4).
**2026-10-29 – Editor, first step: `/editor` over the mock stage (#61, overnight after Tilman's go)** (`MEMORY-2026-10.md`)
- [ ] Open (Tilman): 35 cm / 30° as the reader's view, or measure; the desktop default could start closer (20 cm).
**2026-10-28 – Entity animations shorter (#57, Tilman)** (`MEMORY-2026-10.md`)
- [ ] Tilman tests on the phone (video and 3D target). If video still feels long: a duration factor per entity type
  passed to `celebrate()` – only after the global values have been tried (#57).
**2026-10-28 – Camera defaults: main lens, continuous focus, engine size; iOS below 16.4 cannot scan (#37, Tilman, 1.9.0)** (`MEMORY-2026-10.md`)
- [ ] Open: where the dev QR codes live in the long run (Tilman; options: desktop only, a dev page with every spread's
  QR, or QR codes from the content build) – not filed as an issue yet.
- [ ] Open (found on the iPhone 7, not #37): the onboarding **Continue** button is unstyled on Safari 15 (likely CSS
  nesting or `color-mix()`, Safari 16.x); the trial panel's top bar cannot be dragged on iOS 15.
- [ ] Open: check the camera choice on a recent iPhone (Safari reports "Back Camera" etc.; no lens rewrite on iOS).
**2026-10-28 – Code base review (#19)** (`MEMORY-2026-10.md`)
- [ ] Open (#5): the `content/` fallback in `scripts/src/config.ts` (the "while it is in git" CI step is gone) goes with
  the content removal; RULES #8 says so.
**2026-10-28 – Content deployment apart from the app: versions + strict purge; content schema MAJOR.MINOR (#5, Tilman, 1.7.6)** (`MEMORY-2026-10.md`)
- [ ] Open (Tilman): `staging/` still holds the leftovers of the in-place sync of the same day (`game.config.json`,
  `files.json`, `assets/` at the environment root). `npm run osct -- content purge --env staging --unknown`
  (or the Content button with "unknown") removes them – try `--dry-run` first.
- [ ] Open: #15 – trial videos go through the same sync once they are part of the content folder outside git.
**2026-10-27 – Sessions start with their issue; deploys move issues on the board (Tilman, 1.7.1, #11)** (`MEMORY-2026-10.md`)
- [ ] Open (Tilman): repo secret `PROJECT_TOKEN` (classic PAT, scope `project`); runs only once on `main`.
**2026-10-27 – Preload flow analysis, engine view and load test (Tilman, 1.7.0)** (`MEMORY-2026-10.md`)
- [ ] Run the load test on an iPhone; check the growing window on the phone (time until the whole book is held,
  stutter while it grows).
- [ ] Find why the base frame rate is ~14 fps (production build vs dev server, overlay/panels, video textures,
  look-around, content preload in the background).
**2026-10-27 – Trial content: delivery 2110 imported, trigger protocol (Tilman)** (`MEMORY-2026-10.md`)
- [ ] Open: trial on the printout (S22, iPhone) → results; texts and URLs from Kévin; video ↔ trigger questions above;
  whether the 10 Print images missing from the PDF are printed in the book.
**2026-10-27 – Sign-in mails through Amazon SES (Tilman, asgerb)** (`MEMORY-2026-10.md`)
- [ ] Open: SES SMTP credentials from asgerb / Building Fictions → GitHub environments `production` (and `staging`);
  then `mail-test.php` against a real inbox. Issue #12 (milestone Release Japan) is written for asgerb; his
  collaborator invite (write, sent 2026-10-27) is pending – assign #12 to him once he has accepted (Tilman).
**2026-10-27 – Deployment with Kamal; issues on the OSCT board (Tilman)** (`MEMORY-2026-10.md`)
- [ ] Open: first `kamal setup -d staging` / `-d production` once the server exists; DNS of both domains; move the
  staging users database from all-inkl; shut down Netlify + all-inkl (issues on the board).
**2026-09-28 – 1.4.0: optional password, one sign-in form (Tilman)** (`MEMORY-2026-09.md`)
- [ ] "Password changed" notification email (mail texts en/fr/nl/de) – not built.
**2026-09-28 – Demo spreads from the layout PDF for the tracker load test (Tilman)** (`MEMORY-2026-09.md`)
- [ ] Load test numbers with "all" vs ±1: time to first find, frame rate.
**2026-09-28 – 8th Wall spread switches: neighbours kept loaded (Tilman: "save switch times")** (`MEMORY-2026-09.md`)
- [ ] Measure the cost of more loaded targets (≤ 15 with ±1 and 5 per spread): time to first find and frame
  rate on the current spread, compared with only its own targets loaded.
- [ ] How many targets the engine can keep loaded is unknown (Tilman) – find out in this phase; the neighbour
  range (±1) is the knob (debug bar setting, then a load test).
**2026-09-28 – 8th Wall tracker built side by side with MindAR (Tilman: "build a working version")** (`MEMORY-2026-09.md`)
- [ ] Phone comparison S22 + iPhone (staging with the debug bar): time to first find, jitter, lag, angles, frame
  rate, heat, first-scan load time. Also check: iOS motion permission prompt, pause/resume, camera orientation.
**2026-09-28 – Exploration "webworker tracking" (Tilman; branch `claude/laughing-wright-hrt8zy`)** (`MEMORY-2026-09.md`)
- [ ] Final target images ≥ 1000 px, textured (with the artist) – helps any tracker.
**2026-09-28 – `.mind` compilation in the content builder (Tilman, branch `compilation`; PLAN Phase 12)** (`MEMORY-2026-09.md`)
- [ ] Open: target images much larger than the printed size (e.g. `edge/images-060.jpg`, 2059×1796)
      make the `.mind` and the compile bigger/slower – downscale in the build (e.g. max 1000 px)? Needs a
      tracking test on the book first.
**2026-09-26 – PWA (Tilman: "do the PWA now"; PLAN Phase 9b)** (`MEMORY-2026-09.md`)
- [ ] Final app icon; whether the whole download should start by itself later – Tilman.
**2026-09-26 – Performance: three.js instead of A-Frame, static splash (Tilman, branch `performance`)** (`MEMORY-2026-09.md`)
- [ ] Open: iPhone test (Safari video textures, camera), Lighthouse on the deploy preview.
**2026-09-26 – Sounds and haptics (Tilman)** (`MEMORY-2026-09.md`)
- [ ] Open: test on an iPhone (iOS 18 haptic trick, silent switch mutes web audio).
**2026-09-26 – Video filters (Tilman, tested on the phone)** (`MEMORY-2026-09.md`)
- [ ] Open: only one filter type exists; several filters of different types would need a shader chain.
**2026-09-26 – No resume prompt, storage notices, links just route (Tilman)** (`MEMORY-2026-09.md`)
- [ ] Open: translate book content (entries, onboarding steps, book info)? Needs per-language fields in the
      content YAML and the build – Tilman / Kévin.
**2026-09-25 – Design review: colors measured from the PDF** (`MEMORY-2026-09.md`)
- [ ] Device check: `background-clip: text` over descendants (the list-wide gradient) on iOS Safari.
**2026-09-25 – Phase 4 consultation mode built** (`MEMORY-2026-09.md`)
- [ ] Open (PLAN Phase 4): entries without a target can't be consulted by scanning; list colours (white /
      gold in the frames); final Info texts; `index-page` & co. as removal candidates.
**2026-09-25 – Preloader** (`MEMORY-2026-09.md`)
- [ ] Open: ~~production cache headers for content~~ (the CDN's); iOS range requests for preloaded videos (Phase 7).
**2026-09-25 – Phase 2 step 2 done (progress storage)** (`MEMORY-2026-09.md`)
- [ ] The index still lets you open entries that are not unlocked (→ consulted without unlocked). Phase 4
      hides/locks unconsulted entries.
- [ ] Pre-existing: the resume notice goes through `notifyError` (logged as console error, `currentError`
      stays set after "Resume"). Candidate for `Pages.NOTIFICATION` (Phase 3).
**2026-09-24 – Phase 1d done (entries) + Phase 0 constant** (`MEMORY-2026-09.md`)
- [ ] Build validation stops at the first blocking error per entry (e.g. duplicate target), so later
      checks for that entry show up on the next run.
**2026-09-24 – Phase 1c rename done (chapter → spread)** (`MEMORY-2026-09.md`)
- [ ] Pre-existing bug (not from the rename, verified on the pre-rename commit): switching spreads
      while MindAR never started (camera denied) throws `Cannot read properties of undefined (reading
      'stopProcessVideo')` from MindAR during scene teardown (`static-scene-bridge.ts`). Guard in
      the scene bridge, relevant for Phase 3 spread menu switching.
**2026-09-24 – Design 260804 kickoff** (`MEMORY-2026-09.md`)
- [ ] Note on PDF p.37–39 (sentence was cut off)
- [ ] Final content → on-site session in Amsterdam, fall 2026

---

## 2026-11-22 – Import / export as one feature: the experience package, quick starts, a Start page (#346)

Tilman: *"make it a real import/export feature … zip file is the goal. self containing. can be used to transfer content
between installations … basic pdf import or image import with drag and drop for quick starters … part of the New experience
or start experience section … a page that is eventually publically available"* (white label, #44/#53). Concept:
`agents/research/2026-11-22-import-export-package.md`; drafts: `agents/design/import-export.html` (8 frames). Builds on #322.
- [ ] Tilman's decisions 1–10 (concept §5; summary in #346) – then tickets P1–P11 (§6).

## 2026-11-22 – Animus XR: an XR experience provider product of Tilman's own, white label; first use case free poster XR (#347)

Tilman: *"think xr experience provider platform here with free versions having certain limitations. first use case,
via qr.viennastruggle.at I want to provide free poster xr. we can use the platform to host it."* – *"if a experience
is free it is branded by our own brand as marketing so people create their own"* – *"maybe as provider we can use
scutoons since it is called scutoons animus xr anyhow … xr.scutoons.com. we run our own db and cdn for this one so
anyone hosting scutoons with us gets data delivered from there. we run on a shared hoster like staging."* – *"we might
even have to come up with our own domain. maybe animusxr.com is fine or an equivalent"* – *"important it is a product
provided by me, and a white label solution which i can also integrate into other products of myself."*
- The model in the drafts: **Animus XR** is Tilman's product (white label; core scutoons-animus-xr). One DB and CDN of
  its own on a shared hoster like staging (the "Animus XR cloud"); his products are hosts on it – `xr.scutoons.com`,
  `qr.viennastruggle.at` (free poster XR, the first use case), `animusxr.com` – each domain a CNAME, the host picks
  the brand. Free experiences carry the host product's brand ("made with Scutoons" / Vienna Struggle / Animus XR).
  Clients with their own instance (Building Fictions) see no trace of it.
- This moves STRATEGY.md ("no platform until demand", "Scutoons as the second instance") – update it once decided.
- Mock-ups: `agents/design/white-label.html` (11 frames: overview, brand editor, reader per brand, free = host brand,
  access, ownership and domains, QR codes, newsletters, arrival landing, plans and limits, poster XR).
- [ ] Open (Tilman): product name and domain (`animusxr.com` or an equivalent – availability not checked); one DB for
  all host products or one each; free limits; paid plans now or later; roles per experience; own domains per
  experience; newsletter lists per experience; creator sign-up open or invited; moderation – each frame's "Decide"
  note. Plus the nine decisions of `agents/research/2026-11-22-white-label-branding.md` §5.

## 2026-11-22 – the experiences page: books left, a context column right; export file, make live (6.3.0, #348)

- Tilman (2026-11-22, on the experiences page screenshot): *"new is more of a step by step … under the three dots under
  each experience one can select export, replace, versions … new and import can also go into the top right menu"* – *"the
  right side is still smart"* – *"nothing is clicked, the right side shows cards new experience and import and last worked
  on. so we use it as quick access menu"*. Confirmed afterwards: rollback = **make live with a confirm** ("rollback is
  nice"), Last worked on **from the server's history**.
- Built so: a click selects (the sheet), double click / Enter opens, arrows / Esc; quick access (New, Import, Last worked
  on – `GET /editor/recent`, one row per experience and scene, five); New step by step (Start → Name → Create); Import = New
  with *From an export*; the sheet (Open, Export, Replace…, Versions + make live). The old `ImportForm` / `NewExperienceForm`
  are gone – their functions are in `ImportSource` (the one source reader: File / URL / Published), `ImportCompare`,
  `NewExperienceFlow`, `ExperienceSheet`.
- *My calls*: **the export file is an import body** (`{ format: "osct-export", configuration, files, assetsBase?, sources }`,
  `GET …/export/file`) – no zip: the media stay on the CDN and are named by URL, so the file is small and Import (File) reads
  it as it is. The Code tab sources travel in it and the import saves them (`sources`) – otherwise an export of a book
  with unpublished plugin code could not come back. The import got `rename` (the configuration becomes `{id}`'s), `title`,
  `create` (the slug rule of `POST /editor/experiences`, one implementation) and, from the CDN, `experience` – New from an
  export / a published version and Replace with another experience's export need them. *Published* lists the experiences
  live on this instance's environment (the CDN base is the own environment's), not only the default.
- **Make live** (`POST …/versions/{build}/activate`): only this instance's environment (as Publish), refused to an AI
  connection's token (as Publish – the MCP's `activate_version` works with a session sign-in only), 409 when the build's
  `game.config.json` is gone (purged) or its schema MAJOR is not today's. The publish log gets a row with the note *Made live
  again – the version of …*; no new column. A build stays in the store unless `osct content purge` removes it by hand.
- **`%3Cslug%3E`**: the form passed the literal `<slug>` through `readerPath` (which encodes); now `addressPreview` shows
  `https://<instance>/…/` until there is a slug.
- **CDN import server-error**: not reproduced. Staging's `preview_import` (MCP, source cdn, osct and demo) answers 200 today;
  locally the preview of staging's CDN works with and without an existing 1376-entry draft, and staging's server code has
  not changed in that path since 6.2.3. I could not read staging's error log (SSH was refused here). The CDN read now turns
  any unexpected error into 502 `content-fetch-failed` with its message and logs where – if it comes back, the editor shows
  the real cause.
- Checked locally (SQLite API with `CONTENT_BASE_URL` = staging's CDN, read only; headless Edge): quick access, New step 1
  and 2, the ☰ entries, a sheet with versions, the make-live confirm, Replace's source and comparison – day and night. The
  make-live itself and Replace were exercised against the local API only.
- [ ] Open: the tutorials page's import screenshots (`client/public/docs/tutorials/import/*.webp`, `demo/01-experiences.webp`)
  still show the old right-column form – the text is updated, the pictures need a retake with a book on the CDN.
- [ ] Open: `php -S` answers one request at a time – locally a source whose *assets at* points at a dead port (the 5174
  default) waits for the connection timeout before the preview; not an issue on a real host.
- [ ] Open (Tilman's call): make live for production from the staging editor is not offered (an instance publishes to its
  own environment only); production's editor shows the button for production.

## 2026-11-22 – Publish is one overlay: confirm, running, done; the rest behind Details (6.2.4, #345)

- Tilman (2026-11-22): *"there is lot of information that is kind of useless on this dialog … i dont need to know the
  version hash for example or transpilation warning etc. a little log hidden behind a details expandable could be nice
  … can also be hidden behind a ctrl + l … this first dropdown dialog should be much more on point. i think it can also
  just go into the overlay as well, as a confirmation step before it starts."* He approved the draft: three states in one
  centered overlay over the dimmed page. Built so (`PublishButton.svelte`, words in `publish-overlay.ts` with tests):
  **confirm** (*Publish “…” to staging?*, *Readers get this state.*, *Last published: today 07:53*), **running**
  (*Writing the build…* → *Live for readers ✓*, *Archive n / N* bar), **done** (*Live on staging. n files new, m were
  already there.*, Close, *Open reader*, closes itself after 2 s unless hovered or Details open), **failed** (Details
  open), **unknown**. Details = a timestamped monospace log (target, draft build, replaced build, carried plugins, the No
  CDN line, build written, live, archive counts, skipped, errors). The dropdown step, `publishStep` and `jobLine` are gone;
  so is the *published <build>* / *publishing n/N* text beside the button (the overlay cannot be closed while it runs).
- The job now names its **parts** `{ build, archive }` (kept in `state_json`, no schema change) so the editor counts the
  archive on its own; *n files new* = `done − skipped`, *already there* = `skipped` (both were already on the job).
- *My calls*: the confirm transpiles the saved sources when it opens – a source that does not compile is the one danger
  line and Publish stays off (focus to Cancel); Logic errors are not checked (no cheap check exists in the editor). The No
  CDN warning moved from the step into the log (the top bar keeps *No CDN connected*). Production's readers line is *Every
  reader gets this state on their next start.* Opening Publish while a job of the experience runs goes straight to the
  running state (*Started elsewhere …*). *Open reader* = `/<experience>/` on this origin (an instance serves its own
  environment). While the overlay is open it takes every key in the capture phase: Ctrl+L toggles Details (the scene
  page's Library key does not fire behind it), Esc cancels the confirm / closes an ended publish, Tab stays inside; focus
  returns to the Publish button. Esc and the backdrop click never close the running state.
- Checked locally (SQLite API with `PUBLISH_STEP_SECONDS=0`, a 106-scene experience, headless Edge): all three states in
  day and night, the 2 s auto-close (2.2–2.4 s after Details was closed), focus back on the button. The docs site's
  `publish.webp` is the new confirm.
- [x] Open (Tilman's call, not in scope): **rollback** – done in 6.3.0 (#348): *make live* on the experiences page's
  Versions, `POST …/versions/{build}/activate`.

## 2026-11-22 – a publish is a job: where the 10 minutes went, what writes the rest (6.2.0, #345)

- **Found** (staging's zone listing, the publish log): build b49f09610206's version folder (3 plugin modules, files.json
  430 KB, game.config.json 793 KB) was on the zone at 07:53:03.0–.5, latest.json switched at 07:53:03.7 – then the export
  archive: **1522 files** (1376 entries, 135 scenes, 6 plugins, 5 top-level, 1.2 MB) written one PUT after another with a
  new TLS connection each, ~0.43 s a file, 07:53:04 → 08:03:59. The editor got 504; Tilman published again at 08:03:31
  (same build: versions.json kept 07:53:03.7, latest.json got 08:03:30.99) and that request checked for export.json
  before the first one wrote it, so it rewrote 1376 entries again until 08:14:54 (and never wrote its own export.json).
  The demo is small enough to stay under the gateway. Read-only GET timing from here against the Storage API:
  sequential 180–1180 ms a file, curl_multi over kept connections 100–400 ms a file – the zone is noisy.
- **Decision (job design, works on plain PHP)**: `publish_jobs` row with the plan (every file to write) + state;
  `POST` runs `PUBLISH_STEP_SECONDS` (15) in the request (done → 200 as before, else 202 `{ job }`), then
  `fastcgi_finish_request()` + `ignore_user_abort` + no time limit where it exists (staging's FTPS host, PHP-FPM),
  else every poll `GET …/publish/{job}` writes the next 15 s (Apache mod_php in the Docker image, the built-in server).
  A lease (90 s, renewed per slice of 32 files) keeps one runner; a dead runner's lease runs out and the next poll goes
  on. A job unmoved for 2 min gives way to the next publish (`abandoned`). No queue, no cron, no daemon.
- Skip logic: version folder = one exists (never overwritten), archive with export.json = one exists, an incomplete
  archive = `ContentStore::checksums` (one Storage API listing per folder, its `Checksum` = sha256) → only missing or
  different files. Uploads: `ContentStore::putMany`, 16 at a time on one kept curl multi handle; a refused file is tried
  once more alone. Order kept: game.config.json last in its folder, latest.json after the folder, export.json last.
- The editor's Publish step (`publish-job.ts`) shows the phase and done / total, treats a 502/503/504 without the API's
  error code (or no answer) as "lost", then looks for the experience's newest job that was not there before the click.
  MCP `publish` waits 90 s, `publish_status` follows.
- [ ] Open: the archive is still ~1500 PUTs for the book – expected 2–4 min with 16 at a time (not measured on staging:
  no publish from a worker). If that stays too slow, the lever is the archive's shape (one file per entry, the
  `osct content export` layout the CLI shares) – e.g. a single bundled file next to the folder; Tilman's call.
- [ ] Open: after the deploy, publish osct on staging once and note the job's time (POST answer, live, done) here; check
  that staging's FPM really continues after `fastcgi_finish_request` (the job keeps moving with the editor closed).
- [ ] Open: staging's export archive of b49f09610206 is complete (export.json from the first publish) – nothing to repair.

## 2026-11-22 – the desktop landing from the skeleton; a manifest per experience (6.2.3, #343)

- Tilman (2026-11-22): *"same thing goes for the browser redirect to that landing page. i assume we can write a small
  script we put in the skeleton and run immediately ... this is stuff we do not need the database for"*. index.html's
  head now runs three inline scripts in order: legacy redirect → manifest link → landing decision
  (`<html data-osct-landing>`). The body carries the static landing (declarative shadow root, `landing-html.ts` –
  `<desktop-landing>` renders the same function) before the static splash; CSS hides one or the other.
- *My call* for another experience's path (`/demo/`): no static landing (the static page has the default's texts and
  images) – the splash shows until `<desktop-landing>` decides, as before.
- Takeover: the component renders underneath, waits for its hero images and the QR code (≤ 2 s), copies the scroll
  position, removes `#static-landing`. If it decides otherwise than the head (window resized), it removes the static page
  and the attribute, and the splash shows. The static page is English; in another language the texts swap at takeover.
- The design primitives' CSS moved into the import-free `styles/design-css.ts` (`DESIGN_CSS` = spinner + it) so the build
  can inline it; `gold-button.ts` and `desktop-visitor.ts` import relatively for the same reason.
- Tilman (2026-11-22): *"ja, ein eigenes manifest pro experience why not"* – every experience links
  `/api/experiences/<id>/manifest.webmanifest`, the default too, set by the inline script; vite-plugin-pwa's link is taken
  out of the built page (an `enforce: 'post'` plugin after it). The root manifest only for an address naming no
  experience. **An install made before (id `/`) stays a separate app** beside a new one – accepted (few installs before
  production). This resolves the 6.1.0 open item about the default app opening the experience opened last for new
  installs; old installs keep that behaviour.
- [ ] Open: ReaderManifest names an experience by its id until it is published (the title from the DB); an instance
  whose default experience is not published in its editor DB gets `osct` as the installed app's name.

## 2026-11-22 – every experience at its own path; legacy codes and the PWA land in the right book (6.1.0, #343)

- Tilman (2026-11-22): *"mein vorschlag, wir fangen eingehende legacy qr codes ab so das ?v=bk1 auf und ?v=d1 ../osct/
  ../demo/ verweisen. auch bei der PWA."* – *"die subdomain ist erstmal keine option"* – *"eine zweite subdomain ist erst
  machbar nach einer whitelabel loesung"*. Later: *"so i want to also be able to add new experiences in the schema under
  their own slug... part of that refactor"*. **Subdomains only after a white-label solution.** Production follows only
  once Asger has set our SSH key pair.
- He wrote `?v=`; the printed book's code is `https://osct.buildingfictions.com/?s=bk1` – the arrivals' source `s`
  (#324). Nothing in the code read `v`; `s` is the parameter.
- Paths: `/<experience>/…` for every experience (the default too); `/x/<experience>/…` moves to `/<experience>/…`. The
  experience is the first segment unless it is one of the site's own paths (`RESERVED_PATHS`,
  `shared/api/experience-paths.ts`, PHP copy `Experiences::RESERVED`, pinned by `mcp/test/php-rules.test.ts`).
- Legacy addresses move in the client before anything loads (`redirectLegacyAddress`, `history.replaceState`): `?s=` by
  the source map (`bk<n>` → osct, `d<n>` → demo; unknown → default), a bare `/` → the experience the browser opened last
  (`localStorage` `osct-experience`), else the default; any other route → the default's same route. No server redirect:
  a bare `/` needs the browser's memory, and the SW serves index.html offline anyway.
- PWA: the build's manifest stays (`id`/`start_url` `/` – the installed app stays the same app; its `/` opens the last
  experience). Every other experience links `/api/experiences/<id>/manifest.webmanifest` (`ReaderManifest.php`: id, start,
  scope `/<id>/`; the title only once published) – installing from `/demo/` installs the demo.
- New experiences: `POST /editor/experiences { id, title }` → an empty draft (one *double* scene). The id is the slug
  (`EXPERIENCE_SLUG`: lower-case, digits, dashes) – path, store folder and editor URL in one; no rename. Imports keep the
  wider id rule (capitals, `_`, #205) but a new one may not take a reserved path. MCP: `create_experience`.
- The sign-in email's link carries the experience the reader asked from (`POST /auth/request { experience }`).
- [x] (6.2.3: every experience links its own manifest, the default too – new installs start at `/<id>/`; installs from before keep this.) Open: the installed default app (scope `/`) opens the experience opened *last* – after someone read the demo in the
  browser, the osct app's icon opens the demo. A per-experience manifest for the default too would fix it, but would
  install as a new app beside the one installed before #343 (Tilman's call).
- [ ] Open: a path whose first segment is no experience of the instance (`/foo/`) loads `foo`'s store and shows the
  startup error, not the not-found page.

## 2026-11-22 – listen, not hear: content schema 6.0, plugin API 4.0 (6.0.0, #341)

- Tilman (2026-11-21): *"you use the word hear for events. i think it is listen"* – decided *"Komplett, inkl. API"*: every
  word (editor, engine messages, MCP, docs, the docs site, comments, identifiers) and the plugin API's `uses.hears` →
  `uses.listens`. Grammar: a rule *listens to* an event; the pin and the key are `listens` (no "to").
- `uses.hears` sits in a plugin's recorded spec (`registered`), i.e. in the content → a renamed field = schema **MAJOR**
  (RULES #10): 6.0, `OLDEST_READABLE_SCHEMA_MAJOR` 6; plugin API **4.0**; app **6.0.0** (precedent: schema 5.0 → 4.0.0,
  schema 4.0 / API 3.0 → 3.0.0). No alias, no backward compatibility (pre-Tokyo).
- Migration: `Migration6.php` on the deploy (5.x → 6.0, `plugins_json` / `imported_json` recorded `uses`; `--plan-6`);
  the Code tab sources by `osct plugins listen --all` through the editor API (*mine*: not in PHP, so Tilman sees the
  dry run first). Staging dry run 2026-11-22: 26 sources, none with `uses.hears`, one with the word in prose
  (demo · narrative, two lines). Book content (`OSCT_CONTENT_DIR`): no plugins, nothing to change.
- `Migration5` compared with `Editor::CONTENT_SCHEMA_MAJOR` to find "old" (4.x) experiences – with 6 it would have quoted
  5.x set texts again; now a literal 5.
- Left as they were: dated history (CHANGELOG sections before 6.0.0, MEMORY entries, `agents/research/`, `agents/archive/`),
  the 5.1 row of docs/content.md's schema table (`{ hears, … }` – what 5.1 shipped).
- [ ] After the 6.0.0 deploy to staging: `osct plugins listen --all` (without `--dry-run`, after Tilman saw the dry run),
  then publish `osct` and `demo` again (declared modules of API 3.x are not loaded by a 6.0 app).

## 2026-11-22 – the stage toolbar's … overflow (#342)

Tilman (2026-11-22, on a screenshot of the toolbar cut off at the panel's edge): *"we can either fade here when there
is too many or we add the ... dots to indicate there is more and have a context menu come out."* – the … it is.
- **What goes**: the groups from the end (live, view, grid & snap, render quality, the filters, the tool, undo /
  redo / history last); the … menu holds them below each other, each a row as in the toolbar. Their own menus and
  panels open from inside it (fixed flyouts inside a top-layer popover are positioned to the screen and drawn above
  it; `menuPlace` opens them beside, the popover says `aria-orientation="vertical"`) – nothing had to be flattened.
- **No loop by construction**: the Tools panel asks for the toolbar's **whole** length (`FloatingPanel` `along`), so
  the room it is given (`floats.views.tools` less `chromeOf`) never depends on what is hidden; each group's length is
  measured where it last stood (key: orientation, finger, expansion), an estimate before. One trap met in headless
  Edge: the … measured alone (no rule before it) is 9 px shorter than with a rule – that alternated 0 ↔ 1 groups and,
  measured in a MutationObserver's microtask, froze the page. The … alone is no longer measured, and every measure
  waits for the next frame.
- The expansion of the tool and the filters still follows the estimated room (`floatingRoom`, between the Tree and the
  Inspector); a toolbar placed elsewhere can show a group expanded with others in the … – rare, harmless.
- [ ] The inline panel's real chrome is 1 px wider than `chromeOf` (72 vs 71 px in a row – the section's border): the
  toolbar's last px is clipped, before #342 too; the fit takes a px of tolerance. Correct `chromeOf` sometime.

## 2026-11-21 – 5.0.2: the in-page stage's follow-ups from the staging check (#340)

- Found by the orchestrator on staging after 5.0.0 (its "no targets found" was its own test – a hidden browser pane that
  paints no frames). Checked here in headless Edge against a local API with the demo and its twenty saved sources: the
  timeline has `targetFound` for the aquarium, the key and the tally at 0.42 s, the prints and entities drawn, no
  "No component … registered" line, 24 plugin-source requests (one per source) instead of ~190.
- **Order**: the saved sources install before the first scene builds (`Stage.open` waits for `onStarted` →
  `plugins.autoLoad(…, { refresh: false })`), as the frame did. **Requests**: `plugins.version` moves only when the
  engine's `pluginRegistryRevision` moved; `plugins.savedSource` reads each saved version once. **Storage**: the stage's
  engine switches under `osct-editor-stage-…` – the editor's page shares the reader's origin (the reader's progress
  `osct-progress:<id>` was never written by the stage; the engine reads no storage itself).
- Local check recipe: `server/api/config.local.php` with SQLite in `var/db/`, the demo built into the client
  (`OSCT_CONTENT_DIR=fixtures/demo npm run content`), import via `POST …/import` with `assetsBase` 5174, the sources via
  `PUT …/plugins/<id>`; mail codes are rate-limited (a few per hour) – set a test password in the local DB instead.

## 2026-11-21 – Logic canvas: setting things off on the stage by hand (5.1.0, #334)

- Tilman: *"is there a way i can manually trigger an event from the nodes to test what firing them would look like down the
  line?"* – the proposal agreed (*"ja vorschlag ist gut"*): a box's right-click menu on the Logic canvas – an event box
  **Fire on stage** / **Fire with a payload…** (and a ▶ on its head where a pointer hovers), a node's own `tap` box **Tap on
  stage**, a variable box **Set on stage…**, a rule box **Run this rule**. Items: `editor/src/lib/logic/fire.ts` (pure,
  `__tests__/fire.test.ts`); stage: `Stage.fire` / `Stage.runRule` (two additive methods, `StageCore.fire` emits through
  `runtimeApi("stage").events`); engine: `runRuleByHand` in `behaviour.ts` (a module-level set of the rule lists on the stage,
  each registered while built – exported from `@engine/scene`). Docs: `docs/editor.md` ("Testing on the stage"), the docs
  site's Logic guide ("Setting things off by hand").
- Decided (*mine*): **Run this rule** runs as if its `on` came – its **when applies** (false: "nothing ran"), no other rule
  of that event runs; the menu's detail says *as if <event> came – its when (…) applies*. A **core event** cannot be fired
  (the runtime refuses an `emit` of one; firing `targetFound` by hand would lie about the stage) – the item says what to do
  instead. A node's `found` / `lost` / `unlocked` boxes are disabled too (the stage's hooks); `tap` is the reader's tap on
  the target (`stage.tap` – every node of it hears it, so not only that node's rule).
- Decided: an **event box of another scene** still fires – the bus is the stage's, so the open scene's rules, the
  experience's and every plugin hear it; the detail says *<scene>'s own rules are not on the stage*. A scene's or a node's
  **rule** of another scene is disabled (*open it to run its rules*). Read-only levels allow all of it (testing, not
  editing); only the running stage changes, Restart resets it. The Log marks the fired event's line and the hand-run rule's
  `behaviour` line ` · by hand` (only that first line; `parseDetail` skips it). A variable's set has no mark – it is the
  Variables tab's write.
- A node's rule is found on the stage by target + node name (the engine's behaviour knows no path – as Trace's matching);
  two nodes of one name with rules in a target are refused with the reason.
- Fixed on the way: Trace pulsed the **rule after** the one that ran – the engine numbers `behaviour` lines from 1, the
  documents from 0 (`liveHit` takes one off now; the tests had the same mistake). The docs site's Logic guide said *Live*
  where the toggle is *Trace*.
- [ ] Not checked in a running editor (no local API in this session): the menus, the payload field's focus, the ▶ on hover.
- [ ] Open: a hand-fired *tap* and a variable set carry no *by hand* mark in the Log (`targetTapped` / `varChanged` come from
  the engine / the API) – add one if Tilman wants it.

## 2026-11-21 – the stage sandbox dropped: the stage runs in the editor's page, a prompt before others' plugin code (5.0.0, #340)

- **Tilman** (decided in the OSCT session after the SCUTOONS XR session relayed it): *"we can drop the sandbox. since we
  trust the user, thats why we gave them access to the api. if we got plugins that need to change db game state, that is
  fine. it is a huge security risk but only to the user who is logged in and their scope."* · *"performance will
  definitely increase."* · on the plan: *"yes please"*, *"and we can rebuild the schema. no worries"*, *"ich bin fuer
  umbau, jetzt."*
- **Supersedes #234** (2026-10-31, `archive/MEMORY-2026-10.md`: the stage and every plugin in an iframe without
  `allow-same-origin`, `frameCsp`, a postMessage protocol, the registry mirrored). RULES #35 is rewritten as the guard rule.
- **What went**: `stage/frame-host.svelte.ts`, `stage/frame-protocol.ts` (with `frameCsp`, `readFrameEvent`,
  `FORWARDED_KEYS`, `withoutSavedSpecs` – the API's draft has dropped a saved plugin's recorded specs since 4.6.2), the
  route `routes/stage-frame/`, the content's recorded responses (`content.snapshot`), the engine's `mirrorPluginRegistry`,
  the `Origin: null` CORS of the dev servers and `.htaccess`'s `Access-Control-Allow-Origin: *` for `/editor/` and
  `/assets/content/`, and their tests. `Stage` keeps its API and calls `StageCore` directly (a layer `.stage-host` first
  in the stage's container); `stage-types.ts` keeps the shared types. Leaving the workspace empties the registry
  (`resetPlugins`, new in the engine) – the frame used to do that by going away.
- **The guard** (`plugin-guard.ts`, `plugin-guard.svelte.ts`, `PluginGuardPrompt.svelte`): the saver is the API's existing
  `updatedBy` (email of `plugins.updated_by`) – no API or schema change was needed. Asked about: stored sources someone
  else saved last, and declared modules without a stored source (imported builds – *mine*: nobody here saved them, so
  they count as someone else's). One prompt for all, Run / Don't run; the answer in `localStorage`
  (`osct-plugin-guard:<experience>`) per plugin and version (`updatedAt|updatedBy|size`, a declared module's URL). The
  render view asks nobody: only what that browser answered Run for runs (a headless profile has none – a render no longer
  shows others' plugins; open item below).
- **Plugin API stays 3.1** (*mine*): `api` did not change; only where the code runs. A MAJOR would have refused every
  declared module built against 3.x for nothing. The reader had the session within reach of a published plugin anyway
  (one cookie for the site, #207).
- [ ] **The render view and others' plugins**: `render_scene` runs in a fresh headless profile, so the guard keeps every
  plugin someone else saved off the picture. Writes are blocked there anyway (`requestAction`); if Tilman wants the
  render to show them, `ask: false` could run them instead of skipping – his call.
- [ ] **Measure the stage start** on the S22 and the desktop before/after (not measured in this session: no local API run).
- [ ] The guard's answers live in one browser: a person on a second machine is asked again. A per-user answer on the
  server would need a table – not built (Tilman: "we can rebuild the schema" if wanted).

## 2026-11-21 – Logic canvas: live feedback on the wires (#334)

- Tilman: *"also do we have live feedback for the wires? when a event fire that cable should light up. or when a variable
  changes. we can see what is actively happening then"*. The Logic panel reads the stage's timeline (`stage.events`, the
  Log tab's lines) and lights what each **new** line touches on the level drawn – `logic/live.ts`, pure and tested
  (`__tests__/live.test.ts`): an event lights every wire carrying it by name (into / out of its event box, plugin pins,
  bundled scene wires and stubs) and pulses its box; `varChanged` lights the variable's sets and reads and shows the new
  value in its box's head; a `behaviour` line pulses the rule's box (in its kind's colour) and lights its `on` wire and its
  action wires (a scene's rule: its scene box at the group / experience levels).
- Decided: derived edges (bundled wires between scenes, name stubs) carry the names they join (`GraphEdge.names`) – a
  bundle's label says only *2 events*. A node's own event box (`event:<target>/<path>:tap`) is lit only by its rule's
  `behaviour` line, never by a bus event of the same name. The payload comes as `describePayload`'s one line, so
  `parseDetail` reads it back (values are JSON). A node's rule is matched by target, node name (from the draft) and its
  index in the node's behaviour – the engine's note carries no path.
- Decided: "new" is by the frame's clock (`StageEvent.t`): the panel marks the timeline as seen when it opens (no replay);
  an emptied timeline starts again; a clock that went back (a new frame) only moves the mark. A pulse lasts 1 s
  (`LIVE_MS`), a new firing restarts it (a pulse number keys the animation). Look: the wire's own signal colour, opaque
  and heavier, a dash glow running once from source to target over a fading halo (class `live`, apart from the hover's
  `lit` / `dim`); reduced motion keeps only the brighter state. **Trace** in the bar's … view settings (on by default,
  `osct-editor-logic-trace`) turns it off – renamed from Live, which the stage's pause/play already is (4.12.1).
- [ ] Not checked in a running editor yet (no screenshot): the travelling dash on real wires, and the cost of re-drawing
  the canvas's nodes per pulse on a large level.

## 2026-11-21 – Logic canvas: selecting and ungrouping groups, notes after the deck (content schema 5.3, #334)

- Tilman: *"how to ungroup or select a group? and also we are missing notes on these graphs, for annotations."* A click on
  a frame's head (free area; a drag is no click) selects the group's boxes, Shift adds; a right click on the head or a
  folded pill opens the group's menu with **Ungroup** (a canvas edit `ungroup`); **Ctrl+Shift+G** ungroups the selected
  boxes' groups (as the Scenes strip). Both group keys stop in the Logic panel – the Scenes panel's window shortcut
  never sees them.
- **Notes** after the SCUTOONS deck (`deck/show/src/canvas.rs` `Note { id, text, author, node }`, `NoteText` – empty
  removes): schema 5.3 adds a canvas note's optional `box` (x, y are then the offset from the box – it moves with it),
  `author` and `view` (a scene's canvas is shared by the scene level and its target levels: a note belongs to the level
  it was made at – `<target>` or `<target>/<path>`; none = the canvas's own level). Edits `note`, `noteText`, and `place`
  with `note:<id>`. Author = the signed-in person's address before the @ (the content keeps no address; the API's user has
  no name field).
- Decided: a note whose box goes (rule removed, a variable nothing names any more) **stays free where it last stood**
  (`keepNotes` in apply.ts); a removed rule's later siblings keep their notes (rule box ids are numbered). Notes are
  monochrome editor chrome (RULES #38), not signals.
- [ ] Open: canvas `positions`, `folds` and group members are keyed by rule box ids too (`rule:door/#1`), which shift when
  an earlier rule is removed – only notes are re-keyed so far.
- Wire labels: a white letter outline instead of the semi-transparent backdrop (Tilman: *"the text should have a white
  outline not a semi transparent backdrop"*), white in both themes.

## 2026-11-21 – Log and Variables tabs, one unified log, surfaces only on selection, the Tree's one + (#337)

Tilman decided which parts of the Inspector deserve their own tab:
- **Log tab** (dock tab beside Inspector/Environment/Library/Code, floatable): one timeline, newest first – the stage's
  events, the rules' behaviour/goto lines, the plugins' `api.log` lines and errors, and the **problems** (Logic errors and
  warnings for the whole experience, plugins not on the stage) pinned above without a time. The plugin log merged into it
  was his *"sehr gut"*; *"log in general could be unified with problems and errors, filters show only the respective
  things"* → filter chips per kind (events, behaviour, plugin log, errors, warnings), kept per browser. *tap* lives in its
  top bar. *Clear* empties the timed lines; the Code tab keeps its own log (a Run still empties that one only).
- **Variables tab**: the live vars (scope, type, value control, delete), *set* by hand, *reset* (`StageVariables.svelte`).
- The scene Inspector keeps **one line** at its level ("3 vars · 12 events") with links that open the two tabs.
- *"some sections in a tab should be default collapsed otherwise these lists get hard to navigate"*: the Log's problems
  start closed to their counts and first problem, the timeline open; the Variables tab has a section per scope (the
  scene's open), *set* closed – every closed section's summary says what is in it.
- **Surfaces leave the scene Inspector** (the `SurfaceList` section is gone): the Tree's Surfaces level adds (selects the
  new surface, so its Inspector opens), reorders (menu, Alt ↑ ↓) and removes (menu *Remove surface…*, Delete – the
  confirmation is the surface Inspector's); the surface Inspector shows only when a surface is selected or just created.
- **The Tree's footer** (*+ target · + entry*) became **one + (add)** with a typeahead menu like the Logic panel's: surfaces,
  target…, entry…, and every node type (built-in and the plugins'), nodes greyed out without a selected target.

How: the plugins' lines carry the frame's clock (`t`) and the scene clock (`at`) like the events, so the Log merges them
(`stage/log-entries.ts`); the experience's logic is built once in `logic-content.svelte.ts` for the Logic panel and the
Log's problems; a problem's click asks the Logic panel for its box (`logicFocus`). Open: the docs site's screenshots
(`vars.webp`, the tutorials' door scene) still show the old *vars and events* section – retake them with the next
screenshot round.

## 2026-11-21 – A documentation site for users at /docs/ (#336)

Tilman: *"i would love to have a route docs/ … a documentation that can work properly to figure out how stuff works in
the editor. organize it logically and add illustrations of screen shots where possible. make those things brief. add
tutorials for most common use cases of an editor or admin and an api documentation … for plugin makers or how the logic
system works and mcp as well"*.

- **Static pages in `client/public/docs/`**, no build step: the hub, an editor guide (nine pages), tutorials for editors
  and for admins, API pages (which API for what, the logic system, the plugin API, the MCP server). One stylesheet, one
  script with the list of pages (sidebar, *On this page*, previous / next). How it is kept: `docs/docs-site.md`.
- **For users, brief**: what a thing is for and how to use it. `docs/*.md` stay the developers' documentation and the
  source the pages are written from (RULES #31) – a page never copies their detail.
- **The long page at `/docs/tutorials/` stays** as it is (RULES #1), linked as *Content and demo walkthrough*; the new
  tutorials live beside it (`tutorials/editor/`, `tutorials/admin/`).
- **Styled like the editor** (Tilman, the same day: *"can we please style the docs in the way the creator and deck editor
  are styled?"*): the editor's monochrome palette with day and night, system type, square corners, small-capital labels
  (`docs.css`) – not the reader's black and gold, which the first draft took from the long walkthrough.
- **Reference pages are generated, never typed** (Tilman, the same day: *"the apis should have reference pages. otherwise
  it is hard to find a specific one"*, *"generated whenever anything in the apis updates"*): the plugin API from
  `plugin-api.d.ts` (in the run of `npm run plugin-api`), the MCP tools and the content model from the server's own
  definitions (`npm run docs-reference` in `mcp/`); Checks fails on a stale page. The hand-written API pages stay as
  the guides. A page of prose is never generated, a list of members never written.
- **The search has no index file**: `docs.js` reads the listed pages on first use (headings and table rows with ids).
  An index built by a script would be one more thing to regenerate; the pages are small.
- The folder is `guide/`, not `editor/`: `/docs/editor/…` would read like the editor app's own address.
- The editor's account menu has *Documentation* (opens `/docs/` in a new tab).
- Screenshots: the local editor on the demo, re-imported from `…/osct/staging/demo` (build e04673e65644) into the local
  SQLite; headless Edge over CDP, signed in through the form with the mail log's code.
- [ ] `docs/editor.md` "Environment" still describes the **world** row (the built-in café, a glTF model) – gone since #310;
  the panel has the sky, the onion sky and the preview only. Correct the section (the site's page is right).
- [ ] `docs/editor.md` "Inspector: the scene" lists *appearance* among the scene's sections – it is the experience's
  (`ExperiencePanel.svelte`); the "Try it" section speaks of nine demo scenes (there are six).
- [ ] The long walkthrough's screenshots (`tutorials/demo/`, `tools/`, `import/`) are from before the floating panels;
  retake them, or fold its chapters into the new pages (ask Tilman before removing the page).
- [ ] The local SQLite's `editor@osct.test` is now also **admin** (granted with the admin secret for the admin page's
  screenshot; it is the last admin there, so the API refuses to take the role back).

## 2026-11-21 – fixtures/demo is the staging demo's export; demo.yml no longer syncs (#322 decision (b))

- `fixtures/demo` = `osct content export --experience demo --from draft` from staging (the DB side won – Tilman's
  plugins and scenes kept; the export carries all 20 plugins). The CI workflow `demo.yml` only builds it: its sync to
  `osct/staging/demo/` competed with the editor's Publish. Re-export and commit after demo changes worth keeping.
- The zero-plane reader misread quantized `.glb` files (normalized SHORT positions from gltfpack) as metres; now
  dequantized. Real findings left in the exported content, asserted by name in the demo test (Tilman's call – fix in the
  editor, then drop them from the test):
  - [ ] `entities/catpope-overlay` children 1–19 float 0.01–0.46 target widths (the poster's figures – likely on purpose)
  - [ ] `entries/key` floats 0.1627 (its `position` z 0.1627; with 0 it stands on the page)
  - [ ] `entries/mark` dips 0.0159 below the page at its lowest baked frame (position z 0.004)
- [ ] The export warns that the catpope parts' asset ids (`part-00`…) do not start with `catpope-overlay-<n>-`.

## 2026-11-21 – Logic canvas: free placement, groups and the deck's node styles with colour (#334 L-T7/L-T8)

- Tilman: *"free placement on canvas. and grouping like we have in the scutoons deck. also adopt the node styles we
  already established in the deck. including the coloring."* – the Logic view gets free placement (positions kept in the
  canvas, a schema MINOR), groups as in the deck, and the deck's node look **with its signal colours**. This is an
  exception to RULES #38 (monochrome editor) for the Logic canvas's nodes, ports and wires; the rest of the editor
  stays monochrome. RULES #38 amended.

## 2026-11-21 – Export archive follows the CDN rules (#322 decision 2)

- Tilman: *"export archive? hier den regeln fuer den cdn folgen. da haben wir das schon einmal besprochen."* – the
  archive sits in the instance's **content store** (the CDN zone, or the directory store of an instance without CDN),
  never in git, laid out like the store: `<title>/<env>/<experience>/exports/<build>/` – one per published build,
  immutable (same build, same folder), written by the publish (trigger: every publish of that environment; the CLI
  `osct content export --archive` for a manual one). The media are not copied: `export.json` names the build's
  immutable content files, so the build's purge keeps every build an export still needs (the newest export per
  experience at least). Details in the ticket (#322 T-archive). Built on `feature/322-export-archive` (2026-11-21):
  `ExportArchive.php` (the PHP copy of the export plan, compared with content-export.ts by
  `scripts/test/export-archive.test.ts`), written after `latest.json` (a failure does not fail the publish); purge keeps
  the builds the newest archive per environment names. The archive names no person (`publishedBy` null – readable through
  the pull zone). Open: a restore command (download export.json's files into place); old archives keep naming builds a
  purge has removed (only the newest per environment is protected).

## 2026-11-21 – Do not run `content move --delete-old` yet (#87)

- The staging demo's draft still names files in the old folders (`https://buildingfictions.b-cdn.net/demo/<build>/…`,
  e.g. entry targets' `imageSrc`). `--delete-old` on `demo/` (and likely `staging/`) would break those references.
  First rewrite the draft's references to the store per experience (or the Library), then delete.
- Staging demo data fixed by the orchestrator on 2026-11-21: `tally` and `colophon` `of: "book"` → `"experience"`; the
  key's rule `on: keyRattled` (it emitted keyRattled itself – a loop) → `on: tap` (Tilman: "Ja, auf tap").

## 2026-11-21 – Demo plugins stuck at plugin API 1.6 on staging

- Tilman saw "[plugins] aquarium … was built against plugin API 1.6, this engine runs 3.1 – not loaded" for the 11
  fixture plugins. Cause: the demo's draft configuration still declared them from its first import (api 1.6, old
  `plugin.js`), but the database had **no source** for them – a publish injects (recompiles) only plugins with a saved
  source, so the old declarations went through unchanged. Fix: their sources from `fixtures/demo/plugins/` were added to
  the staging demo (PUT …/plugins/{id}, additive, 2026-11-21); the next Publish of the demo in the editor compiles them
  against 3.1. The osct experience's live build declares only 3.1 plugins.
- [ ] Guard: a publish (and the import) should refuse or report a declared plugin without a saved source whose API
  MAJOR the engine does not run, instead of passing it through.

## 2026-11-21 – Demo: the staging database and `fixtures/demo` have drifted apart (#322 decision (b))

- The staging DB's demo has 9 plugins (contact-shadow, cutout-shadow, hover, lifts, my-model-look, my-sparkle-look,
  paper, reveal, toon – several only there, edited by Tilman up to 2026-11-21 02:15); `fixtures/demo` has 14 (aquarium,
  fluid, grain, lifts, narrative, paper, pulse, reveal, scanlines, scenes, sparkle, spin, tally, tint). A re-import of
  the fixture would overwrite his DB work, an export now would drop 11 plugins from the repository. Open: which side
  wins, or merge (add the fixture's missing plugins and their scenes to the DB, then export).

## 2026-11-20 – Content schema 5.0: the logic MAJOR (#334 L-T5a, branch `feature/334-logic-major`)

- **Conditions are expressions** (L5): `when` is one expression of `shared/text/expressions.ts` (`parseExpression`,
  `evaluateExpression`, `expressionVariables`, `expressionLiteral`); the object form is gone from the contract. The
  migration's rules (`convert-content-5.ts`, `Migration5.php`, compared in `mcp/test/php-rules.test.ts`): every test
  `name == value` (faithful, not the shorter bare `name` – `true == 1` aside it keeps 4.x's strict equality),
  `not` → `!=`, all → `&&`, any → `||`; `null` (not set) → `!name` / `name` – **approximate** (the language has no "not
  set"), listed by the dry run; a variable named like a word of the language cannot be converted and stays (listed).
- **Scene and experience rules** hear the bus only; `sceneChanged` reaches them from the scene (`LogicInstance.opened()`)
  after the new scene's anchors are built – the bus delivers it before, when no node exists yet. Experience rules live in
  `ArScene` from the first scene until the stage ends (teardown), re-read (`tune`) at every scene change. A scene's rules
  may name only its own scene's targets (the guard refuses another scene's – only the open scene's entities exist).
- **`goto`**: `ArSceneOptions.navigate` → the module-level `setNavigator` in `plugin-runtime.ts` (as `setProgressReader`);
  the reader resolves `scene:<id>` with `resolveAddress` (LinkService) – unknown: console only, no not-found page.
- **Canvas** is stored (scene `data_json`, `experience_json`), carried by the draft and the export, stripped by the
  content build and by a publish (`ContentVersion::assemble(..., true)` before the hash).
- **Migration5 runs on every `Db::migrate`** (the deploy's entrypoint `migrate.php`, `POST /admin/migrate`) – merging
  the branch into develop migrates staging on its deploy. Dry run first: `php /opt/osct/migrate.php --plan-5`.
- **B2 – every set value is an expression** (chosen over a separate key: one form, the graph can wire any field): a text
  value is the literal `"calm"` (YAML `'"calm"'`); a bare number / true / false stays allowed (its own expression).
  Migration5 quotes set texts only while the experience is still 4.x (Migration4 now takes 3.x to 4.0, not to the current
  schema), which keeps it idempotent.
- **B7 – typed variables**: `experience.variables` as a **map** name → `{ type, scope?, default? }` (unique names for free);
  undeclared ones typed by their first set in content order; `shared/types/variables.ts` (`expressionType`,
  `variableTypes`, `ruleTypeProblems`, `contentRuleLists`) serves guard and engine; the runtime refuses wrong types in
  `writeVar` (plugins too), a set without scope uses the declared scope. The PHP side checks only the declarations' shape.
- [ ] After the deploy: publish every experience again (a 5.0 reader refuses the 4.x versions in the content stores);
  the CDN demo (`buildingfictions.b-cdn.net/demo`) is 4.x – re-import of it is refused until it is rebuilt from the
  converted `fixtures/demo` and synced.
- [x] L-T5b (shipped in the same branch, 4956421f): the editor on the new contract (rule editor's `when` as an expression field, `goto`, scene / experience
  rules in the Logic view and Inspector, `PUT …/logic`, `noteBehaviour`'s new `home` payload).

## 2026-11-20 – Idea to debate later: XR scenes with the deck's renderer and 8th Wall's tracking

- Tilman: "Ich bin mir nicht sicher ob wir vielleicht das rendering via unserer eigenen deck engine machen können und das
  tracking von 8thwall benutzen. Es gibt binaries ... wir könnten auch reverse engineeren. Langfristig hat das sogar den
  Vorteil das wir native auf ios und android not tracking zurück fallen könnten." To be debated later, together with
  how XR scenes are made.
- Facts checked 2026-11-20: OSCT ships `@8thwall/engine` 0.1.0 (`client/`), under the **MIT licence** (Niantic
  Spatial 2026). The package is compiled JS (`dist/xr.js`, `xr-tracking.js`, `xr-face.js`) plus TFLite models and
  workers, with no source. MIT allows using, modifying and studying exactly what ships, so reverse engineering the
  delivered code is not a licence problem. 8th Wall's camera pipeline is renderer-agnostic (pipeline modules for
  three, A-Frame, Babylon or custom), so the camera frame and the image-target poses could feed another renderer,
  such as the deck engine (wgpu → WebGPU in the browser).
- The long-term gain Tilman names: the deck engine runs natively (wgpu on iOS and Android) and falls back to native
  image tracking there (ARKit / ARCore).
- Not checked: whether the 8th Wall build exposes the tracking without its own render loop, its performance next to
  WebGPU, and wgpu/WebGPU support in mobile Safari.

## 2026-11-20 – Logic view: ports from the code (reflection), no registerLogicNode (#334)

- Tilman: "ich finde wir sollten die typisierung und die ideen der anderen marktfuehrer uebernehmen. das macht deutlich
  mehr sinn und hat weniger redudance und ist direkt am code lessbar."
- Decided: a box's ports come from the specs that are already registered (component specs, node types, passes,
  materials), the way Unreal, Houdini, Blender and ComfyUI derive pins. `actions`, `events` and the bus use are declared in
  the same spec. There is no `registerLogicNode` and no facet written by hand for each component. Concept §5.9; L-T6 and
  L-T13 are rewritten.
- The storage stays L1: documents are the truth, and the graph is drawn from them. Unreal and ComfyUI store the graph
  itself; OSCT does not, because the reader runs rules, not a graph.
- Tilman asked about JSDoc, then: "Wäre es nicht fast besser wir konvertieren die script Sprache zu typescript um die
  unsicheren annotations aus dem Spiel zu nehmen?" Plugins already are TypeScript (the build and the Monaco Code tab both
  type-check them). So there is no JSDoc. Instead it is **schema first**: the spec is written with typed builders
  (`p.number({min,max})`, `actions`/`events` as const), and the plugin API infers the handler's types from it. Today a
  handler only gets `params: Record<string, unknown>`. Rust later uses a derive macro.

## 2026-11-20 – Logic view: xyflow as the rendering layer; free nodes and node modules on the canvas (#334)

- **L7 decided (Tilman):** "xyflow for the moment. As a rendering layer." `@xyflow/svelte` draws the Logic view. The
  `logic` package computes the view and the layout, and xyflow's gestures become ops. xyflow never owns the data.
  The build under SvelteKit 3.1 / TS 6 and RULES' stack list are still to check.
- **Free nodes (Tilman's question):** *"can we add free nodes to this canvas? … generative content … a more creative
  tool."* Answer, in `agents/research/2026-11-20-logic-nodes-shared-concept.md` §5.7: yes. A free node lives in the
  canvas document, which keeps L1 ("every node lives in a document"). There are three kinds: computed nodes (today),
  editor-only free nodes (notes, references), and generative free nodes that run **at authoring time** in the editor or
  on the server. A generative node's result becomes ordinary content (an asset or an entity, with its origin recorded)
  through an explicit apply op. The reader stays unchanged.
- **L11–L13 decided (Tilman, the same day):** free nodes yes, so the canvas becomes authoring data (DB, export). Generation
  runs on the server. A free node writes only through an explicit apply. **OSCT gets no generator nodes for now.** Its
  content comes from imported files, and the canvas is for wiring them up (file and delivery nodes, L-T12).
- **Every node can host a module** (Tilman: *"Each node can host a module as a script so we can get access to the api …
  nodes that got built in logic and our custom ones"*). Research doc §5.8: a custom node is a plugin capability
  (`registerLogicNode`, `registered.logicNodes`, an API MINOR), not a new format. It runs at authoring time in a
  sandbox. Its `api` calls go through the page with the person's session, like the stage frame (#234). Reads are free;
  writes come back only as ops for the person to apply; no token reaches a module. Steps L-T12 to L-T14.
- **L1–L6 decided as recommended (Tilman: "L1 bis 6. As recommended"):**
  - L1: logic lives in the documents and the graph is computed from them.
  - L2: rules on scenes and on the experience, in one MAJOR together with `goto`.
  - L3: OSCT itself may use `goto` (`scene:<id>`). STRATEGY.md has a note on this.
  - L4: the canvas is stored per scene and for the experience. Since L11 it is authoring data and goes into the export,
    but not into the reader.
  - L5: conditions become expressions in SCUTOONS' language.
  - L6: the event bus works by name, and the joins are drawn as derived edges.
- **L10 decided (Tilman: "Der grosse schema switch kann sobald er fertig ist gemacht werden"):** L-T1 to L-T3 start
  now. The MAJOR (L-T5) ships as soon as it is ready, without waiting to be bundled with another cut before Tokyo.
- **L8 decided (Tilman: "Yes, into the URL"):** the Logic view's level goes into `?logic=`, built in L-T3.
- [ ] L9 (does SCUTOONS adopt the package): asked in mandymozart/scutoons#702.
- **L-T1 to L-T4 shipped (3.19.1, 3.20.0, 3.21.0):** the logic module and its levels, navigation with xyflow and
  `?logic=`, and editing. Adding nodes works by right-click, by the "+" button, or by dragging from the Library's
  "Nodes" (Tilman's change). Checked on staging: a real click selects a box, and the stage and the Tree follow it.
- [x] Disconnecting a rule's `on`: Tilman, 2026-11-20: "Allow empty". Since 3.21.1 a cut `on` is left empty, so the rule
  hears nothing. The Logic panel marks it as a problem until an event is wired to it again. The contract still lists an
  empty `on` as a problem, as it did for the Inspector before.

## 2026-11-20 – The delivery endpoint's change log: row kinds plus `delivery_id` (#322 T5)

- A delivery's writes are logged with their **row's own kind** (`scene`, `entry`, `target`) and the delivery's id in a new
  column `changes.delivery_id` – not with a kind `delivery` as the plan said. Reason: the revert (`Reverts`) finds "later
  changes of the same thing" by kind + ref; a kind `delivery` would hide a delivered target from its later editor edits
  (and the other way round), and every revert branch would need a second key.
- A delivery's **new rows are revertable** (removed again: target → entry without target → scene with nothing on it and
  not the initial scene); every other creation stays "remove it instead". The removal a revert writes is not revertable
  itself (as any removal).
- The conflict baseline is **per row**: the last delivery change of that row, else the experience's import time.
- No confirmation id (`Confirmation.php`) as the plan sketched – `apply: true` like `scenes/move` and the revert, the
  comparison made again inside the transaction. T8 (MCP) shows the comparison before applying.
- [ ] The API checks MAX_TARGETS_PER_SCENE only on a delivery; `POST …/entries`, `PUT …/targets/{id} { enabled }` and an
  entry's scene move do not yet – Tilman's call whether they should (the content build still refuses > 10).

## 2026-11-20 – #322 decisions; GitHub variables renamed (#33)

Tilman on the open decisions of `agents/research/2026-11-20-importer-export-plan.md`:
1. **The demo goes into the database as a sandbox, like in SCUTOONS** (not the recommended repository source):
   `fixtures/demo` becomes its committed export; the demo is edited in the editor like the book.
2. Where exports are archived and whether a publish triggers one: **still open**.
3. An entry's delivery `note`: Tilman is not sure it is needed – **dropped** (not stored); bring it back as an
   editors-only field only if a delivery note turns out to be missed.
4. **Remove legacy code**: every removal of section 4 is approved, each at the moment the table names (convert-3
   now, convert-4 after the first export, `content move` after both environments moved, `import-delivery.ts` after
   the new import ran one real delivery, `layout/render-layout.py` now, …). Correction (2026-11-20): `fixtures/demo/layout/`
   is **not** dead – the reader's marginalia card back reads its `cover-front` sheet (`client/src/utils/book-cover.ts`);
   it stays (only the generator went). The export (T2) must write `layout/` too while the reader reads it.
5. `db/pull-staging.sh` → `server/db/` in the rename: yes.

GitHub variables (#33): Tilman said the orchestrator renames them itself with `gh`. Done 2026-11-20 for staging and
production: `OSCT_BUNNY_STORAGE_ZONE`, `OSCT_BUNNY_STORAGE_ENDPOINT`, `OSCT_CONTENT_BASE_URL` (same values),
secret `OSCT_BUNNY_STORAGE_PASSWORD` (from `scripts/.env`, checked against the storage); `scripts/.env` keys renamed
too. develop's workflows read only the new names. The old names stay on GitHub until `main` has a release with
these workflows – then delete them:
- [ ] Delete `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_ZONE_ENDPOINT`, `BUNNY_STORAGE_PASSWORD`, `CONTENT_BASE_URL` in both
  environments once `main` carries 3.16.2 or later.

## 2026-11-20 – Media in quality levels, the reader's media quality (#331 step 3, schema 4.3)
- Shape *my reading* (open to Tilman's eye): `levels: [{ level, src }]` on an image / video / audio asset and
  `imageLevels` on an entry; one number per kind – image longest side 512 / 1024 / 2048 (the image rule's sizes), video
  height 480 / 720 / 1080, audio 64 / 128 / 192 kbps (`MEDIA_LEVELS`). `src` stays the older app's file (MINOR).
- Setting: Info → Settings *Picture and video quality* – Automatic / Low / Medium / High (`GraphicsSettings.mediaQuality`),
  next to *Model detail*. Automatic: slow or data-saving → smallest; picture covers the screen's longest side × DPR,
  video the shorter side × DPR (≤ 720p with ≤ 4 GB), sound the largest. A change swaps what is on screen at once: a playing video or sound
  goes on at the same spot in the new quality (Tilman: *"otherwise it makes no sense to switch"*, 3.16.1).
- Editor: the Inspector sets levels (node *levels*, entry form under the picture); pictures computed in the browser,
  video / audio uploaded per slot (no browser encoding – Tilman). The Library shows a node's levels as a `media` stack.
- [ ] A video with levels **and** subtitles: its file shows in the subtitles frame, the levels stack is not drawn there.
- [ ] The release step (#304) writes AVIF / KTX2 per use from these levels.

## 2026-11-20 – The recognition switch: Original by default, Prepared per experience (#306, schema 4.2)
- Tilman: today's runtime path stays the default, non-destructive – the printed image stays, the frame lives beside it in
  the Library. Built: `experience.recognition` (`"original"` default / `"prepared"`), `target.recognitionOff`, the reader's
  debug override (Recognition row, stored per phone, reloads), the load test report names the path. The rule is one pure
  function (`engine/src/scene/recognition-mode.ts`).
- The editor makes frames by itself (image set/replaced, new target, placed) with the CLI's builder, moved into
  `engine/src/scene/target-frame.ts` (`recognitionFrame`, `RECOGNITION_FRAME_FILE` – the one format: grey PNG, a working
  copy; the image rule makes it WebP, the release step #304 may re-encode it). Remake uploads a new Library file; the old
  frame file stays in the Library, unused (delete it there by hand if it matters).
- [ ] Open: the test run (S22 + iPhone, docs/tracking.md "Comparing Original and Prepared") before any experience says Prepared.

## 2026-11-20 – Ids without leading zeros (#63)

- Tilman (2026-11-20): ids without leading zeros – `s4-5`, `s4`, `p4-1`. The import writes them; the database is renamed
  **once by hand** with `server/deploy/rename-ids.php` (dry run first, Tilman approves the numbers, then `--apply` on
  staging) – deliberately not in `Db::migrate`, which runs on every deploy.
- Decided in the worker: published versions are not rewritten (they are built files on the content store, not rows;
  the next publish carries the new ids). File paths and URLs keep the padded folder (`entries/p004-1/target.jpg`) – a
  rename there would need the files moved. Plugin code is listed, never rewritten. Progress starts over (RULES #10).
- [ ] Open: the real content folder / mappings outside the repository and the layout files (`pp-004-005` sheet names,
  `layout.json` target keys) still carry padded names; the folder is an export since #322 and follows from the next
  export.

## 2026-11-20 – Prepared recognition frames: not on the book without a test run (#306)
- 3.11.0 can prepare a target's recognition frame ahead of time (`osct targets prepare`, `target.recognition`, schema 4.1).
  It saves load time only (S22 150–260 ms per image + the download), not recognition quality.
- Tilman: *"Ich wuerde die target optimierung nicht laufen lassen. Da muss es ein test lauf geben."* Today's runtime
  path is tested for every target, the small black-and-white ones too. So: never run it on the book's targets
  until a test run (a few targets incl. small b/w, test experience, S22 + iPhone, recognition / found / lost / re-find
  at least as good) has passed.

## 2026-11-20 – Backlog review: 123 → about 50 open issues, Tilman's decisions (#332)
- 70+ issues closed (shipped, superseded or merged); design review leftovers in #333. Result and decisions: #332.
- **Several experiences on one installation** (for Kévin's further works): one store layout `<title>/<env>/<experience>/…`
  before production (#87, with #50).
- **The database is the only truth** (#322): the content folder is written from it, the CDN follows from publishing;
  scripts/ → cli/ when the toolchain is re-cut (#41); ids without leading zeros by a one-off DB migration (#63).
- `trigger-protocol.json` goes – the printed places are in the database (#32). Formatter yes (#26). Repo stays public.
- Next: #306 (8th Wall image-target CLI on all targets), #255 (shared-core research, also for world tracking #299),
  #89 (scene render for agents), #239 (node view per scene), #87.
- The staging MCP worktree (`osct-mcp-develop`) had been on 1.71.1 since mid-November – update it after MCP changes.

## 2026-11-19 – Library: quality levels as stacks, parts as frames (#331)
- Tilman: *"manche assets sind nur qualitaets stufen einer … gruppiert (vielleicht so leicht gestackt) … einzeln
  ersetzbar"*; concept and drafts first (DRAFT-331, DRAFT-331b sent in the chat).
- Two axes: **levels** (one file in several qualities: map 512–4096 now; image 1x/2x/3x, video 480p–1080p, audio
  kbps later, #13) = a **stack**; **parts** (mesh, maps per material × channel, clips, scripts; video + poster +
  subtitles) = a **frame**. `◧` = carried inside a file (glb images / clips), only shown.
- Tilman: the **browser** computes missing levels from one file, after choosing the option; images, videos and audio
  alike; think ahead for normals, animations, scripts.
- Tilman: *"die library soll nicht die links machen, nur anzeigen"* – stacks and frames only from what the content
  links (a node's `textures`, a video's subtitles by the contract's name rule); no grouping by name prefix; a missing
  level is added in the Inspector, the Library only shows the node.
- Order: 1 stacks + frames + ◧ (3.6.0) · 2 browser levels for images/maps · 3 schema `levels` for image/video/audio +
  the reader by quality · 4 channels, clip files, scripts.
- [x] Where levels are computed (Tilman, same night): *"primaer im browser. aber video im browser rendern klingt dumm.
  das soll lieber vorher gemacht werden. oder wenn der production server live geht koennen wir das auch dort machen"* –
  images and maps (and light audio) in the browser; **video levels are made beforehand** (all levels uploaded), later
  possibly on the production server once it runs; never video encoding in the browser.

## 2026-11-19 – One update option: Building Fictions (#325)
- Tilman: *"we reduced the updates on person can receive … just subscribe to one type of update and that is send by
  building fictions"*, then *"just put send updates from one source, not 3 choices. and the type is buildingfictions."*
- The accounts have one option, key `buildingfictions` (column `buildingfictions_updates`); experience / artist /
  publisher updates are gone. Migration: on where any of the three was on (`Db::mergeUpdateOptions`, then rename and
  drop in the schema files). No compatibility (before Tokyo): an older reader's stored options read as off until
  `GET /user` refreshes them.

## 2026-11-19 – Arrivals by source and the landing redesign (#324)
- The book's QR code (last page, final print PDF) reads `https://osct.buildingfictions.com/?s=bk1`: **`s` = the source**.
  The app counts every `?s=` arrival (`ArrivalService`, `POST /api/arrivals`) and takes `s` out of the address; the
  admin page shows them on top (*QR codes and links*). Counts only, per source / UTC day / device class, plus first
  arrivals (a browser flag) – no IP, no user, no cookie (*my reading* of "track those incoming qr codes" within the data
  sovereignty line). Any new code counts by itself; the landing page's own code is `lp1`.
- `<desktop-landing>` redesigned (Tilman: "much sexier, more on the osct design concept from the book and app, better
  padding"): the title set as on the book's title page in the gold gradient, the experience's target images scattered
  in greyscale around it as on the book's pages (drifting with the pointer), the Mark, the phone tilted; then the QR
  code on a champagne card, the address and install, three steps, the shop, a footer. *My reading* – open to Tilman's
  eye: the images are the targets (not the page images), greyscale like the print.
- [ ] Production: the book's code points at osct.buildingfictions.com – arrivals count there from the first deploy of
  main with 3.2.0; staging counts its own.

## 2026-11-19 – The code speaks scenes (#319 refactor, Tilman's ten answers to agents/REFACTOR-319.md)
- Bare *scene* = the content's scene; the rendered AR scene is always `Ar…` (`ArScene`, `ArState`, event `arState`).
- Plugin API 2.0 with no alias (`api.scene`, `sceneChanged`, scope `scene`); behaviour rules amended inside schema 3.0
  (relocked, no new version). Staging's stored plugins (compiled against 1.x) load again only after a re-save in the Code tab.
- `book` stays the code / API / DB word; "Experiences" only in the editor's UI. The reader's copy "Scroll to spread…"
  stays (Tilman).
- DB renamed in place (`spreads` → `scenes`, `title` → `label`, `spread_id` → `scene_id`, `initial_spread_id` →
  `initial_scene`) by idempotent `ALTER TABLE … RENAME …` at the top of the schema files. **Not dropped (RULES #25 –
  never a table)**: `page_images` stays, unread; an old database keeps its index `entries_spread` (on `scene_id`), the
  FK name `spreads_book_fk` – cosmetic. Needs the migrate-3 run on staging first (Tilman: done before this lands).
- `convert-content-3.ts` stays until Tilman converted the real content folder, then it goes. (Removed 3.16.4, #322.)
- [ ] Remove `POST /auth/cookie` (#207) – the editor no longer calls it; the API test still covers it.

## 2026-11-18 – Content schema 3.0, part A: contract, reader, build, fixtures (#319)
- `CONTENT_SCHEMA_VERSION` 3.0, `OLDEST_READABLE_SCHEMA_MAJOR` 3 (Tilman: no backward compatibility – no reader shipped
  before Tokyo, Feb 2027). Nothing of the 2.x page model is left in `shared/types` / `shared/guards`; the compat onboarding
  (`shared/compat/tutorial.ts`, `tutorial`) went with it. `shared/api/editor.ts` keeps three local types
  (`SpreadData`, `SpreadFormat`, `SceneLayout`) describing what the 2.x server still sends – part B removes them.
- Engine and reader: the app models keep their names (`Spread`, `spreadId`, `SpreadManager`, `getSpreads`) – only the
  contract was renamed; a rename of the app's own code is a separate refactor (open item below). A scene's label is
  `sceneLabel` (its `label`, the id when blank); an entry's place is its surface's label, else its scene's.
- Labels in the fixture and the demo are what the reader showed before (`1–2`, `Cover`, `Back cover`), not the 2.x
  titles (`The Beginning`) – the conversion rule in `scripts/src/convert-content-3.ts`; part B's server migration takes
  "label, else title" per SCENES.md – my reading for the source content: the label the reader showed.
- Surface id in converted and imported sources: `surface` (one per scene). Source `place` is optional: the build lays the
  surfaces in a row (touching, flat, centred on the origin); the configuration always carries all six numbers.
- The i18n word for the page column is *Place* (de *Ort*, fr *Lieu*, nl *Plek*); the switcher's aria label *Scene …*.
- Open: [x] rename the app's own `Spread`/`spreadId`/`SpreadManager`/`spread-menu` to scene names (done 2026-11-19, see above); [x] `scripts/layout/render-layout.py` (the demo's stand-in sheets) still reads the 2.x source – removed 3.16.4 (#322), the sheets stay – the stage's
  sheets become surface references in part C; [ ] the build writes no `groups` yet (no source format for them).

## 2026-11-18 – Floating panels in the scene workspace, the select tool and its filters (#308)
- The scene workspace's panels float over a full-window stage on desktop and iPad (after the SCUTOONS deck editor's
  `floats.rs`, ported as a concept, nothing shared in code): `components/FloatingPanel.svelte` + pure `components/floats.ts`
  + `components/floats.svelte.ts` (`Floats`, one per workspace; the top bar's panels menu reaches it through
  `openFloats`). Specs: Tree TL (fill height), Inspector TR (fill, essential), Scenes BL between them (fill width), Info BL
  folded, Tools TL beside the Tree (inline, essential – my reading: the deck's Build Tools is essential too, and closing
  the toolbar would leave no way to the tools but the panels menu). The deck's growth order and corner places are kept;
  the deck's drag stops at other panels (sweep) – here a held panel moves freely over the others and **settles** when let
  go (snap 12 px, else the nearest free place), so panels can pass each other. Layout per workspace in
  `osct-editor-panels`; the Scenes panel's own `osct-editor-scenes` height / open state is unused while it floats.
- **The phone keeps the sheet** (#171) – nothing extended there. The desktop's column edges are gone with the columns
  (the panels resize by their own edges): `widths.svelte.ts` keeps the sheet; its tree / panel / code widths and
  `treeStartsOpen` (and the stored `osct-editor-tree`) are unused now.
- **The select tool** (Q, the default tool): no gizmo handles, the selection outlined; move / rotate / scale W / E / R.
  The pick modes (#192, strict, one at a time) became **filters** in Tilman's order entities, targets, models, nodes –
  toggles, none on = anything (the nearest hit at its finest), several on = the nearest hit any takes at the finest level
  on (nodes > models > entities) – my reading of "a toggle saying what a click may pick". *Models* = the model node a hit
  belongs to (itself or the nearest model above it). The filters hold for every tool. The frame protocol's state carries
  `pickFilter` / `tool` (`setPickFilter`, `setTool`) instead of `pickMode` / `gizmoMode`.
- **Render quality** = the shading group (wire / solid / textured / rendered) – my reading of Tilman's word; always one
  button with its menu now.
- The book page went with #313 (1.105.0) while this was built – the scene workspace is the editor's one workspace
  with panels, so #308's "book page" part has nothing left to float.
- [ ] Remove the unused column widths in `widths.svelte.ts` and the stored `osct-editor-tree` (RULES #15).

## 2026-11-18 – The world café is gone; world tracking is its own epic (#310, #299)
Tilman: the built-in café "makes not much sense" – removed (1.104.0); the look-around keeps an experience's own world
model and sky image. World tracking (#299) becomes its own epic for Kévin's next show, in France, summer 2027.

## 2026-11-18 – The editor is for desktop and iPad, not phones
Tilman: "dont worry about the phone... we will tell phone users to use the desktop! so we can save development time.
ipad is okay." New editor work (#307 phase 3, #308 floating panels) needs no phone layout; the existing phone sheet
(#171) is not extended. The **reader** stays phone-first – this is the editor only.

## 2026-11-17 – Scenes phase 3a: the Scenes panel, a filmstrip under the stage (#307)
- The editor's scene organisation is one set of cards (`SceneCards.svelte`) in two layouts: the **strip** at the bottom
  of the workspace's stage column (`ScenesPanel.svelte`, desktop only for now) and the book page's **grid** (groups as
  headed sections) – one model (`scene-strip.ts`, pure, tested), one store (`scenes.svelte.ts`: the book tree, picks,
  the actions). The book page's old spreads grid and its add tile / creation step went with it; the workspace keeps
  `NewSpreadForm` (› +, the tree's row menu) for now.
- A drop is written at once (`POST …/scenes/move`, `apply: true`) – no plan step in the UI; the drop is the confirmation.
  A scene dropped over a band's scene joins that group, over a scene of no group it leaves its group; a dragged band
  keeps its group (no `group` sent) and only lands between runs. Ungroup of picked scenes deletes a group whose scenes
  are all picked (no empty group stays in `groups_json`), else moves the picked out (`group: null`).
- A group is a selection of its own (`selection.group`) → Inspector `GroupView.svelte`. **The window "whole group / by
  order" is display-only**: `GroupData` has only id and label, no server field – a stored setting needs a schema MINOR
  and a server field (with #300 or phase 5).
- `GROUP_WINDOW_TARGETS = 20` in `shared/api/editor.ts` is a guess (TODO #300: the window measured on the phone).
- Editor tokens `--accent` (gold), `--accent-background`, `--pick` (blue), `--warn` added to `editor/src/app.css`.
- `help.svelte.ts` clears the Info view after a focusout in a microtask: a focused card destroyed while Svelte renders
  (the strip rebuilt after a move) threw `state_unsafe_mutation` from the synchronous focusout.
- [ ] The Scenes panel on a phone (the sheet takes the bottom) – after 3b.
- [ ] Card thumbnails are the layout sheets / page images matched by the scenes' derived pages; reference images per
  surface replace them in 3b. A scene made here (a wall, a fold-out) draws its surfaces.

## 2026-11-17 – the marginalia card starts at the find, every time (#285, 1.100.0)

- Tilman, trying staging: the card did not show on page 4's top-left picture – that is p004-1 "Cheap tricks", a
  **Link** (the card is glossary only); the page's glossary target p004-2 lies at the bottom. Then: *"they should every
  time do the reveal. just found has the new unlocked text"* and *"maybe just target trigger, so it immediately starts
  … its confusing otherwise"*.
- So the bridge flies the card on `targetFound` (no tap), every new find, and opens the entry when it lands. Guard
  against a loop: after a flight opened its entry, the target flies again only after a `targetLost` in scan mode more
  than 1.5 s after the return to the scan (the tracker may report lost / found right after the return).
- The 75 glossary entries with an `image.jpg` (the colour version of the grey target, same size) turn colour at the
  smash; colour pictures for all of the book's images are ordered (Tilman, 2026-11-17) – then set them as the
  entries' `image` (MCP `update_entry`).

## 2026-11-17 – Scenes phase 2: the server keeps scenes (#307)
- A scene = a `spreads` row; surfaces / layout / label / group in its `data_json`, groups in `books.groups_json` (a
  column, not `book_json`: the content writes them at the root, not in `book`). Order = `spreads.position` only;
  `entries.spread_id` is the entry's scene (set by `scene`, or once from a page an older client sends), its surface in
  the entry's data. Nothing renumbers; `Books::renumber`, `Pages::shift` / `drop` / `reorder` are gone.
- **Pages for older apps** (`Scenes::ranges`): a scene keeps its stored range while it comes after the scene before it
  and before the next one's stored range (one-step look-ahead, so a moved scene is the one that gets derived, not all
  after it); the front cover (page 0 before the front matter's negative pages) only has to stay apart. Else a derived
  range right after the scene before, as wide as its own. A new scene is stored with pages after every other's (no
  page images or layout sheets collide). Entry rows keep their page in the scene's stored numbers (`storedPage`);
  `pageOf` writes stored page / surface place / same offset. Tree, entries list and routes show the derived numbers,
  and an older client's `page` resolves among them first, then by a surface label.
- Two steps by `apply: true` (as the matter): move, group, migrate, and a `PUT …/scenes/{id}` that removes a surface
  entries lie on (409 `surfaces-in-use` first). Add, rename, ungroup are one step; delete keeps the confirmation id.
- The migration labels single pages with both halves (the unnumbered half as a surface without label, as
  `Pages::pagesOf`), covers and matter without labels, groups `front-matter` / `back-matter`; page images stay keyed by
  page (phase 3). The orchestrator runs it on staging after showing Tilman the plan.
- [ ] Until phase 3 the editor's print layout sheets (matched by page) follow the derived numbers of a scene moved out
  of its printed place; a removed scene's page images stay orphaned (keyed by its pages).

## 2026-11-17 – Scenes phase 1: schema 2.35 (#307)
- An entry's `scene` (a spread id) **wins over its `page`** in the engine and in an import; `page` stays required and is
  still written inside the scene's range (older apps place entries by it; the guard still checks the page lies in some
  spread). The draft writes `scene` from `entries.spread_id` (the truth the editor keeps) and drops a stale `surface`.
- A surface's `side` is open: the guard accepts any lower-case word, so a new side (`ceiling`, a fold-out's `middle` is
  already in) is a MINOR. An entry's `surface` needs its `scene`.
- Labels: entry → surface label, else page (or the title on covers/matter); scene → own `label`, else its surfaces'
  labels first–last, else as before. No writer fills surfaces, labels or groups yet – phase 2.
- [ ] The client tests that import bare `"path"` (`utils/__tests__/game-config*.test.ts`, `version.test.ts`) fail on
  Node 24 (the npm `path` package's `util.isString` is gone) – they pass with `node:path`; the `path` dependency in
  `client/package.json` looks unneeded.

## 2026-11-17 – Scenes instead of pages: the concept (#307)
Tilman: an experience is an ordered list of scenes; a book is one kind. Scenes have surfaces (any number – a fold-out
makes three, a room many) with labels written as printed and reference images; everything links by id, order is the
position, nothing renumbers; groups are one scroller stop and one loading window. Concept and migration:
`agents/SCENES.md`. Until it lands, page numbers stay the glue (see its "Today").

## 2026-11-17 – the production server is ready; Tilman makes the SSH keys (#6, #7)
- asger (mail to Tilman, 2026-11-17): the server 49.13.13.159 is ready – user `osct`, the internal Docker networks
  `osct` and `osct-staging`, kamal-proxy v0.9; `kamal setup` / `kamal deploy` from Actions "should just work". Tilman
  makes the key pairs himself and sends asger only the `.pub` files (no private keys by mail): his own key for SSH
  (backups, maintenance) and a new deploy key for Actions, both for the user `osct`. No jailed user – `osct` can run
  Docker, effectively root; asger's condition: "just don't touch the building_fictions containers or kamal-proxy"
  (RULES #28).
- The deploy key goes into the `production` environment as `SSH_PRIVATE_KEY` (it wins over the repository fallback of
  1.64.2). [ ] Once it works: delete the repository secrets `SSH_PRIVATE_KEY_PRODUCTION` / `SSH_PRIVATE_KEY_STAGING`,
  ask asger to remove their public keys, and drop the fallback from `deploy.yml`.
- [ ] Still open before the first production deploy: `DB_PASS`, `DB_ROOT_PASS`, `SECRET` in `production`; SES
  (`SMTP_USER` / `SMTP_PASS`, domain verified, out of the sandbox); DNS `osct.buildingfictions.com` → 49.13.13.159.

## 2026-11-17 – one list of a file's uses (#298 phase 2)
- Found on staging: the Library's count (`Assets::usageRows`) and the delete check (`Assets::usagesOf`) disagreed, and
  both missed uses – 264 layout sheets showed as unused. Now **`AssetNames::usesOf` is the one source of truth**: the
  Library's count and place, `GET …/usages`, the delete check, `Removal` and the names plan read it (docs/server.md
  "What counts as a use"). Matching is the names plan's: a JSON string **equal** to the URL / content path (the old
  checks used `LIKE %url%`); a plugin source still by substring.
- New kinds: `spread` (a spread's data), `book` (book_json beyond `environment`), `layout`. **Reading of the layout**:
  the server does not fetch `layout.json` (it lives on the CDN, not in the DB) – every imported file below
  `/assets/content/layout/` counts as used whenever the book's `files.json` holds `layout/layout.json`. A stale sheet
  the layout no longer lists would count too (harmless: imported files cannot be deleted anyway).
- Naming unchanged: only target / entry / entity / page / environment / plugin uses give a name; a file only a spread,
  book setting or the layout uses keeps its own.
- Open: `Removal` of a spread does not count the removed spread's own data as removed – a file named by an entry and by
  that spread is listed "elsewhere" (conservative: never deleted).

## 2026-11-17 – pictures become WebP in the browser (#298 follow-up)
- Tilman: "in scutoons asset manager I automatically upload images to webp when they are uploaded". Staging's shared
  FTPS host may have no GD, so the API's conversion (phase 1) can store files unconverted there. The editor now converts
  before the request (`editor/src/lib/browser-webp.ts`, modelled on SCUTOONS `shared/media/src/media-standard.ts`);
  the API keeps its conversion as the fallback (MCP, scripts, browsers that cannot encode).
- Decided here: **one hook point** – `library.upload` / `library.replace`, which every editor upload goes through (Library,
  FileField, Pages view, new target / entry forms, code files – non-images pass untouched), not each call site.
- **Lossy with alpha** for transparent pictures: a canvas cannot write lossless WebP, while the server writes them
  lossless. The browser's lossy WebP passes the server unchanged (a WebP within the size). If cut-outs/icons show
  artefacts, open item: keep PNGs with transparency for the server (only where GD exists) or add a wasm encoder.
- A picture above 50 MP is decoded once in the browser to learn its size, then sent as it came so the API answers its
  413 message. A replace without `?fit=` (Library *Replace…*) uses `default` (2048) as before.

## 2026-11-17 – spread titles and files named by use, phase 3 (#298)
- Tilman's decision (issue comment): titles and file names, ids untouched ("ids are invisible to the user"). Built so;
  decided here (not asked):
  - **Titles derived at read, not rewritten**: a stored title that only repeats the pages (empty, `118–119`, `256`,
    `Pages …`, `Cover`, `Back cover`, `Front matter n`, `New spread` – `DERIVED_SPREAD_TITLE`) counts as "no title of its
    own"; `Pages::withTitles` replaces it wherever spreads are served – the tree, the spread routes, and
    `ContentVersion::assemble` (RULES #10: the reader reads `title`, so the derived title is in the content; an older app
    needs nothing). A one-time rewrite would go stale with the next inserted page (renumbering moves pages, never titles)
    and need a run per instance and per layout import. New double pages store `""` instead of *New spread*.
    Risk: a hand-made title that is only a number (e.g. `1984`) would be read as pages – none in the book today.
  - **Names, not URLs**: a rename changes only the listed name, so no relinking (`Assets::replace`) is needed – no row
    names a file by its name. Imported files (no row, read-only) get a listed name in `asset_names` (by URL, like
    `asset_credits`) – recommended in the ticket, done.
  - **First use** in page order (`Pages::pagesOf`); per page target, entry, entity, page image; a shared entity sits on
    its first target's page; environment/plugins/orphan entities are book-wide ("Not in a spread"). Files only a plugin
    names keep their names (no use name to give). Collisions get `-2`, `-3`.
  - Name parts: `imageSrc` → `target`, `image` → `image`, an asset's `src` → its asset id (+ `-<size>` for a model's
    texture map), page images by `AssetNames::pageStem` (`page-front-1-left` = front matter sheet 1, left page).
  - New uploads: `?entry=` / `?page=` next to `?fit=` (the editor's entry picture, target image, Pages view; MCP
    `upload_asset`, `set_page_images`). The new-target form uploads before the entry exists, so that file keeps its name
    until *Name by use…* runs.
- [ ] Open: apply the names plan on staging after the merge – the orchestrator shows Tilman the list first
  (`plan_asset_names` on `osct`).

## 2026-11-17 – one image rule, phase 1 (#298)
- Tilman's go (issue comment): ≤ 2,048 px for page images and an entry's colour picture, ≤ 1,200 px for target images,
  WebP ~82. Built so; decided here (not asked):
  - **Where**: on the server at upload (`Images.php`, GD), so editor, MCP and scripts get the same file. The numbers in
    `shared/api/images.ts` (outside the content contract), mirrored as `Assets::IMAGE_*`, pinned by `php-rules.test.ts`.
  - **The use** is not known at upload, so the server keeps 2,048 px (`default`); a caller that knows names it with
    `?fit=` – the editor's target image field and the target picker's upload send `target` (1,200 px), the Pages view
    `page`, an entry's picture `entryImage`; the MCP's `upload_asset` has `fit`. A target set to an existing Library
    picture larger than 1,200 px is **not** cut (no conversion on use) – phase 2 can re-encode those.
  - **Dedup by the stored bytes** (the converted result), not the source: the sha256 column keeps meaning "this file";
    GD's encoder is deterministic, so the same picture for the same use is one asset. Another use = another file = another
    asset. Pre-rule uploads keep their sha, so re-uploading such an original makes a new converted asset.
  - **Stored as it came, never failed** (`converted: false`): no GD with WebP, unreadable, animated PNG/WebP (GD keeps one
    frame), a WebP that already keeps the rule (no second lossy pass). The 50 MP limit refuses (413) with or without GD.
  - EXIF orientation is read by hand (no `exif` extension needed); metadata, ICC included, goes with the re-encode.
  - The content build: WebP only behind `OSCT_IMAGE_FORMAT=webp`, via `@jsquash/webp` (libwebp as WASM – pure, no
    sharp, deterministic); only images the configuration names are converted and renamed (`.webp`) in it, images
    nobody names stay (a plugin might load one by path). Default JPEG output and its build hash are unchanged.
  - Local PHP (`/c/php/php-8.3.24`) ships `php_gd.dll` but php.ini does not load it: the API test then skips the
    conversion checks with a message; `OSCT_TEST_PHP_ARGS="-d extension=gd"` runs them (all green, 2026-11-17).
- [ ] Open: check WebP image targets with 8th Wall on a phone (a build with `OSCT_IMAGE_FORMAT=webp`), then make WebP the
  content build's default.
- [ ] Open: the staging FTPS host's PHP has no GD (issue #298) – uploads there stay as they come until staging runs the
  Docker image.

## 2026-11-17 – page images per book page, and the missing matter added in the editor (#251)
- Tilman decided (issue comment): one image per **book page**, an override of the print layout's sheet, editor-only,
  no content schema change. Built so; decided here (not asked):
  - Kept in `page_images` keyed by book + internal `page` + `facing`. `facing` addresses the **unnumbered half of a
    single page's sheet** (next to page 1, next to page 256) – those halves have no internal page number in #296, and
    the gap between −1 and 1 is the cover's 0, so a flag rather than a new numbering.
  - **Not in the change log** and not touching the book's `updated_at` – like the picture credits (#277): they are no
    draft content, and the import comparison would otherwise count edits a re-import does not lose. A re-import keeps
    them. A page image counts as a use of its Library file (delete refused, a forced one takes it, a replace relinks).
  - Bulk names: `P012…`/`012`/`page-12` (numbered), `P001-facing`, `cover`/`back-cover`, `F1…`/`B1…` (labels), and
    `start-N` / `end-N` in print order – the PDFs' order (`START BOOK.pdf` pages 1–6 = cover, F1–F4, next to 1; `END
    BOOK.pdf` 1–6 = next to 256, B1–B4, back cover).
  - The Pages view is a **Spreads | Pages** switch on the book page (`?view=pages`), not a route of its own (a
    `[book]/pages` route would shadow a spread with the id `pages`). Library pick is a plain select there – the book page
    has no Library panel.
- Orchestrator's scope addition: the Pages view and the MCP (`add_matter`) add the front/back matter a book misses,
  **on a print-first book too** – a deliberate exception to #238 (they are the printed book's spreads, only missing).
  It also gives the last printed page its own spread (`s256`) and moves a back cover that sat there after the back matter
  (256 → 261 for staging), entries on the old cover page going to `s256`. Plan first, then apply – nothing renumbers
  printed pages, so no risky renumbering. Supersedes the open item of 2026-11-16 (the draft round trip) once staging
  is done.
- [ ] Open: staging – `add_matter { book: "osct", front: 2, back: 2, lastPage: 256 }` (show the plan), apply, then
  `set_page_images` with the twelve rendered pages as `upload` (`start-1…6`, `end-1…6`). Left to the orchestrator.

## 2026-11-17 – Desktop landing page (#293)
`<desktop-landing>` (client `components/desktop-landing/`) covers the app for desktop visitors; `main.ts` awaits its
`whenDone()` before the start (onboarding, opened link, camera), and it removes the static splash, so a desktop visitor
who continues starts the onboarding at step 0. The test (*my reading* of "decide the exact test"): not standalone, primary
pointer not coarse, no phone/tablet user agent (iPadOS-as-Mac counts as tablet), viewport ≥ 56.25 em. The rear camera
is not probed (needs the permission). "Open the app here" = desktop visitors may still enter (*my reading*), remembered
in sessionStorage (`osct-desktop-landing-skipped`), so every new visit shows the page again. "Get the app" = the
address as text plus `<settings-install>` – no QR code (the only QR generator is in the dev tools).
- [x] Shop URLs for the book and the T-shirt (Tilman): both are `SHOP_URL_PLACEHOLDER` (https://buildingfictions.com)
  in `landing-config.ts` – now editable per experience in the landing workspace (#365, 2026-11-23); the app's items stay
  the placeholders until an experience has its own.
- [ ] Product pictures (book, T-shirt) and the phone preview (Rudy's video loop or a better still): placeholder line
  drawings and a screenshot of the onboarding in `public/assets/ui/landing/`; `previewVideo` takes a loop.
- [ ] Landing copy: placeholder texts in the `landing` i18n namespace, until the final copy.

## 2026-11-16 – Marginalia menu, All, every entry listed (#286–#288)
The list's choices are `ListCategory` = an `EntryCategory` or `"all"` (`ALL_CATEGORY`, client `types/entries.ts`) – All
is a view, not a content category, so no schema change. `progress.lastCategory` may now hold `"all"`, additive within
format 1 (an older app reads it as none). The per-category counter and the header's both come from
`history.getConsultedCount(category?)` – only entries in the content count, so the category counts add up to the
header's. All = glossary + texts + links (videos have their own button) – *my reading*. Locked rows are listed in
production now (Tilman 2026-11-16), so `showLockedEntries()` / `VITE_SHOW_LOCKED_ENTRIES` were removed; the Dockerfile
still passes the build arg (harmless, unused) – open item: drop it with the next deploy change.

## 2026-11-16 – ABC Areal from the CDN, two type sizes (#278, #279)

- **Font (Tilman, 2026-11-16, #278):** the reader is set in **ABC Areal** by Dinamo. Licence: Dinamo's own permission
  for this collaboration release – no per-domain web licence. The WOFF2 files (as delivered, not converted) live on
  the CDN at `https://buildingfictions.b-cdn.net/fonts/abc-areal/` (storage zone root, outside the environment
  folders – shared by staging and production, untouched by `content purge`), **never in git** (public repository).
  Areal is Latin only: Tilman finds a Japanese font separately (open).
- **Loading:** the build writes `@font-face` rules into `index.html` (`client/src/utils/font-face-html.ts`, a vite
  plugin) for `ABCArealVariable.woff2` (400–700) and `ABCAreal-RegularItalic.woff2`, `font-display: swap`, Arial as the
  fallback. `VITE_FONT_BASE_URL` changes the folder (unset = the CDN folder, empty = no web font). The service worker
  keeps the files in the cache `osct-fonts` (cache-first, survives builds). The editor keeps its own system font.
- **Typography (#279):** two sizes – Medium 1 rem (8 pt ≈ 15.4 px in the PDF), Small 0.75 rem (6 pt ≈ 11.5 px);
  tracking 0.04 em; line height 1.375, centred onboarding / camera texts 1.5625. Measurements: `DESIGN.md` §2.

## 2026-11-16 – Picture credits reach the reader through the configuration (#292)
The credit lines stay per file URL in the instance's Library (`asset_credits`, #277); `ContentVersion::assemble` puts the
lines of the files the configuration names anywhere into `credits` (content schema 2.33). The reader's image credits page
groups them by spread (`getCredits()`), by page, each line once per spread. A YAML-built book has none. Info's "Entries"
button gave way to the design's gold × in the header (#291).

## 2026-11-16 – the marginalia pick-up is a card that flips to the centre, no hand (#285, 1.81.0)

- Tilman first wanted a hand that pockets the card in a shirt pocket (crocodile hand by Kévin, a stand-in from a free
  VR hands pack), then: *"we changed our mind. only a card that flips up and ends up dead center of the screen, like a
  playing card"*. Decided with him: glossary entries only; the normal reveal first, the **tap** starts it; only for an
  entry not consulted yet (*"second time straight away for now"*); a stiff card in the picture's shape; a **full flip**
  (the back shows halfway); reduced motion opens at once. #285's body holds the decisions and the maths.
- The maths (Tilman's two moving vectors): in this engine the camera stays at the origin and an anchor is its pose
  relative to it, so **only the start moves**; the end is a constant `(0, 0, −d)` in camera space. `d` comes from the
  projection matrix (the tracker sets the matrix, not `fov`). A cubic Bézier (lift along the page normal, settle from
  behind) and `slerp(q0, q1) · rotX(2π·s)`; `P0`'s weight `(1−t)³` fades the tracking jitter out by the end.
- Then (Tilman): *"more organic … go first back up, than rotate and twist to reveal the front after a spin in the
  vertical axis and than slap against the screen with a rumble … a glow flash like the gold flash"* and *"bending the
  card of the page first is nice"*. So the card is not quite stiff: its top edge curls up while it peels, then it is.
  Path: a Catmull-Rom page → up → a turn on the way to a point behind the landing → the landing, in three eased
  phases (rise, spin about the card's Y, slap that eases in); the impact pushes, bounces, shakes, flashes a gold halo
  (also the bloom) and vibrates.
- Then, watching the sandbox live: a path after his drawing (a loop, a big arc) was tried and **dropped** (*"movement
  was much better before. just revert"*); a gold flash over the card (sheen / the reveal's noise) was tried and
  **dropped** – *"just replace the target image with the high res image for each glossary once it hits the screen.
  that is surprise enough"*. Kept: it slides **up the page** first; peel, convex bow (*"not concave"*) and a slight
  twist **overlap and blend**; it stays paper until the spin is over; everything fluid except the smash, which is
  faster; the back is the **book's cover** (the print layout's `cover-front` sheet, fetched by the reader from
  `layout/layout.json` – the gold pattern when there is none); the length follows the page's distance, **0.8–1.2 s**.
- Built: `engine/src/scene/card-flight.ts`, `IArScene.flyCard`, the indicator asks over `CARD_FLIGHT_EVENT` and opens
  the entry once the card landed. Seen in `sandbox/card-flight/` (simulated page), **not on a phone yet**.
- [ ] Open (Kévin, #285): the higher-resolution colour picture per glossary entry (the reveal uses the entry's
  `image` now – often the same as the target; then the card does not change), the sounds (rattle at the pick-up,
  whoosh). Not seen with a real layout's cover yet (the fixture has no layout); not tried on a phone.

## 2026-11-16 – front and back matter are spreads with internal pages (#296, 1.80.0)

- Rudy (via Tilman): the editor misses the 6 pages before page 1 and the 6 after page 256 (`START BOOK.pdf`,
  `END BOOK.pdf`), and AR there would be nice. The print layout already had them as sheets (`cover-front`,
  `front-matter-002/003`, the unnumbered half of `pp-001` / `pp-256`, `back-matter-133/134`, `cover-back`); the content
  had no spread for them – and none for page 256, so staging's back cover sat on page 256.
- Decided here (not asked): an optional `matter: front | back` on a double page (content schema 2.32, a MINOR – an optional field,
  not a new spread format, which would be a MAJOR). Pages stay the key that ties
  entries to spreads, so the matter gets **internal pages**: front −4…−1 (counting down to −1), back after the last
  printed page, the back cover after it. No printed page number moves. The stage finds a matter sheet by its position
  (`sheetForSpread`), so `layout.json` and the CDN stay as they are.
- A print-first book gets them through the delivery import (`layoutSpreads`: a spread for every layout sheet without
  one); adding them in the editor stays refused for print-first books (#238).
- [ ] Open: staging's draft has edits since its import, so the new spreads reach it only through a draft round trip
  (draft → add the spreads, move the back cover from 256 to 261 → import with the comparison shown to Tilman), not a
  re-import of the content folder. Rudy's two PDFs are not compared with the sheet images yet.

## 2026-11-15 – narration is a video with its sound, on an animated paper mesh; only subtitles are built (#257)

- Tilman: *"we will use only a video on a animated paper mesh for our narration. so the only thing we need to
  streamline is the subtitles. the audio will be embedded in the video. much easier"*. No separate audio file, no
  audio paired with a GLB's animation clip (the first plan of #257, dropped), no use of the Blender lip-sync add-on's
  keyframes in the app.
- Found from the code, not run: a video used as a mesh's texture plays muted in a loop from the moment it loads
  (`engine/src/scene/textures.ts`); only a `video` node plays with sound and follows found / lost. Every video loops.
- Tilman, 2026-11-15: *"You can build this basic implementation... perhaps use an example video and put it into the
  demo book."* Built with the ticket's recommendations, none of them confirmed by him: a subtitle file belongs to its
  video **by its name** (`<video name>.<language>.vtt`, the configuration's `subtitles` list is derived – content schema
  2.31), the video's own time is the clock, the reader's line is **on by default** with a switch in the settings, the
  editor's stage shows the English line.
- The paper is already there: the demo's `paper` component (#263) shows a **`video` node** on a sheet model, and a
  video node plays with sound – so the route for a speaking paper is a video node with a component, not a video as a
  texture. The demo's screen speaks this way (a synthetic voice, `editor/tools/narration-video.mjs`).
- [ ] Open (Tilman, bunny.net dashboard – #257): **`vtt` is not in the pull zone's "CORS headers" extension list**
  (checked 2026-11-16 on `buildingfictions.b-cdn.net`: a missing `.glb` or `.mp4` answers 404 *with*
  `Access-Control-Allow-Origin: *`, a missing `.vtt` without it; `.yaml` and `.md` files answer 200 without it – the
  header goes by extension). Until it is added, subtitles do not show for content on the CDN (staging, production, the
  editor's stage): the fetch is refused, the video plays without a line.
- [ ] Open (#257): a narration loops like every video (play once per find?); where the real `.vtt` come from (typed,
  or a speech-recognition draft) and who translates; a paired subtitle file is not counted as used in the Library
  (no delete protection); a subtitle file of an older content build is not admitted by the stage frame's `connect-src`;
  the stage always shows English; not tried on a phone.

## 2026-11-15 – the MCP server as one file, served by the instance (#272, 1.75.0)

- Tilman: the editor gave no valid link to the server file (it pointed at the repository on GitHub) – *"include it
  into the deployment that it is served from the deployment as well"*. `/mcp/osct-mcp.mjs` next to the app, bundled
  with its dependencies and `docs/plugins.md` (an esbuild `define`, `OSCT_BUNDLED_DOCS`), about 1 MB, Node 22 only.
- Headers (`no-cache`, `Content-Disposition: attachment`, `.mjs` as `text/javascript`) sit in the root `.htaccess`,
  not `apache.conf`: staging is still the FTPS shared host, production the Kamal image – both read it.
- Found: `.dockerignore` whitelisted neither `editor/` nor `engine/` although the Dockerfile copies both, so a Kamal
  build could not have worked since the editor landed (the Kamal staging runs fail since 2026-11-05 – not checked
  whether for this reason). Fixed alongside; a real image build was **not** run here.

## 2026-11-15 – tracker window ±2, counted in spreads with targets (#38, 1.73.1)

- Tilman: *"lets load at least +2 for now"* – *"we will still do 13 once the content spring is over. before the
  release"* – *"once content is all in, we can optimize for performance"*. ±2 is an **interim** default; #38's
  decision (grow / sliding budget) and #13's progressive preload come after the content is complete, before release.
- Found on staging: from 4–5 the reader never found 8–9 – 6–7 has no active targets (switched off, #249), and the
  ±n window counted it, so ±1 held only an empty spread ahead. `getPreparedWindow()` now counts and orders only
  spreads with targets (fixed window and load-test budget alike).
- A device that stored a window in the debug overlay (`ar-prepared-spreads`) keeps it – the new default reaches
  only devices that never changed it.

## 2026-11-15 – the stage is always live; the book's code is part of it (#269)

- **Tilman**: "can you do an auto run like we have auto save in the editor? … or every time the editor page loads", then
  "maybe a better way for us is to have something like in unreal... check box play in edit view … check out how
  scutoons kind of did it", and "Yes, build it" to the proposal.
- **No play mode**: the SCUTOONS deck editor always runs its rig (edits replay it; its Play / Wire switch changes what the
  pointer does, not whether it runs; a shader that fails keeps the last good one). OSCT's stage already ran the book
  live – only the Code tab's sources waited for Run. A separate play mode would have stopped everything else in the
  edit view, so: saved sources auto-load on every frame start and on Save, a **Live** switch (Unreal's Realtime) holds
  the entities' clock for placing, **Restart** is the existing new game.
- **Mine**: Live off still plays the moments' looks (a found thing must appear while placing), and the Live state is not
  stored. A hung source stops the auto-load and is skipped once at the next open (a mark in localStorage).

## 2026-11-14 – the publish carries the Code tab's plugins, transpiled in the browser (#78)

- **Tilman**: "can we do some other way to inject the plugins properly? lazy load them via the cdn as we planned? … of
  course a proper compile is nice. but injection should work fine too." Then: "yes, but create a follow up ticket for the
  decision on guard rail of 66 once the server is up" (#266).
- **Why not option 2 of #78 (decided 2026-10-29)**: it needs Node next to the API. Staging is still the PHP-only shared
  host (#10) and production's Kamal server is not set up (waiting for Asger). Injection runs on PHP alone.
- **This reverses the guard rail of #66** (no browser transpile published, no type check skipped) on Tilman's word – the
  type check and a server build are #266's decision once a Kamal destination runs. The content format is the same either
  way, so #266 can swap the way without touching the reader.
- **Why the file is named after its code** (`plugin-<sha12>.js`) and not `plugin.js`: the version's build is the hash of
  the configuration, and the configuration names only the path – the code's hash in the path makes other code another
  version (a version folder is never written twice).
- **Why the types for the 409 checks come from the saved source**, not from the editor's specs: the specs exist only
  where the source ran on the stage in that session; the source's `api.register…("type"` calls are always there
  (`Plugins::registers`). The editor's specs are kept only when they name the same types – stale specs would make the
  reader refuse a node of a newer type.
- **Only saved sources go**, every one of them (also one no node uses – a plugin may only listen to events).
- [ ] A saved source runs on the editor's stage only after **Run** (found with #263: Tilman did not see `paper`) – run
  the saved sources when the stage opens; not filed yet.

## 2026-11-14 – the book's appearance is set in the editor, the API and the MCP (#265)

- The follow-up of #264's open item: `PUT /editor/books/{id}/appearance` (the whole appearance, `null` – or no moment –
  removes it, a change `appearance`), `appearances` / `registerAppearance` in the server's plugin kinds, a publish refuses
  a look no compiled plugin provides (409 `unknown-appearances`); the MCP's `put_book_appearance`; the editor's
  *appearance* section in the spread's Inspector, under the post-processing.
- **Book-level only**, like the book's passes, but without a spread override: #264 has no look per spread (open item
  there). My call to put the panel in the spread view next to the passes – the task named that place.
- **The whole appearance per save**, not a moment at a time: a moment left out has no look of its own. The panel saves
  `null` when no moment has one, so the book holds no empty `appearance: {}`.
- The stage plays the panel's looks at once through an override (`ArScene.overrideAppearance`, the editor's only – not
  in `IArScene`): the frame gets the draft only on a refresh, so without it a saved look would show only after the next
  spread switch. Each moment's **play** replays it on the shown targets (`StageCore.playMoment`: reveal = the first find
  again, found = lost and found, lost = lost and found once the look has played out).
- The look picker is a `<select>` with the plugins' looks in an optgroup per plugin, like the spread's format – my call:
  three built-in looks plus any number of a plugin's are too many for pills.
- No content schema change: `shared/api/` is outside the lock, and `shared/types/` was not touched.

## 2026-11-15 – an entity's own looks: the components reveal, found, lost (#268, schema 2.30)

- Three **built-in components** (`shared/types/components.ts`) named as the moments, on **any node** (first
  built root-only; Tilman: "Then on any node"): `{ type: reveal, look: printLift, duration: 900 }`. `look` is the look's type
  (built in or a plugin's, "" = the book's); the other keys are the look's parameters, checked against its spec
  (`momentComponentProblems` in `appearance.ts`) – a grammar of their own like `behaviour`'s, not a fixed spec.
- Order per moment (`entityMomentAppearance`): the entity's own component → the entity's `found` (for reveal and lost) → the
  book's moment → the book's `found` → the default. My reading: more specific wins, so an entity's `found` beats the book's
  `reveal`. Say if the book's reveal should win for the first find.
- A plugin's look must be known to the checks of the entities, which run in the build before any plugin loads: a module
  registry in `appearance.ts` (`registerAppearanceSpec`), filled by the engine's plugin API and the build's recording run, as
  the component registry is. `appearance.ts` and `components.ts` import each other (call-time use only).
- Editor: `componentRows` makes a moment's rows dynamic (look row + the look's rows under the component's index); choosing
  another look rewrites the component to `{ type, look }` – the old look's parameters would be refused by the new one. The
  Inspector offers the three only at the root (`node.length === 0`). Server: `Editor::COMPONENT_TYPES` lists them as
  built in; the publish check counts the entities' looks (`unknown-appearances`).
- [ ] Not seen in the editor itself (needs a signed-in session); covered by tests (`values-moments`,
  `moment-components`, the scene's `momentLook`, the API test).
- [ ] No demo entity uses it yet – the demo book's `plugins/reveal` can be picked for any moment.
- A node with a look of its own animates its subtree apart (`celebrate(…, exclude)`, `together`): the root's animation skips
  those subtrees; the shape is computed in the page's space and carried into the parent's (`parent⁻¹·shape·parent·placement`).
  A child's moment without a component is part of its parent's. A child's `found` stands in for its reveal / lost.
- [ ] Not seen on a stage with a real model: a child node's look is covered by tests of the chain, not by a drawn frame.

## 2026-11-15 – the looks' parameters in the panel; the built-in reveal as plugin code; the moments as components? (#267)

- Tilman on staging 1.69.0 (screenshot): "The parameters are not in the UI" – a moment without a look of its own showed
  only its picker. The panel now shows the rows of the look the moment *plays* (own, else found's, else the default) and the
  first change makes the moment its own, a copy of the look that played with the change (`playedLook`, `ownLook` in
  `appearance-edit.ts`). Checked by tests and svelte-check, **not seen in the editor** (it needs a signed-in session).
- "Put the reveal animation into code as a copy of the current reveal as an example": `fixtures/demo/plugins/reveal` –
  the built-in `inflateDissolve` as a plugin look `revealCode` (shape, noise mask with edge and glow, sparks; the built-in
  look's parameter names, so a sandbox JSON goes in as it is). Played next to the built-in in the sandbox: the same frames
  (the sparks sit on the vertices, the built-in's on the surface – not the same points). Left out on purpose: lights, a
  material's own layers, tint, fade, bloom. The demo book counts thirteen plugins.
- Tilman's idea, built as #268 (below): "I wanted those three to be plugin components so I can have more flexibility and
  edit them via MCP or in the code editor or through the exposed parameters" – he answered "build the per entity node
  overwrite. That's fine" to my proposal of the root node – then: "Then on any node".

## 2026-11-14 – a look per moment in the book: reveal, found, lost – built in or a plugin's (#264)

- Tilman: "i want a built in and an overwrite via plugin for the reveal, found and lost."
- **The moments' names are his**: `reveal` = the first find (the unlock's sound and label come with it), `found` = every
  later find, `lost` = the page is lost. The engine's kinds were `unlock` / `reveal` / `outro` – renamed, so "reveal"
  now means the *first* find everywhere in the animation code (my reading of his three words; the entry is still
  "unlocked", `onUnlocked` and the events keep their names).
- Content schema **2.29**: `book.appearance: { reveal?, found?, lost? }`, each `{ type, ...parameters }` like a pass
  (`shared/types/appearance.ts`). A moment without a look takes `found`'s, then `inflateDissolve`; `lost` plays its
  look rewound in the look's `outDuration`. The built-in looks (`inflateDissolve`, `printLift`, `fade` – camelCase,
  as a plugin's types must be) share one parameter set and differ in their defaults. Not inside `environment` (the
  look-around world; older guards refuse unknown fields there).
- Plugin API **1.8**: `api.registerAppearance(type, spec, factory)` – the factory returns
  `{ duration, update(visible), dispose? }`, `visible` 0 → 1 (on `lost` 1 → 0); `materials()` hands out copies. The
  content build records it (`registered.appearances`, written only when a plugin has some). A look that throws leaves
  the default look or ends.
- The built-in animation now covers the entity's **whole node tree**: it took the placement group's first child only,
  so a `group` root dissolved nothing and child nodes popped in.
- The found indicator's label takes the reveal's duration from the book's look (`momentDuration`); a plugin's look
  falls back to `ENTITY_UNLOCK_MS`.
- [x] Not built: the editor's panel for `appearance`, the API route and the MCP tool to save it, the server's list of
  plugin kinds (`Plugins.php`, `Books.php` name five) – built in #265 (above).
- [ ] A look per spread or per entity (a `found` of its own on one target) – not asked for yet.

## 2026-11-14 – the appear animation is a look of plain values; three looks in the engine (#262)

- Tilman tuned `inflate-dissolve` in the sandbox and asked "can we try this one to implement?", then: "save this
  configuration too" (`print-lift`, the sandbox's starting values), "I want to also allow for a fade in and fade out
  animation", and "can we put the json config for this in the book environment so we can dynamically add these values
  later? or how could we add a plugin hook which we got in the code view to define a fade in and fade out animation?"
- `engine/src/scene/celebration.ts`: an `Appearance` – the sandbox's names and units, so its JSON is a look as it is –
  with three parts: shape (a transform of the entity's object in the anchor's space, so a skinned model inflates too),
  the noise mask with edge, glow and sparks, the surface (tint, opacity). Three looks: `inflateDissolve` (default,
  3470 ms / 600 ms), `printLift`, `fade` – since #264 defined in the contract. `DISSOLVE` / `ANIMATIONS` are gone.
- **Every find plays the look** – the first (unlock: its sound and label stay) and every later one; the outro is it
  rewound in `outDuration`. My reading of "this one": the first find had to show it too, or a try on the phone would
  show the old unlock first. `ENTITY_UNLOCK_MS` = 3470 (the found indicator's label).
- The noise's scale is measured in the entity's own space now (it was a box of the world box: it changed with the
  camera's angle). Sparks are children of the anchor: they start on the shaped surface and fly unshaped.
- [ ] 3.47 s on every later find against #57 (reveal shortened to 0.6 s: readers lost the trigger) – judge on the phone.
- [x] Where a book sets its look: `book.appearance` and `api.registerAppearance` (#264, above).
- Locally `game-config-loading.test.ts` fails twice (it reads the first spread's first target; the book's own build
  has none there) – the fixture build CI uses passes; not from this change.

## 2026-11-14 – reveal sandbox: a dev page of its own on the engine (#261)

- Tilman: "give me a sandbox for the reveal animation. I want to fine tune it … the same conditions as our osct client
  … controls, colors, and a selection of different concepts. One idea was for the mesh to be also flat at first and
  inflate to its actual dimensions. Easiest idea is to animate the vertical axis from 0 to 1."
- It lives in `sandbox/reveal/` with its own vite config, served by the client's vite (its three.js, the engine's
  sources): not in `client/` (RULES #32 – the reader carries no tuning tool) and not in the editor (no session, no book
  needed). It uses the engine's `ArView`, asset store, `model` builder, `placeEntity` and – for "As shipped" – the real
  `celebrate` with the look the panel holds.
- The other concepts are one sandbox-side injection (`src/reveal.ts`: shape per vertex, mask per fragment, surface).
  "Flat on the page" is measured in the **anchor's** space (the page normal), not the model's own up: `fight_2.glb`
  (Kévin, Blender) is authored in the page's axes – its up is already out of the page, so the engine's default
  `rotation: [90, 0, 0]` lays it down. The sandbox picks 90° or 0° by which puts the base on the page.
- Seen there, not judged on a phone yet: the shipped **unlock** (bloom 1.0, 700 sparks) washes a pale page out to white
  when the entity fills the view – the bloom is added over the picture.
- [x] A concept Tilman picks moves into `engine/src/scene/celebration.ts`: done for `inflate-dissolve` (#262, above).

## 2026-11-14 – a plugin takes a Library model: the parameter kind `model`, `api.loadModel`, the paper (#263)

- **Tilman**: "i want a concept in which i can pick a type of folded paper for videos. ideally this is a plugin." Then,
  while it was built: "i dont think we need shade", "the thickness is also redundant. since it should be just a flat
  surface bend", "they are just slightly bend. not extra vaganza", and "can i pick files from the asset manager for each
  paper slot? they should be addable. so this is also a general purpose concept. how can a plugin access assets."
- **So the paper is a component with one row**: `paper` on a video or an image, `sheet` = a model file. No list of
  folds in the code, no depth, no shade. A new sheet is an upload to the Library.
- **The general part**: a parameter kind `model` (content schema 2.28, plugin API 1.7) next to `texture`. Its value is the
  file's address (a Library URL, a content path; `""` = none); the code loads it with `api.loadModel(address)`.
  - Why a kind of its own and not `file` with a list of accepted types: an older app already skips a parameter kind it
    does not know (#220), so a new kind needs no new rule; a new accepted type inside a known kind would.
  - Why the code gets the address and a loader, not the loaded model (as `texture` hands over a three.js texture): a
    texture object exists before its picture loaded, a model does not; a build is synchronous. `loadText` set the
    pattern: a promise, one request per URL, shared.
  - Why a component and not a node type or a material: a node type would copy the whole video node; a material never
    sees the geometry, and a plane's four vertices cannot bend in a vertex shader.
- **The fit reads the sheet's axes from its UVs** (least squares), so a file may lie on the floor, be scaled and turned
  by its node, as Kévin's are. A sheet for another proportion than the picture's stretches with the picture.
- **Kévin's first delivery** (`video_mesh_paper.zip`, 2026-11-14, seven `video_mesh_N.glb`) held seven identical flat
  planes (9 × 9 vertices, every height 0): the bend was not exported – most likely modifiers without *Apply Modifiers*.
  The demo ships a stand-in (`editor/tools/paper-sheet.mjs`, laid out like his export).
- [ ] Kévin exports the sheets again (announced for 2026-11-15); upload them to the book's Library and pick them.
- "Each paper slot" is one sheet row per video – Tilman: "forget the slots idea. works fine with just picking the right
  paper asset from the asset manager". No book-wide list of named sheets.
- **The schema number**: #260 landed first with 2.27, so this is 2.28 – the appearance work in the main checkout (see
  #260 below) is then the third and takes 2.29.
- The Library's *uses*, its delete protection and *Replace…*'s relink cover a sheet picked in a parameter: they look for
  the asset's URL anywhere in a target's or entity's `data_json` (`Assets::usages`) – read in the code, not tested.

## 2026-11-14 – a model's map by texture quality (#260)

- **Tilman**: "i want our tool to perhaps be able to import the mesh once and load the texture separately … load
  resolution depending on user quality settings", then "i need to also implement this concept of loading a 3d model
  with various texture qualities into the app, reader and editor side". Option 1 of the issue: an explicit texture set
  on the model's asset (`AssetData.textures`, schema 2.27), not a naming rule – the build checks it, the editor shows it.
- **Why the file carries the smallest map**: an older app (and this one, at once) shows the model without knowing the
  set; the swap happens on the loaded model's materials, which every copy shares (`engine/src/scene/model-textures.ts`).
- **Why `auto` stops at 2048**: an uncompressed 4096 map is about 85 MB of graphics memory; *Best* is the reader's own
  choice. `auto` reads `navigator.deviceMemory` and `connection` (Chromium only – Safari gets 2048).
- **The size is the picture's width**, never typed (the Library knows it): square, 512 / 1024 / 2048 / 4096.
- **The server needed no change**: `Editor.php` passes an asset's other keys through, uses and relinks go by the URL
  in the draft's text.
- **The schema number**: the appearance work in the main checkout (uncommitted on 2026-11-14) also calls itself 2.27 –
  whichever lands second takes 2.28 (table row in docs/content.md, the history comment, `npm run schema:lock`).
- [x] The built-in browser pane blocks the local stage frame (`ERR_BLOCKED_BY_CLIENT`); the stage was checked in Chrome. (Moot since #340: no frame.)
- [ ] The import script for the sculptures (#256): upload mesh + maps, place the node turned 90° at a scale from the
  model's size (both examples sit well at 0.15) – planned for 2026-11-15.
- [ ] Not tested on a phone: the swap while scanning, and `auto` on iOS.

## 2026-11-14 – the editor saves by itself (#259)

- **Tilman**: "autosave – it is confusing to save after adding uploads for example". The Inspector's six Save buttons
  are gone (a target's tree, its placement, the post-processing, the environment, an entry, the book's texts); RULES #37.
- **Why a save does not rebuild the stage**: every Save used to reload the draft and build the spread again. Once a
  second while scrubbing a value that restarts clips and videos, so a tree's and the passes' save only hand the draft
  to the frame (`Stage.adopt`): the stage shows the edit already.
- **Why the saves are queued by the edit, not by a `$effect` on "dirty"**: a panel that closes within the delay would
  drop its own save when it mounts again from the old draft, and a save computed when queued writes the wrong fields
  after an earlier save changed the draft. So the job carries the edited values and compares when it runs.
- **Why forms keep what was typed**: the API trims; a save landing between two words ("Anna " → "Anna") would eat the
  space under the cursor. `EntryForm` and `BookTexts` no longer take a save's answer into their fields.
- *Back to the draft* had nothing left to go back to, so it became *Undo edits* – the draft's state before the first
  edit since the page was opened (kept per subject in `baselines.ts`, lost with a reload). Not a removal (RULES #1):
  the way back stays, one step deep.
- Decided by the session, **for Tilman to confirm**:
  - [x] (Moot since #340, 2026-11-21: no stage frame, no messages.) RULES #35 said no message from the stage frame makes the page call the API. A gizmo drag is such a message, and
    it saves itself now. Narrowed instead of dropped: only a placement (numbers) of the node the page selected, and a
    placement handle's move while that target's placement is open. The alternative: gizmo drags stay live-only until
    the next edit in the page.
  - [ ] The Code tab keeps Save (Ctrl+S) and Run: half-typed code would otherwise be stored and run by the next load.
  - [ ] Step-by-step undo / redo (Ctrl+Z) is not built – its own issue if wanted.
- Checking it: the built-in browser pane blocks the sandboxed stage frame (`ERR_BLOCKED_BY_CLIENT`), so the panels can
  be tried there but the stage only in headless Edge (ORCHESTRATION "Running the editor"). The local demo's media need
  the reader's dev server on 5174.

## 2026-11-14 – the stage frame admits the book's Library folder; same bytes take the upload's name (#258)

- The frame's policy named only the Library folders the *saved* draft names (#254), so a fresh upload picked for a node
  (a live override) was blocked until Save. The API now names the book's upload folder (`libraryBase` in the book's
  summary, `Assets::folderUrl`), the snapshot carries it and `libraryFoldersOf` puts it into the policy; the folders the
  draft names stay for other books' uploads. An override that names another book's upload, or an older content build, is
  still blocked until saved – not seen in practice.
- An upload of bytes the Library holds answers with that asset (200). It now takes the upload's name: staging held
  `face_against_face.glb` with the bytes of `face_against_face_1.glb`, which read as "my upload was not taken".
- [ ] Tilman asked for the upload "to replace and to select the just uploaded file": a file field's *Upload…* and the
  picker already hand the upload to the node; the Library **tab**'s Upload only marks it. Whether the tab's Upload should
  also give the file to the selected node is his call.

## 2026-11-09 – Mark the Page as 3D: baked per frame; Library uploads on a CDN (#253, #254)

- Kévin's rig (`mark_ready_to_animate_3.blend`, not in the repository) is a sheet of paper with the face cut through it
  by booleans, so its topology changes every frame: no skinning, no morph targets. A trial baked one mesh per frame into
  a GLB and moves all but the current frame out of view with a STEP animation (three.js culls them); it plays through
  the plain `model` node and `animation` component, no engine change. Findings and the routes: #253.
- Upload URLs before 1.64.6 point at `<root>/<env>/assets/…` and are stored in `assets.url`. Only the two trial files on
  staging's demo book had one when this was fixed.
- [ ] Decide the route for Mark (baked 3D, video, live rig); phone not measured yet; Kévin's `Mark first speak.m4a` is
  referenced by the file but not packed.

## 2026-11-05 – the deploy credentials as asger set them (#6, #7)

- **Where asger put them** (set 2026-11-03, after #151): `SSH_HOST` (49.13.13.159), `SSH_USER` (`osct`) and
  `SSH_KNOWN_HOSTS` as **repository** variables, the keys as **repository** secrets `SSH_PRIVATE_KEY_PRODUCTION` /
  `SSH_PRIVATE_KEY_STAGING` – not in the environments, and not under the name `SSH_PRIVATE_KEY` that #151 and #7
  describe. The repository variables resolve in the environment jobs; the keys did not, so the Kamal staging deploys
  of 1.64.0 / 1.64.1 failed at ssh-agent ("ssh-private-key argument is empty"). 1.64.2: `deploy.yml` falls back to
  the destination's repository key. Tilman: "that's what i meant" (a workflow change instead of re-entering the keys –
  GitHub cannot rename a secret or show its value).
- **Staging stays on FTPS** (Tilman, 2026-11-05: "staging stays on the ftp on osct.porschuetz.de"):
  `deploy-staging.yml` lost its push trigger (by hand only) – with the repository-wide `SSH_HOST` every `develop` push
  would have deployed to the server. Give it back when staging moves (#10).
- **Open before the first production deploy** (#7): the `production` environment has no `DB_PASS`, `DB_ROOT_PASS`,
  `SECRET`, `SMTP_USER` / `SMTP_PASS`; the database is created by the first `kamal setup -d production` (from a
  laptop – `kamal deploy` in the workflow boots no accessory). Recommended to Tilman: his own SSH key on the server
  (public key to asger). No SES credentials anywhere yet (no `SMTP_*` in either environment or the repository);
  staging's FTPS site sends with `MAIL_TRANSPORT=mail` (the all-inkl host's `mail()`), which is why the Kamal staging
  job passed its mail check. Note: `gh api …/environments/<env>/variables` lists 10 per page – pass `?per_page=100`.
- [ ] Once staging moves to the server: `push: branches: [develop]` back into `deploy-staging.yml`, FTPS workflow out (#10).

## 2026-11-05 – targets can be switched off (#249); the final content after the printer submission (#248)

- **Imported into staging** (2026-11-05, 17:33; Tilman: "do the content import", "not a separate folder … i want to update
  the existing book", staging is not public – "we can still work pretty brutal on staging", production goes live with
  the book release): the delivery went into the content source through `npm run import` (`scripts/import/2026-11-final.yaml`,
  images and page previews from Rudy's `OSCT_FULL_preview_spreads_HIGHRES.pdf` – active targets median 1,201 px), the build
  `53099b9d32d8` was synced to the CDN's `staging` env (it is staging's `latest.json` now), and staging's draft, laid over
  it (`merge.py`), was imported into the existing book `osct` with that build as its assets base: 130 spreads, 1,376
  entries, 121 targets on, 1,247 off, 239 tagged `artwork`, the 10 deleted. Entry pictures kept (Tilman: "existing pictures
  for bw targets can be kept … the picture reference"). The content source before: `osct-incoming-content6-11-final\content-before`.
- **Page previews from the print PDF, the fold the editor's own** (#250, 1.64.4): Rudy's preview export bakes a grey fold
  into every spread, and the stage tinted the page image with its paper colour (#f3efe6) while the prints on it stayed
  white – Tilman: "it has a different white". Now `prepare-delivery --sheets <print pdf> --sheets-only` draws the flat
  pages (build `b2a34c9b8be6`, staging's draft re-imported over it as it was – its edits kept), the stage draws the page
  image untinted and a fold of its own over the spine. The tree's eye hides a target's print with its AR content (it
  only made the tracker lose it before – "it does not hide it in the scene"); the panel bar's × is gone. Replacing a
  spread's page image in the editor: #251 (Proposals, needs Tilman's choice).
- **The stage showed no target images after the re-import** (#252, 1.64.5): re-importing staging's draft (read back with
  `get_draft`) carried absolute URLs below the previous build; the stage frame's CSP admits only the current assets base.
  Fixed on staging (the URLs back to content paths, 1,368 targets + 88 entry pictures; p041-1's video stays on build
  2e0a4af94ca2 – its source entry p106-1 was deleted) and in code (the frame admits images/media of every build the draft
  names). Rule: RULES #36 (Tilman: "please save this as a rule for imports").
- [ ] **Publish the draft to staging** (Tilman, in the editor): staging's readers load the plain build until then – it
  lacks the editor-only edits (p041-1's video, the text-placeholder entry); an AI connection cannot publish.

- **The switch is the target's `enabled`** (#249, 1.64.0, schema 2.26) – Tilman: "the active inactive toggle in the
  editor. as we will incrementally activate them later on", "on off switch for targets (appearing in the book or not)".
  Named `enabled` like a pass's (#233, RULES #32: off keeps the values, never a removal). **Off = not in the reader's
  book at all**: the engine's loader drops the target *and its entry* (no image target, not listed, not counted) unless
  the app passes `keepSwitchedOffTargets` – the editor does, so the stage, the tree (an *off* mark) and the Inspector
  (*In the book* switch) work on them as before. Chosen because the switched-off entries are placeholders made by the
  import; an entry whose text should stay readable without AR keeps its target on (or loses the target). A 2.25 app
  ignores the field and shows them. Switched-off targets do not count towards the 10 per spread (RULES #3).
- **Sources of the final content** (Tilman, 2026-11-05): images from the final print PDF
  (`OSCT_INSIDE_256p_SymbolFreelifeMatt150g.pdf`, 256 pages with bleed – taken as "the final print pdf"), data from the
  three trigger PDFs in `Downloads\APP\` – ACTIVE (in the book), INACTIVE ("potentials", switched off), KevinWORKS
  (Kévin's artworks: switched off and tagged `artwork` – "it will help to find them later"). "The target data is
  extracted from the page they are on"; "proper resolution page previews, which we impose our targets to". Cover front
  and back are missing from every document and stay as the book has them; the end papers and the title sheet (no page
  numbers) are left out too. Only what got updates is replaced on staging.
- **The tooling** (#248): `scripts/layout/prepare-delivery.py` → delivery folder + mapping + layout (page previews from
  the print PDF, boxes by id) + report; the delivery import takes `enabled` and `tags`. A trigger that shows a current
  target's image (dHash on the same double page) keeps its id: all 131 current targets are found again – 121 active,
  10 (p002-1, p030-2, p034-1, p035-1, p095-2, p100-1, p106-1, p158-1, p192-1, p222-2) inactive in the final layout.
  1,237 new targets (1,008 inactive, 239 artwork on book pages; 640 artworks on covers / end papers / title skipped).
  Working files: `C:\Development\osct\osct-incoming-content\2026-11-final\` (`content-before` = the content source before,
  `content-work` = the trial run) and `analysis\2026-11-final\` (staging's draft, `merge.py`, `mcp-call.mjs`).
- **Resolution**: the print PDF holds every picture at ~300 dpi – the active triggers (23–52 mm) cut to a median 443 px
  long side, none ≥ 1000 px (PLAN Phase 14 asks ≥ 1000); the current target images (delivery 2110) are the same crops
  at a median 1,120 px. **Decided (Tilman): wait for Rudy's re-export** of the inside pages without image downsampling
  (≈ 1200 ppi gets every active trigger to 1000 px, 1000 ppi 115 of 121) – then rerun with `--print <new pdf>`.
- **Deleted with the import** (Tilman: "those we can delete"): p002-1, p030-2, p034-1, p035-1, p095-2, p100-1, p106-1,
  p158-1, p192-1, p222-2 – the current targets the final layout marks inactive. `--retire` keeps their ids taken; their
  triggers come in as new switched-off placeholders.
- **The staging import path** (proposed, waits for Tilman's yes to the comparison): the delivery into the content source
  → content build → `osct content sync --env delivery` (an env no reader loads – `staging`'s `latest.json` is what the
  staging reader reads, so a sync there would publish at once) → staging's draft laid over the new build (`merge.py`:
  the editors' texts, entities, covers and book kept; images, boxes and on/off from the delivery) → `import_book` with
  that configuration and `assetsBase` = the `delivery` build → Tilman checks the draft and publishes.
- [ ] **Kamal staging deploy blocked**: GitHub environment `staging` now has `SSH_HOST` (49.13.13.159) but
  `MAIL_TRANSPORT=smtp` without `SMTP_USER` / `SMTP_PASS` – the workflow refuses (1.64.0 deploy, 2026-11-05). The FTPS
  deploy still updates osct.porschuetz.de. Tilman's secrets.
- [ ] The book's `back` spread sits on page 256, but the print PDF has 256 printed pages – the back cover should be page
  257 (no trigger on page 256 yet, so nothing collides now).
- [ ] `extract-layout.py` and `prepare-delivery.py` both write `layout/`: the older one matches by aspect ratio (one
  trigger PDF, the preview's low-res sheets); keep it for older deliveries or retire it – Tilman decides (RULES #1, #15).

## 2026-11-01 – the import reads files.json from the assets base; the Library filters by origin (#244, #245)

- **Imported files were missing after a URL or file import** (#244, 1.63.0): only `source: "cdn"` fetched `files.json`,
  so a book imported from a URL (the editor's URL mode, the MCP's `import_book` with `url`) listed no imported files in
  the Library – staging's demo and the local demo both. Now an import without `files` reads `<assetsBase>/files.json`
  (optional – the reader's dev server has none). Verified locally: the demo re-imported from
  `https://buildingfictions.b-cdn.net/demo` lists its 78 files.
- [x] **Staging's demo re-imported after the 1.63.0 deploy** (2026-11-01, `import_book` with `url` + `assetsBase` of
  build c30733efb73f): the Library lists its 33 imported files. Tilman wanted the draft's edits kept: the plugin
  `my-sparkle-look` is re-saved from the change log (the log survives an import); the beacon move needed no re-apply,
  the new build already ships the beacon where the move put it (model z ≈ 1.0, with a sparkle child).
- **The Library's second filter *from*** (#245): all · uploaded · imported (`matchesOrigin`, `library-pick.ts`), in the
  Library and the picker – Tilman: "i thought we solved imported content to show up and be filterable in the library".
- Local dev: the SQLite in `var/db/local.sqlite` was behind the schema (no `api_tokens`, no `token_name` – every
  tokens list and import preview a 500); `php server/deploy/migrate.php` brought it level. Run it after pulling a
  schema change.

## 2026-11-01 – the Toggle is a track with a knob (#243)

- **`Toggle.svelte` is a real switch** (#243): a `<button role="switch" aria-checked>` with a track and a sliding knob,
  modelled on the reader's `<gold-switch>`; the *on* / *off* text is gone (`words` stays only as a quiet value, a
  variable's *false* / *true*). Measurements in `DESIGN.md` §9. Round on purpose – the one round control in the square
  editor, as a switch reads as one only with its round track.
- **Keyboard**: the switch flips on `keydown` of Space / Enter (once, not on a held key's repeats) and cancels the
  button's own activation (Enter's click on keydown, Space's on keyup) – checked in Chromium: one press, one flip.
- **Component tests mount Svelte now**: `editor/vite.config.ts` resolves the browser conditions under vitest
  (`process.env.VITEST`), so `mount()` from `svelte` works in happy-dom (`lib/__tests__/toggle.svelte.test.ts` – a
  `*.svelte.test.ts` may use runes). The build is unchanged.

## 2026-11-01 – cost per issue: agents/costs.json and a line in every closing comment (#242)

- **Tilman (2026-11-01):** accepted the #242 proposal with the closing-comment line and the local ledger, as
  `agents/costs.json` in every project for analysis across projects. Format and routine: `C:\Development\ORCHESTRATION.md`
  §10; background: `agents/COST-TRACKING.md`; script: `C:\Development	ools\costs	ranscript_cost.py`.
- **Backfill (list-price estimates, local sessions only):** ≈ $2,400 for osct since 2026-04. Of that ≈ $1,360 is
  orchestrator sessions on 10-28 to 11-01 (≈ $550 on 10-30 alone), more than all workers together. The cause is cache
  reads: a long orchestrator context is reread on every turn (≈ 3.2 billion cache-read tokens in one session).
- Open: the board field, a budget per project, the `SessionEnd` hook, `cleanupPeriodDays` 365 (transcripts are
  deleted after 30 days, so the backfill only reaches back that far for most sessions). `paid_from` of local sessions
  is unknown (plan or extra usage) and stays `null` until the monthly bill entries.

## 2026-11-01 – plugins in the reader run in its page; the Toggle still looks like a button

- **Tilman (2026-10-31):** *"Auf der Leser-Seite sollen die Plugins auf jeden Fall auf der Seite laufen."* The reader
  keeps running book plugins in its own page on purpose – no sandbox for the reader. The editor's stage and its plugins
  are sandboxed since 1.58.0 (#234); that question is closed. *(Superseded 2026-11-21, #340: the editor's sandbox is
  dropped too – a prompt before others' plugin code instead.)*
- **#241 shipped (1.62.0), but `Toggle.svelte` is still a pill that reads *on* / *off*** – the button look Tilman
  objected to. #243: a real switch (track and knob, `role="switch"`), modelled on the reader's `<gold-switch>`.
- **Cost (#242):** the #241 cloud worker reported it ran on **overage** (the 7-day limit was full) although cloud
  session credit was left – to check with Tilman against the usage page before trusting cloud credit for night shifts.

## Index of archived entries (2026-09 and 2026-10)

- 2026-10-31 – every on/off is a switch (#241) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – print first or digital first: the book's source of truth (#238) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – texts inside the editor: the book search in the top bar, the book in the Inspector (#237) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – the onboarding belongs to the app: out of the database, the editor and the content (#236) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – docs: one owner per topic (#218) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – shared/ tidied in one schema MINOR (2.24, #214) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – content editing: entries, the book, the onboarding; Markdown and variables (#223) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – plugin code in a sandbox: the editor's stage in an opaque-origin frame (#234) → `archive/MEMORY-2026-10.md` – superseded by #340 (2026-11-21)
- 2026-10-31 – plugin labels mark only unsaved (#232); a toggle per pass and the UI principle (#233) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – the trial report names the phone model (#235) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – a MINOR never breaks an older app (#220); rules per package (#221) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – the reader notices a new version (#231) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – the editor notices a new version (#230) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – issue pointers yes, version tags no, in code comments (#219) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – plugin passes in post-processing, content schema 2.21 (#216) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – plugin API 1.6: GPU feedback buffers, the demo's ink painting (#225) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – no Stage tab: the spread in the Inspector, the preview settings in the toolbar (#229) → `archive/MEMORY-2026-10.md`
- 2026-10-31 – the demo aquarium's water is Splash in WebGPU, the heightfield its fallback (#228) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – the tree's spread and entry rows select (#227) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – one desk on the stage: the Eiermann frame with two tops; Schöpfer's desk removed (#226) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – the browser session in an HttpOnly cookie, CSRF token on writes (#207) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – engine cleanup: one behaviour vocabulary, no reader traces, AR errors as codes (#213) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – one place for the API's types and rules; the PHP's copies pinned (#210 #217) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – editor cleanup: no paths for older APIs, controls built once, one number parser (#211 #212) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – consent is the person's own: no account change through an AI token or an admin (#203) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – server hardening: forwarded host headers, transactions in admin writes and assets (#209) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – the review's fixes: import id, served assets, CSV button, session end, CLI (#204 #205 #206 #208 #215) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – the second code review (#19, develop at 1.50.0) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – the behaviour component: rules without code (#88, schema 2.19) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The demo aquarium's water: a CPU heightfield handed to the material through its uniforms (#202) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – staging's versions.json mismatch was the edge cache, not a writer (#175) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Make it code copies a plugin's whole source; a made type switches once it builds (#199) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The phone's sheet: the uncovered row continues the stage (#200) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Code files in the Library: scripts are plugin sources, shaders are assets (#186) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The environment replaces the HDRI sky box (#185) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The vertical axis and snapping (#190) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The import's preview (#182) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Panels' first divider and defaults; the post-processing level in words (#193, #181) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Removing a spread or an entry with everything on it (#198) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Publish to the own environment, import comparison, the content store (#183, #197) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The demo video's tooling (#195) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – A spread card's menu: right click, long press, menu key (#196) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Schöpfer's desk from the catalogue (#187) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Plugins everywhere: materials, textures, make it code; the aquarium; the zero plane (#188, #189) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Connect an AI agent: the guide for any MCP client (#194) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – AI connections: personal access tokens and the MCP guide on the books page (#142) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The desks on a phone (#184) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The stage toolbar in groups (#180) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Plywood on the desks' cut edges (#107) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Tutorial re-shoot and a look at the Stage panel (#148) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Type-only imports, `verbatimModuleSyntax` on (#176) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The Stage panel taps, sets variables, keeps a timeline; the demo's key (#88) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The editor on SvelteKit 3 (#157) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Touch height, tablet portrait, words as labels (#171, #172, #173) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The plugins' recorded specs (#90) and the MCP tools for the new endpoints (#174) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The book's passes as the master; the environment through the chain (#149) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – A plugin's own node type (#77) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – A video's size and duration on upload (#91) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Typed boundaries and test gaps (#28, #29) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Spreads added and removed on the book page (#166) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The Library as the picker; entry category vs what appears (#164, #165) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Local MariaDB in Docker, staging's data, the API test on MariaDB (#168) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The editor's selection levels and the tree's hierarchy (#162, #163) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The phone sheet: icon tabs, a frozen stage while dragging, the camera on the spread's root (#155, #105) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The books page as covers, the demo's pages rendered (#153) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Monaco in the Code tab (#76) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – One book per environment, made visible and guarded (#143, refs #87) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The environment on the stage, world and sky as assets, schema 2.10 (#79) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – Editor help in an Info view, Stage panel in sections (#102, #133) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The grade's reach, content schema 2.9 (#136) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – content out of git, one rewrite with the Claude cleanup (#5, #30) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The editor is not part of the PWA (#122) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The book's environment, content schema 2.8 (#79) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – `api.registerPass` wired (#97, 1.16.1) – the pass names are open → `archive/MEMORY-2026-10.md`
- 2026-10-30 – An MCP server over the editor's API, after SCUTOONS' model (#75) → `archive/MEMORY-2026-10.md`
- 2026-10-30 – The demo book and the plugin API 1.1 (#80, decided alone – to review) → `archive/MEMORY-2026-10.md`
- 2026-10-29 (night) – Light nodes, content schema 2.6 (#71) → `archive/MEMORY-2026-10.md`
- 2026-10-29 (night) – Post-processing lives in the engine's pass registry, the code editor hooks into it (#72) → `archive/MEMORY-2026-10.md`
- 2026-10-29 (night) – Code in the editor: plugins (#66, decided alone from the concept – to review) → `archive/MEMORY-2026-10.md`
- 2026-10-29 – The stage's desk is our own Eiermann model (#68) → `archive/MEMORY-2026-10.md`
- 2026-10-29 (evening) – The boundary: engine, reader, editor (#61, Tilman decided, then "durchziehen") → `archive/MEMORY-2026-10.md`
- 2026-10-29 – Editor, first step: `/editor` over the mock stage (#61, overnight after Tilman's go) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Entity animations shorter (#57, Tilman) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Direction: scutoons-animus-ar, a white-label AR core; data sovereignty (Tilman, milestone 2) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Tap to focus for every reader (#37, Tilman via #14, 1.9.4) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Camera defaults: main lens, continuous focus, engine size; iOS below 16.4 cannot scan (#37, Tilman, 1.9.0) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – The tracker window defaults to ±1 again, not grow (#38, Tilman, 1.8.2) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – GitHub Actions: minutes, notifications, runners (#42, Tilman) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Trigger test S22: size, texture, camera readout (#14, Tilman, 1.8.0) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Code base review (#19) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – The trigger trial runs at ±0 (#14, Tilman, 1.7.8) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Content out of git, prepared: fixture, source outside, filter-repo tried (#5, Tilman, 1.7.6) → `archive/MEMORY-2026-10.md`
- 2026-10-28 – Content deployment apart from the app: versions + strict purge; content schema MAJOR.MINOR (#5, Tilman, 1.7.6) → `archive/MEMORY-2026-10.md`
- 2026-10-27 – Sessions start with their issue; deploys move issues on the board (Tilman, 1.7.1, #11) → `archive/MEMORY-2026-10.md`
- 2026-10-27 – Preload flow analysis, engine view and load test (Tilman, 1.7.0) → `archive/MEMORY-2026-10.md`
- 2026-10-27 – Trial content: delivery 2110 imported, trigger protocol (Tilman) → `archive/MEMORY-2026-10.md`
- 2026-10-27 – Sign-in mails through Amazon SES (Tilman, asgerb) → `archive/MEMORY-2026-10.md`
- 2026-10-27 – Deployment with Kamal; issues on the OSCT board (Tilman) → `archive/MEMORY-2026-10.md`
- 2026-10-02 – Content editor: not built (Tilman) → `archive/MEMORY-2026-10.md`
- 2026-09-28 – Look-around world / world tracking research (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Content build output not in git (Tilman; branch `build-content-in-ci`) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – 1.3.2: MindAR leftovers cleaned up (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – 1.4.0: optional password, one sign-in form (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – 1.3.0: 8th Wall only, MindAR removed (Tilman: "move to 8th Wall entirely") → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Demo spreads from the layout PDF for the tracker load test (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – 8th Wall spread switches: neighbours kept loaded (Tilman: "save switch times") → `archive/MEMORY-2026-09.md`
- 2026-09-28 – S22 test of the 8th Wall tracker: whole images instead of the 3:4 crop → `archive/MEMORY-2026-09.md`
- 2026-09-28 – 8th Wall tracker built side by side with MindAR (Tilman: "build a working version") → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Exploration "webworker tracking" (Tilman; branch `claude/laughing-wright-hrt8zy`) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Workspace tidy-up, version 1.2.0 (Tilman, branch `compilation`) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – `scripts/` restructured + tests (Tilman, branch `compilation`) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Tutorial steps belong to the app, not the content (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – `.mind` compilation in the content builder (Tilman, branch `compilation`; PLAN Phase 12) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Camera denied screen and settings spacing (Tilman, 1.2.3) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Releases deploy production (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Code comments rewritten (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-28 – Shorter translation calls (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-27 – Branch cleanup and dependency audit (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-27 – Accounts by email (Tilman, branch `database`; PLAN Phase 11) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – PWA (Tilman: "do the PWA now"; PLAN Phase 9b) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Unlock animation: reverse emissive dissolve (Tilman, branch `unlock-experience`) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Stuck spinner on the S22 = Chrome's camera, not the app → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Unlock vs. consult (Tilman – simple version; designers / artist decide the direction) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Tap / pin concept (open – Tilman works it out first; PLAN Phase 10) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Placement, tap to unlock, pinning research (Tilman, staging test) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Performance: three.js instead of A-Frame, static splash (Tilman, branch `performance`) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – One AR scene (Tilman, after the device tests) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Sounds and haptics (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Video filters (Tilman, tested on the phone) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – No 3D content visible on the phone (fixed, found by remote debugging the phone) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Onboarding flow and look (Tilman, mobile test) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Mobile test: camera over https, pill glow, menu line height (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Start: splash instead of the home page (Tilman, option A) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Onboarding / home buttons in the flow (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Publisher on the home page (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – No resume prompt, storage notices, links just route (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-26 – Links: app state as plain URLs (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Bookmarks and notes removed (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Import cleanup (Tilman: "continue clean up") → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Old artefacts removed, goldButton() (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Consultation pages split into components (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – components/index → components/dev-index (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Docusaurus removed, plain markdown docs (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Docs updated (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Progress reading moved to utils (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Entry categories as a shared enum (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Session paused before Phase 7 → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 6 strategy B: PersistentArScene (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 6 strategy A: ArScene + <ar-bridge> → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Design review: colors measured from the PDF → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 5 onboarding built → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 4 consultation mode built → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 3 scan mode built → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Preloader → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 2 step 3 done (debug overlay progress tab) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 2 step 2 done (progress storage) → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Phase 2 step 1 done (one version), QR links carry the content hash → `archive/MEMORY-2026-09.md`
- 2026-09-25 – Versioning + progress storage concept (Tilman) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Code placement (RULES #17) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Mode vs scene state, overlays pause the scene → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phase 2: modes vs views implemented, git over SSH → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Game configuration errors: build time vs runtime → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Unused types audit (cleanup by Tilman, see RULES #15) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phase 1e done (content model + types) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Content model + type naming (→ Phase 1e) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Content build checksum → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phases renumbered to execution order → `archive/MEMORY-2026-09.md`
- 2026-09-24 – A-Frame bridges: Phase 6, keep the static bridge until then → `archive/MEMORY-2026-09.md`
- 2026-09-24 – `utils/config.ts` renamed to `utils/content.ts` (later → `utils/game-config.ts`) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Spread switch reload loop fixed → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phase 1d done (entries) + Phase 0 constant → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phase 1c rename done (chapter → spread) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Phase 1a done (QR removed) → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Naming, cardinality, maxTrack → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Taxonomy, header, indicator → `archive/MEMORY-2026-09.md`
- 2026-09-24 – Design 260804 kickoff → `archive/MEMORY-2026-09.md`
